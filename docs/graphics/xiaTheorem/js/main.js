// main.js — simulation driver, playback tempo, camera framing, UI.

import { NBody, hermite } from './nbody.js';
import { SCENARIOS, byId, defaultParams, clusterBodies } from './scenarios.js';
import { Renderer } from './render.js';
import { Chart } from './chart.js';

const $ = (id) => document.getElementById(id);
const canvas = $('scene');
const R = new Renderer(canvas);
const chart = new Chart($('chart'));
const url = new URL(location.href);

// ─────────────────────────── state ───────────────────────────

const S = {
  sc: null, params: {}, bodies: [], masses: [],
  sim: null, prev: null, cur: null, tR: 0,
  twin: null, twinPrev: null, twinCur: null,
  running: true, speed: 1,
  cascade: null, cpIndex: 1, steerOn: false, cascadeOver: false, overAt: 0, lastTrim: null,
  tauRef: 1, tauSmooth: 1,
  wallSinceStart: 0, stepsFrame: 0, limited: false,
  vEma: null,
  flights: [], bounceTimes: [],
  view: { target: [0, 0, 0], dist: 20, zoomBias: 1, radius: 5 },
};

// Preallocated snapshot pairs (prev/cur) so stepping never allocates.
function snap(n) { return { t: 0, x: new Float64Array(3 * n), v: new Float64Array(3 * n), a: new Float64Array(3 * n) }; }
function snapInto(s, o) { o.t = s.t; o.x.set(s.x); o.v.set(s.v); o.a.set(s.a); return o; }

// ─────────────────────────── scenario loading ───────────────────────────

const softOf = () => { const v = Number($('softSlider').value); return v <= -6 ? 0 : 10 ** v; };

function initialState() {
  const sc = S.sc;
  if (sc.cascade && S.steerOn) return { ...sc.cascade.cps[0].state };
  // The free Xia run at default settings starts from the exact tuned state.
  if (sc.id === 'xiaFree' && paramsAreDefault() && byId.xia.cascade) return { ...byId.xia.cascade.cps[0].state };
  const { masses, pos, vel } = sc.init(S.params);
  return { m: masses, t: 0, x: pos.flat(), v: vel.flat() };
}

function paramsAreDefault() {
  const d = defaultParams(S.sc);
  return Object.keys(d).every(k => Math.abs(d[k] - S.params[k]) < 1e-12);
}

function loadScenario(id, keepParams = false) {
  const sc = byId[id] || SCENARIOS[0];
  const changed = S.sc !== sc;
  S.sc = sc;
  if (!keepParams || changed) S.params = defaultParams(sc);
  if (changed) {
    $('scenario').value = sc.id;
    buildParamUI();
    $('about').innerHTML = sc.about;
    $('trailLen').value = sc.trail; onTrail();
    $('unroll').checked = !!sc.view.unroll;
    S.view.zoomBias = 1;
    // Deep link to the scenario, but never rewrite the URL of an embedded page: the
    // Studio stage matches the iframe's URL against its src before wiring controls.
    if (window.self === window.top && S.booted) { const u = new URL(location.href); u.searchParams.set('scenario', sc.id); history.replaceState(null, '', u); }
  }
  S.cascade = sc.cascade || null;
  S.steerOn = !!S.cascade;
  reset(changed);
}

function reset(newView = true) {
  const sc = S.sc;
  const st = initialState();
  S.masses = Array.from(st.m);
  S.bodies = sc.bodies || clusterBodies(S.masses.length);
  const opts = { soft: S.cascade ? 0 : softOf(), eta: 0.5, tol: 1e-12, lenient: true };
  S.sim = NBody.fromState(st, opts);
  const n = S.masses.length;
  S.prev = snapInto(S.sim, snap(n)); S.cur = snapInto(S.sim, snap(n));
  S.tR = S.sim.t; S.tC = S.sim.t;
  S.cpIndex = 1; S.cascadeOver = false; S.overAt = 0; S.lastTrim = null;
  S.wallSinceStart = 0;
  S.vEma = new Float64Array(n).fill(NaN);
  S.flights = []; S.bounceTimes = [];
  S.pos = new Float64Array(3 * n); S.pos.set(S.sim.x);
  S.heat = new Float64Array(n);
  S.syncErr = 0;
  S.escaped = false;
  loopAt = null;
  // shadow twin
  makeTwin();
  // renderer
  R.setBodies(S.bodies, S.masses);
  buildLegend();
  buildHud();
  // tempo reference
  // Velocity floor from the energy (virial speed), so systems released from rest still tick.
  const Mtot = S.masses.reduce((a, b) => a + b, 0);
  S.vFloor = Math.sqrt(Math.abs(S.sim.E0) / Math.max(Mtot, 1e-12)) * 0.5;
  // Reference: the standard crossing time G M^{5/2} / (2|E|)^{3/2} for bound systems.
  S.tauRef = S.sim.E0 < 0 ? Mtot ** 2.5 / (2 * -S.sim.E0) ** 1.5 : localTau(S.sim.x, S.sim.v);
  S.tauSmooth = localTau(S.sim.x, S.sim.v);
  // chart
  const ch = sc.chart;
  const series = ch.groups ? ch.groups.length : (ch.only ? ch.only.length : n);
  const colors = ch.colors || (ch.only ? ch.only.map(i => S.bodies[i].color) : S.bodies.map(b => b.color));
  chart.reset({ series, colors, labels: ch.labels, tStar: S.cascade ? S.cascade.tStar : null, window: chartWindow(), mode: chartMode() });
  chart.axisLabel = ['x', 'y', 'z'][ch.axis];
  if (newView) placeCamera(true);
  else frameCamera(1, true);
  ticker(S.cascade ? 'Cascade loaded: exact Newtonian gravity, tuned initial phase.' : `${sc.name}`);
  const note = sc.note ? sc.note(S.params) : '';
  $('scenarioNote').textContent = note;
  $('scenarioNote').hidden = !note;
  canvas.dataset.scenario = sc.id;
}

