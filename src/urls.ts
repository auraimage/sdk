/**
 * Serve-URL builders (ADR 0022). The manual counterpart to the `<AuraImage>`
 * component: for developers who assemble their own `<img src>` and want the
 * transform grammar handled correctly. Pure and synchronous — safe in the
 * browser and on the server, no secrets involved.
 *
 * These build **public** URLs only. For a private image, sign a serve URL with
 * `AuraImage.getSignedUrl` instead.
 *
 * NOTE: this module deliberately re-encodes the serve-URL grammar (option keys,
 * the format→extension map) rather than sharing the CDN's parser — the SDK is a
 * separately-published package and can't depend on the worker. See ADR 0023.
 */

export interface BuildServeUrlOptions {
  /** CDN base URL, e.g. "https://cdn.auraimage.ai". Trailing slashes are trimmed. */
  cdnUrl: string;
  /** Project the image lives in. */
  project: string;
  /**
   * Extension-less stored image name (the `name` from an upload result), e.g.
   * "blog/hero". Slashes are path segments. Do NOT include a file extension —
   * pass `format` instead. A name like "photo.jpg" is served as "photo.jpg" and
   * appending a format would produce "photo.jpg.webp", which 404s.
   */
  name: string;
  /** Target width in pixels. Positive integer. */
  width?: number;
  /** Target height in pixels. Positive integer. */
  height?: number;
  /** Crop/fit strategy. Server-side default is `cover`. */
  fit?: 'cover' | 'contain' | 'face' | 'auto';
  /** Output quality, 1–100. */
  quality?: number;
  /**
   * Output format. Omit or `auto` for automatic negotiation (AVIF → WebP →
   * JPEG). `jpeg` emits a `.jpg` extension.
   */
  format?: 'auto' | 'jpeg' | 'png' | 'webp' | 'avif';
  /** Request the low-quality placeholder variant (`lqip=true`). */
  lqip?: boolean;
  /** Cache-buster query value. Bump it after an overwrite to break the shared cache. */
  v?: string | number;
}

export interface BuildBlurhashUrlOptions {
  /** CDN base URL, e.g. "https://cdn.auraimage.ai". Trailing slashes are trimmed. */
  cdnUrl: string;
  /** Project the image lives in. */
  project: string;
  /** Extension-less stored image name (the `name` from an upload result), e.g. "blog/hero". */
  name: string;
  /** Cache-buster query value. Bump it after an overwrite to break the shared cache. */
  v?: string | number;
}

function trimCdnUrl(cdnUrl: string, fn: string): string {
  if (!cdnUrl) throw new Error(`${fn}: cdnUrl is required`);
  return cdnUrl.replace(/\/+$/, '');
}

function assertName(project: string, name: string, fn: string): void {
  if (!project) throw new Error(`${fn}: project is required`);
  if (!name) throw new Error(`${fn}: name is required`);
}

/** Encode each path segment of a possibly-slashed image name, preserving the slashes. */
function encodeName(name: string): string {
  return name.split('/').map(encodeURIComponent).join('/');
}

function dimension(value: number, field: string): string {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`buildServeUrl: ${field} must be a positive integer, got ${value}`);
  }
  return String(value);
}

function quality(value: number): string {
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new Error(`buildServeUrl: quality must be an integer between 1 and 100, got ${value}`);
  }
  return String(value);
}

function formatExtension(format: BuildServeUrlOptions['format']): string {
  if (!format || format === 'auto') return '';
  return format === 'jpeg' ? '.jpg' : `.${format}`;
}

function queryV(v: string | number | undefined): string {
  return v === undefined ? '' : `?v=${encodeURIComponent(String(v))}`;
}

/**
 * Build a public Serve URL of the form
 * `{cdnUrl}/{project}/{transform segment}/{name}[.{ext}][?v=…]` (ADR 0022).
 * The transform segment is omitted entirely when no transform options are set,
 * so a format-only or `v`-only call yields the clean `{project}/{name}` path.
 */
export function buildServeUrl(options: BuildServeUrlOptions): string {
  const { cdnUrl, project, name, width, height, fit, quality: q, format, lqip, v } = options;
  const base = trimCdnUrl(cdnUrl, 'buildServeUrl');
  assertName(project, name, 'buildServeUrl');

  const segment: string[] = [];
  if (width !== undefined) segment.push(`w=${dimension(width, 'width')}`);
  if (height !== undefined) segment.push(`h=${dimension(height, 'height')}`);
  if (fit !== undefined) segment.push(`fit=${fit}`);
  if (q !== undefined) segment.push(`q=${quality(q)}`);
  if (lqip) segment.push('lqip=true');

  const path = [encodeURIComponent(project)];
  if (segment.length > 0) path.push(segment.join(','));
  path.push(encodeName(name));

  return `${base}/${path.join('/')}${formatExtension(format)}${queryV(v)}`;
}

/**
 * Build the blurhash-metadata URL for an image:
 * `{cdnUrl}/v1/blurhash/{project}/{name}[?v=…]`. A GET returns
 * `{ blurhash, width, height }` for public images (private images need the
 * image's serve token appended, same as the serve path).
 */
export function buildBlurhashUrl(options: BuildBlurhashUrlOptions): string {
  const { cdnUrl, project, name, v } = options;
  const base = trimCdnUrl(cdnUrl, 'buildBlurhashUrl');
  assertName(project, name, 'buildBlurhashUrl');

  return `${base}/v1/blurhash/${encodeURIComponent(project)}/${encodeName(name)}${queryV(v)}`;
}
