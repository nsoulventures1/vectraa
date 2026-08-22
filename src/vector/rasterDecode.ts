const decodedRasterCache = new WeakMap<File, Promise<ImageData>>();

/**
 * Decode each uploaded File only once and share the resulting pixels between image
 * analysis and vectorization. This removes the fragile second browser decode that was
 * occurring after analysis had already proved the image was valid.
 */
export function decodeRaster(file: File): Promise<ImageData> {
  const cached = decodedRasterCache.get(file);
  if (cached) return cached;

  const pending = decodeRasterUncached(file).catch((error) => {
    decodedRasterCache.delete(file);
    throw error;
  });
  decodedRasterCache.set(file, pending);
  return pending;
}

async function decodeRasterUncached(file: File): Promise<ImageData> {
  const bytes = await file.arrayBuffer();
  if (!bytes.byteLength) throw new Error('The source image is empty.');
  const mime = file.type || 'application/octet-stream';

  // Chrome's native bitmap decoder is the same path that Vectraa previously used
  // successfully during analysis, so keep it authoritative and cache its pixels.
  try {
    const blob = new Blob([bytes.slice(0)], { type: mime });
    const bitmap = await createImageBitmap(blob);
    try {
      return renderDrawable(bitmap, bitmap.width, bitmap.height);
    } finally {
      bitmap.close();
    }
  } catch (bitmapError) {
    try {
      return await decodeBytesWithHtmlImage(bytes, mime);
    } catch (imageError) {
      const bitmapMessage = bitmapError instanceof Error ? bitmapError.message : 'createImageBitmap failed';
      const imageMessage = imageError instanceof Error ? imageError.message : 'HTML image decode failed';
      throw new Error(`Raster decode failed [bitmap: ${bitmapMessage}; image: ${imageMessage}]`);
    }
  }
}

function renderDrawable(source: CanvasImageSource, sourceWidth: number, sourceHeight: number): ImageData {
  const maxDimension = 3000;
  const scale = Math.min(1, maxDimension / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Vectraa could not create a raster canvas.');
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.clearRect(0, 0, width, height);
  context.drawImage(source, 0, 0, width, height);
  return context.getImageData(0, 0, width, height);
}

async function decodeBytesWithHtmlImage(bytes: ArrayBuffer, mime: string): Promise<ImageData> {
  const blob = new Blob([bytes.slice(0)], { type: mime });
  const url = URL.createObjectURL(blob);
  try {
    const image = new Image();
    image.decoding = 'async';
    const loaded = new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('browser image decoder rejected source bytes'));
    });
    image.src = url;
    await loaded;
    const width = image.naturalWidth || image.width;
    const height = image.naturalHeight || image.height;
    if (!width || !height) throw new Error('decoded image has zero dimensions');
    return renderDrawable(image, width, height);
  } finally {
    URL.revokeObjectURL(url);
  }
}
