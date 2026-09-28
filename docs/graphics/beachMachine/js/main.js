// Beach Ball Machine — bootstrap: renderer, simulation loop, sound, cameras, UI.
import * as THREE from 'three';
import { buildMachine, BRANCHES, BALL_COLORS, rescue } from './sim/layout.js';
import { Ball } from '../../ballMachine/js/sim/world.js';
import { SUBSTEP } from '../../ballMachine/js/sim/constants.js';
import { MachineView } from './render/machineView.js';
import { makeRig, liftChaseView, TourDirector } from './cameras.js';
import { buildEnvironment } from './env/beach.js';
import { createAudio } from './audio.js';

const $ = (s) => document.querySelector(s);
const stage = $('#stage');
// Embedded in the Graphics Studio stage (same origin)? A cross-origin parent,
// such as an artifact viewer, throws on the read and counts as standalone.
const IN_STUDIO = (() => {
  try { return window.self !== window.top && /\/graphics\/stage\.html$/.test(window.parent.location.pathname); } catch { return false; }
})();
const loading = $('#loading');

// ---------------------------------------------------------------- renderer & scene
const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
stage.appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.02, 600);

// ---------------------------------------------------------------- machine
const params = new URLSearchParams(location.search);
const state = {
  balls: +(params.get('balls') || 30),
  timeScale: 1, paused: false, route: 'auto', hour: 17.5,
  following: null, view: 'orbit', notes: 0,
};
const machine = buildMachine({ balls: state.balls });
const world = machine.world;
if (machine.warnings.length) console.info('layout notes:', machine.warnings);
const view = new MachineView(scene, renderer, machine);
let env;
try {
  env = buildEnvironment(scene, renderer, { heightAt: view.floorAt, timeOfDay: state.hour, grassTufts: duneTufts() });
} catch (err) {
  console.error('environment failed', err);
  env = fallbackEnvironment(scene);
}
// tunnels by track, for the cameras and the follow card
const tunnels = new Map();
for (const t of view.earth.tunnels) { if (!tunnels.has(t.track)) tunnels.set(t.track, []); tunnels.get(t.track).push(t); }
const inTunnel = (b) => b.mode === 'track' && (tunnels.get(b.track) || []).some((t) => b.s >= t.s0 && b.s <= t.s1);

