// Figure 1 — Lemma 2.1 (expansion formula) on the right-angled dodecahedral reflection group Γ.
// The point at depth t on the ray o→x is folded into the fundamental dodecahedron D by reflections;
// the folding product is h = v⁻¹ (v carries D to the tile containing the ray point), and h acts on
// the sphere at infinity as a Möbius or anti-Möbius map (a 4×4 Lorentz matrix on null vectors).
// The visual metric is d(y,z) = ½|y−z| = e^{−(y|z)_o}, and R = e^{−t}.
import { el, labelLayer, slider, button, controls, setTex, palette, onTheme, hexToRgb, pointer } from './common.js';

// ───────────────────────── pure math (node-testable) ─────────────────────────

export const PHI = (1 + Math.sqrt(5)) / 2;
/** tanh of the inradius of the regular right-angled dodecahedron. */
export const TANH_IN = Math.pow(5, -0.25);
export const INRADIUS = Math.atanh(TANH_IN);

/** Minkowski product ⟨a,b⟩ = a·b − a₃b₃ (signature +++−); the hyperboloid is ⟨P,P⟩ = −1, P₃ > 0. */
export const mink = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] - a[3] * b[3];

/** Unit outward Euclidean face normals of the dodecahedron (the 12 icosahedron vertices). */
export function faceDirections() {
  const U = [];
  for (const s1 of [1, -1]) for (const s2 of [1, -1]) {
    U.push([0, s1, s2 * PHI]); U.push([s1, s2 * PHI, 0]); U.push([s2 * PHI, 0, s1]);
  }
  return U.map((v) => { const n = Math.hypot(...v); return v.map((c) => c / n); });
}

/** The 12 spacelike face normals n_i, ⟨n_i,n_i⟩ = 1; D = {P : ⟨P,n_i⟩ ≤ 0 for all i} contains o. */
export function faceNormals() {
  const ch = 1 / Math.sqrt(1 - TANH_IN * TANH_IN), sh = TANH_IN * ch;
  return faceDirections().map((u) => [ch * u[0], ch * u[1], ch * u[2], sh]);
}
export const NORMALS = faceNormals();

// 4×4 matrices: row-major arrays of 16 numbers.
export const identity4 = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
export function matMul(A, B) {
  const C = new Array(16).fill(0);
  for (let i = 0; i < 4; i++) for (let k = 0; k < 4; k++) {
    const a = A[4 * i + k];
    if (a) for (let j = 0; j < 4; j++) C[4 * i + j] += a * B[4 * k + j];
  }
  return C;
}
export const matVec = (M, v) => [0, 1, 2, 3].map((i) => M[4 * i] * v[0] + M[4 * i + 1] * v[1] + M[4 * i + 2] * v[2] + M[4 * i + 3] * v[3]);
/** Inverse of a Lorentz matrix: J Mᵀ J with J = diag(1,1,1,−1). */
export function lorentzInverse(M) {
  const s = (i) => (i === 3 ? -1 : 1), out = new Array(16);
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) out[4 * i + j] = s(i) * s(j) * M[4 * j + i];
  return out;
}
export function det4(M) {
  const a = M.slice();
  let det = 1;
  for (let c = 0; c < 4; c++) {
    let p = c;
    for (let r = c + 1; r < 4; r++) if (Math.abs(a[4 * r + c]) > Math.abs(a[4 * p + c])) p = r;
    if (Math.abs(a[4 * p + c]) < 1e-300) return 0;
    if (p !== c) { for (let j = 0; j < 4; j++) { const t = a[4 * c + j]; a[4 * c + j] = a[4 * p + j]; a[4 * p + j] = t; } det = -det; }
    det *= a[4 * c + c];
    for (let r = c + 1; r < 4; r++) {
      const f = a[4 * r + c] / a[4 * c + c];
      for (let j = c; j < 4; j++) a[4 * r + j] -= f * a[4 * c + j];
    }
  }
  return det;
}

/** The reflection in the wall n: P ↦ P − 2⟨P,n⟩n, as a matrix. */
export function reflection(n) {
  const Jn = [n[0], n[1], n[2], -n[3]], M = identity4();
  for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) M[4 * i + j] -= 2 * n[i] * Jn[j];
  return M;
}
export const REFLECTIONS = NORMALS.map(reflection);

/** Circumradius ρ of D (distance from o to a vertex), from three mutually perpendicular faces. */
function circumradius() {
  const U = faceDirections();
  const adj = (a, b) => Math.abs(mink(NORMALS[a], NORMALS[b])) < 1e-9;
  for (let a = 0; a < 12; a++) for (let b = a + 1; b < 12; b++) for (let c = b + 1; c < 12; c++) {
    if (!(adj(a, b) && adj(a, c) && adj(b, c))) continue;
    const s = [0, 1, 2].map((k) => U[a][k] + U[b][k] + U[c][k]), m = Math.hypot(...s);
    return Math.atanh(TANH_IN / ((s[0] * U[a][0] + s[1] * U[a][1] + s[2] * U[a][2]) / m));
  }
  throw new Error('no vertex');
}
export const CIRCUMRADIUS = circumradius();

// The band for (2.2). h = A∘T with T the translation taking the ray point to o and A moving o by
// δ = d(o, hP_t) ≤ ρ; T alone gives ratios in [1/2, 1], and A's conformal factor lies in [e^{−δ}, e^{δ}].
export const EPS_STAR = 0.5;                           // the far region is {d(x,·) ≥ ε*}
export const C_E = 0.5 * Math.exp(-CIRCUMRADIUS);      // c_E = ½e^{−ρ}
export const C_E_UP = Math.exp(CIRCUMRADIUS);          // C_E = e^{ρ}
export const PUNCT_UP = C_E_UP / EPS_STAR;             // (2.3): d(hy,p)D_y/R ≤ C_E/ε*
export const PUNCT_LO = C_E / 2;                       // and ≥ c_E/2 when d(x,y) ≤ ε*/2

export const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
export const norm3 = (v) => { const n = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / n, v[1] / n, v[2] / n]; };
export const cross3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
/** The visual metric: half the chord, = e^{−(y|z)_o} = sin(angle/2). */
export const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / 2;

