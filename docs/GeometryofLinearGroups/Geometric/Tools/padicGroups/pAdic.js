// --- BigInt Math Utilities ---

const gcd = (a, b) => { a = a > 0n ? a : -a; b = b > 0n ? b : -b; while (b) { [a, b] = [b, a % b]; } return a; };
const egcd = (a, m) => { if (a === 0n) return [m, 0n, 1n]; const [g, x1, y1] = egcd(m % a, a); return [g, y1 - (m / a) * x1, x1]; };
const modInverse = (a, m) => { const [g, x] = egcd(a, m); if (g !== 1n) throw new Error('Modular inverse does not exist'); return (x % m + m) % m; };

// --- Rational Number Class ---

class Rational {
    constructor(num, den = 1n) {
        if (typeof num === 'string') {
            const parts = num.split('/');
            this.num = BigInt(parts[0]);
            this.den = parts.length > 1 ? BigInt(parts[1]) : 1n;
        } else {
            this.num = BigInt(num);
            this.den = BigInt(den);
        }
        if (this.den === 0n) throw new Error("Denominator cannot be zero.");
        this.simplify();
    }
    simplify() {
        if (this.num === 0n) { this.den = 1n; return; }
        const common = gcd(this.num, this.den);
        this.num /= common; this.den /= common;
        if (this.den < 0n) { this.num = -this.num; this.den = -this.den; }
    }
    add(o) { return new Rational(this.num * o.den + o.num * this.den, this.den * o.den); }
    sub(o) { return new Rational(this.num * o.den - o.num * this.den, this.den * o.den); }
    mul(o) { return new Rational(this.num * o.num, this.den * o.den); }
    div(o) { return new Rational(this.num * o.den, this.den * o.num); }
    toString() { return this.den === 1n ? `${this.num}` : `${this.num}/${this.den}`; }
}

// --- Mathematica Function Translations ---

const integerExponent = (n, p) => {
    if (n === 0n || p <= 1n) return Infinity; n = n > 0n ? n : -n; let count = 0;
    while (n > 0n && n % p === 0n) { count++; n /= p; } return count;
};
const val = (q, p) => integerExponent(q.num, p) - integerExponent(q.den, p);
// p-adic truncation modulo p^n for any rational q
// pn must be p^n. This matches the original Mathematica intent:
// If[n < val[q,p], 0, QInt[q p^{-val}]_1 * (QInt[q p^{-val}]_2)^{-1} mod p^{n-val}, then * p^{val} mod p^n]
const pApprox = (q, p, pn) => {
    const n = integerExponent(pn, p); // pn = p^n
    const t = val(q, p);
    if (n < t) return 0n;

    // Factor out p-adic valuations from numerator/denominator
    const vNum = integerExponent(q.num, p);
    const vDen = integerExponent(q.den, p);
    const pPowNum = p ** BigInt(vNum);
    const pPowDen = p ** BigInt(vDen);

    // Units (coprime to p). Keep signs; modInverse handles negatives via (x % m + m) % m
    const u = q.num / pPowNum;
    const v = q.den / pPowDen;

    // Work at modulus p^{n - t}
    const mExp = n - t; // may be > n if t < 0
    const modUV = p ** BigInt(mExp);

    // Inverse exists because v is coprime to p
    const uNorm = (u % modUV + modUV) % modUV;
    const vNorm = (v % modUV + modUV) % modUV;
    const vInv = modInverse(vNorm, modUV);

    const unitPart = (uNorm * vInv) % modUV; // this corresponds to QInt[..]_1 * inv(QInt[..]_2) mod p^{n-t}

    if (t >= 0) {
        // Multiply back by p^t and reduce mod p^n
        const pPowT = p ** BigInt(t);
        return (unitPart * pPowT) % pn;
    } else {
        // For t < 0 (non p-adic integers), the p-adic "integer part" up to p^{n-1} has no nonnegative powers,
        // so its truncation in Z / p^n Z is 0.
        // (Mathematica's rational Mod can yield a value, but in Z/p^nZ there is no class equal to q when t<0.)
        return 0n;
    }
};
// Vert: compute the vertex level k (possibly negative) and its canonical residue q at that level.
// For all k, q is canonicalized using canonicalizeQ(frac, k, p).
const Vert = (x, p) => {
    const [a, b, c, d] = [x[0][0], x[0][1], x[1][0], x[1][1]];
    const det = a.mul(d).sub(b.mul(c));
    // Decide which chart to use
    if (val(c, p) < val(d, p)) {
        const k = val(det.div(c.mul(c)), p); // may be negative
        const frac = a.div(c);               // Rational
        return { k, q: canonicalizeQ(frac, k, p) };
    } else {
        const k = val(det.div(d.mul(d)), p);
        const frac = b.div(d);
        return { k, q: canonicalizeQ(frac, k, p) };
    }
};
const ReduceVert = (v, p) => {
    const k = ('k' in v) ? v.k : integerExponent(v.pk, p); 
    const qCanon = (v.q instanceof Rational) ? canonicalizeQ(v.q, k, p) : canonicalizeQ(new Rational(v.q), k, p);
    return { k, q: qCanon };
};
const Act = (a, v, p) => {
    const pkRat = stepRational(p, v.k); // Rational step size at level k
    const x = [
        [ a[0][0].mul(pkRat), a[0][0].mul(v.q).add(a[0][1]) ],
        [ a[1][0].mul(pkRat), a[1][0].mul(v.q).add(a[1][1]) ]
    ];
    const acted = Vert(x, p); // returns {k,q}
    return acted;
};
const TDist = (v1, v2, p) => {
    const val_q_diff = val(v2.q.sub(v1.q), p);
    if (val_q_diff < Math.min(v1.k, v2.k)) {
        return v1.k + v2.k - 2 * val_q_diff;
    } else {
        return Math.abs(v1.k - v2.k);
    }
};

