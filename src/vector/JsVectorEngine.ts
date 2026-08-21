import ImageTracer from 'imagetracerjs';
import { assertSafeSvg, inspectSvg } from './quality';
import { clampOptions } from './presets';
import { sanitizeGeneratedSvg } from './sanitizeSvg';
import type { VectorEngine, VectorResult, VectorizeOptions } from './types';
import { validateRasterFileSignature } from './validateInput';

interface Rgb { r: number; g: number; b: number }
interface ReconstructedArtwork { imageData: ImageData; palette: Rgb[] }
interface PreparedImage { imageData: ImageData; traceScale: number; traceColors: number; palette?: Rgb[] }

export class JsVectorEngine implements VectorEngine {
  readonly id = 'imagetracer-js';
  async vectorize(file: File, rawOptions: VectorizeOptions): Promise<VectorResult> {
    await validateRasterFileSignature(file);
    const options = clampOptions(rawOptions);
    const started = performance.now();
    const decoded = await decodeImage(file);
    const prepared: PreparedImage = isFlatArtwork(options)
      ? prepareFlatArtwork(decoded, options)
      : { imageData: decoded, traceScale: 1, traceColors: options.colors };
    const traced = ImageTracer.imagedataToSVG(prepared.imageData, toTraceOptions(options, prepared.traceScale, prepared.traceColors));
    const svgRaw = prepared.palette?.length ? snapSvgColorsToPalette(traced, prepared.palette) : traced;
    const svg = assertSafeSvg(sanitizeGeneratedSvg(svgRaw));
    return { svg, elapsedMs: Math.round(performance.now() - started), quality: inspectSvg(svg) };
  }
}

async function decodeImage(file: File): Promise<ImageData> {
  const bitmap = await createImageBitmap(file);
  try {
    const maxDimension = 2600;
    const scale = Math.min(1, maxDimension / Math.max(bitmap.width, bitmap.height));
    const width = Math.max(1, Math.round(bitmap.width * scale));
    const height = Math.max(1, Math.round(bitmap.height * scale));
    const canvas = document.createElement('canvas'); canvas.width = width; canvas.height = height;
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) throw new Error('Vectraa could not prepare the image for tracing.');
    context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
    context.drawImage(bitmap, 0, 0, width, height);
    return context.getImageData(0, 0, width, height);
  } finally { bitmap.close(); }
}

function isFlatArtwork(options: VectorizeOptions): boolean {
  return options.preset === 'logo' || options.preset === 'line-art' || options.preset === 'signature';
}

function prepareFlatArtwork(input: ImageData, options: VectorizeOptions): PreparedImage {
  const reconstructed = reconstructFlatArtwork(input, options);
  const longest = Math.max(input.width, input.height);
  const factor = longest <= 700 ? 4 : longest <= 1400 ? 3 : 2;
  return {
    imageData: supersampleFlatArtwork(reconstructed.imageData, reconstructed.palette, factor, options),
    traceScale: 1 / factor,
    traceColors: Math.max(2, Math.min(6, reconstructed.palette.length + 1)),
    palette: reconstructed.palette,
  };
}

function reconstructFlatArtwork(input: ImageData, options: VectorizeOptions): ReconstructedArtwork {
  const { width, height } = input;
  const source = input.data;
  const background = estimateBackground(source, width, height);
  const distanceThreshold = options.preset === 'logo' ? 22 : options.preset === 'signature' ? 27 : 28;
  const strongThreshold = distanceThreshold + (options.preset === 'logo' ? 14 : 17);
  const foregroundMask = new Uint8Array(width * height);
  const strongPixels: Rgb[] = [];
  for (let p = 0, i = 0; p < foregroundMask.length; p += 1, i += 4) {
    if (source[i + 3] < 10) continue;
    const pixel = { r: source[i], g: source[i + 1], b: source[i + 2] };
    const distance = colorDistance(pixel, background);
    const foreground = distance >= distanceThreshold || (chroma(pixel) >= 22 && luminance(pixel) < 251);
    if (!foreground) continue;
    foregroundMask[p] = 1;
    if (distance >= strongThreshold || chroma(pixel) >= 40) strongPixels.push(pixel);
  }
  cleanMask(foregroundMask, width, height, options.preset === 'logo');
  const palette = options.preset === 'logo' ? buildAdaptiveBrandPalette(strongPixels, 4) : buildAdaptiveBrandPalette(strongPixels, 1);
  if (!palette.length) palette.push({ r: 32, g: 52, b: 96 });
  const output = new ImageData(width, height); const data = output.data;
  for (let p = 0, i = 0; p < foregroundMask.length; p += 1, i += 4) {
    if (!foregroundMask[p]) { data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 0; continue; }
    const nearest = nearestColor({ r: source[i], g: source[i + 1], b: source[i + 2] }, palette);
    data[i] = nearest.r; data[i + 1] = nearest.g; data[i + 2] = nearest.b; data[i + 3] = 255;
  }
  return { imageData: output, palette };
}

