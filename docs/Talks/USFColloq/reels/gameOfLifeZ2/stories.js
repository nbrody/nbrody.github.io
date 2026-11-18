// stories.js — scripted scenarios. Each story is a list of beats; a beat
// fires at its generation, can change the rule or law, place patterns, and
// shows a chapter caption. Positions are fractions of the visible field so
// stories adapt to any grid size or aspect ratio.

import { PATTERNS, transform, bounds } from './patterns.js';
import { A, B, C, mulberry32 } from './life.js';

/** The toolkit a beat's `run` receives. */
export function storyTools(life, hooks = {}) {
  const rng = mulberry32(life.generation * 7919 + 17);
  const W = life.viewW, H = life.viewH;
  const t = {
    W, H, rng,
    place(name, fx, fy, { color = A, rot = 0, flip = false, anchor = 'center' } = {}) {
      const cells = transform(PATTERNS[name], rot, flip);
      const { w, h } = bounds(cells);
      const x0 = Math.round(fx * W - (anchor === 'center' ? w / 2 : 0));
      const y0 = Math.round(fy * H - (anchor === 'center' ? h / 2 : 0));
      for (const [x, y] of cells) life.set(x0 + x, y0 + y, color);
    },
    soup(fx, fy, fw, fh, density, colors = [A]) {
      const x0 = Math.round(fx * W), y0 = Math.round(fy * H);
      const x1 = Math.round((fx + fw) * W), y1 = Math.round((fy + fh) * H);
      for (let y = y0; y < y1; y++) for (let x = x0; x < x1; x++) {
        if (rng() < density) life.set(x, y, typeof colors === 'function' ? colors(x / W, y / H) : colors[Math.floor(rng() * colors.length)]);
      }
    },
    clear(fx = 0, fy = 0, fw = 1, fh = 1) {
      for (let y = Math.round(fy * H); y < Math.round((fy + fh) * H); y++)
        for (let x = Math.round(fx * W); x < Math.round((fx + fw) * W); x++) life.set(x, y, 0);
    },
    recolor(fn) {
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const v = life.get(x, y); if (v) life.set(x, y, fn(v, x / W, y / H)); }
    },
    rule(text) { life.setRule(text); hooks.onRule?.(life.ruleText); },
    law(name) { life.setLaw(name); hooks.onLaw?.(name); },
    mutation(p) { life.mutation = p; hooks.onMutation?.(p); },
    bite(p) { life.setBite(p); hooks.onBite?.(p); },
  };
  return t;
}

