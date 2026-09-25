// Glass House Ball Machine — bootstrap: renderer, simulation loop, sound, cameras, UI.
import * as THREE from 'three';
import { buildMachine, BRANCHES, BALL_COLORS, rescue } from './sim/layout.js';
import { Ball } from './sim/world.js';
import { SUBSTEP } from './sim/constants.js';
import { MachineView } from './render/machineView.js';
import { CameraRig, TourDirector, PRESETS } from './render/cameras.js';
import { buildEnvironment } from './environment.js';
import { AudioEngine } from './audio.js';

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
const camera = new THREE.PerspectiveCamera(48, innerWidth / innerHeight, 0.02, 400);

let env;
try {
  env = buildEnvironment(scene, renderer, {});
} catch (err) {
  console.error('environment failed', err);
  env = fallbackEnvironment(scene);
}

// ---------------------------------------------------------------- machine
const params = new URLSearchParams(location.search);
const state = {
  balls: +(params.get('balls') || 30),
  timeScale: 1,
  paused: false,
  route: 'auto',
  hour: 17.5,
  following: null,
  view: 'orbit',
  notes: 0,
};
const machine = buildMachine({ balls: state.balls });
const world = machine.world;
if (machine.warnings.length) console.info('layout notes:', machine.warnings);
const view = new MachineView(scene, renderer, machine);
env.setTimeOfDay?.(state.hour);

// ---------------------------------------------------------------- device labels
const labelLayer = $('#labelLayer');
const labels = [];
{
  const d = machine.devices;
  const tr = machine.tracks;
  const mid = (t, f = 0.5) => t.pointAt(t.L * f);
  const up = (p, h) => new THREE.Vector3(p.x, p.y + h, p.z);
  const defs = [
    ['Chain lift', 'top', up({ x: 0.06, y: machine.lift.yT + 1.2, z: 0 }, 0)],
    ['Flip-flop switches', 'top', up(machine.flipflops.F1.pos, 0.28)],
    ['Marimba lanes', 'marimba', up(mid(tr.laneI, 0.35), 0.25)],
    ['Ball wheel', 'marimba', up({ x: d.wheel.cx, y: d.wheel.cy, z: d.wheel.cz }, 0.62)],
    ['Glockenspiel spiral', 'marimba', up(tr.glockHelix.start, 0.3)],
    ['Bell tower', 'bells', up(tr.bellRamp0.start, 0.35)],
    ['Loop-the-loop', 'daredevil', up(mid(tr.loop), 0.4)],
    ['Ski jump', 'daredevil', up(tr.jump.end, 0.2)],
    ['Vortex funnel', 'daredevil', up({ x: d.funnel.cx, y: d.funnel.yRim, z: d.funnel.cz }, 0.18)],
    ['Tom-toms', 'daredevil', up(d.drum2.center, 0.25)],
    ['Water glasses', 'water', up(mid(tr.wsGlass, 0.45), 0.22)],
    ['Water slide', 'water', up(tr.wsHelix.start, 0.62)],
    ['Glass tunnel', 'water', up(mid(tr.wsTube, 0.55), 0.22)],
    ['Whirlpool', 'water', up({ x: d.pool.cx, y: d.pool.wallTop, z: d.pool.cz }, 0.3)],
    ['Plinko case', 'plinko', up({ x: d.plinko.center.x, y: d.plinko.center.y + d.plinko.height / 2, z: d.plinko.center.z }, 0.72)],
    ['Gong bucket', 'gong', up(d.bucket.pivot, 0.3)],
    ['Gong', 'gong', up(d.gong.center, d.gong.r + 0.35)],
    ['Return trough', 'collector', up(machine.ringPoint(150), 0.2)],
  ];
  for (const [name, br, pos] of defs) {
    const el = document.createElement('button');
    el.className = 'tag';
    el.type = 'button';
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
    const visible = projV.z < 1 && Math.abs(projV.x) < 1.05 && Math.abs(projV.y) < 1.05 && dist > 1.2 && dist < 17;
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
  grd.addColorStop(0, 'rgba(255,230,160,0)');
  grd.addColorStop(0.55, 'rgba(255,215,120,0.55)');
  grd.addColorStop(0.72, 'rgba(255,240,200,0.9)');
  grd.addColorStop(1, 'rgba(255,215,120,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, blending: THREE.AdditiveBlending }));
  s.renderOrder = 10;
  s.visible = false;
  scene.add(s);
  return s;
})();

// ---------------------------------------------------------------- cameras
const rig = new CameraRig(camera, renderer.domElement, env);
const tour = new TourDirector(rig, machine);
rig.controls.autoRotate = true;

// ---------------------------------------------------------------- audio
const audio = new AudioEngine();
let soundOn = false;

// ---------------------------------------------------------------- UI wiring
const branchKeys = ['marimba', 'bells', 'daredevil', 'water', 'plinko', 'gong'];
const counts = Object.fromEntries(branchKeys.map((k) => [k, 0]));
// Route is one radio group (the Graphics Studio remote shows it as a picker):
// the flip-flops decide, the switches toss coins, or every ball takes one route.
const routesEl = $('#routes');
const ROUTE_OPTIONS = [
  { value: 'auto', name: 'Flip-flops decide', color: BRANCHES.top.color, blurb: 'Each switch alternates, sharing the balls among all six routes.' },
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
    // take balls out from the back of the return queue first
    let idx = -1, sMin = Infinity;
    balls.forEach((b, i) => { if (b.mode === 'track' && b.track === machine.collector && b.s < sMin && b !== state.following) { sMin = b.s; idx = i; } });
    if (idx < 0) break;
    balls.splice(idx, 1);
  }
  $('#mBalls').textContent = balls.length;
}

