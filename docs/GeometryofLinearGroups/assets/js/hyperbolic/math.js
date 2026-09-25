/**
 * Core algebra + hyperbolic geometry primitives shared by the Kleinian tools
 * (poincare, quasifuchsian, …).
 *
 * Walls (totally geodesic hyperplanes in H^3, Poincaré ball model) are stored
 * as Minkowski covectors W = (w1, w2, w3, w0) with signature (+,+,+,-),
 * normalized so <W,W> = |w_sp|^2 - w0^2 = 1, oriented so the DOMAIN side is
 * F(p) = 2 p·w_sp - (1+|p|^2) w0 < 0.
 *
 * Geometrically:
 *   w0 != 0  -> Euclidean sphere, center c = w_sp/w0, radius r = 1/|w0|,
 *               orthogonal to the unit sphere.
 *   w0 == 0  -> Euclidean plane through the origin with normal w_sp.
 */
// Relative (not the bare 'three' specifier) so the engine also loads in a Web
// Worker, where import maps do not apply. Same URL as the pages' import maps.
import * as THREE from '../../../Geometric/Tools/Kleinian/vendor/three/three.module.js';

// ---------------- Complex / Matrix algebra ----------------

export class Complex {
    constructor(re, im = 0) { this.re = re; this.im = im; }
    add(c) { return new Complex(this.re + c.re, this.im + c.im); }
    sub(c) { return new Complex(this.re - c.re, this.im - c.im); }
    mul(c) {
        if (typeof c === 'number') return new Complex(this.re * c, this.im * c);
        return new Complex(this.re * c.re - this.im * c.im, this.re * c.im + this.im * c.re);
    }
    div(c) {
        if (typeof c === 'number') return new Complex(this.re / c, this.im / c);
        const den = c.re * c.re + c.im * c.im;
        return new Complex((this.re * c.re + this.im * c.im) / den, (this.im * c.re - this.re * c.im) / den);
    }
    conj() { return new Complex(this.re, -this.im); }
    normSq() { return this.re * this.re + this.im * this.im; }
    static from(z) {
        if (z instanceof Complex) return z;
        if (typeof z === 'number') return new Complex(z);
        return new Complex(z.re || 0, z.im || 0);
    }
}

Complex.sqrt = function (c) {
    const r = Math.sqrt(Math.sqrt(c.re * c.re + c.im * c.im));
    const theta = Math.atan2(c.im, c.re) / 2;
    return new Complex(r * Math.cos(theta), r * Math.sin(theta));
};
Complex.log = function (c) {
    const r = Math.sqrt(c.re * c.re + c.im * c.im);
    return new Complex(Math.log(r), Math.atan2(c.im, c.re));
};
Complex.exp = function (c) {
    const r = Math.exp(c.re);
    return new Complex(r * Math.cos(c.im), r * Math.sin(c.im));
};

