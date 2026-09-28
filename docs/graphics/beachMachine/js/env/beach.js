// The setting: a beach on a clear day, the sea to the north. Sky, sea, sun
// and moon, a reflection map, fog, a few palms and props along the sand, gulls
// wheeling overhead, and tiki torches that light up after dusk.
//
//   const env = buildEnvironment(scene, renderer, { sand });
//   env.update(dt, elapsed, camera);  env.setTimeOfDay(hours);
//
// The sky dome and the time-of-day model (sun path, palette) are the Glass
// House machine's.
import * as THREE from 'three';
import { buildSky } from '../../../ballMachine/js/env/sky.js';
import { sampleTimeOfDay } from '../../../ballMachine/js/env/timeofday.js';
import { buildSea } from './sea.js';
import { buildPalm } from '../render/palm.js';
import { sandHeight, SEA_LEVEL } from '../sim/terrain.js';

const ENV_THROTTLE_MS = 400;

export function buildEnvironment(scene, renderer, opts = {}) {
  const root = new THREE.Group();
  root.name = 'beach';
  scene.add(root);
  const heightAt = opts.heightAt ?? sandHeight;

  const sky = buildSky();
  sky.uniforms.uCover.value = 0.62;
  root.add(sky.mesh);
  const sea = buildSea();
  root.add(sea.mesh);

  // ------------------------------------------------------------ lights
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.castShadow = true;
  sun.shadow.mapSize.set(opts.shadowMapSize ?? 4096, opts.shadowMapSize ?? 4096);
  sun.shadow.bias = -0.0002;
  sun.shadow.normalBias = 0.02;
  root.add(sun, sun.target);
  const hemi = new THREE.HemisphereLight(0xbcd4f0, 0xc8b08a, 0.6);
  root.add(hemi);
  const fog = new THREE.Fog(0xcfdfee, 40, 420);
  scene.fog = fog;

  // shadow frustum fitted round the machine
  const recv = [], cast = [];
  for (let i = 0; i < 24; i++) {
    const a = (i / 24) * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    recv.push(new THREE.Vector3(c * 8.5, -0.3, s * 8.5 - 1), new THREE.Vector3(c * 8.5, 2.5, s * 8.5 - 1));
    cast.push(new THREE.Vector3(c * 7, 7.2, s * 7 - 1));
  }
  const center = new THREE.Vector3(0, 2.5, -1), _v = new THREE.Vector3();
  function fitShadow(dir) {
    const cam = sun.shadow.camera;
    sun.position.copy(center).addScaledVector(dir, 40);
    sun.target.position.copy(center);
    sun.updateMatrixWorld(); sun.target.updateMatrixWorld();
    cam.position.copy(sun.position); cam.lookAt(center); cam.updateMatrixWorld(true);
    const inv = cam.matrixWorldInverse;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of recv) { _v.copy(p).applyMatrix4(inv); x0 = Math.min(x0, _v.x); x1 = Math.max(x1, _v.x); y0 = Math.min(y0, _v.y); y1 = Math.max(y1, _v.y); z0 = Math.min(z0, _v.z); z1 = Math.max(z1, _v.z); }
    for (const p of cast) { _v.copy(p).applyMatrix4(inv); z0 = Math.min(z0, _v.z); z1 = Math.max(z1, _v.z); }
    cam.left = x0; cam.right = x1; cam.bottom = y0; cam.top = y1;
    cam.near = Math.max(0.5, -z1 - 2); cam.far = -z0 + 2;
    cam.updateProjectionMatrix();
  }

  // ------------------------------------------------------------ reflection map
  const envU = {
    uZen: { value: new THREE.Color() }, uHor: { value: new THREE.Color() }, uSunDir: { value: new THREE.Vector3(0, 1, 0) },
    uSunCol: { value: new THREE.Color() }, uSunVis: { value: 1 }, uSea: { value: new THREE.Color(0.05, 0.35, 0.45) },
    uSand: { value: new THREE.Color(0.8, 0.7, 0.55) }, uAmb: { value: new THREE.Color(0.5, 0.5, 0.5) },
  };
  const envMat = new THREE.ShaderMaterial({
    uniforms: envU, side: THREE.BackSide, depthWrite: false, depthTest: false, toneMapped: false, fog: false,
    vertexShader: 'varying vec3 vD; void main() { vD = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
    fragmentShader: /* glsl */`
      uniform vec3 uZen, uHor, uSunDir, uSunCol, uSea, uSand, uAmb; uniform float uSunVis; varying vec3 vD;
      void main() {
        vec3 d = normalize(vD);
        vec3 col;
        if (d.y >= 0.0) col = mix(uHor, uZen, pow(d.y, 0.5));
        else {
          // the sea fills the northern half of the ground, the beach the rest
          float seaSide = smoothstep(0.1, -0.35, d.z);
          vec3 g = mix(uSand * uAmb * 1.6, uSea * uAmb * 1.4 + uHor * 0.25, seaSide);
          col = mix(uHor * 0.9, g, smoothstep(0.0, -0.12, d.y));
        }
        float sd = max(dot(d, uSunDir), 0.0);
        col += uSunCol * uSunVis * (smoothstep(0.9997, 0.9999, sd) * 20.0 + pow(sd, 200.0) * 2.0 + pow(sd, 8.0) * 0.2);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const envScene = new THREE.Scene();
  envScene.add(new THREE.Mesh(new THREE.SphereGeometry(10, 64, 32), envMat));
  const cubeRT = new THREE.WebGLCubeRenderTarget(128, { type: THREE.HalfFloatType, generateMipmaps: false });
  const cubeCam = new THREE.CubeCamera(0.1, 50, cubeRT);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let envTarget = null, lastEnv = -Infinity, envPending = false;
  function regenEnv() {
    cubeCam.update(renderer, envScene);
    envTarget = pmrem.fromCubemap(cubeRT.texture, envTarget);
    scene.environment = envTarget.texture;
    lastEnv = performance.now(); envPending = false;
  }

  // ------------------------------------------------------------ palms and props
  const props = new THREE.Group();
  props.name = 'props';
  root.add(props);
  const palms = [];
  const PALMS = opts.palms ?? [
    { x: 8.6, z: -4.2, h: 6.2, lean: [-0.9, 0.5], seed: 11 },
    { x: 9.8, z: -1.3, h: 5.1, lean: [0.6, 0.4], seed: 12 },
    { x: -8.8, z: 1.4, h: 6.8, lean: [0.8, -0.4], seed: 13 },
    { x: -9.9, z: -2.8, h: 5.4, lean: [-0.7, -0.6], seed: 14 },
    { x: 4.4, z: 7.6, h: 5.8, lean: [0.5, 0.9], seed: 15 },
    { x: -5.2, z: 8.4, h: 6.6, lean: [-0.5, 0.8], seed: 16 },
    { x: 13.5, z: 4.5, h: 7.2, lean: [-1.0, 0.2], seed: 17 },
    { x: -13.8, z: 5.2, h: 6.1, lean: [1.1, 0.3], seed: 18 },
  ];
  for (const p of PALMS) {
    const y = heightAt(p.x, p.z) - 0.05;
    const palm = buildPalm({ base: { x: p.x, y, z: p.z }, height: p.h, lean: { x: p.lean[0], z: p.lean[1] }, r0: 0.2, r1: 0.15, straight: 0.15, seed: p.seed, fronds: 11, frondLen: 2.3 });
    props.add(palm.object);
    palms.push(palm);
  }
  // beach umbrellas and towels along the sand
  const umb = [];
  const umbrella = (x, z, cols, tilt = 0.12, rot = 0) => {
    const g = new THREE.Group();
    const y = heightAt(x, z);
    g.position.set(x, y, z); g.rotation.set(tilt, rot, tilt * 0.4);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 2.1, 8), new THREE.MeshStandardMaterial({ color: 0xf2efe6, roughness: 0.5 }));
    pole.position.y = 1.0; g.add(pole);
    const canopy = new THREE.Mesh(new THREE.ConeGeometry(1.0, 0.35, 16, 1, true), stripedMaterial(cols, 16));
    canopy.position.y = 2.0; g.add(canopy);
    g.traverse((m) => { if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; } });
    props.add(g); umb.push(g);
    return g;
  };
  umbrella(6.8, 3.2, ['#e8332c', '#ffffff'], 0.1, 0.3);
  umbrella(-7.4, 4.0, ['#2a6fd6', '#f5c518'], -0.12, 1.1);
  umbrella(8.2, -6.2, ['#21a35b', '#ffffff'], 0.08, 2.0);
  const towel = (x, z, rot, cols) => {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 1.8), stripedMaterial(cols, 7, true));
    m.rotation.x = -Math.PI / 2; m.rotation.z = rot;
    m.position.set(x, heightAt(x, z) + 0.012, z);
    m.receiveShadow = true;
    props.add(m);
  };
  towel(7.6, 3.6, 0.4, ['#f07a1c', '#ffffff']);
  towel(-6.6, 4.6, -0.3, ['#8a4fbf', '#16a6b8']);
  towel(7.2, -5.6, 1.2, ['#e0457b', '#ffffff']);

  // seashells and starfish scattered on the sand
  {
    const R = rngs(5);
    const shellG = new THREE.SphereGeometry(1, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2);
    const shellM = new THREE.MeshStandardMaterial({ color: 0xf3e3cf, roughness: 0.5 });
    const n = 140, shells = new THREE.InstancedMesh(shellG, shellM, n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
    let k = 0;
    for (let i = 0; i < 400 && k < n; i++) {
      const x = -11 + R() * 22, z = -9.2 + R() * 16;
      if (Math.hypot(x, z) < 2.6 || Math.hypot(x + 3, z + 3.8) < 2.9 || (x > 1.4 && x < 7.5 && z > -5 && z < 1.2)) continue;
      const y = heightAt(x, z);
      if (y < SEA_LEVEL + 0.05) continue;
      const r = 0.012 + R() * 0.02;
      q.setFromEuler(new THREE.Euler((R() - 0.5) * 0.4, R() * 6.28, (R() - 0.5) * 0.4));
      m4.compose(p.set(x, y - r * 0.2, z), q, s.set(r, r * 0.45, r * 1.2));
      shells.setMatrixAt(k, m4);
      shells.setColorAt(k, col.setHSL(0.06 + R() * 0.05, 0.3 + R() * 0.4, 0.72 + R() * 0.2));
      k++;
    }
    shells.count = k;
    shells.receiveShadow = true;
    props.add(shells);
    const star = starfishGeometry();
    const starM = new THREE.MeshStandardMaterial({ color: 0xe07a3a, roughness: 0.7 });
    const nS = 14, stars = new THREE.InstancedMesh(star, starM, nS);
    let ks = 0;
    for (let i = 0; i < 200 && ks < nS; i++) {
      const x = -9 + R() * 18, z = -9.4 + R() * 3.2;
      const y = heightAt(x, z);
      if (y < SEA_LEVEL - 0.02 || y > 0.05) continue;
      m4.compose(p.set(x, y + 0.004, z), q.setFromEuler(new THREE.Euler(0, R() * 6.28, 0)), s.setScalar(0.05 + R() * 0.03));
      stars.setMatrixAt(ks, m4);
      stars.setColorAt(ks, col.setHSL(0.02 + R() * 0.06, 0.7, 0.45 + R() * 0.15));
      ks++;
    }
    stars.count = ks;
    props.add(stars);
  }
  // beach grass on the dunes behind the beach and on the machine's dune
  {
    const R = rngs(8);
    const blade = new THREE.ConeGeometry(0.012, 0.42, 3, 1, true);
    blade.translate(0, 0.21, 0);
    const mat = new THREE.MeshStandardMaterial({ color: 0x9aa65a, roughness: 0.8, side: THREE.DoubleSide });
    const n = 1800, grass = new THREE.InstancedMesh(blade, mat, n);
    const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), s = new THREE.Vector3(), p = new THREE.Vector3(), col = new THREE.Color();
    let k = 0;
    const tuft = (cx, cz, count, spread) => {
      for (let i = 0; i < count && k < n; i++) {
        const a = R() * 6.28, r = Math.sqrt(R()) * spread, x = cx + Math.cos(a) * r, z = cz + Math.sin(a) * r;
        const y = heightAt(x, z);
        q.setFromEuler(new THREE.Euler((R() - 0.5) * 0.9, R() * 6.28, (R() - 0.5) * 0.9));
        m4.compose(p.set(x, y - 0.02, z), q, s.set(1, 0.6 + R() * 0.8, 1));
        grass.setMatrixAt(k, m4);
        grass.setColorAt(k, col.setHSL(0.16 + R() * 0.06, 0.35 + R() * 0.2, 0.38 + R() * 0.2));
        k++;
      }
    };
    for (let i = 0; i < 70; i++) {
      const x = -16 + R() * 32, z = 7.5 + R() * 9;
      tuft(x, z, 14 + (R() * 12 | 0), 0.25);
    }
    for (const [x, z] of opts.grassTufts ?? []) tuft(x, z, 12, 0.18);
    grass.count = k;
    grass.castShadow = true;
    props.add(grass);
  }

  // ------------------------------------------------------------ gulls
  const gulls = [];
  {
    const body = new THREE.Group();
    const white = new THREE.MeshStandardMaterial({ color: 0xf4f4f0, roughness: 0.7, side: THREE.DoubleSide });
    const grey = new THREE.MeshStandardMaterial({ color: 0x9aa0a8, roughness: 0.7, side: THREE.DoubleSide });
    for (let i = 0; i < 5; i++) {
      const gull = new THREE.Group();
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.07, 10, 6), white); b.scale.set(1, 0.8, 2.4); gull.add(b);
      const wings = [];
      for (const s of [-1, 1]) {
        const wg = new THREE.Group();
        const w = new THREE.Mesh(new THREE.PlaneGeometry(0.42, 0.13), grey);
        w.rotation.x = -Math.PI / 2; w.position.x = s * 0.21;
        wg.add(w); gull.add(wg); wings.push([wg, s]);
      }
      body.add(gull);
      gulls.push({ g: gull, wings, r: 7 + i * 2.2, h: 7 + (i % 3) * 1.6, sp: 0.12 + i * 0.03, ph: i * 1.7, cx: -2 + i, cz: -6 - i * 1.5 });
    }
    root.add(body);
  }

  // ------------------------------------------------------------ tiki torches (lit after dusk)
  const torches = [];
  {
    const R = rngs(3);
    const poleM = new THREE.MeshStandardMaterial({ color: 0x6a4a2a, roughness: 0.9 });
    const flameM = new THREE.MeshBasicMaterial({ color: 0xffa040, transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
    for (const [x, z] of opts.torches ?? [[5.3, 4.4], [-5.2, 3.2], [6.2, -3.9], [-0.4, 5.8]]) {
      const y = heightAt(x, z);
      const g = new THREE.Group();
      g.position.set(x, y, z);
      const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.04, 1.8, 8), poleM); pole.position.y = 0.9; g.add(pole);
      const cup = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.045, 0.16, 10), poleM); cup.position.y = 1.86; g.add(cup);
      const flame = new THREE.Mesh(new THREE.ConeGeometry(0.06, 0.24, 10), flameM); flame.position.y = 2.05; g.add(flame);
      g.traverse((m) => { if (m.isMesh && m !== flame) m.castShadow = true; });
      const light = new THREE.PointLight(0xff9a48, 0, 7, 2);
      light.position.set(x, y + 2.05, z);
      light.visible = false;
      root.add(g, light);
      torches.push({ flame, light, ph: R() * 10 });
    }
  }

  // ------------------------------------------------------------ time of day
  const T = sampleTimeOfDay(opts.timeOfDay ?? 17.5);
  const tmp = new THREE.Color();
  let night = 0;
  function setTimeOfDay(h) {
    sampleTimeOfDay(h, T);
    sun.color.copy(T.light);
    sun.intensity = T.lightI * 0.95;
    sun.shadow.intensity = T.isMoon ? 0.7 : 1;
    fitShadow(T.lightDir);
    hemi.color.copy(T.hemiSky);
    hemi.groundColor.copy(T.hemiGnd).lerp(new THREE.Color(0.85, 0.72, 0.52), 0.5).multiplyScalar(0.8 + 0.2 * (1 - T.night));
    hemi.intensity = T.hemiI * 1.35;
    renderer.toneMappingExposure = T.exposure * 0.85;
    scene.environmentIntensity = T.envI * 0.9;
    const fogCol = tmp.copy(T.hor).lerp(T.zen, 0.15);
    fog.color.copy(fogCol); fog.far = T.fogFar * 0.8;
    const su = sky.uniforms;
    su.uZenith.value.copy(T.zen); su.uHorizon.value.copy(T.hor); su.uGround.value.copy(fogCol);
    su.uSunDir.value.copy(T.sunDir);
    su.uSunCol.value.copy(T.light).lerp(new THREE.Color(1, 0.62, 0.32), 0.35 * T.twilight).multiplyScalar(T.isMoon && T.sunVis < 0.01 ? 0 : 1);
    su.uSunVis.value = T.sunVis; su.uMoonDir.value.copy(T.moonDir); su.uNight.value = T.night; su.uTwilight.value = T.twilight;
    su.uCloudLit.value.copy(T.cloudLit); su.uCloudShade.value.copy(T.cloudShade);
    const w = sea.uniforms;
    w.uSunDir.value.copy(T.sunDir); w.uSunCol.value.copy(T.light).multiplyScalar(Math.min(1.4, T.lightI * 0.3));
    w.uSunVis.value = T.sunVis; w.uSkyZen.value.copy(T.zen); w.uSkyHor.value.copy(T.hor);
    w.uAmb.value.copy(T.hemiSky).multiplyScalar(T.hemiI * 0.9 + 0.05);
    w.uNight.value = T.night; w.uMoonDir.value.copy(T.moonDir);
    w.fogColor.value.copy(fog.color); w.fogNear.value = fog.near; w.fogFar.value = fog.far;
    envU.uZen.value.copy(T.zen); envU.uHor.value.copy(T.hor); envU.uSunDir.value.copy(T.sunDir);
    envU.uSunCol.value.copy(T.light).multiplyScalar(Math.min(1.5, T.lightI * 0.5)); envU.uSunVis.value = T.isMoon ? 0 : T.sunVis;
    envU.uAmb.value.copy(T.hemiSky).multiplyScalar(T.hemiI * 0.6).add(tmp.copy(T.light).multiplyScalar(T.lightI * 0.12));
    night = T.night;
    const lit = T.lamps;
    for (const tc of torches) { tc.on = lit > 0.1; tc.light.visible = tc.on; tc.flame.visible = tc.on; tc.level = lit; }
    if (performance.now() - lastEnv > ENV_THROTTLE_MS) regenEnv(); else envPending = true;
    env.night = night; env.lamps = lit;
  }

  function update(dt, t, camera) {
    sky.uniforms.uTime.value = t;
    env.swash = sea.update(t);
    for (const p of palms) p.update(dt, t);
    for (const gl of gulls) {
      const a = t * gl.sp + gl.ph;
      gl.g.position.set(gl.cx + Math.cos(a) * gl.r, gl.h + Math.sin(a * 2.3) * 0.6, gl.cz + Math.sin(a) * gl.r * 0.6);
      gl.g.rotation.y = -a + Math.PI;
      gl.g.rotation.z = 0.35;
      const flap = Math.sin(t * 5 + gl.ph) * 0.5 * (0.5 + 0.5 * Math.sin(t * 0.4 + gl.ph));
      for (const [wg, s] of gl.wings) wg.rotation.z = s * flap;
    }
    for (const tc of torches) {
      if (!tc.on) continue;
      const fl = 0.8 + 0.2 * Math.sin(t * 13 + tc.ph) * Math.sin(t * 7.3 + tc.ph * 2);
      tc.light.intensity = 3.2 * fl * Math.min(1, tc.level * 1.5);
      tc.flame.scale.set(1, 0.85 + 0.3 * fl, 1);
    }
    if (envPending && performance.now() - lastEnv > ENV_THROTTLE_MS) regenEnv();
  }

  const env = {
    update, setTimeOfDay, sun, hemi, sea, sky, group: root,
    interiorRadius: 24, domeHeight: 30,
    night: 0, lamps: 0, swash: 0,
    heightAt,
  };
  setTimeOfDay(opts.timeOfDay ?? 17.5);
  regenEnv();
  return env;
}

// ---------------------------------------------------------------- helpers
function rngs(seed) { let a = seed >>> 0; return () => ((a = (Math.imul(a ^ (a >>> 15), 1 | a) + 0x6d2b79f5) >>> 0) / 4294967296); }

const striped = new Map();
export function stripedMaterial(cols, n, flat = false) {
  const key = cols.join() + n + flat;
  if (striped.has(key)) return striped.get(key);
  const c = document.createElement('canvas'); c.width = 256; c.height = flat ? 256 : 16;
  const g = c.getContext('2d');
  for (let i = 0; i < n; i++) { g.fillStyle = cols[i % cols.length]; if (flat) g.fillRect(0, (i / n) * 256, 256, 256 / n + 1); else g.fillRect((i / n) * 256, 0, 256 / n + 1, 16); }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  const m = new THREE.MeshStandardMaterial({ map: t, roughness: 0.75, side: THREE.DoubleSide });
  striped.set(key, m);
  return m;
}

function starfishGeometry() {
  const shape = new THREE.Shape();
  for (let i = 0; i <= 10; i++) {
    const a = (i / 10) * Math.PI * 2 + Math.PI / 2, r = i % 2 ? 0.38 : 1;
    const x = Math.cos(a) * r, y = Math.sin(a) * r;
    if (i === 0) shape.moveTo(x, y); else shape.lineTo(x, y);
  }
  const g = new THREE.ExtrudeGeometry(shape, { depth: 0.12, bevelEnabled: true, bevelThickness: 0.08, bevelSize: 0.08, bevelSegments: 2 });
  g.rotateX(-Math.PI / 2);
  return g;
}
