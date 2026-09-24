// Chapter 1 — Physics.
//
// One continuous camera move from nothing to a supernova:
//   0  void, a quivering point          28  dark ages → the cosmic web grows
//   6  the Big Bang                     44  first stars ignite in the knots
//   8  quark–gluon plasma cooling       50  a knot collapses into a galaxy
//  12  quarks bind into protons         70  dive through an arm into one star
//  16  the first nuclei                 84  inside the core: fusion, locking
//  22  recombination → the CMB              onto the heartbeat
//                                      99  the forge: carbon, oxygen …
//                                     105  pull back: the onion of shells
//                                     112  collapse → bounce → supernova
// The debris of element-colored atoms drifting in the dark is the first
// frame of Chapter 2.

import { Scene } from './scene.js';
import { EarlyUniverse, BANG } from './ch1/early.js';
import { CosmicWeb } from './ch1/web.js';
import { Galaxy } from './ch1/galaxy.js';
import { StarSurface } from './ch1/star.js';
import { FusionCore, CORE_START } from './ch1/fusion.js';
import { Supernova, shockAt } from './ch1/supernova.js';
import { HEADER, NOISE, PALETTES } from '../gfx/glsl.js';
import { SHAPE } from '../gfx/renderer.js';
import { clamp, env, seg, smoothstep, ease, lerp, mat4, project, v3 } from '../lib/math.js';

const S_G = 0.035;      // galaxy radius, in units of the cosmic-web box
// bloom per beat: generous on dark starfields, restrained on bright surfaces
const POST_KEYS = [
  [0, { bloom: 1.0, threshold: 0.45 }], [30, { bloom: 1.0, threshold: 0.45 }],
  [32, { bloom: 1.1, threshold: 0.25 }], [79, { bloom: 1.1, threshold: 0.25 }],
  [82, { bloom: 0.35, threshold: 1.0 }], [86, { bloom: 0.35, threshold: 1.0 }],
  [88, { bloom: 0.75, threshold: 0.6 }], [110, { bloom: 0.75, threshold: 0.6 }],
  [113, { bloom: 1.2, threshold: 0.4 }],
];
function keyed(T, keys) {
  if (T <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (T <= keys[i][0]) {
      const [t0, a] = keys[i - 1], [t1, b] = keys[i];
      const u = ease.inOutSine((T - t0) / (t1 - t0));
      const out = {};
      for (const key in a) out[key] = lerp(a[key], b[key], u);
      return out;
    }
  }
  return keys[keys.length - 1][1];
}

/** On-screen radius of the dive-target star: an exponential plunge. */
const starRadius = (T, H) => H * 0.08 * Math.exp(0.62 * (T - 80.5));
const BOUNCE = 114.6;   // core bounce → supernova

const CORE_FS = `${HEADER}
uniform vec2 u_view;
uniform float u_t, u_bright, u_pulse, u_zoom;
in vec2 v_px; out vec4 o;
${NOISE}
${PALETTES}
void main() {
  vec2 p = (v_px - 0.5 * u_view) / u_view.y / u_zoom;
  vec3 q = vec3(p * 2.0, u_t * 0.07);
  vec2 w = vec2(vfbm(q), vfbm(q + vec3(3.1, 7.7, 1.3)));
  float n = vfbm(vec3(p * 2.8 + (w - 0.5) * 3.0, u_t * 0.11 + 2.0));
  float m = clamp((n - 0.5) * 3.4, -1.0, 1.0);
  float ridge = pow(1.0 - abs(m), 7.0);
  float body = 0.5 + 0.5 * m;
  vec3 col = blackbody(0.34 + 0.16 * body + 0.32 * ridge) * (0.16 + 0.55 * body * body + 1.2 * ridge);
  col *= u_bright * (0.75 + 0.45 * u_pulse);
  o = vec4(col, 1.0);
}`;

