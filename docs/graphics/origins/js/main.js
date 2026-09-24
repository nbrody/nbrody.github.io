// Origins — entry point.
// Wires up the renderer, the director (timeline + scenes), the shared tempo,
// captions, keyboard + studio controls, and the debug HUD.
//
// URL parameters (all optional):
//   ch=3&t=40    start at chapter 3, 40 s in        pause=1   start paused
//   speed=2      playback rate (rehearsal)          bpm=90    pulse tempo
//   captions=0   hide captions and timeline         hud=1     show the HUD
//   scale=1      render-resolution cap (× CSS px)   autoscale=0  never lower it

import { Renderer } from './gfx/renderer.js';
import { Director } from './director.js';
import { Tempo } from './tempo.js';
import { Captions } from './captions.js';
import { setupInput } from './input.js';
import { HUD } from './hud.js';

import { Ch1Physics } from './scenes/ch1_physics.js';
import { Ch2Chemistry } from './scenes/ch2_chemistry.js';
import { Ch3Biology } from './scenes/ch3_biology.js';
import { Ch4Psychology } from './scenes/ch4_psychology.js';
import { Ch5Sociology } from './scenes/ch5_sociology.js';

const params = new URLSearchParams(location.search);
const num = (k, d) => (params.has(k) && !Number.isNaN(parseFloat(params.get(k))) ? parseFloat(params.get(k)) : d);

const canvas = document.getElementById('stage');
let R;
try {
  R = new Renderer(canvas, { scale: num('scale', 1.5) });
} catch (err) {
  document.body.classList.add('show-cursor');
  document.getElementById('fallback').hidden = false;
  throw err;
}
window.addEventListener('resize', () => R.resize());

const tempo = new Tempo(num('bpm', 72));
const scenes = [new Ch1Physics(), new Ch2Chemistry(), new Ch3Biology(), new Ch4Psychology(), new Ch5Sociology()];
const director = new Director({ R, scenes, tempo, crossfade: 2.5 });
director.init();
director.speed = num('speed', 1);
if (params.has('ch') || params.has('t')) director.seek(num('ch', 1) - 1, num('t', 0));
if (params.get('pause') === '1') director.paused = true;

const captions = new Captions(document.getElementById('captions'));
if (params.get('captions') === '0') captions.setEnabled(false);
const hud = new HUD();
if (params.get('hud') === '1') hud.toggle(true);

// ── studio controls (hidden form controls the Graphics Studio remote drives) ──
const $ = (id) => document.getElementById(id);
const chapterSelect = $('chapterSelect');
scenes.forEach((s, i) => chapterSelect.add(new Option(`${s.num} · ${s.title}`, String(i))));
chapterSelect.addEventListener('change', () => director.jumpTo(parseInt(chapterSelect.value, 10)));
$('playPause').addEventListener('click', () => director.togglePause());
$('captionsToggle').checked = captions.enabled;
$('captionsToggle').addEventListener('change', (e) => captions.setEnabled(e.target.checked));
$('bpmInput').value = tempo.bpm;
$('bpmInput').addEventListener('change', (e) => {
  const v = parseFloat(e.target.value);
  if (v >= 30 && v <= 240) tempo.bpm = v;
});
const tap = () => {
  tempo.tap(director.showTime);
  $('bpmInput').value = tempo.bpm;
};
$('tapTempo').addEventListener('click', tap);

setupInput({
  onTogglePause: () => director.togglePause(),
  onNext: () => director.advance(),
  onPrev: () => director.retreat(),
  onJump: (i) => director.jumpTo(i),
  onScrub: (s) => director.scrub(s),
  onSpeed: (f) => { director.speed = Math.min(16, Math.max(0.125, director.speed * f)); },
  onToggleHud: () => hud.toggle(),
  onToggleCaptions: () => { captions.toggle(); $('captionsToggle').checked = captions.enabled; },
  onTap: tap,
  onRestart: () => director.seek(0, 0),
  onToggleFullscreen: () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen?.();
  },
});

// If this machine can't keep up, step the render resolution down (never up,
// so it can't oscillate). Disable with ?autoscale=0.
const autoscale = { on: params.get('autoscale') !== '0', sum: 0, n: 0 };
function adapt(rawDt) {
  if (!autoscale.on || document.visibilityState !== 'visible' || rawDt > 0.06) return;
  autoscale.sum += rawDt;
  if (++autoscale.n < 120) return;
  const avg = autoscale.sum / autoscale.n;
  autoscale.sum = 0; autoscale.n = 0;
  const current = Math.min(window.devicePixelRatio || 1, R.scaleCap);
  if (avg > 0.024 && current > 0.75) {
    R.scaleCap = Math.max(0.75, current - 0.25);
    R.resize();
    console.info(`[origins] slow frames (${(1 / avg).toFixed(0)} fps): render scale → ${R.scaleCap}`);
  }
}

let last = performance.now();
function frame(now) {
  const raw = (now - last) / 1000;
  const dt = Math.min(0.1, raw); // clamp huge dt (tab switch)
  last = now;
  adapt(raw);
  director.update(dt);
  director.render();
  captions.update(director);
  hud.update({ director, tempo, fps: dt > 0 ? 1 / dt : 60 });
  if (chapterSelect.value !== String(director.activeIndex) && document.activeElement !== chapterSelect) {
    chapterSelect.value = String(director.activeIndex);
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);

// handy for rehearsal from the console
window.origins = { director, tempo, captions, R };
