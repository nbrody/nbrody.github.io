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

// --- SPECIFIC HYPERBOLIC POLYHEDRA ---

/**
 * Ideal Hyperbolic Cube 
 * Vertices are ideal points on ∂B at (±1, ±1, ±1)/√3
 * Each face sphere passes through 4 ideal vertices
 * Dihedral angles are 2π/3 (60°)
 */
export function getHyperbolicCube60() {
    const normals = getCubeNormals();

    // For ideal vertices, w = 1/√3 makes the spheres pass through
    // the cube vertices (±1,±1,±1)/√3 on the unit sphere
    const w = 1 / Math.sqrt(3);

    return normals.map((n, index) => {
        // center = n / w, radius = sqrt(|center|² - 1)
        const center = [n[0] / w, n[1] / w, n[2] / w];
        const centerMag2 = center[0] ** 2 + center[1] ** 2 + center[2] ** 2;
        const radius = Math.sqrt(centerMag2 - 1);

        return { index, normal: n, center, radius };
    });
}

/**
 * Ideal Hyperbolic Octahedron
 * Vertices are ideal points on ∂B at (±1,0,0), (0,±1,0), (0,0,±1)
 * Each triangular face passes through 3 ideal vertices
 * Dihedral angles are 2π/3 (60°) 
 */
export function getHyperbolicOctahedron90() {
    const normals = getOctahedronNormals();

    // For ideal vertices at the 6 axis points, w = 1/√3
    const w = 1 / Math.sqrt(3);

    return normals.map((n, index) => {
        const center = [n[0] / w, n[1] / w, n[2] / w];
        const centerMag2 = center[0] ** 2 + center[1] ** 2 + center[2] ** 2;
        const radius = Math.sqrt(centerMag2 - 1);

        return { index, normal: n, center, radius };
    });
}

/**
 * Hyperbolic Dodecahedron with π/2 (90°) dihedral angles (right-angled)
 * This is the classic right-angled dodecahedron that tiles H³.
 * 
 * Uses the Lorentzian inner product formula:
 * Adjacent face normals have Euclidean dot product = 1/√5
 * For right angles: <n_i, n_j>_L = n_i · n_j - w² = 0
 * So w² = 1/√5, giving w = (1/√5)^0.5 ≈ 0.669
 */
export function getHyperbolicDodecahedron90() {
    const phi = (1 + Math.sqrt(5)) / 2;

    // Use the correct normals from the original (these are different!)
    const rawNormals = [
        [phi, 1, 0], [phi, -1, 0], [-phi, 1, 0], [-phi, -1, 0],
        [0, phi, 1], [0, phi, -1], [0, -phi, 1], [0, -phi, -1],
        [1, 0, phi], [-1, 0, phi], [1, 0, -phi], [-1, 0, -phi]
    ];

    const normals = rawNormals.map(n => {
        const mag = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]);
        return [n[0] / mag, n[1] / mag, n[2] / mag];
    });

    // For right-angled dihedral angles using Lorentzian formula
    const targetW = Math.pow(1 / Math.sqrt(5), 0.5); // ≈ 0.669

    return normals.map((n, index) => {
        // center = n / w (outside unit ball)
        // radius = sqrt(|center|² - 1)
        const center = [n[0] / targetW, n[1] / targetW, n[2] / targetW];
        const centerMag2 = center[0] ** 2 + center[1] ** 2 + center[2] ** 2;
        const radius = Math.sqrt(centerMag2 - 1);

        return {
            index,
            normal: n,
            center,
            radius
        };
    });
}

export default {
    getTetrahedronNormals,
    getCubeNormals,
    getOctahedronNormals,
    getDodecahedronNormals,
    getIcosahedronNormals,
    getPrismNormals,
    generateEuclidean,
    generateHyperbolic,
    getHyperbolicCube60,
    getHyperbolicOctahedron90,
    getHyperbolicDodecahedron90
};
