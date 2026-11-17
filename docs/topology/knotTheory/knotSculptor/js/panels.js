// Canvas drawing for the panels: the invariants card, the projection diagram and the VR hand menu.
// Styled after the Poincaré workbench (Kleinian/poincare/style.css & topology/assets/poincare-ui.css).
import { texImage, splitMath } from './mathTex.js';
import { projectDiagram, seifertCircles } from './diagram.js';
import { PALETTES, samplePaletteHex } from './palettes.js';

export const THEMES = {
  light: {
    name: 'light',
    bg: '#eef1f8',
    panelTop: '#fbfcff',
    panel: '#f1f4fb',
    headerBg: 'rgba(255, 255, 255, 0.62)',
    surface: 'rgba(23, 28, 43, 0.035)',
    wellBg: 'rgba(255, 255, 255, 0.56)',
    text: '#171c2b',
    muted: '#545d75',
    faint: '#8b93a8',
    field: 'rgba(255, 255, 255, 0.78)',
    w03: 'rgba(23, 28, 43, 0.03)',
    w05: 'rgba(23, 28, 43, 0.05)',
    w08: 'rgba(23, 28, 43, 0.08)',
    hairline: 'rgba(23, 28, 43, 0.10)',
    hairlineStrong: 'rgba(23, 28, 43, 0.18)',
    accent: '#6366f1',
    accent2: '#0891b2',
    accentInk: '#4f46e5',
    accentOn: '#ffffff',
    accentSoft: 'rgba(99, 102, 241, 0.15)',
    accentSoftBot: 'rgba(99, 102, 241, 0.06)',
    accentLine: 'rgba(99, 102, 241, 0.48)',
    accentGlow: 'rgba(99, 102, 241, 0.24)',
    hover: 'rgba(99, 102, 241, 0.10)',
    edgeStops: ['rgba(255, 255, 255, 0.94)', 'rgba(23, 28, 43, 0.08)', 'rgba(99, 102, 241, 0.34)'],
    comps: ['#5f63e6', '#e0803a', '#14a37f', '#c0507a'],
    surfaceFront: '#0891b2',
    surfaceBack: '#c77ddb',
    floor: '#dde2ee',
  },
  dark: {
    name: 'dark',
    bg: '#05070f',
    panelTop: '#10162a',
    panel: '#0a0e1b',
    headerBg: 'rgba(0, 0, 0, 0.28)',
    surface: 'rgba(255, 255, 255, 0.035)',
    wellBg: 'rgba(0, 0, 0, 0.24)',
    text: '#eef1f8',
    muted: '#9aa5bd',
    faint: '#5e6880',
    field: 'rgba(8, 12, 24, 0.65)',
    w03: 'rgba(255, 255, 255, 0.03)',
    w05: 'rgba(255, 255, 255, 0.055)',
    w08: 'rgba(255, 255, 255, 0.09)',
    hairline: 'rgba(255, 255, 255, 0.08)',
    hairlineStrong: 'rgba(255, 255, 255, 0.16)',
    accent: '#818cf8',
    accent2: '#22d3ee',
    accentInk: '#a5b4fc',
    accentOn: '#05070f',
    accentSoft: 'rgba(129, 140, 248, 0.20)',
    accentSoftBot: 'rgba(129, 140, 248, 0.08)',
    accentLine: 'rgba(129, 140, 248, 0.50)',
    accentGlow: 'rgba(129, 140, 248, 0.32)',
    hover: 'rgba(255, 255, 255, 0.09)',
    edgeStops: ['rgba(255, 255, 255, 0.24)', 'rgba(255, 255, 255, 0.06)', 'rgba(129, 140, 248, 0.36)'],
    comps: ['#8b93f8', '#f0a060', '#4fd1a5', '#f07aa8'],
    surfaceFront: '#22d3ee',
    surfaceBack: '#d996ea',
    floor: '#121a30',
  },
};
export const CIRCLE_COLORS = ['#5f67cf', '#00a7da', '#d38ae7', '#e0803a', '#2f9e6e', '#c0507a', '#b59a2a', '#6a7a8c'];

export const FONT_BODY = 'Inter, system-ui, sans-serif';
export const FONT_HEAD = 'Inter, system-ui, sans-serif';
export const FONT_MONO = '"JetBrains Mono", ui-monospace, monospace';

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

