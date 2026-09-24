// gl.js — thin WebGL2 helpers: shader programs with typed uniform setters,
// and render targets (HDR when the GPU can render to half-float).

function compile(gl, type, src, label) {
  const s = gl.createShader(type);
  gl.shaderSource(s, src);
  gl.compileShader(s);
  if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
    const log = gl.getShaderInfoLog(s);
    const numbered = src.split('\n').map((l, i) => `${String(i + 1).padStart(4)}: ${l}`).join('\n');
    console.error(`[${label}] shader compile failed:\n${log}\n${numbered}`);
    throw new Error(`[${label}] ${log}`);
  }
  return s;
}

export class Program {
  constructor(gl, vs, fs, label = 'program') {
    this.gl = gl;
    this.label = label;
    const p = gl.createProgram();
    gl.attachShader(p, compile(gl, gl.VERTEX_SHADER, vs, label + '.vs'));
    gl.attachShader(p, compile(gl, gl.FRAGMENT_SHADER, fs, label + '.fs'));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
      throw new Error(`[${label}] link: ${gl.getProgramInfoLog(p)}`);
    }
    this.p = p;
    this.u = {};
    const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (let i = 0; i < n; i++) {
      const info = gl.getActiveUniform(p, i);
      const name = info.name.replace(/\[0\]$/, '');
      this.u[name] = { loc: gl.getUniformLocation(p, info.name), type: info.type, size: info.size };
    }
    this.unit = 0;
  }

  use() {
    this.gl.useProgram(this.p);
    this.unit = 0;
    return this;
  }

  /** Set a uniform by name; the GLSL type decides the setter. Unknown names are ignored. */
  set(name, v) {
    const u = this.u[name];
    if (!u || v === undefined) return this;
    const gl = this.gl, L = u.loc;
    switch (u.type) {
      case gl.FLOAT: u.size > 1 ? gl.uniform1fv(L, v) : gl.uniform1f(L, v); break;
      case gl.FLOAT_VEC2: gl.uniform2fv(L, v); break;
      case gl.FLOAT_VEC3: gl.uniform3fv(L, v); break;
      case gl.FLOAT_VEC4: gl.uniform4fv(L, v); break;
      case gl.INT: case gl.BOOL: u.size > 1 ? gl.uniform1iv(L, v) : gl.uniform1i(L, v); break;
      case gl.FLOAT_MAT3: gl.uniformMatrix3fv(L, false, v); break;
      case gl.FLOAT_MAT4: gl.uniformMatrix4fv(L, false, v); break;
      case gl.SAMPLER_2D: {
        const unit = this.unit++;
        gl.activeTexture(gl.TEXTURE0 + unit);
        gl.bindTexture(gl.TEXTURE_2D, v);
        gl.uniform1i(L, unit);
        break;
      }
      default: break;
    }
    return this;
  }

  setAll(obj) {
    for (const k in obj) this.set(k, obj[k]);
    return this;
  }
}

export class Target {
  constructor(gl, w, h, hdr) {
    this.gl = gl;
    this.hdr = hdr;
    this.tex = gl.createTexture();
    this.fb = gl.createFramebuffer();
    this.resize(w, h);
  }

  resize(w, h) {
    const gl = this.gl;
    this.w = Math.max(1, w | 0);
    this.h = Math.max(1, h | 0);
    gl.bindTexture(gl.TEXTURE_2D, this.tex);
    if (this.hdr) gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, this.w, this.h, 0, gl.RGBA, gl.HALF_FLOAT, null);
    else gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, this.w, this.h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.tex, 0);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  }

  bind() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.fb);
    gl.viewport(0, 0, this.w, this.h);
  }
}

/** Upload a Float32Array into a data texture (RGBA32F), e.g. for per-scene lookup tables. */
export function dataTexture(gl, w, h, data) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, w, h, 0, gl.RGBA, gl.FLOAT, data);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}

/**
 * A static interleaved vertex buffer drawn as GL_POINTS with a custom program.
 * `layout` is [[attribName, components], ...] in interleaved order.
 */
export class PointCloud {
  constructor(gl, program, data, layout) {
    this.gl = gl;
    this.prog = program;
    const stride = layout.reduce((s, [, n]) => s + n, 0);
    this.count = data.length / stride;
    this.vao = gl.createVertexArray();
    this.buf = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buf);
    gl.bufferData(gl.ARRAY_BUFFER, data, gl.STATIC_DRAW);
    let off = 0;
    for (const [name, n] of layout) {
      const loc = gl.getAttribLocation(program.p, name);
      if (loc >= 0) {
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, n, gl.FLOAT, false, stride * 4, off * 4);
      }
      off += n;
    }
    gl.bindVertexArray(null);
  }

  draw(count = this.count, first = 0) {
    const gl = this.gl;
    gl.bindVertexArray(this.vao);
    gl.drawArrays(gl.POINTS, first, Math.min(count, this.count - first));
    gl.bindVertexArray(null);
  }
}
