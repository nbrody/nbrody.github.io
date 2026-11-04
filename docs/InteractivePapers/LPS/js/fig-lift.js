// Figure S2: an eigenvector of X^{p,q}, lifted to the tree. It looks speckled, but its average over
// every sphere around a vertex is the spherical function of its eigenvalue, which is (4.8)–(4.10).
import { el, makeCanvas, labelLayer, setTex, chips, button, segmented, controls, pointer, palette, onTheme, fmt, rgba, mix } from './common.js';
import { buildX, H, quatToMatrix, sqrtMinusOne } from './lps.js';
import { treeLayout } from './fig-tree.js';
import { genTex } from './fig-generators.js';
import { getSpectrum, SPECTRUM_PAIRS } from './spectrum.js';

export const PAIRS = SPECTRUM_PAIRS;

/** Radius of the tree ball drawn for p (keeps the picture near or under ~1500 vertices). */
export const depthFor = (p) => (p <= 5 ? 4 : 2);

/** Largest r for which the non-backtracking counts (≤ p^r) stay exact in doubles, capped at 16. */
export const rMaxFor = (p) => Math.min(16, Math.floor(Math.log(2e15) / Math.log(p)));

// ───────────────────────── pure math (node-testable) ─────────────────────────

/** out = A f on X (A f(v) = Σ_s f(s·v)). */
export function applyA(X, f, out = new Float64Array(X.n)) {
  const { n, k, nbr } = X;
  for (let v = 0; v < n; v++) {
    let s = 0;
    const base = v * k;
    for (let j = 0; j < k; j++) s += f[nbr[base + j]];
    out[v] = s;
  }
  return out;
}

/** Cyclic Jacobi eigensolver for a dense symmetric D×D matrix (row-major). Returns { values, Z } with
 *  Z[i*D + j] = i-th component of the j-th unit eigenvector. Accurate to rounding; fine for D ≲ 300. */
export function jacobiEigen(Ain, D) {
  const A = Float64Array.from(Ain), Z = new Float64Array(D * D);
  for (let i = 0; i < D; i++) Z[i * D + i] = 1;
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0, diag = 0;
    for (let i = 0; i < D; i++) { diag += A[i * D + i] ** 2; for (let j = i + 1; j < D; j++) off += A[i * D + j] ** 2; }
    if (off <= 1e-30 * (diag + 1e-300)) break;
    for (let p = 0; p < D; p++) for (let q = p + 1; q < D; q++) {
      const apq = A[p * D + q];
      if (Math.abs(apq) < 1e-300) continue;
      const app = A[p * D + p], aqq = A[q * D + q];
      const tau = (aqq - app) / (2 * apq);
      const t = (tau >= 0 ? 1 : -1) / (Math.abs(tau) + Math.sqrt(1 + tau * tau));
      const c = 1 / Math.sqrt(1 + t * t), sn = t * c;
      for (let r = 0; r < D; r++) {
        const arp = A[r * D + p], arq = A[r * D + q];
        A[r * D + p] = c * arp - sn * arq;
        A[r * D + q] = sn * arp + c * arq;
      }
      for (let r = 0; r < D; r++) {
        const apr = A[p * D + r], aqr = A[q * D + r];
        A[p * D + r] = c * apr - sn * aqr;
        A[q * D + r] = sn * apr + c * aqr;
      }
      for (let r = 0; r < D; r++) {
        const zrp = Z[r * D + p], zrq = Z[r * D + q];
        Z[r * D + p] = c * zrp - sn * zrq;
        Z[r * D + q] = sn * zrp + c * zrq;
      }
    }
  }
  const values = new Float64Array(D);
  for (let i = 0; i < D; i++) values[i] = A[i * D + i];
  return { values, Z };
}

/** Projective key of a 2×2 matrix mod q (first nonzero entry scaled to 1), as in buildX. */
function projKey(a, b, c, d, q, inv) {
  const s = a ? a : b ? b : c ? c : d, t = inv[s];
  return ((((a * t) % q) * q + ((b * t) % q)) * q + ((c * t) % q)) * q + ((d * t) % q);
}

/**
 * Graph automorphisms of X fixing e: conjugation by the images of the quaternions i, 1+i+j+k and 1+i,
 * which permute S (they rotate (a₁, a₂, a₃) by the symmetries of the cube). Each is kept only if it
 * really maps edges to edges; then the group they generate is closed up. Returns permutations of
 * the vertices (Int32Array), the identity first.
 */
