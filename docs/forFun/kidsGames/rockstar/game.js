/**
 * 🎸 Rockstar — Kids Musical Instrument Game
 * Drums & Piano via Web Audio API synthesis (no samples needed).
 * Fully touch-optimised for iPad / mobile.
 */

(function () {
    'use strict';

    // ── AudioContext Logic ──────────────────────
    let ctx = null;

    // Visual indicator update
    function updateAudioIndicator() {
        const icon = document.getElementById('sound-status-icon');
        const label = document.getElementById('sound-status-label');
        if (!ctx) return;

        if (ctx.state === 'running') {
            icon.textContent = '🔊';
            icon.classList.add('audio-active');
            if (label) label.textContent = 'Sound: Ready!';
        } else {
            icon.textContent = '🔇';
            icon.classList.remove('audio-active');
            if (label) label.textContent = 'Sound: Tap to start';
        }
        console.log("Audio State:", ctx.state);
    }

    async function ensureAudio() {
        if (!ctx) {
            ctx = new (window.AudioContext || window.webkitAudioContext)();
            // Listen for state changes
            ctx.onstatechange = () => updateAudioIndicator();
        }
        if (ctx.state === 'suspended') {
            await ctx.resume();
        }
        updateAudioIndicator();
        return ctx;
    }

    // Try to wake on any interaction
    ['click', 'touchstart', 'mousedown'].forEach(evt => {
        window.addEventListener(evt, () => {
            if (ctx && ctx.state === 'suspended') ensureAudio();
        }, { once: true });
    });

    // ── FX Canvas (particle bursts on hit) ──────────────────────────
    const fxCanvas = document.getElementById('fx-canvas');
    const fxCtx = fxCanvas.getContext('2d');
    const particles = [];

    function resizeFxCanvas() {
        fxCanvas.width = window.innerWidth * devicePixelRatio;
        fxCanvas.height = window.innerHeight * devicePixelRatio;
        fxCtx.scale(devicePixelRatio, devicePixelRatio);
    }
    window.addEventListener('resize', resizeFxCanvas);
    resizeFxCanvas();

    function spawnParticles(x, y, color) {
        const count = 18;
        for (let i = 0; i < count; i++) {
            const angle = (Math.PI * 2 * i) / count + (Math.random() - 0.5) * 0.4;
            const speed = 2 + Math.random() * 4;
            particles.push({
                x, y,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 1,
                color,
                size: 4 + Math.random() * 6,
            });
        }
    }

    function tickParticles() {
        fxCtx.clearRect(0, 0, fxCanvas.width / devicePixelRatio, fxCanvas.height / devicePixelRatio);
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.12;          // gravity
            p.life -= 0.025;
            if (p.life <= 0) { particles.splice(i, 1); continue; }
            fxCtx.globalAlpha = p.life;
            fxCtx.fillStyle = p.color;
            fxCtx.beginPath();
            fxCtx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
            fxCtx.fill();
        }
        fxCtx.globalAlpha = 1;
        requestAnimationFrame(tickParticles);
    }
    tickParticles();

    // ── Screen Navigation ───────────────────────────────────────────
    const screens = {
        picker: document.getElementById('picker-screen'),
        drums: document.getElementById('drums-screen'),
        piano: document.getElementById('piano-screen'),
    };

    function showScreen(name) {
        Object.values(screens).forEach(s => s.classList.remove('active'));
        screens[name].classList.add('active');
    }

    document.getElementById('pick-drums').addEventListener('click', () => { ensureAudio(); showScreen('drums'); });
    document.getElementById('pick-piano').addEventListener('click', () => { ensureAudio(); showScreen('piano'); });
    document.getElementById('drums-back').addEventListener('click', () => showScreen('picker'));
    document.getElementById('piano-back').addEventListener('click', () => showScreen('picker'));

    // Manual Sound initialization button
    const soundBtn = document.getElementById('sound-status-btn');
    if (soundBtn) {
        soundBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            ensureAudio().then(() => {
                // Play a tiny "blip" to confirm
                if (ctx.state === 'running') {
                    const osc = ctx.createOscillator();
                    const g = ctx.createGain();
                    osc.frequency.setTargetAtTime(440, ctx.currentTime, 0.01);
                    g.gain.setTargetAtTime(0.1, ctx.currentTime, 0.01);
                    g.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
                    osc.connect(g).connect(ctx.destination);
                    osc.start();
                    osc.stop(ctx.currentTime + 0.1);
                }
            });
        });
    }

    // ══════════════════════════════════════════════════════════════════
    //  DRUMS — Web Audio Synthesis
    // ══════════════════════════════════════════════════════════════════

    // Drum definitions with position (%), size (%), and type for realistic layout
    const drumDefs = [
        { id: 'kick', label: 'Kick', color: '#e84393', x: 50, y: 72, size: 30, type: 'drum' },
        { id: 'snare', label: 'Snare', color: '#fdcb6e', x: 34, y: 50, size: 18, type: 'drum' },
        { id: 'hihat', label: 'Hi-Hat', color: '#c8a83a', x: 13, y: 42, size: 16, type: 'cymbal' },
        { id: 'tom1', label: 'Tom 1', color: '#a29bfe', x: 38, y: 26, size: 16, type: 'drum' },
        { id: 'tom2', label: 'Tom 2', color: '#55efc4', x: 62, y: 26, size: 16, type: 'drum' },
        { id: 'crash', label: 'Crash', color: '#d4a843', x: 17, y: 12, size: 20, type: 'cymbal' },
        { id: 'ride', label: 'Ride', color: '#c8a83a', x: 85, y: 20, size: 22, type: 'cymbal' },
        { id: 'clap', label: 'F. Tom', color: '#ff9f43', x: 78, y: 55, size: 19, type: 'drum' },
        { id: 'cowbell', label: 'Cowbell', color: '#b0b0b0', x: 50, y: 40, size: 8, type: 'accessory' },
    ];

    // Build drum pads as positioned circular elements
    const padContainer = document.getElementById('drum-pad-container');
    drumDefs.forEach(def => {
        const btn = document.createElement('button');
        btn.className = `drum-pad drum-${def.type}`;
        btn.dataset.drum = def.id;
        // Position via CSS custom properties
        btn.style.setProperty('--dx', def.x + '%');
        btn.style.setProperty('--dy', def.y + '%');
        btn.style.setProperty('--dsize', def.size + '%');

        if (def.type === 'drum') {
            // Drum head with rim + lug details
            btn.innerHTML = `
                <span class="drum-rim"></span>
                <span class="drum-head"></span>
                <span class="drum-head-label">${def.label}</span>`;
        } else if (def.type === 'cymbal') {
            // Cymbal with grooves + bell
            btn.innerHTML = `
                <span class="cymbal-body"></span>
                <span class="cymbal-bell"></span>
                <span class="drum-head-label">${def.label}</span>`;
        } else {
            // Accessory (cowbell)
            btn.innerHTML = `<span class="drum-head-label">${def.label}</span>`;
        }
        padContainer.appendChild(btn);
    });

    // Synthesised drum sounds
    function playDrum(id) {
        const c = ensureAudio();
        const now = c.currentTime;
        switch (id) {
            case 'kick': {
                const osc = c.createOscillator();
                const gain = c.createGain();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(160, now);
                osc.frequency.exponentialRampToValueAtTime(30, now + 0.25);
                gain.gain.setValueAtTime(1, now);
                gain.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
                osc.connect(gain).connect(c.destination);
                osc.start(now);
                osc.stop(now + 0.35);
                break;
            }
            case 'snare': {
                // noise burst + tone body
                const bufLen = c.sampleRate * 0.15;
                const buf = c.createBuffer(1, bufLen, c.sampleRate);
                const data = buf.getChannelData(0);
                for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufLen);
                const noise = c.createBufferSource();
                noise.buffer = buf;
                const ng = c.createGain();
                ng.gain.setValueAtTime(0.8, now);
                ng.gain.exponentialRampToValueAtTime(0.001, now + 0.15);
                noise.connect(ng).connect(c.destination);
                noise.start(now);
                const osc = c.createOscillator();
                osc.type = 'triangle';
                osc.frequency.setValueAtTime(180, now);
                osc.frequency.exponentialRampToValueAtTime(80, now + 0.08);
                const og = c.createGain();
                og.gain.setValueAtTime(0.6, now);
                og.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
                osc.connect(og).connect(c.destination);
                osc.start(now);
                osc.stop(now + 0.1);
                break;
            }
            case 'hihat': {
                const bufLen = c.sampleRate * 0.06;
                const buf = c.createBuffer(1, bufLen, c.sampleRate);
                const data = buf.getChannelData(0);
                for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / bufLen);
                const src = c.createBufferSource();
                src.buffer = buf;
                const hp = c.createBiquadFilter();
                hp.type = 'highpass';
                hp.frequency.value = 7000;
                const g = c.createGain();
                g.gain.setValueAtTime(0.5, now);
                g.gain.exponentialRampToValueAtTime(0.001, now + 0.06);
                src.connect(hp).connect(g).connect(c.destination);
                src.start(now);
                break;
            }
            case 'tom1': {
                const osc = c.createOscillator();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(200, now);
                osc.frequency.exponentialRampToValueAtTime(80, now + 0.25);
                const g = c.createGain();
                g.gain.setValueAtTime(0.7, now);
                g.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
                osc.connect(g).connect(c.destination);
                osc.start(now);
                osc.stop(now + 0.3);
                break;
            }
            case 'tom2': {
                const osc = c.createOscillator();
                osc.type = 'sine';
                osc.frequency.setValueAtTime(140, now);
                osc.frequency.exponentialRampToValueAtTime(55, now + 0.3);
                const g = c.createGain();
                g.gain.setValueAtTime(0.7, now);
                g.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
                osc.connect(g).connect(c.destination);
                osc.start(now);
                osc.stop(now + 0.35);
                break;
            }
            case 'crash': {
                const bufLen = c.sampleRate * 0.6;
                const buf = c.createBuffer(1, bufLen, c.sampleRate);
                const data = buf.getChannelData(0);
                for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufLen, 2);
                const src = c.createBufferSource();
                src.buffer = buf;
                const bp = c.createBiquadFilter();
                bp.type = 'bandpass';
                bp.frequency.value = 5000;
                bp.Q.value = 0.5;
                const g = c.createGain();
                g.gain.setValueAtTime(0.6, now);
                g.gain.exponentialRampToValueAtTime(0.001, now + 0.6);
                src.connect(bp).connect(g).connect(c.destination);
                src.start(now);
                break;
            }
            case 'ride': {
                const bufLen = c.sampleRate * 0.35;
                const buf = c.createBuffer(1, bufLen, c.sampleRate);
                const data = buf.getChannelData(0);
                for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / bufLen, 1.5);
                const src = c.createBufferSource();
                src.buffer = buf;
                const hp = c.createBiquadFilter();
                hp.type = 'highpass';
                hp.frequency.value = 5000;
                const g = c.createGain();
                g.gain.setValueAtTime(0.35, now);
                g.gain.exponentialRampToValueAtTime(0.001, now + 0.35);
                src.connect(hp).connect(g).connect(c.destination);
                src.start(now);
                break;
            }
            case 'clap': {
                // quick repeated noise bursts
                for (let n = 0; n < 3; n++) {
                    const t = now + n * 0.015;
                    const bufLen = c.sampleRate * 0.02;
                    const buf = c.createBuffer(1, bufLen, c.sampleRate);
                    const data = buf.getChannelData(0);
                    for (let i = 0; i < bufLen; i++) data[i] = (Math.random() * 2 - 1);
                    const src = c.createBufferSource();
                    src.buffer = buf;
                    const bp = c.createBiquadFilter();
                    bp.type = 'bandpass';
                    bp.frequency.value = 2500;
                    const g = c.createGain();
                    g.gain.setValueAtTime(0.5, t);
                    g.gain.exponentialRampToValueAtTime(0.001, t + 0.05);
                    src.connect(bp).connect(g).connect(c.destination);
                    src.start(t);
                }
                break;
            }
            case 'cowbell': {
                const osc1 = c.createOscillator();
                const osc2 = c.createOscillator();
                osc1.type = 'square';
                osc2.type = 'square';
                osc1.frequency.value = 587;
                osc2.frequency.value = 845;
                const g = c.createGain();
                g.gain.setValueAtTime(0.4, now);
                g.gain.exponentialRampToValueAtTime(0.001, now + 0.25);
                const bp = c.createBiquadFilter();
                bp.type = 'bandpass';
                bp.frequency.value = 700;
                bp.Q.value = 3;
                osc1.connect(g);
                osc2.connect(g);
                g.connect(bp).connect(c.destination);
                osc1.start(now);
                osc2.start(now);
                osc1.stop(now + 0.25);
                osc2.stop(now + 0.25);
                break;
            }
        }
    }

    // Touch / pointer handling for drums — multitouch support
    const activeDrumTouches = new Set();

    function handleDrumHit(pad, clientX, clientY) {
        const drumId = pad.dataset.drum;
        const def = drumDefs.find(d => d.id === drumId);
        playDrum(drumId);
        pad.classList.add('hit');
        setTimeout(() => pad.classList.remove('hit'), 120);
        spawnParticles(clientX, clientY, def.color);
    }

    padContainer.addEventListener('touchstart', e => {
        e.preventDefault();
        for (const touch of e.changedTouches) {
            const pad = document.elementFromPoint(touch.clientX, touch.clientY);
            if (pad && pad.closest('.drum-pad')) {
                activeDrumTouches.add(touch.identifier);
                handleDrumHit(pad.closest('.drum-pad'), touch.clientX, touch.clientY);
            }
        }
    }, { passive: false });

    padContainer.addEventListener('touchmove', e => {
        e.preventDefault();
        for (const touch of e.changedTouches) {
            const pad = document.elementFromPoint(touch.clientX, touch.clientY);
            if (pad && pad.closest('.drum-pad')) {
                // Only retrigger if entering a NEW pad for this touch
                const dp = pad.closest('.drum-pad');
                if (!dp.classList.contains('hit')) {
                    handleDrumHit(dp, touch.clientX, touch.clientY);
                }
            }
        }
    }, { passive: false });

    // Mouse fallback
    padContainer.addEventListener('pointerdown', e => {
        if (e.pointerType === 'touch') return; // handled by touch events
        const pad = e.target.closest('.drum-pad');
        if (pad) handleDrumHit(pad, e.clientX, e.clientY);
    });

    // ══════════════════════════════════════════════════════════════════
    //  PIANO — Web Audio Synthesis
    // ══════════════════════════════════════════════════════════════════

    // Two octaves C4-B5 for a fun range
    const noteNames = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const pianoNotes = [];
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

    // rainbow colour for each white key
    const whiteKeyColors = [
        '#e84393', '#ff7675', '#fdcb6e', '#55efc4',
        '#00cec9', '#74b9ff', '#a29bfe', '#e84393',
        '#ff7675', '#fdcb6e', '#55efc4', '#00cec9',
        '#74b9ff', '#a29bfe',
    ];

    const pianoContainer = document.getElementById('piano-container');
    const activeOscillators = {};   // noteId → { osc, gain }
    let whiteIdx = 0;

    // Build piano keys
    const whiteKeys = pianoNotes.filter(n => !n.isBlack);
    const whiteKeyWidth = 100 / whiteKeys.length; // percentage

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

    // Second pass: black keys (positioned absolutely based on white key positions)
    let blackPositionIdx = 0;
    pianoNotes.forEach((note, i) => {
        if (!note.isBlack) { blackPositionIdx++; return; }
        const key = document.createElement('div');
        key.className = 'piano-key black';
        key.dataset.note = note.name;
        key.dataset.freq = note.freq;
        // Position black key at the boundary between adjacent white keys
        const leftPercent = (blackPositionIdx * whiteKeyWidth) - (whiteKeyWidth * 0.3);
        key.style.left = leftPercent + '%';
        key.style.width = (whiteKeyWidth * 0.6) + '%';
        pianoContainer.appendChild(key);
    });

    // Piano synth — warm tone with envelope
    function noteOn(noteId, freq) {
        if (activeOscillators[noteId]) return;
        const c = ensureAudio();
        const now = c.currentTime;

        // Two detuned oscillators for warmth
        const osc1 = c.createOscillator();
        const osc2 = c.createOscillator();
        osc1.type = 'triangle';
        osc2.type = 'sine';
        osc1.frequency.value = freq;
        osc2.frequency.value = freq * 2.001; // slight detune for shimmer

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
        const c = ensureAudio();
        const now = c.currentTime;
        entry.gain.gain.cancelScheduledValues(now);
        entry.gain.gain.setValueAtTime(entry.gain.gain.value, now);
        entry.gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
        entry.osc1.stop(now + 0.35);
        entry.osc2.stop(now + 0.35);
        delete activeOscillators[noteId];
    }

    // Touch handling for piano — full multitouch with slide between keys
    const activePianoTouches = new Map();  // touchId → noteId

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
                spawnParticles(touch.clientX, touch.clientY, color || '#00cec9');
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
                // Release old note
                if (prevNote) {
                    noteOff(prevNote);
                    const oldKey = pianoContainer.querySelector(`[data-note="${prevNote}"]`);
                    if (oldKey) oldKey.classList.remove('active');
                }
                // Press new note
                if (newNote && key) {
                    activePianoTouches.set(touch.identifier, newNote);
                    key.classList.add('active');
                    noteOn(newNote, parseFloat(key.dataset.freq));
                    const color = key.classList.contains('black') ? '#a29bfe' :
                        getComputedStyle(key).getPropertyValue('--key-color').trim();
                    spawnParticles(touch.clientX, touch.clientY, color || '#00cec9');
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

    // Mouse/pointer fallback for piano
    let mouseDownPianoNote = null;

    pianoContainer.addEventListener('pointerdown', e => {
        if (e.pointerType === 'touch') return;
        const key = getPianoKey(e.clientX, e.clientY);
        if (key) {
            mouseDownPianoNote = key.dataset.note;
            key.classList.add('active');
            noteOn(key.dataset.note, parseFloat(key.dataset.freq));
            spawnParticles(e.clientX, e.clientY, '#00cec9');
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

    // Keyboard support (for desktop testing): z-m = lower octave, q-u = upper octave
    const keyMap = {
        'z': 'C4', 's': 'C#4', 'x': 'D4', 'd': 'D#4', 'c': 'E4',
        'v': 'F4', 'g': 'F#4', 'b': 'G4', 'h': 'G#4', 'n': 'A4', 'j': 'A#4', 'm': 'B4',
        'q': 'C5', '2': 'C#5', 'w': 'D5', '3': 'D#5', 'e': 'E5',
        'r': 'F5', '5': 'F#5', 't': 'G5', '6': 'G#5', 'y': 'A5', '7': 'A#5', 'u': 'B5',
    };

    const pressedKeys = new Set();

    window.addEventListener('keydown', e => {
        if (e.repeat) return;
        const noteName = keyMap[e.key.toLowerCase()];
        if (!noteName || pressedKeys.has(e.key.toLowerCase())) return;
        pressedKeys.add(e.key.toLowerCase());
        const note = pianoNotes.find(n => n.name === noteName);
        if (!note) return;
        ensureAudio();
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
