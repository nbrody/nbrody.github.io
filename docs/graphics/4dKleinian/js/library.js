/**
 * Example library.
 *
 * Two kinds of preset:
 *   mirrors:   an explicit list of spheres/planes in R^3
 *   relations: a symmetric table of Coxeter relations, realised in R^{4,1}
 *
 * Everything here has been checked to satisfy the Poincare angle condition
 * (every pair of mirrors meets at pi/m or not at all), so each preset really
 * is a discrete reflection group acting on H^4.
 */

const PHI = (1 + Math.sqrt(5)) / 2;
const SQRT2 = Math.SQRT2;
const SQRT3 = Math.sqrt(3);

function sphere(x, y, z, r = 1) {
    return { kind: 'sphere', c: [x, y, z], r };
}

function permuteEven(triple) {
    const [a, b, c] = triple;
    return [
        [a, b, c],
        [b, c, a],
        [c, a, b]
    ];
}

function signedVariants(triple) {
    const out = [];
    for (const sx of [1, -1]) {
        for (const sy of [1, -1]) {
            for (const sz of [1, -1]) {
                const p = [triple[0] * sx, triple[1] * sy, triple[2] * sz];
                if (!out.some((q) => q.every((value, i) => Math.abs(value - p[i]) < 1e-9))) {
                    out.push(p);
                }
            }
        }
    }
    return out;
}

function icosahedronVertices() {
    const points = [];
    for (const base of permuteEven([0, 1, PHI])) {
        for (const p of signedVariants(base)) {
            if (!points.some((q) => q.every((value, i) => Math.abs(value - p[i]) < 1e-9))) {
                points.push(p);
            }
        }
    }
    return points;
}

function ring(count, radius, z = 0, r = 1, phase = 0) {
    return Array.from({ length: count }, (_, k) => {
        const angle = phase + (2 * Math.PI * k) / count;
        return sphere(radius * Math.cos(angle), radius * Math.sin(angle), z, r);
    });
}

/** Coxeter relation helpers. */
function angleRel(m) {
    return { type: 'angle', m };
}
const TANGENT = { type: 'tangent' };
function apartRel(d) {
    return { type: 'disjoint', d };
}

function relationsFromLabelMatrix(labels) {
    const n = labels.length;
    return Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => {
            if (i === j) return null;
            const m = labels[i][j];
            return m === 0 || !isFinite(m) ? TANGENT : angleRel(m);
        })
    );
}

function uniformRelations(n, rel) {
    return Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => (i === j ? null : rel))
    );
}

function pathRelations(sequence) {
    const n = sequence.length + 1;
    const labels = Array.from({ length: n }, (_, i) =>
        Array.from({ length: n }, (_, j) => (i === j ? 1 : 2))
    );
    sequence.forEach((m, k) => {
        labels[k][k + 1] = labels[k + 1][k] = m;
    });
    return relationsFromLabelMatrix(labels);
}

/* ------------------------------------------------------------------ */
/* The verified list of finite-volume Coxeter simplices in H^4.        */
/* Signature (4,1) and the facet types were computed rather than       */
/* copied: five compact (Lanner) and nine paracompact diagrams.        */
/* ------------------------------------------------------------------ */

