// ────────────────────────────────────────────────────────────────
//  gl.js — instanced WebGL2 renderer for hats
//
//  One shared outline (the current Tile(a, b), triangulated), drawn
//  once per instance.  Each instance carries its placement plus an
//  animation block — scale, spin, coin-flip, lift — and a colour.
//  Tile boundaries are gaps: fills are inset along vertex miters so
//  the backing (stroke colour) or background shows between hats.
// ────────────────────────────────────────────────────────────────

const INST_FLOATS = 16;   // lin(4) · trans(4: tx ty dx dy) · anim(4: scale rot flip lift) · rgba(4)

const HAT_VS = `#version 300 es
precision highp float;
layout(location=0) in vec4 aVert;     // canonical xy, inward miter xy
layout(location=1) in vec4 iLin;
layout(location=2) in vec4 iTrans;
layout(location=3) in vec4 iAnim;
layout(location=4) in vec4 iColor;
uniform vec2 uView;       // world → clip scale
uniform vec4 uCam;        // centre xy, cos, sin
uniform vec2 uCentroid;   // canonical centroid of the current outline
uniform float uInset;     // canonical units
uniform int uPass;        // 0 backing · 1 fill · 2 shadow · 3 ghost line
uniform int uLifted;      // 0 unlifted only · 1 lifted only · 2 all
uniform vec2 uShadow;     // world offset per unit lift
uniform vec4 uStroke;
uniform vec2 uOffset;
uniform vec4 uGhost;
uniform vec2 uShift;      // clip-space offset (keeps subjects clear of the caption)
out vec4 vColor;
void main() {
    float lift = iAnim.w;
    bool lifted = lift > 0.002;
    bool skip = uPass != 3 && ((uLifted == 0 && lifted) || (uLifted == 1 && !lifted) || iColor.a < 0.003);
    if (skip || iAnim.x < 0.001) { gl_Position = vec4(2.0, 2.0, 2.0, 1.0); vColor = vec4(0.0); return; }
    vec2 p = aVert.xy + (uPass == 1 ? aVert.zw * uInset : vec2(0.0));
    vec2 q = p - uCentroid;
    float cf = cos(iAnim.z);
    q.y *= cf;
    if (uPass == 3) lift = 0.0;
    float s = iAnim.x * (1.0 + 0.05 * lift);
    float c = cos(iAnim.y), sn = sin(iAnim.y);
    q = s * vec2(c * q.x - sn * q.y, sn * q.x + c * q.y) + uCentroid;
    vec2 w = vec2(iLin.x * q.x + iLin.y * q.y, iLin.z * q.x + iLin.w * q.y) + iTrans.xy + iTrans.zw + uOffset;
    if (uPass == 2) w += uShadow * lift;
    else w -= uShadow * lift * 0.35;
    vec2 d = w - uCam.xy;
    gl_Position = vec4(vec2(uCam.z * d.x - uCam.w * d.y, uCam.w * d.x + uCam.z * d.y) * uView + uShift, 0.0, 1.0);
    vec3 col = iColor.rgb * (cf < 0.0 ? 0.55 : 1.0);
    if (uPass == 0) vColor = vec4(uStroke.rgb, uStroke.a * iColor.a);
    else if (uPass == 2) vColor = vec4(0.0, 0.0, 0.0, 0.42 * min(lift, 1.0) * iColor.a);
    else if (uPass == 3) vColor = uGhost;
    else vColor = vec4(col, iColor.a);
}`;

const HAT_FS = `#version 300 es
precision mediump float;
in vec4 vColor;
out vec4 outColor;
void main() { outColor = vColor; }`;

