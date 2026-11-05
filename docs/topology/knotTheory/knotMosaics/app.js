/**
 * app.js — Knot Mosaic Playground
 *
 * Supports three surface types:
 *   - Disk: simple n×n grid, strands must not exit the boundary
 *   - Sphere: cube polyhedral net with m×m subdivisions per face
 *   - Torus: n×n grid with periodic (wrap-around) boundary conditions
 *
 * Features: drag-and-drop tiles, zoom & pan, mismatch highlighting, export
 */

// ============================================================
// State
// ============================================================
const state = {
    surface: 'disk',
    gridSize: 5,
    faceSize: 3,
    grid: null,
    grid: null,
    selectedTile: 0,
    strandColor: '#6c8aff',
    strandWidth: 3,
    showGrid: true,
    showMismatches: true,
    bgMode: 'black',

    // pan/zoom
    pan: { x: 0, y: 0 },
    zoom: 1,

    // interaction
    isPainting: false,
    lastMouse: null,
    dragFrom: null,     // last pointer position of a paint/draw drag
    dragTile: 0,
    ghostEl: null,
    selectedCells: [],  // [{row, col}, ...] or [{face, row, col}, ...]

    // strand drawing (✏️ Draw mode)
    drawMode: false,
    isDrawing: false,
    stroke: null,       // { cells:[...], startExit, prevEntry }
};

// ============================================================
// DOM refs
// ============================================================
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const hudInfo = document.getElementById('hud-info');
const paletteTiles = document.getElementById('palette-tiles');

// ============================================================
// Canvas sizing
// ============================================================
function resizeCanvas() {
    const dpr = window.devicePixelRatio || 1;
    canvas.width = window.innerWidth * dpr;
    canvas.height = window.innerHeight * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    render();
}
window.addEventListener('resize', resizeCanvas);

function isSameCell(c1, c2) {
    if (!c1 || !c2) return false;
    return c1.row === c2.row && c1.col === c2.col && c1.face === c2.face;
}

// ============================================================
// Grid management
// ============================================================
function initGrid() {
    if (state.surface === 'sphere') {
        state.grid = {};
        const faces = ['top', 'front', 'right', 'back', 'left', 'bottom'];
        faces.forEach(f => {
            state.grid[f] = [];
            for (let r = 0; r < state.faceSize; r++) {
                state.grid[f][r] = [];
                for (let c = 0; c < state.faceSize; c++) {
                    state.grid[f][r][c] = 0;
                }
            }
        });
    } else {
        state.grid = [];
        const n = state.gridSize;
        for (let r = 0; r < n; r++) {
            state.grid[r] = [];
            for (let c = 0; c < n; c++) {
                state.grid[r][c] = 0;
            }
        }
    }
}

// ============================================================
// Resizing keeps the drawing
//
// The old grid is centred in the new one, or cropped evenly when it
// shrinks. Strands that cross a glued edge are extended straight through
// the new margin so they still meet their partners. Where the gluing
// reverses the edge (Möbius, RP²) and the growth is odd, the two margins
// can't be equal, so the extension jogs one cell sideways in the first
// margin column (row) to land on its partner. Cropping by the same amount
// undoes a resize exactly, jog included. An odd shrink of a drawing that
// was not produced by that grow jogs the boundary exits that remain, so a
// closed curve sitting inside the kept window stays closed.
// ============================================================
const emptyGrid = (m) => Array.from({ length: m }, () => new Array(m).fill(0));

// Tile carrying the given side pairs ('EW', 'NS', 'EN', 'NW', 'ES', 'SW').
function tileForPairs(keys) {
    if (keys.length === 1) return PAIR_TILE[keys[0]];
    const both = [...keys].sort().join('+');
    return { 'EW+NS': 7, 'EN+SW': 9, 'ES+NW': 10 }[both] ?? PAIR_TILE[keys[0]];
}

function resizeFlatGrid(old, n, m, edge) {
    const grid = emptyGrid(m);
    if (m <= n) {
        const d = Math.floor((n - m) / 2);
        for (let r = 0; r < m; r++) for (let c = 0; c < m; c++) grid[r][c] = old[r + d][c + d];
        // An odd crop shifts a reversed gluing by one row (column): row r used
        // to meet n−1−r and now meets m−1−r, one off, even when the cropped
        // strip was empty. Step each straight boundary exit one cell toward
        // the low side so the strands that remain still meet. Skip when the
        // crop did not add mismatches — that is the inverse of an odd grow,
        // whose jog already lives in the strip this crop removes.
        if ((n - m) % 2 === 1 && (edge.reversedLR || edge.reversedTB) &&
            countMismatches(grid, edge) > countMismatches(old, edge)) {
            const jogged = jogOddShrink(grid, edge);
            if (countMismatches(jogged, edge) < countMismatches(grid, edge)) return jogged;
        }
        return grid;
    }
    const g = m - n, d = Math.floor(g / 2), jog = g % 2 === 1;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) grid[r + d][c + d] = old[r][c];

    const pairs = Array.from({ length: m }, () => Array.from({ length: m }, () => []));
    const add = (r, c, a, b) => pairs[r][c].push(sidePairKey(a, b));
    const exits = (r, c, side) => TILE_TYPES[old[r][c]]?.connections[side];

    if (edge.periodicLR || edge.reversedLR) {
        for (let r = 0; r < n; r++) {
            if (exits(r, 0, 'W')) for (let c = 0; c < d; c++) add(r + d, c, 'W', 'E');
            if (exits(r, n - 1, 'E')) {
                let row = r + d, c = n + d;
                if (edge.reversedLR && jog) {   // step down a row on the way out
                    add(row, c, 'W', 'S'); add(row + 1, c, 'N', 'E'); row++; c++;
                }
                for (; c < m; c++) add(row, c, 'W', 'E');
            }
        }
    }
    if (edge.periodicTB || edge.reversedTB) {
        for (let c = 0; c < n; c++) {
            if (exits(0, c, 'N')) for (let r = 0; r < d; r++) add(r, c + d, 'N', 'S');
            if (exits(n - 1, c, 'S')) {
                let col = c + d, r = n + d;
                if (edge.reversedTB && jog) {   // step right a column on the way out
                    add(r, col, 'N', 'E'); add(r, col + 1, 'W', 'S'); col++; r++;
                }
                for (; r < m; r++) add(r, col, 'N', 'S');
            }
        }
    }
    for (let r = 0; r < m; r++) for (let c = 0; c < m; c++) {
        if (pairs[r][c].length) grid[r][c] = tileForPairs(pairs[r][c]);
    }
    return grid;
}

// Red-dash count, matching drawMismatchesFlat: interior edges, glued edges,
// and free boundaries (north/south unless that pair is glued, west only on
// the disk).
function countMismatches(grid, edge) {
    const n = grid.length;
    let bad = 0;
    const freeN = !edge.periodicTB && !edge.reversedTB;
    const freeW = !edge.periodicLR && !edge.reversedLR;
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
            const ti = grid[r][c];
            const tile = TILE_TYPES[ti];
            if (!tile) continue;
            if (c < n - 1) {
                if (!connectionsMatch(ti, grid[r][c + 1], 'E')) bad++;
            } else if (edge.periodicLR) {
                if (!connectionsMatch(ti, grid[r][0], 'E')) bad++;
            } else if (edge.reversedLR) {
                if (!connectionsMatch(ti, grid[n - 1 - r][0], 'E')) bad++;
            } else if (tile.connections.E) bad++;

            if (r < n - 1) {
                if (!connectionsMatch(ti, grid[r + 1][c], 'S')) bad++;
            } else if (edge.periodicTB) {
                if (!connectionsMatch(ti, grid[0][c], 'S')) bad++;
            } else if (edge.reversedTB) {
                if (!connectionsMatch(ti, grid[0][n - 1 - c], 'S')) bad++;
            } else if (tile.connections.S) bad++;

            if (freeN && r === 0 && tile.connections.N) bad++;
            if (freeW && c === 0 && tile.connections.W) bad++;
        }
    }
    return bad;
}

// Move each straight exit on a reversed edge one step toward the low side
// (an EW pair on the east edge steps up a row, an NS pair on the south edge
// steps left a column) so an odd shrink still glues it to the partner it
// had. Any other strand in that cell stays. A destination that cannot take
// the arriving end is left alone.
function jogOddShrink(grid, edge) {
    let cur = grid.map(row => row.slice());
    if (edge.reversedLR) cur = keepIfFewerMismatches(cur, jogStraightExits(cur, 'LR'), edge);
    if (edge.reversedTB) cur = keepIfFewerMismatches(cur, jogStraightExits(cur, 'TB'), edge);
    return cur;
}

function keepIfFewerMismatches(cur, next, edge) {
    return countMismatches(next, edge) < countMismatches(cur, edge) ? next : cur;
}

function cellPairs(tile) {
    const pairs = TILE_PAIRS[tile];
    return pairs ? [...pairs] : [];
}

function pairClash(pairs) {
    const sides = pairs.join('');
    return new Set(sides).size !== sides.length;
}

function pairsToTile(pairs) {
    if (pairs.length === 0) return 0;
    const tile = tileForPairs(pairs);
    const got = TILE_PAIRS[tile];
    if (!got) return null;
    const norm = xs => [...xs].sort().join(',');
    return norm(got) === norm(pairs) ? tile : null;
}

