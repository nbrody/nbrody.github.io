// shows.js — long, timed light shows built from a small vocabulary of looks.
//
// A show is a list of sections { n: name, d: seconds, f: fade-in seconds, L: look }.
// A look has `layers` (attribute assignments to groups, applied in order), `fx`
// (effects: rate in beats per cycle, spread in degrees of phase across the
// group), `kin` (pod shape) and `cyc` (backdrop colour). Any value may be a
// function of the section context c = { p: 0→1 progress, t, T, beat }, which is
// how builds, drifts and colour journeys unfold across many minutes.

export const K = {
  red: '#ff1030', crimson: '#d0002a', orange: '#ff5200', amber: '#ff8a00', gold: '#ffbb3a', warm: '#ffd6a0',
  white: '#ffffff', ice: '#d4ecff', cyan: '#00d8ff', teal: '#00ffbe', green: '#10ff48', lime: '#a6ff00',
  blue: '#0b2cff', royal: '#3b5bff', uv: '#5200ff', violet: '#9a2cff', magenta: '#ff00c8', pink: '#ff4aa6',
  lav: '#b89cff', black: '#000000',
};

// ——— value helpers ———
const ease = (x) => x * x * (3 - 2 * x);
const cl = (x) => Math.max(0, Math.min(1, x));
/** Ramp a → b across the section (optionally only between progress p0 and p1). */
export const up = (a, b, p0 = 0, p1 = 1) => (c) => a + (b - a) * ease(cl((c.p - p0) / (p1 - p0)));
/** Pick from a list by phrase (every `beats` beats). */
export const every = (beats, list) => (c) => list[Math.floor(c.beat / beats) % list.length];
/** Pick from a list by progress through the section. */
export const steps = (list) => (c) => list[Math.min(list.length - 1, Math.floor(c.p * list.length))];
/** Blend between two hex colours across the section. */
export const blend = (a, b, p0 = 0, p1 = 1) => (c) => mixHex(a, b, ease(cl((c.p - p0) / (p1 - p0))));
/** Continuous colour journey through a list over the section. */
export const journey = (list) => (c) => {
  const x = cl(c.p) * (list.length - 1), i = Math.min(list.length - 2, Math.floor(x));
  return mixHex(list[i], list[i + 1], ease(x - i));
};
export function mixHex(a, b, t) {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (s) => Math.round(((pa >> s) & 255) * (1 - t) + ((pb >> s) & 255) * t);
  return `#${((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1)}`;
}

/** Scale a value that may itself be a function. */
const mul = (v, k) => (typeof v === 'function' ? (c) => v(c) * k : v * k);

// ——— look vocabulary ———
export const merge = (...looks) => {
  const out = { layers: [], fx: [] };
  for (const l of looks) {
    if (!l) continue;
    out.layers.push(...(l.layers || []));
    out.fx.push(...(l.fx || []));
    if (l.kin) out.kin = l.kin;
    if (l.cyc) out.cyc = l.cyc;
  }
  return out;
};
export const cyc = (top, bot = K.black, dim = 0.35, botDim) => ({ top, bot, dim, botDim });