function buildAdaptiveBrandPalette(pixels: Rgb[], maxColors: number): Rgb[] {
  if (!pixels.length) return [];
  if (maxColors <= 1) return [robustMean(pixels)];

  interface HueBin { pixels: Rgb[]; weight: number; representative: Rgb }
  const bins = new Map<string, Rgb[]>();
  const step = Math.max(1, Math.floor(pixels.length / 50000));

  for (let index = 0; index < pixels.length; index += step) {
    const pixel = pixels[index];
    const hsv = rgbToHsv(pixel);
    const lum = luminance(pixel) / 255;

    // Reject pale antialias/white contamination from palette discovery. True dark
    // brand colors are still kept even when their saturation is modest.
    const isCore = hsv.s >= 0.20 || hsv.v <= 0.55 || lum <= 0.52;
    if (!isCore) continue;

    const hueBucket = hsv.s < 0.12 ? -1 : Math.floor(hsv.h / 15);
    const satBucket = Math.min(3, Math.floor(hsv.s * 4));
    const valBucket = Math.min(3, Math.floor(hsv.v * 4));
    const key = `${hueBucket}:${satBucket}:${valBucket}`;
    const bucket = bins.get(key) ?? [];
    bucket.push(pixel);
    bins.set(key, bucket);
  }

  const candidates: HueBin[] = [...bins.values()]
    .filter((bucket) => bucket.length >= 2)
    .map((bucket) => {
      const representative = coreRepresentative(bucket);
      const hsv = rgbToHsv(representative);
      const darknessBonus = 1 + Math.max(0, 0.58 - hsv.v) * 1.4;
      const saturationBonus = 1 + hsv.s * 1.6;
      return { pixels: bucket, representative, weight: bucket.length * darknessBonus * saturationBonus };
    })
    .sort((a, b) => b.weight - a.weight);

  if (!candidates.length) return [robustMean(pixels)];

  const selected: Rgb[] = [];
  for (const candidate of candidates) {
    if (selected.length >= maxColors) break;
    const color = candidate.representative;
    const hsv = rgbToHsv(color);

    // Require genuinely distinct color identity, not just a lighter/darker antialias
    // version of an already selected ink.
    const distinct = selected.every((existing) => {
      const existingHsv = rgbToHsv(existing);
      const hueGap = circularHueDistance(hsv.h, existingHsv.h);
      return colorDistance(color, existing) >= 48 && (hueGap >= 18 || Math.abs(hsv.v - existingHsv.v) >= 0.24);
    });
    if (!distinct) continue;
    selected.push(color);
  }

  if (!selected.length) selected.push(candidates[0].representative);

  // Refine each chosen ink only from nearby core pixels. This prevents pale edge
  // pixels from dragging gold toward grey or navy toward black/blue-grey.
  return selected.map((seed) => {
    const seedHsv = rgbToHsv(seed);
    const local: Rgb[] = [];
    for (let index = 0; index < pixels.length; index += step) {
      const pixel = pixels[index];
      const hsv = rgbToHsv(pixel);
      if (colorDistance(pixel, seed) > 34) continue;
      if (hsv.s >= 0.16 && seedHsv.s >= 0.16 && circularHueDistance(hsv.h, seedHsv.h) > 16) continue;
      local.push(pixel);
    }
    return local.length >= 6 ? coreRepresentative(local) : seed;
  });
}