export class Ch1Physics extends Scene {
  constructor() {
    super({ id: 'physics', num: 'I', title: 'Physics', subtitle: 'matter, energy, and the laws that shape them', duration: 120 });
    this.beats = [
      { t: 0, name: 'the void' }, { t: BANG, name: 'the Big Bang' }, { t: 8, name: 'quark–gluon plasma' },
      { t: 11.5, name: 'quarks bind: protons & neutrons' }, { t: 16, name: 'first nuclei' },
      { t: 22, name: 'recombination → CMB' }, { t: 28, name: 'dark ages' }, { t: 36, name: 'cosmic web' },
      { t: 44, name: 'first stars' }, { t: 50, name: 'galaxy forms' }, { t: 70, name: 'dive into a star' },
      { t: 81, name: 'photosphere' }, { t: CORE_START, name: 'core: pp-chain fusion' },
      { t: 92, name: 'fusion locks to the pulse' }, { t: 99, name: 'triple-alpha: carbon, oxygen' },
      { t: 105, name: 'pull back: the onion' }, { t: 112.5, name: 'core collapse' }, { t: BOUNCE, name: 'supernova' },
    ];
    this.cues = [
      { t: 7.6, d: 4.6, title: 'The Big Bang', sub: '13.8 billion years ago, everything at once' },
      { t: 12.6, d: 7.4, title: 'The first three minutes', sub: 'Quarks bind into protons and neutrons; the first nuclei fuse' },
      { t: 22.6, d: 6.6, title: 'First light', sub: '380,000 years: atoms form, and the universe turns transparent' },
      { t: 30.6, d: 5.6, title: 'The dark ages', sub: 'No stars yet — only gas and dark matter, slowly gathering' },
      { t: 37.2, d: 6.4, title: 'The cosmic web', sub: 'Gravity draws matter into sheets, filaments and knots' },
      { t: 45, d: 5.6, title: 'First stars', sub: 'About 200 million years after the Big Bang' },
      { t: 55, d: 7, title: 'Galaxies', sub: 'Hundreds of billions of stars wheel around each knot' },
      { t: 71, d: 7, title: 'A star', sub: 'Gravity squeezes a ball of gas until its core reaches fifteen million degrees' },
      { t: 86, d: 8, title: 'Fusion', sub: 'Protons collide and fuse: hydrogen becomes helium, mass becomes light' },
      { t: 99.4, d: 6.6, title: 'The forge', sub: 'Helium fuses to carbon, carbon to oxygen — and on, all the way to iron' },
      { t: 115.2, d: 6, title: 'Supernova', sub: 'The core collapses, rebounds, and scatters its elements across space' },
    ];
    // look-dev knobs (tweak live via origins.director.scenes[0].tune)
    this.tune = { webBright: 0.3, webPs: 1.1, webNear: 0.018, galBright: 2.0, galPs: 9.5 };
    this.vpWorld = mat4.create();
    this.vpLocal = mat4.create();
    this._proj = mat4.create();
    this._view = mat4.create();
    this.coreFF = null;
  }

  init(E) {
    super.init(E);
    const R = this.R;
    this.early = new EarlyUniverse(R);
    this.web = new CosmicWeb(R);
    this.galaxy = new Galaxy(R);
    this.star = new StarSurface(R);
    this.core = new FusionCore();
    this.nova = new Supernova(R);
    this.coreProg = R.fsProgram(CORE_FS, 'ch1-core');
  }

  seek(T) {
    if (T >= 26) this.web.finish();
    this.core.reset();
    this.coreFF = T > CORE_START ? T : null;
  }

  // ── time & camera ────────────────────────────────────────────────────────

  /** Galaxy clock: rotation slows as we zoom into ever smaller scales. */
  galTime(T) {
    const r0 = 0.35, r1 = 0.04;
    if (T <= 70) return r0 * (T - 48);
    const u = Math.min(T, 77) - 70;
    let t = r0 * 22 + r0 * u + ((r1 - r0) * u * u) / 14;
    if (T > 77) t += r1 * (T - 77);
    return t;
  }

  /** Distance from the camera to the dive-target star (galaxy units). */
  diveDist(T) {
    const d70 = this._off70len;
    if (T <= 70) return d70;
    if (T <= 81.5) return d70 * Math.exp(-0.53 * (T - 70));
    return d70 * Math.exp(-0.53 * 11.5) * Math.exp(-0.95 * (T - 81.5));
  }

  orbitEye(T) {
    const dist = T < 52 ? lerp(13.5, 2.7, ease.inOutSine(seg(T, 28, 52))) : lerp(2.7, 1.8, ease.inOutSine(seg(T, 52, 70)));
    const az = 0.55 + 0.024 * (T - 28);
    const el = lerp(0.22, 0.62, ease.inOutSine(seg(T, 50, 63))) - 0.14 * ease.inOutSine(seg(T, 63, 70));
    return [dist * Math.cos(el) * Math.cos(az), dist * Math.sin(el), dist * Math.cos(el) * Math.sin(az)];
  }

  camera(T) {
    const eye70 = this.orbitEye(70);
    const star70 = this.galaxy.targetPos(this.galTime(70));
    const off70 = v3.sub(eye70, star70);
    this._off70len = v3.len(off70);
    if (T <= 70) return { eye: this.orbitEye(T), target: [0, 0, 0] };
    const star = this.galaxy.targetPos(this.galTime(T));
    const f = this.diveDist(T) / this._off70len;
    const eye = v3.add(star, v3.scale(off70, f));
    const target = v3.lerp([0, 0, 0], star, ease.inOutSine(seg(T, 70, 75)));
    return { eye, target, star };
  }

