// land.js — Chapter 3, 40–112 s: the world the animals live in.
//
//   the parade's backdrop: open water → shoreline → dry land
//   ecosystems in time-lapse: days flicker past, seasons turn, forests
//   green and bare, a herd migrates, birds cross the sky
//   night on the savanna: the Milky Way, a fire, people around it — and one
//   of them stands and looks up
//
// Sky and water are a shader; hills, trees, animals and people are painted
// on the 2D layer.

import { HEADER, NOISE } from '../../gfx/glsl.js';
import { SHAPE } from '../../gfx/renderer.js';
import { RNG, hash, lerp, smoothstep, TAU, mixc, rgba } from '../../lib/math.js';

const SKY_FS = `${HEADER}
uniform vec2 u_view;
uniform float u_t, u_bright, u_water, u_day, u_night, u_horizon, u_milky, u_stars, u_sunX;
uniform vec3 u_tint;
in vec2 v_px; out vec4 o;
${NOISE}
void main() {
  vec2 uv = v_px / u_view;
  vec2 p = v_px / u_view.y;
  // under water
  vec3 water = mix(vec3(0.03, 0.24, 0.34), vec3(0.004, 0.03, 0.07), smoothstep(0.0, 1.0, uv.y));
  float ray = pow(vnoise(vec3((p.x + p.y * 0.35) * 5.0, 0.5, u_t * 0.12)), 4.0) * (1.0 - uv.y);
  water += vec3(0.2, 0.5, 0.55) * ray * 0.6;
  water *= u_tint;
  // sky over land: day ↔ dusk ↔ night
  float sunH = -cos(u_day * 6.2831853);
  float day = smoothstep(-0.25, 0.35, sunH) * (1.0 - u_night);
  float dusk = exp(-sunH * sunH * 14.0) * (1.0 - u_night);
  float y = clamp(uv.y / u_horizon, 0.0, 1.0);
  vec3 top = mix(vec3(0.004, 0.006, 0.02), vec3(0.1, 0.3, 0.7), day);
  vec3 hor = mix(vec3(0.02, 0.025, 0.06), vec3(0.62, 0.78, 0.95), day);
  hor = mix(hor, vec3(1.0, 0.45, 0.18), dusk * 0.8);
  top = mix(top, vec3(0.16, 0.1, 0.3), dusk * 0.5);
  vec3 sky = mix(top, hor, pow(y, 1.6));
  // sun
  float sx = u_sunX >= 0.0 ? u_sunX : fract(u_day + 0.25) * 1.6 - 0.3;
  vec2 sp = vec2(sx * u_view.x / u_view.y, u_horizon * (1.0 - 0.8 * max(sunH, -0.2)));
  float sd = length(p - sp);
  sky += vec3(1.0, 0.9, 0.7) * (smoothstep(0.035, 0.03, sd) * 2.0 + exp(-sd * 9.0) * 0.35) * smoothstep(-0.2, 0.1, sunH) * (1.0 - u_night);
  // stars and the Milky Way
  float night = 1.0 - day;
  vec2 g = floor(v_px / 2.0);
  float h = hash12(g);
  float star = step(0.997, h) * (0.6 + 0.4 * sin(u_t * 3.0 + h * 80.0)) + step(0.9993, h) * 1.5;
  vec2 mw = vec2(p.x * 0.8 + p.y * 0.55, -p.x * 0.55 + p.y * 0.8);
  float band = exp(-pow((mw.y - 0.3) * 4.5, 2.0));
  float cloud = vfbm(vec3(mw * 4.0, 1.0)) * band;
  float lane = smoothstep(0.55, 0.7, vfbm(vec3(mw * 7.0 + 3.0, 2.0))) * exp(-pow((mw.y - 0.29) * 14.0, 2.0));
  vec3 milky = vec3(0.75, 0.72, 0.9) * cloud * 0.55 + vec3(1.0, 0.85, 0.7) * band * 0.08;
  milky *= 1.0 - lane * 0.8;
  float mstar = step(0.985, h) * band * 0.8;
  sky += (vec3(star + mstar) * u_stars + milky * u_milky) * night * (1.0 - smoothstep(0.85, 1.0, y) * 0.7);
  vec3 col = mix(sky, water, u_water);
  o = vec4(col * u_bright, 1.0);
}`;

