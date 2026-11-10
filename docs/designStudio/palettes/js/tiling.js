// A {p,q} tiling of the Poincaré disk, built once by reflecting the central
// polygon across its sides, and painted with any palette. Tiles carry the
// side of the central polygon they grew from (a sector) and their distance
// from the center in tiles (a depth); the color of a tile is a function of
// the two, so the pattern reads as rings of the palette.

const cAdd = (a, b) => [a[0] + b[0], a[1] + b[1]];
const cSub = (a, b) => [a[0] - b[0], a[1] - b[1]];
const abs2 = (a) => a[0] * a[0] + a[1] * a[1];

/** Center and radius of the circle through three points. */
function circumcircle(a, b, c) {
    const d = 2 * (a[0] * (b[1] - c[1]) + b[0] * (c[1] - a[1]) + c[0] * (a[1] - b[1]));
    if (Math.abs(d) < 1e-12) return null;
    const ux = (abs2(a) * (b[1] - c[1]) + abs2(b) * (c[1] - a[1]) + abs2(c) * (a[1] - b[1])) / d;
    const uy = (abs2(a) * (c[0] - b[0]) + abs2(b) * (a[0] - c[0]) + abs2(c) * (b[0] - a[0])) / d;
    return { c: [ux, uy], r: Math.hypot(a[0] - ux, a[1] - uy) };
}

/** The geodesic through a and b: a circle orthogonal to the unit circle, or a diameter (null). */
function geodesic(a, b) {
    const inv = abs2(a) > 1e-9 ? [a[0] / abs2(a), a[1] / abs2(a)] : null;
    if (!inv) return null;
    const cc = circumcircle(a, b, inv);
    if (!cc || cc.r > 1e5) return null;
    return cc;
}

function reflect(z, g, a, b) {
    if (!g) {
        // reflection in the line through a and b (a diameter)
        const d = cSub(b, a), t = ((z[0] - a[0]) * d[0] + (z[1] - a[1]) * d[1]) / abs2(d);
        const foot = cAdd(a, [d[0] * t, d[1] * t]);
        return [2 * foot[0] - z[0], 2 * foot[1] - z[1]];
    }
    const w = cSub(z, g.c), k = (g.r * g.r) / abs2(w);
    return [g.c[0] + w[0] * k, g.c[1] + w[1] * k];
}

/** Points along the geodesic segment from a to b (excluding b). */
function arc(a, b, steps) {
    const g = geodesic(a, b);
    const out = [];
    if (!g) {
        for (let i = 0; i < steps; i++) out.push([a[0] + (b[0] - a[0]) * i / steps, a[1] + (b[1] - a[1]) * i / steps]);
        return out;
    }
    let t0 = Math.atan2(a[1] - g.c[1], a[0] - g.c[0]), t1 = Math.atan2(b[1] - g.c[1], b[0] - g.c[0]);
    let dt = t1 - t0;
    while (dt > Math.PI) dt -= 2 * Math.PI;
    while (dt < -Math.PI) dt += 2 * Math.PI;
    for (let i = 0; i < steps; i++) {
        const t = t0 + dt * i / steps;
        out.push([g.c[0] + g.r * Math.cos(t), g.c[1] + g.r * Math.sin(t)]);
    }
    return out;
}

export function buildTiling(p = 7, q = 3, { maxTiles = 2600, minSize = 0.006 } = {}) {
    const R = Math.acosh(1 / (Math.tan(Math.PI / p) * Math.tan(Math.PI / q)));
    const r0 = Math.tanh(R / 2);
    const rot = Math.PI / 2 + Math.PI / p;
    const center = Array.from({ length: p }, (_, k) => [r0 * Math.cos(rot + 2 * Math.PI * k / p), r0 * Math.sin(rot + 2 * Math.PI * k / p)]);
    const tiles = [{ verts: center, sector: -1, depth: 0, side: -1 }];
    const key = (vs) => {
        const cx = vs.reduce((s, v) => s + v[0], 0) / vs.length, cy = vs.reduce((s, v) => s + v[1], 0) / vs.length;
        return `${Math.round(cx * 1e5)},${Math.round(cy * 1e5)}`;
    };
    const seen = new Set([key(center)]);
    for (let i = 0; i < tiles.length && tiles.length < maxTiles; i++) {
        const T = tiles[i];
        for (let s = 0; s < p; s++) {
            const a = T.verts[s], b = T.verts[(s + 1) % p];
            if (Math.hypot(a[0] - b[0], a[1] - b[1]) < minSize) continue;
            const g = geodesic(a, b);
            const verts = T.verts.map((z) => reflect(z, g, a, b));
            const k = key(verts);
            if (seen.has(k)) continue;
            seen.add(k);
            tiles.push({ verts, sector: T.depth === 0 ? s : T.sector, depth: T.depth + 1, side: s });
        }
    }
    // outlines as polylines along the arcs, scaled to the unit disk
    for (const T of tiles) {
        const size = Math.max(...T.verts.map((v) => Math.hypot(v[0] - T.verts[0][0], v[1] - T.verts[0][1])));
        const steps = size > 0.2 ? 10 : size > 0.05 ? 5 : 2;
        const pts = [];
        for (let s = 0; s < p; s++) pts.push(...arc(T.verts[s], T.verts[(s + 1) % p], steps));
        T.path = Float32Array.from(pts.flat());
    }
    return { p, q, tiles };
}

/** Which palette color a tile takes. */
export function tileColorIndex(T, n, p) {
    if (T.depth === 0) return 0;
    return (1 + T.sector + (T.depth - 1) * Math.max(1, Math.round(p / 2))) % n;
}

/**
 * Paint the tiling into a 2D context filling (x, y, size). Tiles fade toward
 * the background near the rim, as faces recede toward the sphere at infinity.
 */
export function paintTiling(ctx, tiling, colors, { x = 0, y = 0, size, bg = '#ffffff', gap = 1 } = {}) {
    const n = colors.length, r = size / 2, cx = x + r, cy = y + r;
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, 2 * Math.PI);
    ctx.clip();
    for (const T of tiling.tiles) {
        const P = T.path;
        ctx.beginPath();
        ctx.moveTo(cx + P[0] * r, cy - P[1] * r);
        for (let i = 2; i < P.length; i += 2) ctx.lineTo(cx + P[i] * r, cy - P[i + 1] * r);
        ctx.closePath();
        ctx.fillStyle = colors[tileColorIndex(T, n, tiling.p)];
        ctx.fill();
        if (gap > 0) {
            ctx.lineWidth = gap;
            ctx.strokeStyle = bg;
            ctx.stroke();
        }
    }
    // the rim: a soft fade into the page
    const g = ctx.createRadialGradient(cx, cy, r * 0.62, cx, cy, r);
    g.addColorStop(0, hexA(bg, 0));
    g.addColorStop(1, hexA(bg, 0.85));
    ctx.fillStyle = g;
    ctx.fillRect(x, y, size, size);
    ctx.restore();
}

function hexA(hex, a) {
    const n = parseInt(hex.slice(1), 16);
    return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
