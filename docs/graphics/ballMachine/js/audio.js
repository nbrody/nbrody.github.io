// js/audio.js — Glass House Ball Machine: audio engine.
//
// Everything is synthesized with the Web Audio API (no samples, no assets, no imports):
//   • tuned instruments = additive modal synthesis (oscillator partials with per-partial exponential
//     decays) + short precomputed excitation transients;
//   • mechanical noises = banks of tiny precomputed modal "impact" buffers (built once at start);
//   • continuous voices (rolling balls, bucket-chain lift) = persistent node pools driven per frame;
//   • room = one convolution reverb with a synthesized glass-and-cast-iron conservatory impulse;
//   • master = +4 dB trim → high-pass → compressor → soft-clip ceiling (0.94 ≈ −0.5 dBFS) → volume → mute.
//
// Public API (called by the app): see `export class AudioEngine` at the bottom of this file.

/* =============================================================================================
 * Constants & tiny helpers
 * =========================================================================================== */
const TAU = Math.PI * 2;
const LN1000 = 6.907755278982137;               // exp decay reaches −60 dB after T60 = LN1000 · τ
const REF_DIST = 1.5, ROLLOFF = 1, MAX_DIST = 60;
const VOICE_CAP = 64;                           // simultaneous one-shot groups
const ROLL_VOICES = 6;

const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;
const fin = (v, d) => (typeof v === 'number' && Number.isFinite(v) ? v : d);
const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
const smooth = (e0, e1, x) => { const t = clamp((x - e0) / (e1 - e0), 0, 1); return t * t * (3 - 2 * t); };
const rr = (a, b) => a + (b - a) * Math.random();
const distGain = (d) => REF_DIST / (REF_DIST + ROLLOFF * (Math.max(d, REF_DIST) - REF_DIST)); // PannerNode 'inverse'

/** Deterministic PRNG (mulberry32) so generated buffers are identical on every start. */
function mulberry(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* =============================================================================================
 * Offline DSP used only while building buffers at start()
 * =========================================================================================== */

/** In-place RBJ biquad ('lp' | 'hp' | 'bp' [0 dB peak]). */
function biquad(buf, type, f, q, sr) {
  f = clamp(f, 10, sr * 0.45);
  const w = TAU * f / sr, cs = Math.cos(w), al = Math.sin(w) / (2 * q);
  let b0, b1, b2;
  if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; }
  else if (type === 'hp') { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; }
  else { b0 = al; b1 = 0; b2 = -al; }
  const a0 = 1 + al, a1 = (-2 * cs) / a0, a2 = (1 - al) / a0;
  b0 /= a0; b1 /= a0; b2 /= a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < buf.length; i++) {
    const x = buf[i], y = b0 * x + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2;
    x2 = x1; x1 = x; y2 = y1; y1 = y; buf[i] = y;
  }
  return buf;
}

/** Add a damped sinusoid A·r^n·sin(ωn+φ) (T60 in seconds) into out[] from sample s0. 2nd-order recurrence. */
function addMode(out, sr, f, amp, t60, s0 = 0, ph = 0) {
  if (!(f > 0) || f >= sr * 0.47 || !amp) return;
  const w = TAU * f / sr, r = Math.exp(-LN1000 / (t60 * sr));
  const c = 2 * r * Math.cos(w), r2 = r * r;
  let y2 = amp * Math.sin(ph - w) / r, y1 = amp * Math.sin(ph);
  const end = Math.min(out.length, s0 + Math.ceil(t60 * 1.6 * sr));
  for (let i = s0; i < end; i++) { out[i] += y1; const y = c * y1 - r2 * y2; y2 = y1; y1 = y; }
}

/** White-noise burst with linear attack and exponential decay (τ). */
function noiseBurst(sr, R, dur, attack, tau) {
  const n = Math.max(2, Math.ceil(dur * sr)), out = new Float32Array(n);
  const na = Math.max(1, Math.round(attack * sr)), d = Math.exp(-1 / (tau * sr));
  let e = 1;
  for (let i = 0; i < n; i++) { const env = i < na ? i / na : (e *= d); out[i] = env * (R() * 2 - 1); }
  return out;
}

function mixInto(dst, src, g = 1, s0 = 0) {
  const n = Math.min(dst.length - s0, src.length);
  for (let i = 0; i < n; i++) dst[i + s0] += g * src[i];
  return dst;
}

/** Normalize to `peak` and apply a short raised-cosine fade at the end (guarantees a click-free tail). */
function finish(arr, sr, peak = 1, fadeMs = 4) {
  let m = 0;
  for (let i = 0; i < arr.length; i++) { const a = Math.abs(arr[i]); if (a > m) m = a; }
  const k = m > 0 ? peak / m : 0;
  for (let i = 0; i < arr.length; i++) arr[i] *= k;
  const nf = Math.min(arr.length, Math.round(fadeMs * 1e-3 * sr));
  for (let i = 0; i < nf; i++) arr[arr.length - 1 - i] *= 0.5 - 0.5 * Math.cos(Math.PI * i / nf);
  return arr;
}

function toBuffer(ctx, ...chans) {
  const b = ctx.createBuffer(chans.length, chans[0].length, ctx.sampleRate);
  chans.forEach((d, i) => b.getChannelData(i).set(d));
  return b;
}

/** Iterative radix-2 complex FFT (in place). sign = +1 → inverse (unscaled). */
function fft(re, im, sign) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = sign * TAU / len, wr = Math.cos(ang), wi = Math.sin(ang), half = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < half; k++) {
        const a = i + k, b = a + half;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nc = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nc;
      }
    }
  }
}

/**
 * Conservatory impulse response: RT60 ≈ 2.4 s, 25 ms pre-delay, bright discrete early reflections
 * (glass panes / iron ribs), diffuse tail whose high frequencies damp progressively (time-varying
 * low-pass). Decorrelated stereo, normalized to unit energy per channel.
 */
function makeConservatoryIR(ctx, rt60 = 2.4, pre = 0.025) {
  const sr = ctx.sampleRate, len = Math.ceil(sr * (pre + rt60 * 1.3));
  const chans = [];
  let energy = 0;
  for (let ch = 0; ch < 2; ch++) {
    const R = mulberry(0x5eed + ch * 7919), d = new Float32Array(len);
    const s0 = Math.round(pre * sr), dec = Math.exp(-LN1000 / (rt60 * sr)), build = sr * 0.035;
    let env = 1, lp = 0, a = 0;
    for (let i = s0; i < len; i++) {
      const k = i - s0;
      if ((k & 63) === 0) {                       // HF damping: cutoff 12 kHz → ~1.8 kHz over the tail
        const fc = 1800 + 10500 * Math.exp(-(k / sr) / 0.55);
        a = 1 - Math.exp(-TAU * fc / sr);
      }
      lp += a * ((R() * 2 - 1) - lp);
      d[i] = lp * env * (k < build ? k / build : 1);
      env *= dec;
    }
    // Early reflections 25–115 ms, full-band (glass is a hard, bright reflector).
    for (let j = 0; j < 20; j++) {
      const t = pre + 0.001 + Math.pow(R(), 1.35) * 0.09, i = Math.round(t * sr);
      if (i >= len - 2) continue;
      const amp = (R() < 0.5 ? -1 : 1) * (0.45 + 0.55 * R()) * 4.2 * Math.exp(-(t - pre) / 0.055);
      d[i] += amp; d[i + 1] += amp * 0.3;
    }
    for (let i = 0; i < len; i++) energy += d[i] * d[i];
    chans.push(d);
  }
  const k = 1 / Math.sqrt(energy / 2);
  for (const d of chans) for (let i = 0; i < len; i++) d[i] *= k;
  return toBuffer(ctx, chans[0], chans[1]);
}

/**
 * Gong shimmer texture: ~420 inharmonic partials (140 Hz–9 kHz) synthesized by one inverse FFT, so the
 * buffer is exactly periodic → seamless loop. Close partials beat against each other = shimmer.
 */
function makeShimmer(ctx) {
  const sr = ctx.sampleRate;
  let N = 1; while (N < sr * 2.6) N <<= 1;
  const re = new Float64Array(N), im = new Float64Array(N), R = mulberry(4242);
  for (let j = 0; j < 420; j++) {
    const f = 140 * Math.pow(9000 / 140, Math.pow(R(), 0.8));
    const k = Math.round(f * N / sr), a = Math.pow(f / 600, -0.35) * (0.25 + R()), ph = TAU * R();
    re[k] += a * Math.cos(ph); im[k] += a * Math.sin(ph);
  }
  fft(re, im, 1);
  const out = new Float32Array(N);
  let s = 0;
  for (let i = 0; i < N; i++) s += re[i] * re[i];
  const g = 0.25 / Math.sqrt(s / N);              // RMS 0.25
  for (let i = 0; i < N; i++) out[i] = re[i] * g;
  return toBuffer(ctx, out);
}

/** Soft-clip transfer curve over input ±range: linear to `lin`, tanh knee, asymptote `ceil` (< 1). */
function softClipCurve(n = 4096, range = 4, lin = 0.6, ceil = 0.94) {
  const c = new Float32Array(n), k = ceil - lin;
  for (let i = 0; i < n; i++) {
    const u = (i / (n - 1) * 2 - 1) * range, a = Math.abs(u);
    c[i] = Math.sign(u) * (a <= lin ? a : lin + k * Math.tanh((a - lin) / k));
  }
  return c;
}

/* =============================================================================================
 * Precomputed transient banks (built once in start(); each buffer is tiny, peak-normalized to 1)
 * Each generator: (sampleRate, rng, hard ∈ {0,1}) → Float32Array.
 * =========================================================================================== */
const jit = (R, amt) => 1 + (R() - 0.5) * 2 * amt;

