/**
 * 4D Kleinian Group Example Library
 * Sphere configuration presets for various geometric arrangements
 */

/**
 * Sphere preset configurations
 * Each sphere has: x, y, z (position), r (radius)
 */
export const spherePresets = {
    default: {
        name: "Default",
        description: "Balanced configuration with 8 spheres in a symmetric arrangement",
        spheres: [
            { x: 1.0, y: 1.0, z: 0.0, r: 1.0 },
            { x: 1.0, y: -1.0, z: 0.0, r: 1.0 },
            { x: -1.0, y: 1.0, z: 0.0, r: 1.0 },
            { x: -1.0, y: -1.0, z: 0.0, r: 1.0 },
            { x: 1.0 + Math.sqrt(3), y: 0.0, z: 0.0, r: 1.0 },
            { x: -1.0 - Math.sqrt(3), y: 0.0, z: 0.0, r: 1.0 },
            { x: 0.0, y: 0.0, z: 1.4142, r: 1.0 },
            { x: 0.0, y: 0.0, z: -1.4142, r: 1.0 }
        ]
    },
    tetrahedral: {
        name: "Tetrahedral",
        description: "Four spheres arranged at the vertices of a tetrahedron",
        spheres: [
            { x: 1.3333, y: 1.3333, z: 1.3333, r: 1.1667 },
            { x: 1.3333, y: -1.3333, z: -1.3333, r: 1.1667 },
            { x: -1.3333, y: 1.3333, z: -1.3333, r: 1.1667 },
            { x: -1.3333, y: -1.3333, z: 1.3333, r: 1.1667 }
        ]
    },
    octahedral: {
        name: "Octahedral",
        description: "Six spheres arranged at the vertices of an octahedron",
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
        description: "Eight spheres arranged at the vertices of a cube",
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
        description: "Twelve spheres arranged at the vertices of an icosahedron",
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
        description: "Four spheres in an Apollonian gasket configuration",
        spheres: [
            { x: 0.0, y: 0.0, z: 0.0, r: 1.3333 },
            { x: 2.0, y: 0.0, z: 0.0, r: 0.6667 },
            { x: 1.0, y: 1.732, z: 0.0, r: 0.6667 },
            { x: 1.0, y: 0.577, z: 1.633, r: 0.6667 }
        ]
    },
    custom: {
        name: "Custom",
        description: "Custom sphere configuration",
        spheres: []
    }
};

/**
 * Get array of preset options for dropdown UI
 */
export function getPresetOptions() {
    return Object.keys(spherePresets).map(key => ({
        value: key,
        name: spherePresets[key].name,
        description: spherePresets[key].description
    }));
}

/**
 * Get spheres array for a given preset
 * Returns a deep copy to avoid mutation
 */
export function getPresetSpheres(presetName) {
    if (!spherePresets[presetName]) {
        console.warn(`Preset "${presetName}" not found, returning default`);
        return JSON.parse(JSON.stringify(spherePresets.default.spheres));
    }
    return JSON.parse(JSON.stringify(spherePresets[presetName].spheres));
}

/**
 * Get all preset names
 */
export function getPresetNames() {
    return Object.keys(spherePresets);
}
