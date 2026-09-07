"use strict";
/* Dance of the Gods — battle: rendering, turn flow, capture/flee (wild & trainer) */

/* ---- battle rendering ---- */
const bcv = $("battle-canvas"),
  bctx = bcv.getContext("2d");
// Keep the 520 × 300 battle coordinates, with enough pixels for large displays.
bcv.width = 1560;
bcv.height = 900;
bctx.setTransform(3, 0, 0, 3, 0, 0);
bctx.imageSmoothingQuality = "high";
let frame = 0;
function ally() {
  return state.team[state.allyIdx];
}
function foe() {
  return state.foeTeam[state.foeIdx];
}

function renderStage() {
  if (!$("battle-screen").classList.contains("active")) {
    requestAnimationFrame(renderStage);
    return;
  }
  frame++;
  bctx.clearRect(0, 0, 520, 300);
  drawBattleLandscape(bctx, 520, 300, reducedMotion ? 1 : frame);
  // Fronts face left, backs face away toward upper-left. Mirror the ally
  // so its back faces the player and its gaze points toward the opponent.
  // (a flipped sprite extends left of its anchor, so the ally anchors at its right edge)
  const bobA = reducedMotion ? 0 : Math.sin(frame / 22) * 3,
    bobF = reducedMotion ? 0 : Math.sin(frame / 22 + 2) * 3;
  drawSide("ally", 216, 150 + bobA, 1.15, true);
  drawSide("foe", 251, 46 + bobF, 0.95, false);
  requestAnimationFrame(renderStage);
}
function drawSide(side, x, y, sc, flip) {
  const c = side === "ally" ? ally() : foe();
  if (!c) return;
  let dx = 0,
    alpha = 1;
  const a = state.anim[side];
  if (a) {
    const t = (Date.now() - a.start) / a.dur;
    if (t >= 1) {
      state.anim[side] = null;
    } else if (a.kind === "lunge") {
      dx = Math.sin(t * Math.PI) * (side === "ally" ? 34 : -34);
    } else if (a.kind === "hit") {
      dx = Math.sin(t * 22) * 6;
      alpha = 0.55 + 0.45 * Math.abs(Math.cos(t * 10));
    } else if (a.kind === "faint") {
      alpha = 1 - t;
      y += t * 30;
    }
  }
  if ((c.visualHp ?? c.hp) <= 0 && !a) alpha = 0;
  drawCreature(
    bctx,
    c,
    x + dx,
    y,
    sc,
    flip,
    alpha,
    side === "ally" ? "back" : "front",
  );
}
function animate(side, kind) {
  if (reducedMotion) return;
  state.anim[side] = {
    kind,
    start: Date.now(),
    dur: kind === "faint" ? 700 : kind === "hit" ? 420 : 380,
  };
  if (kind === "hit")
    ($("battle-stage").classList.add("shake"),
      setTimeout(() => $("battle-stage").classList.remove("shake"), 400));
}

/* ---- HP cards ---- */
function hpCard(el, c) {
  const pct = Math.round((100 * c.hp) / c.maxhp);
  el.innerHTML = `
    <div class="row"><span class="nm">${c.name}</span><span class="lv">${c.dom} · Lv ${c.level}</span></div>
    <div class="hpbar"><div class="hpfill ${pct <= 25 ? "low" : ""}" style="width:${pct}%"></div></div>
    <div class="hptext"><span>${c.hp} / ${c.maxhp}</span>
      <span class="status-tag">${c.status ? c.status : ""}</span></div>`;
}
function refreshHp(snapshot) {
  const a = snapshot?.ally || ally(),
    f = snapshot?.foe || foe();
  hpCard($("hp-ally"), a);
  hpCard($("hp-foe"), f);
  ally().visualHp = a.hp;
  foe().visualHp = f.hp;
}

/* ---- dialogue queue ---- */
let typeTimer = null;
let finishBattleLine = null;
function say(html) {
  return new Promise((res) => {
    const d = $("dialogue");
    d.innerHTML = html;
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(typeTimer);
      finishBattleLine = null;
      res();
    };
    finishBattleLine = finish;
    typeTimer = setTimeout(
      finish,
      state.settings.fastText
        ? 90
        : Math.min(1500, 360 + html.replace(/<[^>]*>/g, "").length * 11),
    );
  });
}
$("dialogue").onclick = () => finishBattleLine?.();
addEventListener("keydown", (e) => {
  if (
    $("battle-screen").classList.contains("active") &&
    (e.key === " " || e.key === "Enter")
  ) {
    e.preventDefault();
    finishBattleLine?.();
  }
});

