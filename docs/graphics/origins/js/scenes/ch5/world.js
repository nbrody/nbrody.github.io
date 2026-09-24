// world.js — Chapter 5, 0–40 s: minds connect into a network; the network
// settles into villages and cities joined by roads; pull back to the Earth at
// night — eight billion people, city lights and the arcs between them.

import { HEADER, NOISE } from '../../gfx/glsl.js';
import { SHAPE } from '../../gfx/renderer.js';
import { RNG, TAU, lerp, smoothstep, hash } from '../../lib/math.js';

const GLOBE_FS = `${HEADER}
uniform vec2 u_view, u_c;
uniform float u_R, u_t, u_spin, u_bright, u_lights;
in vec2 v_px; out vec4 o;
${NOISE}
vec3 rotY(vec3 n, float a) { return vec3(n.x * cos(a) + n.z * sin(a), n.y, -n.x * sin(a) + n.z * cos(a)); }
void main() {
  vec2 d = (v_px - u_c) / u_R;
  float r = length(d);
  vec3 col = vec3(0.0);
  if (r < 1.0) {
    vec3 n = vec3(d.x, -d.y, sqrt(1.0 - r * r));
    vec3 sn = rotY(n, u_spin);
    sn = vec3(sn.x, sn.y * cos(0.35) - sn.z * sin(0.35), sn.y * sin(0.35) + sn.z * cos(0.35));
    float h = sfbm(sn * 1.7 + 7.0) + 0.3 * sfbm(sn * 4.5 + 2.0);
    float land = smoothstep(0.02, 0.07, h);
    float pop = smoothstep(0.35, 0.75, vfbm(sn * 4.0 + 11.0)) * land;
    float city = pow(vnoise(sn * 55.0), 5.0) * 3.0 + pow(vnoise(sn * 140.0), 8.0) * 5.0;
    vec3 ground = mix(vec3(0.005, 0.01, 0.025), vec3(0.03, 0.03, 0.035), land);
    col = ground + vec3(1.0, 0.7, 0.35) * city * pop * u_lights;
    col += vec3(1.0, 0.55, 0.25) * pop * 0.05 * u_lights;
    // dawn creeping over the right limb
    float dawn = smoothstep(0.55, 1.0, n.x) * 0.5;
    col += vec3(0.25, 0.4, 0.7) * dawn * (1.0 - land * 0.5) * 0.4 + vec3(0.6, 0.45, 0.3) * dawn * land * 0.25;
    float rim = pow(1.0 - n.z, 4.0);
    col += vec3(0.25, 0.45, 1.0) * rim * 0.6;
  }
  float halo = exp(-max(r - 1.0, 0.0) * 28.0) * smoothstep(0.97, 1.0, r);
  col += vec3(0.3, 0.55, 1.0) * halo * (0.5 + 0.5 * smoothstep(-0.2, 0.8, d.x));
  o = vec4(col * u_bright, 1.0);
}`;

/** The seven minds Chapter 4 ended on (fractions of W, H from centre). */
export const FIRST_MINDS = [
  [-0.2, 0], [0.28, -0.06], [0.1, -0.32], [0.16, 0.3], [0.42, 0.2], [-0.02, -0.12], [-0.36, -0.28],
];

