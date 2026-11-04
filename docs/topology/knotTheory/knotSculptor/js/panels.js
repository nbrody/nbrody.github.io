// Canvas drawing for the panels: the invariants card, the projection diagram and the VR hand menu.
// Used for VR canvas textures; the projection drawing is also used for the desktop sidebar canvas.
import { texImage, splitMath } from './mathTex.js';
import { projectDiagram, seifertCircles } from './diagram.js';

export const THEMES = {
  light: {
    bg: '#f3f4f7', panel: '#ffffff', surface: '#f4f6f8', text: '#16181e', muted: '#5f636c', field: '#e7e9ec',
    accent: '#818cf8', accentInk: '#5f67cf', accentOn: '#141414', accentSoft: '#eff2ff', hover: '#e1e5ff',
    comps: ['#5f67cf', '#e0803a', '#2f9e6e', '#c0507a'], surfaceFront: '#00a7da', surfaceBack: '#d38ae7',
    floor: '#e6e8ee',
  },
  dark: {
    bg: '#15171c', panel: '#22252c', surface: '#2b2f37', text: '#e8ebef', muted: '#a5abb4', field: '#363a43',
    accent: '#818cf8', accentInk: '#a5b4fc', accentOn: '#141414', accentSoft: '#2e3350', hover: '#3a4066',
    comps: ['#8b93f0', '#f0a060', '#4fc08d', '#e07aa0'], surfaceFront: '#22b8e6', surfaceBack: '#d996ea',
    floor: '#1d2027',
  },
};
export const CIRCLE_COLORS = ['#5f67cf', '#00a7da', '#d38ae7', '#e0803a', '#2f9e6e', '#c0507a', '#b59a2a', '#6a7a8c'];

const FONT_BODY = '"Atkinson Hyperlegible", system-ui, sans-serif';
const FONT_HEAD = '"Source Serif 4", Georgia, serif';