function jogStraightExits(grid, which) {
    const m = grid.length;
    const g = grid.map(row => row.slice());
    const horizontal = which === 'LR';
    const from = horizontal ? 'EW' : 'NS';
    const pairs = [];
    for (let i = 0; i < m; i++) {
        const r = horizontal ? i : m - 1;
        const c = horizontal ? m - 1 : i;
        pairs.push(cellPairs(g[r][c]));
    }
    const movers = [];
    for (let i = 0; i < m; i++) if (pairs[i].includes(from)) movers.push(i);
    const changed = new Set();
    for (const i of movers) {
        if (i === 0) continue;   // the partner row/column was cropped away
        const turned = pairs[i].map(p => (p === from ? 'NW' : p));
        if (pairClash(turned) || pairsToTile(turned) === null) continue;
        if (pairs[i - 1].includes('ES') || pairClash([...pairs[i - 1], 'ES'])) continue;
        const dest = [...pairs[i - 1], 'ES'];
        if (pairsToTile(dest) === null) continue;
        pairs[i] = turned;
        pairs[i - 1] = dest;
        changed.add(i);
        changed.add(i - 1);
    }
    for (const i of changed) {
        const tile = pairsToTile(pairs[i]);
        if (tile === null) continue;
        const r = horizontal ? i : m - 1;
        const c = horizontal ? m - 1 : i;
        g[r][c] = tile;
    }
    return g;
}

// Offsets of each cube face's old block inside its resized face, for a
// change of g cells either way. A glued pair of face edges either keeps the
// coordinate along the edge (equal offsets) or reverses it (offsets summing
// to g); in the folded cube top–back, bottom–back, top–right and
// bottom–left reverse. With h = ⌊g/2⌋ every gluing holds and each face's
// drawing is centred to within half a cell.
function sphereFaceOffsets(g) {
    const h = Math.floor(g / 2), k = g - h;
    return {
        top:    { dy: h, dx: h },
        front:  { dy: h, dx: h },
        left:   { dy: h, dx: h },
        right:  { dy: h, dx: k },
        back:   { dy: h, dx: k },
        bottom: { dy: k, dx: h },
    };
}

function resizeSphereGrid(old, n, m) {
    const off = sphereFaceOffsets(Math.abs(m - n));
    const out = {};
    for (const face of Object.keys(old)) {
        const src = old[face], grid = emptyGrid(m);
        const { dy, dx } = off[face];
        if (m <= n) {
            for (let r = 0; r < m; r++) for (let c = 0; c < m; c++) grid[r][c] = src[r + dy][c + dx];
        } else {
            for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) grid[r + dy][c + dx] = src[r][c];
            // Every face edge is glued: run strands out to the new face edge.
            const exits = (r, c, side) => TILE_TYPES[src[r][c]]?.connections[side];
            for (let r = 0; r < n; r++) {
                if (exits(r, 0, 'W')) for (let c = 0; c < dx; c++) grid[r + dy][c] = 1;
                if (exits(r, n - 1, 'E')) for (let c = n + dx; c < m; c++) grid[r + dy][c] = 1;
            }
            for (let c = 0; c < n; c++) {
                if (exits(0, c, 'N')) for (let r = 0; r < dy; r++) grid[r][c + dx] = 2;
                if (exits(n - 1, c, 'S')) for (let r = n + dy; r < m; r++) grid[r][c + dx] = 2;
            }
        }
        out[face] = grid;
    }
    return out;
}

// ============================================================
// Cell size
// ============================================================
const BASE_CELL = 64;
function cellSize() { return BASE_CELL; }

function bgColor() {
    return state.bgMode === 'white' ? '#ffffff' : '#0a0e1a';
}
function gridLineColor() {
    return state.bgMode === 'white' ? 'rgba(0,0,0,0.1)' : 'rgba(255,255,255,0.08)';
}
function cellShadeColor() {
    return state.bgMode === 'white' ? 'rgba(0,0,0,0.03)' : 'rgba(255,255,255,0.035)';
}

// ============================================================
// Sphere net layout (cube cross unfolded)
//
//         [top]
//  [left] [front] [right] [back]
//         [bottom]
// ============================================================
function sphereNetLayout() {
    const fs = state.faceSize;
    return {
        top: { ox: fs, oy: 0 },
        left: { ox: 0, oy: fs },
        front: { ox: fs, oy: fs },
        right: { ox: 2 * fs, oy: fs },
        back: { ox: 3 * fs, oy: fs },
        bottom: { ox: fs, oy: 2 * fs },
    };
}
function sphereNetSize() {
    const fs = state.faceSize;
    return { w: 4 * fs, h: 3 * fs };
}

// ============================================================
// Sphere adjacency — which face/row/col is adjacent to a given edge
// ============================================================
function sphereNeighbor(face, row, col, side) {
    const fs = state.faceSize;
    const last = fs - 1;

    // Same-face neighbor
    const dr = { N: -1, S: 1, E: 0, W: 0 };
    const dc = { N: 0, S: 0, E: 1, W: -1 };
    const nr = row + dr[side];
    const nc = col + dc[side];
    if (nr >= 0 && nr < fs && nc >= 0 && nc < fs) {
        return { face, row: nr, col: nc };
    }

    // Cross-face adjacency (cube topology)
    // Standard cube net adjacency map
    const adj = {
        top: {
            N: { face: 'back', row: (r, c) => 0, col: (r, c) => last - c },
            S: { face: 'front', row: (r, c) => 0, col: (r, c) => c },
            E: { face: 'right', row: (r, c) => 0, col: (r, c) => c },
            W: { face: 'left', row: (r, c) => 0, col: (r, c) => last - c },
        },
        front: {
            N: { face: 'top', row: (r, c) => last, col: (r, c) => c },
            S: { face: 'bottom', row: (r, c) => 0, col: (r, c) => c },
            E: { face: 'right', row: (r, c) => r, col: (r, c) => 0 },
            W: { face: 'left', row: (r, c) => r, col: (r, c) => last },
        },
        right: {
            N: { face: 'top', row: (r, c) => last - c, col: (r, c) => last },
            S: { face: 'bottom', row: (r, c) => c, col: (r, c) => last },
            E: { face: 'back', row: (r, c) => r, col: (r, c) => 0 },
            W: { face: 'front', row: (r, c) => r, col: (r, c) => last },
        },
        back: {
            N: { face: 'top', row: (r, c) => 0, col: (r, c) => last - c },
            S: { face: 'bottom', row: (r, c) => last, col: (r, c) => last - c },
            E: { face: 'left', row: (r, c) => r, col: (r, c) => 0 },
            W: { face: 'right', row: (r, c) => r, col: (r, c) => last },
        },
        left: {
            N: { face: 'top', row: (r, c) => c, col: (r, c) => 0 },
            S: { face: 'bottom', row: (r, c) => last - c, col: (r, c) => 0 },
            E: { face: 'front', row: (r, c) => r, col: (r, c) => 0 },
            W: { face: 'back', row: (r, c) => r, col: (r, c) => last },
        },
        bottom: {
            N: { face: 'front', row: (r, c) => last, col: (r, c) => c },
            S: { face: 'back', row: (r, c) => last, col: (r, c) => last - c },
            E: { face: 'right', row: (r, c) => last, col: (r, c) => c },
            W: { face: 'left', row: (r, c) => last, col: (r, c) => last - c },
        },
    };

    const mapping = adj[face]?.[side];
    if (!mapping) return null;
    return {
        face: mapping.face,
        row: mapping.row(row, col),
        col: mapping.col(row, col),
    };
}

// ============================================================
// Scale-aware drawing helpers
//
// World units are 64 per cell. Zoomed far out (big grids) a 3-unit strand
// would be a fraction of a pixel, so strands and edge decorations get a floor
// in screen pixels; at ordinary zooms they are unchanged.
// ============================================================
function strandLineWidth() {
    return Math.min(Math.max(state.strandWidth, 1.25 / state.zoom), 0.16 * cellSize());
}
function decorScale() {
    return Math.max(1, 0.8 / state.zoom);
}

// Rows/columns of a rows×cols block with world origin (ox, oy) that touch the
// window, plus a one-cell margin for round line caps; half-open ranges.
function visibleRange(ox, oy, cs, rows, cols) {
    const a = screenToWorld(0, 0);
    const b = screenToWorld(window.innerWidth, window.innerHeight);
    const clamp = (v, hi) => Math.max(0, Math.min(hi, v));
    return {
        r0: clamp(Math.floor((a.y - oy) / cs) - 1, rows),
        r1: clamp(Math.ceil((b.y - oy) / cs) + 1, rows),
        c0: clamp(Math.floor((a.x - ox) / cs) - 1, cols),
        c1: clamp(Math.ceil((b.x - ox) / cs) + 1, cols),
    };
}

// Cell lines of a rows×cols block as one path, fading out as cells shrink
// below ~8 px on screen, where they would only grey the picture.
function strokeGridLines(ox, oy, cs, rows, cols, color) {
    const fade = Math.min(1, (cs * state.zoom - 3) / 5);
    if (fade <= 0) return;
    const p = new Path2D();
    for (let i = 0; i <= cols; i++) { p.moveTo(ox + i * cs, oy); p.lineTo(ox + i * cs, oy + rows * cs); }
    for (let i = 0; i <= rows; i++) { p.moveTo(ox, oy + i * cs); p.lineTo(ox + cols * cs, oy + i * cs); }
    ctx.save();
    ctx.globalAlpha = fade;
    ctx.strokeStyle = color;
    ctx.lineWidth = 0.5;
    ctx.stroke(p);
    ctx.restore();
}

// Drags call this instead of render(): at most one redraw per frame.
let renderQueued = false;
function scheduleRender() {
    if (renderQueued) return;
    renderQueued = true;
    requestAnimationFrame(() => { renderQueued = false; render(); });
}

// ============================================================
// Rendering
// ============================================================
function render() {
    const w = window.innerWidth;
    const h = window.innerHeight;

    // Background
    ctx.fillStyle = bgColor();
    ctx.fillRect(0, 0, w, h);

    // Subtle grid background
    drawBackgroundPattern(w, h);

    ctx.save();
    ctx.translate(state.pan.x, state.pan.y);
    ctx.scale(state.zoom, state.zoom);

    if (state.surface === 'sphere') {
        renderSphere();
    } else {
        renderFlatGrid();
    }

    ctx.restore();
}

