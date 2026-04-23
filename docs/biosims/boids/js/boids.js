(() => {
  const canvas = document.getElementById('stage');
  const ctx = canvas.getContext('2d');

  const params = {
    count: 250,
    vision: 60,
    separation: 1.5,
    alignment: 1.0,
    cohesion: 1.0,
    maxSpeed: 3.0,
    minSpeed: 1.0,
    margin: 60,
    turnFactor: 0.25,
    trails: false,
  };

  let boids = [];
  let running = true;
  let mouse = { x: 0, y: 0, active: false };

  function resize() {
    const rect = canvas.parentElement.getBoundingClientRect();
    const w = Math.max(320, Math.floor(rect.width));
    const h = Math.max(320, Math.round(w * 0.62));
    const dpr = window.devicePixelRatio || 1;
    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function logicalSize() {
    const dpr = window.devicePixelRatio || 1;
    return { w: canvas.width / dpr, h: canvas.height / dpr };
  }

  function rand(min, max) { return Math.random() * (max - min) + min; }

  function makeBoid(w, h) {
    const a = Math.random() * Math.PI * 2;
    const s = rand(1.5, params.maxSpeed);
    return {
      x: Math.random() * w,
      y: Math.random() * h,
      vx: Math.cos(a) * s,
      vy: Math.sin(a) * s,
      hue: rand(140, 210),
    };
  }

  function seed() {
    const { w, h } = logicalSize();
    boids = Array.from({ length: params.count }, () => makeBoid(w, h));
  }

  function syncCount() {
    const { w, h } = logicalSize();
    if (boids.length < params.count) {
      while (boids.length < params.count) boids.push(makeBoid(w, h));
    } else if (boids.length > params.count) {
      boids.length = params.count;
    }
  }

  function step() {
    const { w, h } = logicalSize();
    const vision = params.vision;
    const vision2 = vision * vision;
    const protected2 = (vision * 0.35) * (vision * 0.35);

    for (let i = 0; i < boids.length; i++) {
      const b = boids[i];
      let avgVx = 0, avgVy = 0;
      let cx = 0, cy = 0;
      let closeDx = 0, closeDy = 0;
      let neighbors = 0;

      for (let j = 0; j < boids.length; j++) {
        if (i === j) continue;
        const o = boids[j];
        const dx = b.x - o.x;
        const dy = b.y - o.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < vision2) {
          if (d2 < protected2) {
            closeDx += dx;
            closeDy += dy;
          }
          avgVx += o.vx;
          avgVy += o.vy;
          cx += o.x;
          cy += o.y;
          neighbors++;
        }
      }

      if (neighbors > 0) {
        avgVx /= neighbors; avgVy /= neighbors;
        cx /= neighbors; cy /= neighbors;
        b.vx += (avgVx - b.vx) * 0.05 * params.alignment;
        b.vy += (avgVy - b.vy) * 0.05 * params.alignment;
        b.vx += (cx - b.x) * 0.0012 * params.cohesion;
        b.vy += (cy - b.y) * 0.0012 * params.cohesion;
      }

      b.vx += closeDx * 0.045 * params.separation;
      b.vy += closeDy * 0.045 * params.separation;

      // Avoid mouse (predator)
      if (mouse.active) {
        const dx = b.x - mouse.x;
        const dy = b.y - mouse.y;
        const d2 = dx * dx + dy * dy;
        const fleeR = 110;
        if (d2 < fleeR * fleeR && d2 > 0.01) {
          const d = Math.sqrt(d2);
          b.vx += (dx / d) * (1 - d / fleeR) * 1.8;
          b.vy += (dy / d) * (1 - d / fleeR) * 1.8;
        }
      }

      // Edge turn
      if (b.x < params.margin) b.vx += params.turnFactor;
      else if (b.x > w - params.margin) b.vx -= params.turnFactor;
      if (b.y < params.margin) b.vy += params.turnFactor;
      else if (b.y > h - params.margin) b.vy -= params.turnFactor;

      // Speed clamp
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > params.maxSpeed) {
        b.vx = (b.vx / sp) * params.maxSpeed;
        b.vy = (b.vy / sp) * params.maxSpeed;
      } else if (sp < params.minSpeed && sp > 0) {
        b.vx = (b.vx / sp) * params.minSpeed;
        b.vy = (b.vy / sp) * params.minSpeed;
      }

      b.x += b.vx;
      b.y += b.vy;
    }
  }

  function draw() {
    const { w, h } = logicalSize();
    if (params.trails) {
      ctx.fillStyle = 'rgba(5, 7, 15, 0.18)';
      ctx.fillRect(0, 0, w, h);
    } else {
      ctx.clearRect(0, 0, w, h);
      // subtle gradient wash
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.6);
      g.addColorStop(0, 'rgba(18, 28, 54, 0.55)');
      g.addColorStop(1, 'rgba(5, 7, 15, 0.95)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    for (const b of boids) {
      const angle = Math.atan2(b.vy, b.vx);
      ctx.save();
      ctx.translate(b.x, b.y);
      ctx.rotate(angle);
      ctx.fillStyle = `hsl(${b.hue}, 85%, 68%)`;
      ctx.shadowBlur = 8;
      ctx.shadowColor = `hsla(${b.hue}, 85%, 60%, 0.7)`;
      ctx.beginPath();
      ctx.moveTo(7, 0);
      ctx.lineTo(-5, 4);
      ctx.lineTo(-3, 0);
      ctx.lineTo(-5, -4);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    if (mouse.active) {
      ctx.beginPath();
      ctx.arc(mouse.x, mouse.y, 110, 0, Math.PI * 2);
      ctx.strokeStyle = 'rgba(243, 155, 210, 0.4)';
      ctx.lineWidth = 1;
      ctx.stroke();
    }
  }

  function loop() {
    if (running) step();
    draw();
    requestAnimationFrame(loop);
  }

  // --- UI wiring ---
  function bindRange(id, valId, key, parser = parseFloat) {
    const el = document.getElementById(id);
    const valEl = document.getElementById(valId);
    const update = () => {
      params[key] = parser(el.value);
      valEl.textContent = typeof params[key] === 'number' && !Number.isInteger(params[key])
        ? params[key].toFixed(2).replace(/\.?0+$/, '')
        : params[key];
    };
    el.addEventListener('input', () => {
      update();
      if (key === 'count') syncCount();
    });
    update();
  }

  bindRange('count', 'countVal', 'count', v => parseInt(v, 10));
  bindRange('vision', 'visionVal', 'vision', v => parseInt(v, 10));
  bindRange('sep', 'sepVal', 'separation');
  bindRange('ali', 'aliVal', 'alignment');
  bindRange('coh', 'cohVal', 'cohesion');
  bindRange('speed', 'speedVal', 'maxSpeed');

  const playBtn = document.getElementById('playBtn');
  playBtn.addEventListener('click', () => {
    running = !running;
    playBtn.textContent = running ? 'Pause' : 'Play';
    playBtn.classList.toggle('primary', running);
  });

  document.getElementById('resetBtn').addEventListener('click', () => { seed(); });

  const trailsBtn = document.getElementById('trailsBtn');
  trailsBtn.addEventListener('click', () => {
    params.trails = !params.trails;
    trailsBtn.textContent = `Trails: ${params.trails ? 'on' : 'off'}`;
  });

  function pointerPos(evt) {
    const rect = canvas.getBoundingClientRect();
    const x = (evt.clientX ?? evt.touches?.[0]?.clientX) - rect.left;
    const y = (evt.clientY ?? evt.touches?.[0]?.clientY) - rect.top;
    return { x, y };
  }
  canvas.addEventListener('pointerdown', e => {
    const p = pointerPos(e); mouse.x = p.x; mouse.y = p.y; mouse.active = true;
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener('pointermove', e => {
    if (!mouse.active) return;
    const p = pointerPos(e); mouse.x = p.x; mouse.y = p.y;
  });
  const endPointer = () => { mouse.active = false; };
  canvas.addEventListener('pointerup', endPointer);
  canvas.addEventListener('pointercancel', endPointer);
  canvas.addEventListener('pointerleave', endPointer);

  window.addEventListener('resize', () => {
    resize();
  });

  resize();
  seed();
  loop();
})();
