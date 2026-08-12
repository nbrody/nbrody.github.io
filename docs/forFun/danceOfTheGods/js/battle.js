"use strict";
/* Dance of the Gods — battle: rendering, turn flow, capture/flee (wild & trainer) */

/* ---- battle rendering ---- */
const bcv = $("battle-canvas"), bctx = bcv.getContext("2d");
let frame = 0;
function ally(){ return state.team[state.allyIdx]; }
function foe(){ return state.foeTeam[state.foeIdx]; }

function renderStage(){
  frame++;
  bctx.clearRect(0,0,520,300);
  // vase band bg
  bctx.fillStyle = "#c96f3b"; bctx.fillRect(0,0,520,300);
  const g = bctx.createRadialGradient(260,150,60,260,150,320);
  g.addColorStop(0,"rgba(255,255,255,0.06)"); g.addColorStop(1,"rgba(0,0,0,0.12)");
  bctx.fillStyle=g; bctx.fillRect(0,0,520,300);
  // ground swooshes
  bctx.strokeStyle="rgba(30,20,16,.55)"; bctx.lineWidth=3;
  bctx.beginPath(); bctx.moveTo(40,258); bctx.quadraticCurveTo(150,246,240,258); bctx.stroke();
  bctx.beginPath(); bctx.moveTo(290,140); bctx.quadraticCurveTo(390,130,478,140); bctx.stroke();

  // sprites are authored facing LEFT: flip the ally so the two face each other.
  // (a flipped sprite extends left of its anchor, so the ally anchors at its right edge)
  const bobA = Math.sin(frame/22)*3, bobF = Math.sin(frame/22+2)*3;
  drawSide("ally", 216, 150+bobA, 1.15, true);
  drawSide("foe", 251, 46+bobF, 0.95, false);
  requestAnimationFrame(renderStage);
}
function drawSide(side, x, y, sc, flip){
  const c = side==="ally"?ally():foe();
  if(!c) return;
  let dx=0, alpha=1;
  const a = state.anim[side];
  if(a){
    const t = (Date.now()-a.start)/a.dur;
    if(t>=1){ state.anim[side]=null; }
    else if(a.kind==="lunge"){ dx = Math.sin(t*Math.PI)*(side==="ally"?34:-34); }
    else if(a.kind==="hit"){ dx = Math.sin(t*22)*6; alpha = 0.55+0.45*Math.abs(Math.cos(t*10)); }
    else if(a.kind==="faint"){ alpha = 1-t; y += t*30; }
  }
  if(c.hp<=0 && !a) alpha = 0;
  drawCreature(bctx, c, x+dx, y, sc, flip, alpha);
}
function animate(side, kind){
  state.anim[side] = {kind, start:Date.now(), dur: kind==="faint"?700:(kind==="hit"?420:380)};
  if(kind==="hit") $("battle-stage").classList.add("shake"),
    setTimeout(()=>$("battle-stage").classList.remove("shake"),400);
}

/* ---- HP cards ---- */
function hpCard(el, c){
  const pct = Math.round(100*c.hp/c.maxhp);
  el.innerHTML = `
    <div class="row"><span class="nm">${c.name}</span><span class="lv">Lv ${c.level}</span></div>
    <div class="hpbar"><div class="hpfill ${pct<=25?"low":""}" style="width:${pct}%"></div></div>
    <div class="hptext"><span>${c.hp} / ${c.maxhp}</span>
      <span class="status-tag">${c.status? c.status : ""}</span></div>`;
}
function refreshHp(){ hpCard($("hp-ally"), ally()); hpCard($("hp-foe"), foe()); }

/* ---- dialogue queue ---- */
let typeTimer=null;
function say(html){
  return new Promise(res=>{
    const d = $("dialogue");
    clearInterval(typeTimer);
    // typewriter over plain text; inject html at end for bold tags
    d.innerHTML = "";
    const tmp = document.createElement("div"); tmp.innerHTML = html;
    const plain = tmp.textContent;
    let i=0;
    typeTimer = setInterval(()=>{
      i+=2;
      if(i>=plain.length){ clearInterval(typeTimer); d.innerHTML = html; setTimeout(res, 420); }
      else d.textContent = plain.slice(0,i);
    }, 14);
  });
}

