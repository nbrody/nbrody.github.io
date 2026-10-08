// Figure 6 — angular Gauss–Bonnet (3.1) on a disk diagram whose interior vertices have the least angle K allows.
// Combinatorics: the (2,7,7) triangle tiling of ℍ² (4 triangles at O, 14 at V and W).
// Metric: every triangle is the paper's Euclidean triangle, angles 3π/5, π/5, π/5. Angles are in units of π/5.

import { el, controls, button, segmented, makeCanvas, palette, onTheme, pointer, rgba } from './common.js';

// ---------- complex helpers ----------
const C = (x, y) => ({ x, y });
const sub = (a, b) => C(a.x - b.x, a.y - b.y);
const abs2 = (a) => a.x * a.x + a.y * a.y;

// Geodesic through p, q in the Poincaré disk: a line through 0 or a circle orthogonal to the unit circle.
export function geodesic(p, q) {
  const cross = p.x * q.y - p.y * q.x;
  if (Math.abs(cross) < 1e-12) { const th = Math.atan2(q.y - p.y, q.x - p.x); return { line: true, th }; }
  // circumcenter of p, q, p* = p/|p|²
  const ps = C(p.x / abs2(p), p.y / abs2(p));
  const ax = p.x, ay = p.y, bx = q.x, by = q.y, cx = ps.x, cy = ps.y;
  const d = 2 * (ax * (by - cy) + bx * (cy - ay) + cx * (ay - by));
  const ux = ((ax * ax + ay * ay) * (by - cy) + (bx * bx + by * by) * (cy - ay) + (cx * cx + cy * cy) * (ay - by)) / d;
  const uy = ((ax * ax + ay * ay) * (cx - bx) + (bx * bx + by * by) * (ax - cx) + (cx * cx + cy * cy) * (bx - ax)) / d;
  const c = C(ux, uy);
  return { line: false, c, R2: abs2(sub(p, c)) };
}
export function reflect(g, z) {
  if (g.line) {
    const c2 = Math.cos(2 * g.th), s2 = Math.sin(2 * g.th);
    return C(c2 * z.x + s2 * z.y, s2 * z.x - c2 * z.y);
  }
  const w = sub(z, g.c), k = g.R2 / abs2(w);
  return C(g.c.x + k * w.x, g.c.y + k * w.y);
}
function sideOf(g, z) { return g.line ? Math.sign(Math.cos(g.th) * z.y - Math.sin(g.th) * z.x) : Math.sign(abs2(sub(z, g.c)) - g.R2); }

// ---------- the tiling ----------
export const ANG = { O: 3, V: 1, W: 1 }; // units of π/5
export const STAR = { O: 4, V: 14, W: 14 };

export function buildTiling(rMax = 0.995) {
  // hyperbolic triangle with angles π/2 (O), π/7 (V), π/7 (W); V at the origin
  const A = Math.PI / 2, B = Math.PI / 7;
  const a = Math.acosh((Math.cos(A) + Math.cos(B) * Math.cos(B)) / (Math.sin(B) * Math.sin(B))); // side VW
  const c = Math.acosh((Math.cos(B) + Math.cos(A) * Math.cos(B)) / (Math.sin(A) * Math.sin(B))); // side OV
  const V0 = C(0, 0), O0 = C(Math.tanh(c / 2), 0), W0 = C(Math.tanh(a / 2) * Math.cos(B), Math.tanh(a / 2) * Math.sin(B));
  const tris = [], vmap = new Map(), verts = [];
  const vkey = (z) => `${Math.round(z.x * 1e6)},${Math.round(z.y * 1e6)}`;
  const vid = (z, type) => {
    const k = vkey(z);
    if (!vmap.has(k)) { vmap.set(k, verts.length); verts.push({ z, type, tris: [] }); }
    return vmap.get(k);
  };
  const tkeys = new Set();
  const add = (P) => {
    const cen = C((P.O.x + P.V.x + P.W.x) / 3, (P.O.y + P.V.y + P.W.y) / 3);
    const k = vkey(cen);
    if (tkeys.has(k) || Math.sqrt(abs2(cen)) > rMax) return -1;
    tkeys.add(k);
    const t = { P, v: { O: vid(P.O, 'O'), V: vid(P.V, 'V'), W: vid(P.W, 'W') }, id: tris.length };
    t.g = { OV: geodesic(P.O, P.V), VW: geodesic(P.V, P.W), WO: geodesic(P.W, P.O) };
    tris.push(t);
    for (const ty of ['O', 'V', 'W']) verts[t.v[ty]].tris.push(t.id);
    return t.id;
  };
  add({ O: O0, V: V0, W: W0 });
  for (let h = 0; h < tris.length; h++) {
    const { P, g } = tris[h];
    add({ O: reflect(g.VW, P.O), V: P.V, W: P.W });
    add({ O: P.O, V: reflect(g.WO, P.V), W: P.W });
    add({ O: P.O, V: P.V, W: reflect(g.OV, P.W) });
  }
  for (const v of verts) v.complete = v.tris.length === STAR[v.type];
  // cyclic order of triangles around each complete vertex (by angle of centroid)
  for (const v of verts) {
    v.tris.sort((s, t) => {
      const cs = centroid(tris[s].P), ct = centroid(tris[t].P);
      return Math.atan2(cs.y - v.z.y, cs.x - v.z.x) - Math.atan2(ct.y - v.z.y, ct.x - v.z.x);
    });
  }
  return { tris, verts };
}
const centroid = (P) => C((P.O.x + P.V.x + P.W.x) / 3, (P.O.y + P.V.y + P.W.y) / 3);

