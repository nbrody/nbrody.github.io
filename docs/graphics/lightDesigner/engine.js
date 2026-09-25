// engine.js — the lighting console: show playback, programmer, effects, kinetics, masters.
//
// Each frame resolves every fixture through a fixed stack, like a real desk:
//   show section look (cross-faded with the previous section)
//   → programmer overrides (LTP) → live effects → snapshot fade (for jumps / GO)
//   → highlight → masters (grand, sub-masters, flash, strobe, blackout)
//   → physics (motor response for pan/tilt/zoom, hoist speed for the pods)
// and publishes per-fixture render data: lens position, beam direction, colour,
// beam angle and frost. Looks are declarative (see shows.js); any value in a
// look may be a function of the section context `c = { p, t, T, beat }`.

import {
  buildFixtures, buildGroups, RIG, fixtureFrame, beamDir, aimAt, landing, hash,
  POD_COUNT, CYC_Z, DECK_Y, DECK_FRONT, DECK_BACK, DECK_HALF,
} from './layout.js';

export const TARGETS = {
  band: [0, 2.6, -2.2], crowd: [0, 1.6, 16], deep: [0, 4, 48], air: [0, 8.8, -3.6], deck: [0, 1.2, -2],
  lip: [0, 1.2, 3], cyc: [0, 8, CYC_Z], foh: [0, 5, 24], sky: [0, 40, -5],
  guitar: [-1.6, 2.4, -0.4], bass: [2.8, 2.4, -0.6], keys: [-5.2, 2.4, -2.3], drums: [0.6, 2.7, -5],
};

export const ATTRS = ['dim', 'hue', 'sat', 'pan', 'tilt', 'zoom', 'frost', 'strobe'];
const TAU = Math.PI * 2;
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);

// ——— colour helpers ———
const hsCache = new Map();
export function hexHS(hex) {
  if (Array.isArray(hex)) return hex;
  let v = hsCache.get(hex);
  if (v) return v;
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) / 255, g = ((n >> 8) & 255) / 255, b = (n & 255) / 255;
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b), d = mx - mn;
  let h = 0;
  if (d > 0) {
    if (mx === r) h = ((g - b) / d) % 6;
    else if (mx === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
  }
  v = [(h * 60 + 360) % 360, mx > 0 ? d / mx : 0];
  hsCache.set(hex, v);
  return v;
}
export function hs2rgb(h, s, o) {
  h = (((h % 360) + 360) % 360) / 60;
  const x = s * (1 - Math.abs((h % 2) - 1)), m = 1 - s;
  let r = 0, g = 0, b = 0;
  if (h < 1) { r = s; g = x; } else if (h < 2) { r = x; g = s; } else if (h < 3) { g = s; b = x; }
  else if (h < 4) { g = x; b = s; } else if (h < 5) { r = x; b = s; } else { r = s; b = x; }
  o.r = r + m; o.g = g + m; o.b = b + m;
  return o;
}
export function rgbHex(r, g, b) {
  const c = (v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, '0');
  return `#${c(r)}${c(g)}${c(b)}`;
}
export function rotateHue(s, deg) {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a), k = (1 - c) / 3, q = Math.sqrt(1 / 3) * sn;
  const r = s.r, g = s.g, b = s.b;
  s.r = Math.max(0, (c + k) * r + (k - q) * g + (k + q) * b);
  s.g = Math.max(0, (k + q) * r + (c + k) * g + (k - q) * b);
  s.b = Math.max(0, (k - q) * r + (k + q) * g + (c + k) * b);
}

// ——— waves: phase in cycles → 0..1 ———
function vnoise(x, seed) {
  const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f);
  return lerp(hash(i * 1.37 + seed * 17.1), hash((i + 1) * 1.37 + seed * 17.1), u);
}
export const WAVES = ['sin', 'saw', 'ramp', 'tri', 'square', 'pulse', 'rand', 'noise'];
function wave(w, ph, duty, seed) {
  const x = ph - Math.floor(ph);
  switch (w) {
    case 'saw': return x;
    case 'ramp': return 1 - x;
    case 'tri': return 1 - Math.abs(2 * x - 1);
    case 'square': return x < duty ? 1 : 0;
    case 'pulse': return Math.exp(-x * (3 + 14 * (1 - duty)));
    case 'rand': return hash(Math.floor(ph) * 7.31 + seed * 13.7);
    case 'noise': return vnoise(ph * 2, seed);
    default: return 0.5 - 0.5 * Math.cos(TAU * x);
  }
}

