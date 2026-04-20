import { signUploadToken, verifyUploadToken } from './hmac.js';
import type { UploadTokenPayload } from './types.js';
import { describe, expect, it } from 'vitest';

const SECRET = 'test-secret-32-chars-minimum-len';

describe('HMAC upload tokens', () => {
  const payload: UploadTokenPayload = {
    slug: 'narek',
    maxSize: 5 * 1024 * 1024,
    allowedTypes: ['image/*'],
    expires: Date.now() + 3_600_000,
    userId: 'user-123',
    projectId: 'proj-456',
    tier: 'hacker'
  };

  it('round-trips: sign then verify returns payload', async () => {
    const token = await signUploadToken(payload, SECRET);
    const result = await verifyUploadToken(token, SECRET);
    expect(result).not.toBeNull();
    expect(result?.slug).toBe('narek');
    expect(result?.userId).toBe('user-123');
  });

  it('returns null for tampered token', async () => {
    const token = await signUploadToken(payload, SECRET);
    const tampered = token.slice(0, -4) + 'XXXX';
    const result = await verifyUploadToken(tampered, SECRET);
    expect(result).toBeNull();
  });

  it('returns null for expired token', async () => {
    const expiredPayload = { ...payload, expires: Date.now() - 1000 };
    const token = await signUploadToken(expiredPayload, SECRET);
    const result = await verifyUploadToken(token, SECRET);
    expect(result).toBeNull();
  });

  it('returns null for wrong secret', async () => {
    const token = await signUploadToken(payload, SECRET);
    const result = await verifyUploadToken(token, 'wrong-secret');
    expect(result).toBeNull();
  });
});
