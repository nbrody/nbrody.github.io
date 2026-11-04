// Figure 7 — Lemma 5.3: the probability flow's Jensen budget. A random tree satisfying the transition
// bounds (5.8)–(5.9) with the exponents (5.7); an adversary decides which nodes are good; per
// generation the bad mass, the level energy Σ Δ_i², and Jensen's lower bound Δ_0² a^{D((b*+τ)ΣP_i m_i − τn)},
// against the budget E_0 of (5.20).
//
// The tree. A node at generation n carries P (product of transitions), Δ (interval length, nested:
// Δ_child = t_y Δ) and m (its not-good ancestors). Its children have probabilities p_y = c·t_y² with
// c = a^{−b*D} below a node that is not good and c = a^{τD} below a good node: the quadratic bound of
// (5.8) or (5.9) holds with equality (the cheapest tree the bounds allow), and t_y is drawn so that
// the linear bound p_y ≤ a^{−γD} t_y holds too. The children of one parent all have the same m, and
// the adversary's rule says which fraction of each m-group is not good; each family is split into a
// not-good block and a good block of exactly those masses. So the per-generation aggregates (bad mass,
// the mass w_n(m) on each m, the energy) are exact for the whole infinite tree, while the tree itself
// is too large to list (≈10^30 nodes by generation 60). We check the inequalities on actual nodes:
// K branches sampled by P (at each node a child is chosen with probability p_y), every family met on
// the way generated in full.
import { el, makeCanvas, labelLayer, slider, chips, segmented, controls, setTex, palette, onTheme, cssVar, fmt, rgba } from './common.js';

// ───────────────────────── the paper's exponents (5.7) and the model's a, D ─────────────────────────

export const BSTAR = 1 / 2, TAU = 1 / 20, QDIM = 2;
export const BETA = TAU / (4 * (QDIM + 1)), GAMMA = BETA / 2;     // 1/240, 1/480 for Q = 2
export const THRESHOLD = TAU / (BSTAR + TAU);                      // = 1/11
export const A_BASE = 2, D_EFF = 2;                                // the paper takes D large; only a^D enters
export const LAMBDA = D_EFF * Math.log(A_BASE);                    // ln a^D
export const DELTA0 = 1 / 2;
export const G_DEFAULT = 60;

export const C_BAD = Math.exp(-BSTAR * LAMBDA);   // a^{−b*D}: quadratic constant at nodes that are not good
export const C_GOOD = Math.exp(TAU * LAMBDA);     // a^{τD}: quadratic constant at good nodes
export const C_LIN = Math.exp(-GAMMA * LAMBDA);   // a^{−γD}: the linear constant
export const T_GOOD_MAX = C_LIN / C_GOOD;         // a^{−(τ+γ)D}: beyond it the linear bound would bind

/** The exponent of (5.21): D·((b*+τ)m − τn)·ln a. */
export const flowExponent = (m, n) => LAMBDA * ((BSTAR + TAU) * m - TAU * n);

// ───────────────────────── small deterministic randomness ─────────────────────────

