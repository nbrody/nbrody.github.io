// venue.js — the room around the stage: Empty (the default), Club, Theater or Stadium.
//
// A venue is architecture plus a few facts the rest of the rig uses:
//   box        walls and ceiling that stop beams, lasers and mirror-ball rays
//              (null = open: the empty void and the open-air stadium)
//   gridY      where hoist chains and the mirror balls hang from
//   floor      how the house floor looks (and how big it is)
//   house      ceiling-mounted house-light bulbs, with a chase order `k`
//   fairy(l)   anchor points for fairy-light strands in each layout
//   cams       camera presets moved to suit the room (a real balcony, say)
//   fill       how strongly the house lights fill the room
// Surfaces use the rig's lit material, so moving heads leave pools of light on walls,
// seats and curtains just as they do on the deck. Walls face inward only, so
// cameras outside a room look straight in.

import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { DECK_Y, DECK_FRONT, DECK_BACK } from './layout.js';

const TAU = Math.PI * 2;
const FESTOON_X = [-28, -20, -12, -4, 4, 12, 20, 28]; // stadium festoon poles, clear of the centre line

// ——— textures ———
function canvasTex(w, h, draw, repeat = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  return t;
}
const brickTex = () => canvasTex(256, 256, (g, w, h) => {
  g.fillStyle = '#2b1f1a'; g.fillRect(0, 0, w, h);
  for (let r = 0; r < 8; r++) for (let c = -1; c < 5; c++) {
    const x = c * 64 + (r % 2) * 32, y = r * 32, v = 70 + Math.random() * 45;
    g.fillStyle = `rgb(${v + 40},${v * 0.55},${v * 0.42})`;
    g.fillRect(x + 3, y + 3, 58, 26);
  }
});
const seatTex = (seat, step) => canvasTex(64, 64, (g, w, h) => {
  g.fillStyle = step; g.fillRect(0, 0, w, h);
  g.fillStyle = seat; for (let x = 0; x < w; x += 8) g.fillRect(x + 1, 6, 6, 40);
});
const textTex = (text, color, bg, font, w = 512, h = 128) => canvasTex(w, h, (g) => {
  if (bg) { g.fillStyle = bg; g.fillRect(0, 0, w, h); }
  g.font = font; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.shadowColor = color; g.shadowBlur = bg ? 0 : 24;
  g.fillStyle = color; g.fillText(text, w / 2, h / 2);
  if (!bg) { g.shadowBlur = 8; g.fillStyle = '#fff'; g.globalAlpha = 0.6; g.fillText(text, w / 2, h / 2); }
}, false);
const bottlesTex = () => canvasTex(512, 64, (g, w, h) => {
  const grad = g.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#3a1c06'); grad.addColorStop(1, '#ffb347');
  g.fillStyle = grad; g.fillRect(0, 0, w, h);
  g.fillStyle = 'rgba(20,8,2,0.85)';
  for (let x = 6; x < w; x += 14 + Math.random() * 8) {
    const bw = 6 + Math.random() * 4, bh = 26 + Math.random() * 26;
    g.fillRect(x, h - bh, bw, bh); g.fillRect(x + bw / 2 - 1.5, h - bh - 10, 3, 10);
  }
}, false);

