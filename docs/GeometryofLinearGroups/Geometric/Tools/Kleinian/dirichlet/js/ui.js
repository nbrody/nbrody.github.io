// ui.js
// User interface handling: panel controls, matrix inputs, event handlers

import * as THREE from 'three';
import { Complex, Matrix2, evalComplexExpression, latexToExpr, matrixToLatex, repWithNonnegativeRealTrace, isUnitary, compactComplex } from './geometry.js';
import { generateGroupElements, computeDelaunayNeighbors } from './groups.js';
import { generateAndDrawPolyhedron, resetView, saveImage, onCanvasClick } from './rendering.js';

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

// Message handling
const messageBox = document.getElementById('message-box');

function showMessage(message, isError = false) {
  messageBox.textContent = message;
  messageBox.className = isError ? 'error' : '';
  messageBox.style.display = 'block';
  clearTimeout(showMessage._t);
  showMessage._t = setTimeout(() => { messageBox.style.display = 'none'; }, 4000);
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
    <div style="display:flex;align-items:center;">
      <label style="flex-grow:1;">
        <span class="matrix-label">\\( g_{${idx + 1}} = \\)</span>
        <span class="matrix-bracket">(</span>
        <span class="matrix-grid-inline">
            <span class="mq-matrix-input" data-initial="${values[0]}"></span>
            <span class="mq-matrix-input" data-initial="${values[1]}"></span>
            <span class="mq-matrix-input" data-initial="${values[2]}"></span>
            <span class="mq-matrix-input" data-initial="${values[3]}"></span>
        </span>
        <span class="matrix-bracket">)</span>
      </label>
      <button class="delete-matrix-btn" style="margin-left:8px;width:26px;height:30px;">✖</button>
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
  rebuildGeneratorsFromUI();
  const L = parseInt((document.getElementById('wordLength') || { value: 1 }).value) || 1;
  const groupElements = generateGroupElements(generators, L);
  const basepoint = new THREE.Vector3(0, 0, 1);
  const neighbors = computeDelaunayNeighbors(groupElements, basepoint);
  const lines = neighbors.map(obj => {
    const g = obj && obj.g ? repWithNonnegativeRealTrace(obj.g) : repWithNonnegativeRealTrace(obj);
    const a = compactComplex(g.a);
    const b = compactComplex(g.b);
    const c = compactComplex(g.c);
    const d = compactComplex(g.d);
    return `${a} ${b} ${c} ${d}`;
  });
  return lines.join('\n');
}

