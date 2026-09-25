// midi.js — MIDI play mode: every keystroke fires lights.
//
// NoteLayer is pure (no DOM) so it can be tested headlessly: MIDI bytes go in,
// and each frame it publishes per-fixture intensity, colour and a tilt kick plus
// a lift for each pod. The engine lays this over the show (HTP on intensity, the
// note's colour wins in proportion to its level) just before the masters, so
// flash, blackout and the grand master still apply.
//
// setupMidi() wires Web MIDI, the on-screen and computer keyboards, a demo
// groove, a sweep test and a message monitor to the panel. All sources go
// through NoteLayer.message(), exactly like a hardware keyboard.

import { hs2rgb, hexHS, rotateHue } from './engine.js';
import { POD_COUNT, PER_POD } from './layout.js';

export const NOTE_NAMES = ['C', 'C♯', 'D', 'E♭', 'E', 'F', 'F♯', 'G', 'A♭', 'A', 'B♭', 'B'];
export const noteName = (n) => `${NOTE_NAMES[n % 12]}${Math.floor(n / 12) - 1}`;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);

export const MAPPINGS = {
  keys: 'Keys across the stage',
  octaves: 'Octave → pod, note → head',
  scatter: 'Scatter (colour organ)',
  rig: 'Whole rig on every note',
};
export const COLOR_MODES = {
  pitch: 'Pitch → hue (C red … B magenta)',
  velocity: 'Velocity → heat',
  show: 'Keep the show’s colour',
  fixed: 'One colour',
};

// General MIDI percussion (channel 10) → what it lights and in what colour.
const DRUM_COLOR = { kick: '#ff8a00', snare: '#ffffff', hat: '#d4ecff', tom: null, crash: '#ffffff', ride: '#ffbb3a' };
function drumKind(n) {
  if (n === 35 || n === 36) return 'kick';
  if (n >= 37 && n <= 40) return 'snare';
  if (n === 42 || n === 44 || n === 46) return 'hat';
  if ([41, 43, 45, 47, 48, 50].includes(n)) return 'tom';
  if ([49, 52, 55, 57].includes(n)) return 'crash';
  if ([51, 53, 59].includes(n)) return 'ride';
  return null;
}
const TOMS = [41, 43, 45, 47, 48, 50];

export class NoteLayer {
  constructor(engine) {
    this.e = engine;
    const N = (this.N = engine.N);
    this.I = new Float32Array(N); this.R = new Float32Array(N); this.G = new Float32Array(N); this.B = new Float32Array(N);
    this.W = new Float32Array(N); this.tilt = new Float32Array(N); this.lift = new Float32Array(POD_COUNT);
    this.hasColor = new Uint8Array(N);
    this.voices = new Map();
    this.on = false;
    this.base = 0.12; // how much of the show stays up under the notes
    this.opts = {
      mapping: 'keys', color: 'pitch', fixed: '#ffffff', lo: 36, hi: 96, channel: 0, drums10: true,
      sustain: 0.6, decay: 0.35, release: 0.6, width: 0.07, kick: 10, lift: 0.6, curve: 1,
    };
    this.pedal = false; this.bend = 0; this.mod = 0; this.rideStep = 0;
    this.hits = 0; this.reached = new Set();
    this.rnd = 1;
  }

  random() { this.rnd = (this.rnd * 16807) % 2147483647; return this.rnd / 2147483647; }

  /** Feed raw MIDI bytes. Returns a short description for the monitor (or null). */
  message(data, source = 'midi') {
    const [st, d1 = 0, d2 = 0] = data;
    const type = st & 0xf0, ch = (st & 0x0f) + 1;
    if (st >= 0xf0) return null;
    if (this.opts.channel && ch !== this.opts.channel && !(ch === 10 && this.opts.drums10)) return null;
    if (type === 0x90 && d2 > 0) { this.noteOn(d1, d2, ch, source); return `Note on  ${noteName(d1)} vel ${d2} · ch ${ch}`; }
    if (type === 0x80 || type === 0x90) { this.noteOff(d1, ch, source); return `Note off ${noteName(d1)} · ch ${ch}`; }
    if (type === 0xb0) {
      if (d1 === 64) { this.setPedal(d2 >= 64); return `Sustain ${d2 >= 64 ? 'down' : 'up'} · ch ${ch}`; }
      if (d1 === 1) { this.mod = d2 / 127; return `Mod wheel ${d2} · ch ${ch}`; }
      if (d1 === 120 || d1 === 123) { this.allOff(); return `All notes off · ch ${ch}`; }
      return `CC ${d1} = ${d2} · ch ${ch}`;
    }
    if (type === 0xe0) { this.bend = ((d2 << 7) | d1) / 8192 - 1; return `Pitch bend ${this.bend.toFixed(2)} · ch ${ch}`; }
    return null;
  }

