import {
  type Rgb,
  clampByte,
  deltaERgb,
  estimateCornerBackground,
  isNearBackground,
  luminance,
  rgbCss,
  rgbToHsv,
} from './color';

interface Bin {
  r: number;
  g: number;
  b: number;
  n: number;
}

/**
 * Learn a logo/illustration palette without folding distinct inks together.
 *
 * JPEG noise and antialiased halos of the *same* ink sit within about ΔE 9.
 * A near-black wordmark and a dark brand green can share a hue and still be
 * ~30 ΔE apart — those stay as separate colours unless the caller asked for
 * fewer colours than the artwork actually contains.
 */
export function learnSeparatedPalette(source: ImageData, maxColors: number, background = estimateCornerBackground(source)): Rgb[] {
  const budget = Math.max(2, Math.min(32, Math.round(maxColors)));
  const bins = new Map<number, Bin>();
  let samples = 0;

  for (let y = 0; y < source.height; y += 1) {
    for (let x = 0; x < source.width; x += 1) {
      const i = (y * source.width + x) * 4;
      if (source.data[i + 3] < 16) continue;
      const color = { r: source.data[i], g: source.data[i + 1], b: source.data[i + 2] };
      if (!isPaletteSample(source, x, y, color, background)) continue;
      const key = ((color.r >> 3) << 10) | ((color.g >> 3) << 5) | (color.b >> 3);
      const bin = bins.get(key);
      if (bin) {
        bin.r += color.r;
        bin.g += color.g;
        bin.b += color.b;
        bin.n += 1;
      } else {
        bins.set(key, { r: color.r, g: color.g, b: color.b, n: 1 });
      }
      samples += 1;
    }
  }

  if (!samples) return [];

  const minimum = Math.max(8, Math.round(samples * 0.002));
  let clusters: Bin[] = [...bins.values()]
    .filter((bin) => bin.n >= minimum)
    .map((bin) => ({ ...bin }));

  if (!clusters.length) clusters = [...bins.values()].sort((a, b) => b.n - a.n).slice(0, budget);

  clusters = mergeClosest(clusters, 9);
  clusters = clusters.filter((cluster) => {
    const color = mean(cluster);
    if (isNearBackground(color, background)) return false;
    const hsv = rgbToHsv(color);
    if (hsv.v > 0.97 && hsv.s < 0.08) return false;
    return true;
  });
  clusters = dropFringe(clusters);
  clusters = mergeToBudget(clusters, budget);
  clusters.sort((a, b) => b.n - a.n);
  return clusters.map((cluster) => mean(cluster));
}

export function paletteCss(colors: Rgb[]): string[] {
  return colors.map((color) => rgbCss(color));
}

/** Snap pixels that already sit near a learned ink. Far pixels are left alone. */
export function snapToPalette(source: ImageData, palette: Rgb[], maxDistance = 12): ImageData {
  if (!palette.length) return source;
  const out = new ImageData(new Uint8ClampedArray(source.data), source.width, source.height);
  for (let i = 0; i < out.data.length; i += 4) {
    if (out.data[i + 3] < 16) continue;
    const color = { r: out.data[i], g: out.data[i + 1], b: out.data[i + 2] };
    let best = palette[0];
    let bestDistance = deltaERgb(color, best);
    for (let index = 1; index < palette.length; index += 1) {
      const distance = deltaERgb(color, palette[index]);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = palette[index];
      }
    }
    if (bestDistance <= maxDistance) {
      out.data[i] = best.r;
      out.data[i + 1] = best.g;
      out.data[i + 2] = best.b;
    }
  }
  return out;
}

function isPaletteSample(source: ImageData, x: number, y: number, color: Rgb, background: Rgb): boolean {
  if (isNearBackground(color, background)) return false;
  let similar = 0;
  let darker = 0;
  let seen = 0;
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
    const nx = x + dx;
    const ny = y + dy;
    if (nx < 0 || ny < 0 || nx >= source.width || ny >= source.height) continue;
    const ni = (ny * source.width + nx) * 4;
    if (source.data[ni + 3] < 16) continue;
    seen += 1;
    const neighbor = { r: source.data[ni], g: source.data[ni + 1], b: source.data[ni + 2] };
    if (deltaERgb(color, neighbor) < 14) similar += 1;
    if (luminance(color) <= luminance(neighbor) + 3) darker += 1;
  }
  if (similar >= 2) return true;
  // One-pixel letter stems have no similar neighbour. Keep the dark core.
  return seen > 0 && similar === 0 && darker >= Math.min(3, seen) && luminance(color) < 150;
}

function mean(bin: Bin): Rgb {
  return {
    r: clampByte(bin.r / bin.n),
    g: clampByte(bin.g / bin.n),
    b: clampByte(bin.b / bin.n),
  };
}

function mergeClosest(clusters: Bin[], maxDistance: number): Bin[] {
  const next = clusters.map((cluster) => ({ ...cluster }));
  let guard = next.length;
  while (next.length > 1 && guard > 0) {
    guard -= 1;
    const pair = closestPair(next);
    if (!pair || pair.distance >= maxDistance) break;
    combine(next, pair.i, pair.j);
  }
  return next;
}

function mergeToBudget(clusters: Bin[], budget: number): Bin[] {
  const next = clusters.map((cluster) => ({ ...cluster }));
  while (next.length > budget) {
    const pair = closestPair(next);
    if (!pair) break;
    // Keep two substantial, clearly different inks even if that exceeds the
    // requested count. The slider still merges near shades and tiny fringes.
    const smaller = Math.min(next[pair.i].n, next[pair.j].n);
    const total = next.reduce((sum, cluster) => sum + cluster.n, 0);
    if (pair.distance > 16 && smaller / total > 0.04) break;
    combine(next, pair.i, pair.j);
  }
  return next;
}

function dropFringe(clusters: Bin[]): Bin[] {
  const total = clusters.reduce((sum, cluster) => sum + cluster.n, 0) || 1;
  return clusters.filter((cluster) => {
    if (cluster.n / total >= 0.025) return true;
    const color = mean(cluster);
    return !clusters.some((other) => other !== cluster && other.n > cluster.n * 4 && deltaERgb(color, mean(other)) < 16);
  });
}

function closestPair(clusters: Bin[]): { i: number; j: number; distance: number } | null {
  let best: { i: number; j: number; distance: number } | null = null;
  for (let i = 0; i < clusters.length; i += 1) {
    for (let j = i + 1; j < clusters.length; j += 1) {
      const distance = deltaERgb(mean(clusters[i]), mean(clusters[j]));
      if (!best || distance < best.distance) best = { i, j, distance };
    }
  }
  return best;
}

function combine(clusters: Bin[], i: number, j: number): void {
  const a = clusters[i];
  const b = clusters[j];
  clusters[i] = { r: a.r + b.r, g: a.g + b.g, b: a.b + b.b, n: a.n + b.n };
  clusters.splice(j, 1);
}
