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
            { x: 300, y: 300, z: 0, r: 300 },
            { x: 300, y: -300, z: 0, r: 300 },
            { x: -300, y: 300, z: 0, r: 300 },
            { x: -300, y: -300, z: 0, r: 300 },
            { x: 300 + 300 * Math.sqrt(3), y: 0, z: 0, r: 300 },
            { x: -300 - 300 * Math.sqrt(3), y: 0, z: 0, r: 300 },
            { x: 0, y: 0, z: 424.26, r: 300 },
            { x: 0, y: 0, z: -424.26, r: 300 }
        ]
    },
    tetrahedral: {
        name: "Tetrahedral",
        description: "Four spheres arranged at the vertices of a tetrahedron",
        spheres: [
            { x: 400, y: 400, z: 400, r: 350 },
            { x: 400, y: -400, z: -400, r: 350 },
            { x: -400, y: 400, z: -400, r: 350 },
            { x: -400, y: -400, z: 400, r: 350 }
        ]
    },
    octahedral: {
        name: "Octahedral",
        description: "Six spheres arranged at the vertices of an octahedron",
        spheres: [
            { x: 500, y: 0, z: 0, r: 300 },
            { x: -500, y: 0, z: 0, r: 300 },
            { x: 0, y: 500, z: 0, r: 300 },
            { x: 0, y: -500, z: 0, r: 300 },
            { x: 0, y: 0, z: 500, r: 300 },
            { x: 0, y: 0, z: -500, r: 300 }
        ]
    },
    cubic: {
        name: "Cubic",
        description: "Eight spheres arranged at the vertices of a cube",
        spheres: [
            { x: 350, y: 350, z: 350, r: 300 },
            { x: 350, y: 350, z: -350, r: 300 },
            { x: 350, y: -350, z: 350, r: 300 },
            { x: 350, y: -350, z: -350, r: 300 },
            { x: -350, y: 350, z: 350, r: 300 },
            { x: -350, y: 350, z: -350, r: 300 },
            { x: -350, y: -350, z: 350, r: 300 },
            { x: -350, y: -350, z: -350, r: 300 }
        ]
    },
    icosahedral: {
        name: "Icosahedral",
        description: "Twelve spheres arranged at the vertices of an icosahedron",
        spheres: [
            { x: 0, y: 300, z: 300 * 1.618, r: 250 },
            { x: 0, y: 300, z: -300 * 1.618, r: 250 },
            { x: 0, y: -300, z: 300 * 1.618, r: 250 },
            { x: 0, y: -300, z: -300 * 1.618, r: 250 },
            { x: 300, y: 300 * 1.618, z: 0, r: 250 },
            { x: 300, y: -300 * 1.618, z: 0, r: 250 },
            { x: -300, y: 300 * 1.618, z: 0, r: 250 },
            { x: -300, y: -300 * 1.618, z: 0, r: 250 },
            { x: 300 * 1.618, y: 0, z: 300, r: 250 },
            { x: 300 * 1.618, y: 0, z: -300, r: 250 },
            { x: -300 * 1.618, y: 0, z: 300, r: 250 },
            { x: -300 * 1.618, y: 0, z: -300, r: 250 }
        ]
    },
    apollonian: {
        name: "Apollonian Gasket",
        description: "Four spheres in an Apollonian gasket configuration",
        spheres: [
            { x: 0, y: 0, z: 0, r: 400 },
            { x: 600, y: 0, z: 0, r: 200 },
            { x: 300, y: 300 * Math.sqrt(3), z: 0, r: 200 },
            { x: 300, y: 300 * Math.sqrt(3) / 3, z: 300 * Math.sqrt(6), r: 200 }
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