// ---------------------------------------------------------------- device labels
const labelLayer = $('#labelLayer');
const labels = [];
{
  const d = machine.devices, tr = machine.tracks;
  const mid = (t, f = 0.5) => t.pointAt(t.L * f);
  const up = (p, h) => new THREE.Vector3(p.x, p.y + h, p.z);
  const defs = [
    ['Palm-tree lift', 'top', up({ x: 0.3, y: 3.2, z: -0.1 }, 0)],
    ['Flip-flop switches', 'top', up(machine.flipflops.F1.pos, 0.3)],
    ['Boardwalk marimba', 'marimba', up(mid(tr.laneI, 0.35), 0.25)],
    ['Ferris wheel', 'marimba', up({ x: d.wheel.cx, y: d.wheel.cy, z: d.wheel.cz }, 0.62)],
    ['Lighthouse', 'marimba', up(tr.glockHelix.start, 0.7)],
    ['Steel band', 'bells', up(tr.bellRamp0.start, 0.4)],
    ['Curling wave', 'daredevil', up(mid(tr.loop), 0.5)],
    ['Surfboard jump', 'daredevil', up(tr.jump.end, 0.2)],
    ['Conch', 'daredevil', up({ x: d.funnel.cx, y: d.funnel.yRim, z: d.funnel.cz }, 0.18)],
    ['Bass pans', 'daredevil', up(d.drum2.center, 0.3)],
    ['Message bottles', 'water', up(mid(tr.wsGlass, 0.45), 0.22)],
    ['Palm water slide', 'water', up(tr.wsHelix.start, 0.7)],
    ['Dune tunnel', 'water', up(mid(tr.wsTube, 0.5), 0.45)],
    ['Tide pool', 'water', up({ x: d.pool.cx, y: d.pool.wallTop, z: d.pool.cz }, 0.3)],
    ['Helter-skelter', 'castle', up(tr.cHelix.start, 0.45)],
    ['Sandcastle', 'castle', up({ x: d.castle.cx - 0.9, y: 2.6, z: d.castle.cz + 0.6 }, 0)],
    ['Moat', 'castle', up(mid(tr.moat, 0.6), 0.2)],
    ['Sand pail', 'gong', up(d.bucket.pivot, 0.3)],
    ['Ship’s bell', 'gong', up(d.shipBell.hang, 0.3)],
    ['Return channel', 'collector', up(machine.ringPoint(150), 0.2)],
  ];
  for (const [name, br, pos] of defs) {
    const el = document.createElement('button');
    el.className = 'tag'; el.type = 'button';
    el.title = `Fly to the ${name.toLowerCase()}`;
    el.innerHTML = `<i style="background:${BRANCHES[br].color}"></i>${name}`;
    const anchor = pos.clone();
    el.addEventListener('click', () => {
      if (state.view !== 'orbit') setView('orbit');
      rig.controls.autoRotate = false;
      rig.flyToPoint({ x: anchor.x, y: anchor.y - 0.25, z: anchor.z }, 2.4);
    });
    labelLayer.appendChild(el);
    labels.push({ el, pos, vis: true });
  }
}
let showLabels = true;
$('#labels').addEventListener('change', (e) => { showLabels = e.target.checked; });
const projV = new THREE.Vector3();
function updateLabels() {
  const on = showLabels && rig.mode === 'orbit' && camera.position.distanceTo(rig.controls.target) > 3.2;
  labelLayer.hidden = !on;
  if (!on) return;
  const w = innerWidth, h = innerHeight;
  for (const L of labels) {
    projV.copy(L.pos).project(camera);
    const dist = camera.position.distanceTo(L.pos);
    const visible = projV.z < 1 && Math.abs(projV.x) < 1.05 && Math.abs(projV.y) < 1.05 && dist > 1.2 && dist < 18;
    if (visible !== L.vis) { L.el.style.opacity = visible ? '1' : '0'; L.vis = visible; }
    if (visible) L.el.style.transform = `translate(${((projV.x + 1) / 2 * w).toFixed(1)}px, ${((1 - projV.y) / 2 * h - 10).toFixed(1)}px) translate(-50%, -100%)`;
  }
}

