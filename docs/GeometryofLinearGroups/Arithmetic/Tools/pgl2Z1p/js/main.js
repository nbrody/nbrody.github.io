// Unravelling PGL₂(ℤ[1/p]) — page wiring. Every piece of mathematics is typeset by KaTeX
// (figure labels sit in HTML layers over the SVG/canvas); input is MathQuill.
import * as E from "./exact.js";
import { H2View, mobius, toFloat, BASE_TILE, INF, cssVar } from "./h2.js";
import { TreeView, buildTree, el } from "./tree.js";
import { tex, rich, renderStaticMath, TexLayer, vertexTeX } from "./tex.js";
import { parseWordLatex, evalEntryLatex, plainWordToLatex } from "./latexInput.js";

const PRIMES = [2, 3, 5, 7, 11, 13];
const state = { p: 3 };

// ================================================================ utilities

const ease = (s) => (s < 0.5 ? 2 * s * s : 1 - Math.pow(-2 * s + 2, 2) / 2);
function animate(ms, frame, done) {
  let cancelled = false, raf = 0, start = null;
  const finish = () => { frame(1); done?.(); };
  if (document.hidden || ms <= 0) { finish(); return { cancel() {} }; }
  const tick = (ts) => {
    if (cancelled) return;
    if (start === null) start = ts;
    const s = Math.min(1, (ts - start) / ms);
    frame(s);
    if (s < 1) raf = requestAnimationFrame(tick); else done?.();
  };
  raf = requestAnimationFrame(tick);
  const onHide = () => { if (document.hidden && !cancelled) { cancelled = true; cancelAnimationFrame(raf); finish(); } };
  document.addEventListener("visibilitychange", onHide, { once: true });
  return { cancel() { cancelled = true; cancelAnimationFrame(raf); } };
}

function isDark() {
  const t = document.documentElement.dataset.theme;
  return t === "dark" || (t !== "light" && matchMedia("(prefers-color-scheme: dark)").matches);
}
let COL = null;
function colors() {
  if (COL) return COL;
  const v = (n) => cssVar(n);
  COL = {
    sheet: v("--sheet"), paper: v("--paper"), ink: v("--ink"), soft: v("--ink-soft"), faint: v("--ink-faint"),
    rule: v("--rule"), farey: v("--farey"), fareyCur: v("--farey-cur"),
    up: v("--up"), upWash: v("--up-wash"), down: v("--down"), downWash: v("--down-wash"),
    lam: v("--lam"), lamWash: v("--lam-wash"), target: v("--target"), targetWash: v("--target-wash"),
  };
  return COL;
}
// ordinal blue ramp (reference palette); distance 0 is the most prominent step
const RAMP_LIGHT = ["#0d366b", "#104281", "#184f95", "#1c5cab", "#256abf", "#2a78d6", "#3987e5", "#5598e7", "#6da7ec", "#86b6ef"];
const RAMP_DARK = ["#cde2fb", "#b7d3f6", "#9ec5f4", "#86b6ef", "#6da7ec", "#5598e7", "#3987e5", "#2a78d6", "#256abf", "#1c5cab", "#184f95"];
function ramp(d, r) {
  const R = isDark() ? RAMP_DARK : RAMP_LIGHT;
  if (r <= 0) return R[0];
  return R[Math.round((d / r) * (R.length - 1))];
}
function mix(h1, h2, s) {
  const a = parseInt(h1.slice(1), 16), b = parseInt(h2.slice(1), 16);
  const ch = (x, sh) => (x >> sh) & 255;
  const m = (sh) => Math.round(ch(a, sh) * (1 - s) + ch(b, sh) * s);
  return `rgb(${m(16)},${m(8)},${m(0)})`;
}
// a positioned wrapper around a figure, so a TeX layer can sit on it
function wrapHost(fig) {
  if (fig.parentNode.classList.contains("fig-host")) return fig.parentNode;
  const host = document.createElement("div");
  host.className = "fig-host";
  fig.parentNode.insertBefore(host, fig);
  host.appendChild(fig);
  return host;
}

const letterTeX = (step) => (step.kind === "up" ? "t^{-1}" : `T^{${step.j}}t`);
const pmat = (m, small = false) => {
  const env = small ? "psmallmatrix" : "pmatrix";
  return `\\begin{${env}} ${m.a} & ${m.b} \\\\ ${m.c} & ${m.d} \\end{${env}}`;
};
const qTeX = (q) => q.toTeX();
const vTeX = (v) => `\\fl{${qTeX(v.q)}}{${v.n}}`;
// the tessellation p^n 𝓕 + q at a vertex, as TeX
const tessTeX = (v, p) => `${v.n === 0 ? "" : v.n === 1 ? p : `${p}^{${v.n}}`}\\mathcal{F}${v.q.isZero() ? "" : ` + ${qTeX(v.q)}`}`;

// ================================================================ prime selector

function setupPrimes() {
  const seg = document.getElementById("prime-seg");
  const urlP = parseInt(new URLSearchParams(location.search).get("p"), 10);
  if (PRIMES.includes(urlP)) state.p = urlP;
  seg.innerHTML = PRIMES.map((p) => `<button type="button" data-p="${p}" aria-pressed="${p === state.p}">${tex(String(p))}</button>`).join("");
  seg.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-p]");
    if (!b) return;
    setPrime(parseInt(b.dataset.p, 10));
  });
}
function setPrime(p) {
  if (p === state.p) return;
  state.p = p;
  document.querySelectorAll("#prime-seg button").forEach((b) => b.setAttribute("aria-pressed", String(+b.dataset.p === p)));
  const u = new URL(location.href); u.searchParams.set("p", p); history.replaceState(null, "", u);
  ballReset(); conjReset(); foldDraw(); walkRun();
}

// ================================================================ §1  the ball

const ball = { r: 2, sel: null, verts: new Map(), dots: [], tree: null, h2: null, tv: null };

function rMax(p) {
  let r = 0;
  while (1 + ((p + 1) * (Math.pow(p, r + 1) - 1)) / (p - 1) <= 520) r++;
  return Math.max(1, r);
}

