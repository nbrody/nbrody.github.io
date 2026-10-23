/**
 * tiles.js — Lomonaco–Kauffman knot mosaic tile definitions
 * 
 * Each tile encodes which sides (N, E, S, W) have connection points
 * and how strands are routed internally.
 * 
 * Tile coordinates: (x, y) is the top-left corner, size is the cell side.
 * Connection points are at midpoints of each edge:
 *   N: (x + size/2, y)
 *   E: (x + size, y + size/2)
 *   S: (x + size/2, y + size)
 *   W: (x, y + size/2)
 */

const TILE_TYPES = [
    {
        id: 'blank',
        name: 'Blank',
        connections: { N: false, E: false, S: false, W: false },
        draw(ctx, x, y, size, color, lw) {
            // Nothing to draw
        }
    },
    {
        id: 'horizontal',
        name: '─',
        connections: { N: false, E: true, S: false, W: true },
        draw(ctx, x, y, size, color, lw) {
            const mid = size / 2;
            ctx.beginPath();
            ctx.moveTo(x, y + mid);
            ctx.lineTo(x + size, y + mid);
            ctx.strokeStyle = color;
            ctx.lineWidth = lw;
            ctx.lineCap = 'round';
            ctx.stroke();
        }
    },
    {
        id: 'vertical',
        name: '│',
        connections: { N: true, E: false, S: true, W: false },
        draw(ctx, x, y, size, color, lw) {
            const mid = size / 2;
            ctx.beginPath();
            ctx.moveTo(x + mid, y);
            ctx.lineTo(x + mid, y + size);
            ctx.strokeStyle = color;
            ctx.lineWidth = lw;
            ctx.lineCap = 'round';
            ctx.stroke();
        }
    },
    {
        id: 'arc_ne',
        name: '╮',
        connections: { N: true, E: true, S: false, W: false },
        draw(ctx, x, y, size, color, lw) {
            // Arc from N midpoint to E midpoint, centered at top-right corner
            const mid = size / 2;
            ctx.beginPath();
            ctx.arc(x + size, y, mid, Math.PI * 0.5, Math.PI, false);
            ctx.strokeStyle = color;
            ctx.lineWidth = lw;
            ctx.lineCap = 'round';
            ctx.stroke();
        }
    },
    {
        id: 'arc_nw',
        name: '╭',
        connections: { N: true, E: false, S: false, W: true },
        draw(ctx, x, y, size, color, lw) {
            // Arc from N midpoint to W midpoint, centered at top-left corner
            const mid = size / 2;
            ctx.beginPath();
            ctx.arc(x, y, mid, 0, Math.PI * 0.5, false);
            ctx.strokeStyle = color;
            ctx.lineWidth = lw;
            ctx.lineCap = 'round';
            ctx.stroke();
        }
    },
    {
        id: 'arc_se',
        name: '╯',
        connections: { N: false, E: true, S: true, W: false },
        draw(ctx, x, y, size, color, lw) {
            // Arc from S midpoint to E midpoint, centered at bottom-right corner
            const mid = size / 2;
            ctx.beginPath();
            ctx.arc(x + size, y + size, mid, Math.PI, Math.PI * 1.5, false);
            ctx.strokeStyle = color;
            ctx.lineWidth = lw;
            ctx.lineCap = 'round';
            ctx.stroke();
        }
    },
    {
        id: 'arc_sw',
        name: '╰',
        connections: { N: false, E: false, S: true, W: true },
        draw(ctx, x, y, size, color, lw) {
            // Arc from S midpoint to W midpoint, centered at bottom-left corner
            const mid = size / 2;
            ctx.beginPath();
            ctx.arc(x, y + size, mid, Math.PI * 1.5, Math.PI * 2, false);
            ctx.strokeStyle = color;
            ctx.lineWidth = lw;
            ctx.lineCap = 'round';
            ctx.stroke();
        }
    },
    {
        id: 'cross_pos',
        name: '⊕',
        connections: { N: true, E: true, S: true, W: true },
        crossType: 'positive', // horizontal over vertical
        draw(ctx, x, y, size, color, lw, bgColor) {
            const mid = size / 2;
            const gap = lw * 2;
            const bg = bgColor || '#0a0e1a';

            // Draw vertical strand (goes under)
            ctx.beginPath();
            ctx.moveTo(x + mid, y);
            ctx.lineTo(x + mid, y + size);
            ctx.strokeStyle = color;
            ctx.lineWidth = lw;
            ctx.lineCap = 'round';
            ctx.stroke();

            // Erase gap for horizontal overpass
            ctx.beginPath();
            ctx.moveTo(x + mid - gap, y + mid);
            ctx.lineTo(x + mid + gap, y + mid);
            ctx.strokeStyle = bg;
            ctx.lineWidth = lw + 4;
            ctx.lineCap = 'butt';
            ctx.stroke();

            // Draw horizontal strand (goes over)
            ctx.beginPath();
            ctx.moveTo(x, y + mid);
            ctx.lineTo(x + size, y + mid);
            ctx.strokeStyle = color;
            ctx.lineWidth = lw;
            ctx.lineCap = 'round';
            ctx.stroke();
        }
    },
    {
        id: 'cross_neg',
        name: '⊖',
        connections: { N: true, E: true, S: true, W: true },
        crossType: 'negative', // vertical over horizontal
        draw(ctx, x, y, size, color, lw, bgColor) {
            const mid = size / 2;
            const gap = lw * 2;
            const bg = bgColor || '#0a0e1a';

            // Draw horizontal strand (goes under)
            ctx.beginPath();
            ctx.moveTo(x, y + mid);
            ctx.lineTo(x + size, y + mid);
            ctx.strokeStyle = color;
            ctx.lineWidth = lw;
            ctx.lineCap = 'round';
            ctx.stroke();

            // Erase gap for vertical overpass
            ctx.beginPath();
            ctx.moveTo(x + mid, y + mid - gap);
            ctx.lineTo(x + mid, y + mid + gap);
            ctx.strokeStyle = bg;
            ctx.lineWidth = lw + 4;
            ctx.lineCap = 'butt';
            ctx.stroke();

            // Draw vertical strand (goes over)
            ctx.beginPath();
            ctx.moveTo(x + mid, y);
            ctx.lineTo(x + mid, y + size);
            ctx.strokeStyle = color;
            ctx.lineWidth = lw;
            ctx.lineCap = 'round';
            ctx.stroke();
        }
    },
    {
        id: 'double_arc_nesw',
        name: '⟋',
        connections: { N: true, E: true, S: true, W: true },
        draw(ctx, x, y, size, color, lw) {
            const mid = size / 2;
            // NE arc: connects N to E, center at top-right corner
            ctx.beginPath();
            ctx.arc(x + size, y, mid, Math.PI * 0.5, Math.PI, false);
            ctx.strokeStyle = color;
            ctx.lineWidth = lw;
            ctx.lineCap = 'round';
            ctx.stroke();
            // SW arc: connects S to W, center at bottom-left corner
            ctx.beginPath();
            ctx.arc(x, y + size, mid, Math.PI * 1.5, Math.PI * 2, false);
            ctx.strokeStyle = color;
            ctx.lineWidth = lw;
            ctx.lineCap = 'round';
            ctx.stroke();
        }
    },
    {
        id: 'double_arc_nwse',
        name: '⟍',
        connections: { N: true, E: true, S: true, W: true },
        draw(ctx, x, y, size, color, lw) {
            const mid = size / 2;
            // NW arc: connects N to W, center at top-left corner
            ctx.beginPath();
            ctx.arc(x, y, mid, 0, Math.PI * 0.5, false);
            ctx.strokeStyle = color;
            ctx.lineWidth = lw;
            ctx.lineCap = 'round';
            ctx.stroke();
            // SE arc: connects S to E, center at bottom-right corner
            ctx.beginPath();
            ctx.arc(x + size, y + size, mid, Math.PI, Math.PI * 1.5, false);
            ctx.strokeStyle = color;
            ctx.lineWidth = lw;
            ctx.lineCap = 'round';
            ctx.stroke();
        }
    },
    {
        id: 'cross_virtual',
        name: '⊗',
        connections: { N: true, E: true, S: true, W: true },
        crossType: 'virtual', // no over/under information — a virtual crossing
        draw(ctx, x, y, size, color, lw, bgColor) {
            const mid = size / 2;
            const r = size * 0.16;

            // Both strands drawn fully — neither passes over the other.
            ctx.beginPath();
            ctx.moveTo(x + mid, y);
            ctx.lineTo(x + mid, y + size);
            ctx.strokeStyle = color;
            ctx.lineWidth = lw;
            ctx.lineCap = 'round';
            ctx.stroke();

            ctx.beginPath();
            ctx.moveTo(x, y + mid);
            ctx.lineTo(x + size, y + mid);
            ctx.strokeStyle = color;
            ctx.lineWidth = lw;
            ctx.lineCap = 'round';
            ctx.stroke();

            // Small circle around the intersection — standard virtual
            // crossing notation (Kauffman).
            ctx.beginPath();
            ctx.arc(x + mid, y + mid, r, 0, Math.PI * 2);
            ctx.strokeStyle = color;
            ctx.lineWidth = Math.max(1, lw * 0.75);
            ctx.stroke();
        }
    }
];

