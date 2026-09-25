// main.js — controller for the Indra's Pearls figures.
import { createFig121 } from './fig121.js';
import { grandma, orbitDisks } from './kleinian.js';
import { THEMES, SCHEMES, buildLut, cyclicRamp, rainbowRamp } from './palette.js';

const $ = (id) => document.getElementById(id);
const view = $('view');
const info = $('info');
const statusEl = $('status');

const CAPTIONS = {
  '10.10': `<b>Figure 10.10. A big double cusp.</b> Grandma's recipe with the traces
    of the central generator pair of the 987/1597 double cusp group,
    t<sub>u</sub> ≈ 1.50135 − 0.86539i, t<sub>v</sub> ≈ 1.50135 + 0.86539i.
    The 21/34 and −34/21 words are cusps; their circle chains are teal and pink.
    The a, b, A and B parts of the limit set are pale red, blue, green and yellow.
    It is within a few thousandths of the doubly degenerate group of Fig 10.13.`,
  '10.13': `<b>Figure 10.13. Partition of the world.</b> The limit set of Jørgensen's
    doubly-degenerate group, t<sub>a</sub> = (3−√3i)/2, t<sub>b</sub> = (3+√3i)/2,
    with limit points coloured red, blue, green and yellow according to the
    <i>third</i> generator (a, b, A, B) of their infinite word. The limit set is
    the whole sphere; the white disks are the unresolved neighbourhoods of cusps.`,
  '12.1': `<b>Figure 12.1. A picture Klein and Poincaré would have envied.</b>
    The quasifuchsian group of Grandma's recipe with Tr a = Tr b = 2.2. The plane
    is coloured by the argument of the automorphic function
    Σ(az+b)/(cz+d)⁵ / Σ(cz+d)⁻⁴ — a <i>fonction kleinéenne</i> — so the colouring
    tiles the ordinary set. Let the traces drift to watch it move.`,
};

// ---- slider readouts ----------------------------------------------------------
const FORMAT = {
  minNorm: (v) => (+v === 0 ? 'off' : `10^${(+v).toFixed(2).replace(/\.?0+$/, '')}`),
  terms: (v) => `${(v / 1000).toFixed(1)}k`,
  quality: (v) => `${Math.round(v * 100)}%`,
  finest: (v) => `${v}`,
};
for (const input of document.querySelectorAll('input[type=range]')) {
  const out = input.nextElementSibling;
  const show = () => { out.textContent = (FORMAT[input.id] || ((v) => (+v).toString()))(input.value); };
  input.addEventListener('input', show);
  show();
}
const num = (id) => parseFloat($(id).value);

// =================================================================================
// Figures 10.10 and 10.13 — progressive limit-set renders on a worker pool
// =================================================================================
const X = [1.5, -Math.sqrt(3) / 2], XB = [1.5, Math.sqrt(3) / 2];
const LIMIT_FIGS = {
  '10.13': {
    ta: X, tb: XB, root: -1, home: { center: [0.1, 0], zoom: 1.5 },
    defaults: { scheme: 'l3', fill: 0, spikes: 32 },
  },
  // The central pair (w₂₁/₃₄, w₁₃/₂₁) of the 987/1597 double cusp group (p. 332).
  '10.10': {
    ta: [1.501347474086, -0.865385203320], tb: [1.501347474169, 0.865385203218],
    root: 1, home: { center: [0, 0], zoom: 1.5 },
    // The ordinary set is drawn exactly (as the orbit of the chain disks), so
    // the limit set is flood-filled solid, pale, and without fringes.
    defaults: { scheme: 'l1', fill: 4, spikes: 0 }, soften: 0.55,
    chains: [
      { p: 21, q: 34, X: 'a', Y: 'B' }, // the 21/34 cusp
      { p: 21, q: 34, X: 'b', Y: 'a' }, // the −34/21 cusp
    ],
  },
};
const views = Object.fromEntries(Object.entries(LIMIT_FIGS).map(([k, f]) => [k, { ...f.home, center: [...f.home.center] }]));
const diskCache = {}; // `${figure}:${root}` → disks per chain

