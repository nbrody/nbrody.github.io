/* The Riemann zeta viewer: a domain-colored picture of ζ (or ξ) over the s-plane,
   rendered progressively on the GPU, with a panel in the style of the poincare tool. */
import * as Z from './zeta.js';
import { VS, DATA_FS, COLOR_FS } from './shaders.js';

const $ = (id) => document.getElementById(id);
const TWO_PI = 2 * Math.PI;

/* ================================================================
   TeX helpers (all math goes through KaTeX)
   ================================================================ */
const hasKatex = () => typeof window.katex !== 'undefined';
const escapeHtml = (s) => s.replace(/[&<>"]/g, (ch) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[ch]));
const texCache = new Map();
function tex(s) {
  if (!hasKatex()) return escapeHtml(s);
  let h = texCache.get(s);
  if (h === undefined) {
    h = katex.renderToString(s, { throwOnError: false });
    if (texCache.size > 5000) texCache.clear();
    texCache.set(s, h);
  }
  return h;
}
function mixTex(s) {
  return s.split(/(\$[^$]+\$)/g).map((p) => (p.length > 2 && p[0] === '$' && p[p.length - 1] === '$') ? tex(p.slice(1, -1)) : escapeHtml(p)).join('');
}
function setTex(el, s) { if (el._t !== s) { el._t = s; el.innerHTML = tex(s); } }
function setMix(el, s) { if (el._t !== s) { el._t = s; el.innerHTML = mixTex(s); } }
function groupInt(d) { return d.length > 4 ? d.replace(/\B(?=(\d{3})+(?!\d))/g, '\\,') : d; }
function texNum(x, sig = 3) {
  if (!isFinite(x)) return '\\infty';
  if (x === 0) return '0';
  const ax = Math.abs(x);
  if (ax >= 1e-3 && ax < 1e6) {
    const s = String(Number(x.toPrecision(sig)));
    const [i, f] = s.split('.');
    const neg = i[0] === '-';
    return (neg ? '-' : '') + groupInt(neg ? i.slice(1) : i) + (f ? '.' + f : '');
  }
  let e = Math.floor(Math.log10(ax));
  let m = Number((x / 10 ** e).toPrecision(sig));
  if (Math.abs(m) >= 10) { m /= 10; e += 1; }
  const ms = Math.abs(m) === 1 ? (m < 0 ? '-' : '') : m + '\\times';
  return ms + '10^{' + e + '}';
}
const texInt = (n) => groupInt(String(Math.round(n)));
/* x with nd decimals, digits grouped (thin spaces every five decimals) */
function texFixed(x, nd, phantom = true) {
  const s = Math.abs(x).toFixed(Math.max(0, Math.min(100, nd)));
  const [ip, fp] = s.split('.');
  const zero = /^[0.]*$/.test(s);
  const sign = x < 0 && !zero ? '-' : phantom ? '\\phantom{-}' : '';
  return sign + groupInt(ip) + (fp ? '.' + fp.match(/.{1,5}/g).join('\\,') : '');
}
/* a value e^{L + iA}, as a + bi or (a + bi) × 10^e */
function texPolarValue(L, A, sig = 7) {
  if (L === -Infinity || L < -1e29) return '0';
  if (!isFinite(L)) return '\\infty';
  const l10 = L / Math.LN10;
  let m = 1, e = 0;
  if (Math.abs(l10) < 5) m = Math.exp(L); else { e = Math.floor(l10); m = 10 ** (l10 - e); }
  const a = m * Math.cos(A), b = m * Math.sin(A);
  // a part below the rounding of the other (as for ζ on the real axis, or at a Gram point) is left out
  const fa = texNum(a, sig), fb = texNum(Math.abs(b), sig);
  const body = Math.abs(b) < 1e-11 * Math.abs(a) ? fa
    : Math.abs(a) < 1e-11 * Math.abs(b) ? `${b < 0 ? '-' : ''}${fb}\\,i`
      : `${fa} ${b < 0 ? '-' : '+'} ${fb}\\,i`;
  return e ? `(${body}) \\times 10^{${e}}` : body;
}

function fail(msg) { const m = $('message'); m.textContent = msg; m.hidden = false; throw new Error(msg); }

document.querySelectorAll('[data-tex]').forEach((el) => setTex(el, el.dataset.tex));
document.querySelectorAll('[data-mix]').forEach((el) => setMix(el, el.dataset.mix));

/* ================================================================
   Theme: follows the system until the sun/moon button is used
   ================================================================ */
const THEME_KEY = 'riemann-viewer-theme';
const readStored = () => { try { return localStorage.getItem(THEME_KEY); } catch (e) { return null; } };
const themeBtn = $('theme-btn');
function setTheme(mode, persist) {
  document.documentElement.classList.toggle('light', mode === 'light');
  themeBtn.title = mode === 'light' ? 'Switch to dark mode' : 'Switch to light mode';
  themeBtn.setAttribute('aria-label', themeBtn.title);
  if (persist) { try { localStorage.setItem(THEME_KEY, mode); } catch (e) { /* private window */ } }
  insetDirty = true;
}
const mqLight = window.matchMedia('(prefers-color-scheme: light)');
let insetDirty = true;
setTheme(readStored() || (mqLight.matches ? 'light' : 'dark'), false);
mqLight.addEventListener?.('change', (e) => { if (!readStored()) setTheme(e.matches ? 'light' : 'dark', false); });
themeBtn.addEventListener('click', () => setTheme(document.documentElement.classList.contains('light') ? 'dark' : 'light', true));
const cssVar = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();

/* ================================================================
   Palettes: cyclic, indexed by arg f(s)/2π
   ================================================================ */
function oklch(L, C, hDeg) {
  const h = hDeg * Math.PI / 180, a = C * Math.cos(h), b = C * Math.sin(h);
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.2914855480 * b) ** 3;
  const lin = [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.7076147010 * s];
  return lin.map((v) => {
    v = Math.min(1, Math.max(0, v));
    return Math.round(255 * (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055));
  });
}
const PALETTES = [
  { id: 'spectrum', name: 'Spectrum', fn: (u) => oklch(0.72, 0.165, 25 + 360 * u) },
  { id: 'classic', name: 'Classic',
    stops: [[0, '#000764'], [0.16, '#206bcb'], [0.42, '#edffff'], [0.6425, '#ffaa00'], [0.8575, '#000200'], [1, '#000764']] },
  { id: 'ember', name: 'Ember',
    stops: [[0, '#12040a'], [0.22, '#6b1020'], [0.45, '#e0521c'], [0.62, '#ffc857'], [0.76, '#fff5dc'], [0.9, '#5c1a2e'], [1, '#12040a']] },
  { id: 'lagoon', name: 'Lagoon',
    stops: [[0, '#04121c'], [0.25, '#0f5866'], [0.48, '#5fd3b8'], [0.66, '#f1f4dc'], [0.82, '#4b7fb0'], [1, '#04121c']] },
  { id: 'ink', name: 'Ink', stops: [[0, '#f7f8fb'], [0.5, '#cdd4e4'], [1, '#f7f8fb']] },
];
const hex3 = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
function paletteColor(p, u) {
  if (p.fn) return p.fn(u);
  let k = 0;
  while (k < p.stops.length - 2 && p.stops[k + 1][0] <= u) k++;
  const [t0, h0] = p.stops[k], [t1, h1] = p.stops[k + 1];
  const v = (u - t0) / (t1 - t0), a = hex3(h0), b = hex3(h1);
  return a.map((c, i) => Math.round(c + (b[i] - c) * v));
}
function paletteLUT(p) {
  const n = 512, out = new Uint8Array(n * 4);
  for (let i = 0; i < n; i++) {
    const c = paletteColor(p, i / n);
    out.set(c, 4 * i); out[4 * i + 3] = 255;
  }
  return out;
}
function paletteCSS(p) {
  const st = [];
  for (let i = 0; i <= 12; i++) { const c = paletteColor(p, i / 12); st.push(`rgb(${c.join(',')}) ${(i / 12 * 100).toFixed(1)}%`); }
  return `linear-gradient(90deg, ${st.join(', ')})`;
}
const opts = { palette: 0, rings: true, grid: false, relief: false, cycle: false, lines: 8, offset: 0, strip: true, zeros: true, coords: true };

/* ================================================================
   WebGL 2: data pass → float layers → color pass
   ================================================================ */
const canvas = $('gl');
const gl = canvas.getContext('webgl2', { antialias: false, alpha: false, depth: false, stencil: false, powerPreference: 'high-performance' });
if (!gl) fail('This viewer needs WebGL 2, which this browser does not provide.');
if (!gl.getExtension('EXT_color_buffer_float')) fail('This viewer needs float render targets (EXT_color_buffer_float), which this GPU does not provide.');

function makeProgram(fsSrc) {
  const sh = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src); gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
    return s;
  };
  const p = gl.createProgram();
  gl.attachShader(p, sh(gl.VERTEX_SHADER, VS));
  gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fsSrc));
  gl.linkProgram(p);
  if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p));
  const U = {};
  const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
  for (let i = 0; i < n; i++) { const info = gl.getActiveUniform(p, i); U[info.name.replace(/\[0\]$/, '')] = gl.getUniformLocation(p, info.name); }
  return { p, U };
}
let dataProg, colorProg;
try { dataProg = makeProgram(DATA_FS); colorProg = makeProgram(COLOR_FS); }
catch (e) { console.error(e); fail('The renderer did not compile on this GPU: ' + e.message); }

function makeTex(filter) {
  const t = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, t);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, filter === gl.LINEAR ? gl.REPEAT : gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return t;
}
const palTex = makeTex(gl.LINEAR);
gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
function uploadPalette() {
  gl.bindTexture(gl.TEXTURE_2D, palTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, 512, 1, 0, gl.RGBA, gl.UNSIGNED_BYTE, paletteLUT(PALETTES[opts.palette]));
  gl.generateMipmap(gl.TEXTURE_2D);
}
uploadPalette();

