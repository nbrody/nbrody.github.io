/* =============================================================
   Math 21 — Row reduction stepper

   Author syntax in markdown:
     <div data-demo="row-reduction"
          data-config='{"matrix":[[2,3,7],[1,-1,1]],"augmented":true}'></div>

   Config:
     matrix:     2D array, rows of the (possibly augmented) matrix
     augmented:  bool, draws a vertical bar before the last column (default false)
   ============================================================= */

(function () {
  "use strict";

  function mount(host, config) {
    const fmt = window.DemoRegistry.helpers.fmt;
    const augmented = !!config.augmented;
    const initial = (config.matrix || [[2, 3, 7], [1, -1, 1]]).map(r => r.map(Number));
    const rows = initial.length;
    const cols = initial[0].length;

    let A = initial.map(r => r.slice());
    const history = [{ op: "Initial matrix", A: A.map(r => r.slice()) }];

    host.classList.add("demo-rr");
    host.innerHTML = `
      <div class="demo-rr-controls">
        <div class="demo-rr-op-group">
          <strong>Swap</strong>
          <select data-op="swap-i">${rowOptions(rows)}</select>
          ↔
          <select data-op="swap-j">${rowOptions(rows)}</select>
          <button data-action="swap">Apply</button>
        </div>
        <div class="demo-rr-op-group">
          <strong>Scale</strong>
          R<sub><select data-op="scale-i">${rowOptions(rows)}</select></sub>
          ×
          <input data-op="scale-k" type="number" step="0.5" value="2" style="width: 56px;">
          <button data-action="scale">Apply</button>
        </div>
        <div class="demo-rr-op-group">
          <strong>Replace</strong>
          R<sub><select data-op="add-i">${rowOptions(rows)}</select></sub>
          ←
          R<sub><select data-op="add-i">${rowOptions(rows)}</select></sub>
          <span style="white-space:nowrap;">+ <input data-op="add-k" type="number" step="0.5" value="-1" style="width: 56px;"></span>
          R<sub><select data-op="add-j">${rowOptions(rows)}</select></sub>
          <button data-action="add">Apply</button>
        </div>
        <div class="demo-rr-op-group demo-rr-op-meta">
          <button data-action="reset" class="demo-rr-secondary">Reset</button>
          <button data-action="undo" class="demo-rr-secondary">Undo</button>
        </div>
      </div>
      <div class="demo-rr-history" data-history></div>
    `;

    // The "Replace" controls: I want the format R_i ← R_i + k·R_j.
    // The first <select data-op="add-i"> is the destination row (controls both R_i mentions).
    // Adjust HTML — I'll replicate selection across both R_i selects via JS.
    const addISels = host.querySelectorAll('[data-op="add-i"]');
    if (addISels.length === 2) {
      addISels[0].addEventListener("change", () => { addISels[1].value = addISels[0].value; });
      addISels[1].addEventListener("change", () => { addISels[0].value = addISels[1].value; });
    }

    const historyEl = host.querySelector("[data-history]");

    function rowOptions(n) {
      let s = "";
      for (let i = 1; i <= n; i++) s += `<option value="${i}">${i}</option>`;
      return s;
    }

    function matrixHTML(M) {
      const rs = M.length, cs = M[0].length;
      const cells = [];
      for (let i = 0; i < rs; i++) {
        const row = [];
        for (let j = 0; j < cs; j++) {
          const cls = augmented && j === cs - 1 ? "demo-rr-aug" : "";
          row.push(`<td class="${cls}">${fmt(M[i][j], 3)}</td>`);
        }
        cells.push(`<tr>${row.join("")}</tr>`);
      }
      return `<table class="demo-rr-matrix">${cells.join("")}</table>`;
    }

    function render() {
      historyEl.innerHTML = history.map((step, idx) => `
        <div class="demo-rr-step ${idx === history.length - 1 ? "is-current" : ""}">
          <div class="demo-rr-step-label">${idx === 0 ? "" : "→"} ${escapeHTML(step.op)}</div>
          ${matrixHTML(step.A)}
        </div>
      `).join("");
      // Auto-scroll to bottom of history
      historyEl.scrollTop = historyEl.scrollHeight;
    }

    function escapeHTML(s) {
      return String(s).replace(/[&<>]/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;"}[c]));
    }

    function applyOp(op, A) {
      const next = A.map(r => r.slice());
      if (op.kind === "swap") {
        [next[op.i], next[op.j]] = [next[op.j], next[op.i]];
      } else if (op.kind === "scale") {
        next[op.i] = next[op.i].map(v => v * op.k);
      } else if (op.kind === "add") {
        next[op.i] = next[op.i].map((v, c) => v + op.k * A[op.j][c]);
      }
      return next;
    }

    function pushOp(op, label) {
      const next = applyOp(op, A);
      A = next;
      history.push({ op: label, A: A.map(r => r.slice()) });
      render();
    }

    host.querySelector('[data-action="swap"]').addEventListener("click", () => {
      const i = parseInt(host.querySelector('[data-op="swap-i"]').value, 10) - 1;
      const j = parseInt(host.querySelector('[data-op="swap-j"]').value, 10) - 1;
      if (i === j) return;
      pushOp({ kind: "swap", i, j }, `Swap R${i+1} ↔ R${j+1}`);
    });

    host.querySelector('[data-action="scale"]').addEventListener("click", () => {
      const i = parseInt(host.querySelector('[data-op="scale-i"]').value, 10) - 1;
      const k = parseFloat(host.querySelector('[data-op="scale-k"]').value);
      if (!isFinite(k) || k === 0) return;
      const label = k === -1
        ? `R${i+1} ← −R${i+1}`
        : `R${i+1} ← ${fmt(k, 3)}·R${i+1}`;
      pushOp({ kind: "scale", i, k }, label);
    });

    host.querySelector('[data-action="add"]').addEventListener("click", () => {
      const iSel = host.querySelector('[data-op="add-i"]');
      const jSel = host.querySelectorAll('[data-op="add-j"]')[0];
      const i = parseInt(iSel.value, 10) - 1;
      const j = parseInt(jSel.value, 10) - 1;
      const k = parseFloat(host.querySelector('[data-op="add-k"]').value);
      if (i === j) return;
      if (!isFinite(k) || k === 0) return;
      const sign = k >= 0 ? "+" : "−";
      pushOp({ kind: "add", i, j, k },
        `R${i+1} ← R${i+1} ${sign} ${fmt(Math.abs(k), 3)}·R${j+1}`);
    });

    host.querySelector('[data-action="reset"]').addEventListener("click", () => {
      A = initial.map(r => r.slice());
      history.length = 0;
      history.push({ op: "Initial matrix", A: A.map(r => r.slice()) });
      render();
    });

    host.querySelector('[data-action="undo"]').addEventListener("click", () => {
      if (history.length <= 1) return;
      history.pop();
      A = history[history.length - 1].A.map(r => r.slice());
      render();
    });

    render();

    return { destroy() {} };
  }

  window.DemoRegistry.register("row-reduction", mount);
})();
