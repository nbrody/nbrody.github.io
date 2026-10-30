// The slide canvas: renders the current slide with the shared renderer and
// handles direct manipulation — select, drag with smart guides, resize,
// rotate, marquee, in-place text editing and interacting with live embeds.

import { app, currentSlide, findEl, selectedEls, editCtx, setSelection } from './state.js';
import { renderBackground, elementStyle, elementInner, innerKey, buildSteps } from './render.js';
import { themeVars, COLOR_TOKENS, COLOR_LABELS } from './themes.js';
import { aabb, unionBox, W, H, sanitizeHTML, htmlIsEmpty, clone, uid } from './model.js';
import { renderTeX } from './math.js';
import { h, icon, popover, closePopover, colorControl } from './ui.js';

let viewport, holder, stage, overlay, textBar;
let scale = 1;
const nodes = new Map();   // element id → { node, key, style }
let bgNode = null, bgKey = '', hoverId = null;
let guides = [], marquee = null, gesture = null;
export const getScale = () => scale;

export function initCanvas(host) {
  viewport = host;
  holder = h('div', { id: 'stage-holder' });
  stage = h('div.pz-stage', { id: 'stage' });
  overlay = h('div', { id: 'overlay' });
  holder.append(stage, overlay);
  viewport.append(holder);
  textBar = buildTextBar();
  document.body.append(textBar);

  viewport.addEventListener('pointerdown', onPointerDown);
  viewport.addEventListener('dblclick', onDoubleClick);
  viewport.addEventListener('pointermove', onHover);
  viewport.addEventListener('pointerleave', () => { if (hoverId) { hoverId = null; drawOverlay(); } });
  viewport.addEventListener('contextmenu', onContextMenu);
  viewport.addEventListener('dragover', e => { if ([...e.dataTransfer.types].includes('Files')) { e.preventDefault(); viewport.classList.add('drop'); } });
  viewport.addEventListener('dragleave', () => viewport.classList.remove('drop'));
  viewport.addEventListener('drop', e => {
    viewport.classList.remove('drop');
    if (!e.dataTransfer.files.length) return;
    e.preventDefault();
    app.onDropFiles?.([...e.dataTransfer.files], toStage(e));
  });
  new ResizeObserver(() => { if (app.deck) fit(); }).observe(viewport);
  document.fonts?.addEventListener?.('loadingdone', () => { if (app.deck) { autoFitAll(); drawOverlay(); } });
}

// ------------------------------------------------------------------ zoom --
export function fit() {
  const pad = 56;
  const aw = Math.max(100, viewport.clientWidth - pad), ah = Math.max(100, viewport.clientHeight - pad);
  scale = app.zoom === 'fit' ? Math.min(aw / W, ah / H) : app.zoom;
  holder.style.width = W * scale + 'px';
  holder.style.height = H * scale + 'px';
  stage.style.transform = `scale(${scale})`;
  viewport.classList.toggle('scrolls', app.zoom !== 'fit' && (W * scale > aw || H * scale > ah));
  drawOverlay();
  app.onZoom?.(scale);
}

export function toStage(e) {
  const r = holder.getBoundingClientRect();
  return { x: (e.clientX - r.left) / scale, y: (e.clientY - r.top) / scale };
}
export function stageToClient(x, y) {
  const r = holder.getBoundingClientRect();
  return { x: r.left + x * scale, y: r.top + y * scale };
}
export function visibleCenter() {
  const v = viewport.getBoundingClientRect(), r = holder.getBoundingClientRect();
  const x = ((Math.max(v.left, r.left) + Math.min(v.right, r.right)) / 2 - r.left) / scale;
  const y = ((Math.max(v.top, r.top) + Math.min(v.bottom, r.bottom)) / 2 - r.top) / scale;
  return { x: Math.max(0, Math.min(W, x)), y: Math.max(0, Math.min(H, y)) };
}

// ------------------------------------------------------------------ sync --
export function resetNodes() {
  for (const { node } of nodes.values()) node.remove();
  nodes.clear();
  bgNode?.remove(); bgNode = null; bgKey = '';
}

