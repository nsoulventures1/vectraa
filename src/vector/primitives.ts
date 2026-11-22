export interface MaskComponent {
  id: number;
  pixels: number[];
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  area: number;
}

export type Primitive =
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'ring'; cx: number; cy: number; r: number; strokeWidth: number }
  | { kind: 'rect'; x: number; y: number; width: number; height: number }
  | { kind: 'rect-stroke'; x: number; y: number; width: number; height: number; strokeWidth: number }
  | { kind: 'line'; x1: number; y1: number; x2: number; y2: number; strokeWidth: number };

const BINS = 72;

/** 8-connected components, labelled so contour tracing can ignore neighbours. */
export function extractComponents(mask: Uint8Array, width: number, height: number): { components: MaskComponent[]; labels: Int32Array } {
  const labels = new Int32Array(mask.length);
  const components: MaskComponent[] = [];
  const queue = new Int32Array(mask.length);
  let nextId = 1;

  for (let start = 0; start < mask.length; start += 1) {
    if (!mask[start] || labels[start]) continue;
    let head = 0;
    let tail = 0;
    queue[tail++] = start;
    labels[start] = nextId;
    const pixels: number[] = [];
    let minX = width;
    let minY = height;
    let maxX = 0;
    let maxY = 0;

    while (head < tail) {
      const index = queue[head++];
      pixels.push(index);
      const x = index % width;
      const y = Math.floor(index / width);
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (!dx && !dy) continue;
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= width || ny >= height) continue;
          const next = ny * width + nx;
          if (!mask[next] || labels[next]) continue;
          labels[next] = nextId;
          queue[tail++] = next;
        }
      }
    }

    components.push({ id: nextId, pixels, minX, minY, maxX, maxY, area: pixels.length });
    nextId += 1;
  }

  components.sort((a, b) => b.area - a.area);
  return { components, labels };
}

/**
 * Replace a component with a circle, ring, rectangle or straight stroke when the
 * pixels actually lie on that shape. Partial arcs and letters fall through.
 */
export function fitPrimitive(mask: Uint8Array, width: number, height: number, component: MaskComponent): Primitive | null {
  if (component.area < 10) return null;
  return fitCircular(mask, width, component)
    ?? fitFilledRect(mask, width, component)
    ?? fitRectFrame(mask, width, component)
    ?? fitLine(mask, width, component);
}

export function renderPrimitive(primitive: Primitive, color: string): string {
  const n = (value: number) => Number(value.toFixed(2)).toString();
  switch (primitive.kind) {
    case 'circle':
      return `<circle cx="${n(primitive.cx)}" cy="${n(primitive.cy)}" r="${n(primitive.r)}" fill="${color}"/>`;
    case 'ring':
      return `<circle cx="${n(primitive.cx)}" cy="${n(primitive.cy)}" r="${n(primitive.r)}" fill="none" stroke="${color}" stroke-width="${n(primitive.strokeWidth)}"/>`;
    case 'rect':
      return `<rect x="${n(primitive.x)}" y="${n(primitive.y)}" width="${n(primitive.width)}" height="${n(primitive.height)}" fill="${color}"/>`;
    case 'rect-stroke':
      return `<rect x="${n(primitive.x + primitive.strokeWidth / 2)}" y="${n(primitive.y + primitive.strokeWidth / 2)}" width="${n(Math.max(0, primitive.width - primitive.strokeWidth))}" height="${n(Math.max(0, primitive.height - primitive.strokeWidth))}" fill="none" stroke="${color}" stroke-width="${n(primitive.strokeWidth)}"/>`;
    case 'line':
      return `<line x1="${n(primitive.x1)}" y1="${n(primitive.y1)}" x2="${n(primitive.x2)}" y2="${n(primitive.y2)}" stroke="${color}" stroke-width="${n(primitive.strokeWidth)}" stroke-linecap="round"/>`;
  }
}