function chartWindow() {
  const sc = S.sc;
  if (sc.period) return sc.period * 2.2;
  if (sc.id === 'sitnikov') return 90;
  if (sc.id === 'lagrange') return 60;
  return 30;
}
function chartMode() {
  const m = $('chartMode').value;
  if (m === 'auto') return S.cascade ? 'blowup' : 'world';
  return m;
}

function makeTwin() {
  S.twin = null;
  if (!$('twin').checked) return;
  const d = 10 ** Number($('twinDelta').value);
  const x = Float64Array.from(S.sim.x), v = Float64Array.from(S.sim.v);
  // Nudge every coordinate by a relative δ (deterministic pattern).
  const scale = extent(x, v).radius || 1;
  for (let k = 0; k < x.length; k++) x[k] += d * scale * Math.sin(1.7 * k + 0.3);
  S.twin = NBody.fromState({ m: S.masses, t: S.sim.t, x, v }, { soft: S.sim.soft, eta: 0.5, tol: 1e-12, lenient: true });
  const n = S.masses.length;
  S.twinPrev = snapInto(S.twin, snap(n)); S.twinCur = snapInto(S.twin, snap(n));
  S.twinPos = new Float64Array(3 * n);
}

// ─────────────────────────── geometry helpers ───────────────────────────

function com(x, masses = S.masses) {
  const c = [0, 0, 0]; let M = 0;
  for (let i = 0; i < masses.length; i++) { const m = masses[i]; M += m; c[0] += m * x[3 * i]; c[1] += m * x[3 * i + 1]; c[2] += m * x[3 * i + 2]; }
  return M > 0 ? c.map(u => u / M) : c;
}

function extent(x, v) {
  const n = S.masses.length, c = com(x);
  const d = [];
  let v2 = 0, mt = 0;
  for (let i = 0; i < n; i++) {
    d.push(Math.hypot(x[3 * i] - c[0], x[3 * i + 1] - c[1], x[3 * i + 2] - c[2]));
    const w = S.masses[i] > 0 ? S.masses[i] : 0;
    if (v) { v2 += w * (v[3 * i] ** 2 + v[3 * i + 1] ** 2 + v[3 * i + 2] ** 2); mt += w; }
  }
  d.sort((a, b) => a - b);
  const core = d[Math.min(n - 1, Math.floor(0.7 * (n - 1)))] * 1.5;
  return { c, radius: d[n - 1], core: Math.max(core, d[Math.max(0, n - 2)] * 0.6), vrms: mt ? Math.sqrt(v2 / mt) : 1 };
}

/** Local dynamical time: core size over rms speed (floored by the virial speed). */
function localTau(x, v) {
  const ex = extent(x, v);
  return Math.max(ex.core, 1e-9) / Math.max(ex.vrms, S.vFloor || 1e-9, 1e-9);
}

function pairOrbit(x, v, i, j) {
  const m = S.masses, M = m[i] + m[j];
  if (!(M > 0)) return null;
  const r = [0, 1, 2].map(k => x[3 * i + k] - x[3 * j + k]);
  const w = [0, 1, 2].map(k => v[3 * i + k] - v[3 * j + k]);
  const rn = Math.hypot(...r), v2 = w[0] ** 2 + w[1] ** 2 + w[2] ** 2;
  const eps = v2 / 2 - M / rn;
  if (!(eps < 0)) return null;
  const a = -M / (2 * eps);
  const rv = r[0] * w[0] + r[1] * w[1] + r[2] * w[2];
  const ev = [0, 1, 2].map(k => ((v2 - M / rn) * r[k] - rv * w[k]) / M);
  const e = Math.hypot(...ev);
  const e1 = e > 1e-9 ? ev.map(u => u / e) : r.map(u => u / rn);
  const h = [r[1] * w[2] - r[2] * w[1], r[2] * w[0] - r[0] * w[2], r[0] * w[1] - r[1] * w[0]];
  let e2 = [h[1] * e1[2] - h[2] * e1[1], h[2] * e1[0] - h[0] * e1[2], h[0] * e1[1] - h[1] * e1[0]];
  const n2 = Math.hypot(...e2);
  if (n2 > 1e-14) e2 = e2.map(u => u / n2);
  else { const t = Math.abs(e1[2]) < 0.9 ? [0, 0, 1] : [1, 0, 0]; e2 = [t[1] * e1[2] - t[2] * e1[1], t[2] * e1[0] - t[0] * e1[2], t[0] * e1[1] - t[1] * e1[0]]; const q = Math.hypot(...e2); e2 = e2.map(u => u / q); }
  const c = [0, 1, 2].map(k => (m[i] * x[3 * i + k] + m[j] * x[3 * j + k]) / M);
  return { c, e1, e2, a, e: Math.min(e, 0.999999999), mi: m[i] / M, mj: m[j] / M };
}

