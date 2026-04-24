/* ------------------------------------------------------------------ *
 *  Shared state, constants, and the draw scheduler.
 * ------------------------------------------------------------------ */

export const N = 5;
export const TAU = 2 * Math.PI;

/* Direction vectors */
export const E = [];   // physical projection  π(e_k)
export const Ei = [];  // internal pentagonal  π⊥(e_k)
for (let k = 0; k < N; k++) {
    E.push([Math.cos(TAU * k / N), Math.sin(TAU * k / N)]);
    Ei.push([Math.cos(2 * TAU * k / N), Math.sin(2 * TAU * k / N)]);
}

/* Mutable state shared between modules */
export const state = {
    gamma: [0.2, 0.2, 0.2, 0.2, 0.2],
    scale: 30,                        // px per unit edge
    cx: 0, cy: 0,                     // world coord of viewport center
    palette: 'gold',
    wander: false,
    wanderSpeed: 1.0,                 // multiplier in [0, 1]
    wanderVel: [0, 0, 0, 0, 0],
};

export const view = { W: 0, H: 0, DPR: 1 };

/* Draw scheduler – render.js registers the draw fn, everyone else just calls schedule(). */
let drawFn = null;
let raf = 0;

export function setDrawFn(fn) { drawFn = fn; }

export function schedule() {
    if (raf) return;
    raf = requestAnimationFrame(() => { raf = 0; if (drawFn) drawFn(); });
}
