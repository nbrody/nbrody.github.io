// Dark Star — a black hole in a nebula that surrounds you: lensed sky, photon ring,
// a Doppler-bright accretion disk and ripples on the beat.
import { startSphere, num } from '../sphereKit/kit.js';

const glsl = `
uniform float uMass;     // shadow radius, radians
uniform float uTilt;     // how open the disk looks: 0 edge-on … 1 face-on
uniform float uNebula;

const vec3 BH = vec3(0.0, 0.3872, -0.9220);
const vec3 BH_V = vec3(0.0, 0.9220, 0.3872);

vec3 nebula(vec3 q, float t) {
  float n1 = fbm3(q * 1.8 + vec3(0.0, 0.0, t * 0.01));
  float n2 = fbm3(q * 3.7 + n1 * 1.6 + 5.0);
  vec3 c = mix(vec3(0.02, 0.0, 0.06), vec3(0.55, 0.06, 0.4), smoothstep(0.35, 0.75, n1));
  c = mix(c, vec3(0.05, 0.4, 0.6), smoothstep(0.5, 0.85, n2) * 0.8);
  c = mix(c, vec3(1.0, 0.55, 0.2), smoothstep(0.72, 0.9, n1 * n2 * 1.6) * 0.6);
  c *= smoothstep(0.2, 0.65, n1 * 0.6 + n2 * 0.5);
  c *= 1.0 - 0.75 * smoothstep(0.55, 0.72, fbm3(q * 7.0 + 3.0));   // dust lanes
  return c;
}

vec3 scene(vec3 d, float t) {
  float Rs = uMass * (1.0 + 0.05 * uPulse);
  float a = acos(clamp(dot(d, BH), -1.0, 1.0));
  // light bends toward the hole, so each pixel sees sky from nearer it (or from across it)
  vec3 ld = d;
  vec3 k = cross(BH, d);
  float kl = length(k);
  if (kl > 1e-5) {
    k /= kl;
    float defl = min(2.2 * Rs * Rs / max(a, Rs), 2.5);
    ld = normalize(d * cos(defl) - cross(k, d) * sin(defl));
  }
  float spin = t * 0.01;
  vec3 q = vec3(ld.x * cos(spin) - ld.z * sin(spin), ld.y, ld.x * sin(spin) + ld.z * cos(spin));
  vec3 col = nebula(q, t) * uNebula + stars(q) * 1.1;

  vec2 w = vec2(d.x, dot(d, BH_V));
  w = w / max(length(w), 1e-6) * a;              // angular offset from the hole
  vec2 e = vec2(w.x, w.y / uTilt);               // the tilted disk
  float rr = length(e) / Rs;
  float ang = atan(e.y, e.x) - t * 1.6 / pow(max(rr, 1.0), 1.5);
  float tex = fbm3(vec3(cos(ang) * 2.5, sin(ang) * 2.5, rr * 2.2));
  vec3 dc = mix(vec3(1.0, 0.35, 0.08), vec3(1.0, 0.92, 0.75), clamp(1.6 - rr * 0.3, 0.0, 1.0)) * (0.5 + tex);
  float doppler = 1.0 - 0.75 * e.x / max(length(e), 1e-4);   // the approaching side is brighter
  dc *= doppler * (1.1 + 0.9 * uPulse) * smoothstep(1.5, 1.7, rr) * smoothstep(5.0, 3.6, rr);
  // the far side of the disk, lensed up and over the shadow
  float ha = atan(w.y, w.x);
  float halo = smoothstep(1.0, 1.12, a / Rs) * smoothstep(2.1, 1.25, a / Rs);
  vec3 hc = vec3(1.0, 0.65, 0.4) * halo * (0.35 + 0.65 * smoothstep(-0.3, 0.9, sin(ha))) *
            (0.8 + 0.6 * fbm3(vec3(cos(ha - t * 0.4) * 3.0, sin(ha - t * 0.4) * 3.0, 1.0)));
  if (w.y > 0.0) col += dc;
  col += hc * (1.0 + 0.5 * uPulse);
  col *= 1.0 - smoothstep(Rs + gPix, Rs - gPix, a);
  col += vec3(1.0, 0.85, 0.6) * exp(-pow((a - Rs * 1.04) / (0.003 + gPix), 2.0)) * 1.2;   // photon ring
  if (w.y <= 0.0) col += dc;
  float ph = fract(uBeat * 0.5);
  col += vec3(0.2, 0.6, 1.0) * exp(-pow((a - Rs * 1.5 - ph * 1.4) * 18.0, 2.0)) * (1.0 - ph) * 0.35;  // ripples on the beat
  return col;
}
`;

startSphere({
  glsl,
  pitch: 20,
  uniforms: { uMass: () => num('mass'), uTilt: () => num('diskTilt'), uNebula: () => num('nebula') },
});