/** A truss box `len` long along x with the rig's lattice texture repeated along it. */
function trussGeo(len, size) {
  const box = new THREE.BoxGeometry(len, size, size);
  const uv = box.getAttribute('uv');
  for (let k = 0; k < uv.count; k++) uv.setX(k, uv.getX(k) * (len / 0.6));
  return box;
}
/** An inward-facing wall: a plane of size w×h centred at `pos`, facing `face` (+x, -x, +z, -z, down). */
function wall(w, h, pos, face, mat) {
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), mat);
  m.position.set(...pos);
  if (face === '+x') m.rotation.y = Math.PI / 2;
  else if (face === '-x') m.rotation.y = -Math.PI / 2;
  else if (face === '-z') m.rotation.y = Math.PI;
  else if (face === 'down') m.rotation.x = Math.PI / 2;
  return m;
}
/** A folded curtain panel, w×h, with folds every `fold` metres; origin at one edge (`from`: 'left' or 'right'). */
function curtainGeo(w, h, fold = 0.55, depth = 0.14, from = 'center') {
  const g = new THREE.PlaneGeometry(w, h, Math.max(8, Math.round((w / fold) * 6)), 1);
  const p = g.getAttribute('position');
  for (let i = 0; i < p.count; i++) p.setZ(i, depth * Math.sin((p.getX(i) / fold) * TAU));
  g.computeVertexNormals();
  if (from === 'left') g.translate(w / 2, 0, 0);
  if (from === 'right') g.translate(-w / 2, 0, 0);
  return g;
}
/** Lines from each point up to height y (cords, rods). */
function cords(points, topY, color = 0x26272c) {
  const pos = [];
  for (const p of points) pos.push(p[0], p[1], p[2], p[0], topY, p[2]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  return new THREE.LineSegments(g, new THREE.LineBasicMaterial({ color }));
}
const glowPlane = (w, h, tex, gain = 2) => {
  const m = new THREE.MeshBasicMaterial({ map: tex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false });
  m.color.setScalar(gain);
  return new THREE.Mesh(new THREE.PlaneGeometry(w, h), m);
};

// ——— fairy-light anchors: strands are { a, b, sag } swags or { top, len, vertical: true } drops ———
function swags(n, fn) { return Array.from({ length: n }, (_, i) => fn(i, n)); }
function drops(top, z) {
  const out = [];
  for (let x = -11; x <= 11.01; x += 0.75) out.push({ a: [x, top, z], len: top - DECK_Y - 0.25, vertical: true });
  return out;
}

export const VENUES = {
  void: {
    label: 'Empty (just the stage)', blurb: 'The stage and floor in a hazy black void.',
    gridY: 24, box: null, fill: 0.14, floor: {},
    cams: {},
    build(ctx) {
      // house lights: a floating grid of cans high over stage and floor
      const house = [];
      for (const x of [-12, -6, 0, 6, 12]) for (const z of [-8, 0, 8, 16]) house.push({ p: [x, 20, z], k: (x + 12) / 48 + (z + 8) / 48, size: 0.55 });
      const can = ctx.lit({ albedo: [0.1, 0.1, 0.11], spec: 0.4 });
      for (const h of house) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.22, 0.28, 0.45, 12), can); m.position.set(h.p[0], h.p[1] + 0.3, h.p[2]); ctx.group.add(m); }
      return house;
    },
    fairy: {
      canopy: () => swags(9, (i) => ({ a: [-17, 13, 5 + i * 2], b: [17, 13, 5 + i * 2], sag: 1.6 })),
      radial: () => swags(16, (i, n) => { const a = (i / n) * TAU; return { a: [0, 18, 8], b: [18 * Math.sin(a), 11, 8 + 18 * Math.cos(a)], sag: 1.2 }; }),
      curtain: () => drops(17, -11.2),
    },
  },

  club: {
    label: 'Club', blurb: 'A brick box with a low steel ceiling, a bar at the back and a neon sign. Beams stop on the walls and ceiling.',
    gridY: 15.5, box: { x: 15, top: 15.5, zMin: -12, zMax: 26 }, fill: 0.32,
    floor: { albedo: [0.13, 0.13, 0.14], spec: 0.55, size: 90, z: 10 },
    cams: {
      foh: { pos: [0, 5.2, 24], target: [0, 6.5, -3.5] },
      balcony: { pos: [0, 12.5, 25], target: [0, 5.5, -3.5] },
      high: { pos: [0, 13.5, 24.5], target: [0, 5, -3.5] },
      side: { pos: [-14, 6, 6], target: [0, 7, -3.5] },
      angle: { pos: [-13, 6.5, 18], target: [0, 7, -3.5] },
    },
    build(ctx) {
      const { group: g, lit } = ctx, W = 15, H = 15.5, Z0 = -12, Z1 = 26, D = Z1 - Z0, zc = (Z0 + Z1) / 2;
      const brick = (w, h) => { const t = brickTex(); return lit({ albedo: [0.55, 0.45, 0.4], map: t, repeat: [w / 2.2, h / 1.1], spec: 0.1 }); };
      g.add(wall(D, H, [-W, H / 2, zc], '+x', brick(D, H)), wall(D, H, [W, H / 2, zc], '-x', brick(D, H)));
      g.add(wall(2 * W, H, [0, H / 2, Z1], '-z', brick(2 * W, H)));
      g.add(wall(2 * W, H, [0, H / 2, Z0], '+z', lit({ albedo: [0.05, 0.05, 0.055] })));
      g.add(wall(2 * W, D, [0, H, zc], 'down', lit({ albedo: [0.09, 0.09, 0.1] })));
      const steel = lit({ albedo: [0.2, 0.2, 0.22], spec: 0.6 });
      for (let z = Z0 + 2; z < Z1; z += 4) { const b = new THREE.Mesh(new THREE.BoxGeometry(2 * W, 0.5, 0.25), steel); b.position.set(0, H - 0.3, z); g.add(b); }
      const concrete = lit({ albedo: [0.3, 0.3, 0.31] });
      for (const x of [-7, 7]) { const p = new THREE.Mesh(new THREE.BoxGeometry(0.7, H, 0.7), concrete); p.position.set(x, H / 2, 14); g.add(p); }
      const black = lit({ albedo: [0.05, 0.05, 0.055], spec: 0.3 });
      for (const x of [-13, 13]) { const pa = new THREE.Mesh(new THREE.BoxGeometry(1.6, 3.2, 1.2), black); pa.position.set(x, 1.6, DECK_FRONT + 0.8); g.add(pa); }
      // the bar: counter, backlit shelves, a neon sign and the exits
      const wood = lit({ albedo: [0.28, 0.15, 0.07], spec: 0.8 });
      const counter = new THREE.Mesh(new THREE.BoxGeometry(14, 1.1, 0.9), wood); counter.position.set(0, 0.55, Z1 - 1.8); g.add(counter);
      const top = new THREE.Mesh(new THREE.BoxGeometry(14.3, 0.08, 1.15), lit({ albedo: [0.5, 0.35, 0.2], spec: 1.2 })); top.position.set(0, 1.13, Z1 - 1.8); g.add(top);
      const shelves = glowPlane(13, 1.6, bottlesTex(), 1.1); shelves.position.set(0, 2.2, Z1 - 0.05); shelves.rotation.y = Math.PI; shelves.material.blending = THREE.NormalBlending; g.add(shelves);
      const neon = glowPlane(8, 2, textTex('Live Music', '#ff3fb4', null, 'italic 600 78px Georgia, serif'), 2.2);
      neon.position.set(0, 5.4, Z1 - 0.05); neon.rotation.y = Math.PI; g.add(neon);
      ctx.anim.push((t) => { neon.material.opacity = Math.sin(t * 37) > 0.97 || (t % 11 > 10.6 && Math.sin(t * 90) > 0) ? 0.25 : 1; });
      for (const s of [-1, 1]) {
        const exit = glowPlane(0.9, 0.3, textTex('EXIT', '#ffffff', '#0a8f3c', '700 90px Helvetica, Arial, sans-serif', 256, 96), 1.6);
        exit.material.blending = THREE.NormalBlending;
        exit.position.set(s * (W - 0.05), 3.1, 21); exit.rotation.y = -s * Math.PI / 2; g.add(exit);
        const door = wall(1.6, 2.4, [s * (W - 0.02), 1.2, 21], s < 0 ? '+x' : '-x', lit({ albedo: [0.07, 0.07, 0.08] })); g.add(door);
      }
      // house lights: bare Edison pendants on cords
      const house = [];
      for (const x of [-12, -6, 0, 6, 12]) for (const z of [8, 12.5, 17, 21.5]) house.push({ p: [x, 11.6, z], k: (x + 12) / 48 + (z - 8) / 27, size: 0.35 });
      g.add(cords(house.map((h) => h.p), H));
      const cap = lit({ albedo: [0.12, 0.1, 0.08], spec: 0.8 });
      for (const h of house) { const c = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.08, 0.14, 8), cap); c.position.set(h.p[0], h.p[1] + 0.14, h.p[2]); g.add(c); }
      return house;
    },
    fairy: {
      canopy: () => swags(12, (i) => ({ a: [-15, 13.2, 5 + i * 1.8], b: [15, 13.2, 5 + i * 1.8], sag: 1.4 })),
      radial: () => swags(16, (i, n) => { const a = (i / n) * TAU; return { a: [0, 15.3, 14], b: [15 * Math.sin(a), 12.5, Math.max(3.5, Math.min(25.8, 14 + 12 * Math.cos(a)))], sag: 0.9 }; }),
      curtain: () => drops(15.2, -11.8),
    },
  },

  theater: {
    label: 'Theater', blurb: 'A proscenium arch with a red house curtain, raked velvet seats, opera boxes, a balcony and crystal chandeliers.',
    gridY: 22, box: { x: 17, top: 20, zMin: -12, zMax: 36 }, fill: 0.36,
    floor: { albedo: [0.2, 0.05, 0.06], spec: 0.05, size: 90, z: 10 },
    curtain: { z: 3.7, halfW: 12.8, top: 15.2 },
    cams: {
      foh: { pos: [0, 5.2, 25], target: [0, 6.5, -3.5] },
      balcony: { pos: [0, 10.4, 32.5], target: [0, 6, -3.5] },
      high: { pos: [0, 15.5, 34], target: [0, 5, -3.5] },
      side: { pos: [-15.2, 9.6, 12], target: [0, 7, -3.5] },
      angle: { pos: [-13, 6.5, 20], target: [0, 7, -3.5] },
    },
    build(ctx) {
      const { group: g, lit } = ctx, W = 17, H = 17, Z0 = 4.8, Z1 = 36, zc = (Z0 + Z1) / 2;
      const plaster = lit({ albedo: [0.55, 0.48, 0.38], spec: 0.2 });
      const gold = lit({ albedo: [0.85, 0.62, 0.25], spec: 1.5 });
      const velvet = lit({ albedo: [0.45, 0.03, 0.05], spec: 0.15, side: THREE.DoubleSide });
      const damask = lit({ albedo: [0.32, 0.07, 0.06], spec: 0.1 });
      const box = (w, h, d, x, y, z, mat) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); g.add(m); return m; };
      // proscenium arch with gold trim
      box(4.2, 22, 0.8, -14.9, 11, 4.4, plaster); box(4.2, 22, 0.8, 14.9, 11, 4.4, plaster); box(25.6, 5, 0.8, 0, 19.5, 4.4, plaster);
      box(0.4, 17, 1.0, -12.8, 8.5, 4.4, gold); box(0.4, 17, 1.0, 12.8, 8.5, 4.4, gold); box(26, 0.5, 1.0, 0, 17, 4.4, gold);
      // valance, legs, and the house curtain (two halves that gather to the sides)
      const val = new THREE.Mesh(curtainGeo(25.6, 1.8, 0.45, 0.12), velvet); val.position.set(0, 16.1, 3.95); g.add(val);
      for (const s of [-1, 1]) { const leg = new THREE.Mesh(curtainGeo(1.6, 17, 0.4, 0.12), velvet); leg.position.set(s * 12, 8.5, 3.9); g.add(leg); }
      ctx.curtainHalves = [-1, 1].map((s) => {
        const half = new THREE.Mesh(curtainGeo(12.8, 15.2, 0.5, 0.16, s < 0 ? 'left' : 'right'), velvet);
        half.position.set(s * 12.8, 7.6, 3.7);
        g.add(half);
        return half;
      });
      // stage house behind the arch: black
      const black = lit({ albedo: [0.04, 0.04, 0.045] });
      g.add(wall(16.8, 23, [-W, 11.5, -3.6], '+x', black), wall(16.8, 23, [W, 11.5, -3.6], '-x', black), wall(2 * W, 23, [0, 11.5, -12], '+z', black));
      // auditorium: damask walls with gold pilasters, back wall, ceiling with a medallion
      g.add(wall(Z1 - Z0, H, [-W, H / 2, zc], '+x', damask), wall(Z1 - Z0, H, [W, H / 2, zc], '-x', damask));
      g.add(wall(2 * W, H, [0, H / 2, Z1], '-z', damask), wall(2 * W, Z1 - Z0, [0, H, zc], 'down', plaster));
      for (let z = 7; z < Z1; z += 5) for (const s of [-1, 1]) box(0.3, H, 0.6, s * (W - 0.15), H / 2, z, gold);
      const ring = new THREE.Mesh(new THREE.TorusGeometry(2.6, 0.12, 8, 48), gold); ring.rotation.x = Math.PI / 2; ring.position.set(0, H - 0.1, 18); g.add(ring);
      // raked stalls, a balcony and its seats (one instanced mesh for every seat)
      const seats = [], riserMat = lit({ albedo: [0.12, 0.04, 0.04] });
      for (let r = 0; r < 18; r++) {
        const z = 9 + r * 1.0, hr = 0.15 + r * 0.17;
        box(2 * W - 0.2, hr, 1.0, 0, hr / 2, z, riserMat);
        for (let x = -14.4; x <= 14.41; x += 0.9) if (Math.abs(x) > 0.8) seats.push([x, hr + 0.45, z]);
      }
      box(2 * W - 0.2, 0.6, 9, 0, 7.2, 31.5, plaster);
      box(2 * W - 0.2, 1.2, 0.3, 0, 7.9, 27.1, gold);
      for (let r = 0; r < 4; r++) {
        const z = 28.5 + r * 1.6, hr = 7.5 + r * 0.45;
        box(2 * W - 0.2, 0.45, 1.6, 0, hr - 0.2, z, riserMat);
        for (let x = -14.4; x <= 14.41; x += 0.9) seats.push([x, hr + 0.45, z]);
      }
      // a seat: velvet back plus cushion, with a gap between neighbours
      const back = new THREE.BoxGeometry(0.66, 0.9, 0.12).translate(0, 0.05, 0.22), cushion = new THREE.BoxGeometry(0.66, 0.14, 0.5).translate(0, -0.28, -0.02);
      const seatMesh = new THREE.InstancedMesh(mergeGeometries([back, cushion]), lit({ albedo: [0.55, 0.07, 0.08], spec: 0.35 }), seats.length);
      const m4 = new THREE.Matrix4();
      seats.forEach((p, i) => { m4.makeTranslation(...p); seatMesh.setMatrixAt(i, m4); });
      seatMesh.frustumCulled = false;
      g.add(seatMesh);
      // opera boxes on the side walls
      for (const s of [-1, 1]) for (const z of [11, 16, 21]) for (const y of [4.2, 8.4]) {
        box(1.8, 0.25, 3.6, s * (W - 0.9), y, z, plaster);
        box(0.15, 0.9, 3.6, s * (W - 1.8), y + 0.55, z, gold);
      }
      // house lights: a big crystal chandelier, two smaller ones, and sconces on the walls
      const house = [];
      const chandelier = (x, y, z, scale) => {
        const tiers = [[1.5, 0, 18], [1.05, -0.65, 14], [0.6, -1.2, 10], [0.25, -1.6, 6]];
        for (const [r, dy, n] of tiers) {
          for (let i = 0; i < n; i++) { const a = (i / n) * TAU; house.push({ p: [x + Math.cos(a) * r * scale, y + dy * scale, z + Math.sin(a) * r * scale], k: z / 40 + i / n * 0.1, size: 0.3 * scale }); }
          const t = new THREE.Mesh(new THREE.TorusGeometry(r * scale, 0.035 * scale, 6, 32), gold);
          t.rotation.x = Math.PI / 2; t.position.set(x, y + dy * scale - 0.05, z); g.add(t);
        }
        g.add(cords([[x, y, z]], H, 0x8a6a2a));
      };
      chandelier(0, 14.2, 18, 1.2); chandelier(0, 15, 9.5, 0.7); chandelier(0, 15, 26.5, 0.7);
      for (const s of [-1, 1]) for (let z = 7.5; z < Z1; z += 5) {
        box(0.08, 0.5, 0.3, s * (W - 0.05), 5.4, z, gold);
        for (const dz of [-0.18, 0.18]) house.push({ p: [s * (W - 0.25), 5.75, z + dz], k: 0.5 + z / 80, size: 0.22 });
      }
      return house;
    },
    fairy: {
      canopy: () => swags(12, (i) => ({ a: [-17, 14.5, 6 + i * 2.2], b: [17, 14.5, 6 + i * 2.2], sag: 1.5 })),
      radial: () => swags(18, (i, n) => { const a = (i / n) * TAU; return { a: [0, 16.6, 18], b: [17 * Math.sin(a), 12.8, Math.max(5.5, Math.min(35.6, 18 + 15 * Math.cos(a)))], sag: 1.0 }; }),
      curtain: () => drops(19.5, -11.8),
    },
  },

  stadium: {
    label: 'Stadium', blurb: 'An open-air bowl under the stars: a stage roof on towers, a field, two decks of empty seats with a ribbon board, and four floodlight towers.',
    gridY: 18.5, box: null, fill: 1.6, // four floodlight towers light the whole bowl
    floor: { albedo: [0.035, 0.085, 0.035], spec: 0.1, size: 320, z: 60 },
    cams: {
      balcony: { pos: [0, 30, 128], target: [0, 7, -3.5], fov: 38 },
      high: { pos: [0, 40, 70], target: [0, 5, -3.5] },
      foh: { pos: [0, 6, 32], target: [0, 7, -3.5] },
    },
    maxDistance: 260,
    build(ctx) {
      const { group: g, lit, rig } = ctx;
      // night sky: a gradient dome, stars and a moon
      const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 16), new THREE.ShaderMaterial({
        side: THREE.BackSide, depthWrite: false,
        vertexShader: 'varying vec3 vP; void main() { vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'varying vec3 vP; void main() { float h = normalize(vP).y; vec3 c = mix(vec3(0.02, 0.014, 0.012), vec3(0.004, 0.006, 0.016), smoothstep(-0.02, 0.2, h)); c = mix(c, vec3(0.0, 0.0, 0.002), smoothstep(0.2, 0.8, h)); gl_FragColor = vec4(c, 1.0); }',
      }));
      g.add(sky);
      const starPos = [], starCol = [];
      for (let i = 0; i < 2200; i++) {
        const u = Math.random(), a = Math.random() * TAU, y = 0.08 + 0.92 * Math.sqrt(u), r = Math.sqrt(1 - y * y), b = 0.3 + Math.random() ** 3 * 1.4;
        starPos.push(Math.cos(a) * r * 850, y * 850, Math.sin(a) * r * 850); starCol.push(b, b, b * (0.9 + Math.random() * 0.2));
      }
      const sg = new THREE.BufferGeometry();
      sg.setAttribute('position', new THREE.Float32BufferAttribute(starPos, 3));
      sg.setAttribute('color', new THREE.Float32BufferAttribute(starCol, 3));
      g.add(new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.6, sizeAttenuation: false, vertexColors: true, depthWrite: false })));
      const moon = new THREE.Mesh(new THREE.CircleGeometry(16, 32), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.5, 1.3) }));
      moon.position.set(-420, 380, 600); moon.lookAt(0, 0, 0); g.add(moon);
      // stage roof on four ground-support towers, with PA hangs
      const t = rig.trussMat, roofY = 18.5, zs = [DECK_FRONT + 0.6, DECK_BACK - 0.6];
      for (const x of [-13.8, 13.8]) for (const z of zs) { const m = new THREE.Mesh(trussGeo(roofY, 0.9), t); m.rotation.z = Math.PI / 2; m.position.set(x, roofY / 2, z); g.add(m); }
      for (const z of zs) { const m = new THREE.Mesh(trussGeo(28.5, 0.9), t); m.position.set(0, roofY, z); g.add(m); }
      for (const x of [-13.8, -4.6, 4.6, 13.8]) { const m = new THREE.Mesh(trussGeo(zs[0] - zs[1], 0.8), t); m.rotation.y = Math.PI / 2; m.position.set(x, roofY, (zs[0] + zs[1]) / 2); g.add(m); }
      g.add(wall(29, zs[0] - zs[1] + 1, [0, roofY + 1.1, (zs[0] + zs[1]) / 2], 'down', lit({ albedo: [0.03, 0.03, 0.035] })));
      const black = lit({ albedo: [0.05, 0.05, 0.055], spec: 0.3 });
      for (const s of [-1, 1]) { const pa = new THREE.Mesh(new THREE.BoxGeometry(1.3, 7.5, 1.3), black); pa.position.set(s * 15.6, 13, DECK_FRONT); pa.rotation.x = 0.06; g.add(pa); }
      // yard lines on the field
      const lineMat = lit({ albedo: [0.55, 0.58, 0.55] });
      for (let k = 0; k < 11; k++) { const l = new THREE.Mesh(new THREE.PlaneGeometry(54, 0.18), lineMat); l.rotation.x = -Math.PI / 2; l.position.set(0, 0.012, 12 + k * 9.14); g.add(l); }
      // the bowl: two decks around the field, open behind the stage
      const C = [0, 0, 48];
      const deck = (r0, r1, y0, y1, rows, a0, a1, n, mat) => {
        const pos = [], uv = [], idx = [];
        for (let i = 0; i <= n; i++) {
          const a = a0 + ((a1 - a0) * i) / n;
          for (const [r, y, v] of [[r0, y0, 0], [r1, y1, rows]]) { pos.push(C[0] + Math.sin(a) * r, y, C[2] + Math.cos(a) * r); uv.push((i / n) * (a1 - a0) * r0 / 6, v); }
          if (i < n) { const k = i * 2; idx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
        geo.setIndex(idx); geo.computeVertexNormals();
        g.add(new THREE.Mesh(geo, mat));
      };
      const seatMat = lit({ albedo: [0.4, 0.45, 0.6], map: seatTex('#26375e', '#141518'), side: THREE.DoubleSide });
      const a0 = -2.72, a1 = 2.72; // the bowl wraps round past the sides of the stage
      deck(62, 80, 1.5, 14, 18, a0, a1, 72, seatMat);
      deck(84, 108, 19, 40, 22, a0, a1, 80, seatMat);
      deck(62, 62.01, 0, 1.5, 1, a0, a1, 72, black);
      // the ribbon board on the upper deck's fascia shows the rig's colours
      const ribbonMat = new THREE.ShaderMaterial({
        side: THREE.DoubleSide,
        uniforms: { uTime: { value: 0 }, uColor: { value: new THREE.Color(0.2, 0.3, 1) }, uBeat: { value: 0 } },
        vertexShader: 'varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
        fragmentShader: 'uniform float uTime; uniform vec3 uColor; uniform float uBeat; varying vec2 vUv; void main() { float x = vUv.x * 40.0; float band = step(0.5, fract(x * 0.25 - uTime * 0.6)); float px = step(0.18, fract(x * 6.0)) * step(0.18, fract(vUv.y * 6.0)); float hit = exp(-fract(uBeat) * 4.0); gl_FragColor = vec4(uColor * (0.35 + 0.65 * band) * px * (0.6 + 0.8 * hit) * 1.6, 1.0); }',
      });
      const rb = []; const ruv = []; const ridx = []; const n = 96;
      for (let i = 0; i <= n; i++) {
        const a = a0 + ((a1 - a0) * i) / n;
        for (const [y, v] of [[16.2, 0], [18.4, 1]]) { rb.push(C[0] + Math.sin(a) * 83, y, C[2] + Math.cos(a) * 83); ruv.push(i / n, v); }
        if (i < n) { const k = i * 2; ridx.push(k, k + 2, k + 1, k + 1, k + 2, k + 3); }
      }
      const rg = new THREE.BufferGeometry();
      rg.setAttribute('position', new THREE.Float32BufferAttribute(rb, 3));
      rg.setAttribute('uv', new THREE.Float32BufferAttribute(ruv, 2));
      rg.setIndex(ridx);
      g.add(new THREE.Mesh(rg, ribbonMat));
      ctx.anim.push((time, E, rigColor) => { ribbonMat.uniforms.uTime.value = time; ribbonMat.uniforms.uBeat.value = E.beat; ribbonMat.uniforms.uColor.value.setRGB(...rigColor); });
      // festoon poles on the field and a maypole, for the fairy lights
      const pole = lit({ albedo: [0.25, 0.25, 0.27], spec: 0.8 });
      for (const x of FESTOON_X) { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.12, 9, 8), pole); m.position.set(x, 4.5, 28); g.add(m); }
      const may = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 16, 10), pole); may.position.set(0, 8, 40); g.add(may);
      // house lights: four floodlight towers, each a bank of 24 lamps aimed at the field
      const house = [], o = new THREE.Object3D();
      [[-2.6, 0], [2.6, 0.33], [-1.2, 0.66], [1.2, 1]].forEach(([a, k]) => {
        const x = C[0] + Math.sin(a) * 118, z = C[2] + Math.cos(a) * 118, y = 62;
        const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.9, y, 10), pole); mast.position.set(x, y / 2, z); g.add(mast);
        o.position.set(x, y, z); o.lookAt(0, 0, 40); o.updateMatrixWorld();
        const head = new THREE.Mesh(new THREE.BoxGeometry(12, 7, 1.2), black); head.position.copy(o.position); head.quaternion.copy(o.quaternion); g.add(head);
        for (let i = 0; i < 6; i++) for (let j = 0; j < 4; j++) {
          const v = new THREE.Vector3(-5 + i * 2, -2.4 + j * 1.6, 0.7).applyMatrix4(o.matrixWorld);
          house.push({ p: [v.x, v.y, v.z], k: k * 0.75 + (i + j * 6) / 96, size: 3.4 });
        }
      });
      return house;
    },
    fairy: {
      canopy: () => {
        const out = [];
        for (const x of FESTOON_X) out.push({ a: [x * 0.5, 18.5, DECK_FRONT + 0.6], b: [x, 9, 28], sag: 1.4 });
        for (let i = 0; i < FESTOON_X.length - 1; i++) out.push({ a: [FESTOON_X[i], 9, 28], b: [FESTOON_X[i + 1], 9, 28], sag: 0.9 });
        return out;
      },
      radial: () => swags(20, (i, n) => { const a = (i / n) * TAU; return { a: [0, 16, 40], b: [16 * Math.sin(a), 3, 40 + 16 * Math.cos(a)], sag: 0.8 }; }),
      curtain: () => drops(17.8, -11.2),
    },
  },
};

