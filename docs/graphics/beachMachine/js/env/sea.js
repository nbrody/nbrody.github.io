// The sea: a big plane of swell rolling in from the north, turquoise over the
// sand shallows and deep blue further out, a swash that runs up the beach and
// back, foam where the waves break, and the sun (or the moon) glittering on it.
import * as THREE from 'three';
import { SEA_LEVEL, SHORE } from '../sim/terrain.js';
import { NOISE } from '../render/shaderBits.js';

export function buildSea() {
  const uniforms = THREE.UniformsUtils.merge([THREE.UniformsLib.fog, {
    uTime: { value: 0 }, uSea: { value: SEA_LEVEL }, uZ0: { value: SHORE.z0 }, uSlope: { value: SHORE.slope },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 1, 1) }, uSunVis: { value: 1 },
    uSkyZen: { value: new THREE.Color() }, uSkyHor: { value: new THREE.Color() }, uAmb: { value: new THREE.Color(0.5, 0.5, 0.5) },
    uNight: { value: 0 }, uMoonDir: { value: new THREE.Vector3(0, 1, 0) }, uSwash: { value: 0 },
  }]);
  const mat = new THREE.ShaderMaterial({
    name: 'beach.sea', uniforms, transparent: true, depthWrite: true, fog: true,
    vertexShader: /* glsl */`
      uniform float uTime, uSea, uZ0, uSlope, uSwash;
      varying vec3 vW; varying float vDepth; varying vec3 vN;
      #include <fog_pars_vertex>
      float bedAt(vec2 p) { return p.y < uZ0 ? -(uZ0 - p.y) * uSlope : 0.0; }
      // long-crested swell rolling toward the beach (+z), steepening in the shallows
      vec3 swell(vec2 p, out vec3 n) {
        float depth = max(0.0, uSea - bedAt(p));
        float damp = smoothstep(0.02, 0.6, depth);
        float k1 = 0.55, k2 = 1.1, k3 = 2.3;
        float a1 = 0.09 * damp, a2 = 0.035 * damp, a3 = 0.012;
        float p1 = k1 * (p.y + 0.12 * p.x) + uTime * 1.25;
        float p2 = k2 * (p.y * 0.9 - 0.35 * p.x) + uTime * 1.8;
        float p3 = k3 * (p.y * 0.6 + 0.8 * p.x) + uTime * 2.6;
        float h = a1 * sin(p1) + a2 * sin(p2) + a3 * sin(p3);
        vec2 g = a1 * k1 * cos(p1) * vec2(0.12, 1.0) + a2 * k2 * cos(p2) * vec2(-0.35, 0.9) + a3 * k3 * cos(p3) * vec2(0.8, 0.6);
        n = normalize(vec3(-g.x, 1.0, -g.y));
        return vec3(0.0, h, 0.0);
      }
      void main() {
        vec3 p = (modelMatrix * vec4(position, 1.0)).xyz;
        vec3 n;
        p += swell(p.xz, n);
        // the swash: the edge of the sea breathes up and down the beach
        float near = 1.0 - smoothstep(0.0, 0.5, uSea - bedAt(p.xz));
        p.y += uSwash * (0.3 + 0.7 * near);
        vW = p; vN = n;
        vDepth = p.y - bedAt(p.xz);
        vec4 mvPosition = viewMatrix * vec4(p, 1.0);
        gl_Position = projectionMatrix * mvPosition;
        #include <fog_vertex>
      }`,
    fragmentShader: /* glsl */`
      uniform float uTime, uSunVis, uNight, uSwash;
      uniform vec3 uSunDir, uSunCol, uSkyZen, uSkyHor, uAmb, uMoonDir;
      varying vec3 vW; varying float vDepth; varying vec3 vN;
      #include <fog_pars_fragment>
      ${NOISE}
      void main() {
        vec3 V = normalize(cameraPosition - vW);
        // ripples on the swell
        vec2 q = vW.xz;
        float e = 0.05;
        float r0 = bm_fbm(q * 1.3 + vec2(0.0, uTime * 0.35)) + 0.5 * bm_noise(q * 5.0 - vec2(uTime * 0.6, uTime * 0.9));
        float rx = bm_fbm((q + vec2(e, 0.0)) * 1.3 + vec2(0.0, uTime * 0.35)) + 0.5 * bm_noise((q + vec2(e, 0.0)) * 5.0 - vec2(uTime * 0.6, uTime * 0.9));
        float rz = bm_fbm((q + vec2(0.0, e)) * 1.3 + vec2(0.0, uTime * 0.35)) + 0.5 * bm_noise((q + vec2(0.0, e)) * 5.0 - vec2(uTime * 0.6, uTime * 0.9));
        float dist = length(cameraPosition - vW);
        float rs = 0.22 * (1.0 - smoothstep(20.0, 90.0, dist));
        vec3 N = normalize(vN + vec3(-(rx - r0) / e, 0.0, -(rz - r0) / e) * rs);
        float d = max(vDepth, 0.0);
        // colour of the water column over the sand
        vec3 shallow = vec3(0.30, 0.78, 0.74), mid = vec3(0.06, 0.48, 0.58), deep = vec3(0.02, 0.2, 0.36);
        vec3 body = mix(shallow, mid, smoothstep(0.05, 0.6, d));
        body = mix(body, deep, smoothstep(0.6, 3.5, d));
        body *= uAmb * 1.6 + uSunCol * max(uSunDir.y, 0.0) * 0.25;
        // sky reflection (Fresnel)
        vec3 R = reflect(-V, N);
        float fr = 0.02 + 0.7 * pow(1.0 - max(dot(N, V), 0.0), 5.0);
        // the swell tilts most reflections up into the bluer sky
        vec3 sky = mix(uSkyHor, uSkyZen, pow(clamp(R.y + 0.12, 0.0, 1.0), 0.45));
        vec3 col = mix(body, sky, fr);
        // sun / moon glitter
        vec3 L = uNight > 0.5 ? uMoonDir : uSunDir;
        float sp = pow(max(dot(R, L), 0.0), 600.0) * 60.0 + pow(max(dot(R, L), 0.0), 60.0) * 0.6;
        col += (uNight > 0.5 ? vec3(0.7, 0.75, 0.9) * 0.5 * uNight : uSunCol * uSunVis) * sp;
        // foam: along the running edge, and on the crests breaking in the shallows
        float edge = 1.0 - smoothstep(0.0, 0.05 + 0.03 * bm_noise(q * 3.0 + uTime), d);
        float lace = smoothstep(0.55, 0.8, bm_fbm(q * 4.0 + vec2(uTime * 0.2, -uTime * 0.5)));
        float brk = smoothstep(0.12, 0.3, d) * (1.0 - smoothstep(0.3, 0.9, d));
        float crest = smoothstep(0.55, 0.95, sin(0.55 * (q.y + 0.12 * q.x) + uTime * 1.25 - 1.2)) * brk * lace;
        float foam = clamp(edge * (0.55 + 0.45 * lace) + crest * 0.9 + lace * 0.15 * (1.0 - smoothstep(0.0, 0.25, d)), 0.0, 1.0);
        col = mix(col, vec3(0.95, 0.97, 0.96) * (uAmb * 1.4 + uSunCol * max(uSunDir.y, 0.0) * 0.6), foam);
        // thin water over the sand is clear
        float alpha = mix(smoothstep(0.0, 0.18, d) * 0.9, 1.0, foam * 0.8);
        alpha = max(alpha, smoothstep(0.0, 0.02, d) * 0.35);
        gl_FragColor = vec4(col, alpha);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        #include <fog_fragment>
      }`,
  });
  // dense near the beach, sparse out to the horizon
  const geo = new THREE.BufferGeometry();
  const pos = [], idx = [];
  const xs = [], zs = [];
  for (let x = -160; x <= 160; x += x > -25 && x < 25 ? 0.5 : 4) xs.push(x);
  for (let z = -7.6; z >= -300; z -= z > -30 ? 0.35 : z > -70 ? 2 : 10) zs.push(z);
  for (const z of zs) for (const x of xs) pos.push(x, SEA_LEVEL, z);
  const nx = xs.length;
  for (let j = 0; j < zs.length - 1; j++) for (let i = 0; i < nx - 1; i++) {
    const a = j * nx + i, b = a + 1, c = a + nx, d = c + 1;
    idx.push(a, b, c, b, d, c);
  }
  geo.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  geo.setIndex(idx);
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, mat);
  mesh.name = 'sea';
  mesh.renderOrder = 2;
  mesh.frustumCulled = false;
  return {
    mesh, uniforms,
    update(t) {
      uniforms.uTime.value = t;
      // a set of waves every nine seconds or so, with a smaller one between
      const sw = 0.045 * Math.sin(t * 0.7) + 0.02 * Math.sin(t * 1.23 + 1.1) + 0.012 * Math.sin(t * 0.31);
      uniforms.uSwash.value = sw;
      return sw;
    },
  };
}
