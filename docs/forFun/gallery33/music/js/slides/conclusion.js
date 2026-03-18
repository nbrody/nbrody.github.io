/* ============================================================
   Slide 5 — Conclusion: The Major Scale Emerges
   Audio: I → IV → V → I chord progression
   Canvas: heptagonal scale with connections + play button
   ============================================================ */

import { playRichTone } from '../audio.js';
import { harmonicColors, getCanvas } from '../canvas.js';
import { CHORD_FREQS, highlightCard, stop as stopChord, playChord } from './chords.js';

// ─── State ───────────────────────────────────────────────
let progressionPlaying = false;
let progressionTimeout = null;
let chordOscs = [];

// ─── Init ────────────────────────────────────────────────
export function init(getCurrentSlide) {
    const canvas = getCanvas();
    canvas.addEventListener('click', (e) => {
        if (getCurrentSlide() !== 5) return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const W = rect.width;
        const H = rect.height;

        const cx = W / 2;
        const radius = Math.min(W, H) * 0.32;
        const btnY = H / 2 + radius + 50;

        if (Math.abs(x - cx) < 100 && Math.abs(y - btnY) < 20) {
            toggleProgression();
        }
    });
}

function toggleProgression() {
    if (progressionPlaying) {
        stop();
    } else {
        startProgression();
    }
}

function startProgression() {
    progressionPlaying = true;
    const progression = ['I', 'IV', 'V', 'I'];
    let i = 0;

    function playNext() {
        if (i >= progression.length || !progressionPlaying) {
            progressionPlaying = false;
            return;
        }
        const chord = progression[i];
        highlightCard(chord);

        stopChord();
        const freqs = CHORD_FREQS[chord];
        if (freqs) {
            freqs.forEach(f => {
                const oscs = playRichTone(f, 0.04);
                chordOscs.push(...oscs);
            });
        }
        i++;
        progressionTimeout = setTimeout(() => {
            stopChord();
            playNext();
        }, 1500);
    }
    playNext();
}

export function stop() {
    progressionPlaying = false;
    if (progressionTimeout) clearTimeout(progressionTimeout);
    stopChord();
    chordOscs = [];
}

// ─── Draw ────────────────────────────────────────────────
export function draw(ts, ctx, W, H) {
    const t = ts / 1000;
    const cx = W / 2;
    const cy = H / 2;
    const radius = Math.min(W, H) * 0.32;
    const noteNames = ['C', 'D', 'E', 'F', 'G', 'A', 'B'];

    // Thirds connections
    for (let i = 0; i < 7; i++) {
        const a1 = (i / 7) * Math.PI * 2 - Math.PI / 2;
        const j = (i + 2) % 7;
        const a2 = (j / 7) * Math.PI * 2 - Math.PI / 2;

        ctx.strokeStyle = 'rgba(167, 139, 250, 0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(cx + radius * Math.cos(a1), cy + radius * Math.sin(a1));
        ctx.lineTo(cx + radius * Math.cos(a2), cy + radius * Math.sin(a2));
        ctx.stroke();
    }

    // Fifths connections
    for (let i = 0; i < 7; i++) {
        const a1 = (i / 7) * Math.PI * 2 - Math.PI / 2;
        const j = (i + 4) % 7;
        const a2 = (j / 7) * Math.PI * 2 - Math.PI / 2;

        ctx.strokeStyle = 'rgba(96, 165, 250, 0.2)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(cx + radius * Math.cos(a1), cy + radius * Math.sin(a1));
        ctx.lineTo(cx + radius * Math.cos(a2), cy + radius * Math.sin(a2));
        ctx.stroke();
    }

    // Nodes with pulsing glow
    for (let i = 0; i < 7; i++) {
        const angle = (i / 7) * Math.PI * 2 - Math.PI / 2;
        const x = cx + radius * Math.cos(angle);
        const y = cy + radius * Math.sin(angle);
        const pulse = 1 + 0.05 * Math.sin(t * 2 + i * 0.9);
        const nodeR = 26 * pulse;

        // Glow
        const gradient = ctx.createRadialGradient(x, y, 0, x, y, nodeR * 2);
        gradient.addColorStop(0, 'rgba(96, 165, 250, 0.2)');
        gradient.addColorStop(1, 'rgba(96, 165, 250, 0)');
        ctx.fillStyle = gradient;
        ctx.beginPath();
        ctx.arc(x, y, nodeR * 2, 0, Math.PI * 2);
        ctx.fill();

        // Node
        ctx.beginPath();
        ctx.arc(x, y, nodeR, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(96, 165, 250, 0.15)';
        ctx.fill();
        ctx.strokeStyle = harmonicColors[i % harmonicColors.length];
        ctx.lineWidth = 2;
        ctx.stroke();

        // Label
        ctx.fillStyle = '#f1f5f9';
        ctx.font = '600 16px "Inter", sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(noteNames[i], x, y);
    }

    // Center content
    ctx.fillStyle = '#f1f5f9';
    ctx.font = '600 22px "Playfair Display", serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('C Major', cx, cy - 12);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '400 13px "Inter", sans-serif';
    ctx.fillText('The most harmonious scale', cx, cy + 14);

    // Play button
    const btnY = cy + radius + 50;
    if (btnY < H - 40) {
        ctx.fillStyle = 'rgba(96, 165, 250, 0.1)';
        ctx.strokeStyle = 'rgba(96, 165, 250, 0.3)';
        ctx.lineWidth = 1;
        const btnW = 200, btnH = 40, btnR = 12;
        ctx.beginPath();
        ctx.roundRect(cx - btnW / 2, btnY - btnH / 2, btnW, btnH, btnR);
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = '#60a5fa';
        ctx.font = '600 14px "Inter", sans-serif';
        ctx.fillText('▶  I → IV → V → I', cx, btnY);
    }
}
