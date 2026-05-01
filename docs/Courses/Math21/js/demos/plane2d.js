/* =============================================================
   Math 21 — Plane2D
   Shared SVG-based 2D coordinate system for demos.
   - World coords (math) ↔ screen coords (SVG)
   - Grid + axes
   - Draggable handles with snap-to-grid
   - Reactive: subscribers re-render on state change
   ============================================================= */

(function () {
  "use strict";

  const SVG_NS = "http://www.w3.org/2000/svg";

  function create(tag, attrs = {}, parent = null) {
    const el = document.createElementNS(SVG_NS, tag);
    for (const k in attrs) {
      if (attrs[k] != null) el.setAttribute(k, attrs[k]);
    }
    if (parent) parent.appendChild(el);
    return el;
  }

  /**
   * Plane2D
   * @param {Object} opts
   * @param {number} opts.width        SVG width in CSS pixels (also viewBox width)
   * @param {number} opts.height       SVG height in CSS pixels
   * @param {number} [opts.range=5]    World extent; axes go from -range to +range
   * @param {boolean}[opts.grid=true]
   * @param {boolean}[opts.axes=true]
   * @param {boolean}[opts.snap=false] Snap drag handles to integer world coords
   */
  class Plane2D {
    constructor(opts = {}) {
      const W = opts.width  || 480;
      const H = opts.height || 360;
      const range = opts.range != null ? opts.range : 5;

      this.W = W;
      this.H = H;
      this.range = range;
      // Pixels per world unit (uniform in x and y)
      this.scale = Math.min(W, H) / (2 * range);
      this.cx = W / 2;
      this.cy = H / 2;
      this.snap = !!opts.snap;

      this.svg = create("svg", {
        viewBox: `0 0 ${W} ${H}`,
        class: "plane2d",
        preserveAspectRatio: "xMidYMid meet"
      });
      // Allow the SVG to scale responsively
      this.svg.style.width = "100%";
      this.svg.style.height = "auto";
      this.svg.style.maxWidth = `${W}px`;
      this.svg.style.display = "block";

      // Layers — order matters
      this.layers = {
        grid:    create("g", { class: "p-grid" }, this.svg),
        axes:    create("g", { class: "p-axes" }, this.svg),
        shapes:  create("g", { class: "p-shapes" }, this.svg),
        vectors: create("g", { class: "p-vectors" }, this.svg),
        labels:  create("g", { class: "p-labels" }, this.svg),
        handles: create("g", { class: "p-handles" }, this.svg)
      };

      // Arrow marker (shared across vectors)
      const defs = create("defs", {}, this.svg);
      const arrowFor = (id, color, size = 7) => {
        const m = create("marker", {
          id, viewBox: "0 0 10 10",
          refX: 8, refY: 5,
          markerWidth: size, markerHeight: size,
          orient: "auto-start-reverse"
        }, defs);
        create("path", {
          d: "M 0 0 L 10 5 L 0 10 z",
          fill: color
        }, m);
      };
      arrowFor(`p-arrow-accent-${this._uid()}`, "var(--accent)");
      // Use a stable reference id below
      this.arrowIds = {};
      // Build a few standard arrows
      [
        ["accent", "var(--accent, #7a1f2b)"],
        ["link",   "var(--link, #2a4a7f)"],
        ["green",  "#4a7a3f"],
        ["mute",   "var(--ink-mute, #837e72)"]
      ].forEach(([name, color]) => {
        const id = `p-arrow-${name}-${this._idSeed++}`;
        const m = create("marker", {
          id,
          viewBox: "0 0 10 10",
          refX: 9, refY: 5,
          markerWidth: 7, markerHeight: 7,
          orient: "auto-start-reverse"
        }, defs);
        create("path", { d: "M 0 0 L 10 5 L 0 10 z", fill: color }, m);
        this.arrowIds[name] = id;
      });

      if (opts.grid !== false) this._drawGrid();
      if (opts.axes !== false) this._drawAxes();

      // Pointer state
      this._activeHandle = null;
      this._listeners = [];
      this._on(this.svg, "pointermove", (e) => this._onPointerMove(e));
      this._on(this.svg, "pointerup",   () => this._onPointerUp());
      this._on(this.svg, "pointerleave",() => this._onPointerUp());

      // Reactive state
      this._state = {};
      this._subs = [];
    }

    _uid() {
      this._idSeed = (this._idSeed || 0) + 1;
      return this._idSeed;
    }

    _on(target, type, fn) {
      target.addEventListener(type, fn);
      this._listeners.push([target, type, fn]);
    }

    destroy() {
      this._listeners.forEach(([t, type, fn]) => t.removeEventListener(type, fn));
      this._listeners = [];
      this._subs = [];
      if (this.svg.parentNode) this.svg.parentNode.removeChild(this.svg);
    }

    // ---------- Coordinate conversions ----------
    toScreen(x, y) {
      return [this.cx + x * this.scale, this.cy - y * this.scale];
    }
    toWorld(sx, sy) {
      return [(sx - this.cx) / this.scale, (this.cy - sy) / this.scale];
    }
    pointerWorld(evt) {
      const r = this.svg.getBoundingClientRect();
      // viewBox is W x H; scale to that
      const sx = (evt.clientX - r.left) * (this.W / r.width);
      const sy = (evt.clientY - r.top)  * (this.H / r.height);
      return this.toWorld(sx, sy);
    }

    // ---------- Drawing primitives ----------
    _drawGrid() {
      for (let i = -this.range; i <= this.range; i++) {
        if (i === 0) continue;
        const [x1, y1] = this.toScreen(i, -this.range);
        const [x2, y2] = this.toScreen(i,  this.range);
        create("line", {
          x1, y1, x2, y2,
          class: "p-grid-line",
          stroke: "var(--rule)",
          "stroke-width": 0.5
        }, this.layers.grid);

        const [x3, y3] = this.toScreen(-this.range, i);
        const [x4, y4] = this.toScreen( this.range, i);
        create("line", {
          x1: x3, y1: y3, x2: x4, y2: y4,
          stroke: "var(--rule)",
          "stroke-width": 0.5
        }, this.layers.grid);
      }
    }

    _drawAxes() {
      const [ox1, oy1] = this.toScreen(-this.range, 0);
      const [ox2, oy2] = this.toScreen( this.range, 0);
      create("line", {
        x1: ox1, y1: oy1, x2: ox2, y2: oy2,
        stroke: "var(--ink-soft)", "stroke-width": 1
      }, this.layers.axes);
      const [ax1, ay1] = this.toScreen(0, -this.range);
      const [ax2, ay2] = this.toScreen(0,  this.range);
      create("line", {
        x1: ax1, y1: ay1, x2: ax2, y2: ay2,
        stroke: "var(--ink-soft)", "stroke-width": 1
      }, this.layers.axes);

      // Tick labels at integer values (skip 0)
      for (let i = -this.range; i <= this.range; i++) {
        if (i === 0) continue;
        const [tx, ty] = this.toScreen(i, 0);
        create("text", {
          x: tx, y: ty + 12,
          class: "p-tick", "text-anchor": "middle",
          fill: "var(--ink-mute)", "font-size": 9,
          "font-family": "var(--font-mono, monospace)"
        }, this.layers.axes).textContent = String(i);
      }
    }

    // ---------- Vectors ----------
    /**
     * Draw or update a vector arrow from origin to (x,y).
     * Returns a handle object you can call .update(x,y) on.
     */
    addVector({ x, y, color = "accent", label = null, width = 2, dashed = false }) {
      const arrowId = this.arrowIds[color] || this.arrowIds.accent;
      const line = create("line", {
        stroke: this._colorVar(color),
        "stroke-width": width,
        "marker-end": `url(#${arrowId})`,
        "stroke-linecap": "round",
        ...(dashed ? { "stroke-dasharray": "5 4" } : {})
      }, this.layers.vectors);

      let labelEl = null;
      if (label) {
        labelEl = create("text", {
          class: "p-vector-label",
          fill: this._colorVar(color),
          "font-size": 13,
          "font-style": "italic",
          "font-family": "var(--font-serif, serif)",
          "paint-order": "stroke",
          stroke: "var(--bg, #fff)", "stroke-width": 4,
          "text-anchor": "middle"
        }, this.layers.labels);
        labelEl.textContent = label;
      }

      const update = (nx, ny) => {
        const [x1, y1] = this.toScreen(0, 0);
        const [x2, y2] = this.toScreen(nx, ny);
        line.setAttribute("x1", x1);
        line.setAttribute("y1", y1);
        line.setAttribute("x2", x2);
        line.setAttribute("y2", y2);
        if (labelEl) {
          // Place label slightly past the tip, perpendicular offset
          const dx = nx, dy = ny;
          const len = Math.hypot(dx, dy) || 1;
          const ox = -dy / len * 0.35;
          const oy =  dx / len * 0.35;
          const [lx, ly] = this.toScreen(nx + ox, ny + oy);
          labelEl.setAttribute("x", lx);
          labelEl.setAttribute("y", ly);
        }
      };
      update(x, y);
      return { line, label: labelEl, update, destroy: () => {
        line.remove();
        if (labelEl) labelEl.remove();
      }};
    }

    /**
     * Draggable handle. Calls onChange(x,y) when moved.
     */
    addHandle({ x, y, color = "accent", radius = 8, onChange = null }) {
      const [sx, sy] = this.toScreen(x, y);
      const dot = create("circle", {
        cx: sx, cy: sy, r: radius,
        fill: this._colorVar(color),
        "fill-opacity": 0.85,
        stroke: "white", "stroke-width": 2,
        class: "p-handle",
        style: "cursor: grab; touch-action: none;"
      }, this.layers.handles);

      const state = { x, y, dot, onChange };
      const startDrag = (e) => {
        e.preventDefault();
        this._activeHandle = state;
        dot.setAttribute("style", "cursor: grabbing; touch-action: none;");
        try { dot.setPointerCapture(e.pointerId); } catch(_) {}
      };
      dot.addEventListener("pointerdown", startDrag);
      this._listeners.push([dot, "pointerdown", startDrag]);

      state.update = (nx, ny) => {
        state.x = nx; state.y = ny;
        const [sx2, sy2] = this.toScreen(nx, ny);
        dot.setAttribute("cx", sx2);
        dot.setAttribute("cy", sy2);
      };
      return state;
    }

    _onPointerMove(e) {
      if (!this._activeHandle) return;
      let [x, y] = this.pointerWorld(e);
      // Clamp to plane
      x = Math.max(-this.range, Math.min(this.range, x));
      y = Math.max(-this.range, Math.min(this.range, y));
      // Snap
      if (this.snap) {
        x = Math.round(x);
        y = Math.round(y);
      } else {
        // Soft snap to halves when within ~0.08 units
        const sx = Math.round(x * 2) / 2;
        const sy = Math.round(y * 2) / 2;
        if (Math.abs(x - sx) < 0.08) x = sx;
        if (Math.abs(y - sy) < 0.08) y = sy;
      }
      this._activeHandle.update(x, y);
      if (this._activeHandle.onChange) this._activeHandle.onChange(x, y);
    }

    _onPointerUp() {
      if (this._activeHandle && this._activeHandle.dot) {
        this._activeHandle.dot.setAttribute("style", "cursor: grab; touch-action: none;");
      }
      this._activeHandle = null;
    }

    // ---------- Shapes ----------
    addPolygon({ points, fill = "accent", fillOpacity = 0.18, stroke = null, strokeWidth = 1.5, dashed = false }) {
      const path = create("polygon", {
        fill: this._colorVar(fill),
        "fill-opacity": fillOpacity,
        stroke: stroke ? this._colorVar(stroke) : "none",
        "stroke-width": strokeWidth,
        ...(dashed ? { "stroke-dasharray": "5 4" } : {})
      }, this.layers.shapes);
      const update = (pts) => {
        path.setAttribute("points", pts.map(([x, y]) => {
          const [sx, sy] = this.toScreen(x, y);
          return `${sx},${sy}`;
        }).join(" "));
      };
      update(points);
      return { el: path, update, destroy: () => path.remove() };
    }

    addLine({ from = [0,0], to = [1,0], color = "mute", width = 1, dashed = true }) {
      const line = create("line", {
        stroke: this._colorVar(color),
        "stroke-width": width,
        ...(dashed ? { "stroke-dasharray": "4 4" } : {})
      }, this.layers.shapes);
      const update = ([x1, y1], [x2, y2]) => {
        const [a, b] = this.toScreen(x1, y1);
        const [c, d] = this.toScreen(x2, y2);
        line.setAttribute("x1", a);
        line.setAttribute("y1", b);
        line.setAttribute("x2", c);
        line.setAttribute("y2", d);
      };
      update(from, to);
      return { el: line, update, destroy: () => line.remove() };
    }

    _colorVar(name) {
      const map = {
        accent: "var(--accent, #7a1f2b)",
        link:   "var(--link, #2a4a7f)",
        green:  "#4a7a3f",
        mute:   "var(--ink-mute, #837e72)",
        ink:    "var(--ink, #1c1a17)"
      };
      return map[name] || name;
    }

    // ---------- Public mount ----------
    mount(parent) {
      parent.appendChild(this.svg);
      return this;
    }
  }

  window.Plane2D = Plane2D;
})();
