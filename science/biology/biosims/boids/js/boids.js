(() => {
  const canvas2d = document.getElementById('stage2d');
  const canvas3d = document.getElementById('stage3d');
  const ctx = canvas2d.getContext('2d');

  const MAX_BOIDS = 600;
  const BOUND_3D = 360; // half-extent of cubic arena in 3D

  const params = {
    count: 250,
    vision: 60,
    separation: 1.5,
    alignment: 1.0,
    cohesion: 1.0,
    maxSpeed: 3.0,
    minSpeed: 1.0,
    margin: 60,     // 2D edge margin
    margin3d: 60,   // 3D edge margin
    turnFactor: 0.25,
    trails: false,
    mode: '2D',
  };

  let running = true;

  // ── 2D state ───────────────────────────────────────────────
  let boids2d = [];
  let mouse = { x: 0, y: 0, active: false };

  // ── 3D state ───────────────────────────────────────────────
  let boids3d = [];
  let three = null;
  let orbit = {
    yaw: 0.5, pitch: 0.15, distance: 900,
    dragging: false, lastX: 0, lastY: 0,
  };

  // ── Utilities ───────────────────────────────────────────────
  function rand(min, max) { return Math.random() * (max - min) + min; }

  function activeCanvas() { return params.mode === '2D' ? canvas2d : canvas3d; }

  function logicalSize() {
    const c = activeCanvas();
    const dpr = window.devicePixelRatio || 1;
    return { w: c.width / dpr, h: c.height / dpr };
  }

  function resize() {
    const stage = canvas2d.parentElement;
    const rect = stage.getBoundingClientRect();
    const w = Math.max(320, Math.floor(rect.width));
    const h = Math.max(320, Math.round(w * 0.62));
    const dpr = window.devicePixelRatio || 1;

    // 2D canvas
    canvas2d.width = w * dpr;
    canvas2d.height = h * dpr;
    canvas2d.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    // 3D canvas
    canvas3d.width = w * dpr;
    canvas3d.height = h * dpr;
    canvas3d.style.height = h + 'px';
    if (three) {
      three.renderer.setPixelRatio(dpr);
      three.renderer.setSize(w, h, false);
      three.camera.aspect = w / h;
      three.camera.updateProjectionMatrix();
    }
  }

  // ── 2D boids ────────────────────────────────────────────────
  function makeBoid2D(w, h) {
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

  function seed2D() {
    const { w, h } = logicalSize();
    boids2d = Array.from({ length: params.count }, () => makeBoid2D(w, h));
  }

  function syncCount2D() {
    const { w, h } = logicalSize();
    while (boids2d.length < params.count) boids2d.push(makeBoid2D(w, h));
    if (boids2d.length > params.count) boids2d.length = params.count;
  }

  function step2D() {
    const { w, h } = logicalSize();
    const vision = params.vision;
    const vision2 = vision * vision;
    const protected2 = (vision * 0.35) * (vision * 0.35);

    for (let i = 0; i < boids2d.length; i++) {
      const b = boids2d[i];
      let avgVx = 0, avgVy = 0;
      let cx = 0, cy = 0;
      let closeDx = 0, closeDy = 0;
      let neighbors = 0;

      for (let j = 0; j < boids2d.length; j++) {
        if (i === j) continue;
        const o = boids2d[j];
        const dx = b.x - o.x;
        const dy = b.y - o.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < vision2) {
          if (d2 < protected2) { closeDx += dx; closeDy += dy; }
          avgVx += o.vx; avgVy += o.vy;
          cx += o.x; cy += o.y;
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

      if (b.x < params.margin) b.vx += params.turnFactor;
      else if (b.x > w - params.margin) b.vx -= params.turnFactor;
      if (b.y < params.margin) b.vy += params.turnFactor;
      else if (b.y > h - params.margin) b.vy -= params.turnFactor;

      const sp = Math.hypot(b.vx, b.vy);
      if (sp > params.maxSpeed) { b.vx = (b.vx / sp) * params.maxSpeed; b.vy = (b.vy / sp) * params.maxSpeed; }
      else if (sp < params.minSpeed && sp > 0) { b.vx = (b.vx / sp) * params.minSpeed; b.vy = (b.vy / sp) * params.minSpeed; }

      b.x += b.vx;
      b.y += b.vy;
    }
  }

  function draw2D() {
    const { w, h } = logicalSize();
    if (params.trails) {
      ctx.fillStyle = 'rgba(5, 7, 15, 0.18)';
      ctx.fillRect(0, 0, w, h);
    } else {
      ctx.clearRect(0, 0, w, h);
      const g = ctx.createRadialGradient(w / 2, h / 2, 0, w / 2, h / 2, Math.max(w, h) * 0.6);
      g.addColorStop(0, 'rgba(18, 28, 54, 0.55)');
      g.addColorStop(1, 'rgba(5, 7, 15, 0.95)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }

    for (const b of boids2d) {
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

  // ── 3D boids ────────────────────────────────────────────────
  function makeBoid3D() {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    const s = rand(1.5, params.maxSpeed);
    return {
      x: rand(-BOUND_3D * 0.7, BOUND_3D * 0.7),
      y: rand(-BOUND_3D * 0.7, BOUND_3D * 0.7),
      z: rand(-BOUND_3D * 0.7, BOUND_3D * 0.7),
      vx: Math.sin(phi) * Math.cos(theta) * s,
      vy: Math.sin(phi) * Math.sin(theta) * s,
      vz: Math.cos(phi) * s,
      hue: rand(140, 210),
    };
  }

  function seed3D() {
    boids3d = Array.from({ length: params.count }, () => makeBoid3D());
  }

  function syncCount3D() {
    while (boids3d.length < params.count) boids3d.push(makeBoid3D());
    if (boids3d.length > params.count) boids3d.length = params.count;
  }

  function step3D() {
    const vision = params.vision;
    const vision2 = vision * vision;
    const protected2 = (vision * 0.35) * (vision * 0.35);

    for (let i = 0; i < boids3d.length; i++) {
      const b = boids3d[i];
      let avgVx = 0, avgVy = 0, avgVz = 0;
      let cx = 0, cy = 0, cz = 0;
      let closeDx = 0, closeDy = 0, closeDz = 0;
      let neighbors = 0;

      for (let j = 0; j < boids3d.length; j++) {
        if (i === j) continue;
        const o = boids3d[j];
        const dx = b.x - o.x;
        const dy = b.y - o.y;
        const dz = b.z - o.z;
        const d2 = dx * dx + dy * dy + dz * dz;
        if (d2 < vision2) {
          if (d2 < protected2) { closeDx += dx; closeDy += dy; closeDz += dz; }
          avgVx += o.vx; avgVy += o.vy; avgVz += o.vz;
          cx += o.x; cy += o.y; cz += o.z;
          neighbors++;
        }
      }
      if (neighbors > 0) {
        avgVx /= neighbors; avgVy /= neighbors; avgVz /= neighbors;
        cx /= neighbors; cy /= neighbors; cz /= neighbors;
        b.vx += (avgVx - b.vx) * 0.05 * params.alignment;
        b.vy += (avgVy - b.vy) * 0.05 * params.alignment;
        b.vz += (avgVz - b.vz) * 0.05 * params.alignment;
        b.vx += (cx - b.x) * 0.0012 * params.cohesion;
        b.vy += (cy - b.y) * 0.0012 * params.cohesion;
        b.vz += (cz - b.z) * 0.0012 * params.cohesion;
      }
      b.vx += closeDx * 0.045 * params.separation;
      b.vy += closeDy * 0.045 * params.separation;
      b.vz += closeDz * 0.045 * params.separation;

      // Soft wall turn
      const m = params.margin3d;
      if (b.x < -BOUND_3D + m) b.vx += params.turnFactor;
      else if (b.x >  BOUND_3D - m) b.vx -= params.turnFactor;
      if (b.y < -BOUND_3D + m) b.vy += params.turnFactor;
      else if (b.y >  BOUND_3D - m) b.vy -= params.turnFactor;
      if (b.z < -BOUND_3D + m) b.vz += params.turnFactor;
      else if (b.z >  BOUND_3D - m) b.vz -= params.turnFactor;

      const sp = Math.hypot(b.vx, b.vy, b.vz);
      if (sp > params.maxSpeed) {
        b.vx = (b.vx / sp) * params.maxSpeed;
        b.vy = (b.vy / sp) * params.maxSpeed;
        b.vz = (b.vz / sp) * params.maxSpeed;
      } else if (sp < params.minSpeed && sp > 0) {
        b.vx = (b.vx / sp) * params.minSpeed;
        b.vy = (b.vy / sp) * params.minSpeed;
        b.vz = (b.vz / sp) * params.minSpeed;
      }

      b.x += b.vx;
      b.y += b.vy;
      b.z += b.vz;
    }
  }

  function initThree() {
    const THREE = window.THREE;
    if (!THREE) { console.error('Three.js not loaded'); return; }

    const renderer = new THREE.WebGLRenderer({ canvas: canvas3d, antialias: true, alpha: false });
    renderer.setClearColor(0x05070f, 1);
    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05070f, 0.0011);

    const camera = new THREE.PerspectiveCamera(55, 1, 0.5, 5000);

    // Lights
    scene.add(new THREE.AmbientLight(0xb4c4ff, 0.8));
    const key = new THREE.DirectionalLight(0xffffff, 1.1);
    key.position.set(300, 420, 300);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xf39bd2, 0.45);
    rim.position.set(-250, -200, -150);
    scene.add(rim);
    const fill = new THREE.HemisphereLight(0x8ab4ff, 0x1a2040, 0.4);
    scene.add(fill);

    // Arena wireframe
    const box = new THREE.BoxGeometry(BOUND_3D * 2, BOUND_3D * 2, BOUND_3D * 2);
    const edges = new THREE.EdgesGeometry(box);
    const arena = new THREE.LineSegments(
      edges,
      new THREE.LineBasicMaterial({ color: 0x4c5ea0, transparent: true, opacity: 0.35 })
    );
    scene.add(arena);

    // Instanced boids: cone pointing along -Z (so lookAt forward works)
    const coneGeo = new THREE.ConeGeometry(4.5, 18, 10);
    coneGeo.rotateX(-Math.PI / 2); // +Y tip → -Z tip
    const mat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      metalness: 0.1,
      roughness: 0.4,
    });
    const instMesh = new THREE.InstancedMesh(coneGeo, mat, MAX_BOIDS);
    instMesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    instMesh.count = params.count;
    // Initialize instance color buffer (setColorAt will fill it).
    const initColor = new THREE.Color(0x6ef3c4);
    for (let i = 0; i < MAX_BOIDS; i++) instMesh.setColorAt(i, initColor);
    scene.add(instMesh);

    three = {
      THREE, renderer, scene, camera, instMesh, arena,
      dummy: new THREE.Object3D(), tmpColor: new THREE.Color(),
    };
  }

  function updateCamera() {
    if (!three) return;
    const cy = Math.cos(orbit.yaw), sy = Math.sin(orbit.yaw);
    const cp = Math.cos(orbit.pitch), sp = Math.sin(orbit.pitch);
    const d = orbit.distance;
    three.camera.position.set(d * cp * sy, d * sp, d * cp * cy);
    three.camera.lookAt(0, 0, 0);
  }

  function draw3D() {
    if (!three) return;
    const { instMesh, dummy, tmpColor } = three;
    instMesh.count = boids3d.length;
    for (let i = 0; i < boids3d.length; i++) {
      const b = boids3d[i];
      dummy.position.set(b.x, b.y, b.z);
      const sp = Math.hypot(b.vx, b.vy, b.vz) || 1e-6;
      dummy.lookAt(b.x + b.vx / sp, b.y + b.vy / sp, b.z + b.vz / sp);
      dummy.updateMatrix();
      instMesh.setMatrixAt(i, dummy.matrix);
      tmpColor.setHSL(b.hue / 360, 0.8, 0.65);
      instMesh.setColorAt(i, tmpColor);
    }
    instMesh.instanceMatrix.needsUpdate = true;
    if (instMesh.instanceColor) instMesh.instanceColor.needsUpdate = true;

    updateCamera();
    three.renderer.render(three.scene, three.camera);
  }

  // ── Mode switching ──────────────────────────────────────────
  function setMode(m) {
    if (m === params.mode) return;
    params.mode = m;
    if (m === '3D') {
      if (!three) initThree();
      canvas2d.style.display = 'none';
      canvas3d.style.display = 'block';
      if (boids3d.length !== params.count) seed3D();
      resize();
    } else {
      canvas3d.style.display = 'none';
      canvas2d.style.display = 'block';
      resize();
    }
    mode2dBtn.classList.toggle('primary', m === '2D');
    mode3dBtn.classList.toggle('primary', m === '3D');
  }

  // ── Main loop ───────────────────────────────────────────────
  function loop() {
    if (running) {
      if (params.mode === '2D') step2D();
      else step3D();
    }
    if (params.mode === '2D') draw2D();
    else draw3D();
    requestAnimationFrame(loop);
  }

  // ── UI wiring ───────────────────────────────────────────────
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
      if (key === 'count') { syncCount2D(); syncCount3D(); }
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

  document.getElementById('resetBtn').addEventListener('click', () => {
    if (params.mode === '2D') seed2D();
    else seed3D();
  });

  const trailsBtn = document.getElementById('trailsBtn');
  trailsBtn.addEventListener('click', () => {
    params.trails = !params.trails;
    trailsBtn.textContent = `Trails: ${params.trails ? 'on' : 'off'}`;
  });

  const mode2dBtn = document.getElementById('mode2dBtn');
  const mode3dBtn = document.getElementById('mode3dBtn');
  mode2dBtn.addEventListener('click', () => setMode('2D'));
  mode3dBtn.addEventListener('click', () => setMode('3D'));

  // ── Pointer handling ─────────────────────────────────────────
  function pointerPosOn(c, evt) {
    const rect = c.getBoundingClientRect();
    const x = (evt.clientX ?? evt.touches?.[0]?.clientX) - rect.left;
    const y = (evt.clientY ?? evt.touches?.[0]?.clientY) - rect.top;
    return { x, y };
  }

  // 2D: pointer scares the flock
  canvas2d.addEventListener('pointerdown', e => {
    const p = pointerPosOn(canvas2d, e); mouse.x = p.x; mouse.y = p.y; mouse.active = true;
    canvas2d.setPointerCapture(e.pointerId);
  });
  canvas2d.addEventListener('pointermove', e => {
    if (!mouse.active) return;
    const p = pointerPosOn(canvas2d, e); mouse.x = p.x; mouse.y = p.y;
  });
  const endMouse = () => { mouse.active = false; };
  canvas2d.addEventListener('pointerup', endMouse);
  canvas2d.addEventListener('pointercancel', endMouse);
  canvas2d.addEventListener('pointerleave', endMouse);

  // 3D: pointer orbits the camera; wheel zooms
  canvas3d.addEventListener('pointerdown', e => {
    orbit.dragging = true;
    orbit.lastX = e.clientX;
    orbit.lastY = e.clientY;
    canvas3d.setPointerCapture(e.pointerId);
  });
  canvas3d.addEventListener('pointermove', e => {
    if (!orbit.dragging) return;
    const dx = e.clientX - orbit.lastX;
    const dy = e.clientY - orbit.lastY;
    orbit.lastX = e.clientX;
    orbit.lastY = e.clientY;
    orbit.yaw   -= dx * 0.006;
    orbit.pitch += dy * 0.006;
    const lim = Math.PI / 2 - 0.05;
    if (orbit.pitch >  lim) orbit.pitch =  lim;
    if (orbit.pitch < -lim) orbit.pitch = -lim;
  });
  const endOrbit = () => { orbit.dragging = false; };
  canvas3d.addEventListener('pointerup', endOrbit);
  canvas3d.addEventListener('pointercancel', endOrbit);
  canvas3d.addEventListener('pointerleave', endOrbit);
  canvas3d.addEventListener('wheel', e => {
    e.preventDefault();
    orbit.distance *= Math.exp(e.deltaY * 0.0012);
    orbit.distance = Math.max(200, Math.min(2200, orbit.distance));
  }, { passive: false });

  window.addEventListener('resize', resize);

  resize();
  seed2D();
  loop();
})();
