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

    // Cell backgrounds
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
            const x = ox + c * cs;
            const y = oy + r * cs;
            ctx.fillStyle = bgColor();
            ctx.fillRect(x, y, cs, cs);
        }
    }

    // Grid lines
    if (state.showGrid) {
        ctx.strokeStyle = gridLineColor();
        ctx.lineWidth = 0.5;
        for (let i = 0; i <= n; i++) {
            ctx.beginPath();
            ctx.moveTo(ox + i * cs, oy);
            ctx.lineTo(ox + i * cs, oy + totalH);
            ctx.stroke();
            ctx.beginPath();
            ctx.moveTo(ox, oy + i * cs);
            ctx.lineTo(ox + totalW, oy + i * cs);
            ctx.stroke();
        }
    }

    // Border & edge decorations
    const hasPeriodic = hasPeriodicLR || hasPeriodicTB || hasReversedLR || hasReversedTB;
    if (!hasPeriodic) {
        // Disk: solid border
        ctx.strokeStyle = state.bgMode === 'white' ? 'rgba(108, 138, 255, 0.5)' : 'rgba(108, 138, 255, 0.35)';
        ctx.lineWidth = 2;
        ctx.strokeRect(ox, oy, totalW, totalH);
    } else {
        // Draw each edge separately with identification arrows
        drawIdentifiedBorder(ox, oy, totalW, totalH, n, cs);
    }

    // Tiles
    const lw = state.strandWidth;
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
            const ti = state.grid[r][c];
            if (ti > 0) {
                drawTile(ctx, ti, ox + c * cs, oy + r * cs, cs, state.strandColor, lw, bgColor());
            }
        }
    }

    // Selected cell highlight
    drawSelectedCellHighlight(ox, oy, cs);

    // Mismatches
    if (state.showMismatches) {
        drawMismatchesFlat(ox, oy, cs, n);
    }
}

function drawIdentifiedBorder(ox, oy, w, h, n, cs) {
    const surf = state.surface;
    const arrowLen = 14;
    const midX = ox + w / 2;
    const midY = oy + h / 2;

    // Colors for edge pairs
    const hColor = 'rgba(244, 114, 182, 0.5)'; // pink for L/R identification
    const vColor = 'rgba(34, 211, 238, 0.5)';   // cyan for T/B identification
    const solidBorderColor = state.bgMode === 'white' ? 'rgba(108, 138, 255, 0.5)' : 'rgba(108, 138, 255, 0.35)';

    // Left/Right edges
    if (surf === 'torus' || surf === 'cylinder') {
        // Same-direction identification (L↔R)
        drawDashedEdge(ox, oy, ox, oy + h, hColor);
        drawDashedEdge(ox + w, oy, ox + w, oy + h, hColor);
        drawArrowPair(ox - 6, midY, arrowLen, -Math.PI / 2, hColor);
        drawArrowPair(ox + w + 6, midY, arrowLen, -Math.PI / 2, hColor);
    } else if (surf === 'projective' || surf === 'mobius') {
        // Reverse identification (L↔R reversed)
        drawDashedEdge(ox, oy, ox, oy + h, hColor);
        drawDashedEdge(ox + w, oy, ox + w, oy + h, hColor);
        // Opposite arrows to show reversal
        drawSingleArrow(ox - 6, midY - arrowLen, arrowLen, Math.PI / 2, hColor);  // down
        drawSingleArrow(ox + w + 6, midY + arrowLen, arrowLen, -Math.PI / 2, hColor); // up
    } else {
        // Solid border
        ctx.strokeStyle = solidBorderColor;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox, oy + h); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ox + w, oy); ctx.lineTo(ox + w, oy + h); ctx.stroke();
    }

    // Top/Bottom edges
    if (surf === 'torus') {
        // Same-direction identification (T↔B)
        drawDashedEdge(ox, oy, ox + w, oy, vColor);
        drawDashedEdge(ox, oy + h, ox + w, oy + h, vColor);
        drawArrowPair(midX, oy - 6, arrowLen, 0, vColor);
        drawArrowPair(midX, oy + h + 6, arrowLen, 0, vColor);
    } else if (surf === 'projective') {
        // Reverse identification (T↔B reversed)
        drawDashedEdge(ox, oy, ox + w, oy, vColor);
        drawDashedEdge(ox, oy + h, ox + w, oy + h, vColor);
        drawSingleArrow(midX + arrowLen, oy - 6, arrowLen, Math.PI, vColor);  // left
        drawSingleArrow(midX - arrowLen, oy + h + 6, arrowLen, 0, vColor);    // right
    } else {
        // Solid border (cylinder, mobius top/bottom are free)
        ctx.strokeStyle = solidBorderColor;
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.moveTo(ox, oy); ctx.lineTo(ox + w, oy); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ox, oy + h); ctx.lineTo(ox + w, oy + h); ctx.stroke();
    }
}

