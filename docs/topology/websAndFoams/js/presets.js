// Example pairs of webs together with a foam between them.
import * as G from './geom.js';
import { setSettings } from './config.js';
import { applyOp } from './moves.js';

const rad = d => d * Math.PI / 180;
const bdPos = deg => [Math.cos(rad(deg)), Math.sin(rad(deg))];

// spec: { bd: {id: degrees}, v: {id: [x, y]}, e: [[id, from, to, label, shape]] }
// shape: undefined (straight) | 'geo' (hyperbolic geodesic) | {bend: h} | {via: [[x,y], ...]}
function web(spec) {
  const W = { verts: {}, edges: {} };
  for (const id in spec.bd || {}) { const p = bdPos(spec.bd[id]); W.verts[id] = { id, x: p[0], y: p[1], bd: true }; }
  for (const id in spec.v || {}) W.verts[id] = { id, x: spec.v[id][0], y: spec.v[id][1] };
  for (const [id, a, b, label, shape] of spec.e || []) {
    const pa = [W.verts[a].x, W.verts[a].y], pb = [W.verts[b].x, W.verts[b].y];
    let pts;
    if (shape === 'geo') pts = G.geodesic(pa, pb);
    else if (shape && shape.via) pts = G.smooth(G.resample([pa, ...shape.via, pb], 0.01, 4), 6);
    else pts = G.line(pa, pb);
    if (shape && shape.bend) pts = G.bulge(G.resample(pts), shape.bend);
    W.edges[id] = { id, a, b, label, pts: G.resample(pts) };
  }
  for (const c of spec.circles || []) {
    const [id, vid, center, r, label, ccw] = c;
    const pts = G.circlePts(center, r, ccw !== false);
    W.verts[vid] = { id: vid, x: pts[0][0], y: pts[0][1] };
    W.edges[id] = { id, a: vid, b: vid, label, pts };
  }
  return W;
}

const bd4 = { p1: 225, p2: 315, p3: 45, p4: 135 };

// Run moves on a web, letting later moves pick their edges from the current
// web (pick: W => edgeId).  Returns the ops with uids o1, o2, ... and the end web.
function movie(W, steps) {
  const ops = [];
  steps.forEach((st, k) => {
    const op = { uid: 'o' + (k + 1), ...st };
    for (const key of ['e', 'e1', 'e2']) if (typeof op[key] === 'function') op[key] = op[key](W);
    W = applyOp(W, op).W;
    ops.push(op);
  });
  return { ops, end: W };
}
const loopAtCrossing = W => Object.keys(W.edges).find(id => W.edges[id].a === W.edges[id].b && W.verts[W.edges[id].a].cr);
const anyLoop = W => Object.keys(W.edges).find(id => W.edges[id].a === W.edges[id].b);

// the Hopf link: two circles crossing at T (left over) and B (left under)
function hopf() {
  const W = { verts: {}, edges: {} };
  const r = 0.45, cx = 0.28, y = Math.sqrt(r * r - cx * cx);
  W.verts.T = { id: 'T', x: 0, y, cr: true }; W.verts.B = { id: 'B', x: 0, y: -y, cr: true };
  const arc = (c, a0, a1) => { const out = []; for (let i = 0; i <= 40; i++) { const a = a0 + (a1 - a0) * i / 40; out.push([c[0] + r * Math.cos(a), c[1] + r * Math.sin(a)]); } return out; };
  const L = [-cx, 0], Rt = [cx, 0];
  const aT = Math.atan2(y, cx), aB = Math.atan2(-y, cx), bT = Math.atan2(y, -cx), bB = Math.atan2(-y, -cx);
  const fix = (P, a, b) => { P[0] = [W.verts[a].x, W.verts[a].y]; P[P.length - 1] = [W.verts[b].x, W.verts[b].y]; return G.resample(P); };
  W.edges.Li = { id: 'Li', a: 'B', b: 'T', label: 1, pts: fix(arc(L, aB, aT), 'B', 'T'), ov: [-1, 1] };
  W.edges.Lo = { id: 'Lo', a: 'T', b: 'B', label: 1, pts: fix(arc(L, aT, aB + 2 * Math.PI), 'T', 'B'), ov: [1, -1] };
  W.edges.Ri = { id: 'Ri', a: 'T', b: 'B', label: 1, pts: fix(arc(Rt, bT, bB + 2 * Math.PI), 'T', 'B'), ov: [-1, 1] };
  W.edges.Ro = { id: 'Ro', a: 'B', b: 'T', label: 1, pts: fix(arc(Rt, bB, bT), 'B', 'T'), ov: [1, -1] };
  return W;
}