export function keyOf(f, by, j, n) {
  switch (by) {
    case 'x': return f.kx;
    case 'pod': return f.kpod;
    case 'center': return f.kc;
    case 'rand': return f.kr;
    case 'slot': return f.kslot;
    case 'diag': return (f.kx + f.kpod) / 2;
    default: return n > 1 ? j / (n - 1) : 0;
  }
}

function newState() {
  return { dim: 0, hue: 0, sat: 0, r: 1, g: 1, b: 1, pan: 0, tilt: 0, zoom: 8, frost: 0.2, strobe: 0 };
}
function copyState(d, s) {
  d.dim = s.dim; d.r = s.r; d.g = s.g; d.b = s.b; d.pan = s.pan; d.tilt = s.tilt;
  d.zoom = s.zoom; d.frost = s.frost; d.strobe = s.strobe;
}
function mixState(d, a, b, t) {
  d.dim = lerp(a.dim, b.dim, t); d.r = lerp(a.r, b.r, t); d.g = lerp(a.g, b.g, t); d.b = lerp(a.b, b.b, t);
  d.pan = lerp(a.pan, b.pan, t); d.tilt = lerp(a.tilt, b.tilt, t); d.zoom = lerp(a.zoom, b.zoom, t);
  d.frost = lerp(a.frost, b.frost, t); d.strobe = lerp(a.strobe, b.strobe, t);
}
const val = (v, c) => (typeof v === 'function' ? v(c) : v);

export const KIN_SHAPES = ['flat', 'rake', 'arch', 'vee', 'wave', 'twist', 'breathe', 'tilt', 'chaos'];

/** How a row's flip amount spreads over its five sticks (±1 = a quarter turn). */
export const FLIP_MODES = {
  all: 'All sticks (columns)',
  alt: 'Alternate (zigzags, diamonds)',
  lattice: 'Alternate, rows opposed (lattice)',
  outer: 'Outer legs (portal frames)',
  inner: 'Inner three',
  fan: 'Fan out from centre',
};
const FLIP_PATTERN = {
  all: [1, 1, 1, 1, 1], alt: [1, -1, 1, -1, 1], lattice: [1, -1, 1, -1, 1],
  outer: [1, 0, 0, 0, -1], inner: [0, 1, 1, 1, 0], fan: [-1, -0.5, 0, 0.5, 1],
};
const STICKS = 5;

export class Engine {
  constructor() {
    this.rig = RIG;
    this.fixtures = buildFixtures(this.rig);
    this.groups = buildGroups(this.fixtures);
    const N = (this.N = this.fixtures.length);
    const mk = () => Array.from({ length: N }, newState);
    this.A = mk(); this.B = mk(); this.pre = mk(); this.snap = mk(); this.out = mk(); this.cur = mk();
    this.fixtures.forEach((f, i) => { this.cur[i].tilt = f.hang ? 20 : 0; });
    const mkPods = () => Array.from({ length: POD_COUNT }, () => ({ h: 9.5, r: 0, f: new Array(STICKS).fill(0) }));
    this.kinA = mkPods(); this.kinB = mkPods(); this.kinPre = mkPods(); this.kinSnap = mkPods();
    this.pods = mkPods(); // physical
    this.cycA = { top: [0, 0, 0], bot: [0, 0, 0] }; this.cycB = { top: [0, 0, 0], bot: [0, 0, 0] };
    this.cycPre = { top: [0, 0, 0], bot: [0, 0, 0] }; this.cycSnap = { top: [0, 0, 0], bot: [0, 0, 0] };
    this.cyc = { top: [0, 0, 0], bot: [0, 0, 0] };
    this.frame = { x: 0, y: 0, z: 0, m: null };
    this.tmpAim = { pan: 0, tilt: 0 };
    this.tmpDir = { x: 0, y: 0, z: 0 };
    this.tmpRGB = { r: 1, g: 1, b: 1 };
    // render outputs
    this.render = this.fixtures.map(() => ({ x: 0, y: 0, z: 0, dx: 0, dy: -1, dz: 0, r: 0, g: 0, b: 0, I: 0, tan: 0.07, soft: 0.2, len: 10 }));

    this.time = 0; this.beat = 0; this.bpm = 120; this.speed = 1;
    this.shows = []; this.show = null; this.showTime = 0; this.playing = true; this.mode = 'set';
    this.fadeScale = 1;
    this.snapT = 0; this.snapDur = 0;

    this.prog = new Map(); // fixture index → {attr: value, aim: [x,y,z]}
    this.liveFx = [];
    this.kinOverride = null; // {shape, h, amp, period, roll}
    this.highlight = false;
    this.selection = new Set();
    this.m = { grand: 1, pods: 1, floor: 1, cyc: 1, blackout: false, flash: 0, strobeHold: false, strobeRate: 0.6, haze: 0.7 };
    this.motor = 0.35; // pan/tilt response seconds
    this.hoist = 1.4; // m/s
    this.pulse = 0; this.pulseDepth = 0; // audio pulse
    this.section = null; this.sectionIndex = -1;
  }