class HatGL {
    constructor(canvas) {
        // Transparent, premultiplied: the underlay canvas (background, grid) shows through the gaps.
        const gl = canvas.getContext('webgl2', { antialias: true, alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: false });
        if (!gl) throw new Error('WebGL2 is not available');
        this.gl = gl;
        this.canvas = canvas;
        this.prog = this._program(HAT_VS, HAT_FS);
        this.u = {};
        for (const name of ['uView', 'uCam', 'uCentroid', 'uInset', 'uPass', 'uLifted', 'uShadow', 'uStroke', 'uOffset', 'uGhost', 'uShift'])
            this.u[name] = gl.getUniformLocation(this.prog, name);
        this.vbo = gl.createBuffer();
        this.triIbo = gl.createBuffer();
        this.lineIbo = gl.createBuffer();
        const lines = [];
        for (let i = 0; i < 14; i++) lines.push(i, (i + 1) % 14);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.lineIbo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(lines), gl.STATIC_DRAW);
        this.shapeKey = '';
        this.setShape(1, 1);
    }

    _program(vs, fs) {
        const gl = this.gl;
        const sh = (type, src) => {
            const s = gl.createShader(type);
            gl.shaderSource(s, src);
            gl.compileShader(s);
            if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
            return s;
        };
        const p = gl.createProgram();
        gl.attachShader(p, sh(gl.VERTEX_SHADER, vs));
        gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
        gl.linkProgram(p);
        if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
        return p;
    }

    // Outline of Tile(α, β): vertices, inward miters, ear-clipped triangles.
    setShape(alpha, beta) {
        const key = alpha.toFixed(5) + ',' + beta.toFixed(5);
        if (key === this.shapeKey) return;
        this.shapeKey = key;
        const P = tileShape(alpha, beta);
        this.shape = P;
        this.centroid = polyCentroid(P);
        this.area = polyArea(P);
        const data = new Float32Array(14 * 4);
        for (let i = 0; i < 14; i++) {
            const a = P[(i + 13) % 14], b = P[i], c = P[(i + 1) % 14];
            const n1 = this._inNormal(a, b), n2 = this._inNormal(b, c);
            const d = 1 + n1.x * n2.x + n1.y * n2.y;
            const m = d > 0.05 ? pt((n1.x + n2.x) / d, (n1.y + n2.y) / d) : pt(n2.x, n2.y);
            data.set([b.x, b.y, m.x, m.y], i * 4);
        }
        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
        gl.bufferData(gl.ARRAY_BUFFER, data, gl.DYNAMIC_DRAW);
        const tris = earClip(P);
        this.triCount = tris.length;
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.triIbo);
        gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, new Uint16Array(tris), gl.DYNAMIC_DRAW);
    }

    _inNormal(a, b) {
        const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
        return pt(-dy / L, dx / L);
    }

    createSet(capacity) {
        const gl = this.gl;
        const set = { capacity, count: 0, data: new Float32Array(capacity * INST_FLOATS), buf: gl.createBuffer(), vao: gl.createVertexArray() };
        gl.bindVertexArray(set.vao);
        gl.bindBuffer(gl.ARRAY_BUFFER, this.vbo);
        gl.enableVertexAttribArray(0);
        gl.vertexAttribPointer(0, 4, gl.FLOAT, false, 16, 0);
        gl.bindBuffer(gl.ARRAY_BUFFER, set.buf);
        gl.bufferData(gl.ARRAY_BUFFER, set.data.byteLength, gl.DYNAMIC_DRAW);
        for (let k = 0; k < 4; k++) {
            gl.enableVertexAttribArray(1 + k);
            gl.vertexAttribPointer(1 + k, 4, gl.FLOAT, false, INST_FLOATS * 4, k * 16);
            gl.vertexAttribDivisor(1 + k, 1);
        }
        gl.bindVertexArray(null);
        return set;
    }

    upload(set) {
        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, set.buf);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, set.data, 0, set.count * INST_FLOATS);
    }

    // view: { cx, cy, scale (css px per world unit), rot, W, H, oy (px the centre sits above mid-screen) }
    begin(view) {
        const gl = this.gl;
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.enable(gl.BLEND);
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
        gl.useProgram(this.prog);
        gl.uniform2f(this.u.uView, 2 * view.scale / view.W, 2 * view.scale / view.H);
        gl.uniform4f(this.u.uCam, view.cx, view.cy, Math.cos(view.rot), Math.sin(view.rot));
        gl.uniform2f(this.u.uCentroid, this.centroid.x, this.centroid.y);
        gl.uniform2f(this.u.uShift, 0, 2 * (view.oy || 0) / view.H);
        // Shadow falls down-right on screen whatever the camera rotation.
        const sx = 3 / view.scale, sy = -5 / view.scale, c = Math.cos(-view.rot), s = Math.sin(-view.rot);
        gl.uniform2f(this.u.uShadow, c * sx - s * sy, s * sx + c * sy);
        this.view = view;
    }

    // opts: { strokePx, stroke: [r,g,b], backing: bool, anyLifted: bool, hatScale }
    drawSet(set, opts) {
        if (!set.count) return;
        const gl = this.gl, u = this.u;
        gl.bindVertexArray(set.vao);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.triIbo);
        const pxPerUnit = this.view.scale * (opts.hatScale || 0.5);
        gl.uniform1f(u.uInset, Math.min(0.14, (opts.strokePx * 0.5) / pxPerUnit));
        gl.uniform4f(u.uStroke, opts.stroke[0], opts.stroke[1], opts.stroke[2], 1);
        gl.uniform2f(u.uOffset, 0, 0);
        const draw = (pass, lifted) => {
            gl.uniform1i(u.uPass, pass);
            gl.uniform1i(u.uLifted, lifted);
            gl.drawElementsInstanced(gl.TRIANGLES, this.triCount, gl.UNSIGNED_SHORT, 0, set.count);
        };
        const layer = lifted => {
            if (opts.backing && opts.strokePx > 0) draw(0, lifted);
            draw(1, lifted);
        };
        if (opts.anyLifted) { layer(0); draw(2, 1); layer(1); }
        else layer(2);
        gl.bindVertexArray(null);
    }

    // Every instance's outline as thin lines, shifted by (ox, oy).
    drawGhost(set, ox, oy, rgba) {
        if (!set.count) return;
        const gl = this.gl, u = this.u;
        gl.bindVertexArray(set.vao);
        gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.lineIbo);
        gl.uniform1i(u.uPass, 3);
        gl.uniform1i(u.uLifted, 2);
        gl.uniform2f(u.uOffset, ox, oy);
        gl.uniform4f(u.uGhost, rgba[0], rgba[1], rgba[2], rgba[3]);
        gl.drawElementsInstanced(gl.LINES, 28, gl.UNSIGNED_SHORT, 0, set.count);
        gl.uniform2f(u.uOffset, 0, 0);
        gl.bindVertexArray(null);
    }
}

