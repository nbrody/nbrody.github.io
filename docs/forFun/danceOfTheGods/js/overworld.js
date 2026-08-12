"use strict";
/* Dance of the Gods — overworld: tilemaps, movement, encounters, party menu */

/* ================================================================
   OVERWORLD — tilemap, movement, encounters
   ================================================================ */
const GOLD="#e0a833", RED="#b03a2e", TEAL="#2e7d78", TERRA="#c96f3b";
const TILE=32, OWW=416, OWH=288, MOVE_MS=140;
const DIRV={up:[0,-1],down:[0,1],left:[-1,0],right:[1,0]};
const opposite={up:"down",down:"up",left:"right",right:"left"};
const BLOCKED = new Set(["T","~","#","R","O","S","D","C","Y","L","v"," "]);
/* Maps, NPCs and myth scripts live in maps.js (MAPS, openDelphiGate, myth*). */

/* ---- overworld state / loop ---- */
const owcv = $("ow-canvas"), owctx = owcv.getContext("2d");
let owActive=false, owBusy=false, owRunning=false, owLast=0, dlgResolver=null;
const keys={};
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));

function enterOverworld(mapId, tx, ty, dir){
  const map = MAPS[mapId];
  state.ow.map = map;
  state.ow.tx = tx; state.ow.ty = ty;
  state.ow.px = tx*TILE; state.ow.py = ty*TILE;
  state.ow.dir = dir||"down"; state.ow.moving=false; state.ow.mt=0; state.ow.steps=0;
  $("ow-place").textContent = map.name;
  $("brand-sub").textContent = map.name;
  show("overworld-screen");
  startOwLoop();
  saveGame();
}
function returnToOverworld(){
  const map = state.ow.map;
  $("ow-place").textContent = map.name;
  $("brand-sub").textContent = map.name;
  show("overworld-screen");
  startOwLoop();
  saveGame();
  if(state.ow.pendingSay){ const p=state.ow.pendingSay; state.ow.pendingSay=null; owSay(p); }
}
function startOwLoop(){
  owActive=true; owLast=0;
  if(!owRunning){ owRunning=true; requestAnimationFrame(owLoop); }
}
function owLoop(ts){
  if(!owActive){ owRunning=false; return; }
  const dt = owLast ? Math.min(50, ts-owLast) : 16; owLast=ts;
  owUpdate(dt); owRender(ts);
  requestAnimationFrame(owLoop);
}

function inputDir(){
  for(const d of ["up","down","left","right"]) if(keys[d]) return d;
  return null;
}
function tileAt(map,x,y){ return (x<0||y<0||x>=map.w||y>=map.h) ? " " : map.grid[y][x]; }
function isWalkable(map,x,y){
  if(x<0||y<0||x>=map.w||y>=map.h) return false;
  if(BLOCKED.has(map.grid[y][x])) return false;
  if(map.npcs.some(n=>n.solid!==false && !n.gone && !n.passable && n.x===x && n.y===y)) return false;
  return true;
}
function owUpdate(dt){
  const o=state.ow;
  if(o.moving){
    o.mt += dt;
    const p = Math.min(1, o.mt/MOVE_MS);
    o.px = o.from.x + (o.to.x-o.from.x)*p;
    o.py = o.from.y + (o.to.y-o.from.y)*p;
    if(p>=1){ o.moving=false; o.px=o.to.x; o.py=o.to.y; onArrive(); }
    return;
  }
  if(owBusy) return;
  const dir = inputDir();
  if(dir){
    o.dir = dir;
    const [dx,dy]=DIRV[dir], nx=o.tx+dx, ny=o.ty+dy;
    if(isWalkable(o.map,nx,ny)){
      o.from={x:o.px,y:o.py}; o.to={x:nx*TILE,y:ny*TILE};
      o.tx=nx; o.ty=ny; o.moving=true; o.mt=0;
    }
  }
}
function onArrive(){
  const o=state.ow;
  const wp = o.map.warps[o.tx+","+o.ty];
  if(wp){
    if(state.team.length===0){
      owSay("<b>Hermes</b> calls from the gate: “Not alone, singer! The road eats unaccompanied poets. Come and see me first.”");
      return;
    }
    enterOverworld(wp.map, wp.x, wp.y, wp.dir); return;
  }
  if(tileAt(o.map,o.tx,o.ty)==="\""){
    o.steps=(o.steps||0)+1;
    if(o.steps>=1 && rng()<0.16){ o.steps=0; wildEncounter(); }
  } else o.steps=0;
}

