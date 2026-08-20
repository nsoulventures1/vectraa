import ImageTracer from 'imagetracerjs';
import { assertSafeSvg, inspectSvg } from './quality';
import { clampOptions } from './presets';
import { sanitizeGeneratedSvg } from './sanitizeSvg';
import type { VectorEngine, VectorResult, VectorizeOptions } from './types';
import { validateRasterFileSignature } from './validateInput';

export class JsVectorEngine implements VectorEngine {
  readonly id = 'imagetracer-js';

  async vectorize(file: File, rawOptions: VectorizeOptions): Promise<VectorResult> {
    await validateRasterFileSignature(file);
    const options = clampOptions(rawOptions);
    const started = performance.now();
    const imageData = await decodeImage(file);
    const svgRaw = ImageTracer.imagedataToSVG(imageData, toTraceOptions(options));
    const svg = assertSafeSvg(sanitizeGeneratedSvg(svgRaw));
    return { svg, elapsedMs: Math.round(performance.now() - started), quality: inspectSvg(svg) };
  }
}

async function decodeImage(file: File): Promise<ImageData> {
  const bitmap = await createImageBitmap(file);
  try {
    const maxDimension = 2200;
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Vectraa could not prepare the image for tracing.');
    context.drawImage(bitmap, 0, 0, width, height);
    return context.getImageData(0, 0, width, height);
  } finally {
    bitmap.close();
  }
}

function toTraceOptions(options: VectorizeOptions) {
  const detail = options.detail / 100;
  const smoothing = options.smoothing / 100;
  return {
    ltres: Math.max(0.15, 2.2 - detail * 1.9),
    qtres: Math.max(0.15, 2.2 - detail * 1.9),
    pathomit: Math.max(0, Math.round((1 - detail) * 12)),
    rightangleenhance: options.preset === 'logo' || options.preset === 'line-art',
    colorsampling: 2,
    numberofcolors: options.colors,
    mincolorratio: 0,
    colorquantcycles: options.colors <= 4 ? 2 : 3,
    layering: 0,
    strokewidth: 0,
    linefilter: smoothing > 0.65,
    scale: 1,
    roundcoords: detail > 0.8 ? 2 : 1,
    viewbox: true,
    desc: false,
    blurradius: smoothing > 0.75 ? 1 : 0,
    blurdelta: 20,
  };
}
