// Octavians & G₂ buildings — main page controller.
import * as O from "./octavian.js";
import * as F from "./factor.js";
import { svgEl, el, clear, esc, colorVar, fmtFactored, fmtBig, tip, renderChips, sup } from "./ui.js";
import { renderBoxView } from "./boxview.js";
import { initG2 } from "./g2view.js";
import { initFanoE8 } from "./fanoE8.js";

const EXAMPLES = [
  { label: "3·5·7 — a product of three small primes", src: "(1+e1+e2)(2+e3)(1+2e5+e6+e7)" },
  { label: "3·5·7·11 — four primes", src: "(1+e1+e2)(2+e3)(1+2e5+e6+e7)(3+e4+e6)" },
  { label: "3³·5 — repeated prime", src: "(1+e1+e2)(1+e3+e5)(1+e6+e7)(2+e4)" },
  { label: "2·3³·5·11 — six factors, one of norm 2", src: "(2+e3+e5)(1+e1+e2)(2+e6)(3+e4+e7)(1+e2+e5)" },
  { label: "2·3·5 — with a factor of norm 2", src: "(1+e1)(1+e2+e3)(2+e5)" },
  { label: "Hurwitz quaternion, 3·5·7 (try ring ℍ)", src: "(1+i+j)(2+k)(1+2i+j+k)" },
  { label: "Hurwitz quaternion, 3²·13", src: "1 + 4i + 6j + 8k" },
  { label: "Half-integral: ½(1+e1+e2+e4)·(2+e3)·(1+e5+e6)", src: "(1+e1+e2+e4)/2 (2+e3)(1+e5+e6)" },
];

// ---------------------------------------------------------------------------------------
// State

const S = {
  src: "",
  alpha: null,
  content: 1n,
  normPairs: [],
  primes: [],        // current order (BigInt)
  tree: null,
  choices: {},
  ring: "O",
  ft: null,          // annotated factorization tree
  prevKeys: null,    // factor keys of the previous factorization (for "changed")
  selected: "",      // selected internal node path
  tab: "factor",
  error: "",
};
const MAX_FACTORS = 14;

const $ = (id) => document.getElementById(id);
const distinctPrimes = () => [...new Set(S.primes.map(String))].map(BigInt).sort((a, b) => (a < b ? -1 : 1));
const primeColor = (p) => colorVar(distinctPrimes().findIndex((q) => q === BigInt(p)));
export const appState = S;

// ---------------------------------------------------------------------------------------
// α input

function setAlpha(src, { keepOrder = false } = {}) {
  S.src = src;
  S.error = "";
  try {
    const a = O.parse(src);
    if (O.isZero(a)) throw new Error("α = 0");
    const c = O.content(a);
    const prim = c === 1n ? a : O.divInt(a, c);
    const n = O.norm(prim);
    const ps = F.primeList(n);
    if (ps.length > MAX_FACTORS) throw new Error(`N(α) has ${ps.length} prime factors; this page handles up to ${MAX_FACTORS}.`);
    S.alpha = prim;
    S.content = c;
    S.normPairs = F.factorInteger(n);
    if (!keepOrder || !sameMultiset(ps, S.primes)) S.primes = ps;
    if (!S.tree || F.leaves(S.tree).length !== ps.length) S.tree = ps.length ? F.leftComb(ps.length) : null;
    S.choices = {};
    S.prevKeys = null;
    S.selected = "";
    if (S.ring === "H" && !F.inHurwitz(S.alpha)) setRing("O", false);
  } catch (e) {
    S.alpha = null;
    S.error = e.message;
  }
  updateRingButtons();
  recompute();
}
const sameMultiset = (a, b) => a.length === b.length && a.map(String).sort().join() === b.map(String).sort().join();

function recompute({ trackChange = false } = {}) {
  const oldKeys = S.ft ? F.leafValues(S.ft).map(O.key) : null;
  S.ft = null;
  if (S.alpha && S.primes.length) {
    try {
      F.setRing(S.ring);
      S.ft = F.normalizeSigns(F.factorize(S.alpha, S.primes, S.tree, S.choices));
    } catch (e) {
      S.error = "Factorization failed: " + e.message;
    }
  }
  S.prevKeys = trackChange ? oldKeys : null;
  render();
}