/* ---- interaction & dialogue ---- */
function owShowLine(text){
  return new Promise(res=>{
    $("owd-text").innerHTML=text;
    $("ow-dialogue").classList.remove("hidden");
    dlgResolver=res;
  });
}
function advanceDialogue(){ if(dlgResolver){ const r=dlgResolver; dlgResolver=null; r(); } }
async function owSay(lines){
  owBusy=true;
  for(const ln of (Array.isArray(lines)?lines:[lines])) await owShowLine(ln);
  $("ow-dialogue").classList.add("hidden");
  owBusy=false;
}
$("ow-dialogue").addEventListener("click", advanceDialogue);

function interact(){
  if(owBusy){ advanceDialogue(); return; }
  const o=state.ow;
  const [dx,dy]=DIRV[o.dir], fx=o.tx+dx, fy=o.ty+dy;
  const npc = o.map.npcs.find(n=>!n.gone && n.x===fx && n.y===fy);
  if(npc){ npc.dir = opposite[o.dir]; runNpc(npc); return; }
  const sign = o.map.signs[fx+","+fy];
  if(sign){ owSay(sign); return; }
  const ch = tileAt(o.map,fx,fy);
  if(ch==="O"){ owSay(o.map.id==="delphi"
    ? "The Omphalos — the navel of the world, wound about with woolen fillets."
    : "The village well. Still water — beasts keep their distance."); return; }
  if(ch==="D"){ owSay("The door is shut."); return; }
  if(ch==="S"){ owSay("An old marker, its letters worn to nothing."); return; }
  if(ch==="Y"){ owSay("The great serpent <b>Python</b>, cold on the marble. A golden arrow still stands in its coils."); return; }
  if(ch==="L"){ owSay("A young <b>laurel</b>, trembling though there is no wind. The bark is warm."); return; }
}
async function runNpc(npc){
  if(npc.kind==="heal"){
    await owSay(npc.talk);
    state.team.forEach(healFull); state.caught.forEach(healFull);
    await owSay(`<b>${npc.name}</b> anoints your amphorae — your companions are fully restored!`);
  } else if(npc.kind==="trainer"){
    if(npc.defeated){ await owSay(npc.after); }
    else { await owSay(npc.talk); trainerBattle(npc); }
  } else if(npc.kind==="script"){
    await npc.script(npc);
  } else {
    await owSay(npc.talk);
  }
  saveGame();
}
function healFull(c){ c.hp=c.maxhp; c.status=null; c.statusTurns=0; c.stages={atk:0,def:0,gra:0,aeg:0,spe:0}; }

/* ---- encounters / battles from overworld ---- */
function weightedPick(list){ let s=list.reduce((a,b)=>a+b.w,0), r=rng()*s; for(const it of list){ if((r-=it.w)<0) return it.key; } return list[0].key; }
function wildEncounter(){
  const enc = state.ow.map.encounters;
  const key = weightedPick(enc.table);
  const lvl = enc.min + Math.floor(rng()*(enc.max-enc.min+1));
  const wild = makeCreature(key, lvl);
  owActive=false;
  beginBattle({
    mode:"wild", foeTeam:[wild], canCatch:true, canFlee:true, foeName:"The wild beast",
    intro:[`The grove rustles — a wild <b>${wild.name}</b> (Lv ${lvl}) appears!`],
    onEnd:(res)=>{ if(res==="lost") blackout(); else returnToOverworld(); },
  });
}
function trainerBattle(npc){
  owActive=false;
  const team = npc.team.map((k,i)=>makeCreature(k, (npc.teamLv&&npc.teamLv[i])||10));
  beginBattle({
    mode:"trainer", foeTeam:team, canCatch:false, canFlee:false, foeName:npc.name,
    intro:[`<b>${npc.name}</b> sends out <b>${team[0].name}</b>!`],
    onEnd:(res)=>{
      if(res==="lost"){ blackout(); return; }
      npc.defeated=true; npc.solid=false; npc.passable=true; npc.dir="left";
      if(npc.onDefeat) npc.onDefeat(npc);
      state.ow.pendingSay = npc.after;
      returnToOverworld();
    },
  });
}
function blackout(){
  state.team.forEach(healFull); state.caught.forEach(healFull);
  enterOverworld("village", 8, 12, "down");
  state.ow.pendingSay = ["Your companions could not go on…",
    "You wake in Pimpleia, tended and whole once more."];
  if(state.ow.pendingSay){ const p=state.ow.pendingSay; state.ow.pendingSay=null; owSay(p); }
}

