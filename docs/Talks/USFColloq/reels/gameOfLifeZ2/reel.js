/**
 * Game of Life in (ℤ/2)² — an EigenReel piece, ported from the Graphics Studio page
 * (nicjams.github.io/graphics/gameOfLife).
 *
 * Conway's Life where every live cell carries a charge in the Klein four-group V = (ℤ/2)²: the three
 * nonzero elements a, b, c are three colours, and addition in V is XOR. Whether a cell lives is plain
 * Life; the colour laws (Heredity, Alchemy, Predation, Tribes) decide which element a cell is. The
 * engine (life.js), the patterns and the five stories are the studio's, unchanged. This file is the
 * Canvas 2D renderer, the silent feed loop (feed.js plays two stories as a time-lapse), and the
 * interact panel, where the stories speak again as chapter captions.
 */
import { Life, LAWS, RULES, A, B, C } from './life.js';
import { PATTERNS, PATTERN_LABELS, transform, bounds } from './patterns.js';
import { STORIES, storyById, storyTools } from './stories.js';
import { Run, Feed, FEED_T, feedRows } from './feed.js';

const qs = new URLSearchParams(location.search);
const EMBED = qs.get('embed') === 'true';
const $ = id => document.getElementById(id);
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const mod = (a, n) => ((a % n) + n) % n;
const root = document.documentElement;

/* ───────── look ───────── */
const PALETTES = {
  nebula: { label: 'Nebula', bg: '#07080f', a: '#ff5d73', b: '#38d9f5', c: '#ffd166', mono: '#d8f5e8' },
  aurora: { label: 'Aurora', bg: '#050a0c', a: '#7dff8a', b: '#7a8cff', c: '#ff6fd8', mono: '#b8ffd0' },
  ember: { label: 'Ember', bg: '#0c0706', a: '#ff7a2f', b: '#b45cff', c: '#ffe7a0', mono: '#ffc98a' },
  riso: { label: 'Riso', bg: '#0b0a10', a: '#ff4f9a', b: '#2f86ff', c: '#f6e94a', mono: '#f2f2f2' },
  paper: { label: 'Paper', bg: '#f1ece1', a: '#d1495b', b: '#00798c', c: '#e0a030', mono: '#25303b' },
};
// Lens: which display colour each state gets. Indices: 1–3 a/b/c, 4 kernel, 5 coset, 6 mono.
const LENSES = { full: [0, 1, 2, 3], qa: [0, 4, 5, 5], qb: [0, 5, 4, 5], qc: [0, 5, 5, 4], shadow: [0, 6, 6, 6] };
const LENS_NAMES = { full: 'All of (ℤ/2)²', qa: 'Mod ⟨a⟩', qb: 'Mod ⟨b⟩', qc: 'Mod ⟨c⟩', shadow: 'Shadow' };
const LENS_HELP = {
  full: 'Every live cell in its own colour.',
  qa: 'The quotient V/⟨a⟩ ≅ ℤ/2: cells equal to a are grey, and b and c fall in the same class.',
  qb: 'The quotient V/⟨b⟩ ≅ ℤ/2: cells equal to b are grey, and a and c fall in the same class.',
  qc: 'The quotient V/⟨c⟩ ≅ ℤ/2: cells equal to c are grey, and a and b fall in the same class.',
  shadow: 'Alive or dead only: this is ordinary Life.',
};

const S = {
  mode: 'feed', life: null, run: null, story: null, lawName: 'heredity',
  classic: false, lens: 'full', palette: 'auto', trail: 60, glow: 45, cells: 'auto',
  after: 'next', captions: true, running: true, speed: 30,
  ink: 1, stamp: '', rot: 0,
};
let colors = [], lensMap = LENSES.full, fade = new Float32Array(256);
let ghost = new Uint8Array(0), imageData = null;
let layout = { scale: 1, dx: 0, dy: 0 };
let acc = 0, feedT = 0, holding = false, lastGen = -1, lastHud = 0, captionTimer = 0;

/* ───────── canvas ───────── */
const view = $('view'), canvas = $('gl');
const ctx = canvas.getContext('2d', { alpha: false });
const grid = document.createElement('canvas'), gctx = grid.getContext('2d');
const half = document.createElement('canvas'), hctx = half.getContext('2d');
const quarter = document.createElement('canvas'), qctx = quarter.getContext('2d');
const veil = document.createElement('div');
veil.id = 'veil'; veil.style.transition = 'none'; veil.style.opacity = '1';
view.append(veil);