// Node id helper: allow rationals (including negative-k levels)
const getNodeID = (k, q) => {
    const asStr = (q instanceof Rational) ? q.toString() : String(q);
    return `${k}-${asStr}`;
};

// --- Rational helpers for negative/positive k levels ---
const powBig = (p, eAbs) => (p ** BigInt(eAbs));
const stepRational = (p, k) => (k >= 0 ? new Rational(powBig(p, k), 1n) : new Rational(1n, powBig(p, -k)));

// floor( a / b ) for non-negative rationals a,b (BigInt-safe)
const floorDivRational = (a, b) => {
    // a = a.num/a.den, b = b.num/b.den
    // floor( a/b ) = floor( a.num * b.den / (a.den * b.num) )
    const num = a.num * b.den;
    const den = a.den * b.num;
    // assume non-negative; BigInt division truncates toward zero
    return num / den;
};

// a mod b for non-negative rationals
const modRational = (a, b) => {
    const t = floorDivRational(a, b); // BigInt
    return a.sub(new Rational(t).mul(b));
};

// Reduce q into the canonical residue for level k (0 <= q < step), using true p-adic reduction for k >= 0 and v_p(q) >= 0
const canonicalizeQ = (q, k, p) => {
    // Normalize input to Rational
    const asRat = (q instanceof Rational) ? q : new Rational(q);

    // For nonnegative levels k, if q is a p-adic integer (v_p(q) >= 0),
    // use p-adic truncation modulo p^k (an element of Z/p^k Z)
    if (k >= 0) {
        const t = val(asRat, p); // v_p(q)
        if (t >= 0) {
            const pk = p ** BigInt(k); // modulus p^k
            const residue = pApprox(asRat, p, pk); // BigInt in [0, p^k)
            return new Rational(residue, 1n);
        }
        // If v_p(q) < 0, q is not a p-adic integer; fall through to rational modulo logic
        // to produce a canonical representative in [0, p^k) as a Rational.
    }

    // Existing rational canonicalization for general k (including negative k)
    const step = stepRational(p, k);
    // Ensure non-negative representation
    let r = asRat;
    if (r.num < 0n) {
        // Bring into [0, step) by adding the smallest nonnegative multiple of `step`
        const t = ((-r.num) * step.den + (r.den * step.num) - 1n) / (r.den * step.num); // ceil((-r)/step)
        r = r.add(new Rational(t).mul(step));
    }
    return modRational(r, step);
};