function coreRepresentative(pixels: Rgb[]): Rgb {
  if (!pixels.length) return { r: 0, g: 0, b: 0 };
  if (pixels.length < 8) return robustMean(pixels);

  // Pick the densest central portion in RGB space instead of averaging all edge
  // shades. Medoid-like selection is stable for compressed logos and scans.
  const sampleStep = Math.max(1, Math.floor(pixels.length / 180));
  const sample = pixels.filter((_, index) => index % sampleStep === 0);
  let best = sample[0];
  let bestScore = Number.POSITIVE_INFINITY;
  for (const candidate of sample) {
    let score = 0;
    for (const other of sample) score += Math.min(90, colorDistance(candidate, other));
    if (score < bestScore) { bestScore = score; best = candidate; }
  }

  const local = pixels.filter((pixel) => colorDistance(pixel, best) <= 24);
  return local.length >= 4 ? robustMean(local) : best;
}

function supersampleFlatArtwork(source: ImageData, palette: Rgb[], factor: number, options: VectorizeOptions): ImageData {
  if (factor <= 1) return source;
  const base = document.createElement('canvas'); base.width = source.width; base.height = source.height;
  const baseContext = base.getContext('2d'); if (!baseContext) return source; baseContext.putImageData(source, 0, 0);
  const canvas = document.createElement('canvas'); canvas.width = source.width * factor; canvas.height = source.height * factor;
  const context = canvas.getContext('2d', { willReadFrequently: true }); if (!context) return source;
  context.clearRect(0, 0, canvas.width, canvas.height); context.imageSmoothingEnabled = true; context.imageSmoothingQuality = 'high';
  context.filter = options.preset === 'logo' ? 'none' : options.preset === 'signature' ? 'blur(0.18px)' : 'blur(0.24px)';
  context.drawImage(base, 0, 0, canvas.width, canvas.height); context.filter = 'none';
  const enlarged = context.getImageData(0, 0, canvas.width, canvas.height); const data = enlarged.data;
  const alphaFloor = options.preset === 'logo' ? 38 : options.preset === 'signature' ? 64 : 72;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < alphaFloor) { data[i] = 255; data[i + 1] = 255; data[i + 2] = 255; data[i + 3] = 0; }
    else { const nearest = nearestColor({ r: data[i], g: data[i + 1], b: data[i + 2] }, palette); data[i] = nearest.r; data[i + 1] = nearest.g; data[i + 2] = nearest.b; data[i + 3] = 255; }
  }
  return enlarged;
}

function snapSvgColorsToPalette(svg: string, palette: Rgb[]): string {
  const replaceRgb = (match: string, rText: string, gText: string, bText: string) => {
    const color = { r: Number(rText), g: Number(gText), b: Number(bText) };
    if (color.r >= 245 && color.g >= 245 && color.b >= 245) return match;
    const snapped = nearestColor(color, palette);
    return `rgb(${snapped.r},${snapped.g},${snapped.b})`;
  };
  return svg.replace(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/g, replaceRgb);
}

function estimateBackground(data: Uint8ClampedArray, width: number, height: number): Rgb {
  const samples: Rgb[] = []; const band = Math.max(1, Math.round(Math.min(width, height) * 0.035));
  const stepX = Math.max(1, Math.floor(width / 80)); const stepY = Math.max(1, Math.floor(height / 80));
  for (let y = 0; y < height; y += stepY) for (let x = 0; x < width; x += stepX) {
    if (x >= band && x < width - band && y >= band && y < height - band) continue;
    const i = (y * width + x) * 4; if (data[i + 3] < 32) continue; samples.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
  }
  if (!samples.length) return { r: 255, g: 255, b: 255 };
  samples.sort((a,b)=>luminance(b)-luminance(a)); const brightest=samples.slice(0,Math.max(4,Math.floor(samples.length*0.65)));
  return { r:Math.round(median(brightest.map(p=>p.r))), g:Math.round(median(brightest.map(p=>p.g))), b:Math.round(median(brightest.map(p=>p.b))) };
}

function cleanMask(mask: Uint8Array, width: number, height: number, preserveFineDetail = false): void {
  const first = mask.slice();
  for (let y=1;y<height-1;y+=1) for (let x=1;x<width-1;x+=1) {
    const p=y*width+x; let neighbours=0;
    for(let dy=-1;dy<=1;dy+=1) for(let dx=-1;dx<=1;dx+=1) if(dx!==0||dy!==0) neighbours+=first[(y+dy)*width+(x+dx)];
    if(first[p]&&neighbours<=(preserveFineDetail?0:1)) mask[p]=0; else if(!first[p]&&neighbours>=(preserveFineDetail?8:7)) mask[p]=1;
  }
  removeTinyComponents(mask,width,height,preserveFineDetail?1:5);
}

