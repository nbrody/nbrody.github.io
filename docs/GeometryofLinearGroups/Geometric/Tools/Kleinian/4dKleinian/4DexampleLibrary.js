/**
 * Curated inversion-sphere configurations for 4D Kleinian limit set rendering.
 *
 * Each preset packages:
 * - inversion spheres in R^3 ~ boundary of H^4
 * - seed groups used by the distance estimator
 * - recommended render defaults for a readable first view
 */

const sqrt2 = Math.sqrt(2);
const sqrt3 = Math.sqrt(3);

function dihedralDistance(order) {
    return 2 * Math.cos(Math.PI / (2 * order));
}

function computeTriangleGroupSpheres(p, q, r) {
    const zOffset = sqrt3;
    const dP = dihedralDistance(p);
    const dQ = dihedralDistance(q);
    const dR = dihedralDistance(r);
    const x3 = (dQ * dQ + dP * dP - dR * dR) / (2 * dP);
    const y3 = Math.sqrt(Math.max(0, dQ * dQ - x3 * x3));

    return [
        { x: 0, y: 0, z: 0, r: 1.0 },
        { x: dP, y: 0, z: 0, r: 1.0 },
        { x: x3, y: y3, z: 0, r: 1.0 },
        { x: 0, y: 0, z: zOffset, r: 1.0 },
        { x: dP, y: 0, z: zOffset, r: 1.0 },
        { x: x3, y: y3, z: zOffset, r: 1.0 }
    ];
}

function clonePoint(point) {
    return { x: point.x, y: point.y, z: point.z };
}

function averageSphereCenters(spheres, indices) {
    const total = indices.reduce((sum, index) => {
        const sphere = spheres[index];
        if (!sphere) {
            return sum;
        }

        sum.x += sphere.x;
        sum.y += sphere.y;
        sum.z += sphere.z;
        return sum;
    }, { x: 0, y: 0, z: 0 });

    const divisor = Math.max(indices.length, 1);
    return {
        x: total.x / divisor,
        y: total.y / divisor,
        z: total.z / divisor
    };
}

const pentagonRadius = sqrt3 / (2 * Math.sin(Math.PI / 5));
const pentagonLift = Math.sqrt(Math.max(0, 3 - pentagonRadius * pentagonRadius));
const ringRadius = 1.4;
const ringLift = Math.sqrt((3 - ringRadius * ringRadius) / 4);
const denseCubeCoord = sqrt3 / 2;

export const groupFamilies = {
    classical: "Classical Arrangements",
    triangle: "Hyperbolic Triangle Groups",
    coxeter: "Right-Angled Coxeter Groups",
    experimental: "Experimental Families"
};