function drawBackgroundPattern(w, h) {
    const dotSpacing = 40;
    ctx.fillStyle = state.bgMode === 'white' ? 'rgba(0,0,0,0.025)' : 'rgba(255,255,255,0.015)';
    for (let x = dotSpacing / 2; x < w; x += dotSpacing) {
        for (let y = dotSpacing / 2; y < h; y += dotSpacing) {
            ctx.beginPath();
            ctx.arc(x, y, 1, 0, Math.PI * 2);
            ctx.fill();
        }
    }
}

// ============================================================
// Flat grid rendering (disk & torus)
// ============================================================
function renderFlatGrid() {
    const n = state.gridSize;
    const cs = cellSize();
    const totalW = n * cs;
    const totalH = n * cs;
    const ox = -totalW / 2;
    const oy = -totalH / 2;
    const surf = state.surface;
    const hasPeriodicLR = (surf === 'torus' || surf === 'cylinder');
    const hasPeriodicTB = (surf === 'torus');
    const hasReversedLR = (surf === 'projective' || surf === 'mobius');
    const hasReversedTB = (surf === 'projective');

    // Shadow under grid
    ctx.save();
    ctx.shadowColor = state.bgMode === 'white' ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = bgColor();
    ctx.fillRect(ox, oy, totalW, totalH);
    ctx.restore();
    ctx.fillStyle = bgColor();
    ctx.fillRect(ox, oy, totalW, totalH);

    // Grid lines
    if (state.showGrid) strokeGridLines(ox, oy, cs, n, n, gridLineColor());

    // Border & edge decorations
    const hasPeriodic = hasPeriodicLR || hasPeriodicTB || hasReversedLR || hasReversedTB;
    if (!hasPeriodic) {
        // Disk: solid border
        ctx.strokeStyle = state.bgMode === 'white' ? 'rgba(108, 138, 255, 0.5)' : 'rgba(108, 138, 255, 0.35)';
        ctx.lineWidth = 2 * decorScale();
        ctx.strokeRect(ox, oy, totalW, totalH);
    } else {
        // Draw each edge separately with identification arrows
        drawIdentifiedBorder(ox, oy, totalW, totalH, n, cs);
    }

    // Tiles (only the ones on screen)
    const vis = visibleRange(ox, oy, cs, n, n);
    drawTilesBatched(ctx, (r, c) => state.grid[r][c], vis.r0, vis.r1, vis.c0, vis.c1,
        ox, oy, cs, state.strandColor, strandLineWidth(), bgColor());

    // Selected cell highlight
    drawSelectedCellHighlight(ox, oy, cs);

    // Mismatches
    if (state.showMismatches) {
        drawMismatchesFlat(ox, oy, cs, n, vis);
    }
}

function drawIdentifiedBorder(ox, oy, w, h, n, cs) {
    const surf = state.surface;
    const s = decorScale();
    const arrowLen = 14 * s;
    const midX = ox + w / 2;
    const midY = oy + h / 2;

    // Colors for edge pairs
    const hColor = 'rgba(244, 114, 182, 0.5)'; // pink for L/R identification
    const vColor = 'rgba(34, 211, 238, 0.5)';   // cyan for T/B identification
    const solidBorderColor = state.bgMode === 'white' ? 'rgba(108, 138, 255, 0.5)' : 'rgba(108, 138, 255, 0.35)';

    // Left/Right edges
    if (surf === 'torus' || surf === 'cylinder') {
        // Same-direction identification (L↔R)
        drawDashedEdge(ox, oy, ox, oy + h, hColor, s);
        drawDashedEdge(ox + w, oy, ox + w, oy + h, hColor, s);
        drawArrowPair(ox - 6 * s, midY, arrowLen, -Math.PI / 2, hColor, s);
        drawArrowPair(ox + w + 6 * s, midY, arrowLen, -Math.PI / 2, hColor, s);
    } else if (surf === 'projective' || surf === 'mobius') {
        // Reverse identification (L↔R reversed)
        drawDashedEdge(ox, oy, ox, oy + h, hColor, s);
        drawDashedEdge(ox + w, oy, ox + w, oy + h, hColor, s);
        // Opposite arrows to show reversal
        drawSingleArrow(ox - 6 * s, midY - arrowLen, arrowLen, Math.PI / 2, hColor, s);  // down
        drawSingleArrow(ox + w + 6 * s, midY + arrowLen, arrowLen, -Math.PI / 2, hColor, s); // up
    } else {
        // Solid border
        ctx.strokeStyle = solidBorderColor;
        ctx.lineWidth = 2 * s;
        ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox, oy + h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ox + w, oy); ctx.lineTo(ox + w, oy + h); ctx.stroke();
    }

    // Top/Bottom edges
    if (surf === 'torus') {
        // Same-direction identification (T↔B)
        drawDashedEdge(ox, oy, ox + w, oy, vColor, s);
        drawDashedEdge(ox, oy + h, ox + w, oy + h, vColor, s);
        drawArrowPair(midX, oy - 6 * s, arrowLen, 0, vColor, s);
        drawArrowPair(midX, oy + h + 6 * s, arrowLen, 0, vColor, s);
    } else if (surf === 'projective') {
        // Reverse identification (T↔B reversed)
        drawDashedEdge(ox, oy, ox + w, oy, vColor, s);
        drawDashedEdge(ox, oy + h, ox + w, oy + h, vColor, s);
        drawSingleArrow(midX + arrowLen, oy - 6 * s, arrowLen, Math.PI, vColor, s);  // left
        drawSingleArrow(midX - arrowLen, oy + h + 6 * s, arrowLen, 0, vColor, s);    // right
    } else {
        // Solid border (cylinder, mobius top/bottom are free)
        ctx.strokeStyle = solidBorderColor;
        ctx.lineWidth = 2 * s;
        ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + w, oy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ox, oy + h); ctx.lineTo(ox + w, oy + h); ctx.stroke();
    }
}

function drawDashedEdge(x1, y1, x2, y2, color, s = 1) {
    ctx.save();
    ctx.setLineDash([6 * s, 4 * s]);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2 * s;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
}

function drawSingleArrow(cx, cy, len, angle, color, s = 1) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.5 * s;
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.moveTo(-len * 0.5, 0);
    ctx.lineTo(len * 0.5, 0);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(len * 0.5, 0);
    ctx.lineTo(len * 0.5 - 5 * s, -3 * s);
    ctx.lineTo(len * 0.5 - 5 * s, 3 * s);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

function drawTorusArrows(ox, oy, w, h) {
    const arrowLen = 14;
    const midX = ox + w / 2;
    const midY = oy + h / 2;
    drawArrowPair(midX, oy - 6, arrowLen, 0, 'rgba(244, 114, 182, 0.5)');
    drawArrowPair(midX, oy + h + 6, arrowLen, 0, 'rgba(244, 114, 182, 0.5)');
    drawArrowPair(ox - 6, midY, arrowLen, -Math.PI / 2, 'rgba(34, 211, 238, 0.5)');
    drawArrowPair(ox + w + 6, midY, arrowLen, -Math.PI / 2, 'rgba(34, 211, 238, 0.5)');
}

function drawArrowPair(cx, cy, len, angle, color, s = 1) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.5 * s;
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(-len, 0);
    ctx.lineTo(len, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(len, 0);
    ctx.lineTo(len - 5 * s, -3 * s);
    ctx.lineTo(len - 5 * s, 3 * s);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
}

// Get the edge identification type for mismatch checking
function getEdgeInfo() {
    const surf = state.surface;
    return {
        periodicLR: surf === 'torus' || surf === 'cylinder',
        periodicTB: surf === 'torus',
        reversedLR: surf === 'projective' || surf === 'mobius',
        reversedTB: surf === 'projective',
        freeBoundary: surf === 'disk',
    };
}

// Red dashes on every edge whose strand ends don't meet, for the cells in
// `vis`; collected into one path and stroked once.
function drawMismatchesFlat(ox, oy, cs, n, vis) {
    const edge = getEdgeInfo();
    const surf = state.surface;
    const freeN = surf === 'disk' || surf === 'cylinder' || surf === 'mobius';
    const freeW = surf === 'disk';
    const bad = new Path2D();
    let any = false;
    const mark = (x1, y1, x2, y2) => { bad.moveTo(x1, y1); bad.lineTo(x2, y2); any = true; };
    for (let r = vis.r0; r < vis.r1; r++) {
        for (let c = vis.c0; c < vis.c1; c++) {
            const ti = state.grid[r][c];
            const tile = TILE_TYPES[ti];
            if (!tile) continue;

            // East
            if (c < n - 1) {
                if (!connectionsMatch(ti, state.grid[r][c + 1], 'E')) {
                    mark(ox + (c + 1) * cs, oy + r * cs, ox + (c + 1) * cs, oy + (r + 1) * cs);
                }
            } else if (edge.periodicLR) {
                if (!connectionsMatch(ti, state.grid[r][0], 'E')) {
                    mark(ox + n * cs, oy + r * cs, ox + n * cs, oy + (r + 1) * cs);
                }
            } else if (edge.reversedLR) {
                // L/R reversed: right edge col n-1, row r matches left edge col 0, row (n-1-r)
                const mirrorR = n - 1 - r;
                if (!connectionsMatch(ti, state.grid[mirrorR]?.[0], 'E')) {
                    mark(ox + n * cs, oy + r * cs, ox + n * cs, oy + (r + 1) * cs);
                }
            } else {
                if (tile.connections.E) {
                    mark(ox + n * cs, oy + r * cs, ox + n * cs, oy + (r + 1) * cs);
                }
            }

            // South
            if (r < n - 1) {
                if (!connectionsMatch(ti, state.grid[r + 1][c], 'S')) {
                    mark(ox + c * cs, oy + (r + 1) * cs, ox + (c + 1) * cs, oy + (r + 1) * cs);
                }
            } else if (edge.periodicTB) {
                if (!connectionsMatch(ti, state.grid[0][c], 'S')) {
                    mark(ox + c * cs, oy + n * cs, ox + (c + 1) * cs, oy + n * cs);
                }
            } else if (edge.reversedTB) {
                const mirrorC = n - 1 - c;
                if (!connectionsMatch(ti, state.grid[0]?.[mirrorC], 'S')) {
                    mark(ox + c * cs, oy + n * cs, ox + (c + 1) * cs, oy + n * cs);
                }
            } else {
                if (tile.connections.S) {
                    mark(ox + c * cs, oy + n * cs, ox + (c + 1) * cs, oy + n * cs);
                }
            }

            // North and West boundaries (only for surfaces with free boundaries on those edges)
            if (freeN && r === 0 && tile.connections.N) {
                mark(ox + c * cs, oy, ox + (c + 1) * cs, oy);
            }
            if (freeW && c === 0 && tile.connections.W) {
                mark(ox, oy + r * cs, ox, oy + (r + 1) * cs);
            }
        }
    }
    if (any) strokeMismatches(bad, cs);
}

