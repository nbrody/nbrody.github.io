// UI controller for the quaternion beam-search tool.
import { qmul, keyOf } from "./quaternion.js";

// ---- number theory helpers ------------------------------------------------
function isqrt(n) { if (n < 2n) return n; let x = n, y = (x + 1n) / 2n; while (y < x) { x = y; y = (x + n / x) / 2n; } return x; }
function isPrime(n) {
  if (n < 2n) return false;
  for (const p of [2n,3n,5n,7n,11n,13n,17n,19n,23n,29n,31n,37n]) { if (n % p === 0n) return n === p; }
  // Miller-Rabin
  let d = n - 1n, r = 0n; while (d % 2n === 0n) { d /= 2n; r++; }
  const wit = [2n,3n,5n,7n,11n,13n,17n,19n,23n,29n,31n,37n];
  for (const a of wit) {
    let x = modpow(a % n, d, n); if (x === 1n || x === n - 1n) continue;
    let ok = false;
    for (let i = 0n; i < r - 1n; i++) { x = (x*x) % n; if (x === n - 1n) { ok = true; break; } }
    if (!ok) return false;
  }
  return true;
}
function modpow(b, e, m) { b %= m; let r = 1n; while (e > 0n) { if (e & 1n) r = (r*b) % m; b = (b*b) % m; e >>= 1n; } return r; }
// return {p, e} if n = p^e (p prime), else null
function primePower(n) {
  if (n < 2n) return null;
  // find smallest prime factor
  let p = null;
  if (n % 2n === 0n) p = 2n;
  else { for (let i = 3n; i*i <= n; i += 2n) { if (n % i === 0n) { p = i; break; } } if (p === null) p = n; }
  if (!isPrime(p)) return null;
  let e = 0, m = n; while (m % p === 0n) { m /= p; e++; } if (m !== 1n) return null;
  return { p, e };
}

const Q = (id) => document.getElementById(id);
const coordsA = () => ["aw","ax","ay","az"].map((id) => BigInt(Q(id).value || "0"));
const coordsB = () => ["bw","bx","by","bz"].map((id) => BigInt(Q(id).value || "0"));
const qnormJS = (A) => A[0]*A[0]+A[1]*A[1]+A[2]*A[2]+A[3]*A[3];

function fmtQuat(A) {
  const names = ["", "i", "j", "k"];
  let parts = [];
  A.forEach((v, idx) => { if (v !== 0n) parts.push((v>0n&&parts.length? "+ ":(v<0n?"− ":"")) + (v<0n? (-v):v) + names[idx]); });
  return parts.join(" ") || "0";
}

let worker = null;

function validate() {
  const a = coordsA(), b = coordsB();
  const Na = qnormJS(a), Nb = qnormJS(b);
  const pa = primePower(Na), pb = primePower(Nb);
  const msg = Q("validation");
  Q("normA").textContent = Na.toString();
  Q("normB").textContent = Nb.toString();
  Q("factA").textContent = pa ? `${pa.p}^${pa.e}` : "not a prime power";
  Q("factB").textContent = pb ? `${pb.p}^${pb.e}` : "not a prime power";
  let problems = [];
  if (!pa) problems.push("N(a) must be a prime power p^x");
  if (!pb) problems.push("N(b) must be a prime power q^y");
  if (pa && pb && pa.p === pb.p) problems.push("p and q must be different primes");
  if (pa && pa.p % 4n !== 1n) problems.push(`p = ${pa.p} must be ≡ 1 (mod 4) for the LPS free-group structure`);
  if (pa && pa.p === 2n) problems.push("p must be odd");
  if (pb && pb.p === 2n) problems.push("q must be odd");
  const ok = problems.length === 0;
  // soft warning: commuting generators can never give finite index
  let warn = "";
  if (ok && keyOf(qmul(a, b)) === keyOf(qmul(b, a)))
    warn = " ⚠ a and b commute (they lie in a common ℚ(√−1) plane) — ⟨a,b⟩ is abelian and cannot have finite index. Pick b with components outside a's imaginary line.";
  msg.className = "validation " + (ok ? (warn ? "warn" : "ok") : "bad");
  msg.innerHTML = ok
    ? `✓ Will search for a finite-index subgroup of <b>PH(ℤ[1/${pa.p}])</b> = F<sub>${(Number(pa.p)+1)/2}</sub>, acting on the tree T<sub>${Number(pb.p)+1}</sub> at q = ${pb.p}.` + warn
    : "⚠ " + problems.join("; ");
  Q("runBtn").disabled = !ok;
  return ok ? { a, b, p: Number(pa.p), q: Number(pb.p) } : null;
}