  noteOn(note, vel, ch, source) {
    const drum = this.opts.drums10 && ch === 10;
    const v = Math.pow(vel / 127, this.opts.curve);
    const targets = drum ? this.drumTargets(note) : this.targets(note);
    const pods = new Float32Array(POD_COUNT);
    for (const [i] of targets) { const p = this.e.fixtures[i].pod; if (p >= 0) pods[p] += 1 / targets.length; }
    this.voices.set(`${source}:${ch}:${note}`, {
      note, vel: v, drum, targets, pods, color: this.colorFor(note, v, drum), t: 0, held: true, sustained: false, rel: null, level: 0, source,
    });
    this.hits++;
    for (const [i] of targets) this.reached.add(i);
    this.lastNote = note;
  }

  noteOff(note, ch, source) {
    const v = this.voices.get(`${source}:${ch}:${note}`);
    if (!v || !v.held) return;
    v.held = false;
    if (this.pedal) v.sustained = true;
  }

  setPedal(down) {
    this.pedal = down;
    if (!down) for (const v of this.voices.values()) v.sustained = false;
  }

  allOff(source) {
    for (const [k, v] of this.voices) if (!source || v.source === source) { v.held = false; v.sustained = false; }
    if (!source) this.pedal = false;
  }

  /** Fixtures a pitched note lights, as [index, weight]. */
  targets(note) {
    const F = this.e.fixtures, o = this.opts, out = [];
    switch (o.mapping) {
      case 'octaves': {
        const row = Math.max(0, Math.min(6, Math.floor((note - 24) / 12))), pc = note % 12;
        if (row === 0) { const i = F.findIndex((f) => !f.hang && f.slot === pc); out.push([i, 1]); break; }
        const pod = 6 - row, slot = Math.round((pc * (PER_POD - 1)) / 11), i = pod * PER_POD + slot;
        out.push([i, 1]);
        if (slot > 0) out.push([i - 1, 0.3]);
        if (slot < PER_POD - 1) out.push([i + 1, 0.3]);
        break;
      }
      case 'scatter': {
        const pc = note % 12;
        F.forEach((f) => { if ((f.slot * 7 + (f.pod + 1) * 5) % 12 === pc) out.push([f.i, 1]); });
        break;
      }
      case 'rig':
        F.forEach((f) => out.push([f.i, f.hang ? 1 : 0.7]));
        break;
      default: { // keys across the stage: a column of light at the key's position
        const pos = clamp01((note - o.lo) / Math.max(1, o.hi - o.lo)), w = Math.max(0.02, o.width);
        let best = null, bd = 9;
        F.forEach((f) => {
          const d = Math.abs(f.kx - pos);
          if (d < w) out.push([f.i, 1 - (d / w) * 0.7]);
          if (d < bd) { bd = d; best = f.i; }
        });
        if (!out.length) out.push([best, 1]);
      }
    }
    return out;
  }

  drumTargets(note) {
    const F = this.e.fixtures, pods = F.filter((f) => f.hang), kind = drumKind(note);
    const pick = (n) => {
      const out = new Map();
      while (out.size < n) out.set(pods[Math.floor(this.random() * pods.length)].i, 1);
      return [...out];
    };
    switch (kind) {
      case 'kick': return F.filter((f) => !f.hang).map((f) => [f.i, 1]).concat(pods.filter((f) => f.pod === 5).map((f) => [f.i, 0.5]));
      case 'snare': return pods.filter((f) => f.pod === 2 || f.pod === 3).map((f) => [f.i, f.slot % 2 ? 1 : 0.6]);
      case 'hat': return pick(note === 46 ? 10 : 3);
      case 'tom': { const pod = 5 - TOMS.indexOf(note); return pods.filter((f) => f.pod === pod).map((f) => [f.i, 1]); }
      case 'crash': return F.map((f) => [f.i, 1]);
      case 'ride': { const s = this.rideStep++ % PER_POD; return pods.filter((f) => f.slot === s).map((f) => [f.i, 1]); }
      default: return this.targets(note);
    }
  }

