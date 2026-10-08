// Figure 1 — the sphere at infinity of the right-angled dodecahedral reflection group.
// Cells = shadows (from o) of tiles meeting the sphere of radius t; expansion = boost toward x.

import { el, controls, slider, button, palette, onTheme, hexToRgb, pointer, fmt } from './common.js';

const PHI = (1 + Math.sqrt(5)) / 2;

function faceNormals() {
  let U = [];
  for (const s1 of [1, -1]) for (const s2 of [1, -1]) {
    U.push([0, s1, s2 * PHI]); U.push([s1, s2 * PHI, 0]); U.push([s2 * PHI, 0, s1]);
  }
  U = U.map((v) => { const n = Math.hypot(...v); return v.map((x) => x / n); });
  const th = Math.pow(5, -0.25); // tanh(inradius): right dihedral angles
  const ch = 1 / Math.sqrt(1 - th * th), sh = th * ch;
  const out = new Float32Array(48);
  U.forEach((u, i) => out.set([ch * u[0], ch * u[1], ch * u[2], sh], 4 * i));
  return out;
}

const VS = `#version 300 es
in vec2 aPos; void main(){ gl_Position = vec4(aPos, 0.0, 1.0); }`;

const FS = `#version 300 es
precision highp float;
uniform vec2 uRes;
uniform mat3 uRot;
uniform mat4 uA;
uniform float uT;
uniform vec4 uN[12];
uniform vec3 uX;
uniform float uRingTan;
uniform vec3 uColA, uColB, uLine, uRing1, uRing2;
uniform float uTint;
out vec4 frag;

float mdot(vec4 a, vec4 b){ return dot(a.xyz, b.xyz) - a.w*b.w; }

void main(){
  float scale = 0.5*min(uRes.x, uRes.y)*0.965;
  vec2 p = (gl_FragCoord.xy - 0.5*uRes) / scale;
  float r = length(p);
  vec2 pc = r > 0.999 ? p * (0.999 / r) : p;
  vec3 v = vec3(pc, sqrt(max(0.0, 1.0 - dot(pc, pc))));
  vec3 w = uRot * v;
  vec4 Y = uA * vec4(w, 1.0);
  vec3 xi = normalize(Y.xyz / Y.w);
  vec4 P = vec4(sinh(uT) * xi, cosh(uT));
  mat4 G = mat4(1.0);
  int k = 0;
  for (int it = 0; it < 90; it++) {
    bool moved = false;
    for (int i = 0; i < 12; i++) {
      float d = mdot(P, uN[i]);
      if (d > 1e-5) {
        vec4 n = uN[i];
        P -= 2.0 * d * n;
        G -= 2.0 * outerProduct(G * n, vec4(n.xyz, -n.w));
        k++;
        moved = true;
        break;
      }
    }
    if (!moved) break;
  }
  float dmin = 1e9;
  for (int i = 0; i < 12; i++) dmin = min(dmin, abs(mdot(P, uN[i])));
  vec3 base = (k % 2 == 0) ? uColA : uColB;
  vec3 c = G[3].xyz;
  vec3 dir = length(c) > 1e-3 ? normalize(c) : vec3(0.0, 0.0, 1.0);
  vec3 tint = 0.5 + 0.5 * cos(6.28318 * (0.55 * dir.x + 0.35 * dir.y + 0.25 * dir.z) + vec3(0.0, 2.1, 4.2));
  vec3 col = mix(base, tint, uTint);
  float aa = fwidth(dmin);
  float line = 1.0 - smoothstep(0.55 * aa, 1.5 * aa, dmin);
  col = mix(col, uLine, 0.8 * line);
  // ring 1: boundary of B(x,R) (original coordinates)
  float cs = clamp(dot(xi, uX), -1.0, 1.0);
  float th2 = sqrt(max(0.0, (1.0 - cs) / (1.0 + cs)));
  float f1 = abs(th2 - uRingTan) / max(fwidth(th2), 1e-7);
  col = mix(col, uRing1, 1.0 - smoothstep(0.8, 2.0, f1));
  // ring 2: image of the far hemisphere {angle(xi,x) >= 90deg}: crushed near the puncture
  float f2 = abs(cs) / max(fwidth(cs), 1e-7);
  col = mix(col, uRing2, 1.0 - smoothstep(0.8, 2.0, f2));
  // gentle globe shading + antialiased rim
  col *= 0.86 + 0.14 * v.z;
  float edge = 1.0 - smoothstep(1.0 - 1.5 / scale, 1.0, r);
  frag = vec4(col * edge, edge);
}`;

