/**
 * archPlaces.js — which places at ∞ of the field of definition F see Γ
 * unbounded, and which of them lie over the same place of the trace field k.
 *
 * At an embedding σ: F ↪ ℂ, an element g with t = tr(g)²/det(g) is elliptic
 * (in a compact subgroup) iff σ(t) is real with 0 ≤ σ(t) < 4. A Zariski-dense
 * Γ is unbounded at σ iff the quaternion algebra splits at σ|k, and then some
 * short word is not elliptic there. Every t lies in k, so two embeddings of F
 * restrict to the same place of k exactly when they give the same values t
 * (up to complex conjugation): that is the class key.
 *
 * Numerical, but only used to choose an embedding for poincare (the certificate
 * itself is checked there) and to cross-check the Zariski engine's count.
 */

const cx = (re, im = 0) => ({ re, im });
const add = (a, b) => cx(a.re + b.re, a.im + b.im);
const sub = (a, b) => cx(a.re - b.re, a.im - b.im);
const mul = (a, b) => cx(a.re * b.re - a.im * b.im, a.re * b.im + a.im * b.re);
const div = (a, b) => { const q = b.re * b.re + b.im * b.im; return cx((a.re * b.re + a.im * b.im) / q, (a.im * b.re - a.re * b.im) / q); };

/** Σ c_i z^i for Frac coefficients c (low → high). */
function evalAt(coeffs, z) {
    let r = cx(0);
    for (let i = coeffs.length - 1; i >= 0; i--) {
        const c = coeffs[i];
        r = add(mul(r, z), cx(Number(c.p) / Number(c.q)));
    }
    return r;
}

const mmul = (A, B) => [
    add(mul(A[0], B[0]), mul(A[1], B[2])), add(mul(A[0], B[1]), mul(A[1], B[3])),
    add(mul(A[2], B[0]), mul(A[3], B[2])), add(mul(A[2], B[1]), mul(A[3], B[3])),
];
const adj = (A) => [A[3], cx(-A[1].re, -A[1].im), cx(-A[2].re, -A[2].im), A[0]];
const scale = (A) => { const m = Math.max(...A.map((z) => Math.hypot(z.re, z.im))); return A.map((z) => cx(z.re / m, z.im / m)); };

/** t = tr²/det for every word of length ≤ 3 in the generators at the root `root`. */
function tauValues(model, root) {
    const gens = model.mats.map((row) => row.map((e) => evalAt(e.coeffs, root)));
    const letters = gens.flatMap((g) => [scale(g), scale(adj(g))]);
    const out = [];
    let layer = letters;
    // scalar words (A·A⁻¹, S·S for an involution S) are the identity: tr²/det = 4 means nothing there
    const scalar = (A) => Math.hypot(A[1].re, A[1].im) < 1e-9 && Math.hypot(A[2].re, A[2].im) < 1e-9
        && Math.hypot(A[0].re - A[3].re, A[0].im - A[3].im) < 1e-9;
    for (let len = 1; len <= 3; len++) {
        for (const A of layer) {
            if (scalar(A)) continue;
            const tr = add(A[0], A[3]), det = sub(mul(A[0], A[3]), mul(A[1], A[2]));
            out.push(div(mul(tr, tr), det));
        }
        if (len === 3) break;
        const next = [];
        for (const A of layer) for (const B of letters) { next.push(scale(mmul(A, B))); if (next.length > 4000) break; }
        layer = next;
    }
    return out;
}

/**
 * The places at ∞ of F (model.arch), each with
 *   noncompact: Γ is unbounded there
 *   classKey:   equal for places over the same place of k
 */
export function archClasses(model) {
    return model.arch.map((a) => {
        const taus = tauValues(model, a.root);
        const noncompact = taus.some((t) => {
            const s = Math.max(1, Math.hypot(t.re, t.im));
            return Math.abs(t.im) > 1e-7 * s || t.re < -1e-7 * s || t.re > 4 - 1e-7 * s;
        });
        // conjugation: make the first clearly non-real value have Im > 0
        const first = taus.find((t) => Math.abs(t.im) > 1e-7 * Math.max(1, Math.hypot(t.re, t.im)));
        const sgn = first && first.im < 0 ? -1 : 1;
        const r = (x) => String(Math.round(x * 1e5) / 1e5 + 0);
        const classKey = taus.slice(0, 40).map((t) => `${r(t.re)},${r(sgn * t.im)}`).join(';');
        return { ...a, noncompact, classKey };
    });
}
