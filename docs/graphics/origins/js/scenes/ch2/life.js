// life.js — Chapter 2, 52–122 s: the early ocean, and the chemistry that
// crossed the line into biology.
//
//   nucleotides link into a strand (a polymer)          72–84 s
//   oily lipids self-assemble into a two-layer bubble    78–92 s
//   inside it, RNA folds into a hairpin — its bases      92–100 s
//     pairing A–U and G–C
//   it opens, and free nucleotides pair along it,        100–110 s
//     zipping up a complementary copy
//   the strands separate; the bubble stretches and       110–122 s
//     begins to pinch in two → Chapter 3
// Everything is a pure function of chapter time.

import { HEADER, NOISE } from '../../gfx/glsl.js';
import { SHAPE } from '../../gfx/renderer.js';
import { hash, clamp, lerp, smoothstep, ease, seg, env, TAU } from '../../lib/math.js';

const OCEAN_FS = `${HEADER}
uniform vec2 u_view;
uniform float u_t, u_bright, u_depth, u_vent;
in vec2 v_px; out vec4 o;
${NOISE}
void main() {
  vec2 uv = v_px / u_view;
  vec2 p = v_px / u_view.y;
  float y = uv.y;
  vec3 top = vec3(0.04, 0.3, 0.38), mid = vec3(0.015, 0.1, 0.17), deep = vec3(0.004, 0.018, 0.04);
  vec3 col = mix(top, mid, smoothstep(-0.1, 0.6, y + u_depth * 0.5));
  col = mix(col, deep, smoothstep(0.45, 1.2, y + u_depth * 0.6));
  float ray = vnoise(vec3((p.x + p.y * 0.4) * 6.0, 0.5, u_t * 0.12));
  ray = pow(ray, 4.0) * (1.0 - smoothstep(0.0, 0.95, y)) * (1.0 - u_depth * 0.8);
  col += vec3(0.2, 0.5, 0.55) * ray * 0.7;
  vec2 cp = p * 11.0 + vec2(u_t * 0.15, u_t * 0.1);
  cp += 0.6 * vec2(vnoise(vec3(cp * 0.35, u_t * 0.3)), vnoise(vec3(cp * 0.35 + 7.0, u_t * 0.3)));
  vec2 w = worley(cp);
  float caus = pow(1.0 - smoothstep(0.0, 0.05, w.y - w.x), 3.0) * (1.0 - smoothstep(0.0, 0.22, y)) * (1.0 - u_depth);
  col += vec3(0.35, 0.75, 0.8) * caus * 0.22;
  // a hydrothermal vent: warm glow, dark mineral plume
  vec2 vp = vec2(0.82, 1.04);
  vec2 dvv = (uv - vp) * vec2(u_view.x / u_view.y, 1.0);
  col += vec3(1.0, 0.42, 0.12) * exp(-length(dvv) * 5.5) * u_vent * 0.55;
  float px = dvv.x, py = -dvv.y;
  float pn = vfbm(vec3(px * 5.0, py * 3.5 - u_t * 0.35, u_t * 0.08));
  float width = 0.03 + py * 0.22;
  float plume = smoothstep(width, 0.0, abs(px + (pn - 0.5) * 0.25 * py)) * smoothstep(0.0, 0.04, py) * (1.0 - smoothstep(0.35, 0.95, py));
  col = mix(col, vec3(0.015, 0.015, 0.02), plume * 0.7 * u_vent);
  col += vec3(1.0, 0.45, 0.15) * plume * exp(-py * 7.0) * u_vent * 0.5;
  o = vec4(col * u_bright, 1.0);
}`;

export const BASE_COLOR = { A: [0.35, 0.95, 0.5], U: [1.0, 0.36, 0.42], G: [1.0, 0.8, 0.28], C: [0.38, 0.62, 1.0] };
const PAIR = { A: 'U', U: 'A', G: 'C', C: 'G' };
const PHOS = [1.0, 0.62, 0.22], SUGAR = [0.95, 0.9, 0.75];

