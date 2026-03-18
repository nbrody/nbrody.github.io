/**
 * Palette and coloring-system registry for the 4D Kleinian shader.
 *
 * Palettes are compiled into GLSL at load time so the fragment shader can
 * switch looks without a giant texture lookup.
 */

export const colorPalettes = {
    aurora: {
        name: "Aurora",
        description: "Midnight blue into glacial cyan and acid gold.",
        colors: [
            { t: 0.0, rgb: [0.03, 0.05, 0.14] },
            { t: 0.26, rgb: [0.08, 0.24, 0.42] },
            { t: 0.52, rgb: [0.05, 0.65, 0.72] },
            { t: 0.76, rgb: [0.64, 0.93, 0.71] },
            { t: 1.0, rgb: [1.0, 0.88, 0.54] }
        ]
    },
    ember: {
        name: "Ember",
        description: "Coal black through crimson, copper, and pale heat.",
        colors: [
            { t: 0.0, rgb: [0.03, 0.01, 0.01] },
            { t: 0.22, rgb: [0.22, 0.03, 0.05] },
            { t: 0.5, rgb: [0.71, 0.16, 0.08] },
            { t: 0.78, rgb: [0.96, 0.54, 0.15] },
            { t: 1.0, rgb: [1.0, 0.95, 0.82] }
        ]
    },
    glacier: {
        name: "Glacier",
        description: "Deep arctic blues with bright ice-line highlights.",
        colors: [
            { t: 0.0, rgb: [0.01, 0.04, 0.1] },
            { t: 0.24, rgb: [0.03, 0.16, 0.35] },
            { t: 0.5, rgb: [0.08, 0.42, 0.74] },
            { t: 0.8, rgb: [0.52, 0.87, 0.98] },
            { t: 1.0, rgb: [0.95, 0.99, 1.0] }
        ]
    },
    verdant: {
        name: "Verdant",
        description: "Forest green, mineral teal, and dry yellow highlights.",
        colors: [
            { t: 0.0, rgb: [0.01, 0.06, 0.04] },
            { t: 0.28, rgb: [0.03, 0.23, 0.16] },
            { t: 0.56, rgb: [0.14, 0.56, 0.39] },
            { t: 0.8, rgb: [0.65, 0.82, 0.36] },
            { t: 1.0, rgb: [0.96, 0.9, 0.7] }
        ]
    },
    solar: {
        name: "Solar",
        description: "Indigo shadow into pink, orange, and bright gold.",
        colors: [
            { t: 0.0, rgb: [0.08, 0.04, 0.18] },
            { t: 0.2, rgb: [0.34, 0.08, 0.37] },
            { t: 0.48, rgb: [0.81, 0.21, 0.39] },
            { t: 0.76, rgb: [0.97, 0.54, 0.16] },
            { t: 1.0, rgb: [1.0, 0.88, 0.48] }
        ]
    },
    nocturne: {
        name: "Nocturne",
        description: "Blue-black, violet haze, and restrained amber.",
        colors: [
            { t: 0.0, rgb: [0.01, 0.02, 0.06] },
            { t: 0.25, rgb: [0.08, 0.08, 0.2] },
            { t: 0.5, rgb: [0.28, 0.18, 0.39] },
            { t: 0.78, rgb: [0.73, 0.56, 0.34] },
            { t: 1.0, rgb: [0.98, 0.93, 0.84] }
        ]
    },
    graphite: {
        name: "Graphite",
        description: "Monochrome charcoal with silver lift.",
        colors: [
            { t: 0.0, rgb: [0.02, 0.02, 0.03] },
            { t: 0.24, rgb: [0.12, 0.13, 0.16] },
            { t: 0.56, rgb: [0.34, 0.36, 0.4] },
            { t: 0.82, rgb: [0.72, 0.74, 0.78] },
            { t: 1.0, rgb: [0.98, 0.98, 0.99] }
        ]
    },
    spectral: {
        name: "Spectral",
        description: "Full-spectrum hue sweep with a high-value finish.",
        type: "hsv",
        hsvFormula: "hsv2rgb(vec3(fract(0.92 * t + 0.03), 0.88, 1.0))"
    }
};

