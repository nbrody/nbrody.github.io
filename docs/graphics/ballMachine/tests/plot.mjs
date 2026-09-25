// Draw plan + elevation views of the layout to a PNG (no dependencies).
// node tests/plot.mjs out.png [clearanceReport]
import { writeFileSync } from 'node:fs';
import { deflateSync } from 'node:zlib';
import { buildMachine, BRANCHES } from '../js/sim/layout.js';

const out = process.argv[2] || 'layout.png';
const m = buildMachine({ balls: 0, lenient: true });
const W = 1800, H = 1250;
const img = new Uint8Array(W * H * 3).fill(250);

function hex(c) { const n = parseInt(c.slice(1), 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
function px(x, y, col, a = 1) {
  x = Math.round(x); y = Math.round(y);
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = 3 * (y * W + x);
  for (let k = 0; k < 3; k++) img[i + k] = img[i + k] * (1 - a) + col[k] * a;
}
function line(x0, y0, x1, y1, col, w = 1) {
  const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0)) + 1;
  for (let i = 0; i <= n; i++) {
    const x = x0 + (x1 - x0) * i / n, y = y0 + (y1 - y0) * i / n;
    for (let dx = -w + 1; dx < w; dx++) for (let dy = -w + 1; dy < w; dy++) px(x + dx, y + dy, col);
  }
}
function circle(cx, cy, r, col) { for (let a = 0; a < 360; a += 2) px(cx + r * Math.cos(a * Math.PI / 180), cy + r * Math.sin(a * Math.PI / 180), col); }

// three panels: plan (x,z) ; south elevation (x,y) ; east elevation (z,y)
const S = 95; // px per metre
const panels = [
  { ox: 20 + 5.8 * S, oy: 20 + 5.8 * S, map: (p) => [p.x, p.z], name: 'plan' },
  { ox: 1150 + 0, oy: 20 + 6.6 * S, map: (p) => [p.x * 0.55, -p.y * 0.95], name: 'south' },
];
// grid
for (const P of [panels[0]]) {
  for (let r = 1; r <= 6; r++) circle(P.ox, P.oy, r * S, [215, 215, 215]);
  line(P.ox - 6 * S, P.oy, P.ox + 6 * S, P.oy, [220, 220, 220]);
  line(P.ox, P.oy - 6 * S, P.ox, P.oy + 6 * S, [220, 220, 220]);
}
// elevation panels drawn smaller
const E1 = { ox: 1200, oy: 640, sx: 52, sy: 52, map: (p) => [p.x, -p.y] };
const E2 = { ox: 1200, oy: 1230, sx: 52, sy: 52, map: (p) => [p.z, -p.y] };
for (const E of [E1, E2]) {
  for (let y = 0; y <= 6; y++) line(E.ox - 5.5 * E.sx, E.oy - y * E.sy, E.ox + 5.5 * E.sx, E.oy - y * E.sy, [225, 225, 225]);
  line(E.ox, E.oy, E.ox, E.oy - 6.5 * E.sy, [220, 220, 220]);
}
for (const t of m.world.tracks) {
  const col = hex((BRANCHES[t.branch] || BRANCHES.top).color);
  for (let i = 0; i + 1 < t.n; i += 2) {
    const a = { x: t.P[3 * i], y: t.P[3 * i + 1], z: t.P[3 * i + 2] };
    const j = Math.min(t.n - 1, i + 2);
    const b = { x: t.P[3 * j], y: t.P[3 * j + 1], z: t.P[3 * j + 2] };
    const P = panels[0];
    line(P.ox + a.x * S, P.oy + a.z * S, P.ox + b.x * S, P.oy + b.z * S, col, 2);
    for (const E of [E1, E2]) {
      const [ax, ay] = E.map(a), [bx, by] = E.map(b);
      line(E.ox + ax * E.sx, E.oy + ay * E.sy, E.ox + bx * E.sx, E.oy + by * E.sy, col, 1);
    }
  }
}
// devices
const P = panels[0];
for (const d of m.world.devices) {
  if (d.kind === 'funnel') { circle(P.ox + d.cx * S, P.oy + d.cz * S, d.rOut * S, [0, 0, 0]); circle(P.ox + d.cx * S, P.oy + d.cz * S, 3, [0, 0, 0]); }
  if (d.kind === 'wheel') { line(P.ox + (d.cx - d.Rw * Math.abs(d.e1.x)) * S, P.oy + (d.cz - d.Rw * Math.abs(d.e1.z)) * S, P.ox + (d.cx + d.Rw * Math.abs(d.e1.x)) * S, P.oy + (d.cz + d.Rw * Math.abs(d.e1.z)) * S, [0, 0, 0], 3); }
  if (d.kind === 'lift') { circle(P.ox + d.lineX * S, P.oy + d.lineZ * S, 6, [80, 0, 120]); }
}
for (const c of m.world.colliders) {
  const b = c.aabb; const col = [60, 60, 60];
  line(P.ox + b[0] * S, P.oy + b[2] * S, P.ox + b[3] * S, P.oy + b[2] * S, col);
  line(P.ox + b[0] * S, P.oy + b[5] * S, P.ox + b[3] * S, P.oy + b[5] * S, col);
  for (const E of [E1, E2]) {
    const lo = E.map({ x: b[0], y: b[1], z: b[2] }), hi = E.map({ x: b[3], y: b[4], z: b[5] });
    line(E.ox + lo[0] * E.sx, E.oy + lo[1] * E.sy, E.ox + hi[0] * E.sx, E.oy + lo[1] * E.sy, col);
  }
}

