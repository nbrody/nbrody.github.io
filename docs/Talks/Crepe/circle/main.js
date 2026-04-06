// ═══════════════════════════════════════════════════════════
// ℝ/ℤ ≅ S¹ — Circle Visualization
// ═══════════════════════════════════════════════════════════

import * as THREE from 'three';

// ── COLORS ──
const C = {
    bg: '#060a14', text: '#f1f5f9', muted: '#94a3b8', dim: '#475569',
    accent: '#7c8aff', teal: '#2dd4bf', warm: '#f59e0b', rose: '#f472b6',
    purple: '#a78bfa', green: '#34d399',
    node: '#151d2e', nodeBorder: 'rgba(124,138,255,0.3)',
    line: 'rgba(148,163,184,0.3)', lineHi: 'rgba(148,163,184,0.5)',
};

const ANIM_MS = 700;
const BEND_ANIM_MS = 5000; // longer for the helix collapse animation

// ── STEPS ──
const STEPS = [
    { desc: 'The real number line ℝ — an infinite, continuous ruler stretching in both directions.' },
    { desc: 'Consider the map x ↦ x + 1. It shifts every point one unit to the right — a rigid motion.' },
    { desc: 'This shift preserves distances: |f(x) − f(y)| = |x − y|. It is an isometry of ℝ.' },
    { desc: 'The inverse operation is x ↦ x − 1. Shifting right then left returns every point to where it started.' },
    { desc: 'Iterating the shift gives translation by any integer n: x ↦ x + n. The group ℤ acts on ℝ.' },
    { desc: 'The orbit of a point x is the set { …, x−2, x−1, x, x+1, x+2, … }. We call this an "orbit."' },
    { desc: 'Drag the slider to explore different orbits. Notice: each orbit is a copy of ℤ, infinitely spread across ℝ.' },
    { desc: 'Shift the orbit to the right. After moving exactly 1 unit, the orbit looks the same! The orbit is periodic mod 1.' },
    { desc: 'Every orbit has exactly one representative in the interval [0, 1). We can identify each orbit with that point.' },
    { desc: 'But 0 and 1 are in the same orbit (0 + 1 = 1). So we must identify them: 0 ≡ 1.' },
    { desc: 'Glue the endpoints together: the interval [0, 1] curls up into a circle!' },
    { desc: 'Recap: x ↦ x+1 generates the group ℤ acting on ℝ. There is an orbit for each point [0,1). Identifying 0 ≡ 1 gives ℝ/ℤ ≅ S¹.' },
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

// Animated offset for step 7 (sliding the orbit)
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
function drawNumberLine(y, alpha = 1, rangeHL = null, worldOffset = 0) {
    ctx.globalAlpha = alpha;

    // Main line
    ctx.beginPath();
    ctx.moveTo(0, y); ctx.lineTo(W, y);
    ctx.strokeStyle = C.line; ctx.lineWidth = 2; ctx.stroke();

    // Tick marks and labels
    const wLeft = screenToWorld(0) - worldOffset - 1;
    const wRight = screenToWorld(W) - worldOffset + 1;
    const startInt = Math.floor(wLeft);
    const endInt = Math.ceil(wRight);

    for (let n = startInt; n <= endInt; n++) {
        const sx = worldToScreen(n + worldOffset);
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

    // When GL canvas is showing (step 10), we only draw 2D labels on top
    const lineY = H * 0.45;

    if (step <= 8) {
        renderNumberLine(lineY, e);
    } else if (step === 9) {
        renderIdentification(lineY, e);
    } else if (step === 10) {
        renderBending(lineY, e);
    } else if (step === 11) {
        renderRecap(e);
    }

    requestAnimationFrame(render);
}

function renderNumberLine(lineY, e) {
    const rangeHL = (step >= 8) ? [0, 1] : null;

    if (step === 1) {
        // Slide the entire line to the right by 1
        renderLineSlide(lineY, e, 1, C.teal, 'x ↦ x + 1');
        return;
    }

    if (step === 3) {
        // Slide the entire line to the left by 1
        renderLineSlide(lineY, e, -1, C.rose, 'x ↦ x − 1');
        return;
    }

    drawNumberLine(lineY, 1, rangeHL);

    if (step === 0) {
        // Just the number line with a fade-in title
        drawText('ℝ', W / 2, lineY - 70, 28, C.accent, e);
    }

    if (step === 2) {
        // Show distance preservation
        renderDistancePreservation(lineY, e);
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

function renderLineSlide(lineY, e, direction, color, label) {
    // The entire number line slides by `direction` units.
    // A ghost of the original position remains so you can see the rigid motion.
    const slideAmount = direction * e; // world units of current slide

    // 1. Ghost line: the original, fading out as animation progresses
    const ghostAlpha = Math.max(0.12, 1 - e * 1.2);
    drawNumberLine(lineY, ghostAlpha, null, 0);

    // 2. Sliding line: drawn in color, with worldOffset = slideAmount
    //    This shifts every tick & label by slideAmount in world coords
    drawNumberLine(lineY, 1, null, slideAmount);

    // 3. Label at bottom
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

    drawText(`Orbit of x = ${userOffset.toFixed(2)}`, W / 2, lineY - 70, 16, C.accent, 1);

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

    // "Same orbit!" flash when near integer
    if (slideOffset > 0.95 || slideOffset < 0.05) {
        const flash = 1 - Math.abs(slideOffset > 0.5 ? slideOffset - 1 : slideOffset) * 20;
        drawText('Same orbit!', W / 2, lineY - 80, 18, C.warm, Math.max(0, flash));
    }
}

function renderRepresentative(lineY, e) {
    // Smooth periodic rainbow gradient on the number line
    const barH = 22; // half-height of the rainbow bar

    // Use ImageData for silky-smooth per-pixel rendering
    const dpr = window.devicePixelRatio || 1;
    const pxW = Math.ceil(W * dpr);
    const barTop = Math.round((lineY - barH) * dpr);
    const barBot = Math.round((lineY + barH) * dpr);
    const barPxH = barBot - barTop;
    if (barPxH <= 0 || pxW <= 0) return;

    const imgData = ctx.createImageData(pxW, barPxH);
    const data = imgData.data;

    for (let px = 0; px < pxW; px++) {
        const wx = screenToWorld(px / dpr);
        // Fractional part → hue (periodic with period 1)
        let frac = wx % 1;
        if (frac < 0) frac += 1;
        const hue = frac;

        // Convert HSL to RGB inline (s=0.65, l=0.62 for soft pastels)
        const s = 0.65, l = 0.62;
        const c = (1 - Math.abs(2 * l - 1)) * s;
        const hp = hue * 6;
        const x2 = c * (1 - Math.abs(hp % 2 - 1));
        const m = l - c / 2;
        let r1, g1, b1;
        if (hp < 1) { r1 = c; g1 = x2; b1 = 0; }
        else if (hp < 2) { r1 = x2; g1 = c; b1 = 0; }
        else if (hp < 3) { r1 = 0; g1 = c; b1 = x2; }
        else if (hp < 4) { r1 = 0; g1 = x2; b1 = c; }
        else if (hp < 5) { r1 = x2; g1 = 0; b1 = c; }
        else { r1 = c; g1 = 0; b1 = x2; }
        const R = Math.round((r1 + m) * 255);
        const G = Math.round((g1 + m) * 255);
        const B = Math.round((b1 + m) * 255);

        for (let py = 0; py < barPxH; py++) {
            // Vertical feathering: smooth fade at top and bottom edges
            const distFromEdge = Math.min(py, barPxH - 1 - py);
            const feather = Math.min(1, distFromEdge / (6 * dpr));
            const alpha = Math.round(e * feather * 220);

            const idx = (py * pxW + px) * 4;
            data[idx] = R;
            data[idx + 1] = G;
            data[idx + 2] = B;
            data[idx + 3] = alpha;
        }
    }

    // Save transform, draw at pixel coords, restore
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.putImageData(imgData, 0, barTop);
    ctx.restore();

    // Highlight [0,1] bracket
    const s0 = worldToScreen(0), s1 = worldToScreen(1);
    ctx.globalAlpha = e;
    ctx.strokeStyle = C.text; ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(s0, lineY - barH - 6); ctx.lineTo(s0, lineY + barH + 6);
    ctx.moveTo(s1, lineY - barH - 6); ctx.lineTo(s1, lineY + barH + 6);
    ctx.stroke();
    drawText('[0, 1)', (s0 + s1) / 2, lineY - barH - 20, 16, C.text, e);
    ctx.globalAlpha = 1;

    // Label below
    if (e > 0.4) {
        const lE = ease((e - 0.4) / 0.6);
        drawText('Each color = one orbit = one point of the quotient', W / 2, lineY + barH + 30, 13, C.muted, lE);
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

// ══════════════════════════════════════════════════════════
// THREE.JS HELIX SCENE (Step 10)
// ══════════════════════════════════════════════════════════

const glCanvas = document.getElementById('gl-canvas');
let helixScene, helixCamera, helixRenderer, helixMesh;
let helixInited = false;
const HELIX_TURNS = 8;    // total turns of the helix visible
const HELIX_R = 1.6;      // circle radius
const HELIX_PITCH_MAX = 0.6; // max height per turn

function initHelix() {
    if (helixInited) return;
    helixInited = true;

    helixScene = new THREE.Scene();
    helixCamera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
    helixCamera.position.set(0, 2.5, 6);
    helixCamera.lookAt(0, 0, 0);

    helixRenderer = new THREE.WebGLRenderer({
        canvas: glCanvas, antialias: true, alpha: true
    });
    helixRenderer.setClearColor(0x060a14, 1);
    helixRenderer.setPixelRatio(window.devicePixelRatio);

    // Ambient + directional light
    helixScene.add(new THREE.AmbientLight(0xffffff, 0.5));
    const dLight = new THREE.DirectionalLight(0xffffff, 0.8);
    dLight.position.set(3, 5, 4);
    helixScene.add(dLight);

    buildHelixMesh(1.0);
}

function buildHelixMesh(pitchFrac) {
    if (helixMesh) {
        helixScene.remove(helixMesh);
        helixMesh.geometry.dispose();
        helixMesh.material.dispose();
    }

    const pitch = HELIX_PITCH_MAX * pitchFrac;
    const segments = 1200;
    const halfTurns = HELIX_TURNS / 2;

    // Build a series of points for TubeGeometry
    const points = [];
    for (let i = 0; i <= segments; i++) {
        const s = (i / segments - 0.5) * HELIX_TURNS; // s in [-halfTurns, halfTurns]
        const angle = s * Math.PI * 2;
        const x = HELIX_R * Math.cos(angle);
        const z = HELIX_R * Math.sin(angle);
        const y = s * pitch;
        points.push(new THREE.Vector3(x, y, z));
    }

    const curve = new THREE.CatmullRomCurve3(points, false);
    const tubeGeo = new THREE.TubeGeometry(curve, segments, 0.06, 12, false);

    // Apply vertex colors based on fractional turn (hue)
    const colors = new Float32Array(tubeGeo.attributes.position.count * 3);
    const posAttr = tubeGeo.attributes.position;
    const col = new THREE.Color();

    for (let i = 0; i < posAttr.count; i++) {
        const px = posAttr.getX(i);
        const pz = posAttr.getZ(i);
        // compute angle around the circle
        let angle = Math.atan2(pz, px); // [-π, π]
        let frac = angle / (2 * Math.PI);
        if (frac < 0) frac += 1;
        col.setHSL(frac, 0.8, 0.55);
        colors[i * 3] = col.r;
        colors[i * 3 + 1] = col.g;
        colors[i * 3 + 2] = col.b;
    }
    tubeGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    const mat = new THREE.MeshStandardMaterial({
        vertexColors: true,
        metalness: 0.2,
        roughness: 0.5,
    });

    helixMesh = new THREE.Mesh(tubeGeo, mat);
    helixScene.add(helixMesh);
}

function resizeHelix() {
    if (!helixRenderer) return;
    const rect = glCanvas.parentElement.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    glCanvas.width = rect.width * dpr;
    glCanvas.height = rect.height * dpr;
    helixRenderer.setSize(rect.width, rect.height);
    helixCamera.aspect = rect.width / rect.height;
    helixCamera.updateProjectionMatrix();
}

function renderHelixStep(e) {
    // e goes 0→1 over the animation.
    // Phase 1 (0→0.4): Show the helix, rotating gently
    // Phase 2 (0.4→0.9): Collapse pitch to 0
    // Phase 3 (0.9→1): Final circle, label

    const collapseStart = 0.35;
    const collapseEnd = 0.85;

    let pitchFrac;
    if (e <= collapseStart) pitchFrac = 1.0;
    else if (e >= collapseEnd) pitchFrac = 0.0;
    else pitchFrac = 1.0 - ease((e - collapseStart) / (collapseEnd - collapseStart));

    buildHelixMesh(pitchFrac);

    // Gentle auto-rotation
    const now = performance.now() * 0.0003;
    const camDist = 5.5;
    // Smoothly lower camera angle as helix collapses to show the circle from a good angle
    const camY = lerp(2.5, 0.5, 1 - pitchFrac);
    const camAngle = now + Math.PI * 0.25;
    helixCamera.position.set(
        camDist * Math.sin(camAngle),
        camY,
        camDist * Math.cos(camAngle)
    );
    helixCamera.lookAt(0, 0, 0);

    helixRenderer.render(helixScene, helixCamera);

    // Draw labels on the 2D canvas overlay
    if (e > 0.88) {
        const labelE = ease((e - 0.88) / 0.12);
        drawText('S¹', W / 2, H * 0.82, 24, C.accent, labelE);
    }
}

function showGLCanvas(show) {
    glCanvas.style.display = show ? 'block' : 'none';
}

function renderBending(lineY, e) {
    // Initialize Three.js scene (lazy)
    initHelix();
    resizeHelix();
    showGLCanvas(true);
    renderHelixStep(e);
}

function renderFinalCircle(e) {
    const circleR = Math.min(W, H) * 0.22;
    const circleCx = W / 2;
    const circleCy = H * 0.4;

    // Big beautiful circle with glow
    drawCircleShape(circleCx, circleCy, circleR, e);

    // Tick marks at key fractions
    const fracs = [0, 1 / 6, 1 / 4, 1 / 3, 1 / 2, 2 / 3, 3 / 4, 5 / 6];
    const fracLabels = ['0', '⅙', '¼', '⅓', '½', '⅔', '¾', '⅚'];
    const netColors = [C.accent, C.teal, C.warm, C.rose, C.purple, C.green, C.teal, C.warm];

    for (let i = 0; i < fracs.length; i++) {
        const delay = i * 0.06;
        const localE = ease(Math.max(0, Math.min(1, (e - delay) / 0.5)));
        if (localE <= 0) continue;

        const angle = -Math.PI / 2 + fracs[i] * Math.PI * 2;
        const px = circleCx + circleR * Math.cos(angle);
        const py = circleCy + circleR * Math.sin(angle);
        const ly = circleCy + (circleR + 25) * Math.sin(angle);

        drawPoint(px, py, 4, netColors[i], netColors[i], localE);
        drawText(fracLabels[i], lx, ly, 12, C.muted, localE);
    }
}
function renderRecap(e) {
    // Four panels stacked vertically, fading in sequentially
    const panelH = H * 0.18;
    const panelW = Math.min(W * 0.7, 500);
    const startY = H * 0.08;
    const cx = W / 2;

    const panels = [
        { label: '1. The Space', color: C.muted, delay: 0 },
        { label: '2. The Symmetry', color: C.teal, delay: 0.15 },
        { label: '3. The Orbit', color: C.warm, delay: 0.3 },
        { label: '4. The Quotient', color: C.accent, delay: 0.45 },
    ];

    for (let i = 0; i < panels.length; i++) {
        const p = panels[i];
        const py = startY + i * (panelH + 10);
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
        drawText(p.label, rx + 16, py + 20, 12, p.color, localE, 'left');

        // Panel content
        if (i === 0) {
            // "The Space" - Just the line
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
            drawText('ℝ', cx + panelW * 0.25, lineY2, 18, C.muted, localE);
        }

        if (i === 1) {
            // "The Symmetry" - Shift action
            const lineY2 = py + panelH * 0.6;
            const lineLeft = rx + 30, lineRight = rx + panelW - 30;
            ctx.globalAlpha = localE * 0.4;
            ctx.beginPath(); ctx.moveTo(lineLeft, lineY2); ctx.lineTo(lineRight, lineY2);
            ctx.strokeStyle = C.line; ctx.lineWidth = 1.5; ctx.stroke();
            ctx.globalAlpha = localE;

            const miniUnit = (lineRight - lineLeft) / 8;
            const xPt = (lineLeft + lineRight) / 2 - miniUnit;
            const x1Pt = xPt + miniUnit;
            drawPoint(xPt, lineY2, 4, C.node, C.teal, localE);
            drawPoint(x1Pt, lineY2, 4, C.node, C.teal, localE);

            const arcCx2 = (xPt + x1Pt) / 2;
            ctx.globalAlpha = localE * 0.7;
            ctx.beginPath();
            ctx.arc(arcCx2, lineY2, miniUnit / 2, Math.PI, 2 * Math.PI);
            ctx.strokeStyle = C.teal; ctx.lineWidth = 1.5; ctx.stroke();
            ctx.globalAlpha = 1;

            drawText('x ↦ x + 1', cx + panelW * 0.2, lineY2, 14, C.teal, localE);
        }

        if (i === 2) {
            // "The Orbit" - collection of points
            const dotY = py + panelH * 0.6;
            const dotLeft = rx + 40, dotRight = rx + panelW - 90;
            const nDots = 7;
            for (let j = 0; j < nDots; j++) {
                const dx = dotLeft + j * (dotRight - dotLeft) / (nDots - 1);
                drawPoint(dx, dotY, 4, C.warm, 'rgba(245,158,11,0.3)', localE);
            }
            drawText('…', dotLeft - 15, dotY, 14, C.muted, localE);
            drawText('…', dotRight + 15, dotY, 14, C.muted, localE);
            drawText('x + ℤ', cx + panelW * 0.25, dotY, 14, C.warm, localE);
        }

        if (i === 3) {
            // "The Quotient" - circle
            const circR = panelH * 0.3;
            const circCx = rx + panelW * 0.25;
            const circCy = py + panelH * 0.55;

            ctx.globalAlpha = localE;
            ctx.beginPath(); ctx.arc(circCx, circCy, circR, 0, Math.PI * 2);
            ctx.strokeStyle = C.accent; ctx.lineWidth = 2.5; ctx.stroke();
            ctx.globalAlpha = 1;

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
    // Hide GL canvas when leaving step 10
    if (step === 10 && n !== 10) showGLCanvas(false);
    step = n; t = 0; animStart = performance.now();
    updateUI();
    // Notify parent frame of step state (for embedded control)
    if (window.parent !== window) {
        window.parent.postMessage({ type: 'circleState', step: step, total: TOTAL }, '*');
    }
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

// Keyboard nav (disabled in embed mode — parent controls navigation)
const isEmbedded = new URLSearchParams(window.location.search).get('embed') === 'true';
if (!isEmbedded) {
    document.addEventListener('keydown', e => {
        if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); window.next(); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); window.prev(); }
    });
}

// postMessage nav (for iframe embedding)
window.addEventListener('message', e => {
    if (e.data === 'next' || e.data === 'right') window.next();
    if (e.data === 'prev' || e.data === 'left') window.prev();
    if (typeof e.data === 'object' && e.data.type === 'goTo') goTo(e.data.step);
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
window.addEventListener('resize', () => { resize(); if (helixInited) resizeHelix(); });

resize();
updateUI();
requestAnimationFrame(render);

// Notify parent of initial state
if (window.parent !== window) {
    window.parent.postMessage({ type: 'circleState', step: step, total: TOTAL }, '*');
}
