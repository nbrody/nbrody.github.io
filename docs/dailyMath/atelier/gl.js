/* Daily Math Atelier — WebGL2 utilities & synchronized dual-mode GLSL palette */
(function (root) {
  'use strict';
  const DM = (root.DM = root.DM || {});

  const PALETTE_GLSL = `
uniform float u_dark;
vec3 dm_bg()        { return mix(vec3(0.961, 0.945, 0.910), vec3(0.039, 0.047, 0.071), u_dark); }
vec3 dm_bg_alt()    { return mix(vec3(0.925, 0.898, 0.843), vec3(0.075, 0.094, 0.149), u_dark); }
vec3 dm_ink()       { return mix(vec3(0.110, 0.098, 0.082), vec3(0.933, 0.918, 0.878), u_dark); }
vec3 dm_cobalt()    { return mix(vec3(0.122, 0.306, 0.588), vec3(0.463, 0.663, 0.980), u_dark); }
vec3 dm_vermilion() { return mix(vec3(0.722, 0.231, 0.157), vec3(0.949, 0.486, 0.408), u_dark); }
vec3 dm_verdigris() { return mix(vec3(0.106, 0.451, 0.396), vec3(0.369, 0.831, 0.745), u_dark); }
vec3 dm_ochre()     { return mix(vec3(0.620, 0.384, 0.067), vec3(0.910, 0.722, 0.361), u_dark); }
vec3 dm_plum()      { return mix(vec3(0.424, 0.239, 0.549), vec3(0.761, 0.600, 0.949), u_dark); }

vec3 dm_ramp(float t) {
  float u = clamp(t, 0.0, 1.0);
  vec3 c0 = dm_bg_alt();
  vec3 c1 = dm_cobalt();
  vec3 c2 = dm_verdigris();
  vec3 c3 = dm_ochre();
  if (u < 0.333) return mix(c0, c1, u * 3.0);
  if (u < 0.666) return mix(c1, c2, (u - 0.333) * 3.0);
  return mix(c2, c3, (u - 0.666) * 3.0);
}

vec3 dm_cycle(float t) {
  float a = 6.2831853 * fract(t);
  return clamp(0.56 + 0.36 * cos(a + vec3(0.0, 2.094, 4.189)), 0.0, 1.0);
}
`;

  const DEFAULT_VERT = `#version 300 es
layout(location = 0) in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = 0.5 * (a_pos + 1.0);
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

  function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      const log = gl.getShaderInfoLog(s);
      gl.deleteShader(s);
      throw new Error('Shader compile error:\n' + log);
    }
    return s;
  }

  function injectPalette(frag) {
    if (!frag.includes('//#DM_PALETTE')) return frag;
    return frag.replace('//#DM_PALETTE', PALETTE_GLSL);
  }

  DM.gl = {
    program(gl, fragSrc, vertSrc = DEFAULT_VERT) {
      const vs = compile(gl, gl.VERTEX_SHADER, vertSrc);
      const fs = compile(gl, gl.FRAGMENT_SHADER, injectPalette(fragSrc));
      const prog = gl.createProgram();
      gl.attachShader(prog, vs);
      gl.attachShader(prog, fs);
      gl.linkProgram(prog);
      if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) {
        throw new Error('Program link error:\n' + gl.getProgramInfoLog(prog));
      }
      const cache = new Map();
      const loc = name => {
        if (!cache.has(name)) cache.set(name, gl.getUniformLocation(prog, name));
        return cache.get(name);
      };
      return {
        raw: prog,
        use(app) {
          gl.useProgram(prog);
          const uDark = loc('u_dark');
          if (uDark && app) gl.uniform1f(uDark, app.theme === 'dark' ? 1.0 : 0.0);
        },
        f1: (n, v) => { const l = loc(n); if (l) gl.uniform1f(l, v); },
        f2: (n, x, y) => { const l = loc(n); if (l) gl.uniform2f(l, x, y); },
        f3: (n, x, y, z) => { const l = loc(n); if (l) gl.uniform3f(l, x, y, z); },
        f4: (n, x, y, z, w) => { const l = loc(n); if (l) gl.uniform4f(l, x, y, z, w); },
        i1: (n, v) => { const l = loc(n); if (l) gl.uniform1i(l, v); },
      };
    },
    quad(gl) {
      const vao = gl.createVertexArray();
      gl.bindVertexArray(vao);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      gl.enableVertexAttribArray(0);
      gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
      return {
        draw() {
          gl.bindVertexArray(vao);
          gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        },
      };
    },
    viewport(gl, app, rect) {
      const d = app.dpr;
      const r = rect || { x: 0, y: 0, w: app.W, h: app.H };
      const vx = Math.round(r.x * d);
      const vy = Math.round((app.H - (r.y + r.h)) * d);
      const vw = Math.round(r.w * d);
      const vh = Math.round(r.h * d);
      gl.enable(gl.SCISSOR_TEST);
      gl.viewport(vx, vy, vw, vh);
      gl.scissor(vx, vy, vw, vh);
    },
  };
})(typeof window !== 'undefined' ? window : globalThis);
