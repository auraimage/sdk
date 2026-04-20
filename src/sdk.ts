import { signUploadToken } from './hmac.js';
import type { SignUploadOptions, Tier, UploadTokenPayload } from './types.js';

/** Parse "5mb", "500kb", "2gb" or pass-through numbers (bytes). */
export function parseSize(input: number | string): number {
  if (typeof input === 'number') return input;
  const match = input.trim().match(/^(\d+(?:\.\d+)?)\s*(kb|mb|gb|b)?$/i);
  if (!match) throw new Error(`Invalid size string: "${input}"`);
  const value = parseFloat(match[1]!);
  const unit = (match[2] ?? 'b').toLowerCase();
  const multipliers: Record<string, number> = {
    b: 1,
    kb: 1_024,
    mb: 1_024 ** 2,
    gb: 1_024 ** 3
  };
  return Math.round(value * (multipliers[unit] ?? 1));
}

export class AuraImage {
  private secretKey: string;

  constructor({ secretKey }: { secretKey: string }) {
    if (!secretKey) throw new Error('AuraImage: secretKey is required');
    this.secretKey = secretKey;
  }

  /**
   * Generate a short-lived HMAC upload token. Call this server-side and
   * return `{ signature }` to your client. NEVER instantiate AuraImage
   * in browser code — the secret key must stay on your server.
   */
  async signUpload(options: SignUploadOptions): Promise<string> {
    const expiresMs =
      options.expires instanceof Date
        ? options.expires.getTime()
        : typeof options.expires === 'number'
          ? options.expires
          : Date.now() + 3_600_000;

    const payload: UploadTokenPayload = {
      slug: options.slug,
      maxSize: parseSize(options.maxSize ?? '5mb'),
      allowedTypes: options.allowedTypes ?? ['image/*'],
      expires: expiresMs,
      userId: options.userId,
      projectId: options.projectId,
      tier: options.tier as Tier
    };

    return signUploadToken(payload, this.secretKey);
  }
}