for (const sc of SCHEMES) $('scheme').add(new Option(sc.label, sc.id));
for (const [id, th] of Object.entries(THEMES)) $('palette').add(new Option(th.label, id));
$('palette').value = 'tidepool';

// Every reduced word starts with one of these 4·3·3·3 = 108 prefixes; their
// subtrees are walked independently, several at a time. The work is very
// uneven — subtrees spiralling into cusps can hold most of it — so whenever a
// worker is idle with nothing queued, the longest-running one is asked to
// donate its pending sibling subtrees.
const PREFIXES = [];
for (let a = 0; a < 4; a++) {
  for (const b of [(a + 1) % 4, a, (a + 3) % 4]) {
    for (const c of [(b + 1) % 4, b, (b + 3) % 4]) {
      for (const d of [(c + 1) % 4, c, (c + 3) % 4]) PREFIXES.push([a, b, c, d]);
    }
  }
}
// Scaling is linear to about 8 threads and flat or worse beyond (measured on a
// 10P+4E M4 Pro), so the pool stops there.
const POOL = Math.max(1, Math.min(8, (navigator.hardwareConcurrency || 4) - 2));
const workers = Array.from({ length: POOL }, (_, i) => {
  const w = new Worker(new URL('./limitWorker.js', import.meta.url), { type: 'module' });
  w.onmessage = (e) => onWorkerMessage(i, e.data);
  return w;
});
const free = new Set(workers.keys());

const cLimit = $('canvas1013');
const ctxLimit = cLimit.getContext('2d');
let jobId = 0, job = null, imageData = null, colours = null;

/** Spread labels to unreached pixels within `radius` (8-neighbour BFS). */
function flood(lab, W, H, radius) {
  let q = [];
  for (let i = 0; i < W * H; i++) if (lab[i]) q.push(i);
  const seen = new Uint8Array(W * H);
  for (const i of q) seen[i] = 1;
  for (let d = 0; d < radius && q.length; d++) {
    const nq = [];
    for (const i of q) {
      const x = i % W, y = (i / W) | 0;
      for (let dy = -1; dy <= 1; dy++) {
        const Y = y + dy;
        if (Y < 0 || Y >= H) continue;
        for (let dx = -1; dx <= 1; dx++) {
          const Xx = x + dx;
          if (Xx < 0 || Xx >= W) continue;
          const j = Y * W + Xx;
          if (!seen[j]) { seen[j] = 1; lab[j] = lab[i]; nq.push(j); }
        }
      }
    }
    q = nq;
  }
}

function updateColours() {
  const fig = LIMIT_FIGS[figure];
  colours = buildLut($('scheme').value, $('palette').value, fig ? fig.soften || 0 : 0);
  document.body.style.background = fig ? THEMES[$('palette').value].bg : '#000';
}

function drawDisks() {
  const disks = job && diskCache[job.key];
  if (!disks || !$('showChains').checked) return;
  const { W, H, center, half } = job;
  const sx = W / (2 * half[0]), sy = H / (2 * half[1]);
  if (!job.orbit) {
    // Every other component of the ordinary set, down to half a pixel.
    const { gens } = grandma(job.fig.ta, job.fig.tb, job.root);
    const seeds = disks.flat().filter((d) => !d[3]).map((d) => d.slice(0, 3));
    job.orbit = orbitDisks(gens, seeds, { minR: 0.5 / sx, center, bound: 3 * Math.hypot(half[0], half[1]) });
  }
  ctxLimit.fillStyle = THEMES[$('palette').value].bg;
  ctxLimit.beginPath();
  for (const [cx, cy, r] of job.orbit) {
    const x = (cx - center[0] + half[0]) * sx, y = (center[1] + half[1] - cy) * sy, R = r * sx;
    if (x + R < 0 || y + R < 0 || x - R > W || y - R > H) continue;
    ctxLimit.moveTo(x + R, y);
    ctxLimit.arc(x, y, R, 0, 2 * Math.PI);
  }
  ctxLimit.fill();
  disks.forEach((chain, k) => {
    ctxLimit.fillStyle = colours.chains[k];
    for (const [cx, cy, r, exterior] of chain) {
      ctxLimit.beginPath();
      if (exterior) ctxLimit.rect(0, 0, W, H);
      ctxLimit.arc((cx - center[0] + half[0]) * sx, (center[1] + half[1] - cy) * sy, r * sx, 0, 2 * Math.PI);
      ctxLimit.fill('evenodd');
    }
  });
}

