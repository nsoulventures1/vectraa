import ImageTracer from 'imagetracerjs';
import { assertSafeSvg, inspectSvg } from './quality';
import { clampOptions } from './presets';
import { sanitizeGeneratedSvg } from './sanitizeSvg';
import type { VectorEngine, VectorResult, VectorizeOptions } from './types';
import { validateRasterFileSignature } from './validateInput';

interface Rgb { r: number; g: number; b: number }
interface ReconstructedArtwork { imageData: ImageData; palette: Rgb[] }
interface PreparedImage { imageData: ImageData; traceScale: number; traceColors: number }

export class JsVectorEngine implements VectorEngine {
  readonly id = 'imagetracer-js';

  async vectorize(file: File, rawOptions: VectorizeOptions): Promise<VectorResult> {
    await validateRasterFileSignature(file);
    const options = clampOptions(rawOptions);
    const started = performance.now();
    const decoded = await decodeImage(file);
    const prepared = isFlatArtwork(options)
      ? prepareFlatArtwork(decoded, options)
      : { imageData: decoded, traceScale: 1, traceColors: options.colors };

    const svgRaw = ImageTracer.imagedataToSVG(
      prepared.imageData,
      toTraceOptions(options, prepared.traceScale, prepared.traceColors),
    );
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
  const longest = Math.max(input.width, input.height);
  const factor = longest <= 700 ? 4 : longest <= 1400 ? 3 : 2;
  return {
    imageData: supersampleFlatArtwork(reconstructed.imageData, reconstructed.palette, factor, options),
    traceScale: 1 / factor,
    // ImageTracer counts transparent/background handling separately in some paths;
    // leave one spare slot while keeping the palette tightly bounded.
    traceColors: Math.max(2, Math.min(5, reconstructed.palette.length + 1)),
  };
}

/**
 * Reconstructs intentional flat artwork before tracing. The critical distinction is
 * between real brand colours (for example navy + gold) and JPEG/antialias shades.
 */
function reconstructFlatArtwork(input: ImageData, options: VectorizeOptions): ReconstructedArtwork {
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
    const chromaValue = chroma(pixel);
    const luminanceValue = luminance(pixel);
    const foreground = distance >= distanceThreshold || (chromaValue >= 38 && luminanceValue < 246);
    if (!foreground) continue;
    foregroundMask[p] = 1;
    if (distance >= strongThreshold || chromaValue >= 54) strongPixels.push(pixel);
  }

  cleanMask(foregroundMask, width, height);

  const palette = options.preset === 'logo'
    ? buildAdaptiveBrandPalette(strongPixels, 4)
    : buildAdaptiveBrandPalette(strongPixels, 1);
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

  return { imageData: output, palette };
}

/**
 * Finds a small set of perceptually distinct, statistically meaningful foreground
 * colours. Large nearby JPEG shade clusters collapse together, while a smaller but
 * genuinely different accent colour can survive if it occupies enough artwork.
 */
function buildAdaptiveBrandPalette(pixels: Rgb[], maxColors: number): Rgb[] {
  if (pixels.length === 0) return [];
  if (maxColors <= 1) return [robustMean(pixels)];

  interface Bin { color: Rgb; count: number }
  const bins = new Map<number, { r: number; g: number; b: number; count: number }>();
  const step = Math.max(1, Math.floor(pixels.length / 30000));

  for (let index = 0; index < pixels.length; index += step) {
    const pixel = pixels[index];
    // 4-bit/channel bins suppress compression shades but retain genuine brand hues.
    const key = ((pixel.r >> 4) << 8) | ((pixel.g >> 4) << 4) | (pixel.b >> 4);
    const bin = bins.get(key) ?? { r: 0, g: 0, b: 0, count: 0 };
    bin.r += pixel.r; bin.g += pixel.g; bin.b += pixel.b; bin.count += 1;
    bins.set(key, bin);
  }

  const candidates: Bin[] = [...bins.values()]
    .map((bin) => ({
      count: bin.count,
      color: {
        r: Math.round(bin.r / bin.count),
        g: Math.round(bin.g / bin.count),
        b: Math.round(bin.b / bin.count),
      },
    }))
    .sort((a, b) => b.count - a.count);

  const sampledCount = candidates.reduce((sum, item) => sum + item.count, 0);
  if (!candidates.length) return [];

  const selected: Rgb[] = [candidates[0].color];
  const minimumShare = 0.008; // keep legitimate small accent colours (≈0.8% of ink)
  const minimumDistance = 62;

  while (selected.length < maxColors) {
    let best: Bin | undefined;
    let bestScore = 0;
    for (const candidate of candidates) {
      const share = candidate.count / Math.max(1, sampledCount);
      if (share < minimumShare) continue;
      const minDistance = Math.min(...selected.map((color) => colorDistance(candidate.color, color)));
      if (minDistance < minimumDistance) continue;
      const saturationBonus = 1 + chroma(candidate.color) / 180;
      const distanceBonus = Math.pow(Math.min(1.8, minDistance / 100), 1.4);
      const score = candidate.count * saturationBonus * distanceBonus;
      if (score > bestScore) { best = candidate; bestScore = score; }
    }
    if (!best) break;
    selected.push(best.color);
  }

  // Refine each selected colour with all nearby source pixels, using medians so
  // anti-aliased edge pixels cannot drag brand colours toward grey/white.
  const buckets = selected.map(() => [] as Rgb[]);
  for (let index = 0; index < pixels.length; index += step) {
    const pixel = pixels[index];
    buckets[nearestIndex(pixel, selected)].push(pixel);
  }
  return selected.map((color, index) => buckets[index].length ? robustMean(buckets[index]) : color);
}

function supersampleFlatArtwork(source: ImageData, palette: Rgb[], factor: number, options: VectorizeOptions): ImageData {
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
  context.filter = options.preset === 'signature' ? 'blur(0.28px)' : 'blur(0.42px)';
  context.drawImage(base, 0, 0, canvas.width, canvas.height);
  context.filter = 'none';

  const enlarged = context.getImageData(0, 0, canvas.width, canvas.height);
  const data = enlarged.data;
  const alphaFloor = options.preset === 'signature' ? 78 : 92;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < alphaFloor) {
      data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 0;
    } else {
      // Crucial: resampling must improve geometry only, not invent intermediate
      // colours. Snap every visible supersampled pixel back to a detected brand ink.
      const nearest = nearestColor({ r: data[i], g: data[i + 1], b: data[i + 2] }, palette);
      data[i] = nearest.r; data[i + 1] = nearest.g; data[i + 2] = nearest.b; data[i + 3] = 255;
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

function chroma(pixel: Rgb): number {
  return Math.max(pixel.r, pixel.g, pixel.b) - Math.min(pixel.r, pixel.g, pixel.b);
}

function luminance(pixel: Rgb): number { return 0.2126 * pixel.r + 0.7152 * pixel.g + 0.0722 * pixel.b; }

function median(values: number[]): number {
  const sorted = values.slice().sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function toTraceOptions(options: VectorizeOptions, traceScale = 1, traceColors = options.colors) {
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
    numberofcolors: cleanGeometry ? traceColors : options.colors,
    mincolorratio: cleanGeometry ? 0.006 : 0,
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