/* the Riemann–Siegel table G_{k,j}(p), k < 4, j ≤ k: ten complex functions in five RGBA rows */
const RSG_W = 2049;
const rsgTex = makeTex(gl.NEAREST);
{
  const pairs = [];
  for (let k = 0; k < Z.RS_K; k++) for (let j = 0; j <= k; j++) pairs.push([k, j]);
  const rows = Math.ceil(pairs.length / 2), data = new Float32Array(RSG_W * rows * 4);
  pairs.forEach(([k, j], idx) => {
    const row = idx >> 1, off = (idx & 1) * 2;
    for (let i = 0; i < RSG_W; i++) {
      const g = Z.rsG(k, j, -1 + (2 * i) / (RSG_W - 1));
      data[(row * RSG_W + i) * 4 + off] = g[0];
      data[(row * RSG_W + i) * 4 + off + 1] = g[1];
    }
  });
  gl.bindTexture(gl.TEXTURE_2D, rsgTex);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA32F, RSG_W, rows, 0, gl.RGBA, gl.FLOAT, data);
}

/* reference phases n^{−it₀} */
const REF_CAP = 4096 * 32;
const refTex = makeTex(gl.NEAREST);
let refKey = '';

/* layers: float textures of (log|f|, arg f, Re f′/f, Im f′/f) */
let layers = [], complete = null, job = null;
function makeLayer(W, H) {
  const tex = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, tex);
  gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, W, H);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
  if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) fail('Float render targets are not usable on this GPU.');
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { tex, fbo, has: false, cx: 0, cy: 0, w: 1, rw: 1, rh: 1, rowDone: 1 };
}

/* ================================================================
   The view
   ================================================================ */
let fn = 'zeta';
const modeKey = () => fn;
const T_MAX = 1e9, MAX_W = 600;
const minW = (t) => Math.max(2e-4, Math.abs(t) * 4e-12);
const view = { cx: -3, cy: 17, w: 40 };
let viewVersion = 0, viewMoved = true;
let cssW = 1, cssH = 1, devW = 1, devH = 1;
const panel = $('control-panel');
function setView(cx, cy, w) {
  view.cy = Math.max(-T_MAX, Math.min(T_MAX, cy));
  view.cx = Math.max(-1e4, Math.min(1e4, cx));
  view.w = Math.min(MAX_W, Math.max(minW(view.cy), w));
  viewMoved = true;
}
const ppu = () => cssW / view.w;
function worldAt(x, y) { const s = view.w / cssW; return { x: view.cx + (x - cssW / 2) * s, t: view.cy + (cssH / 2 - y) * s }; }
function screenOf(x, t) { const k = ppu(); return [cssW / 2 + (x - view.cx) * k, cssH / 2 - (t - view.cy) * k]; }
function zoomAbout(x, y, f) {
  const p = worldAt(x, y);
  const w1 = Math.min(MAX_W, Math.max(minW(view.cy), view.w * f)), k = w1 / view.w;
  setView(p.x + (view.cx - p.x) * k, p.t + (view.cy - p.t) * k, w1);
}
function panBy(dx, dy) { const s = view.w / cssW; setView(view.cx - dx * s, view.cy + dy * s, view.w); }
const isSheet = () => window.matchMedia('(max-width: 719px)').matches;
function freeRect() {
  const r = { x0: 0, y0: 0, x1: cssW, y1: cssH };
  if (panel.classList.contains('collapsed')) return r;
  const pr = panel.getBoundingClientRect();
  if (isSheet()) r.y1 = Math.max(cssH * 0.4, pr.top - 8);
  else r.x1 = Math.max(cssW * 0.4, pr.left - 8);
  return r;
}
/* the view showing the box of size sx × sy around (cx, cy) in the part of the screen the panel leaves free */
function viewFor(cx, cy, sx, sy = sx) {
  const fr = freeRect(), fw = fr.x1 - fr.x0, fh = fr.y1 - fr.y0;
  const s = Math.max(sx / (fw * 0.9), sy / (fh * 0.9));
  const ox = ((fr.x0 + fr.x1) / 2 - cssW / 2) * s, oy = (cssH / 2 - (fr.y0 + fr.y1) / 2) * s;
  return { cx: cx - ox, cy: cy - oy, w: s * cssW };
}

function resize() {
  cssW = Math.max(1, window.innerWidth); cssH = Math.max(1, window.innerHeight);
  let dpr = Math.min(window.devicePixelRatio || 1, 2);
  if (cssW * cssH * dpr * dpr > 5.2e6) dpr = Math.max(1, Math.sqrt(5.2e6 / (cssW * cssH)));
  devW = Math.round(cssW * dpr); devH = Math.round(cssH * dpr);
  canvas.width = devW; canvas.height = devH;
  const ov = $('overlay'); ov.width = devW; ov.height = devH;
  for (const L of layers) { gl.deleteTexture(L.tex); gl.deleteFramebuffer(L.fbo); }
  layers = [makeLayer(devW, devH), makeLayer(devW, devH)];
  complete = null; job = null;
  viewMoved = true; overlayDirty = true;
  sizeInset();
}

/* ================================================================
   References: everything the shader cannot do in single precision
   ================================================================ */
/** The number of reference phases the shader needs at σ + it (mirrors its method choice). */
function planTerms(x, t, f) {
  if (f === 'xi' && x < 0.5) x = 1 - x;
  const a = Math.sqrt(t / TWO_PI);
  if (t >= Z.GPU.T_RS && Math.abs(x - 0.5) <= Math.min(a / 3, Z.RS_SIG)) return Math.floor(a);
  const xr = x >= 0 ? x : 1 - x;
  return Math.min(Z.emTerms(xr, t, Z.GPU.EM_SLACK), Z.directTerms(xr, t, Z.GPU.EPS));
}
/** The most terms any pixel of the view needs: on a grid, and on both sides of every place
    where the method changes (the edges of the Riemann–Siegel range, σ = 0, σ = 1.5, t = T_RS). */
function neededTerms(cx, cy, W, H) {
  const x0 = cx - W / 2, x1 = cx + W / 2, ta = cy - H / 2, tb = cy + H / 2;
  const tMax = Math.max(Math.abs(ta), Math.abs(tb)), tMin = ta < 0 && tb > 0 ? 0 : Math.min(Math.abs(ta), Math.abs(tb));
  const ts = [tMin, tMax];
  for (let j = 0; j <= 8; j++) ts.push(Math.abs(ta + (j / 8) * H));
  if (Z.GPU.T_RS > tMin && Z.GPU.T_RS < tMax) ts.push(Z.GPU.T_RS * (1 - 1e-9));
  const eps = 1e-7;
  let need = 1;
  for (const t of ts) {
    const b = Math.min(Math.sqrt(t / TWO_PI) / 3, Z.RS_SIG);
    const xs = [x0, x1];
    for (let i = 1; i < 8; i++) xs.push(x0 + (i / 8) * W);
    for (const c of [0.5 - b, 0.5 + b, 0, 1.5, -0.5, 1]) xs.push(c - eps, c + eps);
    for (const x of xs) if (x >= x0 && x <= x1) need = Math.max(need, planTerms(x, t, fn));
  }
  return need;
}
function methodAt(x, t) {
  t = Math.abs(t);
  if (fn === 'xi' && x < 0.5) x = 1 - x;
  const a = Math.sqrt(t / TWO_PI);
  if (t >= Z.GPU.T_RS && Math.abs(x - 0.5) <= Math.min(a / 3, Z.RS_SIG)) return { rs: true, n: Math.floor(a) };
  const xr = x >= 0 ? x : 1 - x;
  const Me = Z.emTerms(xr, t, Z.GPU.EM_SLACK), Md = Z.directTerms(xr, t, Z.GPU.EPS);
  return { rs: false, n: Math.min(Me, Md), direct: Md < Me, reflect: x < 0 };
}
function buildReference(cx, cy, W, H) {
  const tr0 = Math.abs(cy), big = Math.max(W, H);
  const refMode = tr0 > 0 && tr0 >= 4 * big;
  const bigRef = refMode && tr0 >= 30;
  const R = { refMode, bigRef, tr0, sg: cy < 0 ? -1 : 1, refLen: 0, need: 0 };
  R.need = neededTerms(cx, cy, W, H);
  const need = R.need;
  if (refMode) {
    R.refLen = Math.min(REF_CAP - 1, Math.ceil(need * 1.05) + 4);
    const key = tr0 + ':' + R.refLen;
    if (key !== refKey) {
      const rows = Math.ceil((R.refLen + 1) / 4096), data = new Float32Array(4096 * rows * 2);
      for (let n = 1; n <= R.refLen; n++) {
        const ph = -((tr0 * Math.log(n)) % TWO_PI);
        data[2 * n] = Math.cos(ph); data[2 * n + 1] = Math.sin(ph);
      }
      gl.bindTexture(gl.TEXTURE_2D, refTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RG32F, 4096, rows, 0, gl.RG, gl.FLOAT, data);
      refKey = key;
    }
  }
  if (bigRef) {
    const lc = Z.logChi(cx, tr0);
    R.logChi0 = [lc[0], Z.wrap(lc[1])];
    // ξ is computed at max(σ, 1 − σ), so its Γ(s/2) reference sits on the right of the critical line
    R.xr = cx >= 0.5 ? cx : 1 - cx;
    const lg = Z.logGamma(R.xr / 2, tr0 / 2);
    const xre = -0.5 * R.xr * Z.LOG_PI + lg[0];
    R.Loff = fn === 'xi' ? TWO_PI * Math.round(xre / TWO_PI) : 0;
    R.logXi0 = [xre - R.Loff, Z.wrap(-0.5 * tr0 * Z.LOG_PI + lg[1])];
    R.logzX = Z.clog([R.xr / 2, tr0 / 2]);
    R.logzA = Z.clog([cx / 2, tr0 / 2]);
    R.logzB = Z.clog([(1 - cx) / 2, -tr0 / 2]);
    const th = Z.vartheta(tr0) % TWO_PI;
    R.U0 = [Math.cos(th), -Math.sin(th)];
    R.lnT0 = Math.log(tr0 / TWO_PI);
    R.a0 = Math.sqrt(tr0 / TWO_PI); R.N0 = Math.floor(R.a0); R.f0 = R.a0 - R.N0;
  }
  return R;
}
function setDataUniforms(R, L) {
  const U = dataProg.U;
  gl.useProgram(dataProg.p);
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, refTex);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, rsgTex);
  gl.uniform1i(U.u_ref, 0); gl.uniform1i(U.u_rsg, 1);
  gl.uniform1i(U.u_refLen, R.refLen);
  gl.uniform1i(U.u_rsgW, RSG_W);
  gl.uniform1i(U.u_refMode, R.refMode ? 1 : 0);
  gl.uniform1i(U.u_bigRef, R.bigRef ? 1 : 0);
  gl.uniform2f(U.u_res, L.rw, L.rh);
  gl.uniform2f(U.u_span, L.w, L.w * L.aspect);
  gl.uniform2f(U.u_c0, L.cx, L.cy);
  gl.uniform1f(U.u_tr0, R.tr0);
  gl.uniform1f(U.u_sg, R.sg);
  gl.uniform1i(U.u_fn, fn === 'xi' ? 1 : 0);
  if (R.bigRef) {
    gl.uniform2fv(U.u_logChi0, R.logChi0); gl.uniform2fv(U.u_logXi0, R.logXi0);
    gl.uniform2fv(U.u_logzA, R.logzA); gl.uniform2fv(U.u_logzB, R.logzB); gl.uniform2fv(U.u_logzX, R.logzX);
    gl.uniform1f(U.u_xr, R.xr);
    gl.uniform2fv(U.u_U0, R.U0);
    gl.uniform1f(U.u_lnT0, R.lnT0); gl.uniform1f(U.u_a0, R.a0); gl.uniform1f(U.u_N0, R.N0); gl.uniform1f(U.u_f0, R.f0);
  }
}

