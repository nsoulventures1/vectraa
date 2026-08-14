import type { VectorPreset, VectorQuality, VectorResult } from './types';

export interface BenchmarkCase {
  id: string;
  label: string;
  expectedPreset: VectorPreset;
  notes: string;
}

export interface BenchmarkAssessment {
  qualityScore: number;
  complexityScore: number;
  sizeScore: number;
  speedScore: number;
  overallScore: number;
  warnings: string[];
}

export function assessVectorResult(result: VectorResult): BenchmarkAssessment {
  const warnings = [...result.quality.warnings];
  const qualityScore = result.quality.validSvg ? result.quality.score : 0;
  const complexityScore = scoreComplexity(result.quality);
  const sizeScore = scoreSize(result.quality.bytes);
  const speedScore = scoreSpeed(result.elapsedMs);

  if (complexityScore < 60) warnings.push('Vector structure is overly complex for convenient editing.');
  if (sizeScore < 60) warnings.push('SVG output is large and may benefit from further simplification.');
  if (speedScore < 50) warnings.push('Conversion is slow enough to affect user experience.');

  const overallScore = Math.round(
    qualityScore * 0.45 +
    complexityScore * 0.25 +
    sizeScore * 0.15 +
    speedScore * 0.15,
  );

  return { qualityScore, complexityScore, sizeScore, speedScore, overallScore, warnings };
}

export function scoreComplexity(quality: VectorQuality): number {
  if (!quality.validSvg) return 0;
  let score = 100;
  if (quality.paths > 300) score -= Math.min(35, Math.round((quality.paths - 300) / 30));
  if (quality.nodesApprox > 3500) score -= Math.min(45, Math.round((quality.nodesApprox - 3500) / 300));
  return Math.max(0, score);
}

export function scoreSize(bytes: number): number {
  if (bytes <= 250_000) return 100;
  if (bytes <= 750_000) return 85;
  if (bytes <= 1_500_000) return 70;
  if (bytes <= 3_000_000) return 50;
  if (bytes <= 5_000_000) return 30;
  return 10;
}

export function scoreSpeed(elapsedMs: number): number {
  if (elapsedMs <= 1_500) return 100;
  if (elapsedMs <= 4_000) return 90;
  if (elapsedMs <= 8_000) return 75;
  if (elapsedMs <= 15_000) return 55;
  if (elapsedMs <= 30_000) return 35;
  return 15;
}