export class Matrix2x2 {
    /**
     * An isometry of H^3: the Möbius map of the matrix, preceded by complex
     * conjugation z ↦ z̄ when `anti` is set (orientation-reversing:
     * z ↦ (a·z̄+b)/(c·z̄+d) — reflections, glide reflections, …).
     */
    constructor(a, b, c, d, anti = false) {
        this.a = Complex.from(a);
        this.b = Complex.from(b);
        this.c = Complex.from(c);
        this.d = Complex.from(d);
        this.anti = anti;
    }
    mul(m) {
        // Pulling this.anti's conjugation past m conjugates m entrywise:
        // (M,ε)(N,δ) = (M·N̄^ε, ε⊕δ).
        const n = this.anti
            ? new Matrix2x2(m.a.conj(), m.b.conj(), m.c.conj(), m.d.conj())
            : m;
        return new Matrix2x2(
            this.a.mul(n.a).add(this.b.mul(n.c)), this.a.mul(n.b).add(this.b.mul(n.d)),
            this.c.mul(n.a).add(this.d.mul(n.c)), this.c.mul(n.b).add(this.d.mul(n.d)),
            this.anti !== m.anti
        );
    }
    det() { return this.a.mul(this.d).sub(this.b.mul(this.c)); }
    inv() {
        // (M,ε)^{-1} = (M̄^{-1} if ε else M^{-1}, ε)
        const det = this.det();
        let a = this.d.div(det), b = this.b.mul(-1).div(det);
        let c = this.c.mul(-1).div(det), d = this.a.div(det);
        if (this.anti) { a = a.conj(); b = b.conj(); c = c.conj(); d = d.conj(); }
        return new Matrix2x2(a, b, c, d, this.anti);
    }
    /** Scale to determinant 1 (choice of sqrt is irrelevant in PSL). */
    normalized() {
        const s = Complex.sqrt(this.det());
        return new Matrix2x2(this.a.div(s), this.b.div(s), this.c.div(s), this.d.div(s), this.anti);
    }
    log() {
        if (this.anti) {
            throw new Error('log: an orientation-reversing isometry has no one-parameter flow');
        }
        let tr = this.a.add(this.d);
        const tr2minus4 = tr.mul(tr).sub(new Complex(4));
        const sqrtTr2minus4 = Complex.sqrt(tr2minus4);
        const l1 = tr.add(sqrtTr2minus4).div(2);
        const phi = Complex.log(l1);
        if (phi.normSq() < 1e-10) {
            // Parabolic: log(I + N) = N
            return new Matrix2x2(this.a.sub(new Complex(1)), this.b, this.c, this.d.sub(new Complex(1)));
        }
        const k2 = tr.div(2);
        const diff = new Matrix2x2(this.a.sub(k2), this.b, this.c, this.d.sub(k2));
        const sphi = l1.sub(new Complex(1).div(l1)).div(2);
        const factor = phi.div(sphi);
        return new Matrix2x2(
            diff.a.mul(factor), diff.b.mul(factor),
            diff.c.mul(factor), diff.d.mul(factor)
        );
    }
    static exp(X) {
        const detX = X.a.mul(X.a).add(X.b.mul(X.c));
        const phi = Complex.sqrt(detX);
        let s, c;
        if (phi.normSq() < 1e-10) {
            s = new Complex(1);
            c = new Complex(1);
        } else {
            const ep = Complex.exp(phi);
            const em = new Complex(1).div(ep);
            c = ep.add(em).div(2);
            s = ep.sub(em).div(2).div(phi);
        }
        return new Matrix2x2(
            c.add(X.a.mul(s)), X.b.mul(s),
            X.c.mul(s), c.add(X.d.mul(s))
        );
    }
    static identity() { return new Matrix2x2(1, 0, 0, 1); }
}

/** Distance of a matrix (det 1) from ±identity. */
export function distFromIdentityPSL(m) {
    if (m.anti) return Infinity;   // orientation-reversing: never the identity
    const d1 = m.a.sub(new Complex(1)).normSq() + m.b.normSq() + m.c.normSq() + m.d.sub(new Complex(1)).normSq();
    const d2 = m.a.add(new Complex(1)).normSq() + m.b.normSq() + m.c.normSq() + m.d.add(new Complex(1)).normSq();
    return Math.sqrt(Math.min(d1, d2));
}

/**
 * Normalized key for a matrix in PSL(2,C): M and -M get the same key.
 */
export function pslKey(m, digits = 5) {
    // Quantize BEFORE choosing the PSL sign. Sub-precision noise in a leading
    // entry must not flip the sign of every significant entry, and values that
    // round to zero must not produce distinct "-0.00000" keys.
    const values = [m.a.re, m.a.im, m.b.re, m.b.im, m.c.re, m.c.im, m.d.re, m.d.im];
    const parts = values.map(v => v.toFixed(digits));
    const zero = (0).toFixed(digits);
    const negativeZero = '-' + zero;
    const first = parts.find(v => v !== zero && v !== negativeZero);
    const flip = first?.[0] === '-';
    for (let i = 0; i < parts.length; i++) {
        if (parts[i] === negativeZero) parts[i] = zero;
        else if (parts[i] === zero) continue;
        else if (flip) parts[i] = parts[i][0] === '-' ? parts[i].slice(1) : '-' + parts[i];
    }
    return `${m.anti ? 'A' : ''}[${parts[0]},${parts[1]}|${parts[2]},${parts[3]}|${parts[4]},${parts[5]}|${parts[6]},${parts[7]}]`;
}