/* ================================================================
   Progressive rendering: a low-resolution pass, then full resolution
   in bands paced by GPU fences (as in the Mandelbrot viewer)
   ================================================================ */
let loScale = 0.3, bandPx = 60000, fence = null, fenceT = 0;
let dirty = true;
function startJob(phase) {
  const target = layers[0] === complete ? layers[1] : layers[0];
  const s = phase === 'lo' ? loScale : 1;
  const rw = Math.max(8, Math.round(devW * s)), rh = Math.max(8, Math.round(devH * s));
  Object.assign(target, { has: true, cx: view.cx, cy: view.cy, w: view.w, aspect: cssH / cssW, rw, rh, rowDone: rh, phase, key: modeKey() });
  const R = buildReference(view.cx, view.cy, view.w, view.w * cssH / cssW);
  target.R = R;
  job = { phase, layer: target, R, version: viewVersion, t0: performance.now() };
}
function issueBand() {
  const L = job.layer;
  const rows = Math.min(L.rowDone, Math.max(2, Math.round(bandPx / L.rw)));
  const y0 = L.rowDone - rows;
  gl.bindFramebuffer(gl.FRAMEBUFFER, L.fbo);
  gl.viewport(0, 0, L.rw, L.rh);
  gl.enable(gl.SCISSOR_TEST);
  gl.scissor(0, y0, L.rw, rows);
  setDataUniforms(job.R, L);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
  gl.disable(gl.SCISSOR_TEST);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  L.rowDone = y0;
  fence = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
  fenceT = performance.now();
  gl.flush();
  dirty = true;
}
function onJobDone(now) {
  complete = job.layer;
  if (job.phase === 'lo') {
    const ms = now - job.t0;
    if (ms > 140) loScale = Math.max(0.08, loScale * 0.75);
    else if (ms < 35) loScale = Math.min(0.5, loScale * 1.2);
    const stale = job.version !== viewVersion;
    job = null;
    if (!stale) startJob('hi');
  } else job = null;
}
const NO_FENCE = !!window.__rzNoFence;   // set only by headless test pages
function schedule(now) {
  if (NO_FENCE) { if (fence) { gl.deleteSync(fence); fence = null; } bandPx = devW * devH; }
  if (fence) {
    if (gl.getSyncParameter(fence, gl.SYNC_STATUS) !== gl.SIGNALED) return;
    gl.deleteSync(fence); fence = null;
    const ms = now - fenceT;
    if (ms < 22) bandPx = Math.min(devW * devH, bandPx * 1.5);
    else if (ms > 45) bandPx = Math.max(4096, bandPx * 0.6);
  }
  if (job && job.layer.rowDone <= 0) onJobDone(now);
  if (job && job.phase === 'hi' && job.version !== viewVersion) job = null;
  if (job && job.layer.key !== modeKey()) job = null;
  if (!job) {
    const same = complete && complete.key === modeKey() && complete.cx === view.cx && complete.cy === view.cy && complete.w === view.w && complete.aspect === cssH / cssW;
    if (!same) startJob('lo');
    else if (complete.phase === 'lo') startJob('hi');
    else return;
  }
  issueBand();
}

function layerXf(L) {
  const k = view.w / L.w;
  return [k, (view.cx - L.cx) / L.w, (view.cy - L.cy) / (L.w * L.aspect), L.rowDone];
}
function drawColor() {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, devW, devH);
  gl.useProgram(colorProg.p);
  const U = colorProg.U;
  const top = job ? job.layer : null, bot = complete && complete.key === modeKey() ? complete : null;
  gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, top ? top.tex : layers[0].tex);
  gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, bot ? bot.tex : layers[1].tex);
  gl.activeTexture(gl.TEXTURE2); gl.bindTexture(gl.TEXTURE_2D, palTex);
  gl.uniform1i(U.u_top, 0); gl.uniform1i(U.u_bot, 1); gl.uniform1i(U.u_pal, 2);
  gl.uniform1i(U.u_hasTop, top ? 1 : 0);
  gl.uniform1i(U.u_hasBot, bot ? 1 : 0);
  const upp = view.w / devW;
  if (top) { gl.uniform4fv(U.u_xfTop, layerXf(top)); gl.uniform2f(U.u_resTop, top.rw, top.rh); gl.uniform1f(U.u_uppTop, Math.max(upp, top.w / top.rw)); }
  if (bot) { gl.uniform4fv(U.u_xfBot, layerXf(bot)); gl.uniform2f(U.u_resBot, bot.rw, bot.rh); gl.uniform1f(U.u_uppBot, Math.max(upp, bot.w / bot.rw)); }
  gl.uniform2f(U.u_screen, devW, devH);
  gl.uniform3f(U.u_bg, 0.02, 0.025, 0.05);
  gl.uniform1f(U.u_lines, opts.lines);
  gl.uniform1f(U.u_offset, opts.offset);
  gl.uniform1i(U.u_rings, opts.rings ? 1 : 0);
  gl.uniform1i(U.u_grid, opts.grid ? 1 : 0);
  gl.uniform1i(U.u_relief, opts.relief ? 1 : 0);
  gl.uniform2f(U.u_light, -Math.SQRT1_2, Math.SQRT1_2);
  gl.drawArrays(gl.TRIANGLES, 0, 3);
}

/* ================================================================
   Workers: zeros on the critical line, and the inset curves
   ================================================================ */
function workerQueue(order, onResult) {
  let w = null, busy = false, seq = 0;
  const pending = new Map();
  try { w = new Worker(new URL('./worker.js', import.meta.url), { type: 'module' }); }
  catch (e) { console.error(e); }
  if (w) {
    w.onmessage = (e) => { busy = false; onResult(e.data); pump(); };
    w.onerror = (e) => { console.error(e); busy = false; pump(); };
  }
  function pump() {
    if (busy || !w) return;
    for (const slot of order) {
      if (!pending.has(slot)) continue;
      const m = pending.get(slot); pending.delete(slot);
      busy = true; w.postMessage(m);
      return;
    }
  }
  return {
    request(slot, msg) { msg.slot = slot; msg.id = ++seq; pending.set(slot, msg); pump(); return msg.id; },
    get busy() { return busy || pending.size > 0; },
  };
}

/* zero lists cover |t| intervals: {a, b, zeros: [{n, gamma}]} */
let zeroCache = [];
function zerosCovering(a, b) { return zeroCache.find((z) => z.a <= a && z.b >= b) || null; }
const zq = workerQueue(['nth', 'near', 'view'], (m) => {
  if (m.type === 'nth') { onNth(m); return; }
  if (m.zeros) {
    zeroCache = [{ a: m.t0, b: m.t1, zeros: m.zeros }, ...zeroCache.filter((z) => !(z.a >= m.t0 && z.b <= m.t1))].slice(0, 10);
    overlayDirty = true; pointDirty = true;
  }
  nearPending = nearPending === m.key ? null : nearPending;
});
let viewZerosKey = '', nearPending = null;
function visibleZeroRange() {
  const fr = freeRect();
  const p0 = worldAt(fr.x0, fr.y1), p1 = worldAt(fr.x1, fr.y0);
  if (!(p0.x < 0.5 && p1.x > 0.5)) return null;
  const tl = p0.t, th = p1.t;
  let a, b;
  if (tl >= 0) { a = tl; b = th; } else if (th <= 0) { a = -th; b = -tl; } else { a = 0; b = Math.max(-tl, th); }
  b = Math.max(b, 14);
  if (b < 14) return null;
  const gap = Z.meanGap(b);
  if (gap * ppu() < 5 || (b - a) / gap > 500) return null;
  const m = 0.5 * gap;
  return { a: Math.max(10, a - m), b: b + m };
}
function requestViewZeros() {
  const r = visibleZeroRange();
  if (!r || zerosCovering(r.a, r.b)) return;
  const key = r.a.toPrecision(12) + ':' + r.b.toPrecision(12);
  if (key === viewZerosKey) return;
  viewZerosKey = key;
  zq.request('view', { type: 'zeros', t0: r.a, t1: r.b, key });
}
function nearestZero(x, t) {
  const at = Math.abs(t);
  if (at < 10 || Math.abs(x - 0.5) > 2.5) return { none: true };
  const g = Z.meanGap(at), a = Math.max(10, at - 1.5 * g), b = at + 1.5 * g;
  const c = zerosCovering(a, b);
  if (!c) {
    const key = a.toFixed(6) + ':' + b.toFixed(6);
    if (nearPending !== key) {
      nearPending = key;
      const w = 4 * g;
      zq.request('near', { type: 'zeros', t0: Math.max(10, at - w), t1: at + w, key });
    }
    return { pending: true };
  }
  let best = null;
  for (const z of c.zeros) {
    const d = Math.hypot(x - 0.5, at - z.gamma);
    if (!best || d < best.d) best = { ...z, d };
  }
  return best ? { ...best, conj: t < 0, gap: g } : { none: true };
}
let nthRequest = null;
function onNth(m) {
  const msg = $('goto-msg');
  if (m.gamma == null) { msg.textContent = `Could not locate zero number ${m.n}.`; return; }
  msg.textContent = '';
  const g = m.gamma, gap = Z.meanGap(g);
  pin = { x: 0.5, t: g };
  pointDirty = true; overlayDirty = true;
  flyTo(viewFor(0.5, g, 6 * gap, 6 * gap));
}

