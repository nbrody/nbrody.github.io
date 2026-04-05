// ═══════════════════════════════════════════════════════════
// ℝ/ℤ ≅ S¹ — Circle Visualization
// ═══════════════════════════════════════════════════════════

// ── COLORS ──
const C = {
    bg: '#060a14', text: '#f1f5f9', muted: '#94a3b8', dim: '#475569',
    accent: '#7c8aff', teal: '#2dd4bf', warm: '#f59e0b', rose: '#f472b6',
    purple: '#a78bfa', green: '#34d399',
    node: '#151d2e', nodeBorder: 'rgba(124,138,255,0.3)',
    line: 'rgba(148,163,184,0.3)', lineHi: 'rgba(148,163,184,0.5)',
};

const ANIM_MS = 700;
const BEND_ANIM_MS = 3000; // longer for the curling animation

// ── STEPS ──
const STEPS = [
    { desc: 'The real number line ℝ — an infinite, continuous ruler stretching in both directions.' },
    { desc: 'Consider the map x ↦ x + 1. It shifts every point one unit to the right — a rigid motion.' },
    { desc: 'This shift preserves distances: |f(x) − f(y)| = |x − y|. It is an isometry of ℝ.' },
    { desc: 'The inverse operation is x ↦ x − 1. Shifting right then left returns every point to where it started.' },
    { desc: 'Iterating the shift gives translation by any integer n: x ↦ x + n. The group ℤ acts on ℝ.' },
    { desc: 'The orbit of a point x is the set { …, x−2, x−1, x, x+1, x+2, … }. We call this a "net."' },
    { desc: 'Drag the slider to explore different nets. Notice: each net is a copy of ℤ, infinitely spread across ℝ.' },
    { desc: 'Shift the net to the right. After moving exactly 1 unit, the net looks the same! The net is periodic mod 1.' },
    { desc: 'Every net has exactly one representative in the interval [0, 1). We can identify each net with that point.' },
    { desc: 'But 0 and 1 are in the same net (0 + 1 = 1). So we must identify them: 0 ≡ 1.' },
    { desc: 'Glue the endpoints together: the interval [0, 1] curls up into a circle!' },
    { desc: 'ℝ/ℤ ≅ S¹. The space of orbits of ℝ under translation by ℤ is the circle.' },
    { desc: 'Recap: x ↦ x+1 generates the group ℤ acting on ℝ. The orbits are nets, one per point of [0,1). Identifying 0 ≡ 1 gives ℝ/ℤ ≅ S¹.' },
];
const TOTAL = STEPS.length;

// ── STATE ──
let step = 0, t = 1, animStart = 0;
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
let W = 800, H = 500;

// Slider
const sliderPanel = document.getElementById('slider-panel');
const offsetSlider = document.getElementById('offset-slider');
const offsetValue = document.getElementById('offset-value');
let userOffset = 0.37;
offsetSlider.addEventListener('input', () => {
    userOffset = parseFloat(offsetSlider.value);
    offsetValue.textContent = userOffset.toFixed(2);
});

// Animated offset for step 7 (sliding the net)
let slideOffset = 0;
let slideDir = 1;

// ── EASING & MATH ──
function ease(x) {
    return x < 0.5 ? 4 * x * x * x : 1 - Math.pow(-2 * x + 2, 3) / 2;
}
function lerp(a, b, t) { return a + (b - a) * t; }
function lerpColor(c1, c2, t) {
    const p = (s, i) => parseInt(s.slice(1 + i * 2, 3 + i * 2), 16);
    const r = Math.round(lerp(p(c1, 0), p(c2, 0), t));
    const g = Math.round(lerp(p(c1, 1), p(c2, 1), t));
    const b = Math.round(lerp(p(c1, 2), p(c2, 2), t));
    return `rgb(${r},${g},${b})`;
}

// ── COORDINATE SYSTEM ──
// The number line maps world coordinates to screen:
// world x=0 is at screen center, unit = pixels-per-unit
function worldToScreen(wx) {
    return W / 2 + wx * UNIT;
}
function screenToWorld(sx) {
    return (sx - W / 2) / UNIT;
}
let UNIT = 80; // pixels per unit, updated on resize

// ── DRAWING HELPERS ──
function drawNumberLine(y, alpha = 1, rangeHL = null) {
    ctx.globalAlpha = alpha;

    // Main line
    ctx.beginPath();
    ctx.moveTo(0, y); ctx.lineTo(W, y);
    ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.stroke();

    // Tick marks and labels
    const wLeft = screenToWorld(0) - 1;
    const wRight = screenToWorld(W) + 1;
    const startInt = Math.floor(wLeft);
    const endInt = Math.ceil(wRight);

    for (let n = startInt; n <= endInt; n++) {
        const sx = worldToScreen(n);
        if (sx < -20 || sx > W + 20) continue;

        const isOrigin = n === 0;
        const tickH = isOrigin ? 12 : 8;
        const tickColor = isOrigin ? C.accent : C.muted;

        // Highlight [0,1] range
        let inRange = false;
        if (rangeHL && n >= rangeHL[0] && n <= rangeHL[1]) {
            inRange = true;
        }

        ctx.beginPath();
        ctx.moveTo(sx, y - tickH); ctx.lineTo(sx, y + tickH);
        ctx.strokeStyle = inRange ? C.teal : tickColor;
        ctx.lineWidth = inRange ? 2.5 : 1.5;
        ctx.stroke();

        // Label
        ctx.font = `${isOrigin ? '600' : '400'} ${isOrigin ? 14 : 12}px Inter, sans-serif`;
        ctx.fillStyle = inRange ? C.teal : (isOrigin ? C.text : C.muted);
        ctx.textAlign = 'center'; ctx.textBaseline = 'top';
        ctx.fillText(n.toString(), sx, y + tickH + 6);
    }

    ctx.globalAlpha = 1;
}

