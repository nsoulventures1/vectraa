import ImageTracer from 'imagetracerjs';
import type { VectorQuality, VectorizeOptions } from './types';
import { inspectSvg } from './quality';

interface Rgb { r: number; g: number; b: number }
interface Lab { l: number; a: number; b: number }
interface PaletteColor { rgb: Rgb; lab: Lab; count: number }
interface Component { pixels: number[]; minX: number; minY: number; maxX: number; maxY: number; area: number }
interface LayerSplit { macro: Uint8Array; micro: Component[] }

export interface LogoPipelineResult {
  svg: string;
  quality: VectorQuality;
  palette: Rgb[];
}

/**
 * Dedicated logo pipeline.
 *
 * Brand colours are learned from source pixels and then frozen. Geometry is traced
 * from binary masks so ImageTracer cannot re-quantise those colours. Small connected
 * components are traced independently inside tight local canvases; this is important
 * for fine typography because a 5px trademark or thin tagline letter should not be
 * simplified using tolerances derived from a 1254px-wide logo canvas.
 */
export async function vectorizeLogoHighFidelity(source: ImageData, options: VectorizeOptions): Promise<LogoPipelineResult> {
  const background = estimateBackground(source);
  const foreground = buildForegroundMask(source, background);
  cleanSpeckles(foreground, source.width, source.height);

  const interior = erodeMask(foreground, source.width, source.height, 1);
  const palette = extractPaletteLab(source, interior, foreground, Math.max(2, Math.min(8, options.colors || 6)));
  if (!palette.length) palette.push({ rgb: { r: 20, g: 42, b: 82 }, lab: rgbToLab({ r: 20, g: 42, b: 82 }), count: 1 });

  const labels = assignPixelsToPalette(source, foreground, palette, background);
  const layerMasks = palette.map((_, index) => makeLayerMask(labels, index, source.width, source.height));
  for (const mask of layerMasks) preserveAndCleanLayer(mask, source.width, source.height);

  const paths: string[] = [];
  for (let index = 0; index < palette.length; index += 1) {
    const mask = layerMasks[index];
    if (!hasForeground(mask)) continue;

    const split = splitMacroAndMicro(mask, source.width, source.height);
    if (hasForeground(split.macro)) {
      paths.push(...traceBinaryLayer(split.macro, source.width, source.height, palette[index].rgb, options, false));
    }
    for (const component of split.micro) {
      paths.push(...traceMicroComponent(component, source.width, palette[index].rgb, options));
    }
  }

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${source.width} ${source.height}" width="${source.width}" height="${source.height}">${paths.join('')}</svg>`;
  const structural = inspectSvg(svg);
  const fidelity = await measureFidelity(source, svg, background, palette.map((p) => p.rgb));
  const warnings = [...structural.warnings, ...fidelity.warnings];
  const score = Math.max(0, Math.min(structural.score, fidelity.score));

  return { svg, palette: palette.map((p) => p.rgb), quality: { ...structural, score, warnings } };
}

function buildForegroundMask(source: ImageData, background: Rgb): Uint8Array {
  const mask = new Uint8Array(source.width * source.height);
  const bgLab = rgbToLab(background);
  const bgLum = luminance(background);
  const noise = estimateBackgroundNoise(source, background);
  const deltaThreshold = Math.max(5.5, Math.min(20, noise.deltaE95 + 2.5));
  const darkerThreshold = Math.max(8, Math.min(22, noise.luma95 + 3));
  for (let p = 0, i = 0; p < mask.length; p += 1, i += 4) {
    if (source.data[i + 3] < 10) continue;
    const rgb = { r: source.data[i], g: source.data[i + 1], b: source.data[i + 2] };
    const hsv = rgbToHsv(rgb);
    const delta = deltaE76(rgbToLab(rgb), bgLab);
    const darker = bgLum - luminance(rgb);
    const chromaticInk = hsv.s >= 0.07 && delta >= Math.max(4.5, deltaThreshold * 0.65);
    if (delta >= deltaThreshold || darker >= darkerThreshold || chromaticInk) mask[p] = 1;
  }
  return mask;
}

