// solver.js — hyperbolic structures from shape parameters (Thurston's gluing equations).
//
// Unknowns: w_j = log z_j, one per tetrahedron. With L_j = log(1 − z_j) tracked on a
// continuous branch, log z′ = −L and log z″ = iπ − w + L (the three angles sum to π,
// SnapPea's convention), every equation is linear in (w, L):
//
//   edge e:        Σ_j A_j log z_j + B_j log z′_j + C_j log z″_j = 2πi
//   complete cusp: H(m) = 0                        (H = log of the holonomy's derivative)
//   filled cusp:   p·H(m) + q·H(l) = 2πi·t         (t = cone angle / 2π; t = 1 is the filling)
//
// For 0 < t < 1 the completion is a cone manifold with cone angle 2πt along the core
// of the filling; t = 1/n gives an orbifold. The path t: 0 → 1 is Thurston's
// hyperbolic Dehn surgery deformation (a ray in Dehn surgery space).

import { C, add, sub, mul, div, scale, exp, log, abs, neg, ONE } from './complex.js';
import { totalVolume } from './volume.js';
import { gcdInt } from './triangulation.js';

const PI = Math.PI;
const COLLAPSE = 1e-7;      // a cone manifold with less volume than this has collapsed

/** The linear form Σ aw·w + aL·L + iπ·c0 of an integer (z, z′, z″) row. */
export function rowForm(row, n) {
    const aw = new Float64Array(n), aL = new Float64Array(n);
    let c0 = 0;
    for (let j = 0; j < n; j++) {
        const A = row[3 * j], B = row[3 * j + 1], Cc = row[3 * j + 2];
        aw[j] = A - Cc; aL[j] = Cc - B; c0 += Cc;
    }
    return { aw, aL, c0 };
}
const combine = (f, a, g, b) => ({
    aw: f.aw.map((x, j) => a * x + b * g.aw[j]),
    aL: f.aL.map((x, j) => a * x + b * g.aL[j]),
    c0: a * f.c0 + b * g.c0,
});
function evalForm(F, st) {
    let re = 0, im = PI * F.c0;
    for (let j = 0; j < st.w.length; j++) {
        re += F.aw[j] * st.w[j].re + F.aL[j] * st.L[j].re;
        im += F.aw[j] * st.w[j].im + F.aL[j] * st.L[j].im;
    }
    return C(re, im);
}

export class Solver {
    constructor(tri) {
        this.tri = tri;
        const n = this.n = tri.n;
        this.edgeForms = tri.edgeRows.map((r) => rowForm(r, n));
        this.cuspForms = [];
        for (let k = 0; k < tri.nCusp; k++) {
            this.cuspForms.push({ m: rowForm(tri.cuspRows[2 * k], n), l: rowForm(tri.cuspRows[2 * k + 1], n) });
        }
    }

    /** The complete structure from the census shapes (principal branches). */
    completeState() {
        const z = this.tri.entry.shapes.map(([re, im]) => C(re, im));
        return { w: z.map(log), L: z.map((x) => log(sub(ONE, x))) };
    }

    shapes(st) { return st.w.map(exp); }

    /** Log-holonomies H(m), H(l) of every cusp. */
    holonomies(st) {
        return this.cuspForms.map((F) => ({ m: evalForm(F.m, st), l: evalForm(F.l, st) }));
    }

    /** The equations for a filling spec: per cusp, null (complete) or {p, q, t}. */
    equations(spec) {
        const eqs = this.edgeForms.map((F) => ({ F, rhs: C(0, 2 * PI) }));
        this.cuspForms.forEach((F, k) => {
            const s = spec[k];
            if (!s) eqs.push({ F: F.m, rhs: C(0, 0) });
            else eqs.push({ F: combine(F.m, s.p, F.l, s.q), rhs: C(0, 2 * PI * s.t) });
        });
        return eqs;
    }

    residual(st, eqs) {
        return eqs.map((e) => sub(evalForm(e.F, st), e.rhs));
    }

    /** Damped Gauss–Newton from st toward the solution of eqs. */
    newton(st, eqs, { maxIter = 40, tol = 1e-12 } = {}) {
        const n = this.n;
        let r = this.residual(st, eqs), nr = maxAbs(r);
        for (let it = 0; it < maxIter; it++) {
            if (nr < tol) return { ok: true, st, res: nr, iters: it };
            const z = st.w.map(exp);
            const dL = z.map((x) => neg(div(x, sub(ONE, x))));       // dL/dw = −z/(1−z)
            const J = eqs.map((e) => {
                const row = new Array(n);
                for (let j = 0; j < n; j++) row[j] = add(C(e.F.aw[j], 0), scale(dL[j], e.F.aL[j]));
                return row;
            });
            const delta = lstsq(J, r.map(neg));
            if (!delta) return { ok: false, st, res: nr, iters: it, why: 'singular' };
            let lambda = 1, accepted = false;
            for (let h = 0; h < 12; h++) {
                const trial = step(st, delta, dL, lambda);
                if (trial) {
                    const r2 = this.residual(trial, eqs), n2 = maxAbs(r2);
                    if (Number.isFinite(n2) && (n2 < nr || n2 < tol)) { st = trial; r = r2; nr = n2; accepted = true; break; }
                }
                lambda /= 2;
            }
            if (!accepted) return { ok: false, st, res: nr, iters: it, why: 'stalled' };
        }
        return { ok: nr < 1e-9, st, res: nr, iters: maxIter, why: nr < 1e-9 ? '' : 'no convergence' };
    }