/* ───────── theme and palette ───────── */
const mq = matchMedia('(prefers-color-scheme: dark)');
let themePref = qs.get('theme') || (() => { try { return localStorage.getItem('eigenreel-lifez2-theme'); } catch (e) { return null; } })() || 'auto';
if (!['auto', 'light', 'dark'].includes(themePref)) themePref = 'auto';
const themeName = () => (themePref === 'auto' ? (mq.matches ? 'dark' : 'light') : themePref);

const hexRGB = hex => { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; };
const mixRGB = (p, q, t) => p.map((v, i) => Math.round(v + (q[i] - v) * t));

function refreshPalette() {
  const key = S.palette === 'auto' ? (themeName() === 'light' ? 'paper' : 'nebula') : S.palette;
  const p = PALETTES[key], light = key === 'paper';
  const bg = hexRGB(p.bg), a = hexRGB(p.a), b = hexRGB(p.b), c = hexRGB(p.c);
  colors = [bg, a, b, c, mixRGB(bg, light ? [40, 40, 50] : [200, 205, 220], 0.4), light ? [30, 34, 44] : [246, 242, 232], hexRGB(p.mono)];
  lensMap = S.classic ? LENSES.shadow : LENSES[S.lens];
  root.style.setProperty('--a', p.a); root.style.setProperty('--b', p.b); root.style.setProperty('--c', p.c);
  setCanvasVar();
  root.style.setProperty('--cap-ink', light ? '#1e222c' : '#e9ecf5');
  root.style.setProperty('--cap-text', light ? '#3a404e' : '#cfd4e4');
  root.style.setProperty('--cap-dim', light ? '#5f636c' : '#9aa1b8');
  if (S.life) render();
}
// the page colour behind the field (and the veil) matches what the glow lifts the background to
function setCanvasVar() {
  const bg = colors[0], glowing = S.glow > 0 && bg[0] < 128, lift = glowing ? 1 + 1.25 * S.glow / 100 : 1;
  root.style.setProperty('--canvas', `rgb(${bg.map(v => Math.round(v * lift)).join(',')})`);
}
function applyTheme() {
  if (themePref === 'auto') delete root.dataset.theme; else root.dataset.theme = themePref;
  document.querySelectorAll('#theme-seg button').forEach(b => b.classList.toggle('on', b.dataset.t === themePref));
  refreshPalette();
}
mq.addEventListener('change', () => { if (themePref === 'auto') applyTheme(); });

function refreshTrail() {
  const t = S.trail / 100;
  const decay = t === 0 ? 0 : 0.6 + 0.37 * t;
  for (let k = 0; k < 256; k++) fade[k] = k === 0 ? 0 : 0.5 * decay ** k;
}

/* ───────── worlds ───────── */
const FREE = { id: 'free', cells: 320, boundary: 'wrap', rule: 'B3/S23', law: 'heredity' };
const randomSeed = () => (Math.random() * 2 ** 32) >>> 0;

function gridFor(story, cells) {
  const cols = S.cells === 'auto' ? (cells || story.cells || 320) : Number(S.cells);
  const w = view.clientWidth || 800, h = view.clientHeight || 600;
  if (cells && S.cells === 'auto') return { cols, rows: feedRows(cols, w / h) };
  return { cols, rows: Math.max(60, Math.min(Math.round(cols * 2.3), Math.round((cols * h) / w))) };
}

/** A Life sized for the frame and ready to draw. */
function makeLife(story, seed, cells) {
  const { cols, rows } = gridFor(story, cells);
  const life = new Life({ width: cols, height: rows, boundary: story.boundary, rule: story.rule, law: story.law, seed });
  S.lawName = story.law;
  attach(life);
  return life;
}
function attach(life) {
  S.life = life;
  grid.width = life.viewW; grid.height = life.viewH;
  half.width = Math.ceil(life.viewW / 2); half.height = Math.ceil(life.viewH / 2);
  quarter.width = Math.ceil(life.viewW / 4); quarter.height = Math.ceil(life.viewH / 4);
  imageData = gctx.createImageData(life.viewW, life.viewH);
  ghost = new Uint8Array(life.viewW * life.viewH);
  acc = 0; lastGen = -1;
  resize();
}