export function conjugationGroup(X) {
  const { q, n, k, nbr, elems } = X;
  const inv = new Int32Array(q);
  for (let x = 1; x < q; x++) { let y = 1; for (let e = 0; e < q - 2; e++) y = (y * x) % q; inv[x] = y; }
  const id = new Map();
  for (let v = 0; v < n; v++) {
    const m = (t) => ((elems[4 * v + t] % q) + q) % q;
    id.set(projKey(m(0), m(1), m(2), m(3), q, inv), v);
  }
  const I = sqrtMinusOne(q);
  const gens = [];
  for (const u of [[0, 1, 0, 0], [1, 1, 1, 1], [1, 1, 0, 0]]) {
    const [a, b, c, d] = quatToMatrix(u, q, I);
    if ((a * d - b * c) % q === 0) continue;
    const [A, B, C, Dd] = [d, (q - b) % q, (q - c) % q, a]; // adjugate = det · inverse
    const perm = new Int32Array(n);
    let okPerm = true;
    for (let v = 0; v < n && okPerm; v++) {
      const g = [0, 1, 2, 3].map((t) => ((elems[4 * v + t] % q) + q) % q);
      // c · g
      const x0 = (a * g[0] + b * g[2]) % q, x1 = (a * g[1] + b * g[3]) % q, x2 = (c * g[0] + d * g[2]) % q, x3 = (c * g[1] + d * g[3]) % q;
      // (c g) · adj(c)
      const y0 = (x0 * A + x1 * C) % q, y1 = (x0 * B + x1 * Dd) % q, y2 = (x2 * A + x3 * C) % q, y3 = (x2 * B + x3 * Dd) % q;
      const w = id.get(projKey(y0, y1, y2, y3, q, inv));
      if (w === undefined) okPerm = false; else perm[v] = w;
    }
    if (!okPerm || !isAutomorphism(X, perm)) continue;
    gens.push(perm);
  }
  const ident = new Int32Array(n);
  for (let v = 0; v < n; v++) ident[v] = v;
  const group = [ident], seen = new Set([ident.join()]);
  for (let h = 0; h < group.length && group.length < 200; h++) {
    for (const g of gens) {
      const comp = new Int32Array(n);
      for (let v = 0; v < n; v++) comp[v] = g[group[h][v]];
      const key = comp.join();
      if (!seen.has(key)) { seen.add(key); group.push(comp); }
    }
  }
  return group;
}

/** Does the vertex permutation map the neighbour multiset of every v onto that of perm[v]? */
export function isAutomorphism(X, perm) {
  const { n, k, nbr } = X;
  const a = new Int32Array(k), b = new Int32Array(k);
  for (let v = 0; v < n; v++) {
    for (let s = 0; s < k; s++) { a[s] = perm[nbr[v * k + s]]; b[s] = nbr[perm[v] * k + s]; }
    a.sort(); b.sort();
    for (let s = 0; s < k; s++) if (a[s] !== b[s]) return false;
  }
  return true;
}

/**
 * The zonal eigenfunctions of X at e, exactly. P_λ δ_e is invariant under every automorphism fixing e,
 * so it lives on functions constant on the orbits of conjugationGroup(X). A preserves that space; in
 * the orthonormal basis 1_O/√|O| it is a small symmetric matrix (≈ n/24 orbits), diagonalized densely.
 * Returns { n, D, order, orbit, size, eigen } with eigen = [{ lam, weight = P_λ(e,e) = m_λ/n, coef }]
 * descending and distinct, where P_λ δ_e (v) = coef[orbit[v]] / √size[orbit[v]].
 */
export function zonalSpectrum(X) {
  const { n, k, nbr } = X;
  const group = conjugationGroup(X);
  const orbit = new Int32Array(n).fill(-1), size = [];
  for (let v = 0; v < n; v++) {
    if (orbit[v] >= 0) continue;
    const o = size.length;
    let cnt = 0;
    for (const g of group) if (orbit[g[v]] < 0) { orbit[g[v]] = o; cnt++; }
    size.push(cnt);
  }
  const D = size.length;
  const B = new Float64Array(D * D);
  for (let v = 0; v < n; v++) for (let s = 0; s < k; s++) B[orbit[v] * D + orbit[nbr[v * k + s]]] += 1;
  for (let i = 0; i < D; i++) for (let j = 0; j < D; j++) B[i * D + j] /= Math.sqrt(size[i] * size[j]);
  const { values, Z } = jacobiEigen(B, D);
  const oe = orbit[0];
  const order = [...values.keys()].sort((a, b) => values[b] - values[a]);
  const eigen = [];
  for (const j of order) {
    const z0 = Z[oe * D + j];
    const last = eigen[eigen.length - 1];
    let entry = last && Math.abs(last.lam - values[j]) < 1e-8 ? last : null;
    if (!entry) {
      const lam = Math.abs(Math.abs(values[j]) - (X.p + 1)) < 1e-8 ? Math.sign(values[j]) * (X.p + 1) : values[j];
      entry = { lam, weight: 0, coef: new Float64Array(D), copies: 0 };
      eigen.push(entry);
    }
    entry.weight += z0 * z0;
    entry.copies++;
    for (let i = 0; i < D; i++) entry.coef[i] += z0 * Z[i * D + j];
  }
  return { n, D, order: group.length, orbit, size, eigen };
}

/** P_λ δ_e as a function on the vertices, for entry `i` of zonalSpectrum(X).eigen. */
export function zonalVector(Zs, i) {
  const { n, orbit, size } = Zs, { coef } = Zs.eigen[i];
  const out = new Float64Array(n);
  for (let v = 0; v < n; v++) out[v] = coef[orbit[v]] / Math.sqrt(size[orbit[v]]);
  return out;
}

/**
 * The eigenfunction drawn: F = P_λ δ_e / P_λ(e,e), so F(e) = 1. For λ = ±(p+1) it is set exactly (1, or
 * ±1 by side); otherwise its tiny rounding components along 1 and the sign function are removed, since
 * the sphere sums multiply those by p^r and would swamp p^{−r/2}.
 */
export function zonalF(X, Zs, i) {
  const n = X.n, k = X.p + 1, lam = Zs.eigen[i].lam, bip = !X.psl;
  const F = zonalVector(Zs, i);
  if (Math.abs(lam - k) < 1e-6) return F.fill(1);
  if (bip && Math.abs(lam + k) < 1e-6) return F.map((_, v) => (X.part[v] ? -1 : 1));
  let m = 0, sg = 0;
  for (let v = 0; v < n; v++) { m += F[v]; sg += X.part[v] ? -F[v] : F[v]; }
  m /= n; sg /= n;
  for (let v = 0; v < n; v++) F[v] -= m + (bip ? (X.part[v] ? -sg : sg) : 0);
  const f0 = F[0];
  for (let v = 0; v < n; v++) F[v] /= f0;
  return F;
}

