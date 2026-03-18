/* ============================================================
   Slide 1 — Beating / Dissonance
   Two draggable frequency orbs on the canvas.
   Drag vertically to change frequency; audio plays live.
   ============================================================ */

import { ensureAudio, playTone, stopTone } from '../audio.js';
import { harmonicColors, getCanvas, getW, getH } from '../canvas.js';
import { getCurrentSlide } from '../navigation.js';

// ─── Constants ───────────────────────────────────────────
const FREQ_MIN = 200;
const FREQ_MAX = 600;
const ORB_RADIUS = 22;
const WAVE_MARGIN = 80; // left margin where orbs sit

// ─── State ───────────────────────────────────────────────
let freq1 = 440;
let freq2 = 440;
let playing = false;
let oscs = [];

// Orb positions (y coords, set from freqs)
let orb1Y = 0;
let orb2Y = 0;

// Drag state
let dragIndex = -1; // -1 = none, 0 = orb1, 1 = orb2
let hoverIndex = -1;

// ─── Helpers ─────────────────────────────────────────────
function freqToY(freq, H) {
    // Top = high freq, bottom = low freq
    const usableTop = 60;
    const usableBottom = H - 60;
    const t = (freq - FREQ_MIN) / (FREQ_MAX - FREQ_MIN);
    return usableBottom - t * (usableBottom - usableTop);
}

function yToFreq(y, H) {
    const usableTop = 60;
    const usableBottom = H - 60;
    const t = (usableBottom - y) / (usableBottom - usableTop);
    return FREQ_MIN + Math.max(0, Math.min(1, t)) * (FREQ_MAX - FREQ_MIN);
}

function canvasCoords(e) {
    const canvas = getCanvas();
    const rect = canvas.getBoundingClientRect();
    return {
        x: e.clientX - rect.left,
        y: e.clientY - rect.top
    };
}

function distToOrb(mx, my, orbX, orbY) {
    return Math.hypot(mx - orbX, my - orbY);
}

// ─── Audio ───────────────────────────────────────────────
function startAudio() {
    if (playing) updateAudioFreqs();
    else {
        ensureAudio();
        oscs = [
            playTone(freq1, 0.15, 'sine'),
            playTone(freq2, 0.15, 'sine')
        ];
        playing = true;
    }
}

function updateAudioFreqs() {
    if (oscs.length >= 2) {
        oscs[0].osc.frequency.value = freq1;
        oscs[1].osc.frequency.value = freq2;
    }
}

export function stop() {
    oscs.forEach(o => stopTone(o));
    oscs = [];
    playing = false;
    dragIndex = -1;
    hoverIndex = -1;
}

// ─── Init ────────────────────────────────────────────────
export function init() {
    const canvas = getCanvas();

    canvas.addEventListener('mousedown', onMouseDown);
    canvas.addEventListener('mousemove', onMouseMove);
    canvas.addEventListener('mouseup', onMouseUp);
    canvas.addEventListener('mouseleave', onMouseLeave);

    // Touch support
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onTouchEnd);
    canvas.addEventListener('touchcancel', onTouchEnd);
}

// ─── Mouse Handlers ──────────────────────────────────────
function onMouseDown(e) {
    if (getCurrentSlide() !== 1) return;
    const { x, y } = canvasCoords(e);
    const H = getH();

    orb1Y = freqToY(freq1, H);
    orb2Y = freqToY(freq2, H);

    const d1 = distToOrb(x, y, WAVE_MARGIN, orb1Y);
    const d2 = distToOrb(x, y, WAVE_MARGIN, orb2Y);

    if (d1 < ORB_RADIUS + 12 && d1 <= d2) {
        dragIndex = 0;
    } else if (d2 < ORB_RADIUS + 12) {
        dragIndex = 1;
    } else {
        // Click anywhere else: toggle audio
        if (playing) stop();
        else startAudio();
        return;
    }

    getCanvas().style.cursor = 'grabbing';
    startAudio();
}

function onMouseMove(e) {
    if (getCurrentSlide() !== 1) return;
    const { x, y } = canvasCoords(e);
    const H = getH();

    if (dragIndex >= 0) {
        const newFreq = Math.round(yToFreq(y, H));
        if (dragIndex === 0) freq1 = newFreq;
        else freq2 = newFreq;
        if (playing) updateAudioFreqs();
    } else {
        // Hover detection for cursor
        orb1Y = freqToY(freq1, H);
        orb2Y = freqToY(freq2, H);
        const d1 = distToOrb(x, y, WAVE_MARGIN, orb1Y);
        const d2 = distToOrb(x, y, WAVE_MARGIN, orb2Y);
        const nearOrb = (d1 < ORB_RADIUS + 12 || d2 < ORB_RADIUS + 12);
        hoverIndex = d1 < ORB_RADIUS + 12 ? 0 : (d2 < ORB_RADIUS + 12 ? 1 : -1);
        getCanvas().style.cursor = nearOrb ? 'grab' : '';
    }
}

