// examples.js — the example library: each entry builds a spec (see model.js).

import { catmullRom, namedGraph } from './model.js';

const TAU = 2 * Math.PI;
const samples = (n, f) => Array.from({ length: n }, (_, k) => f((TAU * k) / n));

// ---- knots and links as closed curves

const torusKnot = (p, q, R = 2, r = 0.9, n = 72) => samples(n, t => [
    (R + r * Math.cos(q * t)) * Math.cos(p * t),
    (R + r * Math.cos(q * t)) * Math.sin(p * t),
    r * Math.sin(q * t),
]);

const trefoil = (n = 48) => samples(n, t => [
    Math.sin(t) + 2 * Math.sin(2 * t), Math.cos(t) - 2 * Math.cos(2 * t), -Math.sin(3 * t),
]);

const figureEight = (n = 60) => samples(n, t => [
    (2 + Math.cos(2 * t)) * Math.cos(3 * t), (2 + Math.cos(2 * t)) * Math.sin(3 * t), Math.sin(4 * t),
]);

const circle = (c, u, v, r, n = 32) => samples(n, t => [0, 1, 2].map(i => c[i] + r * (Math.cos(t) * u[i] + Math.sin(t) * v[i])));

// ---- ambient twists: diffeomorphisms of ℝ³ isotopic to the identity, so they tangle
// a picture without changing what it is

function twist(axis, center, k) {
    const l = Math.hypot(...axis), a = axis.map(c => c / l);
    return p => {
        const d = [p[0] - center[0], p[1] - center[1], p[2] - center[2]];
        const h = d[0] * a[0] + d[1] * a[1] + d[2] * a[2];
        const th = k * h * Math.exp(-0.08 * (d[0] ** 2 + d[1] ** 2 + d[2] ** 2));
        const c = Math.cos(th), s = Math.sin(th);
        // Rodrigues rotation of d about a
        const cr = [a[1] * d[2] - a[2] * d[1], a[2] * d[0] - a[0] * d[2], a[0] * d[1] - a[1] * d[0]];
        return [0, 1, 2].map(i => center[i] + d[i] * c + cr[i] * s + a[i] * h * (1 - c));
    };
}

const TWISTS = [
    twist([0, 0, 1], [0.4, 0.2, 0], 2.2),
    twist([1, 0.3, 0], [0, -0.3, 0.2], 2.0),
    twist([0.2, 1, 0.4], [-0.3, 0, -0.2], 1.8),
];

/** Push a spec through the twists (its curves are densified first). */
function tangled(spec, twists = TWISTS) {
    const F = p => twists.reduce((q, f) => f(q), p);
    const pos = new Map(spec.vertices.map(v => [v.id, v.pos]));
    return {
        ...spec,
        dense: true,
        vertices: spec.vertices.map(v => ({ ...v, pos: F(v.pos) })),
        edges: spec.edges.map(e => {
            const poly = catmullRom([pos.get(e.a), ...e.way, pos.get(e.b)], 30, false);
            return { ...e, way: poly.slice(1, -1).map(F) };
        }),
        circles: (spec.circles || []).map(c => ({ way: catmullRom(c.way, 30, true).map(F) })),
    };
}

// ---- builders

function abstract(name, layout = 'random', seed = 1) {
    const g = namedGraph(name);
    return {
        vertices: Array.from({ length: g.n }, (_, i) => ({ id: String(i), pos: null })),
        edges: g.E.map(([a, b]) => ({ a: String(a), b: String(b), way: [] })),
        layout, seed,
    };
}