function drawPoint(x, y, r, fillColor, glowColor, alpha = 1, label = null, labelPos = 'above') {
    ctx.globalAlpha = alpha;

    // Glow
    if (glowColor) {
        const grad = ctx.createRadialGradient(x, y, 0, x, y, r * 3);
        grad.addColorStop(0, glowColor);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(x, y, r * 3, 0, Math.PI * 2); ctx.fill();
    }

    // Point
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = fillColor; ctx.fill();
    ctx.strokeStyle = glowColor || fillColor; ctx.lineWidth = 1.5; ctx.stroke();

    // Label
    if (label) {
        ctx.font = '500 13px Inter, sans-serif';
        ctx.fillStyle = C.text;
        ctx.textAlign = 'center';
        ctx.textBaseline = labelPos === 'above' ? 'bottom' : 'top';
        const ly = labelPos === 'above' ? y - r - 8 : y + r + 8;
        ctx.fillText(label, x, ly);
    }

    ctx.globalAlpha = 1;
}

function drawArrow(x1, y1, x2, y2, color, width = 2, alpha = 1) {
    ctx.globalAlpha = alpha;
    const dx = x2 - x1, dy = y2 - y1;
    const len = Math.sqrt(dx * dx + dy * dy);
    const ux = dx / len, uy = dy / len;

    // Shaft
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2 - ux * 8, y2 - uy * 8);
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();

    // Head
    const headLen = 10, headW = 5;
    const px = x2, py = y2;
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px - ux * headLen + uy * headW, py - uy * headLen - ux * headW);
    ctx.lineTo(px - ux * headLen - uy * headW, py - uy * headLen + ux * headW);
    ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
    ctx.globalAlpha = 1;
}

function drawCurvedArrow(cx, cy, r, startAngle, endAngle, color, width = 2, alpha = 1) {
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(cx, cy, r, startAngle, endAngle);
    ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();

    // Arrowhead at end
    const ax = cx + r * Math.cos(endAngle);
    const ay = cy + r * Math.sin(endAngle);
    const tx = -Math.sin(endAngle);
    const ty = Math.cos(endAngle);
    const headLen = 8, headW = 4;
    ctx.beginPath();
    ctx.moveTo(ax, ay);
    ctx.lineTo(ax - tx * headLen + ty * headW, ay - ty * headLen - tx * headW);
    ctx.lineTo(ax - tx * headLen - ty * headW, ay - ty * headLen + tx * headW);
    ctx.closePath();
    ctx.fillStyle = color; ctx.fill();
    ctx.globalAlpha = 1;
}

function drawNetPoints(baseOffset, y, color, glowColor, alpha = 1, showLabels = false, labelStyle = 'value') {
    const wLeft = screenToWorld(0) - 1;
    const wRight = screenToWorld(W) + 1;
    const startN = Math.floor(wLeft - baseOffset);
    const endN = Math.ceil(wRight - baseOffset);

    for (let n = startN; n <= endN; n++) {
        const wx = baseOffset + n;
        const sx = worldToScreen(wx);
        if (sx < -30 || sx > W + 30) continue;

        let label = null;
        if (showLabels) {
            if (labelStyle === 'value') {
                label = wx % 1 === 0 ? wx.toString() : wx.toFixed(2);
            } else if (labelStyle === 'offset') {
                const sign = n >= 0 ? '+' : '';
                label = n === 0 ? 'x' : `x${sign}${n}`;
            }
        }

        drawPoint(sx, y, 6, color, glowColor, alpha, label, 'above');
    }
}

function drawText(txt, x, y, size, color, alpha = 1, align = 'center') {
    ctx.globalAlpha = alpha;
    ctx.font = `600 ${size}px Inter, sans-serif`;
    ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
    ctx.fillText(txt, x, y);
    ctx.globalAlpha = 1;
}

// ── CIRCLE DRAWING ──
function drawCircleShape(cx, cy, radius, alpha = 1) {
    ctx.globalAlpha = alpha;

    // Glow
    const grad = ctx.createRadialGradient(cx, cy, radius * 0.8, cx, cy, radius * 1.3);
    grad.addColorStop(0, 'rgba(124,138,255,0.06)');
    grad.addColorStop(1, 'transparent');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(cx, cy, radius * 1.3, 0, Math.PI * 2); ctx.fill();

    // Ring
    ctx.beginPath(); ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.strokeStyle = C.accent; ctx.lineWidth = 3; ctx.stroke();

    ctx.globalAlpha = 1;
}

// ══════════════════════════════════════════════════════════
// RENDER STEPS
// ══════════════════════════════════════════════════════════

