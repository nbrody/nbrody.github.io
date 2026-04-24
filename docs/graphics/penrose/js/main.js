/* ------------------------------------------------------------------ *
 *  Penrose — entry point. Wires state, rendering, UI, interaction,
 *  wander, and the cube-flip animation module.
 * ------------------------------------------------------------------ */

import { setDrawFn } from './state.js';
import { initRender, getCanvas, draw } from './render.js';
import { initUI } from './ui.js';
import { initInteraction } from './interaction.js';
import { initWander } from './wander.js';
import { initAnimations } from './animations.js';

setDrawFn(draw);
initUI();
initAnimations();
initRender();
initInteraction(getCanvas());
initWander();