// the story beats change rule, law, mutation and bite; these keep the panel in step
const hooks = {
  onRule: text => syncRule(text),
  onLaw: name => { S.lawName = name; syncLaw(); },
  onMutation: p => syncMutation(p),
  onBite: p => syncBite(p),
};

const feed = new Feed(makeLife, hooks);

/* ───────── drawing the field ───────── */
function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(view.clientWidth * dpr)), h = Math.max(1, Math.round(view.clientHeight * dpr));
  if (canvas.width !== w || canvas.height !== h) { canvas.width = w; canvas.height = h; }
  const life = S.life;
  if (!life) return;
  const scale = Math.min(w / life.viewW, h / life.viewH);
  layout = { scale, dx: (w - life.viewW * scale) / 2, dy: (h - life.viewH * scale) / 2 };
  render();
}

function render() {
  const life = S.life;
  if (!life || !imageData) return;
  const { viewW, viewH, W, margin, cells, age } = life;
  const data = imageData.data, bg = colors[0];
  const fresh = S.classic ? 0.25 : 0.35;
  for (let y = 0, k = 0, p = 0; y < viewH; y++) {
    const row = (y + margin) * W + margin;
    for (let x = 0; x < viewW; x++, k++, p += 4) {
      const j = row + x, v = cells[j];
      let r, g, b;
      if (v) {
        const col = colors[lensMap[v]];
        ghost[k] = lensMap[v];
        if (age[j] === 0) { r = col[0] + (255 - col[0]) * fresh; g = col[1] + (255 - col[1]) * fresh; b = col[2] + (255 - col[2]) * fresh; }
        else { r = col[0]; g = col[1]; b = col[2]; }
      } else if (ghost[k]) {
        const f = fade[Math.min(255, age[j] + 1)];
        if (f < 0.012) { ghost[k] = 0; r = bg[0]; g = bg[1]; b = bg[2]; }
        else {
          const col = colors[ghost[k]];
          r = bg[0] + (col[0] - bg[0]) * f; g = bg[1] + (col[1] - bg[1]) * f; b = bg[2] + (col[2] - bg[2]) * f;
        }
      } else { r = bg[0]; g = bg[1]; b = bg[2]; }
      data[p] = r; data[p + 1] = g; data[p + 2] = b; data[p + 3] = 255;
    }
  }
  gctx.putImageData(imageData, 0, 0);

  const { scale, dx, dy } = layout;
  const dw = viewW * scale, dh = viewH * scale;
  const glow = S.glow / 100, glowing = glow > 0 && bg[0] < 128;
  // the glow adds the background colour back on top of the field, so the margins get the same lift
  const lift = glowing ? 1 + 1.25 * glow : 1;
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  ctx.fillStyle = `rgb(${bg.map(v => Math.round(v * lift)).join(',')})`;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(grid, dx, dy, dw, dh);
  if (scale >= 5) {
    // faint cell gutters at high zoom, so cells read as tiles
    ctx.globalAlpha = 0.28; ctx.fillStyle = `rgb(${bg.join(',')})`;
    const gw = Math.max(1, scale * 0.08);
    for (let x = 0; x <= viewW; x++) ctx.fillRect(dx + x * scale - gw / 2, dy, gw, dh);
    for (let y = 0; y <= viewH; y++) ctx.fillRect(dx, dy + y * scale - gw / 2, dw, gw);
    ctx.globalAlpha = 1;
  }
  if (glowing) {
    hctx.imageSmoothingEnabled = qctx.imageSmoothingEnabled = true;
    hctx.drawImage(grid, 0, 0, half.width, half.height);
    qctx.drawImage(half, 0, 0, quarter.width, quarter.height);
    ctx.imageSmoothingEnabled = true;
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.55 * glow;
    ctx.drawImage(half, dx, dy, dw, dh);
    ctx.globalAlpha = 0.7 * glow;
    const pad = scale * 3;
    ctx.drawImage(quarter, dx - pad, dy - pad, dw + 2 * pad, dh + 2 * pad);
    ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  }
}

/* ───────── captions and timeline ───────── */
function showCaption(beat, story) {
  if (!beat || !beat.title || !story) return;
  $('cap-story').textContent = story.title;
  $('cap-chapter').textContent = `Chapter ${beat.chapter}`;
  $('cap-title').textContent = beat.title;
  $('cap-text').textContent = beat.text || '';
  $('caption').classList.toggle('visible', S.captions);
  clearTimeout(captionTimer);
  captionTimer = setTimeout(hideCaption, 11000);
}
function hideCaption() { $('caption').classList.remove('visible'); }

