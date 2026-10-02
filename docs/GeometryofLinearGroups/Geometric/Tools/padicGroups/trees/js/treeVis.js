/**
 * SVG drawings of the finite piece of the tree produced by treeGeneration.js,
 * in two models (the 3D tower lives in tower.js):
 *
 *   half-plane  levels k increase downward, towards the ends in K_𝔭; the stub
 *               at the top points to the end ∞.
 *   disk        the Poincaré disk centred on the base vertex v: its q+1
 *               neighbours surround it, radius depends only on the distance to
 *               v, edges are hyperbolic geodesics, and the boundary circle is
 *               the space of ends P¹(K_𝔭). Unrooted, with no preferred end.
 */
import { computeConvexHull } from './convexHull.js';
import { computeVoronoiCell } from './voronoiCell.js';

const BASE_Y = 120;           // first level gap
const SHRINK_Y = 0.82;        // level gaps shrink with depth
const VERTEX_SHRINK = 0.88;   // and so do vertices
const vertexScale = (depth) => Math.pow(VERTEX_SHRINK, depth);
const depthToY = (depth) => { let s = 0, step = BASE_Y; for (let i = 0; i < depth; i++) { s += step; step *= SHRINK_Y; } return s; };
const DISK_R = 340;           // pixel radius of the disk
const DISK_RIM = 0.93;        // the farthest vertex lands here, as a fraction of the radius

const BASE_R = { base: 8, image: 8, orbit: 6.5, hull: 6, plain: 5 };
const MIN_R = { base: 5, image: 5, orbit: 3, hull: 1.8, plain: 0.9 };
const COLORS = {
    base: ['#1d4ed8', '#2563eb'], image: ['#059669', '#34d399'], orbit: ['#10b981', '#34d399'],
    hull: ['#93c5fd', '#bfdbfe'], plain: ['#1f2937', '#6366f1'],
};

let zoomBehavior = null;
let lastTransform = null;
let lastModel = null;
let userMoved = false;
let lastDrawn = null;

export function resetZoom() {
    userMoved = false;
    if (lastDrawn) fitToView(lastDrawn, true);
}

function availableRect() {
    const container = document.getElementById('container');
    const W = container.clientWidth, H = container.clientHeight;
    const panel = document.getElementById('control-panel');
    let right = W;
    if (panel && !panel.classList.contains('collapsed')) {
        const r = panel.getBoundingClientRect(), c = container.getBoundingClientRect();
        if (r.left - c.left > W * 0.45) right = r.left - c.left - 12;
    }
    return { x0: 70, y0: 50, x1: Math.max(right, 200), y1: H - 30, W, H };
}

function fitToView(drawn, animate) {
    const { svg, bounds } = drawn;
    const A = availableRect();
    const bw = Math.max(bounds.x1 - bounds.x0, 1), bh = Math.max(bounds.y1 - bounds.y0, 1);
    const s = Math.min((A.x1 - A.x0) / bw, (A.y1 - A.y0) / bh, 2.2);
    const tx = (A.x0 + A.x1) / 2 - s * (bounds.x0 + bounds.x1) / 2;
    const ty = drawn.center
        ? (A.y0 + A.y1) / 2 - s * (bounds.y0 + bounds.y1) / 2
        : A.y0 - s * bounds.y0 + Math.max(0, ((A.y1 - A.y0) - s * bh) / 3);
    const t = d3.zoomIdentity.translate(tx, ty).scale(s);
    if (animate) svg.transition().duration(600).call(zoomBehavior.transform, t);
    else svg.call(zoomBehavior.transform, t);
}

/** The hierarchy with its hull and Dirichlet cell, shared by every model. */
export function analyzeTree(tree, orbitIds, baseId) {
    const root = d3.hierarchy(tree.root, (d) => d.children);
    const hull = computeConvexHull(orbitIds, root);
    const voronoi = computeVoronoiCell(orbitIds, baseId, root);
    return { root, hull, voronoi };
}

