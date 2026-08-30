import { decodeRaster } from './rasterDecode';
import type { ImageAnalysis, VectorPreset } from './types';
import { validateRasterFile } from './validateInput';

const SAMPLE_SIZE = 128;

export interface ImageSignals {
  width: number; height: number; hasAlpha: boolean; alphaCoverage: number;
  edgeDensity: number; colorComplexity: number; lightBackground: number;
  darkInk: number; saturation: number;
}

export async function analyzeImage(file: File): Promise<ImageAnalysis> {
  validateRasterFile(file);
  const decoded = await decodeRaster(file);
  const originalWidth = decoded.width, originalHeight = decoded.height;
  const scale = Math.min(1, SAMPLE_SIZE / Math.max(originalWidth, originalHeight));
  const width = Math.max(1, Math.round(originalWidth * scale));
  const height = Math.max(1, Math.round(originalHeight * scale));
  const sourceCanvas = document.createElement('canvas'); sourceCanvas.width=originalWidth; sourceCanvas.height=originalHeight;
  const sourceContext=sourceCanvas.getContext('2d'); if(!sourceContext) throw new Error('Vectraa could not inspect this image.');
  sourceContext.putImageData(decoded,0,0);
  const canvas=document.createElement('canvas'); canvas.width=width; canvas.height=height;
  const context=canvas.getContext('2d',{willReadFrequently:true}); if(!context) throw new Error('Vectraa could not inspect this image.');
  context.imageSmoothingEnabled=true; context.imageSmoothingQuality='high'; context.drawImage(sourceCanvas,0,0,width,height);
  const signals=measureSignals(context.getImageData(0,0,width,height).data,width,height,originalWidth,originalHeight);
  const likelyKind=classifyImageSignals(signals), warnings:string[]=[];
  const megapixels=(originalWidth*originalHeight)/1_000_000;
  if(megapixels>12)warnings.push('Large source image; conversion may take longer.');
  if(signals.colorComplexity>0.8&&likelyKind!=='logo')warnings.push('Many foreground color transitions detected; expect a larger SVG.');
  if(signals.edgeDensity>0.42&&likelyKind!=='logo')warnings.push('Very dense detail detected; some simplification may improve editability.');
  return {width:originalWidth,height:originalHeight,megapixels,hasAlpha:signals.hasAlpha,likelyKind,confidence:recommendationConfidence(signals,likelyKind),signals:{edgeDensity:signals.edgeDensity,colorComplexity:signals.colorComplexity,lightBackground:signals.lightBackground,alphaCoverage:signals.alphaCoverage},warnings};
}

export function classifyImageSignals(signals:ImageSignals):VectorPreset {
  const {edgeDensity,colorComplexity,lightBackground,darkInk,saturation,alphaCoverage}=signals;
  const signatureLike=lightBackground>0.72&&darkInk>0.01&&darkInk<0.28&&colorComplexity<0.2&&edgeDensity<0.2&&saturation<0.18;
  if(signatureLike)return 'signature';
  const lineArtLike=colorComplexity<0.24&&edgeDensity>=0.15&&(lightBackground>0.52||alphaCoverage>0.08)&&saturation<0.22;
  if(lineArtLike)return 'line-art';

  // Complexity is a stronger signal than a light canvas. This guard prevents
  // photographs/dense artwork from being swallowed by the broad brand-art route.
  if(colorComplexity>0.72||edgeDensity>0.42)return 'high-detail';

  const scannedBrandArt=lightBackground>0.38&&darkInk>0.008&&darkInk<0.48&&edgeDensity<0.5&&colorComplexity<0.5&&(saturation>0.035||alphaCoverage>0.025);
  const lightBackgroundBrandArt=lightBackground>0.48&&edgeDensity<0.42&&darkInk<0.42&&colorComplexity<0.5&&(saturation>0.045||colorComplexity<0.4);
  const logoLike=scannedBrandArt||lightBackgroundBrandArt||(colorComplexity<0.46&&edgeDensity<0.34&&(saturation>0.07||alphaCoverage>0.04||lightBackground>0.35));
  if(logoLike)return 'logo';
  if(colorComplexity>0.72||edgeDensity>0.38)return 'high-detail';
  return 'illustration';
}

export function recommendationConfidence(signals:ImageSignals,preset:VectorPreset):number {
  const margin=preset==='signature'?(signals.lightBackground-0.72)+(0.2-signals.edgeDensity)+(0.2-signals.colorComplexity):preset==='line-art'?(signals.edgeDensity-0.15)+(0.24-signals.colorComplexity):preset==='logo'?Math.max((signals.lightBackground-0.38)+(0.5-signals.edgeDensity)+signals.saturation,(0.46-signals.colorComplexity)+(0.34-signals.edgeDensity)):preset==='high-detail'?Math.max(signals.colorComplexity-0.72,signals.edgeDensity-0.38)*2:0.22;
  return Math.max(55,Math.min(96,Math.round(68+margin*45)));
}

function measureSignals(pixels:Uint8ClampedArray,sampleWidth:number,sampleHeight:number,width:number,height:number):ImageSignals {
  const foregroundBins=new Set<number>(),gray=new Uint8Array(sampleWidth*sampleHeight);let transparent=0,visible=0,light=0,dark=0,saturated=0,foreground=0;
  for(let i=0,p=0;i<pixels.length;i+=4,p++) {const r=pixels[i],g=pixels[i+1],b=pixels[i+2],a=pixels[i+3],lum=Math.round(.2126*r+.7152*g+.0722*b);gray[p]=lum;if(a<240)transparent++;if(a<24)continue;visible++;if(lum>235)light++;if(lum<80)dark++;const max=Math.max(r,g,b),min=Math.min(r,g,b);if(max-min>55)saturated++;if(lum<232||max-min>28){foreground++;foregroundBins.add(((r>>5)<<6)|((g>>5)<<3)|(b>>5));}}
  let edgeCount=0,comparisons=0;for(let y=1;y<sampleHeight;y++)for(let x=1;x<sampleWidth;x++){const index=y*sampleWidth+x,current=gray[index];if(Math.abs(current-gray[index-1])>34)edgeCount++;if(Math.abs(current-gray[index-sampleWidth])>34)edgeCount++;comparisons+=2;}
  const total=sampleWidth*sampleHeight,visibleSafe=Math.max(1,visible),foregroundSafe=Math.max(1,foreground),paletteDensity=foregroundBins.size/Math.max(12,Math.min(64,Math.sqrt(foregroundSafe)*1.8));
  return {width,height,hasAlpha:transparent>0,alphaCoverage:transparent/total,edgeDensity:comparisons?edgeCount/comparisons:0,colorComplexity:Math.min(1,paletteDensity),lightBackground:light/visibleSafe,darkInk:dark/visibleSafe,saturation:saturated/visibleSafe};
}