// Ear clipping for a simple CCW polygon; tolerates collinear vertices.
function earClip(P) {
    const idx = P.map((_, i) => i);
    const tris = [];
    const cross = (a, b, c) => (b.x - a.x) * (c.y - a.y) - (b.y - a.y) * (c.x - a.x);
    // Closed test: a vertex on the candidate's boundary also blocks it
    // (the hat has many collinear lattice points).
    const inside = (p, a, b, c) =>
        cross(a, b, p) >= -1e-9 && cross(b, c, p) >= -1e-9 && cross(c, a, p) >= -1e-9;
    let guard = 0;
    while (idx.length > 3 && guard++ < 400) {
        let clipped = false;
        for (let k = 0; k < idx.length; k++) {
            const i0 = idx[(k + idx.length - 1) % idx.length], i1 = idx[k], i2 = idx[(k + 1) % idx.length];
            const a = P[i0], b = P[i1], c = P[i2];
            if (cross(a, b, c) <= 1e-9) continue;
            let ok = true;
            for (const j of idx) {
                if (j === i0 || j === i1 || j === i2) continue;
                const q = P[j];
                if ((q.x === a.x && q.y === a.y) || (q.x === c.x && q.y === c.y)) continue;
                if (inside(q, a, b, c)) { ok = false; break; }
            }
            if (!ok) continue;
            tris.push(i0, i1, i2);
            idx.splice(k, 1);
            clipped = true;
            break;
        }
        if (!clipped) {
            // Only collinear runs left: drop a flat vertex.
            const k = idx.findIndex((i1, k) => Math.abs(cross(P[idx[(k + idx.length - 1) % idx.length]], P[i1], P[idx[(k + 1) % idx.length]])) <= 1e-9);
            if (k < 0) break;
            idx.splice(k, 1);
        }
    }
    if (idx.length === 3) tris.push(idx[0], idx[1], idx[2]);
    return tris;
}
