import { describe, expect, it } from 'vitest';
import { blank, blend } from './fixtures';
import { quantizeChannel, recommendedLogoRescueOptions, applyLogoRescue, DEFAULT_LOGO_RESCUE } from './logoRescue';
import type { ImageAnalysis } from './types';

const analysis: ImageAnalysis = {
  width: 800,
  height: 600,
  megapixels: 0.48,
  hasAlpha: false,
  likelyKind: 'logo',
  confidence: 90,
  signals: { edgeDensity: 0.28, colorComplexity: 0.18, lightBackground: 0.7, alphaCoverage: 0, midtoneCoverage: 0.02, paletteConcentration: 0.78 },
  warnings: [],
};

describe('logo rescue', () => {
  it('recommends background removal and stronger denoise for a noisy light-background logo', () => {
    const options = recommendedLogoRescueOptions(analysis);
    expect(options.removeNearWhiteBackground).toBe(true);
    expect(options.denoiseStrength).toBe(2);
    expect(options.colorLevels).toBe(10);
  });

  it('preserves existing transparency instead of inferring white as background', () => {
    const options = recommendedLogoRescueOptions({ ...analysis, hasAlpha: true });
    expect(options.removeNearWhiteBackground).toBe(false);
  });

  it('removes a near-white background and keeps separate inks', () => {
    const image = blank(48, 48);
    blend(image, 8, 8, { r: 250, g: 250, b: 250 }, 1);
    for (let y = 16; y < 32; y += 1) {
      for (let x = 8; x < 20; x += 1) blend(image, x, y, { r: 31, g: 85, b: 54 }, 1);
      for (let x = 28; x < 40; x += 1) blend(image, x, y, { r: 24, g: 35, b: 30 }, 1);
    }
    image.data[(4 * image.width + 4) * 4] = 20;
    image.data[(4 * image.width + 4) * 4 + 1] = 200;
    image.data[(4 * image.width + 4) * 4 + 2] = 20;
    const cleaned = applyLogoRescue(image, DEFAULT_LOGO_RESCUE);
    expect(cleaned.data[(0) + 3]).toBe(0);
    const greens = cleaned.data[(20 * image.width + 12) * 4 + 1];
    const blacks = cleaned.data[(20 * image.width + 32) * 4];
    expect(greens).toBeGreaterThan(70);
    expect(blacks).toBeLessThan(40);
    expect(cleaned.data).not.toEqual(image.data);
  });

  it('quantizes channels to bounded levels', () => {
    expect(quantizeChannel(0, 8)).toBe(0);
    expect(quantizeChannel(255, 8)).toBe(255);
    expect(quantizeChannel(126, 2)).toBe(0);
    expect(quantizeChannel(200, 2)).toBe(255);
  });
});
