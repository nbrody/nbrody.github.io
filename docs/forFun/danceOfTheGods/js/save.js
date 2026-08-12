"use strict";
/* Dance of the Gods — save/load + the playtest harness.
   A save stores party, flags, position and defeated trainers — never map
   grids. restoreWorld() replays every world mutation from the flags, so
   saves stay valid as maps evolve, and the playtest panel can fabricate
   a save for any state and load it through the same path. */

const SAVE_KEY = "dotg-save-1";
let saveEnabled = false;   // true for real runs; playtest runs opt in

function hasSave(){ try{ return !!localStorage.getItem(SAVE_KEY); }catch(e){ return false; } }
function clearSave(){ try{ localStorage.removeItem(SAVE_KEY); }catch(e){} }

function saveGame(){
  if(!saveEnabled || !state.ow.map) return;
  const trainers = {};
  for(const [mid,m] of Object.entries(MAPS))
    m.npcs.forEach(n=>{ if(n.kind==="trainer" && n.defeated) trainers[mid+":"+n.name]=true; });
  const sv = {
    v:1, at:Date.now(),
    team:state.team, caught:state.caught, flags:state.ow.flags,
    map:state.ow.map.id, tx:state.ow.tx, ty:state.ow.ty, dir:state.ow.dir,
    trainers,
  };
  try{ localStorage.setItem(SAVE_KEY, JSON.stringify(sv)); }catch(e){}
}

function loadGame(){
  let sv = null;
  try{ sv = JSON.parse(localStorage.getItem(SAVE_KEY)); }catch(e){ return false; }
  if(!sv || sv.v!==1 || !Array.isArray(sv.team)) return false;
  if(!MAPS[sv.map] || sv.team.some(c=>!SPECIES[c.key])) return false;
  saveEnabled = true;
  applySave(sv);
  return true;
}

/* Re-apply every runtime world mutation implied by a save. Idempotent. */
function restoreWorld(sv){
  const flags = sv.flags||{};
  // Hermes has given his gift once the team exists
  const hermes = MAPS.village.npcs.find(n=>n.name==="Hermes");
  if(hermes && (sv.team||[]).length>0) hermes.gone=true;
  // defeated trainers (Kass's onDefeat re-opens the Delphi gate)
  for(const id in (sv.trainers||{})){
    const [mid,name] = id.split(":");
    const npc = MAPS[mid] && MAPS[mid].npcs.find(n=>n.name===name);
    if(npc && npc.kind==="trainer" && !npc.defeated){
      npc.defeated=true; npc.solid=false; npc.passable=true; npc.dir="left";
      if(npc.onDefeat) npc.onDefeat(npc);
    }
  }
  // Myth I — Delphi
  const D=MAPS.delphi, dst=flags.delphi||0;
  const apollo=D.npcs.find(n=>n.name==="Apollo"), daphne=D.npcs.find(n=>n.name==="Daphne");
  if(dst>=1){ apollo.x=14; apollo.y=10; apollo.dir="right"; daphne.dir="up"; }
  if(dst>=2){ daphne.gone=true; D.grid[10][16]="L"; apollo.x=15; }
  if(dst>=3){ openSacredWay(); }
  // Myth II — Athens
  const A=MAPS.athens, ast=flags.athens||0;
  const athena=A.npcs.find(n=>n.name==="Athena"), poseidon=A.npcs.find(n=>n.name==="Poseidon");
  if(ast>=1){ A.grid[6][9]="~"; A.grid[6][10]="~"; poseidon.x=11; poseidon.y=6; poseidon.dir="left"; }
  if(ast>=2){ A.grid[6][14]="v"; athena.x=13; athena.y=6; athena.dir="right"; }
  if(ast>=3){ A.name="Athens — City of the Olive"; poseidon.dir="down"; openCoastRoad(); }
}

/* Load any save object into a freshly rebuilt world and enter it. */
function applySave(sv){
  resetWorld();
  state.team = sv.team;
  state.caught = sv.caught||[];
  state.ow.flags = sv.flags||{};
  restoreWorld(sv);
  state.busy=false; owBusy=false; dlgResolver=null;
  $("ow-dialogue").classList.add("hidden");
  enterOverworld(sv.map, sv.tx, sv.ty, sv.dir||"down");
}

