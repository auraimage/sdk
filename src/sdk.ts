import { signServeToken, signUploadToken } from './hmac.js';
import type {
  GetSignedUrlOptions,
  ImageVisibility,
  ServeTokenPayload,
  SignUploadOptions,
  UploadFromUrlOptions,
  UploadResult,
  UploadTokenPayload
} from './types.js';
import { MAX_SERVE_TTL_SEC, UploadFromUrlError } from './types.js';

/** Parse "30mb", "500kb", "2gb" or pass-through numbers (bytes). */
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

/** Extract a usable image name from a URL's last path segment. */
function deriveNameFromUrl(url: string): string | undefined {
  let pathname: string;
  try {
    pathname = new URL(url).pathname;
  } catch {
    return undefined;
  }
  const segments = pathname.split('/').filter(Boolean);
  const last = segments[segments.length - 1];
  return last || undefined;
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
      maxSize: parseSize(options.maxSize ?? '30mb'),
      allowedTypes: options.allowedTypes ?? ['image/*'],
      iat: nowSec,
      exp: nowSec + (options.expiresIn ?? 3600),
      ...(options.visibility ? { visibility: options.visibility } : {}),
      ...(options.name !== undefined ? { name: options.name } : {}),
      ...(options.overwrite !== undefined ? { overwrite: options.overwrite } : {})
    };

    return signUploadToken(payload, this.secretKey);
  }

  /**
   * Build a signed URL for a private image from its extension-less name.
   * The token binds the name, so the returned URL also authorizes any
   * transform segment or serve extension added to it. Returns a full URL
   * with a `?token=` query parameter. Default lifetime is 1 hour, max is 7 days.
   * Requires `serveSecret` and `cdnUrl` set on the AuraImage instance.
   */
  async getSignedUrl(name: string, options: GetSignedUrlOptions = {}): Promise<string> {
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
    const payload: ServeTokenPayload = { p: this.projectName, f: name, exp };
    const token = await signServeToken(payload, this.serveSecret);
    return `${cdnUrl}/${this.projectName}/${name.split('/').map(encodeURIComponent).join('/')}?token=${token}`;
  }

  /**
   * Change the visibility of an existing image. Idempotent. Requires
   * `cdnUrl` set on the AuraImage instance.
   */
  async setVisibility(name: string, visibility: ImageVisibility): Promise<SetVisibilityResult> {
    if (visibility !== 'public' && visibility !== 'private') {
      throw new Error("AuraImage.setVisibility: visibility must be 'public' or 'private'");
    }
    const cdnUrl = this.cdnUrl;
    if (!cdnUrl) {
      throw new Error('AuraImage.setVisibility: cdnUrl is required (set it on the AuraImage constructor)');
    }
    const signature = await this.signUpload();
    const res = await fetch(
      `${cdnUrl}/v1/images/${encodeURIComponent(this.projectName)}/${name.split('/').map(encodeURIComponent).join('/')}`,
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

  /**
   * Download an image from a public URL and upload it to Auraimage.
   * Signs an upload token internally, fetches the bytes, validates the
   * Content-Type, and POSTs to the CDN upload endpoint.
   *
   * Requires `cdnUrl` set on the AuraImage instance.
   */
  async uploadFromUrl(url: string, options: UploadFromUrlOptions = {}): Promise<UploadResult> {
    if (!this.cdnUrl) {
      throw new Error('AuraImage.uploadFromUrl: cdnUrl is required (set it on the AuraImage constructor)');
    }

    const name = options.name ?? deriveNameFromUrl(url);
    if (!name) {
      throw new UploadFromUrlError(
        `Could not derive image name from URL: ${url}. Provide a name explicitly.`,
        url,
        'invalid-name'
      );
    }

    const maxSize = options.maxSize ? parseSize(options.maxSize) : parseSize('30mb');
    const timeout = options.timeout ?? 30_000;

    const token = await this.signUpload({
      name,
      maxSize,
      visibility: options.visibility,
      overwrite: options.overwrite
    });

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    let response: Response;
    try {
      response = await fetch(url, { signal: controller.signal });
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') {
        throw new UploadFromUrlError(`Fetch timed out after ${timeout}ms: ${url}`, url, 'fetch');
      }
      throw new UploadFromUrlError(`Failed to fetch URL: ${(err as Error).message}`, url, 'fetch');
    } finally {
      clearTimeout(timeoutId);
    }

    if (!response.ok) {
      throw new UploadFromUrlError(
        `Remote server returned ${response.status} for: ${url}`,
        url,
        'fetch',
        response.status
      );
    }

    const contentType = response.headers.get('content-type') ?? '';
    if (!contentType.startsWith('image/')) {
      throw new UploadFromUrlError(
        `Expected image Content-Type, got "${contentType}" for: ${url}`,
        url,
        'content-type'
      );
    }

    const contentLength = response.headers.get('content-length');
    if (contentLength) {
      const parsed = parseInt(contentLength, 10);
      if (!Number.isNaN(parsed) && parsed > maxSize) {
        throw new UploadFromUrlError(
          `Content-Length ${contentLength} exceeds max size ${maxSize} bytes for: ${url}`,
          url,
          'size'
        );
      }
    }

    let buffer: ArrayBuffer;
    try {
      buffer = await response.arrayBuffer();
    } catch (err) {
      throw new UploadFromUrlError(`Failed to read response body: ${(err as Error).message}`, url, 'fetch');
    }

    if (buffer.byteLength > maxSize) {
      throw new UploadFromUrlError(
        `Downloaded size ${buffer.byteLength} exceeds max size ${maxSize} bytes for: ${url}`,
        url,
        'size'
      );
    }

    const blob = new Blob([buffer], { type: contentType });
    const formData = new FormData();
    formData.append('file', blob, name);

    const uploadResponse = await fetch(`${this.cdnUrl}/v1/upload`, {
      method: 'POST',
      headers: { 'X-Aura-Signature': token },
      body: formData
    });

    if (!uploadResponse.ok) {
      const body = (await uploadResponse.json().catch(() => ({}))) as { message?: string };
      throw new UploadFromUrlError(
        `Upload failed (${uploadResponse.status}): ${body.message ?? 'unknown error'}`,
        url,
        'upload',
        uploadResponse.status
      );
    }

    return (await uploadResponse.json()) as UploadResult;
  }
}
