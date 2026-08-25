import ImageTracer from 'imagetracerjs';
import type { VectorizeOptions } from './types';

interface Rgb { r: number; g: number; b: number }
interface Band { y0: number; y1: number; color: Rgb }

/**
 * Reconstruct centred circular, horizontally-banded badges as clean SVG geometry,
 * while tracing only the foreground insignia. This prevents raster noise from being
 * reintroduced along the circle and band boundaries.
 */
export function tryVectorizeCenteredBandedBadge(source: ImageData, options: VectorizeOptions): string | null {
  const bg = cornerBackground(source);
  if (luma(bg) > 70 || cornerSpread(source, bg) > 34) return null;

  const geometry = scanCircleGeometry(source, bg);
  if (!geometry) return null;
  const { cx, cy, r } = geometry;

  const bands = scanBands(source, bg, cx, cy, r);
  if (bands.length < 2 || bands.length > 5) return null;

  const overlay = detailOverlay(source, bg, cx, cy, r, bands);
  const traced = ImageTracer.imagedataToSVG(overlay, {
    ltres: 0.08,
    qtres: 0.11,
    pathomit: 0,
    rightangleenhance: true,
    colorsampling: 2,
    numberofcolors: Math.max(6, Math.min(16, options.colors || 10)),
    mincolorratio: 0.00002,
    colorquantcycles: 3,
    layering: 0,
    strokewidth: 0,
    linefilter: false,
    scale: 1,
    roundcoords: 7,
    viewbox: true,
    desc: false,
    blurradius: 0,
    blurdelta: 0,
  });

  const details = nonWhitePaths(traced);
  const clipId = 'vectraa-centred-badge';
  const base: string[] = [
    `<rect x="0" y="0" width="${source.width}" height="${source.height}" fill="${rgb(bg)}"/>`,
    `<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${rgb(bands[0].color)}"/>`,
  ];
  for (const band of bands) {
    base.push(`<rect x="${f(cx-r)}" y="${f(band.y0)}" width="${f(r*2)}" height="${f(band.y1-band.y0)}" fill="${rgb(band.color)}" clip-path="url(#${clipId})"/>`);
  }

  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${source.width} ${source.height}" width="${source.width}" height="${source.height}"><defs><clipPath id="${clipId}"><circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}"/></clipPath></defs>${base.join('')}<g clip-path="url(#${clipId})">${details.join('')}</g></svg>`;
}

function scanCircleGeometry(source: ImageData, bg: Rgb): { cx: number; cy: number; r: number } | null {
  const cx0 = source.width / 2;
  const cy0 = source.height / 2;
  const horizontal: Array<{left:number;right:number}> = [];
  const vertical: Array<{top:number;bottom:number}> = [];
  const offsets=[-0.35,-0.2,0,0.2,0.35];
  for(const q of offsets){
    const y=Math.round(cy0+source.height*q*0.5);
    const left=firstForegroundFromLeft(source,y,bg), right=firstForegroundFromRight(source,y,bg);
    if(left>=0&&right>=0) horizontal.push({left,right});
    const x=Math.round(cx0+source.width*q*0.5);
    const top=firstForegroundFromTop(source,x,bg), bottom=firstForegroundFromBottom(source,x,bg);
    if(top>=0&&bottom>=0) vertical.push({top,bottom});
  }
  if(horizontal.length<3||vertical.length<3)return null;

  const centreH=horizontal.reduce((best,v)=>(v.right-v.left)>(best.right-best.left)?v:best,horizontal[0]);
  const centreV=vertical.reduce((best,v)=>(v.bottom-v.top)>(best.bottom-best.top)?v:best,vertical[0]);
  const width=centreH.right-centreH.left+1, height=centreV.bottom-centreV.top+1;
  if(width<source.width*.45||height<source.height*.45)return null;
  if(Math.abs(width-height)/Math.max(width,height)>.12)return null;

  const cx=(centreH.left+centreH.right)/2, cy=(centreV.top+centreV.bottom)/2;
  const r=(width+height)/4;
  if(Math.abs(cx-cx0)>source.width*.08||Math.abs(cy-cy0)>source.height*.08)return null;

  const probes=[px(source,cx-r*.62,cy-r*.35),px(source,cx+r*.62,cy-r*.35),px(source,cx-r*.62,cy),px(source,cx+r*.62,cy),px(source,cx-r*.62,cy+r*.35),px(source,cx+r*.62,cy+r*.35)];
  if(probes.filter((c)=>dist(c,bg)>70).length<5)return null;
  return {cx,cy,r};
}

function firstForegroundFromLeft(source: ImageData, y: number, bg: Rgb): number { for(let x=0;x<source.width;x++)if(runDifferentH(source,x,y,1,bg))return x;return -1; }
function firstForegroundFromRight(source: ImageData, y: number, bg: Rgb): number { for(let x=source.width-1;x>=0;x--)if(runDifferentH(source,x,y,-1,bg))return x;return -1; }
function firstForegroundFromTop(source: ImageData, x: number, bg: Rgb): number { for(let y=0;y<source.height;y++)if(runDifferentV(source,x,y,1,bg))return y;return -1; }
function firstForegroundFromBottom(source: ImageData, x: number, bg: Rgb): number { for(let y=source.height-1;y>=0;y--)if(runDifferentV(source,x,y,-1,bg))return y;return -1; }
function runDifferentH(source:ImageData,x:number,y:number,dir:number,bg:Rgb):boolean{for(let k=0;k<5;k++){const xx=x+k*dir;if(xx<0||xx>=source.width||dist(px(source,xx,y),bg)<62)return false;}return true;}
function runDifferentV(source:ImageData,x:number,y:number,dir:number,bg:Rgb):boolean{for(let k=0;k<5;k++){const yy=y+k*dir;if(yy<0||yy>=source.height||dist(px(source,x,yy),bg)<62)return false;}return true;}

function scanBands(source:ImageData,bg:Rgb,cx:number,cy:number,r:number):Band[]{
  const rows:Array<{y:number;color:Rgb}>=[];
  const start=Math.ceil(cy-r*.88),end=Math.floor(cy+r*.88);
  for(let y=start;y<=end;y++){
    const dy=y-cy,half=Math.sqrt(Math.max(0,r*r-dy*dy));
    if(half<r*.32)continue;
    const colors=[-.82,-.72,.72,.82].map((q)=>px(source,cx+half*q,y)).filter((c)=>dist(c,bg)>48);
    if(colors.length<2)continue;
    rows.push({y,color:dominant(colors,52)});
  }
  if(!rows.length)return [];
  const smooth=rows.map((row,i)=>({y:row.y,color:dominant(rows.slice(Math.max(0,i-4),Math.min(rows.length,i+5)).map((v)=>v.color),58)}));
  const runs:Band[]=[];
  for(const row of smooth){
    const last=runs[runs.length-1];
    if(last&&dist(last.color,row.color)<68){const n=Math.max(1,last.y1-last.y0);last.color={r:Math.round((last.color.r*n+row.color.r)/(n+1)),g:Math.round((last.color.g*n+row.color.g)/(n+1)),b:Math.round((last.color.b*n+row.color.b)/(n+1))};last.y1=row.y+1;}
    else runs.push({y0:row.y,y1:row.y+1,color:row.color});
  }
  let major=runs.filter((v)=>v.y1-v.y0>=r*.10);
  if(major.length<2||major.length>5)return [];
  if(major.length>3)major=major.sort((a,b)=>(b.y1-b.y0)-(a.y1-a.y0)).slice(0,5).sort((a,b)=>a.y0-b.y0);
  major[0].y0=cy-r;major[major.length-1].y1=cy+r;
  for(let i=0;i<major.length-1;i++){const boundary=(major[i].y1+major[i+1].y0)/2;major[i].y1=boundary;major[i+1].y0=boundary;}
  return major;
}

function detailOverlay(source:ImageData,bg:Rgb,cx:number,cy:number,r:number,bands:Band[]):ImageData{
  const out=new ImageData(source.width,source.height);
  for(let i=0;i<out.data.length;i+=4){out.data[i]=255;out.data[i+1]=255;out.data[i+2]=255;out.data[i+3]=255;}
  const edgeGuard=Math.max(3,r*.018), bandGuard=Math.max(3,r*.014);
  for(let y=0;y<source.height;y++)for(let x=0;x<source.width;x++){
    const d=Math.hypot(x-cx,y-cy);
    if(d>r-edgeGuard)continue;
    const band=bands.find((v)=>y>=v.y0&&y<v.y1);
    if(!band)continue;
    if(bands.some((v)=>Math.abs(y-v.y0)<bandGuard||Math.abs(y-v.y1)<bandGuard))continue;
    const actual=px(source,x,y);
    const contrast=dist(actual,band.color);
    if(contrast<86)continue;
    // Reject isolated anti-alias/noise pixels. Genuine insignia pixels have nearby support.
    let support=0;
    for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1],[-1,-1],[1,1]]){
      const n=px(source,x+dx,y+dy);if(dist(n,band.color)>=72)support++;
    }
    if(support<2)continue;
    const i=(y*source.width+x)*4;
    out.data[i]=source.data[i];out.data[i+1]=source.data[i+1];out.data[i+2]=source.data[i+2];out.data[i+3]=source.data[i+3];
  }
  return out;
}

function cornerBackground(source:ImageData):Rgb{const pts:Rgb[]=[];const size=Math.max(4,Math.round(Math.min(source.width,source.height)*.06));for(const[ox,oy]of[[0,0],[source.width-size,0],[0,source.height-size],[source.width-size,source.height-size]])for(let y=oy;y<oy+size;y+=Math.max(1,Math.floor(size/7)))for(let x=ox;x<ox+size;x+=Math.max(1,Math.floor(size/7)))pts.push(px(source,x,y));return median(pts);}
function cornerSpread(source:ImageData,bg:Rgb):number{const samples=[px(source,2,2),px(source,source.width-3,2),px(source,2,source.height-3),px(source,source.width-3,source.height-3)];return Math.max(...samples.map((c)=>dist(c,bg)));}
function dominant(colors:Rgb[],tol:number):Rgb{let best=colors.slice(0,1);for(const seed of colors){const c=colors.filter((v)=>dist(seed,v)<=tol);if(c.length>best.length)best=c;}return median(best);}
function median(colors:Rgb[]):Rgb{const ch=(k:keyof Rgb)=>{const v=colors.map((c)=>c[k]).sort((a,b)=>a-b);return v[Math.floor(v.length/2)]??0;};return{r:ch('r'),g:ch('g'),b:ch('b')};}
function px(source:ImageData,x:number,y:number):Rgb{const xx=Math.max(0,Math.min(source.width-1,Math.round(x))),yy=Math.max(0,Math.min(source.height-1,Math.round(y)));const i=(yy*source.width+xx)*4;return{r:source.data[i],g:source.data[i+1],b:source.data[i+2]};}
function dist(a:Rgb,b:Rgb):number{return Math.hypot(a.r-b.r,a.g-b.g,a.b-b.b);}
function luma(c:Rgb):number{return .2126*c.r+.7152*c.g+.0722*c.b;}
function rgb(c:Rgb):string{return`rgb(${c.r},${c.g},${c.b})`;}
function f(v:number):string{return Number(v.toFixed(2)).toString();}
function nonWhitePaths(svg:string):string[]{const tags=svg.match(/<path\b[^>]*\/>|<path\b[^>]*>[\s\S]*?<\/path>/g)??[];return tags.filter((tag)=>{const m=tag.match(/fill="rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)"/);return !!m&&!(Number(m[1])>238&&Number(m[2])>238&&Number(m[3])>238);});}
