/* ============================================================================
 * Big Bang & Cosmic Web  —  3D (three.js)
 * ----------------------------------------------------------------------------
 * Matter is born at a hot singularity, expands into a periodic (toroidal) cube,
 * cools, and gravitationally collapses into the filaments and clusters of the
 * cosmic web. Gravity uses a 3D particle-mesh (PM) scheme on the CPU:
 *   1. deposit particle mass onto a grid (cloud-in-cell),
 *   2. smooth the density field (separable box-blur ≈ softened potential),
 *   3. accelerate each particle up the smoothed-density gradient (toward mass).
 * An expansion-drag term damps peculiar velocities so structure freezes out.
 * Rendered as additively-blended three.js points with an Unreal-bloom glow.
 * ========================================================================== */
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

// ── World / grid constants ────────────────────────────────────────────────
const L = 120;          // cube side length (world units), centred on origin
const G = 36;           // gravity grid resolution per axis
const NG = G * G * G;
const CELL = L / G;
const HALF = L * 0.5;

// ── Simulation state ──────────────────────────────────────────────────────
const S = {
  n: 16000,
  px: null, py: null, pz: null,
  vx: null, vy: null, vz: null,
  temp: null, dens: null,
  // render attribute buffers (shared with geometry)
  posAttr: null, valAttr: null, briAttr: null,
  // gravity grid fields
  rho: new Float32Array(NG),
  fld: new Float32Array(NG),
  tmp: new Float32Array(NG),
  fx: new Float32Array(NG),
  fy: new Float32Array(NG),
  fz: new Float32Array(NG),
  meanRho: 1, meanTemp: 1,
  // params
  grav: 1.0, reach: 5, drag: 0.28, energy: 1.0, speed: 1.0, bloom: 1.1,
  colorMode: "temp",
  // clock
  time: 0, paused: false,
};

// ── three.js objects ──────────────────────────────────────────────────────
let renderer, scene, camera, controls, composer, bloomPass;
let points, paletteTex, flashSprite, starfield;

// ── Palettes (build a 256×1 gradient texture for the shader) ───────────────
function lerp(a, b, t) { return a + (b - a) * t; }
function ramp(stops, t) {
  t = Math.max(0, Math.min(1, t));
  for (let i = 1; i < stops.length; i++) {
    if (t <= stops[i][0]) {
      const a = stops[i - 1], b = stops[i];
      const u = (t - a[0]) / (b[0] - a[0] || 1);
      return [lerp(a[1], b[1], u), lerp(a[2], b[2], u), lerp(a[3], b[3], u)];
    }
  }
  const l = stops[stops.length - 1];
  return [l[1], l[2], l[3]];
}
function paletteStops(mode) {
  if (mode === "density") return [
    [0.00, 18, 22, 60], [0.35, 40, 90, 200], [0.60, 80, 220, 235],
    [0.82, 255, 214, 120], [1.00, 255, 255, 245],
  ];
  if (mode === "speed") return [
    [0.00, 30, 60, 160], [0.45, 120, 200, 255],
    [0.75, 180, 255, 210], [1.00, 255, 255, 255],
  ];
  return [ // temperature (blackbody-ish): cool red → orange → white → blue-white
    [0.00, 120, 24, 16], [0.28, 235, 92, 30], [0.52, 255, 180, 90],
    [0.74, 255, 246, 220], [0.90, 205, 226, 255], [1.00, 150, 196, 255],
  ];
}
function buildPaletteTexture(mode) {
  const W = 256;
  const data = new Uint8Array(W * 4);
  const stops = paletteStops(mode);
  for (let i = 0; i < W; i++) {
    const c = ramp(stops, i / (W - 1));
    data[i * 4 + 0] = c[0]; data[i * 4 + 1] = c[1];
    data[i * 4 + 2] = c[2]; data[i * 4 + 3] = 255;
  }
  const tex = new THREE.DataTexture(data, W, 1, THREE.RGBAFormat);
  tex.needsUpdate = true;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  return tex;
}

// ── Radial sprite texture (for the Big Bang flash) ─────────────────────────
function radialTexture() {
  const c = document.createElement("canvas");
  c.width = c.height = 128;
  const g = c.getContext("2d");
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0.0, "rgba(255,255,255,1)");
  grad.addColorStop(0.25, "rgba(220,232,255,0.7)");
  grad.addColorStop(1.0, "rgba(140,170,255,0)");
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  t.needsUpdate = true;
  return t;
}