function drawDashedEdge(x1, y1, x2, y2, color) {
    ctx.save();
    ctx.setLineDash([6, 4]);
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();
    ctx.restore();
}

function drawSingleArrow(cx, cy, len, angle, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.5;
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    ctx.beginPath();
    ctx.moveTo(-len * 0.5, 0);
    ctx.lineTo(len * 0.5, 0);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(len * 0.5, 0);
    ctx.lineTo(len * 0.5 - 5, -3);
    ctx.lineTo(len * 0.5 - 5, 3);
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

function drawArrowPair(cx, cy, len, angle, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.5;
    ctx.translate(cx, cy);
    ctx.rotate(angle);
    ctx.beginPath();
    ctx.moveTo(-len, 0);
    ctx.lineTo(len, 0);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(len, 0);
    ctx.lineTo(len - 5, -3);
    ctx.lineTo(len - 5, 3);
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

function drawMismatchesFlat(ox, oy, cs, n) {
    const edge = getEdgeInfo();
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
            const ti = state.grid[r][c];
            const tile = TILE_TYPES[ti];
            if (!tile) continue;

            // East
            if (c < n - 1) {
                if (!connectionsMatch(ti, state.grid[r][c + 1], 'E')) {
                    drawMismatchEdge(ox + (c + 1) * cs, oy + r * cs, ox + (c + 1) * cs, oy + (r + 1) * cs);
                }
            } else if (edge.periodicLR) {
                if (!connectionsMatch(ti, state.grid[r][0], 'E')) {
                    drawMismatchEdge(ox + n * cs, oy + r * cs, ox + n * cs, oy + (r + 1) * cs);
                }
            } else if (edge.reversedLR) {
                // L/R reversed: right edge col n-1, row r matches left edge col 0, row (n-1-r)
                const mirrorR = n - 1 - r;
                if (!connectionsMatch(ti, state.grid[mirrorR]?.[0], 'E')) {
                    drawMismatchEdge(ox + n * cs, oy + r * cs, ox + n * cs, oy + (r + 1) * cs);
                }
            } else {
                if (tile.connections.E) {
                    drawMismatchEdge(ox + n * cs, oy + r * cs, ox + n * cs, oy + (r + 1) * cs);
                }
            }

            // South
            if (r < n - 1) {
                if (!connectionsMatch(ti, state.grid[r + 1][c], 'S')) {
                    drawMismatchEdge(ox + c * cs, oy + (r + 1) * cs, ox + (c + 1) * cs, oy + (r + 1) * cs);
                }
            } else if (edge.periodicTB) {
                if (!connectionsMatch(ti, state.grid[0][c], 'S')) {
                    drawMismatchEdge(ox + c * cs, oy + n * cs, ox + (c + 1) * cs, oy + n * cs);
                }
            } else if (edge.reversedTB) {
                const mirrorC = n - 1 - c;
                if (!connectionsMatch(ti, state.grid[0]?.[mirrorC], 'S')) {
                    drawMismatchEdge(ox + c * cs, oy + n * cs, ox + (c + 1) * cs, oy + n * cs);
                }
            } else {
                if (tile.connections.S) {
                    drawMismatchEdge(ox + c * cs, oy + n * cs, ox + (c + 1) * cs, oy + n * cs);
                }
            }

            // North and West boundaries (only for surfaces with free boundaries on those edges)
            const surf = state.surface;
            const freeN = surf === 'disk' || surf === 'cylinder' || surf === 'mobius';
            const freeW = surf === 'disk';
            if (freeN && r === 0 && tile.connections.N) {
                drawMismatchEdge(ox + c * cs, oy, ox + (c + 1) * cs, oy);
            }
            if (freeW && c === 0 && tile.connections.W) {
                drawMismatchEdge(ox, oy + r * cs, ox, oy + (r + 1) * cs);
            }
        }
    }
}