export const STORIES = [
  {
    id: 'genesis', title: 'Genesis', cells: 220, boundary: 'open', rule: 'B3/S23', law: 'heredity', end: 1950,
    blurb: 'One R-pentomino. Its descendants learn to differ.',
    beats: [
      { at: 0, chapter: 'I', title: 'The first spark', text: 'Five live cells, all of kind a, in an empty universe.',
        run: t => t.place('rpentomino', 0.42, 0.45, { color: A }) },
      { at: 130, chapter: 'II', title: 'Schism', text: 'Births start to make mistakes. A newborn can now be b or c: the one live state has split into the three nonzero elements of (ℤ/2)².',
        run: t => t.mutation(0.05) },
      { at: 300, chapter: 'III', title: 'Arithmetic', text: 'The mistakes stop, and heredity takes over. A newborn is the sum of its parents: a + a + b = b, and a + b + c = 0, so triads are stillborn.',
        run: t => t.mutation(0) },
      { at: 520, chapter: 'IV', title: 'The second spark', text: 'The first fire is dying down. An acorn of kind b, seven cells, lands in the ash. Left alone, an acorn burns for five thousand generations. This one will run into the ash.',
        run: t => t.place('acorn', 0.62, 0.62, { color: B }) },
      { at: 950, chapter: 'V', title: 'Visitors', text: 'A fleet of c-coloured spaceships arrives from the east, and a-gliders drift in from the north-west.',
        run: t => {
          for (let k = 0; k < 5; k++) t.place(['lwss', 'mwss', 'hwss'][k % 3], 0.97, 0.18 + k * 0.16, { color: C });
          for (let k = 0; k < 4; k++) t.place('glider', 0.03 + k * 0.07, 0.04, { color: A });
        } },
      { at: 1350, chapter: 'VI', title: 'Alchemy', text: 'A new law: every survivor x absorbs the sum s of its neighbours and becomes x + s. One-colour ash stays still. Mixed ash starts to shimmer.',
        run: t => t.law('alchemy') },
      { at: 1650, chapter: 'VII', title: 'Ash', text: 'The fires burn out. What remains is a still, many-coloured ash of blocks, hives and blinkers.' },
    ],
  },
  {
    id: 'forges', title: 'Three Forges', cells: 300, boundary: 'open', rule: 'B3/S23', law: 'heredity', end: 1950,
    blurb: 'Three glider guns, one per colour, and their crossfire.',
    beats: [
      { at: 0, chapter: 'I', title: 'Three forges', text: 'Three Gosper guns, one for each of a, b and c. Each fires a glider every thirty generations.',
        run: t => {
          t.place('gosperGun', 0.03, 0.05, { color: A, anchor: 'corner' });
          t.place('gosperGun', 0.97 - 36 / t.W, 0.05, { color: B, flip: true, anchor: 'corner' });
          t.place('gosperGun', 0.5, 0.93, { color: C, rot: 2 });
        } },
      { at: 330, chapter: 'II', title: 'Crossfire', text: 'The streams cross. Where gliders of different colours collide, the sum rule decides the colour of the wreckage.' },
      { at: 650, chapter: 'III', title: 'Fever', text: 'The guns begin to misfire colours. The streams run rainbow, and when a glider’s newborn cell has parents a, b and c, the triad cancels and the glider breaks up.',
        run: t => t.mutation(0.03) },
      { at: 900, chapter: 'IV', title: 'The forges fall', text: 'Triads cancelled inside the guns themselves, and all three forges have gone silent. The fever breaks, and colours are inherited faithfully again.',
        run: t => t.mutation(0) },
      { at: 1150, chapter: 'V', title: 'Reforging', text: 'Three fresh guns are lit in the middle of the field, under Heredity again.',
        run: t => {
          t.law('heredity');
          t.clear(0.28, 0.30, 0.44, 0.40);
          t.place('gosperGun', 0.30, 0.32, { color: B, anchor: 'corner' });
          t.place('gosperGun', 0.70 - 36 / t.W, 0.32, { color: C, flip: true, anchor: 'corner' });
          t.place('gosperGun', 0.5, 0.66, { color: A, rot: 2 });
        } },
    ],
  },
  {
    id: 'seasons', title: 'Seasons', cells: 320, boundary: 'wrap', rule: 'B3/S23', law: 'heredity', end: 1500,
    blurb: 'One field, many rules: Life, Life without death, Maze and Coral, then a thaw.',
    beats: [
      { at: 0, chapter: 'I', title: 'Spring', text: 'A random soup of a, b and c under Conway’s rule B3/S23.',
        run: t => t.soup(0, 0, 1, 1, 0.32, [A, B, C]) },
      { at: 380, chapter: 'II', title: 'Summer', text: 'Life without death (B3/S012345678). Nothing dies, and the surviving ash puts out crystalline shoots.',
        run: t => t.rule('B3/S012345678') },
      { at: 410, chapter: 'III', title: 'Autumn', text: 'Maze (B3/S12345). The growth carves itself into corridors.',
        run: t => t.rule('B3/S12345') },
      { at: 560, chapter: 'IV', title: 'Winter', text: 'Coral (B3/S45678). Only crowded cells survive. Most of the maze dies at once, and what remains grows into slow reefs.',
        run: t => t.rule('B3/S45678') },
      { at: 760, chapter: 'V', title: 'Thaw', text: 'Conway’s rule returns. The reefs are too crowded for it and collapse, and a spring rain of new cells brings the chaos back.',
        run: t => { t.rule('B3/S23'); t.soup(0, 0, 1, 1, 0.12, [A, B, C]); } },
      { at: 1100, chapter: 'VI', title: 'Spring again', text: 'Everything settles once more, but the colours have been reshuffled by a year of arithmetic.' },
    ],
  },
  {
    id: 'kingdoms', title: 'Three Kingdoms', cells: 360, boundary: 'wrap', rule: 'B3/S23', law: 'predation', end: 1900,
    blurb: 'Rock–paper–scissors among three single-colour realms.',
    beats: [
      { at: 0, chapter: 'I', title: 'Three kingdoms', text: 'Three soups, each of a single colour, separated by empty wilderness. Under Conway’s rule each one burns down to ash of its own colour.',
        run: t => {
          const cols = [A, B, C];
          for (let k = 0; k < 3; k++) t.soup(k / 3 + 0.03, 0.08, 1 / 3 - 0.06, 0.84, 0.38, [cols[k]]);
        } },
      { at: 240, chapter: 'II', title: 'The long day', text: 'The rule becomes Day & Night (B3678/S34678), in which life and death are symmetric. The kingdoms flood and become continents with shared borders.',
        run: t => {
          t.rule('B3678/S34678');
          t.soup(0, 0, 1, 1, 0.5, fx => fx < 1 / 3 ? A : fx < 2 / 3 ? B : C);
        } },
      { at: 300, chapter: 'III', title: 'Predation', text: 'The automorphism σ : a → b → c → a gives every colour a predator: b eats a, c eats b, a eats c. Conversion fronts sweep across the continents.' },
      { at: 700, chapter: 'IV', title: 'Fronts', text: 'Around the cycle the fronts go. A colour thrives only while its prey lasts, and whoever it spares feeds its own predator. No border holds for long.' },
      { at: 900, chapter: 'V', title: 'Uprising', text: 'Rare mutations reappear. σ fixes no colour, so every empire has a predator, and each new rebel sets off a wave of conquest. Bites are gentler now, so the waves spread out into bands and spirals.',
        run: t => { t.mutation(0.0004); t.bite(0.05); } },
      { at: 1450, chapter: 'VI', title: 'Tribes', text: 'Loyalty replaces predation. A cell joins whichever colour surrounds it, the spirals freeze into territories, and the borders slowly straighten.',
        run: t => { t.mutation(0); t.law('tribes'); } },
    ],
  },
  {
    id: 'garden', title: 'The Garden', cells: 260, boundary: 'open', rule: 'B3/S23', law: 'heredity', end: 1800,
    blurb: 'A quiet garden of oscillators, then a storm of three-coloured gliders.',
    beats: [
      { at: 0, chapter: 'I', title: 'The garden', text: 'Pulsars and pentadecathlons tick in a single colour, a perfectly periodic world.',
        run: t => {
          const cols = 5, rows = 3;
          for (let j = 0; j < rows; j++) for (let i = 0; i < cols; i++) {
            const fx = (i + 0.5) / cols, fy = (j + 0.5) / rows;
            t.place((i + j) % 2 ? 'pentadecathlon' : 'pulsar', fx, fy, { color: A, rot: (i + j) % 4 === 1 ? 1 : 0 });
          }
        } },
      { at: 150, chapter: 'II', title: 'Storm clouds', text: 'A squall of gliders blows in: b from the north, c from the south.',
        run: t => {
          for (let k = 0; k < 11; k++) {
            t.place('glider', 0.03 + k * 0.09, 0.025 + (k % 3) * 0.02, { color: B });
            t.place('glider', 0.97 - k * 0.09, 0.975 - (k % 3) * 0.02, { color: C, rot: 2 });
          }
        } },
      { at: 700, chapter: 'III', title: 'Wreckage', text: 'The storm has passed. Some oscillators survived and some are ruins. Every ruin carries its own sum of colours.' },
      { at: 900, chapter: 'IV', title: 'Replanting', text: 'Diehards in all three colours are planted in the gaps. A diehard vanishes completely after 130 generations, if left alone.',
        run: t => {
          const cols = [A, B, C];
          for (let k = 0; k < 6; k++) t.place('diehard', 0.1 + k * 0.16, k % 2 ? 0.32 : 0.68, { color: cols[k % 3] });
        } },
      { at: 1200, chapter: 'V', title: 'Alchemy', text: 'Under Alchemy, the multicoloured wreckage glitters while the one-colour survivors keep ticking.',
        run: t => t.law('alchemy') },
    ],
  },
];

export const storyById = id => STORIES.find(s => s.id === id) || STORIES[0];