const iq = workerQueue(['inset'], (m) => {
  insetData = m; insetDirty = true;
});

/* ================================================================
   Overlay: critical strip, zeros, pin, coordinates (labels are HTML)
   ================================================================ */
const octx = $('overlay').getContext('2d');
const labelBox = $('labels');
const labelPool = new Map();
let overlayDirty = true;
function placeLabels(list) {
  const seen = new Set();
  for (const L of list) {
    let el = labelPool.get(L.key);
    if (!el) { el = document.createElement('span'); labelPool.set(L.key, el); labelBox.appendChild(el); }
    el.className = 'lab ' + (L.cls || '');
    setTex(el, L.tex);
    el.style.transform = `translate(${L.x.toFixed(1)}px, ${L.y.toFixed(1)}px)`;
    seen.add(L.key);
  }
  for (const [k, el] of labelPool) if (!seen.has(k)) { el.remove(); labelPool.delete(k); }
}
function niceStep(target) {
  const e = Math.floor(Math.log10(target)), b = 10 ** e, m = target / b;
  return (m <= 1 ? 1 : m <= 2 ? 2 : m <= 5 ? 5 : 10) * b;
}
function texCoord(v, step) {
  const nd = Math.max(0, -Math.floor(Math.log10(step) + 1e-9));
  return texFixed(Math.abs(v) < step * 1e-6 ? 0 : v, nd, false);
}
function drawOverlay() {
  const r = devW / cssW;
  octx.setTransform(1, 0, 0, 1, 0, 0);
  octx.clearRect(0, 0, devW, devH);
  octx.setTransform(r, 0, 0, r, 0, 0);
  const labels = [];
  const fr = freeRect();
  // the critical strip and line
  if (opts.strip) {
    for (const [x, dash, a] of [[0, null, 0.38], [1, null, 0.38], [0.5, [7, 6], 0.7]]) {
      const [X] = screenOf(x, 0);
      if (X < -2 || X > cssW + 2) continue;
      octx.setLineDash(dash || []);
      octx.lineWidth = 3; octx.strokeStyle = 'rgba(0,0,0,0.28)';
      octx.beginPath(); octx.moveTo(X, 0); octx.lineTo(X, cssH); octx.stroke();
      octx.lineWidth = 1; octx.strokeStyle = `rgba(255,255,255,${a})`;
      octx.beginPath(); octx.moveTo(X, 0); octx.lineTo(X, cssH); octx.stroke();
    }
    octx.setLineDash([]);
  }
  // zeros on the critical line
  if (opts.zeros) {
    const k = ppu(), [X] = screenOf(0.5, 0);
    if (X > -10 && X < cssW + 10) {
      const p0 = worldAt(0, cssH), p1 = worldAt(0, 0);
      let drawn = 0;
      for (const c of zeroCache) {
        for (const z of c.zeros) {
          for (const sg of [1, -1]) {
            const t = sg * z.gamma;
            if (t < p0.t - 1 || t > p1.t + 1 || Z.meanGap(z.gamma) * k < 5) continue;
            const [, Y] = screenOf(0.5, t);
            if (drawn++ > 1500) break;
            octx.lineWidth = 3; octx.strokeStyle = 'rgba(0,0,0,0.5)';
            octx.beginPath(); octx.arc(X, Y, 4.2, 0, TWO_PI); octx.stroke();
            octx.lineWidth = 1.4; octx.strokeStyle = '#ffffff';
            octx.beginPath(); octx.arc(X, Y, 4.2, 0, TWO_PI); octx.stroke();
            const gap = Z.meanGap(z.gamma) * k;
            if (gap > 26 && z.n != null && X + 10 < fr.x1 - 40 && Y > fr.y0 + 10 && Y < fr.y1 - 10) {
              labels.push({ key: 'z' + sg * z.n, tex: (sg > 0 ? '\\rho_{' : '\\bar\\rho_{') + texInt(z.n) + '}', x: X + 9, y: Y - 10, cls: 'zero' });
            }
          }
        }
      }
    }
  }
  // coordinates along the left and top edges of the free area
  if (opts.coords) {
    const k = ppu(), step = niceStep(70 / k);
    const p0 = worldAt(fr.x0, fr.y1), p1 = worldAt(fr.x1, fr.y0);
    octx.lineWidth = 1; octx.strokeStyle = 'rgba(255,255,255,0.75)';
    const tStart = Math.ceil(p0.t / step), tEnd = Math.floor(p1.t / step);
    if (tEnd - tStart < 80) {
      for (let i = tStart; i <= tEnd; i++) {
        const t = i * step, [, Y] = screenOf(0, t);
        if (Y < fr.y0 + 64 || Y > fr.y1 - 70) continue;
        octx.beginPath(); octx.moveTo(fr.x0, Y); octx.lineTo(fr.x0 + 7, Y); octx.stroke();
        labels.push({ key: 't' + i + ':' + step, tex: texCoord(t, step) + (Math.abs(t) > step * 1e-6 ? '\\,i' : ''), x: fr.x0 + 10, y: Y - 9, cls: 'coord' });
      }
    }
    const sStart = Math.ceil(p0.x / step), sEnd = Math.floor(p1.x / step);
    if (sEnd - sStart < 80) {
      for (let i = sStart; i <= sEnd; i++) {
        const x = i * step, [X] = screenOf(x, 0);
        if (X < fr.x0 + 60 || X > fr.x1 - 30) continue;
        octx.beginPath(); octx.moveTo(X, fr.y0); octx.lineTo(X, fr.y0 + 7); octx.stroke();
        labels.push({ key: 's' + i + ':' + step, tex: texCoord(x, step), x: X - 4, y: fr.y0 + 9, cls: 'coord' });
      }
    }
  }
  // the pinned point
  const [px, py] = screenOf(pin.x, pin.t);
  if (px > -20 && py > -20 && px < cssW + 20 && py < cssH + 20) {
    octx.lineWidth = 3.2; octx.strokeStyle = 'rgba(0,0,0,0.55)';
    octx.beginPath(); octx.arc(px, py, 7, 0, TWO_PI); octx.stroke();
    octx.lineWidth = 1.6; octx.strokeStyle = '#ffb547';
    octx.beginPath(); octx.arc(px, py, 7, 0, TWO_PI); octx.stroke();
    octx.beginPath(); octx.arc(px, py, 1.6, 0, TWO_PI); octx.fillStyle = '#ffb547'; octx.fill();
  }
  placeLabels(labels.slice(0, 160));
}

/* ================================================================
   The point under the pointer (or pinned)
   ================================================================ */
