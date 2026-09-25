/**
 * Invariants of a Kleinian group computed from its certified domain and its
 * orbit enumeration: the complex length spectrum, closed geodesics drawn
 * inside the domain, the invariant trace field and an arithmeticity test
 * (exact, over the user's number field), and the horoball packing of a cusp.
 */
// Relative (not the bare 'three' specifier) so the engine also loads in a Web
// Worker, where import maps do not apply. Same URL as the pages' import maps.
import * as THREE from '../../../Geometric/Tools/Kleinian/vendor/three/three.module.js';
import {
    Complex, uhsToBall, ballToMinkowski, applyMatrixToBall as applyBall,
    translationTowards, lorentzMatrix, lorentzApply
} from './math.js';
import { buildPolyhedron, polyhedronVolume } from './polyhedron.js';
import { Frac, subfieldOf, coordinatesIn, rationalPolyRoots, polyString, minimalPolynomial } from './exact.js';

// ---------------- complex length spectrum ----------------

/** Principal complex arccosh with Re ≥ 0. */
function cacosh(z) {
    // acosh z = log(z + √(z−1)·√(z+1))
    const s1 = Complex.sqrt(z.sub(new Complex(1))), s2 = Complex.sqrt(z.add(new Complex(1)));
    let w = Complex.log(z.add(s1.mul(s2)));
    if (w.re < 0) w = new Complex(-w.re, -w.im);
    return w;
}

/**
 * Complex length L = ℓ + iθ of an orientation-preserving element (det 1):
 * tr = ±2 cosh(L/2), θ normalised to (−π, π]. null for elliptic/parabolic.
 */
export function complexLength(m) {
    if (m.anti) return null;
    const M = m.normalized();
    const tr = M.a.add(M.d);
    // Parabolics (tr² = 4) come out of float products with tr² − 4 ~ 1e-13,
    // which would read as a spurious length ~1e-6.
    if (Math.sqrt(tr.mul(tr).sub(new Complex(4)).normSq()) < 1e-8) return null;
    const L = cacosh(tr.mul(0.5)).mul(2);
    if (L.re < 1e-7) return null;
    let th = L.im % (2 * Math.PI);
    if (th > Math.PI) th -= 2 * Math.PI;
    if (th <= -Math.PI) th += 2 * Math.PI;
    return new Complex(L.re, Math.abs(th) < 1e-9 ? 0 : th);
}

/**
 * Distinct primitive complex lengths among `elements` ([{matrix, word}]),
 * shortest first: [{length: Complex, word, count}]. `count` is how many
 * distinct elements of the enumeration share the length (conjugates and
 * inverses) — a lower bound on the multiplicity, not the multiplicity.
 */
export function lengthSpectrum(elements, { max = 12, maxReal = 8 } = {}) {
    const classes = [];
    for (const { matrix, word } of elements) {
        const L = complexLength(matrix);
        if (!L || L.re > maxReal) continue;
        const hit = classes.find(c => Math.abs(c.length.re - L.re) < 1e-6 &&
            Math.abs(angleDiff(c.length.im, L.im)) < 1e-6);
        if (hit) {
            hit.count++;
            if (word.length < hit.word.length) hit.word = word.slice();
        } else {
            classes.push({ length: L, word: word.slice(), count: 1 });
        }
    }
    classes.sort((a, b) => a.length.re - b.length.re || a.length.im - b.length.im);
    // Drop powers: L ≈ k·L₀ (mod 2πi) for a shorter class.
    const prim = [];
    for (const c of classes) {
        const isPower = prim.some(p => {
            const k = Math.round(c.length.re / p.length.re);
            return k >= 2 && Math.abs(c.length.re - k * p.length.re) < 1e-5 &&
                Math.abs(angleDiff(c.length.im, k * p.length.im)) < 1e-5;
        });
        if (!isPower) prim.push(c);
        if (prim.length >= max) break;
    }
    return prim;
}

