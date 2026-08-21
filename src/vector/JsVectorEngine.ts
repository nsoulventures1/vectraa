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
    const prepared: PreparedImage = isFlatArtwork(options) ? prepareFlatArtwork(decoded, options) : { imageData: decoded, traceScale: 1, traceColors: options.colors };
    const traceOptions = toTraceOptions(options, prepared.traceScale, prepared.traceColors, prepared.palette);
    const traced = options.preset === 'logo' && prepared.palette?.length
      ? traceLogoLayers(prepared.imageData, prepared.palette, traceOptions)
      : ImageTracer.imagedataToSVG(prepared.imageData, traceOptions);
    const svgRaw = prepared.palette?.length ? snapSvgColorsToPalette(traced, prepared.palette) : traced;
    const svg = assertSafeSvg(sanitizeGeneratedSvg(svgRaw));
    return { svg, elapsedMs: Math.round(performance.now() - started), quality: inspectSvg(svg) };
  }
}

async function decodeImage(file: File): Promise<ImageData> {
  const bitmap = await createImageBitmap(file);
  try {
    const maxDimension = 3000;
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

function isFlatArtwork(options: VectorizeOptions): boolean { return options.preset === 'logo' || options.preset === 'line-art' || options.preset === 'signature'; }

function prepareFlatArtwork(input: ImageData, options: VectorizeOptions): PreparedImage {
  const reconstructed = reconstructFlatArtwork(input, options);
  const longest = Math.max(input.width, input.height);
  const factor = longest <= 800 ? 4 : longest <= 1600 ? 3 : 2;
  return { imageData: supersampleFlatArtwork(reconstructed.imageData, reconstructed.palette, factor, options), traceScale: 1 / factor, traceColors: Math.max(2, Math.min(7, reconstructed.palette.length + 1)), palette: reconstructed.palette };
}

function reconstructFlatArtwork(input: ImageData, options: VectorizeOptions): ReconstructedArtwork {
  const { width, height } = input; const source = input.data; const background = estimateBackground(source, width, height);
  const threshold = options.preset === 'logo' ? 15 : options.preset === 'signature' ? 24 : 25;
  const mask = new Uint8Array(width * height); const strong: Rgb[] = [];
  for (let p=0,i=0;p<mask.length;p+=1,i+=4) {
    if (source[i+3] < 8) continue;
    const pixel={r:source[i],g:source[i+1],b:source[i+2]}; const d=colorDistance(pixel,background); const hsv=rgbToHsv(pixel);
    const foreground = d >= threshold || hsv.s >= 0.10 || luminance(pixel) < luminance(background)-11;
    if (!foreground) continue; mask[p]=1;
    if (d >= threshold+8 || hsv.s >= 0.20) strong.push(pixel);
  }
  cleanMask(mask,width,height,options.preset==='logo');
  const palette = options.preset==='logo' ? buildLogoPalette(source,mask,width,height,strong,5) : buildAdaptiveBrandPalette(strong,1);
  if (!palette.length) palette.push({r:32,g:52,b:96});
  const output=new ImageData(width,height), data=output.data;
  for(let p=0,i=0;p<mask.length;p+=1,i+=4){
    if(!mask[p]){data[i]=255;data[i+1]=255;data[i+2]=255;data[i+3]=0;continue;}
    const nearest=nearestColor({r:source[i],g:source[i+1],b:source[i+2]},palette); data[i]=nearest.r;data[i+1]=nearest.g;data[i+2]=nearest.b;data[i+3]=255;
  }
  return {imageData:output,palette};
}

function buildLogoPalette(source:Uint8ClampedArray,mask:Uint8Array,width:number,height:number,fallback:Rgb[],maxColors:number):Rgb[]{
  const interior:Rgb[]=[];
  for(let y=2;y<height-2;y+=1)for(let x=2;x<width-2;x+=1){const p=y*width+x;if(!mask[p])continue;let n=0;for(let dy=-2;dy<=2;dy+=1)for(let dx=-2;dx<=2;dx+=1)if(mask[(y+dy)*width+x+dx])n+=1;if(n<21)continue;const i=p*4;interior.push({r:source[i],g:source[i+1],b:source[i+2]});}
  const candidates=interior.length>=24?interior:fallback; const palette=buildAdaptiveBrandPalette(candidates,maxColors);
  return palette.map(seed=>refineRepresentative(seed,source,mask));
}

function refineRepresentative(seed:Rgb,source:Uint8ClampedArray,mask:Uint8Array):Rgb{
  const sh=rgbToHsv(seed), local:Rgb[]=[];
  for(let p=0,i=0;p<mask.length;p+=1,i+=4){if(!mask[p])continue;const px={r:source[i],g:source[i+1],b:source[i+2]},h=rgbToHsv(px);if(circularHueDistance(sh.h,h.h)<=10&&Math.abs(sh.s-h.s)<=0.24&&Math.abs(sh.v-h.v)<=0.24)local.push(px);}
  return local.length>=6?modalRepresentative(local):seed;
}

function buildAdaptiveBrandPalette(pixels:Rgb[],maxColors:number):Rgb[]{
  if(!pixels.length)return[]; const step=Math.max(1,Math.floor(pixels.length/70000)); const sampled:Rgb[]=[];for(let i=0;i<pixels.length;i+=step)sampled.push(pixels[i]);
  const bins=new Map<number,Rgb[]>();
  for(const px of sampled){const h=rgbToHsv(px);if(h.v>0.965&&h.s<0.10)continue;const hue=h.s<0.10?36:Math.floor(h.h/7);const sat=Math.min(3,Math.floor(h.s*4));const val=Math.min(3,Math.floor(h.v*4));const key=hue*16+sat*4+val;const a=bins.get(key)??[];a.push(px);bins.set(key,a);}
  const groups=[...bins.values()].sort((a,b)=>b.length-a.length);const selected:Rgb[]=[];const min=Math.max(2,Math.floor(sampled.length*0.00055));
  for(const group of groups){if(selected.length>=maxColors)break;if(group.length<min)continue;const c=modalRepresentative(group),h=rgbToHsv(c);if(h.v>0.96&&h.s<0.12)continue;if(selected.every(e=>{const eh=rgbToHsv(e);return circularHueDistance(eh.h,h.h)>12||Math.abs(eh.s-h.s)>0.18||Math.abs(eh.v-h.v)>0.16;}))selected.push(c);}
  return (selected.length?selected:[modalRepresentative(sampled)]).slice(0,maxColors);
}

function modalRepresentative(pixels:Rgb[]):Rgb{if(!pixels.length)return{r:0,g:0,b:0};const bins=new Map<number,Rgb[]>();for(const p of pixels){const key=((p.r>>2)<<12)|((p.g>>2)<<6)|(p.b>>2);const a=bins.get(key)??[];a.push(p);bins.set(key,a);}const winner=[...bins.values()].sort((a,b)=>b.length-a.length)[0];return robustMean(winner);}

function supersampleFlatArtwork(source:ImageData,palette:Rgb[],factor:number,options:VectorizeOptions):ImageData{
  if(factor<=1)return source;const base=document.createElement('canvas');base.width=source.width;base.height=source.height;const bc=base.getContext('2d');if(!bc)return source;bc.putImageData(source,0,0);
  const canvas=document.createElement('canvas');canvas.width=source.width*factor;canvas.height=source.height*factor;const c=canvas.getContext('2d',{willReadFrequently:true});if(!c)return source;c.clearRect(0,0,canvas.width,canvas.height);c.imageSmoothingEnabled=true;c.imageSmoothingQuality='high';c.drawImage(base,0,0,canvas.width,canvas.height);
  const enlarged=c.getImageData(0,0,canvas.width,canvas.height),data=enlarged.data;const alphaFloor=options.preset==='logo'?20:options.preset==='signature'?58:65;
  for(let i=0;i<data.length;i+=4){if(data[i+3]<alphaFloor){data[i]=255;data[i+1]=255;data[i+2]=255;data[i+3]=0;}else{const nearest=nearestColor({r:data[i],g:data[i+1],b:data[i+2]},palette);data[i]=nearest.r;data[i+1]=nearest.g;data[i+2]=nearest.b;data[i+3]=255;}}
  return enlarged;
}

function traceLogoLayers(imageData:ImageData,palette:Rgb[],baseOptions:Record<string,unknown>):string{
  const {width,height}=imageData; let root=''; const layers:string[]=[];
  palette.forEach((color,index)=>{
    const layer=new ImageData(width,height); const src=imageData.data,dst=layer.data;
    for(let i=0;i<src.length;i+=4){if(src[i+3]<10)continue;const current={r:src[i],g:src[i+1],b:src[i+2]};if(nearestIndex(current,palette)!==index)continue;dst[i]=color.r;dst[i+1]=color.g;dst[i+2]=color.b;dst[i+3]=255;}
    const layerSvg=ImageTracer.imagedataToSVG(layer,{...baseOptions,numberofcolors:2,colorquantcycles:1,pal:[{r:255,g:255,b:255,a:0},{r:color.r,g:color.g,b:color.b,a:255}]});
    if(!root)root=layerSvg.match(/<svg\b[^>]*>/)?.[0]??`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${width} ${height}">`;
    const pathTags=layerSvg.match(/<path\b[^>]*\/>|<path\b[^>]*>[\s\S]*?<\/path>/g)??[];
    const rgb=`rgb(${color.r},${color.g},${color.b})`;
    for(const tag of pathTags){if(tag.includes(rgb))layers.push(tag);}
  });
  return `${root}${layers.join('')}</svg>`;
}

function snapSvgColorsToPalette(svg:string,palette:Rgb[]):string{return svg.replace(/rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)/g,(match,r,g,b)=>{const c={r:Number(r),g:Number(g),b:Number(b)};if(c.r>=245&&c.g>=245&&c.b>=245)return match;const s=nearestColor(c,palette);return`rgb(${s.r},${s.g},${s.b})`;});}

function estimateBackground(data:Uint8ClampedArray,width:number,height:number):Rgb{const samples:Rgb[]=[];const band=Math.max(1,Math.round(Math.min(width,height)*0.04)),sx=Math.max(1,Math.floor(width/90)),sy=Math.max(1,Math.floor(height/90));for(let y=0;y<height;y+=sy)for(let x=0;x<width;x+=sx){if(x>=band&&x<width-band&&y>=band&&y<height-band)continue;const i=(y*width+x)*4;if(data[i+3]<32)continue;samples.push({r:data[i],g:data[i+1],b:data[i+2]});}if(!samples.length)return{r:255,g:255,b:255};samples.sort((a,b)=>luminance(b)-luminance(a));const bright=samples.slice(0,Math.max(4,Math.floor(samples.length*.7)));return{r:Math.round(median(bright.map(p=>p.r))),g:Math.round(median(bright.map(p=>p.g))),b:Math.round(median(bright.map(p=>p.b)))};}

function cleanMask(mask:Uint8Array,width:number,height:number,preserve=false):void{const first=mask.slice();for(let y=1;y<height-1;y+=1)for(let x=1;x<width-1;x+=1){const p=y*width+x;let n=0;for(let dy=-1;dy<=1;dy+=1)for(let dx=-1;dx<=1;dx+=1)if(dx||dy)n+=first[(y+dy)*width+x+dx];if(first[p]&&n<=(preserve?0:1))mask[p]=0;else if(!first[p]&&n>=(preserve?8:7))mask[p]=1;}removeTinyComponents(mask,width,height,preserve?1:5);}
function removeTinyComponents(mask:Uint8Array,width:number,height:number,minimum:number):void{const visited=new Uint8Array(mask.length),queue=new Int32Array(mask.length);for(let start=0;start<mask.length;start+=1){if(!mask[start]||visited[start])continue;let head=0,tail=0;queue[tail++]=start;visited[start]=1;const component:number[]=[];while(head<tail){const p=queue[head++];component.push(p);const x=p%width,y=Math.floor(p/width);for(let dy=-1;dy<=1;dy+=1)for(let dx=-1;dx<=1;dx+=1){if(!dx&&!dy)continue;const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=width||ny>=height)continue;const np=ny*width+nx;if(!mask[np]||visited[np])continue;visited[np]=1;queue[tail++]=np;}}if(component.length<minimum)for(const p of component)mask[p]=0;}}
function robustMean(pixels:Rgb[]):Rgb{return pixels.length?{r:Math.round(median(pixels.map(p=>p.r))),g:Math.round(median(pixels.map(p=>p.g))),b:Math.round(median(pixels.map(p=>p.b)))}:{r:0,g:0,b:0};}
function nearestColor(pixel:Rgb,palette:Rgb[]):Rgb{return palette[nearestIndex(pixel,palette)];}function nearestIndex(pixel:Rgb,palette:Rgb[]):number{let best=0,d=Infinity;for(let i=0;i<palette.length;i++){const n=colorDistance(pixel,palette[i]);if(n<d){d=n;best=i;}}return best;}
function colorDistance(a:Rgb,b:Rgb):number{const dr=a.r-b.r,dg=a.g-b.g,db=a.b-b.b;return Math.sqrt(dr*dr*.9+dg*dg*1.25+db*db*.75);}function luminance(p:Rgb):number{return .2126*p.r+.7152*p.g+.0722*p.b;}function median(v:number[]):number{const s=v.slice().sort((a,b)=>a-b),m=Math.floor(s.length/2);return s.length%2?s[m]:(s[m-1]+s[m])/2;}function circularHueDistance(a:number,b:number):number{const d=Math.abs(a-b)%360;return Math.min(d,360-d);}
function rgbToHsv(p:Rgb):{h:number;s:number;v:number}{const r=p.r/255,g=p.g/255,b=p.b/255,max=Math.max(r,g,b),min=Math.min(r,g,b),delta=max-min;let h=0;if(delta){if(max===r)h=60*(((g-b)/delta)%6);else if(max===g)h=60*((b-r)/delta+2);else h=60*((r-g)/delta+4);}if(h<0)h+=360;return{h,s:max===0?0:delta/max,v:max};}

function toTraceOptions(options:VectorizeOptions,traceScale=1,traceColors=options.colors,palette?:Rgb[]){const detail=options.detail/100,clean=isFlatArtwork(options),logo=options.preset==='logo';const tolerance=logo?Math.max(.24,.82-detail*.46):clean?Math.max(.65,1.8-detail):Math.max(.18,2.2-detail*1.9);const pal=palette?.length?[{r:255,g:255,b:255,a:0},...palette.map(c=>({r:c.r,g:c.g,b:c.b,a:255}))]:undefined;return{ltres:tolerance,qtres:tolerance,pathomit:logo?0:clean?Math.max(2,Math.round((1-detail)*8)):Math.max(0,Math.round((1-detail)*12)),rightangleenhance:logo||options.preset==='line-art',colorsampling:0,numberofcolors:clean?traceColors:options.colors,mincolorratio:logo?.00005:clean?.003:0,colorquantcycles:1,layering:0,strokewidth:0,linefilter:logo?false:clean,scale:traceScale,roundcoords:logo?5:clean?3:2,viewbox:true,desc:false,blurradius:0,blurdelta:logo?4:clean?26:20,...(pal?{pal}: {})};}
