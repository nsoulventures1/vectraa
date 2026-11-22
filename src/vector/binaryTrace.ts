import { type Rgb, luminance, rgbCss } from './color';
import { extractComponents, fitPrimitive, renderPrimitive, type MaskComponent } from './primitives';
import type { VectorizeOptions } from './types';

interface Pt {
  x: number;
  y: number;
}

/**
 * Outline tracer for signatures and line art.
 *
 * Potrace itself is GPL-2.0, so shipping its binary would force a licence
 * decision on the whole app. This is an original client-side fitter: threshold,
 * contour walk, straight-line collapse, then cubic curves between corners.
 * Circles, rectangles and straight strokes are emitted as real SVG shapes.
 * Colour illustrations stay on the separate colour pipeline.
 */
export function traceBinaryArtwork(source: ImageData, options: VectorizeOptions): string {
  const mask = buildInkMask(source);
  const minArea = options.preset === 'signature' ? 3 : 2;
  const { components, labels } = extractComponents(mask, source.width, source.height);
  const color = rgbCss(inkColor(source, mask));
  const shapes: string[] = [];

  for (const component of components) {
    if (component.area < minArea) continue;
    const primitive = fitPrimitive(mask, source.width, source.height, component);
    if (primitive) {
      shapes.push(renderPrimitive(primitive, color));
      continue;
    }
    const loops = contourLoops(labels, source.width, source.height, component);
    const rectangle = rectangleFromLoops(loops, color);
    if (rectangle) {
      shapes.push(rectangle);
      continue;
    }
    const data = loops
      .map((loop) => fitLoop(loop, options))
      .filter((path) => path.length > 0)
      .join(' ');
    if (data) shapes.push(`<path fill="${color}" fill-rule="evenodd" d="${data}"/>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${source.width} ${source.height}" width="${source.width}" height="${source.height}">${shapes.join('')}</svg>`;
}

function buildInkMask(source: ImageData): Uint8Array {
  const mask = new Uint8Array(source.width * source.height);
  const histogram = new Uint32Array(256);
  let opaque = 0;
  let transparent = 0;
  for (let i = 0; i < source.data.length; i += 4) {
    if (source.data[i + 3] < 16) {
      transparent += 1;
      continue;
    }
    histogram[Math.round(luminance({ r: source.data[i], g: source.data[i + 1], b: source.data[i + 2] }))] += 1;
    opaque += 1;
  }
  const mostlyTransparent = transparent > (opaque + transparent) * 0.2;
  const threshold = otsu(histogram, opaque);
  const cutoff = mostlyTransparent ? 248 : Math.max(40, Math.min(230, threshold));

  for (let i = 0, p = 0; i < source.data.length; i += 4, p += 1) {
    if (source.data[i + 3] < (mostlyTransparent ? 32 : 16)) continue;
    const luma = luminance({ r: source.data[i], g: source.data[i + 1], b: source.data[i + 2] });
    if (luma < cutoff) mask[p] = 1;
  }
  return mask;
}

function inkColor(source: ImageData, mask: Uint8Array): Rgb {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let p = 0, i = 0; p < mask.length; p += 1, i += 4) {
    if (!mask[p]) continue;
    r += source.data[i];
    g += source.data[i + 1];
    b += source.data[i + 2];
    n += 1;
  }
  if (!n) return { r: 20, g: 20, b: 20 };
  return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
}

function otsu(histogram: Uint32Array, total: number): number {
  if (!total) return 180;
  let weighted = 0;
  for (let i = 0; i < 256; i += 1) weighted += i * histogram[i];
  let backgroundWeight = 0;
  let backgroundSum = 0;
  let bestVariance = -1;
  let best = 180;
  for (let i = 0; i < 256; i += 1) {
    backgroundWeight += histogram[i];
    if (!backgroundWeight) continue;
    const foregroundWeight = total - backgroundWeight;
    if (!foregroundWeight) break;
    backgroundSum += i * histogram[i];
    const backgroundMean = backgroundSum / backgroundWeight;
    const foregroundMean = (weighted - backgroundSum) / foregroundWeight;
    const variance = backgroundWeight * foregroundWeight * (backgroundMean - foregroundMean) ** 2;
    if (variance > bestVariance) {
      bestVariance = variance;
      best = i;
    }
  }
  return best;
}

function contourLoops(labels: Int32Array, width: number, height: number, component: MaskComponent): Pt[][] {
  const id = component.id;
  const inside = (x: number, y: number) => x >= 0 && y >= 0 && x < width && y < height && labels[y * width + x] === id;
  const outgoing = new Map<string, Pt[]>();
  const add = (x0: number, y0: number, x1: number, y1: number) => {
    const key = `${x0},${y0}`;
    const list = outgoing.get(key);
    if (list) list.push({ x: x1, y: y1 });
    else outgoing.set(key, [{ x: x1, y: y1 }]);
  };

  for (let y = component.minY; y <= component.maxY + 1; y += 1) {
    for (let x = component.minX; x <= component.maxX; x += 1) {
      const below = inside(x, y);
      const above = inside(x, y - 1);
      if (below && !above) add(x, y, x + 1, y);
      else if (above && !below) add(x + 1, y, x, y);
    }
  }
  for (let x = component.minX; x <= component.maxX + 1; x += 1) {
    for (let y = component.minY; y <= component.maxY; y += 1) {
      const right = inside(x, y);
      const left = inside(x - 1, y);
      if (right && !left) add(x, y + 1, x, y);
      else if (left && !right) add(x, y, x, y + 1);
    }
  }

  const loops: Pt[][] = [];
  for (const [startKey, ends] of outgoing) {
    while (ends.length) {
      const [sx, sy] = startKey.split(',').map(Number);
      const loop: Pt[] = [{ x: sx, y: sy }];
      let current = { x: sx, y: sy };
      let guard = width * height * 4;
      while (guard > 0) {
        guard -= 1;
        const nexts = outgoing.get(`${current.x},${current.y}`);
        const next = nexts?.pop();
        if (!next) break;
        if (next.x === sx && next.y === sy) {
          loop.push(next);
          break;
        }
        loop.push(next);
        current = next;
      }
      if (loop.length > 3) loops.push(loop);
    }
  }
  return loops;
}

function rectangleFromLoops(loops: Pt[][], color: string): string | null {
  const rects = loops
    .map((loop) => axisRect(simplifyClosed(loop, 1.1)))
    .filter((rect): rect is { x: number; y: number; w: number; h: number } => rect !== null);
  if (rects.length !== loops.length || !rects.length || rects.length > 2) return null;
  if (rects.length === 1) {
    const rect = rects[0];
    if (rect.w < 18 && rect.h < 18 && Math.abs(rect.w - rect.h) / Math.max(rect.w, rect.h) < 0.4) {
      return renderPrimitive({ kind: 'circle', cx: rect.x + rect.w / 2, cy: rect.y + rect.h / 2, r: (rect.w + rect.h) / 4 }, color);
    }
    return renderPrimitive({ kind: 'rect', x: rect.x, y: rect.y, width: rect.w, height: rect.h }, color);
  }
  const [outer, inner] = [...rects].sort((a, b) => b.w * b.h - a.w * a.h);
  const stroke = Math.min(inner.x - outer.x, inner.y - outer.y);
  if (stroke < 0.8 || stroke > Math.min(outer.w, outer.h) * 0.35) return null;
  return renderPrimitive({
    kind: 'rect-stroke',
    x: outer.x,
    y: outer.y,
    width: outer.w,
    height: outer.h,
    strokeWidth: stroke,
  }, color);
}

function axisRect(loop: Pt[]): { x: number; y: number; w: number; h: number } | null {
  const open = loop.length > 1 && same(loop[0], loop[loop.length - 1]) ? loop.slice(0, -1) : loop.slice();
  if (open.length !== 4) return null;
  for (let index = 0; index < 4; index += 1) {
    const start = open[index];
    const end = open[(index + 1) % 4];
    if (Math.abs(start.x - end.x) > 1.25 && Math.abs(start.y - end.y) > 1.25) return null;
  }
  const xs = open.map((point) => point.x);
  const ys = open.map((point) => point.y);
  const x = Math.min(...xs);
  const y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

function fitLoop(loop: Pt[], options: VectorizeOptions): string {
  const detail = options.detail / 100;
  const smoothing = options.smoothing / 100;
  // Keep the tolerance inside a thin stroke. Larger values pull the two
  // sides of a pen line together and throw triangular spikes.
  const epsilon = 0.5 + smoothing * 0.5 + (1 - detail) * 0.2;
  const tolerance = 0.4 + smoothing * 0.5 + (1 - detail) * 0.16;
  const cornerDegrees = 48 + smoothing * 30;
  const simplified = simplifyClosed(loop, epsilon);
  if (simplified.length < 4) return '';
  const openCount = simplified.length - 1;
  let breaks = cornerIndexes(simplified, cornerDegrees);
  if (breaks.length < 2) breaks = oppositeBreaks(simplified);
  breaks.sort((a, b) => a - b);
  const commands: string[] = [];
  const start = simplified[breaks[0]];
  commands.push(`M${fmt(start.x)} ${fmt(start.y)}`);
  for (let index = 0; index < breaks.length; index += 1) {
    const from = breaks[index];
    const to = breaks[(index + 1) % breaks.length];
    const span = sliceCyclic(simplified, from, to, openCount);
    commands.push(fitSpan(span, tolerance));
  }
  commands.push('Z');
  return commands.join(' ');
}

function fitSpan(points: Pt[], tolerance: number): string {
  if (points.length < 2) return '';
  const end = points[points.length - 1];
  const chordGap = maxChordDistance(points);
  if (points.length === 2 || chordGap <= tolerance * 0.85) return `L${fmt(end.x)} ${fmt(end.y)}`;
  if (points.length < 4) return points.slice(1).map((point) => `L${fmt(point.x)} ${fmt(point.y)}`).join(' ');
  const error = bezierError(points);
  if (error.max <= tolerance) return cubicCommand(points, error.c1, error.c2);
  const splitAt = Math.max(1, Math.min(points.length - 2, error.index));
  return `${fitSpan(points.slice(0, splitAt + 1), tolerance)} ${fitSpan(points.slice(splitAt), tolerance)}`;
}

function bezierError(points: Pt[]): { max: number; index: number; c1: Pt; c2: Pt } {
  const start = points[0];
  const end = points[points.length - 1];
  const chord = Math.hypot(end.x - start.x, end.y - start.y) || 1;
  const chordDir = { x: (end.x - start.x) / chord, y: (end.y - start.y) / chord };
  const t0 = tangent(points, true);
  const t1 = tangent(points, false);
  // A handle that fights the chord is what turns a pen cap into a spike.
  const handle = (tangent: Pt, sign: number) => {
    const agreement = Math.max(0, tangent.x * chordDir.x * sign + tangent.y * chordDir.y * sign);
    return Math.min(chord * 0.45, (chord / 3) * (0.25 + agreement));
  };
  const h0 = handle(t0, 1);
  const h1 = handle(t1, 1);
  const c1 = { x: start.x + t0.x * h0, y: start.y + t0.y * h0 };
  const c2 = { x: end.x - t1.x * h1, y: end.y - t1.y * h1 };
  let max = 0;
  let index = Math.floor(points.length / 2);
  for (let i = 1; i < points.length - 1; i += 1) {
    const t = i / (points.length - 1);
    const point = cubicAt(start, c1, c2, end, t);
    const distance = Math.hypot(point.x - points[i].x, point.y - points[i].y);
    if (distance > max) {
      max = distance;
      index = i;
    }
  }
  return { max, index, c1, c2 };
}

function cubicCommand(points: Pt[], c1: Pt, c2: Pt): string {
  const end = points[points.length - 1];
  return `C${fmt(c1.x)} ${fmt(c1.y)} ${fmt(c2.x)} ${fmt(c2.y)} ${fmt(end.x)} ${fmt(end.y)}`;
}

function cubicAt(p0: Pt, c1: Pt, c2: Pt, p3: Pt, t: number): Pt {
  const u = 1 - t;
  return {
    x: u ** 3 * p0.x + 3 * u * u * t * c1.x + 3 * u * t * t * c2.x + t ** 3 * p3.x,
    y: u ** 3 * p0.y + 3 * u * u * t * c1.y + 3 * u * t * t * c2.y + t ** 3 * p3.y,
  };
}

function tangent(points: Pt[], atStart: boolean): Pt {
  const count = Math.min(3, points.length - 1);
  const a = atStart ? points[0] : points[points.length - 1];
  const b = atStart ? points[count] : points[points.length - 1 - count];
  const dx = atStart ? b.x - a.x : a.x - b.x;
  const dy = atStart ? b.y - a.y : a.y - b.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: dx / length, y: dy / length };
}

function simplifyClosed(loop: Pt[], epsilon: number): Pt[] {
  const open = loop.length > 1 && same(loop[0], loop[loop.length - 1]) ? loop.slice(0, -1) : loop.slice();
  const compact = dropCollinear(open);
  if (compact.length <= 4) return close(compact);
  let far = 0;
  let farDistance = -1;
  const cx = compact.reduce((sum, point) => sum + point.x, 0) / compact.length;
  const cy = compact.reduce((sum, point) => sum + point.y, 0) / compact.length;
  compact.forEach((point, index) => {
    const distance = (point.x - cx) ** 2 + (point.y - cy) ** 2;
    if (distance > farDistance) {
      farDistance = distance;
      far = index;
    }
  });
  let opposite = 0;
  let oppositeDistance = -1;
  compact.forEach((point, index) => {
    const distance = (point.x - compact[far].x) ** 2 + (point.y - compact[far].y) ** 2;
    if (distance > oppositeDistance) {
      oppositeDistance = distance;
      opposite = index;
    }
  });
  const first = rdp(sliceCyclic(compact, far, opposite, compact.length), epsilon);
  const second = rdp(sliceCyclic(compact, opposite, far, compact.length), epsilon);
  const merged = [...first, ...second.slice(1)];
  return close(merged.length >= 3 ? merged : compact);
}

function rdp(points: Pt[], epsilon: number): Pt[] {
  if (points.length < 3) return points.slice();
  let max = 0;
  let index = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    const distance = pointLineDistance(points[i], points[0], points[points.length - 1]);
    if (distance > max) {
      max = distance;
      index = i;
    }
  }
  if (max <= epsilon) return [points[0], points[points.length - 1]];
  const left = rdp(points.slice(0, index + 1), epsilon);
  const right = rdp(points.slice(index), epsilon);
  return [...left.slice(0, -1), ...right];
}

