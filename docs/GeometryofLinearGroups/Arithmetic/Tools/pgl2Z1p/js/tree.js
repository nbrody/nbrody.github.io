// The Bruhat–Tits tree T_{p+1} in the upper-half-plane model (thesis, Figs. 2.1–2.2):
// ∞ at the top, level n increasing downward, the children ⌊q + j pⁿ⌋_{n+1} of ⌊q⌋_n ordered by j.
// Layout is combinatorial (leaf-count widths) and edges are straight on purpose.

import { TexLayer, vertexTeX, tex } from "./tex.js";

const SVGNS = "http://www.w3.org/2000/svg";

export function el(tag, attrs = {}, parent = null, text = null) {
  const e = document.createElementNS(SVGNS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== null && v !== undefined) e.setAttribute(k, v);
  if (text !== null) e.textContent = text;
  if (parent) parent.appendChild(e);
  return e;
}

// Build the drawn subtree. expand(v, depth) decides whether v's children are drawn;
// keepChild(c) can drop some of them (e.g. children outside a ball).
export function buildTree(root, expand, { maxNodes = 1600, keepChild = null } = {}) {
  const p = root.p;
  const rootNode = { v: root, key: root.key, depth: 0, parent: null, children: [], expanded: false };
  const nodes = new Map([[rootNode.key, rootNode]]);
  const queue = [rootNode];
  while (queue.length) {
    const node = queue.shift();
    if (nodes.size + p > maxNodes || !expand(node.v, node.depth)) continue;
    node.expanded = true;
    for (const c of node.v.children()) {
      if (keepChild && !keepChild(c)) continue;
      const cn = { v: c, key: c.key, depth: node.depth + 1, parent: node, children: [], expanded: false };
      node.children.push(cn);
      nodes.set(cn.key, cn);
      queue.push(cn);
    }
  }
  // leaf-count weights → horizontal intervals in [0, 1]
  (function weigh(n) {
    n.weight = n.children.length ? n.children.reduce((s, c) => s + weigh(c), 0) : 1;
    return n.weight;
  })(rootNode);
  (function place(n, x0, x1) {
    n.x0 = x0; n.x1 = x1; n.x = (x0 + x1) / 2;
    let a = x0;
    for (const c of n.children) {
      const w = (x1 - x0) * (c.weight / n.weight);
      place(c, a, a + w);
      a += w;
    }
  })(rootNode, 0, 1);
  let maxDepth = 0;
  for (const n of nodes.values()) maxDepth = Math.max(maxDepth, n.depth);
  return { root: rootNode, nodes, maxDepth, p };
}

export class TreeView {
  constructor(svg, { onSelect = null, onHover = null, height = 380, showLevels = true } = {}) {
    this.svg = svg;
    this.onSelect = onSelect;
    this.onHover = onHover;
    this.height = height;
    this.showLevels = showLevels;
    this.pos = new Map();
    // labels are KaTeX in HTML layers laid over the SVG (same pixel coordinates)
    const host = document.createElement("div");
    host.className = "fig-host";
    svg.parentNode.insertBefore(host, svg);
    host.appendChild(svg);
    this.labels = new TexLayer(host);
    this.over = new TexLayer(host);
    this.tip = document.createElement("div");
    this.tip.className = "tex-tip";
    this.tip.hidden = true;
    host.appendChild(this.tip);
  }

