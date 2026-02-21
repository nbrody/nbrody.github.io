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
    selectedTile: -1,
    strandColor: '#6c8aff',
    strandWidth: 3,
    showGrid: true,
    showMismatches: true,

    // pan/zoom
    pan: { x: 0, y: 0 },
    zoom: 1,

    // interaction
    isPanning: false,
    isPainting: false,
    lastMouse: null,
    dragTile: -1,
    ghostEl: null,
    selectedCell: null,  // {row, col} or {face, row, col} — the cell selected for rotation
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
    ctx.fillStyle = '#0a0e1a';
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
    ctx.fillStyle = 'rgba(255,255,255,0.015)';
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
    const isTorus = state.surface === 'torus';

    // Shadow under grid
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.3)';
    ctx.shadowBlur = 30;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 10;
    ctx.fillStyle = 'rgba(10, 14, 26, 1)';
    ctx.fillRect(ox, oy, totalW, totalH);
    ctx.restore();

    // Cell backgrounds
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
            const x = ox + c * cs;
            const y = oy + r * cs;
            ctx.fillStyle = ((r + c) % 2 === 0) ? 'rgba(255,255,255,0.035)' : 'rgba(255,255,255,0.018)';
            ctx.fillRect(x, y, cs, cs);
        }
    }

    // Grid lines
    if (state.showGrid) {
        ctx.strokeStyle = 'rgba(255,255,255,0.08)';
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

    // Border
    if (!isTorus) {
        ctx.strokeStyle = 'rgba(108, 138, 255, 0.35)';
        ctx.lineWidth = 2;
        ctx.strokeRect(ox, oy, totalW, totalH);
    } else {
        ctx.save();
        ctx.setLineDash([6, 4]);
        ctx.strokeStyle = 'rgba(192, 132, 252, 0.4)';
        ctx.lineWidth = 2;
        ctx.strokeRect(ox, oy, totalW, totalH);
        ctx.restore();
        drawTorusArrows(ox, oy, totalW, totalH);
    }

    // Tiles
    const lw = state.strandWidth;
    for (let r = 0; r < n; r++) {
        for (let c = 0; c < n; c++) {
            const ti = state.grid[r][c];
            if (ti > 0) {
                drawTile(ctx, ti, ox + c * cs, oy + r * cs, cs, state.strandColor, lw);
            }
        }
    }

    // Selected cell highlight
    drawSelectedCellHighlight(ox, oy, cs);

    // Mismatches
    if (state.showMismatches) {
        drawMismatchesFlat(ox, oy, cs, n, isTorus);
    }
}

function drawTorusArrows(ox, oy, w, h) {
    const arrowLen = 14;
    const midX = ox + w / 2;
    const midY = oy + h / 2;

    // Horizontal identification (top & bottom edges)
    drawArrowPair(midX, oy - 6, arrowLen, 0, 'rgba(244, 114, 182, 0.5)');
    drawArrowPair(midX, oy + h + 6, arrowLen, 0, 'rgba(244, 114, 182, 0.5)');

    // Vertical identification (left & right edges)
    drawArrowPair(ox - 6, midY, arrowLen, Math.PI / 2, 'rgba(34, 211, 238, 0.5)');
    drawArrowPair(ox + w + 6, midY, arrowLen, Math.PI / 2, 'rgba(34, 211, 238, 0.5)');
}

function drawArrowPair(cx, cy, len, angle, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 1.5;
    ctx.translate(cx, cy);
    ctx.rotate(angle);

    // Arrow line
    ctx.beginPath();
    ctx.moveTo(-len, 0);
    ctx.lineTo(len, 0);
    ctx.stroke();

    // Arrowhead
    ctx.beginPath();
    ctx.moveTo(len, 0);
    ctx.lineTo(len - 5, -3);
    ctx.lineTo(len - 5, 3);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
}

