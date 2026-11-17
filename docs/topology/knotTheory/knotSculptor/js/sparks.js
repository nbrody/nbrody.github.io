// GPU-instanced velocity-streaked spark particles for magical knot drawing and closure bursts.
// Works identically in desktop mono, Meta Quest stereo VR, and Passthrough AR (view-space billboarding).
import * as THREE from 'three';
import { samplePaletteLinear } from './palettes.js';

const MAX_SPARKS = 420;

export class SparkSystem {
  constructor(scene) {
    this.max = MAX_SPARKS;
    this.pool = Array.from({ length: MAX_SPARKS }, () => ({
      alive: false,
      px: 0, py: 0, pz: 0,
      vx: 0, vy: 0, vz: 0,
      cr: 1, cg: 0.5, cb: 0.9,
      age: 0, maxAge: 0.5, radius: 0.005, seed: 0, stretch: 1.5,
    }));
    this.cursor = 0;
    this.activeCount = 0;
    this._carry = 0;

    const base = new THREE.PlaneGeometry(1, 1);
    const geom = new THREE.InstancedBufferGeometry();
    geom.index = base.index;
    geom.attributes.position = base.attributes.position;
    geom.attributes.uv = base.attributes.uv;

    this.aPos = new THREE.InstancedBufferAttribute(new Float32Array(3 * MAX_SPARKS), 3);
    this.aVel = new THREE.InstancedBufferAttribute(new Float32Array(3 * MAX_SPARKS), 3);
    this.aCol = new THREE.InstancedBufferAttribute(new Float32Array(3 * MAX_SPARKS), 3);
    this.aMeta = new THREE.InstancedBufferAttribute(new Float32Array(4 * MAX_SPARKS), 4);
    for (const a of [this.aPos, this.aVel, this.aCol, this.aMeta]) a.setUsage(THREE.DynamicDrawUsage);

    geom.setAttribute('iPos', this.aPos);
    geom.setAttribute('iVel', this.aVel);
    geom.setAttribute('iColor', this.aCol);
    geom.setAttribute('iMeta', this.aMeta);
    geom.instanceCount = 0;
    this.geometry = geom;

    this.material = new THREE.ShaderMaterial({
      uniforms: {
        uDark: { value: 1.0 },
      },
      vertexShader: /* glsl */ `
        attribute vec3 iPos;
        attribute vec3 iVel;
        attribute vec3 iColor;
        attribute vec4 iMeta;

        varying vec2 vCorner;
        varying vec3 vColor;
        varying float vLife;
        varying float vSeed;

        void main() {
          vCorner = uv * 2.0 - 1.0;
          vColor = iColor;
          vLife = iMeta.x;
          vSeed = iMeta.z;

          vec4 mvCenter = modelViewMatrix * vec4(iPos, 1.0);
          vec3 mvVel = mat3(modelViewMatrix) * iVel;
          float spd = length(mvVel.xy);
          vec2 dir = spd > 1e-4 ? (mvVel.xy / spd) : vec2(cos(iMeta.z * 6.28318), sin(iMeta.z * 6.28318));
          vec2 perp = vec2(-dir.y, dir.x);

          float r = iMeta.y * (0.35 + 0.65 * sqrt(max(0.0, vLife)));
          float len = r * (1.2 + iMeta.w * min(3.2, spd * 2.4));

          mvCenter.xy += dir * (vCorner.x * len) + perp * (vCorner.y * r);
          gl_Position = projectionMatrix * mvCenter;
        }
      `,
      fragmentShader: /* glsl */ `
        uniform float uDark;
        varying vec2 vCorner;
        varying vec3 vColor;
        varying float vLife;
        varying float vSeed;

        void main() {
          float d2 = dot(vCorner, vCorner);
          if (d2 > 1.0) discard;

          float tw = 0.82 + 0.18 * sin((1.0 - vLife) * 32.0 + vSeed * 19.0);
          float core = exp(-8.5 * d2);
          float halo = exp(-2.6 * d2) * (1.0 - d2);

          vec3 col;
          float alpha;
          if (uDark > 0.5) {
            vec3 hot = mix(vColor, vec3(1.0, 0.97, 0.92), 0.72 * vLife);
            col = (hot * core * 1.55 + vColor * halo * 1.25) * vLife * tw;
            alpha = clamp((core * 0.28 + halo * 0.12) * vLife, 0.0, 0.48);
          } else {
            float mask = clamp((core * 1.0 + halo * 0.82) * vLife * tw, 0.0, 0.96);
            vec3 rich = pow(max(vColor, vec3(0.0)), vec3(1.15));
            vec3 sparkCol = mix(rich * 0.92, vec3(1.0, 0.98, 0.90), core * 0.55 * vLife);
            alpha = mask;
            col = sparkCol * alpha;
          }
          gl_FragColor = vec4(col, alpha);
          #include <colorspace_fragment>
        }
      `,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      toneMapped: false,
      blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor,
      blendDst: THREE.OneMinusSrcAlphaFactor,
      blendSrcAlpha: THREE.OneFactor,
      blendDstAlpha: THREE.OneMinusSrcAlphaFactor,
    });

    this.mesh = new THREE.Mesh(geom, this.material);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 15;
    this.mesh.visible = false;
    scene.add(this.mesh);
  }

