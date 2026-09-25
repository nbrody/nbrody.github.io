// dev/audio-analysis.js — offline measurement harness for js/audio.js.
// Renders the engine into OfflineAudioContexts (via the `context` constructor option) and measures
// peak / RMS / decay / pitch. Used by dev/audio-preview.html ("Run measurements") and via devtools:
//   const A = await import('./audio-analysis.js'); const rows = await A.runAll();
import { AudioEngine } from '../js/audio.js';

const SR = 48000, TAU = Math.PI * 2;
const LISTEN = [{ x: 0, y: 0, z: 0 }, { x: 0, y: 0, z: -1 }, { x: 0, y: 1, z: 0 }];
export const midiHz = (m) => 440 * Math.pow(2, (m - 69) / 12);
export const cents = (f, ref) => 1200 * Math.log2(f / ref);
export const db = (x) => 20 * Math.log10(Math.max(x, 1e-12));

async function makeEngine(dur, { reverb = 0, vol = 1, sr = SR } = {}) {
  const ctx = new OfflineAudioContext(2, Math.ceil(dur * sr), sr);
  const eng = new AudioEngine({ context: ctx, hrtf: false });
  eng.setMasterVolume(vol); eng.setReverb(reverb); eng.setListener(...LISTEN);
  await eng.start();
  return { ctx, eng, sr };
}
function pack(buf, sr, extra) { return { L: buf.getChannelData(0), R: buf.getChannelData(1), sr, ...extra }; }

/** Render: setup(eng) schedules everything at t=0. */
export async function render(setup, opts = {}) {
  const dur = opts.dur || 3, { ctx, eng, sr } = await makeEngine(dur, opts);
  const t0 = performance.now(); setup(eng, ctx); const sched = performance.now() - t0;
  const t1 = performance.now(); const buf = await ctx.startRendering();
  return pack(buf, sr, { sched, renderMs: performance.now() - t1, eng });
}

/** Frame-driven render: onFrame(eng, time) is called every `dt` seconds of audio time (like rAF). */
export async function renderFrames(dur, dt, onFrame, opts = {}) {
  const { ctx, eng, sr } = await makeEngine(dur, opts);
  let sched = 0, calls = 0;
  const step = (time) => { const a = performance.now(); onFrame(eng, time); sched += performance.now() - a; calls++; };
  for (let i = 1; i * dt < dur - 0.05; i++) {
    const t = i * dt;
    ctx.suspend(t).then(() => { step(ctx.currentTime); ctx.resume(); });
  }
  step(0);
  const t1 = performance.now(); const buf = await ctx.startRendering();
  return pack(buf, sr, { sched, calls, renderMs: performance.now() - t1, eng });
}

export function mono(r) { const m = new Float32Array(r.L.length); for (let i = 0; i < m.length; i++) m[i] = 0.5 * (r.L[i] + r.R[i]); return m; }

/** Peak, NaN count, 10 ms RMS envelope, momentary (50 ms) RMS max, RMS over 300 ms, −40 dB decay. */
export function levels(r) {
  const { L, R, sr } = r, w = Math.round(sr * 0.01), nw = Math.floor(L.length / w), env = new Float64Array(nw);
  let peak = 0, bad = 0;
  for (let j = 0; j < nw; j++) {
    let s = 0;
    for (let i = j * w; i < (j + 1) * w; i++) {
      const a = L[i], b = R[i];
      if (!Number.isFinite(a) || !Number.isFinite(b)) { bad++; continue; }
      const m = Math.max(Math.abs(a), Math.abs(b)); if (m > peak) peak = m;
      s += (a * a + b * b) / 2;
    }
    env[j] = Math.sqrt(s / w);
  }
  let emax = 0, jmax = 0;
  for (let j = 0; j < nw; j++) if (env[j] > emax) { emax = env[j]; jmax = j; }
  let on = 0; while (on < nw && env[on] < emax * 0.001) on++;
  let last = jmax; for (let j = jmax; j < nw; j++) if (env[j] >= emax * 0.01) last = j;
  let m50 = 0;
  for (let j = 0; j + 5 <= nw; j++) { let s = 0; for (let k = 0; k < 5; k++) s += env[j + k] ** 2; m50 = Math.max(m50, Math.sqrt(s / 5)); }
  let s3 = 0, c3 = 0; for (let j = on; j < Math.min(nw, on + 30); j++) { s3 += env[j] ** 2; c3++; }
  return { peak, bad, silent: emax < 1e-6, m50, rms300: Math.sqrt(s3 / Math.max(1, c3)), onset: on * 0.01, tMax: jmax * 0.01, decay40: (last - on + 1) * 0.01, env };
}

