// Plan and elevation of the layout as an SVG (no dependencies):
//   node tests/plot.mjs out.svg [x0 z0 x1 z1]
// Tracks are coloured by route; flumes are drawn thick, tunnels dashed.
import { writeFileSync } from 'node:fs';
import { buildMachine, BRANCHES, PALM, CASTLE } from '../js/sim/layout.js';

const out = process.argv[2] || 'layout.svg';
const [x0, z0, x1, z1] = process.argv.length > 6 ? process.argv.slice(3, 7).map(Number) : [-6, -6.5, 6, 6];
const m = buildMachine({ balls: 0 });
const S = 90, W = (x1 - x0) * S, H = (z1 - z0) * S;
const P = (x, z) => `${((x - x0) * S).toFixed(1)},${((z - z0) * S).toFixed(1)}`;
const col = (t) => (BRANCHES[t.branch] || BRANCHES.top).color;
let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H + 520}" font-family="sans-serif" font-size="11">`;
svg += `<rect width="100%" height="100%" fill="#fbf8f0"/>`;
for (let x = Math.ceil(x0); x <= x1; x++) svg += `<line x1="${(x - x0) * S}" y1="0" x2="${(x - x0) * S}" y2="${H}" stroke="#e6e0d0"/><text x="${(x - x0) * S + 2}" y="12" fill="#aaa">${x}</text>`;
for (let z = Math.ceil(z0); z <= z1; z++) svg += `<line x1="0" y1="${(z - z0) * S}" x2="${W}" y2="${(z - z0) * S}" stroke="#e6e0d0"/><text x="2" y="${(z - z0) * S - 2}" fill="#aaa">${z}</text>`;
const circ = (x, z, r, stroke, fill = 'none', dash = '') => `<circle cx="${(x - x0) * S}" cy="${(z - z0) * S}" r="${r * S}" stroke="${stroke}" fill="${fill}" ${dash ? `stroke-dasharray="${dash}"` : ''}/>`;
svg += circ(PALM.cx, PALM.cz, PALM.trunkR, '#6b4b2a', '#e9d6b0');
const C = CASTLE;
svg += circ(C.cx, C.cz, C.plinthR, '#c9a86a', '#f2e6c8') + circ(C.cx, C.cz, C.wallR, '#b98a4a') + circ(C.cx, C.cz, C.keepR, '#b98a4a', '#ead7ae');
for (const a of [45, 135, 225, 315]) svg += circ(C.cx + C.wallR * Math.cos(a * Math.PI / 180), C.cz - C.wallR * Math.sin(a * Math.PI / 180), C.towerR, '#b98a4a', '#ead7ae');
const d = m.devices;
for (const f of [d.hopperM, d.hopperM2, d.funnel]) svg += circ(f.cx, f.cz, f.rOut, '#777');
svg += circ(d.pool.cx, d.pool.cz, d.pool.rOut, '#119fc4', '#cdeef6');
svg += circ(d.waterSlide.palm.x, d.waterSlide.palm.z, 0.18, '#6b4b2a', '#e9d6b0');
for (const c of m.columns) svg += circ(c.x, c.z, c.r, '#555');
for (const t of m.world.tracks) {
  const pts = [];
  for (let i = 0; i < t.n; i += 4) pts.push(P(t.P[3 * i], t.P[3 * i + 2]));
  pts.push(P(t.end.x, t.end.z));
  const w = t.kind === 'flume' ? 4 : t.kind === 'trough' ? 3 : 1.6;
  svg += `<polyline points="${pts.join(' ')}" fill="none" stroke="${col(t)}" stroke-width="${w}" ${t.meta.tunnel ? 'stroke-dasharray="6 3"' : ''} opacity="0.85"/>`;
  const mid = t.pointAt(t.L / 2);
  svg += `<text x="${(mid.x - x0) * S + 3}" y="${(mid.z - z0) * S - 3}" fill="${col(t)}" font-size="9">${t.name}</text>`;
}
// elevation: y against arc of x (south view)
const eo = H + 500, ES = 90;
svg += `<line x1="0" y1="${eo}" x2="${W}" y2="${eo}" stroke="#999"/>`;
for (let y = 1; y <= 6; y++) svg += `<line x1="0" y1="${eo - y * ES}" x2="${W}" y2="${eo - y * ES}" stroke="#eee"/><text x="2" y="${eo - y * ES - 2}" fill="#aaa">${y}</text>`;
for (const t of m.world.tracks) {
  const pts = [];
  for (let i = 0; i < t.n; i += 4) pts.push(`${((t.P[3 * i] - x0) * S).toFixed(1)},${(eo - t.P[3 * i + 1] * ES).toFixed(1)}`);
  svg += `<polyline points="${pts.join(' ')}" fill="none" stroke="${col(t)}" stroke-width="${t.kind === 'flume' ? 3 : 1.4}" opacity="0.8"/>`;
}
svg += '</svg>';
writeFileSync(out, svg);
console.log(`wrote ${out}`);
