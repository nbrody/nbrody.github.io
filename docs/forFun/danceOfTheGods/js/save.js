"use strict";
/* Dance of the Gods — save/load + the playtest harness.
   A save stores party, flags, position and defeated trainers — never map
   grids. restoreWorld() replays every world mutation from the flags, so
   saves stay valid as maps evolve, and the playtest panel can fabricate
   a save for any state and load it through the same path. */

const SAVE_KEY = "dotg-save-1";
let saveEnabled = false; // true for real runs; playtest runs opt in

function hasSave() {
  try {
    return !!localStorage.getItem(SAVE_KEY);
  } catch (e) {
    return false;
  }
}
function clearSave() {
  try {
    localStorage.removeItem(SAVE_KEY);
  } catch (e) {}
}

function makeSave() {
  const trainers = {};
  for (const [mid, m] of Object.entries(MAPS))
    m.npcs.forEach((n) => {
      if (n.team && n.defeated) trainers[mid + ":" + n.name] = true;
    });
  return {
    v: 2,
    at: Date.now(),
    team: state.team,
    caught: state.caught,
    flags: state.ow.flags,
    map: state.ow.map.id,
    tx: state.ow.tx,
    ty: state.ow.ty,
    dir: state.ow.dir,
    trainers,
    inventory: state.inventory,
    drachma: state.drachma,
    seen: state.seen,
    settings: state.settings,
    checkpoint: state.checkpoint,
  };
}
function saveGame() {
  if (
    !saveEnabled ||
    !state.ow.map ||
    $("battle-screen").classList.contains("active")
  )
    return;
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(makeSave()));
    $("save-status").textContent = "Journey saved";
  } catch (e) {
    $("save-status").textContent = "Storage unavailable · export from Satchel";
  }
}
function validateSave(raw) {
  if (
    !raw ||
    ![1, 2].includes(raw.v) ||
    !Object.hasOwn(MAPS, raw.map) ||
    !Array.isArray(raw.team) ||
    raw.team.length > 6 ||
    !Array.isArray(raw.caught || [])
  )
    return null;
  const finite = (v, fallback, min, max) =>
    Number.isFinite(v) ? Math.max(min, Math.min(max, Math.floor(v))) : fallback;
  const readCreature = (c) => {
    if (
      !c ||
      !Object.hasOwn(SPECIES, c.key) ||
      !Number.isInteger(c.level) ||
      c.level < 1 ||
      c.level > 60
    )
      throw new Error("Invalid companion");
    const clean = makeCreature(c.key, c.level);
    clean.hp = finite(c.hp, clean.maxhp, 0, clean.maxhp);
    clean.xp = finite(c.xp, 0, 0, xpToNext(clean.level) - 1);
    clean.status = ["burn", "poison", "chill", "sleep", "charm"].includes(
      c.status,
    )
      ? c.status
      : null;
    clean.statusTurns = finite(c.statusTurns, 0, 0, 99);
    if (c.pp)
      for (const key of clean.moves)
        clean.pp[key] = finite(c.pp[key], maxPP(key), 0, maxPP(key));
    return clean;
  };
  try {
    const sv = {
      ...raw,
      team: raw.team.map(readCreature),
      caught: (raw.caught || []).slice(0, 200).map(readCreature),
      flags: {},
      trainers: {},
    };
    const allowed = [
      "intro",
      "wellSong",
      "groveSong",
      "kass",
      "fawnQuest",
      "fawnRescued",
      "ioneReward",
      "riverNote",
      "emberNote",
      "laurel",
    ];
    for (const flag of allowed)
      if (raw.flags?.[flag] === true) sv.flags[flag] = true;
    for (const flag of ["delphi", "athens"])
      sv.flags[flag] = finite(raw.flags?.[flag], 0, 0, 3);
    if (["voices", "freedom"].includes(raw.flags?.promise))
      sv.flags.promise = raw.flags.promise;
    for (const map of Object.values(MAPS))
      for (const p of map.pickups || [])
        if (raw.flags?.["pickup-" + p.id] === true)
          sv.flags["pickup-" + p.id] = true;
    for (const [mid, map] of Object.entries(MAPS))
      for (const n of map.npcs)
        if (n.team && raw.trainers?.[mid + ":" + n.name] === true)
          sv.trainers[mid + ":" + n.name] = true;
    sv.inventory = {};
    for (const key of Object.keys(ITEMS))
      sv.inventory[key] = finite(
        raw.inventory?.[key],
        { amphora: 8, nectar: 5, remedy: 3, ambrosia: 1 }[key],
        0,
        999,
      );
    sv.drachma = finite(raw.drachma, 45, 0, 999999);
    sv.seen = [
      ...new Set([
        ...(Array.isArray(raw.seen)
          ? raw.seen.filter((k) => Object.hasOwn(SPECIES, k))
          : []),
        ...sv.team.map((c) => c.key),
        ...sv.caught.map((c) => c.key),
      ]),
    ];
    sv.settings = {
      sound: raw.settings?.sound === true,
      fastText: raw.settings?.fastText === true,
    };
    const cp = raw.checkpoint;
    sv.checkpoint =
      cp && Object.hasOwn(MAPS, cp.map)
        ? {
            map: cp.map,
            x: finite(cp.x, 5, 1, MAPS[cp.map].w - 2),
            y: finite(cp.y, 9, 1, MAPS[cp.map].h - 2),
          }
        : { map: "village", x: 5, y: 9 };
    if (!isWalkable(MAPS[sv.checkpoint.map], sv.checkpoint.x, sv.checkpoint.y))
      sv.checkpoint = { map: "village", x: 5, y: 9 };
    sv.tx = finite(raw.tx, 8, 0, MAPS[sv.map].w - 1);
    sv.ty = finite(raw.ty, 10, 0, MAPS[sv.map].h - 1);
    sv.dir = ["up", "down", "left", "right"].includes(raw.dir)
      ? raw.dir
      : "down";
    return sv;
  } catch (e) {
    return null;
  }
}
function loadGame() {
  try {
    const sv = validateSave(JSON.parse(localStorage.getItem(SAVE_KEY)));
    if (!sv) return false;
    saveEnabled = true;
    applySave(sv);
    return true;
  } catch (e) {
    return false;
  }
}

