// Glasshouse environment — time-of-day model: sun/moon path and a keyframed palette.
import * as THREE from 'three';
import { clamp, smoothstep, DEG } from './util.js';

// Sun elevation (deg) and azimuth (deg, clockwise from north = -z) keyframes.
const SUN_EL = [
  [-2.5, -30], [0.0, -38], [3.0, -30], [4.6, -16], [5.5, -8], [6.2, 0], [7.0, 8], [8.0, 19], [10.0, 41],
  [12.5, 58], [15.0, 41], [16.5, 24], [17.5, 13], [18.3, 4.8], [18.85, 0.2], [19.3, -3], [20.0, -7.5],
  [20.6, -11], [22.0, -22], [24.0, -38], [26.5, -30],
];
const SUN_AZ = [[4.0, 40], [6.2, 68], [8.0, 92], [10.0, 128], [12.5, 180], [15.0, 234], [17.5, 267], [18.85, 290], [20.5, 312], [22, 330]];

// Night switches the shadow-casting light from sun to moon while it is nearly dark.
export const MOON_SWITCH_EVENING = 20.0;
export const MOON_SWITCH_MORNING = 5.55;
const MOON_AZ = 148, MOON_EL = 38;

const NIGHT = ['#040918', '#101a36', '#a3b6ff', 0.32, '#2f4270', '#16120f', 0.18, 1.8, 380, 1.0, 1.0, '#262e4e', '#0a0e1c', 0.0, 1.0];
const KEYS = [
  // h     zenith     horizon    light      lightI  hemiSky    hemiGnd    hemiI exp   fogFar night lamps cloudLit   cloudShade dust envI
  [0.0, ...NIGHT],
  [4.6, ...NIGHT],
  [5.55, '#16244d', '#51547a', '#b7c2ff', 0.04, '#4a5a88', '#211b18', 0.3, 1.72, 330, 0.8, 1.0, '#565573', '#1d2138', 0.0, 0.9],
  [6.2,  '#37568f', '#e39a76', '#ff9d62', 1.3, '#7f92c0', '#46382e', 0.34, 1.34, 300, 0.25, 0.3, '#ffb48a', '#6a6078', 0.35, 0.72],
  [7.0,  '#4a7bc0', '#efc39c', '#ffc88e', 3.4, '#9db3dc', '#63513e', 0.38, 1.1, 360, 0.0, 0.0, '#ffe2c4', '#8c8ca4', 0.7, 0.62],
  [8.0,  '#4480cc', '#cddbe6', '#ffe3c0', 4.0, '#a8c2e6', '#6d5b46', 0.4, 1.02, 460, 0.0, 0.0, '#fff4e8', '#a3abbb', 0.85, 0.62],
  [10.5, '#316fca', '#bfd4ea', '#fff1df', 3.85, '#b0cbee', '#75634e', 0.42, 0.95, 600, 0.0, 0.0, '#ffffff', '#aab4c4', 0.6, 0.68],
  [12.5, '#2d6ac6', '#b9d0e8', '#fff6ea', 3.75, '#b4cff0', '#786650', 0.42, 0.92, 650, 0.0, 0.0, '#ffffff', '#b0bac8', 0.5, 0.68],
  [15.0, '#3572c8', '#c6d6e6', '#ffefdb', 3.85, '#adc6e8', '#77614a', 0.4, 0.95, 620, 0.0, 0.0, '#fffaf2', '#a8b0c0', 0.6, 0.66],
  [16.5, '#4079c4', '#e2d4bc', '#ffd6a4', 4.7, '#a6bbdd', '#715840', 0.36, 1.0, 560, 0.0, 0.0, '#fff0d8', '#9c9aae', 0.9, 0.58],
  [17.5, '#4570b6', '#efc08a', '#ffbb70', 5.7, '#96aad0', '#684c35', 0.3, 1.04, 520, 0.0, 0.0, '#ffd8a4', '#8a7c8e', 1.0, 0.5],
  [18.3, '#3f5fa4', '#f2a266', '#ff984c', 4.6, '#8595c4', '#5a402e', 0.3, 1.1, 480, 0.0, 0.12, '#ffb070', '#7a6278', 0.9, 0.5],
  [18.85,'#34508f', '#ea9460', '#ff7a3e', 1.8, '#7584b8', '#4c3629', 0.32, 1.2, 460, 0.05, 0.5, '#f09a70', '#5e4c6c', 0.5, 0.58],
  [19.3, '#1f3170', '#cf8a66', '#ff8048', 0.06, '#56639a', '#3a2b26', 0.36, 1.38, 440, 0.3, 0.8, '#b0766c', '#302c4a', 0.0, 0.8],
  [20.0, '#111a42', '#3e4670', '#9aa8e8', 0.04, '#3c4874', '#211b18', 0.28, 1.6, 410, 0.75, 1.0, '#34385a', '#13172a', 0.0, 0.92],
  [20.6, '#070d23', '#1a2445', '#a3b6ff', 0.3, '#33447a', '#18130f', 0.2, 1.75, 390, 1.0, 1.0, '#262e4e', '#0b1020', 0.0, 1.0],
  [22.0, ...NIGHT],
  [24.0, ...NIGHT],
].map((k) => ({
  h: k[0], zen: new THREE.Color(k[1]), hor: new THREE.Color(k[2]), light: new THREE.Color(k[3]), lightI: k[4],
  hemiSky: new THREE.Color(k[5]), hemiGnd: new THREE.Color(k[6]), hemiI: k[7], exposure: k[8], fogFar: k[9],
  night: k[10], lamps: k[11], cloudLit: new THREE.Color(k[12]), cloudShade: new THREE.Color(k[13]), dust: k[14], envI: k[15],
}));

