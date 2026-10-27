// linking.js — the linking number of two closed polygons in R³ (points as [x, y, z] or {x, y, z}).
//
// Project along a generic direction d, viewed from +d (the larger p·d is nearer). A crossing is
// positive when (over direction × under direction)·d > 0 (the right-handed crossing), and the
// linking number is half the sum of the signs of the crossings between the two polygons.

const D = (() => { const v = [0.3137, 0.8123, 0.4919]; const n = Math.hypot(...v); return v.map((x) => x / n); })();
const E1 = (() => { const v = [1 - D[0] * D[0], -D[0] * D[1], -D[0] * D[2]]; const n = Math.hypot(...v); return v.map((x) => x / n); })();
const E2 = [D[1] * E1[2] - D[2] * E1[1], D[2] * E1[0] - D[0] * E1[2], D[0] * E1[1] - D[1] * E1[0]];   // d × e1

const arr = (p) => (Array.isArray(p) ? p : [p.x, p.y, p.z]);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const project = (p) => { const q = arr(p); return [dot(q, E1), dot(q, E2), dot(q, D)]; };

export function linkingNumber(A, B) {
    const PA = A.map(project), PB = B.map(project);
    let sum = 0;
    for (let i = 0; i < PA.length; i++) {
        const a0 = PA[i], a1 = PA[(i + 1) % PA.length];
        const r = [a1[0] - a0[0], a1[1] - a0[1]];
        const minx = Math.min(a0[0], a1[0]), maxx = Math.max(a0[0], a1[0]);
        const miny = Math.min(a0[1], a1[1]), maxy = Math.max(a0[1], a1[1]);
        for (let j = 0; j < PB.length; j++) {
            const b0 = PB[j], b1 = PB[(j + 1) % PB.length];
            if (Math.max(b0[0], b1[0]) < minx || Math.min(b0[0], b1[0]) > maxx) continue;
            if (Math.max(b0[1], b1[1]) < miny || Math.min(b0[1], b1[1]) > maxy) continue;
            const s = [b1[0] - b0[0], b1[1] - b0[1]];
            const den = r[0] * s[1] - r[1] * s[0];
            if (den === 0) continue;
            const w = [b0[0] - a0[0], b0[1] - a0[1]];
            const t = (w[0] * s[1] - w[1] * s[0]) / den;
            const u = (w[0] * r[1] - w[1] * r[0]) / den;
            if (t < 0 || t >= 1 || u < 0 || u >= 1) continue;
            const za = a0[2] + t * (a1[2] - a0[2]), zb = b0[2] + u * (b1[2] - b0[2]);
            // A over: sign(r × s); B over: sign(s × r)
            sum += (za > zb ? 1 : -1) * Math.sign(den);
        }
    }
    return sum / 2;
}
