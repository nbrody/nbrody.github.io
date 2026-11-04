// diagram.js — SVG for the Coxeter diagram of P and for graphs of groups.

const NS = 'http://www.w3.org/2000/svg';
const esc = s => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;');

/** Deterministic force layout: springs on the drawn edges, repulsion between all nodes. */
function layout(k, edges, W, H) {
    const pos = Array.from({ length: k }, (_, i) => {
        const a = 2 * Math.PI * i / k - Math.PI / 2;
        return [Math.cos(a), Math.sin(a)];
    });
    if (k <= 1) return [[W / 2, H / 2]];
    for (let it = 0; it < 600; it++) {
        const F = pos.map(() => [0, 0]);
        for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) {
            const dx = pos[i][0] - pos[j][0], dy = pos[i][1] - pos[j][1];
            const d2 = dx * dx + dy * dy + 1e-4, f = 0.02 / d2;
            F[i][0] += f * dx; F[i][1] += f * dy; F[j][0] -= f * dx; F[j][1] -= f * dy;
        }
        for (const [i, j] of edges) {
            const dx = pos[i][0] - pos[j][0], dy = pos[i][1] - pos[j][1];
            const d = Math.hypot(dx, dy) + 1e-9, f = 0.08 * (d - 0.55);
            F[i][0] -= f * dx / d; F[i][1] -= f * dy / d; F[j][0] += f * dx / d; F[j][1] += f * dy / d;
        }
        const step = 0.6 * (1 - it / 700);
        for (let i = 0; i < k; i++) { pos[i][0] += step * F[i][0]; pos[i][1] += step * F[i][1]; }
    }
    // principal axis horizontal, then fit
    const cx = pos.reduce((s, p) => s + p[0], 0) / k, cy = pos.reduce((s, p) => s + p[1], 0) / k;
    let sxx = 0, sxy = 0, syy = 0;
    for (const p of pos) { const x = p[0] - cx, y = p[1] - cy; sxx += x * x; sxy += x * y; syy += y * y; }
    const th = 0.5 * Math.atan2(2 * sxy, sxx - syy);
    const rot = pos.map(p => { const x = p[0] - cx, y = p[1] - cy; return [x * Math.cos(th) + y * Math.sin(th), -x * Math.sin(th) + y * Math.cos(th)]; });
    const xs = rot.map(p => p[0]), ys = rot.map(p => p[1]);
    const [x0, x1, y0, y1] = [Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys)];
    const pad = 26;
    const s = Math.min((W - 2 * pad) / Math.max(x1 - x0, 1e-6), (H - 2 * pad) / Math.max(y1 - y0, 1e-6), 150);
    const ox = W / 2 - s * (x0 + x1) / 2, oy = H / 2 - s * (y0 + y1) / 2;
    const out = rot.map(p => [ox + s * p[0], oy + s * p[1]]);
    // crop the empty band above and below (a linear diagram is one row)
    const used = s * (y1 - y0) + 2 * pad + 12;
    out.height = Math.min(H, Math.max(70, used));
    const shift = (H - out.height) / 2;
    for (const p of out) p[1] -= shift;
    return out;
}

/**
 * Coxeter diagram: m = 3 one line, 4 double, 6 triple, ∞ thick, ultraparallel dashed.
 * @param P     { k, coxM, label, roots, norms }
 * @param opts  { highlight: wall index, cls: [wall indices], width, height, onHover }
 */
