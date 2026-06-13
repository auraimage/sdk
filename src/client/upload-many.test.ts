import { UploadError } from './errors';
import { uploadMany } from './upload-many';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

interface XHRPlan {
  status?: number;
  body?: string;
  headers?: Record<string, string>;
  delayMs?: number;
}

const plansByFile = new Map<string, XHRPlan[]>();
const concurrentlyInFlight = { current: 0, peak: 0 };

class MockXHR {
  upload = { addEventListener: vi.fn() };
  status = 0;
  responseText = '';
  private listeners: Record<string, Array<(e: Event) => void>> = {};
  private headers: Record<string, string> = {};
  private filename = '';
  private aborted = false;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private started = false;

  addEventListener(type: string, fn: (e: Event) => void) {
    (this.listeners[type] ??= []).push(fn);
  }
  removeEventListener(type: string, fn: (e: Event) => void) {
    this.listeners[type] = (this.listeners[type] ?? []).filter((f) => f !== fn);
  }
  open(_method: string, _url: string) {
    /* noop */
  }
  setRequestHeader(name: string, value: string) {
    this.headers[name] = value;
  }
  send(body: unknown) {
    const fd = body as FormData;
    const file = fd.get('file') as File;
    this.filename = file.name;
    concurrentlyInFlight.current++;
    if (concurrentlyInFlight.current > concurrentlyInFlight.peak) {
      concurrentlyInFlight.peak = concurrentlyInFlight.current;
    }
    this.started = true;
    const queue = plansByFile.get(this.filename) ?? [];
    const plan = queue.shift() ?? { status: 500, body: '{}' };
    this.timer = setTimeout(() => {
      if (this.aborted) return;
      concurrentlyInFlight.current--;
      this.status = plan.status ?? 200;
      this.responseText = plan.body ?? '';
      this.headers = { ...this.headers, ...(plan.headers ?? {}) };
      this.fire('load');
    }, plan.delayMs ?? 10);
  }
  abort() {
    this.aborted = true;
    if (this.started) concurrentlyInFlight.current--;
    if (this.timer) clearTimeout(this.timer);
  }
  getResponseHeader(name: string): string | null {
    return this.headers[name] ?? null;
  }
  private fire(type: string) {
    for (const fn of this.listeners[type] ?? []) fn({} as Event);
  }
}

beforeEach(() => {
  plansByFile.clear();
  concurrentlyInFlight.current = 0;
  concurrentlyInFlight.peak = 0;
  vi.stubGlobal('XMLHttpRequest', MockXHR);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

function makeFile(name: string): File {
  return new File([new Uint8Array([1])], name, { type: 'image/jpeg' });
}
function ok(name: string): XHRPlan {
  return {
    status: 201,
    body: JSON.stringify({
      url: `https://cdn.example/demo/${name}`,
      key: name,
      width: 1,
      height: 1,
      blurhash: 'L0',
      format: 'jpeg',
      masterFormat: 'jpeg',
      size: 1,
      visibility: 'public'
    })
  };
}

describe('uploadMany', () => {
  it('returns empty maps on empty input', async () => {
    const r = await uploadMany([], { url: '/u', token: 't' });
    expect(r.results.size).toBe(0);
    expect(r.errors.size).toBe(0);
  });

  it('respects the concurrency bound', async () => {
    const files = Array.from({ length: 10 }, (_, i) => makeFile(`f${i}.jpg`));
    for (const f of files) plansByFile.set(f.name, [ok(f.name)]);
    const r = await uploadMany(files, { url: '/u', token: 't', concurrency: 3 });
    expect(r.results.size).toBe(10);
    expect(r.errors.size).toBe(0);
    expect(concurrentlyInFlight.peak).toBeLessThanOrEqual(3);
    expect(concurrentlyInFlight.peak).toBeGreaterThan(0);
  });

  it('records partial success: one rejected, one succeeded', async () => {
    const a = makeFile('a.jpg');
    const b = makeFile('b.jpg');
    plansByFile.set(a.name, [{ status: 415, body: '{"message":"bad"}' }]);
    plansByFile.set(b.name, [ok(b.name)]);
    const r = await uploadMany([a, b], { url: '/u', token: 't' });
    expect(r.errors.get(a)).toBeInstanceOf(UploadError);
    expect(r.errors.get(a)!.kind).toBe('invalid');
    expect(r.results.get(b)!.key).toBe('b.jpg');
  });

  it('aborts pending starts when signal fires', async () => {
    const files = Array.from({ length: 6 }, (_, i) => makeFile(`g${i}.jpg`));
    for (const f of files) plansByFile.set(f.name, [{ ...ok(f.name), delayMs: 30 }]);
    const ctrl = new AbortController();
    const p = uploadMany(files, { url: '/u', token: 't', concurrency: 2, signal: ctrl.signal });
    setTimeout(() => ctrl.abort(), 5);
    const r = await p;
    // At least the in-flight pair should be aborted; pending starts never run.
    expect(r.results.size + r.errors.size).toBeLessThanOrEqual(files.length);
    expect(r.results.size).toBe(0);
  });

  it('calls onItemSettled for each file exactly once', async () => {
    const files = [makeFile('x.jpg'), makeFile('y.jpg')];
    for (const f of files) plansByFile.set(f.name, [ok(f.name)]);
    const settled: string[] = [];
    await uploadMany(files, {
      url: '/u',
      token: 't',
      onItemSettled: (file) => settled.push(file.name)
    });
    expect(settled.sort()).toEqual(['x.jpg', 'y.jpg']);
  });

  it('final sweep rescues a file that exhausted its attempts in the main drain', async () => {
    const a = makeFile('a.jpg');
    const b = makeFile('b.jpg');
    // a: exhausts its single attempt with a queue-full 503, then succeeds in the sweep.
    plansByFile.set(a.name, [{ status: 503, body: '{"message":"Origin busy, retry"}' }, ok(a.name)]);
    plansByFile.set(b.name, [ok(b.name)]);
    const settled: string[] = [];
    const r = await uploadMany([a, b], {
      url: '/u',
      token: 't',
      maxAttempts: 1,
      baseDelayMs: 1,
      onItemSettled: (file) => settled.push(file.name)
    });
    expect(r.errors.size).toBe(0);
    expect(r.results.get(a)!.key).toBe('a.jpg');
    expect(r.results.get(b)!.key).toBe('b.jpg');
    expect(settled.sort()).toEqual(['a.jpg', 'b.jpg']);
  });

  it('final sweep does not retry non-retryable failures', async () => {
    const a = makeFile('a.jpg');
    plansByFile.set(a.name, [{ status: 415, body: '{"message":"bad"}' }]);
    const r = await uploadMany([a], { url: '/u', token: 't', maxAttempts: 1, baseDelayMs: 1 });
    // A sweep retry would consume the fallback 500 plan and report kind 'rejected'.
    expect(r.errors.get(a)!.kind).toBe('invalid');
  });

  it('still reports an error when the sweep also fails', async () => {
    const a = makeFile('a.jpg');
    plansByFile.set(a.name, [
      { status: 503, body: '{"message":"busy"}' },
      { status: 503, body: '{"message":"busy"}' }
    ]);
    const settled: string[] = [];
    const r = await uploadMany([a], {
      url: '/u',
      token: 't',
      maxAttempts: 1,
      baseDelayMs: 1,
      onItemSettled: (file) => settled.push(file.name)
    });
    expect(r.errors.get(a)).toBeInstanceOf(UploadError);
    expect(r.errors.get(a)!.kind).toBe('rejected');
    expect(settled).toEqual(['a.jpg']);
  });
});