  group(g) {
    if (Array.isArray(g)) return g;
    return this.groups[g] || this.groups.all;
  }

  setShows(shows) {
    this.shows = shows;
    for (const s of shows) {
      let t = 0;
      for (const sec of s.sections) { sec.start = t; t += sec.d; }
      s.total = t;
    }
  }

  /**
   * Hold one look until the next launch: a scene. Moving to it is the usual
   * snapshot fade for colour and intensity, while pan/tilt and the sticks travel at
   * motor and hoist speed. Call settle() to land everything instantly instead.
   */
  playScene(scene, fade = 3) {
    this.jump(fade);
    this.show = {
      id: `scene:${scene.id}`, name: scene.name, scene: true, bpm: scene.bpm || this.bpm, blurb: '',
      sections: [{ n: scene.name, d: 1e9, f: 0, L: scene.look, start: 0 }], total: 1e9,
    };
    this.showTime = 0;
    this.sectionIndex = -1;
    if (scene.bpm) this.bpm = scene.bpm;
  }

  /** Snap the sticks and moving heads onto their targets over the next frames (thumbnails, links). */
  settle() {
    this.settleNext = 2; // two frames: one to evaluate the new look, one to land on it
    this.snapT = 0;
  }

  loadShow(id, fade = 3) {
    const s = this.shows.find((x) => x.id === id) || null;
    this.jump(fade);
    this.show = s;
    this.showTime = 0;
    this.sectionIndex = -1;
    if (s) this.bpm = s.bpm;
  }

  seek(t, fade = 2.5) {
    if (!this.show) return;
    this.jump(fade);
    this.showTime = Math.max(0, Math.min(this.show.total - 0.01, t));
  }

  gotoSection(delta) {
    if (!this.show) return;
    const secs = this.show.sections;
    let i = this.sectionIndex + delta;
    if (delta < 0 && this.showTime - secs[this.sectionIndex].start > 4) i = this.sectionIndex;
    i = Math.max(0, Math.min(secs.length - 1, i));
    this.seek(secs[i].start + 0.001, 2.5);
  }

  /** Freeze the current output and fade from it over `dur` seconds (used by jumps and GO). */
  jump(dur) {
    if (dur <= 0) { this.snapT = 0; return; }
    for (let i = 0; i < this.N; i++) copyState(this.snap[i], this.pre[i]);
    for (let p = 0; p < POD_COUNT; p++) { const S = this.kinSnap[p], P = this.kinPre[p]; S.h = P.h; S.r = P.r; for (let b = 0; b < STICKS; b++) S.f[b] = P.f[b]; }
    this.cycSnap.top = this.cycPre.top.slice(); this.cycSnap.bot = this.cycPre.bot.slice();
    this.snapT = this.snapDur = dur;
  }