function estimateBackgroundNoise(source: ImageData, background: Rgb): { deltaE95: number; luma95: number } {
  const bgLab = rgbToLab(background);
  const bgLum = luminance(background);
  const deltas: number[] = [];
  const lumas: number[] = [];
  const band = Math.max(2, Math.round(Math.min(source.width, source.height) * 0.05));
  const sx = Math.max(1, Math.floor(source.width / 100));
  const sy = Math.max(1, Math.floor(source.height / 100));
  for (let y = 0; y < source.height; y += sy) for (let x = 0; x < source.width; x += sx) {
    if (x >= band && x < source.width - band && y >= band && y < source.height - band) continue;
    const i = (y * source.width + x) * 4;
    if (source.data[i + 3] < 20) continue;
    const rgb = { r: source.data[i], g: source.data[i + 1], b: source.data[i + 2] };
    deltas.push(deltaE76(rgbToLab(rgb), bgLab));
    lumas.push(Math.abs(luminance(rgb) - bgLum));
  }
  return { deltaE95: percentile(deltas, 0.95), luma95: percentile(lumas, 0.95) };
}

function extractPaletteLab(source: ImageData, interiorMask: Uint8Array, fallbackMask: Uint8Array, maxColors: number): PaletteColor[] {
  const samples = collectSamples(source, hasEnough(interiorMask, 30) ? interiorMask : fallbackMask, 70000);
  if (!samples.length) return [];

  const k = Math.max(2, Math.min(maxColors, 7, samples.length));
  let centres = initialiseKmeansPlusPlus(samples, k);
  let assignments: Int16Array<ArrayBufferLike> = new Int16Array(samples.length);
  for (let iteration = 0; iteration < 15; iteration += 1) {
    assignments = assignLabs(samples.map((s) => s.lab), centres);
    const next = recomputeCentres(samples, assignments, centres.length);
    if (centresConverged(centres, next)) { centres = next; break; }
    centres = next;
  }

  const clusters: PaletteColor[] = [];
  for (let c = 0; c < centres.length; c += 1) {
    const members = samples.filter((_, index) => assignments[index] === c);
    if (!members.length) continue;
    if (members.length / samples.length < 0.0008) continue;
    const rgb = exactRepresentativeRgb(members.map((m) => m.rgb));
    const hsv = rgbToHsv(rgb);
    if (hsv.v > 0.965 && hsv.s < 0.08) continue;
    clusters.push({ rgb, lab: rgbToLab(rgb), count: members.length });
  }

  clusters.sort((a, b) => b.count - a.count);
  const merged: PaletteColor[] = [];
  for (const cluster of clusters) {
    const existing = merged.find((candidate) => deltaE76(candidate.lab, cluster.lab) < 7.0);
    if (existing) {
      if (cluster.count > existing.count) { existing.rgb = cluster.rgb; existing.lab = cluster.lab; }
      existing.count += cluster.count;
    } else merged.push({ ...cluster });
  }

  return merged.filter((candidate, index, list) => {
    const hsv = rgbToHsv(candidate.rgb);
    if (hsv.s >= 0.18) return true;
    return !list.some((other, j) => {
      if (j === index) return false;
      const oh = rgbToHsv(other.rgb);
      return oh.s > hsv.s + 0.28 && deltaE76(candidate.lab, other.lab) < 18;
    });
  }).slice(0, maxColors);
}

function assignPixelsToPalette(source: ImageData, foreground: Uint8Array, palette: PaletteColor[], background: Rgb): Int16Array {
  const labels = new Int16Array(foreground.length); labels.fill(-1);
  const bgLab = rgbToLab(background);
  for (let p = 0, i = 0; p < foreground.length; p += 1, i += 4) {
    if (!foreground[p]) continue;
    const rgb = { r: source.data[i], g: source.data[i + 1], b: source.data[i + 2] };
    const lab = rgbToLab(rgb);
    let best = 0; let bestD = Infinity;
    for (let c = 0; c < palette.length; c += 1) {
      const d = deltaE76(lab, palette[c].lab);
      if (d < bestD) { bestD = d; best = c; }
    }
    const bgD = deltaE76(lab, bgLab);
    if (bgD + 1.5 < bestD && bestD > 12) continue;
    labels[p] = best;
  }
  return labels;
}

function makeLayerMask(labels: Int16Array, layer: number, width: number, height: number): Uint8Array {
  const mask = new Uint8Array(width * height);
  for (let i = 0; i < labels.length; i += 1) if (labels[i] === layer) mask[i] = 1;
  return mask;
}