/** The trefoil, cut at a crossing of its projection, plus the vertical chord there. */
function trefoilTheta() {
    const f = t => [Math.sin(t) + 2 * Math.sin(2 * t), Math.cos(t) - 2 * Math.cos(2 * t), -Math.sin(3 * t)];
    // find a crossing of the projection to the xy-plane: two parameters, well apart, over the same point
    const D = (a, b) => { const p = f(a), q = f(b); return (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2; };
    let best = null;
    const n = 600;
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
        const t1 = (TAU * i) / n, t2 = (TAU * j) / n;
        const sep = Math.min(t2 - t1, TAU - (t2 - t1));
        if (sep < 0.6) continue;
        const d = D(t1, t2);
        if (!best || d < best.d) best = { d, t1, t2 };
    }
    let { t1, t2 } = best;
    for (let step = TAU / n; step > 1e-9; step /= 2) {
        for (const [a, b] of [[step, 0], [-step, 0], [0, step], [0, -step]]) {
            if (D(t1 + a, t2 + b) < D(t1, t2)) { t1 += a; t2 += b; }
        }
    }
    const arc = (a, b, n) => Array.from({ length: n - 1 }, (_, k) => f(a + ((b - a) * (k + 1)) / n));
    const A = f(t1), B = f(t2);
    return {
        vertices: [{ id: 'A', pos: A }, { id: 'B', pos: B }],
        edges: [
            { a: 'A', b: 'B', way: arc(t1, t2, 30) },
            { a: 'B', b: 'A', way: arc(t2, t1 + TAU, 30) },
            { a: 'A', b: 'B', way: [] },
        ],
    };
}

/** K4 with a trefoil tied in one edge. */
function knottedK4() {
    const s = 0.32;
    // trefoil rotated so its outermost point (t = π/3) faces +x, cut open there
    const f = t => [Math.sin(t) + 2 * Math.sin(2 * t), Math.cos(t) - 2 * Math.cos(2 * t), -Math.sin(3 * t)];
    const rot = -Math.PI / 6;
    const g = t => { const p = f(t); return [s * (p[0] * Math.cos(rot) - p[1] * Math.sin(rot)), s * (p[0] * Math.sin(rot) + p[1] * Math.cos(rot)), s * p[2]]; };
    const t0 = Math.PI / 3, gap = 0.35;
    const knot = Array.from({ length: 41 }, (_, k) => g(t0 + gap + ((TAU - 2 * gap) * k) / 40));
    const V = { a: [3.2, 0, 1.6], b: [3.2, 0, -1.6], c: [-2.4, 3, 0], d: [-2.4, -3, 0] };
    return {
        vertices: Object.entries(V).map(([id, pos]) => ({ id, pos })),
        edges: [
            { a: 'a', b: 'b', way: [[2.1, 0, 0.7], ...knot, [2.1, 0, -0.7]] },
            { a: 'a', b: 'c', way: [] }, { a: 'a', b: 'd', way: [] },
            { a: 'b', b: 'c', way: [] }, { a: 'b', b: 'd', way: [] },
            { a: 'c', b: 'd', way: [] },
        ],
    };
}

/** Two loops joined by an edge; `linked` hooks the loops through each other. */
function handcuff(linked) {
    if (!linked) {
        return {
            vertices: [{ id: 'A', pos: [-1, 0, 0] }, { id: 'B', pos: [1, 0, 0] }],
            edges: [
                { a: 'A', b: 'A', way: [[-1.6, 0.9, 0.3], [-2.6, 0.3, 0.6], [-2.4, -0.8, -0.2], [-1.5, -0.7, -0.4]] },
                { a: 'A', b: 'B', way: [[-0.2, 0.5, 0.6], [0.4, -0.4, -0.5]] },
                { a: 'B', b: 'B', way: [[1.6, 0.8, -0.5], [2.5, 0.6, 0.3], [2.3, -0.7, 0.6], [1.5, -0.8, 0.1]] },
            ],
        };
    }
    // loop 1: unit circle in the xy-plane; loop 2: unit circle in the xz-plane through its centre
    const c1 = circle([0, 0, 0], [1, 0, 0], [0, 1, 0], 1, 24);           // starts at (1,0,0)
    const c2 = circle([1, 0, 0], [1, 0, 0], [0, 0, 1], 1, 24);           // starts at (2,0,0)
    const rot = (arr, k) => [...arr.slice(k), ...arr.slice(0, k)];
    const l1 = rot(c1, 12);   // start at (−1,0,0)
    return {
        vertices: [{ id: 'A', pos: l1[0] }, { id: 'B', pos: c2[0] }],
        edges: [
            { a: 'A', b: 'A', way: l1.slice(1) },
            { a: 'A', b: 'B', way: [[-1.5, -0.8, 0], [0.5, -1.7, 0], [2.5, -0.9, 0]] },
            { a: 'B', b: 'B', way: c2.slice(1) },
        ],
    };
}

