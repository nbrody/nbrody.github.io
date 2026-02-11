// groups3d.js — Finite subgroups of SO(3) and their associated polyhedra
// Each group includes: vertices, edges, faces of the dual pair, plus rotation axes.

const PHI = (1 + Math.sqrt(5)) / 2;
const INV_PHI = 1 / PHI;

// Normalize a vertex array to unit sphere
function normalize(verts) {
    return verts.map(v => {
        const len = Math.sqrt(v[0] ** 2 + v[1] ** 2 + v[2] ** 2);
        return [v[0] / len, v[1] / len, v[2] / len];
    });
}

// ---- Polyhedron vertex data (on unit sphere) ----

const TETRAHEDRON_VERTS = normalize([
    [1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]
]);
const TETRAHEDRON_FACES = [[0, 1, 2], [0, 2, 3], [0, 3, 1], [1, 3, 2]];
const TETRAHEDRON_EDGES = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];

const CUBE_VERTS = normalize([
    [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1],
    [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1]
]);
const CUBE_FACES = [
    [0, 1, 3, 2], [4, 6, 7, 5], [0, 4, 5, 1], [2, 3, 7, 6], [0, 2, 6, 4], [1, 5, 7, 3]
];
const CUBE_EDGES = [
    [0, 1], [0, 2], [0, 4], [1, 3], [1, 5], [2, 3], [2, 6], [3, 7], [4, 5], [4, 6], [5, 7], [6, 7]
];

const OCTAHEDRON_VERTS = normalize([
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]
]);
const OCTAHEDRON_FACES = [
    [0, 2, 4], [0, 4, 3], [0, 3, 5], [0, 5, 2], [1, 4, 2], [1, 3, 4], [1, 5, 3], [1, 2, 5]
];
const OCTAHEDRON_EDGES = [
    [0, 2], [0, 3], [0, 4], [0, 5], [1, 2], [1, 3], [1, 4], [1, 5], [2, 4], [2, 5], [3, 4], [3, 5]
];

const ICOSAHEDRON_VERTS = normalize([
    [0, 1, PHI], [0, 1, -PHI], [0, -1, PHI], [0, -1, -PHI],
    [1, PHI, 0], [1, -PHI, 0], [-1, PHI, 0], [-1, -PHI, 0],
    [PHI, 0, 1], [PHI, 0, -1], [-PHI, 0, 1], [-PHI, 0, -1]
]);
const ICOSAHEDRON_FACES = [
    [0, 2, 8], [0, 8, 4], [0, 4, 6], [0, 6, 10], [0, 10, 2],
    [2, 5, 8], [8, 5, 9], [8, 9, 4], [4, 9, 1], [4, 1, 6],
    [6, 1, 11], [6, 11, 10], [10, 11, 7], [10, 7, 2], [2, 7, 5],
    [3, 9, 5], [3, 1, 9], [3, 11, 1], [3, 7, 11], [3, 5, 7]
];
const ICOSAHEDRON_EDGES = [
    [0, 2], [0, 4], [0, 6], [0, 8], [0, 10],
    [2, 5], [2, 7], [2, 8], [2, 10],
    [4, 6], [4, 8], [4, 9], [4, 1],
    [6, 1], [6, 10], [6, 11],
    [8, 5], [8, 9], [9, 5], [9, 1], [9, 3],
    [10, 7], [10, 11], [11, 1], [11, 7], [11, 3],
    [5, 7], [5, 3], [7, 3], [1, 3]
];

