/**
 * 4D Kleinian Group Example Library
 * Sphere configurations for discrete subgroups of O(4,1)
 * 
 * Each sphere inversion in ℝ³ ≅ ∂H⁴ corresponds to a reflection in Isom(H⁴) ≅ O(4,1).
 * Non-coplanar centers → Zariski dense subgroups of O(4,1).
 */

// ============================================================
// Geometry Helpers
// ============================================================

/** Center distance for two unit spheres at dihedral angle π/n */
function dihedralDistance(n) {
    return 2 * Math.cos(Math.PI / (2 * n));
}

/**
 * 6 spheres for a (p,q,r) hyperbolic triangle group.
 * Layer A (z=0): triangle with angles π/p, π/q, π/r
 * Layer B (z=√3): parallel copy (each twin pair at π/3)
 */
function computeTriangleGroupSpheres(p, q, r) {
    const zOff = Math.sqrt(3);
    const d_p = dihedralDistance(p);
    const d_q = dihedralDistance(q);
    const d_r = dihedralDistance(r);
    const x3 = (d_q * d_q + d_p * d_p - d_r * d_r) / (2 * d_p);
    const y3 = Math.sqrt(Math.max(0, d_q * d_q - x3 * x3));
    return [
        { x: 0, y: 0, z: 0, r: 1.0 },
        { x: d_p, y: 0, z: 0, r: 1.0 },
        { x: x3, y: y3, z: 0, r: 1.0 },
        { x: 0, y: 0, z: zOff, r: 1.0 },
        { x: d_p, y: 0, z: zOff, r: 1.0 },
        { x: x3, y: y3, z: zOff, r: 1.0 }
    ];
}

// Precomputed constants
const sqrt2 = Math.sqrt(2);
const sqrt3 = Math.sqrt(3);
const pentR = sqrt3 / (2 * Math.sin(Math.PI / 5));
const pentH = Math.sqrt(Math.max(0, 3 - pentR * pentR));
const ringR = 1.4;
const ringH = Math.sqrt((3 - ringR * ringR) / 4);
const cubeA = sqrt3 / 2;

// ============================================================
// Category labels for UI
// ============================================================

export const presetCategories = {
    classic: "Classic Arrangements",
    triangle: "Hyperbolic △ Groups",
    rightAngled: "Right-Angled Coxeter",
    other: "Other Geometries"
};

// ============================================================
// Presets
// ============================================================

