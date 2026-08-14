import { detectRasterMime, type SupportedRasterMime } from './fileSignature';

const ALLOWED_TYPES = new Set<SupportedRasterMime>(['image/jpeg', 'image/png', 'image/webp']);
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

export function validateRasterFile(file: File): void {
  if (!ALLOWED_TYPES.has(file.type as SupportedRasterMime)) {
    throw new Error('Use a JPG, PNG or WebP image.');
  }
  if (file.size === 0) throw new Error('The selected file is empty.');
  if (file.size > MAX_FILE_BYTES) throw new Error('For this release, images must be 20 MB or smaller.');
}

export async function validateRasterFileSignature(file: File): Promise<SupportedRasterMime> {
  validateRasterFile(file);
  const header = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  const detected = detectRasterMime(header);
  if (!detected) throw new Error('This file does not contain a valid JPG, PNG or WebP signature.');
  if (detected !== file.type) throw new Error(`The file contents are ${detected.replace('image/', '').toUpperCase()}, but the browser reported ${file.type.replace('image/', '').toUpperCase()}. Please use the original image file.`);
  return detected;
}
