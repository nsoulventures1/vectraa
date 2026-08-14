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
  contrastBoost: 0.12,
  colorLevels: 12,
};

export function recommendedLogoRescueOptions(analysis: ImageAnalysis): LogoRescueOptions {
  const noisy = analysis.signals.edgeDensity > 0.24;
  const colorful = analysis.signals.colorComplexity > 0.4;
  return {
    removeNearWhiteBackground: !analysis.hasAlpha && analysis.signals.lightBackground > 0.35,
    denoiseStrength: noisy ? 2 : 1,
    contrastBoost: analysis.signals.lightBackground > 0.55 ? 0.18 : 0.1,
    colorLevels: colorful ? 18 : 10,
  };
}

export async function preprocessLogoForRescue(file: File, options: LogoRescueOptions): Promise<File> {
  const bitmap = await createImageBitmap(file);
  try {
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Vectraa could not prepare this logo for rescue.');
    context.drawImage(bitmap, 0, 0);

    const image = context.getImageData(0, 0, bitmap.width, bitmap.height);
    let data = image.data;
    if (options.denoiseStrength > 0) {
      data = boxDenoise(data, bitmap.width, bitmap.height, options.denoiseStrength);
    }
    applyContrastAndQuantization(data, options);
    const ownedPixels = new Uint8ClampedArray(data.length);
    ownedPixels.set(data);
    context.putImageData(new ImageData(ownedPixels, bitmap.width, bitmap.height), 0, 0);

    const blob = await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((value) => value ? resolve(value) : reject(new Error('Vectraa could not create the cleaned logo.')), 'image/png');
    });
    return new File([blob], `${file.name.replace(/\.[^.]+$/, '')}-rescued-source.png`, { type: 'image/png' });
  } finally {
    bitmap.close();
  }
}

export function quantizeChannel(value: number, levels: number): number {
  const safeLevels = Math.max(2, Math.min(32, Math.round(levels)));
  const step = 255 / (safeLevels - 1);
  return Math.max(0, Math.min(255, Math.round(Math.round(value / step) * step)));
}

function applyContrastAndQuantization(data: Uint8ClampedArray, options: LogoRescueOptions): void {
  const contrast = Math.max(-0.5, Math.min(0.5, options.contrastBoost));
  const factor = (259 * (contrast * 255 + 255)) / (255 * (259 - contrast * 255));

  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] === 0) continue;
    let r = clampByte(factor * (data[i] - 128) + 128);
    let g = clampByte(factor * (data[i + 1] - 128) + 128);
    let b = clampByte(factor * (data[i + 2] - 128) + 128);

    if (options.removeNearWhiteBackground && r > 242 && g > 242 && b > 242) {
      data[i + 3] = 0;
      continue;
    }

    r = quantizeChannel(r, options.colorLevels);
    g = quantizeChannel(g, options.colorLevels);
    b = quantizeChannel(b, options.colorLevels);
    data[i] = r;
    data[i + 1] = g;
    data[i + 2] = b;
  }
}

function boxDenoise(source: Uint8ClampedArray, width: number, height: number, radius: number): Uint8ClampedArray {
  const safeRadius = Math.max(1, Math.min(2, Math.round(radius)));
  const output = new Uint8ClampedArray(source.length);
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      if (source[index + 3] < 8) {
        output.set(source.slice(index, index + 4), index);
        continue;
      }
      let r = 0, g = 0, b = 0, a = 0, samples = 0;
      for (let dy = -safeRadius; dy <= safeRadius; dy += 1) {
        const sy = Math.max(0, Math.min(height - 1, y + dy));
        for (let dx = -safeRadius; dx <= safeRadius; dx += 1) {
          const sx = Math.max(0, Math.min(width - 1, x + dx));
          const si = (sy * width + sx) * 4;
          r += source[si]; g += source[si + 1]; b += source[si + 2]; a += source[si + 3]; samples += 1;
        }
      }
      output[index] = r / samples;
      output[index + 1] = g / samples;
      output[index + 2] = b / samples;
      output[index + 3] = a / samples;
    }
  }
  return output;
}

function clampByte(value: number): number {
  return Math.max(0, Math.min(255, Math.round(value)));
}