function generateSubtree(p, k, q, currentDepth, maxDepth, nodeMap) {
    if (currentDepth > maxDepth) return null;
    // Canonicalize q at level k
    const qCanon = (q instanceof Rational) ? canonicalizeQ(q, k, p) : canonicalizeQ(new Rational(q), k, p);
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

    if (currentDepth < maxDepth) {
        const step = stepRational(p, k); // distance between siblings at level k
        for (let i = 0n; i < p; i++) {
            const childQ = qCanon.add(step.mul(new Rational(i)));
            const childNode = generateSubtree(p, k + 1, childQ, currentDepth + 1, maxDepth, nodeMap);
            if (childNode) node.children.push(childNode);
        }
    }
    return node;
}

function drawTree(rootData, v_reduced, v_acted) {
    const svg = d3.select("#tree-vis");
    svg.selectAll("*").remove();
    const container = svg.node().parentElement;
    const width = container.clientWidth;
    const height = container.clientHeight;
    const margin = { top: 50, right: 20, bottom: 50, left: 20 };
    const innerWidth = width - margin.left - margin.right;
    const innerHeight = height - margin.top - margin.bottom;

    const g = svg.attr("width", width).attr("height", height).append("g")
        .attr("transform", `translate(${margin.left},${margin.top})`);

    const treemap = d3.tree().size([innerWidth, innerHeight]);
    const root = d3.hierarchy(rootData, d => d.children);
    treemap(root);

    // Vertical shrink per depth: the gap between layers decreases with depth
    const BASE_Y = 120;   // base gap between root and first layer (px)
    const SHRINK_Y = 0.82; // each subsequent gap is multiplied by this (0<SHRINK_Y<1)
    const depthToY = (depth) => {
        // geometric sum of gaps: sum_{i=0}^{depth-1} BASE_Y * SHRINK_Y^i
        let s = 0;
        let step = BASE_Y;
        for (let i = 0; i < depth; i++) { s += step; step *= SHRINK_Y; }
        return s;
    };
    const scaledY = d => depthToY(d.depth);

    const kToY = new Map();
    root.descendants().forEach(d => {
        if (!kToY.has(d.data.k)) {
            kToY.set(d.data.k, scaledY(d));
        }
    });
    // Clear any previous k-labels (in case of redraws)
    g.selectAll('.k-label').remove();
    // Add labels at the left edge for each row (level k)
    const kEntries = Array.from(kToY.entries()).sort((a,b) => a[0] - b[0]);
    g.selectAll('.k-label')
        .data(kEntries)
        .enter()
        .append('text')
        .attr('class', 'k-label')
        .attr('x', -8)              // slightly left of first column inside the translated group
        .attr('y', d => d[1])
        .attr('dy', '.35em')
        .attr('text-anchor', 'end')
        .style('fill', '#555')
        .style('font-family', 'Helvetica, Arial, sans-serif')
        .style('font-size', '13px')
        .text(d => d[0]);

    const v1_id = getNodeID(v_reduced.k, v_reduced.q);
    const v2_id = getNodeID(v_acted.k, v_acted.q);

    // Compute only the simple path between n1 and n2 using LCA
    const pathNodes = new Set();
    const pathEdges = new Set(); // store edges as 'parentId->childId'

    function collectAncestors(node) {
        const set = new Set();
        for (let curr = node; curr; curr = curr.parent) set.add(curr);
        return set;
    }

    function addPathUp(from, toExclusive) {
        // add nodes and edges from 'from' up to (but not including) 'toExclusive'
        for (let curr = from; curr && curr !== toExclusive; curr = curr.parent) {
            pathNodes.add(curr.data.id);
            if (curr.parent) {
                const key = `${curr.parent.data.id}->${curr.data.id}`;
                pathEdges.add(key);
            }
        }
        if (toExclusive) pathNodes.add(toExclusive.data.id);
    }

    const n1 = root.find(node => node.data.id === v1_id);
    const n2 = root.find(node => node.data.id === v2_id);
    if (n1 && n2) {
        const anc1 = collectAncestors(n1);
        let lca = n2;
        while (lca && !anc1.has(lca)) lca = lca.parent;
        // Path is n1 -> ... -> LCA and n2 -> ... -> LCA
        addPathUp(n1, lca);
        // For the n2 branch, we add edges upward; these edges are oriented parent->child in the tree links
        addPathUp(n2, lca);
    }

    g.selectAll(".link")
        .data(root.links())
        .enter()
        .append("line")
        .attr("class", "link")
        .attr("x1", d => d.source.x)
        .attr("y1", d => scaledY(d.source))
        .attr("x2", d => d.target.x)
        .attr("y2", d => scaledY(d.target))
        .style("stroke", d => pathEdges.has(`${d.source.data.id}->${d.target.data.id}`) ? "red" : "#ccc")
        .style("stroke-width", d => pathEdges.has(`${d.source.data.id}->${d.target.data.id}`) ? "3px" : "1.5px");

    const node = g.selectAll(".node").data(root.descendants()).enter().append("g")
        .attr("class", "node").attr("transform", d => `translate(${d.x},${scaledY(d)})`);

    // Draw a half-length partial edge from the very top rendered vertex, going up-right
    // "Half-length" is BASE_Y/2 measured along a 45° diagonal
    const topMost = root.descendants().reduce((best, d) => {
        const y = scaledY(d);
        if (!best || y < best.y) return { node: d, y };
        return best;
    }, null);
    if (topMost) {
        const xTop = topMost.node.x;
        const yTop = topMost.y;
        const stubLen = BASE_Y * 0.8; // half of the first vertical gap
        const dx = stubLen / Math.SQRT2; // 45° diagonal components
        const dy = stubLen / Math.SQRT2;
        g.append("line")
            .attr("class", "top-stub")
            .attr("x1", xTop)
            .attr("y1", yTop)
            .attr("x2", xTop + dx)
            .attr("y2", yTop - dy)
            .style("stroke", "#ccc")
            .style("stroke-width", "1.5px");
    }

    // Helper: when a node is clicked, populate the vertex inputs from (k,qNum,qDen)
    function populateInputsFromNode(k, qNum, qDen) {
        try {
            const pEl = document.getElementById('prime');
            const kEl = document.getElementById('vertex_k');
            const qEl = document.getElementById('vertex_q');
            if (!pEl || !kEl || !qEl) return;
            const pVal = BigInt(parseInt(pEl.value, 10));
            // Construct Rational and simplify
            const qRat = new Rational(BigInt(qNum), BigInt(qDen));
            // Write k and q back
            kEl.value = String(k);
            qEl.value = qRat.toString();
        } catch (_) { /* no-op */ }
        calculate(); // trigger recalculation
    }

    node.style("cursor", "pointer")
        .on("click", (event, d) => populateInputsFromNode(Number(d.data.k), d.data.q_num, d.data.q_den) );

    node.append("circle")
        .attr("r", d => (d.data.id === v1_id || d.data.id === v2_id) ? 8 : 5)
        .style("fill", d => {
            if (d.data.id === v1_id) return "blue";
            if (d.data.id === v2_id) return "green";
            return pathNodes.has(d.data.id) ? "#ffdddd" : "#fff";
        })
        .style("stroke", d => (pathNodes.has(d.data.id) ? "red" : "steelblue")).style("stroke-width", "2px")
        .style("cursor", "pointer")
        .on("click", (event, d) => populateInputsFromNode(Number(d.data.k), d.data.q_num, d.data.q_den) );

    const labeled = node.filter(d => pathNodes.has(d.data.id));
    labeled.append("foreignObject")
        .attr("x", -30)
        .attr("y", d => d.children ? -28 : 8)
        .attr("width", 60)
        .attr("height", 30)
        .append("xhtml:div")
        .style("font-family", "'Inter', 'Segoe UI', 'Helvetica Neue', Arial, sans-serif")
        .style("font-size", "14px")
        .style("text-align", "center")
        .style("cursor", "pointer")
        .style("pointer-events", "auto")
        .html(d => d.data.name)
        .on("click", (event, d) => populateInputsFromNode(Number(d.data.k), d.data.q_num, d.data.q_den) );

    svg.call(d3.zoom().scaleExtent([0.1, 4]).on("zoom", ({ transform }) => g.attr("transform", transform)));
}



