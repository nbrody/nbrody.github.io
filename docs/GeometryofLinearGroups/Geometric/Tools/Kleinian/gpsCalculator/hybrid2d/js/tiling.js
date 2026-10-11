// tiling.js — tile a half-plane by BFS reflection of a chamber.
//
// Σ is the real axis.  Since Σ is a mirror of the group, no tile straddles
// it: reflected copies whose centroid crosses to the wrong side are simply
// rejected, and what remains is exactly the tiling of the half-plane — one
// GPS "piece" seen in the universal cover.
//
// Each tile carries the transported images of all chamber walls, so BFS
// reflects tiles across their own faces (geometrically local, good coverage).

import { reflect, reflectWall, centroid } from './geometry.js';

export function tileHalfPlane(chamber, opts = {}) {
    const depth = opts.depth ?? 6;
    const maxTiles = opts.maxTiles ?? 4500;
    const minSize = opts.minSize ?? 0.0022;
    const side = opts.side ?? 1;               // +1: upper half, −1: lower half

    const baseVerts = side === 1 ? chamber.verts : chamber.verts.map(v => [v[0], -v[1]]);
    const baseWalls = side === 1 ? chamber.walls : chamber.walls.map(mirrorWallX);

    const c0 = centroid(baseVerts);
    const root = { verts: baseVerts, walls: baseWalls, depth: 0, centroid: c0, size: tileSize(baseVerts) };
    const tiles = [root];
    const seen = new Set([key(c0)]);
    let frontier = [root];

    for (let d = 0; d < depth && tiles.length < maxTiles; d++) {
        const next = [];
        for (const tile of frontier) {
            if (tiles.length >= maxTiles) break;
            if (tile.size < minSize) continue;             // too small to matter
            for (const w of tile.walls) {
                const verts = tile.verts.map(v => reflect(w, v));
                const c = centroid(verts);
                if (c[1] * side < 1e-9) continue;          // crossed Σ
                const k = key(c);
                if (seen.has(k)) continue;
                seen.add(k);
                const child = {
                    verts,
                    walls: tile.walls.map(x => reflectWall(x, w)),
                    depth: d + 1,
                    centroid: c,
                    size: tileSize(verts),
                };
                tiles.push(child);
                next.push(child);
                if (tiles.length >= maxTiles) break;
            }
        }
        frontier = next;
        if (!frontier.length) break;
    }
    return tiles;
}

function mirrorWallX(w) {
    // conjugate a wall by (x,y) → (x,−y)
    const A = [w.A[0], -w.A[1]], B = [w.B[0], -w.B[1]];
    if (w.kind === 'diam') return { kind: 'diam', A, B, nx: w.nx, ny: -w.ny };
    return { kind: 'circ', A, B, cx: w.cx, cy: -w.cy, R2: w.R2, R: w.R };
}

function tileSize(verts) {
    let x0 = 1, x1 = -1, y0 = 1, y1 = -1;
    for (const v of verts) {
        if (v[0] < x0) x0 = v[0];
        if (v[0] > x1) x1 = v[0];
        if (v[1] < y0) y0 = v[1];
        if (v[1] > y1) y1 = v[1];
    }
    return Math.max(x1 - x0, y1 - y0);
}

function key(c) {
    return `${Math.round(c[0] * 12000)},${Math.round(c[1] * 12000)}`;
}