// ---------------------------------------------------------------------------------------
// Rendering: sidebar

function renderSide() {
  $("alpha-err").hidden = !S.error;
  $("alpha-err").textContent = S.error;
  if (!S.alpha) { $("alpha-show").textContent = ""; $("norm-line").textContent = ""; }
  else {
    const c = S.content > 1n ? `α = ${S.content} · α₀ is not primitive; factoring α₀ = ` : "α = ";
    $("alpha-show").textContent = c + O.format(S.alpha);
    const n = O.norm(S.alpha);
    $("norm-line").innerHTML = `N(α${S.content > 1n ? "₀" : ""}) = ${esc(fmtBig(n))}` + (S.normPairs.length ? ` = ${esc(fmtFactored(S.normPairs))}` : "") +
      (S.primes.length ? ` <span class="muted">· ${S.primes.length} prime factors</span>` : ` <span class="muted">· a unit</span>`);
  }
  renderChips($("chips"), S.primes.map((p) => ({ label: String(p), color: primeColor(p) })), (order) => {
    S.primes = order.map((i) => S.primes[i]);
    S.choices = {};
    recompute({ trackChange: true });
  });
}

function updateRingButtons() {
  const inH = S.alpha && F.inHurwitz(S.alpha);
  for (const b of $("ring-seg").querySelectorAll("button")) {
    b.setAttribute("aria-pressed", b.dataset.ring === S.ring ? "true" : "false");
    if (b.dataset.ring === "H") b.disabled = !inH;
  }
}
function setRing(r, re = true) {
  S.ring = r;
  S.choices = {};
  updateRingButtons();
  if (re) recompute({ trackChange: true });
}

// ---------------------------------------------------------------------------------------
// Rendering: the bracketing tree

function layoutTree(t) {
  // x of a leaf = its index; internal = mean of children; y = height (leaves 0)
  const pos = new Map();
  const rec = (t, path) => {
    if (F.isLeaf(t)) { pos.set(path, { x: t.leaf, h: 0 }); return { x: t.leaf, h: 0 }; }
    const a = rec(t.l, path + "L"), b = rec(t.r, path + "R");
    const p = { x: (a.x + b.x) / 2, h: Math.max(a.h, b.h) + 1 };
    pos.set(path, p);
    return p;
  };
  rec(t, "");
  return pos;
}

function nodeName(ft) {
  // product of prime labels, e.g. "3·5·7"
  const ps = [];
  for (let i = ft.interval[0]; i <= ft.interval[1]; i++) ps.push(S.primes[i]);
  if (ps.length > 4) return "N = " + fmtFactored(F.factorInteger(ps.reduce((a, b) => a * b, 1n)));
  return ps.join("·");
}