// A hairpin-forming sequence: the second half is the reverse complement of the first.
export const SEQ = 'GCAUGCAAGCAUGC'.split('');
const N = SEQ.length;

/** Draw one nucleotide glyph: phosphate, sugar, and a base pointing along angle beta. */
function glyph(R, x, y, phi, beta, base, s, a, baseGrow = 1) {
  const S = R.sprites, L = R.lines;
  const sx = x + Math.cos(phi) * s * 0.5, sy = y + Math.sin(phi) * s * 0.5;
  L.add(x, y, sx, sy, s * 0.07, SUGAR, a * 0.8, SUGAR, a * 0.8, 0);
  if (baseGrow > 0) {
    const len = s * 0.95 * baseGrow;
    const bx = sx + Math.cos(beta) * len, by = sy + Math.sin(beta) * len;
    const c = BASE_COLOR[base];
    L.add(sx, sy, bx, by, s * 0.3, c, a * 0.35, c, a * 0.35, 1);
    L.add(sx, sy, bx, by, s * 0.14, c, a, c, a, 0);
  }
  S.add(sx, sy, s * 0.22, SUGAR, a * 0.9, SHAPE.ring, 0.25);
  S.add(x, y, s * 0.26, PHOS, a, SHAPE.sphere, 0.6, 0.5);
}

export class OceanLife {
  constructor(R) {
    this.ocean = R.fsProgram(OCEAN_FS, 'ch2-ocean');
  }

  drawOcean(R, T, bright) {
    if (bright <= 0.001) return;
    R.lowres(() => R.pass(this.ocean, {
      u_t: T, u_bright: bright, u_depth: smoothstep(70, 95, T) * 0.7, u_vent: 1 - smoothstep(88, 100, T) * 0.6,
    }), 'add');
    // marine snow
    const S = R.sprites, W = R.W, H = R.H;
    for (let i = 0; i < 160; i++) {
      const x = ((hash(i, 1) * W + T * (6 + 10 * hash(i, 2)) + Math.sin(T * 0.3 + i) * 20) % (W + 40)) - 20;
      const y = ((hash(i, 3) * H + T * (8 + 14 * hash(i, 4))) % (H + 40)) - 20;
      S.add(x, y, 1.2 + 1.8 * hash(i, 5), [0.6, 0.85, 0.9], bright * (0.15 + 0.25 * hash(i, 6)), SHAPE.glow);
    }
    S.flush('add');
  }

  // ── the strand ──────────────────────────────────────────────────────────

