import { Life, LAWS, RULES, A, B, C } from './life.js';
import { PATTERNS, PATTERN_LABELS, transform, bounds } from './patterns.js';
import { STORIES, storyById, storyTools } from './stories.js';

const $ = id => document.getElementById(id);
const app = document.querySelector('.app');
const view = $('view');
const ctx = view.getContext('2d', { alpha: false });
const grid = document.createElement('canvas');
const gctx = grid.getContext('2d');
const half = document.createElement('canvas'), hctx = half.getContext('2d');
const quarter = document.createElement('canvas'), qctx = quarter.getContext('2d');

const PALETTES = {
  nebula: { label: 'Nebula', bg: '#07080f', a: '#ff5d73', b: '#38d9f5', c: '#ffd166', mono: '#d8f5e8' },
  aurora: { label: 'Aurora', bg: '#050a0c', a: '#7dff8a', b: '#7a8cff', c: '#ff6fd8', mono: '#b8ffd0' },
  ember: { label: 'Ember', bg: '#0c0706', a: '#ff7a2f', b: '#b45cff', c: '#ffe7a0', mono: '#ffc98a' },
  riso: { label: 'Riso', bg: '#0b0a10', a: '#ff4f9a', b: '#2f86ff', c: '#f6e94a', mono: '#f2f2f2' },
  paper: { label: 'Paper (light)', bg: '#f1ece1', a: '#d1495b', b: '#00798c', c: '#e0a030', mono: '#25303b' },
};
// Lens: which display colour each state gets. Indices: 1–3 a/b/c, 4 kernel, 5 coset, 6 mono.
const LENSES = { full: [0, 1, 2, 3], qa: [0, 4, 5, 5], qb: [0, 5, 4, 5], qc: [0, 5, 5, 4], shadow: [0, 6, 6, 6] };

let life, story = null, beatIndex = 0, storyIndex = 0;
let running = !matchMedia('(prefers-reduced-motion: reduce)').matches;
let accumulator = 0, lastTime = 0, lastHud = 0, captionTimer = 0;
let ghost = new Uint8Array(0), imageData = null;
let colors = [], lensMap = LENSES.full, fade = new Float32Array(256);
let stampRot = 0, painting = false, lastCell = null;
let layout = { scale: 1, dx: 0, dy: 0 };

// ── setup of static controls ────────────────────────────────────────────────
$('story').append(...STORIES.map(s => new Option(s.title, s.id)), new Option('Free play: random soup', 'free'));
$('rule').append(...Object.entries(RULES).map(([k, v]) => new Option(`${v} · ${k}`, k)));
$('law').append(...Object.entries(LAWS).map(([k, v]) => new Option(v.label, k)));
$('palette').append(...Object.entries(PALETTES).map(([k, v]) => new Option(v.label, k)));
$('stamp').append(...Object.entries(PATTERN_LABELS).map(([k, v]) => new Option(v, k)));

function hexRGB(hex) { const n = parseInt(hex.slice(1), 16); return [n >> 16, (n >> 8) & 255, n & 255]; }
function mixRGB(p, q, t) { return p.map((v, i) => Math.round(v + (q[i] - v) * t)); }

function refreshPalette() {
  const p = PALETTES[$('palette').value];
  const bg = hexRGB(p.bg), light = p === PALETTES.paper;
  const a = hexRGB(p.a), b = hexRGB(p.b), c = hexRGB(p.c);
  colors = [bg, a, b, c, mixRGB(bg, light ? [40, 40, 50] : [200, 205, 220], 0.4), light ? [30, 34, 44] : [246, 242, 232], hexRGB(p.mono)];
  document.documentElement.style.setProperty('--a', p.a);
  document.documentElement.style.setProperty('--b', p.b);
  document.documentElement.style.setProperty('--c', p.c);
  document.body.style.background = p.bg;
  lensMap = $('mode').value === 'classic' ? LENSES.shadow : LENSES[$('lens').value];
}
function refreshTrail() {
  const t = Number($('trail').value) / 100;
  $('trailOut').value = Math.round(t * 100);
  const decay = t === 0 ? 0 : 0.6 + 0.37 * t;
  for (let k = 0; k < 256; k++) fade[k] = k === 0 ? 0 : 0.5 * decay ** k;
}

// ── world construction ─────────────────────────────────────────────────────
function gridSize() {
  const cols = $('resolution').value === 'auto' ? (story?.cells || 320) : Number($('resolution').value);
  const panel = $('controls');
  const side = panel.offsetParent && innerWidth > 720 ? panel.offsetWidth + 24 : 0;
  const w = (view.clientWidth || innerWidth || 16) - side, h = view.clientHeight || innerHeight || 10;
  const rows = Math.max(60, Math.min(Math.round(cols * 1.6), Math.round((cols * h) / w)));
  return { cols, rows };
}

