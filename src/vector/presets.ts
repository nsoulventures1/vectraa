import type { VectorPreset, VectorizeOptions } from './types';

export const DEFAULT_OPTIONS: Record<VectorPreset, VectorizeOptions> = {
  // Logo defaults intentionally favour geometry over raster fidelity. Scanned marks
  // often contain hundreds of JPEG/antialias shades that are not real design colours;
  // two trace colours (ink + background/alpha) keeps seals and wordmarks coherent.
  // Lower detail plus stronger smoothing also prevents thousands of microscopic paths.
  logo: { preset: 'logo', detail: 35, smoothing: 90, colors: 2, transparentBackground: true },
  illustration: { preset: 'illustration', detail: 75, smoothing: 45, colors: 24, transparentBackground: true },
  'line-art': { preset: 'line-art', detail: 58, smoothing: 88, colors: 2, transparentBackground: true },
  signature: { preset: 'signature', detail: 46, smoothing: 90, colors: 2, transparentBackground: true },
  'high-detail': { preset: 'high-detail', detail: 92, smoothing: 30, colors: 48, transparentBackground: false }
};

export function clampOptions(options: VectorizeOptions): VectorizeOptions {
  return {
    ...options,
    detail: Math.max(0, Math.min(100, options.detail)),
    smoothing: Math.max(0, Math.min(100, options.smoothing)),
    colors: Math.max(2, Math.min(64, Math.round(options.colors)))
  };
}
