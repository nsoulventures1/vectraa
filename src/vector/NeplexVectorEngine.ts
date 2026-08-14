import { assertSafeSvg, inspectSvg } from './quality';
import { clampOptions } from './presets';
import type { VectorEngine, VectorResult, VectorizeOptions } from './types';
import { validateRasterFile } from './validateInput';
import type { WorkerRequest, WorkerResponse } from './workerProtocol';

const READY_TIMEOUT_MS = 15_000;
const RUN_TIMEOUT_MS = 120_000;

export class NeplexVectorEngine implements VectorEngine {
  readonly id = 'neplex-vtracer-wasm';

  async vectorize(file: File, options: VectorizeOptions): Promise<VectorResult> {
    validateRasterFile(file);
    const source = await file.arrayBuffer();
    const worker = new Worker(new URL('./vectorizer.worker.ts', import.meta.url), { type: 'module' });

    try {
      await waitForReady(worker);
      const result = await runWorker(worker, source, clampOptions(options));
      const svg = assertSafeSvg(result.svg);
      return { svg, elapsedMs: result.elapsedMs, quality: inspectSvg(svg) };
    } finally {
      worker.terminate();
    }
  }
}

function waitForReady(worker: Worker): Promise<void> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('Vector engine took too long to initialize.')), READY_TIMEOUT_MS);
    const onMessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.type !== 'ready') return;
      window.clearTimeout(timeout);
      worker.removeEventListener('message', onMessage);
      resolve();
    };
    worker.addEventListener('message', onMessage);
    worker.addEventListener('error', () => reject(new Error('Vector engine failed to initialize.')), { once: true });
  });
}

function runWorker(worker: Worker, source: ArrayBuffer, options: VectorizeOptions): Promise<{ svg: string; elapsedMs: number }> {
  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => reject(new Error('This image exceeded Vectraa’s safe processing time. Try a smaller image or simpler preset.')), RUN_TIMEOUT_MS);
    worker.onmessage = (event: MessageEvent<WorkerResponse>) => {
      if (event.data.type === 'complete') {
        window.clearTimeout(timeout);
        resolve(event.data);
      } else if (event.data.type === 'error') {
        window.clearTimeout(timeout);
        reject(new Error(event.data.message));
      }
    };
    worker.onerror = (event) => {
      window.clearTimeout(timeout);
      reject(new Error(event.message || 'Vectorization worker failed.'));
    };
    const request: WorkerRequest = { type: 'vectorize', source, options };
    worker.postMessage(request, [source]);
  });
}
