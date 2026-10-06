/**
 * certificates.js — exact proofs that Γ is NOT discrete at a place at ∞.
 *
 * poincare's certifier proves discreteness (Poincaré's polyhedron theorem);
 * when it fails, that alone proves nothing. These two tests turn a short word
 * into a proof of non-discreteness at the embedding σ: K ↪ ℂ of the exact
 * context (poincare's expr.js tower, read for that embedding).
 *
 *  1. An elliptic of infinite order. For W ∈ PGL₂(K) put t = tr(W)²/det(W).
 *     At σ, W is elliptic iff σ(t) is real and 0 ≤ σ(t) < 4. If W has finite
 *     order m then its eigenvalue ratio is a primitive m-th root of unity of
 *     degree ≤ 2 over K, so φ(m) ≤ 2[K:ℚ]. An elliptic of no such order
 *     generates a subgroup dense in a circle: Γ is not discrete at σ.
 *  2. Shimizu's lemma. If ⟨P, g⟩ ⊂ PSL₂(ℂ) is discrete, P = (1 1; 0 1) and
 *     g = (a b; c d), then c = 0 or |c| ≥ 1. Invariantly, for a parabolic P
 *     and any g in PGL₂(K),
 *         s = (2·tr(Pg)/tr(P) − tr(g))² / det(g)        (= (x·c)² for P = (1 x; 0 1))
 *     lies in K, and 0 < |σ(s)| < 1 means ⟨P, g⟩ is not discrete.
 *
 * Every zero test and the finite-order test are exact; the comparisons
 * |σ(s)| < 1, σ(t) < 4 and Im σ(t) = 0 are made in floating point, and only
 * when they are not close calls.
 */
import { ExactMat } from '../../Kleinian/poincare/js/exact.js';

const MARGIN = 1e-9;

/** Largest m with φ(m) ≤ bound, and the list of such m. */
function ordersUpTo(bound) {
    const phi = (m) => {
        let r = m, x = m;
        for (let p = 2; p * p <= x; p++) {
            if (x % p) continue;
            while (x % p === 0) x /= p;
            r -= r / p;
        }
        if (x > 1) r -= r / x;
        return r;
    };
    const out = [];
    // φ(m) ≥ √(m/2), so m ≤ 2·bound² suffices.
    for (let m = 1; m <= 2 * bound * bound + 2; m++) if (phi(m) <= bound) out.push(m);
    return out;
}

const projKey = (M) => {
    const lead = [M.a, M.b, M.c, M.d].find((x) => !x.isZero());
    const s = lead.inv();
    return [M.a, M.b, M.c, M.d].map((x) => x.mul(s).key()).join('|');
};

const SUB = '₀₁₂₃₄₅₆₇₈₉';
export const wordText = (w) => (w.length ? w.map((x) => `g${String(Math.abs(x)).split('').map((c) => SUB[+c]).join('')}${x < 0 ? '⁻¹' : ''}`).join('·') : 'e');

/** Reduced words up to `maxLen` (signed 1-based letters), with their exact matrices, one per element. */
function shortElements(gens, maxLen, cap = 600) {
    const K = gens[0].a.K;
    const letters = [];
    gens.forEach((g, i) => { letters.push({ l: i + 1, M: g }); letters.push({ l: -(i + 1), M: g.invProj() }); });
    const seen = new Set([projKey(ExactMat.identity(K))]);
    const out = [];
    let layer = [{ w: [], M: ExactMat.identity(K) }];
    for (let len = 1; len <= maxLen && out.length < cap; len++) {
        const next = [];
        for (const { w, M } of layer) {
            for (const { l, M: L } of letters) {
                if (w.length && w[w.length - 1] === -l) continue;
                const N = M.mul(L);
                const key = projKey(N);
                if (seen.has(key)) continue;
                seen.add(key);
                const e = { w: w.concat([l]), M: N };
                out.push(e); next.push(e);
                if (out.length >= cap) break;
            }
            if (out.length >= cap) break;
        }
        layer = next;
    }
    return out;
}