function preserveAndCleanLayer(mask: Uint8Array, width: number, height: number): void {
  const copy = mask.slice();
  for (let y = 1; y < height - 1; y += 1) for (let x = 1; x < width - 1; x += 1) {
    const p = y * width + x;
    if (copy[p]) continue;
    let neighbours = 0;
    for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) if (dx || dy) neighbours += copy[(y + dy) * width + x + dx];
    if (neighbours >= 7) mask[p] = 1;
  }
  removeComponentsSmallerThan(mask, width, height, 2);
}

function splitMacroAndMicro(mask: Uint8Array, width: number, height: number): LayerSplit {
  const macro = new Uint8Array(mask.length);
  const micro: Component[] = [];
  const visited = new Uint8Array(mask.length);
  const queue = new Int32Array(mask.length);
  const imageArea = width * height;
  const maxMicroArea = Math.max(12, imageArea * 0.0045);
  const maxMicroWidth = Math.max(4, width * 0.14);
  const maxMicroHeight = Math.max(4, height * 0.085);

  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    let head = 0, tail = 0;
    queue[tail++] = start; visited[start] = 1;
    const pixels: number[] = [];
    let minX = width, minY = height, maxX = 0, maxY = 0;

    while (head < tail) {
      const p = queue[head++];
      pixels.push(p);
      const x = p % width, y = Math.floor(p / width);
      if (x < minX) minX = x; if (x > maxX) maxX = x;
      if (y < minY) minY = y; if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        if (!dx && !dy) continue;
        const nx = x + dx, ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const np = ny * width + nx;
        if (!mask[np] || visited[np]) continue;
        visited[np] = 1; queue[tail++] = np;
      }
    }

    const boxWidth = maxX - minX + 1;
    const boxHeight = maxY - minY + 1;
    const area = pixels.length;
    const isMicro = area <= maxMicroArea || boxWidth <= maxMicroWidth || boxHeight <= maxMicroHeight;
    if (isMicro) micro.push({ pixels, minX, minY, maxX, maxY, area });
    else for (const p of pixels) macro[p] = 1;
  }

  return { macro, micro };
}

/**
 * Trace a fine connected component in its own padded local coordinate system.
 * Local tracing is the key detail: a 20x8 tagline glyph is no longer simplified
 * as though it lived on a 1254x1254 canvas. The resulting path is translated back
 * into the original logo coordinate system and remains independently editable.
 */
function traceMicroComponent(component: Component, sourceWidth: number, color: Rgb, options: VectorizeOptions): string[] {
  const padding = 3;
  const originX = Math.max(0, component.minX - padding);
  const originY = Math.max(0, component.minY - padding);
  const localWidth = component.maxX - component.minX + 1 + padding * 2;
  const localHeight = component.maxY - component.minY + 1 + padding * 2;
  const image = new ImageData(localWidth, localHeight);
  const data = image.data;

  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 255;
  }
  for (const p of component.pixels) {
    const x = p % sourceWidth;
    const y = Math.floor(p / sourceWidth);
    const lx = x - originX;
    const ly = y - originY;
    if (lx < 0 || ly < 0 || lx >= localWidth || ly >= localHeight) continue;
    const i = (ly * localWidth + lx) * 4;
    data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255;
  }

  const detail = Math.max(0.94, options.detail / 100);
  const traceOptions = {
    ltres: Math.max(0.035, 0.12 - detail * 0.075),
    qtres: Math.max(0.05, 0.17 - detail * 0.11),
    pathomit: 0,
    rightangleenhance: true,
    colorsampling: 0,
    numberofcolors: 2,
    mincolorratio: 0,
    colorquantcycles: 1,
    layering: 0,
    strokewidth: 0,
    linefilter: false,
    scale: 1,
    roundcoords: 7,
    viewbox: true,
    desc: false,
    blurradius: 0,
    blurdelta: 0,
  } as Parameters<typeof ImageTracer.imagedataToSVG>[1];

  const traced = ImageTracer.imagedataToSVG(image, traceOptions);
  const tags = extractColoredPaths(traced, color);
  return tags.map((tag) => `<g transform="translate(${originX} ${originY})">${tag}</g>`);
}

