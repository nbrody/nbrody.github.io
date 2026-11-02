/* GLSL for the Riemann viewer.

   DATA_FS writes, per pixel s = σ + it, the float vector
       (log|f(s)|, arg f(s), Re f′/f, Im f′/f)        f = ζ or ξ
   and COLOR_FS turns those layers into the picture.

   Single precision would lose the phases t·log n at large heights, so the CPU computes,
   at the layer's center s₀ = σ₀ + it₀ and in double precision, the unit numbers
   n^{−it₀}, the phase of χ(s₀), of U = e^{−iϑ(t₀)} and of Γ(s₀/2); the shader multiplies
   them by the small corrections e^{−iδ log n}, … for its offset δ = t − t₀ ("reference
   mode", used once |t₀| is several times the view size). Method choices mirror zeta.js. */

import { EM_B, EM_RATIO, EM_TERMS, RS_K, GPU } from './zeta.js';

const f = (x) => {
  const s = Number(x).toPrecision(9);
  return /[.e]/.test(s) ? s : s + '.0';
};

export const VS = `#version 300 es
const vec2 P[3] = vec2[3](vec2(-1.0, -1.0), vec2(3.0, -1.0), vec2(-1.0, 3.0));
void main() { gl_Position = vec4(P[gl_VertexID], 0.0, 1.0); }`;

const COMMON = `
const float PI = 3.14159265358979;
const float TWO_PI = 6.28318530717959;
const float LOG_PI = 1.14472988584940;
const float LOG_2PI = 1.83787706640935;
vec2 cmul(vec2 a, vec2 b) { return vec2(a.x * b.x - a.y * b.y, a.x * b.y + a.y * b.x); }
vec2 cdiv(vec2 a, vec2 b) { float m = max(abs(b.x), abs(b.y)); a /= m; b /= m; float d = dot(b, b); return vec2(a.x * b.x + a.y * b.y, a.y * b.x - a.x * b.y) / d; }
vec2 cinv(vec2 b) { return cdiv(vec2(1.0, 0.0), b); }
vec2 cconj(vec2 a) { return vec2(a.x, -a.y); }
// log of a complex number without overflow in |a|²
vec2 clog(vec2 a) {
  float m = max(abs(a.x), abs(a.y));
  if (m == 0.0) return vec2(-1.0e30, 0.0);
  vec2 b = a / m;
  return vec2(log(m) + 0.5 * log(dot(b, b)), atan(a.y, a.x));
}
// reduce an angle to [−π, π] in two steps (Cody–Waite), before cos and sin
float reduce(float x) {
  float k = floor(x * 0.159154943 + 0.5);
  return (x - k * 6.28318548) + k * 1.7484555e-7;
}
vec2 expi(float x) { x = reduce(x); return vec2(cos(x), sin(x)); }
// log(1 + w), accurate in relative terms when w is small
vec2 clog1p(vec2 w) {
  if (dot(w, w) < 1.0e-4) {
    vec2 w2 = cmul(w, w);
    return w - 0.5 * w2 + cmul(w2, w) / 3.0 - 0.25 * cmul(w2, w2);
  }
  return clog(vec2(1.0, 0.0) + w);
}
vec2 cexp(vec2 a) { return exp(a.x) * expi(a.y); }
`;