export const groupPresets = {
    default: {
        name: "Classical Eight-Sphere",
        family: "classical",
        description: "The original eight-sphere configuration: balanced, dense, and good for a first orbit.",
        spheres: [
            { x: 1.0, y: 1.0, z: 0.0, r: 1.0 },
            { x: 1.0, y: -1.0, z: 0.0, r: 1.0 },
            { x: -1.0, y: 1.0, z: 0.0, r: 1.0 },
            { x: -1.0, y: -1.0, z: 0.0, r: 1.0 },
            { x: 1.0 + sqrt3, y: 0.0, z: 0.0, r: 1.0 },
            { x: -1.0 - sqrt3, y: 0.0, z: 0.0, r: 1.0 },
            { x: 0.0, y: 0.0, z: sqrt2, r: 1.0 },
            { x: 0.0, y: 0.0, z: -sqrt2, r: 1.0 }
        ],
        seedGroups: [
            [0, 1, 4],
            [2, 3, 5],
            [6],
            [7]
        ],
        defaults: {
            maxIterations: 36,
            maxMarchSteps: 420,
            scalingFactor: 0.084,
            kleinSphereR: 0.42,
            seedRadius: 0.17,
            paletteKey: "aurora",
            schemeKey: "orbitDepth",
            modulus: 6,
            cameraDistance: 2.15,
            fov: 58
        }
    },
    apollonian: {
        name: "Apollonian Tetrahedron",
        family: "classical",
        description: "Four mutually tangent spheres. This pushes the renderer toward a compact Apollonian-style lace.",
        spheres: [
            { x: 0.0, y: 0.0, z: 0.0, r: 1.3333 },
            { x: 2.0, y: 0.0, z: 0.0, r: 0.6667 },
            { x: 1.0, y: 1.732, z: 0.0, r: 0.6667 },
            { x: 1.0, y: 0.577, z: 1.633, r: 0.6667 }
        ],
        seedGroups: [
            [0],
            [1],
            [2],
            [3]
        ],
        defaults: {
            maxIterations: 40,
            maxMarchSteps: 480,
            scalingFactor: 0.076,
            kleinSphereR: 0.64,
            seedRadius: 0.12,
            paletteKey: "ember",
            schemeKey: "normalLight",
            modulus: 5,
            cameraDistance: 2.4,
            fov: 54
        }
    },
    octahedral: {
        name: "Octahedral Axes",
        family: "classical",
        description: "Six spheres aligned with the coordinate axes. Symmetric and clean, with broad voids between filaments.",
        spheres: [
            { x: 1.6667, y: 0.0, z: 0.0, r: 1.0 },
            { x: -1.6667, y: 0.0, z: 0.0, r: 1.0 },
            { x: 0.0, y: 1.6667, z: 0.0, r: 1.0 },
            { x: 0.0, y: -1.6667, z: 0.0, r: 1.0 },
            { x: 0.0, y: 0.0, z: 1.6667, r: 1.0 },
            { x: 0.0, y: 0.0, z: -1.6667, r: 1.0 }
        ],
        seedGroups: [
            [0, 2, 4],
            [1, 3, 5]
        ],
        defaults: {
            maxIterations: 36,
            maxMarchSteps: 430,
            scalingFactor: 0.082,
            kleinSphereR: 0.46,
            seedRadius: 0.15,
            paletteKey: "glacier",
            schemeKey: "orbitNormalized",
            modulus: 6,
            cameraDistance: 2.2,
            fov: 56
        }
    },
    cubic: {
        name: "Cubic Corners",
        family: "classical",
        description: "Eight equally weighted cube vertices. Strong bilateral repetition with room for deep zooms.",
        spheres: [
            { x: 1.1667, y: 1.1667, z: 1.1667, r: 1.0 },
            { x: 1.1667, y: 1.1667, z: -1.1667, r: 1.0 },
            { x: 1.1667, y: -1.1667, z: 1.1667, r: 1.0 },
            { x: 1.1667, y: -1.1667, z: -1.1667, r: 1.0 },
            { x: -1.1667, y: 1.1667, z: 1.1667, r: 1.0 },
            { x: -1.1667, y: 1.1667, z: -1.1667, r: 1.0 },
            { x: -1.1667, y: -1.1667, z: 1.1667, r: 1.0 },
            { x: -1.1667, y: -1.1667, z: -1.1667, r: 1.0 }
        ],
        seedGroups: [
            [0, 1, 2, 3],
            [4, 5, 6, 7]
        ],
        defaults: {
            maxIterations: 38,
            maxMarchSteps: 460,
            scalingFactor: 0.081,
            kleinSphereR: 0.45,
            seedRadius: 0.15,
            paletteKey: "nocturne",
            schemeKey: "orbitNormalized",
            modulus: 8,
            cameraDistance: 2.2,
            fov: 57
        }
    },
    triangle_237: {
        name: "Triangle (2,3,7)",
        family: "triangle",
        description: "A Hurwitz-style hyperbolic triangle group with dense, highly folded boundary dynamics.",
        spheres: computeTriangleGroupSpheres(2, 3, 7),
        seedGroups: [
            [0, 1, 2],
            [3, 4, 5]
        ],
        defaults: {
            maxIterations: 46,
            maxMarchSteps: 560,
            scalingFactor: 0.082,
            kleinSphereR: 0.42,
            seedRadius: 0.12,
            paletteKey: "solar",
            schemeKey: "modBands",
            modulus: 7,
            cameraDistance: 2.25,
            fov: 57
        }
    },
    triangle_245: {
        name: "Triangle (2,4,5)",
        family: "triangle",
        description: "Mixed right-angle and pentagonal symmetry. Good contrast between voids and filament clusters.",
        spheres: computeTriangleGroupSpheres(2, 4, 5),
        seedGroups: [
            [0, 1, 2],
            [3, 4, 5]
        ],
        defaults: {
            maxIterations: 42,
            maxMarchSteps: 500,
            scalingFactor: 0.08,
            kleinSphereR: 0.44,
            seedRadius: 0.13,
            paletteKey: "aurora",
            schemeKey: "angularSweep",
            modulus: 5,
            cameraDistance: 2.18,
            fov: 58
        }
    },
    triangle_334: {
        name: "Triangle (3,3,4)",
        family: "triangle",
        description: "An all-acute triangle group. The resulting surface reads more woven than banded.",
        spheres: computeTriangleGroupSpheres(3, 3, 4),
        seedGroups: [
            [0, 1, 2],
            [3, 4, 5]
        ],
        defaults: {
            maxIterations: 42,
            maxMarchSteps: 520,
            scalingFactor: 0.082,
            kleinSphereR: 0.42,
            seedRadius: 0.11,
            paletteKey: "verdant",
            schemeKey: "weave",
            modulus: 6,
            cameraDistance: 2.1,
            fov: 60
        }
    },
    triangle_2312: {
        name: "Triangle (2,3,12)",
        family: "triangle",
        description: "A very tight hyperbolic angle. Dense orbit structure with fine-scale striping when iterated deeply.",
        spheres: computeTriangleGroupSpheres(2, 3, 12),
        seedGroups: [
            [0, 1, 2],
            [3, 4, 5]
        ],
        defaults: {
            maxIterations: 54,
            maxMarchSteps: 680,
            scalingFactor: 0.074,
            kleinSphereR: 0.4,
            seedRadius: 0.1,
            paletteKey: "spectral",
            schemeKey: "modBands",
            modulus: 12,
            cameraDistance: 2.35,
            fov: 54
        }
    },
    right_prism: {
        name: "Right-Angled Prism",
        family: "coxeter",
        description: "A six-generator prism with two triangular layers. Clean planes break into organized shards.",
        spheres: [
            { x: 0, y: 0, z: 0, r: 1.0 },
            { x: sqrt2, y: 0, z: 0, r: 1.0 },
            { x: sqrt2 / 2, y: Math.sqrt(3 / 2), z: 0, r: 1.0 },
            { x: 0, y: 0, z: sqrt2, r: 1.0 },
            { x: sqrt2, y: 0, z: sqrt2, r: 1.0 },
            { x: sqrt2 / 2, y: Math.sqrt(3 / 2), z: sqrt2, r: 1.0 }
        ],
        seedGroups: [
            [0, 1, 2],
            [3, 4, 5]
        ],
        defaults: {
            maxIterations: 40,
            maxMarchSteps: 460,
            scalingFactor: 0.09,
            kleinSphereR: 0.46,
            seedRadius: 0.14,
            paletteKey: "ember",
            schemeKey: "marchDistance",
            modulus: 6,
            cameraDistance: 2.18,
            fov: 56
        }
    },
    right_cube: {
        name: "Right-Angled Cube",
        family: "coxeter",
        description: "A cube with edge length sqrt(2), emphasizing orthogonal intersections and crisp cavities.",
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
        seedGroups: [
            [0, 1, 2, 3],
            [4, 5, 6, 7]
        ],
        defaults: {
            maxIterations: 40,
            maxMarchSteps: 480,
            scalingFactor: 0.088,
            kleinSphereR: 0.43,
            seedRadius: 0.14,
            paletteKey: "graphite",
            schemeKey: "orbitNormalized",
            modulus: 8,
            cameraDistance: 2.12,
            fov: 58
        }
    },
    pentagonal_star: {
        name: "Pentagonal Star",
        family: "experimental",
        description: "Five-fold rotational symmetry with a lifted center sphere. The silhouette feels floral and sharp.",
        spheres: [
            { x: pentagonRadius, y: 0, z: 0, r: 1.0 },
            { x: pentagonRadius * Math.cos(2 * Math.PI / 5), y: pentagonRadius * Math.sin(2 * Math.PI / 5), z: 0, r: 1.0 },
            { x: pentagonRadius * Math.cos(4 * Math.PI / 5), y: pentagonRadius * Math.sin(4 * Math.PI / 5), z: 0, r: 1.0 },
            { x: pentagonRadius * Math.cos(6 * Math.PI / 5), y: pentagonRadius * Math.sin(6 * Math.PI / 5), z: 0, r: 1.0 },
            { x: pentagonRadius * Math.cos(8 * Math.PI / 5), y: pentagonRadius * Math.sin(8 * Math.PI / 5), z: 0, r: 1.0 },
            { x: 0, y: 0, z: pentagonLift, r: 1.0 }
        ],
        seedGroups: [
            [0, 1, 2, 3, 4],
            [5]
        ],
        defaults: {
            maxIterations: 44,
            maxMarchSteps: 540,
            scalingFactor: 0.078,
            kleinSphereR: 0.48,
            seedRadius: 0.11,
            paletteKey: "solar",
            schemeKey: "angularSweep",
            modulus: 5,
            cameraDistance: 2.28,
            fov: 55
        }
    },
    twisted_ring: {
        name: "Twisted Ring",
        family: "experimental",
        description: "A screw-symmetric hexagonal ring with alternating vertical offsets. Good for ribbon-like structures.",
        spheres: [
            { x: ringRadius, y: 0, z: ringLift, r: 1.0 },
            { x: ringRadius * Math.cos(Math.PI / 3), y: ringRadius * Math.sin(Math.PI / 3), z: -ringLift, r: 1.0 },
            { x: ringRadius * Math.cos(2 * Math.PI / 3), y: ringRadius * Math.sin(2 * Math.PI / 3), z: ringLift, r: 1.0 },
            { x: ringRadius * Math.cos(Math.PI), y: ringRadius * Math.sin(Math.PI), z: -ringLift, r: 1.0 },
            { x: ringRadius * Math.cos(4 * Math.PI / 3), y: ringRadius * Math.sin(4 * Math.PI / 3), z: ringLift, r: 1.0 },
            { x: ringRadius * Math.cos(5 * Math.PI / 3), y: ringRadius * Math.sin(5 * Math.PI / 3), z: -ringLift, r: 1.0 }
        ],
        seedGroups: [
            [0, 2, 4],
            [1, 3, 5]
        ],
        defaults: {
            maxIterations: 44,
            maxMarchSteps: 560,
            scalingFactor: 0.076,
            kleinSphereR: 0.46,
            seedRadius: 0.1,
            paletteKey: "aurora",
            schemeKey: "weave",
            modulus: 6,
            cameraDistance: 2.32,
            fov: 54
        }
    },
    dense_cube: {
        name: "Dense Cube",
        family: "experimental",
        description: "A pi/3 cube with heavier overlap than the classical cubic preset. More mass, less empty space.",
        spheres: [
            { x: denseCubeCoord, y: denseCubeCoord, z: denseCubeCoord, r: 1.0 },
            { x: denseCubeCoord, y: denseCubeCoord, z: -denseCubeCoord, r: 1.0 },
            { x: denseCubeCoord, y: -denseCubeCoord, z: denseCubeCoord, r: 1.0 },
            { x: denseCubeCoord, y: -denseCubeCoord, z: -denseCubeCoord, r: 1.0 },
            { x: -denseCubeCoord, y: denseCubeCoord, z: denseCubeCoord, r: 1.0 },
            { x: -denseCubeCoord, y: denseCubeCoord, z: -denseCubeCoord, r: 1.0 },
            { x: -denseCubeCoord, y: -denseCubeCoord, z: denseCubeCoord, r: 1.0 },
            { x: -denseCubeCoord, y: -denseCubeCoord, z: -denseCubeCoord, r: 1.0 }
        ],
        seedGroups: [
            [0, 1, 2, 3],
            [4, 5, 6, 7]
        ],
        defaults: {
            maxIterations: 42,
            maxMarchSteps: 500,
            scalingFactor: 0.08,
            kleinSphereR: 0.47,
            seedRadius: 0.13,
            paletteKey: "nocturne",
            schemeKey: "marchDistance",
            modulus: 8,
            cameraDistance: 2.2,
            fov: 56
        }
    },
    helical: {
        name: "Helical Chain",
        family: "experimental",
        description: "Six spheres threaded on a helix. This one benefits from oblique angles and deeper iteration counts.",
        spheres: (() => {
            const helixRadius = 1.0;
            const angleStep = Math.PI / 3;
            const targetDistance = dihedralDistance(4);
            const rise = Math.sqrt(
                Math.max(0, targetDistance * targetDistance - 2 * helixRadius * helixRadius * (1 - Math.cos(angleStep)))
            );

            const spheres = [];
            for (let index = 0; index < 6; index++) {
                spheres.push({
                    x: helixRadius * Math.cos(index * angleStep),
                    y: helixRadius * Math.sin(index * angleStep),
                    z: index * rise - 2.5 * rise,
                    r: 1.0
                });
            }
            return spheres;
        })(),
        seedGroups: [
            [0, 1, 2],
            [3, 4, 5]
        ],
        defaults: {
            maxIterations: 46,
            maxMarchSteps: 600,
            scalingFactor: 0.072,
            kleinSphereR: 0.44,
            seedRadius: 0.09,
            paletteKey: "spectral",
            schemeKey: "marchDistance",
            modulus: 9,
            cameraDistance: 2.45,
            fov: 52
        }
    }
};

export function getGroupPreset(groupKey) {
    return groupPresets[groupKey] || groupPresets.default;
}

export function getGroupOptions() {
    return Object.entries(groupPresets).map(([key, preset]) => ({
        value: key,
        name: preset.name,
        family: preset.family,
        description: preset.description
    }));
}

export function getGroupKeys() {
    return Object.keys(groupPresets);
}

export function getGroupSpheres(groupKey) {
    return getGroupPreset(groupKey).spheres.map((sphere) => ({
        x: sphere.x,
        y: sphere.y,
        z: sphere.z,
        r: sphere.r
    }));
}

export function getGroupSeedCenters(groupKey) {
    const preset = getGroupPreset(groupKey);
    const seedGroups = preset.seedGroups || [];

    if (seedGroups.length === 0) {
        return preset.spheres
            .slice(0, Math.min(4, preset.spheres.length))
            .map((sphere) => clonePoint(sphere));
    }

    return seedGroups.map((indices) => averageSphereCenters(preset.spheres, indices));
}

export function getGroupDefaults(groupKey) {
    const defaults = getGroupPreset(groupKey).defaults || {};
    return { ...defaults };
}