    /**
     * Follow the structure along a path in Dehn surgery space.
     * specAt(s) gives the spec at s ∈ [0, 1]; start is the state at s = 0.
     * Returns frames at s = i/N (as far as the path survives) and where it degenerated.
     */
    follow(start, specAt, { N = 120, minStep = 1 / 65536 } = {}) {
        const frames = [this.frame(start, 0, specAt(0))];
        const V0 = frames[0].volume;
        let cur = start, sCur = 0, prev = null, sPrev = 0;
        for (let i = 1; i <= N; i++) {
            const target = i / N;
            const adv = this.advance(cur, sCur, target, specAt, { prev, sPrev, minStep });
            if (!adv.ok) {
                return { frames, ok: false, sFail: adv.s, failState: adv.st, why: adv.why };
            }
            const fr = this.frame(adv.st, target, specAt(target));
            if (V0 > 1e-6 && fr.volume < COLLAPSE) {
                // the cone manifolds collapse: find where the volume reaches 0 and stop there
                let lo = sCur, hi = target, stLo = cur;
                for (let b = 0; b < 40 && hi - lo > 1e-9; b++) {
                    const mid = (lo + hi) / 2;
                    const a = this.advance(stLo, lo, mid, specAt, { minStep: minStep / 64 });
                    if (a.ok && this.frame(a.st, mid, specAt(mid)).volume > COLLAPSE) { lo = mid; stLo = a.st; } else hi = mid;
                }
                if (lo > sCur) frames.push(this.frame(stLo, lo, specAt(lo)));
                return { frames, ok: false, collapsed: true, sFail: hi, why: 'the volume reaches 0' };
            }
            prev = adv.prev; sPrev = adv.sPrev; cur = adv.st; sCur = target;
            frames.push(fr);
        }
        return { frames, ok: true };
    }

    /** Adaptive continuation of st from s0 to s1 (halving the step on failure). */
    advance(st, s0, s1, specAt, { prev = null, sPrev = 0, minStep = 1 / 65536 } = {}) {
        let cur = st, sCur = s0, h = s1 - s0;
        while (sCur < s1 - 1e-15) {
            h = Math.min(h, s1 - sCur);
            const sNext = sCur + h;
            const guess = prev ? extrapolate(prev, cur, (sNext - sCur) / (sCur - sPrev || 1)) : cur;
            const res = this.newton(guess, this.equations(specAt(sNext)));
            if (res.ok && !degenerate(res.st)) {
                prev = cur; sPrev = sCur; cur = res.st; sCur = sNext;
                h = Math.min(h * 2, s1 - s0);
            } else {
                h /= 2;
                if (h < minStep) return { ok: false, s: sCur, st: cur, why: res.ok ? 'a tetrahedron degenerates' : res.why };
            }
        }
        return { ok: true, st: cur, prev, sPrev };
    }

    /** Everything the views need at one point of a path. */
    frame(st, s, spec) {
        const z = st.w.map(exp);
        const hol = this.holonomies(st);
        const cores = hol.map((h, k) => coreLength(spec[k], h));
        return { s, st, z, volume: totalVolume(z), hol, cores, spec };
    }

    /** Solve for a spec by continuation from the complete structure (all t from 0 together). */
    solve(spec, opts = {}) {
        const specAt = (s) => spec.map((c) => (c ? { p: c.p, q: c.q, t: c.t * s } : null));
        const path = this.follow(this.completeState(), specAt, { N: opts.N || 8, minStep: opts.minStep || 1 / 4096 });
        const last = path.frames[path.frames.length - 1];
        return { ok: path.ok, frame: path.ok ? last : null, path };
    }
}

/**
 * The core of a filled cusp: with p s − q r = 1, the curve r·m + s·l is isotopic to the
 * core, and its log-holonomy r·H(m) + s·H(l) is the core's complex length (cone angle 2πt:
 * the torsion is defined modulo 2πt). Normalized so the length is ≥ 0.
 */
export function coreLength(spec, h) {
    if (!spec) return null;
    const { p, q } = spec;
    if (!Number.isInteger(p) || !Number.isInteger(q)) return null;
    const [r, s] = dualCurve(p, q);
    let lam = add(scale(h.m, r), scale(h.l, s));
    if (lam.re < 0) lam = neg(lam);
    return lam;
}