function fitCircular(mask: Uint8Array, width: number, component: MaskComponent): Primitive | null {
  const boxW = component.maxX - component.minX + 1;
  const boxH = component.maxY - component.minY + 1;
  if (boxW < 8 || boxH < 8) return null;
  if (Math.abs(boxW - boxH) / Math.max(boxW, boxH) > 0.1) return null;

  const cx = (component.minX + component.maxX + 1) / 2;
  const cy = (component.minY + component.maxY + 1) / 2;
  const inners = new Float64Array(BINS).fill(Number.POSITIVE_INFINITY);
  const outers = new Float64Array(BINS);
  const counts = new Uint16Array(BINS);

  for (const index of component.pixels) {
    const x = index % width;
    const y = Math.floor(index / width);
    const dx = x + 0.5 - cx;
    const dy = y + 0.5 - cy;
    const radius = Math.hypot(dx, dy);
    let bin = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2)) * BINS);
    if (bin >= BINS) bin = 0;
    counts[bin] += 1;
    if (radius < inners[bin]) inners[bin] = radius;
    if (radius > outers[bin]) outers[bin] = radius;
  }

  let covered = 0;
  let outerSum = 0;
  let innerSum = 0;
  for (let bin = 0; bin < BINS; bin += 1) {
    if (!counts[bin]) continue;
    covered += 1;
    outerSum += outers[bin];
    innerSum += inners[bin];
  }
  if (covered < BINS * 0.92) return null;

  const outerMean = outerSum / covered;
  const innerMean = innerSum / covered;
  if (outerMean < 4) return null;
  let outerDev = 0;
  let innerDev = 0;
  for (let bin = 0; bin < BINS; bin += 1) {
    if (!counts[bin]) continue;
    outerDev += Math.abs(outers[bin] - outerMean);
    innerDev += Math.abs(inners[bin] - innerMean);
  }
  outerDev /= covered;
  innerDev /= covered;
  if (outerDev > 0.85 + outerMean * 0.035) return null;

  const centerIndex = Math.floor(cy) * width + Math.floor(cx);
  const centerInComponent = component.pixels.includes(centerIndex);
  const thickness = outerMean - innerMean;
  if (innerMean > Math.max(2.5, outerMean * 0.28) && !centerInComponent && innerDev < 0.9 + innerMean * 0.04) {
    const outerEdge = outerMean + 0.55;
    const innerEdge = Math.max(0, innerMean - 0.55);
    const expected = Math.PI * (outerEdge * outerEdge - innerEdge * innerEdge);
    if (Math.abs(component.area - expected) / expected > 0.28) return null;
    return {
      kind: 'ring',
      cx,
      cy,
      r: (innerMean + outerMean) / 2,
      strokeWidth: thickness + 1,
    };
  }

  if (centerInComponent && innerMean < outerMean * 0.55) {
    const radius = outerMean + 0.35;
    const expected = Math.PI * radius * radius;
    if (Math.abs(component.area - expected) / expected > 0.25) return null;
    return { kind: 'circle', cx, cy, r: radius };
  }
  return null;
}

function fitFilledRect(mask: Uint8Array, width: number, component: MaskComponent): Primitive | null {
  const boxW = component.maxX - component.minX + 1;
  const boxH = component.maxY - component.minY + 1;
  if (boxW < 3 || boxH < 3) return null;
  if (component.area / (boxW * boxH) < 0.94) return null;
  if (!edgeMostlyFilled(mask, width, component, boxW, boxH)) return null;
  return { kind: 'rect', x: component.minX, y: component.minY, width: boxW, height: boxH };
}

