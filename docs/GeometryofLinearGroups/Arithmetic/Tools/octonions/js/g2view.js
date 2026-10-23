// The G₂ tab: an apartment of B(G₂(Q_p)), the link of a hyperspecial vertex (the split Cayley
// hexagon H(p), built from the octavians mod p), counts, and factorization of explicit
// elements of G₂(Z[1/N]) along any ordering of steps — staircase paths in ∏_p B_p.

import * as G from "./g2.js";
import * as GG from "./g2group.js";
import { isProbablePrime } from "./factor.js";
import { svgEl, el, clear, esc, colorVar, tip, renderChips, renderBox, fmtBig } from "./ui.js";

const $ = (id) => document.getElementById(id);
const css = (name) => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
const subs = (n) => String(n).split("").map((c) => "₀₁₂₃₄₅₆₇₈₉"[+c]).join("");

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
  $("g2-targets").addEventListener("keydown", (e) => { if (e.key === "Enter") buildRandom(Math.random); });
  $("g2-use").addEventListener("click", () => useOwn());
  $("g2-shuffle").addEventListener("click", () => {
    const a = st.steps.slice();
    for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; }
    st.steps = a;
    refactor(true);
  });
  $("g2-sort").addEventListener("click", () => { st.steps = groupedSteps(); refactor(true); });

  function parseTargets() {
    const out = [];
    for (const tok of $("g2-targets").value.trim().split(/\s+/).filter(Boolean)) {
      const m = tok.match(/^(\d+):(\d+),(\d+)$/);
      if (!m) throw new Error(`could not read “${tok}” — use p:a,b`);
      const p = BigInt(m[1]), a = +m[2], b = +m[3];
      if (!isProbablePrime(p)) throw new Error(p + " is not prime");
      if (p > 97n) throw new Error("primes up to 97 here");
      if (a > 4 || b > 4) throw new Error("keep a, b ≤ 4");
      if (out.some((t) => t.p === p)) throw new Error("repeated prime " + p);
      if (a + b) out.push({ p, a, b });
    }
    if (!out.length) throw new Error("give at least one target p:a,b");
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
      const g = GG.parseTriple($("g2-u1").value, $("g2-u2").value, $("g2-u3").value);
      const sup = GG.supportOf(g);
      if (sup.some((p) => p > 97n)) throw new Error("g has denominators at primes above 97");
      const pos = GG.positions(g, sup);
      const targets = sup.map((p, i) => ({ p, a: pos[i][0], b: pos[i][1] }));
      if (targets.reduce((s, t) => s + t.a + t.b, 0) > 12) throw new Error("this g needs more than 12 steps");
      setG(g, targets);
      if (!targets.length) st.err = "This g fixes 𝕆: it is one of the 12096 elements of Aut(𝕆) = G₂(𝔽₂).";
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
          tip(`Chamber ${i + 1} of the 12 at 𝕆 — in the building it is one of (p+1)·#H(p) = ${fmtBig(BigInt(st.p + 1) * G.hexagonSize(st.p))} chambers at 𝕆; it corresponds to the highlighted flag of H(p).`, e);
        });
        poly.addEventListener("pointerleave", () => { st.hoverChamber = -1; poly.setAttribute("style", "cursor:pointer"); drawHexagon(); tip(null); });
      }
    }
    // dominant cone
    if ($("g2-cone").checked) {
      const r = R + 0.5;
      const pts = [[0, 0], [r, 0], [r * Math.cos(Math.PI / 6), r * Math.sin(Math.PI / 6)]];
      svgEl("polygon", { points: pts.map((q) => X(q) + "," + Y(q)).join(" "), fill: css("--accent"), "fill-opacity": 0.1, stroke: css("--accent"), "stroke-width": 1, "stroke-opacity": 0.5, "pointer-events": "none" }, g);
      const l1 = svgEl("text", { x: X([R - 0.25, 0]) , y: Y([R - 0.25, 0]) + 14, class: "poslbl", style: "fill:var(--accent)" }, g); l1.textContent = "ω_s";
      const q2 = [(R - 0.4) * Math.cos(Math.PI / 6), (R - 0.4) * Math.sin(Math.PI / 6)];
      const l2 = svgEl("text", { x: X(q2) - 6, y: Y(q2) - 6, class: "poslbl", style: "fill:var(--accent)" }, g); l2.textContent = "ω_ℓ";
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
        ? `<b>𝕆</b> — the base vertex (stabilizer G₂(ℤ<sub>${st.p}</sub>))`
        : `<b>position ${a ? (a > 1 ? a : "") + "ω_s" : ""}${a && b ? " + " : ""}${b ? (b > 1 ? b : "") + "ω_ℓ" : ""}</b> from 𝕆<br>` +
          `${esc(fmtBig(n))} hyperspecial vertices of the building sit at this position`;
      hit.addEventListener("pointerenter", (e) => tip(msg, e));
      hit.addEventListener("pointermove", (e) => tip(msg, e));
      hit.addEventListener("pointerleave", () => tip(null));
      if (showLab && h.mn[0] - h.mn[1] >= 0 && h.mn[1] >= 0 && (a || b)) {
        const t = svgEl("text", { x: x + 5, y: y + 11, class: "poslbl" }, gv);
        t.textContent = `${a},${b}`;
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
      note.textContent = `H(${st.p}) has ${fmtBig(G.hexagonSize(st.p))} points — too many to draw here; counts are on the left.`;
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
    note.innerHTML = `H(${st.p}): ${fmtBig(BigInt(L.H.points.length))} points (● = type-2 vertices, SL₃-type) and ${fmtBig(BigInt(L.H.lines.length))} lines (■ = type-1 vertices, SO₄-type) adjacent to 𝕆. ` +
      `Each point is on ${st.p + 1} lines and each line has ${st.p + 1} points. Rings are distance 0…6 from one point in the incidence graph, with sizes 1, ${st.p + 1}, ${st.p * (st.p + 1)}, ${st.p ** 2 * (st.p + 1)}, ${st.p ** 3 * (st.p + 1)}, ${st.p ** 4 * (st.p + 1)}, ${st.p ** 5}. ` +
      `The girth is 12 and the diameter 6, so this is a generalized hexagon. The outer ring is the ${st.p ** 5} points opposite the centre, with chords back to ring 5. The blue 12-cycle is one apartment of H(${st.p}): the 12 chambers at 𝕆 in the apartment on the left.`;
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
    const what = n.kind === "p" ? "point of H(p): an isotropic line in Im(𝕆/p𝕆)" : "line of H(p): a plane ⟨x, y⟩ with xy = 0";
    tip(`<b>${n.kind === "p" ? "point" : "line"} ${n.id}</b> — ${what}<br>distance ${n.level} from the centre point in the incidence graph` +
      (n.kind === "p" ? `<br><span class="mono">coords mod ${st.p}: (${L.H.points[n.id].join(", ")})</span> in the ℤ-basis of 𝕆` : ""), e);
  });
  $("hexcanvas").addEventListener("pointerleave", () => tip(null));

  // ------------------------------------------------------------------ counts
  function renderStats() {
    const p = BigInt(st.p);
    const hs = G.hexagonSize(st.p);
    const rows = [
      ["octavian primes of norm p", 240n * (p ** 3n + 1n)],
      ["… mod units (Rehm's primary primes; a spread of Q₇⁺(p))", p ** 3n + 1n],
      ["points of the quadric Q₇⁺(p) ⊂ ℙ(𝕆/p𝕆)", (p + 1n) * (p * p + 1n) * (p ** 3n + 1n)],
      ["   trace-zero points = points of H(p)", hs],
      ["   idempotent points (stabilizer SL₃(𝔽ₚ))", p ** 3n * (p ** 3n + 1n)],
      ["type-1 and type-2 vertices adjacent to 𝕆 (each)", hs],
      ["chambers containing 𝕆 (flags of H(p))", (p + 1n) * hs],
      ["hyperspecial vertices at ω_s (short step)", G.hyperspecialCount(st.p, 1, 0)],
      ["hyperspecial vertices at ω_ℓ (long step)", G.hyperspecialCount(st.p, 0, 1)],
      ["|G₂(𝔽ₚ)| = p⁶(p⁶−1)(p²−1)", p ** 6n * (p ** 6n - 1n) * (p * p - 1n)],
      ["vertex stabilizer in G₂(ℤ[1/N]): Aut(octavians) = G₂(𝔽₂)", BigInt(G.G2F2_ORDER)],
    ];
    const box = $("g2-stats");
    clear(box);
    for (const [k, v] of rows) box.append(el("div", { class: "k" }, k), el("div", { class: "v" }, fmtBig(v)));
  }

  // ------------------------------------------------------------------ paths
  function renderPaths() {
    $("g2paths-intro").innerHTML =
      `G₂(ℤ[1/N]) = Aut(𝕆[1/N]) acts on ∏<sub>p|N</sub> B<sub>p</sub>, transitively on hyperspecial vertices (= maximal orders), with stabilizer Aut(𝕆) ≅ G₂(𝔽₂). ` +
      `An element g puts g𝕆 at position a<sub>p</sub>ω_s + b<sub>p</sub>ω_ℓ at each p. For <b>every ordering</b> of those steps there is exactly one chain of vertices, so exactly one factorization ` +
      `g = h₁h₂⋯h<sub>m</sub>·u, where each h<sub>i</sub> is a canonical <i>G₂-prime</i> (one short or long step at one prime) and u ∈ Aut(𝕆). ` +
      `Everything is exact: each vertex is computed by lattice operations, each h<sub>i</sub> by finding an isomorphism 𝕆 → h₁⋯h<sub>i</sub>𝕆 among the 126 imaginary units of that maximal order, and the product is re-multiplied as a check.`;
    const err = $("g2-err");
    err.hidden = !st.err; err.textContent = st.err;
    const kv = $("g2-g");
    clear(kv);
    if (!st.g) return;
    const add = (k, v, mono = true) => kv.append(el("div", { class: "k" }, k), el("div", { class: mono ? "v" : "", html: v }));
    GG.gFormat(st.g).forEach((line, i) => add(i ? "" : "g", esc(line)));
    add("support", st.targets.length ? "N = " + tPrimes().join("·") : "—", false);
    add("g𝕆 at", st.targets.map((t) => `<span style="color:${stepColor(t.p)};font-weight:600">p=${t.p}</span>: ${posText(t.a, t.b)}`).join(" &nbsp; ") || "𝕆 itself", false);
    renderChips($("g2-chips"), st.steps.map((s) => ({
      label: s.p + (s.kind === "s" ? "ₛ" : "ℓ"),
      sub: s.kind === "s" ? "short" : "long",
      aria: `prime ${s.p}, ${s.kind === "s" ? "short" : "long"} step`,
      color: stepColor(s.p),
    })), (order) => { st.steps = order.map((i) => st.steps[i]); refactor(true); });
    const m = st.steps.length;
    let orderings = factorial(m);
    for (const t of st.targets) orderings /= factorial(t.a) * factorial(t.b);
    $("g2-count").innerHTML = `${fmtBig(orderings)} orderings, each a staircase and each a unique factorization. ` +
      tPrimes().map((p) => `G₂-primes at ${p}: ${fmtBig(G.hyperspecialCount(p, 1, 0))} short, ${fmtBig(G.hyperspecialCount(p, 0, 1))} long`).join("; ") + ".";
    const tbl = $("g2-table");
    clear(tbl);
    if (!st.fz) { $("g2-formula").textContent = ""; $("g2-verify").textContent = ""; clear($("g2box")); return; }
    $("g2-formula").textContent = "g = " + st.fz.factors.map((_, i) => "h" + subs(i + 1)).join(" · ") + (m ? " · u" : "u");
    const prod = GG.gCompose(GG.multiply(st.fz.factors.map((f) => f.h)), st.fz.unit);
    $("g2-verify").innerHTML = GG.gEquals(prod, st.g)
      ? `<span class="badge ok">✓ verified</span> h₁⋯h<sub>m</sub>·u = g exactly, and u𝕆 = 𝕆`
      : `<span class="badge bad">✗</span> product mismatch (bug)`;
    tbl.append(el("tr", {}, el("th", {}, ""), el("th", {}, "step"), el("th", {}, "factor (images of e₁, e₂, e₃)"), el("th", {}, "")));
    const prev = st.prevKeys ? new Set(st.prevKeys) : null;
    let nNew = 0;
    st.fz.factors.forEach((f, i) => {
      const isNew = prev && !prev.has(GG.gKey(f.h));
      if (isNew) nNew++;
      tbl.append(el("tr", { class: isNew ? "changed" : "" },
        el("td", {}, "h" + subs(i + 1)),
        el("td", { style: `color:${stepColor(f.p)};font-weight:600;white-space:nowrap` }, `${f.p} ${f.kind === "s" ? "short" : "long"}`),
        el("td", { class: "v", html: GG.gFormat(f.h).map(esc).join("<br>") }),
        el("td", { html: `<span class="badge">${f.kind === "s" ? "ω_s" : "ω_ℓ"}</span>` })));
    });
    tbl.append(el("tr", {},
      el("td", {}, "u"),
      el("td", { class: "muted", style: "white-space:nowrap" }, "Aut(𝕆)"),
      el("td", { class: "v", html: GG.gFormat(st.fz.unit).map(esc).join("<br>") }),
      el("td", { html: `<span class="badge warn">unit</span>` })));
    if (prev) tbl.append(el("tr", {}, el("td", { colspan: "4", class: "note" }, nNew ? `${nNew} of ${m} factors are new compared with the previous ordering (highlighted).` : "Same factors as before.")));
    // the box
    const axes = [], axisOf = new Map();
    for (const t of st.targets) {
      if (t.a) { axisOf.set(t.p + "s", axes.length); axes.push({ len: t.a, color: stepColor(t.p), label: `${t.p} short` }); }
      if (t.b) { axisOf.set(t.p + "l", axes.length); axes.push({ len: t.b, color: stepColor(t.p), label: `${t.p} long` }); }
    }
    const path = st.steps.map((s) => axisOf.get(s.p + s.kind));
    const pathKeys = [];
    { const v = new Array(axes.length).fill(0); pathKeys.push(v.join(",")); for (const a of path) { v[a]++; pathKeys.push(v.join(",")); } }
    renderBox($("g2box"), axes, path, new Map(), {
      width: 560, maxHeight: 340,
      stepLabel: (j) => "h" + subs(j + 1),
      nodeInfo: (v) => {
        const j = pathKeys.indexOf(v.join(","));
        let i = 0;
        const parts = [];
        for (const t of st.targets) {
          let a = 0, b = 0;
          if (t.a) a = v[i++];
          if (t.b) b = v[i++];
          parts.push(`p=${t.p}: ${posText(a, b)}`);
        }
        if (j < 0) return parts.join("<br>") + `<br><span class="muted">(off the current staircase)</span>`;
        const comp = st.posTrack[j];
        const check = st.targets.every((t, k) => { const [a, b] = comp.get(String(t.p)); return parts[k] === `p=${t.p}: ${posText(a, b)}`; });
        return `<b>${j ? "h₁⋯h" + subs(j) + "𝕆" : "𝕆"}</b> — a maximal order at<br>` + parts.join("<br>") +
          `<br>${check ? "✓ positions recomputed from the lattice" : "✗ position mismatch"}`;
      },
    });
    $("g2box-note").innerHTML = `The box is the product over (p, step kind) of chains, i.e. the product of the parallelograms spanned by ω_s and ω_ℓ in each B<sub>p</sub>. ` +
      `Each vertex of the box is one maximal order, the same for every ordering. ` +
      (st.boxBad ? `<b>✗ ${st.boxBad} inconsistencies</b>` : `✓ consistent over the ${st.orderingsTried.size} ordering${st.orderingsTried.size > 1 ? "s" : ""} tried so far (${st.boxSeen.size} box vertices met)`) +
      `. Contrast the octavians on the Box &amp; paths tab, where subproducts drift off their box.`;
  }
  const posText = (a, b) => (!a && !b ? "0" : [a ? (a > 1 ? a : "") + "ω_s" : "", b ? (b > 1 ? b : "") + "ω_ℓ" : ""].filter(Boolean).join(" + "));
  const factorial = (n) => { let r = 1n; for (let i = 2n; i <= BigInt(n); i++) r *= i; return r; };

  function render() {
    renderApartment();
    renderStats();
    renderPaths();
    // the hexagon for p = 7 takes a moment; let the rest paint first
    if (st.p >= 7 && (!st.hexLayout || st.hexLayout.p !== st.p)) {
      $("hex-note").textContent = "Building H(7) from 𝕆/7𝕆…";
      setTimeout(drawHexagon, 30);
    } else drawHexagon();
  }
  // a reproducible first example
  let seed = 20261023;
  const rng0 = () => { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; };
  buildRandom(rng0);
  return { render, state: st };
}