// Ledger (3.1) for a set of triangles. Returns per-vertex data and the totals, in units of π/5.
export function ledger(T, patch) {
  const inP = new Set(patch);
  const vs = new Set(), es = new Set();
  for (const id of inP) {
    const v = T.tris[id].v;
    vs.add(v.O); vs.add(v.V); vs.add(v.W);
    for (const [x, y] of [[v.O, v.V], [v.V, v.W], [v.W, v.O]]) es.add(x < y ? x + ',' + y : y + ',' + x);
  }
  // connectivity through shared vertices
  const ids = [...inP], seen = new Set(ids.length ? [ids[0]] : []), stack = ids.length ? [ids[0]] : [];
  while (stack.length) {
    const id = stack.pop(), v = T.tris[id].v;
    for (const w of [v.O, v.V, v.W]) for (const t2 of T.verts[w].tris) if (inP.has(t2) && !seen.has(t2)) { seen.add(t2); stack.push(t2); }
  }
  const chi = vs.size - es.size + inP.size;
  const per = [];
  let total = 0, interior = 0, interiorSum = 0, corners = 0, cornerSum = 0, bdryLen = 0, complete = true;
  for (const w of vs) {
    const vert = T.verts[w];
    if (!vert.complete) complete = false;
    const around = vert.tris.map((t) => inP.has(t));
    const theta = around.filter(Boolean).length * ANG[vert.type];
    let n = 0;
    if (!around.every(Boolean)) for (let k = 0; k < around.length; k++) if (around[k] && !around[(k + 1) % around.length]) n++;
    const sigma = (2 - n) * 5 - theta;
    per.push({ w, n, theta, sigma });
    total += sigma;
    if (n === 0) { interior++; interiorSum += sigma; } else bdryLen += n;
    if (n === 1 && theta < 5) { corners++; cornerSum += sigma; }
  }
  // boundary length in edges: edges with exactly one incident patch triangle
  let bEdges = 0;
  for (const e of es) {
    const [x, y] = e.split(',').map(Number);
    const shared = T.verts[x].tris.filter((t) => inP.has(t) && T.verts[y].tris.includes(t)).length;
    if (shared === 1) bEdges++;
  }
  return { per, total, chi, connected: seen.size === inP.size, interior, interiorSum, corners, cornerSum, bEdges, complete, t: inP.size, v: vs.size, e: es.size };
}

// ---------- figure ----------

