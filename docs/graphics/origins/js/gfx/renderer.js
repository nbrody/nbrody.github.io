// renderer.js — the WebGL2 pipeline every chapter draws through.
//
//   scene → HDR target (RGBA16F) ← sprites, lines, point clouds, fullscreen
//                                   shaders, and an uploaded 2D-canvas layer
//        → bloom (13-tap downsample chain + tent upsample)
//        → composite: exposure, soft-knee tonemap, flash, vignette, grain
//
// Scenes work in CSS pixels with the origin at top-left (same as canvas 2D);
// the renderer handles device-pixel scaling.

import { Program, Target } from './gl.js';
import { HEADER, FULLSCREEN_VS, HASH } from './glsl.js';

const BLIT_FS = `${HEADER}
uniform sampler2D u_tex; uniform float u_gain;
in vec2 v_uv; out vec4 o;
void main() { vec4 c = texture(u_tex, v_uv); o = vec4(c.rgb * u_gain, c.a); }`;

const DOWN_FS = `${HEADER}
uniform sampler2D u_src; uniform vec2 u_texel; uniform float u_threshold, u_knee, u_first;
in vec2 v_uv; out vec4 o;
vec3 tap(vec2 d) { return texture(u_src, v_uv + u_texel * d).rgb; }
void main() {
  vec3 c = tap(vec2(0)) * 0.125
    + (tap(vec2(-2, 2)) + tap(vec2(2, 2)) + tap(vec2(-2, -2)) + tap(vec2(2, -2))) * 0.03125
    + (tap(vec2(0, 2)) + tap(vec2(-2, 0)) + tap(vec2(2, 0)) + tap(vec2(0, -2))) * 0.0625
    + (tap(vec2(-1, 1)) + tap(vec2(1, 1)) + tap(vec2(-1, -1)) + tap(vec2(1, -1))) * 0.125;
  if (u_first > 0.5) {
    c = min(c, vec3(48.0));
    float br = max(c.r, max(c.g, c.b));
    float rq = clamp(br - u_threshold + u_knee, 0.0, 2.0 * u_knee);
    rq = rq * rq / (4.0 * u_knee + 1e-4);
    c *= max(rq, br - u_threshold) / max(br, 1e-4);
  }
  o = vec4(c, 1.0);
}`;

const UP_FS = `${HEADER}
uniform sampler2D u_src; uniform vec2 u_texel; uniform float u_radius;
in vec2 v_uv; out vec4 o;
void main() {
  vec2 d = u_texel * u_radius;
  vec3 s = texture(u_src, v_uv + vec2(-d.x, d.y)).rgb + texture(u_src, v_uv + vec2(d.x, d.y)).rgb
         + texture(u_src, v_uv + vec2(-d.x, -d.y)).rgb + texture(u_src, v_uv + vec2(d.x, -d.y)).rgb
         + 2.0 * (texture(u_src, v_uv + vec2(0.0, d.y)).rgb + texture(u_src, v_uv + vec2(0.0, -d.y)).rgb
                + texture(u_src, v_uv + vec2(-d.x, 0.0)).rgb + texture(u_src, v_uv + vec2(d.x, 0.0)).rgb)
         + 4.0 * texture(u_src, v_uv).rgb;
  o = vec4(s / 16.0, 1.0);
}`;