  colorFor(note, v, drum) {
    const o = this.opts, c = { r: 1, g: 1, b: 1 };
    if (o.color === 'show') return null;
    if (o.color === 'fixed') return hs2rgb(...hexHS(o.fixed), c);
    if (drum && o.color === 'pitch') {
      const kind = drumKind(note);
      if (kind === 'tom') return hs2rgb(200 + TOMS.indexOf(note) * 25, 0.9, c);
      if (kind) return hs2rgb(...hexHS(DRUM_COLOR[kind]), c);
    }
    if (o.color === 'velocity') return hs2rgb(250 + v * 130, v > 0.75 ? 1 - (v - 0.75) * 3.2 : 1, c);
    return hs2rgb((note % 12) * 30, 1, c);
  }

  update(dt) {
    const o = this.opts, N = this.N;
    this.I.fill(0); this.R.fill(0); this.G.fill(0); this.B.fill(0); this.W.fill(0); this.tilt.fill(0); this.lift.fill(0);
    this.hasColor.fill(0);
    const kick = o.kick * (1 + this.mod * 2);
    for (const [key, v] of this.voices) {
      v.t += dt;
      let level;
      if (v.drum) level = v.vel * Math.exp(-v.t / (0.1 + o.release * 0.35));
      else if (v.held || v.sustained) level = v.vel * (o.sustain + (1 - o.sustain) * Math.exp(-v.t / Math.max(0.02, o.decay)));
      else {
        if (v.rel === null) v.rel = { t: v.t, level: v.level };
        level = v.rel.level * Math.exp(-(v.t - v.rel.t) / Math.max(0.03, o.release));
      }
      v.level = level;
      if (level < 0.003 && (v.drum || (!v.held && !v.sustained))) { this.voices.delete(key); continue; } // drums are one-shots
      const attack = Math.min(1, v.t / 0.012);
      const L = level * attack;
      for (const [i, w] of v.targets) {
        const x = L * w;
        if (x > this.I[i]) this.I[i] = x;
        if (v.color) { this.R[i] += v.color.r * x; this.G[i] += v.color.g * x; this.B[i] += v.color.b * x; this.W[i] += x; this.hasColor[i] = 1; }
        const f = this.e.fixtures[i];
        this.tilt[i] += kick * x * (f.hang ? (f.slot % 2 ? 1 : -1) : 1);
      }
      for (let p = 0; p < POD_COUNT; p++) if (v.pods[p]) this.lift[p] = Math.max(this.lift[p], o.lift * L * Math.min(1, v.pods[p] * 3));
    }
    const tmp = { r: 0, g: 0, b: 0 };
    for (let i = 0; i < N; i++) {
      if (!this.W[i]) continue;
      tmp.r = this.R[i] / this.W[i]; tmp.g = this.G[i] / this.W[i]; tmp.b = this.B[i] / this.W[i];
      if (this.bend) rotateHue(tmp, this.bend * 60);
      this.R[i] = tmp.r; this.G[i] = tmp.g; this.B[i] = tmp.b;
    }
  }

  held() {
    return [...this.voices.values()].filter((v) => v.held || v.sustained).map((v) => v.note);
  }
}