function setRunning(on) {
  Q("runBtn").disabled = on;
  Q("stopBtn").style.display = on ? "inline-block" : "none";
  Q("spinner").style.display = on ? "inline-block" : "none";
}

function run() {
  const v = validate();
  if (!v) return;
  if (worker) worker.terminate();
  setRunning(true);
  Q("result").innerHTML = "";
  Q("log").textContent = "";
  const budget = parseInt(Q("budget").value || "120000", 10);
  // precision: enough for the tree distances we will see
  const precision = Math.max(16, Math.min(60, parseInt(Q("prec").value || "26", 10)));

  worker = new Worker("./js/worker.js", { type: "module" });
  const t0 = performance.now();
  worker.onmessage = (e) => {
    const m = e.data;
    if (m.type === "progress") {
      const ev = m.ev, s = ev.stats;
      if (ev.phase === "complete")
        log(`★ Stallings graph COMPLETE at ${ev.visited} nodes → index ${ev.index}. Confirming…`);
      else
        log(`visited ${ev.visited}  orbit ${ev.orbit}  H-gens ${ev.nGen}  index ${ev.index ?? "—"}  (V=${s.vertices}, missing ${s.missing})`);
    } else if (m.type === "done") {
      setRunning(false);
      renderResult(m.res, (performance.now() - t0) / 1000);
    } else if (m.type === "error") {
      setRunning(false);
      log("ERROR: " + m.error);
    }
  };
  worker.postMessage({
    a: v.a.map(String), b: v.b.map(String), p: v.p, q: v.q,
    precision, nodeBudget: budget, confirmNodes: 6000, reportEvery: 3000,
  });
}

function log(s) { const el = Q("log"); el.textContent += s + "\n"; el.scrollTop = el.scrollHeight; }

function renderResult(res, secs) {
  const s = res.stats;
  const ok = res.index !== null;
  let html = `<div class="verdict ${ok ? "ok" : "bad"}">`;
  if (ok) {
    html += `<h3>✓ Finite index ${res.index} in PH(ℤ[1/${res.p}])-as-F<sub>${res.rank}</sub></h3>
      <p>⟨a,b⟩ contains a subgroup of index <b>${res.index}</b> in the free group
      F<sub>${res.rank}</sub> = ⟨norm-${res.p} quaternions⟩, which is finite-index in PH(ℤ[1/${res.p}]).</p>`;
  } else if (res.capHit && res.nGen <= 2) {
    html += `<h3>Degenerate / abelian</h3>
      <p>The orbit ran straight to the tree-distance cap finding essentially no
      relations (only ${res.nGen} H-generators). This is the signature of
      <b>a,b commuting</b> or otherwise generating a thin (non-discrete-cocompact)
      group — no finite-index subgroup exists. Choose a b that does not lie in a's
      ℚ(√−1) plane.</p>`;
  } else {
    html += `<h3>No finite-index certificate within budget</h3>
      <p>The Stallings graph did not close up (still ${s.missing} missing labels;
      max tree distance reached ${res.maxDistSeen}${res.capHit ? ", precision cap hit" : ""}).
      Increase the node budget${res.capHit ? " and the q-adic precision" : ""}, or this
      pair may not generate a finite-index subgroup.</p>`;
  }
  html += `</div>
    <div class="metrics">
      <div><span>index</span><b>${res.index ?? "—"}</b></div>
      <div><span>Stallings rank</span><b>${s.rank}</b></div>
      <div><span>vertices</span><b>${s.vertices}</b></div>
      <div><span>H-generators</span><b>${res.nGen}</b></div>
      <div><span>tree nodes</span><b>${res.orbit}</b></div>
      <div><span>time</span><b>${secs.toFixed(1)}s</b></div>
    </div>`;
  if (ok) html += `<p class="check">Nielsen–Schreier check: rank ${s.rank} = ${res.rank - 1}·index + 1 = ${(res.rank - 1) * res.index + 1} ${s.rank === (res.rank - 1) * res.index + 1 ? "✓" : "✗"}</p>`;
  html += `<h4>Stallings core graph <span class="muted">(${s.vertices} vertices; edge colours = free generators)</span></h4>
    <canvas id="graph" width="900" height="520"></canvas>`;
  Q("result").innerHTML = html;
  drawGraph(res.graph);
}