function onMouseUp() {
    if (dragIndex >= 0) {
        dragIndex = -1;
        getCanvas().style.cursor = '';
    }
}

function onMouseLeave() {
    if (dragIndex >= 0) {
        dragIndex = -1;
        getCanvas().style.cursor = '';
    }
    hoverIndex = -1;
}

// ─── Touch Handlers ──────────────────────────────────────
function onTouchStart(e) {
    if (getCurrentSlide() !== 1) return;
    e.preventDefault();
    const touch = e.touches[0];
    const { x, y } = canvasCoords(touch);
    const H = getH();

    orb1Y = freqToY(freq1, H);
    orb2Y = freqToY(freq2, H);

    const d1 = distToOrb(x, y, WAVE_MARGIN, orb1Y);
    const d2 = distToOrb(x, y, WAVE_MARGIN, orb2Y);

    if (d1 < ORB_RADIUS + 20 && d1 <= d2) dragIndex = 0;
    else if (d2 < ORB_RADIUS + 20) dragIndex = 1;
    else return;

    startAudio();
}

function onTouchMove(e) {
    if (dragIndex < 0) return;
    e.preventDefault();
    const touch = e.touches[0];
    const { x, y } = canvasCoords(touch);
    const H = getH();
    const newFreq = Math.round(yToFreq(y, H));
    if (dragIndex === 0) freq1 = newFreq;
    else freq2 = newFreq;
    if (playing) updateAudioFreqs();
}

function onTouchEnd() {
    dragIndex = -1;
}

// ─── Draw ────────────────────────────────────────────────
export function draw(ts, ctx, W, H) {
    const t = ts / 1000;

    // Update orb Y positions from current frequencies
    orb1Y = freqToY(freq1, H);
    orb2Y = freqToY(freq2, H);

    const f1 = freq1;
    const f2 = freq2;
    const fDiff = Math.abs(f1 - f2);
    const visF1 = f1 / 100;
    const visF2 = f2 / 100;

    const waveLeft = WAVE_MARGIN + ORB_RADIUS + 20;
    const waveRight = W - 40;
    const waveW = waveRight - waveLeft;

    // ─── Frequency scale on the left ─────────────────
    drawFreqScale(ctx, H);

    // ─── Orb 1 (blue) ────────────────────────────────
    drawOrb(ctx, WAVE_MARGIN, orb1Y, harmonicColors[0], `f₁`, f1,
        dragIndex === 0, hoverIndex === 0, t);

    // ─── Orb 2 (purple) ──────────────────────────────
    drawOrb(ctx, WAVE_MARGIN, orb2Y, harmonicColors[1], `f₂`, f2,
        dragIndex === 1, hoverIndex === 1, t);

    // ─── Wave 1 ──────────────────────────────────────
    ctx.strokeStyle = harmonicColors[0];
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    for (let x = 0; x <= waveW; x += 2) {
        const xNorm = x / waveW;
        const y = orb1Y + 40 * Math.sin(2 * Math.PI * visF1 * xNorm * 8 - t * 2);
        if (x === 0) ctx.moveTo(waveLeft + x, y);
        else ctx.lineTo(waveLeft + x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    // ─── Wave 2 ──────────────────────────────────────
    ctx.strokeStyle = harmonicColors[1];
    ctx.lineWidth = 2;
    ctx.globalAlpha = 0.8;
    ctx.beginPath();
    for (let x = 0; x <= waveW; x += 2) {
        const xNorm = x / waveW;
        const y = orb2Y + 40 * Math.sin(2 * Math.PI * visF2 * xNorm * 8 - t * 2);
        if (x === 0) ctx.moveTo(waveLeft + x, y);
        else ctx.lineTo(waveLeft + x, y);
    }
    ctx.stroke();
    ctx.globalAlpha = 1;

    // ─── Combined wave (bottom region) ───────────────
    const combY = H - 80;
    const combAmp = 30;

    // Combined wave label
    ctx.fillStyle = '#f1f5f9';
    ctx.font = '500 12px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.fillText(`Combined  ·  Δf = ${fDiff} Hz`, waveLeft, combY - 55);

    // Dissonance rating ∈ [0, 1]
    // Roughness peaks around |Δf| ≈ 25–30 Hz (critical bandwidth for these frequencies),
    // modelled as a simple bump: d(x) = x·e^(1−x) where x = Δf / peakFreq
    const peakRoughness = 25; // Hz where roughness is maximised
    const xNormed = fDiff / peakRoughness;
    const dissonance = Math.min(xNormed * Math.exp(1 - xNormed), 1);

    // Color: lerp green → red
    const r = Math.round(52 + (239 - 52) * dissonance);
    const g = Math.round(211 + (68 - 211) * dissonance);
    const b = Math.round(153 + (68 - 153) * dissonance);

    // Numeric readout
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.font = '600 12px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'alphabetic';
    ctx.fillText(`dissonance: ${dissonance.toFixed(2)}`, waveRight, combY - 55);

    // Small bar
    const barW = 60, barH = 4, barX = waveRight - barW, barY = combY - 48;
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath(); ctx.roundRect(barX, barY, barW, barH, 2); ctx.fill();
    ctx.fillStyle = `rgb(${r},${g},${b})`;
    ctx.beginPath(); ctx.roundRect(barX, barY, barW * dissonance, barH, 2); ctx.fill();

    // Combined waveform
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let x = 0; x <= waveW; x += 2) {
        const xNorm = x / waveW;
        const sig = Math.sin(2 * Math.PI * visF1 * xNorm * 8 - t * 2) +
            Math.sin(2 * Math.PI * visF2 * xNorm * 8 - t * 2);
        const y = combY + sig * combAmp;
        if (x === 0) ctx.moveTo(waveLeft + x, y);
        else ctx.lineTo(waveLeft + x, y);
    }
    ctx.stroke();

    // Envelope
    const visDiff = Math.abs(visF1 - visF2);
    const visAvg = (visF1 + visF2) / 2;
    if (visDiff > 0.01) {
        ctx.strokeStyle = 'rgba(245, 158, 11, 0.4)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([6, 4]);
        for (let sign = -1; sign <= 1; sign += 2) {
            ctx.beginPath();
            for (let x = 0; x <= waveW; x += 2) {
                const xNorm = x / waveW;
                const env = 2 * Math.abs(Math.cos(Math.PI * visDiff * xNorm * 8 - t * (visDiff / visAvg)));
                const y = combY + sign * env * combAmp;
                if (x === 0) ctx.moveTo(waveLeft + x, y);
                else ctx.lineTo(waveLeft + x, y);
            }
            ctx.stroke();
        }
        ctx.setLineDash([]);
    }

    // ─── Audio state indicator ───────────────────────
    if (!playing) {
        ctx.fillStyle = '#64748b';
        ctx.font = '400 13px "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Drag an orb or click canvas to hear', W / 2, 30);
    } else {
        ctx.fillStyle = 'rgba(96, 165, 250, 0.5)';
        ctx.font = '400 12px "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('🔊 Playing — click canvas to stop', W / 2, 30);
    }
}

