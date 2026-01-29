export class Renderer {
    constructor(canvas, board) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.board = board;
        this.cellSize = 60;
        // Color Legend for Level 1389:
        // 1) Red, 2) Orange, 3) Yellow, 4) Green, 5) Dark blue, 6) Blue, 7) Light blue
        // 8) Purple, 9) Magenta, 10) Salmon, 11) Beige, 12) Dark beige, 13) Black
        // 14) Light pink, 15) Dark pink
        this.colors = {
            // Primary colors
            red: '#ef4444',
            orange: '#f97316',
            yellow: '#facc15',
            green: '#22c55e',
            darkblue: '#1e3a8a',
            blue: '#3b82f6',
            lightblue: '#38bdf8',
            purple: '#8b5cf6',
            magenta: '#d946ef',
            salmon: '#fa8072',
            beige: '#f5f5dc',
            darkbeige: '#a89078',
            black: '#1a1a1a',
            lightpink: '#ffc0cb',
            darkpink: '#c71585',
            pink: '#ec4899',
            // Additional colors for gecko nesting
            navy: '#000080',
            cyan: '#06b6d4',
            gold: '#ffd700',
            lavender: '#e8d5ff',
            maroon: '#800000',
            tan: '#d2b48c',
            ruby: '#e0115f',
            orchid: '#da70d6',
            apricot: '#fbceb1',
            // UI colors
            empty: 'rgba(255,255,255,0.05)',
            wall: '#1e293b',
            hole: '#000000'
        };
    }

    resize() {
        this.labelPadding = 25; // Space for row/column labels
        this.canvas.width = this.board.cols * this.cellSize + this.labelPadding;
        this.canvas.height = this.board.rows * this.cellSize + this.labelPadding;
    }

    draw(selectedGeckoId = null) {
        const { ctx, board, cellSize } = this;
        const pad = this.labelPadding || 0;
        ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw column labels (0-9 at top)
        ctx.fillStyle = '#888';
        ctx.font = '14px monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        for (let c = 0; c < board.cols; c++) {
            ctx.fillText(c.toString(), pad + c * cellSize + cellSize / 2, pad / 2);
        }

        // Draw row labels (0-13 on left)
        ctx.textAlign = 'right';
        for (let r = 0; r < board.rows; r++) {
            ctx.fillText(r.toString(), pad - 5, pad + r * cellSize + cellSize / 2);
        }

        // Draw Grid / Empty cells
        for (let r = 0; r < board.rows; r++) {
            for (let c = 0; c < board.cols; c++) {
                const cell = board.getCell(r, c);
                ctx.fillStyle = this.colors.empty;
                ctx.fillRect(pad + c * cellSize + 2, pad + r * cellSize + 2, cellSize - 4, cellSize - 4);

                if (cell.type === 'wall') {
                    ctx.fillStyle = this.colors.wall;
                    ctx.fillRect(pad + c * cellSize, pad + r * cellSize, cellSize, cellSize);
                }
            }
        }

        // Draw Holes
        for (const hole of board.holes) {
            const hx = pad + hole.c * cellSize;
            const hy = pad + hole.r * cellSize;
            const holeColor = this.colors[hole.color] || '#fff';

            if (hole.isPermanent) {
                // Permanent: colored square fills to boundary
                ctx.fillStyle = holeColor;
                ctx.fillRect(hx, hy, cellSize, cellSize);
            }

            // Black center circle
            ctx.beginPath();
            ctx.arc(hx + cellSize / 2, hy + cellSize / 2, cellSize / 2.5, 0, Math.PI * 2);
            ctx.fillStyle = '#000';
            ctx.fill();

            if (!hole.isPermanent) {
                // Non-permanent: solid colored ring
                ctx.strokeStyle = holeColor;
                ctx.lineWidth = 5;
                ctx.stroke();
            }
        }

        // Draw Ropes for attached holes
        for (const gecko of board.geckos) {
            if (gecko.attachedHole) {
                const hole = board.holes.find(h => h.color === gecko.attachedHole.color);
                if (hole) {
                    ctx.beginPath();
                    ctx.moveTo(pad + gecko.tail.c * cellSize + cellSize / 2, pad + gecko.tail.r * cellSize + cellSize / 2);
                    ctx.lineTo(pad + hole.c * cellSize + cellSize / 2, pad + hole.r * cellSize + cellSize / 2);
                    ctx.strokeStyle = 'rgba(255,255,255,0.3)';
                    ctx.lineWidth = 4;
                    ctx.setLineDash([5, 2]);
                    ctx.stroke();
                    ctx.setLineDash([]);
                }
            }
        }

        // Draw Geckos
        for (const gecko of board.geckos) {
            this.drawGecko(gecko, selectedGeckoId === gecko.id);
        }
    }

    drawGecko(gecko, isSelected = false) {
        const { ctx, cellSize } = this;
        const pad = this.labelPadding || 0;
        const color = this.colors[gecko.color] || gecko.color;

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        if (isSelected) {
            ctx.shadowBlur = 15;
            ctx.shadowColor = color;
        }

        // 1. Draw Outer Body
        ctx.strokeStyle = color;
        ctx.lineWidth = cellSize * 0.7;
        this.beginPathAtBody(gecko, pad);
        ctx.stroke();

        ctx.shadowBlur = 0; // Reset

        // 2. Draw Inner Gecko if exists
        if (gecko.innerGecko) {
            ctx.strokeStyle = this.colors[gecko.innerGecko.color] || gecko.innerGecko.color;
            ctx.lineWidth = cellSize * 0.3;
            this.beginPathAtBody(gecko, pad);
            ctx.stroke();
        }

        // 3. Draw Head
        const head = gecko.head;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(pad + head.c * cellSize + cellSize / 2, pad + head.r * cellSize + cellSize / 2, cellSize / 2.2, 0, Math.PI * 2);
        ctx.fill();

        if (gecko.innerGecko) {
            ctx.fillStyle = this.colors[gecko.innerGecko.color];
            ctx.beginPath();
            ctx.arc(pad + head.c * cellSize + cellSize / 2, pad + head.r * cellSize + cellSize / 2, cellSize / 4, 0, Math.PI * 2);
            ctx.fill();
        }

        // Eyes
        ctx.fillStyle = '#fff';
        const eyeOffset = cellSize * 0.15;
        ctx.beginPath();
        ctx.arc(pad + head.c * cellSize + cellSize / 2 - eyeOffset, pad + head.r * cellSize + cellSize / 2 - eyeOffset, cellSize * 0.08, 0, Math.PI * 2);
        ctx.arc(pad + head.c * cellSize + cellSize / 2 + eyeOffset, pad + head.r * cellSize + cellSize / 2 - eyeOffset, cellSize * 0.08, 0, Math.PI * 2);
        ctx.fill();
    }

    beginPathAtBody(gecko, pad = 0) {
        const { ctx, cellSize } = this;
        ctx.beginPath();
        gecko.body.forEach((p, i) => {
            const x = pad + p.c * cellSize + cellSize / 2;
            const y = pad + p.r * cellSize + cellSize / 2;
            if (i === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
    }
}
