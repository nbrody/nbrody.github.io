/**
 * 🥁 Rockstar — Drums module
 * Web Audio synthesis drum kit with realistic overhead layout.
 * Depends on shared.js (window.Rockstar).
 */

(function () {
    'use strict';

    const R = window.Rockstar;

    // ══════════════════════════════════════════════════════════════════
    //  DRUMS — Web Audio Synthesis
    // ══════════════════════════════════════════════════════════════════

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

    // Build drum pads
    const padContainer = document.getElementById('drum-pad-container');
    drumDefs.forEach(def => {
        const btn = document.createElement('button');
        btn.className = `drum-pad drum-${def.type}`;
        btn.dataset.drum = def.id;
        btn.style.setProperty('--dx', def.x + '%');
        btn.style.setProperty('--dy', def.y + '%');
        btn.style.setProperty('--dsize', def.size + '%');

        if (def.type === 'drum') {
            btn.innerHTML = `
                <span class="drum-rim"></span>
                <span class="drum-head"></span>
                <span class="drum-head-label">${def.label}</span>`;
        } else if (def.type === 'cymbal') {
            btn.innerHTML = `
                <span class="cymbal-body"></span>
                <span class="cymbal-bell"></span>
                <span class="drum-head-label">${def.label}</span>`;
        } else {
            btn.innerHTML = `<span class="drum-head-label">${def.label}</span>`;
        }
        padContainer.appendChild(btn);
    });

    // Synthesised drum sounds
    function playDrum(id) {
        R.ensureAudio();
        const c = R.getCtx();
        if (!c) return;
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

    // Touch / pointer handling for drums
    function handleDrumHit(pad, clientX, clientY) {
        const drumId = pad.dataset.drum;
        const def = drumDefs.find(d => d.id === drumId);
        playDrum(drumId);
        pad.classList.add('hit');
        setTimeout(() => pad.classList.remove('hit'), 120);
        R.spawnParticles(clientX, clientY, def.color);
    }

    padContainer.addEventListener('touchstart', e => {
        e.preventDefault();
        for (const touch of e.changedTouches) {
            const pad = document.elementFromPoint(touch.clientX, touch.clientY);
            if (pad && pad.closest('.drum-pad')) {
                handleDrumHit(pad.closest('.drum-pad'), touch.clientX, touch.clientY);
            }
        }
    }, { passive: false });

    padContainer.addEventListener('touchmove', e => {
        e.preventDefault();
        for (const touch of e.changedTouches) {
            const pad = document.elementFromPoint(touch.clientX, touch.clientY);
            if (pad && pad.closest('.drum-pad')) {
                const dp = pad.closest('.drum-pad');
                if (!dp.classList.contains('hit')) {
                    handleDrumHit(dp, touch.clientX, touch.clientY);
                }
            }
        }
    }, { passive: false });

    padContainer.addEventListener('pointerdown', e => {
        if (e.pointerType === 'touch') return;
        const pad = e.target.closest('.drum-pad');
        if (pad) handleDrumHit(pad, e.clientX, e.clientY);
    });

})();
