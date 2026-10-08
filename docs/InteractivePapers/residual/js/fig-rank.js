// Figure 4 — an edge array Y = (U(g_uv)) in a real finite group: rank over ℝ, the trace bound, rank over F_q.

import { el, controls, slider, button, segmented, makeCanvas, palette, onTheme, rgba, hexToRgb } from './common.js';

// ---------- groups ----------

function closure(gens) {
  const key = (p) => p.join(',');
  const id = [...Array(gens[0].length).keys()];
  const els = [id], seen = new Map([[key(id), 0]]);
  for (let h = 0; h < els.length; h++) for (const g of gens) {
    const p = els[h].map((x) => g[x]), k = key(p);
    if (!seen.has(k)) { seen.set(k, els.length); els.push(p); }
  }
  const n = els.length, mul = new Int32Array(n * n);
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) mul[a * n + b] = seen.get(key(els[b].map((x) => els[a][x])));
  return finish(n, mul);
}
function finish(n, mul) {
  const inv = new Int32Array(n);
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) if (mul[a * n + b] === 0) { inv[a] = b; break; }
  return { n, mul, inv };
}
function cyclic(n) {
  const mul = new Int32Array(n * n);
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) mul[a * n + b] = (a + b) % n;
  return { ...finish(n, mul), ring: (u, v) => (u * v) % n, ringMax: n };
}
const GF_POLY = { 3: 0b1011, 4: 0b10011 };
function gfMul(a, b, k) {
  let r = 0;
  for (let i = 0; i < k; i++) if ((b >> i) & 1) r ^= a << i;
  for (let i = 2 * k - 2; i >= k; i--) if ((r >> i) & 1) r ^= GF_POLY[k] << (i - k);
  return r;
}
function additiveGF(k) {
  const n = 1 << k, mul = new Int32Array(n * n);
  for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) mul[a * n + b] = a ^ b;
  return { ...finish(n, mul), ring: (u, v) => gfMul(u, v, k), ringMax: n };
}
function sl23() {
  const vecs = [];
  for (let x = 0; x < 3; x++) for (let y = 0; y < 3; y++) if (x || y) vecs.push([x, y]);
  const idx = (v) => vecs.findIndex((w) => w[0] === v[0] && w[1] === v[1]);
  const act = (M) => vecs.map(([x, y]) => idx([(M[0] * x + M[1] * y) % 3, (M[2] * x + M[3] * y) % 3]));
  return closure([act([1, 1, 0, 1]), act([0, 2, 1, 0])]);
}
function psl27() {
  // z ↦ z+1 and z ↦ -1/z on P¹(F₇), ∞ = 7
  const inv7 = (z) => { for (let w = 1; w < 7; w++) if ((z * w) % 7 === 1) return w; return 0; };
  const t = [...Array(8)].map((_, z) => (z === 7 ? 7 : (z + 1) % 7));
  const s = [...Array(8)].map((_, z) => (z === 7 ? 0 : z === 0 ? 7 : (7 - inv7(z)) % 7));
  return closure([t, s]);
}

const cache = {};
export const GROUPS = {
  z7: { label: 'ℤ/7', make: () => cyclic(7) },
  z13: { label: 'ℤ/13', make: () => cyclic(13) },
  z23: { label: 'ℤ/23', make: () => cyclic(23) },
  f8: { label: '(𝔽₈, +)', make: () => additiveGF(3) },
  f16: { label: '(𝔽₁₆, +)', make: () => additiveGF(4) },
  s4: { label: 'S₄', make: () => closure([[1, 2, 3, 0], [1, 0, 2, 3]]) },
  sl23: { label: 'SL₂(𝔽₃)', make: sl23 },
  a5: { label: 'A₅', make: () => closure([[1, 2, 0, 3, 4], [0, 1, 3, 4, 2]]) },
  psl27: { label: 'PSL₂(𝔽₇)', make: psl27 },
};
export function group(key) { return cache[key] || (cache[key] = GROUPS[key].make()); }

// ---------- arrays and the trace count ----------

function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