export function roundRect(ctx, x, y, w, h, r) {
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  if (w <= 0 || h <= 0) { ctx.beginPath(); return; }
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

// Rich text (plain text with $…$ math). prepareRich loads the math images; drawRich is synchronous.
export async function prepareRich(s, { px, color, font = FONT_BODY, weight = 400 }) {
  const runs = splitMath(String(s));
  for (const r of runs) if (r.tex) r.im = await texImage(r.tex, { color, px: px * 1.05 });
  return { runs, px, color, font, weight };
}
export function richWidth(ctx, R) {
  let w = 0;
  ctx.font = `${R.weight} ${R.px}px ${R.font}`;
  for (const r of R.runs) w += r.tex ? r.im.w : ctx.measureText(r.text).width;
  return w;
}
export function drawRich(ctx, R, x, y, { maxW = Infinity, align = 'left' } = {}) {
  const w0 = richWidth(ctx, R);
  const s = w0 > maxW ? maxW / w0 : 1;
  ctx.save();
  let x0 = align === 'center' ? x - (w0 * s) / 2 : align === 'right' ? x - w0 * s : x;
  ctx.translate(x0, y);
  ctx.scale(s, s);
  ctx.font = `${R.weight} ${R.px}px ${R.font}`;
  ctx.fillStyle = R.color;
  ctx.textBaseline = 'alphabetic';
  let cx = 0;
  for (const r of R.runs) {
    if (r.tex) { ctx.drawImage(r.im.img, cx, -r.im.h + r.im.depth, r.im.w, r.im.h); cx += r.im.w; }
    else { ctx.fillText(r.text, cx, 0); cx += ctx.measureText(r.text).width; }
  }
  ctx.restore();
  return w0 * s;
}

// ───────────────────────────── invariants card ─────────────────────────────
// model: { title: { tex, nick, detail, note }, rows: [{ label, value (rich string) }], hint }
export async function renderInfo(ctx, W, H, model, th) {
  const pad = 56;
  const big = model.title?.tex ? await texImage(model.title.tex, { color: th.text, px: 120 }) : null;
  const nick = await prepareRich(model.title?.nick || '', { px: 54, color: th.text, font: FONT_HEAD, weight: 500 });
  const detail = await prepareRich(model.title?.detail || '', { px: 30, color: th.muted });
  const note = model.title?.note ? await prepareRich(model.title.note, { px: 26, color: th.muted }) : null;
  const rows = [];
  for (const r of model.rows || []) {
    rows.push({
      label: await prepareRich(r.label, { px: 28, color: th.muted }),
      value: await prepareRich(r.value, { px: 34, color: th.text }),
      sub: r.sub ? await prepareRich(r.sub, { px: 22, color: th.muted }) : null,
    });
  }
  const hint = model.hint ? await Promise.all(model.hint.map(h => prepareRich(h, { px: 32, color: th.text }))) : null;

  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = th.panel;
  roundRect(ctx, 0, 0, W, H, 44);
  ctx.fill();
  ctx.font = `700 24px ${FONT_BODY}`;
  ctx.fillStyle = th.accentInk;
  ctx.fillText(model.kicker || 'THE KNOT', pad, pad + 10);
  let y = pad + 30;
  let x = pad;
  if (big) {
    const s = Math.min(1, 220 / big.w);
    ctx.drawImage(big.img, x, y + 6, big.w * s, big.h * s);
    x += big.w * s + 34;
  }
  drawRich(ctx, nick, x, y + 66, { maxW: W - x - pad });
  drawRich(ctx, detail, x, y + 112, { maxW: W - x - pad });
  y += big ? Math.max(150, big.h + 24) : 150;
  if (note) { drawRich(ctx, note, pad, y, { maxW: W - 2 * pad }); y += 40; }
  if (hint) {
    ctx.fillStyle = th.surface;
    roundRect(ctx, pad - 16, y, W - 2 * pad + 32, hint.length * 54 + 40, 28);
    ctx.fill();
    hint.forEach((h, i) => drawRich(ctx, h, pad + 8, y + 62 + i * 54, { maxW: W - 2 * pad - 16 }));
    return;
  }
  if (!rows.length) return;
  const rowH = 70;
  ctx.fillStyle = th.surface;
  const blockH = rows.reduce((s, r) => s + rowH + (r.sub ? 26 : 0), 0) + 24;
  roundRect(ctx, pad - 16, y, W - 2 * pad + 32, Math.min(blockH, H - y - 24), 28);
  ctx.fill();
  y += 12;
  const labelW = 290;
  for (const r of rows) {
    if (y + rowH > H - 24) break;
    drawRich(ctx, r.label, pad + 8, y + 45, { maxW: labelW - 20 });
    drawRich(ctx, r.value, pad + labelW, y + 47, { maxW: W - 2 * pad - labelW });
    y += rowH;
    if (r.sub) { drawRich(ctx, r.sub, pad + labelW, y + 4, { maxW: W - 2 * pad - labelW }); y += 26; }
  }
}

// ───────────────────────────── projection diagram ─────────────────────────────

// Diagram of the link seen along `dir` (from the knot toward the eye), with `up` as screen up.
export function projectionData(comps, dir, up) {
  const D = projectDiagram(comps, dir, up);
  const arcs = D.proj.map(P => {
    const cum = new Float64Array(P.N + 1);
    for (let i = 0; i < P.N; i++) {
      const j = (i + 1) % P.N;
      cum[i + 1] = cum[i] + Math.hypot(P.x[j] - P.x[i], P.y[j] - P.y[i]);
    }
    return cum;
  });
  const sc = seifertCircles(D.gauss);
  let w = 0;
  for (const X of D.crossings) w += X.sign;
  return { D, arcs, sc, writhe: w, crossings: D.crossings.length };
}

const arcOf = (cum, s) => { const i = Math.floor(s), t = s - i; return cum[i] + t * (cum[i + 1] - cum[i]); };

function pointAt(P, cum, a) {
  const L = cum[P.N];
  a = ((a % L) + L) % L;
  let lo = 0, hi = P.N;
  while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= a) lo = m; else hi = m; }
  const t = (a - cum[lo]) / ((cum[lo + 1] - cum[lo]) || 1), j = (lo + 1) % P.N;
  return [P.x[lo] + t * (P.x[j] - P.x[lo]), P.y[lo] + t * (P.y[j] - P.y[lo])];
}