function fft(re, im) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1; for (; j & bit; bit >>= 1) j ^= bit; j ^= bit;
    if (i < j) { let t = re[i]; re[i] = re[j]; re[j] = t; t = im[i]; im[i] = im[j]; im[j] = t; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = -TAU / len, wr = Math.cos(ang), wi = Math.sin(ang), h = len >> 1;
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < h; k++) {
        const a = i + k, b = a + h, tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const nc = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = nc;
      }
    }
  }
}

/** Hann-windowed, zero-padded magnitude spectrum of x[t0 … t0+len). */
export function spectrum(x, sr, t0, len, N = 131072) {
  const s0 = Math.max(0, Math.round(t0 * sr)), n = Math.min(len, x.length - s0, N);
  const re = new Float64Array(N), im = new Float64Array(N);
  for (let i = 0; i < n; i++) re[i] = x[s0 + i] * (0.5 - 0.5 * Math.cos(TAU * i / (n - 1)));
  fft(re, im);
  const mag = new Float64Array(N / 2); for (let k = 0; k < N / 2; k++) mag[k] = Math.hypot(re[k], im[k]);
  return { mag, df: sr / N };
}
/** Strongest peak in [f0, f1] with parabolic interpolation on log magnitude. */
export function peakIn(S, f0, f1) {
  const { mag, df } = S, k0 = Math.max(1, Math.floor(f0 / df)), k1 = Math.min(mag.length - 2, Math.ceil(f1 / df));
  let k = k0; for (let i = k0; i <= k1; i++) if (mag[i] > mag[k]) k = i;
  const a = Math.log(mag[k - 1] + 1e-20), b = Math.log(mag[k] + 1e-20), c = Math.log(mag[k + 1] + 1e-20);
  const d = (a - 2 * b + c) !== 0 ? 0.5 * (a - c) / (a - 2 * b + c) : 0;
  return { f: (k + d) * df, mag: mag[k] };
}
/** Subharmonic-summation pitch (virtual pitch) in [fmin, fmax]. */
export function shs(S, fmin, fmax, H = 8) {
  const { mag, df } = S; let best = fmin, bs = -1;
  for (let f = fmin; f <= fmax; f *= Math.pow(2, 2 / 1200)) {
    let s = 0;
    for (let h = 1; h <= H; h++) {
      const k = Math.round(h * f / df); if (k + 3 >= mag.length) break;
      let m = 0; for (let j = k - 3; j <= k + 3; j++) m = Math.max(m, mag[j]);
      s += Math.pow(0.84, h - 1) * Math.sqrt(m);
    }
    if (s > bs) { bs = s; best = f; }
  }
  return best;
}
/** Envelope (10 ms RMS) of x after an offline 2nd-order HP/LP at fc. */
function bandEnv(x, sr, type, fc) {
  const w = TAU * fc / sr, cs = Math.cos(w), al = Math.sin(w) / (2 * 0.707);
  let b0, b1, b2; if (type === 'lp') { b0 = (1 - cs) / 2; b1 = 1 - cs; b2 = b0; } else { b0 = (1 + cs) / 2; b1 = -(1 + cs); b2 = b0; }
  const a0 = 1 + al, a1 = -2 * cs / a0, a2 = (1 - al) / a0; b0 /= a0; b1 /= a0; b2 /= a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0; const win = Math.round(sr * 0.01), env = []; let s = 0;
  for (let i = 0; i < x.length; i++) {
    const y = b0 * x[i] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = x[i]; y2 = y1; y1 = y;
    s += y * y; if ((i + 1) % win === 0) { env.push(Math.sqrt(s / win)); s = 0; }
  }
  return env;
}
/** LAImax: A-weighting (bilinear 1st-order sections, 0 dB @1 kHz) → exponential 35 ms time weighting of x² → max. */
export function laimax(x, sr) {
  const hp = (fc) => { const k = Math.tan(Math.PI * fc / sr), a = (1 - k) / (1 + k), g = 1 / (1 + k); let x1 = 0, y1 = 0; return (v) => { const y = g * (v - x1) + a * y1; x1 = v; y1 = y; return y; }; };
  const lp = (fc) => { const k = Math.tan(Math.PI * fc / sr), a = (1 - k) / (1 + k), g = k / (1 + k); let x1 = 0, y1 = 0; return (v) => { const y = g * (v + x1) + a * y1; x1 = v; y1 = y; return y; }; };
  const mk = () => [hp(20.6), hp(20.6), hp(107.7), hp(737.9), lp(12194), lp(12194)];
  const run = (chain, v) => { for (const f of chain) v = f(v); return v; };
  // normalize to 0 dB at 1 kHz
  const cal = mk(); let pk = 0; for (let i = 0; i < sr; i++) { const y = run(cal, Math.sin(2 * Math.PI * 1000 * i / sr)); if (i > sr / 2) pk = Math.max(pk, Math.abs(y)); }
  const chain = mk(), a = Math.exp(-1 / (0.035 * sr)); let e = 0, m = 0;
  for (let i = 0; i < x.length; i++) { const y = run(chain, x[i]) / pk; e = a * e + (1 - a) * y * y; if (e > m) m = e; }
  return 10 * Math.log10(Math.max(m, 1e-24)) + 3.01;   // +3 dB: RMS of a sine reads as its peak level −3 dB; report as "sine-peak dB"
}
function centroid(x, sr) {
  const S = spectrum(x, sr, 0, 16384, 16384); let a = 0, b = 0;
  for (let k = 1; k < S.mag.length; k++) { a += k * S.df * S.mag[k]; b += S.mag[k]; }
  return a / b;
}
const PRE = 0.5;   // pre-roll: a fresh DynamicsCompressor ramps its gain up over the first ~0.1–0.2 s
const at = (p) => (e) => e.hit(p.inst, { x: 0, y: 0, z: -1, velocity: 0.8, delay: PRE, ...p });
const f2 = (v, d = 2) => (typeof v === 'number' ? v.toFixed(d) : v);