/* ---- battle flow (generic: wild & trainer) ---- */
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
function hideBattleUIs() {
  ["action-ui", "move-ui", "switch-ui", "continue-btn"].forEach((id) =>
    $(id).classList.add("hidden"),
  );
}

/* opts: {mode, foeTeam, intro:[lines], canCatch, canFlee, foeName, onEnd:(result)=>{}} */
function beginBattle(opts) {
  state.battle = Object.assign(
    {
      harmony: 0,
      round: 1,
      fleeAttempts: 0,
      mode: "trainer",
      canCatch: false,
      canFlee: false,
      intro: [],
      foeName: "The foe",
      onEnd: null,
    },
    opts,
  );
  state.foeTeam = opts.foeTeam;
  if (ART_MODE === "gen") {
    [...state.team, ...state.foeTeam].forEach((c) => {
      const stage = creatureStage(c.level);
      if (stage) loadEvolutionArt(c.key, stage);
      else loadGenArt(c.key, state.team.includes(c) ? "back" : "front");
    });
  }
  [...state.team, ...state.foeTeam].forEach((c) => {
    c.stages = { atk: 0, def: 0, gra: 0, aeg: 0, spe: 0 };
    c.guarding = false;
    c.resonance = false;
    c.visualHp = c.hp;
  });
  state.foeTeam.forEach((c) => {
    if (!state.seen.includes(c.key)) state.seen.push(c.key);
  });
  if (!state.team.some((c) => c.hp > 0)) {
    blackout();
    return;
  }
  $("battle-context").textContent =
    opts.mode === "guardian"
      ? "THE SANCTUARY / GUARDIAN"
      : opts.mode === "wild"
        ? "GROVE ENCOUNTER"
        : `${opts.foeName} / CHALLENGE`;
  state.allyIdx = Math.max(
    0,
    state.team.findIndex((c) => c.hp > 0),
  );
  state.foeIdx = 0;
  state.busy = true;
  state.anim.ally = null;
  state.anim.foe = null;
  owActive = false;
  show("battle-screen");
  startBattle();
}

async function startBattle() {
  refreshHp();
  hideBattleUIs();
  for (const line of state.battle.intro) await say(line);
  await say(`Go, <b>${ally().name}</b>!`);
  promptAction();
}

function promptAction() {
  state.busy = false;
  hideBattleUIs();
  $("dialogue").innerHTML = `What will <b>${ally().name}</b> do?`;
  $("action-ui").classList.remove("hidden");
  const catchButton = $("actiongrid").querySelector('[data-act="catch"]');
  catchButton.disabled = !state.battle.canCatch || state.inventory.amphora <= 0;
  catchButton.innerHTML = `Amphora <small>${state.inventory.amphora} left${state.battle.canCatch ? ` · ${Math.round(catchRate(foe()) * 100)}% chance` : ""}</small>`;
  const song = $("actiongrid").querySelector('[data-act="song"]');
  song.disabled = state.battle.harmony >= 3;
  song.innerHTML = `Lyre <small>Shield + harmony ${state.battle.harmony}/3</small>`;
  const item = $("actiongrid").querySelector('[data-act="item"]');
  item.disabled = false;
  item.innerHTML = "Satchel <small>Nectar · herbs · ambrosia</small>";
  $("battle-tokens").textContent =
    `ROUND ${state.battle.round} · HARMONY ${"●".repeat(state.battle.harmony)}${"○".repeat(3 - state.battle.harmony)}`;
  const next = chooseAiMove(foe(), ally());
  state.battle.intent = next;
  $("battle-tactic").textContent =
    state.battle.mode === "guardian"
      ? `Intent: ${MOVES[next].name}. Your lyre halves the next blow.`
      : state.battle.harmony === 3
        ? "Full harmony: your next strike gains 35% power."
        : `Your ${ally().dom} companion faces ${foe().dom}. Tap a move to see its affinity. Signal your companion with the lyre.`;
  $("actiongrid").querySelector('[data-act="flee"]').disabled =
    !state.battle.canFlee;
}
$("actiongrid").addEventListener("click", (e) => {
  const b = e.target.closest(".actbtn");
  if (!b || b.disabled || state.busy) return;
  const act = b.dataset.act;
  if (act === "fight") promptMove();
  else if (act === "switch") promptSwitch(false);
  else if (act === "catch") tryCatch();
  else if (act === "flee") tryFlee();
  else if (act === "song") playBattleSong();
  else if (act === "item") promptBattleItems();
});
$("move-back").onclick = () => {
  if (!state.busy) promptAction();
};

