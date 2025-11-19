// Draw Coxeter diagram for O(5,1;Z)
export function drawCoxeterDiagram() {
    const svg = document.getElementById('coxeterDiagram');
    if (!svg) return;

    const width = 600;
    const height = 200;
    const nodeRadius = 20;

    // Create SVG namespace
    const svgNS = "http://www.w3.org/2000/svg";

    // Clear existing content
    svg.innerHTML = '';

    // Root vectors for each reflection
    const roots = {
        0: [1, 1, 1, 0, 0, 1],      // r₀
        1: [1, -1, 0, 0, 0, 0],     // r₁
        2: [0, 1, -1, 0, 0, 0],     // r₂
        3: [0, 0, 1, -1, 0, 0],     // r₃
        4: [0, 0, 0, 0, 1, 0],      // r₄
        5: [0, 0, 0, 1, -1, 0]      // r₅
    };

    // Node positions: center with branching structure
    const nodePositions = [
        { x: 280, y: 110, label: 'r₀', id: 0 },  // Center
        { x: 100, y: 110, label: 'r₁', id: 1 },  // Far left (in path)
        { x: 190, y: 110, label: 'r₂', id: 2 },  // Left (adjacent to center)
        { x: 370, y: 150, label: 'r₃', id: 3 },  // Down-right
        { x: 370, y: 70, label: 'r₄', id: 4 },   // Up-right
        { x: 490, y: 70, label: 'r₅', id: 5 }    // Right of r₄
    ];

    // Draw edges with labels
    const edgeData = [
        { from: 1, to: 2, label: null },    // r₁ to r₂ (left path)
        { from: 2, to: 0, label: null },    // r₂ to center
        { from: 0, to: 3, label: null },    // center to down-right
        { from: 0, to: 4, label: null },    // center to up-right
        { from: 4, to: 5, label: '4' }      // up-right to rightmost (labeled 4)
    ];

    edgeData.forEach(edge => {
        const pos1 = nodePositions[edge.from];
        const pos2 = nodePositions[edge.to];

        // Draw line
        const line = document.createElementNS(svgNS, 'line');
        line.setAttribute('x1', pos1.x);
        line.setAttribute('y1', pos1.y);
        line.setAttribute('x2', pos2.x);
        line.setAttribute('y2', pos2.y);
        line.setAttribute('stroke', '#2c3e50');
        line.setAttribute('stroke-width', '3');
        svg.appendChild(line);

        // Draw label if present
        if (edge.label) {
            const text = document.createElementNS(svgNS, 'text');
            text.setAttribute('x', (pos1.x + pos2.x) / 2);
            text.setAttribute('y', (pos1.y + pos2.y) / 2 - 12);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('font-size', '18');
            text.setAttribute('font-weight', 'bold');
            text.setAttribute('fill', '#e74c3c');
            text.textContent = edge.label;
            svg.appendChild(text);
        }
    });

    // Draw nodes
    nodePositions.forEach((node, i) => {
        // Circle
        const circle = document.createElementNS(svgNS, 'circle');
        circle.setAttribute('cx', node.x);
        circle.setAttribute('cy', node.y);
        circle.setAttribute('r', nodeRadius);
        circle.setAttribute('fill', '#3498db');
        circle.setAttribute('stroke', '#2c3e50');
        circle.setAttribute('stroke-width', '2');
        circle.style.cursor = 'pointer';
        circle.addEventListener('click', () => showReflection(node.id, node.label, roots[node.id]));
        svg.appendChild(circle);

        // Label
        const text = document.createElementNS(svgNS, 'text');
        text.setAttribute('x', node.x);
        text.setAttribute('y', node.y + 6);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', '16');
        text.setAttribute('font-weight', 'bold');
        text.setAttribute('fill', 'white');
        text.setAttribute('pointer-events', 'none');
        text.textContent = node.label;
        svg.appendChild(text);
    });

    // Add title
    const title = document.createElementNS(svgNS, 'text');
    title.setAttribute('x', width / 2);
    title.setAttribute('y', 25);
    title.setAttribute('text-anchor', 'middle');
    title.setAttribute('font-size', '18');
    title.setAttribute('font-weight', 'bold');
    title.setAttribute('fill', '#2c3e50');
    title.textContent = 'Coxeter Diagram for O(5,1;ℤ)';
    svg.appendChild(title);

    // Add legend
    const legend = document.createElementNS(svgNS, 'text');
    legend.setAttribute('x', width / 2);
    legend.setAttribute('y', height - 10);
    legend.setAttribute('text-anchor', 'middle');
    legend.setAttribute('font-size', '13');
    legend.setAttribute('fill', '#666');
    legend.textContent = 'Unlabeled edges: (rᵢrⱼ)³ = 1; Edge labeled 4: (r₄r₅)⁴ = 1';
    svg.appendChild(legend);
}