const COMPOSITE_FS = `${HEADER}
uniform sampler2D u_scene, u_bloom;
uniform vec2 u_res;
uniform float u_bloomAmt, u_exposure, u_fade, u_flash, u_vignette, u_grain, u_time, u_ca, u_sat;
uniform vec3 u_tint, u_flashColor;
in vec2 v_uv; out vec4 o;
${HASH}
vec3 tonemap(vec3 x) {
  const float k = 0.62;
  vec3 over = max(x - k, 0.0);
  return min(x, vec3(k)) + (1.0 - k) * (1.0 - exp(-over / (1.0 - k)));
}
void main() {
  vec2 dc = v_uv - 0.5;
  vec3 col;
  if (u_ca > 0.0) {
    vec2 off = dc * dot(dc, dc) * u_ca;
    col = vec3(texture(u_scene, v_uv - off).r, texture(u_scene, v_uv).g, texture(u_scene, v_uv + off).b);
  } else {
    col = texture(u_scene, v_uv).rgb;
  }
  col += texture(u_bloom, v_uv).rgb * u_bloomAmt;
  col = max(col * u_exposure * u_tint, 0.0);
  float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
  col = max(mix(vec3(l), col, u_sat), 0.0);
  col = tonemap(col);
  col = mix(col, u_flashColor, clamp(u_flash, 0.0, 1.0));
  float r = length(dc * vec2(u_res.x / u_res.y, 1.0));
  col *= 1.0 - u_vignette * smoothstep(0.3, 1.15, r);
  col *= u_fade;
  float n = hash12(gl_FragCoord.xy + fract(u_time * 7.13) * 431.0) - 0.5;
  col += n * (u_grain * (0.4 + 0.6 * sqrt(max(l, 0.0))) + 1.5 / 255.0);
  o = vec4(col, 1.0);
}`;

