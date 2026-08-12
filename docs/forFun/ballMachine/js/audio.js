// audio.js — fully synthesized WebAudio sound engine for the ball machine.
// Chime bars, bell, metal clanks, ball clicks, wood thunks, per-ball rolling noise.

// Descending C-major pentatonic for the chime staircase.
const CHIME_FREQS = [1046.5, 880.0, 783.99, 659.26, 587.33, 523.25, 440.0, 392.0];

export class AudioEngine {
    constructor() {
        this.ctx = null;
        this.muted = false;
        this.rollers = new Map();
    }

    init() {
        if (this.ctx) return;
        const ctx = this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        this.master = ctx.createGain();
        this.master.gain.value = 0.85;
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -18;
        comp.knee.value = 20;
        comp.ratio.value = 5;
        comp.attack.value = 0.002;
        comp.release.value = 0.15;
        this.master.connect(comp).connect(ctx.destination);

        // shared white-noise buffer
        const len = ctx.sampleRate * 2;
        this.noiseBuf = ctx.createBuffer(1, len, ctx.sampleRate);
        const d = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
    }

    resume() { if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume(); }

    setMuted(m) {
        this.muted = m;
        if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 0.85, this.ctx.currentTime, 0.03);
    }

    _pan(x) {
        const p = this.ctx.createStereoPanner();
        p.pan.value = Math.max(-1, Math.min(1, (x + 1.2) / 5));
        return p;
    }

    _env(peak, decay, t0) {
        const g = this.ctx.createGain();
        g.gain.setValueAtTime(0, t0);
        g.gain.linearRampToValueAtTime(peak, t0 + 0.004);
        g.gain.exponentialRampToValueAtTime(0.0004, t0 + decay);
        return g;
    }

    _tone(freq, type, peak, decay, t0, dest) {
        const o = this.ctx.createOscillator();
        o.type = type;
        o.frequency.value = freq;
        const g = this._env(peak, decay, t0);
        o.connect(g).connect(dest);
        o.start(t0);
        o.stop(t0 + decay + 0.05);
    }

    _noise(peak, decay, t0, dest, filterType, freq, Q = 1) {
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuf;
        src.loop = true;
        const f = this.ctx.createBiquadFilter();
        f.type = filterType;
        f.frequency.value = freq;
        f.Q.value = Q;
        const g = this._env(peak, decay, t0);
        src.connect(f).connect(g).connect(dest);
        src.start(t0, Math.random() * 1.5);
        src.stop(t0 + decay + 0.05);
    }

    // struck metal chime bar (glockenspiel-ish partials)
    chime(i, x, vel = 1) {
        if (!this.ctx || this.muted) return;
        const t0 = this.ctx.currentTime;
        const pan = this._pan(x); pan.connect(this.master);
        const f0 = CHIME_FREQS[Math.max(0, Math.min(CHIME_FREQS.length - 1, i))];
        const v = Math.min(1, 0.3 + vel * 0.25);
        this._tone(f0, 'sine', 0.30 * v, 1.5, t0, pan);
        this._tone(f0 * 2.71, 'sine', 0.10 * v, 0.8, t0, pan);
        this._tone(f0 * 5.15, 'sine', 0.035 * v, 0.35, t0, pan);
        this._noise(0.10 * v, 0.03, t0, pan, 'highpass', 3500, 0.7);
    }

    // big brass bell with inharmonic partials
    bell(x) {
        if (!this.ctx || this.muted) return;
        const t0 = this.ctx.currentTime;
        const pan = this._pan(x); pan.connect(this.master);
        const f0 = 520;
        const partials = [
            [0.5, 0.25, 3.2], [1.0, 0.42, 2.6], [1.183, 0.24, 2.2], [1.506, 0.20, 1.8],
            [2.0, 0.26, 1.4], [2.514, 0.14, 1.0], [3.011, 0.10, 0.7], [4.166, 0.05, 0.4],
        ];
        for (const [r, a, d] of partials) this._tone(f0 * r, 'sine', a, d, t0, pan);
        this._noise(0.18, 0.05, t0, pan, 'bandpass', 2600, 1.2);
    }

    // metal clank (lift pickup / release)
    clank(x) {
        if (!this.ctx || this.muted) return;
        const t0 = this.ctx.currentTime;
        const pan = this._pan(x); pan.connect(this.master);
        this._noise(0.16, 0.06, t0, pan, 'bandpass', 2300, 2.5);
        this._tone(1780, 'triangle', 0.07, 0.14, t0, pan);
        this._tone(2390, 'sine', 0.04, 0.09, t0, pan);
    }

    // ball-on-ball click
    click(x, vel = 1) {
        if (!this.ctx || this.muted) return;
        const t0 = this.ctx.currentTime;
        const pan = this._pan(x); pan.connect(this.master);
        const v = Math.min(1, 0.2 + 0.3 * vel);
        this._noise(0.14 * v, 0.018, t0, pan, 'bandpass', 4200, 1.5);
        this._tone(1500, 'sine', 0.05 * v, 0.035, t0, pan);
    }

    // landing in the wooden return trough
    thunk(x, vel = 1) {
        if (!this.ctx || this.muted) return;
        const t0 = this.ctx.currentTime;
        const pan = this._pan(x); pan.connect(this.master);
        const v = Math.min(1, 0.3 + 0.25 * vel);
        this._tone(94, 'sine', 0.30 * v, 0.13, t0, pan);
        this._noise(0.12 * v, 0.07, t0, pan, 'lowpass', 320, 0.8);
    }

    // trampoline
    boing(x) {
        if (!this.ctx || this.muted) return;
        const t0 = this.ctx.currentTime;
        const pan = this._pan(x); pan.connect(this.master);
        const o = this.ctx.createOscillator();
        o.type = 'sine';
        o.frequency.setValueAtTime(210, t0);
        o.frequency.exponentialRampToValueAtTime(72, t0 + 0.28);
        const g = this._env(0.30, 0.34, t0);
        o.connect(g).connect(pan);
        o.start(t0); o.stop(t0 + 0.4);
        const o2 = this.ctx.createOscillator();
        o2.type = 'triangle';
        o2.frequency.setValueAtTime(330, t0);
        o2.frequency.exponentialRampToValueAtTime(110, t0 + 0.2);
        const g2 = this._env(0.10, 0.22, t0);
        o2.connect(g2).connect(pan);
        o2.start(t0); o2.stop(t0 + 0.3);
        this._noise(0.06, 0.04, t0, pan, 'lowpass', 600, 0.8);
    }

    // route-switch tick
    tick(x) {
        if (!this.ctx || this.muted) return;
        const t0 = this.ctx.currentTime;
        const pan = this._pan(x); pan.connect(this.master);
        this._noise(0.09, 0.014, t0, pan, 'bandpass', 2900, 3);
    }

    // ---- continuous rolling noise, one voice per ball ----
    _roller(id) {
        let r = this.rollers.get(id);
        if (r) return r;
        const src = this.ctx.createBufferSource();
        src.buffer = this.noiseBuf;
        src.loop = true;
        const f = this.ctx.createBiquadFilter();
        f.type = 'bandpass';
        f.frequency.value = 400;
        f.Q.value = 0.7;
        const g = this.ctx.createGain();
        g.gain.value = 0;
        const pan = this.ctx.createStereoPanner();
        src.connect(f).connect(g).connect(pan).connect(this.master);
        src.start(0, Math.random() * 1.9);
        r = { f, g, pan };
        this.rollers.set(id, r);
        return r;
    }

    setRolling(id, speed, x) {
        if (!this.ctx || this.muted) return;
        const r = this._roller(id);
        const t = this.ctx.currentTime;
        const sp = Math.min(1, speed / 7);
        r.g.gain.setTargetAtTime(sp > 0.02 ? 0.035 * sp : 0, t, 0.06);
        r.f.frequency.setTargetAtTime(260 + 1300 * sp, t, 0.08);
        r.pan.pan.setTargetAtTime(Math.max(-1, Math.min(1, (x + 1.2) / 5)), t, 0.1);
    }
}