// Compute inner product for O(5,1) - signature (5,1)
function innerProduct(u, v) {
    return u[0] * v[0] + u[1] * v[1] + u[2] * v[2] + u[3] * v[3] + u[4] * v[4] - u[5] * v[5];
}

// Compute reflection matrix for a root vector
function reflectionMatrix(root) {
    const n = root.length;
    const matrix = [];
    const normSq = innerProduct(root, root);

    for (let i = 0; i < n; i++) {
        matrix[i] = [];
        for (let j = 0; j < n; j++) {
            // R_ij = δ_ij - 2 * <e_j, v> * v_i / <v,v>
            // where <e_j, v> = v_j for j<5, -v_j for j=5
            let delta = (i === j) ? 1 : 0;
            let inner_ej_v = (j < 5) ? root[j] : -root[j];
            matrix[i][j] = delta - 2 * inner_ej_v * root[i] / normSq;
        }
    }

    return matrix;
}

// Format matrix for LaTeX display
function formatMatrix(matrix) {
    let latex = '\\[\\begin{pmatrix}\n';
    matrix.forEach((row, i) => {
        const formattedRow = row.map(val => {
            if (Math.abs(val) < 0.0001) return '0';
            if (Math.abs(val - 1) < 0.0001) return '1';
            if (Math.abs(val + 1) < 0.0001) return '-1';
            // Check for other integers
            if (Math.abs(val - Math.round(val)) < 0.0001) {
                return Math.round(val).toString();
            }
            // Format fractions nicely
            const frac = approximateFraction(val);
            if (frac) return frac;
            return val.toFixed(3);
        }).join(' & ');
        latex += formattedRow;
        if (i < matrix.length - 1) latex += ' \\\\\n';
    });
    latex += '\n\\end{pmatrix}\\]';
    return latex;
}

// Approximate a decimal as a simple fraction
function approximateFraction(x) {
    const tolerance = 0.0001;
    // Check common fractions
    const fractions = [
        [1, 2], [1, 3], [2, 3], [1, 4], [3, 4],
        [1, 5], [2, 5], [3, 5], [4, 5],
        [-1, 2], [-1, 3], [-2, 3], [-1, 4], [-3, 4],
        [-1, 5], [-2, 5], [-3, 5], [-4, 5]
    ];

    for (const [num, den] of fractions) {
        if (Math.abs(x - num / den) < tolerance) {
            if (num < 0) {
                return `-\\frac{${Math.abs(num)}}{${den}}`;
            }
            return `\\frac{${num}}{${den}}`;
        }
    }
    return null;
}

