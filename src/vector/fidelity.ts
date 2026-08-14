export interface FidelityResult {
  score: number;
  meanAbsoluteError: number;
  changedPixelRatio: number;
  sampleWidth: number;
  sampleHeight: number;
}

const SAMPLE_EDGE = 192;
const PIXEL_CHANGE_THRESHOLD = 28;

export async function compareRasterToSvg(file: File, svg: string): Promise<FidelityResult> {
  const sourceBitmap = await createImageBitmap(file);
  const svgBlob = new Blob([svg], { type: 'image/svg+xml;charset=utf-8' });
  const svgBitmap = await createImageBitmap(svgBlob);

  try {
    const { width, height } = normalizedSize(sourceBitmap.width, sourceBitmap.height);
    const sourcePixels = renderBitmap(sourceBitmap, width, height);
    const vectorPixels = renderBitmap(svgBitmap, width, height);

    let totalError = 0;
    let changedPixels = 0;
    const pixelCount = width * height;

    for (let i = 0; i < sourcePixels.length; i += 4) {
      const dr = Math.abs(sourcePixels[i] - vectorPixels[i]);
      const dg = Math.abs(sourcePixels[i + 1] - vectorPixels[i + 1]);
      const db = Math.abs(sourcePixels[i + 2] - vectorPixels[i + 2]);
      const da = Math.abs(sourcePixels[i + 3] - vectorPixels[i + 3]);
      const error = (dr + dg + db + da) / 4;
      totalError += error;
      if (error > PIXEL_CHANGE_THRESHOLD) changedPixels += 1;
    }

    const meanAbsoluteError = totalError / Math.max(1, pixelCount);
    const changedPixelRatio = changedPixels / Math.max(1, pixelCount);
    const normalizedError = Math.min(1, meanAbsoluteError / 255);
    const score = Math.max(0, Math.round(100 * (1 - (normalizedError * 0.68 + changedPixelRatio * 0.32))));

    return { score, meanAbsoluteError, changedPixelRatio, sampleWidth: width, sampleHeight: height };
  } finally {
    sourceBitmap.close();
    svgBitmap.close();
  }
}

export function scoreFidelityMetrics(meanAbsoluteError: number, changedPixelRatio: number): number {
  const normalizedError = Math.min(1, Math.max(0, meanAbsoluteError) / 255);
  const changed = Math.min(1, Math.max(0, changedPixelRatio));
  return Math.max(0, Math.round(100 * (1 - (normalizedError * 0.68 + changed * 0.32))));
}

function normalizedSize(width: number, height: number): { width: number; height: number } {
  const scale = Math.min(1, SAMPLE_EDGE / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

function renderBitmap(bitmap: ImageBitmap, width: number, height: number): Uint8ClampedArray {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d', { willReadFrequently: true });
  if (!context) throw new Error('Vectraa could not create a fidelity comparison canvas.');
  context.clearRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  return context.getImageData(0, 0, width, height).data;
}
