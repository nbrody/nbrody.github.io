(() => {
  const panel = document.createElement('div');
  panel.id = 'controlPanel';
  panel.innerHTML = `
    <div style="display: flex; align-items: center; justify-content: space-between;">
      <h3 style="margin: 0;">Isometric Circles</h3>
      <button id="resetViewBtn" style="padding: 2px 6px; font-size: 11px; width: 100px;">Default view</button>
    </div>

    <div id="matrixInputs"></div>
    <div style="display: flex; gap: 8px; margin-top: 12px;">
      <button id="addMatrixBtn">Add Matrix</button>
      <button id="updateGroupBtn">Update</button>
    </div>

    <label for="Lparam" style="display: flex; align-items: center; justify-content: space-between;">
      Word length:
      <input id="Lparam" type="number" value="6" min="1" step="1" style="width:60px; margin-left: 10px;" />
    </label>

    <div style="display: flex; align-items: center; justify-content: space-between; margin-top: 12px;">
      <label for="groupSelector" style="margin: 0;">Predefined group:</label>
      <select id="groupSelector" style="flex-grow: 1; margin: 0 6px;">
        <option value="">-- Select --</option>
        <option value="0">Modular group</option>
        <option value="1">Surface group</option>
        <option value="2">Figure eight knot group</option>
        <option value="3">Borromean rings group</option>
        <option value="3">Random example</option>
      </select>
      <button id="newExampleBtn" style="padding: 0px 6px; font-size: 10px; min-width: unset; width: auto; height: 20px; line-height: 20px;">??</button>
    </div>
  `;
  document.body.appendChild(panel);

  const exampleLibrary = [
      {
        name: "Modular group",
        g1: ['1', '1', '0', '1'],
        g2: ['0', '-1', '1', '0'],
      },
      {
        name: "Surface group",
        g1: ['2', '-2', '0', '1/2'],
        g2: ['3', '4', '2', '3']
      },
      {
        name: "Figure eight knot group",
        g1: ['1', '(-1+sqrt(3)i)/2', '0', '1'],
        g2: ['1', '0', '1', '1']
      },
      {
        name: "Borromean rings group",
        g1: ['1', '2', '0', '1'],
        g2: ['1', 'i', '0', '1'],
        g3: ['1', '0', '-1-i', '1']
      },
      {
        name: "Triangle group",
        g1: ['1', '2i', '0', '1'],
        g2: ['1', '-1', '1', '1']
      },
      {
        name: "Random example",
        g1: ['2', '-2', '0', '1/2'],
        g2: ['3', '4', '2', '3']
      }
    ];
    // Palette: finer gradient for smooth color transition
    const palette = [
      "rgba(0, 255, 255, ALPHA)",  // cyan
      "rgba(0, 230, 255, ALPHA)",
      "rgba(0, 204, 255, ALPHA)",
      "rgba(0, 179, 255, ALPHA)",
      "rgba(0, 153, 255, ALPHA)",
      "rgba(51, 128, 255, ALPHA)",
      "rgba(102, 102, 255, ALPHA)",
      "rgba(128, 102, 204, ALPHA)",
      "rgba(153, 102, 153, ALPHA)",
      "rgba(179, 102, 102, ALPHA)",
      "rgba(204, 102, 102, ALPHA)",
      "rgba(220, 120, 120, ALPHA)",
      "rgba(230, 140, 140, ALPHA)",
      "rgba(240, 160, 160, ALPHA)",
      "rgba(250, 180, 180, ALPHA)",
      "rgba(255, 200, 200, ALPHA)"
    ];

    // ===== parseComplex using math.js =====
    function parseComplex(str) {
      try {
        return math.complex(math.evaluate(str));
      } catch (e) {
        return math.complex(0);
      }
    }

    class Mobius {
      constructor(a, b, c, d) {
        this.a = a; this.b = b; this.c = c; this.d = d;
      }
     compose(other) {
       const M1 = [
         [this.a, this.b],
         [this.c, this.d]
       ];
       const M2 = [
         [other.a, other.b],
         [other.c, other.d]
       ];
       const result = math.multiply(M1, M2);
       return new Mobius(result[0][0], result[0][1], result[1][0], result[1][1]);
     }
      inverse() {
        const ad = math.multiply(this.a, this.d);
        const bc = math.multiply(this.b, this.c);
        const det = math.subtract(ad, bc);
        const a = math.divide(this.d, det);
        const b = math.unaryMinus(math.divide(this.b, det));
        const c = math.unaryMinus(math.divide(this.c, det));
        const d = math.divide(this.a, det);
        return new Mobius(a, b, c, d);
      }
      isoCircle() {
        if (math.abs(this.c) < 1e-12) return null;
        const center = math.unaryMinus(math.divide(this.d, this.c));
        const radius = 1.0 / math.abs(this.c);
        return { center, radius };
      }
    }

    // ===== Canvas & Drawing Globals =====
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');

    let canvasWidth, canvasHeight;
    let panX = 0, panY = 0, scale = 1;
    let isPanning = false, lastMouseX = 0, lastMouseY = 0;
    let circles = [];

    function resizeCanvas() {
      canvasWidth = canvas.clientWidth;
      canvasHeight = canvas.clientHeight;
      canvas.width = canvasWidth;
      canvas.height = canvasHeight;
      // Show [-2.5, +2.5] by default
      scale = Math.min(canvasWidth, canvasHeight) / 5;
      panX = 0;
      panY = 0;
      redraw();
    }
    window.addEventListener('resize', resizeCanvas);

    function redraw() {
      ctx.clearRect(0, 0, canvasWidth, canvasHeight);
      ctx.save();
      ctx.translate(canvasWidth / 2 + panX, canvasHeight / 2 + panY);
      ctx.scale(scale, -scale);
      // Draw subtle axes
      ctx.strokeStyle = 'rgba(255,255,255,0.2)';
      ctx.lineWidth = 1 / scale;
      ctx.beginPath();
      ctx.moveTo(-canvasWidth, 0);
      ctx.lineTo(canvasWidth, 0);
      ctx.moveTo(0, -canvasHeight);
      ctx.lineTo(0, canvasHeight);
      ctx.stroke();
      // Draw circles
      circles.forEach(({ center, radius, color }) => {
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(center.re, center.im, radius, 0, Math.PI * 2);
        ctx.fill();
      });
      ctx.restore();
    }

    canvas.addEventListener('mousedown', (e) => {
      isPanning = true;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
    });
    canvas.addEventListener('mouseup', () => {
      isPanning = false;
    });
    canvas.addEventListener('mousemove', (e) => {
      if (!isPanning) return;
      const dx = e.clientX - lastMouseX;
      const dy = e.clientY - lastMouseY;
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      panX += dx;
      panY += dy;
      redraw();
    });
    canvas.addEventListener('wheel', (e) => {
      e.preventDefault();
      const mouseX = e.clientX - canvasWidth / 2 - panX;
      const mouseY = e.clientY - canvasHeight / 2 - panY;
      const oldScale = scale;
      scale *= (e.deltaY > 0 ? 0.9 : 1.1);
      // Clamp scale between 1 and 500
      scale = Math.max(1, Math.min(scale, 500));
      panX -= mouseX * (scale / oldScale - 1);
      panY -= mouseY * (scale / oldScale - 1);
      redraw();
    });


    function generateGroupElements(generators, L) {
      const gens = {};
      const n = generators.length;
      // Assign labels: uppercase for generators, lowercase for inverses
      for (let i = 0; i < n; i++) {
        const label = String.fromCharCode(65 + i); // 'A', 'B', 'C', ...
        gens[label] = generators[i];
        gens[label.toLowerCase()] = generators[i].inverse();
      }
      let results = [];
      let visited = new Set();
      let queue = [];
      // Initialize queue with single-letter words
      for (let i = 0; i < n; i++) {
        const label = String.fromCharCode(65 + i);
        queue.push(label);
        const M = gens[label];
        results.push(M);
        visited.add(wordSignature(M));
      }

      for (let depth = 2; depth <= L; depth++) {
        const newQueue = [];
        for (const word of queue) {
          for (const gen of Object.keys(gens)) {
            const lastChar = word[word.length - 1];
            if (
              lastChar.toLowerCase() === gen.toLowerCase() &&
              lastChar !== gen
            ) {
              continue;
            }
            const newWord = word + gen;
            let M = gens[newWord[0]];
            for (let j = 1; j < newWord.length; j++) {
              M = M.compose(gens[newWord[j]]);
            }
            const sig = wordSignature(M);
            if (!visited.has(sig)) {
              visited.add(sig);
              results.push(M);
              newQueue.push(newWord);
            }
          }
        }
        queue = newQueue;
        if (queue.length === 0) break;
      }
      return results;
    }

    function wordSignature(M) {
      const ad = math.multiply(M.a, M.d);
      const bc = math.multiply(M.b, M.c);
      const det = math.subtract(ad, bc);
      const detAbs = math.abs(det);
      if (detAbs < 1e-12) return 'degenerate';
      const theta = Math.atan2(det.im, det.re) / 2;
      const scaleFactor = 1.0 / Math.sqrt(detAbs);
      function scaleEntry(z) {
        return math.multiply(z, math.complex(scaleFactor * Math.cos(-theta), scaleFactor * Math.sin(-theta)));
      }
      const a = scaleEntry(M.a),
            b = scaleEntry(M.b),
            c = scaleEntry(M.c),
            d = scaleEntry(M.d);
      function fmt(z) {
        const r = z.re,
              i = z.im;
        const rStr = (Math.abs(r) < 1e-4 ? '0' : r.toFixed(4));
        const iStr = (Math.abs(i) < 1e-4 ? '0' : i.toFixed(4));
        return `${rStr}${i >= 0 ? '+' : ''}${iStr}i`;
      }
      return `[${fmt(a)},${fmt(b)};${fmt(c)},${fmt(d)}]`;
    }

    function addMatrixInput(values = ['1', '0', '0', '1']) {
      const idx = document.querySelectorAll('#matrixInputs .matrix-block').length;
      const container = document.createElement('div');
      container.className = 'matrix-block';
      container.innerHTML = `
        <div style="display: flex; align-items: center;">
          <label style="flex-grow: 1;">
            <span class="matrix-label">\\( g_{${idx + 1}} = \\)</span>
            <span class="matrix-bracket">(</span>
            <span class="matrix-grid-inline">
              <input type="text" value="${values[0]}" />
              <input type="text" value="${values[1]}" />
              <input type="text" value="${values[2]}" />
              <input type="text" value="${values[3]}" />
            </span>
            <span class="matrix-bracket">)</span>
          </label>
          <button class="delete-matrix-btn" style="margin-left: 8px; width: 26px; height: 30px;">✖</button>
        </div>
      `;
      container.querySelector('.delete-matrix-btn').addEventListener('click', () => {
        container.remove();
        // Relabel all matrix-labels after removing
        const labels = document.querySelectorAll('.matrix-label');
        labels.forEach((label, i) => {
          label.innerHTML = `\\( g_{${i + 1}} = \\)`;
        });
        if (window.MathJax) MathJax.typeset();
        rebuildIsometricCircles();
      });
      document.getElementById('matrixInputs').appendChild(container);
      // Relabel all matrix-labels after appending
      const labels = document.querySelectorAll('.matrix-label');
      labels.forEach((label, i) => {
        label.innerHTML = `\\( g_{${i + 1}} = \\)`;
      });
      if (window.MathJax) MathJax.typeset();
    }

    function rebuildIsometricCircles() {
      const L = parseInt(document.getElementById('Lparam').value, 10);
      const matrices = Array.from(document.querySelectorAll('#matrixInputs .matrix-block')).map(block => {
        const inputs = block.querySelectorAll('input');
        return new Mobius(
          parseComplex(inputs[0].value),
          parseComplex(inputs[1].value),
          parseComplex(inputs[2].value),
          parseComplex(inputs[3].value)
        );
      });
      const elements = generateGroupElements(matrices, L);

      // Build raw list of { center, radius }
      const rawCircles = [];
      elements.forEach(M => {
        const iso = M.isoCircle();
        if (!iso) return;
        if (iso.radius < 0.01) return;
        rawCircles.push({ center: iso.center, radius: iso.radius });
      });

      // Determine min/max radius
      if (rawCircles.length === 0) {
        circles = [];
        redraw();
        return;
      }
      let minR = rawCircles[0].radius;
      let maxR = rawCircles[0].radius;
      rawCircles.forEach(c => {
        if (c.radius < minR) minR = c.radius;
        if (c.radius > maxR) maxR = c.radius;
      });

      rawCircles.sort((a, b) => b.radius - a.radius);

      // Assign RGBA color based on normalized radius, small circles vibrant and more opaque
      circles = rawCircles.map(c => {
        let idx = 0;
        let alpha = 0.4;
        if (maxR > minR) {
          const t = (c.radius - minR) / (maxR - minR);
          idx = Math.floor(t * (palette.length - 1));
          alpha = 0.2 + 0.6 * (1 - t); // More opaque for smaller circles
        }
        const baseColor = palette[idx].replace('ALPHA', alpha.toFixed(2));
        return {
          center: c.center,
          radius: c.radius,
          color: baseColor
        };
      });

      redraw();
    }

    function setupUI() {
      document.getElementById('Lparam').addEventListener('change', rebuildIsometricCircles);
      document.getElementById('resetViewBtn').addEventListener('click', () => {
        scale = Math.min(canvasWidth, canvasHeight) / 5;
        panX = 0;
        panY = 0;
        redraw();
      });
      document.getElementById('newExampleBtn').addEventListener('click', () => {
        const rand = exampleLibrary[Math.floor(Math.random() * exampleLibrary.length)];
        setExample(rand);
      });
      document.getElementById('addMatrixBtn').addEventListener('click', () => {
        addMatrixInput();
      });
      document.getElementById('groupSelector').addEventListener('change', (e) => {
        const idx = parseInt(e.target.value, 10);
        if (!isNaN(idx)) {
          setExample(exampleLibrary[idx]);
        }
      });
      document.getElementById('updateGroupBtn').addEventListener('click', rebuildIsometricCircles);
    }

    function setExample(example) {
      const keys = Object.keys(example).filter(k => k !== 'name');
      keys.sort();  // Ensure consistent order g1, g2, ...
      document.getElementById('matrixInputs').innerHTML = '';
      keys.forEach(key => {
        addMatrixInput(example[key]);
      });
      rebuildIsometricCircles();
    }

    window.addEventListener('DOMContentLoaded', () => {
      math.import({
        I: math.complex(0, 1)
      }, { override: true });
      resizeCanvas();
      setupUI();
      addMatrixInput(['1', '2', '0', '1']);
      addMatrixInput(['0', '-1', '1', '0']);
      rebuildIsometricCircles();
      document.getElementById('backButton').addEventListener('click', () => {
        window.location.href = '../index.html';
      });
    });


})();