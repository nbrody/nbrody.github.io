// rileySliceShader.js — WebGL2 Farey-polynomial √Riley shader overlay.
//
// Adds a colored background to the Riley Slice Visualization canvas:
// for each pixel z ∈ ℂ (the √ρ plane used throughout this page), we compute
// Φ_{p/q}(ρ = z²) for every p/q in a Farey tree via the Keen–Series recurrence
//   Φ_med = 8 − Φ_L · Φ_R − Φ_diff,
// and shade pixels where |Φ_{p/q}| < 2 (non-discrete) with hue = slope p/q.
// Carrying dΦ/dz lets us draw the analytic boundary |Φ| = 2 at sub-pixel
// sharpness using |Φ − 2|/|dΦ/dz|.  The existing purple/red cusp dots from
// rileySlice.js are drawn by a 2D canvas layered on top.

(function () {
"use strict";

// ─── Farey (Stern–Brocot) tree ───────────────────────────────────────
function buildFareyTree(maxDepth) {
    const nodes = [];
    const fracMap = new Map();
    const key = (p, q) => p + "/" + q;
    function addNode(p, q) {
        const k = key(p, q);
        if (fracMap.has(k)) return fracMap.get(k);
        const idx = nodes.length;
        nodes.push({ p, q, varName: "N" + idx,
                     leftParent: -1, rightParent: -1, diffParent: -1 });
        fracMap.set(k, idx);
        return idx;
    }
    addNode(0, 1);  // Φ_{0/1} = 2 − ρ
    addNode(1, 0);  // Φ_{1/0} = 2
    addNode(1, 1);  // Φ_{1/1} = 2 + ρ
    function sub(li, ri, depth) {
        if (depth <= 0) return;
        const lp = nodes[li].p, lq = nodes[li].q;
        const rp = nodes[ri].p, rq = nodes[ri].q;
        const mi = addNode(lp + rp, lq + rq);
        const dp = Math.abs(lp - rp), dq = Math.abs(lq - rq);
        const di = fracMap.get(key(dp, dq));
        if (di !== undefined) {
            nodes[mi].leftParent  = li;
            nodes[mi].rightParent = ri;
            nodes[mi].diffParent  = di;
        }
        sub(li, mi, depth - 1);
        sub(mi, ri, depth - 1);
    }
    sub(0, 2, maxDepth);  // 0/1 – 1/1
    sub(2, 1, maxDepth);  // 1/1 – 1/0
    return nodes;
}

// ─── Shader source generation ────────────────────────────────────────
function generateShader(depth) {
    const nodes = buildFareyTree(depth);
    const N = nodes.length;

    let decl = "";
    for (let i = 0; i < N; i++) {
        decl += `    vec2 ${nodes[i].varName}; vec2 d${nodes[i].varName};\n`;
    }

    // Base cases.  rho = z², drho/dz = 2z.
    let body = "";
    body += `    ${nodes[0].varName} = vec2(2.0,0.0) - rho;  d${nodes[0].varName} = -drho;\n`;
    body += `    ${nodes[1].varName} = vec2(2.0,0.0);        d${nodes[1].varName} = vec2(0.0);\n`;
    body += `    ${nodes[2].varName} = vec2(2.0,0.0) + rho;  d${nodes[2].varName} =  drho;\n`;

    // Recurrence and derivative (product rule).
    for (let i = 3; i < N; i++) {
        const n = nodes[i];
        if (n.leftParent < 0) continue;
        const lv = nodes[n.leftParent].varName;
        const rv = nodes[n.rightParent].varName;
        const dv = nodes[n.diffParent].varName;
        const v  = n.varName;
        body += `    ${v}  = vec2(8.0,0.0) - cMul(${lv},${rv}) - ${dv};\n`;
        body += `    d${v} = -cMul(d${lv},${rv}) - cMul(${lv},d${rv}) - d${dv};\n`;
    }

    // Painter's algorithm — sort by ascending denominator, skip 1/0.
    const order = [];
    for (let i = 0; i < N; i++) { if (i === 1) continue; order.push(i); }
    order.sort((a, b) => nodes[a].q - nodes[b].q);

    let accum = "";
    for (const i of order) {
        const n = nodes[i];
        const v = n.varName;
        const hue = (Math.atan2(n.p, n.q) / Math.PI).toFixed(8);
        accum += `
    {
        float tl = length(${v});
        float gl = length(d${v});
        if (tl < 2.0) {
            inNonDiscrete = true;
            regionHue     = ${hue};
            regionDepth   = 2.0 - tl;
        }
        if (gl > 1e-8 && tl < 200.0) {
            minBoundaryDist = min(minBoundaryDist, abs(tl - 2.0) / gl);
        }
    }
`;
    }

    return `#version 300 es
precision highp float;
out vec4 fragColor;
uniform vec2  uResolution;
uniform vec4  uViewport;        // (xmin, ymin, xmax, ymax)
uniform float uSharpness;
uniform float uBoundaryPx;
uniform float uRegionAlpha;

vec2 cMul(vec2 a, vec2 b) {
    return vec2(a.x*b.x - a.y*b.y, a.x*b.y + a.y*b.x);
}

vec3 hsv2rgb(float h, float s, float v) {
    h = fract(h);
    float c = v * s;
    float x = c * (1.0 - abs(mod(h * 6.0, 2.0) - 1.0));
    float m = v - c;
    vec3 rgb;
    if      (h < 1.0/6.0) rgb = vec3(c, x, 0.0);
    else if (h < 2.0/6.0) rgb = vec3(x, c, 0.0);
    else if (h < 3.0/6.0) rgb = vec3(0.0, c, x);
    else if (h < 4.0/6.0) rgb = vec3(0.0, x, c);
    else if (h < 5.0/6.0) rgb = vec3(x, 0.0, c);
    else                   rgb = vec3(c, 0.0, x);
    return rgb + m;
}

void main() {
    vec2 uv = gl_FragCoord.xy / uResolution;
    vec2 z  = vec2(mix(uViewport.x, uViewport.z, uv.x),
                   mix(uViewport.y, uViewport.w, uv.y));
    // z is the √ρ plane variable; Farey polynomials use ρ = z².
    vec2 rho  = cMul(z, z);
    vec2 drho = 2.0 * z;

${decl}

    float minBoundaryDist = 1e6;
    bool  inNonDiscrete   = false;
    float regionHue       = 0.0;
    float regionDepth     = 0.0;

${body}
${accum}

    float px = (uViewport.z - uViewport.x) / uResolution.x;
    vec3 bg  = vec3(0.122, 0.161, 0.216);  // #1f2937 — matches existing canvas bg
    vec3 color;

    if (inNonDiscrete) {
        float t   = clamp(pow(regionDepth, 1.0 / max(0.3, uSharpness)), 0.0, 1.0);
        float sat = 0.85 + 0.15 * t;
        float val = 0.55 + 0.4  * t;
        vec3 region = hsv2rgb(regionHue, sat, val);
        color = mix(bg, region, uRegionAlpha);
    } else {
        color = bg;
    }

    // Analytic boundary — sub-pixel sharp.
    float bLine = smoothstep(px * uBoundaryPx, 0.0, minBoundaryDist);
    color = mix(color, vec3(0.95, 0.97, 1.0), bLine * 0.80);

    fragColor = vec4(color, 1.0);
}
`;
}

// ─── Runtime state ───────────────────────────────────────────────────
const state = {
    canvas: null,
    gl: null,
    program: null,
    uniforms: {},
    vao: null,
    depth: 6,
    sharpness: 1.0,
    boundaryPx: 1.75,
    regionAlpha: 0.65,
    bounds: null,
};

function compile(gl, type, src) {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
        console.error("Farey shader compile:", gl.getShaderInfoLog(s));
        return null;
    }
    return s;
}
function linkProg(gl, vs, fs) {
    const p = gl.createProgram();
    gl.attachShader(p, vs); gl.attachShader(p, fs); gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) {
        console.error("Farey shader link:", gl.getProgramInfoLog(p));
        return null;
    }
    return p;
}

