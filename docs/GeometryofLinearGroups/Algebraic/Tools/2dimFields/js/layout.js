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

// The base half-plane is drawn on [−X, X] × [0, Y], fading out over the last FADEX and FADEY;
// it carries planes at the cusps in [−KIDS, KIDS] (and ∞).
export const HALF = { X: 8, Y: 2.4, KIDS: 7, FADEX: 1.8, FADEY: 0.9, RHO: 1.7 };

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

export const scaleOf = (F) => (F.half ? 1 : F.cf ? F.kap * (1 - F.tau / 4) : F.R);

// The point of the cusp (P : Q) on plane F, the outward unit normal there, and how far the point
// sits above the plane's height. A plane in mid-flip (F.flip = θ, turned about its diameter
// through ∞, or the half-plane about x = 0) lifts its cusps out of the horizontal.
export function attach(F, P, Q) {
    const th = F.flip || 0;
    if (F.cf) return cfAttach(F, P, Q);
    if (F.half) {
        const [x, y, nx, ny] = halfCusp(P, Q);
        if (!th) return [x, y, nx, ny, 0];
        const hx = nx * Math.cos(th), l = Math.hypot(hx, ny) || 1;
        return [x * Math.cos(th), y, hx / l, ny / l, x * Math.sin(th)];
    }
    const s = P * P + Q * Q, a = 2 * P * Q / s, b = (P * P - Q * Q) / s, ca = Math.cos(th) * a;
    const nx = ca * F.uy + b * F.ux, ny = -ca * F.ux + b * F.uy;
    let l = Math.hypot(nx, ny), mx = nx, my = ny;
    if (l < 1e-6) { const sg = b < 0 ? -1 : 1; mx = sg * F.ux; my = sg * F.uy; l = 1; }
    return [F.cx + F.R * nx, F.cy + F.R * ny, mx / l, my / l, th ? F.R * Math.sin(th) * a : 0];
}

// The child of F at cusp (P : Q) with radius r, hanging by an edge of signed height gap.
export function childFrame(F, P, Q, r, gap) {
    const [x, y, nx, ny, lift] = attach(F, P, Q);
    return { cx: x + nx * r, cy: y + ny * r, R: r, ux: -nx, uy: -ny, z: F.z + lift + gap, base: false };
}

// The standard child at the cusp p/q, in units of the parent's scale: its radius σ and edge ℓ.
export function standardChild(F, p, q, st) {
    if (F.half) return { sigma: q ? 1 / (2 * q * q) : 0.5, ell: q ? 1 / q : 1 };
    const D = fordDiam(p, q);
    return { sigma: st.lam * D / 2, ell: F.base || !q ? Math.sqrt(D) : 1 / q };
}
// The signed height of an edge of relative length ℓ below (or above) a plane of this scale.
export const edgeGap = (ell, scale, st) => (st.edges === 'zero' ? 0 : st.h * (st.edges === 'levels' ? 1 : ell * scale));

// On the half-plane the tree climbs toward its end ∞. The vertices ∞, ∞ → 0, ∞ → 0 → 0, … are the
// ray from v₀ to that end (the lattices ⟨e₁, πᵏe₂⟩; on each plane of it the cusp 0 points away
// from v₀), and their edges go the other way from every other edge: with the default negative
// edge length each plane on the ray sits above its parent, and heights follow the horocycle
// levels about ∞ (exactly so with equal edges).
export const towardInf = (labels) => labels.length > 0 && labels[0][1] === 0n && labels.every((l, i) => !i || l[0] === 0n);
export const edgeSign = (labels, st) => (st.base === 'half' && towardInf(labels) ? -1 : 1);

export function rootFrame(st) {
    return st.base === 'half' ? { half: true, z: 0 } : { cx: 0, cy: 0, R: 1, ux: 0, uy: 1, z: 0, base: true };
}

// The standard child frame, and the gap of its edge.
export function standardFrame(F, p, q, st, sign = 1) {
    const { sigma, ell } = standardChild(F, p, q, st), sc = scaleOf(F), gap = sign * edgeGap(ell, sc, st);
    return { F: childFrame(F, p, q, sigma * sc, gap), gap };
}