// running / paused
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
  if (!soundEl.checked) return; // switched off again while starting
  if (audio.ready) {
    soundOn = true;
    audio.setMuted?.(false);
    audio.setMasterVolume?.(+$('#vol').value);
    audio.setReverb?.(+$('#reverb').value);
    audio.setAmbience?.(+$('#amb').value, state.hour);
  } else if (!soundArmed) {
    soundArmed = true;
    pushTicker('Click the machine to let the sound start', BRANCHES.top.color);
    const kick = () => {
      removeEventListener('pointerdown', kick, true); removeEventListener('keydown', kick, true);
      soundArmed = false;
      if (soundEl.checked) audio.resume?.().then(() => setSound(true));
    };
    addEventListener('pointerdown', kick, true); addEventListener('keydown', kick, true);
  }
}
soundEl.addEventListener('change', () => setSound(soundEl.checked));

// view dock (a radio group: the studio remote shows it as a picker)
const camRadios = document.querySelectorAll('input[name="camera"]');
const AUTO_VIEWS = { tour: 'mix', follow: 'follow', features: 'features' };
function setView(v) {
  state.view = v;
  for (const r of camRadios) r.checked = r.value === v;
  if (AUTO_VIEWS[v]) { tour.start(AUTO_VIEWS[v]); }
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
  if (setMode && state.view === 'orbit') { setView('chase'); }
  updateFollowCard(true);
}
function stepBall(d) {
  const balls = world.balls;
  let i = balls.indexOf(state.following);
  i = (i + d + balls.length) % balls.length;
  follow(balls[i]);
}
$('#prevBall').addEventListener('click', () => stepBall(-1));
$('#nextBall').addEventListener('click', () => stepBall(1));
let wantNextLift = false;
$('#nextLift').addEventListener('click', () => { wantNextLift = true; pushTicker('Waiting for the next ball at the top of the lift…', BRANCHES.top.color); });

// click a ball to chase it
const raycaster = new THREE.Raycaster();
const ndc = new THREE.Vector2();
let downAt = null;
renderer.domElement.addEventListener('pointerdown', (e) => { downAt = [e.clientX, e.clientY]; });
renderer.domElement.addEventListener('pointerup', (e) => {
  if (!downAt || Math.hypot(e.clientX - downAt[0], e.clientY - downAt[1]) > 5) return;
  ndc.set((e.clientX / innerWidth) * 2 - 1, -(e.clientY / innerHeight) * 2 + 1);
  raycaster.setFromCamera(ndc, camera);
  // generous picking: nearest ball to the ray within a few cm
  let best = null, bd = 0.09;
  for (const m of view.ballMeshes) {
    const d = raycaster.ray.distanceToPoint(m.position);
    const dist = m.position.distanceTo(camera.position);
    const tol = Math.max(0.05, dist * 0.012);
    if (d < tol && d < bd + dist * 0.01) { bd = d; best = m; }
  }
  if (best) { if (AUTO_VIEWS[state.view]) setView('chase'); follow(best.userData.ball); if (state.view === 'orbit') setView('chase'); }
});

// keyboard
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

