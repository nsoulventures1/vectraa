import ImageTracer from 'imagetracerjs';
import type { VectorizeOptions } from './types';

interface Rgb { r: number; g: number; b: number }
interface Band { y0: number; y1: number; color: Rgb }
interface Component { pixels:number[]; minX:number; minY:number; maxX:number; maxY:number }

/** Clean geometry + locally supersampled high-contrast foreground pipeline. */
export function tryVectorizeCenteredBandedBadge(source: ImageData, options: VectorizeOptions): string | null {
  const bg=cornerBackground(source); if(luma(bg)>70||cornerSpread(source,bg)>34)return null;
  const geometry=scanCircleGeometry(source,bg); if(!geometry)return null;
  const {cx,cy,r}=geometry;
  const bands=scanBands(source,bg,cx,cy,r); if(bands.length<2||bands.length>5)return null;

  const mask=foregroundMask(source,cx,cy,r,bands);
  const details=traceConnectedMask(mask);
  if(!details.length)return null;

  const clipId='vectraa-centred-badge';
  const base:string[]=[`<rect x="0" y="0" width="${source.width}" height="${source.height}" fill="${rgb(bg)}"/>`,`<circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}" fill="${rgb(bands[0].color)}"/>`];
  for(const band of bands)base.push(`<rect x="${f(cx-r)}" y="${f(band.y0)}" width="${f(r*2)}" height="${f(band.y1-band.y0)}" fill="${rgb(band.color)}" clip-path="url(#${clipId})"/>`);

  const ink=dominantInsigniaColor(source,cx,cy,r,bands);
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${source.width} ${source.height}" width="${source.width}" height="${source.height}"><defs><clipPath id="${clipId}"><circle cx="${f(cx)}" cy="${f(cy)}" r="${f(r)}"/></clipPath></defs>${base.join('')}<g clip-path="url(#${clipId})" fill="${rgb(ink)}">${details.join('')}</g></svg>`;
}

/**
 * Trace each connected insignia component in a tight local canvas. Fine feathers,
 * Ashoka details and thin sword lines are supersampled 3x before tracing; large solid
 * anchor/body components stay 1x. This avoids simplifying tiny details against the
 * full badge canvas while preventing huge noisy compound paths.
 */
function traceConnectedMask(mask:ImageData):string[]{
  const w=mask.width,h=mask.height,fg=new Uint8Array(w*h);
  for(let i=0;i<w*h;i++)fg[i]=mask.data[i*4]<128?1:0;
  const comps=components(fg,w,h).filter(c=>c.pixels.length>=2);
  const out:string[]=[];
  for(const c of comps){
    const bw=c.maxX-c.minX+1,bh=c.maxY-c.minY+1;
    const fine=bw<=w*.22||bh<=h*.16||c.pixels.length<Math.max(80,w*h*.0012);
    const factor=fine?3:1,pad=fine?3:2;
    const lw=(bw+pad*2)*factor,lh=(bh+pad*2)*factor;
    const img=new ImageData(lw,lh);
    for(let i=0;i<img.data.length;i+=4){img.data[i]=255;img.data[i+1]=255;img.data[i+2]=255;img.data[i+3]=255;}
    for(const p of c.pixels){const x=p%w,y=Math.floor(p/w);const x0=(x-c.minX+pad)*factor,y0=(y-c.minY+pad)*factor;for(let yy=0;yy<factor;yy++)for(let xx=0;xx<factor;xx++){const j=((y0+yy)*lw+x0+xx)*4;img.data[j]=0;img.data[j+1]=0;img.data[j+2]=0;img.data[j+3]=255;}}
    const traced=ImageTracer.imagedataToSVG(img,{ltres:fine?.04:.08,qtres:fine?.055:.11,pathomit:0,rightangleenhance:true,colorsampling:0,numberofcolors:2,mincolorratio:0,colorquantcycles:1,layering:0,strokewidth:0,linefilter:false,scale:1,roundcoords:fine?8:7,viewbox:true,desc:false,blurradius:0,blurdelta:0});
    const paths=darkMaskPaths(traced);
    const tx=c.minX-pad,ty=c.minY-pad;
    if(factor===1)out.push(...paths.map(p=>`<g transform="translate(${tx} ${ty})">${p}</g>`));
    else out.push(...paths.map(p=>`<g transform="translate(${tx} ${ty}) scale(${1/factor})">${p}</g>`));
  }
  return out;
}

function components(mask:Uint8Array,w:number,h:number):Component[]{
  const seen=new Uint8Array(mask.length),queue=new Int32Array(mask.length),out:Component[]=[];
  for(let s=0;s<mask.length;s++){
    if(!mask[s]||seen[s])continue;
    let head=0,tail=0;queue[tail++]=s;seen[s]=1;const pixels:number[]=[];let minX=w,minY=h,maxX=0,maxY=0;
    while(head<tail){const p=queue[head++],x=p%w,y=Math.floor(p/w);pixels.push(p);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);for(let dy=-1;dy<=1;dy++)for(let dx=-1;dx<=1;dx++){if(!dx&&!dy)continue;const nx=x+dx,ny=y+dy;if(nx<0||ny<0||nx>=w||ny>=h)continue;const np=ny*w+nx;if(mask[np]&&!seen[np]){seen[np]=1;queue[tail++]=np;}}}
    out.push({pixels,minX,minY,maxX,maxY});
  }
  return out;
}