function angleDiff(a, b) {
    let d = (a - b) % (2 * Math.PI);
    if (d > Math.PI) d -= 2 * Math.PI;
    if (d < -Math.PI) d += 2 * Math.PI;
    return d;
}

// ---------------- closed geodesics inside the domain ----------------

/** Boundary point of the ball for z ∈ C ∪ {∞} (null = ∞). */
function boundaryBall(z) {
    if (z === null) return new THREE.Vector3(0, 0, 1);
    return uhsToBall({ x: z.re, y: z.im, t: 0 });
}

/** Möbius action on C ∪ {∞} (null = ∞), orientation-reversing aware. */
function mobius(m, z) {
    if (z === null) return Math.sqrt(m.c.normSq()) < 1e-14 ? null : m.a.div(m.c);
    const w = m.anti ? z.conj() : z;
    const den = m.c.mul(w).add(m.d);
    if (Math.sqrt(den.normSq()) < 1e-14) return null;
    return m.a.mul(w).add(m.b).div(den);
}

function ballToC(p) {
    const D = p.x * p.x + p.y * p.y + (1 - p.z) * (1 - p.z);
    if (D < 1e-14) return null;
    return new Complex(2 * p.x / D, 2 * p.y / D);
}

/** Repelling / attracting fixed points of a loxodromic (det 1) in C ∪ {∞}. */
function fixedPoints(m) {
    const M = m.normalized();
    const tr = M.a.add(M.d);
    const disc = Complex.sqrt(tr.mul(tr).sub(new Complex(4)));
    // Eigenvalues λ± = (tr ± disc)/2; attracting fixed point has |λ| > 1.
    const lp = tr.add(disc).mul(0.5), lm = tr.sub(disc).mul(0.5);
    const fix = (lam) => {
        // (M − λ)v = 0 with v = (z, 1): z = b/(λ − a), or ∞ if b = 0 and c = 0 …
        if (Math.sqrt(M.c.normSq()) > 1e-12) return lam.sub(M.d).div(M.c);
        const den = lam.sub(M.a);
        return Math.sqrt(den.normSq()) < 1e-12 ? null : M.b.div(den);
    };
    const [big, small] = lp.normSq() >= lm.normSq() ? [lp, lm] : [lm, lp];
    return { attract: fix(big), repel: fix(small) };
}

const mink = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] - a[3] * b[3];
const nullVec = (xi) => [xi.x, xi.y, xi.z, 1];
const hypPoint = (p) => { const m = ballToMinkowski(p); return [m.sp.x, m.sp.y, m.sp.z, m.t]; };
const toBall = (X) => new THREE.Vector3(X[0] / (1 + X[3]), X[1] / (1 + X[3]), X[2] / (1 + X[3]));

/**
 * The closed geodesic of a loxodromic element, folded into the domain.
 *
 * The axis runs from the repelling to the attracting fixed point. With light-
 * like lifts N∓ of those endpoints, p(s) = (e^s N₊ + e^{−s} N₋)/√(−2⟨N₊,N₋⟩)
 * is its unit-speed parametrisation, and a wall W is crossed where
 * e^{2s} = −⟨W,N₋⟩/⟨W,N₊⟩ — closed form, no marching. Each time the geodesic
 * leaves through a face, the face pairing carries it back in through the
 * partner face. After one period ℓ it closes up: the segments are the closed
 * geodesic of the quotient, drawn inside its fundamental domain.
 *
 * @param walls  scene-frame walls ({cov, pairing: {matrix}})
 * @param m      the element, acting in the scene frame
 * @returns {{segments: THREE.Vector3[][], length, closed}} or null
 */