/** The point at hyperbolic distance t from o toward the unit vector x. */
export const rayPoint = (x, t) => [Math.sinh(t) * x[0], Math.sinh(t) * x[1], Math.sinh(t) * x[2], Math.cosh(t)];

/**
 * Fold P into D: while P is beyond some wall of D, reflect it there. Each step crosses one wall
 * separating P from D, so the word is reduced. order: 'first' | 'last' | 'max' (which violated wall).
 * Returns { word: [i₁,…,i_m] (applied in this order), h = r_{i_m}⋯r_{i₁}, Q = hP ∈ D }.
 * Then v = h⁻¹ = s_{i₁}⋯s_{i_m} carries D to the tile containing P.
 */
export function fold(P, { order = 'first', maxSteps = 4000 } = {}) {
  let Q = P.slice();
  const word = [];
  for (let step = 0; step < maxSteps; step++) {
    let pick = -1, best = 1e-12 * Q[3];
    for (let i = 0; i < 12; i++) {
      const d = mink(Q, NORMALS[i]);
      if (d > best) {
        pick = i;
        if (order === 'first') break;
        if (order === 'max') best = d;
      }
    }
    if (pick < 0) break;
    const n = NORMALS[pick], d = 2 * mink(Q, n);
    Q = [Q[0] - d * n[0], Q[1] - d * n[1], Q[2] - d * n[2], Q[3] - d * n[3]];
    word.push(pick);
  }
  let h = identity4();
  for (const i of word) h = matMul(REFLECTIONS[i], h);
  return { word, h, Q };
}

/** Is the point inside D (all face inequalities, up to tol)? */
export const insideD = (Q, tol = 1e-9) => NORMALS.every((n) => mink(Q, n) <= tol * Math.max(1, Q[3]));

/** The group element of Lemma 2.1 for the boundary point x at depth t. */
export function expansionAt(x, t) {
  const { word, h, Q } = fold(rayPoint(x, t));
  return { word, h, v: lorentzInverse(h), Q, delta: Math.acosh(Math.max(1, Q[3])), det: det4(h), R: Math.exp(-t) };
}

/** A Lorentz matrix on the sphere at infinity: ξ ↦ Y/Y₃ with Y = M(ξ,1); also its conformal factor 1/Y₃. */
export function actOnBoundary(M, xi) {
  const Y = matVec(M, [xi[0], xi[1], xi[2], 1]);
  return { point: [Y[0] / Y[3], Y[1] / Y[3], Y[2] / Y[3]], lambda: 1 / Y[3], null: mink(Y, Y), time: Y[3] };
}
export const act = (M, xi) => actOnBoundary(M, xi).point;

/**
 * The image under M of the cap {ξ : ⟨(ξ,1),N⟩ ≥ 0}: a cap {ξ·m ≥ k}. Returns its centre, cos of
 * its angular radius, and its radius in the visual metric.
 */
export function capImage(M, N) {
  const MN = matVec(M, N), m = [MN[0], MN[1], MN[2]], len = Math.hypot(...m);
  const cosA = Math.max(-1, Math.min(1, MN[3] / len));
  return { center: [m[0] / len, m[1] / len, m[2] / len], cosA, radius: Math.sqrt((1 - cosA) / 2) };
}
/** N for the ball B(c, r) = {d(c,·) ≤ r} and for the far region {d(c,·) ≥ r}. */
export const ballN = (c, r) => [c[0], c[1], c[2], 1 - 2 * r * r];
export const farN = (c, r) => [-c[0], -c[1], -c[2], -(1 - 2 * r * r)];

export function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function randomUnit(rng) {
  const z = 2 * rng() - 1, a = 2 * Math.PI * rng(), r = Math.sqrt(1 - z * z);
  return [r * Math.cos(a), r * Math.sin(a), z];
}
/** A unit tangent at x, from a random direction. */
function randomTangent(x, rng) {
  for (;;) {
    const u = randomUnit(rng), d = dot3(u, x), t = [u[0] - d * x[0], u[1] - d * x[1], u[2] - d * x[2]];
    if (Math.hypot(...t) > 1e-3) return norm3(t);
  }
}
/** The point at visual distance s from x in the unit tangent direction e. */
export function pointAt(x, e, s) {
  const th = 2 * Math.asin(Math.min(1, s)), c = Math.cos(th), si = Math.sin(th);
  return norm3([c * x[0] + si * e[0], c * x[1] + si * e[1], c * x[2] + si * e[2]]);
}

/**
 * The live checks of Lemma 2.1 at (x, t) with far point z0. n random pairs y,z: each point is
 * uniform on S² or, half the time, at distance R·2^u from x with u uniform in [−4, 4].
 * ratio = d(hy,hz)·D_y·D_z / (R·d(y,z)) ∈ [c_E, C_E]                     (2.2)
 * punct = d(hy,p)·D_y / R ≤ C_E/eps, and ≥ c_E/2 when d(x,y) ≤ eps/2 (p = hz0, eps = ε_*)  (2.3)
 */
export function expansionStats(x, t, z0, { n = 200, seed = 1, E = expansionAt(x, t) } = {}) {
  const { h } = E, R = Math.exp(-t), rng = mulberry32(seed);
  const p = act(h, z0);
  const sample = () => (rng() < 0.5 ? randomUnit(rng) : pointAt(x, randomTangent(x, rng), R * Math.pow(2, 8 * rng() - 4)));
  const D = (y) => Math.max(R, dist(x, y));
  let min = Infinity, max = -Infinity, pMax = -Infinity, pNearMin = Infinity, nNear = 0, pairs = 0;
  for (let i = 0; i < n; i++) {
    const y = sample(), z = sample(), dyz = dist(y, z);
    if (!(dyz > 1e-13)) continue;
    const hy = act(h, y), hz = act(h, z);
    const ratio = (dist(hy, hz) * D(y) * D(z)) / (R * dyz);
    pairs++;
    if (ratio < min) min = ratio;
    if (ratio > max) max = ratio;
    for (const [w, hw] of [[y, hy], [z, hz]]) {
      const q = (dist(hw, p) * D(w)) / R;
      if (q > pMax) pMax = q;
      if (dist(x, w) <= EPS_STAR / 2) { nNear++; if (q < pNearMin) pNearMin = q; }
    }
  }
  return {
    R, pairs, min, max, p, pMax, pNearMin, nNear,
    ok22: min >= C_E && max <= C_E_UP,
    ok23: pMax <= PUNCT_UP && (nNear === 0 || pNearMin >= PUNCT_LO),
    farOk: dist(x, z0) >= EPS_STAR - 1e-12,
  };
}