function dropCollinear(points: Pt[]): Pt[] {
  if (points.length <= 4) return points.slice();
  const kept: Pt[] = [];
  for (let i = 0; i < points.length; i += 1) {
    const prev = points[(i - 1 + points.length) % points.length];
    const next = points[(i + 1) % points.length];
    if (pointLineDistance(points[i], prev, next) > 0.01) kept.push(points[i]);
  }
  return kept.length >= 3 ? kept : points.slice();
}

function cornerIndexes(points: Pt[], minimum: number): number[] {
  const count = points.length - 1;
  const indexes: number[] = [];
  for (let i = 0; i < count; i += 1) {
    const prev = points[(i - 1 + count) % count];
    const next = points[(i + 1) % count];
    if (turnDegrees(prev, points[i], next) >= minimum) indexes.push(i);
  }
  return indexes;
}

function oppositeBreaks(points: Pt[]): number[] {
  const count = points.length - 1;
  return [0, Math.max(1, Math.floor(count / 2))];
}

function sliceCyclic(points: Pt[], from: number, to: number, count: number): Pt[] {
  const span: Pt[] = [];
  let index = from;
  span.push(points[index % points.length]);
  let guard = count + 2;
  while (index !== to && guard > 0) {
    guard -= 1;
    index = (index + 1) % count;
    span.push(points[index]);
  }
  return span;
}