  setDark(isDark) {
    this.material.uniforms.uDark.value = isDark ? 1.0 : 0.0;
  }

  spawn({ px, py, pz, vx, vy, vz, cr, cg, cb, maxAge = 0.55, radius = 0.0048, stretch = 1.6 }) {
    const s = this.pool[this.cursor];
    this.cursor = (this.cursor + 1) % this.max;
    s.alive = true;
    s.px = px; s.py = py; s.pz = pz;
    s.vx = vx; s.vy = vy; s.vz = vz;
    s.cr = cr; s.cg = cg; s.cb = cb;
    s.age = 0;
    s.maxAge = maxAge;
    s.radius = radius;
    s.seed = Math.random();
    s.stretch = stretch;
  }

  /**
   * Emit flying sparks from the active drawing tip.
   * `pos` and `prevPos` are world-space Vector3s; `dt` is frame delta (s); `rgbLinear` is `[r, g, b]`.
   */
  emitTip(pos, prevPos, dt, rgbLinear, scale = 1) {
    const dx = prevPos ? pos.x - prevPos.x : 0;
    const dy = prevPos ? pos.y - prevPos.y : 0;
    const dz = prevPos ? pos.z - prevPos.z : 0;
    const dist = Math.hypot(dx, dy, dz);
    const safeDt = Math.max(0.004, dt || 0.016);
    const speed = dist / safeDt;

    // Combine distance-based emission (dense trail along fast strokes) + gentle idle sparkle while held.
    this._carry += dist * 210 + safeDt * 18;
    const count = Math.min(18, Math.floor(this._carry));
    this._carry -= count;
    if (count <= 0) return;

    const invD = dist > 1e-6 ? 1 / dist : 0;
    const tx = dx * invD, ty = dy * invD, tz = dz * invD;
    const [cr, cg, cb] = rgbLinear;

    for (let i = 0; i < count; i++) {
      const f = count > 1 ? i / count : 1;
      const ox = prevPos ? prevPos.x + dx * f : pos.x;
      const oy = prevPos ? prevPos.y + dy * f : pos.y;
      const oz = prevPos ? prevPos.z + dz * f : pos.z;

      // Random unit vector for radial spray
      const u = Math.random() * 2 - 1;
      const phi = Math.random() * Math.PI * 2;
      const rxy = Math.sqrt(Math.max(0, 1 - u * u));
      const rx = rxy * Math.cos(phi), ry = rxy * Math.sin(phi), rz = u;

      const spray = (0.14 + Math.random() * 0.36 + Math.min(0.65, speed * 0.24)) * scale;
      const backThrow = Math.min(0.55, speed * 0.18) * scale;
      const vx = rx * spray - tx * backThrow * (0.3 + Math.random() * 0.7);
      const vy = ry * spray - ty * backThrow * (0.3 + Math.random() * 0.7) + 0.08 * scale;
      const vz = rz * spray - tz * backThrow * (0.3 + Math.random() * 0.7);

      // Slight jitter in color warmth per spark
      const warm = Math.random() * 0.22;
      this.spawn({
        px: ox + rx * 0.003 * scale,
        py: oy + ry * 0.003 * scale,
        pz: oz + rz * 0.003 * scale,
        vx, vy, vz,
        cr: Math.min(1, cr * (1 - warm) + warm),
        cg: Math.min(1, cg * (1 - warm) + warm * 0.92),
        cb: Math.min(1, cb * (1 - warm) + warm * 0.78),
        maxAge: 0.30 + Math.random() * 0.44,
        radius: (0.0034 + Math.random() * 0.0036) * scale,
        stretch: 1.4 + Math.random() * 1.5,
      });
    }
  }

