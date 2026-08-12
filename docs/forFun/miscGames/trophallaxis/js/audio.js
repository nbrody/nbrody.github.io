/* ============================================================
   TROPHALLAXIS — chiptune audio (WebAudio, no samples)
   Two pulse channels + a noise channel, scheduled with a
   lookahead clock so the loop stays tight under GC.
   ============================================================ */

const Chip = (() => {
    let ctx = null, master = null, musicGain = null, sfxGain = null;
    let muted = localStorage.getItem('troph.muted') === '1';
    let musicOn = false, step = 0, nextNoteTime = 0, timer = null, tempo = 132;

    function ensure() {
        if (ctx) return ctx;
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return null;
        ctx = new AC();
        master = ctx.createGain();
        master.gain.value = muted ? 0 : 0.5;
        master.connect(ctx.destination);
        musicGain = ctx.createGain();
        musicGain.gain.value = 0.32;
        musicGain.connect(master);
        sfxGain = ctx.createGain();
        sfxGain.gain.value = 0.9;
        sfxGain.connect(master);
        return ctx;
    }

    /* A pulse wave built from a periodic wave: cheap NES timbre. */
    const waveCache = {};
    function pulse(duty) {
        if (waveCache[duty]) return waveCache[duty];
        const n = 24, real = new Float32Array(n), imag = new Float32Array(n);
        for (let i = 1; i < n; i++) {
            real[i] = (2 / (i * Math.PI)) * Math.sin(Math.PI * i * duty);
        }
        const w = ctx.createPeriodicWave(real, imag);
        waveCache[duty] = w;
        return w;
    }

    function tone(freq, t, dur, opts) {
        if (!ensure()) return;
        opts = opts || {};
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        if (opts.type === 'tri') o.type = 'triangle';
        else if (opts.type === 'saw') o.type = 'sawtooth';
        else o.setPeriodicWave(pulse(opts.duty || 0.5));
        o.frequency.setValueAtTime(freq, t);
        if (opts.slideTo) o.frequency.exponentialRampToValueAtTime(Math.max(20, opts.slideTo), t + dur);
        const vol = opts.vol == null ? 0.22 : opts.vol;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.exponentialRampToValueAtTime(vol, t + 0.006);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        o.connect(g);
        g.connect(opts.bus || sfxGain);
        o.start(t);
        o.stop(t + dur + 0.02);
    }

    let noiseBuf = null;
    function noise(t, dur, opts) {
        if (!ensure()) return;
        opts = opts || {};
        if (!noiseBuf) {
            noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 0.5, ctx.sampleRate);
            const d = noiseBuf.getChannelData(0);
            let s = 1;
            for (let i = 0; i < d.length; i++) { s = (s * 1103515245 + 12345) & 0x7fffffff; d[i] = (s / 0x40000000) - 1; }
        }
        const src = ctx.createBufferSource();
        src.buffer = noiseBuf;
        src.loop = true;
        const bp = ctx.createBiquadFilter();
        bp.type = opts.filter || 'bandpass';
        bp.frequency.setValueAtTime(opts.freq || 1200, t);
        if (opts.slideTo) bp.frequency.exponentialRampToValueAtTime(opts.slideTo, t + dur);
        bp.Q.value = opts.q == null ? 1.2 : opts.q;
        const g = ctx.createGain();
        g.gain.setValueAtTime(opts.vol == null ? 0.3 : opts.vol, t);
        g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        src.connect(bp); bp.connect(g); g.connect(opts.bus || sfxGain);
        src.start(t);
        src.stop(t + dur + 0.02);
    }

    const N = (n) => 440 * Math.pow(2, (n - 69) / 12); // midi -> Hz

    const SFX = {
        chew: () => { const t = ctx.currentTime; noise(t, 0.07, { freq: 900, slideTo: 400, vol: 0.16, q: 0.7 }); },
        gulp: () => { const t = ctx.currentTime; tone(N(48), t, 0.16, { duty: 0.25, slideTo: N(60), vol: 0.2 }); },
        link: () => {
            const t = ctx.currentTime;
            [0, 4, 7].forEach((k, i) => tone(N(72 + k), t + i * 0.035, 0.09, { duty: 0.125, vol: 0.14 }));
        },
        feed: () => {
            const t = ctx.currentTime;
            [76, 80, 83, 88].forEach((n, i) => tone(N(n), t + i * 0.05, 0.14, { duty: 0.5, vol: 0.2 }));
        },
        wrongEnd: () => {
            const t = ctx.currentTime;
            tone(N(55), t, 0.1, { duty: 0.25, vol: 0.2 });
            tone(N(51), t + 0.1, 0.16, { duty: 0.25, vol: 0.2 });
        },
        pickup: () => {
            const t = ctx.currentTime;
            for (let i = 0; i < 6; i++) tone(N(72 + i * 3), t + i * 0.03, 0.08, { duty: 0.5, vol: 0.16 });
        },
        bite: () => {
            const t = ctx.currentTime;
            noise(t, 0.22, { freq: 2200, slideTo: 180, vol: 0.4, q: 0.6 });
            tone(N(45), t, 0.25, { duty: 0.5, slideTo: N(29), vol: 0.22 });
        },
        antDown: () => {
            const t = ctx.currentTime;
            noise(t, 0.16, { freq: 500, slideTo: 90, vol: 0.32, q: 0.5 });
            tone(N(60), t, 0.14, { duty: 0.25, slideTo: N(40), vol: 0.18 });
        },
        starve: () => {
            const t = ctx.currentTime;
            [64, 60, 55, 48].forEach((n, i) => tone(N(n), t + i * 0.12, 0.22, { type: 'tri', vol: 0.3 }));
        },
        wave: () => {
            const t = ctx.currentTime;
            [72, 76, 79, 84, 79, 84, 88].forEach((n, i) => tone(N(n), t + i * 0.09, 0.18, { duty: 0.5, vol: 0.22 }));
        },
        molt: () => {
            const t = ctx.currentTime;
            noise(t, 0.5, { freq: 300, slideTo: 3000, vol: 0.18, q: 0.9 });
            tone(N(50), t, 0.5, { type: 'tri', slideTo: N(74), vol: 0.16 });
        },
        gameOver: () => {
            const t = ctx.currentTime;
            [69, 67, 65, 64, 62, 60, 55, 48].forEach((n, i) =>
                tone(N(n), t + i * 0.16, 0.3, { duty: 0.25, vol: 0.24 }));
        },
        start: () => {
            const t = ctx.currentTime;
            [60, 64, 67, 72, 76].forEach((n, i) => tone(N(n), t + i * 0.07, 0.2, { duty: 0.5, vol: 0.24 }));
        },
        blip: () => { const t = ctx.currentTime; tone(N(84), t, 0.05, { duty: 0.5, vol: 0.14 }); },
    };

    /* ---- music: 16-step loop, bass + arp, key of A minor ---- */
    const BASS = [45, 45, 52, 45, 43, 43, 50, 43, 41, 41, 48, 41, 40, 40, 47, 47];
    const ARP = [69, 72, 76, 72, 67, 71, 74, 71, 65, 69, 72, 69, 64, 68, 71, 76];

    function scheduleStep(s, t) {
        const beat = 60 / tempo / 2;
        tone(N(BASS[s % 16] - 12), t, beat * 0.9, { duty: 0.5, vol: 0.2, bus: musicGain });
        if (s % 2 === 0 || s % 8 === 3) {
            tone(N(ARP[s % 16]), t, beat * 0.55, { duty: 0.125, vol: 0.09, bus: musicGain });
        }
        if (s % 4 === 0) noise(t, 0.045, { freq: 4200, vol: 0.11, q: 1.4, bus: musicGain });
        if (s % 8 === 4) noise(t, 0.12, { freq: 900, slideTo: 300, vol: 0.16, q: 0.8, bus: musicGain });
    }

    function tick() {
        if (!ctx) return;
        const beat = 60 / tempo / 2;
        while (nextNoteTime < ctx.currentTime + 0.15) {
            if (nextNoteTime < ctx.currentTime) nextNoteTime = ctx.currentTime + 0.02;
            scheduleStep(step, nextNoteTime);
            nextNoteTime += beat;
            step++;
        }
    }

    return {
        unlock() {
            ensure();
            if (ctx && ctx.state === 'suspended') ctx.resume();
        },
        sfx(name) {
            if (!ensure() || muted) return;
            if (ctx.state === 'suspended') ctx.resume();
            const f = SFX[name];
            if (f) try { f(); } catch (e) { /* audio hiccup, keep playing */ }
        },
        startMusic(t) {
            if (!ensure()) return;
            tempo = t || 132;
            if (musicOn) return;
            musicOn = true;
            step = 0;
            nextNoteTime = ctx.currentTime + 0.05;
            timer = setInterval(tick, 25);
        },
        stopMusic() {
            musicOn = false;
            if (timer) clearInterval(timer);
            timer = null;
        },
        setTempo(t) { tempo = Math.max(90, Math.min(210, t)); },
        toggleMute() {
            muted = !muted;
            localStorage.setItem('troph.muted', muted ? '1' : '0');
            if (master) master.gain.value = muted ? 0 : 0.5;
            return muted;
        },
        isMuted() { return muted; },
    };
})();