  // ── per frame ────────────────────────────────────────────────────────────

  update(dt, T, show) {
    this.T = T;
    this.show = show;
    if (!this.web.ready) {
      if (T >= 27) this.web.finish();
      else this.web.step(4);
    }
    if (this.coreFF !== null) {
      const target = Math.min(this.coreFF, 113);
      this.coreFF = null;
      for (let t = CORE_START; t < target; t += 1 / 60) this.core.step(1 / 60, t, show - T + t, this.tempo);
    } else if (T >= CORE_START && T < 113) {
      this.core.step(dt, T, show, this.tempo);
    }
    this._updatePost(T, show);
  }

  _updatePost(T, show) {
    const p = this.post;
    const e = this.early.post(T);
    const heart = this.tempo.heart(show);
    const inCore = env(T, CORE_START + 1, 112, 2, 2) * smoothstep(90, 96, T);
    const k = keyed(T, POST_KEYS);
    p.bloom = k.bloom + 0.35 * inCore * heart;
    p.threshold = k.threshold;
    p.knee = 0.35;
    p.bloomRadius = 1.0;
    p.exposure = e.exposure * (1 + 0.08 * inCore * heart);
    p.vignette = 0.5;
    p.grain = 0.02;
    p.sat = 1.05;
    p.ca = e.ca + 0.9 * env(T, BOUNCE - 0.2, BOUNCE + 2, 0.1, 1.8);
    let flash = e.flash;
    if (T > BOUNCE - 0.05) {
      const k = T - BOUNCE;
      flash = Math.max(flash, k < 0.1 ? 0.88 * smoothstep(-0.05, 0.1, k) : 0.88 * Math.exp(-(k - 0.1) * 2.3));
    }
    p.flash = flash;
    p.flashColor = T > 50 ? [1, 0.96, 0.9] : [1, 1, 1];
    p.fade = 1;
  }

