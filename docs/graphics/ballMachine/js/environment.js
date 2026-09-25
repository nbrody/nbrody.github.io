// Glass House Ball Machine — the setting: a Victorian cast-iron-and-glass palm-house rotunda.
//
//   import { buildEnvironment } from './environment.js';
//   const env = buildEnvironment(scene, renderer, { timeOfDay: 17.5 });
//   // per frame:  env.update(dt, elapsed, camera);
//   // any time:   env.setTimeOfDay(hours);        // 0..24, cheap except a throttled env-map rebuild
//
// Everything is procedural (canvas textures, generated geometry). Static geometry is merged
// per material; foliage is alpha-tested with coverage-preserving mips; the sun (moon at night)
// is the single shadow-casting DirectionalLight with a frustum fitted to the rotunda.
import * as THREE from 'three';
import { createTextures } from './env/textures.js';
import { buildStructure } from './env/structure.js';
import { buildPlants } from './env/plants.js';
import { buildSky, buildOutside } from './env/sky.js';
import { buildFx } from './env/fx.js';
import { createEnvMap } from './env/envmap.js';
import { sampleTimeOfDay } from './env/timeofday.js';
import { disposeTree, smoothstep, TAU } from './env/util.js';
import * as LY from './env/layout.js';

const ENV_THROTTLE_MS = 500;
const LAMP_CANDELA = 11;

