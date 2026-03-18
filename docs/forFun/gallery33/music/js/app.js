/* ============================================================
   THEORY OF HARMONY — Application Entry Point
   Wires together: navigation, canvas, audio, and all slides
   ============================================================ */

import { startLoop, setDrawCallbacks } from './canvas.js';
import { init as initNav, onSlideChange, getCurrentSlide } from './navigation.js';

// Slide modules
import * as intro from './slides/intro.js';
import * as beating from './slides/beating.js';
import * as string from './slides/string.js';
import * as intervals from './slides/intervals.js';
import * as chords from './slides/chords.js';
import * as conclusion from './slides/conclusion.js';

// ─── Slide labels for the canvas info badge ──────────────
const SLIDE_LABELS = [
    'Theory of Harmony',
    'Beating · Dissonance',
    'Vibrating String',
    'Consonant Intervals',
    'Chord Progressions',
    'The Major Scale'
];

// ─── Slide-specific draw function router ─────────────────
const drawFns = [
    intro.draw,
    beating.draw,
    string.draw,
    intervals.draw,
    chords.draw,
    conclusion.draw
];

// ─── Central draw callback (dispatches to active slide) ──
function onDraw(ts, ctx, W, H) {
    const i = getCurrentSlide();
    if (drawFns[i]) drawFns[i](ts, ctx, W, H);
}

// ─── Slide change handler ────────────────────────────────
function handleSlideChange(n) {
    // Stop all audio across all slides
    beating.stop();
    string.stop();
    intervals.stop();
    chords.stop();
    conclusion.stop();

    // Toggle slide-specific controls
    document.getElementById('string-controls').classList.toggle('visible', n === 2);

    // Update canvas info badge
    document.getElementById('canvas-label').textContent = SLIDE_LABELS[n] || '';

    // Reset string state when entering slide 2
    if (n === 2) string.reset();
}

// ─── Bootstrap ───────────────────────────────────────────
beating.init();
string.init();
intervals.init();
chords.init();
conclusion.init(getCurrentSlide);

initNav();
onSlideChange(handleSlideChange);

setDrawCallbacks([onDraw]);
startLoop();

// Trigger initial state
handleSlideChange(0);
