/** Options passed to AuraImage.signUpload(). */
export interface SignUploadOptions {
  slug: string;
  /**
   * Max file size. Accepts bytes (number) or human-readable string
   * like "5mb", "500kb", "2gb".
   */
  maxSize?: number | string;
  /** MIME patterns to allow. Default: ["image/*"] */
  allowedTypes?: string[];
  /**
   * Token expiry. Accepts a Unix ms timestamp or a Date.
   * Default: 1 hour from now.
   */
  expires?: number | Date;
  userId: string;
  projectId: string;
  /**
   * Billing tier of the signing user. Consumed by the Auraimage CDN for
   * tier-based format gating. Typically "hacker" | "pro" | "startup"
   * but kept as a plain string so SDK adopters are not coupled to plan
   * names that may evolve.
   */
  tier: string;
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
  slug: string;
  /** Max upload size in bytes. */
  maxSize: number;
  /** Allowed MIME type patterns, e.g. ["image/*"]. */
  allowedTypes: string[];
  /** Unix ms timestamp after which the token is invalid. */
  expires: number;
  userId: string;
  projectId: string;
  tier: Tier;
  /**
   * Optional list of allowed upload origins (e.g. "https://example.com",
   * "https://*.example.com"). When set, the Auraimage CDN rejects uploads
   * whose Origin header does not match any pattern.
   */
  allowedOrigins?: string[];
}
