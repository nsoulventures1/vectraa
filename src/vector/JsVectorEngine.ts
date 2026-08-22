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
    // Analysis and conversion consume the exact same cached pixel snapshot.
    const decoded = await decodeRaster(file);

    if (options.preset === 'logo') {
      try {
        const result = await vectorizeLogoHighFidelity(decoded, options);
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
        // The high-fidelity pipeline performs an internal raster check of its generated
        // SVG. Chromium can reject createImageBitmap(svgBlob) with
        // "The source image could not be decoded" even though the SVG itself is valid.
        // A verification/rendering failure must never discard a successfully decoded
        // source image or leave the user with no vector. Fall back to the proven generic
        // tracer for this pass while keeping the failure visible as a quality warning.
        const fallback = traceGeneric(decoded, options);
        const svg = assertSafeSvg(sanitizeGeneratedSvg(fallback));
        const structural = inspectSvg(svg);
        const reason = error instanceof Error ? error.message : 'high-fidelity logo verification failed';
        return {
          svg,
          elapsedMs: Math.round(performance.now() - started),
          quality: {
            ...structural,
            score: Math.min(structural.score, 82),
            warnings: [...new Set([...structural.warnings, `Logo fidelity verification was unavailable (${reason}); a safe fallback trace was returned.`])],
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
