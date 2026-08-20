import ImageTracer from 'imagetracerjs';
import { assertSafeSvg, inspectSvg } from './quality';
import { clampOptions } from './presets';
import { sanitizeGeneratedSvg } from './sanitizeSvg';
import type { VectorEngine, VectorResult, VectorizeOptions } from './types';
import { validateRasterFileSignature } from './validateInput';

interface Rgb { r: number; g: number; b: number }
interface PreparedImage { imageData: ImageData; traceScale: number }

export class JsVectorEngine implements VectorEngine {
  readonly id = 'imagetracer-js';

  async vectorize(file: File, rawOptions: VectorizeOptions): Promise<VectorResult> {
    await validateRasterFileSignature(file);
    const options = clampOptions(rawOptions);
    const started = performance.now();
    const decoded = await decodeImage(file);
    const prepared = isFlatArtwork(options)
      ? prepareFlatArtwork(decoded, options)
      : { imageData: decoded, traceScale: 1 };

    const svgRaw = ImageTracer.imagedataToSVG(prepared.imageData, toTraceOptions(options, prepared.traceScale));
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
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, width, height);
    return context.getImageData(0, 0, width, height);
  } finally {
    bitmap.close();
  }
}

function isFlatArtwork(options: VectorizeOptions): boolean {
  return options.preset === 'logo' || options.preset === 'line-art' || options.preset === 'signature';
}

function prepareFlatArtwork(input: ImageData, options: VectorizeOptions): PreparedImage {
  const reconstructed = reconstructFlatArtwork(input, options);
  // Low-resolution logos are where ordinary tracers become visibly polygonal.
  // Trace a high-quality supersampled mask, then scale vector coordinates back to
  // the source size. This gives the curve fitter 3–4x more edge samples without
  // inventing extra colours or pixel noise.
  const longest = Math.max(input.width, input.height);
  const factor = longest <= 700 ? 4 : longest <= 1400 ? 3 : 2;
  return {
    imageData: supersampleFlatArtwork(reconstructed, factor, options),
    traceScale: 1 / factor,
  };
}

/**
 * Converts noisy raster brand art into a small set of intentional flat colours
 * before path tracing. This deliberately removes page/background shades and JPEG
 * anti-alias colours instead of asking the tracer to vectorize every pixel shade.
 */
function reconstructFlatArtwork(input: ImageData, options: VectorizeOptions): ImageData {
  const { width, height } = input;
  const source = input.data;
  const background = estimateBackground(source, width, height);
  const distanceThreshold = options.preset === 'signature' ? 28 : options.preset === 'line-art' ? 30 : 32;
  const strongThreshold = distanceThreshold + 18;

  const foregroundMask = new Uint8Array(width * height);
  const strongPixels: Rgb[] = [];

  for (let p = 0, i = 0; p < foregroundMask.length; p += 1, i += 4) {
    const a = source[i + 3];
    if (a < 16) continue;
    const pixel = { r: source[i], g: source[i + 1], b: source[i + 2] };
    const distance = colorDistance(pixel, background);
    const chroma = Math.max(pixel.r, pixel.g, pixel.b) - Math.min(pixel.r, pixel.g, pixel.b);
    const luminanceValue = luminance(pixel);
    const foreground = distance >= distanceThreshold || (chroma >= 38 && luminanceValue < 246);
    if (!foreground) continue;
    foregroundMask[p] = 1;
    if (distance >= strongThreshold || chroma >= 54) strongPixels.push(pixel);
  }

  cleanMask(foregroundMask, width, height);

  const requestedPalette = options.preset === 'logo' ? Math.min(4, Math.max(1, options.colors)) : 1;
  const palette = buildPalette(strongPixels, requestedPalette);
  if (palette.length === 0) palette.push({ r: 32, g: 52, b: 96 });

  const output = new ImageData(width, height);
  const data = output.data;
  for (let p = 0, i = 0; p < foregroundMask.length; p += 1, i += 4) {
    if (!foregroundMask[p]) {
      data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 0;
      continue;
    }
    const pixel = { r: source[i], g: source[i + 1], b: source[i + 2] };
    const nearest = nearestColor(pixel, palette);
    data[i] = nearest.r; data[i + 1] = nearest.g; data[i + 2] = nearest.b; data[i + 3] = 255;
  }

  return output;
}

