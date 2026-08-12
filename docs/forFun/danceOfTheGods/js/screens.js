"use strict";
/* Dance of the Gods — screens: title art, starter selection, boot */

/* ---- title art: the Keeper on the road to Olympus ---- */
(function(){
  const cv = $("title-canvas"), W=cv.width, H=cv.height;
  const ctx = cv.getContext("2d");
  // sky wash
  const sky = ctx.createLinearGradient(0,0,0,H);
  sky.addColorStop(0,"#8a4626"); sky.addColorStop(.55,"#a8542a"); sky.addColorStop(1,"#c96f3b");
  ctx.fillStyle=sky; ctx.fillRect(0,0,W,H);
  // radiant sun disc behind the mountain
  const cx=W/2, sy=64;
  ctx.save();
  ctx.strokeStyle="rgba(224,168,51,.55)"; ctx.lineWidth=2;
  for(let a=0;a<24;a++){ const th=a*Math.PI/12; ctx.beginPath(); ctx.moveTo(cx,sy);
    ctx.lineTo(cx+Math.cos(th)*220, sy+Math.sin(th)*220); ctx.stroke(); }
  ctx.restore();
  ctx.fillStyle="#e0a833"; ctx.beginPath(); ctx.arc(cx,sy,26,0,7); ctx.fill();
  // Mount Olympus silhouette
  ctx.fillStyle=INK;
  ctx.beginPath();
  ctx.moveTo(0,H); ctx.lineTo(0,150);
  ctx.lineTo(70,150); ctx.lineTo(120,96); ctx.lineTo(150,120);
  ctx.lineTo(cx,54); ctx.lineTo(214,116); ctx.lineTo(246,92);
  ctx.lineTo(300,150); ctx.lineTo(W,150); ctx.lineTo(W,H); ctx.closePath(); ctx.fill();
  // snow/temple crown on peak
  ctx.fillStyle=SLIP;
  ctx.beginPath(); ctx.moveTo(cx,54); ctx.lineTo(cx-14,72); ctx.lineTo(cx+14,72); ctx.closePath(); ctx.fill();
  ctx.fillStyle=INK; ctx.fillRect(cx-9,64,3,8); ctx.fillRect(cx+6,64,3,8);
  // winding road up to the mountain
  ctx.fillStyle="#d8b57a";
  ctx.beginPath();
  ctx.moveTo(cx-60,H); ctx.lineTo(cx+60,H);
  ctx.quadraticCurveTo(cx+14,168, cx+18,150);
  ctx.quadraticCurveTo(cx+22,140, cx-2,140);
  ctx.quadraticCurveTo(cx-24,140, cx-20,168);
  ctx.closePath(); ctx.fill();
  ctx.strokeStyle="rgba(30,20,16,.35)"; ctx.lineWidth=2; ctx.setLineDash([5,7]);
  ctx.beginPath(); ctx.moveTo(cx,H); ctx.quadraticCurveTo(cx-6,168,cx-1,142); ctx.stroke();
  ctx.setLineDash([]);
  // Orpheus walking the road (back view), lyre raised
  const kx=cx-6, kg=H-24;
  ctx.fillStyle=INK;
  ctx.beginPath(); ctx.arc(kx,kg-46,10,0,7); ctx.fill();              // head
  swooshPath(ctx,[[kx-9,kg-38],[kx-15,kg-8],[kx-8,kg+2],[kx+8,kg+2],[kx+15,kg-8],[kx+9,kg-38],[kx-9,kg-38]]);
  ctx.fill();                                                          // chiton
  ctx.strokeStyle=INK; ctx.lineWidth=4; ctx.lineCap="round";
  ctx.beginPath(); ctx.moveTo(kx+8,kg-30); ctx.lineTo(kx+19,kg-26); ctx.stroke(); // arm raised with the lyre
  // the lyre of Orpheus
  const Lx=kx+25, Ly=kg-30;
  ctx.fillStyle="#e0a833";
  ctx.beginPath(); ctx.ellipse(Lx,Ly+8,6,4.5,0,0,7); ctx.fill();       // soundbox
  ctx.strokeStyle="#e0a833"; ctx.lineWidth=2.5;
  ctx.beginPath(); ctx.moveTo(Lx-5,Ly+6); ctx.quadraticCurveTo(Lx-9,Ly-6,Lx-4,Ly-9); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(Lx+5,Ly+6); ctx.quadraticCurveTo(Lx+9,Ly-6,Lx+4,Ly-9); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(Lx-5,Ly-8); ctx.lineTo(Lx+5,Ly-8); ctx.stroke();   // crossbar
  ctx.strokeStyle="#f2e3c8"; ctx.lineWidth=1;
  for(const o of [-3,0,3]){ ctx.beginPath(); ctx.moveTo(Lx+o,Ly-7); ctx.lineTo(Lx+o*0.5,Ly+6); ctx.stroke(); }
  // notes drifting from the strings
  ctx.fillStyle="rgba(242,227,200,.85)"; ctx.strokeStyle="rgba(242,227,200,.85)"; ctx.lineWidth=1.5;
  for(const [nx,ny,s] of [[Lx+14,Ly-16,1],[Lx+24,Ly-27,0.8],[Lx+34,Ly-14,0.9]]){
    ctx.beginPath(); ctx.ellipse(nx,ny,3*s,2.2*s,-0.4,0,7); ctx.fill();
    ctx.beginPath(); ctx.moveTo(nx+2.6*s,ny-0.8); ctx.lineTo(nx+2.6*s,ny-9*s); ctx.stroke();
  }
  // two companions flanking the road
  ctx.save(); ctx.translate(kx-96,kg-40); ctx.scale(.62,.62); SPRITES.owl(ctx, DOMAINS.Wisdom.color); ctx.restore();
  ctx.save(); ctx.translate(kx+52,kg-30); ctx.scale(.6,.6); SPRITES.panther(ctx, DOMAINS.Wine.color); ctx.restore();
  // eagle wheeling above
  ctx.save(); ctx.translate(cx+70,44); ctx.scale(.5,.5); SPRITES.eagle(ctx, DOMAINS.Sky.color); ctx.restore();
})();