function buildTimeline() {
  const el = $('timeline');
  el.querySelectorAll('.tick').forEach(t => t.remove());
  el.hidden = !S.run;
  if (!S.run) return;
  for (const beat of S.run.story.beats) {
    if (!beat.at) continue;
    const tick = document.createElement('span');
    tick.className = 'tick'; tick.style.left = `${(100 * beat.at) / S.run.story.end}%`;
    el.append(tick);
  }
}

/* ───────── interact: stories, stepping ───────── */
function forceClassic() {
  storyTools(S.life).recolor(() => A);
  S.life.mutation = 0;
}
function onBeat(beat, story) {
  if (S.classic) forceClassic();
  showCaption(beat, story);
}

function loadStory(id) {
  hideCaption();
  const story = id === 'free' ? null : storyById(id);
  const life = makeLife(story || FREE, randomSeed());
  syncRule(life.ruleText); syncLaw(); syncMutation(0); syncBite(0.2); life.mutation = 0;
  $('edge-seg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === life.boundary));
  S.story = story;
  if (story) {
    S.run = new Run(life, story, { hooks, onBeat: beat => onBeat(beat, story) });
    $('story-blurb').textContent = story.blurb;
  } else {
    S.run = null;
    storyTools(life).soup(0, 0, 1, 1, 0.3, S.classic ? [A] : [A, B, C]);
    $('story-blurb').textContent = 'A random soup with no script. Paint, stamp and change the rules as you like.';
  }
  if (S.classic) forceClassic();
  buildTimeline(); syncStories();
  render(); updateHud(true);
}

function storyFinished() {
  const id = S.run.story.id;
  if (S.after === 'loop') loadStory(id);
  else if (S.after === 'next') loadStory(STORIES[(STORIES.findIndex(s => s.id === id) + 1) % STORIES.length].id);
  else { S.run = null; buildTimeline(); }
}

function stepWorld() {
  if (S.run) { S.run.step(); if (S.run.done) storyFinished(); } else S.life.step();
}

/* ───────── interact: painting ───────── */
function cellAt(e) {
  const rect = canvas.getBoundingClientRect();
  const dpr = canvas.width / rect.width;
  return [
    Math.floor(((e.clientX - rect.left) * dpr - layout.dx) / layout.scale),
    Math.floor(((e.clientY - rect.top) * dpr - layout.dy) / layout.scale),
  ];
}
function ink() {
  if (S.classic) return S.ink === 0 ? 0 : A;
  return S.ink === -1 ? 1 + Math.floor(Math.random() * 3) : S.ink;
}
function paintAt(x, y) {
  const life = S.life, r = Math.max(1, Math.round(life.viewW / 200));
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (dx * dx + dy * dy > r * r + 0.5) continue;
    if (S.ink !== 0 && Math.random() < 0.35) continue;          // leave the brush a little ragged
    life.set(x + dx, y + dy, ink());
  }
}
function paintLine([x0, y0], [x1, y1]) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) paintAt(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n));
}
function stampAt(x, y) {
  const cells = transform(PATTERNS[S.stamp], S.rot);
  const { w, h } = bounds(cells);
  const color = ink() || A;
  for (const [cx, cy] of cells) S.life.set(x - Math.floor(w / 2) + cx, y - Math.floor(h / 2) + cy, color);
}

let down = null, painting = false, lastCell = null;
canvas.addEventListener('pointerdown', e => {
  down = { x: e.clientX, y: e.clientY };
  if (S.mode !== 'interact') return;
  const cell = cellAt(e);
  if (S.stamp) { stampAt(...cell); render(); updateHud(true); return; }
  painting = true; lastCell = cell;
  try { canvas.setPointerCapture(e.pointerId); } catch (err) { /* synthetic pointers have nothing to capture */ }
  paintAt(...cell); render();
});
canvas.addEventListener('pointermove', e => {
  if (!painting) return;
  const cell = cellAt(e);
  paintLine(lastCell, cell); lastCell = cell; render();
});
canvas.addEventListener('pointerup', e => {
  if (S.mode === 'feed' && !EMBED && down && Math.hypot(e.clientX - down.x, e.clientY - down.y) < 10) setMode('interact');
  painting = false; lastCell = null; down = null;
  if (S.mode === 'interact') updateHud(true);
});
canvas.addEventListener('pointercancel', () => { painting = false; lastCell = null; down = null; });