// --- small linear algebra (row-major 3x3 arrays) ---
const m3mul = (A, B) => {
  const C = new Array(9).fill(0);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) for (let k = 0; k < 3; k++) C[3 * i + j] += A[3 * i + k] * B[3 * k + j];
  return C;
};
const m3vec = (A, v) => [A[0] * v[0] + A[1] * v[1] + A[2] * v[2], A[3] * v[0] + A[4] * v[1] + A[5] * v[2], A[6] * v[0] + A[7] * v[1] + A[8] * v[2]];
const m3T = (A) => [A[0], A[3], A[6], A[1], A[4], A[7], A[2], A[5], A[8]];
const norm3 = (v) => { const n = Math.hypot(v[0], v[1], v[2]) || 1; return [v[0] / n, v[1] / n, v[2] / n]; };
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot3 = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function axisAngle(axis, ang) {
  const [x, y, z] = norm3(axis), c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
  return [t * x * x + c, t * x * y - s * z, t * x * z + s * y,
    t * x * y + s * z, t * y * y + c, t * y * z - s * x,
    t * x * z - s * y, t * y * z + s * x, t * z * z + c];
}
function rotTaking(a, b) { // rotation taking unit a to unit b
  const ax = cross(a, b), s = Math.hypot(...ax), c = dot3(a, b);
  if (s < 1e-9) return c > 0 ? [1, 0, 0, 0, 1, 0, 0, 0, 1] : axisAngle(Math.abs(a[0]) < 0.9 ? cross(a, [1, 0, 0]) : cross(a, [0, 1, 0]), Math.PI);
  return axisAngle(ax, Math.atan2(s, c));
}

// Boost (hyperbolic translation) toward unit x by distance s, acting on null vectors (xi,1).
function boostApply(x, s, w) {
  const c = Math.cosh(s), S = Math.sinh(s), d = dot3(x, w);
  const sp = [w[0] + (c - 1) * d * x[0] + S * x[0], w[1] + (c - 1) * d * x[1] + S * x[1], w[2] + (c - 1) * d * x[2] + S * x[2]];
  const t = S * d + c;
  return norm3([sp[0] / t, sp[1] / t, sp[2] / t]);
}
function boostMatrix(x, s) { // column-major mat4 (symmetric)
  const c = Math.cosh(s), S = Math.sinh(s), M = new Float32Array(16);
  for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) M[4 * j + i] = (i === j ? 1 : 0) + (c - 1) * x[i] * x[j];
  for (let i = 0; i < 3; i++) { M[4 * 3 + i] = S * x[i]; M[4 * i + 3] = S * x[i]; }
  M[15] = c;
  return M;
}

const chord = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]) / 2;

