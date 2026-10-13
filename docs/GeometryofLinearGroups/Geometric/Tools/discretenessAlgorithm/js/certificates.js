/**
 * certificates.js — exact proofs that Γ is NOT discrete at a place at ∞.
 *
 * poincare's certifier proves discreteness (Poincaré's polyhedron theorem);
 * when it fails, that alone proves nothing. The search for the opposite proof
 * is poincare's own (nondiscrete.js, which its page runs whenever the
 * certificate fails), here on short words at the embedding σ: K ↪ ℂ of the
 * exact context (poincare's expr.js tower, read for that embedding):
 *
 *  1. an elliptic of infinite order (no m with φ(m) ≤ 2[K:ℚ] has Wᵐ = 1);
 *  2. a cusp group that is not discrete: parabolics at one point whose
 *     translations have a real irrational ratio or span ℚ-rank ≥ 3, or an
 *     element fixing the cusp whose multiplier μ has μ⁴ ≠ 1 and μ⁶ ≠ 1
 *     (a loxodromic, or a rotation the crystallographic restriction forbids);
 *  3. Jørgensen's inequality for a non-elementary pair — with a parabolic,
 *     Shimizu's lemma (|c| ≥ 1 in the frame where P = (1 1; 0 1)).
 *
 * Every zero test, ℚ-rank, finite-order test and realness test is exact.
 * The comparisons (σ(t) < 4, Jørgensen's sum < 1) are floating point, with a
 * margin. Realness that could not be proved (no complex conjugation on K)
 * is not promoted to a certificate.
 */
import { Matrix2x2 } from '../../Kleinian/poincare/js/math.js';
import { findNondiscreteness } from '../../Kleinian/poincare/js/nondiscrete.js';
import { serializeTowerContext, deserializeTowerContext } from '../../Kleinian/poincare/js/tower.js';

const SUB = '₀₁₂₃₄₅₆₇₈₉';
export const wordText = (w) => (w.length ? w.map((x) => `g${String(Math.abs(x)).split('').map((c) => SUB[+c]).join('')}${x < 0 ? '⁻¹' : ''}`).join('·') : 'e');

/**
 * Search short words for a certificate of non-discreteness.
 * ctx = { field, gens } (no orientation-reversing generators).
 * Returns { nondiscrete: true, kind, word(s), text } or { nondiscrete: false, checked }.
 */
export function archCertificate(ctx, { maxLen = null, cap = 600 } = {}) {
    const gens = ctx.gens;
    if (!gens.length || gens.some((g) => g.anti)) return { nondiscrete: false, checked: 0, skipped: 'mirrors' };
    const r = gens.length;
    const len = maxLen ?? (r <= 2 ? 4 : r <= 3 ? 3 : 2);
    // A copy: proving that an algebraic number is real may adjoin conjugation.
    const copy = deserializeTowerContext(serializeTowerContext(ctx));
    // The search screens in floating point at σ and confirms over K.
    const num = copy.gens.map((E) => new Matrix2x2(E.a.embed(), E.b.embed(), E.c.embed(), E.d.embed()));
    const res = findNondiscreteness(num, copy, { maxLen: len, cap, allowConj: true });
    if (!res.found || !res.exact) return { nondiscrete: false, checked: res.checked, length: len };
    return {
        nondiscrete: true, kind: res.kind, word: res.words[0], words: res.words,
        angle: res.angle, value: res.value, text: res.text,
    };
}