/* ───────── panel ───────── */
const hud = { gen: $('r-gen'), rule: $('r-rule'), law: $('r-law'), text: $('census-text'), bars: $('census').children };
function updateHud(force = false) {
  const now = performance.now();
  if (!force && now - lastHud < 150) return;
  lastHud = now;
  const life = S.life;
  hud.gen.textContent = life.generation.toLocaleString('en-US');
  const c = life.census(), total = c[1] + c[2] + c[3];
  for (let k = 0; k < 3; k++) hud.bars[k].style.width = total ? `${(100 * c[k + 1]) / total}%` : '0';
  hud.text.textContent = S.classic ? `${total.toLocaleString('en-US')} alive`
    : `a ${c[1].toLocaleString('en-US')} · b ${c[2].toLocaleString('en-US')} · c ${c[3].toLocaleString('en-US')}`;
  $('timeline-fill').style.width = S.run ? `${Math.min(100, (100 * life.generation) / S.run.story.end)}%` : '0';
}

const chips = (id, items, onPick) => {
  const el = $(id);
  for (const [value, label, extra] of items) {
    const b = document.createElement('button');
    b.dataset.v = value; b.append(label);
    if (extra) b.prepend(extra);
    b.addEventListener('click', () => onPick(value));
    el.append(b);
  }
  return el;
};
const mark = (id, value) => $(id).querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === String(value)));
const dot = color => { const i = document.createElement('i'); i.className = 'dot'; i.style.background = color; return i; };

chips('stories', [...STORIES.map(s => [s.id, s.title]), ['free', 'Free play']], id => loadStory(id));
chips('rules', Object.entries(RULES).map(([k, v]) => [k, v]), k => { S.life.setRule(k); syncRule(S.life.ruleText); });
chips('laws', Object.entries(LAWS).map(([k, v]) => [k, v.label]), k => { S.life.setLaw(k); S.lawName = k; syncLaw(); });
chips('inks', [['1', 'a', dot('var(--a)')], ['2', 'b', dot('var(--b)')], ['3', 'c', dot('var(--c)')], ['-1', 'Random'], ['0', 'Erase']], v => { S.ink = Number(v); mark('inks', S.ink); });
chips('palettes', [['auto', 'Auto'], ...Object.entries(PALETTES).map(([k, v]) => [k, v.label])], k => { S.palette = k; mark('palettes', k); refreshPalette(); });
chips('lenses', Object.entries(LENS_NAMES), k => { S.lens = k; mark('lenses', k); $('lens-help').textContent = LENS_HELP[k]; refreshPalette(); });
chips('cells', [['auto', 'Auto'], ...[160, 240, 320, 400, 480, 640].map(n => [String(n), String(n)])], k => { S.cells = k; mark('cells', k); if (S.mode === 'interact') loadStory(S.story ? S.story.id : 'free'); });
$('stamp').append(...Object.entries(PATTERN_LABELS).map(([k, v]) => new Option(v, k)));

function syncStories() { mark('stories', S.story ? S.story.id : 'free'); }
function syncRule(text) {
  mark('rules', text);
  hud.rule.textContent = text;
}
function syncLaw() {
  mark('laws', S.lawName);
  const law = LAWS[S.lawName];
  if (law) { hud.law.textContent = law.label; $('law-help').textContent = law.help; }
}
function syncMutation(p) { $('mutation').value = Math.round(p * 10000); $('r-mut').textContent = `${(p * 100).toFixed(2)}%`; }
function syncBite(p) { $('bite').value = Math.round(p * 100); $('r-bite').textContent = `${Math.round(p * 100)}%`; }
function syncTransport() {
  $('play').textContent = S.running ? 'Pause' : 'Play';
  $('speed').value = S.speed; $('r-speed').textContent = `${S.speed} gen/s`;
}
function setRunning(v) { S.running = v; acc = 0; syncTransport(); }

