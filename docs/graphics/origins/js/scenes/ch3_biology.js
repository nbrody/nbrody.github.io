// Chapter 3 — Biology.
//
//   0  the protocell finishes dividing; a colony grows by fission
//  13  cyanobacteria: photosynthesis, oxygen bubbles, the sea clears to blue
//  26  endosymbiosis: a cell swallows a bacterium → mitochondrion
//  33  a Volvox sphere: cells that stay together
//  38  a jellyfish — radial bodies
//  44  the parade: trilobite → fish → tetrapod → sauropod
//  64  the asteroid → mammals
//  72  ecosystems in time-lapse: days, seasons, herds, birds
//  90  night on the savanna: the Milky Way, a fire, people
// 100  one of them stands and looks up
// 107  into the eye; the pupil opens; we fall through it → Chapter 4

import { Scene } from './scene.js';
import { Cells } from './ch3/cells.js';
import { drawCreature, drawJellyfish } from './ch3/creatures.js';
import { Land } from './ch3/land.js';
import { Eye } from './ch3/eye.js';
import { SHAPE } from '../gfx/renderer.js';
import { env, seg, smoothstep, ease, lerp, clamp } from '../lib/math.js';

// the parade: [start of morph, from, to]
const MORPHS = [
  [44.5, 'trilobite', 'trilobite'],
  [49.2, 'trilobite', 'fish'],
  [54.2, 'fish', 'tetrapod'],
  [59.2, 'tetrapod', 'sauropod'],
  [65.8, 'sauropod', 'mammal'],
];
const MORPH_LEN = 2.4;
const IMPACT = 65.0;

const POST_KEYS = [
  [0, { bloom: 0.8, threshold: 0.4 }], [38, { bloom: 0.85, threshold: 0.35 }],
  [42, { bloom: 1.0, threshold: 0.3 }], [70, { bloom: 1.0, threshold: 0.3 }],
  [74, { bloom: 0.45, threshold: 0.85 }], [88, { bloom: 0.45, threshold: 0.85 }],
  [93, { bloom: 1.0, threshold: 0.4 }], [106, { bloom: 1.0, threshold: 0.4 }],
  [109, { bloom: 0.55, threshold: 0.75 }],
];
function keyed(T, keys) {
  if (T <= keys[0][0]) return keys[0][1];
  for (let i = 1; i < keys.length; i++) {
    if (T <= keys[i][0]) {
      const [t0, a] = keys[i - 1], [t1, b] = keys[i];
      const u = ease.inOutSine((T - t0) / (t1 - t0));
      return { bloom: lerp(a.bloom, b.bloom, u), threshold: lerp(a.threshold, b.threshold, u) };
    }
  }
  return keys[keys.length - 1][1];
}

export class Ch3Biology extends Scene {
  constructor() {
    super({ id: 'biology', num: 'III', title: 'Biology', subtitle: 'life, from one cell to a mind that looks up', duration: 120 });
    this.beats = [
      { t: 0, name: 'first cells: fission' }, { t: 13, name: 'photosynthesis, oxygen' }, { t: 26, name: 'endosymbiosis' },
      { t: 33, name: 'multicellular (Volvox)' }, { t: 38, name: 'jellyfish' }, { t: 44.5, name: 'Cambrian: trilobite' },
      { t: 49, name: 'fish' }, { t: 54, name: 'onto land' }, { t: 59, name: 'dinosaurs' }, { t: IMPACT, name: 'impact' },
      { t: 66, name: 'mammals' }, { t: 72, name: 'ecosystems time-lapse' }, { t: 90, name: 'night, fire, people' },
      { t: 100, name: 'one stands, looks up' }, { t: 107, name: 'the eye' }, { t: 115, name: 'through the pupil' },
    ];
    this.cues = [
      { t: 7.4, d: 6, title: 'Life', sub: 'About 3.8 billion years ago: the first cells, dividing' },
      { t: 15.4, d: 7.5, title: 'Photosynthesis', sub: 'Cyanobacteria split water with sunlight — oxygen fills the sea and the sky' },
      { t: 26.8, d: 6, title: 'A partnership', sub: 'One cell swallows another; it becomes the mitochondrion inside every complex cell' },
      { t: 33.6, d: 5, title: 'Multicellular life', sub: 'Cells stay together, and begin to specialize' },
      { t: 39.4, d: 5, title: 'Animals', sub: 'The first animal bodies drift through the seas' },
      { t: 45.4, d: 4.8, title: 'The Cambrian explosion', sub: '541 million years ago: eyes, shells, legs — and predators' },
      { t: 50.4, d: 4.4, title: 'Fish', sub: 'Backbones, then jaws' },
      { t: 55.4, d: 4.4, title: 'Onto land', sub: '375 million years ago, fins become limbs' },
      { t: 60.4, d: 4.4, title: 'Dinosaurs', sub: 'For 165 million years they rule the land' },
      { t: 65.3, d: 2.8, title: 'Impact', sub: '66 million years ago' },
      { t: 68.3, d: 4.4, title: 'Mammals', sub: 'Small survivors inherit the Earth' },
      { t: 74.5, d: 7, title: 'Ecosystems', sub: 'Forests, grasslands, and a web of countless species' },
      { t: 83, d: 6, title: 'Deep time', sub: 'Seasons turn; species rise and fall' },
      { t: 93.5, d: 7, title: 'Homo sapiens', sub: 'About 300,000 years ago: fire, tools, language, stories' },
      { t: 103.2, d: 6, title: 'Wonder', sub: 'Made of star stuff, a mind looks up at the stars' },
    ];
  }

