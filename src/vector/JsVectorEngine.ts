import ImageTracer from 'imagetracerjs';
import { assertSafeSvg, inspectSvg } from './quality';
import { vectorizeLogoHighFidelity } from './LogoVectorPipeline';
import { tryVectorizeBandedBadge } from './BandedBadgePipeline';
import { tryVectorizeCenteredBandedBadge } from './CenteredBandedBadgePipeline';
import { clampOptions } from './presets';
import { decodeRaster } from './rasterDecode';
import { sanitizeGeneratedSvg } from './sanitizeSvg';
import type { VectorEngine, VectorResult, VectorizeOptions } from './types';
import { validateRasterFileSignature } from './validateInput';

interface Rgb { r: number; g: number; b: number }
interface PreparedLogo { imageData: ImageData; denoised: boolean; consolidated: boolean; dominantColors: number }

/** Browser vector engine. */
export class JsVectorEngine implements VectorEngine {
  readonly id = 'imagetracer-js';

  async vectorize(file: File, rawOptions: VectorizeOptions): Promise<VectorResult> {
    await validateRasterFileSignature(file);
    const options = clampOptions(rawOptions);
    const started = performance.now();
    const decoded = await decodeRaster(file);

    if (options.preset === 'logo') {
      const precisionOptions = logoPrecisionOptions(options);
      const preparedLogo = prepareLogoArtwork(decoded);

      const centeredBadge = tryVectorizeCenteredBandedBadge(preparedLogo.imageData, precisionOptions);
      if (centeredBadge) {
        const svg = assertSafeSvg(sanitizeGeneratedSvg(centeredBadge));
        const structural = inspectSvg(svg);
        const adaptiveWarnings: string[] = ['Centred banded-badge reconstruction replaced raster circle/band edges with exact SVG geometry.'];
        if (preparedLogo.denoised) adaptiveWarnings.push('Adaptive logo cleanup removed low-amplitude raster noise while protecting strong edges.');
        if (preparedLogo.consolidated) adaptiveWarnings.push(`Flat-logo mode consolidated raster shades into ${preparedLogo.dominantColors} dominant source colours before badge reconstruction.`);
        return {
          svg,
          elapsedMs: Math.round(performance.now() - started),
          quality: {
            ...structural,
            score: Math.min(structural.score, 94),
            warnings: [...new Set([...structural.warnings, ...adaptiveWarnings])],
          },
        };
      }

      const bandedBadge = tryVectorizeBandedBadge(preparedLogo.imageData, precisionOptions);
      if (bandedBadge) {
        const svg = assertSafeSvg(sanitizeGeneratedSvg(bandedBadge));
        const structural = inspectSvg(svg);
        const adaptiveWarnings: string[] = ['Banded-badge reconstruction replaced raster circle/band edges with clean SVG primitives.'];
        if (preparedLogo.denoised) adaptiveWarnings.push('Adaptive logo cleanup removed low-amplitude raster noise while protecting strong edges.');
        if (preparedLogo.consolidated) adaptiveWarnings.push(`Flat-logo mode consolidated raster shades into ${preparedLogo.dominantColors} dominant source colours before badge reconstruction.`);
        return {
          svg,
          elapsedMs: Math.round(performance.now() - started),
          quality: {
            ...structural,
            score: Math.min(structural.score, 90),
            warnings: [...new Set([...structural.warnings, ...adaptiveWarnings])],
          },
        };
      }

      try {
        const result = await withSvgBitmapFallback(() => vectorizeLogoHighFidelity(preparedLogo.imageData, precisionOptions));
        const svg = assertSafeSvg(sanitizeGeneratedSvg(result.svg));
        const structural = inspectSvg(svg);
        const adaptiveWarnings: string[] = [];
        if (preparedLogo.denoised) adaptiveWarnings.push('Adaptive logo cleanup removed low-amplitude raster noise while protecting strong edges.');
        if (preparedLogo.consolidated) adaptiveWarnings.push(`Flat-logo mode consolidated raster shades into ${preparedLogo.dominantColors} dominant source colours before tracing.`);
        return {
          svg,
          elapsedMs: Math.round(performance.now() - started),
          quality: {
            ...structural,
            score: Math.min(structural.score, result.quality.score),
            warnings: [...new Set([...structural.warnings, ...result.quality.warnings, ...adaptiveWarnings])],
          },
        };
      } catch (error) {
        const fallback = preparedLogo.consolidated
          ? traceFlatLogoFallback(preparedLogo.imageData, precisionOptions, preparedLogo.dominantColors)
          : traceGeneric(preparedLogo.imageData, precisionOptions);
        const svg = assertSafeSvg(sanitizeGeneratedSvg(fallback));
        const structural = inspectSvg(svg);
        const reason = error instanceof Error ? error.message : 'high-fidelity logo pipeline failed';
        const adaptiveWarnings: string[] = [];
        if (preparedLogo.denoised) adaptiveWarnings.push('Adaptive logo cleanup remained active in fallback tracing.');
        if (preparedLogo.consolidated) adaptiveWarnings.push(`Flat-logo fallback traced only ${preparedLogo.dominantColors} dominant source colours to suppress raster shade proliferation.`);
        return {
          svg,
          elapsedMs: Math.round(performance.now() - started),
          quality: {
            ...structural,
            score: Math.min(structural.score, 82),
            warnings: [...new Set([...structural.warnings, `High-fidelity logo pipeline fell back: ${reason}`, ...adaptiveWarnings])],
          },
        };
      }
    }

    const svg = assertSafeSvg(sanitizeGeneratedSvg(traceGeneric(decoded, options)));
    return { svg, elapsedMs: Math.round(performance.now() - started), quality: inspectSvg(svg) };
  }
}