/**
 * Draw the signature /poincare/ glass panel card (opaque wash for 3D canvas legibility,
 * optional top header bar, and 165° diagonal gradient hairline border).
 */
export function drawPoincareCard(ctx, W, H, th, { radius = 40, headerH = 0, borderW = 2.5 } = {}) {
  ctx.save();
  ctx.clearRect(0, 0, W, H);
  roundRect(ctx, 0, 0, W, H, radius);
  ctx.clip();

  const body = ctx.createLinearGradient(0, 0, W * 0.4, H);
  body.addColorStop(0, th.panelTop);
  body.addColorStop(1, th.panel);
  ctx.fillStyle = body;
  ctx.fillRect(0, 0, W, H);

  if (headerH > 0) {
    ctx.fillStyle = th.headerBg;
    ctx.fillRect(0, 0, W, headerH);
    ctx.fillStyle = th.hairline;
    ctx.fillRect(0, headerH - 1.5, W, 1.5);
  }
  ctx.restore();

  ctx.save();
  const edge = ctx.createLinearGradient(0, 0, W * 0.55, H);
  edge.addColorStop(0, th.edgeStops[0]);
  edge.addColorStop(0.32, th.edgeStops[1]);
  edge.addColorStop(0.92, th.edgeStops[2]);
  ctx.strokeStyle = edge;
  ctx.lineWidth = borderW;
  roundRect(ctx, borderW / 2, borderW / 2, W - borderW, H - borderW, radius - borderW / 2);
  ctx.stroke();
  ctx.restore();
}

/** Draw an inner `.control-group` card inside a panel. */
export function drawGroupBox(ctx, x, y, w, h, th, r = 26) {
  ctx.save();
  ctx.fillStyle = th.w03;
  roundRect(ctx, x, y, w, h, r);
  ctx.fill();
  ctx.strokeStyle = th.hairline;
  ctx.lineWidth = 1.6;
  ctx.stroke();
  ctx.restore();
}

