import { signServeToken, signUploadToken } from './hmac.js';
import type {
  GetSignedUrlOptions,
  ImageVisibility,
  ServeTokenPayload,
  SignUploadOptions,
  UploadTokenPayload
} from './types.js';
import { MAX_SERVE_TTL_SEC } from './types.js';

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
  /** Per-user SDK secret (sk_live_…) used to sign upload tokens and authorize visibility mutations. */
  secretKey: string;
  /** Default project for signUpload / setVisibility / getSignedUrl calls. */
  projectName: string;
  /** Per-project serve secret (psk_live_…). Required to call getSignedUrl. */
  serveSecret?: string;
  /** CDN base URL, e.g. "https://cdn.auraimage.ai". Required for getSignedUrl and setVisibility. */
  cdnUrl?: string;
}

export interface SetVisibilityResult {
  visibility: ImageVisibility;
}

export class AuraImage {
  private secretKey: string;
  private projectName: string;
  private serveSecret: string | undefined;
  private cdnUrl: string | undefined;

  constructor({ secretKey, projectName, serveSecret, cdnUrl }: AuraImageOptions) {
    if (!secretKey) throw new Error('AuraImage: secretKey is required');
    this.secretKey = secretKey;
    this.projectName = projectName;
    this.serveSecret = serveSecret;
    this.cdnUrl = cdnUrl?.replace(/\/+$/, '');
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
      exp: nowSec + (options.expiresIn ?? 3600),
      ...(options.visibility ? { visibility: options.visibility } : {})
    };

    return signUploadToken(payload, this.secretKey);
  }

  /**
   * Build a signed URL for a private image. Returns a full URL with a
   * `?token=` query parameter. Default lifetime is 1 hour, max is 7 days.
   * Requires `serveSecret` and `cdnUrl` set on the AuraImage instance.
   */
  async getSignedUrl(filename: string, options: GetSignedUrlOptions = {}): Promise<string> {
    if (!this.serveSecret) {
      throw new Error('AuraImage.getSignedUrl: serveSecret is required (set it on the AuraImage constructor)');
    }
    const cdnUrl = (options.cdnUrl ?? this.cdnUrl)?.replace(/\/+$/, '');
    if (!cdnUrl) {
      throw new Error('AuraImage.getSignedUrl: cdnUrl is required (set it on the AuraImage constructor)');
    }
    const requested =
      typeof options.expiresIn === 'number' && Number.isFinite(options.expiresIn) ? options.expiresIn : 3600;
    const expiresIn = Math.min(Math.max(Math.floor(requested), 60), MAX_SERVE_TTL_SEC);
    const exp = Math.floor(Date.now() / 1000) + expiresIn;
    const payload: ServeTokenPayload = { p: this.projectName, f: filename, exp };
    const token = await signServeToken(payload, this.serveSecret);
    return `${cdnUrl}/${this.projectName}/${encodeURIComponent(filename)}?token=${token}`;
  }

  /**
   * Change the visibility of an existing image. Idempotent. Requires
   * `cdnUrl` set on the AuraImage instance.
   */
  async setVisibility(filename: string, visibility: ImageVisibility): Promise<SetVisibilityResult> {
    if (visibility !== 'public' && visibility !== 'private') {
      throw new Error("AuraImage.setVisibility: visibility must be 'public' or 'private'");
    }
    const cdnUrl = this.cdnUrl;
    if (!cdnUrl) {
      throw new Error('AuraImage.setVisibility: cdnUrl is required (set it on the AuraImage constructor)');
    }
    const signature = await this.signUpload();
    const res = await fetch(
      `${cdnUrl}/v1/images/${encodeURIComponent(this.projectName)}/${encodeURIComponent(filename)}`,
      {
        method: 'PATCH',
        headers: {
          'X-Aura-Signature': signature,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ visibility })
      }
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      throw new Error(`AuraImage.setVisibility failed (${res.status}): ${body.message ?? 'unknown error'}`);
    }
    const body = (await res.json()) as SetVisibilityResult;
    return { visibility: body.visibility };
  }
}
