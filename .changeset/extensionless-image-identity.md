---
"@auraimage/sdk": minor
---

BREAKING: `UploadResult.key` is renamed to `UploadResult.name` — the stored, extension-less image name (ADR 0022). `getSignedUrl()` and `setVisibility()` now take that name; signed URLs are extension-less and the token binds the name, so one token authorizes every transform segment and serve extension of the image.
