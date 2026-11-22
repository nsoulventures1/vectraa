/**
 * Vitest runs in Node, which has no ImageData. The tracer constructs ImageData
 * while building layer masks, so tests install the same shape the browser provides.
 */
if (typeof globalThis.ImageData === 'undefined') {
  class ImageDataPolyfill {
    data: Uint8ClampedArray;
    width: number;
    height: number;
    colorSpace = 'srgb' as const;

    constructor(dataOrWidth: Uint8ClampedArray | number, widthOrHeight: number, height?: number) {
      if (typeof dataOrWidth === 'number') {
        this.width = dataOrWidth;
        this.height = widthOrHeight;
        this.data = new Uint8ClampedArray(this.width * this.height * 4);
      } else {
        this.data = dataOrWidth;
        this.width = widthOrHeight;
        this.height = height ?? 0;
      }
    }
  }

  globalThis.ImageData = ImageDataPolyfill as unknown as typeof ImageData;
}