/** The 60 points where two perpendicular face circles of D cross (ends of the lines through edges). */
export function crossingPoints() {
  const U = faceDirections(), out = [];
  for (let a = 0; a < 12; a++) for (let b = a + 1; b < 12; b++) {
    if (Math.abs(mink(NORMALS[a], NORMALS[b])) > 1e-9) continue;
    const s = [U[a][0] + U[b][0], U[a][1] + U[b][1], U[a][2] + U[b][2]];
    const c = TANH_IN / (1 + dot3(U[a], U[b]));
    const w = norm3(cross3(U[a], U[b])), d = Math.sqrt(Math.max(0, 1 - c * c * dot3(s, s)));
    for (const sg of [1, -1]) out.push(norm3([c * s[0] + sg * d * w[0], c * s[1] + sg * d * w[1], c * s[2] + sg * d * w[2]]));
  }
  return out;
}

/** TeX for v = s_{i₁}⋯s_{i_m} (1-based), shortened in the middle when long. */
export function wordTex(word, maxShown = 9) {
  if (!word.length) return 'e';
  const s = (i) => `s_{${i + 1}}`;
  if (word.length <= maxShown) return word.map(s).join('');
  return word.slice(0, maxShown - 2).map(s).join('') + '\\cdots ' + s(word[word.length - 1]);
}

// ───────────────────────── 3×3 helpers for the views ─────────────────────────

const m3mul = (A, B) => {
  const C = new Array(9).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) C[3 * i + j] += A[3 * i + k] * B[3 * k + j];
  return C;
};
const m3vec = (A, v) => [A[0] * v[0] + A[1] * v[1] + A[2] * v[2], A[3] * v[0] + A[4] * v[1] + A[5] * v[2], A[6] * v[0] + A[7] * v[1] + A[8] * v[2]];
const m3T = (A) => [A[0], A[3], A[6], A[1], A[4], A[7], A[2], A[5], A[8]];
function axisAngle(axis, ang) {
  const [x, y, z] = norm3(axis), c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
  return [t * x * x + c, t * x * y - s * z, t * x * z + s * y,
    t * x * y + s * z, t * y * y + c, t * y * z - s * x,
    t * x * z - s * y, t * y * z + s * x, t * z * z + c];
}
function rotTaking(a, b) { // the rotation taking unit a to unit b
  const ax = cross3(a, b), s = Math.hypot(...ax), c = dot3(a, b);
  if (s < 1e-12) return [1, 0, 0, 0, 1, 0, 0, 0, 1];
  return axisAngle(ax, Math.atan2(s, c));
}
/** View→world rotation with columns right, up, toward the viewer. */
const frame = (right, up, out) => [right[0], up[0], out[0], right[1], up[1], out[1], right[2], up[2], out[2]];
const tangentAt = (c, v) => { const d = dot3(v, c); return norm3([v[0] - d * c[0], v[1] - d * c[1], v[2] - d * c[2]]); };

// ───────────────────────── shader ─────────────────────────