function render(now) {
    const duration = (step === 10) ? BEND_ANIM_MS : ANIM_MS;
    if (t < 1) t = Math.min(1, (now - animStart) / duration);
    const e = ease(t);

    ctx.clearRect(0, 0, W, H);

    const lineY = H * 0.45;

    if (step <= 8) {
        renderNumberLine(lineY, e);
    } else if (step === 9) {
        renderIdentification(lineY, e);
    } else if (step === 10) {
        renderBending(lineY, e);
    } else if (step === 11) {
        renderFinalCircle(e);
    } else if (step === 12) {
        renderRecap(e);
    }

    requestAnimationFrame(render);
}

function renderNumberLine(lineY, e) {
    const rangeHL = (step >= 8) ? [0, 1] : null;
    drawNumberLine(lineY, 1, rangeHL);

    if (step === 0) {
        // Just the number line with a fade-in title
        drawText('ℝ', W / 2, lineY - 70, 28, C.accent, e);
    }

    if (step === 1) {
        // Show x → x+1 shift
        renderShift(lineY, e, 1, C.teal, 'x ↦ x + 1');
    }

    if (step === 2) {
        // Show distance preservation
        renderDistancePreservation(lineY, e);
    }

    if (step === 3) {
        // Show inverse x → x-1
        renderShift(lineY, e, -1, C.rose, 'x ↦ x − 1');
    }

    if (step === 4) {
        // Show multiple shifts: x+n for several n
        renderMultipleShifts(lineY, e);
    }

    if (step === 5) {
        // Show a single orbit (net)
        renderSingleNet(lineY, e, userOffset);
    }

    if (step === 6) {
        // Interactive: slider controls offset
        renderInteractiveNets(lineY, e);
    }

    if (step === 7) {
        // Auto-slide the net to show periodicity
        renderSlidingNet(lineY, e);
    }

    if (step === 8) {
        // Highlight [0,1] and show representative
        renderRepresentative(lineY, e);
    }
}

function renderShift(lineY, e, direction, color, label) {
    // Show a point at 0 and its image at +direction
    const x0 = worldToScreen(0);
    const x1 = worldToScreen(direction);

    drawPoint(x0, lineY, 7, C.node, C.accent, 1, 'x', 'above');

    // Animated curved arrow
    const arrowProgress = e;
    const arcCx = (x0 + x1) / 2;
    const arcR = Math.abs(x1 - x0) / 2;
    const startAngle = Math.PI;
    const endAngle = Math.PI + (0) * arrowProgress; // We'll draw an arc above

    // Draw arc from x0 to x1 above the line
    const arcY = lineY;
    ctx.globalAlpha = e;
    ctx.beginPath();
    if (direction > 0) {
        ctx.arc(arcCx, arcY, arcR, Math.PI, Math.PI + Math.PI * arrowProgress);
    } else {
        ctx.arc(arcCx, arcY, arcR, 0, -Math.PI * arrowProgress, true);
    }
    ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.stroke();
    ctx.globalAlpha = 1;

    // Arrow head at the end of the arc
    if (arrowProgress > 0.1) {
        const angle = direction > 0
            ? Math.PI + Math.PI * arrowProgress
            : -Math.PI * arrowProgress;
        const ax = arcCx + arcR * Math.cos(angle);
        const ay = arcY + arcR * Math.sin(angle);
        const tx = -Math.sin(angle) * (direction > 0 ? 1 : -1);
        const ty = Math.cos(angle) * (direction > 0 ? 1 : -1);
        ctx.globalAlpha = Math.min(1, arrowProgress * 3);
        ctx.beginPath();
        ctx.moveTo(ax, ay);
        ctx.lineTo(ax - tx * 9 + ty * 5, ay - ty * 9 - tx * 5);
        ctx.lineTo(ax - tx * 9 - ty * 5, ay - ty * 9 + tx * 5);
        ctx.closePath();
        ctx.fillStyle = color; ctx.fill();
        ctx.globalAlpha = 1;
    }

    // Image point fades in
    if (arrowProgress > 0.5) {
        const imgAlpha = (arrowProgress - 0.5) * 2;
        const imgLabel = direction > 0 ? `x + ${direction}` : `x − ${Math.abs(direction)}`;
        drawPoint(x1, lineY, 7, C.node, color, imgAlpha, imgLabel, 'above');
    }

    // Label
    drawText(label, W / 2, lineY + 60, 18, color, e);
}

