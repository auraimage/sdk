import { UploadError } from './errors';
import { DEFAULT_CONCURRENCY } from './types';
import type { UploadManyOptions, UploadManyResult, UploadResult } from './types';
import { uploadOne } from './upload-one';

/**
 * Upload many files with bounded concurrency. Always resolves — never rejects —
 * so partial success is observable on the returned `results` / `errors` maps.
 *
 * `signal` aborts the whole batch: pending starts never run, and in-flight
 * `uploadOne` calls receive the same signal.
 */
export async function uploadMany(files: File[], opts: UploadManyOptions): Promise<UploadManyResult> {
  const concurrency = Math.max(1, opts.concurrency ?? DEFAULT_CONCURRENCY);
  const results = new Map<File, UploadResult>();
  const errors = new Map<File, UploadError>();
  if (files.length === 0) return { results, errors };

  let cursor = 0;
  const workers: Promise<void>[] = [];
  const launch = Math.min(concurrency, files.length);
  for (let i = 0; i < launch; i++) {
    workers.push(worker());
  }
  await Promise.all(workers);
  return { results, errors };

  async function worker(): Promise<void> {
    while (true) {
      if (opts.signal?.aborted) return;
      const idx = cursor++;
      if (idx >= files.length) return;
      const file = files[idx]!;
      try {
        const result = await uploadOne(file, {
          url: opts.url,
          token: opts.token,
          signal: opts.signal,
          maxAttempts: opts.maxAttempts,
          baseDelayMs: opts.baseDelayMs,
          onProgress: opts.onItemProgress ? (loaded, total) => opts.onItemProgress!(file, loaded, total) : undefined
        });
        results.set(file, result);
        if (opts.onItemSettled) opts.onItemSettled(file, result);
      } catch (err) {
        const uploadErr =
          err instanceof UploadError ? err : new UploadError('network', 'Unknown upload failure', { cause: err });
        errors.set(file, uploadErr);
        if (opts.onItemSettled) opts.onItemSettled(file, uploadErr);
      }
    }
  }
}
