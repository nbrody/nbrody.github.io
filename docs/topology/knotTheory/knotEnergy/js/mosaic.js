// Knot-mosaic input → 3D polygon for the energy minimiser.
//
// We use the Lomonaco–Kauffman 11-tile set, indexed 0..10:
//
//   0 blank        1 ─ horizontal     2 │ vertical
//   3 ╮ arc N–E    4 ╭ arc N–W
//   5 ╯ arc S–E    6 ╰ arc S–W
//   7 ⊕ crossing (horizontal OVER vertical)
//   8 ⊖ crossing (vertical OVER horizontal)
//   9 ⟋ NE-arc + SW-arc (no crossing)
//  10 ⟍ NW-arc + SE-arc (no crossing)
//
// `mosaicToPolygons(grid)` returns an Array of closed polygons (one per
// component); each polygon is an Array of THREE.Vector3.

(function () {
'use strict';

const TILE_NAMES   = ['blank','─','│','╮','╭','╯','╰','⊕','⊖','⟋','⟍'];
const TILE_COUNT   = 11;
const Z_LIFT       = 0.35;          // crossing height in tile units
const SAMP_LINE    = 4;
const SAMP_ARC     = 9;

const OPP      = { N:'S', S:'N', W:'E', E:'W' };
const NEIGHBOR = { N:[0,-1], S:[0,1], W:[-1,0], E:[1,0] };

// Sides each tile uses; the energy minimiser only cares about strand pieces.
// (Used by the editor to highlight mismatches.)
const TILE_SIDES = [
    { },                                 // 0 blank
    { W:true, E:true },                  // 1 horizontal
    { N:true, S:true },                  // 2 vertical
    { N:true, E:true },                  // 3 arc N–E
    { N:true, W:true },                  // 4 arc N–W
    { S:true, E:true },                  // 5 arc S–E
    { S:true, W:true },                  // 6 arc S–W
    { N:true, S:true, W:true, E:true },  // 7 cross_pos
    { N:true, S:true, W:true, E:true },  // 8 cross_neg
    { N:true, S:true, W:true, E:true },  // 9 dbl NE+SW
    { N:true, S:true, W:true, E:true },  //10 dbl NW+SE
];

// Side midpoint in world coords for cell (i,j). Mosaic coordinates use:
//   x = i + ux,    y = -(j + uy),    z = 0
// so the top-left tile sits at the top-left of the 3D scene.
function sideMid(i, j, side) {
    const ux = { N:0.5, S:0.5, W:0,   E:1   }[side];
    const uy = { N:0,   S:1,   W:0.5, E:0.5 }[side];
    return new THREE.Vector3(i + ux, -(j + uy), 0);
}

// Linear samples from a to b, with sin(πt)·zMag bump in z.
function lineSamples(a, b, n, zMag) {
    const out = [];
    for (let k = 0; k < n; k++) {
        const t = k / (n - 1);
        out.push(new THREE.Vector3(
            a.x + t * (b.x - a.x),
            a.y + t * (b.y - a.y),
            zMag * Math.sin(Math.PI * t),
        ));
    }
    return out;
}

// Quarter-circle samples around (cx, cy), radius 0.5, from angle θ₁ to θ₂.
function arcSamples(cx, cy, theta1, theta2, n) {
    const out = [];
    for (let k = 0; k < n; k++) {
        const t = k / (n - 1);
        const th = theta1 + t * (theta2 - theta1);
        out.push(new THREE.Vector3(
            cx + 0.5 * Math.cos(th),
            cy + 0.5 * Math.sin(th),
            0,
        ));
    }
    return out;
}

// Strand pieces (sides + sampled curve in world coords) for tile t at (i,j).
// Each piece records `sides:[a,b]` and a `points` list going a → b.
function makePieces(t, i, j) {
    const N = sideMid(i, j, 'N'), S = sideMid(i, j, 'S'),
          W = sideMid(i, j, 'W'), E = sideMid(i, j, 'E');
    switch (t) {
        case 0: return [];
        case 1: return [{ sides:['W','E'], points: lineSamples(W, E, SAMP_LINE, 0) }];
        case 2: return [{ sides:['N','S'], points: lineSamples(N, S, SAMP_LINE, 0) }];
        case 3: return [{ sides:['N','E'], points: arcSamples(i+1, -j,         Math.PI,    1.5*Math.PI, SAMP_ARC) }];
        case 4: return [{ sides:['N','W'], points: arcSamples(i,   -j,         0,         -0.5*Math.PI, SAMP_ARC) }];
        case 5: return [{ sides:['S','E'], points: arcSamples(i+1, -(j+1),     Math.PI,    0.5*Math.PI, SAMP_ARC) }];
        case 6: return [{ sides:['S','W'], points: arcSamples(i,   -(j+1),     0,          0.5*Math.PI, SAMP_ARC) }];
        case 7: return [
            { sides:['W','E'], points: lineSamples(W, E, SAMP_LINE, +Z_LIFT) },  // horiz OVER
            { sides:['N','S'], points: lineSamples(N, S, SAMP_LINE, -Z_LIFT) },  // vert UNDER
        ];
        case 8: return [
            { sides:['N','S'], points: lineSamples(N, S, SAMP_LINE, +Z_LIFT) },  // vert OVER
            { sides:['W','E'], points: lineSamples(W, E, SAMP_LINE, -Z_LIFT) },  // horiz UNDER
        ];
        case 9: return [
            { sides:['N','E'], points: arcSamples(i+1, -j,         Math.PI,    1.5*Math.PI, SAMP_ARC) },
            { sides:['S','W'], points: arcSamples(i,   -(j+1),     0,          0.5*Math.PI, SAMP_ARC) },
        ];
        case 10: return [
            { sides:['N','W'], points: arcSamples(i,   -j,         0,         -0.5*Math.PI, SAMP_ARC) },
            { sides:['S','E'], points: arcSamples(i+1, -(j+1),     Math.PI,    0.5*Math.PI, SAMP_ARC) },
        ];
    }
    return [];
}

// Walk the mosaic and return one polygon per closed loop component.
// `grid` is grid[j][i] = tileIndex with grid.length = H, grid[0].length = W.
function mosaicToPolygons(grid) {
    const H = grid.length;
    if (H === 0) throw new Error('Empty mosaic');
    const W = grid[0].length;

    const pieces = [];                              // { sides, points, i, j }
    const lookup = new Map();                       // "i|j|side" → { idx, end }
    for (let j = 0; j < H; j++) {
        for (let i = 0; i < W; i++) {
            for (const piece of makePieces(grid[j][i], i, j)) {
                const idx = pieces.length;
                pieces.push({ ...piece, i, j });
                lookup.set(`${i}|${j}|${piece.sides[0]}`, { idx, end: 0 });
                lookup.set(`${i}|${j}|${piece.sides[1]}`, { idx, end: 1 });
            }
        }
    }
    if (pieces.length === 0) throw new Error('Mosaic is empty — place some tiles');

    const visited = new Array(pieces.length).fill(false);
    const loops = [];
    for (let s = 0; s < pieces.length; s++) {
        if (visited[s]) continue;
        const loop = [];
        let curIdx = s, entryEnd = 0;
        while (!visited[curIdx]) {
            visited[curIdx] = true;
            const p = pieces[curIdx];
            const exitEnd = 1 - entryEnd;
            const pts = (entryEnd === 0) ? p.points
                                          : [...p.points].reverse();
            // Skip the first point on subsequent pieces — it's a duplicate
            // of the previous piece's last point.
            const startK = loop.length === 0 ? 0 : 1;
            for (let k = startK; k < pts.length; k++) loop.push(pts[k]);

            const exitSide = p.sides[exitEnd];
            const [dx, dy] = NEIGHBOR[exitSide];
            const ni = p.i + dx, nj = p.j + dy;
            if (ni < 0 || nj < 0 || ni >= W || nj >= H) {
                throw new Error(
                    `Strand at tile (${p.i},${p.j}) exits the grid through side ${exitSide}.`);
            }
            const next = lookup.get(`${ni}|${nj}|${OPP[exitSide]}`);
            if (!next) {
                throw new Error(
                    `Connection mismatch: tile (${p.i},${p.j}) side ${exitSide} ` +
                    `meets tile (${ni},${nj}) which has no strand on side ${OPP[exitSide]}.`);
            }
            curIdx = next.idx;
            entryEnd = next.end;
        }
        // Drop the trailing duplicate of the closing point, if any.
        if (loop.length > 1 && loop[0].distanceTo(loop[loop.length - 1]) < 1e-6) {
            loop.pop();
        }
        loops.push(loop);
    }
    return loops;
}

// Detect mismatched edges: returns a Set of "i|j|side" strings where a
// tile has a strand entering an edge but the neighbour doesn't (or vice
// versa). Used by the editor to flag issues before the user clicks Build.
function findMismatches(grid) {
    const H = grid.length, W = grid[0].length;
    const out = new Set();
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        const sides = TILE_SIDES[grid[j][i]] || {};
        for (const side of ['N', 'S', 'W', 'E']) {
            const here = !!sides[side];
            const [dx, dy] = NEIGHBOR[side];
            const ni = i + dx, nj = j + dy;
            const there = (ni >= 0 && nj >= 0 && ni < W && nj < H)
                ? !!(TILE_SIDES[grid[nj][ni]] || {})[OPP[side]]
                : false;
            if (here && !there) out.add(`${i}|${j}|${side}`);
        }
    }
    return out;
}

// Render a tile into a 2D canvas context. `size` is the cell size in pixels.
// Strands draw in `color`; over/under crossings use `bg` to break the under
// strand. `lw` is the stroke width.
function drawTile(ctx, t, x, y, size, color, lw, bg) {
    bg = bg || '#0a0e1a';
    const m = size / 2;
    ctx.lineCap = 'round';
    ctx.lineWidth = lw;
    ctx.strokeStyle = color;

    function line(ax, ay, bx, by) {
        ctx.beginPath();
        ctx.moveTo(x + ax, y + ay);
        ctx.lineTo(x + bx, y + by);
        ctx.stroke();
    }
    function arc(cx, cy, a1, a2) {
        ctx.beginPath();
        ctx.arc(x + cx, y + cy, m, a1, a2);
        ctx.stroke();
    }
    switch (t) {
        case 0: return;
        case 1: line(0, m, size, m); return;
        case 2: line(m, 0, m, size); return;
        case 3: arc(size, 0,         Math.PI*0.5, Math.PI);     return;  // N–E
        case 4: arc(0,    0,         0,           Math.PI*0.5); return;  // N–W
        case 5: arc(size, size,      Math.PI,     Math.PI*1.5); return;  // S–E
        case 6: arc(0,    size,      Math.PI*1.5, Math.PI*2);   return;  // S–W
        case 7: { // horizontal OVER vertical
            line(m, 0, m, size);                 // vertical (under, drawn first)
            ctx.strokeStyle = bg;
            ctx.lineWidth   = lw + 4;
            line(m - lw, m, m + lw, m);          // erase gap
            ctx.strokeStyle = color;
            ctx.lineWidth   = lw;
            line(0, m, size, m);                 // horizontal (over)
            return;
        }
        case 8: { // vertical OVER horizontal
            line(0, m, size, m);
            ctx.strokeStyle = bg;
            ctx.lineWidth   = lw + 4;
            line(m, m - lw, m, m + lw);
            ctx.strokeStyle = color;
            ctx.lineWidth   = lw;
            line(m, 0, m, size);
            return;
        }
        case 9:  // NE arc + SW arc
            arc(size, 0,    Math.PI*0.5, Math.PI);
            arc(0,    size, Math.PI*1.5, Math.PI*2);
            return;
        case 10: // NW arc + SE arc
            arc(0,    0,    0,           Math.PI*0.5);
            arc(size, size, Math.PI,     Math.PI*1.5);
            return;
    }
}

window.KnotMosaic = {
    TILE_NAMES, TILE_COUNT, TILE_SIDES,
    mosaicToPolygons, findMismatches, drawTile,
};

})();
