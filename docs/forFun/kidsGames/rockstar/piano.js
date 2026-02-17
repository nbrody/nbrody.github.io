/**
 * 🎹 Rockstar — Piano module
 * 25-note piano (C4–C6) with Web Audio synthesis.
 * Depends on shared.js (window.Rockstar).
 */

(function () {
    'use strict';

    const R = window.Rockstar;

    // ══════════════════════════════════════════════════════════════════
    //  PIANO — 25 notes: C4 through C6
    // ══════════════════════════════════════════════════════════════════

    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const pianoNotes = [];

    // Two full octaves + one extra C
    for (let octave = 4; octave <= 5; octave++) {
        noteNames.forEach((name, semitone) => {
            const midi = 60 + (octave - 4) * 12 + semitone;
            pianoNotes.push({
                name: name + octave,
                midi,
                freq: 440 * Math.pow(2, (midi - 69) / 12),
                isBlack: name.includes('#'),
            });
        });
    }
    // 25th note: C6
    pianoNotes.push({
        name: 'C6',
        midi: 84,
        freq: 440 * Math.pow(2, (84 - 69) / 12),
        isBlack: false,
    });

    // Rainbow colours for white keys
    const whiteKeyColors = [
        '#e84393', '#ff7675', '#fdcb6e', '#55efc4',
        '#00cec9', '#74b9ff', '#a29bfe',
        '#e84393', '#ff7675', '#fdcb6e', '#55efc4',
        '#00cec9', '#74b9ff', '#a29bfe',
        '#e84393',  // C6
    ];

    const pianoContainer = document.getElementById('piano-container');
    const activeOscillators = {};

    // Build piano keys
    const whiteKeys = pianoNotes.filter(n => !n.isBlack);
    const whiteKeyWidth = 100 / whiteKeys.length;

    // First pass: white keys
    let wIdx = 0;
    pianoNotes.forEach(note => {
        if (note.isBlack) return;
        const key = document.createElement('div');
        key.className = 'piano-key white';
        key.dataset.note = note.name;
        key.dataset.freq = note.freq;
        key.style.setProperty('--key-color', whiteKeyColors[wIdx % whiteKeyColors.length]);
        key.textContent = note.name.replace(/\d/, '');
        pianoContainer.appendChild(key);
        wIdx++;
    });

    // Second pass: black keys
    let blackPositionIdx = 0;
    pianoNotes.forEach((note) => {
        if (!note.isBlack) { blackPositionIdx++; return; }
        const key = document.createElement('div');
        key.className = 'piano-key black';
        key.dataset.note = note.name;
        key.dataset.freq = note.freq;
        const leftPercent = (blackPositionIdx * whiteKeyWidth) - (whiteKeyWidth * 0.3);
        key.style.left = leftPercent + '%';
        key.style.width = (whiteKeyWidth * 0.6) + '%';
        pianoContainer.appendChild(key);
    });

    // Piano synth — warm tone with envelope
    function noteOn(noteId, freq) {
        if (activeOscillators[noteId]) return;
        R.ensureAudio();
        const c = R.getCtx();
        if (!c) return;
        const now = c.currentTime;

        const osc1 = c.createOscillator();
        const osc2 = c.createOscillator();
        osc1.type = 'triangle';
        osc2.type = 'sine';
        osc1.frequency.value = freq;
        osc2.frequency.value = freq * 2.001;

        const gain = c.createGain();
        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.35, now + 0.02);

        const masterGain = c.createGain();
        masterGain.gain.value = 0.5;

        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(masterGain).connect(c.destination);

        osc1.start(now);
        osc2.start(now);

        activeOscillators[noteId] = { osc1, osc2, gain, masterGain };
    }

    function noteOff(noteId) {
        const entry = activeOscillators[noteId];
        if (!entry) return;
        const c = R.getCtx();
        if (!c) return;
        const now = c.currentTime;
        entry.gain.gain.cancelScheduledValues(now);
        entry.gain.gain.setValueAtTime(entry.gain.gain.value, now);
        entry.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        entry.osc1.stop(now + 0.35);
        entry.osc2.stop(now + 0.35);
        delete activeOscillators[noteId];
    }

    // Touch handling — full multitouch with slide
    const activePianoTouches = new Map();

    function getPianoKey(clientX, clientY) {
        const el = document.elementFromPoint(clientX, clientY);
        if (!el) return null;
        if (el.classList.contains('piano-key')) return el;
        return el.closest('.piano-key');
    }

    pianoContainer.addEventListener('touchstart', e => {
        e.preventDefault();
        for (const touch of e.changedTouches) {
            const key = getPianoKey(touch.clientX, touch.clientY);
            if (key) {
                const noteId = key.dataset.note;
                activePianoTouches.set(touch.identifier, noteId);
                key.classList.add('active');
                noteOn(noteId, parseFloat(key.dataset.freq));
                const color = key.classList.contains('black') ? '#a29bfe' :
                    getComputedStyle(key).getPropertyValue('--key-color').trim();
                R.spawnParticles(touch.clientX, touch.clientY, color || '#00cec9');
            }
        }
    }, { passive: false });

    pianoContainer.addEventListener('touchmove', e => {
        e.preventDefault();
        for (const touch of e.changedTouches) {
            const key = getPianoKey(touch.clientX, touch.clientY);
            const prevNote = activePianoTouches.get(touch.identifier);
            const newNote = key ? key.dataset.note : null;
            if (newNote !== prevNote) {
                if (prevNote) {
                    noteOff(prevNote);
                    const oldKey = pianoContainer.querySelector(`[data-note="${prevNote}"]`);
                    if (oldKey) oldKey.classList.remove('active');
                }
                if (newNote && key) {
                    activePianoTouches.set(touch.identifier, newNote);
                    key.classList.add('active');
                    noteOn(newNote, parseFloat(key.dataset.freq));
                    const color = key.classList.contains('black') ? '#a29bfe' :
                        getComputedStyle(key).getPropertyValue('--key-color').trim();
                    R.spawnParticles(touch.clientX, touch.clientY, color || '#00cec9');
                } else {
                    activePianoTouches.delete(touch.identifier);
                }
            }
        }
    }, { passive: false });

    pianoContainer.addEventListener('touchend', e => {
        e.preventDefault();
        for (const touch of e.changedTouches) {
            const noteId = activePianoTouches.get(touch.identifier);
            if (noteId) {
                noteOff(noteId);
                const key = pianoContainer.querySelector(`[data-note="${noteId}"]`);
                if (key) key.classList.remove('active');
                activePianoTouches.delete(touch.identifier);
            }
        }
    }, { passive: false });

    pianoContainer.addEventListener('touchcancel', e => {
        for (const touch of e.changedTouches) {
            const noteId = activePianoTouches.get(touch.identifier);
            if (noteId) {
                noteOff(noteId);
                const key = pianoContainer.querySelector(`[data-note="${noteId}"]`);
                if (key) key.classList.remove('active');
                activePianoTouches.delete(touch.identifier);
            }
        }
    });

    // Mouse/pointer fallback
    let mouseDownPianoNote = null;
    pianoContainer.addEventListener('pointerdown', e => {
        if (e.pointerType === 'touch') return;
        const key = getPianoKey(e.clientX, e.clientY);
        if (key) {
            mouseDownPianoNote = key.dataset.note;
            key.classList.add('active');
            noteOn(key.dataset.note, parseFloat(key.dataset.freq));
            R.spawnParticles(e.clientX, e.clientY, '#00cec9');
        }
    });

    window.addEventListener('pointerup', e => {
        if (e.pointerType === 'touch') return;
        if (mouseDownPianoNote) {
            noteOff(mouseDownPianoNote);
            const key = pianoContainer.querySelector(`[data-note="${mouseDownPianoNote}"]`);
            if (key) key.classList.remove('active');
            mouseDownPianoNote = null;
        }
    });

    // Keyboard support: z-m = lower octave, q-u = upper octave, i = C6
    const keyMap = {
        'z': 'C4', 's': 'C#4', 'x': 'D4', 'd': 'D#4', 'c': 'E4',
        'v': 'F4', 'g': 'F#4', 'b': 'G4', 'h': 'G#4', 'n': 'A4', 'j': 'A#4', 'm': 'B4',
        'q': 'C5', '2': 'C#5', 'w': 'D5', '3': 'D#5', 'e': 'E5',
        'r': 'F5', '5': 'F#5', 't': 'G5', '6': 'G#5', 'y': 'A5', '7': 'A#5', 'u': 'B5',
        'i': 'C6',
    };

    const pressedKeys = new Set();

    window.addEventListener('keydown', e => {
        if (e.repeat) return;
        const noteName = keyMap[e.key.toLowerCase()];
        if (!noteName || pressedKeys.has(e.key.toLowerCase())) return;
        pressedKeys.add(e.key.toLowerCase());
        const note = pianoNotes.find(n => n.name === noteName);
        if (!note) return;
        R.ensureAudio();
        const keyEl = pianoContainer.querySelector(`[data-note="${noteName}"]`);
        if (keyEl) keyEl.classList.add('active');
        noteOn(noteName, note.freq);
    });

    window.addEventListener('keyup', e => {
        const noteName = keyMap[e.key.toLowerCase()];
        if (!noteName) return;
        pressedKeys.delete(e.key.toLowerCase());
        noteOff(noteName);
        const keyEl = pianoContainer.querySelector(`[data-note="${noteName}"]`);
        if (keyEl) keyEl.classList.remove('active');
    });

})();
