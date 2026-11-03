// Figure 2 — the free group Λ(2) on its (p+1)-regular tree, and Lemma 3.1's unique factorization.
import { el, makeCanvas, labelLayer, setTex, chips, button, palette, onTheme, rgba, isDark } from './common.js';
import { generators, inverseIndex, qmul, qconj, qnorm, wordToQuaternion, isqrt, sigma } from './lps.js';
import { quatTex, genTex } from './fig-generators.js';

export const TREE_CHOICES = [[5, 3], [13, 2]]; // [p, depth drawn]

// ───────────────────────── pure math (node-testable) ─────────────────────────

/**
 * Radial layout of the ball of radius `depth` in the Cayley graph of Λ(2) with edges w — w·s.
 * The path from the root to a vertex spells its reduced word, left to right.
 * Positions are in the unit disk and depend only on (p, depth), never on a current word.
 */
export function treeLayout(p, depth) {
  const S = generators(p), k = S.length, inv = inverseIndex(S);
  const nodes = [{ word: [], parent: -1, depth: 0, lo: 0, hi: 2 * Math.PI, x: 0, y: 0, letter: -1 }];
  const index = new Map([['', 0]]);
  for (let h = 0; h < nodes.length; h++) {
    const u = nodes[h];
    if (u.depth === depth) continue;
    const last = u.word.length ? u.word[u.word.length - 1] : -1;
    const letters = [];
    for (let s = 0; s < k; s++) if (last < 0 || s !== inv[last]) letters.push(s);
    const span = (u.hi - u.lo) / letters.length;
    letters.forEach((s, t) => {
      const lo = u.lo + t * span, hi = lo + span, th = (lo + hi) / 2 - Math.PI / 2;
      const r = Math.pow((u.depth + 1) / depth, 0.92);
      const node = { word: [...u.word, s], parent: h, depth: u.depth + 1, lo, hi, x: r * Math.cos(th), y: r * Math.sin(th), letter: s };
      index.set(node.word.join(','), nodes.length);
      nodes.push(node);
    });
  }
  return { p, depth, S, k, inv, nodes, index };
}

/**
 * Lemma 3.1 run backwards on β (N(β) = p^k, β ≡ 1 mod 2): divide out p while possible, then peel
 * one generator off the right at a time. Each row records how many generators divide on the right.
 */
export function peelSteps(beta, p, S = generators(p)) {
  const rows = [];
  let a = beta.slice(), n = qnorm(a), r = 0;
  const word = [];
  const div = (x) => x.every((c) => c % p === 0);
  while (n > 1) {
    if (div(a)) {
      rows.push({ before: a, norm: n, kind: 'p' });
      a = a.map((c) => c / p + 0); n /= p * p; r++;
      continue;
    }
    const hits = [];
    for (let s = 0; s < S.length; s++) if (div(qmul(a, qconj(S[s])))) hits.push(s);
    rows.push({ before: a, norm: n, kind: 's', hits });
    if (!hits.length) return { rows, ok: false, word, r };
    a = qmul(a, qconj(S[hits[0]])).map((c) => c / p + 0);
    n /= p;
    word.unshift(hits[0]);
  }
  const ok = n === 1 && Math.abs(a[0]) === 1 && !a[1] && !a[2] && !a[3];
  return { rows, ok, sign: a[0], r, word, unique: rows.every((x) => x.kind === 'p' || x.hits.length === 1) };
}

/** All α ≡ 1 (mod 2) — a0 odd, a1, a2, a3 even — with N(α) = N (N odd). */
export function oddQuaternionsOfNorm(N) {
  const out = [], b = isqrt(N);
  const b2 = b - (b % 2);
  for (let a1 = -b2; a1 <= b2; a1 += 2) for (let a2 = -b2; a2 <= b2; a2 += 2) for (let a3 = -b2; a3 <= b2; a3 += 2) {
    const r = N - a1 * a1 - a2 * a2 - a3 * a3;
    if (r < 0) continue;
    const a0 = isqrt(r);
    if (a0 * a0 !== r || a0 % 2 === 0) continue;
    out.push([a0, a1, a2, a3], [-a0, a1, a2, a3]);
  }
  return out;
}

/** Corollary 3.2's count of expressions ±p^r R_m with 2r + m = k: 2(Σ_{0≤r<k/2}(p+1)p^{k−2r−1} + δ(k)). */
export function expressionCount(p, k) {
  let s = k % 2 === 0 ? 1 : 0;
  for (let r = 0; 2 * r < k; r++) s += (p + 1) * Math.pow(p, k - 2 * r - 1);
  return 2 * s;
}

