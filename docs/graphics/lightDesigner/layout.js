// layout.js — the physical rig, shared by the engine (aiming, groups) and the renderer.
//
// Units are metres. x runs across the stage (house left → right), y is up, and
// +z points from the stage toward the audience. The stage deck is 1.2 m high.
//
// The rig is "moving sticks", after Phish's 2019–23 design: 30 separate sticks of
// 5′, 8′ and 10′ truss, each on its own hoists, hung in six rows (p1 front … p6
// back) of five across a 62′ grid. Each row carries ten moving heads (two per
// stick), and twelve floor units stand along the upstage edge.
//
// Kinetics per row: `h` trims the row, `r` bends it into a smile or frown (and
// zigzags alternate rows), and `f[b]` flips each stick toward vertical (±1 = 90°).
// Flips are what make the rig modular: all-vertical columns, ±45° diamonds,
// outer legs down into portal frames, fans.
//
// A stick is a rigid *body* with a pose each frame: position + a 3×3 rotation `m`
// (row-major, world = m · local). Heads, truss segments and hoist points are body-local.

export const DECK_Y = 1.2;
export const DECK_FRONT = 3.2;
export const DECK_BACK = -10.6;
export const DECK_HALF = 11.5;
export const CYC_Z = -10.6;
export const POD_Z = [0.7, -1.1, -2.9, -4.7, -6.5, -8.3];
export const POD_COUNT = 6;
export const PER_POD = 10;
export const FLOOR_COUNT = 12;
export const HANG = 0.55; // lens below the truss centreline
export const GRID_Y = 24; // where hoist chains go up to

const DEG = Math.PI / 180;
const TAU = Math.PI * 2;

export function hash(n) {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// ——— 3×3 rotation helpers (row-major) ———
export const I3 = () => [1, 0, 0, 0, 1, 0, 0, 0, 1];
export const rotX = (a) => { const c = Math.cos(a), s = Math.sin(a); return [1, 0, 0, 0, c, -s, 0, s, c]; };
export const rotY = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, 0, s, 0, 1, 0, -s, 0, c]; };
export const rotZ = (a) => { const c = Math.cos(a), s = Math.sin(a); return [c, -s, 0, s, c, 0, 0, 0, 1]; };
export function mul3(a, b) {
  const o = new Array(9);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = a[i * 3] * b[j] + a[i * 3 + 1] * b[3 + j] + a[i * 3 + 2] * b[6 + j];
  return o;
}
export const apply3 = (m, x, y, z) => [m[0] * x + m[1] * y + m[2] * z, m[3] * x + m[4] * y + m[5] * z, m[6] * x + m[7] * y + m[8] * z];

/** Body-local point → world, given a pose { x, y, z, m }. */
export function toWorld(pose, l) {
  const w = apply3(pose.m, l[0], l[1], l[2]);
  return [pose.x + w[0], pose.y + w[1], pose.z + w[2]];
}

// 2019–2023: loose sticks of 5′, 8′ and 10′ truss, two hoists each, none pinned together.
const STICK_X = [-7.6, -3.8, 0, 3.8, 7.6];
const STICK_L = [[1.5, 3.0, 2.4, 3.0, 1.5], [2.4, 3.0, 3.0, 3.0, 2.4], [3.0, 2.4, 1.5, 2.4, 3.0]];
const stickLen = (p, b) => STICK_L[p % 3][b];
const sticks = {
  id: 'sticks', label: 'Moving sticks', unit: 'Row',
  bodies: 5,
  fixture(p, s) { const b = Math.floor(s / 2), L = stickLen(p, b); return { body: b, local: [(s % 2 ? 1 : -1) * L * 0.28, -HANG, 0] }; },
  pose(p, b, P, t, o) {
    const x = STICK_X[b], k = P.r * 7, n = x / 7.6;
    o.x = x; o.y = P.h + k * (n * n - 0.4); o.z = POD_Z[p];
    const slope = (2 * k * n) / 7.6;
    const zig = p % 2 ? P.r * (b % 2 ? 1 : -1) * 0.8 : 0;
    const flip = P.f ? P.f[b] : 0;
    o.m = rotZ(Math.atan(slope) + zig + (flip * Math.PI) / 2);
  },
  segs: (p, b) => { const L = stickLen(p, b) / 2; return [[[-L, 0, 0], [L, 0, 0]]]; },
  hoists: (p, b) => { const L = stickLen(p, b) / 2 - 0.2; return [[-L, 0.26, 0], [L, 0.26, 0]]; },
};