  tap(times) {
    if (times.length >= 2) {
      const iv = [];
      for (let i = 1; i < times.length; i++) iv.push(times[i] - times[i - 1]);
      const mean = iv.reduce((a, b) => a + b, 0) / iv.length;
      if (mean > 0.2 && mean < 2) this.bpm = Math.round((600 / mean)) / 10;
    }
    this.beat = Math.round(this.beat);
  }

  // ——— look evaluation ———
  evalLook(look, c, S, kin, cyc) {
    const F = this.fixtures;
    for (let i = 0; i < this.N; i++) {
      const s = S[i];
      s.dim = 0; s.hue = 0; s.sat = 0; s.pan = 0; s.tilt = F[i].hang ? 20 : 0; s.zoom = 8; s.frost = 0.2; s.strobe = 0;
    }
    if (look) {
      if (look.layers) for (const L of look.layers) this.applyLayer(L, c, S);
      if (look.fx) for (const e of look.fx) this.applyFx(e, c, S, false);
    }
    for (let i = 0; i < this.N; i++) hs2rgb(S[i].hue, S[i].sat, S[i]);
    this.evalKin((look && look.kin) || { shape: 'flat', h: 9.5 }, c, kin);
    this.evalCyc((look && look.cyc) || null, c, cyc);
  }

  applyLayer(L, c, S) {
    const ids = this.group(L.g || 'all'), n = ids.length, F = this.fixtures;
    const dim = val(L.dim, c), pan = val(L.pan, c), tilt = val(L.tilt, c), zoom = val(L.zoom, c);
    const frost = val(L.frost, c), strobe = val(L.strobe, c), hue = val(L.hue, c), sat = val(L.sat, c);
    const col = L.col != null ? hexHS(val(L.col, c)) : null;
    const alt = L.alt != null ? hexHS(val(L.alt, c)) : null;
    const fan = val(L.fan, c), fanT = val(L.fanT, c), hueSpread = val(L.hueSpread, c);
    let aim = val(L.aim, c);
    if (typeof aim === 'string') aim = TARGETS[aim];
    const spread = val(L.spread, c), spreadP = val(L.spreadPod, c);
    for (let j = 0; j < n; j++) {
      const i = ids[j], f = F[i], s = S[i];
      if (dim !== undefined) s.dim = dim;
      if (col) { const k = alt && (f.slot + (L.altPod ? f.pod : 0)) % 2 ? alt : col; s.hue = k[0]; s.sat = k[1]; }
      if (hue !== undefined) s.hue = hue;
      if (sat !== undefined) s.sat = sat;
      if (hueSpread) s.hue += hueSpread * keyOf(f, L.hueBy || 'x', j, n);
      if (aim) {
        let tx = aim[0], ty = aim[1], tz = aim[2];
        if (spread) { const k = keyOf(f, L.spreadBy || 'x', j, n) * 2 - 1; tx += spread[0] * k; ty += spread[1] * k; tz += spread[2] * k; }
        if (spreadP) { const k = f.kpod * 2 - 1; tx += spreadP[0] * k; ty += spreadP[1] * k; tz += spreadP[2] * k; }
        fixtureFrame(f, this, this.frame);
        aimAt(f, this.frame, tx, ty, tz, this.tmpAim);
        s.pan = this.tmpAim.pan; s.tilt = this.tmpAim.tilt;
      } else {
        if (pan !== undefined) s.pan = pan;
        if (tilt !== undefined) s.tilt = tilt;
      }
      if (fan) s.pan += fan * (keyOf(f, L.fanBy || 'x', j, n) * 2 - 1);
      if (fanT) s.tilt += fanT * (keyOf(f, L.fanTBy || 'pod', j, n) * 2 - 1);
      if (zoom !== undefined) s.zoom = zoom;
      if (frost !== undefined) s.frost = frost;
      if (strobe !== undefined) s.strobe = strobe;
    }
  }

