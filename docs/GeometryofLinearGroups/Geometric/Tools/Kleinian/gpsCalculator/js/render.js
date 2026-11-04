// render.js — WebGL2 picture of the splitting in the universal cover.
//
// Every pixel is a point of ℍⁿ (n = 2: the Poincaré disk; n = 3: either a
// totally geodesic cross-section, or the sphere at infinity seen as a globe,
// sampled at depth ρ). The point is reflected into the Coxeter polytope P one
// wall at a time, and the same letters are multiplied into the finite group
// G = Γ/Γ(N) through the right-multiplication table. The tile it lands in, as
// an element of G, names the piece of M′ it covers; walls of that tile that
// belong to the cut hypersurface are drawn as heavy lines.

const VS = `#version 300 es
in vec2 aPos;
void main() { gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float;
precision highp int;
uniform int uMode;            // 0 plane (disk / cross-section), 1 sphere at infinity
uniform int uK;
uniform vec4 uWalls[32];      // unit normals (x, y, z, t); inside P ⟺ ⟨y, w⟩ ≤ 0
uniform mat4 uView;           // Lorentz matrix: screen model → world
uniform mat4 uViewInv;
uniform highp isampler2D uR;
uniform highp isampler2D uPiece;
uniform highp usampler2D uMark;
uniform int uTW;
uniform vec2 uRes;
uniform float uScale;         // disk radius in device pixels
uniform float uRho;
uniform int uMaxIt;
uniform vec3 uPal[8];
uniform vec3 uBg;
uniform vec3 uRim;
uniform vec3 uEdge;
uniform vec3 uSigma;
uniform vec3 uSigma2;
uniform vec3 uLift;
uniform float uLineW;
layout(location = 0) out vec4 outColor;
layout(location = 1) out int outId;     // region id (tree distance, piece) for the edge pass

float ldot(vec4 a, vec4 b) { return dot(a.xyz, b.xyz) - a.w * b.w; }
ivec2 tc(int i) { return ivec2(i % uTW, i / uTW); }

mat4 reflM(vec4 w) {
    // x ↦ x − 2⟨x, w⟩ w as a matrix
    return mat4(1.0) - 2.0 * outerProduct(w, vec4(w.xyz, -w.w));
}

void main() {
    vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / uScale;
    float r2 = dot(p, p);
    float px = 1.0 / uScale;
    if (r2 >= 1.0) {
        float e = sqrt(r2) - 1.0;
        outColor = vec4(mix(uRim, uBg, smoothstep(0.0, 2.5 * px, e)), 1.0);
        outId = -1;
        return;
    }
    vec4 y;
    vec3 d = vec3(0.0);
    if (uMode == 1) {
        d = vec3(p, sqrt(1.0 - r2));
        y = vec4(sinh(uRho) * d, cosh(uRho));
    } else {
        float s = 1.0 - r2;
        y = vec4(2.0 * p / s, 0.0, (1.0 + r2) / s);
    }
    y = uView * y;
    int g = 0;
    int par = 0;
    int depth = 0;                 // lifts of the cut hypersurface crossed = distance in the Bass–Serre tree
    mat4 M = mat4(1.0);            // product of the reflections used (sphere view only)
    for (int it = 0; it < 600; it++) {
        if (it >= uMaxIt) break;
        float best = 1e-6; int bj = -1;
        for (int j = 0; j < 32; j++) {
            if (j >= uK) break;
            float v = ldot(y, uWalls[j]);
            if (v > best) { best = v; bj = j; }
        }
        if (bj < 0) break;
        y -= 2.0 * best * uWalls[bj];
        if (uMode == 1) M = M * reflM(uWalls[bj]);
        uint mk = texelFetch(uMark, tc(g * uK + bj), 0).r;
        if (mk == 1u || mk == 2u) depth++;
        g = texelFetch(uR, tc(g * uK + bj), 0).r;
        par = 1 - par;
        if ((it & 7) == 7) y /= sqrt(max(-ldot(y, y), 1e-30));
    }
    int pc = texelFetch(uPiece, tc(g), 0).r;
    // tone by tree distance, so neighbouring lifts of the same piece differ
    float tone = (depth % 2 == 1) ? 0.72 : 1.0;
    if (depth % 4 >= 2) tone *= 0.9;
    vec3 col = uPal[pc % 8] * tone;

    if (uMode == 1) {
        // faint tile edges on the sphere of radius ρ: distance on screen to the curve
        // where a wall's plane meets the sphere, |f|/|∇f| for f(p) = ⟨y(p), n⟩
        float wEdge = 1e9;
        for (int j = 0; j < 32; j++) {
            if (j >= uK) break;
            float h = -ldot(y, uWalls[j]);
            if (h > 1.5) continue;
            vec4 n = uViewInv * (M * uWalls[j]);
            float f = sinh(uRho) * dot(d, n.xyz) - cosh(uRho) * n.w;
            vec3 dx = vec3(1.0, 0.0, -p.x / d.z), dy = vec3(0.0, 1.0, -p.y / d.z);
            float gr = sinh(uRho) * length(vec2(dot(n.xyz, dx), dot(n.xyz, dy)));
            wEdge = min(wEdge, abs(f) / max(gr, 1e-9) * uScale);
        }
        col *= (par == 1 ? 0.96 : 1.0);
        col = mix(col, uEdge, (1.0 - smoothstep(0.2 * uLineW, 0.2 * uLineW + 1.0, wEdge)) * 0.3);
        col *= mix(0.86, 1.0, sqrt(max(d.z, 0.0)));
        outColor = vec4(col, 1.0);
        // the lifts of the cut hypersurface are drawn by the edge pass, where this id jumps
        outId = depth * 16 + pc;
        return;
    }
    col *= (par == 1 ? 0.95 : 1.0);

    // walls of the final tile near the point
    float wSigma = 1e9, wSigma2 = 1e9, wLift = 1e9, wEdge = 1e9;
    for (int j = 0; j < 32; j++) {
        if (j >= uK) break;
        float h = -ldot(y, uWalls[j]);
        if (h > 3.0) continue;
        uint mk = texelFetch(uMark, tc(g * uK + j), 0).r;
        float dpx = asinh(max(h, 0.0)) * (1.0 - r2) * 0.5 * uScale;   // distance in device pixels
        if (mk == 1u) wSigma = min(wSigma, dpx);
        else if (mk == 2u) wSigma2 = min(wSigma2, dpx);
        else if (mk == 3u) wLift = min(wLift, dpx);
        else wEdge = min(wEdge, dpx);
    }
    float L = uLineW;
    col = mix(col, uEdge, (1.0 - smoothstep(0.25 * L, 0.25 * L + 1.0, wEdge)) * 0.5);
    col = mix(col, uLift, (1.0 - smoothstep(0.3 * L, 0.3 * L + 1.0, wLift)) * 0.6);
    col = mix(col, uSigma2, 1.0 - smoothstep(0.9 * L, 0.9 * L + 1.0, wSigma2));
    col = mix(col, uSigma, 1.0 - smoothstep(1.1 * L, 1.1 * L + 1.0, wSigma));
    outColor = vec4(col, 1.0);
    outId = -1;
}`;