function strokeMismatches(path, cs) {
    // Thicken when zoomed far out, but keep the glow within a third of a cell.
    const k = Math.min(Math.max(1, 0.5 / state.zoom), cs / 24);
    ctx.save();
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.65)';
    ctx.lineWidth = 3 * k;
    ctx.setLineDash([4 * k, 3 * k]);
    ctx.lineCap = 'round';
    ctx.stroke(path);

    // Glow
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.2)';
    ctx.lineWidth = 8 * k;
    ctx.setLineDash([]);
    ctx.stroke(path);

    ctx.restore();
}

// ============================================================
// Sphere rendering (cube net)
// ============================================================
function renderSphere() {
    const fs = state.faceSize;
    const cs = cellSize();
    const net = sphereNetLayout();
    const netSz = sphereNetSize();
    const totalW = netSz.w * cs;
    const totalH = netSz.h * cs;
    const baseOx = -totalW / 2;
    const baseOy = -totalH / 2;

    const faces = ['top', 'left', 'front', 'right', 'back', 'bottom'];

    for (const face of faces) {
        const layout = net[face];
        const fOx = baseOx + layout.ox * cs;
        const fOy = baseOy + layout.oy * cs;
        const faceW = fs * cs;

        // Shadow
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.2)';
        ctx.shadowBlur = 20;
        ctx.fillStyle = bgColor();
        ctx.fillRect(fOx, fOy, faceW, faceW);
        ctx.restore();

        // Grid
        if (state.showGrid) {
            strokeGridLines(fOx, fOy, cs, fs, fs,
                state.bgMode === 'white' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)');
        }

        // Tiles (only the ones on screen)
        const fg = state.grid[face];
        const vis = visibleRange(fOx, fOy, cs, fs, fs);
        drawTilesBatched(ctx, (r, c) => fg[r][c], vis.r0, vis.r1, vis.c0, vis.c1,
            fOx, fOy, cs, state.strandColor, strandLineWidth(), bgColor());

        // Selected cell highlight (sphere)
        state.selectedCells.forEach(sc => {
            if (sc.face === face) {
                drawCellHighlight(fOx + sc.col * cs, fOy + sc.row * cs, cs);
            }
        });
    }

    // Draw edge colors to show gluing
    drawSphereEdgeGluing(baseOx, baseOy, cs);
}

// Edge gluing colors for the cube net
// Each pair of edges that will be glued shares the same color
function drawSphereEdgeGluing(baseOx, baseOy, cs) {
    const fs = state.faceSize;
    const net = sphereNetLayout();
    const fW = fs * cs;
    const s = decorScale();

    // Define gluing pairs with colors
    // Internal fold edges (adjacent in net) — subtle dashed
    const foldColor = state.bgMode === 'white' ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.12)';

    // External gluing colors — each color is a pair of edges that get identified
    const gluePairs = [
        { color: 'rgba(244, 114, 182, 0.6)', label: 'A' },  // pink
        { color: 'rgba(34, 211, 238, 0.6)', label: 'B' },   // cyan
        { color: 'rgba(251, 191, 36, 0.6)', label: 'C' },   // amber
        { color: 'rgba(52, 211, 153, 0.6)', label: 'D' },   // emerald
        { color: 'rgba(167, 139, 250, 0.6)', label: 'E' },  // purple
    ];

    // Helper to get face pixel origin
    function faceOrigin(face) {
        const l = net[face];
        return { x: baseOx + l.ox * cs, y: baseOy + l.oy * cs };
    }

    // Draw internal fold edges (edges shared between adjacent faces in the net)
    // These are where the net folds — draw as subtle lines
    const internalEdges = [
        // top-front: top's south = front's north
        [faceOrigin('top'), 'S'],
        // left-front: left's east = front's west
        [faceOrigin('front'), 'W'],
        // front-right: front's east = right's west
        [faceOrigin('right'), 'W'],
        // right-back: right's east = back's west
        [faceOrigin('back'), 'W'],
        // front-bottom: front's south = bottom's north (same as bottom's north)
        [faceOrigin('bottom'), 'N'],
    ];

    internalEdges.forEach(([o, side]) => {
        ctx.save();
        ctx.strokeStyle = foldColor;
        ctx.lineWidth = s;
        ctx.setLineDash([4 * s, 4 * s]);
        if (side === 'N') {
            ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(o.x + fW, o.y); ctx.stroke();
        } else if (side === 'S') {
            ctx.beginPath(); ctx.moveTo(o.x, o.y + fW); ctx.lineTo(o.x + fW, o.y + fW); ctx.stroke();
        } else if (side === 'W') {
            ctx.beginPath(); ctx.moveTo(o.x, o.y); ctx.lineTo(o.x, o.y + fW); ctx.stroke();
        } else if (side === 'E') {
            ctx.beginPath(); ctx.moveTo(o.x + fW, o.y); ctx.lineTo(o.x + fW, o.y + fW); ctx.stroke();
        }
        ctx.restore();
    });

    // Draw external gluing edges (edges that connect to non-adjacent faces)
    // Each pair shares a color and direction arrows
    const glueEdges = [
        // Pair 0 (pink): top-N ↔ back-N (reversed left-right)
        { pair: 0, face: 'top', side: 'N', reversed: true },
        { pair: 0, face: 'back', side: 'N', reversed: true },
        // Pair 1 (cyan): top-W ↔ left-N
        { pair: 1, face: 'top', side: 'W' },
        { pair: 1, face: 'left', side: 'N' },
        // Pair 2 (amber): top-E ↔ right-N
        { pair: 2, face: 'top', side: 'E' },
        { pair: 2, face: 'right', side: 'N' },
        // Pair 3 (emerald): bottom-S ↔ back-S (reversed left-right)
        { pair: 3, face: 'bottom', side: 'S', reversed: true },
        { pair: 3, face: 'back', side: 'S', reversed: true },
        // Pair 4 (purple): back-E ↔ left-W
        { pair: 4, face: 'back', side: 'E' },
        { pair: 4, face: 'left', side: 'W' },
        // bottom-W ↔ left-S (pair 1 reuse cyan)
        // bottom-E ↔ right-S (pair 2 reuse amber)
    ];

    // Also add bottom-left and bottom-right
    const extraGlueEdges = [
        { color: gluePairs[1].color, face: 'bottom', side: 'W' },
        { color: gluePairs[1].color, face: 'left', side: 'S' },
        { color: gluePairs[2].color, face: 'bottom', side: 'E' },
        { color: gluePairs[2].color, face: 'right', side: 'S' },
    ];

    // Draw the paired glue edges
    glueEdges.forEach(edge => {
        const o = faceOrigin(edge.face);
        const color = gluePairs[edge.pair].color;
        drawGlueEdge(o, fW, edge.side, color, s);
    });

    extraGlueEdges.forEach(edge => {
        const o = faceOrigin(edge.face);
        drawGlueEdge(o, fW, edge.side, edge.color, s);
    });

    // Also draw remaining free external edges (non-glued boundary of the net)
    // These are the outer boundary edges not covered above
    const outerColor = state.bgMode === 'white' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)';
    // left-N, left-S, left-W are glued; left only has no unglued edges actually
    // all external edges should be accounted for by the gluing
}

function drawGlueEdge(origin, fW, side, color, s = 1) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5 * s;
    ctx.lineCap = 'round';
    if (side === 'N') {
        ctx.beginPath(); ctx.moveTo(origin.x, origin.y); ctx.lineTo(origin.x + fW, origin.y); ctx.stroke();
    } else if (side === 'S') {
        ctx.beginPath(); ctx.moveTo(origin.x, origin.y + fW); ctx.lineTo(origin.x + fW, origin.y + fW); ctx.stroke();
    } else if (side === 'W') {
        ctx.beginPath(); ctx.moveTo(origin.x, origin.y); ctx.lineTo(origin.x, origin.y + fW); ctx.stroke();
    } else if (side === 'E') {
        ctx.beginPath(); ctx.moveTo(origin.x + fW, origin.y); ctx.lineTo(origin.x + fW, origin.y + fW); ctx.stroke();
    }
    ctx.restore();
}

// ============================================================
// Hit testing
// ============================================================
function screenToWorld(sx, sy) {
    return {
        x: (sx - state.pan.x) / state.zoom,
        y: (sy - state.pan.y) / state.zoom,
    };
}

