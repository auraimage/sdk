import { UploadError } from './errors';
import { uploadOne } from './upload-one';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface XHRPlan {
  /** Synchronously fail with a network error after open()/send(). */
  networkError?: boolean;
  status?: number;
  body?: string;
  headers?: Record<string, string>;
  /** Delay before firing the response, in fake-timer ms. */
  delayMs?: number;
}

interface RecordedXHR {
  method: string;
  url: string;
  headers: Record<string, string>;
  formData: FormData;
  aborted: boolean;
}

const plans: XHRPlan[] = [];
const records: RecordedXHR[] = [];

class MockXHR {
  static UNSENT = 0;
  upload = { addEventListener: vi.fn() };
  status = 0;
  responseText = '';
  readyState = 0;
  private listeners: Record<string, Array<(e: Event) => void>> = {};
  private headers: Record<string, string> = {};
  private url = '';
  private method = '';
  private record!: RecordedXHR;
  private aborted = false;
  private timer: ReturnType<typeof setTimeout> | null = null;

  addEventListener(type: string, fn: (e: Event) => void) {
    (this.listeners[type] ??= []).push(fn);
  }
  removeEventListener(type: string, fn: (e: Event) => void) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn);
  }
  open(method: string, url: string) {
    this.method = method;
    this.url = url;
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: unknown) {
    this.record = {
      method: this.method,
      url: this.url,
      headers: this.headers,
      formData: body as FormData,
      aborted: false
    };
    records.push(this.record);
    const plan = plans.shift() ?? { status: 500, body: '{}' };
    this.timer = setTimeout(() => {
      if (this.aborted) return;
      if (plan.networkError) {
        this.fire('error');
        return;
      }
      this.status = plan.status ?? 200;
      this.responseText = plan.body ?? '';
      this.headers = { ...this.headers, ...(plan.headers ?? {}) };
      this.fire('load');
    }, plan.delayMs ?? 0);
  }
  abort() {
    this.aborted = true;
    if (this.timer) clearTimeout(this.timer);
    if (this.record) this.record.aborted = true;
  }
  getResponseHeader(name: string): string | null {
    return this.headers[name] ?? null;
  }
  private fire(type: string) {
    for (const fn of this.listeners[type] ?? []) fn({} as Event);
  }
}

beforeEach(() => {
  plans.length = 0;
  records.length = 0;
  vi.stubGlobal('XMLHttpRequest', MockXHR);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

function makeFile(): File {
  return new File([new Uint8Array([1, 2, 3])], 'photo.jpg', { type: 'image/jpeg' });
}

const ok201 = {
  status: 201,
  body: JSON.stringify({
    url: 'https://cdn.example/demo/photo.jpg',
    name: 'photo',
    width: 100,
    height: 100,
    blurhash: 'L00000',
    format: 'jpeg',
    masterFormat: 'jpeg',
    size: 3,
    visibility: 'public'
  })
};

describe('uploadOne', () => {
  it('returns the parsed body on 201', async () => {
    plans.push(ok201);
    const result = await uploadOne(makeFile(), { url: '/upload', token: 'tok' });
    expect(result.width).toBe(100);
    expect(records).toHaveLength(1);
    expect(records[0]!.headers['X-Aura-Signature']).toBe('tok');
  });

  it('retries on 503 and eventually succeeds', async () => {
    vi.useFakeTimers();
    plans.push({ status: 503, body: '{"message":"busy"}' });
    plans.push(ok201);
    const p = uploadOne(makeFile(), { url: '/upload', token: 'tok', baseDelayMs: 10 });
    await vi.runAllTimersAsync();
    const result = await p;
    expect(result.name).toBe('photo');
    expect(records).toHaveLength(2);
  });

  it('does NOT retry on X-Aura-Origin-State: draining', async () => {
    plans.push({
      status: 503,
      body: '{"reason":"draining"}',
      headers: { 'X-Aura-Origin-State': 'draining' }
    });
    await expect(uploadOne(makeFile(), { url: '/u', token: 't' })).rejects.toMatchObject({
      kind: 'server-draining'
    });
    expect(records).toHaveLength(1);
  });

  it('does NOT retry on 4xx (invalid)', async () => {
    plans.push({ status: 415, body: '{"message":"JXL not supported"}' });
    const err = await uploadOne(makeFile(), { url: '/u', token: 't' }).catch((e: UploadError) => e);
    expect(err).toBeInstanceOf(UploadError);
    expect((err as UploadError).kind).toBe('invalid');
    expect((err as UploadError).serverMessage).toBe('JXL not supported');
    expect(records).toHaveLength(1);
  });

  it('retries on 429 too', async () => {
    vi.useFakeTimers();
    plans.push({ status: 429, body: '{}' });
    plans.push(ok201);
    const p = uploadOne(makeFile(), { url: '/u', token: 't', baseDelayMs: 5 });
    await vi.runAllTimersAsync();
    await p;
    expect(records).toHaveLength(2);
  });

  it('gives up after maxAttempts', async () => {
    vi.useFakeTimers();
    for (let i = 0; i < 4; i++) plans.push({ status: 503, body: '{}' });
    const p = uploadOne(makeFile(), { url: '/u', token: 't', baseDelayMs: 1 });
    const assertion = expect(p).rejects.toMatchObject({ kind: 'rejected', status: 503 });
    await vi.runAllTimersAsync();
    await assertion;
    expect(records).toHaveLength(4);
  });

  it('honors AbortSignal during the request', async () => {
    const ctrl = new AbortController();
    plans.push({ status: 201, body: ok201.body, delayMs: 50 });
    const p = uploadOne(makeFile(), { url: '/u', token: 't', signal: ctrl.signal });
    queueMicrotask(() => ctrl.abort());
    await expect(p).rejects.toMatchObject({ kind: 'aborted' });
    expect(records[0]!.aborted).toBe(true);
  });

  it('rejects immediately if signal is already aborted', async () => {
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(uploadOne(makeFile(), { url: '/u', token: 't', signal: ctrl.signal })).rejects.toMatchObject({
      kind: 'aborted'
    });
    expect(records).toHaveLength(0);
  });

  it('treats network errors as retryable', async () => {
    vi.useFakeTimers();
    plans.push({ networkError: true });
    plans.push(ok201);
    const p = uploadOne(makeFile(), { url: '/u', token: 't', baseDelayMs: 1 });
    await vi.runAllTimersAsync();
    await p;
    expect(records).toHaveLength(2);
  });
});
