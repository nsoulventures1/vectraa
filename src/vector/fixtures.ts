import type { Rgb } from './color';

export interface DrawnImage {
  image: ImageData;
  width: number;
  height: number;
  inks: Rgb[];
}

export function blank(width: number, height: number, color: Rgb = { r: 255, g: 255, b: 255 }): ImageData {
  const image = new ImageData(width, height);
  for (let i = 0; i < image.data.length; i += 4) {
    image.data[i] = color.r;
    image.data[i + 1] = color.g;
    image.data[i + 2] = color.b;
    image.data[i + 3] = 255;
  }
  return image;
}

export function blend(image: ImageData, x: number, y: number, color: Rgb, coverage: number): void {
  const px = Math.round(x);
  const py = Math.round(y);
  if (px < 0 || py < 0 || px >= image.width || py >= image.height || coverage <= 0) return;
  const i = (py * image.width + px) * 4;
  const t = Math.max(0, Math.min(1, coverage));
  image.data[i] = Math.round(image.data[i] * (1 - t) + color.r * t);
  image.data[i + 1] = Math.round(image.data[i + 1] * (1 - t) + color.g * t);
  image.data[i + 2] = Math.round(image.data[i + 2] * (1 - t) + color.b * t);
  image.data[i + 3] = 255;
}

export function fillRect(image: ImageData, x: number, y: number, width: number, height: number, color: Rgb): void {
  for (let py = y; py < y + height; py += 1) {
    for (let px = x; px < x + width; px += 1) blend(image, px, py, color, 1);
  }
}

export function fillCircle(image: ImageData, cx: number, cy: number, radius: number, color: Rgb): void {
  const r = radius + 1;
  for (let y = cy - r; y <= cy + r; y += 1) {
    for (let x = cx - r; x <= cx + r; x += 1) {
      const distance = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const coverage = Math.max(0, Math.min(1, radius + 0.6 - distance));
      if (coverage > 0) blend(image, x, y, color, coverage);
    }
  }
}

export function strokeCircle(image: ImageData, cx: number, cy: number, radius: number, width: number, color: Rgb): void {
  const outer = radius + width / 2;
  for (let y = cy - outer - 1; y <= cy + outer + 1; y += 1) {
    for (let x = cx - outer - 1; x <= cx + outer + 1; x += 1) {
      const distance = Math.hypot(x + 0.5 - cx, y + 0.5 - cy);
      const coverage = Math.max(0, Math.min(1, width / 2 + 0.65 - Math.abs(distance - radius)));
      if (coverage > 0) blend(image, x, y, color, coverage);
    }
  }
}

export function strokePolyline(image: ImageData, points: Array<[number, number]>, width: number, color: Rgb): void {
  for (let index = 0; index < points.length - 1; index += 1) {
    const [x0, y0] = points[index];
    const [x1, y1] = points[index + 1];
    const steps = Math.max(1, Math.ceil(Math.hypot(x1 - x0, y1 - y0) * 2));
    for (let step = 0; step <= steps; step += 1) {
      const t = step / steps;
      fillCircle(image, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, width / 2, color);
    }
  }
}

export function cubicPoints(p0: [number, number], p1: [number, number], p2: [number, number], p3: [number, number], steps: number): Array<[number, number]> {
  const points: Array<[number, number]> = [];
  for (let i = 0; i <= steps; i += 1) {
    const t = i / steps;
    const u = 1 - t;
    points.push([
      u ** 3 * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t ** 3 * p3[0],
      u ** 3 * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t ** 3 * p3[1],
    ]);
  }
  return points;
}

const GLYPHS: Record<string, string[]> = {
  V: ['#...#', '#...#', '#...#', '#...#', '.#.#.', '.#.#.', '..#..'],
  E: ['#####', '#....', '#....', '####.', '#....', '#....', '#####'],
  C: ['.###.', '#...#', '#....', '#....', '#....', '#...#', '.###.'],
  T: ['#####', '..#..', '..#..', '..#..', '..#..', '..#..', '..#..'],
  R: ['####.', '#...#', '#...#', '####.', '#.#..', '#..#.', '#...#'],
  A: ['.###.', '#...#', '#...#', '#####', '#...#', '#...#', '#...#'],
};

export function fillText(image: ImageData, word: string, x: number, y: number, scale: number, color: Rgb): void {
  let cursor = x;
  for (const char of word) {
    const glyph = GLYPHS[char];
    if (!glyph) {
      cursor += 6 * scale;
      continue;
    }
    for (let row = 0; row < glyph.length; row += 1) {
      for (let col = 0; col < glyph[row].length; col += 1) {
        if (glyph[row][col] !== '#') continue;
        fillRect(image, cursor + col * scale, y + row * scale, scale, scale, color);
      }
    }
    cursor += 6 * scale;
  }
}

const GREEN: Rgb = { r: 31, g: 85, b: 54 };
const INK: Rgb = { r: 24, g: 35, b: 30 };

/** Flat three-colour logo: green ring, green dot, near-black wordmark. */
export function flatLogoFixture(): DrawnImage {
  const image = blank(360, 220);
  strokeCircle(image, 92, 110, 58, 8, GREEN);
  fillCircle(image, 92, 110, 14, GREEN);
  fillText(image, 'VECTRAA', 176, 86, 4, INK);
  return { image, width: 360, height: 220, inks: [GREEN, INK] };
}

export function signatureFixture(): DrawnImage {
  const image = blank(460, 180);
  const ink = { r: 22, g: 22, b: 24 };
  strokePolyline(image, cubicPoints([28, 100], [90, 24], [150, 150], [230, 48], 70), 3.2, ink);
  strokePolyline(image, cubicPoints([210, 78], [270, 28], [320, 140], [430, 64], 70), 2.6, ink);
  strokePolyline(image, cubicPoints([36, 128], [140, 168], [250, 40], [420, 132], 80), 2.2, ink);
  fillCircle(image, 248, 58, 3.2, ink);
  return { image, width: 460, height: 180, inks: [ink] };
}

export function lineArtFixture(): DrawnImage {
  const image = blank(300, 220);
  const ink = { r: 10, g: 10, b: 12 };
  strokePolyline(image, [[24, 28], [250, 28], [250, 180], [24, 180], [24, 28]], 3, ink);
  strokePolyline(image, [[70, 52], [200, 78]], 3, ink);
  strokeCircle(image, 86, 142, 22, 3, ink);
  return { image, width: 300, height: 220, inks: [ink] };
}

export function illustrationFixture(): DrawnImage {
  const red = { r: 214, g: 48, b: 42 };
  const blue = { r: 36, g: 92, b: 196 };
  const yellow = { r: 236, g: 176, b: 32 };
  const purple = { r: 132, g: 42, b: 168 };
  const teal = { r: 18, g: 148, b: 132 };
  const orange = { r: 224, g: 112, b: 28 };
  const image = blank(320, 220);
  fillCircle(image, 62, 64, 36, red);
  fillCircle(image, 160, 70, 40, blue);
  fillRect(image, 220, 36, 72, 70, purple);
  fillRect(image, 36, 130, 110, 58, yellow);
  fillCircle(image, 200, 158, 30, teal);
  fillRect(image, 246, 128, 52, 58, orange);
  return { image, width: 320, height: 220, inks: [red, blue, yellow, purple, teal, orange] };
}