function ballSetup() {
  ball.tv = new TreeView(document.getElementById("ball-tree"), {
    height: 360,
    onSelect: (v) => { ball.sel = v; ballRenderTree(); ballDraw(); ballReadout(); },
  });
  ball.h2 = new H2View(document.getElementById("ball-h2"), {
    onViewChange: () => ballDraw(),
    onHover: (h) => ballHover(h),
  });
  const slider = document.getElementById("ball-r");
  slider.addEventListener("input", () => { ball.r = +slider.value; ballBuild(); });
  document.getElementById("ball-reset").addEventListener("click", () => { ballHome(); ballDraw(); });
  ballReset();
}
function ballHome() { ball.h2.userMoved = false; ball.h2.setView(ball.h2.fitView(-0.55, 1.55, 1.25, 0.02)); }
function conjHome() { const p = state.p; conj.h2.userMoved = false; conj.h2.setView(conj.h2.fitView(-0.35, p / 2 + 0.35, Math.max(1.35, p * 0.32), 0.03)); }
function ballReset() {
  const p = state.p, slider = document.getElementById("ball-r");
  slider.max = rMax(p);
  ball.r = Math.min(ball.r, rMax(p));
  slider.value = ball.r;
  ball.sel = E.origin(p);
  ballHome();
  ballBuild();
}
function ballBuild() {
  const p = state.p, r = ball.r, o = E.origin(p);
  document.getElementById("ball-r-out").innerHTML = tex(String(r));
  document.getElementById("ball-r-read").innerHTML = tex(String(r));
  const root = r === 0 ? o : E.canonVertex(p, 0, -r);
  ball.tree = buildTree(root, (v) => E.treeDistance(o, v) < r || (v.q.isZero() && v.n < 0), {
    maxNodes: 2400, keepChild: (c) => E.treeDistance(o, c) <= r,
  });
  ball.verts = new Map();
  for (const n of ball.tree.nodes.values()) ball.verts.set(n.key, { v: n.v, d: E.treeDistance(o, n.v) });
  if (!ball.verts.has(ball.sel?.key)) ball.sel = o;
  ballLegend();
  ballRenderTree();
  ballDraw();
  ballReadout();
}
function ballRenderTree() {
  const r = ball.r;
  ball.tv.render(ball.tree, {
    vertexFill: (n) => ramp(ball.verts.get(n.key).d, r),
    vertexRadius: (n) => (n.v.n === 0 && n.v.q.isZero() ? 5.5 : ball.sel && n.key === ball.sel.key ? 5.5 : 3.8),
    vertexClass: (n) => (ball.sel && n.key === ball.sel.key ? "is-sel" : ""),
    labelPriority: (n) => {
      const d = ball.verts.get(n.key).d;
      if (ball.sel && n.key === ball.sel.key) return 1000;
      if (d === 0) return 900;
      if (d <= 2) return 100 - 10 * d - n.depth * 0.01;
      return null;
    },
    labelClass: (n) => (ball.sel && n.key === ball.sel.key ? "is-strong" : ""),
  });
}
function ballLegend() {
  const r = ball.r;
  const cells = [];
  for (let d = 0; d <= r; d++) cells.push(`<span class="lg-cell"><i class="lg-sw" style="background:${ramp(d, r)}"></i>${tex(String(d))}</span>`);
  document.getElementById("ball-legend").innerHTML = `<span class="ctl-label">${rich("tree distance from $o$")}</span>${cells.join("")}`;
}
function ballDraw() {
  const v = ball.h2, C = colors(), p = state.p, r = ball.r;
  v.clear(C.sheet);
  v.farey(1, 0, { color: C.farey, width: 1 });
  if (ball.sel) {
    const s = ball.sel, alpha = Math.pow(p, s.n), beta = s.q.toNumber();
    v.polygon(v.tileVerts({ a: alpha, b: beta, c: 0, d: 1 }), { fill: C.targetWash, alpha: 0.9 });
    v.farey(alpha, beta, { color: C.target, width: 1.25 });
    v.polygon(v.tileVerts({ a: alpha, b: beta, c: 0, d: 1 }), { stroke: C.target, width: 2 });
  }
  ball.dots = [];
  const list = [...ball.verts.values()].sort((a, b) => b.d - a.d);
  // one filled path per distance (far first, so near points sit on top)
  const ctx = v.ctx;
  let curD = null;
  const flush = () => { if (curD !== null) { ctx.fillStyle = ramp(curD, r); ctx.fill(); } };
  for (const { v: vert, d } of list) {
    if (d !== curD) { flush(); ctx.beginPath(); curD = d; }
    const alpha = Math.pow(p, vert.n), beta = vert.q.toNumber();
    const pts = v.orbitPoints(alpha, beta, { minPx: 1.8, maxPts: 6000 });
    const rad = d === 0 ? 3 : 2.3;
    for (const z of pts) {
      const x = v.sx(z.x), y = v.sy(z.y);
      ctx.moveTo(x + rad, y); ctx.arc(x, y, rad, 0, 2 * Math.PI);
      ball.dots.push({ z, vert, d });
    }
  }
  flush();
  v.realAxis(C.soft);
  v.axisTicks();
}
function ballHover(h) {
  const tip = document.getElementById("ball-tip");
  if (!h) { tip.hidden = true; return; }
  let best = null, bd = 64;
  for (const dt of ball.dots) {
    const dx = ball.h2.sx(dt.z.x) - h.px, dy = ball.h2.sy(dt.z.y) - h.py, q = dx * dx + dy * dy;
    if (q < bd) { bd = q; best = dt; }
  }
  if (!best) { tip.hidden = true; return; }
  tip.hidden = false;
  tip.innerHTML = rich(`on the tessellation of $${vertexTeX(best.vert)}$, distance $${best.d}$`);
  tip.style.left = h.px + "px"; tip.style.top = h.py + "px";
}
function ballReadout() {
  const s = ball.sel, p = state.p;
  if (!s) return;
  const d = E.treeDistance(E.origin(p), s);
  document.getElementById("ball-readout").innerHTML =
    `<span>${rich(`selected $${vTeX(s)} = ${pmat({ a: E.qpow(p, s.n).toTeX(), b: qTeX(s.q), c: 0, d: 1 }, true)}\\cdot o$`)}</span>` +
    `<span>${rich(`distance $${d}$`)}</span>` +
    `<span>${rich(`tessellation $${tessTeX(s, p)}$`)}</span>`;
}

// ================================================================ §2  the conjugation

const conj = { s: 0, h2: null, tv: null, anim: null, g: null };

function upperDomain(p) {
  // fundamental domain for Λ⁰(p): 0 ≤ Re z ≤ p/2 above the arcs |z − k| = 1, k ≥ 1
  const verts = [INF, { x: 0, y: 0 }];
  for (let x = 1.5; x < p / 2 - 1e-9; x += 1) verts.push({ x, y: Math.sqrt(3) / 2 });
  const end = p / 2, frac = Math.abs(end - Math.round(end));
  verts.push({ x: end, y: Math.sqrt(1 - frac * frac) });
  // its p+1 tiles: coset representatives of Λ⁰(p)\Λ
  const reps = [{ a: 0, b: 1, c: 1, d: 0 }];
  for (let k = 0; k < p; k++) reps.push(k % 2 === 0 ? { a: 1, b: k / 2, c: 0, d: 1 } : { a: -1, b: (k + 1) / 2, c: 0, d: 1 });
  return { verts, tiles: reps.map((m) => BASE_TILE.map((z) => mobius(m, z))) };
}
const scalePt = (z, f) => (z.y === Infinity ? z : { x: z.x * f, y: z.y * f });

