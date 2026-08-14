import { describe, expect, it } from 'vitest';
import { recommendVectorWorkflow } from './recommendation';
import type { ImageAnalysis } from './types';

function analysis(overrides: Partial<ImageAnalysis> = {}): ImageAnalysis {
  return {
    width: 1200,
    height: 800,
    megapixels: 0.96,
    hasAlpha: false,
    likelyKind: 'logo',
    confidence: 90,
    signals: { edgeDensity: 0.12, colorComplexity: 0.15, lightBackground: 0.8, alphaCoverage: 0 },
    warnings: [],
    ...overrides,
  };
}

describe('workflow recommendation', () => {
  it('recommends branding and rescue for light-background logos', () => {
    const result = recommendVectorWorkflow(analysis());
    expect(result.preset).toBe('logo');
    expect(result.purpose).toBe('branding');
    expect(result.logoRescue).toBe(true);
  });

  it('does not rescue transparent logos', () => {
    expect(recommendVectorWorkflow(analysis({ hasAlpha: true })).logoRescue).toBe(false);
  });

  it('recommends cutting inspection for line art', () => {
    const result = recommendVectorWorkflow(analysis({ likelyKind: 'line-art' }));
    expect(result.purpose).toBe('cricut');
    expect(result.logoRescue).toBe(false);
  });

  it('recommends print handoff for illustrations', () => {
    expect(recommendVectorWorkflow(analysis({ likelyKind: 'illustration' })).purpose).toBe('print');
  });
});