// ——— demo groove: 8 bars at 120 BPM in A minor, all four mappings' worth of notes ———
export function demoGroove() {
  const ev = []; // [beat, bytes]
  const on = (b, ch, n, v, len) => { ev.push([b, [0x90 | (ch - 1), n, v]]); ev.push([b + len, [0x80 | (ch - 1), n, 0]]); };
  const chords = [[57, 60, 64], [53, 57, 60], [48, 52, 55], [55, 59, 62], [57, 60, 64], [53, 57, 60], [48, 52, 55], [52, 56, 59]];
  const roots = [33, 29, 36, 31, 33, 29, 36, 28];
  for (let bar = 0; bar < 8; bar++) {
    const b0 = bar * 4, ch = chords[bar];
    ch.forEach((n) => on(b0, 1, n, 70, 3.8)); // pad
    [0, 1.5, 2, 3.5].forEach((o, k) => on(b0 + o, 2, roots[bar] + (k === 3 ? 12 : 0), 100, 0.4)); // bass
    if (bar >= 2) for (let s = 0; s < 16; s++) on(b0 + s / 4, 3, ch[s % 3] + 12 + (s % 8 >= 4 ? 12 : 0), 60 + (s % 4 === 0 ? 40 : 0), 0.2); // arp
    for (let q = 0; q < 4; q++) on(b0 + q, 10, 36, 118, 0.1); // kick
    [1, 3].forEach((q) => on(b0 + q, 10, 38, 110, 0.1)); // snare
    for (let e = 0; e < 8; e++) {
      if (bar === 7 && e >= 4) continue;
      const ride = bar >= 4 && bar < 7;
      on(b0 + e / 2, 10, ride ? 51 : e === 7 ? 46 : 42, e % 2 ? 70 : 95, 0.1);
    }
    if (bar === 0 || bar === 4) on(b0, 10, 49, 120, 0.1);
    if (bar === 7) TOMS.slice().reverse().forEach((t, k) => on(b0 + 2 + k / 3, 10, t, 105, 0.1));
  }
  ev.sort((a, b) => a[0] - b[0] || (a[1][0] & 0xf0) - (b[1][0] & 0xf0));
  return { bpm: 120, beats: 32, events: ev };
}

// ——— tiny monitor synth for the on-screen keys, computer keys, demo and sweep ———
class Synth {
  constructor() { this.ctx = null; this.voices = new Map(); this.volume = 0.3; }
  ensure() {
    if (this.ctx) { this.ctx.resume?.().catch?.(() => {}); return this.ctx; }
    const A = window.AudioContext || window.webkitAudioContext;
    if (!A) return null;
    this.ctx = new A({ latencyHint: 'interactive' });
    this.out = this.ctx.createGain();
    this.out.gain.value = this.volume;
    this.out.connect(this.ctx.destination);
    this.noise = this.ctx.createBuffer(1, this.ctx.sampleRate * 0.4, this.ctx.sampleRate);
    const d = this.noise.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    return this.ctx;
  }
  setVolume(v) { this.volume = v; if (this.out) this.out.gain.value = v; }
  noteOn(key, note, vel, drum) {
    const ctx = this.ensure();
    if (!ctx) return;
    const t = ctx.currentTime, g = ctx.createGain();
    g.connect(this.out);
    if (drum) {
      const kind = drumKind(note);
      if (kind === 'kick' || kind === 'tom') {
        const o = ctx.createOscillator();
        o.frequency.setValueAtTime(kind === 'kick' ? 150 : 90 + TOMS.indexOf(note) * 30, t);
        o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
        g.gain.setValueAtTime(vel * 0.9, t); g.gain.exponentialRampToValueAtTime(0.001, t + 0.3);
        o.connect(g); o.start(t); o.stop(t + 0.32);
      } else {
        const s = ctx.createBufferSource(), f = ctx.createBiquadFilter();
        s.buffer = this.noise;
        f.type = kind === 'snare' ? 'bandpass' : 'highpass';
        f.frequency.value = kind === 'snare' ? 1800 : 7000;
        const len = kind === 'crash' || note === 46 ? 0.35 : kind === 'snare' ? 0.16 : 0.05;
        g.gain.setValueAtTime(vel * 0.5, t); g.gain.exponentialRampToValueAtTime(0.001, t + len);
        s.connect(f).connect(g); s.start(t); s.stop(t + len + 0.02);
      }
      return;
    }
    this.noteOff(key);
    const o = ctx.createOscillator();
    o.type = note < 45 ? 'sawtooth' : 'triangle';
    o.frequency.value = 440 * 2 ** ((note - 69) / 12);
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(vel * (note < 45 ? 0.12 : 0.18), t + 0.008);
    g.gain.setTargetAtTime(vel * 0.08, t + 0.01, 0.3);
    o.connect(g); o.start(t);
    this.voices.set(key, { o, g });
  }
  noteOff(key) {
    const v = this.voices.get(key);
    if (!v || !this.ctx) return;
    const t = this.ctx.currentTime;
    v.g.gain.cancelScheduledValues(t);
    v.g.gain.setTargetAtTime(0, t, 0.08);
    v.o.stop(t + 0.5);
    this.voices.delete(key);
  }
  allOff() { for (const k of [...this.voices.keys()]) this.noteOff(k); }
}

