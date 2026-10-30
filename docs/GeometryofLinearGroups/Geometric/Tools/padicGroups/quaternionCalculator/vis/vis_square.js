// vis_square.js - Square Complex Visualization (SVG)

/**
 * Creates an SVG element with attributes
 */
function S(name, attrs = {}) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', name);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
}

function markerForColor(defs, color) {
    const id = `marker-${color.replace(/[^a-zA-Z0-9]/g, '')}`;
    if (!defs.querySelector(`#${id}`)) {
        const marker = S('marker', {
            id, viewBox: '0 0 10 10', refX: '8', refY: '5',
            markerWidth: '4', markerHeight: '4', orient: 'auto-start-reverse'
        });
        marker.appendChild(S('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: color }));
        defs.appendChild(marker);
    }
    return id;
}

/**
 * Fill the grid [−depth, depth]² starting from the axes: horizontal edges on the
 * row j = 0 are genX, vertical edges on the column i = 0 are genY. Each square has
 * bottom a, right b, top a', left b' with a·b = b'·a' (a relation {a, b, bp, ap}),
 * and is determined by any corner, i.e. by any two adjacent sides. Edges are
 * labelled by the generator read left→right or bottom→top. Returns Maps keyed
 * "i,j" for the horizontal edge from (i, j) and the vertical edge from (i, j).
 */
export function fillSquareGrid(relations, depth, genXKey, genYKey) {
    const horz = new Map(), vert = new Map();
    const H = (i, j) => horz.get(`${i},${j}`), V = (i, j) => vert.get(`${i},${j}`);
    for (let i = -depth; i < depth; i++) horz.set(`${i},0`, genXKey);
    for (let j = -depth; j < depth; j++) vert.set(`0,${j}`, genYKey);

    // corner → relation, for each pair of adjacent sides
    const index = (f) => new Map(relations.map((r) => [f(r), r]));
    const bySW = index((r) => `${r.a},${r.bp}`);   // bottom, left
    const bySE = index((r) => `${r.a},${r.b}`);    // bottom, right
    const byNW = index((r) => `${r.ap},${r.bp}`);  // top, left
    const byNE = index((r) => `${r.ap},${r.b}`);   // top, right

    const fill = (i, j) => {
        const bottom = H(i, j), top = H(i, j + 1), left = V(i, j), right = V(i + 1, j);
        if (bottom && top && left && right) return false;
        const r = (bottom && left && bySW.get(`${bottom},${left}`)) ||
            (bottom && right && bySE.get(`${bottom},${right}`)) ||
            (top && left && byNW.get(`${top},${left}`)) ||
            (top && right && byNE.get(`${top},${right}`));
        if (!r) return false;
        horz.set(`${i},${j}`, r.a); horz.set(`${i},${j + 1}`, r.ap);
        vert.set(`${i},${j}`, r.bp); vert.set(`${i + 1},${j}`, r.b);
        return true;
    };

    let changed = true;
    while (changed) {
        changed = false;
        for (let i = -depth; i < depth; i++) for (let j = -depth; j < depth; j++) if (fill(i, j)) changed = true;
    }
    return { horz, vert };
}

export function drawSquareComplex(containerId, generators, relations, depth, genXKey, genYKey) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    if (!genXKey || !genYKey || relations.length === 0) {
        container.textContent = 'Compute generators and select axes first.';
        return;
    }
    if (generators[genXKey].prime === generators[genYKey].prime) {
        container.textContent = 'Choose X- and Y-axis generators of different primes.';
        return;
    }

    const svg = S('svg', { width: '100%', height: '100%', viewBox: '0 0 1000 1000' });
    container.appendChild(svg);
    const defs = S('defs');
    svg.appendChild(defs);

    const squareSize = 900 / (2 * depth + 1);
    const transform = (i, j) => [500 + i * squareSize, 500 - j * squareSize];

    const { horz, vert } = fillSquareGrid(relations, depth, genXKey, genYKey);
    const getHorzEdge = (i, j) => horz.get(`${i},${j}`);
    const getVertEdge = (i, j) => vert.get(`${i},${j}`);

    const drawEdge = (x1, y1, x2, y2, genKey) => {
        if (!genKey) return;
        const gen = generators[genKey];
        let [p1x, p1y] = transform(x1, y1), [p2x, p2y] = transform(x2, y2);
        // an inverse generator traverses its edge backwards
        if (gen.inverse) { [p1x, p2x] = [p2x, p1x];[p1y, p2y] = [p2y, p1y]; }
        const mx = (p1x + p2x) / 2, my = (p1y + p2y) / 2;
        const mid = S('path', { d: `M ${p1x} ${p1y} L ${mx} ${my} L ${p2x} ${p2y}`, fill: 'none', stroke: gen.color, 'stroke-width': 2.5, 'marker-mid': `url(#${markerForColor(defs, gen.color)})` });
        svg.appendChild(mid);
    };

    for (let i = -depth; i < depth; i++) for (let j = -depth; j <= depth; j++) drawEdge(i, j, i + 1, j, getHorzEdge(i, j));
    for (let i = -depth; i <= depth; i++) for (let j = -depth; j < depth; j++) drawEdge(i, j, i, j + 1, getVertEdge(i, j));

    const [cx, cy] = transform(0, 0);
    svg.appendChild(S('circle', { cx, cy, r: Math.max(5, Math.min(14, squareSize * 0.22)), fill: '#ffd700', stroke: '#b8860b', 'stroke-width': '2' }));
}
