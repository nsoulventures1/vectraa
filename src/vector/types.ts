export type VectorPreset = 'logo' | 'illustration' | 'line-art' | 'signature' | 'high-detail';

export interface VectorizeOptions {
  preset: VectorPreset;
  detail: number;
  smoothing: number;
  colors: number;
  transparentBackground: boolean;
}

export interface ImageAnalysis {
  width: number;
  height: number;
  megapixels: number;
  hasAlpha: boolean;
  likelyKind: VectorPreset;
  confidence: number;
  signals: {
    edgeDensity: number;
    colorComplexity: number;
    lightBackground: number;
    alphaCoverage: number;
  };
  warnings: string[];
}

export interface VectorQuality {
  validSvg: boolean;
  paths: number;
  nodesApprox: number;
  bytes: number;
  score: number;
  warnings: string[];
}

export interface VectorResult {
  svg: string;
  quality: VectorQuality;
  elapsedMs: number;
}

export interface VectorEngine {
  readonly id: string;
  vectorize(file: File, options: VectorizeOptions): Promise<VectorResult>;
}