$('play').addEventListener('click', () => setRunning(!S.running));
$('stepb').addEventListener('click', () => { setRunning(false); stepWorld(); render(); updateHud(true); });
$('restart').addEventListener('click', () => loadStory(S.story ? S.story.id : 'free'));
$('speed').addEventListener('input', () => { S.speed = Number($('speed').value); syncTransport(); });
$('after-seg').querySelectorAll('button').forEach(b => b.addEventListener('click', () => { S.after = b.dataset.v; mark('after-seg', S.after); }));
$('sw-cap').addEventListener('change', e => { S.captions = e.target.checked; if (!S.captions) hideCaption(); });
$('mode-seg').querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
  S.classic = b.dataset.v === 'classic';
  root.classList.toggle('classic', S.classic);
  mark('mode-seg', b.dataset.v);
  if (S.classic) forceClassic(); else S.life.mutation = Number($('mutation').value) / 10000;
  refreshPalette(); updateHud(true);
}));
$('edge-seg').querySelectorAll('button').forEach(b => b.addEventListener('click', () => {
  // rebuild the field with the new topology, carrying the visible cells across
  const old = S.life, law = { birth: old.birthLaw, survive: old.surviveLaw, cancel: old.cancel };
  const life = new Life({ width: old.viewW, height: old.viewH, boundary: b.dataset.v, rule: old.ruleText, law, seed: randomSeed() });
  life.generation = old.generation; life.mutation = old.mutation; life.setBite(old.bite);
  for (let y = 0; y < old.viewH; y++) for (let x = 0; x < old.viewW; x++) life.set(x, y, old.get(x, y));
  if (S.run) S.run.life = life;
  attach(life); mark('edge-seg', b.dataset.v);
}));
$('mutation').addEventListener('input', () => { const p = Number($('mutation').value) / 10000; S.life.mutation = S.classic ? 0 : p; syncMutation(p); });
$('bite').addEventListener('input', () => { const p = Number($('bite').value) / 100; S.life.setBite(p); syncBite(p); });
$('trail').addEventListener('input', () => { S.trail = Number($('trail').value); $('r-trail').textContent = S.trail; refreshTrail(); render(); });
$('glow').addEventListener('input', () => { S.glow = Number($('glow').value); $('r-glow').textContent = S.glow; setCanvasVar(); render(); });
$('stamp').addEventListener('change', () => { S.stamp = $('stamp').value; });
$('rotate').addEventListener('click', () => { S.rot = (S.rot + 1) % 4; });
$('soup').addEventListener('click', () => { storyTools(S.life).soup(0, 0, 1, 1, 0.25, S.classic ? [A] : [A, B, C]); render(); updateHud(true); });
$('clear').addEventListener('click', () => { S.life.clear(); ghost.fill(0); render(); updateHud(true); });
document.querySelectorAll('#theme-seg button').forEach(b => b.addEventListener('click', () => {
  themePref = b.dataset.t;
  try { localStorage.setItem('eigenreel-lifez2-theme', themePref); } catch (e) {}
  applyTheme();
}));
$('close').addEventListener('click', () => setMode('feed'));

/* ───────── modes ───────── */
const panel = $('panel'), hint = $('hint');
function setMode(m) {
  if (m === S.mode) return;
  S.mode = m;
  root.classList.toggle('interact', m === 'interact');
  panel.inert = m !== 'interact';
  hint.classList.remove('show');
  if (m === 'interact') {
    // take over the story where the feed has got to
    S.life = feed.life; S.run = feed.run; S.story = S.run.story;
    S.run.onBeat = beat => onBeat(beat, S.run.story);
    S.classic = false; root.classList.remove('classic'); mark('mode-seg', 'klein');
    S.running = true; S.speed = clamp(Math.round(feed.rate), 8, 60);
    veil.style.transition = 'opacity .3s'; veil.style.opacity = '0';
    syncRule(S.life.ruleText); syncLaw(); syncMutation(S.life.mutation); syncBite(S.life.bite);
    $('mutation').value = Math.round(S.life.mutation * 10000);
    $('edge-seg').querySelectorAll('button').forEach(b => b.classList.toggle('on', b.dataset.v === S.life.boundary));
    $('story-blurb').textContent = S.story.blurb;
    buildTimeline(); syncStories(); syncTransport();
    mark('palettes', S.palette); mark('lenses', S.lens); mark('cells', S.cells); mark('inks', S.ink); mark('after-seg', S.after);
    showCaption(S.run.last, S.run.story);
    resize(); updateHud(true);
  } else {
    holding = true;
    hideCaption();
    veil.style.transition = 'opacity .26s'; veil.style.opacity = '1';
    setTimeout(() => {
      veil.style.transition = 'none';
      feed.reset(); feedT = 0; S.run = null; S.life = null;
      applyFeed(0);
      holding = false;
    }, 280);
  }
}