// World position of the grid's top-left corner: the flat grid, or the
// bounding box of the sphere's cube net.
function gridOrigin() {
    const cs = cellSize();
    const sz = state.surface === 'sphere' ? sphereNetSize() : { w: state.gridSize, h: state.gridSize };
    return { ox: -(sz.w * cs) / 2, oy: -(sz.h * cs) / 2 };
}

// Screen point → grid units (1 per cell) from that corner.
function screenToGrid(sx, sy) {
    const { x, y } = screenToWorld(sx, sy);
    const o = gridOrigin(), cs = cellSize();
    return { x: (x - o.ox) / cs, y: (y - o.oy) / cs };
}

// The cell at integer grid position (ix, iy); null off the grid or in a gap
// of the sphere net.
function cellAtGridPos(ix, iy) {
    if (state.surface === 'sphere') {
        const fs = state.faceSize;
        const net = sphereNetLayout();
        for (const face of ['top', 'left', 'front', 'right', 'back', 'bottom']) {
            const l = net[face];
            if (ix >= l.ox && ix < l.ox + fs && iy >= l.oy && iy < l.oy + fs) {
                return { face, row: iy - l.oy, col: ix - l.ox };
            }
        }
        return null;
    }
    const n = state.gridSize;
    return (ix >= 0 && ix < n && iy >= 0 && iy < n) ? { row: iy, col: ix } : null;
}

function hitTest(sx, sy) {
    const g = screenToGrid(sx, sy);
    return cellAtGridPos(Math.floor(g.x), Math.floor(g.y));
}

// Cells a drag passes through between two pointer positions, in order and
// edge to edge (never a diagonal jump), not counting the cell it starts in.
// Without this a fast drag over small cells skips the cells between two
// mousemove events. Grid walk of Amanatides & Woo.
function cellsAlongDrag(from, to) {
    const a = screenToGrid(from.x, from.y), b = screenToGrid(to.x, to.y);
    let ix = Math.floor(a.x), iy = Math.floor(a.y);
    const dx = b.x - a.x, dy = b.y - a.y;
    const sx = Math.sign(dx), sy = Math.sign(dy);
    const tdx = sx ? 1 / Math.abs(dx) : Infinity;
    const tdy = sy ? 1 / Math.abs(dy) : Infinity;
    let tx = sx > 0 ? (ix + 1 - a.x) * tdx : sx < 0 ? (a.x - ix) * tdx : Infinity;
    let ty = sy > 0 ? (iy + 1 - a.y) * tdy : sy < 0 ? (a.y - iy) * tdy : Infinity;
    const out = [];
    while (Math.min(tx, ty) <= 1) {
        if (tx < ty) { ix += sx; tx += tdx; } else { iy += sy; ty += tdy; }
        const hit = cellAtGridPos(ix, iy);
        if (hit) out.push(hit);
    }
    return out;
}

// Continue a paint or draw drag to the pointer at (x, y).
function dragTo(x, y) {
    const to = { x, y };
    const cells = state.dragFrom ? cellsAlongDrag(state.dragFrom, to) : [hitTest(x, y)].filter(Boolean);
    state.dragFrom = to;
    const drawing = state.isDrawing;   // a stroke can close (and end) part-way
    const ti = state.selectedTile === -1 ? 0 : state.selectedTile;
    for (const hit of cells) {
        if (drawing) strokeStep(hit);
        else placeTile(hit, ti);
    }
}

// ============================================================
// Tile placement
// ============================================================
function placeTile(hit, tileIndex) {
    if (!hit) return;
    if (getTileAt(hit) === tileIndex) return;
    setTileAt(hit, tileIndex);
    scheduleRender();
}

// ============================================================
// Selected cell highlight
// ============================================================
function drawSelectedCellHighlight(ox, oy, cs) {
    state.selectedCells.forEach(sc => {
        if (!sc.face) {
            drawCellHighlight(ox + sc.col * cs, oy + sc.row * cs, cs);
        }
    });
}

function drawCellHighlight(x, y, cs) {
    ctx.save();
    ctx.shadowColor = 'rgba(108, 138, 255, 0.5)';
    ctx.shadowBlur = 12;
    ctx.fillStyle = 'rgba(108, 138, 255, 0.06)';
    ctx.fillRect(x, y, cs, cs);
    // Redraw to double-up the glow
    ctx.fillRect(x, y, cs, cs);
    ctx.restore();
}

function getTileAt(cell) {
    if (!cell) return -1;
    if (state.surface === 'sphere') {
        return state.grid[cell.face]?.[cell.row]?.[cell.col] ?? -1;
    }
    return state.grid[cell.row]?.[cell.col] ?? -1;
}

function setTileAt(cell, tileIndex) {
    if (!cell) return;
    if (getTileAt(cell) === tileIndex) return;
    commitGesture();
    if (state.surface === 'sphere') {
        state.grid[cell.face][cell.row][cell.col] = tileIndex;
    } else {
        state.grid[cell.row][cell.col] = tileIndex;
    }
}

// ============================================================
// Palette
// ============================================================
const TILE_FAMILIES = [
    [0],
    [1, 2],
    [3, 4, 5, 6],
    [9, 10],
    [7, 8],
    [11]
];

function buildPalette() {
    paletteTiles.innerHTML = '';
    const showAll = document.getElementById('show-orientations-toggle')?.checked;

    TILE_FAMILIES.forEach(family => {
        const col = document.createElement('div');
        col.className = 'palette-col';
        if (showAll) {
            family.forEach(idx => col.appendChild(createPaletteTile(idx)));
        } else {
            col.appendChild(createPaletteTile(family[0]));
        }
        paletteTiles.appendChild(col);
    });

    // Ensure the currently selected tile is still marked
    selectTile(state.selectedTile);
}

function createPaletteTile(index) {
    const el = document.createElement('div');
    el.className = 'palette-tile';
    if (state.selectedTile === index) el.classList.add('selected');
    el.setAttribute('data-index', index);

    const tileCanvas = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    const sz = 48;
    tileCanvas.width = sz * dpr;
    tileCanvas.height = sz * dpr;
    tileCanvas.style.width = sz + 'px';
    tileCanvas.style.height = sz + 'px';
    const tctx = tileCanvas.getContext('2d');
    tctx.scale(dpr, dpr);

    if (index === 0) {
        // Blank: subtle dot
        tctx.fillStyle = 'rgba(255,255,255,0.15)';
        tctx.beginPath();
        tctx.arc(24, 24, 2.5, 0, Math.PI * 2);
        tctx.fill();
    } else {
        TILE_TYPES[index].draw(tctx, 4, 4, 40, state.strandColor, 2.5, bgColor());
    }

    el.appendChild(tileCanvas);

    el.addEventListener('click', () => selectTile(index));
    el.addEventListener('mousedown', (e) => startDrag(e, index));

    return el;
}

function selectTile(index) {
    state.selectedTile = index;
    const tiles = paletteTiles.querySelectorAll('.palette-tile');
    tiles.forEach(el => {
        const elIndex = parseInt(el.getAttribute('data-index'));
        el.classList.toggle('selected', elIndex === index);
    });
}

