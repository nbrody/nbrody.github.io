/* AutoViz kit · gl — WebGL2 helpers for shader-driven pages (domain colouring, escape-time
   fractals, tilings evaluated per pixel). Use with AV.page({ stage: 'webgl2' }); labels go on
   app.octx, the 2D overlay the kit creates above a WebGL stage. Exposed as AV.gl. */
(function (root) {
  'use strict';
  const AV = root.AV || (root.AV = {});

  // Full-screen triangle; fragment shaders receive `in vec2 uv` in [0,1]².
  const QUAD_VS = `#version 300 es
in vec2 p; out vec2 uv;
void main() { uv = p * 0.5 + 0.5; gl_Position = vec4(p, 0.0, 1.0); }`;

  // Shared GLSL snippets: kit palette + OKLab-ish ramp, so shaders match canvas pages.
  const GLSL = `
const vec3 AV_BG = vec3(0.027, 0.035, 0.051);
const vec3 AV_INK = vec3(0.925, 0.922, 0.902);
const vec3 AV_ACCENT = vec3(0.431, 0.906, 0.847);
const vec3 AV_AMBER = vec3(1.0, 0.722, 0.42);
const vec3 AV_ROSE = vec3(1.0, 0.478, 0.576);
const vec3 AV_BLUE = vec3(0.525, 0.667, 1.0);
vec3 av_ramp(float t) {               // aurora: indigo → sky → teal → cream → amber → rose
  t = clamp(t, 0.0, 1.0) * 5.0;
  vec3 c0 = vec3(0.353, 0.388, 0.910), c1 = vec3(0.310, 0.722, 0.902), c2 = AV_ACCENT;
  vec3 c3 = vec3(0.953, 0.867, 0.604), c4 = AV_AMBER, c5 = AV_ROSE;
  if (t < 1.0) return mix(c0, c1, t);
  if (t < 2.0) return mix(c1, c2, t - 1.0);
  if (t < 3.0) return mix(c2, c3, t - 2.0);
  if (t < 4.0) return mix(c3, c4, t - 3.0);
  return mix(c4, c5, t - 4.0);
}
vec3 av_cycle(float t) {              // cyclic, for angles/phases: teal → blue → violet → rose → amber → teal
  t = fract(t) * 5.0;
  vec3 c0 = AV_ACCENT, c1 = AV_BLUE, c2 = vec3(0.706, 0.612, 1.0), c3 = AV_ROSE, c4 = AV_AMBER;
  if (t < 1.0) return mix(c0, c1, smoothstep(0.0, 1.0, t));
  if (t < 2.0) return mix(c1, c2, smoothstep(0.0, 1.0, t - 1.0));
  if (t < 3.0) return mix(c2, c3, smoothstep(0.0, 1.0, t - 2.0));
  if (t < 4.0) return mix(c3, c4, smoothstep(0.0, 1.0, t - 3.0));
  return mix(c4, c0, smoothstep(0.0, 1.0, t - 4.0));
}`;

  function program(gl, vs, fs) {
    const sh = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) + '\n' + src.split('\n').map((l, i) => (i + 1) + ': ' + l).join('\n'));
      return s;
    };
    const p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs || QUAD_VS));
    gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs.replace('//#AV', GLSL)));
    gl.bindAttribLocation(p, 0, 'p');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
    const loc = {};
    p.u = name => (name in loc ? loc[name] : (loc[name] = gl.getUniformLocation(p, name)));
    // p.set({ uTime: 1.2, uRes: [w, h], uColor: [r, g, b] }) — floats, vec2–4, or {i: n} for ints.
    p.set = values => {
      gl.useProgram(p);
      for (const k in values) {
        const v = values[k], L = p.u(k);
        if (L === null) continue;
        if (typeof v === 'number') gl.uniform1f(L, v);
        else if (v && typeof v.i === 'number') gl.uniform1i(L, v.i);
        else if (v.length === 2) gl.uniform2fv(L, v);
        else if (v.length === 3) gl.uniform3fv(L, v);
        else if (v.length === 4) gl.uniform4fv(L, v);
        else if (v.length === 9) gl.uniformMatrix3fv(L, false, v);
        else if (v.length === 16) gl.uniformMatrix4fv(L, false, v);
      }
      return p;
    };
    return p;
  }

  function quad(gl) {
    const vao = gl.createVertexArray();
    gl.bindVertexArray(vao);
    const b = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, b);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.bindVertexArray(null);
    return { draw(prog) { gl.useProgram(prog); gl.bindVertexArray(vao); gl.drawArrays(gl.TRIANGLES, 0, 3); } };
  }

  // Restrict drawing to a pane (or {x,y,w,h} in CSS px); returns [w, h] in device pixels.
  function viewport(gl, app, rect) {
    const d = app.dpr, r = rect || { x: 0, y: 0, w: app.W, h: app.H };
    const x = Math.round(r.x * d), y = Math.round((app.H - r.y - r.h) * d), w = Math.round(r.w * d), h = Math.round(r.h * d);
    gl.viewport(x, y, w, h);
    gl.enable(gl.SCISSOR_TEST);
    gl.scissor(x, y, w, h);
    return [w, h];
  }

  // RGBA8 or float texture from typed data.
  function texture(gl, w, h, data, { float = false, filter = 'linear', wrap = 'clamp' } = {}) {
    const t = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, t);
    if (float) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, data || null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, data || null);
    const f = filter === 'nearest' || float ? gl.NEAREST : gl.LINEAR, wr = wrap === 'repeat' ? gl.REPEAT : gl.CLAMP_TO_EDGE;
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, wr);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, wr);
    return t;
  }

  AV.gl = { program, quad, viewport, texture, QUAD_VS, GLSL };
})(typeof window !== 'undefined' ? window : globalThis);
