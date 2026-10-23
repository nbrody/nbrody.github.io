// "Box & paths": the canonical box of α in ∏_p B(Spin₈(Q_p)).
//
// For d | N(α) the lattice B_d(α) = αO + dO is a vertex of the product of buildings; at each
// p these vertices lie on the geodesic segment from O to αO, so together they form a product
// of segments.  Its 240 minimal vectors are exactly the left divisors of α of norm d.  An
// ordering of the primes is a staircase through the box.  We mark every subproduct on the
// left spine (resp. right spine) of the current bracketing: is it actually a left (right)
// divisor of α, i.e. does it lie in the box vertex its norm points to?

import * as O from "./octavian.js";
import * as F from "./factor.js";
import { renderBox, expKey, clear } from "./ui.js";
import { tex, rich, texFactored } from "./tex.js";
import { quadricType } from "./g2.js";

export function renderBoxView(S, { primeColor }) {
  const svg = document.getElementById("boxfig");
  const explain = document.getElementById("box-explain");
  const quad = document.getElementById("box-quadric");
  const detail = document.getElementById("box-detail");
  if (!S.alpha || !S.ft) {
    clear(svg); explain.innerHTML = S.alpha ? tex("\\alpha") + " is a unit." : ""; quad.textContent = ""; return;
  }
  const R = S.ring === "H" ? "\\mathbb H" : "\\mathbb O";
  const U = F.unitCount();
  const k = S.primes.length;
  const P = [...new Set(S.primes.map(String))].map(BigInt).sort((a, b) => (a < b ? -1 : 1));
  const ex = P.map((p) => S.primes.filter((q) => q === p).length);
  const axes = P.map((p, i) => ({ len: ex[i], color: primeColor(p), label: "p=" + p }));
  const path = S.primes.map((p) => P.findIndex((q) => q === p));
  const prefixExp = (j) => { const v = new Array(P.length).fill(0); for (let t = 0; t < j; t++) v[path[t]]++; return v; };
  const dOf = (v) => v.reduce((acc, e, i) => acc * P[i] ** BigInt(e), 1n);
  const pairsOf = (v) => v.map((e, i) => [P[i], e]).filter(([, e]) => e > 0);

  // markers from the spine subproducts
  const marks = new Map();
  const records = [];
  const walk = (ft) => {
    if (ft.path !== "") {
      const [i, j] = ft.interval;
      const name = bracketTex(ft);
      if (i === 0) {
        const v = prefixExp(j + 1), on = F.leftDivides(ft.value, S.alpha);
        const fail = on ? [] : failingPrimes(ft.value, S.alpha, "left");
        push(marks, expKey(v), { shape: "circle", on });
        records.push({ side: "left", name, on, fail, v, value: ft.value, root: ft.path.length === 1 });
      }
      if (j === k - 1) {
        const v = prefixExp(i), on = F.rightDivides(ft.value, S.alpha);
        const fail = on ? [] : failingPrimes(ft.value, S.alpha, "right");
        push(marks, expKey(v), { shape: "square", on });
        records.push({ side: "right", name, on, fail, v, value: ft.value, root: ft.path.length === 1 });
      }
    }
    if (!F.isLeaf(ft)) { walk(ft.l); walk(ft.r); }
  };
  walk(S.ft);

  const verdict = (r) => (r.on
    ? `$${r.name}$ is a ${r.side} divisor of $\\alpha$ ✓`
    : `$${r.name}$ is <b>not</b> a ${r.side} divisor of $\\alpha$` + (r.fail.length ? ` (fails at $p = ${r.fail.join(", ")}$)` : ""));
  const info = (v) => {
    const d = dOf(v);
    let h = `$d = ${texFactored(pairsOf(v))}$`;
    if (d === 1n) h += `<br>the base vertex $${R}$`;
    else if (d === O.norm(S.alpha)) h += `<br>the far corner $\\alpha${R}$`;
    else {
      h += `<br>$B_d(\\alpha) = \\alpha${R} + d${R}$, of index $d^{${S.ring === "H" ? 2 : 4}}$ in $${R}$`;
      h += `<br>its ${U} minimal vectors are the left divisors of $\\alpha$ of norm $d$`;
      if (d % 2n === 1n) {
        const pr = F.leftDivisors(S.alpha, d).find(O.isPrimary);
        if (pr) h += `<br>primary one: $${O.formatTex(pr)}$`;
      }
    }
    for (const r of records.filter((r) => expKey(r.v) === expKey(v))) h += `<br>${r.side === "left" ? "●" : "■"} ${verdict(r)}`;
    return rich(h);
  };
  renderBox(svg, axes, path, marks, {
    width: 660,
    nodeInfo: info,
    onClick: (v) => { detail.innerHTML = info(v); },
    stepLabel: (j) => `\\pi_{${j + 1}}`,
    nodeLabel: (v) => {
      const onP = S.primes.some((_, j) => expKey(prefixExp(j)) === expKey(v)) || expKey(prefixExp(k)) === expKey(v);
      return onP && v.some((e) => e) ? texFactored(pairsOf(v)) : "";
    },
  });

  // explanation
  const spine = records.filter((r) => !r.root);
  const onCount = spine.filter((r) => r.on).length;
  const lines = [];
  lines.push(`<p style="margin-top:0">One axis per prime $p$, of length $v_p(N(\\alpha))$. At each $p$ this is the geodesic segment from $${R}$ to $\\alpha${R}$ in the building, and the vertex at $d$ is the lattice $B_d(\\alpha) = \\alpha${R} + d${R}$. The ordering $${S.primes.join(",\\,")}$ is the highlighted staircase; its $j$-th edge carries $\\pi_j$.</p>`);
  lines.push(`<p>The root split always sits on the box (both marks at the split vertex are filled). ` +
    (spine.length
      ? `Of the ${spine.length} other spine subproduct${spine.length > 1 ? "s" : ""} of this bracketing, <b>${onCount}</b> ${onCount === 1 ? "is" : "are"} on the box and <b>${spine.length - onCount}</b> drifted off.`
      : `This bracketing has no other spine subproducts.`) + `</p>`);
  if (spine.length) lines.push("<ul style='padding-left:18px;margin:4px 0'>" + spine.map((r) => `<li>${r.side === "left" ? "●" : "■"} ${verdict(r)}</li>`).join("") + "</ul>");
  lines.push(S.ring === "H"
    ? `<p class="note">In $\\mathbb H$ (associative) every subproduct of a factorization divides $\\alpha$, so every mark is filled: the factorization <i>is</i> the staircase.</p>`
    : `<p class="note">For quaternions every mark would be filled. In $\\mathbb O$ a subproduct divides its parent but not necessarily $\\alpha$, because divisibility is not transitive. Try the left comb against the right comb, or switch an example quaternion to ring $\\mathbb H$.</p>`);
  explain.innerHTML = rich(lines.join(""));

  // α mod p and the leaves mod their primes, as G₂(F_p) sees them
  const rows = P.map((p) => {
    const t = quadricType(S.alpha, p);
    return `<tr><td>${tex("p = " + p)}</td><td>${badge(t)}</td><td class="muted">${tex(t === "hexagon" ? `${p} \\mid \\operatorname{tr}\\alpha` : `\\operatorname{tr}\\alpha \\not\\equiv 0 \\pmod{${p}}`)}</td></tr>`;
  });
  const leafTypes = F.leafValues(S.ft).map((v, i) => quadricType(v, S.primes[i]));
  const nh = leafTypes.filter((t) => t === "hexagon").length;
  quad.innerHTML = rich(`<p style="margin-top:0">For $p \\mid N(\\alpha)$, $\\alpha \\bmod p$ is a point of the quadric $Q_7^+(p)$. The group $G_2(\\mathbb F_p)$ has two orbits there: the $(p^6-1)/(p-1)$ trace-zero points, which form the hexagon $H(p)$ (the link of $\\mathbb O$ in the $G_2$ building), and the $p^3(p^3+1)$ idempotent points (stabilizer $\\mathrm{SL}_3(\\mathbb F_p)$).</p>`) +
    `<table class="factors">${rows.join("")}</table>` +
    rich(`<p class="note">Factors: ${nh} of ${k} reduce to hexagon points mod their prime; the rest are idempotent points. A prime of norm $p > 4$ reduces into the hexagon only when it is pure imaginary.</p>`);
}

function badge(t) {
  if (t === "hexagon") return `<span class="badge hex">hexagon point</span>`;
  if (t === "idempotent") return `<span class="badge idem">idempotent point</span>`;
  return `<span class="badge">${t}</span>`;
}
function push(map, key, v) { if (!map.has(key)) map.set(key, []); map.get(key).push(v); }
function bracketTex(ft) {
  const rec = (t) => (F.isLeaf(t) ? `\\pi_{${t.leaf + 1}}` : "(" + rec(t.l) + rec(t.r) + ")");
  const s = rec(ft);
  return s.startsWith("(") ? s.slice(1, -1) : s;
}
// Primes p^e ∥ N(x) at which x fails to divide α (left: x̄α ∉ p^e O; right: αx̄ ∉ p^e O).
function failingPrimes(x, alpha, side) {
  const prod = side === "left" ? O.mul(O.conj(x), alpha) : O.mul(alpha, O.conj(x));
  return F.factorInteger(O.norm(x)).filter(([p, e]) => !O.divisibleBy(prod, p ** BigInt(e))).map(([p]) => String(p));
}
