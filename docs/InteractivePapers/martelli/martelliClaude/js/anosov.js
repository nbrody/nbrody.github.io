/**
 * anosov.js — Correct animation of the Anosov diffeomorphism on T²
 * 
 * The matrix A = [[1,1],[1,0]] acts on the torus T² = R²/Z².
 * 
 * Eigenvalues: φ = (1+√5)/2 ≈ 1.618, ψ = (1-√5)/2 ≈ -0.618
 * Expanding eigenvector:  v₊ = (φ, 1)  (eigenvalue φ)
 * Contracting eigenvector: v₋ = (ψ, 1)  (eigenvalue ψ)
 * 
 * Animation phases:
 *   Phase 1 (t: 0.0–0.40): Smoothly interpolate from identity I to matrix A
 *   Phase 2 (t: 0.40–0.55): Hold the parallelogram (fully transformed)
 *   Phase 3 (t: 0.55–0.90): Cut at x=1 and slide the overflow triangle left by 1
 *   Phase 4 (t: 0.90–1.00): Hold final state (unit square again, points permuted)
 */

const PHI = (1 + Math.sqrt(5)) / 2;
const PSI = (1 - Math.sqrt(5)) / 2;

// Fixed points of A on T² (from Theorem 7)
const FIXED_POINTS = [
    { label: 'P₁', x: 0, y: 0, color: '#a78bfa' },
    { label: 'P₂', x: 4 / 5, y: 3 / 5, color: '#60a5fa' },
    { label: 'P₃', x: 3 / 5, y: 1 / 5, color: '#ef4444' },
    { label: 'P₄', x: 2 / 5, y: 4 / 5, color: '#f97316' },
    { label: 'P₅', x: 1 / 5, y: 2 / 5, color: '#34d399' }
];

/** Smooth step function */
function smoothstep(t) {
    t = Math.max(0, Math.min(1, t));
    return t * t * (3 - 2 * t);
}

/**
 * Main render function — draws one frame of the Anosov animation.
 * @param {HTMLCanvasElement} canvas
 * @param {number} t — normalized time in [0, 1]
 */
