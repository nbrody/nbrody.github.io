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
const pApprox = (q, p, pn) => {
    if (val(q, p) < 0) throw new Error("pApprox requires a p-adic integer (val >= 0).");
    return (q.num * modInverse(q.den, pn) % pn + pn) % pn;
};
const Vert = (x, p) => {
    const [a, b, c, d] = [x[0][0], x[0][1], x[1][0], x[1][1]];
    const det = a.mul(d).sub(b.mul(c));
    if (val(c, p) < val(d, p)) {
        const n_val = val(det.div(c.mul(c)), p);
        const pn = p ** BigInt(n_val);
        return { pk: pn, q: new Rational(pApprox(a.div(c), p, pn)) };
    } else {
        const n_val = val(det.div(d.mul(d)), p);
        const pn = p ** BigInt(n_val);
        return { pk: pn, q: new Rational(pApprox(b.div(d), p, pn)) };
    }
};
const ReduceVert = (v, p) => {
    const k = integerExponent(v.pk, p);
    const r_int = pApprox(v.q, p, v.pk);
    return { pk: v.pk, q: new Rational(r_int), k: k };
};
const Act = (a, v, p) => {
    const x = [
        [a[0][0].mul(new Rational(v.pk)), a[0][0].mul(v.q).add(a[0][1])],
        [a[1][0].mul(new Rational(v.pk)), a[1][0].mul(v.q).add(a[1][1])]
    ];
    const acted_vert_raw = Vert(x, p);
    return { ...acted_vert_raw, k: integerExponent(acted_vert_raw.pk, p) };
};
const TDist = (v1, v2, p) => {
    const val_q_diff = val(v2.q.sub(v1.q), p);
    if (val_q_diff < Math.min(v1.k, v2.k)) {
        return v1.k + v2.k - 2 * val_q_diff;
    } else {
        return Math.abs(v1.k - v2.k);
    }
};

// --- D3 Visualization Logic ---

const getNodeID = (k, q) => `${k}-${q.toString()}`;

function generateSubtree(p, k, q, currentDepth, maxDepth, nodeMap) {
    if (currentDepth > maxDepth) return null;
    const pk = p ** BigInt(k);
    const canonical_q = (q % pk + pk) % pk;
    const id = getNodeID(k, canonical_q);
    if (nodeMap.has(id)) return nodeMap.get(id);

    const node = { name: `⌊${canonical_q}⌋<sub>${k}</sub>`, id: id, k: k, q: canonical_q, children: [] };
    nodeMap.set(id, node);

    if (currentDepth < maxDepth) {
        for (let i = 0n; i < p; i++) {
            const childNode = generateSubtree(p, k + 1, canonical_q + i * pk, currentDepth + 1, maxDepth, nodeMap);
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

    // Build a map from level k to the y position for that row, then render labels at the left
    const kToY = new Map();
    root.descendants().forEach(d => {
        if (!kToY.has(d.data.k)) {
            kToY.set(d.data.k, d.y);
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

    const v1_id = getNodeID(v_reduced.k, v_reduced.q.num);
    const v2_id = getNodeID(v_acted.k, v_acted.q.num);
    const pathNodes = new Set();
    const n1 = root.find(node => node.data.id === v1_id);
    const n2 = root.find(node => node.data.id === v2_id);
    if (n1) { for (let curr = n1; curr; curr = curr.parent) pathNodes.add(curr.data.id); }
    if (n2) { for (let curr = n2; curr; curr = curr.parent) pathNodes.add(curr.data.id); }

    g.selectAll(".link").data(root.links()).enter().append("path").attr("class", "link")
        .attr("d", d3.linkVertical().x(d => d.x).y(d => d.y))
        .style("stroke", d => (pathNodes.has(d.source.data.id) && pathNodes.has(d.target.data.id)) ? "red" : "#ccc")
        .style("stroke-width", d => (pathNodes.has(d.source.data.id) && pathNodes.has(d.target.data.id)) ? "3px" : "1.5px");

    const node = g.selectAll(".node").data(root.descendants()).enter().append("g")
        .attr("class", "node").attr("transform", d => `translate(${d.x},${d.y})`);

    // Helper: when a node is clicked, populate the vertex inputs from (k,q)
    function populateInputsFromNode(k, qInt) {
        try {
            const pEl = document.getElementById('prime');
            const kEl = document.getElementById('vertex_k');
            const qEl = document.getElementById('vertex_q');
            if (!pEl || !kEl || !qEl) return;
            const pVal = BigInt(parseInt(pEl.value, 10));
            // Build q/p^k and reduce
            const den = pVal ** BigInt(k);
            let num = BigInt(qInt);
            if (den === 0n) return;
            let g = gcd(num, den);
            if (g === 0n) g = 1n;
            num /= g; const denRed = den / g;
            const qStr = denRed === 1n ? `${num.toString()}` : `${num.toString()}/${denRed.toString()}`;
            kEl.value = String(k);
            qEl.value = qStr;
        } catch (_) { /* no-op */ }
    }

    node.style("cursor", "pointer")
        .on("click", (event, d) => populateInputsFromNode(Number(d.data.k), BigInt(d.data.q)) );

    node.append("circle")
        .attr("r", d => (d.data.id === v1_id || d.data.id === v2_id) ? 8 : 5)
        .style("fill", d => {
            if (d.data.id === v1_id) return "blue";
            if (d.data.id === v2_id) return "green";
            return pathNodes.has(d.data.id) ? "#ffdddd" : "#fff";
        })
        .style("stroke", d => (pathNodes.has(d.data.id) ? "red" : "steelblue")).style("stroke-width", "2px")
        .style("cursor", "pointer")
        .on("click", (event, d) => populateInputsFromNode(Number(d.data.k), BigInt(d.data.q)) );

    node.append("foreignObject")
        .attr("x", -30)
        .attr("y", d => d.children ? -28 : 8)
        .attr("width", 60)
        .attr("height", 30)
        .append("xhtml:div")
        .style("font-family", "'Segoe UI', 'Helvetica Neue', Arial, sans-serif")
        .style("font-size", "14px")
        .style("text-align", "center")
        .style("cursor", "pointer")
        .style("pointer-events", "auto")
        .html(d => d.data.name)
        .on("click", (event, d) => populateInputsFromNode(Number(d.data.k), BigInt(d.data.q)) );

    svg.call(d3.zoom().scaleExtent([0.1, 4]).on("zoom", ({ transform }) => g.attr("transform", transform)));
}

function updateVisualization(p, v_reduced, v_acted) {
    let v1 = { k: v_reduced.k, q: v_reduced.q.num }, v2 = { k: v_acted.k, q: v_acted.q.num };
    const ancestors1 = new Map();
    for (let k = v1.k; k >= 0; k--) {
        const pk = p ** BigInt(k);
        const q_mod = (v1.q % pk + pk) % pk;
        ancestors1.set(getNodeID(k, q_mod), { k, q: q_mod });
    }
    let meet = { k: 0, q: 0n };
    for (let k = v2.k; k >= 0; k--) {
        const pk = p ** BigInt(k);
        const q_mod = (v2.q % pk + pk) % pk;
        const id = getNodeID(k, q_mod);
        if (ancestors1.has(id)) { meet = ancestors1.get(id); break; }
    }
    const max_k = Math.max(v1.k, v2.k);
    const depth = max_k - meet.k + 2;
    const treeData = generateSubtree(p, meet.k, meet.q, 0, depth, new Map());
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

        const v_reduced = ReduceVert({ pk: p ** BigInt(k_in), q: q_in }, p);
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