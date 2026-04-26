import type { UploadTokenPayload } from './types.js';

function b64url(buf: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(buf)))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

function b64urlDecode(s: string): Uint8Array {
  const padded = s.replace(/-/g, '+').replace(/_/g, '/');
  const pad = (4 - (padded.length % 4)) % 4;
  const b64 = padded + '='.repeat(pad);
  const binary = atob(b64);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

async function getKey(secret: string): Promise<CryptoKey> {
  if (!secret) throw new Error('HMAC secret is empty — refusing to import zero-length key');
  const enc = new TextEncoder();
  return crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, [
    'sign',
    'verify'
  ]);
}

export async function signUploadToken(payload: UploadTokenPayload, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const encodedPayload = b64url(enc.encode(JSON.stringify(payload)).buffer as ArrayBuffer);
  const key = await getKey(secret);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(encodedPayload));
  return `${encodedPayload}.${b64url(sig)}`;
}

export async function verifyUploadToken(
  token: string,
  secret: string | ((projectId: string) => Promise<string>)
): Promise<UploadTokenPayload | null> {
  const dot = token.lastIndexOf('.');
  if (dot === -1) return null;

  const encodedPayload = token.slice(0, dot);
  const sigB64 = token.slice(dot + 1);

  // Decode payload first to resolve the per-project secret (safe: signature is verified after)
  let payload: UploadTokenPayload;
  try {
    const decoded = b64urlDecode(encodedPayload);
    payload = JSON.parse(new TextDecoder().decode(decoded));
  } catch {
    return null;
  }

  if (typeof secret !== 'string' && !payload.projectId) return null;

  const resolvedSecret = typeof secret === 'string' ? secret : await secret(payload.projectId);

  const enc = new TextEncoder();
  const key = await getKey(resolvedSecret);
  const sigBytes = b64urlDecode(sigB64);

  const valid = await crypto.subtle.verify('HMAC', key, sigBytes as BufferSource, enc.encode(encodedPayload));
  if (!valid) return null;

  if (payload.exp < Math.floor(Date.now() / 1000)) return null;

  return payload;
}