export function initAnosov(canvas, t) {
    if (!canvas) return;

    // High-DPI
    const dpr = window.devicePixelRatio || 1;
    const displayWidth = canvas.clientWidth || 700;
    const displayHeight = canvas.clientHeight || 700;
    if (canvas.width !== displayWidth * dpr || canvas.height !== displayHeight * dpr) {
        canvas.width = displayWidth * dpr;
        canvas.height = displayHeight * dpr;
    }
    const ctx = canvas.getContext('2d');
    ctx.save();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const W = displayWidth;
    const H = displayHeight;
    const scale = Math.min(W, H) * 0.38;
    const ox = (W - scale) / 2;  // offset so unit square fits
    const oy = (H - scale) / 2;

    // Map from logical (x, y) where (0,0)=bottom-left, (1,1)=top-right, to canvas coords
    const toCanvas = (x, y) => ({
        cx: ox + x * scale,
        cy: oy + (1 - y) * scale
    });

    // Determine phase
    let phase, s;
    if (t < 0.40) {
        phase = 'transform';
        s = smoothstep(t / 0.40);
    } else if (t < 0.55) {
        phase = 'hold';
        s = 1;
    } else if (t < 0.90) {
        phase = 'cut';
        s = smoothstep((t - 0.55) / 0.35);
    } else {
        phase = 'done';
        s = 1;
    }

    // Current interpolated matrix: I + s*(A - I) = [[1, s], [s, 1-s]]
    // When s=1: [[1,1],[1,0]] = A
    let m00, m01, m10, m11;
    if (phase === 'transform') {
        m00 = 1; m01 = s; m10 = s; m11 = 1 - s;
    } else {
        m00 = 1; m01 = 1; m10 = 1; m11 = 0;
    }

    // Transform a point by the interpolated matrix
    const transformPt = (x, y) => ({
        x: m00 * x + m01 * y,
        y: m10 * x + m11 * y
    });

    // Clear
    ctx.clearRect(0, 0, W, H);

    const GRID_N = 8;

    if (phase === 'transform' || phase === 'hold') {
        // --- Draw eigenspace foliations (fixed lines, not transformed) ---
        const numFoliationLines = 12;

        // Expanding eigenspace: direction (φ, 1)
        ctx.strokeStyle = 'rgba(96, 165, 250, 0.18)';
        ctx.lineWidth = 1;
        for (let i = -numFoliationLines; i <= numFoliationLines; i++) {
            const offset = i * 0.12;
            const p1 = toCanvas(offset + PHI * (-3), -3);
            const p2 = toCanvas(offset + PHI * 3, 3);
            ctx.beginPath();
            ctx.moveTo(p1.cx, p1.cy);
            ctx.lineTo(p2.cx, p2.cy);
            ctx.stroke();
        }

        // Contracting eigenspace: direction (ψ, 1) = ((1-√5)/2, 1)
        ctx.strokeStyle = 'rgba(249, 115, 22, 0.18)';
        for (let i = -numFoliationLines; i <= numFoliationLines; i++) {
            const offset = i * 0.12;
            const p1 = toCanvas(offset + PSI * (-3), -3);
            const p2 = toCanvas(offset + PSI * 3, 3);
            ctx.beginPath();
            ctx.moveTo(p1.cx, p1.cy);
            ctx.lineTo(p2.cx, p2.cy);
            ctx.stroke();
        }

        // --- Draw transformed grid ---
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 0.7;
        for (let i = 0; i <= GRID_N; i++) {
            const u = i / GRID_N;
            // Vertical grid lines (fixed u, vary v)
            ctx.beginPath();
            for (let j = 0; j <= GRID_N; j++) {
                const v = j / GRID_N;
                const tp = transformPt(u, v);
                const cp = toCanvas(tp.x, tp.y);
                if (j === 0) ctx.moveTo(cp.cx, cp.cy);
                else ctx.lineTo(cp.cx, cp.cy);
            }
            ctx.stroke();
            // Horizontal grid lines (fixed v=u, vary u=i)
            ctx.beginPath();
            for (let j = 0; j <= GRID_N; j++) {
                const v = j / GRID_N;
                const tp = transformPt(v, u);
                const cp = toCanvas(tp.x, tp.y);
                if (j === 0) ctx.moveTo(cp.cx, cp.cy);
                else ctx.lineTo(cp.cx, cp.cy);
            }
            ctx.stroke();
        }

        // --- Fill region ---
        ctx.fillStyle = 'rgba(167, 139, 250, 0.06)';
        ctx.beginPath();
        const corners = [[0, 0], [1, 0], [1, 1], [0, 1]];
        corners.forEach((c, i) => {
            const tp = transformPt(c[0], c[1]);
            const cp = toCanvas(tp.x, tp.y);
            if (i === 0) ctx.moveTo(cp.cx, cp.cy);
            else ctx.lineTo(cp.cx, cp.cy);
        });
        ctx.closePath();
        ctx.fill();

        // --- Boundary of transformed parallelogram ---
        ctx.strokeStyle = 'rgba(232, 232, 240, 0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        corners.forEach((c, i) => {
            const tp = transformPt(c[0], c[1]);
            const cp = toCanvas(tp.x, tp.y);
            if (i === 0) ctx.moveTo(cp.cx, cp.cy);
            else ctx.lineTo(cp.cx, cp.cy);
        });
        ctx.closePath();
        ctx.stroke();

        // --- Basis vectors ---
        drawArrow(ctx, toCanvas, transformPt, 0, 0, 1, 0, '#ef4444', 'e₁', scale);
        drawArrow(ctx, toCanvas, transformPt, 0, 0, 0, 1, '#a78bfa', 'e₂', scale);

        // --- Eigenvectors with scaling ---
        // Expanding: direction (φ,1), scaled by φ^s in eigenvalue sense
        const expandLength = 0.35;
        const expandNorm = Math.sqrt(PHI * PHI + 1);
        const evxE = PHI / expandNorm * expandLength;
        const evyE = 1 / expandNorm * expandLength;
        const expandFactor = Math.pow(PHI, s);
        drawEigenvectorScaling(ctx, toCanvas, evxE, evyE, expandFactor, '#60a5fa', 'v₊', scale);

        // Contracting: direction (ψ,1), scaled by ψ^s
        // ψ is negative, so |ψ|^s shrinks the magnitude, and for odd "s" the direction flips.
        // For smooth interpolation, use the actual interpolated image:
        // At parameter s, the matrix M(s) applied to eigenvector v₋ = (ψ,1) gives:
        // M(s)*v₋ = ((1)(ψ) + s(1), s(ψ) + (1-s)(1)) = (ψ+s, sψ+1-s)
        // At s=0: (ψ,1), at s=1: (ψ+1, ψ) = (1/φ, ψ) — but better use scaling:
        const contractNorm = Math.sqrt(PSI * PSI + 1);
        const contractLength = 0.35;
        // Actual eigenvector direction under interpolated matrix
        const cvx = m00 * PSI + m01 * 1;
        const cvy = m10 * PSI + m11 * 1;
        const cvNorm = Math.sqrt(cvx * cvx + cvy * cvy);
        const contractDisplayLen = contractLength * (cvNorm / contractNorm);
        drawEigenvectorDirect(ctx, toCanvas, cvx / cvNorm * contractDisplayLen, cvy / cvNorm * contractDisplayLen, '#f97316', 'v₋', scale);

    } else {
        // --- Cut-and-drag phase, or final ---
        const dragOffset = (phase === 'cut') ? -s : -1;

        // The fully transformed parallelogram has vertices:
        // (0,0), (1,1), (2,1), (1,0)
        // Cutting at x=1 gives:
        //   Left piece: triangle (0,0)-(1,0)-(1,1) 
        //   Right piece: triangle (1,0)-(1,1)-(2,1)
        // The right triangle gets translated left by 1 to become (0,0)-(0,1)-(1,1)
        // Together they make the unit square (0,0)-(1,0)-(1,1)-(0,1)

        // Draw the left piece (triangle (0,0)-(1,0)-(1,1))
        ctx.fillStyle = 'rgba(96, 165, 250, 0.08)';
        ctx.strokeStyle = 'rgba(232, 232, 240, 0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        let p = toCanvas(0, 0); ctx.moveTo(p.cx, p.cy);
        p = toCanvas(1, 0); ctx.lineTo(p.cx, p.cy);
        p = toCanvas(1, 1); ctx.lineTo(p.cx, p.cy);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Grid on left piece
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.lineWidth = 0.5;
        for (let i = 0; i <= GRID_N; i++) {
            const u = i / GRID_N;
            for (let j = 0; j < GRID_N; j++) {
                const v = j / GRID_N;
                // Each grid cell occupies transformed coords
                const x1 = u + v;
                const y1 = u;
                const x2 = u + (v + 1) / GRID_N * (1 / 1); // NOT right, need proper grid
                // Actually let's just draw grid lines properly
            }
        }
        // Proper grid: lines of constant original-u and constant original-v
        // Under A, (u,v) -> (u+v, u)
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.lineWidth = 0.5;
        for (let i = 0; i <= GRID_N; i++) {
            const u = i / GRID_N;
            // Lines of constant u: as v varies, (u+v, u) — horizontal in transformed coords
            // but only the part with x <= 1
            ctx.beginPath();
            let started = false;
            for (let j = 0; j <= GRID_N * 2; j++) {
                const v = j / (GRID_N * 2);
                const tx = u + v;
                const ty = u;
                if (tx <= 1.001) {
                    const cp = toCanvas(tx, ty);
                    if (!started) { ctx.moveTo(cp.cx, cp.cy); started = true; }
                    else ctx.lineTo(cp.cx, cp.cy);
                }
            }
            ctx.stroke();

            // Lines of constant v=u
            ctx.beginPath();
            started = false;
            for (let j = 0; j <= GRID_N * 2; j++) {
                const v = j / (GRID_N * 2);
                const tx = v + u;
                const ty = v;
                if (tx <= 1.001) {
                    const cp = toCanvas(tx, ty);
                    if (!started) { ctx.moveTo(cp.cx, cp.cy); started = true; }
                    else ctx.lineTo(cp.cx, cp.cy);
                }
            }
            ctx.stroke();
        }

        // Right triangle (1,0)-(1,1)-(2,1) translated by dragOffset
        ctx.fillStyle = 'rgba(249, 115, 22, 0.08)';
        ctx.strokeStyle = 'rgba(232, 232, 240, 0.6)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        p = toCanvas(1 + dragOffset, 0); ctx.moveTo(p.cx, p.cy);
        p = toCanvas(1 + dragOffset, 1); ctx.lineTo(p.cx, p.cy);
        p = toCanvas(2 + dragOffset, 1); ctx.lineTo(p.cx, p.cy);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Grid on right triangle
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.06)';
        ctx.lineWidth = 0.5;
        for (let i = 0; i <= GRID_N; i++) {
            const u = i / GRID_N;
            // Lines of constant u through the right triangle
            ctx.beginPath();
            let started = false;
            for (let j = 0; j <= GRID_N * 2; j++) {
                const v = j / (GRID_N * 2);
                const tx = u + v;
                const ty = u;
                if (tx > 0.999 && tx <= 2.001) {
                    const cp = toCanvas(tx + dragOffset, ty);
                    if (!started) { ctx.moveTo(cp.cx, cp.cy); started = true; }
                    else ctx.lineTo(cp.cx, cp.cy);
                }
            }
            ctx.stroke();

            ctx.beginPath();
            started = false;
            for (let j = 0; j <= GRID_N * 2; j++) {
                const v = j / (GRID_N * 2);
                const tx = v + u;
                const ty = v;
                if (tx > 0.999 && tx <= 2.001) {
                    const cp = toCanvas(tx + dragOffset, ty);
                    if (!started) { ctx.moveTo(cp.cx, cp.cy); started = true; }
                    else ctx.lineTo(cp.cx, cp.cy);
                }
            }
            ctx.stroke();
        }

        // Cut line (dashed)
        if (phase === 'cut') {
            ctx.strokeStyle = 'rgba(239, 68, 68, 0.6)';
            ctx.lineWidth = 2;
            ctx.setLineDash([8, 6]);
            ctx.beginPath();
            p = toCanvas(1, 0);
            ctx.moveTo(p.cx, p.cy);
            p = toCanvas(1, 1);
            ctx.lineTo(p.cx, p.cy);
            ctx.stroke();
            ctx.setLineDash([]);
        }
    }

    // --- Draw fixed points in all phases ---
    FIXED_POINTS.forEach(pt => {
        let tx = m00 * pt.x + m01 * pt.y;
        let ty = m10 * pt.x + m11 * pt.y;

        if (phase === 'cut' || phase === 'done') {
            // Fully transformed
            tx = pt.x + pt.y;  // A*(x,y) = (x+y, x)
            ty = pt.x;
            // Apply drag for the overflow part
            if (tx > 1) {
                const drag = (phase === 'cut') ? s : 1;
                tx -= drag;
            }
        }

        const cp = toCanvas(tx, ty);

        // Glow
        const grad = ctx.createRadialGradient(cp.cx, cp.cy, 0, cp.cx, cp.cy, 14);
        grad.addColorStop(0, pt.color + '50');
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(cp.cx, cp.cy, 14, 0, 2 * Math.PI);
        ctx.fill();

        // Dot
        ctx.fillStyle = pt.color;
        ctx.beginPath();
        ctx.arc(cp.cx, cp.cy, 5, 0, 2 * Math.PI);
        ctx.fill();

        ctx.strokeStyle = 'rgba(232, 232, 240, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.stroke();

        // Label
        ctx.fillStyle = '#e8e8f0';
        ctx.font = '600 13px Inter, sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(pt.label, cp.cx + 10, cp.cy - 6);
    });

    // --- Phase text ---
    ctx.fillStyle = 'rgba(232, 232, 240, 0.8)';
    ctx.font = '600 15px Inter, sans-serif';
    ctx.textAlign = 'left';
    let phaseText = '';
    if (phase === 'transform') {
        phaseText = `Applying A = [[1,1],[1,0]]`;
    } else if (phase === 'hold') {
        phaseText = 'Parallelogram extends beyond unit square';
    } else if (phase === 'cut') {
        phaseText = s < 0.95 ? 'Cut at x = 1 and translate overflow' : 'Result: Anosov map on T²';
    } else {
        phaseText = 'Anosov diffeomorphism on T²';
    }
    ctx.fillText(phaseText, 16, 24);

    ctx.restore();
}