/* ---- battle flow (generic: wild & trainer) ---- */
const wait = ms => new Promise(r=>setTimeout(r,ms));
function hideBattleUIs(){ ["action-ui","move-ui","switch-ui","continue-btn"].forEach(id=>$(id).classList.add("hidden")); }

/* opts: {mode, foeTeam, intro:[lines], canCatch, canFlee, foeName, onEnd:(result)=>{}} */
function beginBattle(opts){
  state.battle = Object.assign({mode:"trainer",canCatch:false,canFlee:false,intro:[],foeName:"The foe",onEnd:null}, opts);
  state.foeTeam = opts.foeTeam;
  state.allyIdx = Math.max(0, state.team.findIndex(c=>c.hp>0));
  state.foeIdx = 0;
  state.busy = false; state.anim.ally=null; state.anim.foe=null;
  owActive = false;
  show("battle-screen");
  startBattle();
}

async function startBattle(){
  refreshHp();
  hideBattleUIs();
  for(const line of state.battle.intro) await say(line);
  await say(`Go, <b>${ally().name}</b>!`);
  promptAction();
}

function promptAction(){
  hideBattleUIs();
  $("dialogue").innerHTML = `What will <b>${ally().name}</b> do?`;
  $("action-ui").classList.remove("hidden");
  $("actiongrid").querySelector('[data-act="catch"]').disabled = !state.battle.canCatch;
  $("actiongrid").querySelector('[data-act="flee"]').disabled  = !state.battle.canFlee;
}
$("actiongrid").addEventListener("click", e=>{
  const b = e.target.closest(".actbtn"); if(!b || b.disabled || state.busy) return;
  const act = b.dataset.act;
  if(act==="fight") promptMove();
  else if(act==="switch") promptSwitch(false);
  else if(act==="catch") tryCatch();
  else if(act==="flee") tryFlee();
});
$("move-back").onclick = ()=>{ if(!state.busy) promptAction(); };

function promptMove(){
  const mg = $("movegrid");
  mg.innerHTML = "";
  for(const mk of ally().moves){
    const m = MOVES[mk];
    const btn = document.createElement("button");
    btn.className = "movebtn";
    const info = m.cat==="status" ? (m.desc||"status") : `pow ${m.pow} · ${m.cat==="phys"?"might":"grace"}`;
    btn.innerHTML = `<div class="mn">${m.name}</div>
      <div class="mi"><span class="dcol" style="color:${DOMAINS[m.dom].color}">${m.dom}</span><span>${info}</span></div>`;
    btn.onclick = ()=> playerMove(mk);
    mg.appendChild(btn);
  }
  hideBattleUIs();
  $("move-ui").classList.remove("hidden");
  $("dialogue").innerHTML = `<b>${ally().name}</b> — choose a rite.`;
}

async function playerMove(mk){
  if(state.busy) return;
  state.busy = true;
  hideBattleUIs();
  const ev = resolveTurn(ally(), foe(), mk);
  await playEvents(ev);
  await afterTurn();
}

async function playEvents(ev){
  for(const e of ev){
    if(e.t==="text") await say(e.s);
    else if(e.t==="hp"||e.t==="status") refreshHp();
    else if(e.t==="anim"){ animate(e.side, e.kind); await wait(e.kind==="faint"?700:430); }
  }
}

/* one foe-only turn (used after a failed catch / failed flee) */
async function foeActs(){
  const ev = [];
  if(foe().hp>0 && ally().hp>0){
    actOnce(foe(), ally(), chooseAiMove(foe(), ally()), "foe", ev);
  }
  endOfTurn(ally(), ev); endOfTurn(foe(), ev);
  await playEvents(ev);
}

async function handleFoeFaint(){
  const c = ally();
  if(c.hp>0){
    const gain = Math.round(foe().level*6 + 10);
    const events = gainXp(c, gain);
    await say(`<b>${c.name}</b> earns ${gain} favor.`);
    for(const ev of events){
      await say(`<b>${c.name}</b> ascends to <b>Lv ${ev.lv}</b>!`);
      for(const l of ev.learned){
        if(l.forgot) await say(`<b>${c.name}</b> sets aside <b>${MOVES[l.forgot].name}</b>…`);
        await say(`<b>${c.name}</b> learns <b>${MOVES[l.move].name}</b>!`);
      }
    }
  }
}