function traceBinaryLayer(mask: Uint8Array, width: number, height: number, color: Rgb, options: VectorizeOptions, micro: boolean): string[] {
  const image = new ImageData(width, height);
  const data = image.data;
  for (let p = 0, i = 0; p < mask.length; p += 1, i += 4) {
    if (mask[p]) { data[i] = 0; data[i + 1] = 0; data[i + 2] = 0; data[i + 3] = 255; }
    else { data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 255; }
  }
  const detail = options.detail / 100;
  const traceOptions = {
    ltres: micro ? Math.max(0.055, 0.19 - detail * 0.10) : Math.max(0.12, 0.55 - detail * 0.32),
    qtres: micro ? Math.max(0.075, 0.26 - detail * 0.14) : Math.max(0.18, 0.72 - detail * 0.40),
    pathomit: 0,
    rightangleenhance: true,
    colorsampling: 0,
    numberofcolors: 2,
    mincolorratio: 0,
    colorquantcycles: 1,
    layering: 0,
    strokewidth: 0,
    linefilter: false,
    scale: 1,
    roundcoords: micro ? 6 : 5,
    viewbox: true,
    desc: false,
    blurradius: 0,
    blurdelta: 0,
  } as Parameters<typeof ImageTracer.imagedataToSVG>[1];
  const traced = ImageTracer.imagedataToSVG(image, traceOptions);
  return extractColoredPaths(traced, color);
}

function extractColoredPaths(svg: string, color: Rgb): string[] {
  const tags = svg.match(/<path\b[^>]*\/>|<path\b[^>]*>[\s\S]*?<\/path>/g) ?? [];
  const retained: string[] = [];
  for (const tag of tags) {
    const fill = tag.match(/fill="rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)"/);
    if (!fill) continue;
    const r = Number(fill[1]), g = Number(fill[2]), b = Number(fill[3]);
    if (r > 220 && g > 220 && b > 220) continue;
    retained.push(tag.replace(/fill="rgb\([^\"]+\)"/, `fill="rgb(${color.r},${color.g},${color.b})"`));
  }
  return retained;
}