/** Draw an arrow from (ox,oy) in direction (dx,dy) in logical coords (pre-transform) */
function drawArrow(ctx, toCanvas, transformPt, ox, oy, dx, dy, color, label, canvasScale) {
    const tp0 = transformPt(ox, oy);
    const tp1 = transformPt(dx, dy);
    const p0 = toCanvas(tp0.x, tp0.y);
    const p1 = toCanvas(tp1.x, tp1.y);

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(p0.cx, p0.cy);
    ctx.lineTo(p1.cx, p1.cy);
    ctx.stroke();

    // Arrowhead
    const angle = Math.atan2(p1.cy - p0.cy, p1.cx - p0.cx);
    const headLen = 12;
    ctx.beginPath();
    ctx.moveTo(p1.cx, p1.cy);
    ctx.lineTo(p1.cx - headLen * Math.cos(angle - Math.PI / 7), p1.cy - headLen * Math.sin(angle - Math.PI / 7));
    ctx.lineTo(p1.cx - headLen * Math.cos(angle + Math.PI / 7), p1.cy - headLen * Math.sin(angle + Math.PI / 7));
    ctx.closePath();
    ctx.fill();

    // Label
    ctx.font = '600 14px Inter, sans-serif';
    ctx.fillText(label, p1.cx + 8, p1.cy - 8);
}