const GEN = {
  // --- excitation transients for the tuned instruments -------------------------------------
  mallet(sr, R) {        // yarn/rubber marimba mallet on rosewood: soft woody "thok"
    const o = new Float32Array(Math.round(0.05 * sr));
    mixInto(o, biquad(noiseBurst(sr, R, 0.03, 0.0009, 0.0035), 'lp', 1700, 0.7, sr), 1);
    addMode(o, sr, 540, 0.55, 0.022); addMode(o, sr, 1380, 0.35, 0.016); addMode(o, sr, 2350, 0.18, 0.010);
    return finish(o, sr);
  },
  metal(sr, R) {         // hard striker on bronze/brass: clangy inharmonic splash
    const o = new Float32Array(Math.round(0.12 * sr));
    mixInto(o, biquad(noiseBurst(sr, R, 0.03, 0.0002, 0.003), 'hp', 2500, 0.7, sr), 0.8);
    for (const [f, a, t] of [[2230, 0.3, 0.05], [3150, 0.5, 0.06], [4870, 0.45, 0.045], [6230, 0.35, 0.035], [7930, 0.25, 0.025]])
      addMode(o, sr, f * jit(R, 0.02), a, t);
    return finish(o, sr);
  },
  tine(sr, R) {          // brass glockenspiel mallet tick
    return finish(biquad(noiseBurst(sr, R, 0.012, 0.00005, 0.0007), 'bp', 5200, 0.7, sr), sr, 1, 1);
  },
  stick(sr, R) {         // felt/wood timpani stick on calfskin
    const o = new Float32Array(Math.round(0.06 * sr));
    mixInto(o, biquad(noiseBurst(sr, R, 0.05, 0.0004, 0.006), 'lp', 3200, 0.7, sr), 1);
    mixInto(o, biquad(noiseBurst(sr, R, 0.05, 0.0004, 0.004), 'bp', 900, 1.2, sr), 1.5);
    return finish(o, sr);
  },
  beater(sr, R) {        // big soft gong beater: dark, blunt
    const o = biquad(biquad(noiseBurst(sr, R, 0.1, 0.003, 0.014), 'lp', 420, 0.7, sr), 'lp', 420, 0.7, sr);
    return finish(o, sr);
  },
  tink(sr, R) {          // brass striker on a glass rim: a bright glassy tick
    const o = new Float32Array(Math.round(0.02 * sr));
    mixInto(o, biquad(noiseBurst(sr, R, 0.006, 0.00003, 0.0004), 'bp', 7200, 0.9, sr), 1);
    addMode(o, sr, 5300, 0.4, 0.006); addMode(o, sr, 8100, 0.3, 0.004);
    return finish(o, sr, 1, 1);
  },

  // --- mechanical noises ------------------------------------------------------------------
  clack(sr, R, h) {      // hardwood flip-flop slapping its stop: bright woody knock 1.5–2.5 kHz, 20–40 ms
    const o = new Float32Array(Math.round(0.07 * sr)), s = jit(R, 0.07);
    addMode(o, sr, 1900 * s, 1.0, 0.034); addMode(o, sr, 2650 * s * jit(R, 0.03), 0.55, 0.024);
    addMode(o, sr, 4100 * s, 0.3 + 0.25 * h, 0.012); addMode(o, sr, 720 * s, 0.45, 0.03);
    addMode(o, sr, 1250 * s * jit(R, 0.03), 0.25, 0.02);
    mixInto(o, biquad(noiseBurst(sr, R, 0.01, 0.0002, 0.0007 + 0.0006 * (1 - h)), 'hp', 900, 0.7, sr), 0.9 + 0.6 * h);
    if (!h) biquad(o, 'lp', 3200, 0.7, sr);
    return finish(o, sr);
  },
  click(sr, R, h) {      // phenolic balls colliding: crisp 3–5 kHz, 5–10 ms
    const o = new Float32Array(Math.round(0.024 * sr)), s = jit(R, 0.08);
    addMode(o, sr, 3700 * s, 1.0, 0.010); addMode(o, sr, 4800 * s * jit(R, 0.03), 0.7, 0.008);
    addMode(o, sr, 6900 * s, 0.25 + 0.4 * h, 0.004); addMode(o, sr, 2500 * s, 0.25, 0.011);
    mixInto(o, biquad(noiseBurst(sr, R, 0.004, 0.00005, 0.0003), 'hp', 2000, 0.7, sr), 1.2 + h);
    if (!h) biquad(o, 'lp', 4300, 0.8, sr);
    return finish(o, sr, 1, 2);
  },
  clunk(sr, R, h) {      // ball dropping onto stainless rails: ringing ≈800/2100/3700 Hz + thump
    const o = new Float32Array(Math.round(0.2 * sr)), s = jit(R, 0.05);
    addMode(o, sr, 800 * s, 0.6, 0.14); addMode(o, sr, 2100 * s * jit(R, 0.02), 0.5, 0.1);
    addMode(o, sr, 3700 * s * jit(R, 0.02), 0.35 + 0.2 * h, 0.07); addMode(o, sr, 5650 * s, 0.15 + 0.15 * h, 0.04);
    addMode(o, sr, 1330 * s, 0.2, 0.08);
    addMode(o, sr, 115 * jit(R, 0.1), 1.0, 0.06); addMode(o, sr, 210, 0.45, 0.035);
    mixInto(o, biquad(noiseBurst(sr, R, 0.012, 0.0002, 0.0015), 'lp', 3500 + 3000 * h, 0.7, sr), 0.8);
    return finish(o, sr);
  },
  cup(sr, R, h) {        // ball into a steel lift cup / tipping bucket: dull thunk
    const o = new Float32Array(Math.round(0.15 * sr)), s = jit(R, 0.06);
    addMode(o, sr, 330 * s, 1.0, 0.07); addMode(o, sr, 540 * s, 0.5, 0.05);
    addMode(o, sr, 1150 * s * jit(R, 0.03), 0.3, 0.04); addMode(o, sr, 2350 * s, 0.1 + 0.1 * h, 0.025);
    addMode(o, sr, 150 * jit(R, 0.08), 0.7, 0.05);
    mixInto(o, biquad(noiseBurst(sr, R, 0.012, 0.0003, 0.002), 'lp', 1500 + 1000 * h, 0.7, sr), 0.7);
    return finish(o, sr);
  },
  thud(sr, R, h) {       // ball on wood / soft stop: low and damped
    const o = new Float32Array(Math.round(0.12 * sr)), s = jit(R, 0.08);
    addMode(o, sr, 125 * s, 1.0, 0.06); addMode(o, sr, 215 * s, 0.55, 0.04);
    addMode(o, sr, 410 * s, 0.25, 0.025); addMode(o, sr, 800 * s, 0.1 * h, 0.015);
    mixInto(o, biquad(noiseBurst(sr, R, 0.03, 0.0005, 0.004), 'lp', 700 + 500 * h, 0.7, sr), 0.9);
    return finish(o, sr);
  },
  tick(sr, R, h) {       // ratchet pawl dropping onto a tooth
    const o = new Float32Array(Math.round(0.03 * sr)), s = jit(R, 0.06);
    addMode(o, sr, 2700 * s, 1.0, 0.014); addMode(o, sr, 5200 * s, 0.55, 0.007);
    addMode(o, sr, 7900 * s, 0.1 + 0.3 * h, 0.004); addMode(o, sr, 1450 * s, 0.3, 0.012);
    mixInto(o, biquad(noiseBurst(sr, R, 0.003, 0.00005, 0.0004), 'hp', 1500, 0.7, sr), 1);
    return finish(o, sr, 1, 2);
  },
  chainA(sr, R, h) {     // lift chain: link pin clinking over the sprocket (bright)
    const o = new Float32Array(Math.round(0.04 * sr)), s = jit(R, 0.05);
    addMode(o, sr, 3300 * s, 1.0, 0.018); addMode(o, sr, 5100 * s, 0.6, 0.012);
    addMode(o, sr, 2200 * s, 0.4, 0.02); addMode(o, sr, 7400 * s, 0.2, 0.006);
    mixInto(o, biquad(noiseBurst(sr, R, 0.004, 0.0001, 0.0006), 'hp', 1500, 0.7, sr), 0.9);
    return finish(o, sr, 0.55 + 0.45 * R(), 2);
  },
  splash(sr, R, h) {     // ball into water: slap + spray, then the cavity's air bubble rings and rises ("plop")
    const o = new Float32Array(Math.round(0.34 * sr)), s = jit(R, 0.08);
    mixInto(o, biquad(biquad(noiseBurst(sr, R, 0.09, 0.0006, 0.018 + 0.012 * h), 'bp', 1400 + 900 * h, 0.6, sr), 'hp', 250, 0.7, sr), 1.1 + 0.5 * h);
    // spray: a patter of tiny droplets landing
    for (let k = 0, n = 10 + 16 * h; k < n; k++) {
      const t0 = Math.round((0.02 + R() * (0.12 + 0.12 * h)) * sr);
      const d = biquad(noiseBurst(sr, R, 0.004, 0.00003, 0.0006), 'bp', 3500 + R() * 4500, 1.2, sr);
      mixInto(o, d, (0.12 + 0.2 * R()) * (1 - t0 / o.length), t0);
    }
    bubble(o, sr, Math.round((0.012 + 0.01 * R()) * sr), (420 - 120 * h) * s, 1.9, 0.045, 0.9);
    return finish(o, sr);
  },
  gurgle(sr, R, h) {     // down the drain: a run of bubbles glugging through the pipe
    const o = new Float32Array(Math.round(0.5 * sr));
    mixInto(o, biquad(noiseBurst(sr, R, 0.3, 0.02, 0.09), 'lp', 700, 0.8, sr), 0.35);
    let t = 0.005;
    for (let k = 0, n = 4 + ((R() * 4) | 0); k < n; k++) {
      bubble(o, sr, Math.round(t * sr), (230 + R() * 330) * (1 + 0.3 * h), 1.2 + R(), 0.03 + R() * 0.03, 0.5 + R() * 0.5);
      t += 0.035 + R() * 0.07;
    }
    return finish(o, sr);
  },
  chainB(sr, R, h) {     // lift chain: link seating into a sprocket tooth / bucket hanger (duller)
    const o = new Float32Array(Math.round(0.045 * sr)), s = jit(R, 0.05);
    addMode(o, sr, 1450 * s, 1.0, 0.022); addMode(o, sr, 920 * s, 0.6, 0.025);
    addMode(o, sr, 2650 * s, 0.35, 0.012); addMode(o, sr, 180 * s, 0.4, 0.02);
    mixInto(o, biquad(noiseBurst(sr, R, 0.006, 0.0002, 0.001), 'lp', 3000, 0.7, sr), 0.8);
    return finish(o, sr, 0.5 + 0.5 * R(), 2);
  },
};

/** A resonating air bubble (Minnaert): a sine whose pitch rises as it shrinks toward the surface. */
function bubble(out, sr, s0, f0, rise, tau, amp) {
  const n = Math.min(out.length - s0, Math.round(tau * 7 * sr));
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / sr, f = f0 * (1 + (rise - 1) * (1 - Math.exp(-t / (tau * 1.5))));
    ph += TAU * f / sr;
    out[s0 + i] += amp * Math.sin(ph) * Math.exp(-t / tau) * Math.min(1, i / (0.0008 * sr));
  }
}

const MECH_KINDS = ['clack', 'click', 'clunk', 'cup', 'thud', 'tick', 'splash', 'gurgle'];
const MECH_VARIANTS = 4;

/** Build every precomputed buffer. Returns { mallet, metal, ..., clack: [[soft…],[hard…]], chainA: […], white, … } */
function buildBanks(ctx) {
  const sr = ctx.sampleRate, B = {};
  let seed = 1;
  for (const k of ['mallet', 'metal', 'tine', 'stick', 'beater', 'tink']) B[k] = toBuffer(ctx, GEN[k](sr, mulberry(seed++ * 101)));
  for (const k of MECH_KINDS) {
    // Equal energy for every variant & hardness of a kind: loudness is set by LEVEL × velocity curve only
    // (peak-normalized variants differ by up to 4 dB in energy when a sharp contact spike sets the peak).
    const sets = [0, 1].map((h) => Array.from({ length: MECH_VARIANTS }, (_, i) => GEN[k](sr, mulberry(1000 * (seed++) + i), h)));
    const all = sets.flat(), en = all.map((a) => { let e = 0; for (let i = 0; i < a.length; i++) e += a[i] * a[i]; return e; });
    const mean = en.reduce((a, b) => a + b, 0) / en.length;
    all.forEach((a, j) => { const g = Math.sqrt(mean / en[j]); for (let i = 0; i < a.length; i++) a[i] *= g; });
    B[k] = sets.map((set) => set.map((a) => toBuffer(ctx, a)));
  }
  for (const k of ['chainA', 'chainB']) B[k] = Array.from({ length: 4 }, (_, i) => toBuffer(ctx, GEN[k](sr, mulberry(777 * (seed++) + i), 1)));
  // Shared white noise (2 s mono) for rolling voices / breath; decorrelated stereo noise for leaves.
  const R = mulberry(99), n = Math.round(sr * 2), w = new Float32Array(n);
  for (let i = 0; i < n; i++) w[i] = R() * 2 - 1;
  B.white = toBuffer(ctx, w);
  return B;
}