// ——— panel glue ———
const QWERTY = { a: 0, w: 1, s: 2, e: 3, d: 4, f: 5, t: 6, g: 7, y: 8, h: 9, u: 10, j: 11, k: 12, o: 13, l: 14, p: 15, ';': 16 };

export function setupMidi({ engine, onControl, onEnable, onScene }) {
  const $ = (s) => document.querySelector(s);
  const layer = new NoteLayer(engine);
  engine.noteLayer = layer;
  const synth = new Synth();
  let access = null, qwertyOctave = 4;
  const log = [];

  // options ↔ controls
  $('#midiMapping').innerHTML = Object.entries(MAPPINGS).map(([k, l]) => `<option value="${k}">${l}</option>`).join('');
  $('#midiColor').innerHTML = Object.entries(COLOR_MODES).map(([k, l]) => `<option value="${k}">${l}</option>`).join('');
  $('#midiChannel').innerHTML = '<option value="0">Omni (all channels)</option>' + Array.from({ length: 16 }, (_, i) => `<option value="${i + 1}">Channel ${i + 1}</option>`).join('');
  const bindOpt = (id, key, ev = 'input', parse = Number) => {
    const el = $(`#${id}`);
    const read = () => { layer.opts[key] = el.type === 'checkbox' ? el.checked : parse(el.value); };
    el.addEventListener(ev, read); read();
  };
  bindOpt('midiMapping', 'mapping', 'change', String);
  bindOpt('midiColor', 'color', 'change', String);
  bindOpt('midiFixed', 'fixed', 'input', String);
  bindOpt('midiChannel', 'channel', 'change');
  bindOpt('midiDrums', 'drums10', 'change');
  bindOpt('midiSustain', 'sustain');
  bindOpt('midiRelease', 'release');
  bindOpt('midiWidth', 'width');
  bindOpt('midiKick', 'kick');
  bindOpt('midiLift', 'lift');
  bindOpt('midiLow', 'lo', 'change');
  bindOpt('midiHigh', 'hi', 'change');
  const baseEl = $('#midiBase');
  const readBase = () => { layer.base = +baseEl.value; };
  baseEl.addEventListener('change', readBase); readBase();
  const modeEl = $('#midiMode');
  const setMode = (on) => {
    layer.on = on;
    if (!on) { layer.allOff(); synth.allOff(); }
    onEnable?.(on);
  };
  modeEl.addEventListener('change', () => setMode(modeEl.checked));
  const ensureMode = () => { if (!modeEl.checked) { modeEl.checked = true; setMode(true); } };
  const vol = $('#midiVolume');
  vol.addEventListener('input', () => synth.setVolume(+vol.value)); synth.setVolume(+vol.value);

  const status = (msg) => { $('#midiStatus').textContent = msg; };
  const led = $('#midiLed');
  function monitor(text) {
    if (!text) return;
    log.unshift(text);
    log.length = Math.min(log.length, 8);
    $('#midiLog').innerHTML = log.map((l) => `<li>${l}</li>`).join('');
    led.classList.add('on');
    clearTimeout(monitor.t);
    monitor.t = setTimeout(() => led.classList.remove('on'), 90);
  }

  /** Every source ends up here. `sound` = play the monitor synth. */
  function feed(bytes, source, sound) {
    if (source === 'midi' && onControl?.(bytes)) return; // learned mappings win
    if (source === 'midi' && onScene && (bytes[0] & 15) === 15 && (bytes[0] & 0xe0) === 0x80) { // channel 16: scene pads
      if ((bytes[0] & 0xf0) === 0x90 && bytes[2] > 0) { onScene(bytes[1] - 36); monitor(`Scene pad ${noteName(bytes[1])} · ch 16`); }
      return;
    }
    const text = layer.message(bytes, source);
    monitor(text && source !== 'midi' ? `${text} · ${source}` : text);
    if (sound && $('#midiSound').checked) {
      const type = bytes[0] & 0xf0, ch = (bytes[0] & 15) + 1, key = `${source}:${ch}:${bytes[1]}`;
      if (type === 0x90 && bytes[2] > 0) synth.noteOn(key, bytes[1], bytes[2] / 127, layer.opts.drums10 && ch === 10);
      else if (type === 0x80 || type === 0x90) synth.noteOff(key);
    }
  }

  // Web MIDI
  function refreshInputs() {
    const sel = $('#midiInput'), keep = sel.value;
    const ins = access ? [...access.inputs.values()] : [];
    sel.innerHTML = '<option value="all">All connected inputs</option>' + ins.map((p) => `<option value="${p.id}">${p.name}</option>`).join('');
    sel.value = ins.some((p) => p.id === keep) ? keep : 'all';
    for (const p of ins) {
      p.onmidimessage = (m) => {
        if (sel.value !== 'all' && sel.value !== p.id) return;
        ensureMode();
        feed([...m.data], 'midi', $('#midiSoundHw').checked);
      };
    }
    const live = ins.filter((p) => p.state !== 'disconnected');
    status(live.length ? `Connected: ${live.map((p) => p.name).join(', ')}. Play a key.` : 'No MIDI inputs found. Plug one in, or use the test tools below.');
  }
  async function connect() {
    if (!navigator.requestMIDIAccess) { status('Web MIDI is not available in this browser (try Chrome or Edge). The test tools below still work.'); return false; }
    try {
      access = await navigator.requestMIDIAccess();
      access.onstatechange = refreshInputs;
      refreshInputs();
      return true;
    } catch {
      status('MIDI permission denied. The test tools below still work.');
      return false;
    }
  }
  $('#midiConnect').addEventListener('click', connect);

  // on-screen keyboard (two octaves from C of the current octave)
  const piano = $('#pianoKeys');
  function buildPiano() {
    piano.innerHTML = '';
    for (let k = 0; k < 25; k++) {
      const n = qwertyOctave * 12 + 12 + k, black = [1, 3, 6, 8, 10].includes(k % 12);
      const b = document.createElement('button');
      b.type = 'button'; b.className = black ? 'black' : 'white'; b.dataset.note = n;
      b.setAttribute('aria-label', noteName(n));
      if (k % 12 === 0) b.textContent = noteName(n);
      piano.append(b);
    }
    $('#pianoOct').textContent = `C${qwertyOctave}`;
  }
  buildPiano();
  let pointerNote = null;
  const pianoOn = (n, vel = 100) => { ensureMode(); feed([0x90, n, vel], 'keys', true); piano.querySelector(`[data-note="${n}"]`)?.classList.add('down'); };
  const pianoOff = (n) => { feed([0x80, n, 0], 'keys', true); piano.querySelector(`[data-note="${n}"]`)?.classList.remove('down'); };
  piano.addEventListener('pointerdown', (e) => {
    const b = e.target.closest('[data-note]');
    if (!b) return;
    const r = b.getBoundingClientRect(), vel = Math.round(50 + 77 * clamp01((e.clientY - r.top) / r.height));
    pointerNote = +b.dataset.note; pianoOn(pointerNote, vel);
  });
  const lift = () => { if (pointerNote !== null) { pianoOff(pointerNote); pointerNote = null; } };
  piano.addEventListener('pointerup', lift);
  piano.addEventListener('pointerleave', lift);
  piano.addEventListener('click', (e) => { // keyboard / remote activation (no pointer)
    const b = e.target.closest('[data-note]');
    if (!b || e.detail !== 0) return;
    const n = +b.dataset.note; pianoOn(n); setTimeout(() => pianoOff(n), 250);
  });
  $('#pianoDown').addEventListener('click', () => { qwertyOctave = Math.max(1, qwertyOctave - 1); buildPiano(); });
  $('#pianoUp').addEventListener('click', () => { qwertyOctave = Math.min(7, qwertyOctave + 1); buildPiano(); });

  // computer keys as a MIDI keyboard (capture phase so they win over console shortcuts)
  const down = new Map();
  const qwertyEl = $('#qwertyNotes');
  window.addEventListener('keydown', (e) => {
    if (!qwertyEl.checked || e.metaKey || e.ctrlKey || e.altKey || e.target.matches?.('input[type=text], input[type=number], textarea, select')) return;
    const k = e.key.toLowerCase();
    if (k === 'z' || k === 'x') {
      e.stopPropagation(); e.preventDefault();
      if (!e.repeat) { qwertyOctave = Math.max(1, Math.min(7, qwertyOctave + (k === 'x' ? 1 : -1))); buildPiano(); }
      return;
    }
    if (!(k in QWERTY)) return;
    e.stopPropagation(); e.preventDefault();
    if (e.repeat || down.has(k)) return;
    const n = (qwertyOctave + 1) * 12 + QWERTY[k];
    down.set(k, n); pianoOn(n, e.shiftKey ? 127 : 96);
  }, true);
  window.addEventListener('keyup', (e) => {
    const k = e.key.toLowerCase();
    if (!down.has(k)) return;
    e.stopPropagation();
    pianoOff(down.get(k)); down.delete(k);
  }, true);

  // test tools: demo groove + sweep
  let player = null;
  function stopPlayer() {
    if (!player) return;
    layer.allOff(player.source);
    synth.allOff();
    player = null;
    $('#midiDemo').textContent = 'Play test groove';
    $('#midiDemo').classList.remove('active');
  }
  $('#midiDemo').addEventListener('click', () => {
    if (player?.source === 'demo') { stopPlayer(); return; }
    stopPlayer();
    ensureMode(); synth.ensure();
    const g = demoGroove();
    engine.bpm = g.bpm; engine.beat = Math.ceil(engine.beat);
    const bpmEl = document.getElementById('bpm'); if (bpmEl) bpmEl.value = g.bpm;
    player = { source: 'demo', t: 0, i: 0, events: g.events.map(([b, bytes]) => [(b * 60) / g.bpm, bytes]), loop: (g.beats * 60) / g.bpm };
    $('#midiDemo').textContent = 'Stop test groove';
    $('#midiDemo').classList.add('active');
  });
  $('#midiSweep').addEventListener('click', () => {
    stopPlayer();
    ensureMode(); synth.ensure();
    layer.reached.clear();
    const ev = [];
    for (let n = 24, k = 0; n < 108; n++, k++) { ev.push([k * 0.08, [0x90, n, 110]]); ev.push([k * 0.08 + 0.07, [0x80, n, 0]]); }
    ev.sort((a, b) => a[0] - b[0]);
    player = { source: 'sweep', t: 0, i: 0, events: ev, loop: 0 };
  });
  $('#midiPanic').addEventListener('click', () => { stopPlayer(); layer.allOff(); synth.allOff(); monitor('All notes off (panic)'); });

  function tick(dt) {
    if (player) {
      player.t += dt;
      while (player.i < player.events.length && player.events[player.i][0] <= player.t) feed(player.events[player.i++][1], player.source, true);
      if (player.i >= player.events.length) {
        if (player.loop) { player.t -= player.loop; player.i = 0; }
        else { const src = player.source; stopPlayer(); if (src === 'sweep') monitor(`Sweep done: reached ${layer.reached.size} / ${engine.N} fixtures`); }
      }
    }
    layer.update(dt);
  }
  function readout() {
    const held = layer.held();
    $('#midiNow').value = held.length ? held.slice(0, 8).map(noteName).join(' ') : layer.voices.size ? 'releasing…' : 'No notes';
    $('#midiReach').value = `${layer.reached.size} / ${engine.N} fixtures reached · ${layer.hits} notes`;
    $('#midiPedal').classList.toggle('on', layer.pedal);
  }
  return { layer, connect, tick, readout, feed, get access() { return access; }, stop: stopPlayer };
}
