// Chapter 4 — Psychology.
//
//   0  darkness (the pupil); one neuron fires, and fires again
//  10  pull back: a network of 260 neurons wakes — cascades, avalanches
//  36  emotion: a golden wave of joy, a blue fall of sadness, red flickers of fear
//  56  memory: the network lights up in shapes from the story so far —
//      a galaxy, a molecule, a fish, a fire, an eye, a face
//  67  language: a river of words … that falls into the centre and becomes "I"
//  88  a self: the network gathers into rings around a bright point and
//      pulses in synchrony with the beat; it dreams
// 104  it reaches out; another mind answers; then more → Chapter 5

import { Scene } from './scene.js';
import { Network, N } from './ch4/network.js';
import { Mind, MEMORIES, memoryAlpha } from './ch4/mind.js';
import { env, seg, smoothstep, ease, lerp, hash, hsl, mixc } from '../lib/math.js';

const BASE = [0.55, 0.45, 1.0], JOY = [1.0, 0.72, 0.3], SAD = [0.2, 0.38, 1.0], FEAR = [1.0, 0.16, 0.12];
const RINGS = [8, 14, 20, 26, 32, 38, 44, 50, 27];

export class Ch4Psychology extends Scene {
  constructor() {
    super({ id: 'psychology', num: 'IV', title: 'Psychology', subtitle: 'a storm of cells becomes someone', duration: 120 });
    this.beats = [
      { t: 0, name: 'one neuron fires' }, { t: 10, name: 'the network wakes' }, { t: 22, name: 'avalanches' },
      { t: 36, name: 'emotion: joy' }, { t: 44, name: 'sadness' }, { t: 50, name: 'fear' },
      { t: 56, name: 'memory constellations' }, { t: 67, name: 'language' }, { t: 83, name: 'words → "I"' },
      { t: 88, name: 'a self: synchrony' }, { t: 95, name: 'dreaming' }, { t: 104, name: 'reaching out' },
      { t: 110, name: 'another mind' },
    ];
    this.cues = [
      { t: 7.8, d: 5.5, title: 'A neuron fires', sub: 'An electrical pulse races down a single cell' },
      { t: 17.5, d: 7, title: 'A brain', sub: '86 billion neurons; each spike can set off a cascade' },
      { t: 37, d: 7, title: 'Emotion', sub: 'Joy, grief, fear — ancient signals that colour every thought' },
      { t: 57.2, d: 8, title: 'Memory', sub: 'The past, rebuilt from patterns of firing' },
      { t: 73.5, d: 7.5, title: 'Language', sub: 'Sounds become symbols; symbols become thoughts' },
      { t: 91.5, d: 7, title: 'A self', sub: 'A brain that models the world — and itself inside it' },
      { t: 107, d: 7, title: 'Another mind', sub: 'Reaching for someone else' },
    ];
    this.ringPos = [];
    let i = 1;
    RINGS.forEach((n, k) => { for (let j = 0; j < n && i < N; j++, i++) this.ringPos[i] = { k, j, n }; });
    this.boostArr = new Float32Array(N);
  }

  init(E) {
    super.init(E);
    this.net = new Network();
    this.mind = new Mind(this.R);
  }

  update(dt, T, show) {
    this.T = T;
    this.show = show;
    Object.assign(this.post, {
      bloom: 0.9, threshold: 0.35, knee: 0.35, exposure: 1, vignette: 0.55, grain: 0.02,
      sat: 1.05, ca: 0, flash: 0, fade: 1,
    });
  }

  // ── camera ────────────────────────────────────────────────────────────────

  camDist(T) {
    if (T < 7.5) return 0.3;
    if (T < 19) return lerp(0.3, 3.3, ease.inOutCubic(seg(T, 7.5, 19)));
    return lerp(3.3, 2.6, ease.inOutSine(seg(T, 19, 60)));
  }

  yaw(T) {
    // slow turn, easing to a stop for the mandala (so its rings face us)
    const stop = smoothstep(84, 90, T);
    return 0.06 * T * (1 - stop) + 0.06 * 87 * stop;
  }

