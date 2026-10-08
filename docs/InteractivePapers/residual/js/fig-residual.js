// Figure 1 — the finite residual, computed: every action of a two-generator group on ≤ n points.

import { el, controls, slider, button, segmented, makeCanvas, palette, onTheme, pointer, rgba } from './common.js';

// ---------- pure math (exported for tests) ----------

export const GROUPS = {
  bs23: { name: 'BS(2,3)', rel: [2, 3], note: 't a² t⁻¹ = a³' },
  bs12: { name: 'BS(1,2)', rel: [1, 2], note: 't a t⁻¹ = a²' },
  free: { name: 'F₂', rel: null, note: 'no relation' },
};

// Words use a, t and capitals for inverses: "taTatATA" = [t a t⁻¹, a].
export function parseWord(s) {
  const out = [];
  for (const ch of s.replace(/\s+/g, '')) {
    if ('aAtT'.includes(ch)) out.push(ch);
    else return null;
  }
  return out;
}

export function freeReduce(w) {
  const out = [];
  for (const ch of w) {
    const last = out[out.length - 1];
    if (last && last !== ch && last.toLowerCase() === ch.toLowerCase()) out.pop();
    else out.push(ch);
  }
  return out;
}

// Word problem in BS(m,k) by Britton's lemma: remove pinches t a^j t⁻¹ (m | j) and t⁻¹ a^j t (k | j).
// Returns the reduced token list; w = 1 in G iff it is empty.
export function brittonReduce(group, w) {
  const rel = GROUPS[group].rel;
  if (!rel) return freeReduce(w);
  const [m, k] = rel;
  let toks = [];
  const push = (tok) => {
    const last = toks[toks.length - 1];
    if (tok.a !== undefined && last && last.a !== undefined) { last.a += tok.a; if (last.a === 0) toks.pop(); }
    else if (tok.a !== 0) toks.push(tok);
  };
  for (const ch of w) push(ch === 'a' ? { a: 1 } : ch === 'A' ? { a: -1 } : { t: ch === 't' ? 1 : -1 });
  for (let changed = true; changed;) {
    changed = false;
    const out = toks; toks = [];
    for (const tok of out) {
      push(tok);
      // look for t^ε a^j t^-ε or t^ε t^-ε at the end
      const n = toks.length;
      if (tok.t === undefined || n < 2) continue;
      let j = 0, open = n - 2;
      if (toks[open].a !== undefined) { j = toks[open].a; open--; }
      if (open < 0 || toks[open].t === undefined || toks[open].t !== -tok.t) continue;
      const eps = toks[open].t, div = eps > 0 ? m : k;
      if (j % div !== 0) continue;
      const nj = eps > 0 ? (j / m) * k : (j / k) * m;
      toks.length = open;
      push({ a: nj });
      changed = true;
    }
  }
  return toks.map((t) => (t.a !== undefined ? 'a' + (t.a === 1 ? '' : '^' + t.a) : t.t > 0 ? 't' : 't⁻¹'));
}

export function partitions(n, max = n) {
  if (n === 0) return [[]];
  const res = [];
  for (let k = Math.min(n, max); k >= 1; k--) for (const p of partitions(n - k, k)) res.push([k, ...p]);
  return res;
}

// One permutation per cycle type (right action: x·a = A[x]).
export function cycleTypeReps(n) {
  return partitions(n).map((p) => {
    const A = new Int8Array(n);
    let x = 0;
    for (const len of p) { for (let i = 0; i < len; i++) A[x + i] = x + ((i + 1) % len); x += len; }
    return A;
  });
}

function power(P, k) {
  const n = P.length, R = new Int8Array(n);
  for (let x = 0; x < n; x++) { let y = x; for (let i = 0; i < k; i++) y = P[y]; R[x] = y; }
  return R;
}
function inverse(P) { const R = new Int8Array(P.length); for (let x = 0; x < P.length; x++) R[P[x]] = x; return R; }

// Lexicographic next permutation in place; false when wrapped.
export function nextPerm(p) {
  let i = p.length - 2;
  while (i >= 0 && p[i] >= p[i + 1]) i--;
  if (i < 0) return false;
  let j = p.length - 1;
  while (p[j] <= p[i]) j--;
  [p[i], p[j]] = [p[j], p[i]];
  for (let a = i + 1, b = p.length - 1; a < b; a++, b--) [p[a], p[b]] = [p[b], p[a]];
  return true;
}

