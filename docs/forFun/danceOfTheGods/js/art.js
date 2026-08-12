"use strict";
/* Dance of the Gods — art layer: generated (nano-banana) sprites with
   automatic fallback to the procedural black-figure SPRITES.

   REVERTING: three independent ways, use any —
     1. URL:        ?art=vector   (per-visit; ?art=gen forces generated)
     2. One line:   set DEFAULT_ART = "vector" below
     3. Nuclear:    delete assets/gen/ — missing images fall back per-beast
   The procedural sprites in sprites.js are untouched either way. */

const DEFAULT_ART = "gen";
const ART_MODE = (()=>{
  const q = new URLSearchParams(location.search).get("art");
  return (q==="gen"||q==="vector") ? q : DEFAULT_ART;
})();

/* cache: speciesKey → {status:"loading"|"ready"|"missing", canvas} */
const genArt = {};

/* Generated images arrive on a solid background — chroma-key it out by
   sampling the corners, so they sit on the vase ground like the vectors. */
function keyOut(img){
  const w=img.naturalWidth, h=img.naturalHeight;
  const cv=document.createElement("canvas"); cv.width=w; cv.height=h;
  const ctx=cv.getContext("2d");
  ctx.drawImage(img,0,0);
  const d=ctx.getImageData(0,0,w,h), p=d.data;
  const corners=[0, (w-1)*4, (h-1)*w*4, ((h-1)*w+w-1)*4];
  const bg=[0,1,2].map(i=>Math.round(corners.reduce((s,c)=>s+p[c+i],0)/4));
  const TOL=42;
  // key out the background and find the creature's bounding box in one pass
  let x0=w, y0=h, x1=0, y1=0;
  for(let y=0;y<h;y++) for(let x=0;x<w;x++){
    const i=(y*w+x)*4;
    if(Math.abs(p[i]-bg[0])<TOL && Math.abs(p[i+1]-bg[1])<TOL && Math.abs(p[i+2]-bg[2])<TOL) p[i+3]=0;
    else { if(x<x0)x0=x; if(x>x1)x1=x; if(y<y0)y0=y; if(y>y1)y1=y; }
  }
  ctx.putImageData(d,0,0);
  if(x1<=x0 || y1<=y0){ x0=0; y0=0; x1=w-1; y1=h-1; }   // fully keyed? use whole frame
  return {canvas:cv, bbox:[x0,y0,x1-x0+1,y1-y0+1]};
}

function loadGenArt(key){
  if(genArt[key]) return;
  genArt[key]={status:"loading", canvas:null};
  const img=new Image();
  img.onload = ()=>{ try{ const k=keyOut(img);
                          genArt[key]={status:"ready", canvas:k.canvas, bbox:k.bbox}; }
                     catch(e){ genArt[key]={status:"missing"}; }
                     artRefresh(); };
  img.onerror = ()=>{ genArt[key]={status:"missing"}; };
  img.src = `assets/gen/beasts/${key}.png`;
}

/* Screens that draw beasts ONCE (pick tiles, party cards) would keep the
   vector fallback if their canvases were painted before an image finished
   loading — repaint them when art arrives. The battle canvas redraws every
   frame and needs nothing. */
function artRefresh(){
  const active=document.querySelector(".screen.active");
  if(!active) return;
  if(active.id==="pick-screen" && typeof buildStarterPick==="function"
     && typeof picked!=="undefined" && picked.size===0) buildStarterPick();
  else if(active.id==="party-screen" && typeof renderParty==="function") renderParty();
}

/* Draw a beast into the standard ~110×100 sprite box of the CURRENT
   transform. Uses the generated image when enabled+ready, else falls back
   to the procedural sprite. All call sites keep their translate/scale/flip. */
/* Preload everything at boot so screens almost never catch art mid-load. */
if(ART_MODE==="gen" && typeof SPECIES!=="undefined"){
  Object.keys(SPECIES).forEach(loadGenArt);
}

function artDraw(ctx, speciesKey, spriteKey, acc){
  if(ART_MODE==="gen"){
    loadGenArt(speciesKey);
    const a=genArt[speciesKey];
    if(a && a.status==="ready"){
      // crop to the creature and fit it into the ~110×100 sprite box,
      // bottom-aligned so it stands on the same ground as the vectors
      const [sx,sy,sw,sh]=a.bbox;
      const scale=Math.min(106/sw, 94/sh);
      const dw=sw*scale, dh=sh*scale;
      spShadow(ctx,55,96,Math.max(24, dw*0.42));
      ctx.drawImage(a.canvas, sx,sy,sw,sh, 55-dw/2, 95-dh, dw, dh);
      return;
    }
    if(a && a.status==="loading") { /* fall through to vector this frame */ }
  }
  SPRITES[spriteKey](ctx, acc);
}
