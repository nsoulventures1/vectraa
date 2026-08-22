import type { ImageAnalysis } from './types';

export interface LogoRescueOptions {
  removeNearWhiteBackground: boolean;
  denoiseStrength: number;
  contrastBoost: number;
  colorLevels: number;
}

export const DEFAULT_LOGO_RESCUE: LogoRescueOptions = {
  removeNearWhiteBackground: true,
  denoiseStrength: 1,
  contrastBoost: 0.16,
  colorLevels: 8,
};

export function recommendedLogoRescueOptions(analysis: ImageAnalysis): LogoRescueOptions {
  const noisy = analysis.signals.edgeDensity > 0.24;
  const colorful = analysis.signals.colorComplexity > 0.4;
  return {
    removeNearWhiteBackground: !analysis.hasAlpha && analysis.signals.lightBackground > 0.35,
    denoiseStrength: noisy ? 2 : 1,
    contrastBoost: analysis.signals.lightBackground > 0.55 ? 0.22 : 0.12,
    colorLevels: colorful ? 12 : 6,
  };
}

/**
 * Logo Rescue used to raster-clean the image into a new canvas PNG before tracing.
 * That round-trip caused browser decode failures and, more importantly, altered
 * original brand colours before the high-fidelity logo engine could measure them.
 *
 * The dedicated LogoVectorPipeline now performs background separation, denoising
 * decisions, colour clustering and layer cleanup directly from the ORIGINAL pixels.
 * Therefore rescue must preserve the uploaded source byte-for-byte and let that
 * pipeline do the restoration non-destructively.
 */
export async function preprocessLogoForRescue(file: File, options: LogoRescueOptions): Promise<File> {
  // Keep the API stable for App.tsx while removing the destructive intermediate PNG.
  // Options remain available for future in-pipeline tuning, but are intentionally not
  // baked into the raster before palette extraction.
  void options;
  return file;
}

/** Kept public because tests and future UI controls use the same deterministic quantizer. */
export function quantizeChannel(value: number, levels: number): number {
  const safeLevels = Math.max(2, Math.min(32, Math.round(levels)));
  const step = 255 / (safeLevels - 1);
  return Math.max(0, Math.min(255, Math.round(Math.round(value / step) * step)));
}