// stroke the part of a closed projected polyline between arc lengths a0 < a1 (may exceed L: wraps)
function strokeRange(ctx, P, cum, a0, a1, map) {
  const L = cum[P.N];
  if (a1 - a0 >= L - 1e-12) { a0 = 0; a1 = L; }
  const pts = [pointAt(P, cum, a0)];
  // vertices strictly inside (a0, a1)
  const startTurn = Math.floor(a0 / L);
  let i = 0;
  {
    const base = a0 - startTurn * L;
    let lo = 0, hi = P.N;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (cum[m] <= base) lo = m; else hi = m; }
    i = lo + 1;
  }
  let turn = startTurn;
  for (let guard = 0; guard < 2 * P.N + 2; guard++) {
    if (i >= P.N) { i -= P.N; turn++; }
    const a = cum[i] + turn * L;
    if (a >= a1) break;
    pts.push([P.x[i], P.y[i]]);
    i++;
  }
  pts.push(pointAt(P, cum, a1));
  ctx.beginPath();
  pts.forEach(([x, y], n) => { const [X, Y] = map(x, y); if (n) ctx.lineTo(X, Y); else ctx.moveTo(X, Y); });
  ctx.stroke();
}

// Draws the diagram into the rectangle (x, y, w, h). opts: { R (knot radius), center2 [x,y], th, seifert }
export function drawDiagram(ctx, data, x, y, w, h, opts) {
  const { D, arcs, sc } = data;
  const { th, seifert } = opts;
  const scale = Math.min(w, h) / (2.25 * (opts.R || 1));
  const cx = x + w / 2, cy = y + h / 2;
  const [mx, my] = opts.center2 || [0, 0];
  const map = (px, py) => [cx + (px - mx) * scale, cy - (py - my) * scale];
  const lw = Math.max(3, Math.min(w, h) / 110);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  ctx.lineWidth = lw;
  const gap = (lw * 2.6) / scale; // half-gap at under-crossings, in diagram units
  if (!seifert) {
    D.proj.forEach((P, c) => {
      const cum = arcs[c], L = cum[P.N];
      ctx.strokeStyle = th.comps[c % th.comps.length];
      const unders = D.gauss.comps[c].filter(e => !e.over).map(e => arcOf(cum, e.s)).sort((a, b) => a - b);
      if (!unders.length) { strokeRange(ctx, P, cum, 0, L, map); return; }
      for (let k = 0; k < unders.length; k++) {
        const a0 = unders[k] + gap;
        let a1 = (k + 1 < unders.length ? unders[k + 1] : unders[0] + L) - gap;
        if (a1 > a0) strokeRange(ctx, P, cum, a0, a1, map);
      }
    });
    return;
  }
  // Seifert circles: color every edge by its circle and replace each crossing by its oriented smoothing
  const rho = (lw * 4.6) / scale;
  let freeIdx = sc.count - 1;
  const ends = new Map(); // crossing id → { uI, uO, oI, oO } points
  D.proj.forEach((P, c) => {
    const cum = arcs[c], L = cum[P.N];
    const ev = D.gauss.comps[c];
    if (!ev.length) {
      ctx.strokeStyle = CIRCLE_COLORS[freeIdx-- % CIRCLE_COLORS.length];
      strokeRange(ctx, P, cum, 0, L, map);
      return;
    }
    const as = ev.map(e => arcOf(cum, e.s));
    const labels = sc.edgeLabels[c];
    ev.forEach((e, m) => {
      const a0 = as[m] + rho;
      const a1 = (m + 1 < ev.length ? as[m + 1] : as[0] + L) - rho;
      const circ = sc.circleOfEdge.get(labels[m]);
      ctx.strokeStyle = CIRCLE_COLORS[circ % CIRCLE_COLORS.length];
      if (a1 > a0) strokeRange(ctx, P, cum, a0, a1, map);
      // endpoints near the crossings at both ends of this edge
      const e1 = ev[(m + 1) % ev.length];
      const out = ends.get(e.x) || {}; ends.set(e.x, out);
      out[e.over ? 'oO' : 'uO'] = { p: pointAt(P, cum, as[m] + rho), circ };
      const inn = ends.get(e1.x) || {}; ends.set(e1.x, inn);
      inn[e1.over ? 'oI' : 'uI'] = { p: pointAt(P, cum, (m + 1 < ev.length ? as[m + 1] : as[0] + L) - rho), circ };
    });
  });
  for (const X of D.crossings) {
    const e = ends.get(X.id);
    if (!e || !e.uI || !e.oO || !e.oI || !e.uO) continue;
    const c0 = [X.x, X.y];
    const mids = [];
    for (const [A, B] of [[e.uI, e.oO], [e.oI, e.uO]]) {
      const ctrl = [c0[0] + 0.42 * (A.p[0] - c0[0] + B.p[0] - c0[0]), c0[1] + 0.42 * (A.p[1] - c0[1] + B.p[1] - c0[1])];
      const [ax, ay] = map(...A.p), [bx, by] = map(...B.p), [qx, qy] = map(...ctrl);
      ctx.strokeStyle = CIRCLE_COLORS[A.circ % CIRCLE_COLORS.length];
      ctx.beginPath(); ctx.moveTo(ax, ay); ctx.quadraticCurveTo(qx, qy, bx, by); ctx.stroke();
      mids.push([0.25 * ax + 0.5 * qx + 0.25 * bx, 0.25 * ay + 0.5 * qy + 0.25 * by]);
    }
    // the half-twisted band that Seifert's algorithm glues in at this crossing: a short strip
    // between the two smoothed arcs, with the twist drawn as an X
    ctx.save();
    const [m0, m1] = mids;
    const dx = m1[0] - m0[0], dy = m1[1] - m0[1], len = Math.hypot(dx, dy) || 1;
    const nx = (-dy / len) * lw * 1.3, ny = (dx / len) * lw * 1.3;
    ctx.fillStyle = th.muted;
    ctx.globalAlpha = 0.28;
    ctx.beginPath();
    ctx.moveTo(m0[0] + nx, m0[1] + ny); ctx.lineTo(m1[0] + nx, m1[1] + ny);
    ctx.lineTo(m1[0] - nx, m1[1] - ny); ctx.lineTo(m0[0] - nx, m0[1] - ny);
    ctx.closePath(); ctx.fill();
    ctx.globalAlpha = 0.9;
    ctx.strokeStyle = th.muted;
    ctx.lineWidth = lw * 0.45;
    ctx.beginPath();
    ctx.moveTo(m0[0] + nx, m0[1] + ny); ctx.lineTo(m1[0] - nx, m1[1] - ny);
    ctx.moveTo(m0[0] - nx, m0[1] - ny); ctx.lineTo(m1[0] + nx, m1[1] + ny);
    ctx.stroke();
    ctx.restore();
  }
}

