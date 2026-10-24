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
    // Shalen's transcendental twist: A and sBs⁻¹ with s centralizing C give A *_C B (see Info).
    {
        name: 'Shalen: a genus-2 surface group, doubled along a cusp',
        gens: [['2', '1', '1', '1'], ['3', '1', '-1', '0'], ['2+t', '1-t-t^2', '1', '1-t'], ['3-t', 't^2-3t+1', '-1', 't']],
        note: 'g₁, g₂ generate PSL₂(ℤ)′, a once-punctured torus group, with [g₁, g₂] = (z ↦ z + 6) generating its stabilizer of ∞. g₃, g₄ are their conjugates by z ↦ z + t, which commutes with z ↦ z + 6, so [g₃, g₄] = [g₁, g₂]; the second copy turns the tree about v₀ → ∞ → −1. Each copy meets the stabilizer of the plane at ∞ between them only in ⟨z ↦ z + 6⟩, so the group is the amalgam ⟨g₁, …, g₄ | [g₁, g₂] = [g₃, g₄]⟩, a closed genus-2 surface group. Collapsing to t = 1 kills this: z ↦ z + 1 normalizes PSL₂(ℤ)′, so all four land in that free group.',
    },
    {
        name: 'Shalen: a punctured torus doubled along a geodesic',
        gens: [['9', '0', '0', '4'], ['52', '24', '24', '13'], ['52t', '24t^2', '24', '13t']],
        note: 'g₁ = (z ↦ 9z/4) and g₂ generate a once-punctured torus group (in SL₂ their traces are 13/6, 13/2 and 26/3 for g₁g₂, a solution of x² + y² + z² = xyz). g₃ is g₂ conjugated by diag(t, 1), the dilation along the axis of g₁, which moves v₀ to the plane at ∞. The first copy meets that edge\'s stabilizer in its elements fixing ∞, the second in those fixing 0, and both are ⟨g₁⟩, so the group is the amalgam along ⟨g₁⟩. As g₁ is primitive this amalgam is free of rank 3.',
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
    {
        field: 'omega',
        name: 'Shalen: the double of the figure-eight knot complement',
        gens: [['1', '1', '0', '1'], ['1', '0', '-\\omega', '1'], ['1-\\omega t', '\\omega t^2', '-\\omega', '1+\\omega t']],
        note: 'g₁, g₂ generate Riley\'s figure-eight knot group, whose cusp at ∞ has stabilizer P = ⟨z ↦ z + 1, z ↦ z + 2√−3⟩: the meridian g₁ and the longitude g₂g₁⁻¹g₂⁻¹g₁²g₂⁻¹g₁⁻¹g₂. g₃ is g₂ conjugated by z ↦ z + t, which commutes with P (the second copy of g₁ is g₁ itself), and turns the tree about v₀ → ∞ → −1. Each copy meets the stabilizer of the ball at ∞ between them only in P, so the group is the amalgam of two knot groups along P: the fundamental group of the double of the knot complement, a closed 3-manifold with an incompressible torus, so no discrete subgroup of PSL₂(ℂ) is isomorphic to it.',
    },
];