function promptMove() {
  const mg = $("movegrid");
  mg.innerHTML = "";
  const available = ally().moves.some((k) => ally().pp[k] > 0);
  for (const mk of available ? ally().moves : ["struggle"]) {
    const m = MOVES[mk];
    const btn = document.createElement("button");
    btn.className = "movebtn";
    btn.disabled = mk !== "struggle" && ally().pp[mk] <= 0;
    const affinity = effectiveness(m.dom, foe().dom);
    const info =
      m.cat === "status"
        ? m.desc || "status"
        : `pow ${m.pow} · ${m.cat === "phys" ? "might" : "grace"}`;
    btn.innerHTML = `<div class="mn">${m.name}</div>
      <div class="move-detail">${m.cat === "status" ? "Support" : `${m.acc}% accurate · ${affinity === 2 ? "Favored ×2" : affinity === 0.5 ? "Resisted ×½" : "Neutral ×1"}`} · ${mk === "struggle" ? "unlimited" : `${ally().pp[mk]}/${maxPP(mk)} uses`}</div>
      <div class="mi"><span class="dcol" style="color:${DOMAINS[m.dom].color}">${m.dom}</span><span>${info}</span></div>`;
    btn.onclick = () => playerMove(mk);
    mg.appendChild(btn);
  }
  hideBattleUIs();
  $("move-ui").classList.remove("hidden");
  $("dialogue").innerHTML = `<b>${ally().name}</b> — choose a rite.`;
}

async function playerMove(mk) {
  if (
    state.busy ||
    (mk !== "struggle" && (!ally().moves.includes(mk) || ally().pp[mk] <= 0))
  )
    return;
  state.busy = true;
  hideBattleUIs();
  if (state.battle.harmony === 3 && MOVES[mk].cat !== "status") {
    state.battle.harmony = 0;
    ally().resonance = true;
    await say(
      "<b>A full chorus!</b> Your companion's next strike carries every voice.",
    );
  }
  const ev = resolveTurn(ally(), foe(), mk);
  ally().resonance = false;
  await playEvents(ev);
  await afterTurn();
}

async function playEvents(ev) {
  for (const e of ev) {
    if (e.t === "text") await say(e.s);
    else if (e.t === "hp" || e.t === "status") refreshHp(e.snapshot);
    else if (e.t === "anim") {
      animate(e.side, e.kind);
      await wait(state.settings.fastText ? 60 : e.kind === "faint" ? 500 : 260);
    }
  }
}

/* one foe-only turn (used after a failed catch / failed flee) */
async function foeActs() {
  const ev = battleEvents(ally(), foe());
  if (foe().hp > 0 && ally().hp > 0) {
    actOnce(
      foe(),
      ally(),
      state.battle.intent || chooseAiMove(foe(), ally()),
      "foe",
      ev,
    );
  }
  endOfTurn(ally(), ev);
  endOfTurn(foe(), ev);
  await playEvents(ev);
}

async function handleFoeFaint() {
  const c = ally();
  if (c.hp > 0) {
    const gain = Math.round(foe().level * 9 + 16);
    for (const member of state.team) {
      if (member !== c && member.hp > 0) gainXp(member, Math.round(gain * 0.5));
    }
    const events = gainXp(c, gain);
    await say(`<b>${c.name}</b> earns ${gain} favor.`);
    for (const ev of events) {
      await say(`<b>${c.name}</b> ascends to <b>Lv ${ev.lv}</b>!`);
      if (ev.evolved)
        await say(
          `<b>${ev.evolved.from}</b> awakens as <b>${ev.evolved.to}</b>!`,
        );
      for (const l of ev.learned) {
        if (l.forgot)
          await say(
            `<b>${c.name}</b> sets aside <b>${MOVES[l.forgot].name}</b>…`,
          );
        await say(`<b>${c.name}</b> learns <b>${MOVES[l.move].name}</b>!`);
      }
    }
  }
}