export function sync() {
  const deck = app.deck, slide = currentSlide(), ctx = editCtx();
  stage.setAttribute('style', themeVars(deck.theme) + `;transform:scale(${scale})`);
  const bk = JSON.stringify(slide.bg) + (slide.bg.asset ? !!deck.assets[slide.bg.asset] : '');
  if (bk !== bgKey || !bgNode) {
    const t = document.createElement('template');
    t.innerHTML = renderBackground(slide, ctx);
    const n = t.content.firstElementChild;
    if (bgNode) bgNode.replaceWith(n); else stage.prepend(n);
    bgNode = n; bgKey = bk;
  }
  const seen = new Set();
  let prev = bgNode;
  for (const el of slide.elements) {
    seen.add(el.id);
    let rec = nodes.get(el.id);
    if (!rec) { rec = { node: document.createElement('div'), key: null, style: null }; rec.node.dataset.id = el.id; nodes.set(el.id, rec); }
    const { node } = rec;
    node.className = `pz-el pz-${el.type}${el.type === 'shape' ? ' pz-shape-' + el.shape : ''}${el.locked ? ' locked' : ''}`
      + `${app.interactId === el.id ? ' interacting' : ''}${app.editingId === el.id ? ' editing' : ''}`;
    const style = elementStyle(el);
    if (rec.style !== style) { node.setAttribute('style', style); rec.style = style; }
    if (app.editingId !== el.id) {
      const key = innerKey(el, ctx);
      if (rec.key !== key) { node.innerHTML = elementInner(el, ctx); rec.key = key; }
    }
    if (prev.nextSibling !== node) prev.after(node);
    prev = node;
  }
  for (const [id, rec] of nodes) if (!seen.has(id)) { rec.node.remove(); nodes.delete(id); }
  for (const id of [...app.sel]) if (!seen.has(id)) app.sel.delete(id);
  autoFitAll();
  drawOverlay();
}

// Text boxes with autoH hug their content; equations grow to fit.
function autoFitAll() {
  let changed = false;
  for (const el of currentSlide().elements) changed = autoFit(el) || changed;
  if (changed) { app.history?.amend(); app.refresh(['thumb']); }
}
function autoFit(el) {
  const rec = nodes.get(el.id);
  if (!rec) return false;
  if (el.type === 'text' && el.autoH) {
    const body = rec.node.querySelector('.pz-text-body');
    if (!body) return false;
    const need = Math.ceil(body.offsetHeight + 2 * (el.pad || 0) + 2 * (el.strokeW > 0 && el.stroke !== 'none' ? el.strokeW : 0));
    if (need > 4 && Math.abs(need - el.h) > 0.5) { el.h = need; restyle(el); return true; }
  }
  if (el.type === 'math') {
    const box = rec.node.querySelector('.pz-math-box');
    if (!box) return false;
    const nw = box.scrollWidth + 2 * (el.pad || 0) + 8, nh = box.offsetHeight + 2 * (el.pad || 0) + 8;
    let changed = false;
    if (nw > el.w + 0.5) { el.x -= (nw - el.w) / 2; el.w = nw; changed = true; }
    if (nh > el.h + 0.5) { el.y -= (nh - el.h) / 2; el.h = nh; changed = true; }
    if (changed) restyle(el);
    return changed;
  }
  return false;
}
function restyle(el) {
  const rec = nodes.get(el.id);
  if (!rec) return;
  rec.style = elementStyle(el);
  rec.node.setAttribute('style', rec.style);
}
// Fast path during drags: only geometry changes.
function restyleMany(els) { for (const el of els) restyle(el); drawOverlay(); }

// --------------------------------------------------------------- overlay --
const HANDLES = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];
const HANDLE_DIR = { nw: [-1, -1], n: [0, -1], ne: [1, -1], e: [1, 0], se: [1, 1], s: [0, 1], sw: [-1, 1], w: [-1, 0] };
const CURSORS = ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'];
function cursorFor(dir, rot) {
  const [dx, dy] = HANDLE_DIR[dir];
  const a = (Math.atan2(dy, dx) * 180 / Math.PI + rot + 360 + 22.5) % 180;
  return CURSORS[Math.floor(a / 45) % 4];
}