export function geodesicInDomain(walls, m, { samples = 24, maxSegments = 400 } = {}) {
    const L = complexLength(m);
    if (!L) return null;
    let { attract, repel } = fixedPoints(m);
    const W = walls.map(w => [w.cov.x, w.cov.y, w.cov.z, w.cov.w]);
    const inside = (X) => W.every(w => mink(w, X) <= 1e-9);
    const frame = () => {
        const Np = nullVec(boundaryBall(attract)), Nm = nullVec(boundaryBall(repel));
        return { Np, Nm, nrm: Math.sqrt(-2 * mink(Np, Nm)) };
    };
    const at = (f, s) => {
        const ep = Math.exp(s), em = Math.exp(-s);
        return [0, 1, 2, 3].map(i => (ep * f.Np[i] + em * f.Nm[i]) / f.nrm);
    };
    const param = (f, X) => 0.5 * Math.log(mink(X, f.Nm) / mink(X, f.Np));

    // Start at the axis point nearest the origin, folded into the domain.
    let f = frame();
    let s = 0.5 * Math.log(-f.Nm[3] / -f.Np[3]);          // argmin of the time coordinate
    let X = at(f, s);
    for (let it = 0; it < 200 && !inside(X); it++) {
        let worst = 1e-9, k = -1;
        W.forEach((w, j) => { const v = mink(w, X); if (v > worst) { worst = v; k = j; } });
        const P = walls[k].pairing?.matrix;
        if (!P) return null;
        const p = toBall(X);
        attract = mobius(P, attract); repel = mobius(P, repel);
        f = frame();
        X = hypPoint(applyBall(P, p));
        s = param(f, X);
    }
    if (!inside(X)) return null;

    const segments = [];
    let travelled = 0;
    for (let seg = 0; seg < maxSegments && travelled < L.re - 1e-9; seg++) {
        // Next exit: the smallest crossing parameter ahead of s.
        let sExit = Infinity, k = -1;
        W.forEach((w, j) => {
            const a = mink(w, f.Np), b = mink(w, f.Nm);
            if (a <= 1e-15) return;                        // forward end on the domain side
            const r = -b / a;
            if (r <= 0) return;
            const t = 0.5 * Math.log(r);
            if (t > s + 1e-10 && t < sExit) { sExit = t; k = j; }
        });
        if (k < 0) break;                                   // runs off to infinity inside
        const end = Math.min(sExit, s + (L.re - travelled));
        const pts = [];
        for (let i = 0; i <= samples; i++) pts.push(toBall(at(f, s + (end - s) * i / samples)));
        segments.push(pts);
        travelled += end - s;
        if (end < sExit) break;                             // closed before reaching the wall
        const P = walls[k].pairing?.matrix;
        if (!P) break;
        const exitBall = toBall(at(f, sExit));
        attract = mobius(P, attract); repel = mobius(P, repel);
        f = frame();
        s = param(f, hypPoint(applyBall(P, exitBall)));
    }
    return { segments, length: L, closed: travelled >= L.re - 1e-6 };
}

// ---------------- invariant trace field and arithmeticity ----------------

/** tr(M)²/det(M) for an exact matrix: projectively invariant. */
function normTr2(M) {
    const t = M.a.add(M.d);
    return t.mul(t).div(M.det());
}

/**
 * Invariant trace field kΓ = Q(tr²γ : γ ∈ Γ) of Γ = ⟨g₁,…,gₙ⟩ (exact), from
 * Maclachlan–Reid: it is generated by tr²gᵢ, tr gᵢ tr gⱼ tr gᵢgⱼ and
 * tr gᵢ tr gⱼ tr gₖ tr gᵢgⱼgₖ — each divided by the determinants so that the
 * value does not depend on the matrix representative in GL₂(K).
 *
 * With `finiteVolume`, also decides arithmeticity (Maclachlan–Reid 8.3.2):
 * Γ is arithmetic iff kΓ has exactly one complex place, all traces are
 * algebraic integers, and the invariant quaternion algebra ramifies at every
 * real place of kΓ.
 */
