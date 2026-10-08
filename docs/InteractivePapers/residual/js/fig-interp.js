// Figure 5 — product Lagrange interpolation on S² ⊂ F_q² and the punctured-line identity (2.13)–(2.14).

import { el, controls, slider, button, segmented, makeCanvas, palette, onTheme, pointer, rgba } from './common.js';

// ---------- pure math (h = 2) ----------

const mod = (a, q) => ((a % q) + q) % q;
export function inv(a, q) { let o = mod(a, q), r = q, s = 1, t = 0; while (r) { const k = Math.floor(o / r); [o, r] = [r, o - k * r]; [s, t] = [t, s - k * t]; } return mod(s, q); }

function rng(seed) { let s = seed >>> 0 || 1; return () => { s ^= s << 13; s >>>= 0; s ^= s >>> 17; s ^= s << 5; s >>>= 0; return s / 4294967296; }; }

// Marks a_i = (i mod s, ⌊i/s⌋) ∈ S², S = {0,…,s−1}; each line gets a random direction in P¹(F_q).
export function setup(q, s, seed) {
  const R = rng(seed);
  // 1-D Lagrange basis on S: lag[c][x] = Π_{a∈S, a≠c} (x−a)/(c−a)
  const lag = [];
  for (let c = 0; c < s; c++) {
    const row = new Int32Array(q);
    for (let x = 0; x < q; x++) {
      let v = 1;
      for (let a = 0; a < s; a++) if (a !== c) v = mod(v * mod(x - a, q) * inv(c - a, q), q);
      row[x] = v;
    }
    lag.push(row);
  }
  const N = s * s, lines = [];
  for (let i = 0; i < N; i++) {
    const a = [i % s, Math.floor(i / s)];
    const k = Math.floor(R() * (q + 1));
    const d = k === q ? [0, 1] : [1, k];
    const pts = [];
    for (let t = 0; t < q; t++) pts.push([mod(a[0] + t * d[0], q), mod(a[1] + t * d[1], q)]);
    lines.push({ a, d, pts }); // pts[0] is the mark
  }
  const f = (i, z) => mod(lag[i % s][z[0]] * lag[Math.floor(i / s)][z[1]], q);
  return { q, s, N, lag, lines, f };
}

// Σ over the line ℓ_i (with or without its mark) of f_k f_l.
export function lineSum(S, i, k, l, punctured) {
  let sum = 0;
  S.lines[i].pts.forEach((z, t) => { if (!(punctured && t === 0)) sum += S.f(k, z) * S.f(l, z); });
  return mod(sum, S.q);
}

// (2.13) on ℓ_i: Σ_{z∈ℓ_i∖a_i} f(z)f(z)ᵀ = −E_ii. Returns the number of failing entries.
export function check213(S, i) {
  const { q, N } = S;
  const acc = new Int32Array(N * N);
  S.lines[i].pts.forEach((z, t) => {
    if (t === 0) return;
    const F = new Int32Array(N);
    for (let k = 0; k < N; k++) F[k] = S.f(k, z);
    for (let k = 0; k < N; k++) if (F[k]) for (let l = 0; l < N; l++) acc[k * N + l] = mod(acc[k * N + l] + F[k] * F[l], q);
  });
  let bad = 0;
  for (let k = 0; k < N; k++) for (let l = 0; l < N; l++) if (acc[k * N + l] !== (k === i && l === i ? q - 1 : 0)) bad++;
  return bad;
}

// (2.14): Σ_z H(z) ⊗ Z(z) + ⊕ Y_i = 0 with Z(z) = Σ_{i: z ∈ ℓ_i∖a_i} Y_i, for random d×d blocks Y_i.
export function check214(S, d, seed) {
  const { q, N } = S, R = rng(seed);
  const Y = Array.from({ length: N }, () => Array.from({ length: d * d }, () => Math.floor(R() * q)));
  const Z = new Map();
  S.lines.forEach((L, i) => L.pts.forEach((z, t) => {
    if (t === 0) return;
    const key = z[0] * q + z[1];
    if (!Z.has(key)) Z.set(key, { z, M: new Int32Array(d * d) });
    const e = Z.get(key);
    for (let x = 0; x < d * d; x++) e.M[x] = mod(e.M[x] + Y[i][x], q);
  }));
  const acc = new Int32Array(N * N * d * d); // block (k,l), entry x
  for (const { z, M } of Z.values()) {
    const F = new Int32Array(N);
    for (let k = 0; k < N; k++) F[k] = S.f(k, z);
    for (let k = 0; k < N; k++) if (F[k]) for (let l = 0; l < N; l++) if (F[l]) {
      const c = (F[k] * F[l]) % q, base = (k * N + l) * d * d;
      for (let x = 0; x < d * d; x++) acc[base + x] = (acc[base + x] + c * M[x]) % q;
    }
  }
  let bad = 0;
  for (let k = 0; k < N; k++) for (let l = 0; l < N; l++) for (let x = 0; x < d * d; x++) {
    const want = k === l ? mod(-Y[k][x], q) : 0;
    if (acc[(k * N + l) * d * d + x] !== want) bad++;
  }
  return { bad, entries: N * N * d * d, points: Z.size };
}

