/**
 * 🎵 Rockstar — Xylophone module
 * Rainbow-coloured bars with metallic bell-like tones.
 * Depends on shared.js (window.Rockstar).
 */

(function () {
    'use strict';

    const R = window.Rockstar;

    // ══════════════════════════════════════════════════════════════════
    //  XYLOPHONE CONFIG — two octaves C4–C6 (15 bars, diatonic)
    // ══════════════════════════════════════════════════════════════════

    const SCALE_NOTES = [
        { name: 'C4', midi: 60 },
        { name: 'D4', midi: 62 },
        { name: 'E4', midi: 64 },
        { name: 'F4', midi: 65 },
        { name: 'G4', midi: 67 },
        { name: 'A4', midi: 69 },
        { name: 'B4', midi: 71 },
        { name: 'C5', midi: 72 },
        { name: 'D5', midi: 74 },
        { name: 'E5', midi: 76 },
        { name: 'F5', midi: 77 },
        { name: 'G5', midi: 79 },
        { name: 'A5', midi: 81 },
        { name: 'B5', midi: 83 },
        { name: 'C6', midi: 84 },
    ];

    // Rainbow gradient colours for bars (low→high)
    const BAR_COLORS = [
        '#e84393', '#ff6b6b', '#ff9f43', '#fdcb6e', '#ffeaa7',
        '#55efc4', '#00cec9', '#74b9ff', '#a29bfe', '#6c5ce7',
        '#fd79a8', '#e17055', '#fab1a0', '#81ecec', '#dfe6e9',
    ];

    // Slight warm hue for the hit glow
    const BAR_GLOW_COLORS = [
        '#ff69b4', '#ff4757', '#ffa502', '#ffdd59', '#fff68f',
        '#7bed9f', '#18dcff', '#7efff5', '#c8a8ff', '#a55eea',
        '#ff6b9d', '#ff6348', '#ffbe76', '#7efff5', '#f5f6fa',
    ];

    function midiToFreq(midi) {
        return 440 * Math.pow(2, (midi - 69) / 12);
    }

    // ══════════════════════════════════════════════════════════════════
    //  BUILD XYLOPHONE
    // ══════════════════════════════════════════════════════════════════

    const xyloContainer = document.getElementById('xylo-container');

    SCALE_NOTES.forEach((note, i) => {
        const bar = document.createElement('button');
        bar.className = 'xylo-bar';
        bar.dataset.midi = note.midi;
        bar.dataset.note = note.name;
        bar.dataset.index = i;

        // Bars get narrower as pitch increases (like a real xylophone)
        const widthPercent = 100 - (i * 3);
        bar.style.setProperty('--bar-color', BAR_COLORS[i]);
        bar.style.setProperty('--bar-glow', BAR_GLOW_COLORS[i]);
        bar.style.setProperty('--bar-width', widthPercent + '%');

        // Note label
        const label = document.createElement('span');
        label.className = 'xylo-label';
        label.textContent = note.name.replace(/\d/, '');
        bar.appendChild(label);

        // Octave indicator on first note of each octave
        const octave = document.createElement('span');
        octave.className = 'xylo-octave';
        octave.textContent = note.name.slice(-1);
        bar.appendChild(octave);

        xyloContainer.appendChild(bar);
    });

    // ══════════════════════════════════════════════════════════════════
    //  XYLOPHONE SYNTH — metallic bell tone
    // ══════════════════════════════════════════════════════════════════

    function playXyloNote(midi, barIdx) {
        R.ensureAudio();
        const c = R.getCtx();
        if (!c) return;
        const now = c.currentTime;
        const freq = midiToFreq(midi);

        // Fundamental — sine for clear pitch
        const osc1 = c.createOscillator();
        osc1.type = 'sine';
        osc1.frequency.value = freq;

        // 3rd harmonic — gives metallic brightness
        const osc2 = c.createOscillator();
        osc2.type = 'sine';
        osc2.frequency.value = freq * 3.0;

        // 5.5th partial — inharmonic, gives the "wooden bar" character
        const osc3 = c.createOscillator();
        osc3.type = 'sine';
        osc3.frequency.value = freq * 5.5;

        // Mix gains — fundamental loudest, partials softer
        const g1 = c.createGain();
        g1.gain.setValueAtTime(0.45, now);
        g1.gain.exponentialRampToValueAtTime(0.001, now + 1.5);

        const g2 = c.createGain();
        g2.gain.setValueAtTime(0.15, now);
        g2.gain.exponentialRampToValueAtTime(0.001, now + 0.6);

        const g3 = c.createGain();
        g3.gain.setValueAtTime(0.06, now);
        g3.gain.exponentialRampToValueAtTime(0.001, now + 0.25);

        // Master envelope
        const master = c.createGain();
        master.gain.value = 0.55;

        osc1.connect(g1).connect(master);
        osc2.connect(g2).connect(master);
        osc3.connect(g3).connect(master);
        master.connect(c.destination);

        osc1.start(now);
        osc2.start(now);
        osc3.start(now);
        osc1.stop(now + 1.6);
        osc2.stop(now + 0.7);
        osc3.stop(now + 0.3);
    }

    // ══════════════════════════════════════════════════════════════════
    //  INPUT HANDLING
    // ══════════════════════════════════════════════════════════════════

    function handleBarHit(bar, clientX, clientY) {
        const midi = parseInt(bar.dataset.midi);
        const idx = parseInt(bar.dataset.index);
        playXyloNote(midi, idx);
        bar.classList.add('hit');
        setTimeout(() => bar.classList.remove('hit'), 300);
        R.spawnParticles(clientX, clientY, BAR_COLORS[idx]);
    }

    function getBar(clientX, clientY) {
        const el = document.elementFromPoint(clientX, clientY);
        if (!el) return null;
        if (el.classList.contains('xylo-bar')) return el;
        return el.closest('.xylo-bar');
    }

    // Touch — multitouch with slide
    const activeXyloTouches = new Map();

    xyloContainer.addEventListener('touchstart', e => {
        e.preventDefault();
        for (const touch of e.changedTouches) {
            const bar = getBar(touch.clientX, touch.clientY);
            if (bar) {
                activeXyloTouches.set(touch.identifier, bar.dataset.midi);
                handleBarHit(bar, touch.clientX, touch.clientY);
            }
        }
    }, { passive: false });

    xyloContainer.addEventListener('touchmove', e => {
        e.preventDefault();
        for (const touch of e.changedTouches) {
            const bar = getBar(touch.clientX, touch.clientY);
            if (!bar) continue;
            const prev = activeXyloTouches.get(touch.identifier);
            if (bar.dataset.midi !== prev) {
                activeXyloTouches.set(touch.identifier, bar.dataset.midi);
                handleBarHit(bar, touch.clientX, touch.clientY);
            }
        }
    }, { passive: false });

    xyloContainer.addEventListener('touchend', e => {
        for (const touch of e.changedTouches) {
            activeXyloTouches.delete(touch.identifier);
        }
    });

    xyloContainer.addEventListener('touchcancel', e => {
        for (const touch of e.changedTouches) {
            activeXyloTouches.delete(touch.identifier);
        }
    });

    // Mouse/pointer fallback
    xyloContainer.addEventListener('pointerdown', e => {
        if (e.pointerType === 'touch') return;
        const bar = getBar(e.clientX, e.clientY);
        if (bar) handleBarHit(bar, e.clientX, e.clientY);
    });

    // Keyboard: 1-9, 0, q, w, e, r, t for the 15 bars
    const xyloKeyMap = {
        '1': 0, '2': 1, '3': 2, '4': 3, '5': 4,
        '6': 5, '7': 6, '8': 7, '9': 8, '0': 9,
        'q': 10, 'w': 11, 'e': 12, 'r': 13, 't': 14,
    };

    const pressedXyloKeys = new Set();

    window.addEventListener('keydown', e => {
        if (e.repeat) return;
        const idx = xyloKeyMap[e.key.toLowerCase()];
        if (idx === undefined || pressedXyloKeys.has(e.key.toLowerCase())) return;

        // Only respond when xylophone screen is visible
        const xyloScreen = document.getElementById('xylo-screen');
        if (!xyloScreen || !xyloScreen.classList.contains('active')) return;

        pressedXyloKeys.add(e.key.toLowerCase());
        R.ensureAudio();
        const bar = xyloContainer.children[idx];
        if (bar) {
            const rect = bar.getBoundingClientRect();
            handleBarHit(bar, rect.left + rect.width / 2, rect.top + rect.height / 2);
        }
    });

    window.addEventListener('keyup', e => {
        pressedXyloKeys.delete(e.key.toLowerCase());
    });

})();
