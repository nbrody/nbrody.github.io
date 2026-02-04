/**
 * Polyhedra Geometry Library
 * 
 * Provides normals and face generation for various polyhedra in both 
 * Euclidean (Flat) and Hyperbolic (Curved) space.
 */

// --- NORMALS DATA ---

export const getTetrahedronNormals = () => [
    [1, 1, 1], [1, -1, -1], [-1, 1, -1], [-1, -1, 1]
].map(v => normalize(v));

export const getCubeNormals = () => [
    [1, 0, 0], [-1, 0, 0], [0, 1, 0], [0, -1, 0], [0, 0, 1], [0, 0, -1]
];

export const getOctahedronNormals = () => [
    [1, 1, 1], [1, 1, -1], [1, -1, 1], [1, -1, -1],
    [-1, 1, 1], [-1, 1, -1], [-1, -1, 1], [-1, -1, -1]
].map(v => normalize(v));

export const getDodecahedronNormals = () => {
    const phi = (1 + Math.sqrt(5)) / 2;
    return [
        [0, 1, phi], [0, 1, -phi], [0, -1, phi], [0, -1, -phi],
        [1, phi, 0], [1, -phi, 0], [-1, phi, 0], [-1, -phi, 0],
        [phi, 0, 1], [phi, 0, -1], [-phi, 0, 1], [-phi, 0, -1]
    ].map(v => normalize(v));
};

export const getIcosahedronNormals = () => {
    const phi = (1 + Math.sqrt(5)) / 2;
    const vertices = [
        [1, phi, 0], [-1, phi, 0], [1, -phi, 0], [-1, -phi, 0],
        [0, 1, phi], [0, -1, phi], [0, 1, -phi], [0, -1, -phi],
        [phi, 0, 1], [phi, 0, -1], [-phi, 0, 1], [-phi, 0, -1]
    ];

    // An icosahedron has 20 faces. The face normals are obtained by 
    // taking groups of 3 closest vertices. For simplicity, we define them.
    const normals = [];
    const sets = [
        [0, 1, 4], [0, 4, 8], [0, 8, 9], [0, 9, 6], [0, 6, 1],
        [1, 6, 10], [1, 10, 11], [1, 11, 4], [4, 11, 5], [4, 5, 8],
        [8, 5, 2], [8, 2, 9], [9, 2, 3], [9, 3, 6], [6, 3, 10],
        [11, 10, 7], [11, 7, 5], [5, 7, 2], [2, 7, 3], [3, 7, 10]
    ];

    sets.forEach(indices => {
        const v1 = vertices[indices[0]];
        const v2 = vertices[indices[1]];
        const v3 = vertices[indices[2]];
        const n = [
            (v1[0] + v2[0] + v3[0]) / 3,
            (v1[1] + v2[1] + v3[1]) / 3,
            (v1[2] + v2[2] + v3[2]) / 3
        ];
        normals.push(normalize(n));
    });
    return normals;
};

export const getPrismNormals = (sides = 6) => {
    const normals = [];
    // Caps
    normals.push([0, 1, 0]);
    normals.push([0, -1, 0]);
    // Sides
    for (let i = 0; i < sides; i++) {
        const angle = (i / sides) * Math.PI * 2;
        normals.push([Math.cos(angle), 0, Math.sin(angle)]);
    }
    return normals;
};

// --- CORE GENERATORS ---

/**
 * Generate Euclidean (Flat) Face Data
 */
export function generateEuclidean(normals, inradius = 0.5) {
    return normals.map((n, index) => ({
        index,
        normal: n,
        center: [n[0] * inradius, n[1] * inradius, n[2] * inradius],
        radius: -1.0 // Flat plane flag
    }));
}

/**
 * Generate Hyperbolic (Curved) Face Data
 * 
 * Uses the Poincaré ball model where faces are spheres orthogonal 
 * to the boundary ball. 
 * distance: distance from origin to the closest point of the sphere
 */
export function generateHyperbolic(normals, distance = 0.5) {
    // In H3, a sphere orthogonal to the unit ball (r=1) with 
    // closest point at 'distance' from origin has:
    // Center at n * C
    // Radius R
    // R^2 + 1 = C^2
    // C - R = distance
    // (R + distance)^2 = R^2 + 1
    // R^2 + 2*R*distance + distance^2 = R^2 + 1
    // 2*R*distance = 1 - distance^2
    // R = (1 - distance^2) / (2 * distance)
    // C = R + distance

    const d = Math.max(0.01, Math.min(0.99, distance));
    const R = (1 - d * d) / (2 * d);
    const C = R + d;

    return normals.map((n, index) => ({
        index,
        normal: n,
        center: [n[0] * C, n[1] * C, n[2] * C],
        radius: R
    }));
}

// --- UTILS ---

function normalize(v) {
    const mag = Math.sqrt(v[0] * v[0] + v[1] * v[1] + v[2] * v[2]);
    return [v[0] / mag, v[1] / mag, v[2] / mag];
}

export default {
    getTetrahedronNormals,
    getCubeNormals,
    getOctahedronNormals,
    getDodecahedronNormals,
    getIcosahedronNormals,
    getPrismNormals,
    generateEuclidean,
    generateHyperbolic
};
