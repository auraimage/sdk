import { buildBlurhashUrl, buildServeUrl } from './urls';
import { describe, expect, it } from 'vitest';

const cdnUrl = 'https://cdn.auraimage.ai';
const project = 'proj';
const name = 'img';

describe('buildServeUrl', () => {
  it('builds the canonical extension-less URL with no options', () => {
    expect(buildServeUrl({ cdnUrl, project, name })).toBe('https://cdn.auraimage.ai/proj/img');
  });

  it('emits a full transform segment in canonical key order', () => {
    expect(buildServeUrl({ cdnUrl, project, name, width: 800, height: 600, fit: 'contain', quality: 75 })).toBe(
      'https://cdn.auraimage.ai/proj/w=800,h=600,fit=contain,q=75/img'
    );
  });

  it('maps format to a serve extension without a transform segment (no double slash)', () => {
    expect(buildServeUrl({ cdnUrl, project, name, format: 'webp' })).toBe('https://cdn.auraimage.ai/proj/img.webp');
  });

  it('maps format=jpeg to .jpg', () => {
    expect(buildServeUrl({ cdnUrl, project, name, format: 'jpeg' })).toBe('https://cdn.auraimage.ai/proj/img.jpg');
  });

  it('treats format=auto as no extension', () => {
    expect(buildServeUrl({ cdnUrl, project, name, format: 'auto' })).toBe('https://cdn.auraimage.ai/proj/img');
  });

  it('appends v as a query param with no transform segment', () => {
    expect(buildServeUrl({ cdnUrl, project, name, v: 5 })).toBe('https://cdn.auraimage.ai/proj/img?v=5');
  });

  it('combines a transform segment, extension and v', () => {
    expect(buildServeUrl({ cdnUrl, project, name, width: 400, format: 'avif', v: 'abc' })).toBe(
      'https://cdn.auraimage.ai/proj/w=400/img.avif?v=abc'
    );
  });

  it('emits lqip=true', () => {
    expect(buildServeUrl({ cdnUrl, project, name, lqip: true })).toBe('https://cdn.auraimage.ai/proj/lqip=true/img');
  });

  it('omits lqip when false', () => {
    expect(buildServeUrl({ cdnUrl, project, name, lqip: false })).toBe('https://cdn.auraimage.ai/proj/img');
  });

  it('trims trailing slashes on cdnUrl', () => {
    expect(buildServeUrl({ cdnUrl: 'https://cdn.auraimage.ai///', project, name, width: 100 })).toBe(
      'https://cdn.auraimage.ai/proj/w=100/img'
    );
  });

  it('preserves slashes in a nested name and encodes each segment', () => {
    expect(buildServeUrl({ cdnUrl, project, name: 'blog/my hero', width: 100 })).toBe(
      'https://cdn.auraimage.ai/proj/w=100/blog/my%20hero'
    );
  });

  it('encodes the project', () => {
    expect(buildServeUrl({ cdnUrl, project: 'a b', name })).toBe('https://cdn.auraimage.ai/a%20b/img');
  });

  it('throws on non-positive or non-integer width/height', () => {
    expect(() => buildServeUrl({ cdnUrl, project, name, width: 0 })).toThrow(/width must be a positive integer/);
    expect(() => buildServeUrl({ cdnUrl, project, name, width: -1 })).toThrow(/width must be a positive integer/);
    expect(() => buildServeUrl({ cdnUrl, project, name, height: 1.5 })).toThrow(/height must be a positive integer/);
  });

  it('throws on quality outside 1–100 or non-integer', () => {
    expect(() => buildServeUrl({ cdnUrl, project, name, quality: 0 })).toThrow(
      /quality must be an integer between 1 and 100/
    );
    expect(() => buildServeUrl({ cdnUrl, project, name, quality: 101 })).toThrow(
      /quality must be an integer between 1 and 100/
    );
    expect(() => buildServeUrl({ cdnUrl, project, name, quality: 50.5 })).toThrow(
      /quality must be an integer between 1 and 100/
    );
  });

  it('throws on missing required fields', () => {
    expect(() => buildServeUrl({ cdnUrl: '', project, name })).toThrow(/cdnUrl is required/);
    expect(() => buildServeUrl({ cdnUrl, project: '', name })).toThrow(/project is required/);
    expect(() => buildServeUrl({ cdnUrl, project, name: '' })).toThrow(/name is required/);
  });
});

describe('buildBlurhashUrl', () => {
  it('builds the blurhash endpoint URL', () => {
    expect(buildBlurhashUrl({ cdnUrl, project, name })).toBe('https://cdn.auraimage.ai/v1/blurhash/proj/img');
  });

  it('appends v', () => {
    expect(buildBlurhashUrl({ cdnUrl, project, name, v: 3 })).toBe('https://cdn.auraimage.ai/v1/blurhash/proj/img?v=3');
  });

  it('preserves nested names and trims trailing slashes', () => {
    expect(buildBlurhashUrl({ cdnUrl: 'https://cdn.auraimage.ai/', project, name: 'blog/hero' })).toBe(
      'https://cdn.auraimage.ai/v1/blurhash/proj/blog/hero'
    );
  });

  it('throws on missing required fields', () => {
    expect(() => buildBlurhashUrl({ cdnUrl: '', project, name })).toThrow(/cdnUrl is required/);
    expect(() => buildBlurhashUrl({ cdnUrl, project: '', name })).toThrow(/project is required/);
    expect(() => buildBlurhashUrl({ cdnUrl, project, name: '' })).toThrow(/name is required/);
  });
});
