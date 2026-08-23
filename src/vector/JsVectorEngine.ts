import ImageTracer from 'imagetracerjs';
import { assertSafeSvg, inspectSvg } from './quality';
import { vectorizeLogoHighFidelity } from './LogoVectorPipeline';
import { clampOptions } from './presets';
import { decodeRaster } from './rasterDecode';
import { sanitizeGeneratedSvg } from './sanitizeSvg';
import type { VectorEngine, VectorResult, VectorizeOptions } from './types';
import { validateRasterFileSignature } from './validateInput';

interface Rgb { r: number; g: number; b: number }
interface PreparedLogo { imageData: ImageData; denoised: boolean; consolidated: boolean; dominantColors: number }

/** Browser vector engine. */
export class JsVectorEngine implements VectorEngine {
  readonly id = 'imagetracer-js';

  async vectorize(file: File, rawOptions: VectorizeOptions): Promise<VectorResult> {
    await validateRasterFileSignature(file);
    const options = clampOptions(rawOptions);
    const started = performance.now();
    const decoded = await decodeRaster(file);

    if (options.preset === 'logo') {
      try {
        const precisionOptions = logoPrecisionOptions(options);
        const preparedLogo = prepareLogoArtwork(decoded);
        const result = await withSvgBitmapFallback(() => vectorizeLogoHighFidelity(preparedLogo.imageData, precisionOptions));
        const svg = assertSafeSvg(sanitizeGeneratedSvg(result.svg));
        const structural = inspectSvg(svg);
        const adaptiveWarnings: string[] = [];
        if (preparedLogo.denoised) adaptiveWarnings.push('Adaptive logo cleanup removed low-amplitude raster noise while protecting strong edges.');
        if (preparedLogo.consolidated) adaptiveWarnings.push(`Flat-logo mode consolidated raster shades into ${preparedLogo.dominantColors} dominant source colours before tracing.`);
        return {
          svg,
          elapsedMs: Math.round(performance.now() - started),
          quality: {
            ...structural,
            score: Math.min(structural.score, result.quality.score),
            warnings: [...new Set([...structural.warnings, ...result.quality.warnings, ...adaptiveWarnings])],
          },
        };
      } catch (error) {
        const fallback = traceGeneric(decoded, options);
        const svg = assertSafeSvg(sanitizeGeneratedSvg(fallback));
        const structural = inspectSvg(svg);
        const reason = error instanceof Error ? error.message : 'high-fidelity logo pipeline failed';
        return {
          svg,
          elapsedMs: Math.round(performance.now() - started),
          quality: {
            ...structural,
            score: Math.min(structural.score, 82),
            warnings: [...new Set([...structural.warnings, `High-fidelity logo tracing failed (${reason}); a safe fallback trace was returned.`])],
          },
        };
      }
    }

    const prepared = prepareGenericArtwork(decoded, options);
    const traced = ImageTracer.imagedataToSVG(prepared.imageData, toTraceOptions(options, prepared.scale));
    const svg = assertSafeSvg(sanitizeGeneratedSvg(traced));
    return { svg, elapsedMs: Math.round(performance.now() - started), quality: inspectSvg(svg) };
  }
}

function logoPrecisionOptions(options: VectorizeOptions): VectorizeOptions {
  return { ...options, detail: Math.max(options.detail, 94) };
}

/**
 * Adaptive logo preparation.
 *
 * 1) Clean masters stay untouched.
 * 2) Noisy/scanned/JPEG artwork receives edge-aware denoising.
 * 3) If that noisy image is statistically a flat logo, near-duplicate raster shades
 *    are collapsed into a small set of dominant source colours before vector tracing.
 *
 * The third stage is deliberately gated behind the noise test, so clean masters such
 * as NSOUL keep their exact source pixels and are not re-quantised.
 */
function prepareLogoArtwork(input: ImageData): PreparedLogo {
  const noise = estimateLogoNoise(input);
  if (noise < 0.085) return { imageData: input, denoised: false, consolidated: false, dominantColors: 0 };

  const denoised = edgeAwareDenoise(input);
  const flat = analyseFlatLogo(denoised);
  if (!flat.isFlat) return { imageData: denoised, denoised: true, consolidated: false, dominantColors: 0 };

  const consolidated = consolidateFlatLogoColors(denoised, flat.colors);
  return { imageData: consolidated, denoised: true, consolidated: true, dominantColors: flat.colors.length };
}

