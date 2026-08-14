import { assessVectorResult } from './benchmark';
import { compareRasterToSvg, type FidelityResult } from './fidelity';
import type { VectorEngine, VectorPreset, VectorResult, VectorizeOptions } from './types';

export interface MultiPassCandidate {
  id: string;
  options: VectorizeOptions;
  result: VectorResult;
  fidelity: FidelityResult | null;
  combinedScore: number;
}

export interface MultiPassResult {
  best: MultiPassCandidate;
  candidates: MultiPassCandidate[];
}

export async function vectorizeBestOf(
  engine: VectorEngine,
  file: File,
  base: VectorizeOptions,
  maxCandidates = 3,
): Promise<MultiPassResult> {
  const variants = buildCandidateOptions(base).slice(0, Math.max(1, maxCandidates));
  const candidates: MultiPassCandidate[] = [];

  for (const variant of variants) {
    const result = await engine.vectorize(file, variant.options);
    let fidelity: FidelityResult | null = null;
    try {
      fidelity = await compareRasterToSvg(file, result.svg);
    } catch {
      fidelity = null;
    }
    const health = assessVectorResult(result).overallScore;
    const combinedScore = combineScores(fidelity?.score ?? null, health, result.elapsedMs);
    candidates.push({ ...variant, result, fidelity, combinedScore });
  }

  candidates.sort((a, b) => b.combinedScore - a.combinedScore);
  return { best: candidates[0], candidates };
}

export function buildCandidateOptions(base: VectorizeOptions): Array<{ id: string; options: VectorizeOptions }> {
  const profile = profileFor(base.preset);
  return [
    { id: 'balanced', options: base },
    {
      id: 'cleaner',
      options: {
        ...base,
        detail: clamp(base.detail + profile.cleanerDetail),
        smoothing: clamp(base.smoothing + profile.cleanerSmoothing),
        colors: clampColors(base.colors + profile.cleanerColors),
      },
    },
    {
      id: 'faithful',
      options: {
        ...base,
        detail: clamp(base.detail + profile.faithfulDetail),
        smoothing: clamp(base.smoothing + profile.faithfulSmoothing),
        colors: clampColors(base.colors + profile.faithfulColors),
      },
    },
  ];
}

export function combineScores(fidelity: number | null, health: number, elapsedMs: number): number {
  const visual = fidelity ?? Math.min(88, health);
  const speedPenalty = elapsedMs > 20_000 ? Math.min(12, Math.round((elapsedMs - 20_000) / 5_000) * 2) : 0;
  return Math.max(0, Math.round(visual * 0.66 + health * 0.34 - speedPenalty));
}

function profileFor(preset: VectorPreset) {
  switch (preset) {
    case 'signature':
      return { cleanerDetail: -10, cleanerSmoothing: 8, cleanerColors: 0, faithfulDetail: 10, faithfulSmoothing: -8, faithfulColors: 0 };
    case 'line-art':
      return { cleanerDetail: -8, cleanerSmoothing: 8, cleanerColors: 0, faithfulDetail: 12, faithfulSmoothing: -10, faithfulColors: 0 };
    case 'logo':
      return { cleanerDetail: -10, cleanerSmoothing: 8, cleanerColors: -2, faithfulDetail: 12, faithfulSmoothing: -8, faithfulColors: 4 };
    case 'illustration':
      return { cleanerDetail: -8, cleanerSmoothing: 6, cleanerColors: -6, faithfulDetail: 10, faithfulSmoothing: -6, faithfulColors: 8 };
    case 'high-detail':
      return { cleanerDetail: -12, cleanerSmoothing: 8, cleanerColors: -12, faithfulDetail: 5, faithfulSmoothing: -4, faithfulColors: 8 };
  }
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function clampColors(value: number): number {
  return Math.max(2, Math.min(64, Math.round(value)));
}
