/** Whether an image is publicly readable or requires a signed serve URL. */
export type ImageVisibility = 'public' | 'private';

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
  /** Override the project name set on the AuraImage instance. */
  projectName?: string;
  /** Initial visibility of the uploaded image. Default: "public". */
  visibility?: ImageVisibility;
}

/** Options passed to AuraImage.getSignedUrl(). */
export interface GetSignedUrlOptions {
  /**
   * Token lifetime in seconds. Default: 3600 (1 hour). Max: 604800 (7 days).
   */
  expiresIn?: number;
  /** Override the CDN base URL set on the AuraImage instance. */
  cdnUrl?: string;
}

/** Returned by the Auraimage CDN upload endpoint on success. */
export interface UploadResult {
  url: string;
  /** Stored filename — pass this to getSignedUrl() / setVisibility(). */
  key: string;
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
  /** Initial visibility for the uploaded image. Default: "public". */
  visibility?: ImageVisibility;
}

/**
 * Payload encoded inside an HMAC serve token used to authorize reads of
 * private images. Field names are short for compact URLs.
 */
export interface ServeTokenPayload {
  /** Project name (must match URL path). */
  p: string;
  /** Filename (must match URL path). */
  f: string;
  /** Expiry time (Unix seconds) after which the token is invalid. */
  exp: number;
}

/** Maximum allowed lifetime for a serve URL token (7 days, in seconds). */
export const MAX_SERVE_TTL_SEC = 7 * 24 * 60 * 60;