const H4_SIMPLICES = [
    { type: 'compact', labels: [[1, 2, 2, 2, 3], [2, 1, 2, 2, 3], [2, 2, 1, 5, 2], [2, 2, 5, 1, 3], [3, 3, 2, 3, 1]] },
    { type: 'compact', labels: [[1, 2, 2, 2, 5], [2, 1, 2, 3, 2], [2, 2, 1, 3, 3], [2, 3, 3, 1, 2], [5, 2, 3, 2, 1]] },
    { type: 'compact', labels: [[1, 2, 2, 2, 5], [2, 1, 2, 3, 3], [2, 2, 1, 4, 2], [2, 3, 4, 1, 2], [5, 3, 2, 2, 1]] },
    { type: 'compact', labels: [[1, 2, 2, 2, 5], [2, 1, 2, 3, 3], [2, 2, 1, 5, 2], [2, 3, 5, 1, 2], [5, 3, 2, 2, 1]] },
    { type: 'compact', labels: [[1, 2, 2, 3, 3], [2, 1, 3, 2, 4], [2, 3, 1, 3, 2], [3, 2, 3, 1, 2], [3, 4, 2, 2, 1]] },
    { type: 'paracompact', labels: [[1, 2, 2, 2, 3], [2, 1, 2, 2, 3], [2, 2, 1, 2, 3], [2, 2, 2, 1, 4], [3, 3, 3, 4, 1]] },
    { type: 'paracompact', labels: [[1, 2, 2, 2, 3], [2, 1, 2, 2, 3], [2, 2, 1, 3, 2], [2, 2, 3, 1, 4], [3, 3, 2, 4, 1]] },
    { type: 'paracompact', labels: [[1, 2, 2, 2, 3], [2, 1, 2, 2, 4], [2, 2, 1, 3, 2], [2, 2, 3, 1, 3], [3, 4, 2, 3, 1]] },
    { type: 'paracompact', labels: [[1, 2, 2, 2, 3], [2, 1, 2, 2, 4], [2, 2, 1, 4, 2], [2, 2, 4, 1, 3], [3, 4, 2, 3, 1]] },
    { type: 'paracompact', labels: [[1, 2, 2, 2, 3], [2, 1, 2, 3, 3], [2, 2, 1, 3, 3], [2, 3, 3, 1, 2], [3, 3, 3, 2, 1]] },
    { type: 'paracompact', labels: [[1, 2, 2, 2, 3], [2, 1, 2, 3, 4], [2, 2, 1, 4, 2], [2, 3, 4, 1, 2], [3, 4, 2, 2, 1]] },
    { type: 'paracompact', labels: [[1, 2, 2, 2, 4], [2, 1, 2, 3, 3], [2, 2, 1, 3, 3], [2, 3, 3, 1, 2], [4, 3, 3, 2, 1]] },
    { type: 'paracompact', labels: [[1, 2, 2, 3, 3], [2, 1, 2, 3, 3], [2, 2, 1, 3, 3], [3, 3, 3, 1, 2], [3, 3, 3, 2, 1]] },
    { type: 'paracompact', labels: [[1, 2, 2, 3, 3], [2, 1, 3, 2, 4], [2, 3, 1, 4, 2], [3, 2, 4, 1, 2], [3, 4, 2, 2, 1]] }
];

/* ------------------------------------------------------------------ */
/* Coxeter diagram description (path / cycle / tree)                   */
/* ------------------------------------------------------------------ */

function labelText(m) {
    return m === 0 || !isFinite(m) ? '∞' : String(m);
}

export function diagramShape(labels) {
    const n = labels.length;
    const adjacency = Array.from({ length: n }, () => []);
    const edges = [];
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            if (labels[i][j] !== 2) {
                adjacency[i].push(j);
                adjacency[j].push(i);
                edges.push([i, j, labels[i][j]]);
            }
        }
    }
    const degrees = adjacency.map((list) => list.length);
    const sorted = degrees.slice().sort((a, b) => a - b).join(',');

    const walk = (start) => {
        const order = [start];
        let previous = null;
        let current = start;
        while (order.length < n) {
            const next = adjacency[current].find((x) => x !== previous);
            if (next === undefined) return null;
            order.push(next);
            previous = current;
            current = next;
        }
        return order;
    };

    if (edges.length === n - 1 && sorted === new Array(n).fill(0).map((_, i) => (i === 0 || i === n - 1 ? 1 : 2)).sort((a, b) => a - b).join(',')) {
        const ends = degrees.map((d, i) => (d === 1 ? i : -1)).filter((i) => i >= 0);
        const order = walk(ends[0]);
        if (order) {
            const sequence = order.slice(0, -1).map((v, k) => labels[v][order[k + 1]]);
            const forward = sequence.map(labelText).join(',');
            const backward = sequence.slice().reverse().map(labelText).join(',');
            return { kind: 'path', symbol: `[${forward < backward ? forward : backward}]`, edges, order };
        }
    }

    if (edges.length === n && degrees.every((d) => d === 2)) {
        const order = walk(0);
        if (order) {
            const sequence = order.map((v, k) => labels[v][order[(k + 1) % n]]);
            let best = null;
            for (let rotation = 0; rotation < n; rotation++) {
                const rotated = sequence.slice(rotation).concat(sequence.slice(0, rotation));
                for (const candidate of [rotated, rotated.slice().reverse()]) {
                    const text = candidate.map(labelText).join(',');
                    if (best === null || text < best) best = text;
                }
            }
            return { kind: 'cycle', symbol: `[(${best})]`, edges, order };
        }
    }

    return { kind: 'graph', symbol: null, edges };
}