export function drawOverlay() {
  if (!overlay || !app.deck) return;
  overlay.textContent = '';
  const slide = currentSlide(), s = scale;
  const box = (b, cls, rot = 0) => h('div.' + cls, {
    style: { left: b.x * s + 'px', top: b.y * s + 'px', width: b.w * s + 'px', height: b.h * s + 'px', transform: rot ? `rotate(${rot}deg)` : '' },
  });
  // Build badges
  const builds = slide.elements.filter(e => e.build > 0);
  for (const el of builds) {
    const steps = buildSteps(el), b = aabb(el);
    overlay.append(h('div.build-badge', { style: { left: b.x * s + 'px', top: b.y * s + 'px' }, title: 'Appears on click' },
      steps > 1 ? `${el.build}–${el.build + steps - 1}` : String(el.build)));
  }
  if (hoverId && !app.sel.has(hoverId) && !gesture) {
    const el = findEl(hoverId);
    if (el) overlay.append(box(el, 'hover-box', el.rot));
  }
  const sel = selectedEls();
  if (sel.length === 1) {
    const el = sel[0];
    const b = box(el, 'sel-box' + (el.locked ? '.locked' : '') + (app.editingId === el.id ? '.editing' : '') + (app.interactId === el.id ? '.interact' : ''), el.rot);
    if (!el.locked && app.editingId !== el.id && app.interactId !== el.id) {
      const linear = el.type === 'shape' && (el.shape === 'line' || el.shape === 'arrow');
      for (const d of HANDLES) {
        if (linear && d !== 'e' && d !== 'w') continue;
        b.append(h('div.handle.h-' + d, { 'data-h': d, style: { cursor: cursorFor(d, el.rot) } }));
      }
      b.append(h('div.rot-stem'), h('div.rot-handle', { title: 'Rotate (Shift snaps to 15°)' }));
    }
    if (el.locked) b.append(h('div.lock-chip', null, icon('lock', 12)));
    if (app.interactId === el.id) b.append(h('div.interact-chip', null, 'Interacting — click outside to finish'));
    overlay.append(b);
  } else if (sel.length > 1) {
    for (const el of sel) overlay.append(box(el, 'sel-box.thin', el.rot));
    const g = unionBox(sel.map(aabb));
    const gb = box(g, 'group-box');
    if (!sel.some(e => e.locked)) for (const d of HANDLES) gb.append(h('div.handle.h-' + d, { 'data-h': d, style: { cursor: cursorFor(d, 0) } }));
    overlay.append(gb);
  }
  for (const gd of guides) {
    overlay.append(h('div.guide.' + gd.axis, {
      style: gd.axis === 'v' ? { left: gd.at * s + 'px', top: gd.from * s + 'px', height: (gd.to - gd.from) * s + 'px' }
        : { top: gd.at * s + 'px', left: gd.from * s + 'px', width: (gd.to - gd.from) * s + 'px' },
    }));
  }
  if (marquee) overlay.append(box(marquee, 'marquee'));
  if (app.editingId) positionTextBar();
}

// --------------------------------------------------------------- hover ----
function onHover(e) {
  if (gesture) return;
  const n = e.target.closest?.('.pz-el');
  const id = n && stage.contains(n) ? n.dataset.id : null;
  if (id !== hoverId) { hoverId = id; drawOverlay(); }
}

// -------------------------------------------------------------- pointer ---
function onPointerDown(e) {
  if (e.button !== 0) return;
  closePopover();
  const handle = e.target.closest('.handle');
  if (handle) { e.preventDefault(); return startResize(e, handle.dataset.h); }
  if (e.target.closest('.rot-handle')) { e.preventDefault(); return startRotate(e); }
  const n = e.target.closest('.pz-el');
  const id = n && stage.contains(n) ? n.dataset.id : null;
  if (app.editingId) {
    if (id === app.editingId) return;           // caret placement inside the text
    finishEditing();
  }
  if (app.interactId) {
    if (id === app.interactId) return;
    endInteract();
  }
  viewport.focus({ preventScroll: true });
  if (id) {
    const el = findEl(id);
    if (e.shiftKey || e.metaKey || e.ctrlKey) {
      const next = new Set(app.sel);
      next.has(id) ? next.delete(id) : next.add(id);
      setSelection(next);
      if (!next.has(id)) return;
    } else if (!app.sel.has(id)) setSelection([id]);
    if (el.locked) return startMarquee(e, true);
    e.preventDefault();
    startMove(e, id);
  } else {
    if (!e.shiftKey) setSelection([]);
    startMarquee(e, e.shiftKey);
  }
}

function track(onMove, onUp) {
  document.body.classList.add('gesturing');
  const move = ev => onMove(ev);
  const up = ev => {
    removeEventListener('pointermove', move);
    removeEventListener('pointerup', up);
    removeEventListener('pointercancel', up);
    document.body.classList.remove('gesturing');
    gesture = null; guides = [];
    onUp(ev);
    drawOverlay();
  };
  addEventListener('pointermove', move);
  addEventListener('pointerup', up);
  addEventListener('pointercancel', up);
}

function snapTargets(excludeIds) {
  const xs = [{ v: 0, f: 0, t: H }, { v: W / 2, f: 0, t: H }, { v: W, f: 0, t: H }];
  const ys = [{ v: 0, f: 0, t: W }, { v: H / 2, f: 0, t: W }, { v: H, f: 0, t: W }];
  for (const el of currentSlide().elements) {
    if (excludeIds.has(el.id)) continue;
    const b = aabb(el);
    for (const v of [b.x, b.x + b.w / 2, b.x + b.w]) xs.push({ v, f: b.y, t: b.y + b.h });
    for (const v of [b.y, b.y + b.h / 2, b.y + b.h]) ys.push({ v, f: b.x, t: b.x + b.w });
  }
  return { xs, ys };
}
function bestSnap(cands, targets, thr) {
  let best = null;
  for (const c of cands) for (const t of targets) {
    const d = t.v - c;
    if (Math.abs(d) <= thr && (!best || Math.abs(d) < Math.abs(best.d))) best = { d, t };
  }
  return best;
}