export function mount(root) {
  const row = el('div', { class: 'fig-row' });
  const left = el('div', { class: 'grow' });
  const right = el('div', { class: 'side' });
  row.append(left, right);
  root.append(row);

  const wrap = el('div', { class: 'cv-wrap', style: 'aspect-ratio: 1 / 1; max-width: 560px; margin: 0 auto;' });
  const glc = el('canvas', { style: 'position:absolute; inset:0; width:100%; height:100%;' });
  const ov = el('canvas', { style: 'position:absolute; inset:0; width:100%; height:100%; cursor: grab;' });
  wrap.append(glc, ov);
  left.append(wrap);

  const gl = glc.getContext('webgl2', { antialias: false, premultipliedAlpha: true, alpha: true });
  if (!gl) {
    wrap.replaceWith(el('div', { class: 'fallback' }, 'This figure needs WebGL2, which is not available in this browser.'));
    return;
  }

  const sh = (type, src) => {
    const s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const prog = gl.createProgram();
  gl.attachShader(prog, sh(gl.VERTEX_SHADER, VS));
  gl.attachShader(prog, sh(gl.FRAGMENT_SHADER, FS));
  gl.linkProgram(prog);
  if (!gl.getProgramParameter(prog, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(prog));
  gl.useProgram(prog);
  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const aPos = gl.getAttribLocation(prog, 'aPos');
  gl.enableVertexAttribArray(aPos);
  gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);
  const U = {};
  for (const n of ['uRes', 'uRot', 'uA', 'uT', 'uN', 'uX', 'uRingTan', 'uColA', 'uColB', 'uLine', 'uRing1', 'uRing2', 'uTint']) U[n] = gl.getUniformLocation(prog, n);
  gl.uniform4fv(U.uN, faceNormals());

  // ---- state ----
  const st = {
    Rv: m3mul(axisAngle([1, 0, 0], -0.35), axisAngle([0, 1, 0], 0.5)),
    x: null, s: 0, tv: 2.2,
    markers: [], // world positions of hy, hz (display)
    view: 'x',
  };
  st.x = m3vec(st.Rv, [0, 0, 1]);
  const resetMarkers = () => {
    st.markers = [norm3([-0.32, 0.22, 0.92]), norm3([0.30, -0.18, 0.94])].map((v) => m3vec(st.Rv, v));
  };
  resetMarkers();

  let colors = {};
  const readColors = () => {
    const p = palette();
    const c = (s) => hexToRgb(s).map((v) => v / 255);
    colors = {
      a: c(p.dark ? '#26304d' : '#eef2fb'), b: c(p.dark ? '#3a4d7e' : '#c3d1f1'),
      line: c(p.dark ? '#dfe7ff' : '#26314f'), r1: c(p.accent3), r2: c(p.accent2),
      tint: p.dark ? 0.16 : 0.13, ink: p.ink, muted: p.muted, accent: p.accent, accent2: p.accent2, accent3: p.accent3, accent4: p.accent4, panel: p.panel,
    };
  };
  readColors();

  let W = 0, H = 0, dpr = 1, queued = false;
  const resize = () => {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    W = wrap.clientWidth; H = wrap.clientHeight;
    for (const c of [glc, ov]) { c.width = Math.round(W * dpr); c.height = Math.round(H * dpr); }
    request();
  };
  new ResizeObserver(resize).observe(wrap);

  function request() { if (!queued) { queued = true; requestAnimationFrame(render); } }

  const ringTheta0 = 50 * Math.PI / 180;

  function render() {
    queued = false;
    if (!W) return;
    gl.viewport(0, 0, glc.width, glc.height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.uniform2f(U.uRes, glc.width, glc.height);
    gl.uniformMatrix3fv(U.uRot, false, new Float32Array(m3T(st.Rv)));
    gl.uniformMatrix4fv(U.uA, false, boostMatrix(st.x, st.s));
    gl.uniform1f(U.uT, st.tv + st.s);
    gl.uniform3fv(U.uX, st.x);
    gl.uniform1f(U.uRingTan, Math.exp(-st.s) * Math.tan(ringTheta0 / 2));
    gl.uniform3fv(U.uColA, colors.a); gl.uniform3fv(U.uColB, colors.b); gl.uniform3fv(U.uLine, colors.line);
    gl.uniform3fv(U.uRing1, colors.r1); gl.uniform3fv(U.uRing2, colors.r2); gl.uniform1f(U.uTint, colors.tint);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    drawOverlay();
    updateReadout();
  }

  // screen <-> view coordinates
  const scale = () => 0.5 * Math.min(W, H) * 0.965;
  const toView = (sx, sy, clamp = true) => {
    let px = (sx - W / 2) / scale(), py = -(sy - H / 2) / scale();
    let r2 = px * px + py * py;
    if (r2 > 1) { if (!clamp) return null; const r = Math.sqrt(r2); px /= r; py /= r; r2 = 1; }
    return [px, py, Math.sqrt(Math.max(0, 1 - r2))];
  };
  const toScreen = (world) => {
    const v = m3vec(m3T(st.Rv), world);
    return { x: W / 2 + v[0] * scale(), y: H / 2 - v[1] * scale(), front: v[2] > 0.02 };
  };

  const octx = ov.getContext('2d');
  function drawOverlay() {
    octx.setTransform(dpr, 0, 0, dpr, 0, 0);
    octx.clearRect(0, 0, W, H);
    octx.font = '600 12px Inter, system-ui, sans-serif';
    octx.lineWidth = 2;
    const label = (txt, x, y, color) => {
      octx.fillStyle = colors.panel; octx.globalAlpha = 0.85;
      const w = octx.measureText(txt).width;
      octx.fillRect(x - 3, y - 11, w + 6, 15);
      octx.globalAlpha = 1; octx.fillStyle = color; octx.fillText(txt, x, y);
    };
    // expansion center x (fixed by the boost)
    const X = toScreen(st.x);
    if (X.front) {
      octx.strokeStyle = colors.accent3;
      octx.beginPath(); octx.moveTo(X.x - 7, X.y); octx.lineTo(X.x + 7, X.y); octx.moveTo(X.x, X.y - 7); octx.lineTo(X.x, X.y + 7); octx.stroke();
      label('x', X.x + 8, X.y - 6, colors.accent3);
      // label for the ring B(x,R): place along screen-up direction from x
    }
    const Pn = toScreen(st.x.map((c) => -c));
    if (Pn.front) {
      octx.fillStyle = colors.accent2;
      octx.beginPath(); octx.arc(Pn.x, Pn.y, 3, 0, 7); octx.fill();
      label('p = h(z₀)', Pn.x + 8, Pn.y - 8, colors.accent2);
    }
    st.markers.forEach((m, i) => {
      const S = toScreen(m);
      if (!S.front) return;
      octx.fillStyle = i ? colors.accent4 || colors.accent : colors.accent;
      octx.strokeStyle = colors.panel;
      octx.beginPath(); octx.arc(S.x, S.y, 6.5, 0, 7); octx.fill(); octx.stroke();
      label(i ? 'hz' : 'hy', S.x + 9, S.y + 4, colors.ink);
    });
  }

  // ---- controls & readout ----
  const ctl = controls(right);
  ctl.style.marginTop = '0';
  const sS = slider(ctl, { label: 'expand s', min: 0, max: 6, step: 0.01, value: 0, fmt: (v) => v.toFixed(2), oninput: (v) => { st.s = v; request(); } });
  const sT = slider(ctl, { label: 'cell depth', min: 1, max: 3.6, step: 0.05, value: st.tv, fmt: (v) => v.toFixed(2), oninput: (v) => { st.tv = v; request(); } });
  const ctl2 = controls(right);
  let anim = null;
  button(ctl2, 'Animate zoom', () => {
    if (anim) cancelAnimationFrame(anim);
    const t0 = performance.now(), s0 = 0, s1 = 5.5;
    const step = (now) => {
      const u = Math.min(1, (now - t0) / 5000);
      st.s = s0 + (s1 - s0) * (0.5 - 0.5 * Math.cos(Math.PI * u));
      sS.set(st.s); request();
      anim = u < 1 ? requestAnimationFrame(step) : null;
    };
    anim = requestAnimationFrame(step);
  }, 'primary');
  const lookBtn = button(ctl2, 'Look at the puncture', () => {
    st.view = st.view === 'x' ? 'p' : 'x';
    lookBtn.textContent = st.view === 'x' ? 'Look at the puncture' : 'Look at x';
    turnTo(st.view === 'x' ? st.x : st.x.map((c) => -c));
  });

  const ro = el('div', { class: 'readout', style: 'margin-top:.7rem' });
  right.append(ro);
  right.append(el('div', { class: 'hint' }, 'Drag to rotate · click to set x · drag the markers hy, hz'));
  const legend = el('div', { class: 'hint' });
  legend.innerHTML = `<span style="color:var(--accent-3)">●</span> boundary of B(x,R), held at fixed screen size &nbsp; <span style="color:var(--accent-2)">●</span> image of the hemisphere far from x`;
  right.append(legend);

  function updateReadout() {
    const R = Math.exp(-st.s);
    const [hy, hz] = st.markers;
    const y = boostApply(st.x, st.s, hy), z = boostApply(st.x, st.s, hz);
    const dyz = chord(y, z), Dy = Math.max(R, chord(st.x, y)), Dz = Math.max(R, chord(st.x, z));
    const dh = chord(hy, hz);
    const ratio = dh * Dy * Dz / (R * dyz);
    ro.innerHTML = `
      <table>
        <tr><td class="k">scale R = e<sup>−s</sup></td><td>${fmt.g(R, 3)}</td></tr>
        <tr><td class="k">cell depth t (scale ≈ e<sup>−t</sup>)</td><td>${(st.tv + st.s).toFixed(2)}</td></tr>
      </table><hr>
      <div class="k" style="margin-bottom:.2rem">Expansion formula (2.2) at y, z</div>
      <table>
        <tr><td class="k">d(y, z)</td><td>${fmt.g(dyz, 3)}</td></tr>
        <tr><td class="k">D<sub>y</sub>, D<sub>z</sub></td><td>${fmt.g(Dy, 2)}, ${fmt.g(Dz, 2)}</td></tr>
        <tr><td class="k">d(hy, hz)</td><td>${fmt.g(dh, 3)}</td></tr>
        <tr><td class="k">R·d(y,z) / (D<sub>y</sub>D<sub>z</sub>)</td><td>${fmt.g(R * dyz / (Dy * Dz), 3)}</td></tr>
        <tr><td class="k">ratio</td><td><span class="${ratio > 0.45 && ratio < 1.05 ? 'ok' : 'bad'}">${ratio.toFixed(3)}</span></td></tr>
      </table>
      <div class="k" style="margin-top:.3rem">For this Möbius expansion the ratio always lies in [0.5, 1]. Those are c<sub>E</sub> and C<sub>E</sub>.</div>`;
  }

  // ---- interaction ----
  let turnAnim = null;
  function turnTo(target) {
    if (turnAnim) cancelAnimationFrame(turnAnim);
    const front0 = m3vec(st.Rv, [0, 0, 1]);
    const full = rotTaking(front0, norm3(target));
    const ax = cross(front0, target), ang = Math.atan2(Math.hypot(...ax), dot3(front0, target));
    const R0 = st.Rv.slice();
    const t0 = performance.now();
    const step = (now) => {
      const u = Math.min(1, (now - t0) / 650), e = 0.5 - 0.5 * Math.cos(Math.PI * u);
      const Rinc = Math.hypot(...ax) < 1e-9 ? (ang > 1 ? axisAngle(m3vec(R0, [0, 1, 0]), Math.PI * e) : [1, 0, 0, 0, 1, 0, 0, 0, 1]) : axisAngle(ax, ang * e);
      st.Rv = m3mul(Rinc, R0);
      request();
      turnAnim = u < 1 ? requestAnimationFrame(step) : null;
    };
    void full;
    turnAnim = requestAnimationFrame(step);
  }

  let drag = null;
  pointer(ov, {
    down(sx, sy) {
      // marker hit test
      for (let i = 0; i < 2; i++) {
        const S = toScreen(st.markers[i]);
        if (S.front && Math.hypot(S.x - sx, S.y - sy) < 13) { drag = { type: 'marker', i }; return true; }
      }
      const v = toView(sx, sy);
      drag = { type: 'rot', v, sx, sy, moved: false };
      ov.style.cursor = 'grabbing';
      return true;
    },
    move(sx, sy) {
      if (!drag) return;
      if (drag.type === 'marker') {
        st.markers[drag.i] = m3vec(st.Rv, toView(sx, sy));
        request();
        return;
      }
      if (Math.hypot(sx - drag.sx, sy - drag.sy) > 3) drag.moved = true;
      const v1 = toView(sx, sy);
      const Q = rotTaking(v1, drag.v);
      st.Rv = m3mul(st.Rv, Q);
      drag.v = v1;
      request();
    },
    up(sx, sy) {
      ov.style.cursor = 'grab';
      if (drag && drag.type === 'rot' && !drag.moved) {
        const v = toView(sx, sy, false);
        if (v) {
          const w = m3vec(st.Rv, v);
          st.x = boostApply(st.x, st.s, w); // original point under the cursor
          st.s = 0; sS.set(0);
          st.view = 'x'; lookBtn.textContent = 'Look at the puncture';
          turnTo(st.x);
          setTimeout(() => { resetMarkers(); request(); }, 680);
        }
      }
      drag = null;
    },
  });

  onTheme(() => { readColors(); request(); });
  resize();
}
