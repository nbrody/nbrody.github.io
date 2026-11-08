// Face pairing graph of a 3-manifold triangulation: one node per tetrahedron,
// one edge per glued pair of faces (loops for self-gluings), and a short stub
// for each boundary face. Laid out with a small spring simulation.

export function dualGraphSVG(gluings, opts = {}) {
  const n = gluings.length;
  const accent = opts.accent || '#818cf8';
  const ink = opts.ink || '#16181e';
  const muted = opts.muted || '#5f636c';
  const nodeFill = opts.nodeFill || '#ffffff';
  // gluings[t][k] is face (3 - k) of tet t.
  const edges = [];
  const stubs = [];
  for (let t = 0; t < n; t++) {
    for (let k = 0; k < 4; k++) {
      const g = gluings[t][k];
      const f = 3 - k;
      if (!g) { stubs.push(t); continue; }
      // Count each pair of faces once: keep (t, f) <= (u, f').
      const u = g.tet;
      const fu = [0, 1, 2, 3].find((x) => !g.img.includes(String(x)));
      if (t < u || (t === u && f < fu)) edges.push([t, u]);
    }
  }

  // Spring layout (deterministic start on a circle).
  const P = Array.from({ length: n }, (_, i) => {
    const a = 2 * Math.PI * i / Math.max(n, 1);
    return [Math.cos(a), Math.sin(a)];
  });
  const L = 1.2 / Math.sqrt(Math.max(n, 1)) + 0.25;
  for (let it = 0; it < 600; it++) {
    const F = P.map(() => [0, 0]);
    for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) {
      let dx = P[i][0] - P[j][0], dy = P[i][1] - P[j][1];
      const d2 = dx * dx + dy * dy + 1e-4;
      const k = (L * L) / d2 * 0.05;
      F[i][0] += dx * k; F[i][1] += dy * k; F[j][0] -= dx * k; F[j][1] -= dy * k;
    }
    for (const [a, b] of edges) {
      if (a === b) continue;
      const dx = P[b][0] - P[a][0], dy = P[b][1] - P[a][1];
      const d = Math.hypot(dx, dy) + 1e-6;
      const k = (d - L) * 0.08 / d;
      F[a][0] += dx * k; F[a][1] += dy * k; F[b][0] -= dx * k; F[b][1] -= dy * k;
    }
    const cool = 1 - it / 600;
    for (let i = 0; i < n; i++) {
      F[i][0] -= P[i][0] * 0.01; F[i][1] -= P[i][1] * 0.01;
      P[i][0] += Math.max(-0.1, Math.min(0.1, F[i][0])) * cool;
      P[i][1] += Math.max(-0.1, Math.min(0.1, F[i][1])) * cool;
    }
  }
  // Fit to the view box.
  const W = 560, H = 380, pad = 48;
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
  for (const [x, y] of P) { x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
  const s = Math.min((W - 2 * pad) / Math.max(x1 - x0, 1e-6), (H - 2 * pad) / Math.max(y1 - y0, 1e-6));
  const Q = P.map(([x, y]) => [W / 2 + (x - (x0 + x1) / 2) * (n > 1 ? s : 0), H / 2 + (y - (y0 + y1) / 2) * (n > 1 ? s : 0)]);
  const r = n > 30 ? 9 : 14;

  let svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${W} ${H}" role="img" aria-label="Face pairing graph">`;
  // Multi-edges get curved with alternating offsets.
  const seen = new Map();
  for (const [a, b] of edges) {
    const key = a < b ? `${a}-${b}` : `${b}-${a}`;
    const k = seen.get(key) || 0;
    seen.set(key, k + 1);
    if (a === b) {
      const [x, y] = Q[a];
      const ang = -Math.PI / 2 + k * 1.3;
      const cx = x + Math.cos(ang) * r * 1.9, cy = y + Math.sin(ang) * r * 1.9;
      svg += `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${(r * 1.05).toFixed(1)}" fill="none" stroke="${accent}" stroke-width="2.2"/>`;
      continue;
    }
    const [ax, ay] = Q[a], [bx, by] = Q[b];
    const off = (k === 0 ? 0 : (k % 2 ? 1 : -1) * Math.ceil(k / 2)) * 26;
    const mx = (ax + bx) / 2, my = (ay + by) / 2;
    const dx = bx - ax, dy = by - ay, d = Math.hypot(dx, dy) || 1;
    const cx = mx - dy / d * off, cy = my + dx / d * off;
    svg += `<path d="M${ax.toFixed(1)},${ay.toFixed(1)} Q${cx.toFixed(1)},${cy.toFixed(1)} ${bx.toFixed(1)},${by.toFixed(1)}" fill="none" stroke="${accent}" stroke-width="2.2"/>`;
  }
  const stubCount = new Map();
  for (const t of stubs) {
    const k = stubCount.get(t) || 0; stubCount.set(t, k + 1);
    const [x, y] = Q[t];
    const ang = Math.PI / 2 + 0.6 * (k - 0.5);
    svg += `<line x1="${x}" y1="${y}" x2="${(x + Math.cos(ang) * r * 2.4).toFixed(1)}" y2="${(y + Math.sin(ang) * r * 2.4).toFixed(1)}" stroke="${muted}" stroke-width="2" stroke-dasharray="3 3"/>`;
  }
  Q.forEach(([x, y], i) => {
    svg += `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="${r}" fill="${nodeFill}" stroke="${accent}" stroke-width="2.2"/>`;
    if (n <= 60) svg += `<text x="${x.toFixed(1)}" y="${(y + 4.5).toFixed(1)}" text-anchor="middle" font-size="${r > 10 ? 13 : 10}" font-family="Atkinson Hyperlegible, sans-serif" fill="${ink}">${i}</text>`;
  });
  return svg + '</svg>';
}