// ── helpers for the painted layer ───────────────────────────────────────────

function hillPath(g, W, H, base, amp, freq, seed, t = 0) {
  g.beginPath();
  g.moveTo(-10, H + 10);
  for (let x = -10; x <= W + 10; x += 12) {
    const u = x / W;
    const y = base - amp * (0.55 * Math.sin(u * freq + seed) + 0.3 * Math.sin(u * freq * 2.3 + seed * 1.7 + t) + 0.15 * Math.sin(u * freq * 5.1 + seed * 3.1));
    g.lineTo(x, y);
  }
  g.lineTo(W + 10, H + 10);
  g.closePath();
}
function hillY(W, x, base, amp, freq, seed) {
  const u = x / W;
  return base - amp * (0.55 * Math.sin(u * freq + seed) + 0.3 * Math.sin(u * freq * 2.3 + seed * 1.7) + 0.15 * Math.sin(u * freq * 5.1 + seed * 3.1));
}

/** A branching tree skeleton: [{x0,y0,x1,y1,depth}] in tree units (height ≈ 1). */
function makeTree(rng, kind) {
  const segs = [], leaves = [];
  const grow = (x, y, ang, len, depth) => {
    const x1 = x + Math.cos(ang) * len, y1 = y + Math.sin(ang) * len;
    segs.push({ x0: x, y0: y, x1, y1, depth });
    if (depth >= (kind === 'acacia' ? 4 : 5)) { leaves.push({ x: x1, y: y1, depth, r: rng.range(0.08, 0.14) }); return; }
    const n = depth < 1 ? 2 : rng.int(2, 3);
    for (let i = 0; i < n; i++) {
      const spread = kind === 'acacia' ? 0.75 : 0.5;
      const a = ang + (i - (n - 1) / 2) * spread + rng.range(-0.2, 0.2);
      const flat = kind === 'acacia' && depth >= 2 ? (a - -Math.PI / 2) * 0.4 : 0;
      grow(x1, y1, a + flat, len * (kind === 'acacia' ? 0.72 : 0.7) * rng.range(0.85, 1.1), depth + 1);
    }
  };
  grow(0, 0, -Math.PI / 2 + rng.range(-0.08, 0.08), kind === 'acacia' ? 0.42 : 0.34, 0);
  return { segs, leaves };
}

// seasonal colour of leaves and ground: spring, summer, autumn, winter
const LEAF = [[0.55, 0.85, 0.35], [0.24, 0.55, 0.2], [0.95, 0.5, 0.15], [0.9, 0.9, 0.95]];
const GROUND = [[0.25, 0.42, 0.18], [0.2, 0.33, 0.12], [0.45, 0.33, 0.12], [0.85, 0.88, 0.95]];
function seasonal(table, s) {
  const i = Math.floor(s) % 4, f = s - Math.floor(s);
  const e = smoothstep(0.6, 1.0, f);
  return mixc(table[i], table[(i + 1) % 4], e);
}

// seated person (facing +x), origin at the hips on the ground; height ≈ 1
const SEATED = [[-0.12, 0], [-0.15, 0.3], [-0.11, 0.6], [-0.05, 0.74], [0.04, 0.78], [0.13, 0.71], [0.27, 0.57],
  [0.4, 0.53], [0.47, 0.49], [0.49, 0.36], [0.52, 0.02], [0.38, 0]];
// standing person in profile (facing +x), head included, origin between the feet
const STANDING = [[-0.08, 0], [-0.07, 0.45], [-0.095, 0.85], [-0.07, 1.1], [-0.1, 1.38], [-0.06, 1.46], [-0.08, 1.52],
  [-0.09, 1.62], [-0.05, 1.71], [0.03, 1.73], [0.08, 1.66], [0.1, 1.61], [0.13, 1.575], [0.09, 1.56], [0.095, 1.54],
  [0.08, 1.51], [0.03, 1.49], [0.04, 1.44], [0.1, 1.36], [0.12, 1.22], [0.09, 1.02], [0.1, 0.88], [0.08, 0.45],
  [0.07, 0.06], [0.16, 0]];