function drawMismatchEdge(x1, y1, x2, y2) {
    ctx.save();
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.65)';
    ctx.lineWidth = 3;
    ctx.setLineDash([4, 3]);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Glow
    ctx.strokeStyle = 'rgba(244, 63, 94, 0.2)';
    ctx.lineWidth = 8;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

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
            ctx.strokeStyle = state.bgMode === 'white' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)';
            ctx.lineWidth = 0.5;
            for (let i = 0; i <= fs; i++) {
                ctx.beginPath();
                ctx.moveTo(fOx + i * cs, fOy);
                ctx.lineTo(fOx + i * cs, fOy + faceW);
                ctx.stroke();
                ctx.beginPath();
                ctx.moveTo(fOx, fOy + i * cs);
                ctx.lineTo(fOx + faceW, fOy + i * cs);
                ctx.stroke();
            }
        }

        // Tiles
        const lw = state.strandWidth;
        for (let r = 0; r < fs; r++) {
            for (let c = 0; c < fs; c++) {
                const ti = state.grid[face][r][c];
                if (ti > 0) {
                    drawTile(ctx, ti, fOx + c * cs, fOy + r * cs, cs, state.strandColor, lw, bgColor());
                }
            }
        }

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
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
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
        drawGlueEdge(o, fW, edge.side, color);
    });

    extraGlueEdges.forEach(edge => {
        const o = faceOrigin(edge.face);
        drawGlueEdge(o, fW, edge.side, edge.color);
    });

    // Also draw remaining free external edges (non-glued boundary of the net)
    // These are the outer boundary edges not covered above
    const outerColor = state.bgMode === 'white' ? 'rgba(0,0,0,0.08)' : 'rgba(255,255,255,0.06)';
    // left-N, left-S, left-W are glued; left only has no unglued edges actually
    // all external edges should be accounted for by the gluing
}

function drawGlueEdge(origin, fW, side, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.5;
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

function hitTest(sx, sy) {
    const { x: wx, y: wy } = screenToWorld(sx, sy);
    const cs = cellSize();

    if (state.surface === 'sphere') {
        const fs = state.faceSize;
        const net = sphereNetLayout();
        const netSz = sphereNetSize();
        const baseOx = -(netSz.w * cs) / 2;
        const baseOy = -(netSz.h * cs) / 2;

        for (const face of ['top', 'left', 'front', 'right', 'back', 'bottom']) {
            const layout = net[face];
            const fOx = baseOx + layout.ox * cs;
            const fOy = baseOy + layout.oy * cs;
            const lx = wx - fOx;
            const ly = wy - fOy;
            if (lx >= 0 && lx < fs * cs && ly >= 0 && ly < fs * cs) {
                return { face, row: Math.floor(ly / cs), col: Math.floor(lx / cs) };
            }
        }
        return null;
    } else {
        const n = state.gridSize;
        const ox = -(n * cs) / 2;
        const oy = -(n * cs) / 2;
        const lx = wx - ox;
        const ly = wy - oy;
        if (lx >= 0 && lx < n * cs && ly >= 0 && ly < n * cs) {
            return { row: Math.floor(ly / cs), col: Math.floor(lx / cs) };
        }
        return null;
    }
}

// ============================================================
// Tile placement
// ============================================================
function placeTile(hit, tileIndex) {
    if (!hit) return;
    if (getTileAt(hit) === tileIndex) return;
    setTileAt(hit, tileIndex);
    render();
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
    syncSliderToSurface();
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
    render();
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
        render();
    } else if (state.isDrawing) {
        const hit = hitTest(e.clientX, e.clientY);
        if (hit) strokeStep(hit);
    } else if (state.isPainting) {
        const hit = hitTest(e.clientX, e.clientY);
        if (hit) {
            const ti = state.selectedTile === -1 ? 0 : state.selectedTile;
            placeTile(hit, ti);
        }
    }
});

canvas.addEventListener('mouseup', () => {
    state.isPanning = false;
    state.isPainting = false;
    state.lastMouse = null;
    endStroke();
    canvas.style.cursor = state.drawMode ? 'crosshair' : 'grab';
});

canvas.addEventListener('mouseleave', () => {
    state.isPanning = false;
    state.isPainting = false;
    state.lastMouse = null;
    endStroke();
});

canvas.addEventListener('contextmenu', (e) => e.preventDefault());