/**
 * Is σ(x) real? σ(x) is a root of x's minimal polynomial over ℚ, whose roots
 * are well separated, so a tolerance far below that separation decides it.
 * (The tower's complex conjugation would make this exact, but it is not
 * needed, and building it can adjoin levels.)
 */
function isRealAt(K, x) {
    const v = x.embed();
    return Math.abs(v.im) <= 1e-10 * Math.max(1, Math.abs(v.re));
}

/**
 * Search short words for a certificate of non-discreteness.
 * ctx = { field, gens } (no orientation-reversing generators).
 * Returns { nondiscrete: true, kind, word(s), text } or { nondiscrete: false, checked }.
 */
export function archCertificate(ctx, { maxLen = null, cap = 600 } = {}) {
    const K = ctx.field, gens = ctx.gens;
    if (!gens.length || gens.some((g) => g.anti)) return { nondiscrete: false, checked: 0, skipped: 'mirrors' };
    const r = gens.length;
    const len = maxLen ?? (r <= 2 ? 4 : r <= 3 ? 3 : 2);
    const elems = shortElements(gens, len, cap);
    const orders = ordersUpTo(2 * K.deg);
    const four = K.fromInt(4), two = K.fromInt(2);
    const parabolics = [];

    for (const e of elems) {
        const M = e.M;
        const tr = M.a.add(M.d), det = M.det();
        const t = tr.mul(tr).div(det);
        if (t.sub(four).isZero()) { parabolics.push({ ...e, tr, det }); e.tr = tr; e.det = det; continue; }
        e.tr = tr; e.det = det;
        const tv = t.embed();
        // Elliptic only when σ(t) is clearly inside (0, 4). The old lower bound
        // −MARGIN let an exact value in (−10⁻⁹, 0) through; sqrt then clamped it
        // to 0, so a loxodromic (trace not real) was reported as rotation by π.
        if (!(tv.re > MARGIN && tv.re < 4 - MARGIN)) continue;
        if (!isRealAt(K, t)) continue;
        // elliptic at σ: rotation angle θ with σ(t) = 4cos²(θ/2); a finite order m has mθ ∈ 2πℤ
        const theta = 2 * Math.acos(Math.min(1, Math.sqrt(tv.re) / 2));
        let finite = false;
        for (const m of orders) {
            const k = m * theta / (2 * Math.PI);
            if (Math.abs(k - Math.round(k)) > 1e-6) continue;
            if (M.pow(m).isProjectiveIdentity()) { finite = true; break; }
        }
        if (!finite) {
            return {
                nondiscrete: true, kind: 'elliptic', word: e.w,
                angle: theta,
                text: `${wordText(e.w)} is elliptic of infinite order (rotation by ${(theta / Math.PI).toFixed(6)}π, not a rational multiple of π with φ(m) ≤ ${2 * K.deg}), so its powers accumulate at the identity.`,
            };
        }
    }

    for (const P of parabolics) {
        for (const g of elems) {
            if (g === P) continue;
            const PG = P.M.mul(g.M);
            const trPG = PG.a.add(PG.d);
            const x = trPG.mul(two).div(P.tr).sub(g.tr);
            if (x.isZero()) continue;                       // g fixes P's fixed point
            const s = x.mul(x).div(g.det);
            const sv = s.embed();
            const abs = Math.hypot(sv.re, sv.im);
            if (abs < 1 - MARGIN) {
                return {
                    nondiscrete: true, kind: 'shimizu', word: g.w, parabolic: P.w, value: abs,
                    text: `${wordText(P.w)} is parabolic and ${wordText(g.w)} has |c| = ${Math.sqrt(abs).toFixed(6)} < 1 in the frame where ${wordText(P.w)} = (1 1; 0 1): Shimizu's lemma says ⟨${wordText(P.w)}, ${wordText(g.w)}⟩ is not discrete.`,
                };
            }
        }
    }
    return { nondiscrete: false, checked: elems.length, parabolics: parabolics.length, length: len };
}
