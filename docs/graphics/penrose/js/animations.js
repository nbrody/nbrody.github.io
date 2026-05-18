/* ------------------------------------------------------------------ *
 *  Cube-flip animation layer.
 *
 *  Three rhombi sharing a vertex whose interior angles sum to 360°
 *  form a "cube cluster" — the projection of three visible faces of a
 *  unit cube. We shade them top / left / right of an isometric cube
 *  so the tiling looks like stacked blocks.
 *
 *  When γ crosses a triple intersection, a hexagonal cell flips: the
 *  three rhombi at one corner of the cell are replaced by three at
 *  the opposite corner — the "back" three faces of the cube become
 *  visible. We treat that flip as a 3D scene event:
 *
 *      • the NEW cube renders normally (static cube shading), so the
 *        hexagon is filled by the new configuration immediately,
 *      • a ghost copy of the OLD cube launches along one of the
 *        cube's three axis directions, accelerating outward; shortly
 *        after launch it fades to fully transparent and leaves the
 *        scene.
 * ------------------------------------------------------------------ */

import { E, schedule } from './state.js';

const DURATION_MS = 520;
const FLY_DIST    = 14;        // world units the OLD cube travels
const FADE_START  = 0.20;      // fraction of DURATION before fade begins
const VKEY_PREC   = 1000;

export const animState = {
    enabled: false,
    prevClusters: new Map(),
    flips: new Map(),
};

// Reverse index built from buildClusters() so render.js can look up a
// rhombus's cube face in O(1) instead of scanning every cluster.
const rhombusFace = new Map();

/* ---- Toggle ----------------------------------------------------- */
export function initAnimations() {
    const btn = document.getElementById('animBtn');
    if (!btn) return;
    btn.addEventListener('click', () => {
        animState.enabled = !animState.enabled;
        btn.classList.toggle('active', animState.enabled);
        btn.textContent = animState.enabled ? 'Cubes · on' : 'Cubes · off';
        if (!animState.enabled) {
            animState.prevClusters.clear();
            animState.flips.clear();
        }
        schedule();
    });
}

/* ---- Helpers ---------------------------------------------------- */
function vkey(x, y) {
    return Math.round(x * VKEY_PREC) + '|' + Math.round(y * VKEY_PREC);
}

function rhombusVerts(r) {
    return [[r.x1, r.y1], [r.x2, r.y2], [r.x3, r.y3], [r.x4, r.y4]];
}

function snapshotRhombus(r) {
    return {
        x1: r.x1, y1: r.y1, x2: r.x2, y2: r.y2,
        x3: r.x3, y3: r.y3, x4: r.x4, y4: r.y4,
    };
}

/** djb2-style hash so we get a stable axis pick per hexagonal cell. */
function strHash(s) {
    let h = 5381;
    for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
    return Math.abs(h);
}

/** The three distinct pentagrid edge indices used by a cluster's rhombi. */
function clusterAxisIndices(cluster) {
    const set = new Set();
    for (const r of [cluster.top, cluster.left, cluster.right]) {
        set.add(r.j); set.add(r.jp);
    }
    return [...set];
}

/* ---- Cluster detection ----------------------------------------- */
/**
 * Find every vertex shared by exactly three rhombi whose interior
 * angles sum to ~360°. Each cluster is keyed by its hexagonal outer
 * boundary so it can be tracked across flips.
 */
export function buildClusters(rhombi) {
    const clusters = new Map();
    rhombusFace.clear();
    if (!animState.enabled) return clusters;

    const v2list = new Map();
    for (const r of rhombi) {
        const verts = rhombusVerts(r);
        const primary = r.type === 0 ? 72 : 144;
        const angles = [primary, 180 - primary, primary, 180 - primary];
        for (let i = 0; i < 4; i++) {
            const k = vkey(verts[i][0], verts[i][1]);
            if (!v2list.has(k)) v2list.set(k, []);
            v2list.get(k).push({ r, angle: angles[i], vx: verts[i][0], vy: verts[i][1] });
        }
    }

    for (const [interiorKey, list] of v2list) {
        if (list.length !== 3) continue;
        const sum = list[0].angle + list[1].angle + list[2].angle;
        if (Math.abs(sum - 360) > 2) continue;

        const outerSet = new Set();
        for (const e of list) {
            for (const v of rhombusVerts(e.r)) {
                const kk = vkey(v[0], v[1]);
                if (kk !== interiorKey) outerSet.add(kk);
            }
        }
        const hexKey = [...outerSet].sort().join(';');

        const withC = list.map(e => {
            const cx = (e.r.x1 + e.r.x2 + e.r.x3 + e.r.x4) / 4 - e.vx;
            const cy = (e.r.y1 + e.r.y2 + e.r.y3 + e.r.y4) / 4 - e.vy;
            return { ...e, cx, cy };
        });
        withC.sort((a, b) => b.cy - a.cy);
        const top = withC[0];
        const rest = withC.slice(1).sort((a, b) => a.cx - b.cx);

        clusters.set(hexKey, {
            hexKey,
            interiorKey,
            interior: [top.vx, top.vy],
            top: top.r, left: rest[0].r, right: rest[1].r,
        });
        rhombusFace.set(top.r, 'top');
        rhombusFace.set(rest[0].r, 'left');
        rhombusFace.set(rest[1].r, 'right');
    }
    return clusters;
}

