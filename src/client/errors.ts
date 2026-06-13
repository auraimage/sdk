import type { UploadErrorKind } from './types';

/**
 * Error thrown by `uploadOne`. The discriminated `kind` field lets callers
 * distinguish retry-exhausted failures from cancellation, draining, and
 * non-retryable 4xx responses without parsing the message.
 */
export class UploadError extends Error {
  readonly kind: UploadErrorKind;
  /** HTTP status code, when one was received. */
  readonly status?: number;
  /** Server-supplied `message` field, when JSON parseable. */
  readonly serverMessage?: string;
  /** Parsed `Retry-After` header in milliseconds. 0 when absent. */
  readonly retryAfterMs: number;

  constructor(
    kind: UploadErrorKind,
    message: string,
    details: { status?: number; serverMessage?: string; retryAfterMs?: number; cause?: unknown } = {}
  ) {
    super(message, { cause: details.cause });
    this.name = 'UploadError';
    this.kind = kind;
    this.status = details.status;
    this.serverMessage = details.serverMessage;
    this.retryAfterMs = details.retryAfterMs ?? 0;
  }
}
