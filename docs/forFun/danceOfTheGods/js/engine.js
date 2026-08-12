"use strict";
/* Dance of the Gods — engine: creature factory, stats/XP, battle resolution */

/* ---------------- creature factory ---------------- */
const LEVEL = 12;
function statsAt(base, lv){
  const [hp,atk,def,gra,aeg,spe] = base;
  const st = b => Math.floor(2*b*lv/100)+5;
  return {
    maxhp: Math.floor(2*hp*lv/100)+lv+10,
    atk:st(atk), def:st(def), gra:st(gra), aeg:st(aeg), spe:st(spe),
  };
}
/* The moves a species knows at a level: last four learnset entries ≤ level. */
function movesAt(key, level){
  return SPECIES[key].learn.filter(([lv])=>lv<=level).map(([,mk])=>mk).slice(-4);
}
function makeCreature(key, level=LEVEL){
  const s = SPECIES[key];
  const t = statsAt(s.base, level);
  return {
    key, name:s.name, dom:s.dom, sprite:s.sprite, level,
    maxhp:t.maxhp, hp:t.maxhp,
    stats:{atk:t.atk,def:t.def,gra:t.gra,aeg:t.aeg,spe:t.spe},
    stages:{atk:0,def:0,gra:0,aeg:0,spe:0},
    status:null, statusTurns:0,
    moves:movesAt(key, level),
    xp:0,
  };
}
function xpToNext(lv){ return 14 + lv*10; }
/* Award xp to one creature. Returns one event per level gained:
   {lv, learned:[{move, forgot|null}]} — a full moveset forgets its oldest move. */
function gainXp(c, amount){
  const events = [];
  c.xp += amount;
  while(c.level < 60 && c.xp >= xpToNext(c.level)){
    c.xp -= xpToNext(c.level);
    c.level++;
    const frac = c.hp / c.maxhp;
    const t = statsAt(SPECIES[c.key].base, c.level);
    c.maxhp = t.maxhp;
    c.stats = {atk:t.atk,def:t.def,gra:t.gra,aeg:t.aeg,spe:t.spe};
    c.hp = Math.max(1, Math.round(t.maxhp*frac));
    const ev = {lv:c.level, learned:[]};
    for(const [lv,mk] of SPECIES[c.key].learn){
      if(lv===c.level && !c.moves.includes(mk)){
        const forgot = c.moves.length>=4 ? c.moves.shift() : null;
        c.moves.push(mk);
        ev.learned.push({move:mk, forgot});
      }
    }
    events.push(ev);
  }
  return events;
}
function effStat(c, stat){
  const mult = 1 + 0.3*c.stages[stat];
  let v = c.stats[stat]*Math.max(0.4, mult);
  if (stat==="spe" && c.status==="chill") v *= 0.5;
  if (stat==="atk" && c.status==="burn")  v *= 0.7;
  return v;
}

/* ---------------- battle engine (pure-ish core) ---------------- */
function rng(){ return Math.random(); }

function chooseAiMove(self, foe){
  // v1 AI: highest expected damage; uses a status move 25% of the time if healthy
  let best=null, bestDmg=-1;
  for(const mk of self.moves){
    const m = MOVES[mk];
    if(m.cat==="status") continue;
    const A = m.cat==="phys"?effStat(self,"atk"):effStat(self,"gra");
    const D = m.cat==="phys"?effStat(foe,"def"):effStat(foe,"aeg");
    const e = effectiveness(m.dom, foe.dom);
    const stab = m.dom===self.dom?1.5:1;
    const exp = m.pow*(A/D)*e*stab*(m.acc/100);
    if(exp>bestDmg){bestDmg=exp;best=mk;}
  }
  const statusMoves = self.moves.filter(mk=>MOVES[mk].cat==="status");
  if(statusMoves.length && self.hp>self.maxhp*0.6 && rng()<0.25){
    return statusMoves[Math.floor(rng()*statusMoves.length)];
  }
  return best || self.moves[0];
}

function calcDamage(att, def, m, ev){
  const A = m.cat==="phys"?effStat(att,"atk"):effStat(att,"gra");
  const D = m.cat==="phys"?effStat(def,"def"):effStat(def,"aeg");
  const e = effectiveness(m.dom, def.dom);
  const stab = m.dom===att.dom?1.5:1;
  const critChance = (m.crit||0.06) + (att.dom==="Herald"?0.06:0);
  const crit = rng()<critChance ? 1.6 : 1;
  const roll = 0.88 + rng()*0.12;
  let dmg = ((2*att.level/5+2)*m.pow*(A/D))/50 + 2;
  dmg = Math.max(1, Math.floor(dmg*e*stab*crit*roll));
  if(crit>1) ev.push({t:"text", s:"A critical strike!"});
  if(e>1)  ev.push({t:"text", s:"The gods favor the blow — it strikes true!"});
  if(e<1)  ev.push({t:"text", s:"The blow glances — the domain resists."});
  return dmg;
}

