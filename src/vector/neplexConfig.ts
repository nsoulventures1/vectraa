import type { VectorizeOptions } from './types';

export type NeplexConfig = {
  binary: boolean;
  colorPrecision: number;
  filterSpeckle: number;
  spliceThreshold: number;
  cornerThreshold: number;
  cutout: boolean;
  polygon: boolean;
  layerDifference: number;
  lengthThreshold: number;
  maxIterations: number;
  pathPrecision: number;
};

export function toNeplexConfig(options: VectorizeOptions): NeplexConfig {
  const detail = options.detail / 100;
  const smoothing = options.smoothing / 100;
  const binary = options.preset === 'line-art' || options.preset === 'signature';

  return {
    binary,
    colorPrecision: binary ? 8 : Math.max(3, Math.min(8, Math.round(3 + detail * 5))),
    filterSpeckle: Math.max(1, Math.round(8 - detail * 6)),
    spliceThreshold: Math.round(25 + smoothing * 45),
    cornerThreshold: Math.round(35 + smoothing * 40),
    cutout: options.transparentBackground || options.preset === 'logo',
    polygon: false,
    layerDifference: binary ? 16 : Math.max(2, Math.round(12 - Math.min(options.colors, 48) / 5)),
    lengthThreshold: Math.max(2, Math.round(8 - detail * 5)),
    maxIterations: detail > 0.8 ? 4 : detail > 0.55 ? 3 : 2,
    pathPrecision: detail > 0.8 ? 5 : 4,
  };
}