/** Cubic Hermite (Catmull-Rom style) through non-uniform keys [[x,y],...]. */
function hermite(keys, x) {
  if (x <= keys[0][0]) return keys[0][1];
  const n = keys.length;
  if (x >= keys[n - 1][0]) return keys[n - 1][1];
  let i = 0;
  while (i < n - 2 && keys[i + 1][0] < x) i++;
  const [x0, y0] = keys[i], [x1, y1] = keys[i + 1];
  const slope = (a, b) => (keys[b][1] - keys[a][1]) / (keys[b][0] - keys[a][0]);
  const m0 = i > 0 ? slope(i - 1, i + 1) : slope(i, i + 1);
  const m1 = i + 2 < n ? slope(i, i + 2) : slope(i, i + 1);
  const h = x1 - x0, t = (x - x0) / h, t2 = t * t, t3 = t2 * t;
  return (2 * t3 - 3 * t2 + 1) * y0 + (t3 - 2 * t2 + t) * h * m0 + (-2 * t3 + 3 * t2) * y1 + (t3 - t2) * h * m1;
}

export function dirFromAzEl(azDeg, elDeg, out = new THREE.Vector3()) {
  const az = azDeg * DEG, el = elDeg * DEG;
  return out.set(Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el));
}

/** Samples the full time-of-day state. Reuses `out` to avoid allocation. */
export function sampleTimeOfDay(hours, out) {
  const h = ((hours % 24) + 24) % 24;
  const o = out || {
    zen: new THREE.Color(), hor: new THREE.Color(), light: new THREE.Color(), hemiSky: new THREE.Color(), hemiGnd: new THREE.Color(),
    cloudLit: new THREE.Color(), cloudShade: new THREE.Color(), sunDir: new THREE.Vector3(), moonDir: new THREE.Vector3(),
    lightDir: new THREE.Vector3(),
  };
  let i = 0;
  while (i < KEYS.length - 2 && KEYS[i + 1].h <= h) i++;
  const a = KEYS[i], b = KEYS[i + 1];
  const t = clamp((h - a.h) / (b.h - a.h), 0, 1);
  o.zen.copy(a.zen).lerp(b.zen, t);
  o.hor.copy(a.hor).lerp(b.hor, t);
  o.light.copy(a.light).lerp(b.light, t);
  o.hemiSky.copy(a.hemiSky).lerp(b.hemiSky, t);
  o.hemiGnd.copy(a.hemiGnd).lerp(b.hemiGnd, t);
  o.cloudLit.copy(a.cloudLit).lerp(b.cloudLit, t);
  o.cloudShade.copy(a.cloudShade).lerp(b.cloudShade, t);
  const L = (k) => a[k] + (b[k] - a[k]) * t;
  o.lightI = L('lightI'); o.hemiI = L('hemiI'); o.exposure = L('exposure'); o.fogFar = L('fogFar');
  o.night = L('night'); o.lamps = L('lamps'); o.dust = L('dust'); o.envI = L('envI');

  const el = hermite(SUN_EL, h);
  const az = hermite(SUN_AZ, h);
  o.sunEl = el; o.sunAz = az;
  dirFromAzEl(az, el, o.sunDir);
  dirFromAzEl(MOON_AZ + (h < 12 ? h + 24 - 20 : h - 20) * 4, MOON_EL, o.moonDir);
  o.isMoon = h >= MOON_SWITCH_EVENING || h < MOON_SWITCH_MORNING;
  if (o.isMoon) o.lightDir.copy(o.moonDir);
  else dirFromAzEl(az, Math.max(el, 2.5), o.lightDir);
  // sun visibility for sky disk / glow
  o.sunVis = smoothstep(-4, 1.5, el);
  o.twilight = smoothstep(-10, -1, el) * (1 - smoothstep(4, 16, el));  // warm horizon glow strength
  o.hours = h;
  return o;
}

export const PRESETS = { morning: 8, noon: 12.5, golden: 17.5, dusk: 19.3, night: 22 };
