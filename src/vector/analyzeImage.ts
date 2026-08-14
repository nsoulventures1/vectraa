import type { ImageAnalysis, VectorPreset } from './types';
import { validateRasterFile } from './validateInput';

const SAMPLE_SIZE = 128;

export interface ImageSignals {
  width: number;
  height: number;
  hasAlpha: boolean;
  alphaCoverage: number;
  edgeDensity: number;
  colorComplexity: number;
  lightBackground: number;
  darkInk: number;
  saturation: number;
}

export async function analyzeImage(file: File): Promise<ImageAnalysis> {
  validateRasterFile(file);
  const bitmap = await createImageBitmap(file);

  try {
    const scale = Math.min(1, SAMPLE_SIZE / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Vectraa could not inspect this image.');

    context.drawImage(bitmap, 0, 0, width, height);
    const pixels = context.getImageData(0, 0, width, height).data;
    const signals = measureSignals(pixels, width, height, bitmap.width, bitmap.height);
    const likelyKind = classifyImageSignals(signals);
    const warnings: string[] = [];

    const megapixels = (bitmap.width * bitmap.height) / 1_000_000;
    if (megapixels > 12) warnings.push('Large source image; conversion may take longer.');
    if (signals.colorComplexity > 0.8) warnings.push('Many color transitions detected; expect a larger SVG.');
    if (signals.edgeDensity > 0.42) warnings.push('Very dense detail detected; some simplification may improve editability.');

    return {
      width: bitmap.width,
      height: bitmap.height,
      megapixels,
      hasAlpha: signals.hasAlpha,
      likelyKind,
      confidence: recommendationConfidence(signals, likelyKind),
      signals: {
        edgeDensity: signals.edgeDensity,
        colorComplexity: signals.colorComplexity,
        lightBackground: signals.lightBackground,
        alphaCoverage: signals.alphaCoverage,
      },
      warnings,
    };
  } finally {
    bitmap.close();
  }
}

export function classifyImageSignals(signals: ImageSignals): VectorPreset {
  const { edgeDensity, colorComplexity, lightBackground, darkInk, saturation, alphaCoverage } = signals;

  const signatureLike =
    lightBackground > 0.68 &&
    darkInk > 0.015 && darkInk < 0.32 &&
    colorComplexity < 0.22 &&
    edgeDensity < 0.23;
  if (signatureLike) return 'signature';

  const lineArtLike =
    colorComplexity < 0.28 &&
    edgeDensity >= 0.16 &&
    (lightBackground > 0.5 || alphaCoverage > 0.08) &&
    saturation < 0.26;
  if (lineArtLike) return 'line-art';

  const logoLike =
    colorComplexity < 0.42 &&
    edgeDensity < 0.30 &&
    (saturation > 0.08 || alphaCoverage > 0.04 || lightBackground > 0.35);
  if (logoLike) return 'logo';

  if (colorComplexity > 0.72 || edgeDensity > 0.38) return 'high-detail';
  return 'illustration';
}

export function recommendationConfidence(signals: ImageSignals, preset: VectorPreset): number {
  const margin = preset === 'signature'
    ? (signals.lightBackground - 0.68) + (0.23 - signals.edgeDensity) + (0.22 - signals.colorComplexity)
    : preset === 'line-art'
      ? (signals.edgeDensity - 0.16) + (0.28 - signals.colorComplexity)
      : preset === 'logo'
        ? (0.42 - signals.colorComplexity) + (0.30 - signals.edgeDensity)
        : preset === 'high-detail'
          ? Math.max(signals.colorComplexity - 0.72, signals.edgeDensity - 0.38) * 2
          : 0.22;
  return Math.max(55, Math.min(96, Math.round(68 + margin * 45)));
}

function measureSignals(
  pixels: Uint8ClampedArray,
  sampleWidth: number,
  sampleHeight: number,
  width: number,
  height: number,
): ImageSignals {
  const bins = new Set<number>();
  const gray = new Uint8Array(sampleWidth * sampleHeight);
  let transparent = 0;
  let visible = 0;
  let light = 0;
  let dark = 0;
  let saturated = 0;

  for (let i = 0, p = 0; i < pixels.length; i += 4, p += 1) {
    const r = pixels[i];
    const g = pixels[i + 1];
    const b = pixels[i + 2];
    const a = pixels[i + 3];
    const luminance = Math.round(0.2126 * r + 0.7152 * g + 0.0722 * b);
    gray[p] = luminance;
    if (a < 240) transparent += 1;
    if (a < 24) continue;

    visible += 1;
    if (luminance > 235) light += 1;
    if (luminance < 80) dark += 1;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    if (max - min > 55) saturated += 1;
    bins.add(((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4));
  }

  let edgeCount = 0;
  let comparisons = 0;
  for (let y = 1; y < sampleHeight; y += 1) {
    for (let x = 1; x < sampleWidth; x += 1) {
      const index = y * sampleWidth + x;
      const current = gray[index];
      if (Math.abs(current - gray[index - 1]) > 34) edgeCount += 1;
      if (Math.abs(current - gray[index - sampleWidth]) > 34) edgeCount += 1;
      comparisons += 2;
    }
  }

  const total = sampleWidth * sampleHeight;
  const visibleSafe = Math.max(1, visible);
  return {
    width,
    height,
    hasAlpha: transparent > 0,
    alphaCoverage: transparent / total,
    edgeDensity: comparisons ? edgeCount / comparisons : 0,
    colorComplexity: Math.min(1, bins.size / 96),
    lightBackground: light / visibleSafe,
    darkInk: dark / visibleSafe,
    saturation: saturated / visibleSafe,
  };
}