  render(R) {
    const T = this.T, W = R.W, H = R.H;
    const sc = H / 900;

    // 0–32 s: void, bang, plasma, CMB
    if (T < 32.5) this.early.render(R, T);

    // 28–60 s: the cosmic web, and a galaxy condensing out of its richest knot
    const cam = this.camera(T);
    const needsGalaxy = T > 47 && T < 84.5;
    const needsWeb = T > 28.5 && T < 61 && this.web.ready;
    if (needsWeb || needsGalaxy || (T > 66 && T < 87)) {
      mat4.perspective(this._proj, (55 * Math.PI) / 180, W / H, 0.0004, 400);
      mat4.lookAt(this._view, cam.eye, cam.target, [0, 1, 0]);
      mat4.multiply(this.vpLocal, this._proj, this._view);
    }
    if (needsWeb) {
      const node = this.web.node;
      const eyeW = v3.add(node, v3.scale(cam.eye, S_G));
      const tgtW = v3.add(node, v3.scale(cam.target, S_G));
      mat4.perspective(this._proj, (55 * Math.PI) / 180, W / H, 0.0002, 10);
      mat4.lookAt(this._view, eyeW, tgtW, [0, 1, 0]);
      mat4.multiply(this.vpWorld, this._proj, this._view);
      const D = 0.08 + (this.web.dFinal - 0.08) * ease.inOutSine(seg(T, 30, 53));
      this.web.draw(R, {
        vp: this.vpWorld, cam: eyeW, D,
        bright: this.tune.webBright * smoothstep(28.5, 32, T) * (1 - smoothstep(52, 60, T)),
        fogFar: 0.47, near: this.tune.webNear, ps: this.tune.webPs * sc, stars: smoothstep(43, 47.5, T), time: T,
      });
    }
    if (needsGalaxy) {
      const tg = this.galTime(T);
      const form = ease.inOutSine(seg(T, 49, 61));
      const bright = smoothstep(47, 53, T) * (1 - smoothstep(83, 84.5, T));
      this.galaxy.draw(R, {
        vp: this.vpLocal, t: tg, form, ps: this.tune.galPs * sc, ref: 2.4,
        bright: bright * this.tune.galBright, dust: smoothstep(55, 62, T),
      });
      // the core's diffuse glow
      const c = project(this.vpLocal, 0, 0, 0, W, H);
      if (c[2] > 0) {
        const dist = v3.len(cam.eye);
        R.sprites.add(c[0], c[1], (H * 0.5) / dist, [1.0, 0.8, 0.55], 0.1 * bright * form, SHAPE.glow);
        R.sprites.flush('add');
      }
    }

    // 68–86 s: the dive target, then its surface
    if (T > 66 && T < 87 && cam.star) {
      const radius = starRadius(T, H);
      const sp = project(this.vpLocal, cam.star[0], cam.star[1], cam.star[2], W, H);
      if (sp[2] > 0) {
        const sprite = smoothstep(68, 72, T) * (1 - smoothstep(81.2, 82.4, T));
        if (sprite > 0) {
          R.sprites.add(sp[0], sp[1], Math.max(3, radius * 1.1), [1, 0.93, 0.8], 1.6 * sprite, SHAPE.glow);
          R.sprites.add(sp[0], sp[1], Math.max(24, radius * 7), [1, 0.9, 0.75], 0.55 * sprite, SHAPE.flare, 0.8);
          R.sprites.flush('add');
        }
        const surf = smoothstep(80.8, 82.2, T) * (1 - smoothstep(85.4, 86.4, T));
        if (surf > 0) {
          const plunge = smoothstep(84.2, 85.8, T);
          this.star.draw(R, {
            cx: sp[0], cy: sp[1], radius, t: T * 6,
            bright: surf * (1 + plunge * 0.6), heat: 0.68 + 0.1 * plunge,
          });
        }
      }
    }

    // 84–112 s: inside the core
    if (T > CORE_START && T < 113.5) {
      const heart = this.tempo.heart(this.show);
      const lock = smoothstep(90, 100, T);
      const zoomOut = ease.inOutCubic(seg(T, 104.5, 110));
      const vis = smoothstep(85.0, 86.6, T);
      R.lowres(() => {
        R.pass(this.coreProg, {
          u_t: T, u_bright: vis * (1 - zoomOut) * (0.6 + 0.4 * (1 - smoothstep(86, 88.5, T))),
          u_pulse: heart * lock, u_zoom: lerp(1, 0.3, zoomOut),
        });
      }, 'add');
      const baseR = 0.47 * Math.min(W, H);
      this.core.draw(R, {
        cx: W / 2, cy: H / 2, Rpx: baseR * lerp(1, 0.07, zoomOut),
        alpha: smoothstep(85.8, 87.4, T) * (1 - smoothstep(108.5, 110.5, T)),
        heart: heart * lock,
      });
    }

    // 105–116 s: the onion, collapse and bounce
    if (T > 105 && T < 117) {
      const radius = 0.42 * Math.min(W, H);
      const collapse = ease.inExpo(seg(T, 112.4, BOUNCE - 0.12));
      const tb = T - BOUNCE;
      this.nova.drawOnion(R, {
        cx: W / 2, cy: H / 2, radius, t: T,
        collapse, pulse: this.tempo.heart(this.show) * (1 - collapse),
        bright: smoothstep(106, 109.5, T) * (1 + collapse * 0.8) * (tb > 0 ? Math.exp(-tb * 1.6) : 1),
        shock: shockAt(tb), burst: tb > 0 ? Math.exp(-tb * 1.1) : 0,
      });
      this.nova.drawLabels(R, { cx: W / 2, cy: H / 2, radius, alpha: env(T, 108.4, 112.6, 1.2, 0.8) });
      this.nova.drawNeutrinos(R, { cx: W / 2, cy: H / 2, radius, t: T - (BOUNCE - 0.18) });
    }

    // 114.6 s →: the remnant drifts outward, cooling into element colors
    if (T > BOUNCE) {
      const radius = 0.42 * Math.min(W, H);
      const zoom = 1 + 0.07 * Math.max(0, T - 116.5) ** 1.5;
      this.nova.drawDebris(R, { cx: W / 2, cy: H / 2, radius, t: T - BOUNCE, alpha: 1, zoom });
      const tb = T - BOUNCE;
      R.sprites.add(W / 2, H / 2, radius * (0.3 + tb * 2.2), [1, 0.9, 0.8], 3 * Math.exp(-tb * 3), SHAPE.glow);
      R.sprites.add(W / 2, H / 2, radius * shockAt(tb) * 1.05, [0.7, 0.85, 1.2], 1.5 * Math.exp(-tb * 1.5), SHAPE.ring, 0.03);
      R.sprites.flush('add');
    }
  }

  // ── storytelling ─────────────────────────────────────────────────────────

  yearsAgo(T) {
    const AGE = 13.8e9;
    if (T < 30) return AGE;
    if (T < 46) return AGE - lerp(380e3, 200e6, ease.inQuad(seg(T, 30, 46)));
    if (T < 58) return AGE - lerp(200e6, 1.2e9, seg(T, 46, 58));
    if (T < 84) return lerp(12.6e9, 5.2e9, ease.inOutSine(seg(T, 58, 84)));
    return lerp(5.2e9, 4.65e9, seg(T, 84, 120));
  }

  timelineAlpha(T) {
    return smoothstep(7.5, 9.5, T) * clamp(1 - env(T, BOUNCE - 0.2, BOUNCE + 1.5, 0.1, 1));
  }
}