  /** Positions of the template strand at time T: [{x, y, phi, beta}] in px. */
  strandPose(T, cx, cy, M, Rv) {
    const out = [];
    const spacing = M * 0.05;
    for (let i = 0; i < N; i++) {
      // A: a gentle wave across the screen
      const ax = cx + (i - (N - 1) / 2) * spacing, ay = cy + M * 0.035 * Math.sin(i * 0.55 + 1);
      const aphi = Math.atan2(M * 0.035 * 0.55 * Math.cos(i * 0.55 + 1), spacing), abeta = aphi + Math.PI / 2;
      // B: curled inside the vesicle
      const ang = Math.PI * 0.95 + (i / (N - 1)) * Math.PI * 1.6;
      const bx = cx + Math.cos(ang) * Rv * 0.5, by = cy + Math.sin(ang) * Rv * 0.5;
      const bphi = ang + Math.PI / 2, bbeta = ang + Math.PI;
      // C: hairpin (stem of 6 pairs, loop of 2)
      const d = Rv * 0.14, x0 = cx - Rv * 0.48;
      let hx, hy, hphi, hbeta;
      if (i < 6) { hx = x0 + i * d; hy = cy - Rv * 0.15; hphi = 0; hbeta = Math.PI / 2; }
      else if (i > 7) { hx = x0 + (13 - i) * d; hy = cy + Rv * 0.15; hphi = Math.PI; hbeta = -Math.PI / 2; }
      else { const la = -Math.PI / 2 + (i - 5.5) * (Math.PI / 3); hx = x0 + 5.6 * d + Math.cos(la) * Rv * 0.17; hy = cy + Math.sin(la) * Rv * 0.17; hphi = la + Math.PI / 2; hbeta = la + Math.PI; }
      // D: extended template for copying
      const tx = cx + (i - (N - 1) / 2) * Rv * 0.11, ty = cy + Rv * 0.135;
      const tphi = 0, tbeta = -Math.PI / 2;
      // E: separated, drifting to the left lobe
      const ex = cx - Rv * 0.62 + (i - (N - 1) / 2) * Rv * 0.045, ey = cy + Rv * 0.05 + Math.sin(i * 0.7) * Rv * 0.05;

      const kB = ease.inOutCubic(seg(T, 84, 90));
      const kC = ease.inOutCubic(seg(T, 92.5, 97.5 + i * 0.05));
      const kD = ease.inOutCubic(seg(T, 100, 102.5));
      const kE = ease.inOutCubic(seg(T, 110.5, 114));
      let x = lerp(ax, bx, kB), y = lerp(ay, by, kB), phi = lerp(aphi, bphi, kB), beta = lerp(abeta, bbeta, kB);
      x = lerp(x, hx, kC); y = lerp(y, hy, kC); phi = lerpAng(phi, hphi, kC); beta = lerpAng(beta, hbeta, kC);
      x = lerp(x, tx, kD); y = lerp(y, ty, kD); phi = lerpAng(phi, tphi, kD); beta = lerpAng(beta, tbeta, kD);
      x = lerp(x, ex, kE); y = lerp(y, ey, kE);
      out.push({ x, y, phi, beta });
    }
    return out;
  }

  /** The complementary copy, built along the template during 102–110 s. */
  copyPose(T, cx, cy, Rv, i) {
    const tx = cx + (i - (N - 1) / 2) * Rv * 0.11, ty = cy - Rv * 0.135;
    const arrive = 102.2 + i * 0.5;
    const u = ease.outCubic(seg(T, arrive - 1.1, arrive));
    const ang = hash(i, 91) * TAU, rr = Rv * (0.45 + 0.3 * hash(i, 92));
    const fx = cx + Math.cos(ang) * rr + Math.sin(T * 0.8 + i) * Rv * 0.04, fy = cy + Math.sin(ang) * rr * 0.8 + Math.cos(T * 0.7 + i) * Rv * 0.04;
    let x = lerp(fx, tx, u), y = lerp(fy, ty, u);
    const ex = cx + Rv * 0.62 + (i - (N - 1) / 2) * Rv * 0.045, ey = cy - Rv * 0.05 + Math.sin(i * 0.7 + 1) * Rv * 0.05;
    const kE = ease.inOutCubic(seg(T, 110.5, 114));
    x = lerp(x, ex, kE); y = lerp(y, ey, kE);
    return { x, y, phi: lerp(hash(i, 93) * TAU, Math.PI, u), beta: lerp(hash(i, 94) * TAU, Math.PI / 2, u), landed: u >= 1, arrive };
  }

