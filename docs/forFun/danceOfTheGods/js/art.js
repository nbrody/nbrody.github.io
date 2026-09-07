"use strict";
/* World sprites preserve the portrait designs with lighter surface detail.
   Battles keep the full-detail front/rear portraits. ?art=vector enables
   the legacy procedural artwork for debugging. */

const DEFAULT_ART = "gen";
const ART_REVISION = "5";
function beastArtURL(key, view = "front", stage = 0) {
  if (stage > 0)
    return `assets/gen/beasts/evolutions/${key}-${stage}.png?v=${ART_REVISION}`;
  return `assets/gen/beasts/${key}${view === "back" ? "Back" : ""}.png?v=${ART_REVISION}`;
}
const ART_MODE = (() => {
  const q = new URLSearchParams(location.search).get("art");
  return q === "gen" || q === "vector" ? q : DEFAULT_ART;
})();

/* cache: speciesKey → {status:"loading"|"ready"|"missing", canvas} */
const genArt = {};
const genBackArt = {};
const evolutionArt = {};
const worldArt = {};
const WORLD_BEAST_KEYS = new Set(["calfin", "fawnling"]);
const WORLD_KEEPER_KEYS = ["orpheus-down", "orpheus-up", "orpheus-left"];
function worldArtURL(key) {
  return `assets/gen/world/${key}.png?v=${ART_REVISION}`;
}
// Brontlet's turnaround faces upper-right; normalize it before the ally flip.
const BACK_ART_FLIP = new Set(["peeplet"]);

/* Preserve the source alpha, including dark eyes and translucent magic.
   The content bounds let wide and tall creatures share a ground line. */
function prepareArt(img) {
  const w = img.naturalWidth,
    h = img.naturalHeight;
  const cv = document.createElement("canvas");
  cv.width = w;
  cv.height = h;
  const ctx = cv.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, w, h),
    p = d.data;
  let x0 = w,
    y0 = h,
    x1 = 0,
    y1 = 0;
  for (let y = 0; y < h; y++)
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (p[i + 3] > 8) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  if (x1 <= x0 || y1 <= y0) {
    x0 = 0;
    y0 = 0;
    x1 = w - 1;
    y1 = h - 1;
  }
  return { canvas: cv, bbox: [x0, y0, x1 - x0 + 1, y1 - y0 + 1] };
}

function loadGenArt(key, view = "front") {
  const cache = view === "back" ? genBackArt : genArt;
  if (cache[key]) return;
  cache[key] = { status: "loading", canvas: null };
  const img = new Image();
  img.onload = () => {
    try {
      const k = prepareArt(img);
      cache[key] = { status: "ready", canvas: k.canvas, bbox: k.bbox };
    } catch (e) {
      cache[key] = { status: "missing" };
    }
    artRefresh();
  };
  img.onerror = () => {
    cache[key] = { status: "missing" };
  };
  img.src = beastArtURL(key, view);
}

function loadWorldArt(key) {
  if (worldArt[key]) return;
  worldArt[key] = { status: "loading" };
  const img = new Image();
  img.onload = () => {
    try {
      worldArt[key] = { status: "ready", ...prepareArt(img) };
    } catch (e) {
      worldArt[key] = { status: "missing" };
    }
    artRefresh();
  };
  img.onerror = () => {
    worldArt[key] = { status: "missing" };
  };
  img.src = worldArtURL(key);
}

function loadEvolutionArt(key, stage) {
  const id = `${key}-${stage}`;
  if (evolutionArt[id]) return;
  evolutionArt[id] = { status: "loading" };
  const img = new Image();
  img.onload = () => {
    try {
      evolutionArt[id] = { status: "ready", ...prepareArt(img) };
    } catch (e) {
      evolutionArt[id] = { status: "missing" };
    }
    artRefresh();
  };
  img.onerror = () => {
    evolutionArt[id] = { status: "missing" };
  };
  img.src = beastArtURL(key, "front", stage);
}

/* Screens that draw beasts ONCE (pick tiles, party cards) would keep the
   vector fallback if their canvases were painted before an image finished
   loading — repaint them when art arrives. The battle canvas redraws every
   frame and needs nothing. */
function artRefresh() {
  const active = document.querySelector(".screen.active");
  if (!active) return;
  if (active.id === "title-screen" && typeof drawTitleLandscape === "function")
    drawTitleLandscape();
  else if (active.id === "pick-screen" && typeof paintStarterArt === "function")
    paintStarterArt();
  else if (active.id === "party-screen" && typeof renderParty === "function")
    renderParty();
}

/* Draw a beast into the standard ~110×100 sprite box of the CURRENT
   transform. Uses the generated image when enabled+ready, else falls back
   to the procedural sprite. All call sites keep their translate/scale/flip. */
/* Preload everything at boot so screens almost never catch art mid-load. */
if (ART_MODE === "gen" && typeof SPECIES !== "undefined") {
  Object.keys(SPECIES).forEach((key) => loadGenArt(key));
  [...WORLD_BEAST_KEYS, ...WORLD_KEEPER_KEYS].forEach(loadWorldArt);
}

function drawWorldBeast(ctx, speciesKey) {
  const species = SPECIES[speciesKey];
  if (ART_MODE === "gen") {
    if (WORLD_BEAST_KEYS.has(speciesKey)) loadWorldArt(speciesKey);
    loadGenArt(speciesKey);
    const art =
      worldArt[speciesKey]?.status === "ready"
        ? worldArt[speciesKey]
        : genArt[speciesKey];
    if (art?.status === "ready") {
      drawPreparedCreature(ctx, art);
      return;
    }
  }
  SPRITES[species.sprite](ctx, DOMAINS[species.dom].color);
}

function drawPreparedCreature(ctx, art, flip = false) {
  const [sx, sy, sw, sh] = art.bbox;
  const scale = Math.min(106 / sw, 94 / sh);
  const dw = sw * scale,
    dh = sh * scale;
  ctx.save();
  if (flip) {
    ctx.translate(110, 0);
    ctx.scale(-1, 1);
  }
  spShadow(ctx, 55, 96, Math.max(24, dw * 0.42));
  ctx.drawImage(art.canvas, sx, sy, sw, sh, 55 - dw / 2, 95 - dh, dw, dh);
  ctx.restore();
}

function artDraw(ctx, speciesKey, spriteKey, acc, view = "front", stage = 0) {
  if (ART_MODE === "gen") {
    // Evolutions currently have front portraits only, on either battle side.
    // Deriving the form from level keeps old saves and level-ups in sync.
    if (stage > 0) {
      loadEvolutionArt(speciesKey, stage);
      const evolved = evolutionArt[`${speciesKey}-${stage}`];
      if (evolved?.status === "ready") {
        drawPreparedCreature(ctx, evolved);
        return;
      }
      view = "front";
    }
    loadGenArt(speciesKey, view);
    // A slow or missing rear portrait keeps the front portrait usable.
    let a = view === "back" ? genBackArt[speciesKey] : genArt[speciesKey];
    if (view === "back" && a?.status !== "ready") {
      loadGenArt(speciesKey);
      a = genArt[speciesKey];
    }
    if (a && a.status === "ready") {
      drawPreparedCreature(
        ctx,
        a,
        view === "back" &&
          a === genBackArt[speciesKey] &&
          BACK_ART_FLIP.has(speciesKey),
      );
      return;
    }
    if (a && a.status === "loading") {
      /* fall through to vector this frame */
    }
  }
  SPRITES[spriteKey](ctx, acc);
}