export const DATA_FS = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
uniform sampler2D u_ref;        // n^{−it₀}, 4096 per row
uniform sampler2D u_rsg;        // Riemann–Siegel G_{k,j}(p), p ∈ [−1, 1]
uniform int u_refLen;           // entries 1 … u_refLen of u_ref are valid
uniform int u_rsgW;
uniform bool u_refMode;         // phases relative to t₀
uniform bool u_bigRef;          // … and χ, ϑ, Γ too (|t₀| ≥ 30)
uniform vec2 u_res, u_span, u_c0;
uniform float u_tr0, u_sg;
uniform vec2 u_logChi0, u_logXi0, u_logzA, u_logzB, u_logzX, u_U0;
uniform float u_xr;             // ξ's reference abscissa max(σ₀, 1 − σ₀): ξ is computed on the right
uniform float u_lnT0, u_a0, u_N0, u_f0;
uniform int u_fn;               // 0: ζ, 1: ξ
layout(location = 0) out vec4 o;
${COMMON}
const float T_RS = ${f(GPU.T_RS)};
const float RS_SIG = 8.0;
const float EM_B0 = ${f(EM_B[0])};
const float EM_RATIO[${EM_TERMS}] = float[${EM_TERMS}](${EM_RATIO.slice(0, EM_TERMS).map(f).join(', ')});
const float STIR[4] = float[4](${[1 / 12, -1 / 360, 1 / 1260, -1 / 1680].map(f).join(', ')});

float g_dlt;          // δ: t = t_r0 + δ in reference mode, δ = t otherwise
bool g_bad;           // a sum needed more reference phases than were supplied

/* n^{−it} */
vec2 phase(int n, float lnn) {
  vec2 w = expi(-g_dlt * lnn);
  if (!u_refMode) return w;
  if (n > u_refLen) { g_bad = true; return w; }
  return cmul(texelFetch(u_ref, ivec2(n & 4095, n >> 12), 0).rg, w);
}

/* ---- Γ, ψ ---- */
vec2 stirSeries(vec2 z) {
  vec2 iz = cinv(z), iz2 = cmul(iz, iz), p = iz, s = vec2(0.0);
  for (int k = 0; k < 4; k++) { s += STIR[k] * p; p = cmul(p, iz2); }
  return s;
}
vec2 logGamma(vec2 z) {
  vec2 acc = vec2(0.0);
  for (int j = 0; j < 80; j++) {
    if (!(z.x < 10.0 && (z.x < 0.0 || dot(z, z) < 225.0))) break;
    acc += clog(z); z.x += 1.0;
  }
  vec2 lz = clog(z);
  return cmul(z - vec2(0.5, 0.0), lz) - z + vec2(0.5 * LOG_2PI, 0.0) + stirSeries(z) - acc;
}
vec2 digamma(vec2 z) {
  vec2 acc = vec2(0.0);
  for (int j = 0; j < 80; j++) {
    if (!(z.x < 10.0 && (z.x < 0.0 || dot(z, z) < 225.0))) break;
    acc += cinv(z); z.x += 1.0;
  }
  vec2 iz = cinv(z), iz2 = cmul(iz, iz);
  vec2 s = clog(z) - 0.5 * iz;
  vec2 p = iz2;
  s -= p / 12.0; p = cmul(p, iz2);
  s += p / 120.0; p = cmul(p, iz2);
  s -= p / 252.0; p = cmul(p, iz2);
  s += p / 240.0;
  return s - acc;
}
/* log Γ(z₀ + h) − log Γ(z₀) for |z₀| ≥ 15 and |h| ≤ |z₀|/4, given log z₀ in double */
vec2 dLogGamma(vec2 z0, vec2 h, vec2 lz0) {
  vec2 u = cdiv(h, z0);
  vec2 q = vec2(1.0 / 17.0, 0.0);                 // log(1 + u)/u = Σ (−u)^k/(k + 1)
  for (int k = 15; k >= 0; k--) q = vec2(1.0 / float(k + 1), 0.0) - cmul(u, q);
  vec2 l1p = cmul(u, q);
  vec2 A = cmul(h, cmul(vec2(1.0, 0.0) - 0.5 * cinv(z0), q));   // (z₀ − ½) log(1 + u)
  vec2 B = cmul(h, lz0 + l1p) - h;                               // h log(z₀ + h) − h
  return A + B + stirSeries(z0 + h) - stirSeries(z0);
}
/* ϑ(t₀ + δ) − ϑ(t₀) for ϑ(t) = (t/2) log(t/2π) − t/2 − π/8 */
float dVartheta(float d) {
  float x = d / u_tr0, q = 1.0 / 17.0;
  for (int k = 15; k >= 0; k--) q = 1.0 / float(k + 1) - x * q;
  return 0.5 * d * (u_lnT0 + (1.0 + x) * q - 1.0);
}

