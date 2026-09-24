// Chapter 2 — Chemistry.
//
//   0  supernova debris, cooling; a periodic table of where atoms come from
//  12  the molecular cloud: atoms bond — H₂, H₂O, CH₄, NH₃, CO
//  34  the cloud collapses into a young Sun and a ringed dusty disk
//  40  a planet gathers in one ring; the early Earth: molten → crust → oceans
//  54  under the early ocean: carbon chains, a benzene ring, ribose,
//      glycine, a nucleotide assemble atom by atom
//  72  nucleotides link into a strand; lipids self-assemble into a vesicle
//  92  inside, RNA folds, then copies itself
// 112  the bubble stretches and starts to pinch in two → Chapter 3

import { Scene } from './scene.js';
import { MolecularCloud } from './ch2/cloud.js';
import { drawPeriodicTable } from './ch2/periodic.js';
import { Worlds } from './ch2/worlds.js';
import { OceanLife } from './ch2/life.js';
import { hydrocarbon, benzene, ribose, glycine, nucleotide, assembly, drawMolecule, drawFlashes } from './ch2/molecules.js';
import { SHAPE } from '../gfx/renderer.js';
import { env, seg, smoothstep, ease, lerp, mat4, project, v3 } from '../lib/math.js';

const ASSEMBLIES = [
  { make: hydrocarbon, x: -0.23, y: -0.17, s: 0.034, t0: 54.5, dur: 3.6, until: 64, spin: 0.22 },
  { make: benzene, x: 0.2, y: 0.15, s: 0.036, t0: 57.6, dur: 3.2, until: 66.5, spin: -0.18 },
  { make: ribose, x: 0.25, y: -0.2, s: 0.036, t0: 61, dur: 3.4, until: 69, spin: 0.2 },
  { make: glycine, x: -0.23, y: 0.21, s: 0.038, t0: 63.6, dur: 3.2, until: 71, spin: -0.24 },
  { make: nucleotide, x: 0.0, y: 0.0, s: 0.045, t0: 66.6, dur: 4.2, until: 74, spin: 0.12 },
];