// ticker
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
    return k === 'lift' ? 'riding the chain lift' : k === 'wheel' ? 'turning the ball wheel' : k === 'bucket' ? 'waiting in the gong bucket' : 'being carried';
  }
  if (b.mode === 'surface') {
    if (b.surf.kind === 'pool') return `swirling round the whirlpool · ${b.orbitHz.toFixed(1)} rev/s`;
    return b.surf.name === 'vortex' ? `circling the vortex funnel · ${b.orbitHz.toFixed(1)} rev/s` : 'spiralling down a hopper';
  }
  if (b.mode === 'free') {
    const d = machine.devices, p = b.p;
    if (b.inWater || b.basin) return 'splashdown!';
    const pl = d.plinko;
    if (Math.abs(p.x - pl.center.x) < pl.width / 2 + 0.05 && Math.abs(p.z - pl.center.z) < 0.12 && Math.abs(p.y - pl.center.y) < pl.height / 2 + 0.1) return 'bouncing down through the plinko pegs';
    if (Math.hypot(p.x - d.funnel.cx, p.z - d.funnel.cz) < 0.9 && p.y < d.funnel.yRim) return 'dropping onto the tom-toms';
    if (Math.hypot(p.x - d.gong.center.x, p.z - d.gong.center.z) < 1.1 && p.y < d.gong.center.y + 0.6) return 'flying at the gong';
    if (Math.abs(p.x - machine.tracks.bellRamp0.start.x) < 0.2) return 'dropping past a bell to the next ramp';
    if (b.branch === 'daredevil' && p.y > 3.2) return 'airborne off the ski jump!';
    return 'in the air!';
  }
  const t = b.track;
  if (!t) return '';
  const n = t.name;
  if (n === 'collector') return b.speed < 0.02 ? 'queueing for the lift' : 'rolling home in the return trough';
  if (n.startsWith('lane')) return `playing marimba lane ${t.meta.lane}`;
  if (n.startsWith('bellRamp')) return `ringing down the bell tower · level ${t.meta.ladder + 1}`;
  if (n === 'glockHelix') return 'spinning down the glockenspiel spiral';
  if (n === 'plunge') return 'plunging toward the loop';
  if (n === 'loop') return 'looping the loop';
  if (n === 'jump') return 'lining up the ski jump';
  if (n === 'landing') return 'landing the jump';
  if (n === 'chute') return 'racing down the gong chute';
  if (b.sound === 'brush') return 'pushing through the brush brake';
  if (n === 'wsGlass') return 'playing the water glasses';
  if (n === 'wsHelix') return `riding the water slide · ${Math.round(Math.abs(b.phi) * 180 / Math.PI)}° up the wall`;
  if (n === 'wsTube') return `shooting through the glass tunnel · ${Math.round(Math.abs(b.phi) * 180 / Math.PI)}° up the wall`;
  if (n === 'wsOut') return 'dripping its way home';
  if (['exit', 'f1a', 'f1b', 'f3b', 'darArm0'].includes(n)) return 'choosing a route at the crown';
  const br = BRANCHES[t.branch];
  return br ? `on the ${br.name}` : 'rolling';
}
function updateFollowCard(force) {
  const b = state.following;
  const show = b && (!AUTO_VIEWS[state.view] || rig.mode !== 'orbit');
  fEls.card.hidden = !show;
  if (!show) return;
  const col = '#' + b.color.toString(16).padStart(6, '0');
  fEls.sw.style.background = col;
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
    case 'tip': {
      pushTicker(`The gong bucket tipped — ${e.count} balls away!`, BRANCHES.gong.color);
      view.flash = 1;
      break;
    }
    case 'gong': {
      // the cuckoo pops out of its house on the gong frame and whistles
      if (soundOn && world.t - (state.lastCuckoo ?? -9) > 2.5) {
        state.lastCuckoo = world.t;
        const g = machine.devices.gong;
        audio.hit('whistle', { velocity: 0.6, x: g.center.x, y: g.center.y + g.r + 0.3, z: g.center.z, delay: 0.25 });
      }
      break;
    }
    case 'melody':
      if (e.name.startsWith('Marimba') && Math.random() < 0.6) pushTicker(`${e.name} (ball ${e.ball})`, BRANCHES.marimba.color);
      else if (e.name === 'Water glasses' && Math.random() < 0.5) pushTicker(`Ball ${e.ball} plays the water glasses: “Row, row, row your boat…”`, BRANCHES.water.color);
      break;
    case 'splash':
      view.water?.splash(e, elapsed);
      if (Math.random() < 0.3) pushTicker(`Splash! Ball ${e.ball} hits the whirlpool at ${e.v.toFixed(1)} m/s`, BRANCHES.water.color);
      break;
    case 'bucket': if (e.count === 2) pushTicker('Two balls in the gong bucket… one more tips it', BRANCHES.gong.color); break;
    case 'warn': if (e.why === 'airborne too long') pushTicker(`Ball ${e.ball} flew off! (A stray; it’s back in the return trough)`, '#999'); break;
  }
}

// ---------------------------------------------------------------- start
async function start(withSound) {
  $('#start').hidden = true;
  if (withSound) await setSound(true);
  // the studio's Simple page offers "follow a ball" and "feature to feature": open on the second
  setView(IN_STUDIO ? 'features' : 'tour');
  if (!IN_STUDIO) setTimeout(() => pushTicker('Tip: press 2 to chase a ball, 3 to ride on one', BRANCHES.top.color), 2500);
}
$('#startSound').addEventListener('click', () => start(true));
$('#startSilent').addEventListener('click', () => start(false));
// Inside the Graphics Studio stage the studio owns the controls: skip the
// welcome card and start silently (Sound on is on the studio's Simple page).
if (IN_STUDIO) start(false);
loading.textContent = `${world.tracks.length} tracks · ${(world.tracks.reduce((a, t) => a + t.L, 0)).toFixed(0)} m of rail · ${view.postCount} support posts`;