const VS = `#version 300 es
in vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float;
uniform vec4 uN[12];
uniform vec2 uGC; uniform float uGR;            // globe centre and radius (device px)
uniform mat3 uRot;                              // view -> world
uniform vec2 uIC; uniform float uIR;            // inset centre and radius (device px)
uniform vec3 uIc, uIe1, uIe2; uniform float uIrho;   // inset: centre on S^2, frame, radius (visual metric)
uniform mat4 uV;                                // pull back to the source sphere (identity there)
uniform vec4 uVc;                               // uV (c,1) for the inset centre c, computed in double
uniform vec3 uX; uniform float uR, uLe, uDpr, uDetail;
uniform vec3 uBase, uLine, uU, uMu, uRim;
uniform float uFillU, uFillMu, uLineA;
out vec4 frag;

float mdot(vec4 a, vec4 b) { return dot(a.xyz, b.xyz) - a.w * b.w; }

// The depth-T point of the ray o->xi, folded into D. Returns (signed sinh of the distance to the
// nearest wall of its tile, |<tangent of the ray, that wall's normal>|). The sign is the parity of
// the fold, so it changes across every wall and the screen derivative stays honest there; the second
// number is 0 when the ray runs along the wall (a true trace on the sphere) and 1 when it hits it head on.
// P = (e^T/2)(A + eps B) with A = (xi,1), B = (-xi,1), eps = e^{-2T}: folding A and B separately keeps the
// depth, which (sinh T xi, cosh T) loses in float32 beyond T ~ 7.
vec2 wallDist(vec3 xi, float T) {
  vec4 A = vec4(xi, 1.0), B = vec4(-xi, 1.0);
  float eps = exp(-2.0 * T);
  float par = 1.0;
  for (int it = 0; it < 40; it++) {
    bool moved = false;
    for (int i = 0; i < 12; i++) {
      float da = mdot(A, uN[i]), db = mdot(B, uN[i]);
      if (da + eps * db > 1e-6 * (A.w + eps * B.w)) {
        A -= 2.0 * da * uN[i]; B -= 2.0 * db * uN[i]; par = -par; moved = true;
      }
    }
    if (!moved) break;
  }
  float k = 0.5 * exp(T);
  vec4 P = k * (A + eps * B), V = k * (A - eps * B);
  float dmin = 1e9, ob = 0.0;
  for (int i = 0; i < 12; i++) {
    float a = abs(mdot(P, uN[i]));
    if (a < dmin) { dmin = a; ob = abs(mdot(V, uN[i])); }
  }
  return vec2(par * dmin, ob);
}

float cover(float distPx, float halfW) { return clamp(halfW - distPx + 0.5, 0.0, 1.0); }

void main() {
  vec2 q = gl_FragCoord.xy;
  vec2 gp = (q - uGC) / uGR; float gr = length(gp);
  vec2 ip = (q - uIC) / max(uIR, 1e-3); float ir = uIR > 0.0 ? length(ip) : 1e9;
  bool inI = ir < 1.0;
  vec2 gpc = gr > 0.999 ? gp * (0.999 / gr) : gp;
  vec3 vv = vec3(gpc, sqrt(max(0.0, 1.0 - dot(gpc, gpc))));
  vec3 xiG = uRot * vv;
  float rr = min(ir, 1.0);
  float th = 2.0 * asin(min(uIrho * rr, 1.0));
  vec2 dir = ir > 1e-6 ? ip / ir : vec2(1.0, 0.0);
  float sh2 = sin(0.5 * th);
  vec3 dI = -2.0 * sh2 * sh2 * uIc + sin(th) * (dir.x * uIe1 + dir.y * uIe2);   // xiI - c, no cancellation
  vec3 xiI = uIc + dI;
  vec3 xi = inI ? xiI : xiG;
  bool live = inI || gr < 1.0 + 2.0 / uGR;

  // the traces of the walls on the sphere, at a depth matched to the pixel scale
  // visual size of a device pixel there (smooth, so the depth does not jump from quad to quad)
  float sig = inI ? uIrho / uIR : 0.5 / (uGR * sqrt(max(vv.z, 0.02)));
  float T = clamp(-log(sig * uDetail), 0.6, 12.5);
  vec2 wF = live ? wallDist(xi, T) : vec2(1.0, 1.0);
  vec2 wC = live ? wallDist(xi, T - 1.5) : vec2(1.0, 1.0);
  float lineF = cover(abs(wF.x) / max(fwidth(wF.x), 1e-7), 0.42 * uDpr) * (1.0 - smoothstep(0.35, 0.8, wF.y));
  float lineC = cover(abs(wC.x) / max(fwidth(wC.x), 1e-7), 0.62 * uDpr) * (1.0 - smoothstep(0.45, 0.9, wC.y));

  // source coordinates (the target pulls back by v = h^-1). Near p, v expands by ~1/R, so the inset
  // adds v(dI,0) to the exactly computed v(c,1) instead of cancelling large terms in float.
  vec4 Y = inI ? uVc + uV * vec4(dI, 0.0) : uV * vec4(xi, 1.0);
  vec3 y = Y.xyz / Y.w;
  float s = 0.5 * length(y - uX);
  float l = log2(max(s, 1e-30) / uR);            // D_y = 2^l R outside the ball
  float fl = max(fwidth(l), 1e-6);

  vec3 col = uBase;
  if (!inI) col *= 0.94 + 0.06 * vv.z;
  col = mix(col, uU, uFillU * clamp(0.5 - l / fl, 0.0, 1.0));
  col = mix(col, uMu, uFillMu * clamp(0.5 + (l - uLe) / fl, 0.0, 1.0));
  col = mix(col, uLine, 0.32 * uLineA * lineF);
  col = mix(col, uLine, 0.85 * uLineA * lineC);
  // the rings D_y = 2^k R
  float fade = smoothstep(3.0 * uDpr, 8.0 * uDpr, 1.0 / fl);
  float k = floor(l + 0.5);
  if (k >= -3.0 && k < uLe - 0.35 && k != 0.0) {
    vec3 rc = k < 0.0 ? uU : mix(uU, uMu, clamp(k / max(uLe, 1.0), 0.0, 1.0));
    col = mix(col, rc, 0.6 * fade * cover(abs(l - k) / fl, 0.45 * uDpr));
  }
  col = mix(col, uU, cover(abs(l) / fl, 0.85 * uDpr));
  col = mix(col, uMu, cover(abs(l - uLe) / fl, 0.85 * uDpr));

  float aG = clamp((1.0 - gr) * uGR + 0.5, 0.0, 1.0);
  vec4 outc = inI ? vec4(col, 1.0) : vec4(col, 1.0) * aG;
  if (!inI) outc = mix(outc, vec4(uRim, 1.0), 0.6 * cover(abs(gr - 1.0) * uGR, 0.5 * uDpr));
  if (uIR > 0.0) outc = mix(outc, vec4(uRim, 1.0), cover(abs(ir - 1.0) * uIR, 0.8 * uDpr));
  frag = outc;
}`;

// ───────────────────────── the figure ─────────────────────────

const T_MIN = 1.5, T_MAX = 7;
const PAD_TOP = 24;          // room for the panel titles
const INSET_SCALE = 4;       // the source inset is B(x, 4R)