function startMove(e, id) {
  const start = toStage(e), sx = e.clientX, sy = e.clientY;
  let moved = false, items = null, targets = null, box0 = null;
  gesture = 'move';
  const begin = alt => {
    if (alt) duplicateSelection(0);
    items = selectedEls().filter(el => !el.locked).map(el => ({ el, x: el.x, y: el.y }));
    box0 = unionBox(items.map(i => aabb(i.el)));
    targets = snapTargets(new Set(items.map(i => i.el.id)));
  };
  track(ev => {
    if (!moved && Math.hypot(ev.clientX - sx, ev.clientY - sy) < 3) return;
    if (!moved) { moved = true; begin(ev.altKey); if (!items.length) return; }
    if (!items.length) return;
    const p = toStage(ev);
    let dx = p.x - start.x, dy = p.y - start.y;
    if (ev.shiftKey) { if (Math.abs(dx) > Math.abs(dy)) dy = 0; else dx = 0; }
    guides = [];
    if (!ev.metaKey && !ev.ctrlKey) {
      const b = { x: box0.x + dx, y: box0.y + dy, w: box0.w, h: box0.h }, thr = 7 / scale;
      const sxn = bestSnap([b.x, b.x + b.w / 2, b.x + b.w], targets.xs, thr);
      const syn = bestSnap([b.y, b.y + b.h / 2, b.y + b.h], targets.ys, thr);
      if (sxn) { dx += sxn.d; guides.push({ axis: 'v', at: sxn.t.v, from: Math.min(sxn.t.f, b.y + dy - (syn ? syn.d : 0)), to: Math.max(sxn.t.t, b.y + b.h + dy) }); }
      if (syn) { dy += syn.d; guides.push({ axis: 'h', at: syn.t.v, from: Math.min(syn.t.f, box0.x + dx), to: Math.max(syn.t.t, box0.x + box0.w + dx) }); }
    }
    for (const it of items) { it.el.x = Math.round(it.x + dx); it.el.y = Math.round(it.y + dy); }
    restyleMany(items.map(i => i.el));
    app.refresh(['geometry']);
  }, ev => {
    if (moved) { app.commit(); app.refresh(['thumb', 'inspector']); }
    else if (!ev.shiftKey && !ev.metaKey && !ev.ctrlKey && app.sel.size > 1) setSelection([id]);
  });
}

function startMarquee(e, additive) {
  const start = toStage(e), base = additive ? new Set(app.sel) : new Set();
  gesture = 'marquee';
  track(ev => {
    const p = toStage(ev);
    marquee = { x: Math.min(start.x, p.x), y: Math.min(start.y, p.y), w: Math.abs(p.x - start.x), h: Math.abs(p.y - start.y) };
    if (marquee.w * scale < 3 && marquee.h * scale < 3) return;
    const hit = currentSlide().elements.filter(el => {
      if (el.locked) return false;
      const b = aabb(el);
      return b.x < marquee.x + marquee.w && b.x + b.w > marquee.x && b.y < marquee.y + marquee.h && b.y + b.h > marquee.y;
    }).map(el => el.id);
    app.sel = new Set([...base, ...hit]);
    drawOverlay();
  }, () => { marquee = null; app.refresh(['overlay', 'inspector']); });
}