// ── Point shader: perspective-sized, palette-colored, soft round sprite ────
function makePointsMaterial() {
  return new THREE.ShaderMaterial({
    uniforms: {
      uPalette: { value: paletteTex },
      uPointScale: { value: 600.0 },
      uWorldSize: { value: 0.7 },
    },
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
    vertexShader: /* glsl */`
      attribute float aVal;
      attribute float aBri;
      varying float vVal;
      varying float vBri;
      uniform float uPointScale;
      uniform float uWorldSize;
      void main() {
        vVal = aVal;
        vBri = aBri;
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        gl_Position = projectionMatrix * mv;
        gl_PointSize = uWorldSize * uPointScale * (0.6 + vBri * 1.0) / max(0.0001, -mv.z);
        gl_PointSize = clamp(gl_PointSize, 1.0, 64.0);
      }
    `,
    fragmentShader: /* glsl */`
      precision mediump float;
      uniform sampler2D uPalette;
      varying float vVal;
      varying float vBri;
      void main() {
        vec2 d = gl_PointCoord - vec2(0.5);
        float r = length(d);
        if (r > 0.5) discard;
        float a = smoothstep(0.5, 0.0, r);
        a = pow(a, 1.6);
        vec3 col = texture2D(uPalette, vec2(clamp(vVal, 0.0, 1.0), 0.5)).rgb;
        gl_FragColor = vec4(col * (0.45 + vBri), a);
      }
    `,
  });
}

// ── Build / rebuild the particle system ────────────────────────────────────
function allocParticles(n) {
  S.n = n;
  S.px = new Float32Array(n); S.py = new Float32Array(n); S.pz = new Float32Array(n);
  S.vx = new Float32Array(n); S.vy = new Float32Array(n); S.vz = new Float32Array(n);
  S.temp = new Float32Array(n); S.dens = new Float32Array(n);

  const positions = new Float32Array(n * 3);
  const vals = new Float32Array(n);
  const bris = new Float32Array(n);

  const geo = new THREE.BufferGeometry();
  S.posAttr = new THREE.BufferAttribute(positions, 3).setUsage(THREE.DynamicDrawUsage);
  S.valAttr = new THREE.BufferAttribute(vals, 1).setUsage(THREE.DynamicDrawUsage);
  S.briAttr = new THREE.BufferAttribute(bris, 1).setUsage(THREE.DynamicDrawUsage);
  geo.setAttribute("position", S.posAttr);
  geo.setAttribute("aVal", S.valAttr);
  geo.setAttribute("aBri", S.briAttr);
  geo.setDrawRange(0, n);
  // generous bounding sphere so points are never frustum-culled away
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(0, 0, 0), L * 1.5);

  if (points) {
    points.geometry.dispose();
    points.geometry = geo;
  } else {
    points = new THREE.Points(geo, makePointsMaterial());
    points.frustumCulled = false;
    scene.add(points);
  }
}

// ── Big Bang: seed all particles at the hot singularity ────────────────────
function bigBang(n) {
  if (n && n !== S.n) allocParticles(n);
  else if (!S.px) allocParticles(S.n);

  const N = S.n;
  const base = L * 0.012 * S.energy;   // outward Hubble-flow speed
  const seedR = L * 0.02;              // initial hot-spot radius
  const pos = S.posAttr.array;

  for (let i = 0; i < N; i++) {
    // random direction on the unit sphere
    const u = Math.random() * 2 - 1;
    const phi = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const dx = s * Math.cos(phi), dy = s * Math.sin(phi), dz = u;
    const r = seedR * Math.cbrt(Math.random());

    const x = dx * r, y = dy * r, z = dz * r;
    S.px[i] = x; S.py[i] = y; S.pz[i] = z;
    pos[i * 3] = x; pos[i * 3 + 1] = y; pos[i * 3 + 2] = z;

    const spd = base * (0.55 + Math.random() * 0.9);
    const jit = base * 0.45;
    S.vx[i] = dx * spd + (Math.random() - 0.5) * jit;
    S.vy[i] = dy * spd + (Math.random() - 0.5) * jit;
    S.vz[i] = dz * spd + (Math.random() - 0.5) * jit;
    S.temp[i] = 1.0;
    S.valAttr.array[i] = 1.0;
    S.briAttr.array[i] = 1.0;
  }
  S.posAttr.needsUpdate = true;
  S.valAttr.needsUpdate = true;
  S.briAttr.needsUpdate = true;
  S.time = 0;

  if (flashSprite) {
    flashSprite.material.opacity = 1.0;
    flashSprite.scale.setScalar(L * 0.05);
  }
}