function newWorld({ boundary, rule, law }) {
  const { cols, rows } = gridSize();
  life = new Life({ width: cols, height: rows, boundary, rule, law, seed: (Math.random() * 2 ** 32) >>> 0 });
  syncBite(0.2);
  grid.width = cols; grid.height = rows;
  half.width = Math.ceil(cols / 2); half.height = Math.ceil(rows / 2);
  quarter.width = Math.ceil(cols / 4); quarter.height = Math.ceil(rows / 4);
  imageData = gctx.createImageData(cols, rows);
  ghost = new Uint8Array(cols * rows);
  $('boundary').value = boundary;
  syncRule(life.ruleText); syncLaw(typeof law === 'string' ? law : null); syncMutation(0);
  accumulator = 0;
  resize();
}

const hooks = { onRule: syncRule, onLaw: syncLaw, onMutation: syncMutation, onBite: syncBite };
function syncBite(p) {
  life.setBite(p);
  $('bite').value = Math.round(p * 100); $('biteOut').value = `${Math.round(p * 100)}%`;
}
function syncRule(text) {
  if (![...$('rule').options].some(o => o.value === text)) $('rule').append(new Option(`Custom · ${text}`, text));
  $('rule').value = text; $('ruleReadout').textContent = text;
}
function syncLaw(name) {
  if (name) $('law').value = name;
  const law = LAWS[$('law').value];
  $('lawHelp').textContent = law.help; $('lawReadout').textContent = law.label;
}
function syncMutation(p) {
  if (life) life.mutation = $('mode').value === 'classic' ? 0 : p;
  $('mutation').value = Math.round(p * 10000);
  $('mutationOut').value = `${(p * 100).toFixed(2)}%`;
}

function loadStory(id) {
  hideCaption();
  if (id === 'free') {
    story = null;
    $('story').value = 'free';
    newWorld({ boundary: 'wrap', rule: 'B3/S23', law: 'heredity' });
    storyTools(life).soup(0, 0, 1, 1, 0.3, $('mode').value === 'classic' ? [A] : [A, B, C]);
    $('storyBlurb').textContent = 'A random soup with no script. Paint, stamp and change the rules as you like.';
    buildTimeline();
  } else {
    story = storyById(id);
    storyIndex = STORIES.indexOf(story);
    $('story').value = story.id;
    newWorld(story);
    $('storyBlurb').textContent = story.blurb;
    beatIndex = 0;
    buildTimeline();
    runBeats();
  }
  render(); updateHud(true);
}

function runBeats() {
  if (!story) return;
  while (beatIndex < story.beats.length && story.beats[beatIndex].at <= life.generation) {
    const beat = story.beats[beatIndex++];
    beat.run?.(storyTools(life, hooks));
    if ($('mode').value === 'classic') forceClassic();
    showCaption(beat);
  }
}

function storyFinished() {
  const after = $('afterStory').value;
  if (after === 'loop') loadStory(story.id);
  else if (after === 'next') loadStory(STORIES[(storyIndex + 1) % STORIES.length].id);
  else { story = null; buildTimeline(); }
}

function step() {
  life.step();
  if (story) {
    runBeats();
    if (life.generation >= story.end) storyFinished();
  }
}

// ── captions & timeline ────────────────────────────────────────────────────
function showCaption(beat) {
  if (!beat.title) return;
  $('capStory').textContent = story.title;
  $('capChapter').textContent = `Chapter ${beat.chapter}`;
  $('capTitle').textContent = beat.title;
  $('capText').textContent = beat.text || '';
  $('caption').classList.toggle('visible', $('captions').checked);
  clearTimeout(captionTimer);
  captionTimer = setTimeout(hideCaption, 11000);
}
function hideCaption() { $('caption').classList.remove('visible'); }

function buildTimeline() {
  const el = $('timeline');
  el.querySelectorAll('.tick').forEach(t => t.remove());
  el.hidden = !story;
  if (!story) return;
  for (const beat of story.beats) {
    if (!beat.at) continue;
    const tick = document.createElement('span');
    tick.className = 'tick'; tick.style.left = `${(100 * beat.at) / story.end}%`;
    el.append(tick);
  }
}

// ── rendering ──────────────────────────────────────────────────────────────
function resize() {
  const dpr = Math.min(devicePixelRatio || 1, 2);
  const w = Math.max(1, Math.round(view.clientWidth * dpr)), h = Math.max(1, Math.round(view.clientHeight * dpr));
  if (view.width !== w || view.height !== h) { view.width = w; view.height = h; }
  if (!life) return;
  // Keep the field clear of the side panel when there is room for both.
  const panel = $('controls');
  const side = panel.offsetParent && innerWidth > 720 ? (panel.offsetWidth + 24) * dpr : 0;
  const aw = w - side;
  const scale = Math.min(aw / life.viewW, h / life.viewH);
  layout = { scale, dx: (aw - life.viewW * scale) / 2, dy: (h - life.viewH * scale) / 2 };
  render();
}