/** Draw `.panel-title` text with /poincare/'s ink → indigo → cyan gradient fill. */
export function drawTitleGradient(ctx, text, x, y, px, th) {
  ctx.save();
  ctx.font = `650 ${px}px ${FONT_HEAD}`;
  ctx.textBaseline = 'alphabetic';
  const tw = ctx.measureText(text).width || 200;
  const grad = ctx.createLinearGradient(x, y - px * 0.8, x + tw * 1.05, y + px * 0.2);
  grad.addColorStop(0.25, th.text);
  grad.addColorStop(0.82, th.accent);
  grad.addColorStop(1, th.accent2);
  ctx.fillStyle = grad;
  ctx.fillText(text, x, y);
  ctx.restore();
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
export async function renderInfo(ctx, W, H, model, th) {
  const pad = 48, headerH = 78;
  const big = model.title?.tex ? await texImage(model.title.tex, { color: th.text, px: 112 }) : null;
  const nick = await prepareRich(model.title?.nick || '', { px: 50, color: th.text, font: FONT_HEAD, weight: 650 });
  const detail = await prepareRich(model.title?.detail || '', { px: 28, color: th.muted });
  const note = model.title?.note ? await prepareRich(model.title.note, { px: 25, color: th.muted }) : null;
  const rows = [];
  for (const r of model.rows || []) {
    rows.push({
      label: await prepareRich(r.label.toUpperCase(), { px: 22, color: th.muted, weight: 600 }),
      value: await prepareRich(r.value, { px: 33, color: th.text }),
      sub: r.sub ? await prepareRich(r.sub, { px: 21, color: th.faint }) : null,
    });
  }
  const hint = model.hint ? await Promise.all(model.hint.map(h => prepareRich(h, { px: 30, color: th.text }))) : null;

  drawPoincareCard(ctx, W, H, th, { radius: 40, headerH });

  // Header kicker + accent status dot
  ctx.save();
  ctx.fillStyle = th.accent;
  ctx.shadowColor = th.accentGlow;
  ctx.shadowBlur = 14;
  ctx.beginPath(); ctx.arc(pad, headerH / 2, 7, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  ctx.font = `600 22px ${FONT_BODY}`;
  ctx.fillStyle = th.muted;
  ctx.fillText((model.kicker || 'INVARIANTS').toUpperCase(), pad + 20, headerH / 2 + 8);

  let y = headerH + 26;
  let x = pad;
  if (big) {
    const s = Math.min(1, 210 / big.w);
    ctx.drawImage(big.img, x, y + 4, big.w * s, big.h * s);
    x += big.w * s + 32;
  }
  drawRich(ctx, nick, x, y + 60, { maxW: W - x - pad });
  drawRich(ctx, detail, x, y + 102, { maxW: W - x - pad });
  y += big ? Math.max(138, big.h + 18) : 134;
  if (note) { drawRich(ctx, note, pad, y, { maxW: W - 2 * pad }); y += 38; }
  if (hint) {
    drawGroupBox(ctx, pad - 12, y, W - 2 * pad + 24, hint.length * 52 + 36, th, 26);
    hint.forEach((h, i) => drawRich(ctx, h, pad + 12, y + 56 + i * 52, { maxW: W - 2 * pad - 24 }));
    return;
  }
  if (!rows.length) return;
  const rowH = 68;
  const blockH = Math.min(rows.reduce((s, r) => s + rowH + (r.sub ? 24 : 0), 0) + 22, H - y - 28);
  drawGroupBox(ctx, pad - 12, y, W - 2 * pad + 24, blockH, th, 26);
  y += 10;
  const labelW = 285;
  rows.forEach((r, idx) => {
    if (y + rowH > H - 24) return;
    if (idx > 0) {
      ctx.fillStyle = th.hairline;
      ctx.fillRect(pad + 6, y + 6, W - 2 * pad - 12, 1.2);
    }
    drawRich(ctx, r.label, pad + 10, y + 44, { maxW: labelW - 22 });
    drawRich(ctx, r.value, pad + labelW, y + 46, { maxW: W - 2 * pad - labelW });
    y += rowH;
    if (r.sub) { drawRich(ctx, r.sub, pad + labelW, y + 2, { maxW: W - 2 * pad - labelW }); y += 24; }
  });
}

// ───────────────────────────── projection diagram ─────────────────────────────

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

function strokeRange(ctx, P, cum, a0, a1, map) {
  const L = cum[P.N];
  if (a1 - a0 >= L - 1e-12) { a0 = 0; a1 = L; }
  const pts = [pointAt(P, cum, a0)];
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
  const gap = (lw * 2.6) / scale;
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
  const rho = (lw * 4.6) / scale;
  let freeIdx = sc.count - 1;
  const ends = new Map();
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
  const sub = await prepareRich(opts.subtitle || 'the diagram you see from where you stand', { px: 25, color: th.muted });
  const c = data.crossings, s = data.sc.count, mu = data.D.proj.length;
  const g = (c - s - mu + 2) / 2;
  const stats = await prepareRich(
    opts.seifert
      ? `${s} Seifert circle${s === 1 ? '' : 's'} · $${c}$ bands · surface genus $${Number.isInteger(g) ? g : '?'}$`
      : `${c} crossing${c === 1 ? '' : 's'} · writhe $${data.writhe}$`,
    { px: opts.compact ? 46 : 30, color: th.text });
  ctx.clearRect(0, 0, W, H);
  let top = 16;
  if (!opts.transparent) {
    drawPoincareCard(ctx, W, H, th, { radius: 40, headerH: 118 });
    drawTitleGradient(ctx, 'Projection', pad, 56, 42, th);
    drawRich(ctx, sub, pad, 94, { maxW: W - 2 * pad });
    top = 136;
  } else if (!opts.compact) {
    drawTitleGradient(ctx, 'Projection', pad, pad + 34, 44, th);
    drawRich(ctx, sub, pad, pad + 74, { maxW: W - 2 * pad });
    top = pad + 100;
  }
  const bottom = H - pad - 56;
  if (!opts.compact) {
    ctx.save();
    ctx.fillStyle = th.field;
    roundRect(ctx, pad - 14, top, W - 2 * pad + 28, bottom - top, 24);
    ctx.fill();
    ctx.strokeStyle = th.hairline;
    ctx.lineWidth = 1.6;
    ctx.stroke();
    ctx.restore();
  }
  const dx = pad, dy = top + 10, dw = W - 2 * pad, dh = bottom - top - 20;
  drawDiagram(ctx, data, dx, dy, dw, dh, opts);
  const scale = Math.min(dw, dh) / (2.25 * (opts.R || 1));
  const [mx, my] = opts.center2 || [0, 0];
  const regions = (opts.moves || []).map((move, i) => {
    const anchorX = dx + dw / 2 + (move.x - mx) * scale;
    const anchorY = dy + dh / 2 - (move.y - my) * scale;
    const siblings = (opts.moves || []).map((m, j) => ({ m, j })).filter(({ m }) =>
      Math.hypot((m.x - move.x) * scale, (m.y - move.y) * scale) < 1);
    const slot = siblings.findIndex(({ j }) => j === i);
    const big = opts.compact ? 1.7 : 1;
    const px = anchorX + (slot - (siblings.length - 1) / 2) * 62 * big;
    const py = anchorY;
    const radius = 27 * big;
    ctx.save();
    if (siblings.length > 1) {
      ctx.strokeStyle = th.accentInk; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(anchorX, anchorY); ctx.lineTo(px, py); ctx.stroke();
    }
    ctx.fillStyle = th.panel;
    ctx.strokeStyle = th.accent;
    ctx.shadowColor = th.accentGlow;
    ctx.shadowBlur = 12;
    ctx.lineWidth = 4.5;
    ctx.beginPath(); ctx.arc(px, py, radius, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();
    ctx.shadowBlur = 0;
    ctx.fillStyle = th.text;
    ctx.font = `700 ${Math.round(24 * big)}px ${FONT_BODY}`;
    ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText(String(i + 1), px, py + 1);
    ctx.restore();
    return { id: 'reidemeister', kind: 'move', value: i, x: px - radius, y: py - radius, w: 2 * radius, h: 2 * radius };
  });
  drawRich(ctx, stats, pad, H - pad + 8, { maxW: W - 2 * pad });
  return regions;
}

export function renderMovingProjection(ctx, W, H, data, opts) {
  const { th } = opts, pad = 48;
  ctx.clearRect(0, 0, W, H);
  if (!opts.transparent) {
    drawPoincareCard(ctx, W, H, th, { radius: 40, headerH: 118 });
  }
  const top = opts.compact ? 16 : 136, bottom = H - pad - 56;
  if (!opts.compact) {
    drawTitleGradient(ctx, 'Projection', pad, 56, 42, th);
    ctx.fillStyle = th.muted; ctx.font = `25px ${FONT_BODY}`;
    ctx.fillText('Reidemeister move in progress', pad, 94);
    ctx.fillStyle = th.field;
    roundRect(ctx, pad - 14, top, W - 2 * pad + 28, bottom - top, 24);
    ctx.fill();
    ctx.strokeStyle = th.hairline; ctx.lineWidth = 1.6; ctx.stroke();
  }
  drawDiagram(ctx, data, pad, top + 10, W - 2 * pad, bottom - top - 20, opts);
  ctx.fillStyle = th.text;
  ctx.font = `${opts.compact ? 46 : 30}px ${FONT_BODY}`;
  ctx.textBaseline = 'alphabetic';
  ctx.fillText(`${data.crossings} crossing${data.crossings === 1 ? '' : 's'} · writhe ${data.writhe}`, pad, H - pad + 8);
}

// ───────────────────────────── VR hand menu (/poincare/ glass styling) ─────────────────────────────
function drawPoincareButton(ctx, x, y, w, h, th, { active = false, hov = false, prs = false, accentAlt = false, disabled = false, r = 20 } = {}) {
  ctx.save();
  if (disabled) ctx.globalAlpha = 0.4;
  const inset = prs ? 2 : 0;
  roundRect(ctx, x + inset, y + inset, w - 2 * inset, h - 2 * inset, r);
  if (active || prs) {
    const g = ctx.createLinearGradient(0, y, 0, y + h);
    g.addColorStop(0, th.accentSoft);
    g.addColorStop(1, th.accentSoftBot);
    ctx.fillStyle = g;
    ctx.shadowColor = th.accentGlow;
    ctx.shadowBlur = 18;
    ctx.fill();
    ctx.shadowBlur = 0;
    ctx.strokeStyle = th.accentLine;
    ctx.lineWidth = 2;
    ctx.stroke();
  } else if (accentAlt) {
    ctx.fillStyle = hov ? 'rgba(34, 211, 238, 0.18)' : 'rgba(34, 211, 238, 0.09)';
    ctx.fill();
    ctx.strokeStyle = hov ? 'rgba(34, 211, 238, 0.52)' : 'rgba(34, 211, 238, 0.30)';
    ctx.lineWidth = 1.8;
    ctx.stroke();
  } else {
    ctx.fillStyle = hov ? th.w08 : th.w05;
    ctx.fill();
    ctx.strokeStyle = hov ? th.hairlineStrong : th.hairline;
    ctx.lineWidth = 1.6;
    ctx.stroke();
  }
  ctx.restore();
}

function drawPaletteSwatchBar(ctx, x, y, w, h, paletteId, fallbackHex) {
  const pal = PALETTES[paletteId];
  ctx.save();
  roundRect(ctx, x, y, w, h, h / 2);
  if (!pal || pal.solid) {
    ctx.fillStyle = fallbackHex || '#818cf8';
    ctx.fill();
  } else {
    const g = ctx.createLinearGradient(x, 0, x + w, 0);
    const n = 8;
    for (let i = 0; i <= n; i++) g.addColorStop(i / n, samplePaletteHex(paletteId, i / n, fallbackHex));
    ctx.fillStyle = g;
    ctx.fill();
  }
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
  ctx.lineWidth = 1.4;
  ctx.stroke();
  ctx.restore();
}

// items: rows of { id, kind: 'button'|'toggle'|'seg'|'slider'|'label'|'palette'|'title', group, label, active, options, value, weight }
export async function renderMenu(ctx, W, H, rows, th, hoverId, pressId) {
  const outerPad = 28, cardPad = 16, gapX = 12, rowH = 74, gapY = 12, groupGap = 14;
  const headerH = 82;
  const prepared = [];
  let titleLabel = 'Knot Sculptor';
  for (const row of rows) {
    if (row.length === 1 && row[0].kind === 'title') {
      titleLabel = row[0].label;
      continue;
    }
    const pr = [];
    for (const it of row) {
      const p = { ...it };
      if (it.kind === 'seg') {
        p.opts = await Promise.all(it.options.map(o => prepareRich(o.label, { px: 26, color: th.text, weight: 600 })));
      } else if (it.kind === 'palette') {
        p.rich = await prepareRich(it.label, { px: 27, color: th.text, weight: 600 });
      } else {
        p.rich = await prepareRich(it.label, {
          px: it.kind === 'label' ? 27 : 28,
          color: th.text,
          weight: it.kind === 'label' ? 500 : 550,
        });
      }
      if (it.kind === 'slider') p.valueRich = await prepareRich(it.valueLabel || '', { px: 26, color: th.text, font: FONT_MONO });
      pr.push(p);
    }
    prepared.push(pr);
  }

  drawPoincareCard(ctx, W, H, th, { radius: 38, headerH });
  drawTitleGradient(ctx, titleLabel, outerPad + 8, 54, 38, th);

  // Group consecutive rows that share a `group` id into /poincare/ `.control-group` cards.
  const groups = [];
  for (const row of prepared) {
    const gid = row[0]?.group ?? groups.length;
    const last = groups[groups.length - 1];
    if (last && last.gid === gid) last.rows.push(row);
    else groups.push({ gid, rows: [row] });
  }

  const regions = [];
  let gy = headerH + 18;
  const innerX = outerPad + cardPad;
  const innerW = W - 2 * (outerPad + cardPad);

  for (const grp of groups) {
    const heights = grp.rows.map(r => (r[0].kind === 'slider' ? 102 : rowH));
    const cardH = heights.reduce((a, b) => a + b, 0) + gapY * (grp.rows.length - 1) + 2 * cardPad;
    drawGroupBox(ctx, outerPad, gy, W - 2 * outerPad, cardH, th, 24);

    let y = gy + cardPad;
    grp.rows.forEach((row, rIdx) => {
      const h = heights[rIdx];
      const total = row.reduce((s, it) => s + (it.weight || 1), 0);
      const avail = innerW - gapX * (row.length - 1);
      let x = innerX;

      for (const it of row) {
        const w = (avail * (it.weight || 1)) / total;
        const hov = hoverId === it.id, prs = pressId === it.id;

        if (it.kind === 'label') {
          it.rich.color = th.text;
          drawRich(ctx, it.rich, x + w / 2, y + h / 2 + 10, { maxW: w - 12, align: 'center' });
        } else if (it.kind === 'seg') {
          ctx.save();
          ctx.fillStyle = th.field;
          roundRect(ctx, x, y, w, h, 18);
          ctx.fill();
          ctx.strokeStyle = th.hairline;
          ctx.lineWidth = 1.6;
          ctx.stroke();
          ctx.restore();

          const padS = 5;
          const n = it.options.length, sw = (w - 2 * padS) / n, sh = h - 2 * padS;
          it.options.forEach((o, k) => {
            const sx = x + padS + k * sw, sy = y + padS;
            const on = o.value === it.value;
            const segHov = hov && it.hoverValue === o.value;
            if (on) {
              drawPoincareButton(ctx, sx, sy, sw, sh, th, { active: true, r: 13 });
            } else if (segHov) {
              ctx.fillStyle = th.w05;
              roundRect(ctx, sx, sy, sw, sh, 13);
              ctx.fill();
            }
            const r = it.opts[k];
            r.color = on ? th.text : segHov ? th.text : th.muted;
            drawRich(ctx, r, sx + sw / 2, y + h / 2 + 9, { maxW: sw - 16, align: 'center' });
            regions.push({ id: it.id, value: o.value, x: sx, y, w: sw, h, kind: 'seg' });
          });
        } else if (it.kind === 'slider') {
          it.rich.color = th.muted;
          drawRich(ctx, it.rich, x + 4, y + 30, { maxW: w * 0.62 });
          it.valueRich.color = th.text;
          drawRich(ctx, it.valueRich, x + w - 4, y + 30, { maxW: w * 0.36, align: 'right' });
          const ty = y + 72, tx0 = x + 18, tx1 = x + w - 18;
          ctx.save();
          ctx.fillStyle = th.field;
          roundRect(ctx, tx0 - 8, ty - 7, tx1 - tx0 + 16, 14, 7);
          ctx.fill();
          ctx.strokeStyle = th.hairline;
          ctx.lineWidth = 1.4;
          ctx.stroke();
          const f = Math.min(1, Math.max(0, (it.value - it.min) / (it.max - it.min)));
          ctx.fillStyle = th.accent;
          roundRect(ctx, tx0 - 8, ty - 7, (tx1 - tx0) * f + 16, 14, 7);
          ctx.fill();
          const cx = tx0 + (tx1 - tx0) * f;
          ctx.shadowColor = th.accentGlow;
          ctx.shadowBlur = 16;
          ctx.fillStyle = th.accent;
          ctx.beginPath(); ctx.arc(cx, ty, hov || prs ? 19 : 16, 0, 2 * Math.PI); ctx.fill();
          ctx.shadowBlur = 0;
          ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
          ctx.lineWidth = 2.5;
          ctx.stroke();
          ctx.restore();
          regions.push({ id: it.id, x, y: y + 42, w, h: 58, kind: 'slider', tx0, tx1, min: it.min, max: it.max });
        } else if (it.kind === 'palette') {
          drawPoincareButton(ctx, x, y, w, h, th, { hov, prs, r: 18 });
          const swW = Math.min(130, w * 0.34), swH = 22;
          drawPaletteSwatchBar(ctx, x + 18, y + (h - swH) / 2, swW, swH, it.paletteId, th.comps[0]);
          it.rich.color = th.text;
          drawRich(ctx, it.rich, x + 18 + swW + 16, y + h / 2 + 10, { maxW: w - swW - 50 });
          regions.push({ id: it.id, x, y, w, h, kind: 'button' });
        } else {
          const on = it.kind === 'toggle' && it.active;
          drawPoincareButton(ctx, x, y, w, h, th, { active: on, hov, prs, accentAlt: !!it.accentAlt, disabled: !!it.disabled, r: 18 });
          it.rich.color = it.accentAlt ? th.accent2 : (on || prs || hov ? th.text : th.muted);
          if (it.disabled) ctx.globalAlpha = 0.4;
          drawRich(ctx, it.rich, x + w / 2, y + h / 2 + 10, { maxW: w - 24, align: 'center' });
          ctx.globalAlpha = 1;
          if (!it.disabled) regions.push({ id: it.id, x, y, w, h, kind: it.kind });
        }
        x += w + gapX;
      }
      y += h + gapY;
    });
    gy += cardH + groupGap;
  }
  return regions;
}