// ---------------------------------------------------------------- halo on the followed ball (overview)
const halo = (() => {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(64, 64, 20, 64, 64, 62);
  grd.addColorStop(0, 'rgba(255,240,190,0)'); grd.addColorStop(0.55, 'rgba(255,225,140,0.55)');
  grd.addColorStop(0.72, 'rgba(255,250,215,0.9)'); grd.addColorStop(1, 'rgba(255,225,140,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(c), transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
  s.renderOrder = 10; s.visible = false;
  scene.add(s);
  return s;
})();

// ---------------------------------------------------------------- cameras
const rig = makeRig(camera, renderer.domElement, env, tunnels);
liftChaseView(machine.lift);
const tour = new TourDirector(rig, machine);
rig.controls.autoRotate = true;

// ---------------------------------------------------------------- audio
const audio = createAudio();
let soundOn = false;

// ---------------------------------------------------------------- UI wiring
const branchKeys = ['marimba', 'bells', 'daredevil', 'water', 'castle', 'gong'];
const counts = Object.fromEntries(branchKeys.map((k) => [k, 0]));
const routesEl = $('#routes');
const ROUTE_OPTIONS = [
  { value: 'auto', name: 'Flip-flops decide', color: BRANCHES.top.color, blurb: 'Each flip-flop switch alternates, sharing the balls among all six routes.' },
  { value: 'random', name: 'Coin-toss switches', color: '#8f8878', blurb: 'Each switch picks a side at random.' },
  ...branchKeys.map((k) => ({ value: k, name: BRANCHES[k].name, color: BRANCHES[k].color, blurb: BRANCHES[k].blurb, count: true })),
];
for (const o of ROUTE_OPTIONS) {
  const lab = document.createElement('label');
  lab.className = 'route';
  lab.innerHTML = `<input type="radio" name="route" value="${o.value}"${o.value === 'auto' ? ' checked' : ''}><span class="sw" style="background:${o.color}"></span><span class="nm">${o.name}</span><span class="ct"${o.count ? ` id="ct-${o.value}"` : ''}>${o.count ? '0' : ''}</span><span class="blurb">${o.blurb}</span>`;
  lab.querySelector('input').setAttribute('aria-label', o.name);
  routesEl.appendChild(lab);
}
routesEl.addEventListener('change', (e) => { if (e.target.name === 'route') setRoute(e.target.value); });
function setRoute(v) {
  state.route = v;
  for (const ff of Object.values(machine.flipflops)) { ff.lock = null; ff.random = false; }
  if (v === 'random') for (const ff of Object.values(machine.flipflops)) ff.random = ff.name !== 'F5';
  else if (machine.routes[v]) for (const [ff, out] of machine.routes[v]) ff.lock = out;
  const r = routesEl.querySelector(`input[value="${v}"]`);
  if (r && !r.checked) r.checked = true;
  const B = BRANCHES[v];
  pushTicker(B ? `Every ball now takes the ${B.name}` : v === 'random' ? 'The switches are tossing coins' : 'The flip-flops are back in charge', B ? B.color : BRANCHES.top.color);
}

const panel = $('#machinePanel');
$('#panelToggle').addEventListener('click', () => {
  panel.hidden = !panel.hidden;
  $('#panelToggle').setAttribute('aria-expanded', String(!panel.hidden));
  document.body.classList.toggle('panel-open', !panel.hidden);
});

const fmtHour = (h) => { const hh = Math.floor(h) % 24, mm = Math.round((h % 1) * 60); return `${String(hh).padStart(2, '0')}:${String(mm % 60).padStart(2, '0')}`; };
let todTarget = state.hour;
function setHour(h, animate = true) {
  todTarget = h;
  if (!animate) { state.hour = h; env.setTimeOfDay?.(h); }
  $('#tod').value = h; $('#todOut').textContent = fmtHour(h);
  for (const o of document.querySelectorAll('#todPresets button')) o.setAttribute('aria-pressed', String(Math.abs(+o.dataset.h - h) < 0.01));
}
$('#tod').addEventListener('input', (e) => setHour(+e.target.value, false));
for (const b of document.querySelectorAll('#todPresets button')) b.addEventListener('click', () => setHour(+b.dataset.h));

const bindRange = (id, out, fmt, fn) => {
  const el = $(id), o = $(out);
  const upd = () => { o.textContent = fmt(+el.value); fn(+el.value); };
  el.addEventListener('input', upd);
  upd();
};
bindRange('#speed', '#speedOut', (v) => `${v.toFixed(2)}×`, (v) => { state.timeScale = v; });
bindRange('#liftSpeed', '#liftOut', (v) => v.toFixed(2), (v) => { machine.lift.speed = v; });
$('#balls').value = state.balls;
bindRange('#balls', '#ballsOut', (v) => String(v), (v) => setBallCount(v));
bindRange('#vol', '#volOut', (v) => String(Math.round(v * 100)), (v) => audio.setMasterVolume?.(v));
bindRange('#reverb', '#revOut', (v) => String(Math.round(v * 100)), (v) => audio.setReverb?.(v));
bindRange('#amb', '#ambOut', (v) => String(Math.round(v * 100)), (v) => { state.amb = v; audio.setAmbience?.(v, state.hour); });

function setBallCount(n) {
  state.targetBalls = n;
  const balls = world.balls;
  while (balls.length < n) {
    const i = balls.length;
    const b = new Ball(i + 1, BALL_COLORS[i % BALL_COLORS.length], (i % 15) + 1);
    balls.push(b);
    rescue(world, machine.collector, b);
  }
  while (balls.length > n) {
    let idx = -1, sMin = Infinity;
    balls.forEach((b, i) => { if (b.mode === 'track' && b.track === machine.collector && b.s < sMin && b !== state.following) { sMin = b.s; idx = i; } });
    if (idx < 0) break;
    balls.splice(idx, 1);
  }
  $('#mBalls').textContent = balls.length;
}

const runEl = $('#running');
function setRunning(on, announce) {
  state.paused = !on;
  runEl.checked = on;
  if (announce) pushTicker(on ? 'Running' : 'Paused', BRANCHES.top.color);
}
runEl.addEventListener('change', () => setRunning(runEl.checked, true));

// sound: a checkbox so the studio remote can switch it; browsers only let a
// page start audio after a gesture inside it, so a refused start waits for one
const soundEl = $('#soundOn');
let soundArmed = false;
async function setSound(on) {
  soundEl.checked = on;
  if (!on) { soundOn = false; audio.setMuted?.(true); return; }
  try { await audio.start(); } catch (err) { console.warn('audio failed', err); }
  if (!soundEl.checked) return;
  if (audio.ready) {
    soundOn = true;
    audio.setMuted?.(false);
    audio.setMasterVolume?.(+$('#vol').value);
    audio.setReverb?.(+$('#reverb').value);
    audio.setAmbience?.(+$('#amb').value, state.hour);
  } else if (!soundArmed) {
    soundArmed = true;
    pushTicker('Click the beach to let the sound start', BRANCHES.top.color);
    const kick = () => {
      removeEventListener('pointerdown', kick, true); removeEventListener('keydown', kick, true);
      soundArmed = false;
      if (soundEl.checked) audio.resume?.().then(() => setSound(true));
    };
    addEventListener('pointerdown', kick, true); addEventListener('keydown', kick, true);
  }
}
soundEl.addEventListener('change', () => setSound(soundEl.checked));

const camRadios = document.querySelectorAll('input[name="camera"]');
const AUTO_VIEWS = { tour: 'mix', follow: 'follow', features: 'features' };
function setView(v) {
  state.view = v;
  for (const r of camRadios) r.checked = r.value === v;
  if (AUTO_VIEWS[v]) tour.start(AUTO_VIEWS[v]);
  else {
    tour.stop();
    rig.controls.autoRotate = false;
    if (v === 'orbit') rig.setMode('orbit');
    else {
      if (!state.following) follow(pickInterestingBall());
      rig.setMode(v, state.following);
    }
  }
  updateFollowCard(true);
}
for (const r of camRadios) r.addEventListener('change', () => { if (r.checked) setView(r.value); });
rig.onModeChange = (mode) => { if (mode !== 'orbit' && rig.ball) follow(rig.ball, false); };

function pickInterestingBall() {
  const moving = world.balls.filter((b) => b.branch && b.mode !== 'carried');
  return moving[0] || world.balls.find((b) => b.mode === 'carried') || world.balls[0];
}
function follow(b, setMode = true) {
  state.following = b;
  const chip = $('#ballChip');
  chip.querySelector('i').style.background = '#' + b.color.toString(16).padStart(6, '0');
  chip.querySelector('span').textContent = `#${b.id}`;
  if (setMode && (state.view === 'chase' || state.view === 'ride')) rig.setMode(state.view, b);
  if (setMode && state.view === 'orbit') setView('chase');
  updateFollowCard(true);
}
function stepBall(dir) {
  const balls = world.balls;
  let i = balls.indexOf(state.following);
  i = (i + dir + balls.length) % balls.length;
  follow(balls[i]);
}
$('#prevBall').addEventListener('click', () => stepBall(-1));
$('#nextBall').addEventListener('click', () => stepBall(1));
let wantNextLift = false;
$('#nextLift').addEventListener('click', () => { wantNextLift = true; pushTicker('Waiting for the next ball out of the top of the palm…', BRANCHES.top.color); });

// click a ball to chase it
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let downAt = null;
renderer.domElement.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  let best = null, bd = 0.09;
  for (const m of view.ballMeshes) {
    const dd = raycaster.ray.distanceToPoint(m.position);
    const dist = m.position.distanceTo(camera.position);
    const tol = Math.max(0.05, dist * 0.012);
    if (dd < tol && dd < bd + dist * 0.01) { bd = dd; best = m; }
  }
  if (best) { if (AUTO_VIEWS[state.view]) setView('chase'); follow(best.userData.ball); if (state.view === 'orbit') setView('chase'); }
});