/** ‖A P − λ P‖ / ‖P‖. */
export function residual(X, P, lam) {
  const AP = applyA(X, P);
  let r = 0, s = 0;
  for (let v = 0; v < X.n; v++) { r += (AP[v] - lam * P[v]) ** 2; s += P[v] * P[v]; }
  return Math.sqrt(r / s);
}

/**
 * Non-backtracking walk counts from e on X: a_0 = δ_e, a_1 = Aδ_e, a_2 = Aa_1 − (p+1)a_0,
 * a_{r+1} = A a_r − p a_{r−1}. a_r(v) is the number of tree vertices at distance r from the root
 * that cover v. Returns [a_0, …, a_R].
 */
export function nonBacktrackingCounts(X, R) {
  const n = X.n, p = X.p;
  const a = [new Float64Array(n)];
  a[0][0] = 1;
  if (R >= 1) a.push(applyA(X, a[0]));
  for (let r = 1; r < R; r++) {
    const next = applyA(X, a[r]);
    const c = r === 1 ? p + 1 : p;
    for (let v = 0; v < n; v++) next[v] -= c * a[r - 1][v];
    a.push(next);
  }
  return a;
}

/** |S_r| in the (p+1)-regular tree. */
export const sphereSize = (p, r) => (r === 0 ? 1 : (p + 1) * Math.pow(p, r - 1));

/** The spherical function at integers: φ(0)=1, φ(1)=λ/(p+1), φ(r+1) = (λφ(r) − φ(r−1))/p. */
export function sphericalFunction(lam, p, R) {
  const phi = new Float64Array(R + 1);
  phi[0] = 1;
  if (R >= 1) phi[1] = lam / (p + 1);
  for (let r = 1; r < R; r++) phi[r + 1] = (lam * phi[r] - phi[r - 1]) / p;
  return phi;
}

/**
 * The same function at real x, from the closed form
 *   φ(x) = p^{−x/2} ( 2/(p+1) cos xθ + (p−1)/(p+1) · sin((x+1)θ)/sin θ ),  λ = 2√p cos θ,
 * continued to θ = iμ (λ > 2√p) and θ = π + iμ (λ < −2√p). Agrees with the recurrence at integers.
 */
export function sphericalAt(lam, p, x) {
  const R = 2 * Math.sqrt(p), c = lam / R, A = 2 / (p + 1), B = (p - 1) / (p + 1);
  let val;
  if (Math.abs(c) <= 1) {
    const th = Math.acos(Math.max(-1, Math.min(1, c)));
    const s = Math.sin(th);
    const ratio = Math.abs(s) > 1e-9 ? Math.sin((x + 1) * th) / s : (c > 0 ? 1 : Math.cos(Math.PI * x)) * (x + 1);
    val = A * Math.cos(x * th) + B * ratio;
  } else {
    const mu = Math.acosh(Math.abs(c)), sg = c > 0 ? 1 : -1;
    // for θ = π + iμ the cosine and the sine ratio pick up (−1)^x: drawn as cos(πx) between integers
    const turn = sg > 0 ? 1 : Math.cos(Math.PI * x);
    val = turn * (A * Math.cosh(x * mu) + B * Math.sinh((x + 1) * mu) / Math.sinh(mu));
  }
  return Math.pow(p, -x / 2) * val;
}

/** Sphere averages of F over S_r(e) in the tree, r = 0..R, from the counts: ⟨a_r, F⟩ / |S_r|. */
export function sphereAverages(a, F, p) {
  return a.map((ar, r) => {
    let s = 0;
    for (let v = 0; v < F.length; v++) if (ar[v]) s += ar[v] * F[v];
    return s / sphereSize(p, r);
  });
}

/** The shell sums of (4.9) at e: L_t = Σ_{0 ≤ r ≤ t/2} ⟨a_{t−2r}, F⟩, which (4.10) says is H_t(λ)·F(e). */
export function shellSums(a, F) {
  const inner = a.map((ar) => { let s = 0; for (let v = 0; v < F.length; v++) if (ar[v]) s += ar[v] * F[v]; return s; });
  return inner.map((_, t) => { let s = 0; for (let r = 0; 2 * r <= t; r++) s += inner[t - 2 * r]; return s; });
}

/**
 * The graph vertex under each vertex of a treeLayout ball. Tree edges are w — w·s; with
 * v(s₁⋯s_m) = s_m ⋯ s₁ (apply the letters left to right as left multiplications), w·s ↦ s·v(w),
 * which is an edge x ~ s·x of X. So the map is a covering and F∘v is an eigenfunction on the tree.
 */
export function liftVertices(L, X) {
  const out = new Int32Array(L.nodes.length);
  for (let i = 1; i < L.nodes.length; i++) {
    const nd = L.nodes[i];
    out[i] = X.nbr[out[nd.parent] * X.k + nd.letter];
  }
  return out;
}

/** The angle θ of λ = 2√p cos θ as TeX: real, iμ or π + iμ. */
export function thetaTex(lam, p) {
  const c = lam / (2 * Math.sqrt(p));
  if (Math.abs(c) <= 1 + 1e-12) return `\\theta=${Math.acos(Math.max(-1, Math.min(1, c))).toFixed(4)}`;
  const mu = Math.acosh(Math.abs(c));
  return c > 0 ? `\\theta=i\\,${mu.toFixed(4)}` : `\\theta=\\pi+i\\,${mu.toFixed(4)}`;
}

// ───────────────────────── the figure ─────────────────────────