export class World {
  constructor(R) {
    this.globe = R.fsProgram(GLOBE_FS, 'ch5-globe');
    const rng = new RNG(7777);
    // minds: the first seven, then many more
    this.nodes = FIRST_MINDS.map(([x, y], i) => ({ x, y, t: -1, i, hue: rng.range(0, 1) }));
    while (this.nodes.length < 150) {
      this.nodes.push({ x: rng.range(-0.47, 0.47), y: rng.range(-0.43, 0.43), t: rng.range(1.5, 13), i: this.nodes.length, hue: rng.next() });
    }
    // settlements: each mind moves to one of a dozen towns
    this.towns = [];
    for (let k = 0; k < 12; k++) this.towns.push({ x: rng.range(-0.4, 0.4), y: rng.range(-0.35, 0.35), size: rng.range(0.6, 1.4) });
    for (const n of this.nodes) {
      let best = 0, bd = 1e9;
      this.towns.forEach((t, k) => { const d = (t.x - n.x) ** 2 + (t.y - n.y) ** 2; if (d < bd) { bd = d; best = k; } });
      n.town = best;
      const a = rng.range(0, TAU), rr = Math.sqrt(rng.next()) * 0.045 * this.towns[best].size;
      n.tx = this.towns[best].x + Math.cos(a) * rr;
      n.ty = this.towns[best].y + Math.sin(a) * rr * 0.8;
    }
    // friendships: each mind links to its three nearest
    this.edges = [];
    for (const n of this.nodes) {
      const near = this.nodes.filter((m) => m !== n).map((m) => [m, (m.x - n.x) ** 2 + (m.y - n.y) ** 2]).sort((a, b) => a[1] - b[1]).slice(0, 3);
      for (const [m] of near) if (n.i < m.i || !this.edges.some((e) => e[0] === m && e[1] === n)) this.edges.push([n, m]);
    }
    // roads between towns: a spanning tree plus a few shortcuts
    this.roads = [];
    const inTree = new Set([0]);
    while (inTree.size < this.towns.length) {
      let best = null, bd = 1e9;
      for (const a of inTree) for (let b = 0; b < this.towns.length; b++) {
        if (inTree.has(b)) continue;
        const d = (this.towns[a].x - this.towns[b].x) ** 2 + (this.towns[a].y - this.towns[b].y) ** 2;
        if (d < bd) { bd = d; best = [a, b]; }
      }
      this.roads.push(best);
      inTree.add(best[1]);
    }
    for (let k = 0; k < 5; k++) this.roads.push([rng.int(0, 11), rng.int(0, 11)]);
    // cities on the globe, for flight arcs
    this.cities = [];
    for (let k = 0; k < 26; k++) {
      const d = rng.dir3();
      this.cities.push([d[0], d[1] * 0.8, d[2]]);
    }
    this.flights = [];
    for (let k = 0; k < 40; k++) this.flights.push([rng.int(0, 25), rng.int(0, 25), rng.range(0, 1), rng.range(0.12, 0.25)]);
  }

  /** Minds and their links; settle = 0 (free network) … 1 (towns and roads). */
  drawNetwork(R, T, { alpha, settle, cx, cy, W, H, pulse }) {
    if (alpha <= 0.001) return;
    const S = R.sprites, L = R.lines;
    const pos = (n) => {
      const x = lerp(n.x, n.tx, settle), y = lerp(n.y, n.ty, settle);
      const wob = 0.004 * (1 - settle);
      return [cx + (x + Math.sin(T * 0.7 + n.i) * wob) * W, cy + (y + Math.cos(T * 0.6 + n.i * 1.3) * wob) * H];
    };
    const vis = (n) => (n.t < 0 ? 1 : smoothstep(n.t, n.t + 1.2, T));
    // links between minds fade as roads take over
    for (const [a, b] of this.edges) {
      const v = Math.min(vis(a), vis(b)) * (1 - settle * 0.85);
      if (v <= 0.01) continue;
      const pa = pos(a), pb = pos(b);
      L.add(pa[0], pa[1], pb[0], pb[1], 0.9, [1, 0.8, 0.6], alpha * v * 0.35, [1, 0.8, 0.6], alpha * v * 0.35, 0);
      const u = (T * 0.35 + hash(a.i, b.i)) % 1;
      S.add(lerp(pa[0], pb[0], u), lerp(pa[1], pb[1], u), 2.2, [1, 0.9, 0.7], alpha * v * 0.8, SHAPE.glow);
    }
    // roads
    if (settle > 0.01) {
      for (const [a, b] of this.roads) {
        const ta = this.towns[a], tb = this.towns[b];
        const x0 = cx + ta.x * W, y0 = cy + ta.y * H, x1 = cx + tb.x * W, y1 = cy + tb.y * H;
        const grow = smoothstep(0, 1, settle);
        L.add(x0, y0, lerp(x0, x1, grow), lerp(y0, y1, grow), 1.1, [1, 0.75, 0.4], alpha * 0.55 * settle, [1, 0.75, 0.4], alpha * 0.55 * settle, 0);
        L.add(x0, y0, lerp(x0, x1, grow), lerp(y0, y1, grow), 6, [1, 0.6, 0.3], alpha * 0.1 * settle, [1, 0.6, 0.3], alpha * 0.1 * settle, 1);
        for (let j = 0; j < 3; j++) {
          const u = (T * 0.12 + j / 3 + hash(a, b)) % 1;
          if (u > grow) continue;
          S.add(lerp(x0, x1, u), lerp(y0, y1, u), 1.8, [1, 0.95, 0.8], alpha * settle, SHAPE.glow);
        }
      }
      // town glow grows as they become cities
      for (const t of this.towns) {
        S.add(cx + t.x * W, cy + t.y * H, H * 0.05 * t.size * settle, [1, 0.7, 0.35], alpha * 0.35 * settle, SHAPE.glow);
      }
    }
    L.flush('add');
    for (const n of this.nodes) {
      const v = vis(n);
      if (v <= 0.01) continue;
      const [x, y] = pos(n);
      const warm = [1, lerp(0.75, 0.9, n.hue), lerp(0.5, 0.8, n.hue)];
      S.add(x, y, 9 * (1 - settle * 0.5), warm, alpha * v * (0.25 + 0.2 * pulse), SHAPE.glow);
      S.add(x, y, 2.2, [1, 0.95, 0.85], alpha * v * 1.4, SHAPE.glow);
    }
    S.flush('add');
  }

