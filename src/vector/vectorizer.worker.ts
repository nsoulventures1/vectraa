/// <reference lib="webworker" />

import {
  ColorMode,
  Hierarchical,
  OptimizePreset,
  PathSimplifyMode,
  optimizeSync,
  vectorizeSync,
} from '@neplex/vectorizer';
import type { Config } from '@neplex/vectorizer';
import { toNeplexConfig } from './neplexConfig';
import type { WorkerRequest, WorkerResponse } from './workerProtocol';

const scope: DedicatedWorkerGlobalScope = self as unknown as DedicatedWorkerGlobalScope;

function post(message: WorkerResponse) {
  scope.postMessage(message);
}

scope.onmessage = (event: MessageEvent<WorkerRequest>) => {
  if (event.data.type !== 'vectorize') return;

  try {
    const started = performance.now();
    const mapped = toNeplexConfig(event.data.options);
    const config: Config = {
      colorMode: mapped.binary ? ColorMode.Binary : ColorMode.Color,
      hierarchical: mapped.cutout ? Hierarchical.Cutout : Hierarchical.Stacked,
      filterSpeckle: mapped.filterSpeckle,
      colorPrecision: mapped.colorPrecision,
      layerDifference: mapped.layerDifference,
      mode: mapped.polygon ? PathSimplifyMode.Polygon : PathSimplifyMode.Spline,
      cornerThreshold: mapped.cornerThreshold,
      lengthThreshold: mapped.lengthThreshold,
      maxIterations: mapped.maxIterations,
      spliceThreshold: mapped.spliceThreshold,
      pathPrecision: mapped.pathPrecision,
      unusedColorIterations: 24,
      keyingThreshold: 0.2,
      smallCircle: 2,
    };

    const raw = vectorizeSync(
      new Uint8Array(event.data.source) as unknown as Parameters<typeof vectorizeSync>[0],
      config,
    );
    const svg = optimizeSync(raw, {
      preset: OptimizePreset.Safe,
      multipass: true,
      multipassIterations: 3,
    });

    post({ type: 'complete', svg, elapsedMs: performance.now() - started });
  } catch (error) {
    post({ type: 'error', message: error instanceof Error ? error.message : String(error) });
  }
};

post({ type: 'ready' });
