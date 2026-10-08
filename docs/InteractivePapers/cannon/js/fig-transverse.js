// Figure 5 — Lemma 3.8 / Lemma 4.3 on the model W = Re(e^{iθ}/(z-b)), V = Re(e^{iφ}/(z-c)).

import { el, controls, slider, button, makeCanvas, palette, onTheme, pointer, fmt, rgba, ramp } from './common.js';

const RHO = 0.24, EPSC = 0.24, HALF = 2, COMP = 4;

export function mount(root) {
  const row = el('div', { class: 'fig-row' });
  const left = el('div', { class: 'grow' });
  const right = el('div', { class: 'side' });
  row.append(left, right);
  root.append(row);

  const st = {
    b: [-0.7, 0.0], c: [0.6, -1.1], th: 0.0, ph: 2.0,
    P0: [-0.3, 0.25], P1: [0.75, 0.05], n: 40, res: null,
  };

  const W = (x, y) => { const dx = x - st.b[0], dy = y - st.b[1], r2 = dx * dx + dy * dy; return (Math.cos(st.th) * dx + Math.sin(st.th) * dy) / r2; };
  const V = (x, y) => { const dx = x - st.c[0], dy = y - st.c[1], r2 = dx * dx + dy * dy; return (Math.cos(st.ph) * dx + Math.sin(st.ph) * dy) / r2; };
  // Re(e^{iθ}/w) = (cosθ·wx + sinθ·wy)/|w|^2 ; level t circle: center b + e^{iθ}/(2t), radius 1/(2|t|)

  function compute() {
    const res = { arcs: [], I: null, b0: 0, mid: 0, EW: 0, EV: 0, cells: null };
    const w0 = W(...st.P0), w1 = W(...st.P1);
    let lo = Math.min(w0, w1), hi = Math.max(w0, w1);
    // exclude W-range on B(c, eps_c) (if the punctures are apart)
    const pieces = [[lo, hi]];
    const dbc = Math.hypot(st.b[0] - st.c[0], st.b[1] - st.c[1]);
    if (dbc > RHO + EPSC + 0.05) {
      let mn = Infinity, mx = -Infinity;
      for (let k = 0; k < 64; k++) {
        const a = 2 * Math.PI * k / 64, v = W(st.c[0] + EPSC * 1.15 * Math.cos(a), st.c[1] + EPSC * 1.15 * Math.sin(a));
        mn = Math.min(mn, v); mx = Math.max(mx, v);
      }
      pieces.length = 0;
      if (mn > lo) pieces.push([lo, Math.min(hi, mn)]);
      if (mx < hi) pieces.push([Math.max(lo, mx), hi]);
    }
    let best = null;
    for (const p of pieces) if (p[1] - p[0] > 1e-6 && (!best || p[1] - p[0] > best[1] - best[0])) best = p;
    if (!best) { res.I = null; return res; }
    const len = best[1] - best[0];
    res.I = [best[0] + 0.08 * len, best[1] - 0.08 * len];

    // level arcs: from first hit on P, along the shorter arc of the circle, stopped at |z-b| = RHO
    const arcFor = (t) => {
      if (Math.abs(t) < 1e-9) return null;
      const mx = st.b[0] + Math.cos(st.th) / (2 * t), my = st.b[1] + Math.sin(st.th) / (2 * t), R = 1 / (2 * Math.abs(t));
      // intersect segment P0 + u (P1-P0) with circle
      const dx = st.P1[0] - st.P0[0], dy = st.P1[1] - st.P0[1];
      const fx = st.P0[0] - mx, fy = st.P0[1] - my;
      const A = dx * dx + dy * dy, B = 2 * (fx * dx + fy * dy), Cc = fx * fx + fy * fy - R * R;
      const disc = B * B - 4 * A * Cc;
      if (disc < 0) return null;
      const us = [(-B - Math.sqrt(disc)) / (2 * A), (-B + Math.sqrt(disc)) / (2 * A)].filter((u) => u >= 0 && u <= 1);
      if (!us.length) return null;
      const qx = st.P0[0] + us[0] * dx, qy = st.P0[1] + us[0] * dy;
      const aq = Math.atan2(qy - my, qx - mx), ab = Math.atan2(st.b[1] - my, st.b[0] - mx);
      let dA = ab - aq; while (dA > Math.PI) dA -= 2 * Math.PI; while (dA < -Math.PI) dA += 2 * Math.PI;
      const pts = [];
      const steps = Math.max(40, Math.ceil(Math.abs(dA) * R / 0.01));
      for (let k = 0; k <= steps; k++) {
        const a = aq + dA * k / steps, x = mx + R * Math.cos(a), y = my + R * Math.sin(a);
        if (Math.hypot(x - st.b[0], y - st.b[1]) <= RHO) { pts.push([x, y]); break; }
        pts.push([x, y]);
      }
      return { t, pts };
    };
    const NT = 181;
    const h = HALF * 2 / st.n, N = Math.round(2 * COMP / h);
    const mark = new Uint8Array(N * N);
    const cellOf = (x, y) => { const i = Math.floor((x + COMP) / h), j = Math.floor((y + COMP) / h); return i >= 0 && i < N && j >= 0 && j < N ? j * N + i : -1; };
    let b0 = Infinity;
    for (let k = 0; k < NT; k++) {
      const t = res.I[0] + (res.I[1] - res.I[0]) * k / (NT - 1);
      const arc = arcFor(t);
      if (!arc) { b0 = 0; continue; }
      let mn = Infinity, mx = -Infinity;
      for (let m = 0; m < arc.pts.length; m++) {
        const [x, y] = arc.pts[m];
        const v = V(x, y); mn = Math.min(mn, v); mx = Math.max(mx, v);
        // mark cells along the arc (dense enough sampling)
        if (m) {
          const [px, py] = arc.pts[m - 1], seg = Math.hypot(x - px, y - py), sub = Math.ceil(seg / (h / 3));
          for (let s2 = 0; s2 <= sub; s2++) { const cI = cellOf(px + (x - px) * s2 / sub, py + (y - py) * s2 / sub); if (cI >= 0) mark[cI] = 1; }
        }
      }
      b0 = Math.min(b0, mx - mn);
      if (k % 20 === 0) res.arcs.push(arc);
    }
    res.b0 = Number.isFinite(b0) ? b0 : 0;
    // finite-cell sums over the cells meeting K = union of arcs (closed cells sampled on their boundary)
    const oscCell = (F, i, j) => {
      const x0 = -COMP + i * h, y0 = -COMP + j * h;
      let mn = Infinity, mx = -Infinity;
      const S = 6;
      for (let k = 0; k <= S; k++) {
        const u = k / S;
        for (const [x, y] of [[x0 + u * h, y0], [x0 + u * h, y0 + h], [x0, y0 + u * h], [x0 + h, y0 + u * h]]) {
          const v = F(x, y); if (v < mn) mn = v; if (v > mx) mx = v;
        }
      }
      return mx - mn;
    };
    let mid = 0, EW = 0, EV = 0, count = 0;
    for (let j = 0; j < N; j++) for (let i = 0; i < N; i++) {
      if (!mark[j * N + i]) continue;
      const ow = oscCell(W, i, j), ov = oscCell(V, i, j);
      mid += ow * ov; EW += ow * ow; EV += ov * ov; count++;
    }
    Object.assign(res, { mid, EW, EV, count, mark, N, h });
    return res;
  }

  const cv = makeCanvas(left, { aspect: 1, maxHeight: 560, draw });
  let tf = null;

  function draw(ctx, w, hgt) {
    const P = palette();
    st.res = compute();
    const res = st.res;
    const S = Math.min(w, hgt) / (2 * HALF), ox = w / 2, oy = hgt / 2;
    tf = { S, ox, oy };
    const X = (x) => ox + x * S, Y = (y) => oy - y * S;
    ctx.fillStyle = P.bg; ctx.fillRect(0, 0, w, hgt);
    ctx.save(); ctx.beginPath(); ctx.rect(0, 0, w, hgt); ctx.clip();
    // cells meeting K
    if (res.mark) {
      ctx.fillStyle = rgba(P.accent4, P.dark ? 0.16 : 0.10);
      for (let j = 0; j < res.N; j++) for (let i = 0; i < res.N; i++) if (res.mark[j * res.N + i]) {
        const x0 = -COMP + i * res.h, y0 = -COMP + j * res.h;
        ctx.fillRect(X(x0), Y(y0 + res.h), res.h * S, res.h * S);
      }
      if (st.n <= 56) {
        ctx.strokeStyle = rgba(P.ink, 0.05); ctx.lineWidth = 1; ctx.beginPath();
        for (let k = -HALF; k <= HALF + 1e-9; k += res.h) { ctx.moveTo(X(k), 0); ctx.lineTo(X(k), hgt); ctx.moveTo(0, Y(k)); ctx.lineTo(w, Y(k)); }
        ctx.stroke();
      }
    }
    // level circles
    const levels = [-6, -3, -2, -1.4, -1, -0.7, -0.45, -0.25, 0.25, 0.45, 0.7, 1, 1.4, 2, 3, 6];
    const circles = (pc, ang, color) => {
      ctx.strokeStyle = color; ctx.lineWidth = 1;
      for (const t of levels) {
        const cx = pc[0] + Math.cos(ang) / (2 * t), cy = pc[1] + Math.sin(ang) / (2 * t), R = 1 / (2 * Math.abs(t));
        ctx.beginPath(); ctx.arc(X(cx), Y(cy), R * S, 0, 7); ctx.stroke();
      }
      // t = 0 line through the puncture, perpendicular to e^{i ang}
      const dx = -Math.sin(ang), dy = Math.cos(ang);
      ctx.beginPath(); ctx.moveTo(X(pc[0] - 9 * dx), Y(pc[1] - 9 * dy)); ctx.lineTo(X(pc[0] + 9 * dx), Y(pc[1] + 9 * dy)); ctx.stroke();
    };
    circles(st.b, st.th, rgba(P.accent, 0.45));
    circles(st.c, st.ph, rgba(P.accent2, 0.42));
    // stop circles
    ctx.setLineDash([3, 3]); ctx.lineWidth = 1.2;
    ctx.strokeStyle = P.accent; ctx.beginPath(); ctx.arc(X(st.b[0]), Y(st.b[1]), RHO * S, 0, 7); ctx.stroke();
    ctx.strokeStyle = P.accent2; ctx.beginPath(); ctx.arc(X(st.c[0]), Y(st.c[1]), EPSC * S, 0, 7); ctx.stroke();
    ctx.setLineDash([]);
    // level arcs D_t, colored by V
    let vmin = Infinity, vmax = -Infinity;
    for (const a of res.arcs) for (const [x, y] of a.pts) { const v = V(x, y); vmin = Math.min(vmin, v); vmax = Math.max(vmax, v); }
    const stops = P.dark ? ['#7ea4ff', '#e7e5df', '#ff8b5e'] : ['#2f5fd0', '#d9d4c9', '#cf5427'];
    ctx.lineWidth = 3.2; ctx.lineCap = 'round';
    for (const a of res.arcs) {
      for (let m = 1; m < a.pts.length; m++) {
        const [x0, y0] = a.pts[m - 1], [x1, y1] = a.pts[m];
        const v = V((x0 + x1) / 2, (y0 + y1) / 2);
        ctx.strokeStyle = ramp(stops, vmax > vmin ? (v - vmin) / (vmax - vmin) : 0.5);
        ctx.beginPath(); ctx.moveTo(X(x0), Y(y0)); ctx.lineTo(X(x1), Y(y1)); ctx.stroke();
      }
    }
    // variation path P
    ctx.strokeStyle = P.ink; ctx.lineWidth = 4;
    ctx.beginPath(); ctx.moveTo(X(st.P0[0]), Y(st.P0[1])); ctx.lineTo(X(st.P1[0]), Y(st.P1[1])); ctx.stroke();
    ctx.restore();
    // handles
    const handle = (p, color, label) => {
      ctx.fillStyle = color; ctx.strokeStyle = P.panel; ctx.lineWidth = 2;
      ctx.beginPath(); ctx.arc(X(p[0]), Y(p[1]), 7, 0, 7); ctx.fill(); ctx.stroke();
      ctx.font = '600 12px Inter, system-ui, sans-serif'; ctx.fillStyle = P.ink;
      ctx.fillText(label, X(p[0]) + 9, Y(p[1]) - 8);
    };
    handle(st.b, P.accent, 'b'); handle(st.c, P.accent2, 'c = gb');
    handle(st.P0, P.ink, 'P'); handle(st.P1, P.ink, '');
    updateReadout();
  }

  const ctl = controls(right);
  ctl.style.marginTop = '0';
  slider(ctl, { label: 'mesh n', min: 10, max: 96, step: 2, value: st.n, fmt: (v) => v, oninput: (v) => { st.n = v; cv.redraw(); } });
  const thS = slider(ctl, { label: 'angle θ (W)', min: -3.14, max: 3.14, step: 0.01, value: st.th, fmt: (v) => v.toFixed(2), oninput: (v) => { st.th = v; cv.redraw(); } });
  const phS = slider(ctl, { label: 'angle φ (V)', min: -3.14, max: 3.14, step: 0.01, value: st.ph, fmt: (v) => v.toFixed(2), oninput: (v) => { st.ph = v; cv.redraw(); } });
  const ctl2 = controls(right);
  button(ctl2, 'Put c on b, φ = θ', () => { st.c = st.b.slice(); st.ph = st.th; phS.set(st.ph); cv.redraw(); });
  button(ctl2, 'Reset', () => { st.b = [-0.7, 0.0]; st.c = [0.6, -1.1]; st.th = 0; thS.set(0); st.ph = 2.0; phS.set(2.0); st.P0 = [-0.3, 0.25]; st.P1 = [0.75, 0.05]; cv.redraw(); });
  const ro = el('div', { class: 'readout', style: 'margin-top:.7rem' });
  right.append(ro);
  right.append(el('div', { class: 'hint' }, 'Drag b, c and the ends of P. The shaded cells are those meeting K, the union of the level arcs.'));

  function updateReadout() {
    const r = st.res;
    if (!r || !r.I) { ro.innerHTML = 'Move P so that W varies along it.'; return; }
    const lhs = r.b0 * (r.I[1] - r.I[0]), rhs = Math.sqrt(r.EW * r.EV);
    const mx = Math.max(lhs, r.mid, rhs, 1e-9);
    const bar = (label, v, color) => `<div class="bar-row"><span class="k">${label}</span><span class="track"><span class="fill" style="display:block;width:${(100 * v / mx).toFixed(1)}%;background:${color}"></span></span><span>${fmt.g(v, 3)}</span></div>`;
    ro.innerHTML = `<table>
        <tr><td class="k">interval I of W-levels</td><td>[${r.I[0].toFixed(2)}, ${r.I[1].toFixed(2)}]</td></tr>
        <tr><td class="k">b₀ = min osc of V along D<sub>t</sub></td><td>${fmt.g(r.b0, 3)}</td></tr>
        <tr><td class="k">E(W), E(V) on K</td><td>${fmt.g(r.EW, 3)}, ${fmt.g(r.EV, 3)}</td></tr>
        <tr><td class="k">cells meeting K</td><td>${r.count}</td></tr>
      </table>
      <div class="bars">
        ${bar('b₀·|I|', lhs, 'var(--accent-3)')}
        ${bar('Σ osc W · osc V', r.mid, 'var(--accent-4)')}
        ${bar('√(E(W)·E(V))', rhs, 'var(--accent)')}
      </div>
      <div class="k" style="margin-top:.35rem">(3.7) says green ≤ violet ≤ blue at every mesh. ${lhs <= r.mid * 1.02 ? '<span class="ok">holds</span>' : '<span class="bad">sampling error</span>'}</div>`;
  }

  let drag = null;
  const toW = (x, y) => [(x - tf.ox) / tf.S, -(y - tf.oy) / tf.S];
  pointer(cv.wrap, {
    down(x, y) {
      if (!tf) return false;
      const p = toW(x, y);
      const cand = [['P0', st.P0], ['P1', st.P1], ['c', st.c], ['b', st.b]];
      for (const [k, q] of cand) if (Math.hypot(q[0] - p[0], q[1] - p[1]) * tf.S < 14) { drag = k; return true; }
      return false;
    },
    move(x, y) {
      const p = toW(x, y).map((v) => Math.max(-HALF + 0.05, Math.min(HALF - 0.05, v)));
      st[drag] = p; cv.redraw();
    },
    up() { drag = null; },
  });
  onTheme(() => cv.redraw());
}