let pin = { x: 0.5, t: 19.5 };
let hover = null, pointDirty = true, insetData = null, insetMode = 'path';
const activePoint = () => hover || pin;
const el = {
  chip: $('point-chip'), s: $('v-s'), f: $('v-f'), abs: $('v-abs'), arg: $('v-arg'), status: $('status'),
  fLab: $('lab-f'), absLab: $('lab-abs'), argLab: $('lab-arg'),
  vc: $('v-c'), vw: $('v-w'), vm: $('v-m'), vref: $('v-ref'),
  scale: $('scalebar'), scaleLabel: $('scale-label'), progress: $('progress'),
  insetLabel: $('inset-label'), insetCap: $('inset-caption'),
};
const digitsFor = () => Math.min(14, Math.max(2, Math.ceil(-Math.log10(view.w / cssW)) + 1));
function texS(x, t, nd) {
  const im = texFixed(Math.abs(t), nd, false);
  return `${texFixed(x, nd, false)} ${t < 0 ? '-' : '+'} ${im}\\,i`;
}
function fName() { return fn === 'xi' ? '\\xi' : '\\zeta'; }
function updatePoint() {
  const P = activePoint();
  const nd = digitsFor();
  el.chip.textContent = hover ? 'Pointer' : 'Pinned';
  el.chip.className = 'chip ' + (hover ? 'pointer' : 'pinned');
  const F = fName();
  setTex(el.fLab, `${F}(s)`); setTex(el.absLab, `|${F}(s)|`); setTex(el.argLab, `\\arg ${F}(s)`);
  setTex(el.s, texS(P.x, P.t, nd));
  const L = fn === 'xi' ? Z.logXi(P.x, P.t) : Z.logZeta(P.x, P.t);
  setTex(el.f, texPolarValue(L[0], L[1]));
  setTex(el.abs, L[0] / Math.LN10 > -5 && L[0] / Math.LN10 < 5 ? texNum(Math.exp(L[0]), 7) : `10^{${(L[0] / Math.LN10).toFixed(3)}}`);
  setTex(el.arg, isFinite(L[0]) && L[0] > -60 ? `${texNum(L[1], 6)} = ${texNum(L[1] / Math.PI, 5)}\\,\\pi` : '\\text{undefined}');
  setMix(el.status, statusText(P, L));
  requestInset();
}
function statusText(P, L) {
  const { x, t } = P, at = Math.abs(t);
  const F = fn === 'xi' ? '\\xi' : '\\zeta';
  if (Math.hypot(x - 1, t) < 0.6) {
    return fn === 'xi'
      ? 'The pole of $\\zeta$ at $s = 1$ is cancelled by the factor $s - 1$: $\\xi$ is entire, with $\\xi(0) = \\xi(1) = \\tfrac12$.'
      : 'Near the pole at $s = 1$: $\\zeta(s) = \\frac{1}{s-1} + \\gamma + O(s - 1)$, with Euler’s constant $\\gamma \\approx 0.5772$. The colors wind clockwise.';
  }
  if (x < -0.8 && at < 0.8) {
    const k = Math.round(-x / 2);
    if (k >= 1 && Math.abs(x + 2 * k) < 0.8) {
      return fn === 'xi'
        ? `$\\xi$ has no zero at $s = ${-2 * k}$: the pole of $\\Gamma(s/2)$ cancels the trivial zero of $\\zeta$.`
        : `Near the trivial zero $s = ${-2 * k}$, where $1/\\Gamma(s/2)$ in $\\chi(s) = \\pi^{s - 1/2}\\,\\Gamma(\\frac{1-s}{2})/\\Gamma(\\frac s2)$ vanishes.`;
    }
  }
  // on a Gram point g_n, where θ(g_n) = nπ and ζ(1/2 + i g_n) = (−1)^n Z(g_n) is real
  if (at > 17 && Math.abs(x - 0.5) * ppu() < 2) {
    const k = Math.round(Z.theta(at) / Math.PI), g = Z.gramPoint(k);
    if (Math.abs(g - at) * ppu() < 2) {
      const z = Z.hardyZ(g), holds = (k % 2 ? -1 : 1) * z > 0;
      return `This is the Gram point $${t < 0 ? '-' : ''}g_{${texInt(k)}} = ${texFixed(g, 6, false)}$, where $\\theta(g_n) = n\\pi$, so $\\zeta(\\tfrac12 + i g_n) = (-1)^n Z(g_n)$ is real. ` +
        (holds ? `Gram’s law $(-1)^n Z(g_n) > 0$ holds here.` : `Gram’s law $(-1)^n Z(g_n) > 0$ fails here: $Z(g_{${texInt(k)}}) = ${texNum(z, 4)}$.`);
    }
  }
  const nz = nearestZero(x, t);
  if (nz.pending) return '<span class="dim">Locating the nearest zero on the critical line…</span>';
  if (!nz.none && nz.d < 0.75 * nz.gap) {
    const g = nz.gamma, nd = Math.max(4, Math.min(10, 14 - Math.ceil(Math.log10(g))));
    const name = nz.n != null ? `${nz.conj ? '\\bar\\rho' : '\\rho'}_{${texInt(nz.n)}}` : (nz.conj ? '\\bar\\rho' : '\\rho');
    const near = nz.d * ppu() < 3 ? 'At' : 'Nearest';
    return `${near} zero: $${name} = \\tfrac12 ${nz.conj ? '-' : '+'} ${texFixed(g, nd, false)}\\,i$, a sign change of Hardy’s $Z(t)$` +
      (nz.n != null ? `; $N(T) = \\theta(T)/\\pi + 1 + S(T)$ gives its index.` : '.');
  }
  if (x > 1) return `For $\\sigma > 1$, $\\zeta(s) = \\sum n^{-s} = \\prod_p (1 - p^{-s})^{-1}$ converges absolutely, so ${fn === 'xi' ? '$\\xi(s) \\neq 0$' : '$\\zeta(s) \\neq 0$'}.`;
  if (x >= 0) {
    const z = Z.hardyZ(t);
    return `In the critical strip $0 < \\sigma < 1$. On the critical line, Hardy’s $Z(t) = e^{i\\theta(t)}\\zeta(\\tfrac12 + it)$ is real: here $Z(${texNum(t, 6)}) = ${texNum(z, 5)}$.`;
  }
  return fn === 'xi'
    ? 'Left of the strip: $\\xi(s) = \\xi(1 - s)$, so this mirrors the point $1 - s$.'
    : `Left of the strip, $\\zeta(s) = \\chi(s)\\,\\zeta(1 - s)$ grows like $|t|^{1/2 - \\sigma}$: $\\log_{10}|${F}(s)| = ${texNum(L[0] / Math.LN10, 4)}$.`;
}

/* ---- the inset: ζ along the vertical line through s, or Hardy's Z ---- */
const icv = $('inset');
function sizeInset() {
  const r = icv.getBoundingClientRect(), dpr = Math.min(window.devicePixelRatio || 1, 2);
  const w = Math.max(64, Math.round(r.width * dpr)), h = Math.max(48, Math.round(r.height * dpr));
  if (icv.width !== w || icv.height !== h) { icv.width = w; icv.height = h; }
  insetDirty = true;
}
let insetKey = '';
function insetWindow(P) {
  const at = Math.abs(P.t), H = view.w * cssH / cssW;
  // the visible height, but at least a few zeros' worth and at most fourteen
  const g = Z.meanGap(Math.max(at, 20));
  const w = Math.max(1.5 * g, Math.min(0.5 * H, 7 * g));
  return w;
}
function requestInset() {
  const P = activePoint(), w = insetWindow(P);
  const key = [insetMode, P.x.toPrecision(10), P.t.toPrecision(14), w.toPrecision(6)].join(':');
  if (key === insetKey) return;
  insetKey = key;
  iq.request('inset', { type: 'inset', mode: insetMode, sigma: P.x, t: P.t, w, n: insetMode === 'Z' ? 700 : 900, key });
}
function drawInset() {
  const ctx = icv.getContext('2d'), W = icv.width, H = icv.height, dpr = W / Math.max(1, icv.clientWidth);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, W, H);
  const ink = cssVar('--ink') || '#eef1f8', faint = cssVar('--hairline-strong') || 'rgba(255,255,255,.16)';
  const curve = cssVar('--inset-curve') || '#ffffff', halo = cssVar('--inset-halo') || 'rgba(0,0,0,.55)';
  const P = activePoint();
  const insetLabels = [];
  if (!insetData || insetData.mode !== insetMode) { placeInsetLabels(insetLabels); return; }
  const D = insetData, n = D.ts.length;
  const stroke = (pts) => {
    for (let pass = 0; pass < 2; pass++) {
      ctx.beginPath();
      let pen = false;
      for (const p of pts) {
        if (!p) { pen = false; continue; }
        if (!pen) { ctx.moveTo(p[0], p[1]); pen = true; } else ctx.lineTo(p[0], p[1]);
      }
      ctx.lineJoin = 'round';
      ctx.strokeStyle = pass === 0 ? halo : curve;
      ctx.lineWidth = (pass === 0 ? 3 : 1.2) * dpr;
      ctx.stroke();
    }
  };
  const dot = (x, y, r, fill, line) => {
    ctx.beginPath(); ctx.arc(x, y, r * dpr, 0, TWO_PI);
    if (fill) { ctx.fillStyle = fill; ctx.fill(); }
    if (line) { ctx.strokeStyle = line; ctx.lineWidth = dpr; ctx.stroke(); }
  };
  const t0 = D.ts[0], t1 = D.ts[n - 1];
  if (insetMode === 'Z') {
    let m = 0;
    for (let i = 0; i < n; i++) m = Math.max(m, Math.abs(D.re[i]));
    m = Math.max(m, 1e-9) * 1.12;
    const X = (t) => ((t - t0) / (t1 - t0)) * W, Y = (z) => H / 2 - (z / m) * (H / 2 - 6 * dpr);
    ctx.strokeStyle = faint; ctx.lineWidth = dpr;
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.stroke();
    // the height of s, under everything else
    const x = X(P.t);
    ctx.strokeStyle = 'rgba(255,181,71,0.7)'; ctx.lineWidth = dpr;
    ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke();
    // Gram points (Z is even, so ±g); the ones where Gram's law fails are red and named
    const bad = cssVar('--danger') || '#fb7185';
    for (const [k, g, good] of D.grams || []) {
      for (const sg of [1, -1]) {
        const gx = X(sg * g);
        if (gx < 0 || gx > W) continue;
        ctx.strokeStyle = good ? faint : bad;
        ctx.lineWidth = (good ? 1 : 2.2) * dpr;
        const h = (good ? 5 : 9) * dpr;
        ctx.beginPath(); ctx.moveTo(gx, H / 2 - h); ctx.lineTo(gx, H / 2 + h); ctx.stroke();
        if (!good) insetLabels.push({ key: 'g' + sg * k, tex: `g_{${texInt(k)}}`, x: gx / dpr, y: H / 2 / dpr + 10, cls: 'bad' });
      }
    }
    const pts = [];
    for (let i = 0; i < n; i++) pts.push([X(D.ts[i]), Y(D.re[i])]);
    stroke(pts);
    for (let i = 1; i < n; i++) {
      if (D.re[i - 1] * D.re[i] < 0) {
        const u = D.re[i - 1] / (D.re[i - 1] - D.re[i]);
        dot(X(D.ts[i - 1] + u * (D.ts[i] - D.ts[i - 1])), H / 2, 2.3, curve, halo);
      }
    }
    dot(x, Y(Z.hardyZ(P.t)), 3.2, '#ffb547', halo);
    setTex(el.insetLabel, 'Z(t)');
    setMix(el.insetCap, `Hardy’s $Z(t) = e^{i\\theta(t)}\\zeta(\\tfrac12 + it)$ for $t \\in [${texNum(t0, 6)}, ${texNum(t1, 6)}]$; $|Z(t)| = |\\zeta(\\tfrac12 + it)|$. Its sign changes (dots) are zeros on the critical line. Ticks are Gram points $g_n$, red where Gram’s law $(-1)^n Z(g_n) > 0$ fails.`);
  } else {
    const mags = [];
    for (let i = 0; i < n; i++) mags.push(Math.hypot(D.re[i], D.im[i]));
    const sorted = mags.slice().sort((a, b) => a - b);
    const here = Z.zeta(P.x, P.t);
    let R = Math.max(sorted[Math.floor(0.9 * (n - 1))] * 1.15, Math.hypot(here[0], here[1]) * 1.15, 1.2);
    R = Math.min(R, 1e6);
    const k = Math.min(W, H) / (2 * R) * 0.94;
    const X = (a) => W / 2 + a * k, Y = (b) => H / 2 - b * k;
    ctx.strokeStyle = faint; ctx.lineWidth = dpr;
    ctx.beginPath(); ctx.moveTo(0, H / 2); ctx.lineTo(W, H / 2); ctx.moveTo(W / 2, 0); ctx.lineTo(W / 2, H); ctx.stroke();
    // the point 1, which ζ(σ + it) approaches as σ → ∞
    ctx.beginPath(); ctx.moveTo(X(1), H / 2 - 4 * dpr); ctx.lineTo(X(1), H / 2 + 4 * dpr); ctx.stroke();
    const lim = 3 * Math.max(W, H);
    const pts = [];
    for (let i = 0; i < n; i++) {
      const x = X(D.re[i]), y = Y(D.im[i]);
      pts.push(Math.abs(x) < lim && Math.abs(y) < lim ? [x, y] : null);
    }
    stroke(pts);
    dot(W / 2, H / 2, 2.2, null, ink);
    dot(X(here[0]), Y(here[1]), 3.4, '#ffb547', halo);
    setTex(el.insetLabel, `\\zeta(${texNum(P.x, 4)} + it)`);
    setMix(el.insetCap, `The image of the vertical line through $s$ under $\\zeta$, for $t \\in [${texNum(t0, 6)}, ${texNum(t1, 6)}]$; the amber dot is $\\zeta(s)$ and the tick is $1$. On $\\sigma = \\tfrac12$ the curve passes through $0$ at every zero; the Riemann hypothesis says it never does for $\\sigma \\ne \\tfrac12$.`);
  }
  placeInsetLabels(insetLabels);
}
const insetLabelBox = $('inset-labels'), insetPool = new Map();
function placeInsetLabels(list) {
  const seen = new Set();
  for (const L of list.slice(0, 24)) {
    let e = insetPool.get(L.key);
    if (!e) { e = document.createElement('span'); insetPool.set(L.key, e); insetLabelBox.appendChild(e); }
    e.className = 'ilab ' + (L.cls || '');
    setTex(e, L.tex);
    e.style.transform = `translate(${L.x.toFixed(1)}px, ${L.y.toFixed(1)}px) translateX(-50%)`;
    seen.add(L.key);
  }
  for (const [k, e] of insetPool) if (!seen.has(k)) { e.remove(); insetPool.delete(k); }
}

