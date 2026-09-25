// fig121.js — Figure 12.1 of Indra's Pearls: "a picture Klein and Poincaré
// would have envied". For the quasifuchsian group given by Grandma's recipe
// (Tr a = Tr b = 2.2 in the book) the plane is coloured by the argument of the
// automorphic function
//
//     f(z) = Σ (az+b)/(cz+d)⁵  /  Σ 1/(cz+d)⁴  =  Σ γ(z)·γ'(z)²  /  Σ γ'(z)² ,
//
// summed over the group. Both sums are weight-4 Poincaré series (γ'(z) =
// (cz+d)⁻²), so their ratio is invariant: f(γz) = f(z), and the colours repeat
// on every tile of the ordinary set. The book prints the numerator exponent
// as 3, but Σ (az+b)/(cz+d)³ = Σ γ(z)·γ'(z) has weight 2 — the ratio would then
// pick up a factor (cz+d)⁻² under the group, and for Tr = 2.2 (critical
// exponent > 1) that series does not even converge. `uPow` selects either.
//
// The group elements are enumerated on the CPU each frame (the |c|²+|d|² ≤ C
// ball of the free group, C tuned to hit the requested term count), uploaded
// as an RGBA32F texture, and summed per pixel in a fragment shader. The limit
// set is traced on a 2D canvas above it.

import { grandma, limitSetWalker, enumerateElements } from './kleinian.js';

const VERT = `#version 300 es
in vec2 pos;
out vec2 uv;
void main() { uv = pos; gl_Position = vec4(pos, 0.0, 1.0); }`;

const FRAG = `#version 300 es
precision highp float;
in vec2 uv;
out vec4 outColor;
uniform highp sampler2D uM;
uniform int uN;
uniform vec2 uCenter;
uniform vec2 uHalf;      // half-extent of the view in world units
uniform float uCycles;   // colour cycles per turn of arg f
uniform float uPhase;
uniform float uBands;    // strength of |f| contour shading
uniform int uPow;        // numerator exponent: 5 (invariant) or 3 (as printed)
uniform sampler2D uLut;  // cyclic colour ramp, 256×1
vec2 cmul(vec2 p, vec2 q) { return vec2(p.x*q.x - p.y*q.y, p.x*q.y + p.y*q.x); }
vec2 cinv(vec2 p) { return vec2(p.x, -p.y) / dot(p, p); }
vec3 hue(float h) { return texture(uLut, vec2(fract(h), 0.5)).rgb; }
void main() {
  vec2 z = uCenter + uv * uHalf;
  vec2 num = vec2(0.0), den = vec2(0.0);
  for (int i = 0; i < uN; i++) {
    ivec2 t = ivec2((i & 1023) * 2, i >> 10);
    vec4 ab = texelFetch(uM, t, 0);
    vec4 cd = texelFetch(uM, t + ivec2(1, 0), 0);
    vec2 w = cinv(cmul(cd.xy, z) + cd.zw);        // 1/(cz+d)
    vec2 w2 = cmul(w, w);
    vec2 w4 = cmul(w2, w2);
    vec2 wp = uPow == 5 ? cmul(w4, w) : cmul(w2, w);
    num += cmul(cmul(ab.xy, z) + ab.zw, wp);        // (az+b)/(cz+d)^pow
    den += w4;                                      // 1/(cz+d)^4
  }
  vec2 f = cmul(num, cinv(den));
  float h = atan(f.y, f.x) / 6.28318530718;
  vec3 col = hue(h * uCycles + uPhase);
  if (uBands > 0.0) {
    float m = fract(log2(length(f)) * 2.0);
    col *= 1.0 - uBands * 0.35 * smoothstep(0.0, 1.0, m);
  }
  outColor = vec4(col, 1.0);
}`;

function compile(gl, type, src) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
  return s;
}

