export interface Rgb {
  r: number;
  g: number;
  b: number;
}

export interface Lab {
  l: number;
  a: number;
  b: number;
}

export function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}

export function rgbCss(color: Rgb): string {
  return `rgb(${clampByte(color.r)},${clampByte(color.g)},${clampByte(color.b)})`;
}

export function luminance(color: Rgb): number {
  return 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
}

export function rgbToHsv(color: Rgb): { h: number; s: number; v: number } {
  const r = color.r / 255;
  const g = color.g / 255;
  const b = color.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d) {
    if (max === r) h = 60 * (((g - b) / d) % 6);
    else if (max === g) h = 60 * ((b - r) / d + 2);
    else h = 60 * ((r - g) / d + 4);
  }
  if (h < 0) h += 360;
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

export function rgbToLab(color: Rgb): Lab {
  const linear = [color.r, color.g, color.b].map((value) => {
    const channel = value / 255;
    return channel <= 0.04045 ? channel / 12.92 : Math.pow((channel + 0.055) / 1.055, 2.4);
  });
  const x = (linear[0] * 0.4124 + linear[1] * 0.3576 + linear[2] * 0.1805) / 0.95047;
  const y = linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
  const z = (linear[0] * 0.0193 + linear[1] * 0.1192 + linear[2] * 0.9505) / 1.08883;
  const f = (value: number) => (value > 0.008856 ? Math.cbrt(value) : 7.787 * value + 16 / 116);
  const fx = f(x);
  const fy = f(y);
  const fz = f(z);
  return { l: 116 * fy - 16, a: 500 * (fx - fy), b: 200 * (fy - fz) };
}

export function deltaE76(a: Lab, b: Lab): number {
  return Math.hypot(a.l - b.l, a.a - b.a, a.b - b.b);
}

export function deltaERgb(a: Rgb, b: Rgb): number {
  return deltaE76(rgbToLab(a), rgbToLab(b));
}

/** True for paper, JPEG white, and the pale halo around a light canvas. */
export function isNearBackground(color: Rgb, background: Rgb): boolean {
  const hsv = rgbToHsv(color);
  const distance = deltaERgb(color, background);
  const lumGap = Math.abs(luminance(color) - luminance(background));
  if (hsv.s < 0.12 && distance < 14 && lumGap < 24) return true;
  // Antialiased paper around a flat mark is pale and low-chroma, but often
  // just outside the strict white threshold. It is not a brand colour.
  return hsv.s < 0.16 && luminance(color) > 198 && luminance(background) > 205 && distance < 30;
}

export function readRgb(source: ImageData, x: number, y: number): Rgb {
  const i = (y * source.width + x) * 4;
  return { r: source.data[i], g: source.data[i + 1], b: source.data[i + 2] };
}

export function estimateCornerBackground(source: ImageData): Rgb {
  const colors: Rgb[] = [];
  const band = Math.max(2, Math.round(Math.min(source.width, source.height) * 0.06));
  const step = Math.max(1, Math.floor(band / 6));
  const origins = [
    [0, 0],
    [source.width - band, 0],
    [0, source.height - band],
    [source.width - band, source.height - band],
  ];
  for (const [originX, originY] of origins) {
    for (let y = originY; y < originY + band; y += step) {
      for (let x = originX; x < originX + band; x += step) {
        if (x < 0 || y < 0 || x >= source.width || y >= source.height) continue;
        const i = (y * source.width + x) * 4;
        if (source.data[i + 3] < 20) continue;
        colors.push({ r: source.data[i], g: source.data[i + 1], b: source.data[i + 2] });
      }
    }
  }
  if (!colors.length) return { r: 255, g: 255, b: 255 };
  const channel = (key: keyof Rgb) => {
    const sorted = colors.map((color) => color[key]).sort((a, b) => a - b);
    return sorted[Math.floor(sorted.length / 2)];
  };
  return { r: channel('r'), g: channel('g'), b: channel('b') };
}
