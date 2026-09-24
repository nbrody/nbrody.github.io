// Chapter 5 — Sociology.
//
//   0  the minds from Chapter 4 multiply and link up: a social network
//  12  it settles into villages and towns joined by roads
//  22  pull back: the Earth at night — city lights, the arcs of flights
//  34  dive into one bright city … a dark room, one dancer in one spotlight
//  45  others join, row by row; the lights come up, all on the beat
//  62  the whole room, full energy
// 100  the dancers glitter with the elements they are made of
// 111  the beat drops out: one dancer, one light; their particles rise like
//      stars; everything fades to a single point — and then nothing

import { Scene } from './scene.js';
import { World } from './ch5/world.js';
import { Crowd } from './ch5/dancers.js';
import { Stage } from './ch5/stage.js';
import { SHAPE } from '../gfx/renderer.js';
import { env, seg, smoothstep, ease, lerp, clamp } from '../lib/math.js';

const DROP = 111.5;

export class Ch5Sociology extends Scene {
  constructor() {
    super({ id: 'sociology', num: 'V', title: 'Sociology', subtitle: 'minds reach for each other, and make something together', duration: 120 });
    this.beats = [
      { t: 0, name: 'minds connect' }, { t: 12, name: 'villages, towns, roads' }, { t: 22, name: 'Earth at night' },
      { t: 34, name: 'into a city' }, { t: 36, name: 'a lone dancer' }, { t: 45, name: 'others join' },
      { t: 62, name: 'full room' }, { t: 100, name: 'star stuff, dancing' }, { t: DROP, name: 'the drop: one dancer' },
      { t: 116, name: 'fade to a point' },
    ];
    this.cues = [
      { t: 7.5, d: 5, title: 'Together', sub: 'Families, bands, tribes: minds that share what they know' },
      { t: 13.5, d: 7.5, title: 'Civilization', sub: '12,000 years ago farming lets us settle; villages grow into cities' },
      { t: 24, d: 6.5, title: 'Eight billion', sub: 'Writing, science, trade, networks — knowledge that outlives any one of us' },
      { t: 38.5, d: 6, title: 'Culture', sub: 'Music, dance, stories — the things we can only make together' },
      { t: 101, d: 7.5, title: 'Star stuff', sub: 'Every atom in every dancer was forged in a star' },
    ];
    this.cards = [
      { t: 114.8, d: 6.4, num: '', title: 'Origins', subtitle: '13.8 billion years, and counting', fi: 2.2, fo: 2.4 },
    ];
  }

  init(E) {
    super.init(E);
    this.world = new World(this.R);
    this.crowd = new Crowd();
    this.stage = new Stage(this.R);
  }

  update(dt, T, show) {
    this.T = T;
    this.show = show;
    const beats = this.tempo.beats(show);
    const peak = env(T, 62, DROP, 3, 0.3);
    const downbeat = Math.floor(beats) % 4 === 0 ? Math.exp(-(beats - Math.floor(beats)) * 8) : 0;
    Object.assign(this.post, {
      bloom: T < 34 ? 1.0 : 1.1, threshold: T < 34 ? 0.3 : 0.28, knee: 0.35, exposure: 1, vignette: 0.55, grain: 0.02,
      sat: 1.08, ca: 0.25 * peak * downbeat, flash: 0.09 * peak * downbeat + 0.6 * env(T, 35.2, 36.4, 0.3, 0.9),
      flashColor: [1, 0.9, 0.8], fade: 1 - smoothstep(121, 122.5, T),
    });
  }

