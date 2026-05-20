---
'@auraimage/sdk': minor
---

`verifyUploadToken` callback may now return `string | string[]`; verifies by trying each candidate. Single-string return remains supported. Enables multi-key rotation.