// Number of index quadruples (u,u',v,v') whose rectangular word g_uv g_u'v⁻¹ g_u'v' g_uv'⁻¹ is trivial.
export function trivialRectangles(G, r, g) {
  const D = G.n, m = (a, b) => G.mul[a * D + b];
  let triv = 0;
  for (let u = 0; u < r; u++) for (let u2 = 0; u2 < r; u2++) for (let v = 0; v < r; v++) for (let v2 = 0; v2 < r; v2++) {
    const w = m(m(m(g[u * r + v], G.inv[g[u2 * r + v]]), g[u2 * r + v2]), G.inv[g[u * r + v2]]);
    if (w === 0) triv++;
  }
  return triv;
}

export function makeArray(G, r, mode, seed) {
  const R = rng(seed), D = G.n, rand = () => Math.floor(R() * D);
  if (mode === 'product') {
    const a = Array.from({ length: r }, rand), b = Array.from({ length: r }, rand);
    return Array.from({ length: r * r }, (_, k) => G.mul[a[Math.floor(k / r)] * D + b[k % r]]);
  }
  if (mode === 'bilinear' && G.ring) return Array.from({ length: r * r }, (_, k) => G.ring(Math.floor(k / r), k % r));
  let best = null, bestT = Infinity;
  const target = r * r * (2 * r - 1);
  for (let tries = 0; tries < 400; tries++) {
    const g = Array.from({ length: r * r }, rand), t = trivialRectangles(G, r, g);
    if (t < bestT) { bestT = t; best = g; }
    if (t === target) break;
  }
  return best;
}

// Y as a dense integer matrix (rows (u,x), columns (v,y)); U(g)_{x,y} = 1 iff x = g·y.
export function buildY(G, r, g) {
  const D = G.n, n = r * D, M = new Float64Array(n * n);
  for (let u = 0; u < r; u++) for (let v = 0; v < r; v++) for (let y = 0; y < D; y++) {
    const x = G.mul[g[u * r + v] * D + y];
    M[(u * D + x) * n + (v * D + y)] = 1;
  }
  return { M, n };
}

function modinv(a, p) { let o = a, r = p, s = 1, t = 0; while (r) { const q = Math.floor(o / r); [o, r] = [r, o - q * r]; [s, t] = [t, s - q * t]; } return ((s % p) + p) % p; }

// Rank mod p. With p ≤ 46340 every product fits in an int32, which keeps the inner loop fast.
// Generator: yields between pivots.
export function* rankModGen(M0, n, p, chunk = 8) {
  const M = p <= 46340 ? new Int32Array(M0.length) : new Float64Array(M0.length);
  for (let i = 0; i < M0.length; i++) M[i] = M0[i] % p;
  let rank = 0, steps = 0;
  for (let c = 0; c < n && rank < n; c++) {
    let piv = -1;
    for (let i = rank; i < n; i++) if (M[i * n + c] !== 0) { piv = i; break; }
    if (piv < 0) continue;
    if (piv !== rank) for (let j = c; j < n; j++) { const t = M[piv * n + j]; M[piv * n + j] = M[rank * n + j]; M[rank * n + j] = t; }
    const ai = modinv(M[rank * n + c], p), base = rank * n;
    for (let j = c; j < n; j++) M[base + j] = (M[base + j] * ai) % p;
    for (let i = rank + 1; i < n; i++) {
      const f = M[i * n + c];
      if (!f) continue;
      const row = i * n;
      for (let j = c; j < n; j++) {
        const v = (M[row + j] - f * M[base + j]) % p;
        M[row + j] = v < 0 ? v + p : v;
      }
    }
    rank++;
    if (++steps % chunk === 0) yield { rank, done: false };
  }
  yield { rank, done: true };
}
export function rankMod(M, n, p) { let last; for (const v of rankModGen(M, n, p)) last = v; return last.rank; }

export const BIG_P = [46337, 46327];

// ---------- figure ----------

const PRIMES = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31];