export function coxeterSVG(P, opts = {}) {
    const k = P.k;
    const W = opts.width || 420, H = opts.height || Math.max(150, Math.min(260, 60 + 26 * k));
    const edges = [];
    for (let i = 0; i < k; i++) for (let j = i + 1; j < k; j++) if (P.coxM[i][j] !== 2) edges.push([i, j]);
    const pos = layout(k, edges, W, H);
    const Hc = pos.height || H;
    const parts = [];
    for (const [i, j] of edges) {
        const m = P.coxM[i][j];
        const [x1, y1] = pos[i], [x2, y2] = pos[j];
        const dx = x2 - x1, dy = y2 - y1, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
        const line = (o, cls) => `<line x1="${x1 + o * nx}" y1="${y1 + o * ny}" x2="${x2 + o * nx}" y2="${y2 + o * ny}" class="${cls}"/>`;
        if (m === 3) parts.push(line(0, 'e'));
        else if (m === 4) parts.push(line(-2.2, 'e'), line(2.2, 'e'));
        else if (m === 6) parts.push(line(-3.4, 'e'), line(0, 'e'), line(3.4, 'e'));
        else if (m === Infinity) parts.push(line(0, 'e inf'));
        else if (m === -1) parts.push(line(0, 'e ultra'));
        else parts.push(line(0, 'e'), `<text x="${(x1 + x2) / 2 + 6 * nx}" y="${(y1 + y2) / 2 + 6 * ny}" class="lbl">${m}</text>`);
    }
    const cls = new Set(opts.cls || []);
    for (let i = 0; i < k; i++) {
        const [x, y] = pos[i];
        const c = i === opts.highlight ? 'n hyp' : cls.has(i) ? 'n cls' : 'n';
        const tip = `wall ${i + 1}: e = (${P.roots[i].join(', ')}), f(e) = ${P.norms[i]}`;
        parts.push(`<g class="node" data-wall="${i}"><circle cx="${x}" cy="${y}" r="7.5" class="${c}"><title>${esc(tip)}</title></circle>` +
            `<text x="${x}" y="${y - 12}" class="idx">${i + 1}</text></g>`);
    }
    return `<svg xmlns="${NS}" class="coxeter" viewBox="0 0 ${W} ${Hc}" width="100%" style="max-width:${W}px">${parts.join('')}</svg>`;
}

/**
 * Graph of groups of the splitting.
 * @param pieces [{label, sub}]    vertices
 * @param edges  [{plus, minus, label}]
 */
export function graphSVG(pieces, edges, opts = {}) {
    const W = opts.width || 420, H = opts.height || 170;
    const k = pieces.length;
    const pos = k === 1 ? [[W / 2, H / 2 + 12]] : k === 2 ? [[W * 0.27, H / 2], [W * 0.73, H / 2]]
        : pieces.map((_, i) => { const a = 2 * Math.PI * i / k - Math.PI / 2; return [W / 2 + 0.33 * W * Math.cos(a), H / 2 + 0.36 * H * Math.sin(a)]; });
    const parts = [];
    // multi-edges between the same pair fan out as arcs
    const seen = new Map();
    for (const e of edges) {
        const key = e.plus <= e.minus ? `${e.plus}-${e.minus}` : `${e.minus}-${e.plus}`;
        const t = seen.get(key) || 0; seen.set(key, t + 1);
        const [x1, y1] = pos[e.plus], [x2, y2] = pos[e.minus];
        if (e.plus === e.minus) {
            const r = 26 + 13 * t;
            parts.push(`<path d="M ${x1 - 12} ${y1 - 18} C ${x1 - r * 1.6} ${y1 - r * 2.6}, ${x1 + r * 1.6} ${y1 - r * 2.6}, ${x1 + 12} ${y1 - 18}" class="ge"/>`);
            parts.push(`<text x="${x1}" y="${y1 - r * 1.95 - 6}" class="gl">${e.label}</text>`);
        } else {
            const off = (t % 2 ? 1 : -1) * Math.ceil(t / 2) * 22;
            const mx = (x1 + x2) / 2, my = (y1 + y2) / 2 + off;
            parts.push(`<path d="M ${x1} ${y1} Q ${mx} ${my + off} ${x2} ${y2}" class="ge"/>`);
            parts.push(`<text x="${mx}" y="${my + off / 2 - 7}" class="gl">${e.label}</text>`);
        }
    }
    pieces.forEach((p, i) => {
        const [x, y] = pos[i];
        parts.push(`<circle cx="${x}" cy="${y}" r="17" class="gv" style="fill:${p.color}"/>`);
        parts.push(`<text x="${x}" y="${y + 5}" class="gvl">${p.label}</text>`);
        if (p.sub) parts.push(`<text x="${x}" y="${y + 36}" class="gs">${esc(p.sub)}</text>`);
    });
    return `<svg xmlns="${NS}" class="graph" viewBox="0 0 ${W} ${H}" width="100%" style="max-width:${W}px">${parts.join('')}</svg>`;
}
