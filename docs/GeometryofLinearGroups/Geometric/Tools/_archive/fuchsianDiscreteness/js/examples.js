/**
 * examples.js — Library of PGL₂(ℚ) generating sets exercising every decision path.
 * Each matrix is [a, b, c, d] given as exact rational strings.
 */
export const examples = [
    {
        name: 'Modular group PSL₂(ℤ)',
        desc: 'S, T. Discrete — Poincaré-certified: fundamental domain ≅ C₂∗C₃ with an order-2 and order-3 cone point and one cusp.',
        mats: [['0', '-1', '1', '0'], ['1', '1', '0', '1']],
    },
    {
        name: 'Infinite-order elliptic (single)',
        desc: 'One generator with t = tr²/det = 4/3 ∉ {0,1,2,3}: elliptic of infinite order ⇒ non-discrete.',
        mats: [['1', '-2', '1', '1']],
    },
    {
        name: 'Incommensurable axes ⟨diag 2, diag 3⟩',
        desc: 'Two hyperbolics sharing the axis (0,∞) with multipliers 2 and 3 (mult. independent) ⇒ non-discrete, no elliptic — near-identity hyperbolic witness.',
        mats: [['2', '0', '0', '1'], ['3', '0', '0', '1']],
    },
    {
        name: 'Dense parabolics (Shimizu)',
        desc: '⟨z+1, z/(½z+1)⟩ with lower-left entry ½ < 1 violates Shimizu’s lemma ⇒ non-discrete; beam finds an infinite-order elliptic word.',
        mats: [['1', '1', '0', '1'], ['1', '0', '1/2', '1']],
    },
    {
        name: 'Sanov free group = Γ(2)',
        desc: '⟨[[1,2],[0,1]], [[1,0],[2,1]]⟩ — free, discrete (principal congruence Γ(2), thrice-punctured sphere). Poincaré-certified: an ideal quadrilateral with paired sides, 3 cusps, no relations.',
        mats: [['1', '2', '0', '1'], ['1', '0', '2', '1']],
    },
    {
        name: 'Finite cyclic (order 4)',
        desc: '⟨[[1,-1],[1,1]]⟩, t=2 ⇒ elliptic of order 4; the Cayley graph closes ⇒ discrete (finite).',
        mats: [['1', '-1', '1', '1']],
    },
    {
        name: 'Hecke-style commutator → elliptic',
        desc: 'Two parabolics with small offset; a short word becomes an infinite-order elliptic ⇒ non-discrete.',
        mats: [['1', '1', '0', '1'], ['1', '0', '2/3', '1']],
    },

    // ---- ℚ-representable groups carried over from the /fuchsian/ library ----
    // (its triangle (2,3,7)… and Hecke H(5),H(6),H(7) groups need cos(π/n), √3, φ —
    //  irrational, so not representable in PGL₂(ℚ) and omitted here.)
    {
        name: 'Congruence subgroup Γ₀(2)',
        desc: '⟨[[1,1],[0,1]], [[1,0],[2,1]]⟩ — Hecke congruence subgroup of level 2; discrete, finite covolume with cusps.',
        mats: [['1', '1', '0', '1'], ['1', '0', '2', '1']],
    },
    {
        name: 'Congruence subgroup Γ₀(3)',
        desc: '⟨[[1,1],[0,1]], [[1,0],[3,1]]⟩ — Hecke congruence subgroup of level 3; discrete.',
        mats: [['1', '1', '0', '1'], ['1', '0', '3', '1']],
    },
    {
        name: 'Principal congruence Γ(3)',
        desc: '⟨[[1,3],[0,1]], [[1,0],[3,1]], [[4,-3],[3,-2]]⟩ — principal congruence subgroup of level 3 (3 generators); discrete, finite covolume.',
        mats: [['1', '3', '0', '1'], ['1', '0', '3', '1'], ['4', '-3', '3', '-2']],
    },
    {
        name: 'Schottky free group',
        desc: '⟨diag(3,⅓), [[5,4],[4,5]]/3⟩ — two hyperbolics in Schottky position ⇒ free and discrete (infinite covolume).',
        mats: [['3', '0', '0', '1/3'], ['5/3', '4/3', '4/3', '5/3']],
    },
    {
        name: 'Long–Reid group',
        desc: '⟨diag(3,⅓), [[41/4,1/4],[9/8,1/8]]⟩ — the Long–Reid group (rational pseudomodular-style example).',
        mats: [['3', '0', '0', '1/3'], ['41/4', '1/4', '9/8', '1/8']],
    },
    {
        name: 'Magnus curve (t=2)',
        desc: '⟨[[2,0],[0,1]], [[5,2],[2,1]]⟩ — the Magnus curve ⟨diag(t,1), [[t²+1,2],[t,1]]⟩ at t=2.',
        mats: [['2', '0', '0', '1'], ['5', '2', '2', '1']],
    },

    // ---- exact over number fields ℚ(α): Hecke groups H(q)=⟨T_λ, S⟩, λ=2cos(π/q) ----
    {
        name: 'Hecke group H(4) [ℚ(√2)]',
        desc: '⟨z+√2, −1/z⟩ — the (2,4,∞) Hecke triangle group over ℚ(√2). Certified discrete: cone orders 2 and 4, one cusp.',
        mats: [['1', '\\sqrt{2}', '0', '1'], ['0', '-1', '1', '0']],
    },
    {
        name: 'Hecke group H(5) [ℚ(√5)]',
        desc: '⟨z+φ, −1/z⟩ with φ=(1+√5)/2=2cos(π/5) — the (2,5,∞) Hecke group over ℚ(√5). Certified: cone 5 + cusp ⇒ C₂∗C₅.',
        mats: [['1', '\\frac{1+\\sqrt{5}}{2}', '0', '1'], ['0', '-1', '1', '0']],
    },
    {
        name: 'Hecke group H(6) [ℚ(√3)]',
        desc: '⟨z+√3, −1/z⟩ — the (2,6,∞) Hecke group over ℚ(√3). Certified: cone order 6, one cusp.',
        mats: [['1', '\\sqrt{3}', '0', '1'], ['0', '-1', '1', '0']],
    },
    {
        name: 'Hecke group H(7) [cubic field]',
        desc: '⟨z+2cos(π/7), −1/z⟩ over the cubic field ℚ(2cos(π/7)) — minpoly x³−x²−2x+1. Certified: cone order 7, one cusp.',
        mats: [['1', '2\\cos(\\frac{\\pi}{7})', '0', '1'], ['0', '-1', '1', '0']],
    },
];