/* log χ(s) and χ′/χ(s), where ζ(s) = χ(s) ζ(1 − s) */
vec2 logChi(float x, float t) {
  if (u_bigRef) {
    vec2 ds = vec2(x - u_c0.x, g_dlt);
    vec2 zA = 0.5 * vec2(u_c0.x, u_tr0), zB = 0.5 * vec2(1.0 - u_c0.x, -u_tr0);
    return u_logChi0 + LOG_PI * ds + dLogGamma(zB, -0.5 * ds, u_logzB) - dLogGamma(zA, 0.5 * ds, u_logzA);
  }
  vec2 s = vec2(x, t);
  return vec2((x - 0.5) * LOG_PI, t * LOG_PI) + logGamma(0.5 * (vec2(1.0, 0.0) - s)) - logGamma(0.5 * s);
}
vec2 dlogChi(float x, float t) {
  vec2 s = vec2(x, t);
  return vec2(LOG_PI, 0.0) - 0.5 * digamma(0.5 * (vec2(1.0, 0.0) - s)) - 0.5 * digamma(0.5 * s);
}

/* ---- Euler–Maclaurin: ζ(s) − 1 and ζ′(s) with M terms and m Bernoulli terms ----
   (ζ − 1 rather than ζ, which far to the right is 1 to single precision) */
void eulerMaclaurin(float x, float t, int M, int m, out vec2 val, out vec2 der) {
  vec2 s = vec2(x, t), S = vec2(0.0), D = vec2(0.0);
  for (int n = 2; n < M; n++) {
    float l = log(float(n));
    vec2 w = exp(-x * l) * phase(n, l);
    S += w; D -= l * w;
  }
  float lM = log(float(M)), fM = float(M);
  vec2 pM = exp(-x * lM) * phase(M, lM);                     // M^{−s}
  vec2 sm1 = vec2(x - 1.0, t);
  vec2 q = cdiv(fM * pM, sm1);                               // M^{1−s}/(s − 1)
  S += q + 0.5 * pM;
  D += cmul(q, vec2(-lM, 0.0) - cinv(sm1)) - 0.5 * lM * pM;
  vec2 T = EM_B0 * cmul(s, pM) / fM;                         // b₁ s M^{−s−1}
  vec2 L = cinv(s) - vec2(lM, 0.0);                          // d/ds log of the term
  for (int k = 1; k <= ${EM_TERMS}; k++) {
    if (k > m) break;
    S += T; D += cmul(T, L);
    vec2 a1 = s + vec2(float(2 * k - 1), 0.0), a2 = s + vec2(float(2 * k), 0.0);
    if (k < ${EM_TERMS}) T = cmul(T, cmul(a1, a2)) * (EM_RATIO[k - 1] / (fM * fM));
    L += cinv(a1) + cinv(a2);
  }
  val = S; der = D;
}
/* ζ − 1 for σ ≥ 0, by Euler–Maclaurin or a short partial sum, whichever is cheaper */
void zetaRight(float x, float t, out vec2 val, out vec2 der) {
  float Me = max(6.0, ceil(${f(GPU.EM_SLACK)} * length(vec2(x + ${f(2 * EM_TERMS)}, t)) / PI) + 1.0);
  float Md = 1.0e9;
  if (x >= 1.5) {
    float ls = log(length(vec2(x, t)) + 1.0);
    Md = max(3.0, ceil(exp((3.0 * ls - log(720.0 * ${f(GPU.EPS)}) + x * 0.693147181) / (x + 3.0))));
  }
  if (Md < Me) eulerMaclaurin(x, t, int(Md), 1, val, der);
  else eulerMaclaurin(x, t, int(Me), ${EM_TERMS}, val, der);
}