function removeTinyComponents(mask: Uint8Array,width:number,height:number,minimumSize:number):void{
  const visited=new Uint8Array(mask.length); const queue=new Int32Array(mask.length);
  for(let start=0;start<mask.length;start+=1){ if(!mask[start]||visited[start])continue; let head=0,tail=0; queue[tail++]=start; visited[start]=1; const component:number[]=[];
    while(head<tail){const p=queue[head++];component.push(p);const x=p%width,y=Math.floor(p/width);for(let dy=-1;dy<=1;dy+=1)for(let dx=-1;dx<=1;dx+=1){if(dx===0&&dy===0)continue;const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=width||ny>=height)continue;const np=ny*width+nx;if(!mask[np]||visited[np])continue;visited[np]=1;queue[tail++]=np;}}
    if(component.length<minimumSize)for(const p of component)mask[p]=0;
  }
}

function robustMean(pixels:Rgb[]):Rgb{return pixels.length?{r:Math.round(median(pixels.map(p=>p.r))),g:Math.round(median(pixels.map(p=>p.g))),b:Math.round(median(pixels.map(p=>p.b)))}:{r:0,g:0,b:0};}
function nearestColor(pixel:Rgb,palette:Rgb[]):Rgb{return palette[nearestIndex(pixel,palette)];}
function nearestIndex(pixel:Rgb,palette:Rgb[]):number{let best=0,bestDistance=Number.POSITIVE_INFINITY;for(let i=0;i<palette.length;i+=1){const distance=colorDistance(pixel,palette[i]);if(distance<bestDistance){bestDistance=distance;best=i;}}return best;}
function colorDistance(a:Rgb,b:Rgb):number{const dr=a.r-b.r,dg=a.g-b.g,db=a.b-b.b;return Math.sqrt(dr*dr*0.9+dg*dg*1.25+db*db*0.75);}
function chroma(pixel:Rgb):number{return Math.max(pixel.r,pixel.g,pixel.b)-Math.min(pixel.r,pixel.g,pixel.b);}
function luminance(pixel:Rgb):number{return 0.2126*pixel.r+0.7152*pixel.g+0.0722*pixel.b;}
function median(values:number[]):number{const sorted=values.slice().sort((a,b)=>a-b);const middle=Math.floor(sorted.length/2);return sorted.length%2?sorted[middle]:(sorted[middle-1]+sorted[middle])/2;}
function circularHueDistance(a:number,b:number):number{const d=Math.abs(a-b)%360;return Math.min(d,360-d);}
function rgbToHsv(pixel:Rgb):{h:number;s:number;v:number}{
  const r=pixel.r/255,g=pixel.g/255,b=pixel.b/255; const max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;
  let h=0; if(delta!==0){if(max===r)h=60*(((g-b)/delta)%6);else if(max===g)h=60*(((b-r)/delta)+2);else h=60*(((r-g)/delta)+4);} if(h<0)h+=360;
  return {h,s:max===0?0:delta/max,v:max};
}

function toTraceOptions(options:VectorizeOptions,traceScale=1,traceColors=options.colors){
  const detail=options.detail/100,smoothing=options.smoothing/100,cleanGeometry=isFlatArtwork(options),logo=options.preset==='logo';
  const traceTolerance=logo?Math.max(0.38,1.22-detail*0.72):cleanGeometry?Math.max(0.72,2.05-detail*1.08):Math.max(0.18,2.2-detail*1.9);
  return {ltres:traceTolerance,qtres:traceTolerance,pathomit:logo?1:cleanGeometry?Math.max(3,Math.round((1-detail)*10)):Math.max(0,Math.round((1-detail)*12)),rightangleenhance:logo||options.preset==='line-art',colorsampling:0,numberofcolors:cleanGeometry?traceColors:options.colors,mincolorratio:logo?0.0005:cleanGeometry?0.004:0,colorquantcycles:logo?1:cleanGeometry?2:options.colors<=4?2:3,layering:0,strokewidth:0,linefilter:logo?false:cleanGeometry||smoothing>0.65,scale:traceScale,roundcoords:logo?3:cleanGeometry?2:detail>0.8?2:1,viewbox:true,desc:false,blurradius:0,blurdelta:logo?12:cleanGeometry?34:20};
}
