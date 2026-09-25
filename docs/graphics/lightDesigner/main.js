// main.js — wires the console panel, keyboard, MIDI and microphone to the engine and renderer.

import { Engine, TARGETS, KIN_SHAPES, FLIP_MODES, hexHS } from './engine.js';
import { SHOWS, K } from './shows.js';
import { SCENES, DEVICE_BASE } from './scenes.js';
import { groupLabels, POD_COUNT, PER_POD, FLOOR_COUNT } from './layout.js';
import { setupMidi } from './midi.js';
import { Lasers, PATTERNS, LASER_COLORS } from './lasers.js';
import { Devices, TUBE_LAYOUTS, TUBE_LOOKS, DEVICE_COLORS, HIT_MODES, LIQUID_PALETTES } from './devices.js';
import { Venue, VENUES } from './venue.js';
import { Ambience, HOUSE_EFFECTS, HOUSE_COLORS, FAIRY_LAYOUTS, FAIRY_COLORS, FAIRY_EFFECTS } from './ambient.js';

const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const status = $('#status');
const store = {
  get(k, d) { try { const v = localStorage.getItem(`ck5.${k}`); return v ? JSON.parse(v) : d; } catch { return d; } },
  set(k, v) { try { localStorage.setItem(`ck5.${k}`, JSON.stringify(v)); } catch { /* private mode */ } },
};
const fmtTime = (s) => { s = Math.max(0, Math.floor(s)); return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`; };
const on = (el, ev, fn) => (typeof el === 'string' ? $(el) : el).addEventListener(ev, fn);

let Rig, CAMERAS;
try {
  ({ Rig, CAMERAS } = await import('./rig.js'));
} catch (err) {
  status.textContent = 'Could not load three.js — check your connection.';
  throw err;
}

const engine = new Engine();
engine.setShows(SHOWS);
let rig;
try {
  rig = new Rig($('#canvasHost'), engine);
} catch (err) {
  status.textContent = 'WebGL 2 is required for the rig.';
  throw err;
}
const canvas = rig.canvas;
canvas.dataset.fixtures = engine.N;
const view = { drift: true, autoCam: false, bloom: 0.85, hazeTexture: 0.75 };
const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
let GROUP_LABELS = groupLabels(engine.rig.unit);

// ——— range outputs ———
const FORMAT = {
  fadeScale: (v) => `×${(+v).toFixed(2)}`, speedMaster: (v) => `×${(+v).toFixed(2)}`, strobeRate: (v) => `${(1.5 + v * 18).toFixed(1)} Hz`,
  pHue: (v) => `${Math.round(v)}°`, pPan: (v) => `${(+v).toFixed(1)}°`, pTilt: (v) => `${(+v).toFixed(1)}°`, pZoom: (v) => `${(+v).toFixed(1)}°`,
  fxRate: (v) => `${v} b`, fxSpread: (v) => `${v}°`, kinHeight: (v) => `${(+v).toFixed(1)}`, kinAmp: (v) => `${(+v).toFixed(2)}`,
  kinPeriod: (v) => `${v} b`, hoistSpeed: (v) => `${(+v).toFixed(2)}`, motorSpeed: (v) => `${(+v).toFixed(2)}`,
  cueFade: (v) => `${(+v).toFixed(1)}`, cueHold: (v) => `${v}`,
  ballSpin: (v) => `${(+v).toFixed(1)}`, ballRays: (v) => `${v}`, strobeRateX: (v) => `${v} Hz`, tubeSpeed: (v) => `×${(+v).toFixed(2)}`, liquidSpeed: (v) => `×${(+v).toFixed(2)}`,
  houseLevel: (v) => `${Math.round(v * 100)}%`, houseFade: (v) => `${v} s`, houseSpeed: (v) => `×${(+v).toFixed(2)}`, fairySpeed: (v) => `×${(+v).toFixed(2)}`, fairyDensity: (v) => `${v}/m`,
  laserCount: (v) => `${v}`, laserSpread: (v) => `${v}°`, laserSpeed: (v) => `${v} b`, laserHeight: (v) => `${v}°`,
  sceneFade: (v) => `${(+v).toFixed(1)} s`,
  midiRelease: (v) => `${(+v).toFixed(2)} s`, midiKick: (v) => `${v}°`, midiLift: (v) => `${(+v).toFixed(2)} m`,
};
// live-effect size is normalised 0–1 in the UI and scaled per attribute
const SIZE_SCALE = { dim: 1, strobe: 1, frost: 1, pan: 90, tilt: 60, circle: 40, ballyhoo: 60, hue: 180, zoom: 30 };
const SIZE_UNIT = { pan: '°', tilt: '°', circle: '°', ballyhoo: '°', hue: '°', zoom: '°' };
function outputFor(input) {
  const lab = $(`label[for="${input.id}"]`);
  return lab?.querySelector('output') || input.closest('.fader')?.querySelector('output');
}
function refreshOutput(input) {
  const o = outputFor(input);
  if (!o || input.id === 'showPos') return;
  if (input.id === 'fxSize') { o.textContent = fxSizeLabel(); return; }
  const f = FORMAT[input.id];
  o.textContent = f ? f(input.value) : (+input.value).toFixed(2);
}
$$('input[type=range]').forEach((r) => { refreshOutput(r); on(r, 'input', () => refreshOutput(r)); });

// ——— tabs ———
function selectTab(name) {
  $$('.tabs button').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.tab === name)));
  $$('section.tab').forEach((s) => { s.hidden = s.dataset.tab !== name; });
  store.set('tab', name);
}
$$('.tabs button').forEach((b) => on(b, 'click', () => selectTab(b.dataset.tab)));
selectTab(store.get('tab', 'show'));

// ——— show playback ———
const showSelect = $('#showSelect');
showSelect.innerHTML = SHOWS.map((s) => `<option value="${s.id}">${s.name} · ${fmtTime(s.total)}</option>`).join('')
  + '<option value="">— Programmer only (no show) —</option><option value="scene" hidden>Scene</option>';
const setTotal = SHOWS.reduce((a, s) => a + s.total, 0);
showSelect.title = `Full set: ${fmtTime(setTotal)}`;

function loadShow(id, fade = 3) {
  engine.loadShow(id, fade);
  showSelect.value = id;
  const s = engine.show;
  $('#showBlurb').textContent = s ? `${s.blurb} (${s.sections.length} sections, ${fmtTime(s.total)}; full set ${fmtTime(setTotal)})` : 'No show running: only the programmer, live effects and cues drive the rig.';
  $('#bpm').value = engine.bpm;
  renderSections();
  $('#hudShow').textContent = s ? s.name : 'Programmer';
  $('#hudTotal').textContent = s ? fmtTime(s.total) : '—';
}
function renderSections() {
  const ol = $('#sectionList');
  const s = engine.show;
  ol.innerHTML = s && !s.scene ? s.sections.map((x, i) => `<li data-i="${i}"><span>${x.n}</span><span>${fmtTime(x.d)}</span><i></i></li>`).join('') : '';
  $$('li', ol).forEach((li) => on(li, 'click', () => engine.seek(s.sections[+li.dataset.i].start + 0.001, 2.5)));
}
on(showSelect, 'change', () => loadShow(showSelect.value));
on('#playMode', 'change', (e) => { engine.mode = e.target.value; });
engine.mode = $('#playMode').value;
engine.onShowEnd = () => {
  const s = engine.show;
  if (engine.mode === 'loop') engine.seek(0, 4);
  else if (engine.mode === 'hold') engine.showTime = s.total - 0.001;
  else {
    const i = SHOWS.indexOf(s);
    loadShow(SHOWS[(i + 1) % SHOWS.length].id, 5);
  }
};
function setPlaying(p) {
  engine.playing = p;
  $('#playBtn').textContent = p ? 'Pause' : 'Play';
}
on('#playBtn', 'click', () => setPlaying(!engine.playing));
on('#prevSection', 'click', () => engine.gotoSection(-1));
on('#nextSection', 'click', () => engine.gotoSection(1));
on('#restartShow', 'click', () => engine.seek(0, 2));
const showPos = $('#showPos');
let scrubbing = false;
on(showPos, 'pointerdown', () => { scrubbing = true; });
on(window, 'pointerup', () => { scrubbing = false; });
on(showPos, 'input', () => { if (engine.show) engine.seek(+showPos.value * engine.show.total, 1.5); });
on('#fadeScale', 'input', (e) => { engine.fadeScale = +e.target.value; });

// ——— masters ———
const bindRange = (id, fn) => { const el = $(`#${id}`); on(el, 'input', () => fn(+el.value)); fn(+el.value); };
bindRange('grandMaster', (v) => { engine.m.grand = v; });
bindRange('podMaster', (v) => { engine.m.pods = v; });
bindRange('floorMaster', (v) => { engine.m.floor = v; });
bindRange('hazeLevel', (v) => { engine.m.haze = v; });
bindRange('strobeRate', (v) => { engine.m.strobeRate = v; });
bindRange('speedMaster', (v) => { engine.speed = v; });
on('#blackoutToggle', 'change', (e) => { engine.m.blackout = e.target.checked; });
on('#bpm', 'change', (e) => { const v = +e.target.value; if (v >= 40 && v <= 220) engine.bpm = v; });

const holds = {
  flash: { el: $('#flashBtn'), set: (v) => { engine.m.flash = v ? 1 : 0; } },
  strobe: { el: $('#strobeBtn'), set: (v) => { engine.m.strobeHold = v; } },
};
for (const h of Object.values(holds)) {
  const start = (e) => { e?.preventDefault?.(); h.set(true); h.el.classList.add('active'); };
  const stop = () => { h.set(false); h.el.classList.remove('active'); };
  h.start = start; h.stop = stop;
  on(h.el, 'pointerdown', start);
  on(h.el, 'pointerup', stop);
  on(h.el, 'pointerleave', stop);
  // a remote "click" (no pointer) gives a short bump
  on(h.el, 'click', (e) => { if (e.detail === 0) { start(); setTimeout(stop, 350); } });
}

let taps = [];
function tap() {
  const t = performance.now() / 1000;
  if (taps.length && t - taps[taps.length - 1] > 2) taps = [];
  taps.push(t);
  taps = taps.slice(-6);
  engine.tap(taps);
  $('#bpm').value = engine.bpm;
  $('#tapBtn').classList.add('active');
  setTimeout(() => $('#tapBtn').classList.remove('active'), 90);
}
on('#tapBtn', 'click', tap);

// ——— view ———
const camSel = $('#cameraSelect');
camSel.innerHTML = Object.entries(CAMERAS).map(([k, c]) => `<option value="${k}">${c.label}</option>`).join('');
on(camSel, 'change', () => { rig.setCamera(camSel.value, 3); lastCut = engine.time; });
let lastCut = 0;
on('#autoCam', 'change', (e) => { view.autoCam = e.target.checked; lastCut = engine.time; });
on('#driftToggle', 'change', (e) => { view.drift = e.target.checked; });
bindRange('bloomLevel', (v) => { view.bloom = v; });
if (reduceMotion) { $('#driftToggle').checked = false; view.drift = false; }

// ——— programmer: selection ———
const F = engine.fixtures;
const progGroup = $('#progGroup');
progGroup.innerHTML = '<option value="">— none —</option>' + Object.entries(GROUP_LABELS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('') + '<option value="custom" hidden>Custom</option>';
const chips = $('#groupChips');
for (const k of ['all', 'pods', 'floor', 'p1', 'p2', 'p3', 'p4', 'p5', 'p6', 'odd', 'even', 'left', 'right', 'inner', 'outer']) {
  const b = document.createElement('button');
  b.type = 'button'; b.textContent = GROUP_LABELS[k]; b.dataset.g = k;
  on(b, 'click', (e) => selectGroup(k, e.shiftKey || e.metaKey || e.ctrlKey));
  chips.append(b);
}
function selectGroup(k, add = false) {
  if (!add) engine.selection.clear();
  if (k) for (const i of engine.group(k)) engine.selection.add(i);
  progGroup.value = add ? 'custom' : k;
  selectionChanged();
}
on(progGroup, 'change', () => { if (progGroup.value !== 'custom') selectGroup(progGroup.value); });

const map = $('#fixtureMap');
const dots = [];
for (let p = 0; p < POD_COUNT; p++) {
  const row = document.createElement('div');
  row.className = 'row pod';
  row.innerHTML = `<span data-unit="${p}">POD ${p + 1}</span><i></i>`;
  for (let s = 0; s < PER_POD; s++) { const b = document.createElement('b'); b.dataset.i = p * PER_POD + s; row.append(b); dots[p * PER_POD + s] = b; }
  row.append(document.createElement('i'));
  map.prepend(row); // front pod at the bottom, nearest the audience, like a plot
}
{
  const row = document.createElement('div');
  row.className = 'row';
  row.innerHTML = '<span>FLOOR</span>';
  const base = POD_COUNT * PER_POD;
  for (let s = 0; s < FLOOR_COUNT; s++) { const b = document.createElement('b'); b.dataset.i = base + s; row.append(b); dots[base + s] = b; }
  map.prepend(row); // floor units stand upstage: top of the plot
}
let anchor = null;
on(map, 'click', (e) => {
  const b = e.target.closest('b');
  if (!b) return;
  const i = +b.dataset.i;
  if (e.shiftKey && anchor !== null) {
    const [a, z] = [Math.min(anchor, i), Math.max(anchor, i)];
    for (let k = a; k <= z; k++) engine.selection.add(k);
  } else if (e.metaKey || e.ctrlKey) {
    engine.selection.has(i) ? engine.selection.delete(i) : engine.selection.add(i);
    anchor = i;
  } else {
    engine.selection.clear(); engine.selection.add(i); anchor = i;
  }
  progGroup.value = 'custom';
  selectionChanged();
});

// ——— programmer: attributes ———
const ATTR_INPUTS = { dim: '#pDim', hue: '#pHue', sat: '#pSat', pan: '#pPan', tilt: '#pTilt', zoom: '#pZoom', frost: '#pFrost', strobe: '#pStrobe' };
let syncingProg = false;
for (const [attr, sel] of Object.entries(ATTR_INPUTS)) {
  const el = $(sel);
  on(el, 'input', () => {
    if (syncingProg) return;
    if (!engine.selection.size) { flashHint('Select fixtures first (Program tab).'); return; }
    if (attr === 'hue' || attr === 'sat') { engine.progSet('hue', +$('#pHue').value); engine.progSet('sat', +$('#pSat').value); }
    else engine.progSet(attr, +el.value);
    if (attr === 'pan' || attr === 'tilt') { engine.progSet('pan', +$('#pPan').value); engine.progSet('tilt', +$('#pTilt').value); $('#pAim').value = ''; }
    markActive();
  });
  const box = el.closest('.attr');
  on(box.querySelector('label'), 'dblclick', () => {
    const attrs = attr === 'hue' || attr === 'sat' ? ['hue', 'sat'] : attr === 'pan' || attr === 'tilt' ? ['pan', 'tilt', 'aim'] : [attr];
    engine.progRelease(attrs); markActive();
  });
  box.querySelector('label').title = 'Double-click to release this attribute';
}
const swatchColors = [K.red, K.orange, K.amber, K.gold, K.warm, K.white, K.ice, K.cyan, K.teal, K.green, K.lime, K.blue, K.royal, K.uv, K.violet, K.magenta, K.pink, K.lav, '#ff7a40', '#7affd8'];
for (const c of swatchColors) {
  const b = document.createElement('button');
  b.type = 'button'; b.style.background = c; b.title = c; b.setAttribute('aria-label', `Colour ${c}`);
  on(b, 'click', () => {
    if (!engine.selection.size) { flashHint('Select fixtures first.'); return; }
    const [h, s] = hexHS(c);
    engine.progSet('hue', h); engine.progSet('sat', s);
    syncingProg = true; $('#pHue').value = h; $('#pSat').value = s; syncingProg = false;
    refreshOutput($('#pHue')); refreshOutput($('#pSat'));
    // colour on a dark fixture should be visible: bring unprogrammed intensity to full
    if (engine.prog.get([...engine.selection][0])?.dim === undefined) {
      engine.progSet('dim', 1);
      syncingProg = true; $('#pDim').value = 1; syncingProg = false; refreshOutput($('#pDim'));
    }
    markActive();
  });
  $('#swatches').append(b);
}
on('#pAim', 'change', (e) => {
  if (!e.target.value) return;
  if (!engine.selection.size) { flashHint('Select fixtures first.'); e.target.value = ''; return; }
  engine.progAim(e.target.value);
  markActive();
});
on('#pRelease', 'click', () => { engine.progRelease(); markActive(); });
on('#pClear', 'click', () => { engine.prog.clear(); markActive(); });
on('#highlightToggle', 'change', (e) => { engine.highlight = e.target.checked; });

function rgbToHS(r, g, b) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 1e-5) { if (mx === r) h = ((g - b) / d) % 6; else if (mx === g) h = (b - r) / d + 2; else h = (r - g) / d + 4; }
  return [(h * 60 + 360) % 360, mx > 0 ? d / mx : 0];
}
function selectionChanged() {
  const n = engine.selection.size;
  $('#selCount').textContent = `${n} selected`;
  dots.forEach((d, i) => d.classList.toggle('sel', engine.selection.has(i)));
  $$('#groupChips button').forEach((b) => b.classList.toggle('active', progGroup.value === b.dataset.g));
  if (n) {
    const i = [...engine.selection][0], v = engine.prog.get(i) || {}, o = engine.out[i], c = engine.cur[i];
    const [h, s] = v.hue !== undefined ? [v.hue, v.sat ?? 1] : rgbToHS(o.r, o.g, o.b);
    const vals = { dim: v.dim ?? o.dim, hue: h, sat: s, pan: v.pan ?? c.pan, tilt: v.tilt ?? c.tilt, zoom: v.zoom ?? c.zoom, frost: v.frost ?? o.frost, strobe: v.strobe ?? o.strobe };
    syncingProg = true;
    for (const [a, sel] of Object.entries(ATTR_INPUTS)) { const el = $(sel); el.value = vals[a]; refreshOutput(el); }
    syncingProg = false;
  }
  markActive();
}
function markActive() {
  for (const [a, sel] of Object.entries(ATTR_INPUTS)) $(sel).closest('.attr').classList.toggle('on', engine.progAttrActive(a));
  dots.forEach((d, i) => d.classList.toggle('prog', engine.prog.has(i)));
}
let hintTimer;
function flashHint(msg) {
  const h = $('#controls .tab:not([hidden]) .hint') || $('#fxHint');
  if (!h) return;
  const old = h.dataset.orig ?? h.textContent;
  h.dataset.orig = old;
  h.textContent = msg; h.style.color = 'var(--amber)';
  clearTimeout(hintTimer);
  hintTimer = setTimeout(() => { h.textContent = old; h.style.color = ''; }, 2200);
}

