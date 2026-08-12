// triangle.js — hyperbolic triangles Δ(p, q, ∞) positioned for interbreeding.
//
// The triangle is placed with its cusp at the ideal point B = (1,0) and the
// vertex of angle π/p at A, with the side A–B lying on the real axis Σ (the
// shared cutting geodesic).  Two such triangles with the same p induce the
// same boundary pattern on Σ (a corner of angle π/p, then nothing until the
// cusp), so the reflection tilings above and below Σ glue isometrically.
//
// Arithmeticity is exact: Takeuchi's classification gives exactly nine
// non-cocompact arithmetic triangle groups.

import { wallFromIdeal, wallThroughIdealAndPoint } from './geometry.js';

const ARITH9 = new Set(['2,3', '2,4', '2,6', '2,inf', '3,3', '3,inf', '4,4', '6,6', 'inf,inf']);
const keyOf = (p, q) => {
    const s = [p, q].map(x => (x === Infinity ? Infinity : x)).sort((a, b) => a - b);
    return s.map(x => (x === Infinity ? 'inf' : x)).join(',');
};
export const isArithmeticTriangle = (p, q) => ARITH9.has(keyOf(p, q));   // Δ(p,q,∞)

export function triangleName(p, q) {
    const f = x => (x === Infinity ? '∞' : x);
    return `Δ(${f(p)}, ${f(q)}, ∞)`;
}

// Invariant trace field generators of Δ(p,q,∞): Q(cos 2π/p, cos 2π/q, cos π/p·cos π/q).
export function traceFieldGens(p, q) {
    const c2 = x => (x === Infinity ? 1 : Math.cos(2 * Math.PI / x));
    const c1 = x => (x === Infinity ? 1 : Math.cos(Math.PI / x));
    return [c2(p), c2(q), c1(p) * c1(q)];
}

// Build the chamber: verts/walls in the convention of vinberg.js
// (edge i runs from verts[i-1] to verts[i] along walls[i]).
export function triangleChamber(p, q) {
    if (p !== Infinity && (p < 2 || 1 / p + 1 / q >= 1)) return { ok: false, reason: 'not hyperbolic' };

    let A, C;
    const Bpt = [1, 0];                                    // the cusp on Σ
    if (p === Infinity) {
        A = [-1, 0];
        if (q === Infinity) C = [0, 1];
        else C = [0, solveApexHeight(q)];
    } else {
        const ap = Math.PI / p;
        if (q === Infinity) {
            C = [Math.cos(ap), Math.sin(ap)];
        } else {
            const aq = Math.PI / q;
            const coshL = (1 + Math.cos(ap) * Math.cos(aq)) / (Math.sin(ap) * Math.sin(aq));
            const r = Math.sqrt((coshL - 1) / (coshL + 1));   // tanh(L/2)
            C = [r * Math.cos(ap), r * Math.sin(ap)];
        }
        A = [0, 0];
    }

    // Vertex order A → B → C; edge walls: [CA?] follow convention:
    // verts = [A, B, C]; walls[i] is the edge from verts[i-1] to verts[i]:
    // walls[0] = edge C→A, walls[1] = edge A→B (on Σ), walls[2] = edge B→C.
    const sigma = wallFromIdeal([1, 0], [-1, 0]);
    let wallCA, wallBC;
    if (p === Infinity) {
        wallCA = wallThroughIdealAndPoint(A, C);
        wallBC = wallThroughIdealAndPoint(Bpt, C);
    } else {
        const ap = Math.PI / p;
        wallCA = wallFromIdeal([Math.cos(ap), Math.sin(ap)], [-Math.cos(ap), -Math.sin(ap)]);
        wallBC = wallThroughIdealAndPoint(Bpt, C);
    }

    const isIdeal = v => Math.abs(v[0] * v[0] + v[1] * v[1] - 1) < 1e-9;
    const angles = [
        p === Infinity ? Infinity : p,     // at A
        Infinity,                          // at B (cusp)
        q === Infinity ? Infinity : q,     // at C
    ];
    const anglesRad = angles.map(m => (m === Infinity ? 0 : Math.PI / m));
    const area = Math.PI - anglesRad.reduce((s, t) => s + t, 0);

    return {
        ok: true,
        verts: [A, Bpt, C],
        walls: [wallCA, sigma, wallBC],
        vertData: [A, Bpt, C].map((v, i) => ({ ideal: isIdeal(v), m: angles[i], angle: anglesRad[i] })),
        angles,
        area,
        cusps: [A, Bpt, C].filter(isIdeal).length,
        nWalls: 3,
        sigmaWallIndex: 1,
    };
}

// For p = ∞: find h so that the ideal triangle (−1,0), (1,0), (0,h) has
// interior angle π/q at the apex (0,h).
function solveApexHeight(q) {
    const target = Math.PI / q;
    const angleAt = h => {
        const C = [0, h];
        const w1 = wallThroughIdealAndPoint([-1, 0], C);
        const w2 = wallThroughIdealAndPoint([1, 0], C);
        const dir = (w, toward) => {
            const phiC = Math.atan2(C[1] - w.cy, C[0] - w.cx);
            const phiT = Math.atan2(toward[1] - w.cy, toward[0] - w.cx);
            let d = phiT - phiC;
            while (d > Math.PI) d -= 2 * Math.PI;
            while (d < -Math.PI) d += 2 * Math.PI;
            const step = phiC + Math.sign(d) * 1e-4;
            const P = [w.cx + w.R * Math.cos(step), w.cy + w.R * Math.sin(step)];
            const v = [P[0] - C[0], P[1] - C[1]];
            const m = Math.hypot(v[0], v[1]);
            return [v[0] / m, v[1] / m];
        };
        const u1 = dir(w1, [-1, 0]), u2 = dir(w2, [1, 0]);
        return Math.acos(Math.min(1, Math.max(-1, u1[0] * u2[0] + u1[1] * u2[1])));
    };
    let lo = 0.02, hi = 0.999;      // angle decreases from ~π to 0 as h → 1
    for (let i = 0; i < 80; i++) {
        const mid = (lo + hi) / 2;
        if (angleAt(mid) > target) lo = mid; else hi = mid;
    }
    return (lo + hi) / 2;
}