/* ---- view readouts ---- */
function updateViewReadout() {
  const nd = digitsFor();
  setTex(el.vc, texS(view.cx, view.cy, nd));
  setTex(el.vw, texNum(view.w, 3));
  // the method in the middle of the part of the picture the panel leaves free
  const fr = freeRect(), mid = worldAt((fr.x0 + fr.x1) / 2, (fr.y0 + fr.y1) / 2);
  const M = methodAt(mid.x, mid.t);
  const most = neededTerms(view.cx, view.cy, view.w, view.w * cssH / cssW);
  const tail = most > M.n ? ` At most $${texInt(most)}$ terms per pixel in this view.` : '';
  setMix(el.vm, (M.rs
    ? `In the middle of the view, Riemann–Siegel: $N = \\lfloor\\sqrt{t/2\\pi}\\rfloor = ${texInt(M.n)}$ terms in each of two sums, and corrections $C_0, \\dots, C_3$.`
    : M.direct ? `In the middle of the view, a partial sum of $${texInt(M.n)}$ terms${M.reflect ? ', through $\\zeta(s) = \\chi(s)\\zeta(1-s)$' : ''}.`
      : `In the middle of the view, Euler–Maclaurin: $M = ${texInt(M.n)}$ terms and $B_2, \\dots, B_{20}$${M.reflect ? ', through $\\zeta(s) = \\chi(s)\\zeta(1-s)$' : ''}.`) + tail);
  // scale bar
  const per = view.w / cssW, target = per * 110;
  const e = Math.floor(Math.log10(target)), base = 10 ** e;
  const m = target / base >= 5 ? 5 : target / base >= 2 ? 2 : 1;
  el.scale.style.width = (m * base / per).toFixed(1) + 'px';
  setTex(el.scaleLabel, texNum(m * base, 1));
}
function updateRefReadout() {
  const L = job ? job.layer : complete;
  let s = '';
  if (L && L.R) {
    s = L.R.refMode
      ? `Phases relative to $t_0 = ${texNum(L.R.tr0, 10)}$, in double precision${L.R.bigRef ? ', with $\\chi$, $\\Gamma$ and $\\vartheta$' : ''}.`
      : 'Single precision throughout.';
  }
  if (job && job.phase === 'hi') s += ` Rendering $${Math.round((1 - job.layer.rowDone / job.layer.rh) * 100)}\\%$.`;
  setMix(el.vref, s);
}

/* ================================================================
   Animation: smooth zoom-and-pan (van Wijk & Nuij) and quick zooms
   ================================================================ */
let anim = null;
const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
function flyTo(target) {
  const u1x = target.cx - view.cx, u1y = target.cy - view.cy;
  const u1 = Math.hypot(u1x, u1y), w0 = view.w, w1 = target.w, rho = 1.42;
  if (reduceMotion) { setView(target.cx, target.cy, target.w); return; }
  // far away (beyond the widest view): arrive by zooming in at the destination
  if (u1 > 0.4 * MAX_W) {
    setView(target.cx, target.cy, Math.min(MAX_W, target.w * 6));
    const w6 = view.w, cx = target.cx, cy = target.cy;
    anim = { t0: performance.now(), T: 900, step: (f) => {
      const e = 1 - (1 - f) ** 3;
      setView(cx, cy, w6 * (target.w / w6) ** e);
    } };
    return;
  }
  let S, wAt, remAt;
  if (u1 < 1e-12 * Math.max(w0, w1)) {
    S = Math.abs(Math.log(w1 / w0)) / rho;
    const sg = w1 < w0 ? -1 : 1;
    wAt = (s) => w0 * Math.exp(sg * rho * s);
    remAt = () => 0;
  } else {
    const b0 = (w1 * w1 - w0 * w0 + rho ** 4 * u1 * u1) / (2 * w0 * rho * rho * u1);
    const b1 = (w1 * w1 - w0 * w0 - rho ** 4 * u1 * u1) / (2 * w1 * rho * rho * u1);
    const r0 = -Math.asinh(b0), r1 = -Math.asinh(b1);
    S = (r1 - r0) / rho;
    const C = w0 * Math.cosh(r0) / (rho * rho);
    wAt = (s) => w0 * Math.cosh(r0) / Math.cosh(rho * s + r0);
    remAt = (s) => C * Math.sinh(rho * (S - s)) / (Math.cosh(rho * S + r0) * Math.cosh(rho * s + r0));
  }
  if (!(S > 0) || !isFinite(S)) { setView(target.cx, target.cy, target.w); return; }
  const dirx = u1 > 0 ? u1x / u1 : 0, diry = u1 > 0 ? u1y / u1 : 0;
  const T = Math.min(5000, 500 + 210 * S);
  anim = { t0: performance.now(), T, step: (f) => {
    const e = f < 0.5 ? 4 * f * f * f : 1 - (-2 * f + 2) ** 3 / 2;
    const s = S * e, rem = remAt(s);
    if (f >= 1) setView(target.cx, target.cy, target.w);
    else setView(target.cx - dirx * rem, target.cy - diry * rem, wAt(s));
  } };
}
function quickZoom(x, y, factor) {
  if (reduceMotion) { zoomAbout(x, y, factor); return; }
  let last = 0;
  anim = { t0: performance.now(), T: 320, step: (f) => {
    const e = 1 - (1 - f) ** 3;
    zoomAbout(x, y, factor ** (e - last)); last = e;
  } };
}

/* ================================================================
   Pointer, wheel, keyboard
   ================================================================ */
