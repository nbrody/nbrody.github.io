// hud.js — 2D canvas overlay for score, lives, level

export class HUD {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.resize();
        window.addEventListener('resize', () => this.resize());
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    draw(state) {
        const ctx = this.ctx;
        const w = this.canvas.width;
        const h = this.canvas.height;
        ctx.clearRect(0, 0, w, h);

        ctx.font = '22px "Courier New", monospace';
        ctx.fillStyle = '#ffffff';

        // Score — top left
        ctx.textAlign = 'left';
        ctx.fillText(String(state.score).padStart(8, '0'), 30, 40);

        // Lives — small ship icons
        for (let i = 0; i < state.lives; i++) {
            this.drawMiniShip(ctx, 40 + i * 22, 62);
        }

        // Level — top right
        ctx.textAlign = 'right';
        ctx.font = '16px "Courier New", monospace';
        ctx.fillStyle = '#666';
        ctx.fillText(`LEVEL ${state.level}`, w - 30, 40);

        // Speed indicator
        if (state.speed > 0.5) {
            ctx.textAlign = 'left';
            ctx.fillStyle = '#444';
            ctx.font = '12px "Courier New", monospace';
            const bar = '|'.repeat(Math.min(Math.round(state.speed), 25));
            ctx.fillText(bar, 30, 90);
        }

        // Game over
        if (state.gameOver) {
            ctx.textAlign = 'center';
            ctx.fillStyle = '#ffffff';
            ctx.font = '48px "Courier New", monospace';
            ctx.fillText('GAME OVER', w / 2, h / 2 - 20);
            ctx.font = '18px "Courier New", monospace';
            ctx.fillStyle = '#888';
            ctx.fillText('PRESS R TO RESTART', w / 2, h / 2 + 30);
        }

        // Crosshair (small dot)
        if (!state.gameOver && state.pointerLocked) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.beginPath();
            ctx.arc(w / 2, h / 2, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    drawMiniShip(ctx, x, y) {
        ctx.beginPath();
        ctx.moveTo(x, y - 7);
        ctx.lineTo(x - 4, y + 4);
        ctx.lineTo(x, y + 1);
        ctx.lineTo(x + 4, y + 4);
        ctx.closePath();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1;
        ctx.stroke();
    }
}
