# @auraimage/sdk

## 0.6.0

### Minor Changes

- 337b8b7: `verifyUploadToken` callback may now return `string | string[]`; verifies by trying each candidate. Single-string return remains supported. Enables multi-key rotation.

## 0.5.0

### Minor Changes

- 2d5430b: Consolidate project identifier on `projectName`. Breaking changes:
  - `SignUploadOptions.projectId` removed. The constructor's `projectName` is used by default; pass `projectName` to `signUpload()` to override per-call.
  - `UploadTokenPayload.projectId` removed; tokens now carry only `projectName`.
  - `verifyUploadToken`'s key-resolver callback signature changed from `(projectId: string) => Promise<string>` to `(projectName: string) => Promise<string>`.

- b1f58f0: Raise `signUpload()` default `maxSize` from `5mb` to `30mb`. Existing explicit callers are unaffected.

## 0.1.0

Initial public release.

- `AuraImage` class with `signUpload()` for minting short-lived HMAC upload tokens.
- `parseSize()` helper for human-readable size strings (`"5mb"`, `"500kb"`).
- `@auraimage/sdk/server` subpath exporting `verifyUploadToken`, `signUploadToken`, `UploadTokenPayload`, `Tier` for self-hosted verifying backends.
