/**
 * Dodecahedron Geometry Module
 * 
 * Generates the geometry for a right-angled hyperbolic dodecahedron.
 * In hyperbolic 3-space, a right-angled dodecahedron tiles H^3 and
 * forms a fundamental domain for certain Kleinian groups.
 */

// Golden ratio - fundamental constant for dodecahedral geometry
export const PHI = (1 + Math.sqrt(5)) / 2;

/**
 * Generate the 20 vertices of a regular Euclidean dodecahedron
 * Vertices come in three families based on their coordinate structure
 */
export function getDodecahedronVertices() {
    const vertices = [];

    // Family 1: Cube vertices (±1, ±1, ±1) - 8 vertices
    for (const x of [-1, 1]) {
        for (const y of [-1, 1]) {
            for (const z of [-1, 1]) {
                vertices.push([x, y, z]);
            }
        }
    }

    // Family 2: (0, ±1/φ, ±φ) - 4 vertices
    for (const s1 of [-1, 1]) {
        for (const s2 of [-1, 1]) {
            vertices.push([0, s1 / PHI, s2 * PHI]);
        }
    }

    // Family 3: (±1/φ, ±φ, 0) - 4 vertices
    for (const s1 of [-1, 1]) {
        for (const s2 of [-1, 1]) {
            vertices.push([s1 / PHI, s2 * PHI, 0]);
        }
    }

    // Family 4: (±φ, 0, ±1/φ) - 4 vertices
    for (const s1 of [-1, 1]) {
        for (const s2 of [-1, 1]) {
            vertices.push([s1 * PHI, 0, s2 / PHI]);
        }
    }

    return vertices;
}

/**
 * Get the 12 face normal directions for a regular dodecahedron
 * Each face is perpendicular to one of these directions
 */
export function getFaceNormals() {
    const normals = [];

    // Face normals point along (±φ, ±1, 0) and cyclic permutations
    const rawNormals = [
        [PHI, 1, 0], [PHI, -1, 0], [-PHI, 1, 0], [-PHI, -1, 0],
        [0, PHI, 1], [0, PHI, -1], [0, -PHI, 1], [0, -PHI, -1],
        [1, 0, PHI], [-1, 0, PHI], [1, 0, -PHI], [-1, 0, -PHI]
    ];

    // Normalize each vector
    for (const n of rawNormals) {
        const mag = Math.sqrt(n[0] * n[0] + n[1] * n[1] + n[2] * n[2]);
        normals.push([n[0] / mag, n[1] / mag, n[2] / mag]);
    }

    return normals;
}

/**
 * Compute adjacency information for the 12 faces
 * Each pentagonal face is adjacent to 5 others
 */
export function getFaceAdjacency() {
    const normals = getFaceNormals();
    const adjacency = [];

    // Two faces are adjacent if their normals have a specific dot product
    // For a dodecahedron, adjacent face normals have dot product = 1/√5
    const adjacentDot = 1 / Math.sqrt(5);
    const tolerance = 0.01;

    for (let i = 0; i < 12; i++) {
        const neighbors = [];
        for (let j = 0; j < 12; j++) {
            if (i === j) continue;
            const dot = normals[i][0] * normals[j][0] +
                normals[i][1] * normals[j][1] +
                normals[i][2] * normals[j][2];
            if (Math.abs(dot - adjacentDot) < tolerance) {
                neighbors.push(j);
            }
        }
        adjacency.push(neighbors);
    }

    return adjacency;
}

/**
 * Compute edge data - pairs of adjacent faces with their shared edge
 * Returns array of {face1, face2, edgeCenter, edgeDirection}
 */
export function getEdges() {
    const normals = getFaceNormals();
    const adjacency = getFaceAdjacency();
    const edges = [];
    const seen = new Set();

    for (let i = 0; i < 12; i++) {
        for (const j of adjacency[i]) {
            const key = i < j ? `${i}-${j}` : `${j}-${i}`;
            if (seen.has(key)) continue;
            seen.add(key);

            // Edge direction is perpendicular to both face normals
            const n1 = normals[i];
            const n2 = normals[j];
            const edgeDir = [
                n1[1] * n2[2] - n1[2] * n2[1],
                n1[2] * n2[0] - n1[0] * n2[2],
                n1[0] * n2[1] - n1[1] * n2[0]
            ];
            const mag = Math.sqrt(edgeDir[0] ** 2 + edgeDir[1] ** 2 + edgeDir[2] ** 2);

            edges.push({
                face1: i,
                face2: j,
                direction: [edgeDir[0] / mag, edgeDir[1] / mag, edgeDir[2] / mag]
            });
        }
    }

    return edges;
}

/**
 * Generate the hyperbolic dodecahedron in the Poincaré ball model
 * 
 * For a RIGHT-ANGLED dodecahedron in H^3:
 * - Each face becomes a hemisphere (sphere orthogonal to the boundary)
 * - The dihedral angle between adjacent faces is exactly 90°
 * 
 * In the Poincaré ball model, each face is represented by a sphere
 * with center outside the ball and radius such that it meets the
 * boundary sphere orthogonally.
 * 
 * @param {number} scale - Scale factor for the hyperbolic metric (1.0 = right-angled)
 */
export function getHyperbolicDodecahedron(scale = 1.0) {
    const normals = getFaceNormals();

    // For right-angled dihedral angles, the Lorentzian inner product
    // of adjacent face vectors must be 0.
    // Euclidean dot product of adjacent normals = 1/√5
    // We need: <n_i, n_j>_L = n_i · n_j - w^2 = 0
    // So w^2 = 1/√5, giving w = (1/√5)^(1/2) ≈ 0.669
    const targetW = Math.pow(1 / Math.sqrt(5), 0.5) * scale;

    const faces = normals.map((n, index) => {
        // In Poincaré model, the hyperplane with normal n and "height" w
        // becomes a sphere with:
        //   center = n / w  (outside the unit ball)
        //   radius = sqrt(|center|^2 - 1)
        const center = [n[0] / targetW, n[1] / targetW, n[2] / targetW];
        const centerMag2 = center[0] ** 2 + center[1] ** 2 + center[2] ** 2;
        const radius = Math.sqrt(centerMag2 - 1);

        return {
            index,
            normal: n,
            center,
            radius,
            w: targetW
        };
    });

    return faces;
}

/**
 * Get the 30 edges of the dodecahedron with their geometric data
 * Each edge is the intersection of two adjacent face spheres
 */
export function getHyperbolicEdges(scale = 1.0) {
    const faces = getHyperbolicDodecahedron(scale);
    const edgeInfo = getEdges();

    return edgeInfo.map(e => ({
        ...e,
        face1Data: faces[e.face1],
        face2Data: faces[e.face2]
    }));
}

// Export a default configuration
export default {
    PHI,
    getDodecahedronVertices,
    getFaceNormals,
    getFaceAdjacency,
    getEdges,
    getHyperbolicDodecahedron,
    getHyperbolicEdges
};