async function measureFidelity(source: ImageData, svg: string, background: Rgb, palette: Rgb[]): Promise<{ score: number; warnings: string[] }> {
  const warnings: string[] = [];
  const maxSide = 512;
  const scale = Math.min(1, maxSide / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const original = document.createElement('canvas'); original.width = width; original.height = height;
  const oc = original.getContext('2d', { willReadFrequently: true });
  if (!oc) return { score: 70, warnings: ['Could not perform raster fidelity verification.'] };
  const sourceCanvas = document.createElement('canvas'); sourceCanvas.width = source.width; sourceCanvas.height = source.height;
  sourceCanvas.getContext('2d')?.putImageData(source, 0, 0);
  oc.drawImage(sourceCanvas, 0, 0, width, height);
  const originalData = oc.getImageData(0, 0, width, height);

  const vectorCanvas = document.createElement('canvas'); vectorCanvas.width = width; vectorCanvas.height = height;
  const vc = vectorCanvas.getContext('2d', { willReadFrequently: true });
  if (!vc) return { score: 70, warnings: ['Could not perform SVG fidelity verification.'] };
  vc.fillStyle = `rgb(${background.r},${background.g},${background.b})`; vc.fillRect(0, 0, width, height);
  const blob = new Blob([svg], { type: 'image/svg+xml' });
  const bitmap = await createImageBitmap(blob);
  vc.drawImage(bitmap, 0, 0, width, height); bitmap.close();
  const vectorData = vc.getImageData(0, 0, width, height);

  const bgLab = rgbToLab(background);
  let intersection = 0, union = 0, colorError = 0, colorSamples = 0;
  for (let i = 0; i < originalData.data.length; i += 4) {
    const a = { r: originalData.data[i], g: originalData.data[i + 1], b: originalData.data[i + 2] };
    const b = { r: vectorData.data[i], g: vectorData.data[i + 1], b: vectorData.data[i + 2] };
    const af = deltaE76(rgbToLab(a), bgLab) > 7;
    const bf = deltaE76(rgbToLab(b), bgLab) > 7;
    if (af || bf) union += 1;
    if (af && bf) intersection += 1;
    if (af && bf) { colorError += nearestPaletteDelta(a, b, palette); colorSamples += 1; }
  }
  const iou = union ? intersection / union : 1;
  const meanDelta = colorSamples ? colorError / colorSamples : 0;
  if (iou < 0.94) warnings.push(`Structural match is ${(iou * 100).toFixed(1)}%; fine geometry may differ from the source.`);
  if (meanDelta > 4) warnings.push(`Mean colour difference is ΔE ${meanDelta.toFixed(1)}; brand colours still need improvement.`);
  const score = Math.round(Math.max(0, Math.min(100, iou * 72 + Math.max(0, 28 - meanDelta * 2.8))));
  return { score, warnings };
}

function nearestPaletteDelta(source: Rgb, output: Rgb, palette: Rgb[]): number {
  let nearest = palette[0]; let best = Infinity;
  const sourceLab = rgbToLab(source);
  for (const color of palette) { const d = deltaE76(sourceLab, rgbToLab(color)); if (d < best) { best = d; nearest = color; } }
  return deltaE76(rgbToLab(nearest), rgbToLab(output));
}

function collectSamples(source: ImageData, mask: Uint8Array, limit: number): Array<{ rgb: Rgb; lab: Lab }> {
  const count = mask.reduce((sum, v) => sum + v, 0);
  const step = Math.max(1, Math.floor(count / limit));
  const out: Array<{ rgb: Rgb; lab: Lab }> = []; let seen = 0;
  for (let p = 0, i = 0; p < mask.length; p += 1, i += 4) {
    if (!mask[p]) continue;
    if ((seen++ % step) !== 0) continue;
    const rgb = { r: source.data[i], g: source.data[i + 1], b: source.data[i + 2] };
    out.push({ rgb, lab: rgbToLab(rgb) });
  }
  return out;
}

function initialiseKmeansPlusPlus(samples: Array<{ rgb: Rgb; lab: Lab }>, k: number): Lab[] {
  const centres: Lab[] = [samples[Math.floor(samples.length / 2)].lab];
  while (centres.length < k) {
    let bestSample = samples[0].lab; let bestDistance = -1;
    for (const sample of samples) {
      const nearest = Math.min(...centres.map((c) => deltaE76(sample.lab, c)));
      if (nearest > bestDistance) { bestDistance = nearest; bestSample = sample.lab; }
    }
    centres.push({ ...bestSample });
  }
  return centres;
}

function assignLabs(samples: Lab[], centres: Lab[]): Int16Array {
  const assignments = new Int16Array(samples.length);
  samples.forEach((sample, index) => { let best = 0, distance = Infinity; centres.forEach((centre, c) => { const d = deltaE76(sample, centre); if (d < distance) { distance = d; best = c; } }); assignments[index] = best; });
  return assignments;
}

function recomputeCentres(samples: Array<{ rgb: Rgb; lab: Lab }>, assignments: Int16Array, k: number): Lab[] {
  const sums = Array.from({ length: k }, () => ({ l: 0, a: 0, b: 0, n: 0 }));
  samples.forEach((sample, index) => { const s = sums[assignments[index]]; s.l += sample.lab.l; s.a += sample.lab.a; s.b += sample.lab.b; s.n += 1; });
  return sums.map((s) => s.n ? { l: s.l / s.n, a: s.a / s.n, b: s.b / s.n } : { l: 0, a: 0, b: 0 });
}
function centresConverged(a: Lab[], b: Lab[]): boolean { return a.every((centre, index) => deltaE76(centre, b[index]) < 0.25); }

function exactRepresentativeRgb(colors: Rgb[]): Rgb {
  const bins = new Map<number, Rgb[]>();
  for (const color of colors) {
    const key = ((color.r >> 2) << 12) | ((color.g >> 2) << 6) | (color.b >> 2);
    const bucket = bins.get(key) ?? []; bucket.push(color); bins.set(key, bucket);
  }
  const winner = [...bins.values()].sort((a, b) => b.length - a.length)[0] ?? colors;
  return { r: Math.round(median(winner.map((c) => c.r))), g: Math.round(median(winner.map((c) => c.g))), b: Math.round(median(winner.map((c) => c.b))) };
}

function estimateBackground(source: ImageData): Rgb {
  const colors: Rgb[] = []; const band = Math.max(2, Math.round(Math.min(source.width, source.height) * 0.05));
  const sx = Math.max(1, Math.floor(source.width / 90)), sy = Math.max(1, Math.floor(source.height / 90));
  for (let y = 0; y < source.height; y += sy) for (let x = 0; x < source.width; x += sx) {
    if (x >= band && x < source.width - band && y >= band && y < source.height - band) continue;
    const i = (y * source.width + x) * 4; if (source.data[i + 3] < 20) continue;
    colors.push({ r: source.data[i], g: source.data[i + 1], b: source.data[i + 2] });
  }
  return colors.length ? exactRepresentativeRgb(colors) : { r: 255, g: 255, b: 255 };
}

function erodeMask(mask: Uint8Array, width: number, height: number, radius: number): Uint8Array {
  const out = new Uint8Array(mask.length);
  for (let y = radius; y < height - radius; y += 1) for (let x = radius; x < width - radius; x += 1) {
    let keep = 1;
    for (let dy = -radius; dy <= radius && keep; dy += 1) for (let dx = -radius; dx <= radius; dx += 1) if (!mask[(y + dy) * width + x + dx]) { keep = 0; break; }
    out[y * width + x] = keep;
  }
  return out;
}

function cleanSpeckles(mask: Uint8Array, width: number, height: number): void {
  // Scale the speckle floor with the canvas. A two-pixel fragment on a 3000px
  // source is background noise, while genuine trademark dots and tagline glyphs
  // remain comfortably above this conservative threshold.
  removeComponentsSmallerThan(mask, width, height, Math.max(2, Math.round((width * height) / 450_000)));
}
function removeComponentsSmallerThan(mask: Uint8Array, width: number, height: number, minimum: number): void {
  const visited = new Uint8Array(mask.length); const queue = new Int32Array(mask.length);
  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || visited[start]) continue;
    let head = 0, tail = 0; queue[tail++] = start; visited[start] = 1; const component: number[] = [];
    while (head < tail) {
      const p = queue[head++]; component.push(p); const x = p % width, y = Math.floor(p / width);
      for (let dy = -1; dy <= 1; dy += 1) for (let dx = -1; dx <= 1; dx += 1) {
        if (!dx && !dy) continue; const nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
        const np = ny * width + nx; if (!mask[np] || visited[np]) continue; visited[np] = 1; queue[tail++] = np;
      }
    }
    if (component.length < minimum) component.forEach((p) => { mask[p] = 0; });
  }
}
function hasForeground(mask: Uint8Array): boolean { return mask.some((v) => v === 1); }
function hasEnough(mask: Uint8Array, minimum: number): boolean { let n = 0; for (const value of mask) if (value && ++n >= minimum) return true; return false; }
function luminance(p: Rgb): number { return 0.2126 * p.r + 0.7152 * p.g + 0.0722 * p.b; }
function median(values: number[]): number { const s = values.slice().sort((a, b) => a - b), m = Math.floor(s.length / 2); return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2; }
function percentile(values: number[], quantile: number): number {
  if (!values.length) return 0;
  const sorted = values.slice().sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * quantile)))];
}
function deltaE76(a: Lab, b: Lab): number { return Math.hypot(a.l - b.l, a.a - b.a, a.b - b.b); }
function rgbToHsv(p: Rgb): { h: number; s: number; v: number } { const r = p.r / 255, g = p.g / 255, b = p.b / 255, max = Math.max(r, g, b), min = Math.min(r, g, b), d = max - min; let h = 0; if (d) { if (max === r) h = 60 * (((g - b) / d) % 6); else if (max === g) h = 60 * ((b - r) / d + 2); else h = 60 * ((r - g) / d + 4); } if (h < 0) h += 360; return { h, s: max === 0 ? 0 : d / max, v: max }; }
function rgbToLab(rgb: Rgb): Lab {
  const linear = [rgb.r, rgb.g, rgb.b].map((value) => { const v = value / 255; return v <= 0.04045 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  const x = (linear[0] * 0.4124 + linear[1] * 0.3576 + linear[2] * 0.1805) / 0.95047;
  const y = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  const z = (linear[0] * 0.0193 + linear[1] * 0.1192 + linear[2] * 0.9505) / 1.08883;
  const f = (v: number) => v > 0.008856 ? Math.cbrt(v) : 7.787 * v + 16 / 116;
  const fx = f(x), fy = f(y), fz = f(z);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}
