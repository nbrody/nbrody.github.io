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
 *  the opposite corner — the "back" faces of the cube become the
 *  visible ones. We treat that flip as a 3D scene event:
 *
 *      • the OLD cube tumbles forward toward the viewer, growing and
 *        rotating as it fades out — flying out of the scene,
 *      • the NEW cube emerges from depth, scaling up from small with
 *        an opposite tumble, fading in — flying into the scene.
 *
 *  Both transforms pivot around the hexagon's center (which is the
 *  midpoint of the body diagonal of the cube), so the hexagon's outer
 *  silhouette is recovered exactly at t=0 and t=1.
 * ------------------------------------------------------------------ */

import { schedule } from './state.js';

const DURATION_MS = 640;
const VKEY_PREC   = 1000;

export const animState = {
    enabled: false,
    prevClusters: new Map(),
    flips: new Map(),
};

const rhombiInFlight = new Set();

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
            rhombiInFlight.clear();
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

/** Compute the centroid of the 6 outer hexagon vertices of a cluster. */
function hexCenter(cluster) {
    const ix = cluster.interior[0], iy = cluster.interior[1];
    const seen = new Set();
    let sx = 0, sy = 0, n = 0;
    for (const r of [cluster.top, cluster.left, cluster.right]) {
        for (const v of rhombusVerts(r)) {
            if (Math.abs(v[0] - ix) < 1e-4 && Math.abs(v[1] - iy) < 1e-4) continue;
            const k = vkey(v[0], v[1]);
            if (seen.has(k)) continue;
            seen.add(k);
            sx += v[0]; sy += v[1]; n++;
        }
    }
    return n > 0 ? [sx / n, sy / n] : [ix, iy];
}

/* ---- Cluster detection ----------------------------------------- */
/**
 * Find every vertex shared by exactly three rhombi whose interior
 * angles sum to ~360°. Each cluster is keyed by its hexagonal outer
 * boundary so it can be tracked across flips.
 */
export function buildClusters(rhombi) {
    const clusters = new Map();
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
    }
    return clusters;
}

/* ---- Flip detection -------------------------------------------- */
export function updateClusterState(currClusters) {
    if (!animState.enabled) {
        animState.prevClusters = currClusters;
        animState.flips.clear();
        rhombiInFlight.clear();
        return;
    }
    const now = performance.now();

    for (const [hexKey, curr] of currClusters) {
        const prev = animState.prevClusters.get(hexKey);
        if (!prev) continue;
        if (prev.interiorKey === curr.interiorKey) continue;
        animState.flips.set(hexKey, {
            t0: now,
            oldSnap: {
                top: snapshotRhombus(prev.top),
                left: snapshotRhombus(prev.left),
                right: snapshotRhombus(prev.right),
            },
            curr,
            hexCenter: hexCenter(curr),
        });
    }
    for (const [hexKey, f] of animState.flips) {
        if (now - f.t0 > DURATION_MS) animState.flips.delete(hexKey);
    }

    rhombiInFlight.clear();
    for (const f of animState.flips.values()) {
        rhombiInFlight.add(f.curr.top);
        rhombiInFlight.add(f.curr.left);
        rhombiInFlight.add(f.curr.right);
    }

    animState.prevClusters = currClusters;
}

export function isRhombusInFlight(r) { return rhombiInFlight.has(r); }

/* ---- Shading --------------------------------------------------- */
function cubeColors(face) {
    if (face === 'top')   return ['#e8cd88', '#b88f3a'];
    if (face === 'left')  return ['#8c6c3e', '#5a4326'];
    if (face === 'right') return ['#3f4d57', '#242d34'];
    return ['#888', '#555'];
}

/** Static cube-face colors for a non-flipping cluster rhombus. */
export function staticFaceFor(r, clusters) {
    if (!animState.enabled) return null;
    if (rhombiInFlight.has(r)) return null;
    for (const c of clusters.values()) {
        let face = null;
        if (c.top === r) face = 'top';
        else if (c.left === r) face = 'left';
        else if (c.right === r) face = 'right';
        if (!face) continue;
        const [fill, stroke] = cubeColors(face);
        return { fill, stroke };
    }
    return null;
}

/* ---- 2D affine transform around a pivot ------------------------ */
function transform(vx, vy, scale, rot, pivot) {
    const cosR = Math.cos(rot), sinR = Math.sin(rot);
    const tx = vx - pivot[0], ty = vy - pivot[1];
    const rx = (tx * cosR - ty * sinR) * scale;
    const ry = (tx * sinR + ty * cosR) * scale;
    return [pivot[0] + rx, pivot[1] + ry];
}

function easeOut(t) { return 1 - Math.pow(1 - t, 3); }
function easeIn(t)  { return t * t * t; }

/**
 * Yields { verts, fill, stroke, alpha } for the fly-out (OLD cube)
 * and fly-in (NEW cube) rhombi of every live flip.
 */
export function* iterateFlipQuads() {
    if (!animState.enabled) return;
    const now = performance.now();

    for (const f of animState.flips.values()) {
        const t = Math.min(1, (now - f.t0) / DURATION_MS);
        const eo = easeOut(t);
        const ei = easeIn(t);

        // OLD cube — flies forward toward the viewer and tumbles out.
        const oldScale = 1.0 + 0.7 * eo;            // 1.0 → 1.7
        const oldRot   = 0.55 * eo;                  // ≈ 31° tumble
        const oldAlpha = Math.max(0, 1.0 - 1.25 * t);

        const oldFaces = [
            ['top',   f.oldSnap.top],
            ['left',  f.oldSnap.left],
            ['right', f.oldSnap.right],
        ];
        for (const [face, snap] of oldFaces) {
            const [fill, stroke] = cubeColors(face);
            const verts = rhombusVerts(snap).map(v =>
                transform(v[0], v[1], oldScale, oldRot, f.hexCenter));
            yield { verts, fill, stroke, alpha: oldAlpha };
        }

        // NEW cube — emerges from depth, settles into place.
        const newScale = 0.35 + 0.65 * eo;          // 0.35 → 1.0
        const newRot   = -0.55 * (1 - eo);           // settles to 0
        const newAlpha = ei;

        const newFaces = [
            ['top',   f.curr.top],
            ['left',  f.curr.left],
            ['right', f.curr.right],
        ];
        for (const [face, r] of newFaces) {
            const [fill, stroke] = cubeColors(face);
            const verts = rhombusVerts(r).map(v =>
                transform(v[0], v[1], newScale, newRot, f.hexCenter));
            yield { verts, fill, stroke, alpha: newAlpha };
        }
    }
}

export function hasLiveAnimations() {
    return animState.enabled && animState.flips.size > 0;
}