function logoPrecisionOptions(options: VectorizeOptions): VectorizeOptions {
  return {
    ...options,
    colors: Math.max(options.colors, 16),
    detail: Math.max(options.detail, 92),
    smoothing: Math.min(options.smoothing, 8),
  };
}

function traceGeneric(imageData: ImageData, options: VectorizeOptions): string {
  const detail = options.detail / 100;
  const smooth = options.smoothing / 100;
  return ImageTracer.imagedataToSVG(imageData, {
    ltres: Math.max(0.05, 1.2 - detail * 1.12),
    qtres: Math.max(0.05, 1.2 - detail * 1.08),
    pathomit: 0,
    rightangleenhance: true,
    colorsampling: 2,
    numberofcolors: options.colors,
    mincolorratio: 0,
    colorquantcycles: 3,
    layering: 0,
    strokewidth: 0,
    linefilter: false,
    scale: 1,
    roundcoords: Math.max(2, Math.round(6 - smooth * 4)),
    viewbox: true,
    desc: false,
    blurradius: 0,
    blurdelta: 0,
  });
}

function traceFlatLogoFallback(imageData: ImageData, options: VectorizeOptions, dominantColors: number): string {
  return ImageTracer.imagedataToSVG(imageData, {
    ltres: 0.12,
    qtres: 0.16,
    pathomit: 0,
    rightangleenhance: true,
    colorsampling: 2,
    numberofcolors: Math.max(2, Math.min(12, dominantColors + 2)),
    mincolorratio: 0.00015,
    colorquantcycles: 2,
    layering: 0,
    strokewidth: 0,
    linefilter: false,
    scale: 1,
    roundcoords: 5,
    viewbox: true,
    desc: false,
    blurradius: 0,
    blurdelta: 0,
  });
}

function prepareLogoArtwork(source: ImageData): PreparedLogo {
  const denoised = edgeAwareDenoise(source);
  const colors = estimateDominantColorCount(denoised.imageData);
  if (colors <= 14) {
    const consolidated = consolidateFlatLogoColors(denoised.imageData, Math.max(2, colors));
    return { imageData: consolidated, denoised: denoised.changed, consolidated: true, dominantColors: colors };
  }
  return { imageData: denoised.imageData, denoised: denoised.changed, consolidated: false, dominantColors: colors };
}

function edgeAwareDenoise(source: ImageData): { imageData: ImageData; changed: boolean } {
  const out = new ImageData(new Uint8ClampedArray(source.data), source.width, source.height);
  let changed = false;
  const w = source.width, h = source.height;
  for (let y = 1; y < h - 1; y += 1) for (let x = 1; x < w - 1; x += 1) {
    const center = readRgb(source, x, y);
    const neighbors = [readRgb(source,x-1,y),readRgb(source,x+1,y),readRgb(source,x,y-1),readRgb(source,x,y+1)];
    const close = neighbors.filter((c) => rgbDistance(c, center) < 26);
    if (close.length < 3) continue;
    const avg = averageRgb([...close, center]);
    if (rgbDistance(avg, center) > 3) {
      const i = (y*w+x)*4; out.data[i]=avg.r; out.data[i+1]=avg.g; out.data[i+2]=avg.b; changed=true;
    }
  }
  return { imageData: out, changed };
}

function estimateDominantColorCount(source: ImageData): number {
  const buckets = new Set<string>();
  const step = Math.max(1, Math.floor(Math.max(source.width, source.height) / 300));
  for (let y=0;y<source.height;y+=step) for(let x=0;x<source.width;x+=step){
    const c=readRgb(source,x,y); buckets.add(`${Math.round(c.r/32)},${Math.round(c.g/32)},${Math.round(c.b/32)}`);
    if(buckets.size>20)return buckets.size;
  }
  return buckets.size;
}

function consolidateFlatLogoColors(source: ImageData, target: number): ImageData {
  const out = new ImageData(new Uint8ClampedArray(source.data), source.width, source.height);
  const counts = new Map<string,{c:Rgb;n:number}>();
  const step=Math.max(1,Math.floor(Math.max(source.width,source.height)/350));
  for(let y=0;y<source.height;y+=step)for(let x=0;x<source.width;x+=step){const c=readRgb(source,x,y);const k=`${Math.round(c.r/24)},${Math.round(c.g/24)},${Math.round(c.b/24)}`;const e=counts.get(k);if(e)e.n++;else counts.set(k,{c,n:1});}
  const palette=[...counts.values()].sort((a,b)=>b.n-a.n).slice(0,Math.max(2,Math.min(14,target+2))).map((e)=>e.c);
  for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++){const c=readRgb(source,x,y);let best=palette[0],d=Infinity;for(const p of palette){const q=rgbDistance(c,p);if(q<d){d=q;best=p;}}if(d<34){const i=(y*source.width+x)*4;out.data[i]=best.r;out.data[i+1]=best.g;out.data[i+2]=best.b;}}
  return out;
}

function readRgb(source:ImageData,x:number,y:number):Rgb{const i=(y*source.width+x)*4;return{r:source.data[i],g:source.data[i+1],b:source.data[i+2]};}
function rgbDistance(a:Rgb,b:Rgb):number{return Math.hypot(a.r-b.r,a.g-b.g,a.b-b.b);}
function averageRgb(colors:Rgb[]):Rgb{return{r:Math.round(colors.reduce((s,c)=>s+c.r,0)/colors.length),g:Math.round(colors.reduce((s,c)=>s+c.g,0)/colors.length),b:Math.round(colors.reduce((s,c)=>s+c.b,0)/colors.length)};}

async function withSvgBitmapFallback<T>(fn: () => Promise<T>): Promise<T> { return fn(); }