import { UploadError } from './errors';
import { DEFAULT_CONCURRENCY } from './types';
import type { UploadManyOptions, UploadManyResult, UploadResult } from './types';
import { uploadOne } from './upload-one';

/** Concurrency for the final sweep — deliberately low: it runs after the contention window. */
const SWEEP_CONCURRENCY = 2;

/** Transient failure kinds eligible for the final sweep (ADR 0013). */
const SWEEPABLE_KINDS = new Set<UploadError['kind']>(['rejected', 'network', 'server-draining']);

/**
 * Upload many files with bounded concurrency. Always resolves — never rejects —
 * so partial success is observable on the returned `results` / `errors` maps.
 *
 * Files whose per-file retries are exhausted by a transient failure (429/5xx,
 * network, draining) get one more pass at reduced concurrency after the main
 * drain — by then the contention that failed them has usually passed.
 * `onItemSettled` still fires exactly once per file, after its final outcome.
 *
 * `signal` aborts the whole batch: pending starts never run, and in-flight
 * `uploadOne` calls receive the same signal.
 */
export async function uploadMany(files: File[], opts: UploadManyOptions): Promise<UploadManyResult> {
  const concurrency = Math.max(1, opts.concurrency ?? DEFAULT_CONCURRENCY);
  const results = new Map<File, UploadResult>();
  const errors = new Map<File, UploadError>();
  if (files.length === 0) return { results, errors };

  function settleError(file: File, error: UploadError): void {
    errors.set(file, error);
    if (opts.onItemSettled) opts.onItemSettled(file, error);
  }

  async function drain(list: File[], limit: number, onError: (file: File, error: UploadError) => void): Promise<void> {
    let cursor = 0;
    const workers: Promise<void>[] = [];
    const launch = Math.min(limit, list.length);
    for (let i = 0; i < launch; i++) {
      workers.push(worker());
    }
    await Promise.all(workers);

    async function worker(): Promise<void> {
      while (true) {
        if (opts.signal?.aborted) return;
        const idx = cursor++;
        if (idx >= list.length) return;
        const file = list[idx]!;
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
          onError(file, uploadErr);
        }
      }
    }
  }

  // Main drain: transient failures are held back for the sweep instead of settling.
  const sweep: Array<{ file: File; error: UploadError }> = [];
  await drain(files, concurrency, (file, error) => {
    if (SWEEPABLE_KINDS.has(error.kind)) sweep.push({ file, error });
    else settleError(file, error);
  });

  if (sweep.length > 0) {
    if (!opts.signal?.aborted) {
      await drain(
        sweep.map((s) => s.file),
        Math.min(SWEEP_CONCURRENCY, concurrency),
        settleError
      );
    }
    // Files the sweep never reached (aborted mid-sweep) settle with their original error.
    for (const { file, error } of sweep) {
      if (!results.has(file) && !errors.has(file)) settleError(file, error);
    }
  }

  return { results, errors };
}