export function mount(root) {
  const row = el('div', { class: 'fig-row' });
  const left = el('div', { class: 'grow' }), right = el('div', { class: 'side' });
  row.append(left, right);
  root.append(row);

  // ---- state: a generic x up-left of the centre, z0 across the sphere ----
  const Rv0 = m3mul(axisAngle([0.31, 1, 0.17], 0.71), axisAngle([1, 0.2, 0], -0.43));
  const st = {
    t: 3.2,
    Rs: Rv0.slice(),                                // source view → world
    Rt: null, manualT: false,                       // target view; auto unless the reader turned it
    x: m3vec(Rv0, norm3([-0.46, 0.36, 0.81])),
    z0: m3vec(Rv0, norm3([0.6, -0.2, 0.775])),
    E: null, S: null, caps: null, auto: null,
  };

  // ---- the canvas ----
  const wrap = el('div', { class: 'cv-wrap' });
  const glc = el('canvas');
  const ov = el('canvas', { style: 'cursor:grab' });
  wrap.append(glc, ov);
  left.append(wrap);
  const labels = labelLayer(wrap);
  const legend = el('p', { class: 'hint', style: 'margin-top:.45rem' });
  left.append(legend);

  let gl = null, prog = null, U = {};
  try {
    gl = glc.getContext('webgl2', { antialias: false, premultipliedAlpha: true, alpha: true });
    if (gl) {
      const sh = (type, src) => {
        const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
        return s;
      };
      prog = gl.createProgram();
      gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
      gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
      gl.useProgram(prog);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
      const aPos = gl.getAttribLocation(prog, 'aPos');
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
      for (const n of ['uN', 'uGC', 'uGR', 'uRot', 'uIC', 'uIR', 'uIc', 'uIe1', 'uIe2', 'uIrho', 'uV', 'uVc', 'uX', 'uR', 'uLe', 'uDpr', 'uDetail',
        'uBase', 'uLine', 'uU', 'uMu', 'uRim', 'uFillU', 'uFillMu', 'uLineA']) U[n] = gl.getUniformLocation(prog, n);
      gl.uniform4fv(U.uN, new Float32Array(NORMALS.flat()));
    }
  } catch (e) {
    console.warn('fig-sphere:', e);
    gl = null;
  }
  if (!gl) {
    wrap.replaceWith(el('div', { class: 'fallback' }, 'The two sphere pictures need WebGL2, which this browser does not provide. The readout on the right still runs the checks.'));
  }

  // ---- controls and readout ----
  const ctl = controls(right);
  ctl.style.marginTop = '0';
  const tS = slider(ctl, {
    label: 'depth $t$', min: T_MIN, max: T_MAX, step: 0.01, value: st.t, fmt: (v) => v.toFixed(2),
    oninput: (v) => { st.t = v; changed(); },
  });
  const btns = el('div', { class: 'btn-row' });
  ctl.append(btns);
  let anim = null;
  const deeperBtn = button(btns, 'Deeper', () => {
    const t0 = st.t, t1 = Math.min(T_MAX, Math.round(st.t + 1));
    if (anim) cancelAnimationFrame(anim);
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const start = performance.now();
    const step = (now) => {
      const u = reduce ? 1 : Math.min(1, (now - start) / 450);
      st.t = t0 + (t1 - t0) * (0.5 - 0.5 * Math.cos(Math.PI * u));
      tS.set(st.t); changed();
      anim = u < 1 ? requestAnimationFrame(step) : null;
    };
    anim = requestAnimationFrame(step);
  });
  button(btns, '$x$ at a vertex', () => {
    const front = m3vec(st.Rs, [0, 0, 1]);
    const cand = crossingPoints().filter((c) => dot3(c, front) > 0.35 && dist(c, st.x) > 1e-6);
    cand.sort((a, b) => dist(a, st.x) - dist(b, st.x));
    if (cand.length) setX(cand[0], true);
  }, 'ghost');
  let rngX = mulberry32(7);
  button(btns, 'Random $x$', () => {
    let c;
    do { c = randomUnit(rngX); } while (dot3(c, m3vec(st.Rs, [0, 0, 1])) < 0.55);
    setX(c, true);
  }, 'ghost');

  const ro = el('div', { class: 'readout', style: 'margin-top:.7rem' });
  right.append(ro);
  const hint = el('div', { class: 'hint' });
  right.append(hint);
  setTex(hint, '<b>Click</b> the left sphere to put $x$ there, or drag $x$ or $z_0$; drag the inset to slide $x$; drag either sphere to turn it. ' +
    `Here $d(y,z)=\\tfrac12|y-z|=e^{-(y|z)_o}$, $R=e^{-t}$, $\\varepsilon_*=\\tfrac12$, and $c_E=\\tfrac12e^{-\\rho}$, $C_E=e^{\\rho}$ with $\\rho=${CIRCUMRADIUS.toFixed(3)}$ the circumradius of the dodecahedron.`);

  // the readout: label | value | check
  const cell = () => el('td', { class: 'num', style: 'white-space:nowrap' });
  const R_ = { t: cell(), R: cell(), len: cell(), orient: cell(), delta: cell(), min: cell(), max: cell(), pmax: cell(), pmin: cell() };
  const ok = { b22: el('span', { class: 'ok' }, '✓'), p23: el('span', { class: 'ok' }, '✓'), q23: el('span', { class: 'ok' }, '✓') };
  const wordCell = el('td');
  {
    const tex = (s, attrs = {}) => { const td = el('td', attrs); setTex(td, s); return td; };
    const chk = (span) => el('td', { style: 'width:1.1em;text-align:right' }, span || '');
    const tr = (a, b, c) => el('tr', {}, a, b, chk(c));
    const head = (s) => el('tr', { class: 'sep' }, tex(s, { colspan: 3 }));
    ro.append(el('table', {},
      tr(tex('depth $t$'), R_.t),
      tr(tex('$R=e^{-t}$'), R_.R),
      tr(wordCell, R_.len),
      tr(tex('orientation of $h=v^{-1}$'), R_.orient),
      tr(tex('$\\delta=d(o,hP_t)\\le\\rho$'), R_.delta),
      head('<b>(2.2)</b> over 200 random pairs $y,z$'),
      tr(tex('$\\min\\,\\dfrac{d(hy,hz)\\,D_yD_z}{R\\,d(y,z)}$'), R_.min),
      tr(tex('$\\max$'), R_.max),
      tr(tex(`both in $[c_E,C_E]=[${C_E.toFixed(3)},\\,${C_E_UP.toFixed(2)}]$`, { colspan: 2 }), undefined, ok.b22),
      head('<b>(2.3)</b> the puncture $p=hz_0$'),
      tr(tex(`$\\max\\, d(hy,p)\\,D_y/R\\le ${PUNCT_UP.toFixed(2)}$`), R_.pmax, ok.p23),
      tr(tex(`$\\min$ over $d(x,y)\\le\\tfrac12\\varepsilon_*$, $\\ge ${PUNCT_LO.toFixed(3)}$`), R_.pmin, ok.q23),
    ));
  }

  function setTick(node, good) { node.className = good ? 'ok' : 'bad'; node.textContent = good ? '✓' : '✗'; }

  function updateReadout() {
    const { E, S } = st;
    R_.t.textContent = st.t.toFixed(2);
    R_.R.textContent = S.R < 0.01 ? S.R.toFixed(6) : S.R.toFixed(4);
    R_.delta.textContent = E.delta.toFixed(3);
    R_.min.textContent = S.min.toFixed(3);
    R_.max.textContent = S.max.toFixed(3);
    R_.pmax.textContent = S.pMax.toFixed(2);
    R_.pmin.textContent = S.nNear ? S.pNearMin.toFixed(3) : '—';
    R_.orient.textContent = E.det > 0 ? 'kept' : 'reversed';
    setTick(ok.b22, S.min >= C_E && S.max <= C_E_UP);
    setTick(ok.p23, S.pMax <= PUNCT_UP);
    setTick(ok.q23, !S.nNear || S.pNearMin >= PUNCT_LO);
    setTex(wordCell, `$v=${wordTex(E.word, 7)}$`);
    setTex(R_.len, `$|v|=${E.word.length}$`);
    deeperBtn.disabled = st.t >= T_MAX - 1e-9;
  }

  // ---- the model ----
  function recompute() {
    st.x = norm3(st.x);
    keepFar();
    st.E = expansionAt(st.x, st.t);
    st.S = expansionStats(st.x, st.t, st.z0, { E: st.E, n: 200, seed: 1 });
    const { h } = st.E, R = st.S.R;
    st.hx = act(h, st.x);
    st.p = st.S.p;
    st.caps = { ball: capImage(h, ballN(st.x, R)), far: capImage(h, farN(st.x, EPS_STAR)) };
    if (!st.manualT || !st.Rt) st.Rt = autoTargetView();
    updateReadout();
  }

  /** Keep z0 in the far region d(x,z0) ≥ ε*: push it out along the great circle from x. */
  function keepFar() {
    if (dist(st.x, st.z0) >= EPS_STAR) return;
    let e = tangentAt(st.x, st.z0);
    if (!Number.isFinite(e[0]) || dist(st.x, st.z0) < 1e-9) e = tangentAt(st.x, m3vec(st.Rs, [1, 0, 0]));
    st.z0 = pointAt(st.x, e, EPS_STAR + 1e-9);
  }

  /** Look at the image ball h B(x,R), turned toward the puncture so its edge shows; p toward the lower right. */
  function autoTargetView() {
    const { ball } = st.caps, m = ball.center, p = st.p;
    const alpha = Math.acos(ball.cosA), gamma = Math.acos(Math.max(-1, Math.min(1, dot3(m, p))));
    const beta = Math.max(0, Math.min(alpha - 0.8, gamma - 0.4));
    let tp = tangentAt(m, p);
    if (!Number.isFinite(tp[0])) tp = tangentAt(m, [0, 0, 1]);
    const cv = norm3([Math.cos(beta) * m[0] + Math.sin(beta) * tp[0], Math.cos(beta) * m[1] + Math.sin(beta) * tp[1], Math.cos(beta) * m[2] + Math.sin(beta) * tp[2]]);
    const t2 = tangentAt(cv, p), b = cross3(cv, t2), phi = -0.42;
    const rightV = norm3([Math.cos(phi) * t2[0] - Math.sin(phi) * b[0], Math.cos(phi) * t2[1] - Math.sin(phi) * b[1], Math.cos(phi) * t2[2] - Math.sin(phi) * b[2]]);
    return frame(rightV, cross3(cv, rightV), cv);
  }

  function setX(c, resetView) {
    st.x = norm3(c);
    if (resetView) st.manualT = false;
    changed();
  }

  let dirty = true;
  function changed() { dirty = true; request(); }

  // ---- layout ----
  let L = null, dpr = 1;
  function layout() {
    const W = Math.max(200, wrap.clientWidth);
    const side = W >= 540;
    const S = side ? Math.min(W / 2, 400) : Math.min(W, 380);
    const H = side ? S + PAD_TOP : 2 * (S + PAD_TOP) + 8;
    const ox = side ? (W - 2 * S) / 2 : (W - S) / 2;
    const panels = [0, 1].map((i) => {
      const px = side ? ox + i * S : ox, py = side ? 0 : i * (S + PAD_TOP + 8);
      const G = 0.405 * S, I = 0.2 * S;
      const gx = px + (i === 0 ? 0.56 : 0.44) * S, gy = py + PAD_TOP + 0.45 * S;
      const ix = px + (i === 0 ? I + 3 : S - I - 3), iy = py + PAD_TOP + S - I - 3;
      return { px, py, S, G, I, gx, gy, ix, iy };
    });
    return { W, H, side, panels };
  }

  function resize() {
    const W = wrap.clientWidth;
    if (!W) return;
    const nl = layout();
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    if (!L || nl.W !== L.W || nl.H !== L.H || glc.width !== Math.round(nl.W * dpr)) {
      L = nl;
      wrap.style.height = L.H + 'px';
      wrap.style.touchAction = L.side ? 'none' : 'pan-y';   // stacked on a phone: let the page scroll
      for (const c of [glc, ov]) { c.width = Math.round(L.W * dpr); c.height = Math.round(L.H * dpr); }
      request();
    }
  }
  new ResizeObserver(resize).observe(wrap);

  // ---- projections ----
  const views = () => [st.Rs, st.Rt];
  /** World point → screen (CSS px) on panel i's globe. */
  function toGlobe(i, w) {
    const P = L.panels[i], v = m3vec(m3T(views()[i]), w);
    return { x: P.gx + v[0] * P.G, y: P.gy - v[1] * P.G, front: v[2] > 0.03 };
  }
  function fromGlobe(i, sx, sy, clamp = true) {
    const P = L.panels[i];
    let px = (sx - P.gx) / P.G, py = -(sy - P.gy) / P.G, r2 = px * px + py * py;
    if (r2 > 1) { if (!clamp) return null; const r = Math.sqrt(r2); px /= r; py /= r; r2 = 1; }
    return m3vec(views()[i], [px, py, Math.sqrt(Math.max(0, 1 - r2))]);
  }
  /** The inset of panel i: centre on S², tangent frame, radius in the visual metric. */
  function insetOf(i) {
    const c = i === 0 ? st.x : st.p;
    const rho = i === 0 ? INSET_SCALE * st.S.R : Math.min(0.9, 1.6 * (dist(st.p, st.caps.far.center) + st.caps.far.radius));
    const rw = m3vec(views()[i], [1, 0, 0]);
    let e1 = tangentAt(c, rw);
    if (!Number.isFinite(e1[0])) e1 = tangentAt(c, m3vec(views()[i], [0, 1, 0]));
    return { c, e1, e2: cross3(c, e1), rho };
  }
  function toInset(i, w, ins = insetOf(i)) {
    const P = L.panels[i], s = dist(ins.c, w);
    const tdir = tangentAt(ins.c, w), k = Number.isFinite(tdir[0]) ? s / ins.rho : 0;
    const u = k * (Number.isFinite(tdir[0]) ? dot3(tdir, ins.e1) : 0), v = k * (Number.isFinite(tdir[0]) ? dot3(tdir, ins.e2) : 0);
    return { x: P.ix + u * P.I, y: P.iy - v * P.I, inside: k <= 1 };
  }
  function fromInset(i, sx, sy, ins = insetOf(i)) {
    const P = L.panels[i];
    const u = (sx - P.ix) / P.I, v = -(sy - P.iy) / P.I, r = Math.hypot(u, v);
    if (r > 1) return null;
    if (r < 1e-9) return ins.c.slice();
    const e = norm3([(u * ins.e1[0] + v * ins.e2[0]) / r, (u * ins.e1[1] + v * ins.e2[1]) / r, (u * ins.e1[2] + v * ins.e2[2]) / r]);
    return pointAt(ins.c, e, ins.rho * r);
  }

  // ---- drawing ----
  let queued = false;
  function request() { if (!queued) { queued = true; requestAnimationFrame(render); } }

  function render() {
    queued = false;
    if (dirty) { recompute(); dirty = false; }
    if (!gl) return;
    if (!L) { resize(); if (!L) return; }
    const P = palette();
    drawGL(P);
    drawOverlay(P);
    setLegend(P);
  }

  const c3 = (s) => hexToRgb(s).map((v) => v / 255);
  function drawGL(P) {
    gl.viewport(0, 0, glc.width, glc.height);
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform1f(U.uDpr, dpr);
    gl.uniform1f(U.uDetail, 9 * dpr);
    gl.uniform3fv(U.uBase, c3(P.surface));
    gl.uniform3fv(U.uLine, c3(P.dark ? P.ink : P.mesh));
    gl.uniform1f(U.uLineA, P.dark ? 0.5 : 1);
    gl.uniform3fv(U.uU, c3(P.u));
    gl.uniform3fv(U.uMu, c3(P.mu));
    gl.uniform3fv(U.uRim, c3(P.dark ? P.muted : P.mesh));
    gl.uniform1f(U.uFillU, P.dark ? 0.36 : 0.26);
    gl.uniform1f(U.uFillMu, P.dark ? 0.26 : 0.15);
    gl.uniform3fv(U.uX, st.x);
    gl.uniform1f(U.uR, st.S.R);
    gl.uniform1f(U.uLe, Math.log2(EPS_STAR / st.S.R));
    gl.enable(gl.SCISSOR_TEST);
    for (let i = 0; i < 2; i++) {
      const Pn = L.panels[i], ins = insetOf(i);
      const gyDev = (y) => (L.H - y) * dpr;
      gl.scissor(Math.floor(Pn.px * dpr), Math.floor(gyDev(Pn.py + PAD_TOP + Pn.S)), Math.ceil(Pn.S * dpr), Math.ceil(Pn.S * dpr) + 1);
      gl.uniform2f(U.uGC, Pn.gx * dpr, gyDev(Pn.gy));
      gl.uniform1f(U.uGR, Pn.G * dpr);
      gl.uniformMatrix3fv(U.uRot, false, new Float32Array(m3T(views()[i])));
      gl.uniform2f(U.uIC, Pn.ix * dpr, gyDev(Pn.iy));
      gl.uniform1f(U.uIR, Pn.I * dpr);
      gl.uniform3fv(U.uIc, ins.c); gl.uniform3fv(U.uIe1, ins.e1); gl.uniform3fv(U.uIe2, ins.e2);
      gl.uniform1f(U.uIrho, ins.rho);
      const V = i === 0 ? identity4() : st.E.v;   // row-major → column-major
      const Vc = new Float32Array(16);
      for (let a = 0; a < 4; a++) for (let b = 0; b < 4; b++) Vc[4 * b + a] = V[4 * a + b];
      gl.uniformMatrix4fv(U.uV, false, Vc);
      gl.uniform4fv(U.uVc, new Float32Array(matVec(V, [ins.c[0], ins.c[1], ins.c[2], 1])));
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.disable(gl.SCISSOR_TEST);
  }

  const octx = ov.getContext('2d');
  function drawOverlay(P) {
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    octx.clearRect(0, 0, L.W, L.H);
    const lab = [];
    const dot = (x, y, r, fill, stroke = true) => {
      octx.beginPath(); octx.arc(x, y, r, 0, 2 * Math.PI);
      octx.fillStyle = fill; octx.fill();
      if (stroke) { octx.lineWidth = 2; octx.strokeStyle = P.surface; octx.stroke(); }
    };
    const leader = (a, b, color) => {
      octx.save(); octx.setLineDash([3, 3]); octx.lineWidth = 1; octx.strokeStyle = color; octx.globalAlpha = 0.75;
      octx.beginPath(); octx.moveTo(a.x, a.y); octx.lineTo(b.x, b.y); octx.stroke(); octx.restore();
    };
    const toRim = (i, from) => { // the point of panel i's inset rim nearest a screen point
      const Pn = L.panels[i], dx = from.x - Pn.ix, dy = from.y - Pn.iy, r = Math.hypot(dx, dy) || 1;
      return { x: Pn.ix + (dx / r) * Pn.I, y: Pn.iy + (dy / r) * Pn.I, far: r > Pn.I + 6 };
    };
    if (!gl) return;
    const [A, B] = L.panels;
    lab.push({ id: 'ta', x: A.px + 4, y: A.py + 4, tex: '\\text{before}', anchor: 'se', color: P.muted });
    lab.push({ id: 'tb', x: B.px + 4, y: B.py + 4, tex: '\\text{after } h=v^{-1}', anchor: 'se', color: P.muted });

    // source: x, z0, the inset B(x,4R)
    const X = toGlobe(0, st.x), Z = toGlobe(0, st.z0);
    if (X.front) {
      const rim = toRim(0, X);
      if (rim.far) leader(X, rim, P.u);
    }
    if (Z.front) {
      dot(Z.x, Z.y, 6.5, P.mu);
      lab.push({ id: 'z0', x: Z.x + 7, y: Z.y - 5, tex: 'z_0', anchor: 'ne', cls: 'halo', color: P.mu });
    }
    if (X.front) {
      dot(X.x, X.y, 6.5, P.u);
      lab.push({ id: 'x', x: X.x - 7, y: X.y - 6, tex: 'x', anchor: 'nw', cls: 'halo', color: P.u });
    }
    const insA = insetOf(0);
    dot(A.ix, A.iy, 3, P.u, false);
    const bl = toInset(0, pointAt(st.x, insA.e2, st.S.R), insA);
    lab.push({ id: 'bxr', x: bl.x, y: bl.y - 4, tex: 'B(x,R)', anchor: 'n', cls: 'halo', color: P.u });
    lab.push({ id: 'bx4', x: A.ix, y: A.iy + A.I - 5, tex: 'B(x,4R)', anchor: 'n', cls: 'small halo' });

    // target: hx, h B(x,R), p
    const HX = toGlobe(1, st.hx), Pp = toGlobe(1, st.p);
    if (Pp.front) {
      const rim = toRim(1, Pp);
      if (rim.far) leader(Pp, rim, P.mu);
      dot(Pp.x, Pp.y, 4.5, P.mu);
    }
    if (HX.front) {
      dot(HX.x, HX.y, 4.5, P.u);
      lab.push({ id: 'hx', x: HX.x + 6, y: HX.y - 4, tex: 'hx', anchor: 'ne', cls: 'halo', color: P.u });
    }
    { // label h B(x,R) above the topmost visible point of the image of the circle of radius 0.8R
      const e1 = tangentAt(st.x, [0.3, 0.5, 0.81]), e2 = cross3(st.x, e1);
      let best = null;
      for (let k = 0; k < 48; k++) {
        const a = (2 * Math.PI * k) / 48;
        const e = [0, 1, 2].map((j) => Math.cos(a) * e1[j] + Math.sin(a) * e2[j]);
        const S = toGlobe(1, act(st.E.h, pointAt(st.x, e, 0.8 * st.S.R)));
        const Pn = L.panels[1];
        if (S.front && Math.hypot(S.x - Pn.gx, S.y - Pn.gy) < 0.9 * Pn.G && Math.hypot(S.x - Pn.ix, S.y - Pn.iy) > Pn.I + 12 && (!best || S.y < best.y)) best = S;
      }
      if (best) lab.push({ id: 'hb', x: best.x, y: best.y - 3, tex: 'h\\,B(x,R)', anchor: 'n', cls: 'halo', color: P.u });
    }
    dot(B.ix, B.iy, 4.5, P.mu);
    lab.push({ id: 'p', x: B.ix + 6, y: B.iy - 5, tex: 'p=hz_0', anchor: 'ne', cls: 'halo', color: P.mu });
    lab.push({ id: 'np', x: B.ix, y: B.iy + B.I - 5, tex: '\\text{near } p', anchor: 'n', cls: 'small halo' });
    labels.set(lab);
  }

  let legendKey = '';
  function setLegend(P) {
    const key = P.u + P.mu + P.mesh;
    if (key === legendKey) return;
    legendKey = key;
    setTex(legend,
      `<span style="color:${P.u}">●</span> $B(x,R)$ and its image &nbsp; ` +
      `<span style="color:${P.mu}">●</span> the far region $d(x,y)\\ge\\varepsilon_*$, squeezed toward $p$ &nbsp; ` +
      `rings: $D_y=2^kR$ &nbsp; gray: the walls of the tiling`);
  }

  // ---- interaction ----
  function panelAt(sx, sy) {
    for (let i = 0; i < 2; i++) {
      const P = L.panels[i];
      if (sx >= P.px && sx <= P.px + P.S && sy >= P.py && sy <= P.py + PAD_TOP + P.S) return i;
    }
    return -1;
  }
  let drag = null;
  pointer(ov, {
    down(sx, sy) {
      if (!L || !gl) return false;
      const i = panelAt(sx, sy);
      if (i < 0) return false;
      const P = L.panels[i];
      const inInset = Math.hypot(sx - P.ix, sy - P.iy) <= P.I;
      if (i === 0) {
        for (const key of ['x', 'z0']) {
          const S = toGlobe(0, st[key]);
          if (S.front && Math.hypot(S.x - sx, S.y - sy) < 15 && !(inInset && key === 'z0')) { drag = { type: key }; return true; }
        }
        if (inInset) { drag = { type: 'pan', grab: fromInset(0, sx, sy), sx, sy, moved: false }; return true; }
      } else if (inInset) return false;
      if (Math.hypot(sx - P.gx, sy - P.gy) > P.G + 4) return false;
      drag = { type: 'rot', i, v: m3vec(m3T(views()[i]), fromGlobe(i, sx, sy)), sx, sy, moved: false };
      ov.style.cursor = 'grabbing';
      return true;
    },
    move(sx, sy) {
      if (!drag) return;
      if (drag.type === 'x' || drag.type === 'z0') {
        const w = fromGlobe(0, sx, sy);
        if (drag.type === 'x') st.x = w;
        else st.z0 = w;   // recompute() keeps it in the far region
        st.manualT = false;
        changed();
        return;
      }
      if (Math.hypot(sx - drag.sx, sy - drag.sy) > 3) drag.moved = true;
      if (drag.type === 'pan') {
        if (!drag.moved || !drag.grab) return;
        for (let k = 0; k < 3; k++) { // slide x so the grabbed point follows the pointer
          const now = fromInset(0, sx, sy);
          if (!now) break;
          st.x = norm3([st.x[0] + drag.grab[0] - now[0], st.x[1] + drag.grab[1] - now[1], st.x[2] + drag.grab[2] - now[2]]);
        }
        st.manualT = false;
        changed();
        return;
      }
      const i = drag.i, v1 = m3vec(m3T(views()[i]), fromGlobe(i, sx, sy));
      const Q = rotTaking(v1, drag.v);
      if (i === 0) st.Rs = m3mul(st.Rs, Q);
      else { st.Rt = m3mul(st.Rt, Q); st.manualT = true; }
      drag.v = v1;
      request();
    },
    up(sx, sy) {
      ov.style.cursor = 'grab';
      if (drag && !drag.moved) {
        if (drag.type === 'rot' && drag.i === 0) {
          const w = fromGlobe(0, sx, sy, false);
          if (w) setX(w, true);
        } else if (drag.type === 'pan' && drag.grab) setX(drag.grab, true);
      }
      drag = null;
    },
  });

  onTheme(() => { legendKey = ''; request(); });
  resize();
  request();
}
