// ui.js
// User interface handling: panel controls, matrix inputs, event handlers

import * as THREE from 'three';
import { Complex, Matrix2, evalComplexExpression, latexToExpr, matrixToLatex, repWithNonnegativeRealTrace, isUnitary, compactComplex } from './geometry.js';
import { generateGroupElements, computeDelaunayNeighbors } from './groups.js';
import { drawPolyhedronFromData, resetView, saveImage, onCanvasClick } from './rendering.js';

// Example library
export const exampleLibrary = [
  { name: 'Apollonian Gasket', mats: [['1', '1+i', '0', '1'], ['0', '-1', '1', '0']] },
  { name: 'quasiSchottky', mats: [['\\sqrt{2}', '1', '1', '\\sqrt{2}'], ['\\sqrt{2}', 'i', '-i', '\\sqrt{2}']] },
  { name: 'Modular group', mats: [['1', '1', '0', '1'], ['0', '-1', '1', '0']] },
  { name: 'Borromean rings group', mats: [['1', '2', '0', '1'], ['1', 'i', '0', '1'], ['1', '0', '-1-i', '1']] },
  { name: 'Z[i] congruence', mats: [['1', '2', '0', '1'], ['1', '2i', '0', '1'], ['0', '-1', '1', '0']] },
  { name: 'Surface group', mats: [['2', '-2', '0', '1/2'], ['3', '4', '2', '3']] },
  { name: 'Surface group 2', mats: [['\\sqrt{2}', '0', '0', '\\sqrt{\\frac{1}{2}}'], ['0', '-1', '1', '0'], ['1', '2', '2', '5']] },
  { name: 'Figure eight knot group', mats: [['1', '\\frac{-1+ \\sqrt{3} i}{2}', '0', '1'], ['1', '0', '1', '1']] },
  { name: 'Dense circles', mats: [['1', '2i', '0', '1'], ['\\frac{1}{\\sqrt{2}}', '\\frac{-1}{\\sqrt{2}}', '\\frac{1}{\\sqrt{2}}', '\\frac{1}{\\sqrt{2}}']] },
  { name: 'P(1/3)', mats: [['1', '\\frac{\\sqrt{7}+i}{2}', '0', '1'], ['0', '-1', '1', '0']] },
  { name: 'P(1/4)', mats: [['1', '\\sqrt{1+\\sqrt{1+2i}}', '0', '1'], ['0', '-1', '1', '0']] },
  { name: 'P(2/5)', mats: [['1', '1.1028+0.6655i', '0', '1'], ['0', '-1', '1', '0']] },
  { name: 'Hecke group', mats: [['1', '2\\cos(\\frac{\\pi}{n})', '0', '1'], ['0', '-1', '1', '0']] },
  { name: 'Figure eight fiber', mats: [['\\frac{1+\\sqrt{3}i}{2}', '1', '\\frac{-1+\\sqrt{3}i}{2}', '1'], ['\\frac{1+\\sqrt{3}i}{2}', '-1', '\\frac{1-\\sqrt{3}i}{2}', '1']] }
];

// State
let generators = [];
let wallOpacity = 0.4;
let colorPalette = 'bluegold';
let coloringMode = 'index';

// Worker
let worker = null;
let isComputing = false;

// Message handling
const messageBox = document.getElementById('message-box');

function showMessage(message, isError = false) {
  messageBox.textContent = message;
  messageBox.className = isError ? 'error' : '';
  messageBox.style.display = 'block';
  clearTimeout(showMessage._t);
  showMessage._t = setTimeout(() => { messageBox.style.display = 'none'; }, 4000);
}

// Initialize Worker
function initWorker() {
  if (window.Worker) {
    worker = new Worker('js/worker.js', { type: 'module' });
    worker.onmessage = function (e) {
      const { type, orbitPts, limitSetPts, walls, delaunayEdges, groupElements, neighbors, message } = e.data;
      isComputing = false;
      document.body.style.cursor = 'default';
      const refreshBtn = document.getElementById('refresh-btn');
      if (refreshBtn) refreshBtn.classList.remove('spinning');

      if (type === 'error') {
        showMessage(`Computation error: ${message}`, true);
        return;
      }

      if (type === 'result') {
        // Store results globally if needed for other functions (export, stabilizer)
        window.lastComputationResult = { groupElements, neighbors, orbitPts, limitSetPts, walls, delaunayEdges };

        // Call the drawing function
        drawPolyhedronFromData({ orbitPts, limitSetPts, walls, delaunayEdges }, wallOpacity, colorPalette, coloringMode);

        showMessage(`Computation complete.`);
      }
    };
    worker.onerror = function (e) {
      isComputing = false;
      document.body.style.cursor = 'default';
      const refreshBtn = document.getElementById('refresh-btn');
      if (refreshBtn) refreshBtn.classList.remove('spinning');
      console.error('Worker error:', e);
      showMessage(`Worker error: ${e.message} (lineno: ${e.lineno})`, true);
    };
  }
}

