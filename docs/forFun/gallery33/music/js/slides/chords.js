/* ============================================================
   Slide 4 — Chord Progressions
   Audio: plays triads built from rich tones
   Canvas: individual + combined waveforms, or a chromatic circle
   ============================================================ */

import { playRichTone, stopTone } from '../audio.js';
import { harmonicColors } from '../canvas.js';

// ─── Data ────────────────────────────────────────────────
export const CHORD_FREQS = {
    'I': [261.63, 329.63, 392.00],   // C E G
    'IV': [349.23, 440.00, 523.25],    // F A C
    'V': [392.00, 493.88, 587.33],    // G B D
    'vi': [440.00, 523.25, 659.25],    // A C E
    'ii': [293.66, 349.23, 440.00],    // D F A
    'iii': [329.63, 392.00, 493.88]     // E G B
};

const CHORD_NOTES = {
    'I': ['C', 'E', 'G'],
    'IV': ['F', 'A', 'C'],
    'V': ['G', 'B', 'D'],
    'vi': ['A', 'C', 'E'],
    'ii': ['D', 'F', 'A'],
    'iii': ['E', 'G', 'B']
};

// ─── State ───────────────────────────────────────────────
let activeChord = null;
let oscs = [];
let playing = false;

// ─── DOM ─────────────────────────────────────────────────
const chordCards = document.querySelectorAll('.chord-card');

// ─── Init ────────────────────────────────────────────────
export function init() {
    chordCards.forEach(card => {
        card.addEventListener('click', () => {
            const chord = card.dataset.chord;
            if (activeChord === chord && playing) {
                stop();
                card.classList.remove('active');
                activeChord = null;
                return;
            }
            chordCards.forEach(c => c.classList.remove('active'));
            card.classList.add('active');
            activeChord = chord;
            playChord(chord);
        });
    });
}

export function playChord(chordName) {
    stop();
    const freqs = CHORD_FREQS[chordName];
    if (!freqs) return;

    freqs.forEach(f => {
        const tones = playRichTone(f, 0.04);
        oscs.push(...tones);
    });
    playing = true;

    setTimeout(() => {
        if (playing) stop();
    }, 3000);
}

export function stop() {
    oscs.forEach(o => stopTone(o));
    oscs = [];
    playing = false;
}

export function getActiveChord() {
    return activeChord;
}

export function highlightCard(chordName) {
    chordCards.forEach(c => c.classList.remove('active'));
    const card = document.querySelector(`.chord-card[data-chord="${chordName}"]`);
    if (card) card.classList.add('active');
}

// ─── Draw ────────────────────────────────────────────────
export function draw(ts, ctx, W, H) {
    const t = ts / 1000;
    const margin = 60;
    const waveW = W - 2 * margin;

    if (!activeChord) {
        drawScaleCircle(t, ctx, W, H);
        return;
    }

    const freqs = CHORD_FREQS[activeChord];
    if (!freqs) return;
    const names = CHORD_NOTES[activeChord] || [];

    const numWaves = freqs.length;
    const sectionH = H / (numWaves + 1);

    // Individual waveforms
    for (let i = 0; i < numWaves; i++) {
        const yCenter = (i + 0.5) * sectionH;
        const visFreq = freqs[i] / 80;
        const amp = 30;

        ctx.strokeStyle = harmonicColors[i];
        ctx.lineWidth = 2;
        ctx.beginPath();
        for (let x = 0; x <= waveW; x += 2) {
            const xNorm = x / waveW;
            let val = 0;
            for (let h = 1; h <= 4; h++) {
                val += (amp / h) * Math.sin(2 * Math.PI * h * visFreq * xNorm * 4 - t * h * 1.5);
            }
            if (x === 0) ctx.moveTo(margin + x, yCenter + val);
            else ctx.lineTo(margin + x, yCenter + val);
        }
        ctx.stroke();

        ctx.fillStyle = harmonicColors[i];
        ctx.font = '600 14px "Inter", sans-serif';
        ctx.textAlign = 'left';
        ctx.fillText(`${names[i]} · ${Math.round(freqs[i])} Hz`, margin, yCenter - 50);
    }

    // Combined wave
    const combY = (numWaves + 0.5) * sectionH;
    ctx.strokeStyle = '#f1f5f9';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    for (let x = 0; x <= waveW; x += 2) {
        const xNorm = x / waveW;
        let val = 0;
        for (let i = 0; i < numWaves; i++) {
            const visFreq = freqs[i] / 80;
            for (let h = 1; h <= 4; h++) {
                val += (20 / h) * Math.sin(2 * Math.PI * h * visFreq * xNorm * 4 - t * h * 1.5);
            }
        }
        if (x === 0) ctx.moveTo(margin + x, combY + val);
        else ctx.lineTo(margin + x, combY + val);
    }
    ctx.stroke();

    ctx.fillStyle = '#f1f5f9';
    ctx.font = '600 14px "Inter", sans-serif';
    ctx.fillText(`${activeChord} chord — Combined`, margin, combY - 60);
}

function drawScaleCircle(t, ctx, W, H) {
    const cx = W / 2;
    const cy = H / 2;
    const radius = Math.min(W, H) * 0.3;

    const noteNames = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'];
    const majorScale = [0, 2, 4, 5, 7, 9, 11];

    for (let i = 0; i < 12; i++) {
        const angle = (i / 12) * Math.PI * 2 - Math.PI / 2;
        const x = cx + radius * Math.cos(angle);
        const y = cy + radius * Math.sin(angle);
        const inScale = majorScale.includes(i);

        ctx.beginPath();
        ctx.arc(x, y, inScale ? 22 : 14, 0, Math.PI * 2);
        if (inScale) {
            ctx.fillStyle = 'rgba(96, 165, 250, 0.15)';
            ctx.fill();
            ctx.strokeStyle = '#60a5fa';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(x, y, 22 + 4 * Math.sin(t * 2 + i), 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(96, 165, 250, 0.1)';
            ctx.lineWidth = 1;
            ctx.stroke();
        } else {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.04)';
            ctx.fill();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
            ctx.lineWidth = 1;
            ctx.stroke();
        }

        ctx.fillStyle = inScale ? '#f1f5f9' : '#64748b';
        ctx.font = inScale ? '600 13px "Inter"' : '400 11px "Inter"';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(noteNames[i], x, y);
    }

    // Chord triangles
    const chordGroups = [
        { notes: [0, 4, 7], color: '#60a5fa' },
        { notes: [5, 9, 0], color: '#a78bfa' },
        { notes: [7, 11, 2], color: '#f472b6' }
    ];

    chordGroups.forEach(group => {
        ctx.strokeStyle = group.color;
        ctx.lineWidth = 1.5;
        ctx.globalAlpha = 0.3;
        ctx.beginPath();
        group.notes.forEach((note, ni) => {
            const angle = (note / 12) * Math.PI * 2 - Math.PI / 2;
            const x = cx + radius * Math.cos(angle);
            const y = cy + radius * Math.sin(angle);
            if (ni === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        });
        ctx.closePath();
        ctx.stroke();
        ctx.fillStyle = group.color;
        ctx.globalAlpha = 0.06;
        ctx.fill();
        ctx.globalAlpha = 1;
    });

    ctx.fillStyle = '#94a3b8';
    ctx.font = '400 14px "Inter", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('Click a chord card', cx, cy - 10);
    ctx.fillText('to hear it', cx, cy + 10);
}
