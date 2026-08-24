import ImageTracer from 'imagetracerjs';
import type { VectorizeOptions } from './types';

interface Rgb { r: number; g: number; b: number }
interface Band { y0: number; y1: number; color: Rgb }
interface CircleCandidate { cx: number; cy: number; r: number; score: number }

/**
 * Reconstruct circular emblems with broad horizontal colour fields as clean SVG
 * primitives, then trace only the detailed insignia sitting on top.
 */
export function tryVectorizeBandedBadge(source: ImageData, options: VectorizeOptions): string | null {
  const bg = estimateCornerColor(source);
  const circle = findBadgeCircle(source, bg);
  if (!circle || circle.score < 0.58) return null;

  const bands = detectBands(source, circle.cx, circle.cy, circle.r);
  if (bands.length < 2 || bands.length > 5) return null;

  const overlay = buildDetailOverlay(source, bg, circle.cx, circle.cy, circle.r, bands);
  const traced = ImageTracer.imagedataToSVG(overlay, {
    ltres: 0.16,
    qtres: 0.20,
    pathomit: 0,
    rightangleenhance: true,
    colorsampling: 2,
    numberofcolors: Math.max(4, Math.min(10, options.colors || 8)),
    mincolorratio: 0.0001,
    colorquantcycles: 2,
    layering: 0,
    strokewidth: 0,
    linefilter: false,
    scale: 1,
    roundcoords: 5,
    viewbox: true,
    desc: false,
    blurradius: 0,
    blurdelta: 0,
  });
  const detailPaths = extractNonWhitePaths(traced);

  const clipId = 'vectraa-badge-clip';
  const base = [`<rect x="0" y="0" width="${source.width}" height="${source.height}" fill="${rgb(bg)}"/>`];
  for (const band of bands) {
    base.push(`<rect x="${fmt(circle.cx - circle.r)}" y="${fmt(band.y0)}" width="${fmt(circle.r * 2)}" height="${fmt(band.y1 - band.y0)}" fill="${rgb(band.color)}" clip-path="url(#${clipId})"/>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${source.width} ${source.height}" width="${source.width}" height="${source.height}"><defs><clipPath id="${clipId}"><circle cx="${fmt(circle.cx)}" cy="${fmt(circle.cy)}" r="${fmt(circle.r)}"/></clipPath></defs>${base.join('')}${detailPaths.join('')}</svg>`;
}

/**
 * Try both data-derived bounds and centred-circle hypotheses. Raster/JPEG noise can make
 * a strict foreground bounding box unreliable, so the detector scores several plausible
 * circles and keeps the strongest one instead of failing on a single threshold.
 */
function findBadgeCircle(source: ImageData, bg: Rgb): CircleCandidate | null {
  const candidates: CircleCandidate[] = [];
  const bounds = foregroundBounds(source, bg);
  if (bounds) {
    const bw = bounds.maxX - bounds.minX + 1;
    const bh = bounds.maxY - bounds.minY + 1;
    if (bw >= source.width * 0.36 && bh >= source.height * 0.36 && Math.abs(bw - bh) / Math.max(bw, bh) <= 0.22) {
      const cx = (bounds.minX + bounds.maxX) / 2;
      const cy = (bounds.minY + bounds.maxY) / 2;
      const r = Math.min(bw, bh) / 2;
      candidates.push({ cx, cy, r, score: circleScore(source, bg, cx, cy, r) });
    }
  }

  const cx = source.width / 2;
  const cy = source.height / 2;
  const minSide = Math.min(source.width, source.height);
  for (const fraction of [0.40, 0.425, 0.45, 0.475]) {
    const r = minSide * fraction;
    candidates.push({ cx, cy, r, score: circleScore(source, bg, cx, cy, r) });
  }

  candidates.sort((a, b) => b.score - a.score);
  return candidates[0] ?? null;
}

function circleScore(source: ImageData, bg: Rgb, cx: number, cy: number, r: number): number {
  let core = 0, coreFg = 0, outside = 0, outsideFg = 0, edge = 0, edgeFg = 0;
  const step = Math.max(2, Math.floor(r / 95));
  const x0 = Math.max(0, Math.floor(cx - r * 1.10));
  const x1 = Math.min(source.width - 1, Math.ceil(cx + r * 1.10));
  const y0 = Math.max(0, Math.floor(cy - r * 1.10));
  const y1 = Math.min(source.height - 1, Math.ceil(cy + r * 1.10));

  for (let y = y0; y <= y1; y += step) for (let x = x0; x <= x1; x += step) {
    const d = Math.hypot(x - cx, y - cy);
    const fg = distance(pixel(source, x, y), bg) >= 42;
    if (d <= r * 0.88) { core += 1; if (fg) coreFg += 1; }
    else if (d >= r * 1.035 && d <= r * 1.10) { outside += 1; if (fg) outsideFg += 1; }
    else if (d >= r * 0.94 && d <= r * 1.015) { edge += 1; if (fg) edgeFg += 1; }
  }

  if (!core || !edge) return 0;
  const coreRatio = coreFg / core;
  const outsideRatio = outside ? outsideFg / outside : 0;
  const edgeRatio = edgeFg / edge;
  // Dense coloured interior + mostly-background exterior + occupied circle edge.
  return coreRatio * 0.52 + (1 - outsideRatio) * 0.30 + edgeRatio * 0.18;
}

function estimateCornerColor(source: ImageData): Rgb {
  const samples: Rgb[] = [];
  const w = source.width, h = source.height;
  const size = Math.max(2, Math.round(Math.min(w, h) * 0.07));
  const origins = [[0, 0], [w - size, 0], [0, h - size], [w - size, h - size]];
  for (const [ox, oy] of origins) {
    for (let y = oy; y < oy + size; y += Math.max(1, Math.floor(size / 8))) {
      for (let x = ox; x < ox + size; x += Math.max(1, Math.floor(size / 8))) {
        const i = (y * w + x) * 4;
        if (source.data[i + 3] < 20) continue;
        samples.push({ r: source.data[i], g: source.data[i + 1], b: source.data[i + 2] });
      }
    }
  }
  return medianRgb(samples.length ? samples : [{ r: 255, g: 255, b: 255 }]);
}

function foregroundBounds(source: ImageData, bg: Rgb): { minX: number; minY: number; maxX: number; maxY: number } | null {
  let minX = source.width, minY = source.height, maxX = -1, maxY = -1;
  const step = Math.max(1, Math.floor(Math.max(source.width, source.height) / 700));
  for (let y = 0; y < source.height; y += step) for (let x = 0; x < source.width; x += step) {
    if (distance(pixel(source, x, y), bg) < 42) continue;
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  return maxX >= 0 ? { minX, minY, maxX, maxY } : null;
}

/**
 * Read the intended colour for each horizontal row from the outer portions of the
 * circle, where central insignia linework is least likely to interfere. Samples are
 * clustered and the dominant cluster wins, which is much more robust than taking a
 * simple median of four pixels.
 */
function detectBands(source: ImageData, cx: number, cy: number, r: number): Band[] {
  const rows: Array<{ y: number; color: Rgb }> = [];
  const start = Math.max(0, Math.ceil(cy - r * 0.90));
  const end = Math.min(source.height - 1, Math.floor(cy + r * 0.90));
  const fractions = [-0.84, -0.74, -0.64, 0.64, 0.74, 0.84];

  for (let y = start; y <= end; y += 1) {
    const dy = y - cy;
    const half = Math.sqrt(Math.max(0, r * r - dy * dy));
    if (half < r * 0.30) continue;
    const samples = fractions.map((f) => pixel(source, clampX(source, cx + half * f), y));
    rows.push({ y, color: dominantColor(samples, 52) });
  }
  if (!rows.length) return [];

  const smoothed = rows.map((row, index) => {
    const from = Math.max(0, index - 2);
    const to = Math.min(rows.length, index + 3);
    return { y: row.y, color: dominantColor(rows.slice(from, to).map((r0) => r0.color), 55) };
  });

  const runs: Band[] = [];
  for (const row of smoothed) {
    const last = runs[runs.length - 1];
    if (last && distance(last.color, row.color) < 68) {
      const n = Math.max(1, last.y1 - last.y0);
      last.color = mix(last.color, row.color, n);
      last.y1 = row.y + 1;
    } else runs.push({ y0: row.y, y1: row.y + 1, color: row.color });
  }

  const minHeight = r * 0.09;
  const major = runs.filter((run) => run.y1 - run.y0 >= minHeight);
  if (major.length < 2 || major.length > 5) return [];

  // Merge accidental adjacent duplicate bands caused by a few noisy rows.
  for (let i = major.length - 2; i >= 0; i -= 1) {
    if (distance(major[i].color, major[i + 1].color) < 72) {
      const a = major[i], b = major[i + 1];
      const an = a.y1 - a.y0, bn = b.y1 - b.y0;
      a.color = {
        r: Math.round((a.color.r * an + b.color.r * bn) / (an + bn)),
        g: Math.round((a.color.g * an + b.color.g * bn) / (an + bn)),
        b: Math.round((a.color.b * an + b.color.b * bn) / (an + bn)),
      };
      a.y1 = b.y1;
      major.splice(i + 1, 1);
    }
  }
  if (major.length < 2 || major.length > 5) return [];

  major[0].y0 = cy - r;
  major[major.length - 1].y1 = cy + r;
  for (let i = 0; i < major.length - 1; i += 1) {
    const boundary = (major[i].y1 + major[i + 1].y0) / 2;
    major[i].y1 = boundary;
    major[i + 1].y0 = boundary;
  }
  return major;
}

function dominantColor(colors: Rgb[], tolerance: number): Rgb {
  if (!colors.length) return { r: 255, g: 255, b: 255 };
  let best: Rgb[] = [colors[0]];
  for (const seed of colors) {
    const cluster = colors.filter((candidate) => distance(seed, candidate) <= tolerance);
    if (cluster.length > best.length) best = cluster;
  }
  return medianRgb(best);
}

function mix(a: Rgb, b: Rgb, aWeight: number): Rgb {
  const total = aWeight + 1;
  return {
    r: Math.round((a.r * aWeight + b.r) / total),
    g: Math.round((a.g * aWeight + b.g) / total),
    b: Math.round((a.b * aWeight + b.b) / total),
  };
}

function buildDetailOverlay(source: ImageData, bg: Rgb, cx: number, cy: number, r: number, bands: Band[]): ImageData {
  const out = new ImageData(source.width, source.height);
  for (let i = 0; i < out.data.length; i += 4) {
    out.data[i] = 255; out.data[i + 1] = 255; out.data[i + 2] = 255; out.data[i + 3] = 255;
  }
  for (let y = 0; y < source.height; y += 1) for (let x = 0; x < source.width; x += 1) {
    const d = Math.hypot(x - cx, y - cy);
    const actual = pixel(source, x, y);
    let expected = bg;
    if (d <= r) {
      const band = bands.find((candidate) => y >= candidate.y0 && y < candidate.y1);
      if (band) expected = band.color;
    }
    const nearCircleEdge = Math.abs(d - r) < 3.5;
    const nearBandEdge = bands.some((band) => Math.abs(y - band.y0) < 2.5 || Math.abs(y - band.y1) < 2.5);
    if (nearCircleEdge || nearBandEdge || distance(actual, expected) < 66) continue;
    const i = (y * source.width + x) * 4;
    out.data[i] = source.data[i]; out.data[i + 1] = source.data[i + 1]; out.data[i + 2] = source.data[i + 2]; out.data[i + 3] = source.data[i + 3];
  }
  return out;
}

function extractNonWhitePaths(svg: string): string[] {
  const tags = svg.match(/<path\b[^>]*\/>|<path\b[^>]*>[\s\S]*?<\/path>/g) ?? [];
  return tags.filter((tag) => {
    const m = tag.match(/fill="rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)"/);
    if (!m) return false;
    return !(Number(m[1]) > 235 && Number(m[2]) > 235 && Number(m[3]) > 235);
  });
}

function clampX(source: ImageData, x: number): number { return Math.max(0, Math.min(source.width - 1, Math.round(x))); }
function pixel(source: ImageData, x: number, y: number): Rgb {
  const ix = Math.max(0, Math.min(source.width - 1, Math.round(x)));
  const iy = Math.max(0, Math.min(source.height - 1, Math.round(y)));
  const i = (iy * source.width + ix) * 4;
  return { r: source.data[i], g: source.data[i + 1], b: source.data[i + 2] };
}
function medianRgb(colors: Rgb[]): Rgb {
  const channel = (key: keyof Rgb) => {
    const values = colors.map((c) => c[key]).sort((a, b) => a - b);
    const m = Math.floor(values.length / 2);
    return values.length % 2 ? values[m] : Math.round((values[m - 1] + values[m]) / 2);
  };
  return { r: channel('r'), g: channel('g'), b: channel('b') };
}
function distance(a: Rgb, b: Rgb): number { return Math.hypot(a.r - b.r, a.g - b.g, a.b - b.b); }
function rgb(c: Rgb): string { return `rgb(${c.r},${c.g},${c.b})`; }
function fmt(value: number): string { return Number(value.toFixed(2)).toString(); }
