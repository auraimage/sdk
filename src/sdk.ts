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

export interface AuraImageOptions {
  secretKey: string;
  projectName: string;
}

export class AuraImage {
  private secretKey: string;
  private projectName: string;

  constructor({ secretKey, projectName }: AuraImageOptions) {
    if (!secretKey) throw new Error('AuraImage: secretKey is required');
    this.secretKey = secretKey;
    this.projectName = projectName;
  }

  /**
   * Generate a short-lived HMAC upload token. Call this server-side and
   * return `{ signature }` to your client. NEVER instantiate AuraImage
   * in browser code — the secret key must stay on your server.
   */
  async signUpload(options: SignUploadOptions = {}): Promise<string> {
    const nowSec = Math.floor(Date.now() / 1000);
    const payload: UploadTokenPayload = {
      projectName: options.projectName ?? this.projectName,
      maxSize: parseSize(options.maxSize ?? '5mb'),
      allowedTypes: options.allowedTypes ?? ['image/*'],
      iat: nowSec,
      exp: nowSec + (options.expiresIn ?? 3600)
    };

    return signUploadToken(payload, this.secretKey);
  }
}
