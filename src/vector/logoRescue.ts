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
    // Ten levels is the conservative logo default: enough to retain antialiased
    // brand accents without creating the colour explosion seen in generic tracing.
    // Truly colour-rich artwork can still receive twelve.
    colorLevels: colorful ? 12 : 10,
  };
}

/**
 * Logo Rescue deliberately does not rewrite the raster. The dedicated logo
 * pipeline consumes the original pixels and applies these decisions while
 * extracting vector layers, avoiding destructive PNG round-trips.
 */
export async function preprocessLogoForRescue(file: File, options: LogoRescueOptions): Promise<File> {
  void options;
  return file;
}

export function quantizeChannel(value: number, levels: number): number {
  const safeLevels = Math.max(2, Math.min(32, Math.round(levels)));
  const step = 255 / (safeLevels - 1);
  return Math.max(0, Math.min(255, Math.round(Math.round(value / step) * step)));
}