export function createFig121(glCanvas, overlay) {
  const gl = glCanvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
  if (!gl) throw new Error('WebGL2 is required for Figure 12.1.');
  const prog = gl.createProgram();
  gl.attachShader(prog, compile(gl, gl.VERTEX_SHADER, VERT));
  gl.attachShader(prog, compile(gl, gl.FRAGMENT_SHADER, FRAG));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, 'pos');
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
  const U = {};
  for (const n of ['uM', 'uN', 'uCenter', 'uHalf', 'uCycles', 'uPhase', 'uBands', 'uPow', 'uLut']) U[n] = gl.getUniformLocation(prog, n);
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.uniform1i(U.uM, 0);
  const lutTex = gl.createTexture();
  gl.activeTexture(gl.TEXTURE1);
  gl.bindTexture(gl.TEXTURE_2D, lutTex);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
  gl.activeTexture(gl.TEXTURE0);
  gl.uniform1i(U.uLut, 1);
  /** Upload the colour ramp: an array of [r, g, b] (0–255), length 256. */
  function setLut(ramp) {
    const data = new Uint8Array(ramp.length * 4);
    ramp.forEach((c, i) => data.set([c[0], c[1], c[2], 255], i * 4));
    gl.activeTexture(gl.TEXTURE1);
    gl.bindTexture(gl.TEXTURE_2D, lutTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, ramp.length, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, data);
    gl.activeTexture(gl.TEXTURE0);
  }
  const octx = overlay.getContext('2d');

  let cutoff = 400; // adapted so the enumeration lands near the requested term count
  let lastInfo = { terms: 0, cutoff };

  /** Enumerate ≈ `terms` elements and upload them; returns the count used. */
  function upload(gens, terms) {
    let res;
    for (let tries = 0; tries < 6; tries++) {
      res = enumerateElements(gens, { cutoff, maxNodes: Math.max(60000, terms * 30) });
      if (res.saturated) { cutoff *= 0.6; continue; }
      if (res.count < terms) { cutoff *= 1.6; continue; }
      if (res.count > terms * 2.5) cutoff *= 0.8;
      break;
    }
    const n = Math.min(terms, res.count);
    const rows = Math.max(1, Math.ceil(n / 1024));
    const data = new Float32Array(2048 * rows * 4);
    data.set(res.data.subarray(0, n * 8));
    gl.bindTexture(gl.TEXTURE_2D, tex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, 2048, rows, 0, gl.RGBA, gl.FLOAT, data);
    lastInfo = { terms: n, cutoff, saturated: res.saturated };
    return n;
  }

  function drawLimitSet(gens, view, opts) {
    const W = overlay.width, H = overlay.height;
    octx.clearRect(0, 0, W, H);
    if (!opts.showLimit) return;
    const px = (2 * view.half[0]) / W;
    const sx = W / (2 * view.half[0]), sy = H / (2 * view.half[1]);
    const X = (x) => (x - view.center[0] + view.half[0]) * sx;
    const Y = (y) => (view.center[1] + view.half[1] - y) * sy;
    octx.lineWidth = opts.limitWidth * (window.devicePixelRatio || 1);
    octx.strokeStyle = 'rgba(0,0,0,0.9)';
    octx.lineJoin = 'round';
    octx.beginPath();
    let segs = 0;
    const walker = limitSetWalker(gens, {
      epsilon: px * 1.5, maxLevel: 36,
      emit(xs, ys) {
        // Start at the previous leaf's endpoint unless this leaf was cut off at
        // maxLevel (or is the first) and jumps.
        const jump = Math.hypot(xs[1] - xs[0], ys[1] - ys[0]) > 4 * px;
        octx.moveTo(X(xs[jump ? 1 : 0]), Y(ys[jump ? 1 : 0]));
        for (let j = jump ? 2 : 1; j < xs.length; j++) octx.lineTo(X(xs[j]), Y(ys[j]));
        if (++segs % 4000 === 0) { octx.stroke(); octx.beginPath(); }
      },
    });
    walker.step(opts.limitBudget);
    octx.stroke();
  }

  /**
   * Render one frame. `p` = { ta:[re,im], tb:[re,im], root, terms, cycles,
   * phase, bands, pow, center:[x,y], zoom, showLimit, limitWidth }.
   */
  function render(p) {
    const W = glCanvas.width, H = glCanvas.height;
    const aspect = W / H;
    const half = aspect >= 1 ? [p.zoom * aspect, p.zoom] : [p.zoom, p.zoom / aspect];
    const { gens, tab } = grandma(p.ta, p.tb, p.root);
    const ok = gens.every((g) => g.every((e) => Number.isFinite(e[0]) && Number.isFinite(e[1])));
    if (!ok) return { ...lastInfo, tab, bad: true };
    const n = upload(gens, p.terms);
    gl.viewport(0, 0, W, H);
    gl.uniform1i(U.uN, n);
    gl.uniform2f(U.uCenter, p.center[0], p.center[1]);
    gl.uniform2f(U.uHalf, half[0], half[1]);
    gl.uniform1f(U.uCycles, p.cycles);
    gl.uniform1f(U.uPhase, p.phase);
    gl.uniform1f(U.uBands, p.bands);
    gl.uniform1i(U.uPow, p.pow);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    drawLimitSet(gens, { center: p.center, half }, p);
    return { ...lastInfo, tab };
  }

  return { render, setLut, gl };
}
