import ImageTracer from 'imagetracerjs';
import { assertSafeSvg, inspectSvg } from './quality';
import { vectorizeLogoHighFidelity } from './LogoVectorPipeline';
import { clampOptions } from './presets';
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
    const decoded = await decodeImage(file);

    if (options.preset === 'logo') {
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
    }

    const prepared = prepareGenericArtwork(decoded, options);
    const traced = ImageTracer.imagedataToSVG(prepared.imageData, toTraceOptions(options, prepared.scale));
    const svg = assertSafeSvg(sanitizeGeneratedSvg(traced));
    return { svg, elapsedMs: Math.round(performance.now() - started), quality: inspectSvg(svg) };
  }
}

async function decodeImage(file: File): Promise<ImageData> {
  // createImageBitmap is fast but Chrome can intermittently reject freshly generated
  // canvas PNG Files. Fall back to the browser's HTMLImageElement decoder instead of
  // aborting a valid Logo Rescue conversion.
  try {
    const bitmap = await createImageBitmap(file);
    try {
      return renderDrawable(bitmap, bitmap.width, bitmap.height);
    } finally {
      bitmap.close();
    }
  } catch (bitmapError) {
    try {
      return await decodeWithHtmlImage(file);
    } catch (imageError) {
      const bitmapMessage = bitmapError instanceof Error ? bitmapError.message : 'createImageBitmap failed';
      const imageMessage = imageError instanceof Error ? imageError.message : 'HTML image decode failed';
      throw new Error(`The source image could not be decoded (${bitmapMessage}; fallback: ${imageMessage}).`);
    }
  }
}

function renderDrawable(source: CanvasImageSource, sourceWidth: number, sourceHeight: number): ImageData {
  const maxDimension = 3000;
  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Vectraa could not prepare the image for tracing.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(source, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}

async function decodeWithHtmlImage(file: File): Promise<ImageData> {
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.decoding = 'sync';
    image.src = url;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('browser image decoder rejected the generated raster'));
    });
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) throw new Error('decoded image has zero dimensions');
    return renderDrawable(image, width, height);
  } finally {
    URL.revokeObjectURL(url);
  }
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