addEventListener('keydown', (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (e.target.matches?.('input[type=text], input[type=number], input[type=search], textarea, select, [contenteditable]')) return;
  if (e.key === '1') setView('orbit');
  else if (e.key === '2') setView('chase');
  else if (e.key === '3') setView('ride');
  else if (e.key === '4') setView('tour');
  else if (e.key === '5') setView('follow');
  else if (e.key === '6') setView('features');
  else if (e.key === '[') stepBall(-1);
  else if (e.key === ']') stepBall(1);
  else if (e.key === 'n' || e.key === 'N') $('#nextLift').click();
  else if (e.key === ' ') { e.preventDefault(); setRunning(state.paused, true); }
  else if (e.key === 'h' || e.key === 'H') document.body.classList.toggle('hidden-ui');
  else if (e.key === 'Escape' && state.view === 'orbit') { state.following = null; updateFollowCard(true); }
});

const ticker = $('#ticker');
function pushTicker(text, color) {
  const d = document.createElement('div');
  d.innerHTML = `<i style="background:${color}"></i><span></span>`;
  d.querySelector('span').textContent = text;
  ticker.appendChild(d);
  while (ticker.children.length > 4) ticker.firstChild.remove();
  setTimeout(() => { d.style.opacity = '0'; }, 5200);
  setTimeout(() => d.remove(), 6600);
}

