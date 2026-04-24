(() => {
  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d');

  const state = {
    cell: 10,
    fps: 12,
    cols: 0,
    rows: 0,
    grid: null,     // Uint8Array, length cols*rows
    next: null,
    running: false,
    gen: 0,
    age: null,      // Uint16Array for coloring by longevity
  };

  const genEl = document.getElementById('genVal');
  const aliveEl = document.getElementById('aliveVal');
  const playBtn = document.getElementById('playBtn');

  function logicalSize() {
    const dpr = window.devicePixelRatio || 1;
    return { w: canvas.width / dpr, h: canvas.height / dpr, dpr };
  }

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    const w = Math.max(320, Math.floor(rect.width));
    const h = Math.max(320, Math.round(w * 0.62));
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    reshapeGrid();
    draw();
  }

  function reshapeGrid() {
    const { w, h } = logicalSize();
    const newCols = Math.max(8, Math.floor(w / state.cell));
    const newRows = Math.max(8, Math.floor(h / state.cell));
    if (newCols === state.cols && newRows === state.rows && state.grid) return;

    const oldGrid = state.grid;
    const oldCols = state.cols;
    const oldRows = state.rows;

    state.cols = newCols;
    state.rows = newRows;
    state.grid = new Uint8Array(newCols * newRows);
    state.next = new Uint8Array(newCols * newRows);
    state.age = new Uint16Array(newCols * newRows);

    if (oldGrid) {
      const cc = Math.min(oldCols, newCols);
      const rr = Math.min(oldRows, newRows);
      for (let y = 0; y < rr; y++) {
        for (let x = 0; x < cc; x++) {
          state.grid[y * newCols + x] = oldGrid[y * oldCols + x];
        }
      }
    }
  }

  function clear() {
    state.grid.fill(0);
    state.age.fill(0);
    state.gen = 0;
    draw();
  }

  function randomize(p = 0.28) {
    for (let i = 0; i < state.grid.length; i++) {
      state.grid[i] = Math.random() < p ? 1 : 0;
      state.age[i] = state.grid[i] ? 1 : 0;
    }
    state.gen = 0;
    draw();
  }

  function tick() {
    const { cols, rows, grid, next, age } = state;
    for (let y = 0; y < rows; y++) {
      const yUp = (y - 1 + rows) % rows;
      const yDn = (y + 1) % rows;
      for (let x = 0; x < cols; x++) {
        const xL = (x - 1 + cols) % cols;
        const xR = (x + 1) % cols;
        const n =
          grid[yUp * cols + xL] + grid[yUp * cols + x] + grid[yUp * cols + xR] +
          grid[y   * cols + xL] +                         grid[y   * cols + xR] +
          grid[yDn * cols + xL] + grid[yDn * cols + x] + grid[yDn * cols + xR];
        const i = y * cols + x;
        const alive = grid[i] === 1;
        let r;
        if (alive) r = (n === 2 || n === 3) ? 1 : 0;
        else       r = (n === 3) ? 1 : 0;
        next[i] = r;
        if (r) age[i] = alive ? Math.min(age[i] + 1, 65000) : 1;
        else age[i] = 0;
      }
    }
    state.grid = next;
    state.next = grid;
    state.gen++;
  }

  function draw() {
    const { w, h } = logicalSize();
    const { cols, rows, cell, grid, age } = state;

    ctx.fillStyle = '#05070f';
    ctx.fillRect(0, 0, w, h);

    let alive = 0;
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = y * cols + x;
        if (grid[i]) {
          alive++;
          const a = age[i];
          // Young = mint green, old = soft blue/violet.
          const hue = Math.max(160, 215 - Math.min(a, 120) * 0.3);
          const lt = 72 - Math.min(a, 200) * 0.08;
          ctx.fillStyle = `hsl(${hue}, 80%, ${lt}%)`;
          ctx.fillRect(x * cell, y * cell, cell - 1, cell - 1);
        }
      }
    }

    // Thin grid lines when cells are big enough
    if (cell >= 8) {
      ctx.strokeStyle = 'rgba(138, 180, 255, 0.06)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x <= cols; x++) {
        const px = x * cell + 0.5;
        ctx.moveTo(px, 0); ctx.lineTo(px, rows * cell);
      }
      for (let y = 0; y <= rows; y++) {
        const py = y * cell + 0.5;
        ctx.moveTo(0, py); ctx.lineTo(cols * cell, py);
      }
      ctx.stroke();
    }

    genEl.textContent = state.gen;
    aliveEl.textContent = alive;
  }

  // --- Pattern stamping ---
  // Each pattern is an array of [x,y] offsets from top-left.
  const patterns = {
    glider: [[1,0],[2,1],[0,2],[1,2],[2,2]],
    lwss: [[1,0],[4,0],[0,1],[0,2],[4,2],[0,3],[1,3],[2,3],[3,3]],
    blinker: [[0,0],[1,0],[2,0]],
    toad: [[1,0],[2,0],[3,0],[0,1],[1,1],[2,1]],
    beacon: [[0,0],[1,0],[0,1],[1,1],[2,2],[3,2],[2,3],[3,3]],
    pulsar: (() => {
      // A 13x13 pulsar pattern
      const cells = [];
      const spots = [2,3,4, 8,9,10];
      for (const x of spots) { cells.push([x,0],[x,5],[x,7],[x,12]); }
      for (const y of spots) { cells.push([0,y],[5,y],[7,y],[12,y]); }
      return cells;
    })(),
    pentadecathlon: [
      [1,0],[1,1],[0,2],[2,2],[1,3],[1,4],[1,5],[1,6],[0,7],[2,7],[1,8],[1,9]
    ],
    gosperGun: [
      [24,0],
      [22,1],[24,1],
      [12,2],[13,2],[20,2],[21,2],[34,2],[35,2],
      [11,3],[15,3],[20,3],[21,3],[34,3],[35,3],
      [0,4],[1,4],[10,4],[16,4],[20,4],[21,4],
      [0,5],[1,5],[10,5],[14,5],[16,5],[17,5],[22,5],[24,5],
      [10,6],[16,6],[24,6],
      [11,7],[15,7],
      [12,8],[13,8]
    ],
    rpentomino: [[1,0],[2,0],[0,1],[1,1],[1,2]],
    acorn: [[1,0],[3,1],[0,2],[1,2],[4,2],[5,2],[6,2]],
    diehard: [[6,0],[0,1],[1,1],[1,2],[5,2],[6,2],[7,2]],
  };

  function stampPattern(name) {
    const cells = patterns[name];
    if (!cells) return;
    state.grid.fill(0);
    state.age.fill(0);
    state.gen = 0;
    let maxX = 0, maxY = 0;
    for (const [x, y] of cells) { if (x > maxX) maxX = x; if (y > maxY) maxY = y; }
    const ox = Math.max(0, Math.floor((state.cols - maxX - 1) / 2));
    const oy = Math.max(0, Math.floor((state.rows - maxY - 1) / 2));
    for (const [x, y] of cells) {
      const gx = ox + x, gy = oy + y;
      if (gx >= 0 && gx < state.cols && gy >= 0 && gy < state.rows) {
        state.grid[gy * state.cols + gx] = 1;
        state.age[gy * state.cols + gx] = 1;
      }
    }
    draw();
  }

  // --- Loop with adjustable fps ---
  let lastTick = 0;
  function loop(t) {
    if (state.running) {
      const interval = 1000 / state.fps;
      if (t - lastTick >= interval) {
        tick();
        draw();
        lastTick = t;
      }
    }
    requestAnimationFrame(loop);
  }

  // --- Painting ---
  let painting = false;
  let paintValue = 1;

  function cellAt(evt) {
    const rect = canvas.getBoundingClientRect();
    const x = (evt.clientX ?? evt.touches?.[0]?.clientX) - rect.left;
    const y = (evt.clientY ?? evt.touches?.[0]?.clientY) - rect.top;
    return {
      cx: Math.floor(x / state.cell),
      cy: Math.floor(y / state.cell),
    };
  }
  function paintAt(evt) {
    const { cx, cy } = cellAt(evt);
    if (cx < 0 || cy < 0 || cx >= state.cols || cy >= state.rows) return;
    const i = cy * state.cols + cx;
    state.grid[i] = paintValue;
    state.age[i] = paintValue ? 1 : 0;
    draw();
  }

  canvas.addEventListener('pointerdown', e => {
    painting = true;
    const { cx, cy } = cellAt(e);
    if (cx < 0 || cy < 0 || cx >= state.cols || cy >= state.rows) return;
    // Toggle-start: flip the initial cell, then paint the same value while dragging.
    const i = cy * state.cols + cx;
    paintValue = state.grid[i] ? 0 : 1;
    state.grid[i] = paintValue;
    state.age[i] = paintValue ? 1 : 0;
    canvas.setPointerCapture(e.pointerId);
    draw();
  });
  canvas.addEventListener('pointermove', e => { if (painting) paintAt(e); });
  const endPaint = () => { painting = false; };
  canvas.addEventListener('pointerup', endPaint);
  canvas.addEventListener('pointercancel', endPaint);

  // --- UI ---
  const cellRange = document.getElementById('cell');
  const cellVal = document.getElementById('cellVal');
  cellRange.addEventListener('input', () => {
    state.cell = parseInt(cellRange.value, 10);
    cellVal.textContent = state.cell;
    state.cols = 0; state.rows = 0; // force reshape
    reshapeGrid();
    draw();
  });

  const fpsRange = document.getElementById('fps');
  const fpsVal = document.getElementById('fpsVal');
  fpsRange.addEventListener('input', () => {
    state.fps = parseInt(fpsRange.value, 10);
    fpsVal.textContent = state.fps;
  });

  playBtn.addEventListener('click', () => {
    state.running = !state.running;
    playBtn.textContent = state.running ? 'Pause' : 'Play';
    playBtn.classList.toggle('primary', !state.running);
  });
  document.getElementById('stepBtn').addEventListener('click', () => {
    if (!state.running) { tick(); draw(); }
  });
  document.getElementById('clearBtn').addEventListener('click', clear);
  document.getElementById('randBtn').addEventListener('click', () => randomize());

  document.getElementById('pattern').addEventListener('change', e => {
    if (e.target.value) stampPattern(e.target.value);
    e.target.value = '';
  });

  window.addEventListener('resize', resize);

  resize();
  randomize(0.22);
  requestAnimationFrame(loop);
})();
