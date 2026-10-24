/**
 * Classical certificates that a Fuchsian group is discrete, for the groups
 * whose domain Poincaré's theorem (certifier.js) cannot finish: walls that
 * meet the sphere at infinity only where two of them touch leave the cusp
 * unresolved (Γ(2), ⟨z + 1⟩). Exact, for orientation-preserving generators
 * with rational entries and positive determinants — a subgroup of
 * PGL₂⁺(ℚ) ⊂ PSL₂(ℝ). Every test is conjugation-invariant.
 *
 *  · Parabolics at one cusp: every generator parabolic, with a common fixed
 *    point (proportional nilpotent parts). Over ℚ the translation ratios
 *    are rational, so the group is a cyclic group of translations: ℤ.
 *  · Two generators A, B with κ = tr[A, B] ≤ −2 (normalized): Fricke — a
 *    one-holed or once-punctured torus group, discrete and free.
 *  · Two parabolics conjugate to (1 a; 0 1) and (1 0; b 1) with |ab| ≥ 4:
 *    discrete and free, by ping-pong (|ab| = 4 is Γ(2)).
 *  · A parabolic and an involution: Hecke — conjugate to
 *    ⟨(1 λ; 0 1), (0 −1; 1 0)⟩, discrete for λ ≥ 2 and for λ = 2cos(π/q);
 *    over ℚ, λ² ∈ {1, 2, 3}.
 *
 * The same tests run at the real place in PresentationCalc/js/fuchsian2.js
 * (fuchsianPairTest), which also reads them for generators of negative
 * determinant.
 */
import { Frac } from './exact.js';

const babs = (x) => (x < 0n ? -x : x);
const bgcd = (a, b) => { a = babs(a); b = babs(b); while (b) [a, b] = [b, a % b]; return a; };
const mul = (A, B) => [A[0] * B[0] + A[1] * B[2], A[0] * B[1] + A[1] * B[3], A[2] * B[0] + A[3] * B[2], A[2] * B[1] + A[3] * B[3]];
const adj = (A) => [A[3], -A[1], -A[2], A[0]];
const det = (A) => A[0] * A[3] - A[1] * A[2];
const tr = (A) => A[0] + A[3];
function isqrt(n) {
    if (n < 2n) return n;
    let x = BigInt(Math.floor(Math.sqrt(Number(n))));
    while (x * x > n) x--;
    while ((x + 1n) * (x + 1n) <= n) x++;
    return x;
}
const fracText = (p, q) => new Frac(p, q).toString();

/** A field element's value as a Frac, or null if it is irrational. */
function rational(x) {
    if (typeof x.rational === 'function') return x.rational();
    if (!x.c || x.c.slice(1).some(c => !c.isZero())) return null;
    return x.c[0] || new Frac(0n);
}

/** An exact matrix with rational entries as a primitive integer matrix [a, b, c, d], or null. */
function integral(E) {
    const f = [E.a, E.b, E.c, E.d].map(rational);
    if (f.some(x => !x)) return null;
    const L = f.reduce((l, x) => (l / bgcd(l, x.q)) * x.q, 1n);
    const m = f.map(x => x.p * (L / x.q));
    const g = m.reduce((s, x) => bgcd(s, x), 0n) || 1n;
    return m.map(x => x / g);
}

/** Nilpotent part of a parabolic, up to scale: 2A − tr(A)·1. */
const nilpotent = (A) => [2n * A[0] - tr(A), 2n * A[1], 2n * A[2], 2n * A[3] - tr(A)];
const parabolic = (A) => tr(A) * tr(A) === 4n * det(A) && nilpotent(A).some(x => x !== 0n);
const involution = (A) => tr(A) === 0n;
const proportional = (N, M) => N.every((x, i) => N.every((y, j) => x * M[j] === y * M[i]));

/**
 * ctx: { gens: ExactMat[] } (the typed generators, exact). Returns
 * { kind, headline, lines } proving the group discrete, or null.
 */