export function mulberry(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function mix(a, b) {
  let h = Math.imul((a ^ 0x9e3779b9) >>> 0, 0x85ebca6b) ^ (b >>> 0);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}
const logSumExp = (xs) => { const M = Math.max(...xs); return M === -Infinity ? M : M + Math.log(xs.reduce((s, x) => s + Math.exp(x - M), 0)); };

// ───────────────────────── the adversary's schedule (exact aggregates by m) ─────────────────────────

/**
 * The per-generation decisions and the exact aggregates.
 *   rule 'adversary': the not-good mass goes to the nodes with the fewest not-good ancestors first,
 *                     which keeps m_i as even as possible (Jensen nearly tight: the cheapest choice);
 *   rule 'honest':    goodness ignores history (every m-group gets the same fraction), and the
 *                     per-generation fraction wanders around eps.
 * The root is a single node: not good iff eps ≥ 1/2.
 * Returns f[n][m] (fraction of the m-group at generation n that is not good), w[n][m], eps[n],
 * M[n] = Σ_i P_i m_i = Σ_{k<n} eps_k, lnE[n] = ln(ΣΔ_i²/Δ_0²) and lnJ[n] (Jensen), both exact.
 */
export function schedule({ eps = 0.5, rule = 'adversary', G = G_DEFAULT, seed = 11 } = {}) {
  const rnd = mulberry(seed);
  const w = [Float64Array.of(1)], f = [], E = [], M = [0];
  for (let n = 0; n <= G; n++) {
    const wn = w[n];
    let target = n === 0 ? (eps >= 0.5 ? 1 : 0) : rule === 'honest' ? Math.min(1, eps * 2 * rnd()) : eps;
    const fn = new Float64Array(n + 1);
    if (rule === 'adversary' || n === 0) {
      let left = target;
      for (let m = 0; m <= n && left > 1e-15; m++) {
        if (wn[m] <= 0) continue;
        const take = Math.min(left, wn[m]);
        fn[m] = take >= wn[m] ? 1 : take / wn[m];
        left -= take;
      }
    } else fn.fill(target);
    f.push(fn);
    let e = 0;
    for (let m = 0; m <= n; m++) e += fn[m] * wn[m];
    E.push(e);
    if (n < G) {
      const next = new Float64Array(n + 2);
      for (let m = 0; m <= n; m++) { next[m] += (1 - fn[m]) * wn[m]; next[m + 1] += fn[m] * wn[m]; }
      w.push(next);
      M.push(M[n] + e);
    }
  }
  const lnE = w.map((wn, n) => logSumExp(Array.from(wn, (x, m) => (x > 0 ? Math.log(x) + flowExponent(m, n) : -Infinity))));
  const lnJ = M.map((Mn, n) => flowExponent(Mn, n));
  const avg = M.map((Mn, n) => (n ? Mn / n : NaN));
  return { eps, rule, G, f, w, bad: E, M, lnE, lnJ, avg };
}

/** O(1/n) envelope of Lemma 5.3: within budget, (1/n)Σ P_i m_i ≤ τ/(b*+τ) + ln(E_0/Δ_0²)/(D ln a (b*+τ) n). */
export const envelope = (n, lnBudget) => THRESHOLD + lnBudget / (LAMBDA * (BSTAR + TAU) * n);

/** Where the budget (5.20) breaks: first n with ΣΔ_i² > E_0 (energy) and with the Jensen bound > E_0. */
export function budgetReport(S, lnBudget) {
  const nE = S.lnE.findIndex((x) => x > lnBudget);
  const nJ = S.lnJ.findIndex((x) => x > lnBudget);
  // Lemma 5.3, checked: at every generation within budget the running average is under the envelope,
  // and at every generation where the running average is over the envelope the budget is broken.
  let lemmaOk = true;
  for (let n = 1; n <= S.G; n++) {
    const within = S.lnE[n] <= lnBudget;
    if (within && S.avg[n] > envelope(n, lnBudget) + 1e-12) lemmaOk = false;
  }
  const jensenOk = S.lnE.every((x, n) => x >= S.lnJ[n] - 1e-9);
  // for a constant rate eps > 1/11 the Jensen bound grows linearly in n: predicted break
  const rate = LAMBDA * ((BSTAR + TAU) * S.eps - TAU);
  const predicted = rate > 0 ? Math.floor((lnBudget - flowExponent(S.eps >= 0.5 ? 1 - S.eps : -S.eps, 0)) / rate) + 1 : null;
  return { nE: nE < 0 ? null : nE, nJ: nJ < 0 ? null : nJ, lemmaOk, jensenOk, predicted };
}

// ───────────────────────── the tree, node by node ─────────────────────────

/**
 * The children of a node {n, m, bad, seed}: [{t, p, bad}], deterministic in the node's seed.
 * Not-good block first (mass f), then the good block (mass 1 − f), where f is the schedule's
 * fraction for the children's m-group at generation n+1.
 */
export function family(node, S) {
  const rnd = mulberry(mix(node.seed, 0x51ed270b));
  const c = node.bad ? C_BAD : C_GOOD;
  const lo = node.bad ? 1 / 8 : T_GOOD_MAX / 3, hi = node.bad ? 1 / 2 : T_GOOD_MAX * (1 - 1e-9);
  const mc = node.m + (node.bad ? 1 : 0);
  const fc = node.n + 1 < S.f.length ? S.f[node.n + 1][mc] : 0;
  const kids = [];
  for (const [mass, bad] of [[fc, true], [1 - fc, false]]) {
    if (mass <= 1e-15) continue;
    let left = mass;
    for (;;) {
      let t = lo + (hi - lo) * rnd(), p = c * t * t;
      if (p >= left - 1e-13) { p = left; t = Math.sqrt(p / c); kids.push({ t, p, bad }); break; }
      kids.push({ t, p, bad });
      left -= p;
    }
  }
  return kids;
}

/** (5.8) at a node that is not good, (5.9) at a good one: p ≤ a^{−γD}t and p ≤ c t². */
export function transitionOk(parentBad, kid, tol = 1e-12) {
  const c = parentBad ? C_BAD : C_GOOD;
  return kid.p > 0 && kid.t > 0 && kid.t <= 1 && kid.p <= C_LIN * kid.t * (1 + tol) && kid.p <= c * kid.t * kid.t * (1 + tol);
}

/** (5.21) at a node, in logs: P ≤ a^{−γDn}Δ/Δ_0 and Δ² ≥ Δ_0² P a^{D((b*+τ)m − τn)}. */
export function flowOk(node, tol = 1e-9) {
  const lin = node.lnP <= -GAMMA * LAMBDA * node.n + node.lnD - Math.log(DELTA0) + tol;
  const quad = 2 * node.lnD >= 2 * Math.log(DELTA0) + node.lnP + flowExponent(node.m, node.n) - tol;
  return lin && quad;
}

export const rootNode = (S) => ({ n: 0, m: 0, bad: S.f[0][0] > 0.5, lnP: 0, lnD: Math.log(DELTA0), seed: 0x2545f491 });

/**
 * Follow the flow: K branches sampled by P. Checks every node met against (5.21), and every family
 * met in full against (5.8)/(5.9) and Σ p_y = 1. Per generation: the sampled bad fraction, the
 * sampled mean of m, the m-values seen, and an importance-sampling estimate of the node count.
 */
export function sampleFlow(S, { K = 240, seed = 7 } = {}) {
  const G = S.f.length - 1;
  const fams = new Map();
  const famOf = (node) => {
    const key = node.seed + ':' + node.n;
    let F = fams.get(key);
    if (!F) {
      const kids = family(node, S);
      const sum = kids.reduce((s, k) => s + k.p, 0);
      F = { kids, sumOk: Math.abs(sum - 1) < 1e-12, bad: kids.filter((k) => !transitionOk(node.bad, k)).length };
      fams.set(key, F);
    }
    return F;
  };
  const gens = Array.from({ length: G + 1 }, () => ({ k: 0, bad: 0, mSum: 0, ms: new Map(), lnInvP: [] }));
  const seen = new Set();
  let nodes = 0, nodeFails = 0;
  for (let b = 0; b < K; b++) {
    const rnd = mulberry(mix(seed, b));
    let node = rootNode(S);
    for (let n = 0; n <= G; n++) {
      const g = gens[n];
      g.k++; g.mSum += node.m; if (node.bad) g.bad++;
      g.ms.set(node.m, (g.ms.get(node.m) || 0) + 1);
      g.lnInvP.push(-node.lnP);
      const id = node.seed + ':' + n;
      if (!seen.has(id)) { seen.add(id); nodes++; if (!flowOk(node)) nodeFails++; }
      if (n === G) break;
      const F = famOf(node);
      let u = rnd(), j = 0;
      while (j < F.kids.length - 1 && u >= F.kids[j].p) { u -= F.kids[j].p; j++; }
      const kid = F.kids[j];
      node = { n: n + 1, m: node.m + (node.bad ? 1 : 0), bad: kid.bad, lnP: node.lnP + Math.log(kid.p), lnD: node.lnD + Math.log(kid.t), seed: mix(node.seed, j + 1) };
    }
  }
  let transitions = 0, transFails = 0, sumFails = 0;
  for (const F of fams.values()) { transitions += F.kids.length; transFails += F.bad; if (!F.sumOk) sumFails++; }
  const perGen = gens.map((g) => ({
    badFrac: g.bad / g.k, meanM: g.mSum / g.k, ms: g.ms,
    log10Count: (logSumExp(g.lnInvP) - Math.log(g.k)) / Math.LN10,
  }));
  return { K, nodes, nodeFails, families: fams.size, transitions, transFails, sumFails, perGen };
}

// ───────────────────────── figure ─────────────────────────

const PRESET_LIST = [
  ['half', 'Adversary at $\\tfrac12$', { eps: 0.5, rule: 'adversary' }],
  ['eleventh', 'Adversary at $\\tfrac1{11}$', { eps: 1 / 11, rule: 'adversary' }],
  ['honest', 'Honest', { eps: 0.05, rule: 'honest' }],
];

export function mount(root) {
  const row = el('div', { class: 'fig-row' });
  const left = el('div', { class: 'grow' }), right = el('div', { class: 'side' });
  row.append(left, right);
  root.append(row);

  const st = { eps: 0.5, rule: 'adversary', lnBudget: 10 * Math.LN2, S: null, R: null, smp: null };

  const legend = el('div', { class: 'panel-hint' });
  left.append(legend);
  setTex(legend, '<span style="color:var(--c-w)">▮</span> not-good mass $\\varepsilon_n$ &nbsp; '
    + '<span style="color:var(--c-w)">━</span> running average $\\bar\\varepsilon_n=\\frac1n\\sum_iP_im_i$ &nbsp; '
    + '<span style="color:var(--c-mu)">━</span> $\\sum_i\\Delta_i^2$ &nbsp; '
    + '<span style="color:var(--c-mu)">╌</span> Jensen bound &nbsp; '
    + '<span style="color:var(--c-mu)">·</span> sampled $\\Delta_i^2/P_i$');
  const cv = makeCanvas(left, { aspect: (w) => (w < 520 ? 1.12 : 0.74), maxHeight: 560, minHeight: 360, draw });
  const labels = labelLayer(cv.wrap);

  const ctl = controls(right);
  ctl.style.marginTop = '0';
  const presetChips = chips(ctl, {
    label: 'Preset',
    options: PRESET_LIST.map(([k, l]) => [k, l]),
    value: 'half',
    onchange: (k) => {
      const p = PRESET_LIST.find((x) => x[0] === k)[2];
      st.eps = p.eps; st.rule = p.rule;
      epsSlider.set(p.eps); ruleSeg.set(p.rule);
      recompute();
    },
  });
  const ruleSeg = segmented(ctl, [['adversary', 'adversary'], ['honest', 'honest']], st.rule, (k) => { st.rule = k; presetChips.set(null); recompute(); });
  const epsSlider = slider(ctl, {
    label: 'not-good mass $\\varepsilon$', min: 0, max: 1, step: 'any', value: st.eps,
    fmt: (v) => (Math.abs(v - 1 / 11) < 5e-4 ? '$\\tfrac1{11}$' : v.toFixed(3)),
    oninput: (v) => { st.eps = v; presetChips.set(null); recompute(); },
  });
  slider(ctl, {
    label: 'budget $E_0/\\Delta_0^2$', min: 2, max: 30, step: 1, value: 10,
    fmt: (v) => `$2^{${v}}$`,
    oninput: (v) => { st.lnBudget = v * Math.LN2; st.R = budgetReport(st.S, st.lnBudget); cv.redraw(); readout(); },
  });
  const ro = el('div', { class: 'readout', style: 'margin-top:.7rem' });
  right.append(ro);
  const hint = el('div', { class: 'hint' });
  right.append(hint);
  setTex(hint, '<b>Raise</b> $\\varepsilon$ above $\\tfrac1{11}$ and the energy must eventually leave the budget, however large $E_0$ is.');

  function recompute() {
    st.S = schedule({ eps: st.eps, rule: st.rule });
    st.R = budgetReport(st.S, st.lnBudget);
    st.smp = sampleFlow(st.S);
    cv.redraw();
    readout();
  }

  function draw(ctx, w, h) {
    const P = palette(), S = st.S, R = st.R;
    if (!S) return;
    const font = cssVar('--font-body');
    const labs = [];
    const G = S.G;
    const L = 46, Rm = 22, T = 26, gap = 40, B = 30;
    const hTop = Math.round((h - T - gap - B) * 0.44);
    const top = { y0: T, y1: T + hTop }, bot = { y0: T + hTop + gap, y1: h - B };
    const X = (n) => L + ((n + 0.5) / (G + 1)) * (w - L - Rm);
    const bw = (w - L - Rm) / (G + 1);
    ctx.font = `11px ${font}`;

    // ── top: not-good mass per generation, running average, 1/11 and the O(1/n) envelope
    const Yt = (v) => top.y1 - Math.max(0, Math.min(1, v)) * (top.y1 - top.y0);
    ctx.strokeStyle = P.grid; ctx.lineWidth = 1;
    for (const v of [0.5, 1]) { ctx.beginPath(); ctx.moveTo(L, Math.round(Yt(v)) + 0.5); ctx.lineTo(w - Rm, Math.round(Yt(v)) + 0.5); ctx.stroke(); }
    for (let n = 0; n <= G; n++) {
      const x = X(n) - bw / 2 + Math.min(1, bw * 0.12), bwid = Math.max(1, bw - 2 * Math.min(1, bw * 0.12));
      ctx.fillStyle = rgba(P.w, P.dark ? 0.7 : 0.58);
      ctx.fillRect(x, Yt(S.bad[n]), bwid, Yt(0) - Yt(S.bad[n]));
    }
    // envelope 1/11 + c/n (allowed while within budget)
    ctx.save();
    ctx.beginPath(); ctx.rect(L, top.y0 - 2, w - L - Rm, top.y1 - top.y0 + 2); ctx.clip();
    ctx.setLineDash([2, 3]); ctx.strokeStyle = P.mu; ctx.lineWidth = 1.5;
    ctx.beginPath();
    let started = false;
    for (let n = 1; n <= G; n += 0.25) {
      const v = envelope(n, st.lnBudget);
      if (v > 1.05) continue;
      const x = X(n - 0.5), y = Yt(Math.min(1.02, v));
      if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y);
    }
    ctx.stroke();
    ctx.restore();
    // threshold 1/11
    ctx.strokeStyle = P.mu; ctx.lineWidth = 1.5;
    ctx.beginPath(); ctx.moveTo(L, Yt(THRESHOLD)); ctx.lineTo(w - Rm, Yt(THRESHOLD)); ctx.stroke();
    // running average, with a halo so it reads over the bars
    ctx.beginPath();
    for (let n = 1; n <= G; n++) { const x = X(n - 0.5), y = Yt(S.avg[n]); n === 1 ? ctx.moveTo(x, y) : ctx.lineTo(x, y); }
    ctx.lineJoin = 'round';
    ctx.strokeStyle = P.bg; ctx.lineWidth = 5.5; ctx.stroke();
    ctx.strokeStyle = P.w; ctx.lineWidth = 2.4; ctx.stroke();
    // axis
    ctx.strokeStyle = rgba(P.text, 0.35); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(L + 0.5, top.y0); ctx.lineTo(L + 0.5, top.y1); ctx.lineTo(w - Rm, top.y1 + 0.5); ctx.stroke();
    ctx.fillStyle = P.muted; ctx.textAlign = 'right'; ctx.textBaseline = 'middle';
    for (const v of hTop < 190 ? [0.5, 1] : [0, 0.5, 1]) ctx.fillText(String(v), L - 6, Yt(v));
    labs.push({ id: 'th', x: L - 5, y: Yt(THRESHOLD), tex: '\\tfrac1{11}', anchor: 'w', cls: 'small', color: P.mu });
    // label the envelope where it is visible
    let nLab = null;
    for (let n = 2; n <= G; n++) { const v = envelope(n, st.lnBudget); if (v < 0.8) { nLab = n; break; } }
    if (nLab !== null && nLab < G - 8) labs.push({ id: 'env', x: X(nLab - 0.5) + 5, y: Yt(envelope(nLab, st.lnBudget)) - 2, tex: '\\tfrac{\\tau}{b_*+\\tau}+O(\\tfrac1n)', anchor: 'ne', cls: 'small halo', color: P.mu });
    labs.push({ id: 'tt', x: L + 2, y: top.y0 - 6, html: 'mass not good, per generation', anchor: 'ne', cls: 'small' });

    // ── bottom: energy, log scale
    const lnB = st.lnBudget, toL10 = (x) => (x + 2 * Math.log(DELTA0)) / Math.LN10; // plot ΣΔ² itself, Δ0 = 1/2
    let lo = Infinity, hi = -Infinity;
    for (let n = 0; n <= G; n++) { lo = Math.min(lo, toL10(S.lnJ[n])); hi = Math.max(hi, toL10(S.lnE[n])); }
    const budL10 = toL10(lnB);
    lo = Math.floor(Math.min(lo, budL10 - 2, toL10(0) - 1));
    hi = Math.ceil(Math.max(hi, budL10 + 1));
    hi = Math.min(hi, budL10 + 7);
    const Yb = (v) => bot.y1 - ((Math.max(lo - 0.3, Math.min(hi + 0.3, v)) - lo) / (hi - lo)) * (bot.y1 - bot.y0);
    // forbidden zone above E_0
    ctx.fillStyle = rgba(P.mu, P.dark ? 0.1 : 0.07);
    ctx.fillRect(L, bot.y0, w - L - Rm, Yb(budL10) - bot.y0);
    const span = hi - lo, step = span > 8 ? 2 : 1;
    ctx.strokeStyle = P.grid; ctx.lineWidth = 1;
    for (let e = lo; e <= hi; e++) {
      ctx.beginPath(); ctx.moveTo(L, Math.round(Yb(e)) + 0.5); ctx.lineTo(w - Rm, Math.round(Yb(e)) + 0.5); ctx.stroke();
      if ((e - lo) % step === 0) labs.push({ id: 'y' + e, x: L - 6, y: Yb(e), tex: e === 0 ? '1' : e === 1 ? '10' : `10^{${e}}`, anchor: 'w', cls: 'small' });
    }
    // budget line
    ctx.strokeStyle = P.mu; ctx.lineWidth = 1.6; ctx.setLineDash([7, 4]);
    ctx.beginPath(); ctx.moveTo(L, Yb(budL10)); ctx.lineTo(w - Rm, Yb(budL10)); ctx.stroke();
    ctx.setLineDash([]);
    labs.push({ id: 'E0', x: L + 6, y: Yb(budL10) - 3, tex: 'E_0', anchor: 'ne', cls: 'halo', color: P.mu });
    // sampled nodes Δ_i²/P_i (one dot per m-value seen)
    if (st.smp) {
      ctx.save();
      ctx.beginPath(); ctx.rect(L, bot.y0, w - L - Rm, bot.y1 - bot.y0); ctx.clip();
      ctx.fillStyle = rgba(P.mu, 0.45);
      st.smp.perGen.forEach((g, n) => {
        for (const [m, cnt] of g.ms) {
          const v = toL10(flowExponent(m, n));
          const r = 1.2 + 1.6 * Math.sqrt(cnt / st.smp.K);
          ctx.beginPath(); ctx.arc(X(n), Yb(v), r, 0, 2 * Math.PI); ctx.fill();
        }
      });
      ctx.restore();
    }
    const curve = (arr, dash, lw) => {
      ctx.save();
      ctx.beginPath(); ctx.rect(L, bot.y0 - 4, w - L - Rm, bot.y1 - bot.y0 + 8); ctx.clip();
      ctx.setLineDash(dash); ctx.lineWidth = lw; ctx.strokeStyle = P.mu;
      ctx.beginPath();
      arr.forEach((x, n) => { const X1 = X(n), Y1 = Yb(toL10(x)); n ? ctx.lineTo(X1, Y1) : ctx.moveTo(X1, Y1); });
      ctx.stroke();
      ctx.restore();
    };
    curve(S.lnJ, [5, 4], 1.6);
    curve(S.lnE, [], 2.4);
    ctx.strokeStyle = rgba(P.text, 0.35); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(L + 0.5, bot.y0); ctx.lineTo(L + 0.5, bot.y1); ctx.lineTo(w - Rm, bot.y1 + 0.5); ctx.stroke();
    labs.push({ id: 'bt', x: L + 2, y: bot.y0 - 6, tex: '\\textstyle\\sum_i\\Delta_i^2\\ \\text{at generation } n', anchor: 'ne', cls: 'small' });

    // x axis
    ctx.fillStyle = P.muted; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
    for (let n = 0; n <= G; n += 10) ctx.fillText(String(n), X(n), h - B + 6);
    labs.push({ id: 'xn', x: X(G) + 9, y: h - B + 5, tex: 'n', anchor: 'se', cls: 'small' });

    // the generation where the budget breaks
    if (R.nE !== null) {
      const x = X(R.nE);
      ctx.strokeStyle = P.text; ctx.lineWidth = 1.2; ctx.setLineDash([3, 3]);
      ctx.beginPath(); ctx.moveTo(x, top.y0 - 2); ctx.lineTo(x, bot.y1); ctx.stroke();
      ctx.setLineDash([]);
      ctx.beginPath(); ctx.arc(x, Yb(toL10(S.lnE[R.nE])), 4.5, 0, 2 * Math.PI);
      ctx.fillStyle = P.mu; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = P.surface; ctx.stroke();
      const right = x < w * 0.62;
      labs.push({ id: 'win', x: x + (right ? 6 : -6), y: bot.y0 + 4, html: `the lemma wins at <i>n</i>&thinsp;=&thinsp;${R.nE}`, anchor: right ? 'se' : 'sw', cls: 'halo' });
    }
    labels.set(labs);
  }

  function readout() {
    const S = st.S, R = st.R, M = st.smp;
    if (!S || !M) return;
    const ok = (b) => `<span class="${b ? 'ok' : 'bad'}">${b ? '✓' : '✗'}</span>`;
    const G = S.G;
    const okSample = M.nodeFails === 0 && M.transFails === 0 && M.sumFails === 0;
    const budget = R.nE !== null
      ? `${ok(true)} the lemma wins: $\\sum_i\\Delta_i^2\\gt E_0$ at $n=${R.nE}$${R.nJ !== null ? `, Jensen's bound alone by $n=${R.nJ}$` : ''}. No geometric tree has this flow.`
      : `${ok(true)} within budget through $n=${G}$${R.predicted !== null ? `; at this rate the bound passes $E_0$ near $n\\approx ${fmt.tex(R.predicted)}$` : ''}.`;
    setTex(ro, `<table>
      <tr><td>$a,\\ D$ <span class="dim">(effective)</span></td><td class="num">$${A_BASE},\\ ${D_EFF}$</td></tr>
      <tr><td>$b_*,\\ \\tau,\\ \\gamma$ <span class="dim">($Q=${QDIM}$)</span></td><td class="num">$\\tfrac12,\\ \\tfrac1{20},\\ \\tfrac1{480}$</td></tr>
      <tr class="sep"><td colspan="2">$K=${M.K}$ branches sampled by $P$: $${fmt.tex(M.nodes)}$ nodes, $${fmt.tex(M.transitions)}$ transitions <span class="dim">(generation $${G}$ has $\\approx10^{${Math.round(M.perGen[G].log10Count)}}$ nodes)</span></td></tr>
      <tr><td>(5.8)/(5.9), $\\sum_yp_y=1$</td><td class="num">${ok(M.transFails === 0 && M.sumFails === 0)}</td></tr>
      <tr><td>(5.21) at every sampled node</td><td class="num">${ok(M.nodeFails === 0)}</td></tr>
      <tr><td>Jensen, every $n$</td><td class="num">${ok(R.jensenOk)}</td></tr>
      <tr class="sep"><td>$\\bar\\varepsilon_{${G}}$</td><td class="num">$${S.avg[G].toFixed(3)}$</td></tr>
      <tr><td>within budget $\\Rightarrow\\bar\\varepsilon_n\\le\\tfrac1{11}+O(\\tfrac1n)$</td><td class="num">${ok(R.lemmaOk)}</td></tr>
      </table>
      <div style="margin-top:.35rem">${budget}</div>
      ${okSample ? '' : '<div class="bad" style="margin-top:.3rem">a sampled node fails a bound</div>'}`);
  }

  onTheme(() => cv.redraw());
  recompute();
}
