import ImageTracer from 'imagetracerjs';
import { assertSafeSvg, inspectSvg } from './quality';
import { vectorizeLogoHighFidelity } from './LogoVectorPipeline';
import { clampOptions } from './presets';
import { decodeRaster } from './rasterDecode';
import { sanitizeGeneratedSvg } from './sanitizeSvg';
import type { VectorEngine, VectorResult, VectorizeOptions } from './types';
import { validateRasterFileSignature } from './validateInput';

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
        // Keep the proven palette/segmentation pipeline intact, but run logo geometry
        // at a precision floor. This lowers ImageTracer's line/quadratic tolerances in
        // LogoVectorPipeline for tiny type, rules, punctuation and trademark marks
        // without changing the source-derived brand colours.
        const precisionOptions = logoPrecisionOptions(options);

        // The logo pipeline raster-checks its generated SVG. Chromium occasionally
        // rejects SVG Blobs in createImageBitmap even though the SVG is valid. Install
        // a narrow fallback for that verification so we keep the palette-preserving
        // high-fidelity result instead of dropping to the generic colour quantizer.
        const result = await withSvgBitmapFallback(() => vectorizeLogoHighFidelity(decoded, precisionOptions));
        const svg = assertSafeSvg(sanitizeGeneratedSvg(result.svg));
        const structural = inspectSvg(svg);
        return {
          svg,
          elapsedMs: Math.round(performance.now() - started),
          quality: {
            ...structural,
            score: Math.min(structural.score, result.quality.score),
            warnings: [...new Set([...structural.warnings, ...result.quality.warnings])],
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

/**
 * Logos are unusually sensitive to tiny geometric errors: a one-pixel loss can erase
 * a period, thin rule, counter or trademark stroke. The dedicated logo pipeline already
 * removes true speckles and protects colour fidelity, so it is safe to use a much higher
 * tracing-detail floor here than for photographs/illustrations.
 *
 * Deliberately do NOT alter `colors`: palette discovery remains source-driven in
 * LogoVectorPipeline. This isolates the geometry improvement from the colour system that
 * is now producing the correct NSOUL navy/gold separation.
 */
function logoPrecisionOptions(options: VectorizeOptions): VectorizeOptions {
  return {
    ...options,
    detail: Math.max(options.detail, 94),
  };
}

async function withSvgBitmapFallback<T>(work: () => Promise<T>): Promise<T> {
  if (typeof createImageBitmap !== 'function') return work();
  const original = createImageBitmap.bind(globalThis);
  const patched = async (...args: Parameters<typeof createImageBitmap>): Promise<ImageBitmap> => {
    try {
      return await original(...args);
    } catch (error) {
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
      } finally {
        URL.revokeObjectURL(url);
      }
    }
  };

  const holder = globalThis as typeof globalThis & { createImageBitmap: typeof createImageBitmap };
  const previous = holder.createImageBitmap;
  holder.createImageBitmap = patched as typeof createImageBitmap;
  try {
    return await work();
  } finally {
    holder.createImageBitmap = previous;
  }
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
  base.width = input.width;
  base.height = input.height;
  base.getContext('2d')?.putImageData(input, 0, 0);
  const canvas = document.createElement('canvas');
  canvas.width = input.width * factor;
  canvas.height = input.height * factor;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return { imageData: input, scale: 1 };
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
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