// ——— live effects ———
const FX_PRESETS = {
  dimChase: { name: 'Intensity chase ←→', a: 'dim', w: 'saw', rate: 2, size: 1, spread: 360, by: 'x' },
  podStep: { name: 'Pod step (front→back)', a: 'dim', w: 'square', rate: 2, size: 1, spread: 360, by: 'pod', duty: 0.25 },
  sparkle: { name: 'Random sparkle', a: 'dim', w: 'rand', rate: 0.25, size: 1, spread: 0, by: 'rand' },
  pulse: { name: 'On-beat pulse', a: 'dim', w: 'pulse', rate: 1, size: 0.9, spread: 0 },
  tiltWave: { name: 'Tilt wave', a: 'tilt', w: 'sin', rate: 8, size: 20, spread: 360, by: 'x' },
  panFan: { name: 'Pan fan (wings)', a: 'pan', w: 'sin', rate: 16, size: 40, spread: 180, by: 'x', wings: true },
  circle: { name: 'Circles', a: 'circle', rate: 8, size: 12, spread: 360, by: 'i' },
  ballyhoo: { name: 'Ballyhoo', a: 'ballyhoo', rate: 8, size: 30, spread: 0, by: 'rand' },
  rainbow: { name: 'Rainbow roll', a: 'hue', w: 'saw', rate: 16, size: 180, spread: 360, by: 'x' },
  zoomBreathe: { name: 'Zoom breathe', a: 'zoom', w: 'sin', rate: 16, size: 10, spread: 180, by: 'center' },
  strobeBuild: { name: 'Strobe chase', a: 'strobe', w: 'square', rate: 1, size: 0.8, spread: 360, by: 'rand', duty: 0.25 },
};
$('#fxPreset').innerHTML = '<option value="">Custom</option>' + Object.entries(FX_PRESETS).map(([k, p]) => `<option value="${k}">${p.name}</option>`).join('');
$('#fxGroup').innerHTML = '<option value="sel">Current selection</option>' + Object.entries(GROUP_LABELS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('');
$('#fxGroup').value = 'pods';
let fxSel = -1;
function fxSizeLabel() {
  const a = $('#fxAttr').value, v = +$('#fxSize').value * SIZE_SCALE[a];
  return SIZE_UNIT[a] ? `${v.toFixed(1)}${SIZE_UNIT[a]}` : v.toFixed(2);
}
function fxLabel(e) {
  const g = Array.isArray(e.g) ? `${e.g.length} heads` : GROUP_LABELS[e.g] || e.g;
  return `${e.name || e.a} · ${g}`;
}
function renderFx() {
  const ul = $('#fxList');
  ul.innerHTML = '';
  engine.liveFx.forEach((e, i) => {
    const li = document.createElement('li');
    li.className = (i === fxSel ? 'sel ' : '') + (e.on === false ? 'off' : '');
    li.innerHTML = `<input type="checkbox" ${e.on === false ? '' : 'checked'} aria-label="Enable"><span>${fxLabel(e)}</span><small>${e.rate}b</small><button type="button" aria-label="Remove">✕</button>`;
    on(li, 'click', (ev) => {
      if (ev.target.matches('button')) { engine.liveFx.splice(i, 1); fxSel = Math.min(fxSel, engine.liveFx.length - 1); renderFx(); return; }
      if (ev.target.matches('input')) { e.on = ev.target.checked; renderFx(); return; }
      fxSel = i; renderFx();
    });
    ul.append(li);
  });
  const e = engine.liveFx[fxSel];
  $('#fxEditor').classList.toggle('disabled', !e);
  if (e) {
    $('#fxGroup').value = Array.isArray(e.g) ? 'sel' : e.g;
    $('#fxAttr').value = e.a; $('#fxWave').value = e.w || 'sin'; $('#fxBy').value = e.by || 'i';
    $('#fxRate').value = e.rate; $('#fxSize').value = e.size / SIZE_SCALE[e.a]; $('#fxSpread').value = e.spread ?? 0;
    $('#fxDuty').value = e.duty ?? 0.5; $('#fxWings').checked = !!e.wings; $('#fxReverse').checked = e.dir === -1;
    ['#fxRate', '#fxSize', '#fxSpread', '#fxDuty'].forEach((s) => refreshOutput($(s)));
  }
}
function fxFromEditor(e) {
  const g = $('#fxGroup').value;
  e.g = g === 'sel' ? (engine.selection.size ? [...engine.selection] : 'pods') : g;
  e.a = $('#fxAttr').value; e.w = $('#fxWave').value; e.by = $('#fxBy').value;
  e.rate = +$('#fxRate').value; e.size = +$('#fxSize').value * SIZE_SCALE[e.a]; e.spread = +$('#fxSpread').value;
  e.duty = +$('#fxDuty').value; e.wings = $('#fxWings').checked; e.dir = $('#fxReverse').checked ? -1 : 1;
}
on('#fxAdd', 'click', () => {
  const p = FX_PRESETS[$('#fxPreset').value];
  const e = { on: true };
  if (p) {
    Object.assign(e, p);
    const g = $('#fxGroup').value;
    e.g = g === 'sel' ? (engine.selection.size ? [...engine.selection] : 'pods') : g;
  } else fxFromEditor(e);
  engine.liveFx.push(e);
  fxSel = engine.liveFx.length - 1;
  renderFx();
});
for (const id of ['fxGroup', 'fxAttr', 'fxWave', 'fxBy', 'fxRate', 'fxSize', 'fxSpread', 'fxDuty', 'fxWings', 'fxReverse']) {
  on(`#${id}`, id.startsWith('fx') && ['fxWings', 'fxReverse', 'fxGroup', 'fxAttr', 'fxWave', 'fxBy'].includes(id) ? 'change' : 'input', () => {
    refreshOutput($('#fxSize'));
    const e = engine.liveFx[fxSel];
    if (!e) return;
    const keepName = e.name && id !== 'fxAttr';
    fxFromEditor(e);
    if (!keepName) delete e.name;
    renderFx();
  });
}
on('#fxClear', 'click', () => { engine.liveFx.length = 0; fxSel = -1; renderFx(); });
renderFx();

// ——— kinetics ———
$('#kinShape').innerHTML = KIN_SHAPES.map((s) => `<option value="${s}">${s[0].toUpperCase() + s.slice(1)}</option>`).join('');
$('#kinShape').value = 'wave';
const kin = { shape: 'wave', h: 9.5, amp: 1.2, roll: 0.15, period: 32 };
$('#kinFlipMode').innerHTML = Object.entries(FLIP_MODES).map(([k, l]) => `<option value="${k}">${l}</option>`).join('');
function readKin() {
  kin.shape = $('#kinShape').value; kin.h = +$('#kinHeight').value; kin.amp = +$('#kinAmp').value;
  kin.roll = +$('#kinRoll').value; kin.period = +$('#kinPeriod').value;
  kin.flip = +$('#kinFlip').value; kin.flipMode = $('#kinFlipMode').value; kin.flipWave = +$('#kinFlipWave').value;
  engine.kinOverride = $('#kinOverride').checked ? kin : null;
}
for (const id of ['kinShape', 'kinHeight', 'kinAmp', 'kinRoll', 'kinPeriod', 'kinFlip', 'kinFlipMode', 'kinFlipWave', 'kinOverride']) on(`#${id}`, ['kinShape', 'kinFlipMode', 'kinOverride'].includes(id) ? 'change' : 'input', readKin);
bindRange('hoistSpeed', (v) => { engine.hoist = v; });
bindRange('motorSpeed', (v) => { engine.motor = v; });
const podMeter = $('#podMeter');
podMeter.innerHTML = Array.from({ length: POD_COUNT }, (_, p) => `<div><i></i><span>${p + 1}</span></div>`).join('');
const podBars = $$('i', podMeter);

// ——— cue list ———
let cues = store.get('cues', null);
let cueIdx = -1, cueRunT = 0;
const cloneFx = (list) => list.map(({ _ph, _last, ...e }) => ({ ...e, g: Array.isArray(e.g) ? [...e.g] : e.g }));
function exampleCues() {
  const P = (entries) => entries.flatMap(([g, v]) => engine.group(g).map((i) => [i, { ...v }]));
  const [blu, mag, gold, cyan, uv] = [K.blue, K.magenta, K.gold, K.cyan, K.uv].map(hexHS);
  return [
    { name: 'Blue curtain', fade: 4, hold: 24, prog: P([['pods', { dim: 0.8, hue: blu[0], sat: 1, pan: 0, tilt: 0, zoom: 2.5, frost: 0 }]]), fx: [{ ...FX_PRESETS.tiltWave, g: 'pods', on: true }], kin: { shape: 'arch', h: 10, amp: 1.2, roll: 0, period: 32 } },
    { name: 'Magenta X', fade: 5, hold: 24, prog: P([['pods', { dim: 0.9, hue: mag[0], sat: 1, aim: TARGETS.air, zoom: 3 }], ['floor', { dim: 0.7, hue: uv[0], sat: 1, pan: 0, tilt: 5, zoom: 5 }]]), fx: [{ ...FX_PRESETS.circle, g: 'pods', on: true }], kin: { shape: 'vee', h: 10.5, amp: 0.8, roll: 0.15, period: 32 } },
    { name: 'Gold sweep', fade: 3, hold: 20, prog: P([['pods', { dim: 1, hue: gold[0], sat: gold[1], aim: TARGETS.crowd, zoom: 5 }]]), fx: [{ ...FX_PRESETS.panFan, g: 'pods', on: true }, { ...FX_PRESETS.podStep, g: 'pods', on: true }], kin: { shape: 'wave', h: 9.5, amp: 1.6, roll: 0.2, period: 16 } },
    { name: 'Cyan rainbow ballyhoo', fade: 2, hold: 20, prog: P([['pods', { dim: 0.9, hue: cyan[0], sat: 1, pan: 0, tilt: 45, zoom: 4 }]]), fx: [{ ...FX_PRESETS.ballyhoo, g: 'pods', on: true }, { ...FX_PRESETS.rainbow, g: 'pods', on: true }], kin: { shape: 'chaos', h: 9.8, amp: 1.4, roll: 0.2, period: 32 } },
  ];
}
if (!Array.isArray(cues)) cues = exampleCues();
const saveCues = () => store.set('cues', cues);
function renderCues() {
  const ol = $('#cueList');
  ol.innerHTML = '';
  cues.forEach((c, i) => {
    const li = document.createElement('li');
    li.className = i === cueIdx ? 'sel live' : '';
    li.innerHTML = `<small>${i + 1}</small><span>${c.name}</span><small>↘${c.fade}s · ${c.hold}s</small><button type="button" aria-label="Delete cue">✕</button>`;
    on(li, 'click', (e) => {
      if (e.target.matches('button')) { cues.splice(i, 1); if (cueIdx >= cues.length) cueIdx = cues.length - 1; saveCues(); renderCues(); return; }
      goCue(i);
    });
    ol.append(li);
  });
}
function goCue(i) {
  if (!cues.length) return;
  cueIdx = ((i % cues.length) + cues.length) % cues.length;
  const c = cues[cueIdx];
  engine.jump(c.fade);
  engine.loadProg(c.prog);
  engine.liveFx = cloneFx(c.fx || []);
  if (c.kin) { Object.assign(kin, { flip: 0, flipMode: 'all', flipWave: 0 }, c.kin); engine.kinOverride = kin; } else engine.kinOverride = null;
  $('#kinOverride').checked = !!c.kin;
  if (c.kin) {
    $('#kinShape').value = kin.shape; $('#kinHeight').value = kin.h; $('#kinAmp').value = kin.amp; $('#kinRoll').value = kin.roll; $('#kinPeriod').value = kin.period;
    $('#kinFlip').value = kin.flip; $('#kinFlipMode').value = kin.flipMode; $('#kinFlipWave').value = kin.flipWave;
    ['#kinHeight', '#kinAmp', '#kinRoll', '#kinPeriod', '#kinFlip', '#kinFlipWave'].forEach((s) => refreshOutput($(s)));
  }
  fxSel = -1; renderFx(); markActive();
  cueRunT = 0;
  renderCues();
}
on('#cueRecord', 'click', () => {
  const name = $('#cueName').value.trim() || `Cue ${cues.length + 1}`;
  cues.push({ name, fade: +$('#cueFade').value, hold: +$('#cueHold').value, prog: engine.serializeProg(), fx: cloneFx(engine.liveFx), kin: engine.kinOverride ? { ...kin } : null });
  $('#cueName').value = '';
  cueIdx = cues.length - 1;
  saveCues(); renderCues();
});
on('#cueGo', 'click', () => goCue(cueIdx + 1));
on('#cueBack', 'click', () => goCue(cueIdx - 1));
on('#cueRun', 'change', (e) => {
  if (e.target.checked) {
    if ($('#cueOverShow').checked && engine.show) loadShow('', 3);
    goCue(cueIdx < 0 ? 0 : cueIdx);
  }
});
on('#cueExport', 'click', () => {
  const blob = new Blob([JSON.stringify({ kind: 'ck5-cues', version: 1, cues }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob); a.download = 'ck5-cues.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 1000);
});
on('#cueImportBtn', 'click', () => $('#cueImport').click());
on('#cueImport', 'change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;
  try {
    const data = JSON.parse(await file.text());
    if (!Array.isArray(data.cues)) throw new Error('no cues');
    cues = data.cues; cueIdx = -1; saveCues(); renderCues();
  } catch { flashHint('That file is not a CK5 cue list.'); }
  e.target.value = '';
});
renderCues();

// ——— sound to light ———
const mic = { on: false, analyser: null, data: null, avg: 0.05, env: 0, last: 0, onsets: [] };
async function startMic() {
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false } });
    const ctx = new AudioContext();
    const src = ctx.createMediaStreamSource(stream);
    mic.analyser = ctx.createAnalyser();
    mic.analyser.fftSize = 1024;
    mic.analyser.smoothingTimeConstant = 0.2;
    src.connect(mic.analyser);
    mic.data = new Uint8Array(mic.analyser.frequencyBinCount);
    mic.stream = stream; mic.ctx = ctx; mic.on = true;
    $('#micStatus').textContent = 'Listening. Kick and bass drive the beat.';
    engine.pulseDepth = +$('#micPulse').value;
  } catch {
    $('#micToggle').checked = false;
    $('#micStatus').textContent = 'Microphone unavailable or permission denied.';
  }
}
function stopMic() {
  mic.on = false;
  mic.stream?.getTracks().forEach((t) => t.stop());
  mic.ctx?.close();
  engine.pulseDepth = 0; engine.pulse = 0;
  $('#micLevel').style.width = '0';
  $('#micStatus').textContent = 'Off.';
}
on('#micToggle', 'change', (e) => (e.target.checked ? startMic() : stopMic()));
on('#micPulse', 'input', (e) => { if (mic.on) engine.pulseDepth = +e.target.value; });
function micFrame(dt) {
  if (!mic.on) return;
  mic.analyser.getByteFrequencyData(mic.data);
  let low = 0;
  for (let i = 1; i <= 8; i++) low += mic.data[i];
  const level = low / (8 * 255);
  mic.avg = mic.avg * 0.96 + level * 0.04;
  mic.env = Math.max(level, mic.env - dt * 1.8);
  engine.pulse = Math.min(1, Math.max(0, (mic.env - 0.08) / 0.6));
  $('#micLevel').style.width = `${Math.round(level * 100)}%`;
  const t = performance.now() / 1000;
  if (level > mic.avg * 1.3 && level > 0.18 && t - mic.last > 0.27) {
    mic.last = t;
    mic.onsets.push(t);
    mic.onsets = mic.onsets.slice(-16);
    const frac = engine.beat - Math.round(engine.beat);
    if (Math.abs(frac) < 0.3) engine.beat -= frac * 0.4;
    if ($('#micTempo').checked && mic.onsets.length > 6) {
      const iv = [];
      for (let i = 1; i < mic.onsets.length; i++) { let d = mic.onsets[i] - mic.onsets[i - 1]; while (d > 0 && d < 0.33) d *= 2; while (d > 1.0) d /= 2; if (d > 0.33) iv.push(d); }
      iv.sort((a, b) => a - b);
      const med = iv[Math.floor(iv.length / 2)];
      if (med) {
        engine.bpm += (60 / med - engine.bpm) * 0.15;
        $('#bpm').value = engine.bpm.toFixed(1);
      }
    }
  }
}

