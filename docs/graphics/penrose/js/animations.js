/* ------------------------------------------------------------------ *
 *  Cube-flip animation layer.
 *
 *  Three rhombi sharing a vertex whose interior angles sum to 360°
 *  form a "cube cluster" — the projection of three visible faces of a
 *  unit cube from ℝ³. Shading them as top/left/right faces of an
 *  isometric cube makes the tiling look like stacked blocks.
 *
 *  As γ changes, the pentagrid occasionally crosses a triple
 *  intersection. At each crossing the hexagonal outline of a cube
 *  cluster stays put, but the interior (degree-3) vertex jumps to the
 *  opposite position of the hexagon — the "other three faces" of the
 *  same cube become visible.  We animate that vertex smoothly from
 *  its old location to its new one, deforming the three rhombi along
 *  with it. The hexagon border never moves; only the corner slides.
 * ------------------------------------------------------------------ */

import { schedule } from './state.js';

const FLIP_MS   = 520;      // slide duration
const VKEY_PREC = 1000;     // 1/1000 unit vertex precision

export const animState = {
    enabled: false,
    prevClusters: new Map(), // hexKey → cluster record (last frame)
    flips: new Map(),        // hexKey → { t0, pFrom, pTo, cluster }
};

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

/* ---- Cluster detection ----------------------------------------- */
/**
 * Find every vertex shared by exactly three rhombi whose interior
 * angles sum to ~360°.  Key each cluster by its hexagonal outer
 * boundary so we can track it frame-to-frame even when the interior
 * vertex jumps.
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

        // Collect the 6 outer hexagon vertex keys (all vertices of the
        // 3 rhombi except the shared interior).
        const outerSet = new Set();
        for (const e of list) {
            for (const v of rhombusVerts(e.r)) {
                const kk = vkey(v[0], v[1]);
                if (kk !== interiorKey) outerSet.add(kk);
            }
        }
        const hexKey = [...outerSet].sort().join(';');

        // Classify top / left / right face by rhombus centroid relative
        // to the shared vertex.
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
const rhombiInFlight = new Set();

export function updateClusterState(currClusters) {
    if (!animState.enabled) {
        animState.prevClusters = currClusters;
        animState.flips.clear();
        rhombiInFlight.clear();
        return;
    }
    const now = performance.now();

    // Same hexagon boundary, different interior vertex → flip event.
    for (const [hexKey, curr] of currClusters) {
        const prev = animState.prevClusters.get(hexKey);
        if (!prev) continue;
        if (prev.interiorKey === curr.interiorKey) continue;
        // Replace any in-progress flip for this hexagon (handles rapid back-and-forth).
        animState.flips.set(hexKey, {
            t0: now,
            pFrom: prev.interior,
            pTo: curr.interior,
            cluster: curr,
        });
    }
    for (const [hexKey, f] of animState.flips) {
        if (now - f.t0 > FLIP_MS) animState.flips.delete(hexKey);
    }

    // Rebuild the in-flight rhombus set (referenced by render.js to
    // skip normal drawing for these three rhombi).
    rhombiInFlight.clear();
    for (const f of animState.flips.values()) {
        rhombiInFlight.add(f.cluster.top);
        rhombiInFlight.add(f.cluster.left);
        rhombiInFlight.add(f.cluster.right);
    }

    animState.prevClusters = currClusters;
}

export function isRhombusInFlight(r) { return rhombiInFlight.has(r); }

/* ---- Shading --------------------------------------------------- */
function cubeColors(face) {
    if (face === 'top')   return ['#e8cd88', '#b88f3a'];
    if (face === 'left')  return ['#8c6c3e', '#5a4326'];
    if (face === 'right') return ['#3f4d57', '#242d34'];
    return null;
}

/**
 * Static cube-face info for a rhombus belonging to a non-flipping
 * cluster. Returns null otherwise (render.js falls back to palette).
 */
export function staticFaceFor(r, clusters) {
    if (!animState.enabled) return null;
    if (rhombiInFlight.has(r)) return null;       // handled by flip pass
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

/**
 * Yields the deformed quads for every active flip. Each quad is the
 * original rhombus with its interior corner slid to the interpolated
 * position — the hexagon border is untouched.
 */
export function* iterateFlipQuads() {
    if (!animState.enabled) return;
    const now = performance.now();
    for (const f of animState.flips.values()) {
        const t = Math.min(1, (now - f.t0) / FLIP_MS);
        const ease = 1 - Math.pow(1 - t, 3);       // ease-out cubic
        const px = f.pFrom[0] + (f.pTo[0] - f.pFrom[0]) * ease;
        const py = f.pFrom[1] + (f.pTo[1] - f.pFrom[1]) * ease;

        const tx = f.pTo[0], ty = f.pTo[1];
        const faces = [
            [f.cluster.top, 'top'],
            [f.cluster.left, 'left'],
            [f.cluster.right, 'right'],
        ];
        for (const [r, face] of faces) {
            const verts = rhombusVerts(r).map(v => {
                if (Math.abs(v[0] - tx) < 1e-4 && Math.abs(v[1] - ty) < 1e-4) {
                    return [px, py];
                }
                return v;
            });
            const [fill, stroke] = cubeColors(face);
            yield { verts, fill, stroke };
        }
    }
}

export function hasLiveAnimations() {
    return animState.enabled && animState.flips.size > 0;
}
