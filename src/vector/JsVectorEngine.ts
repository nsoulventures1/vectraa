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

    // Structural routing happens BEFORE the UI preset branch. The automatic classifier
    // often labels detailed seals/roundels as "high-detail" rather than "logo". Keeping
    // badge reconstruction inside the logo-only branch meant that the specialist code
    // never ran for exactly the military/seal artwork it was built to improve.
    const structuralOptions: VectorizeOptions = {
      ...options,
      detail: Math.max(options.detail, 96),
      colors: Math.max(options.colors, 16),
      smoothing: Math.min(options.smoothing, 6),
    };
    const structuralBadge = tryVectorizeCenteredBandedBadge(decoded, structuralOptions);
    if (structuralBadge) {
      const svg = assertSafeSvg(sanitizeGeneratedSvg(structuralBadge));
      const structural = inspectSvg(svg);
      return {
        svg,
        elapsedMs: Math.round(performance.now() - started),
        quality: {
          ...structural,
          score: Math.min(structural.score, 94),
          warnings: [...new Set([
            ...structural.warnings,
            'Structural badge auto-route activated before preset selection.',
            'Circle and horizontal colour fields were rebuilt as SVG geometry; detailed foreground was traced separately.',
          ])],
        },
      };
    }

    if (options.preset === 'logo') {
      const precisionOptions = logoPrecisionOptions(options);
      const preparedLogo = prepareLogoArtwork(decoded);

      // Prepared pixels are useful only for structural badge detection/reconstruction.
      // Never feed colour-consolidated/denoised pixels into the high-fidelity brand-logo
      // tracer: it already learns and freezes exact source colours itself. Doing both
      // stages caused brand colours (especially gold/navy) to drift and regressed logos
      // while improving badges.
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
        // IMPORTANT: high-fidelity logo tracing always receives untouched decoded pixels.
        // This preserves the exact source palette while retaining all badge improvements.
        const result = await withSvgBitmapFallback(() => vectorizeLogoHighFidelity(decoded, precisionOptions));
        const svg = assertSafeSvg(sanitizeGeneratedSvg(result.svg));
        const structural = inspectSvg(svg);
        return {
          svg,
          elapsedMs: Math.round(performance.now() - started),
          quality: {
            ...structural,
            score: Math.min(structural.score, result.quality.score),
            warnings: [...new Set([...structural.warnings, ...result.quality.warnings, 'Original source pixels preserved for high-fidelity logo colour extraction.'])],
          },
        };
      } catch (error) {
        // Fallback also starts from untouched pixels. A failed specialist logo trace must
        // not silently downgrade brand colours through the preprocessing path.
        const fallback = traceGeneric(decoded, precisionOptions);
        const svg = assertSafeSvg(sanitizeGeneratedSvg(fallback));
        const structural = inspectSvg(svg);
        const reason = error instanceof Error ? error.message : 'high-fidelity logo pipeline failed';
        return {
          svg,
          elapsedMs: Math.round(performance.now() - started),
          quality: {
            ...structural,
            score: Math.min(structural.score, 82),
            warnings: [...new Set([...structural.warnings, `High-fidelity logo pipeline fell back: ${reason}`])],
          },
        };
      }
    }

    const prepared = prepareGenericArtwork(decoded, options);
    const svg = assertSafeSvg(sanitizeGeneratedSvg(traceGeneric(prepared, options)));
    return { svg, elapsedMs: Math.round(performance.now() - started), quality: inspectSvg(svg) };
  }
}

function logoPrecisionOptions(options: VectorizeOptions): VectorizeOptions {
  return {
    ...options,
    // Keep the multi-pass variants meaningfully distinct. The previous 92/8/16
    // clamp collapsed balanced, cleaner and faithful into the same expensive trace.
    colors: Math.max(options.colors, 6),
    detail: Math.max(options.detail, 84),
    smoothing: Math.min(options.smoothing, 18),
  };
}