/** Paint the current pass over the previous pass's result. */
function paint() {
  if (!job) return;
  const px = imageData.data, { lut } = colours, { cur, base } = job;
  for (let i = 0, o = 0; i < cur.length; i++, o += 4) {
    const c = lut[cur[i] || base[i]];
    px[o] = c[0]; px[o + 1] = c[1]; px[o + 2] = c[2]; px[o + 3] = 255;
  }
  ctxLimit.putImageData(imageData, 0, 0);
  drawDisks();
}
let paintQueued = false;
const queuePaint = () => {
  if (paintQueued) return;
  paintQueued = true;
  requestAnimationFrame(() => { paintQueued = false; paint(); });
};

function showStatus() {
  const n = job.leaves, leaves = n > 1e6 ? `${(n / 1e6).toFixed(1)}M` : `${Math.round(n / 1e3)}k`;
  const secs = ((performance.now() - job.t0) / 1000).toFixed(1);
  const chains = job.fig.chains && !diskCache[job.key] ? ' · finding circle chains…' : '';
  statusEl.textContent = job.done
    ? `done · ${leaves} leaves · ${secs} s · ${POOL} threads${chains}`
    : `pass ${job.pass + 1}/${job.passes.length} · ${job.queue.length + job.running} subtrees left · ${secs} s`;
}

function dispatch() {
  if (!job) return;
  for (const i of [...free]) {
    if (job.needChains) {
      job.needChains = false;
      free.delete(i);
      workers[i].postMessage({ type: 'chains', job: job.id, ta: job.fig.ta, tb: job.fig.tb, root: job.root, chains: job.fig.chains });
      continue;
    }
    if (!job.queue.length) break;
    free.delete(i);
    job.running++;
    job.busySince.set(i, performance.now());
    const prefix = job.queue.shift();
    workers[i].postMessage({ type: 'task', job: job.id, prefix, px: job.passes[job.pass], ...job.params });
  }
  if (free.size && !job.queue.length) {
    // Idle threads and nothing queued: ask every busy worker to share.
    for (const i of job.busySince.keys()) {
      if (job.asked.has(i)) continue;
      job.asked.add(i);
      workers[i].postMessage({ type: 'split' });
    }
  }
}

function onWorkerMessage(i, m) {
  if (m.type === 'chains') {
    if (job && m.job === job.id) { diskCache[job.key] = m.disks; queuePaint(); showStatus(); }
  }
  if (!job || m.job !== job.id) return; // stale: the worker was freed on restart
  if (m.type === 'donate') {
    job.asked.delete(i);
    job.queue.push(...m.prefixes);
    dispatch();
    return;
  }
  free.add(i);
  job.busySince.delete(i);
  // A split request that crossed with this task's completion goes unanswered.
  job.asked.delete(i);
  if (m.type === 'task') {
    job.running--;
    job.leaves += m.leaves;
    const { cur } = job, { idx, val } = m;
    for (let k = 0; k < idx.length; k++) cur[idx[k]] = val[k];
    if (!job.queue.length && !job.running) {
      // Pass complete: fill gaps at this resolution and refine.
      flood(cur, job.W, job.H, Math.ceil(job.passes[job.pass] * num('fill')));
      job.base = cur;
      if (job.pass + 1 < job.passes.length) {
        job.pass++;
        job.cur = new Uint8Array(job.W * job.H);
        job.queue = PREFIXES.slice();
      } else {
        job.done = true;
        job.cur = new Uint8Array(job.W * job.H);
      }
    }
    queuePaint();
    showStatus();
  }
  dispatch();
}