  drawStrand(R, T, cx, cy, M, Rv, alpha) {
    if (alpha <= 0.001) return;
    const L = R.lines, S = R.sprites;
    const pose = this.strandPose(T, cx, cy, M, Rv);
    const s = lerp(M * 0.05, Rv * 0.12, smoothstep(84, 90, T)) * lerp(1, 0.55, smoothstep(110.5, 114, T));
    const arrive = (i) => 73 + i * 0.62;
    // backbone links (phosphodiester bonds)
    for (let i = 1; i < N; i++) {
      const since = T - arrive(i) - 0.2;
      if (since < 0) continue;
      const a = pose[i - 1], b = pose[i];
      const sx = a.x + Math.cos(a.phi) * s * 0.5, sy = a.y + Math.sin(a.phi) * s * 0.5;
      L.add(sx, sy, b.x, b.y, s * 0.3, PHOS, alpha * 0.3, PHOS, alpha * 0.3, 1);
      L.add(sx, sy, b.x, b.y, s * 0.08, [1, 0.85, 0.6], alpha, [1, 0.85, 0.6], alpha, 0);
      if (since < 0.5) S.add(b.x, b.y, s * (0.6 + since * 2), [1, 0.9, 0.7], alpha * (1 - since / 0.5) * 1.5, SHAPE.glow);
    }
    L.flush('add');
    S.flush('add');
    // hairpin base pairs
    const pairA = env(T, 96, 100.5, 1.2, 0.8);
    if (pairA > 0) {
      for (let i = 0; i < 6; i++) {
        const a = pose[i], b = pose[13 - i];
        const ta = tip(a, s), tb = tip(b, s);
        L.add(ta[0], ta[1], tb[0], tb[1], s * 0.1, [0.85, 0.95, 1], alpha * pairA * 0.9, [0.85, 0.95, 1], alpha * pairA * 0.9, 1);
      }
      L.flush('add');
    }
    // nucleotides fly in from the edges, then ride the pose
    for (let i = 0; i < N; i++) {
      let { x, y, phi, beta } = pose[i];
      const u = ease.outCubic(seg(T, arrive(i) - 1.4, arrive(i)));
      if (u <= 0) continue;
      if (u < 1) {
        const ang = hash(i, 71) * TAU, dist = M * (0.45 + 0.2 * hash(i, 72));
        x = lerp(x + Math.cos(ang) * dist, x, u);
        y = lerp(y + Math.sin(ang) * dist, y, u);
        phi += (1 - u) * 3; beta += (1 - u) * 3;
      }
      glyph(R, x, y, phi, beta, SEQ[i], s, alpha * Math.min(1, u * 2));
    }
    L.flush('add');
    S.flush('over');
    // the copy
    if (T > 100.5) {
      const cA = alpha * smoothstep(100.5, 101.5, T);
      const cp = [];
      for (let i = 0; i < N; i++) cp.push(this.copyPose(T, cx, cy, Rv, i));
      for (let i = 1; i < N; i++) {
        const since = T - cp[i].arrive - 0.15;
        if (since < 0 || !cp[i - 1].landed) continue;
        const a = cp[i - 1], b = cp[i];
        const sx = a.x + Math.cos(a.phi) * s * 0.5, sy = a.y + Math.sin(a.phi) * s * 0.5;
        L.add(sx, sy, b.x, b.y, s * 0.3, PHOS, cA * 0.3, PHOS, cA * 0.3, 1);
        L.add(sx, sy, b.x, b.y, s * 0.08, [1, 0.85, 0.6], cA, [1, 0.85, 0.6], cA, 0);
      }
      // pairing with the template while they sit together
      const pairB = 1 - smoothstep(110.2, 111.5, T);
      for (let i = 0; i < N; i++) {
        if (!cp[i].landed || pairB <= 0) continue;
        const ta = tip(pose[i], s), tb = tip(cp[i], s);
        const since = T - cp[i].arrive;
        L.add(ta[0], ta[1], tb[0], tb[1], s * 0.1, [0.85, 0.95, 1], cA * pairB * 0.8, [0.85, 0.95, 1], cA * pairB * 0.8, 1);
        if (since < 0.45) S.add((ta[0] + tb[0]) / 2, (ta[1] + tb[1]) / 2, s * 0.9, [0.9, 1, 1], cA * (1 - since / 0.45) * 1.6, SHAPE.glow);
      }
      L.flush('add');
      S.flush('add');
      for (let i = 0; i < N; i++) {
        const c = cp[i];
        glyph(R, c.x, c.y, c.phi, c.beta, PAIR[SEQ[i]], s, cA);
      }
      L.flush('add');
      S.flush('over');
    }
  }

  // ── the membrane ────────────────────────────────────────────────────────