export function mount(root) {
  const row = el('div', { class: 'fig-row' });
  const left = el('div', { class: 'grow' }), right = el('div', { class: 'side' });
  row.append(left, right); root.append(row);

  const T = buildTiling();
  const center = T.verts.findIndex((v) => Math.abs(v.z.x) < 1e-9 && Math.abs(v.z.y) < 1e-9);
  const st = { patch: new Set(), led: null, view: 1 };

  // layers: star of the central V, then everything sharing a vertex, restricted to complete stars
  function ball(k) {
    let cur = new Set(T.verts[center].tris);
    for (let i = 0; i < k; i++) {
      const nxt = new Set(cur);
      for (const id of cur) for (const w of Object.values(T.tris[id].v)) for (const t2 of T.verts[w].tris) nxt.add(t2);
      cur = nxt;
    }
    return [...cur].filter(allowed);
  }
  function allowed(id) { const v = T.tris[id].v; return T.verts[v.O].complete && T.verts[v.V].complete && T.verts[v.W].complete; }

  const presets = {
    one: () => [T.verts[center].tris[0]],
    starV: () => T.verts[center].tris.slice(),
    starO: () => { const o = T.tris[T.verts[center].tris[0]].v.O; return T.verts[o].tris.slice(); },
    ball1: () => ball(1),
    strip: () => {
      // a corridor: walk across edges in a fixed general direction
      const out = [T.verts[center].tris[0]];
      let cur = out[0];
      for (let s = 0; s < 18; s++) {
        const P = T.tris[cur].P, c0 = centroid(P);
        let best = -1, bx = -Infinity;
        for (const w of Object.values(T.tris[cur].v)) for (const t2 of T.verts[w].tris) {
          if (out.includes(t2) || !allowed(t2)) continue;
          const v1 = T.tris[cur].v, v2 = T.tris[t2].v;
          const sharedV = [v1.O, v1.V, v1.W].filter((x) => [v2.O, v2.V, v2.W].includes(x)).length;
          if (sharedV !== 2) continue;
          const c2 = centroid(T.tris[t2].P);
          if (c2.x - c0.x + 0.3 * (c2.y - c0.y) > bx) { bx = c2.x - c0.x + 0.3 * (c2.y - c0.y); best = t2; }
        }
        if (best < 0) break;
        out.push(best); cur = best;
      }
      return out;
    },
  };
  function setPatch(list) { st.patch = new Set(list); st.led = ledger(T, st.patch); cv.redraw(); }

  const cv = makeCanvas(left, { aspect: 1, maxHeight: 560, draw });
  let view = null;

  function draw(ctx, w, h) {
    const P = palette();
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, w, h);
    const S = Math.min(w, h) / 2 - 18, X0 = w / 2, Y0 = h / 2;
    if (!(S > 10)) return;
    const zoom = st.view;
    const sx = (z) => X0 + S * zoom * z.x, sy = (z) => Y0 + S * zoom * z.y;
    view = { X0, Y0, S: S * zoom };
    ctx.save();
    if (zoom === 1) { ctx.strokeStyle = P.rule; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(X0, Y0, S, 0, 2 * Math.PI); ctx.stroke(); }
    const pathSide = (p, q, g) => {
      if (g.line) { ctx.lineTo(sx(q), sy(q)); return; }
      const cx = sx(g.c), cy = sy(g.c), R = Math.sqrt(g.R2) * S * zoom;
      const a0 = Math.atan2(sy(p) - cy, sx(p) - cx), a1 = Math.atan2(sy(q) - cy, sx(q) - cx);
      let d = a1 - a0; while (d > Math.PI) d -= 2 * Math.PI; while (d < -Math.PI) d += 2 * Math.PI;
      ctx.arc(cx, cy, R, a0, a1, d < 0);
    };
    const triPath = (t) => {
      const { O, V, W } = t.P;
      ctx.beginPath(); ctx.moveTo(sx(O), sy(O));
      pathSide(O, V, t.g.OV); pathSide(V, W, t.g.VW); pathSide(W, O, t.g.WO);
      ctx.closePath();
    };
    const fillIn = rgba(P.accent, P.dark ? 0.32 : 0.2);
    for (const t of T.tris) {
      triPath(t);
      if (st.patch.has(t.id)) { ctx.fillStyle = fillIn; ctx.fill(); }
      ctx.strokeStyle = st.patch.has(t.id) ? rgba(P.accent, 0.75) : rgba(P.muted, allowed(t.id) ? 0.35 : 0.15);
      ctx.lineWidth = st.patch.has(t.id) ? 1 : 0.7;
      ctx.stroke();
    }
    // ledger markers
    const L = st.led;
    if (L) {
      ctx.font = '600 10px Inter, system-ui, sans-serif'; ctx.textAlign = 'center';
      for (const p of L.per) {
        const v = T.verts[p.w], x = sx(v.z), y = sy(v.z);
        if (p.n === 0) {
          ctx.fillStyle = P.accent3;
          ctx.beginPath(); ctx.arc(x, y, v.type === 'O' ? 2.6 : 3.4, 0, 2 * Math.PI); ctx.fill();
        } else if (p.sigma > 0) {
          ctx.fillStyle = P.accent2;
          ctx.beginPath(); ctx.arc(x, y, 4.2, 0, 2 * Math.PI); ctx.fill();
          const d = Math.hypot(x - X0, y - Y0) || 1;
          ctx.fillText(`+${p.sigma}`, x + ((x - X0) / d) * 11, y + ((y - Y0) / d) * 11 + 3.5);
        } else {
          ctx.strokeStyle = P.ink; ctx.lineWidth = 1;
          ctx.beginPath(); ctx.arc(x, y, 2.4, 0, 2 * Math.PI); ctx.stroke();
        }
      }
      ctx.textAlign = 'left';
    }
    ctx.restore();
    // legend
    ctx.font = '10.5px Inter, system-ui, sans-serif';
    const items = [[P.accent2, 'corner: summand > 0'], [P.accent3, 'interior: summand ≤ −2π/5']];
    let ly = h - 24;
    ctx.fillStyle = rgba(P.panel, 0.88); ctx.fillRect(4, ly - 13, 168, 32);
    for (const [c, s] of items) { ctx.fillStyle = c; ctx.beginPath(); ctx.arc(12, ly - 3.5, 4, 0, 2 * Math.PI); ctx.fill(); ctx.fillStyle = P.muted; ctx.fillText(s, 21, ly); ly += 14; }
    ctx.fillStyle = P.muted; ctx.fillText('labels in units of π/5', 8, 14);
    updateReadout();
  }

  const ctl = controls(right); ctl.style.marginTop = '0';
  button(ctl, 'one triangle', () => setPatch(presets.one()));
  button(ctl, 'star of O', () => setPatch(presets.starO()));
  button(ctl, 'star of V', () => setPatch(presets.starV()));
  button(ctl, 'ball', () => setPatch(presets.ball1()));
  button(ctl, 'strip', () => setPatch(presets.strip()));
  button(ctl, 'clear', () => setPatch([]));
  const ctl2 = controls(right); ctl2.style.marginTop = '.4rem';
  segmented(ctl2, [[1, 'whole disk'], [1.9, 'zoom']], 1, (k) => { st.view = k; cv.redraw(); });
  const ro = el('div', { class: 'readout', style: 'margin-top:.7rem' });
  right.append(ro);
  right.append(el('div', { class: 'hint' }, 'Click triangles to add or remove them. Corners are labeled by their summand (2 − n)·π − θ.'));

  function updateReadout() {
    const L = st.led;
    if (!L || !L.t) { ro.innerHTML = '<span class="k">Empty diagram. Click triangles or pick a preset.</span>'; return; }
    const mark = (ok) => (ok ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>');
    const disk = L.connected && L.chi === 1;
    const pi5 = (k) => (k === 0 ? '0' : `${k < 0 ? '−' : ''}${Math.abs(k)}π/5`);
    if (!disk) {
      ro.innerHTML = `<table><tr><td class="k">t, e, v</td><td>${L.t}, ${L.e}, ${L.v}</td></tr>
        <tr><td class="k">v − e + t</td><td>${L.chi}</td></tr></table><hr>
        <span class="bad">${L.connected ? 'this diagram has a hole' : 'two separate pieces'}</span>: (3.1) is stated for planar diagrams with no holes.`;
      return;
    }
    ro.innerHTML = `<table>
      <tr><td class="k">triangles, edges, vertices</td><td>${L.t}, ${L.e}, ${L.v}</td></tr>
      <tr><td class="k">v − e + t</td><td>1 ${mark(true)}</td></tr>
      <tr><td class="k">boundary edges</td><td>${L.bEdges}</td></tr>
      </table><hr><table>
      <tr><td>interior vertices</td><td>${L.interior}, total ${pi5(L.interiorSum)}</td></tr>
      <tr><td>corners (θ &lt; π)</td><td>${L.corners}, total ${pi5(L.cornerSum)}</td></tr>
      <tr><td>other boundary vertices</td><td>${pi5(L.total - L.interiorSum - L.cornerSum)}</td></tr>
      <tr><td><b>Σ ((2 − n_y)π − θ_y)</b></td><td><b>${pi5(L.total)}</b> = 2π ${mark(L.total === 10)}</td></tr>
      </table><hr>
      <span class="ok">${L.corners} corner${L.corners === 1 ? '' : 's'}</span>: a boundary with every turn ≥ π is impossible (Prop. 3.3).${L.interior ? ` The corners also pay for the interior excess ${pi5(-L.interiorSum)}.` : ''}`;
  }

  pointer(cv.wrap, {
    down(x, y) {
      if (!view) return false;
      const z = C((x - view.X0) / view.S, (y - view.Y0) / view.S);
      if (abs2(z) >= 1) return false;
      for (const t of T.tris) {
        const { O, V, W } = t.P;
        if (sideOf(t.g.OV, z) === sideOf(t.g.OV, W) && sideOf(t.g.VW, z) === sideOf(t.g.VW, O) && sideOf(t.g.WO, z) === sideOf(t.g.WO, V)) {
          if (!allowed(t.id)) return false;
          if (st.patch.has(t.id)) st.patch.delete(t.id); else st.patch.add(t.id);
          st.led = ledger(T, st.patch); cv.redraw();
          return false;
        }
      }
      return false;
    },
  });

  setPatch(presets.ball1());
  onTheme(() => cv.redraw());
}
