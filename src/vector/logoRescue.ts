import { type Rgb, deltaERgb, estimateCornerBackground, isNearBackground, luminance, readRgb } from './color';
import { learnSeparatedPalette, snapToPalette } from './palette';
import { decodeRaster } from './rasterDecode';
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
 * Logo Rescue rewrites a poor raster before tracing: denoise, a gentle contrast
 * lift, snap to the real inks, and knock out a near-white paper background.
 * The returned file is a new PNG. The original upload is left untouched.
 */
export async function preprocessLogoForRescue(file: File, options: LogoRescueOptions): Promise<File> {
  const decoded = await decodeRaster(file);
  const processed = applyLogoRescue(decoded, options);
  return imageDataToPngFile(processed, file.name);
}

export function applyLogoRescue(source: ImageData, options: LogoRescueOptions): ImageData {
  const denoised = denoise(source, options.denoiseStrength);
  const contrasted = contrastEnds(denoised, options.contrastBoost);
  const background = estimateCornerBackground(contrasted);
  const palette = learnSeparatedPalette(contrasted, options.colorLevels, background);
  const snapped = palette.length ? snapToPalette(contrasted, palette, 12) : contrasted;
  if (!options.removeNearWhiteBackground || luminance(background) < 200) return snapped;
  return knockOutBackground(snapped, background);
}

export function quantizeChannel(value: number, levels: number): number {
  const safeLevels = Math.max(2, Math.min(32, Math.round(levels)));
  const step = 255 / (safeLevels - 1);
  return Math.max(0, Math.min(255, Math.round(Math.round(value / step) * step)));
}

function denoise(source: ImageData, strength: number): ImageData {
  let current = copyImage(source);
  const passes = Math.max(1, Math.min(3, Math.round(strength)));
  for (let pass = 0; pass < passes; pass += 1) current = medianPass(current);
  return current;
}

function medianPass(source: ImageData): ImageData {
  const out = copyImage(source);
  for (let y = 1; y < source.height - 1; y += 1) {
    for (let x = 1; x < source.width - 1; x += 1) {
      const center = readRgb(source, x, y);
      const neighbors = [readRgb(source, x - 1, y), readRgb(source, x + 1, y), readRgb(source, x, y - 1), readRgb(source, x, y + 1)];
      const close = neighbors.filter((color) => deltaERgb(color, center) < 28);
      if (close.length < 3) continue;
      const med = medianRgb(close);
      if (deltaERgb(med, center) > 4) writeRgb(out, x, y, med);
    }
  }
  return out;
}

function contrastEnds(source: ImageData, boost: number): ImageData {
  const out = copyImage(source);
  const amount = Math.max(0, Math.min(1, boost));
  for (let i = 0; i < out.data.length; i += 4) {
    if (out.data[i + 3] < 16) continue;
    out.data[i] = endCurve(out.data[i], amount);
    out.data[i + 1] = endCurve(out.data[i + 1], amount);
    out.data[i + 2] = endCurve(out.data[i + 2], amount);
  }
  return out;
}

function endCurve(value: number, boost: number): number {
  const x = value / 255;
  const y = x + boost * 2.2 * x * (1 - x) * (x - 0.5) * 2;
  return Math.max(0, Math.min(255, Math.round(y * 255)));
}

function knockOutBackground(source: ImageData, background: Rgb): ImageData {
  const out = copyImage(source);
  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const i = (y * source.width + x) * 4;
      if (out.data[i + 3] < 16) continue;
      const color = { r: out.data[i], g: out.data[i + 1], b: out.data[i + 2] };
      const pale = luminance(color) > 246 && deltaERgb(color, { r: 255, g: 255, b: 255 }) < 10;
      if (pale || isNearBackground(color, background)) out.data[i + 3] = 0;
    }
  }
  return out;
}

function copyImage(source: ImageData): ImageData {
  return new ImageData(new Uint8ClampedArray(source.data), source.width, source.height);
}

function writeRgb(image: ImageData, x: number, y: number, color: Rgb): void {
  const i = (y * image.width + x) * 4;
  image.data[i] = color.r;
  image.data[i + 1] = color.g;
  image.data[i + 2] = color.b;
}

function medianRgb(colors: Rgb[]): Rgb {
  const channel = (key: keyof Rgb) => {
    const sorted = colors.map((color) => color[key]).sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };
  return { r: channel('r'), g: channel('g'), b: channel('b') };
}

async function imageDataToPngFile(image: ImageData, name: string): Promise<File> {
  if (typeof document === 'undefined') throw new Error('Logo Rescue needs a browser canvas to rebuild the image.');
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Logo Rescue could not prepare the cleaned image.');
  context.putImageData(image, 0, 0);
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((next) => (next ? resolve(next) : reject(new Error('Logo Rescue could not encode the cleaned image.'))), 'image/png');
  });
  const stem = name.replace(/\.[^.]+$/, '') || 'logo';
  return new File([blob], `${stem}-rescued.png`, { type: 'image/png' });
}