const POST_KEYS = [
  [0, { bloom: 1.0, threshold: 0.35 }], [33, { bloom: 0.95, threshold: 0.35 }],
  [37, { bloom: 1.15, threshold: 0.3 }], [44, { bloom: 1.1, threshold: 0.3 }],
  [47, { bloom: 0.5, threshold: 0.75 }], [53, { bloom: 0.5, threshold: 0.75 }],
  [57, { bloom: 0.8, threshold: 0.45 }],
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

export class Ch2Chemistry extends Scene {
  constructor() {
    super({ id: 'chemistry', num: 'II', title: 'Chemistry', subtitle: 'atoms bond, molecules grow, and one learns to copy itself', duration: 120 });
    this.beats = [
      { t: 0, name: 'star stuff' }, { t: 12, name: 'molecular cloud: bonding' }, { t: 34, name: 'young Sun + disk' },
      { t: 40, name: 'planet forms' }, { t: 46, name: 'early Earth cools' }, { t: 53.5, name: 'dive into the ocean' },
      { t: 54.5, name: 'building blocks' }, { t: 72, name: 'polymer strand' }, { t: 80, name: 'lipids self-assemble' },
      { t: 92, name: 'RNA folds' }, { t: 100, name: 'RNA copies itself' }, { t: 110.5, name: 'strands separate' },
      { t: 112.5, name: 'protocell divides' },
    ];
    this.cues = [
      { t: 8.4, d: 6.8, title: 'Star stuff', sub: 'Every atom heavier than helium was forged inside a star' },
      { t: 15, d: 7, title: 'Molecules', sub: 'In the cold of a nebula, atoms bond: H₂, H₂O, CH₄, NH₃' },
      { t: 24.2, d: 7, title: 'Chemical bonds', sub: 'Shared electrons hold atoms at precise angles — water bends at 104.5°' },
      { t: 36.5, d: 6, title: 'A new Sun', sub: '4.6 billion years ago the cloud collapses into a star and a spinning disk' },
      { t: 46, d: 6.5, title: 'Earth', sub: 'Molten at first; it cools, and oceans rain out of the sky' },
      { t: 55.5, d: 6.5, title: 'The early ocean', sub: 'Sunlight, lightning and volcanic vents drive new reactions' },
      { t: 63, d: 7, title: 'Building blocks', sub: 'Carbon chains and rings, sugars, amino acids, nucleotides' },
      { t: 74, d: 6.5, title: 'Polymers', sub: 'Nucleotides link, one by one, into a chain' },
      { t: 83.2, d: 6.5, title: 'Self-assembly', sub: 'Oily lipids fold themselves into a hollow, two-layered bubble' },
      { t: 93, d: 7, title: 'RNA', sub: 'A molecule that folds on itself: A pairs with U, G with C' },
      { t: 102.5, d: 7.5, title: 'A copy', sub: 'Matching nucleotides pair along the strand and zip up its complement' },
      { t: 112.8, d: 7, title: 'The first replicator', sub: 'Around four billion years ago, chemistry learns to copy itself' },
    ];
    this._proj = mat4.create();
    this._view = mat4.create();
    this.vp = mat4.create();
    this.needSeek = null;
  }

  init(E) {
    super.init(E);
    this.cloud = new MolecularCloud();
    this.worlds = new Worlds(this.R);
    this.life = new OceanLife(this.R);
    this.tpls = ASSEMBLIES.map((a) => a.make());
  }

  zoomAt(T) {
    const M = Math.min(this.R.W, this.R.H) / 720;
    const z = T < 16 ? lerp(6.5, 17, ease.inOutSine(seg(T, 0, 16))) : lerp(17, 20, seg(T, 16, 34));
    const out = T > 33.5 ? lerp(1, 0.06, ease.inCubic(seg(T, 33.5, 38))) : 1;
    return z * M * out;
  }

  /** Half-extents (Å) of the view, for staging events on screen. */
  viewAt(T) {
    const z = this.zoomAt(T);
    return [this.R.W / 2 / z, this.R.H / 2 / z];
  }

  seek(T) {
    this.needSeek = T;
  }

  update(dt, T) {
    this.T = T;
    if (this.needSeek !== null) {
      const t = this.needSeek;
      this.needSeek = null;
      if (t < 38) this.cloud.seekTo(t, (tt) => this.viewAt(tt));
      else this.cloud.reset();
    } else if (T < 38.5) {
      const [hw, hh] = this.viewAt(T);
      this.cloud.step(dt, T, hw, hh);
    }
    const k = keyed(T, POST_KEYS);
    Object.assign(this.post, {
      bloom: k.bloom, threshold: k.threshold, knee: 0.35, exposure: 1, vignette: 0.5, grain: 0.02,
      sat: 1.05, ca: 0, flash: 0, fade: 1,
    });
  }

  // ── disk & planet camera ──────────────────────────────────────────────────

  diskTime(T) { return (T - 30) * 0.6; }

  diskCam(T) {
    const td = this.diskTime(T);
    const orbit = (t) => {
      const dist = lerp(6.5, 2.6, ease.inOutSine(seg(t, 34, 40)));
      const az = 0.3 + 0.04 * t, el = 0.52;
      return [dist * Math.cos(el) * Math.cos(az), dist * Math.sin(el), dist * Math.cos(el) * Math.sin(az)];
    };
    if (T <= 40) return { eye: orbit(T), target: [0, 0, 0] };
    const e40 = orbit(40), p40 = this.worlds.planetPos(this.diskTime(40));
    const off = v3.sub(e40, p40);
    const planet = this.worlds.planetPos(td);
    const f = Math.exp(-0.82 * (T - 40));
    return { eye: v3.add(planet, v3.scale(off, f)), target: v3.lerp([0, 0, 0], planet, ease.inOutSine(seg(T, 40, 42.5))), planet, d: v3.len(off) * f };
  }

  planetRadius(T, H) {
    if (T < 46) return H * 0.13 * Math.exp(0.82 * (T - 46));
    let r = H * 0.13 * Math.exp(0.16 * (T - 46));
    if (T > 53) r *= Math.exp(1.5 * (T - 53) ** 1.4);
    return r;
  }

  // ── render ────────────────────────────────────────────────────────────────

  render(R) {
    const T = this.T, W = R.W, H = R.H, cx = W / 2, cy = H / 2;
    const M = Math.min(W, H);

    // nebula backdrop for the cloud and disk
    const neb = smoothstep(4, 12, T) * (1 - smoothstep(44, 47, T));
    if (neb > 0) {
      this.worlds.drawNebula(R, {
        t: T, bright: neb * lerp(0.9, 0.35, smoothstep(34, 38, T)), zoom: lerp(1, 0.5, smoothstep(33, 38, T)),
        stars: 0.7,
      });
    }

    // 0–38 s: debris cools, periodic table, bonding
    if (T < 38.5) {
      // after the title card clears
      const tableA = env(T, 5, 16.5, 2.2, 3);
      if (tableA > 0) drawPeriodicTable(R, { alpha: tableA, highlight: smoothstep(6.5, 9.5, T), cx, cy: cy - H * 0.02, width: Math.min(W * 0.66, H * 1.25) });
      R.flush2D(1.15);
      this.cloud.draw(R, { zoom: this.zoomAt(T), cx, cy, persp: 0.006 }, (1 - smoothstep(35.5, 38, T)) * (1 - 0.35 * tableA));
    }

    // 34–47 s: the young Sun and its disk; zoom to a forming planet
    if (T > 34 && T < 47.5) {
      const cam = this.diskCam(T);
      mat4.perspective(this._proj, 0.9, W / H, 0.001, 100);
      mat4.lookAt(this._view, cam.eye, cam.target, [0, 1, 0]);
      mat4.multiply(this.vp, this._proj, this._view);
      const diskA = smoothstep(34.5, 38, T) * (1 - smoothstep(45.5, 47, T));
      this.worlds.drawDisk(R, { vp: this.vp, t: this.diskTime(T), ps: 3.2 * (H / 720), bright: diskA * 0.9 });
      const sp = project(this.vp, 0, 0, 0, W, H);
      if (sp[2] > 0) {
        const S = R.sprites, L = R.lines;
        const s = (H * 0.5) / sp[2];
        S.add(sp[0], sp[1], s * 0.035, [1, 0.95, 0.85], diskA * 3, SHAPE.glow);
        S.add(sp[0], sp[1], s * 0.16, [1, 0.8, 0.55], diskA * 0.25, SHAPE.glow);
        S.add(sp[0], sp[1], s * 0.6, [1, 0.85, 0.7], diskA * 0.35, SHAPE.flare, 0.8);
        // bipolar jets along the spin axis
        for (const sgn of [-1, 1]) {
          const j = project(this.vp, 0, sgn * 0.9, 0, W, H);
          if (j[2] > 0) L.add(sp[0], sp[1], j[0], j[1], s * 0.012, [0.5, 0.7, 1.2], diskA * 0.7, [0.4, 0.6, 1.0], 0, 1);
        }
        L.flush('add');
        S.flush('add');
      }
      if (cam.planet) {
        const pp = project(this.vp, ...cam.planet, W, H);
        const r = this.planetRadius(T, H);
        if (pp[2] > 0) {
          const a = smoothstep(40, 42, T) * (1 - smoothstep(46, 47, T));
          R.sprites.add(pp[0], pp[1], Math.max(2, r * 1.2), [1, 0.5, 0.2], a * 1.6, SHAPE.glow);
          R.sprites.add(pp[0], pp[1], Math.max(2, r), [0.9, 0.35, 0.15], a, SHAPE.sphere, 0.3, 0.9);
          R.sprites.flush('add');
        }
      }
    }

    // 45.5–56 s: the early Earth
    if (T > 45.5 && T < 56.5) {
      const r = this.planetRadius(T, H);
      const a = smoothstep(45.5, 46.8, T) * (1 - smoothstep(54.8, 56.2, T));
      this.worlds.drawPlanet(R, {
        cx, cy, radius: r, t: T, spin: T * 0.12,
        molten: 1 - smoothstep(47, 50.5, T), sea: lerp(-0.9, 0.12, ease.inOutSine(seg(T, 49.5, 53))),
        clouds: smoothstep(50, 53, T), bright: a * 1.25,
      });
    }

    // 53.5 → end: under the early ocean
    const oceanA = smoothstep(54.3, 56.2, T);
    if (oceanA > 0) this.life.drawOcean(R, T, oceanA);

    // 54.5–74 s: molecules assemble, atom by atom
    if (T > 53.5 && T < 75) {
      ASSEMBLIES.forEach((m, k) => {
        if (T < m.t0 - 1.5 || T > m.until) return;
        const tpl = this.tpls[k];
        const alpha = smoothstep(m.t0 - 1.5, m.t0 - 0.5, T) * (1 - smoothstep(m.until - 1.5, m.until, T));
        let s = m.s * M, x = cx + m.x * W + Math.sin(T * 0.21 + k) * M * 0.015, y = cy + m.y * H + Math.cos(T * 0.17 + k) * M * 0.012;
        if (k === 4) {
          // the nucleotide shrinks into the first link of the strand
          const u = ease.inOutCubic(seg(T, 71.5, 73.6));
          s = lerp(s, M * 0.02, u);
          x = lerp(x, cx - 6.5 * M * 0.05, u);
        }
        const xf = { x, y, s, yaw: T * m.spin + k, pitch: Math.sin(T * 0.23 + k) * 0.45, roll: 0.2 * Math.sin(T * 0.1 + k), persp: 0.05 };
        const asm = assembly(tpl, xf, T, m.t0, m.dur, 17 + k * 7);
        drawMolecule(R, tpl, asm.P, { alpha, glow: 0.6 + 0.8 * asm.complete, vis: asm.vis, bondVis: asm.bondVis });
        drawFlashes(R, asm.flashes, alpha, xf);
        if (asm.complete > 0) {
          R.sprites.add(x, y, s * 6, [0.6, 0.9, 1.0], alpha * asm.complete * 0.16, SHAPE.glow);
          R.sprites.flush('add');
        }
      });
    }

    // 72 → end: strand, membrane, RNA world
    if (T > 71.5) {
      const Rv = M * 0.3;
      const vcx = cx, vcy = cy + H * 0.02;
      this.life.drawVesicle(R, T, vcx, vcy, M, Rv, smoothstep(78, 80, T));
      this.life.drawStrand(R, T, vcx, vcy, M, Rv, smoothstep(71.5, 73, T));
    }
  }

  yearsAgo(T) {
    if (T < 34) return lerp(4.66e9, 4.6e9, seg(T, 0, 34));
    if (T < 46) return lerp(4.6e9, 4.54e9, seg(T, 34, 46));
    if (T < 55) return lerp(4.54e9, 4.4e9, seg(T, 46, 55));
    if (T < 100) return lerp(4.4e9, 4.1e9, seg(T, 55, 100));
    return lerp(4.1e9, 3.95e9, seg(T, 100, 122));
  }

  timelineAlpha() { return 1; }
}