// ─────────────────────────── stepping ───────────────────────────

let tmp = new Float64Array(48);
/** Commit trail points for sim times in (tFrom, tTo] ⊂ [p0.t, p1.t] (Hermite subdivision). */
function commitTrails(p0, p1, tFrom, tTo, minStep) {
  const n = S.masses.length;
  if (tmp.length < 3 * n) tmp = new Float64Array(3 * n);
  const span = p1.t - p0.t;
  if (!(span > 0) || !(tTo > tFrom)) return;
  const frac = (tTo - tFrom) / span;
  let steps = 1;
  for (let i = 0; i < n; i++) {
    const d = Math.hypot(p1.x[3 * i] - p0.x[3 * i], p1.x[3 * i + 1] - p0.x[3 * i + 1], p1.x[3 * i + 2] - p0.x[3 * i + 2]) * frac;
    steps = Math.max(steps, Math.min(32, Math.ceil(d / minStep)));
  }
  for (let s = 1; s <= steps; s++) {
    const t = tFrom + (tTo - tFrom) * s / steps;
    const q = t === p1.t ? p1.x : hermite(p0, p1, t, tmp);
    // wall-clock stamp interpolated across this frame (smooth unrolled trails)
    const wall = Math.min(S.wallSinceStart, S.frameW0 + (t - S.frameT0) * S.frameWallPerSim);
    for (let i = 0; i < n; i++) R.pushTrail(i, q[3 * i], q[3 * i + 1], q[3 * i + 2], S.heat[i], minStep, wall, S.unrolling);
  }
}

function updateHeat(v, dtSim) {
  const n = S.masses.length;
  const k = 1 - Math.exp(-dtSim / Math.max(S.tauSmooth, 1e-12) * 0.25);
  for (let i = 0; i < n; i++) {
    const sp = Math.hypot(v[3 * i], v[3 * i + 1], v[3 * i + 2]);
    if (!Number.isFinite(S.vEma[i])) S.vEma[i] = sp;
    S.vEma[i] += (sp - S.vEma[i]) * k;
    const target = Math.max(0, Math.min(1, (sp / Math.max(S.vEma[i], 1e-12) - 1) / 2.5));
    S.heat[i] += (target - S.heat[i]) * 0.3;
  }
}

/** Replace the integrator with the next precomputed checkpoint (Xia cascade). */
function applyCheckpoint(cp) {
  const st = cp.state;
  // How far the live run drifted from the precomputed one (before the trim).
  let err = 0;
  const x = hermite(S.prev, S.cur, cp.t, new Float64Array(st.x.length));
  const sc = extent(x).radius || 1;
  if (!cp.trim) for (let k = 0; k < st.x.length; k++) err = Math.max(err, Math.abs(st.x[k] - x[k]));
  S.syncErr = err / sc;
  S.sim = NBody.fromState(st, { soft: 0, eta: 0.5, tol: 1e-12, lenient: true });
  snapInto(S.sim, S.cur);
  if (cp.trim) S.lastTrim = cp;
}