  /** Apply one effect. `rgb` = operate on resolved colour (live FX) rather than hue. */
  applyFx(e, c, S, rgb) {
    if (e.on === false) return;
    const ids = this.group(e.g || 'all'), n = ids.length, F = this.fixtures;
    const rate = Math.max(0.0625, val(e.rate, c) ?? 4);
    const size = val(e.size, c) ?? 1, spread = val(e.spread, c) ?? 0, duty = val(e.duty, c) ?? 0.5;
    if (!size) return;
    // integrate phase so rate changes never jump
    if (e._last !== c.frame) { e._ph = (e._ph || 0) + (c.dbeat || 0) / rate * (e.dir || 1); e._last = c.frame; }
    const base = e._ph, w0 = e.w || 'sin', a = e.a || 'dim';
    for (let j = 0; j < n; j++) {
      const i = ids[j], f = F[i], s = S[i];
      let k = keyOf(f, e.by || 'i', j, n);
      if (e.wings) k = 1 - Math.abs(2 * k - 1);
      const ph = base + (e.off || 0) - (k * spread) / 360;
      switch (a) {
        case 'dim': s.dim *= 1 - size + size * wave(w0, ph, duty, i); break;
        case 'pan': s.pan += size * (2 * wave(w0, ph, duty, i) - 1); break;
        case 'tilt': s.tilt += size * (2 * wave(w0, ph, duty, i) - 1); break;
        case 'zoom': s.zoom = Math.max(1, s.zoom + size * (2 * wave(w0, ph, duty, i) - 1)); break;
        case 'frost': s.frost = clamp01(s.frost + size * (2 * wave(w0, ph, duty, i) - 1)); break;
        case 'hue': {
          const d = size * (2 * wave(w0, ph, duty, i) - 1);
          if (rgb) rotateHue(s, d); else s.hue += d;
          break;
        }
        case 'circle': s.pan += size * Math.sin(TAU * ph); s.tilt += size * Math.cos(TAU * ph); break;
        case 'ballyhoo':
          s.pan += size * (2 * vnoise(ph * 2, i * 3.1) - 1);
          s.tilt += size * 0.6 * (2 * vnoise(ph * 2 + 11.7, i * 5.3 + 2) - 1);
          break;
        case 'strobe': s.strobe = Math.max(s.strobe, size * wave(w0, ph, duty, i)); break;
      }
    }
  }

  evalKin(k, c, out) {
    const h = val(k.h, c) ?? 9.5, amp = val(k.amp, c) ?? 0, per = Math.max(1, val(k.period, c) ?? 32), roll = val(k.roll, c) ?? 0;
    const flip = val(k.flip, c) ?? 0, flipWave = val(k.flipWave, c) ?? 0;
    if (k._last !== c.frame) { k._ph = (k._ph || 0) + (c.dbeat || 0) / per; k._last = c.frame; }
    const ph = k._ph || 0;
    for (let p = 0; p < POD_COUNT; p++) {
      const u = p / (POD_COUNT - 1);
      let hh = h, rr = 0;
      switch (k.shape) {
        case 'rake': hh = h + amp * (u * 2 - 1); rr = roll; break;
        case 'arch': hh = h + amp * (Math.sin(Math.PI * u) * 2 - 1); break;
        case 'vee': hh = h + amp * (Math.abs(u * 2 - 1) * 2 - 1); rr = roll * (p % 2 ? 1 : -1); break;
        case 'wave': hh = h + amp * Math.sin(TAU * ph - u * 3.8); rr = roll * Math.cos(TAU * ph - u * 3.8); break;
        case 'twist': hh = h + amp * 0.35 * Math.sin(TAU * ph - u * 2.5); rr = roll * Math.sin(TAU * ph - u * 2.2); break;
        case 'breathe': hh = h + amp * Math.sin(TAU * ph); rr = roll * Math.sin(TAU * ph * 0.5); break;
        case 'tilt': rr = roll; hh = h + amp * (u * 2 - 1); break;
        case 'chaos': hh = h + amp * (2 * vnoise(ph * 2, p * 7.7) - 1); rr = roll * (2 * vnoise(ph * 2 + 9, p * 3.3) - 1); break;
        default: break;
      }
      out[p].h = Math.max(4.2, Math.min(13.5, hh));
      out[p].r = Math.max(-0.4, Math.min(0.4, rr));
      // flips: a base amount, optionally rolling through the rows as a wave
      const pat = FLIP_PATTERN[k.flipMode] || FLIP_PATTERN.all;
      const fr = flip + flipWave * Math.sin(TAU * ph - u * 3.2);
      const rowSign = k.flipMode === 'lattice' && p % 2 ? -1 : 1;
      for (let b = 0; b < STICKS; b++) out[p].f[b] = Math.max(-1, Math.min(1, pat[b] * rowSign * fr));
    }
  }