export const RIG = sticks;

/** Fixtures, with their phase keys laid out on the rig. */
export function buildFixtures(rig = RIG) {
  const list = [];
  for (let p = 0; p < POD_COUNT; p++) {
    for (let s = 0; s < PER_POD; s++) list.push({ kind: 'spot', hang: true, pod: p, slot: s });
  }
  for (let s = 0; s < FLOOR_COUNT; s++) {
    const x = -10.2 + (s * 20.4) / (FLOOR_COUNT - 1);
    list.push({ kind: 'floor', hang: false, pod: -1, slot: s, lx: x, base: [x, DECK_Y + 0.38, -9.7] });
  }
  list.forEach((f, i) => { f.i = i; f.kr = hash(i + 3); });
  layoutFixtures(list, rig);
  return list;
}

/** Fixture data that depends on the rig: local mount, body and the x/pod phase keys. */
export function layoutFixtures(list, rig) {
  const o = {}, rest = { h: 9.5, r: 0 };
  for (const f of list) {
    if (f.hang) {
      const fx = rig.fixture(f.pod, f.slot);
      f.body = fx.body; f.local = fx.local;
      o.scale = 1;
      rig.pose(f.pod, f.body, rest, 0, o);
      f.lx = worldOf(o, f.local)[0];
    }
    f.kx = Math.max(0, Math.min(1, (f.lx + 10.2) / 20.4));
    f.kpod = f.pod < 0 ? 1 : f.pod / (POD_COUNT - 1);
    f.kc = Math.abs(f.kx - 0.5) * 2;
    f.kslot = f.slot / ((f.hang ? PER_POD : FLOOR_COUNT) - 1);
  }
}

function worldOf(pose, l) {
  const s = pose.scale || 1;
  const w = apply3(pose.m, l[0] * s, l[1], l[2] * s);
  return [pose.x + w[0], pose.y + w[1], pose.z + w[2]];
}
/** Body-local point → world. */
export const bodyToWorld = worldOf;

/**
 * Where a ray lands: the deck, the house floor, the venue's walls and ceiling
 * (`E.venueBox`), or a closed theater curtain (`E.curtain`). `E.floorOn === false`
 * lets beams through the deck and floor. Writes { L, hit } into `out`; `hit` is
 * false when the ray just runs out into the haze after `maxL`.
 */
export function landing(E, px, py, pz, dx, dy, dz, maxL, out) {
  let L = maxL, hit = false;
  if (E.floorOn !== false && dy < -1e-4) {
    const t1 = (DECK_Y - py) / dy, hx = px + dx * t1, hz = pz + dz * t1;
    if (t1 > 0 && hz < DECK_FRONT && hz > DECK_BACK && Math.abs(hx) < DECK_HALF) { if (t1 < L) { L = t1; hit = true; } }
    else { const t0 = -py / dy; if (t0 > 0 && t0 < L) { L = t0; hit = true; } }
  }
  const b = E.venueBox;
  if (b) {
    const tx = dx > 1e-6 ? (b.x - px) / dx : dx < -1e-6 ? (-b.x - px) / dx : Infinity;
    const ty = dy > 1e-6 ? (b.top - py) / dy : Infinity;
    const tz = dz > 1e-6 ? (b.zMax - pz) / dz : dz < -1e-6 ? (b.zMin - pz) / dz : Infinity;
    const t = Math.min(tx, ty, tz);
    if (t > 0 && t < L) { L = t; hit = true; }
  }
  const c = E.curtain; // a house curtain closing from both sides toward the centre
  if (c && c.cover > 0.001 && Math.abs(dz) > 1e-4) {
    const t = (c.z - pz) / dz;
    if (t > 0 && t < L) {
      const hx = Math.abs(px + dx * t), hy = py + dy * t;
      if (hy < c.top && hx < c.halfW && hx > c.halfW * (1 - c.cover)) { L = t; hit = true; }
    }
  }
  out.L = Math.max(0.2, L);
  out.hit = hit;
  return out;
}