// ---------------------------------------------------------------- loop
let last = performance.now(), acc = 0, elapsed = 0;
const listenerPos = new THREE.Vector3(), fwd = new THREE.Vector3(), upv = new THREE.Vector3();
const rolling = [];
let statsTimer = 0;
function frame(now) {
  requestAnimationFrame(frame);
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  elapsed += dt;
  // time of day easing
  if (Math.abs(todTarget - state.hour) > 0.001) {
    state.hour += (todTarget - state.hour) * (1 - Math.exp(-dt * 1.6));
    if (Math.abs(todTarget - state.hour) < 0.01) state.hour = todTarget;
    env.setTimeOfDay?.(state.hour);
    if (soundOn) audio.setAmbience?.(state.amb ?? 0.5, state.hour);
  }
  // physics
  if (!state.paused) {
    acc += dt * state.timeScale;
    let n = Math.floor(acc / SUBSTEP);
    acc -= n * SUBSTEP;
    if (n > 150) { n = 150; acc = 0; }
    for (let i = 0; i < n; i++) world.step(SUBSTEP);
  }
  // events
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
  // visuals
  const h = state.hour;
  view.night = h >= 19 ? Math.min(1, (h - 19) / 1.5) : h <= 6.5 ? Math.min(1, (6.5 - h) / 1.5) : 0;
  view.hour = h;
  view.update(dt, elapsed);
  tour.update(dt);
  rig.update(dt);
  env.update?.(dt, elapsed, camera);
  // sound: listener + continuous voices
  if (soundOn) {
    camera.getWorldPosition(listenerPos);
    camera.getWorldDirection(fwd);
    upv.copy(camera.up).applyQuaternion(new THREE.Quaternion()).normalize();
    audio.setListener(listenerPos, fwd, camera.up);
    rolling.length = 0;
    for (const b of world.balls) {
      rolling.push({ id: b.id, x: b.p.x, y: b.p.y, z: b.p.z, speed: state.paused ? 0 : b.speed * Math.min(1.5, state.timeScale), surface: b.sound, orbitHz: b.orbitHz * state.timeScale });
    }
    audio.updateRolling(rolling);
    const L = machine.lift;
    audio.updateLift({ x: L.cx, y: L.yB + 0.2, z: L.cz, speed: L.speed * state.timeScale, running: !state.paused && L.running });
    const wa = view.water?.anchors;
    if (wa) audio.updateWater?.([
      { id: 'jet', kind: 'jet', ...wa.jet }, { id: 'stream', kind: 'stream', ...wa.stream }, { id: 'pool', kind: 'pool', ...wa.pool },
    ]);
  }
  // halo marks the chosen ball when viewing the whole machine
  const fb = state.following;
  halo.visible = !!fb && rig.mode === 'orbit';
  if (halo.visible) {
    halo.position.set(fb.p.x, fb.p.y, fb.p.z);
    const d = camera.position.distanceTo(halo.position);
    const s = Math.max(0.12, d * 0.035) * (1 + 0.12 * Math.sin(elapsed * 5));
    halo.scale.set(s, s, 1);
  }
  // UI
  updateLabels();
  cardTimer -= dt;
  if (cardTimer <= 0) { cardTimer = 0.12; updateFollowCard(); }
  statsTimer -= dt;
  if (statsTimer <= 0) {
    statsTimer = 0.5;
    // retire extra balls as they come home to the queue
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

// expose for debugging
window.__machine = { machine, world, view, rig, tour, audio, env, state, scene, camera, renderer, setView, follow };

// Minimal stand-in if the environment module fails to load.
function fallbackEnvironment(scene) {
  scene.background = new THREE.Color(0x9fb7c9);
  const hemi = new THREE.HemisphereLight(0xdfeeff, 0x6a5a40, 1.2);
  scene.add(hemi);
  const sun = new THREE.DirectionalLight(0xfff0d8, 2.5);
  sun.position.set(8, 14, 6);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -8, right: 8, top: 8, bottom: -8, near: 1, far: 40 });
  scene.add(sun);
  const floor = new THREE.Mesh(new THREE.CircleGeometry(14, 64), new THREE.MeshStandardMaterial({ color: 0xcdbfa6, roughness: 0.8 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = 0.25; floor.receiveShadow = true;
  scene.add(floor);
  return { update() {}, setTimeOfDay() {}, interiorRadius: 14, domeHeight: 18, sun };
}
