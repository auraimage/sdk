/** Whether an image is publicly readable or requires a signed serve URL. */
export type ImageVisibility = 'public' | 'private';

/** Options passed to AuraImage.signUpload(). */
export interface SignUploadOptions {
  /**
   * Max file size. Accepts bytes (number) or human-readable string
   * like "30mb", "500kb", "2gb".
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
  /**
   * Custom image name/path within the project (e.g. "blog/hero").
   * Slashes create path segments. If not set, a random name is generated.
   */
  name?: string;
  /**
   * Allow overwriting an existing image with the same name.
   * Default: false (returns 409 Conflict if the name exists).
   */
  overwrite?: boolean;
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
  /** Stored image name (extension-less) — pass this to getSignedUrl() / setVisibility(). */
  name: string;
  blurhash: string;
  width: number;
  height: number;
  format: string;
  masterFormat: string;
  size: number;
  visibility: ImageVisibility;
}

/** Options for AuraImage.uploadFromUrl(). */
export interface UploadFromUrlOptions {
  /**
   * Custom image name/path within the project (e.g. "blog/hero").
   * If not set, derived from the last path segment of the URL.
   */
  name?: string;
  /**
   * Max file size. Accepts bytes (number) or human-readable string
   * like "30mb", "500kb", "2gb". Default: "30mb".
   */
  maxSize?: number | string;
  /** Initial visibility of the uploaded image. Default: "public". */
  visibility?: ImageVisibility;
  /**
   * Allow overwriting an existing image with the same name.
   * Default: false (returns 409 Conflict if the name exists).
   */
  overwrite?: boolean;
  /** Fetch timeout in milliseconds. Default: 30000 (30 seconds). */
  timeout?: number;
}

/** Error thrown by AuraImage.uploadFromUrl(). The `url` and `kind` fields
 *  identify what failed so callers can log or retry. */
export class UploadFromUrlError extends Error {
  public readonly url: string;
  public readonly kind: 'fetch' | 'content-type' | 'size' | 'upload' | 'invalid-name';
  public readonly status?: number;

  constructor(
    message: string,
    url: string,
    kind: 'fetch' | 'content-type' | 'size' | 'upload' | 'invalid-name',
    status?: number
  ) {
    super(message);
    this.name = 'UploadFromUrlError';
    this.url = url;
    this.kind = kind;
    this.status = status;
  }
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
  /** Custom image name/path within the project (e.g. "blog/hero"). Slashes create path segments. */
  name?: string;
  /** Allow overwriting an existing image with the same name. */
  overwrite?: boolean;
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