/**
 * Draw a tile into a canvas context.
 */
function drawTile(ctx, tileIndex, x, y, size, color, lw, bgColor) {
    if (tileIndex >= 0 && tileIndex < TILE_TYPES.length) {
        TILE_TYPES[tileIndex].draw(ctx, x, y, size, color, lw, bgColor);
    }
}

/**
 * Draw a rectangular block of tiles in four strokes instead of one per tile,
 * so grids with tens of thousands of cells stay interactive. Same picture as
 * calling drawTile on each cell: every strand, then the gaps under crossings
 * (which never leave their cell), then the over-strands, then the virtual
 * crossing circles.
 *
 *   tileAt(r, c) → tile index; rows r0..r1-1 and columns c0..c1-1 are drawn,
 *   cell (r, c) having its top-left corner at (ox + c·size, oy + r·size).
 */
function drawTilesBatched(ctx, tileAt, r0, r1, c0, c1, ox, oy, size, color, lw, bgColor) {
    const strands = new Path2D(), gaps = new Path2D(), overs = new Path2D(), rings = new Path2D();
    const mid = size / 2, gap = lw * 2, ring = size * 0.16;
    const H = (p, x, y) => { p.moveTo(x, y + mid); p.lineTo(x + size, y + mid); };
    const V = (p, x, y) => { p.moveTo(x + mid, y); p.lineTo(x + mid, y + size); };
    // Quarter arc of radius size/2 about the corner (cx, cy), from angle a0 to a1.
    const A = (cx, cy, a0, a1) => {
        strands.moveTo(cx + mid * Math.cos(a0), cy + mid * Math.sin(a0));
        strands.arc(cx, cy, mid, a0, a1, false);
    };
    const PI = Math.PI;
    let any = false, anyGap = false, anyRing = false;
    for (let r = r0; r < r1; r++) {
        const y = oy + r * size;
        for (let c = c0; c < c1; c++) {
            const t = tileAt(r, c);
            if (!(t > 0)) continue;
            const x = ox + c * size;
            any = true;
            switch (t) {
                case 1: H(strands, x, y); break;
                case 2: V(strands, x, y); break;
                case 3: A(x + size, y, PI * 0.5, PI); break;
                case 4: A(x, y, 0, PI * 0.5); break;
                case 5: A(x + size, y + size, PI, PI * 1.5); break;
                case 6: A(x, y + size, PI * 1.5, PI * 2); break;
                case 7:
                    V(strands, x, y);
                    gaps.moveTo(x + mid - gap, y + mid); gaps.lineTo(x + mid + gap, y + mid);
                    H(overs, x, y); anyGap = true; break;
                case 8:
                    H(strands, x, y);
                    gaps.moveTo(x + mid, y + mid - gap); gaps.lineTo(x + mid, y + mid + gap);
                    V(overs, x, y); anyGap = true; break;
                case 9: A(x + size, y, PI * 0.5, PI); A(x, y + size, PI * 1.5, PI * 2); break;
                case 10: A(x, y, 0, PI * 0.5); A(x + size, y + size, PI, PI * 1.5); break;
                case 11:
                    V(strands, x, y); H(strands, x, y);
                    rings.moveTo(x + mid + ring, y + mid);
                    rings.arc(x + mid, y + mid, ring, 0, PI * 2);
                    anyRing = true; break;
            }
        }
    }
    if (!any) return;
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = lw;
    ctx.lineCap = 'round';
    ctx.stroke(strands);
    if (anyGap) {
        ctx.strokeStyle = bgColor || '#0a0e1a';
        ctx.lineWidth = lw + 4;
        ctx.lineCap = 'butt';
        ctx.stroke(gaps);
        ctx.strokeStyle = color;
        ctx.lineWidth = lw;
        ctx.lineCap = 'round';
        ctx.stroke(overs);
    }
    if (anyRing) {
        ctx.lineWidth = Math.max(1, lw * 0.75);
        ctx.stroke(rings);
    }
    ctx.restore();
}

