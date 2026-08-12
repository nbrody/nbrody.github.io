(() => {
  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d', { alpha: false });

  // ── Tunable parameters ──────────────────────────────────────
  const params = {
    count: 220,
    sensorAngle: 0.5,   // radians offset of side sensors
    sensorDist: 9,      // pixels ahead the sensors look
    turnSpeed: 0.45,    // radians steered toward strongest sensor
    wander: 0.12,       // random jitter added to heading each step
    speed: 1.1,         // pixels per frame
    evaporation: 0.006, // fraction of pheromone lost per frame
    deposit: 40,        // pheromone laid per step at full strength
    brush: 'food',      // food | wall | erase
    showPheromones: true,
  };

  const MAX_ANTS = 600;
  const CELL = 3;            // pheromone grid resolution (px per cell)
  const SENSE_R = 1;         // sampling radius (cells) for each sensor
  const MAX_PH = 255;        // pheromone ceiling per cell
  const DIFFUSE = 0.10;      // fraction blended with neighbours each step
  const FOOD_SOURCE = 18;    // food emits a faint, short-range "toFood" odour

  // ── World state ─────────────────────────────────────────────
  let W = 0, H = 0;          // logical canvas size (px)
  let gw = 0, gh = 0;        // pheromone grid dimensions (cells)
  let toFood = null;         // Float32Array — emergent, evaporating trail to food
  let toHome = null;         // Float32Array — nest "closeness" (BFS, wall-aware)
  let tmp = null;            // Float32Array — scratch buffer for diffusion
  let dqx = null, dqy = null;// Int32Array queues for the home-field flood fill
  let wall = null;           // Uint8Array — 1 = obstacle
  let field = null;          // ImageData for the pheromone overlay
  let ants = [];
  let food = [];             // { x, y, r, amount }
  let nest = { x: 0, y: 0, r: 16 };
  let collected = 0;
  let running = true;

  // ── Utilities ───────────────────────────────────────────────
  const rand = (a, b) => Math.random() * (b - a) + a;
  const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
  const idx = (cx, cy) => cy * gw + cx;

  function logicalSize() {
    const dpr = window.devicePixelRatio || 1;
    return { w: canvas.width / dpr, h: canvas.height / dpr, dpr };
  }

  // ── Sizing / allocation ─────────────────────────────────────
  function resize() {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    W = Math.round(rect.width);
    H = Math.round(rect.height);
    canvas.width = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const newGw = Math.max(4, Math.ceil(W / CELL));
    const newGh = Math.max(4, Math.ceil(H / CELL));
    if (newGw !== gw || newGh !== gh || !toFood) {
      gw = newGw; gh = newGh;
      toFood = new Float32Array(gw * gh);
      toHome = new Float32Array(gw * gh);
      tmp = new Float32Array(gw * gh);
      dqx = new Int32Array(gw * gh);
      dqy = new Int32Array(gw * gh);
      wall = new Uint8Array(gw * gh);
      field = ctx.createImageData(gw, gh);
    }
    nest.x = W * 0.5;
    nest.y = H * 0.5;
    computeHomeField();
  }

  // Breadth-first flood fill from the nest over non-wall cells. Stores a
  // "closeness" value (high at the nest, falling with wall-aware distance) so
  // a laden ant can follow it home around any barrier. Recomputed only when
  // the walls change — cheap, and keeps homing reliable across the whole map.
  function computeHomeField() {
    if (!toHome) return;
    const dist = tmp;                 // reuse scratch as the distance buffer
    dist.fill(-1);
    let head = 0, tail = 0;
    const nx = clamp(Math.floor(nest.x / CELL), 0, gw - 1);
    const ny = clamp(Math.floor(nest.y / CELL), 0, gh - 1);
    const start = idx(nx, ny);
    dist[start] = 0; dqx[tail] = nx; dqy[tail] = ny; tail++;
    let maxD = 0;
    while (head < tail) {
      const cx = dqx[head], cy = dqy[head]; head++;
      const d = dist[idx(cx, cy)] + 1;
      const nb = [[cx - 1, cy], [cx + 1, cy], [cx, cy - 1], [cx, cy + 1]];
      for (const [gx, gy] of nb) {
        if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) continue;
        const k = idx(gx, gy);
        if (wall[k] || dist[k] >= 0) continue;
        dist[k] = d; if (d > maxD) maxD = d;
        dqx[tail] = gx; dqy[tail] = gy; tail++;
      }
    }
    const span = maxD || 1;
    for (let i = 0; i < toHome.length; i++) {
      toHome[i] = dist[i] < 0 ? 0 : (1 - dist[i] / span) * MAX_PH;
    }
  }

  // ── Population / world seeding ──────────────────────────────
  function spawnAnts(n) {
    ants = [];
    for (let i = 0; i < n; i++) ants.push(makeAnt());
  }

  function makeAnt() {
    const a = rand(0, Math.PI * 2);
    return {
      x: nest.x, y: nest.y,
      angle: a,
      carrying: false,
      since: 0,             // steps since the last pickup (for the trail gradient)
    };
  }

  function seedFood() {
    food = [];
    addFood(W * 0.2, H * 0.28, 26);
    addFood(W * 0.82, H * 0.72, 26);
    addFood(W * 0.78, H * 0.2, 20);
  }

  function addFood(x, y, r) {
    food.push({ x, y, r, amount: r * r * 1.4 });
  }

  function reset() {
    resize();
    toFood.fill(0);
    wall.fill(0);
    collected = 0;
    computeHomeField();
    seedFood();
    spawnAnts(params.count);
    updateStats();
    draw();
  }

  // ── Simulation step ─────────────────────────────────────────
  function step() {
    // Each ant climbs the field for its errand: searchers follow the emergent
    // food trail; laden ants follow the nest's home-closeness field.
    for (const ant of ants) moveAnt(ant);
    depositAndDecay();
  }

  function senseField(fieldArr, x, y, ang) {
    const sx = x + Math.cos(ang) * params.sensorDist;
    const sy = y + Math.sin(ang) * params.sensorDist;
    let cx = Math.floor(sx / CELL);
    let cy = Math.floor(sy / CELL);
    if (cx < 0 || cy < 0 || cx >= gw || cy >= gh) return -1; // off-world: avoid
    let sum = 0;
    for (let oy = -SENSE_R; oy <= SENSE_R; oy++) {
      for (let ox = -SENSE_R; ox <= SENSE_R; ox++) {
        const gx = cx + ox, gy = cy + oy;
        if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) continue;
        const k = idx(gx, gy);
        if (wall[k]) { sum -= 1000; continue; } // steer away from walls
        sum += fieldArr[k];
      }
    }
    return sum;
  }

  function moveAnt(ant) {
    const trail = ant.carrying ? toHome : toFood;

    // Three sensors: left, center, right.
    const c = senseField(trail, ant.x, ant.y, ant.angle);
    const l = senseField(trail, ant.x, ant.y, ant.angle - params.sensorAngle);
    const r = senseField(trail, ant.x, ant.y, ant.angle + params.sensorAngle);

    if (c >= l && c >= r) {
      // keep heading
    } else if (l > r) {
      ant.angle -= params.turnSpeed;
    } else if (r > l) {
      ant.angle += params.turnSpeed;
    } else {
      ant.angle += (Math.random() < 0.5 ? -1 : 1) * params.turnSpeed;
    }

    // A searcher that senses no food trail is exploring: nudge it away from the
    // nest so the colony fans out to cover ground instead of milling at home.
    if (!ant.carrying && c < 1 && l < 1 && r < 1) {
      const away = Math.atan2(ant.y - nest.y, ant.x - nest.x);
      ant.angle += Math.sin(away - ant.angle) * 0.08;
    }

    // Exploratory jitter.
    ant.angle += rand(-params.wander, params.wander);

    // Attempt a move; bounce off walls and borders.
    let nx = ant.x + Math.cos(ant.angle) * params.speed;
    let ny = ant.y + Math.sin(ant.angle) * params.speed;

    if (nx < 1 || nx > W - 1) { ant.angle = Math.PI - ant.angle; nx = clamp(nx, 1, W - 1); }
    if (ny < 1 || ny > H - 1) { ant.angle = -ant.angle; ny = clamp(ny, 1, H - 1); }

    const wc = Math.floor(nx / CELL), wr = Math.floor(ny / CELL);
    if (wc >= 0 && wr >= 0 && wc < gw && wr < gh && wall[idx(wc, wr)]) {
      // Reflect back and randomly veer to slide along the barrier.
      ant.angle += Math.PI + rand(-0.6, 0.6);
      nx = ant.x; ny = ant.y;
    }

    ant.x = nx; ant.y = ny;
    ant.since++;

    // Errand transitions.
    if (!ant.carrying) {
      for (const f of food) {
        if (f.amount > 0 && dist2(ant.x, ant.y, f.x, f.y) < f.r * f.r) {
          ant.carrying = true;
          ant.since = 0;         // reset the gradient clock at the source
          f.amount -= 1;
          if (f.amount <= 0) f.r = 0;
          ant.angle += Math.PI; // turn around toward home
          break;
        }
      }
    } else if (dist2(ant.x, ant.y, nest.x, nest.y) < nest.r * nest.r) {
      ant.carrying = false;
      collected++;
      ant.angle += Math.PI;
    }
  }

  function dist2(ax, ay, bx, by) {
    const dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
  }

  function depositAndDecay() {
    // Ants lay pheromone marking where they've been:
    //  returning ants strengthen "toFood" (a path others can follow to food),
    //  searchers strengthen "toHome" near the nest. Deposit is scaled by the
    //  ant's fading strength so trails are strongest near the event that reset
    //  it — this builds a gradient that points along the trail.
    const dep = params.deposit;
    for (const ant of ants) {
      if (!ant.carrying) continue;   // only laden ants lay the food trail
      const cx = Math.floor(ant.x / CELL), cy = Math.floor(ant.y / CELL);
      if (cx < 0 || cy < 0 || cx >= gw || cy >= gh) continue;
      const k = idx(cx, cy);
      if (wall[k]) continue;
      // Deposit fades with steps since pickup, so the trail is brightest near
      // the food and gently weaker toward the nest. That gradient lets an
      // outbound searcher tell which way along the trail leads to the food —
      // the floor keeps it detectable even at the busy nest end.
      const g = 0.4 + 0.6 * Math.exp(-ant.since / 180);
      toFood[k] = Math.min(MAX_PH, toFood[k] + dep * g);
    }

    // Food gives off a faint, short-range odour so a searcher that wanders
    // close will lock on — long-range discovery is still pure exploration.
    for (const f of food) {
      if (f.amount > 0) stampDisc(toFood, f.x, f.y, Math.max(1, Math.round(f.r / CELL / 2)), FOOD_SOURCE);
    }

    diffuseEvaporate(toFood);
  }

  function stampDisc(arr, x, y, rc, val) {
    const ccx = Math.floor(x / CELL), ccy = Math.floor(y / CELL);
    for (let oy = -rc; oy <= rc; oy++) {
      for (let ox = -rc; ox <= rc; ox++) {
        if (ox * ox + oy * oy > rc * rc) continue;
        const gx = ccx + ox, gy = ccy + oy;
        if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) continue;
        const k = idx(gx, gy);
        if (wall[k]) continue;
        arr[k] = Math.min(MAX_PH, arr[k] + val);
      }
    }
  }

  // Blend each cell toward its 4-neighbour average (diffusion), then evaporate.
  // Walls are no-flux: pheromone neither enters nor crosses them.
  function diffuseEvaporate(arr) {
    const keep = 1 - params.evaporation;
    const d = DIFFUSE;
    for (let y = 0; y < gh; y++) {
      for (let x = 0; x < gw; x++) {
        const k = y * gw + x;
        if (wall[k]) { tmp[k] = 0; continue; }
        let sum = 0, n = 0;
        if (x > 0 && !wall[k - 1]) { sum += arr[k - 1]; n++; }
        if (x < gw - 1 && !wall[k + 1]) { sum += arr[k + 1]; n++; }
        if (y > 0 && !wall[k - gw]) { sum += arr[k - gw]; n++; }
        if (y < gh - 1 && !wall[k + gw]) { sum += arr[k + gw]; n++; }
        const avg = n ? sum / n : arr[k];
        tmp[k] = (arr[k] * (1 - d) + avg * d) * keep;
      }
    }
    arr.set(tmp);
  }

  // ── Rendering ───────────────────────────────────────────────
  function draw() {
    ctx.fillStyle = '#070a12';
    ctx.fillRect(0, 0, W, H);

    if (params.showPheromones) drawPheromones();
    drawWalls();
    drawFood();
    drawNest();
    drawAnts();
  }

  function drawPheromones() {
    const data = field.data;
    for (let i = 0; i < toFood.length; i++) {
      const f = toFood[i] > 255 ? 255 : toFood[i];
      const h = toHome[i] > 255 ? 255 : toHome[i];
      const p = i * 4;
      // Food trail → bright green ridge; home field → faint blue haze so the
      // gradient home is visible without drowning the emergent trails.
      const hb = h * 0.14;
      data[p]     = hb * 0.5;
      data[p + 1] = f * 0.62 + hb * 0.7;
      data[p + 2] = f * 0.34 + hb * 1.6;
      data[p + 3] = Math.min(215, f * 1.25 + hb * 1.2);
    }
    // Blit the low-res field, scaled up, without smoothing artifacts washing it out.
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    // Draw via a temp canvas so we can scale the ImageData.
    if (!draw._tmp || draw._tmp.width !== gw || draw._tmp.height !== gh) {
      draw._tmp = document.createElement('canvas');
      draw._tmp.width = gw; draw._tmp.height = gh;
      draw._tmpCtx = draw._tmp.getContext('2d');
    }
    draw._tmpCtx.putImageData(field, 0, 0);
    ctx.globalAlpha = 0.9;
    ctx.drawImage(draw._tmp, 0, 0, gw, gh, 0, 0, W, H);
    ctx.restore();
  }

  function drawWalls() {
    ctx.fillStyle = 'rgba(150,165,205,0.85)';
    for (let cy = 0; cy < gh; cy++) {
      for (let cx = 0; cx < gw; cx++) {
        if (wall[idx(cx, cy)]) ctx.fillRect(cx * CELL, cy * CELL, CELL, CELL);
      }
    }
  }

  function drawFood() {
    for (const f of food) {
      if (f.amount <= 0) continue;
      const g = ctx.createRadialGradient(f.x, f.y, 0, f.x, f.y, f.r);
      g.addColorStop(0, 'rgba(243,155,210,0.95)');
      g.addColorStop(1, 'rgba(243,155,210,0.12)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(f.x, f.y, f.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawNest() {
    const g = ctx.createRadialGradient(nest.x, nest.y, 2, nest.x, nest.y, nest.r + 6);
    g.addColorStop(0, 'rgba(255,210,140,0.95)');
    g.addColorStop(1, 'rgba(255,170,90,0.05)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(nest.x, nest.y, nest.r + 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,200,120,0.8)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(nest.x, nest.y, nest.r, 0, Math.PI * 2);
    ctx.stroke();
  }

  function drawAnts() {
    for (const ant of ants) {
      ctx.fillStyle = ant.carrying ? '#6ef3c4' : '#e7ecff';
      ctx.beginPath();
      ctx.arc(ant.x, ant.y, ant.carrying ? 2.1 : 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  // ── Main loop ───────────────────────────────────────────────
  function frame() {
    if (running) step();
    draw();
    if (running) updateStats();
    requestAnimationFrame(frame);
  }

  // ── UI wiring ───────────────────────────────────────────────
  const el = (id) => document.getElementById(id);

  function bindSlider(id, key, fmt) {
    const input = el(id);
    const out = el(id + 'Val');
    const apply = () => {
      params[key] = parseFloat(input.value);
      if (out) out.textContent = fmt ? fmt(params[key]) : input.value;
    };
    input.addEventListener('input', apply);
    apply();
  }

  function updateStats() {
    el('foodVal').textContent = collected;
    let remaining = 0;
    for (const f of food) remaining += Math.max(0, f.amount);
    el('storeVal').textContent = Math.round(remaining);
    const carrying = ants.reduce((n, a) => n + (a.carrying ? 1 : 0), 0);
    el('antsVal').textContent = ants.length + ' · ' + carrying + ' laden';
  }

  // Brush painting on the canvas.
  let painting = false;
  let wallsDirty = false;
  function canvasPos(e) {
    const rect = canvas.getBoundingClientRect();
    const cx = (e.touches ? e.touches[0].clientX : e.clientX) - rect.left;
    const cy = (e.touches ? e.touches[0].clientY : e.clientY) - rect.top;
    return { x: cx * (W / rect.width), y: cy * (H / rect.height) };
  }

  function paint(x, y) {
    if (params.brush === 'food') {
      addFood(x, y, 20);
    } else {
      // wall or erase: stamp a disc into the wall grid.
      const val = params.brush === 'wall' ? 1 : 0;
      const rc = 4;
      const ccx = Math.floor(x / CELL), ccy = Math.floor(y / CELL);
      for (let oy = -rc; oy <= rc; oy++) {
        for (let ox = -rc; ox <= rc; ox++) {
          if (ox * ox + oy * oy > rc * rc) continue;
          const gx = ccx + ox, gy = ccy + oy;
          if (gx < 0 || gy < 0 || gx >= gw || gy >= gh) continue;
          wall[idx(gx, gy)] = val;
          if (val) toFood[idx(gx, gy)] = 0;
        }
      }
      wallsDirty = true;
    }
  }

  function setBrush(b) {
    params.brush = b;
    for (const id of ['brushFood', 'brushWall', 'brushErase']) {
      el(id).classList.toggle('primary', el(id).dataset.brush === b);
    }
  }

  function initEvents() {
    const start = (e) => {
      painting = true;
      const p = canvasPos(e);
      // Food is placed once per click; walls paint continuously.
      paint(p.x, p.y);
      if (params.brush === 'food') painting = false;
      e.preventDefault();
    };
    const move = (e) => {
      if (!painting) return;
      const p = canvasPos(e);
      paint(p.x, p.y);
      e.preventDefault();
    };
    const end = () => {
      painting = false;
      if (wallsDirty) { computeHomeField(); wallsDirty = false; }
    };

    canvas.addEventListener('mousedown', start);
    canvas.addEventListener('mousemove', move);
    window.addEventListener('mouseup', end);
    canvas.addEventListener('touchstart', start, { passive: false });
    canvas.addEventListener('touchmove', move, { passive: false });
    window.addEventListener('touchend', end);

    bindSlider('count', 'count', (v) => v.toFixed(0));
    bindSlider('sensorDist', 'sensorDist', (v) => v.toFixed(0));
    bindSlider('sensorAngle', 'sensorAngle', (v) => v.toFixed(2));
    bindSlider('turnSpeed', 'turnSpeed', (v) => v.toFixed(2));
    bindSlider('wander', 'wander', (v) => v.toFixed(2));
    bindSlider('speed', 'speed', (v) => v.toFixed(1));
    bindSlider('evaporation', 'evaporation', (v) => v.toFixed(3));
    bindSlider('deposit', 'deposit', (v) => v.toFixed(0));

    // Re-population when the count slider settles.
    el('count').addEventListener('change', () => {
      const target = Math.min(MAX_ANTS, Math.round(params.count));
      if (target > ants.length) {
        while (ants.length < target) ants.push(makeAnt());
      } else {
        ants.length = target;
      }
    });

    el('playBtn').addEventListener('click', () => {
      running = !running;
      el('playBtn').textContent = running ? 'Pause' : 'Play';
      el('playBtn').classList.toggle('primary', running);
    });
    el('resetBtn').addEventListener('click', reset);
    el('clearWallsBtn').addEventListener('click', () => { wall.fill(0); computeHomeField(); });
    el('pheroBtn').addEventListener('click', () => {
      params.showPheromones = !params.showPheromones;
      el('pheroBtn').textContent = 'Pheromones: ' + (params.showPheromones ? 'on' : 'off');
    });

    for (const id of ['brushFood', 'brushWall', 'brushErase']) {
      el(id).addEventListener('click', () => setBrush(el(id).dataset.brush));
    }

    window.addEventListener('resize', () => { resize(); });
  }

  // ── Boot ────────────────────────────────────────────────────
  resize();
  seedFood();
  spawnAnts(params.count);
  setBrush('food');
  initEvents();
  requestAnimationFrame(frame);

  // Console hook, mirroring the other sims in this collection. Advance the sim
  // by hand with `ants.steps(600)` (handy when a background tab throttles
  // requestAnimationFrame), read the colony with `ants.stats()`, start over
  // with `ants.reset()`, or live-tweak behaviour via `ants.params`.
  window.ants = {
    steps(n = 1) { for (let i = 0; i < n; i++) step(); draw(); updateStats(); return this.stats(); },
    reset() { reset(); return this.stats(); },
    stats() {
      let world = 0, laden = 0;
      for (const f of food) world += Math.max(0, f.amount);
      for (const a of ants) if (a.carrying) laden++;
      return { collected, world: Math.round(world), ants: ants.length, laden };
    },
    params,
  };
})();