// ── Gravity (3D particle-mesh, periodic) ───────────────────────────────────
function wrap(i) { return i < 0 ? i + G : (i >= G ? i - G : i); }
function gi(x, y, z) { return (z * G + y) * G + x; }

function computeGravity() {
  const { rho } = S;
  rho.fill(0);
  const n = S.n;

  // Cloud-in-cell deposit (8 corners, periodic).
  for (let i = 0; i < n; i++) {
    const cx = (S.px[i] + HALF) / CELL - 0.5;
    const cy = (S.py[i] + HALF) / CELL - 0.5;
    const cz = (S.pz[i] + HALF) / CELL - 0.5;
    const x0 = Math.floor(cx), y0 = Math.floor(cy), z0 = Math.floor(cz);
    const tx = cx - x0, ty = cy - y0, tz = cz - z0;
    const xa = wrap(x0), xb = wrap(x0 + 1);
    const ya = wrap(y0), yb = wrap(y0 + 1);
    const za = wrap(z0), zb = wrap(z0 + 1);
    const wx0 = 1 - tx, wy0 = 1 - ty, wz0 = 1 - tz;
    rho[gi(xa, ya, za)] += wx0 * wy0 * wz0;
    rho[gi(xb, ya, za)] += tx * wy0 * wz0;
    rho[gi(xa, yb, za)] += wx0 * ty * wz0;
    rho[gi(xb, yb, za)] += tx * ty * wz0;
    rho[gi(xa, ya, zb)] += wx0 * wy0 * tz;
    rho[gi(xb, ya, zb)] += tx * wy0 * tz;
    rho[gi(xa, yb, zb)] += wx0 * ty * tz;
    rho[gi(xb, yb, zb)] += tx * ty * tz;
  }
  S.meanRho = n / NG;

  // Smooth density → softened potential proxy (separable 3-tap box blur).
  S.fld.set(rho);
  const passes = S.reach | 0;
  for (let p = 0; p < passes; p++) {
    blurAxis(S.fld, S.tmp, 1);        // x
    blurAxis(S.tmp, S.fld, G);        // y
    blurAxis(S.fld, S.tmp, G * G);    // z
    S.fld.set(S.tmp);
  }

  // Gradient of the smoothed field (central differences, periodic).
  const fld = S.fld, fx = S.fx, fy = S.fy, fz = S.fz;
  for (let z = 0; z < G; z++) {
    for (let y = 0; y < G; y++) {
      for (let x = 0; x < G; x++) {
        const idx = gi(x, y, z);
        fx[idx] = (fld[gi(wrap(x + 1), y, z)] - fld[gi(wrap(x - 1), y, z)]) * 0.5;
        fy[idx] = (fld[gi(x, wrap(y + 1), z)] - fld[gi(x, wrap(y - 1), z)]) * 0.5;
        fz[idx] = (fld[gi(x, y, wrap(z + 1))] - fld[gi(x, y, wrap(z - 1))]) * 0.5;
      }
    }
  }
}

// Separable box blur along one axis given its linear stride. Wraps within G
// along that axis. Grid is laid out as index = (z*G + y)*G + x, so the strides
// are 1 (x), G (y), and G*G (z). A "line" along the axis is the set
// { off + k*stride : k = 0..G-1 }; we enumerate every such line.
function blurAxis(src, dst, stride) {
  const span = stride * G;       // wrap-around length of one line along this axis
  const inv3 = 1 / 3;
  for (let block = 0; block < NG; block += span) {
    for (let a = 0; a < stride; a++) {
      const base = block + a;
      for (let k = 0; k < G; k++) {
        const i = base + k * stride;
        const im = base + wrap(k - 1) * stride;
        const ip = base + wrap(k + 1) * stride;
        dst[i] = (src[im] + src[i] + src[ip]) * inv3;
      }
    }
  }
}