// x · w, letters applied left to right.
export function act(x, w, A, Ai, T, Ti) {
  for (const ch of w) x = ch === 'a' ? A[x] : ch === 'A' ? Ai[x] : ch === 't' ? T[x] : Ti[x];
  return x;
}

export function wordPerm(w, A, T) {
  const Ai = inverse(A), Ti = inverse(T), n = A.length, W = new Int8Array(n);
  for (let x = 0; x < n; x++) W[x] = act(x, w, A, Ai, T, Ti);
  return W;
}

export function isIdentity(P) { for (let x = 0; x < P.length; x++) if (P[x] !== x) return false; return true; }

// Relation t a^m t⁻¹ = a^k for the right action: Am[T[x]] = T[Ak[x]].
export function satisfies(rel, A, T, Am, Ak) {
  if (!rel) return true;
  for (let x = 0; x < A.length; x++) if (Am[T[x]] !== T[Ak[x]]) return false;
  return true;
}

export function transitive(A, T) {
  const n = A.length, seen = new Uint8Array(n), st = [0];
  seen[0] = 1; let c = 1;
  while (st.length) {
    const x = st.pop();
    for (const y of [A[x], T[x]]) if (!seen[y]) { seen[y] = 1; c++; st.push(y); }
    for (let z = 0; z < n; z++) if (!seen[z] && (A[z] === x || T[z] === x)) { seen[z] = 1; c++; st.push(z); }
  }
  return c === n;
}

// Exhaustive search, resumable: yields after `budget` homomorphism checks.
// onHom(A, T, keepsW, n) sees every homomorphism; copy A and T to keep them.
export function* searchHoms(group, w, nmax, onHom = null, budget = 20000) {
  const rel = GROUPS[group].rel;
  const stats = [];
  for (let n = 1; n <= nmax; n++) {
    const st = { n, homs: 0, sep: 0 };
    stats.push(st);
    let work = 0;
    for (const A of cycleTypeReps(n)) {
      const Am = rel ? power(A, rel[0]) : null, Ak = rel ? power(A, rel[1]) : null;
      const Ai = inverse(A);
      const T = new Int8Array(n); for (let i = 0; i < n; i++) T[i] = i;
      do {
        if (++work >= budget) { work = 0; yield { stats, done: false }; }
        if (!satisfies(rel, A, T, Am, Ak)) continue;
        st.homs++;
        const Ti = inverse(T);
        let moved = false;
        for (let x = 0; x < n; x++) if (act(x, w, A, Ai, T, Ti) !== x) { moved = true; break; }
        if (moved) st.sep++;
        if (onHom) onHom(A, T, moved, n);
      } while (nextPerm(T));
    }
  }
  yield { stats, done: true };
}

// ---------- figure ----------

const PRESETS = {
  bs23: [['[tat⁻¹, a]', 'taTatATA'], ['a', 'a'], ['[t, a]', 'taTA'], ['relator', 'taaTAAA']],
  bs12: [['[tat⁻¹, a]', 'taTatATA'], ['[a, t]', 'atAT'], ['a', 'a']],
  free: [['[a, t]', 'atAT'], ['a²t²', 'aatt'], ['[[a,t],a]', 'atATataTAA']],
};