/* ---- Riemann–Siegel ---- */
vec2 rsG(int idx, float p) {
  float u = (p + 1.0) * 0.5 * float(u_rsgW - 1);
  int i0 = clamp(int(floor(u)), 0, u_rsgW - 2);
  float fr = u - float(i0);
  int row = idx >> 1;
  vec4 a = texelFetch(u_rsg, ivec2(i0, row), 0), b = texelFetch(u_rsg, ivec2(i0 + 1, row), 0);
  vec4 c = mix(a, b, fr);
  return (idx & 1) == 0 ? c.xy : c.zw;
}
vec2 rsCorrection(float x, float p, float ia) {
  vec2 r = vec2(0.0);
  float ak = 1.0;
  int idx = 0;
  for (int k = 0; k < ${RS_K}; k++) {
    float xj = 1.0;
    vec2 tk = vec2(0.0);
    for (int j = 0; j <= k; j++) { tk += xj * rsG(idx, p); xj *= x; idx++; }
    r += ak * tk;
    ak *= ia;
  }
  return r;
}
/* log ζ(s) and ζ′/ζ(s) as R(s) + χ(s) conj R(1 − s̄) */
void zetaRS(float x, float t, out vec2 Lz, out vec2 Dz) {
  float a, fr;
  int N;
  if (u_bigRef) {
    float xr = g_dlt / u_tr0, sq = sqrt(1.0 + xr);
    float am = u_f0 + u_a0 * xr / (sq + 1.0);                // a − N₀, accurately
    float fl = floor(am);
    N = int(u_N0 + fl); fr = am - fl; a = u_a0 * sq;
  } else {
    a = sqrt(t / TWO_PI);
    float fl = floor(a);
    N = int(fl); fr = a - fl;
  }
  float p = 1.0 - 2.0 * fr, la = log(a);
  // scale the sums so that no term exceeds 1
  float sc1 = x < 0.0 ? -x * la : 0.0, sc2 = x > 1.0 ? (x - 1.0) * la : 0.0;
  vec2 S1 = vec2(0.0), S2 = vec2(0.0), D1 = vec2(0.0), D2 = vec2(0.0);
  for (int n = 1; n <= N; n++) {
    float l = log(float(n));
    vec2 w = phase(n, l);
    vec2 u1 = exp(-x * l - sc1) * w, u2 = exp((x - 1.0) * l - sc2) * cconj(w);
    S1 += u1; D1 -= l * u1;
    S2 += u2; D2 += l * u2;
  }
  vec2 U;
  if (u_bigRef) U = cmul(u_U0, cconj(expi(dVartheta(g_dlt))));
  else U = cconj(expi(0.5 * t * log(t / TWO_PI) - 0.5 * t - 0.125 * PI));
  float sg = (N & 1) == 1 ? 1.0 : -1.0;
  vec2 c1 = rsCorrection(x, p, 1.0 / a), c2 = rsCorrection(1.0 - x, p, 1.0 / a);
  vec2 K1 = sg * exp(-x * la - sc1) * cmul(U, c1);
  vec2 K2 = sg * exp((x - 1.0) * la - sc2) * cmul(cconj(U), cconj(c2));
  vec2 X1 = S1 + K1, X1d = D1 - la * K1;
  vec2 X2 = S2 + K2, X2d = D2 + la * K2;
  vec2 lc = logChi(x, t), pc = dlogChi(x, t);
  vec2 L1 = clog(X1) + vec2(sc1, 0.0);
  vec2 L2 = lc + clog(X2) + vec2(sc2, 0.0);
  float m = max(L1.x, L2.x);
  vec2 e1 = exp(sc1 - m) * X1, e1d = exp(sc1 - m) * X1d;
  vec2 cm = cexp(lc + vec2(sc2 - m, 0.0));                   // χ e^{sc₂ − m}
  vec2 e2 = cmul(cm, X2), e2d = cmul(cm, cmul(pc, X2) + X2d);
  vec2 z = e1 + e2;
  Lz = vec2(m, 0.0) + clog(z);
  Dz = cdiv(e1d + e2d, z);
}

