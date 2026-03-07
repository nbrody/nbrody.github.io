// audio.js — Retro sound effects using Web Audio API oscillators

let ctx = null;

function getContext() {
    if (!ctx) {
        ctx = new (window.AudioContext || window.webkitAudioContext)();
    }
    return ctx;
}

function playTone(freq, duration, type = 'square', volume = 0.1, freqEnd = null) {
    try {
        const c = getContext();
        const osc = c.createOscillator();
        const gain = c.createGain();
        osc.type = type;
        osc.frequency.setValueAtTime(freq, c.currentTime);
        if (freqEnd !== null) {
            osc.frequency.exponentialRampToValueAtTime(
                Math.max(freqEnd, 20), c.currentTime + duration
            );
        }
        gain.gain.setValueAtTime(volume, c.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
        osc.connect(gain);
        gain.connect(c.destination);
        osc.start(c.currentTime);
        osc.stop(c.currentTime + duration);
    } catch (e) {
        // Audio not available
    }
}

export function playFire() {
    playTone(800, 0.08, 'square', 0.06, 200);
}

export function playExplosion(size = 'medium') {
    const freq = size === 'large' ? 80 : size === 'medium' ? 120 : 180;
    const dur = size === 'large' ? 0.4 : size === 'medium' ? 0.25 : 0.15;
    playTone(freq, dur, 'sawtooth', 0.08, 30);
    // Add noise-like crunch
    playTone(freq * 2.5, dur * 0.6, 'square', 0.04, 40);
}

export function playThrust() {
    playTone(60, 0.05, 'sawtooth', 0.03, 40);
}

export function playDeath() {
    playTone(400, 0.6, 'sawtooth', 0.1, 30);
    setTimeout(() => playTone(200, 0.4, 'square', 0.06, 20), 150);
}

export function playLevelUp() {
    playTone(400, 0.1, 'square', 0.06);
    setTimeout(() => playTone(600, 0.1, 'square', 0.06), 100);
    setTimeout(() => playTone(800, 0.15, 'square', 0.06), 200);
}