/** Periodic waves shared by continuous voices. */
function buildWaves(ctx) {
  const mk = (amps) => {
    const re = new Float32Array(amps.length + 1), im = new Float32Array(amps.length + 1);
    amps.forEach((a, i) => { im[i + 1] = a; });
    return ctx.createPeriodicWave(re, im);
  };
  return {
    // funnel "whirr": sawtooth-like, slightly softened (1/n^0.9), 64 harmonics
    buzz: mk(Array.from({ length: 64 }, (_, i) => Math.pow(i + 1, -0.9))),
    // induction motor hum at the rotor fundamental + mains-related harmonics
    motor: mk([1, 0.7, 0.45, 0.55, 0.2, 0.28, 0.1, 0.14, 0.06, 0.05, 0.03, 0.03]),
  };
}

/* =============================================================================================
 * Instruments. Each is (engine, params, startTime, velocity) → schedules one voice group.
 * LEVEL = linear amplitude at velocity 1 before distance attenuation. Calibrated by measurement with LAImax
 * (A-weighted, 35 ms 'impulse' time weighting — the standard loudness proxy for impulsive sounds): mechanical
 * noises sit ≈ −14…−18 dB under a marimba note at equal distance & velocity.
 * =========================================================================================== */
const LEVEL = {
  marimba: 0.30, bell: 0.16, glock: 0.15, chime: 0.14, glass: 0.13, gong: 0.34, drum: 0.40, whistle: 0.05,
  clack: 0.18, click: 0.30, clunk: 0.16, cup: 0.20, thud: 0.325, tick: 0.17, splash: 0.34, gurgle: 0.15,
};
// velocity → amplitude exponent (clicks are strongly velocity dependent: soft queue taps vs. hard hits)
const VEL_EXP = { clack: 1.5, click: 2.2, clunk: 1.6, cup: 1.5, thud: 1.4, tick: 1.4, splash: 1.3, gurgle: 1.1 };

// Church-bell partials relative to the strike pitch (= prime; nominal = 2×): [ratio, amp, T60 factor, doublet split Hz]
const BELL = [
  [0.5, 0.42, 1.00, 0.6],   // hum
  [1.0, 0.42, 0.80, 1.1],   // prime (strike note)
  [1.19, 0.50, 0.68, 0],    // tierce (minor third)
  [1.5, 0.20, 0.54, 0],     // quint
  [2.0, 0.85, 0.50, 1.8],   // nominal
  [2.51, 0.30, 0.34, 0],    // upper major third
  [2.66, 0.20, 0.30, 0],    // upper fourth
  [3.01, 0.24, 0.26, 0],    // twelfth
  [4.03, 0.14, 0.18, 0],    // double octave
  [5.34, 0.07, 0.11, 0],
];
// Tubular chime: free-free tube modes 2..8 scaled so that mode 4 = 2× the (virtual) strike pitch.
const CHIME = [
  [0.617, 0.07, 1.0, 0], [1.21, 0.30, 1.0, 0], [2.0, 0.85, 0.9, 1.2], [2.99, 0.75, 0.72, 1.5],
  [4.17, 0.50, 0.55, 0], [5.55, 0.28, 0.42, 0], [7.13, 0.14, 0.3, 0],
];
// Goblet with water: shell modes n = 2, 3, 4, 5 (≈ n² spacing); the lowest is a doublet from the
// glass's slight asymmetry, so it beats slowly as it rings.
const GLASS = [[1.0, 1.0, 1.0, 1.4], [2.34, 0.26, 0.42, 0], [4.3, 0.11, 0.2, 0], [6.7, 0.045, 0.11, 0]];
// Tam-tam low modes: [ratio, amp, T60 factor]
const GONG = [[1, 1.0, 1.0], [1.46, 0.55, 0.85], [1.97, 0.45, 0.8], [2.43, 0.35, 0.7], [2.94, 0.28, 0.6],
  [3.51, 0.22, 0.55], [4.18, 0.16, 0.45], [4.96, 0.12, 0.4]];
// Tuned membrane (timpani-like, air-loaded → near-harmonic): [ratio, amp, T60 factor]
const DRUM = [[1, 1.0, 1.0], [1.5, 0.42, 0.62], [1.99, 0.26, 0.48], [2.44, 0.16, 0.36], [2.89, 0.09, 0.28]];

/**
 * Partial lists shared by the oscillator path and the pre-rendered tone cache:
 * P = [[freq, amp, T60, layer]], layer 0 = body (velocity-independent), 1 = bright (scaled by mallet hardness).
 * Split (doublet) modes: the stronger component sits exactly on the partial, a weaker twin just above → slow beating.
 */
function splitModes(P, f, table, T, hiFrom) {
  const sc = Math.sqrt(f / 294);
  for (const [r, a, tf, split] of table) {
    const L = r > hiFrom ? 1 : 0;
    if (split) P.push([f * r, a * 0.7, T * tf, L], [f * r + split * sc, a * 0.3, T * tf * 0.92, L]);
    else P.push([f * r, a, T * tf, L]);
  }
  return P;
}
const TONE_SPEC = {
  bell(f) {
    const T = clamp(6.2 * Math.pow(294 / f, 0.38), 2.4, 7), P = splitModes([], f, BELL, T, 2.2);
    for (const [r, a, tt] of [[6.83, 0.08, 0.07], [8.37, 0.055, 0.05], [10.9, 0.04, 0.035]]) P.push([f * r, a, tt, 1]); // clangy strike
    return { P, att: 0.0012, T };
  },
  chime(f) {
    const T = clamp(5.5 * Math.pow(294 / f, 0.35), 2.8, 6.5);
    return { P: splitModes([], f, CHIME, T, 3), att: 0.0012, T };
  },
  glock(f) {
    const k = clamp((69 + 12 * Math.log2(f / 440) - 74) / 31, 0, 1), T = lerp(2.0, 1.3, k);
    return { P: [[f, 1, T, 0], [f * 2.76, 0.28, T * 0.28, 1], [f * 5.4, 0.1, T * 0.09, 1], [f * 8.93, 0.04, T * 0.04, 1]], att: 0.0006, T };
  },
  glass(f) {
    const T = clamp(2.6 * Math.pow(1000 / f, 0.3), 1.6, 3.2);
    return { P: splitModes([], f, GLASS, T, 1.5), att: 0.0008, T };
  },
};

/** Render a TONE_SPEC into [body, bright] AudioBuffers (body at half rate when its partials allow). */
function renderTone(ctx, spec) {
  const out = [];
  for (const L of [0, 1]) {
    const full = ctx.sampleRate, P0 = spec.P.filter((q) => q[3] === L);
    if (!P0.length) { out.push(null); continue; }
    const sr = L === 0 && full >= 44100 && Math.max(...P0.map((q) => q[0])) < full * 0.09 ? full / 2 : full;
    const P = P0.filter((q) => q[0] < sr * 0.45);
    if (!P.length) { out.push(null); continue; }
    const len = Math.ceil((spec.att + Math.max(...P.map((q) => q[2])) * 0.9) * sr), o = new Float32Array(len); // to ≈ −54 dB
    for (const [f, a, t60] of P) addMode(o, sr, f, a, t60);
    const na = Math.max(1, Math.round(spec.att * sr));
    for (let i = 0; i < na; i++) o[i] *= i / na;
    const nf = Math.min(len, Math.round(0.005 * sr));
    for (let i = 0; i < nf; i++) o[len - 1 - i] *= i / nf;
    const b = ctx.createBuffer(1, len, sr); b.getChannelData(0).set(o); out.push(b);
  }
  return out;
}

const TONE_RANGE = { bell: [62, 93], chime: [62, 86], glock: [74, 105], glass: [81, 100] };
const PENTA = new Set([2, 4, 6, 9, 11]);               // D E F# A B (pitch classes)

/** Same partials rendered natively in OfflineAudioContexts (off the main thread). Resolves [body, bright]. */
function renderToneNative(fullRate, spec) {
  const OAC = typeof OfflineAudioContext !== 'undefined' ? OfflineAudioContext
    : typeof webkitOfflineAudioContext !== 'undefined' ? webkitOfflineAudioContext : null; // eslint-disable-line no-undef
  if (!OAC) return Promise.reject(new Error('no OfflineAudioContext'));
  try { return renderToneNativeLayers(OAC, fullRate, spec); } catch (err) { return Promise.reject(err); } // e.g. old WebKit rejecting 24 kHz
}
function renderToneNativeLayers(OAC, fullRate, spec) {
  return Promise.all([0, 1].map((L) => {
    const P0 = spec.P.filter((q) => q[3] === L);
    if (!P0.length) return null;
    const sr = L === 0 && fullRate >= 44100 && Math.max(...P0.map((q) => q[0])) < fullRate * 0.09 ? fullRate / 2 : fullRate;
    const P = P0.filter((q) => q[0] < sr * 0.45);
    if (!P.length) return null;
    const dur = spec.att + Math.max(...P.map((q) => q[2])) * 0.9, oc = new OAC(1, Math.ceil(dur * sr), sr);
    for (const [f, a, t60] of P) {
      const o = oc.createOscillator(), g = oc.createGain();
      o.frequency.value = f; g.gain.value = 0;
      g.gain.setValueAtTime(0, 0); g.gain.linearRampToValueAtTime(a, spec.att); g.gain.setTargetAtTime(0, spec.att, t60 / LN1000);
      o.connect(g); g.connect(oc.destination); o.start(0);
    }
    return new Promise((res, rej) => {
      let done = false;
      const fin_ = (buf) => {
        if (done) return; done = true;
        const d = buf.getChannelData(0), nf = Math.min(d.length, Math.round(0.005 * sr));
        for (let i = 0; i < nf; i++) d[d.length - 1 - i] *= i / nf;
        res(buf);
      };
      oc.oncomplete = (ev) => fin_(ev.renderedBuffer);
      const pr = oc.startRendering();
      if (pr && pr.then) pr.then(fin_, rej);
    });
  }));
}

/** Bell / chime / glock voice: cached pre-rendered layers when available, otherwise live oscillator partials. */
function modal(e, kind, p, t, m, amp, bright) {
  const f = midiHz(m), tone = e._tone(kind, m), spec = tone ? null : TONE_SPEC[kind](f);
  const v = e._voice(p, t, 'inst', amp, (tone ? tone.T : spec.T) * 0.5 / LN1000);
  if (!v) return null;
  if (tone) {
    const rate = f / tone.f0;
    if (tone.body) e._play(v, tone.body, t, rate, 1);
    if (tone.bright) e._play(v, tone.bright, t, rate, bright);
  } else for (const [fr, a, t60, L] of spec.P) e._osc(v, fr, L ? a * bright : a, t, spec.att, t60);
  return v;
}