// ── Physics step ──────────────────────────────────────────────────────────
function step(dt) {
  computeGravity();

  const n = S.n;
  const gNorm = S.grav * (L * 0.9) / (S.meanRho + 1e-3);
  const aMax = L * 0.06;
  const dragF = Math.max(0, 1 - S.drag * dt);
  const speedNorm = 1 / (L * 0.02);
  const pos = S.posAttr.array;
  const valArr = S.valAttr.array;
  const briArr = S.briAttr.array;
  const mode = S.colorMode;

  const { fx, fy, fz, rho } = S;
  let tempSum = 0;

  for (let i = 0; i < n; i++) {
    // trilinear sample of the gradient + density at the particle position
    const cx = (S.px[i] + HALF) / CELL - 0.5;
    const cy = (S.py[i] + HALF) / CELL - 0.5;
    const cz = (S.pz[i] + HALF) / CELL - 0.5;
    const x0 = Math.floor(cx), y0 = Math.floor(cy), z0 = Math.floor(cz);
    const tx = cx - x0, ty = cy - y0, tz = cz - z0;
    const xa = wrap(x0), xb = wrap(x0 + 1);
    const ya = wrap(y0), yb = wrap(y0 + 1);
    const za = wrap(z0), zb = wrap(z0 + 1);
    const wx0 = 1 - tx, wy0 = 1 - ty, wz0 = 1 - tz;
    const w000 = wx0 * wy0 * wz0, w100 = tx * wy0 * wz0;
    const w010 = wx0 * ty * wz0, w110 = tx * ty * wz0;
    const w001 = wx0 * wy0 * tz, w101 = tx * wy0 * tz;
    const w011 = wx0 * ty * tz, w111 = tx * ty * tz;
    const i000 = gi(xa, ya, za), i100 = gi(xb, ya, za);
    const i010 = gi(xa, yb, za), i110 = gi(xb, yb, za);
    const i001 = gi(xa, ya, zb), i101 = gi(xb, ya, zb);
    const i011 = gi(xa, yb, zb), i111 = gi(xb, yb, zb);

    let ax = (fx[i000] * w000 + fx[i100] * w100 + fx[i010] * w010 + fx[i110] * w110
            + fx[i001] * w001 + fx[i101] * w101 + fx[i011] * w011 + fx[i111] * w111) * gNorm;
    let ay = (fy[i000] * w000 + fy[i100] * w100 + fy[i010] * w010 + fy[i110] * w110
            + fy[i001] * w001 + fy[i101] * w101 + fy[i011] * w011 + fy[i111] * w111) * gNorm;
    let az = (fz[i000] * w000 + fz[i100] * w100 + fz[i010] * w010 + fz[i110] * w110
            + fz[i001] * w001 + fz[i101] * w101 + fz[i011] * w011 + fz[i111] * w111) * gNorm;
    const dens = (rho[i000] * w000 + rho[i100] * w100 + rho[i010] * w010 + rho[i110] * w110
                + rho[i001] * w001 + rho[i101] * w101 + rho[i011] * w011 + rho[i111] * w111)
                / (S.meanRho + 1e-3);

    // clamp acceleration for stability
    const am = Math.sqrt(ax * ax + ay * ay + az * az);
    if (am > aMax) { const sc = aMax / am; ax *= sc; ay *= sc; az *= sc; }

    let vx = (S.vx[i] + ax * dt) * dragF;
    let vy = (S.vy[i] + ay * dt) * dragF;
    let vz = (S.vz[i] + az * dt) * dragF;
    S.vx[i] = vx; S.vy[i] = vy; S.vz[i] = vz;

    // integrate + wrap into the periodic cube
    let nx = S.px[i] + vx * dt, ny = S.py[i] + vy * dt, nz = S.pz[i] + vz * dt;
    if (nx < -HALF) nx += L; else if (nx >= HALF) nx -= L;
    if (ny < -HALF) ny += L; else if (ny >= HALF) ny -= L;
    if (nz < -HALF) nz += L; else if (nz >= HALF) nz -= L;
    S.px[i] = nx; S.py[i] = ny; S.pz[i] = nz;
    pos[i * 3] = nx; pos[i * 3 + 1] = ny; pos[i * 3 + 2] = nz;
    S.dens[i] = dens;

    // temperature: expansion cools, compression in clusters reheats cores
    const prevTemp = S.temp[i];
    const heat = Math.max(0, dens - 1.0) * 0.10;
    let temp = prevTemp + (-0.45 * prevTemp + heat) * dt;
    if (temp < 0) temp = 0; else if (temp > 1.25) temp = 1.25;
    S.temp[i] = temp;
    tempSum += temp;

    // per-particle color coordinate + brightness for the shader
    let val;
    if (mode === "density") val = Math.min(1, dens * 0.32);
    else if (mode === "speed") val = Math.min(1, Math.sqrt(vx * vx + vy * vy + vz * vz) * speedNorm);
    else val = Math.min(1, temp);
    valArr[i] = val;
    briArr[i] = 0.30 + 0.55 * Math.min(1, dens * 0.25 + val * 0.5);
  }

  S.meanTemp = tempSum / n;
  S.time += dt;

  S.posAttr.needsUpdate = true;
  S.valAttr.needsUpdate = true;
  S.briAttr.needsUpdate = true;
}