  /**
   * Celebratory spark burst when a drawn strand closes into a knot!
   * Emits a concentrated burst at the closure seam (`seamWorld`) plus a shimmer along `loopWorldPts`.
   */
  emitClosureBurst(seamWorld, loopWorldPts, paletteId, fallbackHex = '#818cf8', scale = 1) {
    const rgb = [1, 1, 1];
    // 1. Seam star-burst where the two ends fuse
    if (seamWorld) {
      samplePaletteLinear(paletteId, 0, rgb, fallbackHex);
      const seamCount = 34;
      for (let i = 0; i < seamCount; i++) {
        const u = Math.random() * 2 - 1;
        const phi = Math.random() * Math.PI * 2;
        const rxy = Math.sqrt(Math.max(0, 1 - u * u));
        const spd = (0.22 + Math.random() * 0.58) * scale;
        samplePaletteLinear(paletteId, (Math.random() - 0.5) * 0.22, rgb, fallbackHex);
        this.spawn({
          px: seamWorld.x, py: seamWorld.y, pz: seamWorld.z,
          vx: rxy * Math.cos(phi) * spd,
          vy: rxy * Math.sin(phi) * spd + 0.12 * scale,
          vz: u * spd,
          cr: rgb[0], cg: rgb[1], cb: rgb[2],
          maxAge: 0.42 + Math.random() * 0.52,
          radius: (0.0042 + Math.random() * 0.0042) * scale,
          stretch: 1.8 + Math.random() * 1.6,
        });
      }
    }
    // 2. Shimmering sparks along the newly closed loop as the gradient period smooths out
    const N = loopWorldPts ? Math.floor(loopWorldPts.length / 3) : 0;
    if (N >= 4) {
      const ringSparks = 28;
      for (let k = 0; k < ringSparks; k++) {
        const idx = Math.floor((k / ringSparks) * N) % N;
        const px = loopWorldPts[3 * idx], py = loopWorldPts[3 * idx + 1], pz = loopWorldPts[3 * idx + 2];
        samplePaletteLinear(paletteId, k / ringSparks, rgb, fallbackHex);
        const u = Math.random() * 2 - 1;
        const phi = Math.random() * Math.PI * 2;
        const rxy = Math.sqrt(Math.max(0, 1 - u * u));
        const spd = (0.10 + Math.random() * 0.28) * scale;
        this.spawn({
          px, py, pz,
          vx: rxy * Math.cos(phi) * spd,
          vy: rxy * Math.sin(phi) * spd + 0.07 * scale,
          vz: u * spd,
          cr: rgb[0], cg: rgb[1], cb: rgb[2],
          maxAge: 0.38 + Math.random() * 0.48,
          radius: (0.0032 + Math.random() * 0.0030) * scale,
          stretch: 1.3 + Math.random() * 1.2,
        });
      }
    }
  }

  update(dt) {
    if (dt <= 0) return this.activeCount > 0;
    const drag = Math.exp(-3.4 * dt);
    const pos = this.aPos.array;
    const vel = this.aVel.array;
    const col = this.aCol.array;
    const meta = this.aMeta.array;
    let n = 0;

    for (let i = 0; i < this.max; i++) {
      const s = this.pool[i];
      if (!s.alive) continue;
      s.age += dt;
      if (s.age >= s.maxAge) {
        s.alive = false;
        continue;
      }
      // Lively curl flutter + gentle gravity + air drag
      const swirl = 0.35 * dt;
      const sx = Math.sin(s.age * 14 + s.seed * 11), cz = Math.cos(s.age * 13 + s.seed * 7);
      s.vx = (s.vx + sx * swirl) * drag;
      s.vy = (s.vy - 0.62 * dt) * drag;
      s.vz = (s.vz + cz * swirl) * drag;

      s.px += s.vx * dt;
      s.py += s.vy * dt;
      s.pz += s.vz * dt;

      const life = 1 - s.age / s.maxAge;
      const p3 = 3 * n, p4 = 4 * n;
      pos[p3] = s.px; pos[p3 + 1] = s.py; pos[p3 + 2] = s.pz;
      vel[p3] = s.vx; vel[p3 + 1] = s.vy; vel[p3 + 2] = s.vz;
      col[p3] = s.cr; col[p3 + 1] = s.cg; col[p3 + 2] = s.cb;
      meta[p4] = life; meta[p4 + 1] = s.radius; meta[p4 + 2] = s.seed; meta[p4 + 3] = s.stretch;
      n++;
    }

    const wasActive = this.activeCount > 0;
    this.activeCount = n;
    this.geometry.instanceCount = n;
    this.mesh.visible = n > 0;
    if (n > 0 || wasActive) {
      this.aPos.needsUpdate = true;
      this.aVel.needsUpdate = true;
      this.aCol.needsUpdate = true;
      this.aMeta.needsUpdate = true;
    }
    return n > 0 || wasActive;
  }
}