// K_{3,3} as an sl3 web (sources s, sinks t): a hexagon, two crossing
// diagonals, and the third diagonal around the outside
function k33() {
  const W = { verts: {}, edges: {} };
  const R = 0.42, pos = {};
  ['s1', 't1', 's2', 't2', 's3', 't3'].forEach((nm, k) => { const a = (90 + 60 * k) * Math.PI / 180; pos[nm] = [R * Math.cos(a), R * Math.sin(a)]; W.verts[nm] = { id: nm, x: pos[nm][0], y: pos[nm][1] }; });
  W.verts.X = { id: 'X', x: 0, y: 0, cr: true };
  const E = (id, a, b, pts, ov) => { W.edges[id] = { id, a, b, label: 1, pts: G.resample(pts), ...(ov ? { ov } : {}) }; };
  E('h1', 's1', 't1', [pos.s1, pos.t1]); E('h2', 's2', 't1', [pos.s2, pos.t1]); E('h3', 's2', 't2', [pos.s2, pos.t2]);
  E('h4', 's3', 't2', [pos.s3, pos.t2]); E('h5', 's3', 't3', [pos.s3, pos.t3]); E('h6', 's1', 't3', [pos.s1, pos.t3]);
  E('d1a', 's1', 'X', [pos.s1, [0, 0]], [0, 1]); E('d1b', 'X', 't2', [[0, 0], pos.t2], [1, 0]);
  E('d2a', 's2', 'X', [pos.s2, [0, 0]], [0, -1]); E('d2b', 'X', 't3', [[0, 0], pos.t3], [-1, 0]);
  const arc = []; for (let i = 0; i <= 30; i++) { const a = (-30 - 180 * i / 30) * Math.PI / 180; arc.push([0.78 * Math.cos(a), 0.78 * Math.sin(a)]); }
  E('d3', 's3', 't1', G.smooth([pos.s3, ...arc, pos.t1], 4));
  return W;
}

// two crossing strands and a third strand passing over both (an R3 triangle)
function r3web() {
  const W = { verts: {}, edges: {} };
  for (const [id, deg] of [['a0', 200], ['a1', 20], ['b0', 340], ['b1', 160], ['c0', 265], ['c1', 95]]) W.verts[id] = { id, x: Math.cos(deg * Math.PI / 180), y: Math.sin(deg * Math.PI / 180), bd: true };
  const p = id => [W.verts[id].x, W.verts[id].y];
  const lineHit = (a, b, c, d) => { const r = G.sub(b, a), s = G.sub(d, c), t = G.cross(G.sub(c, a), s) / G.cross(r, s); return G.lerp(a, b, t); };
  // strand C bends right of the A x B crossing
  const cpts = G.smooth(G.resample([p('c0'), [0.35, -0.5], [0.42, 0], [0.35, 0.5], p('c1')], 0.01), 10);
  const X = lineHit(p('a0'), p('a1'), p('b0'), p('b1'));
  const hitAC = G.intersections([p('a0'), p('a1')], cpts)[0].pt, hitBC = G.intersections([p('b0'), p('b1')], cpts)[0].pt;
  W.verts.X = { id: 'X', ...{ x: X[0], y: X[1] }, cr: true };
  W.verts.Y = { id: 'Y', x: hitAC[0], y: hitAC[1], cr: true };
  W.verts.Z = { id: 'Z', x: hitBC[0], y: hitBC[1], cr: true };
  const E = (id, a, b, pts, ov) => { W.edges[id] = { id, a, b, label: 1, pts: G.resample(pts), ...(ov ? { ov } : {}) }; };
  // A: a0 -> X -> Y -> a1 (under C at Y, over B at X)
  E('A1', 'a0', 'X', [p('a0'), X], [0, 1]); E('A2', 'X', 'Y', [X, hitAC], [1, -1]); E('A3', 'Y', 'a1', [hitAC, p('a1')], [-1, 0]);
  // B: b0 -> Z -> X -> b1 (under C at Z, under A at X)
  E('B1', 'b0', 'Z', [p('b0'), hitBC], [0, -1]); E('B2', 'Z', 'X', [hitBC, X], [-1, -1]); E('B3', 'X', 'b1', [X, p('b1')], [-1, 0]);
  // C over both
  const cut = q => { const c = G.closestOnPoly(cpts, q); return c; };
  const iz = cut(hitBC), iy = cut(hitAC);
  const c1 = cpts.slice(0, iz.i + 1).concat([hitBC]), c2 = [hitBC].concat(cpts.slice(iz.i + 1, iy.i + 1), [hitAC]), c3 = [hitAC].concat(cpts.slice(iy.i + 1));
  W.edges.C1 = { id: 'C1', a: 'c0', b: 'Z', label: 1, pts: c1, ov: [0, 1] };
  W.edges.C2 = { id: 'C2', a: 'Z', b: 'Y', label: 1, pts: c2, ov: [1, 1] };
  W.edges.C3 = { id: 'C3', a: 'Y', b: 'c1', label: 1, pts: c3, ov: [1, 0] };
  return W;
}