export const colorSchemes = {
    orbitDepth: {
        name: "Orbit Depth",
        description: "Repeating bands from raw inversion depth.",
        formula: "fract(loopNum * 0.11)"
    },
    orbitNormalized: {
        name: "Normalized Depth",
        description: "Maps orbit depth onto the selected iteration budget.",
        formula: "clamp(loopNum / max(float(maxIterations), 1.0), 0.0, 1.0)"
    },
    modBands: {
        name: "Modulo Bands",
        description: "Repeating stripes driven by a custom modulus.",
        formula: "mod(loopNum, float(modulus)) / max(float(modulus), 1.0)",
        hasCustomControl: true,
        controlName: "modulus"
    },
    marchDistance: {
        name: "March Distance",
        description: "Colors by total ray-march travel before intersection.",
        formula: "clamp(result.y * 0.085, 0.0, 1.0)"
    },
    angularSweep: {
        name: "Angular Sweep",
        description: "Uses the polar angle of the hit point for circular bands.",
        formula: "(atan(intersection.y, intersection.x) + 3.14159265) / 6.2831853"
    },
    weave: {
        name: "Spatial Weave",
        description: "Interference stripes tied to spatial coordinates.",
        formula: "0.5 + 0.5 * sin(intersection.x * 3.1 + intersection.z * 1.9) * cos(intersection.y * 2.6)"
    },
    normalLight: {
        name: "Normal Light",
        description: "Highlights contour changes using surface normals.",
        formula: "pow(clamp(dot(normalize(normal), normalize(vec3(0.35, 0.78, 0.52))), 0.0, 1.0), 0.75)"
    }
};

function getPaletteEntries() {
    return Object.entries(colorPalettes);
}

function getSchemeEntries() {
    return Object.entries(colorSchemes);
}

export function generatePaletteShaderCode() {
    const entries = getPaletteEntries();
    let code = `
vec3 getPaletteColor(float t, int palette) {
    t = clamp(t, 0.0, 1.0);
    vec3 color = vec3(t);
`;

    entries.forEach(([_, palette], paletteIndex) => {
        const branch = paletteIndex === 0 ? "if" : "else if";
        code += `
    ${branch} (palette == ${paletteIndex}) {`;

        if (palette.type === "hsv") {
            code += `
        color = ${palette.hsvFormula};`;
        } else {
            palette.colors.forEach((colorStop, stopIndex) => {
                code += `
        vec3 palette_${paletteIndex}_${stopIndex} = vec3(${colorStop.rgb.join(", ")});`;
            });

            for (let stopIndex = 0; stopIndex < palette.colors.length - 1; stopIndex++) {
                const current = palette.colors[stopIndex];
                const next = palette.colors[stopIndex + 1];
                const branchStep = stopIndex === 0 ? "if" : "else if";
                const rangeScale = 1 / (next.t - current.t);

                code += `
        ${branchStep} (t < ${next.t.toFixed(3)}) {
            color = mix(
                palette_${paletteIndex}_${stopIndex},
                palette_${paletteIndex}_${stopIndex + 1},
                (t - ${current.t.toFixed(3)}) * ${rangeScale.toFixed(3)}
            );
        }`;
            }

            code += `
        else {
            color = palette_${paletteIndex}_${palette.colors.length - 1};
        }`;
        }

        code += `
    }`;
    });

    code += `
    return color;
}`;

    return code;
}

export function generateColorSchemeShaderCode() {
    const entries = getSchemeEntries();
    let code = `
float colorT = 0.0;
`;

    entries.forEach(([_, scheme], schemeIndex) => {
        const branch = schemeIndex === 0 ? "if" : "else if";
        code += `
${branch} (colorScheme == ${schemeIndex}) {
    colorT = ${scheme.formula};
}`;
    });

    return code;
}

export function getPaletteOptions() {
    return getPaletteEntries().map(([key, palette], index) => ({
        key,
        value: index,
        name: palette.name,
        description: palette.description
    }));
}

export function getColorSchemeOptions() {
    return getSchemeEntries().map(([key, scheme], index) => ({
        key,
        value: index,
        name: scheme.name,
        description: scheme.description,
        hasCustomControl: Boolean(scheme.hasCustomControl),
        controlName: scheme.controlName || null
    }));
}

export function getPaletteIndexByKey(key) {
    const index = getPaletteEntries().findIndex(([paletteKey]) => paletteKey === key);
    return index >= 0 ? index : 0;
}

export function getColorSchemeIndexByKey(key) {
    const index = getSchemeEntries().findIndex(([schemeKey]) => schemeKey === key);
    return index >= 0 ? index : 0;
}