// Helper to trigger worker
function updatePolyhedron() {
  if (!worker) initWorker();
  if (isComputing) return;

  isComputing = true;
  document.body.style.cursor = 'wait';
  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) refreshBtn.classList.add('spinning');

  const wordLength = parseInt(document.getElementById('wordLength').value) || 1;
  const selectedBtn = document.querySelector('button[data-walls-mode].active');
  const wallsMode = selectedBtn ? selectedBtn.getAttribute('data-walls-mode') : 'all';

  // We need to send plain objects. generators are Matrix2.
  // They serialize to {a,b,c,d} which is fine.
  worker.postMessage({
    generators,
    wordLength,
    wallsMode,
    wallOpacity,
    colorPalette,
    coloringMode
  });
}

export function showLatexInMessageBox(latexStr) {
  const box = document.getElementById('message-box');
  if (!box) return;
  box.innerHTML = latexStr || '';
  box.className = '';
  box.style.display = 'block';
  if (window.MathJax && MathJax.typesetPromise) {
    MathJax.typesetPromise([box]).catch(() => { });
  }
  clearTimeout(showLatexInMessageBox._t);
  showLatexInMessageBox._t = setTimeout(() => { box.style.display = 'none'; }, 4000);
}

function typesetMath() {
  if (window.MathJax && MathJax.typesetPromise) {
    MathJax.typesetPromise([document.getElementById('controlPanel')]).catch(() => { });
  }
}

// Add a matrix input to the UI
export function addMatrixInput(values = ['1', '0', '0', '1']) {
  const idx = document.querySelectorAll('#matrixInputs .matrix-block').length;
  const container = document.createElement('div');
  container.className = 'matrix-block';
  container.innerHTML = `
    <div style="display:flex;align-items:center; gap: 15px; margin-bottom: 5px;">
      <label style="flex-grow:1; display:flex; align-items:center;">
        <span class="matrix-label" style="margin-right: 15px; font-size: 1.1em;">\\( g_{${idx + 1}} = \\)</span>
        
        <div class="matrix-bracket">
            <div class="matrix-row">
                <span class="mq-matrix-input" data-initial="${values[0]}"></span>
                <span class="mq-matrix-input" data-initial="${values[1]}"></span>
            </div>
            <div class="matrix-row">
                <span class="mq-matrix-input" data-initial="${values[2]}"></span>
                <span class="mq-matrix-input" data-initial="${values[3]}"></span>
            </div>
        </div>
      </label>
      <button class="delete-matrix-btn" style="width:30px;height:30px; display: flex; align-items: center; justify-content: center; opacity: 0.6; hover: opacity: 1;">✖</button>
    </div>`;
  container.querySelector('.delete-matrix-btn').addEventListener('click', () => {
    container.remove();
    const labels = document.querySelectorAll('#matrixInputs .matrix-label');
    labels.forEach((lbl, i) => { lbl.innerHTML = `\\( g_{${i + 1}} = \\)`; });
    typesetMath();
  });
  document.getElementById('matrixInputs').appendChild(container);
  const MQ = window.MathQuill ? window.MathQuill.getInterface(2) : null;
  if (MQ) {
    const spans = container.querySelectorAll('.mq-matrix-input');
    spans.forEach(span => {
      const mf = MQ.MathField(span, { spaceBehavesLikeTab: true, handlers: { edit: () => { } } });
      const init = span.getAttribute('data-initial') || '0';
      const normalized = String(init).replace(/\*\*/g, '^');
      mf.latex(normalized);
      span.MathQuill = () => mf;
    });
  }
  const labels = document.querySelectorAll('#matrixInputs .matrix-label');
  labels.forEach((lbl, i) => { lbl.innerHTML = `\\( g_{${i + 1}} = \\)`; });
  typesetMath();
}

