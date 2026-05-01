// WebGL2 Gray–Scott reaction–diffusion on ping-pong float textures.
//
// State texture stores (u, v) in the (R, G) channels.
// Boundary: clamp-to-edge with manual neumann mirror would be cleaner,
// but periodic (REPEAT) reads fine for Turing-style runs and is what
// most published examples use.

const SIM_VERT = `#version 300 es
in vec2 aPos;
out vec2 vUv;
void main() {
    vUv = 0.5 * (aPos + 1.0);
    gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const SIM_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uState;
uniform vec2 uTexel;
uniform float uDu, uDv, uF, uK, uDt;
in vec2 vUv;
out vec4 fragColor;

void main() {
    vec2 c  = texture(uState, vUv).rg;
    vec2 n  = texture(uState, vUv + vec2(0.0,  uTexel.y)).rg;
    vec2 s  = texture(uState, vUv + vec2(0.0, -uTexel.y)).rg;
    vec2 e  = texture(uState, vUv + vec2( uTexel.x, 0.0)).rg;
    vec2 w  = texture(uState, vUv + vec2(-uTexel.x, 0.0)).rg;
    vec2 ne = texture(uState, vUv + vec2( uTexel.x,  uTexel.y)).rg;
    vec2 nw = texture(uState, vUv + vec2(-uTexel.x,  uTexel.y)).rg;
    vec2 se = texture(uState, vUv + vec2( uTexel.x, -uTexel.y)).rg;
    vec2 sw = texture(uState, vUv + vec2(-uTexel.x, -uTexel.y)).rg;

    // 9-point isotropic Laplacian (Patra & Karttunen weights).
    vec2 lap = 0.2  * (n + s + e + w)
             + 0.05 * (ne + nw + se + sw)
             - 1.0  * c;

    float u = c.r;
    float v = c.g;
    float reaction = u * v * v;

    float du = uDu * lap.r - reaction + uF * (1.0 - u);
    float dv = uDv * lap.g + reaction - (uF + uK) * v;

    float newU = clamp(u + du * uDt, 0.0, 1.5);
    float newV = clamp(v + dv * uDt, 0.0, 1.5);

    fragColor = vec4(newU, newV, 0.0, 1.0);
}
`;

const PAINT_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uState;
uniform vec2 uCenter;     // 0..1
uniform float uRadius;    // in uv units
uniform float uAspect;    // texW / texH
uniform int uShape;       // 0 circle, 1 rect
uniform int uMode;        // 0 add v, 1 erase (set u=1, v=0), 2 set u=0,v=1
in vec2 vUv;
out vec4 fragColor;

void main() {
    vec2 st = texture(uState, vUv).rg;
    vec2 d = vUv - uCenter;
    d.x *= uAspect;

    float inside;
    if (uShape == 0) {
        float r = length(d);
        inside = smoothstep(uRadius, uRadius * 0.6, r);
    } else {
        vec2 q = abs(d) / vec2(uRadius);
        float m = max(q.x, q.y);
        inside = smoothstep(1.0, 0.7, m);
    }

    if (uMode == 0) {
        // Paint v: lower u, raise v in the disk.
        st.r = mix(st.r, 0.5, inside * 0.9);
        st.g = mix(st.g, 0.5, inside * 0.9);
    } else if (uMode == 1) {
        // Erase: restore the trivial state u=1, v=0.
        st.r = mix(st.r, 1.0, inside);
        st.g = mix(st.g, 0.0, inside);
    } else {
        // "Strong" seed: u=0, v=1 within the disk.
        st.r = mix(st.r, 0.0, inside);
        st.g = mix(st.g, 1.0, inside);
    }

    fragColor = vec4(st, 0.0, 1.0);
}
`;

const DISPLAY_FRAG = `#version 300 es
precision highp float;
uniform sampler2D uState;
uniform int uPalette;
in vec2 vUv;
out vec4 fragColor;