// Edge pass: copy the colour, and paint the cut hypersurface wherever the
// region id differs from a neighbour within radius uRad.
const FS_EDGE = `#version 300 es
precision highp float;
precision highp int;
uniform sampler2D uCol;
uniform highp isampler2D uId;
uniform vec3 uSigma;
uniform int uRad;
out vec4 o;
void main() {
    ivec2 q = ivec2(gl_FragCoord.xy);
    ivec2 sz = textureSize(uId, 0);
    vec4 c = texelFetch(uCol, q, 0);
    int id = texelFetch(uId, q, 0).r;
    if (id >= 0) {
        float diff = 0.0, tot = 0.0;
        for (int dy = -3; dy <= 3; dy++) for (int dx = -3; dx <= 3; dx++) {
            if (dx * dx + dy * dy > uRad * uRad) continue;
            ivec2 r = clamp(q + ivec2(dx, dy), ivec2(0), sz - 1);
            int o2 = texelFetch(uId, r, 0).r;
            if (o2 < 0) continue;
            tot += 1.0;
            if (o2 != id) diff += 1.0;
        }
        c.rgb = mix(c.rgb, uSigma, clamp(3.0 * diff / max(tot, 1.0), 0.0, 1.0));
    }
    o = c;
}`;

// ---------------- Lorentz 4×4 helpers (row-major arrays, form x² + y² + z² − t²) ----------------