  // opts: { labelPriority(node) → number|null (higher first, null = no label), labelClass(node),
  //         vertexClass(node) → string, vertexFill(node) → colour|null, vertexRadius(node), stubs: bool }
  render(tree, opts = {}) {
    const svg = this.svg;
    const W = Math.max(280, svg.clientWidth || svg.parentNode.clientWidth || 600);
    const H = this.height;
    svg.setAttribute("viewBox", `0 0 ${W} ${H}`);
    svg.setAttribute("height", H);
    svg.replaceChildren();
    this.labels.clear(); this.over.clear();
    this.W = W; this.H = H;
    const left = this.showLevels ? 58 : 16, right = 16, top = 38, bottom = 30;
    const levels = tree.maxDepth + 1;
    const rowH = Math.min(78, (H - top - bottom) / Math.max(1, levels - 1 + (opts.stubs === false ? 0 : 0.45)));
    this.rowH = rowH;
    const X = (u) => left + u * (W - left - right);
    const Y = (depth) => top + depth * rowH;
    this.pos.clear();
    for (const n of tree.nodes.values()) this.pos.set(n.key, { x: X(n.x), y: Y(n.depth), node: n });

    const gLevels = el("g", { class: "tv-levels" }, svg);
    const gEdges = el("g", { class: "tv-edges" }, svg);
    this.gUnder = el("g", { class: "tv-under" }, svg);
    const gVerts = el("g", { class: "tv-verts" }, svg);
    this.gOver = el("g", { class: "tv-over" }, svg);

    // level rules, labelled n = …
    const rootLevel = tree.root.v.n;
    if (this.showLevels) {
      for (let d = 0; d <= tree.maxDepth; d++) {
        el("line", { x1: left - 6, x2: W - right, y1: Y(d), y2: Y(d), class: "tv-rule" }, gLevels);
        this.labels.add(`n=${rootLevel + d}`, 4, Y(d), { anchor: "start", cls: "tv-level-label" });
      }
    }
    // to ∞
    const r0 = this.pos.get(tree.root.key);
    el("line", { x1: r0.x, y1: r0.y, x2: r0.x, y2: top - 22, class: "tv-edge tv-to-inf" }, gEdges);
    this.labels.add("\\infty", r0.x, top - 24, { baseline: "bottom", cls: "tv-inf" });

    for (const n of tree.nodes.values()) {
      const a = this.pos.get(n.key);
      for (const c of n.children) {
        const b = this.pos.get(c.key);
        el("line", { x1: a.x, y1: a.y, x2: b.x, y2: b.y, class: "tv-edge" }, gEdges);
      }
      if (!n.expanded && opts.stubs !== false) {
        // a little fan standing for the p unseen children
        const p = tree.p, span = Math.min((n.x1 - n.x0) * (W - left - right) * 0.8, 26), len = rowH * 0.32;
        for (let j = 0; j < p; j++) {
          const dx = p === 1 ? 0 : (j / (p - 1) - 0.5) * span;
          el("line", { x1: a.x, y1: a.y, x2: a.x + dx, y2: a.y + len, class: "tv-stub" }, gEdges);
        }
      }
    }

    // vertices (hover shows ⌊q⌋_n in KaTeX)
    for (const n of tree.nodes.values()) {
      const a = this.pos.get(n.key);
      const cls = "tv-vertex " + (opts.vertexClass ? opts.vertexClass(n) : "");
      const g = el("g", { class: "tv-vgroup", "data-key": n.key }, gVerts);
      const fill = opts.vertexFill ? opts.vertexFill(n) : null;
      // shrink vertices where siblings are packed tightly
      const room = (n.x1 - n.x0) * (W - left - right);
      const r = Math.min(opts.vertexRadius ? opts.vertexRadius(n) : 3.6, Math.max(1.3, room / 2.6));
      el("circle", { cx: a.x, cy: a.y, r, class: cls, style: fill ? `fill:${fill}` : null }, g);
      const hit = el("circle", { cx: a.x, cy: a.y, r: Math.max(4, Math.min(11, room / 2)), class: "tv-hit" + (this.onSelect ? " is-clickable" : "") }, g);
      if (this.onSelect) hit.addEventListener("click", () => this.onSelect(n.v));
      hit.addEventListener("pointerenter", () => { this.#showTip(n.v, a); this.onHover?.(n.v); });
      hit.addEventListener("pointerleave", () => { this.tip.hidden = true; this.onHover?.(null); });
    }

    // vertex labels: greedy, measured, never overlapping
    if (opts.labelPriority) {
      const cands = [];
      for (const n of tree.nodes.values()) {
        const pri = opts.labelPriority(n);
        if (pri === null || pri === undefined) continue;
        const a = this.pos.get(n.key);
        cands.push({
          src: vertexTeX(n.v), x: a.x, y: a.y, pri,
          cls: "tv-label " + (opts.labelClass ? opts.labelClass(n) : ""),
          tries: [{ dx: 7, dy: -3, anchor: "start", baseline: "bottom" }, { dx: -7, dy: -3, anchor: "end", baseline: "bottom" }],
        });
      }
      this.labels.place(cands, { bounds: { x0: 0, x1: W } });
    }
    return this.pos;
  }

  #showTip(v, a) {
    this.tip.innerHTML = tex(vertexTeX(v));
    this.tip.style.left = a.x + "px"; this.tip.style.top = a.y + "px";
    this.tip.hidden = false;
  }

  // overlay (drawn above everything): SVG marks in gUnder/gOver, TeX labels in this.over
  clearOverlay() { this.gOver?.replaceChildren(); this.gUnder?.replaceChildren(); this.over.clear(); }
  at(key) { return this.pos.get(key); }
}
