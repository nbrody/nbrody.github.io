// Khet Board Renderer
import { COLS, ROWS, PLAYER, PIECE_TYPE, DIR, DX, DY } from './engine.js';

const CELL_SIZE = 70;
const BOARD_PADDING = 40;
const BOARD_WIDTH = COLS * CELL_SIZE;
const BOARD_HEIGHT = ROWS * CELL_SIZE;

// Color palette
const COLORS = {
    boardDark: '#1a1a2e',
    boardLight: '#16213e',
    gridLine: '#0f3460',
    silverZone: 'rgba(192, 192, 255, 0.08)',
    redZone: 'rgba(255, 192, 192, 0.08)',
    silverPiece: '#b8c6db',
    silverPieceDark: '#8a9ab5',
    silverAccent: '#6c8ebf',
    redPiece: '#e74c3c',
    redPieceDark: '#c0392b',
    redAccent: '#ff6b6b',
    laserSilver: '#4fc3f7',
    laserRed: '#ff5252',
    highlight: 'rgba(255, 215, 0, 0.3)',
    selected: 'rgba(255, 215, 0, 0.5)',
    moveTarget: 'rgba(100, 255, 100, 0.3)',
    mirror: '#f0e68c',
    mirrorShine: '#fffacd',
    pharaohGold: '#ffd700',
    anubisBlue: '#1e90ff',
    anubisRed: '#dc143c',
    hit: 'rgba(255, 0, 0, 0.6)',
};

export class KhetRenderer {
    constructor(canvas, game) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.game = game;

        this.selectedPiece = null; // {col, row}
        this.validMoves = [];
        this.hoverCell = null;
        this.animatingLaser = false;
        this.laserProgress = 0;
        this.laserAnimDuration = 800; // ms
        this.hitFlashProgress = 0;

        this.lastMove = null;      // {from:{col,row}, to:{col,row}}
        this.previewPath = null;   // faint laser path for the move under the cursor
        this.now = 0;              // timestamp for idle pulse animations

        this.pieceAnimations = []; // {type, piece, startX, startY, endX, endY, startFacing, endFacing, progress}