function drawMismatchesFlat(ox, oy, cs, n, isTorus) {
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
            } else if (isTorus) {
                if (!connectionsMatch(ti, state.grid[r][0], 'E')) {
                    drawMismatchEdge(ox + n * cs, oy + r * cs, ox + n * cs, oy + (r + 1) * cs);
                }
            } else {
                // Disk boundary: strand going to edge = mismatch
                if (tile.connections.E) {
                    drawMismatchEdge(ox + n * cs, oy + r * cs, ox + n * cs, oy + (r + 1) * cs);
                }
            }

            // South
            if (r < n - 1) {
                if (!connectionsMatch(ti, state.grid[r + 1][c], 'S')) {
                    drawMismatchEdge(ox + c * cs, oy + (r + 1) * cs, ox + (c + 1) * cs, oy + (r + 1) * cs);
                }
            } else if (isTorus) {
                if (!connectionsMatch(ti, state.grid[0][c], 'S')) {
                    drawMismatchEdge(ox + c * cs, oy + n * cs, ox + (c + 1) * cs, oy + n * cs);
                }
            } else {
                if (tile.connections.S) {
                    drawMismatchEdge(ox + c * cs, oy + n * cs, ox + (c + 1) * cs, oy + n * cs);
                }
            }

            // Disk: North and West boundaries
            if (!isTorus) {
                if (r === 0 && tile.connections.N) {
                    drawMismatchEdge(ox + c * cs, oy, ox + (c + 1) * cs, oy);
                }
                if (c === 0 && tile.connections.W) {
                    drawMismatchEdge(ox, oy + r * cs, ox, oy + (r + 1) * cs);
                }
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
    const faceColors = {
        top: { bg: 'rgba(108, 138, 255, 0.07)', border: 'rgba(108, 138, 255, 0.3)' },
        front: { bg: 'rgba(192, 132, 252, 0.07)', border: 'rgba(192, 132, 252, 0.3)' },
        right: { bg: 'rgba(34, 211, 238, 0.07)', border: 'rgba(34, 211, 238, 0.3)' },
        back: { bg: 'rgba(52, 211, 153, 0.07)', border: 'rgba(52, 211, 153, 0.3)' },
        left: { bg: 'rgba(251, 191, 36, 0.07)', border: 'rgba(251, 191, 36, 0.3)' },
        bottom: { bg: 'rgba(244, 114, 182, 0.07)', border: 'rgba(244, 114, 182, 0.3)' },
    };

    for (const face of faces) {
        const layout = net[face];
        const fOx = baseOx + layout.ox * cs;
        const fOy = baseOy + layout.oy * cs;
        const faceW = fs * cs;
        const fc = faceColors[face];

        // Shadow
        ctx.save();
        ctx.shadowColor = 'rgba(0,0,0,0.2)';
        ctx.shadowBlur = 20;
        ctx.fillStyle = '#0a0e1a';
        ctx.fillRect(fOx, fOy, faceW, faceW);
        ctx.restore();

        // Face background
        ctx.fillStyle = fc.bg;
        ctx.fillRect(fOx, fOy, faceW, faceW);

        // Checkerboard
        for (let r = 0; r < fs; r++) {
            for (let c = 0; c < fs; c++) {
                if ((r + c) % 2 === 0) {
                    ctx.fillStyle = 'rgba(255,255,255,0.02)';
                    ctx.fillRect(fOx + c * cs, fOy + r * cs, cs, cs);
                }
            }
        }

        // Grid
        if (state.showGrid) {
            ctx.strokeStyle = 'rgba(255,255,255,0.06)';
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

        // Face border
        ctx.strokeStyle = fc.border;
        ctx.lineWidth = 1.5;
        ctx.strokeRect(fOx, fOy, faceW, faceW);

        // Face label (subtle, behind tiles)
        ctx.fillStyle = 'rgba(255,255,255,0.1)';
        ctx.font = `600 ${Math.max(10, cs * 0.2)}px Inter, sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(face.toUpperCase(), fOx + faceW / 2, fOy + faceW / 2);

        // Tiles
        const lw = state.strandWidth;
        for (let r = 0; r < fs; r++) {
            for (let c = 0; c < fs; c++) {
                const ti = state.grid[face][r][c];
                if (ti > 0) {
                    drawTile(ctx, ti, fOx + c * cs, fOy + r * cs, cs, state.strandColor, lw);
                }
            }
        }

        // Selected cell highlight (sphere)
        if (state.selectedCell && state.selectedCell.face === face) {
            const sc = state.selectedCell;
            drawCellHighlight(fOx + sc.col * cs, fOy + sc.row * cs, cs);
        }
    }

    // Fold indicators between adjacent net faces
    drawSphereSeamLabels(baseOx, baseOy, cs);
}

function drawSphereSeamLabels(baseOx, baseOy, cs) {
    const fs = state.faceSize;
    const net = sphereNetLayout();

    // Draw small fold indicator triangles at the exposed edges
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.font = '9px Inter, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Back-right edge is already shown in net
    // Back face east edge connects to left face west
    // These non-obvious connections get labels
    const backLayout = net['back'];
    const rightEdgeX = baseOx + (backLayout.ox + fs) * cs;
    const topY = baseOy + backLayout.oy * cs;

    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.textAlign = 'left';
    ctx.fillText('↰ left', rightEdgeX + 6, topY + fs * cs * 0.5);
    ctx.restore();

    // Top face north edge connects to back face north
    const topLayout = net['top'];
    const topNorthX = baseOx + topLayout.ox * cs + fs * cs / 2;
    const topNorthY = baseOy + topLayout.oy * cs;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.textAlign = 'center';
    ctx.fillText('↑ back', topNorthX, topNorthY - 8);
    ctx.restore();

    // Bottom face south edge connects to back face south
    const bottomLayout = net['bottom'];
    const botSouthX = baseOx + bottomLayout.ox * cs + fs * cs / 2;
    const botSouthY = baseOy + (bottomLayout.oy + fs) * cs;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.textAlign = 'center';
    ctx.fillText('↓ back', botSouthX, botSouthY + 12);
    ctx.restore();

    // Top face west edge connects to left face north
    const topLeftX = baseOx + topLayout.ox * cs;
    const topLeftY = baseOy + topLayout.oy * cs + fs * cs / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.textAlign = 'right';
    ctx.fillText('left ↰', topLeftX - 6, topLeftY);
    ctx.restore();

    // Top face east edge connects to right face north
    const topRightX = baseOx + (topLayout.ox + fs) * cs;
    const topRightY = baseOy + topLayout.oy * cs + fs * cs / 2;
    ctx.save();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.textAlign = 'left';
    ctx.fillText('↱ right', topRightX + 6, topRightY);
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
    if (state.surface === 'sphere') {
        if (state.grid[hit.face][hit.row][hit.col] === tileIndex) return;
        state.grid[hit.face][hit.row][hit.col] = tileIndex;
    } else {
        if (state.grid[hit.row][hit.col] === tileIndex) return;
        state.grid[hit.row][hit.col] = tileIndex;
    }
    render();
}

// ============================================================
// Selected cell highlight
// ============================================================
function drawSelectedCellHighlight(ox, oy, cs) {
    const sc = state.selectedCell;
    if (!sc || sc.face) return; // skip if null or sphere cell
    drawCellHighlight(ox + sc.col * cs, oy + sc.row * cs, cs);
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

function getSelectedCellTile() {
    const sc = state.selectedCell;
    if (!sc) return -1;
    if (state.surface === 'sphere') {
        return state.grid[sc.face]?.[sc.row]?.[sc.col] ?? -1;
    }
    return state.grid[sc.row]?.[sc.col] ?? -1;
}

function setSelectedCellTile(tileIndex) {
    const sc = state.selectedCell;
    if (!sc) return;
    if (state.surface === 'sphere') {
        state.grid[sc.face][sc.row][sc.col] = tileIndex;
    } else {
        state.grid[sc.row][sc.col] = tileIndex;
    }
    render();
}

// ============================================================
// Palette
// ============================================================
function buildPalette() {
    paletteTiles.innerHTML = '';

    // Eraser
    const eraserEl = createPaletteTile(-1);
    paletteTiles.appendChild(eraserEl);

    // All tile types
    TILE_TYPES.forEach((tile, i) => {
        const el = createPaletteTile(i);
        paletteTiles.appendChild(el);
    });
}

function createPaletteTile(index) {
    const el = document.createElement('div');
    const isEraser = index === -1;
    el.className = 'palette-tile' +
        (isEraser ? ' eraser-tile' : '') +
        (state.selectedTile === index ? ' selected' : '');

    const tileCanvas = document.createElement('canvas');
    const dpr = window.devicePixelRatio || 1;
    const sz = 48;
    tileCanvas.width = sz * dpr;
    tileCanvas.height = sz * dpr;
    tileCanvas.style.width = sz + 'px';
    tileCanvas.style.height = sz + 'px';
    const tctx = tileCanvas.getContext('2d');
    tctx.scale(dpr, dpr);

    if (isEraser) {
        // Draw X
        tctx.strokeStyle = 'rgba(244,63,94,0.7)';
        tctx.lineWidth = 2;
        tctx.lineCap = 'round';
        tctx.beginPath();
        tctx.moveTo(14, 14);
        tctx.lineTo(34, 34);
        tctx.moveTo(34, 14);
        tctx.lineTo(14, 34);
        tctx.stroke();
    } else if (index === 0) {
        // Blank: subtle dot
        tctx.fillStyle = 'rgba(255,255,255,0.15)';
        tctx.beginPath();
        tctx.arc(24, 24, 2.5, 0, Math.PI * 2);
        tctx.fill();
    } else {
        TILE_TYPES[index].draw(tctx, 4, 4, 40, state.strandColor, 2.5, '#0a0e1a');
    }

    el.appendChild(tileCanvas);

    const label = document.createElement('span');
    label.className = 'tile-label';
    label.textContent = isEraser ? '✕' : TILE_TYPES[index].name;
    el.appendChild(label);

    el.addEventListener('click', () => selectTile(index));
    el.addEventListener('mousedown', (e) => startDrag(e, index));

    return el;
}

function selectTile(index) {
    state.selectedTile = index;
    const tiles = paletteTiles.querySelectorAll('.palette-tile');
    tiles.forEach((el, i) => {
        const elIndex = i === 0 ? -1 : i - 1;
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

    if (tileIndex >= 0 && tileIndex > 0) {
        TILE_TYPES[tileIndex].draw(gctx, 6, 6, sz - 12, state.strandColor, 2.5, '#0a0e1a');
    } else if (tileIndex === 0) {
        gctx.fillStyle = 'rgba(255,255,255,0.15)';
        gctx.beginPath();
        gctx.arc(sz / 2, sz / 2, 3, 0, Math.PI * 2);
        gctx.fill();
    } else {
        gctx.strokeStyle = 'rgba(244,63,94,0.7)';
        gctx.lineWidth = 2;
        gctx.lineCap = 'round';
        gctx.beginPath();
        gctx.moveTo(16, 16);
        gctx.lineTo(sz - 16, sz - 16);
        gctx.moveTo(sz - 16, 16);
        gctx.lineTo(16, sz - 16);
        gctx.stroke();
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
            const ti = tileIndex >= 0 ? tileIndex : 0;
            placeTile(hit, ti);
            state.selectedCell = hit;
            selectTile(tileIndex);
        }
        state.dragTile = -1;
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
}

// ============================================================
// Canvas interaction (pan, zoom, click-to-place)
// ============================================================
canvas.addEventListener('mousedown', (e) => {
    if (e.button === 2) {
        e.preventDefault();
        const hit = hitTest(e.clientX, e.clientY);
        if (hit) {
            placeTile(hit, 0);
            state.selectedCell = hit;
        } else {
            state.selectedCell = null;
            render();
        }
        return;
    }
    if (e.button !== 0) return;

    const hit = hitTest(e.clientX, e.clientY);
    if (hit) {
        const ti = state.selectedTile === -1 ? 0 : state.selectedTile;
        placeTile(hit, ti);
        state.selectedCell = hit; // track for arrow-key rotation
        state.isPainting = true;
        state.isPanning = false;
    } else {
        state.selectedCell = null;
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
    canvas.style.cursor = 'grab';
});

canvas.addEventListener('mouseleave', () => {
    state.isPanning = false;
    state.isPainting = false;
    state.lastMouse = null;
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
        if (hit) {
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
    const surfaceLabel = state.surface.charAt(0).toUpperCase() + state.surface.slice(1);
    const sizeLabel = state.surface === 'sphere'
        ? `6×${state.faceSize}²`
        : `${state.gridSize}×${state.gridSize}`;
    hudInfo.textContent = `${surfaceLabel} · ${sizeLabel}`;
}

// Surface tabs
document.querySelectorAll('.surface-tab').forEach(tab => {
    tab.addEventListener('click', () => {
        document.querySelectorAll('.surface-tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        state.surface = tab.dataset.surface;
        document.getElementById('face-size-group').style.display =
            state.surface === 'sphere' ? '' : 'none';
        document.getElementById('fold-group').style.display =
            state.surface === 'sphere' ? '' : 'none';
        document.getElementById('fold-torus-group').style.display =
            state.surface === 'torus' ? '' : 'none';
        initGrid();
        updateHud();
        if (typeof populateExamples === 'function') populateExamples();
        fitView();
    });
});

// Grid size
const gridSlider = document.getElementById('grid-size-slider');
const gridVal = document.getElementById('grid-size-val');
gridSlider.addEventListener('input', () => {
    state.gridSize = parseInt(gridSlider.value);
    gridVal.textContent = state.gridSize;
    initGrid();
    updateHud();
    fitView();
});

// Face size
const faceSlider = document.getElementById('face-size-slider');
const faceVal = document.getElementById('face-size-val');
faceSlider.addEventListener('input', () => {
    state.faceSize = parseInt(faceSlider.value);
    faceVal.textContent = state.faceSize;
    initGrid();
    updateHud();
    fitView();
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

    if (state.surface === 'sphere') {
        state.faceSize = ex.faceSize || state.faceSize;
        faceSlider.value = state.faceSize;
        faceVal.textContent = state.faceSize;
        // Deep copy face grids
        state.grid = {};
        for (const face of Object.keys(ex.grid)) {
            state.grid[face] = ex.grid[face].map(row => [...row]);
        }
    } else {
        state.gridSize = ex.gridSize || state.gridSize;
        gridSlider.value = state.gridSize;
        gridVal.textContent = state.gridSize;
        state.grid = ex.grid.map(row => [...row]);
    }

    state.selectedCell = null;
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

// Clear
document.getElementById('clear-btn').addEventListener('click', () => {
    initGrid();
    render();
});

// Fit
document.getElementById('fit-btn').addEventListener('click', fitView);

// Export
document.getElementById('export-btn').addEventListener('click', () => {
    const link = document.createElement('a');
    link.download = `knot-mosaic-${state.surface}-${Date.now()}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
});

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

    // Number keys to select tiles: 0-9
    const num = parseInt(e.key);
    if (!isNaN(num)) {
        if (num === 0) {
            selectTile(-1); // eraser
        } else if (num - 1 < TILE_TYPES.length) {
            selectTile(num - 1);
        }
        return;
    }

    if (e.key === 'Escape') {
        selectTile(-1);
        state.selectedCell = null;
        render();
    } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        const ct = getSelectedCellTile();
        if (ct > 0) {
            setSelectedCellTile(rotateTileCW(ct));
        }
    } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const ct = getSelectedCellTile();
        if (ct > 0) {
            setSelectedCellTile(rotateTileCCW(ct));
        }
    } else if (e.key === 'f' || e.key === 'F') {
        fitView();
    } else if ((e.key === 'c' || e.key === 'C') && !e.metaKey && !e.ctrlKey) {
        initGrid();
        render();
    }
});