function halfExtent(w, h, zoom) {
  return w >= h ? [zoom * (w / h), zoom] : [zoom, zoom * (h / w)];
}

function startLimit() {
  const fig = LIMIT_FIGS[figure], v = views[figure];
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  // Cap the pixel count: the finest pass costs roughly ∝ pixels.
  const s = Math.min(dpr, Math.sqrt(1.4e6 / (innerWidth * innerHeight)));
  const W = Math.max(64, Math.round(innerWidth * s)), H = Math.max(64, Math.round(innerHeight * s));
  if (cLimit.width !== W || cLimit.height !== H) { cLimit.width = W; cLimit.height = H; }
  imageData = ctxLimit.createImageData(W, H);
  const root = $('mirror').checked ? -fig.root : fig.root;
  const key = `${figure}:${root}`;
  // Abandon the previous job; its workers are free as soon as they yield.
  for (const w of workers) w.postMessage({ type: 'cancel', below: jobId + 1 });
  for (const i of workers.keys()) free.add(i);
  const center = [...v.center], half = halfExtent(W, H, v.zoom);
  job = {
    id: ++jobId, fig, key, root, W, H, center, half, t0: performance.now(), leaves: 0,
    passes: [8, 4, 2, 1].filter((p) => p >= num('finest')), pass: 0, running: 0, done: false,
    queue: PREFIXES.slice(), cur: new Uint8Array(W * H), base: new Uint8Array(W * H),
    busySince: new Map(), asked: new Set(),
    needChains: !!fig.chains && !diskCache[key],
    params: {
      W, H, center, half, maxLevel: num('maxLevel'),
      minNorm: num('minNorm') === 0 ? 0 : 10 ** num('minNorm'),
      scheme: $('scheme').value, spikes: num('spikes') * s,
      ta: fig.ta, tb: fig.tb, root,
    },
  };
  updateColours();
  dispatch();
  showStatus();
}
let restartTimer = 0;
const restartLimit = (delay = 150) => { clearTimeout(restartTimer); restartTimer = setTimeout(startLimit, delay); };
for (const id of ['scheme', 'finest', 'maxLevel', 'minNorm', 'fill', 'spikes', 'mirror', 'showChains']) $(id).addEventListener('change', () => restartLimit(0));
// A new palette only recolours the labels already computed.
$('palette').addEventListener('change', () => {
  if (LIMIT_FIGS[figure]) { updateColours(); paint(); } else { fig121?.setLut(rampFor121()); dirty = true; }
});
$('reset1013').addEventListener('click', () => {
  const h = LIMIT_FIGS[figure].home;
  views[figure] = { ...h, center: [...h.center] };
  startLimit();
});

// ---- figure switching -----------------------------------------------------------
const requested = new URLSearchParams(location.search).get('fig');
let figure = CAPTIONS[requested] ? requested : '10.13';
$('figure').value = figure;
$('figure').addEventListener('change', () => setFigure($('figure').value));

function setFigure(f) {
  figure = f;
  const limit = !!LIMIT_FIGS[f];
  $('caption').innerHTML = CAPTIONS[f];
  $('controls1013').hidden = !limit;
  $('controls121').hidden = limit;
  $('chainsRow').hidden = !(limit && LIMIT_FIGS[f].chains);
  cLimit.classList.toggle('active', limit);
  $('canvas121').classList.toggle('active', !limit);
  $('overlay121').classList.toggle('active', !limit);
  if (limit) {
    for (const [id, v] of Object.entries(LIMIT_FIGS[f].defaults)) { $(id).value = v; $(id).dispatchEvent(new Event('input')); }
    stopLoop();
    startLimit();
  } else {
    job = null;
    for (const w of workers) w.postMessage({ type: 'cancel', below: jobId + 1 });
    for (const i of workers.keys()) free.add(i);
    updateColours();
    fig121?.setLut(rampFor121());
    startLoop();
  }
}

