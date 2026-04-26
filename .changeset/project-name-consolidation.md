---
'@auraimage/sdk': minor
---

Consolidate project identifier on `projectName`. Breaking changes:

- `SignUploadOptions.projectId` removed. The constructor's `projectName` is used by default; pass `projectName` to `signUpload()` to override per-call.
- `UploadTokenPayload.projectId` removed; tokens now carry only `projectName`.
- `verifyUploadToken`'s key-resolver callback signature changed from `(projectId: string) => Promise<string>` to `(projectName: string) => Promise<string>`.
