import { Rational, stepRational, canonicalizeQ, getNodeID, integerExponent } from './pAdic.js';

/**
 * Generate tree containing vertices within maxDist of orbit vertices
 */
export function generateTreeAroundOrbit(p, orbitMap, maxDist = 3) {
    if (!orbitMap || orbitMap.size === 0) {
        // Fallback: generate small tree around origin
        return generateSubtreeFromVertex(p, 0, new Rational(0n, 1n), 3, new Map());
    }

    // Collect all orbit vertices
    const orbitVertices = [];
    for (const { vertex } of orbitMap.values()) {
        orbitVertices.push(vertex);
    }

    // Find range of k values in orbit
    let minK = orbitVertices[0].k;
    let maxK = orbitVertices[0].k;
    for (const v of orbitVertices) {
        minK = Math.min(minK, v.k);
        maxK = Math.max(maxK, v.k);
    }

    // Expand range by maxDist
    const startK = minK - maxDist;
    const endK = maxK + maxDist;

    // Generate all vertices to explore
    const verticesToExplore = new Set();
    const nodeMap = new Map();

    // Add orbit vertices as seeds
    for (const v of orbitVertices) {
        verticesToExplore.add(getNodeID(v.k, v.q));
    }

    // BFS to explore vertices within maxDist
    const explored = new Set();
    const queue = [];

    for (const v of orbitVertices) {
        queue.push({ vertex: v, dist: 0 });
        explored.add(getNodeID(v.k, v.q));
    }

    while (queue.length > 0) {
        const { vertex, dist } = queue.shift();
        const id = getNodeID(vertex.k, vertex.q);
        verticesToExplore.add(id);

        if (dist >= maxDist) continue;

        // Explore neighbors
        const neighbors = getNeighbors(p, vertex);
        for (const neighbor of neighbors) {
            const nid = getNodeID(neighbor.k, neighbor.q);
            if (!explored.has(nid) && neighbor.k >= startK && neighbor.k <= endK) {
                explored.add(nid);
                queue.push({ vertex: neighbor, dist: dist + 1 });
            }
        }
    }

    // Now build tree structure
    // Find the root (vertex with minimum k)
    let rootK = startK;
    const rootQ = new Rational(0n, 1n);

    return buildTreeFromVertices(p, rootK, rootQ, verticesToExplore, endK - rootK + 1);
}

/**
 * Get all neighbors of a vertex in the Bruhat-Tits tree
 */
function getNeighbors(p, vertex) {
    const neighbors = [];
    const { k, q } = vertex;

    // Parent: at level k-1
    // The parent is obtained by reducing q modulo p^(k-1)
    if (k > -100) { // reasonable bound
        const parentQ = canonicalizeQ(q, k - 1, p);
        neighbors.push({ k: k - 1, q: parentQ });
    }

    // Children: at level k+1, there are p children
    // Each child is q + i*p^k for i = 0, 1, ..., p-1
    const step = stepRational(p, k);
    for (let i = 0n; i < p; i++) {
        const childQ = canonicalizeQ(q.add(step.mul(new Rational(i))), k + 1, p);
        neighbors.push({ k: k + 1, q: childQ });
    }

    return neighbors;
}

const powBig = (p, e) => {
    if (e < 0n) return 1n;
    return p ** e;
};

/**
 * Build tree structure from a set of vertices to include
 */
function buildTreeFromVertices(p, rootK, rootQ, verticesToInclude, maxDepth) {
    const nodeMap = new Map();

    function buildNode(k, q, depth) {
        if (depth > maxDepth) return null;

        const qCanon = canonicalizeQ(q, k, p);
        const id = getNodeID(k, qCanon);

        // Only include if in our set
        if (!verticesToInclude.has(id)) return null;

        if (nodeMap.has(id)) return nodeMap.get(id);

        const node = {
            name: `⌊${qCanon.toString()}⌋<sub>${k}</sub>`,
            id,
            k,
            q_num: qCanon.num,
            q_den: qCanon.den,
            children: []
        };
        nodeMap.set(id, node);

        // Add children
        const step = stepRational(p, k);
        for (let i = 0n; i < p; i++) {
            const childQ = qCanon.add(step.mul(new Rational(i)));
            const childNode = buildNode(k + 1, childQ, depth + 1);
            if (childNode) {
                node.children.push(childNode);
            }
        }

        return node;
    }

    return buildNode(rootK, rootQ, 0);
}

/**
 * Generate subtree from a single vertex (fallback)
 */
function generateSubtreeFromVertex(p, k, q, maxDepth, nodeMap) {
    if (maxDepth < 0) return null;

    const qCanon = canonicalizeQ(q, k, p);
    const id = getNodeID(k, qCanon);
    if (nodeMap.has(id)) return nodeMap.get(id);

    const node = {
        name: `⌊${qCanon.toString()}⌋<sub>${k}</sub>`,
        id,
        k,
        q_num: qCanon.num,
        q_den: qCanon.den,
        children: []
    };
    nodeMap.set(id, node);

    if (maxDepth > 0) {
        const step = stepRational(p, k);
        for (let i = 0n; i < p; i++) {
            const childQ = qCanon.add(step.mul(new Rational(i)));
            const childNode = generateSubtreeFromVertex(p, k + 1, childQ, maxDepth - 1, nodeMap);
            if (childNode) node.children.push(childNode);
        }
    }

    return node;
}
