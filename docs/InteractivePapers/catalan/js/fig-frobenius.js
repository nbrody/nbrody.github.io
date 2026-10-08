// Figure 4 — §4: palindromic bases, the Kronecker factorization (60), and the certificate of Table 1.

import { el, controls, slider, button, segmented, makeCanvas, palette, onTheme, pointer, rgba } from './common.js';
import { palindromicMatrices, kroneckerMatrix, detModP, powmod, modInv, certificateMatrix, certificatePivots } from './catmath.js';
import { TABLE1, TABLE1_SWAPS } from './certdata.js';

const K = 3; // stand-in block size

export function factorizationCheck(p, B0, B1) {
  const { a, b, identityOk, diagOk } = palindromicMatrices(p);
  const L = kroneckerMatrix(a, b, B0, B1, p);
  const lhs = detModP(L, p);
  const comb = (s) => B0.map((r, i) => r.map((x, j) => ((x + s * B1[i][j]) % p + p) % p));
  const d0 = detModP(B0, p), dp = detModP(comb(1), p), dm = detModP(comb(-1), p), da = detModP(a, p);
  const rhs = powmod(da, K, p) * d0 % p * powmod(dp, (p - 1) / 2, p) % p * powmod(dm, (p - 1) / 2, p) % p;
  return { a, b, L, lhs, rhs, d0, dp, dm, da, identityOk, diagOk, daExpected: modInv(powmod(2, p * (p - 1) / 2, p), p) };
}