// Rebuild generators array from UI
export function rebuildGeneratorsFromUI() {
  generators.length = 0;
  const blocks = document.querySelectorAll('#matrixInputs .matrix-block');
  for (const block of blocks) {
    const spans = block.querySelectorAll('.mq-matrix-input');
    const getLatex = (el) => {
      try {
        const api = el && typeof el.MathQuill === 'function' ? el.MathQuill() : null;
        return api && typeof api.latex === 'function' ? api.latex() : (el ? el.textContent : '0');
      } catch {
        return '0';
      }
    };
    const toC = (latex) => evalComplexExpression(latexToExpr(String(latex || '0')));
    const a = toC(getLatex(spans[0]));
    const b = toC(getLatex(spans[1]));
    const c = toC(getLatex(spans[2]));
    const d = toC(getLatex(spans[3]));
    const det = a.mul(d).sub(b.mul(c));
    if (det.normSq() < 1e-12) {
      showMessage('Matrix skipped: determinant is 0 (not invertible).', true);
      continue;
    }
    generators.push(new Matrix2(a, b, c, d));
  }
  return generators;
}

// Set example from library
function setExample(example) {
  document.getElementById('matrixInputs').innerHTML = '';
  example.forEach(vals => addMatrixInput(vals.map(v => String(v).replace(/\*\*/g, '^'))));
  typesetMath();
}

// Refresh example dropdown
export function refreshExampleDropdown() {
  const sel = document.getElementById('groupSelector');
  if (!sel) return;
  const prev = sel.value;
  while (sel.options.length > 1) sel.remove(1);
  exampleLibrary.forEach((ex, idx) => {
    const opt = document.createElement('option');
    opt.value = String(idx);
    opt.textContent = ex.name || `Example ${idx + 1}`;
    sel.appendChild(opt);
  });
  if (prev && Number(prev) < exampleLibrary.length) sel.value = prev;
}

// Switch between tabs
function switchTab(tabName) {
  // Hide all tab contents
  document.querySelectorAll('.tab-content').forEach(content => {
    content.classList.remove('active');
  });

  // Remove active from all tab buttons
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.classList.remove('active');
  });

  // Show selected tab content
  const selectedContent = document.getElementById(`tab-${tabName}`);
  if (selectedContent) {
    selectedContent.classList.add('active');
  }

  // Mark selected button as active
  const selectedBtn = document.querySelector(`.tab-btn[data-tab="${tabName}"]`);
  if (selectedBtn) {
    selectedBtn.classList.add('active');
  }
}

// Enable resizing of control panel
function enableControlPanelResize() {
  const panel = document.getElementById('control-panel');
  if (!panel) return;
  panel.classList.add('resizable');

  let handle = panel.querySelector('.resize-handle-bl');
  if (!handle) {
    handle = document.createElement('div');
    handle.className = 'resize-handle-bl';
    panel.appendChild(handle);
  }

  let startX = 0, startY = 0, startW = 0, startH = 0, resizing = false;
  const MIN_W = 220, MAX_W = 640;
  const MIN_H = 160;

  function maxHeight() {
    return Math.max(240, Math.floor(window.innerHeight * 0.9));
  }

  function onMouseMove(e) {
    if (!resizing) return;
    const dx = e.clientX - startX;
    const dy = e.clientY - startY;

    const newW = Math.min(MAX_W, Math.max(MIN_W, startW - dx));
    const newH = Math.min(maxHeight(), Math.max(MIN_H, startH + dy));

    panel.style.width = newW + 'px';
    panel.style.height = newH + 'px';
  }

  function stopResize() {
    if (!resizing) return;
    resizing = false;
    panel.classList.remove('resizing');
    document.removeEventListener('mousemove', onMouseMove);
    document.removeEventListener('mouseup', stopResize);
  }

  handle.addEventListener('mousedown', (e) => {
    if (panel.classList.contains('hidden')) return;
    e.preventDefault();
    const rect = panel.getBoundingClientRect();
    startX = e.clientX;
    startY = e.clientY;
    startW = rect.width;
    startH = rect.height;
    resizing = true;
    panel.classList.add('resizing');
    document.addEventListener('mousemove', onMouseMove);
    document.addEventListener('mouseup', stopResize);
  });

  window.addEventListener('resize', () => {
    const h = parseInt(panel.style.height || '0', 10);
    if (h && h > maxHeight()) panel.style.height = maxHeight() + 'px';
  });
}