/** For k = 1..K: enumerated count, expression count, and how many factor with a unique divisor at every step. */
export function countingCheck(p, K) {
  const S = generators(p), rows = [];
  for (let k = 1; k <= K; k++) {
    const N = Math.pow(p, k), all = oddQuaternionsOfNorm(N);
    let unique = 0;
    for (const a of all) { const f = peelSteps(a, p, S); if (f.ok && f.unique) unique++; }
    rows.push({ k, N, count: all.length, expressions: expressionCount(p, k), sigma2: 2 * sigma(N), unique });
  }
  return rows;
}

export const wordTex = (w) => (w.length ? w.map(genTex).join('') : 'e');

// ───────────────────────── figure ─────────────────────────

const PAIR_HUES = [28, 268, 52, 330, 108, 228, 2];

export function mount(root) {
  const row = el('div', { class: 'fig-row' });
  const left = el('div', { class: 'grow' });
  const right = el('div', { class: 'side' });
  row.append(left, right);
  root.append(row);

  const st = { p: 5, depth: 3, L: null, beta: null, f: null, cur: 0, hover: -1, reveal: Infinity, checks: new Map() };

  left.append(el('p', { class: 'panel-hint' }, 'Click a vertex to walk there'));
  const cv = makeCanvas(left, { aspect: 1, maxHeight: 560, draw });
  const labels = labelLayer(cv.wrap);

  const pChips = chips(right, {
    label: 'The prime $p$',
    options: TREE_CHOICES.map(([p, d]) => [p, `$p=${p}$, radius $${d}$`]),
    value: st.p,
    onchange: (p) => { setP(p); },
  });
  pChips.el.style.marginBottom = '0.6rem';
  const word = el('div', { class: 'readout', style: 'margin-bottom:0.6rem' });
  right.append(word);
  const btns = el('div', { class: 'btn-row', style: 'margin-bottom:0.5rem' });
  right.append(btns);
  button(btns, 'Factor a random $\\beta$', () => { setBeta(randomBeta(), true); });
  button(btns, '$\\beta\\mapsto -p\\,\\beta$', () => { setBeta(st.beta.map((c) => -st.p * c), true); }, 'ghost');
  const fact = el('div', { class: 'readout', style: 'margin-bottom:0.6rem' });
  const count = el('div', { class: 'readout' });
  right.append(fact, count);

  let seed = 20260 + 1;
  const rnd = (m) => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed % m; };
  function randomBeta() {
    // a random α ≡ 1 (mod 2) of norm p^depth: its word has length depth or depth − 2, … — inside the drawn ball
    const all = oddQuaternionsOfNorm(Math.pow(st.p, st.depth));
    return all[rnd(all.length)];
  }

  function setP(p) {
    st.p = p;
    st.depth = TREE_CHOICES.find((c) => c[0] === p)[1];
    st.L = treeLayout(p, st.depth);
    st.hover = -1;
    // default: −p · (a reduced word of full length), so the factorization shows a sign, a power of p and the word
    const w = st.L.nodes.find((n) => n.depth === st.depth && n.word[0] === 0 && n.word[1] === 3) || st.L.nodes[st.L.nodes.length - 1];
    setBeta(wordToQuaternion(w.word, st.L.S).map((c) => -st.p * c), false);
    renderCount();
  }

  function setBeta(beta, animate) {
    st.beta = beta;
    st.f = peelSteps(beta, st.p, st.L.S);
    st.cur = st.f.ok ? (st.L.index.get(st.f.word.join(',')) ?? 0) : 0;
    renderWord();
    renderFactor(animate);
    cv.redraw();
  }

  function renderWord() {
    const n = st.L.nodes[st.cur], a = wordToQuaternion(n.word, st.L.S), m = n.word.length;
    setTex(word, `<div>vertex $w = ${wordTex(n.word)}$ &nbsp;<span class="dim">(length $${m}$)</span></div>
      <div>$\\alpha_w = ${quatTex(a)}$</div>
      <div>$N(\\alpha_w) = ${st.p}^{${m}} = ${qnorm(a).toLocaleString('en-US').replace(/,/g, '{,}')}$, &nbsp;$\\alpha_w\\equiv 1 \\pmod 2$ ${a[0] % 2 !== 0 && a.slice(1).every((c) => c % 2 === 0) ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>'}</div>`);
  }

  let revealTimer = 0;
  function renderFactor(animate) {
    const f = st.f, p = st.p, k = Math.round(Math.log(qnorm(st.beta)) / Math.log(p));
    const rows = f.rows.map((r, t) => {
      const what = r.kind === 'p'
        ? `$${p}$ divides every coordinate: divide by $${p}$`
        : r.hits.length === 1
          ? `exactly one generator divides on the right: $${genTex(r.hits[0])}$`
          : `<span class="bad">$${r.hits.length}$ generators divide on the right</span>${r.hits.length ? `: $${r.hits.map(genTex).join(',\\ ')}$` : ''}`;
      const mark = r.kind === 'p' ? '' : (r.hits.length === 1 ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>');
      return `<tr class="step" data-t="${t}"><td>$${quatTex(r.before)}$<br><span class="dim">${what}</span></td><td>${mark}</td></tr>`;
    }).join('');
    const sign = f.sign === -1 ? '-' : '';
    const pr = f.r ? `${p}${f.r > 1 ? `^{${f.r}}` : ''}\\cdot ` : '';
    const result = f.ok
      ? `$\\beta = ${sign}${pr}${f.word.length ? wordTex(f.word) : '1'}$ ${f.unique ? '<span class="ok">✓ unique at every step</span>' : '<span class="bad">not unique</span>'}`
      : '<span class="bad">did not factor</span>';
    setTex(fact, `<div style="margin-bottom:0.3rem">factor $\\beta = ${quatTex(st.beta)}$, &nbsp;$N(\\beta) = ${p}^{${k}}$</div>
      <table>${rows}<tr class="sep step" data-t="${f.rows.length}"><td colspan="2">${result}</td></tr></table>`).then(() => {
      clearTimeout(revealTimer);
      const steps = [...fact.querySelectorAll('tr.step')];
      if (!animate) { st.reveal = Infinity; cv.redraw(); return; }
      steps.forEach((tr) => { tr.style.opacity = '0.12'; tr.style.transition = 'opacity .25s ease'; });
      st.reveal = 0; cv.redraw();
      let t = 0;
      const next = () => {
        if (t < steps.length) steps[t].style.opacity = '1';
        t++;
        if (t >= steps.length) { st.reveal = Infinity; cv.redraw(); return; }
        revealTimer = setTimeout(next, 520);
      };
      revealTimer = setTimeout(next, 200);
    });
  }

  function renderCount() {
    const p = st.p, K = p === 5 ? 4 : 3;
    const key = p + ':' + K;
    setTex(count, `<div class="dim">counting check (Lemma 3.1) — computing…</div>`);
    setTimeout(() => {
      if (!st.checks.has(key)) st.checks.set(key, countingCheck(p, K));
      if (st.p !== p) return;
      const rows = st.checks.get(key);
      const allOk = rows.every((r) => r.count === r.expressions && r.unique === r.count);
      setTex(count, `<div style="margin-bottom:0.25rem"><b>Counting check</b> <span class="dim">Lemma 3.1</span></div>
        <table><tr><th>$k$</th><th class="num">$\\#\\{\\alpha\\equiv1\\ (2): N(\\alpha)=${p}^k\\}$</th><th class="num">$\\#\\{\\pm p^r R_m\\}$</th><th></th></tr>
        ${rows.map((r) => `<tr><td>$${r.k}$</td><td class="num">$${r.count}$</td><td class="num">$${r.expressions}$</td><td>${r.count === r.expressions && r.unique === r.count ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>'}</td></tr>`).join('')}
        </table>
        <div class="hint">Both sides equal $2\\sum_{d\\mid p^k}d$. Every one of these quaternions factors, with exactly one generator dividing at each step. ${allOk ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>'}</div>`);
    }, 30);
  }

  // ── drawing ──
  function geom(w, h) {
    const R = 0.44 * Math.min(w, h);
    return { cx: w / 2, cy: h / 2, R };
  }
  function pairColor(j) {
    const dark = isDark();
    return `hsl(${PAIR_HUES[j % PAIR_HUES.length]}, ${dark ? 62 : 58}%, ${dark ? 66 : 44}%)`;
  }

  function draw(ctx, w, h) {
    if (!st.L) return;
    const C = palette(), { cx, cy, R } = geom(w, h), L = st.L;
    const X = (n) => cx + R * n.x, Y = (n) => cy + R * n.y;
    const nodes = L.nodes, lab = [];
    const pathSet = new Set();
    const showPath = st.reveal === Infinity;
    if (showPath) for (let v = st.cur; v >= 0; v = nodes[v].parent) pathSet.add(v);

    // stubs beyond the drawn ball: the tree goes on
    ctx.strokeStyle = rgba(C.tree, 0.35);
    ctx.lineWidth = 1;
    for (const n of nodes) {
      if (n.depth !== L.depth) continue;
      const th = Math.atan2(n.y, n.x), len = R * 0.05;
      for (let t = 0; t < L.k - 1; t++) {
        const a = th + ((t + 0.5) / (L.k - 1) - 0.5) * (n.hi - n.lo) * 0.9;
        ctx.beginPath(); ctx.moveTo(X(n), Y(n)); ctx.lineTo(X(n) + len * Math.cos(a), Y(n) + len * Math.sin(a)); ctx.stroke();
      }
    }
    // edges coloured by generator pair; α_j solid, ᾱ_j dashed
    for (let v = 1; v < nodes.length; v++) {
      const n = nodes[v], par = nodes[n.parent];
      const fade = n.depth === 1 ? 1 : n.depth === 2 ? 0.8 : 0.6;
      ctx.strokeStyle = pairColor(n.letter >> 1);
      ctx.globalAlpha = showPath && pathSet.size > 1 ? fade * 0.55 : fade;
      ctx.lineWidth = n.depth === 1 ? 2 : n.depth === 2 ? 1.5 : 1.1;
      ctx.setLineDash(n.letter % 2 ? [4, 3] : []);
      ctx.beginPath(); ctx.moveTo(X(par), Y(par)); ctx.lineTo(X(n), Y(n)); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    ctx.setLineDash([]);
    // the current path, in the arithmetic colour
    if (showPath && st.cur > 0) {
      ctx.strokeStyle = C.count;
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      ctx.beginPath();
      for (let v = st.cur; v >= 0; v = nodes[v].parent) {
        const n = nodes[v];
        if (v === st.cur) ctx.moveTo(X(n), Y(n)); else ctx.lineTo(X(n), Y(n));
      }
      ctx.stroke();
    }
    // vertices
    for (let v = 0; v < nodes.length; v++) {
      const n = nodes[v], on = pathSet.has(v);
      const r = v === 0 ? 5 : n.depth === 1 ? 3.6 : n.depth === 2 ? 2.8 : 2.2;
      ctx.fillStyle = on ? C.count : C.tree;
      ctx.beginPath(); ctx.arc(X(n), Y(n), on ? r + 1 : r, 0, 7); ctx.fill();
    }
    if (showPath) {
      const n = nodes[st.cur];
      ctx.strokeStyle = C.count; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(X(n), Y(n), 8, 0, 7); ctx.stroke();
    }
    if (st.hover >= 0) {
      const n = nodes[st.hover];
      ctx.strokeStyle = C.text; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(X(n), Y(n), 7, 0, 7); ctx.stroke();
      if (st.hover !== st.cur) lab.push({ id: 'hover', x: X(n), y: Y(n) - 10, tex: wordTex(n.word), anchor: 'n', cls: 'halo' });
    }
    // letters on the first edges
    for (const n of nodes) {
      if (n.depth !== 1) continue;
      const f = 0.62;
      lab.push({ id: 'l' + n.letter, x: cx + R * n.x * f * 1.0, y: cy + R * n.y * f, tex: genTex(n.letter), anchor: 'c', cls: 'small halo', color: pairColor(n.letter >> 1) });
    }
    lab.push({ id: 'root', x: cx, y: cy + 9, tex: 'e', anchor: 's', cls: 'small halo' });
    if (showPath && st.cur > 0) {
      const n = nodes[st.cur];
      lab.push({ id: 'cur', x: X(n), y: Y(n) - 11, tex: wordTex(n.word), anchor: 'n', cls: 'halo' });
    }
    labels.set(lab);
  }

  function hit(x, y) {
    const { cx, cy, R } = geom(cv.w, cv.h);
    let best = -1, bd = 12 * 12;
    st.L.nodes.forEach((n, v) => {
      const d = (cx + R * n.x - x) ** 2 + (cy + R * n.y - y) ** 2;
      if (d < bd) { bd = d; best = v; }
    });
    return best;
  }
  const pos = (e) => { const r = cv.wrap.getBoundingClientRect(); return [e.clientX - r.left, e.clientY - r.top]; };
  cv.wrap.addEventListener('pointermove', (e) => {
    const v = hit(...pos(e));
    cv.wrap.style.cursor = v >= 0 ? 'pointer' : 'default';
    if (v !== st.hover) { st.hover = v; cv.redraw(); }
  });
  cv.wrap.addEventListener('pointerleave', () => { if (st.hover >= 0) { st.hover = -1; cv.redraw(); } });
  cv.wrap.addEventListener('click', (e) => {
    const v = hit(...pos(e));
    if (v < 0) return;
    setBeta(wordToQuaternion(st.L.nodes[v].word, st.L.S), false);
  });
  // the canvas is not draggable: let touches scroll the page
  cv.wrap.style.touchAction = 'manipulation';

  onTheme(() => cv.redraw());
  setP(st.p);
}
