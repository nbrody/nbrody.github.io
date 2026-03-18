/* ============================================================
   Slide 2 — Vibrating String / Overtones
   Audio: pluck plays rich tone with decaying harmonics
   Canvas: combined string shape + decomposed harmonics
   Input: mouse drag on canvas to pull and release the string
          click harmonic labels to hear individual pure tones
   ============================================================ */

import { ensureAudio, getAudioCtx, playTone, stopTone, playRichTone } from '../audio.js';
import { harmonicColors, getCanvas, getW, getH } from '../canvas.js';
import { getCurrentSlide } from '../navigation.js';

// ─── Constants ───────────────────────────────────────────
const NUM_HARMONICS = 8;
const SHOW_HARMONICS = 8;      // How many harmonic rows to draw
const VIS_BASE_FREQ = 2;       // Visual oscillation speed
const MARGIN = 60;             // Canvas margin for string endpoints
const STRING_Y_FRAC = 0.3;    // String rests at 30% from the top
const GRAB_RADIUS = 40;       // How close (px) mouse must be to grab the string
const MAX_DISPLACEMENT = 120; // Clamp max pull distance in px
const BASE_FREQ = 82.41;     // E2 audible frequency

// ─── State ───────────────────────────────────────────────
let amplitudes = new Array(NUM_HARMONICS).fill(0);
let phases = new Array(NUM_HARMONICS).fill(0);
let decay = new Array(NUM_HARMONICS).fill(0);
let plucked = false;
let pluckTime = 0;

// Drag state
let dragging = false;
let dragX = 0;
let dragY = 0;
let dragPosNorm = 0.5;
let dragDisplacement = 0;

// Velocity tracking
const VEL_SAMPLES = 5;
let velHistory = [];

// Harmonic solo playback
let soloHarmonic = -1;      // which harmonic (0-indexed) is soloed, -1 = none
let soloTone = null;        // { osc, gain } for the playing tone
let soloStartTime = 0;      // for visual pulse
let hoverHarmonic = -1;     // which label is hovered

// ─── DOM ─────────────────────────────────────────────────
const pluckBtn = document.getElementById('pluck-btn');

// ─── Helpers ─────────────────────────────────────────────
function getStringGeometry() {
    const W = getW();
    const H = getH();
    const stringLen = W - 2 * MARGIN;
    const stringY = H * STRING_Y_FRAC;
    return { W, H, stringLen, stringY };
}

function getHarmonicLayout(H) {
    const harmonicAreaTop = H * 0.5;
    const harmonicH = (H - harmonicAreaTop - 40) / SHOW_HARMONICS;
    return { harmonicAreaTop, harmonicH };
}

function getHarmonicYCenter(n, H) {
    const { harmonicAreaTop, harmonicH } = getHarmonicLayout(H);
    return harmonicAreaTop + (n + 0.5) * harmonicH;
}

function canvasCoords(e) {
    const canvas = getCanvas();
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
}

function hitTestHarmonicLabel(x, y, H) {
    // Labels are drawn at (MARGIN - 40, yCenter + 4)
    // Hit area: a box around the label extending into the row
    const { harmonicAreaTop } = getHarmonicLayout(H);
    if (y < harmonicAreaTop - 10 || x > MARGIN + 40) return -1;

    for (let n = 0; n < SHOW_HARMONICS; n++) {
        const yCenter = getHarmonicYCenter(n, H);
        if (Math.abs(y - yCenter) < 18 && x < MARGIN + 40) {
            return n;
        }
    }
    return -1;
}