// ---------------- Model maps: UHS <-> ball <-> Minkowski ----------------

/** Action of m (det 1) on an upper-half-space point (x, y, t). */
export function applyMatrixToUHS(m, p) {
    if (m.anti) p = { x: p.x, y: -p.y, t: p.t };   // conjugate first: z ↦ z̄
    const z = new Complex(p.x, p.y);
    const cz_d = m.c.mul(z).add(m.d);          // cz + d
    const az_b = m.a.mul(z).add(m.b);          // az + b
    const D = cz_d.normSq() + m.c.normSq() * p.t * p.t;
    const num = az_b.mul(cz_d.conj()).add(m.a.mul(m.c.conj()).mul(p.t * p.t));
    return { x: num.re / D, y: num.im / D, t: p.t / D };
}

export function imageOfOriginUHS(m) {
    return applyMatrixToUHS(m, { x: 0, y: 0, t: 1 });
}

/** UHS (x, y, t) -> Poincaré ball. Basepoint (0,0,1) -> origin. */
export function uhsToBall(p) {
    const normSq = p.x * p.x + p.y * p.y;
    const denom = normSq + (p.t + 1) * (p.t + 1);
    return new THREE.Vector3(
        (2 * p.x) / denom,
        (2 * p.y) / denom,
        (normSq + p.t * p.t - 1) / denom
    );
}

/** Poincaré ball -> UHS. Inverse of uhsToBall. */
export function ballToUHS(B) {
    const D = B.x * B.x + B.y * B.y + (1 - B.z) * (1 - B.z);
    return {
        x: 2 * B.x / D,
        y: 2 * B.y / D,
        t: (1 - B.x * B.x - B.y * B.y - B.z * B.z) / D
    };
}

/** Action of m (det 1) on a Poincaré ball point. */
export function applyMatrixToBall(m, p) {
    return uhsToBall(applyMatrixToUHS(m, ballToUHS(p)));
}

/**
 * Translation along the geodesic through the ball origin toward the ideal
 * point `dir` (a UNIT ball vector), by hyperbolic distance `delta`. The origin
 * lands on tanh(delta/2)·dir; negative delta translates the other way.
 *
 * Built as S·diag(e^{δ/2}, e^{-δ/2})·S⁻¹. The diagonal factor translates along
 * the vertical UHS axis, which uhsToBall carries to the ball's z-axis, and the
 * SU(2) factor S rotates that axis onto `dir`: S must send ∞ (the north pole,
 * ball +z) to the ideal endpoint of `dir`, whose stereographic coordinate is
 * ζ = (dir.x + i·dir.y)/(1 − dir.z). An SU(2) matrix [[a, −b̄], [b, ā]] sends
 * ∞ ↦ a/b and 0 ↦ −b̄/ā (the antipode of a/b), so take a ∝ ζ, b ∝ 1.
 */
export function translationTowards(dir, delta) {
    const s = 1 - dir.z;
    let a, b;
    if (s < 1e-9) {                    // dir = +z, ζ = ∞: S is already the identity
        a = new Complex(1);
        b = new Complex(0);
    } else {
        const zr = dir.x / s, zi = dir.y / s;
        const n = 1 / Math.sqrt(1 + zr * zr + zi * zi);
        a = new Complex(zr * n, zi * n);
        b = new Complex(n);
    }
    const S = new Matrix2x2(a, b.conj().mul(-1), b, a.conj());
    const e = Math.exp(delta / 2);
    const A = new Matrix2x2(new Complex(e), new Complex(0), new Complex(0), new Complex(1 / e));
    return S.mul(A).mul(S.inv()).normalized();
}

/** Ball point -> Minkowski hyperboloid point { sp: Vector3, t }. */
export function ballToMinkowski(p) {
    const p2 = p.x * p.x + p.y * p.y + p.z * p.z;
    const f = 1 / (1 - p2);
    return { sp: new THREE.Vector3(2 * p.x * f, 2 * p.y * f, 2 * p.z * f), t: (1 + p2) * f };
}