function standardTheta() {
    return {
        vertices: [{ id: 'A', pos: [0, 0, 1.2] }, { id: 'B', pos: [0, 0, -1.2] }],
        edges: [0, 1, 2].map(k => {
            const th = (TAU * k) / 3;
            return { a: 'A', b: 'B', way: [[1.1 * Math.cos(th), 1.1 * Math.sin(th), 0.6], [1.4 * Math.cos(th), 1.4 * Math.sin(th), -0.3]] };
        }),
    };
}

// ---------------------------------------------------------------- the library

export const EXAMPLES = [
    {
        cat: 'Theta curves & handcuffs',
        items: [
            { id: 'theta-tangled', name: 'Tangled θ-curve', badges: ['trivial'],
              desc: 'The standard θ-curve pushed through three ambient twists. It relaxes back to three meridians of a sphere (D₃ₕ).',
              spec: () => tangled(standardTheta()) },
            { id: 'theta-31', name: 'Trefoil θ-curve (3₁)', badges: ['knotted'],
              desc: 'A trefoil with the vertical chord at one of its crossings. Its constituent knots are a trefoil and two unknots.',
              spec: trefoilTheta },
            { id: 'handcuff', name: 'Handcuff graph', badges: ['trivial'],
              desc: 'Two loops joined by an edge. Settles with the loops in perpendicular planes (D2d): all 8 automorphisms.',
              spec: () => handcuff(false) },
            { id: 'handcuff-hopf', name: 'Linked handcuff', badges: ['linked'],
              desc: 'The two loops of the handcuff form a Hopf link.',
              spec: () => handcuff(true) },
            { id: 'theta4', name: 'θ₄ (four parallel edges)', badges: ['trivial'],
              desc: 'Two vertices joined by four edges: tetrahedral junctions at both ends.',
              spec: () => abstract('theta4') },
        ],
    },
    {
        cat: 'Graphs',
        items: [
            { id: 'k4', name: 'K₄', badges: ['planar'], desc: 'A random straight-line tetrahedron. It settles to a round spherical tetrahedron: all 24 symmetries (Td).', spec: () => abstract('k4', 'random', 2) },
            { id: 'k4-knotted', name: 'K₄ with a knotted edge', badges: ['knotted'], desc: 'One edge of the tetrahedral graph has a trefoil tied in it.', spec: knottedK4 },
            { id: 'cube', name: 'Cube graph Q₃', badges: ['planar'], desc: 'Settles to a round cube: all 48 automorphisms realized (Oh).', spec: () => abstract('cube', 'random', 5) },
            { id: 'octahedron', name: 'Octahedron', badges: ['planar'], desc: 'Degree-4 vertices want tetrahedral junctions, which a round octahedron cannot give: the minimum is lopsided.', spec: () => abstract('octahedron', 'random', 3) },
            { id: 'dodecahedron', name: 'Dodecahedron', badges: ['planar'], desc: 'Settles to the round dodecahedron, all 120 automorphisms realized (Ih).', spec: () => abstract('dodecahedron', 'spectral', 1) },
            { id: 'k33', name: 'K₃,₃', badges: ['non-planar'], desc: 'Kuratowski’s utility graph. Settles with D3h symmetry: 12 of its 72 automorphisms.', spec: () => abstract('k3,3', 'random', 5) },
            { id: 'k5', name: 'K₅', badges: ['non-planar'], desc: 'The other Kuratowski graph. Settles with Td symmetry: 24 of its 120 automorphisms.', spec: () => abstract('k5', 'random', 1) },
            { id: 'petersen', name: 'Petersen graph', badges: ['non-planar'], desc: '10 vertices, 15 edges, automorphism group S₅.', spec: () => abstract('petersen', 'spectral', 1) },
            { id: 'mobius4', name: 'Möbius ladder M₈', badges: ['non-planar'], desc: 'An 8-cycle with its four long diagonals as rungs.', spec: () => abstract('mobius4', 'moment', 1) },
            { id: 'k6', name: 'K₆', badges: ['intrinsically linked'], desc: 'Conway–Gordon: every embedding of K₆ contains two disjoint triangles that link.', spec: () => abstract('k6', 'random', 10) },
            { id: 'k7', name: 'K₇', badges: ['intrinsically knotted'], desc: 'Conway–Gordon: every embedding of K₇ contains a knotted Hamiltonian cycle.', spec: () => abstract('k7', 'random', 7) },
        ],
    },
    {
        cat: 'Knots & links',
        items: [
            { id: 'unknot-tangled', name: 'Tangled unknot', badges: ['trivial'],
              desc: 'A round circle pushed through three ambient twists. It should come back round.',
              spec: () => tangled({ vertices: [], edges: [], circles: [{ way: circle([0, 0, 0], [1, 0, 0], [0, 0.8, 0.6], 1.6, 40) }] }) },
            { id: 'trefoil', name: 'Trefoil 3₁', badges: ['knot'], desc: 'Settles with a three-fold axis and three two-fold axes (D₃).', spec: () => ({ vertices: [], edges: [], circles: [{ way: trefoil() }] }) },
            { id: 'fig8', name: 'Figure-eight 4₁', badges: ['knot'], desc: 'Amphichiral: look for an improper symmetry.', spec: () => ({ vertices: [], edges: [], circles: [{ way: figureEight() }] }) },
            { id: 'cinquefoil', name: 'Cinquefoil 5₁', badges: ['knot'], desc: 'The (2,5) torus knot.', spec: () => ({ vertices: [], edges: [], circles: [{ way: torusKnot(2, 5) }] }) },
            { id: 't34', name: '(3,4) torus knot 8₁₉', badges: ['knot'], desc: '', spec: () => ({ vertices: [], edges: [], circles: [{ way: torusKnot(3, 4, 2, 1, 96) }] }) },
            { id: 'hopf', name: 'Hopf link', badges: ['link'], desc: 'Two round circles, each through the other’s centre.',
              spec: () => ({ vertices: [], edges: [], circles: [
                  { way: circle([0, 0, 0], [1, 0, 0], [0, 1, 0], 1.2) },
                  { way: circle([1.2, 0, 0], [1, 0, 0], [0, 0, 1], 1.2) }] }) },
            { id: 'solomon', name: 'Solomon link', badges: ['link'], desc: 'The (2,4) torus link.',
              spec: () => ({ vertices: [], edges: [], circles: [0, Math.PI].map(ph => ({ way: samples(48, t => [
                  (2 + 0.9 * Math.cos(2 * t + ph)) * Math.cos(t), (2 + 0.9 * Math.cos(2 * t + ph)) * Math.sin(t), 0.9 * Math.sin(2 * t + ph)]) })) }) },
            { id: 'borromean', name: 'Borromean rings', badges: ['Brunnian'], desc: 'Three perpendicular ellipses; no two of them link.',
              spec: () => ({ vertices: [], edges: [], circles: [
                  { way: samples(40, t => [2 * Math.cos(t), Math.sin(t), 0]) },
                  { way: samples(40, t => [0, 2 * Math.cos(t), Math.sin(t)]) },
                  { way: samples(40, t => [Math.sin(t), 0, 2 * Math.cos(t)]) }] }) },
        ],
    },
];

export function findExample(id) {
    for (const c of EXAMPLES) for (const it of c.items) if (it.id === id) return it;
    return null;
}