function build() {
    const gl = state.gl;
    const VS = `#version 300 es
in vec2 aPos; void main() { gl_Position = vec4(aPos, 0.0, 1.0); }
`;
    const vs = compile(gl, gl.VERTEX_SHADER, VS);
    const fs = compile(gl, gl.FRAGMENT_SHADER, generateShader(state.depth));
    if (!vs || !fs) return;
    const prog = linkProg(gl, vs, fs);
    if (!prog) return;
    gl.bindAttribLocation(prog, 0, "aPos");
    if (state.program) gl.deleteProgram(state.program);
    state.program = prog;
    state.uniforms = {
        uResolution:  gl.getUniformLocation(prog, "uResolution"),
        uViewport:    gl.getUniformLocation(prog, "uViewport"),
        uSharpness:   gl.getUniformLocation(prog, "uSharpness"),
        uBoundaryPx:  gl.getUniformLocation(prog, "uBoundaryPx"),
        uRegionAlpha: gl.getUniformLocation(prog, "uRegionAlpha"),
    };
    console.log(`Farey √Riley shader: depth ${state.depth}`);
}

function render() {
    const gl = state.gl;
    const canvas = state.canvas;
    if (!gl || !state.program || !state.bounds) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, (canvas.clientWidth  * dpr) | 0);
    const h = Math.max(1, (canvas.clientHeight * dpr) | 0);
    if (canvas.width !== w || canvas.height !== h) {
        canvas.width = w; canvas.height = h;
    }
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.useProgram(state.program);
    gl.bindVertexArray(state.vao);
    gl.uniform2f(state.uniforms.uResolution, canvas.width, canvas.height);
    const { minX, maxX, minY, maxY } = state.bounds;
    gl.uniform4f(state.uniforms.uViewport, minX, minY, maxX, maxY);
    gl.uniform1f(state.uniforms.uSharpness,   state.sharpness);
    gl.uniform1f(state.uniforms.uBoundaryPx,  state.boundaryPx);
    gl.uniform1f(state.uniforms.uRegionAlpha, state.regionAlpha);
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
}