export const L = {
  /** Almost nothing: a faint cyc and a whisper of floor light. */
  dark: ({ col = K.blue, cycCol = K.blue, floor = 0.08, cycDim = 0.18 } = {}) => ({
    layers: [{ g: 'floor', col, dim: floor, tilt: 12, zoom: 18, frost: 0.6, fan: 10 }],
    kin: { shape: 'flat', h: 11 },
    cyc: cyc(K.black, cycCol, cycDim),
  }),

  /** Front pods wash the band with wide, soft beams. */
  wash: ({ col = K.royal, dim = 0.45, g = 'front', target = 'band', zoom = 30, spread = [5, 0, 0], cycCol } = {}) => ({
    layers: [{ g, col, dim, aim: target, spread, zoom, frost: 0.7 }],
    cyc: cycCol ? cyc(cycCol, K.black, 0.3) : undefined,
  }),

  /** Beams fanning out toward the room, with a slow chase riding across. */
  fan: ({ col = K.cyan, alt, dim = 0.7, g = 'pods', tilt = 52, fan = 35, zoom = 4, frost = 0.1, chase = null, fanT = 0, kin, cycCol = col } = {}) => ({
    layers: [{ g, col, alt, dim, pan: 0, tilt, fan, fanT, zoom, frost }],
    fx: chase ? [{ g, a: 'dim', w: chase.w || 'sin', rate: chase.rate ?? 8, size: chase.size ?? 0.7, spread: chase.spread ?? 360, by: chase.by || 'x', wings: chase.wings }] : [],
    kin: kin || { shape: 'wave', h: 9.5, amp: 0.8, period: 64, roll: 0.06 },
    cyc: cyc(K.black, cycCol, 0.3),
  }),

  /** A curtain of vertical beams, rippled by a tilt wave. */
  curtain: ({ col = K.teal, alt, dim = 0.8, ripple = 12, rate = 16, zoom = 2.6, by = 'x', g = 'pods', kin, cycCol = col } = {}) => ({
    layers: [{ g, col, alt, dim, pan: 0, tilt: 0, zoom, frost: 0.05 }],
    fx: [{ g, a: 'tilt', w: 'sin', rate, size: ripple, spread: 360, by }],
    kin: kin || { shape: 'arch', h: 10, amp: 1.2 },
    cyc: cyc(K.black, cycCol, 0.25),
  }),

  /** Every beam converges on one point in the air, optionally circling. */
  converge: ({ col = K.magenta, alt, dim = 0.85, point = 'air', circle = 0, rate = 16, zoom = 2.8, g = 'pods', spread = 0, kin, cycCol = col } = {}) => ({
    layers: [{ g, col, alt, dim, aim: point, spread: spread ? (c) => [typeof spread === 'function' ? spread(c) : spread, 0, 0] : undefined, zoom, frost: 0.05 }],
    fx: [{ g, a: 'circle', rate, size: circle, spread: 360, by: 'diag' }],
    kin: kin || { shape: 'vee', h: 10.5, amp: 0.8, roll: 0.12 },
    cyc: cyc(K.black, cycCol, 0.22),
  }),

  /** Beams sweep across the crowd. */
  sweep: ({ col = K.gold, alt, dim = 0.9, swing = 22, rate = 8, zoom = 5, target = 'crowd', spread = [22, 0, 6], wave = 'sin', g = 'pods', kin, cycCol = col } = {}) => ({
    layers: [{ g, col, alt, dim, aim: target, spread, zoom, frost: 0.1 }],
    fx: [
      { g, a: 'pan', w: wave, rate, size: swing, spread: 120, by: 'pod' },
      { g, a: 'tilt', w: 'sin', rate: mul(rate, 2), size: 6, spread: 180, by: 'x' },
    ],
    kin: kin || { shape: 'rake', h: 9.8, amp: 1.2, roll: 0 },
    cyc: cyc(cycCol, K.black, 0.2),
  }),

  /** Organic, wandering beams (ballyhoo) with a colour spread. */
  ballyhoo: ({ col = K.magenta, alt, dim = 0.8, size = 30, rate = 8, zoom = 4, hueSpread = 0, tilt = 40, g = 'pods', strobe = 0, kin, cycCol = col } = {}) => ({
    layers: [{ g, col, alt, dim, pan: 0, tilt, zoom, frost: 0.1, hueSpread, strobe }],
    fx: [{ g, a: 'ballyhoo', rate, size, spread: 0, by: 'rand' }],
    kin: kin || { shape: 'chaos', h: 9.8, amp: 1.4, period: 32, roll: 0.18 },
    cyc: cyc(K.black, cycCol, 0.25),
  }),

  /** Beams aimed down the room's axis, circling with phase — a spiral tunnel. */
  tunnel: ({ col = K.green, alt, dim = 0.8, size = 14, rate = 8, zoom = 2.5, target = 'deep', g = 'pods', kin, cycCol = col } = {}) => ({
    layers: [{ g, col, alt, dim, aim: target, zoom, frost: 0.05 }],
    fx: [{ g, a: 'circle', rate, size, spread: 360, by: 'slot' }],
    kin: kin || { shape: 'twist', h: 9.8, amp: 1, period: 64, roll: 0.25 },
    cyc: cyc(K.black, cycCol, 0.15),
  }),

  /** Floor units shooting up in a slow tilt fan. */
  floorUp: ({ col = K.uv, alt, dim = 0.8, fan = 22, rate = 16, zoom = 5, lean = 8 } = {}) => ({
    layers: [{ g: 'floor', col, alt, dim, pan: 0, tilt: lean, zoom, frost: 0.1 }],
    fx: [
      { g: 'floor', a: 'pan', w: 'sin', rate, size: fan, spread: 180, by: 'x', wings: true },
      { g: 'floor', a: 'tilt', w: 'sin', rate: mul(rate, 1.5), size: 10, spread: 360, by: 'x' },
    ],
  }),

  /** Everything, everywhere: the peak. */
  peak: ({ col = K.white, alt = K.gold, rate = 1, dim = 1, hueSpread = 0, strobe = 0 } = {}) => ({
    layers: [
      { g: 'pods', col, alt, altPod: true, dim, pan: 0, tilt: 48, zoom: 5, frost: 0.05, fan: 50, hueSpread, strobe },
      { g: 'floor', col, dim, pan: 0, tilt: 18, zoom: 6, fan: 30 },
    ],
    fx: [
      { g: 'pods', a: 'dim', w: 'square', rate, size: 0.65, spread: 180, by: 'pod', duty: 0.55 },
      { g: 'pods', a: 'tilt', w: 'sin', rate: mul(rate, 4), size: 16, spread: 360, by: 'x' },
      { g: 'pods', a: 'pan', w: 'sin', rate: mul(rate, 8), size: 14, spread: 180, by: 'pod' },
      { g: 'floor', a: 'tilt', w: 'tri', rate: mul(rate, 2), size: 16, spread: 360, by: 'x' },
    ],
    kin: { shape: 'wave', h: 9.2, amp: 1.8, period: 16, roll: 0.22 },
    cyc: cyc(col, alt, 0.55),
  }),

  /** Narrow downlights twinkling at random — rain, or stars. */
  rain: ({ col = K.ice, dim = 0.7, rate = 0.5, zoom = 1.6, size = 1, g = 'pods', tilt = 0, kin, cycCol = K.blue } = {}) => ({
    layers: [{ g, col, dim, pan: 0, tilt, zoom, frost: 0 }],
    fx: [{ g, a: 'dim', w: 'rand', rate, size, spread: 0, by: 'rand' }],
    kin: kin || { shape: 'breathe', h: 10.5, amp: 0.8, period: 64 },
    cyc: cyc(K.black, cycCol, 0.18),
  }),

  /** Warm light rising from the floor with the pods fanning like rays. */
  sunrise: ({ col = K.amber, sun = K.gold, dim = 0.85 } = {}) => ({
    layers: [
      { g: 'floor', col, dim, pan: 0, tilt: 4, zoom: 12, frost: 0.4, fan: 8 },
      { g: 'pods', col: sun, dim: mul(dim, 0.6), pan: 0, tilt: 35, fan: 60, zoom: 7, frost: 0.4 },
    ],
    fx: [{ g: 'pods', a: 'dim', w: 'sin', rate: 16, size: 0.4, spread: 360, by: 'center' }],
    kin: { shape: 'rake', h: 10.5, amp: -1.5 },
    cyc: cyc(sun, col, 0.45, 0.9),
  }),

  /** Mirrored halves with a chase meeting in the middle. */
  split: ({ left = K.magenta, right = K.cyan, dim = 0.85, tilt = 45, fan = 40, rate = 4, zoom = 3.5, kin } = {}) => ({
    layers: [
      { g: 'left', col: left, dim, pan: 0, tilt, fan: -fan * 0.2, zoom, frost: 0.05 },
      { g: 'right', col: right, dim, pan: 0, tilt, fan: fan * 0.2, zoom, frost: 0.05 },
      { g: 'pods', fan },
    ],
    fx: [
      { g: 'pods', a: 'dim', w: 'saw', rate, size: 0.8, spread: 360, by: 'x', wings: true },
      { g: 'pods', a: 'tilt', w: 'sin', rate: mul(rate, 4), size: 18, spread: 180, by: 'x', wings: true },
    ],
    kin: kin || { shape: 'twist', h: 9.6, amp: 0.8, period: 32, roll: 0.3 },
    cyc: cyc(left, right, 0.3),
  }),

  /** Snappy on-beat funk: odd/even trade on the beat, tilts bounce. */
  funk: ({ a = K.lime, b = K.magenta, dim = 0.9, rate = 1, zoom = 4.5, kin } = {}) => ({
    layers: [
      { g: 'odd', col: a, dim, pan: 0, tilt: 38, zoom, frost: 0.05, fan: 30 },
      { g: 'even', col: b, dim, pan: 0, tilt: 38, zoom, frost: 0.05, fan: 30 },
    ],
    fx: [
      { g: 'odd', a: 'dim', w: 'square', rate, size: 1, duty: 0.5 },
      { g: 'even', a: 'dim', w: 'square', rate, size: 1, duty: 0.5, off: 0.5 },
      { g: 'pods', a: 'tilt', w: 'pulse', rate: mul(rate, 0.5), size: 12, spread: 90, by: 'pod' },
    ],
    kin: kin || { shape: 'rake', h: 9.5, amp: 1.2, roll: 0.1 },
    cyc: cyc(a, b, 0.35),
  }),

  /** Single specials picking out the players. */
  specials: ({ col = K.warm, dim = 0.7, zoom = 7 } = {}) => ({
    layers: [
      { g: [1], col, dim, aim: 'keys', zoom, frost: 0.5 },
      { g: [4], col, dim, aim: 'guitar', zoom, frost: 0.5 },
      { g: [7], col, dim, aim: 'bass', zoom, frost: 0.5 },
      { g: [24], col, dim: mul(dim, 0.8), aim: 'drums', zoom: zoom + 3, frost: 0.5 },
    ],
  }),
};

