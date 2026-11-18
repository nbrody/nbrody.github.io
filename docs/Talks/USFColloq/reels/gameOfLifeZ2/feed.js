/**
 * Story playback and the feed loop. Pure arithmetic over life.js and stories.js (no graphics), so
 * the loop can be tested under Node.
 *
 * `Run` plays a story's beats on a Life, exactly as the studio page does. `Feed` strings a few
 * stories into a silent loop: how many generations have run by feed time t is a closed-form function
 * of t, so seeking, looping and playing frame by frame land on the same board.
 */
import { Life } from './life.js';
import { storyById, storyTools } from './stories.js';

/** Plays one story's beats on a Life. `onBeat(beat, tools)` runs after each beat's own `run`. */
export class Run {
  constructor(life, story, { hooks = {}, onBeat = null } = {}) {
    this.life = life; this.story = story; this.hooks = hooks; this.onBeat = onBeat;
    this.index = 0;
    this.last = null;          // the latest beat that has fired, so a caption can be shown late
    this.fire();
  }

  fire() {
    const { life, story } = this;
    while (this.index < story.beats.length && story.beats[this.index].at <= life.generation) {
      const beat = story.beats[this.index++];
      const tools = storyTools(life, this.hooks);
      beat.run?.(tools);
      if (beat.title) this.last = beat;
      this.onBeat?.(beat, tools);
    }
  }

  step() { this.life.step(); this.fire(); }

  get done() { return this.life.generation >= this.story.end; }
}

/** The feed's playlist. Rates are generations per second, piecewise linear in time. */
export const PLAYLIST = [
  // one colour, then three: the R-pentomino's descendants split into a, b and c (seed 19 gives a lively run in every frame shape)
  { story: 'genesis', seed: 19, cells: 90, dur: 22, gens: 640,
    shape: [[0, 30], [4, 30], [5, 18], [14, 24], [22, 36]] },
  // a three-colour soup through Life, Life without death, Maze and Coral
  { story: 'seasons', seed: 3, cells: 240, dur: 18, gens: 780,
    shape: [[0, 60], [6, 60], [7, 30], [11, 26], [14, 40], [18, 50]] },
  // rock–paper–scissors fronts, then spirals
  { story: 'kingdoms', seed: 5, cells: 220, dur: 28, gens: 1500,
    shape: [[0, 76], [4, 76], [8, 48], [18, 46], [28, 58]] },
];

/** Rows for a feed field `cols` wide: one of four shapes, so a seed means the same run in any frame of that shape. */
export function feedRows(cols, aspect) {
  return Math.round(cols * (aspect >= 1.15 ? 0.62 : aspect > 0.87 ? 1 : aspect > 0.6 ? 1.5 : 2));
}

export const FADE_S = 0.7;       // seconds of fade to the background at each end of a segment

function build(def, start) {
  const keys = def.shape;
  const cum = [0];
  for (let i = 1; i < keys.length; i++) cum[i] = cum[i - 1] + 0.5 * (keys[i][1] + keys[i - 1][1]) * (keys[i][0] - keys[i - 1][0]);
  const norm = def.gens / cum[cum.length - 1];
  const seg = t => { let i = 0; while (i < keys.length - 2 && t > keys[i + 1][0]) i++; return i; };
  const G = t => {
    t = Math.max(0, Math.min(def.dur, t));
    const i = seg(t), dt = t - keys[i][0];
    const r0 = keys[i][1], slope = (keys[i + 1][1] - r0) / (keys[i + 1][0] - keys[i][0]);
    return norm * (cum[i] + r0 * dt + 0.5 * slope * dt * dt);
  };
  const rate = t => {
    t = Math.max(0, Math.min(def.dur, t));
    const i = seg(t);
    const r0 = keys[i][1], r1 = keys[i + 1][1];
    return norm * (r0 + (r1 - r0) * (t - keys[i][0]) / (keys[i + 1][0] - keys[i][0]));
  };
  return { ...def, start, G, rate };
}

export const SEGMENTS = [];
let acc = 0;
for (const d of PLAYLIST) { SEGMENTS.push(build(d, acc)); acc += d.dur; }
export const FEED_T = acc;

export function segmentAt(t) {
  let i = 0;
  while (i < SEGMENTS.length - 1 && t >= SEGMENTS[i + 1].start) i++;
  return i;
}

const smooth = x => { x = Math.max(0, Math.min(1, x)); return x * x * (3 - 2 * x); };

export class Feed {
  /** @param makeLife (story, seed, cells) => Life sized for the frame; `cells` overrides the story's width */
  constructor(makeLife, hooks = {}) {
    this.makeLife = makeLife; this.hooks = hooks;
    this.reset();
  }

  reset() {
    this.seg = -1; this.t = -1;
    this.life = null; this.run = null;
    this.rate = 0; this.veil = 1; this.index = 0;
  }

  _load(i) {
    const def = SEGMENTS[i], story = storyById(def.story);
    this.seg = i;
    this.life = this.makeLife(story, def.seed, def.cells);
    this.run = new Run(this.life, story, { hooks: this.hooks });
  }

  /** Bring the world to feed time t (0 ≤ t < FEED_T). `onStep` runs after every generation. */
  seek(t, onStep) {
    if (t < this.t) this.reset();
    this.t = t;
    const i = segmentAt(t);
    if (i !== this.seg) this._load(i);
    const def = SEGMENTS[i], tl = t - def.start;
    const target = Math.min(def.gens, Math.floor(def.G(tl)));
    while (this.life.generation < target) { this.run.step(); onStep?.(this.life); }
    this.rate = def.rate(tl);
    this.index = i;
    this.veil = Math.max(1 - smooth(tl / FADE_S), smooth((tl - (def.dur - FADE_S)) / FADE_S));
    return this;
  }
}

export { Life };