// Setup all panel UI event handlers
export function setupPanelUI() {
  const floorCb = document.getElementById('toggleFloor');
  if (floorCb) floorCb.addEventListener('change', () => {
    const floor = window.floor;
    if (floor) floor.visible = floorCb.checked;
  });

  enableControlPanelResize();

  document.getElementById('addMatrixBtn').addEventListener('click', () => addMatrixInput());

  const refreshBtn = document.getElementById('refresh-btn');
  if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
      rebuildGeneratorsFromUI();
      const wordLength = parseInt(document.getElementById('wordLength').value) || 1;
      generateAndDrawPolyhedron(generators, wordLength, wallOpacity, colorPalette);
      showMessage(`Generated polyhedron for word length ${wordLength}.`);
    });
  }

  document.getElementById('wordLength').addEventListener('change', () => {
    rebuildGeneratorsFromUI();
    const wordLength = parseInt(document.getElementById('wordLength').value) || 1;
    generateAndDrawPolyhedron(generators, wordLength, wallOpacity, colorPalette);
  });

  refreshExampleDropdown();
  const groupSel = document.getElementById('groupSelector');
  if (groupSel) groupSel.addEventListener('change', (e) => {
    const idx = parseInt(e.target.value, 10);
    if (!isNaN(idx) && exampleLibrary[idx]) {
      setExample(exampleLibrary[idx].mats);
      rebuildGeneratorsFromUI();
      const wordLength = parseInt(document.getElementById('wordLength').value) || 1;
      generateAndDrawPolyhedron(generators, wordLength, wallOpacity, colorPalette);
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
    rebuildGeneratorsFromUI();
    const L = parseInt((document.getElementById('wordLength') || { value: 1 }).value) || 1;
    const groupElements = generateGroupElements(generators, L);
    const su2 = groupElements.filter(g => isUnitary(g.m || g));

    const I = new Matrix2(
      new Complex(1, 0), new Complex(0, 0),
      new Complex(0, 0), new Complex(1, 0)
    );
    const hasIdentity = su2.some(m => {
      const mat = m.m || m;
      return typeof mat.isIdentity === 'function' && mat.isIdentity();
    });
    if (!hasIdentity) su2.unshift(I);

    const out = document.getElementById('stabilizerOutput');
    if (!out) return;
    if (su2.length === 0) {
      out.textContent = 'No SU(2) elements found among generated words.';
    } else {
      const items = su2.map((m, i) => {
        const mat = m.m || m;
        return `${i + 1}. ${matrixToLatex(mat)}`;
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
    rebuildGeneratorsFromUI();
    const L = parseInt((document.getElementById('wordLength') || { value: 1 }).value) || 1;
    const groupElements = generateGroupElements(generators, L);
    const basepoint = new THREE.Vector3(0, 0, 1);
    const neighbors = computeDelaunayNeighbors(groupElements, basepoint);
    const out = document.getElementById('stdGensOutput');
    if (!out) return;
    if (!neighbors || neighbors.length === 0) {
      out.textContent = 'No Delaunay neighbors found. Increase word length or adjust generators.';
    } else {
      const items = neighbors.map((obj, i) => {
        const g = obj && obj.g ? repWithNonnegativeRealTrace(obj.g) : obj;
        const w = (obj && obj.word) ? obj.word : '';
        const wordLine = w ? `<div style="color:#6b7280; font-size:12px; margin-top:2px;">word: ${w}</div>` : '';
        return `${i + 1}. ${matrixToLatex(g)}${wordLine}`;
      });
      out.innerHTML = items.join('<br/><br/>');
      if (window.MathJax && MathJax.typesetPromise) {
        MathJax.typesetPromise([document.getElementById('controlPanel')]).catch(() => { });
      }
    }
    showMessage(`Printed ${neighbors.length} standard generators (Delaunay neighbors).`);
  });

  const exportBtn = document.getElementById('exportSO31Btn');
  if (exportBtn) exportBtn.addEventListener('click', () => {
    try {
      const payload = collectStandardGeneratorsPayload();
      if (!payload || !payload.trim()) {
        showMessage('No standard generators to export. Try increasing word length.', true);
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

  const delCb = document.getElementById('toggleDelaunay');
  if (delCb) delCb.addEventListener('change', () => {
    rebuildGeneratorsFromUI();
    const wordLength = parseInt(document.getElementById('wordLength').value) || 1;
    generateAndDrawPolyhedron(generators, wordLength, wallOpacity, colorPalette);
  });

  const orbCb = document.getElementById('toggleOrbit');
  if (orbCb) orbCb.addEventListener('change', () => {
    rebuildGeneratorsFromUI();
    const wordLength = parseInt(document.getElementById('wordLength').value) || 1;
    generateAndDrawPolyhedron(generators, wordLength, wallOpacity, colorPalette);
  });

  const wallsRadios = document.querySelectorAll('input[name="wallsMode"]');
  wallsRadios.forEach(radio => {
    radio.addEventListener('change', () => {
      rebuildGeneratorsFromUI();
      const wordLength = parseInt(document.getElementById('wordLength').value) || 1;
      generateAndDrawPolyhedron(generators, wordLength, wallOpacity, colorPalette);
    });
  });

  const wallOpacitySlider = document.getElementById('wallOpacitySlider');
  if (wallOpacitySlider) {
    wallOpacitySlider.addEventListener('input', () => {
      wallOpacity = parseFloat(wallOpacitySlider.value);
      document.getElementById('wallOpacityValue').textContent = wallOpacity.toFixed(2);
      rebuildGeneratorsFromUI();
      const wordLength = parseInt(document.getElementById('wordLength').value) || 1;
      generateAndDrawPolyhedron(generators, wordLength, wallOpacity, colorPalette);
    });
  }

  const paletteSel = document.getElementById('colorPalette');
  if (paletteSel) {
    paletteSel.addEventListener('change', () => {
      colorPalette = paletteSel.value || 'harmonic';
      rebuildGeneratorsFromUI();
      const wordLength = parseInt(document.getElementById('wordLength').value) || 1;
      generateAndDrawPolyhedron(generators, wordLength, wallOpacity, colorPalette);
    });
  }

  const bpCb = document.getElementById('toggleBasepoint');
  if (bpCb) bpCb.addEventListener('change', () => {
    if (window.basepointMesh) {
      window.basepointMesh.visible = bpCb.checked;
    }
  });

  // Initialize with first example
  setExample(exampleLibrary[0].mats);
  rebuildGeneratorsFromUI();
  typesetMath();
  document.getElementById('wordLength').value = 4;
  generateAndDrawPolyhedron(generators, 4, wallOpacity, colorPalette);
}

// Export state getters
export function getGenerators() { return generators; }
export function getWallOpacity() { return wallOpacity; }
export function getColorPalette() { return colorPalette; }
