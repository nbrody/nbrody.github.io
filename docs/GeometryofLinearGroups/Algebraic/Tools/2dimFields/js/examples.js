// Example generating sets: entries are MathQuill LaTeX for (1,1), (1,2), (2,1), (2,2).
export const EXAMPLES = [
    {
        name: 'SL₂(ℤ) and a translation by t',
        gens: [['0', '-1', '1', '0'], ['1', '1', '0', '1'], ['1', 't', '0', '1']],
        note: 'g₁ and g₂ fix v₀ and act on its plane as SL₂(ℤ). g₃ fixes the plane at ∞ and turns the tree about it, carrying v₀ to a neighbour of that plane.',
    },
    {
        name: 'Elementary matrices in t',
        gens: [['1', 't', '0', '1'], ['1', '0', 't', '1']],
        note: 'Each fixes a neighbour of v₀ (the planes at ∞ and at 0) and turns the tree about it.',
    },
    {
        name: 'A hyperbolic element',
        gens: [['t', '1', '-1', '0']],
        note: 'Its trace t has degree 1, so it translates an axis of the tree by 2.',
    },
    {
        name: 'SL₂(ℤ) and a hyperbolic element',
        gens: [['0', '-1', '1', '0'], ['1', '1', '0', '1'], ['t', '1', '-1', '0']],
        note: '',
    },
    {
        name: 'Turning about a deeper plane',
        gens: [['1', 't^2', '0', '1']],
        note: 'The entry t² has valuation −2, so this fixes the plane two steps out toward ∞ and moves v₀ a distance 4.',
    },
    {
        name: 'ℚ[t, 1/t]: trivial on v₀, a translation on its neighbours',
        gens: [['1', '\\frac{1}{t}', '0', '1'], ['t', '0', '0', '\\frac{1}{t}']],
        note: 'g₁ = (1 π; 0 1) fixes v₀ and acts trivially on its plane, but turns the plane at every finite cusp by z ↦ z + 1. g₂ = diag(t, 1/t) translates the axis from 0 to ∞ by 2.',
    },
    {
        name: 'PGL₂: a reflection, an inversion, a shift by one',
        gens: [['-1', '0', '0', '1'], ['0', '1', 't', '0'], ['t', '0', '0', '1']],
        note: 'g₁ fixes every plane of the axis and turns the whole tree over (z ↦ −z̄ on each plane). g₂ has determinant −t, of odd valuation: it swaps v₀ with the plane at 0, flipping both. g₃ = diag(t, 1) translates by 1, so every plane changes colour.',
    },
    {
        name: 'Rational functions of t',
        gens: [['1', '\\frac{t}{t-1}', '0', '1'], ['1', '0', '\\frac{1}{1+t}', '1']],
        note: 't/(t−1) = 1 + π + π² + …: g₁ fixes v₀ and acts there as z ↦ z + 1, with the tail of the series acting deeper down. 1/(1+t) = π − π² + … has positive valuation, so g₂ fixes v₀ and its plane pointwise.',
    },
    {
        name: 'A unipotent with quadratic entries',
        gens: [['1+2t', '4', '-t^2', '1-2t']],
        note: 'Trace 2: a unipotent element, fixing the end −2/t of the tree.',
    },
    // ---------- over ℚ(i) ----------
    {
        field: 'i',
        name: 'Picard group and a translation by t',
        gens: [['0', '-1', '1', '0'], ['1', '1', '0', '1'], ['1', 'i', '0', '1'], ['1', 't', '0', '1']],
        note: 'g₁, g₂, g₃ generate PSL₂(ℤ[i]), the Picard group: they fix v₀ and act on its ball. g₄ fixes the ball at ∞ and turns the tree about it.',
    },
    {
        field: 'i',
        name: 'Gaussian translations in t',
        gens: [['1', 't', '0', '1'], ['1', 'it', '0', '1'], ['i', '0', '0', '1']],
        note: 'Translations by t and by it both fix the ball at ∞. g₃ = diag(i, 1) turns every ball on the axis from 0 to ∞ by a quarter turn.',
    },
    {
        field: 'i',
        name: 'A loxodromic element',
        gens: [['t+i', '1', '-1', '0']],
        note: 'Its trace t + i has degree 1, so it translates an axis of the tree by 2, screwing the balls along it.',
    },
    // ---------- over ℚ(ω) ----------
    {
        field: 'omega',
        name: 'Eisenstein group and a translation by t',
        gens: [['0', '-1', '1', '0'], ['1', '1', '0', '1'], ['1', '\\omega', '0', '1'], ['1', 't', '0', '1']],
        note: 'g₁, g₂, g₃ generate PSL₂(ℤ[ω]), fixing v₀ and acting on its ball. g₄ fixes the ball at ∞ and turns the tree about it.',
    },
    {
        field: 'omega',
        name: 'Eisenstein translations in t',
        gens: [['1', 't', '0', '1'], ['1', '\\omega t', '0', '1'], ['1+\\omega', '0', '0', '1']],
        note: 'Translations by t and by ωt fix the ball at ∞. g₃ = diag(1 + ω, 1) turns the balls on the axis from 0 to ∞ by a sixth of a turn.',
    },
];
