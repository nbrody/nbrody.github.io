// examples.js — preset lattices and hypersurfaces, hybrids of congruence
// covers, and hybrids of right-angled chambers. Names and descriptions use
// $…$ for inline TeX.

const SURF = 'Surfaces ($n = 2$)';
const THREE = '3-manifolds ($n = 3$)';
const HIGH = 'Higher dimensions';
const CHAMB = 'Hybrids of chambers (small, no cover)';
const COVER = 'Hybrids of congruence covers (Gromov–Piatetski-Shapiro)';

export const EXAMPLES = [
    { cat: SURF, name: 'Modular surface, a cusp-to-cusp geodesic', desc: '$\\langle -1,1,1\\rangle$, the $(2,4,\\infty)$ triangle.', f: '-1, 1, 1', v: '0, 0, 1', N: 3 },
    { cat: SURF, name: 'Modular surface, a separating closed geodesic', desc: 'The same lattice, $v = (0,1,1)$.', f: '-1, 1, 1', v: '0, 1, 1', N: 3 },
    { cat: SURF, name: 'Compact $(2,4,6)$ triangle group', desc: '$\\langle -3,1,1\\rangle$: anisotropic over $\\mathbb Q$.', f: '-3, 1, 1', v: '0, 1, 0', N: 3 },
    { cat: SURF, name: 'Compact, algebra ramified at $\\{3,7\\}$', desc: '$\\langle -3,1,7\\rangle$.', f: '-3, 1, 7', v: '0, 0, 1', N: 3 },
    { cat: THREE, name: 'Picard lattice, the plane $x_3 = 0$', desc: '$\\langle -1,1,1,1\\rangle$, commensurable with $\\mathrm{PSL}_2(\\mathbb Z[i])$.', f: '-1, 1, 1, 1', v: '0, 0, 0, 1', N: 3 },
    { cat: THREE, name: '$\\langle -1,1,1,2\\rangle$, the same plane form', desc: 'Commensurable with $\\mathrm{PSL}_2(\\mathbb Z[\\sqrt{-2}])$.', f: '-1, 1, 1, 2', v: '0, 0, 0, 1', N: 3 },
    { cat: THREE, name: 'Cocompact $\\langle -7,1,1,1\\rangle$, a closed genus 4 surface', desc: 'Invariant trace field $\\mathbb Q(\\sqrt{-7})$.', f: '-7, 1, 1, 1', v: '0, 0, 0, 1', N: 3 },
    { cat: THREE, name: 'Cocompact $\\langle -7,1,1,21\\rangle$, the same surface form', desc: 'Invariant trace field $\\mathbb Q(\\sqrt{-3})$.', f: '-7, 1, 1, 21', v: '0, 0, 0, 1', N: 3 },
    { cat: THREE, name: 'A plane that is not a mirror', desc: '$v = (0,1,1,1)$ in $\\langle -1,1,1,1\\rangle$: the split lattice $L_v \\oplus \\mathbb Z v$ is used.', f: '-1, 1, 1, 1', v: '0, 1, 1, 1', N: 3 },
    { cat: THREE, name: 'Cut along $\\mathrm{Fix}(r_v)$: two isometric pieces', desc: '$\\langle -1,1,1,1\\rangle$ at level $N = 4$.', f: '-1, 1, 1, 1', v: '0, 0, 0, 1', N: 4, cut: 'fix' },
    { cat: HIGH, name: '$n = 4$: $\\langle -1,1,1,1,1\\rangle$', desc: 'A hyperbolic 4-manifold cut along a 3-manifold.', f: '-1, 1, 1, 1, 1', v: '0, 0, 0, 0, 1', N: 3 },
    {
        cat: CHAMB, name: '$\\langle -3,1,1,6\\rangle \\cup \\langle -3,1,1,15\\rangle$, compact',
        desc: 'Fields $\\mathbb Q(\\sqrt{-2})$ and $\\mathbb Q(\\sqrt{-5})$, glued along the $(2,4,6)$ triangle: $k\\Gamma = \\mathbb Q(\\sqrt{-2},\\sqrt{-5})$, $A\\Gamma$ ramified above $3$.',
        chambers: [{ f: '-3, 1, 1, 6', v: '0, 0, 0, 1', N: 3 }, { f: '-3, 1, 1, 15', v: '0, 0, 0, 1', N: 3 }],
    },
    {
        cat: CHAMB, name: '$\\langle -3,1,1,5\\rangle \\cup \\langle -3,1,1,6\\rangle$, compact',
        desc: 'Fields $\\mathbb Q(\\sqrt{-15})$ and $\\mathbb Q(\\sqrt{-2})$; both pieces cocompact, yet $A\\Gamma$ splits.',
        chambers: [{ f: '-3, 1, 1, 5', v: '0, 0, 0, 1', N: 3 }, { f: '-3, 1, 1, 6', v: '0, 0, 0, 1', N: 3 }],
    },
    {
        cat: CHAMB, name: '$\\langle -3,1,1,5\\rangle \\cup \\langle -3,1,1,15\\rangle$, compact',
        desc: 'Fields $\\mathbb Q(\\sqrt{-15})$ and $\\mathbb Q(\\sqrt{-5})$; the second complex place has volume only $0.126$.',
        chambers: [{ f: '-3, 1, 1, 5', v: '0, 0, 0, 1', N: 3 }, { f: '-3, 1, 1, 15', v: '0, 0, 0, 1', N: 3 }],
    },
    {
        cat: CHAMB, name: '$\\langle -3,1,1,3\\rangle \\cup \\langle -3,1,1,2\\rangle$, cusped',
        desc: 'Fields $\\mathbb Q(i)$ and $\\mathbb Q(\\sqrt{-6})$.',
        chambers: [{ f: '-3, 1, 1, 3', v: '0, 0, 0, 1', N: 3 }, { f: '-3, 1, 1, 2', v: '0, 0, 0, 1', N: 3 }],
    },
    {
        cat: CHAMB, name: '$\\langle -7,1,1,7\\rangle \\cup \\langle -7,1,1,21\\rangle$',
        desc: 'A cusped chamber over $\\mathbb Q(i)$ and a compact one over $\\mathbb Q(\\sqrt{-3})$, glued along a quadrilateral.',
        chambers: [{ f: '-7, 1, 1, 7', v: '0, 0, 0, 1', N: 3 }, { f: '-7, 1, 1, 21', v: '0, 0, 0, 1', N: 3 }],
    },
    {
        cat: CHAMB, name: '$\\langle -3,1,5\\rangle \\cup \\langle -3,1,6\\rangle$, a surface',
        desc: 'Two compact polygons with a right-angled side of the same length.',
        chambers: [{ f: '-3, 1, 5', v: '0, 0, 1', N: 3 }, { f: '-3, 1, 6', v: '0, 0, 1', N: 3 }],
    },
    {
        cat: COVER, name: 'Closed surface: $\\langle -3,1,1\\rangle \\cup \\langle -3,1,7\\rangle$', desc: 'Pieces of covers of two incommensurable triangle groups.',
        hybrid: [{ f: '-3, 1, 1', v: '0, 0, 1', N: 3 }, { f: '-3, 1, 7', v: '0, 0, 1', N: 3 }],
    },
    {
        cat: COVER, name: 'Cusped 3-manifold: $\\langle -1,1,1,1\\rangle \\cup \\langle -1,1,1,2\\rangle$', desc: 'The original Gromov–Piatetski-Shapiro shape in dimension 3.',
        hybrid: [{ f: '-1, 1, 1, 1', v: '0, 0, 0, 1', N: 3 }, { f: '-1, 1, 1, 2', v: '0, 0, 0, 1', N: 3 }],
    },
    {
        cat: COVER, name: 'Closed 3-manifold: $\\langle -7,1,1,1\\rangle \\cup \\langle -7,1,1,21\\rangle$', desc: 'Closed genus 4 surfaces in the covers $\\Gamma(3)$; volume about $5400$.',
        hybrid: [{ f: '-7, 1, 1, 1', v: '0, 0, 0, 1', N: 3 }, { f: '-7, 1, 1, 21', v: '0, 0, 0, 1', N: 3 }],
    },
];
