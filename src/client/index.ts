/**
 * Browser entrypoint for `@auraimage/sdk`. Use this from client-side code:
 *
 *     import { uploadMany } from '@auraimage/sdk/client';
 *
 * Implements the ADR 0004 retry policy (additive-jitter backoff, draining-aware
 * dispatch) and a bounded-concurrency batch runner.
 *
 * Runtime requirements: `XMLHttpRequest`, `FormData`, `File`, `AbortController`.
 * Not usable from Node — importing this subpath in a Node runtime will throw
 * on first call.
 */
export { UploadError } from './errors';
export { uploadOne } from './upload-one';
export { uploadMany } from './upload-many';
export type { UploadOneOptions, UploadManyOptions, UploadManyResult, UploadResult, UploadErrorKind } from './types';
