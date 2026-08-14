import { describe, expect, it } from 'vitest';
import { assessVectorResult, scoreComplexity, scoreSize, scoreSpeed } from './benchmark';
import type { VectorResult } from './types';

const cleanResult: VectorResult = {
  svg: '<svg><path d="M0 0L10 10"/></svg>',
  elapsedMs: 900,
  quality: {
    validSvg: true,
    paths: 24,
    nodesApprox: 180,
    bytes: 18_000,
    score: 94,
    warnings: [],
  },
};

describe('benchmark scoring', () => {
  it('rewards compact fast vectors', () => {
    const assessment = assessVectorResult(cleanResult);
    expect(assessment.overallScore).toBeGreaterThanOrEqual(95);
    expect(assessment.complexityScore).toBe(100);
    expect(assessment.sizeScore).toBe(100);
    expect(assessment.speedScore).toBe(100);
  });

  it('penalizes excessive path and node complexity', () => {
    expect(scoreComplexity({ ...cleanResult.quality, paths: 1500, nodesApprox: 20_000 })).toBeLessThan(50);
  });

  it('uses predictable file-size bands', () => {
    expect(scoreSize(200_000)).toBe(100);
    expect(scoreSize(2_000_000)).toBe(50);
    expect(scoreSize(6_000_000)).toBe(10);
  });

  it('uses predictable speed bands', () => {
    expect(scoreSpeed(1_000)).toBe(100);
    expect(scoreSpeed(10_000)).toBe(55);
    expect(scoreSpeed(40_000)).toBe(15);
  });

  it('fails invalid SVG regardless of other metrics', () => {
    const assessment = assessVectorResult({
      ...cleanResult,
      quality: { ...cleanResult.quality, validSvg: false, score: 0 },
    });
    expect(assessment.qualityScore).toBe(0);
    expect(assessment.overallScore).toBeLessThan(60);
  });
});