const INSTRUMENTS = {
  marimba(e, p, t, vel) {
    const m = clamp(fin(p.midi, 69), 40, 100), f = midiHz(m), k = clamp((m - 50) / 36, 0, 1);
    const T = 1.6 * Math.pow(0.45 / 1.6, k);        // fundamental T60: 1.6 s (low) → 0.45 s (high)
    const b = 0.35 + 0.65 * vel;                    // mallet hardness → overtone brightness
    const v = e._voice(p, t, 'inst', LEVEL.marimba * Math.pow(vel, 1.5), T / LN1000);
    if (!v) return;
    // Fundamental: 5 ms bloom, quick settle as bar energy couples into the tube, then the long tail.
    const o = e._osc(v, f, 1, t, 0.005, T, 'sine', true), g = v.nodes[v.nodes.length - 1].gain;
    g.setValueAtTime(0, t); g.linearRampToValueAtTime(1, t + 0.005);
    g.setTargetAtTime(0.72, t + 0.005, 0.03); g.setTargetAtTime(0, t + 0.06, T / LN1000);
    e._stopAt(v, o, t + 0.06 + T * 1.05);
    // 2nd bar mode, tuned ≈ 4:1 (upper bars drift flat), then the ≈10:1 third mode (fast).
    const f2 = f * (3.99 - 0.08 * k);
    e._osc(v, f2, 0.26 * b * Math.min(1, 4500 / f2), t, 0.0015, T * 0.32);
    e._osc(v, f * (9.9 - 0.6 * k), 0.08 * b * b, t, 0.001, Math.min(0.12, T * 0.08));
    e._play(v, e._b.mallet, t, clamp(f / 330, 0.55, 2.4) * (0.92 + 0.16 * vel), 0.3 * b);
  },

  bell(e, p, t, vel) {                              // strike pitch = MIDI note (prime); nominal an octave up
    const m = clamp(fin(p.midi, 74), 48, 100), b = 0.3 + 0.7 * vel;
    const v = modal(e, 'bell', p, t, m, LEVEL.bell * Math.pow(vel, 1.4), b);
    if (v) e._play(v, e._b.metal, t, clamp(midiHz(m) / 700, 0.6, 1.8), 0.28 * b * b);
  },

  glock(e, p, t, vel) {
    const m = clamp(fin(p.midi, 88), 60, 110), b = 0.35 + 0.65 * vel;
    const v = modal(e, 'glock', p, t, m, LEVEL.glock * Math.pow(vel, 1.4), b);
    if (v) e._play(v, e._b.tine, t, clamp(midiHz(m) / 1500, 0.7, 1.6), 0.22 * b * b);
  },

  glass(e, p, t, vel) {                             // a tuned water glass, struck on the rim
    const m = clamp(fin(p.midi, 88), 70, 105), b = 0.35 + 0.65 * vel;
    const v = modal(e, 'glass', p, t, m, LEVEL.glass * Math.pow(vel, 1.4), b);
    if (v) e._play(v, e._b.tink, t, clamp(midiHz(m) / 1200, 0.8, 1.5), 0.2 * b * b);
  },

  chime(e, p, t, vel) {                             // perceived (virtual) pitch = MIDI note
    const m = clamp(fin(p.midi, 74), 50, 96), b = 0.35 + 0.65 * vel;
    const v = modal(e, 'chime', p, t, m, LEVEL.chime * Math.pow(vel, 1.4), b);
    if (v) e._play(v, e._b.metal, t, clamp(midiHz(m) / 500, 0.8, 2.2), 0.22 * b * b);
  },

  gong(e, p, t, vel) {
    const m = clamp(fin(p.midi, 40), 28, 55), f = midiHz(m), T = 8.5;
    const v = e._voice(p, t, 'inst', LEVEL.gong * Math.pow(vel, 1.2), 2.5);
    if (!v) return;
    for (const [r, a, tf] of GONG) {                // dark strike, modes settle slightly flat (nonlinear)
      const o = e._osc(v, f * r * 1.012, a * (r < 2 ? 1 : 0.5 + 0.5 * vel), t, 0.004, T * tf);
      if (o) o.frequency.setTargetAtTime(f * r, t, 0.25);
    }
    e._play(v, e._b.beater, t, 0.8 + 0.4 * vel, 0.6 * (0.5 + 0.5 * vel));
    // Bloom: dense shimmer swells ~0.5–1 s after the strike as energy cascades upward, then a long wash.
    const c = e._ctx, buf = e._shimmer(), lp = c.createBiquadFilter(), g = c.createGain();
    lp.type = 'lowpass'; lp.Q.value = 0.9;
    lp.frequency.setValueAtTime(500, t);
    lp.frequency.setTargetAtTime(2200 + 7000 * vel, t + 0.05, 0.35);
    lp.frequency.setTargetAtTime(1400 + 1500 * vel, t + 1.4, 2.5);
    const pk = 0.05 + 0.55 * Math.pow(vel, 1.6);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(pk * 0.15, t + 0.02);
    g.gain.setTargetAtTime(pk, t + 0.03, 0.28);
    g.gain.setTargetAtTime(0, t + 0.85, 1.6);
    const end = t + 13.6, rate = f / midiHz(40);
    for (const [rt, off] of [[1, 0], [1.0137, 1.3]]) {
      const s = c.createBufferSource();
      s.buffer = buf; s.loop = true; s.playbackRate.value = rate * rt;
      s.connect(lp); s.start(t, off); s.stop(end);
      v.nodes.push(s); e._track(v, s, end);
    }
    lp.connect(g); g.connect(v.vg); v.nodes.push(lp, g);
  },

  drum(e, p, t, vel) {
    const m = clamp(fin(p.midi, 45), 30, 64), f = midiHz(m), k = clamp((m - 38) / 19, 0, 1);
    const T = lerp(1.15, 0.55, k), b = 0.35 + 0.65 * vel;
    const v = e._voice(p, t, 'inst', LEVEL.drum * Math.pow(vel, 1.3), T * 0.6 / LN1000);
    if (!v) return;
    const glide = 1.05 + 0.05 * vel;                // strike tension → starts sharp, settles in ~0.1 s
    for (const [r, a, tf] of DRUM) {
      const o = e._osc(v, f * r * glide, a * (r > 1 ? b : 1), t, 0.002, T * tf);
      if (o) o.frequency.setTargetAtTime(f * r, t + 0.002, 0.045);
    }
    const o = e._osc(v, f * 0.62 * glide, 0.35 * b, t, 0.002, 0.12);   // heavily damped (0,1)-ish thump
    if (o) o.frequency.setTargetAtTime(f * 0.62, t + 0.002, 0.045);
    e._play(v, e._b.stick, t, 0.8 + 0.4 * vel, 0.45 * b);
  },

  whistle(e, p, t, vel) {                           // little mechanical bird whistle: two upward chirps
    const base = p.midi != null && Number.isFinite(p.midi) ? midiHz(clamp(p.midi, 70, 100)) : rr(2000, 2600);
    const v = e._voice(p, t, 'inst', LEVEL.whistle * Math.pow(vel, 1.2), 0.1);
    if (!v) return;
    const c = e._ctx, o = c.createOscillator(), g = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
    lfo.frequency.value = rr(22, 32); lg.gain.value = base * 0.025;
    lfo.connect(lg); lg.connect(o.frequency);
    g.gain.value = 0;
    const d1 = rr(0.08, 0.11), t2 = t + d1 + rr(0.035, 0.06), d2 = rr(0.1, 0.14);
    for (const [ts, d, f0, f1] of [[t, d1, base, base * 1.5], [t2, d2, base * 1.08, base * 1.75]]) {
      o.frequency.setValueAtTime(f0, ts); o.frequency.exponentialRampToValueAtTime(f1, ts + d);
      g.gain.setValueAtTime(0, ts); g.gain.linearRampToValueAtTime(1, ts + 0.012);
      g.gain.setValueAtTime(0.9, ts + d - 0.022); g.gain.linearRampToValueAtTime(0, ts + d);
    }
    const n = c.createBufferSource(), bp = c.createBiquadFilter(), ng = c.createGain();
    n.buffer = e._b.white; bp.type = 'bandpass'; bp.frequency.value = base * 1.4; bp.Q.value = 2.5; ng.gain.value = 0.35;
    n.connect(bp); bp.connect(ng); ng.connect(g); o.connect(g); g.connect(v.vg);
    const end = t2 + d2 + 0.02;
    o.start(t); lfo.start(t); n.start(t, rr(0, 1)); o.stop(end); lfo.stop(end); n.stop(end);
    v.nodes.push(o, g, lfo, lg, n, bp, ng); e._track(v, o, end);
  },
};

// Mechanical one-shots: one BufferSource each (variant = consistent timbre per machine part).
for (const kind of MECH_KINDS) {
  INSTRUMENTS[kind] = (e, p, t, vel) => {
    const set = e._b[kind][vel > 0.55 ? 1 : 0];
    const hasVar = typeof p.variant === 'number' && Number.isFinite(p.variant);
    const idx = hasVar ? ((Math.floor(p.variant) % set.length) + set.length) % set.length : (Math.random() * set.length) | 0;
    const v = e._voice(p, t, 'mech', LEVEL[kind] * Math.pow(vel, VEL_EXP[kind]), 0.03);
    if (!v) return;
    const rate = (0.97 + 0.06 * vel) * (1 + (Math.random() - 0.5) * (hasVar ? 0.03 : 0.07));
    e._play(v, set[idx], t, rate, 1);
  };
}

/* =============================================================================================
 * Continuous voices
 * =========================================================================================== */
const NOISE_RMS = 0.5774;                               // uniform white noise ±1
/** Gain that makes white noise through a 2nd-order low-pass at fc come out at `rms`. */
const lpNorm = (rms, fc, sr) => rms / (NOISE_RMS * Math.sqrt(Math.min(1, 1.57 * fc / (sr / 2))));

function setP(param, v, now, tau) { param.setTargetAtTime(v, now, tau); }
function moveParam(prm, val, now, jump) {
  if (jump) { prm.cancelScheduledValues(now); prm.setValueAtTime(val, now); } else prm.setTargetAtTime(val, now, 0.025);
}
function movePanner(pn, x, y, z, now, jump) {
  if (pn.positionX) { moveParam(pn.positionX, x, now, jump); moveParam(pn.positionY, y, now, jump); moveParam(pn.positionZ, z, now, jump); }
  else pn.setPosition(x, y, z);
}

