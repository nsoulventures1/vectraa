import { describe, expect, it } from 'vitest';
import { traceBinaryArtwork } from './binaryTrace';
import { lineArtFixture, signatureFixture } from './fixtures';
import { inspectSvg } from './quality';
import { DEFAULT_OPTIONS } from './presets';

describe('binary artwork tracer', () => {
  it('fits a line-art circle and stays far smaller than a pixel trace', () => {
    const svg = traceBinaryArtwork(lineArtFixture().image, DEFAULT_OPTIONS['line-art']);
    const quality = inspectSvg(svg);
    expect(svg).toContain('<circle');
    expect(quality.nodesApprox).toBeLessThan(180);
    expect(quality.validSvg).toBe(true);
  });

  it('traces a signature with a short curve list', () => {
    const svg = traceBinaryArtwork(signatureFixture().image, DEFAULT_OPTIONS.signature);
    const quality = inspectSvg(svg);
    expect(quality.paths).toBeGreaterThan(0);
    expect(quality.nodesApprox).toBeLessThan(360);
    expect(svg).not.toContain('<image');
  });

  it('uses fewer commands as smoothing increases', () => {
    const image = signatureFixture().image;
    const rough = inspectSvg(traceBinaryArtwork(image, { ...DEFAULT_OPTIONS.signature, smoothing: 10, detail: 95 }));
    const smooth = inspectSvg(traceBinaryArtwork(image, { ...DEFAULT_OPTIONS.signature, smoothing: 92, detail: 40 }));
    expect(smooth.nodesApprox).toBeLessThan(rough.nodesApprox);
  });
});
