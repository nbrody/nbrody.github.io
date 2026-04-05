// ═══════════════════════════════════════════════════════════
// EASING & LERP
// ═══════════════════════════════════════════════════════════
export function ease(x) {
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}

export function lerp(a, b, t) {
    return a + (b - a) * t;
}

export function lerpColor(c1, c2, t) {
    const p = (s, i) => parseInt(s.slice(1 + i * 2, 3 + i * 2), 16);
    const r = Math.round(lerp(p(c1, 0), p(c2, 0), t));
    const g = Math.round(lerp(p(c1, 1), p(c2, 1), t));
    const b = Math.round(lerp(p(c1, 2), p(c2, 2), t));
    return `rgb(${r},${g},${b})`;
}

// ═══════════════════════════════════════════════════════════
// DRAWING HELPERS
// ═══════════════════════════════════════════════════════════
export function drawCircle(ctx, x, y, r, fill, stroke, alpha = 1) {
    ctx.globalAlpha = alpha;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fill; ctx.fill();
    ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke();
    ctx.globalAlpha = 1;
}

export function drawText(ctx, txt, x, y, size, color, alpha = 1, align = 'center') {
    ctx.globalAlpha = alpha;
    ctx.font = `600 ${size}px Inter, sans-serif`;
    ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.fillText(txt, x, y);
    ctx.globalAlpha = 1;
}

export function drawLine(ctx, x1, y1, x2, y2, color, width = 1.5, alpha = 1) {
    ctx.globalAlpha = alpha;
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
    ctx.globalAlpha = 1;
}

export function drawEllipsis(ctx, x, y, color, alpha = 1) {
    for (let i = 0; i < 3; i++) {
        ctx.globalAlpha = alpha * (1 - i * 0.15);
        ctx.beginPath(); ctx.arc(x + i * 10, y, 3, 0, Math.PI * 2);
        ctx.fillStyle = color; ctx.fill();
    }
    ctx.globalAlpha = 1;
}
