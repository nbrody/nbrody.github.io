/* ------------------------------------------------------------------ *
 *  Pan, wheel-zoom, and two-finger pinch-zoom on the canvas.
 * ------------------------------------------------------------------ */

import { state, schedule } from './state.js';

const MIN_SCALE = 6;
const MAX_SCALE = 220;

function zoomAt(canvas, factor, clientX, clientY) {
    const rect = canvas.getBoundingClientRect();
    const mx = clientX - rect.left - rect.width / 2;
    const my = clientY - rect.top - rect.height / 2;
    const wx = state.cx + mx / state.scale;
    const wy = state.cy - my / state.scale;
    state.scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, state.scale * factor));
    state.cx = wx - mx / state.scale;
    state.cy = wy + my / state.scale;
}

export function initInteraction(canvas) {
    let dragging = false, lx = 0, ly = 0;
    const pointers = new Map();
    let lastDist = 0;

    canvas.addEventListener('pointerdown', e => {
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
        if (pointers.size === 1) {
            dragging = true;
            lx = e.clientX; ly = e.clientY;
            canvas.classList.add('dragging');
            try { canvas.setPointerCapture(e.pointerId); } catch { }
        } else {
            // Second finger down – switch from drag to pinch.
            dragging = false;
        }
    });

    canvas.addEventListener('pointermove', e => {
        if (!pointers.has(e.pointerId)) return;
        pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });

        if (pointers.size === 2) {
            const pts = [...pointers.values()];
            const dist = Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y);
            const mid = { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
            if (lastDist > 0) {
                zoomAt(canvas, dist / lastDist, mid.x, mid.y);
                schedule();
            }
            lastDist = dist;
            return;
        }

        if (dragging) {
            const dx = e.clientX - lx, dy = e.clientY - ly;
            lx = e.clientX; ly = e.clientY;
            state.cx -= dx / state.scale;
            state.cy += dy / state.scale;
            schedule();
        }
    });

    const endPointer = e => {
        pointers.delete(e.pointerId);
        lastDist = 0;
        if (pointers.size === 0) {
            dragging = false;
            canvas.classList.remove('dragging');
        }
        try { canvas.releasePointerCapture(e.pointerId); } catch { }
    };
    canvas.addEventListener('pointerup', endPointer);
    canvas.addEventListener('pointercancel', endPointer);

    canvas.addEventListener('wheel', e => {
        e.preventDefault();
        zoomAt(canvas, Math.exp(-e.deltaY * 0.0015), e.clientX, e.clientY);
        schedule();
    }, { passive: false });
}