const pairCache = new Map();
function pairData(p, q) {
  const key = p + ',' + q;
  if (!pairCache.has(key)) {
    const t0 = performance.now();
    const X = buildX(p, q);
    const Zs = zonalSpectrum(X);
    const R = rMaxFor(p);
    const a = nonBacktrackingCounts(X, R);
    const depth = depthFor(p);
    const T = treeLayout(p, depth);
    const lift = liftVertices(T, X);
    pairCache.set(key, { p, q, X, Zs, R, a, depth, T, lift, ms: performance.now() - t0 });
  }
  return pairCache.get(key);
}

/** A number as TeX with about d significant digits, no trailing zeros. */
export function texNum(v, d = 4) {
  if (!Number.isFinite(v)) return '\\text{—}';
  if (Math.abs(v - Math.round(v)) < 1e-9) return String(Math.round(v));
  if (Math.abs(v) < 1e-4) {
    const [m, e] = v.toExponential(Math.max(0, d - 2)).split('e');
    return `${+m}\\times10^{${+e}}`;
  }
  return String(+v.toPrecision(d));
}
const sci = (v) => {
  if (!(v > 0)) return '0';
  const [m, e] = v.toExponential(1).split('e');
  return `${m}\\times10^{${+e}}`;
};
const wordTexOf = (w) => (w.length ? w.map(genTex).join('') : 'e');