/* ---- overworld rendering ---- */
function hash2(x,y){ let h=(x*73856093)^(y*19349663); return ((h>>>0)%1000)/1000; }
function owRender(ts){
  const o=state.ow, map=o.map, ctx=owctx;
  ctx.clearRect(0,0,OWW,OWH);
  let camX = clamp(o.px+TILE/2-OWW/2, 0, Math.max(0,map.w*TILE-OWW));
  let camY = clamp(o.py+TILE/2-OWH/2, 0, Math.max(0,map.h*TILE-OWH));
  const x0=Math.floor(camX/TILE), y0=Math.floor(camY/TILE);
  for(let ry=-1; ry<=OWH/TILE+1; ry++) for(let rx=-1; rx<=OWW/TILE+1; rx++){
    const tx=x0+rx, ty=y0+ry, sx=tx*TILE-camX, sy=ty*TILE-camY;
    drawTile(ctx, tileAt(map,tx,ty), sx, sy, tx, ty, ts);
  }
  map.npcs.forEach(n=>{ if(n.gone) return;
    const sx=n.x*TILE-camX, sy=n.y*TILE-camY;
    if(sx<-TILE||sy<-TILE||sx>OWW||sy>OWH) return;
    drawNpc(ctx, n, sx, sy);
  });
  drawOrpheus(ctx, o.px-camX, o.py-camY, o.dir, o.moving?ts:0);
}
function drawTile(ctx, ch, x, y, tx, ty, ts){
  // base ground
  if(ch==="~"){ ctx.fillStyle="#1c5a56"; }
  else if(ch==="#"||ch==="D"){ ctx.fillStyle="#33261c"; }
  else if(ch==="m"||ch==="C"||ch==="Y"){ ctx.fillStyle="#e3d3ae"; }
  else ctx.fillStyle=TERRA;
  ctx.fillRect(x,y,TILE,TILE);
  const r=hash2(tx,ty);
  if(ch==="."||ch==="f"||ch==="S"||ch==="O"||ch==="R"||ch==="\""||ch===","){
    // speckle on terracotta ground
    ctx.fillStyle="rgba(30,20,16,.10)";
    ctx.fillRect(x+3+r*20, y+5+((r*100)%18), 3,3);
    ctx.fillRect(x+18-r*10, y+22-((r*70)%16), 2,2);
  }
  switch(ch){
    case ",": // path
      ctx.fillStyle="#d8b57a"; ctx.fillRect(x+2,y,TILE-4,TILE);
      ctx.fillStyle="rgba(30,20,16,.10)"; ctx.fillRect(x+6+r*14,y+8,3,3); ctx.fillRect(x+20-r*10,y+20,2,2);
      break;
    case "\"": { // tall grass
      ctx.strokeStyle=INK; ctx.lineWidth=2; ctx.lineCap="round";
      const sway=Math.sin(ts/380 + tx*0.7 + ty*0.3)*2.2;
      for(let i=0;i<5;i++){ const bx=x+5+i*6, by=y+TILE-4;
        ctx.beginPath(); ctx.moveTo(bx,by); ctx.quadraticCurveTo(bx+sway*0.5,by-9,bx+sway,by-16); ctx.stroke(); }
      ctx.strokeStyle="rgba(46,125,120,.55)";
      for(let i=0;i<4;i++){ const bx=x+8+i*6, by=y+TILE-4;
        ctx.beginPath(); ctx.moveTo(bx,by); ctx.lineTo(bx+sway*0.7,by-11); ctx.stroke(); }
      break; }
    case "T": { // tree
      ctx.fillStyle="#2a1c14"; ctx.fillRect(x+TILE/2-3,y+TILE-12,6,10); // trunk
      ctx.fillStyle=INK; ctx.beginPath(); ctx.arc(x+TILE/2,y+13,12,0,7); ctx.fill();
      ctx.beginPath(); ctx.arc(x+TILE/2-8,y+18,8,0,7); ctx.fill();
      ctx.beginPath(); ctx.arc(x+TILE/2+8,y+18,8,0,7); ctx.fill();
      ctx.strokeStyle="rgba(242,227,200,.18)"; ctx.lineWidth=2;
      ctx.beginPath(); ctx.arc(x+TILE/2-3,y+10,6,3.6,5.4); ctx.stroke();
      break; }
    case "~": { // water
      ctx.strokeStyle="rgba(242,227,200,.35)"; ctx.lineWidth=2;
      const p=(ts/500)%1;
      for(let i=0;i<2;i++){ const wy=y+8+i*13+Math.sin(ts/400+tx+i)*1.5;
        ctx.beginPath(); ctx.moveTo(x+4,wy); ctx.quadraticCurveTo(x+TILE/2,wy-4,x+TILE-4,wy); ctx.stroke(); }
      break; }
    case "#": { // wall
      ctx.strokeStyle="rgba(242,227,200,.16)"; ctx.lineWidth=1;
      ctx.strokeRect(x+0.5,y+0.5,TILE-1,TILE-1);
      ctx.beginPath(); ctx.moveTo(x,y+TILE/2); ctx.lineTo(x+TILE,y+TILE/2);
      ctx.moveTo(x+TILE/2,y); ctx.lineTo(x+TILE/2,y+TILE/2); ctx.stroke();
      ctx.fillStyle="rgba(224,168,51,.10)"; ctx.fillRect(x,y,TILE,4);
      break; }
    case "D": { // door
      ctx.fillStyle=GOLD; ctx.fillRect(x+7,y+6,TILE-14,TILE-6);
      ctx.fillStyle="#8a6410"; ctx.fillRect(x+TILE/2-1,y+8,2,TILE-10);
      ctx.beginPath(); ctx.fillStyle=INK; ctx.arc(x+TILE-11,y+18,1.6,0,7); ctx.fill();
      break; }
    case "f": { // flowers
      for(const [ox,oy,c] of [[9,14,GOLD],[20,10,"#d98b9c"],[15,22,"#f2e3c8"]]){
        ctx.fillStyle=c; ctx.beginPath(); ctx.arc(x+ox,y+oy,3,0,7); ctx.fill();
        ctx.fillStyle=INK; ctx.beginPath(); ctx.arc(x+ox,y+oy,1,0,7); ctx.fill();
      }
      break; }
    case "R": { // rock
      ctx.fillStyle="#4a3b30"; ctx.beginPath();
      ctx.moveTo(x+6,y+24); ctx.lineTo(x+10,y+12); ctx.lineTo(x+20,y+10); ctx.lineTo(x+26,y+20); ctx.lineTo(x+22,y+26); ctx.closePath(); ctx.fill();
      ctx.strokeStyle="rgba(242,227,200,.2)"; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(x+11,y+13); ctx.lineTo(x+16,y+19); ctx.stroke();
      break; }
    case "S": { // sign
      ctx.fillStyle="#5a3a22"; ctx.fillRect(x+TILE/2-2,y+14,4,14);
      ctx.fillStyle="#caa46a"; ctx.fillRect(x+6,y+7,TILE-12,12);
      ctx.strokeStyle=INK; ctx.lineWidth=1.5; ctx.strokeRect(x+6,y+7,TILE-12,12);
      ctx.strokeStyle="rgba(30,20,16,.5)"; ctx.beginPath();
      ctx.moveTo(x+9,y+11); ctx.lineTo(x+TILE-9,y+11); ctx.moveTo(x+9,y+15); ctx.lineTo(x+TILE-11,y+15); ctx.stroke();
      break; }
    case "O": { // well / omphalos
      ctx.fillStyle="#c9b79a"; ctx.beginPath(); ctx.ellipse(x+TILE/2,y+18,11,9,0,0,7); ctx.fill();
      ctx.fillStyle="#2a1c14"; ctx.beginPath(); ctx.ellipse(x+TILE/2,y+17,6,5,0,0,7); ctx.fill();
      ctx.strokeStyle=INK; ctx.lineWidth=1.5; ctx.beginPath(); ctx.ellipse(x+TILE/2,y+18,11,9,0,0,7); ctx.stroke();
      // net incision
      ctx.strokeStyle="rgba(30,20,16,.4)";
      ctx.beginPath(); ctx.moveTo(x+TILE/2-9,y+18); ctx.lineTo(x+TILE/2+9,y+18); ctx.stroke();
      break; }
    case "m": { // marble plaza — running-bond joints
      ctx.strokeStyle="rgba(30,20,16,.12)"; ctx.lineWidth=1;
      ctx.beginPath(); ctx.moveTo(x,y+TILE/2+.5); ctx.lineTo(x+TILE,y+TILE/2+.5); ctx.stroke();
      const vx = (tx+ty)%2 ? 8 : 24;
      ctx.beginPath(); ctx.moveTo(x+vx+.5,y); ctx.lineTo(x+vx+.5,y+TILE/2); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x+(TILE-vx)+.5,y+TILE/2); ctx.lineTo(x+(TILE-vx)+.5,y+TILE); ctx.stroke();
      break; }
    case "C": { // temple column
      ctx.fillStyle="#f2e3c8"; ctx.fillRect(x+10,y+7,12,20);
      ctx.strokeStyle="rgba(30,20,16,.18)"; ctx.lineWidth=1;
      for(const fx of [13,16,19]){ ctx.beginPath(); ctx.moveTo(x+fx,y+8); ctx.lineTo(x+fx,y+26); ctx.stroke(); }
      ctx.fillStyle="#d8c49a";
      ctx.fillRect(x+7,y+3,18,5);   // capital
      ctx.fillRect(x+8,y+26,16,4);  // base
      ctx.strokeStyle=INK; ctx.lineWidth=1; ctx.strokeRect(x+7.5,y+3.5,17,4);
      break; }
    case "Y": { // Python, slain on the marble
      ctx.fillStyle=INK;
      ctx.beginPath(); ctx.ellipse(x+16,y+20,13,8,0,0,7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x+10,y+14,7,5,0.4,0,7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x+23,y+13,6,4,-0.4,0,7); ctx.fill();
      // belly incision
      ctx.strokeStyle="rgba(242,227,200,.5)"; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.moveTo(x+6,y+22); ctx.quadraticCurveTo(x+16,y+26,x+26,y+21); ctx.stroke();
      // head lolling, X eye
      ctx.fillStyle=INK; ctx.beginPath(); ctx.ellipse(x+6,y+24,5,3.5,0.3,0,7); ctx.fill();
      ctx.strokeStyle=SLIP; ctx.lineWidth=1.2;
      ctx.beginPath(); ctx.moveTo(x+4,y+22.5); ctx.lineTo(x+7,y+25.5); ctx.moveTo(x+7,y+22.5); ctx.lineTo(x+4,y+25.5); ctx.stroke();
      // the fatal arrow
      ctx.strokeStyle=GOLD; ctx.lineWidth=2;
      ctx.beginPath(); ctx.moveTo(x+18,y+15); ctx.lineTo(x+24,y+4); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(x+24,y+4); ctx.lineTo(x+21,y+6); ctx.moveTo(x+24,y+4); ctx.lineTo(x+25,y+8); ctx.stroke();
      break; }
    case "v": { // olive tree — Athena's gift
      ctx.fillStyle="#2a1c14";
      ctx.beginPath(); ctx.moveTo(x+TILE/2-3,y+TILE-4); ctx.quadraticCurveTo(x+TILE/2-1,y+20,x+TILE/2+3,y+16); ctx.stroke();
      ctx.fillRect(x+TILE/2-2,y+18,4,10);
      ctx.fillStyle="#7d8f5c";
      ctx.beginPath(); ctx.ellipse(x+TILE/2,y+12,10,8,0,0,7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x+TILE/2-8,y+16,5,4,0.4,0,7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x+TILE/2+8,y+16,5,4,-0.4,0,7); ctx.fill();
      ctx.strokeStyle="rgba(242,227,200,.4)"; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.ellipse(x+TILE/2,y+12,10,8,0,0,7); ctx.stroke();
      ctx.fillStyle=INK;
      for(const [ox,oy] of [[-4,10],[4,9],[0,15],[7,14]]){ ctx.beginPath(); ctx.arc(x+TILE/2+ox,y+oy,1.4,0,7); ctx.fill(); }
      break; }
    case "L": { // the laurel — Daphne transformed
      ctx.fillStyle="#2a1c14"; ctx.fillRect(x+TILE/2-2,y+TILE-10,4,8);
      ctx.fillStyle="#8aa86b";
      ctx.beginPath(); ctx.ellipse(x+TILE/2,y+12,9,11,0,0,7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x+TILE/2-7,y+17,5,7,0.5,0,7); ctx.fill();
      ctx.beginPath(); ctx.ellipse(x+TILE/2+7,y+17,5,7,-0.5,0,7); ctx.fill();
      ctx.strokeStyle="rgba(224,168,51,.55)"; ctx.lineWidth=1.5;
      ctx.beginPath(); ctx.ellipse(x+TILE/2,y+12,9,11,0,0,7); ctx.stroke();
      ctx.fillStyle=GOLD;
      for(const [ox,oy] of [[-4,8],[5,10],[0,16],[-6,15],[6,18]]){ ctx.beginPath(); ctx.arc(x+TILE/2+ox,y+oy,1.3,0,7); ctx.fill(); }
      break; }
  }
}
const NPC_LOOK={
  elder:{robe:"#5c4a7a", trim:GOLD, tall:true, hood:false, beard:true},
  child:{robe:"#2e7d78", trim:"#f2e3c8", tall:false, hood:false},
  kass:{robe:"#241a14", trim:RED, tall:false, hood:true},
  villager:{robe:"#7a4a2a", trim:"#f2e3c8", tall:false},
  apollo:{robe:"#f2e3c8", trim:GOLD, tall:true, halo:true},
  eros:{robe:"#d98b9c", trim:"#f2e3c8", small:true, wings:true},
  daphne:{robe:"#8aa86b", trim:"#f2e3c8"},
  pythia:{robe:"#b03a2e", trim:GOLD, tall:true},
  acolyte:{robe:"#2e7d78", trim:GOLD},
  athena:{robe:"#c9b458", trim:"#f2e3c8", tall:true, halo:true},
  poseidon:{robe:"#2e7d78", trim:GOLD, tall:true, halo:true, beard:true},
  cecrops:{robe:"#5c4a7a", trim:"#8aa86b", tall:true, beard:true},
  rhapsode:{robe:"#7a4a2a", trim:GOLD},
  priestessA:{robe:"#d98b9c", trim:GOLD, tall:true},
  philosopher:{robe:"#f2e3c8", trim:"#5c4a7a", beard:true},
  hoplite:{robe:"#b03a2e", trim:"#e0a833"},
  sailor:{robe:"#2e7d78", trim:"#f2e3c8"},
  bellerophon:{robe:"#7fa8c9", trim:GOLD},
  hermes:{robe:"#f2e3c8", trim:"#d8cba8", tall:true, halo:true, wings:true},
};
function drawOrpheus(ctx,x,y,dir,ts){
  const cx=x+TILE/2, base=y+TILE-4;
  ctx.fillStyle="rgba(0,0,0,.28)"; ctx.beginPath(); ctx.ellipse(cx,base+1,9,3.5,0,0,7); ctx.fill();
  const bob = ts? Math.floor(ts/110)%2 : 0;
  ctx.strokeStyle=INK; ctx.lineWidth=3; ctx.lineCap="round";
  ctx.beginPath(); ctx.moveTo(cx-4,base-7); ctx.lineTo(cx-4,base-(bob?0:2));
  ctx.moveTo(cx+4,base-7); ctx.lineTo(cx+4,base-(bob?2:0)); ctx.stroke();
  ctx.fillStyle=INK; ctx.beginPath();
  ctx.moveTo(cx-7,base-7); ctx.lineTo(cx-5,base-19); ctx.lineTo(cx+5,base-19); ctx.lineTo(cx+7,base-7); ctx.closePath(); ctx.fill();
  // the lyre, slung at his side
  const lx = cx + (dir==="left"?5:dir==="right"?-5:0);
  ctx.strokeStyle=GOLD; ctx.lineWidth=1.6;
  ctx.beginPath(); ctx.moveTo(lx-3,base-12); ctx.quadraticCurveTo(lx-4.5,base-17,lx-2.5,base-18.5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(lx+3,base-12); ctx.quadraticCurveTo(lx+4.5,base-17,lx+2.5,base-18.5); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(lx-2.5,base-18.5); ctx.lineTo(lx+2.5,base-18.5); ctx.stroke();
  ctx.fillStyle=GOLD; ctx.beginPath(); ctx.ellipse(lx,base-12,3.4,2.4,0,0,7); ctx.fill();
  ctx.strokeStyle="rgba(242,227,200,.85)"; ctx.lineWidth=0.8;
  for(const off of [-1.5,0,1.5]){ ctx.beginPath(); ctx.moveTo(lx+off,base-18); ctx.lineTo(lx+off*0.6,base-13); ctx.stroke(); }
  // head
  ctx.fillStyle=INK; ctx.beginPath(); ctx.arc(cx,base-24,6,0,7); ctx.fill();
  ctx.fillStyle=SLIP;
  if(dir==="down"){ ctx.fillRect(cx-3,base-25,2,2); ctx.fillRect(cx+1,base-25,2,2); }
  else if(dir==="left"){ ctx.fillRect(cx-4,base-25,2,2); }
  else if(dir==="right"){ ctx.fillRect(cx+2,base-25,2,2); }
  ctx.fillStyle=GOLD; ctx.fillRect(cx-5,base-28,10,2); // fillet band
}
function drawNpc(ctx,n,x,y){
  const L=NPC_LOOK[n.sprite]||NPC_LOOK.villager;
  const cx=x+TILE/2, base=y+TILE-4, top=L.tall?base-22:(L.small?base-16:base-19);
  ctx.fillStyle="rgba(0,0,0,.28)"; ctx.beginPath(); ctx.ellipse(cx,base+1,9,3.5,0,0,7); ctx.fill();
  // wings (Eros)
  if(L.wings){ ctx.fillStyle=SLIP;
    ctx.beginPath(); ctx.moveTo(cx-6,base-13); ctx.quadraticCurveTo(cx-14,base-18,cx-11,base-9); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.moveTo(cx+6,base-13); ctx.quadraticCurveTo(cx+14,base-18,cx+11,base-9); ctx.closePath(); ctx.fill(); }
  // robe
  ctx.fillStyle=L.robe; ctx.beginPath();
  ctx.moveTo(cx-7,base-6); ctx.lineTo(cx-5,top); ctx.lineTo(cx+5,top); ctx.lineTo(cx+7,base-6); ctx.closePath(); ctx.fill();
  // trim sash
  ctx.strokeStyle=L.trim; ctx.lineWidth=2;
  ctx.beginPath(); ctx.moveTo(cx-6,base-12); ctx.lineTo(cx+6,base-12); ctx.stroke();
  // head
  const hy = top-6;
  ctx.fillStyle="#2a1c14"; ctx.beginPath(); ctx.arc(cx,hy,6,0,7); ctx.fill();
  // radiance (Apollo)
  if(L.halo){ ctx.strokeStyle="rgba(224,168,51,.8)"; ctx.lineWidth=1.5;
    ctx.beginPath(); ctx.arc(cx,hy,9,0,7); ctx.stroke();
    for(let a=0;a<8;a++){ const th=a*Math.PI/4;
      ctx.beginPath(); ctx.moveTo(cx+Math.cos(th)*9,hy+Math.sin(th)*9);
      ctx.lineTo(cx+Math.cos(th)*12,hy+Math.sin(th)*12); ctx.stroke(); } }
  if(L.hood){
    ctx.fillStyle=L.robe; ctx.beginPath();
    ctx.moveTo(cx-8,hy+3); ctx.lineTo(cx,hy-12); ctx.lineTo(cx+8,hy+3); ctx.closePath(); ctx.fill();
    ctx.strokeStyle=L.trim; ctx.lineWidth=1.5; ctx.beginPath();
    ctx.moveTo(cx-8,hy+3); ctx.lineTo(cx,hy-12); ctx.lineTo(cx+8,hy+3); ctx.stroke();
  }
  if(L.beard){ ctx.fillStyle=SLIP; ctx.beginPath();
    ctx.moveTo(cx-4,hy+2); ctx.lineTo(cx,hy+9); ctx.lineTo(cx+4,hy+2); ctx.closePath(); ctx.fill(); }
  // eyes toward facing (skip if hooded & facing away)
  ctx.fillStyle=SLIP;
  const d=n.dir||"down";
  if(d==="down"){ ctx.fillRect(cx-3,hy-1,2,2); ctx.fillRect(cx+1,hy-1,2,2); }
  else if(d==="left"){ ctx.fillRect(cx-4,hy-1,2,2); }
  else if(d==="right"){ ctx.fillRect(cx+2,hy-1,2,2); }
}

/* ---- party menu ---- */
$("party-btn").onclick = ()=>{ owActive=false; renderParty(); show("party-screen"); };
$("party-close").onclick = ()=>{ show("overworld-screen"); startOwLoop(); };
function renderParty(){
  const list=$("party-list"); list.innerHTML="";
  const all = state.team.concat(state.caught);
  $("party-sub").textContent = `${state.team.length} at your side${state.caught.length?` · ${state.caught.length} in the Oracle's keeping`:""}`;
  all.forEach((c,idx)=>{
    const inParty = idx<state.team.length;
    const pct = Math.round(100*c.hp/c.maxhp);
    const card=document.createElement("div");
    card.className="pcard"+(c.hp<=0?" fainted":"");
    card.innerHTML=`<canvas width="56" height="52"></canvas>
      <div class="pinfo">
        <div class="prow"><span class="pnm">${c.name}</span><span class="plv">Lv ${c.level}</span></div>
        <div class="pdom" style="color:${DOMAINS[c.dom].color}">${c.dom} · of ${DOMAINS[c.dom].god}${inParty?"":" · kept"}</div>
        <div class="hpbar"><div class="hpfill ${pct<=25?"low":""}" style="width:${pct}%"></div></div>
      </div>`;
    const ictx=card.querySelector("canvas").getContext("2d");
    ictx.save(); ictx.translate(2,5); ictx.scale(0.46,0.46);
    artDraw(ictx, c.key, c.sprite, DOMAINS[c.dom].color); ictx.restore();
    list.appendChild(card);
  });
}

/* ---- input wiring ---- */
addEventListener("keydown", e=>{
  const dir = ({ArrowUp:"up",ArrowDown:"down",ArrowLeft:"left",ArrowRight:"right",
    w:"up",s:"down",a:"left",d:"right",W:"up",S:"down",A:"left",D:"right"})[e.key];
  if(!owActive) return;
  if(dir || e.key===" " || e.key==="Enter") e.preventDefault();
  if(dir) keys[dir]=true;
  if(e.key===" "||e.key==="Enter"){ owBusy ? advanceDialogue() : interact(); }
});
addEventListener("keyup", e=>{
  const dir = ({ArrowUp:"up",ArrowDown:"down",ArrowLeft:"left",ArrowRight:"right",
    w:"up",s:"down",a:"left",d:"right",W:"up",S:"down",A:"left",D:"right"})[e.key];
  if(dir) keys[dir]=false;
});
document.querySelectorAll("#dpad .dbtn").forEach(b=>{
  const dir=b.dataset.dir;
  const set=v=>{ if(dir==="act"){ if(v){ owBusy?advanceDialogue():interact(); } } else keys[dir]=v; };
  b.addEventListener("pointerdown",e=>{e.preventDefault(); set(true);});
  b.addEventListener("pointerup",  e=>{e.preventDefault(); set(false);});
  b.addEventListener("pointerleave",()=>set(false));
  b.addEventListener("pointercancel",()=>set(false));
});
