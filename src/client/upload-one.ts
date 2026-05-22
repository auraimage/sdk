import { UploadError } from './errors';
import { DEFAULT_BASE_DELAY_MS, DEFAULT_MAX_ATTEMPTS } from './types';
import type { UploadOneOptions, UploadResult } from './types';

/**
 * Upload a single `File` to the Auraimage CDN with the ADR 0004 retry policy.
 *
 * - Retries on network errors, 503 (overload), and 429. Up to `maxAttempts` total.
 * - Does NOT retry on 4xx other than 429, or on `X-Aura-Origin-State: draining`.
 * - `AbortSignal` cancels both the in-flight request and any pending retry timer.
 *
 * Browser-only: uses `XMLHttpRequest` for upload progress events.
 */
export async function uploadOne(file: File, opts: UploadOneOptions): Promise<UploadResult> {
  const maxAttempts = opts.maxAttempts ?? DEFAULT_MAX_ATTEMPTS;
  const baseDelayMs = opts.baseDelayMs ?? DEFAULT_BASE_DELAY_MS;

  if (opts.signal?.aborted) {
    throw new UploadError('aborted', 'Upload aborted before start');
  }

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await sendOnce(file, opts);
    } catch (err) {
      if (!(err instanceof UploadError)) throw err;
      // Non-retryable kinds: surface immediately.
      if (err.kind === 'aborted' || err.kind === 'invalid' || err.kind === 'server-draining') {
        throw err;
      }
      // Out of attempts.
      if (attempt + 1 >= maxAttempts) throw err;
      // Additive-jitter backoff (ADR 0004).
      const jitter = Math.random() * baseDelayMs * Math.pow(2, attempt);
      await sleep(err.retryAfterMs + jitter, opts.signal);
    }
  }
  // Unreachable: the loop either returns or throws.
  throw new UploadError('network', 'Upload failed');
}

function sendOnce(file: File, opts: UploadOneOptions): Promise<UploadResult> {
  return new Promise<UploadResult>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const fd = new FormData();
    fd.append('file', file, file.name);

    let settled = false;
    const settle = (fn: () => void) => {
      if (settled) return;
      settled = true;
      if (opts.signal) opts.signal.removeEventListener('abort', onAbort);
      fn();
    };
    const onAbort = () => {
      try {
        xhr.abort();
      } catch {
        /* ignore */
      }
      settle(() => reject(new UploadError('aborted', 'Upload aborted')));
    };
    if (opts.signal) {
      if (opts.signal.aborted) {
        reject(new UploadError('aborted', 'Upload aborted before start'));
        return;
      }
      opts.signal.addEventListener('abort', onAbort, { once: true });
    }

    xhr.upload.addEventListener('progress', (e) => {
      if (opts.onProgress) opts.onProgress(e.loaded, e.lengthComputable ? e.total : 0);
    });
    xhr.addEventListener('error', () => {
      settle(() => reject(new UploadError('network', 'Network error')));
    });
    xhr.addEventListener('timeout', () => {
      settle(() => reject(new UploadError('network', 'Request timed out')));
    });
    xhr.addEventListener('load', () => {
      const status = xhr.status;
      const body = xhr.responseText;
      const draining = (xhr.getResponseHeader('X-Aura-Origin-State') ?? '') === 'draining';
      const retryAfterMs = parseRetryAfter(xhr.getResponseHeader('Retry-After'));
      settle(() => {
        if (status >= 200 && status < 300) {
          try {
            resolve(JSON.parse(body) as UploadResult);
          } catch (err) {
            reject(new UploadError('network', 'Failed to parse server response', { cause: err }));
          }
          return;
        }
        const serverMessage = extractServerMessage(body);
        if (draining) {
          reject(
            new UploadError('server-draining', 'Origin draining; open a fresh connection', {
              status,
              serverMessage,
              retryAfterMs
            })
          );
          return;
        }
        if (status === 503 || status === 429 || status >= 500) {
          reject(
            new UploadError('rejected', `Server ${status}; retryable`, {
              status,
              serverMessage,
              retryAfterMs
            })
          );
          return;
        }
        // 4xx other than 429: non-retryable.
        reject(new UploadError('invalid', serverMessage ?? `Server ${status}`, { status, serverMessage }));
      });
    });

    xhr.open('POST', opts.url, true);
    xhr.setRequestHeader('X-Aura-Signature', opts.token);
    xhr.send(fd);
  });
}

function extractServerMessage(body: string): string | undefined {
  try {
    const parsed = JSON.parse(body) as { message?: unknown };
    if (parsed && typeof parsed === 'object' && typeof parsed.message === 'string') {
      return parsed.message;
    }
  } catch {
    /* not JSON */
  }
  return undefined;
}

function parseRetryAfter(header: string | null): number {
  if (!header) return 0;
  const asNum = Number(header);
  if (Number.isFinite(asNum) && asNum >= 0) return asNum * 1000;
  return 0;
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise<void>((resolve, reject) => {
    if (signal?.aborted) {
      reject(new UploadError('aborted', 'Upload aborted during backoff'));
      return;
    }
    const timer = setTimeout(() => {
      if (signal) signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(new UploadError('aborted', 'Upload aborted during backoff'));
    };
    if (signal) signal.addEventListener('abort', onAbort, { once: true });
  });
}