vec3 paletteGold(float t) {
    // background ink → gold highlight
    vec3 bg   = vec3(0.055, 0.043, 0.027);
    vec3 mid  = vec3(0.40,  0.22,  0.07);
    vec3 hi   = vec3(0.92,  0.74,  0.30);
    vec3 lit  = vec3(1.00,  0.95,  0.78);
    t = clamp(t, 0.0, 1.0);
    if (t < 0.5) return mix(bg, mid, t / 0.5);
    if (t < 0.85) return mix(mid, hi, (t - 0.5) / 0.35);
    return mix(hi, lit, (t - 0.85) / 0.15);
}

vec3 paletteIce(float t) {
    vec3 bg  = vec3(0.03, 0.04, 0.06);
    vec3 mid = vec3(0.10, 0.30, 0.50);
    vec3 hi  = vec3(0.50, 0.78, 0.96);
    vec3 lit = vec3(0.92, 0.98, 1.00);
    t = clamp(t, 0.0, 1.0);
    if (t < 0.5) return mix(bg, mid, t / 0.5);
    if (t < 0.85) return mix(mid, hi, (t - 0.5) / 0.35);
    return mix(hi, lit, (t - 0.85) / 0.15);
}

vec3 paletteEmber(float t) {
    vec3 bg  = vec3(0.04, 0.02, 0.02);
    vec3 mid = vec3(0.45, 0.10, 0.04);
    vec3 hi  = vec3(0.95, 0.45, 0.10);
    vec3 lit = vec3(1.00, 0.92, 0.55);
    t = clamp(t, 0.0, 1.0);
    if (t < 0.5) return mix(bg, mid, t / 0.5);
    if (t < 0.85) return mix(mid, hi, (t - 0.5) / 0.35);
    return mix(hi, lit, (t - 0.85) / 0.15);
}

vec3 paletteMono(float t) {
    return vec3(clamp(t, 0.0, 1.0));
}

