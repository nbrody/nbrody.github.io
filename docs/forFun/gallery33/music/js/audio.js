/* ============================================================
   Audio Engine — Web Audio API helpers
   ============================================================ */

let audioCtx = null;
let masterGain = null;

export function ensureAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        masterGain = audioCtx.createGain();
        masterGain.gain.value = 0.3;
        masterGain.connect(audioCtx.destination);
    }
    if (audioCtx.state === 'suspended') audioCtx.resume();
}

export function getAudioCtx() {
    return audioCtx;
}

export function playTone(freq, gain = 0.15, type = 'sine') {
    ensureAudio();
    const osc = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    osc.type = type;
    osc.frequency.value = freq;
    g.gain.value = gain;
    osc.connect(g);
    g.connect(masterGain);
    osc.start();
    return { osc, gain: g };
}

export function stopTone(toneObj, fadeTime = 0.1) {
    if (!toneObj || !audioCtx) return;
    const now = audioCtx.currentTime;
    toneObj.gain.gain.setTargetAtTime(0, now, fadeTime / 3);
    toneObj.osc.stop(now + fadeTime);
}

export function playRichTone(baseFreq, gain = 0.1) {
    ensureAudio();
    const oscs = [];
    // Simulate overtones of a string
    for (let n = 1; n <= 6; n++) {
        const o = playTone(baseFreq * n, gain / (n * n), 'sine');
        oscs.push(o);
    }
    return oscs;
}
