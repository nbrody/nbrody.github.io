// The sand the machine stands in (pure JS: the renderer and the headless
// checks share it).
//
// sandHeight(x, z) is the sculpted beach before any digging: a flat beach that
// shelves into the sea to the north, a sand pie round the palm with the
// return channel running round its rim, the castle's plinth, and a dune ridge
// with the tide pool dug into its end. digEarthworks(machine) then follows
// every track: where one runs just into the sand it cuts a trench with sloping
// sides; where the sand closes over the ball it leaves a tunnel, recording the
// tunnel's extent and its two mouths.

import { PALM, CASTLE, RING, ringY } from './layout.js';
import { BALL, RAIL } from '../../../ballMachine/js/sim/constants.js';

const R = BALL.R;
const deg = Math.PI / 180;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const sstep = (t) => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
// smooth maximum (blend width k)
const smax = (a, b, k) => { const h = clamp(0.5 + 0.5 * (a - b) / k, 0, 1); return lerp(b, a, h) + k * h * (1 - h); };

export const SEA_LEVEL = -0.16;
export const SHORE = { z0: -6.9, slope: 0.055 };               // the beach shelves north of z0
export const SHORELINE_Z = SHORE.z0 + SEA_LEVEL / SHORE.slope;  // where the still water meets the sand
export const DUNE = { a: { x: 4.6, z: -1.95, h: 2.8 }, b: { x: 2.35, z: -1.25, h: 2.35 }, half: 0.5, slope: 1.3 };
export const POOL_AT = { x: 2.1, z: -1.45, rim: 1.935, r: 0.52 };

// ------------------------------------------------------------ the beach
export function beachHeight(x, z) {
  let h = 0;
  if (z < SHORE.z0) h -= (SHORE.z0 - z) * SHORE.slope;
  // wind ripples in the dry sand and low dunes behind the beach (south)
  const far = sstep((Math.hypot(x, z * 1.2) - 10) / 4);
  h += far * (0.05 * Math.sin(x * 0.61 + 1.3) * Math.sin(z * 0.43) + 0.03 * Math.sin(x * 1.7 - z * 0.9));
  if (z > 7) h += 1.5 * sstep((z - 7) / 9) * (0.75 + 0.25 * Math.sin(x * 0.23 + 0.8));
  return h;
}

// the sand pie round the palm: a plateau whose rim carries the return channel
// (so the rim spirals down with it), a hollow round the trunk, and a steep
// patted wall with a flared foot
export function pieHeight(x, z) {
  const r = Math.hypot(x, z);
  if (r > 2.4) return -1;
  const th = Math.atan2(-z, x) / deg;
  const t = th < RING.T0 ? th + 360 : th;                      // ring angle, T0 … T0 + 360
  let top;
  if (t <= RING.T1) top = ringY(t);
  else top = lerp(ringY(RING.T1), ringY(RING.T0), sstep((t - RING.T1) / (RING.T0 + 360 - RING.T1)));
  top += 0.014;
  // plateau, falling into the hollow round the palm
  const rp = Math.hypot(x - PALM.cx, z - PALM.cz);
  let h = lerp(1.0, top, sstep((rp - 0.55) / 0.62));
  // a rounded shoulder and a steep patted side, smooth all the way down
  if (r > 1.47) h = top * (1 - sstep((r - 1.47) / 0.95));
  return h;
}

export function plinthHeight(x, z) {
  const C = CASTLE, r = Math.hypot(x - C.cx, z - C.cz);
  if (r > 2.8) return -1;
  if (r <= C.plinthR) return C.base;
  return C.base * (1 - sstep((r - C.plinthR) / 0.95));
}

export function duneHeight(x, z) {
  const { a, b, half, slope } = DUNE;
  const abx = b.x - a.x, abz = b.z - a.z, L2 = abx * abx + abz * abz;
  const t = clamp(((x - a.x) * abx + (z - a.z) * abz) / L2, 0, 1);
  const d = Math.hypot(x - (a.x + abx * t), z - (a.z + abz * t));
  const crest = lerp(a.h, b.h, t);
  // a soft crest, a steep face
  let h = crest - 0.15 * sstep(Math.min(d, half) / half) - Math.max(0, d - half) * slope;
  h = Math.max(h, 0.3 * (1 - sstep((d - half - crest / slope) / 0.6)));
  if (d > half + crest / slope + 0.6 && Math.hypot(x - POOL_AT.x, z - POOL_AT.z) > POOL_AT.r + 0.5) return -1;
  // the tide pool, dug into the dune's end: a level ring of sand round its
  // rim, and a hole for the pool's bowl
  const rp = Math.hypot(x - POOL_AT.x, z - POOL_AT.z);
  if (rp < POOL_AT.r + 0.5) {
    const k = sstep((rp - POOL_AT.r) / 0.5);
    h = lerp(POOL_AT.rim, Math.max(h, POOL_AT.rim), k);
    if (rp < POOL_AT.r) h = lerp(POOL_AT.rim - 0.4, POOL_AT.rim, sstep((rp - POOL_AT.r + 0.05) / 0.05));
  }
  return h;
}

