// ═══════════════════════════════════════════════════════════════════
//  Ice Wall — WebGL2 pipeline
//
//  flow (¼ res) → height (MRT: exact R32F + mipmapped RGBA16F info)
//  → shade (MRT: HDR colour + bloom/star buffer, both mipmapped)
//  → composite (canvas). Render targets are sized to canvas × scale;
//  the composite upsamples.
// ═══════════════════════════════════════════════════════════════════

(function () {
  'use strict';

  const SH = window.IceWallShaders;
  const LOOK = window.IceWallLook;

  class IceWallRenderer {
    constructor(canvas, { noFloat = false } = {}) {
      this.canvas = canvas;
      const gl = canvas.getContext('webgl2', {
        alpha: false, antialias: false, depth: false, stencil: false,
        preserveDrawingBuffer: true, powerPreference: 'high-performance',
      });
      if (!gl) throw new Error('This page needs WebGL 2.');
      this.gl = gl;
      this.float = !noFloat && !!gl.getExtension('EXT_color_buffer_float');
      this.vao = gl.createVertexArray();
      this.targets = null;
      this.rampBytes = new Uint8Array(LOOK.RAMP_N * 4);
      this.buildPrograms();
      this.rampTex = this.texture(LOOK.RAMP_N, 1, gl.SRGB8_ALPHA8, { filter: gl.LINEAR });
    }

    // ─── programs ───
    buildPrograms() {
      const defines = this.float ? [] : ['NO_FLOAT'];
      if (this.programs) for (const p of Object.values(this.programs)) this.gl.deleteProgram(p.program);
      this.programs = {};
      for (const pass of ['flow', 'height', 'shade', 'composite']) {
        this.programs[pass] = this.program(SH.build(pass, defines), pass);
      }
    }

    program(fragSrc, label) {
      const gl = this.gl;
      const compile = (type, src) => {
        const s = gl.createShader(type);
        gl.shaderSource(s, src);
        gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
          const log = gl.getShaderInfoLog(s);
          gl.deleteShader(s);
          throw new Error(`${label} shader failed to compile:\n${log}`);
        }
        return s;
      };
      const vs = compile(gl.VERTEX_SHADER, SH.VERT);
      const fs = compile(gl.FRAGMENT_SHADER, fragSrc);
      const program = gl.createProgram();
      gl.attachShader(program, vs);
      gl.attachShader(program, fs);
      gl.linkProgram(program);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(`${label} program failed to link:\n${gl.getProgramInfoLog(program)}`);
      }
      const uniforms = {};
      const n = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS);
      for (let i = 0; i < n; i++) {
        const info = gl.getActiveUniform(program, i);
        uniforms[info.name] = { loc: gl.getUniformLocation(program, info.name), type: info.type };
      }
      return { program, uniforms };
    }

    use(p, values) {
      const gl = this.gl;
      gl.useProgram(p.program);
      for (const name in p.uniforms) {
        const v = values[name];
        if (v === undefined) continue;
        const { loc, type } = p.uniforms[name];
        switch (type) {
          case gl.FLOAT: gl.uniform1f(loc, v); break;
          case gl.FLOAT_VEC2: gl.uniform2fv(loc, v); break;
          case gl.FLOAT_VEC3: gl.uniform3fv(loc, v); break;
          case gl.FLOAT_VEC4: gl.uniform4fv(loc, v); break;
          default: gl.uniform1i(loc, v);
        }
      }
    }

    // ─── textures & targets ───
    texture(w, h, internal, { mips = false, filter } = {}) {
      const gl = this.gl;
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      const levels = mips ? Math.floor(Math.log2(Math.max(w, h))) + 1 : 1;
      gl.texStorage2D(gl.TEXTURE_2D, levels, internal, w, h);
      const f = filter ?? gl.LINEAR;
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, mips ? gl.LINEAR_MIPMAP_LINEAR : f);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, f);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    }

    framebuffer(textures) {
      const gl = this.gl;
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
      textures.forEach((t, i) => gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0 + i, gl.TEXTURE_2D, t, 0));
      gl.drawBuffers(textures.map((_, i) => gl.COLOR_ATTACHMENT0 + i));
      const ok = gl.checkFramebufferStatus(gl.FRAMEBUFFER) === gl.FRAMEBUFFER_COMPLETE;
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      return ok ? fb : null;
    }

    freeTargets() {
      const gl = this.gl, T = this.targets;
      if (!T) return;
      for (const k of ['flowTex', 'preciseTex', 'infoTex', 'colorTex', 'brightTex']) gl.deleteTexture(T[k]);
      for (const k of ['flowFb', 'heightFb', 'shadeFb']) gl.deleteFramebuffer(T[k]);
      this.targets = null;
    }

    /** (Re)allocate render targets for a render size. Falls back to 8-bit targets if float fails. */
    ensureTargets(rw, rh) {
      if (this.targets && this.targets.rw === rw && this.targets.rh === rh) return;
      this.freeTargets();
      const gl = this.gl;
      const fw = Math.max(1, Math.ceil(rw / 4)), fh = Math.max(1, Math.ceil(rh / 4));
      const F = this.float;
      const T = { rw, rh, fw, fh };
      T.flowTex = this.texture(fw, fh, F ? gl.RGBA16F : gl.RGBA8);
      T.preciseTex = this.texture(rw, rh, F ? gl.R32F : gl.RGBA8, { filter: gl.NEAREST });
      T.infoTex = this.texture(rw, rh, F ? gl.RGBA16F : gl.RGBA8, { mips: true });
      T.colorTex = this.texture(rw, rh, F ? gl.RGBA16F : gl.RGBA8, { mips: true });
      T.brightTex = this.texture(rw, rh, F ? gl.RGBA16F : gl.RGBA8, { mips: true });
      T.flowFb = this.framebuffer([T.flowTex]);
      T.heightFb = this.framebuffer([T.preciseTex, T.infoTex]);
      T.shadeFb = this.framebuffer([T.colorTex, T.brightTex]);
      this.targets = T;
      if (!(T.flowFb && T.heightFb && T.shadeFb)) {
        if (!this.float) throw new Error('Could not create render targets.');
        console.warn('Ice Wall: float render targets unavailable, using 8-bit fallback.');
        this.float = false;
        this.freeTargets();
        this.buildPrograms();
        this.ensureTargets(rw, rh);
      }
    }

    setRamp(linearRamp) {
      const gl = this.gl;
      LOOK.rampBytes(linearRamp, this.rampBytes);
      gl.bindTexture(gl.TEXTURE_2D, this.rampTex);
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, LOOK.RAMP_N, 1, gl.RGBA, gl.UNSIGNED_BYTE, this.rampBytes);
    }

    bind(unit, tex) {
      const gl = this.gl;
      gl.activeTexture(gl.TEXTURE0 + unit);
      gl.bindTexture(gl.TEXTURE_2D, tex);
    }

    mip(tex) {
      const gl = this.gl;
      gl.bindTexture(gl.TEXTURE_2D, tex);
      gl.generateMipmap(gl.TEXTURE_2D);
    }

    /**
     * Draw one frame. `u` carries every uniform (by GLSL name) plus:
     *   renderW/renderH  internal resolution, canvasW/canvasH  output size.
     */
    render(u) {
      const gl = this.gl;
      this.ensureTargets(u.renderW, u.renderH);
      const T = this.targets, P = this.programs;
      gl.bindVertexArray(this.vao);
      gl.disable(gl.BLEND);
      gl.disable(gl.DEPTH_TEST);

      // 1. flow
      gl.bindFramebuffer(gl.FRAMEBUFFER, T.flowFb);
      gl.viewport(0, 0, T.fw, T.fh);
      this.use(P.flow, { ...u, uRes: [T.fw, T.fh] });
      gl.drawArrays(gl.TRIANGLES, 0, 3);

      // 2. height
      gl.bindFramebuffer(gl.FRAMEBUFFER, T.heightFb);
      gl.viewport(0, 0, T.rw, T.rh);
      this.bind(0, T.flowTex);
      this.use(P.height, { ...u, uRes: [T.rw, T.rh], uFlow: 0 });
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.mip(T.infoTex);

      // 3. shade
      gl.bindFramebuffer(gl.FRAMEBUFFER, T.shadeFb);
      this.bind(0, T.preciseTex);
      this.bind(1, T.infoTex);
      this.bind(2, T.flowTex);
      this.bind(3, this.rampTex);
      this.use(P.shade, { ...u, uRes: [T.rw, T.rh], uPrecise: 0, uInfo: 1, uFlow: 2, uRamp: 3 });
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      this.mip(T.brightTex);
      if (u.uLed > 0.5) this.mip(T.colorTex);

      // 4. composite
      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, u.canvasW, u.canvasH);
      this.bind(0, T.colorTex);
      this.bind(1, T.brightTex);
      this.use(P.composite, { ...u, uColor: 0, uBright: 1, uCanvas: [u.canvasW, u.canvasH] });
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      for (let i = 3; i >= 0; i--) this.bind(i, null);
    }
  }

  window.IceWallRenderer = IceWallRenderer;
})();
