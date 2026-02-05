// audio.js - Audio system for the kinetic sculpture
export class AudioSystem {
    constructor() {
        this.ctx = null;
        this.notes = [261.63, 293.66, 329.63, 392, 440, 523.25, 587.33, 659.25];
        this.bellFreqs = [523.25, 659.25, 783.99, 880];
        this.drumFreq = 80;
    }

    init() {
        if (!this.ctx) {
            this.ctx = new (window.AudioContext || window.webkitAudioContext)();
        } else if (this.ctx.state === 'suspended') {
            this.ctx.resume();
        }
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
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + duration);
    }

    playBell(bellIndex) {
        if (!this.ctx) return;
        const freq = this.bellFreqs[bellIndex % this.bellFreqs.length];
        const fundamental = this.ctx.createOscillator();
        const harmonic = this.ctx.createOscillator();
        const gain = this.ctx.createGain();

        fundamental.frequency.value = freq;
        harmonic.frequency.value = freq * 2.4;
        fundamental.type = 'sine';
        harmonic.type = 'sine';

        gain.gain.setValueAtTime(0.2, this.ctx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, this.ctx.currentTime + 1.5);

        fundamental.connect(gain);
        harmonic.connect(gain);
        gain.connect(this.ctx.destination);

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
        gain.connect(this.ctx.destination);
        osc.start();
        osc.stop(this.ctx.currentTime + 0.3);
    }
}