/** One pooled rolling voice: noise rumble (speed → level & brightness), rail "sing", funnel whirr, rotation AM. */
class RollVoice {
  constructor(e, i) {
    const c = e._ctx, now = c.currentTime;
    this.e = e; this.id = null; this.state = 0; this.freeAt = 0;   // state: 0 free, 1 active, 2 releasing
    this.last = new Float64Array(12).fill(NaN);
    this.src = c.createBufferSource(); this.src.buffer = e._b.white; this.src.loop = true;
    this.lp = c.createBiquadFilter(); this.lp.type = 'lowpass'; this.lp.Q.value = 0.6; this.lp.frequency.value = 300;
    this.rg = c.createGain(); this.rg.gain.value = 0;
    this.bp = c.createBiquadFilter(); this.bp.type = 'bandpass'; this.bp.Q.value = 28; this.bp.frequency.value = 1650 + i * 310;
    this.sg = c.createGain(); this.sg.gain.value = 0;
    this.fo = c.createOscillator(); this.fo.setPeriodicWave(e._waves.buzz); this.fo.frequency.value = 30;
    this.ff = c.createBiquadFilter(); this.ff.type = 'lowpass'; this.ff.Q.value = 5; this.ff.frequency.value = 400;
    this.fg = c.createGain(); this.fg.gain.value = 0;
    this.am = c.createGain(); this.am.gain.value = 1;
    this.lfo = c.createOscillator(); this.lfo.frequency.value = 5;
    this.lg = c.createGain(); this.lg.gain.value = 0;
    this.out = c.createGain(); this.out.gain.value = 0;
    this.pn = e._panner(e._hrtf, 0, -1000, 0);
    this.src.connect(this.lp); this.lp.connect(this.rg); this.rg.connect(this.am);
    this.src.connect(this.bp); this.bp.connect(this.sg); this.sg.connect(this.am);
    this.fo.connect(this.ff); this.ff.connect(this.fg); this.fg.connect(this.am);
    this.lfo.connect(this.lg); this.lg.connect(this.am.gain);
    this.am.connect(this.out); this.out.connect(this.pn); this.pn.connect(e._bus.roll);
    this.out.connect(e._send.inst[1]);
    this.src.start(now, Math.random() * 1.5); this.fo.start(now); this.lfo.start(now);
  }

  /** Map ball state onto the voice parameters. `jump` = freshly assigned (currently silent) → set instantly. */
  set(b, now, jump) {
    const sr = this.e._ctx.sampleRate, s = clamp(fin(b.speed, 0), 0, 6), sn = clamp(s / 2.5, 0, 1.6);
    let rumble, fc, sing, tone = 0, fHz = 30, ffc = 400, lfoHz, lfoD;
    const rot = s / (Math.PI * 0.05);                    // ≈ ball rotation rate (5 cm ball)
    if (b.surface === 'funnel') {
      const o = clamp(fin(b.orbitHz, 1), 0.2, 20);
      rumble = 0.009 * Math.pow(sn, 0.8); fc = 220 + 1300 * sn; sing = 0.0012 * sn;
      fHz = o * 20; ffc = clamp(fHz * 7, 250, 5000);
      tone = 0.017 * clamp(0.25 + o / 8, 0, 1.3) * clamp(0.45 + sn, 0, 1.2);
      lfoHz = o; lfoD = 0.35;
    } else if (b.surface === 'wood') {
      rumble = 0.0095 * Math.pow(sn, 0.9); fc = 110 + 650 * sn; sing = 0; lfoHz = rot; lfoD = 0.25;
    } else if (b.surface === 'water') {                  // ploughing down the flume's stream: a babbling hiss
      rumble = 0.0075 * Math.pow(sn, 0.8); fc = 900 + 2600 * sn; sing = 0;
      lfoHz = (7 + 16 * sn) * (0.6 + 0.8 * Math.random()); lfoD = 0.6;
    } else if (b.surface === 'brush') {                  // pushing through the brush brake: a dry bristly hiss
      rumble = 0.011 * Math.pow(sn, 0.7); fc = 2600 + 3200 * sn; sing = 0; lfoHz = 25 + 40 * sn; lfoD = 0.45;
    } else if (b.surface === 'pool') {                   // rolling under water: dull and muffled
      rumble = 0.004 * Math.pow(sn, 0.8); fc = 140 + 380 * sn; sing = 0; lfoHz = rot * 0.5; lfoD = 0.3;
    } else {                                             // 'rail' (default)
      rumble = 0.0082 * Math.pow(sn, 0.9); fc = 160 + 1400 * Math.pow(sn, 1.1); sing = 0.0016 * Math.pow(sn, 1.2);
      lfoHz = rot; lfoD = 0.18;
    }
    const bpN = NOISE_RMS * Math.sqrt(1.57 * this.bp.frequency.value / 28 / (sr / 2));
    const tau = jump ? 0.001 : 0.05, ft = jump ? 0.001 : 0.06;
    this._s(0, this.rg.gain, lpNorm(rumble, fc, sr), now, tau, jump);
    this._s(1, this.lp.frequency, fc, now, tau, jump);
    this._s(2, this.sg.gain, sing / bpN, now, tau, jump);
    this._s(3, this.fg.gain, tone, now, jump ? 0.001 : 0.08, jump);
    this._s(4, this.fo.frequency, fHz, now, ft, jump);
    this._s(5, this.ff.frequency, ffc, now, ft, jump);
    this._s(6, this.lfo.frequency, clamp(lfoHz, 0.3, 45), now, 0.1, jump);
    this._s(7, this.lg.gain, lfoD, now, 0.1, jump);
    const x = fin(b.x, 0), y = fin(b.y, 0), z = fin(b.z, 0), L = this.last;
    if (jump || Math.abs(x - L[8]) + Math.abs(y - L[9]) + Math.abs(z - L[10]) > 0.002) { L[8] = x; L[9] = y; L[10] = z; movePanner(this.pn, x, y, z, now, jump); }
  }
  /** setTargetAtTime only when the value moved by > 0.5 % (keeps per-frame automation traffic low). */
  _s(i, param, v, now, tau, jump) {
    const l = this.last[i];
    if (!jump && Math.abs(v - l) <= 0.005 * Math.abs(l) + 1e-6) return;
    this.last[i] = v; param.setTargetAtTime(v, now, tau);
  }
}

const bySc = (a, b) => b.sc - a.sc;
class RollingPool {
  constructor(e) {
    this.e = e;
    this.voices = Array.from({ length: ROLL_VOICES }, (_, i) => new RollVoice(e, i));
    this.byId = new Map(); this.cand = []; this.slots = []; this.keep = new Set();
  }
  update(balls, now) {
    const L = this.e._L, cand = this.cand, keep = this.keep;
    cand.length = 0; keep.clear();
    if (Array.isArray(balls)) {
      for (let i = 0; i < balls.length; i++) {
        const b = balls[i];
        if (!b || b.surface === 'air' || !(b.speed > 0.03)) continue;
        const dx = fin(b.x, 0) - L.x, dy = fin(b.y, 0) - L.y, dz = fin(b.z, 0) - L.z;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d > MAX_DIST) continue;
        let loud = Math.pow(Math.min(b.speed, 5), 0.9);
        if (b.surface === 'funnel') loud *= 1.3 + 0.1 * clamp(fin(b.orbitHz, 0), 0, 12);
        let sc = loud * distGain(d);
        if (this.byId.has(b.id)) sc *= 1.6;               // hysteresis: incumbents keep their voice
        if (sc < 0.004) continue;
        const slot = this.slots[cand.length] || (this.slots[cand.length] = { b: null, sc: 0 });
        slot.b = b; slot.sc = sc; cand.push(slot);
      }
    }
    if (cand.length > ROLL_VOICES) cand.sort(bySc);
    const n = Math.min(ROLL_VOICES, cand.length);
    for (let i = 0; i < n; i++) keep.add(cand[i].b.id);
    // release voices whose ball dropped out; recycle fully faded voices
    for (const v of this.voices) {
      if (v.state === 1 && !keep.has(v.id)) {
        v.state = 2; v.freeAt = now + 0.3; this.byId.delete(v.id);
        v.out.gain.setTargetAtTime(0, now, 0.05);
      } else if (v.state === 2 && now >= v.freeAt) { v.state = 0; v.id = null; }
    }
    for (let i = 0; i < n; i++) {
      const b = cand[i].b;
      let v = this.byId.get(b.id);
      if (v) { v.set(b, now, false); continue; }
      v = this.voices.find((x) => x.state === 0);
      if (!v) continue;                                   // pool busy fading; next frame
      v.state = 1; v.id = b.id; this.byId.set(b.id, v);
      v.set(b, now, true);                                // silent → jump params/position, then fade in
      v.out.gain.cancelScheduledValues(now); v.out.gain.setValueAtTime(0, now);
      v.out.gain.setTargetAtTime(1, now + 0.005, 0.06);
    }
  }
  active() { return this.voices.filter((v) => v.state === 1).length; }
}

/** Bucket-chain elevator: chain clatter (scheduled link clicks), motor hum, gear whine. */
class LiftVoice {
  constructor(e) {
    const c = e._ctx, now = c.currentTime;
    this.e = e; this.run = false; this.next = 0; this.alt = 0; this.mf = 48; this.px = NaN; this.py = NaN; this.pz = NaN;
    this.out = c.createGain(); this.out.gain.value = 0;
    this.pn = e._panner(e._hrtf, 0, 0, 0);
    this.out.connect(this.pn); this.pn.connect(e._bus.lift); this.out.connect(e._send.inst[1]);
    this.motor = c.createOscillator(); this.motor.setPeriodicWave(e._waves.motor); this.motor.frequency.value = 48;
    this.mg = c.createGain(); this.mg.gain.value = 0.015;
    this.whine = c.createOscillator(); this.whine.frequency.value = 48 * 13.7;
    this.wg = c.createGain(); this.wg.gain.value = 0.0014;
    this.wl = c.createOscillator(); this.wl.frequency.value = 0.7;
    this.wlg = c.createGain(); this.wlg.gain.value = 4;
    this.chain = c.createGain(); this.chain.gain.value = 0.055;
    this.motor.connect(this.mg); this.mg.connect(this.out);
    this.wl.connect(this.wlg); this.wlg.connect(this.whine.frequency);
    this.whine.connect(this.wg); this.wg.connect(this.out);
    this.chain.connect(this.out);
    this.motor.start(now); this.whine.start(now); this.wl.start(now);
  }
  update(p, now) {
    const e = this.e, c = e._ctx, sp = clamp(fin(p.speed, 0), 0, 3), run = !!p.running && sp > 0.001;
    const x = fin(p.x, 0), y = fin(p.y, 0), z = fin(p.z, 0);
    if (Math.abs(x - this.px) + Math.abs(y - this.py) + Math.abs(z - this.pz) > 0.002 || this.px !== this.px) {
      this.px = x; this.py = y; this.pz = z; movePanner(this.pn, x, y, z, now, false);
    }
    if (run !== this.run) {
      this.run = run;
      this.out.gain.setTargetAtTime(run ? 1 : 0, now, run ? 0.12 : 0.35);
      if (run) this.next = Math.max(this.next, now + 0.03);
    }
    const mf = run ? 48 * (0.93 + 0.07 * clamp(sp / 0.3, 0, 1.5)) : 30;  // spins down when stopped
    if (Math.abs(mf - this.mf) > 0.05) {
      this.mf = mf;
      setP(this.motor.frequency, mf, now, run ? 0.3 : 0.6);
      setP(this.whine.frequency, mf * 13.7, now, run ? 0.3 : 0.6);
    }
    if (!run) return;
    const iv = 0.025 / Math.max(sp, 0.004), horizon = now + 0.15;
    if (this.next < now + 0.012) this.next = now + 0.012;
    for (let k = 0; this.next < horizon && k < 24; k++) {
      const bank = this.alt ? e._b.chainB : e._b.chainA, s = c.createBufferSource();
      s.buffer = bank[(Math.random() * bank.length) | 0];
      s.playbackRate.value = rr(0.95, 1.05);
      s.connect(this.chain); s.start(this.next);
      s.onended = () => s.disconnect();
      this.alt ^= 1;
      this.next += iv * rr(0.88, 1.12);
    }
  }
}

/** Running water at a fixed place: the spout's jet, the flume's stream, the whirlpool. Filtered noise
 *  with a slowly wandering level, and (for the pool) the odd bubble glugging up. */