/** Builds and swaps venues, and animates their moving parts (curtain, neon, ribbon board). */
export class Venue {
  constructor(rig, engine) {
    this.rig = rig; this.e = engine;
    this.group = null; this.id = null; this.anim = []; this.house = [];
    this.curtain = { cover: 0, target: 0, halves: null };
  }

  set(id) {
    const def = VENUES[id] || VENUES.void;
    if (this.group) {
      this.rig.scene.remove(this.group);
      this.group.traverse((o) => { o.geometry?.dispose(); if (o.material && o.material !== this.rig.trussMat) { o.material.map?.dispose(); o.material.dispose?.(); } });
    }
    this.id = VENUES[id] ? id : 'void';
    this.def = def;
    const ctx = { group: new THREE.Group(), lit: (o) => this.rig.lit(o), rig: this.rig, anim: [], curtainHalves: null };
    this.house = def.build(ctx);
    this.group = ctx.group;
    this.anim = ctx.anim;
    this.curtain.halves = ctx.curtainHalves;
    this.rig.scene.add(this.group);
    this.e.venueBox = def.box;
    this.e.curtain = def.curtain ? { ...def.curtain, cover: this.curtain.cover } : null;
    this.rig.gridY = def.gridY;
    this.rig.setFloor(def.floor);
    this.rig.camOverrides = def.cams;
    this.rig.controls.maxDistance = def.maxDistance || 90;
    this.rig.setCamera(this.rig.camId || 'audience', 1.5);
  }

  /** Theater only: close (true) or open the house curtain. It travels over about 3.5 s. */
  closeCurtain(closed) { this.curtain.target = closed ? 1 : 0; }

  update(dt, rigColor) {
    const E = this.e, c = this.curtain;
    c.cover += Math.max(-dt / 3.5, Math.min(dt / 3.5, c.target - c.cover));
    if (c.halves) {
      const e = c.cover * c.cover * (3 - 2 * c.cover);
      for (const h of c.halves) h.scale.x = 0.1 + 0.9 * e;
      if (E.curtain) E.curtain.cover = e;
    }
    for (const f of this.anim) f(E.time, E, rigColor);
  }
}
