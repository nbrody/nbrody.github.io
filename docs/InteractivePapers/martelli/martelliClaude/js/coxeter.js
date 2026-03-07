/**
 * coxeter.js — Interactive Coxeter diagrams for O(5,1;Z) and its parabolic subgroup
 */

const SVG_NS = 'http://www.w3.org/2000/svg';

// Colors for dark theme
const COLORS = {
    bg: 'transparent',
    nodeFill: '#667eea',
    nodeStroke: 'rgba(167, 139, 250, 0.5)',
    nodeHover: '#764ba2',
    edgeStroke: 'rgba(232, 232, 240, 0.4)',
    edgeLabel: '#ef4444',
    textFill: '#e8e8f0',
    titleFill: '#e8e8f0',
    legendFill: '#6a6a8a',
};

// Root vectors for each reflection (O(5,1) inner product)
const ALL_ROOTS = {
    0: [1, 1, 1, 0, 0, 1],
    1: [1, -1, 0, 0, 0, 0],
    2: [0, 1, -1, 0, 0, 0],
    3: [0, 0, 1, -1, 0, 0],
    4: [0, 0, 0, 0, 1, 0],
    5: [0, 0, 0, 1, -1, 0]
};

// O(5,1) inner product
function innerProduct(u, v) {
    return u[0] * v[0] + u[1] * v[1] + u[2] * v[2] + u[3] * v[3] + u[4] * v[4] - u[5] * v[5];
}

function reflectionMatrix(root) {
    const n = root.length;
    const normSq = innerProduct(root, root);
    const matrix = [];
    for (let i = 0; i < n; i++) {
        matrix[i] = [];
        for (let j = 0; j < n; j++) {
            const delta = (i === j) ? 1 : 0;
            const ej_v = (j < 5) ? root[j] : -root[j];
            matrix[i][j] = delta - 2 * ej_v * root[i] / normSq;
        }
    }
    return matrix;
}

function formatMatrix(matrix) {
    let latex = '\\[\\begin{pmatrix}\n';
    matrix.forEach((row, i) => {
        const formatted = row.map(val => {
            if (Math.abs(val) < 1e-8) return '0';
            if (Math.abs(val - 1) < 1e-8) return '1';
            if (Math.abs(val + 1) < 1e-8) return '-1';
            if (Math.abs(val - Math.round(val)) < 1e-8) return Math.round(val).toString();
            const frac = approxFraction(val);
            return frac || val.toFixed(4);
        }).join(' & ');
        latex += formatted;
        if (i < matrix.length - 1) latex += ' \\\\\n';
    });
    latex += '\n\\end{pmatrix}\\]';
    return latex;
}

function approxFraction(x) {
    const tol = 1e-6;
    const fracs = [
        [1, 2], [1, 3], [2, 3], [1, 4], [3, 4], [1, 5], [2, 5], [3, 5], [4, 5],
        [-1, 2], [-1, 3], [-2, 3], [-1, 4], [-3, 4], [-1, 5], [-2, 5], [-3, 5], [-4, 5]
    ];
    for (const [n, d] of fracs) {
        if (Math.abs(x - n / d) < tol) {
            return n < 0 ? `-\\frac{${-n}}{${d}}` : `\\frac{${n}}{${d}}`;
        }
    }
    return null;
}