const WATER_KIND = {
  jet: { f: 2600, q: 0.7, lp: 650, lpMix: 0.5, level: 0.02, wander: 0.25 },
  stream: { f: 1500, q: 0.45, lp: 380, lpMix: 0.6, level: 0.016, wander: 0.35 },
  pool: { f: 950, q: 1.1, lp: 300, lpMix: 0.3, level: 0.011, wander: 0.5, bubbles: true },
};
class WaterVoice {
  constructor(e, kind) {
    const c = e._ctx, now = c.currentTime, K = (this.K = WATER_KIND[kind] || WATER_KIND.stream);
    this.e = e; this.kind = kind; this.px = NaN; this.py = NaN; this.pz = NaN; this.nextWander = 0; this.nextBubble = now + 0.5;
    this.out = c.createGain(); this.out.gain.value = 0;
    this.pn = e._panner(e._hrtf, 0, -1000, 0);
    this.out.connect(this.pn); this.pn.connect(e._bus.water); this.out.connect(e._send.inst[2]);
    this.src = c.createBufferSource(); this.src.buffer = e._b.white; this.src.loop = true;
    const bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = K.f; bp.Q.value = K.q;
    const lp = c.createBiquadFilter(); lp.type = 'lowpass'; lp.frequency.value = K.lp; lp.Q.value = 0.6;
    const lg = c.createGain(); lg.gain.value = K.lpMix;
    this.wg = c.createGain(); this.wg.gain.value = 1;
    this.src.connect(bp); bp.connect(this.wg); this.src.connect(lp); lp.connect(lg); lg.connect(this.wg);
    this.wg.connect(this.out);
    this.src.start(now, Math.random() * 1.8);
  }
  update(p, now) {
    const x = fin(p.x, 0), y = fin(p.y, 0), z = fin(p.z, 0);
    if (Math.abs(x - this.px) + Math.abs(y - this.py) + Math.abs(z - this.pz) > 0.002 || this.px !== this.px) {
      const jump = this.px !== this.px;
      this.px = x; this.py = y; this.pz = z; movePanner(this.pn, x, y, z, now, jump);
    }
    const on = p.running !== false;
    setP(this.out.gain, on ? this.K.level * clamp(fin(p.level, 1), 0, 2) : 0, now, on ? 0.4 : 0.8);
    if (now >= this.nextWander) {
      this.nextWander = now + rr(0.15, 0.6);
      setP(this.wg.gain, 1 + this.K.wander * (Math.random() * 2 - 1), now, rr(0.08, 0.3));
    }
    if (this.K.bubbles && on && now >= this.nextBubble) {
      this.nextBubble = now + rr(0.25, 1.4);
      const set = this.e._b.gurgle[0], s = this.e._ctx.createBufferSource(), g = this.e._ctx.createGain();
      s.buffer = set[(Math.random() * set.length) | 0]; s.playbackRate.value = rr(0.8, 1.5);
      g.gain.value = rr(0.08, 0.25);
      s.connect(g); g.connect(this.out); s.start(now + 0.02);
      s.onended = () => { s.disconnect(); g.disconnect(); };
    }
  }
}

/* =============================================================================================
 * Ambience (non-positional stereo, subtle): day songbirds + leaf rustle; night crickets + tree frog.
 * =========================================================================================== */
/** Cricket loop: 4.5 kHz carrier gated into pulses. trill=false → chirps of 4 pulses ~2.4×/s; true → long trills. */
function makeCricket(ctx, trill, seed) {
  const sr = ctx.sampleRate, R = mulberry(seed), dur = trill ? 3.2 : 2.52, n = Math.round(dur * sr);
  const o = new Float32Array(n), plen = trill ? 0.014 : 0.02;
  const pulse = (t0, fc) => {
    const s0 = Math.round(t0 * sr), m = Math.round(plen * sr), w = TAU * fc / sr;
    for (let i = 0; i < m && s0 + i < n; i++) {
      const env = Math.sin(Math.PI * i / m) ** 2;
      o[s0 + i] += env * (Math.sin(w * i) + 0.12 * Math.sin(2 * w * i));
    }
  };
  if (trill) { for (let t = 0.01; t < 1.7; t += 1 / 45) pulse(t, 4500 * jit(R, 0.006)); }
  else for (let c = 0; c < 6; c++) for (let k = 0; k < 4; k++) pulse(0.01 + c * 0.42 + k / 30, 4500 * jit(R, 0.006));
  return toBuffer(ctx, finish(o, sr, 1, 2));
}

// Bird phrase templates → [[dt, dur, f0, f1, amp], …]
const BIRDS = [
  () => {                                             // warbler: quick varied up/down notes
    const out = [], base = rr(2600, 3800); let dt = 0;
    for (let i = 0, n = 5 + ((Math.random() * 5) | 0); i < n; i++) {
      const d = rr(0.035, 0.075), f0 = base * rr(0.8, 1.3);
      out.push([dt, d, f0, f0 * (Math.random() < 0.5 ? rr(1.15, 1.5) : rr(0.65, 0.85)), rr(0.5, 1)]);
      dt += d + rr(0.02, 0.05);
    }
    return out;
  },
  () => {                                             // "fee-bee" whistle (chickadee-like)
    const f = rr(3600, 4100);
    return [[0, rr(0.25, 0.32), f, f * 0.985, 0.8], [rr(0.36, 0.42), rr(0.25, 0.3), f * 0.84, f * 0.83, 0.7]];
  },
  () => {                                             // trill (junco / finch)
    const n = 10 + ((Math.random() * 14) | 0), rate = rr(14, 20), f0 = rr(4200, 5200), f1 = f0 * rr(0.65, 0.8), out = [];
    for (let i = 0; i < n; i++) out.push([i / rate, 0.6 / rate, f0, f1, 0.6 + 0.4 * Math.sin(Math.PI * (i + 0.5) / n)]);
    return out;
  },
  () => {                                             // "cheer cheer cheer": down-slurred whistles
    const out = [], f = rr(3800, 4400); let dt = 0;
    for (let i = 0, n = 3 + ((Math.random() * 3) | 0); i < n; i++) {
      const d = rr(0.14, 0.2); out.push([dt, d, f, f * rr(0.5, 0.6), 0.9]); dt += d + rr(0.06, 0.1);
    }
    return out;
  },
  () => {                                             // robin-ish carol: rising/falling pairs
    const out = [], f = rr(2300, 2900); let dt = 0;
    for (let i = 0, n = 3 + ((Math.random() * 4) | 0); i < n; i++) {
      const d = rr(0.12, 0.18), up = i % 2 === 0;
      out.push([dt, d, f * (up ? 0.9 : 1.25), f * (up ? 1.22 : 0.95) * rr(0.95, 1.05), rr(0.6, 1)]);
      dt += d + rr(0.06, 0.11);
    }
    return out;
  },
];

const AMB_GAIN = 0.008;                                // birds ≈ −26 dB LAI under a close marimba note (level 1)

class Ambience {
  constructor(e) {
    const c = e._ctx, now = c.currentTime;
    this.e = e; this.level = 0; this.hour = 12; this.dayW = 1; this.nightW = 0;
    this.day = c.createGain(); this.night = c.createGain();
    this.day.gain.value = 0; this.night.gain.value = 0;
    this.day.connect(e._bus.amb); this.night.connect(e._bus.amb);
    // leaf rustle: decorrelated stereo noise → band → gusting gain
    const sr = c.sampleRate, n = Math.round(sr * 3), R = mulberry(31337), l = new Float32Array(n), r = new Float32Array(n);
    for (let i = 0; i < n; i++) { l[i] = R() * 2 - 1; r[i] = R() * 2 - 1; }
    this.leaf = c.createBufferSource(); this.leaf.buffer = toBuffer(c, l, r); this.leaf.loop = true;
    const hp = c.createBiquadFilter(), lp = c.createBiquadFilter();
    hp.type = 'highpass'; hp.frequency.value = 1400; hp.Q.value = 0.5;
    lp.type = 'lowpass'; lp.frequency.value = 7000; lp.Q.value = 0.5;
    this.leafG = c.createGain(); this.leafG.gain.value = 0.2;
    this.leaf.connect(hp); hp.connect(lp); lp.connect(this.leafG); this.leafG.connect(this.day);
    this.leaf.start(now);
    // crickets: 4 looping insects at slightly different rates/pitches, spread across the stereo field
    const chirp = makeCricket(c, false, 5), trill = makeCricket(c, true, 6);
    [-0.8, -0.25, 0.3, 0.85].forEach((pan, i) => {
      const s = c.createBufferSource(), g = c.createGain(), sp = e._stereo(pan + rr(-0.1, 0.1));
      s.buffer = i === 2 ? trill : chirp; s.loop = true; s.playbackRate.value = rr(0.93, 1.07);
      g.gain.value = rr(0.35, 0.8) * (i === 2 ? 0.5 : 1);
      s.connect(g); g.connect(sp); sp.connect(this.night);
      s.start(now, rr(0, 2.4));
    });
    this.nextBird = now + rr(0.5, 2); this.nextFrog = now + rr(3, 8); this.nextGust = now;
    if (!e._offline) this.timer = setInterval(() => this.tick(), 200);
  }

  set(level, hour) {
    const e = this.e, now = e._ctx.currentTime;
    this.level = clamp(fin(level, 0), 0, 1);
    this.hour = ((fin(hour, 12) % 24) + 24) % 24;
    const h = this.hour;
    // overlapping crossfades: crickets start before the birds stop (dusk) and linger into the dawn chorus
    this.dayW = smooth(5.0, 6.5, h) * (1 - smooth(18.5, 20.0, h));
    this.nightW = 1 - smooth(5.5, 7.0, h) * (1 - smooth(18.0, 19.5, h));
    setP(e._bus.amb.gain, AMB_GAIN * Math.pow(this.level, 1.5), now, 0.3);
    setP(this.day.gain, this.dayW, now, 0.5);
    setP(this.night.gain, this.nightW, now, 0.5);
  }

  tick() {
    const e = this.e, c = e._ctx;
    if (!c || this.level <= 0 || (!e._offline && c.state !== 'running')) return;
    const now = c.currentTime, h = this.hour;
    if (now >= this.nextGust) {
      this.leafG.gain.setTargetAtTime(rr(0.08, 0.35), now, rr(0.3, 1.2));
      this.nextGust = now + rr(0.6, 2.5);
    }
    if (this.dayW > 0.03 && now >= this.nextBird) {
      const chorus = 1 + 1.5 * Math.exp(-(((h - 7) / 1.2) ** 2)) + 0.6 * Math.exp(-(((h - 18.5) / 1) ** 2));
      this.bird(now + rr(0.05, 0.3));
      this.nextBird = now + Math.min(12, -Math.log(1 - Math.random() * 0.98) * 3.2 / ((0.25 + this.dayW) * chorus));
    }
    if (this.nightW > 0.1 && now >= this.nextFrog) {
      this.frog(now + 0.1);
      this.nextFrog = now + rr(6, 18) / this.nightW;
    }
  }