function traceGeneric(imageData: ImageData, options: VectorizeOptions): string {
  const detail = options.detail / 100;
  const smooth = options.smoothing / 100;
  return ImageTracer.imagedataToSVG(imageData, {
    ltres: Math.max(0.05, 1.2 - detail * 1.12),
    qtres: Math.max(0.05, 1.2 - detail * 1.08),
    pathomit: options.preset === 'signature' ? 3 : options.preset === 'line-art' ? 2 : options.preset === 'illustration' ? 1 : 0,
    rightangleenhance: true,
    colorsampling: options.preset === 'high-detail' ? 1 : 2,
    numberofcolors: options.colors,
    mincolorratio: 0,
    colorquantcycles: options.preset === 'high-detail' ? 4 : 3,
    layering: 0,
    strokewidth: 0,
    linefilter: false,
    scale: 1,
    roundcoords: Math.max(2, Math.round(6 - smooth * 4)),
    viewbox: true,
    desc: false,
    blurradius: options.preset === 'signature' || options.preset === 'line-art' ? 1 : 0,
    blurdelta: options.preset === 'signature' || options.preset === 'line-art' ? 24 : 0,
  });
}

/**
 * Binary artwork benefits from a very different preparation stage than logos,
 * illustrations and photographs. An adaptive luminance split removes paper/JPEG
 * texture, keeps anti-aliased strokes connected and makes the canvas genuinely
 * transparent before ImageTracer sees it. Other modes retain their source pixels.
 */
function prepareGenericArtwork(source: ImageData, options: VectorizeOptions): ImageData {
  if (options.preset !== 'signature' && options.preset !== 'line-art') return source;

  const histogram = new Uint32Array(256);
  let visible = 0;
  for (let i = 0; i < source.data.length; i += 4) {
    if (source.data[i + 3] < 16) continue;
    histogram[Math.round(0.2126 * source.data[i] + 0.7152 * source.data[i + 1] + 0.0722 * source.data[i + 2])] += 1;
    visible += 1;
  }
  const threshold = otsuThreshold(histogram, visible);
  // Signatures are normally sparse dark ink on light paper; line art may contain
  // broader mid-tone strokes. Keep the threshold bounded to avoid swallowing paper.
  const cutoff = options.preset === 'signature'
    ? Math.max(72, Math.min(210, threshold + 10))
    : Math.max(64, Math.min(224, threshold + 18));
  const out = new ImageData(source.width, source.height);

  for (let i = 0; i < source.data.length; i += 4) {
    const alpha = source.data[i + 3];
    if (alpha < 16) continue;
    const luminance = 0.2126 * source.data[i] + 0.7152 * source.data[i + 1] + 0.0722 * source.data[i + 2];
    // A short feather preserves curved stroke edges without retaining paper noise.
    const coverage = Math.max(0, Math.min(1, (cutoff + 18 - luminance) / 36));
    if (coverage <= 0.04) continue;
    const darkness = Math.max(0, Math.min(1, (cutoff - luminance + 36) / 72));
    const ink = options.preset === 'signature' ? Math.round(24 * (1 - darkness)) : Math.round(Math.min(source.data[i], source.data[i + 1], source.data[i + 2]) * 0.18);
    out.data[i] = ink;
    out.data[i + 1] = ink;
    out.data[i + 2] = ink;
    out.data[i + 3] = Math.round(Math.min(alpha, coverage * 255));
  }
  return out;
}

function otsuThreshold(histogram: Uint32Array, total: number): number {
  if (!total) return 180;
  let weightedTotal = 0;
  for (let i = 0; i < 256; i += 1) weightedTotal += i * histogram[i];
  let backgroundWeight = 0, backgroundSum = 0, bestVariance = -1, best = 180;
  for (let i = 0; i < 256; i += 1) {
    backgroundWeight += histogram[i];
    if (!backgroundWeight) continue;
    const foregroundWeight = total - backgroundWeight;
    if (!foregroundWeight) break;
    backgroundSum += i * histogram[i];
    const backgroundMean = backgroundSum / backgroundWeight;
    const foregroundMean = (weightedTotal - backgroundSum) / foregroundWeight;
    const variance = backgroundWeight * foregroundWeight * (backgroundMean - foregroundMean) ** 2;
    if (variance > bestVariance) { bestVariance = variance; best = i; }
  }
  return best;
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