const stage = $('stage');
const pointers = new Map();
let drag = null, pinch = null;
function localXY(e) { const r = stage.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; }
stage.addEventListener('pointerdown', (e) => {
  stage.setPointerCapture(e.pointerId);
  const [x, y] = localXY(e);
  pointers.set(e.pointerId, { x, y });
  anim = null;
  if (pointers.size === 1) { drag = { x, y, x0: x, y0: y, moved: false }; pinch = null; }
  else if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinch = { d: Math.hypot(a.x - b.x, a.y - b.y), mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 };
    if (drag) drag.moved = true;
  }
});
stage.addEventListener('pointermove', (e) => {
  const [x, y] = localXY(e);
  if (pointers.has(e.pointerId)) {
    pointers.get(e.pointerId).x = x; pointers.get(e.pointerId).y = y;
    if (pointers.size >= 2 && pinch) {
      const [a, b] = [...pointers.values()];
      const d = Math.hypot(a.x - b.x, a.y - b.y), mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      panBy(mx - pinch.mx, my - pinch.my);
      if (d > 0 && pinch.d > 0) zoomAbout(mx, my, pinch.d / d);
      pinch = { d, mx, my };
    } else if (drag) {
      if (!drag.moved && Math.hypot(x - drag.x0, y - drag.y0) > 4) { drag.moved = true; stage.classList.add('dragging'); }
      if (drag.moved) panBy(x - drag.x, y - drag.y);
      drag.x = x; drag.y = y;
    }
  }
  if (e.pointerType === 'mouse') { const p = worldAt(x, y); hover = { x: p.x, t: p.t, sx: x, sy: y }; pointDirty = true; }
});
function endPointer(e) {
  if (!pointers.has(e.pointerId)) return;
  pointers.delete(e.pointerId);
  if (pointers.size === 0) {
    if (drag && !drag.moved && e.type === 'pointerup') { const p = worldAt(drag.x, drag.y); pin = { x: p.x, t: p.t }; pointDirty = true; overlayDirty = true; }
    drag = null; pinch = null;
    stage.classList.remove('dragging');
  } else if (pointers.size === 1) {
    const [a] = [...pointers.values()];
    drag = { x: a.x, y: a.y, x0: a.x, y0: a.y, moved: true }; pinch = null;
  }
}
stage.addEventListener('pointerup', endPointer);
stage.addEventListener('pointercancel', endPointer);
stage.addEventListener('pointerleave', (e) => { if (e.pointerType === 'mouse' && !pointers.size) { hover = null; pointDirty = true; } });
stage.addEventListener('wheel', (e) => {
  e.preventDefault();
  anim = null;
  const [x, y] = localXY(e);
  const dy = e.deltaY * (e.deltaMode === 1 ? 33 : e.deltaMode === 2 ? cssH : 1);
  const k = e.ctrlKey ? 0.01 : 0.0018;
  zoomAbout(x, y, Math.exp(Math.max(-1.5, Math.min(1.5, dy * k))));
}, { passive: false });
stage.addEventListener('dblclick', (e) => { const [x, y] = localXY(e); quickZoom(x, y, e.shiftKey ? 4 : 0.25); });
window.addEventListener('keydown', (e) => {
  if (e.target.closest && e.target.closest('input, button, select, textarea')) return;
  const fr = freeRect(), cx = (fr.x0 + fr.x1) / 2, cy = (fr.y0 + fr.y1) / 2;
  const step = Math.min(cssW, cssH) * 0.12;
  const k = { ArrowLeft: [step, 0], ArrowRight: [-step, 0], ArrowUp: [0, step], ArrowDown: [0, -step] }[e.key];
  if (k) { anim = null; panBy(k[0], k[1]); e.preventDefault(); }
  else if (e.key === '+' || e.key === '=') { quickZoom(cx, cy, 0.5); e.preventDefault(); }
  else if (e.key === '-' || e.key === '_') { quickZoom(cx, cy, 2); e.preventDefault(); }
});

/* ================================================================
   Controls
   ================================================================ */
// tabs
document.querySelectorAll('.tab-btn').forEach((b) => b.addEventListener('click', () => {
  document.querySelectorAll('.tab-btn').forEach((x) => x.classList.toggle('active', x === b));
  document.querySelectorAll('.tab-content').forEach((c) => c.classList.toggle('active', c.id === 'tab-' + b.dataset.tab));
  if (b.dataset.tab === 'explore') setTimeout(sizeInset, 0);
}));
// collapse, home
$('collapse-btn').addEventListener('click', () => {
  const c = panel.classList.toggle('collapsed');
  $('collapse-btn').setAttribute('aria-label', c ? 'Expand panel' : 'Collapse panel');
  $('collapse-btn').title = c ? 'Expand panel' : 'Collapse panel';
  overlayDirty = true;
  if (!c) setTimeout(sizeInset, 480);
});
const HOME = { cx: -3, cy: 17, box: [16, 44] };
const homeView = () => viewFor(HOME.cx, HOME.cy, HOME.box[0], HOME.box[1]);
$('home-btn').addEventListener('click', () => { markLandmark(0); flyTo(homeView()); });

// function
function setFn(f) {
  if (f === fn) return;
  fn = f;
  document.querySelectorAll('.fn-opt').forEach((b) => b.classList.toggle('active', b.dataset.fn === f));
  setMix($('fn-hint'), f === 'xi'
    ? '$\\xi(s) = \\tfrac12 s(s-1)\\,\\pi^{-s/2}\\,\\Gamma(\\tfrac s2)\\,\\zeta(s)$ is entire, has only the nontrivial zeros, satisfies $\\xi(s) = \\xi(1-s)$, and is real on the critical line.'
    : 'The colors show $\\arg\\zeta(s)$; the bands and grid are level sets of $\\log|\\zeta(s)|$ and $\\arg\\zeta(s)$.');
  job = null; viewMoved = true; pointDirty = true; insetKey = '';
}
document.querySelectorAll('.fn-opt').forEach((b) => b.addEventListener('click', () => setFn(b.dataset.fn)));
// inset mode
function setInset(m) {
  insetMode = m;
  document.querySelectorAll('.inset-opt').forEach((b) => b.classList.toggle('active', b.dataset.inset === m));
  insetKey = ''; insetData = null; insetDirty = true; pointDirty = true;
}
document.querySelectorAll('.inset-opt').forEach((b) => b.addEventListener('click', () => setInset(b.dataset.inset)));

// landmarks
const LANDMARKS = [
  { name: 'The critical strip', cx: HOME.cx, cy: HOME.cy, box: HOME.box, desc: 'The pole at $s = 1$, the trivial zeros $-2, -4, \\dots$ and the first zeros on $\\sigma = \\tfrac12$.' },
  { name: 'The first zero', cx: 0.5, cy: 14.134725141734693, box: [1.4, 1.4], pin: [0.5, 14.134725141734693], desc: '$\\rho_1 = \\tfrac12 + 14.1347\\ldots i$. Every color meets here, counterclockwise: a simple zero.' },
  { name: 'The pole at $s = 1$', cx: 1, cy: 0, box: [2.4, 2.4], pin: [1.35, 0.3], desc: 'Around a pole the colors run clockwise: $\\zeta(s) = \\frac{1}{s-1} + \\gamma + \\cdots$.' },
  { name: 'Trivial zeros', cx: -7, cy: 0, box: [13, 6], pin: [-6, 0.2], desc: 'At $s = -2, -4, -6, \\dots$, from the poles of $\\Gamma(s/2)$ in the functional equation.' },
  { name: 'Gram’s law fails', cx: 0.5, cy: 282.4547208234622, box: [2.2, 3.6], pin: [0.5, 282.4547208234622], inset: 'Z', desc: 'The first Gram point with $(-1)^n Z(g_n) < 0$ is $g_{126} \\approx 282.4547$; the Hardy $Z$ inset marks it red.' },
  { name: 'Lehmer’s pair', cx: 0.5, cy: 7005.0817, box: [0.14, 0.14], pin: [0.5, 7005.0817], inset: 'Z', desc: '$\\gamma_{6709} \\approx 7005.0629$ and $\\gamma_{6710} \\approx 7005.1006$, only $0.038$ apart: $Z(t)$ barely dips below zero between them.' },
  { name: 'Height $10^4$', cx: 0.5, cy: 1e4, box: [4, 8], desc: 'The zeros are about $2\\pi/\\log(t/2\\pi) \\approx 0.85$ apart; Riemann–Siegel with $39$ terms.' },
  { name: 'Height $10^6$', cx: 0.5, cy: 1e6, box: [3, 5], desc: 'Spacing $\\approx 0.52$, with $\\lfloor\\sqrt{t/2\\pi}\\rfloor = 398$ terms per pixel.' },
  { name: 'Height $10^8$', cx: 0.5, cy: 1e8, box: [2, 3], desc: 'Spacing $\\approx 0.38$ and $3\\,989$ terms per pixel; the phases $t\\log n$ come from double precision.' },
  { name: 'The functional equation', cx: 0.5, cy: 24, box: [9, 26], fn: 'xi', desc: 'With $\\xi(s) = \\xi(1-s)$ the picture is symmetric about the critical line, where $\\xi$ is real.' },
];
const lmBox = $('landmarks');
function markLandmark(i) { lmBox.querySelectorAll('.lm').forEach((x) => x.classList.toggle('active', x.id === 'lm-' + i)); }
LANDMARKS.forEach((L, i) => {
  const b = document.createElement('button');
  b.className = 'lm'; b.type = 'button'; b.id = 'lm-' + i;
  b.innerHTML = `<span class="nm">${mixTex(L.name)}</span><span class="dp">${tex('t \\approx ' + texNum(L.cy, 4))}</span><span class="ds">${mixTex(L.desc)}</span>`;
  b.addEventListener('click', () => goLandmark(i, true));
  lmBox.appendChild(b);
});
function goLandmark(i, animate) {
  const L = LANDMARKS[i];
  markLandmark(i);
  setFn(L.fn || 'zeta');
  if (L.inset) setInset(L.inset);
  if (L.pin) { pin = { x: L.pin[0], t: L.pin[1] }; pointDirty = true; overlayDirty = true; }
  const v = viewFor(L.cx, L.cy, L.box[0], L.box[1]);
  if (animate) flyTo(v); else setView(v.cx, v.cy, v.w);
}

// go to a height or a zero
function parseNum(s) {
  s = String(s).trim().replace(/\s|,|_/g, '').replace(/×10\^?/, 'e').replace(/\*10\^/, 'e').replace(/10\^(\d+)$/, '1e$1');
  const v = Number(s);
  return isFinite(v) ? v : NaN;
}
$('goto-t-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const t = parseNum($('goto-t').value), msg = $('goto-msg');
  if (!isFinite(t) || Math.abs(t) > T_MAX) { msg.textContent = `Enter a height t with |t| ≤ 10⁹.`; return; }
  msg.textContent = '';
  const gap = Z.meanGap(t);
  markLandmark(-1);
  flyTo(viewFor(0.5, t, Math.max(3, 6 * gap), Math.max(3, 6 * gap)));
});
$('goto-n-form').addEventListener('submit', (e) => {
  e.preventDefault();
  const n = Math.round(parseNum($('goto-n').value)), msg = $('goto-msg');
  if (!(n >= 1) || Z.thetaInverse(n) > T_MAX) { msg.textContent = 'Enter an index n ≥ 1 with γₙ ≤ 10⁹.'; return; }
  msg.textContent = 'Locating the zero…';
  markLandmark(-1);
  zq.request('nth', { type: 'nth', n });
});

