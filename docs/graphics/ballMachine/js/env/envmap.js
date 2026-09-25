// Glasshouse environment — reflection/IBL map. A single procedural "interior panorama"
// (as seen from the machine's centre) is rendered into a cube map and prefiltered with
// PMREM. The PMREM target is reused, so regeneration allocates nothing.
import * as THREE from 'three';
import { NOISE_GLSL } from './sky.js';
import * as LY from './layout.js';
import { DOME_RINGS } from './structure.js';

const EYE_Y = 3.0;

export function createEnvMap(renderer) {
  // ring purlin elevations & angular half-widths as seen from the reference point
  const ringEl = [], ringW = [];
  for (const s of DOME_RINGS) {
    const [R, y] = LY.domeAt(s);
    const d = R * Math.cos(LY.HALF_ANGLE);
    ringEl.push(Math.atan2(y - EYE_Y, d));
    ringW.push((s === 0 || s === 1 ? 0.12 : 0.07) / Math.hypot(d, y - EYE_Y));
  }
  const uniforms = {
    uSkyZen: { value: new THREE.Color() }, uSkyHor: { value: new THREE.Color() },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color() }, uSunVis: { value: 1 },
    uKey: { value: new THREE.Color() }, uKeyDir: { value: new THREE.Vector3(0, 1, 0) }, uAmb: { value: new THREE.Color() },
    uLampCol: { value: new THREE.Color(1.0, 0.62, 0.3) }, uLamp: { value: 0 }, uString: { value: 0 },
    uRingEl: { value: ringEl }, uRingW: { value: ringW },
  };
  const mat = new THREE.ShaderMaterial({
    name: 'gh.envPanorama', uniforms, side: THREE.BackSide, depthWrite: false, depthTest: false, toneMapped: false, fog: false,
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main() { vDir = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
    fragmentShader: /* glsl */`
      uniform vec3 uSkyZen, uSkyHor, uSunDir, uSunCol, uKey, uKeyDir, uAmb, uLampCol;
      uniform float uSunVis, uLamp, uString;
      uniform float uRingEl[9]; uniform float uRingW[9];
      varying vec3 vDir;
      #define PI 3.14159265
      #define SECTOR (2.0 * PI / 16.0)
      ${NOISE_GLSL}
      float azDist(float az, float period, float offset) { float x = (az - offset) / period; return abs(fract(x + 0.5) - 0.5) * period; }
      void main() {
        vec3 d = normalize(vDir);
        float el = asin(clamp(d.y, -1.0, 1.0));
        float elD = el * 57.29578;
        float az = atan(d.z, d.x);
        float dv = azDist(az, SECTOR, -0.5 * SECTOR);          // to nearest column / rib
        float ce = max(cos(el), 0.05);
        vec3 iron = vec3(0.88, 0.87, 0.84) * (uAmb * 0.95 + uKey * 0.28);
        float keyUp = max(uKeyDir.y, 0.0);
        vec3 col;
        if (elD > 28.5) {
          // glass dome: sky seen through glass, ribs, purlins, glazing bars
          float t = smoothstep(28.5, 90.0, elD);
          vec3 sky = mix(uSkyHor, uSkyZen, pow(t, 0.75)) * 0.86 + uAmb * 0.025;
          col = sky;
          float Rh = max(14.3 * pow(ce, 0.85), 0.8);
          float ribW = 0.2 / Rh * 0.5;
          float rib = 1.0 - smoothstep(ribW, ribW + 0.0045, dv);
          float sub = elD < 58.0 ? 4.0 : (elD < 72.0 ? 2.0 : 1.0);
          float ds = azDist(az, SECTOR / sub, -0.5 * SECTOR);
          float bar = (1.0 - smoothstep(0.06 / Rh * 0.5, 0.06 / Rh * 0.5 + 0.004, ds)) * 0.55;
          float ring = 0.0;
          for (int i = 0; i < 9; i++) ring = max(ring, 1.0 - smoothstep(uRingW[i], uRingW[i] + 0.004, abs(el - uRingEl[i])));
          col = mix(col, iron, max(max(rib, bar), ring * 0.9));
          if (elD > 84.0) col = mix(col, sky * 1.15, 0.35);
          // string lights hanging under the ribs
          float along = (fract((elD - 30.0) / 2.8) - 0.5) * 2.8 * 0.01745;
          float bd = length(vec2(dv * ce, along));
          col += vec3(1.0, 0.8, 0.52) * smoothstep(0.009, 0.003, bd) * step(30.0, elD) * step(elD, 82.0) * uString * 6.0;
        } else if (elD > 20.7) {
          // cornice, gallery underside, gallery railing against the dome glass
          float k = smoothstep(20.7, 24.5, elD);
          col = iron * mix(1.05, 0.7, k);
          if (elD > 26.0) {
            float rail = 0.5 + 0.5 * smoothstep(0.35, 0.65, fract(az * 16.0 / SECTOR * 0.5));
            col = mix(mix(uSkyHor, uSkyZen, 0.1) * 0.8, iron, rail * 0.8);
          }
          // festoons of bulbs sagging between the columns
          float f = fract((az + 0.5 * SECTOR) / SECTOR);
          float sagEl = 25.3 - 2.4 * (1.0 - pow(2.0 * f - 1.0, 2.0));
          float bf = fract(f * 12.0) - 0.5;
          float fd = length(vec2(bf * SECTOR / 12.0 * ce, (elD - sagEl) * 0.01745));
          col += vec3(1.0, 0.8, 0.52) * smoothstep(0.009, 0.003, fd) * uString * 6.0;
        } else if (elD > -8.5) {
          // glazed walls: the garden outside, the planting, white columns
          vec3 outside = mix(uSkyHor * 0.95, uSkyHor * 0.3 + vec3(0.012, 0.02, 0.01), smoothstep(1.5, -1.5, elD));
          col = outside;
          float n1 = gh_fbm(vec2(az * 2.2, 3.1));
          float top = 5.0 + 26.0 * n1 * n1;
          float n2 = gh_fbm(vec2(az * 9.0, el * 7.0));
          float leaf = smoothstep(top + 2.5, top - 3.0, elD + (n2 - 0.5) * 9.0);
          vec3 green = mix(vec3(0.045, 0.08, 0.03), vec3(0.12, 0.17, 0.06), n2);
          vec3 lit = green * (uAmb * 1.1 + uKey * 0.5 * keyUp) + green * uKey * 0.9 * pow(max(dot(d, uSunDir), 0.0), 3.0);
          col = mix(col, lit, leaf);
          float colm = 1.0 - smoothstep(0.011, 0.015, dv);
          col = mix(col, iron * 1.1, colm * (1.0 - leaf * 0.75));
          // glazing bars over the view
          float mull = 1.0 - smoothstep(0.0012, 0.0024, azDist(az, SECTOR / 7.0, -0.5 * SECTOR));
          col = mix(col, iron, mull * 0.35 * (1.0 - leaf));
        } else {
          // floor: planting beds, encaustic walkway, limestone plinth
          float nb = gh_fbm(vec2(az * 7.0, el * 7.0));
          vec3 bed = mix(vec3(0.045, 0.065, 0.028), vec3(0.09, 0.11, 0.045), nb);
          vec3 tile = mix(vec3(0.4, 0.17, 0.1), vec3(0.64, 0.55, 0.4), 0.5 + 0.5 * sin(az * 56.0));
          vec3 stone = vec3(0.64, 0.6, 0.52);
          vec3 alb = elD > -21.8 ? bed : (elD > -24.6 ? tile : stone);
          col = alb * (uAmb * 1.05 + uKey * keyUp * 0.95);
          // lamp pools on the walkway and planting
          float la = azDist(az, PI / 4.0, PI / 8.0);
          col += uLampCol * uLamp * (0.02 + 0.08 * exp(-la * la / 0.02)) * alb * 5.0 * smoothstep(-60.0, -15.0, elD);
        }
        // lamp lanterns (≈ eye level around the walkway)
        if (uLamp > 0.001) {
          float la = azDist(az, PI / 4.0, PI / 8.0);
          float r2 = (la * la * ce * ce + el * el);
          col += uLampCol * uLamp * (exp(-r2 / (0.026 * 0.026)) * 9.0 + exp(-r2 / (0.07 * 0.07)) * 0.1);
        }
        // the sun through the glass
        float sd = dot(d, uSunDir);
        float occl = elD > 20.7 ? 1.0 : 0.45;
        col += uSunCol * uSunVis * occl * (smoothstep(0.99972, 0.99986, sd) * 24.0 + pow(max(sd, 0.0), 220.0) * 2.5 + pow(max(sd, 0.0), 10.0) * 0.22);
        gl_FragColor = vec4(col, 1.0);
      }`,
  });
  const envScene = new THREE.Scene();
  const sphere = new THREE.Mesh(new THREE.SphereGeometry(10, 96, 48), mat);
  envScene.add(sphere);

  const cubeRT = new THREE.WebGLCubeRenderTarget(256, {
    type: THREE.HalfFloatType, generateMipmaps: false, minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, depthBuffer: false,
  });
  const cubeCam = new THREE.CubeCamera(0.1, 50, cubeRT);
  const pmrem = new THREE.PMREMGenerator(renderer);
  let target = null;

  function regenerate() {
    cubeCam.update(renderer, envScene);
    target = pmrem.fromCubemap(cubeRT.texture, target);
    return target.texture;
  }

  function dispose() {
    mat.dispose();
    sphere.geometry.dispose();
    cubeRT.dispose();
    if (target) target.dispose();
    pmrem.dispose();
  }
  return { uniforms, regenerate, dispose, get texture() { return target ? target.texture : null; } };
}