const J = [1, 1, 1, -1];
export const ldot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2] - a[3] * b[3];
const I4 = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function mul4(A, B) {
    const C = new Array(16).fill(0);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += A[i * 4 + k] * B[k * 4 + j]; C[i * 4 + j] = s; }
    return C;
}
const apply4 = (A, x) => [0, 1, 2, 3].map(i => A[i * 4] * x[0] + A[i * 4 + 1] * x[1] + A[i * 4 + 2] * x[2] + A[i * 4 + 3] * x[3]);
function refl4(w) {
    const ww = ldot(w, w);
    const M = I4();
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) M[i * 4 + j] -= 2 * w[i] * J[j] * w[j] / ww;
    return M;
}
/** The translation along the geodesic taking hyperboloid point a to b. */
function translation(a, b) {
    const w = b.map((x, i) => x - a[i]);
    if (Math.abs(ldot(w, w)) < 1e-14) return I4();
    const ab = ldot(a, b);
    const t = a.map((x, i) => x + ab * b[i]);
    if (Math.abs(ldot(t, t)) < 1e-14) return refl4(w);
    return mul4(refl4(t), refl4(w));
}
function rotation(u, v) {
    // rotation of ℝ³ taking unit u to unit v
    const c = u[0] * v[0] + u[1] * v[1] + u[2] * v[2];
    const ax = [u[1] * v[2] - u[2] * v[1], u[2] * v[0] - u[0] * v[2], u[0] * v[1] - u[1] * v[0]];
    const s = Math.hypot(...ax);
    if (s < 1e-12) return I4();
    const k = ax.map(x => x / s);
    const K = [0, -k[2], k[1], k[2], 0, -k[0], -k[1], k[0], 0];
    const R = I4();
    for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
        let kk = 0; for (let t = 0; t < 3; t++) kk += K[i * 3 + t] * K[t * 3 + j];
        R[i * 4 + j] = (i === j ? 1 : 0) + s * K[i * 3 + j] + (1 - c) * kk;
    }
    return R;
}
function boostZ(s) {
    const M = I4();
    M[10] = Math.cosh(s); M[11] = Math.sinh(s); M[14] = Math.sinh(s); M[15] = Math.cosh(s);
    return M;
}
/** Lorentz inverse: J Aᵀ J. */
function linv(A) {
    const B = new Array(16);
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) B[i * 4 + j] = J[i] * A[j * 4 + i] * J[j];
    return B;
}
/** Re-orthonormalise a drifting Lorentz matrix (columns), Gram–Schmidt from the time column. */
function clean(A) {
    const col = j => [0, 1, 2, 3].map(i => A[i * 4 + j]);
    const cols = [col(3), col(0), col(1), col(2)];
    const out = [];
    for (let c = 0; c < 4; c++) {
        let v = cols[c].slice();
        for (const u of out) { const f = ldot(v, u) / ldot(u, u); v = v.map((x, i) => x - f * u[i]); }
        const nn = Math.sqrt(Math.abs(ldot(v, v)));
        out.push(v.map(x => x / nn));
    }
    const [t, x, y, z] = out;
    const B = new Array(16);
    for (let i = 0; i < 4; i++) { B[i * 4] = x[i]; B[i * 4 + 1] = y[i]; B[i * 4 + 2] = z[i]; B[i * 4 + 3] = t[i]; }
    return B;
}

