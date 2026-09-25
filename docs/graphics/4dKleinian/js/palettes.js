/**
 * Colour ramps and orbit-colouring schemes.  Both are compiled into GLSL
 * at load time so the shader can switch between them without branching on
 * texture lookups.
 */

export const palettes = {
    aurora: {
        name: 'Aurora',
        description: 'Midnight blue into glacial cyan and acid gold.',
        stops: [
            [0.0, [0.03, 0.05, 0.14]],
            [0.26, [0.08, 0.24, 0.42]],
            [0.52, [0.05, 0.65, 0.72]],
            [0.76, [0.64, 0.93, 0.71]],
            [1.0, [1.0, 0.88, 0.54]]
        ]
    },
    ember: {
        name: 'Ember',
        description: 'Coal black through crimson, copper and pale heat.',
        stops: [
            [0.0, [0.03, 0.01, 0.01]],
            [0.22, [0.24, 0.03, 0.05]],
            [0.5, [0.74, 0.16, 0.08]],
            [0.78, [0.98, 0.55, 0.15]],
            [1.0, [1.0, 0.95, 0.82]]
        ]
    },
    glacier: {
        name: 'Glacier',
        description: 'Deep arctic blues with bright ice highlights.',
        stops: [
            [0.0, [0.01, 0.04, 0.1]],
            [0.24, [0.03, 0.16, 0.35]],
            [0.5, [0.08, 0.42, 0.74]],
            [0.8, [0.52, 0.87, 0.98]],
            [1.0, [0.95, 0.99, 1.0]]
        ]
    },
    verdant: {
        name: 'Verdant',
        description: 'Forest green, mineral teal and dry yellow.',
        stops: [
            [0.0, [0.01, 0.06, 0.04]],
            [0.28, [0.03, 0.23, 0.16]],
            [0.56, [0.14, 0.56, 0.39]],
            [0.8, [0.65, 0.82, 0.36]],
            [1.0, [0.96, 0.9, 0.7]]
        ]
    },
    solar: {
        name: 'Solar',
        description: 'Indigo shadow into pink, orange and gold.',
        stops: [
            [0.0, [0.08, 0.04, 0.18]],
            [0.2, [0.36, 0.08, 0.37]],
            [0.48, [0.84, 0.21, 0.39]],
            [0.76, [0.98, 0.55, 0.16]],
            [1.0, [1.0, 0.9, 0.5]]
        ]
    },
    nocturne: {
        name: 'Nocturne',
        description: 'Blue-black, violet haze and restrained amber.',
        stops: [
            [0.0, [0.01, 0.02, 0.06]],
            [0.25, [0.08, 0.08, 0.2]],
            [0.5, [0.3, 0.18, 0.42]],
            [0.78, [0.76, 0.57, 0.34]],
            [1.0, [0.98, 0.93, 0.84]]
        ]
    },
    graphite: {
        name: 'Graphite',
        description: 'Monochrome charcoal with a silver lift.',
        stops: [
            [0.0, [0.02, 0.02, 0.03]],
            [0.24, [0.12, 0.13, 0.16]],
            [0.56, [0.36, 0.38, 0.42]],
            [0.82, [0.74, 0.76, 0.8]],
            [1.0, [0.99, 0.99, 1.0]]
        ]
    },
    porcelain: {
        name: 'Porcelain',
        description: 'Warm bone white with a cool shadow — good for form.',
        stops: [
            [0.0, [0.16, 0.17, 0.22]],
            [0.35, [0.55, 0.55, 0.62]],
            [0.7, [0.9, 0.88, 0.86]],
            [1.0, [1.0, 0.97, 0.9]]
        ]
    },
    orchid: {
        name: 'Orchid',
        description: 'Plum through magenta into a pale mint highlight.',
        stops: [
            [0.0, [0.06, 0.02, 0.1]],
            [0.28, [0.32, 0.06, 0.35]],
            [0.55, [0.78, 0.16, 0.52]],
            [0.8, [0.98, 0.5, 0.62]],
            [1.0, [0.83, 0.99, 0.92]]
        ]
    },
    copper: {
        name: 'Copper',
        description: 'Oxidised metal: teal patina into hot bronze.',
        stops: [
            [0.0, [0.02, 0.06, 0.07]],
            [0.3, [0.05, 0.27, 0.26]],
            [0.55, [0.42, 0.36, 0.22]],
            [0.78, [0.86, 0.5, 0.22]],
            [1.0, [1.0, 0.83, 0.62]]
        ]
    },
    spectral: {
        name: 'Spectral',
        description: 'Full hue sweep — best for generator colouring.',
        type: 'hsv',
        formula: 'hsv2rgb(vec3(fract(0.92 * t + 0.03), 0.82, 1.0))'
    },
    pastel: {
        name: 'Pastel',
        description: 'Low-saturation hue sweep, easy on dense structures.',
        type: 'hsv',
        formula: 'hsv2rgb(vec3(fract(t), 0.38, 0.97))'
    }
};