const NECK = [0.0, 1.47];

/** Resample a closed polygon to n points by arc length (so two shapes can morph). */
function resamplePoly(pts, n) {
  const cum = [0];
  for (let i = 1; i <= pts.length; i++) {
    const a = pts[i - 1], b = pts[i % pts.length];
    cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
  }
  const total = cum[cum.length - 1], out = [];
  let j = 0;
  for (let k = 0; k < n; k++) {
    const s = (k / n) * total;
    while (cum[j + 1] < s) j++;
    const a = pts[j], b = pts[(j + 1) % pts.length], u = (s - cum[j]) / (cum[j + 1] - cum[j] || 1);
    out.push([lerp(a[0], b[0], u), lerp(a[1], b[1], u)]);
  }
  return out;
}
const SEATED_R = resamplePoly(SEATED, 60), STANDING_R = resamplePoly(STANDING, 60);

export class Land {
  constructor(R) {
    this.sky = R.fsProgram(SKY_FS, 'ch3-sky');
    const rng = new RNG(88);
    this.trees = [];
    for (let i = 0; i < 16; i++) {
      this.trees.push({ u: (i + 0.5) / 16 + rng.range(-0.02, 0.02), s: rng.range(0.7, 1.15), tree: makeTree(rng, 'broad'), ph: rng.range(0, TAU) });
    }
    this.acacias = [0.12, 0.3, 0.6, 0.93].map((u, i) => ({ u, s: 0.8 + 0.3 * hash(i, 5), tree: makeTree(rng, 'acacia') }));
  }

  drawSky(R, u) {
    R.pass(this.sky, {
      u_t: u.t, u_bright: u.bright ?? 1, u_water: u.water ?? 0, u_day: u.day ?? 0.5, u_night: u.night ?? 0,
      u_horizon: u.horizon ?? 0.62, u_milky: u.milky ?? 0, u_stars: u.stars ?? 1, u_tint: u.tint ?? [1, 1, 1], u_sunX: u.sunX ?? -1,
    }, 'add');
  }

  /** Shoreline and land for the parade (0 = open water … 1 = land). */
  drawShore(R, { land, alpha }) {
    if (alpha <= 0.01 || land <= 0.01) return;
    const g = R.begin2D(), W = R.W, H = R.H;
    const base = lerp(H * 1.15, H * 0.8, smoothstep(0, 0.6, land));
    g.fillStyle = rgba([0.06 + 0.1 * land, 0.08 + 0.1 * land, 0.05], alpha);
    hillPath(g, W, H, base, H * 0.05, 5, 1.3, 0);
    g.fill();
    g.fillStyle = rgba([0.03, 0.05, 0.03], alpha);
    hillPath(g, W, H, base + H * 0.07, H * 0.03, 8, 4.1, 0);
    g.fill();
  }

