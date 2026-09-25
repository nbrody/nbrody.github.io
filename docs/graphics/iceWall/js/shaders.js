// ═══════════════════════════════════════════════════════════════════
//  Ice Wall — GLSL
//
//  Four passes, all full-screen triangles:
//    flow       ¼ res   domain-warp vectors (the slow, marbled flow)
//    height     render  relief height: pillowy drifts + ice-block cracks
//                       (floes or bricks) + four octaves of cauliflower
//                       frost; meltwater melts its channel clear
//    shade      render  lit relief: soft cast shadows marched through the
//                       height mips, cavity AO, twinkling glints, glassy
//                       meltwater; writes HDR colour + a bloom/star buffer
//    composite  canvas  bloom, star glints, LED-panel mode, tone, grain
//
//  With EXT_color_buffer_float the height is kept in R32F (normals need
//  the precision) and everything else in RGBA16F. Without it the NO_FLOAT
//  variant packs the height into two bytes and stores colour sqrt-encoded.
// ═══════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  const VERT = `#version 300 es
void main() {
  vec2 p = vec2(float((gl_VertexID << 1) & 2), float(gl_VertexID & 2));
  gl_Position = vec4(p * 2.0 - 1.0, 0.0, 1.0);
}`;

  const header = (defines) =>
    '#version 300 es\n' +
    defines.map((d) => `#define ${d}\n`).join('') +
    'precision highp float;\nprecision highp int;\nprecision highp sampler2D;\n';

  // ─── Shared: integer hashes, gradient noise, height packing ───
  const COMMON = `
uvec2 pcg2d(uvec2 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * 1664525u; v.y += v.x * 1664525u;
  v = v ^ (v >> 16u);
  v.x += v.y * 1664525u; v.y += v.x * 1664525u;
  v = v ^ (v >> 16u);
  return v;
}
uvec3 pcg3d(uvec3 v) {
  v = v * 1664525u + 1013904223u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  v ^= v >> 16u;
  v.x += v.y * v.z; v.y += v.z * v.x; v.z += v.x * v.y;
  return v;
}
const float U2F = 1.0 / 4294967296.0;
uvec2 cellKey(vec2 c, float seed) {
  ivec2 i = ivec2(c) + ivec2(1 << 20);            // keep the lattice positive
  uint s = uint(seed);
  return uvec2(i) + uvec2(s * 7919u, s * 104729u);
}
vec2 hash22(vec2 c, float seed) { return vec2(pcg2d(cellKey(c, seed))) * U2F; }
vec3 hash32(vec2 c, float seed) {
  uvec2 k = cellKey(c, seed);
  return vec3(pcg3d(uvec3(k, k.x ^ (k.y * 747796405u) ^ 2891336453u))) * U2F;
}

// Gradient noise with quintic fade, roughly [-0.7, 0.7].
float gnoise(vec2 p, float seed) {
  vec2 i = floor(p), f = fract(p);
  vec2 u = f * f * f * (f * (f * 6.0 - 15.0) + 10.0);
  float a = dot(hash22(i, seed) * 2.0 - 1.0, f);
  float b = dot(hash22(i + vec2(1.0, 0.0), seed) * 2.0 - 1.0, f - vec2(1.0, 0.0));
  float c = dot(hash22(i + vec2(0.0, 1.0), seed) * 2.0 - 1.0, f - vec2(0.0, 1.0));
  float d = dot(hash22(i + vec2(1.0, 1.0), seed) * 2.0 - 1.0, f - vec2(1.0, 1.0));
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

const mat2 ROT = mat2(0.80, 0.60, -0.60, 0.80);

float fbm3(vec2 p, float seed) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 3; i++) {
    s += a * gnoise(p, seed + float(i));
    p = ROT * p * 2.03 + vec2(3.1, 1.7);
    a *= 0.5;
  }
  return s * 1.6;
}

#ifdef NO_FLOAT
const float HSCALE = 2.0, HBIAS = 0.3;
vec2 packH(float h) {
  float x = clamp(h * HSCALE + HBIAS, 0.0, 1.0) * 65535.0;
  float hi = floor(x / 256.0);
  return vec2(hi, x - hi * 256.0) / 255.0;
}
float unpackH(vec2 v) { return ((v.x * 65280.0 + v.y * 255.0) / 65535.0 - HBIAS) / HSCALE; }
float coarseH(float stored) { return (stored - HBIAS) / HSCALE; }
#endif
`;

  // ─── Meltwater channel geometry (height + shade passes) ───
  const WATER = `
uniform vec4 uWaterA;        // x centre (0..1 of width), y half-width (of width), z amount, w meander
uniform vec2 uWaterB;        // x fall phase, y width-wobble phase
// Screen units (height 1). Returns (|dx|, dx, half-width) with dx in half-widths.
vec3 channel(vec2 s, float aspect) {
  float cx = uWaterA.x * aspect + uWaterA.w * 0.08 *
    (gnoise(vec2(s.y * 1.3, 0.37), 70.0) * 1.4 + 0.6 * gnoise(vec2(s.y * 3.7, 2.1), 71.0));
  float hw = max(uWaterA.y * aspect * (0.8 + 0.45 * gnoise(vec2(s.y * 2.1 + uWaterB.y, 5.5), 72.0)), 0.003);
  float dx = (s.x - cx) / hw;
  return vec3(abs(dx), dx, hw);
}
`;

  // ─── Pass 1: flow field (¼ resolution) ───
  const FLOW = `
uniform vec2 uRes;
uniform vec4 uView;      // xy: world centre, zw: world span of the view
uniform vec4 uPhaseA;    // bounded time offsets (circles in noise space)
uniform vec4 uPhaseB;
out vec4 fragOut;

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = (uView.xy + (uv - 0.5) * uView.zw) * 0.8;
  vec2 q = vec2(fbm3(p + uPhaseA.xy, 1.0), fbm3(p + vec2(5.2, 1.3) + uPhaseA.zw, 5.0));
  vec2 r = vec2(fbm3(p + 1.5 * q + vec2(1.7, 9.2) + uPhaseB.xy, 9.0),
                fbm3(p + 1.5 * q + vec2(8.3, 2.8) + uPhaseB.zw, 13.0));
  fragOut = vec4(r, q);
}`;

  // ─── Pass 2: relief height ───
  const HEIGHT = `
uniform sampler2D uFlow;
uniform vec2  uRes;
uniform vec4  uView;
uniform float uWarp;         // how far the flow carries the material
uniform float uMacro;        // pillowy drift height
uniform float uFrost;        // frost coverage 0..1
uniform float uFrostRelief;  // frost clump height
uniform float uClump;        // clump size multiplier
uniform float uFracture;     // ice-block strength 0..1
uniform float uBlockDensity; // blocks per world unit
uniform float uCrack;        // crack half-width (cell units)
uniform float uJitter;       // irregularity: floes 0 = staggered hex … 1 = random; bricks wander
uniform float uJoint;        // 0 = open cracks, 1 = snow-packed joints
uniform float uPattern;      // 0 = Voronoi floes, 1 = bricks
uniform float uTime;         // wrapped seconds, for the blocks' slow breathing
layout(location = 0) out vec4 outPrecise;
layout(location = 1) out vec4 outInfo;

vec2 cellPoint(vec2 cell) {
  vec3 h = hash32(cell, 17.0);
  vec2 o = vec2(0.5 + 0.5 * (1.0 - uJitter) * mod(cell.y, 2.0), 0.5);   // stagger rows when regular
  o += uJitter * 0.92 * (h.xy - 0.5);
  o += (0.03 + 0.05 * uJitter) * sin(uTime * 0.23 + 6.2831853 * h.zx);
  return o;
}

// Running-bond ice bricks (2:1), hand-cut: rows wander and joints lean a little.
vec3 brickBorder(vec2 x, out vec2 toCenter, out vec3 edge) {
  x.y += uJitter * 0.18 * gnoise(x * vec2(0.23, 0.5), 25.0);
  float row = floor(x.y);
  vec3 rr = hash32(vec2(0.0, row), 26.0);
  float u = x.x * 0.5 + 0.5 * mod(row, 2.0) + (rr.x - 0.5) * 0.3 * uJitter
          + uJitter * 0.12 * (fract(x.y) - 0.5) * (rr.y - 0.5);
  float col = floor(u);
  vec2 f = vec2(fract(u), fract(x.y));
  float dx = min(f.x, 1.0 - f.x) * 2.0, dy = min(f.y, 1.0 - f.y);
  toCenter = vec2((0.5 - f.x) * 2.0, 0.5 - f.y);
  // key each joint so both bricks beside it agree: head joints by row and column,
  // bed joints by row boundary and half-brick segment
  vec2 key = dx < dy ? vec2(col * 2.0 + (f.x < 0.5 ? 0.0 : 2.0), row * 2.0)
                     : vec2(floor(x.x) * 2.0 + 1.0, (f.y < 0.5 ? row : row + 1.0) * 2.0 + 1.0);
  edge = hash32(key, 29.0);
  return vec3(min(dx, dy), col, row);
}

// Exact distance to the nearest Voronoi border (two-pass), plus cell id.
// 'edge' is a random vector shared by the two cells across that border.
vec3 voronoiBorder(vec2 x, out vec2 toCenter, out vec3 edge) {
  vec2 n = floor(x), f = fract(x);
  vec2 mg = vec2(0.0), mr = vec2(0.0);
  float md = 8.0;
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec2 r = g + cellPoint(n + g) - f;
    float d = dot(r, r);
    if (d < md) { md = d; mr = r; mg = g; }
  }
  md = 8.0;
  vec2 mb = mg;
  for (int j = -2; j <= 2; j++)
  for (int i = -2; i <= 2; i++) {
    vec2 g = mg + vec2(float(i), float(j));
    vec2 r = g + cellPoint(n + g) - f;
    vec2 e = r - mr;
    if (dot(e, e) > 1e-5) {
      float d = dot(0.5 * (mr + r), normalize(e));
      if (d < md) { md = d; mb = g; }
    }
  }
  toCenter = mr;
  vec2 a = n + mg, b = n + mb;
  edge = hash32((a + b) * 3.0 + abs(a - b), 29.0);
  return vec3(md, a);
}

float smax(float a, float b, float k) {
  float h = max(k - abs(a - b), 0.0) / k;
  return max(a, b) + h * h * k * 0.25;
}

// Piled paraboloid beads: the cauliflower texture of hoarfrost.
// Beads swell as the cover thickens; thin cover leaves small, scattered grains.
float beads(vec2 x, float cover, float seed) {
  vec2 n = floor(x), f = fract(x);
  float h = 0.0;
  for (int j = -1; j <= 1; j++)
  for (int i = -1; i <= 1; i++) {
    vec2 g = vec2(float(i), float(j));
    vec3 r = hash32(n + g, seed);
    float grow = clamp(cover * 1.6 - r.z * 0.6, 0.0, 1.0);
    float rad = (0.45 + 0.5 * fract(r.z * 17.31 + r.x)) * grow;
    vec2 d = g + 0.12 + 0.76 * r.xy - f;
    float q = rad * rad - dot(d, d);
    h = smax(h, max(q, 0.0) / max(rad, 1e-3), 0.12);
  }
  return h;
}

// Billowed fbm: rounded pillows split by sharp creases.
float drifts(vec2 w) {
  float s = 0.0, a = 0.5;
  for (int i = 0; i < 5; i++) {
    float n = gnoise(w, 40.0 + float(i)) * 1.45;
    s += a * (i < 3 ? abs(n) : 0.5 * n + 0.25);
    w = ROT * w * 2.07 + vec2(1.3, 4.7);
    a *= 0.5;
  }
  return s;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  vec2 p = uView.xy + (uv - 0.5) * uView.zw;
  vec4 fl = texture(uFlow, uv);
  vec2 W = p + uWarp * 0.32 * fl.xy;              // drifts ride the full flow
  vec2 Wf = p + uWarp * 0.11 * fl.xy + 0.05 * fl.zw;  // frost follows gently (no smearing)

  float m = drifts(W * 1.45);
  float H = m * 0.11 * uMacro;

  float fm = fbm3(W * 1.1 + vec2(3.1, 7.7), 60.0);
  float cover = smoothstep(0.0, 1.0, uFrost * 1.35 - 0.3 + 0.6 * fm + 0.45 * (m - 0.45));

  // meltwater has eaten the frost out of its channel
  float melt = 0.0;
  if (uWaterA.z > 0.001) {
    float aspect = uRes.x / uRes.y;
    melt = (1.0 - smoothstep(0.7, 1.3, channel(vec2(uv.x * aspect, uv.y), aspect).x)) * uWaterA.z;
    cover *= 1.0 - melt;
  }

  float crack = 0.0, tint = 0.5;
  if (uFracture > 0.001) {
    vec2 toC;
    vec3 eh;
    vec2 bp = (p + uWarp * 0.06 * fl.xy) * uBlockDensity;
    vec3 vb = uPattern > 0.5 ? brickBorder(bp, toC, eh) : voronoiBorder(bp, toC, eh);
    vec3 rb = hash32(vb.yz, 23.0);
    // below full fracture the cracks fade in and out along their length;
    // every border gets its own width
    float n01 = 0.5 + 0.5 * fbm3(W * 1.15 + vec2(9.1, 2.3), 64.0);
    float vis = smoothstep(0.55 - 0.65 * uFracture, 0.7 - 0.65 * uFracture, n01);
    vis *= smoothstep(eh.x - 0.7, eh.x + 0.1, uFracture * 1.6 + 0.1);
    float w = uCrack * (0.55 + 0.9 * eh.y);
    float v = clamp(1.0 - vb.x / w, 0.0, 1.0);
    float groove = v * v * vis;                                   // V-shaped
    float slab = (rb.x - 0.5) * 0.3 + dot(rb.yz - 0.5, -toC) * 0.35;
    float deep = (0.1 + 0.9 * w) * smoothstep(0.0, 0.7, uFracture);   // hairlines first, gorges later
    H += (uFracture * uFracture * slab * 0.22 - groove * mix(deep, -0.08, uJoint)) / uBlockDensity;
    crack = groove * (1.0 - uJoint) - groove * uJoint;   // < 0 marks snow-packed joints
    tint = mix(0.5, rb.x, uFracture);
    cover = mix(cover * (1.0 - 0.9 * groove), max(cover, smoothstep(0.0, 0.6, groove)), uJoint);
  }

  // (big lumps need thick frost; fine grain shows up first, so thin frost reads as grain, not bubbles)
  float fr = 0.0, sc = 9.0 / uClump;
  for (int k = 0; k < 4; k++) {
    float fk = float(k);
    float ck = smoothstep(0.3 - 0.1 * fk, 1.0 - 0.1 * fk, cover);
    if (ck > 0.002) fr += beads(Wf * sc + vec2(7.1, 3.9) * fk, ck, 31.0 + fk) / sc * (1.0 - 0.07 * fk);
    sc *= 2.2;
  }
  H += uFrostRelief * fr - 0.012 * melt;

#ifdef NO_FLOAT
  outPrecise = vec4(packH(H), 0.0, 1.0);
  outInfo = vec4(clamp(H * HSCALE + HBIAS, 0.0, 1.0), 0.5 + 0.5 * crack, tint, cover);
#else
  outPrecise = vec4(H, 0.0, 0.0, 1.0);
  outInfo = vec4(H, crack, tint, cover);
#endif
}`;

  // ─── Pass 3: lighting ───
  const SHADE = `
uniform sampler2D uPrecise;   // exact height (texelFetch only)
uniform sampler2D uInfo;      // height, crack (< 0: snow joint), tint, cover; mipmapped
uniform sampler2D uFlow;
uniform sampler2D uRamp;      // 256×1 palette (sRGB texture → linear)
uniform vec2  uRes;
uniform vec4  uView;
uniform float uWarp;
uniform vec3  uLight;         // unit vector toward the key light
uniform float uBump;
uniform float uShadow;
uniform float uShadowGrow;
uniform float uAO;
uniform float uSparkle;
uniform float uExposure;
uniform float uCellTint;
uniform float uGrainAmt;
uniform float uGlintTime;
uniform vec3  uGlintColor;
uniform vec3  uSSSColor;
uniform vec3  uGlowColor;     // light scattered up out of cracks
uniform vec3  uSkyColor;
uniform vec3  uWaterTint;
uniform float uBloomThresh;
layout(location = 0) out vec4 outColor;
layout(location = 1) out vec4 outBright;

float fetchH(ivec2 ip) {
  ip = clamp(ip, ivec2(0), ivec2(uRes) - 1);
#ifdef NO_FLOAT
  return unpackH(texelFetch(uPrecise, ip, 0).rg);
#else
  return texelFetch(uPrecise, ip, 0).r;
#endif
}
float sampleH(vec2 uv, float lod) {
#ifdef NO_FLOAT
  return coarseH(textureLod(uInfo, uv, lod).r);
#else
  return textureLod(uInfo, uv, lod).r;
#endif
}
vec3 ramp(float x) { return textureLod(uRamp, vec2(clamp(x, 0.002, 0.998), 0.5), 0.0).rgb; }

struct Ice { vec3 col; float glint; };

// World-space slope of the blurred height (central differences on a mip).
vec2 slopeAt(vec2 uv, float lod, float off) {
  vec2 dx = vec2(off / uRes.x, 0.0), dy = vec2(0.0, off / uRes.y);
  float texel = uView.w / uRes.y;
  return vec2(sampleH(uv + dx, lod) - sampleH(uv - dx, lod),
              sampleH(uv + dy, lod) - sampleH(uv - dy, lod)) / (2.0 * off * texel);
}

Ice shadeIce(vec2 uv, float submerged) {
  float texel = uView.w / uRes.y;                   // world units per texel
  ivec2 ip = ivec2(uv * uRes);
  float hC = fetchH(ip);
  float hL = fetchH(ip - ivec2(1, 0)), hR = fetchH(ip + ivec2(1, 0));
  float hD = fetchH(ip - ivec2(0, 1)), hU = fetchH(ip + ivec2(0, 1));
  vec3 N = normalize(vec3((hL - hR) * uBump, (hD - hU) * uBump, 2.0 * texel));

  vec4 info = textureLod(uInfo, uv, 0.0);
#ifdef NO_FLOAT
  info.g = info.g * 2.0 - 1.0;
#endif
  float crack = max(info.g, 0.0), snow = max(-info.g, 0.0), tint = info.b, cover = info.a;

  // material coordinates (as in the height pass): grain and glints ride with the frost
  vec4 fl = texture(uFlow, uv);
  vec2 W = uView.xy + (uv - 0.5) * uView.zw + uWarp * 0.11 * fl.xy + 0.05 * fl.zw;

  vec2 gq = W * 230.0;
  vec2 grain = vec2(gnoise(gq, 90.0), gnoise(gq + vec2(17.3, 5.1), 91.0));
  N = normalize(N + vec3(grain * uGrainAmt * (0.3 + 0.7 * cover) * (1.0 - 0.8 * submerged), 0.0));

  if (submerged > 0.0) {           // water smooths what it covers
    vec3 Ns = normalize(vec3(-slopeAt(uv, 2.0, 6.0) * uBump, 1.0));
    N = normalize(mix(N, Ns, 0.7 * submerged));
  }

  // soft cast shadow: march the height pyramid toward the light
  vec2 Ld = normalize(uLight.xy + vec2(1e-5, 0.0));
  float tanE = uLight.z / max(length(uLight.xy), 1e-3);
  float h0 = hC * uBump;
  float sh = 1.0;
  if (uShadow > 0.001) {
    float t = 1.25 * texel;
    for (int i = 0; i < 18; i++) {
      vec2 suv = uv + Ld * t / uView.zw;
      float lod = clamp(log2(t / texel) - 1.0, 0.0, 7.0);
      float rise = h0 + t * tanE - sampleH(suv, lod) * uBump;
#ifdef NO_FLOAT
      rise += 0.004 * uBump;                         // step over 8-bit height quantisation
#endif
      sh = min(sh, 7.0 * rise / t);
      t *= uShadowGrow;
    }
    sh = smoothstep(0.0, 1.0, clamp(sh, 0.0, 1.0));
  }
  float lit = mix(1.0, sh, uShadow);

  // cavity occlusion from the same pyramid
  float a1 = sampleH(uv, 1.5), a2 = sampleH(uv, 3.5), a3 = sampleH(uv, 5.5);
  float occ = max(a1 - hC, 0.0) / (2.8 * texel) * 0.50
            + max(a2 - hC, 0.0) / (11.3 * texel) * 0.35
            + max(a3 - hC, 0.0) / (45.3 * texel) * 0.25;
  float ao = exp(-occ * uBump * uAO * 1.6);

  // gradient-mapped light: flat sunlit ice sits mid-ramp, slopes that face
  // the sun climb to white, shadows and crevices sink to the deep end
  float ndl = dot(N, uLight);
  float direct = max(ndl, 0.0) * lit;
  float sky = (0.5 + 0.5 * N.z) * ao;
  float I = (direct + 0.38 * sky) * uExposure;
  float x = I * 0.6 + pow(max(ndl, 0.0), 6.0) * 0.22 * lit;
  x += 0.04 * cover + (tint - 0.5) * uCellTint * 0.25 - 0.3 * crack * (1.0 - x) - 0.06 * submerged;
  x += 0.22 * snow;                                  // packed snow in the joints is whiter than ice
  vec3 col = ramp(x);

  // light leaking through thin ridges and glowing up out of cracks, and a gloss on bare ice
  float ridge = clamp((hC - a1) / (2.8 * texel) * uBump * 0.9, 0.0, 1.0);
  col += uSSSColor * ridge * (1.0 - direct) * 0.45 + uGlowColor * crack * 0.75;
  vec3 Hh = normalize(uLight + vec3(0.0, 0.0, 1.0));
  col += uSkyColor * pow(max(dot(N, Hh), 0.0), 90.0) * (1.0 - cover) * (0.3 + 0.7 * lit) * 0.7;

  // glints: one tilted micro-facet per cell, turning slowly so it twinkles
  vec2 gp = W * 240.0;
  vec2 gc = floor(gp);
  vec3 gr = hash32(gc, 97.0);
  vec2 gd = fract(gp) - (0.2 + 0.6 * gr.xy);
  float dotMask = exp(-dot(gd, gd) * 18.0);
  float ang = gr.z * 6.2831853 + uGlintTime * (0.35 + 0.9 * gr.x);
  vec3 fn = normalize(N + vec3(cos(ang), sin(ang), 0.0) * (0.18 + 0.62 * gr.y));
  float align = pow(max(reflect(-uLight, fn).z, 0.0), 420.0);
  float glint = align * dotMask * cover * lit * uSparkle * 16.0 * (1.0 - submerged);

  Ice r;
  r.col = col + uGlintColor * glint;
  r.glint = glint;
  return r;
}

// Flow ripples: long threads down the fall line, sliding down it.
float ripples(vec2 s) {
  float ph = uWaterB.x;
  return gnoise(vec2(s.x * 30.0, s.y * 2.6 + ph), 80.0)
       + 0.5 * gnoise(vec2(s.x * 72.0 + 4.1, s.y * 5.8 + ph * 2.2), 81.0)
       + 0.25 * gnoise(vec2(s.x * 150.0 + 9.3, s.y * 9.0 + ph * 3.4), 82.0);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uRes;
  float aspect = uRes.x / uRes.y;
  vec2 s = vec2(uv.x * aspect, uv.y);

  float inW = 0.0, wet = 0.0, depth = 0.0, edge = 9.0, surge = 0.0;
  vec3 Nw = vec3(0.0, 0.0, 1.0);
  vec2 refr = vec2(0.0);
  if (uWaterA.z > 0.001) {
    vec3 ch = channel(s, aspect);
    if (ch.x < 2.5) {
      // the sheet laps unevenly at its banks: it runs into hollows, parts at ridges
      float lift = (sampleH(uv, 3.0) - sampleH(uv, 6.0)) / 0.025;
      edge = ch.x + clamp(lift, -0.6, 1.0) * 0.22 * smoothstep(0.4, 0.95, ch.x)
           + 0.09 * gnoise(vec2(s.x * 16.0, s.y * 7.0 + uWaterB.y * 3.0), 74.0);
      inW = (1.0 - smoothstep(0.84, 1.0, edge)) * uWaterA.z;
      wet = (1.0 - smoothstep(0.95, 1.65, edge)) * uWaterA.z;
      depth = clamp(1.0 - edge * edge, 0.0, 1.0);
      if (wet > 0.001) {
        surge = gnoise(vec2(s.x * 5.0, s.y * 1.2 + uWaterB.x * 0.28), 83.0) * 1.4;   // pulses running down
        vec2 relief = slopeAt(uv, 3.0, 12.0) * 0.45;
        float e = 1.5 / uRes.y;
        vec2 rg = vec2(ripples(s + vec2(e, 0.0)) - ripples(s - vec2(e, 0.0)),
                       ripples(s + vec2(0.0, e)) - ripples(s - vec2(0.0, e))) / (2.0 * e);
        rg *= 0.0036 * (1.0 + 0.45 * surge);
        vec2 slope = relief + rg - vec2(ch.y / ch.z * 0.02, 0.0);
        Nw = normalize(vec3(-slope, 1.0));
        refr = -(relief + rg) * 0.012 * inW;
      }
    }
  }

  Ice ice = shadeIce(uv + refr, inW);
  vec3 col = ice.col;
  float star = ice.glint;

  if (wet > 0.001) {
    col *= 1.0 - 0.32 * clamp(wet - inW, 0.0, 1.0);           // darker damp fringe
    vec3 under = col * mix(vec3(1.0), uWaterTint, 0.7) * (0.82 - 0.4 * depth);
    col = mix(col, under, inW);
    // reflection of a bright sky with a soft sun: seen straight on, the sheet
    // only lights up where ripples tilt toward the light, so it streaks
    vec3 R = reflect(vec3(0.0, 0.0, -1.0), Nw);
    vec3 Ls = normalize(uLight + vec3(0.0, 0.0, 0.8));
    float rl = max(dot(R, Ls), 0.0);
    float fres = 0.03 + 0.97 * pow(1.0 - Nw.z, 3.0);
    float sun = pow(rl, 30.0) * 1.4 + pow(rl, 300.0) * 3.5;
    col += inW * (uSkyColor * (0.015 + 1.3 * fres) * (1.0 + 0.3 * surge) + uGlintColor * sun);
    col += uSkyColor * exp(-pow((edge - 0.9) * 14.0, 2.0)) * 0.22 * uWaterA.z;   // meniscus
    star += inW * pow(rl, 600.0) * 1.5;
  }

  float lum = dot(col, vec3(0.2126, 0.7152, 0.0722));
  vec3 bright = col * smoothstep(uBloomThresh, uBloomThresh + 0.35, lum);
#ifdef NO_FLOAT
  outColor = vec4(sqrt(clamp(col * 0.25, 0.0, 1.0)), 1.0);
  outBright = vec4(sqrt(clamp(bright * 0.25, 0.0, 1.0)), clamp(star * 0.25, 0.0, 1.0));
#else
  outColor = vec4(col, 1.0);
  outBright = vec4(bright, star);
#endif
}`;

  // ─── Pass 4: composite to the canvas ───
  const COMPOSITE = `
uniform sampler2D uColor;
uniform sampler2D uBright;
uniform vec2  uCanvas;
uniform float uScale;       // render pixels per canvas pixel
uniform float uBloom;
uniform float uStars;
uniform vec3  uStarColor;
uniform float uLed;
uniform float uLedRows;
uniform float uGrain;
uniform float uVignette;
uniform float uFrame;
out vec4 fragColor;

vec3 dec(vec3 c) {
#ifdef NO_FLOAT
  return c * c * 4.0;
#else
  return c;
#endif
}
float decA(float a) {
#ifdef NO_FLOAT
  return a * 4.0;
#else
  return a;
#endif
}

vec4 cubicW(float v) {
  vec4 n = vec4(1.0, 2.0, 3.0, 4.0) - v;
  vec4 s = n * n * n;
  float x = s.x, y = s.y - 4.0 * s.x, z = s.z - 4.0 * s.y + 6.0 * s.x;
  return vec4(x, y, z, 6.0 - x - y - z) * (1.0 / 6.0);
}
// B-spline filtered mip read (4 bilinear taps) so wide bloom has no blocks.
vec3 bicubic(sampler2D t, vec2 uv, int lod) {
  vec2 size = vec2(textureSize(t, lod));
  vec2 st = uv * size - 0.5;
  vec2 f = fract(st);
  st -= f;
  vec4 xc = cubicW(f.x), yc = cubicW(f.y);
  vec4 c = st.xxyy + vec2(-0.5, 1.5).xyxy;
  vec4 s = vec4(xc.xz + xc.yw, yc.xz + yc.yw);
  vec4 o = (c + vec4(xc.yw, yc.yw) / s) / size.xxyy;
  float fl = float(lod);
  vec3 s0 = textureLod(t, o.xz, fl).rgb, s1 = textureLod(t, o.yz, fl).rgb;
  vec3 s2 = textureLod(t, o.xw, fl).rgb, s3 = textureLod(t, o.yw, fl).rgb;
  float sx = s.x / (s.x + s.y), sy = s.z / (s.z + s.w);
  return mix(mix(s3, s2, sx), mix(s1, s0, sx), sy);
}

vec3 shoulder(vec3 x) {
  const float k = 0.8;
  vec3 over = k + (1.0 - k) * (1.0 - exp(-(x - k) / (1.0 - k)));
  return mix(x, over, step(k, x));
}
vec3 toSRGB(vec3 c) {
  c = clamp(c, 0.0, 1.0);
  return mix(c * 12.92, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
}

void main() {
  vec2 uv = gl_FragCoord.xy / uCanvas;
  vec3 col;
  if (uLed > 0.5) {
    float pitch = uCanvas.y / uLedRows;
    vec2 cell = floor(gl_FragCoord.xy / pitch);
    vec2 cc = (cell + 0.5) * pitch;
    float lod = max(log2(pitch * uScale) - 1.2, 0.0);
    vec3 c = dec(textureLod(uColor, cc / uCanvas, lod).rgb);
    vec2 d = (gl_FragCoord.xy - cc) / pitch;
    float r = length(max(abs(d) - vec2(0.15, 0.13), 0.0));
    float emit = 1.0 - smoothstep(0.10, 0.19, r);
    float halo = exp(-dot(d, d) * 10.0);
    float louver = mix(0.55, 1.0, smoothstep(-0.5, -0.32, d.y));
    col = c * (emit * 1.9 + halo * 0.3) * louver;
  } else {
    col = dec(texture(uColor, uv).rgb);
  }

  if (uBloom > 0.001) {
    vec3 b = dec(textureLod(uBright, uv, 1.0).rgb) * 0.20
           + dec(bicubic(uBright, uv, 2)) * 0.24
           + dec(bicubic(uBright, uv, 3)) * 0.24
           + dec(bicubic(uBright, uv, 4)) * 0.22
           + dec(bicubic(uBright, uv, 5)) * 0.20
           + dec(bicubic(uBright, uv, 6)) * 0.18;
    col += b * uBloom;
  }

  if (uStars > 0.001) {
    vec2 px = 1.0 / vec2(textureSize(uBright, 1));
    float reach = clamp(uCanvas.y * uScale / 1100.0, 0.6, 2.0);
    float st = 0.0;
    for (int k = 0; k < 4; k++) {
      float a = 0.42 + float(k) * 1.5707963;
      vec2 dir = vec2(cos(a), sin(a)) * px * reach;
      for (int i = 1; i <= 7; i++) {
        float fi = float(i);
        st += decA(textureLod(uBright, uv + dir * fi * 1.6, 1.0).a) * exp(-fi * 0.38);
      }
    }
    col += uStarColor * st * uStars * 0.55;
  }

  col = shoulder(col);
  vec2 v = uv - 0.5;
  v.x *= uCanvas.x / uCanvas.y;
  col *= 1.0 - uVignette * smoothstep(0.35, 1.25, length(v));

  vec3 outc = toSRGB(col);
  vec2 n = hash22(gl_FragCoord.xy, 1.0 + mod(uFrame, 61.0));
  float lum = dot(outc, vec3(0.299, 0.587, 0.114));
  outc += (n.x - 0.5) * uGrain * (0.35 + 0.65 * sqrt(lum));
  outc += (n.y - 0.5) / 255.0;                      // dither away banding
  fragColor = vec4(outc, 1.0);
}`;

  window.IceWallShaders = {
    VERT,
    build(pass, defines = []) {
      const body = { flow: FLOW, height: HEIGHT, shade: SHADE, composite: COMPOSITE }[pass];
      const water = pass === 'height' || pass === 'shade' ? WATER : '';
      return header(defines) + COMMON + water + body;
    },
  };
})();