export function mount(root) {
  const st = {
    p: 5, q: 13, d: null, sel: 0, F: null, avg: null, phi: null, shells: null,
    hoverLam: -1, hoverV: -1, hoverR: -1, scaled: true, dense: null, denseKey: '',
  };

  // ── layout ──
  const pickWrap = el('div', { style: 'margin-bottom:0.9rem' });
  const pickHint = el('p', { class: 'panel-hint' });
  pickWrap.append(pickHint);
  root.append(pickWrap);
  const pick = makeCanvas(pickWrap, { aspect: 0.14, minHeight: 92, maxHeight: 110, draw: drawPicker });
  const pickLabels = labelLayer(pick.wrap);
  pick.wrap.tabIndex = 0;
  pick.wrap.setAttribute('role', 'slider');
  pick.wrap.setAttribute('aria-label', 'Eigenvalue of X^{p,q}');
  pick.wrap.style.touchAction = 'manipulation';
  pick.wrap.style.cursor = 'pointer';

  const row = el('div', { class: 'fig-row' });
  const left = el('div', { class: 'grow' }), right = el('div', { class: 'side' });
  row.append(left, right);
  root.append(row);
  const treeHint = el('p', { class: 'panel-hint' });
  left.append(treeHint);
  const tree = makeCanvas(left, { aspect: 1, maxHeight: 540, draw: drawTree });
  const treeLabels = labelLayer(tree.wrap);
  tree.wrap.style.touchAction = 'manipulation';

  const ctl = controls(right);
  chips(ctl, {
    label: 'the graph $X^{p,q}$',
    options: PAIRS.map(([p, q]) => [p + ',' + q, `$(${p},${q})$`]),
    value: st.p + ',' + st.q,
    onchange: (key) => { const [p, q] = key.split(',').map(Number); setPair(p, q); },
  });
  const btns = el('div', { class: 'btn-row' });
  ctl.append(btns);
  button(btns, 'largest nontrivial $\\lambda$', () => select(firstNontrivial()), 'ghost');
  button(btns, '$\\lambda=p+1$', () => select(0), 'ghost');
  const signBtn = button(btns, '$\\lambda=-(p+1)$', () => select(st.d.Zs.eigen.length - 1), 'ghost');
  const seg = el('div');
  ctl.append(seg);
  segmented(seg, [['scaled', 'times $p^{r/2}$'], ['raw', 'average itself']], 'scaled', (v) => { st.scaled = v === 'scaled'; setPlotHint(); plot.redraw(); });
  const ro = el('div', { class: 'readout' });
  const hov = el('div', { class: 'readout', style: 'margin-top:0.6rem' });
  right.append(ro, hov);

  const plotWrap = el('div', { style: 'margin-top:1rem' });
  const plotHint = el('p', { class: 'panel-hint' });
  plotWrap.append(plotHint);
  root.append(plotWrap);
  const plot = makeCanvas(plotWrap, { aspect: (w) => (w < 500 ? 0.62 : 0.34), minHeight: 210, maxHeight: 320, draw: drawPlot });
  const plotLabels = labelLayer(plot.wrap);
  plot.wrap.style.touchAction = 'manipulation';

  function setPlotHint() {
    setTex(plotHint, st.scaled
      ? 'Dots: the average of $F$ over the sphere $S_r$ of radius $r$ around $e$ in the tree, times $p^{r/2}$. Curve: $p^{r/2}\\varphi_\\lambda(r)$, the spherical function, scaled the same way.'
      : 'Dots: the average of $F$ over the sphere $S_r$ of radius $r$ around $e$ in the tree. Curve: the spherical function $\\varphi_\\lambda(r)$.');
  }

  // ── data ──
  function firstNontrivial() {
    const E = st.d.Zs.eigen, k = st.p + 1;
    const i = E.findIndex((e) => Math.abs(Math.abs(e.lam) - k) > 1e-6);
    return i < 0 ? 0 : i;
  }

  function setPair(p, q) {
    st.p = p; st.q = q; st.hoverLam = -1; st.hoverV = -1; st.hoverR = -1;
    setTex(ro, `<span class="dim">Building $X^{${p},${q}}$ and its zonal eigenfunctions…</span>`);
    setTimeout(() => {
      if (st.p !== p || st.q !== q) return;
      st.d = pairData(p, q);
      signBtn.style.display = st.d.X.psl ? 'none' : '';
      const n = st.d.X.n;
      setTex(pickHint, `<b>Pick</b> an eigenvalue of $X^{${p},${q}}$ ($n=${n}$, ${st.d.X.psl ? `$\\PSL_2(\\F_{${q}})$` : `$\\PGL_2(\\F_{${q}})$, bipartite`}). Bar height: multiplicity.`);
      setTex(treeHint, `Its eigenvector, lifted to the tree around $e$ (radius $${st.d.depth}$), coloured by $F=P_\\lambda(e,\\cdot)/P_\\lambda(e,e)$, so $F(e)=1$.`);
      setPlotHint();
      select(firstNontrivial());
      getSpectrum(p, q).then((res) => {
        if (st.p !== p || st.q !== q) return;
        const groups = [];
        for (const x of res.lam) { const g = groups[groups.length - 1]; if (g && Math.abs(g.x - x) < 1e-6) g.m++; else groups.push({ x, m: 1 }); }
        st.dense = groups; st.denseKey = p + ',' + q;
        updateReadout();
      }).catch(() => {});
    }, 0);
  }

  function select(i) {
    const E = st.d.Zs.eigen;
    st.sel = Math.max(0, Math.min(E.length - 1, i));
    const { X, Zs, a, R, p } = st.d;
    const lam = E[st.sel].lam;
    st.F = zonalF(X, Zs, st.sel);
    st.avg = sphereAverages(a, st.F, p);
    st.phi = sphericalFunction(lam, p, R);
    st.shells = shellSums(a, st.F);
    st.res = residual(X, st.F, lam);
    // the colour scale: the largest |F| on the drawn ball away from e
    let M = 0;
    st.d.T.nodes.forEach((nd, j) => { if (nd.depth > 0) M = Math.max(M, Math.abs(st.F[st.d.lift[j]])); });
    st.scaleF = M > 1e-12 ? M : 1;
    pick.wrap.setAttribute('aria-valuetext', `lambda = ${lam.toFixed(4)}`);
    pick.redraw(); tree.redraw(); plot.redraw();
    updateReadout(); updateHover();
  }

  // ── readouts ──
  function updateReadout() {
    if (!st.d || !st.F) return;
    const { X, Zs, R, p, q } = st.d, E = Zs.eigen, e = E[st.sel], n = X.n, k = p + 1;
    const m = Math.round(e.weight * n);
    const mOk = Math.abs(e.weight * n - m) < 1e-8;
    let dense = '';
    if (st.dense && st.denseKey === p + ',' + q) {
      const g = st.dense.find((x) => Math.abs(x.x - e.lam) < 1e-6);
      dense = g && g.m === m
        ? '<span class="ok">✓</span> the same as in the full spectrum'
        : '<span class="bad">✗</span> differs from the full spectrum';
    } else dense = '<span class="dim">checking against the full spectrum…</span>';
    let worstAvg = 0;
    for (let r = 0; r <= R; r++) worstAvg = Math.max(worstAvg, Math.abs(st.avg[r] - st.phi[r]) * Math.pow(p, r / 2));
    let worstShell = 0;
    for (let t = 0; t <= R; t++) { const h = H(t, e.lam, p); worstShell = Math.max(worstShell, Math.abs(st.shells[t] - h) / Math.max(Math.abs(h), (t + 1) * Math.pow(p, t / 2))); }
    const kind = Math.abs(e.lam - k) < 1e-9 ? 'trivial: $F\\equiv1$'
      : Math.abs(e.lam + k) < 1e-9 ? 'trivial: $F=\\pm1$ by side'
        : Math.abs(e.lam) <= 2 * Math.sqrt(p) + 1e-9 ? 'in the window, so $\\theta$ is real' : '<span class="bad">outside the window</span>';
    setTex(ro, `<table>
      <tr><td>$\\lambda=${texNum(e.lam, 5)}$</td><td class="num">$${thetaTex(e.lam, p)}$</td></tr>
      <tr><td colspan="2" class="dim">${kind}</td></tr>
      <tr class="sep"><td>multiplicity $m$</td><td class="num">$${m}$</td></tr>
      <tr><td>$P_\\lambda(e,e)=m/n$</td><td class="num">$${mOk ? `${m}/${n}` : texNum(e.weight, 6)}$</td></tr>
      <tr><td colspan="2">${dense}</td></tr>
      <tr class="sep"><td colspan="2">sphere averages $=\\varphi_\\lambda(r)$ for $r\\le${R}$ ${worstAvg < 1e-6 ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>'}<br><span class="dim">largest $p^{r/2}\\,|\\text{average}-\\varphi_\\lambda(r)|$: $${sci(worstAvg)}$</span></td></tr>
      <tr><td colspan="2">shells summed as in (4.9) give $H_t(\\lambda)$ for $t\\le${R}$ ${worstShell < 1e-7 ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>'} <span class="dim">(4.10)</span></td></tr>
      <tr><td colspan="2">$\\|AF-\\lambda F\\|/\\|F\\|=${sci(st.res)}$ ${st.res < 1e-9 ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>'}</td></tr>
      <tr class="sep"><td colspan="2" class="dim">Exact: on the $${Zs.D}$ orbits of the $${Zs.order}$ symmetries of $X^{${p},${q}}$ fixing $e$ (conjugation by quaternion units), in $${Math.max(1, Math.round(st.d.ms))}$ ms.</td></tr>
    </table>`);
  }

  function updateHover() {
    if (!st.d || !st.F) return;
    const { X, T, lift, p } = st.d, lam = st.d.Zs.eigen[st.sel].lam;
    if (st.hoverV >= 0) {
      const nd = T.nodes[st.hoverV], v = lift[st.hoverV];
      let sum = 0;
      for (let s = 0; s < X.k; s++) sum += st.F[X.nbr[v * X.k + s]];
      const lhs = lam * st.F[v], okEq = Math.abs(sum - lhs) < 1e-8 * (1 + Math.abs(lhs));
      setTex(hov, `<div>vertex $w=${wordTexOf(nd.word)}$ <span class="dim">(distance $${nd.depth}$)</span></div>
        <div>$F(w)=${texNum(st.F[v], 5)}$</div>
        <div style="margin-top:0.25rem">its $${p + 1}$ neighbours add up to $${texNum(sum, 5)}$</div>
        <div>$\\lambda\\,F(w)=${texNum(lhs, 5)}$ ${okEq ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>'}</div>`);
    } else if (st.hoverR >= 0) {
      const r = st.hoverR;
      setTex(hov, `<div>sphere $S_{${r}}$: $|S_{${r}}|=${fmt.tex(sphereSize(p, r))}$ vertices of the tree</div>
        <div>average of $F$ over it $=${texNum(st.avg[r], 6)}$</div>
        <div>$\\varphi_\\lambda(${r})=${texNum(st.phi[r], 6)}$ ${Math.abs(st.avg[r] - st.phi[r]) * Math.pow(p, r / 2) < 1e-6 ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>'}</div>
        ${r > st.d.depth ? '<div class="dim">Beyond the drawn ball: summed on the graph, by counting non-backtracking walks.</div>' : ''}`);
    } else {
      setTex(hov, `<span class="dim"><b>Hover</b> a vertex of the tree to check $\\sum_{y\\sim w}F(y)=\\lambda F(w)$ there, or a dot below to see one sphere.</span>`);
    }
  }

  // ── colours ──
  function colourOf(P, f) {
    const t = Math.min(1, Math.abs(f) / (st.scaleF || 1)) ** 0.6;
    return f >= 0 ? mix(P.surface, P.graph, t) : mix(P.surface, P.text, 0.88 * t);
  }

  // ── the eigenvalue picker ──
  let pickGeom = null;
  function drawPicker(ctx, w, h) {
    const P = palette(), lab = [];
    if (!st.d) { pickLabels.set([]); return; }
    const { p } = st.d, k = p + 1, Rw = 2 * Math.sqrt(p), E = st.d.Zs.eigen, n = st.d.X.n;
    const padL = 18, padR = 18, base = h - 30, top = 22;
    const xmin = -k - 0.8, xmax = k + 0.8;
    const X = (x) => padL + ((x - xmin) / (xmax - xmin)) * (w - padL - padR);
    pickGeom = { X };
    ctx.fillStyle = P.window;
    ctx.fillRect(X(-Rw), top - 6, X(Rw) - X(-Rw), base - top + 6);
    ctx.strokeStyle = P.border; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, base + 0.5); ctx.lineTo(w - padR, base + 0.5); ctx.stroke();
    const maxM = Math.max(...E.map((e) => e.weight * n));
    E.forEach((e, i) => {
      const triv = Math.abs(Math.abs(e.lam) - k) < 1e-9;
      const hh = 6 + (base - top - 6) * Math.sqrt((e.weight * n) / maxM);
      ctx.strokeStyle = triv ? P.trivial : P.graph;
      ctx.lineWidth = i === st.sel ? 3.2 : 1.8;
      ctx.globalAlpha = i === st.sel || i === st.hoverLam ? 1 : 0.75;
      ctx.beginPath(); ctx.moveTo(X(e.lam), base); ctx.lineTo(X(e.lam), base - hh); ctx.stroke();
      ctx.globalAlpha = 1;
      if (i === st.sel) {
        ctx.fillStyle = triv ? P.trivial : P.graph;
        ctx.beginPath(); ctx.arc(X(e.lam), base - hh - 5, 4, 0, 7); ctx.fill();
      }
      if (i === st.hoverLam && i !== st.sel) {
        ctx.strokeStyle = P.text; ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(X(e.lam), base - hh - 5, 5, 0, 7); ctx.stroke();
      }
    });
    const crowded = X(k) - X(Rw) < 64;
    for (const [x, tex] of [[-k, '-(p+1)'], [0, '0'], [k, 'p+1']]) lab.push({ id: 'ax' + tex, x: X(x), y: base + 6, anchor: 's', tex, cls: 'small' });
    lab.push({ id: 'ax-w', x: X(-Rw) + (crowded ? 3 : 0), y: crowded ? top - 4 : base + 6, anchor: crowded ? 'se' : 's', tex: '-2\\sqrt p', cls: 'small' });
    lab.push({ id: 'ax+w', x: X(Rw) - (crowded ? 3 : 0), y: crowded ? top - 4 : base + 6, anchor: crowded ? 'sw' : 's', tex: '2\\sqrt p', cls: 'small' });
    const e = E[st.sel];
    const sx = X(e.lam);
    lab.push({ id: 'sel', x: Math.max(40, Math.min(w - 40, sx)), y: 2, anchor: 's', tex: `\\lambda=${texNum(e.lam, 4)}`, cls: 'small halo', color: Math.abs(Math.abs(e.lam) - k) < 1e-9 ? P.trivial : P.graph });
    pickLabels.set(lab);
  }
  function nearestLam(x) {
    if (!pickGeom || !st.d) return -1;
    let best = -1, bd = 16;
    st.d.Zs.eigen.forEach((e, i) => { const d = Math.abs(pickGeom.X(e.lam) - x); if (d < bd) { bd = d; best = i; } });
    return best;
  }
  pointer(pick.wrap, {
    down(x) { const i = nearestLam(x); if (i >= 0) select(i); return false; },
    hover(x) { const i = nearestLam(x); if (i !== st.hoverLam) { st.hoverLam = i; pick.redraw(); } },
    leave() { if (st.hoverLam >= 0) { st.hoverLam = -1; pick.redraw(); } },
  });
  pick.wrap.addEventListener('keydown', (ev) => {
    if (!st.d) return;
    const last = st.d.Zs.eigen.length - 1;
    // the list is descending, so "right" (larger λ) is a smaller index
    const moves = { ArrowRight: -1, ArrowUp: -1, ArrowLeft: 1, ArrowDown: 1 };
    if (ev.key in moves) { select(st.sel + moves[ev.key]); ev.preventDefault(); }
    else if (ev.key === 'Home') { select(last); ev.preventDefault(); }
    else if (ev.key === 'End') { select(0); ev.preventDefault(); }
  });

  // ── the tree ──
  let treeGeom = null;
  function drawTree(ctx, w, h) {
    const P = palette(), lab = [];
    if (!st.d || !st.F) { treeLabels.set([]); return; }
    const { T, lift, depth } = st.d, nodes = T.nodes;
    const R = 0.45 * Math.min(w, h) - 4, cx = w / 2, cy = h / 2;
    const px = new Float32Array(nodes.length), py = new Float32Array(nodes.length);
    nodes.forEach((nd, i) => { px[i] = cx + R * nd.x; py[i] = cy + R * nd.y; });
    treeGeom = { px, py };
    const ringR = (d) => R * Math.pow(d / depth, 0.92);
    // guide circles for the spheres
    for (let d = 1; d <= depth; d++) {
      const hl = d === st.hoverR;
      ctx.strokeStyle = hl ? P.graph : P.grid;
      ctx.lineWidth = hl ? 2 : 1;
      ctx.setLineDash(hl ? [] : [3, 4]);
      ctx.beginPath(); ctx.arc(cx, cy, ringR(d), 0, 7); ctx.stroke();
    }
    ctx.setLineDash([]);
    // edges, fainter toward the rim where they crowd
    for (let d = 1; d <= depth; d++) {
      ctx.strokeStyle = rgba(P.tree, (P.dark ? 0.36 : 0.32) * (d === depth && depth > 2 ? 0.55 : 1));
      ctx.lineWidth = d === depth && depth > 2 ? 0.7 : 1;
      ctx.beginPath();
      for (let i = 1; i < nodes.length; i++) {
        if (nodes[i].depth !== d) continue;
        const par = nodes[i].parent;
        ctx.moveTo(px[par], py[par]); ctx.lineTo(px[i], py[i]);
      }
      ctx.stroke();
    }
    // vertices
    const leaves = nodes.length - (nodes.findIndex((nd) => nd.depth === depth));
    const leafR = Math.max(1.3, Math.min(3, (Math.PI * R) / Math.max(1, leaves) * 0.9));
    const rad = (d) => (d === 0 ? 6.5 : d === depth ? leafR : Math.max(leafR, 4.6 - 0.9 * d));
    for (let i = nodes.length - 1; i >= 0; i--) {
      const f = st.F[lift[i]];
      ctx.fillStyle = colourOf(P, f);
      ctx.beginPath(); ctx.arc(px[i], py[i], rad(nodes[i].depth), 0, 7); ctx.fill();
      if (nodes[i].depth < 2) { ctx.strokeStyle = rgba(P.text, 0.35); ctx.lineWidth = 0.8; ctx.stroke(); }
    }
    // a hovered vertex and its neighbours
    if (st.hoverV >= 0) {
      const i = st.hoverV, nd = nodes[i];
      ctx.strokeStyle = P.text; ctx.lineWidth = 1.6;
      ctx.beginPath(); ctx.arc(px[i], py[i], rad(nd.depth) + 4, 0, 7); ctx.stroke();
      ctx.lineWidth = 1;
      const nb = [];
      if (nd.parent >= 0) nb.push(nd.parent);
      nodes.forEach((m, j) => { if (m.parent === i) nb.push(j); });
      for (const j of nb) { ctx.beginPath(); ctx.arc(px[j], py[j], rad(nodes[j].depth) + 2.5, 0, 7); ctx.stroke(); }
      lab.push({ id: 'hw', x: px[i], y: py[i] - rad(nd.depth) - 6, anchor: 'n', tex: wordTexOf(nd.word), cls: 'halo' });
    }
    lab.push({ id: 'e', x: cx, y: cy + 9, anchor: 's', tex: 'e', cls: 'small halo' });
    for (let d = 1; d <= depth; d++) {
      const a = -Math.PI / 4;
      lab.push({ id: 'S' + d, x: cx + ringR(d) * Math.cos(a) + 3, y: cy + ringR(d) * Math.sin(a) - 3, anchor: 'ne', tex: `S_{${d}}`, cls: 'small halo', color: d === st.hoverR ? P.graph : undefined });
    }
    // colour key
    const kx = 10, ky = h - 16, kw = Math.min(120, w * 0.3);
    for (let t = 0; t <= kw; t++) {
      ctx.fillStyle = colourOf(P, (-1 + (2 * t) / kw) * st.scaleF);
      ctx.fillRect(kx + t, ky, 1.2, 7);
    }
    ctx.strokeStyle = P.border; ctx.lineWidth = 1; ctx.strokeRect(kx + 0.5, ky + 0.5, kw, 7);
    const mTex = fmt.tex(+st.scaleF.toPrecision(2), 2);
    lab.push({ id: 'k-1', x: kx, y: ky - 2, anchor: 'ne', tex: '-' + mTex, cls: 'small' });
    lab.push({ id: 'k0', x: kx + kw / 2, y: ky - 2, anchor: 'n', tex: '0', cls: 'small' });
    lab.push({ id: 'k1', x: kx + kw, y: ky - 2, anchor: 'nw', tex: mTex, cls: 'small' });
    lab.push({ id: 'kF', x: kx + kw + 8, y: ky + 4, anchor: 'e', tex: 'F', cls: 'small' });
    treeLabels.set(lab);
  }
  function nearestVertex(x, y) {
    if (!treeGeom) return -1;
    const { px, py } = treeGeom;
    let best = -1, bd = 11 * 11;
    for (let i = 0; i < px.length; i++) { const d = (px[i] - x) ** 2 + (py[i] - y) ** 2; if (d < bd) { bd = d; best = i; } }
    return best;
  }
  pointer(tree.wrap, {
    down(x, y) { const i = nearestVertex(x, y); if (i !== st.hoverV) { st.hoverV = i; st.hoverR = -1; tree.redraw(); updateHover(); } return false; },
    hover(x, y) { const i = nearestVertex(x, y); if (i !== st.hoverV) { st.hoverV = i; st.hoverR = -1; tree.redraw(); updateHover(); } },
    leave() { if (st.hoverV >= 0) { st.hoverV = -1; tree.redraw(); updateHover(); } },
  });

  // ── the plot ──
  let plotGeom = null;
  function drawPlot(ctx, w, h) {
    const P = palette(), lab = [];
    if (!st.d || !st.F) { plotLabels.set([]); return; }
    const { p, R } = st.d, lam = st.d.Zs.eigen[st.sel].lam;
    const padL = 46, padR = 14, padT = 14, padB = 30;
    const sc = (r) => (st.scaled ? Math.pow(p, r / 2) : 1);
    const curve = [];
    const steps = Math.max(120, Math.round(w));
    for (let i = 0; i <= steps; i++) { const x = (R * i) / steps; curve.push([x, sphericalAt(lam, p, x) * sc(x)]); }
    let ymax = 1e-9;
    for (const [, y] of curve) ymax = Math.max(ymax, Math.abs(y));
    for (let r = 0; r <= R; r++) ymax = Math.max(ymax, Math.abs(st.avg[r] * sc(r)));
    ymax *= 1.12;
    const X = (x) => padL + (x / R) * (w - padL - padR);
    const Y = (y) => padT + ((ymax - y) / (2 * ymax)) * (h - padT - padB);
    plotGeom = { X, padL, padR, R };
    // grid
    ctx.strokeStyle = P.grid; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(padL, Y(0)); ctx.lineTo(w - padR, Y(0)); ctx.stroke();
    const tStep = R > 12 ? 2 : 1;
    for (let r = 0; r <= R; r += tStep) {
      ctx.beginPath(); ctx.moveTo(X(r), padT); ctx.lineTo(X(r), h - padB); ctx.stroke();
      lab.push({ id: 'r' + r, x: X(r), y: h - padB + 6, anchor: 's', tex: String(r), cls: 'small' });
    }
    lab.push({ id: 'rlab', x: w - padR, y: h - padB - 4, anchor: 'nw', tex: 'r', cls: 'small halo' });
    const yv = +fmt.g(ymax / 1.12, 2);
    for (const v of [yv, -yv]) lab.push({ id: 'y' + (v > 0 ? 'p' : 'm'), x: padL - 6, y: Y(v), anchor: 'w', tex: fmt.tex(v, 2), cls: 'small' });
    lab.push({ id: 'y0', x: padL - 6, y: Y(0), anchor: 'w', tex: '0', cls: 'small' });
    // hovered r
    if (st.hoverR >= 0) {
      ctx.strokeStyle = rgba(P.graph, 0.5); ctx.lineWidth = 6;
      ctx.beginPath(); ctx.moveTo(X(st.hoverR), padT); ctx.lineTo(X(st.hoverR), h - padB); ctx.stroke();
    }
    // the spherical function
    ctx.strokeStyle = P.tree; ctx.lineWidth = 1.8;
    ctx.beginPath();
    curve.forEach(([x, y], i) => { if (i) ctx.lineTo(X(x), Y(y)); else ctx.moveTo(X(x), Y(y)); });
    ctx.stroke();
    // the averages
    for (let r = 0; r <= R; r++) {
      ctx.fillStyle = P.graph;
      ctx.beginPath(); ctx.arc(X(r), Y(st.avg[r] * sc(r)), r === st.hoverR ? 5.5 : 4, 0, 7); ctx.fill();
      ctx.strokeStyle = P.surface; ctx.lineWidth = 1.2; ctx.stroke();
    }
    plotLabels.set(lab);
  }
  function nearestR(x) {
    if (!plotGeom) return -1;
    const r = Math.round(((x - plotGeom.padL) / (plot.w - plotGeom.padL - plotGeom.padR)) * plotGeom.R);
    return r >= 0 && r <= plotGeom.R ? r : -1;
  }
  pointer(plot.wrap, {
    down(x) { const r = nearestR(x); st.hoverR = r; st.hoverV = -1; plot.redraw(); tree.redraw(); updateHover(); return false; },
    hover(x) { const r = nearestR(x); if (r !== st.hoverR) { st.hoverR = r; st.hoverV = -1; plot.redraw(); tree.redraw(); updateHover(); } },
    leave() { if (st.hoverR >= 0) { st.hoverR = -1; plot.redraw(); tree.redraw(); updateHover(); } },
  });

  onTheme(() => { pick.redraw(); tree.redraw(); plot.redraw(); });
  setPair(st.p, st.q);
}
