import {
  MissingProjectNameError,
  signServeToken,
  signUploadToken,
  verifyServeToken,
  verifyUploadToken
} from './hmac.js';
import { AuraImage } from './sdk.js';
import type { UploadTokenPayload } from './types.js';
import { describe, expect, it } from 'vitest';

const SECRET = 'test-secret-32-chars-minimum-len';

function nowSec(): number {
  return Math.floor(Date.now() / 1000);
}

function makePayload(overrides: Partial<UploadTokenPayload> = {}): UploadTokenPayload {
  const now = nowSec();
  return {
    projectName: 'test-project',
    maxSize: 5 * 1024 * 1024,
    allowedTypes: ['image/*'],
    iat: now,
    exp: now + 3600,
    ...overrides
  };
}

describe('HMAC upload tokens', () => {
  it('round-trips: sign then verify returns payload', async () => {
    const payload = makePayload();
    const token = await signUploadToken(payload, SECRET);
    const result = await verifyUploadToken(token, SECRET);
    expect(result).not.toBeNull();
    expect(result?.projectName).toBe('test-project');
    expect(result?.exp).toBe(payload.exp);
  });

  it('returns null for tampered token', async () => {
    const token = await signUploadToken(makePayload(), SECRET);
    const tampered = token.slice(0, -4) + 'XXXX';
    const result = await verifyUploadToken(tampered, SECRET);
    expect(result).toBeNull();
  });

  it('returns null for expired token', async () => {
    const token = await signUploadToken(makePayload({ exp: nowSec() - 1 }), SECRET);
    const result = await verifyUploadToken(token, SECRET);
    expect(result).toBeNull();
  });

  it('returns null for wrong secret', async () => {
    const token = await signUploadToken(makePayload(), SECRET);
    const result = await verifyUploadToken(token, 'wrong-secret');
    expect(result).toBeNull();
  });

  it('throws MissingProjectNameError when payload omits projectName and a resolver callback is used', async () => {
    // Simulates a token signed by a pre-0.4.0 SDK (no projectName field).
    const now = nowSec();
    const legacyPayload = { maxSize: 5 * 1024 * 1024, allowedTypes: ['image/*'], iat: now, exp: now + 3600 };
    const token = await signUploadToken(legacyPayload as UploadTokenPayload, SECRET);
    await expect(
      verifyUploadToken(token, async () => {
        throw new Error('resolver should not be called');
      })
    ).rejects.toBeInstanceOf(MissingProjectNameError);
  });

  it('resolves the secret per-project via async resolver', async () => {
    const token = await signUploadToken(makePayload(), SECRET);
    const seen: string[] = [];
    const result = await verifyUploadToken(token, async (projectName) => {
      seen.push(projectName);
      return SECRET;
    });
    expect(result).not.toBeNull();
    expect(seen).toEqual(['test-project']);
  });
});

describe('AuraImage.signUpload — expiresIn semantics', () => {
  it('treats expiresIn as a duration in seconds (default 3600)', async () => {
    const aura = new AuraImage({ secretKey: SECRET, projectName: 'test' });
    const before = nowSec();
    const token = await aura.signUpload();
    const after = nowSec();

    const result = await verifyUploadToken(token, SECRET);
    expect(result).not.toBeNull();
    expect(result!.exp).toBeGreaterThanOrEqual(before + 3600);
    expect(result!.exp).toBeLessThanOrEqual(after + 3600);
  });

  it('respects explicit expiresIn (seconds)', async () => {
    const aura = new AuraImage({ secretKey: SECRET, projectName: 'test' });
    const before = nowSec();
    const token = await aura.signUpload({ expiresIn: 60 });
    const after = nowSec();

    const result = await verifyUploadToken(token, SECRET);
    expect(result).not.toBeNull();
    expect(result!.exp).toBeGreaterThanOrEqual(before + 60);
    expect(result!.exp).toBeLessThanOrEqual(after + 60);
  });

  it('allows per-call projectName override', async () => {
    const aura = new AuraImage({ secretKey: SECRET, projectName: 'default-project' });
    const token = await aura.signUpload({ projectName: 'override-project' });
    const result = await verifyUploadToken(token, SECRET);
    expect(result?.projectName).toBe('override-project');
  });
});

describe('HMAC serve tokens', () => {
  const SERVE_SECRET = 'psk_live_0123456789abcdef0123456789abcdef';

  it('round-trips: sign then verify returns payload', async () => {
    const exp = nowSec() + 600;
    const token = await signServeToken({ p: 'proj', f: 'abc-pic.jpg', exp }, SERVE_SECRET);
    const result = await verifyServeToken(token, SERVE_SECRET);
    expect(result).not.toBeNull();
    expect(result?.p).toBe('proj');
    expect(result?.f).toBe('abc-pic.jpg');
    expect(result?.exp).toBe(exp);
  });

  it('returns null for tampered token', async () => {
    const token = await signServeToken({ p: 'proj', f: 'a.jpg', exp: nowSec() + 600 }, SERVE_SECRET);
    const tampered = token.slice(0, -4) + 'XXXX';
    expect(await verifyServeToken(tampered, SERVE_SECRET)).toBeNull();
  });

  it('returns null for expired token', async () => {
    const token = await signServeToken({ p: 'proj', f: 'a.jpg', exp: nowSec() - 1 }, SERVE_SECRET);
    expect(await verifyServeToken(token, SERVE_SECRET)).toBeNull();
  });

  it('returns null for wrong secret', async () => {
    const token = await signServeToken({ p: 'proj', f: 'a.jpg', exp: nowSec() + 600 }, SERVE_SECRET);
    expect(await verifyServeToken(token, 'psk_live_wrong000000000000000000000000')).toBeNull();
  });

  it('rejects payloads missing required fields', async () => {
    // payload signed with the right secret but with wrong shape
    const enc = new TextEncoder();
    const bad = JSON.stringify({ p: 'proj', exp: nowSec() + 600 }); // missing f
    const b64 = btoa(String.fromCharCode(...enc.encode(bad)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const key = await crypto.subtle.importKey(
      'raw',
      enc.encode(SERVE_SECRET),
      { name: 'HMAC', hash: 'SHA-256' },
      false,
      ['sign']
    );
    const sig = await crypto.subtle.sign('HMAC', key, enc.encode(b64));
    const sigB64 = btoa(String.fromCharCode(...new Uint8Array(sig)))
      .replace(/\+/g, '-')
      .replace(/\//g, '_')
      .replace(/=+$/, '');
    const token = `${b64}.${sigB64}`;
    expect(await verifyServeToken(token, SERVE_SECRET)).toBeNull();
  });
});