function renderDistancePreservation(lineY, e) {
    // Show two points and their distance before and after
    const a = -1, b = 1.5;
    const sa = worldToScreen(a), sb = worldToScreen(b);
    const sa1 = worldToScreen(a + 1), sb1 = worldToScreen(b + 1);

    // Original points
    drawPoint(sa, lineY, 6, C.node, C.accent, 1, 'a', 'above');
    drawPoint(sb, lineY, 6, C.node, C.accent, 1, 'b', 'above');

    // Distance bracket below
    const bracketY = lineY + 30;
    ctx.strokeStyle = C.muted; ctx.lineWidth = 1.5; ctx.globalAlpha = 1;
    ctx.beginPath();
    ctx.moveTo(sa, bracketY - 5); ctx.lineTo(sa, bracketY + 5);
    ctx.moveTo(sa, bracketY); ctx.lineTo(sb, bracketY);
    ctx.moveTo(sb, bracketY - 5); ctx.lineTo(sb, bracketY + 5);
    ctx.stroke();
    drawText('d = 2.5', (sa + sb) / 2, bracketY + 18, 12, C.muted);

    // Shifted points
    drawPoint(sa1, lineY, 6, C.node, C.teal, e, 'a+1', 'above');
    drawPoint(sb1, lineY, 6, C.node, C.teal, e, 'b+1', 'above');

    // Shifted distance bracket
    const bracketY2 = lineY + 55;
    ctx.globalAlpha = e;
    ctx.strokeStyle = C.teal; ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(sa1, bracketY2 - 5); ctx.lineTo(sa1, bracketY2 + 5);
    ctx.moveTo(sa1, bracketY2); ctx.lineTo(sb1, bracketY2);
    ctx.moveTo(sb1, bracketY2 - 5); ctx.lineTo(sb1, bracketY2 + 5);
    ctx.stroke();
    drawText('d = 2.5  ✓', (sa1 + sb1) / 2, bracketY2 + 18, 12, C.teal, e);
    ctx.globalAlpha = 1;
}

function renderMultipleShifts(lineY, e) {
    // Show arrows for several integer shifts from x
    const x0 = worldToScreen(0);
    drawPoint(x0, lineY, 7, C.node, C.accent, 1, 'x');

    const shifts = [-3, -2, -1, 1, 2, 3];
    const colors = [C.rose, C.rose, C.rose, C.teal, C.teal, C.teal];

    for (let i = 0; i < shifts.length; i++) {
        const n = shifts[i];
        const xn = worldToScreen(n);
        const delay = Math.abs(n) - 1;
        const localE = ease(Math.max(0, Math.min(1, (e - delay * 0.15) / 0.5)));

        if (localE <= 0) continue;

        // Point
        drawPoint(xn, lineY, 5, C.node, colors[i], localE);

        // Small arcs
        const arcCx = (x0 + xn) / 2;
        const arcR = Math.abs(xn - x0) / 2;
        const aboveBelow = n > 0 ? -1 : 1;

        ctx.globalAlpha = localE * 0.6;
        ctx.beginPath();
        if (n > 0) {
            ctx.arc(arcCx, lineY, arcR, Math.PI, 2 * Math.PI);
        } else {
            ctx.arc(arcCx, lineY, arcR, 0, Math.PI);
        }
        ctx.strokeStyle = colors[i]; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.globalAlpha = 1;

        // Label
        const labelY = n > 0 ? lineY - arcR - 12 : lineY + arcR + 16;
        const sign = n > 0 ? '+' : '';
        drawText(`${sign}${n}`, arcCx, labelY, 11, colors[i], localE);
    }

    drawText('ℤ acts on ℝ by translation', W / 2, lineY + UNIT * 3 + 30, 16, C.accent, e);
}

function renderSingleNet(lineY, e, offset) {
    drawNetPoints(offset, lineY, C.accent, 'rgba(124,138,255,0.3)', e, true, 'offset');

    // Highlight the "base" point
    const baseSx = worldToScreen(offset);
    drawPoint(baseSx, lineY, 8, C.accent, 'rgba(124,138,255,0.5)', e);

    // Label
    drawText(`Orbit of x = ${offset.toFixed(2)}`, W / 2, lineY - 70, 16, C.accent, e);

    // Connect with dashed lines to show spacing = 1
    ctx.globalAlpha = e * 0.4;
    ctx.setLineDash([4, 4]);
    ctx.strokeStyle = C.accent; ctx.lineWidth = 1;
    const wLeft = screenToWorld(0) - 1;
    const wRight = screenToWorld(W) + 1;
    for (let n = Math.floor(wLeft - offset); n <= Math.ceil(wRight - offset) - 1; n++) {
        const sx1 = worldToScreen(offset + n);
        const sx2 = worldToScreen(offset + n + 1);
        if (sx1 > W + 30 || sx2 < -30) continue;
        // Small "1" label in between
        const mid = (sx1 + sx2) / 2;
        drawText('1', mid, lineY + 25, 10, C.dim, e * 0.6);
    }
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
}

function renderInteractiveNets(lineY, e) {
    // Draw several nets in different colors to show they tile ℝ
    const netColors = [C.accent, C.teal, C.warm, C.rose, C.purple];
    const offsets = [userOffset];

    // Draw the user's net prominently
    drawNetPoints(userOffset, lineY, C.accent, 'rgba(124,138,255,0.3)', 1, false);

    // Highlight base point
    const baseSx = worldToScreen(userOffset);
    drawPoint(baseSx, lineY, 8, C.accent, 'rgba(124,138,255,0.4)', 1);

    drawText(`Net of x = ${userOffset.toFixed(2)}`, W / 2, lineY - 70, 16, C.accent, 1);

    // Show "each net is a copy of ℤ"
    drawText('← … ℤ-spaced … →', W / 2, lineY + 50, 14, C.dim, e);
}

