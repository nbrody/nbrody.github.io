// Glasshouse environment — fireflies, dust motes in the sunbeams, lamp & bulb glows.
import * as THREE from 'three';
import { Rng, TAU, lerp } from './util.js';
import * as LY from './layout.js';

const SPRITE_FRAG_END = /* glsl */`
  #include <tonemapping_fragment>
  #include <colorspace_fragment>
`;

export function buildFx(lampPositions, bulbPositions, { seed = 5, maxPointSize = 256 } = {}) {
  const rng = new Rng(seed);
  const group = new THREE.Group();
  group.name = 'glasshouse-fx';
  const U = {
    uTime: { value: 0 }, uScale: { value: 800 }, uMaxSize: { value: maxPointSize },
    uFirefly: { value: 0 }, uDust: { value: 0 }, uGlow: { value: 0 },
    uSunDir: { value: new THREE.Vector3(0, 1, 0) }, uSunCol: { value: new THREE.Color(1, 0.9, 0.7) },
    uLampCol: { value: new THREE.Color(1.0, 0.62, 0.3) }, uFireflyCol: { value: new THREE.Color(0.75, 1.0, 0.3) },
  };

  // ---------------------------------------------------------- fireflies
  {
    const n = 260;
    const pos = new Float32Array(n * 3), seedA = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      let x, z;
      do { const a = rng.range(0, TAU), r = rng.range(8.0, 13.0); x = Math.cos(a) * r; z = Math.sin(a) * r; } while (!LY.inBeds(x, z, 0.2));
      pos[i * 3] = x; pos[i * 3 + 1] = rng.chance(0.85) ? rng.range(0.5, 2.6) : rng.range(2.6, 5.5); pos[i * 3 + 2] = z;
      seedA.set([rng.next(), rng.next(), rng.next(), rng.next()], i * 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seedA, 4));
    const m = new THREE.ShaderMaterial({
      name: 'gh.fireflies', uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: /* glsl */`
        attribute vec4 aSeed;
        uniform float uTime, uScale, uFirefly, uMaxSize;
        varying float vA;
        void main() {
          float t = uTime * (0.16 + 0.12 * aSeed.x);
          vec3 p = position + vec3(
            sin(t + aSeed.y * 6.283) * 0.9 + sin(t * 2.3 + aSeed.z * 5.0) * 0.25,
            sin(t * 0.7 + aSeed.z * 6.283) * 0.35,
            cos(t * 0.8 + aSeed.w * 6.283) * 0.9 + cos(t * 1.9 + aSeed.y * 4.0) * 0.25);
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          gl_Position = projectionMatrix * mv;
          float blink = pow(max(0.0, sin(uTime * (0.45 + aSeed.w * 0.8) + aSeed.x * 40.0)), 3.0);
          vA = blink * uFirefly;
          gl_PointSize = vA < 0.003 ? 0.0 : clamp(0.15 * uScale / max(-mv.z, 0.1), 2.5, uMaxSize);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uFireflyCol;
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = exp(-d * d * 6.0) * 0.5 + exp(-d * d * 45.0) * 1.4;
          gl_FragColor = vec4(uFireflyCol * a * vA * 2.2, 1.0);
          ${SPRITE_FRAG_END}
        }`,
    });
    const pts = new THREE.Points(g, m);
    pts.name = 'gh.fireflies'; pts.frustumCulled = false; pts.renderOrder = 20;
    group.add(pts);
  }

  // ---------------------------------------------------------- dust motes
  {
    const n = 2200;
    const pos = new Float32Array(n * 3), seedA = new Float32Array(n * 4);
    for (let i = 0; i < n; i++) {
      const a = rng.range(0, TAU), r = 13.2 * Math.sqrt(rng.next());
      pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = rng.range(0.3, 17); pos[i * 3 + 2] = Math.sin(a) * r;
      seedA.set([rng.next(), rng.next(), rng.next(), rng.next()], i * 4);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSeed', new THREE.BufferAttribute(seedA, 4));
    const m = new THREE.ShaderMaterial({
      name: 'gh.dust', uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: /* glsl */`
        attribute vec4 aSeed;
        uniform float uTime, uScale, uDust;
        uniform vec3 uSunDir;
        varying float vA;
        void main() {
          float t = uTime;
          vec3 p = position;
          p.y = 0.3 + mod(p.y - 0.3 + t * (0.012 + 0.03 * (aSeed.x - 0.35)), 16.7);
          p.x += sin(t * (0.05 + 0.08 * aSeed.y) + aSeed.z * 6.283) * 0.6;
          p.z += cos(t * (0.04 + 0.07 * aSeed.w) + aSeed.y * 6.283) * 0.6;
          vec4 wp = modelMatrix * vec4(p, 1.0);
          vec3 v = wp.xyz - cameraPosition;
          float dist = length(v);
          float fwd = pow(max(dot(v / dist, uSunDir), 0.0), 5.0);
          float fade = smoothstep(0.5, 2.0, dist) * (1.0 - smoothstep(9.0, 20.0, dist));
          float tw = 0.55 + 0.45 * sin(t * (0.6 + aSeed.z) + aSeed.w * 30.0);
          vA = uDust * (0.1 + 1.8 * fwd) * fade * tw * (0.6 + 0.4 * smoothstep(1.0, 5.0, p.y));
          vec4 mv = viewMatrix * wp;
          gl_Position = projectionMatrix * mv;
          gl_PointSize = vA < 0.002 ? 0.0 : clamp((0.011 + 0.012 * aSeed.x) * uScale / dist, 1.0, 6.0);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uSunCol;
        varying float vA;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = smoothstep(1.0, 0.2, d);
          gl_FragColor = vec4(uSunCol * a * vA, 1.0);
          ${SPRITE_FRAG_END}
        }`,
    });
    const pts = new THREE.Points(g, m);
    pts.name = 'gh.dust'; pts.frustumCulled = false; pts.renderOrder = 21;
    group.add(pts);
  }

  // ---------------------------------------------------------- glows
  {
    const all = [...lampPositions.map((p) => [p, 1.9, 0]), ...bulbPositions.map((p) => [p, 0.32, 1])];
    const n = all.length;
    const pos = new Float32Array(n * 3), size = new Float32Array(n), kind = new Float32Array(n);
    all.forEach(([p, s, k], i) => { pos.set([p.x, p.y, p.z], i * 3); size[i] = s; kind[i] = k; });
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aSize', new THREE.BufferAttribute(size, 1));
    g.setAttribute('aKind', new THREE.BufferAttribute(kind, 1));
    const m = new THREE.ShaderMaterial({
      name: 'gh.glows', uniforms: U, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false,
      vertexShader: /* glsl */`
        attribute float aSize, aKind;
        uniform float uGlow, uScale, uMaxSize, uTime;
        varying float vA; varying float vKind;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_Position = projectionMatrix * mv;
          float d = max(-mv.z, 0.05);
          float flick = aKind > 0.5 ? (0.9 + 0.1 * sin(uTime * 1.3 + position.x * 5.0 + position.z * 3.0)) : (0.94 + 0.06 * sin(uTime * 9.0 + position.x * 3.0) * sin(uTime * 5.3 + position.z));
          vA = uGlow * flick;
          vKind = aKind;
          gl_PointSize = vA < 0.002 ? 0.0 : clamp(aSize * uScale / d, 1.0, uMaxSize);
        }`,
      fragmentShader: /* glsl */`
        uniform vec3 uLampCol;
        varying float vA; varying float vKind;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = exp(-d * d * 8.0) * 0.28 + exp(-d * d * 60.0) * 0.9;
          a *= 1.0 - smoothstep(0.85, 1.0, d);
          vec3 c = vKind > 0.5 ? vec3(1.0, 0.78, 0.48) : uLampCol;
          gl_FragColor = vec4(c * a * vA * (vKind > 0.5 ? 1.4 : 1.0), 1.0);
          ${SPRITE_FRAG_END}
        }`,
    });
    const pts = new THREE.Points(g, m);
    pts.name = 'gh.glows'; pts.frustumCulled = false; pts.renderOrder = 22;
    group.add(pts);
  }
  return { group, uniforms: U };
}