function stepFrame(dtWall) {
  const sc = S.sc;
  let rate = S.speed * sc.rate;
  const tempo = $('tempo').value === 'auto' ? sc.tempo : $('tempo').value;
  const t = S.cur.t;
  let effTempo = tempo;
  if (effTempo === 'singular' && !(S.cascade && S.cascade.tStar && !S.cascadeOver && S.cascade.tStar > t)) effTempo = 'adaptive';
  if (effTempo === 'singular') rate *= 0.1 * Math.max(S.cascade.tStar - t, 1e-14);
  else if (effTempo === 'adaptive') rate *= S.tauSmooth / S.tauRef;

  const target = S.tR + dtWall * rate;
  S.frameT0 = S.tR; S.frameW0 = S.wallSinceStart - dtWall; S.frameWallPerSim = rate > 0 ? 1 / rate : 0;
  // Orbits much faster than a frame need no interpolation-smoothness cap.
  S.sim.dtFloor = rate / 60 * 0.3;
  if (S.twin) S.twin.dtFloor = S.sim.dtFloor;
  const t0 = performance.now();
  const budget = 11;
  let steps = 0;
  S.limited = false;
  const minStep = S.view.radius * 0.0032;
  // Trails are committed only up to the render time (the integrator runs ahead of it).
  const upTo = () => Math.min(S.cur.t, target);
  if (S.tC < upTo()) { commitTrails(S.prev, S.cur, Math.max(S.tC, S.prev.t), upTo(), minStep); S.tC = upTo(); }
  while (S.cur.t < target) {
    if (steps > 0 && performance.now() - t0 > budget) { S.limited = true; break; }
    const tmpSnap = S.prev; S.prev = S.cur; S.cur = tmpSnap;
    S.sim.step();
    steps++;
    if (S.sim.failed || !Number.isFinite(S.sim.t)) { ticker('Integrator gave up (collision or overflow). Restarting.'); scheduleLoop(1.5); S.running = false; break; }
    // Xia cascade: resynchronize with the precomputed checkpoint.
    const cps = S.cascade && S.steerOn ? S.cascade.cps : null;
    if (cps && S.cpIndex < cps.length && S.sim.t >= cps[S.cpIndex].t) {
      snapInto(S.sim, S.cur);
      commitTrails(S.prev, S.cur, Math.max(S.tC, S.prev.t), upTo(), minStep);
      watchEvents(S.prev, S.cur);
      applyCheckpoint(cps[S.cpIndex]);
      S.cpIndex++;
      snapInto(S.sim, S.prev);
      snapInto(S.sim, S.cur);
      S.tC = S.cur.t;
      continue;
    }
    snapInto(S.sim, S.cur);
    updateHeat(S.cur.v, S.cur.t - S.prev.t);
    commitTrails(S.prev, S.cur, Math.max(S.tC, S.prev.t), upTo(), minStep);
    S.tC = Math.max(S.tC, upTo());
    watchEvents(S.prev, S.cur);
  }
  S.stepsFrame = steps;
  S.tR = Math.min(target, S.cur.t);
  if (S.tR < S.prev.t) S.tR = S.prev.t;
  hermite(S.prev, S.cur, S.tR, S.pos);

  // twin follows the same clock
  if (S.twin) {
    let k = 0;
    while (S.twinCur.t < S.tR && k < 4000 && !S.twin.failed) {
      const q = S.twinPrev; S.twinPrev = S.twinCur; S.twinCur = q;
      S.twin.step(); snapInto(S.twin, S.twinCur); k++;
    }
    hermite(S.twinPrev, S.twinCur, Math.min(S.tR, S.twinCur.t), S.twinPos);
  }

  // adaptive tempo reference: system size / rms speed, smoothed
  const tau = localTau(S.cur.x, S.cur.v);
  S.tauSmooth += (tau - S.tauSmooth) * (1 - Math.exp(-dtWall * 1.5));

  // end of cascade: the steering ran out
  if (S.cascade && S.steerOn && !S.cascadeOver && S.cpIndex >= S.cascade.cps.length && S.cur.t > S.cascade.tEnd) {
    S.cascadeOver = true; S.overAt = S.wallSinceStart;
    ticker('End of the tuned cascade: no more trims, so from here the five bodies run free.');
  }
}

// Flights of Q₅ between binaries (Xia scenarios): midpoint crossings and bounces.
function watchEvents(p0, p1) {
  const ch = S.sc.chart;
  if (!ch.groups) return;
  const zc = (p, g) => { let s = 0, m = 0; for (const i of g) { s += S.masses[i] * p.x[3 * i + 2]; m += S.masses[i]; } return s / m; };
  const q = 4;
  const za0 = zc(p0, ch.groups[0]), zb0 = zc(p0, ch.groups[1]), za1 = zc(p1, ch.groups[0]), zb1 = zc(p1, ch.groups[1]);
  const s0 = p0.x[3 * q + 2] - 0.5 * (za0 + zb0), s1 = p1.x[3 * q + 2] - 0.5 * (za1 + zb1);
  if (s0 !== 0 && Math.sign(s0) !== Math.sign(s1)) {
    const v = Math.abs(p1.v[3 * q + 2]);
    const prev = S.flights[S.flights.length - 1];
    S.flights.push({ t: p1.t, v, to: s1 > 0 ? 'A' : 'B' });
    const gain = prev ? v / prev.v : null;
    ticker(`Flight ${S.flights.length} → binary ${s1 > 0 ? 'A' : 'B'} · |v₅| = ${fmtNum(v)}${gain ? ` (×${gain.toFixed(2)})` : ''}`);
  }
  // bounce: Q₅ reverses its axial velocity
  const v0 = p0.v[3 * q + 2], v1 = p1.v[3 * q + 2];
  if (v0 !== 0 && Math.sign(v0) !== Math.sign(v1)) {
    const near = Math.abs(p1.x[3 * q + 2] - za1) < Math.abs(p1.x[3 * q + 2] - zb1) ? 'A' : 'B';
    S.bounceTimes.push({ t: p1.t, X: near });
    chart.mark(p1.t, near);
  }
}