/** Draw eigenvector with scaling factor visualization */
function drawEigenvectorScaling(ctx, toCanvas, vx, vy, scaleFactor, color, label, canvasScale) {
    const origin = toCanvas(0, 0);

    // Draw original (faded)
    const pOrig = toCanvas(vx, vy);
    ctx.strokeStyle = color + '30';
    ctx.lineWidth = 1;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(origin.cx, origin.cy);
    ctx.lineTo(pOrig.cx, pOrig.cy);
    ctx.stroke();
    ctx.setLineDash([]);

    // Draw scaled
    const svx = vx * scaleFactor;
    const svy = vy * scaleFactor;
    const pScaled = toCanvas(svx, svy);

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(origin.cx, origin.cy);
    ctx.lineTo(pScaled.cx, pScaled.cy);
    ctx.stroke();

    // Arrowhead
    const angle = Math.atan2(pScaled.cy - origin.cy, pScaled.cx - origin.cx);
    const headLen = 12;
    ctx.beginPath();
    ctx.moveTo(pScaled.cx, pScaled.cy);
    ctx.lineTo(pScaled.cx - headLen * Math.cos(angle - Math.PI / 7), pScaled.cy - headLen * Math.sin(angle - Math.PI / 7));
    ctx.lineTo(pScaled.cx - headLen * Math.cos(angle + Math.PI / 7), pScaled.cy - headLen * Math.sin(angle + Math.PI / 7));
    ctx.closePath();
    ctx.fill();

    ctx.font = '600 14px Inter, sans-serif';
    ctx.fillText(label, pScaled.cx + 8, pScaled.cy - 8);
}

/** Draw eigenvector directly from components */
function drawEigenvectorDirect(ctx, toCanvas, vx, vy, color, label, canvasScale) {
    const origin = toCanvas(0, 0);
    const p = toCanvas(vx, vy);

    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(origin.cx, origin.cy);
    ctx.lineTo(p.cx, p.cy);
    ctx.stroke();

    const angle = Math.atan2(p.cy - origin.cy, p.cx - origin.cx);
    const headLen = 12;
    ctx.beginPath();
    ctx.moveTo(p.cx, p.cy);
    ctx.lineTo(p.cx - headLen * Math.cos(angle - Math.PI / 7), p.cy - headLen * Math.sin(angle - Math.PI / 7));
    ctx.lineTo(p.cx - headLen * Math.cos(angle + Math.PI / 7), p.cy - headLen * Math.sin(angle + Math.PI / 7));
    ctx.closePath();
    ctx.fill();

    ctx.font = '600 14px Inter, sans-serif';
    ctx.fillText(label, p.cx + 8, p.cy - 8);
}