export function buildEnvironment(scene, renderer, opts = {}) {
  const t0 = performance.now();
  const {
    timeOfDay = 17.5,
    quality = 'high',                 // 'high' | 'medium' | 'low'
    shadowMapSize = quality === 'low' ? 2048 : 4096,
    lampLights = 'auto',              // 'auto' (only while lit) | 'always' | 'off'
    exposure = 1,                     // multiplier on the time-of-day exposure
  } = opts;

  const root = new THREE.Group();
  root.name = 'Glasshouse';
  scene.add(root);

  const gl = renderer.getContext();
  const tex = createTextures({ anisotropy: Math.min(16, renderer.capabilities.getMaxAnisotropy()) });
  const U = { time: { value: 0 }, swayAmp: { value: 1 }, glassReflect: { value: 1.7 }, glassScatter: { value: 0.8 } };

  const structure = buildStructure(tex, U);
  root.add(structure.group);
  const plants = buildPlants(tex, U, { density: quality === 'high' ? 1 : quality === 'medium' ? 0.7 : 0.45 });
  root.add(plants.group);
  const outside = buildOutside(tex, U);
  root.add(outside.group);
  const sky = buildSky();
  root.add(sky.mesh);
  const psr = gl.getParameter(gl.ALIASED_POINT_SIZE_RANGE);
  const fx = buildFx(structure.lampPositions, structure.bulbPositions, { maxPointSize: Math.min(256, psr ? psr[1] : 64) });
  root.add(fx.group);

  // ------------------------------------------------------------ lights ---
  const sun = new THREE.DirectionalLight(0xffffff, 3);
  sun.name = 'gh.sun';
  sun.castShadow = true;
  sun.shadow.mapSize.set(shadowMapSize, shadowMapSize);
  sun.shadow.bias = -0.00025;
  sun.shadow.normalBias = 0.018;
  root.add(sun, sun.target);

  const hemi = new THREE.HemisphereLight(0xbcd4f0, 0x6a5a48, 0.6);
  hemi.name = 'gh.hemi';
  root.add(hemi);

  const lamps = structure.lampPositions.map((p, i) => {
    const l = new THREE.PointLight(0xffb468, 0, 10.5, 2);
    l.name = `gh.lamp${i}`;
    l.position.copy(p);
    l.castShadow = false;
    l.visible = lampLights === 'always';
    root.add(l);
    return l;
  });

  const ownFog = new THREE.Fog(0xcfdfee, 30, 600);
  scene.fog = ownFog;

  // ------------------------------------------------ shadow frustum fitting ---
  const recvPts = [], castPts = [];
  for (let i = 0; i < 32; i++) {
    const a = (i / 32) * TAU, c = Math.cos(a), s = Math.sin(a);
    recvPts.push(new THREE.Vector3(c * 14.6, -0.1, s * 14.6), new THREE.Vector3(c * 14.6, 12.8, s * 14.6));
    castPts.push(new THREE.Vector3(c * 14.6, 10.5, s * 14.6), new THREE.Vector3(c * 12.2, 18.3, s * 12.2), new THREE.Vector3(c * 2.8, LY.DOME_TOP_Y + 3.4, s * 2.8));
  }
  const _v = new THREE.Vector3();
  const shadowCenter = new THREE.Vector3(0, 6, 0);
  function fitShadow(dir) {
    const cam = sun.shadow.camera;
    sun.position.copy(shadowCenter).addScaledVector(dir, 60);
    sun.target.position.copy(shadowCenter);
    sun.updateMatrixWorld();
    sun.target.updateMatrixWorld();
    cam.position.copy(sun.position);
    cam.lookAt(shadowCenter);
    cam.updateMatrixWorld(true);
    const inv = cam.matrixWorldInverse;
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity, z0 = Infinity, z1 = -Infinity;
    for (const p of recvPts) {
      _v.copy(p).applyMatrix4(inv);
      x0 = Math.min(x0, _v.x); x1 = Math.max(x1, _v.x); y0 = Math.min(y0, _v.y); y1 = Math.max(y1, _v.y);
      z0 = Math.min(z0, _v.z); z1 = Math.max(z1, _v.z);
    }
    for (const p of castPts) { _v.copy(p).applyMatrix4(inv); z0 = Math.min(z0, _v.z); z1 = Math.max(z1, _v.z); }
    cam.left = x0 - 0.2; cam.right = x1 + 0.2; cam.bottom = y0 - 0.2; cam.top = y1 + 0.2;
    cam.near = Math.max(0.5, -z1 - 1); cam.far = -z0 + 1;
    cam.updateProjectionMatrix();
  }

  // ------------------------------------------------------------ env map ---
  const envMap = createEnvMap(renderer);
  let envTex = null, envPending = false, lastEnvAt = -Infinity, envCount = 0;
  function regenEnv() {
    envTex = envMap.regenerate();
    scene.environment = envTex;
    lastEnvAt = performance.now();
    envPending = false;
    envCount++;
  }
  function requestEnv(force) {
    if (force || performance.now() - lastEnvAt >= ENV_THROTTLE_MS) regenEnv();
    else envPending = true;
  }

  // -------------------------------------------------------- time of day ---
  const T = sampleTimeOfDay(timeOfDay);
  const tmpC = new THREE.Color(), tmpC2 = new THREE.Color();
  const bulbOff = new THREE.Color(0.5, 0.48, 0.44), bulbOn = new THREE.Color(1.0, 0.62, 0.3).multiplyScalar(4.2);
  const twilightTint = new THREE.Color(1.0, 0.62, 0.32);
  let hours = timeOfDay;

  function setTimeOfDay(h, { forceEnv = false } = {}) {
    hours = ((h % 24) + 24) % 24;
    sampleTimeOfDay(hours, T);

    // key light: sun by day, moon by night
    sun.color.copy(T.light);
    sun.intensity = T.lightI;
    sun.shadow.intensity = T.isMoon ? 0.8 : 1.0;
    fitShadow(T.lightDir);

    hemi.color.copy(T.hemiSky);
    hemi.groundColor.copy(T.hemiGnd);
    hemi.intensity = T.hemiI;

    renderer.toneMappingExposure = T.exposure * exposure;
    scene.environmentIntensity = T.envI;
    U.glassReflect.value = 1.7 - 0.7 * T.night;

    // atmosphere
    const fogCol = tmpC.copy(T.hor).lerp(T.zen, 0.12);
    ownFog.color.copy(fogCol);
    ownFog.near = 28;
    ownFog.far = T.fogFar;

    const su = sky.uniforms;
    su.uZenith.value.copy(T.zen);
    su.uHorizon.value.copy(T.hor);
    su.uGround.value.copy(fogCol);
    su.uSunDir.value.copy(T.sunDir);
    su.uSunCol.value.copy(T.light).lerp(twilightTint, 0.35 * T.twilight).multiplyScalar(T.isMoon && T.sunVis < 0.01 ? 0.0 : 1.0);
    su.uSunVis.value = T.sunVis;
    su.uMoonDir.value.copy(T.moonDir);
    su.uNight.value = T.night;
    su.uTwilight.value = T.twilight;
    su.uCloudLit.value.copy(T.cloudLit);
    su.uCloudShade.value.copy(T.cloudShade);

    const hz = outside.hazeUniforms;
    hz.uHaze.value.copy(fogCol);
    hz.uLight.value.copy(T.light).multiplyScalar(Math.min(1, T.lightI * 0.22 * (T.isMoon ? 0.6 : 1))).add(tmpC2.copy(T.hemiSky).multiplyScalar(T.hemiI * 0.55));

    // lamps & string lights
    const lampLevel = T.lamps;
    // PointLights are only switched on when the lamps visibly matter (they cost 8 light evaluations per pixel)
    const lampsOn = lampLights === 'always' || (lampLights === 'auto' && lampLevel > 0.15);
    const lampI = Math.max(0, (lampLevel - 0.15) / 0.85) * LAMP_CANDELA;   // fades in from 0 when switched on
    for (const l of lamps) { l.visible = lampLights !== 'off' && lampsOn; l.intensity = lampI; }
    structure.materials.lampGlass.emissiveIntensity = lampLevel * 1.25;
    structure.materials.bulb.color.copy(bulbOff).lerp(bulbOn, lampLevel);

    // particles
    const fu = fx.uniforms;
    fu.uFirefly.value = smoothstep(0.55, 1.0, T.night);
    fu.uDust.value = T.dust * 0.8;
    fu.uGlow.value = lampLevel;
    fu.uSunDir.value.copy(T.sunDir);
    fu.uSunCol.value.copy(T.light);

    // environment panorama
    const eu = envMap.uniforms;
    eu.uSkyZen.value.copy(T.zen);
    eu.uSkyHor.value.copy(T.hor);
    eu.uSunDir.value.copy(T.sunDir);
    eu.uSunCol.value.copy(T.light).multiplyScalar(Math.min(1.5, T.lightI * 0.5));
    eu.uSunVis.value = T.sunVis * (T.isMoon ? 0 : 1);
    eu.uKey.value.copy(T.light).multiplyScalar(T.lightI * 0.34);
    eu.uKeyDir.value.copy(T.lightDir);
    eu.uAmb.value.copy(T.hemiSky).multiplyScalar(T.hemiI * 0.5).add(tmpC2.copy(T.zen).lerp(T.hor, 0.5).multiplyScalar(0.28));
    eu.uLamp.value = lampLevel;
    eu.uString.value = lampLevel;
    requestEnv(forceEnv);
  }

  // ------------------------------------------------ shader pre-warming ---
  // Lamp PointLights only exist while lit (saves 8 light evaluations per pixel by day).
  // Compile the "lamps on" program variants in the background once, so dusk doesn't hitch.
  let frames = 0, prewarmed = lampLights !== 'auto';
  function prewarm(camera) {
    if (prewarmed || !camera || !renderer.compileAsync) return;
    prewarmed = true;
    const vis = lamps.map((l) => l.visible);
    const want = !vis[0];
    lamps.forEach((l) => { l.visible = want; });
    try { renderer.compileAsync(scene, camera).catch(() => {}); } catch (e) { /* ignore */ }
    lamps.forEach((l, i) => { l.visible = vis[i]; });
  }

  // ------------------------------------------------------------- update ---
  const dbs = new THREE.Vector2();
  function update(dt, elapsed, camera) {
    U.time.value = elapsed;
    sky.uniforms.uTime.value = elapsed;
    fx.uniforms.uTime.value = elapsed;
    if (camera && camera.isPerspectiveCamera) {
      renderer.getDrawingBufferSize(dbs);
      fx.uniforms.uScale.value = dbs.y / (2 * Math.tan((camera.fov * Math.PI) / 360) * (camera.zoom ? 1 / camera.zoom : 1));
    }
    if (envPending && performance.now() - lastEnvAt >= ENV_THROTTLE_MS) regenEnv();
    frames++;
    if (!prewarmed && frames >= 45 && camera) prewarm(camera);
  }

  function dispose() {
    root.removeFromParent();
    sun.dispose();                    // frees the shadow map render target
    disposeTree(root);
    for (const m of plants.materials) m.dispose();
    const allTex = [tex.tiles.map, tex.tiles.roughnessMap, tex.stone, tex.plinthTop, tex.soil, tex.grate, tex.gravel, tex.lawn, tex.bark];
    for (const k in tex.leaves) allTex.push(tex.leaves[k].map, tex.leaves[k].alphaMap);
    allTex.forEach((t) => t.dispose());
    if (scene.environment === envTex) scene.environment = null;
    envMap.dispose();
    if (scene.fog === ownFog) scene.fog = null;
  }

  setTimeOfDay(timeOfDay, { forceEnv: true });

  const buildMs = performance.now() - t0;
  return {
    update,
    setTimeOfDay,
    sun,
    plinthTopY: LY.PLINTH_TOP,
    plinthRadius: LY.PLINTH_R,
    interiorRadius: LY.WALL_INNER - 0.03,
    domeHeight: 20.0,
    dispose,
    // extras (not part of the core contract)
    group: root,
    hemi,
    lamps,
    get timeOfDay() { return hours; },
    prewarm,
    flushEnvMap() { if (envPending) regenEnv(); },
    uniforms: U,
    stats: { buildMs, textureMs: tex.buildMs, plantTriangles: plants.stats.triangles, rejectedFronds: plants.stats.rejected, get envRegenerations() { return envCount; } },
  };
}
