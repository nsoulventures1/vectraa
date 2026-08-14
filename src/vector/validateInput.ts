const ALLOWED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const MAX_FILE_BYTES = 20 * 1024 * 1024;

export function validateRasterFile(file: File): void {
  if (!ALLOWED_TYPES.has(file.type)) {
    throw new Error('Use a JPG, PNG or WebP image.');
  }
  if (file.size === 0) throw new Error('The selected file is empty.');
  if (file.size > MAX_FILE_BYTES) throw new Error('For this release, images must be 20 MB or smaller.');
}