/** Direction history streams away in: sideways for axial scenarios, out of the plane for planar ones. */
function unrollDir() {
  const v = S.sc.view;
  if (v.grid) return [0, 0, -1];
  return [-Math.sin(v.azimuth), Math.cos(v.azimuth), 0];
}

// ─────────────────────────── camera ───────────────────────────

function placeCamera(snapNow) {
  const v = S.sc.view;
  const el = v.elevation, az = v.azimuth;
  const dir = [Math.cos(el) * Math.cos(az), Math.cos(el) * Math.sin(az), Math.sin(el)];
  S.view.dir = dir;
  const ex = extent(S.sim.x);
  const c = ex.c;
  S.view.target = c.slice();
  S.view.radius = clampRadius(v.frame === 'core' ? ex.core : ex.radius);
  S.view.dist = distFor(S.view.radius);
  R.controls.target.set(...c);
  R.camera.position.set(c[0] + dir[0] * S.view.dist, c[1] + dir[1] * S.view.dist, c[2] + dir[2] * S.view.dist);
  R.controls.update();
  if (snapNow) frameCamera(1, true);
}

function clampRadius(r) {
  const v = S.sc.view;
  return Math.min(v.maxRadius ?? Infinity, Math.max(v.minRadius ?? 0.5, r));
}

function distFor(radius) {
  const fov = R.camera.fov * Math.PI / 180;
  const aspect = Number.isFinite(R.camera.aspect) && R.camera.aspect > 0 ? Math.min(R.camera.aspect, 1.4) : 1;
  const fit = radius / Math.sin(Math.min(fov / 2, Math.atan(Math.tan(fov / 2) * aspect)));
  return fit * 1.3 * S.view.zoomBias;
}

function frameCamera(dtWall, instant = false) {
  const v = S.sc.view;
  const ex = extent(S.pos);
  const follow = $('followCom').checked;
  const k = instant ? 1 : 1 - Math.exp(-dtWall * 2.2);
  if (follow) for (let q = 0; q < 3; q++) S.view.target[q] += (ex.c[q] - S.view.target[q]) * k;
  const want = clampRadius(v.frame === 'core' ? ex.core : ex.radius);
  S.view.radius += (want - S.view.radius) * (instant ? 1 : 1 - Math.exp(-dtWall * (want > S.view.radius ? 3 : 0.8)));
  const ctl = R.controls;
  let off = R.camera.position.clone().sub(ctl.target);
  if (!Number.isFinite(off.x + off.y + off.z) || off.lengthSq() < 1e-18) {
    const d = S.view.dir || [1, 0, 0.3];
    off = new ctl.target.constructor(d[0], d[1], d[2]).multiplyScalar(distFor(S.view.radius));
  }
  if (!S.view.target.every(Number.isFinite)) S.view.target = ex.c.slice();
  ctl.target.set(...S.view.target);
  if ($('autoZoom').checked) {
    const d = distFor(S.view.radius);
    off.setLength(off.length() + (d - off.length()) * (instant ? 1 : 1 - Math.exp(-dtWall * 2.5)));
  }
  R.camera.position.copy(ctl.target).add(off);
  R.camera.near = Math.max(off.length() * 0.002, 1e-4);
  R.camera.far = off.length() * 50 + 1000;
  R.camera.updateProjectionMatrix();
}

// Wheel: zoom bias on top of auto-framing (or plain dolly when auto-zoom is off).
canvas.addEventListener('wheel', (e) => {
  e.preventDefault();
  const f = Math.exp(e.deltaY * 0.0012);
  if ($('autoZoom').checked) S.view.zoomBias = Math.min(8, Math.max(0.15, S.view.zoomBias * f));
  else {
    const off = R.camera.position.clone().sub(R.controls.target).multiplyScalar(f);
    R.camera.position.copy(R.controls.target).add(off);
  }
}, { passive: false });

// Pinch zoom on touch screens.
let pinch = null;
canvas.addEventListener('touchstart', (e) => { if (e.touches.length === 2) pinch = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); }, { passive: true });
canvas.addEventListener('touchmove', (e) => {
  if (e.touches.length !== 2 || !pinch) return;
  const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
  S.view.zoomBias = Math.min(8, Math.max(0.15, S.view.zoomBias * pinch / d));
  pinch = d;
}, { passive: true });
canvas.addEventListener('touchend', () => { pinch = null; }, { passive: true });

// ─────────────────────────── HUD, legend, ticker ───────────────────────────