const diskPoint = (p) => { const r2 = p[0] * p[0] + p[1] * p[1], s = 1 - r2; return [2 * p[0] / s, 2 * p[1] / s, 0, (1 + r2) / s]; };

export class SplitRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        const gl = canvas.getContext('webgl2', { antialias: false, preserveDrawingBuffer: true });
        this.gl = gl;
        if (!gl) { this.failed = 'WebGL2 is not available in this browser'; return; }
        const prog = this.program(VS, FS);
        if (!prog) return;
        this.prog = prog;
        this.edgeProg = this.program(VS, FS_EDGE);
        if (!this.edgeProg) return;
        const buf = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, buf);
        gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
        const loc = gl.getAttribLocation(prog, 'aPos');
        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);
        gl.enableVertexAttribArray(loc);
        gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
        this.u = {};
        for (const name of ['uMode', 'uK', 'uWalls', 'uView', 'uViewInv', 'uR', 'uPiece', 'uMark', 'uTW', 'uRes', 'uScale', 'uRho', 'uMaxIt', 'uPal', 'uBg', 'uRim', 'uEdge', 'uSigma', 'uSigma2', 'uLift', 'uLineW']) {
            this.u[name] = gl.getUniformLocation(prog, name);
        }
        this.ue = {};
        for (const name of ['uCol', 'uId', 'uSigma', 'uRad']) this.ue[name] = gl.getUniformLocation(this.edgeProg, name);
        this.V = I4();
        this.mode = 'plane';
        this.zoom = 0;
        this.rho = 3.2;
        this.attach();
    }

    program(vs, fs) {
        const gl = this.gl;
        const sh = (type, src) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, src); gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) { this.failed = gl.getShaderInfoLog(s); return null; }
            return s;
        };
        const v = sh(gl.VERTEX_SHADER, vs), f = sh(gl.FRAGMENT_SHADER, fs);
        if (!v || !f) return null;
        const p = gl.createProgram();
        gl.attachShader(p, v); gl.attachShader(p, f); gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) { this.failed = gl.getProgramInfoLog(p); return null; }
        return p;
    }

    /** data: { n, k, walls (unit normals, std coords [x,y,(z),t]), R, pieceOf, mark, order } */
    setData(data) {
        if (this.failed) return;
        const gl = this.gl;
        this.data = data;
        const TW = 4096;
        this.TW = TW;
        const mkTex = (arr, internal, format, type) => {
            const len = arr.length;
            const h = Math.max(1, Math.ceil(len / TW));
            const padded = new arr.constructor(TW * h);
            padded.set(arr);
            const t = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, t);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
            gl.pixelStorei(gl.UNPACK_ALIGNMENT, 1);
            gl.texImage2D(gl.TEXTURE_2D, 0, internal, TW, h, 0, format, type, padded);
            return t;
        };
        for (const t of [this.tR, this.tP, this.tM]) if (t) gl.deleteTexture(t);
        this.tR = mkTex(Int32Array.from(data.R), gl.R32I, gl.RED_INTEGER, gl.INT);
        this.tP = mkTex(Int32Array.from(data.pieceOf), gl.R32I, gl.RED_INTEGER, gl.INT);
        this.tM = mkTex(Uint8Array.from(data.mark), gl.R8UI, gl.RED_INTEGER, gl.UNSIGNED_BYTE);
        this.mode = data.n === 2 ? 'plane' : (this.mode === 'plane' && this.n === 3 ? 'plane' : 'sphere');
        this.n = data.n;
        const W = new Float32Array(32 * 4);
        data.walls.forEach((w, j) => {
            const v = data.n === 2 ? [w[0], w[1], 0, w[2]] : w;
            W.set(v, 4 * j);
        });
        this.W = W;
        // home view: face the hypersurface. Its wall normal points (in the model
        // centred at P) towards H; turn that direction to the viewer (sphere) or
        // to the right of the disk (plane), so H is in the middle of the picture.
        const w = data.walls[data.i0 ?? 0];
        const u = data.n === 2 ? [w[0], w[1], 0] : [w[0], w[1], w[2]];
        const L = Math.hypot(...u) || 1;
        this.dirH = u.map(x => x / L);
        this.V = this.homeView();
        this.zoom = 0;
        this.draw();
    }

    homeView() {
        if (!this.dirH) return I4();
        // sphere: H's direction 60° off the view axis, so its circle crosses the globe
        const target = this.mode === 'sphere' ? [0.75, 0.433, 0.5] : [1, 0, 0];
        // V maps screen coordinates to world, so it takes the screen target to the direction of H
        return rotation(target, this.dirH);
    }
    setMode(mode) { this.mode = mode; this.V = this.homeView(); this.zoom = 0; this.draw(); }
    reset() { this.V = this.homeView(); this.zoom = 0; this.draw(); }

    setTheme(theme) { this.theme = theme; this.draw(); }

    size() {
        const c = this.canvas;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = Math.max(1, Math.round(c.clientWidth * dpr)), h = Math.max(1, Math.round(c.clientHeight * dpr));
        if (c.width !== w || c.height !== h) { c.width = w; c.height = h; }
        return { w, h, dpr };
    }

    draw() {
        if (this.failed || !this.data || !this.theme) return;
        if (this.raf) return;
        this.raf = requestAnimationFrame(() => { this.raf = 0; this.drawNow(); });
    }

    drawNow() {
        const gl = this.gl, u = this.u, th = this.theme;
        const { w, h, dpr } = this.size();
        if (w < 4 || h < 4) return;
        const twoPass = this.mode === 'sphere';
        if (twoPass) this.ensureFBO(w, h);
        gl.bindFramebuffer(gl.FRAMEBUFFER, twoPass ? this.fbo : null);
        if (twoPass) gl.drawBuffers([gl.COLOR_ATTACHMENT0, gl.COLOR_ATTACHMENT1]);
        gl.viewport(0, 0, w, h);
        gl.useProgram(this.prog);
        gl.bindVertexArray(this.vao);
        const scale = 0.5 * Math.min(w, h) - 6 * dpr;
        this.scale = scale;
        gl.uniform1i(u.uMode, this.mode === 'sphere' ? 1 : 0);
        gl.uniform1i(u.uK, this.data.k);
        gl.uniform4fv(u.uWalls, this.W);
        const V = this.V;
        // GLSL matrices are column-major: pass the transpose of the row-major array
        const colMajor = A => { const B = new Float32Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) B[j * 4 + i] = A[i * 4 + j]; return B; };
        gl.uniformMatrix4fv(u.uView, false, colMajor(V));
        gl.uniformMatrix4fv(u.uViewInv, false, colMajor(linv(V)));
        gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.tR); gl.uniform1i(u.uR, 0);
        gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, this.tP); gl.uniform1i(u.uPiece, 1);
        gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, this.tM); gl.uniform1i(u.uMark, 2);
        gl.uniform1i(u.uTW, this.TW);
        gl.uniform2f(u.uRes, w, h);
        gl.uniform1f(u.uScale, scale);
        gl.uniform1f(u.uRho, this.rho);
        gl.uniform1i(u.uMaxIt, 600);
        gl.uniform3fv(u.uPal, new Float32Array(th.palette.flat()));
        gl.uniform3fv(u.uBg, th.bg); gl.uniform3fv(u.uRim, th.rim); gl.uniform3fv(u.uEdge, th.edge);
        gl.uniform3fv(u.uSigma, th.sigma); gl.uniform3fv(u.uSigma2, th.sigma2); gl.uniform3fv(u.uLift, th.lift);
        gl.uniform1f(u.uLineW, 2.0 * dpr);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
        if (!twoPass) return;
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        gl.viewport(0, 0, w, h);
        gl.useProgram(this.edgeProg);
        const ue = this.ue;
        gl.activeTexture(gl.TEXTURE3); gl.bindTexture(gl.TEXTURE_2D, this.fboCol); gl.uniform1i(ue.uCol, 3);
        gl.activeTexture(gl.TEXTURE4); gl.bindTexture(gl.TEXTURE_2D, this.fboId); gl.uniform1i(ue.uId, 4);
        gl.uniform3fv(ue.uSigma, th.sigma);
        gl.uniform1i(ue.uRad, Math.max(1, Math.round(1.1 * dpr)));
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    ensureFBO(w, h) {
        const gl = this.gl;
        if (this.fbo && this.fboW === w && this.fboH === h) return;
        if (this.fbo) { gl.deleteFramebuffer(this.fbo); gl.deleteTexture(this.fboCol); gl.deleteTexture(this.fboId); }
        const tex = (internal, format, type) => {
            const t = gl.createTexture();
            gl.bindTexture(gl.TEXTURE_2D, t);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
            gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
            gl.texImage2D(gl.TEXTURE_2D, 0, internal, w, h, 0, format, type, null);
            return t;
        };
        this.fboCol = tex(gl.RGBA8, gl.RGBA, gl.UNSIGNED_BYTE);
        this.fboId = tex(gl.R32I, gl.RED_INTEGER, gl.INT);
        this.fbo = gl.createFramebuffer();
        gl.bindFramebuffer(gl.FRAMEBUFFER, this.fbo);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, this.fboCol, 0);
        gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT1, gl.TEXTURE_2D, this.fboId, 0);
        gl.bindFramebuffer(gl.FRAMEBUFFER, null);
        this.fboW = w; this.fboH = h;
    }

    // ---------------- interaction ----------------

    toDisk(ev) {
        const r = this.canvas.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const x = (ev.clientX - r.left) * dpr - 0.5 * this.canvas.width;
        const y = (r.bottom - ev.clientY) * dpr - 0.5 * this.canvas.height;
        return [x / this.scale, y / this.scale];
    }

    attach() {
        const c = this.canvas;
        let last = null;
        const clampDisk = p => { const r = Math.hypot(p[0], p[1]); return r > 0.985 ? [p[0] * 0.985 / r, p[1] * 0.985 / r] : p; };
        c.addEventListener('pointerdown', ev => { if (!this.data) return; last = { p: clampDisk(this.toDisk(ev)), shift: ev.shiftKey }; c.setPointerCapture(ev.pointerId); });
        c.addEventListener('pointermove', ev => {
            if (!last) return;
            const p = clampDisk(this.toDisk(ev));
            if (this.mode === 'sphere' || (last.shift && this.n === 3)) {
                const toS = q => { const r2 = Math.min(q[0] * q[0] + q[1] * q[1], 0.999); return [q[0], q[1], Math.sqrt(1 - r2)]; };
                this.V = clean(mul4(this.V, rotation(toS(p), toS(last.p))));
            } else {
                this.V = clean(mul4(this.V, translation(diskPoint(p), diskPoint(last.p))));
            }
            last.p = p;
            this.draw();
        });
        const end = () => { last = null; };
        c.addEventListener('pointerup', end);
        c.addEventListener('pointercancel', end);
        c.addEventListener('wheel', ev => {
            if (!this.data || this.mode !== 'sphere') return;
            ev.preventDefault();
            const s = Math.max(-0.3, Math.min(0.3, -ev.deltaY * 0.002));
            this.V = clean(mul4(this.V, boostZ(s)));
            this.draw();
        }, { passive: false });
        c.addEventListener('dblclick', () => this.reset());
        if (window.ResizeObserver) new ResizeObserver(() => this.draw()).observe(c);
    }
}
