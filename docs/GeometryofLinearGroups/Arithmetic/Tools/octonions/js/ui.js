// Small UI helpers: SVG construction, tooltip, draggable chips, and the product-of-chains
// ("box") renderer shared by the octavian box view and the G₂ paths view.

export const NS = "http://www.w3.org/2000/svg";
import { svgTex } from "./tex.js";
export function svgEl(tag, attrs = {}, parent) {
  const e = document.createElementNS(NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) e.setAttribute(k, v);
  if (parent) parent.appendChild(e);
  return e;
}
export function el(tag, attrs = {}, ...kids) {
  const e = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (k === "class") e.className = v;
    else if (k === "html") e.innerHTML = v;
    else if (k.startsWith("on")) e.addEventListener(k.slice(2), v);
    else if (v !== undefined && v !== null && v !== false) e.setAttribute(k, v);
  }
  for (const k of kids) if (k !== null && k !== undefined) e.append(k);
  return e;
}
export const clear = (node) => { while (node.firstChild) node.removeChild(node.firstChild); };
export const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]));

// Distinct colors for primes / step kinds (CSS variables --p0 … --p7).
export const colorVar = (i) => `var(--p${((i % 8) + 8) % 8})`;

// Superscripts and products for display.
const SUP = { 0: "⁰", 1: "¹", 2: "²", 3: "³", 4: "⁴", 5: "⁵", 6: "⁶", 7: "⁷", 8: "⁸", 9: "⁹" };
export const sup = (n) => String(n).split("").map((c) => SUP[c] || c).join("");
export function fmtFactored(pairs) {
  if (!pairs.length) return "1";
  return pairs.map(([p, e]) => (e > 1 ? p + sup(e) : String(p))).join("·");
}
export function fmtBig(n) {
  const s = n.toString();
  if (s.length <= 15) return s.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return s.slice(0, 4) + "…" + " (" + s.length + " digits)";
}

// ---------------------------------------------------------------------------------------
// Tooltip

let tipEl = null;
export function tip(html, ev) {
  if (!tipEl) tipEl = document.getElementById("tip");
  if (!html) { tipEl.hidden = true; return; }
  tipEl.innerHTML = html;
  tipEl.hidden = false;
  const pad = 14, w = tipEl.offsetWidth, h = tipEl.offsetHeight;
  let x = ev.clientX + pad, y = ev.clientY + pad;
  if (x + w > window.innerWidth - 8) x = ev.clientX - w - pad;
  if (y + h > window.innerHeight - 8) y = ev.clientY - h - pad;
  tipEl.style.left = Math.max(4, x) + "px";
  tipEl.style.top = Math.max(4, y) + "px";
}

// ---------------------------------------------------------------------------------------
// Draggable chips.  items: [{label, sub, color}], onReorder(newOrderOfIndices)