function startResize(e, dir) {
  const sel = selectedEls();
  if (!sel.length) return;
  const [hx, hy] = HANDLE_DIR[dir];
  const start = toStage(e);
  gesture = 'resize';
  if (sel.length === 1) {
    const el = sel[0], g0 = { x: el.x, y: el.y, w: el.w, h: el.h };
    const t = el.rot * Math.PI / 180, cos = Math.cos(t), sin = Math.sin(t);
    const c0 = { x: g0.x + g0.w / 2, y: g0.y + g0.h / 2 };
    const targets = snapTargets(new Set([el.id]));
    const corner = hx && hy;
    track(ev => {
      const p = toStage(ev), dx = p.x - start.x, dy = p.y - start.y;
      const lx = dx * cos + dy * sin, ly = -dx * sin + dy * cos;
      const fromCenter = ev.altKey;
      const k = fromCenter ? 2 : 1;
      let w = hx ? g0.w + hx * lx * k : g0.w;
      let hh = hy ? g0.h + hy * ly * k : g0.h;
      const keep = corner && (el.lockAspect ? !ev.shiftKey : ev.shiftKey);
      if (keep) {
        const sc = Math.max(w / g0.w, hh / g0.h);
        w = g0.w * sc; hh = g0.h * sc;
      }
      w = Math.max(8, w); hh = Math.max(el.type === 'shape' && (el.shape === 'line' || el.shape === 'arrow') ? 4 : 8, hh);
      guides = [];
      // Snap moving edges of unrotated boxes.
      if (!el.rot && !fromCenter && !ev.metaKey && !ev.ctrlKey) {
        const thr = 7 / scale;
        if (hx) {
          const edge = hx > 0 ? g0.x + w : g0.x + g0.w - w;
          const sn = bestSnap([edge], targets.xs, thr);
          if (sn) { w += hx * sn.d; guides.push({ axis: 'v', at: sn.t.v, from: 0, to: H }); if (keep) hh = g0.h * w / g0.w; }
        }
        if (hy && !(keep && hx)) {
          const edge = hy > 0 ? g0.y + hh : g0.y + g0.h - hh;
          const sn = bestSnap([edge], targets.ys, thr);
          if (sn) { hh += hy * sn.d; guides.push({ axis: 'h', at: sn.t.v, from: 0, to: W }); if (keep) w = g0.w * hh / g0.h; }
        }
      }
      // Keep the opposite edge fixed (in the rotated frame).
      let cx = c0.x, cy = c0.y;
      if (!fromCenter) {
        const ox = hx ? hx * (w - g0.w) / 2 : 0, oy = hy ? hy * (hh - g0.h) / 2 : 0;
        cx += ox * cos - oy * sin; cy += ox * sin + oy * cos;
      }
      el.w = Math.round(w); el.h = Math.round(hh);
      el.x = Math.round(cx - w / 2); el.y = Math.round(cy - hh / 2);
      if (el.type === 'text' && hy) el.autoH = false;
      if (el.type === 'shape') syncOne(el);
      restyle(el);
      if (el.type === 'text' && el.autoH) autoFit(el);
      drawOverlay();
      app.refresh(['geometry']);
    }, () => { app.commit(); app.refresh(['thumb', 'inspector']); syncOne(sel[0]); autoFit(sel[0]); drawOverlay(); });
  } else {
    const items = sel.map(el => ({ el, x: el.x, y: el.y, w: el.w, h: el.h }));
    const b0 = unionBox(sel.map(aabb));
    track(ev => {
      const p = toStage(ev), dx = p.x - start.x, dy = p.y - start.y;
      let w = hx ? b0.w + hx * dx : b0.w, hh = hy ? b0.h + hy * dy : b0.h;
      if (ev.shiftKey && hx && hy) { const sc = Math.max(w / b0.w, hh / b0.h); w = b0.w * sc; hh = b0.h * sc; }
      w = Math.max(16, w); hh = Math.max(16, hh);
      const bx = hx < 0 ? b0.x + b0.w - w : b0.x, by = hy < 0 ? b0.y + b0.h - hh : b0.y;
      const sx = w / b0.w, sy = hh / b0.h;
      for (const it of items) {
        it.el.x = Math.round(bx + (it.x - b0.x) * sx); it.el.y = Math.round(by + (it.y - b0.y) * sy);
        it.el.w = Math.max(4, Math.round(it.w * sx)); it.el.h = Math.max(4, Math.round(it.h * sy));
        if (it.el.type === 'shape') syncOne(it.el);
      }
      restyleMany(items.map(i => i.el));
      app.refresh(['geometry']);
    }, () => { app.commit(); sync(); app.refresh(['thumb', 'inspector']); });
  }
}

function startRotate(e) {
  const el = selectedEls()[0];
  if (!el) return;
  const c = { x: el.x + el.w / 2, y: el.y + el.h / 2 };
  gesture = 'rotate';
  track(ev => {
    const p = toStage(ev);
    let a = Math.atan2(p.y - c.y, p.x - c.x) * 180 / Math.PI + 90;
    if (ev.shiftKey) a = Math.round(a / 15) * 15;
    else { const m = Math.round(a / 90) * 90; if (Math.abs(a - m) < 4) a = m; }
    a = ((a + 180) % 360 + 360) % 360 - 180;
    el.rot = Math.round(a * 10) / 10;
    restyleMany([el]);
    app.refresh(['geometry']);
  }, () => { app.commit(); app.refresh(['thumb', 'inspector']); });
}

// Re-render one element's inner markup if its key changed (shapes depend on size).
function syncOne(el) {
  const rec = nodes.get(el.id);
  if (!rec) return;
  const ctx = editCtx(), key = innerKey(el, ctx);
  if (rec.key !== key && app.editingId !== el.id) { rec.node.innerHTML = elementInner(el, ctx); rec.key = key; }
}

