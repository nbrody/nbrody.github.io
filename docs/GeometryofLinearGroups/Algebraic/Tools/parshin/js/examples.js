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
        name: 'A unipotent with quadratic entries',
        gens: [['1+2t', '4', '-t^2', '1-2t']],
        note: 'Trace 2: a unipotent element, fixing the end −2/t of the tree.',
    },
];
