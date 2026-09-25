// Small allocation-free vector helpers for the simulation (no three.js here so
// the physics runs headless in Node for tests).

export const G = 9.81;

export const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
export const set = (o, x, y, z) => { o.x = x; o.y = y; o.z = z; return o; };
export const copy = (o, a) => { o.x = a.x; o.y = a.y; o.z = a.z; return o; };
export const add = (o, a, b) => { o.x = a.x + b.x; o.y = a.y + b.y; o.z = a.z + b.z; return o; };
export const sub = (o, a, b) => { o.x = a.x - b.x; o.y = a.y - b.y; o.z = a.z - b.z; return o; };
export const scale = (o, a, s) => { o.x = a.x * s; o.y = a.y * s; o.z = a.z * s; return o; };
export const addScaled = (o, a, b, s) => { o.x = a.x + b.x * s; o.y = a.y + b.y * s; o.z = a.z + b.z * s; return o; };
export const dot = (a, b) => a.x * b.x + a.y * b.y + a.z * b.z;
export const len = (a) => Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z);
export const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z);
export const cross = (o, a, b) => {
  const x = a.y * b.z - a.z * b.y, y = a.z * b.x - a.x * b.z, z = a.x * b.y - a.y * b.x;
  o.x = x; o.y = y; o.z = z; return o;
};
export const norm = (o, a) => {
  const l = Math.sqrt(a.x * a.x + a.y * a.y + a.z * a.z) || 1;
  o.x = a.x / l; o.y = a.y / l; o.z = a.z / l; return o;
};
export const lerp = (a, b, t) => a + (b - a) * t;
export const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
export const smoothstep = (t) => (t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t));
export const deg = Math.PI / 180;

// Quaternion helpers ([x,y,z,w] arrays) for ball orientation.
export function quatIntegrate(q, wx, wy, wz, dt) {
  // q += 0.5 * (0,w) * q * dt, then renormalise
  const x = q[0], y = q[1], z = q[2], w = q[3];
  const h = 0.5 * dt;
  q[0] = x + h * (wx * w + wy * z - wz * y);
  q[1] = y + h * (wy * w + wz * x - wx * z);
  q[2] = z + h * (wz * w + wx * y - wy * x);
  q[3] = w + h * (-wx * x - wy * y - wz * z);
  const l = Math.hypot(q[0], q[1], q[2], q[3]) || 1;
  q[0] /= l; q[1] /= l; q[2] /= l; q[3] /= l;
}

// Deterministic PRNG so headless runs are reproducible.
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
