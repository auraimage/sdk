# @auraimage/sdk

Official JavaScript SDK for [AuraImage](https://auraimage.ai). Signs upload tokens, mints signed URLs for private images, and toggles image visibility — all from your server.

## Security: server-side only

> **NEVER instantiate `AuraImage` in browser code or expose your secret key to client-side JavaScript.** This SDK uses your AuraImage secret key (`sk_live_…`) to sign tokens. It must run only in server-side environments: Cloudflare Workers, Node.js, Bun, Deno, edge runtimes, or your backend API routes. Use `AuraImage` on the server to mint a short-lived signature, then send that signature (not the secret) to the browser.

## Install

```bash
pnpm add @auraimage/sdk
# or: npm install @auraimage/sdk  /  yarn add @auraimage/sdk
```

## Quickstart

```ts
// Server-side handler (Next.js Route Handler, Workers, Hono, Express, etc.)
import { AuraImage } from '@auraimage/sdk';

const aura = new AuraImage({
  secretKey: process.env.AURA_SECRET_KEY!,
  projectName: process.env.NEXT_PUBLIC_AURA_PROJECT_NAME!
});

export async function POST() {
  const signature = await aura.signUpload({
    maxSize: '10mb',
    allowedTypes: ['image/*'],
    expiresIn: 3600
  });

  return Response.json({ signature });
}
```

The browser receives `{ signature }` and uploads directly to the AuraImage CDN:

```ts
const form = new FormData();
form.append('file', file);

const res = await fetch('https://cdn.auraimage.ai/v1/upload', {
  method: 'POST',
  headers: { 'X-Aura-Signature': signature },
  body: form
});
const { url, key, blurhash, width, height } = await res.json();
```

## Constructor

```ts
new AuraImage({
  secretKey: string;        // sk_live_… — required
  projectName: string;      // default project for all operations — required
  serveSecret?: string;     // psk_live_… — required for getSignedUrl
  cdnUrl?: string;          // e.g. "https://cdn.auraimage.ai" — required for getSignedUrl and setVisibility
});
```

## API

### `signUpload(options?)`

Mints a short-lived HMAC signature the browser uses to upload a single file.

```ts
await aura.signUpload({
  maxSize: '5mb',                     // default '5mb'
  allowedTypes: ['image/*'],          // default ['image/*']
  expiresIn: 3600,                    // seconds, default 3600
  visibility: 'private',              // optional 'public' | 'private'
  projectName: 'override'             // override the default project for this call
});
```

Returns the signature string. Pass it back to the client and have them set `X-Aura-Signature: <signature>` when POSTing to `https://cdn.auraimage.ai/v1/upload`.

### `getSignedUrl(filename, options?)`

Builds a signed URL for a private image. Requires `serveSecret` and `cdnUrl` on the constructor.

```ts
const url = await aura.getSignedUrl('photo.jpg', {
  expiresIn: 3600   // default 3600s; min 60s, max 7 days
});
// → https://cdn.auraimage.ai/my-project/photo.jpg?token=<base64url-payload>.<base64url-sig>
```

### `setVisibility(filename, visibility)`

Flips an existing image between `'public'` and `'private'`. Idempotent. Requires `cdnUrl` on the constructor.

```ts
await aura.setVisibility('photo.jpg', 'private');
```

## Runtime requirements

ESM-only, Node.js 20+. Uses `crypto.subtle`, `TextEncoder`, `btoa` / `atob` — all standard in modern Node, Bun, Deno, and Cloudflare Workers.

## `@auraimage/sdk/server`

The `/server` subpath exposes lower-level primitives used when self-hosting a verifying backend (for example, a Workers-based CDN of your own). Most adopters do not need this.

```ts
import { verifyUploadToken, type UploadTokenPayload } from '@auraimage/sdk/server';
```

## Token format

See the full normative spec at [auraimage.ai/docs/signature-spec](https://auraimage.ai/docs/signature-spec) — useful if you need to sign tokens from a non-JS server (Python, Ruby, Go).

## License

MIT © AuraImage
