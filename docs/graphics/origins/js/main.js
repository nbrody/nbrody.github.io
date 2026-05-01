// Origins — entry point.
// Wires up the canvas, the per-frame loop, the director (timeline + scenes),
// the keyboard controls, and the debug HUD.

import { Director } from './director.js';
import { setupInput } from './input.js';
import { HUD } from './hud.js';

import { Ch1Physics }    from './scenes/ch1_physics.js';
import { Ch2Chemistry }  from './scenes/ch2_chemistry.js';
import { Ch3Biology }    from './scenes/ch3_biology.js';
import { Ch4Psychology } from './scenes/ch4_psychology.js';
import { Ch5Sociology }  from './scenes/ch5_sociology.js';

const canvas = document.getElementById('stage');
const ctx = canvas.getContext('2d');

function resize() {
  const dpr = window.devicePixelRatio || 1;
  canvas.width  = Math.floor(window.innerWidth  * dpr);
  canvas.height = Math.floor(window.innerHeight * dpr);
  // Work in CSS pixels; the transform handles HiDPI.
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
window.addEventListener('resize', resize);
resize();

const director = new Director({
  canvas, ctx,
  scenes: [
    new Ch1Physics(),
    new Ch2Chemistry(),
    new Ch3Biology(),
    new Ch4Psychology(),
    new Ch5Sociology(),
  ],
  crossfadeDuration: 2.0,
});

const hud = new HUD();

setupInput({
  onTogglePause:      () => director.togglePause(),
  onNext:             () => director.advance(),
  onPrev:             () => director.retreat(),
  onJump:             (i) => director.jumpTo(i),
  onToggleHud:        () => hud.toggle(),
  onToggleFullscreen: () => {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen();
  },
});

director.init();

let last = performance.now();
function frame(now) {
  const dt = Math.min(0.1, (now - last) / 1000); // clamp huge dt (tab switch)
  last = now;
  director.update(dt, now / 1000);
  director.render();
  hud.update({ director, fps: 1 / dt });
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