/** Hyperbolic distance between two ball points. */
export function hypDist(p, q) {
    const dx = p.x - q.x, dy = p.y - q.y, dz = p.z - q.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    const denom = (1 - p.lengthSq()) * (1 - q.lengthSq());
    if (denom <= 0) return Infinity;
    return Math.acosh(1 + 2 * d2 / denom);
}

/** Monotone proxy for hyperbolic distance (avoids acosh). */
export function hypDistProxy(p, q) {
    const dx = p.x - q.x, dy = p.y - q.y, dz = p.z - q.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    const denom = (1 - p.lengthSq()) * (1 - q.lengthSq());
    if (denom <= 0) return Infinity;
    return d2 / denom;
}

// ---------------- Walls as Minkowski covectors ----------------

/**
 * Bisector wall between ball points p1, p2 as a normalized covector
 * (THREE.Vector4: xyz = spatial part, w = time part), oriented so the
 * p1-side is the domain side (F < 0).
 */
export function bisectorCov(p1, p2) {
    const v1 = ballToMinkowski(p1);
    const v2 = ballToMinkowski(p2);
    const sp = v2.sp.clone().sub(v1.sp);
    const t = v2.t - v1.t;
    const normSq = sp.lengthSq() - t * t;   // > 0 for distinct points
    if (normSq <= 1e-30) return null;
    const inv = 1 / Math.sqrt(normSq);
    return new THREE.Vector4(sp.x * inv, sp.y * inv, sp.z * inv, t * inv);
}

/** F(p) for covector W: negative on the domain side, zero on the wall. */
export function wallF(p, W) {
    const p2 = p.x * p.x + p.y * p.y + p.z * p.z;
    return 2 * (p.x * W.x + p.y * W.y + p.z * W.z) - (1 + p2) * W.w;
}

/**
 * Euclidean geometry of a wall: sphere {c, r, s} or plane {n}.
 * s = sign such that signed distance = s * (|p-c| - r), negative on domain side.
 */
export function covToGeom(W) {
    if (Math.abs(W.w) < 1e-9) {
        const n = new THREE.Vector3(W.x, W.y, W.z).normalize();
        return { type: 'plane', n };
    }
    const c = new THREE.Vector3(W.x / W.w, W.y / W.w, W.z / W.w);
    const r = 1 / Math.abs(W.w);
    const s = W.w > 0 ? -1 : 1;   // w0>0: domain is OUTSIDE the sphere
    return { type: 'sphere', c, r, s };
}

/** Euclidean signed distance to wall surface; negative on domain side. */
export function wallSD(p, geom) {
    if (geom.type === 'plane') {
        return p.x * geom.n.x + p.y * geom.n.y + p.z * geom.n.z;
    }
    const dx = p.x - geom.c.x, dy = p.y - geom.c.y, dz = p.z - geom.c.z;
    return geom.s * (Math.sqrt(dx * dx + dy * dy + dz * dz) - geom.r);
}

/** Outward (away-from-domain) Euclidean unit normal of a wall at p (on the wall). */
export function wallOutwardNormal(p, geom) {
    if (geom.type === 'plane') return geom.n.clone();
    const n = new THREE.Vector3().subVectors(p, geom.c).normalize();
    return geom.s > 0 ? n : n.negate();
}

/**
 * Is p in the closed domain (unit ball ∩ all wall half-spaces), tolerance tol?
 * `skip` (optional) is an index to ignore.
 */
export function isInsideWalls(p, geoms, tol = 1e-6, skip = -1) {
    if (p.x * p.x + p.y * p.y + p.z * p.z >= 1.0) return false;
    for (let i = 0; i < geoms.length; i++) {
        if (i === skip) continue;
        if (wallSD(p, geoms[i]) > tol) return false;
    }
    return true;
}

/**
 * Sample points on a wall surface (inside the unit ball), spread from the
 * point of the wall nearest to `basept`. Returns array of Vector3.
 */