  /** Lipid bilayer: 2 × n lipids scattered, then assembled into a vesicle that later stretches. */
  drawVesicle(R, T, cx, cy, M, Rv, alpha) {
    if (alpha <= 0.001) return;
    const L = R.lines, S = R.sprites;
    const n = Math.round(clamp(Rv * 0.55, 60, 150));
    const c = Rv * 0.74 * ease.inOutCubic(seg(T, 112.5, 122));
    const rr = Rv * lerp(1, 0.8, ease.inOutCubic(seg(T, 112.5, 122)));
    const head = Math.max(2.2, Rv * 0.024), tail = Rv * 0.07;
    const glowA = alpha * smoothstep(88, 91, T);
    const heads = [];
    for (let leaf = 0; leaf < 2; leaf++) {
      for (let i = 0; i < n; i++) {
        const th = (i / n) * TAU + leaf * (Math.PI / n);
        const k = hash(i + leaf * 500, 31);
        // where this lipid ends up on the (possibly stretched) contour
        const cth = Math.cos(th), sth = Math.sin(th);
        const disc = Math.max(0, rr * rr - c * c * sth * sth);
        const rho = Math.abs(cth) * c + Math.sqrt(disc);
        const px = cx + cth * rho, py = cy + sth * rho;
        const ox = cth * rho - Math.sign(cth || 1) * c, oy = sth * rho;
        const nl = Math.hypot(ox, oy) || 1, nx = ox / nl, ny = oy / nl;
        const out = leaf === 0 ? 1 : -1;
        const tx = px + nx * out * tail * 1.05, ty = py + ny * out * tail * 1.05;
        const tang = Math.atan2(-ny * out, -nx * out);
        // scattered start, drifting
        const sx = cx + (hash(i + leaf * 500, 32) - 0.5) * R.W * 1.1 + Math.sin(T * 0.4 + k * 9) * 30;
        const sy = cy + (hash(i + leaf * 500, 33) - 0.5) * R.H * 1.1 + Math.cos(T * 0.35 + k * 7) * 30;
        const sang = k * TAU + T * 0.5;
        // zip closed around the circle
        const start = 82 + 5.5 * ((th / TAU + 0.15 * k) % 1);
        const u = ease.inOutCubic(seg(T, start, start + 2.6));
        const x = lerp(sx, tx, u), y = lerp(sy, ty, u), ang = lerpAng(sang, tang, u);
        const a = alpha * smoothstep(78, 80.5, T + k);
        const wig = Math.sin(T * 3 + k * 20) * (1 - u * 0.7) * 0.25;
        for (const side of [-1, 1]) {
          const bx = x + Math.cos(ang + Math.PI / 2) * head * 0.5 * side, by = y + Math.sin(ang + Math.PI / 2) * head * 0.5 * side;
          const ex = bx + Math.cos(ang + wig * side) * tail, ey = by + Math.sin(ang + wig * side) * tail;
          L.add(bx, by, ex, ey, Math.max(0.6, head * 0.22), [1.0, 0.92, 0.6], a * 0.75, [0.9, 0.8, 0.5], a * 0.25, 0);
        }
        heads.push(x, y, a);
        // a faint glow along the membrane once it has closed
        if (glowA > 0) S.add(px, py, tail * 1.4, [0.4, 0.75, 1.0], glowA * 0.05, SHAPE.glow);
      }
    }
    L.flush('add');
    S.flush('add');
    for (let k = 0; k < heads.length; k += 3) {
      S.add(heads[k], heads[k + 1], head, [0.55, 0.85, 1.0], heads[k + 2], SHAPE.sphere, 0.5, 0.6);
    }
    S.flush('over');
  }
}

function lerpAng(a, b, t) {
  let d = ((b - a) % TAU + TAU * 1.5) % TAU - Math.PI;
  return a + d * t;
}
function tip(p, s) {
  const sx = p.x + Math.cos(p.phi) * s * 0.5, sy = p.y + Math.sin(p.phi) * s * 0.5;
  return [sx + Math.cos(p.beta) * s * 0.95, sy + Math.sin(p.beta) * s * 0.95];
}
