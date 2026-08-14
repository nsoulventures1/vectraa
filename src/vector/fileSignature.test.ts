import { describe, expect, it } from 'vitest';
import { detectRasterMime } from './fileSignature';

describe('raster binary signatures', () => {
  it('detects JPEG', () => expect(detectRasterMime(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe('image/jpeg'));
  it('detects PNG', () => expect(detectRasterMime(new Uint8Array([0x89,0x50,0x4e,0x47,0x0d,0x0a,0x1a,0x0a]))).toBe('image/png'));
  it('detects WebP RIFF containers', () => expect(detectRasterMime(new Uint8Array([0x52,0x49,0x46,0x46,0,0,0,0,0x57,0x45,0x42,0x50]))).toBe('image/webp'));
  it('rejects spoofed arbitrary bytes', () => expect(detectRasterMime(new TextEncoder().encode('<script>not an image</script>'))).toBeNull());
});
