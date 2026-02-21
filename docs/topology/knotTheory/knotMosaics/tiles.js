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
 */
const ROTATE_CW = [0, 2, 1, 5, 3, 6, 4, 8, 7, 10, 9];
const ROTATE_CCW = [0, 2, 1, 4, 6, 3, 5, 8, 7, 10, 9];

function rotateTileCW(tileIndex) {
    return (tileIndex >= 0 && tileIndex < ROTATE_CW.length) ? ROTATE_CW[tileIndex] : tileIndex;
}

function rotateTileCCW(tileIndex) {
    return (tileIndex >= 0 && tileIndex < ROTATE_CCW.length) ? ROTATE_CCW[tileIndex] : tileIndex;
}