export const PRESETS = [
  {
    name: 'Saddle',
    blurb: 'The basic cobordism: two oppositely oriented arcs are resolved the other way.',
    make: () => ({
      N: 3, mode: 'sl',
      W0: web({ bd: bd4, e: [['L', 'p1', 'p4', 1, 'geo'], ['R', 'p3', 'p2', 1, 'geo']] }),
      W1: web({ bd: bd4, e: [['B', 'p1', 'p2', 1, 'geo'], ['T', 'p3', 'p4', 1, 'geo']] }),
      ops: [{ uid: 'o1', type: 'saddle', e1: 'L', s1: 0.5, e2: 'R', s2: 0.5 }],
    }),
  },
  {
    name: 'Zip: two strands to the thick edge',
    blurb: 'Khovanov’s sl₃ zip foam: parallel strands merge along a binding (a minimum of the seam).',
    make: () => ({
      N: 3, mode: 'sl',
      W0: web({ bd: bd4, e: [['L', 'p1', 'p4', 1, 'geo'], ['R', 'p2', 'p3', 1, 'geo']] }),
      W1: web({
        bd: bd4, v: { v1: [0, -0.22], v2: [0, 0.22] },
        e: [['a', 'p1', 'v1', 1], ['b', 'p2', 'v1', 1], ['r', 'v2', 'v1', 1], ['c', 'v2', 'p4', 1], ['d', 'v2', 'p3', 1]],
      }),
      ops: [{ uid: 'o1', type: 'zip', e1: 'L', s1: 0.5, e2: 'R', s2: 0.5 }],
    }),
  },
  {
    name: 'Zip then unzip: a binding circle',
    blurb: 'Zipping and unzipping again: the binding is a circle bounding a disk facet of label 2.',
    make: () => ({
      N: 3, mode: 'gl',
      W0: web({ bd: bd4, e: [['L', 'p1', 'p4', 1, 'geo'], ['R', 'p2', 'p3', 1, 'geo']] }),
      W1: web({ bd: bd4, e: [['L', 'p1', 'p4', 1, 'geo'], ['R', 'p2', 'p3', 1, 'geo']] }),
      ops: [{ uid: 'o1', type: 'zip', e1: 'L', s1: 0.5, e2: 'R', s2: 0.5 }, { uid: 'o2', type: 'unzip', e: 'o1:r' }],
    }),
  },
  {
    name: 'Square → two arcs',
    blurb: 'An sl₃ square face is removed by an unzip and a digon collapse.',
    make: () => ({
      N: 3, mode: 'sl',
      W0: web({
        bd: { q1: 45, q2: 135, q3: 225, q4: 315 },
        v: { A: [0.3, 0.3], B: [-0.3, 0.3], C: [-0.3, -0.3], D: [0.3, -0.3] },
        e: [['AB', 'A', 'B', 1], ['CB', 'C', 'B', 1], ['CD', 'C', 'D', 1], ['AD', 'A', 'D', 1],
            ['A1', 'A', 'q1', 1], ['B2', 'q2', 'B', 1], ['C3', 'C', 'q3', 1], ['D4', 'q4', 'D', 1]],
      }),
      W1: web({ bd: { q1: 45, q2: 135, q3: 225, q4: 315 }, e: [['top', 'q2', 'q1', 1, 'geo'], ['bot', 'q4', 'q3', 1, 'geo']] }),
      ops: [{ uid: 'o1', type: 'unzip', e: 'AB' }, { uid: 'o2', type: 'ddeath', e: 'CD' }],
    }),
  },
  {
    name: 'Associativity (gl₃)',
    blurb: '(1+1)+1 → 1+(1+1): the I ↔ H move, whose foam has a singular vertex where four bindings meet.',
    make: () => ({
      N: 3, mode: 'gl',
      W0: web({
        bd: { a: 210, b: 270, c: 330, t: 90 },
        v: { v1: [-0.28, -0.32], v2: [0, 0.08] },
        e: [['ea', 'a', 'v1', 1], ['eb', 'b', 'v1', 1], ['m', 'v1', 'v2', 2], ['ec', 'c', 'v2', 1], ['et', 'v2', 't', 3]],
      }),
      W1: web({
        bd: { a: 210, b: 270, c: 330, t: 90 },
        v: { w1: [0.28, -0.32], w2: [0, 0.08] },
        e: [['eb', 'b', 'w1', 1], ['ec', 'c', 'w1', 1], ['m', 'w1', 'w2', 2], ['ea', 'a', 'w2', 1], ['et', 'w2', 't', 3]],
      }),
      ops: [{ uid: 'o1', type: 'assoc', e: 'm' }],
    }),
  },
  {
    name: 'Digon bubble',
    blurb: 'A strand sprouts a digon which collapses again: a disk of bindings inside a sheet.',
    make: () => ({
      N: 3, mode: 'gl',
      W0: web({ bd: { s: 270, n: 90 }, e: [['e', 's', 'n', 2]] }),
      W1: web({ bd: { s: 270, n: 90 }, e: [['e', 's', 'n', 2]] }),
      ops: [{ uid: 'o1', type: 'dbirth', e: 'e', s: 0.5, p: 1, q: 1 }, { uid: 'o2', type: 'ddeath', e: 'o1:dL' }],
    }),
  },
  {
    name: 'Theta foam',
    blurb: 'A closed foam: three disks glued along a binding circle.',
    make: () => ({
      N: 3, mode: 'sl',
      W0: web({}), W1: web({}),
      ops: [{ uid: 'o1', type: 'tbirth', p: [0, 0], a: 1, b: 1 }, { uid: 'o2', type: 'tdeath', e: 'o1:t' }],
    }),
  },
  {
    name: 'Dotted sphere',
    blurb: 'A cup and a cap make a sphere; dots decorate its facet.',
    make: () => ({
      N: 3, mode: 'sl',
      W0: web({}), W1: web({}),
      ops: [{ uid: 'o1', type: 'cup', p: [0, 0], label: 1, ccw: true, r: 0.32 }, { uid: 'o2', type: 'cap', e: 'o1:c' }],
      dots: [{ eid: 'o1:c', n: 2 }],
    }),
  },
  {
    name: 'Torus',
    blurb: 'Cup, split, merge, cap: a closed torus (genus 1).',
    make: () => ({
      N: 3, mode: 'sl',
      W0: web({}), W1: web({}),
      ops: [
        { uid: 'o1', type: 'cup', p: [0, 0], label: 1, ccw: true, r: 0.45 },
        { uid: 'o2', type: 'saddle', e1: 'o1:c', s1: 0.25, e2: 'o1:c', s2: 0.75 },
        { uid: 'o3', type: 'saddle', e1: 'o2:f1', s1: 0.5, e2: 'o2:f2', s2: 0.5 },
        { uid: 'o4', type: 'cap', e: 'o3:m0' },
      ],
    }),
  },
  {
    name: 'Pair of pants',
    blurb: 'Two circles merge into one along a saddle.',
    make: () => ({
      N: 3, mode: 'sl',
      W0: web({ circles: [['c1', 'q1', [-0.42, 0], 0.3, 1, true], ['c2', 'q2', [0.42, 0], 0.3, 1, true]] }),
      W1: web({ circles: [['c', 'q', [0, 0], 0.55, 1, true]] }),
      ops: [{ uid: 'o1', type: 'saddle', e1: 'c1', s1: 0.0, e2: 'c2', s2: 0.5 }],
    }),
  },
  {
    name: 'Hopf link to nothing',
    blurb: 'A knotted example: the Hopf link is merged by a saddle, untwisted (two Reidemeister I moves) and capped off — the foam is the Hopf band, an annulus. Try “Web in space” and ▶.',
    make: () => {
      setSettings({ N: 3, mode: 'sl' });
      const { ops } = movie(hopf(), [
        { type: 'saddle', e1: 'Li', s1: 0.5, e2: 'Ri', s2: 0.5 },
        { type: 'r1d', e: loopAtCrossing },
        { type: 'r1d', e: loopAtCrossing },
        { type: 'cap', e: anyLoop },
      ]);
      return { N: 3, mode: 'sl', W0: hopf(), W1: web({}), ops };
    },
  },
  {
    name: 'K₃,₃ to nothing',
    blurb: 'A non-planar sl₃ web: K₃,₃ needs a crossing. Two unzips, a Reidemeister I move and a theta death take it to the empty web.',
    make: () => {
      setSettings({ N: 3, mode: 'sl' });
      const { ops } = movie(k33(), [
        { type: 'unzip', e: 'h1' },
        { type: 'unzip', e: 'h3' },
        { type: 'r1d', e: loopAtCrossing },
        { type: 'tdeath', e: 'h5' },
      ]);
      return { N: 3, mode: 'sl', W0: k33(), W1: web({}), ops };
    },
  },
  {
    name: 'Reidemeister III by sliding',
    blurb: 'A strand passing over a crossing slides across it (the Slide tool: drag a strand that stays over everything).',
    make: () => {
      setSettings({ N: 3, mode: 'sl' });
      const { ops, end } = movie(r3web(), [{ type: 'lift', e: 'C2', s: 0.5, d: [-0.62, 0], level: 1 }]);
      return { N: 3, mode: 'sl', W0: r3web(), W1: end, ops };
    },
  },
  {
    name: 'Reidemeister II: a bigon comes and goes',
    blurb: 'One strand slides over another, making two crossings, then slides back.',
    make: () => {
      setSettings({ N: 3, mode: 'sl' });
      const W0 = web({ bd: bd4, e: [['L', 'p1', 'p4', 1, 'geo'], ['R', 'p2', 'p3', 1, 'geo']] });
      const over = movie(W0, [{ type: 'lift', e: 'L', s: 0.5, d: [1.0, 0], level: 1 }]);
      const mid = Object.keys(over.end.edges).find(id => { const e = over.end.edges[id]; return e.ov && e.ov[0] > 0 && e.ov[1] > 0; });
      const back = movie(over.end, [{ type: 'lift', e: mid, s: 0.5, d: [-1.0, 0], level: 1 }]);
      back.ops[0].uid = 'o2';
      return { N: 3, mode: 'sl', W0, W1: W0, ops: [over.ops[0], back.ops[0]] };
    },
  },
  {
    name: 'Reidemeister V: a twist at a vertex',
    blurb: 'Two legs of a theta web trade places at a vertex, crossing once (Twist +). The foam is still the theta foam: twisting is an isotopy in space.',
    make: () => {
      setSettings({ N: 3, mode: 'gl' });
      const theta = () => web({
        v: { u: [-0.4, 0], w: [0.4, 0] },
        e: [['t', 'u', 'w', 1, { via: [[-0.2, 0.42], [0.2, 0.42]] }], ['b', 'u', 'w', 1, { via: [[-0.2, -0.42], [0.2, -0.42]] }], ['m', 'w', 'u', 2]],
      });
      const { ops, end } = movie(theta(), [{ type: 'r5', v: 'u', a: 't', b: 'b', over: 1 }]);
      return { N: 3, mode: 'gl', W0: theta(), W1: end, ops };
    },
  },
  {
    name: 'Blank (draw your own)',
    blurb: 'Two empty disks.',
    make: () => ({ N: 3, mode: 'sl', W0: web({}), W1: web({}), ops: [] }),
  },
];