// ───────────────────────── layouts ─────────────────────────

/** Rooted at the end ∞: the tidy tree, with the width and height fitted separately. */
function halfPlaneLayout(root) {
    d3.tree().nodeSize([1, 1]).separation((a, b) => (a.parent === b.parent ? 1 : 1.5))(root);
    const A = availableRect();
    let ux0 = Infinity, ux1 = -Infinity;
    root.each((d) => { ux0 = Math.min(ux0, d.x); ux1 = Math.max(ux1, d.x); });
    const sx = Math.max(1.2, Math.min(22, (A.x1 - A.x0 - 60) / Math.max(ux1 - ux0, 1)));
    const yNatural = depthToY(root.height) + BASE_Y * 0.7;
    const sy = Math.max(0.3, Math.min(1, (A.y1 - A.y0) / yNatural));
    const dotScale = Math.max(0.35, Math.min(1, sx / 9));
    const pos = new Map();
    root.each((d) => pos.set(d, { x: (d.x - ux0) * sx, y: depthToY(d.depth) * sy }));
    const straight = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
    return {
        pos,
        scale: (d) => vertexScale(d.depth) * dotScale,
        sy,
        path: (a, b, t = 1) => { const e = straight(a, b, t); return `M${a.x},${a.y}L${e.x},${e.y}`; },
        at: straight,
    };
}

/**
 * The Poincaré disk centred on the base vertex. Each vertex gets an angular
 * wedge, split among its branches in proportion to their numbers of leaves;
 * radius is tanh of half the hyperbolic distance, scaled so the farthest
 * vertex sits at DISK_RIM.
 */
function diskLayout(root, baseId, place) {
    const nodes = root.descendants();
    const adj = new Map(nodes.map((n) => [n, []]));
    for (const n of nodes) if (n.parent) { adj.get(n).push(n.parent); adj.get(n.parent).push(n); }
    const center = nodes.find((n) => n.data.id === baseId) || root;
    // breadth-first from the centre; branches in the order of the link P¹(F_q) (∞ first)
    const kids = new Map(), dist = new Map([[center, 0]]);
    const order = [center];
    for (let i = 0; i < order.length; i++) {
        const u = order[i];
        const next = adj.get(u).filter((w) => !dist.has(w));
        const key = (w) => { const lp = place.linkPoint(u.data.vt, w.data.vt); return lp === Infinity ? -1 : lp; };
        next.sort((a, b) => key(a) - key(b));
        for (const w of next) { dist.set(w, dist.get(u) + 1); order.push(w); }
        kids.set(u, next);
    }
    const leaves = new Map();
    for (let i = order.length - 1; i >= 0; i--) {
        const u = order[i], ks = kids.get(u);
        leaves.set(u, ks.length ? ks.reduce((s, w) => s + leaves.get(w), 0) : 1);
    }
    let maxDist = 0;
    for (const d of dist.values()) maxDist = Math.max(maxDist, d);
    const step = 2 * Math.atanh(DISK_RIM) / Math.max(1, maxDist);
    const radius = (n) => DISK_R * Math.tanh(n * step / 2);
    const pos = new Map();
    const place_ = (u, a0, a1) => {
        const r = radius(dist.get(u)), th = (a0 + a1) / 2;
        pos.set(u, dist.get(u) === 0 ? { x: 0, y: 0 } : { x: r * Math.cos(th), y: r * Math.sin(th) });
        const ks = kids.get(u);
        const total = ks.reduce((s, w) => s + leaves.get(w), 0);
        let a = a0;
        for (const w of ks) {
            const span = (a1 - a0) * leaves.get(w) / total;
            place_(w, a, a + span);
            a += span;
        }
    };
    place_(center, -Math.PI / 2, 3 * Math.PI / 2);
    return {
        pos,
        dist,
        maxDist,
        radius,
        scale: (d) => Math.pow(0.86, dist.get(d) || 0),
        path: geodesicPath,
        at: geodesicPoint,
    };
}