/**
 * Check if two adjacent tiles have matching connections.
 */
function connectionsMatch(tileA, tileB, sideFromA) {
    if (tileA < 0 || tileB < 0) return true;
    const oppositeSide = { N: 'S', S: 'N', E: 'W', W: 'E' };
    const a = TILE_TYPES[tileA];
    const b = TILE_TYPES[tileB];
    if (!a || !b) return true;
    return a.connections[sideFromA] === b.connections[oppositeSide[sideFromA]];
}

/**
 * 90° rotation maps.
 * Under CW rotation, connections transform: N→E, E→S, S→W, W→N
 *   blank(0) → blank(0)
 *   horizontal(1) ↔ vertical(2)
 *   arc_ne(3) → arc_se(5) → arc_sw(6) → arc_nw(4) → arc_ne(3)
 *   cross_pos(7) ↔ cross_neg(8)
 *   double_arc_nesw(9) ↔ double_arc_nwse(10)
 *   cross_virtual(11) → cross_virtual(11)
 */
const ROTATE_CW = [0, 2, 1, 5, 3, 6, 4, 8, 7, 10, 9, 11];
const ROTATE_CCW = [0, 2, 1, 4, 6, 3, 5, 8, 7, 10, 9, 11];

function rotateTileCW(tileIndex) {
    return (tileIndex >= 0 && tileIndex < ROTATE_CW.length) ? ROTATE_CW[tileIndex] : tileIndex;
}

function rotateTileCCW(tileIndex) {
    return (tileIndex >= 0 && tileIndex < ROTATE_CCW.length) ? ROTATE_CCW[tileIndex] : tileIndex;
}