// ─── Init ────────────────────────────────────────────────
export function init() {
    pluckBtn.addEventListener('click', () => pluckAt(0.25, 60));

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

export function reset() {
    plucked = false;
    dragging = false;
    amplitudes.fill(0);
    phases.fill(0);
    decay.fill(0);
    velHistory = [];
    stopSoloHarmonic();
}

export function stop() {
    stopSoloHarmonic();
}

// ─── Harmonic Solo ───────────────────────────────────────
function toggleSoloHarmonic(n) {
    if (soloHarmonic === n) {
        // Clicking same one again → stop
        stopSoloHarmonic();
    } else {
        stopSoloHarmonic();
        ensureAudio();
        const freq = BASE_FREQ * (n + 1);
        soloTone = playTone(freq, 0.18, 'sine');
        soloHarmonic = n;
        soloStartTime = performance.now();

        // Auto-stop after 3 seconds
        setTimeout(() => {
            if (soloHarmonic === n) stopSoloHarmonic();
        }, 3000);
    }
}

function stopSoloHarmonic() {
    if (soloTone) {
        stopTone(soloTone, 0.15);
        soloTone = null;
    }
    soloHarmonic = -1;
}

// ─── Mouse Interaction ───────────────────────────────────
function onMouseDown(e) {
    if (getCurrentSlide() !== 2) return;
    const { x, y } = canvasCoords(e);
    const H = getH();

    // Check harmonic label click first
    const hitN = hitTestHarmonicLabel(x, y, H);
    if (hitN >= 0) {
        toggleSoloHarmonic(hitN);
        return;
    }

    // Otherwise, try to grab the string
    tryGrabString(x, y);
}

function onMouseMove(e) {
    if (getCurrentSlide() !== 2) return;
    const { x, y } = canvasCoords(e);

    if (dragging) {
        updateDrag(x, y);
        return;
    }

    // Hover detection for harmonic labels
    const H = getH();
    const hitN = hitTestHarmonicLabel(x, y, H);
    if (hitN !== hoverHarmonic) {
        hoverHarmonic = hitN;
        getCanvas().style.cursor = hitN >= 0 ? 'pointer' : '';
    }

    // Also check string hover
    if (hitN < 0) {
        const { stringLen, stringY } = getStringGeometry();
        const xOnString = x >= MARGIN && x <= MARGIN + stringLen;
        const yNearString = Math.abs(y - stringY) < GRAB_RADIUS;
        if (xOnString && yNearString) {
            getCanvas().style.cursor = 'grab';
        }
    }
}

function onMouseUp() {
    if (!dragging) return;
    releaseDrag();
}

function onMouseLeave() {
    if (dragging) releaseDrag();
    hoverHarmonic = -1;
}

function onTouchStart(e) {
    if (getCurrentSlide() !== 2) return;
    e.preventDefault();
    const touch = e.touches[0];
    const { x, y } = canvasCoords(touch);
    const H = getH();

    // Check harmonic label tap first
    const hitN = hitTestHarmonicLabel(x, y, H);
    if (hitN >= 0) {
        toggleSoloHarmonic(hitN);
        return;
    }

    tryGrabString(x, y);
}

function onTouchMove(e) {
    if (!dragging) return;
    e.preventDefault();
    const touch = e.touches[0];
    const { x, y } = canvasCoords(touch);
    updateDrag(x, y);
}

function onTouchEnd() {
    if (!dragging) return;
    releaseDrag();
}

function tryGrabString(x, y) {
    const { stringLen, stringY } = getStringGeometry();
    const xOnString = x >= MARGIN && x <= MARGIN + stringLen;
    const yNearString = Math.abs(y - stringY) < GRAB_RADIUS;

    if (xOnString && yNearString) {
        dragging = true;
        velHistory = [];
        updateDrag(x, y);
        getCanvas().style.cursor = 'grabbing';
    }
}

function updateDrag(x, y) {
    const { stringLen, stringY } = getStringGeometry();
    dragX = Math.max(MARGIN, Math.min(MARGIN + stringLen, x));
    dragY = y;
    dragPosNorm = (dragX - MARGIN) / stringLen;
    dragDisplacement = Math.max(-MAX_DISPLACEMENT, Math.min(MAX_DISPLACEMENT, y - stringY));
    velHistory.push({ x, y, t: performance.now() });
    if (velHistory.length > VEL_SAMPLES) velHistory.shift();
}

function releaseDrag() {
    dragging = false;
    getCanvas().style.cursor = '';

    let velocity = 0;
    if (velHistory.length >= 2) {
        const newest = velHistory[velHistory.length - 1];
        const oldest = velHistory[0];
        const dt = (newest.t - oldest.t) / 1000;
        if (dt > 0) velocity = (newest.y - oldest.y) / dt;
    }

    const disp = Math.abs(dragDisplacement);
    if (disp < 3) { velHistory = []; return; }

    const dispFactor = disp / MAX_DISPLACEMENT;
    const velBoost = 1.0 + Math.min(Math.abs(velocity) / 800, 1);
    pluckAt(dragPosNorm, dispFactor * velBoost * MAX_DISPLACEMENT);
    velHistory = [];
}

// ─── Pluck Engine ────────────────────────────────────────
function pluckAt(posNorm, amplitude) {
    stopSoloHarmonic(); // stop any solo when plucking
    ensureAudio();
    plucked = true;
    pluckTime = performance.now();

    const ampScale = Math.min(amplitude / MAX_DISPLACEMENT, 1.5);
    for (let n = 0; n < NUM_HARMONICS; n++) {
        const h = n + 1;
        amplitudes[n] = Math.sin(h * Math.PI * posNorm) / h * ampScale;
        phases[n] = 0;
        decay[n] = 0.3 + n * 0.15;
    }

    const gain = 0.04 + 0.08 * Math.min(ampScale, 1);
    const oscs = playRichTone(BASE_FREQ, gain);
    const actx = getAudioCtx();
    oscs.forEach(o => {
        const fadeStart = actx.currentTime + 2;
        o.gain.gain.setTargetAtTime(0, fadeStart, 0.5);
        o.osc.stop(fadeStart + 2);
    });
}

// ─── Draw ────────────────────────────────────────────────
export function draw(ts, ctx, W, H) {
    const t = ts / 1000;
    const stringLen = W - 2 * MARGIN;
    const stringY = H * STRING_Y_FRAC;

    // Fixed endpoints
    ctx.fillStyle = '#f1f5f9';
    ctx.beginPath(); ctx.arc(MARGIN, stringY, 6, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(MARGIN + stringLen, stringY, 6, 0, Math.PI * 2); ctx.fill();

    // ─── Upper section: string ───────────────────────
    if (dragging) {
        drawDragging(ctx, W, stringY, stringLen);
    } else if (plucked) {
        drawPluckedString(ts, ctx, W, H, stringLen, stringY, t);
    } else {
        // Resting string
        ctx.strokeStyle = 'rgba(255,255,255,0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(MARGIN, stringY); ctx.lineTo(MARGIN + stringLen, stringY);
        ctx.stroke();

        ctx.fillStyle = '#64748b';
        ctx.font = '400 16px "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Drag the string to pluck it', W / 2, stringY + 50);
    }

    // ─── Lower section: harmonic rows (always visible) ──
    drawHarmonicRows(ts, ctx, W, H, stringLen, t);
}

function drawDragging(ctx, W, stringY, stringLen) {
    ctx.strokeStyle = '#60a5fa';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(MARGIN, stringY);
    ctx.lineTo(dragX, stringY + dragDisplacement);
    ctx.lineTo(MARGIN + stringLen, stringY);
    ctx.stroke();

    ctx.beginPath();
    ctx.arc(dragX, stringY + dragDisplacement, 8, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(96, 165, 250, 0.3)'; ctx.fill();
    ctx.strokeStyle = '#60a5fa'; ctx.lineWidth = 2; ctx.stroke();

    ctx.fillStyle = '#94a3b8';
    ctx.font = '400 13px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(
        `pos: ${(dragPosNorm * 100).toFixed(0)}%  ·  pull: ${Math.abs(dragDisplacement).toFixed(0)}px`,
        W / 2, stringY - 80
    );
    ctx.fillStyle = '#64748b';
    ctx.font = '400 13px "Inter", sans-serif';
    ctx.fillText('Release to pluck!', W / 2, stringY - 55);
}

function drawPluckedString(ts, ctx, W, H, stringLen, stringY, t) {
    const elapsed = (ts - pluckTime) / 1000;

    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 3;
    ctx.beginPath();
    for (let x = 0; x <= stringLen; x += 2) {
        const xNorm = x / stringLen;
        let y = 0;
        for (let n = 0; n < NUM_HARMONICS; n++) {
            const h = n + 1;
            const d = Math.exp(-elapsed * decay[n]);
            const a = amplitudes[n] * d * 60;
            y += a * Math.sin(h * Math.PI * xNorm) *
                Math.cos(2 * Math.PI * h * VIS_BASE_FREQ * t);
        }
        if (x === 0) ctx.moveTo(MARGIN + x, stringY + y);
        else ctx.lineTo(MARGIN + x, stringY + y);
    }
    ctx.stroke();

    ctx.fillStyle = '#f1f5f9';
    ctx.font = '500 14px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.fillText('Combined vibration', W / 2, stringY - 80);
}

function drawHarmonicRows(ts, ctx, W, H, stringLen, t) {
    const elapsed = plucked ? (ts - pluckTime) / 1000 : 0;

    for (let n = 0; n < SHOW_HARMONICS; n++) {
        const h = n + 1;
        const yCenter = getHarmonicYCenter(n, H);
        const isSoloed = soloHarmonic === n;
        const isHovered = hoverHarmonic === n;

        // ─── Baseline ────────────────────────────────
        ctx.strokeStyle = isSoloed
            ? harmonicColors[n] + '30'
            : 'rgba(255,255,255,0.05)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(MARGIN, yCenter);
        ctx.lineTo(MARGIN + stringLen, yCenter);
        ctx.stroke();

        // ─── Harmonic wave (from pluck or solo) ──────
        if (plucked && !dragging) {
            const d = Math.exp(-elapsed * decay[n]);
            const a = amplitudes[n] * d * 30;

            ctx.strokeStyle = harmonicColors[n];
            ctx.lineWidth = 2;
            ctx.globalAlpha = 0.4 + d * 0.6;
            ctx.beginPath();
            for (let x = 0; x <= stringLen; x += 2) {
                const xNorm = x / stringLen;
                const y = yCenter + a * Math.sin(h * Math.PI * xNorm) *
                    Math.cos(2 * Math.PI * h * VIS_BASE_FREQ * t);
                if (x === 0) ctx.moveTo(MARGIN + x, y);
                else ctx.lineTo(MARGIN + x, y);
            }
            ctx.stroke();
            ctx.globalAlpha = 1;
        }

        // ─── Solo wave (pure sine) ───────────────────
        if (isSoloed) {
            const soloElapsed = (ts - soloStartTime) / 1000;
            const soloDecay = Math.exp(-soloElapsed * 0.15); // gentle fade
            const a = 25 * soloDecay;

            ctx.strokeStyle = harmonicColors[n];
            ctx.lineWidth = 2.5;
            ctx.globalAlpha = 0.9;
            ctx.beginPath();
            for (let x = 0; x <= stringLen; x += 2) {
                const xNorm = x / stringLen;
                const y = yCenter + a * Math.sin(h * Math.PI * xNorm) *
                    Math.cos(2 * Math.PI * h * VIS_BASE_FREQ * t);
                if (x === 0) ctx.moveTo(MARGIN + x, y);
                else ctx.lineTo(MARGIN + x, y);
            }
            ctx.stroke();
            ctx.globalAlpha = 1;
        }

        // ─── Label (clickable) ───────────────────────
        const labelX = MARGIN - 8;
        const labelY = yCenter;

        // Hit area background on hover or solo
        if (isSoloed || isHovered) {
            ctx.fillStyle = harmonicColors[n] + (isSoloed ? '25' : '12');
            ctx.beginPath();
            ctx.roundRect(2, labelY - 14, MARGIN - 6, 28, 6);
            ctx.fill();
        }

        // Glow ring when soloed
        if (isSoloed) {
            const pulse = 1 + 0.1 * Math.sin(t * 6);
            ctx.strokeStyle = harmonicColors[n] + '60';
            ctx.lineWidth = 2 * pulse;
            ctx.beginPath();
            ctx.roundRect(2, labelY - 14, MARGIN - 6, 28, 6);
            ctx.stroke();
        }

        // Label text
        ctx.fillStyle = (isSoloed || isHovered) ? '#f1f5f9' : harmonicColors[n];
        ctx.font = (isSoloed || isHovered)
            ? '600 12px "JetBrains Mono", monospace'
            : '500 11px "JetBrains Mono", monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText(`${h}f₀`, labelX, labelY);

        // Frequency value when soloed
        if (isSoloed) {
            ctx.fillStyle = '#94a3b8';
            ctx.font = '400 10px "JetBrains Mono", monospace';
            ctx.textAlign = 'left';
            ctx.fillText(`${Math.round(BASE_FREQ * h)} Hz`, MARGIN + stringLen + 10, labelY);
        }
    }
}
