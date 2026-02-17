/**
 * 🎸 Rockstar — Guitar module
 * Interactive fretboard with touch input, chord definition, and chord macros.
 * Depends on shared.js (window.Rockstar).
 */

(function () {
    'use strict';

    const R = window.Rockstar;

    // ══════════════════════════════════════════════════════════════════
    //  GUITAR CONFIG
    // ══════════════════════════════════════════════════════════════════

    // Standard tuning: E2, A2, D3, G3, B3, E4 (low to high)
    const STRING_MIDI = [40, 45, 50, 55, 59, 64];
    const STRING_NAMES = ['E2', 'A2', 'D3', 'G3', 'B3', 'E4'];
    const NUM_FRETS = 12;
    const NUM_STRINGS = 6;

    // String colours (low → high)
    const STRING_COLORS = [
        '#e84393', '#ff7675', '#fdcb6e',
        '#55efc4', '#74b9ff', '#a29bfe',
    ];

    // Note names
    const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];

    function midiToFreq(midi) {
        return 440 * Math.pow(2, (midi - 69) / 12);
    }

    function midiToName(midi) {
        return NOTE_NAMES[midi % 12] + Math.floor(midi / 12 - 1);
    }

    // ══════════════════════════════════════════════════════════════════
    //  BUILD FRETBOARD
    // ══════════════════════════════════════════════════════════════════

    const fretboard = document.getElementById('guitar-fretboard');
    const activeGuitarOsc = {}; // key → {osc, gain}

    // Fret markers (dots) at frets 3, 5, 7, 9, 12
    const FRET_MARKERS = [3, 5, 7, 9, 12];

    // Build the fretboard grid
    function buildFretboard() {
        fretboard.innerHTML = '';

        // Header row (fret numbers)
        const headerRow = document.createElement('div');
        headerRow.className = 'fret-row fret-header';
        // empty cell for string label column
        const emptyLabel = document.createElement('div');
        emptyLabel.className = 'string-label';
        headerRow.appendChild(emptyLabel);
        for (let f = 0; f <= NUM_FRETS; f++) {
            const cell = document.createElement('div');
            cell.className = 'fret-number';
            cell.textContent = f === 0 ? 'O' : f;
            if (FRET_MARKERS.includes(f)) {
                cell.classList.add('fret-marker');
            }
            headerRow.appendChild(cell);
        }
        fretboard.appendChild(headerRow);

        // String rows (high E at top = index 5, low E at bottom = index 0)
        for (let s = NUM_STRINGS - 1; s >= 0; s--) {
            const row = document.createElement('div');
            row.className = 'fret-row';

            // String label
            const label = document.createElement('div');
            label.className = 'string-label';
            label.textContent = STRING_NAMES[s];
            label.style.color = STRING_COLORS[s];
            row.appendChild(label);

            for (let f = 0; f <= NUM_FRETS; f++) {
                const midi = STRING_MIDI[s] + f;
                const noteName = midiToName(midi);
                const cell = document.createElement('button');
                cell.className = 'fret-cell';
                cell.dataset.string = s;
                cell.dataset.fret = f;
                cell.dataset.midi = midi;
                cell.dataset.note = noteName;
                cell.style.setProperty('--string-color', STRING_COLORS[s]);

                // Note label
                const noteLabel = document.createElement('span');
                noteLabel.className = 'fret-note-label';
                noteLabel.textContent = NOTE_NAMES[midi % 12];
                cell.appendChild(noteLabel);

                // Open string styling
                if (f === 0) {
                    cell.classList.add('open-string');
                }

                row.appendChild(cell);
            }
            fretboard.appendChild(row);
        }
    }
    buildFretboard();

    // ══════════════════════════════════════════════════════════════════
    //  GUITAR SYNTH — Plucked string via Karplus-Strong-ish
    // ══════════════════════════════════════════════════════════════════

    function playGuitarNote(midi, stringIdx) {
        R.ensureAudio();
        const c = R.getCtx();
        if (!c) return;
        const now = c.currentTime;
        const freq = midiToFreq(midi);

        // Use a combination of oscillators to approximate a guitar pluck
        const osc = c.createOscillator();
        osc.type = 'sawtooth';
        osc.frequency.value = freq;

        // Body resonance
        const osc2 = c.createOscillator();
        osc2.type = 'triangle';
        osc2.frequency.value = freq;

        // Envelope — fast attack, moderate decay
        const env = c.createGain();
        env.gain.setValueAtTime(0.001, now);
        env.gain.linearRampToValueAtTime(0.4, now + 0.005);
        env.gain.exponentialRampToValueAtTime(0.15, now + 0.15);
        env.gain.exponentialRampToValueAtTime(0.001, now + 1.2);

        // Lowpass sweep — mimics the string losing high frequencies
        const filter = c.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(4000, now);
        filter.frequency.exponentialRampToValueAtTime(800, now + 0.8);
        filter.Q.value = 1;

        const masterGain = c.createGain();
        masterGain.gain.value = 0.45;

        osc.connect(env);
        osc2.connect(env);
        env.connect(filter);
        filter.connect(masterGain).connect(c.destination);

        osc.start(now);
        osc2.start(now);
        osc.stop(now + 1.3);
        osc2.stop(now + 1.3);
    }

    // ══════════════════════════════════════════════════════════════════
    //  FRETBOARD INPUT
    // ══════════════════════════════════════════════════════════════════

    function handleFretHit(cell, clientX, clientY) {
        const midi = parseInt(cell.dataset.midi);
        const stringIdx = parseInt(cell.dataset.string);
        playGuitarNote(midi, stringIdx);
        cell.classList.add('active');
        setTimeout(() => cell.classList.remove('active'), 200);
        R.spawnParticles(clientX, clientY, STRING_COLORS[stringIdx]);
    }

    function getFretCell(clientX, clientY) {
        const el = document.elementFromPoint(clientX, clientY);
        if (!el) return null;
        if (el.classList.contains('fret-cell')) return el;
        return el.closest('.fret-cell');
    }

    // Touch — multitouch with slide
    const activeGuitarTouches = new Map();

    fretboard.addEventListener('touchstart', e => {
        e.preventDefault();
        for (const touch of e.changedTouches) {
            const cell = getFretCell(touch.clientX, touch.clientY);
            if (cell) {
                activeGuitarTouches.set(touch.identifier, cell.dataset.midi + '-' + cell.dataset.string);
                handleFretHit(cell, touch.clientX, touch.clientY);
            }
        }
    }, { passive: false });

    fretboard.addEventListener('touchmove', e => {
        e.preventDefault();
        for (const touch of e.changedTouches) {
            const cell = getFretCell(touch.clientX, touch.clientY);
            if (!cell) continue;
            const key = cell.dataset.midi + '-' + cell.dataset.string;
            const prev = activeGuitarTouches.get(touch.identifier);
            if (key !== prev) {
                activeGuitarTouches.set(touch.identifier, key);
                handleFretHit(cell, touch.clientX, touch.clientY);
            }
        }
    }, { passive: false });

    fretboard.addEventListener('touchend', e => {
        for (const touch of e.changedTouches) {
            activeGuitarTouches.delete(touch.identifier);
        }
    });

    // Mouse fallback
    fretboard.addEventListener('pointerdown', e => {
        if (e.pointerType === 'touch') return;
        const cell = getFretCell(e.clientX, e.clientY);
        if (cell) handleFretHit(cell, e.clientX, e.clientY);
    });

    // ══════════════════════════════════════════════════════════════════
    //  CHORD MACROS — define, save, play
    // ══════════════════════════════════════════════════════════════════

    const CHORD_STORAGE_KEY = 'rockstar_guitar_chords';
    let savedChords = loadChords();

    // Common chord presets
    const PRESET_CHORDS = {
        'C': [-1, 3, 2, 0, 1, 0],   // x32010
        'D': [-1, -1, 0, 2, 3, 2],  // xx0232
        'E': [0, 2, 2, 1, 0, 0],    // 022100
        'G': [3, 2, 0, 0, 0, 3],    // 320003
        'Am': [-1, 0, 2, 2, 1, 0],   // x02210
        'Em': [0, 2, 2, 0, 0, 0],    // 022000
        'F': [1, 3, 3, 2, 1, 1],    // 133211
        'Dm': [-1, -1, 0, 2, 3, 1],  // xx0231
    };

    function loadChords() {
        try {
            const data = localStorage.getItem(CHORD_STORAGE_KEY);
            return data ? JSON.parse(data) : {};
        } catch { return {}; }
    }

    function persistChords() {
        try { localStorage.setItem(CHORD_STORAGE_KEY, JSON.stringify(savedChords)); }
        catch { }
    }

    function playChord(frets) {
        // frets is array of 6 values: fret number per string, -1 = muted
        R.ensureAudio();
        const strum = 0.03; // delay between strings for strum feel
        frets.forEach((fret, stringIdx) => {
            if (fret < 0) return; // muted
            const midi = STRING_MIDI[stringIdx] + fret;
            // Stagger slightly for strum
            setTimeout(() => {
                playGuitarNote(midi, stringIdx);
                // Highlight the cell
                const cell = fretboard.querySelector(
                    `.fret-cell[data-string="${stringIdx}"][data-fret="${fret}"]`
                );
                if (cell) {
                    cell.classList.add('active');
                    setTimeout(() => cell.classList.remove('active'), 300);
                }
            }, stringIdx * strum * 1000);
        });
    }

    // ── Chord bar UI ──
    const chordBar = document.getElementById('chord-bar');
    const chordBtnsContainer = document.getElementById('chord-btns');
    const addChordBtn = document.getElementById('add-chord-btn');
    const chordModal = document.getElementById('chord-modal');
    const chordNameInput = document.getElementById('chord-name-input');
    const chordFretInputs = [];
    const chordSaveBtn = document.getElementById('chord-save-btn');
    const chordCancelBtn = document.getElementById('chord-cancel-btn');
    const chordPresetBtns = document.getElementById('chord-preset-btns');

    // Collect fret inputs
    for (let i = 0; i < 6; i++) {
        chordFretInputs.push(document.getElementById('chord-fret-' + i));
    }

    function renderChordButtons() {
        chordBtnsContainer.innerHTML = '';

        // Preset chords first
        Object.entries(PRESET_CHORDS).forEach(([name, frets]) => {
            const btn = document.createElement('button');
            btn.className = 'chord-btn preset';
            btn.textContent = name;
            btn.title = fretsToString(frets);
            btn.addEventListener('click', () => playChord(frets));
            // Right click / long press to show info
            btn.addEventListener('contextmenu', e => {
                e.preventDefault();
                alert(`${name}: ${fretsToString(frets)}`);
            });
            chordBtnsContainer.appendChild(btn);
        });

        // User-saved chords
        Object.entries(savedChords).forEach(([name, frets]) => {
            const wrapper = document.createElement('div');
            wrapper.className = 'chord-btn-wrapper';

            const btn = document.createElement('button');
            btn.className = 'chord-btn user';
            btn.textContent = name;
            btn.title = fretsToString(frets);
            btn.addEventListener('click', () => playChord(frets));

            const delBtn = document.createElement('button');
            delBtn.className = 'chord-delete-btn';
            delBtn.textContent = '×';
            delBtn.title = 'Delete chord';
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                delete savedChords[name];
                persistChords();
                renderChordButtons();
            });

            wrapper.appendChild(btn);
            wrapper.appendChild(delBtn);
            chordBtnsContainer.appendChild(wrapper);
        });
    }

    function fretsToString(frets) {
        return frets.map(f => f < 0 ? 'x' : f).join('');
    }

    // Add chord button → open modal
    addChordBtn.addEventListener('click', () => {
        chordModal.classList.remove('hidden');
        chordNameInput.value = '';
        chordFretInputs.forEach(inp => inp.value = '0');
        chordNameInput.focus();
    });

    chordCancelBtn.addEventListener('click', () => {
        chordModal.classList.add('hidden');
    });

    chordSaveBtn.addEventListener('click', () => {
        const name = chordNameInput.value.trim();
        if (!name) { chordNameInput.focus(); return; }
        const frets = chordFretInputs.map(inp => {
            const v = inp.value.trim().toLowerCase();
            if (v === 'x' || v === '-1' || v === '') return -1;
            const n = parseInt(v);
            return isNaN(n) ? -1 : Math.max(-1, Math.min(n, NUM_FRETS));
        });
        savedChords[name] = frets;
        persistChords();
        renderChordButtons();
        chordModal.classList.add('hidden');

        // Play a preview
        playChord(frets);
    });

    // Preset quick-add buttons inside modal
    if (chordPresetBtns) {
        Object.entries(PRESET_CHORDS).forEach(([name, frets]) => {
            const btn = document.createElement('button');
            btn.className = 'preset-quick-btn';
            btn.textContent = name;
            btn.addEventListener('click', () => {
                chordNameInput.value = name;
                frets.forEach((f, i) => {
                    chordFretInputs[i].value = f < 0 ? 'x' : f;
                });
            });
            chordPresetBtns.appendChild(btn);
        });
    }

    renderChordButtons();

})();