// Zoom
canvas.addEventListener('wheel', (e) => {
    e.preventDefault();
    const delta = -e.deltaY * 0.001;
    const newZoom = Math.max(0.15, Math.min(6, state.zoom * (1 + delta)));
    const ratio = newZoom / state.zoom;
    state.pan.x = e.clientX - ratio * (e.clientX - state.pan.x);
    state.pan.y = e.clientY - ratio * (e.clientY - state.pan.y);
    state.zoom = newZoom;
    render();
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
        } else if (hit) {
            beginGesture();
            const ti = state.selectedTile === -1 ? 0 : state.selectedTile;
            placeTile(hit, ti);
            state.isPainting = true;
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
            render();
        } else if (state.isDrawing) {
            const hit = hitTest(touches[0].clientX, touches[0].clientY);
            if (hit) strokeStep(hit);
        } else if (state.isPainting) {
            const hit = hitTest(touches[0].clientX, touches[0].clientY);
            if (hit) {
                const ti = state.selectedTile === -1 ? 0 : state.selectedTile;
                placeTile(hit, ti);
            }
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
            const newZoom = Math.max(0.15, Math.min(6, state.zoom * scale));
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
        render();
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
        endStroke();
    }
});

// ============================================================
// Fit view
// ============================================================
function fitView() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    const cs = cellSize();
    let totalW, totalH;

    if (state.surface === 'sphere') {
        const netSz = sphereNetSize();
        totalW = netSz.w * cs;
        totalH = netSz.h * cs;
    } else {
        totalW = state.gridSize * cs;
        totalH = state.gridSize * cs;
    }

    const padding = 140;
    const scaleX = (w - padding * 2) / totalW;
    const scaleY = (h - padding * 2) / totalH;
    state.zoom = Math.min(scaleX, scaleY, 2.5);
    state.pan.x = w / 2;
    state.pan.y = h / 2;
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
    syncSliderToSurface();
    initGrid();
    updateHud();
    if (typeof populateExamples === 'function') populateExamples();
    if (typeof syncSmoothButtonVisibility === 'function') syncSmoothButtonVisibility();
    fitView();
}
surfaceSelect.addEventListener('change', onSurfaceChange);

// Grid size / face size (unified slider + editable number input)
const gridSlider = document.getElementById('grid-size-slider');
const gridInput = document.getElementById('grid-size-input');

function syncSliderToSurface() {
    if (state.surface === 'sphere') {
        gridSlider.min = 1;
        gridSlider.max = 16;
        gridInput.min = 1;
        gridInput.max = 60;
        gridSlider.value = Math.min(state.faceSize, 16);
        gridInput.value = state.faceSize;
    } else {
        gridSlider.min = 3;
        gridSlider.max = 25;
        gridInput.min = 3;
        gridInput.max = 60;
        gridSlider.value = Math.min(state.gridSize, 25);
        gridInput.value = state.gridSize;
    }
}

function applyGridSize(val) {
    const min = parseInt(gridInput.min) || 1;
    const max = parseInt(gridInput.max) || 60;
    val = Math.max(min, Math.min(max, val));
    if (state.surface === 'sphere') {
        state.faceSize = val;
    } else {
        state.gridSize = val;
    }
    gridSlider.value = Math.min(val, parseInt(gridSlider.max));
    gridInput.value = val;
    initGrid();
    updateHud();
    fitView();
}

// A slider drag fires many 'input' events; snapshot once per drag so the
// whole resize undoes in one step.
let sliderUndoCaptured = false;
gridSlider.addEventListener('input', () => {
    if (!sliderUndoCaptured) { pushUndo(); sliderUndoCaptured = true; }
    applyGridSize(parseInt(gridSlider.value));
});
gridSlider.addEventListener('change', () => { sliderUndoCaptured = false; });

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
    if (!ex) return;
    pushUndo();

    if (state.surface === 'sphere') {
        state.faceSize = ex.faceSize || state.faceSize;
        gridSlider.value = Math.min(state.faceSize, parseInt(gridSlider.max));
        gridInput.value = state.faceSize;
        // Deep copy face grids
        state.grid = {};
        for (const face of Object.keys(ex.grid)) {
            state.grid[face] = ex.grid[face].map(row => [...row]);
        }
    } else {
        state.gridSize = ex.gridSize || state.gridSize;
        gridSlider.value = Math.min(state.gridSize, parseInt(gridSlider.max));
        gridInput.value = state.gridSize;
        state.grid = ex.grid.map(row => [...row]);
    }

    state.selectedCells = [];
    updateHud();
    fitView();
});

populateExamples();

