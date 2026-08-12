/* ══════════════════════════════════════════════════════════
   🎸 Rockstar! — a one-page band studio for kids.
   Drums · Piano · Xylophone · Guitar — all WebAudio, no samples.
   ══════════════════════════════════════════════════════════ */
(function () {
    'use strict';

    // ────────────────────────────────────────────────────────
    //  Tiny helpers
    // ────────────────────────────────────────────────────────
    const $ = (sel) => document.querySelector(sel);
    const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
    const midiFreq = (m) => 440 * Math.pow(2, (m - 69) / 12);
    const rand = (a, b) => a + Math.random() * (b - a);
    const pick = (arr) => arr[(Math.random() * arr.length) | 0];

    function hexToRgb(hex) {
        const n = parseInt(hex.slice(1), 16);
        return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    function rgba(hex, a) {
        const [r, g, b] = hexToRgb(hex);
        return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')';
    }
    function lighten(hex, amt) {
        const [r, g, b] = hexToRgb(hex);
        const f = (c) => Math.round(c + (255 - c) * amt);
        return 'rgb(' + f(r) + ',' + f(g) + ',' + f(b) + ')';
    }
    function centerOf(el) {
        const r = el.getBoundingClientRect();
        return { x: r.left + r.width / 2, y: r.top + r.height / 2 };
    }

    // ────────────────────────────────────────────────────────
    //  Persistence
    // ────────────────────────────────────────────────────────
    const store = {
        get(key, fallback) {
            try {
                const v = localStorage.getItem(key);
                return v === null ? fallback : v;
            } catch (e) { return fallback; }
        },
        set(key, val) {
            try { localStorage.setItem(key, val); } catch (e) { /* private mode */ }
        }
    };

    // ────────────────────────────────────────────────────────
    //  Audio core — one lazy AudioContext, master → compressor
    // ────────────────────────────────────────────────────────
    let ctx = null;
    let master = null;
    let noiseBuf = null;
    let muted = store.get('kidsGames.muted', '0') === '1';
    const MASTER_LEVEL = 0.9;
    const MAX_VOICES = 24;
    const voices = [];

    function initAudio() {
        if (ctx) {
            if (ctx.state === 'suspended') { ctx.resume(); }
            return;
        }
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        ctx = new AC();
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.knee.value = 24;
        comp.ratio.value = 8;
        comp.attack.value = 0.003;
        comp.release.value = 0.25;
        comp.connect(ctx.destination);
        master = ctx.createGain();
        master.gain.value = muted ? 0 : MASTER_LEVEL;
        master.connect(comp);
        // Shared white-noise buffer for all noisy voices
        noiseBuf = ctx.createBuffer(1, Math.floor(ctx.sampleRate * 1.5), ctx.sampleRate);
        const d = noiseBuf.getChannelData(0);
        for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
        if (ctx.state === 'suspended') { ctx.resume(); }
    }
    // Wake audio on the very first gesture (capture: runs before surface handlers)
    window.addEventListener('pointerdown', initAudio, { capture: true, passive: true });
    window.addEventListener('keydown', initAudio, { capture: true });

    // ── Voice manager: cap voices, steal oldest, leak-free ──
    function voiceReap(v) {
        if (v.timer) { clearTimeout(v.timer); v.timer = null; }
        if (v.safety) { clearTimeout(v.safety); v.safety = null; }
        if (v.holderId && heldNotes.get(v.holderId) === v) heldNotes.delete(v.holderId);
        const i = voices.indexOf(v);
        if (i >= 0) voices.splice(i, 1);
        for (let n = 0; n < v.nodes.length; n++) {
            try { v.nodes[n].disconnect(); } catch (e) { /* already gone */ }
        }
        v.nodes.length = 0;
        v.sources.length = 0;
    }

    function voiceKill(v) { // fast fade-out (used when stealing)
        if (!ctx) { voiceReap(v); return; }
        const t = ctx.currentTime;
        try {
            v.out.gain.cancelScheduledValues(t);
            v.out.gain.setTargetAtTime(0, t, 0.012);
        } catch (e) { /* node dead */ }
        for (let i = 0; i < v.sources.length; i++) {
            try { v.sources[i].stop(t + 0.08); } catch (e) { /* already stopped */ }
        }
        if (v.holderId && heldNotes.get(v.holderId) === v) heldNotes.delete(v.holderId);
        if (v.timer) clearTimeout(v.timer);
        v.timer = setTimeout(() => voiceReap(v), 140);
    }

    function scheduleReap(v) {
        if (v.timer) clearTimeout(v.timer);
        const ms = Math.max(0, (v.end - ctx.currentTime) * 1000) + 90;
        v.timer = setTimeout(() => voiceReap(v), ms);
    }

    function mkVoice(end) {
        const out = ctx.createGain();
        out.connect(master);
        const v = { out, nodes: [out], sources: [], end, timer: null, safety: null, holderId: null };
        voices.push(v);
        while (voices.length > MAX_VOICES) voiceKill(voices.shift());
        scheduleReap(v);
        return v;
    }

    function noiseSrc(v) {
        const s = ctx.createBufferSource();
        s.buffer = noiseBuf;
        s.loop = true;
        v.sources.push(s);
        v.nodes.push(s);
        return s;
    }

    function osc(v, type, freq) {
        const o = ctx.createOscillator();
        o.type = type;
        o.frequency.value = freq;
        v.sources.push(o);
        v.nodes.push(o);
        return o;
    }

    function gainNode(v, val) {
        const g = ctx.createGain();
        g.gain.value = val;
        v.nodes.push(g);
        return g;
    }

    function filter(v, type, freq, q) {
        const f = ctx.createBiquadFilter();
        f.type = type;
        f.frequency.value = freq;
        if (q !== undefined) f.Q.value = q;
        v.nodes.push(f);
        return f;
    }

    // Percussive envelope that truly ends at 0
    function hitEnv(param, t, peak, end) {
        param.setValueAtTime(0.0001, t);
        param.linearRampToValueAtTime(peak, t + 0.004);
        param.exponentialRampToValueAtTime(0.0008, end - 0.008);
        param.linearRampToValueAtTime(0, end);
    }

    // ────────────────────────────────────────────────────────
    //  FX — sparkles, floating notes, disco glow (one canvas)
    // ────────────────────────────────────────────────────────
    const fxCanvas = $('#fx-canvas');
    const fxCtx = fxCanvas.getContext('2d');
    const glowEl = $('#disco-glow');
    const parts = [];
    let fxOn = false;
    let fxLast = 0;
    let activity = 0;

    function fxResize() {
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        fxCanvas.width = Math.floor(window.innerWidth * dpr);
        fxCanvas.height = Math.floor(window.innerHeight * dpr);
        fxCtx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    window.addEventListener('resize', fxResize);
    fxResize();

    function fxKick() {
        if (!fxOn) {
            fxOn = true;
            fxLast = performance.now();
            requestAnimationFrame(fxLoop);
        }
    }

    function fxLoop(ts) {
        const dt = clamp((ts - fxLast) / 1000, 0.001, 0.05);
        fxLast = ts;
        fxCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        for (let i = parts.length - 1; i >= 0; i--) {
            const p = parts[i];
            p.life -= dt * p.decay;
            if (p.life <= 0) { parts.splice(i, 1); continue; }
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += p.grav * dt;
            fxCtx.globalAlpha = clamp(p.life, 0, 1);
            if (p.text) {
                p.x += Math.sin(p.life * 7 + p.seed) * 14 * dt;
                fxCtx.font = Math.round(p.size) + 'px sans-serif';
                fxCtx.textAlign = 'center';
                fxCtx.textBaseline = 'middle';
                fxCtx.fillText(p.text, p.x, p.y);
            } else {
                fxCtx.fillStyle = p.color;
                fxCtx.beginPath();
                fxCtx.arc(p.x, p.y, Math.max(0.5, p.size * p.life), 0, Math.PI * 2);
                fxCtx.fill();
            }
        }
        fxCtx.globalAlpha = 1;
        activity = Math.max(0, activity - dt * 1.1);
        glowEl.style.opacity = (Math.min(1, activity) * 0.45).toFixed(3);
        if (parts.length || activity > 0.004) {
            requestAnimationFrame(fxLoop);
        } else {
            fxOn = false;
            glowEl.style.opacity = '0';
            fxCtx.clearRect(0, 0, window.innerWidth, window.innerHeight);
        }
    }

    function burstFx(x, y, color, count) {
        for (let i = 0; i < count; i++) {
            const a = Math.PI * 2 * (i / count) + rand(-0.3, 0.3);
            const sp = rand(60, 220);
            parts.push({
                x, y,
                vx: Math.cos(a) * sp,
                vy: Math.sin(a) * sp - 40,
                grav: 380,
                life: 1,
                decay: rand(1.6, 2.6),
                size: rand(3, 7),
                color
            });
        }
        fxKick();
    }

    function floatFx(x, y) {
        parts.push({
            x, y,
            vx: rand(-14, 14),
            vy: rand(-110, -70),
            grav: -12,
            life: 1,
            decay: 0.75,
            size: rand(20, 30),
            text: pick(['🎵', '🎶', '✨', '⭐']),
            seed: rand(0, 6.28)
        });
        fxKick();
    }

    function noteFx(x, y, color) {
        burstFx(x, y, color, 7);
        floatFx(x + rand(-8, 8), y - 6);
        activity = Math.min(1, activity + 0.16);
        fxKick();
    }

    // Restartable CSS hit animation
    function flash(el, cls) {
        el.classList.remove(cls);
        void el.offsetWidth;
        el.classList.add(cls);
    }

    // ────────────────────────────────────────────────────────
    //  🥁 DRUMS
    // ────────────────────────────────────────────────────────
    const DRUM_DEFS = [
        { id: 'kick', label: 'Kick', emoji: '🦶', color: '#ff6b6b', x: 50, y: 69, s: 42 },
        { id: 'snare', label: 'Snare', emoji: '🥁', color: '#ffd93d', x: 87, y: 73, s: 32 },
        { id: 'hhc', label: 'Hat', emoji: '🎩', color: '#55efc4', x: 14, y: 73, s: 30 },
        { id: 'hho', label: 'Open Hat', emoji: '👒', color: '#4ecdc4', x: 84, y: 27, s: 32 },
        { id: 'tom', label: 'Tom', emoji: '🪘', color: '#a29bfe', x: 50, y: 22, s: 36 },
        { id: 'crash', label: 'Crash', emoji: '💥', color: '#fdcb6e', x: 16, y: 27, s: 32 }
    ];
    const DRUM_KEYS = { a: 'kick', s: 'snare', d: 'hhc', f: 'hho', g: 'tom', h: 'crash' };
    const drumKit = $('#drum-kit');
    const drumPads = {};

    DRUM_DEFS.forEach((def) => {
        const pad = document.createElement('button');
        pad.className = 'drum-pad';
        pad.dataset.drum = def.id;
        pad.setAttribute('aria-label', def.label);
        pad.style.setProperty('--dx', def.x + '%');
        pad.style.setProperty('--dy', def.y + '%');
        pad.style.setProperty('--dsize', def.s + 'cqmin');
        pad.style.setProperty('--pad-color', def.color);
        pad.style.setProperty('--pad-shadow', rgba(def.color, 0.4));
        const hintKey = Object.keys(DRUM_KEYS).find((k) => DRUM_KEYS[k] === def.id);
        pad.innerHTML =
            '<span class="drum-emoji">' + def.emoji + '</span>' +
            '<span class="drum-label">' + def.label + '</span>' +
            '<span class="kb-hint">' + hintKey.toUpperCase() + '</span>';
        drumKit.appendChild(pad);
        drumPads[def.id] = pad;
    });
    drumKit.style.containerType = 'size';

    function drumSound(id) {
        if (!ctx) return;
        const t = ctx.currentTime;
        if (id === 'kick') {
            const v = mkVoice(t + 0.45);
            const o = osc(v, 'sine', 150);
            o.frequency.setValueAtTime(150, t);
            o.frequency.exponentialRampToValueAtTime(45, t + 0.16);
            const g = gainNode(v, 0);
            hitEnv(g.gain, t, 1.0, t + 0.42);
            o.connect(g); g.connect(v.out);
            const n = noiseSrc(v);
            const hp = filter(v, 'highpass', 3200);
            const ng = gainNode(v, 0);
            hitEnv(ng.gain, t, 0.35, t + 0.035);
            n.connect(hp); hp.connect(ng); ng.connect(v.out);
            o.start(t); o.stop(t + 0.45);
            n.start(t, rand(0, 1)); n.stop(t + 0.06);
        } else if (id === 'snare') {
            const v = mkVoice(t + 0.22);
            const o = osc(v, 'triangle', 190);
            o.frequency.setValueAtTime(190, t);
            o.frequency.exponentialRampToValueAtTime(85, t + 0.09);
            const og = gainNode(v, 0);
            hitEnv(og.gain, t, 0.55, t + 0.12);
            o.connect(og); og.connect(v.out);
            const n = noiseSrc(v);
            const bp = filter(v, 'bandpass', 1900, 0.7);
            const ng = gainNode(v, 0);
            hitEnv(ng.gain, t, 0.5, t + 0.19);
            n.connect(bp); bp.connect(ng); ng.connect(v.out);
            o.start(t); o.stop(t + 0.14);
            n.start(t, rand(0, 1)); n.stop(t + 0.22);
        } else if (id === 'hhc' || id === 'hho') {
            const dur = id === 'hhc' ? 0.06 : 0.42;
            const v = mkVoice(t + dur + 0.03);
            const n = noiseSrc(v);
            const hp = filter(v, 'highpass', 7600);
            const g = gainNode(v, 0);
            hitEnv(g.gain, t, id === 'hhc' ? 0.34 : 0.28, t + dur);
            n.connect(hp); hp.connect(g); g.connect(v.out);
            n.start(t, rand(0, 1)); n.stop(t + dur + 0.03);
        } else if (id === 'tom') {
            const v = mkVoice(t + 0.4);
            const o = osc(v, 'sine', 175);
            o.frequency.setValueAtTime(175, t);
            o.frequency.exponentialRampToValueAtTime(72, t + 0.27);
            const g = gainNode(v, 0);
            hitEnv(g.gain, t, 0.8, t + 0.36);
            o.connect(g); g.connect(v.out);
            const n = noiseSrc(v); // skin tap
            const bp = filter(v, 'bandpass', 900, 1);
            const ng = gainNode(v, 0);
            hitEnv(ng.gain, t, 0.14, t + 0.05);
            n.connect(bp); bp.connect(ng); ng.connect(v.out);
            o.start(t); o.stop(t + 0.4);
            n.start(t, rand(0, 1)); n.stop(t + 0.07);
        } else if (id === 'crash') {
            const v = mkVoice(t + 1.4);
            const n = noiseSrc(v);
            const hp = filter(v, 'highpass', 4300);
            const g = gainNode(v, 0);
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(0.42, t + 0.006);
            g.gain.exponentialRampToValueAtTime(0.0008, t + 1.32);
            g.gain.linearRampToValueAtTime(0, t + 1.38);
            n.connect(hp); hp.connect(g); g.connect(v.out);
            const n2 = noiseSrc(v); // opening sizzle
            const bp = filter(v, 'bandpass', 9000, 1);
            const g2 = gainNode(v, 0);
            hitEnv(g2.gain, t, 0.26, t + 0.3);
            n2.connect(bp); bp.connect(g2); g2.connect(v.out);
            n.start(t, rand(0, 1)); n.stop(t + 1.4);
            n2.start(t, rand(0, 1)); n2.stop(t + 0.32);
        }
    }

    function hitDrum(id, x, y) {
        const pad = drumPads[id];
        if (!pad) return;
        drumSound(id);
        flash(pad, 'hit');
        const def = DRUM_DEFS.find((d) => d.id === id);
        if (x === undefined) { const c = centerOf(pad); x = c.x; y = c.y; }
        noteFx(x, y, def.color);
    }

    // ────────────────────────────────────────────────────────
    //  🎹 PIANO — 18 keys, C4..F5
    // ────────────────────────────────────────────────────────
    const NOTE_NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
    const KEY_COLORS = { C: '#ff6b6b', D: '#ff9f43', E: '#ffe66d', F: '#55efc4', G: '#4ecdc4', A: '#74b9ff', B: '#a29bfe' };
    const WHITE_KEYS = ['z', 'x', 'c', 'v', 'b', 'n', 'm', ',', '.', '/'];
    const BLACK_KEYS = ['s', 'd', 'g', 'h', 'j', 'l', ';'];
    const pianoEl = $('#piano');
    const pianoWhite = [];
    const pianoBlack = [];
    const pianoKeyByKb = new Map(); // keyboard char → key element
    const heldNotes = new Map();    // holderId → voice

    (function buildPiano() {
        let whiteIdx = 0;
        let blackIdx = 0;
        for (let m = 60; m <= 77; m++) {
            const letter = NOTE_NAMES[m % 12];
            const isBlack = letter.indexOf('#') >= 0;
            const key = document.createElement('div');
            key.dataset.freq = midiFreq(m);
            key.dataset.note = letter + (Math.floor(m / 12) - 1);
            if (isBlack) {
                key.className = 'piano-key black';
                key._afterWhite = whiteIdx - 1; // sits after this white key
                const kb = BLACK_KEYS[blackIdx];
                if (kb) {
                    key.innerHTML = '<span class="kb-hint">' + kb.toUpperCase() + '</span>';
                    pianoKeyByKb.set(kb, key);
                }
                pianoBlack.push(key);
                blackIdx++;
            } else {
                key.className = 'piano-key white';
                key.style.setProperty('--key-color', KEY_COLORS[letter]);
                key.style.setProperty('--key-tint', rgba(KEY_COLORS[letter], 0.25));
                key.textContent = letter;
                const kb = WHITE_KEYS[whiteIdx];
                if (kb) {
                    const hint = document.createElement('span');
                    hint.className = 'kb-hint';
                    hint.textContent = kb === ',' || kb === '.' || kb === '/' || kb === ';' ? kb : kb.toUpperCase();
                    key.appendChild(hint);
                    pianoKeyByKb.set(kb, key);
                }
                pianoWhite.push(key);
                whiteIdx++;
            }
        }
        pianoWhite.forEach((k) => pianoEl.appendChild(k));
        pianoBlack.forEach((k) => pianoEl.appendChild(k));
    })();

    function layoutBlackKeys() {
        const pr = pianoEl.getBoundingClientRect();
        if (pr.width === 0) return;
        pianoBlack.forEach((bk) => {
            const lw = pianoWhite[bk._afterWhite];
            const rw = pianoWhite[bk._afterWhite + 1];
            if (!lw || !rw) return;
            const lr = lw.getBoundingClientRect();
            const rr = rw.getBoundingClientRect();
            const boundary = (lr.right + rr.left) / 2 - pr.left;
            const w = lr.width * 0.62;
            bk.style.left = (boundary - w / 2) + 'px';
            bk.style.width = w + 'px';
        });
    }
    window.addEventListener('resize', () => requestAnimationFrame(layoutBlackKeys));

    function pianoOn(holderId, keyEl) {
        const prev = heldNotes.get(holderId);
        if (prev) {
            if (prev.keyEl === keyEl) return;
            pianoOff(holderId);
        }
        if (!ctx) return;
        const t = ctx.currentTime;
        const freq = parseFloat(keyEl.dataset.freq);
        const v = mkVoice(t + 10); // safety ceiling; real end set on release
        v.holderId = holderId;
        v.keyEl = keyEl;
        const det = rand(-4, 4); // cents of warmth
        const o1 = osc(v, 'triangle', freq);
        o1.detune.value = det;
        const o2 = osc(v, 'sine', freq / 2); // soft sub
        o2.detune.value = det * 0.5;
        const g1 = gainNode(v, 0.3);
        const g2 = gainNode(v, 0.16);
        const lp = filter(v, 'lowpass', Math.min(6500, freq * 9), 0.4);
        o1.connect(g1); o2.connect(g2);
        g1.connect(lp); g2.connect(lp); lp.connect(v.out);
        v.out.gain.setValueAtTime(0.0001, t);
        v.out.gain.linearRampToValueAtTime(1, t + 0.012); // quick attack
        v.out.gain.exponentialRampToValueAtTime(0.55, t + 0.4); // settle
        o1.start(t); o2.start(t);
        heldNotes.set(holderId, v);
        v.safety = setTimeout(() => { if (heldNotes.get(holderId) === v) pianoOff(holderId); }, 9000);
        keyEl.classList.add('down');
        const c = centerOf(keyEl);
        noteFx(c.x, c.y - 10, keyEl.classList.contains('black') ? '#a29bfe' : (keyEl.style.getPropertyValue('--key-color') || '#4ecdc4'));
    }

    function pianoOff(holderId) {
        const v = heldNotes.get(holderId);
        if (!v) return;
        heldNotes.delete(holderId);
        if (v.safety) { clearTimeout(v.safety); v.safety = null; }
        if (v.keyEl) v.keyEl.classList.remove('down');
        if (!ctx) return;
        const t = ctx.currentTime;
        try {
            v.out.gain.cancelScheduledValues(t);
            v.out.gain.setValueAtTime(Math.max(0.0009, v.out.gain.value), t);
            v.out.gain.exponentialRampToValueAtTime(0.0008, t + 1.15); // ~1.2s release
            v.out.gain.linearRampToValueAtTime(0, t + 1.2);
        } catch (e) { /* voice was stolen */ }
        for (let i = 0; i < v.sources.length; i++) {
            try { v.sources[i].stop(t + 1.25); } catch (e) { /* already stopped */ }
        }
        v.end = t + 1.25;
        scheduleReap(v);
    }

    function releaseAllPiano() {
        Array.from(heldNotes.keys()).forEach(pianoOff);
    }

    // ────────────────────────────────────────────────────────
    //  🎼 XYLOPHONE — 8 rainbow bars, C major C5..C6
    // ────────────────────────────────────────────────────────
    const XYLO_NOTES = [
        { name: 'C', midi: 72 }, { name: 'D', midi: 74 }, { name: 'E', midi: 76 },
        { name: 'F', midi: 77 }, { name: 'G', midi: 79 }, { name: 'A', midi: 81 },
        { name: 'B', midi: 83 }, { name: 'C', midi: 84 }
    ];
    const XYLO_COLORS = ['#ff6b6b', '#ff9f43', '#ffd93d', '#55efc4', '#4ecdc4', '#74b9ff', '#a29bfe', '#fd79a8'];
    const xyloBarsEl = $('#xylo-bars');
    const xyloBars = [];

    XYLO_NOTES.forEach((note, i) => {
        const bar = document.createElement('button');
        bar.className = 'xylo-bar';
        bar.dataset.idx = i;
        bar.setAttribute('aria-label', 'Bar ' + note.name);
        bar.style.setProperty('--bar-h', (96 - i * 6) + '%');
        bar.style.setProperty('--bar-color', XYLO_COLORS[i]);
        bar.style.setProperty('--bar-hi', lighten(XYLO_COLORS[i], 0.45));
        bar.style.setProperty('--bar-shadow', rgba(XYLO_COLORS[i], 0.45));
        bar.innerHTML =
            '<span class="kb-hint">' + (i + 1) + '</span>' +
            '<span class="xylo-label">' + note.name + '</span>';
        xyloBarsEl.appendChild(bar);
        xyloBars.push(bar);
    });

    function xyloSound(midi) {
        if (!ctx) return;
        const t = ctx.currentTime;
        const f = midiFreq(midi);
        const v = mkVoice(t + 1.0);
        const o1 = osc(v, 'sine', f); // bright fundamental
        const g1 = gainNode(v, 0);
        hitEnv(g1.gain, t, 0.5, t + 0.9);
        o1.connect(g1); g1.connect(v.out);
        const o2 = osc(v, 'sine', f * 3); // 3rd harmonic ping
        const g2 = gainNode(v, 0);
        hitEnv(g2.gain, t, 0.17, t + 0.3);
        o2.connect(g2); g2.connect(v.out);
        const n = noiseSrc(v); // mallet click
        const hp = filter(v, 'highpass', 6000);
        const ng = gainNode(v, 0);
        hitEnv(ng.gain, t, 0.12, t + 0.03);
        n.connect(hp); hp.connect(ng); ng.connect(v.out);
        o1.start(t); o1.stop(t + 1.0);
        o2.start(t); o2.stop(t + 0.35);
        n.start(t, rand(0, 1)); n.stop(t + 0.05);
    }

    function hitXylo(i, x, y) {
        const bar = xyloBars[i];
        if (!bar) return;
        xyloSound(XYLO_NOTES[i].midi);
        flash(bar, 'bonk');
        if (x === undefined) { const c = centerOf(bar); x = c.x; y = c.y; }
        burstFx(x, y, XYLO_COLORS[i], 12); // extra sparkle for bonks
        noteFx(x, y, '#ffffff');
    }

    // ────────────────────────────────────────────────────────
    //  🎸 GUITAR — 6 strings, strum + chords (Karplus-Strong)
    // ────────────────────────────────────────────────────────
    const OPEN_MIDI = [40, 45, 50, 55, 59, 64]; // E2 A2 D3 G3 B3 E4 (top row = low E)
    const STRING_NAMES = ['E', 'A', 'D', 'G', 'B', 'E'];
    const STRING_COLORS = ['#e17055', '#ff9f43', '#f7b731', '#55efc4', '#4ecdc4', '#a29bfe'];
    const STRING_H = [8, 7, 6, 5, 4, 3];
    const CHORDS = {
        'Open': [0, 0, 0, 0, 0, 0],
        'C': [3, 3, 2, 0, 1, 0],
        'G': [3, 2, 0, 0, 0, 3],
        'Am': [0, 0, 2, 2, 1, 0],
        'F': [1, 3, 3, 2, 1, 1],
        'Em': [0, 2, 2, 0, 0, 0],
        'D': [2, 0, 0, 2, 3, 2]
    };
    const stringsEl = $('#strings');
    const chordRow = $('#chord-row');
    const stringLines = [];
    const fingerDots = [];
    let currentChord = 'Open';

    (function buildGuitar() {
        for (let i = 0; i < 6; i++) {
            const row = document.createElement('div');
            row.className = 'string-row';
            const tag = document.createElement('span');
            tag.className = 'string-tag';
            tag.textContent = STRING_NAMES[i];
            tag.style.setProperty('--string-color', STRING_COLORS[i]);
            const line = document.createElement('div');
            line.className = 'string-line';
            line.style.setProperty('--string-h', STRING_H[i] + 'px');
            const dot = document.createElement('span');
            dot.className = 'finger-dot';
            line.appendChild(dot);
            row.appendChild(tag);
            row.appendChild(line);
            stringsEl.appendChild(row);
            stringLines.push(line);
            fingerDots.push(dot);
        }
        Object.keys(CHORDS).forEach((name) => {
            const btn = document.createElement('button');
            btn.className = 'chord-btn';
            btn.dataset.chord = name;
            btn.textContent = name === 'Open' ? '🎸 Open' : name;
            btn.addEventListener('click', () => setChord(name, true));
            chordRow.appendChild(btn);
        });
    })();

    function setChord(name, preview) {
        currentChord = name;
        chordRow.querySelectorAll('.chord-btn').forEach((b) => {
            b.classList.toggle('selected', b.dataset.chord === name);
        });
        const frets = CHORDS[name];
        fingerDots.forEach((dot, i) => {
            const f = frets[i];
            if (f > 0) {
                dot.textContent = f;
                dot.style.left = (10 + f * 13) + '%';
                dot.classList.add('show');
            } else {
                dot.classList.remove('show');
            }
        });
        if (preview && ctx) strum(0, 5, 0.05, 0.55); // gentle top-to-bottom preview
    }

    // Karplus-Strong pluck: noise burst → delay loop with averaging lowpass
    function pluckSound(freq, when, vol) {
        if (!ctx) return;
        const T = freq < 150 ? 2.1 : (freq < 300 ? 1.7 : 1.4); // ring time
        const end = when + T + 0.4;
        const v = mkVoice(end);
        const lpF = Math.min(6500, 1400 + freq * 6);
        const delay = ctx.createDelay(0.05);
        delay.delayTime.value = Math.max(0.001, 1 / freq - 1 / (2 * Math.PI * lpF));
        const fb = ctx.createGain();
        fb.gain.value = Math.min(0.994, Math.exp(-6.9 / (freq * T)));
        const lp = filter(v, 'lowpass', lpF, 0.5);
        v.nodes.push(delay, fb);
        const n = noiseSrc(v);
        const burstG = gainNode(v, 0);
        burstG.gain.setValueAtTime(0.85 * vol, when);
        burstG.gain.linearRampToValueAtTime(0, when + Math.max(0.005, 1.6 / freq));
        const burstLp = filter(v, 'lowpass', Math.min(8000, freq * 14), 0.4);
        n.connect(burstLp); burstLp.connect(burstG); burstG.connect(delay);
        delay.connect(lp); lp.connect(fb); fb.connect(delay); // the loop
        delay.connect(v.out);
        v.out.gain.setValueAtTime(0.5 * vol, when);
        v.out.gain.exponentialRampToValueAtTime(0.0008, end - 0.03);
        v.out.gain.linearRampToValueAtTime(0, end);
        n.start(when, rand(0, 1));
        n.stop(when + Math.max(0.01, 2 / freq));
    }

    function pluckString(i, when, vol) {
        if (!ctx) return;
        const midi = OPEN_MIDI[i] + CHORDS[currentChord][i];
        pluckSound(midiFreq(midi), when, vol === undefined ? 1 : vol);
        const delayMs = Math.max(0, (when - ctx.currentTime) * 1000);
        setTimeout(() => {
            flash(stringLines[i], 'vibrate');
            const r = stringLines[i].getBoundingClientRect();
            if (r.width > 0) noteFx(r.left + r.width * rand(0.35, 0.65), r.top + r.height / 2, STRING_COLORS[i]);
        }, delayMs);
    }

    function strum(from, to, spacing, vol) {
        if (!ctx) return;
        const t = ctx.currentTime + 0.02;
        const step = from <= to ? 1 : -1;
        let k = 0;
        for (let i = from; step > 0 ? i <= to : i >= to; i += step, k++) {
            pluckString(i, t + k * spacing, vol);
        }
    }

    // String-row geometry for strum crossing detection
    function stringCenters() {
        const r = stringsEl.getBoundingClientRect();
        const padY = 14;
        const innerTop = r.top + padY;
        const rowH = (r.height - padY * 2) / 6;
        const centers = [];
        for (let i = 0; i < 6; i++) centers.push(innerTop + rowH * (i + 0.5));
        return centers;
    }

    function rowAt(y) {
        const r = stringsEl.getBoundingClientRect();
        const padY = 14;
        const rowH = (r.height - padY * 2) / 6;
        return clamp(Math.floor((y - r.top - padY) / rowH), 0, 5);
    }

    // ────────────────────────────────────────────────────────
    //  Pointer routing — full multi-touch on every instrument
    // ────────────────────────────────────────────────────────
    const pointers = new Map(); // pointerId → tracking state

    function padFromPoint(x, y) {
        const el = document.elementFromPoint(x, y);
        return el ? el.closest('.drum-pad') : null;
    }
    function pianoKeyFromPoint(x, y) {
        const el = document.elementFromPoint(x, y);
        return el ? el.closest('.piano-key') : null;
    }
    function barFromPoint(x, y) {
        const el = document.elementFromPoint(x, y);
        return el ? el.closest('.xylo-bar') : null;
    }

    drumKit.addEventListener('pointerdown', (e) => {
        const pad = padFromPoint(e.clientX, e.clientY);
        pointers.set(e.pointerId, { inst: 'drums', lastPad: pad });
        if (pad) hitDrum(pad.dataset.drum, e.clientX, e.clientY);
    });

    pianoEl.addEventListener('pointerdown', (e) => {
        const key = pianoKeyFromPoint(e.clientX, e.clientY);
        pointers.set(e.pointerId, { inst: 'piano' });
        if (key) pianoOn('ptr' + e.pointerId, key);
    });

    xyloBarsEl.addEventListener('pointerdown', (e) => {
        const bar = barFromPoint(e.clientX, e.clientY);
        pointers.set(e.pointerId, { inst: 'xylo', lastBar: bar });
        if (bar) hitXylo(parseInt(bar.dataset.idx, 10), e.clientX, e.clientY);
    });

    stringsEl.addEventListener('pointerdown', (e) => {
        pointers.set(e.pointerId, { inst: 'guitar', lastY: e.clientY });
        pluckString(rowAt(e.clientY), ctx ? ctx.currentTime : 0, 1);
    });

    window.addEventListener('pointermove', (e) => {
        const p = pointers.get(e.pointerId);
        if (!p) return;
        if (p.inst === 'drums') {
            const pad = padFromPoint(e.clientX, e.clientY);
            if (pad && pad !== p.lastPad) hitDrum(pad.dataset.drum, e.clientX, e.clientY);
            p.lastPad = pad;
        } else if (p.inst === 'piano') {
            const key = pianoKeyFromPoint(e.clientX, e.clientY);
            if (key) {
                pianoOn('ptr' + e.pointerId, key); // handles the "same key" case itself
            } else {
                pianoOff('ptr' + e.pointerId);
            }
        } else if (p.inst === 'xylo') {
            const bar = barFromPoint(e.clientX, e.clientY);
            if (bar && bar !== p.lastBar) hitXylo(parseInt(bar.dataset.idx, 10), e.clientX, e.clientY);
            p.lastBar = bar;
        } else if (p.inst === 'guitar') {
            if (!ctx) { p.lastY = e.clientY; return; }
            const centers = stringCenters();
            const crossed = [];
            for (let i = 0; i < 6; i++) {
                const c = centers[i];
                if ((p.lastY < c && e.clientY >= c) || (p.lastY > c && e.clientY <= c)) crossed.push(i);
            }
            crossed.sort((a, b) => Math.abs(centers[a] - p.lastY) - Math.abs(centers[b] - p.lastY));
            const t = ctx.currentTime;
            crossed.forEach((i, k) => pluckString(i, t + k * 0.014, 1));
            p.lastY = e.clientY;
        }
    });

    function endPointer(e) {
        const p = pointers.get(e.pointerId);
        if (!p) return;
        if (p.inst === 'piano') pianoOff('ptr' + e.pointerId);
        pointers.delete(e.pointerId);
    }
    window.addEventListener('pointerup', endPointer);
    window.addEventListener('pointercancel', endPointer);

    $('#stage').addEventListener('contextmenu', (e) => e.preventDefault());

    // ────────────────────────────────────────────────────────
    //  Keyboard input (per active instrument)
    // ────────────────────────────────────────────────────────
    let currentInst = 'drums';
    const kbDown = new Set();

    window.addEventListener('keydown', (e) => {
        if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
        const k = e.key.toLowerCase();
        if (currentInst === 'drums' && DRUM_KEYS[k]) {
            hitDrum(DRUM_KEYS[k]);
            e.preventDefault();
        } else if (currentInst === 'piano' && pianoKeyByKb.has(k)) {
            if (!kbDown.has(k)) {
                kbDown.add(k);
                pianoOn('kb' + k, pianoKeyByKb.get(k));
            }
            e.preventDefault();
        } else if (currentInst === 'xylo' && k >= '1' && k <= '8') {
            hitXylo(parseInt(k, 10) - 1);
            e.preventDefault();
        }
    });

    window.addEventListener('keyup', (e) => {
        const k = e.key.toLowerCase();
        if (kbDown.has(k)) {
            kbDown.delete(k);
            pianoOff('kb' + k);
        }
    });

    // ────────────────────────────────────────────────────────
    //  Tabs (instant switch, state kept)
    // ────────────────────────────────────────────────────────
    const tabs = Array.from(document.querySelectorAll('.tab'));
    const panels = {
        drums: $('#panel-drums'),
        piano: $('#panel-piano'),
        xylo: $('#panel-xylo'),
        guitar: $('#panel-guitar')
    };

    function setInstrument(name) {
        if (!panels[name]) name = 'drums';
        currentInst = name;
        releaseAllPiano();
        kbDown.clear();
        pointers.clear();
        tabs.forEach((t) => t.classList.toggle('active', t.dataset.inst === name));
        Object.keys(panels).forEach((k) => panels[k].classList.toggle('active', k === name));
        store.set('kidsGames.rockstar.instrument', name);
        if (name === 'piano') requestAnimationFrame(layoutBlackKeys);
    }
    tabs.forEach((t) => t.addEventListener('click', () => setInstrument(t.dataset.inst)));

    // ────────────────────────────────────────────────────────
    //  Metronome — soft woodblock at 90 bpm
    // ────────────────────────────────────────────────────────
    const metroBtn = $('#metro-btn');
    let metroOn = false;
    let metroTimer = null;
    let metroNext = 0;

    function woodblock(when) {
        const v = mkVoice(when + 0.1);
        const o = osc(v, 'square', 1050);
        const bp = filter(v, 'bandpass', 1150, 5);
        const g = gainNode(v, 0);
        hitEnv(g.gain, when, 0.22, when + 0.07);
        o.connect(bp); bp.connect(g); g.connect(v.out);
        o.start(when); o.stop(when + 0.1);
    }

    function metroSchedule() {
        if (!ctx) return;
        const ahead = ctx.currentTime + 0.25;
        while (metroNext < ahead) {
            woodblock(metroNext);
            const ms = Math.max(0, (metroNext - ctx.currentTime) * 1000);
            setTimeout(() => { if (metroOn) flash(metroBtn, 'tick'); }, ms);
            metroNext += 60 / 90;
        }
    }

    function setMetro(on) {
        metroOn = on;
        metroBtn.classList.toggle('active', on);
        if (on) {
            initAudio();
            if (!ctx) { metroOn = false; metroBtn.classList.remove('active'); return; }
            metroNext = ctx.currentTime + 0.15;
            metroSchedule();
            metroTimer = setInterval(metroSchedule, 100);
        } else if (metroTimer) {
            clearInterval(metroTimer);
            metroTimer = null;
        }
    }
    metroBtn.addEventListener('click', () => setMetro(!metroOn));

    // ────────────────────────────────────────────────────────
    //  Sound toggle + keyboard-hints toggle
    // ────────────────────────────────────────────────────────
    const soundBtn = $('#sound-btn');
    const hintsBtn = $('#hints-btn');

    function applyMuted() {
        soundBtn.textContent = muted ? '🔇' : '🔊';
        if (ctx && master) master.gain.setTargetAtTime(muted ? 0 : MASTER_LEVEL, ctx.currentTime, 0.015);
    }
    soundBtn.addEventListener('click', () => {
        muted = !muted;
        store.set('kidsGames.muted', muted ? '1' : '0');
        applyMuted();
    });

    function setHints(on) {
        document.body.classList.toggle('show-hints', on);
        hintsBtn.classList.toggle('active', on);
        store.set('kidsGames.rockstar.hints', on ? '1' : '0');
    }
    hintsBtn.addEventListener('click', () => setHints(!document.body.classList.contains('show-hints')));

    // ────────────────────────────────────────────────────────
    //  Housekeeping + boot
    // ────────────────────────────────────────────────────────
    function panic() {
        releaseAllPiano();
        kbDown.clear();
        pointers.clear();
        document.querySelectorAll('.piano-key.down').forEach((k) => k.classList.remove('down'));
    }
    window.addEventListener('blur', panic);
    document.addEventListener('visibilitychange', () => { if (document.hidden) panic(); });

    applyMuted();
    const storedHints = store.get('kidsGames.rockstar.hints', null);
    const defaultHints = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    setHints(storedHints === null ? defaultHints : storedHints === '1');
    setInstrument(store.get('kidsGames.rockstar.instrument', 'drums'));
    setChord('Open', false);

})();
