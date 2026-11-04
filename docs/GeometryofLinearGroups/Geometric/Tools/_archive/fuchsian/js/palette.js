/**
 * Color palette functions for face coloring
 * Mirrors the shader's faceColor function for UI consistency
 */

function hsv2rgbJS(h, s, v) {
    const k = (n) => (n + h * 6) % 6;
    const f = (n) => v - v * s * Math.max(Math.min(k(n), 4 - k(n), 1), 0);
    const r = Math.round(f(5) * 255);
    const g = Math.round(f(3) * 255);
    const b = Math.round(f(1) * 255);
    return `rgb(${r}, ${g}, ${b})`;
}

export function faceColorJS(id, paletteMode) {
    if (paletteMode === 0) {
        // colorful: golden-ratio hue stepping
        const golden = 0.61803398875;
        const hue = (id * golden) % 1;
        return hsv2rgbJS(hue, 0.6, 0.9);
    } else if (paletteMode === 1) {
        // vaporwave palette (8 colors)
        const pal = [
            [252, 189, 245], [198, 180, 252], [153, 204, 252], [134, 229, 214],
            [252, 215, 153], [242, 153, 189], [173, 173, 252], [131, 221, 252]
        ];
        const c = pal[id % pal.length];
        return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
    } else if (paletteMode === 3) {
        // halloween palette (4 colors)
        const pal = [
            [255, 110, 0],   // pumpkin orange
            [92, 0, 157],    // deep purple
            [143, 212, 0],   // slime green
            [26, 26, 31],    // charcoal
        ];
        const c = pal[id % pal.length];
        return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
    } else if (paletteMode === 4) {
        // tie-dye: sinusoidal hue/sat/val variations
        const h = (0.5 + 0.5 * Math.sin(id * 2.399)) % 1;
        const s = Math.min(1, Math.max(0, 0.70 + 0.30 * Math.sin(id * 1.113 + 1.0)));
        const v = Math.min(1, Math.max(0, 0.90 + 0.10 * Math.sin(id * 0.713 + 2.0)));
        return hsv2rgbJS((h + 1) % 1, s, v);
    } else if (paletteMode === 5) {
        // sunset palette (16 colors, randomized)
        const pal = [
            [246, 215, 165], [238, 212, 171], [238, 175, 97], [240, 160, 110],
            [251, 144, 98], [250, 123, 94], [242, 106, 102], [238, 93, 108],
            [216, 84, 135], [206, 73, 147], [182, 57, 169], [143, 31, 164],
            [106, 13, 131], [79, 2, 112], [58, 0, 91], [30, 0, 63]
        ];
        const fract = (x) => x - Math.floor(x);
        const k = Math.floor(fract(Math.sin(id * 12.9898) * 43758.5453) * pal.length);
        const c = pal[k];
        return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
    } else {
        // UC colors: alternate UC blue & gold
        const blue = [0, 51, 98];
        const gold = [253, 181, 21];
        const c = (id % 2 === 0) ? blue : gold;
        return `rgb(${c[0]}, ${c[1]}, ${c[2]})`;
    }
}