// ── Epoch narration ────────────────────────────────────────────────────────
function epochInfo(t) {
  if (t < 0.25) return { name: "Singularity", time: "t = 0" };
  if (t < 1.6)  return { name: "The Big Bang", time: "first light" };
  if (t < 5)    return { name: "Inflation & Expansion", time: "matter streams outward" };
  if (t < 14)   return { name: "Recombination — it cools", time: "gravity awakens" };
  if (t < 32)   return { name: "Gravitational Collapse", time: "ripples grow" };
  return { name: "The Cosmic Web", time: "filaments & clusters" };
}

// ── Starfield backdrop ─────────────────────────────────────────────────────
function buildStarfield() {
  const count = 1400;
  const arr = new Float32Array(count * 3);
  const R = L * 6;
  for (let i = 0; i < count; i++) {
    const u = Math.random() * 2 - 1;
    const phi = Math.random() * Math.PI * 2;
    const s = Math.sqrt(1 - u * u);
    const r = R * (0.7 + Math.random() * 0.3);
    arr[i * 3] = s * Math.cos(phi) * r;
    arr[i * 3 + 1] = s * Math.sin(phi) * r;
    arr[i * 3 + 2] = u * r;
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(arr, 3));
  const mat = new THREE.PointsMaterial({
    color: 0x9fb4ff, size: 1.4, sizeAttenuation: false,
    transparent: true, opacity: 0.55, depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  starfield = new THREE.Points(geo, mat);
  starfield.frustumCulled = false;
  scene.add(starfield);
}

// ── Scene setup ────────────────────────────────────────────────────────────
function initThree() {
  const canvas = document.getElementById("stage");
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: "high-performance" });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.75));
  renderer.setClearColor(0x000206, 1);

  scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x000206, 0.0016);

  camera = new THREE.PerspectiveCamera(55, 1, 1, 4000);
  camera.position.set(L * 0.85, L * 0.55, L * 1.45);

  controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.dampingFactor = 0.06;
  controls.rotateSpeed = 0.8;
  controls.minDistance = L * 0.35;
  controls.maxDistance = L * 5;
  controls.autoRotate = true;
  controls.autoRotateSpeed = 0.45;
  controls.target.set(0, 0, 0);

  paletteTex = buildPaletteTexture(S.colorMode);
  buildStarfield();
  allocParticles(S.n);

  // central Big Bang flash
  flashSprite = new THREE.Sprite(new THREE.SpriteMaterial({
    map: radialTexture(), color: 0xffffff, transparent: true, opacity: 0.0,
    blending: THREE.AdditiveBlending, depthWrite: false, depthTest: false,
  }));
  flashSprite.scale.setScalar(L * 0.05);
  scene.add(flashSprite);

  // post-processing: bloom glow
  composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  bloomPass = new UnrealBloomPass(new THREE.Vector2(1, 1), S.bloom, 0.7, 0.0);
  composer.addPass(bloomPass);

  resize();
  window.addEventListener("resize", resize);
}

function resize() {
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  composer.setSize(w, h);
  bloomPass.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  // point-size scale ≈ projected pixels per world unit at unit depth
  const dpr = renderer.getPixelRatio();
  const projScale = (h * dpr) / (2 * Math.tan((camera.fov * Math.PI / 180) * 0.5));
  if (points) points.material.uniforms.uPointScale.value = projScale;
}

// ── Main loop ──────────────────────────────────────────────────────────────
let last = performance.now();
let fpsEMA = 60;
function frame(now) {
  const real = Math.min(0.05, (now - last) / 1000);
  last = now;
  fpsEMA = fpsEMA * 0.9 + (1 / Math.max(1e-3, real)) * 0.1;

  if (!S.paused) step(0.7 * S.speed);

  // animate the Big Bang flash
  if (flashSprite && flashSprite.material.opacity > 0.001) {
    const f = Math.max(0, 1 - S.time / 1.6);
    flashSprite.material.opacity = 0.95 * f;
    flashSprite.scale.setScalar(L * (0.05 + (1 - f) * 0.9));
  }

  controls.update();
  composer.render();
  updateHUD();
  requestAnimationFrame(frame);
}