function showReflection(id, label, root, targetSuffix) {
    const display = document.getElementById('rootDisplay' + targetSuffix);
    const labelElem = document.getElementById('reflectionLabel' + targetSuffix);
    const vectorElem = document.getElementById('rootVector' + targetSuffix);
    const matrixElem = document.getElementById('reflectionMatrix' + targetSuffix);

    if (!display) return;

    labelElem.textContent = label;
    vectorElem.innerHTML = `\\((${root.join(', ')})\\)`;

    const matrix = reflectionMatrix(root);
    matrixElem.innerHTML = formatMatrix(matrix);

    display.style.display = 'block';
    display.style.animation = 'none';
    // Trigger reflow for animation restart
    display.offsetHeight;
    display.style.animation = 'fadeIn 0.3s ease-out';

    if (window.MathJax) {
        MathJax.typesetPromise([vectorElem, matrixElem]).catch(e => console.warn(e));
    }

    display.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

function createNode(svg, x, y, r, label, color, onClick) {
    // Hover glow circle
    const glow = document.createElementNS(SVG_NS, 'circle');
    glow.setAttribute('cx', x);
    glow.setAttribute('cy', y);
    glow.setAttribute('r', r + 6);
    glow.setAttribute('fill', 'transparent');
    glow.setAttribute('stroke', 'transparent');
    glow.setAttribute('stroke-width', '2');
    glow.style.transition = 'all 0.2s ease';
    svg.appendChild(glow);

    const circle = document.createElementNS(SVG_NS, 'circle');
    circle.setAttribute('cx', x);
    circle.setAttribute('cy', y);
    circle.setAttribute('r', r);
    circle.setAttribute('fill', color);
    circle.setAttribute('stroke', COLORS.nodeStroke);
    circle.setAttribute('stroke-width', '2');
    circle.style.cursor = 'pointer';
    circle.style.transition = 'all 0.2s ease';

    circle.addEventListener('mouseenter', () => {
        circle.setAttribute('fill', COLORS.nodeHover);
        circle.setAttribute('r', r + 2);
        glow.setAttribute('stroke', color + '40');
    });
    circle.addEventListener('mouseleave', () => {
        circle.setAttribute('fill', color);
        circle.setAttribute('r', r);
        glow.setAttribute('stroke', 'transparent');
    });
    circle.addEventListener('click', onClick);
    svg.appendChild(circle);

    const text = document.createElementNS(SVG_NS, 'text');
    text.setAttribute('x', x);
    text.setAttribute('y', y + 5);
    text.setAttribute('text-anchor', 'middle');
    text.setAttribute('font-size', '14');
    text.setAttribute('font-weight', '600');
    text.setAttribute('font-family', 'Inter, sans-serif');
    text.setAttribute('fill', COLORS.textFill);
    text.setAttribute('pointer-events', 'none');
    text.textContent = label;
    svg.appendChild(text);
}

function createEdge(svg, x1, y1, x2, y2, label) {
    const line = document.createElementNS(SVG_NS, 'line');
    line.setAttribute('x1', x1);
    line.setAttribute('y1', y1);
    line.setAttribute('x2', x2);
    line.setAttribute('y2', y2);
    line.setAttribute('stroke', COLORS.edgeStroke);
    line.setAttribute('stroke-width', '2.5');
    svg.appendChild(line);

    if (label) {
        const text = document.createElementNS(SVG_NS, 'text');
        text.setAttribute('x', (x1 + x2) / 2);
        text.setAttribute('y', (y1 + y2) / 2 - 10);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', '16');
        text.setAttribute('font-weight', '700');
        text.setAttribute('font-family', 'Inter, sans-serif');
        text.setAttribute('fill', COLORS.edgeLabel);
        text.textContent = label;
        svg.appendChild(text);
    }
}

/** Draw the full Coxeter diagram for O(5,1;Z) */
export function drawCoxeterDiagram() {
    const svg = document.getElementById('coxeterDiagram');
    if (!svg) return;
    svg.innerHTML = '';

    const R = 18;
    const nodes = [
        { x: 280, y: 100, label: 'r₀', id: 0 },
        { x: 100, y: 100, label: 'r₁', id: 1 },
        { x: 190, y: 100, label: 'r₂', id: 2 },
        { x: 370, y: 140, label: 'r₃', id: 3 },
        { x: 370, y: 60, label: 'r₄', id: 4 },
        { x: 490, y: 60, label: 'r₅', id: 5 }
    ];

    const edges = [
        { from: 1, to: 2 },
        { from: 2, to: 0 },
        { from: 0, to: 3 },
        { from: 0, to: 4 },
        { from: 4, to: 5, label: '4' }
    ];

    edges.forEach(e => {
        createEdge(svg, nodes[e.from].x, nodes[e.from].y, nodes[e.to].x, nodes[e.to].y, e.label);
    });

    nodes.forEach(n => {
        createNode(svg, n.x, n.y, R, n.label, COLORS.nodeFill, () => {
            showReflection(n.id, n.label, ALL_ROOTS[n.id], '');
        });
    });

    // Title
    const title = document.createElementNS(SVG_NS, 'text');
    title.setAttribute('x', 300);
    title.setAttribute('y', 20);
    title.setAttribute('text-anchor', 'middle');
    title.setAttribute('font-size', '15');
    title.setAttribute('font-weight', '600');
    title.setAttribute('font-family', 'Inter, sans-serif');
    title.setAttribute('fill', COLORS.titleFill);
    title.textContent = 'Coxeter Diagram for O(5,1;ℤ)';
    svg.appendChild(title);

    // Legend
    const legend = document.createElementNS(SVG_NS, 'text');
    legend.setAttribute('x', 300);
    legend.setAttribute('y', 172);
    legend.setAttribute('text-anchor', 'middle');
    legend.setAttribute('font-size', '12');
    legend.setAttribute('font-family', 'Inter, sans-serif');
    legend.setAttribute('fill', COLORS.legendFill);
    legend.textContent = 'Unlabeled edges: (rᵢrⱼ)³ = 1 · Edge labeled 4: (r₄r₅)⁴ = 1';
    svg.appendChild(legend);
}

/** Draw the reduced Coxeter diagram (r₅ deleted) */
export function drawCoxeterDiagramReduced() {
    const svg = document.getElementById('coxeterDiagramReduced');
    if (!svg) return;
    svg.innerHTML = '';

    const R = 18;
    const nodes = [
        { x: 280, y: 100, label: 'r₀', id: 0 },
        { x: 100, y: 100, label: 'r₁', id: 1 },
        { x: 190, y: 100, label: 'r₂', id: 2 },
        { x: 370, y: 140, label: 'r₃', id: 3 },
        { x: 370, y: 60, label: 'r₄', id: 4 }
    ];

    const edges = [
        { from: 1, to: 2 },
        { from: 2, to: 0 },
        { from: 0, to: 3 },
        { from: 0, to: 4 }
    ];

    edges.forEach(e => {
        createEdge(svg, nodes[e.from].x, nodes[e.from].y, nodes[e.to].x, nodes[e.to].y);
    });

    nodes.forEach(n => {
        const roots = { 0: ALL_ROOTS[0], 1: ALL_ROOTS[1], 2: ALL_ROOTS[2], 3: ALL_ROOTS[3], 4: ALL_ROOTS[4] };
        createNode(svg, n.x, n.y, R, n.label, COLORS.nodeFill, () => {
            showReflection(n.id, n.label, roots[n.id], 'Reduced');
        });
    });

    // Title
    const title = document.createElementNS(SVG_NS, 'text');
    title.setAttribute('x', 300);
    title.setAttribute('y', 20);
    title.setAttribute('text-anchor', 'middle');
    title.setAttribute('font-size', '15');
    title.setAttribute('font-weight', '600');
    title.setAttribute('font-family', 'Inter, sans-serif');
    title.setAttribute('fill', COLORS.titleFill);
    title.textContent = 'Parabolic Subgroup (r₅ deleted)';
    svg.appendChild(title);

    const legend = document.createElementNS(SVG_NS, 'text');
    legend.setAttribute('x', 300);
    legend.setAttribute('y', 172);
    legend.setAttribute('text-anchor', 'middle');
    legend.setAttribute('font-size', '12');
    legend.setAttribute('font-family', 'Inter, sans-serif');
    legend.setAttribute('fill', COLORS.legendFill);
    legend.textContent = 'All edges: (rᵢrⱼ)³ = 1';
    svg.appendChild(legend);
}