// --- clearance check between different tracks
const cell = 0.12;
const grid = new Map();
for (const t of m.world.tracks) for (let i = 0; i < t.n; i += 3) {
  const x = t.P[3 * i], y = t.P[3 * i + 1], z = t.P[3 * i + 2];
  const k = `${Math.floor(x / cell)},${Math.floor(y / cell)},${Math.floor(z / cell)}`;
  (grid.get(k) || grid.set(k, []).get(k)).push([t, i]);
}
const linked = (a, b) => a === b || a.next?.track === b || b.next?.track === a || a.prev?.track === b || b.prev?.track === a;
const ends = (t) => [t.start, t.end];
const d3 = (p, q) => Math.hypot(p.x - q.x, p.y - q.y, p.z - q.z);
function sharedEnd(a, b, at) {
  for (const p of ends(a)) for (const q of ends(b)) if (d3(p, q) < 0.03 && d3(p, at) < 0.45) return true;
  return false;
}
const clash = new Map();
for (const t of m.world.tracks) for (let i = 0; i < t.n; i += 3) {
  const x = t.P[3 * i], y = t.P[3 * i + 1], z = t.P[3 * i + 2];
  const ci = Math.floor(x / cell), cj = Math.floor(y / cell), ck = Math.floor(z / cell);
  for (let a = ci - 1; a <= ci + 1; a++) for (let b = cj - 1; b <= cj + 1; b++) for (let c = ck - 1; c <= ck + 1; c++) {
    const arr = grid.get(`${a},${b},${c}`); if (!arr) continue;
    for (const [u, j] of arr) {
      if (u.id <= t.id) continue;
      if (linked(t, u)) continue;
      const d = Math.hypot(u.P[3 * j] - x, u.P[3 * j + 1] - y, u.P[3 * j + 2] - z);
      // shared-origin tracks (flip-flop outputs) start together: ignore their first 30 cm
      if (i * t.ds < 0.35 && j * u.ds < 0.35 && t.prev?.track === u.prev?.track) continue;
      if (sharedEnd(t, u, { x, y, z })) continue;
      if (d < 0.1) {
        const key = `${t.name}~${u.name}`;
        const c0 = clash.get(key);
        if (!c0 || d < c0.d) clash.set(key, { d, at: `(${x.toFixed(2)},${y.toFixed(2)},${z.toFixed(2)})`, s1: (i * t.ds).toFixed(2), s2: (j * u.ds).toFixed(2) });
        px(P.ox + x * S, P.oy + z * S, [255, 0, 0]);
        line(P.ox + x * S - 4, P.oy + z * S - 4, P.ox + x * S + 4, P.oy + z * S + 4, [255, 0, 0], 2);
      }
    }
  }
}
console.log('clearance < 10 cm:');
for (const [k, v] of clash) console.log(`  ${k}: ${(v.d * 100).toFixed(1)} cm at ${v.at} s=${v.s1}/${v.s2}`);
if (m.warnings.length) console.log('warnings:\n  ' + m.warnings.join('\n  '));

// PNG encode
function crc32(buf) { let c, crc = 0xffffffff; for (let n = 0; n < buf.length; n++) { c = (crc ^ buf[n]) & 0xff; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; crc = (crc >>> 8) ^ c; } return (crc ^ 0xffffffff) >>> 0; }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length);
  const td = Buffer.concat([Buffer.from(type), data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td));
  return Buffer.concat([len, td, crc]);
}
const raw = Buffer.alloc((W * 3 + 1) * H);
for (let y = 0; y < H; y++) { raw[y * (W * 3 + 1)] = 0; Buffer.from(img.buffer, y * W * 3, W * 3).copy(raw, y * (W * 3 + 1) + 1); }
const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(W, 0); ihdr.writeUInt32BE(H, 4); ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
writeFileSync(out, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]));
console.log('wrote', out);
