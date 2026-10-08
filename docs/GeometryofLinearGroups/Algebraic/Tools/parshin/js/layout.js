// Where each plane is drawn. A frame is either the base upper half-plane { half, z } (plane
// coordinates are the points of ℍ themselves), or a disk { cx, cy, R, ux, uy, z, base } whose
// local (a, b) in the unit disk sits at c + R(a·r + b·u), r = u turned a quarter clockwise; the
// cusp (P : Q) is at B(P, Q) and u points at ∞, toward the parent.
//
// The child at a cusp is the reflected Ford circle there, scaled by λ in a disk, hanging below
// (or above) its parent by an edge whose length is 1/q at p/q: absolute on the half-plane, in
// units of the parent's radius on a disk. The base disk has no parent direction, so it uses the
// symmetric √(Ford size) instead, which agrees with 1/q at 0 and ∞.
import { fordDiam } from './farey.js';

export const HALF = { X: 3, Y: 2.4, KIDS: 2, FADE: 0.9, RHO: 1.7 };

// The cusp (P : Q) of the base half-plane, and the outward normal there. Cusps with |x| ≤ X sit
// on the real axis; beyond, the cusp runs round a semicircle of radius ρ outside the strip and
// back along its top to ∞ at (0, 2ρ), so a cusp moving through ∞ moves continuously.
export function halfCusp(P, Q) {
    const { X, RHO } = HALF;
    let side = 1, f = 1;
    if (Q !== 0) {
        const x = P / Q;
        if (Math.abs(x) <= X) return [x, 0, 0, -1];
        side = Math.sign(x);
        f = 1 - X / Math.abs(x);
    }
    if (!Number.isFinite(f)) f = 1;
    const s = f * (Math.PI * RHO + X);
    if (s <= Math.PI * RHO) {
        const a = -Math.PI / 2 + s / RHO;
        return [side * (X + RHO * Math.cos(a)), RHO + RHO * Math.sin(a), side * Math.cos(a), Math.sin(a)];
    }
    return [side * (X - (s - Math.PI * RHO)), 2 * RHO, 0, 1];
}

export const scaleOf = (F) => (F.half ? 1 : F.R);

// The point of the cusp (P : Q) on plane F and the outward unit normal there.
export function attach(F, P, Q) {
    if (F.half) return halfCusp(P, Q);
    const s = P * P + Q * Q, a = 2 * P * Q / s, b = (P * P - Q * Q) / s;
    const nx = a * F.uy + b * F.ux, ny = -a * F.ux + b * F.uy;
    return [F.cx + F.R * nx, F.cy + F.R * ny, nx, ny];
}

// The child of F at cusp (P : Q) with radius r, at height z.
export function childFrame(F, P, Q, r, z) {
    const [x, y, nx, ny] = attach(F, P, Q);
    return { cx: x + nx * r, cy: y + ny * r, R: r, ux: -nx, uy: -ny, z, base: false };
}

// The standard child at the cusp p/q, in units of the parent's scale: its radius σ and edge ℓ.
export function standardChild(F, p, q, st) {
    if (F.half) return { sigma: q ? 1 / (2 * q * q) : 0.5, ell: q ? 1 / q : 1 };
    const D = fordDiam(p, q);
    return { sigma: st.lam * D / 2, ell: F.base || !q ? Math.sqrt(D) : 1 / q };
}
// The signed height of an edge of relative length ℓ below (or above) a plane of this scale.
export const edgeGap = (ell, scale, st) => st.h * (st.edges === 'levels' ? 1 : ell * scale);

export function rootFrame(st) {
    return st.base === 'half' ? { half: true, z: 0 } : { cx: 0, cy: 0, R: 1, ux: 0, uy: 1, z: 0, base: true };
}

// The standard child frame, and the gap of its edge.
export function standardFrame(F, p, q, st) {
    const { sigma, ell } = standardChild(F, p, q, st), sc = scaleOf(F), gap = edgeGap(ell, sc, st);
    return { F: childFrame(F, p, q, sigma * sc, F.z + gap), gap };
}

// The frame of the vertex with these labels (BigInt cusps), walking down from the root.
export function frameAt(labels, st, cache) {
    if (!labels.length) return { F: rootFrame(st), gap: 0 };
    const key = labels.map(([p, q]) => `${p}/${q}`).join(' ');
    if (cache && cache.has(key)) return cache.get(key);
    const { F: parent } = frameAt(labels.slice(0, -1), st, cache);
    const [p, q] = labels[labels.length - 1];
    const out = standardFrame(parent, Number(p), Number(q), st);
    if (cache) cache.set(key, out);
    return out;
}

// Interpolate two disk frames: centre, height and radius linearly, u by angle. (A geometric
// radius would leave the outgoing and incoming base planes both small halfway.)
export function lerpFrame(A, B, s) {
    if (A.half || B.half) return s < 0.5 ? A : B;
    const a0 = Math.atan2(A.uy, A.ux);
    let da = Math.atan2(B.uy, B.ux) - a0;
    while (da > Math.PI) da -= 2 * Math.PI;
    while (da < -Math.PI) da += 2 * Math.PI;
    const a = a0 + da * s;
    return {
        cx: A.cx + (B.cx - A.cx) * s, cy: A.cy + (B.cy - A.cy) * s, z: A.z + (B.z - A.z) * s,
        R: A.R + (B.R - A.R) * s, ux: Math.cos(a), uy: Math.sin(a), base: false,
    };
}