async function afterTurn() {
  state.battle.round++;
  refreshHp();
  if (state.team.every((c) => c.hp <= 0)) {
    state.busy = false;
    return endBattle("lost");
  }
  if (foe().hp <= 0) {
    await handleFoeFaint();
    if (state.foeTeam.every((c) => c.hp <= 0)) {
      state.busy = false;
      return endBattle("won");
    }
    state.foeIdx = state.foeTeam.findIndex((c) => c.hp > 0);
    await say(`<b>${state.battle.foeName}</b> sends out <b>${foe().name}</b>!`);
    refreshHp();
  }
  if (ally().hp <= 0) {
    const alive = state.team.filter((c) => c.hp > 0);
    if (alive.length === 0) {
      state.busy = false;
      return endBattle("lost");
    }
    return promptSwitch(true);
  }
  state.busy = false;
  promptAction();
}

function promptSwitch(forced) {
  const row = $("benchrow");
  row.innerHTML = "";
  hideBattleUIs();
  $("dialogue").innerHTML = forced
    ? "Choose your next companion!"
    : "Send out which beast?";
  let any = false;
  state.team.forEach((c, i) => {
    if (c.hp <= 0 || i === state.allyIdx) return;
    any = true;
    const b = document.createElement("button");
    b.className = "movebtn";
    b.innerHTML = `<div class="mn">${c.name}</div><div class="mi"><span class="dcol" style="color:${DOMAINS[c.dom].color}">${c.dom}</span><span>Lv ${c.level} · ${c.hp}/${c.maxhp}</span></div>`;
    b.onclick = async () => {
      if (b.disabled) return;
      row.querySelectorAll("button").forEach((btn) => (btn.disabled = true));
      state.busy = true;
      hideBattleUIs();
      ally().stages = { atk: 0, def: 0, gra: 0, aeg: 0, spe: 0 };
      state.allyIdx = i;
      refreshHp();
      await say(`Go, <b>${c.name}</b>!`);
      if (!forced) {
        await foeActs();
        return afterTurn();
      }
      state.busy = false;
      promptAction();
    };
    row.appendChild(b);
  });
  if (!forced) {
    const back = document.createElement("button");
    back.className = "movebtn";
    back.style.textAlign = "center";
    back.innerHTML = `<div class="mn">◂ Back</div>`;
    back.onclick = () => {
      if (!state.busy) promptAction();
    };
    row.appendChild(back);
  } else if (!any) {
    // shouldn't happen, but guard
    state.busy = false;
    return endBattle("lost");
  }
  $("switch-ui").classList.remove("hidden");
}

function catchRate(f) {
  return Math.min(
    0.96,
    0.26 +
      0.48 * (1 - f.hp / f.maxhp) +
      (f.status ? 0.15 : 0) +
      state.battle.harmony * 0.13,
  );
}
async function tryCatch() {
  if (state.busy || !state.battle.canCatch || state.inventory.amphora <= 0)
    return;
  state.busy = true;
  hideBattleUIs();
  state.inventory.amphora--;
  const f = foe(),
    success = rng() < catchRate(f),
    inParty = state.team.length < PARTY_MAX;
  await say(
    `You offer a <b>Clay Amphora</b>. The clay trembles with <b>${f.name}</b>'s song…`,
  );
  animate("foe", "hit");
  await wait(state.settings.fastText ? 80 : 450);
  if (success) {
    captureFoe(f);
    await say(
      `<b>${f.name}</b> answers your song and ${inParty ? "joins your companions" : "rests in the Oracle's keeping"}!`,
    );
    return endBattle("caught");
  }
  await say(
    `<b>${f.name}</b> pulls away. Lower its health or use the Lyre to build harmony.`,
  );
  await foeActs();
  await afterTurn();
}

function captureFoe(f) {
  f.hp = f.maxhp;
  f.visualHp = f.hp;
  f.status = null;
  f.statusTurns = 0;
  f.stages = { atk: 0, def: 0, gra: 0, aeg: 0, spe: 0 };
  restorePP(f);
  if (!state.seen.includes(f.key)) state.seen.push(f.key);
  if (state.team.length < PARTY_MAX) state.team.push(f);
  else state.caught.push(f);
}

