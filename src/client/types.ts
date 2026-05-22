/**
 * Public types for `@auraimage/sdk/client`. Browser-only; the corresponding
 * runtime code uses `XMLHttpRequest` and is unusable in Node.
 *
 * Breaking changes to any field here are semver-major events.
 */
import type { UploadError } from './errors';

/** Default values for the retry policy from ADR 0004. */
export const DEFAULT_MAX_ATTEMPTS = 4;
export const DEFAULT_BASE_DELAY_MS = 500;
export const DEFAULT_CONCURRENCY = 3;

/** Returned by `uploadOne` on success. Shape mirrors the cdn-origin upload route's 201 body. */
export interface UploadResult {
  url: string;
  /** Stored filename — pass to `getSignedUrl()` / `setVisibility()`. */
  key: string;
  width: number;
  height: number;
  blurhash: string;
  format: string;
  masterFormat: string;
  size: number;
  visibility: 'public' | 'private';
}

export interface UploadOneOptions {
  /** Full CDN upload URL (e.g. `https://cdn.example.com/v1/upload`). */
  url: string;
  /** HMAC upload token, minted server-side via `signUploadToken()`. */
  token: string;
  /** Cancels both the in-flight request and any pending retry-delay timer. */
  signal?: AbortSignal;
  /** Per-file progress callback. `total` may be 0 if the browser does not know the length. */
  onProgress?: (loaded: number, total: number) => void;
  /** Max attempts total (1 initial + N-1 retries). Default 4. */
  maxAttempts?: number;
  /** Base jitter delay in ms. Default 500. */
  baseDelayMs?: number;
}

export interface UploadManyOptions extends Omit<UploadOneOptions, 'onProgress'> {
  /** Maximum number of in-flight `uploadOne` calls. Default 3. */
  concurrency?: number;
  onItemProgress?: (file: File, loaded: number, total: number) => void;
  onItemSettled?: (file: File, result: UploadResult | UploadError) => void;
}

export interface UploadManyResult {
  results: Map<File, UploadResult>;
  errors: Map<File, UploadError>;
}

/** Discriminated error kinds surfaced by `uploadOne` / `uploadMany`. */
export type UploadErrorKind =
  /** The request was cancelled via `AbortSignal`. */
  | 'aborted'
  /** Network failure (DNS, TCP, TLS, browser-level abort that isn't ours). */
  | 'network'
  /** Server returned 5xx (other than draining) or 429, and retries are exhausted. */
  | 'rejected'
  /** Server is draining (`X-Aura-Origin-State: draining`). Caller should not retry against this socket. */
  | 'server-draining'
  /** Non-retryable 4xx (other than 429) — e.g. 415 unsupported format. */
  | 'invalid';