export function renderChips(container, items, onReorder) {
  clear(container);
  const chips = items.map((it, i) => {
    const c = el("span", { class: "chip", tabindex: "0", role: "button", "aria-label": it.aria || it.label, style: `color:${it.color}` });
    if (it.html) c.innerHTML = it.html; else c.append(it.label);
    if (it.sub) c.append(el("span", { class: "sub" }, it.sub));
    c.dataset.i = i;
    container.appendChild(c);
    return c;
  });
  const order = items.map((_, i) => i);
  const commit = (newOrder) => onReorder(newOrder);
  chips.forEach((c, i) => {
    c.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowLeft" && e.key !== "ArrowRight") return;
      e.preventDefault();
      const j = i + (e.key === "ArrowLeft" ? -1 : 1);
      if (j < 0 || j >= items.length) return;
      const o = order.slice();
      [o[i], o[j]] = [o[j], o[i]];
      commit(o);
      requestAnimationFrame(() => { const nc = container.children[j]; if (nc) nc.focus(); });
    });
    c.addEventListener("pointerdown", (e) => {
      if (e.button !== 0) return;
      e.preventDefault();
      const startX = e.clientX, startY = e.clientY;
      let ghost = null, target = i;
      const rects = chips.map((x) => x.getBoundingClientRect());
      const move = (ev) => {
        if (!ghost && Math.hypot(ev.clientX - startX, ev.clientY - startY) < 4) return;
        if (!ghost) {
          ghost = c.cloneNode(true);
          ghost.classList.add("ghost");
          document.body.appendChild(ghost);
          c.classList.add("dragging");
        }
        ghost.style.left = ev.clientX - rects[i].width / 2 + "px";
        ghost.style.top = ev.clientY - rects[i].height / 2 + "px";
        // insertion index = number of chip centres before the pointer (reading order)
        let t = 0;
        for (let k = 0; k < rects.length; k++) {
          if (k === i) continue;
          const r = rects[k], cx = r.left + r.width / 2;
          if (ev.clientY > r.bottom || (ev.clientY >= r.top - 4 && ev.clientX > cx)) t++;
        }
        target = t;
      };
      const up = () => {
        window.removeEventListener("pointermove", move);
        window.removeEventListener("pointerup", up);
        if (ghost) {
          ghost.remove();
          c.classList.remove("dragging");
          if (target !== i) {
            const o = order.slice();
            const [x] = o.splice(i, 1);
            o.splice(target, 0, x);
            commit(o);
          }
        }
      };
      window.addEventListener("pointermove", move);
      window.addEventListener("pointerup", up);
    });
  });
}

// ---------------------------------------------------------------------------------------
// Product-of-chains renderer.
//   axes:    [{ len, color, label }]      (one chain [0, len] per axis)
//   path:    [axisIndex, …]                 the staircase, one step per entry
//   marks:   Map key(expVector) → [{ shape: "circle"|"square", on: bool, info }]
//   opts:    { nodeInfo(exp) → html, onClick(exp), stepLabel(j) → string, width }

export const expKey = (v) => v.join(",");

