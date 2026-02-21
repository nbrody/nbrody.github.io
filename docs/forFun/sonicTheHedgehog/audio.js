// ============================================================
//  audio.js  –  Retro sound effects using Web Audio API
// ============================================================
const AudioManager = (() => {
    let ctx = null;

    function getCtx() {
        if (!ctx) ctx = new (window.AudioContext || window.webkitAudioContext)();
        return ctx;
    }

    function playTone(freq, duration, type = 'square', vol = 0.12) {
        try {
            const c = getCtx();
            const osc = c.createOscillator();
            const gain = c.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(freq, c.currentTime);
            gain.gain.setValueAtTime(vol, c.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + duration);
            osc.connect(gain).connect(c.destination);
            osc.start(); osc.stop(c.currentTime + duration);
        } catch (e) { }
    }

    function sweep(f1, f2, dur, type = 'square', vol = 0.10) {
        try {
            const c = getCtx();
            const osc = c.createOscillator();
            const gain = c.createGain();
            osc.type = type;
            osc.frequency.setValueAtTime(f1, c.currentTime);
            osc.frequency.exponentialRampToValueAtTime(f2, c.currentTime + dur);
            gain.gain.setValueAtTime(vol, c.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, c.currentTime + dur);
            osc.connect(gain).connect(c.destination);
            osc.start(); osc.stop(c.currentTime + dur);
        } catch (e) { }
    }

    return {
        ring() { playTone(1568, 0.08, 'square', 0.08); setTimeout(() => playTone(2093, 0.12, 'square', 0.08), 60); },
        jump() { sweep(300, 900, 0.25, 'square', 0.08); },
        spinDash() { sweep(200, 1200, 0.15, 'sawtooth', 0.06); },
        spring() { sweep(400, 1600, 0.3, 'square', 0.08); },
        destroy() { playTone(200, 0.15, 'sawtooth', 0.08); setTimeout(() => playTone(100, 0.2, 'sawtooth', 0.06), 100); },
        hurt() { sweep(800, 200, 0.4, 'sawtooth', 0.10); },
        checkpoint() { playTone(523, 0.1, 'square', 0.08); setTimeout(() => playTone(659, 0.1, 'square', 0.08), 100); setTimeout(() => playTone(784, 0.15, 'square', 0.08), 200); },
        die() { sweep(600, 80, 0.8, 'sawtooth', 0.12); },
        clear() { [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => playTone(f, 0.2, 'square', 0.08), i * 150)); },
        spindashCharge() { playTone(200 + Math.random() * 400, 0.08, 'sawtooth', 0.05); },
        resumeCtx() { try { getCtx().resume(); } catch (e) { } }
    };
})();
