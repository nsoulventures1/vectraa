import { describe, expect, it } from 'vitest';
import { buildCandidateOptions, chooseNextVariants, combineScores, shouldStopEarly, type MultiPassCandidate } from './multipass';
import { DEFAULT_OPTIONS } from './presets';

function candidate(fidelity: number | null, healthScore: number, paths = 50): MultiPassCandidate {
  return {
    id: 'balanced',
    options: DEFAULT_OPTIONS.logo,
    fidelity: fidelity === null ? null : { score: fidelity, meanAbsoluteError: 2, changedPixelRatio: 0.01, sampleWidth: 100, sampleHeight: 100 },
    combinedScore: combineScores(fidelity, healthScore, 1000),
    result: {
      svg: '<svg></svg>',
      elapsedMs: 1000,
      quality: { validSvg: true, paths, nodesApprox: 100, bytes: 10000, score: healthScore, warnings: [] },
    },
  };
}

describe('multi-pass selection', () => {
  it('creates bounded balanced, cleaner and faithful candidates', () => {
    const candidates = buildCandidateOptions(DEFAULT_OPTIONS.logo);
    expect(candidates.map((item) => item.id)).toEqual(['balanced', 'cleaner', 'faithful']);
    for (const item of candidates) {
      expect(item.options.detail).toBeGreaterThanOrEqual(0);
      expect(item.options.detail).toBeLessThanOrEqual(100);
      expect(item.options.smoothing).toBeGreaterThanOrEqual(0);
      expect(item.options.smoothing).toBeLessThanOrEqual(100);
      expect(item.options.colors).toBeGreaterThanOrEqual(2);
      expect(item.options.colors).toBeLessThanOrEqual(64);
    }
  });

  it('prefers fidelity without ignoring vector health', () => {
    const faithfulButMessy = combineScores(96, 40, 2000);
    const balanced = combineScores(90, 90, 2000);
    expect(balanced).toBeGreaterThan(faithfulButMessy);
  });

  it('applies a bounded penalty to extremely slow candidates', () => {
    const fast = combineScores(90, 90, 3000);
    const slow = combineScores(90, 90, 45000);
    expect(fast).toBeGreaterThan(slow);
    expect(fast - slow).toBeLessThanOrEqual(12);
  });

  it('stops immediately when the balanced result is already excellent', () => {
    expect(shouldStopEarly(candidate(98, 98)).stop).toBe(true);
  });

  it('continues when visual fidelity is not yet strong', () => {
    expect(shouldStopEarly(candidate(80, 98)).stop).toBe(false);
  });

  it('tries cleaner first when fidelity is strong but structure lags', () => {
    const variants = buildCandidateOptions(DEFAULT_OPTIONS.logo).slice(1);
    const ordered = chooseNextVariants(candidate(96, 65), variants);
    expect(ordered[0].id).toBe('cleaner');
  });

  it('tries faithful first when structure is strong but appearance lags', () => {
    const variants = buildCandidateOptions(DEFAULT_OPTIONS.logo).slice(1);
    const ordered = chooseNextVariants(candidate(72, 98), variants);
    expect(ordered[0].id).toBe('faithful');
  });
});