/** Named groups → ordered fixture indices. Units are numbered 1 (front / inner) … 6. */
export function buildGroups(fx) {
  const pick = (fn) => fx.filter(fn).map((f) => f.i);
  const g = {
    all: pick(() => true),
    pods: pick((f) => f.hang),
    floor: pick((f) => !f.hang),
    odd: pick((f) => f.slot % 2 === 0),
    even: pick((f) => f.slot % 2 === 1),
    left: pick((f) => f.kx < 0.5),
    right: pick((f) => f.kx >= 0.5),
    inner: pick((f) => f.hang && f.kc < 0.5),
    outer: pick((f) => f.hang && f.kc >= 0.5),
    front: pick((f) => f.hang && f.pod <= 1),
    mid: pick((f) => f.pod === 2 || f.pod === 3),
    back: pick((f) => f.pod >= 4),
    oddPods: pick((f) => f.hang && f.pod % 2 === 0),
    evenPods: pick((f) => f.hang && f.pod % 2 === 1),
  };
  for (let p = 0; p < POD_COUNT; p++) g[`p${p + 1}`] = pick((f) => f.pod === p);
  return g;
}

export function groupLabels(unit = 'Row') {
  const u = unit, us = `${unit.toLowerCase()}s`;
  return {
    all: 'All', pods: `All ${us}`, floor: 'Floor', p1: `${u} 1`, p2: `${u} 2`, p3: `${u} 3`, p4: `${u} 4`, p5: `${u} 5`, p6: `${u} 6`,
    front: `${u}s 1–2`, mid: `${u}s 3–4`, back: `${u}s 5–6`, oddPods: `Odd ${us}`, evenPods: `Even ${us}`,
    odd: 'Odd heads', even: 'Even heads', left: 'Left half', right: 'Right half', inner: 'Inner', outer: 'Outer',
  };
}
export const GROUP_LABELS = groupLabels('Row');

/**
 * Lens position and base rotation for a fixture. `E` supplies { rig, pods, time }.
 * Out: { x, y, z, m } — m rotates the fixture's local frame (base axis −y) to world.
 */
export function fixtureFrame(f, E, o) {
  if (!f.hang) {
    o.x = f.base[0]; o.y = f.base[1]; o.z = f.base[2]; o.m = IDENT;
    return o;
  }
  const P = o._pose || (o._pose = {});
  P.scale = 1;
  E.rig.pose(f.pod, f.body, E.pods[f.pod], E.time || 0, P);
  const w = worldOf(P, f.local);
  o.x = w[0]; o.y = w[1]; o.z = w[2]; o.m = P.m;
  return o;
}
const IDENT = I3();

/** World beam direction from pan/tilt in degrees. Tilt 0 = along the fixture's base axis. */
export function beamDir(f, frame, pan, tilt, o) {
  const p = pan * DEG, t = tilt * DEG, st = Math.sin(t);
  const lx = st * Math.sin(p), lz = st * Math.cos(p), ly = f.hang ? -Math.cos(t) : Math.cos(t);
  const m = frame.m;
  o.x = m[0] * lx + m[1] * ly + m[2] * lz;
  o.y = m[3] * lx + m[4] * ly + m[5] * lz;
  o.z = m[6] * lx + m[7] * ly + m[8] * lz;
  return o;
}

/** Pan/tilt (degrees) that point a fixture at world point (tx,ty,tz). */
export function aimAt(f, frame, tx, ty, tz, out) {
  let dx = tx - frame.x, dy = ty - frame.y, dz = tz - frame.z;
  const len = Math.hypot(dx, dy, dz) || 1;
  dx /= len; dy /= len; dz /= len;
  const m = frame.m; // local = mᵀ · d
  const lx = m[0] * dx + m[3] * dy + m[6] * dz;
  const ly = m[1] * dx + m[4] * dy + m[7] * dz;
  const lz = m[2] * dx + m[5] * dy + m[8] * dz;
  const c = Math.max(-1, Math.min(1, f.hang ? -ly : ly));
  out.tilt = Math.acos(c) / DEG;
  out.pan = out.tilt < 0.5 ? 0 : Math.atan2(lx, lz) / DEG;
  return out;
}
