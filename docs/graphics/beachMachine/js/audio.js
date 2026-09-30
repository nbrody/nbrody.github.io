// Sound for the beach machine: the Glass House machine's synthesized audio
// engine (marimba, bells, glockenspiel, chimes, water glasses, the mechanical
// noises, rolling balls, the lift, running water), set outdoors — a short,
// airy room instead of a glass conservatory — with a steel pan voice added and
// the birds and crickets swapped for surf, gulls and a sea breeze.
import { AudioEngine } from '../../ballMachine/js/audio.js';

const TAU = Math.PI * 2, LN1000 = 6.907755278982137;
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;
const fin = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const rr = (a, b) => a + (b - a) * Math.random();
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };

// A steel pan note: near-harmonic partials (fundamental, octave, twelfth)
// tuned into the hammered note area, each a slightly split doublet that
// shimmers; the octave blooms a few tens of milliseconds after the strike,
// which gives a pan its "wah". Bass pans ring longer and darker.
function steelPan(e, p, t, vel) {
  const m = clamp(fin(p.midi, 74), 36, 100), f = midiHz(m);
  const k = clamp((m - 45) / 45, 0, 1);
  const T = lerp(3.0, 0.95, k);
  const b = 0.35 + 0.65 * vel;
  const v = e._voice(p, t, 'inst', 0.2 * Math.pow(vel, 1.3), T / LN1000);
  if (!v) return;
  e._osc(v, f, 1.0, t, 0.003, T);
  e._osc(v, f + 0.9 * Math.sqrt(f / 300), 0.32, t, 0.003, T * 0.9);
  const o2 = e._osc(v, f * 2, 1, t, 0.002, T * 0.55, 'sine', true);
  if (o2) {
    const g = v.nodes[v.nodes.length - 1].gain, a1 = 0.28 * b, a2 = 0.62 * b;
    g.setValueAtTime(0, t); g.linearRampToValueAtTime(a1, t + 0.004);
    g.linearRampToValueAtTime(a2, t + 0.055); g.setTargetAtTime(0, t + 0.055, T * 0.55 / LN1000);
    e._stopAt(v, o2, t + 0.06 + T * 0.6);
  }
  e._osc(v, f * 2.003, 0.14 * b, t, 0.002, T * 0.5);
  e._osc(v, f * 3.0, 0.2 * b * b, t, 0.0015, T * 0.3);
  e._osc(v, f * 4.01, 0.07 * b * b, t, 0.001, T * 0.18);
  if (m < 55) e._osc(v, f * 0.5, 0.25, t, 0.004, T * 0.5);
  e._play(v, e._b.mallet, t, clamp(f / 420, 0.55, 2.2) * (0.9 + 0.2 * vel), 0.22 * b);
}

// ---------------------------------------------------------------- beach ambience
function noiseBuffer(ctx, seconds, stereo = true) {
  const n = Math.round(ctx.sampleRate * seconds), buf = ctx.createBuffer(stereo ? 2 : 1, n, ctx.sampleRate);
  for (let ch = 0; ch < buf.numberOfChannels; ch++) {
    const d = buf.getChannelData(ch);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < n; i++) {
      // pinkish noise (Kellet's filter, economy version)
      const w = Math.random() * 2 - 1;
      b0 = 0.99765 * b0 + w * 0.099046; b1 = 0.963 * b1 + w * 0.2965164; b2 = 0.57 * b2 + w * 1.0526913;
      d[i] = (b0 + b1 + b2 + w * 0.1848) * 0.18;
    }
  }
  return buf;
}

