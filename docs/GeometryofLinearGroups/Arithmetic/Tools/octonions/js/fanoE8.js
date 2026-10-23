// The "Fano & E₈" tab: the Fano plane encoding the multiplication of e1…e7, and the E₈ root
// system formed by the 240 units of 𝕆, drawn in its Coxeter (Petrie) plane.

import * as O from "./octavian.js";
import { vectorsOfNorm } from "./lattice.js";
import { unitPrimary } from "./factor.js";
import { svgEl, el, clear, esc, tip } from "./ui.js";

const $ = (id) => document.getElementById(id);
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const SUBS = "₀₁₂₃₄₅₆₇";
const eName = (i) => (i === 0 ? "1" : "e" + SUBS[i]);

// Multiplication lines (a, a+1, a+3) in cyclic order: e_a e_{a+1} = e_{a+3}.
const idx = (i) => ((i - 1) % 7 + 7) % 7 + 1;
export const LINES = Array.from({ length: 7 }, (_, k) => [k + 1, idx(k + 2), idx(k + 4)]);
const CODE_TRIPLES = O.CODE_WORDS_0.map((w) => w.slice(1));
const sameSet = (a, b) => a.length === b.length && a.every((x) => b.includes(x));
const isCodeTriple = (line) => CODE_TRIPLES.some((t) => sameSet(t, line));

// Standard picture: vertices A, B, C, midpoints D (AB), E (BC), F (CA), centre G.
const R = 150, CX = 210, CY = 205;
const POS = (() => {
  const A = [CX, CY - R], Bp = [CX - R * Math.cos(Math.PI / 6), CY + R / 2], C = [CX + R * Math.cos(Math.PI / 6), CY + R / 2];
  const mid = (p, q) => [(p[0] + q[0]) / 2, (p[1] + q[1]) / 2];
  return { A, B: Bp, C, D: mid(A, Bp), E: mid(Bp, C), F: mid(C, A), G: [CX, CY] };
})();
const GEOM_LINES = [
  { pts: ["A", "D", "B"], kind: "seg" }, { pts: ["B", "E", "C"], kind: "seg" }, { pts: ["C", "F", "A"], kind: "seg" },
  { pts: ["A", "G", "E"], kind: "seg" }, { pts: ["B", "G", "F"], kind: "seg" }, { pts: ["C", "G", "D"], kind: "seg" },
  { pts: ["D", "E", "F"], kind: "circle" },
];
// Find a labelling of the seven positions so that the geometric lines are the multiplication lines.
const LABEL = (() => {
  const keys = ["A", "B", "C", "D", "E", "F", "G"];
  const perms = (a) => (a.length <= 1 ? [a] : a.flatMap((x, i) => perms(a.slice(0, i).concat(a.slice(i + 1))).map((r) => [x, ...r])));
  for (const pm of perms([1, 2, 3, 4, 5, 6, 7])) {
    const lab = Object.fromEntries(keys.map((k, i) => [k, pm[i]]));
    if (lab.G !== 7 && lab.G !== 4) continue; // prefer a centre that reads nicely
    if (GEOM_LINES.every((g) => LINES.some((l) => sameSet(l, g.pts.map((k) => lab[k]))))) return lab;
  }
  throw new Error("no Fano labelling");
})();
const posOf = (label) => POS[Object.keys(LABEL).find((k) => LABEL[k] === label)];

// e_a e_b = sign · e_c
export function productOf(a, b) {
  const t = O.MULT_TABLE[a][b];
  return { sign: t[0], k: t[1] };
}