export async function renderProjection(ctx, W, H, data, opts) {
  const { th } = opts;
  const pad = 48;
  const title = await prepareRich('Projection', { px: 46, color: th.text, font: FONT_HEAD, weight: 500 });
  const sub = await prepareRich(opts.subtitle || 'the diagram you see from where you stand', { px: 26, color: th.muted });
  const c = data.crossings, s = data.sc.count, mu = data.D.proj.length;
  const g = (c - s - mu + 2) / 2;
  const stats = await prepareRich(
    opts.seifert
      ? `${s} Seifert circle${s === 1 ? '' : 's'} · $${c}$ bands · surface genus $${Number.isInteger(g) ? g : '?'}$`
      : `${c} crossing${c === 1 ? '' : 's'} · writhe $${data.writhe}$`,
    { px: opts.compact ? 46 : 30, color: th.text });
  ctx.clearRect(0, 0, W, H);
  if (!opts.transparent) {
    ctx.fillStyle = th.panel;
    roundRect(ctx, 0, 0, W, H, 44);
    ctx.fill();
  }
  let top = 16;
  if (!opts.compact) {
    drawRich(ctx, title, pad, pad + 34);
    drawRich(ctx, sub, pad, pad + 74, { maxW: W - 2 * pad });
    top = pad + 100;
  }
  ctx.fillStyle = th.surface;
  const bottom = H - pad - 60;
  if (!opts.compact) { roundRect(ctx, pad - 16, top, W - 2 * pad + 32, bottom - top, 28); ctx.fill(); }
  drawDiagram(ctx, data, pad, top + 10, W - 2 * pad, bottom - top - 20, opts);
  drawRich(ctx, stats, pad, H - pad + 6, { maxW: W - 2 * pad });
}