function fmtNum(v) {
  if (!Number.isFinite(v)) return '—';
  const a = Math.abs(v);
  if (a !== 0 && (a < 1e-3 || a >= 1e5)) return v.toExponential(2).replace('e', '·10^').replace(/\^\+?(-?\d+)/, (_, p) => toSup(p));
  return a >= 100 ? v.toFixed(1) : a >= 10 ? v.toFixed(2) : v.toFixed(3);
}
function toSup(s) { const m = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' }; return String(s).split('').map(c => m[c] ?? c).join(''); }

let hudRows = [];
function buildHud() {
  const xia = !!S.sc.chart.groups;
  hudRows = [
    ['t', () => fmtNum(S.tR)],
  ];
  if (S.cascade) hudRows.push(['t* − t', () => S.cascadeOver ? 'past cascade' : fmtNum(S.cascade.tStar - S.tR)]);
  if (xia) {
    hudRows.push(['flights', () => String(S.flights.length)]);
    hudRows.push(['|v₅|', () => fmtNum(Math.abs(S.cur.v[14]))]);
    hudRows.push(['z_A − z_B', () => fmtNum(0.5 * (S.pos[2] + S.pos[5]) - 0.5 * (S.pos[8] + S.pos[11]))]);
    hudRows.push(['a_A · a_B', () => { const A = pairOrbit(S.cur.x, S.cur.v, 0, 1), B = pairOrbit(S.cur.x, S.cur.v, 2, 3); return `${A ? fmtNum(A.a) : '—'} · ${B ? fmtNum(B.a) : '—'}`; }]);
  } else {
    hudRows.push(['v max', () => { let m = 0; for (let i = 0; i < S.masses.length; i++) m = Math.max(m, Math.hypot(S.cur.v[3 * i], S.cur.v[3 * i + 1], S.cur.v[3 * i + 2])); return fmtNum(m); }]);
    hudRows.push(['closest pair', () => { let m = Infinity; const x = S.pos, n = S.masses.length; for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) m = Math.min(m, Math.hypot(x[3 * i] - x[3 * j], x[3 * i + 1] - x[3 * j + 1], x[3 * i + 2] - x[3 * j + 2])); return fmtNum(m); }]);
  }
  hudRows.push(['|ΔE/E|', () => fmtNum(S.sim.energyError())]);
  if (S.cascade) hudRows.push(['last trim', () => S.lastTrim ? `${fmtNum(Math.abs(S.lastTrim.trim))} of P_${S.lastTrim.X}` : 'none yet']);
  hudRows.push(['steps/frame', () => `${S.stepsFrame}${S.limited ? ' ⏳' : ''}`]);
  if (S.twin) hudRows.push(['twin gap', () => { let m = 0; for (let k = 0; k < S.pos.length; k++) m = Math.max(m, Math.abs(S.pos[k] - S.twinPos[k])); return fmtNum(m / (S.view.radius || 1)); }]);
  const box = $('stats');
  box.innerHTML = hudRows.map(([k], i) => `<div class="stat"><span class="k">${k}</span><span class="v" id="hv${i}">—</span></div>`).join('');
}
function updateHud() {
  hudRows.forEach(([, f], i) => { const el = $(`hv${i}`); if (el) el.textContent = f(); });
}

function buildLegend() {
  const seen = new Set();
  const rows = [];
  S.bodies.forEach((b, i) => {
    if (S.masses.length > 8 && i > 0) return;
    rows.push(`<div class="legend-row"><span class="dot" style="--c:${b.color}"></span><span>${b.label}</span><span class="m">m = ${fmtMass(S.masses[i])}</span></div>`);
    if (b.group) seen.add(b.group);
  });
  if (S.masses.length > 8) rows[0] = `<div class="legend-row"><span class="dot" style="--c:${S.bodies[0].color}"></span><span>${S.masses.length} equal stars</span><span class="m">m = ${fmtMass(S.masses[0])}</span></div>`;
  $('legendBody').innerHTML = rows.join('');
}
function fmtMass(m) { return m === 0 ? '0 (test)' : m >= 0.1 ? m.toFixed(2).replace(/\.?0+$/, '') : m.toPrecision(2); }

let tickerTimer = 0;
function ticker(msg) {
  const el = $('ticker');
  el.textContent = msg;
  el.classList.remove('show'); void el.offsetWidth; el.classList.add('show');
  tickerTimer = 6;
}

// ─────────────────────────── controls ───────────────────────────

function buildScenarioSelect() {
  const sel = $('scenario');
  const groups = [...new Set(SCENARIOS.map(s => s.group))];
  sel.innerHTML = groups.map(g => `<optgroup label="${g}">${SCENARIOS.filter(s => s.group === g).map(s => `<option value="${s.id}">${s.name}</option>`).join('')}</optgroup>`).join('');
}

let paramTimer = 0;
function buildParamUI() {
  const box = $('paramBox');
  box.innerHTML = S.sc.params.map(p => `
    <div class="control-group">
      <label for="p_${p.id}">${p.label} <span class="value-badge" id="pv_${p.id}"></span></label>
      <input type="range" id="p_${p.id}" min="${p.min}" max="${p.max}" step="${p.step}">
    </div>`).join('');
  box.hidden = !S.sc.params.length;
  for (const p of S.sc.params) {
    const el = $(`p_${p.id}`);
    el.value = S.params[p.id];
    $(`pv_${p.id}`).textContent = p.fmt(S.params[p.id]);
    el.addEventListener('input', () => {
      S.params[p.id] = Number(el.value);
      $(`pv_${p.id}`).textContent = p.fmt(S.params[p.id]);
      const note = S.sc.note ? S.sc.note(S.params) : '';
      $('scenarioNote').textContent = note; $('scenarioNote').hidden = !note;
      clearTimeout(paramTimer);
      paramTimer = setTimeout(() => reset(false), 180);
    });
  }
}

