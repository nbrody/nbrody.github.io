// The G₂ tab: an apartment of B(G₂(Q_p)), the link of a hyperspecial vertex (the split Cayley
// hexagon H(p), built from the octavians mod p), counts, and factorization of explicit
// elements of G₂(Z[1/N]) along any ordering of steps — staircase paths in ∏_p B_p.

import * as G from "./g2.js";
import * as GG from "./g2group.js";
import { isProbablePrime } from "./factor.js";
import { svgEl, el, clear, colorVar, tip, renderChips, renderBox } from "./ui.js";
import { tex, rich, svgTex, texNum, mathField, latexToExpr } from "./tex.js";

const $ = (id) => document.getElementById(id);
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const posTex = (a, b) => (!a && !b ? "0" : [a ? (a > 1 ? a : "") + "\\omega_s" : "", b ? (b > 1 ? b : "") + "\\omega_\\ell" : ""].filter(Boolean).join(" + "));

export function initG2() {
  const st = {
    p: 3,
    targets: [],      // [{p: BigInt, a, b}]
    steps: [],        // [{p: BigInt, kind}]
    g: null, fz: null, prevKeys: null, err: "",
    posTrack: null,   // per path vertex: Map p → [a, b]
    boxSeen: new Map(), orderingsTried: new Set(), boxBad: 0,
    hoverChamber: -1,
    hexLayout: null,
    edit: [{ p: 2, a: 1, b: 1 }, { p: 3, a: 2, b: 0 }, { p: 5, a: 0, b: 1 }], // the target editor
  };
  const tPrimes = () => [...new Set(st.targets.map((t) => String(t.p)))].map(BigInt).sort((a, b) => (a < b ? -1 : 1));
  const primeIndex = (p) => tPrimes().findIndex((q) => q === BigInt(p));
  const stepColor = (p) => colorVar(Math.max(0, primeIndex(p)));
  const groupedSteps = () => {
    const out = [];
    for (const t of st.targets) {
      for (let i = 0; i < t.a; i++) out.push({ p: t.p, kind: "s" });
      for (let i = 0; i < t.b; i++) out.push({ p: t.p, kind: "l" });
    }
    return out;
  };

  // prime selector
  const seg = $("g2-prime-seg");
  for (const p of [2, 3, 5, 7]) {
    const b = el("button", { "data-p": String(p), "aria-pressed": String(p === st.p) }, String(p));
    b.addEventListener("click", () => setPrime(p));
    seg.append(b);
  }
  $("g2-prime-custom").addEventListener("keydown", (e) => {
    if (e.key !== "Enter") return;
    const p = parseInt(e.target.value, 10);
    if (p >= 2 && isProbablePrime(BigInt(p))) setPrime(p);
  });
  const setPrime = (p) => {
    st.p = p;
    for (const b of seg.querySelectorAll("button")) b.setAttribute("aria-pressed", String(+b.dataset.p === p));
    render();
  };
  $("g2-labels").addEventListener("change", () => render());
  $("g2-cone").addEventListener("change", () => render());
  $("g2-targets-go").addEventListener("click", () => buildRandom(Math.random));
  $("g2-add-prime").addEventListener("click", () => {
    const used = new Set(st.edit.map((t) => t.p));
    let p = 2;
    while (used.has(p) || !isProbablePrime(BigInt(p))) p++;
    st.edit.push({ p, a: 1, b: 0 });
    renderTargets();
  });
  $("g2-use").addEventListener("click", () => useOwn());
  const uFields = [
    mathField($("g2-u1"), { latex: "e_1", onEnter: () => useOwn() }),
    mathField($("g2-u2"), { latex: "\\frac{3e_2+4e_4}{5}", onEnter: () => useOwn() }),
    mathField($("g2-u3"), { latex: "e_3", onEnter: () => useOwn() }),
  ];

  // the target editor: one row per prime, p and the steppers for a and b
  function renderTargets() {
    const box = $("g2-targets-rows");
    clear(box);
    st.edit.forEach((t, i) => {
      const pin = el("input", { class: "field pin", type: "number", min: "2", max: "97", value: String(t.p), "aria-label": "prime" });
      pin.addEventListener("change", () => { const v = parseInt(pin.value, 10); if (v >= 2) t.p = v; renderTargets(); });
      const step = (key, d) => () => { t[key] = Math.max(0, Math.min(4, t[key] + d)); renderTargets(); };
      const stepper = (key) => el("span", { class: "stepper" },
        el("button", { class: "btn", type: "button", onclick: step(key, -1), "aria-label": `decrease ${key}` }, "−"),
        el("span", { class: "sv" }, String(t[key])),
        el("button", { class: "btn", type: "button", onclick: step(key, 1), "aria-label": `increase ${key}` }, "+"));
      const ok = isProbablePrime(BigInt(t.p));
      box.append(el("div", { class: "trow" },
        el("span", { html: tex("p =") }), pin,
        el("span", { class: "muted small", html: tex("a") }), stepper("a"),
        el("span", { class: "muted small", html: tex("b") }), stepper("b"),
        el("span", { class: "tpos", html: ok ? tex(`\\lambda_{${t.p}} = ${posTex(t.a, t.b)}`) : `<span class="err">${t.p} is not prime</span>` }),
        el("button", { class: "btn", type: "button", "aria-label": "remove", onclick: () => { st.edit.splice(i, 1); renderTargets(); } }, "×")));
    });
  }
  renderTargets();
  $("g2-shuffle").addEventListener("click", () => {
    const a = st.steps.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    st.steps = a;
    refactor(true);
  });
  $("g2-sort").addEventListener("click", () => { st.steps = groupedSteps(); refactor(true); });

  function parseTargets() {
    const out = [];
    for (const t of st.edit) {
      const p = BigInt(t.p);
      if (!isProbablePrime(p)) throw new Error(p + " is not prime");
      if (p > 97n) throw new Error("primes up to 97 here");
      if (out.some((u) => u.p === p)) throw new Error("repeated prime " + p);
      if (t.a + t.b) out.push({ p, a: t.a, b: t.b });
    }
    if (!out.length) throw new Error("give at least one prime with a step");
    if (out.reduce((s, t) => s + t.a + t.b, 0) > 10) throw new Error("at most 10 steps in total");
    return out;
  }
  function setG(g, targets) {
    st.g = g;
    st.targets = targets;
    st.steps = groupedSteps();
    st.prevKeys = null;
    st.boxSeen = new Map(); st.orderingsTried = new Set(); st.boxBad = 0;
    refactor(false);
  }
  function buildRandom(rng) {
    st.err = "";
    try {
      const targets = parseTargets();
      setG(GG.randomG2(targets, rng), targets);
    } catch (e) { st.err = e.message; renderPaths(); }
  }
  function useOwn() {
    st.err = "";
    try {
      const g = GG.parseTriple(...uFields.map((f) => latexToExpr(f.latex())));
      const sup = GG.supportOf(g);
      if (sup.some((p) => p > 97n)) throw new Error("g has denominators at primes above 97");
      const pos = GG.positions(g, sup);
      const targets = sup.map((p, i) => ({ p, a: pos[i][0], b: pos[i][1] }));
      if (targets.reduce((s, t) => s + t.a + t.b, 0) > 12) throw new Error("this g needs more than 12 steps");
      setG(g, targets);
      if (!targets.length) st.err = "This $g$ fixes $\\mathbb O$: it is one of the $12096$ elements of $\\operatorname{Aut}(\\mathbb O) \\cong G_2(\\mathbb F_2)$.";
      renderPaths();
    } catch (e) { st.err = e.message; renderPaths(); }
  }
  function refactor(trackChange) {
    const old = st.fz ? st.fz.factors.map((f) => GG.gKey(f.h)) : null;
    st.fz = null;
    try {
      st.fz = GG.factorG2(st.g, st.steps);
      const ps = tPrimes();
      st.posTrack = st.fz.vertices.map((V) => new Map(ps.map((p) => [String(p), GG.positionAt(GG.O_LAT, V, p)])));
      // the box is canonical: record the maximal order met at each box position
      const okey = st.steps.map((s) => s.p + s.kind).join(",");
      if (!st.orderingsTried.has(okey)) {
        st.orderingsTried.add(okey);
        const cnt = new Map();
        st.fz.vertices.forEach((V, j) => {
          if (j) { const k = st.steps[j - 1].p + st.steps[j - 1].kind; cnt.set(k, (cnt.get(k) || 0) + 1); }
          const key = [...cnt.entries()].sort().map(([k, v]) => k + v).join("|");
          const lk = GG.latKey(V);
          if (st.boxSeen.has(key) && st.boxSeen.get(key) !== lk) st.boxBad++;
          st.boxSeen.set(key, lk);
        });
      }
    } catch (e) { st.err = "Factorization failed: " + e.message; }
    st.prevKeys = trackChange ? old : null;
    render();
  }

  // ------------------------------------------------------------------ apartment
  const R = 3.55, W = 640;
  function renderApartment() {
    const svg = $("aptfig");
    clear(svg);
    const s = (W / 2 - 16) / R, cx = W / 2, cy = W / 2;
    const X = (q) => cx + q[0] * s, Y = (q) => cy - q[1] * s;
    svg.setAttribute("viewBox", `0 0 ${W} ${W}`);
    const defs = svgEl("defs", {}, svg);
    const cp = svgEl("clipPath", { id: "apt-clip" }, defs);
    svgEl("circle", { cx, cy, r: R * s }, cp);
    const g = svgEl("g", { "clip-path": "url(#apt-clip)" }, svg);
    const A = G.apartment(R + 0.8);
    const starIdx = new Map();
    for (const ch of A.chambers) {
      const [a, m, c] = ch;
      const area = (m[0] - a[0]) * (c[1] - a[1]) - (m[1] - a[1]) * (c[0] - a[0]);
      const atO = Math.hypot(a[0], a[1]) < 1e-9;
      const poly = svgEl("polygon", { points: ch.map((q) => X(q) + "," + Y(q)).join(" "), class: "chamber " + (area > 0 ? "a" : "b"), stroke: css("--rule-strong"), "stroke-width": 0.45 }, g);
      if (atO) {
        // index chambers at O counter-clockwise starting from the one between 0° and 30°
        const ang = (Math.atan2(c[1] + m[1], c[0] + m[0]) * 180) / Math.PI;
        const i = Math.floor(((ang % 360) + 360) % 360 / 30);
        starIdx.set(i, poly);
        poly.style.cursor = "pointer";
        poly.addEventListener("pointerenter", (e) => {
          st.hoverChamber = i;
          poly.setAttribute("style", "fill:var(--warn-wash);cursor:pointer");
          drawHexagon();
          tip(rich(`Chamber ${i + 1} of the 12 at $\\mathbb O$ in this apartment. In the building it is one of $(p+1)\\,\\#H(p) = ${texNum(BigInt(st.p + 1) * G.hexagonSize(st.p))}$ chambers at $\\mathbb O$; it is the highlighted flag of $H(${st.p})$.`), e);
        });
        poly.addEventListener("pointerleave", () => { st.hoverChamber = -1; poly.setAttribute("style", "cursor:pointer"); drawHexagon(); tip(null); });
      }
    }
    // dominant cone
    if ($("g2-cone").checked) {
      const r = R + 0.5;
      const pts = [[0, 0], [r, 0], [r * Math.cos(Math.PI / 6), r * Math.sin(Math.PI / 6)]];
      svgEl("polygon", { points: pts.map((q) => X(q) + "," + Y(q)).join(" "), fill: css("--accent"), "fill-opacity": 0.1, stroke: css("--accent"), "stroke-width": 1, "stroke-opacity": 0.5, "pointer-events": "none" }, g);
      svgTex(g, X([R - 0.3, 0]), Y([R - 0.3, 0]) + 16, "\\omega_s", { size: 14, color: "var(--accent)", w: 40 });
      const q2 = [(R - 0.45) * Math.cos(Math.PI / 6), (R - 0.45) * Math.sin(Math.PI / 6)];
      svgTex(g, X(q2) - 8, Y(q2) - 14, "\\omega_\\ell", { size: 14, color: "var(--accent)", w: 40 });
    }
    // the path of the current factorization at this prime: positions of h₁⋯h_j𝕆, computed
    if (st.posTrack && st.posTrack[0].has(String(st.p))) {
      const pts = [];
      let last = "";
      for (const m of st.posTrack) {
        const [a, b] = m.get(String(st.p));
        if (a + "," + b === last) continue;
        last = a + "," + b;
        pts.push(G.pt(...G.coneToMN(a, b)));
      }
      svgEl("polyline", { points: pts.map((q) => X(q) + "," + Y(q)).join(" "), class: "path", stroke: stepColor(st.p) }, g);
      pts.forEach((q, i) => { if (i) svgEl("circle", { cx: X(q), cy: Y(q), r: 5, fill: "none", stroke: stepColor(st.p), "stroke-width": 2 }, g); });
    }
    // vertices
    const gv = svgEl("g", {}, g);
    for (const m of A.midpoints) svgEl("rect", { x: X(m.xy) - 2.4, y: Y(m.xy) - 2.4, width: 4.8, height: 4.8, class: "v1" }, gv);
    for (const c of A.centres) {
      const x = X(c.xy), y = Y(c.xy);
      svgEl("path", { d: `M${x},${y - 3.6} L${x + 3.2},${y + 2.2} L${x - 3.2},${y + 2.2} Z`, class: "v2" }, gv);
    }
    const showLab = $("g2-labels").checked;
    for (const h of A.hyperspecial) {
      if (Math.hypot(...h.xy) > R + 1e-9) continue;
      const x = X(h.xy), y = Y(h.xy);
      const [a, b] = h.pos;
      const node = svgEl("circle", { cx: x, cy: y, r: a === 0 && b === 0 ? 5.5 : 3.6, class: "v0" }, gv);
      const hit = svgEl("circle", { cx: x, cy: y, r: 10, fill: "transparent" }, gv);
      const n = G.hyperspecialCount(st.p, a, b);
      const msg = a === 0 && b === 0
        ? rich(`$\\mathbb O$, the base vertex, with stabilizer $G_2(\\mathbb Z_{${st.p}})$`)
        : rich(`position $${posTex(a, b)}$ from $\\mathbb O$<br>$${texNum(n)}$ hyperspecial vertices of the building sit at this position`);
      hit.addEventListener("pointerenter", (e) => tip(msg, e));
      hit.addEventListener("pointermove", (e) => tip(msg, e));
      hit.addEventListener("pointerleave", () => tip(null));
      if (showLab && h.mn[0] - h.mn[1] >= 0 && h.mn[1] >= 0 && (a || b)) {
        svgTex(gv, x + 5, y + 12, `(${a},${b})`, { anchor: "start", size: 9.5, w: 50, h: 16, color: "var(--ink-soft)" });
      }
      void node;
    }
    svgEl("circle", { cx, cy, r: R * s, fill: "none", stroke: css("--rule-strong"), "stroke-width": 1 }, svg);
  }

  // ------------------------------------------------------------------ hexagon
  function hexLayoutFor(p) {
    if (st.hexLayout && st.hexLayout.p === p) return st.hexLayout;
    const H = G.cayleyHexagon(p);
    const { level, parent } = G.hexagonLevels(H);
    const nodes = []; // {kind, id, level}
    const idx = new Map();
    const add = (kind, id) => { idx.set(kind + id, nodes.length); nodes.push({ kind, id, level: level.get(kind + id) }); };
    H.points.forEach((_, i) => add("p", i));
    H.lines.forEach((_, j) => add("l", j));
    const children = nodes.map(() => []);
    nodes.forEach((n, i) => {
      const par = parent.get(n.kind + n.id);
      if (par !== undefined && n.level <= 5) children[idx.get(par)].push(i);
    });
    // angles: level-5 nodes evenly in DFS order; ancestors at the middle of their range
    const ang = new Array(nodes.length).fill(0);
    let counter = 0;
    const leaves5 = nodes.filter((n) => n.level === 5).length;
    const dfs = (i) => {
      if (nodes[i].level === 5) { ang[i] = (2 * Math.PI * (counter + 0.5)) / leaves5; counter++; return [ang[i], ang[i]]; }
      let lo = Infinity, hi = -Infinity;
      for (const c of children[i]) { const [a, b] = dfs(c); lo = Math.min(lo, a); hi = Math.max(hi, b); }
      ang[i] = (lo + hi) / 2;
      return [lo, hi];
    };
    dfs(idx.get("p0"));
    // level-6 points (opposite the centre): evenly around the outer ring, in the order of
    // their first neighbour on ring 5
    const nbrs = (n) => (n.kind === "p" ? H.pointLines[n.id].map((j) => idx.get("l" + j)) : H.lines[n.id].map((i) => idx.get("p" + i)));
    const outer = [];
    nodes.forEach((n, i) => { if (n.level === 6) outer.push([Math.min(...nbrs(n).map((j) => ang[j])), i]); });
    outer.sort((a, b) => a[0] - b[0]);
    outer.forEach(([, i], r) => { ang[i] = (2 * Math.PI * (r + 0.5)) / outer.length; });
    const radius = [0, 0.2, 0.36, 0.5, 0.64, 0.8, 0.97];
    const xy = nodes.map((n, i) => [radius[n.level] * Math.cos(ang[i]), radius[n.level] * Math.sin(ang[i])]);
    // a 12-cycle through the base point: x0 … x6 and back by another route
    const x6 = nodes.findIndex((n) => n.level === 6);
    const [la, lb] = nbrs(nodes[x6]);
    const up = (i) => { const out = [i]; while (nodes[out[out.length - 1]].level > 0) out.push(idx.get(parent.get(nodes[out[out.length - 1]].kind + nodes[out[out.length - 1]].id))); return out; };
    const A = up(la).reverse(), B = up(lb);
    const cycle = A.concat([x6], B.slice(0, B.length - 1)); // x0 … la x6 lb … (back to x0)
    st.hexLayout = { p, H, nodes, xy, nbrs, cycle, children, idx };
    return st.hexLayout;
  }

  function drawHexagon() {
    const cv = $("hexcanvas");
    const note = $("hex-note");
    const ctx = cv.getContext("2d");
    const Wc = cv.width, Hc = cv.height;
    ctx.clearRect(0, 0, Wc, Hc);
    if (st.p > 7) {
      note.innerHTML = rich(`$H(${st.p})$ has $${texNum(G.hexagonSize(st.p))}$ points, too many to draw here; the counts are below.`);
      return;
    }
    let L;
    try { L = hexLayoutFor(st.p); } catch (e) { note.textContent = e.message; return; }
    const { nodes, xy, nbrs, cycle } = L;
    const c0 = Wc / 2, rr = Wc / 2 - 14;
    const P = (i) => [c0 + xy[i][0] * rr, c0 - xy[i][1] * rr];
    const big = nodes.length > 3000;
    // edges
    ctx.lineWidth = big ? 0.4 : 0.8;
    ctx.strokeStyle = css("--rule-strong");
    ctx.globalAlpha = big ? 0.35 : 0.8;
    ctx.beginPath();
    nodes.forEach((n, i) => {
      if (n.level === 0 || n.level > 5) return;
      for (const j of nbrs(n)) if (nodes[j].level === n.level - 1) { const [x1, y1] = P(i), [x2, y2] = P(j); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); break; }
    });
    ctx.stroke();
    // closing chords from the opposite points
    ctx.globalAlpha = big ? 0.05 : st.p === 2 ? 0.45 : 0.16;
    ctx.beginPath();
    nodes.forEach((n, i) => {
      if (n.level !== 6) return;
      for (const j of nbrs(n)) { const [x1, y1] = P(i), [x2, y2] = P(j); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); }
    });
    ctx.stroke();
    ctx.globalAlpha = 1;
    // nodes
    const rp = st.p === 2 ? 5 : st.p === 3 ? 3.2 : st.p === 5 ? 1.5 : 0.9;
    const cPt = css("--type2"), cLn = css("--type1");
    nodes.forEach((n, i) => {
      const [x, y] = P(i);
      ctx.fillStyle = n.kind === "p" ? cPt : cLn;
      if (n.kind === "p") { ctx.beginPath(); ctx.arc(x, y, rp, 0, 2 * Math.PI); ctx.fill(); }
      else ctx.fillRect(x - rp * 0.9, y - rp * 0.9, rp * 1.8, rp * 1.8);
    });
    // the 12-cycle = an apartment of H(p) = the 12 chambers at 𝕆 in the apartment drawn left
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = css("--accent");
    ctx.beginPath();
    cycle.forEach((i, k) => { const [x, y] = P(i); if (!k) ctx.moveTo(x, y); else ctx.lineTo(x, y); });
    ctx.closePath();
    ctx.stroke();
    // apartment chamber i ↔ edge between consecutive vertices around 𝕆 (see indexing in renderApartment)
    if (st.hoverChamber >= 0) {
      const map = (i) => (i + 11) % 12; // chamber between 30i° and 30(i+1)°: cycle edge (c_{i-1}, c_i)
      const e0 = cycle[map(st.hoverChamber)], e1 = cycle[(map(st.hoverChamber) + 1) % 12];
      ctx.lineWidth = 6;
      ctx.strokeStyle = css("--warn");
      ctx.beginPath();
      const [x1, y1] = P(e0), [x2, y2] = P(e1);
      ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
    }
    for (const i of cycle) {
      const [x, y] = P(i);
      ctx.fillStyle = nodes[i].kind === "p" ? cPt : cLn;
      ctx.strokeStyle = css("--sheet");
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      if (nodes[i].kind === "p") ctx.arc(x, y, 6, 0, 2 * Math.PI); else ctx.rect(x - 5.5, y - 5.5, 11, 11);
      ctx.fill(); ctx.stroke();
    }
    const p = st.p;
    note.innerHTML = rich(`$H(${p})$ has $${texNum(BigInt(L.H.points.length))}$ points (● type-2 vertices, $\\mathrm{SL}_3$-type) and $${texNum(BigInt(L.H.lines.length))}$ lines (■ type-1 vertices, $\\mathrm{SO}_4$-type), all adjacent to $\\mathbb O$. ` +
      `Each point is on $${p + 1}$ lines and each line has $${p + 1}$ points. The rings are the distances $0,\\dots,6$ from one point in the incidence graph, of sizes $1,\\ ${p + 1},\\ ${p * (p + 1)},\\ ${p ** 2 * (p + 1)},\\ ${p ** 3 * (p + 1)},\\ ${p ** 4 * (p + 1)},\\ ${p ** 5}$. ` +
      `The girth is $12$ and the diameter $6$, so this is a generalized hexagon. The outer ring holds the $${p ** 5}$ points opposite the centre, with chords back to ring $5$. The blue $12$-cycle is one apartment of $H(${p})$: the $12$ chambers at $\\mathbb O$ in the apartment on the left.`);
  }
  // canvas hover
  $("hexcanvas").addEventListener("pointermove", (e) => {
    const L = st.hexLayout;
    if (!L || L.p !== st.p) return;
    const cv = $("hexcanvas"), r = cv.getBoundingClientRect();
    const x = ((e.clientX - r.left) / r.width) * cv.width, y = ((e.clientY - r.top) / r.height) * cv.height;
    const c0 = cv.width / 2, rr = cv.width / 2 - 14;
    let best = -1, bd = 1e9;
    L.xy.forEach((q, i) => { const dx = c0 + q[0] * rr - x, dy = c0 - q[1] * rr - y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = i; } });
    if (best < 0 || bd > 400) { tip(null); return; }
    const n = L.nodes[best];
    const what = n.kind === "p" ? `point of $H(p)$: an isotropic line in $\\operatorname{Im}(\\mathbb O/${st.p}\\mathbb O)$` : `line of $H(p)$: a plane $\\langle x, y\\rangle$ with $xy = 0$`;
    tip(rich(`<b>${n.kind === "p" ? "point" : "line"} ${n.id}</b>: ${what}<br>distance $${n.level}$ from the centre point in the incidence graph` +
      (n.kind === "p" ? `<br>coordinates mod $${st.p}$ in the $\\mathbb Z$-basis of $\\mathbb O$: $(${L.H.points[n.id].join(",")})$` : "")), e);
  });
  $("hexcanvas").addEventListener("pointerleave", () => tip(null));

  // ------------------------------------------------------------------ counts
  function renderStats() {
    const p = BigInt(st.p);
    const hs = G.hexagonSize(st.p);
    const rows = [
      ["octavian primes of norm $p$", 240n * (p ** 3n + 1n)],
      ["… up to units: Rehm's primary primes, a spread of $Q_7^+(p)$", p ** 3n + 1n],
      ["points of the quadric $Q_7^+(p) \\subset \\mathbb P(\\mathbb O/p\\mathbb O)$", (p + 1n) * (p * p + 1n) * (p ** 3n + 1n)],
      ["&emsp;trace-zero points $=$ points of $H(p)$", hs],
      ["&emsp;idempotent points (stabilizer $\\mathrm{SL}_3(\\mathbb F_p)$)", p ** 3n * (p ** 3n + 1n)],
      ["type-1 and type-2 vertices adjacent to $\\mathbb O$ (each)", hs],
      ["chambers containing $\\mathbb O$ (flags of $H(p)$)", (p + 1n) * hs],
      ["hyperspecial vertices at $\\omega_s$ (short step)", G.hyperspecialCount(st.p, 1, 0)],
      ["hyperspecial vertices at $\\omega_\\ell$ (long step)", G.hyperspecialCount(st.p, 0, 1)],
      ["$|G_2(\\mathbb F_p)| = p^6(p^6-1)(p^2-1)$", p ** 6n * (p ** 6n - 1n) * (p * p - 1n)],
      ["vertex stabilizer in $G_2(\\mathbb Z[1/N])$: $\\operatorname{Aut}(\\mathbb O) \\cong G_2(\\mathbb F_2)$", BigInt(G.G2F2_ORDER)],
    ];
    const box = $("g2-stats");
    clear(box);
    $("g2-stats-title").innerHTML = "Counting at " + tex("p = " + st.p);
    for (const [k, v] of rows) box.append(el("div", { class: "k", html: rich(k) }), el("div", { class: "v", html: tex(texNum(v)) }));
  }

  // ------------------------------------------------------------------ paths
  function renderPaths() {
    $("g2paths-intro").innerHTML = rich(
      `$G_2(\\mathbb Z[1/N]) = \\operatorname{Aut}(\\mathbb O[1/N])$ acts on $\\prod_{p\\mid N}\\mathcal B_p$, transitively on the hyperspecial vertices (the maximal orders), with stabilizer $\\operatorname{Aut}(\\mathbb O) \\cong G_2(\\mathbb F_2)$. ` +
      `An element $g$ puts $g\\mathbb O$ at position $\\lambda_p = a_p\\omega_s + b_p\\omega_\\ell$ at each $p$. For <b>every ordering</b> of those steps there is exactly one chain of vertices, hence exactly one factorization ` +
      `$g = h_1h_2\\cdots h_m\\,u$, where each $h_i$ is a canonical <i>$G_2$-prime</i> (one short or long step at one prime) and $u \\in \\operatorname{Aut}(\\mathbb O)$. ` +
      `Everything is exact: each vertex comes from lattice operations, each $h_i$ from an isomorphism $\\mathbb O \\to h_1\\cdots h_i\\mathbb O$ found among the $126$ imaginary units of that maximal order, and the product is re-multiplied as a check.`);
    const err = $("g2-err");
    err.hidden = !st.err; err.innerHTML = rich(st.err);
    const kv = $("g2-g");
    clear(kv);
    if (!st.g) return;
    const add = (k, v) => kv.append(el("div", { class: "k", html: k }), el("div", { class: "v", html: v }));
    GG.gFormatTex(st.g).forEach((line, i) => add(i ? "" : tex("g"), tex(line)));
    add("support", st.targets.length ? tex("N = " + tPrimes().join("\\cdot ")) : "—");
    add(tex("g\\mathbb O") + " at", st.targets.map((t) => `<span style="color:${stepColor(t.p)}">${tex(`\\lambda_{${t.p}} = ${posTex(t.a, t.b)}`)}</span>`).join(" &emsp; ") || tex("\\mathbb O") + " itself");
    renderChips($("g2-chips"), st.steps.map((s) => ({
      label: String(s.p),
      html: tex(`${s.p}_{${s.kind === "s" ? "s" : "\\ell"}}`),
      sub: s.kind === "s" ? "short" : "long",
      aria: `prime ${s.p}, ${s.kind === "s" ? "short" : "long"} step`,
      color: stepColor(s.p),
    })), (order) => { st.steps = order.map((i) => st.steps[i]); refactor(true); });
    const m = st.steps.length;
    let orderings = factorial(m);
    for (const t of st.targets) orderings /= factorial(t.a) * factorial(t.b);
    $("g2-count").innerHTML = rich(`$${texNum(orderings)}$ orderings, each a staircase and each a unique factorization. ` +
      tPrimes().map((p) => `$G_2$-primes at $${p}$: $${texNum(G.hyperspecialCount(p, 1, 0))}$ short, $${texNum(G.hyperspecialCount(p, 0, 1))}$ long`).join("; ") + ".");
    const tbl = $("g2-table");
    clear(tbl);
    if (!st.fz) { $("g2-formula").textContent = ""; $("g2-verify").textContent = ""; clear($("g2box")); return; }
    $("g2-formula").innerHTML = tex("g = " + st.fz.factors.map((_, i) => `h_{${i + 1}}`).join("\\,") + "\\,u");
    const prod = GG.gCompose(GG.multiply(st.fz.factors.map((f) => f.h)), st.fz.unit);
    $("g2-verify").innerHTML = GG.gEquals(prod, st.g)
      ? `<span class="badge ok">✓ verified</span> ` + rich(`$h_1\\cdots h_m\\,u = g$ exactly, and $u\\mathbb O = \\mathbb O$`)
      : `<span class="badge bad">✗</span> product mismatch (bug)`;
    tbl.append(el("tr", {}, el("th", {}, ""), el("th", {}, "step"), el("th", { html: "factor: images of " + tex("e_1, e_2, e_3") }), el("th", {}, "")));
    const prev = st.prevKeys ? new Set(st.prevKeys) : null;
    let nNew = 0;
    st.fz.factors.forEach((f, i) => {
      const isNew = prev && !prev.has(GG.gKey(f.h));
      if (isNew) nNew++;
      tbl.append(el("tr", { class: isNew ? "changed" : "" },
        el("td", { html: tex(`h_{${i + 1}}`) }),
        el("td", { style: `color:${stepColor(f.p)};white-space:nowrap`, html: tex(`p = ${f.p}`) + ` ${f.kind === "s" ? "short" : "long"}` }),
        el("td", { class: "v", html: GG.gFormatTex(f.h).map((l) => tex(l)).join("<br>") }),
        el("td", { html: `<span class="badge">${tex(f.kind === "s" ? "\\omega_s" : "\\omega_\\ell")}</span>` })));
    });
    tbl.append(el("tr", {},
      el("td", { html: tex("u") }),
      el("td", { class: "muted", style: "white-space:nowrap", html: tex("\\operatorname{Aut}(\\mathbb O)") }),
      el("td", { class: "v", html: GG.gFormatTex(st.fz.unit).map((l) => tex(l)).join("<br>") }),
      el("td", { html: `<span class="badge warn">unit</span>` })));
    if (prev) tbl.append(el("tr", {}, el("td", { colspan: "4", class: "note" }, nNew ? `${nNew} of ${m} factors are new compared with the previous ordering (highlighted).` : "Same factors as before.")));
    // the box
    const axes = [], axisOf = new Map();
    for (const t of st.targets) {
      if (t.a) { axisOf.set(t.p + "s", axes.length); axes.push({ len: t.a, color: stepColor(t.p), label: `\\omega_s\\text{ at }${t.p}` }); }
      if (t.b) { axisOf.set(t.p + "l", axes.length); axes.push({ len: t.b, color: stepColor(t.p), label: `\\omega_\\ell\\text{ at }${t.p}` }); }
    }
    const path = st.steps.map((s) => axisOf.get(s.p + s.kind));
    const pathKeys = [];
    { const v = new Array(axes.length).fill(0); pathKeys.push(v.join(",")); for (const a of path) { v[a]++; pathKeys.push(v.join(",")); } }
    renderBox($("g2box"), axes, path, new Map(), {
      width: 560, maxHeight: 340,
      stepLabel: (j) => `h_{${j + 1}}`,
      nodeInfo: (v) => {
        const j = pathKeys.indexOf(v.join(","));
        let i = 0;
        const parts = [];
        for (const t of st.targets) {
          let a = 0, b = 0;
          if (t.a) a = v[i++];
          if (t.b) b = v[i++];
          parts.push(`\\lambda_{${t.p}} = ${posTex(a, b)}`);
        }
        if (j < 0) return parts.map((x) => tex(x)).join("<br>") + `<br><span class="muted">(off the current staircase)</span>`;
        const comp = st.posTrack[j];
        const check = st.targets.every((t, k) => { const [a, b] = comp.get(String(t.p)); return parts[k] === `\\lambda_{${t.p}} = ${posTex(a, b)}`; });
        return tex(j ? `h_1\\cdots h_{${j}}\\,\\mathbb O` : "\\mathbb O") + ", a maximal order at<br>" + parts.map((x) => tex(x)).join("<br>") +
          `<br>${check ? "✓ positions recomputed from the lattice" : "✗ position mismatch"}`;
      },
    });
    $("g2box-note").innerHTML = rich(`The box is the product of the parallelograms spanned by $\\omega_s$ and $\\omega_\\ell$ in each $\\mathcal B_p$. ` +
      `Each vertex of the box is one maximal order, the same for every ordering. ` +
      (st.boxBad ? `<b>✗ ${st.boxBad} inconsistencies</b>` : `✓ consistent over the ${st.orderingsTried.size} ordering${st.orderingsTried.size > 1 ? "s" : ""} tried so far (${st.boxSeen.size} box vertices met)`) +
      `. Contrast the octavians on the Box &amp; paths tab, where subproducts drift off their box.`);
  }
  const factorial = (n) => { let r = 1n; for (let i = 2n; i <= BigInt(n); i++) r *= i; return r; };

  function render() {
    renderApartment();
    renderStats();
    renderPaths();
    // the hexagon for p = 7 takes a moment; let the rest paint first
    if (st.p >= 7 && (!st.hexLayout || st.hexLayout.p !== st.p)) {
      $("hex-note").innerHTML = rich("Building $H(7)$ from $\\mathbb O/7\\mathbb O$…");
      setTimeout(drawHexagon, 30);
    } else drawHexagon();
  }
  // a reproducible first example
  let seed = 20261023;
  const rng0 = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  buildRandom(rng0);
  return { render, state: st };
}
