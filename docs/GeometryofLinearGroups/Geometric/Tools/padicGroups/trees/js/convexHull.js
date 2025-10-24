import { getNodeID } from './pAdic.js';

/**
 * Compute the convex hull of orbit vertices in the tree
 * In a tree, this is the minimal subtree containing all orbit vertices
 */
export function computeConvexHull(orbitMap, treeRoot) {
    if (!orbitMap || orbitMap.size === 0) return { vertices: new Set(), edges: new Set() };

    const orbitVertices = new Set();
    for (const [id, _] of orbitMap) {
        orbitVertices.add(id);
    }

    // Find all nodes in the tree that correspond to orbit vertices
    const orbitNodes = [];
    function findOrbitNodes(node) {
        if (orbitVertices.has(node.data.id)) {
            orbitNodes.push(node);
        }
        if (node.children) {
            node.children.forEach(findOrbitNodes);
        }
    }
    findOrbitNodes(treeRoot);

    if (orbitNodes.length === 0) return { vertices: new Set(), edges: new Set() };
    if (orbitNodes.length === 1) {
        return {
            vertices: new Set([orbitNodes[0].data.id]),
            edges: new Set()
        };
    }

    // Compute convex hull vertices and edges
    const hullVertices = new Set();
    const hullEdges = new Set();

    // For each pair of orbit vertices, add all vertices on the path between them
    for (let i = 0; i < orbitNodes.length; i++) {
        for (let j = i + 1; j < orbitNodes.length; j++) {
            const path = getPath(orbitNodes[i], orbitNodes[j]);

            // Add all vertices in path
            for (const node of path) {
                hullVertices.add(node.data.id);
            }

            // Add all edges in path
            for (let k = 0; k < path.length - 1; k++) {
                const edge1 = `${path[k].data.id}->${path[k + 1].data.id}`;
                const edge2 = `${path[k + 1].data.id}->${path[k].data.id}`;
                hullEdges.add(edge1);
                hullEdges.add(edge2);
            }
        }
    }

    return { vertices: hullVertices, edges: hullEdges };
}

/**
 * Get the path between two nodes in the tree
 */
function getPath(node1, node2) {
    // Collect ancestors of both nodes
    const ancestors1 = collectAncestors(node1);
    const ancestors2 = collectAncestors(node2);

    // Find LCA (lowest common ancestor)
    let lca = node2;
    while (lca && !ancestors1.has(lca)) {
        lca = lca.parent;
    }

    if (!lca) return [];

    // Build path from node1 to LCA to node2
    const path = [];

    // Path from node1 to LCA
    let curr = node1;
    while (curr !== lca) {
        path.push(curr);
        curr = curr.parent;
    }
    path.push(lca);

    // Path from LCA to node2 (reversed)
    const path2 = [];
    curr = node2;
    while (curr !== lca) {
        path2.push(curr);
        curr = curr.parent;
    }
    path2.reverse();

    return [...path, ...path2];
}

/**
 * Collect all ancestors of a node (including the node itself)
 */
function collectAncestors(node) {
    const set = new Set();
    for (let curr = node; curr; curr = curr.parent) {
        set.add(curr);
    }
    return set;
}