// ============================================================
// Drag from palette
// ============================================================
function startDrag(e, tileIndex) {
    if (e.button !== 0) return;
    e.preventDefault();
    state.dragTile = tileIndex;

    const ghost = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    const sz = 56;
    ghost.width = sz * dpr;
    ghost.height = sz * dpr;
    ghost.style.width = sz + 'px';
    ghost.style.height = sz + 'px';
    ghost.className = 'drag-ghost';
    const gctx = ghost.getContext('2d');
    gctx.scale(dpr, dpr);

    if (tileIndex > 0) {
        TILE_TYPES[tileIndex].draw(gctx, 6, 6, sz - 12, state.strandColor, 2.5, bgColor());
    } else {
        gctx.fillStyle = 'rgba(255,255,255,0.15)';
        gctx.beginPath();
        gctx.arc(sz / 2, sz / 2, 3, 0, Math.PI * 2);
        gctx.fill();
    }

    ghost.style.left = e.clientX + 'px';
    ghost.style.top = e.clientY + 'px';
    document.body.appendChild(ghost);
    state.ghostEl = ghost;

    const onMove = (ev) => {
        ghost.style.left = ev.clientX + 'px';
        ghost.style.top = ev.clientY + 'px';
    };
    const onUp = (ev) => {
        document.removeEventListener('mousemove', onMove);
        document.removeEventListener('mouseup', onUp);
        if (state.ghostEl) {
            state.ghostEl.remove();
            state.ghostEl = null;
        }
        const hit = hitTest(ev.clientX, ev.clientY);
        if (hit) {
            beginGesture();
            const ti = tileIndex >= 0 ? tileIndex : 0;
            placeTile(hit, ti);
            state.selectedCells = [hit];
            selectTile(tileIndex);
        }
        state.dragTile = 0;
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
}

// ============================================================
// Undo / Redo (⌘Z / ⌘⇧Z)
//
// Snapshots the whole grid (plus surface & size, so undo works across
// resizes and surface switches). One snapshot per gesture: a paint-drag
// or a drawn stroke undoes as a unit.
// ============================================================
const undoStack = [];
const redoStack = [];
const UNDO_LIMIT = 100;

function copyGrid(g) {
    return Array.isArray(g)
        ? g.map(r => [...r])
        : Object.fromEntries(Object.keys(g).map(f => [f, g[f].map(r => [...r])]));
}

function captureState() {
    return {
        surface: state.surface,
        gridSize: state.gridSize,
        faceSize: state.faceSize,
        grid: copyGrid(state.grid),
    };
}

function pushUndo() {
    pendingUndo = null;
    undoStack.push(captureState());
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    redoStack.length = 0;
}

// Gesture-scoped snapshots: capture at gesture start, but only commit to
// the undo stack when a tile actually changes — so accidental clicks or
// no-op strokes don't consume an undo step.
let pendingUndo = null;
function beginGesture() { pendingUndo = captureState(); }
function commitGesture() {
    if (!pendingUndo) return;
    undoStack.push(pendingUndo);
    pendingUndo = null;
    if (undoStack.length > UNDO_LIMIT) undoStack.shift();
    redoStack.length = 0;
}

function restoreState(s) {
    state.surface = s.surface;
    state.gridSize = s.gridSize;
    state.faceSize = s.faceSize;
    state.grid = copyGrid(s.grid);
    state.selectedCells = [];
    endStroke();
    const surfaceSelect = document.getElementById('surface-select');
    if (surfaceSelect.value !== s.surface) {
        surfaceSelect.value = s.surface;
        if (typeof populateExamples === 'function') populateExamples();
    }
    syncSizeControls();
    updateHud();
    render();
}

function undo() {
    if (undoStack.length === 0) return;
    redoStack.push(captureState());
    restoreState(undoStack.pop());
}

function redo() {
    if (redoStack.length === 0) return;
    undoStack.push(captureState());
    restoreState(redoStack.pop());
}

// ============================================================
// Strand drawing (✏️ Draw mode)
//
// Drag across cells; each cell we pass through gets the tile whose
// connections match the entry/exit sides of the drag path. Dragging
// over an existing strand combines into a crossing (new strand goes
// over) or a double-arc tile when the connections are disjoint.
// ============================================================
const OPP_SIDE = { N: 'S', S: 'N', E: 'W', W: 'E' };

// Canonical key for an unordered side pair (sides sorted alphabetically).
function sidePairKey(a, b) {
    return a < b ? a + b : b + a;
}

// key → plain tile index (keys: EW ─, NS │, EN ╰-style NE, NW, ES, SW)
const PAIR_TILE = { EW: 1, NS: 2, EN: 3, NW: 4, ES: 5, SW: 6 };

// tile index → its connection pair keys
const TILE_PAIRS = {
    1: ['EW'], 2: ['NS'], 3: ['EN'], 4: ['NW'], 5: ['ES'], 6: ['SW'],
    7: ['EW', 'NS'], 8: ['NS', 'EW'], 9: ['EN', 'SW'], 10: ['NW', 'ES'],
    11: ['EW', 'NS'],
};

// Given the tile already in a cell and the new connection's pair key,
// return the tile to place.
function drawTileFor(existingTi, key) {
    const plain = PAIR_TILE[key];
    const pairs = TILE_PAIRS[existingTi];
    if (!pairs) return plain;              // blank cell
    if (existingTi >= 7) return plain;     // already two strands: overwrite
    const ex = pairs[0];
    if (ex === key) return existingTi;     // same strand: keep
    // Shares a side with the existing strand → can't combine; overwrite.
    if (ex.includes(key[0]) || ex.includes(key[1])) return plain;
    // Disjoint: crossing (new strand over) or double arc.
    if (ex === 'EW' && key === 'NS') return 8;   // │ over ─
    if (ex === 'NS' && key === 'EW') return 7;   // ─ over │
    if ((ex === 'EN' && key === 'SW') || (ex === 'SW' && key === 'EN')) return 9;
    if ((ex === 'NW' && key === 'ES') || (ex === 'ES' && key === 'NW')) return 10;
    return plain;
}

// Position of a cell in unified "net" coordinates, so cross-face drags
// on the sphere net work (all net-adjacent faces are glued rotation-free).
function cellNetPos(cell) {
    if (state.surface === 'sphere') {
        const l = sphereNetLayout()[cell.face];
        return { x: l.ox + cell.col, y: l.oy + cell.row };
    }
    return { x: cell.col, y: cell.row };
}

function strokeStep(hit) {
    const st = state.stroke;
    if (!st) return;
    const last = st.cells[st.cells.length - 1];
    if (isSameCell(hit, last)) return;
    const a = cellNetPos(last), b = cellNetPos(hit);
    const dx = b.x - a.x, dy = b.y - a.y;
    if (Math.abs(dx) + Math.abs(dy) !== 1) return;   // only 4-adjacent steps
    const dir = dx === 1 ? 'E' : dx === -1 ? 'W' : dy === 1 ? 'S' : 'N';

    // The cell we're leaving now has both entry and exit sides — place it.
    if (st.cells.length === 1) {
        st.startExit = dir;
    } else if (st.prevEntry && st.prevEntry !== dir) {
        setTileAt(last, drawTileFor(getTileAt(last), sidePairKey(st.prevEntry, dir)));
    }

    const entry = OPP_SIDE[dir];
    const first = st.cells[0];
    if (st.cells.length > 1 && isSameCell(hit, first) &&
        st.startExit && st.startExit !== entry) {
        // Closed the loop: complete the starting cell too and end the stroke.
        setTileAt(hit, drawTileFor(getTileAt(hit), sidePairKey(entry, st.startExit)));
        state.stroke = null;
        state.isDrawing = false;
    } else {
        st.prevEntry = entry;
        st.cells.push(hit);
    }
    scheduleRender();
}

function endStroke() {
    state.isDrawing = false;
    state.stroke = null;
    pendingUndo = null;   // gesture over; uncommitted snapshot is a no-op
}

// ============================================================
// Canvas interaction (pan, zoom, click-to-place)
// ============================================================
canvas.addEventListener('mousedown', (e) => {
    const multi = e.metaKey || e.ctrlKey;
    const hit = hitTest(e.clientX, e.clientY);

    if (e.button === 2) {
        e.preventDefault();
        if (hit) {
            beginGesture();
            placeTile(hit, 0);
            state.selectedCells = [hit];
        } else {
            state.selectedCells = [];
            render();
        }
        return;
    }

    if (e.button !== 0) return;

    if (multi && hit) {
        const idx = state.selectedCells.findIndex(c => isSameCell(c, hit));
        if (idx >= 0) {
            state.selectedCells.splice(idx, 1);
        } else {
            state.selectedCells.push(hit);
        }
        render();
        return;
    }

    if (hit && state.drawMode) {
        beginGesture();
        state.stroke = { cells: [hit], startExit: null, prevEntry: null };
        state.isDrawing = true;
        state.dragFrom = { x: e.clientX, y: e.clientY };
        state.selectedCells = [];
        render();
        return;
    }

    if (hit) {
        beginGesture();
        const ti = state.selectedTile;
        placeTile(hit, ti);
        state.selectedCells = [hit]; // reset selection to current cell
        state.isPainting = true;
        state.isPanning = false;
        state.dragFrom = { x: e.clientX, y: e.clientY };
    } else {
        state.selectedCells = [];
        state.isPanning = true;
        state.lastMouse = { x: e.clientX, y: e.clientY };
        canvas.style.cursor = 'grabbing';
        render();
    }
});

canvas.addEventListener('mousemove', (e) => {
    if (state.isPanning && state.lastMouse) {
        state.pan.x += e.clientX - state.lastMouse.x;
        state.pan.y += e.clientY - state.lastMouse.y;
        state.lastMouse = { x: e.clientX, y: e.clientY };
        scheduleRender();
    } else if (state.isDrawing || state.isPainting) {
        dragTo(e.clientX, e.clientY);
    }
});

canvas.addEventListener('mouseup', () => {
    state.isPanning = false;
    state.isPainting = false;
    state.lastMouse = null;
    state.dragFrom = null;
    endStroke();
    canvas.style.cursor = state.drawMode ? 'crosshair' : 'grab';
});

canvas.addEventListener('mouseleave', () => {
    state.isPanning = false;
    state.isPainting = false;
    state.lastMouse = null;
    state.dragFrom = null;
    endStroke();
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// Zoom
canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    const newZoom = Math.max(minZoom(), Math.min(6, state.zoom * (1 + delta)));
    const ratio = newZoom / state.zoom;
    state.pan.x = e.clientX - ratio * (e.clientX - state.pan.x);
    state.pan.y = e.clientY - ratio * (e.clientY - state.pan.y);
    state.zoom = newZoom;
    scheduleRender();
}, { passive: false });

// Touch
let lastPinchDist = 0;
let lastTouchCenter = null;

canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    const touches = [...e.touches];
    if (touches.length === 1) {
        const hit = hitTest(touches[0].clientX, touches[0].clientY);
        if (hit && state.drawMode) {
            beginGesture();
            state.stroke = { cells: [hit], startExit: null, prevEntry: null };
            state.isDrawing = true;
            state.dragFrom = { x: touches[0].clientX, y: touches[0].clientY };
        } else if (hit) {
            beginGesture();
            const ti = state.selectedTile === -1 ? 0 : state.selectedTile;
            placeTile(hit, ti);
            state.isPainting = true;
            state.dragFrom = { x: touches[0].clientX, y: touches[0].clientY };
        } else {
            state.isPanning = true;
            state.lastMouse = { x: touches[0].clientX, y: touches[0].clientY };
        }
    } else if (touches.length === 2) {
        state.isPanning = false;
        state.isPainting = false;
        endStroke();
        lastPinchDist = Math.hypot(
            touches[1].clientX - touches[0].clientX,
            touches[1].clientY - touches[0].clientY
        );
        lastTouchCenter = {
            x: (touches[0].clientX + touches[1].clientX) / 2,
            y: (touches[0].clientY + touches[1].clientY) / 2,
        };
    }
}, { passive: false });