void main() {
    vec2 st = texture(uState, vUv).rg;
    // v ∈ [0, ~0.5] for most patterns; remap.
    float v = clamp(st.g * 2.0, 0.0, 1.0);

    vec3 col;
    if (uPalette == 0) col = paletteGold(v);
    else if (uPalette == 1) col = paletteIce(v);
    else if (uPalette == 2) col = paletteEmber(v);
    else col = paletteMono(v);

    fragColor = vec4(col, 1.0);
}
`;

function compile(gl, type, src) {
    const sh = gl.createShader(type);
    gl.shaderSource(sh, src);
    gl.compileShader(sh);
    if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
        const info = gl.getShaderInfoLog(sh);
        gl.deleteShader(sh);
        throw new Error('Shader compile failed: ' + info + '\n' + src);
    }
    return sh;
}

function link(gl, vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, vs);
    gl.attachShader(p, fs);
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        throw new Error('Program link failed: ' + gl.getProgramInfoLog(p));
    }
    return p;
}

export class GrayScott {
    constructor(canvas, opts = {}) {
        this.canvas = canvas;
        const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: false });
        if (!gl) throw new Error('WebGL2 not supported');
        this.gl = gl;

        if (!gl.getExtension('EXT_color_buffer_float')) {
            throw new Error('EXT_color_buffer_float not supported');
        }
        // Optional: lets us sample float textures with LINEAR for smooth display.
        this.canFilterFloat = !!gl.getExtension('OES_texture_float_linear');

        this.width = opts.width || 512;
        this.height = opts.height || 512;

        // Shaders
        const vs = compile(gl, gl.VERTEX_SHADER, SIM_VERT);
        this.simProg = link(gl, vs, compile(gl, gl.FRAGMENT_SHADER, SIM_FRAG));
        this.paintProg = link(gl, vs, compile(gl, gl.FRAGMENT_SHADER, PAINT_FRAG));
        this.dispProg = link(gl, vs, compile(gl, gl.FRAGMENT_SHADER, DISPLAY_FRAG));

        // Fullscreen quad
        const quad = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
            -1, -1,  1, -1, -1,  1,
            -1,  1,  1, -1,  1,  1
        ]), gl.STATIC_DRAW);
        this.quad = quad;

        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);

        for (const prog of [this.simProg, this.paintProg, this.dispProg]) {
            const loc = gl.getAttribLocation(prog, 'aPos');
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        }
        gl.bindVertexArray(null);

        // Two ping-pong textures + framebuffers
        this.tex = [this._createStateTex(), this._createStateTex()];
        this.fbo = [this._createFbo(this.tex[0]), this._createFbo(this.tex[1])];
        this.read = 0;
        this.write = 1;

        // Parameters (defaults: classic "spots")
        this.params = {
            Du: 0.16,
            Dv: 0.08,
            F: 0.035,
            k: 0.065,
            dt: 1.0,
            stepsPerFrame: 20,
        };
        this.palette = 0;
        this.steps = 0;

        // Cache uniform locations
        this._loc = {
            sim: {
                state: gl.getUniformLocation(this.simProg, 'uState'),
                texel: gl.getUniformLocation(this.simProg, 'uTexel'),
                Du: gl.getUniformLocation(this.simProg, 'uDu'),
                Dv: gl.getUniformLocation(this.simProg, 'uDv'),
                F:  gl.getUniformLocation(this.simProg, 'uF'),
                k:  gl.getUniformLocation(this.simProg, 'uK'),
                dt: gl.getUniformLocation(this.simProg, 'uDt'),
            },
            paint: {
                state:  gl.getUniformLocation(this.paintProg, 'uState'),
                center: gl.getUniformLocation(this.paintProg, 'uCenter'),
                radius: gl.getUniformLocation(this.paintProg, 'uRadius'),
                aspect: gl.getUniformLocation(this.paintProg, 'uAspect'),
                shape:  gl.getUniformLocation(this.paintProg, 'uShape'),
                mode:   gl.getUniformLocation(this.paintProg, 'uMode'),
            },
            disp: {
                state: gl.getUniformLocation(this.dispProg, 'uState'),
                pal:   gl.getUniformLocation(this.dispProg, 'uPalette'),
            },
        };

        this.initEmpty();
    }

    _createStateTex() {
        const gl = this.gl;
        const tex = gl.createTexture();
        gl.bindTexture(gl.TEXTURE_2D, tex);
        // RGBA32F is the only float-target format guaranteed to be
        // color-renderable with EXT_color_buffer_float across drivers.
        // RG32F readback works fine, but rendering to it silently no-ops on
        // some platforms (we hit this — draws bypassed and state stayed stale).
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, this.width, this.height, 0, gl.RGBA, gl.FLOAT, null);
        // LINEAR sampling on float textures requires OES_texture_float_linear.
        // Without it, drivers sample 0 silently and the simulation collapses
        // on step 1. Fall back to NEAREST when the extension is missing.
        const filt = this.canFilterFloat ? gl.LINEAR : gl.NEAREST;
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filt);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filt);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.REPEAT);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.REPEAT);
        return tex;
    }

    _createFbo(tex) {
        const gl = this.gl;
        const fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
        const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
        if (status !== gl.FRAMEBUFFER_COMPLETE) {
            throw new Error('FBO incomplete: 0x' + status.toString(16));
        }
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        return fbo;
    }

    setSize(width, height) {
        if (width === this.width && height === this.height) return;
        const gl = this.gl;
        this.width = width;
        this.height = height;
        for (const t of this.tex) gl.deleteTexture(t);
        for (const f of this.fbo) gl.deleteFramebuffer(f);
        this.tex = [this._createStateTex(), this._createStateTex()];
        this.fbo = [this._createFbo(this.tex[0]), this._createFbo(this.tex[1])];
        this.read = 0; this.write = 1;
        this.initEmpty();
    }

    setParam(name, value) {
        this.params[name] = value;
    }

    setPalette(idx) {
        this.palette = idx;
    }

    // --- Initial states ---

    _uploadFullState(arr) {
        // Pack (u, v) into RGBA32F (B, A unused).
        const gl = this.gl;
        const rgba = new Float32Array(this.width * this.height * 4);
        for (let i = 0; i < this.width * this.height; i++) {
            rgba[4 * i + 0] = arr[2 * i + 0];
            rgba[4 * i + 1] = arr[2 * i + 1];
            // rgba[4 * i + 2] = 0; rgba[4 * i + 3] = 0; (already zero)
        }
        gl.bindTexture(gl.TEXTURE_2D, this.tex[this.read]);
        gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, this.width, this.height, gl.RGBA, gl.FLOAT, rgba);
        this.steps = 0;
    }

    initEmpty() {
        const arr = new Float32Array(this.width * this.height * 2);
        for (let i = 0; i < this.width * this.height; i++) {
            arr[2 * i + 0] = 1.0;
            arr[2 * i + 1] = 0.0;
        }
        this._uploadFullState(arr);
    }

    initRandom(_unused) {
        // Random low-frequency-ish patches of v on a u=1 background.
        // Pure pixel-scale noise gets eaten by diffusion before patterns can
        // bootstrap, so we drop coarse blobs and stipple them with finer noise.
        const arr = new Float32Array(this.width * this.height * 2);
        for (let i = 0; i < this.width * this.height; i++) {
            arr[2 * i + 0] = 1.0;
            arr[2 * i + 1] = 0.0;
        }
        const minDim = Math.min(this.width, this.height);
        const blobs = 40;
        for (let b = 0; b < blobs; b++) {
            const cx = Math.random() * this.width;
            const cy = Math.random() * this.height;
            const r = (0.015 + 0.06 * Math.random()) * minDim;
            const r2 = r * r;
            const x0 = Math.max(0, Math.floor(cx - r));
            const x1 = Math.min(this.width, Math.ceil(cx + r));
            const y0 = Math.max(0, Math.floor(cy - r));
            const y1 = Math.min(this.height, Math.ceil(cy + r));
            for (let y = y0; y < y1; y++) {
                for (let x = x0; x < x1; x++) {
                    const dx = x - cx, dy = y - cy;
                    if (dx * dx + dy * dy < r2) {
                        const i = y * this.width + x;
                        arr[2 * i + 0] = 0.5;
                        arr[2 * i + 1] = 0.5;
                    }
                }
            }
        }
        // Light per-pixel jitter for symmetry breaking.
        for (let i = 0; i < this.width * this.height; i++) {
            arr[2 * i + 1] += (Math.random() - 0.5) * 0.04;
            if (arr[2 * i + 1] < 0) arr[2 * i + 1] = 0;
        }
        this._uploadFullState(arr);
    }

    initCenterSeed(radius = 0.10) {
        const arr = new Float32Array(this.width * this.height * 2);
        const cx = this.width / 2, cy = this.height / 2;
        const r = radius * Math.min(this.width, this.height);
        for (let y = 0; y < this.height; y++) {
            for (let x = 0; x < this.width; x++) {
                const i = y * this.width + x;
                const dx = x - cx, dy = y - cy;
                const inside = (dx * dx + dy * dy) < r * r;
                // Pearson-style seed: u=0.5, v=0.5 inside the disk on a (1, 0)
                // background. Sits inside the unstable manifold so the disk
                // grows under spot-forming kinetics.
                arr[2 * i + 0] = inside ? 0.5 : 1.0;
                arr[2 * i + 1] = inside ? 0.5 : 0.0;
            }
        }
        for (let i = 0; i < this.width * this.height; i++) {
            arr[2 * i + 1] += (Math.random() - 0.5) * 0.04;
            if (arr[2 * i + 1] < 0) arr[2 * i + 1] = 0;
        }
        this._uploadFullState(arr);
    }

    initSplatter(blobs = 24) {
        const arr = new Float32Array(this.width * this.height * 2);
        for (let i = 0; i < this.width * this.height; i++) {
            arr[2 * i + 0] = 1.0;
            arr[2 * i + 1] = 0.0;
        }
        const minDim = Math.min(this.width, this.height);
        for (let b = 0; b < blobs; b++) {
            const cx = Math.random() * this.width;
            const cy = Math.random() * this.height;
            const r = (0.02 + 0.05 * Math.random()) * minDim;
            const r2 = r * r;
            const x0 = Math.max(0, Math.floor(cx - r));
            const x1 = Math.min(this.width, Math.ceil(cx + r));
            const y0 = Math.max(0, Math.floor(cy - r));
            const y1 = Math.min(this.height, Math.ceil(cy + r));
            for (let y = y0; y < y1; y++) {
                for (let x = x0; x < x1; x++) {
                    const dx = x - cx, dy = y - cy;
                    if (dx * dx + dy * dy < r2) {
                        const i = y * this.width + x;
                        arr[2 * i + 0] = 0.5;
                        arr[2 * i + 1] = 0.5;
                    }
                }
            }
        }
        this._uploadFullState(arr);
    }

    // --- Painting (interactive) ---

    paint({ u, v, radius, shape, mode }) {
        // u, v are uv-space [0,1]; radius is uv-space (relative to short axis).
        const gl = this.gl;
        gl.useProgram(this.paintProg);
        gl.bindVertexArray(this.vao);

        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo[this.write]);
        gl.viewport(0, 0, this.width, this.height);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.tex[this.read]);
        gl.uniform1i(this._loc.paint.state, 0);

        gl.uniform2f(this._loc.paint.center, u, v);
        gl.uniform1f(this._loc.paint.radius, radius);
        gl.uniform1f(this._loc.paint.aspect, this.width / this.height);
        gl.uniform1i(this._loc.paint.shape, shape === 'rect' ? 1 : 0);
        let modeI = 0;
        if (mode === 'erase') modeI = 1;
        else if (mode === 'strong') modeI = 2;
        gl.uniform1i(this._loc.paint.mode, modeI);

        gl.drawArrays(gl.TRIANGLES, 0, 6);
        this._swap();
    }

    // --- Stepping ---

    step(n = 1) {
        const gl = this.gl;
        gl.useProgram(this.simProg);
        gl.bindVertexArray(this.vao);

        gl.uniform2f(this._loc.sim.texel, 1 / this.width, 1 / this.height);
        gl.uniform1f(this._loc.sim.Du, this.params.Du);
        gl.uniform1f(this._loc.sim.Dv, this.params.Dv);
        gl.uniform1f(this._loc.sim.F,  this.params.F);
        gl.uniform1f(this._loc.sim.k,  this.params.k);
        gl.uniform1f(this._loc.sim.dt, this.params.dt);

        for (let i = 0; i < n; i++) {
            gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo[this.write]);
            gl.viewport(0, 0, this.width, this.height);
            gl.activeTexture(gl.TEXTURE0);
            gl.bindTexture(gl.TEXTURE_2D, this.tex[this.read]);
            gl.uniform1i(this._loc.sim.state, 0);
            gl.drawArrays(gl.TRIANGLES, 0, 6);
            this._swap();
        }
        this.steps += n;
    }

    render() {
        const gl = this.gl;
        gl.useProgram(this.dispProg);
        gl.bindVertexArray(this.vao);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.tex[this.read]);
        gl.uniform1i(this._loc.disp.state, 0);
        gl.uniform1i(this._loc.disp.pal, this.palette);
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    _swap() {
        const t = this.read; this.read = this.write; this.write = t;
    }
}
