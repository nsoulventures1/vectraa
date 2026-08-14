import { describe, expect, it } from 'vitest';
import { quantizeChannel, recommendedLogoRescueOptions } from './logoRescue';
import type { ImageAnalysis } from './types';

const analysis: ImageAnalysis = {
  width: 800,
  height: 600,
  megapixels: 0.48,
  hasAlpha: false,
  likelyKind: 'logo',
  confidence: 90,
  signals: { edgeDensity: 0.28, colorComplexity: 0.18, lightBackground: 0.7, alphaCoverage: 0 },
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

  it('quantizes channels to bounded levels', () => {
    expect(quantizeChannel(0, 8)).toBe(0);
    expect(quantizeChannel(255, 8)).toBe(255);
    expect(quantizeChannel(126, 2)).toBe(0);
    expect(quantizeChannel(200, 2)).toBe(255);
  });
});