export function invariantTraceField(exactCtx, { finiteVolume = false } = {}) {
    if (!exactCtx) return null;
    const gens = exactCtx.gens;
    if (gens.some(g => g.anti)) {
        return { note: 'orientation-reversing generators: the trace field is computed for orientation-preserving groups' };
    }
    const K = exactCtx.field;
    const n = gens.length;
    const tr = (M) => M.a.add(M.d);
    const gensInv = [], traceSquares = [];
    for (let i = 0; i < n; i++) {
        traceSquares.push({ word: [i], t2: normTr2(gens[i]) });
    }
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const gij = gens[i].mul(gens[j]);
        const den = gens[i].det().mul(gens[j].det());
        gensInv.push(tr(gens[i]).mul(tr(gens[j])).mul(tr(gij)).div(den));
        traceSquares.push({ word: [i, j], t2: normTr2(gij) });
        for (let k = j + 1; k < n; k++) {
            const gijk = gij.mul(gens[k]);
            const den3 = den.mul(gens[k].det());
            gensInv.push(tr(gens[i]).mul(tr(gens[j])).mul(tr(gens[k])).mul(tr(gijk)).div(den3));
            traceSquares.push({ word: [i, j, k], t2: normTr2(gijk) });
        }
    }
    // The product formulas degenerate when a generator has trace 0 (an
    // order-2 rotation such as S kills tr S·tr T·tr ST), so also take tr² of
    // every word of length ≤ 3 — all of them lie in kΓ, and together they
    // recover it in practice (PSL(2,Z[ω]) needs tr²(US) = ω² to see ω).
    const letters = [];
    gens.forEach((g, i) => { letters.push({ m: g, w: [i + 1] }); letters.push({ m: g.invProj(), w: [-(i + 1)] }); });
    let layer = letters;
    const words = [];
    for (let len = 1; len <= 3; len++) {
        for (const x of layer) { gensInv.push(normTr2(x.m)); words.push(x); }
        if (len === 3) break;
        const next = [];
        for (const x of layer) for (const y of letters) {
            if (x.w[x.w.length - 1] === -y.w[0]) continue;
            next.push({ m: x.m.mul(y.m), w: [...x.w, ...y.w] });
        }
        layer = next.length > 400 ? next.slice(0, 400) : next;
    }
    const F = subfieldOf(gensInv);
    if (!F.minpoly) return { degree: F.degree, note: 'no primitive element found' };
    // A tidier primitive element: of the generating values of full degree,
    // the one whose minimal polynomial has the smallest coefficients.
    const size = (mp) => mp.reduce((s, c) => s + Math.abs(c.toNumber()), 0);
    let best = F.minpoly;
    const seenVals = new Set();
    for (const x of gensInv) {
        const key = x.c.map(c => c.toString()).join(',');
        if (seenVals.has(key)) continue;
        seenVals.add(key);
        if (seenVals.size > 80) break;
        const mp = minimalPolynomial(x);
        if (mp.length - 1 === F.degree && size(mp) < size(best)) { best = mp; F.primitive = x; }
    }
    F.minpoly = best;
    const roots = rationalPolyRoots(F.minpoly);
    const r1 = roots.filter(r => Math.abs(r.im) < 1e-9).length;
    const r2 = (roots.length - r1) / 2;
    const out = {
        degree: F.degree,
        minpoly: polyString(F.minpoly, 'x'),
        minpolyCoeffs: F.minpoly.map(c => c.toString()),
        signature: [r1, r2],
        discriminant: polyDiscriminantString(F.minpoly),
    };
    // Integrality: every normalised tr² among gᵢ, gᵢgⱼ, gᵢgⱼgₖ is an algebraic integer.
    out.integral = traceSquares.every(({ t2 }) => {
        const mp = minimalPolynomial(t2);
        return mp.every(c => c.q === 1n);
    });
    if (!finiteVolume) return out;

    const reasons = [];
    if (r2 !== 1) reasons.push(`kΓ has ${r2} complex places (need exactly 1)`);
    if (!out.integral) reasons.push('some trace is not an algebraic integer');
    // Quaternion algebra AΓ = (a, b) with a = t_g(t_g − 4), b = t_g t_h (tr[g,h] − 2),
    // g non-parabolic and [g,h] ≠ 1 (Maclachlan–Reid 3.6.2).
    const four = K.fromFrac(new Frac(4n)), two = K.fromFrac(new Frac(2n));
    // g must be neither parabolic (t = 4) nor of order 2 (t = 0), else a = 0.
    let G = null, Hm = null, comm = null;
    for (const x of words) {
        const t = normTr2(x.m);
        if (t.isZero() || t.equals(four)) continue;
        for (const y of words) {
            const ty = normTr2(y.m);
            if (ty.isZero()) continue;
            const C = x.m.mul(y.m).mul(x.m.adj()).mul(y.m.adj());
            const tc = tr(C).div(x.m.det().mul(y.m.det()));
            if (!tc.equals(two)) { G = x.m; Hm = y.m; comm = tc; break; }
        }
        if (G) break;
    }
    let realPlaces = [];
    if (G && r1 > 0) {
        const tg = normTr2(G), th = normTr2(Hm);
        const a = tg.mul(tg.sub(four));
        const b = tg.mul(th).mul(comm.sub(two));
        const ca = coordinatesIn(a, F.primitive, F.degree).map(c => c.toNumber());
        const cb = coordinatesIn(b, F.primitive, F.degree).map(c => c.toNumber());
        const ev = (coeffs, x) => coeffs.reduceRight((acc, c) => acc * x + c, 0);
        realPlaces = roots.filter(r => Math.abs(r.im) < 1e-9).map(r => {
            const sa = ev(ca, r.re), sb = ev(cb, r.re);
            return { root: r.re, ramified: sa < 0 && sb < 0 };
        });
        const unram = realPlaces.filter(p => !p.ramified).length;
        if (unram > 0) reasons.push(`the quaternion algebra splits at ${unram} real place(s)`);
    } else if (r1 > 0) {
        reasons.push('could not form the quaternion algebra (no suitable generator pair)');
    }
    out.realPlaces = realPlaces;
    out.arithmetic = reasons.length === 0;
    out.reasons = reasons;
    return out;
}