// ---- simple spring-embedder graph drawing ---------------------------------
const PALETTE = ["#6ea8ff","#ff8ad1","#5ef0c8","#ffd166","#c08bff","#7af5ff","#ff9a76","#9bff8a","#ff6b9d","#8ab4ff"];
function drawGraph(g) {
  const cv = Q("graph"); if (!cv) return;
  const ctx = cv.getContext("2d"), W = cv.width, H = cv.height;
  const N = g.nodes.length;
  const pos = g.nodes.map((_, i) => ({ x: W/2 + Math.cos(2*Math.PI*i/N)*200 + (Math.random()-0.5)*40,
                                       y: H/2 + Math.sin(2*Math.PI*i/N)*200 + (Math.random()-0.5)*40,
                                       vx: 0, vy: 0 }));
  const links = g.links;
  const k = 90;                                  // ideal spring length
  function step() {
    for (let i = 0; i < N; i++) for (let j = i+1; j < N; j++) {
      let dx = pos[i].x - pos[j].x, dy = pos[i].y - pos[j].y; let d2 = dx*dx + dy*dy + 0.01;
      const f = 2200 / d2; const d = Math.sqrt(d2);
      pos[i].vx += f*dx/d; pos[i].vy += f*dy/d; pos[j].vx -= f*dx/d; pos[j].vy -= f*dy/d;
    }
    for (const L of links) {
      const a = pos[L.source], b = pos[L.target];
      let dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) + 0.01;
      const f = (d - k) * 0.02;
      a.vx += f*dx/d; a.vy += f*dy/d; b.vx -= f*dx/d; b.vy -= f*dy/d;
    }
    for (const pq of pos) { pq.x += (pq.vx *= 0.85); pq.y += (pq.vy *= 0.85);
      pq.x = Math.max(20, Math.min(W-20, pq.x)); pq.y = Math.max(20, Math.min(H-20, pq.y)); }
  }
  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.lineWidth = 1.6;
    for (const L of links) {
      const a = pos[L.source], b = pos[L.target];
      ctx.strokeStyle = PALETTE[L.label % PALETTE.length];
      ctx.globalAlpha = 0.75;
      ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    }
    ctx.globalAlpha = 1;
    for (const p of pos) { ctx.fillStyle = "#0b1024"; ctx.strokeStyle = "#9fb4ff"; ctx.lineWidth = 1.4;
      ctx.beginPath(); ctx.arc(p.x, p.y, 4.5, 0, 2*Math.PI); ctx.fill(); ctx.stroke(); }
  }
  let frame = 0;
  (function loop() { for (let s = 0; s < 3; s++) step(); draw(); if (frame++ < 220) requestAnimationFrame(loop); })();
}

// ---- presets & wiring -----------------------------------------------------
const PRESETS = {
  "5,13": [[1,2,0,0],[3,0,2,0]],
  "13,5": [[3,0,2,0],[1,2,0,0]],
  "5,17": [[1,2,0,0],[3,2,2,0]],
};
function setQuat(prefix, c) { ["w","x","y","z"].forEach((s, i) => Q(prefix+s).value = c[i]); }
function applyPreset(key) { const p = PRESETS[key]; if (p) { setQuat("a", p[0]); setQuat("b", p[1]); validate(); } }

window.addEventListener("DOMContentLoaded", () => {
  ["aw","ax","ay","az","bw","bx","by","bz"].forEach((id) => Q(id).addEventListener("input", validate));
  Q("runBtn").addEventListener("click", run);
  Q("stopBtn").addEventListener("click", () => { if (worker) { worker.terminate(); setRunning(false); log("(stopped)"); } });
  document.querySelectorAll("[data-preset]").forEach((el) =>
    el.addEventListener("click", () => applyPreset(el.dataset.preset)));
  applyPreset("5,13");
});