export function mount(root) {
  const row = el('div', { class: 'fig-row' });
  const left = el('div', { class: 'grow' }), right = el('div', { class: 'side' });
  row.append(left, right); root.append(row);

  const st = { group: 'a5', mode: 'random', r: 3, q: 5, seed: 3, g: null, triv: 0, rankR: null, rankQ: null, job: 0 };
  const cv = makeCanvas(left, { aspect: 0.5, maxHeight: 340, minHeight: 170, draw });

  function maxR() { const G = group(st.group); return Math.max(2, Math.min(st.mode === 'bilinear' && G.ring ? G.ringMax : 24, Math.floor(600 / G.n))); }

  function recompute() {
    const G = group(st.group);
    if (st.mode === 'bilinear' && !G.ring) { st.mode = 'random'; modeSeg.set('random'); }
    st.r = Math.min(st.r, maxR());
    st.g = makeArray(G, st.r, st.mode, st.seed);
    st.triv = trivialRectangles(G, st.r, st.g);
    st.rankR = null; st.rankQ = null; st.img = null;
    const job = ++st.job;
    const { M, n } = buildY(G, st.r, st.g);
    // small prime first, then two primes near 46340 (each a lower bound for the rank over ℝ)
    const gens = [['q', rankModGen(M, n, st.q)], ['R0', rankModGen(M, n, BIG_P[0])], ['R1', rankModGen(M, n, BIG_P[1])]];
    const res = {};
    const step = () => {
      if (job !== st.job) return;
      const t0 = performance.now();
      while (gens.length && performance.now() - t0 < 12) {
        const [name, gen] = gens[0];
        const { value } = gen.next();
        if (value.done) { res[name] = value.rank; gens.shift(); }
      }
      if (res.q !== undefined) st.rankQ = res.q;
      if (res.R0 !== undefined && res.R1 !== undefined) st.rankR = Math.max(res.R0, res.R1);
      updateReadout();
      if (gens.length) requestAnimationFrame(step);
    };
    cv.redraw(); updateReadout();
    requestAnimationFrame(step);
  }

  // Both panels are rendered once per array into pixel images, then scaled.
  function images(P) {
    const key = st.g.join(',') + '|' + st.group + '|' + P.dark;
    if (st.img && st.img.key === key) return st.img;
    const G = group(st.group), r = st.r, D = G.n, n = r * D;
    const rgb = (c) => hexToRgb(c);
    const paint = (size, fill) => {
      const c = document.createElement('canvas'); c.width = size; c.height = size;
      const cx = c.getContext('2d'), im = cx.createImageData(size, size);
      fill(im.data, size);
      cx.putImageData(im, 0, 0);
      return c;
    };
    const bg = rgb(P.panel2), ink = rgb(P.ink);
    const yImg = paint(n, (d, size) => {
      for (let k = 0; k < size * size; k++) { d[4 * k] = bg[0]; d[4 * k + 1] = bg[1]; d[4 * k + 2] = bg[2]; d[4 * k + 3] = 255; }
      for (let u = 0; u < r; u++) for (let v = 0; v < r; v++) for (let y = 0; y < D; y++) {
        const x = G.mul[st.g[u * r + v] * D + y], k = (u * D + x) * size + (v * D + y);
        d[4 * k] = ink[0]; d[4 * k + 1] = ink[1]; d[4 * k + 2] = ink[2];
      }
    });
    const cGrid = rgb(P.grid), cDead = rgb(P.accent2), a0 = rgb(P.accent), pb = rgb(P.panel);
    const al = P.dark ? 0.55 : 0.4, cAlive = a0.map((c, k) => Math.round(al * c + (1 - al) * pb[k]));
    const m = (a, b) => G.mul[a * D + b];
    const rImg = paint(r * r, (d, size) => {
      for (let u = 0; u < r; u++) for (let u2 = 0; u2 < r; u2++) for (let v = 0; v < r; v++) for (let v2 = 0; v2 < r; v2++) {
        const wd = m(m(m(st.g[u * r + v], G.inv[st.g[u2 * r + v]]), st.g[u2 * r + v2]), G.inv[st.g[u * r + v2]]);
        const c = u === u2 || v === v2 ? cGrid : wd === 0 ? cDead : cAlive;
        const k = (u * r + u2) * size + (v * r + v2);
        d[4 * k] = c[0]; d[4 * k + 1] = c[1]; d[4 * k + 2] = c[2]; d[4 * k + 3] = 255;
      }
    });
    st.img = { key, yImg, rImg };
    return st.img;
  }

  function draw(ctx, w, h) {
    const P = palette();
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, w, h);
    if (!st.g) return;
    const G = group(st.group), r = st.r, D = G.n, n = r * D;
    const side = Math.min(h - 26, (w - 30) / 2);
    if (!(side > 10)) return;
    const { yImg, rImg } = images(P);
    const ox = 6, oy = 20, px = side / n;
    ctx.imageSmoothingEnabled = n > side;
    ctx.drawImage(yImg, ox, oy, side, side);
    ctx.strokeStyle = rgba(P.accent, 0.8); ctx.lineWidth = 1;
    for (let k = 0; k <= r; k++) {
      ctx.beginPath(); ctx.moveTo(ox, oy + k * D * px); ctx.lineTo(ox + side, oy + k * D * px); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(ox + k * D * px, oy); ctx.lineTo(ox + k * D * px, oy + side); ctx.stroke();
    }
    ctx.fillStyle = P.muted; ctx.font = '10.5px Inter, system-ui, sans-serif';
    ctx.fillText(`Y = (U(g_uv)), ${n}×${n}`, ox, 13);
    const ox2 = ox + side + 18;
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(rImg, ox2, oy, side, side);
    if (r * r * 3 <= side) {
      ctx.strokeStyle = P.panel; ctx.lineWidth = 1;
      const cs = side / (r * r);
      for (let k = 0; k <= r * r; k++) {
        ctx.beginPath(); ctx.moveTo(ox2, oy + k * cs); ctx.lineTo(ox2 + side, oy + k * cs); ctx.stroke();
        ctx.beginPath(); ctx.moveTo(ox2 + k * cs, oy); ctx.lineTo(ox2 + k * cs, oy + side); ctx.stroke();
      }
    }
    ctx.imageSmoothingEnabled = true;
    ctx.fillStyle = P.muted;
    ctx.fillText('rectangular words', ox2, 13);
  }

  // controls
  const ctl = controls(right); ctl.style.marginTop = '0';
  const gSel = el('select', { 'aria-label': 'finite group Q' });
  for (const [k, g] of Object.entries(GROUPS)) gSel.append(el('option', { value: k }, g.label));
  ctl.append(el('label', { class: 'ctl' }, 'Q =', gSel));
  const qSel = el('select', { 'aria-label': 'prime q' });
  for (const p of PRIMES) qSel.append(el('option', { value: p }, String(p)));
  ctl.append(el('label', { class: 'ctl' }, 'q =', qSel));
  const ctl2 = controls(right); ctl2.style.marginTop = '.4rem';
  const modeSeg = segmented(ctl2, [['random', 'random'], ['product', 'g = a_u b_v'], ['bilinear', 'g = uv']], st.mode, (k) => { st.mode = k; syncR(); recompute(); });
  const ctl3 = controls(right); ctl3.style.marginTop = '.4rem';
  const rS = slider(ctl3, { label: 'r', min: 2, max: 8, step: 1, value: st.r, fmt: (v) => v, oninput: (v) => { st.r = v; recompute(); } });
  button(ctl3, 'New array', () => { st.seed++; recompute(); });
  const pre = controls(right); pre.style.marginTop = '.4rem';
  const preset = (g, mode, r, q) => { st.group = g; st.mode = mode; st.q = q; gSel.value = g; qSel.value = q; modeSeg.set(mode); syncR(); st.r = Math.min(r, maxR()); rS.set(st.r); recompute(); };
  button(pre, 'A₅, random', () => preset('a5', 'random', 3, 5));
  button(pre, 'product array', () => preset('a5', 'product', 3, 5));
  button(pre, 'ℤ/23, q = 23', () => preset('z23', 'bilinear', 22, 23));
  button(pre, '𝔽₈, q = 2 ≤ r', () => preset('f8', 'bilinear', 8, 2));
  button(pre, '𝔽₁₆, q = 2 ≤ r', () => preset('f16', 'bilinear', 16, 2));

  function syncR() { rS.input.max = maxR(); if (st.r > maxR()) { st.r = maxR(); } rS.set(st.r); }
  gSel.addEventListener('change', () => { st.group = gSel.value; syncR(); recompute(); });
  qSel.addEventListener('change', () => { st.q = +qSel.value; recompute(); });

  const ro = el('div', { class: 'readout', style: 'margin-top:.7rem' });
  right.append(ro);
  right.append(el('div', { class: 'hint' }, 'Right panel: rectangular words; gray = degenerate (u = u′ or v = v′), blue = nontrivial in Q, orange = trivial.'));

  function bar(label, val, max, color, txt) {
    const pct = Math.max(0, Math.min(100, (100 * val) / max));
    return `<div class="bar-row"><span>${label}</span><div class="track"><div class="fill" style="width:${pct}%;background:${color}"></div></div><span style="text-align:right">${txt}</span></div>`;
  }

  function updateReadout() {
    if (!st.g) return;
    const G = group(st.group), r = st.r, D = G.n, n = r * D;
    const nondeg = r * r * (r - 1) * (r - 1), degen = r * r * (2 * r - 1);
    const dead = st.triv - degen, alive = nondeg - dead;
    const cs = Math.ceil((r ** 4 * D) / st.triv - 1e-9);
    const P = { a: 'var(--accent)', b: 'var(--accent-2)', c: 'var(--accent-3)', d: 'var(--accent-4)', m: 'var(--muted)' };
    const mark = (ok) => (ok ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>');
    const R = st.rankR, Q = st.rankQ;
    const covered = st.q > r;
    let lemma = '<span class="k">running…</span>';
    if (R !== null && Q !== null) {
      const ok = 2 * Q >= R;
      lemma = covered ? `rank_q ≥ ½ rank_ℝ (q &gt; r) ${mark(ok)}`
        : (ok ? `q ≤ r: Lemma 2.4 does not apply; holds anyway <span class="ok">✓</span>`
          : `q ≤ r: <span class="bad">rank_q &lt; ½ rank_ℝ</span>`);
    }
    ro.innerHTML = `<table>
      <tr><td class="k">|Q| = D</td><td>${D}, r = ${r}, Y is ${n}×${n}</td></tr>
      <tr><td class="k">nondegenerate rectangles</td><td>${alive} of ${nondeg} nontrivial ${dead === 0 ? '<span class="ok">✓</span>' : `<span class="bad">${dead} trivial</span>`}</td></tr>
      <tr><td class="k">tr YYᵀ</td><td>r²D = ${r * r * D}</td></tr>
      <tr><td class="k">tr (YYᵀ)²</td><td>${st.triv}·D${dead === 0 ? ' = (2r³−r²)D' : ''}</td></tr>
      </table><hr>
      <div class="bars">
        ${bar('rank over ℝ', R ?? 0, n, P.a, R === null ? '…' : R)}
        ${bar('(tr YYᵀ)²/tr(YYᵀ)²', cs, n, P.d, '≥ ' + cs)}
        ${bar(`rank over 𝔽_${st.q}`, Q ?? 0, n, R !== null && Q !== null && 2 * Q < R ? P.b : P.c, Q === null ? '…' : Q)}
        ${bar('rD/4  (2.10)', n / 4, n, P.m, Math.ceil(n / 4))}
      </div><hr>
      ${R === null ? '<span class="k">running…</span>' : `rank_ℝ ≥ trace bound ${mark(R >= cs)}${dead === 0 ? ` · ≥ rD/2 ${mark(2 * R >= n)}` : ''}`}<br>${lemma}`;
  }

  gSel.value = st.group; qSel.value = st.q; syncR();
  recompute();
  onTheme(() => cv.redraw());
}