export const spherePresets = {

    // ---- CLASSIC (original presets) ----

    default: {
        name: "Default (8 Spheres)",
        category: "classic",
        description: "8 tangent spheres — the original soma_arc configuration",
        spheres: [
            { x: 1.0, y: 1.0, z: 0.0, r: 1.0 },
            { x: 1.0, y: -1.0, z: 0.0, r: 1.0 },
            { x: -1.0, y: 1.0, z: 0.0, r: 1.0 },
            { x: -1.0, y: -1.0, z: 0.0, r: 1.0 },
            { x: 1.0 + sqrt3, y: 0.0, z: 0.0, r: 1.0 },
            { x: -1.0 - sqrt3, y: 0.0, z: 0.0, r: 1.0 },
            { x: 0.0, y: 0.0, z: 1.4142, r: 1.0 },
            { x: 0.0, y: 0.0, z: -1.4142, r: 1.0 }
        ]
    },
    tetrahedral: {
        name: "Tetrahedral",
        category: "classic",
        description: "4 spheres at tetrahedron vertices",
        spheres: [
            { x: 1.3333, y: 1.3333, z: 1.3333, r: 1.1667 },
            { x: 1.3333, y: -1.3333, z: -1.3333, r: 1.1667 },
            { x: -1.3333, y: 1.3333, z: -1.3333, r: 1.1667 },
            { x: -1.3333, y: -1.3333, z: 1.3333, r: 1.1667 }
        ]
    },
    octahedral: {
        name: "Octahedral",
        category: "classic",
        description: "6 spheres at octahedron vertices",
        spheres: [
            { x: 1.6667, y: 0.0, z: 0.0, r: 1.0 },
            { x: -1.6667, y: 0.0, z: 0.0, r: 1.0 },
            { x: 0.0, y: 1.6667, z: 0.0, r: 1.0 },
            { x: 0.0, y: -1.6667, z: 0.0, r: 1.0 },
            { x: 0.0, y: 0.0, z: 1.6667, r: 1.0 },
            { x: 0.0, y: 0.0, z: -1.6667, r: 1.0 }
        ]
    },
    cubic: {
        name: "Cubic",
        category: "classic",
        description: "8 spheres at cube vertices",
        spheres: [
            { x: 1.1667, y: 1.1667, z: 1.1667, r: 1.0 },
            { x: 1.1667, y: 1.1667, z: -1.1667, r: 1.0 },
            { x: 1.1667, y: -1.1667, z: 1.1667, r: 1.0 },
            { x: 1.1667, y: -1.1667, z: -1.1667, r: 1.0 },
            { x: -1.1667, y: 1.1667, z: 1.1667, r: 1.0 },
            { x: -1.1667, y: 1.1667, z: -1.1667, r: 1.0 },
            { x: -1.1667, y: -1.1667, z: 1.1667, r: 1.0 },
            { x: -1.1667, y: -1.1667, z: -1.1667, r: 1.0 }
        ]
    },
    icosahedral: {
        name: "Icosahedral",
        category: "classic",
        description: "12 spheres at icosahedron vertices",
        spheres: [
            { x: 0.0, y: 1.0, z: 1.618, r: 0.8333 },
            { x: 0.0, y: 1.0, z: -1.618, r: 0.8333 },
            { x: 0.0, y: -1.0, z: 1.618, r: 0.8333 },
            { x: 0.0, y: -1.0, z: -1.618, r: 0.8333 },
            { x: 1.0, y: 1.618, z: 0.0, r: 0.8333 },
            { x: 1.0, y: -1.618, z: 0.0, r: 0.8333 },
            { x: -1.0, y: 1.618, z: 0.0, r: 0.8333 },
            { x: -1.0, y: -1.618, z: 0.0, r: 0.8333 },
            { x: 1.618, y: 0.0, z: 1.0, r: 0.8333 },
            { x: 1.618, y: 0.0, z: -1.0, r: 0.8333 },
            { x: -1.618, y: 0.0, z: 1.0, r: 0.8333 },
            { x: -1.618, y: 0.0, z: -1.0, r: 0.8333 }
        ]
    },
    apollonian: {
        name: "Apollonian Gasket",
        category: "classic",
        description: "4 mutually tangent spheres — Apollonian gasket",
        spheres: [
            { x: 0.0, y: 0.0, z: 0.0, r: 1.3333 },
            { x: 2.0, y: 0.0, z: 0.0, r: 0.6667 },
            { x: 1.0, y: 1.732, z: 0.0, r: 0.6667 },
            { x: 1.0, y: 0.577, z: 1.633, r: 0.6667 }
        ]
    },

    // ---- HYPERBOLIC TRIANGLE GROUPS ----
    // Two-layer construction: Zariski dense in O(4,1)
    // 1/p + 1/q + 1/r < 1 ensures hyperbolicity

    triangle_237: {
        name: "△(2,3,7) Hurwitz",
        category: "triangle",
        description: "π/2, π/3, π/7 — smallest hyperbolic triangle, connected to Hurwitz surfaces",
        spheres: computeTriangleGroupSpheres(2, 3, 7),
        params: { maxIterations: 40 }
    },
    triangle_238: {
        name: "△(2,3,8)",
        category: "triangle",
        description: "π/2, π/3, π/8 — near-Hurwitz variant with denser fractal structure",
        spheres: computeTriangleGroupSpheres(2, 3, 8),
        params: { maxIterations: 40 }
    },
    triangle_245: {
        name: "△(2,4,5)",
        category: "triangle",
        description: "π/2, π/4, π/5 — mixed 4-fold and 5-fold symmetry",
        spheres: computeTriangleGroupSpheres(2, 4, 5),
        params: { maxIterations: 40 }
    },
    triangle_334: {
        name: "△(3,3,4) All-Acute",
        category: "triangle",
        description: "π/3, π/3, π/4 — no right angles, all-acute character",
        spheres: computeTriangleGroupSpheres(3, 3, 4),
        params: { maxIterations: 40 }
    },
    triangle_255: {
        name: "△(2,5,5) Golden",
        category: "triangle",
        description: "π/2, π/5, π/5 — golden ratio triangle with pentagonal symmetry",
        spheres: computeTriangleGroupSpheres(2, 5, 5),
        params: { maxIterations: 40 }
    },
    triangle_2312: {
        name: "△(2,3,12)",
        category: "triangle",
        description: "π/2, π/3, π/12 — very tight angle produces extremely dense fractals",
        spheres: computeTriangleGroupSpheres(2, 3, 12),
        params: { maxIterations: 50 }
    },
    triangle_345: {
        name: "△(3,4,5) Balanced",
        category: "triangle",
        description: "π/3, π/4, π/5 — all angles distinct, balanced hyperbolic complexity",
        spheres: computeTriangleGroupSpheres(3, 4, 5),
        params: { maxIterations: 40 }
    },

    // ---- RIGHT-ANGLED COXETER GROUPS ----
    // All intersecting pairs at π/2 — often arithmetic groups

    rightAngled_prism: {
        name: "Right-Angled Prism",
        category: "rightAngled",
        description: "6 spheres forming a triangular prism — all intersections at π/2, cross-diagonals tangent",
        spheres: [
            // Layer A: equilateral triangle, edge √2
            { x: 0, y: 0, z: 0, r: 1.0 },
            { x: sqrt2, y: 0, z: 0, r: 1.0 },
            { x: sqrt2 / 2, y: Math.sqrt(3 / 2), z: 0, r: 1.0 },
            // Layer B at z = √2
            { x: 0, y: 0, z: sqrt2, r: 1.0 },
            { x: sqrt2, y: 0, z: sqrt2, r: 1.0 },
            { x: sqrt2 / 2, y: Math.sqrt(3 / 2), z: sqrt2, r: 1.0 }
        ],
        params: { maxIterations: 35 }
    },
    rightAngled_cube: {
        name: "Right-Angled Cube",
        category: "rightAngled",
        description: "8 spheres at cube vertices with edge √2 — all 12 edge pairs at π/2",
        spheres: [
            { x: sqrt2 / 2, y: sqrt2 / 2, z: sqrt2 / 2, r: 1.0 },
            { x: sqrt2 / 2, y: sqrt2 / 2, z: -sqrt2 / 2, r: 1.0 },
            { x: sqrt2 / 2, y: -sqrt2 / 2, z: sqrt2 / 2, r: 1.0 },
            { x: sqrt2 / 2, y: -sqrt2 / 2, z: -sqrt2 / 2, r: 1.0 },
            { x: -sqrt2 / 2, y: sqrt2 / 2, z: sqrt2 / 2, r: 1.0 },
            { x: -sqrt2 / 2, y: sqrt2 / 2, z: -sqrt2 / 2, r: 1.0 },
            { x: -sqrt2 / 2, y: -sqrt2 / 2, z: sqrt2 / 2, r: 1.0 },
            { x: -sqrt2 / 2, y: -sqrt2 / 2, z: -sqrt2 / 2, r: 1.0 }
        ],
        params: { maxIterations: 35 }
    },

    // ---- OTHER GEOMETRIES ----

    pentagonal_star: {
        name: "Pentagonal Star",
        category: "other",
        description: "5 spheres in a pentagon (neighbors at π/3) + central sphere above — 5-fold symmetry",
        spheres: [
            { x: pentR, y: 0, z: 0, r: 1.0 },
            { x: pentR * Math.cos(2 * Math.PI / 5), y: pentR * Math.sin(2 * Math.PI / 5), z: 0, r: 1.0 },
            { x: pentR * Math.cos(4 * Math.PI / 5), y: pentR * Math.sin(4 * Math.PI / 5), z: 0, r: 1.0 },
            { x: pentR * Math.cos(6 * Math.PI / 5), y: pentR * Math.sin(6 * Math.PI / 5), z: 0, r: 1.0 },
            { x: pentR * Math.cos(8 * Math.PI / 5), y: pentR * Math.sin(8 * Math.PI / 5), z: 0, r: 1.0 },
            { x: 0, y: 0, z: pentH, r: 1.0 }
        ],
        params: { maxIterations: 40 }
    },
    twisted_ring: {
        name: "Twisted Ring",
        category: "other",
        description: "6 spheres in a hexagonal ring with alternating z — screw symmetry, all neighbors at π/3",
        spheres: [
            { x: ringR, y: 0, z: ringH, r: 1.0 },
            { x: ringR * Math.cos(Math.PI / 3), y: ringR * Math.sin(Math.PI / 3), z: -ringH, r: 1.0 },
            { x: ringR * Math.cos(2 * Math.PI / 3), y: ringR * Math.sin(2 * Math.PI / 3), z: ringH, r: 1.0 },
            { x: ringR * Math.cos(Math.PI), y: ringR * Math.sin(Math.PI), z: -ringH, r: 1.0 },
            { x: ringR * Math.cos(4 * Math.PI / 3), y: ringR * Math.sin(4 * Math.PI / 3), z: ringH, r: 1.0 },
            { x: ringR * Math.cos(5 * Math.PI / 3), y: ringR * Math.sin(5 * Math.PI / 3), z: -ringH, r: 1.0 }
        ],
        params: { maxIterations: 40 }
    },
    dense_cube: {
        name: "Dense Cube (π/3)",
        category: "other",
        description: "8 spheres at cube vertices with edge √3 — 12 edge pairs at π/3, face/space diagonals disjoint",
        spheres: [
            { x: cubeA, y: cubeA, z: cubeA, r: 1.0 },
            { x: cubeA, y: cubeA, z: -cubeA, r: 1.0 },
            { x: cubeA, y: -cubeA, z: cubeA, r: 1.0 },
            { x: cubeA, y: -cubeA, z: -cubeA, r: 1.0 },
            { x: -cubeA, y: cubeA, z: cubeA, r: 1.0 },
            { x: -cubeA, y: cubeA, z: -cubeA, r: 1.0 },
            { x: -cubeA, y: -cubeA, z: cubeA, r: 1.0 },
            { x: -cubeA, y: -cubeA, z: -cubeA, r: 1.0 }
        ],
        params: { maxIterations: 40 }
    },
    helical: {
        name: "Helical Chain",
        category: "other",
        description: "6 spheres on a helix — each intersects its neighbor at π/4, inherent screw symmetry",
        spheres: (() => {
            const R = 1.0;
            const alpha = Math.PI / 3;
            // Adjacent distance for π/4: d = 2cos(π/8) ≈ 1.8478
            const dTarget = dihedralDistance(4);
            // d² = 2R²(1-cos(α)) + h²  →  h = sqrt(d² - 2R²(1-cos(α)))
            const h = Math.sqrt(Math.max(0, dTarget * dTarget - 2 * R * R * (1 - Math.cos(alpha))));
            const spheres = [];
            for (let k = 0; k < 6; k++) {
                spheres.push({
                    x: R * Math.cos(k * alpha),
                    y: R * Math.sin(k * alpha),
                    z: k * h - 2.5 * h,  // center vertically
                    r: 1.0
                });
            }
            return spheres;
        })(),
        params: { maxIterations: 40 }
    },

    // ---- CUSTOM ----
    custom: {
        name: "Custom",
        category: "custom",
        description: "Custom sphere configuration — edit positions freely",
        spheres: []
    }
};

// ============================================================
// API
// ============================================================

/** Get preset options grouped by category */
export function getPresetOptions() {
    return Object.keys(spherePresets).map(key => ({
        value: key,
        name: spherePresets[key].name,
        description: spherePresets[key].description,
        category: spherePresets[key].category || 'classic'
    }));
}

/** Deep copy of spheres for a preset */
export function getPresetSpheres(presetName) {
    if (!spherePresets[presetName]) {
        console.warn(`Preset "${presetName}" not found, returning default`);
        return JSON.parse(JSON.stringify(spherePresets.default.spheres));
    }
    return JSON.parse(JSON.stringify(spherePresets[presetName].spheres));
}

/** Get all preset names */
export function getPresetNames() {
    return Object.keys(spherePresets);
}
