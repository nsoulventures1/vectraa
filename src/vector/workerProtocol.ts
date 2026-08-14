import type { VectorizeOptions } from './types';

export type WorkerRequest = {
  type: 'vectorize';
  source: ArrayBuffer;
  options: VectorizeOptions;
};

export type WorkerResponse =
  | { type: 'ready' }
  | { type: 'complete'; svg: string; elapsedMs: number }
  | { type: 'error'; message: string };