function renderTree() {
  const svg = $("tree");
  clear(svg);
  if (!S.ft) { svg.setAttribute("viewBox", "0 0 600 40"); return; }
  const k = S.primes.length;
  const pos = layoutTree(S.tree);
  const H = pos.get("").h;
  const W = Math.max(560, 96 * k);
  const dx = (W - 80) / Math.max(1, k - 1), dy = 62;
  const X = (x) => 40 + (k === 1 ? (W - 80) / 2 : x * dx);
  const Y = (h) => 30 + (H - h) * dy;
  const height = Y(0) + 64;
  svg.setAttribute("viewBox", `0 0 ${W} ${height}`);
  svg.style.maxWidth = W + "px";
  const changed = new Set();
  if (S.prevKeys) {
    const prev = new Set(S.prevKeys);
    F.leafValues(S.ft).forEach((v, i) => { if (!prev.has(O.key(v))) changed.add(i); });
  }
  const gE = svgEl("g", {}, svg), gN = svgEl("g", {}, svg);
  const walk = (ft, t) => {
    const p = pos.get(ft.path);
    if (F.isLeaf(ft)) {
      const g = svgEl("g", { class: "tleaf" + (changed.has(ft.leaf) ? " changed" : "") }, gN);
      const x = X(p.x), y = Y(0);
      svgEl("rect", { x: x - 30, y: y - 13, width: 60, height: 26, rx: 13, stroke: primeColor(ft.prime) }, g);
      const t1 = svgEl("text", { x, y: y + 4, "text-anchor": "middle", style: `fill:${primeColor(ft.prime)}` }, g);
      t1.textContent = "π" + subDigits(ft.leaf + 1);
      const t2 = svgEl("text", { x, y: y + 30, "text-anchor": "middle", class: "lbl" }, g);
      t2.textContent = "N = " + ft.prime;
      g.addEventListener("pointerenter", (e) => tip(`<b>π${subDigits(ft.leaf + 1)}</b> = <span class="mono">${esc(O.format(ft.value))}</span><br>N = ${ft.prime}`, e));
      g.addEventListener("pointermove", (e) => tip(`<b>π${subDigits(ft.leaf + 1)}</b> = <span class="mono">${esc(O.format(ft.value))}</span><br>N = ${ft.prime}`, e));
      g.addEventListener("pointerleave", () => tip(null));
      return;
    }
    const x = X(p.x), y = Y(p.h);
    for (const [c, ct] of [[ft.l, t.l], [ft.r, t.r]]) {
      const q = pos.get(c.path);
      const cx = X(q.x), cy = F.isLeaf(c) ? Y(0) - 13 : Y(q.h);
      svgEl("path", { d: `M${x},${y} C${x},${(y + cy) / 2} ${cx},${(y + cy) / 2} ${cx},${cy}`, class: "tedge" }, gE);
      walk(c, ct);
    }
    const g = svgEl("g", { class: "tnode" + (S.selected === ft.path ? " sel" : "") + (ft.choice ? " migrated" : "") }, gN);
    svgEl("circle", { cx: x, cy: y, r: 15 }, g);
    const lab = svgEl("text", { x, y: y - 21, "text-anchor": "middle" }, g);
    lab.textContent = nodeName(ft);
    const idx = svgEl("text", { x, y: y + 4, "text-anchor": "middle", style: "font-size:10px" }, g);
    idx.textContent = ft.choice ? "#" + (ft.choice + 1) : "•";
    g.addEventListener("click", () => { S.selected = ft.path; render(); });
    g.addEventListener("pointerenter", (e) => tip(`<b>${esc(nodeName(ft))}</b><br><span class="mono">${esc(O.format(ft.value))}</span><br>split ${ft.choice + 1} of ${ft.splitCount}${ft.choice ? "" : " (primary)"} · click for details`, e));
    g.addEventListener("pointerleave", () => tip(null));
    // rotation controls
    if (F.canRotateLeft(S.tree, ft.path)) rotButton(gN, x - 33, y + 8, "↶", "A(BC) → (AB)C", () => applyTree(F.rotateLeft(S.tree, ft.path)));
    if (F.canRotateRight(S.tree, ft.path)) rotButton(gN, x + 33, y + 8, "↷", "(AB)C → A(BC)", () => applyTree(F.rotateRight(S.tree, ft.path)));
  };
  walk(S.ft, S.tree);
}
function rotButton(parent, x, y, sym, title, onClick) {
  const g = svgEl("g", { class: "rot" }, parent);
  svgEl("rect", { x: x - 12, y: y - 11, width: 24, height: 22, rx: 6 }, g);
  const t = svgEl("text", { x, y: y + 5.5, "text-anchor": "middle" }, g);
  t.textContent = sym;
  g.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
  g.addEventListener("pointerenter", (e) => tip("Re-associate: " + title, e));
  g.addEventListener("pointerleave", () => tip(null));
}
const subDigits = (n) => String(n).split("").map((c) => "₀₁₂₃₄₅₆₇₈₉"[+c]).join("");

function applyTree(t) {
  S.tree = F.relabel(t);
  S.choices = {};
  S.selected = "";
  recompute({ trackChange: true });
}

// ---------------------------------------------------------------------------------------
// Rendering: factor table, formula, node detail

function leafKind(v) {
  const n = O.norm(v);
  if (n % 2n === 0n) return `<span class="badge">norm even</span>`;
  if (O.isPrimary(v)) return `<span class="badge ok">primary</span>`;
  if (O.isOneMod2(v)) return `<span class="badge ok">−primary</span>`;
  return `<span class="badge warn">unit · primary</span>`;
}