/**
 * Coxeter symbol when the diagram is a path or a cycle, and a spelled-out
 * description of the branches or the cycle otherwise, so that the name always
 * determines the diagram.
 */
function simplexName(entry) {
    const labels = entry.labels;
    const n = labels.length;
    const shape = diagramShape(labels);
    if (shape.symbol) return shape.symbol;

    const adjacency = Array.from({ length: n }, (_, i) =>
        labels[i].map((m, j) => (j !== i && m !== 2 ? j : -1)).filter((j) => j >= 0)
    );
    const edgeCount = adjacency.reduce((sum, list) => sum + list.length, 0) / 2;

    const walkLeg = (from, start) => {
        const chain = [labels[from][start]];
        const seen = new Set([from, start]);
        let previous = from;
        let current = start;
        while (adjacency[current].length === 2) {
            const next = adjacency[current].find((x) => x !== previous);
            if (next === undefined || seen.has(next)) break;
            chain.push(labels[current][next]);
            seen.add(next);
            previous = current;
            current = next;
        }
        return chain.map(labelText).join('–');
    };

    if (edgeCount === n - 1) {
        const branch = adjacency.findIndex((list) => list.length >= 3);
        if (branch >= 0) {
            const legs = adjacency[branch].map((start) => walkLeg(branch, start)).sort();
            return `branch ⟨${legs.join(' | ')}⟩`;
        }
    }

    if (edgeCount === n) {
        // unicyclic: peel the trees off and read the labels round the cycle
        const degree = adjacency.map((list) => list.length);
        const removed = new Set();
        let changed = true;
        while (changed) {
            changed = false;
            for (let i = 0; i < n; i++) {
                if (removed.has(i)) continue;
                const live = adjacency[i].filter((j) => !removed.has(j));
                if (live.length <= 1) {
                    removed.add(i);
                    changed = true;
                }
            }
        }
        const cycle = [];
        const start = [...Array(n).keys()].find((i) => !removed.has(i));
        if (start !== undefined) {
            let previous = -1;
            let current = start;
            do {
                cycle.push(current);
                const next = adjacency[current].find((j) => !removed.has(j) && j !== previous);
                if (next === undefined) break;
                previous = current;
                current = next;
            } while (current !== start && cycle.length <= n);

            const ring = cycle
                .map((node, k) => labels[node][cycle[(k + 1) % cycle.length]])
                .map(labelText)
                .join(',');
            const tails = [];
            cycle.forEach((node) => {
                adjacency[node]
                    .filter((j) => removed.has(j))
                    .forEach((j) => tails.push(walkLeg(node, j)));
            });
            const suffix = tails.length ? ` + ${tails.sort().join(' + ')}` : '';
            return `cycle (${ring})${suffix}`;
        }
    }

    const edges = [];
    for (let i = 0; i < n; i++) {
        for (let j = i + 1; j < n; j++) {
            if (labels[i][j] !== 2) edges.push(`${i}–${j}:${labelText(labels[i][j])}`);
        }
    }
    return `diagram ${edges.join(' ')}`;
}

/* ------------------------------------------------------------------ */
/* Families                                                            */
/* ------------------------------------------------------------------ */

export const families = {
    packing: {
        label: 'Sphere packings',
        blurb: 'Mirrors that are tangent or disjoint. The limit set is the residual set of a genuine sphere packing.'
    },
    schottky: {
        label: 'Schottky groups',
        blurb: 'Pairwise disjoint mirrors. Free groups whose limit set is a Cantor set in the 3-sphere.'
    },
    rightAngled: {
        label: 'Right-angled groups',
        blurb: 'Every pair of mirrors is orthogonal, tangent, or disjoint.'
    },
    simplexCompact: {
        label: 'Compact H⁴ simplices',
        blurb: 'The five Lannér simplices: cocompact reflection groups of hyperbolic 4-space.'
    },
    simplexCusped: {
        label: 'Cusped H⁴ simplices',
        blurb: 'The nine finite-volume, non-cocompact Coxeter simplices of H⁴.'
    },
    simplexInfinite: {
        label: 'Infinite-volume simplices',
        blurb: 'Coxeter simplices whose diagram is too large to close up: fractal limit sets.'
    },
    prism: {
        label: 'Triangle prisms',
        blurb: 'Two parallel copies of a hyperbolic triangle group, a distance apart in H⁴.'
    },
    classical: {
        label: 'Classical arrangements',
        blurb: 'Symmetric sphere configurations that render well.'
    }
};

