// layout.js — the physical rigs, shared by the engine (aiming, groups) and the renderer.
//
// Units are metres. x runs across the stage (house left → right), y is up, and
// +z points from the stage toward the audience. The stage deck is 1.2 m high.
//
// Every rig has the same logical shape, so shows, groups, cues and MIDI carry over:
// six kinetic units (p1 … p6) of ten moving heads each, plus twelve floor units
// along the upstage edge. A rig decides what a unit *is* (a straight pod, a ring,
// a square portal, a row of loose truss sticks, a video-wall panel, a virtual
// ring) and what the two kinetic values do: `h` (trim height) and `r` (roll,
// ±0.4) — tilt a ring, spin a portal, bend a row of sticks into a smile.
//
// A unit is made of one or more rigid *bodies* (a row of sticks has five). Each
// body has a pose each frame: position + a 3×3 rotation `m` (row-major, world =
// m · local). Heads, truss segments, hoist points and panels are body-local.

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

// segments around a closed curve, for rings and ovals
function loop(n, fx) {
  const pts = Array.from({ length: n }, (_, k) => fx((k / n) * TAU));
  return pts.map((p, k) => [p, pts[(k + 1) % n]]);
}

// ——— the rigs ———
// Each: { id, label, unit, blurb, sources, bodies, fixture(p, s) → { body, local },
//   pose(p, b, P = {h, r}, t, out), segs(p, b), hoists(p, b), panel?(p, b) → { w, h } }

const pods = {
  id: 'pods', label: 'Kinetic pods (this site’s original)', unit: 'Pod',
  blurb: 'Six long pods front to back, each on two hoists. Height trims them; roll tips them sideways.',
  bodies: 1,
  fixture: (p, s) => ({ body: 0, local: [-8.4 + (s * 16.8) / 9, -HANG, 0] }),
  pose(p, b, P, t, o) { o.x = 0; o.y = P.h; o.z = POD_Z[p]; o.m = rotZ(P.r); },
  segs: () => [[[-9.5, 0, 0], [9.5, 0, 0]]],
  hoists: () => [[-7.2, 0.26, 0], [7.2, 0.26, 0]],
};

const RING_R = [2.4, 4.0, 5.5, 7.0, 8.5, 10.0];
const circles = {
  id: 'circles', label: 'Circles (pre-2018)', unit: 'Ring',
  blurb: 'Concentric circular trusses over the stage, inner (1) to outer (6). Height stacks them into domes and cones; roll tilts each ring like a canvas turning toward you.',
  bodies: 1,
  fixture(p, s) { const a = (s / PER_POD) * TAU + p * 0.31, R = RING_R[p]; return { body: 0, local: [R * Math.sin(a), -HANG, R * Math.cos(a)] }; },
  pose(p, b, P, t, o) { o.x = 0; o.y = P.h; o.z = -3.8; o.m = mul3(rotX(P.r * 1.6), rotZ(P.r * 0.4 * (p % 2 ? 1 : -1))); },
  segs: (p) => loop(28, (a) => [RING_R[p] * Math.sin(a), 0, RING_R[p] * Math.cos(a)]),
  hoists: (p) => [0, 1, 2].map((k) => { const a = (k * TAU) / 3 + 0.5; return [RING_R[p] * Math.sin(a), 0.26, RING_R[p] * Math.cos(a)]; }),
};

const ovals = {
  ...circles,
  id: 'ovals', label: 'Ovals (the two-week era)', unit: 'Oval',
  blurb: 'The same idea stretched wide: concentric ellipses. Kuroda has joked this look lasted about two weeks.',
  fixture(p, s) { const a = (s / PER_POD) * TAU + p * 0.31, R = RING_R[p]; return { body: 0, local: [R * 1.2 * Math.sin(a), -HANG, R * 0.6 * Math.cos(a)] }; },
  pose(p, b, P, t, o) { o.x = 0; o.y = P.h; o.z = -3.8; o.m = mul3(rotX(P.r * 1.3), rotY(p % 2 ? 0.25 : -0.25)); },
  segs: (p) => loop(28, (a) => [RING_R[p] * 1.2 * Math.sin(a), 0, RING_R[p] * 0.6 * Math.cos(a)]),
  hoists: (p) => [[-RING_R[p] * 1.2, 0.26, 0], [RING_R[p] * 1.2, 0.26, 0]],
};

const SQ = [12, 10.8, 9.6, 8.4, 7.2, 6];
const squares = {
  id: 'squares', label: 'Squares (portal frames)', unit: 'Frame',
  blurb: 'Big square frames hung upright, one behind another, shrinking into a tunnel. Height lifts each frame; roll spins it toward a diamond.',
  bodies: 1,
  fixture(p, s) {
    const S = SQ[p], u = ((s + 0.5) / PER_POD) * 4, side = Math.floor(u), f = u - side, h = S / 2;
    const pts = [[-h + f * S, h], [h, h - f * S], [h - f * S, -h], [-h, -h + f * S]];
    const [x, y] = pts[side];
    return { body: 0, local: [x, y - HANG * 0.6, 0.35] };
  },
  pose(p, b, P, t, o) { o.x = 0; o.y = P.h - 1.5 + SQ[p] * 0.05; o.z = 1.4 - p * 2; o.m = rotZ(P.r * 2); },
  segs(p) { const h = SQ[p] / 2; return [[[-h, h, 0], [h, h, 0]], [[h, h, 0], [h, -h, 0]], [[h, -h, 0], [-h, -h, 0]], [[-h, -h, 0], [-h, h, 0]]]; },
  hoists: (p) => [[-SQ[p] / 2, SQ[p] / 2, 0], [SQ[p] / 2, SQ[p] / 2, 0]],
};