export function mount(root) {
  const row = el('div', { class: 'fig-row' });
  const left = el('div', { class: 'grow' }), right = el('div', { class: 'side' });
  row.append(left, right); root.append(row);

  const st = {
    group: 'bs23', word: 'taTatATA', nmax: 7,
    stats: [], samples: [], shown: 0, running: false, gen: null, start: 0, err: '',
  };

  const cv = makeCanvas(left, { aspect: 0.86, maxHeight: 520, draw });
  let layout = null;

  function current() { return st.samples[st.shown] || null; }

  function draw(ctx, w, h) {
    const P = palette();
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, w, h);
    const hom = current();
    ctx.font = '11px Inter, system-ui, sans-serif';
    if (!hom) {
      ctx.fillStyle = P.muted; ctx.textAlign = 'center';
      ctx.fillText(st.running ? 'searching…' : 'no homomorphism to show', w / 2, h / 2);
      ctx.textAlign = 'left';
      return;
    }
    const { A, T, n } = hom;
    const cx = w / 2, cy = h / 2 + 6, R = Math.min(w, h) * 0.36;
    const pos = [];
    for (let x = 0; x < n; x++) {
      const th = -Math.PI / 2 + (2 * Math.PI * x) / n;
      pos.push([cx + R * Math.cos(th), cy + R * Math.sin(th)]);
    }
    layout = { pos, n };
    const curve = (x, y, bend) => {
      const [x0, y0] = pos[x], [x1, y1] = pos[y];
      const mx = (x0 + x1) / 2, my = (y0 + y1) / 2;
      const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1;
      return [x0, y0, mx - (dy / L) * bend * L, my + (dx / L) * bend * L, x1, y1];
    };
    const arrow = (c, color, lw) => {
      const [x0, y0, qx, qy, x1, y1] = c;
      ctx.strokeStyle = color; ctx.lineWidth = lw;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(qx, qy, x1, y1); ctx.stroke();
      // arrowhead at t = 0.62
      const t = 0.62, it = 1 - t;
      const px = it * it * x0 + 2 * it * t * qx + t * t * x1, py = it * it * y0 + 2 * it * t * qy + t * t * y1;
      const tx = 2 * it * (qx - x0) + 2 * t * (x1 - qx), ty = 2 * it * (qy - y0) + 2 * t * (y1 - qy);
      const a = Math.atan2(ty, tx), s = 5.5;
      ctx.fillStyle = color; ctx.beginPath();
      ctx.moveTo(px + s * Math.cos(a), py + s * Math.sin(a));
      ctx.lineTo(px + s * Math.cos(a + 2.5), py + s * Math.sin(a + 2.5));
      ctx.lineTo(px + s * Math.cos(a - 2.5), py + s * Math.sin(a - 2.5));
      ctx.closePath(); ctx.fill();
    };
    const loop = (x, color, out) => {
      const [px, py] = pos[x];
      const dx = px - cx, dy = py - cy, L = Math.hypot(dx, dy) || 1;
      const r0 = 9, k = out ? 1 : -1;
      ctx.strokeStyle = color; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(px + k * (dx / L) * r0, py + k * (dy / L) * r0, r0 - 2, 0, 2 * Math.PI); ctx.stroke();
    };
    // edges
    for (let x = 0; x < n; x++) {
      if (A[x] === x) loop(x, P.accent, false); else arrow(curve(x, A[x], 0.16), rgba(P.accent, 0.85), 1.5);
      if (T[x] === x) loop(x, P.accent2, true); else arrow(curve(x, T[x], -0.16), rgba(P.accent2, 0.85), 1.5);
    }
    // path of w from start
    const word = parseWord(st.word) || [];
    const Ai = inverse(A), Ti = inverse(T);
    let x = st.start % n;
    ctx.lineCap = 'round';
    const steps = [];
    for (const ch of word) {
      const y = ch === 'a' ? A[x] : ch === 'A' ? Ai[x] : ch === 't' ? T[x] : Ti[x];
      steps.push([x, y, ch]); x = y;
    }
    const pathCol = P.accent4;
    steps.forEach(([u, v, ch], k) => {
      if (u === v) return;
      const fwd = ch === 'a' || ch === 't';
      const bend = ch.toLowerCase() === 'a' ? 0.16 : -0.16;
      const c = fwd ? curve(u, v, bend) : curve(v, u, bend);
      const [x0, y0, qx, qy, x1, y1] = c;
      ctx.strokeStyle = rgba(pathCol, 0.32); ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.quadraticCurveTo(qx, qy, x1, y1); ctx.stroke();
      // step number near the midpoint
      const mx = 0.25 * x0 + 0.5 * qx + 0.25 * x1, my = 0.25 * y0 + 0.5 * qy + 0.25 * y1;
      ctx.fillStyle = pathCol; ctx.font = '600 10px Inter, system-ui, sans-serif';
      ctx.fillText(String(k + 1), mx + 3, my - 3);
    });
    ctx.lineCap = 'butt';
    const end = x, startPt = st.start % n;
    // vertices
    for (let v = 0; v < n; v++) {
      const [px, py] = pos[v];
      ctx.fillStyle = P.panel; ctx.strokeStyle = P.ink; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(px, py, 10, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
      ctx.fillStyle = P.ink; ctx.font = '600 11px Inter, system-ui, sans-serif'; ctx.textAlign = 'center';
      ctx.fillText(String(v + 1), px, py + 4);
    }
    ctx.textAlign = 'left';
    // start / end markers
    const ring = (v, color) => { const [px, py] = pos[v]; ctx.strokeStyle = color; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(px, py, 14.5, 0, 2 * Math.PI); ctx.stroke(); };
    ring(startPt, pathCol);
    if (end !== startPt) ring(end, P.accent2);
    // legend
    ctx.font = '11px Inter, system-ui, sans-serif';
    const lg = [[P.accent, 'x·a'], [P.accent2, 'x·t'], [pathCol, 'path of w']];
    let lx = 10;
    for (const [c, s] of lg) { ctx.fillStyle = c; ctx.fillRect(lx, 12, 14, 3); ctx.fillStyle = P.muted; ctx.fillText(s, lx + 18, 17); lx += ctx.measureText(s).width + 34; }
    ctx.fillStyle = end === startPt ? P.accent3 : P.accent2;
    ctx.font = '600 11px Inter, system-ui, sans-serif';
    ctx.fillText(end === startPt ? `w returns to ${startPt + 1}` : `w moves ${startPt + 1} → ${end + 1}`, 10, h - 10);
  }

  // controls
  const ctl = controls(right); ctl.style.marginTop = '0';
  const groupSel = el('select', { 'aria-label': 'group' });
  for (const [k, g] of Object.entries(GROUPS)) groupSel.append(el('option', { value: k }, `${g.name}  (${g.note})`));
  ctl.append(el('label', { class: 'ctl' }, 'group', groupSel));
  const presetRow = el('div', { class: 'controls', style: 'margin-top:.3rem' });
  right.append(presetRow);
  const wordIn = el('input', { type: 'text', value: st.word, spellcheck: 'false', 'aria-label': 'word',
    style: 'font: 500 .82rem ui-monospace, SFMono-Regular, Menlo, monospace; width: 9.5rem; padding: .22rem .4rem; border: 1px solid var(--rule); border-radius: 6px; background: var(--panel-2); color: var(--fg);' });
  const wordRow = el('div', { class: 'controls', style: 'margin-top:.3rem' }, el('label', { class: 'ctl' }, 'word w', wordIn));
  right.append(wordRow);
  const ctl2 = controls(right); ctl2.style.marginTop = '.3rem';
  slider(ctl2, { label: 'n ≤', min: 3, max: 9, step: 1, value: st.nmax, fmt: (v) => v, oninput: (v) => { st.nmax = v; run(); } });
  const navRow = controls(right); navRow.style.marginTop = '.3rem';
  button(navRow, '◀', () => { if (st.samples.length) { st.shown = (st.shown + st.samples.length - 1) % st.samples.length; cv.redraw(); updateReadout(); } });
  const navLabel = el('span', { class: 'val' }, '');
  navRow.append(navLabel);
  button(navRow, '▶', () => { if (st.samples.length) { st.shown = (st.shown + 1) % st.samples.length; cv.redraw(); updateReadout(); } });

  const ro = el('div', { class: 'readout', style: 'margin-top:.7rem' });
  right.append(ro);
  right.append(el('div', { class: 'hint' }, 'Capitals are inverses: taTatATA = [t a t⁻¹, a]. Click a point to start the path of w there.'));

  function setPresets() {
    presetRow.innerHTML = '';
    for (const [label, wd] of PRESETS[st.group]) button(presetRow, label, () => { st.word = wd; wordIn.value = wd; run(); });
  }
  groupSel.addEventListener('change', () => { st.group = groupSel.value; st.word = PRESETS[st.group][0][1]; wordIn.value = st.word; setPresets(); run(); });
  wordIn.addEventListener('input', () => { st.word = wordIn.value; run(); });

  function run() {
    const w = parseWord(st.word);
    st.err = w ? '' : 'use only the letters a, A, t, T';
    st.samples = []; st.shown = 0; st.stats = [];
    if (!w) { st.running = false; cv.redraw(); updateReadout(); return; }
    const sepS = [], intS = [];
    const onHom = (A, T, sep, n) => {
      if (sep) { if (sepS.length < 40) sepS.push({ A: A.slice(), T: T.slice(), sep, n }); }
      else if (n >= 3 && intS.length < 400 && !isIdentity(A) && !isIdentity(T) && transitive(A, T)) intS.push({ A: A.slice(), T: T.slice(), sep, n });
    };
    st.gen = searchHoms(st.group, w, st.nmax, onHom);
    st.running = true;
    const myGen = st.gen;
    const step = () => {
      if (st.gen !== myGen) return;
      const t0 = performance.now();
      while (performance.now() - t0 < 10) {
        const { value } = myGen.next();
        if (!value) break;
        st.stats = value.stats;
        if (value.done) { st.running = false; break; }
      }
      // separating examples first; otherwise the largest transitive actions
      const pool = sepS.length ? sepS.slice().sort((a, b) => b.n - a.n) : intS.slice().sort((a, b) => b.n - a.n).slice(0, 40);
      const keep = st.samples[st.shown];
      st.samples = pool;
      if (!keep || !pool.includes(keep)) st.shown = 0;
      cv.redraw(); updateReadout();
      if (st.running) requestAnimationFrame(step);
    };
    requestAnimationFrame(step);
  }

  function updateReadout() {
    const g = GROUPS[st.group];
    if (st.err) { ro.innerHTML = `<span class="bad">${st.err}</span>`; navLabel.textContent = ''; return; }
    const w = freeReduce(parseWord(st.word) || []);
    const homs = st.stats.reduce((s, x) => s + x.homs, 0), sep = st.stats.reduce((s, x) => s + x.sep, 0);
    let rows = st.stats.map((s) => `<tr><td class="k">n = ${s.n}</td><td>${s.homs.toLocaleString()} homs</td><td>${s.sep.toLocaleString()} keep w</td></tr>`).join('');
    const nf = brittonReduce(st.group, parseWord(st.word) || []);
    const verdict = st.running ? '<span class="k">running…</span>'
      : sep ? `<span class="ok">w survives in a finite quotient</span>`
      : nf.length === 0 ? `<span class="k">w ↦ 1 everywhere, because w = 1</span>`
      : `<span class="bad">w ≠ 1, yet w ↦ 1 in all ${homs.toLocaleString()} homomorphisms</span>`;
    const hom = current();
    const fmtPerm = (P) => cycles(P);
    const inG = nf.length === 0 ? '<span class="k">w = 1 in G</span>'
      : `w ≠ 1 in G${GROUPS[st.group].rel ? ' (Britton)' : ''}`;
    ro.innerHTML = `<table>
      <tr><td class="k">group</td><td colspan="2">${g.name}: ${g.note}</td></tr>
      <tr><td class="k">w</td><td colspan="2">${w.join('') || '1'}</td></tr>
      <tr><td class="k">in ${g.name}</td><td colspan="2">${inG}</td></tr>
      ${rows}</table><hr>${verdict}
      ${hom ? `<hr><table><tr><td class="k">a ↦</td><td>${fmtPerm(hom.A)}</td></tr><tr><td class="k">t ↦</td><td>${fmtPerm(hom.T)}</td></tr><tr><td class="k">w ↦</td><td>${fmtPerm(wordPerm(parseWord(st.word), hom.A, hom.T))}</td></tr></table>` : ''}`;
    navLabel.textContent = st.samples.length ? `${st.shown + 1} / ${st.samples.length}` : '—';
  }

  pointer(cv.wrap, {
    down(x, y) {
      if (!layout) return false;
      let best = -1, bd = 18;
      layout.pos.forEach(([px, py], i) => { const d = Math.hypot(px - x, py - y); if (d < bd) { bd = d; best = i; } });
      if (best < 0) return false;
      st.start = best; cv.redraw(); return false;
    },
  });

  groupSel.value = st.group; setPresets();
  onTheme(() => cv.redraw());
  run();
}

export function cycles(P) {
  const n = P.length, seen = new Uint8Array(n), out = [];
  for (let x = 0; x < n; x++) {
    if (seen[x] || P[x] === x) { seen[x] = 1; continue; }
    const c = []; let y = x;
    while (!seen[y]) { seen[y] = 1; c.push(y + 1); y = P[y]; }
    out.push('(' + c.join(' ') + ')');
  }
  return out.join('') || 'id';
}