// ── HUD ────────────────────────────────────────────────────────────────────
const el = (id) => document.getElementById(id);
let hudEls;
let hudTick = 0;
function updateHUD() {
  if (hudTick++ % 6) return;
  const info = epochInfo(S.time);
  hudEls.epochName.textContent = info.name;
  hudEls.epochTime.textContent = info.time;
  hudEls.epochBox.style.opacity = S.time > 60 ? "0.35" : "1";
  hudEls.statEpoch.textContent = info.name;
  hudEls.statTime.textContent = S.time.toFixed(1);
  hudEls.statCount.textContent = S.n.toLocaleString();
  hudEls.statTemp.textContent = (S.meanTemp || 0).toFixed(2);
  hudEls.statFps.textContent = Math.round(fpsEMA);
}

// ── Controls wiring ────────────────────────────────────────────────────────
function bindSlider(id, valId, apply, fmt) {
  const input = el(id), out = el(valId);
  const set = () => { const v = parseFloat(input.value); apply(v); out.textContent = fmt ? fmt(v) : v; };
  input.addEventListener("input", set);
  set();
}

function wireControls() {
  hudEls = {
    epochName: el("epochName"), epochTime: el("epochTime"), epochBox: el("epoch"),
    statEpoch: el("statEpoch"), statTime: el("statTime"),
    statCount: el("statCount"), statTemp: el("statTemp"), statFps: el("statFps"),
  };

  bindSlider("count", "countVal", (v) => { S.pendingCount = v; }, (v) => v.toLocaleString());
  el("count").addEventListener("change", () => bigBang(S.pendingCount));

  bindSlider("grav", "gravVal", (v) => { S.grav = v; }, (v) => v.toFixed(2));
  bindSlider("reach", "reachVal", (v) => { S.reach = v; });
  bindSlider("drag", "dragVal", (v) => { S.drag = v; }, (v) => v.toFixed(2));
  bindSlider("energy", "energyVal", (v) => { S.energy = v; }, (v) => v.toFixed(2));
  bindSlider("speed", "speedVal", (v) => { S.speed = v; }, (v) => v.toFixed(2));
  bindSlider("bloom", "bloomVal", (v) => { S.bloom = v; if (bloomPass) bloomPass.strength = v; }, (v) => v.toFixed(2));

  el("colorSeg").addEventListener("click", (e) => {
    const btn = e.target.closest("button[data-color]");
    if (!btn) return;
    el("colorSeg").querySelectorAll("button").forEach((b) => b.classList.remove("active"));
    btn.classList.add("active");
    S.colorMode = btn.dataset.color;
    const old = paletteTex;
    paletteTex = buildPaletteTexture(S.colorMode);
    points.material.uniforms.uPalette.value = paletteTex;
    if (old) old.dispose();
  });

  const playBtn = el("playBtn");
  const setPaused = (p) => { S.paused = p; playBtn.textContent = p ? "Play" : "Pause"; };
  playBtn.addEventListener("click", () => setPaused(!S.paused));
  el("bangBtn").addEventListener("click", () => { bigBang(S.pendingCount || S.n); setPaused(false); });

  const rotateBtn = el("rotateBtn");
  rotateBtn.addEventListener("click", () => {
    controls.autoRotate = !controls.autoRotate;
    rotateBtn.textContent = "Auto-orbit: " + (controls.autoRotate ? "On" : "Off");
  });
  el("recenterBtn").addEventListener("click", () => {
    controls.target.set(0, 0, 0);
    camera.position.set(L * 0.85, L * 0.55, L * 1.45);
  });

  el("uiToggle").addEventListener("click", () => document.body.classList.toggle("ui-open"));

  window.addEventListener("keydown", (e) => {
    if (e.target.tagName === "INPUT" || e.target.tagName === "SELECT") return;
    const k = e.key.toLowerCase();
    if (k === " ") { e.preventDefault(); setPaused(!S.paused); }
    else if (k === "b") { bigBang(S.pendingCount || S.n); setPaused(false); }
    else if (k === "u") { document.body.classList.toggle("ui-open"); }
  });
}

// ── Boot ───────────────────────────────────────────────────────────────────
function boot() {
  S.pendingCount = S.n;
  try {
    initThree();
    wireControls();
    bigBang(S.n);
    const loading = el("loading");
    if (loading) { loading.classList.add("hidden"); setTimeout(() => loading.remove(), 600); }
    requestAnimationFrame((t) => { last = t; frame(t); });
  } catch (err) {
    console.error(err);
    const loading = el("loading");
    if (loading) loading.innerHTML = "<div>WebGL failed to start — try a different browser.</div>";
  }
}

boot();
