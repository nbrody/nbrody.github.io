// cayley.js — BFS ball of the Cayley graph around the current position.
//
// Nodes carry exact matrices and heights; screen positions are computed
// per-frame by the renderer from *relative* matrices, so nothing here needs
// floats. The group is free on {a, b} away from the relator's ±I torsion,
// so a depth-d ball has at most 1 + 4·(3^d - 1)/2 nodes — tiny for d = 4.

'use strict';

const Cayley = (() => {

    const MOVES = ['a', 'A', 'b', 'B'];
    const DEPTH = 4;

    // Build the ball of radius `depth` around `center` (a Mat2).
    // Returns { nodes: [{matrix, key, height, level}], byKey: Map }.
    function build(center, depth = DEPTH) {
        const root = { matrix: center, key: center.key, height: center.height, level: 0 };
        const nodes = [root];
        const byKey = new Map([[root.key, root]]);

        let head = 0;
        while (head < nodes.length && nodes[head].level < depth) {
            const cur = nodes[head++];
            for (const label of MOVES) {
                const m = cur.matrix.mul(LRMath.GEN[label]);
                if (byKey.has(m.key)) continue;
                const node = { matrix: m, key: m.key, height: m.height, level: cur.level + 1 };
                byKey.set(m.key, node);
                nodes.push(node);
            }
        }
        return { nodes, byKey };
    }

    return { build, MOVES, DEPTH };
})();

if (typeof module !== 'undefined' && module.exports) {
    module.exports = Cayley;
}