  evalCyc(cy, c, out) {
    if (!cy) { out.top = [0.01, 0.012, 0.03]; out.bot = [0, 0, 0]; return; }
    const d = val(cy.dim, c) ?? 0.4;
    out.top = cycRGB(val(cy.top, c), d);
    out.bot = cycRGB(val(cy.bot, c), val(cy.botDim, c) ?? d);
  }

  // ——— the frame ———
  update(dt) {
    dt = Math.min(dt, 0.1);
    this.time += dt;
    const dbeat = (dt * this.bpm * this.speed) / 60;
    this.beat += dbeat;
    this.frameNo = (this.frameNo || 0) + 1;
    const N = this.N;

    // 1. show playback
    let sec = null, prev = null, x = 1;
    if (this.show) {
      if (this.playing) this.showTime += dt;
      if (this.showTime >= this.show.total) this.onShowEnd?.();
      const secs = this.show.sections, T = this.showTime;
      let si = 0;
      while (si < secs.length - 1 && secs[si + 1].start <= T) si++;
      if (si !== this.sectionIndex) { this.sectionIndex = si; this.onSection?.(secs[si], si); }
      sec = secs[si];
      prev = si > 0 ? secs[si - 1] : null;
      const fade = (sec.f ?? 4) * this.fadeScale;
      x = fade > 0 ? clamp01((T - sec.start) / fade) : 1;
      const cB = { p: clamp01((T - sec.start) / sec.d), t: T - sec.start, T, beat: this.beat, dbeat, frame: this.frameNo };
      this.evalLook(sec.L, cB, this.B, this.kinB, this.cycB);
      if (prev && x < 1) {
        const cA = { p: 1, t: T - prev.start, T, beat: this.beat, dbeat, frame: this.frameNo };
        this.evalLook(prev.L, cA, this.A, this.kinA, this.cycA);
      }
    } else {
      this.evalLook(null, { p: 0, t: 0, T: 0, beat: this.beat, dbeat, frame: this.frameNo }, this.B, this.kinB, this.cycB);
    }
    this.section = sec;
    const xs = smooth(x);
    for (let i = 0; i < N; i++) {
      if (prev && x < 1) mixState(this.pre[i], this.A[i], this.B[i], xs);
      else copyState(this.pre[i], this.B[i]);
    }
    for (let p = 0; p < POD_COUNT; p++) {
      const a = prev && x < 1 ? this.kinA[p] : this.kinB[p], b = this.kinB[p];
      const K = this.kinPre[p];
      K.h = lerp(a.h, b.h, xs); K.r = lerp(a.r, b.r, xs);
      for (let s = 0; s < STICKS; s++) K.f[s] = lerp(a.f[s], b.f[s], xs);
    }
    const ca = prev && x < 1 ? this.cycA : this.cycB;
    this.cycPre.top = ca.top.map((v, k) => lerp(v, this.cycB.top[k], xs));
    this.cycPre.bot = ca.bot.map((v, k) => lerp(v, this.cycB.bot[k], xs));

    // 2. programmer (LTP overrides)
    const ctx = { p: 0, t: this.time, T: this.showTime, beat: this.beat, dbeat, frame: this.frameNo };
    for (const [i, v] of this.prog) {
      const s = this.pre[i], f = this.fixtures[i];
      if (v.dim !== undefined) s.dim = v.dim;
      if (v.hue !== undefined || v.sat !== undefined) hs2rgb(v.hue ?? 0, v.sat ?? 1, s);
      if (v.aim) {
        fixtureFrame(f, this, this.frame);
        aimAt(f, this.frame, v.aim[0], v.aim[1], v.aim[2], this.tmpAim);
        s.pan = this.tmpAim.pan; s.tilt = this.tmpAim.tilt;
      }
      if (v.pan !== undefined) s.pan = v.pan;
      if (v.tilt !== undefined) s.tilt = v.tilt;
      if (v.zoom !== undefined) s.zoom = v.zoom;
      if (v.frost !== undefined) s.frost = v.frost;
      if (v.strobe !== undefined) s.strobe = v.strobe;
    }
    // 3. live effects
    for (const e of this.liveFx) this.applyFx(e, ctx, this.pre, true);
    if (this.kinOverride) this.evalKin(this.kinOverride, ctx, this.kinPre);

    // 4. snapshot fade (jumps, GO)
    if (this.snapT > 0) {
      this.snapT = Math.max(0, this.snapT - dt);
      const t = smooth(1 - this.snapT / this.snapDur);
      for (let i = 0; i < N; i++) mixState(this.pre[i], this.snap[i], this.pre[i], t);
      for (let p = 0; p < POD_COUNT; p++) {
        const K = this.kinPre[p], S = this.kinSnap[p];
        K.h = lerp(S.h, K.h, t); K.r = lerp(S.r, K.r, t);
        for (let b = 0; b < STICKS; b++) K.f[b] = lerp(S.f[b], K.f[b], t);
      }
      this.cycPre.top = this.cycSnap.top.map((v, k) => lerp(v, this.cycPre.top[k], t));
      this.cycPre.bot = this.cycSnap.bot.map((v, k) => lerp(v, this.cycPre.bot[k], t));
    }

    // 5. MIDI play mode: notes fire over the show (HTP intensity, note colour by level)
    const NL = this.noteLayer;
    if (NL && NL.on) {
      for (let i = 0; i < N; i++) {
        const s = this.pre[i], n = NL.I[i];
        s.dim *= NL.base;
        if (n < 0.002) continue;
        if (NL.hasColor[i]) {
          const w = n / (s.dim + n);
          s.r = lerp(s.r, NL.R[i], w); s.g = lerp(s.g, NL.G[i], w); s.b = lerp(s.b, NL.B[i], w);
        }
        s.dim = Math.max(s.dim, n);
        s.tilt += NL.tilt[i];
      }
      for (let p = 0; p < POD_COUNT; p++) this.kinPre[p].h -= NL.lift[p];
      this.cycPre.top = this.cycPre.top.map((v) => v * (0.3 + 0.7 * NL.base));
      this.cycPre.bot = this.cycPre.bot.map((v) => v * (0.3 + 0.7 * NL.base));
    }

    // 6. highlight + masters
    const m = this.m;
    const pulse = 1 - this.pulseDepth + this.pulseDepth * this.pulse;
    for (let i = 0; i < N; i++) {
      const s = this.out[i], f = this.fixtures[i];
      copyState(s, this.pre[i]);
      if (this.highlight && this.selection.has(i)) { s.dim = 1; s.r = s.g = s.b = 1; s.strobe = 0; continue; }
      let d = s.dim * (f.hang ? m.pods : m.floor) * pulse;
      if (m.flash > 0) d = Math.max(d, m.flash);
      if (m.strobeHold) s.strobe = m.strobeRate;
      s.dim = m.blackout ? 0 : d * m.grand;
    }
    const cm = m.blackout ? 0 : m.cyc * m.grand;
    this.cyc.top = this.cycPre.top.map((v) => v * cm);
    this.cyc.bot = this.cycPre.bot.map((v) => v * cm);

    // 7. physics + render data
    const hk = this.hoist * dt;
    for (let p = 0; p < POD_COUNT; p++) {
      const P = this.pods[p], T = this.kinPre[p];
      const ease = Math.min(1, dt * 2.2);
      P.h += Math.max(-hk, Math.min(hk, (T.h - P.h) * ease));
      P.r += Math.max(-hk * 0.08, Math.min(hk * 0.08, (T.r - P.r) * ease));
      // sticks flip at about 60°/s, like a hoist lifting one end
      const fk = dt * 0.7;
      for (let b = 0; b < STICKS; b++) P.f[b] += Math.max(-fk, Math.min(fk, (T.f[b] - P.f[b]) * ease));
      if (this.settleNext) { P.h = T.h; P.r = T.r; for (let b = 0; b < STICKS; b++) P.f[b] = T.f[b]; }
    }
    const km = this.motor > 0.01 ? 1 - Math.exp(-dt / this.motor) : 1;
    const kz = this.motor > 0.01 ? 1 - Math.exp(-dt / (this.motor * 0.6)) : 1;
    for (let i = 0; i < N; i++) {
      const f = this.fixtures[i], s = this.out[i], c = this.cur[i], R = this.render[i];
      const snap = this.settleNext ? 1 : 0;
      c.pan += (s.pan - c.pan) * (snap || km);
      c.tilt += (s.tilt - c.tilt) * (snap || km);
      c.zoom += (s.zoom - c.zoom) * (snap || kz);
      const fr = fixtureFrame(f, this, this.frame);
      const d = beamDir(f, fr, c.pan, c.tilt, this.tmpDir);
      R.x = fr.x; R.y = fr.y; R.z = fr.z; R.dx = d.x; R.dy = d.y; R.dz = d.z;
      R.m = fr.m;
      let I = s.dim;
      if (s.strobe > 0.02) {
        const hz = 1.5 + s.strobe * 18;
        const ph = this.time * hz + (this.strobeRandom ? f.kr * 7 : 0);
        if (ph - Math.floor(ph) > 0.3) I = 0;
      }
      R.I = I; R.r = s.r * I; R.g = s.g * I; R.b = s.b * I;
      R.tan = Math.tan((Math.max(1, Math.min(60, c.zoom)) * Math.PI) / 360);
      R.soft = clamp01(s.frost);
      R.len = this.beamLength(R);
    }
    if (this.settleNext) this.settleNext--;
  }