export function renderBox(svg, axes, path, marks = new Map(), opts = {}) {
  clear(svg);
  const r = axes.length;
  const W = opts.width || 640;
  if (!r) { svgTex(svg, 20, 30, "N(\\alpha) = 1", { anchor: "start", size: 13 }); svg.setAttribute("viewBox", `0 0 ${W} 60`); return; }
  // directions spread over the upper half plane
  const dirs = axes.map((_, i) => {
    const th = r === 1 ? Math.PI / 2 : (Math.PI * (165 - (150 * i) / (r - 1))) / 180;
    return [Math.cos(th), -Math.sin(th)];
  });
  // enumerate exponent vectors (cap the drawing size)
  const total = axes.reduce((s, a) => s * (a.len + 1), 1);
  const drawAll = total <= 700;
  const pts = [];
  const rec = (i, v) => {
    if (i === r) { pts.push(v.slice()); return; }
    for (let e = 0; e <= axes[i].len; e++) { v[i] = e; rec(i + 1, v); }
  };
  const pathPts = [new Array(r).fill(0)];
  for (const a of path) { const v = pathPts[pathPts.length - 1].slice(); v[a]++; pathPts.push(v); }
  if (drawAll) rec(0, new Array(r).fill(0)); else pts.push(...pathPts);
  // geometry with unit step 1, then fit
  const raw = (v) => {
    let x = 0, y = 0;
    for (let i = 0; i < r; i++) { x += v[i] * dirs[i][0]; y += v[i] * dirs[i][1]; }
    return [x, y];
  };
  let xs = pts.map((v) => raw(v)[0]), ys = pts.map((v) => raw(v)[1]);
  const minX = Math.min(...xs), maxX = Math.max(...xs), minY = Math.min(...ys), maxY = Math.max(...ys);
  const pad = 46;
  const spanX = Math.max(maxX - minX, 1e-6), spanY = Math.max(maxY - minY, 1e-6);
  const s = Math.min((W - 2 * pad) / spanX, opts.maxStep || 150, (opts.maxHeight || 520) / spanY);
  const H = Math.max(spanY * s + 2 * pad + 24, 140);
  const offX = (W - spanX * s) / 2 - minX * s;
  const offY = pad - minY * s;
  const P = (v) => { const [x, y] = raw(v); return [x * s + offX, y * s + offY]; };
  svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
  const onPath = new Set(pathPts.map(expKey));
  // edges
  const gE = svgEl("g", {}, svg);
  if (drawAll) for (const v of pts) for (let i = 0; i < r; i++) if (v[i] < axes[i].len) {
    const w = v.slice(); w[i]++;
    const [x1, y1] = P(v), [x2, y2] = P(w);
    svgEl("line", { x1, y1, x2, y2, class: "edge" }, gE);
  }
  // path
  const gP = svgEl("g", {}, svg);
  for (let j = 0; j < path.length; j++) {
    const [x1, y1] = P(pathPts[j]), [x2, y2] = P(pathPts[j + 1]);
    svgEl("line", { x1, y1, x2, y2, stroke: axes[path[j]].color, "stroke-width": 4, "stroke-linecap": "round" }, gP);
    if (opts.stepLabel) {
      // label beside the edge, offset perpendicular to it (towards the upper side)
      const L = Math.hypot(x2 - x1, y2 - y1) || 1;
      let nx = (y2 - y1) / L, ny = -(x2 - x1) / L;
      if (ny > 0 || (Math.abs(ny) < 1e-6 && nx < 0)) { nx = -nx; ny = -ny; }
      svgTex(gP, (x1 + x2) / 2 + nx * 12, (y1 + y2) / 2 + ny * 12, opts.stepLabel(j), { size: 11, w: 60, color: "var(--ink-soft)" });
    }
  }
  // nodes
  const gN = svgEl("g", {}, svg);
  for (const v of pts) {
    const [x, y] = P(v);
    const k = expKey(v);
    const g = svgEl("g", { class: "hover-target" }, gN);
    svgEl("circle", { cx: x, cy: y, r: onPath.has(k) ? 5 : 3.5, class: "node" + (onPath.has(k) ? " on-path" : "") }, g);
    svgEl("circle", { cx: x, cy: y, r: 11, fill: "transparent" }, g);
    const mk = marks.get(k) || [];
    mk.forEach((m) => {
      const dx = m.shape === "circle" ? -13 : 13;
      const fill = m.on ? "var(--ink)" : "var(--sheet)";
      if (m.shape === "circle") svgEl("circle", { cx: x + dx, cy: y, r: 5.5, fill, stroke: "var(--ink)", "stroke-width": 1.6 }, g);
      else svgEl("rect", { x: x + dx - 5, y: y - 5, width: 10, height: 10, fill, stroke: "var(--ink)", "stroke-width": 1.6 }, g);
    });
    if (opts.nodeLabel) {
      const lab = opts.nodeLabel(v);
      if (lab) svgTex(g, x + 21, y - 15, lab, { anchor: "start", size: 11, w: 120, color: onPath.has(k) ? "var(--ink)" : "var(--ink-soft)" });
    }
    if (opts.nodeInfo) {
      g.addEventListener("pointerenter", (e) => tip(opts.nodeInfo(v), e));
      g.addEventListener("pointermove", (e) => tip(opts.nodeInfo(v), e));
      g.addEventListener("pointerleave", () => tip(null));
    }
    if (opts.onClick) g.addEventListener("click", () => opts.onClick(v));
  }
  // axis legend: a short arrow per axis below the origin
  const [ox, oy] = P(new Array(r).fill(0));
  axes.forEach((a, i) => {
    const lx = ox + (i - (r - 1) / 2) * 88, ly = oy + 32;
    svgEl("line", { x1: lx - 14 - dirs[i][0] * 7, y1: ly - dirs[i][1] * 7, x2: lx - 14 + dirs[i][0] * 7, y2: ly + dirs[i][1] * 7, stroke: a.color, "stroke-width": 3, "stroke-linecap": "round" }, svg);
    svgTex(svg, lx - 2, ly, a.label, { anchor: "start", size: 11.5, w: 90, color: a.color });
  });
  return { P, pathPts };
}