// ------------------------------------------------------------ dblclick ----
function onDoubleClick(e) {
  const n = e.target.closest('.pz-el');
  if (!n || !stage.contains(n)) return;
  const el = findEl(n.dataset.id);
  if (!el || el.locked) return;
  openElement(el, e);
}
export function openElement(el, e) {
  if (el.type === 'text') startEditing(el.id, e ? { x: e.clientX, y: e.clientY } : null);
  else if (el.type === 'math') openMathEditor(el);
  else if (el.type === 'image') app.onReplaceImage?.(el);
  else if (el.type === 'embed' || el.type === 'applet') {
    if (el.type === 'embed' && !el.src) { app.tab = 'format'; app.refresh(['inspector']); app.focusInspector?.('src'); return; }
    startInteract(el.id);
  }
}

export function startInteract(id) {
  app.interactId = id;
  app.sel = new Set([id]);
  sync();
  app.refresh(['inspector']);
}
export function endInteract() {
  if (!app.interactId) return;
  app.interactId = null;
  sync();
}

// ----------------------------------------------------------- text edit ----
export function startEditing(id, at = null, selectAll = false) {
  const el = findEl(id);
  if (!el || el.type !== 'text' || el.locked) return;
  if (app.interactId) endInteract();
  app.editingId = id;
  app.sel = new Set([id]);
  sync();
  const rec = nodes.get(id);
  const body = rec.node.querySelector('.pz-text-body');
  body.classList.remove('pz-ph');
  const empty = htmlIsEmpty(el.html);
  body.innerHTML = empty ? '<p><br></p>' : sanitizeHTML(el.html);
  body.contentEditable = 'true';
  body.spellcheck = true;
  rec.key = null;
  document.execCommand('defaultParagraphSeparator', false, 'p');
  body.focus({ preventScroll: true });
  const sel = getSelection();
  let range = null;
  if (at && !empty && !selectAll) {
    range = document.caretRangeFromPoint?.(at.x, at.y);
    if (!range && document.caretPositionFromPoint) {
      const p = document.caretPositionFromPoint(at.x, at.y);
      if (p) { range = document.createRange(); range.setStart(p.offsetNode, p.offset); }
    }
    if (range && !body.contains(range.startContainer)) range = null;
  }
  if (!range) {
    range = document.createRange();
    range.selectNodeContents(body);
    if (!selectAll && !empty) range.collapse(false);
  }
  sel.removeAllRanges(); sel.addRange(range);
  body.oninput = () => onTextInput(el, body);
  body.onpaste = onTextPaste;
  body.onkeydown = ev => onTextKey(ev, body);
  textBar.classList.add('show');
  app.refresh(['overlay', 'inspector']);
}

function onTextInput(el, body) {
  el.html = body.innerHTML;
  if (el.autoH) autoFit(el);
  drawOverlay();
  app.refresh(['thumbSoon', 'geometry']);
  app.liveChange?.();
}
function onTextPaste(e) {
  e.preventDefault();
  const text = e.clipboardData.getData('text/plain');
  if (!text) return;
  const html = text.split(/\r?\n/).map(l => l.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))).join('<br>');
  document.execCommand('insertHTML', false, html);
}
function onTextKey(e, body) {
  if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); finishEditing(); return; }
  if (e.key === 'Tab') {
    e.preventDefault();
    const inList = getSelection().anchorNode?.parentElement?.closest('li');
    if (inList) document.execCommand(e.shiftKey ? 'outdent' : 'indent');
    else document.execCommand('insertText', false, ' ');
  }
  const mod = e.metaKey || e.ctrlKey;
  if (mod && e.key.toLowerCase() === 'm' && e.shiftKey) { e.preventDefault(); wrapMath(); }
  if (mod && e.key.toLowerCase() === 'k') { e.preventDefault(); insertLink(); }
}

export function finishEditing() {
  const id = app.editingId;
  if (!id) return;
  const rec = nodes.get(id), el = findEl(id);
  app.editingId = null;
  textBar.classList.remove('show');
  closePopover();
  if (!rec || !el) { app.refresh(['canvas']); return; }
  const body = rec.node.querySelector('.pz-text-body');
  const html = sanitizeHTML(body.innerHTML);
  body.contentEditable = 'false';
  body.oninput = body.onpaste = body.onkeydown = null;
  getSelection().removeAllRanges();
  if (htmlIsEmpty(html) && !el.placeholder) {
    const s = currentSlide();
    s.elements = s.elements.filter(x => x.id !== id);
    app.sel.delete(id);
  } else el.html = htmlIsEmpty(html) ? '' : html;
  rec.key = null;
  app.commit('text:' + id);
  app.refresh(['canvas', 'thumb', 'inspector']);
}

