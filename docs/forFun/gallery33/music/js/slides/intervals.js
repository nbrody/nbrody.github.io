/* ============================================================
   Slide 3 — Consonant Intervals
   Draggable frequency orbs for 2–3 strings.
   Overtone spectrum with pairwise alignment visualization.
   Quantitative dissonance score via weighted roughness sum.
   Ratio cards act as presets that snap to exact intervals.
   ============================================================ */

import { ensureAudio, playRichTone, stopTone } from '../audio.js';
import { harmonicColors, getCanvas, getW, getH } from '../canvas.js';
import { getCurrentSlide } from '../navigation.js';

// ─── Constants ───────────────────────────────────────────
const FREQ_MIN = 80;
const FREQ_MAX = 500;
const ORB_RADIUS = 20;
const ORB_X = 50;
const NUM_OVERTONES = 6;
const PEAK_ROUGHNESS = 25;  // Hz — critical bandwidth peak
const STRING_COLORS = ['#60a5fa', '#a78bfa', '#f59e0b'];

// ─── State ───────────────────────────────────────────────
let strings = [
    { freq: 220 },  // A3
    { freq: 330 },  // E4 — perfect fifth
];

let dragIndex = -1;
let hoverIndex = -1;
let playing = false;
let oscArrays = [];  // one sub-array per string

// ─── DOM ─────────────────────────────────────────────────
const ratioCards = document.querySelectorAll('.ratio-card');

// ─── Helpers ─────────────────────────────────────────────
function freqToY(freq, H) {
    const top = 50, bottom = H - 50;
    const t = (freq - FREQ_MIN) / (FREQ_MAX - FREQ_MIN);
    return bottom - t * (bottom - top);
}

function yToFreq(y, H) {
    const top = 50, bottom = H - 50;
    const t = (bottom - y) / (bottom - top);
    return Math.round(FREQ_MIN + Math.max(0, Math.min(1, t)) * (FREQ_MAX - FREQ_MIN));
}

function canvasCoords(e) {
    const rect = getCanvas().getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function roughness(df) {
    const x = df / PEAK_ROUGHNESS;
    return Math.min(x * Math.exp(1 - x), 1);
}

function lerpColor(a, b, t) {
    // a, b are [r,g,b], t in [0,1]
    return a.map((v, i) => Math.round(v + (b[i] - v) * t));
}

// ─── Dissonance Calculation ──────────────────────────────
function computeDissonance() {
    const freqs = strings.map(s => s.freq);
    let totalD = 0, totalW = 0;

    for (let s1 = 0; s1 < freqs.length; s1++) {
        for (let s2 = s1 + 1; s2 < freqs.length; s2++) {
            for (let n1 = 1; n1 <= NUM_OVERTONES; n1++) {
                for (let n2 = 1; n2 <= NUM_OVERTONES; n2++) {
                    const diff = Math.abs(n1 * freqs[s1] - n2 * freqs[s2]);
                    const w = 1 / (n1 * n2);
                    totalD += w * roughness(diff);
                    totalW += w;
                }
            }
        }
    }
    return totalW > 0 ? totalD / totalW : 0;
}

// Get pairwise overtone interactions for visualization
function getOvertoneInteractions() {
    const interactions = [];
    const freqs = strings.map(s => s.freq);
    for (let s1 = 0; s1 < freqs.length; s1++) {
        for (let s2 = s1 + 1; s2 < freqs.length; s2++) {
            for (let n1 = 1; n1 <= NUM_OVERTONES; n1++) {
                for (let n2 = 1; n2 <= NUM_OVERTONES; n2++) {
                    const f1 = n1 * freqs[s1];
                    const f2 = n2 * freqs[s2];
                    const diff = Math.abs(f1 - f2);
                    const r = roughness(diff);
                    const w = 1 / (n1 * n2);
                    if (diff < 80) { // only show close interactions
                        interactions.push({ s1, s2, n1, n2, f1, f2, r, w });
                    }
                }
            }
        }
    }
    return interactions;
}

// ─── Audio ───────────────────────────────────────────────
function startAudio() {
    stopAudio();
    ensureAudio();
    oscArrays = strings.map(s => playRichTone(s.freq, 0.05));
    playing = true;
}

function updateAudio() {
    // Rebuild audio with current frequencies
    if (playing) startAudio();
}

function stopAudio() {
    oscArrays.forEach(arr => arr.forEach(o => stopTone(o)));
    oscArrays = [];
    playing = false;
}

export function stop() {
    stopAudio();
    dragIndex = -1;
    hoverIndex = -1;
}

// ─── Add/Remove Third String ─────────────────────────────
function addThirdString() {
    if (strings.length >= 3) return;
    strings.push({ freq: 275 }); // C#4ish — deliberately non-consonant as starting point
    if (playing) startAudio();
}

function removeThirdString() {
    if (strings.length <= 2) return;
    strings.pop();
    if (playing) startAudio();
}

// Hit test the +/- button
function hitAddButton(x, y, H) {
    const btnX = ORB_X;
    const btnY = H - 25;
    return Math.hypot(x - btnX, y - btnY) < 16;
}

// ─── Init ────────────────────────────────────────────────
export function init() {
    const canvas = getCanvas();

    // Ratio card presets: snap 2nd string to ratio × 1st string
    ratioCards.forEach(card => {
        card.addEventListener('click', () => {
            const [num, den] = card.dataset.ratio.split('/').map(Number);
            strings[1].freq = Math.round(strings[0].freq * num / den);
            ratioCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            if (!playing) startAudio();
            else updateAudio();
        });
    });

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseLeave);

    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
    canvas.addEventListener('touchcancel', onTouchEnd);
}

