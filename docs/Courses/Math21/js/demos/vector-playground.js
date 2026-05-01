/* =============================================================
   Math 21 — Vector / matrix playground demo

   Author syntax in markdown:
     <div data-demo="vector-playground"
          data-config='{"matrix":[[1,1],[0,1]],"showEigen":true}'></div>

   Config (all optional):
     matrix:      2×2 array, initial transformation [[a,b],[c,d]]
     showEigen:   highlight real eigenvectors (default false)
     showSquare:  show original unit square (default true)
     range:       world extent (default 5)
   ============================================================= */

(function () {
  "use strict";

  function mount(host, config) {
    const helpers = window.DemoRegistry.helpers;
    const fmt = helpers.fmt;

    const initial = config.matrix || [[1, 1], [0, 1]];
    let M = [
      [Number(initial[0][0]) || 0, Number(initial[0][1]) || 0],
      [Number(initial[1][0]) || 0, Number(initial[1][1]) || 0]
    ];
    const showEigen = !!config.showEigen;
    const showSquare = config.showSquare !== false;
    const range = config.range || 4;

    // ---------- Layout ----------
    host.classList.add("demo-vp");
    host.innerHTML = `
      <div class="demo-vp-grid">
        <div class="demo-vp-canvas"></div>
        <div class="demo-vp-controls">
          <div class="demo-vp-matrix">
            <div class="demo-vp-matrix-bracket left"></div>
            <div class="demo-vp-matrix-grid">
              <input type="number" step="0.1" data-cell="00">
              <input type="number" step="0.1" data-cell="01">
              <input type="number" step="0.1" data-cell="10">
              <input type="number" step="0.1" data-cell="11">
            </div>
            <div class="demo-vp-matrix-bracket right"></div>
          </div>
          <div class="demo-vp-readout">
            <div><span class="demo-vp-label">det</span> <span data-readout="det">—</span></div>
            <div><span class="demo-vp-label">trace</span> <span data-readout="trace">—</span></div>
            <div><span class="demo-vp-label">eigenvalues</span> <span data-readout="eigs">—</span></div>
          </div>
          <div class="demo-vp-hint">Drag the basis vectors, or type matrix entries directly.</div>
        </div>
      </div>
    `;
    const canvasEl = host.querySelector(".demo-vp-canvas");
    const inputs = {
      "00": host.querySelector('[data-cell="00"]'),
      "01": host.querySelector('[data-cell="01"]'),
      "10": host.querySelector('[data-cell="10"]'),
      "11": host.querySelector('[data-cell="11"]')
    };
    const readout = {
      det:   host.querySelector('[data-readout="det"]'),
      trace: host.querySelector('[data-readout="trace"]'),
      eigs:  host.querySelector('[data-readout="eigs"]')
    };

    // ---------- Plane ----------
    const plane = new window.Plane2D({
      width: 420, height: 360, range
    });
    plane.mount(canvasEl);

    // Original unit square (faint)
    let originalSquare = null;
    if (showSquare) {
      originalSquare = plane.addPolygon({
        points: [[0,0],[1,0],[1,1],[0,1]],
        fill: "mute", fillOpacity: 0.08,
        stroke: "mute", strokeWidth: 1, dashed: true
      });
    }

    // Transformed parallelogram
    const para = plane.addPolygon({
      points: [[0,0],[M[0][0], M[1][0]], [M[0][0]+M[0][1], M[1][0]+M[1][1]], [M[0][1], M[1][1]]],
      fill: "accent", fillOpacity: 0.12,
      stroke: null
    });

    // Eigenvector lines (drawn under vectors so handles remain clickable)
    const eigenLines = [
      plane.addLine({ from:[0,0], to:[0,0], color:"green", width: 1.5, dashed: false }),
      plane.addLine({ from:[0,0], to:[0,0], color:"green", width: 1.5, dashed: false })
    ];
    eigenLines.forEach(l => l.el.style.display = "none");

    // Basis vectors
    const v1 = plane.addVector({ x: M[0][0], y: M[1][0], color: "accent", label: null, width: 2.5 });
    const v2 = plane.addVector({ x: M[0][1], y: M[1][1], color: "link",   label: null, width: 2.5 });

    // Draggable handles at the tips
    const h1 = plane.addHandle({
      x: M[0][0], y: M[1][0], color: "accent",
      onChange: (x, y) => { M[0][0] = x; M[1][0] = y; redraw(); }
    });
    const h2 = plane.addHandle({
      x: M[0][1], y: M[1][1], color: "link",
      onChange: (x, y) => { M[0][1] = x; M[1][1] = y; redraw(); }
    });

    // ---------- Update logic ----------
    function eigenvalues() {
      const a = M[0][0], b = M[0][1], c = M[1][0], d = M[1][1];
      const tr = a + d;
      const det = a*d - b*c;
      const disc = tr*tr - 4*det;
      if (disc < -1e-9) return { complex: true, lambda: [tr/2, Math.sqrt(-disc)/2] };
      const r = Math.sqrt(Math.max(0, disc));
      return { complex: false, lambda: [(tr - r)/2, (tr + r)/2] };
    }

    function eigenvectors(lambda) {
      // (M - λI)v = 0  → solve for v
      const a = M[0][0] - lambda, b = M[0][1];
      const c = M[1][0],          d = M[1][1] - lambda;
      // Try [b, -a] then [d, -c] as a fallback
      const candidates = [[b, -a], [d, -c]];
      for (const [x, y] of candidates) {
        const n = Math.hypot(x, y);
        if (n > 1e-6) return [x / n, y / n];
      }
      return null;
    }

    function redraw() {
      // Update inputs (without firing change events)
      Object.keys(inputs).forEach(k => {
        const i = parseInt(k[0], 10), j = parseInt(k[1], 10);
        const val = M[i][j];
        if (document.activeElement !== inputs[k]) {
          inputs[k].value = Number.isInteger(val) ? val : val.toFixed(2).replace(/\.?0+$/, "");
        }
      });

      v1.update(M[0][0], M[1][0]);
      v2.update(M[0][1], M[1][1]);
      h1.update(M[0][0], M[1][0]);
      h2.update(M[0][1], M[1][1]);

      para.update([[0,0], [M[0][0], M[1][0]], [M[0][0]+M[0][1], M[1][0]+M[1][1]], [M[0][1], M[1][1]]]);

      const det = M[0][0]*M[1][1] - M[0][1]*M[1][0];
      const tr = M[0][0] + M[1][1];
      readout.det.textContent = fmt(det);
      readout.trace.textContent = fmt(tr);

      const eg = eigenvalues();
      if (eg.complex) {
        readout.eigs.textContent = `${fmt(eg.lambda[0])} ± ${fmt(eg.lambda[1])}i`;
        eigenLines.forEach(l => l.el.style.display = "none");
      } else {
        const [l1, l2] = eg.lambda;
        readout.eigs.textContent = `${fmt(l1)}, ${fmt(l2)}`;
        if (showEigen) {
          [l1, l2].forEach((lam, idx) => {
            const v = eigenvectors(lam);
            if (v) {
              const [vx, vy] = v;
              const r = range * 1.2;
              eigenLines[idx].update([-vx*r, -vy*r], [vx*r, vy*r]);
              eigenLines[idx].el.style.display = "";
            } else {
              eigenLines[idx].el.style.display = "none";
            }
          });
        }
      }

      // Sign of det (parallelogram color hints orientation flip)
      para.el.setAttribute("fill",
        det < 0 ? "var(--link, #2a4a7f)" : "var(--accent, #7a1f2b)");
      para.el.setAttribute("fill-opacity", Math.abs(det) < 0.05 ? 0.05 : 0.12);
    }

    // Inputs → M
    Object.keys(inputs).forEach(k => {
      const i = parseInt(k[0], 10), j = parseInt(k[1], 10);
      inputs[k].addEventListener("input", () => {
        const v = parseFloat(inputs[k].value);
        if (!isNaN(v)) {
          M[i][j] = v;
          redraw();
        }
      });
    });

    redraw();

    return {
      destroy() { plane.destroy(); }
    };
  }

  window.DemoRegistry.register("vector-playground", mount);
})();