// Theme-token colors can't go through execCommand, so apply sentinel colors
// and then rewrite them to var(--pz-*).
const SENTINEL = Object.fromEntries(COLOR_TOKENS.map((t, i) => [t, `#0102${(i + 16).toString(16)}`]));
function rgbOf(hex) { const n = parseInt(hex.slice(1), 16); return `rgb(${n >> 16 & 255}, ${n >> 8 & 255}, ${n & 255})`; }
function editingBody() { return app.editingId ? nodes.get(app.editingId)?.node.querySelector('.pz-text-body') : null; }
// Remember the selection inside the text being edited, so controls that take
// focus (the hex field, popovers) can put it back before formatting.
let savedRange = null;
document.addEventListener('selectionchange', () => {
  const body = editingBody(), sel = getSelection();
  if (body && sel.rangeCount && body.contains(sel.anchorNode)) savedRange = sel.getRangeAt(0).cloneRange();
});
function restoreSelection(body) {
  body.focus({ preventScroll: true });
  if (savedRange && body.contains(savedRange.startContainer)) { const sel = getSelection(); sel.removeAllRanges(); sel.addRange(savedRange); }
}

function applyColor(value, prop = 'foreColor') {
  const body = editingBody();
  if (!body) return;
  restoreSelection(body);
  document.execCommand('styleWithCSS', false, true);
  const token = COLOR_TOKENS.includes(value);
  document.execCommand(prop, false, token ? SENTINEL[value] : value);
  if (token) {
    const rgb = rgbOf(SENTINEL[value]), cssProp = prop === 'foreColor' ? 'color' : 'background-color';
    body.querySelectorAll('[style]').forEach(n => {
      if (n.style[cssProp === 'color' ? 'color' : 'backgroundColor'] === rgb) n.style.setProperty(cssProp, prop === 'foreColor' ? `var(--pz-${value})` : `color-mix(in srgb, var(--pz-${value}) 38%, transparent)`);
    });
    body.querySelectorAll(`font[color="${SENTINEL[value]}"]`).forEach(f => { f.removeAttribute('color'); f.style.color = `var(--pz-${value})`; });
  }
  body.dispatchEvent(new Event('input'));
}
function wrapMath() {
  const body = editingBody();
  if (!body) return;
  const sel = getSelection(), text = sel.toString();
  document.execCommand('insertText', false, '$' + (text || 'x') + '$');
  if (!text) { // select the placeholder x
    const r = sel.getRangeAt(0), n = r.startContainer;
    if (n.nodeType === 3 && r.startOffset >= 2) { const rr = document.createRange(); rr.setStart(n, r.startOffset - 2); rr.setEnd(n, r.startOffset - 1); sel.removeAllRanges(); sel.addRange(rr); }
  }
}
function insertLink() {
  const url = prompt('Link address', 'https://');
  if (url && url !== 'https://') { editingBody()?.focus(); document.execCommand('createLink', false, url); editingBody()?.dispatchEvent(new Event('input')); }
}