// ---------- figure ----------

const QS = [7, 11, 13, 17, 19, 23, 29, 31];

export function mount(root) {
  const row = el('div', { class: 'fig-row' });
  const left = el('div', { class: 'grow' }), right = el('div', { class: 'side' });
  row.append(left, right); root.append(row);

  const st = { q: 17, s: 4, seed: 5, i: 5, k: 5, pick: 'i' };
  let S = null, res = null, geo = null;

  function rebuild() {
    S = setup(st.q, st.s, st.seed);
    st.i = Math.min(st.i, S.N - 1); st.k = Math.min(st.k, S.N - 1);
    res = { b213: check213(S, st.i), g: check214(S, 2, st.seed * 7 + 1) };
  }

  const cv = makeCanvas(left, { aspect: 1.16, maxHeight: 600, draw });

  function draw(ctx, w, h) {
    const P = palette();
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, w, h);
    const { q, s } = S;
    const stripH = 74;
    const cs = Math.min((w - 30) / q, (h - stripH - 34) / q);
    if (!(cs > 2)) return;
    const ox = (w - cs * q) / 2 + 8, oy = 8;
    geo = { ox, oy, cs };
    const Y = (y) => oy + (q - 1 - y) * cs; // y up
    const line = S.lines[st.i];
    const onLine = new Map(line.pts.map((z, t) => [z[0] * q + z[1], t]));
    // cells: f_i values
    for (let x = 0; x < q; x++) for (let y = 0; y < q; y++) {
      const v = S.f(st.i, [x, y]);
      const px = ox + x * cs, py = Y(y);
      if (v) { ctx.fillStyle = P.dark ? '#2a2f3d' : '#e8ebf3'; ctx.fillRect(px + 0.5, py + 0.5, cs - 1, cs - 1); }
      if (onLine.has(x * q + y)) { ctx.strokeStyle = P.accent2; ctx.lineWidth = 2; ctx.strokeRect(px + 1.5, py + 1.5, cs - 3, cs - 3); }
      if (v && cs >= 15) {
        ctx.fillStyle = v === 1 ? P.accent : P.muted;
        ctx.font = `${v === 1 ? 700 : 500} ${Math.min(10.5, cs * 0.45)}px Inter, system-ui, sans-serif`;
        ctx.textAlign = 'center'; ctx.fillText(String(v), px + cs / 2, py + cs / 2 + 3.5);
      }
    }
    ctx.textAlign = 'left';
    // S² grid of marks
    for (let j = 0; j < S.N; j++) {
      const [mx, my] = S.lines[j].a;
      const px = ox + mx * cs + cs / 2, py = Y(my) + cs / 2;
      const isI = j === st.i, isK = j === st.k && st.k !== st.i;
      ctx.strokeStyle = isI ? P.accent : isK ? P.accent4 : P.ink; ctx.lineWidth = isI || isK ? 2.5 : 1.2;
      const rr = isI || isK ? cs * 0.42 : cs * 0.18;
      ctx.beginPath(); ctx.arc(px, py, rr, 0, 2 * Math.PI); ctx.stroke();
    }
    // axis ticks
    ctx.fillStyle = P.muted; ctx.font = '9.5px Inter, system-ui, sans-serif';
    for (let x = 0; x < q; x += q > 20 ? 5 : 2) { ctx.textAlign = 'center'; ctx.fillText(String(x), ox + x * cs + cs / 2, oy + q * cs + 11); }
    ctx.textAlign = 'right';
    for (let y = 0; y < q; y += q > 20 ? 5 : 2) ctx.fillText(String(y), ox - 3, Y(y) + cs / 2 + 3);
    ctx.textAlign = 'left';
    // strip: values of f_i f_k along ℓ_i, t = 0 … q−1, with the running sum
    const sy = oy + q * cs + 34, bw = Math.min(30, (w - 20) / q);
    const sx = (w - bw * q) / 2;
    let run = 0;
    ctx.font = '9.5px Inter, system-ui, sans-serif'; ctx.fillStyle = P.muted;
    ctx.fillText(`f${st.i + 1}·f${st.k + 1} along ℓ${st.i + 1}  (t = 0 is the mark)`, sx, sy - 3);
    line.pts.forEach((z, t) => {
      const v = mod(S.f(st.i, z) * S.f(st.k, z), q);
      run = mod(run + v, q);
      const x = sx + t * bw;
      ctx.fillStyle = t === 0 ? rgba(P.accent, 0.18) : P.panel2;
      ctx.fillRect(x + 1, sy + 2, bw - 2, 20);
      ctx.fillStyle = v ? P.ink : P.muted; ctx.textAlign = 'center'; ctx.font = `${v ? 600 : 400} ${Math.min(11, bw * 0.42)}px Inter, system-ui, sans-serif`;
      ctx.fillText(String(v), x + bw / 2, sy + 16);
      ctx.fillStyle = P.muted; ctx.font = `${Math.min(9.5, bw * 0.36)}px Inter, system-ui, sans-serif`;
      ctx.fillText(String(run), x + bw / 2, sy + 34);
    });
    ctx.textAlign = 'left'; ctx.fillStyle = P.muted;
    ctx.fillText('running sum mod q', sx, sy + 48);
    updateReadout();
  }

  const ctl = controls(right); ctl.style.marginTop = '0';
  const qSel = el('select', { 'aria-label': 'prime q' });
  for (const p of QS) qSel.append(el('option', { value: p }, String(p)));
  ctl.append(el('label', { class: 'ctl' }, 'q =', qSel));
  const sS = slider(ctl, { label: '|S|', min: 2, max: 12, step: 1, value: st.s, fmt: (v) => v, oninput: (v) => { st.s = v; rebuild(); cv.redraw(); } });
  const ctl2 = controls(right); ctl2.style.marginTop = '.4rem';
  segmented(ctl2, [['i', 'click picks line i'], ['k', 'picks k']], 'i', (k) => { st.pick = k; });
  button(ctl2, 'New directions', () => { st.seed++; rebuild(); cv.redraw(); });
  const pre = controls(right); pre.style.marginTop = '.4rem';
  const setQS = (q, s) => { st.q = q; st.s = s; qSel.value = q; sS.input.max = Math.min(q, 12); sS.set(s); rebuild(); cv.redraw(); };
  button(pre, 'q = 17, |S| = 4', () => setQS(17, 4));
  button(pre, 'q = 31, |S| = 8', () => setQS(31, 8));
  button(pre, 'degree too high: |S| = 5', () => setQS(17, 5));
  qSel.addEventListener('change', () => { const q = +qSel.value; setQS(q, Math.min(st.s, Math.min(q, 12))); });

  const ro = el('div', { class: 'readout', style: 'margin-top:.7rem' });
  right.append(ro);
  right.append(el('div', { class: 'hint' }, 'Circles: the marks S². Numbers: the values of f_i (blank = 0). Orange outline: the line ℓ_i.'));

  function updateReadout() {
    const { q, s, N } = S;
    const deg = 4 * (s - 1), okDeg = deg < q - 1;
    const mark = (ok) => (ok ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>');
    const full = lineSum(S, st.i, st.i, st.i, false), punct = lineSum(S, st.i, st.i, st.i, true);
    const fk = lineSum(S, st.i, st.i, st.k, true);
    ro.innerHTML = `<table>
      <tr><td class="k">labels N = |S|²</td><td>${N}, on ${q}² points</td></tr>
      <tr><td class="k">deg f_k f_l on a line</td><td>≤ ${deg} vs q−1 = ${q - 1} ${mark(okDeg)}</td></tr>
      </table><hr><table>
      <tr><td>Σ over ℓ${st.i + 1} of f${st.i + 1}²</td><td>${full} ${mark(full === 0)}</td></tr>
      <tr><td>…without the mark</td><td>${punct === q - 1 ? '−1' : punct} ${mark(punct === q - 1)}</td></tr>
      ${st.k !== st.i ? `<tr><td>…of f${st.i + 1}f${st.k + 1}, without the mark</td><td>${fk} ${mark(fk === 0)}</td></tr>` : ''}
      <tr><td>(2.13) on ℓ${st.i + 1}: all ${N * N} entries</td><td>${res.b213 ? `<span class="bad">${res.b213} fail</span>` : '<span class="ok">✓</span>'}</td></tr>
      <tr><td>(2.14), random 2×2 blocks Y_i</td><td>${res.g.bad ? `<span class="bad">${res.g.bad} of ${res.g.entries} fail</span>` : `<span class="ok">${res.g.entries} entries ✓</span>`}</td></tr>
      </table>`;
  }

  pointer(cv.wrap, {
    down(x, y) {
      if (!geo) return false;
      const { ox, oy, cs } = geo, q = S.q;
      const cx = Math.floor((x - ox) / cs), cy = q - 1 - Math.floor((y - oy) / cs);
      if (cx < 0 || cy < 0 || cx >= q || cy >= q) return false;
      if (cx >= S.s || cy >= S.s) return false;
      const j = cy * S.s + cx;
      if (st.pick === 'i') { st.i = j; st.k = j; res.b213 = check213(S, st.i); } else st.k = j;
      cv.redraw();
      return false;
    },
  });

  qSel.value = st.q; sS.input.max = Math.min(st.q, 12);
  rebuild();
  onTheme(() => cv.redraw());
}