function onSpeed() {
  const v = Number($('speedSlider').value);
  S.speed = 2 ** v;
  $('speedValue').textContent = `${S.speed < 1 ? S.speed.toFixed(2) : S.speed.toFixed(S.speed < 10 ? 1 : 0)}×`;
}
function onTrail() {
  const n = Number($('trailLen').value);
  R.setTrailLength(n);
  $('trailValue').textContent = n;
}
function onTrailWidth() {
  const w = Number($('trailWidth').value);
  R.setTrailWidth(w);
  $('trailWidthValue').textContent = w.toFixed(1);
}
function onSoft() {
  const v = Number($('softSlider').value);
  $('softValue').textContent = v <= -6 ? '0 (exact)' : `10${toSup(v.toFixed(1).replace('.0', ''))}`;
}

$('scenario').addEventListener('change', () => loadScenario($('scenario').value));
$('playPause').addEventListener('change', () => { S.running = $('playPause').checked; });
$('speedSlider').addEventListener('input', onSpeed);
$('trailLen').addEventListener('input', onTrail);
$('trailWidth').addEventListener('input', onTrailWidth);
$('resetBtn').addEventListener('click', () => reset(false));
$('autoOrbit').addEventListener('change', () => { R.controls.autoRotate = $('autoOrbit').checked; });
$('showBloom').addEventListener('change', () => { R.bloom.enabled = $('showBloom').checked; });
$('softSlider').addEventListener('input', onSoft);
$('softSlider').addEventListener('change', () => { if (!S.cascade) reset(false); });
$('twin').addEventListener('change', () => { makeTwin(); buildHud(); });
$('twinDelta').addEventListener('input', () => { $('twinDeltaValue').textContent = `10${toSup($('twinDelta').value)}`; });
$('twinDelta').addEventListener('change', () => { if ($('twin').checked) { makeTwin(); buildHud(); } });
$('chartMode').addEventListener('change', () => { chart.mode = chartMode(); });
$('showChart').addEventListener('change', () => { $('chartWrap').hidden = !$('showChart').checked; });
$('unroll').addEventListener('change', () => R.clearTrails());
$('collapseBtn').addEventListener('click', () => { document.body.classList.toggle('panel-collapsed'); viewShift = null; updateViewOffset(); });

window.addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input, select, textarea')) return;
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  const k = e.key.toLowerCase();
  if (e.code === 'Space') { e.preventDefault(); $('playPause').checked = !$('playPause').checked; S.running = $('playPause').checked; }
  else if (k === 'r') reset(false);
  else if (k === 'h') document.body.classList.toggle('ui-hidden');
  else if (k === 's') { const i = SCENARIOS.indexOf(S.sc); loadScenario(SCENARIOS[(i + (e.shiftKey ? SCENARIOS.length - 1 : 1)) % SCENARIOS.length].id); }
  else if (k === 'b') { $('showBloom').checked = !$('showBloom').checked; R.bloom.enabled = $('showBloom').checked; }
  else if (k === 't') { $('twin').checked = !$('twin').checked; makeTwin(); buildHud(); }
  else if (k === 'g') $('showGuides').checked = !$('showGuides').checked;
  else if (k === 'u') { $('unroll').checked = !$('unroll').checked; R.clearTrails(); }
});

// Centre the scene in the space the side panel leaves free.
let viewShift = null;
function updateViewOffset() {
  const panel = $('controls'), hud = $('hud');
  const visible = (el) => el && el.offsetParent !== null && getComputedStyle(el).opacity !== '0' && !document.body.classList.contains('ui-hidden');
  const W = window.innerWidth, H = window.innerHeight;
  let sx = 0, sy = 0;
  if (W > 760) {
    if (visible(panel)) sx += panel.getBoundingClientRect().right / 2;
    if (visible(hud)) sx -= hud.getBoundingClientRect().width / 4;
  } else {
    // phone: centre the scene between the HUD (top) and the panel (bottom)
    const top = visible(hud) ? hud.getBoundingClientRect().bottom : 0;
    const bottom = visible(panel) ? panel.getBoundingClientRect().top : H;
    sy = (top + bottom) / 2 - H / 2;
  }
  const key = `${Math.round(sx)},${Math.round(sy)}`;
  if (key === viewShift) return;
  viewShift = key;
  if (sx || sy) R.camera.setViewOffset(W, H, -Math.round(sx), -Math.round(sy), W, H); else R.camera.clearViewOffset();
}
R.onResize = () => { viewShift = null; updateViewOffset(); };
window.addEventListener('resize', () => { R.resize(); R.onResize(); });
setInterval(updateViewOffset, 400);

// ─────────────────────────── loop ───────────────────────────

let loopAt = null;
function scheduleLoop(seconds) { loopAt = S.wallSinceStart + seconds; }