// ——— MIDI ———
let midiMap = store.get('midi', {});
let learning = false, armed = null;
const learnables = () => $$('#controls input[type=range], #controls input[type=checkbox], #controls button').filter((el) => el.id && !el.closest('.tabs'));
function renderMidiMap() {
  const ul = $('#midiMap');
  ul.innerHTML = '';
  for (const [k, id] of Object.entries(midiMap)) {
    const el = document.getElementById(id);
    const li = document.createElement('li');
    li.innerHTML = `<span>${k}</span> → <span>${el ? (el.getAttribute('aria-label') || $(`label[for="${id}"]`)?.textContent.trim() || el.textContent.trim() || id) : id}</span><button type="button">✕</button>`;
    on(li.querySelector('button'), 'click', () => { delete midiMap[k]; store.set('midi', midiMap); renderMidiMap(); });
    ul.append(li);
  }
}
/** Learned MIDI → console controls. Returns true when the message was consumed. */
function handleLearned(data) {
  const [st, d1, d2 = 0] = data;
  const type = st & 0xf0, ch = (st & 0x0f) + 1;
  let key, v, isOff = false;
  if (type === 0xb0) { key = `CC ${ch}:${d1}`; v = d2 / 127; }
  else if (type === 0x90 || type === 0x80) { key = `Note ${ch}:${d1}`; v = type === 0x90 ? d2 / 127 : 0; isOff = v === 0; }
  else return false;
  if (learning && armed) {
    if (isOff) return true;
    midiMap[key] = armed.id;
    $('#learnStatus').textContent = `Learned ${key} → ${controlName(armed)}.`;
    armed.classList.remove('armed'); armed = null;
    store.set('midi', midiMap); renderMidiMap();
    return true;
  }
  const el = document.getElementById(midiMap[key]);
  if (!el) return false;
  if (el.type === 'range') {
    el.value = +el.min + (+el.max - +el.min) * v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
  } else if (el.type === 'checkbox') {
    if (type === 0xb0) el.checked = v > 0.5; else if (!isOff) el.checked = !el.checked; else return true;
    el.dispatchEvent(new Event('change', { bubbles: true }));
  } else {
    const hold = Object.values(holds).find((h) => h.el === el);
    if (hold) (v > 0 ? hold.start() : hold.stop());
    else if (v > 0 && !(type === 0xb0 && v < 0.5)) el.click();
  }
  return true;
}
const controlName = (el) => el.getAttribute('aria-label') || $(`label[for="${el.id}"]`)?.textContent.trim() || el.textContent.trim() || el.id;
const midi = setupMidi({ engine, onControl: handleLearned, onScene: (i) => { if (SCENES[i]) launchScene(SCENES[i].id); } });
on('#midiLearn', 'click', () => {
  learning = !learning;
  document.body.classList.toggle('learning', learning);
  $('#midiLearn').classList.toggle('active', learning);
  learnables().forEach((el) => el.toggleAttribute('data-learnable', learning));
  if (!learning && armed) { armed.classList.remove('armed'); armed = null; }
  if (learning && !midi.access) midi.connect();
});
on('#midiClear', 'click', () => { midiMap = {}; store.set('midi', midiMap); renderMidiMap(); });
document.addEventListener('pointerdown', (e) => {
  if (!learning) return;
  const el = e.target.closest('[data-learnable]') || e.target.closest('label')?.querySelector('[data-learnable]');
  if (!el || el.id === 'midiLearn') return;
  armed?.classList.remove('armed');
  armed = el; el.classList.add('armed');
  $('#learnStatus').textContent = `Armed: move a knob or hit a pad for “${controlName(el)}”.`;
}, true);
renderMidiMap();