  bird(t) {
    const c = this.e._ctx, o = c.createOscillator(), g = c.createGain(), fm = c.createOscillator(), fg = c.createGain();
    const sp = this.e._stereo(rr(-0.9, 0.9)), notes = BIRDS[(Math.random() * BIRDS.length) | 0](), dist = rr(0.3, 1);
    fm.frequency.value = rr(35, 90); fg.gain.value = Math.random() < 0.4 ? rr(60, 220) : 0;
    g.gain.value = 0;
    let end = t;
    for (const [dt, d, f0, f1, a] of notes) {
      const ts = t + dt, te = ts + d, ea = Math.min(0.012, d * 0.3);
      o.frequency.setValueAtTime(f0, ts); o.frequency.exponentialRampToValueAtTime(f1, te);
      g.gain.setValueAtTime(0, ts); g.gain.linearRampToValueAtTime(a * dist, ts + ea);
      g.gain.linearRampToValueAtTime(a * dist * 0.7, te - ea); g.gain.linearRampToValueAtTime(0, te);
      end = te;
    }
    fm.connect(fg); fg.connect(o.frequency); o.connect(g); g.connect(sp); sp.connect(this.day);
    o.start(t); fm.start(t); o.stop(end + 0.05); fm.stop(end + 0.05);
    o.onended = () => { for (const x of [o, g, fm, fg, sp]) x.disconnect(); };
  }

  frog(t) {                                           // tree frog: pulsed nasal "kreck", 1–3 calls
    const c = this.e._ctx, o = c.createOscillator(), am = c.createGain(), lfo = c.createOscillator(), lg = c.createGain();
    const g = c.createGain(), sp = this.e._stereo(rr(-0.8, 0.8)), fc = rr(1500, 2400);
    o.type = 'triangle'; lfo.frequency.value = rr(60, 95); lg.gain.value = 0.5; am.gain.value = 0.5; g.gain.value = 0;
    let ts = t, end = t;
    for (let k = 0, n = 1 + ((Math.random() * 3) | 0); k < n; k++) {
      const d = rr(0.12, 0.2);
      o.frequency.setValueAtTime(fc * 0.97, ts); o.frequency.linearRampToValueAtTime(fc * 1.03, ts + d);
      g.gain.setValueAtTime(0, ts); g.gain.linearRampToValueAtTime(0.8, ts + 0.015);
      g.gain.linearRampToValueAtTime(0.55, ts + d - 0.02); g.gain.linearRampToValueAtTime(0, ts + d);
      end = ts + d; ts += d + rr(0.12, 0.2);
    }
    lfo.connect(lg); lg.connect(am.gain); o.connect(am); am.connect(g); g.connect(sp); sp.connect(this.night);
    o.start(t); lfo.start(t); o.stop(end + 0.05); lfo.stop(end + 0.05);
    o.onended = () => { for (const x of [o, am, lfo, lg, g, sp]) x.disconnect(); };
  }

  dispose() { if (this.timer) clearInterval(this.timer); this.timer = null; }
}

/* =============================================================================================
 * Engine
 * =========================================================================================== */
const REV_K = 1.25;                                    // wet gain at setReverb(1)
const MIX_TRIM = 1.6;                                  // +4 dB into the master chain
const TONE_CACHE_MAX = 8e6;                            // cached tone samples (≤ 32 MB of Float32)
const volCurve = (v) => v * v * v;                     // perceptual (cubic) volume taper
const SEND_BUCKETS = [0.85, 0.6, 0.4, 0.25];           // reverb send by distance: <3 m, <8 m, <20 m, beyond

export class AudioEngine {
  /** @param {{context?: BaseAudioContext, hrtf?: boolean}} opts */
  constructor(opts = {}) {
    this._opts = opts || {};
    this._ctx = this._opts.context || null;
    this._offline = false; this._hrtf = false; this._built = false; this._startP = null;
    this._vol = 0.8; this._muted = false; this._rev = 0.35; this._ambLevel = 0; this._ambHour = 12;
    this._L = { x: 0, y: 0, z: 0, fx: 0, fy: 0, fz: -1, ux: 0, uy: 1, uz: 0 };
    this._Lapplied = null; this._listenerDirty = true;
    this._active = []; this._dying = []; this._lastSweep = 0;
    this._st = { hits: 0, culled: 0, stolen: 0 };
    this._roll = null; this._lift = null; this._amb = null; this._shim = null;
    this._tones = new Map(); this._toneQ = []; this._toneTimer = 0; this._toneSamples = 0; this._toneBusy = false; this._warmed = {};
    this._pump = () => this._pumpTones();
  }

  /* ----------------------------------------------------------------- lifecycle */
  /** Call from a user gesture. Idempotent (later calls just resume a suspended context). */
  async start() {
    if (this._built) { await this.resume(); return; }
    if (!this._startP) this._startP = this._boot().catch((err) => { this._startP = null; throw err; });
    return this._startP;
  }

  async _boot() {
    // Everything before the first `await` runs synchronously inside the caller's user gesture (Safari).
    let c = this._ctx;
    if (!c) {
      const AC = typeof window !== 'undefined' && (window.AudioContext || window.webkitAudioContext);
      if (!AC) throw new Error('Web Audio API not supported');
      try { c = new AC({ latencyHint: 'interactive' }); } catch (_) { c = new AC(); }
      this._ctx = c; this._ownCtx = true;
    }
    const OAC = typeof OfflineAudioContext !== 'undefined' ? OfflineAudioContext : null;
    const WOAC = typeof webkitOfflineAudioContext !== 'undefined' ? webkitOfflineAudioContext : null; // eslint-disable-line no-undef
    this._offline = !!((OAC && c instanceof OAC) || (WOAC && c instanceof WOAC));
    this._hrtf = this._opts.hrtf !== undefined ? !!this._opts.hrtf : !this._offline;
    let resumeP = null;
    if (!this._offline) {
      try { if (navigator.audioSession) navigator.audioSession.type = 'playback'; } catch (_) { /* iOS ringer switch */ }
      if (c.state !== 'running') { try { resumeP = c.resume(); } catch (_) { /* ignore */ } }
      try {                                            // legacy iOS unlock: play one silent sample in the gesture
        const s = c.createBufferSource(); s.buffer = c.createBuffer(1, 1, c.sampleRate); s.connect(c.destination); s.start(0);
      } catch (_) { /* ignore */ }
    }
    this._build();
    if (!this._offline) setTimeout(() => this._shimmer(), 30);   // pre-build the gong texture off the gesture
    if (resumeP) { try { await Promise.race([resumeP, new Promise((r) => setTimeout(r, 2000))]); } catch (_) { /* ignore */ } }
  }

  _build() {
    const c = this._ctx, G = (v) => { const g = c.createGain(); g.gain.value = v; return g; };
    this._nyq = c.sampleRate * 0.47;
    this._b = buildBanks(c); this._waves = buildWaves(c);
    // master: trim → HPF (subsonics) → compressor → soft-clip ceiling (0.94) → volume → mute
    this._mix = G(MIX_TRIM);
    const hp = c.createBiquadFilter(); hp.type = 'highpass'; hp.frequency.value = 28; hp.Q.value = 0.7;
    const comp = c.createDynamicsCompressor();
    comp.threshold.value = -10; comp.knee.value = 10; comp.ratio.value = 3; comp.attack.value = 0.004; comp.release.value = 0.3;
    const pre = G(0.25), clip = c.createWaveShaper();
    clip.curve = softClipCurve(4096, 4); clip.oversample = 'none';   // '2x' would add 2.7 ms latency; the knee is smooth & rarely hit
    this._volG = G(volCurve(this._vol)); this._muteG = G(this._muted ? 0 : 1);
    this._mix.connect(hp); hp.connect(comp); comp.connect(pre); pre.connect(clip);
    clip.connect(this._volG); this._volG.connect(this._muteG); this._muteG.connect(c.destination);
    this._comp = comp;
    this._bus = {};
    for (const k of ['inst', 'mech', 'roll', 'lift', 'amb', 'water']) { this._bus[k] = G(k === 'amb' ? 0 : 1); this._bus[k].connect(this._mix); }
    // one global reverb: sends (distance buckets) → HPF → convolver → wet gain → mix
    const rin = G(1), rhp = c.createBiquadFilter(), conv = c.createConvolver();
    rhp.type = 'highpass'; rhp.frequency.value = 170; rhp.Q.value = 0.6;
    conv.normalize = false;
    const ir = () => { conv.buffer = makeConservatoryIR(c, 2.4, 0.025); };
    if (this._offline) ir(); else setTimeout(ir, 0);     // ~40 ms of JS: keep it out of the user gesture
    this._revG = G(this._rev * REV_K);
    rin.connect(rhp); rhp.connect(conv); conv.connect(this._revG); this._revG.connect(this._mix);
    this._send = {
      inst: SEND_BUCKETS.map((g) => { const s = G(g); s.connect(rin); return s; }),
      mech: SEND_BUCKETS.map((g) => { const s = G(g * 0.45); s.connect(rin); return s; }),
    };
    this._bus.amb.connect(this._send.inst[3]);
    this._built = true;
    this._applyListener(true);
    this._roll = new RollingPool(this);
    if (this._ambLevel > 0) this.setAmbience(this._ambLevel, this._ambHour);
  }

  get ready() { return !!(this._built && this._ctx && (this._offline || this._ctx.state === 'running')); }
  get context() { return this._ctx; }
  _live() { return this._built && (this._offline || this._ctx.state === 'running'); }

  suspend() {
    if (this._ctx && !this._offline && this._ctx.state === 'running') return this._ctx.suspend().catch(() => {});
    return Promise.resolve();
  }
  resume() {
    const c = this._ctx;
    if (c && !this._offline && c.state !== 'running' && c.state !== 'closed') return c.resume().catch(() => {});
    return Promise.resolve();
  }
  /** Not part of the app contract: stop timers and close a context we created. */
  dispose() {
    if (this._amb) this._amb.dispose();
    if (this._ownCtx && this._ctx && this._ctx.state !== 'closed') this._ctx.close().catch(() => {});
  }

  /* ----------------------------------------------------------------- mix controls */
  setMasterVolume(v) {
    this._vol = clamp(fin(v, 0.8), 0, 1);
    if (this._built) setP(this._volG.gain, volCurve(this._vol), this._ctx.currentTime, 0.03);
  }
  setMuted(m) {
    this._muted = !!m;
    if (this._built) setP(this._muteG.gain, this._muted ? 0 : 1, this._ctx.currentTime, 0.02);
  }
  setReverb(amount) {
    this._rev = clamp(fin(amount, 0.35), 0, 1);
    if (this._built) setP(this._revG.gain, this._rev * REV_K, this._ctx.currentTime, 0.05);
  }
  setAmbience(level, hourOfDay) {
    const lv = clamp(fin(level, 0), 0, 1), hr = fin(hourOfDay, this._ambHour);
    const changed = lv !== this._ambLevel || hr !== this._ambHour;
    this._ambLevel = lv; this._ambHour = hr;
    if (!this._built) return;
    if (!this._amb && lv > 0) this._amb = new Ambience(this);
    if (this._amb && (changed || this._amb.level !== lv)) this._amb.set(lv, hr);
  }