/** Integers (r, s) with p·s − q·r = 1, for coprime (p, q). */
export function dualCurve(p, q) {
    // extended Euclid on (p, q): x·p + y·q = g
    let [a, b, x0, y0, x1, y1] = [p, q, 1, 0, 0, 1];
    while (b !== 0) {
        const k = Math.floor(a / b);
        [a, b] = [b, a - k * b];
        [x0, x1] = [x1, x0 - k * x1];
        [y0, y1] = [y1, y0 - k * y1];
    }
    // x0·p + y0·q = a = ±1  ⇒  s = x0, r = −y0 gives p·s − q·r = a
    const sgn = a < 0 ? -1 : 1;
    return [-y0 * sgn, x0 * sgn];
}
export const coprime = (p, q) => gcdInt(p, q) === 1;

function maxAbs(v) { let m = 0; for (const x of v) m = Math.max(m, abs(x)); return m; }

function step(st, delta, dL, lambda) {
    const w = [], L = [];
    for (let j = 0; j < st.w.length; j++) {
        const dw = scale(delta[j], lambda);
        const wn = add(st.w[j], dw);
        const z = exp(wn);
        const one = sub(ONE, z);
        if (!Number.isFinite(z.re) || abs(one) < 1e-300) return null;
        const Lp = log(one);
        const pred = add(st.L[j], mul(dL[j], dw));
        const k = Math.round((pred.im - Lp.im) / (2 * PI));
        w.push(wn); L.push(C(Lp.re, Lp.im + 2 * PI * k));
    }
    return { w, L };
}

function extrapolate(prev, cur, ratio) {
    const lin = (a, b) => add(b, scale(sub(b, a), ratio));
    const w = cur.w.map((x, j) => lin(prev.w[j], x));
    // keep L on the branch continuous with cur.L
    const L = w.map((wn, j) => {
        const Lp = log(sub(ONE, exp(wn)));
        const pred = lin(prev.L[j], cur.L[j]);
        const k = Math.round((pred.im - Lp.im) / (2 * PI));
        return C(Lp.re, Lp.im + 2 * PI * k);
    });
    return { w, L };
}

/** A shape at 0, 1 or ∞: the tetrahedron has collapsed. */
export function degenerate(st, eps = 1e-7) {
    for (let j = 0; j < st.w.length; j++) {
        if (st.w[j].re < Math.log(eps) || st.w[j].re > -Math.log(eps)) return true;
        if (st.L[j].re < Math.log(eps)) return true;
    }
    return false;
}

/** Least squares J x = b (m ≥ n) by complex Householder QR. Null if J is (numerically) rank deficient. */
export function lstsq(J, b) {
    const m = J.length, n = J[0].length;
    const A = J.map((r) => r.map((x) => ({ re: x.re, im: x.im })));
    const y = b.map((x) => ({ re: x.re, im: x.im }));
    let scaleMax = 0;
    for (const r of A) for (const x of r) scaleMax = Math.max(scaleMax, abs(x));
    for (let k = 0; k < n; k++) {
        let norm2 = 0;
        for (let i = k; i < m; i++) norm2 += A[i][k].re ** 2 + A[i][k].im ** 2;
        const norm = Math.sqrt(norm2);
        if (norm < 1e-13 * (scaleMax || 1)) return null;
        const x0 = A[k][k], ax0 = abs(x0);
        const phase = ax0 > 0 ? scale(x0, 1 / ax0) : ONE;
        const alpha = scale(phase, -norm);          // A[k][k] → alpha
        // v = x − alpha e1
        const v = [];
        for (let i = k; i < m; i++) v.push(i === k ? sub(A[i][k], alpha) : A[i][k]);
        let vn2 = 0;
        for (const x of v) vn2 += x.re ** 2 + x.im ** 2;
        if (vn2 === 0) continue;
        const apply = (getCol, setCol) => {
            // col ← col − 2 v (v^H col) / (v^H v)
            let dr = 0, di = 0;
            for (let i = 0; i < v.length; i++) {
                const c = getCol(i);
                dr += v[i].re * c.re + v[i].im * c.im;
                di += v[i].re * c.im - v[i].im * c.re;
            }
            const f = 2 / vn2;
            for (let i = 0; i < v.length; i++) {
                const c = getCol(i);
                setCol(i, { re: c.re - f * (v[i].re * dr - v[i].im * di), im: c.im - f * (v[i].re * di + v[i].im * dr) });
            }
        };
        for (let j = k; j < n; j++) apply((i) => A[k + i][j], (i, val) => { A[k + i][j] = val; });
        apply((i) => y[k + i], (i, val) => { y[k + i] = val; });
    }
    const x = new Array(n);
    for (let k = n - 1; k >= 0; k--) {
        let s = y[k];
        for (let j = k + 1; j < n; j++) s = sub(s, mul(A[k][j], x[j]));
        x[k] = div(s, A[k][k]);
    }
    return x;
}

export { exp as cexp };
