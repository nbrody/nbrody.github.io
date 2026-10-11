// examples.js — preset lattices and hypersurfaces, and two-piece GPS hybrids.

export const EXAMPLES = [
    { cat: 'Surfaces (n = 2)', name: 'Modular surface, a cusp-to-cusp geodesic', f: '-1, 1, 1', v: '0, 0, 1', N: 3 },
    { cat: 'Surfaces (n = 2)', name: 'Modular surface, a separating closed geodesic', f: '-1, 1, 1', v: '0, 1, 1', N: 3 },
    { cat: 'Surfaces (n = 2)', name: 'Compact (2, 4, 6) triangle group', f: '-3, 1, 1', v: '0, 1, 0', N: 3 },
    { cat: 'Surfaces (n = 2)', name: 'Compact, algebra ramified at {3, 7}: ⟨−3, 1, 7⟩', f: '-3, 1, 7', v: '0, 0, 1', N: 3 },
    { cat: '3-manifolds (n = 3)', name: 'Picard lattice ⟨−1, 1, 1, 1⟩, plane x₃ = 0', f: '-1, 1, 1, 1', v: '0, 0, 0, 1', N: 3 },
    { cat: '3-manifolds (n = 3)', name: '⟨−1, 1, 1, 2⟩, the same plane form ⟨−1, 1, 1⟩', f: '-1, 1, 1, 2', v: '0, 0, 0, 1', N: 3 },
    { cat: '3-manifolds (n = 3)', name: 'Cocompact ⟨−7, 1, 1, 1⟩, closed genus 4 surface', f: '-7, 1, 1, 1', v: '0, 0, 0, 1', N: 3 },
    { cat: '3-manifolds (n = 3)', name: 'Cocompact ⟨−7, 1, 1, 21⟩, the same surface form', f: '-7, 1, 1, 21', v: '0, 0, 0, 1', N: 3 },
    { cat: '3-manifolds (n = 3)', name: 'A plane that is not a mirror: v = (0, 1, 1, 1)', f: '-1, 1, 1, 1', v: '0, 1, 1, 1', N: 3 },
    { cat: '3-manifolds (n = 3)', name: 'Cut along Fix(r_v): two isometric pieces (N = 4)', f: '-1, 1, 1, 1', v: '0, 0, 0, 1', N: 4, cut: 'fix' },
    { cat: 'Higher dimensions', name: 'n = 4: ⟨−1, 1, 1, 1, 1⟩', f: '-1, 1, 1, 1, 1', v: '0, 0, 0, 0, 1', N: 3 },
    {
        cat: 'GPS hybrids', name: 'Closed hybrid surface: ⟨−3, 1, 1⟩ ∪ ⟨−3, 1, 7⟩', hybrid: [
            { f: '-3, 1, 1', v: '0, 0, 1', N: 3 },
            { f: '-3, 1, 7', v: '0, 0, 1', N: 3 },
        ],
    },
    {
        cat: 'GPS hybrids', name: 'Cusped hybrid 3-manifold: ⟨−1, 1, 1, 1⟩ ∪ ⟨−1, 1, 1, 2⟩', hybrid: [
            { f: '-1, 1, 1, 1', v: '0, 0, 0, 1', N: 3 },
            { f: '-1, 1, 1, 2', v: '0, 0, 0, 1', N: 3 },
        ],
    },
    {
        cat: 'GPS hybrids', name: 'Closed hybrid 3-manifold: ⟨−7, 1, 1, 1⟩ ∪ ⟨−7, 1, 1, 21⟩', hybrid: [
            { f: '-7, 1, 1, 1', v: '0, 0, 0, 1', N: 3 },
            { f: '-7, 1, 1, 21', v: '0, 0, 0, 1', N: 3 },
        ],
    },
];