/* --- explicit configurations --------------------------------------- */

function trianglePrism(p, q, r) {
    const dihedral = (order) => 2 * Math.cos(Math.PI / (2 * order));
    const dP = dihedral(p);
    const dQ = dihedral(q);
    const dR = dihedral(r);
    const x3 = (dQ * dQ + dP * dP - dR * dR) / (2 * dP);
    const y3 = Math.sqrt(Math.max(0, dQ * dQ - x3 * x3));
    const lift = SQRT3;
    return [
        sphere(0, 0, 0),
        sphere(dP, 0, 0),
        sphere(x3, y3, 0),
        sphere(0, 0, lift),
        sphere(dP, 0, lift),
        sphere(x3, y3, lift)
    ];
}

const pentagonRadius = SQRT3 / (2 * Math.sin(Math.PI / 5));
const pentagonLift = Math.sqrt(Math.max(0, 3 - pentagonRadius * pentagonRadius));
const twistRadius = 1.4;
const twistLift = Math.sqrt((3 - twistRadius * twistRadius) / 4);

function helixChain(count = 6) {
    const helixRadius = 1;
    const angleStep = Math.PI / 3;
    const target = 2 * Math.cos(Math.PI / 8);
    const rise = Math.sqrt(
        Math.max(0, target * target - 2 * helixRadius * helixRadius * (1 - Math.cos(angleStep)))
    );
    return Array.from({ length: count }, (_, k) =>
        sphere(
            helixRadius * Math.cos(k * angleStep),
            helixRadius * Math.sin(k * angleStep),
            (k - (count - 1) / 2) * rise
        )
    );
}

/* ------------------------------------------------------------------ */

const TRAP_SOLID = 0;
const TRAP_SHELL = 1;
const TRAP_BALL = 2;

const base = {
    radiusScale: 1,
    trapMode: TRAP_BALL,
    trapRadius: 0.3,
    skipLevels: 0,
    cutaway: false,
    thickness: 0.016,
    folds: 32,
    steps: 220,
    stepScale: 0.55,
    palette: 'aurora',
    scheme: 'depth',
    cameraDistance: 3.1
};

function preset(entry) {
    return { ...base, ...entry };
}

