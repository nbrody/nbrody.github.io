// audio.js - Audio system for the kinetic sculpture
export class AudioSystem {
    constructor() {
        this.ctx = null;
        this.master = null;
        this.compressor = null;
        this.noiseBuffer = null;
        this.notes = [261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25];
        this.chimeNotes = [523.25, 587.33, 659.25, 783.99, 880, 987.77, 1174.66];
        this.bellFreqs = [523.25, 659.25, 783.99, 880];
        this.drumFreq = 80;
        this.gongFreqs = [146.83, 196.0, 220.0, 293.66];
    }

    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
            this.master = this.ctx.createGain();
            this.master.gain.value = 0.6;
            this.compressor = this.ctx.createDynamicsCompressor();
            this.master.connect(this.compressor);
            this.compressor.connect(this.ctx.destination);
            this.noiseBuffer = this.createNoiseBuffer();
        } else if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
    }

    createNoiseBuffer() {
        const buffer = this.ctx.createBuffer(1, this.ctx.sampleRate * 1.2, this.ctx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < data.length; i++) {
            data[i] = (Math.random() * 2 - 1) * (1 - i / data.length);
        }
        return buffer;
    }

    playChime(noteIndex, duration = 0.8) {
        if (!this.ctx) return;
        const freq = this.notes[noteIndex % this.notes.length];
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.frequency.value = freq;
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.master);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    playChimeRod(noteIndex, duration = 0.6) {
        if (!this.ctx) return;
        const freq = this.chimeNotes[noteIndex % this.chimeNotes.length];
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.frequency.value = freq;
        osc.type = 'triangle';
        gain.gain.setValueAtTime(0.18, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + duration);
        osc.connect(gain);
        gain.connect(this.master);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    playBell(bellIndex) {
        if (!this.ctx) return;
        const freq = this.bellFreqs[bellIndex % this.bellFreqs.length];
        const fundamental = this.ctx.createOscillator();
        const harmonic = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        fundamental.frequency.value = freq;
        harmonic.frequency.value = freq * 2.4;
        fundamental.type = 'sine';
        harmonic.type = 'sine';

        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 1.5);

        fundamental.connect(gain);
        harmonic.connect(gain);
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(2200, this.ctx.currentTime);
        gain.connect(filter);
        filter.connect(this.master);

        fundamental.start();
        harmonic.start();
        fundamental.stop(this.ctx.currentTime + 1.5);
        harmonic.stop(this.ctx.currentTime + 1.5);
    }

    playDrum() {
        if (!this.ctx) return;
        const osc = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        osc.frequency.setValueAtTime(150, this.ctx.currentTime);
        osc.frequency.exponentialRampToValueAtTime(this.drumFreq, this.ctx.currentTime + 0.1);
        osc.type = 'sine';
        gain.gain.setValueAtTime(0.4, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.3);
        osc.connect(gain);
        gain.connect(this.master);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.3);
    }

    playGong(gongIndex = 0) {
        if (!this.ctx) return;
        const freq = this.gongFreqs[gongIndex % this.gongFreqs.length];
        const osc = this.ctx.createOscillator();
        const osc2 = this.ctx.createOscillator();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        osc.frequency.value = freq;
        osc.type = 'sine';
        osc2.frequency.value = freq * 1.42;
        osc2.type = 'triangle';

        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1200, this.ctx.currentTime);

        gain.gain.setValueAtTime(0.25, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.0008, this.ctx.currentTime + 2.8);

        osc.connect(gain);
        osc2.connect(gain);
        gain.connect(filter);
        filter.connect(this.master);

        osc.start();
        osc2.start();
        osc.stop(this.ctx.currentTime + 2.8);
        osc2.stop(this.ctx.currentTime + 2.8);
    }

    playClack() {
        if (!this.ctx || !this.noiseBuffer) return;
        const noise = this.ctx.createBufferSource();
        const gain = this.ctx.createGain();
        const filter = this.ctx.createBiquadFilter();

        noise.buffer = this.noiseBuffer;
        filter.type = 'highpass';
        filter.frequency.setValueAtTime(600, this.ctx.currentTime);

        gain.gain.setValueAtTime(0.15, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 0.12);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(this.master);

        noise.start();
        noise.stop(this.ctx.currentTime + 0.12);
    }
}