function conjSetup() {
  conj.h2 = new H2View(document.getElementById("conj-h2"), { onViewChange: () => conjDraw() });
  conj.tv = new TreeView(document.getElementById("conj-tree"), { height: 250, showLevels: true });
  const slider = document.getElementById("conj-s");
  slider.addEventListener("input", () => { conj.anim?.cancel(); conj.s = +slider.value; conjDraw(); });
  document.getElementById("conj-play").addEventListener("click", () => {
    conj.anim?.cancel();
    const from = conj.s >= 0.999 ? 0 : conj.s;
    conj.anim = animate(1800 * (1 - from), (u) => { conj.s = from + (1 - from) * ease(u); slider.value = conj.s; conjDraw(); });
  });
  document.getElementById("conj-another").addEventListener("click", () => { conjNewElement(); });
  conjReset();
}
function conjReset() {
  conj.s = 0;
  document.getElementById("conj-s").value = 0;
  conjHome();
  conjNewElement();
  conjTree();
  conjDraw();
}
function conjNewElement() {
  const p = state.p;
  let g = null;
  for (let tries = 0; tries < 200; tries++) {
    const c = E.randomLowerCongruence(p, 3 + Math.floor(Math.random() * 3));
    const big = [c.a, c.b, c.c, c.d].some((x) => E.babs(x) > 60n);
    if (!big && c.c !== 0n && c.b !== 0n) { g = c; break; }
  }
  if (!g) g = { a: 1n, b: 1n, c: BigInt(p), d: BigInt(p + 1) };
  conj.g = g;
  const h = E.conjugateByT(g, p);
  const P = BigInt(p);
  const src = `g = \\begin{pmatrix} ${g.a} & \\htmlClass{c-down}{${g.b}} \\\\ \\htmlClass{c-up}{${g.c}} & ${g.d}\\end{pmatrix} \\in \\htmlClass{c-up}{\\Lambda_0(${p})}`;
  const dst = `tgt^{-1} = \\begin{pmatrix} ${h.a} & \\htmlClass{c-down}{${h.b}} \\\\ \\htmlClass{c-up}{${h.c}} & ${h.d}\\end{pmatrix} \\in \\htmlClass{c-down}{\\Lambda^0(${p})}`;
  document.getElementById("conj-demo").innerHTML =
    tex(src, true) + tex(dst, true) +
    `<p class="md-note">${rich(`$c = ${g.c} \\mapsto c/${p} = ${g.c / P}$ and $b = ${g.b} \\mapsto ${p}b = ${h.b}$; the diagonal is untouched.`)}</p>`;
}
function conjTree() {
  const p = state.p;
  const root = E.canonVertex(p, 0, -2);
  const spineKeys = new Set([-2, -1, 0, 1].map((n) => E.canonVertex(p, 0, n).key));
  const tree = buildTree(root, (v) => spineKeys.has(v.key), { maxNodes: 400 });
  conj.tree = tree;
  conj.tv.render(tree, {
    vertexClass: (n) => (n.v.q.isZero() && n.v.n === 0 ? "is-o" : ""),
    vertexRadius: (n) => (n.v.q.isZero() ? 4.6 : 3.4),
    labelPriority: (n) => (n.v.q.isZero() ? 100 - Math.abs(n.v.n) : n.depth === 3 ? 10 - n.v.digit() * 0.1 : null),
  });
  conjTreeOverlay();
}
function conjTreeOverlay() {
  const p = state.p, tv = conj.tv;
  if (!tv.gOver) return;
  tv.clearOverlay();
  const P = (n) => tv.at(E.canonVertex(p, 0, n).key);
  const a = P(-1), b = P(0), c = P(1);
  el("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: "ov-edge-up" }, tv.gUnder);
  el("line", { x1: b.x, y1: b.y, x2: c.x, y2: c.y, class: "ov-edge-down" }, tv.gUnder);
  const s = ease(conj.s);
  const A = { x: a.x + (b.x - a.x) * s, y: a.y + (b.y - a.y) * s };
  const B = { x: b.x + (c.x - b.x) * s, y: b.y + (c.y - b.y) * s };
  el("line", { x1: A.x, y1: A.y, x2: B.x, y2: B.y, class: "ov-moving" }, tv.gOver);
  el("circle", { cx: A.x, cy: A.y, r: 4.5, class: "ov-glide" }, tv.gOver);
  el("circle", { cx: B.x, cy: B.y, r: 4.5, class: "ov-glide" }, tv.gOver);
}
function conjDraw() {
  const v = conj.h2, C = colors(), p = state.p, s = conj.s;
  const f = Math.pow(p, s - 1);
  const dom = upperDomain(p);
  v.clear(C.sheet);
  v.farey(1, 0, { color: C.farey, width: 1 });
  // moving tessellation: the one at t^{s-1}·o
  v.farey(f, 0, { color: mix(C.up, C.down, s), width: 0.9, alphaFade: 0.45 });
  // target: Λ⁰(p) domain
  v.polygon(dom.verts, { fill: C.downWash, alpha: 0.75 });
  v.polygon(dom.verts, { stroke: C.down, width: 2, dash: [7, 5] });
  // moving: p^s · t^{-1}P_p  (a Λ₀(p) domain at s = 0)
  const col = mix(C.up, C.down, s);
  v.polygon(dom.verts.map((z) => scalePt(z, f)), { fill: col, alpha: 0.2 });
  for (const t of dom.tiles) v.polygon(t.map((z) => scalePt(z, f)), { stroke: col, width: 0.9, alpha: 0.9 });
  v.polygon(dom.verts.map((z) => scalePt(z, f)), { stroke: col, width: 2.4 });
  v.realAxis(C.soft);
  v.axisTicks();
  document.getElementById("conj-s-read").innerHTML = rich(s < 0.005 ? `$s = 0$: the $\\Lambda_0(${p})$ domain` : s > 0.995 ? `$s = 1$: the $\\Lambda^0(${p})$ domain` : `$s = ${s.toFixed(2)}$`);
  conjTreeOverlay();
}

// ================================================================ §3  the fold

const fold = { s: 0, anim: null, layer: null };

function foldSetup() {
  const svg = document.getElementById("fold-svg");
  fold.layer = new TexLayer(wrapHost(svg));
  const slider = document.getElementById("fold-s");
  slider.addEventListener("input", () => { fold.anim?.cancel(); fold.s = +slider.value; foldDraw(); });
  document.getElementById("fold-play").addEventListener("click", () => {
    fold.anim?.cancel();
    const from = fold.s >= 0.999 ? 0 : fold.s;
    fold.anim = animate(2000 * (1 - from), (u) => { fold.s = from + (1 - from) * ease(u); slider.value = fold.s; foldDraw(); });
  });
  foldDraw();
}
function arrowHead(g, x, y, ang, cls) {
  const L = 10, Wd = 5;
  const p1 = [x, y], p2 = [x - L * Math.cos(ang) + Wd * Math.sin(ang), y - L * Math.sin(ang) - Wd * Math.cos(ang)];
  const p3 = [x - L * Math.cos(ang) - Wd * Math.sin(ang), y - L * Math.sin(ang) + Wd * Math.cos(ang)];
  el("path", { d: `M${p1} L${p2} L${p3} Z`, class: cls }, g);
}
function foldDraw() {
  const svg = document.getElementById("fold-svg"), L$ = fold.layer;
  const p = state.p, s = fold.s, se = ease(s);
  const W = Math.max(300, svg.clientWidth || 700), H = 400;
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  svg.replaceChildren();
  L$.clear();
  const cx = W / 2, cy = 222, L = Math.min(W * 0.34, 140);
  const deg = Math.PI / 180;
  const spread = 140 / Math.max(1, p - 1);
  // pair angles (screen coords, y down): the up pair at -90°, down pairs spread over the bottom
  const pairs = [{ ang: -90 * deg, out: "\\sigma t", inn: "t^{-1}", merged: "\\lfloor 0\\rfloor_{-1}", kind: "up", d0: 11 * deg }];
  for (let j = 0; j < p; j++) {
    pairs.push({ ang: (160 - j * spread) * deg, out: `T^{${j}}t`, inn: `T^{${j}}\\sigma t^{-1}`, merged: `\\lfloor ${j}\\rfloor_{1}`, kind: "down", j, d0: Math.min(9, spread * 0.2) * deg });
  }
  const showLabel = (pr) => p <= 5 || pr.kind === "up" || pr.j === 0 || pr.j === 1 || pr.j === p - 1;
  const g = el("g", {}, svg);
  for (const pr of pairs) {
    const dlt = pr.d0 * (1 - se);
    const aOut = pr.ang - dlt, aIn = pr.ang + dlt;
    const Lr = L * (pr.kind === "up" ? 0.95 : 1);
    const po = { x: cx + Lr * Math.cos(aOut), y: cy + Lr * Math.sin(aOut) };
    const pi = { x: cx + Lr * Math.cos(aIn), y: cy + Lr * Math.sin(aIn) };
    // incoming c′t⁻¹ edge (dashed), arrow pointing toward o
    el("line", { x1: pi.x, y1: pi.y, x2: cx, y2: cy, class: "fd-edge fd-in" }, g);
    const ma = { x: cx + 0.42 * Lr * Math.cos(aIn), y: cy + 0.42 * Lr * Math.sin(aIn) };
    arrowHead(g, ma.x, ma.y, aIn + Math.PI, "fd-arrow-in");
    // outgoing c·t edge, arrow pointing away from o
    el("line", { x1: cx, y1: cy, x2: po.x, y2: po.y, class: "fd-edge fd-out" + (se > 0.98 ? " fd-merged" : "") }, g);
    const mo = { x: cx + 0.8 * Lr * Math.cos(aOut), y: cy + 0.8 * Lr * Math.sin(aOut) };
    arrowHead(g, mo.x, mo.y, aOut, "fd-arrow-out");
    el("circle", { cx: po.x, cy: po.y, r: 5, class: "fd-v" }, g);
    el("circle", { cx: pi.x, cy: pi.y, r: 5, class: "fd-v", opacity: 1 - se * 0.9 }, g);
    if (!showLabel(pr)) continue;
    // the up edge keeps t⁻¹ and the down edges keep T^j t; the other name fades out and the
    // vertex's name in the upper-half-plane model fades in
    const keepOut = pr.kind === "down";
    const polar = (r, a) => ({ x: cx + r * Math.cos(a), y: cy + r * Math.sin(a) });
    const anchor = (x) => (Math.abs(x - cx) < 8 ? "middle" : x < cx ? "end" : "start");
    const fadeOut = keepOut ? 1 : 1 - se, fadeIn = keepOut ? 1 - se : 1;
    const nameOp = Math.max(0, (se - 0.5) / 0.5);
    if (pr.kind === "up") {
      L$.add(pr.out, po.x - 10, po.y, { anchor: "end", cls: "fd-lab out", opacity: fadeOut });
      L$.add(pr.inn, pi.x + 10, pi.y, { anchor: "start", cls: "fd-lab in", opacity: fadeIn });
      if (nameOp > 0) L$.add(pr.merged + " =", po.x - 10, po.y, { anchor: "end", cls: "fd-lab merged", opacity: nameOp });
    } else {
      const lo = polar(Lr + 22, aOut), li = polar(Lr + 22, aIn), lm = polar(Lr + 46, pr.ang);
      L$.add(pr.out, lo.x, lo.y, { anchor: anchor(lo.x), cls: "fd-lab out", opacity: fadeOut });
      if (fadeIn > 0) L$.add(pr.inn, li.x, li.y, { anchor: anchor(li.x), cls: "fd-lab in", opacity: fadeIn });
      if (nameOp > 0) L$.add("= " + pr.merged, lm.x, lm.y, { anchor: anchor(lm.x), cls: "fd-lab merged", opacity: nameOp });
    }
  }
  if (p > 5) L$.add("\\cdots", cx, cy + L + 30, { cls: "fd-lab" });
  el("circle", { cx, cy, r: 7, class: "fd-o" }, g);
  L$.add("o", cx + 12, cy - 12, { anchor: "start", cls: "fd-lab merged" });
  L$.add(rich(se < 0.5 ? `Bass–Serre tree of $\\Lambda *_t$: $${2 * p + 2}$ edges at every vertex` : `$T_{${p + 1}}$: $${p + 1}$ edges at every vertex`), 14, 20, { anchor: "start", cls: "fd-title", html: true });
  if (se > 0) L$.add(rich("$\\sigma t\\sigma = t^{-1}$, so $\\sigma t\\cdot o = t^{-1}\\cdot o$ and $T^j t\\cdot o = T^j\\sigma t^{-1}\\cdot o$"), 14, H - 16, { anchor: "start", cls: "fd-rel", opacity: se, html: true });
}

// ---------------------------------------------------------------- the graph-of-groups figure

function gogDraw() {
  const svg = document.getElementById("gog-svg");
  if (!svg) return;
  if (!svg._layer) svg._layer = new TexLayer(wrapHost(svg));
  const L$ = svg._layer, k = (svg.clientWidth || 600) / 600;
  L$.clear();
  const at = (src, x, y, o = {}) => L$.add(src, x * k, y * k, o);
  at(rich("$\\Lambda *_t$: a loop, before the fold"), 4, 12, { anchor: "start", cls: "gog-cap", html: true });
  at("\\Lambda", 60, 98, { baseline: "top" });
  at("t", 224, 74, { anchor: "start" });
  at("\\Lambda_0(p)", 140, 50, { cls: "gog-small" });
  at("\\big\\downarrow\\ \\text{conj. by } t", 140, 75, { cls: "gog-small" });
  at("\\Lambda^0(p)", 140, 100, { cls: "gog-small" });
  at("\\longrightarrow", 282, 72, {});
  at(rich("$\\Gamma$: a half-edge, after"), 330, 12, { anchor: "start", cls: "gog-cap", html: true });
  at("\\Lambda", 356, 98, { baseline: "top" });
  at("\\Lambda_0(p)", 430, 56, { cls: "gog-small" });
  at("\\langle \\Lambda_0(p), W_p\\rangle", 507, 98, { baseline: "top", cls: "gog-small" });
}

// ================================================================ §4  the walk

const walk = { nf: null, g: null, i: 0, playing: false, timer: null, anim: null, tv: null, h2: null, tree: null, lamWord: [], rest: [], mode: "word" };
const fields = {};

const PRESETS = [
  { label: "Up one, down two", mode: "word", word: "StTSt^{-1}StT" },
  { label: "Three steps up, because $\\sigma t\\sigma = t^{-1}$", mode: "word", word: "StSt^{-1}t^{-1}Tt" },
  { label: "The Fricke involution", mode: "word", word: "W" },
  { label: "Translation by $1/p$", mode: "word", word: "t^{-1}Tt" },
  { label: "Up two, down two", mode: "matrix", m: ["1", "\\frac{1}{p^2}", "0", "1"] },
  { label: "A matrix with $\\det = 1/p$", mode: "matrix", m: ["1+\\frac{1}{p}", "\\frac{1}{p^2}", "1", "\\frac{1}{p}"] },
  { label: "Down four", mode: "word", word: "tSt^{-1}TStTt" },
  { label: "A longer word", mode: "word", word: "tTtSt^{-1}T^2ttSRt" },
];
function presetTeX(pr) {
  if (pr.mode === "word") return pr.word;
  return `\\begin{psmallmatrix} ${pr.m[0]} & ${pr.m[1]} \\\\ ${pr.m[2]} & ${pr.m[3]} \\end{psmallmatrix}`;
}
function setMode(mode) {
  walk.mode = mode;
  document.querySelectorAll("#in-mode button").forEach((b) => b.setAttribute("aria-pressed", String(b.dataset.mode === mode)));
  document.getElementById("in-word-wrap").hidden = mode !== "word";
  document.getElementById("in-matrix-wrap").hidden = mode !== "matrix";
}

function mathquillSetup() {
  const MQ = window.MathQuill?.getInterface(2);
  if (!MQ) throw new Error("MathQuill did not load");
  const base = { spaceBehavesLikeTab: true, supSubsRequireOperand: true, handlers: { enter: () => walkRun() } };
  fields.word = MQ.MathField(document.getElementById("in-word"), { ...base, autoCommands: "sigma" });
  for (const k of ["a", "b", "c", "d"]) fields[k] = MQ.MathField(document.getElementById("m-" + k), { ...base, charsThatBreakOutOfSupSub: "+-=<>" });
  fields.word.latex(PRESETS[0].word);
  PRESETS[4].m.forEach((x, i) => fields["abcd"[i]].latex(x));
}

function walkSetup() {
  walk.tv = new TreeView(document.getElementById("walk-tree"), { height: 400 });
  walk.h2 = new H2View(document.getElementById("walk-h2"), { onViewChange: () => walkDrawH2(walk.i, 0, true) });
  mathquillSetup();
  setMode("word");
  document.querySelectorAll("#in-mode button").forEach((b) => b.addEventListener("click", () => setMode(b.dataset.mode)));
  // the examples menu
  const list = document.getElementById("presets-list");
  list.innerHTML = PRESETS.map((pr, i) => `<button type="button" data-i="${i}"><span class="pr-label">${rich(pr.label)}</span><span class="pr-math">${tex(presetTeX(pr))}</span></button>`).join("");
  list.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-i]");
    if (!b) return;
    const pr = PRESETS[+b.dataset.i];
    setMode(pr.mode);
    if (pr.mode === "word") fields.word.latex(pr.word);
    else pr.m.forEach((x, i) => fields["abcd"[i]].latex(x));
    document.getElementById("presets").open = false;
    walkRun();
  });
  document.getElementById("in-run").addEventListener("click", () => walkRun());
  document.getElementById("in-random").addEventListener("click", () => {
    setMode("word");
    let w;
    for (let t = 0; t < 50; t++) {
      w = E.randomWord(6 + Math.floor(Math.random() * 5));
      const nf = E.normalForm(E.parseWord(w, state.p).matrix, state.p);
      if (nf.e >= 2 && nf.e <= 7) break;
    }
    fields.word.latex(plainWordToLatex(w));
    walkRun();
  });
  document.getElementById("tr-step").addEventListener("click", () => walkStep());
  document.getElementById("tr-back").addEventListener("click", () => walkGo(walk.i - 1));
  document.getElementById("tr-reset").addEventListener("click", () => walkGo(0));
  document.getElementById("tr-end").addEventListener("click", () => walkGo(walkLast()));
  document.getElementById("tr-play").addEventListener("click", () => walkTogglePlay());
  // keyboard when the workbench is on screen (MathQuill's hidden textarea counts as typing)
  let benchVisible = false;
  new IntersectionObserver((ents) => { benchVisible = ents[0].isIntersecting; }, { threshold: 0.15 }).observe(document.getElementById("bench"));
  document.addEventListener("keydown", (e) => {
    if (!benchVisible || /INPUT|SELECT|TEXTAREA/.test(document.activeElement?.tagName || "")) return;
    if (e.key === "ArrowRight") { e.preventDefault(); walkStep(); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); walkGo(walk.i - 1); }
    else if (e.key === "Home") { e.preventDefault(); walkGo(0); }
    else if (e.key === "End") { e.preventDefault(); walkGo(walkLast()); }
  });
  walkRun();
}