/** The sculpted sand, before the tracks dig into it. */
export function sandHeight(x, z) {
  let h = beachHeight(x, z);
  const p = pieHeight(x, z), c = plinthHeight(x, z), d = duneHeight(x, z);
  if (p > -1) h = smax(h, p, 0.08);
  if (c > -1) h = smax(h, c, 0.08);
  if (d > -1) h = smax(h, d, 0.12);
  return h;
}

// ------------------------------------------------------------ digging
// Depth below the ball centre of a track's underside, the half-width of a
// trench's floor, and how far above the ball centre the sand must lie before
// it counts as a roof (a tunnel) rather than a cutting.
function trackBody(t) {
  // a flume in the sand is a U-shaped channel (its floor is the channel's own round bottom)
  if (t.kind === 'flume') { const fl = t.flume; return { below: R + 0.012, half: fl.Rc, roof: fl.rho + fl.Rc + 0.04, tube: fl.Rc + 0.008, axis: fl.rho, round: fl.Rc }; }
  if (t.kind === 'trough') return { below: R + 0.016, half: (t.render.wide ?? 0) + R + 0.012, roof: R + 0.07, tube: (t.render.wide ?? 0) + R + 0.04, axis: 0.005 };
  return { below: RAIL.drop + BALL.railRadius + 0.014, half: RAIL.lateral + 0.03, roof: R + 0.07, tube: 0.07, axis: 0.004 };
}

// The dug grid; outside it the sand is sandHeight (flat beach or a planar
// shelf), so a coarse mesh can take over at its edge without cracks.
export const GRID = { x0: -7, x1: 8, z0: -8, z1: 3, step: 0.05 };

/**
 * Follow every track through the sand. Returns the dug height grid, a
 * heightAt(x, z) sampler, and the tunnels [{ track, s0, s1, body }] with their
 * mouths [{ track, s, inward }] (inward = +1 if the track runs into the sand
 * at s, −1 if out of it).
 */
