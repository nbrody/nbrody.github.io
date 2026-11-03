// Figure 1 — the p+1 generators. Two views:
//   · quaternions: the four-square solutions drawn at (a1, a2, a3), with their matrices (2.1) mod q;
//   · Severi–Brauer: after splitting H ⊗ F_p ≅ M_2(F_p) (i ↦ j, j² = −1 mod p), each generator is a rank-one
//     matrix, whose kernel is a point of the Severi–Brauer variety, now P¹(F_p). The p+1 generators land on
//     the p+1 points, one each, and conjugation swaps kernel and image.
import { el, makeCanvas, labelLayer, setTex, chips, segmented, pointer, palette, onTheme, rgba } from './common.js';
import { generators, inverseIndex, quatToMatrix, sqrtMinusOne, legendre, jacobiR4, allFourSquares, modpow, geodesicArc } from './lps.js';

export const P_CHOICES = [5, 13, 17, 29, 37, 41, 53];
export const Q_CHOICES = [5, 13, 17, 29, 37, 41];

// ───────────────────────── pure math (node-testable) ─────────────────────────

const mulMod = (m, n, q) => [
  (m[0] * n[0] + m[1] * n[2]) % q, (m[0] * n[1] + m[1] * n[3]) % q,
  (m[2] * n[0] + m[3] * n[2]) % q, (m[2] * n[1] + m[3] * n[3]) % q,
];
const detMod = (m, q) => (((m[0] * m[3] - m[1] * m[2]) % q) + q) % q;

/** Projective class of a 2×2 matrix mod q (first nonzero entry scaled to 1), as a string key. */
export function projClass(m, q) {
  const s = m.find((x) => x % q !== 0);
  const t = modpow(s, q - 2, q);
  return m.map((x) => (x * t) % q).join(',');
}

/** Everything Figure 1 shows and checks for a pair (p, q). */
export function generatorData(p, q) {
  const S = generators(p), inv = inverseIndex(S), i = sqrtMinusOne(q);
  const mats = S.map((a) => quatToMatrix(a, q, i));
  const leg = legendre(p, q);
  const dets = mats.map((m) => detMod(m, q));
  const detOk = dets.every((d) => d === p % q);
  const prods = mats.map((m, s) => mulMod(m, mats[inv[s]], q));
  const invOk = prods.every((r) => r[1] === 0 && r[2] === 0 && r[0] === r[3] && r[0] === p % q);
  const classes = new Set(mats.map((m) => projClass(m, q)));
  const identity = projClass([1, 0, 0, 1], q);
  const loops = mats.filter((m) => projClass(m, q) === identity).length;
  const pairsAntipodal = S.every((a, s) => {
    const b = S[inv[s]];
    return b[0] === a[0] && b[1] === -a[1] && b[2] === -a[2] && b[3] === -a[3];
  });
  return {
    p, q, i, S, inv, mats, leg, dets, detOk, invOk, pairsAntipodal,
    count: S.length, sols: allFourSquares(p).length, r4: jacobiR4(p),
    distinct: classes.size, loops,
    n: leg === -1 ? q * (q * q - 1) : (q * (q * q - 1)) / 2,
  };
}

/** The two square roots of −1 mod p (p ≡ 1 mod 4), smaller first. */
export function sqrtsMinusOne(p) {
  const out = [];
  for (let x = 1; x < p; x++) if ((x * x + 1) % p === 0) out.push(x);
  return out;
}

/**
 * The Severi–Brauer view at p. With the splitting i ↦ j, the generators become 2×2 matrices mod p of
 * determinant N(α) = p ≡ 0, hence rank one; ker α̃ is a point of P¹(F_p) (points 0..p−1, ∞ = p).
 * Checks: rank one; α ↦ ker α̃ is a bijection S → P¹(F_p); ker of the conjugate is the image; no pair collapses.
 */