// =================================================================================
// Figure 12.1 — live automorphic function
// =================================================================================
const c121 = $('canvas121'), o121 = $('overlay121');
let fig121 = null;
try { fig121 = createFig121(c121, o121); } catch (err) { console.error(err); }
/** Fig 12.1 colours arg f around a cyclic ramp: the book's rainbow or a theme's. */
const rampFor121 = () => ($('palette').value === 'book' ? rainbowRamp() : cyclicRamp(THEMES[$('palette').value]));
const HOME_121 = { center: [0, 0], zoom: 1.12 };
const v121 = { ...HOME_121, center: [...HOME_121.center] };
let t = 0, phase = 0, lastFrame = 0, raf = 0, dirty = true, refined = false, idleSince = 0;
// Adaptive resolution while animating: shrinks when frames run slow.
let autoScale = 1, frameMs = 16;

// `scale` is GL pixels per CSS pixel: < 1 while animating, the device pixel
// ratio for the still repaint. The limit-set overlay is always at full res.
function resize121(scale) {
  const dpr = Math.min(window.devicePixelRatio || 1, 2);
  const W = Math.max(32, Math.round(innerWidth * scale)), H = Math.max(32, Math.round(innerHeight * scale));
  if (c121.width !== W || c121.height !== H) { c121.width = W; c121.height = H; }
  const OW = Math.round(innerWidth * dpr), OH = Math.round(innerHeight * dpr);
  if (o121.width !== OW || o121.height !== OH) { o121.width = OW; o121.height = OH; }
}

/** Traces at time t: a slow Lissajous wander about the slider values. */
function traces() {
  const ta0 = [num('taRe'), num('taIm')];
  const tb0 = $('lockAB').checked ? ta0 : [num('tbRe'), num('tbIm')];
  if (!$('drift').checked) return [ta0, tb0];
  const A = num('driftAmp');
  const ta = [ta0[0] + A * (0.8 * Math.cos(t) + 0.2 * Math.cos(2.3 * t + 1)), ta0[1] + A * Math.sin(1.37 * t)];
  const tb = $('lockAB').checked
    ? ta
    : [tb0[0] + A * (0.8 * Math.sin(0.83 * t + 2) + 0.2 * Math.cos(1.9 * t)), tb0[1] + A * Math.cos(1.11 * t + 0.5)];
  return [ta, tb];
}

const fmtC = (z) => `${z[0].toFixed(3)}${z[1] < 0 ? '−' : '+'}${Math.abs(z[1]).toFixed(3)}i`;

function frame(now) {
  raf = requestAnimationFrame(frame);
  const dt = Math.min(0.1, (now - (lastFrame || now)) / 1000);
  lastFrame = now;
  frameMs = 0.8 * frameMs + 0.2 * dt * 1000;
  const drifting = $('drift').checked && num('driftSpeed') > 0 && num('driftAmp') > 0;
  const spinning = num('hueSpin') > 0;
  if (drifting) t += dt * num('driftSpeed');
  if (spinning) phase = (phase + dt * num('hueSpin')) % 1;
  const animating = drifting || spinning;
  if (!animating && !dirty) {
    // Once still, repaint once at full resolution with a longer series.
    if (!refined && now - idleSince > 250) {
      refined = true;
      render121(Math.min(window.devicePixelRatio || 1, 2), Math.min(20000, num('terms') * 2.5), 800000);
    }
    return;
  }
  if (document.visibilityState === 'visible') {
    if (frameMs > 40) autoScale = Math.max(0.35, autoScale * 0.92);
    else if (frameMs < 24) autoScale = Math.min(1, autoScale * 1.03);
  }
  dirty = false;
  refined = false;
  idleSince = now;
  render121(num('quality') * autoScale, num('terms'), 150000);
}