// ─── Mouse Handlers ──────────────────────────────────────
function onMouseDown(e) {
    if (getCurrentSlide() !== 3) return;
    const { x, y } = canvasCoords(e);
    const H = getH();

    // Check add/remove button
    if (hitAddButton(x, y, H)) {
        if (strings.length < 3) addThirdString();
        else removeThirdString();
        return;
    }

    // Check orb hit
    for (let i = 0; i < strings.length; i++) {
        const orbY = freqToY(strings[i].freq, H);
        if (Math.hypot(x - ORB_X, y - orbY) < ORB_RADIUS + 12) {
            dragIndex = i;
            getCanvas().style.cursor = 'grabbing';
            if (!playing) startAudio();
            return;
        }
    }

    // Click elsewhere: toggle audio
    if (playing) stopAudio();
    else startAudio();
}

function onMouseMove(e) {
    if (getCurrentSlide() !== 3) return;
    const { x, y } = canvasCoords(e);
    const H = getH();

    if (dragIndex >= 0) {
        strings[dragIndex].freq = yToFreq(y, H);
        // Clear any active ratio card
        ratioCards.forEach(c => c.classList.remove('active'));
        updateAudio();
        return;
    }

    // Hover detection
    let newHover = -1;
    for (let i = 0; i < strings.length; i++) {
        const orbY = freqToY(strings[i].freq, H);
        if (Math.hypot(x - ORB_X, y - orbY) < ORB_RADIUS + 12) {
            newHover = i;
            break;
        }
    }

    if (newHover !== hoverIndex) {
        hoverIndex = newHover;
        const onAddBtn = hitAddButton(x, y, H);
        getCanvas().style.cursor = (newHover >= 0 || onAddBtn) ? 'pointer' : '';
    }
}

function onMouseUp() {
    if (dragIndex >= 0) {
        dragIndex = -1;
        getCanvas().style.cursor = '';
    }
}

function onMouseLeave() {
    if (dragIndex >= 0) { dragIndex = -1; getCanvas().style.cursor = ''; }
    hoverIndex = -1;
}

function onTouchStart(e) {
    if (getCurrentSlide() !== 3) return;
    e.preventDefault();
    const { x, y } = canvasCoords(e.touches[0]);
    const H = getH();

    if (hitAddButton(x, y, H)) {
        if (strings.length < 3) addThirdString(); else removeThirdString();
        return;
    }

    for (let i = 0; i < strings.length; i++) {
        const orbY = freqToY(strings[i].freq, H);
        if (Math.hypot(x - ORB_X, y - orbY) < ORB_RADIUS + 20) {
            dragIndex = i;
            if (!playing) startAudio();
            return;
        }
    }
}

function onTouchMove(e) {
    if (dragIndex < 0) return;
    e.preventDefault();
    const { x, y } = canvasCoords(e.touches[0]);
    strings[dragIndex].freq = yToFreq(y, getH());
    ratioCards.forEach(c => c.classList.remove('active'));
    updateAudio();
}

function onTouchEnd() { dragIndex = -1; }