function edgeAwareDenoise(input: ImageData): ImageData {
  const out = new ImageData(new Uint8ClampedArray(input.data), input.width, input.height);
  const src = input.data;
  const dst = out.data;
  const width = input.width;
  const height = input.height;

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const p = (y * width + x) * 4;
      if (src[p + 3] < 16) continue;
      const centreR = src[p], centreG = src[p + 1], centreB = src[p + 2];
      let sumR = 0, sumG = 0, sumB = 0, weightSum = 0, nearCount = 0;

      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          const q = ((y + dy) * width + x + dx) * 4;
          if (src[q + 3] < 16) continue;
          const distance = Math.hypot(src[q] - centreR, src[q + 1] - centreG, src[q + 2] - centreB);
          if (distance > 34) continue;
          const weight = distance < 10 ? 4 : distance < 20 ? 2 : 1;
          sumR += src[q] * weight; sumG += src[q + 1] * weight; sumB += src[q + 2] * weight;
          weightSum += weight; nearCount += 1;
        }
      }

      if (nearCount >= 5 && weightSum > 0) {
        const avgR = sumR / weightSum, avgG = sumG / weightSum, avgB = sumB / weightSum;
        if (Math.hypot(avgR - centreR, avgG - centreG, avgB - centreB) <= 15) {
          dst[p] = Math.round(avgR); dst[p + 1] = Math.round(avgG); dst[p + 2] = Math.round(avgB);
        }
      }
    }
  }
  return out;
}

/**
 * Identify noisy artwork whose visual intent is nevertheless a small flat palette.
 * Pixels are grouped into coarse 4-bit RGB bins. We select the smallest set of dominant
 * bins (2-5 colours) covering at least 88% of opaque pixels. A photographic/tonal logo
 * normally fails this coverage test, while a blue/gold/black crest passes it.
 */
function analyseFlatLogo(input: ImageData): { isFlat: boolean; colors: Rgb[] } {
  const bins = new Map<number, { count: number; r: number; g: number; b: number }>();
  let total = 0;
  const step = Math.max(1, Math.floor(Math.max(input.width, input.height) / 650));

  for (let y = 0; y < input.height; y += step) {
    for (let x = 0; x < input.width; x += step) {
      const p = (y * input.width + x) * 4;
      if (input.data[p + 3] < 24) continue;
      const r = input.data[p], g = input.data[p + 1], b = input.data[p + 2];
      const key = ((r >> 4) << 8) | ((g >> 4) << 4) | (b >> 4);
      const bin = bins.get(key) ?? { count: 0, r: 0, g: 0, b: 0 };
      bin.count += 1; bin.r += r; bin.g += g; bin.b += b; bins.set(key, bin); total += 1;
    }
  }
  if (!total) return { isFlat: false, colors: [] };

  const ranked = [...bins.values()]
    .sort((a, b) => b.count - a.count)
    .map((bin) => ({ count: bin.count, color: { r: Math.round(bin.r / bin.count), g: Math.round(bin.g / bin.count), b: Math.round(bin.b / bin.count) } }));

  const selected: Rgb[] = [];
  let covered = 0;
  for (const entry of ranked) {
    // Avoid selecting multiple quantisation bins that are merely anti-aliased shades
    // of one intended colour.
    const duplicate = selected.some((color) => rgbDistance(color, entry.color) < 38);
    if (!duplicate) selected.push(entry.color);
    covered += entry.count;
    if (selected.length >= 2 && covered / total >= 0.88) break;
    if (selected.length >= 5) break;
  }

  const topCoverage = ranked.slice(0, 8).reduce((sum, item) => sum + item.count, 0) / total;
  const isFlat = selected.length >= 2 && selected.length <= 5 && covered / total >= 0.82 && topCoverage >= 0.90;
  return { isFlat, colors: isFlat ? selected : [] };
}

/**
 * Collapse JPEG ringing and shade variants onto the detected dominant source colours.
 * We only snap pixels reasonably close to a dominant colour; genuinely exceptional
 * colours remain available to the downstream palette extractor, protecting small
 * accents that are not compression artefacts.
 */
function consolidateFlatLogoColors(input: ImageData, colors: Rgb[]): ImageData {
  const out = new ImageData(new Uint8ClampedArray(input.data), input.width, input.height);
  for (let p = 0; p < out.data.length; p += 4) {
    if (out.data[p + 3] < 24) continue;
    const source = { r: out.data[p], g: out.data[p + 1], b: out.data[p + 2] };
    let nearest = colors[0];
    let distance = Infinity;
    for (const color of colors) {
      const d = rgbDistance(source, color);
      if (d < distance) { distance = d; nearest = color; }
    }
    // 78 RGB units is wide enough to absorb JPEG ringing/anti-alias shades but narrow
    // enough that genuinely distinct small accent colours are not forcibly destroyed.
    if (distance <= 78) {
      out.data[p] = nearest.r; out.data[p + 1] = nearest.g; out.data[p + 2] = nearest.b;
    }
  }
  return out;
}