function renderFactor() {
  const k = S.primes.length;
  const nInt = F.countInternal(S.tree || F.leaf(0));
  const U = F.unitCount();
  if (!S.ft) {
    $("formula").textContent = S.alpha ? "α is a unit — nothing to factor." : "";
    $("verify").textContent = "";
    clear($("factor-table"));
    $("count-line").textContent = "";
    $("node-detail").textContent = "";
    $("changed-note").textContent = "";
    return;
  }
  const orderings = multinomial(S.primes);
  $("count-line").innerHTML = `${k} factors · ${esc(F.catalan(k - 1).toString())} bracketings · ${esc(orderings.toString())} orderings of the primes · ` +
    `each (ordering, bracketing) has exactly ${U}${sup(nInt)} = ${esc(fmtBig(BigInt(U) ** BigInt(nInt)))} factorizations — shown: the normalized one` +
    (S.ring === "H" ? " <b>(in ℍ)</b>" : "");
  const names = S.primes.map((_, i) => "π" + subDigits(i + 1));
  $("formula").textContent = "α = " + stripOuter(F.treeToString(S.tree, names));
  const ok = O.equals(F.evaluate(S.ft), S.alpha);
  $("verify").innerHTML = ok
    ? `<span class="badge ok">✓ verified</span> multiplying the factors in this bracketing returns α exactly`
    : `<span class="badge bad">✗</span> product does not return α (bug)`;
  // table
  const tbl = $("factor-table");
  clear(tbl);
  tbl.append(el("tr", {}, el("th", {}, "i"), el("th", {}, "N"), el("th", {}, "factor πᵢ"), el("th", {}, "")));
  const prev = S.prevKeys ? new Set(S.prevKeys) : null;
  let nChanged = 0;
  F.leafValues(S.ft).forEach((v, i) => {
    const changed = prev && !prev.has(O.key(v));
    if (changed) nChanged++;
    const up = i === 0 && O.norm(v) % 2n === 1n ? F.unitPrimary(v) : null;
    const extra = up ? `<div class="note">= ε·π with ε = <span class="mono">${esc(O.format(up.unit))}</span>, π = <span class="mono">${esc(O.format(up.primary))}</span></div>` : "";
    tbl.append(el("tr", { class: changed ? "changed" : "" },
      el("td", {}, "π" + subDigits(i + 1)),
      el("td", { style: `color:${primeColor(S.primes[i])}; font-weight:600` }, String(S.primes[i])),
      el("td", { class: "v", html: esc(O.format(v)) + extra }),
      el("td", { html: leafKind(v) })));
  });
  $("changed-note").innerHTML = prev
    ? (nChanged ? `${nChanged} of ${k} factors are new compared with the previous factorization (highlighted).` : `Same factors as before.`)
    : "";
  renderNodeDetail();
}
const stripOuter = (s) => (s.startsWith("(") && s.endsWith(")") ? s.slice(1, -1) : s);
function multinomial(ps) {
  const cnt = new Map();
  for (const p of ps) cnt.set(String(p), (cnt.get(String(p)) || 0) + 1);
  let r = fact(ps.length);
  for (const c of cnt.values()) r /= fact(c);
  return r;
}
const fact = (n) => { let r = 1n; for (let i = 2n; i <= BigInt(n); i++) r *= i; return r; };