// follow card
const fEls = { card: $('#follow'), sw: $('#fSw'), name: $('#fName'), doing: $('#fDoing'), speed: $('#fSpeed'), h: $('#fHeight'), trips: $('#fTrips') };
let cardTimer = 0;
function describe(b) {
  if (b.mode === 'carried') {
    const k = b.carrier.kind;
    return k === 'lift' ? 'spiralling up inside the palm tree' : k === 'wheel' ? 'riding the Ferris wheel' : k === 'bucket' ? 'waiting in the sand pail' : 'being carried';
  }
  if (b.mode === 'surface') {
    if (b.surf.kind === 'pool') return `swirling round the tide pool · ${b.orbitHz.toFixed(1)} rev/s`;
    return b.surf.name === 'conch' ? `whirling round the conch · ${b.orbitHz.toFixed(1)} rev/s` : 'spiralling through a sand sieve';
  }
  if (b.mode === 'free') {
    const d = machine.devices, p = b.p;
    if (b.inWater || b.basin) return 'splashdown!';
    if (Math.hypot(p.x - d.funnel.cx, p.z - d.funnel.cz) < 0.9 && p.y < d.funnel.yRim) return 'dropping onto the bass pans';
    if (Math.hypot(p.x - d.shipBell.hang.x, p.z - d.shipBell.hang.z) < 1.1 && p.y < d.shipBell.hang.y + 0.6) return 'flying at the ship’s bell';
    if (Math.abs(p.x - machine.tracks.bellRamp0.start.x) < 0.2) return 'bouncing off a steel pan to the next ramp';
    if (b.branch === 'daredevil' && p.y > 3.2) return 'airborne off the surfboard!';
    return 'in the air!';
  }
  const t = b.track;
  if (!t) return '';
  const n = t.name, deg = (a) => Math.round(Math.abs(a) * 180 / Math.PI);
  if (n === 'collector') return inTunnel(b) ? 'rolling through the tunnel under the palm' : b.speed < 0.02 ? 'queueing at the foot of the palm' : 'rolling home round the return channel';
  if (n.startsWith('lane')) return `playing boardwalk ${t.meta.lane}`;
  if (n.startsWith('bellRamp')) return `playing the steel band · ramp ${t.meta.ladder + 1}`;
  if (n === 'glockHelix') return 'spinning down round the lighthouse';
  if (n === 'plunge') return 'dropping in on the wave';
  if (n === 'loop') return 'looping inside the curling wave';
  if (n === 'jump') return 'lining up the surfboard jump';
  if (n === 'landing') return 'landing the jump';
  if (n === 'chute') return 'racing down under the umbrella';
  if (b.sound === 'brush') return 'pushing through the sea grass';
  if (n === 'wsGlass') return 'playing the bottles';
  if (n === 'wsHelix') return `on the palm water slide · ${deg(b.phi)}° up the wall`;
  if (n === 'wsTube') return inTunnel(b) ? 'shooting through the tunnel in the dune' : 'bursting out over the tide pool';
  if (n === 'cHelix') return `on the helter-skelter · ${deg(b.phi)}° up the wall`;
  if (n === 'cGate') return inTunnel(b) ? 'in the culvert under the tower' : 'diving under the curtain wall';
  if (n === 'moat') return 'riding the current round the moat';
  if (n === 'cDrain' || n === 'wsOut' || n === 'darCatch' || n === 'gongCatch') return inTunnel(b) ? 'rolling through a tunnel in the sand' : 'heading home';
  if (['exit', 'f1a', 'f1b', 'f3b', 'darArm0'].includes(n)) return 'choosing a route among the flip-flops';
  const br = BRANCHES[t.branch];
  return br ? `on the ${br.name}` : 'rolling';
}
function updateFollowCard() {
  const b = state.following;
  const show = b && (!AUTO_VIEWS[state.view] || rig.mode !== 'orbit');
  fEls.card.hidden = !show;
  if (!show) return;
  fEls.sw.style.background = '#' + b.color.toString(16).padStart(6, '0');
  fEls.name.textContent = `Ball ${b.id}${b.branch ? ' · ' + BRANCHES[b.branch].short : ''}`;
  fEls.doing.textContent = describe(b);
  fEls.speed.textContent = `${b.speed.toFixed(2)} m/s`;
  fEls.h.textContent = `${b.p.y.toFixed(2)} m`;
  fEls.trips.textContent = String(b.trips);
}