function renderSlidingNet(lineY, e) {
    // Auto-animate: slide the net from offset 0 to offset 1
    const period = 4000; // ms for full cycle
    const now = performance.now();
    const rawT = (now % period) / period;
    slideOffset = rawT;

    // Draw the net at this offset
    drawNetPoints(slideOffset, lineY, C.accent, 'rgba(124,138,255,0.3)', 1, false);

    // Highlight the point in [0,1]
    const rep = slideOffset % 1;
    const repSx = worldToScreen(rep);
    drawPoint(repSx, lineY, 8, C.teal, 'rgba(45,212,191,0.4)', 1);

    // Highlight [0,1] bracket
    const s0 = worldToScreen(0), s1 = worldToScreen(1);
    ctx.globalAlpha = 0.15;
    ctx.fillStyle = C.teal;
    ctx.fillRect(s0, lineY - 20, s1 - s0, 40);
    ctx.globalAlpha = 1;

    // Bracket
    ctx.strokeStyle = C.teal; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(s0, lineY - 22); ctx.lineTo(s0, lineY + 22);
    ctx.moveTo(s1, lineY - 22); ctx.lineTo(s1, lineY + 22);
    ctx.stroke();

    drawText('[0, 1)', (s0 + s1) / 2, lineY - 35, 14, C.teal);

    // Show the offset value
    drawText(`offset = ${slideOffset.toFixed(2)}`, W / 2, lineY + 60, 14, C.accent);

    // "Same net!" flash when near integer
    if (slideOffset > 0.95 || slideOffset < 0.05) {
        const flash = 1 - Math.abs(slideOffset > 0.5 ? slideOffset - 1 : slideOffset) * 20;
        drawText('Same net!', W / 2, lineY - 80, 18, C.warm, Math.max(0, flash));
    }
}

function renderRepresentative(lineY, e) {
    // Show several nets, each with representative highlighted in [0,1]
    const offsets = [0.15, 0.42, 0.68, 0.91];
    const colors = [C.teal, C.warm, C.rose, C.purple];

    // Highlight [0,1]
    const s0 = worldToScreen(0), s1 = worldToScreen(1);
    ctx.globalAlpha = 0.12 * e;
    ctx.fillStyle = C.accent;
    ctx.fillRect(s0, lineY - 50, s1 - s0, 100);
    ctx.globalAlpha = 1;

    // Bracket lines
    ctx.globalAlpha = e;
    ctx.strokeStyle = C.accent; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(s0, lineY - 52); ctx.lineTo(s0, lineY + 52);
    ctx.moveTo(s1, lineY - 52); ctx.lineTo(s1, lineY + 52);
    ctx.stroke();
    drawText('[0, 1)', (s0 + s1) / 2, lineY - 65, 16, C.accent, e);
    ctx.globalAlpha = 1;

    for (let i = 0; i < offsets.length; i++) {
        const off = offsets[i];
        const delay = i * 0.15;
        const localE = ease(Math.max(0, Math.min(1, (e - delay) / 0.55)));
        if (localE <= 0) continue;

        // Draw net faintly
        drawNetPoints(off, lineY + (i - 1.5) * 4, colors[i], null, localE * 0.3, false);

        // Highlight representative in [0,1]
        const repSx = worldToScreen(off);
        drawPoint(repSx, lineY, 7, colors[i], colors[i], localE);

        // Label
        drawText(off.toFixed(2), repSx, lineY + 35 + i * 16, 11, colors[i], localE);
    }
}

function renderIdentification(lineY, e) {
    // Step 9: Show [0,1] with 0 ≡ 1 identification
    drawNumberLine(lineY, 1, [0, 1]);

    const s0 = worldToScreen(0), s1 = worldToScreen(1);

    // Bright interval segment
    ctx.globalAlpha = e;
    ctx.strokeStyle = C.accent; ctx.lineWidth = 3.5;
    ctx.beginPath();
    ctx.moveTo(s0, lineY); ctx.lineTo(s1, lineY);
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Endpoints with glow
    drawPoint(s0, lineY, 9, C.teal, 'rgba(45,212,191,0.5)', e, '0', 'below');
    drawPoint(s1, lineY, 9, C.warm, 'rgba(245,158,11,0.5)', e, '1', 'below');

    // Animated dashed arc connecting 0 and 1 above the line
    if (e > 0.3) {
        const arcProgress = ease(Math.min(1, (e - 0.3) / 0.4));
        const arcCx = (s0 + s1) / 2;
        const arcR = (s1 - s0) / 2;

        ctx.globalAlpha = arcProgress * 0.7;
        ctx.setLineDash([8, 5]);
        ctx.beginPath();
        ctx.arc(arcCx, lineY, arcR, Math.PI, Math.PI + Math.PI * arcProgress);
        ctx.strokeStyle = C.accent; ctx.lineWidth = 2.5; ctx.stroke();
        ctx.setLineDash([]);
        ctx.globalAlpha = 1;
    }

    // "0 ≡ 1" label above the arc
    if (e > 0.5) {
        const labelE = ease((e - 0.5) / 0.3);
        const arcCx = (s0 + s1) / 2;
        const arcR = (s1 - s0) / 2;
        drawText('0 ≡ 1', arcCx, lineY - arcR - 20, 24, C.accent, Math.min(1, labelE));
    }

    // Annotation
    if (e > 0.7) {
        const annE = ease((e - 0.7) / 0.3);
        const arcCx = (s0 + s1) / 2;
        const arcR = (s1 - s0) / 2;
        drawText('(same orbit: 0 + 1 = 1)', arcCx, lineY - arcR - 48, 13, C.muted, annE);
    }
}

