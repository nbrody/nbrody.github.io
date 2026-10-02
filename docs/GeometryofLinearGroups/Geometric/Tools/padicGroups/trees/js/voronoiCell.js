/**
 * The Dirichlet (Voronoi) cell of the base vertex v₀ with respect to the
 * computed orbit: the points of the drawn tree strictly closer to v₀ than to
 * any other orbit vertex. The drawn tree is a subtree, hence convex, so the
 * distances measured inside it are the true tree distances.
 *
 * Vertices are in or out; an edge from a vertex u in the cell to a vertex w
 * outside it is in the cell up to the equidistant point, at fraction
 * (d(u, other) − d(u, v₀)) / 2 ∈ {½, 1} of the way from u.
 */
export function computeVoronoiCell(orbitIds, baseId, treeRoot) {
    const vertices = new Set(), fullEdges = new Set(), partialEdges = new Map();
    if (!orbitIds || !orbitIds.has(baseId)) return { vertices, fullEdges, partialEdges };
    const nodes = treeRoot.descendants();
    const adj = new Map(nodes.map((n) => [n, []]));
    for (const n of nodes) if (n.parent) { adj.get(n).push(n.parent); adj.get(n.parent).push(n); }
    const bfs = (sources) => {
        const dist = new Map();
        let frontier = sources;
        for (const s of sources) dist.set(s, 0);
        for (let d = 1; frontier.length; d++) {
            const next = [];
            for (const u of frontier) for (const w of adj.get(u)) if (!dist.has(w)) { dist.set(w, d); next.push(w); }
            frontier = next;
        }
        return dist;
    };
    const base = nodes.find((n) => n.data.id === baseId);
    const others = nodes.filter((n) => orbitIds.has(n.data.id) && n.data.id !== baseId);
    if (!base) return { vertices, fullEdges, partialEdges };
    const d0 = bfs([base]);
    const d1 = others.length ? bfs(others) : new Map();
    const inCell = (n) => d0.get(n) < (d1.has(n) ? d1.get(n) : Infinity);
    for (const n of nodes) {
        const a = inCell(n);
        if (a) vertices.add(n.data.id);
        if (!n.parent) continue;
        const b = inCell(n.parent);
        const key = `${n.parent.data.id}->${n.data.id}`;
        if (a && b) fullEdges.add(key);
        else if (a !== b) {
            const u = a ? n : n.parent;               // the endpoint inside the cell
            const t = Math.min(1, ((d1.get(u) ?? Infinity) - d0.get(u)) / 2);
            partialEdges.set(key, { fromChild: a, t });
        }
    }
    return { vertices, fullEdges, partialEdges };
}
