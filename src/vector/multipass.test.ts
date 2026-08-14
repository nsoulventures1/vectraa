import { describe, expect, it } from 'vitest';
import { buildCandidateOptions, combineScores } from './multipass';
import { DEFAULT_OPTIONS } from './presets';

describe('multi-pass selection', () => {
  it('creates bounded balanced, cleaner and faithful candidates', () => {
    const candidates = buildCandidateOptions(DEFAULT_OPTIONS.logo);
    expect(candidates.map((item) => item.id)).toEqual(['balanced', 'cleaner', 'faithful']);
    for (const candidate of candidates) {
      expect(candidate.options.detail).toBeGreaterThanOrEqual(0);
      expect(candidate.options.detail).toBeLessThanOrEqual(100);
      expect(candidate.options.smoothing).toBeGreaterThanOrEqual(0);
      expect(candidate.options.smoothing).toBeLessThanOrEqual(100);
      expect(candidate.options.colors).toBeGreaterThanOrEqual(2);
      expect(candidate.options.colors).toBeLessThanOrEqual(64);
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
});
