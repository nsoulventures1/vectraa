import type { ImageAnalysis } from './types';

export interface LogoRescueOptions {
  removeNearWhiteBackground: boolean;
  denoiseStrength: number;
  contrastBoost: number;
  colorLevels: number;
}

export const DEFAULT_LOGO_RESCUE: LogoRescueOptions = {
  removeNearWhiteBackground: true,
  denoiseStrength: 1,
  contrastBoost: 0.16,
  colorLevels: 8,
};

export function recommendedLogoRescueOptions(analysis: ImageAnalysis): LogoRescueOptions {
  const noisy = analysis.signals.edgeDensity > 0.24;
  const colorful = analysis.signals.colorComplexity > 0.4;
  return {
    removeNearWhiteBackground: !analysis.hasAlpha && analysis.signals.lightBackground > 0.35,
    denoiseStrength: noisy ? 2 : 1,
    contrastBoost: analysis.signals.lightBackground > 0.55 ? 0.22 : 0.12,
    colorLevels: colorful ? 12 : 6,
  };
}

export async function preprocessLogoForRescue(file: File, options: LogoRescueOptions): Promise<File> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error('Vectraa could not decode the original logo for rescue.');
  }

  try {
    const maxDimension = 1800;
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Vectraa could not prepare this logo for rescue.');
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, width, height);

    const image = context.getImageData(0, 0, width, height);
    const source = new Uint8ClampedArray(new ArrayBuffer(image.data.length));
    source.set(image.data);
    const data = options.denoiseStrength > 0
      ? edgePreservingDenoise(source, width, height, options.denoiseStrength)
      : source;

    applyContrastAndQuantization(data, options);
    removeIsolatedSpeckles(data, width, height);

    const rendered = new ImageData(width, height);
    rendered.data.set(data);
    context.putImageData(rendered, 0, 0);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Vectraa could not create the cleaned logo.')), 'image/png');
    });

    // IMPORTANT: Blob.type is not reliable enough to use as the File.type passed
    // into the next validation/decode stage. Explicitly declare the generated
    // rescue asset as PNG so Chrome/Cloudflare builds do not hand the vector engine
    // an empty/ambiguous MIME type after canvas.toBlob().
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}-rescued-source.png`, {
      type: 'image/png',
      lastModified: Date.now(),
    });
  } finally {
    bitmap.close();
  }
}

export function quantizeChannel(value: number, levels: number): number {
  const safeLevels = Math.max(2, Math.min(32, Math.round(levels)));
  const step = 255 / (safeLevels - 1);
  return Math.max(0, Math.min(255, Math.round(Math.round(value / step) * step)));
}

function applyContrastAndQuantization(data: Uint8ClampedArray<ArrayBuffer>, options: LogoRescueOptions): void {
  const contrast = Math.max(-0.5, Math.min(0.5, options.contrastBoost));
  const factor = (259 * (contrast * 255 + 255)) / (255 * (259 - contrast * 255));

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    let r = clampByte(factor * (data[i] - 128) + 128);
    let g = clampByte(factor * (data[i + 1] - 128) + 128);
    let b = clampByte(factor * (data[i + 2] - 128) + 128);
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const chroma = max - min;
    const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;

    if (options.removeNearWhiteBackground && luminance > 236 && chroma < 28) {
      data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 0;
      continue;
    }

    if (options.removeNearWhiteBackground && luminance > 224 && chroma < 16) {
      data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 0;
      continue;
    }

    r = quantizeChannel(r, options.colorLevels);
    g = quantizeChannel(g, options.colorLevels);
    b = quantizeChannel(b, options.colorLevels);
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
    data[i + 3] = 255;
  }
}

function edgePreservingDenoise(source: Uint8ClampedArray<ArrayBuffer>, width: number, height: number, strength: number): Uint8ClampedArray<ArrayBuffer> {
  const radius = Math.max(1, Math.min(2, Math.round(strength)));
  const output = new Uint8ClampedArray(new ArrayBuffer(source.length));
  const spatialSigma = radius === 1 ? 1.2 : 1.8;
  const colorSigma = radius === 1 ? 42 : 56;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const cr = source[index], cg = source[index + 1], cb = source[index + 2], ca = source[index + 3];
      if (ca < 8) {
        output.set(source.subarray(index, index + 4), index);
        continue;
      }
      let r = 0, g = 0, b = 0, a = 0, weightSum = 0;
      for (let dy = -radius; dy <= radius; dy += 1) {
        const sy = Math.max(0, Math.min(height - 1, y + dy));
        for (let dx = -radius; dx <= radius; dx += 1) {
          const sx = Math.max(0, Math.min(width - 1, x + dx));
          const si = (sy * width + sx) * 4;
          const dr = source[si] - cr, dg = source[si + 1] - cg, db = source[si + 2] - cb;
          const spatial = Math.exp(-(dx * dx + dy * dy) / (2 * spatialSigma * spatialSigma));
          const color = Math.exp(-(dr * dr + dg * dg + db * db) / (2 * colorSigma * colorSigma));
          const weight = spatial * color;
          r += source[si] * weight; g += source[si + 1] * weight; b += source[si + 2] * weight; a += source[si + 3] * weight;
          weightSum += weight;
        }
      }
      output[index] = r / weightSum;
      output[index + 1] = g / weightSum;
      output[index + 2] = b / weightSum;
      output[index + 3] = a / weightSum;
    }
  }
  return output;
}

function removeIsolatedSpeckles(data: Uint8ClampedArray<ArrayBuffer>, width: number, height: number): void {
  if (width < 3 || height < 3) return;
  const alpha = new Uint8Array(width * height);
  for (let p = 0, i = 3; i < data.length; p += 1, i += 4) alpha[p] = data[i];

  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const p = y * width + x;
      if (alpha[p] < 128) continue;
      let visibleNeighbours = 0;
      for (let dy = -1; dy <= 1; dy += 1) {
        for (let dx = -1; dx <= 1; dx += 1) {
          if (dx === 0 && dy === 0) continue;
          if (alpha[(y + dy) * width + (x + dx)] >= 128) visibleNeighbours += 1;
        }
      }
      if (visibleNeighbours <= 1) data[p * 4 + 3] = 0;
    }
  }
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}