export function severiBrauer(p, j) {
  const S = generators(p), inv = inverseIndex(S);
  const mod = (x) => ((x % p) + p) % p;
  const mats = S.map((a) => [a[0] + j * a[1], a[2] + j * a[3], -a[2] + j * a[3], a[0] - j * a[1]].map(mod));
  const pt = (x, y) => { x = mod(x); y = mod(y); return y === 0 ? p : (x * modpow(y, p - 2, p)) % p; };
  const ker = mats.map(([a, b, c, d]) => (a || b ? pt(-b, a) : pt(-d, c)));
  const img = mats.map(([a, b, c, d]) => (a || c ? pt(a, c) : pt(b, d)));
  const rank1 = mats.every((m) => mod(m[0] * m[3] - m[1] * m[2]) === 0 && m.some((x) => x));
  const at = new Array(p + 1).fill(-1);
  ker.forEach((z, s) => { at[z] = s; });
  return {
    p, j, mats, ker, img, at, rank1,
    bijection: new Set(ker).size === p + 1,
    swap: S.every((_, s) => ker[inv[s]] === img[s]),
    noFix: S.every((_, s) => ker[s] !== ker[inv[s]]),
  };
}

/** a0 + a1 i + a2 j + a3 k as TeX. */
export function quatTex(a) {
  const units = ['', '\\mathbf{i}', '\\mathbf{j}', '\\mathbf{k}'];
  let s = '';
  for (let t = 0; t < 4; t++) {
    const c = a[t];
    if (c === 0) continue;
    const abs = Math.abs(c), mag = t > 0 && abs === 1 ? '' : String(abs);
    if (!s) s = (c < 0 ? '-' : '') + mag + units[t];
    else s += (c < 0 ? ' - ' : ' + ') + mag + units[t];
  }
  return s || '0';
}

export const genTex = (s) => (s % 2 ? `\\bar\\alpha_{${(s >> 1) + 1}}` : `\\alpha_{${(s >> 1) + 1}}`);
const tildeTex = (s) => `\\tilde${genTex(s).replace('\\bar\\alpha', '{\\bar\\alpha}')}`;
const pmatrix = (m) => `\\begin{pmatrix}${m[0]} & ${m[1]}\\\\ ${m[2]} & ${m[3]}\\end{pmatrix}`;
const pointTex = (z, p) => (z === p ? '\\infty' : String(z));
const lineTex = (z, p) => (z === p ? '(1:0)' : `(${z}:1)`);

// ───────────────────────── figure ─────────────────────────

