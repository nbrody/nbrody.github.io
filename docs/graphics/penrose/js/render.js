/* ------------------------------------------------------------------ *
 *  Canvas setup, palettes, and the main draw pass.
 * ------------------------------------------------------------------ */

import { state, view, schedule, minScaleForViewport } from './state.js';
import { generateRhombi } from './tiling.js';
import { updateRadar, updateSumPill, updateReadout, updateRhombCount } from './ui.js';
import {
    buildClusters, updateClusterState, staticFaceFor,
    paintFlightTo, hasLiveAnimations
} from './animations.js';

export const palettes = {
    gold: (r) => r.type === 0
        ? ['#d8a84a', '#b8893a']
        : ['#4a6572', '#344b56'],
    bi: (r) => r.type === 0
        ? ['#c75f3f', '#994632']
        : ['#2b4a5e', '#1d3442'],
    orient: (r) => {
        const hue = ((r.j + r.jp) * 36 + r.type * 18) % 360;
        const sat = r.type === 0 ? 45 : 32;
        return [`hsl(${hue}, ${sat}%, 54%)`, `hsl(${hue}, ${sat}%, 40%)`];
    },
    height: (r) => {
        const t = ((r.h % 7) + 7) % 7 / 7;
        const c = 28 + Math.round(42 * t);
        return r.type === 0
            ? [`hsl(38, 46%, ${c}%)`, `hsl(38, 46%, ${c - 12}%)`]
            : [`hsl(208, 24%, ${c - 4}%)`, `hsl(208, 24%, ${c - 18}%)`];
    }
};

let canvas, ctx, stage;

export function initRender() {
    canvas = document.getElementById('tiling');
    ctx = canvas.getContext('2d');
    stage = document.getElementById('stage');
    window.addEventListener('resize', resize);
    resize();
}

export function getCanvas() { return canvas; }

function resize() {
    view.DPR = window.devicePixelRatio || 1;
    view.W = stage.clientWidth;
    view.H = stage.clientHeight;
    canvas.width = Math.round(view.W * view.DPR);
    canvas.height = Math.round(view.H * view.DPR);
    canvas.style.width = view.W + 'px';
    canvas.style.height = view.H + 'px';
    ctx.setTransform(view.DPR, 0, 0, view.DPR, 0, 0);
    state.scale = Math.max(state.scale, minScaleForViewport());
    schedule();
}

function paintRhombus(r, fill, stroke) {
    const s = state.scale;
    const halfW = view.W / 2, halfH = view.H / 2;
    ctx.beginPath();
    ctx.moveTo(halfW + (r.x1 - state.cx) * s, halfH - (r.y1 - state.cy) * s);
    ctx.lineTo(halfW + (r.x2 - state.cx) * s, halfH - (r.y2 - state.cy) * s);
    ctx.lineTo(halfW + (r.x3 - state.cx) * s, halfH - (r.y3 - state.cy) * s);
    ctx.lineTo(halfW + (r.x4 - state.cx) * s, halfH - (r.y4 - state.cy) * s);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.stroke();
}

export function draw() {
    ctx.clearRect(0, 0, view.W, view.H);

    const rhombi = generateRhombi();
    updateRhombCount(rhombi.length);

    const clusters = buildClusters(rhombi);
    updateClusterState(clusters);

    const pal = palettes[state.palette];
    ctx.lineJoin = 'round';
    ctx.lineWidth = Math.min(1, state.scale * 0.025);

    // Pass 1 — the tiling itself. Cluster rhombi get isometric cube shading;
    // everyone else gets the active palette.
    for (const r of rhombi) {
        const cf = staticFaceFor(r);
        if (cf) {
            paintRhombus(r, cf.fill, cf.stroke);
        } else {
            const [fill, stroke] = pal(r);
            paintRhombus(r, fill, stroke);
        }
    }

    // Pass 2 — OLD cube ghosts flying out along their axes.
    paintFlightTo(ctx, state, view);

    updateRadar();
    updateSumPill();
    updateReadout();

    if (hasLiveAnimations()) schedule();
}
