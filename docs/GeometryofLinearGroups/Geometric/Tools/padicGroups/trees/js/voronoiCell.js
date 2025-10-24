import { getNodeID, Rational, TDist } from './pAdic.js';

/**
 * Compute the Voronoi cell of [0]_0 with respect to the orbit
 * Returns vertices and half-edges that are closer to [0]_0 than to any other orbit point
 */
export function computeVoronoiCell(orbitMap, treeRoot, p) {
    const zero_zero = { k: 0, q: new Rational(0n, 1n) };
    const zero_zero_id = getNodeID(0, new Rational(0n, 1n));

    // Check if [0]_0 is in the orbit
    if (!orbitMap || !orbitMap.has(zero_zero_id)) {
        return { vertices: new Set(), halfEdges: new Set(), fullEdges: new Set() };
    }

    // Get all orbit vertices except [0]_0
    const otherOrbitVertices = [];
    for (const [id, entry] of orbitMap) {
        if (id !== zero_zero_id) {
            otherOrbitVertices.push(entry.vertex);
        }
    }

    const cellVertices = new Set();
    const halfEdges = new Set();
    const fullEdges = new Set();

    // For each vertex in the tree, check if it's in the Voronoi cell
    treeRoot.descendants().forEach(node => {
        const vertex = {
            k: node.data.k,
            q: new Rational(node.data.q_num, node.data.q_den)
        };

        const distToZero = TDist(vertex, zero_zero, p);

        // Check if this vertex is closer to [0]_0 than to any other orbit point
        let inCell = true;
        for (const otherVertex of otherOrbitVertices) {
            const distToOther = TDist(vertex, otherVertex, p);
            if (distToOther <= distToZero) {
                inCell = false;
                break;
            }
        }

        if (inCell) {
            cellVertices.add(node.data.id);
        }

        // Check edges
        if (node.parent) {
            const parentVertex = {
                k: node.parent.data.k,
                q: new Rational(node.parent.data.q_num, node.parent.data.q_den)
            };

            const parentDistToZero = TDist(parentVertex, zero_zero, p);
            let parentInCell = true;
            for (const otherVertex of otherOrbitVertices) {
                const distToOther = TDist(parentVertex, otherVertex, p);
                if (distToOther <= parentDistToZero) {
                    parentInCell = false;
                    break;
                }
            }

            const edgeKey = `${node.parent.data.id}->${node.data.id}`;

            // If both endpoints are in the cell, mark as full edge
            if (inCell && parentInCell) {
                fullEdges.add(edgeKey);
            }
            // If exactly one endpoint is in the cell, mark as half-edge
            else if (inCell !== parentInCell) {
                halfEdges.add(edgeKey);
            }
        }
    });

    return { vertices: cellVertices, halfEdges, fullEdges };
}
