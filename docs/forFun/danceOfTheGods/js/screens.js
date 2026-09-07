"use strict";
/* Dance of the Gods — screens: title art, starter selection, boot */

/* ---- title art: the Keeper on the road to Olympus ---- */
drawTitleLandscape();

/* ---- the Gift of Hermes: choose ONE of three starters ----
   Sky > Sea > Forge > Sky is the type chart's one true triangle. */
const STARTERS = ["peeplet", "calfin", "cindercrab"];
const picked = new Set();
function buildStarterPick() {
  const grid = $("pick-grid");
  grid.innerHTML = "";
  picked.clear();
  const b = $("fight-btn");
  b.disabled = true;
  b.textContent = "Choose a companion";
  for (const key of STARTERS) {
    const s = SPECIES[key];
    const tile = document.createElement("button");
    tile.type = "button";
    tile.setAttribute("aria-pressed", "false");
    tile.className = "tile";
    tile.dataset.beast = key;
    tile.innerHTML = `<canvas width="240" height="220" aria-label="${s.category}"></canvas>
      <div class="nm">${s.name}</div>
      <div class="beast-category">${s.category}</div>
      <div class="dm">${s.dom}</div>
      <div class="god">of ${DOMAINS[s.dom].god}</div><p class="starter-personality">${s.personality}</p><p class="starter-desc">${{ peeplet: "A swift striker. Strong against Sea and War.", calfin: "A sturdy guardian. Strong against Sun and Forge.", cindercrab: "A patient defender. Strong against Sky and Hunt." }[key]}</p>`;
    tile.onclick = () => {
      picked.clear();
      picked.add(key);
      grid.querySelectorAll(".tile").forEach((t) => {
        t.classList.toggle("sel", t === tile);
        t.setAttribute("aria-pressed", String(t === tile));
      });
      b.disabled = false;
      b.textContent = `Take ${s.name}`;
    };
    grid.appendChild(tile);
  }
  paintStarterArt();
}
function paintStarterArt() {
  document.querySelectorAll("#pick-grid .tile").forEach((tile) => {
    const key = tile.dataset.beast,
      s = SPECIES[key];
    const canvas = tile.querySelector("canvas"),
      ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.save();
    ctx.translate(10, 10);
    ctx.scale(2, 2);
    artDraw(ctx, key, s.sprite, DOMAINS[s.dom].color);
    ctx.restore();
  });
}

$("start-btn").onclick = () => {
  if (
    hasSave() &&
    !confirm(
      "Begin a new journey? Your saved journey will be overwritten when you take the road.",
    )
  )
    return;
  resetWorld();
  state.ow.flags = {};
  state.team = [];
  state.caught = [];
  state.seen = [];
  state.inventory = { amphora: 8, nectar: 5, remedy: 3, ambrosia: 1 };
  state.drachma = 45;
  state.checkpoint = { map: "village", x: 8, y: 12 };
  state.ow.encounterGrace = 6;
  saveEnabled = true;
  enterOverworld("village", 8, 12, "up");
  openingStory();
};
$("fight-btn").onclick = () => {
  if (!picked.size) return;
  const c = makeCreature([...picked][0], 8);
  state.team = [c];
  state.seen = [c.key];
  const hermes = MAPS.village.npcs.find((n) => n.name === "Hermes");
  if (hermes) hermes.gone = true;
  state.ow.pendingSay = [
    `<b>Hermes</b>: “<b>${c.name}</b>! A fine ear. Take these amphorae and provisions. Play your lyre to calm a wild beast, then offer it a place beside you.”`,
    "“Before you go, find <b>Myrrha by the well</b>. She remembers your mother's song.” He winks. “All the best journeys begin by listening.”",
  ];
  returnToOverworld();
};
/* saved journey → Continue; ?dev → the playtest panel */
(function initTitle() {
  if (hasSave()) $("resume-btn").classList.remove("hidden");
  $("resume-btn").onclick = () => {
    if (!loadGame()) {
      $("resume-btn").classList.add("hidden");
      alert(
        "The saved journey could not be read — it may predate the current world. Begin anew.",
      );
      clearSave();
    }
  };
  if (new URLSearchParams(location.search).has("dev"))
    $("dev-btn").classList.remove("hidden");
  $("dev-btn").onclick = () => {
    initDevPanel();
    show("dev-screen");
  };
})();
$("again-btn").onclick = () => show("title-screen");

/* ---- boot ---- */
renderStage();