// ——— render ———
bindRange('hazeTexture', (v) => { view.hazeTexture = v; });
on('#strobeRandom', 'change', (e) => { engine.strobeRandom = e.target.checked; });
on('#quality', 'change', (e) => rig.setQuality(+e.target.value));

// ——— keyboard ———
const typing = (e) => e.target.matches?.('input[type=text], input[type=number], textarea, select');
on(document, 'keydown', (e) => {
  if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (k === ' ') { e.preventDefault(); setPlaying(!engine.playing); }
  else if (k === 'arrowright') engine.gotoSection(1);
  else if (k === 'arrowleft') engine.gotoSection(-1);
  else if (k === 't') tap();
  else if (k === 'x' && !e.repeat) { holds.flash.start(); setTimeout(() => { if (!keysDown.has('x')) holds.flash.stop(); }, 150); }
  else if (k === 's' && !e.repeat) { holds.strobe.start(); setTimeout(() => { if (!keysDown.has('s')) holds.strobe.stop(); }, 150); }
  else if (k === 'b') { const b = $('#blackoutToggle'); b.checked = !b.checked; b.dispatchEvent(new Event('change')); }
  else if (k === 'g') goCue(cueIdx + 1);
  else if (k === 'h') document.body.classList.toggle('hide-panel');
  else if (/^[0-9]$/.test(k)) { const sc = SCENES[(+k + 9) % 10]; if (sc) launchScene(sc.id); }
  else return;
  keysDown.add(k);
});
const keysDown = new Set();
on(document, 'keyup', (e) => {
  const k = e.key.toLowerCase();
  keysDown.delete(k);
  if (k === 'x') holds.flash.stop();
  if (k === 's') holds.strobe.stop();
});

