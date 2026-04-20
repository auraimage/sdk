# @auraimage/sdk

## 0.1.0

Initial public release.

- `AuraImage` class with `signUpload()` for minting short-lived HMAC upload tokens.
- `parseSize()` helper for human-readable size strings (`"5mb"`, `"500kb"`).
- `@auraimage/sdk/server` subpath exporting `verifyUploadToken`, `signUploadToken`, `UploadTokenPayload`, `Tier` for self-hosted verifying backends.