// palettes and shading
const palBox = $('palettes');
PALETTES.forEach((P, i) => {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'pal' + (i === opts.palette ? ' active' : ''); b.id = 'pal-' + P.id;
  b.innerHTML = `<span class="sw" style="background: ${paletteCSS(P)}"></span><span>${P.name}</span>`;
  b.addEventListener('click', () => {
    opts.palette = i;
    palBox.querySelectorAll('.pal').forEach((x) => x.classList.toggle('active', x === b));
    uploadPalette(); dirty = true;
  });
  palBox.appendChild(b);
});
document.querySelectorAll('[data-opt]').forEach((b) => {
  const key = b.dataset.opt;
  b.classList.toggle('active', !!opts[key]);
  b.setAttribute('aria-pressed', String(!!opts[key]));
  b.addEventListener('click', () => {
    opts[key] = !opts[key];
    b.classList.toggle('active', opts[key]);
    b.setAttribute('aria-pressed', String(opts[key]));
    dirty = true; overlayDirty = true;
  });
});
const linesIn = $('opt-lines'), linesOut = $('opt-lines-out');
const syncLines = () => { opts.lines = parseInt(linesIn.value, 10); linesOut.innerHTML = tex(`m = ${opts.lines}`); dirty = true; };
linesIn.addEventListener('input', syncLines); syncLines();

// permalink
function stateURL() {
  const q = new URLSearchParams();
  const nd = digitsFor() + 2;
  q.set('c', `${view.cx.toFixed(nd)},${view.cy.toFixed(nd)}`);
  q.set('w', view.w.toPrecision(5));
  q.set('pin', `${pin.x.toFixed(nd)},${pin.t.toFixed(nd)}`);
  if (fn !== 'zeta') q.set('f', fn);
  if (opts.palette) q.set('pal', PALETTES[opts.palette].id);
  if (insetMode !== 'path') q.set('inset', insetMode);
  return location.origin + location.pathname + '?' + q.toString();
}
$('copy-link').addEventListener('click', async () => {
  const url = stateURL(), b = $('copy-link');
  try { await navigator.clipboard.writeText(url); b.textContent = 'Copied'; }
  catch (e) { window.prompt('Link to this view:', url); }
  setTimeout(() => { b.textContent = 'Copy link to this view'; }, 1400);
});

/* ================================================================
   Main loop
   ================================================================ */
let lastT = performance.now(), lastReadout = 0, lastMove = 0;
window.addEventListener('resize', () => { resize(); overlayDirty = true; });
function tick(now) {
  requestAnimationFrame(tick);
  frame(now);
}
function frame(now) {
  const dt = Math.min(0.1, (now - lastT) / 1000); lastT = now;
  if (anim) {
    const f = Math.min(1, (now - anim.t0) / anim.T);
    anim.step(f);
    if (f >= 1) anim = null;
  }
  if (viewMoved) {
    viewMoved = false; viewVersion++; dirty = true; overlayDirty = true; lastMove = now;
    if (hover && hover.sx !== undefined) { const p = worldAt(hover.sx, hover.sy); hover.x = p.x; hover.t = p.t; pointDirty = true; }
    updateViewReadout();
  }
  if (!anim && now - lastMove > 120) requestViewZeros();
  try { schedule(now); } catch (e) { console.error(e); }
  if (opts.cycle) { opts.offset = (opts.offset + dt * 0.05) % 1; dirty = true; }
  if (dirty) { drawColor(); dirty = false; }
  if (overlayDirty) { drawOverlay(); overlayDirty = false; }
  if (pointDirty) { pointDirty = false; updatePoint(); }
  if (insetDirty) { insetDirty = false; drawInset(); }
  if (now - lastReadout > 150) { lastReadout = now; updateRefReadout(); }
  const hi = !!(job && job.phase === 'hi');
  el.progress.classList.toggle('on', hi);
  el.progress.style.width = (hi ? (1 - job.layer.rowDone / job.layer.rh) * 100 : 0).toFixed(1) + '%';
}

resize();
{
  const q = new URLSearchParams(location.search);
  const pair = (k) => { const v = q.get(k); if (!v) return null; const [a, b] = v.split(',').map(Number); return isFinite(a) && isFinite(b) ? [a, b] : null; };
  if (q.get('f') === 'xi') setFn('xi');
  const pal = PALETTES.findIndex((p) => p.id === q.get('pal'));
  if (pal >= 0) palBox.children[pal].click();
  if (q.get('inset') === 'Z') setInset('Z');
  const c = pair('c'), w = Number(q.get('w')), p = pair('pin');
  if (p) pin = { x: p[0], t: p[1] };
  if (c) setView(c[0], c[1], isFinite(w) && w > 0 ? w : 8);
  else { const h = homeView(); setView(h.cx, h.cy, h.w); markLandmark(0); }
}
requestAnimationFrame(tick);

/* a small hook for checking the renderer from the console and from tests */
window.riemann = {
  view, Z,
  get state() {
    return {
      fn, viewVersion, loScale, bandPx,
      job: job && { phase: job.phase, rowDone: job.layer.rowDone, rh: job.layer.rh, layer: layers.indexOf(job.layer) },
      complete: complete && { phase: complete.phase, rw: complete.rw, rh: complete.rh, rowDone: complete.rowDone, layer: layers.indexOf(complete), key: complete.key, sameView: complete.cx === view.cx && complete.cy === view.cy && complete.w === view.w },
      ref: complete && complete.R,
    };
  },
  go(cx, cy, w) { anim = null; setView(cx, cy, w); },
  jump(i) { anim = null; goLandmark(i, false); },
  setFn, setInset,
  pin(x, t) { pin = { x, t }; pointDirty = true; overlayDirty = true; },
  get zeros() { return zeroCache; },
  /** Compare the shader with the double-precision core at points from t = 0 to 10⁸, in views
      small and large (reference and direct modes), for ζ and ξ. Returns the worst errors. */
  selfTest() {
    const res = {};
    for (const f of ['zeta', 'xi']) {
      let worst = { e: 0 }, flagged = 0, n = 0;
      for (const t of [0.3, 3, 14.2, 25, 60, 99, 101, 150, 282.45, 1000.3, 7005.08, 1e4 + 0.2, 123456.7, 1e6 + 0.3, 3e7 + 0.1, 1e8 + 0.05, -40, -2000.5]) {
        for (const x of [-40, -12, -3, -0.7, 0, 0.3, 0.5, 0.8, 1, 1.6, 3, 9, 30, 40]) {
          for (const [W, H] of [[1e-3, 1e-3], [0.5, 0.3], [5, 8], [60, 40]]) {
            const r = this.probe(x, t, W, H, f), L = f === 'xi' ? Z.logXi(x, t) : Z.logZeta(x, t);
            n++;
            if (r.v[1] > 50) { flagged++; continue; }
            const d = Math.hypot(r.v[0] + r.Loff - L[0], Z.wrap(r.v[1] - L[1]));
            // for ζ, the error in ζ itself relative to max(|ζ|, 1); for ξ (tiny or huge), in log ξ
            const e = f === 'xi' ? d : d * Math.exp(L[0]) / Math.max(1, Math.exp(L[0]));
            if (e > worst.e) worst = { e, x, t, W };
          }
        }
      }
      res[f] = { points: n, flagged, worst };
    }
    return res;
  },
  /** Step the render loop by hand (a hidden tab gets no animation frames) until the picture is
      finished and the workers are idle, or the time runs out. */
  async settle(ms = 20000) {
    const t0 = performance.now();
    while (performance.now() - t0 < ms) {
      anim = null;
      frame(performance.now());
      gl.finish();
      if (this.done) { frame(performance.now()); return true; }
      await new Promise((r) => setTimeout(r, 4));
    }
    return false;
  },
  /** The finished layer's data (log|f|, arg f, f′/f) under the CSS pixel (x, y). */
  texel(x, y) {
    if (!complete) return null;
    const L = complete, k = L.rw / cssW, out = new Float32Array(4);
    gl.bindFramebuffer(gl.FRAMEBUFFER, L.fbo);
    gl.readPixels(Math.floor(x * k), Math.floor(L.rh - 1 - y * k), 1, 1, gl.RGBA, gl.FLOAT, out);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    return Array.from(out);
  },
  get done() {
    return !job && !anim && !viewMoved && complete && complete.phase === 'hi' && complete.key === modeKey() &&
      complete.cx === view.cx && complete.cy === view.cy && complete.w === view.w && !zq.busy && !iq.busy;
  },
  /** Evaluate the data shader at s = σ + it inside a view of size W × H whose center is offset from s,
      and return (log|f|, arg f, Re f′/f, Im f′/f). Exercises the reference and direct modes. */
  probe(x, t, W = 1e-3, H = W, f = 'zeta') {
    const L = makeLayer(3, 3), saved = fn;
    fn = f;
    Object.assign(L, { cx: x + W / 3, cy: t + H / 3, w: W, aspect: H / W, rw: 3, rh: 3 });
    const R = buildReference(L.cx, L.cy, W, H);
    gl.bindFramebuffer(gl.FRAMEBUFFER, L.fbo);
    gl.viewport(0, 0, 3, 3);
    setDataUniforms(R, L);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
    const out = new Float32Array(4);
    gl.readPixels(0, 0, 1, 1, gl.RGBA, gl.FLOAT, out);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.deleteTexture(L.tex); gl.deleteFramebuffer(L.fbo);
    fn = saved; refKey = '';
    return { v: Array.from(out), refMode: R.refMode, bigRef: R.bigRef, Loff: R.Loff || 0 };
  },
};
