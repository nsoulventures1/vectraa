import ImageTracer from 'imagetracerjs';
import type { VectorizeOptions } from './types';

interface Rgb { r:number; g:number; b:number }
interface Band { y0:number; y1:number; color:Rgb }
interface Component { pixels:number[]; minX:number; minY:number; maxX:number; maxY:number }
interface InkLayer { mask:ImageData; color:Rgb; name:string }

/** Structural vectorization for centred circular badges/seals with horizontal colour bands. */
export function tryVectorizeCenteredBandedBadge(source:ImageData, options:VectorizeOptions):string|null {
  void options;
  const bg=cornerBackground(source); if(luma(bg)>70||cornerSpread(source,bg)>34)return null;
  const geometry=scanCircleGeometry(source,bg); if(!geometry)return null;
  const {cx,cy,r}=geometry, bands=scanBands(source,bg,cx,cy,r); if(bands.length<2||bands.length>5)return null;
  const layers=foregroundInkLayers(source,cx,cy,r,bands), traced:string[]=[];
  for(const layer of layers){const paths=traceConnectedMask(layer.mask);if(paths.length)traced.push(`<g data-vectraa-ink="${layer.name}" fill="${rgb(layer.color)}">${paths.join('')}</g>`)}
  if(!traced.length)return null;
  const id='vectraa-centred-badge',base=[`<rect x="0" y="0" width="${source.width}" height="${source.height}" fill="${rgb(bg)}"/>`,`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${rgb(bands[0].color)}"/>`];
  for(const b of bands)base.push(`<rect x="${f(cx-r)}" y="${f(b.y0)}" width="${f(r*2)}" height="${f(b.y1-b.y0)}" fill="${rgb(b.color)}" clip-path="url(#${id})"/>`);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${source.width} ${source.height}" width="${source.width}" height="${source.height}"><defs><clipPath id="${id}"><circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}"/></clipPath></defs>${base.join('')}<g clip-path="url(#${id})">${traced.join('')}</g></svg>`;
}

function traceConnectedMask(mask:ImageData):string[]{
  // Keep structural geometry untouched and spend extra fidelity only on the
  // foreground ink.  ImageTracer's lower line/curve thresholds retain the
  // very thin heraldic strokes that were disappearing from badge centres.
  const svg=ImageTracer.imagedataToSVG(mask,{
    ltres:0.18,
    qtres:0.18,
    pathomit:0,
    rightangleenhance:false,
    colorsampling:0,
    numberofcolors:2,
    mincolorratio:0,
    colorquantcycles:1,
    strokewidth:0,
    scale:1,
    roundcoords:3,
    viewbox:true,
    desc:false,
  });
  const doc=new DOMParser().parseFromString(svg,'image/svg+xml');
  return Array.from(doc.querySelectorAll('path')).map(p=>p.getAttribute('d')).filter((d):d is string=>!!d).map(d=>`<path d="${d}"/>`);
}

function foregroundInkLayers(source:ImageData,cx:number,cy:number,r:number,bands:Band[]):InkLayer[]{
  const palette:Rgb[]=[{r:255,g:255,b:255},{r:8,g:31,b:76},{r:218,g:174,b:71}];
  return palette.map((color,i)=>({mask:makeInkMask(source,cx,cy,r,bands,color,i),color,name:['light','dark','accent'][i]}));
}
function makeInkMask(source:ImageData,cx:number,cy:number,r:number,bands:Band[],target:Rgb,index:number):ImageData{
  const out=new ImageData(source.width,source.height),d=source.data,o=out.data;
  for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++){
    const k=(y*source.width+x)*4,inside=(x-cx)*(x-cx)+(y-cy)*(y-cy)<=r*r;
    let hit=false;
    if(inside){const c={r:d[k],g:d[k+1],b:d[k+2]},band=bandAt(bands,y); if(band){const base=dist(c,band.color),ink=dist(c,target); const chroma=Math.max(c.r,c.g,c.b)-Math.min(c.r,c.g,c.b); const threshold=index===0?92:index===1?72:66; hit=ink<threshold&&ink+18<base&&(index!==0||luma(c)>145)&&(index!==2||chroma>30);}}
    o[k]=o[k+1]=o[k+2]=hit?0:255;o[k+3]=255;
  }
  return out;
}
function bandAt(bands:Band[],y:number):Band|undefined{return bands.find(b=>y>=b.y0&&y<=b.y1)}
function scanCircleGeometry(source:ImageData,bg:Rgb){const {width:w,height:h,data:d}=source;let minX=w,minY=h,maxX=-1,maxY=-1;for(let y=0;y<h;y++)for(let x=0;x<w;x++){const k=(y*w+x)*4,c={r:d[k],g:d[k+1],b:d[k+2]};if(dist(c,bg)>55){minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y)}}if(maxX<0)return null;const rw=maxX-minX+1,rh=maxY-minY+1;if(Math.abs(rw-rh)>Math.max(rw,rh)*.12)return null;return{cx:(minX+maxX)/2,cy:(minY+maxY)/2,r:(rw+rh)/4}}
function scanBands(source:ImageData,bg:Rgb,cx:number,cy:number,r:number):Band[]{const rows:{y:number;color:Rgb}[]=[];for(let y=Math.ceil(cy-r*.82);y<=Math.floor(cy+r*.82);y++){const samples:Rgb[]=[];for(let x=Math.ceil(cx-r*.72);x<=Math.floor(cx+r*.72);x++){const dx=x-cx,dy=y-cy;if(dx*dx+dy*dy>r*r)continue;const k=(y*source.width+x)*4,c={r:source.data[k],g:source.data[k+1],b:source.data[k+2]};if(dist(c,bg)>45)samples.push(c)}if(samples.length)rows.push({y,color:medianColor(samples)})}const out:Band[]=[];for(const row of rows){const last=out[out.length-1];if(!last||dist(last.color,row.color)>52)out.push({y0:row.y,y1:row.y,color:row.color});else{last.y1=row.y;last.color=mix(last.color,row.color,.12)}}return out.filter(b=>b.y1-b.y0>r*.08)}
function cornerBackground(s:ImageData):Rgb{const pts=[[2,2],[s.width-3,2],[2,s.height-3],[s.width-3,s.height-3]],cs=pts.map(([x,y])=>{const k=(y*s.width+x)*4;return{r:s.data[k],g:s.data[k+1],b:s.data[k+2]}});return medianColor(cs)}
function cornerSpread(s:ImageData,b:Rgb){const pts=[[2,2],[s.width-3,2],[2,s.height-3],[s.width-3,s.height-3]];return Math.max(...pts.map(([x,y])=>{const k=(y*s.width+x)*4;return dist({r:s.data[k],g:s.data[k+1],b:s.data[k+2]},b)}))}
function medianColor(cs:Rgb[]):Rgb{const q=(k:keyof Rgb)=>[...cs].sort((a,b)=>a[k]-b[k])[Math.floor(cs.length/2)][k];return{r:q('r'),g:q('g'),b:q('b')}}
function mix(a:Rgb,b:Rgb,t:number):Rgb{return{r:a.r*(1-t)+b.r*t,g:a.g*(1-t)+b.g*t,b:a.b*(1-t)+b.b*t}}
function dist(a:Rgb,b:Rgb){return Math.hypot(a.r-b.r,a.g-b.g,a.b-b.b)}
function luma(c:Rgb){return .2126*c.r+.7152*c.g+.0722*c.b}
function rgb(c:Rgb){return `rgb(${Math.round(c.r)} ${Math.round(c.g)} ${Math.round(c.b)})`}
function f(n:number){return Number(n.toFixed(2))}