// The frame of the vertex with these labels (BigInt cusps), walking down from the root.
export function frameAt(labels, st, cache) {
    if (!labels.length) return { F: rootFrame(st), gap: 0 };
    const key = labels.map(([p, q]) => `${p}/${q}`).join(' ');
    if (cache && cache.has(key)) return cache.get(key);
    const { F: parent } = frameAt(labels.slice(0, -1), st, cache);
    const [p, q] = labels[labels.length - 1];
    const out = standardFrame(parent, Number(p), Number(q), st, edgeSign(labels, st));
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

// ---------- conformal frames: the half-plane and the disks as one family ----------
// A conformal frame { cf, T, th, tau, kap, z, flip } draws z ∈ ℍ at T + e^{iθ}·κ·m_τ(z), with
//     m_τ(z) = z / (1 − iτz/2).
// m₀ is the identity, so τ = 0 is the upper half-plane itself; m₂ maps ℍ onto the disk of
// radius 1/2 centred at i/2, with i at the centre, 0 at the bottom and ∞ at the top, so τ = 2 is
// a disk frame of radius κ/2. For every τ in between m_τ(ℍ) is a round disk (of radius 1/τ), so
// interpolating τ rolls the half-plane up into a disk through conformal pictures of ℍ. T is
// where the cusp 0 sits and θ turns the direction of ∞ away from straight up.
export function toCF(F) {
    if (F.half) return { cf: true, T: [0, 0], th: 0, tau: 0, kap: 1, z: F.z };
    return { cf: true, T: [F.cx - F.R * F.ux, F.cy - F.R * F.uy], th: Math.atan2(F.uy, F.ux) - Math.PI / 2, tau: 2, kap: 2 * F.R, z: F.z };
}
export function lerpCF(A, B, s) {
    let dth = B.th - A.th;
    while (dth > Math.PI) dth -= 2 * Math.PI;
    while (dth < -Math.PI) dth += 2 * Math.PI;
    return {
        cf: true, T: [A.T[0] + (B.T[0] - A.T[0]) * s, A.T[1] + (B.T[1] - A.T[1]) * s], th: A.th + dth * s,
        tau: A.tau + (B.tau - A.tau) * s, kap: A.kap + (B.kap - A.kap) * s, z: A.z + (B.z - A.z) * s,   // κ linearly, as lerpFrame's radius
    };
}

function mtau(tau, x, y) {
    const dr = 1 + tau * y / 2, di = -tau * x / 2, d2 = dr * dr + di * di;
    return [(x * dr + y * di) / d2, (y * dr - x * di) / d2];
}
// from the local picture w (before the flip and the similarity) to plane coordinates and lift
function place(F, a, b) {
    let lift = 0;
    if (F.flip) { lift = a * Math.sin(F.flip); a *= Math.cos(F.flip); }
    const c = Math.cos(F.th), s = Math.sin(F.th);
    return [F.T[0] + c * a - s * b, F.T[1] + s * a + c * b, lift];
}
// For τ > 0 a conformal frame is a round disk: the equivalent disk frame (centre, radius, ∞ direction).
export function cfDisk(F) {
    const r = F.kap / F.tau, c = Math.cos(F.th), s = Math.sin(F.th);
    return { cx: F.T[0] - s * r, cy: F.T[1] + c * r, R: r, ux: -s, uy: c, z: F.z, flip: F.flip };
}

// The point z = x + iy of ℍ on a conformal frame: plane coordinates and lift.
export function cfPoint(F, x, y) {
    const [a, b] = F.tau ? mtau(F.tau, x, y) : [x, y];
    return place(F, F.kap * a, F.kap * b);
}

// How much a cusp follows the round boundary rather than the half-plane's compactified one
// (which brings |x| > X round to ∞ at the top of the strip): fully once τ is past 0.8, and
// always for the cusps under the strip, where the two agree at τ = 0.
const smooth = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * (3 - 2 * t); };
function roundness(F, x) {
    if (Number.isFinite(x) && Math.abs(x) <= HALF.X) return 1;
    const lam = smooth(F.tau / 0.8);
    const g = Number.isFinite(x) && F.tau > 0 ? Math.exp(-(Math.abs(x) - HALF.X) * 0.5 / F.tau) : 0;
    return lam + (1 - lam) * g;
}
function cfAttach(F, P, Q) {
    const x = Q === 0 || Math.abs(Q) <= 1e-12 * Math.abs(P) ? Infinity : P / Q;
    // on the round boundary m_τ(ℝ ∪ ∞), with outward normal τ·m − i
    let w = null, n;
    if (Number.isFinite(x)) { w = F.tau ? mtau(F.tau, x, 0) : [x, 0]; n = [F.tau * w[0], F.tau * w[1] - 1]; }
    else if (F.tau) { w = [0, 2 / F.tau]; n = [0, 1]; }
    const [hx, hy, hnx, hny] = halfCusp(P, Q);
    const beta = w ? roundness(F, x) : 0;
    if (!w) { w = [hx, hy]; n = [hnx, hny]; }
    let a = F.kap * (hx + (w[0] - hx) * beta), b = F.kap * (hy + (w[1] - hy) * beta);
    let na = hnx + (n[0] - hnx) * beta, nb = hny + (n[1] - hny) * beta;
    const [px, py, lift] = place(F, a, b);
    if (F.flip) na *= Math.cos(F.flip);
    const c = Math.cos(F.th), s = Math.sin(F.th), l = Math.hypot(na, nb) || 1;
    return [px, py, (c * na - s * nb) / l, (s * na + c * nb) / l, lift];
}
