/** Options passed to AuraImage.signUpload(). */
export interface SignUploadOptions {
  /**
   * Max file size. Accepts bytes (number) or human-readable string
   * like "5mb", "500kb", "2gb".
   */
  maxSize?: number | string;
  /** MIME patterns to allow. Default: ["image/*"] */
  allowedTypes?: string[];
  /**
   * Token lifetime in seconds. Default: 3600 (1 hour).
   */
  expiresIn?: number;
  projectId: string;
}

/** Returned by the Auraimage CDN upload endpoint on success. */
export interface UploadResult {
  url: string;
  blurhash: string;
  width: number;
  height: number;
  format: string;
  size: number;
}

// ---------------------------------------------------------------------------
// Server-side types (exported from "@auraimage/sdk/server" only)
// ---------------------------------------------------------------------------

/** Auraimage billing tiers. */
export type Tier = 'hacker' | 'pro' | 'startup';

/** Payload encoded inside the HMAC upload token. */
export interface UploadTokenPayload {
  projectName: string;
  /** Max upload size in bytes. */
  maxSize: number;
  /** Allowed MIME type patterns, e.g. ["image/*"]. */
  allowedTypes: string[];
  /** Issued-at time (Unix seconds). */
  iat: number;
  /** Expiry time (Unix seconds) after which the token is invalid. */
  exp: number;
  projectId: string;
}