/* Re-apply every runtime world mutation implied by a save. Idempotent. */
function restoreWorld(sv) {
  const flags = sv.flags || {};
  // Hermes has given his gift once the team exists
  const hermes = MAPS.village.npcs.find((n) => n.name === "Hermes");
  if (hermes && (sv.team || []).length > 0) hermes.gone = true;
  // defeated trainers (Kass's onDefeat re-opens the Delphi gate)
  for (const id in sv.trainers || {}) {
    const [mid, name] = id.split(":");
    const npc = MAPS[mid] && MAPS[mid].npcs.find((n) => n.name === name);
    if (npc && npc.team && !npc.defeated) {
      npc.defeated = true;
      npc.solid = false;
      npc.passable = true;
      npc.dir = "left";
      if (npc.onDefeat) npc.onDefeat(npc);
    }
  }
  // Migrate earlier first-chapter saves into the expanded chapter.
  const dst = flags.delphi || 0;
  if (sv.v === 1 && (dst > 0 || sv.trainers?.["route:Kass"])) {
    flags.wellSong = true;
    flags.groveSong = true;
    flags.kass = true;
    if (dst >= 2) {
      flags.riverNote = true;
      flags.emberNote = true;
    }
  }
  if (flags.kass) {
    const kass = MAPS.route.npcs.find((n) => n.name === "Kass");
    kass.defeated = true;
    kass.passable = true;
    kass.solid = false;
    openDelphiGate();
  }
  if (flags.fawnRescued)
    MAPS.route.npcs.find((n) => n.beast === "fawnling").gone = true;
  if (dst >= 3) {
    flags.laurel = true;
    openSacredWay();
  }
  // Myth II — Athens
  const A = MAPS.athens,
    ast = flags.athens || 0;
  const athena = A.npcs.find((n) => n.name === "Athena"),
    poseidon = A.npcs.find((n) => n.name === "Poseidon");
  if (ast >= 1) {
    A.grid[6][9] = "~";
    A.grid[6][10] = "~";
    poseidon.x = 11;
    poseidon.y = 6;
    poseidon.dir = "left";
  }
  if (ast >= 2) {
    A.grid[6][14] = "v";
    athena.x = 13;
    athena.y = 6;
    athena.dir = "right";
  }
  if (ast >= 3) {
    A.name = "Athens — City of the Olive";
    poseidon.dir = "down";
    openCoastRoad();
  }
}

/* Load any save object into a freshly rebuilt world and enter it. */
function applySave(sv) {
  resetWorld();
  state.team = sv.team;
  state.caught = sv.caught || [];
  state.ow.flags = sv.flags || {};
  state.inventory = sv.inventory || {
    amphora: 8,
    nectar: 5,
    remedy: 3,
    ambrosia: 1,
  };
  state.drachma = sv.drachma ?? 45;
  state.seen = sv.seen || [...new Set(state.team.map((c) => c.key))];
  state.settings = sv.settings || { sound: false, fastText: false };
  state.checkpoint = sv.checkpoint || { map: "village", x: 5, y: 9 };
  state.team.concat(state.caught).forEach((c) => {
    if (!c.pp) restorePP(c);
  });
  restoreWorld(sv);
  state.busy = false;
  owBusy = false;
  dlgResolver = null;
  choiceResolver = null;
  state.ow.pendingSay = null;
  $("dialogue-choices").innerHTML = "";
  document.querySelector(".owd-cue").classList.remove("hidden");
  if (!isWalkable(MAPS[sv.map], sv.tx, sv.ty)) {
    const candidates = [];
    for (let y = 0; y < MAPS[sv.map].h; y++)
      for (let x = 0; x < MAPS[sv.map].w; x++)
        if (isWalkable(MAPS[sv.map], x, y) && !MAPS[sv.map].warps[x + "," + y])
          candidates.push({
            x,
            y,
            d: Math.abs(x - sv.tx) + Math.abs(y - sv.ty),
          });
    const near = candidates.sort((a, b) => a.d - b.d)[0];
    sv.tx = near.x;
    sv.ty = near.y;
  }
  state.ow.encounterGrace = 6;
  updateSoundButton();
  $("ow-dialogue").classList.add("hidden");
  enterOverworld(sv.map, sv.tx, sv.ty, sv.dir || "down");
}