  makeCam(T) {
    const W = this.R.W, H = this.R.H, cx = W / 2, cy = H / 2;
    const f = H * 1.2, D = this.camDist(T), a = this.yaw(T), pitch = 0.22 * (1 - smoothstep(84, 90, T));
    const ca = Math.cos(a), sa = Math.sin(a), cp = Math.cos(pitch), sp = Math.sin(pitch);
    const toCam = (p) => {
      const x = p[0] * ca + p[2] * sa, z = -p[0] * sa + p[2] * ca;
      const y = p[1] * cp - z * sp, z2 = p[1] * sp + z * cp;
      return [x, y, z2];
    };
    const fromCam = (c) => {
      const y = c[1] * cp + c[2] * sp, z = -c[1] * sp + c[2] * cp;
      return [c[0] * ca - z * sa, y, c[0] * sa + z * ca];
    };
    const cam = (p) => {
      const [x, y, z] = toCam(p);
      const zc = z + D;
      if (zc <= 0.02) return [0, 0, -1, 0];
      return [cx + (f * x) / zc, cy - (f * y) / zc, zc, f / zc / 100];
    };
    return { cam, fromCam, f, D };
  }

  // ── per-neuron colour and layout ─────────────────────────────────────────

  tint(i, T) {
    const p = this.net.pos[i];
    let c = BASE;
    const r = Math.hypot(p[0], p[1], p[2]);
    const joy = Math.exp(-(((r - (T - 36.5) * 0.4) / 0.3) ** 2)) * env(T, 36.5, 46, 0.8, 2.5) + 0.25 * env(T, 37, 46, 2, 2);
    const front = 1.1 - (T - 43.5) * 0.32;
    const sad = smoothstep(front + 0.35, front - 0.35, p[1]) * env(T, 43.5, 52.5, 1.5, 2.5);
    const fear = env(T, 49.5, 56.5, 0.5, 1.8) * (hash(i, Math.floor(T * 7)) > 0.55 ? 1 : 0.15);
    c = mixc(c, JOY, Math.min(1, joy));
    c = mixc(c, SAD, sad);
    c = mixc(c, FEAR, fear);
    const dream = env(T, 94, 104, 2.5, 3);
    if (dream > 0) c = mixc(c, hsl(0.72 + 0.18 * Math.sin(T * 0.6 + i * 0.05), 0.75, 0.62), dream);
    return c;
  }

  emotionWash(T) {
    let c = BASE;
    c = mixc(c, JOY, env(T, 36.5, 46, 1, 2.5));
    c = mixc(c, SAD, env(T, 44, 52.5, 1.5, 2.5));
    c = mixc(c, FEAR, env(T, 49.5, 56.5, 0.5, 1.8) * 0.8);
    return c;
  }

  posOf(i, T, fromCam) {
    const base = this.net.pos[i];
    const mIn = ease.inOutCubic(seg(T, 87, 91.5));
    if (mIn <= 0) return base;
    const heart = this.tempo.heart(this.show);
    const shrink = lerp(1, 0.32, ease.inOutCubic(seg(T, 103.5, 108)));
    const shift = lerp(0, -0.62, ease.inOutCubic(seg(T, 103.5, 108)));
    let c;
    if (i === 0) c = [shift, 0, 0];
    else {
      const { k, j, n } = this.ringPos[i];
      const rot = (k % 2 ? 1 : -1) * (0.12 + 0.025 * k) * T;
      const rr = (0.08 + 0.078 * k) * (1 + 0.06 * heart * (1 - k / 12)) * shrink;
      const a = (j / n) * Math.PI * 2 + rot;
      c = [shift + Math.cos(a) * rr, Math.sin(a) * rr, 0];
    }
    const w = fromCam(c);
    return [lerp(base[0], w[0], mIn), lerp(base[1], w[1], mIn), lerp(base[2], w[2], mIn)];
  }

  // ── render ────────────────────────────────────────────────────────────────