let lastT = performance.now();
let wall = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dtWall = Math.min(0.05, Math.max(0, (now - lastT) / 1000));
  lastT = now;
  wall += dtWall;
  tick(dtWall);
}

function tick(dtWall) {
  if (S.running) {
    S.wallSinceStart += dtWall;
    stepFrame(dtWall);
  }
  // escape detection
  if (S.sc.escapeRadius && !S.escaped && extent(S.pos).radius > S.sc.escapeRadius) {
    S.escaped = true;
    ticker('Escape: one body has left for good.');
    if ($('autoLoop').checked) scheduleLoop(4);
  }
  // loop / auto-restart
  if ($('autoLoop').checked) {
    const sc = S.sc;
    if (S.cascadeOver && S.wallSinceStart - S.overAt > 7) reset(false);
    else if (sc.loopAfter && S.tR > sc.loopAfter) reset(false);
    else if (loopAt !== null && S.wallSinceStart > loopAt) { loopAt = null; S.running = $('playPause').checked; reset(false); }
  } else if (loopAt !== null && S.wallSinceStart > loopAt) { loopAt = null; S.running = $('playPause').checked; }

  // visuals
  R.setBodyPositions(S.pos, S.heat, S.twin ? S.twinPos : null);
  for (let i = 0; i < S.masses.length; i++) R.setLiveHead(i, S.pos[3 * i], S.pos[3 * i + 1], S.pos[3 * i + 2], S.heat[i], S.wallSinceStart);
  // Unroll time: history drifts along a fixed direction at a speed tied to the view size.
  S.unrolling = $('unroll').checked;
  if (S.unrolling) {
    const d = unrollDir(), sp = S.view.radius * 0.07;
    R.setUnroll(S.wallSinceStart, d[0] * sp, d[1] * sp, d[2] * sp);
  } else R.setUnroll(S.wallSinceStart, 0, 0, 0);
  const guides = $('showGuides').checked;
  const v = S.sc.view;
  const ex = extent(S.pos);
  R.setAxis(guides && !!v.axis, ex.c, Math.max(ex.radius * 1.6, 2));
  R.setGrid(guides && !!v.grid, ex.c, Math.max(S.view.radius / 5.5, 0.2));
  const pairs = S.sc.pairs || [];
  for (let k = 0; k < 4; k++) {
    const pr = pairs[k >> 1];
    const o = guides && pr ? pairOrbit(S.cur.x, S.cur.v, pr[0], pr[1]) : null;
    if (!o) { R.setOrbit(k, null); continue; }
    // orbit of body i is m_j/M times the relative orbit; body j is the reflection
    const first = (k & 1) === 0;
    const cNow = [0, 1, 2].map(q => (S.masses[pr[0]] * S.pos[3 * pr[0] + q] + S.masses[pr[1]] * S.pos[3 * pr[1] + q]) / (S.masses[pr[0]] + S.masses[pr[1]]));
    R.setOrbit(k, { c: cNow, e1: o.e1, e2: o.e2, a: o.a, e: o.e, scale: first ? o.mj : -o.mi }, S.bodies[pr[first ? 0 : 1]].color);
  }
  frameCamera(dtWall);
  R.controls.update();
  R.render(wall);

  // chart + HUD (a few times a second is plenty for text)
  const ch = S.sc.chart;
  const vals = ch.groups ? ch.groups.map(g => { let s = 0, m = 0; for (const i of g) { s += S.masses[i] * S.pos[3 * i + ch.axis]; m += S.masses[i]; } return s / m; })
    : (ch.only || S.masses.map((_, i) => i)).map(i => S.pos[3 * i + ch.axis]);
  chart.push(S.tR, vals);
  if ($('showChart').checked && !document.body.classList.contains('ui-hidden')) chart.draw();
  hudTimer -= dtWall;
  if (hudTimer <= 0) { hudTimer = 0.2; updateHud(); }
  if (tickerTimer > 0) { tickerTimer -= dtWall; if (tickerTimer <= 0) $('ticker').classList.remove('show'); }
  canvas.dataset.time = S.tR.toFixed(6);
  canvas.dataset.flights = String(S.flights.length);
}
let hudTimer = 0;

// ─────────────────────────── boot ───────────────────────────

if (window.innerWidth <= 760) document.body.classList.add('panel-collapsed');
buildScenarioSelect();
onSpeed(); onTrail(); onTrailWidth(); onSoft();
$('twinDeltaValue').textContent = `10${toSup($('twinDelta').value)}`;
loadScenario(url.searchParams.get('scenario') || 'xia');
S.booted = true;
canvas.dataset.ready = 'true';
requestAnimationFrame(frame);

// Debug / test hooks.
/** Advance the simulation (trails included) to sim time t without rendering — for thumbnails and tests. */
function fastForward(t, maxFrames = 20000) {
  for (let n = 0; S.tR < t && n < maxFrames; n++) { S.wallSinceStart += 1 / 60; stepFrame(1 / 60); }
}
window.__xia = { S, R, chart, tick, fastForward, loadScenario, reset, SCENARIOS };