async function afterTurn(){
  refreshHp();
  if(foe().hp<=0){
    await handleFoeFaint();
    if(state.foeTeam.every(c=>c.hp<=0)){ state.busy=false; return endBattle("won"); }
    state.foeIdx = state.foeTeam.findIndex(c=>c.hp>0);
    await say(`<b>${state.battle.foeName}</b> sends out <b>${foe().name}</b>!`);
    refreshHp();
  }
  if(ally().hp<=0){
    const alive = state.team.filter(c=>c.hp>0);
    if(alive.length===0){ state.busy=false; return endBattle("lost"); }
    return promptSwitch(true);
  }
  state.busy=false;
  promptAction();
}

function promptSwitch(forced){
  const row = $("benchrow");
  row.innerHTML="";
  hideBattleUIs();
  $("dialogue").innerHTML = forced ? "Choose your next companion!" : "Send out which beast?";
  let any=false;
  state.team.forEach((c,i)=>{
    if(c.hp<=0 || i===state.allyIdx) return;
    any=true;
    const b=document.createElement("button");
    b.className="movebtn";
    b.innerHTML=`<div class="mn">${c.name}</div><div class="mi"><span class="dcol" style="color:${DOMAINS[c.dom].color}">${c.dom}</span><span>Lv ${c.level} · ${c.hp}/${c.maxhp}</span></div>`;
    b.onclick=async ()=>{
      hideBattleUIs();
      state.allyIdx=i;
      refreshHp();
      await say(`Go, <b>${c.name}</b>!`);
      state.busy=false;
      promptAction();
    };
    row.appendChild(b);
  });
  if(!forced){
    const back=document.createElement("button");
    back.className="movebtn"; back.style.textAlign="center";
    back.innerHTML=`<div class="mn">◂ Back</div>`;
    back.onclick=()=>{ if(!state.busy) promptAction(); };
    row.appendChild(back);
  } else if(!any){
    // shouldn't happen, but guard
    state.busy=false; return endBattle("lost");
  }
  $("switch-ui").classList.remove("hidden");
}

async function tryCatch(){
  if(state.busy) return;
  state.busy=true; hideBattleUIs();
  const f = foe();
  await say(`You pluck a lulling strain on the lyre — and cast a <b>Clay Amphora</b> at the swaying <b>${f.name}</b>!`);
  animate("foe","hit"); await wait(320);
  const hpFrac = f.hp/f.maxhp;
  let rate = 0.35 + 0.5*(1-hpFrac);
  if(f.status) rate += 0.15;
  rate = Math.min(0.92, Math.max(0.08, rate));
  const shakes = rng()<rate ? 3 : (rng()<0.5?1:2);
  for(let i=0;i<shakes;i++){ await say("…the clay trembles…"); }
  if(rng()<rate){
    await say(`The seal holds — <b>${f.name}</b> is bound to your side!`);
    captureFoe(f);
    const where = state.team.length<=PARTY_MAX ? "joins your party" : "is sent to the Oracle's keeping";
    await say(`<b>${f.name}</b> ${where}.`);
    state.busy=false;
    return endBattle("caught");
  }
  await say(`With a crack, <b>${f.name}</b> bursts free!`);
  await foeActs();
  await afterTurn();
}

function captureFoe(f){
  f.hp = f.maxhp; f.status=null; f.statusTurns=0;
  f.stages={atk:0,def:0,gra:0,aeg:0,spe:0};
  if(state.team.length<PARTY_MAX) state.team.push(f);
  else state.caught.push(f);
}

async function tryFlee(){
  if(state.busy) return;
  state.busy=true; hideBattleUIs();
  const faster = effStat(ally(),"spe")>=effStat(foe(),"spe");
  if(rng() < (faster?0.85:0.55)){
    await say("You slip back through the grove — got away safely!");
    state.busy=false;
    return endBattle("fled");
  }
  await say("You couldn't get away!");
  await foeActs();
  await afterTurn();
}

async function endBattle(result){
  hideBattleUIs();
  const cb = state.battle.onEnd;
  state.battle.onEnd = null;
  if(cb) return cb(result);
  returnToOverworld();
}