/** Discriminant of a rational polynomial (as a string), via the resultant. */
function polyDiscriminantString(coeffs) {
    try {
        const n = coeffs.length - 1;
        if (n < 1) return '';
        // Sylvester matrix of f and f', determinant by fraction-free Gauss.
        const f = coeffs.map(c => c);
        const df = [];
        for (let i = 1; i <= n; i++) df.push(f[i].mul(new Frac(BigInt(i))));
        const m = 2 * n - 1;
        const S = Array.from({ length: m }, () => Array(m).fill(new Frac(0n)));
        for (let r = 0; r < n - 1; r++) for (let i = 0; i <= n; i++) S[r][r + i] = f[n - i];
        for (let r = 0; r < n; r++) for (let i = 0; i < n; i++) S[n - 1 + r][r + i] = df[n - 1 - i];
        let det = new Frac(1n);
        const A = S.map(row => row.slice());
        for (let c = 0; c < m; c++) {
            let p = c;
            while (p < m && A[p][c].isZero()) p++;
            if (p === m) return '0';
            if (p !== c) { [A[p], A[c]] = [A[c], A[p]]; det = det.neg(); }
            det = det.mul(A[c][c]);
            for (let r = c + 1; r < m; r++) {
                if (A[r][c].isZero()) continue;
                const fct = A[r][c].div(A[c][c]);
                for (let k = c; k < m; k++) A[r][k] = A[r][k].sub(A[c][k].mul(fct));
            }
        }
        // disc = (−1)^{n(n−1)/2} · res(f, f') / lead(f)
        let d = det.div(f[n]);
        if ((n * (n - 1) / 2) % 2 === 1) d = d.neg();
        return d.toString();
    } catch (e) {
        return '';
    }
}

// ---------------- horoball packing ----------------

/**
 * The horoball packing of the cusp at ∞, for a group containing parabolics
 * fixing ∞. Elements come from the orbit enumeration (det 1).
 *
 * The maximal embedded horoball at ∞ is {t > H} with H = 1/min|c| over the
 * elements moving ∞ — it touches its first image. An element g = (a b; c d)
 * with c ≠ 0 carries it to the horoball tangent to C at a/c with Euclidean
 * diameter 1/(|c|²H). Translations fixing ∞ tile the pattern periodically.
 *
 * @returns {{H, balls: [{base: Complex, diameter}], lattice: Complex[]}} or null
 */
