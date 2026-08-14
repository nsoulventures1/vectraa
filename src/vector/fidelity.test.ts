import { describe, expect, it } from 'vitest';
import { scoreFidelityMetrics } from './fidelity';

describe('visual fidelity scoring', () => {
  it('gives a perfect score to identical pixels', () => {
    expect(scoreFidelityMetrics(0, 0)).toBe(100);
  });

  it('penalizes widespread visible differences', () => {
    expect(scoreFidelityMetrics(80, 0.7)).toBeLessThan(60);
  });

  it('penalizes localized differences less than widespread ones', () => {
    const localized = scoreFidelityMetrics(20, 0.08);
    const widespread = scoreFidelityMetrics(20, 0.7);
    expect(localized).toBeGreaterThan(widespread);
  });

  it('clamps invalid metric ranges safely', () => {
    expect(scoreFidelityMetrics(-10, -1)).toBe(100);
    expect(scoreFidelityMetrics(999, 9)).toBe(0);
  });
});
