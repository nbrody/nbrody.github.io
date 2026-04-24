/* ------------------------------------------------------------------ *
 *  Wander mode — each γ_k performs a damped random walk in [0,1],
 *  with soft walls that nudge it back from the boundary.
 * ------------------------------------------------------------------ */

import { N, state, schedule } from './state.js';
import { syncSliders } from './ui.js';

const DAMPING      = 0.985;   // per-step velocity decay
const BASE_FORCE   = 0.00045; // random-walk kick stdev
const MAX_VEL      = 0.02;    // hard velocity clamp
const BOUND_SOFT   = 0.06;    // distance from edge where soft-wall kicks in
const BOUND_PUSH   = 0.0009;  // force from soft wall
const MARGIN       = 0.001;   // hard-clamp margin (keeps gamma strictly inside)

let rafId = 0;
let btn = null;
let speedInput = null;

function gauss() {
    // Box-Muller
    const u = Math.max(1e-12, Math.random());
    const v = Math.random();
    return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function step() {
    if (!state.wander) { rafId = 0; return; }

    const speed = state.wanderSpeed;                // 0..1+
    const force = BASE_FORCE * speed;
    const velCap = MAX_VEL * Math.max(0.2, speed);

    for (let k = 0; k < N; k++) {
        state.wanderVel[k] += gauss() * force;

        // soft walls
        if (state.gamma[k] < BOUND_SOFT)       state.wanderVel[k] += BOUND_PUSH * speed;
        if (state.gamma[k] > 1 - BOUND_SOFT)   state.wanderVel[k] -= BOUND_PUSH * speed;

        // damping
        state.wanderVel[k] *= DAMPING;

        // velocity clamp
        if (state.wanderVel[k] >  velCap) state.wanderVel[k] =  velCap;
        if (state.wanderVel[k] < -velCap) state.wanderVel[k] = -velCap;

        // integrate
        state.gamma[k] += state.wanderVel[k];

        // hard reflect at the unit interval
        if (state.gamma[k] < MARGIN) {
            state.gamma[k] = MARGIN;
            state.wanderVel[k] = Math.abs(state.wanderVel[k]);
        }
        if (state.gamma[k] > 1 - MARGIN) {
            state.gamma[k] = 1 - MARGIN;
            state.wanderVel[k] = -Math.abs(state.wanderVel[k]);
        }
    }

    syncSliders();
    schedule();
    rafId = requestAnimationFrame(step);
}

function setWander(on) {
    state.wander = on;
    if (btn) {
        btn.classList.toggle('active', on);
        btn.textContent = on ? 'Wander · on' : 'Wander · off';
    }
    if (on && !rafId) {
        rafId = requestAnimationFrame(step);
    }
}

export function initWander() {
    btn = document.getElementById('wanderBtn');
    speedInput = document.getElementById('wanderSpeed');
    const speedVal = document.getElementById('wanderSpeedVal');

    if (btn) {
        btn.addEventListener('click', () => setWander(!state.wander));
    }

    if (speedInput) {
        const sync = () => {
            state.wanderSpeed = +speedInput.value;
            if (speedVal) speedVal.textContent = state.wanderSpeed.toFixed(2);
        };
        speedInput.addEventListener('input', sync);
        sync();
    }
}