function foregroundMask(source:ImageData,cx:number,cy:number,r:number,bands:Band[]):ImageData{
  const w=source.width,h=source.height; const raw=new Uint8Array(w*h);
  const edgeGuard=Math.max(4,r*.022), bandGuard=Math.max(2,r*.010);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    if(Math.hypot(x-cx,y-cy)>r-edgeGuard)continue;
    const band=bands.find(v=>y>=v.y0&&y<v.y1); if(!band)continue;
    if(bands.some(v=>Math.abs(y-v.y0)<bandGuard||Math.abs(y-v.y1)<bandGuard))continue;
    const c=px(source,x,y); const dl=dist(c,band.color); const lumDelta=Math.abs(luma(c)-luma(band.color));
    if(dl>78 && (lumDelta>42 || dl>118))raw[y*w+x]=1;
  }
  const clean=new Uint8Array(raw);
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){
    let n=0; for(let yy=-1;yy<=1;yy++)for(let xx=-1;xx<=1;xx++)if(raw[(y+yy)*w+x+xx])n++;
    const i=y*w+x;if(raw[i]&&n<=2)clean[i]=0;else if(!raw[i]&&n>=7)clean[i]=1;
  }
  const final=new Uint8Array(clean);
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++)if(clean[y*w+x]){let orth=0;if(clean[y*w+x-1])orth++;if(clean[y*w+x+1])orth++;if(clean[(y-1)*w+x])orth++;if(clean[(y+1)*w+x])orth++;if(orth===0)final[y*w+x]=0;}
  const out=new ImageData(w,h);for(let i=0;i<w*h;i++){const v=final[i]?0:255,j=i*4;out.data[j]=v;out.data[j+1]=v;out.data[j+2]=v;out.data[j+3]=255;}return out;
}

function dominantInsigniaColor(source:ImageData,cx:number,cy:number,r:number,bands:Band[]):Rgb{
  const colors:Rgb[]=[];for(let y=Math.max(0,Math.floor(cy-r));y<Math.min(source.height,Math.ceil(cy+r));y+=2)for(let x=Math.max(0,Math.floor(cx-r));x<Math.min(source.width,Math.ceil(cx+r));x+=2){if(Math.hypot(x-cx,y-cy)>r*.94)continue;const band=bands.find(v=>y>=v.y0&&y<v.y1);if(!band)continue;const c=px(source,x,y);if(dist(c,band.color)>100&&Math.abs(luma(c)-luma(band.color))>45)colors.push(c);}if(!colors.length)return{r:255,g:255,b:255};const sorted=colors.sort((a,b)=>luma(b)-luma(a));return median(sorted.slice(0,Math.max(8,Math.floor(sorted.length*.35))));
}

function scanCircleGeometry(source:ImageData,bg:Rgb):{cx:number;cy:number;r:number}|null{
  const cx0=source.width/2,cy0=source.height/2;const hs:Array<{left:number;right:number}>=[],vs:Array<{top:number;bottom:number}>=[];for(const q of[-.35,-.2,0,.2,.35]){const y=Math.round(cy0+source.height*q*.5),left=firstForegroundFromLeft(source,y,bg),right=firstForegroundFromRight(source,y,bg);if(left>=0&&right>=0)hs.push({left,right});const x=Math.round(cx0+source.width*q*.5),top=firstForegroundFromTop(source,x,bg),bottom=firstForegroundFromBottom(source,x,bg);if(top>=0&&bottom>=0)vs.push({top,bottom});}if(hs.length<3||vs.length<3)return null;const H=hs.reduce((a,v)=>(v.right-v.left)>(a.right-a.left)?v:a,hs[0]),V=vs.reduce((a,v)=>(v.bottom-v.top)>(a.bottom-a.top)?v:a,vs[0]);const width=H.right-H.left+1,height=V.bottom-V.top+1;if(width<source.width*.45||height<source.height*.45||Math.abs(width-height)/Math.max(width,height)>.12)return null;const cx=(H.left+H.right)/2,cy=(V.top+V.bottom)/2,r=(width+height)/4;if(Math.abs(cx-cx0)>source.width*.08||Math.abs(cy-cy0)>source.height*.08)return null;const probes=[px(source,cx-r*.62,cy-r*.35),px(source,cx+r*.62,cy-r*.35),px(source,cx-r*.62,cy),px(source,cx+r*.62,cy),px(source,cx-r*.62,cy+r*.35),px(source,cx+r*.62,cy+r*.35)];if(probes.filter(c=>dist(c,bg)>70).length<5)return null;return{cx,cy,r};
}
function firstForegroundFromLeft(s:ImageData,y:number,b:Rgb){for(let x=0;x<s.width;x++)if(runH(s,x,y,1,b))return x;return-1}function firstForegroundFromRight(s:ImageData,y:number,b:Rgb){for(let x=s.width-1;x>=0;x--)if(runH(s,x,y,-1,b))return x;return-1}function firstForegroundFromTop(s:ImageData,x:number,b:Rgb){for(let y=0;y<s.height;y++)if(runV(s,x,y,1,b))return y;return-1}function firstForegroundFromBottom(s:ImageData,x:number,b:Rgb){for(let y=s.height-1;y>=0;y--)if(runV(s,x,y,-1,b))return y;return-1}function runH(s:ImageData,x:number,y:number,d:number,b:Rgb){for(let k=0;k<5;k++){const xx=x+k*d;if(xx<0||xx>=s.width||dist(px(s,xx,y),b)<62)return false}return true}function runV(s:ImageData,x:number,y:number,d:number,b:Rgb){for(let k=0;k<5;k++){const yy=y+k*d;if(yy<0||yy>=s.height||dist(px(s,x,yy),b)<62)return false}return true}