function actOnce(att, def, moveKey, attSide, ev){
  const m = MOVES[moveKey];

  // pre-action status checks
  if(att.status==="sleep"){
    if(att.statusTurns<=0){ att.status=null; ev.push({t:"text", s:`<b>${att.name}</b> stirs awake!`}); }
    else { att.statusTurns--; ev.push({t:"text", s:`<b>${att.name}</b> slumbers on…`}); return; }
  }
  if(att.status==="charm" && rng()<0.5){
    ev.push({t:"text", s:`<b>${att.name}</b> gazes about, hopelessly charmed!`}); return;
  }

  ev.push({t:"text", s:`<b>${att.name}</b> used <b>${m.name}</b>!`});
  ev.push({t:"anim", side:attSide, kind:"lunge"});

  if(m.cat==="status"){
    const fx = m.fx;
    if(fx.heal){
      const h = Math.floor(att.maxhp*fx.heal);
      att.hp = Math.min(att.maxhp, att.hp+h);
      ev.push({t:"hp"}); ev.push({t:"text", s:`Ambrosial light — <b>${att.name}</b> recovers!`});
    } else if(fx.buff){
      att.stages[fx.buff.stat] = Math.min(2, att.stages[fx.buff.stat]+fx.buff.stages);
      const nm = {atk:"Attack",def:"Defense",spe:"Speed",gra:"Grace",aeg:"Aegis"}[fx.buff.stat];
      ev.push({t:"text", s:`<b>${att.name}</b>'s ${nm} rises!`});
    } else if(fx.status){
      if(def.status){ ev.push({t:"text", s:`But <b>${def.name}</b> is already afflicted…`}); }
      else if(rng()<fx.chance){ applyStatus(def, fx.status, ev); }
      else ev.push({t:"text", s:"But it failed!"});
    }
    return;
  }

  if(rng()*100 > m.acc){
    ev.push({t:"text", s:"…but the strike goes wide!"});
    return;
  }
  const dmg = calcDamage(att, def, m, ev);
  def.hp = Math.max(0, def.hp - dmg);
  ev.push({t:"anim", side:attSide==="ally"?"foe":"ally", kind:"hit"});
  ev.push({t:"hp"});
  if(def.hp>0 && m.fx && m.fx.status && !def.status && rng()<m.fx.chance){
    applyStatus(def, m.fx.status, ev);
  }
}

function applyStatus(c, s, ev){
  c.status = s;
  c.statusTurns = s==="sleep" ? 1+Math.floor(rng()*2) : 99;
  const line = {
    burn:  `<b>${c.name}</b> is scorched by divine fire!`,
    poison:`<b>${c.name}</b> is envenomed!`,
    chill: `<b>${c.name}</b> is chilled — its limbs slow!`,
    sleep: `<b>${c.name}</b> falls into an enchanted sleep!`,
    charm: `<b>${c.name}</b> is charmed!`,
  }[s];
  ev.push({t:"status"});
  ev.push({t:"text", s:line});
}

function endOfTurn(c, ev){
  if(!c || c.hp<=0) return;
  if(c.status==="burn"||c.status==="poison"){
    const d = Math.max(1, Math.floor(c.maxhp/10));
    c.hp = Math.max(0, c.hp-d);
    ev.push({t:"hp"});
    ev.push({t:"text", s:`<b>${c.name}</b> suffers from ${c.status==="burn"?"its burns":"the venom"}…`});
  }
  if(c.status==="chill" && rng()<0.25){ c.status=null; ev.push({t:"status"}); ev.push({t:"text", s:`<b>${c.name}</b> shakes off the chill!`}); }
  if(c.status==="charm" && rng()<0.33){ c.status=null; ev.push({t:"status"}); ev.push({t:"text", s:`<b>${c.name}</b> snaps out of the charm!`}); }
}

/* One full round. Returns event log. Mutates creatures. */
function resolveTurn(ally, foe, allyMoveKey){
  const ev = [];
  const foeMoveKey = chooseAiMove(foe, ally);
  const pa = MOVES[allyMoveKey].prio||0, pf = MOVES[foeMoveKey].prio||0;
  let order;
  if(pa!==pf) order = pa>pf ? ["ally","foe"] : ["foe","ally"];
  else order = effStat(ally,"spe")>=effStat(foe,"spe") ? ["ally","foe"] : ["foe","ally"];

  for(const side of order){
    const att = side==="ally"?ally:foe;
    const def = side==="ally"?foe:ally;
    if(att.hp<=0) continue;
    actOnce(att, def, side==="ally"?allyMoveKey:foeMoveKey, side, ev);
    if(def.hp<=0){
      ev.push({t:"anim", side:side==="ally"?"foe":"ally", kind:"faint"});
      ev.push({t:"text", s:`<b>${def.name}</b> collapses — its spirit returns to the amphora!`});
      break;
    }
  }
  endOfTurn(ally, ev);
  endOfTurn(foe, ev);
  return ev;
}