function applyFeed(t) {
  feed.seek(t);
  S.life = feed.life; S.run = feed.run; S.story = feed.run.story;
  if (feed.life.generation !== lastGen) { lastGen = feed.life.generation; render(); }
  if (S.mode === 'feed') veil.style.opacity = String(feed.veil);
}

/* ───────── frame loop ───────── */
function tick(dt) {
  if (S.mode === 'feed') {
    if (holding) return;
    feedT += dt;
    if (feedT >= FEED_T) feedT -= FEED_T;
    applyFeed(feedT);
    return;
  }
  if (!S.running) return;
  acc += dt * S.speed;
  let steps = 0;
  while (acc >= 1 && steps < 8) { stepWorld(); acc -= 1; steps++; }
  if (steps === 8) acc = 0;
  if (steps) { render(); updateHud(); }
}

let last = performance.now(), paused = false;
function frame(now) {
  const dt = Math.min(0.1, Math.max(0, (now - last) / 1000));
  last = now;
  if (!paused) tick(dt);
  requestAnimationFrame(frame);
}

/* ───────── keys and messages ───────── */
addEventListener('keydown', e => {
  if (EMBED) {
    // the parent presentation owns the arrows
    const dir = { ArrowRight: 'next', ArrowDown: 'next', ArrowLeft: 'prev', ArrowUp: 'prev' }[e.key];
    if (dir) { e.preventDefault(); parent.postMessage({ type: 'iframeNav', direction: dir }, '*'); }
    return;
  }
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.closest && e.target.closest('input, select, textarea')) { if (e.key !== 'Escape') return; }
  if (e.target.closest && e.target.closest('button, summary') && (e.key === ' ' || e.key === 'Enter')) return;
  if (S.mode === 'feed') {
    if (e.key === 'Enter') { e.preventDefault(); setMode('interact'); }
    return;
  }
  const key = e.key.toLowerCase();
  if (key === 'escape') { e.preventDefault(); if (S.stamp) { S.stamp = ''; $('stamp').value = ''; } else setMode('feed'); }
  else if (key === ' ') { e.preventDefault(); setRunning(!S.running); }
  else if (key === 'n') { setRunning(false); stepWorld(); render(); updateHud(true); }
  else if (key === 'r') loadStory(S.story ? S.story.id : 'free');
  else if (key === 's') loadStory(STORIES[(STORIES.findIndex(x => x === S.story) + 1) % STORIES.length].id);
  else if (key === 't') S.rot = (S.rot + 1) % 4;
});

addEventListener('message', e => {
  const m = e.data;
  if (m && typeof m === 'object' && m.type === 'mode' && (m.mode === 'feed' || m.mode === 'interact')) setMode(m.mode);
});

new ResizeObserver(resize).observe(view);

/* ───────── boot ───────── */
refreshTrail();
applyTheme();
syncTransport();
mark('palettes', S.palette); mark('lenses', S.lens); mark('cells', S.cells); mark('inks', S.ink); mark('after-seg', S.after);
$('lens-help').textContent = LENS_HELP.full;
if (qs.has('t')) feedT = clamp(Number(qs.get('t')) || 0, 0, FEED_T - 0.001);
applyFeed(feedT);
if (qs.get('mode') === 'interact' && !EMBED) {
  if (!qs.has('t')) { feedT = 16; applyFeed(feedT); }
  setMode('interact');
} else if (!EMBED) {
  setTimeout(() => { if (S.mode === 'feed') hint.classList.add('show'); }, 2600);
  setTimeout(() => hint.classList.remove('show'), 8500);
}
requestAnimationFrame(frame);

// for testing: step the piece by hand when the pane is hidden and rAF is frozen
window.__lifez2 = {
  step: dt => { tick(dt); render(); },
  seek: t => { feedT = mod(t, FEED_T); applyFeed(feedT); render(); },
  advance: (n = 1) => { for (let i = 0; i < n; i++) stepWorld(); render(); updateHud(true); },
  setMode, loadStory, S, feed, STORIES,
  pause: v => { paused = v !== false; },
  get mode() { return S.mode; }, get feedT() { return feedT; },
};
