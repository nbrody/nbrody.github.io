// ═══════════════════════════════════════════════════════
// Farey Tree Construction
// ═══════════════════════════════════════════════════════
//
// Builds the Farey tree of fractions p/q ∈ [0, 1]. Slopes outside [0,1]
// are redundant: the trace polynomials satisfy Φ_{(p+2q)/q} = Φ_{p/q}
// (e.g. Φ_{2/1} = Φ_{0/1}), so [0,1] together with complex conjugation
// covers the whole Riley slice picture.
//
// Each node stores the fraction p/q, a GLSL variable name, and parent
// indices for the trace recurrence
//
//   Φ_{mediant} = 8 − Φ_{left} · Φ_{right} − Φ_{diff}
//
// where diff = |p_left − p_right| / |q_left − q_right|, with base cases
//   Φ_{0/1} = 2 − ρ,  Φ_{1/0} = 2,  Φ_{1/1} = 2 + ρ.

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
    addNode(0, 1); // index 0: Φ_{0/1} = 2 - ρ
    addNode(1, 0); // index 1: Φ_{1/0} = 2
    addNode(1, 1); // index 2: Φ_{1/1} = 2 + ρ

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

    return nodes;
}

// Consistent hue for a slope p/q ∈ [0,1]: rainbow from red (0/1) to violet (1/1).
export function slopeHue(p, q) {
    return 0.83 * (p / q);
}

// Evaluate every Farey trace Φ_{p/q}(ρ) at a complex point ρ = re + im·i,
// using the same recurrence as the shader. Returns an array of {re, im}
// parallel to `nodes`.
export function evaluateTraces(nodes, re, im) {
    const vals = new Array(nodes.length);
    vals[0] = { re: 2 - re, im: -im };
    vals[1] = { re: 2, im: 0 };
    vals[2] = { re: 2 + re, im: im };
    for (let i = 3; i < nodes.length; i++) {
        const n = nodes[i];
        if (n.leftParent < 0) { vals[i] = { re: 0, im: 0 }; continue; }
        const a = vals[n.leftParent], b = vals[n.rightParent], d = vals[n.diffParent];
        vals[i] = {
            re: 8 - (a.re * b.re - a.im * b.im) - d.re,
            im: -(a.re * b.im + a.im * b.re) - d.im
        };
    }
    return vals;
}