function renderNodeDetail() {
  const box = $("node-detail");
  clear(box);
  const ft = S.ft;
  if (!ft || F.isLeaf(ft)) { box.textContent = "A single factor — no splits."; return; }
  let node = ft;
  for (const c of S.selected) node = c === "L" ? node.l : node.r;
  if (!node || F.isLeaf(node)) { node = ft; S.selected = ""; }
  const m = O.norm(node.l.value), n = O.norm(node.r.value);
  const isRoot = node.path === "";
  const kv = el("div", { class: "kv" });
  const add = (k, v, mono = true) => { kv.append(el("div", { class: "k" }, k), el("div", { class: mono ? "v" : "", html: v })); };
  add("node", esc(nodeName(node)) + (isRoot ? " (root = α)" : ""), false);
  add("value", esc(O.format(node.value)));
  add("left factor", esc(O.format(node.l.value)) + ` <span class="muted ui">N = ${m}</span>`);
  add("right factor", esc(O.format(node.r.value)) + ` <span class="muted ui">N = ${n}</span>`);
  box.append(kv);
  // metamigration control
  const U = node.splitCount;
  const ctl = el("div", { class: "row", style: "margin-top:10px" },
    el("span", { class: "ui small" }, "Split"),
    el("button", { class: "btn", onclick: () => setChoice(node.path, (node.choice - 1 + U) % U) }, "◀"),
    el("span", { class: "mono" }, `${node.choice + 1} / ${U}`),
    el("button", { class: "btn", onclick: () => setChoice(node.path, (node.choice + 1) % U) }, "▶"),
    el("button", { class: "btn", onclick: () => setChoice(node.path, Math.floor(Math.random() * U)) }, "random"),
    node.choice ? el("button", { class: "btn", onclick: () => setChoice(node.path, 0) }, "primary") : null);
  box.append(ctl);
  box.append(el("div", { class: "note", html:
    `The ${U} ways to write this node as (norm ${m})·(norm ${n}) are the ${U} minimal vectors of ` +
    `${S.ring === "H" ? "ℍx + " + n + "ℍ" : "𝕆x + " + n + "𝕆"} (right factors). Split 1 takes the right factor primary (≡ 1 mod 2, first coordinate &gt; 0)` +
    (node.normalized === "left" ? "; here the right norm is even, so the left factor is normalized instead." : ".") +
    ` Changing it migrates units through everything below this node.` }));
  // divisibility of α by spine subproducts
  if (!isRoot) {
    const [i, j] = node.interval, k = S.primes.length;
    const msgs = [];
    if (i === 0) msgs.push(F.leftDivides(node.value, S.alpha) ? `<span class="badge ok">left divisor of α</span>` : `<span class="badge bad">not a left divisor of α</span> although it divides its parent — divisibility is not transitive`);
    if (j === k - 1) msgs.push(F.rightDivides(node.value, S.alpha) ? `<span class="badge ok">right divisor of α</span>` : `<span class="badge bad">not a right divisor of α</span>`);
    if (msgs.length) box.append(el("div", { class: "verify", html: msgs.join(" ") }));
  }
  // associators at this node
  const asc = [];
  if (!F.isLeaf(node.l)) {
    const A = node.l.l.value, Bv = node.l.r.value, C = node.r.value;
    const z = O.associator(A, Bv, C);
    asc.push(`(AB)C at this node: [A, B, C] = (AB)C − A(BC) ${O.isZero(z) ? "= 0" : "has norm " + esc(fmtBig(O.norm(z)))}`);
  }
  if (!F.isLeaf(node.r)) {
    const A = node.l.value, Bv = node.r.l.value, C = node.r.r.value;
    const z = O.associator(A, Bv, C);
    asc.push(`A(BC) at this node: [A, B, C] = (AB)C − A(BC) ${O.isZero(z) ? "= 0" : "has norm " + esc(fmtBig(O.norm(z)))}`);
  }
  if (asc.length) box.append(el("div", { class: "note", html: asc.join("<br>") + "<br>A nonzero associator means re-associating here (↶/↷) forces different factors." }));
}
function setChoice(path, i) {
  // reset metamigrations below this node; they index splits of a node that just changed
  for (const p of Object.keys(S.choices)) if (p.startsWith(path) && p !== path) delete S.choices[p];
  S.choices[path] = i;
  S.selected = path;
  recompute({ trackChange: true });
}

// ---------------------------------------------------------------------------------------
// Tabs, theme, wiring

function render() {
  renderSide();
  if (S.tab === "factor") { renderTree(); renderFactor(); }
  if (S.tab === "box") renderBoxView(S, { primeColor, subDigits });
  if (S.tab === "g2") g2 && g2.render();
  if (S.tab === "fano") fano && fano.render();
}

let g2 = null, fano = null;
function setTab(t) {
  S.tab = t;
  for (const b of document.querySelectorAll(".tab")) b.setAttribute("aria-selected", b.dataset.tab === t ? "true" : "false");
  for (const s of document.querySelectorAll("[data-view]")) s.hidden = s.dataset.view !== t;
  const wide = t === "g2" || t === "notes" || t === "fano";
  $("side").hidden = wide;
  $("layout").style.gridTemplateColumns = wide ? "1fr" : "";
  if (t === "g2" && !g2) g2 = initG2();
  if (t === "fano" && !fano) fano = initFanoE8(() => S);
  if (t === "notes") renderNotes();
  try { localStorage.setItem("octavians.tab", t); } catch (e) { /* storage unavailable */ }
  tip(null);
  render();
}
let notesDone = false;
function renderNotes() {
  if (notesDone || !window.renderMathInElement) {
    if (!window.renderMathInElement) setTimeout(() => S.tab === "notes" && renderNotes(), 300);
    return;
  }
  window.renderMathInElement($("notes"), { delimiters: [{ left: "$$", right: "$$", display: true }, { left: "$", right: "$", display: false }], throwOnError: false });
  notesDone = true;
}