/** The circle through a and b meeting the boundary at right angles, or null for a diameter. */
function orthogonalCircle(a, b) {
    const det = 2 * (a.x * b.y - a.y * b.x);
    if (Math.abs(det) < 1e-9) return null;
    const R2 = DISK_R * DISK_R;
    const ka = a.x * a.x + a.y * a.y + R2, kb = b.x * b.x + b.y * b.y + R2;
    const cx = (ka * b.y - kb * a.y) / det, cy = (kb * a.x - ka * b.x) / det;
    const rr = cx * cx + cy * cy - R2;
    if (rr <= 1e-9) return null;
    return { cx, cy, r: Math.sqrt(rr) };
}
/** The point a fraction t of the way along the geodesic from a to b. */
function geodesicPoint(a, b, t) {
    const c = orthogonalCircle(a, b);
    if (!c) return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
    const ta = Math.atan2(a.y - c.cy, a.x - c.cx);
    let dt = Math.atan2(b.y - c.cy, b.x - c.cx) - ta;
    while (dt > Math.PI) dt -= 2 * Math.PI;
    while (dt < -Math.PI) dt += 2 * Math.PI;
    const th = ta + dt * t;
    return { x: c.cx + c.r * Math.cos(th), y: c.cy + c.r * Math.sin(th) };
}
/** SVG path of the geodesic from a, up to a fraction t of the way to b. */
function geodesicPath(a, b, t = 1) {
    const c = orthogonalCircle(a, b);
    const e = t === 1 ? b : geodesicPoint(a, b, t);
    if (!c) return `M${a.x},${a.y}L${e.x},${e.y}`;
    const cross = (a.x - c.cx) * (b.y - c.cy) - (a.y - c.cy) * (b.x - c.cx);
    return `M${a.x},${a.y}A${c.r},${c.r} 0 0 ${cross > 0 ? 1 : 0} ${e.x},${e.y}`;
}

// ───────────────────────── drawing ─────────────────────────

/**
 * opts: { tree (from generateTree), place, baseId, imageId, orbitIds (Set),
 *         selectedId, onVertexClick(vt), refit, model ('halfplane' | 'disk'),
 *         rationalSubtree }
 */