/* ------------------------------------------------------------------------------------------ */
export async function runAll(log = () => {}) {
  const rows = [];
  const add = (r) => { rows.push(r); log(r); };

  // 1) tuned instruments: pitch, decay (dry, no reverb), level
  const TUNED = [['marimba', [50, 62, 74, 86], 3], ['glock', [76, 88, 100], 3.5], ['drum', [40, 47, 55], 2.5],
    ['bell', [62, 74, 86], 8], ['chime', [62, 74, 86], 8], ['gong', [38, 43], 12]];
  for (const [inst, notes, dur] of TUNED) {
    for (const m of notes) {
      const r = await render(at({ inst, midi: m }), { dur: dur + PRE, reverb: 0 }), lv = levels(r), x = mono(r), f = midiHz(m);
      const t0 = lv.onset + (inst === 'drum' ? 0.3 : inst === 'gong' ? 0.8 : 0.03);
      const S = spectrum(x, r.sr, t0, inst === 'marimba' || inst === 'glock' ? 32768 : 65536);
      let meas, note = '';
      if (inst === 'bell') {
        const pr = peakIn(S, f * 0.97, f * 1.03), no = peakIn(S, 2 * f * 0.97, 2 * f * 1.03), hu = peakIn(S, f * 0.47, f * 0.53), st = peakIn(S, 60, 12000);
        meas = pr.f;
        note = `hum ${f2(cents(hu.f, f / 2), 1)}c, nominal ${f2(cents(no.f, 2 * f), 1)}c, tierce ×${f2(peakIn(S, f * 1.15, f * 1.23).f / f, 3)}, strongest ×${f2(st.f / f)}, SHS ${f2(shs(S, f * 0.4, f * 1.6), 1)} Hz`;
      } else if (inst === 'chime') {
        const m4 = peakIn(S, 2 * f * 0.97, 2 * f * 1.03), st = peakIn(S, 60, 12000);
        meas = shs(S, f / 1.6, f * 1.6);
        note = `virtual pitch (SHS); mode4 ${f2(cents(m4.f, 2 * f), 1)}c vs 2×f, strongest ×${f2(st.f / f)}`;
      } else {
        meas = peakIn(S, f * 0.97, f * 1.03).f;
        if (inst === 'marimba') note = `partial2 ×${f2(peakIn(S, f * 3.7, f * 4.1).f / f, 3)}`;
        if (inst === 'glock') note = `partial2 ×${f2(peakIn(S, f * 2.6, f * 2.9).f / f, 3)}`;
        if (inst === 'drum') {
          const E = spectrum(x, r.sr, lv.onset, 2400);
          note = `onset pitch ≈ ${f2(cents(peakIn(E, f * 0.9, f * 1.25).f, f), 0)}c (glide), ×1.5 partial ${f2(peakIn(S, f * 1.4, f * 1.6).f / f, 3)}`;
        }
        if (inst === 'gong') {
          const hf = bandEnv(x, r.sr, 'hp', 2000), lf = bandEnv(x, r.sr, 'lp', 300);
          const am = (a) => a.indexOf(Math.max(...a)) * 0.01;
          const o = Math.round(lv.onset * 100);
          note = `bloom: HF(>2k) peaks ${f2(am(hf) - lv.onset)} s after the strike (LF at ${f2(am(lf) - lv.onset)} s); HF 50 ms after strike is ${f2(db(hf[o + 5] / Math.max(...hf)), 1)} dB re its peak`;
        }
      }
      add({ test: `${inst} ${m}`, target: f2(f), measured: f2(meas), cents: f2(cents(meas, f)), peak: f2(lv.peak, 3), m50dB: f2(db(lv.m50), 1), lai: f2(laimax(x, r.sr), 1), decay40: f2(lv.decay40), bad: lv.bad, note });
    }
  }

  // 2) mechanical noises vs a marimba note (same place, velocity 0.7). Loudness proxy: LAImax (A-weighted, 35 ms 'impulse').
  const refR = await render(at({ inst: 'marimba', midi: 69, velocity: 0.7 }), { dur: 2 + PRE }), ref = levels(refR), refLai = laimax(mono(refR), refR.sr);
  add({ test: 'marimba 69 v0.7 (ref)', peak: f2(ref.peak, 3), m50dB: f2(db(ref.m50), 1), lai: f2(refLai, 1), decay40: f2(ref.decay40), note: 'reference for Δ' });
  for (const inst of ['clack', 'click', 'clunk', 'cup', 'thud', 'tick', 'whistle']) {
    // average over the 4 variants (power mean of LAI, max of peaks) for stable numbers
    const avg = async (vel) => {
      let pw = 0, pk = 0, last = null;
      for (let variant = 0; variant < 4; variant++) {
        const r = await render(at({ inst, velocity: vel, variant }), { dur: 1 + PRE }), l = laimax(mono(r), r.sr);
        pw += Math.pow(10, l / 10) / 4; pk = Math.max(pk, levels(r).peak); last = r;
      }
      return { lai: 10 * Math.log10(pw), pk, r: last };
    };
    const A7 = await avg(0.7), r = A7.r, lv = { ...levels(r), peak: A7.pk }, lai = A7.lai, soft = (await avg(0.15)).lai;
    add({
      test: `${inst} v0.7`, peak: f2(lv.peak, 3), m50dB: f2(db(lv.m50), 1), lai: f2(lai, 1), decay40: f2(lv.decay40, 3), bad: lv.bad,
      note: `ΔLAI vs marimba ${f2(lai - refLai, 1)} dB (Δpeak ${f2(db(lv.peak / ref.peak), 1)}, Δm50 ${f2(db(lv.m50 / ref.m50), 1)}); centroid ${f2(centroid(mono(r).subarray(Math.round(lv.onset * r.sr)), r.sr), 0)} Hz; v0.15 → ${f2(soft - lai, 1)} dB`,
    });
  }
  { // lift + rolling loudness relative to the same marimba reference
    const rl = await renderFrames(2.5, 1 / 60, (e) => e.updateLift({ x: 0, y: 0, z: -1, speed: 0.3, running: true }));
    const rr_ = await renderFrames(2.5, 1 / 60, (e) => e.updateRolling([{ id: 1, x: 0, y: 0, z: -1, speed: 2, surface: 'rail' }]));
    const rf = await renderFrames(2.5, 1 / 60, (e) => e.updateRolling([{ id: 1, x: 0, y: 0, z: -1, speed: 1.2, surface: 'funnel', orbitHz: 10 }]));
    const tail = (r) => { const x = mono(r); return x.subarray(Math.round(1 * r.sr)); };
    add({ test: 'continuous @1 m (LAI, 1–2.5 s)', note: `lift 0.3 m/s ${f2(laimax(tail(rl), rl.sr) - refLai, 1)} dB; rail ball 2 m/s ${f2(laimax(tail(rr_), rr_.sr) - refLai, 1)} dB; funnel orbit 10 Hz ${f2(laimax(tail(rf), rf.sr) - refLai, 1)} dB (vs marimba v0.7 LAI)` });
  }
  { // cached tone buffers vs live oscillators (same bell): level & pitch must agree
    const a = await render(at({ inst: 'bell', midi: 69.3 }), { dur: 3 + PRE, reverb: 0 });
    const ctx2 = new OfflineAudioContext(2, Math.ceil((3 + PRE) * SR), SR), e2 = new AudioEngine({ context: ctx2, toneCache: false });
    e2.setMasterVolume(1); e2.setReverb(0); e2.setListener(...LISTEN); await e2.start(); at({ inst: 'bell', midi: 69.3 })(e2);
    const b = pack(await ctx2.startRendering(), SR, {});
    const la = levels(a), lb = levels(b), xa = mono(a), xb = mono(b), f = midiHz(69.3);
    const pa = peakIn(spectrum(xa, SR, la.onset + 0.05, 65536), f * 0.98, f * 1.02).f, pb = peakIn(spectrum(xb, SR, lb.onset + 0.05, 65536), f * 0.98, f * 1.02).f;
    add({ test: 'bell 69.3: cached vs oscillators', measured: `${f2(cents(pa, f))}c / ${f2(cents(pb, f))}c`, note: `LAI ${f2(laimax(xa, SR), 2)} vs ${f2(laimax(xb, SR), 2)} dB; decay40 ${f2(la.decay40)} vs ${f2(lb.decay40)} s` });
  }
  { // reverb: wet/dry at 1.5 m vs 8 m (energy after the dry note has died vs total)
    const out = [];
    for (const d of [1.5, 8]) {
      const r = await render((e) => e.hit('glock', { midi: 81, velocity: 0.8, x: 0, y: 0, z: -d, delay: PRE }), { dur: 5, reverb: 0.35 });
      const dry = await render((e) => e.hit('glock', { midi: 81, velocity: 0.8, x: 0, y: 0, z: -d, delay: PRE }), { dur: 5, reverb: 0 });
      let ew = 0, ed = 0; const xw = mono(r), xd = mono(dry);
      for (let i = 0; i < xw.length; i++) { const w = xw[i] - xd[i]; ew += w * w; ed += xd[i] * xd[i]; }
      out.push(`${d} m: wet/dry ${f2(10 * Math.log10(ew / ed), 1)} dB`);
    }
    add({ test: 'reverb 0.35 (glock A5)', note: out.join('; ') + ' (wet = difference of renders with/without reverb)' });
  }

  // 3) loud chord near the listener, full volume, with reverb: must stay < 1.0
  for (const [name, n, d] of [['chord: gong+3 bells+marimba v1 @0.3 m', 1, 0.3], ['torture: ×3 of the chord v1 @0.05 m', 3, 0.05]]) {
    const r = await render((e) => {
      for (let k = 0; k < n; k++) {
        e.hit('gong', { midi: 40, velocity: 1, x: d, y: 0, z: 0, delay: PRE });
        for (const m of [74, 78, 81]) e.hit('bell', { midi: m, velocity: 1, x: -d, y: 0, z: 0, delay: PRE });
        e.hit('marimba', { midi: 62, velocity: 1, x: 0, y: 0, z: -d, delay: PRE });
        e.hit('drum', { midi: 43, velocity: 1, x: 0, y: 0, z: d, delay: PRE });
      }
    }, { dur: 6 + PRE, reverb: 0.35, vol: 1 });
    const lv = levels(r);
    add({ test: name, peak: f2(lv.peak, 4), m50dB: f2(db(lv.m50), 1), bad: lv.bad, note: lv.peak < 1 ? 'OK < 1.0 (ceiling 0.95)' : 'CLIPS' });
  }

  // 4) scheduling cost: 400 mixed hits in one burst (fresh engine), per-hit µs
  const MIX = ['click', 'click', 'clack', 'clunk', 'tick', 'marimba', 'marimba', 'glock', 'bell', 'cup', 'thud', 'drum', 'chime'];
  {
    const PENT = [62, 64, 66, 69, 71, 74, 76, 78, 81, 83, 86];
    const r = await render((e) => { for (const m of PENT) for (const k of ['bell', 'glock', 'chime']) e._tone(k, m);
      const t0 = performance.now(); for (let i = 0; i < 400; i++) e.hit(MIX[i % MIX.length], { midi: PENT[i % PENT.length], velocity: 0.3 + 0.7 * Math.random(), x: Math.sin(i) * 4, y: 1, z: Math.cos(i) * 4, delay: PRE + i * 0.004 }); e.__t = performance.now() - t0; }, { dur: 3 + PRE, reverb: 0.35 });
    const lv = levels(r);
    add({ test: '400 hits scheduled in one burst', measured: `${f2(r.eng.__t, 1)} ms`, note: `${f2(1000 * r.eng.__t / 400, 1)} µs/hit (tone cache warm); stolen ${r.eng.stats().stolen}; peak ${f2(lv.peak, 3)}; NaN ${lv.bad}` });
  }

  // 5) stress: 40 hits/s for 10 s, frame-driven (60 fps), sub-frame delays; offline render speed ≈ CPU headroom
  {
    let n = 0;
    let warmMs = 0;
    const r = await renderFrames(10.5, 1 / 60, (e, time) => {
      if (time === 0) { const a = performance.now(); for (const m of [62, 64, 66, 69, 71, 74, 76, 78, 81, 83]) for (const k of ['bell', 'glock', 'chime']) e._tone(k, m); warmMs = performance.now() - a; }
      if (time > 10) return;
      const want = Math.floor((time + 1 / 60) * 40) - n;
      for (let k = 0; k < want; k++, n++) {
        e.hit(MIX[(Math.random() * MIX.length) | 0], { midi: [62, 64, 66, 69, 71, 74, 76, 78, 81, 83][(Math.random() * 10) | 0], velocity: 0.2 + 0.8 * Math.random(), x: rrand(-6, 6), y: rrand(0, 4), z: rrand(-6, 6), delay: Math.random() / 60 });
      }
      e.updateRolling([{ id: 1, x: 1, y: 1, z: -2, speed: 1.2, surface: 'rail' }]);
    }, { reverb: 0.35 });
    const lv = levels(r), st = r.eng.stats();
    add({ test: 'stress: 40 hits/s × 10 s (+rolling)', measured: `${n} hits`, peak: f2(lv.peak, 3), bad: lv.bad, note: `frame work ${f2(1000 * (r.sched - warmMs) / n, 1)} µs per hit avg (incl. rolling updates; tone-cache prewarm of 30 notes took ${f2(warmMs, 0)} ms, excluded); offline render ${f2(r.renderMs, 0)} ms for 10.5 s audio (${f2(100 * r.renderMs / 10500, 1)}% of real time); stolen ${st.stolen}; live groups at end ${st.voices}` });
  }

  // 6) continuous voices: funnel glissando + rail ball + lift, frame-driven
  {
    const r = await renderFrames(6, 1 / 60, (e, t) => {
      const orbit = 0.5 * Math.pow(12 / 0.5, Math.min(1, t / 5));
      e.updateRolling([
        { id: 'f', x: 0, y: 0, z: -1, speed: 1.2, surface: 'funnel', orbitHz: orbit },
        { id: 'r', x: 3, y: 0, z: -2, speed: 1.5, surface: 'rail' },
        { id: 'a', x: 0, y: 3, z: 0, speed: 3, surface: 'air' },
      ]);
      e.updateLift({ x: -3, y: 1, z: -1, speed: 0.3, running: t < 4.5 });
    }, { reverb: 0 });
    const lv = levels(r), x = mono(r), trk = [];
    for (const t of [1, 2.5, 4, 4.9]) {
      const orbit = 0.5 * Math.pow(24, Math.min(1, t / 5)), f = orbit * 20;
      trk.push(`${f2(t, 1)}s: orbit ${f2(orbit, 1)} Hz → peak ${f2(peakIn(spectrum(x, r.sr, t - 0.1, 9600), f * 0.8, f * 1.25).f, 1)} Hz (target ${f2(f, 1)})`);
    }
    add({ test: 'rolling funnel+rail+lift (6 s)', peak: f2(lv.peak, 3), m50dB: f2(db(lv.m50), 1), bad: lv.bad, note: `funnel tone: ${trk.join('; ')}; frame cost ${f2(1000 * r.sched / r.calls, 1)} µs` });
    // lift alone: count chain clicks (HF onsets) over 2 s @ 0.3 m/s → expect ≈ 24
    const r2 = await renderFrames(3, 1 / 60, (e) => e.updateLift({ x: 0, y: 0, z: -1, speed: 0.3, running: true }), { reverb: 0 });
    const hf = bandEnv(mono(r2), r2.sr, 'hp', 1800); let c = 0; const mx = Math.max(...hf);
    for (let j = 101; j < 300 && j < hf.length; j++) if (hf[j] > mx * 0.2 && hf[j] >= hf[j - 1] && hf[j] > hf[j + 1] && hf[j] > 1.6 * Math.min(hf[j - 2], hf[j - 1])) c++;
    add({ test: 'lift 0.3 m/s: chain clicks 1–3 s', measured: `${c}`, target: '≈24', peak: f2(levels(r2).peak, 3), note: 'onset count of >1.8 kHz envelope (10 ms frames → may merge close clicks)' });
  }
  return rows;
}
function rrand(a, b) { return a + (b - a) * Math.random(); }

if (typeof window !== 'undefined') window.audioAnalysis = { runAll, render, renderFrames, levels, spectrum, peakIn, shs, mono };