const SPRITE_VS = `${HEADER}
in vec2 a_pos; in vec2 a_size; in vec2 a_rs; in vec4 a_color; in vec2 a_param;
uniform vec2 u_view; uniform vec3 u_cam; uniform float u_rs;
out vec2 v_q; out vec4 v_color; flat out int v_shape; out vec2 v_param; out float v_pxr;
void main() {
  vec2 corner = vec2(float(gl_VertexID & 1), float((gl_VertexID >> 1) & 1)) * 2.0 - 1.0;
  float c = cos(a_rs.x), s = sin(a_rs.x);
  vec2 local = corner * a_size * u_cam.z;
  vec2 p = a_pos * u_cam.z + u_cam.xy + vec2(c * local.x - s * local.y, s * local.x + c * local.y);
  v_q = corner; v_color = a_color; v_shape = int(a_rs.y + 0.5); v_param = a_param;
  v_pxr = max(a_size.x, a_size.y) * u_cam.z * u_rs;
  vec2 clip = p / u_view * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

const SPRITE_FS = `${HEADER}
in vec2 v_q; in vec4 v_color; flat in int v_shape; in vec2 v_param; in float v_pxr;
out vec4 o;
void main() {
  float r = length(v_q);
  float a = 0.0;
  vec3 col = v_color.rgb;
  float aa = 1.6 / max(v_pxr, 1.0);
  if (v_shape == 0) {            // soft glow
    a = exp(-r * r * 5.0);
  } else if (v_shape == 1) {     // crisp disc
    a = 1.0 - smoothstep(1.0 - aa, 1.0, r);
  } else if (v_shape == 2) {     // lit sphere (param.x = specular, param.y = rim glow)
    a = 1.0 - smoothstep(1.0 - aa, 1.0, r);
    vec3 n = vec3(v_q.x, -v_q.y, sqrt(max(0.0, 1.0 - r * r)));
    vec3 L = normalize(vec3(-0.5, 0.6, 0.72));
    float diff = max(dot(n, L), 0.0);
    float spec = pow(max(dot(reflect(-L, n), vec3(0.0, 0.0, 1.0)), 0.0), 28.0);
    float rim = pow(1.0 - n.z, 2.5);
    col = col * (0.18 + 0.9 * diff) + vec3(spec) * v_param.x + col * rim * v_param.y;
  } else if (v_shape == 3) {     // ring (param.x = thickness as fraction of radius)
    float w = max(v_param.x, 0.015);
    float d = (r - (1.0 - w * 1.5)) / w;
    a = exp(-d * d * 2.0);
  } else if (v_shape == 4) {     // star flare (param.x = spike strength)
    float g = exp(-r * r * 14.0) * 1.4 + exp(-r * 5.0) * 0.18;
    float sx = exp(-abs(v_q.y) * 70.0) * pow(max(0.0, 1.0 - abs(v_q.x)), 4.0);
    float sy = exp(-abs(v_q.x) * 70.0) * pow(max(0.0, 1.0 - abs(v_q.y)), 4.0);
    a = g + (sx + sy) * v_param.x;
  } else if (v_shape == 5) {     // soft-edged disc (param.x = edge softness)
    a = 1.0 - smoothstep(1.0 - max(v_param.x, aa), 1.0, r);
  } else if (v_shape == 6) {     // hollow bubble: faint body, bright rim, highlight
    float edge = 1.0 - smoothstep(1.0 - aa, 1.0, r);
    float rim = smoothstep(0.55, 0.97, r) * edge;
    float hl = exp(-dot(v_q - vec2(-0.35, -0.4), v_q - vec2(-0.35, -0.4)) * 30.0);
    a = edge * 0.12 + rim * 0.75 + hl * 0.8;
  }
  float al = a * v_color.a;
  o = vec4(col * al, al);
}`;

const LINE_VS = `${HEADER}
in vec4 a_seg; in vec2 a_ws; in vec4 a_c0; in vec4 a_c1;
uniform vec2 u_view; uniform vec3 u_cam; uniform float u_rs;
out vec2 v_l; out float v_len; out float v_hw; out float v_soft; out vec4 v_c0; out vec4 v_c1;
void main() {
  vec2 p0 = a_seg.xy * u_cam.z + u_cam.xy, p1 = a_seg.zw * u_cam.z + u_cam.xy;
  float hw = a_ws.x * u_cam.z;
  float aa = 1.0 / u_rs;
  vec2 d = p1 - p0; float len = length(d);
  vec2 dir = len > 1e-5 ? d / len : vec2(1.0, 0.0);
  vec2 nrm = vec2(-dir.y, dir.x);
  float ext = max(hw, 0.0) + aa * 1.5;
  if (a_ws.y > 0.0) ext = max(ext, hw * 1.6);
  float t = float(gl_VertexID & 1);
  float s = float((gl_VertexID >> 1) & 1) * 2.0 - 1.0;
  float along = mix(-ext, len + ext, t);
  vec2 p = p0 + dir * along + nrm * s * ext;
  v_l = vec2(along, s * ext); v_len = len; v_hw = hw; v_soft = a_ws.y; v_c0 = a_c0; v_c1 = a_c1;
  vec2 clip = p / u_view * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
}`;

const LINE_FS = `${HEADER}
in vec2 v_l; in float v_len; in float v_hw; in float v_soft; in vec4 v_c0; in vec4 v_c1;
uniform float u_rs;
out vec4 o;
void main() {
  float x = clamp(v_l.x, 0.0, v_len);
  float d = length(vec2(v_l.x - x, v_l.y));
  float aa = 0.8 / u_rs;
  float hard = 1.0 - smoothstep(v_hw - aa, v_hw + aa, d);
  hard *= min(1.0, (v_hw + aa) / (2.0 * aa));
  float soft = exp(-d * d / max(v_hw * v_hw, 1e-4) * 2.2);
  float a = mix(hard, soft, v_soft);
  vec4 c = mix(v_c0, v_c1, v_len > 0.0 ? x / v_len : 0.0);
  float al = c.a * a;
  o = vec4(c.rgb * al, al);
}`;

const BLEND = {
  add: (gl) => { gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); },
  over: (gl) => { gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); },
  screen: (gl) => { gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR); },
  // dst *= (1 - src.a): darken what is already there (dust lanes, shadows)
  darken: (gl) => { gl.enable(gl.BLEND); gl.blendFunc(gl.ZERO, gl.ONE_MINUS_SRC_ALPHA); },
  none: (gl) => { gl.disable(gl.BLEND); },
};

// ── instanced batches ───────────────────────────────────────────────────────

class InstanceBatch {
  constructor(R, program, layout, max) {
    const gl = (this.gl = R.gl);
    this.R = R;
    this.prog = program;
    this.stride = layout.reduce((s, [, n]) => s + n, 0);
    this.max = max;
    this.data = new Float32Array(max * this.stride);
    this.n = 0;
    this.cam = [0, 0, 1];
    this.vao = gl.createVertexArray();
    this.buf = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, this.data.byteLength, gl.DYNAMIC_DRAW);
    let off = 0;
    for (const [name, k] of layout) {
      const loc = gl.getAttribLocation(program.p, name);
      if (loc >= 0) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, k, gl.FLOAT, false, this.stride * 4, off * 4);
        gl.vertexAttribDivisor(loc, 1);
      }
      off += k;
    }
    gl.bindVertexArray(null);
  }

  /** 2D camera applied in the shader: screen = p * zoom + (tx, ty). */
  setCam(tx = 0, ty = 0, zoom = 1) { this.cam = [tx, ty, zoom]; return this; }

  /** Blend mode used if the batch overflows and must flush early. */
  begin(mode = 'add') { this.mode = mode; return this; }

  flush(mode = this.mode || 'add') {
    this.mode = mode;
    if (!this.n) return;
    const gl = this.gl, R = this.R;
    BLEND[mode](gl);
    this.prog.use().set('u_view', [R.W, R.H]).set('u_cam', this.cam).set('u_rs', R.rs);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.data, 0, this.n * this.stride);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.n);
    gl.bindVertexArray(null);
    this.n = 0;
  }

  _slot() {
    if (this.n >= this.max) this.flush();
    return this.n++ * this.stride;
  }
}

export const SHAPE = { glow: 0, disc: 1, sphere: 2, ring: 3, flare: 4, soft: 5, bubble: 6 };

class SpriteBatch extends InstanceBatch {
  constructor(R) {
    super(R, new Program(R.gl, SPRITE_VS, SPRITE_FS, 'sprite'),
      [['a_pos', 2], ['a_size', 2], ['a_rs', 2], ['a_color', 4], ['a_param', 2]], 1 << 16);
  }
  /** Round sprite. c = [r, g, b] (HDR allowed), a = alpha / intensity. */
  add(x, y, r, c, a = 1, shape = 0, p0 = 0, p1 = 0) {
    const d = this.data, i = this._slot();
    d[i] = x; d[i + 1] = y; d[i + 2] = r; d[i + 3] = r; d[i + 4] = 0; d[i + 5] = shape;
    d[i + 6] = c[0]; d[i + 7] = c[1]; d[i + 8] = c[2]; d[i + 9] = a; d[i + 10] = p0; d[i + 11] = p1;
  }
  /** Stretched / rotated sprite. */
  addEx(x, y, rx, ry, rot, c, a = 1, shape = 0, p0 = 0, p1 = 0) {
    const d = this.data, i = this._slot();
    d[i] = x; d[i + 1] = y; d[i + 2] = rx; d[i + 3] = ry; d[i + 4] = rot; d[i + 5] = shape;
    d[i + 6] = c[0]; d[i + 7] = c[1]; d[i + 8] = c[2]; d[i + 9] = a; d[i + 10] = p0; d[i + 11] = p1;
  }
}

class LineBatch extends InstanceBatch {
  constructor(R) {
    super(R, new Program(R.gl, LINE_VS, LINE_FS, 'line'),
      [['a_seg', 4], ['a_ws', 2], ['a_c0', 4], ['a_c1', 4]], 1 << 16);
  }
  /** Segment with half-width w (CSS px), softness 0 (crisp) .. 1 (gaussian glow). */
  add(x0, y0, x1, y1, w, c0, a0 = 1, c1 = c0, a1 = a0, soft = 0) {
    const d = this.data, i = this._slot();
    d[i] = x0; d[i + 1] = y0; d[i + 2] = x1; d[i + 3] = y1; d[i + 4] = w; d[i + 5] = soft;
    d[i + 6] = c0[0]; d[i + 7] = c0[1]; d[i + 8] = c0[2]; d[i + 9] = a0;
    d[i + 10] = c1[0]; d[i + 11] = c1[1]; d[i + 12] = c1[2]; d[i + 13] = a1;
  }
  /** Polyline through flat [x0, y0, x1, y1, ...]. */
  poly(pts, w, c, a = 1, soft = 0, closed = false) {
    const n = pts.length >> 1;
    for (let k = 0; k < n - 1; k++) this.add(pts[2 * k], pts[2 * k + 1], pts[2 * k + 2], pts[2 * k + 3], w, c, a, c, a, soft);
    if (closed && n > 2) this.add(pts[2 * n - 2], pts[2 * n - 1], pts[0], pts[1], w, c, a, c, a, soft);
  }
}

// ── renderer ────────────────────────────────────────────────────────────────

export class Renderer {
  constructor(canvas, { scale = 1.5 } = {}) {
    const gl = canvas.getContext('webgl2', {
      antialias: false, alpha: false, depth: false, stencil: false,
      premultipliedAlpha: false, preserveDrawingBuffer: false, powerPreference: 'high-performance',
    });
    if (!gl) throw new Error('This piece needs WebGL2.');
    this.gl = gl;
    this.canvas = canvas;
    this.hdr = !!gl.getExtension('EXT_color_buffer_float');
    this.scaleCap = scale;
    this.time = 0;
    this.emptyVAO = gl.createVertexArray();
    this.programs = new Map();

    this.p = {
      blit: this.fsProgram(BLIT_FS, 'blit'),
      down: this.fsProgram(DOWN_FS, 'bloom-down'),
      up: this.fsProgram(UP_FS, 'bloom-up'),
      composite: this.fsProgram(COMPOSITE_FS, 'composite'),
    };

    this.A = new Target(gl, 4, 4, this.hdr);
    this.B = new Target(gl, 4, 4, this.hdr);
    this.half = new Target(gl, 4, 4, this.hdr);
    this.cur = this.A;
    this.mips = [];

    this.layer = document.createElement('canvas');
    this.g = this.layer.getContext('2d');
    this.layerTex = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, this.layerTex);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    this.layerDirty = false;

    this.sprites = new SpriteBatch(this);
    this.lines = new LineBatch(this);
    this.resize();
  }

  // ── setup ───────────────────────────────────────────────────────────────

  program(vs, fs, label) {
    const key = label + '\0' + vs + '\0' + fs;
    let p = this.programs.get(key);
    if (!p) { p = new Program(this.gl, vs, fs, label); this.programs.set(key, p); }
    return p;
  }
  fsProgram(fs, label) { return this.program(FULLSCREEN_VS, fs, label); }

  resize() {
    const W = Math.max(1, window.innerWidth), H = Math.max(1, window.innerHeight);
    const rs = Math.min(window.devicePixelRatio || 1, this.scaleCap);
    this.W = W; this.H = H; this.rs = rs;
    const pw = Math.max(1, Math.round(W * rs)), ph = Math.max(1, Math.round(H * rs));
    this.pw = pw; this.ph = ph;
    this.canvas.width = pw; this.canvas.height = ph;
    this.A.resize(pw, ph);
    this.B.resize(pw, ph);
    this.half.resize(pw >> 1, ph >> 1);
    const gl = this.gl;
    let w = pw >> 1, h = ph >> 1, i = 0;
    while (i < 7 && w >= 4 && h >= 4) {
      if (!this.mips[i]) this.mips[i] = new Target(gl, w, h, this.hdr);
      else this.mips[i].resize(w, h);
      w >>= 1; h >>= 1; i++;
    }
    this.mips.length = i;
    this.layer.width = pw; this.layer.height = ph;
  }

  // ── drawing primitives for scenes ──────────────────────────────────────

  blend(mode) { BLEND[mode](this.gl); }

  clear(r = 0, g = 0, b = 0, a = 1) {
    const gl = this.gl;
    gl.clearColor(r, g, b, a);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }

  /** Fullscreen pass with a program built by fsProgram(); u_view/u_res/u_time/u_rs set automatically. */
  pass(prog, uniforms = {}, mode = 'none') {
    const gl = this.gl;
    BLEND[mode](gl);
    prog.use().set('u_view', [this.W, this.H]).set('u_res', [this.pw, this.ph]).set('u_time', this.time).set('u_rs', this.rs);
    prog.setAll(uniforms);
    gl.bindVertexArray(this.emptyVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }

  /** Begin drawing into the 2D layer (CSS-pixel coordinates). Returns the 2D context. */
  begin2D() {
    const g = this.g;
    if (!this.layerDirty) {
      g.setTransform(1, 0, 0, 1, 0, 0);
      g.clearRect(0, 0, this.pw, this.ph);
    }
    g.setTransform(this.rs, 0, 0, this.rs, 0, 0);
    g.globalAlpha = 1;
    g.globalCompositeOperation = 'source-over';
    g.filter = 'none';
    this.layerDirty = true;
    return g;
  }

  /** Composite the 2D layer onto the current target. gain > 1 pushes it into bloom range. */
  flush2D(gain = 1, mode = 'over') {
    if (!this.layerDirty) return;
    const gl = this.gl;
    gl.bindTexture(gl.TEXTURE_2D, this.layerTex);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.layer);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
    this.pass(this.p.blit, { u_tex: this.layerTex, u_gain: gain }, mode);
    this.layerDirty = false;
  }

  /**
   * Run `fn` into a half-resolution buffer, then composite it onto the current
   * target. For soft, expensive fullscreen shaders (plasma, nebulae, fog).
   */
  lowres(fn, mode = 'add', gain = 1) {
    const back = this.cur;
    this.half.bind();
    this.clear(0, 0, 0, 0);
    fn();
    back.bind();
    this.pass(this.p.blit, { u_tex: this.half.tex, u_gain: gain }, mode);
  }

  // ── frame orchestration (used by the Director) ─────────────────────────

  bindScene(target) {
    this.cur = target;
    target.bind();
    this.clear(0, 0, 0, 1);
    this.sprites.setCam();
    this.lines.setCam();
  }

  /** dst = mix(dst, src, t) */
  mixInto(dst, src, t) {
    const gl = this.gl;
    dst.bind();
    gl.enable(gl.BLEND);
    gl.blendColor(0, 0, 0, t);
    gl.blendFunc(gl.CONSTANT_ALPHA, gl.ONE_MINUS_CONSTANT_ALPHA);
    this.p.blit.use().set('u_tex', src.tex).set('u_gain', 1);
    gl.bindVertexArray(this.emptyVAO);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
    gl.disable(gl.BLEND);
  }

  present(src, post) {
    const gl = this.gl;
    gl.disable(gl.BLEND);
    // bloom: downsample chain
    let prev = src;
    for (let i = 0; i < this.mips.length; i++) {
      const m = this.mips[i];
      m.bind();
      this.p.down.use()
        .set('u_src', prev.tex)
        .set('u_texel', [1 / prev.w, 1 / prev.h])
        .set('u_threshold', post.threshold)
        .set('u_knee', post.knee)
        .set('u_first', i === 0 ? 1 : 0);
      gl.bindVertexArray(this.emptyVAO);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      prev = m;
    }
    // upsample + accumulate
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    for (let i = this.mips.length - 1; i > 0; i--) {
      const s = this.mips[i], d = this.mips[i - 1];
      d.bind();
      this.p.up.use().set('u_src', s.tex).set('u_texel', [1 / s.w, 1 / s.h]).set('u_radius', post.bloomRadius);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    gl.disable(gl.BLEND);
    // composite to screen
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, this.pw, this.ph);
    this.p.composite.use()
      .set('u_scene', src.tex)
      .set('u_bloom', this.mips.length ? this.mips[0].tex : src.tex)
      .set('u_res', [this.pw, this.ph])
      .set('u_bloomAmt', this.mips.length ? post.bloom : 0)
      .set('u_exposure', post.exposure)
      .set('u_fade', post.fade)
      .set('u_flash', post.flash)
      .set('u_flashColor', post.flashColor)
      .set('u_vignette', post.vignette)
      .set('u_grain', post.grain)
      .set('u_ca', post.ca)
      .set('u_sat', post.sat)
      .set('u_tint', post.tint)
      .set('u_time', this.time);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    gl.bindVertexArray(null);
  }
}

export const DEFAULT_POST = {
  bloom: 0.9, bloomRadius: 1.0, threshold: 0.35, knee: 0.3,
  exposure: 1, fade: 1, flash: 0, flashColor: [1, 1, 1],
  vignette: 0.45, grain: 0.03, ca: 0.0, sat: 1, tint: [1, 1, 1],
};

/** Interpolate two post-setting objects (for crossfades). */
export function mixPost(a, b, t) {
  const out = {};
  for (const k in DEFAULT_POST) {
    const x = a[k] ?? DEFAULT_POST[k], y = b[k] ?? DEFAULT_POST[k];
    out[k] = Array.isArray(x) ? x.map((v, i) => v + (y[i] - v) * t) : x + (y - x) * t;
  }
  return out;
}