export function sampleWallPoints(geom, basept, dense = true) {
    const out = [];
    const push = (p) => { if (p.lengthSq() < 0.9999) out.push(p); };

    if (geom.type === 'plane') {
        // Pole: projection of basept onto the plane
        const n = geom.n;
        const d = basept.dot(n);
        const pole = new THREE.Vector3().subVectors(basept, n.clone().multiplyScalar(d));
        // Tangent frame in the plane
        let u = new THREE.Vector3(1, 0, 0);
        if (Math.abs(n.x) > 0.9) u.set(0, 1, 0);
        u.sub(n.clone().multiplyScalar(u.dot(n))).normalize();
        const v = new THREE.Vector3().crossVectors(n, u);
        push(pole.clone());
        const radii = dense ? [0.02, 0.06, 0.13, 0.25, 0.4, 0.6, 0.8, 0.95, 1.2, 1.5]
            : [0.05, 0.2, 0.5, 0.9];
        const nTheta = dense ? 12 : 8;
        for (const rho of radii) {
            for (let k = 0; k < nTheta; k++) {
                const th = (k + 0.5 * (radii.indexOf(rho) % 2)) * 2 * Math.PI / nTheta;
                push(pole.clone()
                    .add(u.clone().multiplyScalar(rho * Math.cos(th)))
                    .add(v.clone().multiplyScalar(rho * Math.sin(th))));
            }
        }
        return out;
    }

    // Sphere: pole = closest point to basept
    const { c, r } = geom;
    let dir = new THREE.Vector3().subVectors(basept, c);
    if (dir.lengthSq() < 1e-24) dir.set(0, 0, 1);
    dir.normalize();
    let u = new THREE.Vector3(1, 0, 0);
    if (Math.abs(dir.x) > 0.9) u.set(0, 1, 0);
    u.sub(dir.clone().multiplyScalar(u.dot(dir))).normalize();
    const v = new THREE.Vector3().crossVectors(dir, u);

    const mk = (cl, sl, th) => {
        const ct = Math.cos(th), st = Math.sin(th);
        const rd = new THREE.Vector3(
            cl * dir.x + sl * (ct * u.x + st * v.x),
            cl * dir.y + sl * (ct * u.y + st * v.y),
            cl * dir.z + sl * (ct * u.z + st * v.z)
        );
        push(new THREE.Vector3().addVectors(c, rd.multiplyScalar(r)));
    };
    push(new THREE.Vector3().addVectors(c, dir.clone().multiplyScalar(r)));
    const lats = dense ? [5, 12, 22, 34, 47, 60, 72, 85] : [15, 40, 70];
    const nTheta = dense ? 12 : 8;
    for (const latDeg of lats) {
        const lat = latDeg * Math.PI / 180;
        const cl = Math.cos(lat), sl = Math.sin(lat);
        for (let k = 0; k < nTheta; k++) {
            mk(cl, sl, (k + 0.5 * (lats.indexOf(latDeg) % 2)) * 2 * Math.PI / nTheta);
        }
    }
    return out;
}

/** Project a point onto a wall surface. */
export function projectToWall(p, geom) {
    if (geom.type === 'plane') {
        const d = p.dot(geom.n);
        return p.clone().sub(geom.n.clone().multiplyScalar(d));
    }
    const d = p.clone().sub(geom.c);
    if (d.lengthSq() < 1e-24) d.set(0, 0, 1);
    d.setLength(geom.r);
    return geom.c.clone().add(d);
}

/**
 * Violation functional: max over the other walls (and the unit sphere) of the
 * signed distance at p. Negative ⇔ p is in the interior of the face region.
 */
export function faceViolation(p, geoms, skip) {
    let m = p.length() - 1.0;
    for (let j = 0; j < geoms.length; j++) {
        if (j === skip) continue;
        const v = wallSD(p, geoms[j]);
        if (v > m) m = v;
    }
    return m;
}

/**
 * Local pattern search ON the wall surface, minimizing the violation
 * functional. Finds interior points of sliver faces that a fixed sample grid
 * misses. Returns {p, v}.
 */
