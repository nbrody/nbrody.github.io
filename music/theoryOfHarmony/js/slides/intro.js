/* ============================================================
   Slide 0 — Intro: animated harmonic waves + title
   ============================================================ */

import { harmonicColors } from '../canvas.js';

export function draw(ts, ctx, W, H) {
    const t = ts / 1000;

    // Animated harmonic series waves in the background
    ctx.globalAlpha = 0.12;
    for (let n = 1; n <= 6; n++) {
        ctx.beginPath();
        ctx.strokeStyle = harmonicColors[n - 1];
        ctx.lineWidth = 2;
        const freq = n * 0.5;
        const amp = H * 0.08 / n;
        const yOff = H * 0.15 + (n - 1) * H * 0.13;
        for (let x = 0; x <= W; x += 2) {
            const xNorm = x / W;
            const y = yOff + amp * Math.sin(2 * Math.PI * freq * xNorm - t * n * 0.4) *
                Math.sin(Math.PI * xNorm);
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // Title
    ctx.fillStyle = '#f1f5f9';
    ctx.font = '600 48px "Playfair Display", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('♪', W / 2, H / 2 - 40);

    ctx.font = '300 20px "Inter", sans-serif';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText('Why the Major Scale?', W / 2, H / 2 + 20);
}