// ─── Draw ────────────────────────────────────────────────
export function draw(ts, ctx, W, H) {
    const t = ts / 1000;

    // ─── Frequency scale ─────────────────────────────
    drawFreqScale(ctx, H);

    // ─── Orbs ────────────────────────────────────────
    for (let i = 0; i < strings.length; i++) {
        const orbY = freqToY(strings[i].freq, H);
        drawOrb(ctx, ORB_X, orbY, STRING_COLORS[i], strings[i].freq,
            dragIndex === i, hoverIndex === i, t, i);
    }

    // ─── Add/remove string button ────────────────────
    drawAddButton(ctx, H, t);

    // ─── Spectral diagram ────────────────────────────
    const specLeft = ORB_X + ORB_RADIUS + 50;
    const specRight = W - 30;
    const specW = specRight - specLeft;
    const specTop = 50;
    const specBottom = H - 80;

    drawSpectralDiagram(ctx, t, specLeft, specRight, specW, specTop, specBottom, H);

    // ─── Dissonance score ────────────────────────────
    const diss = computeDissonance();
    drawDissonanceScore(ctx, diss, W, H);

    // ─── Audio hint ──────────────────────────────────
    if (!playing) {
        ctx.fillStyle = '#64748b';
        ctx.font = '400 12px "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'alphabetic';
        ctx.fillText('Drag an orb or click canvas to hear', W / 2, 25);
    }
}