  render(R) {
    const T = this.T, W = R.W, H = R.H, cx = W / 2, cy = H / 2;
    const heart = this.tempo.heart(this.show);

    this.mind.drawBackground(R, T, this.emotionWash(T), smoothstep(2, 10, T) * 0.9);

    const { cam, fromCam } = this.makeCam(T);
    const placed = [];
    for (let i = 0; i < N; i++) placed.push(this.posOf(i, T, fromCam));
    const posOf = (i) => placed[i];

    // which neurons sit on the current memory's outline
    const boost = this.boostArr;
    boost.fill(0);
    const s = Math.min(W, H) * 0.34;
    for (const m of MEMORIES) {
      const a = memoryAlpha(m, T);
      if (a <= 0.01) continue;
      const pts = this.mind.shapePoints(m, cx, cy, s);
      for (let i = 0; i < N; i++) {
        const p = cam(posOf(i));
        let best = 1e9;
        for (const q of pts) best = Math.min(best, (p[0] - q[0]) ** 2 + (p[1] - q[1]) ** 2);
        boost[i] = Math.max(boost[i], a * Math.exp(-best / (22 * 22)));
      }
    }

    // the network (dim for the first seconds: only neuron 0 is lit)
    const firstOnly = 1 - smoothstep(9, 14, T);
    const selfPhase = smoothstep(87, 91, T);
    // step back while memories and words take the stage
    const recede = 1 - 0.55 * env(T, 55.5, 91.5, 1.5, 3);
    this.net.draw(R, cam, {
      T, alpha: smoothstep(0.6, 2.5, T) * (1 - smoothstep(117.5, 122, T)) * recede,
      tint: (i) => {
        const c = this.tint(i, T);
        const dim = i === 0 ? 1 : 1 - firstOnly * 0.92;
        const pulse = selfPhase * heart * 0.5;
        return [c[0] * dim * (1 + pulse), c[1] * dim * (1 + pulse), c[2] * dim * (1 + pulse)];
      },
      posOf, boost: (i) => boost[i],
      lines: 1 - 0.8 * selfPhase,
      glowScale: 1 + selfPhase * heart * 0.4,
      halo: 1 - 0.6 * selfPhase,
    });

    // memories as constellations
    for (const m of MEMORIES) this.mind.drawMemory(R, m, T, cx, cy, s);

    // language: the river of words, then "I"
    this.mind.drawWords(R, T, W, H);

    // the self, and the reach toward others
    const selfA = smoothstep(89.5, 91.5, T) * (1 - smoothstep(119, 122.5, T));
    const self = cam(posOf(0));
    this.mind.drawSelf(R, self[0], self[1], T, heart, selfA, lerp(1, 0.6, smoothstep(104, 108, T)));
    if (T > 104) {
      const others = [
        { id: 1, x: cx + W * 0.28, y: cy - H * 0.06, r: 30, t: 109.5, c: [0.6, 0.8, 1.0], seed: 11, bend: 0.35 },
        { id: 2, x: cx + W * 0.1, y: cy - H * 0.32, r: 22, t: 112.4, c: [1.0, 0.62, 0.55], seed: 12, from: 1, bend: -0.4 },
        { id: 3, x: cx + W * 0.16, y: cy + H * 0.3, r: 26, t: 113.4, c: [0.65, 1.0, 0.7], seed: 13, bend: 0.5 },
        { id: 4, x: cx + W * 0.42, y: cy + H * 0.2, r: 20, t: 114.6, c: [1.0, 0.9, 0.55], seed: 14, from: 1, bend: 0.25 },
        { id: 5, x: cx - W * 0.02, y: cy - H * 0.12, r: 18, t: 115.6, c: [0.85, 0.7, 1.0], seed: 15, from: 2, bend: -0.3 },
        { id: 6, x: cx - W * 0.36, y: cy - H * 0.28, r: 22, t: 116.5, c: [0.6, 0.95, 1.0], seed: 16, bend: -0.5 },
      ];
      this.mind.drawReach(R, T, { x: self[0], y: self[1] }, others, heart);
    }
  }

  yearsAgo(T) {
    return Math.exp(lerp(Math.log(60e3), Math.log(14e3), seg(T, 0, 120)));
  }

  timelineAlpha(T) { return smoothstep(10, 14, T); }
}