  init(E) {
    super.init(E);
    this.cells = new Cells(this.R);
    this.land = new Land(this.R);
    this.eye = new Eye(this.R);
  }

  update(dt, T) {
    this.T = T;
    const k = keyed(T, POST_KEYS);
    const impact = T > IMPACT ? Math.exp(-(T - IMPACT) * 2.2) * smoothstep(IMPACT, IMPACT + 0.08, T) : 0;
    Object.assign(this.post, {
      bloom: k.bloom, threshold: k.threshold, knee: 0.35, exposure: 1, vignette: 0.5, grain: 0.02,
      sat: 1.05, ca: impact * 0.8, flash: impact * 0.55, flashColor: [1, 0.8, 0.55], fade: 1,
    });
  }

  colonyScale(T, M) {
    // frame the growing colony: average the extent a little to stay smooth
    let e = 0;
    for (const d of [-0.6, -0.3, 0, 0.3, 0.6]) e += this.cells.extent(Math.max(0, T + d)) / 5;
    return (M * 0.42) / Math.max(0.46, e);
  }

  render(R) {
    const T = this.T, W = R.W, H = R.H, cx = W / 2, cy = H / 2;
    const M = Math.min(W, H);

    // 0–72 s: water, then shore and sky
    const waterA = 1 - smoothstep(53, 58, T);
    const skyOn = T < 74;
    if (skyOn) {
      const clear = smoothstep(14, 24, T);
      // on land the sky is held at dusk, so the glowing bodies still read
      this.land.drawSky(R, {
        t: T, water: waterA, day: 0.27, horizon: 0.8,
        tint: [lerp(0.75, 1, clear), lerp(0.85, 1, clear), lerp(0.35, 1, clear)],
        bright: smoothstep(0, 3, T) * lerp(0.55, 0.9, clear) * (T < 40 ? 0.8 : 1) * lerp(1, 0.5, 1 - waterA),
        stars: 0.4, sunX: 0.16,
      });
    }

    // 0–27 s: the colony
    if (T < 27.5) {
      const scale = this.colonyScale(T, M);
      const fr = this.cells.drawColony(R, {
        T, cx, cy, scale, bright: 1 - smoothstep(24.5, 27, T), green: smoothstep(12.5, 17, T),
      });
      this.cells.drawBubbles(R, { T, cx, cy, scale, alpha: env(T, 14, 27, 2, 2), frame: fr });
    }

    // 25–34 s: endosymbiosis
    if (T > 24.5 && T < 34.5) {
      const u = ease.inOutSine(seg(T, 25.5, 30.5));
      this.cells.drawEukaryote(R, {
        cx, cy, radius: M * lerp(0.36, 0.34, seg(T, 25, 34)), t: T,
        eng: seg(T, 27.8, 31.5), bright: smoothstep(24.5, 26.5, T) * (1 - smoothstep(32.5, 34.3, T)),
        bact: [lerp(1.7, 0.5, u), lerp(-0.2, -0.38, u)],
      });
    }

    // 32–40 s: Volvox
    if (T > 32 && T < 40.5) {
      this.cells.drawVolvox(R, { cx, cy, radius: M * lerp(0.26, 0.33, seg(T, 32, 40)), t: T, alpha: env(T, 32.5, 40.2, 1.6, 1.5) });
    }

    // 38–46 s: a jellyfish
    if (T > 38 && T < 46.5) {
      drawJellyfish(R, { x: cx, y: cy - H * 0.12 - (T - 38) * H * 0.012, s: M * 0.14, t: T, alpha: env(T, 38.5, 46.2, 1.5, 1.6) });
    }

    // 44–73 s: the parade of forms
    if (T > 44 && T < 73.5) {
      if (T > 52) this.land.drawShore(R, { land: smoothstep(52.5, 58, T), alpha: 1 - smoothstep(71, 73.5, T) });
      R.flush2D(1);
      let a = MORPHS[0][1], b = MORPHS[0][2], k = 0;
      for (const [t0, from, to] of MORPHS) if (T >= t0) { a = from; b = to; k = clamp((T - t0) / MORPH_LEN); }
      const alpha = smoothstep(44.3, 46, T) * (1 - smoothstep(70.8, 73.2, T)) * (T > IMPACT && T < 66.5 ? 0.35 + 0.65 * smoothstep(IMPACT + 0.5, 66.4, T) : 1);
      const run = smoothstep(69, 73, T);
      drawCreature(R, {
        a, b, k, t: T, alpha,
        xf: { x: cx + Math.sin(T * 0.3) * W * 0.03 + run * W * 0.45, y: cy + (b === 'sauropod' ? H * 0.05 : 0) + (b === 'mammal' ? H * 0.08 : 0), s: M * 0.34 },
      });
    }

    // the asteroid
    if (T > IMPACT - 1.2 && T < IMPACT + 3) {
      const S = R.sprites;
      const u = clamp((T - (IMPACT - 1.2)) / 1.2);
      const x0 = W * 0.05, y0 = -H * 0.05, x1 = W * 0.78, y1 = H * 0.7;
      const x = lerp(x0, x1, u), y = lerp(y0, y1, u);
      if (u < 1) {
        R.lines.add(lerp(x0, x1, Math.max(0, u - 0.25)), lerp(y0, y1, Math.max(0, u - 0.25)), x, y, 4, [1, 0.6, 0.3], 0, [1.5, 1.2, 0.9], 1.5, 1);
        R.lines.flush('add');
        S.add(x, y, 10, [1.5, 1.3, 1.0], 2, SHAPE.glow);
      }
      const k = T - IMPACT;
      if (k > 0) {
        S.add(x1, y1, H * (0.1 + k * 0.5), [1, 0.55, 0.25], 2.5 * Math.exp(-k * 1.2), SHAPE.glow);
        S.add(x1, y1, H * (0.05 + k * 0.9), [1, 0.7, 0.4], 1.2 * Math.exp(-k * 1.5), SHAPE.ring, 0.05);
      }
      S.flush('add');
    }

    // 71–95 s: ecosystems in time-lapse
    const ecoA = smoothstep(71, 74.5, T) * (1 - smoothstep(92, 95, T));
    if (ecoA > 0.001) {
      const night = smoothstep(88, 93, T);
      const day = 0.5 + 0.23 * Math.sin((T - 72) * 1.3);
      const sunH = -Math.cos(day * Math.PI * 2);
      const light = clamp(smoothstep(-0.25, 0.35, sunH) * (1 - night) * 1.05);
      this.land.drawSky(R, { t: T, day, night, horizon: 0.66, bright: ecoA, milky: night, stars: night });
      this.land.drawEcosystem(R, { t: T, season: (T - 71) / 4.5, light: 0.25 + 0.75 * light, alpha: ecoA });
      R.flush2D(1);
    }

    // 89–110 s: night, fire, people; one stands and looks up
    const fireA = smoothstep(89.5, 93.5, T) * (1 - smoothstep(108.3, 109.6, T));
    if (fireA > 0.001) {
      // push in on the one who stands, bringing their face to the centre
      const u = ease.inOutCubic(seg(T, 104.5, 109.5));
      const zoom = 1 + 2.6 * u;
      const fx = W * 0.765, fy = H * 0.555;
      const cam = { zoom, tx: lerp(fx, cx, u) - fx * zoom, ty: lerp(fy, cy, u) - fy * zoom };
      this.land.drawSky(R, { t: T, day: 0.0, night: 1, horizon: 0.7, bright: fireA, milky: 1, stars: 1 });
      this.land.drawFireScene(R, { t: T, alpha: fireA, stand: seg(T, 99.5, 102.5), lookUp: ease.inOutSine(seg(T, 102, 105)), cam });
      R.flush2D(1.1);
      R.sprites.setCam(cam.tx, cam.ty, zoom);
      R.lines.setCam(cam.tx, cam.ty, zoom);
      this.land.drawFire(R, { t: T, alpha: fireA });
      R.sprites.setCam();
      R.lines.setCam();
    }

    // 107.5 → end: the eye, then through the pupil
    if (T > 107.5) {
      const grow = Math.exp(0.12 * (T - 108)) * (T > 115 ? Math.exp(0.75 * (T - 115) ** 1.35) : 1);
      const blink = 1 - 0.95 * Math.pow(Math.max(0, Math.sin(clamp((T - 111.2) / 0.5) * Math.PI)), 2);
      this.eye.draw(R, {
        cx, cy, radius: H * 0.2 * grow, pupil: lerp(0.3, 0.62, ease.inOutSine(seg(T, 110.5, 116))), t: T,
        open: 0.88 * blink, bright: smoothstep(107.6, 109.5, T),
      });
    }
  }

  yearsAgo(T) {
    const K = [[0, 3.8e9], [13, 3.4e9], [26, 2.3e9], [33, 1.7e9], [39, 700e6], [45, 541e6], [50, 480e6], [55, 375e6],
      [60, 230e6], [65, 66e6], [68, 60e6], [72, 30e6], [90, 2e6], [95, 300e3], [110, 70e3], [120, 60e3]];
    for (let i = 1; i < K.length; i++) {
      if (T <= K[i][0]) {
        const [t0, a] = K[i - 1], [t1, b] = K[i];
        return Math.exp(lerp(Math.log(a), Math.log(b), (T - t0) / (t1 - t0)));
      }
    }
    return K[K.length - 1][1];
  }

  timelineAlpha(T) { return 1 - smoothstep(112, 116, T); }
}