function fitRectFrame(mask: Uint8Array, width: number, component: MaskComponent): Primitive | null {
  const boxW = component.maxX - component.minX + 1;
  const boxH = component.maxY - component.minY + 1;
  if (boxW < 8 || boxH < 8) return null;
  const midX = Math.round((component.minX + component.maxX) / 2);
  const midY = Math.round((component.minY + component.maxY) / 2);
  const top = inwardRun(mask, width, component.maxY - component.minY + 1, midX, component.minY, 0, 1);
  const left = inwardRun(mask, width, component.maxX - component.minX + 1, component.minX, midY, 1, 0);
  if (top < 1 || left < 1) return null;
  if (Math.abs(top - left) > Math.max(2, 0.45 * Math.max(top, left))) return null;
  const stroke = Math.max(1, Math.round((top + left) / 2));
  if (stroke * 2 >= Math.min(boxW, boxH) - 1) return null;
  const innerLeft = component.minX + stroke;
  const innerTop = component.minY + stroke;
  const innerRight = component.maxX - stroke;
  const innerBottom = component.maxY - stroke;
  if (innerRight <= innerLeft || innerBottom <= innerTop) return null;

  let frameOn = 0;
  let frameTotal = 0;
  let innerOn = 0;
  for (let y = component.minY; y <= component.maxY; y += 1) {
    for (let x = component.minX; x <= component.maxX; x += 1) {
      const on = mask[y * width + x] === 1;
      const inside = x >= innerLeft && x <= innerRight && y >= innerTop && y <= innerBottom;
      if (inside) {
        if (on) innerOn += 1;
      } else {
        frameTotal += 1;
        if (on) frameOn += 1;
      }
    }
  }
  if (innerOn > Math.max(2, component.area * 0.01)) return null;
  if (!frameTotal || frameOn / frameTotal < 0.9) return null;
  return { kind: 'rect-stroke', x: component.minX, y: component.minY, width: boxW, height: boxH, strokeWidth: stroke };
}

function fitLine(mask: Uint8Array, width: number, component: MaskComponent): Primitive | null {
  if (component.area < 8) return null;
  let meanX = 0;
  let meanY = 0;
  for (const index of component.pixels) {
    meanX += index % width;
    meanY += Math.floor(index / width);
  }
  meanX /= component.area;
  meanY /= component.area;

  let sxx = 0;
  let syy = 0;
  let sxy = 0;
  for (const index of component.pixels) {
    const dx = (index % width) - meanX;
    const dy = Math.floor(index / width) - meanY;
    sxx += dx * dx;
    syy += dy * dy;
    sxy += dx * dy;
  }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy);
  const dirX = Math.cos(angle);
  const dirY = Math.sin(angle);
  let minProj = Infinity;
  let maxProj = -Infinity;
  let maxDistance = 0;
  for (const index of component.pixels) {
    const dx = (index % width) + 0.5 - meanX;
    const dy = Math.floor(index / width) + 0.5 - meanY;
    const projection = dx * dirX + dy * dirY;
    const distance = Math.abs(dx * dirY - dy * dirX);
    if (projection < minProj) minProj = projection;
    if (projection > maxProj) maxProj = projection;
    if (distance > maxDistance) maxDistance = distance;
  }
  const length = maxProj - minProj;
  if (length < 12) return null;
  const thickness = component.area / length;
  if (thickness > 16 && thickness > length * 0.22) return null;
  if (maxDistance > thickness * 0.72 + 1.25) return null;
  return {
    kind: 'line',
    x1: meanX + dirX * minProj,
    y1: meanY + dirY * minProj,
    x2: meanX + dirX * maxProj,
    y2: meanY + dirY * maxProj,
    strokeWidth: Math.max(1, thickness),
  };
}

function inwardRun(mask: Uint8Array, width: number, limit: number, x: number, y: number, dx: number, dy: number): number {
  let cx = x;
  let cy = y;
  let skipped = 0;
  while (skipped < 6) {
    const index = cy * width + cx;
    if (index >= 0 && index < mask.length && mask[index]) break;
    cx += dx;
    cy += dy;
    skipped += 1;
  }
  let run = 0;
  while (run < limit) {
    const index = cy * width + cx;
    if (index < 0 || index >= mask.length || !mask[index]) break;
    run += 1;
    cx += dx;
    cy += dy;
  }
  return run;
}

function edgeMostlyFilled(mask: Uint8Array, width: number, component: MaskComponent, boxW: number, boxH: number): boolean {
  let top = 0;
  let bottom = 0;
  for (let x = component.minX; x <= component.maxX; x += 1) {
    if (mask[component.minY * width + x]) top += 1;
    if (mask[component.maxY * width + x]) bottom += 1;
  }
  let left = 0;
  let right = 0;
  for (let y = component.minY; y <= component.maxY; y += 1) {
    if (mask[y * width + component.minX]) left += 1;
    if (mask[y * width + component.maxX]) right += 1;
  }
  return top > boxW * 0.9 && bottom > boxW * 0.9 && left > boxH * 0.9 && right > boxH * 0.9;
}