/* log ζ and ζ′/ζ at σ + it, t ≥ 0 */
void logZeta(float x, float t, out vec2 L, out vec2 D) {
  float a = sqrt(t / TWO_PI);
  if (t >= T_RS && abs(x - 0.5) <= min(a / 3.0, RS_SIG)) { zetaRS(x, t, L, D); return; }
  vec2 v, dv;                                   // v = ζ − 1
  if (x >= 0.0) {
    zetaRight(x, t, v, dv);
    L = clog1p(v); D = cdiv(dv, vec2(1.0, 0.0) + v);
    return;
  }
  // ζ(s) = χ(s) conj ζ(1 − σ + it)
  zetaRight(1.0 - x, t, v, dv);
  L = logChi(x, t) + cconj(clog1p(v));
  D = dlogChi(x, t) - cconj(cdiv(dv, vec2(1.0, 0.0) + v));
}

void main() {
  vec2 d = (gl_FragCoord.xy / u_res - 0.5) * u_span;
  float x = u_c0.x + d.x, t, sgn;
  g_bad = false;
  if (u_refMode) { g_dlt = u_sg * d.y; t = u_tr0 + g_dlt; sgn = u_sg; }
  else { float tt = u_c0.y + d.y; sgn = tt < 0.0 ? -1.0 : 1.0; t = abs(tt); g_dlt = t; }
  vec2 L, D;
  if (u_fn == 0) {
    logZeta(x, t, L, D);
  } else {
    // ξ(s) = ½ s(s − 1) π^{−s/2} Γ(s/2) ζ(s), and ξ(s) = conj ξ(1 − σ + it)
    bool refl = x < 0.5;
    float xp = refl ? 1.0 - x : x;
    logZeta(xp, t, L, D);
    vec2 s = vec2(xp, t);
    vec2 g;
    if (u_bigRef) {
      vec2 ds = vec2(xp - u_xr, g_dlt);
      g = u_logXi0 - 0.5 * LOG_PI * ds + dLogGamma(0.5 * vec2(u_xr, u_tr0), 0.5 * ds, u_logzX);
    } else {
      g = -0.5 * LOG_PI * s + logGamma(0.5 * s);
    }
    L += g + clog(0.5 * cmul(s, s - vec2(1.0, 0.0)));
    D += cinv(s) + cinv(s - vec2(1.0, 0.0)) - vec2(0.5 * LOG_PI, 0.0) + 0.5 * digamma(0.5 * s);
    if (refl) { L = cconj(L); D = -cconj(D); }
  }
  if (sgn < 0.0) { L = cconj(L); D = cconj(D); }
  if (g_bad || !(abs(L.y) < 1.0e30)) { o = vec4(0.0, 100.0, 0.0, 0.0); return; }
  o = vec4(L.x, reduce(reduce(L.y)), D);
}`;

/* ---------------------------------------------------------------- coloring */
export const SHADE_GLSL = `
uniform sampler2D u_pal;
uniform vec3 u_bg;
uniform float u_lines, u_offset;
uniform bool u_rings, u_grid, u_relief;
uniform vec2 u_light;
// a sawtooth on y, box-filtered over a width w
// Distances to the nearest integer are y − round(y): one subtraction, exact when y is tiny (far to
// the right log|ζ| and arg ζ are about 2^{−σ}, and so is their gradient), and with no sum like
// floor(y) + 1 − y for the compiler to reassociate.
// A sawtooth on y, which changes by g per pixel, with its jumps antialiased.
float sawAA(float y, float g) {
  float r = y - round(y);
  float v = r >= 0.0 ? r : 1.0 + r;                        // fract(y)
  float e = abs(r) / max(g, 1.0e-30);                      // pixels to the nearest jump
  v = mix(0.5, v, smoothstep(0.0, 0.75, e));
  return mix(v, 0.5, smoothstep(0.35, 0.8, g));            // bands crowding below ~2 px fade to their mean
}
// coverage of 1-pixel lines at the integers of y
float lineAA(float y, float g, float width) {
  float dpx = abs(y - round(y)) / max(g, 1.0e-30);
  float l = 1.0 - smoothstep(0.5 * width - 0.5, 0.5 * width + 0.5, dpx);
  return l * (1.0 - smoothstep(0.18, 0.45, g));            // fade before lines crowd into moiré
}
vec3 shade(vec4 d, float upp) {
  if (d.y > 50.0) return u_bg;
  float k = u_lines / ${f(2 * Math.PI)};
  float g = k * length(d.zw) * upp;                       // grid-coordinate change per pixel
  float u = d.y / ${f(2 * Math.PI)};
  // the palette, box-filtered over the turn of arg f across one pixel (mipmaps of the 512-texel table)
  float du = length(d.zw) * upp / ${f(2 * Math.PI)};
  vec3 c = textureLod(u_pal, vec2(u + u_offset, 0.5), clamp(log2(max(du * 512.0, 1.0)), 0.0, 9.0)).rgb;
  float yr = k * d.x, yp = u_lines * u;
  if (u_rings) {
    c *= mix(0.74, 1.0, sawAA(yr, g));
  }
  if (u_relief) {
    vec2 gr = normalize(vec2(d.z, -d.w) + 1.0e-20);
    float s = 1.0 - exp(-12.0 * g / max(k, 1.0e-3));
    float l = dot(gr, u_light);
    c *= 1.0 + 0.32 * s * l;
  }
  if (u_grid) {
    float a = max(lineAA(yr, g, 1.1), lineAA(yp, g, 1.1));
    c = mix(c, c * 0.25, 0.75 * a);
  }
  return clamp(c, 0.0, 1.0);
}`;

export const COLOR_FS = `#version 300 es
precision highp float;
precision highp int;
precision highp sampler2D;
uniform sampler2D u_top, u_bot;
uniform bool u_hasTop, u_hasBot;
uniform vec4 u_xfTop, u_xfBot;    // (k = w_screen / w_layer, shift.x, shift.y, first finished row)
uniform vec2 u_resTop, u_resBot;
uniform float u_uppTop, u_uppBot; // world units per screen pixel
uniform vec2 u_screen;
out vec4 o;
${SHADE_GLSL}
vec4 sampleLayer(sampler2D tex, vec2 res, vec4 xf, float upp, vec2 p) {
  vec2 t = (p * xf.x + xf.yz + 0.5) * res - 0.5;
  vec2 fl = floor(t), fr = t - fl;
  ivec2 i0 = ivec2(fl);
  vec3 acc = vec3(0.0);
  float ws = 0.0;
  for (int j = 0; j < 2; j++) for (int i = 0; i < 2; i++) {
    ivec2 q = i0 + ivec2(i, j);
    if (q.x < 0 || q.y < 0 || q.x >= int(res.x) || q.y >= int(res.y) || float(q.y) < xf.w) continue;
    vec4 d = texelFetch(tex, q, 0);
    float wt = (i == 0 ? 1.0 - fr.x : fr.x) * (j == 0 ? 1.0 - fr.y : fr.y);
    acc += wt * shade(d, upp);
    ws += wt;
  }
  return vec4(acc, ws);
}
void main() {
  vec2 p = gl_FragCoord.xy / u_screen - 0.5;
  vec4 a = u_hasTop ? sampleLayer(u_top, u_resTop, u_xfTop, u_uppTop, p) : vec4(0.0);
  vec3 col = a.rgb;
  float rest = 1.0 - a.a;
  if (rest > 0.001) {
    vec4 b = u_hasBot ? sampleLayer(u_bot, u_resBot, u_xfBot, u_uppBot, p) : vec4(0.0);
    col += rest * (b.a > 0.001 ? b.rgb / b.a : u_bg);
  }
  o = vec4(col, 1.0);
}`;