function rgbDistance(a: Rgb, b: Rgb): number {
  return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b);
}

function estimateLogoNoise(input: ImageData): number {
  const { width, height, data } = input;
  const step = Math.max(1, Math.floor(Math.max(width, height) / 320));
  let candidates = 0, noisy = 0;

  for (let y = 1; y < height - 1; y += step) {
    for (let x = 1; x < width - 1; x += step) {
      const p = (y * width + x) * 4;
      if (data[p + 3] < 16) continue;
      const neighbours = [p - 4, p + 4, p - width * 4, p + width * 4];
      let minD = Infinity, maxD = 0, meanD = 0;
      for (const q of neighbours) {
        const d = Math.hypot(data[q] - data[p], data[q + 1] - data[p + 1], data[q + 2] - data[p + 2]);
        minD = Math.min(minD, d); maxD = Math.max(maxD, d); meanD += d;
      }
      meanD /= neighbours.length;
      if (maxD < 48 && minD < 28) {
        candidates += 1;
        if (meanD >= 4.5) noisy += 1;
      }
    }
  }
  return candidates ? noisy / candidates : 0;
}

async function withSvgBitmapFallback<T>(work: () => Promise<T>): Promise<T> {
  if (typeof createImageBitmap !== 'function') return work();
  const original = createImageBitmap.bind(globalThis);
  const patched = async (...args: Parameters<typeof createImageBitmap>): Promise<ImageBitmap> => {
    try { return await original(...args); }
    catch (error) {
      const source = args[0];
      if (!(source instanceof Blob) || !source.type.toLowerCase().includes('svg')) throw error;
      const url = URL.createObjectURL(source);
      try {
        const image = await loadImage(url);
        const canvas = document.createElement('canvas');
        canvas.width = Math.max(1, image.naturalWidth || image.width);
        canvas.height = Math.max(1, image.naturalHeight || image.height);
        const context = canvas.getContext('2d');
        if (!context) throw error;
        context.drawImage(image, 0, 0, canvas.width, canvas.height);
        return await original(canvas);
      } finally { URL.revokeObjectURL(url); }
    }
  };

  const holder = globalThis as typeof globalThis & { createImageBitmap: typeof createImageBitmap };
  const previous = holder.createImageBitmap;
  holder.createImageBitmap = patched as typeof createImageBitmap;
  try { return await work(); }
  finally { holder.createImageBitmap = previous; }
}

function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('Generated SVG could not be rasterized for fidelity verification.'));
    image.src = url;
  });
}

function traceGeneric(input: ImageData, options: VectorizeOptions): string {
  const prepared = prepareGenericArtwork(input, options);
  return ImageTracer.imagedataToSVG(prepared.imageData, toTraceOptions(options, prepared.scale));
}

function prepareGenericArtwork(input: ImageData, options: VectorizeOptions): { imageData: ImageData; scale: number } {
  if (options.preset !== 'line-art' && options.preset !== 'signature') return { imageData: input, scale: 1 };
  const longest = Math.max(input.width, input.height);
  const factor = longest <= 900 ? 3 : longest <= 1600 ? 2 : 1;
  if (factor === 1) return { imageData: input, scale: 1 };

  const base = document.createElement('canvas');
  base.width = input.width; base.height = input.height;
  base.getContext('2d')?.putImageData(input, 0, 0);
  const canvas = document.createElement('canvas');
  canvas.width = input.width * factor; canvas.height = input.height * factor;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return { imageData: input, scale: 1 };
  context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
  context.drawImage(base, 0, 0, canvas.width, canvas.height);
  return { imageData: context.getImageData(0, 0, canvas.width, canvas.height), scale: 1 / factor };
}

function toTraceOptions(options: VectorizeOptions, scale: number): Parameters<typeof ImageTracer.imagedataToSVG>[1] {
  const detail = options.detail / 100;
  const clean = options.preset === 'line-art' || options.preset === 'signature';
  const tolerance = clean ? Math.max(0.45, 1.45 - detail) : Math.max(0.18, 2.2 - detail * 1.9);
  return {
    ltres: tolerance,
    qtres: tolerance,
    pathomit: clean ? Math.max(0, Math.round((1 - detail) * 5)) : Math.max(0, Math.round((1 - detail) * 12)),
    rightangleenhance: options.preset === 'line-art',
    colorsampling: 2,
    numberofcolors: options.colors,
    mincolorratio: clean ? 0.001 : 0,
    colorquantcycles: 3,
    layering: 0,
    strokewidth: 0,
    linefilter: clean,
    scale,
    roundcoords: clean ? 4 : 2,
    viewbox: true,
    desc: false,
    blurradius: 0,
    blurdelta: clean ? 18 : 20,
  };
}