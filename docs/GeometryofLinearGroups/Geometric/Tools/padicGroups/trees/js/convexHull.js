/**
 * The convex hull of the orbit in the drawn tree: the smallest subtree
 * containing every orbit vertex. In a rooted tree it is the set of vertices
 * below the lowest common ancestor of the orbit whose subtrees meet the orbit.
 */
export function computeConvexHull(orbitIds, treeRoot) {
    const vertices = new Set(), edges = new Set();
    if (!orbitIds || orbitIds.size === 0) return { vertices, edges };
    const count = new Map();
    let total = 0;
    treeRoot.eachAfter((node) => {
        let c = orbitIds.has(node.data.id) ? 1 : 0;
        if (c) total++;
        if (node.children) for (const ch of node.children) c += count.get(ch);
        count.set(node, c);
    });
    if (!total) return { vertices, edges };
    // the lowest common ancestor: descend while one child holds the whole orbit
    let lca = treeRoot;
    for (;;) {
        if (orbitIds.has(lca.data.id) || !lca.children) break;
        const full = lca.children.find((ch) => count.get(ch) === total);
        if (!full) break;
        lca = full;
    }
    lca.each((node) => {
        if (count.get(node) > 0) {
            vertices.add(node.data.id);
            if (node !== lca) edges.add(`${node.parent.data.id}->${node.data.id}`);
        }
    });
    return { vertices, edges };
}