const walkLast = () => (walk.nf ? walk.nf.steps.length + 1 : 0);

function walkRun() {
  const p = state.p, err = document.getElementById("in-err");
  walkStopPlay();
  walk.anim?.cancel();
  err.innerHTML = "";
  let g;
  try {
    if (walk.mode === "matrix") {
      const ent = ["a", "b", "c", "d"].map((k) => evalEntryLatex(fields[k].latex(), p));
      g = { a: ent[0], b: ent[1], c: ent[2], d: ent[3] };
    } else {
      g = parseWordLatex(fields.word.latex(), p).matrix;
    }
    walk.nf = E.normalForm(g, p);
  } catch (e) {
    err.innerHTML = rich(e.message);
    return;
  }
  walk.g = g;
  walk.lamWord = E.lambdaWord(walk.nf.lambda);
  walk.gFloat = toFloat(walk.nf.input);
  walkBuildTree();
  walkComputeRest();
  walkGo(0, true);
}

// prefix vertex after i letters (0 ≤ i ≤ k)
const prefixVertex = (i) => (i === 0 ? E.origin(state.p) : walk.nf.steps[i - 1].to);
const affineOf = (v) => ({ s: Math.pow(state.p, v.n), q: v.q.toNumber() });

function walkBuildTree() {
  const p = state.p, nf = walk.nf;
  const path = [E.origin(p), ...nf.steps.map((s) => s.to)];
  const rootLevel = -nf.m - 1;
  const root = E.canonVertex(p, 0, rootLevel);
  // strict ancestors of path vertices
  const anc = new Set();
  for (const v of path) {
    let u = v;
    while (u.n > rootLevel) { u = u.parent(); anc.add(u.key); }
  }
  const ctx = p === 2 ? 2 : p === 3 ? 1 : 0;
  const near = (v) => {
    if (ctx === 0) return false;
    let best = Infinity;
    for (const w of path) best = Math.min(best, E.treeDistance(v, w));
    return best < ctx;
  };
  walk.path = path;
  walk.tree = buildTree(root, (v) => anc.has(v.key) || near(v), { maxNodes: 1200 });
}