function render121(scale, terms, limitBudget) {
  if (!fig121) { statusEl.textContent = 'WebGL2 unavailable'; return; }
  resize121(scale);
  const [ta, tb] = traces();
  const r = fig121.render({
    ta, tb, root: -1, terms, cycles: num('cycles'), phase, bands: num('bands'), pow: num('pow'),
    center: v121.center, zoom: v121.zoom,
    showLimit: $('showLimit').checked, limitWidth: 1.1, limitBudget,
  });
  statusEl.innerHTML = `t<sub>a</sub> = ${fmtC(ta)} · t<sub>b</sub> = ${fmtC(tb)}<br>` +
    `t<sub>ab</sub> = ${fmtC(r.tab)} · ${r.terms} terms${r.saturated ? ' · <span style="color:#ff8a7a">not discrete?</span>' : ''}`;
}

function startLoop() { if (!raf) { lastFrame = 0; dirty = true; raf = requestAnimationFrame(frame); } }
function stopLoop() { cancelAnimationFrame(raf); raf = 0; }
const touch121 = () => { dirty = true; };
for (const el of $('controls121').querySelectorAll('input, select')) el.addEventListener('input', touch121);
$('reset121').addEventListener('click', () => {
  for (const [id, v] of Object.entries({ taRe: 2.2, taIm: 0, tbRe: 2.2, tbIm: 0 })) {
    $(id).value = v; $(id).dispatchEvent(new Event('input'));
  }
  v121.center = [...HOME_121.center]; v121.zoom = HOME_121.zoom;
  t = 0; dirty = true;
});

// ---- pan & zoom (shared) ---------------------------------------------------------
const active = () => (LIMIT_FIGS[figure] ? views[figure] : v121);
const afterViewChange = () => { if (LIMIT_FIGS[figure]) restartLimit(250); else dirty = true; };
function worldPerPixel() {
  const v = active();
  return (2 * halfExtent(innerWidth, innerHeight, v.zoom)[0]) / innerWidth;
}
let drag = null;
view.addEventListener('pointerdown', (e) => {
  drag = { x: e.clientX, y: e.clientY, c: [...active().center] };
  view.setPointerCapture(e.pointerId);
  view.classList.add('dragging');
});
view.addEventListener('pointermove', (e) => {
  if (!drag) return;
  const k = worldPerPixel();
  active().center = [drag.c[0] - (e.clientX - drag.x) * k, drag.c[1] + (e.clientY - drag.y) * k];
  if (LIMIT_FIGS[figure]) {
    // Preview the pan by sliding the current image until the re-render lands.
    cLimit.style.transform = `translate(${e.clientX - drag.x}px, ${e.clientY - drag.y}px)`;
  } else dirty = true;
});
const endDrag = () => {
  if (!drag) return;
  drag = null;
  view.classList.remove('dragging');
  cLimit.style.transform = '';
  afterViewChange();
};
view.addEventListener('pointerup', endDrag);
view.addEventListener('pointercancel', endDrag);
view.addEventListener('wheel', (e) => {
  e.preventDefault();
  const v = active();
  const k = worldPerPixel();
  const mx = v.center[0] + (e.clientX - innerWidth / 2) * k;
  const my = v.center[1] - (e.clientY - innerHeight / 2) * k;
  const f = Math.exp(e.deltaY * 0.0015);
  v.zoom *= f;
  v.center = [mx + (v.center[0] - mx) * f, my + (v.center[1] - my) * f];
  afterViewChange();
}, { passive: false });

// ---- keys & resize -------------------------------------------------------------------
addEventListener('keydown', (e) => {
  if (e.target.matches('input, select, textarea')) return;
  if (e.key === 'h') info.classList.toggle('hidden');
  if (e.key === ' ' && figure === '12.1') {
    e.preventDefault();
    $('drift').checked = !$('drift').checked;
    $('drift').dispatchEvent(new Event('input'));
  }
});
addEventListener('resize', () => { if (LIMIT_FIGS[figure]) restartLimit(300); else dirty = true; });

setFigure(figure);