function supersampleFlatArtwork(source: ImageData, factor: number, options: VectorizeOptions): ImageData {
  if (factor <= 1) return source;

  const base = document.createElement('canvas');
  base.width = source.width;
  base.height = source.height;
  const baseContext = base.getContext('2d');
  if (!baseContext) return source;
  baseContext.putImageData(source, 0, 0);

  const canvas = document.createElement('canvas');
  canvas.width = source.width * factor;
  canvas.height = source.height * factor;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) return source;
  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  // A tiny blur after bicubic-style canvas interpolation rounds stair-step edges,
  // especially circular seals. It is deliberately weaker for signatures so thin
  // pen strokes are not swallowed.
  context.filter = options.preset === 'signature' ? 'blur(0.35px)' : 'blur(0.55px)';
  context.drawImage(base, 0, 0, canvas.width, canvas.height);
  context.filter = 'none';

  const enlarged = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = enlarged.data;
  // Convert interpolation halos back to hard vector-ready coverage while retaining
  // subpixel edge placement from supersampling.
  const alphaFloor = options.preset === 'signature' ? 82 : 96;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < alphaFloor) {
      data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 0;
    } else {
      data[i + 3] = 255;
    }
  }
  return enlarged;
}

function estimateBackground(data: Uint8ClampedArray, width: number, height: number): Rgb {
  const samples: Rgb[] = [];
  const band = Math.max(1, Math.round(Math.min(width, height) * 0.035));
  const stepX = Math.max(1, Math.floor(width / 80));
  const stepY = Math.max(1, Math.floor(height / 80));

  for (let y = 0; y < height; y += stepY) {
    for (let x = 0; x < width; x += stepX) {
      if (x >= band && x < width - band && y >= band && y < height - band) continue;
      const i = (y * width + x) * 4;
      if (data[i + 3] < 32) continue;
      samples.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
    }
  }

  if (samples.length === 0) return { r: 255, g: 255, b: 255 };
  samples.sort((a, b) => luminance(b) - luminance(a));
  const brightest = samples.slice(0, Math.max(4, Math.floor(samples.length * 0.65)));
  return {
    r: Math.round(median(brightest.map((p) => p.r))),
    g: Math.round(median(brightest.map((p) => p.g))),
    b: Math.round(median(brightest.map((p) => p.b))),
  };
}

function cleanMask(mask: Uint8Array, width: number, height: number): void {
  const first = mask.slice();
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const p = y * width + x;
      let neighbours = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          neighbours += first[(y + dy) * width + (x + dx)];
        }
      }
      if (first[p] && neighbours <= 1) mask[p] = 0;
      else if (!first[p] && neighbours >= 7) mask[p] = 1;
    }
  }
  removeTinyComponents(mask, width, height, 5);
}

function removeTinyComponents(mask: Uint8Array, width: number, height: number, minimumSize: number): void {
  const visited = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    let head = 0, tail = 0;
    queue[tail++] = start;
    visited[start] = 1;
    const component: number[] = [];
    while (head < tail) {
      const p = queue[head++];
      component.push(p);
      const x = p % width;
      const y = Math.floor(p / width);
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          const nx = x + dx, ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const np = ny * width + nx;
          if (!mask[np] || visited[np]) continue;
          visited[np] = 1;
          queue[tail++] = np;
        }
      }
    }
    if (component.length < minimumSize) for (const p of component) mask[p] = 0;
  }
}