export const presets = [
    /* ---------------- sphere packings ---------------- */
    preset({
        key: 'descartes',
        family: 'packing',
        name: 'Descartes configuration',
        subtitle: '5 mutually tangent spheres',
        description:
            'The unique-up-to-Möbius arrangement of five mutually tangent spheres. Its Gram matrix is 2I − J, of signature (4,1), and the reflection group is the symmetry group of the three-dimensional Apollonian packing.',
        relations: uniformRelations(5, TANGENT),
        palette: 'ember',
        scheme: 'generator',
        cameraDistance: 2.9
    }),
    preset({
        key: 'octahedral-packing',
        family: 'packing',
        name: 'Octahedral packing',
        subtitle: '6 spheres, tangent along octahedron edges',
        description:
            'Unit spheres at the vertices of an octahedron of circumradius √2. Neighbouring mirrors are tangent, antipodal ones are a distance arccosh 3 apart.',
        mirrors: [
            sphere(SQRT2, 0, 0), sphere(-SQRT2, 0, 0),
            sphere(0, SQRT2, 0), sphere(0, -SQRT2, 0),
            sphere(0, 0, SQRT2), sphere(0, 0, -SQRT2)
        ],
        palette: 'glacier',
        scheme: 'depth'
    }),
    preset({
        key: 'cubic-packing',
        family: 'packing',
        name: 'Cubic packing',
        subtitle: '8 spheres, tangent along cube edges',
        description:
            'Unit spheres at the corners of a cube of side 2. Edge-neighbours are tangent; face and body diagonals give disjoint mirrors.',
        mirrors: signedVariants([1, 1, 1]).map(([x, y, z]) => sphere(x, y, z)),
        palette: 'nocturne',
        scheme: 'depthNormalized'
    }),
    preset({
        key: 'icosahedral-packing',
        family: 'packing',
        name: 'Icosahedral packing',
        subtitle: '12 spheres, tangent along icosahedron edges',
        description:
            'Unit spheres at the twelve vertices (0,±1,±φ) of an icosahedron of edge 2. Thirty tangencies, all other pairs disjoint.',
        mirrors: icosahedronVertices().map(([x, y, z]) => sphere(x, y, z)),
        palette: 'spectral',
        scheme: 'generator',
        folds: 28
    }),
    preset({
        key: 'octahedral-core',
        family: 'packing',
        name: 'Octahedral packing with core',
        subtitle: '6 spheres plus a tangent core',
        description:
            'The octahedral packing together with the sphere of radius √2 − 1 tangent to all six. The core breaks the sphere that was orthogonal to every mirror, so the Gram matrix has full rank 5 and the group is genuinely four-dimensional.',
        mirrors: [
            sphere(SQRT2, 0, 0), sphere(-SQRT2, 0, 0),
            sphere(0, SQRT2, 0), sphere(0, -SQRT2, 0),
            sphere(0, 0, SQRT2), sphere(0, 0, -SQRT2),
            sphere(0, 0, 0, SQRT2 - 1)
        ],
        palette: 'glacier',
        scheme: 'generator',
        cameraDistance: 2.9
    }),
    preset({
        key: 'cubic-core',
        family: 'packing',
        name: 'Cubic packing with core',
        subtitle: '8 spheres plus a tangent core',
        description:
            'Eight unit spheres at the corners of a cube of side 2, plus the sphere of radius √3 − 1 tangent to all of them. Full rank 5.',
        mirrors: signedVariants([1, 1, 1])
            .map(([x, y, z]) => sphere(x, y, z))
            .concat([sphere(0, 0, 0, SQRT3 - 1)]),
        palette: 'nocturne',
        scheme: 'depthNormalized',
        cameraDistance: 3.0
    }),
    preset({
        key: 'icosahedral-core',
        family: 'packing',
        name: 'Icosahedral packing with core',
        subtitle: '12 spheres plus a tangent core',
        description:
            'The icosahedral packing plus the core sphere of radius √(1+φ²) − 1 tangent to all twelve. Thirteen mirrors, full rank, and a very dense residual set.',
        mirrors: icosahedronVertices()
            .map(([x, y, z]) => sphere(x, y, z))
            .concat([sphere(0, 0, 0, Math.hypot(1, PHI) - 1)]),
        palette: 'spectral',
        scheme: 'generator',
        folds: 26,
        cameraDistance: 3.0
    }),
    preset({
        key: 'necklace-6',
        family: 'packing',
        name: 'Necklace of six',
        subtitle: 'ring of tangent spheres',
        description:
            'Six spheres on a circle, each tangent to its two neighbours. Every mirror is orthogonal to the plane of the ring, so this group preserves a circle: the Gram matrix has rank 3 and the limit set is one-dimensional.',
        mirrors: ring(6, 1, 0, Math.sin(Math.PI / 6)),
        palette: 'solar',
        scheme: 'generator',
        cameraDistance: 2.6
    }),
    preset({
        key: 'necklace-8-capped',
        family: 'packing',
        name: 'Capped necklace',
        subtitle: '8-ring with two polar spheres',
        description:
            'A tangent ring of eight, capped above and below. The caps are chosen tangent to every bead, giving two parabolic axes.',
        mirrors: (() => {
            const n = 8;
            const bead = Math.sin(Math.PI / n);
            // a sphere on the axis at height z of radius sqrt(1+z^2) - bead is
            // tangent to every bead; choosing z = (1 - bead^2) / (2 bead) makes
            // the two caps tangent to each other as well
            const z = (1 - bead * bead) / (2 * bead);
            const cap = Math.sqrt(1 + z * z) - bead;
            return ring(n, 1, 0, bead).concat([sphere(0, 0, z, cap), sphere(0, 0, -z, cap)]);
        })(),
        palette: 'verdant',
        scheme: 'depth',
        cameraDistance: 2.8
    }),

    /* ---------------- Schottky ---------------- */
    preset({
        key: 'schottky-tetrahedral',
        family: 'schottky',
        name: 'Tetrahedral Schottky',
        subtitle: '4 disjoint spheres',
        description:
            'Four disjoint spheres at the vertices of a regular tetrahedron. The reflection group is the free product of four copies of Z/2 and its limit set is a Cantor set.',
        mirrors: [
            sphere(1, 1, 1), sphere(1, -1, -1), sphere(-1, 1, -1), sphere(-1, -1, 1)
        ].map((m) => ({ ...m, r: 1.05 })),
        radiusScale: 1,
        palette: 'graphite',
        scheme: 'generator',
        cameraDistance: 3.4
    }),
    preset({
        key: 'schottky-octahedral',
        family: 'schottky',
        name: 'Octahedral Schottky',
        subtitle: '6 disjoint spheres',
        description:
            'The octahedral packing pulled apart. Raise the mirror radius back to 1 and the six spheres become tangent, closing the Cantor set up into a packing.',
        mirrors: [
            sphere(SQRT2, 0, 0), sphere(-SQRT2, 0, 0),
            sphere(0, SQRT2, 0), sphere(0, -SQRT2, 0),
            sphere(0, 0, SQRT2), sphere(0, 0, -SQRT2)
        ],
        radiusScale: 0.86,
        palette: 'glacier',
        scheme: 'generator',
        cameraDistance: 3.4
    }),
    preset({
        key: 'schottky-cubic',
        family: 'schottky',
        name: 'Cubic Schottky',
        subtitle: '8 disjoint spheres',
        description:
            'Eight spheres at the corners of a cube, shrunk until they no longer touch. A free product of eight involutions.',
        mirrors: signedVariants([1, 1, 1]).map(([x, y, z]) => sphere(x, y, z)),
        radiusScale: 0.9,
        palette: 'nocturne',
        scheme: 'depthNormalized',
        cameraDistance: 3.4
    }),

    /* ---------------- right angled ---------------- */
    preset({
        key: 'right-cube',
        family: 'rightAngled',
        name: 'Right-angled cube',
        subtitle: '8 orthogonal spheres',
        description:
            'Unit spheres at (±1,±1,±1)/√2. Cube edges give orthogonal mirrors, face diagonals give tangencies and body diagonals give disjoint pairs.',
        mirrors: signedVariants([SQRT2 / 2, SQRT2 / 2, SQRT2 / 2]).map(([x, y, z]) => sphere(x, y, z)),
        palette: 'graphite',
        scheme: 'depthNormalized',
        cameraDistance: 2.8
    }),
    preset({
        key: 'right-prism',
        family: 'rightAngled',
        name: 'Right-angled prism',
        subtitle: 'two orthogonal triangles',
        description:
            'Two triangles of mutually orthogonal spheres, stacked so that the two layers are tangent.',
        mirrors: [
            sphere(0, 0, 0), sphere(SQRT2, 0, 0), sphere(SQRT2 / 2, Math.sqrt(1.5), 0),
            sphere(0, 0, SQRT2), sphere(SQRT2, 0, SQRT2), sphere(SQRT2 / 2, Math.sqrt(1.5), SQRT2)
        ],
        palette: 'ember',
        scheme: 'generator',
        cameraDistance: 3.0
    }),

    /* ---------------- triangle prisms ---------------- */
    ...[
        [2, 3, 7], [2, 3, 8], [2, 4, 5], [2, 3, 12], [3, 3, 4], [3, 4, 4], [2, 5, 5]
    ].map(([p, q, r]) =>
        preset({
            key: `prism-${p}${q}${r}`,
            family: 'prism',
            name: `(${p},${q},${r}) triangle prism`,
            subtitle: 'triangle group × interval',
            description:
                `Two copies of the (${p},${q},${r}) triangle reflection group, a hyperbolic distance apart in H⁴. In-plane mirrors meet at π/${p}, π/${q}, π/${r}; the two layers meet at π/3 and all cross pairs are disjoint.`,
            mirrors: trianglePrism(p, q, r),
            palette: p === 2 ? 'solar' : 'verdant',
            scheme: 'modBands',
            folds: 40,
            cameraDistance: 3.0
        })
    ),

    /* ---------------- classical ---------------- */
    preset({
        key: 'classical-eight',
        family: 'classical',
        name: 'Classical eight-sphere',
        subtitle: 'the original arrangement',
        description:
            'The eight-sphere configuration this renderer started from: four spheres in a square, two on the x-axis and two on the z-axis, all tangent or disjoint.',
        mirrors: [
            sphere(1, 1, 0), sphere(1, -1, 0), sphere(-1, 1, 0), sphere(-1, -1, 0),
            sphere(1 + SQRT3, 0, 0), sphere(-1 - SQRT3, 0, 0),
            sphere(0, 0, SQRT2), sphere(0, 0, -SQRT2)
        ],
        palette: 'aurora',
        scheme: 'depth',
        cameraDistance: 3.0
    }),
    preset({
        key: 'pentagonal-star',
        family: 'classical',
        name: 'Pentagonal star',
        subtitle: '5-fold ring plus an apex',
        description:
            'Five spheres in a ring meeting their neighbours at π/3, with a sixth sphere lifted onto the axis meeting all five at π/3.',
        mirrors: [
            ...ring(5, pentagonRadius),
            sphere(0, 0, pentagonLift)
        ],
        palette: 'solar',
        scheme: 'angular',
        cameraDistance: 3.2
    }),
    preset({
        key: 'twisted-ring',
        family: 'classical',
        name: 'Twisted ring',
        subtitle: 'screw-symmetric hexagon',
        description:
            'Six spheres on a hexagonal ring with alternating vertical offsets, chosen so that neighbours meet at π/3.',
        mirrors: Array.from({ length: 6 }, (_, k) =>
            sphere(
                twistRadius * Math.cos((k * Math.PI) / 3),
                twistRadius * Math.sin((k * Math.PI) / 3),
                k % 2 === 0 ? twistLift : -twistLift
            )
        ),
        palette: 'aurora',
        scheme: 'weave',
        cameraDistance: 3.2
    }),
    preset({
        key: 'helical-chain',
        family: 'classical',
        name: 'Helical chain',
        subtitle: 'six spheres on a helix',
        description:
            'A helical chain of spheres with consecutive mirrors meeting at π/4. Oblique views show the screw symmetry best.',
        mirrors: helixChain(6),
        palette: 'spectral',
        scheme: 'marchDepth',
        cameraDistance: 3.4
    }),

    /* ---------------- infinite volume simplices ---------------- */
    ...[
        [3, 3, 3, 6], [4, 3, 3, 6], [5, 3, 3, 6], [6, 3, 3, 6],
        [3, 3, 3, 0], [5, 3, 3, 0], [3, 5, 3, 5], [4, 3, 4, 4], [3, 3, 5, 5]
    ].map((sequence) =>
        preset({
            key: `simplex-inf-${sequence.join('-')}`,
            family: 'simplexInfinite',
            name: `[${sequence.map(labelText).join(',')}]`,
            subtitle: 'infinite covolume',
            description:
                `The linear Coxeter diagram [${sequence.map(labelText).join(',')}]. Its Gram matrix still has signature (4,1), so the five mirrors sit in R³, but the chamber has hyperideal vertices and the group has infinite covolume — the limit set is a proper fractal subset of the 3-sphere.`,
            relations: pathRelations(sequence),
            trapMode: TRAP_SHELL,
            thickness: 0.016,
            palette: 'spectral',
            scheme: 'depthNormalized',
            folds: 44,
            cameraDistance: 3.0
        })
    ),

    /* ---------------- finite volume simplices ---------------- */
    ...H4_SIMPLICES.map((entry) => {
        const name = simplexName(entry);
        const compact = entry.type === 'compact';
        return preset({
            key: `simplex-${entry.type}-${entry.labels.flat().join('')}`,
            family: compact ? 'simplexCompact' : 'simplexCusped',
            name,
            subtitle: compact ? 'cocompact' : 'finite volume, cusped',
            description: compact
                ? `A compact Coxeter simplex of H⁴. The group is cocompact, so its limit set is the whole 3-sphere; what you see is the induced tiling of the boundary by the orbit of the five mirrors, cut off at the iteration limit.`
                : `A finite-volume, non-cocompact Coxeter simplex of H⁴. The ideal vertices show up as cusps in the boundary tiling.`,
            relations: relationsFromLabelMatrix(entry.labels),
            labels: entry.labels,
            trapMode: TRAP_SHELL,
            thickness: 0.016,
            // the outermost shell wraps the whole picture, so these open
            // with a slice through the boundary tiling
            cutaway: true,
            palette: compact ? 'porcelain' : 'glacier',
            scheme: 'depth',
            folds: 26,
            cameraDistance: 2.8
        });
    })
];

export const presetsByKey = Object.fromEntries(presets.map((entry) => [entry.key, entry]));

export function presetsByFamily() {
    const map = new Map();
    Object.keys(families).forEach((key) => map.set(key, []));
    presets.forEach((entry) => {
        if (!map.has(entry.family)) map.set(entry.family, []);
        map.get(entry.family).push(entry);
    });
    return map;
}