// Mismatch toggle
document.getElementById('show-connections-checkbox').addEventListener('change', (e) => {
    state.showMismatches = e.target.checked;
    render();
});



// Strand color
document.querySelectorAll('.color-swatch').forEach(swatch => {
    swatch.addEventListener('click', () => {
        document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');
        state.strandColor = swatch.dataset.color;
        buildPalette();
        render();
    });
});

// Background toggle
document.querySelectorAll('.bg-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
        document.querySelectorAll('.bg-toggle').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        state.bgMode = btn.dataset.bg;
        // Auto-switch strand color for contrast
        if (state.bgMode === 'white') {
            state.strandColor = '#111111';
        } else {
            state.strandColor = '#6c8aff';
        }
        // Update swatch selection to match
        document.querySelectorAll('.color-swatch').forEach(s => {
            s.classList.toggle('active', s.dataset.color === state.strandColor);
        });
        buildPalette();
        render();
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
        const msg = window.r3SizeGuardMessage('sphere', state.faceSize);
        if (msg) { alert(msg); return; }
        if (window.openCubeFold) window.openCubeFold();
    } else if (state.surface === 'torus') {
        const msg = window.r3SizeGuardMessage('torus', state.gridSize);
        if (msg) { alert(msg); return; }
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

// Panel toggle
const panel = document.getElementById('ui-panel');
document.getElementById('close-panel-btn').addEventListener('click', () => {
    panel.classList.add('hidden');
    document.getElementById('toggle-panel-btn').style.display = 'flex';
});
document.getElementById('toggle-panel-btn').addEventListener('click', () => {
    panel.classList.remove('hidden');
    document.getElementById('toggle-panel-btn').style.display = 'none';
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
// Texture cell size for R³ face/torus canvases. Fixed 96px/cell blows past
// browser memory once faceSize/gridSize climbs toward the new 60-cell 2D
// editing limit (6 × 5760² RGBA ≈ 800 MiB for a sphere). Cap the canvas
// edge at 2048px so R³ stays usable.
window.r3TextureCellSize = function (dim) {
    const d = Math.max(1, dim | 0);
    return Math.max(8, Math.min(96, Math.floor(2048 / d)));
};

// Hard ceilings for fold/smooth R³ views. Larger grids remain editable in 2D.
const R3_MAX_SPHERE_FACE = 16;
const R3_MAX_TORUS_GRID = 25;

window.r3SizeGuardMessage = function (surface, size) {
    if (surface === 'sphere' && size > R3_MAX_SPHERE_FACE) {
        return `Sphere face size ${size} is too large for the R³ fold view ` +
            `(max ${R3_MAX_SPHERE_FACE}). Larger sizes are fine for 2D editing — ` +
            `reduce the grid size before viewing in R³.`;
    }
    if (surface === 'torus' && size > R3_MAX_TORUS_GRID) {
        return `Torus grid size ${size} is too large for the R³ fold view ` +
            `(max ${R3_MAX_TORUS_GRID}). Larger sizes are fine for 2D editing — ` +
            `reduce the grid size before viewing in R³.`;
    }
    return null;
};

window.renderFaceTexture = function (faceName, showGrid, strandsOnly) {
    const fs = state.faceSize;
    const cs = window.r3TextureCellSize(fs);
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
    const lw = state.strandWidth * (cs / 64);
    const bg = strandsOnly ? 'rgba(0,0,0,0)' : bgColor();
    for (let r = 0; r < fs; r++) {
        for (let cc = 0; cc < fs; cc++) {
            const ti = state.grid[faceName]?.[r]?.[cc] ?? 0;
            if (ti > 0) {
                drawTile(cx, ti, cc * cs, r * cs, cs, state.strandColor, lw, bg);
            }
        }
    }

    return c;
};

// ============================================================
// Torus texture renderer (for 3D torus)
// ============================================================
window.renderTorusTexture = function (showGrid, strandsOnly) {
    const gs = state.gridSize;
    const cs = window.r3TextureCellSize(gs);
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
    const lw = state.strandWidth * (cs / 64);
    const bg = strandsOnly ? 'rgba(0,0,0,0)' : bgColor();
    for (let r = 0; r < gs; r++) {
        for (let cc = 0; cc < gs; cc++) {
            const ti = state.grid[r]?.[cc] ?? 0;
            if (ti > 0) {
                drawTile(cx, ti, cc * cs, r * cs, cs, state.strandColor, lw, bg);
            }
        }
    }

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
requestAnimationFrame(() => fitView());

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