  drawGlobe(R, T, { cx, cy, radius, spin, alpha, lights }) {
    if (alpha <= 0.001) return;
    R.lowres(() => R.pass(this.globe, { u_c: [cx, cy], u_R: radius, u_t: T, u_spin: spin, u_bright: alpha, u_lights: lights }), 'add');
    // flight arcs over the visible hemisphere
    const L = R.lines, S = R.sprites;
    const proj = (p) => {
      const x = p[0] * Math.cos(spin) - p[2] * Math.sin(spin), z = p[0] * Math.sin(spin) + p[2] * Math.cos(spin);
      const y = p[1] * Math.cos(0.35) + z * Math.sin(0.35), z2 = -p[1] * Math.sin(0.35) + z * Math.cos(0.35);
      return [cx + x * radius, cy - y * radius, z2];
    };
    for (const [ia, ib, ph, hgt] of this.flights) {
      const a = this.cities[ia], b = this.cities[ib];
      const pa = proj(a), pb = proj(b);
      if (pa[2] < 0.15 || pb[2] < 0.15 || ia === ib) continue;
      const m = [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2, (a[2] + b[2]) / 2];
      const ml = Math.hypot(...m) || 1;
      const lift = 1 + hgt;
      const pm = proj([(m[0] / ml) * lift, (m[1] / ml) * lift, (m[2] / ml) * lift]);
      let px = pa[0], py = pa[1];
      for (let k = 1; k <= 16; k++) {
        const u = k / 16, v = 1 - u;
        const qx = v * v * pa[0] + 2 * v * u * pm[0] + u * u * pb[0], qy = v * v * pa[1] + 2 * v * u * pm[1] + u * u * pb[1];
        L.add(px, py, qx, qy, 0.7, [1, 0.8, 0.5], alpha * lights * 0.35, [1, 0.8, 0.5], alpha * lights * 0.35, 0);
        px = qx; py = qy;
      }
      const u = (T * 0.12 + ph) % 1, v = 1 - u;
      S.add(v * v * pa[0] + 2 * v * u * pm[0] + u * u * pb[0], v * v * pa[1] + 2 * v * u * pm[1] + u * u * pb[1], 2.4, [1, 0.95, 0.8], alpha * lights * 1.3, SHAPE.glow);
    }
    L.flush('add');
    S.flush('add');
  }
}