const DODECAHEDRON_VERTS = normalize([
    [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1],
    [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1],
    [0, INV_PHI, PHI], [0, INV_PHI, -PHI], [0, -INV_PHI, PHI], [0, -INV_PHI, -PHI],
    [INV_PHI, PHI, 0], [INV_PHI, -PHI, 0], [-INV_PHI, PHI, 0], [-INV_PHI, -PHI, 0],
    [PHI, 0, INV_PHI], [PHI, 0, -INV_PHI], [-PHI, 0, INV_PHI], [-PHI, 0, -INV_PHI]
]);
const DODECAHEDRON_FACES = [
    [0, 8, 10, 2, 16], [0, 16, 17, 1, 12], [0, 12, 14, 4, 8],
    [1, 17, 3, 11, 9], [1, 9, 5, 14, 12], [2, 10, 6, 15, 13],
    [2, 13, 3, 17, 16], [3, 13, 15, 7, 11], [4, 14, 5, 19, 18],
    [4, 18, 6, 10, 8], [5, 9, 11, 7, 19], [6, 18, 19, 7, 15]
];
const DODECAHEDRON_EDGES = [
    [0, 8], [0, 12], [0, 16], [1, 9], [1, 12], [1, 17],
    [2, 10], [2, 13], [2, 16], [3, 11], [3, 13], [3, 17],
    [4, 8], [4, 14], [4, 18], [5, 9], [5, 14], [5, 19],
    [6, 10], [6, 15], [6, 18], [7, 11], [7, 15], [7, 19],
    [8, 10], [9, 11], [12, 14], [13, 15], [16, 17], [18, 19]
];

// ---- Rotation axes for each symmetry group ----
// Axes are given as [direction, order, label]

function computeAxes(polyType) {
    switch (polyType) {
        case 'tetrahedron':
            return [
                { dir: normalize([[1, 1, 1]])[0], order: 3, label: 'C₃' },
                { dir: normalize([[1, -1, -1]])[0], order: 3, label: 'C₃' },
                { dir: normalize([[-1, 1, -1]])[0], order: 3, label: 'C₃' },
                { dir: normalize([[-1, -1, 1]])[0], order: 3, label: 'C₃' },
                { dir: normalize([[1, 0, 0]])[0], order: 2, label: 'C₂' },
                { dir: normalize([[0, 1, 0]])[0], order: 2, label: 'C₂' },
                { dir: normalize([[0, 0, 1]])[0], order: 2, label: 'C₂' },
            ];
        case 'cube':
            return [
                // 3 four-fold axes (face centers)
                { dir: [1, 0, 0], order: 4, label: 'C₄' },
                { dir: [0, 1, 0], order: 4, label: 'C₄' },
                { dir: [0, 0, 1], order: 4, label: 'C₄' },
                // 4 three-fold axes (vertex diagonals)
                { dir: normalize([[1, 1, 1]])[0], order: 3, label: 'C₃' },
                { dir: normalize([[1, 1, -1]])[0], order: 3, label: 'C₃' },
                { dir: normalize([[1, -1, 1]])[0], order: 3, label: 'C₃' },
                { dir: normalize([[1, -1, -1]])[0], order: 3, label: 'C₃' },
                // 6 two-fold axes (edge midpoints)
                { dir: normalize([[1, 1, 0]])[0], order: 2, label: 'C₂' },
                { dir: normalize([[1, -1, 0]])[0], order: 2, label: 'C₂' },
                { dir: normalize([[1, 0, 1]])[0], order: 2, label: 'C₂' },
                { dir: normalize([[1, 0, -1]])[0], order: 2, label: 'C₂' },
                { dir: normalize([[0, 1, 1]])[0], order: 2, label: 'C₂' },
                { dir: normalize([[0, 1, -1]])[0], order: 2, label: 'C₂' },
            ];
        case 'icosahedron':
            const axes = [];
            // 6 five-fold axes (vertex pairs)
            const icoPairs = [[0, 2], [4, 6], [8, 10], [1, 3], [5, 7], [9, 11]];
            for (const [i, j] of icoPairs) {
                const v = ICOSAHEDRON_VERTS[i];
                axes.push({ dir: normalize([v])[0], order: 5, label: 'C₅' });
            }
            // 10 three-fold axes (face centers)
            for (let i = 0; i < 10; i++) {
                const f = ICOSAHEDRON_FACES[i];
                const cx = (ICOSAHEDRON_VERTS[f[0]][0] + ICOSAHEDRON_VERTS[f[1]][0] + ICOSAHEDRON_VERTS[f[2]][0]) / 3;
                const cy = (ICOSAHEDRON_VERTS[f[0]][1] + ICOSAHEDRON_VERTS[f[1]][1] + ICOSAHEDRON_VERTS[f[2]][1]) / 3;
                const cz = (ICOSAHEDRON_VERTS[f[0]][2] + ICOSAHEDRON_VERTS[f[1]][2] + ICOSAHEDRON_VERTS[f[2]][2]) / 3;
                axes.push({ dir: normalize([[cx, cy, cz]])[0], order: 3, label: 'C₃' });
            }
            // 15 two-fold axes (edge midpoints)
            for (let i = 0; i < 15; i++) {
                const [a, b] = ICOSAHEDRON_EDGES[i];
                const mx = (ICOSAHEDRON_VERTS[a][0] + ICOSAHEDRON_VERTS[b][0]) / 2;
                const my = (ICOSAHEDRON_VERTS[a][1] + ICOSAHEDRON_VERTS[b][1]) / 2;
                const mz = (ICOSAHEDRON_VERTS[a][2] + ICOSAHEDRON_VERTS[b][2]) / 2;
                axes.push({ dir: normalize([[mx, my, mz]])[0], order: 2, label: 'C₂' });
            }
            return axes;
        default:
            return [];
    }
}

