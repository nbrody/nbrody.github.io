/**
 * D3 drawing of the finite piece of the tree produced by treeGeneration.js.
 * Levels k increase downward (towards the ends in K_𝔭); the stub at the top
 * points to the end ∞.
 */
import { computeConvexHull } from './convexHull.js';
import { computeVoronoiCell } from './voronoiCell.js';

const BASE_Y = 120;           // first level gap
const SHRINK_Y = 0.82;        // level gaps shrink with depth
const VERTEX_SHRINK = 0.88;   // and so do vertices
const vertexScale = (depth) => Math.pow(VERTEX_SHRINK, depth);
const depthToY = (depth) => { let s = 0, step = BASE_Y; for (let i = 0; i < depth; i++) { s += step; step *= SHRINK_Y; } return s; };

const BASE_R = { base: 8, image: 8, orbit: 6.5, hull: 6, plain: 5 };
const MIN_R = { base: 5, image: 5, orbit: 3, hull: 1.8, plain: 0.9 };
const COLORS = {
    base: ['#1d4ed8', '#2563eb'], image: ['#059669', '#34d399'], orbit: ['#10b981', '#34d399'],
    hull: ['#93c5fd', '#bfdbfe'], plain: ['#1f2937', '#6366f1'],
};

let zoomBehavior = null;
let lastTransform = null;
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
    const ty = A.y0 - s * bounds.y0 + Math.max(0, ((A.y1 - A.y0) - s * bh) / 3);
    const t = d3.zoomIdentity.translate(tx, ty).scale(s);
    if (animate) svg.transition().duration(600).call(zoomBehavior.transform, t);
    else svg.call(zoomBehavior.transform, t);
}

/**
 * opts: { tree (from generateTree), place, baseId, imageId, orbitIds (Set),
 *         selectedId, onVertexClick(vt, node), refit }
 */