/* ---- Flip detection -------------------------------------------- */
export function updateClusterState(currClusters) {
    if (!animState.enabled) {
        animState.prevClusters = currClusters;
        animState.flips.clear();
        return;
    }
    const now = performance.now();

    for (const [hexKey, curr] of currClusters) {
        const prev = animState.prevClusters.get(hexKey);
        if (!prev) continue;
        if (prev.interiorKey === curr.interiorKey) continue;

        // Pick a flight direction: one of the cluster's three cube axes,
        // with a deterministic sign — same hex always flies the same way.
        const axisIdxs = clusterAxisIndices(prev);
        const h = strHash(hexKey);
        const axis = E[axisIdxs[h % axisIdxs.length]];
        const sign = ((h >> 5) & 1) ? 1 : -1;

        animState.flips.set(hexKey, {
            t0: now,
            oldSnap: {
                top:   snapshotRhombus(prev.top),
                left:  snapshotRhombus(prev.left),
                right: snapshotRhombus(prev.right),
            },
            axis: [axis[0] * sign, axis[1] * sign],
        });
    }
    for (const [hexKey, f] of animState.flips) {
        if (now - f.t0 > DURATION_MS) animState.flips.delete(hexKey);
    }

    animState.prevClusters = currClusters;
}

/* Backwards-compat shim — render.js still calls this, but with the
 * new fly-out model nothing in the current rhombi list is suppressed. */
export function isRhombusInFlight(_r) { return false; }

/* ---- Shading --------------------------------------------------- */
function cubeColors(face) {
    if (face === 'top')   return ['#e8cd88', '#b88f3a'];
    if (face === 'left')  return ['#8c6c3e', '#5a4326'];
    if (face === 'right') return ['#3f4d57', '#242d34'];
    return ['#888', '#555'];
}

/** Cube-face colors for a rhombus belonging to a current cluster — O(1). */
export function staticFaceFor(r) {
    if (!animState.enabled) return null;
    const face = rhombusFace.get(r);
    if (!face) return null;
    const [fill, stroke] = cubeColors(face);
    return { fill, stroke };
}

// Mild ease-out: motion starts immediately at a noticeable pace and
// gently coasts — feels like the cube was launched, not pulled.
function easeOutMild(t) { return 1 - (1 - t) * (1 - t); }

/**
 * Render every OLD cube currently flying out of the scene directly
 * onto the supplied context.  Avoids per-quad array allocation so the
 * frame loop stays smooth even with many simultaneous flips.
 */
export function paintFlightTo(ctx, state, view) {
    if (!animState.enabled || animState.flips.size === 0) return;
    const now = performance.now();
    const s = state.scale;
    const halfW = view.W / 2, halfH = view.H / 2;
    const prevAlpha = ctx.globalAlpha;

    for (const f of animState.flips.values()) {
        const t = Math.min(1, (now - f.t0) / DURATION_MS);
        const dist = FLY_DIST * easeOutMild(t);
        const dx = f.axis[0] * dist;
        const dy = f.axis[1] * dist;

        const alpha = t < FADE_START
            ? 1
            : Math.max(0, 1 - (t - FADE_START) / (1 - FADE_START));
        if (alpha <= 0.005) continue;
        ctx.globalAlpha = alpha;

        // 3 faces per flight
        paintFace(ctx, f.oldSnap.top,   'top',   dx, dy, s, halfW, halfH, state.cx, state.cy);
        paintFace(ctx, f.oldSnap.left,  'left',  dx, dy, s, halfW, halfH, state.cx, state.cy);
        paintFace(ctx, f.oldSnap.right, 'right', dx, dy, s, halfW, halfH, state.cx, state.cy);
    }

    ctx.globalAlpha = prevAlpha;
}

function paintFace(ctx, snap, face, dx, dy, s, halfW, halfH, cx, cy) {
    const [fill, stroke] = cubeColors(face);
    ctx.beginPath();
    ctx.moveTo(halfW + (snap.x1 + dx - cx) * s, halfH - (snap.y1 + dy - cy) * s);
    ctx.lineTo(halfW + (snap.x2 + dx - cx) * s, halfH - (snap.y2 + dy - cy) * s);
    ctx.lineTo(halfW + (snap.x3 + dx - cx) * s, halfH - (snap.y3 + dy - cy) * s);
    ctx.lineTo(halfW + (snap.x4 + dx - cx) * s, halfH - (snap.y4 + dy - cy) * s);
    ctx.closePath();
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.stroke();
}

export function hasLiveAnimations() {
    return animState.enabled && animState.flips.size > 0;
}
