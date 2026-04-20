# @auraimage/sdk

Official JavaScript SDK for [Auraimage](https://auraimage.ai) — server-side HMAC upload token signing.

## Security: server-side only

> **NEVER instantiate `AuraImage` in browser code or expose your secret key to client-side JavaScript.** This SDK signs upload tokens using your Auraimage secret key. It must run only in server-side environments: Cloudflare Workers, Node.js, Bun, Deno, edge runtimes, or your backend API routes. Use `AuraImage` on the server to mint a short-lived signature, then send that signature (not the secret) to the browser.

## Install

```bash
pnpm add @auraimage/sdk
# or: npm install @auraimage/sdk  /  yarn add @auraimage/sdk
```

## Usage

```ts
// Server-side handler (Next.js Route Handler, Workers, Hono, Express, etc.)
import { AuraImage } from '@auraimage/sdk';

const aura = new AuraImage({ secretKey: process.env.AURA_SECRET_KEY! });

export async function POST() {
  const signature = await aura.signUpload({
    slug: 'my-project',
    userId: 'user_123',
    projectId: 'proj_456',
    tier: 'hacker',
    maxSize: '10mb',
    allowedTypes: ['image/*'],
    expires: Date.now() + 60 * 60 * 1000
  });

  return Response.json({ signature });
}
```

The browser receives `{ signature }` and uploads directly to the Auraimage CDN:

```ts
const form = new FormData();
form.append('file', file);

const res = await fetch('https://cdn.auraimage.ai/v1/upload', {
  method: 'POST',
  headers: { 'X-Aura-Signature': signature },
  body: form
});
const { url } = await res.json();
```

## Runtime requirements

ESM-only, Node.js 20+. Uses `crypto.subtle`, `TextEncoder`, `btoa` / `atob` — all standard in modern Node, Bun, Deno, Cloudflare Workers, and browsers.

## `@auraimage/sdk/server`

The `/server` subpath exposes lower-level primitives used when you self-host a verifying backend (for example, a Workers-based CDN of your own). Most adopters do not need this.

```ts
import { verifyUploadToken, type UploadTokenPayload } from '@auraimage/sdk/server';
```

## License

MIT © Auraimage