/* ---- the Gift of Hermes: choose ONE of three starters ----
   Sky > Sea > Forge > Sky is the type chart's one true triangle. */
const STARTERS = ["peeplet","calfin","cindercrab"];
const picked = new Set();
function buildStarterPick(){
  const grid = $("pick-grid");
  grid.innerHTML=""; picked.clear();
  const b = $("fight-btn");
  b.disabled = true; b.textContent = "Choose a companion";
  for(const key of STARTERS){
    const s = SPECIES[key];
    const tile = document.createElement("div");
    tile.className = "tile";
    tile.innerHTML = `<canvas width="120" height="110"></canvas>
      <div class="nm">${s.name}</div>
      <div class="dm">${s.dom}</div>
      <div class="god">of ${DOMAINS[s.dom].god}</div>`;
    const ctx = tile.querySelector("canvas").getContext("2d");
    ctx.fillStyle="#c96f3b"; ctx.beginPath();
    ctx.roundRect(6,4,108,100,8); ctx.fill();
    ctx.save(); ctx.translate(10,6); ctx.scale(0.85,0.85);
    artDraw(ctx, key, s.sprite, DOMAINS[s.dom].color);
    ctx.restore();
    tile.onclick = ()=>{
      picked.clear(); picked.add(key);
      grid.querySelectorAll(".tile").forEach(t=>t.classList.toggle("sel", t===tile));
      b.disabled = false;
      b.textContent = `Take ${s.name}`;
    };
    grid.appendChild(tile);
  }
}

$("start-btn").onclick = ()=>{
  if(hasSave() && !confirm("Begin a new journey? Your saved journey will be overwritten when you take the road.")) return;
  resetWorld();
  state.ow.flags = {};
  state.team = []; state.caught = [];
  saveEnabled = true;
  enterOverworld("village", 8, 12, "up");
};
$("fight-btn").onclick = ()=>{
  if(!picked.size) return;
  const c = makeCreature([...picked][0], 8);
  state.team = [c];
  const hermes = MAPS.village.npcs.find(n=>n.name==="Hermes");
  if(hermes) hermes.gone = true;
  state.ow.pendingSay = [
    `<b>Hermes</b>: “<b>${c.name}</b>! A fine ear — I'd have picked the same. Clay amphorae bind a weakened beast; the tall grass hides the rest.”`,
    "“And if anyone asks—” but the space where the god stood is already empty, and the road north lies open.",
  ];
  returnToOverworld();
};
/* saved journey → Continue; ?dev → the playtest panel */
(function initTitle(){
  if(hasSave()) $("resume-btn").classList.remove("hidden");
  $("resume-btn").onclick = ()=>{
    if(!loadGame()){
      $("resume-btn").classList.add("hidden");
      alert("The saved journey could not be read — it may predate the current world. Begin anew.");
      clearSave();
    }
  };
  if(new URLSearchParams(location.search).has("dev")) $("dev-btn").classList.remove("hidden");
  $("dev-btn").onclick = ()=>{ initDevPanel(); show("dev-screen"); };
})();
$("again-btn").onclick = ()=> show("title-screen");


/* ---- boot ---- */
renderStage();