export function drawTree(opts) {
    const { tree, place, baseId, imageId, orbitIds, onVertexClick } = opts;
    const svg = d3.select('#tree-vis');
    svg.selectAll('*').remove();
    const container = document.getElementById('container');
    svg.attr('width', container.clientWidth).attr('height', container.clientHeight);
    const g = svg.append('g');

    const root = d3.hierarchy(tree.root, (d) => d.children);
    d3.tree().nodeSize([1, 1]).separation((a, b) => (a.parent === b.parent ? 1 : 1.5))(root);

    // Fit the width and the height separately (a tree is far wider than tall);
    // the zoom then scales uniformly from there.
    const A = availableRect();
    let ux0 = Infinity, ux1 = -Infinity;
    root.each((d) => { ux0 = Math.min(ux0, d.x); ux1 = Math.max(ux1, d.x); });
    const sx = Math.max(1.2, Math.min(22, (A.x1 - A.x0 - 60) / Math.max(ux1 - ux0, 1)));
    const yNatural = depthToY(root.height) + BASE_Y * 0.7;
    const sy = Math.max(0.3, Math.min(1, (A.y1 - A.y0) / yNatural));
    const dotScale = Math.max(0.35, Math.min(1, sx / 9));
    root.each((d) => { d.x = (d.x - ux0) * sx; });
    const Y = (d) => depthToY(d.depth) * sy;
    const R = (d) => vertexScale(d.depth) * dotScale;

    const { vertices: hullVertices, edges: hullEdges } = computeConvexHull(orbitIds, root);
    const voronoi = computeVoronoiCell(orbitIds, baseId, root);

    // bounds and level labels
    let x0 = Infinity, x1 = -Infinity;
    root.each((d) => { x0 = Math.min(x0, d.x); x1 = Math.max(x1, d.x); });
    const yMax = Y({ depth: root.height });
    const levels = [];
    for (let i = 0; i <= root.height; i++) levels.push([tree.root.k + i, depthToY(i) * sy]);
    const labelEvery = sy < 0.55 ? 2 : 1;
    g.selectAll('.k-label').data(levels.filter((_, i) => i % labelEvery === 0)).enter().append('text')
        .attr('class', 'k-label').attr('x', x0 - 26).attr('y', (d) => d[1]).attr('dy', '.35em')
        .attr('text-anchor', 'end')
        .style('font-size', (d) => `${Math.max(9, 13 * Math.pow(0.95, d[0] - tree.root.k))}px`)
        .text((d) => `k=${d[0]}`);

    // stub to the end ∞ above the root
    const stub = BASE_Y * 0.8 * sy / Math.SQRT2;
    g.append('line').attr('class', 'top-stub')
        .attr('x1', root.x).attr('y1', 0).attr('x2', root.x + stub).attr('y2', -stub);
    g.append('text').attr('class', 'end-label').attr('x', root.x + stub + 4).attr('y', -stub - 4).text('∞');

    // edges
    const links = root.links();
    const key = (l) => `${l.source.data.id}->${l.target.data.id}`;
    if (opts.rationalSubtree) {
        const rat = (d) => place.isRational(d.data.vt);
        g.selectAll('.rational-edge').data(links.filter((l) => rat(l.source) && rat(l.target))).enter().append('line')
            .attr('class', 'rational-edge')
            .attr('x1', (d) => d.source.x).attr('y1', (d) => Y(d.source))
            .attr('x2', (d) => d.target.x).attr('y2', (d) => Y(d.target));
        g.append('line').attr('class', 'rational-edge')
            .attr('x1', root.x).attr('y1', 0).attr('x2', root.x + stub).attr('y2', -stub);
    }
    g.selectAll('.link').data(links).enter().append('line')
        .attr('class', (d) => (hullEdges.has(key(d)) ? 'link hull' : 'link'))
        .attr('x1', (d) => d.source.x).attr('y1', (d) => Y(d.source))
        .attr('x2', (d) => d.target.x).attr('y2', (d) => Y(d.target));

    // Voronoi cell of the base vertex
    const cellSegs = [];
    for (const l of links) {
        const k = key(l);
        const sx = l.source.x, sy = Y(l.source), tx = l.target.x, ty = Y(l.target);
        if (voronoi.fullEdges.has(k)) cellSegs.push({ x1: sx, y1: sy, x2: tx, y2: ty, full: true });
        else if (voronoi.partialEdges.has(k)) {
            const { fromChild, t } = voronoi.partialEdges.get(k);
            if (fromChild) cellSegs.push({ x1: tx, y1: ty, x2: tx + (sx - tx) * t, y2: ty + (sy - ty) * t, full: t >= 1 });
            else cellSegs.push({ x1: sx, y1: sy, x2: sx + (tx - sx) * t, y2: sy + (ty - sy) * t, full: t >= 1 });
        }
    }
    g.selectAll('.voronoi-edge').data(cellSegs).enter().append('line')
        .attr('class', (d) => (d.full ? 'voronoi-edge full' : 'voronoi-edge half'))
        .attr('x1', (d) => d.x1).attr('y1', (d) => d.y1).attr('x2', (d) => d.x2).attr('y2', (d) => d.y2);

    // the link of the selected vertex, labelled by P¹(F_q)
    const linkLayer = g.append('g').attr('class', 'link-layer');

    // vertices
    const node = g.selectAll('.node').data(root.descendants()).enter().append('g')
        .attr('class', 'node').attr('transform', (d) => `translate(${d.x},${Y(d)})`);
    const kind = (id) => (id === baseId ? 'base' : id === imageId ? 'image' : orbitIds.has(id) ? 'orbit' : hullVertices.has(id) ? 'hull' : 'plain');
    node.filter((d) => voronoi.vertices.has(d.data.id)).append('circle')
        .attr('class', 'voronoi-halo').attr('r', (d) => 14 * R(d));
    node.append('circle')
        .attr('class', 'vertex')
        .attr('r', (d) => { const t = kind(d.data.id); return Math.max(MIN_R[t], BASE_R[t] * R(d)); })
        .style('fill', (d) => COLORS[kind(d.data.id)][0])
        .style('stroke', (d) => COLORS[kind(d.data.id)][1])
        .style('stroke-width', (d) => { const t = kind(d.data.id); return `${Math.max(MIN_R[t] / 3, ({ base: 3, image: 3, orbit: 2.5, hull: 2, plain: 2 })[t] * R(d))}px`; });
    node.append('title').text((d) => `⌊${place.label(d.data.vt)}⌋${subscript(d.data.k)}`);
    // the standard vertex ⌊0⌋₀
    node.filter((d) => d.data.k === 0 && !d.data.vt.d.length).insert('circle', ':first-child')
        .attr('class', 'origin-ring').attr('r', (d) => 12 * Math.max(R(d), 0.6))
        .style('stroke-width', (d) => `${2 * Math.max(R(d), 0.6)}px`);
    // labels for v and g₁·v
    node.filter((d) => d.data.id === baseId || d.data.id === imageId)
        .append('foreignObject')
        .attr('x', -70).attr('y', (d) => (d.children ? -34 : 10)).attr('width', 140).attr('height', 30)
        .append('xhtml:div').attr('class', 'vertex-label')
        .html((d) => `⌊${escapeHtml(place.label(d.data.vt))}⌋<sub>${d.data.k}</sub>`);

    node.on('click', (event, d) => {
        event.stopPropagation();
        select(d);
        if (onVertexClick) onVertexClick(d.data.vt, d);
    });

    function select(d) {
        g.selectAll('.selection-ring').remove();
        linkLayer.selectAll('*').remove();
        if (!d) return;
        const el = node.filter((n) => n === d);
        el.insert('circle', ':first-child').attr('class', 'selection-ring')
            .attr('r', 12 * Math.max(R(d), 0.6)).style('stroke-width', `${2 * Math.max(R(d), 0.6)}px`);
        if (place.q > 30) return;
        const nbrs = (d.children || []).slice();
        const items = nbrs.map((c) => ({ from: d, to: c, text: place.digitLabel(place.linkPoint(d.data.vt, c.data.vt)) }));
        if (d.parent) items.push({ from: d, to: d.parent, text: '∞' });
        else items.push({ from: d, to: { x: d.x + stub, depth: -1, y: -stub }, text: '∞', stub: true });
        linkLayer.selectAll('text').data(items).enter().append('text')
            .attr('class', 'link-point')
            .attr('x', (it) => { const tx = it.to.x, sx = it.from.x; return sx + (tx - sx) * 0.55; })
            .attr('y', (it) => { const ty = it.stub ? it.to.y : Y(it.to), fy = Y(it.from); return fy + (ty - fy) * 0.55 - 3; })
            .style('font-size', `${Math.max(11, 13 * vertexScale(d.depth))}px`)
            .text((it) => it.text);
    }
    if (opts.selectedId) {
        const d = root.descendants().find((n) => n.data.id === opts.selectedId);
        if (d) select(d);
    }

    zoomBehavior = d3.zoom().scaleExtent([0.02, 8]).on('zoom', (ev) => {
        g.attr('transform', ev.transform);
        lastTransform = ev.transform;
        if (ev.sourceEvent) userMoved = true;
    });
    svg.call(zoomBehavior).on('dblclick.zoom', null);

    const drawn = { svg, bounds: { x0: x0 - 60, x1: x1 + 30, y0: -stub - 20, y1: yMax + 30 } };
    lastDrawn = drawn;
    if (opts.refit || !userMoved || !lastTransform) { userMoved = false; fitToView(drawn, false); }
    else svg.call(zoomBehavior.transform, lastTransform);
    return { root, hullVertices, voronoi };
}

const SUB = { '-': '₋', 0: '₀', 1: '₁', 2: '₂', 3: '₃', 4: '₄', 5: '₅', 6: '₆', 7: '₇', 8: '₈', 9: '₉' };
const subscript = (n) => String(n).split('').map((c) => SUB[c] ?? c).join('');
const escapeHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