// 2019–2023: loose sticks of 5′, 8′ and 10′ truss, two hoists each, none pinned together.
const STICK_X = [-7.6, -3.8, 0, 3.8, 7.6];
const STICK_L = [[1.5, 3.0, 2.4, 3.0, 1.5], [2.4, 3.0, 3.0, 3.0, 2.4], [3.0, 2.4, 1.5, 2.4, 3.0]];
const stickLen = (p, b) => STICK_L[p % 3][b];
const sticks = {
  id: 'sticks', label: 'Moving sticks (2019–23)', unit: 'Row',
  blurb: '30 separate sticks of truss (5′, 8′, 10′), each on two hoists: six rows of five across a 62′ grid. Height trims a row; roll bends it into smiles and frowns, and alternating rows zigzag.',
  bodies: 5,
  fixture(p, s) { const b = Math.floor(s / 2), L = stickLen(p, b); return { body: b, local: [(s % 2 ? 1 : -1) * L * 0.28, -HANG, 0] }; },
  pose(p, b, P, t, o) {
    const x = STICK_X[b], k = P.r * 7, n = x / 7.6;
    o.x = x; o.y = P.h + k * (n * n - 0.4); o.z = POD_Z[p];
    const slope = (2 * k * n) / 7.6;
    const zig = p % 2 ? P.r * (b % 2 ? 1 : -1) * 0.8 : 0;
    o.m = rotZ(Math.atan(slope) + zig);
  },
  segs: (p, b) => { const L = stickLen(p, b) / 2; return [[[-L, 0, 0], [L, 0, 0]]]; },
  hoists: (p, b) => { const L = stickLen(p, b) / 2 - 0.2; return [[-L, 0.26, 0], [L, 0.26, 0]]; },
};

// 2016: one long LED wall (≈ 51′ × 5.6′) that splits apart in the second set.
const wall = {
  id: 'wall2016', label: 'LED video wall (2016)', unit: 'Panel',
  blurb: 'A 16 m × 1.7 m video wall in six sections, lights hung beneath. At an even height it reads as one screen; raise, lower and roll the sections to split it apart, as in the second sets of 2016.',
  bodies: 1,
  fixture: (p, s) => ({ body: 0, local: [-1.1 + (s % 5) * 0.55 + (s < 5 ? 0 : 0.27), -1.2, s < 5 ? 0.25 : -0.25] }),
  pose(p, b, P, t, o) { const cx = -6.5 + p * 2.6; o.x = cx * (1 + Math.abs(P.r) * 1.2); o.y = P.h - 1.2; o.z = -2.2; o.m = rotZ(P.r * 1.2); },
  segs: () => [[[-1.3, 1.0, -0.1], [1.3, 1.0, -0.1]]],
  hoists: () => [[-1.0, 1.1, -0.1], [1.0, 1.1, -0.1]],
  panel: () => ({ w: 2.56, h: 1.7 }),
};

// 2024: the virtual rig at Sphere — nothing holds it up, so it spins and breathes.
const LAT = [-58, -35, -12, 12, 35, 58].map((d) => d * DEG);
const sphere = {
  id: 'sphere', label: 'Sphere (2024, virtual)', unit: 'Ring',
  blurb: 'A rig that could only exist on a screen: six rings of light around a globe, counter-rotating. Height inflates or shrinks the globe; roll twists the rings off their axis. No hoists, no chains.',
  bodies: 1,
  fixture(p, s) { const a = (s / PER_POD) * TAU; return { body: 0, local: [Math.sin(a), -0.02, Math.cos(a)], ring: true }; },
  pose(p, b, P, t, o) {
    const R = Math.max(2, 6.5 + (P.h - 9.5) * 1.6), lat = LAT[p];
    const rr = R * Math.cos(lat);
    o.x = 0; o.y = 10 + R * Math.sin(lat) * 0.9; o.z = -3.8;
    o.m = mul3(rotX(P.r * 1.8 * (p % 2 ? 1 : -1)), rotY(t * 0.12 * (p % 2 ? 1 : -1.3) + p));
    o.scale = rr; // local ring coordinates are unit-radius
  },
  segs: () => loop(36, (a) => [Math.sin(a), 0, Math.cos(a)]),
  hoists: () => [],
  scaled: true,
};

export const RIGS = [pods, circles, ovals, squares, sticks, wall, sphere];
export const rigById = (id) => RIGS.find((r) => r.id === id) || pods;

/** Fixtures, with keys laid out for the given rig. */
export function buildFixtures(rig = pods) {
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

/** Recompute rig-dependent fixture data: local mount, body and the x/pod phase keys. */
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
/** Body-local point → world, honouring a rig's scaled (unit-radius) bodies. */
export const bodyToWorld = worldOf;

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

export function groupLabels(unit = 'Pod') {
  const u = unit, us = `${unit.toLowerCase()}s`;
  return {
    all: 'All', pods: `All ${us}`, floor: 'Floor', p1: `${u} 1`, p2: `${u} 2`, p3: `${u} 3`, p4: `${u} 4`, p5: `${u} 5`, p6: `${u} 6`,
    front: `${u}s 1–2`, mid: `${u}s 3–4`, back: `${u}s 5–6`, oddPods: `Odd ${us}`, evenPods: `Even ${us}`,
    odd: 'Odd heads', even: 'Even heads', left: 'Left half', right: 'Right half', inner: 'Inner', outer: 'Outer',
  };
}
export const GROUP_LABELS = groupLabels('Pod');

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