function renderBending(lineY, e) {
    // Step 10: Constant-curvature curling from line segment to circle
    // κ(t) = t·2π/L smoothly deforms a straight line into a full circle.

    const circleR = Math.min(W, H) * 0.2;
    const circleCx = W / 2;
    const circleCy = H * 0.42;
    const L = 2 * Math.PI * circleR; // arc length = circumference

    // Phase timing
    const FADE_END = 0.10;
    const CURL_START = 0.06;
    const CURL_END = 0.88;

    // 1. Fade number line out
    if (e < FADE_END * 2) {
        drawNumberLine(lineY, Math.max(0, 1 - e / FADE_END));
    }

    // 2. Curl parameter: 0 = straight line, 1 = full circle
    let curlT;
    if (e <= CURL_START) curlT = 0;
    else if (e >= CURL_END) curlT = 1;
    else curlT = ease((e - CURL_START) / (CURL_END - CURL_START));

    // Constant-curvature curve point
    // At curvature κ, arc-length u from start (going rightward):
    //   x(u) = sin(κu)/κ,  y(u) = (1−cos(κu))/κ
    function localPoint(s) {
        if (curlT < 0.001) return { x: s * L, y: 0 };
        const kappa = curlT * 2 * Math.PI / L;
        const u = s * L;
        return {
            x: Math.sin(kappa * u) / kappa,
            y: (1 - Math.cos(kappa * u)) / kappa
        };
    }

    // Compute centroid for centering
    const NS = 40;
    let cxSum = 0, cySum = 0;
    for (let i = 0; i <= NS; i++) {
        const p = localPoint(i / NS);
        cxSum += p.x; cySum += p.y;
    }
    const centX = cxSum / (NS + 1);
    const centY = cySum / (NS + 1);

    // Smoothly transition vertical center from lineY → circleCy
    const targetCY = lerp(lineY, circleCy, ease(Math.min(1, curlT * 2)));
    const offX = circleCx - centX;
    const offY = targetCY + centY;

    function toScreen(p) {
        return { x: p.x + offX, y: -p.y + offY };
    }

    // Draw thick glow behind curve
    const NUM_PTS = 150;
    ctx.beginPath();
    for (let i = 0; i <= NUM_PTS; i++) {
        const p = toScreen(localPoint(i / NUM_PTS));
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = C.accent; ctx.lineWidth = 14; ctx.lineCap = 'round';
    ctx.stroke();
    ctx.globalAlpha = 1;

    // Draw main curve
    ctx.beginPath();
    for (let i = 0; i <= NUM_PTS; i++) {
        const p = toScreen(localPoint(i / NUM_PTS));
        if (i === 0) ctx.moveTo(p.x, p.y); else ctx.lineTo(p.x, p.y);
    }
    ctx.strokeStyle = C.accent; ctx.lineWidth = 3.5; ctx.lineCap = 'round';
    ctx.stroke();

    // Quarter-point tick marks
    if (curlT > 0.15) {
        const tickA = Math.min(1, (curlT - 0.15) * 3);
        const quarters = [0.25, 0.5, 0.75];
        const qLabels = ['¼', '½', '¾'];
        for (let i = 0; i < quarters.length; i++) {
            const p = toScreen(localPoint(quarters[i]));
            drawPoint(p.x, p.y, 3, C.dim, null, tickA);
            // Labels on the full circle
            if (curlT > 0.85) {
                const lbl = ease((curlT - 0.85) / 0.15);
                const angle = -Math.PI / 2 + quarters[i] * Math.PI * 2;
                const lx = circleCx + (circleR + 22) * Math.cos(angle);
                const ly = circleCy + (circleR + 22) * Math.sin(angle);
                const scrLbl = toScreen(localPoint(quarters[i]));
                const labelX = lerp(scrLbl.x, lx, lbl);
                const labelY = lerp(scrLbl.y, ly, lbl);
                drawText(qLabels[i], labelX, labelY, 12, C.muted, lbl);
            }
        }
    }

    // Endpoints
    const pStart = toScreen(localPoint(0));
    const pEnd = toScreen(localPoint(1));
    const dist = Math.sqrt((pEnd.x - pStart.x) ** 2 + (pEnd.y - pStart.y) ** 2);

    if (curlT < 0.96 || dist > 12) {
        // Endpoints separate
        drawPoint(pStart.x, pStart.y, 8, C.teal, 'rgba(45,212,191,0.5)', 1, '0');
        drawPoint(pEnd.x, pEnd.y, 8, C.warm, 'rgba(245,158,11,0.5)', 1, '1');

        // Dashed line between endpoints when getting close
        if (curlT > 0.4 && dist < 300) {
            ctx.globalAlpha = Math.min(0.4, (curlT - 0.4) * 0.8);
            ctx.setLineDash([5, 4]);
            ctx.beginPath();
            ctx.moveTo(pStart.x, pStart.y); ctx.lineTo(pEnd.x, pEnd.y);
            ctx.strokeStyle = C.accent; ctx.lineWidth = 1.5; ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
        }
    } else {
        // Endpoints merged — flash!
        const mx = (pStart.x + pEnd.x) / 2;
        const my = (pStart.y + pEnd.y) / 2;
        const mergeT = Math.min(1, (curlT - 0.96) / 0.04);

        // Expanding glow burst
        const burstR = 10 + 30 * ease(mergeT);
        const grad = ctx.createRadialGradient(mx, my, 0, mx, my, burstR);
        grad.addColorStop(0, `rgba(124,138,255,${0.6 * (1 - mergeT * 0.4)})`);
        grad.addColorStop(0.5, `rgba(124,138,255,${0.2 * (1 - mergeT * 0.3)})`);
        grad.addColorStop(1, 'transparent');
        ctx.fillStyle = grad;
        ctx.beginPath(); ctx.arc(mx, my, burstR, 0, Math.PI * 2); ctx.fill();

        drawPoint(mx, my, 9, C.accent, 'rgba(124,138,255,0.6)', 1, '0 = 1');
    }

    // Bottom label
    if (curlT > 0.92) {
        const labelE = ease((curlT - 0.92) / 0.08);
        drawText('S¹', circleCx, targetCY + circleR + 45, 22, C.accent, labelE);
    }
}

function renderFinalCircle(e) {
    const circleR = Math.min(W, H) * 0.22;
    const circleCx = W / 2;
    const circleCy = H * 0.4;

    // Big beautiful circle with glow
    drawCircleShape(circleCx, circleCy, circleR, e);

    // Tick marks at key fractions
    const fracs = [0, 1/6, 1/4, 1/3, 1/2, 2/3, 3/4, 5/6];
    const fracLabels = ['0', '⅙', '¼', '⅓', '½', '⅔', '¾', '⅚'];
    const netColors = [C.accent, C.teal, C.warm, C.rose, C.purple, C.green, C.teal, C.warm];

    for (let i = 0; i < fracs.length; i++) {
        const delay = i * 0.06;
        const localE = ease(Math.max(0, Math.min(1, (e - delay) / 0.5)));
        if (localE <= 0) continue;

        const angle = -Math.PI / 2 + fracs[i] * Math.PI * 2;
        const px = circleCx + circleR * Math.cos(angle);
        const py = circleCy + circleR * Math.sin(angle);
        const lx = circleCx + (circleR + 25) * Math.cos(angle);
        const ly = circleCy + (circleR + 25) * Math.sin(angle);

        drawPoint(px, py, 4, netColors[i], netColors[i], localE);
        drawText(fracLabels[i], lx, ly, 12, C.muted, localE);
    }

    // Arrow showing the generating rotation (1/1 = full turn)
    if (e > 0.3) {
        const arrowAlpha = ease((e - 0.3) / 0.7);
        const innerR = circleR * 0.6;
        drawCurvedArrow(circleCx, circleCy, innerR, -Math.PI / 2, -Math.PI / 2 + Math.PI * 1.5, C.teal, 2, arrowAlpha * 0.4);
        drawText('+1', circleCx + innerR + 14, circleCy - 10, 12, C.teal, arrowAlpha * 0.5);
    }

    // Title
    drawText('ℝ / ℤ  ≅  S¹', W / 2, circleCy + circleR + 55, 24, C.accent, e);

    // Subtitle
    if (e > 0.5) {
        const subAlpha = ease((e - 0.5) * 2);
        drawText('The space of orbits is the circle', W / 2, circleCy + circleR + 85, 14, C.muted, subAlpha);
    }
}

function renderRecap(e) {
    // Three panels stacked vertically, fading in sequentially
    const panelH = H * 0.22;
    const panelW = Math.min(W * 0.7, 500);
    const startY = H * 0.1;
    const cx = W / 2;

    const panels = [
        { label: '1. The Action', color: C.teal, delay: 0 },
        { label: '2. The Orbits', color: C.warm, delay: 0.2 },
        { label: '3. The Quotient', color: C.accent, delay: 0.4 },
    ];

    for (let i = 0; i < panels.length; i++) {
        const p = panels[i];
        const py = startY + i * (panelH + 12);
        const localE = ease(Math.max(0, Math.min(1, (e - p.delay) / 0.45)));
        if (localE <= 0) continue;

        // Panel background
        ctx.globalAlpha = localE * 0.08;
        ctx.fillStyle = p.color;
        const rx = cx - panelW / 2;
        ctx.beginPath();
        ctx.roundRect(rx, py, panelW, panelH, 12);
        ctx.fill();
        ctx.globalAlpha = localE * 0.25;
        ctx.strokeStyle = p.color; ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.roundRect(rx, py, panelW, panelH, 12);
        ctx.stroke();
        ctx.globalAlpha = 1;

        // Panel label
        drawText(p.label, rx + 16, py + 22, 13, p.color, localE, 'left');

        // Panel content
        if (i === 0) {
            // Mini number line with shift arrow
            const lineY2 = py + panelH * 0.6;
            const lineLeft = rx + 30, lineRight = rx + panelW - 30;
            ctx.globalAlpha = localE * 0.5;
            ctx.beginPath(); ctx.moveTo(lineLeft, lineY2); ctx.lineTo(lineRight, lineY2);
            ctx.strokeStyle = C.line; ctx.lineWidth = 1.5; ctx.stroke();
            ctx.globalAlpha = localE;

            // Few ticks
            const miniUnit = (lineRight - lineLeft) / 8;
            for (let n = -3; n <= 4; n++) {
                const tx = (lineLeft + lineRight) / 2 + n * miniUnit;
                if (tx < lineLeft || tx > lineRight) continue;
                ctx.beginPath(); ctx.moveTo(tx, lineY2 - 4); ctx.lineTo(tx, lineY2 + 4);
                ctx.strokeStyle = C.muted; ctx.lineWidth = 1; ctx.stroke();
            }

            // x and x+1 points
            const xPt = (lineLeft + lineRight) / 2 - miniUnit;
            const x1Pt = xPt + miniUnit;
            drawPoint(xPt, lineY2, 5, C.node, C.teal, localE);
            drawPoint(x1Pt, lineY2, 5, C.node, C.teal, localE);

            // Arrow arc
            const arcCx2 = (xPt + x1Pt) / 2;
            ctx.globalAlpha = localE * 0.8;
            ctx.beginPath();
            ctx.arc(arcCx2, lineY2, miniUnit / 2, Math.PI, 2 * Math.PI);
            ctx.strokeStyle = C.teal; ctx.lineWidth = 1.5; ctx.stroke();
            ctx.globalAlpha = 1;

            drawText('x ↦ x + 1', cx + panelW * 0.2, lineY2, 14, C.teal, localE);
        }

        if (i === 1) {
            // Net dots
            const dotY = py + panelH * 0.6;
            const dotLeft = rx + 40, dotRight = rx + panelW - 80;
            const nDots = 7;
            for (let j = 0; j < nDots; j++) {
                const dx = dotLeft + j * (dotRight - dotLeft) / (nDots - 1);
                drawPoint(dx, dotY, 4, C.warm, 'rgba(245,158,11,0.3)', localE);
            }
            // Spacing labels
            for (let j = 0; j < nDots - 1; j++) {
                const dx1 = dotLeft + j * (dotRight - dotLeft) / (nDots - 1);
                const dx2 = dotLeft + (j + 1) * (dotRight - dotLeft) / (nDots - 1);
                drawText('1', (dx1 + dx2) / 2, dotY + 14, 9, C.dim, localE * 0.6);
            }
            // Ellipsis
            drawText('…', dotLeft - 15, dotY, 14, C.muted, localE);
            drawText('…', dotRight + 15, dotY, 14, C.muted, localE);

            drawText('{ x + n : n ∈ ℤ }', cx + panelW * 0.2, dotY, 14, C.warm, localE);
        }

        if (i === 2) {
            // Mini circle
            const circR = panelH * 0.3;
            const circCx = rx + panelW * 0.25;
            const circCy = py + panelH * 0.55;

            ctx.globalAlpha = localE;
            ctx.beginPath(); ctx.arc(circCx, circCy, circR, 0, Math.PI * 2);
            ctx.strokeStyle = C.accent; ctx.lineWidth = 2.5; ctx.stroke();
            ctx.globalAlpha = 1;

            // Junction point
            drawPoint(circCx, circCy - circR, 4, C.accent, C.accent, localE);

            drawText('ℝ / ℤ  ≅  S¹', cx + panelW * 0.2, circCy, 18, C.accent, localE);
        }
    }
}

// ══════════════════════════════════════════════════════════
// NAVIGATION
// ══════════════════════════════════════════════════════════
function goTo(n) {
    if (n < 0 || n >= TOTAL) return;
    step = n; t = 0; animStart = performance.now();
    updateUI();
}
window.next = () => goTo(step + 1);
window.prev = () => goTo(step - 1);

function updateUI() {
    document.getElementById('description').textContent = STEPS[step].desc;
    document.getElementById('prev-btn').disabled = step === 0;
    document.getElementById('next-btn').disabled = step === TOTAL - 1;

    // Dots
    const dotsEl = document.getElementById('dots');
    dotsEl.innerHTML = '';
    for (let i = 0; i < TOTAL; i++) {
        const d = document.createElement('div');
        d.className = 'dot' + (i === step ? ' active' : '');
        d.onclick = () => goTo(i);
        dotsEl.appendChild(d);
    }

    // Slider visibility
    sliderPanel.style.display = step === 6 ? 'flex' : 'none';
}

// Keyboard nav
document.addEventListener('keydown', e => {
    if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); window.next(); }
    if (e.key === 'ArrowLeft') { e.preventDefault(); window.prev(); }
});

// postMessage nav (for iframe embedding)
window.addEventListener('message', e => {
    if (e.data === 'next' || e.data === 'right') window.next();
    if (e.data === 'prev' || e.data === 'left') window.prev();
});

// ══════════════════════════════════════════════════════════
// INIT
// ══════════════════════════════════════════════════════════
function resize() {
    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.parentElement.getBoundingClientRect();
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    W = rect.width; H = rect.height;
    UNIT = Math.max(40, Math.min(100, W / 14));
}
window.addEventListener('resize', resize);

resize();
updateUI();
requestAnimationFrame(render);