function updateVisualization(p, v_reduced, v_acted) {
    // Choose a start level high enough (possibly very negative) so that
    // all denominators appearing at the levels we show are representable from the root q=0.
    // If q has denominator p^e, we must start at k <= -e so that 1/p^e is generated.
    const ordp = (N) => integerExponent(BigInt(N), p);
    const denExp1 = integerExponent(v_reduced.q.den, p);
    const denExp2 = integerExponent(v_acted.q.den, p);

    const neededNeg = Math.max(0, denExp1, denExp2); // how far negative we need to go for denominators
    const minK = Math.min(v_reduced.k, v_acted.k);
    const maxK = Math.max(v_reduced.k, v_acted.k);

    // Start at least one level above the minimum k (to show a parent), and at or above -neededNeg
    const startK = Math.min(minK - 1, -neededNeg);

    // Depth so we include down to the deepest target + some padding
    const depth = (maxK - startK) + 1; // +1 for a little padding

    const startQ = new Rational(0n, 1n);
    const treeData = generateSubtree(p, startK, startQ, 0, depth, new Map());
    if (treeData) {
        drawTree(treeData, v_reduced, v_acted);
    }
}

// --- UI Logic ---

function calculate() {
    try {
        const p = BigInt(document.getElementById('prime').value);
        const k_in = parseInt(document.getElementById('vertex_k').value);
        const q_in = new Rational(document.getElementById('vertex_q').value);
        const a = [
            [new Rational(document.getElementById('a11').value), new Rational(document.getElementById('a12').value)],
            [new Rational(document.getElementById('a21').value), new Rational(document.getElementById('a22').value)]
        ];

        const v_reduced = ReduceVert({ k: k_in, q: q_in }, p);
        const v_acted = Act(a, v_reduced, p);
        const dist = TDist(v_reduced, v_acted, p);

        document.getElementById('output').innerHTML = `
            <p>Initial Vertex (reduced): $v = \\lfloor ${v_reduced.q.toString()} \\rfloor_{${v_reduced.k}}$</p>
            <p>Resulting Vertex: $a \\cdot v = \\lfloor ${v_acted.q.toString()} \\rfloor_{${v_acted.k}}$</p>
            <p>Distance: $d(v, a \\cdot v) = ${dist}$</p>`;
        if (window.MathJax) MathJax.typeset();

        updateVisualization(p, v_reduced, v_acted);

    } catch (e) {
        document.getElementById('output').innerText = 'Error: ' + e.message;
        d3.select("#tree-vis").selectAll("*").remove(); // Clear viz on error
    }
}

document.addEventListener('DOMContentLoaded', () => {
    document.getElementById('calculateBtn').addEventListener('click', calculate);
    calculate(); // Initial calculation on page load
});