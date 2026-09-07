"use strict";
/* Dance of the Gods — core: shared game state and screen switching */

/* ================= GAME / UI ================= */
const state = {
  team: [],
  foeTeam: [],
  allyIdx: 0,
  foeIdx: 0,
  anim: { ally: null, foe: null, t: 0 },
  busy: false,
  // battle context
  battle: { mode: "trainer", canCatch: false, canFlee: false, onEnd: null },
  caught: [], // beasts captured this run (overflow beyond party of 6)
  inventory: { amphora: 8, nectar: 5, remedy: 3, ambrosia: 1 },
  drachma: 45,
  seen: [],
  settings: { sound: false, fastText: false },
  checkpoint: { map: "village", x: 8, y: 10 },
  // overworld
  ow: {
    map: null,
    px: 0,
    py: 0,
    tx: 0,
    ty: 0,
    dir: "down",
    moving: false,
    mt: 0,
    steps: 0,
    flags: {},
  },
};
const PARTY_MAX = 6;
const $ = (id) => document.getElementById(id);
function show(id) {
  state.ow.nextDir = null;
  if (typeof keys !== "undefined")
    Object.keys(keys).forEach((k) => (keys[k] = false));
  document
    .querySelectorAll(".screen")
    .forEach((s) => s.classList.remove("active"));
  $(id).classList.add("active");
  if (typeof updateHUD === "function") updateHUD();
}
