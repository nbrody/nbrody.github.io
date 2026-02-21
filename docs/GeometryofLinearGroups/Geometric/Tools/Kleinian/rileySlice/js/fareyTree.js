// ═══════════════════════════════════════════════════════
// Farey Tree Construction
// ═══════════════════════════════════════════════════════
//
// Builds the Stern-Brocot / Farey tree of fractions from 0/1 to 1/0.
// Each node stores the fraction p/q, a GLSL variable name, and indices
//   Φ_{mediant} = 8 - Φ_{left} · Φ_{right} − Φ_{diff}
//
// where diff = |p_left − p_right| / |q_left − q_right|.

export function buildFareyTree(maxDepth) {
    const nodes = [];
    const fracMap = new Map();

    function key(p, q) { return p + '/' + q; }

    function addNode(p, q) {
        const k = key(p, q);
        if (fracMap.has(k)) return fracMap.get(k);
        const idx = nodes.length;
        const varName = 't' + idx;
        nodes.push({ p, q, varName, leftParent: -1, rightParent: -1, diffParent: -1 });
        fracMap.set(k, idx);
        return idx;
    }

    // Base nodes
    addNode(0, 1); // index 0: Q_{0/1} = 2 - ρ
    addNode(1, 0); // index 1: Q_{1/0} = 2
    addNode(1, 1); // index 2: Q_{1/1} = 2 + ρ

    function buildSubtree(li, ri, depth) {
        if (depth <= 0) return;
        const lp = nodes[li].p, lq = nodes[li].q;
        const rp = nodes[ri].p, rq = nodes[ri].q;
        const mp = lp + rp, mq = lq + rq;

        const mi = addNode(mp, mq);

        const dp = Math.abs(lp - rp), dq = Math.abs(lq - rq);
        const di = fracMap.get(key(dp, dq));

        if (di !== undefined) {
            nodes[mi].leftParent = li;
            nodes[mi].rightParent = ri;
            nodes[mi].diffParent = di;
        }

        buildSubtree(li, mi, depth - 1);
        buildSubtree(mi, ri, depth - 1);
    }

    buildSubtree(0, 2, maxDepth); // 0/1 – 1/1
    buildSubtree(2, 1, maxDepth); // 1/1 – 1/0

    return nodes;
}
