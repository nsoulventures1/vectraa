import ImageTracer from 'imagetracerjs';
import type { VectorizeOptions } from './types';

interface Rgb { r: number; g: number; b: number }
interface Band { y0: number; y1: number; color: Rgb }

/**
 * Reconstruct circular emblems with broad horizontal colour fields as clean SVG
 * primitives, then trace only the detailed insignia sitting on top. This prevents
 * raster noise along the circle and band boundaries from becoming thousands of nodes.
 */
export function tryVectorizeBandedBadge(source: ImageData, options: VectorizeOptions): string | null {
  const bg = estimateCornerColor(source);
  const bounds = foregroundBounds(source, bg);
  if (!bounds) return null;

  const bw = bounds.maxX - bounds.minX + 1;
  const bh = bounds.maxY - bounds.minY + 1;
  if (bw < source.width * 0.42 || bh < source.height * 0.42) return null;
  if (Math.abs(bw - bh) / Math.max(bw, bh) > 0.14) return null;

  const cx = (bounds.minX + bounds.maxX) / 2;
  const cy = (bounds.minY + bounds.maxY) / 2;
  const r = Math.min(bw, bh) / 2;
  if (!looksCircular(source, bg, cx, cy, r)) return null;

  const bands = detectBands(source, cx, cy, r);
  if (bands.length < 2 || bands.length > 5) return null;

  const overlay = buildDetailOverlay(source, bg, cx, cy, r, bands);
  const traced = ImageTracer.imagedataToSVG(overlay, {
    ltres: 0.18,
    qtres: 0.22,
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
    base.push(`<rect x="${fmt(cx - r)}" y="${fmt(band.y0)}" width="${fmt(r * 2)}" height="${fmt(band.y1 - band.y0)}" fill="${rgb(band.color)}" clip-path="url(#${clipId})"/>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${source.width} ${source.height}" width="${source.width}" height="${source.height}"><defs><clipPath id="${clipId}"><circle cx="${fmt(cx)}" cy="${fmt(cy)}" r="${fmt(r)}"/></clipPath></defs>${base.join('')}${detailPaths.join('')}</svg>`;
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
    const c = pixel(source, x, y);
    if (distance(c, bg) < 52) continue;
    minX = Math.min(minX, x); minY = Math.min(minY, y); maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  }
  return maxX >= 0 ? { minX, minY, maxX, maxY } : null;
}

function looksCircular(source: ImageData, bg: Rgb, cx: number, cy: number, r: number): boolean {
  let inside = 0, insideFg = 0, outside = 0, outsideFg = 0;
  const step = Math.max(2, Math.floor(r / 90));
  for (let y = Math.max(0, Math.floor(cy - r)); y <= Math.min(source.height - 1, Math.ceil(cy + r)); y += step) {
    for (let x = Math.max(0, Math.floor(cx - r)); x <= Math.min(source.width - 1, Math.ceil(cx + r)); x += step) {
      const d = Math.hypot(x - cx, y - cy);
      const fg = distance(pixel(source, x, y), bg) >= 52;
      if (d <= r * 0.94) { inside += 1; if (fg) insideFg += 1; }
      else if (d >= r * 1.02) { outside += 1; if (fg) outsideFg += 1; }
    }
  }
  return inside > 0 && insideFg / inside > 0.68 && (outside === 0 || outsideFg / outside < 0.20);
}

function detectBands(source: ImageData, cx: number, cy: number, r: number): Band[] {
  const rows: Array<{ y: number; color: Rgb }> = [];
  const start = Math.max(0, Math.ceil(cy - r * 0.92));
  const end = Math.min(source.height - 1, Math.floor(cy + r * 0.92));
  for (let y = start; y <= end; y += 1) {
    const dy = y - cy;
    const half = Math.sqrt(Math.max(0, r * r - dy * dy));
    if (half < r * 0.35) continue;
    const xs = [cx - half * 0.68, cx - half * 0.48, cx + half * 0.48, cx + half * 0.68]
      .map((v) => Math.max(0, Math.min(source.width - 1, Math.round(v))));
    rows.push({ y, color: medianRgb(xs.map((x) => pixel(source, x, y))) });
  }
  if (!rows.length) return [];

  const runs: Band[] = [];
  for (const row of rows) {
    const last = runs[runs.length - 1];
    if (last && distance(last.color, row.color) < 58) {
      const n = Math.max(1, last.y1 - last.y0);
      last.color = {
        r: Math.round((last.color.r * n + row.color.r) / (n + 1)),
        g: Math.round((last.color.g * n + row.color.g) / (n + 1)),
        b: Math.round((last.color.b * n + row.color.b) / (n + 1)),
      };
      last.y1 = row.y + 1;
    } else runs.push({ y0: row.y, y1: row.y + 1, color: row.color });
  }

  const minHeight = r * 0.12;
  const major = runs.filter((run) => run.y1 - run.y0 >= minHeight);
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
    const nearCircleEdge = Math.abs(d - r) < 3.2;
    const nearBandEdge = bands.some((band) => Math.abs(y - band.y0) < 2.2 || Math.abs(y - band.y1) < 2.2);
    if (nearCircleEdge || nearBandEdge || distance(actual, expected) < 62) continue;
    const i = (y * source.width + x) * 4;
    const si = i;
    out.data[i] = source.data[si]; out.data[i + 1] = source.data[si + 1]; out.data[i + 2] = source.data[si + 2]; out.data[i + 3] = source.data[si + 3];
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

function pixel(source: ImageData, x: number, y: number): Rgb {
  const i = (Math.round(y) * source.width + Math.round(x)) * 4;
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
