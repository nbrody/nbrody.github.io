/* =============================================================
   Math 21 — Linear combination demo

   Author syntax in markdown:
     <div data-demo="linear-combination"
          data-config='{"v1":[2,1],"v2":[-1,2]}'></div>

   Config:
     v1, v2:    initial vectors
     showSpan:  show the span of {v1, v2} as a tinted plane (or line if dependent)
     range:     world extent (default 5)
   ============================================================= */

(function () {
  "use strict";

  function mount(host, config) {
    const fmt = window.DemoRegistry.helpers.fmt;
    const v1 = config.v1 ? [...config.v1] : [2, 1];
    const v2 = config.v2 ? [...config.v2] : [-1, 2];
    const range = config.range || 5;
    const showSpan = config.showSpan !== false;
    let c1 = 1, c2 = 1;

    host.classList.add("demo-lc");
    host.innerHTML = `
      <div class="demo-lc-grid">
        <div class="demo-lc-canvas"></div>
        <div class="demo-lc-controls">
          <div class="demo-lc-eq">
            <span class="demo-lc-label">w =</span>
            <input class="demo-lc-coef" type="number" step="0.1" value="${c1}" data-coef="1">
            <span class="demo-lc-vector demo-lc-v1">v₁</span>
            <span class="demo-lc-plus">+</span>
            <input class="demo-lc-coef" type="number" step="0.1" value="${c2}" data-coef="2">
            <span class="demo-lc-vector demo-lc-v2">v₂</span>
          </div>
          <div class="demo-lc-sliders">
            <label>
              <span>c₁</span>
              <input type="range" min="-3" max="3" step="0.05" value="${c1}" data-slider="1">
            </label>
            <label>
              <span>c₂</span>
              <input type="range" min="-3" max="3" step="0.05" value="${c2}" data-slider="2">
            </label>
          </div>
          <div class="demo-lc-readout">
            <div><span class="demo-lc-label">w =</span> <span data-readout="w">—</span></div>
            <div class="demo-lc-dim">
              <span class="demo-lc-label">span dim</span>
              <span data-readout="dim">—</span>
            </div>
          </div>
        </div>
      </div>
    `;
    const canvas = host.querySelector(".demo-lc-canvas");
    const c1Slider = host.querySelector('[data-slider="1"]');
    const c2Slider = host.querySelector('[data-slider="2"]');
    const c1Input  = host.querySelector('[data-coef="1"]');
    const c2Input  = host.querySelector('[data-coef="2"]');
    const wOut     = host.querySelector('[data-readout="w"]');
    const dimOut   = host.querySelector('[data-readout="dim"]');

    const plane = new window.Plane2D({ width: 420, height: 360, range });
    plane.mount(canvas);

    // Span line/plane (drawn first so it sits underneath)
    const spanLine = plane.addLine({ from: [0,0], to: [0,0], color: "mute", width: 1, dashed: true });
    spanLine.el.style.display = "none";

    const v1arrow = plane.addVector({ x: v1[0], y: v1[1], color: "accent", label: "v₁", width: 2.2 });
    const v2arrow = plane.addVector({ x: v2[0], y: v2[1], color: "link",   label: "v₂", width: 2.2 });

    // Component arrows (c1*v1 chained to c2*v2 to visualize the sum)
    const c1Arrow = plane.addVector({ x: 0, y: 0, color: "mute", width: 1.6, dashed: true });
    const c2Arrow = plane.addVector({ x: 0, y: 0, color: "mute", width: 1.6, dashed: true });
    // Override: c2Arrow needs custom origin — easiest to add a generic line:
    // I'll just redraw c2Arrow as a line+arrow manually each update.

    // Resultant w
    const wArrow = plane.addVector({ x: 0, y: 0, color: "green", label: "w", width: 2.5 });

    // Draggable v1 / v2 tips
    const h1 = plane.addHandle({
      x: v1[0], y: v1[1], color: "accent",
      onChange: (x, y) => { v1[0] = x; v1[1] = y; redraw(); }
    });
    const h2 = plane.addHandle({
      x: v2[0], y: v2[1], color: "link",
      onChange: (x, y) => { v2[0] = x; v2[1] = y; redraw(); }
    });

    function dimSpan() {
      const cross = v1[0]*v2[1] - v1[1]*v2[0];
      if (Math.hypot(...v1) < 1e-6 && Math.hypot(...v2) < 1e-6) return 0;
      if (Math.abs(cross) < 1e-6) return 1;
      return 2;
    }

    function redraw() {
      v1arrow.update(v1[0], v1[1]);
      v2arrow.update(v2[0], v2[1]);
      h1.update(v1[0], v1[1]);
      h2.update(v2[0], v2[1]);

      // c1*v1 from origin
      const a = [c1 * v1[0], c1 * v1[1]];
      const b = [c2 * v2[0], c2 * v2[1]];
      const w = [a[0] + b[0], a[1] + b[1]];

      // The first dashed arrow goes from 0 to a.
      // For the second, we want it from a to a+b. Instead of adding a custom arrow,
      // re-use addLine for visual continuity:
      c1Arrow.update(a[0], a[1]);
      // emulate the second segment as a (non-arrowed) line for clarity
      c2Arrow.line.setAttribute("x1", plane.toScreen(a[0], a[1])[0]);
      c2Arrow.line.setAttribute("y1", plane.toScreen(a[0], a[1])[1]);
      c2Arrow.line.setAttribute("x2", plane.toScreen(w[0], w[1])[0]);
      c2Arrow.line.setAttribute("y2", plane.toScreen(w[0], w[1])[1]);

      wArrow.update(w[0], w[1]);

      wOut.textContent = `(${fmt(w[0])}, ${fmt(w[1])})`;

      const d = dimSpan();
      dimOut.textContent = d;

      // Show span line if dim 1
      if (showSpan && d === 1) {
        const dirSrc = Math.hypot(...v1) > 1e-6 ? v1 : v2;
        const n = Math.hypot(dirSrc[0], dirSrc[1]) || 1;
        const u = [dirSrc[0]/n, dirSrc[1]/n];
        const r = range * 1.4;
        spanLine.update([-u[0]*r, -u[1]*r], [u[0]*r, u[1]*r]);
        spanLine.el.style.display = "";
      } else {
        spanLine.el.style.display = "none";
      }
    }

    function setC1(v) { c1 = v; c1Slider.value = v; c1Input.value = Number.isInteger(v) ? v : v.toFixed(2).replace(/\.?0+$/, ""); redraw(); }
    function setC2(v) { c2 = v; c2Slider.value = v; c2Input.value = Number.isInteger(v) ? v : v.toFixed(2).replace(/\.?0+$/, ""); redraw(); }

    c1Slider.addEventListener("input", () => setC1(parseFloat(c1Slider.value)));
    c2Slider.addEventListener("input", () => setC2(parseFloat(c2Slider.value)));
    c1Input.addEventListener("input", () => {
      const v = parseFloat(c1Input.value);
      if (!isNaN(v)) { c1 = v; c1Slider.value = v; redraw(); }
    });
    c2Input.addEventListener("input", () => {
      const v = parseFloat(c2Input.value);
      if (!isNaN(v)) { c2 = v; c2Slider.value = v; redraw(); }
    });

    redraw();

    return { destroy() { plane.destroy(); } };
  }

  window.DemoRegistry.register("linear-combination", mount);
})();
