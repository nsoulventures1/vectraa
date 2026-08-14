import type { VectorPreset, VectorizeOptions } from './types';

export const DEFAULT_OPTIONS: Record<VectorPreset, VectorizeOptions> = {
  logo: { preset: 'logo', detail: 55, smoothing: 70, colors: 8, transparentBackground: true },
  illustration: { preset: 'illustration', detail: 75, smoothing: 45, colors: 24, transparentBackground: true },
  'line-art': { preset: 'line-art', detail: 65, smoothing: 80, colors: 2, transparentBackground: true },
  signature: { preset: 'signature', detail: 50, smoothing: 85, colors: 2, transparentBackground: true },
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