export function refineOnWall(geom, start, geoms, skip) {
    let p = projectToWall(start, geom);
    let v = faceViolation(p, geoms, skip);
    let h = 0.05;
    const DIRS = [[1, 0], [-1, 0], [0, 1], [0, -1],
    [0.7071, 0.7071], [0.7071, -0.7071], [-0.7071, 0.7071], [-0.7071, -0.7071]];
    for (let it = 0; it < 80 && h > 1e-9; it++) {
        const n = geom.type === 'plane' ? geom.n : p.clone().sub(geom.c).normalize();
        let u = Math.abs(n.x) > 0.9 ? new THREE.Vector3(0, 1, 0) : new THREE.Vector3(1, 0, 0);
        u.sub(n.clone().multiplyScalar(u.dot(n))).normalize();
        const w = new THREE.Vector3().crossVectors(n, u);
        let improved = false;
        for (const [du, dw] of DIRS) {
            const cand = projectToWall(
                p.clone().add(u.clone().multiplyScalar(h * du)).add(w.clone().multiplyScalar(h * dw)),
                geom);
            const cv = faceViolation(cand, geoms, skip);
            if (cv < v - 1e-15) { v = cv; p = cand; improved = true; break; }
        }
        if (!improved) h *= 0.6;
        if (v < -1e-4) break;   // comfortably interior — done
    }
    return { p, v };
}

/**
 * Does the wall contribute a (codim-1) face to the domain cut out by `geoms`?
 * I.e., does some point of the wall lie STRICTLY inside all other half-spaces?
 * The negative tolerance rejects bisectors merely tangent to the domain along
 * an edge or vertex (those would create zero-area "faces").
 * With `refine`, a local search is run from the best grid sample so that even
 * sliver faces (far below the grid resolution) are detected.
 */
export function wallContributes(geom, geoms, idx, basept, dense = true, tol = -1e-5, refine = false) {
    const samples = sampleWallPoints(geom, basept, dense);
    let best = null, bestV = Infinity;
    for (const p of samples) {
        const v = faceViolation(p, geoms, idx);
        if (v < tol && p.lengthSq() < 1) return true;
        if (v < bestV) { bestV = v; best = p; }
    }
    if (refine && best) {
        const r = refineOnWall(geom, best, geoms, idx);
        if (r.v < -1e-6 && r.p.lengthSq() < 1) return true;
    }
    return false;
}

// ---------------- Words ----------------

export function formatWordMathJax(wordArr) {
    if (!wordArr || wordArr.length === 0) return 'e';
    // Compress runs: g g g -> g^3
    const parts = [];
    let i = 0;
    while (i < wordArr.length) {
        let j = i;
        while (j < wordArr.length && wordArr[j] === wordArr[i]) j++;
        const idx = Math.abs(wordArr[i]);
        const count = j - i;
        const exp = wordArr[i] > 0 ? count : -count;
        parts.push(exp === 1 ? `g_{${idx}}` : `g_{${idx}}^{${exp}}`);
        i = j;
    }
    return parts.join(' ');
}

export function reduceWord(wordArr) {
    const result = [];
    for (const idx of wordArr) {
        if (result.length > 0 && result[result.length - 1] === -idx) result.pop();
        else result.push(idx);
    }
    return result;
}

export function invertWord(wordArr) {
    return wordArr.slice().reverse().map(i => -i);
}

// ---------------- Cayley graph ----------------

// Small LRU shared by the Cayley and dual layers. Cache group elements, not
// projected points: moving the view must neither re-enumerate nor re-key Γ.
const cayleyCache = new Map();