export function classicalDiscreteness(ctx) {
    if (!ctx || !ctx.gens || !ctx.gens.length) return null;
    if (ctx.gens.some(E => E.anti)) return null;
    const G = ctx.gens.map(integral);
    if (G.some(A => !A || det(A) <= 0n)) return null;
    const names = G.map((_, i) => `g${i + 1}`);

    // Parabolics at one cusp: a cyclic group of translations.
    if (G.every(parabolic)) {
        const N = G.map(nilpotent);
        if (N.every(M => proportional(N[0], M))) {
            const list = names.join(', ');
            return {
                kind: 'cyclic-parabolic',
                headline: G.length === 1 ? 'a single parabolic generates ℤ' : `${list} are parabolics at one cusp with rational translation ratios`,
                lines: [
                    G.length === 1
                        ? `${names[0]} is parabolic (tr² = 4·det, exact).`
                        : `${list} are parabolic (tr² = 4·det) with a common fixed point (their nilpotent parts are proportional, exact).`,
                    `In the frame where that point is ∞ they translate by rational multiples of one translation τ, so the group is the cyclic group ⟨z ↦ z + τ/n⟩ ≅ ℤ for some n: discrete.`,
                ],
            };
        }
    }
    if (G.length !== 2) return null;
    const [A, B] = G;

    // Hecke: a parabolic and an involution.
    for (const [P, E, p, e] of [[A, B, 'g1', 'g2'], [B, A, 'g2', 'g1']]) {
        if (!parabolic(P) || !involution(E)) continue;
        const num = tr(mul(P, E)) ** 2n, den = det(P) * det(E);      // λ² = tr²(PE)/(det P·det E)
        const lam2 = fracText(num, den);
        const head = `${p} is parabolic and ${e} an involution: ⟨${p}, ${e}⟩ is conjugate to the Hecke group ⟨(1 λ; 0 1), (0 −1; 1 0)⟩ with λ² = tr²(${p}·${e})/(det ${p}·det ${e}) = ${lam2} (exact).`;
        if (num >= 4n * den) {
            return {
                kind: 'hecke', headline: `Hecke's criterion: λ² = ${lam2} ≥ 4`,
                lines: [head, `λ ≥ 2: the strip |Re z| ≤ λ/2 outside the unit circle is a fundamental domain (Hecke), so the group is discrete — ℤ ∗ ℤ/2.`],
            };
        }
        const q = { 1: 3, 2: 4, 3: 6 }[num % den === 0n ? Number(num / den) : 0];
        if (q) {
            return {
                kind: 'hecke', headline: `Hecke's criterion: λ = 2cos(π/${q})`,
                lines: [head, `λ = 2cos(π/${q}): the Hecke group H(${q}), discrete (Hecke) — ℤ/2 ∗ ℤ/${q}.`],
            };
        }
    }

    const kNum = tr(mul(mul(A, B), mul(adj(A), adj(B)))), kDen = det(A) * det(B);  // κ = tr[A, B]
    if (kNum === 2n * kDen) return null;                                            // a common fixed point
    const kappa = fracText(kNum, kDen);
    if (kNum <= -2n * kDen) {
        return {
            kind: 'fricke', headline: `Fricke: tr[g1, g2] = ${kappa} ≤ −2`,
            lines: [
                `tr[g1, g2] = ${kappa} for the normalized generators (exact), and ≤ −2.`,
                `A two-generator subgroup of PSL₂(ℝ) with tr[A, B] ≤ −2 uniformizes a one-holed (or, at −2, once-punctured) torus: it is discrete and free on A, B (Fricke).`,
            ],
        };
    }
    if (parabolic(A) && parabolic(B)) {
        const D = det(A) * det(B), r = isqrt(D);
        if (r * r === D) {
            const s = (tr(A) > 0n ? 1n : -1n) * (tr(B) > 0n ? 1n : -1n);
            const t = new Frac(s * tr(mul(A, B)), r);                  // tr(AB) with traces normalized to +2
            const ab = t.sub(new Frac(2n));                            // = ab
            if (babs(ab.p) >= 4n * ab.q) {
                return {
                    kind: 'parabolic-pair', headline: `two parabolics with |ab| = ${new Frac(babs(ab.p), ab.q)} ≥ 4`,
                    lines: [
                        `g1 and g2 are parabolic with different fixed points (exact), so they are conjugate to (1 a; 0 1) and (1 0; b 1); with their traces normalized to +2, tr(g1·g2) = 2 + ab = ${t} (exact), so |ab| = ${new Frac(babs(ab.p), ab.q)}.`,
                        `|ab| ≥ 4: the isometric circles of (1 0; b 1)^±1, centred at ∓1/b with radius 1/|b|, and the strip |Re z| ≤ |a|/2 play ping-pong, so ⟨g1, g2⟩ is discrete and free (|ab| = 4 is Γ(2)).`,
                    ],
                };
            }
        }
    }
    return null;
}