export function mount(root) {
  const PRIMES = [5, 7, 11, 13, 17, 19, 23];
  const st = { p: 7, seed: 11, B0: null, B1: null, q: 101, cert: null, hoverC: null };
  let rng = st.seed;
  const rnd = (p) => (rng = (rng * 48271) % 2147483647) % p;
  const randBlock = (p) => Array.from({ length: K }, () => Array.from({ length: K }, () => rnd(p)));
  function reroll(kind = 'generic') {
    const p = st.p;
    for (let tries = 0; tries < 200; tries++) {
      const B0 = randBlock(p), B1 = randBlock(p);
      if (kind === 'sum') { // force B0 + B1 singular
        const S = randBlock(p); S[2] = S[0].map((x, j) => (x + S[1][j]) % p);
        for (let i = 0; i < K; i++) for (let j = 0; j < K; j++) B1[i][j] = ((S[i][j] - B0[i][j]) % p + p) % p;
      }
      if (kind === 'b0') B0[2] = B0[0].map((x, j) => (2 * x + B0[1][j]) % p);
      const chk = factorizationCheck(p, B0, B1);
      const want = kind === 'generic' ? chk.d0 && chk.dp && chk.dm : kind === 'sum' ? chk.d0 && !chk.dp && chk.dm : !chk.d0 && chk.dp && chk.dm;
      if (want) { st.B0 = B0; st.B1 = B1; return; }
    }
  }

  const row = el('div', { class: 'fig-row' });
  const pA = el('div', { class: 'grow', style: 'flex: 1 1 210px' });
  const pB = el('div', { class: 'grow', style: 'flex: 1 1 230px' });
  const pC = el('div', { class: 'grow', style: 'flex: 1 1 260px' });
  row.append(pA, pB, pC); root.append(row);
  pA.append(el('div', { class: 'hint', style: 'margin-bottom:.2rem' }, 'a and b = aΠ over 𝔽ₚ'));
  const cvA = makeCanvas(pA, { aspect: 0.55, maxHeight: 220, minHeight: 120, draw: drawA });
  const roA = el('div', { class: 'readout', style: 'margin-top:.5rem' }); pA.append(roA);
  pB.append(el('div', { class: 'hint', style: 'margin-bottom:.2rem' }, 'ℒₚ = aᵀ ⊗ B₀ + bᵀ ⊗ B₁ (3 × 3 stand-in blocks)'));
  const cvB = makeCanvas(pB, { aspect: 1, maxHeight: 260, minHeight: 160, draw: drawB });
  const roB = el('div', { class: 'readout', style: 'margin-top:.5rem' }); pB.append(roB);
  pC.append(el('div', { class: 'hint', style: 'margin-bottom:.2rem' }, 'The real certificate: pivots of B₀ + σB₁ (48 each)'));
  const cvC = makeCanvas(pC, { aspect: 0.42, maxHeight: 170, minHeight: 110, draw: drawC });
  const roC = el('div', { class: 'readout', style: 'margin-top:.5rem' }); pC.append(roC);

  const ctl = controls(root);
  slider(ctl, { label: 'p', min: 0, max: PRIMES.length - 1, step: 1, value: PRIMES.indexOf(st.p), fmt: (k) => PRIMES[k], oninput: (k) => { st.p = PRIMES[k]; reroll(); redrawAB(); } });
  button(ctl, 'reroll blocks', () => { reroll(); redrawAB(); });
  button(ctl, 'make B₀ + B₁ singular', () => { reroll('sum'); redrawAB(); });
  button(ctl, 'make B₀ singular', () => { reroll('b0'); redrawAB(); });
  const ctl2 = controls(root);
  ctl2.append(el('span', {}, 'certificate modulus'));
  segmented(ctl2, [[101, '101 (paper)'], [103, '103'], [107, '107'], [113, '113'], [127, '127']], st.q, (q) => { st.q = q; runCert(); });

  let chk = null;
  function redrawAB() { chk = factorizationCheck(st.p, st.B0, st.B1); cvA.redraw(); cvB.redraw(); updAB(); }

  function drawA(ctx, w, h) {
    const P = palette();
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, w, h);
    if (!chk) return;
    const p = st.p, gap = 14, size = Math.min((w - gap) / 2, h - 14), cs = size / p;
    const draw1 = (M, x0, color, label) => {
      for (let l = 0; l < p; l++) for (let i = 0; i < p; i++) {
        const v = M[l][i];
        ctx.fillStyle = v ? rgba(color, 0.35 + 0.65 * v / p) : P.panel2;
        ctx.fillRect(x0 + i * cs, 12 + l * cs, Math.ceil(cs) - (cs > 6 ? 0.6 : 0), Math.ceil(cs) - (cs > 6 ? 0.6 : 0));
      }
      ctx.fillStyle = P.ink; ctx.font = '600 10.5px Inter, system-ui, sans-serif'; ctx.fillText(label, x0, 9);
    };
    draw1(chk.a, 0, P.accent, 'a  (rows ℓ, columns i)');
    draw1(chk.b, size + gap, P.accent4, 'b = aΠ');
  }
  function drawB(ctx, w, h) {
    const P = palette();
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, w, h);
    if (!chk) return;
    const L = chk.L, n = L.length, size = Math.min(w, h) - 2, cs = size / n;
    const p = st.p;
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const i = Math.floor(r / K), l = Math.floor(c / K);
      const ia = chk.a[l][i] !== 0, ib = chk.b[l][i] !== 0;
      const v = L[r][c];
      if (!v) { ctx.fillStyle = (ia || ib) ? rgba(P.muted, 0.12) : P.panel2; }
      else ctx.fillStyle = rgba(ia && ib ? P.accent2 : ia ? P.accent : P.accent4, 0.35 + 0.6 * v / p);
      ctx.fillRect(1 + c * cs, 1 + r * cs, Math.ceil(cs), Math.ceil(cs));
    }
    ctx.strokeStyle = rgba(P.ink, 0.25); ctx.lineWidth = 1;
    for (let k = 0; k <= p; k++) {
      ctx.beginPath(); ctx.moveTo(1 + k * K * cs, 1); ctx.lineTo(1 + k * K * cs, 1 + size); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(1, 1 + k * K * cs); ctx.lineTo(1 + size, 1 + k * K * cs); ctx.stroke();
    }
  }
  function updAB() {
    const c = chk, p = st.p;
    roA.innerHTML = `<table>
      <tr><td class="k">lower triangular, a<sub>ii</sub> = 2<sup>−i</sup></td><td><span class="${c.diagOk ? 'ok' : 'bad'}">${c.diagOk ? '✓' : '✗'}</span></td></tr>
      <tr><td class="k">identity (51), all i &lt; ${p}</td><td><span class="${c.identityOk ? 'ok' : 'bad'}">${c.identityOk ? '✓' : '✗'}</span></td></tr>
      <tr><td class="k">det a vs 2<sup>−p(p−1)/2</sup></td><td>${c.da} = ${c.daExpected} <span class="${c.da === c.daExpected ? 'ok' : 'bad'}">${c.da === c.daExpected ? '✓' : '✗'}</span></td></tr></table>`;
    const eq = c.lhs === c.rhs;
    roB.innerHTML = `<table>
      <tr><td class="k">det B₀, det(B₀+B₁), det(B₀−B₁)</td><td>${c.d0}, ${c.dp}, ${c.dm}</td></tr>
      <tr><td class="k">det ℒₚ by elimination (${K * p}×${K * p})</td><td>${c.lhs}</td></tr>
      <tr><td class="k">product formula (60)</td><td>${c.rhs} <span class="${eq ? 'ok' : 'bad'}">${eq ? '✓ equal' : '✗'}</span></td></tr>
      <tr><td class="k">ℒₚ invertible?</td><td><span class="${c.lhs ? 'ok' : 'bad'}">${c.lhs ? 'yes' : 'no: a factor vanished'}</span></td></tr></table>`;
  }

  function runCert() {
    st.cert = null; cvC.redraw(); roC.innerHTML = '<span class="k">building 𝓑 over 𝔽<sub>' + st.q + '</sub>…</span>';
    setTimeout(() => {
      const t0 = performance.now();
      const { B } = certificateMatrix(st.q);
      const res = [0, 1, -1].map((s) => ({ s, ...certificatePivots(B, s, st.q) }));
      st.cert = { res, ms: performance.now() - t0, q: st.q };
      cvC.redraw(); updC();
    }, 20);
  }
  let geoC = null;
  function drawC(ctx, w, h) {
    const P = palette();
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, w, h);
    if (!st.cert) { ctx.fillStyle = P.muted; ctx.font = '11px Inter, system-ui, sans-serif'; ctx.fillText('computing…', 8, 20); return; }
    const padL = 40, cw = (w - padL - 4) / 48, rh = Math.min(26, (h - 16) / 3);
    geoC = { padL, cw, rh };
    ctx.font = '10px Inter, system-ui, sans-serif';
    st.cert.res.forEach(({ s, pivots, swaps }, k) => {
      const y = 4 + k * (rh + 4);
      ctx.fillStyle = P.muted; ctx.fillText(`σ = ${s > 0 ? '+1' : s}`, 2, y + rh / 2 + 3);
      pivots.forEach((v, i) => {
        const match = st.cert.q === 101 ? v === TABLE1[s][i] : v !== 0;
        ctx.fillStyle = v === 0 ? P.accent2 : rgba(match ? P.accent3 : P.accent2, 0.3 + 0.7 * v / st.cert.q);
        ctx.fillRect(padL + i * cw, y, Math.max(1, cw - 0.8), rh);
      });
      ctx.fillStyle = P.ink;
      for (const [a] of swaps) { ctx.beginPath(); ctx.moveTo(padL + (a + 0.5) * cw, y + rh + 3); ctx.lineTo(padL + (a + 0.5) * cw - 3, y + rh + 7); ctx.lineTo(padL + (a + 0.5) * cw + 3, y + rh + 7); ctx.fill(); }
      if (st.hoverC && st.hoverC[0] === k) { ctx.strokeStyle = P.ink; ctx.lineWidth = 1.5; ctx.strokeRect(padL + st.hoverC[1] * cw, y, cw, rh); }
    });
  }
  function updC() {
    const c = st.cert; if (!c) return;
    let match = 0, nonzero = 0, swapOk = true;
    for (const { s, pivots, swaps } of c.res) {
      pivots.forEach((v, i) => { if (v) nonzero++; if (v === TABLE1[s][i]) match++; });
      if (JSON.stringify(swaps) !== JSON.stringify(TABLE1_SWAPS[s])) swapOk = false;
    }
    const hv = st.hoverC ? (() => { const r = c.res[st.hoverC[0]]; const i = st.hoverC[1]; return `<tr><td class="k">σ = ${r.s}, pivot ${i}</td><td>${r.pivots[i]}${c.q === 101 ? ` (Table 1: ${TABLE1[r.s][i]})` : ''}</td></tr>`; })() : '';
    roC.innerHTML = `<table>
      <tr><td class="k">𝓑 (49 × 48) built over 𝔽<sub>${c.q}</sub></td><td>${c.ms.toFixed(0)} ms</td></tr>
      <tr><td class="k">nonzero pivots</td><td>${nonzero} / 144 <span class="${nonzero === 144 ? 'ok' : 'bad'}">${nonzero === 144 ? '✓ invertible' : '✗'}</span></td></tr>
      ${c.q === 101 ? `<tr><td class="k">pivots equal to Table 1</td><td>${match} / 144 <span class="${match === 144 ? 'ok' : 'bad'}">${match === 144 ? '✓' : '✗'}</span></td></tr>
      <tr><td class="k">row swaps (σ = 1): (30,31), (45,46)</td><td><span class="${swapOk ? 'ok' : 'bad'}">${swapOk ? '✓' : '✗'}</span></td></tr>` : `<tr><td class="k">swaps</td><td>${c.res.map((r) => r.swaps.map((x) => `(${x})`).join(' ') || '—').join(' | ')}</td></tr>`}
      ${hv}</table>`;
  }
  pointer(cvC.wrap, {
    down() { return false; },
    hover(x, y) {
      if (!geoC) return;
      const i = Math.floor((x - geoC.padL) / geoC.cw), k = Math.floor((y - 4) / (geoC.rh + 4));
      const nh = i >= 0 && i < 48 && k >= 0 && k < 3 ? [k, i] : null;
      if (String(nh) !== String(st.hoverC)) { st.hoverC = nh; cvC.redraw(); updC(); }
    },
  });

  reroll(); redrawAB(); runCert();
  onTheme(() => { cvA.redraw(); cvB.redraw(); cvC.redraw(); });
}