// ─── Spectral Diagram ────────────────────────────────────
function drawSpectralDiagram(ctx, t, specLeft, specRight, specW, specTop, specBottom, H) {
    // Determine frequency range for the axis
    const maxOvertoneFreq = Math.max(...strings.map(s => s.freq)) * NUM_OVERTONES;
    const axisMin = 0;
    const axisMax = maxOvertoneFreq * 1.1;

    function freqToX(f) {
        return specLeft + (f - axisMin) / (axisMax - axisMin) * specW;
    }

    // Frequency axis
    ctx.strokeStyle = 'rgba(255,255,255,0.1)';
    ctx.lineWidth = 1;

    // Bands for each string
    const bandH = (specBottom - specTop) / strings.length;

    for (let si = 0; si < strings.length; si++) {
        const bandY = specTop + si * bandH + bandH / 2;
        const freq = strings[si].freq;
        const color = STRING_COLORS[si];

        // Band baseline
        ctx.strokeStyle = 'rgba(255,255,255,0.04)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(specLeft, bandY);
        ctx.lineTo(specRight, bandY);
        ctx.stroke();

        // Overtone dots
        for (let n = 1; n <= NUM_OVERTONES; n++) {
            const f = n * freq;
            const x = freqToX(f);
            if (x > specRight) continue;

            const r = Math.max(4, 10 - n); // larger dots for lower overtones
            const alpha = 0.4 + 0.6 / n;

            // Dot glow
            ctx.globalAlpha = alpha * 0.3;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(x, bandY, r * 2, 0, Math.PI * 2);
            ctx.fill();

            // Dot
            ctx.globalAlpha = alpha;
            ctx.fillStyle = color;
            ctx.beginPath();
            ctx.arc(x, bandY, r, 0, Math.PI * 2);
            ctx.fill();

            // Label
            ctx.globalAlpha = alpha * 0.7;
            ctx.fillStyle = '#cbd5e1';
            ctx.font = '400 9px "JetBrains Mono", monospace';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'top';
            ctx.fillText(`${n}`, x, bandY + r + 3);

            ctx.globalAlpha = 1;
        }

        // String label
        ctx.fillStyle = color;
        ctx.font = '500 11px "Inter", sans-serif';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${freq} Hz`, specLeft - 8, bandY);
    }

    // ─── Interaction lines between overtone pairs ────
    const interactions = getOvertoneInteractions();
    interactions.forEach(({ s1, s2, n1, n2, f1, f2, r, w }) => {
        if (w < 0.05) return; // skip very faint connections

        const x1 = freqToX(f1);
        const x2 = freqToX(f2);
        if (x1 > specRight || x2 > specRight) return;
        const y1 = specTop + s1 * bandH + bandH / 2;
        const y2 = specTop + s2 * bandH + bandH / 2;

        // Color: green (low roughness) → red (high roughness)
        const col = lerpColor([52, 211, 153], [239, 68, 68], r);
        ctx.strokeStyle = `rgba(${col[0]},${col[1]},${col[2]},${0.15 + w * 0.6})`;
        ctx.lineWidth = 1 + w * 2;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();

        // Dot at midpoint for strong interactions
        if (w > 0.15) {
            ctx.fillStyle = `rgba(${col[0]},${col[1]},${col[2]},${0.4 + w})`;
            ctx.beginPath();
            ctx.arc((x1 + x2) / 2, (y1 + y2) / 2, 2 + w * 3, 0, Math.PI * 2);
            ctx.fill();
        }
    });

    // Axis labels
    ctx.fillStyle = '#475569';
    ctx.font = '400 9px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    const step = axisMax > 2000 ? 500 : axisMax > 1000 ? 250 : 100;
    for (let f = step; f < axisMax; f += step) {
        const x = freqToX(f);
        if (x > specRight - 20) break;
        ctx.fillText(`${f}`, x, specBottom + 5);
    }
    ctx.fillText('Hz', specRight - 10, specBottom + 5);
}

// ─── Dissonance Score ────────────────────────────────────
function drawDissonanceScore(ctx, diss, W, H) {
    const barLeft = W * 0.25;
    const barRight = W * 0.75;
    const barW = barRight - barLeft;
    const barY = H - 22;
    const barH = 6;

    // Color
    const col = lerpColor([52, 211, 153], [239, 68, 68], diss);
    const colStr = `rgb(${col[0]},${col[1]},${col[2]})`;

    // Label
    ctx.fillStyle = colStr;
    ctx.font = '600 13px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`dissonance: ${diss.toFixed(3)}`, W / 2, barY - 10);

    // Background bar
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    ctx.beginPath(); ctx.roundRect(barLeft, barY, barW, barH, 3); ctx.fill();

    // Filled bar
    ctx.fillStyle = colStr;
    ctx.beginPath(); ctx.roundRect(barLeft, barY, barW * Math.min(diss, 1), barH, 3); ctx.fill();

    // Ratio hint
    const f1 = strings[0].freq, f2 = strings[1].freq;
    const ratio = f2 / f1;
    ctx.fillStyle = '#64748b';
    ctx.font = '400 10px "JetBrains Mono", monospace';
    ctx.fillText(`ratio ≈ ${ratio.toFixed(3)}`, W / 2, barY + barH + 14);
}

// ─── Orb Drawing ─────────────────────────────────────────
function drawOrb(ctx, x, y, color, freq, isDragged, isHovered, t, idx) {
    const r = ORB_RADIUS + (isDragged ? 4 : isHovered ? 2 : 0);
    const pulse = isDragged ? 1 + 0.03 * Math.sin(t * 8) : 1;
    const drawR = r * pulse;

    // Glow
    const grad = ctx.createRadialGradient(x, y, 0, x, y, drawR * 2.5);
    grad.addColorStop(0, color + '30');
    grad.addColorStop(1, color + '00');
    ctx.fillStyle = grad;
    ctx.beginPath(); ctx.arc(x, y, drawR * 2.5, 0, Math.PI * 2); ctx.fill();

    // Circle
    ctx.beginPath(); ctx.arc(x, y, drawR, 0, Math.PI * 2);
    ctx.fillStyle = color + '25';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = isDragged ? 3 : 2;
    ctx.stroke();

    // Label
    ctx.fillStyle = '#f1f5f9';
    ctx.font = '600 11px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(`f${idx + 1}`, x, y);
}

// ─── Freq Scale ──────────────────────────────────────────
function drawFreqScale(ctx, H) {
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#475569';
    ctx.font = '400 8px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let f = 100; f <= 500; f += 100) {
        const y = freqToY(f, H);
        ctx.beginPath();
        ctx.moveTo(ORB_X - ORB_RADIUS - 16, y);
        ctx.lineTo(ORB_X - ORB_RADIUS - 4, y);
        ctx.stroke();
        ctx.fillText(`${f}`, ORB_X - ORB_RADIUS - 18, y);
    }
}

// ─── Add/Remove Button ──────────────────────────────────
function drawAddButton(ctx, H, t) {
    const x = ORB_X, y = H - 25, r = 14;
    const isThree = strings.length >= 3;
    const label = isThree ? '−' : '+';
    const color = isThree ? '#ef4444' : '#34d399';

    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = color + '15';
    ctx.fill();
    ctx.strokeStyle = color + '60';
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = color;
    ctx.font = '600 16px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y);

    ctx.fillStyle = '#64748b';
    ctx.font = '400 9px "Inter", sans-serif';
    ctx.fillText(isThree ? 'remove' : 'add', x, y + r + 10);
}