function scanBands(source:ImageData,bg:Rgb,cx:number,cy:number,r:number):Band[]{const rows:Array<{y:number;color:Rgb}>=[];for(let y=Math.ceil(cy-r*.88);y<=Math.floor(cy+r*.88);y++){const dy=y-cy,half=Math.sqrt(Math.max(0,r*r-dy*dy));if(half<r*.32)continue;const cs=[-.82,-.72,.72,.82].map(q=>px(source,cx+half*q,y)).filter(c=>dist(c,bg)>48);if(cs.length>=2)rows.push({y,color:dominant(cs,52)})}if(!rows.length)return[];const smooth=rows.map((row,i)=>({y:row.y,color:dominant(rows.slice(Math.max(0,i-4),Math.min(rows.length,i+5)).map(v=>v.color),58)})),runs:Band[]=[];for(const row of smooth){const last=runs[runs.length-1];if(last&&dist(last.color,row.color)<68){const n=Math.max(1,last.y1-last.y0);last.color={r:Math.round((last.color.r*n+row.color.r)/(n+1)),g:Math.round((last.color.g*n+row.color.g)/(n+1)),b:Math.round((last.color.b*n+row.color.b)/(n+1))};last.y1=row.y+1}else runs.push({y0:row.y,y1:row.y+1,color:row.color})}let major=runs.filter(v=>v.y1-v.y0>=r*.10);if(major.length<2||major.length>5)return[];if(major.length>3)major=major.sort((a,b)=>(b.y1-b.y0)-(a.y1-a.y0)).slice(0,5).sort((a,b)=>a.y0-b.y0);major[0].y0=cy-r;major[major.length-1].y1=cy+r;for(let i=0;i<major.length-1;i++){const b=(major[i].y1+major[i+1].y0)/2;major[i].y1=b;major[i+1].y0=b}return major}

function cornerBackground(s:ImageData):Rgb{const pts:Rgb[]=[],z=Math.max(4,Math.round(Math.min(s.width,s.height)*.06));for(const[ox,oy]of[[0,0],[s.width-z,0],[0,s.height-z],[s.width-z,s.height-z]])for(let y=oy;y<oy+z;y+=Math.max(1,Math.floor(z/7)))for(let x=ox;x<ox+z;x+=Math.max(1,Math.floor(z/7)))pts.push(px(s,x,y));return median(pts)}function cornerSpread(s:ImageData,b:Rgb){return Math.max(...[px(s,2,2),px(s,s.width-3,2),px(s,2,s.height-3),px(s,s.width-3,s.height-3)].map(c=>dist(c,b)))}function dominant(cs:Rgb[],tol:number):Rgb{let best=cs.slice(0,1);for(const seed of cs){const c=cs.filter(v=>dist(seed,v)<=tol);if(c.length>best.length)best=c}return median(best)}function median(cs:Rgb[]):Rgb{const ch=(k:keyof Rgb)=>{const v=cs.map(c=>c[k]).sort((a,b)=>a-b);return v[Math.floor(v.length/2)]??0};return{r:ch('r'),g:ch('g'),b:ch('b')}}function px(s:ImageData,x:number,y:number):Rgb{const xx=Math.max(0,Math.min(s.width-1,Math.round(x))),yy=Math.max(0,Math.min(s.height-1,Math.round(y))),i=(yy*s.width+xx)*4;return{r:s.data[i],g:s.data[i+1],b:s.data[i+2]}}function dist(a:Rgb,b:Rgb){return Math.hypot(a.r-b.r,a.g-b.g,a.b-b.b)}function luma(c:Rgb){return .2126*c.r+.7152*c.g+.0722*c.b}function rgb(c:Rgb){return`rgb(${c.r},${c.g},${c.b})`}function f(v:number){return Number(v.toFixed(2)).toString()}
function darkMaskPaths(svg:string):string[]{const tags=svg.match(/<path\b[^>]*\/>|<path\b[^>]*>[\s\S]*?<\/path>/g)??[];return tags.filter(tag=>{const m=tag.match(/fill="rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)"/);return !!m&&(Number(m[1])+Number(m[2])+Number(m[3])<300)}).map(tag=>tag.replace(/fill="rgb\([^\"]+\)"/,'fill="inherit"'))}