canvas.addEventListener('touchmove', (e) => {
    e.preventDefault();
    const touches = [...e.touches];
    if (touches.length === 1) {
        if (state.isPanning && state.lastMouse) {
            state.pan.x += touches[0].clientX - state.lastMouse.x;
            state.pan.y += touches[0].clientY - state.lastMouse.y;
            state.lastMouse = { x: touches[0].clientX, y: touches[0].clientY };
            scheduleRender();
        } else if (state.isDrawing || state.isPainting) {
            dragTo(touches[0].clientX, touches[0].clientY);
        }
    } else if (touches.length === 2) {
        const dist = Math.hypot(
            touches[1].clientX - touches[0].clientX,
            touches[1].clientY - touches[0].clientY
        );
        const center = {
            x: (touches[0].clientX + touches[1].clientX) / 2,
            y: (touches[0].clientY + touches[1].clientY) / 2,
        };
        if (lastPinchDist > 0) {
            const scale = dist / lastPinchDist;
            const newZoom = Math.max(minZoom(), Math.min(6, state.zoom * scale));
            const ratio = newZoom / state.zoom;
            state.pan.x = center.x - ratio * (center.x - state.pan.x);
            state.pan.y = center.y - ratio * (center.y - state.pan.y);
            state.zoom = newZoom;
        }
        if (lastTouchCenter) {
            state.pan.x += center.x - lastTouchCenter.x;
            state.pan.y += center.y - lastTouchCenter.y;
        }
        lastPinchDist = dist;
        lastTouchCenter = center;
        scheduleRender();
    }
}, { passive: false });

canvas.addEventListener('touchend', (e) => {
    const touches = [...e.touches];
    if (touches.length < 2) {
        lastPinchDist = 0;
        lastTouchCenter = null;
    }
    if (touches.length === 0) {
        state.isPanning = false;
        state.isPainting = false;
        state.dragFrom = null;
        endStroke();
    }
});

// ============================================================
// Fit view
// ============================================================
// Width of the picture left of the floating panel, so the fit centres on the
// free area like the tile palette does: the whole window when the panel is
// collapsed, on small screens, or if too little room would be left.
function freeWidth() {
    const w = window.innerWidth;
    const panel = document.getElementById('control-panel');
    if (!panel || w <= 860 || panel.classList.contains('collapsed')) return w;
    const free = panel.getBoundingClientRect().left - (parseFloat(getComputedStyle(panel).right) || 0);
    return free >= 320 ? free : w;
}

// Zoom at which the whole grid (or sphere net) fits the free area.
function fitZoom() {
    const cs = cellSize();
    const sz = state.surface === 'sphere' ? sphereNetSize() : { w: state.gridSize, h: state.gridSize };
    const padding = 140;
    const scaleX = (freeWidth() - padding * 2) / (sz.w * cs);
    const scaleY = (window.innerHeight - padding * 2) / (sz.h * cs);
    return Math.min(scaleX, scaleY, 2.5);
}

// Zooming out stops at 0.15, or at half the fit zoom for grids too big for that.
function minZoom() {
    return Math.min(0.15, Math.max(fitZoom(), 0.004) / 2);
}

function fitView() {
    state.zoom = fitZoom();
    state.pan.x = freeWidth() / 2;
    state.pan.y = window.innerHeight / 2;
    render();
}

// ============================================================
// UI wiring
// ============================================================
function updateHud() {
    const SURFACE_LABELS = {
        disk: 'Disk', sphere: 'Sphere', torus: 'Torus',
        projective: 'RP²', cylinder: 'Cylinder', mobius: 'Möbius'
    };
    hudInfo.textContent = SURFACE_LABELS[state.surface] || state.surface;
}

// Surface selector (dropdown)
const surfaceSelect = document.getElementById('surface-select');
const FOLDABLE_SURFACES = ['sphere', 'torus'];

function onSurfaceChange() {
    pushUndo();
    state.surface = surfaceSelect.value;
    // "View in R³" is unified across all surfaces, so its visibility no
    // longer needs to be toggled here.
    syncSizeControls();
    initGrid();
    updateHud();
    if (typeof populateExamples === 'function') populateExamples();
    if (typeof syncSmoothButtonVisibility === 'function') syncSmoothButtonVisibility();
    fitView();
}
surfaceSelect.addEventListener('change', onSurfaceChange);

// Grid size / face size (unified slider + editable number input). The slider
// covers the everyday range; the number box takes custom sizes up to `input`.
const gridSlider = document.getElementById('grid-size-slider');
const gridInput = document.getElementById('grid-size-input');
const gridHint = document.getElementById('grid-size-hint');
const SIZE_LIMITS = {
    flat:   { slider: [3, 25], input: [3, 200] },
    sphere: { slider: [1, 16], input: [1, 80] },
};

function sizeLimits() {
    return SIZE_LIMITS[state.surface === 'sphere' ? 'sphere' : 'flat'];
}

// Slider, number box and hint all show the current size; past the slider's
// range the thumb parks at the end, dimmed, and the hint says it is custom.
function syncSizeControls() {
    const lim = sizeLimits();
    const val = state.surface === 'sphere' ? state.faceSize : state.gridSize;
    [gridSlider.min, gridSlider.max] = lim.slider;
    [gridInput.min, gridInput.max] = lim.input;
    gridSlider.value = Math.min(val, lim.slider[1]);
    gridInput.value = val;
    const custom = val > lim.slider[1];
    gridSlider.classList.toggle('beyond', custom);
    if (gridHint) {
        const what = state.surface === 'sphere' ? 'cells per side of each cube face' : 'cells per side';
        gridHint.innerHTML = custom
            ? `Custom size: <b>${val} × ${val}</b>${state.surface === 'sphere' ? ' per face' : ''}. ` +
              `Drag the slider to return to ${lim.slider[0]}–${lim.slider[1]}.`
            : `${what[0].toUpperCase() + what.slice(1)}. Type in the box for a custom size, ` +
              `up to ${lim.input[1]}.`;
    }
}

// Resize to val cells per side, keeping the drawing of `base` (a
// captureState() snapshot on the current surface), centred.
function applyGridSize(val, base = captureState()) {
    const [min, max] = sizeLimits().input;
    val = Math.max(min, Math.min(max, val));
    if (state.surface === 'sphere') {
        state.faceSize = val;
        state.grid = resizeSphereGrid(base.grid, base.faceSize, val);
    } else {
        state.gridSize = val;
        state.grid = resizeFlatGrid(base.grid, base.gridSize, val, getEdgeInfo());
    }
    state.selectedCells = [];   // old cell coordinates no longer apply
    exampleSelect.value = '';   // no longer the preset as loaded
    syncSizeControls();
    updateHud();
    fitView();
}

// A slider drag fires many 'input' events; snapshot once per drag so the
// whole resize undoes in one step, and resize every step from that snapshot:
// growing one cell at a time would never centre the drawing (and would pile
// up jogs on the Möbius band and RP²).
let sliderBase = null;
gridSlider.addEventListener('input', () => {
    if (!sliderBase) { pushUndo(); sliderBase = captureState(); }
    applyGridSize(parseInt(gridSlider.value), sliderBase);
});
gridSlider.addEventListener('change', () => { sliderBase = null; });

gridInput.addEventListener('change', () => {
    const val = parseInt(gridInput.value);
    if (!isNaN(val) && val !== (state.surface === 'sphere' ? state.faceSize : state.gridSize)) {
        pushUndo();
        applyGridSize(val);
    }
});
gridInput.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') gridInput.blur();
});

// ============================================================
// Example presets
// ============================================================
const exampleSelect = document.getElementById('example-select');

function populateExamples() {
    exampleSelect.innerHTML = '<option value="">— Choose a preset —</option>';
    const examples = EXAMPLES[state.surface] || [];
    examples.forEach((ex, i) => {
        const opt = document.createElement('option');
        opt.value = i;
        opt.textContent = ex.name;
        exampleSelect.appendChild(opt);
    });
}

exampleSelect.addEventListener('change', () => {
    const idx = parseInt(exampleSelect.value);
    if (isNaN(idx)) return;
    const examples = EXAMPLES[state.surface] || [];
    const ex = examples[idx];
    if (ex) applyExample(ex);
});

// Load a preset: one from the Examples menu, or a hidden one named in the URL
// (which may carry its own surface).
function applyExample(ex) {
    pushUndo();
    if (ex.surface && ex.surface !== state.surface) {
        state.surface = ex.surface;
        surfaceSelect.value = ex.surface;
        populateExamples();
    }

    if (state.surface === 'sphere') {
        state.faceSize = ex.faceSize || state.faceSize;
        // Deep copy face grids
        state.grid = {};
        for (const face of Object.keys(ex.grid)) {
            state.grid[face] = ex.grid[face].map(row => [...row]);
        }
    } else {
        state.gridSize = ex.gridSize || state.gridSize;
        state.grid = ex.grid.map(row => [...row]);
    }

    syncSizeControls();
    state.selectedCells = [];
    // A preset may carry its own strand colour (skipped on the white
    // background, where it may not show).
    if (ex.strandColor && state.bgMode !== 'white') setStrandColor(ex.strandColor);
    updateHud();
    fitView();
}

populateExamples();

// Mismatch toggle
document.getElementById('show-connections-checkbox').addEventListener('change', (e) => {
    state.showMismatches = e.target.checked;
    render();
});



// Strand color — current-color box opens a popup palette
const colorCurrent = document.getElementById('color-current');
const colorPopup = document.getElementById('color-popup');

function setStrandColor(color) {
    state.strandColor = color;
    colorCurrent.style.background = color;
    document.querySelectorAll('.color-swatch').forEach(s => {
        s.classList.toggle('active', s.dataset.color === color);
    });
    buildPalette();
    render();
}

function hideColorPopup() {
    colorPopup.classList.add('hidden');
}

colorCurrent.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!colorPopup.classList.contains('hidden')) {
        hideColorPopup();
        return;
    }
    colorPopup.classList.remove('hidden');
    // Position next to the box, kept on-screen.
    const r = colorCurrent.getBoundingClientRect();
    const pw = colorPopup.offsetWidth, ph = colorPopup.offsetHeight;
    let left = r.left;
    let top = r.bottom + 8;
    if (left + pw > innerWidth - 12) left = innerWidth - pw - 12;
    if (top + ph > innerHeight - 12) top = r.top - ph - 8;
    colorPopup.style.left = left + 'px';
    colorPopup.style.top = top + 'px';
});