function buildTextBar() {
  const cmd = (name, ic, label, run) => h('button.tb-btn', {
    type: 'button', title: label, 'aria-label': label,
    onmousedown: e => e.preventDefault(),
    onclick: () => { const b = editingBody(); if (!b) return; restoreSelection(b); run(); b.dispatchEvent(new Event('input')); },
  }, typeof ic === 'string' ? icon(ic, 16) : ic);
  const exec = c => () => document.execCommand(c);
  const colorBtn = h('button.tb-btn.tb-color', { type: 'button', title: 'Text color', 'aria-label': 'Text color', onmousedown: e => e.preventDefault() }, h('span.tb-a', null, 'A'), h('span.tb-bar'));
  colorBtn.addEventListener('click', () => {
    const theme = app.deck.theme;
    popover(colorBtn, h('div.pop-pad', null,
      h('div.pop-label', null, 'Text color'),
      colorControl(null, theme, v => { if (v !== 'none') applyColor(v); }),
      h('div.pop-label', null, 'Highlight'),
      h('div.swatches', null,
        ...['accent', 'accent2', 'muted'].map(t => h('button.swatch', { type: 'button', title: COLOR_LABELS[t], style: { background: `color-mix(in srgb, ${theme.colors[t]} 38%, transparent)` }, onclick: () => applyColor(t, 'hiliteColor') })),
        h('button.swatch.none', { type: 'button', title: 'No highlight', onclick: () => applyColor('transparent', 'hiliteColor') })),
    ));
    document.querySelectorAll('.popover button').forEach(b => b.addEventListener('mousedown', e => e.preventDefault()));
  });
  return h('div', { id: 'text-bar', role: 'toolbar', 'aria-label': 'Text formatting', onmousedown: e => { if (e.target.tagName !== 'INPUT') e.preventDefault(); } },
    cmd('b', 'bold', 'Bold (⌘B)', exec('bold')),
    cmd('i', 'italic', 'Italic (⌘I)', exec('italic')),
    cmd('u', 'underline', 'Underline (⌘U)', exec('underline')),
    cmd('s', 'strike', 'Strikethrough', exec('strikeThrough')),
    h('span.tb-sep'),
    cmd('sup', 'sup', 'Superscript', exec('superscript')),
    cmd('sub', 'sub', 'Subscript', exec('subscript')),
    h('span.tb-sep'),
    cmd('ul', 'ul', 'Bulleted list', exec('insertUnorderedList')),
    cmd('ol', 'ol', 'Numbered list', exec('insertOrderedList')),
    h('span.tb-sep'),
    colorBtn,
    cmd('math', h('span.tb-tex', null, '$x$'), 'Inline math (⇧⌘M)', wrapMath),
    cmd('code', 'code', 'Code', () => {
      const t = getSelection().toString();
      if (t) document.execCommand('insertHTML', false, `<code>${t.replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))}</code>&#8203;`);
    }),
    cmd('link', 'link', 'Link (⌘K)', insertLink),
    cmd('clear', 'eraser', 'Clear formatting', () => { document.execCommand('removeFormat'); document.execCommand('unlink'); }),
    h('span.tb-hint', null, 'Esc to finish'),
  );
}
function positionTextBar() {
  const el = findEl(app.editingId);
  if (!el) return;
  const b = aabb(el), top = stageToClient(b.x, b.y), bottom = stageToClient(b.x, b.y + b.h);
  const bw = textBar.offsetWidth || 520, bh = textBar.offsetHeight || 40;
  let y = top.y - bh - 12;
  if (y < 60) y = bottom.y + 12;
  const x = Math.max(8, Math.min(innerWidth - bw - 8, top.x));
  textBar.style.left = x + 'px';
  textBar.style.top = Math.min(innerHeight - bh - 8, y) + 'px';
}

// ---------------------------------------------------------- math editor ---
export function openMathEditor(el) {
  const anchor = overlay.querySelector('.sel-box') || holder;
  const preview = h('div.math-preview');
  const ta = h('textarea.code.math-src', { rows: 4, spellcheck: false, value: el.tex });
  ta.value = el.tex;
  const render = () => { preview.innerHTML = renderTeX(ta.value || '\\square', true, editCtx().macros, editCtx().macroKey); };
  ta.addEventListener('input', () => {
    el.tex = ta.value; render(); syncOne(el); autoFit(el); drawOverlay(); app.refresh(['thumbSoon', 'geometry']); app.liveChange?.();
    const mirror = document.querySelector('.inspector [data-focus="tex"]');
    if (mirror) mirror.value = ta.value;
  });
  ta.addEventListener('keydown', e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) { e.preventDefault(); closePopover(); } e.stopPropagation(); });
  render();
  popover(anchor, h('div.pop-pad.math-pop', null,
    h('div.pop-label', null, 'LaTeX', h('span.pop-hint', null, 'deck macros apply · ⌘⏎ to close')), ta, preview),
  { onclose: () => { app.commit('tex:' + el.id); app.refresh(['thumb', 'inspector']); } });
  setTimeout(() => { ta.focus(); ta.select(); }, 20);
}

// --------------------------------------------------------- context menu ---
function onContextMenu(e) {
  const n = e.target.closest('.pz-el');
  const id = n && stage.contains(n) ? n.dataset.id : null;
  if (app.editingId && id === app.editingId) return;   // native menu (spellcheck)
  e.preventDefault();
  if (id && !app.sel.has(id)) setSelection([id]);
  if (!id) setSelection([]);
  app.onContextMenu?.(e, id ? findEl(id) : null, toStage(e));
}

// ------------------------------------------------------------- helpers ----
export function duplicateSelection(offset = 32) {
  const slide = currentSlide();
  const sel = selectedEls();
  if (!sel.length) return [];
  const copies = sel.map(el => ({ ...clone(el), id: uid('e'), x: el.x + offset, y: el.y + offset }));
  const top = Math.max(...sel.map(el => slide.elements.indexOf(el)));
  slide.elements.splice(top + 1, 0, ...copies);
  app.sel = new Set(copies.map(c => c.id));
  sync();
  return copies;
}

export function nodeFor(id) { return nodes.get(id)?.node; }
export function viewportEl() { return viewport; }