// Show reflection information when a vertex is clicked
function showReflection(id, label, root) {
    const display = document.getElementById('rootDisplay');
    const labelElem = document.getElementById('reflectionLabel');
    const vectorElem = document.getElementById('rootVector');
    const matrixElem = document.getElementById('reflectionMatrix');

    labelElem.textContent = label;

    // Format root vector as LaTeX
    const rootLatex = `\\((${root.join(', ')})\\)`;
    vectorElem.innerHTML = rootLatex;

    const matrix = reflectionMatrix(root);
    matrixElem.innerHTML = formatMatrix(matrix);

    display.style.display = 'block';

    // Typeset the MathJax content
    if (window.MathJax) {
        MathJax.typesetPromise([vectorElem, matrixElem]).catch((err) => console.log(err));
    }

    // Scroll to display
    display.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Show reflection information for reduced diagram
function showReflectionReduced(id, label, root) {
    const display = document.getElementById('rootDisplayReduced');
    const labelElem = document.getElementById('reflectionLabelReduced');
    const vectorElem = document.getElementById('rootVectorReduced');
    const matrixElem = document.getElementById('reflectionMatrixReduced');

    labelElem.textContent = label;

    // Format root vector as LaTeX
    const rootLatex = `\\((${root.join(', ')})\\)`;
    vectorElem.innerHTML = rootLatex;

    const matrix = reflectionMatrix(root);
    matrixElem.innerHTML = formatMatrix(matrix);

    display.style.display = 'block';

    // Typeset the MathJax content
    if (window.MathJax) {
        MathJax.typesetPromise([vectorElem, matrixElem]).catch((err) => console.log(err));
    }

    // Scroll to display
    display.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
}

// Draw reduced Coxeter diagram (r_5 deleted)
export function drawCoxeterDiagramReduced() {
    const svg = document.getElementById('coxeterDiagramReduced');
    if (!svg) return;

    const width = 600;
    const height = 200;
    const nodeRadius = 20;

    // Create SVG namespace
    const svgNS = "http://www.w3.org/2000/svg";

    // Clear existing content
    svg.innerHTML = '';

    // Root vectors for each reflection (same as full diagram, but only 0-4)
    const roots = {
        0: [1, 1, 1, 0, 0, 1],      // r₀
        1: [1, -1, 0, 0, 0, 0],     // r₁
        2: [0, 1, -1, 0, 0, 0],     // r₂
        3: [0, 0, 1, -1, 0, 0],     // r₃
        4: [0, 0, 0, 0, 1, 0]       // r₄
    };

    // Node positions: same as full diagram but without r₅
    const nodePositions = [
        { x: 280, y: 110, label: 'r₀', id: 0 },  // Center
        { x: 100, y: 110, label: 'r₁', id: 1 },  // Far left
        { x: 190, y: 110, label: 'r₂', id: 2 },  // Left
        { x: 370, y: 150, label: 'r₃', id: 3 },  // Down-right
        { x: 370, y: 70, label: 'r₄', id: 4 }    // Up-right
    ];

    // Draw edges (without the 4-5 edge)
    const edgeData = [
        { from: 1, to: 2, label: null },    // r₁ to r₂
        { from: 2, to: 0, label: null },    // r₂ to center
        { from: 0, to: 3, label: null },    // center to down-right
        { from: 0, to: 4, label: null }     // center to up-right
    ];

    edgeData.forEach(edge => {
        const pos1 = nodePositions[edge.from];
        const pos2 = nodePositions[edge.to];

        // Draw line
        const line = document.createElementNS(svgNS, 'line');
        line.setAttribute('x1', pos1.x);
        line.setAttribute('y1', pos1.y);
        line.setAttribute('x2', pos2.x);
        line.setAttribute('y2', pos2.y);
        line.setAttribute('stroke', '#2c3e50');
        line.setAttribute('stroke-width', '3');
        svg.appendChild(line);

        // Draw label if present
        if (edge.label) {
            const text = document.createElementNS(svgNS, 'text');
            text.setAttribute('x', (pos1.x + pos2.x) / 2);
            text.setAttribute('y', (pos1.y + pos2.y) / 2 - 12);
            text.setAttribute('text-anchor', 'middle');
            text.setAttribute('font-size', '18');
            text.setAttribute('font-weight', 'bold');
            text.setAttribute('fill', '#e74c3c');
            text.textContent = edge.label;
            svg.appendChild(text);
        }
    });

    // Draw nodes
    nodePositions.forEach((node, i) => {
        // Circle
        const circle = document.createElementNS(svgNS, 'circle');
        circle.setAttribute('cx', node.x);
        circle.setAttribute('cy', node.y);
        circle.setAttribute('r', nodeRadius);
        circle.setAttribute('fill', '#3498db');
        circle.setAttribute('stroke', '#2c3e50');
        circle.setAttribute('stroke-width', '2');
        circle.style.cursor = 'pointer';
        circle.addEventListener('click', () => showReflectionReduced(node.id, node.label, roots[node.id]));
        svg.appendChild(circle);

        // Label
        const text = document.createElementNS(svgNS, 'text');
        text.setAttribute('x', node.x);
        text.setAttribute('y', node.y + 6);
        text.setAttribute('text-anchor', 'middle');
        text.setAttribute('font-size', '16');
        text.setAttribute('font-weight', 'bold');
        text.setAttribute('fill', 'white');
        text.setAttribute('pointer-events', 'none');
        text.textContent = node.label;
        svg.appendChild(text);
    });

    // Add title
    const title = document.createElementNS(svgNS, 'text');
    title.setAttribute('x', width / 2);
    title.setAttribute('y', 25);
    title.setAttribute('text-anchor', 'middle');
    title.setAttribute('font-size', '18');
    title.setAttribute('font-weight', 'bold');
    title.setAttribute('fill', '#2c3e50');
    title.textContent = 'Parabolic Subgroup (r₅ deleted)';
    svg.appendChild(title);

    // Add legend
    const legend = document.createElementNS(svgNS, 'text');
    legend.setAttribute('x', width / 2);
    legend.setAttribute('y', height - 10);
    legend.setAttribute('text-anchor', 'middle');
    legend.setAttribute('font-size', '13');
    legend.setAttribute('fill', '#666');
    legend.textContent = 'All edges: (rᵢrⱼ)³ = 1';
    svg.appendChild(legend);
}
