export interface BrowserCapabilities {
  webAssembly: boolean;
  worker: boolean;
  imageBitmap: boolean;
  canvas: boolean;
  blobUrl: boolean;
  supported: boolean;
  reasons: string[];
}

export function detectBrowserCapabilities(scope: typeof globalThis = globalThis): BrowserCapabilities {
  const webAssembly = typeof scope.WebAssembly !== 'undefined';
  const worker = typeof scope.Worker !== 'undefined';
  const imageBitmap = typeof scope.createImageBitmap === 'function';
  const canvas = typeof scope.document !== 'undefined' && typeof scope.document.createElement === 'function';
  const blobUrl = typeof scope.URL !== 'undefined' && typeof scope.URL.createObjectURL === 'function';
  const reasons: string[] = [];

  if (!webAssembly) reasons.push('WebAssembly is unavailable.');
  if (!worker) reasons.push('Web Workers are unavailable.');
  if (!imageBitmap) reasons.push('Browser image decoding is unavailable.');
  if (!canvas) reasons.push('Canvas rendering is unavailable.');
  if (!blobUrl) reasons.push('Local file preview support is unavailable.');

  return {
    webAssembly,
    worker,
    imageBitmap,
    canvas,
    blobUrl,
    supported: reasons.length === 0,
    reasons,
  };
}

export function browserSupportMessage(capabilities: BrowserCapabilities): string {
  if (capabilities.supported) return '';
  return `This browser cannot run Vectraa’s local vector engine yet. ${capabilities.reasons.join(' ')} Try a current version of Chrome, Edge, Firefox or Safari.`;
}