// ---- Group library ----
export const groups3D = [
    // Cyclic groups
    ...Array.from({ length: 6 }, (_, i) => {
        const n = i + 1;
        return {
            id: `C${n}_3d`, name: `C${n}`, fullName: `Cyclic (order ${n})`,
            category: 'cyclic', order: n,
            polyhedron: null,
            description: `Rotations by multiples of 2π/${n} about a single axis.`
        };
    }),
    // Dihedral groups
    ...Array.from({ length: 5 }, (_, i) => {
        const n = i + 2;
        return {
            id: `D${n}_3d`, name: `D${n}`, fullName: `Dihedral (order ${2 * n})`,
            category: 'dihedral', order: 2 * n,
            polyhedron: null,
            description: `${n}-fold axis plus ${n} perpendicular 2-fold axes.`
        };
    }),
    // Exceptional groups with polyhedra
    {
        id: 'T', name: 'T', fullName: 'Tetrahedral (A₄, order 12)',
        category: 'exceptional', order: 12,
        polyhedron: {
            name: 'Tetrahedron',
            vertices: TETRAHEDRON_VERTS,
            faces: TETRAHEDRON_FACES,
            edges: TETRAHEDRON_EDGES,
            color: '#f59e0b',
        },
        axes: computeAxes('tetrahedron'),
        description: 'Rotation symmetries of the regular tetrahedron.'
    },
    {
        id: 'O', name: 'O', fullName: 'Octahedral (S₄, order 24)',
        category: 'exceptional', order: 24,
        polyhedron: {
            name: 'Cube / Octahedron',
            vertices: CUBE_VERTS,
            faces: CUBE_FACES,
            edges: CUBE_EDGES,
            color: '#60a5fa',
            dual: {
                vertices: OCTAHEDRON_VERTS,
                faces: OCTAHEDRON_FACES,
                edges: OCTAHEDRON_EDGES,
                color: '#f472b6',
            }
        },
        axes: computeAxes('cube'),
        description: 'Rotation symmetries of the cube (equivalently, octahedron).'
    },
    {
        id: 'I', name: 'I', fullName: 'Icosahedral (A₅, order 60)',
        category: 'exceptional', order: 60,
        polyhedron: {
            name: 'Icosahedron / Dodecahedron',
            vertices: ICOSAHEDRON_VERTS,
            faces: ICOSAHEDRON_FACES,
            edges: ICOSAHEDRON_EDGES,
            color: '#22d3ee',
            dual: {
                vertices: DODECAHEDRON_VERTS,
                faces: DODECAHEDRON_FACES,
                edges: DODECAHEDRON_EDGES,
                color: '#a78bfa',
            }
        },
        axes: computeAxes('icosahedron'),
        description: 'Rotation symmetries of the icosahedron (equivalently, dodecahedron).'
    },
];

export function getGroup3DById(id) {
    return groups3D.find(g => g.id === id) || null;
}

export function getExceptionalGroups() {
    return groups3D.filter(g => g.category === 'exceptional');
}

export function getAllFiniteSO3() {
    return groups3D;
}