export function digEarthworks(machine, opts = {}) {
  const G = { ...GRID, ...opts.grid };
  const nx = Math.round((G.x1 - G.x0) / G.step) + 1, nz = Math.round((G.z1 - G.z0) / G.step) + 1;
  const H = new Float32Array(nx * nz);
  for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) H[j * nx + i] = sandHeight(G.x0 + i * G.step, G.z0 + j * G.step);
  const base = H.slice();
  const baseAt = (x, z) => sample(base, x, z);
  function sample(A, x, z) {
    const fx = (x - G.x0) / G.step, fz = (z - G.z0) / G.step;
    if (fx < 0 || fz < 0 || fx > nx - 1 || fz > nz - 1) return sandHeight(x, z);
    const i = Math.min(nx - 2, Math.floor(fx)), j = Math.min(nz - 2, Math.floor(fz)), u = fx - i, v = fz - j;
    const k = j * nx + i;
    return (A[k] * (1 - u) + A[k + 1] * u) * (1 - v) + (A[k + nx] * (1 - u) + A[k + nx + 1] * u) * v;
  }
  // extra channels (the calm half of the moat) are dug before anything else
  for (const ch of opts.channels ?? []) digChannel({ grid: G, nx, nz, H }, ch.pts, ch.half);
  base.set(H);
  const tunnels = [], mouths = [], trenches = [];
  const states = new Map(), bodies = new Map();
  const f = {};
  const SLOPE = 1.35;                                           // trench banks (≈ 53°)
  const ds = 0.02;
  const tracks = machine.world.tracks.filter((t) => !t.render?.hidden);
  // close up specks: runs shorter than 8 cm take their neighbours' state
  const despeck = (state) => {
    const n = state.length;
    for (let pass = 0; pass < 2; pass++) {
      let i = 0;
      while (i < n) {
        let j = i;
        while (j + 1 < n && state[j + 1] === state[i]) j++;
        if (j - i < 4 && i > 0 && j < n - 1 && state[i - 1] === state[j + 1]) for (let k = i; k <= j; k++) state[k] = state[i - 1];
        i = j + 1;
      }
    }
  };
  // a cutting's cross-section, lowered into the grid round one sample
  const dig = (t, body, s) => {
    t.sample(s, f);
    const yb = f.py - body.below, reach = body.half + 0.8;
    const i0 = Math.max(0, Math.floor((f.px - reach - G.x0) / G.step)), i1 = Math.min(nx - 1, Math.ceil((f.px + reach - G.x0) / G.step));
    const j0 = Math.max(0, Math.floor((f.pz - reach - G.z0) / G.step)), j1 = Math.min(nz - 1, Math.ceil((f.pz + reach - G.z0) / G.step));
    for (let j = j0; j <= j1; j++) for (let ii = i0; ii <= i1; ii++) {
      const x = G.x0 + ii * G.step, z = G.z0 + j * G.step;
      // distance across the track (ignore the along-track offset so the
      // trench ends square at a tunnel mouth rather than rounding off)
      const dx = x - f.px, dz = z - f.pz;
      const al = Math.hypot(f.tx, f.tz) || 1, a = (dx * f.tx + dz * f.tz) / al;
      if (Math.abs(a) > ds * 0.75 + 0.001) continue;
      const across = Math.sqrt(Math.max(0, dx * dx + dz * dz - a * a));
      let y;
      if (body.round) {
        const ya = f.py + body.axis - 0.004, rc = body.round;
        y = across < rc ? ya - Math.sqrt(rc * rc - across * across) : ya + (across - rc) * SLOPE;
      } else y = yb + Math.max(0, across - body.half) * SLOPE;
      const k = j * nx + ii;
      if (y < H[k]) H[k] = y;
    }
  };
  // 1. classify every sample against the sculpted sand
  for (const t of tracks) {
    const body = trackBody(t);
    const n = Math.max(2, Math.ceil(t.L / ds) + 1);
    const state = new Int8Array(n);                              // 0 clear, 1 trench, 2 tunnel
    for (let i = 0; i < n; i++) {
      t.sample(Math.min(t.L, i * ds), f);
      const h = baseAt(f.px, f.pz), yb = f.py - body.below;
      state[i] = h < yb ? 0 : h < f.py + body.roof || t.meta.open ? 1 : 2;
    }
    despeck(state);
    states.set(t, state); bodies.set(t, body);
  }
  // 2. dig the cuttings; where one cutting strips the cover off another
  // track's tunnel, that stretch becomes a cutting too (repeat until stable)
  const dug = new Map(tracks.map((t) => [t, new Uint8Array(states.get(t).length)]));
  for (let round = 0; round < 4; round++) {
    for (const t of tracks) {
      const state = states.get(t), done = dug.get(t), body = bodies.get(t);
      for (let i = 0; i < state.length; i++) if (state[i] === 1 && !done[i]) { dig(t, body, Math.min(t.L, i * ds)); done[i] = 1; }
    }
    let changed = false;
    for (const t of tracks) {
      const state = states.get(t), body = bodies.get(t);
      for (let i = 0; i < state.length; i++) {
        if (state[i] !== 2) continue;
        t.sample(Math.min(t.L, i * ds), f);
        if (sample(H, f.px, f.pz) < f.py + body.roof) { state[i] = 1; changed = true; }
      }
      despeck(state);
    }
    if (!changed) break;
  }
  // 3. runs of trench and tunnel, and the tunnels' mouths
  for (const t of tracks) {
    const state = states.get(t), body = bodies.get(t), n = state.length;
    let i = 0;
    while (i < n) {
      let j = i;
      while (j + 1 < n && state[j + 1] === state[i]) j++;
      const s0 = i * ds, s1 = Math.min(t.L, j * ds);
      if (state[i] === 2 && s1 - s0 > 0.04) {
        tunnels.push({ track: t, s0, s1, body });
        if (i > 0) mouths.push({ track: t, s: s0, inward: 1, body });
        if (j < n - 1) mouths.push({ track: t, s: s1, inward: -1, body });
      } else if (state[i] === 1) trenches.push({ track: t, s0, s1, body });
      i = j + 1;
    }
  }
  // a tunnel that starts (or ends) where one track hands over to the next
  // needs a mouth there unless the neighbouring track is underground too
  const last = (t) => { const st = states.get(t); return st ? st[st.length - 1] : 0; };
  for (const tn of tunnels) {
    const t = tn.track;
    if (tn.s0 < 0.001) {
      const preds = machine.world.tracks.filter((u) => u.next?.track === t && Math.abs(u.next.s) < 0.01);
      if (preds.length && preds.every((u) => last(u) !== 2)) mouths.push({ track: t, s: 0, inward: 1, body: tn.body });
    }
    if (tn.s1 > t.L - 0.03 && t.next && t.next.s < 0.01) {
      const st = states.get(t.next.track);
      if (st && st[0] !== 2) mouths.push({ track: t, s: t.L, inward: -1, body: tn.body });
    }
  }
  const heightAt = (x, z) => sample(H, x, z);
  return { grid: G, nx, nz, H, base, heightAt, baseAt, tunnels, mouths, trenches, trackBody };
}

/** Dig a channel along a polyline [{x, y, z}] (y = the channel floor) into the dug grid. */
export function digChannel(E, pts, half, slope = 1.35) {
  const G = E.grid, nx = E.nx, nz = E.nz, H = E.H;
  for (const p of pts) {
    const reach = half + 0.6;
    const i0 = Math.max(0, Math.floor((p.x - reach - G.x0) / G.step)), i1 = Math.min(nx - 1, Math.ceil((p.x + reach - G.x0) / G.step));
    const j0 = Math.max(0, Math.floor((p.z - reach - G.z0) / G.step)), j1 = Math.min(nz - 1, Math.ceil((p.z + reach - G.z0) / G.step));
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      const d = Math.hypot(G.x0 + i * G.step - p.x, G.z0 + j * G.step - p.z);
      const y = p.y + Math.max(0, d - half) * slope - (d < half ? Math.sqrt(Math.max(0, half * half - d * d)) * 0.6 : 0);
      const k = j * nx + i;
      if (y < H[k]) H[k] = y;
    }
  }
}