export function drawTree(opts) {
    const { tree, place, baseId, imageId, orbitIds, onVertexClick } = opts;
    const model = opts.model === 'disk' ? 'disk' : 'halfplane';
    const svg = d3.select('#tree-vis');
    svg.selectAll('*').remove();
    const container = document.getElementById('container');
    svg.attr('width', container.clientWidth).attr('height', container.clientHeight);
    const g = svg.append('g');

    const { root, hull, voronoi } = analyzeTree(tree, orbitIds, baseId);
    const L = model === 'disk' ? diskLayout(root, baseId, place) : halfPlaneLayout(root);
    const P = (d) => L.pos.get(d);
    const R = L.scale;
    const nodes = root.descendants();
    const links = root.links();
    const key = (l) => `${l.source.data.id}->${l.target.data.id}`;

    // ── decorations ──
    let bounds, stub = 0;
    if (model === 'halfplane') {
        let x0 = Infinity, x1 = -Infinity, yMax = 0;
        for (const d of nodes) { const p = P(d); x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); yMax = Math.max(yMax, p.y); }
        const levels = [];
        for (let i = 0; i <= root.height; i++) levels.push([tree.root.k + i, depthToY(i) * L.sy]);
        const every = L.sy < 0.55 ? 2 : 1;
        g.selectAll('.k-label').data(levels.filter((_, i) => i % every === 0)).enter().append('text')
            .attr('class', 'k-label').attr('x', x0 - 26).attr('y', (d) => d[1]).attr('dy', '.35em')
            .attr('text-anchor', 'end')
            .style('font-size', (d) => `${Math.max(9, 13 * Math.pow(0.95, d[0] - tree.root.k))}px`)
            .text((d) => `k=${d[0]}`);
        stub = BASE_Y * 0.8 * L.sy / Math.SQRT2;
        const r0 = P(root);
        g.append('line').attr('class', 'top-stub')
            .attr('x1', r0.x).attr('y1', r0.y).attr('x2', r0.x + stub).attr('y2', r0.y - stub);
        g.append('text').attr('class', 'end-label').attr('x', r0.x + stub + 4).attr('y', r0.y - stub - 4).text('∞');
        bounds = { x0: x0 - 60, x1: x1 + 30, y0: -stub - 20, y1: yMax + 30 };
    } else {
        g.append('circle').attr('class', 'disk-boundary').attr('cx', 0).attr('cy', 0).attr('r', DISK_R);
        for (let n = 1; n <= L.maxDist; n++) {
            g.append('circle').attr('class', 'disk-ring').attr('cx', 0).attr('cy', 0).attr('r', L.radius(n));
        }
        g.append('text').attr('class', 'end-label').attr('x', DISK_R * 0.72).attr('y', -DISK_R * 0.74)
            .text(opts.endsLabel || '∂T');
        bounds = { x0: -DISK_R - 20, x1: DISK_R + 20, y0: -DISK_R - 20, y1: DISK_R + 20 };
    }

    // ── the ℚ_p-subtree ──
    if (opts.rationalSubtree) {
        const rat = (d) => place.isRational(d.data.vt);
        g.selectAll('.rational-edge').data(links.filter((l) => rat(l.source) && rat(l.target))).enter().append('path')
            .attr('class', 'rational-edge').attr('d', (l) => L.path(P(l.source), P(l.target)));
        if (model === 'halfplane') {
            const r0 = P(root);
            g.append('path').attr('class', 'rational-edge').attr('d', `M${r0.x},${r0.y}L${r0.x + stub},${r0.y - stub}`);
        }
    }

    // ── edges ──
    g.selectAll('.link').data(links).enter().append('path')
        .attr('class', (l) => (hull.edges.has(key(l)) ? 'link hull' : 'link'))
        .attr('d', (l) => L.path(P(l.source), P(l.target)));

    // ── the Dirichlet cell of v ──
    const cellSegs = [];
    for (const l of links) {
        const k = key(l);
        if (voronoi.fullEdges.has(k)) cellSegs.push({ d: L.path(P(l.source), P(l.target)), full: true });
        else if (voronoi.partialEdges.has(k)) {
            const { fromChild, t } = voronoi.partialEdges.get(k);
            const [from, to] = fromChild ? [l.target, l.source] : [l.source, l.target];
            cellSegs.push({ d: L.path(P(from), P(to), t), full: t >= 1 });
        }
    }
    g.selectAll('.voronoi-edge').data(cellSegs).enter().append('path')
        .attr('class', (d) => (d.full ? 'voronoi-edge full' : 'voronoi-edge half')).attr('d', (d) => d.d);

    const linkLayer = g.append('g').attr('class', 'link-layer');

    // ── vertices ──
    const node = g.selectAll('.node').data(nodes).enter().append('g')
        .attr('class', 'node').attr('transform', (d) => `translate(${P(d).x},${P(d).y})`);
    const kind = (id) => (id === baseId ? 'base' : id === imageId ? 'image' : orbitIds.has(id) ? 'orbit' : hull.vertices.has(id) ? 'hull' : 'plain');
    node.filter((d) => voronoi.vertices.has(d.data.id)).append('circle')
        .attr('class', 'voronoi-halo').attr('r', (d) => 14 * R(d));
    node.append('circle')
        .attr('class', 'vertex')
        .attr('r', (d) => { const t = kind(d.data.id); return Math.max(MIN_R[t], BASE_R[t] * R(d)); })
        .style('fill', (d) => COLORS[kind(d.data.id)][0])
        .style('stroke', (d) => COLORS[kind(d.data.id)][1])
        .style('stroke-width', (d) => { const t = kind(d.data.id); return `${Math.max(MIN_R[t] / 3, ({ base: 3, image: 3, orbit: 2.5, hull: 2, plain: 2 })[t] * R(d))}px`; });
    node.append('title').text((d) => `⌊${place.label(d.data.vt)}⌋${subscript(d.data.k)}`);
    node.filter((d) => d.data.k === 0 && !d.data.vt.d.length).insert('circle', ':first-child')
        .attr('class', 'origin-ring').attr('r', (d) => 12 * Math.max(R(d), 0.6))
        .style('stroke-width', (d) => `${2 * Math.max(R(d), 0.6)}px`);
    node.filter((d) => d.data.id === baseId || d.data.id === imageId)
        .append('foreignObject')
        .attr('x', -70).attr('y', (d) => (model === 'halfplane' && !d.children ? 10 : -34)).attr('width', 140).attr('height', 30)
        .append('xhtml:div').attr('class', 'vertex-label')
        .html((d) => `⌊${escapeHtml(place.label(d.data.vt))}⌋<sub>${d.data.k}</sub>`);

    node.on('click', (event, d) => {
        event.stopPropagation();
        select(d);
        if (onVertexClick) onVertexClick(d.data.vt);
    });
    if (opts.onVertexDblClick) node.on('dblclick', (event, d) => { event.stopPropagation(); opts.onVertexDblClick(d.data.vt); });

    function select(d) {
        g.selectAll('.selection-ring').remove();
        linkLayer.selectAll('*').remove();
        if (!d) return;
        node.filter((n) => n === d).insert('circle', ':first-child').attr('class', 'selection-ring')
            .attr('r', 12 * Math.max(R(d), 0.6)).style('stroke-width', `${2 * Math.max(R(d), 0.6)}px`);
        if (place.q > 30) return;
        const items = (d.children || []).map((c) => ({ to: P(c), text: place.digitLabel(place.linkPoint(d.data.vt, c.data.vt)) }));
        if (d.parent) items.push({ to: P(d.parent), text: '∞' });
        else if (model === 'halfplane') items.push({ to: { x: P(d).x + stub, y: P(d).y - stub }, text: '∞', straight: true });
        const from = P(d);
        linkLayer.selectAll('text').data(items).enter().append('text')
            .attr('class', 'link-point')
            .each(function (it) {
                const m = it.straight ? { x: from.x + (it.to.x - from.x) * 0.55, y: from.y + (it.to.y - from.y) * 0.55 } : L.at(from, it.to, 0.55);
                d3.select(this).attr('x', m.x).attr('y', m.y - 3);
            })
            .style('font-size', `${Math.max(11, 13 * R(d))}px`)
            .text((it) => it.text);
    }
    if (opts.selectedId) {
        const d = nodes.find((n) => n.data.id === opts.selectedId);
        if (d) select(d);
    }

    zoomBehavior = d3.zoom().scaleExtent([0.02, 12]).on('zoom', (ev) => {
        g.attr('transform', ev.transform);
        lastTransform = ev.transform;
        if (ev.sourceEvent) userMoved = true;
    });
    svg.call(zoomBehavior).on('dblclick.zoom', null);

    const drawn = { svg, bounds, center: model === 'disk' };
    lastDrawn = drawn;
    if (opts.refit || !userMoved || !lastTransform || lastModel !== model) { userMoved = false; fitToView(drawn, false); }
    else svg.call(zoomBehavior.transform, lastTransform);
    lastModel = model;
    return { root, hullVertices: hull.vertices, voronoi };
}

const SUB = { '-': '₋', 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' };
const subscript = (n) => String(n).split('').map((c) => SUB[c] ?? c).join('');
const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