colorPopup.addEventListener('click', (e) => e.stopPropagation());

document.querySelectorAll('.color-swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
        setStrandColor(swatch.dataset.color);
        hideColorPopup();
    });
});

document.addEventListener('click', hideColorPopup);
document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') hideColorPopup();
});

// Background toggle
document.querySelectorAll('.bg-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.bg-toggle').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.bgMode = btn.dataset.bg;
        // Auto-switch strand color for contrast
        setStrandColor(state.bgMode === 'white' ? '#111111' : '#6c8aff');
    });
});

// Clear
document.getElementById('clear-btn').addEventListener('click', () => {
    pushUndo();
    initGrid();
    render();
});


// "View in R³" — single entry point for embedding the current mosaic into
// 3-space. The destination depends on the surface:
//   • disk   → open the smooth (energy-minimisation) overlay directly,
//              since the disk diagram is already a planar R² embedding.
//   • sphere → open the cube-fold overlay; "Smooth" appears in its toolbar.
//   • torus  → open the torus-fold overlay; same.
document.getElementById('view-r3-btn').addEventListener('click', () => {
    if (state.surface === 'disk') {
        if (window.openSmooth) window.openSmooth();
    } else if (state.surface === 'sphere') {
        if (window.openCubeFold) window.openCubeFold();
    } else if (state.surface === 'torus') {
        if (window.openTorusFold) window.openTorusFold();
    }
});

// Smooth-after-fold (sphere/torus) — sits in the cube/torus 3D-overlay
// toolbar. Extracts the folded surface's strand polylines and smooths
// them. Closes the fold overlay before opening the smooth overlay.
document.getElementById('cube-smooth-btn').addEventListener('click', () => {
    let polylines;
    let label;
    try {
        if (state.surface === 'sphere') {
            polylines = window.__smoothExtract.sphere(state.grid);
            label = 'Folded sphere';
        } else if (state.surface === 'torus') {
            polylines = window.__smoothExtract.torus(state.grid);
            label = 'Folded torus';
        } else {
            return;
        }
    } catch (e) {
        alert('Cannot smooth this folded mosaic:\n\n' + e.message);
        return;
    }
    // Both sphere and torus share the cube-overlay/canvas; closeCubeFold
    // is overridden by torus3d.js to handle either case.
    if (window.closeCubeFold) window.closeCubeFold();
    window.openSmooth({ polylines, label });
});

// The "View in R³" button is unified across surfaces, so nothing to
// toggle here. (Older builds had separate Smooth/Fold buttons; this stub
// remains as a no-op so other call sites stay safe.)
function syncSmoothButtonVisibility() {}
syncSmoothButtonVisibility();

// Panel collapse/expand (#collapse-btn) is wired by ../../assets/poincare-ui.js.

// The header sun/moon (#theme-btn, toggled by poincare-ui.js) drives the
// same Background option; picking Black/White keeps the header theme in step.
document.addEventListener('themechange', (e) => {
    const want = e.detail.theme === 'light' ? 'white' : 'black';
    if (state.bgMode !== want) document.querySelector(`.bg-toggle[data-bg="${want}"]`)?.click();
});
document.querySelectorAll('.bg-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
        window.PoincareUI?.setTheme(btn.dataset.bg === 'white' ? 'light' : 'dark', { store: false });
    });
});

// ============================================================
// Keyboard shortcuts
// ============================================================
document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT') return;

    // Undo / redo
    if ((e.metaKey || e.ctrlKey) && (e.key === 'z' || e.key === 'Z')) {
        e.preventDefault();
        if (e.shiftKey) redo(); else undo();
        return;
    }

    // Number keys to select tiles: 0-9
    const num = parseInt(e.key);
    if (!isNaN(num)) {
        if (num < TILE_TYPES.length) {
            selectTile(num);
        }
        return;
    }

    if (e.key === 'Escape') {
        state.selectedCells = [];
        render();
    } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        beginGesture();
        state.selectedCells.forEach(sc => {
            const ct = getTileAt(sc);
            if (ct > 0) setTileAt(sc, rotateTileCW(ct));
        });
        render();
    } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        beginGesture();
        state.selectedCells.forEach(sc => {
            const ct = getTileAt(sc);
            if (ct > 0) setTileAt(sc, rotateTileCCW(ct));
        });
        render();
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        beginGesture();
        state.selectedCells.forEach(sc => {
            setTileAt(sc, 0);
        });
        render();
    } else if (e.key === 'f' || e.key === 'F') {
        fitView();
    } else if (e.key === 'd' || e.key === 'D') {
        const cb = document.getElementById('draw-mode-toggle');
        cb.checked = !cb.checked;
        cb.dispatchEvent(new Event('change'));
    } else if (e.key === 'v' || e.key === 'V') {
        // Virtual crossing tile (index 11 — beyond the 0-9 number keys)
        selectTile(11);
    } else if ((e.key === 'c' || e.key === 'C') && !e.metaKey && !e.ctrlKey) {
        pushUndo();
        initGrid();
        render();
    }
});

// (Fold dispatch is folded into the "View in R³" handler above.)

// ============================================================
// Face texture renderer (for 3D cube)
// ============================================================
// Texture pixels per cell: 96, shrunk so a big grid's texture stays within
// maxPx (4096 is past what some GPUs accept; the cube has six of them).
function textureCellSize(n, maxPx) {
    return Math.max(12, Math.min(96, Math.floor(maxPx / n)));
}

window.renderFaceTexture = function (faceName, showGrid, strandsOnly) {
    const fs = state.faceSize;
    const cs = textureCellSize(fs, 2048);
    const size = fs * cs;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const cx = c.getContext('2d');

    if (!strandsOnly) {
        // Background
        cx.fillStyle = bgColor();
        cx.fillRect(0, 0, size, size);

        // Grid lines
        if (showGrid) {
            cx.strokeStyle = state.bgMode === 'white' ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.1)';
            cx.lineWidth = 1;
            for (let i = 0; i <= fs; i++) {
                cx.beginPath();
                cx.moveTo(i * cs, 0);
                cx.lineTo(i * cs, size);
                cx.stroke();
                cx.beginPath();
                cx.moveTo(0, i * cs);
                cx.lineTo(size, i * cs);
                cx.stroke();
            }
        }
    }
    // else: leave canvas fully transparent

    // Tiles
    const lw = Math.max(1.5, state.strandWidth * (cs / 64));
    const bg = strandsOnly ? 'rgba(0,0,0,0)' : bgColor();
    drawTilesBatched(cx, (r, cc) => state.grid[faceName]?.[r]?.[cc] ?? 0, 0, fs, 0, fs,
        0, 0, cs, state.strandColor, lw, bg);

    return c;
};

// ============================================================
// Torus texture renderer (for 3D torus)
// ============================================================
window.renderTorusTexture = function (showGrid, strandsOnly) {
    const gs = state.gridSize;
    const cs = textureCellSize(gs, 4096);
    const size = gs * cs;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const cx = c.getContext('2d');

    if (!strandsOnly) {
        // Background
        cx.fillStyle = bgColor();
        cx.fillRect(0, 0, size, size);

        // Grid lines
        if (showGrid) {
            cx.strokeStyle = state.bgMode === 'white' ? 'rgba(0,0,0,0.12)' : 'rgba(255,255,255,0.1)';
            cx.lineWidth = 1;
            for (let i = 0; i <= gs; i++) {
                cx.beginPath();
                cx.moveTo(i * cs, 0);
                cx.lineTo(i * cs, size);
                cx.stroke();
                cx.beginPath();
                cx.moveTo(0, i * cs);
                cx.lineTo(size, i * cs);
                cx.stroke();
            }
        }
    }

    // Tiles
    const lw = Math.max(1.5, state.strandWidth * (cs / 64));
    const bg = strandsOnly ? 'rgba(0,0,0,0)' : bgColor();
    drawTilesBatched(cx, (r, cc) => state.grid[r]?.[cc] ?? 0, 0, gs, 0, gs,
        0, 0, cs, state.strandColor, lw, bg);

    return c;
};

window.getAppState = function () { return state; };

// ============================================================
// Init
// ============================================================
initGrid();
buildPalette();
resizeCanvas();
updateHud();
syncSizeControls();
requestAnimationFrame(() => fitView());

// ?preset=<key> opens a preset from HIDDEN_EXAMPLES, which the Examples menu
// does not list (hbd/ forwards here with ?preset=hbd).
const presetKey = new URLSearchParams(location.search).get('preset');
if (presetKey && typeof HIDDEN_EXAMPLES !== 'undefined' && HIDDEN_EXAMPLES[presetKey]) {
    const ex = HIDDEN_EXAMPLES[presetKey];
    document.title = ex.name;
    // open on the picture, with the panel collapsed
    requestAnimationFrame(() => {
        window.PoincareUI?.setCollapsed(true);
        applyExample(ex);
    });
}

document.getElementById('show-orientations-toggle')?.addEventListener('change', buildPalette);

// ✏️ Draw mode toggle
document.getElementById('draw-mode-toggle')?.addEventListener('change', (e) => {
    state.drawMode = e.target.checked;
    endStroke();
    canvas.style.cursor = state.drawMode ? 'crosshair' : 'grab';
    const hint = document.getElementById('palette-hint');
    if (hint) {
        hint.textContent = state.drawMode
            ? 'Drag across cells to draw a strand · Close the loop to finish · Cross an existing strand for a crossing · D = exit draw mode'
            : 'Click or drag to place · Right-click to erase · V = virtual crossing ⊗ · D = draw mode';
    }
});