  /** Distance to where a beam lands (deck, floor, venue walls, curtain), or 45 m of haze. */
  beamLength(R) {
    const o = landing(this, R.x, R.y, R.z, R.dx, R.dy, R.dz, 45, this.tmpLand || (this.tmpLand = {}));
    R.hit = o.hit;
    return o.L;
  }

  // ——— programmer helpers ———
  progSet(attr, value) {
    for (const i of this.selection) {
      const v = this.prog.get(i) || {};
      v[attr] = value;
      if (attr === 'pan' || attr === 'tilt') delete v.aim;
      this.prog.set(i, v);
    }
  }
  progAim(target) {
    const t = typeof target === 'string' ? TARGETS[target] : target;
    const sel = [...this.selection];
    const n = sel.length;
    sel.forEach((i, j) => {
      const v = this.prog.get(i) || {};
      delete v.pan; delete v.tilt;
      if (target === 'down') { v.pan = 0; v.tilt = 0; delete v.aim; }
      else if (target === 'fan') {
        delete v.aim;
        const f = this.fixtures[i];
        v.pan = (keyOf(f, 'x', j, n) * 2 - 1) * 55; v.tilt = f.hang ? 55 : 25;
      } else v.aim = t.slice();
      this.prog.set(i, v);
    });
  }
  progRelease(attrs) {
    for (const i of this.selection) {
      const v = this.prog.get(i);
      if (!v) continue;
      if (!attrs) this.prog.delete(i);
      else {
        for (const a of attrs) delete v[a];
        if (a2empty(v)) this.prog.delete(i);
      }
    }
  }
  progAttrActive(attr) {
    for (const i of this.selection) {
      const v = this.prog.get(i);
      if (v && (v[attr] !== undefined || ((attr === 'pan' || attr === 'tilt') && v.aim))) return true;
    }
    return false;
  }
  serializeProg() {
    return [...this.prog].map(([i, v]) => [i, { ...v }]);
  }
  loadProg(entries) {
    this.prog = new Map((entries || []).map(([i, v]) => [i, { ...v }]));
  }
}
function cycRGB(hex, d) {
  if (!hex || hex === '#000000') return [0, 0, 0];
  const o = hs2rgb(...hexHS(hex), { r: 0, g: 0, b: 0 });
  return [o.r * d, o.g * d, o.b * d];
}
function a2empty(v) { return Object.keys(v).length === 0; }