        this.setupCanvas();
        this.bindEvents();
        this.startIdleLoop();
    }

    // A light rAF loop that keeps subtle effects (selection pulse, sphinx glow,
    // move-dot breathing) alive — but only repaints while something is animated,
    // so an idle board costs nothing.
    startIdleLoop() {
        const loop = (t) => {
            this.now = t;
            const needsPaint = this.selectedPiece || this.hoverCell ||
                this.animatingLaser || this.pieceAnimations.length > 0;
            if (needsPaint) this.render();
            requestAnimationFrame(loop);
        };
        requestAnimationFrame(loop);
    }

    setLastMove(squares) {
        this.lastMove = squares;
        this.render();
    }

    setupCanvas() {
        const totalWidth = BOARD_WIDTH + BOARD_PADDING * 2;
        const totalHeight = BOARD_HEIGHT + BOARD_PADDING * 2;

        // Handle high-DPI
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = totalWidth * dpr;
        this.canvas.height = totalHeight * dpr;
        this.canvas.style.width = totalWidth + 'px';
        this.canvas.style.height = totalHeight + 'px';
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.dpr = dpr;
    }

    cellToPixel(col, row) {
        return {
            x: BOARD_PADDING + col * CELL_SIZE + CELL_SIZE / 2,
            y: BOARD_PADDING + (ROWS - 1 - row) * CELL_SIZE + CELL_SIZE / 2
        };
    }

    pixelToCell(px, py) {
        const col = Math.floor((px - BOARD_PADDING) / CELL_SIZE);
        const row = (ROWS - 1) - Math.floor((py - BOARD_PADDING) / CELL_SIZE);
        if (col >= 0 && col < COLS && row >= 0 && row < ROWS) {
            return { col, row };
        }
        return null;
    }

    getMousePos(e) {
        const rect = this.canvas.getBoundingClientRect();
        return {
            x: (e.clientX - rect.left),
            y: (e.clientY - rect.top)
        };
    }

    bindEvents() {
        // Pointer events cover mouse + touch + pen in one path.
        this.canvas.addEventListener('pointermove', (e) => {
            const pos = this.getMousePos(e);
            const cell = this.pixelToCell(pos.x, pos.y);
            this.updateHover(cell);
        });

        this.canvas.addEventListener('pointerleave', () => {
            this.updateHover(null);
        });
    }

    // Update hover cell and recompute the laser preview for the move under it.
    updateHover(cell) {
        const changed = (cell?.col) !== (this.hoverCell?.col) || (cell?.row) !== (this.hoverCell?.row);
        this.hoverCell = cell;

        if (changed) {
            this.previewPath = null;
            if (this.selectedPiece && cell) {
                const move = this.validMoves.find(
                    m => (m.type === 'move' || m.type === 'swap') && m.toCol === cell.col && m.toRow === cell.row
                );
                if (move) {
                    const g = this.game.clone();
                    g.applyMove(move);
                    this.previewPath = g.lastLaserPath;
                }
            }
        }
        this.render();
    }

    // Set click handler (called from main.js)
    onClick(handler) {
        this.canvas.addEventListener('click', (e) => {
            const pos = this.getMousePos(e);
            const cell = this.pixelToCell(pos.x, pos.y);
            handler(cell, e);
        });
    }

    setSelection(col, row, validMoves) {
        this.selectedPiece = { col, row };
        this.validMoves = validMoves;
        this.render();
    }

    clearSelection() {
        this.selectedPiece = null;
        this.validMoves = [];
        this.previewPath = null;
        this.render();
    }

    // ========================
    // Piece Animations
    // ========================

    async animatePiece(move) {
        const piece = this.game.getAt(move.col, move.row);
        if (!piece) return;

        const duration = 250; // ms
        const startTime = performance.now();

        const anim = {
            moveType: move.type,
            piece: piece.clone(),
            startCol: move.col,
            startRow: move.row,
            endCol: move.toCol ?? move.col,
            endRow: move.toRow ?? move.row,
            startFacing: piece.facing,
            endFacing: move.type === 'rotate' ?
                (move.toFacing !== undefined ? move.toFacing : (piece.facing + (move.dir || 0) + 4) % 4) :
                piece.facing,
            progress: 0
        };

        // Handle swap: second piece
        let anim2 = null;
        if (move.type === 'swap') {
            const piece2 = this.game.getAt(move.toCol, move.toRow);
            anim2 = {
                moveType: 'move',
                piece: piece2.clone(),
                startCol: move.toCol,
                startRow: move.toRow,
                endCol: move.col,
                endRow: move.row,
                progress: 0
            };
            this.pieceAnimations.push(anim2);
        }

        this.pieceAnimations.push(anim);

        return new Promise(resolve => {
            const animate = (time) => {
                const elapsed = time - startTime;
                const progress = Math.min(elapsed / duration, 1);

                // Ease out quad
                const eased = progress * (2 - progress);

                anim.progress = eased;
                if (anim2) anim2.progress = eased;

                this.render();

                if (progress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    this.pieceAnimations = this.pieceAnimations.filter(a => a !== anim && a !== anim2);
                    this.render();
                    resolve();
                }
            };
            requestAnimationFrame(animate);
        });
    }

    // ========================
    // Laser Animation
    // ========================

    async animateLaser(callback) {
        this.animatingLaser = true;
        this.laserProgress = 0;
        const startTime = performance.now();

        return new Promise(resolve => {
            const animate = (time) => {
                const elapsed = time - startTime;
                this.laserProgress = Math.min(elapsed / this.laserAnimDuration, 1);
                this.render();

                if (this.laserProgress < 1) {
                    requestAnimationFrame(animate);
                } else {
                    // Flash hit piece
                    if (this.game.lastHitPiece) {
                        this.animateHit(resolve);
                    } else {
                        this.animatingLaser = false;
                        resolve();
                    }
                }
            };
            requestAnimationFrame(animate);
        });
    }

    animateHit(callback) {
        const startTime = performance.now();
        const duration = 400;

        const animate = (time) => {
            const elapsed = time - startTime;
            this.hitFlashProgress = Math.min(elapsed / duration, 1);
            this.render();

            if (this.hitFlashProgress < 1) {
                requestAnimationFrame(animate);
            } else {
                this.animatingLaser = false;
                this.hitFlashProgress = 0;
                callback();
            }
        };
        requestAnimationFrame(animate);
    }

    // ========================
    // Rendering
    // ========================

    render() {
        const ctx = this.ctx;
        const totalWidth = BOARD_WIDTH + BOARD_PADDING * 2;
        const totalHeight = BOARD_HEIGHT + BOARD_PADDING * 2;

        // Background
        ctx.fillStyle = '#0a0a1a';
        ctx.fillRect(0, 0, totalWidth, totalHeight);

        this.drawBoard();
        this.drawLastMove();
        this.drawPieces();
        this.drawAnimations();
        this.drawHighlights();
        if (this.previewPath && !this.animatingLaser) {
            this.drawLaserPath(this.previewPath, { preview: true });
        }
        if (this.animatingLaser || this.game.lastLaserPath.length > 0) {
            this.drawLaser();
        }
        this.drawBoardLabels();
    }

    drawLastMove() {
        if (!this.lastMove) return;
        const ctx = this.ctx;
        const cells = [this.lastMove.from, this.lastMove.to];
        for (const c of cells) {
            if (!c) continue;
            const { x, y } = this.cellToPixel(c.col, c.row);
            const rx = x - CELL_SIZE / 2, ry = y - CELL_SIZE / 2;
            ctx.fillStyle = 'rgba(255, 215, 0, 0.10)';
            ctx.fillRect(rx, ry, CELL_SIZE, CELL_SIZE);
            ctx.strokeStyle = 'rgba(255, 215, 0, 0.35)';
            ctx.lineWidth = 1.5;
            ctx.strokeRect(rx + 1.5, ry + 1.5, CELL_SIZE - 3, CELL_SIZE - 3);
        }
    }

    drawBoard() {
        const ctx = this.ctx;

        // Draw board background with subtle pattern
        for (let row = 0; row < ROWS; row++) {
            for (let col = 0; col < COLS; col++) {
                const { x, y } = this.cellToPixel(col, row);
                const rx = x - CELL_SIZE / 2;
                const ry = y - CELL_SIZE / 2;

                // Alternating dark squares (logic stays same for checkerboard)
                ctx.fillStyle = (row + col) % 2 === 0 ? COLORS.boardDark : COLORS.boardLight;
                ctx.fillRect(rx, ry, CELL_SIZE, CELL_SIZE);

                // Color zones (Forbidden squares)
                // Silver: Column J (9), B1 (1,0), B8 (1,7)
                if (col === 9 || (col === 1 && (row === 0 || row === 7))) {
                    ctx.fillStyle = COLORS.silverZone;
                    ctx.fillRect(rx, ry, CELL_SIZE, CELL_SIZE);
                }
                // Red: Column A (0), I1 (8,0), I8 (8,7)
                else if (col === 0 || (col === 8 && (row === 0 || row === 7))) {
                    ctx.fillStyle = COLORS.redZone;
                    ctx.fillRect(rx, ry, CELL_SIZE, CELL_SIZE);
                }
            }
        }

        // Grid lines
        ctx.strokeStyle = COLORS.gridLine;
        ctx.lineWidth = 1;
        for (let row = 0; row <= ROWS; row++) {
            ctx.beginPath();
            ctx.moveTo(BOARD_PADDING, BOARD_PADDING + row * CELL_SIZE);
            ctx.lineTo(BOARD_PADDING + BOARD_WIDTH, BOARD_PADDING + row * CELL_SIZE);
            ctx.stroke();
        }
        for (let col = 0; col <= COLS; col++) {
            ctx.beginPath();
            ctx.moveTo(BOARD_PADDING + col * CELL_SIZE, BOARD_PADDING);
            ctx.lineTo(BOARD_PADDING + col * CELL_SIZE, BOARD_PADDING + BOARD_HEIGHT);
            ctx.stroke();
        }

        // Board border glow
        ctx.strokeStyle = '#1a4a8a';
        ctx.lineWidth = 2;
        ctx.strokeRect(BOARD_PADDING, BOARD_PADDING, BOARD_WIDTH, BOARD_HEIGHT);

        // Outer glow
        ctx.shadowColor = '#1a4a8a';
        ctx.shadowBlur = 15;
        ctx.strokeRect(BOARD_PADDING, BOARD_PADDING, BOARD_WIDTH, BOARD_HEIGHT);
        ctx.shadowBlur = 0;
    }

    drawBoardLabels() {
        const ctx = this.ctx;
        ctx.fillStyle = '#4a5a7a';
        ctx.font = '11px "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        // Column labels
        for (let col = 0; col < COLS; col++) {
            const x = BOARD_PADDING + col * CELL_SIZE + CELL_SIZE / 2;
            ctx.fillText(String.fromCharCode(65 + col), x, BOARD_PADDING - 15);
            ctx.fillText(String.fromCharCode(65 + col), x, BOARD_PADDING + BOARD_HEIGHT + 15);
        }

        // Row labels
        for (let row = 0; row < ROWS; row++) {
            const { y } = this.cellToPixel(0, row);
            ctx.fillText(String(row + 1), BOARD_PADDING - 15, y);
            ctx.fillText(String(row + 1), BOARD_PADDING + BOARD_WIDTH + 15, y);
        }
    }

    drawPieces() {
        for (let row = 0; row < ROWS; row++) {
            for (let col = 0; col < COLS; col++) {
                const piece = this.game.getAt(col, row);
                if (!piece) continue;

                // Skip if this piece is currently being animated
                const isAnimating = this.pieceAnimations.some(a =>
                    (a.startCol === col && a.startRow === row)
                );
                if (isAnimating) continue;

                this.drawPiece(col, row, piece);
            }
        }
    }

    drawAnimations() {
        for (const anim of this.pieceAnimations) {
            const startPos = this.cellToPixel(anim.startCol, anim.startRow);
            const endPos = this.cellToPixel(anim.endCol, anim.endRow);

            const x = startPos.x + (endPos.x - startPos.x) * anim.progress;
            const y = startPos.y + (endPos.y - startPos.y) * anim.progress;

            let facing = anim.startFacing;
            if (anim.moveType === 'rotate') {
                // Shortest rotation path
                let diff = anim.endFacing - anim.startFacing;
                if (diff > 2) diff -= 4;
                if (diff < -2) diff += 4;
                facing = anim.startFacing + diff * anim.progress;
            }

            const ctx = this.ctx;
            const r = CELL_SIZE * 0.38;
            const isSilver = anim.piece.player === PLAYER.SILVER;
            const primary = isSilver ? COLORS.silverPiece : COLORS.redPiece;
            const dark = isSilver ? COLORS.silverPieceDark : COLORS.redPieceDark;
            const accent = isSilver ? COLORS.silverAccent : COLORS.redAccent;

            ctx.save();
            ctx.translate(x, y);
            const angle = facing * Math.PI / 2;

            switch (anim.piece.type) {
                case PIECE_TYPE.PHARAOH: this.drawPharaoh(ctx, r, primary, dark, accent, angle, isSilver); break;
                case PIECE_TYPE.SPHINX: this.drawSphinx(ctx, r, primary, dark, accent, angle, isSilver); break;
                case PIECE_TYPE.PYRAMID: this.drawPyramid(ctx, r, primary, dark, angle, isSilver); break;
                case PIECE_TYPE.SCARAB: this.drawScarab(ctx, r, primary, dark, accent, angle, isSilver); break;
                case PIECE_TYPE.ANUBIS: this.drawAnubis(ctx, r, primary, dark, accent, angle, isSilver); break;
            }
            ctx.restore();
        }
    }

    drawPiece(col, row, piece) {
        const ctx = this.ctx;
        const { x, y } = this.cellToPixel(col, row);
        const r = CELL_SIZE * 0.38;

        const isSilver = piece.player === PLAYER.SILVER;
        const primary = isSilver ? COLORS.silverPiece : COLORS.redPiece;
        const dark = isSilver ? COLORS.silverPieceDark : COLORS.redPieceDark;
        const accent = isSilver ? COLORS.silverAccent : COLORS.redAccent;

        ctx.save();
        ctx.translate(x, y);

        // Rotation for facing direction
        const angle = piece.facing * Math.PI / 2;

        switch (piece.type) {
            case PIECE_TYPE.PHARAOH:
                this.drawPharaoh(ctx, r, primary, dark, accent, angle, isSilver);
                break;
            case PIECE_TYPE.SPHINX:
                this.drawSphinx(ctx, r, primary, dark, accent, angle, isSilver);
                break;
            case PIECE_TYPE.PYRAMID:
                this.drawPyramid(ctx, r, primary, dark, angle, isSilver);
                break;
            case PIECE_TYPE.SCARAB:
                this.drawScarab(ctx, r, primary, dark, accent, angle, isSilver);
                break;
            case PIECE_TYPE.ANUBIS:
                this.drawAnubis(ctx, r, primary, dark, accent, angle, isSilver);
                break;
        }

        ctx.restore();
    }

    drawPharaoh(ctx, r, primary, dark, accent, angle, isSilver) {
        // Ornate circular piece with crown symbol
        const gradient = ctx.createRadialGradient(0, -r * 0.2, 0, 0, 0, r);
        gradient.addColorStop(0, COLORS.pharaohGold);
        gradient.addColorStop(0.7, isSilver ? '#a0a0c0' : '#cc3333');
        gradient.addColorStop(1, dark);

        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.fillStyle = gradient;
        ctx.fill();

        // Border
        ctx.strokeStyle = COLORS.pharaohGold;
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Crown symbol (ankh-like)
        ctx.save();
        ctx.rotate(angle);
        ctx.strokeStyle = COLORS.pharaohGold;
        ctx.lineWidth = 2;

        // Cross
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.5);
        ctx.lineTo(0, r * 0.5);
        ctx.moveTo(-r * 0.25, -r * 0.1);
        ctx.lineTo(r * 0.25, -r * 0.1);
        ctx.stroke();

        // Loop
        ctx.beginPath();
        ctx.arc(0, -r * 0.5, r * 0.2, 0, Math.PI * 2);
        ctx.stroke();

        // Direction indicator
        ctx.fillStyle = COLORS.pharaohGold;
        ctx.beginPath();
        ctx.moveTo(0, -r * 0.85);
        ctx.lineTo(-r * 0.1, -r * 0.7);
        ctx.lineTo(r * 0.1, -r * 0.7);
        ctx.closePath();
        ctx.fill();

        ctx.restore();

        // Glow
        ctx.shadowColor = COLORS.pharaohGold;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(255, 215, 0, 0.3)';
        ctx.lineWidth = 1;
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    drawSphinx(ctx, r, primary, dark, accent, angle, isSilver) {
        // Square piece with laser emitter
        ctx.save();
        ctx.rotate(angle);

        const size = r * 0.85;
        const gradient = ctx.createLinearGradient(-size, -size, size, size);
        gradient.addColorStop(0, primary);
        gradient.addColorStop(1, dark);

        ctx.fillStyle = gradient;
        ctx.fillRect(-size, -size, size * 2, size * 2);

        ctx.strokeStyle = accent;
        ctx.lineWidth = 2;
        ctx.strokeRect(-size, -size, size * 2, size * 2);

        // Laser emitter (triangle)
        const laserColor = isSilver ? COLORS.laserSilver : COLORS.laserRed;
        ctx.fillStyle = laserColor;
        ctx.beginPath();
        ctx.moveTo(0, -size * 1.1);
        ctx.lineTo(-size * 0.3, -size * 0.5);
        ctx.lineTo(size * 0.3, -size * 0.5);
        ctx.closePath();
        ctx.fill();

        // Laser glow
        ctx.shadowColor = laserColor;
        ctx.shadowBlur = 12;
        ctx.fill();
        ctx.shadowBlur = 0;

        // Eye symbol
        ctx.fillStyle = laserColor;
        ctx.beginPath();
        ctx.arc(0, size * 0.2, size * 0.25, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = dark;
        ctx.beginPath();
        ctx.arc(0, size * 0.2, size * 0.12, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    drawPyramid(ctx, r, primary, dark, angle, isSilver) {
        ctx.save();
        // Facing → triangle half → mirror type (must match engine.js PYRAMID_CONFIG):
        //   N(0): NE triangle, \ mirror. Solid: N, E
        //   E(1): SE triangle, / mirror. Solid: S, E
        //   S(2): SW triangle, \ mirror. Solid: S, W
        //   W(3): NW triangle, / mirror. Solid: N, W

        // Draw the triangle based on facing
        const s = r * 0.9; // half-size

        // Triangle vertices for each facing:
        let verts;
        const facing = Math.round(angle / (Math.PI / 2)) % 4;

        switch (facing) {
            case 0: // N: NE triangle - point at NE, mirror from N to E
                verts = [[-s, -s], [s, -s], [s, s]]; // top-left, top-right, bottom-right
                break;
            case 1: // E: SE triangle
                verts = [[s, -s], [s, s], [-s, s]]; // top-right, bottom-right, bottom-left
                break;
            case 2: // S: SW triangle
                verts = [[s, s], [-s, s], [-s, -s]]; // bottom-right, bottom-left, top-left
                break;
            case 3: // W: NW triangle
                verts = [[-s, s], [-s, -s], [s, -s]]; // bottom-left, top-left, top-right
                break;
        }

        // Fill triangle
        const gradient = ctx.createLinearGradient(verts[0][0], verts[0][1], verts[2][0], verts[2][1]);
        gradient.addColorStop(0, primary);
        gradient.addColorStop(1, dark);

        ctx.beginPath();
        ctx.moveTo(verts[0][0], verts[0][1]);
        ctx.lineTo(verts[1][0], verts[1][1]);
        ctx.lineTo(verts[2][0], verts[2][1]);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();

        // Border
        ctx.strokeStyle = isSilver ? COLORS.silverAccent : COLORS.redAccent;
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Mirror (hypotenuse) - the third edge
        ctx.beginPath();
        ctx.moveTo(verts[0][0], verts[0][1]);
        ctx.lineTo(verts[2][0], verts[2][1]);
        ctx.strokeStyle = COLORS.mirror;
        ctx.lineWidth = 3;
        ctx.stroke();

        // Mirror shine
        ctx.strokeStyle = COLORS.mirrorShine;
        ctx.lineWidth = 1;
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        const mx = (verts[0][0] + verts[2][0]) / 2;
        const my = (verts[0][1] + verts[2][1]) / 2;
        ctx.moveTo(mx - (verts[2][0] - verts[0][0]) * 0.15, my - (verts[2][1] - verts[0][1]) * 0.15);
        ctx.lineTo(mx + (verts[2][0] - verts[0][0]) * 0.15, my + (verts[2][1] - verts[0][1]) * 0.15);
        ctx.stroke();
        ctx.globalAlpha = 1;

        ctx.restore();
    }

    drawScarab(ctx, r, primary, dark, accent, angle, isSilver) {
        ctx.save();
        ctx.rotate(angle);

        const s = r * 0.8;

        const gradient = ctx.createRadialGradient(0, 0, 0, 0, 0, s * 1.2);
        gradient.addColorStop(0, primary);
        gradient.addColorStop(1, dark);

        // Rounded rectangle helper
        const roundRect = (x, y, w, h, radius) => {
            ctx.beginPath();
            ctx.moveTo(x + radius, y);
            ctx.lineTo(x + w - radius, y);
            ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
            ctx.lineTo(x + w, y + h - radius);
            ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
            ctx.lineTo(x + radius, y + h);
            ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
            ctx.lineTo(x, y + radius);
            ctx.quadraticCurveTo(x, y, x + radius, y);
            ctx.closePath();
        };

        // Body
        roundRect(-s, -s, s * 2, s * 2, s * 0.3);
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.strokeStyle = accent;
        ctx.lineWidth = 2;
        ctx.stroke();

        // --- Inactive mirror: thin dashed gray (the other diagonal) ---
        ctx.save();
        ctx.setLineDash([4, 4]);
        ctx.strokeStyle = 'rgba(150, 150, 150, 0.25)';
        ctx.lineWidth = 1.5;
        // Draw / diagonal as inactive relative to base \ orientation
        ctx.beginPath();
        ctx.moveTo(-s * 0.7, s * 0.7);
        ctx.lineTo(s * 0.7, -s * 0.7);
        ctx.stroke();
        ctx.restore();

        // --- Active mirror: thick bright line with glow (base orientation: \) ---
        ctx.save();
        ctx.shadowColor = COLORS.mirror;
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.moveTo(-s * 0.75, -s * 0.75);
        ctx.lineTo(s * 0.75, s * 0.75);
        ctx.strokeStyle = COLORS.mirror;
        ctx.lineWidth = 4;
        ctx.stroke();
        // Mirror shine highlight
        ctx.beginPath();
        ctx.moveTo(-s * 0.3, -s * 0.3);
        ctx.lineTo(s * 0.3, s * 0.3);
        ctx.strokeStyle = COLORS.mirrorShine;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();

        // --- Small deflection arrows at mirror endpoints ---
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = COLORS.mirrorShine;
        ctx.lineWidth = 1.5;
        const arrowLen = s * 0.2;
        // \ mirror base arrows: reflects N->E (top-left points rightish) and W->S
        // For \, entry from N (top) hits and goes E (right).
        // Let's just draw two arrows indicating deflection.
        this.drawMiniArrow(ctx, -s * 0.75, -s * 0.75, arrowLen, 0); // Top left pointing right
        this.drawMiniArrow(ctx, s * 0.75, s * 0.75, -arrowLen, 0);  // Bottom right pointing left
        ctx.globalAlpha = 1;

        // Scarab beetle symbol (small centered emblem)
        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.4;
        ctx.beginPath();
        ctx.ellipse(0, 0, s * 0.15, s * 0.22, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.restore();
    }

    // Mini arrow helper for scarab deflection indicators
    drawMiniArrow(ctx, x, y, dx, dy) {
        const headLen = 4;
        const angle = Math.atan2(dy, dx);
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + dx, y + dy);
        ctx.lineTo(x + dx - headLen * Math.cos(angle - 0.5), y + dy - headLen * Math.sin(angle - 0.5));
        ctx.moveTo(x + dx, y + dy);
        ctx.lineTo(x + dx - headLen * Math.cos(angle + 0.5), y + dy - headLen * Math.sin(angle + 0.5));
        ctx.stroke();
    }

    drawAnubis(ctx, r, primary, dark, accent, angle, isSilver) {
        ctx.save();
        ctx.rotate(angle);

        // Shield-shaped piece
        const s = r * 0.85;
        const gradient = ctx.createLinearGradient(0, -s, 0, s);
        gradient.addColorStop(0, primary);
        gradient.addColorStop(1, dark);

        // Shield shape
        ctx.beginPath();
        ctx.moveTo(-s * 0.7, -s);
        ctx.lineTo(s * 0.7, -s);
        ctx.lineTo(s * 0.85, -s * 0.3);
        ctx.lineTo(s * 0.85, s * 0.5);
        ctx.lineTo(0, s);
        ctx.lineTo(-s * 0.85, s * 0.5);
        ctx.lineTo(-s * 0.85, -s * 0.3);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();

        ctx.strokeStyle = accent;
        ctx.lineWidth = 2;
        ctx.stroke();

        // Front face indicator (immune side) - top edge
        ctx.beginPath();
        ctx.moveTo(-s * 0.7, -s);
        ctx.lineTo(s * 0.7, -s);
        ctx.strokeStyle = isSilver ? '#4fc3f7' : '#ff5252';
        ctx.lineWidth = 4;
        ctx.lineCap = 'round';
        ctx.stroke();
        ctx.lineCap = 'butt';

        // Anubis jackal head symbol
        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.6;
        // Simple jackal ear silhouette
        ctx.beginPath();
        ctx.moveTo(-s * 0.15, -s * 0.6);
        ctx.lineTo(-s * 0.3, -s * 0.2);
        ctx.lineTo(0, -s * 0.3);
        ctx.lineTo(s * 0.3, -s * 0.2);
        ctx.lineTo(s * 0.15, -s * 0.6);
        ctx.closePath();
        ctx.fill();

        // Snout
        ctx.beginPath();
        ctx.moveTo(-s * 0.1, -s * 0.2);
        ctx.lineTo(s * 0.1, -s * 0.2);
        ctx.lineTo(0, s * 0.2);
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 1;

        ctx.restore();
    }

    drawHighlights() {
        const ctx = this.ctx;

        // Hover highlight
        if (this.hoverCell && !this.animatingLaser) {
            const { col, row } = this.hoverCell;
            const { x, y } = this.cellToPixel(col, row);
            const rx = x - CELL_SIZE / 2;
            const ry = y - CELL_SIZE / 2;

            ctx.fillStyle = COLORS.highlight;
            ctx.fillRect(rx, ry, CELL_SIZE, CELL_SIZE);
        }

        // Selected piece
        if (this.selectedPiece) {
            const { col, row } = this.selectedPiece;
            const { x, y } = this.cellToPixel(col, row);
            const rx = x - CELL_SIZE / 2;
            const ry = y - CELL_SIZE / 2;

            const pulse = 0.5 + 0.5 * Math.sin(this.now / 250);
            ctx.fillStyle = COLORS.selected;
            ctx.fillRect(rx, ry, CELL_SIZE, CELL_SIZE);

            // Pulsing glow border
            ctx.save();
            ctx.shadowColor = 'rgba(255, 215, 0, 0.8)';
            ctx.shadowBlur = 6 + pulse * 12;
            ctx.strokeStyle = `rgba(255, 215, 0, ${0.6 + pulse * 0.4})`;
            ctx.lineWidth = 2.5;
            ctx.strokeRect(rx + 1.5, ry + 1.5, CELL_SIZE - 3, CELL_SIZE - 3);
            ctx.restore();
        }

        // Valid move targets
        for (const move of this.validMoves) {
            if (move.type === 'move' || move.type === 'swap') {
                const { x, y } = this.cellToPixel(move.toCol, move.toRow);
                const rx = x - CELL_SIZE / 2;
                const ry = y - CELL_SIZE / 2;

                if (move.type === 'swap') {
                    ctx.fillStyle = 'rgba(255, 165, 0, 0.3)';
                } else {
                    ctx.fillStyle = COLORS.moveTarget;
                }
                ctx.fillRect(rx, ry, CELL_SIZE, CELL_SIZE);

                // Breathing dot indicator
                const breathe = 5 + 1.5 * Math.sin(this.now / 220);
                ctx.beginPath();
                ctx.arc(x, y, breathe, 0, Math.PI * 2);
                ctx.fillStyle = move.type === 'swap' ? 'rgba(255, 165, 0, 0.7)' : 'rgba(120, 255, 120, 0.7)';
                ctx.fill();
            }
        }
    }

    drawLaser() {
        const path = this.game.lastLaserPath;
        if (path.length < 2) return;
        // After applyMove the turn has switched, so the beam belongs to 1 - currentPlayer.
        const laserPlayer = 1 - this.game.currentPlayer;
        const color = laserPlayer === PLAYER.SILVER ? COLORS.laserSilver : COLORS.laserRed;
        const total = path.length - 1;
        const reveal = this.animatingLaser ? Math.floor(this.laserProgress * total) + 1 : total;
        this.drawLaserPath(path, { color, reveal, impact: true });
    }

    /**
     * Draw a laser beam along `path`.
     * opts: { color, reveal (segments to show), impact (show explosion), preview (faint dashed) }
     */
    drawLaserPath(path, opts = {}) {
        const ctx = this.ctx;
        if (!path || path.length < 2) return;

        const preview = !!opts.preview;
        const laserPlayer = 1 - this.game.currentPlayer;
        const color = opts.color || (laserPlayer === PLAYER.SILVER ? COLORS.laserSilver : COLORS.laserRed);
        const reveal = opts.reveal != null ? opts.reveal : path.length - 1;

        // Collect visible points (stop at the edge of the board).
        const pts = [];
        for (let i = 0; i < Math.min(reveal + 1, path.length); i++) {
            const seg = path[i];
            if (seg.offBoard) break;
            pts.push({ ...this.cellToPixel(seg.col, seg.row), seg });
        }
        if (pts.length < 2) return;

        const tracePolyline = () => {
            ctx.beginPath();
            ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
            ctx.stroke();
        };

        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (preview) {
            // Faint, dashed projection of where the beam would go after this move.
            ctx.setLineDash([6, 7]);
            ctx.lineDashOffset = -(this.now / 40) % 13;
            ctx.strokeStyle = color;
            ctx.globalAlpha = 0.35;
            ctx.lineWidth = 3;
            ctx.shadowColor = color;
            ctx.shadowBlur = 6;
            tracePolyline();
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
        } else {
            const pulse = 0.85 + 0.15 * Math.sin(this.now / 90);
            // Wide outer glow.
            ctx.shadowColor = color;
            ctx.shadowBlur = 22;
            ctx.strokeStyle = color;
            ctx.globalAlpha = 0.45 * pulse;
            ctx.lineWidth = 9;
            tracePolyline();
            // Mid beam.
            ctx.globalAlpha = 0.9;
            ctx.shadowBlur = 10;
            ctx.lineWidth = 4;
            tracePolyline();
            // Hot white core.
            ctx.globalAlpha = 1;
            ctx.shadowBlur = 0;
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.6;
            tracePolyline();
        }

        // Reflection sparkles.
        ctx.globalAlpha = preview ? 0.5 : 1;
        for (const p of pts) {
            if (p.seg.reflectDir === undefined) continue;
            ctx.fillStyle = preview ? color : 'rgba(255,255,255,0.9)';
            ctx.beginPath();
            ctx.arc(p.x, p.y, preview ? 3 : 4.5, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;

        const last = pts[pts.length - 1];
        if (preview && last.seg.hit) {
            // Target reticle on the piece that would be destroyed.
            ctx.strokeStyle = '#ff5252';
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.7 + 0.3 * Math.sin(this.now / 150);
            ctx.beginPath();
            ctx.arc(last.x, last.y, CELL_SIZE * 0.34, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1;
        } else if (opts.impact && last.seg.hit && (!this.animatingLaser || this.laserProgress >= 0.95)) {
            // Explosion flash + sparks.
            const f = this.hitFlashProgress || 0;
            const explosionR = 18 + f * 22;
            const grad = ctx.createRadialGradient(last.x, last.y, 0, last.x, last.y, explosionR);
            grad.addColorStop(0, 'rgba(255,255,255,0.95)');
            grad.addColorStop(0.3, color);
            grad.addColorStop(1, 'rgba(255,80,0,0)');
            ctx.fillStyle = grad;
            ctx.beginPath();
            ctx.arc(last.x, last.y, explosionR, 0, Math.PI * 2);
            ctx.fill();

            ctx.strokeStyle = 'rgba(255,220,150,' + (1 - f) + ')';
            ctx.lineWidth = 2;
            for (let k = 0; k < 8; k++) {
                const a = (k / 8) * Math.PI * 2;
                const r0 = explosionR * 0.5, r1 = explosionR * (0.9 + f * 0.8);
                ctx.beginPath();
                ctx.moveTo(last.x + Math.cos(a) * r0, last.y + Math.sin(a) * r0);
                ctx.lineTo(last.x + Math.cos(a) * r1, last.y + Math.sin(a) * r1);
                ctx.stroke();
            }
        }

        ctx.restore();
    }
}