  /** Ecosystems in time-lapse. s = season (0 spring, 1 summer, 2 autumn, 3 winter…), light = 0..1 */
  drawEcosystem(R, { t, season, light, alpha, wind = 1 }) {
    if (alpha <= 0.01) return;
    const g = R.begin2D(), W = R.W, H = R.H;
    const lit = (c, k = 1) => [c[0] * (0.12 + 0.88 * light) * k, c[1] * (0.12 + 0.88 * light) * k, c[2] * (0.15 + 0.85 * light) * k];
    const ground = seasonal(GROUND, season);
    // far hills, hazy
    g.fillStyle = rgba(lit(mixc([0.35, 0.45, 0.55], ground, 0.35), 0.8), alpha);
    hillPath(g, W, H, H * 0.64, H * 0.06, 4, 2.2);
    g.fill();
    // middle hills with the forest
    g.fillStyle = rgba(lit(mixc([0.2, 0.3, 0.25], ground, 0.7), 0.85), alpha);
    hillPath(g, W, H, H * 0.72, H * 0.05, 6, 0.4);
    g.fill();
    const leaf = seasonal(LEAF, season);
    const bare = smoothstep(2.55, 2.95, season % 4) * (1 - smoothstep(3.55, 3.95, season % 4));
    for (const tr of this.trees) {
      const x = tr.u * W, y = hillY(W, x, H * 0.72, H * 0.05, 6, 0.4) + 2;
      const s = H * 0.2 * tr.s;
      const sway = (d) => Math.sin(t * 2.2 + tr.ph + d) * 0.02 * d * wind;
      g.strokeStyle = rgba(lit([0.16, 0.11, 0.08]), alpha);
      for (const sg of tr.tree.segs) {
        const k = sway(sg.depth);
        g.lineWidth = Math.max(0.6, (5 - sg.depth) * s * 0.012);
        g.beginPath();
        g.moveTo(x + (sg.x0 + k * sg.y0 * -1) * s, y + sg.y0 * s);
        g.lineTo(x + (sg.x1 + k * sg.y1 * -1) * s, y + sg.y1 * s);
        g.stroke();
      }
      const leafA = alpha * (1 - bare) * 0.85;
      if (leafA > 0.01) {
        for (const lf of tr.tree.leaves) {
          const k = sway(lf.depth);
          const jitter = hash(Math.round(lf.x * 1000), 3);
          g.fillStyle = rgba(lit(mixc(leaf, [leaf[0] * 0.7, leaf[1] * 0.8, leaf[2] * 0.6], jitter)), leafA);
          g.beginPath();
          g.arc(x + (lf.x - k * lf.y) * s, y + lf.y * s, lf.r * s, 0, TAU);
          g.fill();
        }
      }
    }
    // near meadow
    g.fillStyle = rgba(lit(ground), alpha);
    hillPath(g, W, H, H * 0.86, H * 0.03, 3, 5.0);
    g.fill();
    // grass tufts
    g.strokeStyle = rgba(lit(mixc(ground, [0.1, 0.2, 0.05], 0.4)), alpha);
    g.lineWidth = 1;
    for (let i = 0; i < 160; i++) {
      const x = hash(i, 11) * W, y = hillY(W, x, H * 0.86, H * 0.03, 3, 5.0) + 3 + hash(i, 12) * H * 0.1;
      const h = H * (0.012 + 0.012 * hash(i, 13));
      const b = Math.sin(t * 3 + x * 0.02) * h * 0.3 * wind;
      g.beginPath(); g.moveTo(x, y); g.quadraticCurveTo(x + b * 0.5, y - h * 0.6, x + b, y - h); g.stroke();
    }
    // a migrating herd
    const herdX = ((t * 0.06) % 1.4 - 0.2) * W;
    g.fillStyle = rgba(lit([0.1, 0.07, 0.05]), alpha);
    for (let i = 0; i < 9; i++) {
      const hx = herdX - i * W * 0.035 - hash(i, 21) * W * 0.02;
      const hy = hillY(W, hx, H * 0.86, H * 0.03, 3, 5.0) - 2 + hash(i, 22) * H * 0.05;
      this._antelope(g, hx, hy, H * 0.035 * (0.85 + 0.3 * hash(i, 23)), t * 7 + i);
    }
    // birds
    g.strokeStyle = rgba(lit([0.08, 0.08, 0.1]), alpha * 0.9);
    g.lineWidth = 1.2;
    for (let i = 0; i < 7; i++) {
      const bx = (((t * 0.09 + 0.3) % 1.5) - 0.25) * W - i * 18 - (i % 2) * 10;
      const by = H * 0.28 + (i % 2 ? 1 : -1) * i * 6 + Math.sin(t * 2 + i) * 3;
      const f = Math.sin(t * 12 + i) * 4;
      g.beginPath(); g.moveTo(bx - 6, by - f); g.lineTo(bx, by); g.lineTo(bx + 6, by - f); g.stroke();
    }
  }

  _antelope(g, x, y, s, ph) {
    g.beginPath();
    g.ellipse(x, y - s * 0.9, s * 0.62, s * 0.26, 0, 0, TAU);
    g.fill();
    g.beginPath();
    g.moveTo(x + s * 0.45, y - s * 1.0);
    g.lineTo(x + s * 0.72, y - s * 1.55);
    g.lineTo(x + s * 0.9, y - s * 1.5);
    g.lineTo(x + s * 0.62, y - s * 0.9);
    g.fill();
    g.lineWidth = Math.max(1, s * 0.09);
    g.strokeStyle = g.fillStyle;
    for (let k = 0; k < 4; k++) {
      const lx = x + (k < 2 ? 0.38 : -0.42) * s + (k % 2) * s * 0.08;
      const sw = Math.sin(ph + (k % 2 ? Math.PI : 0) + (k < 2 ? 0 : 1)) * s * 0.18;
      g.beginPath(); g.moveTo(lx, y - s * 0.8); g.lineTo(lx + sw, y); g.stroke();
    }
    g.beginPath(); g.moveTo(x + s * 0.8, y - s * 1.55); g.lineTo(x + s * 0.7, y - s * 1.9); g.stroke();
  }