export const schemes = {
    depth: {
        name: 'Orbit depth',
        description: 'Bands from the raw number of inversions applied.',
        formula: 'fract(gDepth * 0.11)'
    },
    depthNormalized: {
        name: 'Normalised depth',
        description: 'Orbit depth measured against the iteration budget.',
        formula: 'clamp(gDepth / max(float(uMaxFold), 1.0), 0.0, 1.0)'
    },
    modBands: {
        name: 'Modulo bands',
        description: 'Stripes of a chosen period in the word length.',
        formula: 'mod(gDepth, uModulus) / max(uModulus, 1.0)',
        control: 'modulus'
    },
    generator: {
        name: 'Generator',
        description: 'One hue per mirror: shows the word structure directly.',
        formula: '(gGenerator + 0.5) / max(float(uNumMirrors), 1.0)'
    },
    conformal: {
        name: 'Conformal density',
        description: 'log of the derivative of the folding map — how much the group has expanded here.',
        formula: 'clamp(gLogScale * 0.045, 0.0, 1.0)'
    },
    trap: {
        name: 'Orbit trap',
        description: 'Closest approach of the orbit to the chamber point.',
        formula: 'clamp(gTrap * 0.75, 0.0, 1.0)'
    },
    marchDepth: {
        name: 'View depth',
        description: 'Distance travelled by the ray before it hit.',
        formula: 'clamp((marchDepth - 1.2) * 0.55, 0.0, 1.0)'
    },
    angular: {
        name: 'Angular sweep',
        description: 'Polar angle of the hit point.',
        formula: '(atan(p.y, p.x) + 3.14159265) / 6.28318531'
    },
    weave: {
        name: 'Spatial weave',
        description: 'Interference stripes tied to position.',
        formula: '0.5 + 0.5 * sin(p.x * 3.1 + p.z * 1.9) * cos(p.y * 2.6)'
    },
    normal: {
        name: 'Surface normal',
        description: 'Colours by orientation — reads the geometry rather than the group.',
        formula: '0.5 + 0.5 * dot(n, normalize(vec3(0.35, 0.78, 0.52)))'
    }
};

export const paletteKeys = Object.keys(palettes);
export const schemeKeys = Object.keys(schemes);

export function paletteIndex(key) {
    const index = paletteKeys.indexOf(key);
    return index < 0 ? 0 : index;
}

export function schemeIndex(key) {
    const index = schemeKeys.indexOf(key);
    return index < 0 ? 0 : index;
}

export function generatePaletteCode() {
    let code = `
const vec4 hsvK = vec4(1.0, 0.6666666, 0.3333333, 3.0);
vec3 hsv2rgb(vec3 c) {
    vec3 p = abs(fract(c.xxx + hsvK.xyz) * 6.0 - hsvK.www);
    return c.z * mix(hsvK.xxx, clamp(p - hsvK.xxx, 0.0, 1.0), c.y);
}

vec3 getPaletteColor(float t, int palette) {
    t = clamp(t, 0.0, 1.0);
    vec3 color = vec3(t);
`;

    paletteKeys.forEach((key, index) => {
        const palette = palettes[key];
        code += `\n    ${index === 0 ? 'if' : 'else if'} (palette == ${index}) {`;

        if (palette.type === 'hsv') {
            code += `\n        color = ${palette.formula};`;
        } else {
            const stops = palette.stops;
            stops.forEach(([, rgb], stopIndex) => {
                code += `\n        vec3 c${index}_${stopIndex} = vec3(${rgb.map((v) => v.toFixed(4)).join(', ')});`;
            });
            for (let s = 0; s < stops.length - 1; s++) {
                const [t0] = stops[s];
                const [t1] = stops[s + 1];
                code += `
        ${s === 0 ? 'if' : 'else if'} (t < ${t1.toFixed(4)}) {
            color = mix(c${index}_${s}, c${index}_${s + 1}, (t - ${t0.toFixed(4)}) * ${(1 / (t1 - t0)).toFixed(5)});
        }`;
            }
            code += `\n        else { color = c${index}_${stops.length - 1}; }`;
        }
        code += '\n    }';
    });

    code += '\n    return color;\n}';
    return code;
}

export function generateSchemeCode() {
    let code = '\n    float colorT = 0.0;';
    schemeKeys.forEach((key, index) => {
        code += `
    ${index === 0 ? 'if' : 'else if'} (uScheme == ${index}) { colorT = ${schemes[key].formula}; }`;
    });
    return code;
}

export function paletteOptions() {
    return paletteKeys.map((key, index) => ({
        key,
        index,
        name: palettes[key].name,
        description: palettes[key].description
    }));
}

export function schemeOptions() {
    return schemeKeys.map((key, index) => ({
        key,
        index,
        name: schemes[key].name,
        description: schemes[key].description,
        control: schemes[key].control || null
    }));
}