async function tryFlee() {
  if (state.busy || !state.battle.canFlee) return;
  state.busy = true;
  hideBattleUIs();
  state.battle.fleeAttempts++;
  const faster = effStat(ally(), "spe") >= effStat(foe(), "spe");
  if (state.battle.fleeAttempts >= 3 || rng() < (faster ? 0.9 : 0.65)) {
    await say("You slip back through the grove — got away safely!");
    state.busy = false;
    return endBattle("fled");
  }
  await say("You couldn't get away!");
  await foeActs();
  await afterTurn();
}

async function endBattle(result) {
  hideBattleUIs();
  state.busy = true;
  [...state.team, ...state.caught].forEach((c) => {
    c.guarding = false;
    c.resonance = false;
    c.stages = { atk: 0, def: 0, gra: 0, aeg: 0, spe: 0 };
  });
  if (result === "won") {
    const coins =
      state.battle.reward || (state.battle.mode === "wild" ? 8 : 25);
    rewardItems({}, coins);
    await say(`<b>Victory.</b> ${coins} drachmae earned.`);
  }
  state.ow.encounterGrace = 6;
  const cb = state.battle.onEnd;
  state.battle.onEnd = null;
  state.busy = false;
  if (cb) return cb(result);
  returnToOverworld();
}

async function playBattleSong() {
  if (state.busy || state.battle.harmony >= 3) return;
  state.busy = true;
  hideBattleUIs();
  state.battle.harmony++;
  ally().guarding = true;
  ally().hp = Math.min(
    ally().maxhp,
    ally().hp + Math.max(2, Math.round(ally().maxhp * 0.1)),
  );
  playLyre([0, 2, 4].slice(0, state.battle.harmony));
  refreshHp();
  await say(
    `<b>Hymn of Returning.</b> Your companion recovers a little health and braces. Harmony ${state.battle.harmony}/3.`,
  );
  await foeActs();
  await afterTurn();
}
function promptBattleItems() {
  if (state.busy) return;
  hideBattleUIs();
  const row = $("benchrow");
  row.innerHTML = "";
  $("dialogue").textContent = "Choose a provision. Using an item takes a turn.";
  for (const key of ["nectar", "remedy", "ambrosia"]) {
    const b = document.createElement("button");
    b.className = "movebtn";
    b.dataset.item = key;
    b.disabled = !state.inventory[key];
    b.innerHTML = `<div class="mn">${ITEMS[key].name} × ${state.inventory[key]}</div><div class="mi">${ITEMS[key].desc}</div>`;
    b.onclick = () => promptItemTarget(key);
    row.appendChild(b);
  }
  const back = document.createElement("button");
  back.className = "movebtn";
  back.textContent = "Back";
  back.onclick = promptAction;
  row.appendChild(back);
  $("switch-ui").classList.remove("hidden");
}
function promptItemTarget(key) {
  const row = $("benchrow");
  row.innerHTML = "";
  $("dialogue").textContent =
    `Use ${ITEMS[key].name.toLowerCase()} on which companion?`;
  state.team.forEach((c, i) => {
    const b = document.createElement("button");
    b.className = "movebtn";
    b.dataset.target = i;
    b.disabled = !canUseItem(key, c);
    b.innerHTML = `<div class="mn">${c.name}</div><div class="mi">${c.hp}/${c.maxhp} HP${c.status ? ` · ${c.status}` : ""}</div>`;
    b.onclick = async () => {
      if (state.busy || !useItem(key, c)) return;
      state.busy = true;
      hideBattleUIs();
      refreshHp();
      await say(`<b>${ITEMS[key].name}</b> restores <b>${c.name}</b>.`);
      await foeActs();
      await afterTurn();
    };
    row.appendChild(b);
  });
  const back = document.createElement("button");
  back.className = "movebtn";
  back.textContent = "Back";
  back.onclick = promptBattleItems;
  row.appendChild(back);
}

addEventListener("keydown", (e) => {
  if (
    !$("battle-screen").classList.contains("active") ||
    e.repeat ||
    e.target.matches("input,select,textarea")
  )
    return;
  if (e.key === "Escape" && !state.busy) {
    promptAction();
    return;
  }
  const index = Number(e.key) - 1;
  if (index < 0 || index > 5 || !Number.isInteger(index)) return;
  const panel = ["action-ui", "move-ui", "switch-ui"].find(
    (id) => !$(id).classList.contains("hidden"),
  );
  if (!panel) return;
  const button = $(panel).querySelectorAll("button")[index];
  if (button && !button.disabled) {
    e.preventDefault();
    button.click();
  }
});