  /** Night on the savanna, a fire, and the people around it. */
  drawFireScene(R, { t, alpha, stand, lookUp, cam = null }) {
    if (alpha <= 0.01) return;
    const g = R.begin2D(), W = R.W, H = R.H;
    if (cam) g.setTransform(R.rs * cam.zoom, 0, 0, R.rs * cam.zoom, R.rs * cam.tx, R.rs * cam.ty);
    const fx = W * 0.5, fy = H * 0.8;
    // ground and acacias, lit faintly by the fire
    g.fillStyle = rgba([0.035, 0.03, 0.035], alpha);
    hillPath(g, W, H, H * 0.74, H * 0.025, 4, 1.1);
    g.fill();
    for (const a of this.acacias) {
      const x = a.u * W, y = hillY(W, x, H * 0.74, H * 0.025, 4, 1.1) + 2;
      const s = H * 0.26 * a.s;
      g.strokeStyle = rgba([0.02, 0.018, 0.02], alpha);
      for (const sg of a.tree.segs) {
        g.lineWidth = Math.max(0.8, (4 - sg.depth) * s * 0.014);
        g.beginPath(); g.moveTo(x + sg.x0 * s, y + sg.y0 * s); g.lineTo(x + sg.x1 * s, y + sg.y1 * s); g.stroke();
      }
      g.fillStyle = rgba([0.02, 0.018, 0.02], alpha);
      for (const lf of a.tree.leaves) {
        g.beginPath(); g.ellipse(x + lf.x * s, y + lf.y * s, lf.r * s * 1.7, lf.r * s * 0.55, 0, 0, TAU); g.fill();
      }
    }
    g.fillStyle = rgba([0.05, 0.035, 0.03], alpha);
    hillPath(g, W, H, H * 0.86, H * 0.015, 2, 3.3);
    g.fill();
    // firelight pooled on the ground
    const pool = g.createRadialGradient(fx, fy, 0, fx, fy, H * 0.45);
    const fl = 0.85 + 0.15 * Math.sin(t * 13) * Math.sin(t * 7.3);
    pool.addColorStop(0, `rgba(255,140,50,${0.35 * alpha * fl})`);
    pool.addColorStop(1, 'rgba(255,120,40,0)');
    g.fillStyle = pool;
    g.fillRect(fx - H * 0.46, fy - H * 0.46, H * 0.92, H * 0.92);
    // people: four seated, one who rises and looks up
    const person = (pts, x, y, s, flip, head, tilt = 0, headA = 1) => {
      const tx = (px) => x + px * s * flip, ty = (py) => y - py * s;
      // rim light toward the fire
      g.save();
      g.translate(-flip * 2, 0);
      g.fillStyle = `rgba(255,150,70,${0.9 * alpha * fl})`;
      g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(tx(px), ty(py)) : g.moveTo(tx(px), ty(py)))); g.closePath(); g.fill();
      if (headA > 0.01) { g.globalAlpha = headA; g.beginPath(); g.arc(tx(head[0] + tilt * -0.03), ty(head[1] + tilt * 0.02), s * 0.115, 0, TAU); g.fill(); g.globalAlpha = 1; }
      g.restore();
      g.fillStyle = rgba([0.015, 0.012, 0.012], alpha);
      g.beginPath(); pts.forEach(([px, py], i) => (i ? g.lineTo(tx(px), ty(py)) : g.moveTo(tx(px), ty(py)))); g.closePath(); g.fill();
      if (headA > 0.01) { g.globalAlpha = headA; g.beginPath(); g.arc(tx(head[0] + tilt * -0.03), ty(head[1] + tilt * 0.02), s * 0.11, 0, TAU); g.fill(); g.globalAlpha = 1; }
    };
    const s = H * 0.17;
    person(SEATED, fx - W * 0.17, fy + H * 0.02, s, 1, [0.04, 0.92]);
    person(SEATED, fx - W * 0.29, fy + H * 0.05, s * 1.05, 1, [0.04, 0.92]);
    person(SEATED, fx + W * 0.16, fy + H * 0.03, s * 0.95, -1, [0.04, 0.92]);
    person(SEATED, fx + W * 0.08, fy - H * 0.035, s * 0.7, -1, [0.04, 0.92]);
    // the one who stands, and tips their head back to look up
    const k = smoothstep(0, 1, stand);
    const th = lookUp * 0.6, c = Math.cos(th), sn = Math.sin(th);
    const standPts = SEATED_R.map((p, i) => {
      let [qx, qy] = STANDING_R[i];
      if (qy > NECK[1] - 0.02) {
        const dx = qx - NECK[0], dy = qy - NECK[1];
        qx = NECK[0] + dx * c - dy * sn; qy = NECK[1] + dx * sn + dy * c;
      }
      return [lerp(p[0], qx, k), lerp(p[1], qy, k)];
    });
    // the seated head fades into the profile's own head
    person(standPts, fx + W * 0.27, fy + H * 0.045, s * 1.08, -1, [0.04, 0.92], 0, 1 - k);
  }

  /** The fire itself: flames, embers, glow (additive sprites). */
  drawFire(R, { t, alpha }) {
    if (alpha <= 0.01) return;
    const S = R.sprites, W = R.W, H = R.H;
    const fx = W * 0.5, fy = H * 0.8;
    const fl = 0.85 + 0.15 * Math.sin(t * 13) * Math.sin(t * 7.3);
    S.add(fx, fy - H * 0.03, H * 0.35, [1.0, 0.45, 0.15], alpha * 0.25 * fl, SHAPE.glow);
    S.add(fx, fy - H * 0.02, H * 0.1, [1.0, 0.7, 0.3], alpha * 0.8 * fl, SHAPE.glow);
    for (let i = 0; i < 70; i++) {
      const life = 0.7 + 0.5 * hash(i, 1);
      const age = (t * (1 + 0.3 * hash(i, 2)) + hash(i, 3) * life) % life;
      const u = age / life;
      const x = fx + (hash(i, 4) - 0.5) * H * 0.08 * (1 - u) + Math.sin(t * 6 + i) * H * 0.008 * u;
      const y = fy - u * H * 0.12 * (0.7 + 0.6 * hash(i, 5));
      const c = mixc([1.0, 0.9, 0.55], [1.0, 0.3, 0.08], u);
      S.addEx(x, y, H * 0.018 * (1 - u * 0.5), H * 0.03 * (1 - u * 0.4), 0, c, alpha * (1 - u) * 1.3, SHAPE.glow);
    }
    // sparks drift up into the stars
    for (let i = 0; i < 40; i++) {
      const life = 2.5 + 2 * hash(i, 11);
      const age = (t + hash(i, 12) * life) % life;
      const u = age / life;
      const x = fx + (hash(i, 13) - 0.5) * H * 0.05 + Math.sin(t * 1.5 + i) * H * 0.04 * u + u * H * 0.1 * (hash(i, 14) - 0.3);
      const y = fy - H * 0.05 - u * H * 0.5;
      S.add(x, y, 1.6, [1.0, 0.7, 0.35], alpha * (1 - u) * (0.6 + 0.4 * Math.sin(t * 20 + i)) * 1.4, SHAPE.glow);
    }
    // the logs
    S.flush('add');
    R.lines.add(fx - H * 0.05, fy + H * 0.01, fx + H * 0.045, fy - H * 0.005, H * 0.008, [0.25, 0.1, 0.05], alpha, [0.9, 0.35, 0.1], alpha, 0);
    R.lines.add(fx + H * 0.05, fy + H * 0.012, fx - H * 0.04, fy - H * 0.004, H * 0.008, [0.25, 0.1, 0.05], alpha, [0.9, 0.35, 0.1], alpha, 0);
    R.lines.flush('over');
  }
}