  /* ----------------------------------------------------------------- listener */
  setListener(pos, forward, up) {
    const L = this._L;
    if (pos) { L.x = fin(pos.x, L.x); L.y = fin(pos.y, L.y); L.z = fin(pos.z, L.z); }
    const norm = (v, kx, ky, kz) => {
      if (!v) return;
      const x = fin(v.x, 0), y = fin(v.y, 0), z = fin(v.z, 0), n = Math.sqrt(x * x + y * y + z * z);
      if (n > 1e-6) { L[kx] = x / n; L[ky] = y / n; L[kz] = z / n; }
    };
    norm(forward, 'fx', 'fy', 'fz'); norm(up, 'ux', 'uy', 'uz');
    if (!this._built) return;
    if (!this._live()) { this._listenerDirty = true; return; }   // don't pile up automation while suspended
    this._applyListener(this._listenerDirty);
    this._listenerDirty = false;
  }

  _applyListener(jump) {
    const c = this._ctx, l = c.listener, L = this._L, A = this._Lapplied || (this._Lapplied = {});
    if (l.positionX) {
      const now = c.currentTime;
      const S = (prm, key) => {
        const val = L[key];
        if (!jump && Math.abs(A[key] - val) < 1e-5) return;
        A[key] = val;
        if (jump) { prm.cancelScheduledValues(now); prm.setValueAtTime(val, now); } else prm.setTargetAtTime(val, now, 0.02);
      };
      S(l.positionX, 'x'); S(l.positionY, 'y'); S(l.positionZ, 'z');
      S(l.forwardX, 'fx'); S(l.forwardY, 'fy'); S(l.forwardZ, 'fz');
      S(l.upX, 'ux'); S(l.upY, 'uy'); S(l.upZ, 'uz');
    } else {
      l.setPosition(L.x, L.y, L.z);
      l.setOrientation(L.fx, L.fy, L.fz, L.ux, L.uy, L.uz);
    }
  }

  /* ----------------------------------------------------------------- one-shots */
  /** Schedule a one-shot at ctx.currentTime + 0.012 + delay. Cheap; unknown instruments are ignored. */
  hit(instrument, p) {
    if (!this._built || this._muted || !this._live()) return;
    const fn = INSTRUMENTS[instrument];
    if (!fn) return;
    p = p || {};
    const vel = clamp(fin(p.velocity, 0.7), 0, 1);
    if (vel < 0.005) return;
    const now = this._ctx.currentTime;
    if (now - this._lastSweep > 0.05) { this._lastSweep = now; this._sweep(now); }
    this._st.hits++;
    try { fn(this, p, now + 0.012 + Math.max(0, fin(p.delay, 0)), vel); } catch (err) {
      if (!this._warned) { this._warned = true; console.warn('[audio] hit failed:', instrument, err); }
    }
  }

  _panner(hrtf, x, y, z) {
    const pn = this._ctx.createPanner();
    pn.panningModel = hrtf ? 'HRTF' : 'equalpower';
    pn.distanceModel = 'inverse'; pn.refDistance = REF_DIST; pn.rolloffFactor = ROLLOFF; pn.maxDistance = MAX_DIST;
    if (pn.positionX) { pn.positionX.value = x; pn.positionY.value = y; pn.positionZ.value = z; } else pn.setPosition(x, y, z);
    return pn;
  }

  _stereo(pan) {
    const c = this._ctx;
    if (c.createStereoPanner) { const s = c.createStereoPanner(); s.pan.value = clamp(pan, -1, 1); return s; }
    const p = c.createPanner();                        // legacy fallback
    p.panningModel = 'equalpower'; p.distanceModel = 'linear'; p.rolloffFactor = 0;
    p.setPosition(Math.sin(pan * Math.PI / 2), 0, -Math.cos(pan * Math.PI / 2));
    return p;
  }

  /** Allocate a voice group: gain → equal-power panner → bus, plus a distance-bucketed reverb send. */
  _voice(p, t, bus, amp, tau) {
    const L = this._L, x = fin(p.x, L.x), y = fin(p.y, L.y), z = fin(p.z, L.z);
    const dx = x - L.x, dy = y - L.y, dz = z - L.z, d = Math.sqrt(dx * dx + dy * dy + dz * dz);
    const lvl = amp * distGain(d);
    if (d > MAX_DIST || lvl < 4e-4) { this._st.culled++; return null; }
    if (this._active.length >= VOICE_CAP) this._steal();
    const c = this._ctx, vg = c.createGain(), pn = this._panner(false, x, y, z);
    vg.gain.value = amp;
    vg.connect(pn); pn.connect(this._bus[bus]);
    vg.connect(this._send[bus === 'mech' ? 'mech' : 'inst'][d < 3 ? 0 : d < 8 ? 1 : d < 20 ? 2 : 3]);
    const v = { vg, nodes: [vg, pn], t0: t, end: t, lvl, tau };
    this._active.push(v);
    return v;
  }

  /** Sine (or `type`) partial: linear attack, exponential decay to −60 dB at T60. manual → caller shapes it. */
  _osc(v, f, amp, t, att, t60, type, manual) {
    if (!(f > 0) || f >= this._nyq) return null;
    const c = this._ctx, o = c.createOscillator(), g = c.createGain();
    if (type && type !== 'sine') o.type = type;
    o.frequency.value = f; g.gain.value = 0;
    o.connect(g); g.connect(v.vg); v.nodes.push(o, g);
    o.start(t);
    if (!manual) {
      g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(amp, t + att);
      g.gain.setTargetAtTime(0, t + att, t60 / LN1000);
      this._stopAt(v, o, t + att + t60 * 1.05);
    }
    return o;
  }
  _stopAt(v, src, end) { src.stop(end); this._track(v, src, end); }
  _track(v, src, end) { if (end > v.end) v.end = end; }
  _play(v, buf, t, rate, gain) {
    const c = this._ctx, s = c.createBufferSource();
    s.buffer = buf; s.playbackRate.value = rate;
    let out = s;
    if (gain !== 1) { const g = c.createGain(); g.gain.value = gain; s.connect(g); out = g; v.nodes.push(g); }
    out.connect(v.vg); v.nodes.push(s); s.start(t);
    this._track(v, s, t + buf.duration / rate + 0.005);
    return s;
  }
  _shimmer() { return this._shim || (this._shim = makeShimmer(this._ctx)); }

  /**
   * Pre-rendered bell/chime/glock tones (per rounded MIDI note, LRU-capped at TONE_CACHE_MAX samples).
   * A miss returns null (the caller plays live oscillators) and queues a background render — natively in an
   * OfflineAudioContext (off the main thread) for realtime engines; synchronously in JS inside offline
   * engines so tests are deterministic. The first use of a kind also queues its D-major-pentatonic notes.
   * opts.toneCache = false disables the cache.
   */
  _tone(kind, m) {
    if (this._opts.toneCache === false) return null;
    const key = kind + Math.round(m), hit = this._tones.get(key);
    if (hit) { this._tones.delete(key); this._tones.set(key, hit); return hit; }
    if (this._offline) return this._storeTone(key, renderTone(this._ctx, TONE_SPEC[kind](midiHz(Math.round(m)))));
    const q = this._toneQ, i = q.indexOf(key);
    if (i > 0) q.splice(i, 1);
    if (i !== 0) q.unshift(key);                          // misses jump the queue
    if (!this._warmed[kind]) {
      this._warmed[kind] = true;
      const [lo, hi] = TONE_RANGE[kind];
      for (let n = lo; n <= hi; n++) if (PENTA.has(n % 12) && !q.includes(kind + n)) q.push(kind + n);
    }
    if (!this._toneTimer && !this._toneBusy) this._toneTimer = setTimeout(this._pump, 0);
    return null;
  }
  _pumpTones() {
    this._toneTimer = 0;
    let key;
    while ((key = this._toneQ.shift()) && this._tones.has(key)) { /* already cached */ }
    if (!key) return;
    const kind = key.replace(/[-\d]+$/, ''), spec = TONE_SPEC[kind](midiHz(+key.slice(kind.length)));
    const next = () => { this._toneBusy = false; if (this._toneQ.length) this._toneTimer = setTimeout(this._pump, 15); };
    this._toneBusy = true;
    renderToneNative(this._ctx.sampleRate, spec).then((bufs) => { this._storeTone(key, bufs); next(); }, () => {
      try { this._storeTone(key, renderTone(this._ctx, spec)); } catch (_) { /* give up on this note: live oscillators */ }
      next();                                             // no usable OfflineAudioContext: render in JS
    });
  }
  _storeTone(key, [body, bright]) {
    const kind = key.replace(/[-\d]+$/, ''), f0 = midiHz(+key.slice(kind.length));
    const entry = { f0, T: TONE_SPEC[kind](f0).T, body, bright, n: (body ? body.length : 0) + (bright ? bright.length : 0) };
    this._tones.set(key, entry); this._toneSamples += entry.n;
    for (const [k, e] of this._tones) {                  // evict least-recently used
      if (this._toneSamples <= TONE_CACHE_MAX || k === key) break;
      this._tones.delete(k); this._toneSamples -= e.n;
    }
    return entry;
  }

  /** Voice cap reached: fade out (8 ms) the group with the lowest estimated current level. */
  _steal() {
    const now = this._ctx.currentTime, a = this._active;
    let bi = 0, bl = Infinity;
    for (let i = 0; i < a.length; i++) {
      const v = a[i], l = v.lvl * Math.exp(-Math.max(0, now - v.t0) / v.tau);
      if (l < bl) { bl = l; bi = i; }
    }
    const v = a[bi];
    a[bi] = a[a.length - 1]; a.pop();
    this._st.stolen++;
    v.vg.gain.setTargetAtTime(0, now, 0.008);
    const st = now + 0.06;
    for (const n of v.nodes) if (n.stop) { try { n.stop(st); } catch (_) { /* already stopped */ } }
    v.end = st; this._dying.push(v);
  }

  /** Disconnect groups whose envelopes have ended (no per-voice closures / onended needed). */
  _sweep(now) {
    for (let k = 0; k < 2; k++) {
      const arr = k ? this._dying : this._active;
      let w = 0;
      for (let i = 0; i < arr.length; i++) {
        const v = arr[i];
        if (now > v.end + 0.05) { for (const n of v.nodes) { try { n.disconnect(); } catch (_) { /* ignore */ } } v.nodes.length = 0; }
        else arr[w++] = v;
      }
      arr.length = w;
    }
  }

  /* ----------------------------------------------------------------- continuous voices */
  updateRolling(balls) {
    if (!this._live()) return;
    const now = this._ctx.currentTime;
    if (now - this._lastSweep > 0.05) { this._lastSweep = now; this._sweep(now); }
    this._roll.update(balls, now);
  }

  updateLift(p) {
    if (!p || !this._live()) return;
    if (!this._lift) { if (!p.running) return; this._lift = new LiftVoice(this); }
    this._lift.update(p, this._ctx.currentTime);
  }

  /** Running water: [{ id, kind: 'jet' | 'stream' | 'pool', x, y, z, level?, running? }] (a voice per id). */
  updateWater(sources) {
    if (!Array.isArray(sources) || !this._live()) return;
    const now = this._ctx.currentTime;
    this._water = this._water || new Map();
    for (const p of sources) {
      let v = this._water.get(p.id);
      if (!v) { v = new WaterVoice(this, p.kind); this._water.set(p.id, v); }
      v.update(p, now);
    }
  }

  /** Debug/telemetry (not part of the app contract). */
  stats() {
    return {
      state: this._ctx ? this._ctx.state : 'none', voices: this._active.length, dying: this._dying.length,
      rolling: this._roll ? this._roll.active() : 0, ...this._st,
    };
  }
}

export default AudioEngine;