// The 240 units of 𝕆 as E₈ roots, projected to the Coxeter plane of c = s₁⋯s₈ (h = 30).
export function e8Projection() {
    const units = vectorsOfNorm(O.O_BASIS, 1n, 1n);
    const vec = units.map((d) => d.map((x) => Number(x) / 2)); // real coordinates, |v| = 1
    const dot = (u, v) => u.reduce((s, x, i) => s + x * v[i], 0);
    // simple roots from a generic functional
    const f = [1, 0.31, 0.17, 0.093, 0.051, 0.027, 0.0141, 0.0073];
    const pos = vec.map((v, i) => [i, dot(v, f)]).filter(([, t]) => t > 0).map(([i]) => i);
    const posSet = new Set(pos.map((i) => vec[i].map((x) => x.toFixed(3)).join()));
    const simple = pos.filter((i) => !pos.some((j) => {
      const w = vec[i].map((x, k) => x - vec[j][k]);
      return Math.abs(dot(w, w) - 1) < 1e-9 && posSet.has(w.map((x) => x.toFixed(3)).join()); // v_i = v_j + positive root
    }));
    if (simple.length !== 8) throw new Error("E8: found " + simple.length + " simple roots");
    // Coxeter element c = s_1 ⋯ s_8 (reflections in the unit vectors: s(v) = v − 2(v·a)a)
    const refl = (a) => (v) => { const t = 2 * dot(v, a); return v.map((x, k) => x - t * a[k]); };
    const S = simple.map((i) => refl(vec[i]));
    const c = (v) => S.reduce((w, s) => s(w), v);
    // project onto the exponent-1 plane: Σ_k cos(2πk/30) c^k v and Σ_k sin(2πk/30) c^k v
    let v0 = [0.3, -0.7, 0.2, 0.9, -0.4, 0.5, 0.11, -0.6];
    const X = new Array(8).fill(0), Y = new Array(8).fill(0);
    let w = v0;
    for (let k = 0; k < 30; k++) {
      const a = (2 * Math.PI * k) / 30;
      for (let i = 0; i < 8; i++) { X[i] += Math.cos(a) * w[i]; Y[i] += Math.sin(a) * w[i]; }
      w = c(w);
    }
    const nx = Math.sqrt(dot(X, X));
    const ex = X.map((x) => x / nx);
    const yy = Y.map((y, i) => y - dot(Y, ex) * ex[i]);
    const ny = Math.sqrt(dot(yy, yy));
    const ey = yy.map((y) => y / ny);
    const xy = vec.map((v) => [dot(v, ex), dot(v, ey)]);
    const edges = [];
    for (let i = 0; i < vec.length; i++) for (let j = i + 1; j < vec.length; j++) if (Math.abs(dot(vec[i], vec[j]) - 0.5) < 1e-9) edges.push([i, j]);
    const radii = [...new Set(xy.map(([x, y]) => Math.hypot(x, y).toFixed(4)))].map(Number).sort((a, b) => a - b);
    return { units, vec, xy, edges, radii };
}