class BeachAmbience {
  constructor(e) {
    const c = e._ctx, now = c.currentTime;
    this.e = e; this.level = 0; this.hour = 12; this.dayW = 1;
    this.out = c.createGain(); this.out.gain.value = 1;
    this.out.connect(e._bus.amb);
    this.day = c.createGain(); this.day.gain.value = 0; this.day.connect(this.out);
    const noise = noiseBuffer(c, 4);
    // surf: a rumble and a fizz, each swelled by scheduled waves
    const mk = (type, f, q) => { const b = c.createBiquadFilter(); b.type = type; b.frequency.value = f; b.Q.value = q; return b; };
    this.rumbleF = mk('lowpass', 400, 0.5); this.rumbleG = c.createGain(); this.rumbleG.gain.value = 0.25;
    this.fizzF = mk('bandpass', 3000, 0.6); this.fizzG = c.createGain(); this.fizzG.gain.value = 0.05;
    for (const [f, g, off] of [[this.rumbleF, this.rumbleG, 0], [this.fizzF, this.fizzG, 1.7]]) {
      const s = c.createBufferSource(); s.buffer = noise; s.loop = true; s.playbackRate.value = f === this.fizzF ? 1 : 0.8;
      s.connect(f); f.connect(g); g.connect(this.out); s.start(now, off);
    }
    // breeze in the palms (day)
    const wind = c.createBufferSource(); wind.buffer = noise; wind.loop = true; wind.playbackRate.value = 1.3;
    const whp = mk('highpass', 1600, 0.4), wlp = mk('lowpass', 6500, 0.4);
    this.windG = c.createGain(); this.windG.gain.value = 0.12;
    wind.connect(whp); whp.connect(wlp); wlp.connect(this.windG); this.windG.connect(this.day);
    wind.start(now, 2.3);
    this.nextWave = now + 0.4; this.nextGull = now + rr(2, 5); this.nextGust = now;
    if (!e._offline) this.timer = setInterval(() => this.tick(), 150);
  }
  set(level, hour) {
    const e = this.e, now = e._ctx.currentTime;
    this.level = clamp(fin(level, 0), 0, 1);
    this.hour = ((fin(hour, 12) % 24) + 24) % 24;
    const h = this.hour;
    this.dayW = smooth(5.3, 6.8, h) * (1 - smooth(18.8, 20.2, h));
    e._bus.amb.gain.setTargetAtTime(0.05 * Math.pow(this.level, 1.4), now, 0.3);
    this.day.gain.setTargetAtTime(this.dayW, now, 0.5);
  }
  tick() {
    const e = this.e, c = e._ctx;
    if (!c || this.level <= 0 || (!e._offline && c.state !== 'running')) return;
    const now = c.currentTime;
    if (now >= this.nextWave) this.wave(now + 0.05);
    if (this.dayW > 0.05 && now >= this.nextGull) {
      this.gull(now + rr(0.05, 0.3));
      this.nextGull = now + rr(3, 11) / (0.3 + this.dayW);
    }
    if (now >= this.nextGust) { this.windG.gain.setTargetAtTime(rr(0.05, 0.22), now, rr(0.4, 1.5)); this.nextGust = now + rr(1, 3.5); }
  }
  // one wave: the swell's roar builds, it breaks, then fizzes up the sand and drains
  wave(t) {
    const big = Math.random() < 0.35, A = big ? 1 : rr(0.45, 0.8);
    const rise = rr(1.2, 2.0), wash = rr(3, 4.5);
    const g = this.rumbleG.gain, f = this.rumbleF.frequency, fz = this.fizzG.gain, ff = this.fizzF.frequency;
    g.cancelScheduledValues(t); f.cancelScheduledValues(t); fz.cancelScheduledValues(t); ff.cancelScheduledValues(t);
    g.setTargetAtTime(0.25 + 0.55 * A, t, rise * 0.45);
    f.setTargetAtTime(700 + 900 * A, t, rise * 0.5);
    g.setTargetAtTime(0.2, t + rise, wash * 0.45);
    f.setTargetAtTime(380, t + rise, wash * 0.4);
    fz.setTargetAtTime(0.35 * A, t + rise * 0.9, 0.12);
    ff.setTargetAtTime(4200, t + rise * 0.9, 0.2);
    fz.setTargetAtTime(0.03, t + rise + 0.4, wash * 0.35);
    ff.setTargetAtTime(2400, t + rise + 0.4, wash * 0.5);
    this.nextWave = t + rise + wash + rr(0.5, 3);
  }
  // a herring gull: a few falling "kyow" calls, sometimes a laughing run
  gull(t) {
    const c = this.e._ctx, o = c.createOscillator(), bp = c.createBiquadFilter(), g = c.createGain(), sp = this.e._stereo(rr(-0.9, 0.9));
    o.type = 'sawtooth'; bp.type = 'bandpass'; bp.frequency.value = 1800; bp.Q.value = 1.6;
    const vib = c.createOscillator(), vg = c.createGain(); vib.frequency.value = rr(18, 28); vg.gain.value = 40;
    vib.connect(vg); vg.connect(o.frequency);
    g.gain.value = 0;
    const laugh = Math.random() < 0.35, n = laugh ? 4 + ((Math.random() * 4) | 0) : 1 + ((Math.random() * 3) | 0);
    const dist = rr(0.25, 0.8), f0 = rr(1150, 1500);
    let ts = t, end = t;
    for (let i = 0; i < n; i++) {
      const d = laugh ? rr(0.1, 0.14) : rr(0.28, 0.42);
      const fa = laugh ? f0 * 0.9 : f0 * rr(1.05, 1.15), fb = laugh ? f0 * 0.75 : f0 * rr(0.62, 0.72);
      o.frequency.setValueAtTime(fa * 0.85, ts); o.frequency.linearRampToValueAtTime(fa, ts + d * 0.2); o.frequency.exponentialRampToValueAtTime(fb, ts + d);
      g.gain.setValueAtTime(0, ts); g.gain.linearRampToValueAtTime(0.5 * dist, ts + d * 0.15);
      g.gain.linearRampToValueAtTime(0.35 * dist, ts + d * 0.8); g.gain.linearRampToValueAtTime(0, ts + d);
      end = ts + d; ts += d + (laugh ? rr(0.05, 0.09) : rr(0.12, 0.3));
    }
    o.connect(bp); bp.connect(g); g.connect(sp); sp.connect(this.day);
    o.start(t); vib.start(t); o.stop(end + 0.05); vib.stop(end + 0.05);
    o.onended = () => { for (const x of [o, bp, g, sp, vib, vg]) x.disconnect(); };
  }
  dispose() { if (this.timer) clearInterval(this.timer); this.timer = null; }
}

export function createAudio() {
  return new AudioEngine({ rt60: 0.9, preDelay: 0.01, instruments: { pan: steelPan }, Ambience: BeachAmbience });
}