function buildPalette(pixels: Rgb[], requested: number): Rgb[] {
  if (pixels.length === 0) return [];
  const sampleStep = Math.max(1, Math.floor(pixels.length / 5000));
  const sampled = pixels.filter((_, index) => index % sampleStep === 0);
  if (requested <= 1) return [robustMean(sampled)];

  const luminanceSorted = sampled.slice().sort((a, b) => luminance(a) - luminance(b));
  let centres: Rgb[] = [];
  for (let k = 0; k < requested; k += 1) {
    const index = Math.min(luminanceSorted.length - 1, Math.round(((k + 0.5) / requested) * (luminanceSorted.length - 1)));
    centres.push({ ...luminanceSorted[index] });
  }
  for (let iteration = 0; iteration < 7; iteration += 1) {
    const buckets = centres.map(() => [] as Rgb[]);
    for (const pixel of sampled) buckets[nearestIndex(pixel, centres)].push(pixel);
    centres = centres.map((centre, index) => buckets[index].length ? robustMean(buckets[index]) : centre);
  }

  const merged: Rgb[] = [];
  for (const centre of centres) {
    const existing = merged.find((candidate) => colorDistance(candidate, centre) < 48);
    if (!existing) merged.push(centre);
    else {
      existing.r = Math.round((existing.r + centre.r) / 2);
      existing.g = Math.round((existing.g + centre.g) / 2);
      existing.b = Math.round((existing.b + centre.b) / 2);
    }
  }
  return merged.slice(0, requested);
}

function robustMean(pixels: Rgb[]): Rgb {
  if (pixels.length === 0) return { r: 0, g: 0, b: 0 };
  return {
    r: Math.round(median(pixels.map((p) => p.r))),
    g: Math.round(median(pixels.map((p) => p.g))),
    b: Math.round(median(pixels.map((p) => p.b))),
  };
}

function nearestColor(pixel: Rgb, palette: Rgb[]): Rgb { return palette[nearestIndex(pixel, palette)]; }

function nearestIndex(pixel: Rgb, palette: Rgb[]): number {
  let best = 0;
  let bestDistance = Number.POSITIVE_INFINITY;
  for (let i = 0; i < palette.length; i += 1) {
    const distance = colorDistance(pixel, palette[i]);
    if (distance < bestDistance) { bestDistance = distance; best = i; }
  }
  return best;
}

function colorDistance(a: Rgb, b: Rgb): number {
  const dr = a.r - b.r, dg = a.g - b.g, db = a.b - b.b;
  return Math.sqrt(dr * dr * 0.9 + dg * dg * 1.25 + db * db * 0.75);
}

function luminance(pixel: Rgb): number { return 0.2126 * pixel.r + 0.7152 * pixel.g + 0.0722 * pixel.b; }

function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function toTraceOptions(options: VectorizeOptions, traceScale = 1) {
  const detail = options.detail / 100;
  const smoothing = options.smoothing / 100;
  const cleanGeometry = isFlatArtwork(options);
  const traceTolerance = cleanGeometry
    ? Math.max(0.8, 2.25 - detail * 1.15)
    : Math.max(0.18, 2.2 - detail * 1.9);

  return {
    ltres: traceTolerance,
    qtres: traceTolerance,
    pathomit: cleanGeometry ? Math.max(5, Math.round((1 - detail) * 14)) : Math.max(0, Math.round((1 - detail) * 12)),
    rightangleenhance: options.preset === 'logo' || options.preset === 'line-art',
    colorsampling: 0,
    numberofcolors: cleanGeometry ? Math.min(options.colors, options.preset === 'logo' ? 4 : 2) : options.colors,
    mincolorratio: cleanGeometry ? 0.012 : 0,
    colorquantcycles: cleanGeometry ? 2 : options.colors <= 4 ? 2 : 3,
    layering: 0,
    strokewidth: 0,
    linefilter: cleanGeometry || smoothing > 0.65,
    scale: traceScale,
    roundcoords: cleanGeometry ? 2 : detail > 0.8 ? 2 : 1,
    viewbox: true,
    desc: false,
    blurradius: 0,
    blurdelta: cleanGeometry ? 42 : 20,
  };
}