// Fold cube button
document.getElementById('fold-btn').addEventListener('click', () => {
    if (window.openCubeFold) window.openCubeFold();
});

// Fold torus button
document.getElementById('fold-torus-btn').addEventListener('click', () => {
    if (window.openTorusFold) window.openTorusFold();
});

// ============================================================
// Face texture renderer (for 3D cube)
// ============================================================
window.renderFaceTexture = function (faceName, showGrid, strandsOnly) {
    const fs = state.faceSize;
    const cs = 96;
    const size = fs * cs;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const cx = c.getContext('2d');

    if (!strandsOnly) {
        // Background
        cx.fillStyle = '#0a0e1a';
        cx.fillRect(0, 0, size, size);

        // Checkerboard
        for (let r = 0; r < fs; r++) {
            for (let cc = 0; cc < fs; cc++) {
                if ((r + cc) % 2 === 0) {
                    cx.fillStyle = 'rgba(255,255,255,0.035)';
                    cx.fillRect(cc * cs, r * cs, cs, cs);
                }
            }
        }

        // Grid lines
        if (showGrid) {
            cx.strokeStyle = 'rgba(255,255,255,0.1)';
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
    const bgColor = strandsOnly ? 'rgba(0,0,0,0)' : '#0a0e1a';
    for (let r = 0; r < fs; r++) {
        for (let cc = 0; cc < fs; cc++) {
            const ti = state.grid[faceName]?.[r]?.[cc] ?? 0;
            if (ti > 0) {
                drawTile(cx, ti, cc * cs, r * cs, cs, state.strandColor, lw, bgColor);
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
    const cs = 96;
    const size = gs * cs;
    const c = document.createElement('canvas');
    c.width = size;
    c.height = size;
    const cx = c.getContext('2d');

    if (!strandsOnly) {
        // Background
        cx.fillStyle = '#0a0e1a';
        cx.fillRect(0, 0, size, size);

        // Checkerboard
        for (let r = 0; r < gs; r++) {
            for (let cc = 0; cc < gs; cc++) {
                if ((r + cc) % 2 === 0) {
                    cx.fillStyle = 'rgba(255,255,255,0.035)';
                    cx.fillRect(cc * cs, r * cs, cs, cs);
                }
            }
        }

        // Grid lines
        if (showGrid) {
            cx.strokeStyle = 'rgba(255,255,255,0.1)';
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
    const bgColor = strandsOnly ? 'rgba(0,0,0,0)' : '#0a0e1a';
    for (let r = 0; r < gs; r++) {
        for (let cc = 0; cc < gs; cc++) {
            const ti = state.grid[r]?.[cc] ?? 0;
            if (ti > 0) {
                drawTile(cx, ti, cc * cs, r * cs, cs, state.strandColor, lw, bgColor);
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