function maxChordDistance(points: Pt[]): number {
  let max = 0;
  for (let i = 1; i < points.length - 1; i += 1) {
    max = Math.max(max, pointLineDistance(points[i], points[0], points[points.length - 1]));
  }
  return max;
}

function pointLineDistance(point: Pt, a: Pt, b: Pt): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const length = Math.hypot(dx, dy);
  if (length < 1e-6) return Math.hypot(point.x - a.x, point.y - a.y);
  return Math.abs((point.x - a.x) * dy - (point.y - a.y) * dx) / length;
}

function turnDegrees(a: Pt, b: Pt, c: Pt): number {
  const v1x = b.x - a.x;
  const v1y = b.y - a.y;
  const v2x = c.x - b.x;
  const v2y = c.y - b.y;
  const dot = v1x * v2x + v1y * v2y;
  const cross = v1x * v2y - v1y * v2x;
  return Math.abs(Math.atan2(cross, dot) * 180 / Math.PI);
}

function close(points: Pt[]): Pt[] {
  if (!points.length) return points;
  const last = points[points.length - 1];
  if (!same(points[0], last)) points = [...points, { ...points[0] }];
  return points;
}

function same(a: Pt, b: Pt): boolean {
  return a.x === b.x && a.y === b.y;
}

function fmt(value: number): string {
  return Number(value.toFixed(2)).toString();
}