export function horoballPacking(elements, { window = 6, minDiameter = 0.02, max = 2500 } = {}) {
    let cmin = Infinity;
    const trans = [];
    for (const { matrix } of elements) {
        if (matrix.anti) continue;
        const M = matrix.normalized();
        const c = Math.sqrt(M.c.normSq());
        if (c < 1e-9) {
            const r = M.a.div(M.d);
            if (Math.abs(Math.sqrt(r.normSq()) - 1) > 1e-6) return null;   // ∞ is not a cusp
            if (Math.abs(r.re - 1) < 1e-9 && Math.abs(r.im) < 1e-9) {
                const t = M.b.div(M.d);
                if (Math.sqrt(t.normSq()) > 1e-9) trans.push(t);
            }
        } else if (c < cmin) cmin = c;
    }
    if (!Number.isFinite(cmin) || trans.length === 0) return null;
    const H = 1 / cmin;
    // Two shortest independent translations span the cusp lattice (enough to tile).
    trans.sort((a, b) => a.normSq() - b.normSq());
    const lattice = [trans[0]];
    for (const t of trans) {
        const u = lattice[0];
        if (Math.abs(u.re * t.im - u.im * t.re) > 1e-6 * Math.sqrt(u.normSq() * t.normSq())) { lattice.push(t); break; }
    }
    const seen = new Set();
    const balls = [];
    const push = (base, diameter) => {
        if (diameter < minDiameter * H || Math.abs(base.re) > window || Math.abs(base.im) > window) return;
        const key = `${base.re.toFixed(5)},${base.im.toFixed(5)}`;
        if (seen.has(key)) return;
        seen.add(key);
        balls.push({ base, diameter });
    };
    const bases = [];
    for (const { matrix } of elements) {
        if (matrix.anti) continue;
        const M = matrix.normalized();
        const c2 = M.c.normSq();
        if (Math.sqrt(c2) < 1e-9) continue;
        bases.push({ base: M.a.div(M.c), diameter: 1 / (c2 * H) });
    }
    const R = Math.ceil(2 * window / Math.max(1e-6, Math.sqrt(lattice[0].normSq()))) + 1;
    const R2 = lattice[1] ? Math.ceil(2 * window / Math.max(1e-6, Math.sqrt(lattice[1].normSq()))) + 1 : 0;
    for (const b of bases) {
        for (let i = -R; i <= R && balls.length < max; i++) {
            for (let j = -R2; j <= R2 && balls.length < max; j++) {
                let z = b.base.add(lattice[0].mul(i));
                if (lattice[1]) z = z.add(lattice[1].mul(j));
                push(z, b.diameter);
            }
        }
    }
    balls.sort((a, b) => b.diameter - a.diameter);
    return { H, balls: balls.slice(0, max), lattice };
}

// ---------------- volume from any interior point ----------------


/**
 * Hyperbolic volume of a domain given an interior point: move that point to
 * the ball origin (walls move by the Lorentz matrix of the translation), then
 * integrate radially in the Klein model. NaN for infinite volume.
 */
export function domainVolume(walls, interior) {
    let covs = walls.map(w => w.cov);
    const r = interior.length();
    if (r > 1e-12) {
        const V = translationTowards(interior.clone().multiplyScalar(1 / r), -2 * Math.atanh(Math.min(r, 1 - 1e-15)));
        const L = lorentzMatrix(V);
        covs = covs.map(W => {
            const X = lorentzApply(L, W);
            const n = Math.sqrt(Math.max(1e-300, X.x * X.x + X.y * X.y + X.z * X.z - X.w * X.w));
            return X.multiplyScalar(1 / n);
        });
    }
    return polyhedronVolume(buildPolyhedron(covs.map(cov => ({ cov }))));
}
