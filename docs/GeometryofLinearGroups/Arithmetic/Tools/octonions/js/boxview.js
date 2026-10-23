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
import { renderBox, expKey, esc, fmtFactored, fmtBig, el, clear } from "./ui.js";
import { quadricType } from "./g2.js";

export function renderBoxView(S, { primeColor, subDigits }) {
  const svg = document.getElementById("boxfig");
  const explain = document.getElementById("box-explain");
  const quad = document.getElementById("box-quadric");
  const detail = document.getElementById("box-detail");
  if (!S.alpha || !S.ft) {
    clear(svg); explain.textContent = S.alpha ? "α is a unit." : ""; quad.textContent = ""; return;
  }
  const ring = S.ring === "H" ? "ℍ" : "𝕆";
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
      const name = F.isLeaf(ft) ? "π" + subDigits(ft.leaf + 1) : bracketName(ft, subDigits);
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

  const info = (v) => {
    const d = dOf(v);
    let h = `<b>d = ${esc(fmtFactored(pairsOf(v)))}</b>`;
    if (d === 1n) h += `<br>the base vertex ${ring}`;
    else if (d === O.norm(S.alpha)) h += `<br>the far corner α${ring}`;
    else {
      h += `<br>B<sub>d</sub>(α) = α${ring} + d${ring}, index d${S.ring === "H" ? "²" : "⁴"} in ${ring}`;
      h += `<br>its ${U} minimal vectors = the left divisors of α of norm d`;
      if (d % 2n === 1n) {
        const pr = F.leftDivisors(S.alpha, d).find(O.isPrimary);
        if (pr) h += `<br>primary one: <span class="mono">${esc(O.format(pr))}</span>`;
      }
    }
    for (const r of records.filter((r) => expKey(r.v) === expKey(v))) {
      h += `<br>${r.side === "left" ? "●" : "■"} ${esc(r.name)} ${r.on ? `is a ${r.side} divisor of α ✓` : `is <b>not</b> a ${r.side} divisor of α` + (r.fail.length ? ` (fails at p = ${r.fail.join(", ")})` : "")}`;
    }
    return h;
  };
  renderBox(svg, axes, path, marks, {
    width: 660,
    nodeInfo: info,
    onClick: (v) => { detail.innerHTML = info(v); },
    stepLabel: (j) => "π" + subDigits(j + 1),
    nodeLabel: (v) => {
      const onP = S.primes.some((_, j) => expKey(prefixExp(j)) === expKey(v)) || expKey(prefixExp(k)) === expKey(v);
      return onP ? fmtFactored(pairsOf(v)) : "";
    },
  });

  // explanation
  const spine = records.filter((r) => !r.root);
  const onCount = spine.filter((r) => r.on).length;
  const lines = [];
  lines.push(`<p style="margin-top:0">One axis per prime, of length v<sub>p</sub>(N(α)): at each p this is the geodesic segment from ${ring} to α${ring} in the building, and the vertex at d is the lattice B<sub>d</sub>(α) = α${ring} + d${ring}. The ordering <b>${S.primes.join(", ")}</b> is the highlighted staircase; its j-th edge carries πⱼ.</p>`);
  lines.push(`<p>The root split always sits on the box (both marks at the split vertex are filled). ` +
    (spine.length
      ? `Of the ${spine.length} other spine subproduct${spine.length > 1 ? "s" : ""} of this bracketing, <b>${onCount}</b> ${onCount === 1 ? "is" : "are"} on the box and <b>${spine.length - onCount}</b> drifted off.`
      : `This bracketing has no other spine subproducts.`) + `</p>`);
  if (spine.length) {
    lines.push("<ul style='padding-left:18px;margin:4px 0'>" + spine.map((r) =>
      `<li>${r.side === "left" ? "●" : "■"} <span class="mono">${esc(r.name)}</span>: ${r.on ? `${r.side} divisor of α` : `not a ${r.side} divisor of α` + (r.fail.length ? ` — fails at ${r.fail.join(", ")}` : "")}</li>`).join("") + "</ul>");
  }
  lines.push(S.ring === "H"
    ? `<p class="note">In ℍ (associative) every subproduct of a factorization divides α, so every mark is filled: the factorization <i>is</i> the staircase.</p>`
    : `<p class="note">For quaternions every mark would be filled. In 𝕆, a subproduct divides its parent but not necessarily α, because divisibility is not transitive. Try the left comb versus the right comb, or switch an example quaternion to ring ℍ.</p>`);
  explain.innerHTML = lines.join("");

  // α mod p and the leaves mod their primes, as G₂(F_p) sees them
  const rows = P.map((p) => {
    const t = quadricType(S.alpha, p);
    return `<tr><td class="ui">p = ${p}</td><td>${badge(t)}</td><td class="muted">${t === "hexagon" ? "p | tr α" : "tr α ≢ 0 mod p"}</td></tr>`;
  });
  const leafTypes = F.leafValues(S.ft).map((v, i) => quadricType(v, S.primes[i]));
  const nh = leafTypes.filter((t) => t === "hexagon").length;
  quad.innerHTML = `<p style="margin-top:0">For p | N(α), α mod p is a point of the quadric Q₇⁺(p). G₂(𝔽<sub>p</sub>) has two orbits there: the (p⁶−1)/(p−1) trace-zero points, which form the hexagon H(p) (the link of 𝕆 in the G₂ building), and the p³(p³+1) idempotent points (stabilizer SL₃).</p>` +
    `<table class="factors">${rows.join("")}</table>` +
    `<p class="note">Factors: ${nh} of ${k} reduce to hexagon points mod their prime; the rest are idempotent points. A prime of norm p &gt; 4 reduces into the hexagon only when it is pure imaginary.</p>`;
}

function badge(t) {
  if (t === "hexagon") return `<span class="badge hex">hexagon point</span>`;
  if (t === "idempotent") return `<span class="badge idem">idempotent point</span>`;
  return `<span class="badge">${t}</span>`;
}
function push(map, key, v) { if (!map.has(key)) map.set(key, []); map.get(key).push(v); }
function bracketName(ft, subDigits) {
  const rec = (t) => (F.isLeaf(t) ? "π" + subDigits(t.leaf + 1) : "(" + rec(t.l) + rec(t.r) + ")");
  const s = rec(ft);
  return s.startsWith("(") ? s.slice(1, -1) : s;
}
// Primes p^e ∥ N(x) at which x fails to divide α (left: x̄α ∉ p^e O; right: αx̄ ∉ p^e O).
function failingPrimes(x, alpha, side) {
  const prod = side === "left" ? O.mul(O.conj(x), alpha) : O.mul(alpha, O.conj(x));
  return F.factorInteger(O.norm(x)).filter(([p, e]) => !O.divisibleBy(prod, p ** BigInt(e))).map(([p]) => String(p));
}