/* ================= playtest harness (?dev) ================= */
const DEFAULT_SPAWN = {
  village: [8, 12, "up"],
  route: [7, 15, "up"],
  delphi: [9, 14, "up"],
  sacredWay: [1, 12, "up"],
  athens: [1, 8, "right"],
  coastRoad: [7, 1, "down"],
  corinth: [9, 1, "down"],
};
const DEV_PRESETS = {
  fresh: {
    map: "village",
    delphi: 0,
    athens: 0,
    kass: false,
    all: false,
    lvl: 8,
    team: ["peeplet", "owlet", "fawnling"],
  },
  kassRoad: {
    map: "route",
    delphi: 0,
    athens: 0,
    kass: false,
    all: false,
    lvl: 9,
    team: ["calfin", "cubvine", "dovie"],
  },
  delphiMyth: {
    map: "delphi",
    delphi: 0,
    athens: 0,
    kass: true,
    all: false,
    lvl: 10,
    team: ["pupnos", "slithra", "tortikin"],
  },
  delphiDone: {
    map: "delphi",
    delphi: 3,
    athens: 0,
    kass: true,
    all: false,
    lvl: 11,
    team: ["pupnos", "slithra", "tortikin"],
  },
  athensContest: {
    map: "athens",
    delphi: 3,
    athens: 0,
    kass: true,
    all: false,
    lvl: 12,
    team: ["owlet", "piglos", "seedviper"],
  },
  corinth: {
    map: "corinth",
    delphi: 3,
    athens: 3,
    kass: true,
    all: true,
    lvl: 14,
    team: ["calfin", "cindercrab", "cubvine"],
  },
};

let devReady = false;
function initDevPanel() {
  if (devReady) return;
  devReady = true;
  const mapSel = $("dev-map");
  for (const [id, m] of Object.entries(buildWorld()))
    mapSel.add(new Option(m.name, id));
  for (const sel of ["dev-b1", "dev-b2", "dev-b3"]) {
    const el = $(sel);
    if (sel !== "dev-b1") el.add(new Option("—", "none"));
    for (const [key, s] of Object.entries(SPECIES))
      el.add(new Option(`${s.name} (${s.dom})`, key));
  }
  $("dev-b1").value = "peeplet";
  $("dev-b2").value = "owlet";
  $("dev-b3").value = "fawnling";

  $("dev-preset").onchange = () => {
    const p = DEV_PRESETS[$("dev-preset").value];
    if (!p) return;
    $("dev-map").value = p.map;
    $("dev-delphi").value = p.delphi;
    $("dev-athens").value = p.athens;
    $("dev-kass").checked = p.kass;
    $("dev-trainers").checked = p.all;
    $("dev-level").value = p.lvl;
    $("dev-b1").value = p.team[0];
    $("dev-b2").value = p.team[1] || "none";
    $("dev-b3").value = p.team[2] || "none";
  };

  $("dev-begin").onclick = () => {
    const lvl = Math.max(
      1,
      Math.min(60, parseInt($("dev-level").value, 10) || 8),
    );
    const keys = ["dev-b1", "dev-b2", "dev-b3"]
      .map((id) => $(id).value)
      .filter((k) => k && k !== "none");
    const flags = {};
    const d = +$("dev-delphi").value,
      a = +$("dev-athens").value;
    if (d) {
      flags.delphi = d;
      if (d >= 3) flags.laurel = true;
    }
    if (a) flags.athens = a;
    const trainers = {};
    if ($("dev-kass").checked) trainers["route:Kass"] = true;
    if ($("dev-trainers").checked)
      for (const [mid, m] of Object.entries(MAPS))
        m.npcs.forEach((n) => {
          if (n.team) trainers[mid + ":" + n.name] = true;
        });
    const mapId = $("dev-map").value,
      sp = DEFAULT_SPAWN[mapId] || [2, 2, "down"];
    saveEnabled = $("dev-persist").checked;
    applySave({
      v: 1,
      team: keys.map((k) => makeCreature(k, lvl)),
      caught: [],
      flags,
      trainers,
      map: mapId,
      tx: sp[0],
      ty: sp[1],
      dir: sp[2],
    });
    if (!saveEnabled)
      $("ow-hint").textContent =
        "Playtest session — progress is not being saved.";
  };
  $("dev-back").onclick = () => show("title-screen");
}
