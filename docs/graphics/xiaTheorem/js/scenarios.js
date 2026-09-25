// scenarios.js — the configurations the simulator can run.
//
// Each scenario returns initial data {masses, pos, vel} from its current
// parameter values, plus presentation hints: body labels/colours, camera,
// chart, tempo. G = 1 throughout.

import { CASCADE } from './cascade.js';

// ─── helpers ──────────────────────────────────────────────────────────────

/** Relative Kepler orbit in its plane: position/velocity at mean anomaly M. */
export function keplerState(a, e, M, GM) {
  // Fixed Newton iteration from E = M (kept identical to the cascade builder so
  // tuned initial phases reproduce bit for bit).
  let E = M;
  for (let i = 0; i < 60; i++) E -= (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));
  const b = a * Math.sqrt(Math.max(0, 1 - e * e)), n = Math.sqrt(GM / (a * a * a));
  const Ed = n / (1 - e * Math.cos(E));
  return { r: [a * (Math.cos(E) - e), b * Math.sin(E)], v: [-a * Math.sin(E) * Ed, b * Math.cos(E) * Ed] };
}

function zeroMomentum(masses, vel) {
  const P = [0, 0, 0]; let M = 0;
  masses.forEach((m, i) => { M += m; for (let k = 0; k < 3; k++) P[k] += m * vel[i][k]; });
  vel.forEach(v => { for (let k = 0; k < 3; k++) v[k] -= P[k] / M; });
}

function recentre(masses, pos) {
  const C = [0, 0, 0]; let M = 0;
  masses.forEach((m, i) => { M += m; for (let k = 0; k < 3; k++) C[k] += m * pos[i][k]; });
  pos.forEach(p => { for (let k = 0; k < 3; k++) p[k] -= C[k] / M; });
}

/** Small deterministic PRNG (mulberry32). */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6D2B79F5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ─── Xia's configuration ──────────────────────────────────────────────────

/**
 * Two equal-mass binaries centred on the z-axis at ±Z, rotating in opposite
 * senses, and a fifth body on the axis. The 180° rotation about the z-axis is
 * a symmetry, so the axis stays invariant for Q₅.
 */
export function xiaInitial(p) {
  const GM = 2 * p.m;
  const A = keplerState(p.a, p.e, p.MA, GM), B = keplerState(p.a, p.e, p.MB, GM);
  const rot = (u, th) => [u[0] * Math.cos(th) - u[1] * Math.sin(th), u[0] * Math.sin(th) + u[1] * Math.cos(th)];
  // Mirror B (y → −y) so it turns the other way, then rotate its line of apsides.
  const Br = rot([B.r[0], -B.r[1]], p.rotB), Bv = rot([B.v[0], -B.v[1]], p.rotB);
  const masses = [p.m, p.m, p.m, p.m, p.mu];
  const pos = [
    [A.r[0] / 2, A.r[1] / 2, p.Z], [-A.r[0] / 2, -A.r[1] / 2, p.Z],
    [Br[0] / 2, Br[1] / 2, -p.Z], [-Br[0] / 2, -Br[1] / 2, -p.Z],
    [0, 0, 0]];
  const vel = [
    [A.v[0] / 2, A.v[1] / 2, 0], [-A.v[0] / 2, -A.v[1] / 2, 0],
    [Bv[0] / 2, Bv[1] / 2, 0], [-Bv[0] / 2, -Bv[1] / 2, 0],
    [0, 0, p.w]];
  zeroMomentum(masses, vel);
  return { masses, pos, vel };
}

const XIA_BODIES = [
  { label: 'A₁', color: '#ff5d8f', group: 'Binary A (upper)' },
  { label: 'A₂', color: '#ff9f6b', group: 'Binary A (upper)' },
  { label: 'B₁', color: '#4fb3ff', group: 'Binary B (lower)' },
  { label: 'B₂', color: '#62f0e0', group: 'Binary B (lower)' },
  { label: 'Q₅', color: '#ffe36b', group: 'Shuttle Q₅' },
];

const XIA_VIEW = { up: 'z', azimuth: 0.72, elevation: 0.18, frame: 'all', axis: true, minRadius: 6, unroll: true };
const XIA_CHART = { kind: 'xia', axis: 2, groups: [[0, 1], [2, 3], [4]], colors: ['#ff7a7a', '#4fc8ff', '#ffe36b'], labels: ['A', 'B', 'Q₅'] };
const XIA_PAIRS = [[0, 1], [2, 3]];

// ─── periodic three-body orbits (Šuvakov–Dmitrašinović initial data) ─────

function threeBody(p1, p2) {
  const masses = [1, 1, 1];
  const pos = [[-1, 0, 0], [1, 0, 0], [0, 0, 0]];
  const vel = [[p1, p2, 0], [p1, p2, 0], [-2 * p1, -2 * p2, 0]];
  return { masses, pos, vel };
}