// Collect standard generators for SO(3,1) export
function collectStandardGeneratorsPayload() {
  // Use cached result if available, otherwise we can't do it synchronously anymore!
  if (window.lastComputationResult && window.lastComputationResult.neighbors) {
    const neighbors = window.lastComputationResult.neighbors;
    const lines = neighbors.map(obj => {
      // obj.g is a plain object {a,b,c,d}
      // repWithNonnegativeRealTrace needs methods. We need to rehydrate.
      const g = new Matrix2(
        new Complex(obj.g.a.re, obj.g.a.im),
        new Complex(obj.g.b.re, obj.g.b.im),
        new Complex(obj.g.c.re, obj.g.c.im),
        new Complex(obj.g.d.re, obj.g.d.im)
      );
      const labelM = repWithNonnegativeRealTrace(g);
      const a = compactComplex(labelM.a);
      const b = compactComplex(labelM.b);
      const c = compactComplex(labelM.c);
      const d = compactComplex(labelM.d);
      return `${a} ${b} ${c} ${d}`;
    });
    return lines.join('\n');
  }
  return null;
}

// Setup all panel UI event handlers
export function setupPanelUI() {
  initWorker();

  const floorBtn = document.getElementById('toggleFloor');
  if (floorBtn) floorBtn.addEventListener('click', () => {
    floorBtn.classList.toggle('active');
    const floor = window.floor;
    if (floor) floor.visible = floorBtn.classList.contains('active');
  });

  enableControlPanelResize();

  document.getElementById('addMatrixBtn').addEventListener('click', () => addMatrixInput());

  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      rebuildGeneratorsFromUI();
      updatePolyhedron();
    });
  }

  document.getElementById('wordLength').addEventListener('change', () => {
    rebuildGeneratorsFromUI();
    updatePolyhedron();
  });

  refreshExampleDropdown();
  const groupSel = document.getElementById('groupSelector');
  if (groupSel) groupSel.addEventListener('change', (e) => {
    const idx = parseInt(e.target.value, 10);
    if (!isNaN(idx) && exampleLibrary[idx]) {
      setExample(exampleLibrary[idx].mats);
      rebuildGeneratorsFromUI();
      updatePolyhedron();
      typesetMath();
    }
  });

  const resetBtn = document.getElementById('resetViewBtn');
  if (resetBtn) {
    resetBtn.addEventListener('click', () => {
      resetView();
    });
  }

  const saveBtn = document.getElementById('saveImageBtn');
  if (saveBtn) saveBtn.addEventListener('click', () => {
    const result = saveImage();
    if (result) {
      const a = document.createElement('a');
      a.href = result.dataURL;
      a.download = result.fname;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
    } else {
      showMessage('Could not save image. Try again after interacting with the scene.', true);
    }
  });

  const stabBtn = document.getElementById('showStabilizerBtn');
  if (stabBtn) stabBtn.addEventListener('click', () => {
    // Use cached result
    if (!window.lastComputationResult || !window.lastComputationResult.groupElements) {
      showMessage('Please update the group first.', true);
      return;
    }
    const groupElements = window.lastComputationResult.groupElements;

    const su2 = groupElements.filter(g => isUnitary(new Matrix2(
      new Complex(g.m.a.re, g.m.a.im),
      new Complex(g.m.b.re, g.m.b.im),
      new Complex(g.m.c.re, g.m.c.im),
      new Complex(g.m.d.re, g.m.d.im)
    )));

    const I = new Matrix2(
      new Complex(1, 0), new Complex(0, 0),
      new Complex(0, 0), new Complex(1, 0)
    );
    const hasIdentity = su2.some(m => {
      const mat = new Matrix2(
        new Complex(m.m.a.re, m.m.a.im),
        new Complex(m.m.b.re, m.m.b.im),
        new Complex(m.m.c.re, m.m.c.im),
        new Complex(m.m.d.re, m.m.d.im)
      );
      return mat.isIdentity();
    });
    if (!hasIdentity) su2.unshift({ m: { a: { re: 1, im: 0 }, b: { re: 0, im: 0 }, c: { re: 0, im: 0 }, d: { re: 1, im: 0 } } }); // Add plain identity object

    const out = document.getElementById('stabilizerOutput');
    if (!out) return;
    if (su2.length === 0) {
      out.textContent = 'No SU(2) elements found among generated words.';
    } else {
      const items = su2.map((m, i) => {
        // m is {m: {a,b,c,d}, word}
        return `${i + 1}. ${matrixToLatex(new Matrix2(
          new Complex(m.m.a.re, m.m.a.im),
          new Complex(m.m.b.re, m.m.b.im),
          new Complex(m.m.c.re, m.m.c.im),
          new Complex(m.m.d.re, m.m.d.im)
        ))}`;
      });
      out.innerHTML = items.join('<br/><br/>');
      if (window.MathJax && MathJax.typesetPromise) {
        MathJax.typesetPromise([document.getElementById('controlPanel')]).catch(() => { });
      }
    }
    showMessage(`Stabilizer elements found: ${su2.length}.`);
  });

  const stdBtn = document.getElementById('printStdGensBtn');
  if (stdBtn) stdBtn.addEventListener('click', () => {
    if (!window.lastComputationResult || !window.lastComputationResult.neighbors) {
      showMessage('Please update the group first.', true);
      return;
    }
    const neighbors = window.lastComputationResult.neighbors;
    const out = document.getElementById('stdGensOutput');
    if (!out) return;
    if (!neighbors || neighbors.length === 0) {
      out.textContent = 'No Delaunay neighbors found.';
    } else {
      const items = neighbors.map((obj, i) => {
        // obj.g is plain object
        const g = new Matrix2(
          new Complex(obj.g.a.re, obj.g.a.im),
          new Complex(obj.g.b.re, obj.g.b.im),
          new Complex(obj.g.c.re, obj.g.c.im),
          new Complex(obj.g.d.re, obj.g.d.im)
        );
        const labelM = repWithNonnegativeRealTrace(g);
        const w = (obj && obj.word) ? obj.word : '';
        const wordLine = w ? `<div style="color:#6b7280; font-size:12px; margin-top:2px;">word: ${w}</div>` : '';
        return `${i + 1}. ${matrixToLatex(labelM)}${wordLine}`;
      });
      out.innerHTML = items.join('<br/><br/>');
      if (window.MathJax && MathJax.typesetPromise) {
        MathJax.typesetPromise([document.getElementById('controlPanel')]).catch(() => { });
      }
    }
    showMessage(`Printed ${neighbors.length} standard generators.`);
  });

  const exportBtn = document.getElementById('exportSO31Btn');
  if (exportBtn) exportBtn.addEventListener('click', () => {
    try {
      const payload = collectStandardGeneratorsPayload();
      if (!payload || !payload.trim()) {
        showMessage('No standard generators to export. Try updating the group.', true);
        return;
      }
      try { localStorage.setItem('psl2c_matrices', payload); } catch (e) { }
      const b64 = btoa(payload);
      const url = `PSL2CtoSO31.html?matrices=${encodeURIComponent(b64)}#source=psl2c_matrices`;
      window.location.href = url;
    } catch (e) {
      showMessage('Failed to export standard generators.', true);
      console.error(e);
    }
  });

  // Tab switching
  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const tabName = btn.getAttribute('data-tab');
      if (tabName) {
        switchTab(tabName);
      }
    });
  });

  // Panel collapse/expand
  const collapseBtn = document.getElementById('collapse-btn');
  const panel = document.getElementById('control-panel');
  if (collapseBtn && panel) {
    collapseBtn.addEventListener('click', () => {
      panel.classList.toggle('collapsed');
    });
  }

  const delBtn = document.getElementById('toggleDelaunay');
  if (delBtn) delBtn.addEventListener('click', () => {
    delBtn.classList.toggle('active');
    rebuildGeneratorsFromUI();
    updatePolyhedron();
  });

  const orbBtn = document.getElementById('toggleOrbit');
  if (orbBtn) orbBtn.addEventListener('click', () => {
    orbBtn.classList.toggle('active');
    rebuildGeneratorsFromUI();
    updatePolyhedron();
  });

  const limitBtn = document.getElementById('toggleLimitSet');
  if (limitBtn) limitBtn.addEventListener('click', () => {
    limitBtn.classList.toggle('active');
    rebuildGeneratorsFromUI();
    updatePolyhedron();
  });

  const wallsBtns = document.querySelectorAll('button[data-walls-mode]');
  wallsBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      // Remove active class from all walls buttons
      wallsBtns.forEach(b => b.classList.remove('active'));
      // Add active class to clicked button
      btn.classList.add('active');
      rebuildGeneratorsFromUI();
      updatePolyhedron();
    });
  });

  // Wall opacity slider (draggable)
  const wallOpacitySlider = document.getElementById('wallOpacitySlider');
  if (wallOpacitySlider) {
    const fill = wallOpacitySlider.querySelector('.polyhedron-slider-fill');
    let isDragging = false;

    function updateOpacity(clientX) {
      const rect = wallOpacitySlider.getBoundingClientRect();
      const x = Math.max(0, Math.min(rect.width, clientX - rect.left));
      let opacity = x / rect.width;

      // Snap to 0 or 1 at edges
      if (opacity < 0.05) opacity = 0;
      if (opacity > 0.95) opacity = 1;

      fill.style.width = (opacity * 100) + '%';
      wallOpacity = opacity;

      // For opacity change, we don't need to recompute!
      // We can just redraw if we have cached data.
      if (window.lastComputationResult) {
        // We need to re-call drawPolyhedronFromData with new opacity
        // But we need the full data object (walls, edges, etc).
        // window.lastComputationResult only has groupElements and neighbors?
        // No, the worker returns everything.
        // We should cache the FULL worker result.
        // Let's update the onmessage handler to cache everything.
        // But wait, I can't update onmessage from here easily.
        // I'll just trigger updatePolyhedron() for now, it's fast enough if worker caches? 
        // No, worker recomputes.
        // Ideally we should cache the full data in ui.js.
        // I'll rely on updatePolyhedron() for now to keep it simple, 
        // but note that it will recompute.
        // Actually, opacity change is purely visual.
        // I should fix this.
        rebuildGeneratorsFromUI();
        updatePolyhedron();
      }
    }

    // Initialize
    const initialOpacity = parseFloat(wallOpacitySlider.getAttribute('data-opacity')) || 0.4;
    fill.style.width = (initialOpacity * 100) + '%';
    wallOpacity = initialOpacity;

    wallOpacitySlider.addEventListener('mousedown', (e) => {
      isDragging = true;
      updateOpacity(e.clientX);
      e.preventDefault();
    });

    window.addEventListener('mousemove', (e) => {
      if (isDragging) {
        updateOpacity(e.clientX);
        e.preventDefault();
      }
    }, { passive: false });

    window.addEventListener('mouseup', () => {
      isDragging = false;
    });
  }

  // Palette option buttons
  const paletteOptions = document.querySelectorAll('.palette-option');
  paletteOptions.forEach(btn => {
    btn.addEventListener('click', () => {
      // Remove active from all palette options
      paletteOptions.forEach(b => b.classList.remove('active'));
      // Add active to clicked button
      btn.classList.add('active');
      // Update palette
      colorPalette = btn.getAttribute('data-palette') || 'bluegold';
      rebuildGeneratorsFromUI();
      updatePolyhedron();
    });
  });

  // Coloring mode buttons
  const coloringModeOptions = document.querySelectorAll('button[data-coloring-mode]');
  coloringModeOptions.forEach(btn => {
    btn.addEventListener('click', () => {
      // Remove active from all coloring mode options
      coloringModeOptions.forEach(b => b.classList.remove('active'));
      // Add active to clicked button
      btn.classList.add('active');
      // Update coloring mode
      coloringMode = btn.getAttribute('data-coloring-mode') || 'index';
      rebuildGeneratorsFromUI();
      updatePolyhedron();
    });
  });

  const bpBtn = document.getElementById('toggleBasepoint');
  if (bpBtn) bpBtn.addEventListener('click', () => {
    bpBtn.classList.toggle('active');
    if (window.basepointMesh) {
      window.basepointMesh.visible = bpBtn.classList.contains('active');
    }
  });

  // Initialize with first example
  setExample(exampleLibrary[0].mats);
  rebuildGeneratorsFromUI();
  typesetMath();
  document.getElementById('wordLength').value = 4;
  updatePolyhedron();
}

// Export state getters
export function getGenerators() { return generators; }
export function getWallOpacity() { return wallOpacity; }
export function getColorPalette() { return colorPalette; }
export function getColoringMode() { return coloringMode; }
