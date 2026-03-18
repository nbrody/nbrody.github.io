/**
 * Color Palette System for 4D Kleinian Group Visualizer
 * Defines color palettes and coloring schemes
 */

export const colorPalettes = {
    cyanPurple: {
        name: "Vaporwave",
        description: "Deep purple through cyan with pink accents",
        colors: [
            { t: 0.0, rgb: [0.3, 0.1, 0.6] },    // Deep purple
            { t: 0.25, rgb: [0.6, 0.2, 0.8] },   // Magenta
            { t: 0.5, rgb: [0.0, 0.7, 0.9] },    // Cyan
            { t: 0.75, rgb: [0.0, 0.95, 1.0] },  // Bright cyan
            { t: 1.0, rgb: [1.0, 0.4, 0.8] }     // Pink accent
        ]
    },
    fire: {
        name: "Fire",
        description: "Dark red through orange to white hot",
        colors: [
            { t: 0.0, rgb: [0.1, 0.0, 0.0] },    // Dark red
            { t: 0.25, rgb: [0.8, 0.1, 0.0] },   // Red
            { t: 0.5, rgb: [1.0, 0.5, 0.0] },    // Orange
            { t: 0.75, rgb: [1.0, 0.9, 0.0] },   // Yellow
            { t: 1.0, rgb: [1.0, 1.0, 0.8] }     // White
        ]
    },
    ocean: {
        name: "Ocean",
        description: "Deep ocean blue to turquoise foam",
        colors: [
            { t: 0.0, rgb: [0.0, 0.05, 0.2] },   // Deep blue
            { t: 0.25, rgb: [0.0, 0.2, 0.5] },   // Ocean blue
            { t: 0.5, rgb: [0.0, 0.5, 0.7] },    // Turquoise
            { t: 0.75, rgb: [0.4, 0.8, 0.9] },   // Light blue
            { t: 1.0, rgb: [0.8, 1.0, 1.0] }     // Foam
        ]
    },
    rainbow: {
        name: "Rainbow",
        description: "Full spectrum HSV rainbow",
        type: "hsv",
        hsvFormula: "hsv2rgb(vec3(t, 1.0, 1.0))"
    },
    monochrome: {
        name: "Monochrome",
        description: "Black to white gradient",
        type: "simple",
        formula: "vec3(t)"
    },
    sunset: {
        name: "Sunset",
        description: "Dark purple through golden to pale yellow",
        colors: [
            { t: 0.0, rgb: [0.1, 0.0, 0.2] },    // Dark purple
            { t: 0.25, rgb: [0.5, 0.0, 0.3] },   // Purple
            { t: 0.5, rgb: [0.9, 0.3, 0.2] },    // Orange-red
            { t: 0.75, rgb: [1.0, 0.7, 0.3] },   // Golden
            { t: 1.0, rgb: [1.0, 0.9, 0.7] }     // Pale yellow
        ]
    }
};

export const colorSchemes = {
    iterationCount: {
        name: "Iteration Count",
        description: "Color based on number of iterations (mod 1.0)",
        formula: "mod(loopNum * 0.08, 1.0)"
    },
    iterationModulus: {
        name: "Iteration Modulus",
        description: "Color cycles based on custom modulus value",
        formula: "mod(loopNum, float(modulus)) / float(modulus)",
        hasCustomControl: true,
        controlName: "modulus"
    },
    distanceBased: {
        name: "Distance-Based",
        description: "Color based on ray marching distance",
        formula: "clamp(result.y * 0.001, 0.0, 1.0)"
    },
    positionBased: {
        name: "Position-Based",
        description: "Color based on 3D position in space",
        formula: "sin(intersection.x * 0.02) * cos(intersection.y * 0.02) * sin(intersection.z * 0.02) * 0.5 + 0.5"
    },
    smoothGradient: {
        name: "Smooth Gradient",
        description: "Smooth gradient over iteration range",
        formula: "loopNum / float(maxIterations)"
    }
};

/**
 * Generate GLSL code for color palette interpolation
 */
export function generatePaletteShaderCode() {
    const paletteKeys = Object.keys(colorPalettes);
    let code = `
vec3 getPaletteColor(float t, int palette) {
    t = clamp(t, 0.0, 1.0);
    vec3 color;
`;

    paletteKeys.forEach((key, index) => {
        const palette = colorPalettes[key];
        const condition = index === 0 ? 'if' : 'else if';

        code += `
    ${condition} (palette == ${index}) {`;

        if (palette.type === 'hsv') {
            code += `
        // ${palette.name}
        color = ${palette.hsvFormula};`;
        } else if (palette.type === 'simple') {
            code += `
        // ${palette.name}
        color = ${palette.formula};`;
        } else if (palette.colors) {
            // Multi-stop gradient
            code += `
        // ${palette.name}`;

            palette.colors.forEach((colorStop, i) => {
                code += `
        vec3 col${i + 1} = vec3(${colorStop.rgb.join(', ')});`;
            });

            // Generate interpolation code
            for (let i = 0; i < palette.colors.length - 1; i++) {
                const t1 = palette.colors[i].t;
                const t2 = palette.colors[i + 1].t;
                const condition = i === 0 ? 'if' : 'else if';

                code += `
        ${condition} (t < ${t2.toFixed(2)}) {
            color = mix(col${i + 1}, col${i + 2}, (t - ${t1.toFixed(2)}) * ${(1 / (t2 - t1)).toFixed(2)});
        }`;
            }

            // Handle t >= 1.0 case
            code += ` else {
            color = col${palette.colors.length};
        }`;
        }

        code += `
    }`;
    });

    code += ` else {
        color = vec3(1.0, 0.0, 1.0); // Fallback magenta
    }

    return color;
}`;

    return code;
}

/**
 * Generate GLSL code for color scheme selection
 */
export function generateColorSchemeShaderCode() {
    const schemeKeys = Object.keys(colorSchemes);
    let code = `
// Choose coloring scheme
float colorT = 0.0;
`;

    schemeKeys.forEach((key, index) => {
        const scheme = colorSchemes[key];
        const condition = index === 0 ? 'if' : 'else if';

        code += `${condition} (colorScheme == ${index}) {
    // ${scheme.name}
    colorT = ${scheme.formula};
} `;
    });

    return code;
}

/**
 * Get palette options for UI dropdown
 */
export function getPaletteOptions() {
    return Object.keys(colorPalettes).map((key, index) => ({
        value: index,
        key: key,
        name: colorPalettes[key].name,
        description: colorPalettes[key].description
    }));
}

/**
 * Get color scheme options for UI dropdown
 */
export function getColorSchemeOptions() {
    return Object.keys(colorSchemes).map((key, index) => ({
        value: index,
        key: key,
        name: colorSchemes[key].name,
        description: colorSchemes[key].description,
        hasCustomControl: colorSchemes[key].hasCustomControl || false,
        controlName: colorSchemes[key].controlName
    }));
}

/**
 * Get the total number of palettes
 */
export function getPaletteCount() {
    return Object.keys(colorPalettes).length;
}

/**
 * Get the total number of color schemes
 */
export function getColorSchemeCount() {
    return Object.keys(colorSchemes).length;
}