// ─── Orb Drawing ─────────────────────────────────────────
function drawOrb(ctx, x, y, color, label, freq, isDragged, isHovered, t) {
    const r = ORB_RADIUS + (isDragged ? 4 : isHovered ? 2 : 0);
    const pulse = isDragged ? 1 + 0.03 * Math.sin(t * 8) : 1;
    const drawR = r * pulse;

    // Outer glow
    const gradient = ctx.createRadialGradient(x, y, 0, x, y, drawR * 2.5);
    gradient.addColorStop(0, color + '30');
    gradient.addColorStop(1, color + '00');
    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(x, y, drawR * 2.5, 0, Math.PI * 2);
    ctx.fill();

    // Main circle
    ctx.beginPath();
    ctx.arc(x, y, drawR, 0, Math.PI * 2);
    ctx.fillStyle = color + '25';
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = isDragged ? 3 : 2;
    ctx.stroke();

    // Frequency label inside
    ctx.fillStyle = '#f1f5f9';
    ctx.font = '600 12px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x, y - 1);

    // Frequency value to the right
    ctx.fillStyle = color;
    ctx.font = '500 11px "JetBrains Mono", monospace';
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';
    ctx.fillText(`${freq} Hz`, x + drawR + 8, y);
}

// ─── Frequency Scale ─────────────────────────────────────
function drawFreqScale(ctx, H) {
    const usableTop = 60;
    const usableBottom = H - 60;

    // Subtle tick marks
    ctx.strokeStyle = 'rgba(255,255,255,0.06)';
    ctx.lineWidth = 1;
    ctx.fillStyle = '#475569';
    ctx.font = '400 9px "JetBrains Mono", monospace';
    ctx.textAlign = 'right';
    ctx.textBaseline = 'middle';

    for (let f = 200; f <= 600; f += 100) {
        const y = freqToY(f, H);
        ctx.beginPath();
        ctx.moveTo(WAVE_MARGIN - ORB_RADIUS - 20, y);
        ctx.lineTo(WAVE_MARGIN - ORB_RADIUS - 6, y);
        ctx.stroke();
        ctx.fillText(`${f}`, WAVE_MARGIN - ORB_RADIUS - 22, y);
    }
}
