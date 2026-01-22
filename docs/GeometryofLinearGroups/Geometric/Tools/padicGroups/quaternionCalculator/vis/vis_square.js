// vis_square.js - Square Complex Visualization (SVG)

/**
 * Creates an SVG element with attributes
 */
function S(name, attrs = {}) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', name);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
}

const markerCache = new Set();
function markerForColor(defs, color) {
    const id = `marker-${color.replace(/[^a-zA-Z0-9]/g, '')}`;
    if (!markerCache.has(id)) {
        const marker = S('marker', {
            id, viewBox: '0 0 10 10', refX: '8', refY: '5',
            markerWidth: '4', markerHeight: '4', orient: 'auto-start-reverse'
        });
        marker.appendChild(S('path', { d: 'M 0 0 L 10 5 L 0 10 z', fill: color }));
        defs.appendChild(marker);
        markerCache.add(id);
    }
    return id;
}

const isStar = (key) => key.endsWith('*');

export function drawSquareComplex(containerId, generators, relations, depth, genXKey, genYKey) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';

    if (!genXKey || !genYKey || relations.length === 0) {
        container.textContent = 'Compute generators and select axes first.';
        return;
    }

    const svg = S('svg', { width: '100%', height: '100%', viewBox: '0 0 1000 1000' });
    container.appendChild(svg);
    const defs = S('defs');
    svg.appendChild(defs);

    const squareSize = 900 / (2 * depth + 1);
    const transform = (i, j) => [500 + i * squareSize, 500 - j * squareSize];

    const horzEdges = new Map();
    const vertEdges = new Map();
    const getHorzEdge = (i, j) => horzEdges.get(`${i},${j}`);
    const getVertEdge = (i, j) => vertEdges.get(`${i},${j}`);
    const setHorzEdge = (i, j, gen) => horzEdges.set(`${i},${j}`, gen);
    const setVertEdge = (i, j, gen) => vertEdges.set(`${i},${j}`, gen);

    for (let i = -depth; i < depth; i++) setHorzEdge(i, 0, genXKey);
    for (let j = -depth; j < depth; j++) setVertEdge(0, j, genYKey);

    const tryFillSquare = (i, j) => {
        const bottom = getHorzEdge(i, j), left = getVertEdge(i, j), top = getHorzEdge(i, j + 1), right = getVertEdge(i + 1, j);
        if ([bottom, left, top, right].filter(e => e != null).length === 4) return false;

        let filled = false;
        const check = (e1, e2, out1, out2, setter1, setter2, rFilter) => {
            if (e1 && e2 && (!out1 || !out2)) {
                const rel = relations.find(rFilter);
                if (rel) {
                    if (!out1) { setter1(rel.ap); filled = true; }
                    if (!out2) { setter2(rel.b); filled = true; }
                }
            }
        };

        // Relation: a * b = bp * ap
        check(bottom, left, top, right, (g) => setHorzEdge(i, j + 1, g), (g) => setVertEdge(i + 1, j, g), r => r.a === bottom && r.bp === left);
        check(top, right, bottom, left, (g) => setHorzEdge(i, j, g), (g) => setVertEdge(i, j, g), r => r.ap === top && r.b === right);
        check(bottom, right, top, left, (g) => setHorzEdge(i, j + 1, g), (g) => setVertEdge(i, j, g), r => r.a === bottom && r.b === right);
        check(top, left, bottom, right, (g) => setHorzEdge(i, j, g), (g) => setVertEdge(i + 1, j, g), r => r.ap === top && r.bp === left);

        return filled;
    };

    let changed = true, maxIters = 100;
    while (changed && maxIters--) {
        changed = false;
        for (let i = -depth; i < depth; i++) for (let j = -depth; j < depth; j++) if (tryFillSquare(i, j)) changed = true;
    }

    const drawEdge = (x1, y1, x2, y2, genKey) => {
        if (!genKey) return;
        const gen = generators[genKey];
        let [p1x, p1y] = transform(x1, y1), [p2x, p2y] = transform(x2, y2);
        if (isStar(genKey)) { [p1x, p2x] = [p2x, p1x];[p1y, p2y] = [p2y, p1y]; }
        const mx = (p1x + p2x) / 2, my = (p1y + p2y) / 2;
        const mid = S('path', { d: `M ${p1x} ${p1y} L ${mx} ${my} L ${p2x} ${p2y}`, fill: 'none', stroke: gen.color, 'stroke-width': 2.5, 'marker-mid': `url(#${markerForColor(defs, gen.color)})` });
        svg.appendChild(mid);
    };

    for (let i = -depth; i < depth; i++) for (let j = -depth; j <= depth; j++) drawEdge(i, j, i + 1, j, getHorzEdge(i, j));
    for (let i = -depth; i <= depth; i++) for (let j = -depth; j < depth; j++) drawEdge(i, j, i, j + 1, getVertEdge(i, j));

    const [cx, cy] = transform(0, 0);
    svg.appendChild(S('circle', { cx, cy, r: Math.max(5, Math.min(14, squareSize * 0.22)), fill: '#ffd700', stroke: '#b8860b', 'stroke-width': '2' }));
}
