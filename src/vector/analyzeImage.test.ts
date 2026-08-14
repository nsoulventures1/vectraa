import { describe, expect, it } from 'vitest';
import { classifyImageSignals, recommendationConfidence, type ImageSignals } from './analyzeImage';

const base: ImageSignals = {
  width: 1000,
  height: 1000,
  hasAlpha: false,
  alphaCoverage: 0,
  edgeDensity: 0.12,
  colorComplexity: 0.2,
  lightBackground: 0.45,
  darkInk: 0.15,
  saturation: 0.2,
};

describe('classifyImageSignals', () => {
  it('recognizes sparse dark ink on white as a signature', () => {
    expect(classifyImageSignals({ ...base, lightBackground: 0.86, darkInk: 0.08, edgeDensity: 0.08, colorComplexity: 0.08, saturation: 0.03 })).toBe('signature');
  });

  it('recognizes monochrome edge-heavy artwork as line art', () => {
    expect(classifyImageSignals({ ...base, lightBackground: 0.62, edgeDensity: 0.22, colorComplexity: 0.12, saturation: 0.04 })).toBe('line-art');
  });

  it('recognizes compact low-complexity colored artwork as a logo', () => {
    expect(classifyImageSignals({ ...base, edgeDensity: 0.1, colorComplexity: 0.25, saturation: 0.36 })).toBe('logo');
  });

  it('routes highly complex imagery to high detail', () => {
    expect(classifyImageSignals({ ...base, edgeDensity: 0.44, colorComplexity: 0.84, saturation: 0.5 })).toBe('high-detail');
  });

  it('uses illustration for the middle ground', () => {
    expect(classifyImageSignals({ ...base, edgeDensity: 0.31, colorComplexity: 0.55, saturation: 0.42 })).toBe('illustration');
  });
});

describe('recommendationConfidence', () => {
  it('always returns a bounded user-facing confidence', () => {
    const confidence = recommendationConfidence(base, 'logo');
    expect(confidence).toBeGreaterThanOrEqual(55);
    expect(confidence).toBeLessThanOrEqual(96);
  });
});