const TRIO = [
  { label: '1', color: '#ff6b8b' },
  { label: '2', color: '#5ec8ff' },
  { label: '3', color: '#ffd166' },
];
const PLANAR_VIEW = { up: 'z', azimuth: 0, elevation: 1.2, frame: 'all', grid: true, minRadius: 1.6 };

function periodic(id, name, p1, p2, T, about) {
  return {
    id, name, group: 'Periodic three-body orbits',
    about,
    period: T,
    bodies: TRIO,
    params: [],
    init: () => threeBody(p1, p2),
    view: PLANAR_VIEW,
    chart: { kind: 'lines', axis: 0 },
    tempo: 'fixed', rate: 0.9, trail: 1400,
  };
}

// ─── the catalogue ────────────────────────────────────────────────────────

export const SCENARIOS = [
  {
    id: 'xia', name: "Xia's cascade", group: 'Non-collision singularities',
    about: `<p><b>Painlevé (1895)</b> asked whether Newton's equations can break down in finite time <i>without</i> a collision. <b>Zhihong Xia (1992)</b> showed that they can, with five bodies. Two highly eccentric binaries sit in parallel planes and rotate in opposite senses. A lighter fifth body, Q₅, shuttles along the axis between them.</p>
<p>Each time Q₅ arrives as a binary passes pericentre, the three bodies nearly collide and Q₅ is flung back faster. The binary recoils outward and hardens. With initial data taken from a Cantor set, the bounces accelerate geometrically and all five bodies reach infinity at a finite time t*.</p>
<p class="fine">Exact Newtonian gravity (no softening), integrated with a regularized Bulirsch–Stoer scheme. Binary A's starting phase is tuned to 16 digits, which by itself gives the first bounces. After that, at each mid-flight checkpoint, the approaching binary's Kepler phase is trimmed by the tiny amount listed in the HUD. This shadowing pseudo-orbit stands in for initial data that would need many more digits than a double can hold.</p>`,
    bodies: XIA_BODIES,
    pairs: XIA_PAIRS,
    params: [],
    init: () => xiaInitial(CASCADE.base),
    cascade: CASCADE.cps.length ? CASCADE : null,
    view: XIA_VIEW,
    chart: XIA_CHART,
    tempo: 'singular', rate: 1, trail: 900,
  },
  {
    id: 'xiaFree', name: 'Xia configuration (free run)', group: 'Non-collision singularities',
    about: `<p>The same five bodies with no steering. With the tuned phase and default settings, the first bounces are identical to the cascade: those need only the 16 digits a double can hold. The next bounce needs digits that aren't there, so the shuttle escapes, is captured, or passes straight through.</p>
<p>Nudge binary A's phase by a billionth of a radian, or change the masses, to see how thin the set of accelerating orbits is. Xia's proof finds it as a Cantor set inside a region the size of these nudges.</p>`,
    bodies: XIA_BODIES,
    pairs: XIA_PAIRS,
    params: [
      { id: 'mu', label: 'Shuttle mass m₅', min: 0.02, max: 1, step: 0.01, value: () => CASCADE.base.mu, fmt: v => v.toFixed(2) },
      { id: 'lg1e', label: 'Binary eccentricity  log₁₀(1−e)', min: -9, max: -1, step: 0.1, value: () => Math.log10(1 - CASCADE.base.e), fmt: v => `1 − e = 10^${v.toFixed(1)}` },
      { id: 'nudge', label: 'Phase nudge of A (×10⁻⁹ rad)', min: -1000, max: 1000, step: 1, value: 0, fmt: v => v.toFixed(0) },
      { id: 'w', label: 'Launch speed of Q₅', min: 1.5, max: 4, step: 0.05, value: () => CASCADE.base.w, fmt: v => v.toFixed(2) },
    ],
    init: (q) => xiaInitial({ ...CASCADE.base, mu: q.mu, e: 1 - 10 ** q.lg1e, MA: CASCADE.base.MA + q.nudge * 1e-9, w: q.w }),
    view: XIA_VIEW,
    chart: { ...XIA_CHART, kind: 'xiaFree' },
    tempo: 'adaptive', rate: 1, trail: 900,
  },
  {
    id: 'sitnikov', name: 'Sitnikov problem', group: 'Non-collision singularities',
    about: `<p>One binary and a massless body on its axis: Xia's configuration with a single binary. <b>Sitnikov (1960)</b> proved that this system has <i>oscillatory</i> motions, which swing out ever farther yet keep coming back, and it became <b>Moser's</b> model for chaos by symbolic dynamics.</p>
<p>The binary is eccentric, so the axial pull pulses once per orbit. Whether the next swing goes farther or shorter depends on the phase at each crossing. The chart shows the height z of the third body.</p>`,
    bodies: [
      { label: 'm₁', color: '#ff7a8a' }, { label: 'm₂', color: '#6ab8ff' }, { label: 'test body', color: '#ffe36b' },
    ],
    pairs: [[0, 1]],
    params: [
      { id: 'e', label: 'Binary eccentricity e', min: 0, max: 0.9, step: 0.01, value: 0.3, fmt: v => v.toFixed(2) },
      { id: 'z0', label: 'Launch height z₀', min: 0.2, max: 3.2, step: 0.01, value: 1.76, fmt: v => v.toFixed(2) },
    ],
    init: (q) => {
      const K = keplerState(1, q.e, Math.PI, 1);   // start at apocentre
      const masses = [0.5, 0.5, 0];
      const pos = [[K.r[0] / 2, K.r[1] / 2, 0], [-K.r[0] / 2, -K.r[1] / 2, 0], [0, 0, q.z0]];
      const vel = [[K.v[0] / 2, K.v[1] / 2, 0], [-K.v[0] / 2, -K.v[1] / 2, 0], [0, 0, 0]];
      return { masses, pos, vel };
    },
    view: { up: 'z', azimuth: 0.6, elevation: 0.25, frame: 'all', axis: true, minRadius: 2.2, maxRadius: 12, unroll: true },
    chart: { kind: 'lines', axis: 2, only: [2] },
    tempo: 'fixed', rate: 3, trail: 700, loopAfter: 390, escapeRadius: 40,
  },
  periodic('figure8', 'Figure-eight', 0.347111, 0.532728, 6.324449,
    `<p>Three equal masses chase each other around a single figure-eight curve. <b>Moore (1993)</b> found it numerically, and <b>Chenciner and Montgomery (2000)</b> proved it exists. Unlike most periodic three-body orbits it is linearly stable, so small perturbations stay small.</p>`),
  periodic('butterfly', 'Butterfly I', 0.306893, 0.125507, 6.235641,
    `<p>One of the orbit families found by <b>Šuvakov and Dmitrašinović (2013)</b> in a numerical search of zero-angular-momentum three-body orbits. Two bodies start mirror-symmetric, the third at the centre, and together they trace a pair of butterfly wings.</p><p class="fine">Most of these orbits are unstable. Round-off eventually pulls them apart. Turn on the shadow twin to watch the divergence.</p>`),
  periodic('moth', 'Moth I', 0.464445, 0.396060, 14.893911,
    `<p>Another Šuvakov–Dmitrašinović orbit (2013). Its topology is a braid on the sphere of shapes, the space of triangles up to size and rotation.</p>`),
  periodic('dragonfly', 'Dragonfly', 0.080584, 0.588836, 21.270975,
    `<p>A Šuvakov–Dmitrašinović orbit in which the central body makes long excursions along the wings.</p>`),
  periodic('goggles', 'Goggles', 0.083300, 0.127889, 10.466818,
    `<p>A Šuvakov–Dmitrašinović orbit with two lobes, traced as the bodies pass through repeated near-collinear configurations.</p>`),
  periodic('yinyang', 'Yin-yang', 0.513938, 0.304736, 17.328370,
    `<p>The Šuvakov–Dmitrašinović yin-yang orbit: two interlocking lobes traced by three equal masses with zero angular momentum.</p>`),
  {
    id: 'pythagorean', name: 'Pythagorean problem', group: 'Chaos and escape',
    about: `<p>Masses 3, 4 and 5 start at rest on the corners of a 3-4-5 right triangle, each opposite the side of its own length. <b>Burrau (1913)</b> posed it. <b>Szebehely and Peters (1967)</b> followed it to the end: after a long chaotic dance with many close approaches, the 4 and 5 masses pair off into a binary and the 3 mass is ejected.</p>`,
    bodies: [
      { label: 'Body 3', color: '#ff6b8b' }, { label: 'Body 4', color: '#5ec8ff' }, { label: 'Body 5', color: '#ffd166' },
    ],
    params: [],
    init: () => {
      const masses = [3, 4, 5];
      const pos = [[1, 3, 0], [-2, -1, 0], [1, -1, 0]];
      recentre(masses, pos);
      return { masses, pos, vel: [[0, 0, 0], [0, 0, 0], [0, 0, 0]] };
    },
    view: { ...PLANAR_VIEW, maxRadius: 9, minRadius: 3 },
    chart: { kind: 'lines', axis: 0 },
    tempo: 'adaptive', rate: 1.2, trail: 1100, loopAfter: 95,
  },
  {
    id: 'lagrange', name: 'Lagrange triangle', group: 'Chaos and escape',
    about: `<p>Three masses on an equilateral triangle that turns rigidly. <b>Lagrange (1772)</b> showed that this works for any masses. <b>Routh (1875)</b> showed it is stable only if one mass dominates: 27(m₁m₂ + m₂m₃ + m₃m₁) &lt; (m₁ + m₂ + m₃)².</p>
<p>Slide the two light masses past the threshold. Below it the triangle holds, as the Trojan asteroids do with the Sun and Jupiter. Above it, a 10⁻⁶ nudge grows until the triangle tears apart.</p>`,
    bodies: [
      { label: 'm₁', color: '#ffd166' }, { label: 'm₂', color: '#ff6b8b' }, { label: 'm₃', color: '#5ec8ff' },
    ],
    params: [
      { id: 'mu', label: 'Light masses m₂ = m₃', min: 0.002, max: 1, step: 0.001, value: 0.04, fmt: v => v.toFixed(3) },
    ],
    init: (q) => {
      const masses = [1, q.mu, q.mu * (1 + 1e-6)];
      const s = 1.6;
      const pos = [0, 1, 2].map(k => [s / Math.sqrt(3) * Math.cos(Math.PI / 2 + 2 * Math.PI * k / 3), s / Math.sqrt(3) * Math.sin(Math.PI / 2 + 2 * Math.PI * k / 3), 0]);
      recentre(masses, pos);
      const M = masses.reduce((a, b) => a + b, 0), w = Math.sqrt(M / s ** 3);
      const vel = pos.map(p => [-w * p[1], w * p[0], 0]);
      return { masses, pos, vel };
    },
    note: (q) => {
      const m = [1, q.mu, q.mu], S = m[0] * m[1] + m[1] * m[2] + m[2] * m[0], M = m[0] + m[1] + m[2];
      return 27 * S < M * M ? `Routh: 27Σmᵢmⱼ = ${(27 * S).toFixed(3)} < (Σm)² = ${(M * M).toFixed(3)} → stable`
                            : `Routh: 27Σmᵢmⱼ = ${(27 * S).toFixed(3)} > (Σm)² = ${(M * M).toFixed(3)} → unstable`;
    },
    view: { ...PLANAR_VIEW, minRadius: 2.2, maxRadius: 10 },
    chart: { kind: 'lines', axis: 0 },
    tempo: 'fixed', rate: 2.5, trail: 900, loopAfter: 400,
  },
  {
    id: 'cluster', name: 'Small cluster', group: 'Chaos and escape',
    about: `<p>A handful of equal stars released from a cold, lumpy start. Close three-body encounters form hard binaries, and the energy released flings other stars out of the cluster. That slingshot is the same energy source that powers Xia's cascade.</p>
<p class="fine">No softening: every close pass is resolved by the regularized integrator.</p>`,
    bodies: null,           // generated from N
    params: [
      { id: 'n', label: 'Stars N', min: 4, max: 14, step: 1, value: 9, fmt: v => v.toFixed(0) },
      { id: 'seed', label: 'Random seed', min: 1, max: 60, step: 1, value: 7, fmt: v => v.toFixed(0) },
    ],
    init: (q) => {
      const r = rng(q.seed * 7919 + q.n), n = q.n;
      const masses = Array(n).fill(1 / n);
      const pos = [], vel = [];
      for (let i = 0; i < n; i++) {
        // uniform in a ball, then a small rotation and random velocities (sub-virial)
        let x, y, z;
        do { x = 2 * r() - 1; y = 2 * r() - 1; z = 2 * r() - 1; } while (x * x + y * y + z * z > 1);
        pos.push([x, y * 0.8, z * 0.6]);
        vel.push([(r() - 0.5) * 0.25 - 0.18 * y, (r() - 0.5) * 0.25 + 0.18 * x, (r() - 0.5) * 0.2]);
      }
      recentre(masses, pos);
      zeroMomentum(masses, vel);
      return { masses, pos, vel };
    },
    view: { up: 'z', azimuth: 0.5, elevation: 0.45, frame: 'core', minRadius: 1.5, maxRadius: 7 },
    chart: { kind: 'lines', axis: 0 },
    tempo: 'adaptive', rate: 0.35, trail: 900, loopAfter: 60,
  },
];

export const byId = Object.fromEntries(SCENARIOS.map(s => [s.id, s]));

/** Colours for generated bodies (cluster). */
export function clusterBodies(n) {
  const out = [];
  for (let i = 0; i < n; i++) {
    const h = (i / n) * 300 + 190;
    out.push({ label: `★${i + 1}`, color: `hsl(${h % 360} 90% 66%)` });
  }
  return out;
}

/** Default parameter values for a scenario. */
export function defaultParams(sc) {
  const q = {};
  for (const p of sc.params) q[p.id] = typeof p.value === 'function' ? p.value() : p.value;
  return q;
}