// ---------------------------------------------------------------- simulation events
const ballById = (id) => world.balls.find((b) => b.id === id);
function onInfo(e) {
  tour.onEvent(e);
  switch (e.type) {
    case 'branch': {
      counts[e.branch]++;
      const el = document.getElementById('ct-' + e.branch);
      if (el) el.textContent = counts[e.branch];
      break;
    }
    case 'top':
      if (wantNextLift) { wantNextLift = false; const b = ballById(e.ball); if (b) { follow(b); if (state.view === 'orbit' || AUTO_VIEWS[state.view]) setView('chase'); } }
      break;
    case 'tip': pushTicker(`The sand pail tipped — ${e.count} balls away!`, BRANCHES.gong.color); break;
    case 'melody':
      if (e.name.startsWith('Boardwalk') && Math.random() < 0.5) pushTicker(`${e.name} (ball ${e.ball})`, BRANCHES.marimba.color);
      else if (e.name === 'Bottles' && Math.random() < 0.5) pushTicker(`Ball ${e.ball} plays the bottles: “Row, row, row your boat…”`, BRANCHES.water.color);
      break;
    case 'splash':
      view.water?.splash(e, elapsed);
      if (Math.random() < 0.3) pushTicker(`Splash! Ball ${e.ball} lands in the tide pool at ${e.v.toFixed(1)} m/s`, BRANCHES.water.color);
      break;
    case 'bucket': if (e.count === 2) pushTicker('Two balls in the sand pail… one more tips it', BRANCHES.gong.color); break;
    case 'warn': if (e.why === 'airborne too long') pushTicker(`Ball ${e.ball} flew off onto the sand! (It’s back in the return channel)`, '#999'); break;
  }
}

// ---------------------------------------------------------------- start
async function start(withSound) {
  $('#start').hidden = true;
  if (withSound) await setSound(true);
  setView(IN_STUDIO ? 'features' : 'tour');
  if (!IN_STUDIO) setTimeout(() => pushTicker('Tip: press 2 to chase a ball, 3 to ride on one', BRANCHES.top.color), 2500);
}
$('#startSound').addEventListener('click', () => start(true));
$('#startSilent').addEventListener('click', () => start(false));
if (IN_STUDIO) start(false);
loading.textContent = `${world.tracks.length} tracks · ${(world.tracks.reduce((a, t) => a + t.L, 0)).toFixed(0)} m of rail and flume · ${view.earth.tunnels.length} tunnels in the sand`;