/* ================= playtest harness (?dev) ================= */
const DEFAULT_SPAWN = {
  village:[8,12,"up"], route:[7,15,"up"], delphi:[9,14,"up"],
  sacredWay:[1,12,"up"], athens:[1,8,"right"],
  coastRoad:[7,1,"down"], corinth:[9,1,"down"],
};
const DEV_PRESETS = {
  fresh:        {map:"village",   delphi:0, athens:0, kass:false, all:false, lvl:8,  team:["peeplet","owlet","fawnling"]},
  kassRoad:     {map:"route",     delphi:0, athens:0, kass:false, all:false, lvl:9,  team:["calfin","cubvine","dovie"]},
  delphiMyth:   {map:"delphi",    delphi:0, athens:0, kass:true,  all:false, lvl:10, team:["pupnos","slithra","tortikin"]},
  delphiDone:   {map:"delphi",    delphi:3, athens:0, kass:true,  all:false, lvl:11, team:["pupnos","slithra","tortikin"]},
  athensContest:{map:"athens",    delphi:3, athens:0, kass:true,  all:false, lvl:12, team:["owlet","piglos","seedviper"]},
  corinth:      {map:"corinth",   delphi:3, athens:3, kass:true,  all:true,  lvl:14, team:["calfin","cindercrab","cubvine"]},
};

let devReady=false;
function initDevPanel(){
  if(devReady) return; devReady=true;
  const mapSel=$("dev-map");
  for(const [id,m] of Object.entries(buildWorld()))
    mapSel.add(new Option(m.name, id));
  for(const sel of ["dev-b1","dev-b2","dev-b3"]){
    const el=$(sel);
    if(sel!=="dev-b1") el.add(new Option("—", "none"));
    for(const [key,s] of Object.entries(SPECIES)) el.add(new Option(`${s.name} (${s.dom})`, key));
  }
  $("dev-b1").value="peeplet"; $("dev-b2").value="owlet"; $("dev-b3").value="fawnling";

  $("dev-preset").onchange = ()=>{
    const p = DEV_PRESETS[$("dev-preset").value];
    if(!p) return;
    $("dev-map").value=p.map; $("dev-delphi").value=p.delphi; $("dev-athens").value=p.athens;
    $("dev-kass").checked=p.kass; $("dev-trainers").checked=p.all; $("dev-level").value=p.lvl;
    $("dev-b1").value=p.team[0]; $("dev-b2").value=p.team[1]||"none"; $("dev-b3").value=p.team[2]||"none";
  };

  $("dev-begin").onclick = ()=>{
    const lvl = Math.max(1, Math.min(60, parseInt($("dev-level").value,10)||8));
    const keys = ["dev-b1","dev-b2","dev-b3"].map(id=>$(id).value).filter(k=>k && k!=="none");
    const flags = {};
    const d=+$("dev-delphi").value, a=+$("dev-athens").value;
    if(d){ flags.delphi=d; if(d>=3) flags.laurel=true; }
    if(a) flags.athens=a;
    const trainers = {};
    if($("dev-kass").checked) trainers["route:Kass"]=true;
    if($("dev-trainers").checked)
      for(const [mid,m] of Object.entries(MAPS))
        m.npcs.forEach(n=>{ if(n.kind==="trainer") trainers[mid+":"+n.name]=true; });
    const mapId=$("dev-map").value, sp=DEFAULT_SPAWN[mapId]||[2,2,"down"];
    saveEnabled = $("dev-persist").checked;
    applySave({v:1, team:keys.map(k=>makeCreature(k,lvl)), caught:[], flags, trainers,
               map:mapId, tx:sp[0], ty:sp[1], dir:sp[2]});
    if(!saveEnabled) $("ow-hint").textContent="Playtest session — progress is not being saved.";
  };
  $("dev-back").onclick = ()=> show("title-screen");
}
