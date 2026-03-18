/* ============================================================
   Canvas — Setup, resize, and animation loop
   ============================================================ */

export const harmonicColors = [
    '#60a5fa', '#a78bfa', '#f472b6', '#f59e0b',
    '#34d399', '#22d3ee', '#fb7185', '#fbbf24'
];

const canvas = document.getElementById('main-canvas');
const ctx = canvas.getContext('2d');

let W = 0, H = 0;
let animId = null;
let drawCallbacks = [];

export function getCtx() { return ctx; }
export function getW() { return W; }
export function getH() { return H; }
export function getCanvas() { return canvas; }

export function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    W = rect.width;
    H = rect.height;
    canvas.width = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width = W + 'px';
    canvas.style.height = H + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

export function setDrawCallbacks(callbacks) {
    drawCallbacks = callbacks;
}

function drawFrame(ts) {
    animId = requestAnimationFrame(drawFrame);
    ctx.clearRect(0, 0, W, H);
    drawCallbacks.forEach(cb => cb(ts, ctx, W, H));
}

export function startLoop() {
    resize();
    window.addEventListener('resize', resize);
    animId = requestAnimationFrame(drawFrame);
}