// ─── Instance discovery (handles `let` or window binding) ────────────
function getInstance() {
    try {
        if (typeof rileySliceInstance !== "undefined" && rileySliceInstance) {
            window.rileySliceInstance = rileySliceInstance;  // expose for main.js too
            return rileySliceInstance;
        }
    } catch (_) { /* not yet defined */ }
    return window.rileySliceInstance || null;
}

function boundsEqual(a, b) {
    if (!a || !b) return false;
    return a.minX === b.minX && a.maxX === b.maxX
        && a.minY === b.minY && a.maxY === b.maxY;
}

function syncFromInstance() {
    const inst = getInstance();
    if (!inst || !inst.bounds) return false;
    if (boundsEqual(inst.bounds, state.bounds)) return false;
    state.bounds = { ...inst.bounds };
    render();
    return true;
}

// ─── Setup ───────────────────────────────────────────────────────────
function init() {
    const existing = document.getElementById("rileySliceCanvas");
    if (!existing) {
        console.warn("Farey shader: #rileySliceCanvas not found.");
        return;
    }

    // Wrap the existing canvas so we can place a sibling WebGL canvas BEHIND it.
    const parent = existing.parentNode;
    const wrap = document.createElement("div");
    wrap.id = "rileyShaderWrap";
    wrap.style.cssText =
        "position:relative; display:inline-block; line-height:0;";
    parent.insertBefore(wrap, existing);
    wrap.appendChild(existing);

    const shaderCanvas = document.createElement("canvas");
    shaderCanvas.id = "rileyShaderCanvas";
    // Size matches existing canvas's intrinsic dimensions.
    const rect = existing.getBoundingClientRect();
    shaderCanvas.style.cssText =
        "position:absolute; left:0; top:0; " +
        "width:" + existing.clientWidth  + "px; " +
        "height:" + existing.clientHeight + "px; " +
        "border-radius:8px; pointer-events:none; z-index:0; display:block;";
    wrap.insertBefore(shaderCanvas, existing);

    // Existing 2D canvas must be transparent so the shader shows through.
    existing.style.background = "transparent";
    existing.style.position = "relative";
    existing.style.zIndex = "1";

    state.canvas = shaderCanvas;
    const gl = shaderCanvas.getContext("webgl2", { antialias: false });
    if (!gl) {
        console.warn("Farey shader: WebGL2 unavailable; skipping overlay.");
        shaderCanvas.remove();
        return;
    }
    state.gl = gl;

    // Full-screen quad.
    state.vao = gl.createVertexArray();
    gl.bindVertexArray(state.vao);
    const vbo = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, vbo);
    gl.bufferData(gl.ARRAY_BUFFER,
        new Float32Array([-1,-1, 1,-1, -1,1, 1,1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    build();

    // Once RileySlice has computed its root-fitted bounds, monkey-patch draw()
    // so we sync + re-render whenever it redraws (e.g. after highlight).
    const patch = setInterval(() => {
        const inst = getInstance();
        if (!inst || typeof inst.draw !== "function") return;
        clearInterval(patch);

        const origDraw = inst.draw.bind(inst);
        inst.draw = function () {
            origDraw();
            syncFromInstance();
        };
        // If draw already ran (bounds set), sync immediately.
        syncFromInstance();
    }, 60);

    window.addEventListener("resize", render);

    // ── Control panel ──
    const panel = document.createElement("div");
    panel.id = "fareyShaderControls";
    panel.style.cssText =
        "display:flex; gap:18px; align-items:center; justify-content:center; " +
        "margin:12px auto 0; flex-wrap:wrap; " +
        "font: 13px/1.4 -apple-system, system-ui, sans-serif; color:#d1d5db;";
    panel.innerHTML =
        '<label>Farey depth ' +
          '<input id="fareyDepth" type="range" min="3" max="8" step="1" value="6" style="vertical-align:middle; width:110px;"> ' +
          '<span id="fareyDepthVal" style="color:#a5b4fc; font-family:monospace; margin-left:4px;">6</span>' +
        '</label>' +
        '<label>boundary px ' +
          '<input id="fareyBoundary" type="range" min="0.5" max="4.0" step="0.05" value="1.75" style="vertical-align:middle; width:110px;"> ' +
          '<span id="fareyBoundaryVal" style="color:#a5b4fc; font-family:monospace; margin-left:4px;">1.75</span>' +
        '</label>' +
        '<label>region α ' +
          '<input id="fareyAlpha" type="range" min="0" max="1" step="0.02" value="0.65" style="vertical-align:middle; width:110px;"> ' +
          '<span id="fareyAlphaVal" style="color:#a5b4fc; font-family:monospace; margin-left:4px;">0.65</span>' +
        '</label>' +
        '<label>sharpness ' +
          '<input id="fareySharpness" type="range" min="0.3" max="4" step="0.05" value="1.0" style="vertical-align:middle; width:110px;"> ' +
          '<span id="fareySharpnessVal" style="color:#a5b4fc; font-family:monospace; margin-left:4px;">1.00</span>' +
        '</label>';
    wrap.parentNode.insertBefore(panel, wrap.nextSibling);

    document.getElementById("fareyDepth").addEventListener("input", (e) => {
        state.depth = parseInt(e.target.value, 10);
        document.getElementById("fareyDepthVal").textContent = state.depth;
        build();
        render();
    });
    document.getElementById("fareyBoundary").addEventListener("input", (e) => {
        state.boundaryPx = parseFloat(e.target.value);
        document.getElementById("fareyBoundaryVal").textContent = state.boundaryPx.toFixed(2);
        render();
    });
    document.getElementById("fareyAlpha").addEventListener("input", (e) => {
        state.regionAlpha = parseFloat(e.target.value);
        document.getElementById("fareyAlphaVal").textContent = state.regionAlpha.toFixed(2);
        render();
    });
    document.getElementById("fareySharpness").addEventListener("input", (e) => {
        state.sharpness = parseFloat(e.target.value);
        document.getElementById("fareySharpnessVal").textContent = state.sharpness.toFixed(2);
        render();
    });
}

if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
} else {
    init();
}
})();