function render() {
  const { viewW, viewH, W, margin, cells, age } = life;
  const data = imageData.data, bg = colors[0];
  const fresh = $('mode').value === 'classic' ? 0.25 : 0.35;
  for (let y = 0, k = 0, p = 0; y < viewH; y++) {
    const row = (y + margin) * W + margin;
    for (let x = 0; x < viewW; x++, k++, p += 4) {
      const j = row + x, v = cells[j];
      let r, g, b;
      if (v) {
        const col = colors[lensMap[v]];
        ghost[k] = lensMap[v];
        if (age[j] === 0) {
          r = col[0] + (255 - col[0]) * fresh; g = col[1] + (255 - col[1]) * fresh; b = col[2] + (255 - col[2]) * fresh;
        } else { r = col[0]; g = col[1]; b = col[2]; }
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
  ctx.globalCompositeOperation = 'source-over'; ctx.globalAlpha = 1;
  ctx.fillStyle = `rgb(${bg.join(',')})`;
  ctx.fillRect(0, 0, view.width, view.height);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(grid, dx, dy, dw, dh);
  if (scale >= 5) {
    // Faint cell gutters at high zoom, so cells read as tiles.
    ctx.globalAlpha = 0.28; ctx.fillStyle = `rgb(${bg.join(',')})`;
    const gw = Math.max(1, scale * 0.08);
    for (let x = 0; x <= viewW; x++) ctx.fillRect(dx + x * scale - gw / 2, dy, gw, dh);
    for (let y = 0; y <= viewH; y++) ctx.fillRect(dx, dy + y * scale - gw / 2, dw, gw);
    ctx.globalAlpha = 1;
  }
  const glow = Number($('glow').value) / 100;
  if (glow > 0 && PALETTES[$('palette').value] !== PALETTES.paper) {
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

function updateHud(force = false) {
  const now = performance.now();
  if (!force && now - lastHud < 150) return;
  lastHud = now;
  $('generation').textContent = life.generation.toLocaleString();
  const census = life.census();
  const total = census[1] + census[2] + census[3];
  const spans = $('census').children;
  const classic = $('mode').value === 'classic';
  for (let k = 0; k < 3; k++) spans[k].style.width = total ? `${(100 * census[k + 1]) / total}%` : '0';
  $('censusText').textContent = classic
    ? `${total.toLocaleString()} alive`
    : `a ${census[1].toLocaleString()} · b ${census[2].toLocaleString()} · c ${census[3].toLocaleString()}`;
  $('timelineFill').style.width = story ? `${Math.min(100, (100 * life.generation) / story.end)}%` : '0';
}

function frame(time) {
  const dt = Math.min(0.1, (time - lastTime) / 1000 || 0);
  lastTime = time;
  if (running) {
    accumulator += dt * Number($('speed').value);
    let steps = 0;
    while (accumulator >= 1 && steps < 8) { step(); accumulator -= 1; steps++; }
    if (steps === 8) accumulator = 0;
    if (steps) { render(); updateHud(); }
  }
  requestAnimationFrame(frame);
}

// ── interaction ─────────────────────────────────────────────────────────────
function setRunning(value) {
  running = value; accumulator = 0;
  $('playBtn').textContent = running ? 'Pause' : 'Play';
}
function forceClassic() {
  storyTools(life).recolor(() => A);
  life.mutation = 0;
}

function cellAt(event) {
  const rect = view.getBoundingClientRect();
  const dpr = view.width / rect.width;
  const x = Math.floor(((event.clientX - rect.left) * dpr - layout.dx) / layout.scale);
  const y = Math.floor(((event.clientY - rect.top) * dpr - layout.dy) / layout.scale);
  return [x, y];
}
function ink() {
  const v = Number($('brushColor').value);
  if ($('mode').value === 'classic') return v === 0 ? 0 : A;
  return v === -1 ? 1 + Math.floor(Math.random() * 3) : v;
}
function paintAt(x, y) {
  const r = Math.max(1, Math.round(life.viewW / 200));
  for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
    if (dx * dx + dy * dy > r * r + 0.5) continue;
    if (Number($('brushColor').value) !== 0 && Math.random() < 0.35) continue; // leave the brush a little ragged
    life.set(x + dx, y + dy, ink());
  }
}
function paintLine([x0, y0], [x1, y1]) {
  const n = Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0), 1);
  for (let i = 0; i <= n; i++) paintAt(Math.round(x0 + ((x1 - x0) * i) / n), Math.round(y0 + ((y1 - y0) * i) / n));
}
function stampAt(x, y) {
  const cells = transform(PATTERNS[$('stamp').value], stampRot);
  const { w, h } = bounds(cells);
  const color = ink() || A;
  for (const [cx, cy] of cells) life.set(x - Math.floor(w / 2) + cx, y - Math.floor(h / 2) + cy, color);
}

view.addEventListener('pointerdown', e => {
  view.focus();
  const cell = cellAt(e);
  if ($('stamp').value) { stampAt(...cell); render(); updateHud(true); return; }
  painting = true; lastCell = cell; view.setPointerCapture(e.pointerId);
  paintAt(...cell); render();
});
view.addEventListener('pointermove', e => {
  if (!painting) return;
  const cell = cellAt(e);
  paintLine(lastCell, cell); lastCell = cell; render();
});
const endPaint = () => { painting = false; lastCell = null; updateHud(true); };
view.addEventListener('pointerup', endPaint);
view.addEventListener('pointercancel', endPaint);

$('playBtn').addEventListener('click', () => setRunning(!running));
$('stepBtn').addEventListener('click', () => { setRunning(false); step(); render(); updateHud(true); });
$('restartBtn').addEventListener('click', () => loadStory($('story').value));
$('story').addEventListener('change', () => loadStory($('story').value));
$('resolution').addEventListener('change', () => loadStory($('story').value));
$('speed').addEventListener('input', () => { $('speedOut').value = `${$('speed').value} gen/s`; });
$('captions').addEventListener('change', () => { if (!$('captions').checked) hideCaption(); });
$('rule').addEventListener('change', () => { life.setRule($('rule').value); syncRule(life.ruleText); });
$('law').addEventListener('change', () => { life.setLaw($('law').value); syncLaw(); });
$('mutation').addEventListener('input', () => syncMutation(Number($('mutation').value) / 10000));
$('bite').addEventListener('input', () => syncBite(Number($('bite').value) / 100));
$('boundary').addEventListener('change', () => {
  // Rebuild the field with the new topology, carrying the visible cells across.
  const old = life, law = { birth: old.birthLaw, survive: old.surviveLaw, cancel: old.cancel };
  life = new Life({ width: old.viewW, height: old.viewH, boundary: $('boundary').value, rule: old.ruleText, law, seed: 1 });
  life.generation = old.generation; life.mutation = old.mutation; life.setBite(old.bite);
  for (let y = 0; y < old.viewH; y++) for (let x = 0; x < old.viewW; x++) life.set(x, y, old.get(x, y));
  render();
});
$('mode').addEventListener('change', () => {
  const classic = $('mode').value === 'classic';
  app.classList.toggle('classic', classic);
  if (classic) forceClassic(); else life.mutation = Number($('mutation').value) / 10000;
  refreshPalette(); render(); updateHud(true);
});
for (const id of ['palette', 'lens']) $(id).addEventListener('change', () => { refreshPalette(); render(); });
$('trail').addEventListener('input', () => { refreshTrail(); render(); });
$('glow').addEventListener('input', () => { $('glowOut').value = $('glow').value; render(); });
$('rotateBtn').addEventListener('click', () => { stampRot = (stampRot + 1) % 4; });
$('soupBtn').addEventListener('click', () => {
  storyTools(life).soup(0, 0, 1, 1, 0.25, $('mode').value === 'classic' ? [A] : [A, B, C]); render(); updateHud(true);
});
$('clearBtn').addEventListener('click', () => { life.clear(); ghost.fill(0); render(); updateHud(true); });

function toggleFocus() {
  const focus = app.classList.toggle('focus');
  $('restoreBtn').hidden = !focus;
  resize();
}
$('restoreBtn').addEventListener('click', toggleFocus);

addEventListener('keydown', e => {
  if (e.target.closest?.('input, select, textarea') || e.metaKey || e.ctrlKey || e.altKey) return;
  const key = e.key.toLowerCase();
  if (key === ' ') { e.preventDefault(); setRunning(!running); }
  else if (key === 'n') { setRunning(false); step(); render(); updateHud(true); }
  else if (key === 'r') loadStory($('story').value);
  else if (key === 's') loadStory(STORIES[(storyIndex + (story ? 1 : 0)) % STORIES.length].id);
  else if (key === 'h') toggleFocus();
  else if (key === 't') stampRot = (stampRot + 1) % 4;
});
addEventListener('resize', resize);

// ── boot ─────────────────────────────────────────────────────────────────────
refreshPalette(); refreshTrail();
setRunning(running);
const params = new URLSearchParams(location.search);
loadStory(params.get('story') || STORIES[0].id);
requestAnimationFrame(frame);
// Console hook: gameOfLife.advance(500) jumps ahead, running any story beats on the way.
window.gameOfLife = { get life() { return life; }, loadStory, STORIES, advance(n = 1) { for (let i = 0; i < n; i++) step(); render(); updateHud(true); } };