export function getCayleyGraph(generators = [], maxDepth = 4, viewMat = Matrix2x2.identity(), maxNodes = 4000) {
    if (!generators || generators.length === 0) return { points: [], edges: [] };

    const cacheKey = JSON.stringify([maxDepth, maxNodes, generators.map(m =>
        [m.anti, m.a.re, m.a.im, m.b.re, m.b.im, m.c.re, m.c.im, m.d.re, m.d.im])]);
    const project = graph => ({
        points: graph.matrices.map(m => uhsToBall(imageOfOriginUHS(viewMat.mul(m)))),
        edges: graph.edges.map(e => ({ ...e }))
    });
    if (cayleyCache.has(cacheKey)) {
        const graph = cayleyCache.get(cacheKey);
        cayleyCache.delete(cacheKey);
        cayleyCache.set(cacheKey, graph);
        return project(graph);
    }
    const identity = Matrix2x2.identity();
    const queue = [{ matrix: identity, depth: 0, index: 0 }];
    const matrices = [identity];
    const edges = [];
    const seenMatrices = new Map();
    const seenEdges = new Set();
    seenMatrices.set(pslKey(identity), 0);

    let head = 0;
    while (head < queue.length) {
        const { matrix, depth, index: uIdx } = queue[head++];
        if (depth >= maxDepth) continue;
        for (let genIdx = 0; genIdx < generators.length; genIdx++) {
            const nextMat = matrix.mul(generators[genIdx]);
            const k = pslKey(nextMat);
            let vIdx;
            if (seenMatrices.has(k)) {
                vIdx = seenMatrices.get(k);
            } else {
                if (matrices.length >= maxNodes) continue;
                vIdx = matrices.length;
                matrices.push(nextMat);
                seenMatrices.set(k, vIdx);
                queue.push({ matrix: nextMat, depth: depth + 1, index: vIdx });
            }
            if (uIdx !== vIdx) {
                const edgeKey = uIdx < vIdx ? `${uIdx}-${vIdx}` : `${vIdx}-${uIdx}`;
                if (!seenEdges.has(edgeKey)) {
                    seenEdges.add(edgeKey);
                    edges.push({ u: uIdx, v: vIdx, type: Math.floor(genIdx / 2) });
                }
            }
        }
    }

    const graph = { matrices, edges };
    cayleyCache.set(cacheKey, graph);
    if (cayleyCache.size > 4) cayleyCache.delete(cayleyCache.keys().next().value);
    return project(graph);
}

// ---------------- Lorentz action ----------------

/**
 * The 4×4 Lorentz matrix of an isometry (orientation-reversing allowed),
 * acting on hyperboloid vectors (x, y, z, t) — and, since the form is
 * invariant, on wall covectors too: ⟨L·W, L·X⟩ = ⟨W, X⟩, so a wall moves by
 * the same matrix as its points. Built from the images of four independent
 * hyperboloid points, which keeps it consistent with every model map above.
 * Returns a row-major Float64Array(16).
 */
export function lorentzMatrix(m) {
    const pts = [
        new THREE.Vector3(0, 0, 0), new THREE.Vector3(0.5, 0, 0),
        new THREE.Vector3(0, 0.5, 0), new THREE.Vector3(0, 0, 0.5)
    ];
    const col = (p) => { const h = ballToMinkowski(p); return [h.sp.x, h.sp.y, h.sp.z, h.t]; };
    const X = pts.map(col);
    const Y = pts.map(p => col(applyMatrixToBall(m, p)));
    // Solve L·X = Y with X, Y as 4×4 (columns = points): L = Y·X⁻¹.
    const Xm = [0, 1, 2, 3].map(r => X.map(c => c[r]));
    const inv = invert4(Xm);
    const L = new Float64Array(16);
    for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) {
        let s = 0;
        for (let k = 0; k < 4; k++) s += Y[k][r] * inv[k][c];
        L[4 * r + c] = s;
    }
    return L;
}

function invert4(A) {
    const n = 4, M = A.map((row, i) => [...row, ...[0, 1, 2, 3].map(j => (i === j ? 1 : 0))]);
    for (let c = 0; c < n; c++) {
        let p = c;
        for (let r = c + 1; r < n; r++) if (Math.abs(M[r][c]) > Math.abs(M[p][c])) p = r;
        [M[c], M[p]] = [M[p], M[c]];
        const d = M[c][c];
        for (let k = 0; k < 2 * n; k++) M[c][k] /= d;
        for (let r = 0; r < n; r++) {
            if (r === c) continue;
            const f = M[r][c];
            if (f) for (let k = 0; k < 2 * n; k++) M[r][k] -= f * M[c][k];
        }
    }
    return M.map(row => row.slice(n));
}

/** Apply a Lorentz matrix to a covector / hyperboloid vector (THREE.Vector4). */
export function lorentzApply(L, W) {
    const v = [W.x, W.y, W.z, W.w];
    const out = [0, 0, 0, 0];
    for (let r = 0; r < 4; r++) out[r] = L[4 * r] * v[0] + L[4 * r + 1] * v[1] + L[4 * r + 2] * v[2] + L[4 * r + 3] * v[3];
    return new THREE.Vector4(out[0], out[1], out[2], out[3]);
}