function walkRenderTree() {
  const nf = walk.nf, pathIndex = new Map(walk.path.map((v, i) => [v.key, i]));
  const tgt = nf.target.key, oKey = E.origin(state.p).key;
  const few = walk.tree.nodes.size <= 160;
  walk.tv.render(walk.tree, {
    vertexClass: (n) => (n.key === oKey ? "is-o" : pathIndex.has(n.key) ? "is-path" : ""),
    vertexRadius: (n) => (n.key === oKey ? 5.5 : pathIndex.has(n.key) ? 4.6 : 3.2),
    labelPriority: (n) => {
      if (n.key === tgt) return 1000;
      if (n.key === oKey) return 900;
      if (pathIndex.has(n.key)) return 500 - pathIndex.get(n.key);
      if (n.parent && pathIndex.has(n.parent.key)) return 50 - n.depth;
      return few ? 10 - n.depth : null;
    },
    labelClass: (n) => (pathIndex.has(n.key) ? "is-strong" : "is-dim"),
  });
}

function walkTreeOverlay(i, s = 0) {
  const tv = walk.tv, nf = walk.nf, k = nf.steps.length;
  tv.clearOverlay();
  const P = (v) => tv.at(v.key);
  nf.steps.forEach((st, idx) => {
    const a = P(st.from), b = P(st.to);
    if (!a || !b) return;
    const done = idx < i || (idx === i && s >= 1);
    el("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: done ? (st.kind === "up" ? "ov-up" : "ov-down") : "ov-pending" }, tv.gUnder);
    if (idx === i && i < k) el("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: st.kind === "up" ? "ov-next-up" : "ov-next-down" }, tv.gUnder);
    if (done || (idx === i && s > 0.5)) {
      const mx = (a.x + b.x) / 2, my = (a.y + b.y) / 2;
      const side = b.x >= a.x ? 1 : -1;
      tv.over.add(letterTeX(st), mx + (st.kind === "up" ? -8 : 8 * side), my, { anchor: st.kind === "up" ? "end" : side > 0 ? "start" : "end", cls: "ov-letter " + st.kind });
    }
  });
  const T = P(nf.target);
  if (T) el("circle", { cx: T.x, cy: T.y, r: 10, class: "ov-target" }, tv.gOver);
  let cur;
  if (i < k && s > 0) {
    const a = P(nf.steps[i].from), b = P(nf.steps[i].to), e = ease(s);
    cur = { x: a.x + (b.x - a.x) * e, y: a.y + (b.y - a.y) * e };
  } else {
    cur = P(prefixVertex(Math.min(i, k)));
  }
  if (cur) el("circle", { cx: cur.x, cy: cur.y, r: 6.5, class: "ov-cursor" }, tv.gOver);
}

// ---------------------------------------------------------------- H² for the walk

const affTile = (a) => BASE_TILE.map((z) => (z.y === Infinity ? z : { x: a.s * z.x + a.q, y: a.s * z.y }));

function walkComputeRest() {
  // camera per state: frame the body of the current tile (height ≈ pⁿ) together with the
  // tile it is about to move to (or the target tile g·P at the end), capping the zoom-out at 4×
  const v = walk.h2, nf = walk.nf, k = nf.steps.length;
  walk.rest = [];
  const body = (a) => ({ x0: a.q, x1: a.q + a.s / 2, s: a.s });
  const tv = v.tileVerts(walk.gFloat).filter((z) => z.y !== Infinity);
  const ys = tv.map((z) => z.y), xs = tv.map((z) => z.x);
  const tgt = { x0: Math.min(...xs), x1: Math.max(...xs), s: Math.max(...ys) / 1.15 };
  for (let i = 0; i <= k + 1; i++) {
    const cur = body(affineOf(prefixVertex(Math.min(i, k))));
    // the last frame shows the target tile g·P on its own scale: λ can push it deep into a cusp
    let other = i < k ? body(affineOf(prefixVertex(i + 1))) : tgt;
    const base = i === k + 1 ? tgt : cur;
    const ratio = Math.max(other.s / base.s, base.s / other.s);
    const far = Math.max(other.x1, base.x1) - Math.min(other.x0, base.x0) > 14 * Math.max(base.s, other.s);
    if (!(ratio < 60) || far) other = base;
    const smin = Math.min(base.s, other.s), smax = Math.max(base.s, other.s);
    const x0 = Math.min(base.x0, other.x0) - 0.7 * smin, x1 = Math.max(base.x1, other.x1) + 0.7 * smin;
    const yTop = 1.5 * Math.min(smax, 4 * smin);
    walk.rest.push(v.fitView(x0, x1, yTop, 0.04));
  }
}

function walkDrawH2(i, s, keepView = false) {
  const v = walk.h2, C = colors(), nf = walk.nf, p = state.p;
  if (!nf) return;
  const k = nf.steps.length;
  if (!keepView) v.setView(s > 0 && walk.rest[i + 1] ? H2View.lerpView(walk.rest[i], walk.rest[i + 1], ease(s)) : walk.rest[i]);
  v.clear(C.sheet);
  // home: the base tessellation and tile
  v.farey(1, 0, { color: C.farey, width: 0.9 });
  v.polygon(v.tileVerts({ a: 1, b: 0, c: 0, d: 1 }), { fill: C.farey, alpha: 0.55 });
  const cur = affineOf(prefixVertex(Math.min(i, k)));
  // the target tile g·P
  const tgt = v.tileVerts(walk.gFloat);
  v.polygon(tgt, { fill: C.targetWash, alpha: 0.85 });
  if (i < k) {
    const nxt = affineOf(prefixVertex(i + 1));
    const st = nf.steps[i];
    const kc = st.kind === "up" ? C.up : C.down;
    v.farey(cur.s, cur.q, { color: C.fareyCur, width: 1.1, alphaFade: 1 - s });
    v.farey(nxt.s, nxt.q, { color: kc, width: 1.1, dash: [5, 4], alphaFade: 0.85 * (1 - s) });
    if (s > 0) v.farey(nxt.s, nxt.q, { color: C.fareyCur, width: 1.1, alphaFade: s });
    v.polygon(affTile(cur), { fill: C.ink, alpha: 0.16 * (1 - s) });
    v.polygon(affTile(nxt), { stroke: kc, width: 2, dash: [6, 4] });
    if (s > 0) v.polygon(affTile(nxt), { fill: C.ink, alpha: 0.16 * s });
  } else {
    v.farey(cur.s, cur.q, { color: C.fareyCur, width: 1.1 });
  }
  v.polygon(tgt, { stroke: C.target, width: 2.6 });
  // λ: hop the tile along the prefixes of λ's word in S, T, R
  if (i >= k) {
    const lw = walk.lamWord, n = lw.length;
    let idx = i === k ? Math.min(n, Math.floor(ease(s) * (n + 1))) : n;
    if (i === k && s === 0) idx = 0;
    const m = toFloat(E.wordMatrix(lw.slice(0, idx), p));
    const comp = { a: cur.s * m.a + cur.q * m.c, b: cur.s * m.b + cur.q * m.d, c: m.c, d: m.d };
    v.polygon(v.tileVerts(comp), { fill: C.lam, alpha: 0.32, stroke: C.lam, width: 2 });
  }
  // marker: W(s)·i along the affine path
  let mk;
  if (i < k && s > 0) {
    const st = nf.steps[i];
    const x = st.kind === "up" ? 0 : s * st.j, y = st.kind === "up" ? Math.pow(p, -s) : Math.pow(p, s);
    mk = { x: cur.q + cur.s * x, y: cur.s * y };
  } else mk = { x: cur.q, y: cur.s };
  v.dot({ x: 0, y: 1 }, 3.2, C.soft);
  v.dot(mk, 5, C.ink, C.sheet);
  v.realAxis(C.soft);
  v.axisTicks();
}

// ---------------------------------------------------------------- the algebra panel

function wordTeX(upto, withRemainder = true) {
  const parts = walk.nf.steps.slice(0, upto).map((st) => (st.kind === "up" ? "\\htmlClass{c-up}{t^{-1}}" : `\\htmlClass{c-down}{(T^{${st.j}}t)}`));
  return parts.join("\\,") || (withRemainder ? "" : "1");
}
function lamWordTeX() {
  const lw = walk.lamWord;
  if (!lw.length) return "1";
  return lw.map(({ L, k }) => (k === 1 ? L : `${L}^{${k}}`)).join("\\,");
}

function walkAlgebra(i) {
  const nf = walk.nf, k = nf.steps.length, p = state.p, out = [];
  const box = document.getElementById("walk-alg");
  const vi = prefixVertex(Math.min(i, k));
  if (i < k) {
    const st = nf.steps[i];
    const M = st.before, md = st.mod;
    const hlCol = (txt, col) => (col === st.colIndex ? `\\htmlClass{c-hl}{${txt}}` : txt);
    const modTeX = `\\begin{pmatrix} ${hlCol(md.a, 0)} & ${hlCol(md.b, 1)} \\\\ ${hlCol(md.c, 0)} & ${hlCol(md.d, 1)} \\end{pmatrix}`;
    const col = st.colIndex === 0 ? [md.a, md.c] : [md.b, md.d];
    out.push(`<div class="step-tag">Step ${i + 1} of ${k + 1}</div>`);
    out.push(`<div class="row"><p>${rich(`So far $g = ${wordTeX(i) ? wordTeX(i) + "\\cdot " : ""}g_{${i}}$, and the remainder $g_{${i}}$ sends $o$ to a vertex at distance $e = ${st.e}$:`)}</p>${tex(`g_{${i}} = ${pmat(M)}, \\qquad \\det g_{${i}} = ${E.bdet(M) < 0n ? "-" : ""}${p}^{${st.e}}`, true)}</div>`);
    out.push(`<div class="row"><p>${rich(`Reduce mod $${p}$. The matrix has rank one, and its column space is spanned by $(${col[0]}, ${col[1]})$:`)}</p>${tex(`g_{${i}} \\equiv ${modTeX} \\pmod{${p}}, \\qquad \\text{column space } = [${st.line[0]} : ${st.line[1]}] \\in \\mathbb{P}^1(\\mathbb{F}_{${p}}).`, true)}</div>`);
    if (st.kind === "up") {
      out.push(`<div class="row verdict-up"><p>${rich(`$[1:0]$: $\\row_2 \\equiv 0$, so the first edge of $[o, g_{${i}}\\cdot o]$ goes <b class="up">up</b> to $t^{-1}o$. Emit $\\htmlClass{c-up}{t^{-1}}$ and divide $\\row_2$ by $${p}$:`)}</p>${tex(`g_{${i + 1}} = t\\,g_{${i}} = ${pmat(st.next)}`, true)}<p class="hnn">${rich(`HNN reading: the coset is $\\sigma\\Lambda^0(${p})$, so $g_{${i}} = \\sigma t\\cdot(\\cdots)$. Fold with $\\sigma t = t^{-1}\\sigma$.`)}</p></div>`);
    } else {
      const j = st.j, jr = j === 1 ? "\\row_2" : `${j}\\,\\row_2`;
      const rel = j === 0 ? "$\\row_1 \\equiv 0$" : `$\\row_1 \\equiv ${jr}$`;
      const op = j === 0 ? `divide $\\row_1$ by $${p}$` : `replace $\\row_1$ by $(\\row_1 - ${jr})/${p}$`;
      out.push(`<div class="row verdict-down"><p>${rich(`$[${j}:1]$: ${rel}, so the first edge goes <b class="down">down</b> through digit $${j}$, to $T^{${j}}t\\cdot o = \\fl{${j}}{1}$. Emit $\\htmlClass{c-down}{T^{${j}}t}$ and ${op}:`)}</p>${tex(`g_{${i + 1}} = t^{-1}${j === 0 ? "" : `T^{-${j}}`}\\,g_{${i}} = ${pmat(st.next)}`, true)}<p class="hnn">${rich(`HNN reading: the coset is $T^{${j}}\\Lambda^0(${p})$, so $g_{${i}} = T^{${j}}t\\cdot g_{${i + 1}}$.`)}</p></div>`);
    }
  } else if (i === k) {
    out.push(`<div class="step-tag">Step ${k + 1} of ${k + 1}</div>`);
    out.push(`<div class="row verdict-lam"><p>${rich(`$\\det g_{${k}} = \\pm 1$, so the remainder fixes $o$: it is $\\lambda \\in \\PGL_2(\\Z)$. The walk has reached $g\\cdot o = ${vTeX(vi)}$.`)}</p>${tex(`\\htmlClass{c-lam}{\\lambda} = ${pmat(nf.lambda)} = ${lamWordTeX()}`, true)}<p class="hnn">${rich(`$\\lambda$ moves nothing in the tree. In $\\mathbb{H}^2$ it is a symmetry of the tessellation at $${vTeX(vi)}$, and it carries the tile to $g\\cdot P$. The Euclidean algorithm gives the word in $S, T, R$.`)}</p></div>`);
  } else {
    const okCheck = E.projEqual(E.evalNormalForm(nf), walk.g);
    out.push(`<div class="step-tag">Done</div>`);
    out.push(`<div class="row verdict-lam"><p>${rich(`Normal form, with $m = ${nf.m}$ up, $k = ${nf.k}$ down${nf.k ? `, digits $(j_1,\\dots,j_k) = (${nf.digits.join(", ")})$` : ""}:`)}</p>${tex(`g = ${wordTeX(k, false)}\\cdot \\htmlClass{c-lam}{\\lambda} = \\begin{pmatrix} ${E.qpow(p, vi.n).toTeX()} & ${qTeX(vi.q)} \\\\ 0 & 1\\end{pmatrix}\\cdot\\htmlClass{c-lam}{${pmat(nf.lambda)}}`, true)}<p>${rich(`The prefix is the coset representative $${vTeX(vi)}$ of Prop. 17, and the word has length $m + k = ${k} = d(o, g\\cdot o) = v_{${p}}(\\det\\tilde g)$.`)}</p><p class="${okCheck ? "ok" : "err"}">${rich(okCheck ? "$\\checkmark$ The product equals $g$ in $\\PGL_2$." : "$\\times$ Mismatch: please report this example.")}</p></div>`);
  }
  box.innerHTML = out.join("");
}

function walkWordLine(i) {
  const nf = walk.nf, k = nf.steps.length;
  let s;
  if (i === 0) s = `g \\;=\\; ${pmat(E.primitive(walk.g))}`;
  else if (i <= k) {
    const rem = i < k ? `g_{${i}}` : `\\htmlClass{c-lam}{\\lambda}`;
    s = `g \\;=\\; ${wordTeX(i)}\\cdot \\htmlClass{c-soft}{${rem}}`;
  } else s = `g \\;=\\; ${wordTeX(k, false)}\\cdot\\htmlClass{c-lam}{${lamWordTeX()}}`;
  document.getElementById("word-line").innerHTML = tex(s, true);
}

function walkProgress(i) {
  const nf = walk.nf, k = nf.steps.length;
  const chip = (src, kind, idx) => `<span class="chip ${kind}${idx < i ? " done" : ""}${idx === i ? " cur" : ""}">${tex(src)}</span>`;
  const chips = nf.steps.map((st, idx) => chip(letterTeX(st), st.kind, idx));
  chips.push(chip("\\lambda", "lam", k));
  document.getElementById("tr-progress").innerHTML = chips.join("");
  document.getElementById("tr-back").disabled = i === 0;
  document.getElementById("tr-reset").disabled = i === 0;
  document.getElementById("tr-step").disabled = i >= k + 1;
  document.getElementById("tr-end").disabled = i >= k + 1;
}

function walkNote(i) {
  const nf = walk.nf, k = nf.steps.length, p = state.p;
  const v = prefixVertex(Math.min(i, k));
  let msg = `Bold: the tessellation $${tessTeX(v, p)}$ at the current vertex. Orange: the target tile $g\\cdot P$.`;
  if (i < k) {
    const st = nf.steps[i], nv = prefixVertex(i + 1);
    msg += ` Dashed: the tessellation $${tessTeX(nv, p)}$ one step ${st.kind}.`;
  } else msg += " Teal: $\\lambda\\in\\PGL_2(\\Z)$ keeps the tessellation and moves the tile onto $g\\cdot P$.";
  document.getElementById("walk-h2-note").innerHTML = rich(msg);
}

function walkGo(i, rebuild = false) {
  const last = walkLast();
  i = Math.max(0, Math.min(last, i));
  walk.anim?.cancel();
  walk.animTo = null;
  walk.i = i;
  if (rebuild) walkRenderTree();
  walkTreeOverlay(i, 0);
  walkDrawH2(i, 0);
  walkAlgebra(i);
  walkWordLine(i);
  walkProgress(i);
  walkNote(i);
}
function walkStep() {
  // a step pressed mid-animation first lands the step in flight
  if (walk.animTo !== null && walk.animTo !== undefined) { const to = walk.animTo; walk.animTo = null; walkGo(to); }
  const last = walkLast();
  if (walk.i >= last) { walkStopPlay(); return; }
  const i = walk.i;
  walk.animTo = i + 1;
  walk.anim = animate(i === walk.nf.steps.length ? 1300 : 950, (s) => {
    walkTreeOverlay(i, s);
    walkDrawH2(i, s);
  }, () => { if (walk.animTo === i + 1) { walk.animTo = null; walkGo(i + 1); } });
}
function walkTogglePlay() { walk.playing ? walkStopPlay() : walkStartPlay(); }
function walkStartPlay() {
  if (walk.i >= walkLast()) walkGo(0);
  walk.playing = true;
  document.getElementById("tr-play").textContent = "Pause";
  const tick = () => {
    if (!walk.playing) return;
    if (walk.i >= walkLast()) { walkStopPlay(); return; }
    walkStep();
    walk.timer = setTimeout(tick, 1700);
  };
  tick();
}
function walkStopPlay() {
  walk.playing = false;
  clearTimeout(walk.timer);
  const b = document.getElementById("tr-play");
  if (b) b.textContent = "Play";
}

// ================================================================ boot

function redrawAll() {
  COL = null;
  ballLegend(); ballRenderTree(); ballDraw();
  conjTree(); conjDraw();
  foldDraw(); gogDraw();
  if (walk.nf) { walkRenderTree(); walkGo(walk.i); }
}

function boot() {
  renderStaticMath();
  setupPrimes();
  ballSetup();
  conjSetup();
  foldSetup();
  gogDraw();
  walkSetup();
  let rt = null;
  const ro = new ResizeObserver(() => {
    clearTimeout(rt);
    rt = setTimeout(() => {
      ball.h2.resize(); conj.h2.resize(); walk.h2.resize();
      if (!ball.h2.userMoved) ballHome();
      if (!conj.h2.userMoved) conjHome();
      if (walk.nf) walkComputeRest();
      redrawAll();
    }, 120);
  });
  ro.observe(document.querySelector(".wrap"));
  matchMedia("(prefers-color-scheme: dark)").addEventListener("change", redrawAll);
  new MutationObserver(redrawAll).observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  window.__pgl = { state, walk, ball, conj, fold, fields, E, setPrime, walkGo, walkStep, walkRun };
}

function whenReady(cb) {
  if (window.katex && window.MathQuill) return cb();
  let n = 0;
  const t = setInterval(() => { if ((window.katex && window.MathQuill) || ++n > 200) { clearInterval(t); cb(); } }, 50);
}
if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", () => whenReady(boot));
else whenReady(boot);
