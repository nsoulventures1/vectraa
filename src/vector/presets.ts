import type { VectorPreset, VectorizeOptions } from './types';

export const DEFAULT_OPTIONS: Record<VectorPreset, VectorizeOptions> = {
  // Logos need a balance: enough detail for small text/taglines and thin accent
  // rules, but still enough smoothing to avoid reproducing raster noise.
  logo: { preset: 'logo', detail: 92, smoothing: 8, colors: 8, transparentBackground: true },
  illustration: { preset: 'illustration', detail: 75, smoothing: 45, colors: 24, transparentBackground: true },
  'line-art': { preset: 'line-art', detail: 62, smoothing: 84, colors: 2, transparentBackground: true },
  signature: { preset: 'signature', detail: 50, smoothing: 88, colors: 2, transparentBackground: true },
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