const sec = (n, d, f, look) => ({ n, d, f, L: look });
const specials = (col, dim) => L.specials({ col, dim });

// ——— the shows ———
export const SHOWS = [
  {
    id: 'slowBuild', name: 'Slow Build', bpm: 118,
    blurb: 'Eleven minutes from a blue hush to a white-hot peak and a warm release.',
    sections: [
      sec('Hush', 55, 3, merge(L.dark({ cycCol: K.blue }), L.wash({ col: K.royal, dim: up(0.05, 0.4) }))),
      sec('Groove', 95, 6, merge(
        L.wash({ col: K.blue, dim: 0.3 }),
        L.fan({ col: K.cyan, alt: K.blue, dim: up(0.35, 0.6), tilt: 42, fan: 28, zoom: 5, chase: { rate: 16, spread: 180, by: 'x', size: 0.6 }, kin: { shape: 'wave', h: 10.5, amp: 0.6, period: 64 }, cycCol: K.blue }),
      )),
      sec('Theme', 85, 6, merge(
        L.curtain({ col: K.teal, alt: K.cyan, dim: 0.7, ripple: up(6, 16), rate: 16, kin: { shape: 'arch', h: 10, amp: 1.4 } }),
        L.floorUp({ col: K.blue, dim: 0.35, fan: 12, rate: 32 }),
      )),
      sec('Build I', 100, 8, merge(
        L.fan({ col: blend(K.blue, K.uv), alt: K.violet, dim: up(0.45, 0.9), tilt: up(30, 60), fan: up(20, 48), zoom: 3.5, chase: { rate: steps([16, 8, 8, 4]), spread: 360, by: 'x', size: up(0.5, 0.85) }, kin: { shape: 'wave', h: up(10.5, 9), amp: up(0.4, 1.4), period: 32, roll: up(0, 0.18) }, cycCol: K.uv }),
      )),
      sec('Build II', 90, 6, merge(
        L.converge({ col: K.magenta, alt: K.uv, dim: up(0.6, 1), circle: up(0, 16), rate: steps([16, 8, 4]), kin: { shape: 'vee', h: 10.5, amp: up(0.5, 1.4), roll: up(0.05, 0.25) } }),
        L.floorUp({ col: K.uv, dim: up(0.3, 0.8), rate: 8 }),
      )),
      sec('Build III', 80, 4, merge(
        L.sweep({ col: blend(K.gold, K.white, 0.3, 1), alt: K.amber, dim: 1, swing: up(12, 34), rate: steps([8, 4, 4, 2]), cycCol: K.amber }),
        L.floorUp({ col: K.gold, dim: 0.8, rate: 4 }),
        { fx: [{ g: 'floor', a: 'strobe', w: 'square', rate: 1, size: (c) => (c.p > 0.82 ? 0.75 : 0) }, { g: 'pods', a: 'strobe', w: 'square', rate: 1, size: (c) => (c.p > 0.93 ? 0.9 : 0) }] },
      )),
      sec('Peak', 64, 0.3, L.peak({ col: K.white, alt: K.gold, rate: 1 })),
      sec('Release', 70, 5, merge(L.sunrise({ col: K.amber, sun: K.gold, dim: up(1, 0.7) }), specials(K.warm, 0.5))),
      sec('Afterglow', 50, 8, merge(L.dark({ col: K.amber, cycCol: K.orange, floor: up(0.35, 0.05), cycDim: up(0.3, 0.05) }), specials(K.warm, up(0.5, 0.1)))),
    ],
  },
  {
    id: 'typeII', name: 'Type II Jam', bpm: 124,
    blurb: 'Twelve-plus minutes of open improvisation: liquid colour, tunnels, mirrors and a rainbow peak.',
    sections: [
      sec('Drift in', 60, 4, merge(L.rain({ col: K.lav, dim: up(0.1, 0.5), rate: 1, cycCol: K.uv }), L.wash({ col: K.uv, dim: 0.25 }))),
      sec('Liquid', 110, 8, L.ballyhoo({ col: K.magenta, dim: 0.65, size: 22, rate: 16, zoom: 4, hueSpread: up(40, 140), tilt: 38, cycCol: K.violet })),
      sec('Tunnel', 95, 6, merge(L.tunnel({ col: K.green, alt: K.teal, dim: 0.8, size: up(8, 18), rate: 8 }), L.floorUp({ col: K.teal, dim: 0.4 }))),
      sec('Mirror', 95, 5, L.split({ left: every(32, [K.magenta, K.orange, K.pink]), right: every(32, [K.cyan, K.lime, K.royal]), dim: 0.85, rate: 4 })),
      sec('Deep space', 90, 8, merge(
        L.curtain({ col: K.uv, dim: 0.55, ripple: 20, rate: 32, zoom: 1.8, by: 'diag', kin: { shape: 'twist', h: 11, amp: 1, period: 64, roll: 0.3 } }),
        L.rain({ g: 'floor', col: K.ice, dim: 0.8, rate: 0.5, zoom: 1.4 }),
      )),
      sec('Spiral', 100, 6, merge(
        L.converge({ col: K.red, alt: K.gold, dim: 0.9, circle: up(6, 22), rate: 4, point: 'air' }),
        { fx: [{ g: 'pods', a: 'hue', w: 'saw', rate: 32, size: 180, spread: 360, by: 'pod' }] },
      )),
      sec('Ramp', 80, 4, merge(
        L.ballyhoo({ col: K.pink, alt: K.gold, dim: 0.9, size: up(15, 35), rate: steps([8, 4, 2]), zoom: 3.2, tilt: 50, cycCol: K.pink }),
        { fx: [{ g: 'pods', a: 'dim', w: 'saw', rate: steps([4, 2, 1]), size: up(0.2, 0.8), spread: 360, by: 'x' }] },
      )),
      sec('Rainbow peak', 60, 0.5, L.peak({ col: K.red, alt: K.cyan, rate: 1, hueSpread: 300 })),
      sec('Landing', 65, 8, merge(L.wash({ col: K.lav, dim: up(0.6, 0.25), g: 'pods', zoom: 26 }), L.floorUp({ col: K.uv, dim: up(0.6, 0.1), rate: 32 }), L.dark({ cycCol: K.uv, floor: 0 }))),
    ],
  },
  {
    id: 'tension', name: 'Tension & Release', bpm: 132,
    blurb: 'Three waves of red, tightening strobing tension, each blown open into white.',
    sections: [
      sec('Count-in', 30, 2, merge(L.dark({ col: K.red, cycCol: K.crimson }), specials(K.red, 0.3))),
      ...[0, 1, 2].flatMap((k) => [
        sec(`Tension ${k + 1}`, 64 + k * 6, 3, merge(
          L.converge({ col: K.red, alt: K.crimson, dim: up(0.5, 1), point: 'deck', spread: up(6, 1), circle: up(2, 6), rate: steps([4, 2, 1, 0.5]), zoom: 2, kin: { shape: 'flat', h: up(10.5, 7.5), amp: 0 } }),
          { fx: [
            { g: 'pods', a: 'dim', w: 'square', rate: steps([2, 1, 0.5, 0.25]), size: up(0.2, 0.9), spread: 360, by: 'rand', duty: 0.5 },
            { g: 'pods', a: 'strobe', w: 'square', rate: 1, size: (c) => (c.p > 0.85 ? 0.9 : 0) },
          ] },
          L.floorUp({ col: K.red, dim: up(0.2, 0.9), fan: 8, rate: 2 }),
        )),
        sec(`Release ${k + 1}`, 38 + k * 6, 0.15, L.peak({ col: K.white, alt: [K.ice, K.gold, K.cyan][k], rate: [2, 1, 0.5][k] })),
        sec(`Breathe ${k + 1}`, 30, 5, merge(L.fan({ col: K.royal, alt: K.blue, dim: 0.45, tilt: 30, fan: 55, zoom: 8, chase: { rate: 16, size: 0.5 }, kin: { shape: 'rake', h: 11, amp: 1 }, cycCol: K.blue }), specials(K.ice, 0.4))),
      ]),
      sec('Last word', 40, 0.2, L.peak({ col: K.white, alt: K.white, rate: 0.5, strobe: 0 })),
      sec('Out', 25, 6, L.dark({ col: K.red, cycCol: K.crimson, floor: up(0.3, 0), cycDim: up(0.3, 0) })),
    ],
  },
  {
    id: 'sunset', name: 'Gorge Sunset', bpm: 96,
    blurb: 'An outdoor evening in nine minutes: golden hour, pink sky, dusk, stars, a moonrise.',
    sections: [
      sec('Golden hour', 70, 5, merge(L.sunrise({ col: K.amber, sun: K.gold, dim: 0.75 }), specials(K.warm, 0.5))),
      sec('Amber sweep', 80, 6, merge(L.sweep({ col: K.gold, alt: K.amber, dim: 0.75, swing: 18, rate: 16, zoom: 7, cycCol: K.orange }), L.floorUp({ col: K.orange, dim: 0.5, rate: 32 }))),
      sec('Pink sky', 80, 8, merge(
        L.converge({ col: blend(K.orange, K.pink), alt: K.gold, dim: 0.75, circle: 8, rate: 32, point: 'air', kin: { shape: 'arch', h: 10.5, amp: 1.2 } }),
        L.floorUp({ col: K.pink, dim: 0.5, rate: 32 }),
        { cyc: cyc(K.pink, K.orange, 0.5) },
      )),
      sec('Purple', 75, 8, merge(L.curtain({ col: blend(K.violet, K.uv), alt: K.pink, dim: 0.7, ripple: 10, rate: 32, kin: { shape: 'wave', h: 10, amp: 0.8, period: 64 } }), { cyc: cyc(K.violet, K.pink, 0.4) })),
      sec('Dusk', 70, 8, merge(L.fan({ col: K.blue, alt: K.royal, dim: 0.6, tilt: 58, fan: 45, zoom: 6, chase: { rate: 32, size: 0.6, by: 'center' }, kin: { shape: 'rake', h: 10, amp: 1 }, cycCol: K.blue }), L.floorUp({ col: K.uv, dim: 0.5, rate: 32 }))),
      sec('Stars', 75, 10, merge(L.rain({ col: K.ice, dim: 0.65, rate: 1, zoom: 1.2, tilt: 0, kin: { shape: 'breathe', h: 12, amp: 0.8, period: 96 }, cycCol: K.blue }), L.dark({ floor: 0, cycCol: K.blue, cycDim: 0.12 }))),
      sec('Night peak', 60, 3, merge(L.ballyhoo({ col: K.white, alt: K.ice, dim: 0.95, size: 24, rate: 4, zoom: 3, tilt: 50, cycCol: K.ice }), L.floorUp({ col: K.ice, dim: 0.9, rate: 4 }))),
      sec('Moonrise', 60, 8, merge(L.wash({ col: K.ice, dim: up(0.6, 0.2), g: 'pods', zoom: 24, target: 'deck', spread: [8, 0, 0] }), L.dark({ cycCol: K.royal, floor: 0.1, cycDim: up(0.3, 0.08) }))),
    ],
  },
  {
    id: 'ballad', name: 'Ballad', bpm: 70,
    blurb: 'Six and a half quiet minutes of soft beams, lavender air and the players in pools of light.',
    sections: [
      sec('Verse', 70, 5, merge(L.dark({ cycCol: K.uv, cycDim: 0.15 }), specials(K.warm, up(0.2, 0.6)))),
      sec('Air', 80, 8, merge(L.fan({ col: K.lav, alt: K.royal, dim: 0.35, tilt: 25, fan: 30, zoom: 14, frost: 0.6, chase: { rate: 32, size: 0.5, by: 'center' }, kin: { shape: 'breathe', h: 11, amp: 0.5, period: 64 }, cycCol: K.violet }), specials(K.warm, 0.5))),
      sec('Chorus', 75, 8, merge(L.converge({ col: K.lav, alt: K.pink, dim: 0.6, point: 'band', spread: 4, zoom: 5, circle: 3, rate: 32, kin: { shape: 'arch', h: 10, amp: 0.8 } }), L.floorUp({ col: K.violet, dim: 0.4, rate: 48 }))),
      sec('Solo', 80, 6, merge(L.wash({ col: K.royal, dim: 0.3, g: 'back', zoom: 30 }), { layers: [{ g: [3, 4, 5, 6], col: K.white, dim: 0.55, aim: 'guitar', zoom: 3.5, frost: 0 }, { g: [12, 13, 16, 17], col: K.lav, dim: 0.4, aim: 'guitar', zoom: 6, frost: 0.3 }] }, { cyc: cyc(K.royal, K.black, 0.25) })),
      sec('Last chorus', 60, 6, merge(L.curtain({ col: K.pink, alt: K.lav, dim: 0.55, ripple: 6, rate: 32, zoom: 4 }), specials(K.warm, 0.5))),
      sec('Fade', 30, 10, merge(L.dark({ cycCol: K.uv, floor: 0, cycDim: up(0.2, 0) }), specials(K.warm, up(0.5, 0)))),
    ],
  },
  {
    id: 'spaceFunk', name: 'Space Funk', bpm: 112,
    blurb: 'Eight minutes of snapping, on-the-one lime and magenta, stairs of truss and floor hits.',
    sections: [
      sec('Hi-hat', 45, 2, merge(L.dark({ col: K.lime, cycCol: K.green }), { layers: [{ g: 'floor', col: K.lime, dim: 0.9, tilt: 20, zoom: 4, fan: 25 }], fx: [{ g: 'floor', a: 'dim', w: 'pulse', rate: 0.5, size: 1, duty: 0.6 }] })),
      sec('On the one', 85, 3, L.funk({ a: K.lime, b: K.magenta, rate: 1, kin: { shape: 'rake', h: 9.5, amp: 1.5, roll: 0.1 } })),
      sec('Stairs', 80, 3, merge(
        L.fan({ col: K.amber, alt: K.lime, dim: 0.85, tilt: 40, fan: 40, zoom: 3.5, chase: { w: 'square', rate: 2, size: 1, spread: 360, by: 'pod' }, kin: { shape: 'rake', h: 9.5, amp: 2.2, roll: 0.15 }, cycCol: K.amber }),
        L.floorUp({ col: K.magenta, dim: 0.8, rate: 2 }),
      )),
      sec('Cow funk', 90, 3, merge(L.funk({ a: K.gold, b: K.teal, rate: 0.5 }), { fx: [{ g: 'pods', a: 'pan', w: 'square', rate: 2, size: 18, spread: 180, by: 'pod' }] })),
      sec('Wah', 75, 4, L.ballyhoo({ col: K.magenta, alt: K.lime, dim: 0.9, size: 18, rate: 2, zoom: 3, tilt: 46, strobe: 0, kin: { shape: 'twist', h: 9.8, amp: 1, period: 8, roll: 0.3 }, cycCol: K.magenta })),
      sec('Breakdown', 45, 2, merge(L.dark({ col: K.magenta, cycCol: K.magenta, floor: 0.2 }), specials(K.lime, 0.8), { fx: [{ g: 'all', a: 'dim', w: 'pulse', rate: 1, size: 0.8 }] })),
      sec('Get down', 75, 0.2, merge(L.peak({ col: K.lime, alt: K.magenta, rate: 0.5 }), { fx: [{ g: 'floor', a: 'dim', w: 'square', rate: 0.5, size: 1, duty: 0.4 }] })),
      sec('Out', 30, 4, merge(L.funk({ a: K.lime, b: K.magenta, rate: 1, dim: up(0.8, 0) }), L.dark({ cycCol: K.green, floor: 0, cycDim: up(0.3, 0) }))),
    ],
  },
];
