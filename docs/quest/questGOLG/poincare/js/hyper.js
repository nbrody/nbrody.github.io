/**
 * Hyperbolic helpers for the VR app: Lorentz matrices for the shaders,
 * group elements near the domain (tiles), animation along a one-parameter
 * subgroup, and the flight used by the inside view.
 *
 * Coordinates: everything is built in the HOME frame of the computed domain
 * (its centre at the ball origin) and drawn through the scene isometry
 * S = fly · view · B. Hyperboloid vectors are [x, y, z, t] with
 * ⟨X, Y⟩ = x·x' + y·y' + z·z' − t·t'.
 */
import * as THREE from 'three';
import { Matrix2x2, Complex, pslKey, lorentzMatrix, applyMatrixToBall, translationTowards } from './engine.js';

export const I2 = () => Matrix2x2.identity();

/** THREE.Matrix4 holding the Lorentz matrix of an isometry. */
export function lorentz4(m, out = new THREE.Matrix4()) {
    return out.set(...lorentzMatrix(m));
}

/** Ball point → hyperboloid [x, y, z, t]. */
export function ballToHyp(p) {
    const r2 = p.x * p.x + p.y * p.y + p.z * p.z;
    const f = 1 / (1 - r2);
    return [2 * p.x * f, 2 * p.y * f, 2 * p.z * f, (1 + r2) * f];
}

/** Hyperbolic distance from the origin of a ball point. */
export const distFromOrigin = (p) => 2 * Math.atanh(Math.min(p.length(), 1 - 1e-12));

/**
 * Elements h with h(D) near a point: breadth-first products of the wall
 * elements (the neighbours across D's faces generate the group), kept while
 * the image of `centre` stays within hyperbolic distance `radius` of `eye`.
 * Returns [{ M: Matrix2x2, d: distance }] sorted by distance, identity first.
 */
export function tilesNear(walls, { centre = new THREE.Vector3(), eye = new THREE.Vector3(), radius = 3, max = 300 } = {}) {
    const gens = walls.map(w => w.elem).filter(Boolean);
    const out = [];
    const seen = new Set();
    const id = I2();
    const dist = (M) => {
        const p = applyMatrixToBall(M, centre);
        const q = eye;
        const d2 = p.distanceToSquared(q);
        const den = (1 - p.lengthSq()) * (1 - q.lengthSq());
        return den <= 0 ? Infinity : Math.acosh(1 + 2 * d2 / den);
    };
    let layer = [id];
    seen.add(pslKey(id));
    out.push({ M: id, d: dist(id) });
    while (layer.length && out.length < max) {
        const next = [];
        for (const h of layer) {
            for (const g of gens) {
                const m = h.mul(g).normalized();
                const k = pslKey(m);
                if (seen.has(k)) continue;
                seen.add(k);
                const d = dist(m);
                if (!(d <= radius)) continue;
                out.push({ M: m, d });
                next.push(m);
                if (out.length >= max) break;
            }
            if (out.length >= max) break;
        }
        layer = next;
    }
    out.sort((a, b) => a.d - b.d);
    return out;
}

/**
 * An animation of the view by the isometry g: the one-parameter subgroup
 * exp(t·log g), eased. Orientation-reversing elements have no flow, so they
 * cross-fade instantly (null).
 */
export function isometryPath(g) {
    if (g.anti) return null;
    let X;
    try { X = g.log(); } catch (e) { return null; }
    return (t) => {
        const e = t * t * (3 - 2 * t);
        return Matrix2x2.exp(new Matrix2x2(X.a.mul(e), X.b.mul(e), X.c.mul(e), X.d.mul(e)));
    };
}

/**
 * Hyperbolic translation that moves the ball origin by the small Euclidean
 * ball vector `v` (|v| ≪ 1): toward v/|v| by distance 2·atanh|v|.
 */
export function translationBy(v) {
    const r = v.length();
    if (r < 1e-12) return I2();
    return translationTowards(v.clone().divideScalar(r), 2 * Math.atanh(Math.min(r, 0.999)));
}

/** Rotation of the ball about its centre: the SU(2) element for a unit quaternion. */
export function rotationFromQuaternion(q) {
    // The ball's rotation q acts on the sphere at infinity, which uhsToBall
    // identifies with C ∪ ∞; build it from images of three points instead of
    // deriving the Cayley–Klein formula by hand.
    const pts = [new THREE.Vector3(0, 0, -1), new THREE.Vector3(1, 0, 0), new THREE.Vector3(0, 0, 1)];
    const toC = (p) => {
        const d = p.x * p.x + p.y * p.y + (1 - p.z) * (1 - p.z);
        return d < 1e-14 ? null : new Complex(2 * p.x / d, 2 * p.y / d);
    };
    const z = pts.map(toC), w = pts.map(p => toC(p.clone().applyQuaternion(q)));
    return mobiusFrom3(z, w);
}

/** The Möbius map sending z0, z1, z2 to w0, w1, w2 (null = ∞), normalized. */
function mobiusFrom3(z, w) {
    const toStd = (p) => {
        // Sends p0 → 0, p1 → 1, p2 → ∞.
        const [a, b, c] = p;
        if (c === null) return new Matrix2x2(new Complex(1), a.mul(-1), new Complex(0), b.sub(a));
        if (a === null) return new Matrix2x2(new Complex(0), b.sub(c), new Complex(1), c.mul(-1));
        if (b === null) return new Matrix2x2(new Complex(1), a.mul(-1), new Complex(1), c.mul(-1));
        return new Matrix2x2(b.sub(c), a.mul(b.sub(c)).mul(-1), b.sub(a), c.mul(b.sub(a)).mul(-1));
    };
    return toStd(w).inv().mul(toStd(z)).normalized();
}

/**
 * Whether a hyperboloid point X lies inside the domain's walls (⟨X, W⟩ ≤ tol
 * for every wall covector W). Returns the index of the most violated wall, or −1.
 */
export function violatedWall(walls, X, tol = 1e-9) {
    let worst = -1, best = tol;
    walls.forEach((w, i) => {
        const W = w.cov;
        const v = X[0] * W.x + X[1] * W.y + X[2] * W.z - X[3] * W.w;
        if (v > best) { best = v; worst = i; }
    });
    return worst;
}