export function mount(root) {
  const st = {
    view: '3d', p: 13, q: 17, split: 0, data: null, sb: null,
    yaw: 0.65, pitch: -0.42, auto: true,
    sel: 0, hover: -1, proj: [], sbPts: [],
    drag: null,
  };
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (reduce) st.auto = false;

  const top = el('div', { class: 'controls inline', style: 'margin-bottom:0.6rem' });
  root.append(top);
  segmented(top, [['3d', 'Quaternions $(a_1,a_2,a_3)$'], ['sb', 'Severi–Brauer, split at $p$']], st.view, (v) => {
    st.view = v; st.hover = -1; splitRow.hidden = v !== 'sb'; setHint(); renderChecks(); renderDetail(); cv.redraw();
    if (v === '3d' && st.auto) requestAnimationFrame(tick);
  });
  const splitRow = el('div', { hidden: '' });
  top.append(splitRow);
  let splitChips = null;

  const row = el('div', { class: 'fig-row' });
  const left = el('div', { class: 'grow' });
  const right = el('div', { class: 'side' });
  row.append(left, right);
  root.append(row);

  const hintEl = el('p', { class: 'panel-hint' });
  left.append(hintEl);
  const cv = makeCanvas(left, { aspect: (w) => (w < 480 ? 1 : 0.86), maxHeight: 460, draw });
  const labels = labelLayer(cv.wrap);

  // controls
  const pChips = chips(right, {
    label: 'The prime $p$ (degree $p+1$)',
    options: P_CHOICES.map((p) => [p, `$${p}$`]),
    value: st.p,
    onchange: (p) => { st.p = p; st.split = 0; if (st.q === p) st.q = Q_CHOICES.find((q) => q !== p); qChips.set(st.q); refresh(); },
  });
  const qChips = chips(right, {
    label: 'The prime $q$ (reduce mod $q$)',
    options: Q_CHOICES.map((q) => [q, `$${q}$`]),
    value: st.q,
    onchange: (q) => { if (q === st.p) { qChips.set(st.q); return; } st.q = q; refresh(); },
  });
  pChips.el.style.marginBottom = '0.6rem';
  qChips.el.style.marginBottom = '0.7rem';
  const detail = el('div', { class: 'readout', style: 'margin-bottom:0.6rem' });
  const checks = el('div', { class: 'readout' });
  right.append(detail, checks);

  function setHint() {
    setTex(hintEl, st.view === '3d'
      ? 'Drag to turn · hover or click a dot'
      : `The $${st.p + 1}$ points of $\\PP^1(\\F_{${st.p}})$, each labelled by the generator whose kernel it is · hover or click a point`);
  }

  function buildSplitChips() {
    const roots = sqrtsMinusOne(st.p);
    const opts = roots.map((j, k) => [k, `$\\mathbf i\\mapsto ${j}$`]);
    if (!splitChips) {
      splitChips = chips(splitRow, { label: `splitting $H\\otimes\\F_p\\cong M_2(\\F_p)$`, options: opts, value: st.split,
        onchange: (k) => { st.split = k; st.sb = severiBrauer(st.p, sqrtsMinusOne(st.p)[k]); renderChecks(); renderDetail(); cv.redraw(); } });
      splitChips.el.style.flexDirection = 'row';
      splitChips.el.style.alignItems = 'center';
      splitChips.el.style.gap = '0.5rem';
    } else splitChips.rebuild(opts, st.split);
  }

  function refresh() {
    st.data = generatorData(st.p, st.q);
    st.sb = severiBrauer(st.p, sqrtsMinusOne(st.p)[st.split]);
    st.sel = Math.min(st.sel, st.data.count - 1);
    st.hover = -1;
    buildSplitChips();
    setHint();
    renderChecks();
    renderDetail();
    cv.redraw();
  }

  function renderChecks() {
    const d = st.data;
    const ok = (b) => (b ? '<span class="ok">✓</span>' : '<span class="bad">✗</span>');
    if (st.view === 'sb') {
      const sb = st.sb;
      setTex(checks, `<table>
        <tr><td>$\\det\\tilde\\alpha = N(\\alpha) = ${d.p}\\equiv 0$: rank one</td><td class="num">all $${d.count}$</td><td>${ok(sb.rank1)}</td></tr>
        <tr><td>$\\alpha\\mapsto\\ker\\tilde\\alpha$ is a bijection $S\\to\\PP^1(\\F_{${d.p}})$</td><td class="num">$${new Set(sb.ker).size}$ points</td><td>${ok(sb.bijection)}</td></tr>
        <tr><td>$\\ker\\tilde{\\bar\\alpha} = \\operatorname{im}\\tilde\\alpha$</td><td class="num">all $${d.count}$</td><td>${ok(sb.swap)}</td></tr>
        <tr><td>no conjugate pair shares a point</td><td class="num">$${d.count / 2}$ pairs</td><td>${ok(sb.noFix)}</td></tr>
        <tr class="sep"><td colspan="3" class="dim">$H$ is ramified only at $2$ and $\\infty$, so it splits at $p$: $j^2\\equiv-1\\pmod{${d.p}}$ exists because $p\\equiv1\\pmod 4$. Its Severi–Brauer variety, the conic $x^2+y^2+z^2=0$, has no rational points but becomes $\\PP^1(\\F_{${d.p}})$ here. Those $${d.p + 1}$ points are the neighbours of a vertex of the Bruhat–Tits tree.</td></tr>
      </table>`);
      return;
    }
    const group = d.leg === 1 ? '\\PSL_2(\\F_{' + d.q + '})' : '\\PGL_2(\\F_{' + d.q + '})';
    const rows = [
      [`$|S| = p+1 = ${d.p + 1}$`, `$${d.count}$`, ok(d.count === d.p + 1)],
      [`Jacobi: $r_4(${d.p})/8$`, `$${d.r4 / 8}$`, ok(d.r4 / 8 === d.count && d.sols === d.r4)],
      [`conjugates antipodal`, `$${d.count / 2}$ pairs`, ok(d.pairsAntipodal)],
      [`$\\det\\tilde\\alpha\\equiv ${d.p}\\ (${d.q})$`, `all $${d.count}$`, ok(d.detOk)],
      [`$\\tilde\\alpha\\,\\tilde{\\bar\\alpha} = ${d.p % d.q}\\,I$`, `all $${d.count}$`, ok(d.invOk)],
    ];
    const distinct = d.distinct === d.count
      ? `<tr><td colspan="2">distinct in $\\PGL_2$</td><td class="num">$${d.distinct}$</td></tr>`
      : `<tr><td colspan="2" class="dim">only $${d.distinct}$ distinct mod $${d.q}$${d.loops ? `, $${d.loops}$ trivial` : ''}: repeated edges${d.loops ? ' and loops' : ''}</td><td></td></tr>`;
    setTex(checks, `<table>
      ${rows.map((r) => `<tr><td>${r[0]}</td><td class="num">${r[1]}</td><td>${r[2]}</td></tr>`).join('')}
      ${distinct}
      <tr class="sep"><td colspan="3">$\\leg{${d.p}}{${d.q}} = ${d.leg}$, so ${d.leg === 1
        ? `every $\\det\\tilde\\alpha$ is a square: all generators lie in $\\PSL_2$`
        : `$\\det\\tilde\\alpha$ is not a square: the generators lie outside $\\PSL_2$`}.
        $X^{${d.p},${d.q}}$ is the Cayley graph of $${group}$, $n = ${d.n.toLocaleString('en-US').replace(/,/g, '{,}')}$.</td></tr>
    </table>`);
  }

  function renderDetail() {
    const d = st.data, s = st.hover >= 0 ? st.hover : st.sel;
    const a = d.S[s], c = d.inv[s];
    if (st.view === 'sb') {
      const sb = st.sb, m = sb.mats[s];
      setTex(detail, `<div>$${genTex(s)} = ${quatTex(a)}$, &nbsp;$N = ${d.p}$</div>
        <div class="dim" style="margin:0.25rem 0">mod $${d.p}$, with $\\mathbf i\\mapsto j = ${sb.j}$:</div>
        <div>$$${tildeTex(s)} \\equiv ${pmatrix(m)},\\quad \\det \\equiv 0$$</div>
        <div>$\\ker${tildeTex(s)} = ${lineTex(sb.ker[s], d.p)}$, the point $${pointTex(sb.ker[s], d.p)}$</div>
        <div class="dim">$\\operatorname{im}${tildeTex(s)} = ${lineTex(sb.img[s], d.p)}$, which is $\\ker${tildeTex(c)}$: the point of $${genTex(c)}$.</div>`);
      return;
    }
    const m = d.mats[s];
    setTex(detail, `<div>$${genTex(s)} = ${quatTex(a)}$, &nbsp;$N = ${d.p}$</div>
      <div class="dim" style="margin:0.25rem 0">mod $${d.q}$, with $i = ${d.i}$, $i^2\\equiv -1$:</div>
      <div>$$${tildeTex(s)} = ${pmatrix(m)},\\quad \\det \\equiv ${d.dets[s]}$$</div>
      <div class="dim">its conjugate $${genTex(c)}$ is the opposite dot; $${tildeTex(s)}\\,${tildeTex(c)} = ${d.p % d.q}\\,I$.</div>`);
  }

  // ── 3D projection ──
  function project(w, h) {
    const d = st.data, R = 0.4 * Math.min(w, h * 1.05), cx = w / 2, cy = h / 2;
    const cy_ = Math.cos(st.yaw), sy = Math.sin(st.yaw), cp = Math.cos(st.pitch), sp = Math.sin(st.pitch);
    const rt = Math.sqrt(d.p);
    const P = (x, y, z) => { // x = a1, y = a3 (up), z = a2
      const x1 = x * cy_ + z * sy, z1 = -x * sy + z * cy_;
      const y2 = y * cp - z1 * sp, z2 = y * sp + z1 * cp;
      return [cx + R * x1, cy - R * y2, z2];
    };
    st.proj = d.S.map((a) => P(a[1] / rt, a[3] / rt, a[2] / rt));
    return { P, R, cx, cy };
  }

  function draw(ctx, w, h) {
    if (!st.data) return;
    if (st.view === 'sb') { drawSB(ctx, w, h); return; }
    const C = palette(), d = st.data;
    const { P, R } = project(w, h);
    const lab = [];
    const axes = [[[1.18, 0, 0], 'a_1'], [[0, 0, 1.18], 'a_2'], [[0, 1.18, 0], 'a_3']];
    ctx.lineWidth = 1;
    for (const [[x, y, z], name] of axes) {
      const [x0, y0] = P(-x, -y, -z), [x1, y1] = P(x, y, z);
      ctx.strokeStyle = C.grid;
      ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
      lab.push({ id: 'ax' + name, x: x1, y: y1, tex: name, anchor: 'c', cls: 'small halo' });
    }
    const [ox, oy] = P(0, 0, 0);
    ctx.fillStyle = C.muted;
    ctx.beginPath(); ctx.arc(ox, oy, 2, 0, 7); ctx.fill();

    // conjugate pairs joined through the origin
    const focus = st.hover >= 0 ? st.hover : st.sel;
    const focusPair = focus >> 1;
    for (let s = 0; s < d.count; s += 2) {
      const a = st.proj[s], b = st.proj[s + 1];
      const on = (s >> 1) === focusPair;
      ctx.strokeStyle = on ? C.count : rgba(C.count, 0.28);
      ctx.lineWidth = on ? 2 : 1;
      ctx.setLineDash(on ? [] : [3, 4]);
      ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke();
    }
    ctx.setLineDash([]);

    // dots, back to front
    const order = d.S.map((_, s) => s).sort((u, v) => st.proj[u][2] - st.proj[v][2]);
    const rt = Math.sqrt(d.p);
    for (const s of order) {
      const [x, y, z] = st.proj[s];
      const a0 = d.S[s][0];
      const r = (2.6 + 5.2 * (a0 / rt)) * (1 + 0.16 * z) * Math.max(0.55, Math.min(1, R / 170));
      const alpha = 0.5 + 0.5 * (z + 1) / 2;
      ctx.fillStyle = rgba(C.count, alpha);
      ctx.beginPath(); ctx.arc(x, y, r, 0, 7); ctx.fill();
      if (s === focus || s === d.inv[focus]) {
        ctx.strokeStyle = s === focus ? C.graph : rgba(C.graph, 0.6);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(x, y, r + 3, 0, 7); ctx.stroke();
        lab.push({ id: 'g' + s, x: x + r + 3, y: y - r - 1, tex: genTex(s), anchor: 'ne', cls: 'halo' });
      }
    }
    labels.set(lab);
  }

  // ── Severi–Brauer view: P¹(F_p) on a circle, conjugate pairs joined by Poincaré-disk geodesics ──
  function sbLayout(w, h) {
    const n = st.data.p + 1, cx = w / 2, cy = h / 2, r = Math.max(8, Math.min(w, h) / 2 - 40);
    const pos = (z) => {
      const a = -Math.PI / 2 + (2 * Math.PI * z) / n;
      return { x: cx + r * Math.cos(a), y: cy + r * Math.sin(a), ux: Math.cos(a), uy: Math.sin(a), ang: a };
    };
    return { cx, cy, r, n, pos };
  }

  function drawSB(ctx, w, h) {
    const C = palette(), d = st.data, sb = st.sb;
    const { cx, cy, r, n, pos } = sbLayout(w, h);
    st.sbPts = d.S.map((_, s) => pos(sb.ker[s]));
    const focus = st.hover >= 0 ? st.hover : st.sel;
    const lab = [];

    const geodesic = (A, B) => {
      const G = geodesicArc(A.ang, B.ang);
      ctx.beginPath();
      ctx.moveTo(A.x, A.y);
      if (G.line) ctx.lineTo(B.x, B.y);
      else {
        const Cx = cx + r * G.cx, Cy = cy + r * G.cy, rho = Math.max(0, r * G.rho);
        const s1 = Math.atan2(A.y - Cy, A.x - Cx), s2 = Math.atan2(B.y - Cy, B.x - Cx);
        let sw = s2 - s1;
        while (sw > Math.PI) sw -= 2 * Math.PI;
        while (sw <= -Math.PI) sw += 2 * Math.PI;
        ctx.arc(Cx, Cy, rho, s1, s1 + sw, sw < 0);
      }
      ctx.stroke();
    };
    for (let s = 0; s < d.count; s += 2) {
      const on = (s >> 1) === (focus >> 1);
      ctx.strokeStyle = on ? C.count : rgba(C.count, 0.35);
      ctx.lineWidth = on ? 2.2 : 1.2;
      geodesic(st.sbPts[s], st.sbPts[s + 1]);
    }

    const rad = n <= 30 ? 4.6 : 3.6;
    const showAllGen = n <= 30, coordStep = n <= 42 ? 1 : Math.ceil(n / 14);
    for (let z = 0; z < n; z++) {
      const P = pos(z), s = sb.at[z];
      const on = s === focus, partner = s === d.inv[focus];
      ctx.fillStyle = C.count;
      ctx.beginPath(); ctx.arc(P.x, P.y, on ? rad + 1.5 : rad, 0, 7); ctx.fill();
      if (on || partner) {
        ctx.strokeStyle = on ? C.graph : rgba(C.graph, 0.6);
        ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(P.x, P.y, rad + 4, 0, 7); ctx.stroke();
      }
      if (z % coordStep === 0 || z === n - 1 || on || partner) {
        lab.push({ id: 'z' + z, x: cx + (r + 18) * P.ux, y: cy + (r + 18) * P.uy, tex: pointTex(z, d.p), anchor: 'c', cls: on || partner ? '' : 'small' });
      }
      if (showAllGen || on || partner) {
        lab.push({ id: 'g' + z, x: cx + (r - 19) * P.ux, y: cy + (r - 19) * P.uy, tex: genTex(s), anchor: 'c', cls: on || partner ? 'halo' : 'small halo', color: on || partner ? undefined : C.muted });
      }
    }
    labels.set(lab);
  }

  // ── interaction ──
  function nearest(x, y) {
    const pts = st.view === 'sb' ? st.sbPts.map((P) => [P.x, P.y]) : st.proj;
    let best = -1, bd = 16 * 16;
    pts.forEach(([px, py], s) => {
      const dd = (px - x) ** 2 + (py - y) ** 2;
      if (dd < bd) { bd = dd; best = s; }
    });
    return best;
  }
  pointer(cv.wrap, {
    down(x, y) { st.drag = { x, y, yaw: st.yaw, pitch: st.pitch, moved: 0 }; return true; },
    move(x, y) {
      const g = st.drag;
      g.moved = Math.max(g.moved, Math.hypot(x - g.x, y - g.y));
      if (st.view !== '3d') return;
      if (g.moved > 3) st.auto = false;
      st.yaw = g.yaw + (x - g.x) * 0.01;
      st.pitch = Math.max(-1.5, Math.min(1.5, g.pitch + (y - g.y) * 0.01));
      cv.redraw();
    },
    up(x, y) {
      if (st.drag && st.drag.moved <= 3) {
        const s = nearest(x, y);
        if (s >= 0) { st.sel = s; st.hover = -1; renderDetail(); cv.redraw(); }
      }
      st.drag = null;
    },
    hover(x, y) {
      const s = nearest(x, y);
      cv.wrap.style.cursor = s >= 0 ? 'pointer' : st.view === '3d' ? 'grab' : 'default';
      if (s !== st.hover) { st.hover = s; renderDetail(); cv.redraw(); }
    },
    leave() { if (st.hover >= 0) { st.hover = -1; renderDetail(); cv.redraw(); } },
  });

  // slow rotation while visible, until the reader drags (3D view only)
  let visible = false, last = 0;
  new IntersectionObserver((es) => { visible = es[0].isIntersecting; if (visible) requestAnimationFrame(tick); }).observe(cv.wrap);
  function tick(t) {
    if (!visible || !st.auto || st.view !== '3d') { last = 0; return; }
    if (last) st.yaw += Math.min(0.05, (t - last) / 1000) * 0.22;
    last = t;
    cv.redraw();
    requestAnimationFrame(tick);
  }

  onTheme(() => cv.redraw());
  refresh();
}