// ───────────────────────────── VR hand menu ─────────────────────────────
// items: rows of { id, kind: 'button'|'toggle'|'seg'|'slider'|'label', label, active, options, value, weight }
export async function renderMenu(ctx, W, H, rows, th, hoverId, pressId) {
  const pad = 40, gapX = 18, rowH = 92, gapY = 18;
  const prepared = [];
  for (const row of rows) {
    const pr = [];
    for (const it of row) {
      const p = { ...it };
      if (it.kind === 'seg') p.opts = await Promise.all(it.options.map(o => prepareRich(o.label, { px: 32, color: th.text, weight: 700 })));
      else if (it.kind === 'title') p.rich = await prepareRich(it.label, { px: 44, color: th.text, font: FONT_HEAD, weight: 500 });
      else p.rich = await prepareRich(it.label, { px: it.kind === 'label' ? 30 : 32, color: it.active ? th.accentOn : th.text, weight: it.kind === 'label' ? 400 : 700 });
      if (it.kind === 'slider') p.valueRich = await prepareRich(it.valueLabel || '', { px: 30, color: th.text });
      pr.push(p);
    }
    prepared.push(pr);
  }
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = th.panel;
  roundRect(ctx, 0, 0, W, H, 48);
  ctx.fill();
  const regions = [];
  let y = pad;
  for (const row of prepared) {
    const h = row[0].kind === 'title' ? 70 : row[0].kind === 'slider' ? 120 : rowH;
    const total = row.reduce((s, it) => s + (it.weight || 1), 0);
    const avail = W - 2 * pad - gapX * (row.length - 1);
    let x = pad;
    for (const it of row) {
      const w = (avail * (it.weight || 1)) / total;
      const hov = hoverId === it.id, prs = pressId === it.id;
      if (it.kind === 'title') {
        drawRich(ctx, it.rich, x, y + 50, { maxW: w });
      } else if (it.kind === 'label') {
        drawRich(ctx, it.rich, x + w / 2, y + h / 2 + 11, { maxW: w, align: 'center' });
      } else if (it.kind === 'seg') {
        ctx.fillStyle = th.field;
        roundRect(ctx, x, y, w, h, h / 2); ctx.fill();
        const n = it.options.length, sw = w / n;
        it.options.forEach((o, k) => {
          const on = o.value === it.value;
          if (on || (hov && it.hoverValue === o.value)) {
            ctx.fillStyle = on ? th.accent : th.hover;
            roundRect(ctx, x + k * sw + 6, y + 6, sw - 12, h - 12, (h - 12) / 2); ctx.fill();
          }
          const r = it.opts[k];
          r.color = on ? th.accentOn : th.text;
          drawRich(ctx, r, x + k * sw + sw / 2, y + h / 2 + 11, { maxW: sw - 24, align: 'center' });
          regions.push({ id: it.id, value: o.value, x: x + k * sw, y, w: sw, h, kind: 'seg' });
        });
      } else if (it.kind === 'slider') {
        drawRich(ctx, it.rich, x + 8, y + 34, { maxW: w * 0.6 });
        drawRich(ctx, it.valueRich, x + w - 8, y + 34, { maxW: w * 0.4, align: 'right' });
        const ty = y + 82, tx0 = x + 24, tx1 = x + w - 24;
        ctx.fillStyle = th.field;
        roundRect(ctx, tx0 - 12, ty - 12, tx1 - tx0 + 24, 24, 12); ctx.fill();
        const f = (it.value - it.min) / (it.max - it.min);
        ctx.fillStyle = th.accent;
        roundRect(ctx, tx0 - 12, ty - 12, (tx1 - tx0) * f + 24, 24, 12); ctx.fill();
        ctx.fillStyle = th.panel;
        ctx.beginPath(); ctx.arc(tx0 + (tx1 - tx0) * f, ty, hov || prs ? 22 : 18, 0, 2 * Math.PI); ctx.fill();
        ctx.fillStyle = th.accentInk;
        ctx.beginPath(); ctx.arc(tx0 + (tx1 - tx0) * f, ty, 10, 0, 2 * Math.PI); ctx.fill();
        regions.push({ id: it.id, x, y: y + 50, w, h: 64, kind: 'slider', tx0, tx1, min: it.min, max: it.max });
      } else {
        const on = it.kind === 'toggle' && it.active;
        ctx.fillStyle = prs ? th.accentInk : on ? th.accent : hov ? th.hover : th.accentSoft;
        roundRect(ctx, x, y, w, h, h / 2); ctx.fill();
        it.rich.color = prs ? '#ffffff' : on ? th.accentOn : th.accentInk;
        if (it.disabled) { ctx.globalAlpha = 0.4; }
        drawRich(ctx, it.rich, x + w / 2, y + h / 2 + 11, { maxW: w - 32, align: 'center' });
        ctx.globalAlpha = 1;
        if (!it.disabled) regions.push({ id: it.id, x, y, w, h, kind: it.kind });
      }
      x += w + gapX;
    }
    y += h + gapY;
  }
  return regions;
}