function setTheme(th) {
  if (th) document.documentElement.setAttribute("data-theme", th);
  else document.documentElement.removeAttribute("data-theme");
  const dark = th ? th === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
  $("theme-btn").textContent = dark ? "☀" : "☾";
  try { th ? localStorage.setItem("octavians.theme", th) : localStorage.removeItem("octavians.theme"); } catch (e) { /* ignore */ }
  if (g2 && S.tab === "g2") g2.render();
  if (fano && S.tab === "fano") fano.render();
}

function init() {
  const ex = $("examples");
  EXAMPLES.forEach((e, i) => ex.append(el("option", { value: String(i) }, e.label)));
  ex.addEventListener("change", () => {
    if (ex.value === "") return;
    const e = EXAMPLES[+ex.value];
    $("alpha-input").value = e.src;
    setAlpha(e.src);
    ex.value = "";
  });
  $("alpha-go").addEventListener("click", () => setAlpha($("alpha-input").value));
  $("alpha-input").addEventListener("keydown", (e) => { if (e.key === "Enter") setAlpha($("alpha-input").value); });
  $("build-go").addEventListener("click", () => {
    try {
      const ps = $("build-primes").value.split(/[\s,·*]+/).filter(Boolean).map((s) => BigInt(s));
      if (!ps.length) throw new Error("list some primes, e.g. 3 5 7");
      for (const p of ps) if (!F.isProbablePrime(p)) throw new Error(p + " is not prime");
      if (ps.length > MAX_FACTORS) throw new Error("at most " + MAX_FACTORS + " primes");
      F.setRing(S.ring);
      const a = F.randomPrimitive(ps);
      const s = O.formatAscii(a);
      $("alpha-input").value = s;
      setAlpha(s);
      S.primes = ps.slice();
      S.choices = {};
      recompute();
    } catch (e) { S.error = e.message; render(); }
  });
  for (const b of $("ring-seg").querySelectorAll("button")) b.addEventListener("click", () => setRing(b.dataset.ring));
  $("ord-sort").addEventListener("click", () => { S.primes = S.primes.slice().sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)); S.choices = {}; recompute({ trackChange: true }); });
  $("ord-rev").addEventListener("click", () => { S.primes = S.primes.slice().reverse(); S.choices = {}; recompute({ trackChange: true }); });
  $("ord-shuffle").addEventListener("click", () => {
    const a = S.primes.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    S.primes = a; S.choices = {}; recompute({ trackChange: true });
  });
  for (const b of document.querySelectorAll("[data-tree]")) b.addEventListener("click", () => {
    const k = S.primes.length;
    if (!k) return;
    const t = { left: F.leftComb, right: F.rightComb, balanced: (n) => F.balanced(n), random: (n) => F.randomTree(n) }[b.dataset.tree](k);
    applyTree(t);
  });
  for (const b of document.querySelectorAll(".tab")) b.addEventListener("click", () => setTab(b.dataset.tab));
  $("theme-btn").addEventListener("click", () => {
    const cur = document.documentElement.getAttribute("data-theme");
    const dark = cur ? cur === "dark" : window.matchMedia("(prefers-color-scheme: dark)").matches;
    setTheme(dark ? "light" : "dark");
  });
  let th = null, tab = "factor";
  try { th = localStorage.getItem("octavians.theme"); tab = localStorage.getItem("octavians.tab") || "factor"; } catch (e) { /* ignore */ }
  setTheme(th);
  const params = new URLSearchParams(location.search);
  const src = params.get("a") || EXAMPLES[1].src;
  $("alpha-input").value = src;
  setAlpha(src);
  setTab(params.get("tab") || tab);
  window.octavians = { O, F, S, setAlpha, setTab, recompute, applyTree };
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