// ---------------------------------------------------------------- loop
let last = performance.now(), acc = 0, elapsed = 0;
const listenerPos = new THREE.Vector3(), fwd = new THREE.Vector3();
const rolling = [];
let statsTimer = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  elapsed += dt;
  if (Math.abs(todTarget - state.hour) > 0.001) {
    state.hour += (todTarget - state.hour) * (1 - Math.exp(-dt * 1.6));
    if (Math.abs(todTarget - state.hour) < 0.01) state.hour = todTarget;
    env.setTimeOfDay?.(state.hour);
    if (soundOn) audio.setAmbience?.(state.amb ?? 0.5, state.hour);
  }
  if (!state.paused) {
    acc += dt * state.timeScale;
    let n = Math.floor(acc / SUBSTEP);
    acc -= n * SUBSTEP;
    if (n > 150) { n = 150; acc = 0; }
    for (let i = 0; i < n; i++) world.step(SUBSTEP);
  }
  const evs = world.drainEvents();
  const tNow = world.t;
  for (const e of evs) {
    if (e.type === 'sound') {
      if (soundOn) {
        const delay = Math.max(0, 0.025 + (e.t - tNow) / Math.max(0.05, state.timeScale));
        audio.hit(e.instrument, { midi: e.midi, velocity: e.velocity, x: e.x, y: e.y, z: e.z, delay });
      }
      if (e.midi != null) state.notes++;
    } else onInfo(e);
  }
  view.night = env.night ?? 0;
  view.update(dt, elapsed);
  tour.update(dt);
  rig.update(dt);
  env.update?.(dt, elapsed, camera);
  view.sand.setTide?.(env.swash ?? 0);
  if (soundOn) {
    camera.getWorldPosition(listenerPos);
    camera.getWorldDirection(fwd);
    audio.setListener(listenerPos, fwd, camera.up);
    rolling.length = 0;
    for (const b of world.balls) rolling.push({ id: b.id, x: b.p.x, y: b.p.y, z: b.p.z, speed: state.paused ? 0 : b.speed * Math.min(1.5, state.timeScale), surface: b.sound, orbitHz: b.orbitHz * state.timeScale });
    audio.updateRolling(rolling);
    const L = machine.lift;
    audio.updateLift({ x: L.cx, y: L.yB + 0.3, z: L.cz, speed: L.speed * state.timeScale, running: !state.paused && L.running });
    const wa = view.water?.anchors;
    if (wa) audio.updateWater?.([
      { id: 'jet', kind: 'jet', ...wa.jet }, { id: 'jet2', kind: 'jet', ...wa.jet2 },
      { id: 'stream', kind: 'stream', ...wa.stream }, { id: 'stream2', kind: 'stream', ...wa.stream2 },
      { id: 'pool', kind: 'pool', ...wa.pool }, { id: 'moat', kind: 'stream', ...wa.moat, level: 0.5 },
    ]);
  }
  const fb = state.following;
  halo.visible = !!fb && rig.mode === 'orbit';
  if (halo.visible) {
    halo.position.set(fb.p.x, fb.p.y, fb.p.z);
    const d = camera.position.distanceTo(halo.position);
    const s = Math.max(0.12, d * 0.035) * (1 + 0.12 * Math.sin(elapsed * 5));
    halo.scale.set(s, s, 1);
  }
  updateLabels();
  cardTimer -= dt;
  if (cardTimer <= 0) { cardTimer = 0.12; updateFollowCard(); }
  statsTimer -= dt;
  if (statsTimer <= 0) {
    statsTimer = 0.5;
    if (state.targetBalls && world.balls.length > state.targetBalls) setBallCount(state.targetBalls);
    $('#mLifted').textContent = machine.lift.lifted;
    $('#mNotes').textContent = state.notes;
  }
  renderer.render(scene, camera);
}
requestAnimationFrame(frame);

addEventListener('resize', () => {
  renderer.setSize(innerWidth, innerHeight);
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
});
document.addEventListener('visibilitychange', () => {
  if (!soundOn) return;
  if (document.hidden) audio.suspend?.(); else audio.resume?.();
});

window.__machine = { machine, world, view, rig, tour, audio, env, state, scene, camera, renderer, setView, follow, setHour };

// beach grass on the dune round the tide pool
function duneTufts() {
  const out = [];
  let a = 7;
  const r = () => ((a = (Math.imul(a ^ (a >>> 15), 1 | a) + 0x6d2b79f5) >>> 0) / 4294967296);
  for (let i = 0; i < 26; i++) {
    const x = 2.6 + r() * 3.4, z = -3.2 + r() * 3.2;
    const p = machine.devices.pool;
    if (Math.hypot(x - p.cx, z - p.cz) < 0.8 || Math.hypot(x - 3.6, z + 2.25) < 0.35) continue;
    out.push([x, z]);
  }
  return out;
}

function fallbackEnvironment(scene) {
  scene.background = new THREE.Color(0x9fc7e0);
  scene.add(new THREE.HemisphereLight(0xdfeeff, 0xc8b08a, 1.2));
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.5);
  sun.position.set(8, 14, 6);
  scene.add(sun);
  return { update() {}, setTimeOfDay() {}, interiorRadius: 24, domeHeight: 30, sun, night: 0 };
}