  render(R) {
    const T = this.T, W = R.W, H = R.H, cx = W / 2, cy = H / 2;
    const beats = this.tempo.beats(this.show);
    const pulse = this.tempo.pulse(this.show, 6);

    // 0–26 s: minds → a network → towns and roads
    const netA = smoothstep(0, 1.5, T) * (1 - smoothstep(22, 26, T));
    if (netA > 0.001) {
      const zoomOut = ease.inOutCubic(seg(T, 21, 26));
      const s = lerp(1, 0.25, zoomOut);
      this.world.drawNetwork(R, T, {
        alpha: netA, settle: ease.inOutCubic(seg(T, 12, 21)), cx, cy, W: W * s, H: H * s, pulse,
      });
    }

    // 22–37 s: the Earth at night; then dive into a city
    const globeA = smoothstep(22, 25, T) * (1 - smoothstep(35.4, 36.2, T));
    if (globeA > 0.001) {
      const pull = ease.outCubic(seg(T, 22, 29));
      let radius = lerp(H * 2.6, H * 0.42, pull);
      if (T > 32.5) radius *= Math.exp(1.6 * (T - 32.5) ** 1.6);
      const spin = T * 0.05 - 1.1;
      this.world.drawGlobe(R, T, { cx, cy, radius, spin, alpha: globeA, lights: smoothstep(24, 28, T) });
    }

    // 35.5 s →: the stage
    if (T > 35.5) {
      const level = smoothstep(44, 62, T) * (1 - smoothstep(DROP, DROP + 0.4, T));
      const solo = smoothstep(36, 38, T) * (1 - smoothstep(46, 52, T)) + smoothstep(DROP, DROP + 0.5, T) * (1 - smoothstep(117, 119, T));
      const lead = this.crowd.place(this.crowd.lead, W, H);
      const beams = this.stage.rig(W, H, beats, level, clamp(solo), lead.x);
      this.stage.draw(R, beams, { t: T, floor: H * 0.95, bright: smoothstep(35.5, 37.5, T) * (1 - smoothstep(117.5, 120.5, T)) });
      const energy = lerp(0.55, 1.0, smoothstep(40, 62, T)) + 0.15 * env(T, 80, DROP, 4, 0.3);
      // the finale: the lead freezes with arms raised as the beat drops out
      const frozen = T > DROP;
      if (frozen) this.crowd.lead.fixedMove = 'up';
      else this.crowd.lead.fixedMove = null;
      const beatsAt = frozen ? this.tempo.beats(this.show - (T - DROP)) : beats;
      this.crowd.draw(R, {
        beats: beatsAt, energy: frozen ? 0.25 : energy, time: T,
        light: (x, y) => this.stage.lightAt(beams, x, y, H),
        alpha: (d) => d.lead
          ? smoothstep(36, 38.5, T) * (1 - smoothstep(117.5, 119.5, T))
          : smoothstep(d.appear, d.appear + 1.6, T) * (1 - smoothstep(DROP, DROP + 1.4, T)),
        stardust: smoothstep(99, 104, T),
        rise: ease.inCubic(seg(T, 113.5, 119)),
      });
      // the last light: where the lead's heart was
      const [hx, hy] = this.crowd.leadHeart(beatsAt, 0.25, W, H);
      const lastA = env(T, 115, 120.2, 2.5, 1.2);
      if (lastA > 0.001) {
        const beat = this.tempo.heart(this.show);
        R.sprites.add(hx, hy, 4 + 3 * beat, [1, 0.95, 0.85], lastA * 1.6, SHAPE.glow);
        R.sprites.add(hx, hy, 26, [1, 0.9, 0.75], lastA * 0.3 * (0.6 + 0.4 * beat), SHAPE.flare, 0.8);
        R.sprites.flush('add');
      }
    }
  }

  yearsAgo(T) {
    const K = [[0, 14e3], [12, 12e3], [22, 5e3], [30, 300], [36, 50]];
    if (T >= 36) return 0;
    for (let i = 1; i < K.length; i++) {
      if (T <= K[i][0]) {
        const [t0, a] = K[i - 1], [t1, b] = K[i];
        return Math.exp(lerp(Math.log(a), Math.log(b), (T - t0) / (t1 - t0)));
      }
    }
    return 0;
  }

  timelineAlpha(T) { return 1 - smoothstep(38, 42, T) * 0.7 - 0.3 * smoothstep(DROP, DROP + 2, T); }
}