export function initFanoE8(getAppState) {
  const st = { sel: [], line: null, hl: "none", hover: -1 };

  // ---------------------------------------------------------------- Fano plane
  function drawFano() {
    const svg = $("fanofig");
    clear(svg);
    svg.setAttribute("viewBox", "0 0 420 400");
    const defs = svgEl("defs", {}, svg);
    const mk = svgEl("marker", { id: "fano-arrow", viewBox: "0 0 10 10", refX: "6", refY: "5", markerWidth: "7", markerHeight: "7", orient: "auto-start-reverse" }, defs);
    svgEl("path", { d: "M0,0 L10,5 L0,10 z", fill: css("--ink-soft") }, mk);
    const lineOfSel = st.line;
    GEOM_LINES.forEach((g) => {
      const labels = g.pts.map((k) => LABEL[k]);
      const line = LINES.find((l) => sameSet(l, labels));
      const on = lineOfSel && sameSet(lineOfSel, line);
      const col = on ? css("--accent") : css("--rule-strong");
      const w = on ? 3.2 : 1.6;
      const grp = svgEl("g", { style: "cursor:pointer" }, svg);
      if (g.kind === "seg") {
        const [P, Q, Rr] = g.pts.map((k) => POS[k]);
        svgEl("line", { x1: P[0], y1: P[1], x2: Rr[0], y2: Rr[1], stroke: col, "stroke-width": w }, grp);
        svgEl("line", { x1: P[0], y1: P[1], x2: Rr[0], y2: Rr[1], stroke: "transparent", "stroke-width": 14 }, grp);
        // direction: the cyclic order (a, a+1, a+3) runs P → R if (P, Q, R) is one of its rotations
        const [x, y, z] = line;
        const geo = labels;
        const rot = [[x, y, z], [y, z, x], [z, x, y]].some((t) => t.every((v, i) => v === geo[i]));
        const [s1, s2] = rot ? [P, Q] : [Rr, Q];
        const [t1, t2] = rot ? [Q, Rr] : [Q, P];
        for (const [u, v] of [[s1, s2], [t1, t2]]) {
          const mx = u[0] + 0.58 * (v[0] - u[0]), my = u[1] + 0.58 * (v[1] - u[1]);
          svgEl("line", { x1: u[0] + 0.45 * (v[0] - u[0]), y1: u[1] + 0.45 * (v[1] - u[1]), x2: mx, y2: my, stroke: col, "stroke-width": w, "marker-end": "url(#fano-arrow)" }, grp);
        }
      } else {
        const r = R / 2;
        svgEl("circle", { cx: CX, cy: CY, r, fill: "none", stroke: col, "stroke-width": w }, grp);
        svgEl("circle", { cx: CX, cy: CY, r, fill: "none", stroke: "transparent", "stroke-width": 14 }, grp);
        // orientation: angles of D, E, F around the centre in the cyclic order of the line
        const ang = (lab) => { const p = posOf(lab); return Math.atan2(p[1] - CY, p[0] - CX); };
        const [x, y] = line;
        let d = ang(y) - ang(x);
        while (d <= -Math.PI) d += 2 * Math.PI;
        while (d > Math.PI) d -= 2 * Math.PI;
        const ccwInSvg = d > 0; // increasing SVG angle
        for (const lab of line) {
          const a0 = ang(lab) + (ccwInSvg ? 1 : -1) * 0.55;
          const a1 = a0 + (ccwInSvg ? 1 : -1) * 0.12;
          svgEl("line", { x1: CX + r * Math.cos(a0), y1: CY + r * Math.sin(a0), x2: CX + r * Math.cos(a1), y2: CY + r * Math.sin(a1), stroke: col, "stroke-width": w, "marker-end": "url(#fano-arrow)" }, grp);
        }
      }
      grp.addEventListener("click", () => { st.line = line; st.sel = []; setHl("line"); renderAll(); });
      const code = isCodeTriple(line);
      const msg = `<b>line {${line.map(eName).join(", ")}}</b>: ${eName(line[0])}${eName(line[1])} = ${eName(line[2])}, and cyclically.<br>` +
        `⟨1, ${line.map(eName).join(", ")}⟩ is a quaternion subalgebra; its intersection with 𝕆 is ` +
        (code ? `a <b>Hurwitz</b> order (24 units, D₄), since {0, ${line.join(", ")}} is a codeword of 𝕆.` : `only the <b>Lipschitz</b> order (8 units ±1, ±eᵢ): {0, ${line.join(", ")}} is not a codeword.`);
      grp.addEventListener("pointerenter", (e) => tip(msg, e));
      grp.addEventListener("pointermove", (e) => tip(msg, e));
      grp.addEventListener("pointerleave", () => tip(null));
    });
    for (const [k, p] of Object.entries(POS)) {
      const lab = LABEL[k];
      const sel = st.sel.includes(lab);
      const g = svgEl("g", { style: "cursor:pointer" }, svg);
      svgEl("circle", { cx: p[0], cy: p[1], r: 17, fill: sel ? css("--accent") : css("--sheet"), stroke: css("--ink"), "stroke-width": 1.6 }, g);
      const t = svgEl("text", { x: p[0], y: p[1] + 5, "text-anchor": "middle", style: `font-size:15px;font-weight:600;fill:${sel ? css("--sheet") : css("--ink")}` }, g);
      t.textContent = eName(lab);
      g.addEventListener("click", () => {
        st.sel = st.sel.includes(lab) ? st.sel.filter((x) => x !== lab) : st.sel.concat([lab]).slice(-2);
        st.line = st.sel.length === 2 ? LINES.find((l) => st.sel.every((x) => l.includes(x))) : null;
        if (st.line) setHl("line");
        renderAll();
      });
    }
    // product readout
    const out = $("fano-out");
    if (st.sel.length === 2) {
      const [a, b] = st.sel;
      const { sign, k } = productOf(a, b);
      const rev = productOf(b, a);
      out.innerHTML = `<span class="mono">${eName(a)}·${eName(b)} = ${sign < 0 ? "−" : ""}${eName(k)}</span>, &nbsp; <span class="mono">${eName(b)}·${eName(a)} = ${rev.sign < 0 ? "−" : ""}${eName(rev.k)}</span>. ` +
        `Follow the arrow on the line through ${eName(a)} and ${eName(b)}: with the arrow the sign is +, against it −.`;
    } else if (st.line) {
      out.innerHTML = `Line {${st.line.map(eName).join(", ")}} selected — its units are highlighted in E₈ →`;
    } else {
      out.innerHTML = `Click two points to multiply them, or a line to select its quaternion subalgebra.`;
    }
    // code triples
    $("fano-code").innerHTML = `The half-integral units of 𝕆 are ½(±1 ± e<sub>a</sub> ± e<sub>b</sub> ± e<sub>c</sub>) for the 7 triples ` +
      CODE_TRIPLES.map((t) => `<span class="mono" style="${LINES.some((l) => sameSet(l, t)) ? "font-weight:600" : ""}">{${t.join("")}}</span>`).join(", ") +
      ` (plus ½(±e<sub>a</sub>±e<sub>b</sub>±e<sub>c</sub>±e<sub>d</sub>) on their complements) — another Fano plane. The bold ones are also multiplication lines, ` +
      `so exactly ${CODE_TRIPLES.filter((t) => LINES.some((l) => sameSet(l, t))).length} of the 7 quaternion subalgebras meet 𝕆 in a Hurwitz order. ` +
      `This 𝕆 is one of the 7 maximal orders between ℤ⁸ and ½ℤ⁸ closed under this multiplication.`;
  }

  // ---------------------------------------------------------------- E₈
  let E8 = null;
  const e8Data = () => (E8 || (E8 = e8Projection()));
  function highlightSet() {
    const { units } = e8Data();
    const hl = st.hl;
    const set = new Set();
    units.forEach((d, i) => {
      const onSupp = (S) => d.every((x, k) => !x || S.includes(k));
      if (hl === "imag" && d[0] === 0n) set.add(i);
      if (hl === "hurwitz" && onSupp([0, 1, 2, 4])) set.add(i);
      if (hl === "basis" && d.filter((x) => x).length === 1) set.add(i);
      if (hl === "line" && st.line && onSupp([0, ...st.line])) set.add(i);
      if (hl === "eps") {
        const eps = currentUnit();
        if (eps && O.equals(eps, d)) set.add(i);
      }
    });
    return set;
  }
  function currentUnit() {
    const S = getAppState();
    if (!S.ft) return null;
    let t = S.ft;
    while (t.l) t = t.l;
    const v = t.value;
    if (O.norm(v) % 2n === 0n) return null;
    const up = unitPrimary(v); // first factor = ε·π with π primary
    return up ? up.unit : null;
  }

  function drawE8() {
    const cv = $("e8canvas");
    const ctx = cv.getContext("2d");
    const W = cv.width;
    ctx.clearRect(0, 0, W, W);
    let D;
    try { D = e8Data(); } catch (e) { $("e8-note").textContent = e.message; return; }
    const { xy, edges, units, radii } = D;
    const rmax = radii[radii.length - 1];
    const sc = (W / 2 - 20) / rmax, c0 = W / 2;
    const P = (i) => [c0 + xy[i][0] * sc, c0 - xy[i][1] * sc];
    const hl = highlightSet();
    ctx.lineWidth = 0.6;
    ctx.strokeStyle = css("--ink-soft");
    ctx.globalAlpha = hlSizeHint(st) ? 0.1 : 0.2;
    ctx.beginPath();
    for (const [i, j] of edges) { const [x1, y1] = P(i), [x2, y2] = P(j); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }
    ctx.stroke();
    if (hl.size && hl.size < 240) {
      ctx.globalAlpha = 0.5;
      ctx.lineWidth = 1.2;
      ctx.strokeStyle = css("--accent");
      ctx.beginPath();
      for (const [i, j] of edges) if (hl.has(i) && hl.has(j)) { const [x1, y1] = P(i), [x2, y2] = P(j); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    const ringCol = (i) => {
      const r = Math.hypot(...xy[i]);
      const k = radii.findIndex((q) => Math.abs(q - r) < 1e-3);
      return `var(--p${k % 8})`;
    };
    units.forEach((d, i) => {
      const [x, y] = P(i);
      const on = hl.has(i);
      ctx.beginPath();
      ctx.arc(x, y, on ? 6.5 : 4.2, 0, 2 * Math.PI);
      ctx.fillStyle = on ? css("--accent") : resolve(ringCol(i));
      ctx.globalAlpha = hl.size && !on ? 0.35 : 1;
      ctx.fill();
      if (st.hover === i) { ctx.globalAlpha = 1; ctx.lineWidth = 2; ctx.strokeStyle = css("--ink"); ctx.stroke(); }
    });
    ctx.globalAlpha = 1;
    const nHl = hl.size;
    const what = { line: st.line ? `units of ⟨1, ${st.line.map(eName).join(", ")}⟩` : "select a Fano line", imag: "imaginary units: the E₇ roots", hurwitz: "Hurwitz units of ⟨1, e₁, e₂, e₄⟩: the D₄ roots", basis: "±1, ±eᵢ", eps: "the unit ε of the current factorization", none: "" }[st.hl];
    $("e8-note").innerHTML = `The 240 units of 𝕆 are the roots of E₈ (norm 1 here; neighbours at 60° are joined: 6720 edges). ` +
      `Projected to the Coxeter plane of a Coxeter element c = s₁⋯s₈ (order h = 30), they fall on ${radii.length} rings of 30, coloured by ring. ` +
      (st.hl !== "none" ? `Highlighted: ${what}${nHl ? ` (${nHl})` : ""}.` : "");
  }
  const resolveCache = new Map();
  function resolve(v) {
    const m = v.match(/var\((--[\w-]+)\)/);
    if (!m) return v;
    if (!resolveCache.has(m[1] + document.documentElement.getAttribute("data-theme"))) resolveCache.set(m[1] + document.documentElement.getAttribute("data-theme"), css(m[1]));
    return resolveCache.get(m[1] + document.documentElement.getAttribute("data-theme"));
  }
  $("e8canvas").addEventListener("pointermove", (e) => {
    if (!E8) return;
    const cv = $("e8canvas"), r = cv.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * cv.width, y = ((e.clientY - r.top) / r.height) * cv.height;
    const rmax = E8.radii[E8.radii.length - 1], sc = (cv.width / 2 - 20) / rmax, c0 = cv.width / 2;
    let best = -1, bd = 1e9;
    E8.xy.forEach(([a, b], i) => { const d = (c0 + a * sc - x) ** 2 + (c0 - b * sc - y) ** 2; if (d < bd) { bd = d; best = i; } });
    if (bd > 120) { if (st.hover !== -1) { st.hover = -1; drawE8(); } tip(null); return; }
    if (st.hover !== best) { st.hover = best; drawE8(); }
    const d = E8.units[best];
    const im = d[0] === 0n;
    tip(`<b>unit</b> <span class="mono">${esc(O.format(d))}</span><br>${im ? "imaginary (u² = −1), an E₇ root" : "Re = " + (Number(d[0]) / 2)} · ring ${E8.radii.findIndex((q) => Math.abs(q - Math.hypot(...E8.xy[best])) < 1e-3) + 1} of ${E8.radii.length}`, e);
  });
  $("e8canvas").addEventListener("pointerleave", () => { st.hover = -1; tip(null); drawE8(); });
  function setHl(h) {
    st.hl = h;
    for (const c of document.querySelectorAll("#e8-hl button")) c.setAttribute("aria-pressed", String(c.dataset.hl === h));
  }
  for (const b of document.querySelectorAll("#e8-hl button")) b.addEventListener("click", () => { setHl(b.dataset.hl); drawE8(); });
  setHl("none");

  const hlSizeHint = (s) => s.hl !== "none";
  function renderAll() { drawFano(); drawE8(); }
  return { render: renderAll };
}
