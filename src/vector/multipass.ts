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
  stoppedEarly: boolean;
  stopReason: string | null;
}

export async function vectorizeBestOf(
  engine: VectorEngine,
  file: File,
  base: VectorizeOptions,
  maxCandidates = 3,
): Promise<MultiPassResult> {
  const variants = buildCandidateOptions(base);
  const candidates: MultiPassCandidate[] = [];
  const limit = Math.max(1, Math.min(maxCandidates, variants.length));

  const first = await evaluateCandidate(engine, file, variants[0]);
  candidates.push(first);

  const firstDecision = shouldStopEarly(first);
  if (limit === 1 || firstDecision.stop) {
    return {
      best: first,
      candidates,
      stoppedEarly: firstDecision.stop,
      stopReason: firstDecision.reason,
    };
  }

  const orderedRemaining = chooseNextVariants(first, variants.slice(1));
  for (const variant of orderedRemaining.slice(0, limit - 1)) {
    const candidate = await evaluateCandidate(engine, file, variant);
    candidates.push(candidate);

    const currentBest = pickBest(candidates);
    const decision = shouldStopAfterImprovement(currentBest, candidates.length);
    if (decision.stop) {
      candidates.sort((a, b) => b.combinedScore - a.combinedScore);
      return {
        best: candidates[0],
        candidates,
        stoppedEarly: true,
        stopReason: decision.reason,
      };
    }
  }

  candidates.sort((a, b) => b.combinedScore - a.combinedScore);
  return { best: candidates[0], candidates, stoppedEarly: false, stopReason: null };
}

async function evaluateCandidate(
  engine: VectorEngine,
  file: File,
  variant: { id: string; options: VectorizeOptions },
): Promise<MultiPassCandidate> {
  const result = await engine.vectorize(file, variant.options);
  let fidelity: FidelityResult | null = null;
  try {
    fidelity = await compareRasterToSvg(file, result.svg);
  } catch {
    fidelity = null;
  }
  const health = assessVectorResult(result).overallScore;
  const combinedScore = combineScores(fidelity?.score ?? null, health, result.elapsedMs);
  return { ...variant, result, fidelity, combinedScore };
}

export function shouldStopEarly(candidate: MultiPassCandidate): { stop: boolean; reason: string | null } {
  const health = assessVectorResult(candidate.result).overallScore;
  const fidelity = candidate.fidelity?.score ?? null;

  if (fidelity !== null && fidelity >= 96 && health >= 92 && candidate.combinedScore >= 94) {
    return { stop: true, reason: 'Balanced trace already meets Vectraa’s high-confidence quality target.' };
  }

  if (fidelity === null && health >= 97 && candidate.result.quality.paths <= 120 && candidate.result.elapsedMs <= 2500) {
    return { stop: true, reason: 'Simple vector is structurally excellent and completed very quickly.' };
  }

  return { stop: false, reason: null };
}

export function shouldStopAfterImprovement(best: MultiPassCandidate, evaluatedCount: number): { stop: boolean; reason: string | null } {
  if (evaluatedCount < 2) return { stop: false, reason: null };
  const health = assessVectorResult(best.result).overallScore;
  const fidelity = best.fidelity?.score ?? null;
  if (fidelity !== null && fidelity >= 94 && health >= 88 && best.combinedScore >= 91) {
    return { stop: true, reason: 'A high-quality candidate was found without needing every pass.' };
  }
  return { stop: false, reason: null };
}

export function chooseNextVariants(
  first: MultiPassCandidate,
  remaining: Array<{ id: string; options: VectorizeOptions }>,
): Array<{ id: string; options: VectorizeOptions }> {
  const health = assessVectorResult(first.result).overallScore;
  const fidelity = first.fidelity?.score ?? 85;
  const cleaner = remaining.find((variant) => variant.id === 'cleaner');
  const faithful = remaining.find((variant) => variant.id === 'faithful');

  if (health + 7 < fidelity) return [cleaner, faithful].filter(Boolean) as Array<{ id: string; options: VectorizeOptions }>;
  if (fidelity + 7 < health) return [faithful, cleaner].filter(Boolean) as Array<{ id: string; options: VectorizeOptions }>;
  return remaining;
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

function pickBest(candidates: MultiPassCandidate[]): MultiPassCandidate {
  return candidates.reduce((best, candidate) => candidate.combinedScore > best.combinedScore ? candidate : best);
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
