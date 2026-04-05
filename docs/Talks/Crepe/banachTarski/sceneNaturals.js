import { C, R, SP, N } from './config.js';
import { ease, lerp, lerpColor, drawCircle, drawText, drawEllipsis } from './utils.js';

// ═══════════════════════════════════════════════════════════
// SCENE 0: NATURAL NUMBERS
// ═══════════════════════════════════════════════════════════
function centeredX(i, count, W) {
    return W / 2 + (i - (count - 1) / 2) * SP;
}

export function renderNaturals(ctx, W, H, localStep, t) {
    const e = ease(t);
    const cy = H / 2;
    const rowGap = Math.min(70, H * 0.12);

    // Build per-number state
    for (let i = 0; i < N; i++) {
        const val = i + 1;
        const isOdd = val % 2 !== 0;
        const halfIdx = Math.floor(i / 2);

        // Position
        let x = centeredX(i, N, W);
        let y = cy;
        let col = C.accent;
        let label = '' + val;

        if (localStep >= 1) {
            col = isOdd ? C.teal : C.warm;
        }
        if (localStep >= 2) {
            const targetX = centeredX(halfIdx, N / 2, W);
            const targetY = isOdd ? cy - rowGap : cy + rowGap;
            if (localStep === 2) {
                x = lerp(centeredX(i, N, W), targetX, e);
                y = lerp(cy, targetY, e);
            } else {
                x = targetX; y = targetY;
            }
        }
        if (localStep === 1 && t < 1) {
            col = lerpColor(C.accent, isOdd ? C.teal : C.warm, e);
        }
        if (localStep >= 3) {
            label = '' + (halfIdx + 1);
        }

        // Draw
        drawCircle(ctx, x, y, R, C.node, localStep >= 1 ? col : C.nodeBorder);
        // During relabel, fade old out and new in
        if (localStep === 3 && t < 1) {
            drawText(ctx, '' + val, x, y, 13, C.text, 1 - e);
            drawText(ctx, '' + (halfIdx + 1), x, y, 13, C.text, e);
        } else {
            drawText(ctx, label, x, y, 13, C.text);
        }
    }

    // Ellipsis
    if (localStep < 2) {
        const ex = centeredX(N, N, W) + 8;
        drawEllipsis(ctx, ex, cy, C.muted);
    } else {
        const ex = centeredX(N / 2, N / 2, W) + 8;
        const topY = cy - rowGap, botY = cy + rowGap;
        const elAlpha = localStep === 2 ? e : 1;
        drawEllipsis(ctx, ex, topY, C.teal, elAlpha);
        drawEllipsis(ctx, ex, botY, C.warm, elAlpha);
    }

    // Row labels for step 3
    if (localStep >= 3) {
        const lx = centeredX(0, N / 2, W) - 45;
        const a = localStep === 3 ? e : 1;
        drawText(ctx, 'ℕ =', lx, cy - rowGap, 16, C.teal, a, 'right');
        drawText(ctx, 'ℕ =', lx, cy + rowGap, 16, C.warm, a, 'right');
    }

    // Big label
    if (localStep === 0) {
        drawText(ctx, 'ℕ = { 1, 2, 3, 4, … }', W / 2, cy - rowGap - 50, 20, C.muted, t < 1 ? e : 1);
    }
    if (localStep === 3 && t >= 0.5) {
        const fa = ease((t - 0.5) * 2);
        drawText(ctx, 'ℕ  ↔  ℕ ⊔ ℕ', W / 2, cy + rowGap + 55, 18, C.accent, fa);
    }
}