// ——— lasers ———
const lasers = new Lasers(engine);
$('#laserPattern').innerHTML = Object.entries(PATTERNS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('');
$('#laserColor').innerHTML = Object.entries(LASER_COLORS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('');
$('#laserPattern').value = 'auto';
for (const [id, key, ev] of [['laserPattern', 'pattern', 'change'], ['laserColor', 'color', 'change'], ['laserFixed', 'fixed', 'input'],
  ['laserLevel', 'level', 'input'], ['laserCount', 'count', 'input'], ['laserSpread', 'spread', 'input'], ['laserSpeed', 'speed', 'input'],
  ['laserHeight', 'height', 'input'], ['laserChop', 'chop', 'change'], ['laserNotes', 'notes', 'change']]) {
  const el = $(`#${id}`);
  const read = () => { lasers.opts[key] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? +el.value : el.value; };
  on(el, ev, read); read();
}
on('#laserOn', 'change', (e) => { lasers.on = e.target.checked; store.set('lasers', lasers.on); });
if (store.get('lasers', false) || new URL(location.href).searchParams.get('lasers') === '1') { $('#laserOn').checked = true; lasers.on = true; }

// ——— devices: LED tubes, mirror balls, blinders & strobes, liquid light show, CO₂ ———
const devices = new Devices(rig, engine);
const venue = new Venue(rig, engine);
const ambience = new Ambience(rig, engine, venue);
rig.preRender = (dt) => { devices.update(dt); ambience.update(dt); };
const fill = (id, obj) => { $(`#${id}`).innerHTML = Object.entries(obj).map(([k, l]) => `<option value="${k}">${l}</option>`).join(''); };
fill('tubeLayout', TUBE_LAYOUTS); fill('tubeLook', TUBE_LOOKS); fill('tubeColor', DEVICE_COLORS); fill('ballColor', DEVICE_COLORS);
fill('blinderMode', HIT_MODES); fill('strobeMode', HIT_MODES); fill('co2Mode', HIT_MODES); fill('liquidPalette', LIQUID_PALETTES);
$('#ballColor').value = 'white';
$('#blinderMode').value = 'drops'; $('#strobeMode').value = 'show'; $('#co2Mode').value = 'drops';
$('#co2Mode').querySelector('option[value=show]')?.remove();
$('#blinderMode').querySelector('option[value=show]')?.remove();
const DEVICE_INPUTS = [
  ['tubesOn', 'tubes'], ['tubeLook', 'tubeLook'], ['tubeColor', 'tubeColor'], ['tubeFixed', 'tubeFixed'], ['tubeLevel', 'tubeLevel'], ['tubeSpeed', 'tubeSpeed'],
  ['ballCount', 'balls'], ['ballColor', 'ballColor'], ['ballFixed', 'ballFixed'], ['ballLevel', 'ballLevel'], ['ballSpin', 'ballSpin'], ['ballRays', 'ballRays'],
  ['blindersOn', 'blinders'], ['blinderMode', 'blinderMode'], ['blinderLevel', 'blinderLevel'],
  ['strobesOn', 'strobes'], ['strobeMode', 'strobeMode'], ['strobeRateX', 'strobeRate'], ['strobeLevelX', 'strobeLevel'],
  ['liquidOn', 'liquid'], ['liquidPalette', 'liquidPalette'], ['liquidLevel', 'liquidLevel'], ['liquidSpeed', 'liquidSpeed'], ['liquidPulse', 'liquidPulse'],
  ['co2On', 'co2'], ['co2Mode', 'co2Mode'], ['crashFires', 'crash'],
];
for (const [id, key] of DEVICE_INPUTS) {
  const el = $(`#${id}`);
  const read = () => { devices.o[key] = el.type === 'checkbox' ? el.checked : (el.type === 'range' || key === 'balls') ? +el.value : el.value; };
  on(el, el.type === 'range' || el.type === 'color' ? 'input' : 'change', read); read();
}
on('#tubeLayout', 'change', (e) => devices.setTubeLayout(e.target.value));
devices.setTubeLayout($('#tubeLayout').value);
on('#co2Blast', 'click', () => { if (!devices.o.co2) { $('#co2On').checked = true; devices.o.co2 = true; } devices.blast(); });
on('#blinderHit', 'click', () => { if (!devices.o.blinders) { $('#blindersOn').checked = true; devices.o.blinders = true; } devices.hitBlinders(); });
on('#strobeBurst', 'click', () => { if (!devices.o.strobes) { $('#strobesOn').checked = true; devices.o.strobes = true; } devices.burst(1.5); });
on('#ballDrop', 'click', () => { if (devices.o.balls) devices.redropBalls(); else setCtrl('ballCount', '1'); });
on('#ballRaise', 'click', () => setCtrl('ballCount', '0'));

// quick kits: set the Extras controls as a person would, so the remote and storage follow
const KITS = {
  none: { laserOn: false, tubesOn: false, ballCount: '0', blindersOn: false, strobesOn: false, liquidOn: false, co2On: false },
  phish: { laserOn: false, tubesOn: true, tubeLayout: 'truss', tubeLook: 'follow', tubeColor: 'rig', ballCount: '1', ballColor: 'white', blindersOn: true, blinderMode: 'drops', strobesOn: true, strobeMode: 'show', liquidOn: false, co2On: false },
  biscuits: { laserOn: true, laserPattern: 'auto', laserColor: 'rgb', tubesOn: true, tubeLayout: 'curtain', tubeLook: 'wave', ballCount: '0', blindersOn: false, strobesOn: true, strobeMode: 'beat', liquidOn: false, co2On: true, co2Mode: 'drops' },
  dead: { laserOn: false, tubesOn: false, ballCount: '1', ballColor: 'rig', blindersOn: true, blinderMode: 'phrase', strobesOn: false, liquidOn: true, liquidPalette: 'classic', co2On: false },
  all: { laserOn: true, laserPattern: 'auto', tubesOn: true, tubeLayout: 'truss', tubeLook: 'follow', ballCount: '3', blindersOn: true, blinderMode: 'drops', strobesOn: true, strobeMode: 'show', liquidOn: true, co2On: true, co2Mode: 'drops' },
};
on('#extrasKit', 'change', (e) => {
  const kit = KITS[e.target.value];
  if (!kit) return;
  for (const [id, v] of Object.entries(kit)) {
    const el = $(`#${id}`);
    if (el.type === 'checkbox') el.checked = v; else el.value = v;
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  e.target.value = '';
});

{ const k = new URL(location.href).searchParams.get('kit'); if (KITS[k]) { $('#extrasKit').value = k; $('#extrasKit').dispatchEvent(new Event('change')); } }

// remember the Extras tab between visits
const extrasInputs = () => $$('section[data-tab=laser] input, section[data-tab=laser] select').filter((el) => el.id && el.id !== 'extrasKit');
function saveExtras() { store.set('extras', Object.fromEntries(extrasInputs().map((el) => [el.id, el.type === 'checkbox' ? el.checked : el.value]))); }
{
  const saved = store.get('extras', null);
  if (saved) for (const el of extrasInputs()) {
    if (!(el.id in saved)) continue;
    if (el.type === 'checkbox') el.checked = saved[el.id]; else el.value = saved[el.id];
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  for (const el of extrasInputs()) on(el, 'change', saveExtras);
}

// ——— venue, house lights, fairy lights ———
fill('venueSelect', Object.fromEntries(Object.entries(VENUES).map(([k, v]) => [k, v.label])));
fill('houseColor', HOUSE_COLORS); fill('houseEffect', HOUSE_EFFECTS);
fill('fairyLayout', FAIRY_LAYOUTS); fill('fairyColor', FAIRY_COLORS); fill('fairyEffect', FAIRY_EFFECTS);
$('#fairyEffect').value = 'twinkle';
function setVenue(id) {
  venue.set(id);
  $('#venueSelect').value = venue.id;
  $('#venueBlurb').textContent = VENUES[venue.id].blurb;
  $('#curtainClosed').disabled = !VENUES[venue.id].curtain;
  canvas.dataset.venue = venue.id;
}
on('#venueSelect', 'change', (e) => setVenue(e.target.value));
setVenue(new URL(location.href).searchParams.get('venue') || 'void');
on('#curtainClosed', 'change', (e) => venue.closeCurtain(e.target.checked));
const houseLevel = $('#houseLevel');
on(houseLevel, 'input', () => ambience.houseTo(+houseLevel.value, +$('#houseFade').value));
const houseCue = (level, secs) => { ambience.houseTo(level, secs); houseLevel.value = level; refreshOutput(houseLevel); store.set('venueTab', { ...store.get('venueTab', {}), houseLevel: level }); };
on('#houseOut', 'click', () => houseCue(0, 8));
on('#houseHalf', 'click', () => houseCue(0.5, 4));
on('#houseUp', 'click', () => houseCue(1, 3));
for (const [id, key] of [['houseColor', 'color'], ['houseWarmth', 'warmth'], ['houseFixed', 'fixed'], ['houseEffect', 'effect'], ['houseSpeed', 'speed']]) {
  const el = $(`#${id}`);
  const read = () => { ambience.house.o[key] = el.type === 'range' ? +el.value : el.value; };
  on(el, el.type === 'range' || el.type === 'color' ? 'input' : 'change', read); read();
}
for (const [id, key] of [['fairyOn', 'on'], ['fairyLayout', 'layout'], ['fairyColor', 'color'], ['fairyFixed', 'fixed'], ['fairyEffect', 'effect'],
  ['fairyLevel', 'level'], ['fairySpeed', 'speed'], ['fairyDensity', 'density'], ['fairySag', 'sag'], ['fairySway', 'sway'], ['fairySize', 'size']]) {
  const el = $(`#${id}`);
  const read = () => { ambience.fairy.o[key] = el.type === 'checkbox' ? el.checked : el.type === 'range' ? +el.value : el.value; };
  on(el, el.type === 'range' || el.type === 'color' ? 'input' : 'change', read); read();
}
// remember the Venue tab too; the room comes back as it was (house lights without a fade)
{
  const inputs = () => $$('section[data-tab=venue] input, section[data-tab=venue] select').filter((el) => el.id);
  const save = () => store.set('venueTab', Object.fromEntries(inputs().map((el) => [el.id, el.type === 'checkbox' ? el.checked : el.value])));
  const saved = new URL(location.href).searchParams.get('venue') ? null : store.get('venueTab', null);
  if (saved) for (const el of inputs()) {
    if (!(el.id in saved)) continue;
    if (el.type === 'checkbox') el.checked = saved[el.id]; else el.value = saved[el.id];
    el.dispatchEvent(new Event('input', { bubbles: true }));
    el.dispatchEvent(new Event('change', { bubbles: true }));
  }
  ambience.house.level = ambience.house.target;
  for (const el of inputs()) on(el, 'change', save);
}

// ——— the rig: moving sticks ———
function relabel() {
  GROUP_LABELS = groupLabels(engine.rig.unit);
  const opts = (sel) => $$('option', sel).forEach((o) => { if (GROUP_LABELS[o.value]) o.textContent = GROUP_LABELS[o.value]; });
  opts(progGroup); opts($('#fxGroup'));
  $$('#groupChips button').forEach((b) => { b.textContent = GROUP_LABELS[b.dataset.g]; });
  $$('#fixtureMap [data-unit]').forEach((sp) => { sp.textContent = `${engine.rig.unit.toUpperCase()} ${+sp.dataset.unit + 1}`; });
  renderFx();
}
relabel();
canvas.dataset.rig = engine.rig.id;
on('#stageToggle', 'change', (e) => { view.stage = e.target.checked; engine.floorOn = e.target.checked; });

// ——— scenes ———
// Every launch is a move, never a cut: colour crossfades, heads and sticks travel,
// and devices a scene adds or drops rise out of / sink into the deck (tubes, blinders,
// strobes, CO₂, lasers), grow out of the truss, or fly in from the grid (balls, screen).
function setCtrl(id, v) {
  const el = $(`#${id}`);
  if (!el) return;
  if (el.type === 'checkbox') { if (el.checked === v) return; el.checked = v; } else { if (el.value === String(v)) return; el.value = v; }
  el.dispatchEvent(new Event('input', { bubbles: true }));
  el.dispatchEvent(new Event('change', { bubbles: true }));
}
const sceneById = (id) => SCENES.find((x) => x.id === id);
function applyScene(sc) {
  for (const [id, v] of Object.entries({ ...DEVICE_BASE, ...sc.devices })) setCtrl(id, v);
  if (sc.bpm) $('#bpm').value = sc.bpm;
}
let liveScene = null, sceneMsg = '', autoNext = null;
function markLaunched(sc, how) {
  liveScene = sc.id;
  showSelect.querySelector('option[value=scene]').textContent = `Scene: ${sc.name}`;
  showSelect.value = 'scene';
  $('#showBlurb').textContent = `Holding the “${sc.name}” scene. Pick a show to go back to timed playback.`;
  $('#hudShow').textContent = sc.name;
  renderSections();
  $('#sceneSelect').value = sc.id;
  sceneMsg = how;
  canvas.dataset.scene = sc.id;
}
/** Launch a scene. opts.instant lands everything at once (thumbnails, links). */
function launchScene(id, opts = {}) {
  const sc = sceneById(id);
  if (!sc) return;
  applyScene(sc);
  if (opts.instant) {
    engine.playScene(sc, 0); engine.settle(); devices.settle(); lasers.settle();
    markLaunched(sc, sc.name);
    return;
  }
  engine.playScene(sc, opts.fade ?? +$('#sceneFade').value);
  markLaunched(sc, `Moving to ${sc.name}`);
}
/** Is anything still travelling: the crossfade, the sticks, or a device coming or going? */
function sceneMoving() {
  if (engine.snapT > 0) return true;
  for (let p = 0; p < POD_COUNT; p++) {
    const P = engine.pods[p], T = engine.kinPre[p];
    if (Math.abs(P.h - T.h) > 0.05 || Math.abs(P.r - T.r) > 0.01 || P.f.some((f, b) => Math.abs(f - T.f[b]) > 0.02)) return true;
  }
  const o = devices.o, pr = devices.pres, at = (v, on) => Math.abs(v - (on ? 1 : 0)) < 1e-3;
  if (!at(pr.tubes, o.tubes && devices.tubeShown === o.tubeLayout) || !at(pr.blinders, o.blinders) || !at(pr.strobes, o.strobes) || !at(pr.liquid, o.liquid) || !at(pr.co2, o.co2)) return true;
  if (devices.ballDefs.some((b, i) => !at(b.pres, i < o.balls))) return true;
  return !at(lasers.presence, lasers.on);
}
function pickAuto() {
  const mode = $('#sceneAuto').value;
  const list = SCENES.filter((x) => x.id !== 'blackout');
  if (mode === 'next') {
    const i = list.findIndex((x) => x.id === liveScene);
    return list[(i + 1) % list.length];
  }
  const pool = list.filter((x) => x.id !== liveScene);
  return pool[Math.floor(Math.random() * pool.length)];
}
function sceneTick() {
  const mode = $('#sceneAuto').value;
  if (mode === 'off') { autoNext = null; return; }
  const span = +$('#sceneEvery').value * 4;
  if (autoNext === null) autoNext = Math.ceil(engine.beat / span) * span || span;
  if (engine.beat >= autoNext) {
    autoNext += span;
    const sc = pickAuto();
    if (sc) launchScene(sc.id);
  }
}
// thumbnails
const grid = $('#sceneGrid');
SCENES.forEach((sc, i) => {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'scene'; b.dataset.id = sc.id; b.setAttribute('role', 'listitem');
  b.title = `${sc.name}${i < 10 ? ` (key ${(i + 1) % 10})` : ''}`;
  b.innerHTML = `<img alt="" src="scenes/${sc.id}.webp"><small>${i < 10 ? (i + 1) % 10 : ''}</small><span>${sc.name}</span><i></i>`;
  b.querySelector('img').onerror = (e) => { e.target.remove(); b.style.background = 'linear-gradient(135deg, #1a1d24, #0a0c10)'; };
  on(b, 'click', () => launchScene(sc.id));
  grid.append(b);
});
$('#sceneSelect').innerHTML = '<option value="">— choose —</option>' + SCENES.map((sc) => `<option value="${sc.id}">${sc.name}</option>`).join('');
on('#sceneSelect', 'change', (e) => { if (e.target.value && e.target.value !== liveScene) launchScene(e.target.value); });
on('#sceneAuto', 'change', () => { autoNext = null; });
on('#sceneEvery', 'change', () => { autoNext = null; });
on(showSelect, 'change', () => { if (showSelect.value !== 'scene') { liveScene = null; sceneMsg = ''; } });
function scenesUI() {
  const live = engine.show?.scene ? liveScene : null;
  const moving = live && sceneMoving();
  const prog = engine.snapT > 0 ? 1 - engine.snapT / engine.snapDur : 1;
  for (const b of grid.children) {
    const isLive = b.dataset.id === live;
    b.classList.toggle('live', isLive);
    b.classList.toggle('moving', isLive && moving);
    b.querySelector('i').style.width = isLive ? `${Math.round(Math.min(1, prog) * 100)}%` : '0';
  }
  let msg = live ? (moving ? sceneMsg : `Live: ${sceneById(live).name}`) : '';
  if ($('#sceneAuto').value !== 'off' && autoNext !== null) msg += `${msg ? ' · ' : ''}next in ${Math.max(0, Math.ceil((autoNext - engine.beat) / 4))} bars`;
  $('#sceneStatus').textContent = msg;
}
{ const q = new URL(location.href).searchParams.get('scene'); if (sceneById(q)) setTimeout(() => launchScene(q, { instant: true }), 0); }

// ——— frame loop ———
loadShow(SHOWS[0].id, 0);
let last = performance.now(), uiT = 0, frames = 0;
status.hidden = true;
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  micFrame(dt);
  midi.tick(dt);
  sceneTick();
  // cue list runner
  if ($('#cueRun').checked && cueIdx >= 0 && cues[cueIdx]) {
    cueRunT += dt;
    if (cueRunT >= cues[cueIdx].hold) goCue(cueIdx + 1);
  }
  engine.update(dt);
  lasers.update(dt);
  if (engine.mode === 'hold' && engine.show && engine.showTime >= engine.show.total - 0.002) engine.showTime = engine.show.total - 0.001;
  if (view.autoCam && engine.time - lastCut > 28) {
    const ids = Object.keys(CAMERAS).filter((k) => k !== 'above' && k !== rig.camId);
    const id = ids[Math.floor(Math.random() * ids.length)];
    rig.setCamera(id, 5); camSel.value = id; lastCut = engine.time;
  }
  rig.update(dt, { ...view, lasers });
  canvas.dataset.frames = ++frames;
  uiT += dt;
  if (uiT > 0.1) { uiT = 0; updateUI(); }
  requestAnimationFrame(frame);
}
function updateUI() {
  const s = engine.show;
  const beatPh = engine.beat - Math.floor(engine.beat);
  $('#beatDot').style.opacity = String(0.2 + 0.8 * Math.max(0, 1 - beatPh * 3));
  $('#hudBpm').textContent = engine.bpm.toFixed(engine.bpm % 1 ? 1 : 0);
  if (s?.scene) {
    $('#hudTime').textContent = fmtTime(engine.showTime);
    $('#hudTotal').textContent = 'scene';
    $('#hudSection').textContent = '';
    $('#hudProgress').style.width = '0';
    $('#showPosOut').textContent = 'Scene';
  } else if (s) {
    $('#hudTime').textContent = fmtTime(engine.showTime);
    $('#hudSection').textContent = engine.section ? `· ${engine.section.n}` : '';
    $('#hudProgress').style.width = `${(engine.showTime / s.total) * 100}%`;
    if (!scrubbing) showPos.value = engine.showTime / s.total;
    $('#showPosOut').textContent = `${fmtTime(engine.showTime)} / ${fmtTime(s.total)}`;
    $$('#sectionList li').forEach((li, i) => {
      const sec = s.sections[i], now = i === engine.sectionIndex;
      li.classList.toggle('now', now);
      li.querySelector('i').style.width = now ? `${((engine.showTime - sec.start) / sec.d) * 100}%` : '0';
    });
    if (canvas.dataset.section !== engine.section?.n) canvas.dataset.section = engine.section?.n || '';
  } else {
    $('#hudTime').textContent = cueIdx >= 0 && cues[cueIdx] ? `Cue ${cueIdx + 1}` : '—';
    $('#hudTotal').textContent = cues.length ? `${cues.length}` : '—';
    $('#hudSection').textContent = cueIdx >= 0 && cues[cueIdx] ? `· ${cues[cueIdx].name}` : '';
  }
  if (midi.layer.on) $('#hudSection').textContent += ' · MIDI play';
  scenesUI();
  if (!$('section[data-tab=prog]').hidden) {
    for (let i = 0; i < dots.length; i++) {
      const o = engine.out[i], k = 0.25 + 0.75 * Math.min(1, o.dim);
      dots[i].style.background = o.dim > 0.01 ? `rgb(${o.r * 255 * k | 0},${o.g * 255 * k | 0},${o.b * 255 * k | 0})` : '#1a1d24';
    }
  }
  if (!$('section[data-tab=midi]').hidden) midi.readout();
  if (!$('section[data-tab=laser]').hidden) $('#laserNow').textContent = lasers.on ? `${lasers.count} beams · ${PATTERNS[lasers.pattern]}` : 'Off.';
  if (!$('section[data-tab=kin]').hidden) {
    engine.pods.forEach((p, i) => {
      podBars[i].style.bottom = `${((p.h - 4) / 10) * 90}%`;
      podBars[i].style.transform = `rotate(${-p.r * 57.3}deg)`;
    });
  }
}
requestAnimationFrame(frame);

// expose for debugging and tests
window.ck5 = { engine, rig, loadShow, goCue, midi, lasers, devices, venue, ambience, setVenue, launchScene, sceneMoving };
