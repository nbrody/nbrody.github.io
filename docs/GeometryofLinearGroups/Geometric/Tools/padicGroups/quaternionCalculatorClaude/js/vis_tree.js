// vis_tree.js — Bruhat–Tits tree visualization (SVG)

const NS = 'http://www.w3.org/2000/svg';
function S(name, attrs = {}) {
    const el = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
}

/**
 * Draw a (p+1)-regular tree with highlighted geodesic path.
 *
 * @param svgEl - SVG DOM element to render into
 * @param p - prime (branching = p+1)
 * @param pathIndices - array of P1 indices for the highlighted path
 * @param maxDepth - visual depth to draw
 */
export function drawTree(svgEl, p, pathIndices = [], maxDepth = 4) {
    while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
    svgEl.style.display = 'block';

    const W = svgEl.clientWidth || 800;
    const H = svgEl.clientHeight || 800;
    svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);

    const branching = p + 1;
    const rootX = W / 2;
    const rootY = 60;

    // Compute positions using a recursive layout
    const nodes = [];
    const edges = [];

    function layout(x, y, depth, parentAngle, parentIdx, childIdx) {
        const nodeIdx = nodes.length;
        nodes.push({ x, y, depth, childIdx, highlighted: false });

        if (depth >= maxDepth) return nodeIdx;

        // How many children at this level?
        const numChildren = depth === 0 ? branching : branching - 1;
        const levelH = Math.min(120, (H - 100) / maxDepth);
        const spreadBase = W * 0.4;
        const spread = spreadBase / Math.pow(branching - 0.5, depth);

        for (let c = 0; c < numChildren; c++) {
            const fraction = numChildren === 1 ? 0.5 : c / (numChildren - 1);
            const offset = (fraction - 0.5) * spread;
            const cx = x + offset;
            const cy = y + levelH;

            // Actual child index: if not root, skip parent direction
            let actualIdx = c;
            if (depth > 0) {
                // The "parent direction" occupies one slot; skip it
                // childIdx is which slot the parent was in;
                // we need to skip that direction on the way back
                if (c >= childIdx) actualIdx = c + 1;
            }

            const childNodeIdx = layout(cx, cy, depth + 1, 0, nodeIdx, actualIdx);
            edges.push({ from: nodeIdx, to: childNodeIdx, depth, childActualIdx: actualIdx });
        }

        return nodeIdx;
    }

    layout(rootX, rootY, 0, 0, -1, -1);

    // Mark highlighted path
    let currentNode = 0;
    nodes[0].highlighted = true;

    for (let step = 0; step < pathIndices.length && step < maxDepth; step++) {
        const targetIdx = pathIndices[step];
        // Find the edge from currentNode whose childActualIdx matches
        const edge = edges.find(e => e.from === currentNode && e.childActualIdx === targetIdx);
        if (edge) {
            edge.highlighted = true;
            nodes[edge.to].highlighted = true;
            currentNode = edge.to;
        }
    }

    // Draw edges
    for (const edge of edges) {
        const from = nodes[edge.from];
        const to = nodes[edge.to];
        const highlighted = edge.highlighted;

        svgEl.appendChild(S('line', {
            x1: from.x, y1: from.y,
            x2: to.x, y2: to.y,
            stroke: highlighted ? '#60a5fa' : 'rgba(255,255,255,0.12)',
            'stroke-width': highlighted ? '3' : '1.5',
            'stroke-linecap': 'round'
        }));
    }

    // Draw nodes
    for (let i = 0; i < nodes.length; i++) {
        const node = nodes[i];
        const r = node.depth === 0 ? 8 : Math.max(3, 6 - node.depth);
        const highlighted = node.highlighted;

        svgEl.appendChild(S('circle', {
            cx: node.x, cy: node.y, r,
            fill: highlighted ? '#60a5fa' : (node.depth === 0 ? '#ffd700' : 'rgba(255,255,255,0.3)'),
            stroke: highlighted ? '#38bdf8' : 'rgba(255,255,255,0.1)',
            'stroke-width': highlighted ? '2' : '1'
        }));

        // Label for highlighted path nodes
        if (highlighted && node.depth > 0) {
            const stepIdx = node.depth - 1;
            const label = stepIdx < pathIndices.length
                ? (pathIndices[stepIdx] === p ? '∞' : String(pathIndices[stepIdx]))
                : '';

            if (label) {
                svgEl.appendChild(S('text', {
                    x: node.x + r + 4, y: node.y + 3,
                    fill: '#60a5fa',
                    'font-family': "'JetBrains Mono', monospace",
                    'font-size': '11',
                    'font-weight': '600'
                })).textContent = label;
            }
        }
    }

    // Root label
    svgEl.appendChild(S('text', {
        x: rootX, y: rootY - 14,
        fill: '#ffd700',
        'font-family': "'JetBrains Mono', monospace",
        'font-size': '12',
        'text-anchor': 'middle',
        'font-weight': '600'
    })).textContent = 'v₀';
}

/**
 * Draw a factorization lattice (simplified 2D layout).
 */
export function drawFactorLattice(svgEl, data, targetQ) {
    while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
    svgEl.style.display = 'block';

    const W = svgEl.clientWidth || 800;
    const H = svgEl.clientHeight || 600;
    svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);

    const { nodes, links, primes } = data;
    if (nodes.length === 0) return;

    // Group nodes by level
    const levels = new Map();
    for (const n of nodes) {
        if (!levels.has(n.level)) levels.set(n.level, []);
        levels.get(n.level).push(n);
    }

    const maxLevel = Math.max(...nodes.map(n => n.level));
    const levelH = maxLevel > 0 ? (H - 80) / maxLevel : 0;

    // Position nodes
    const posMap = new Map();
    for (const [level, levelNodes] of levels) {
        const y = 40 + level * levelH;
        const spacing = W / (levelNodes.length + 1);
        levelNodes.forEach((n, i) => {
            posMap.set(n.id, { x: spacing * (i + 1), y });
        });
    }

    // Prime colors
    const primeColors = {};
    primes.forEach((p, i) => {
        const hue = (i * 137.5 + 200) % 360;
        primeColors[p] = `hsl(${hue}, 70%, 55%)`;
    });

    // Draw links
    for (const link of links) {
        const from = posMap.get(link.source);
        const to = posMap.get(link.target);
        if (!from || !to) continue;

        const color = primeColors[link.prime] || 'rgba(255,255,255,0.3)';
        svgEl.appendChild(S('line', {
            x1: from.x, y1: from.y,
            x2: to.x, y2: to.y,
            stroke: color, 'stroke-width': '2',
            'stroke-opacity': '0.6'
        }));
    }

    // Draw nodes
    for (const node of nodes) {
        const pos = posMap.get(node.id);
        if (!pos) continue;
        const isRoot = node.level === 0;
        const isTarget = node.level === maxLevel;

        svgEl.appendChild(S('circle', {
            cx: pos.x, cy: pos.y,
            r: isRoot || isTarget ? 8 : 5,
            fill: isRoot ? '#ffd700' : isTarget ? '#34d399' : 'rgba(255,255,255,0.4)',
            stroke: isRoot ? '#b8860b' : isTarget ? '#059669' : 'rgba(255,255,255,0.15)',
            'stroke-width': '2'
        }));
    }

    // Legend
    let lx = 20;
    for (const p of primes) {
        svgEl.appendChild(S('line', {
            x1: lx, y1: H - 20, x2: lx + 20, y2: H - 20,
            stroke: primeColors[p], 'stroke-width': '3'
        }));
        const label = S('text', {
            x: lx + 25, y: H - 16,
            fill: primeColors[p],
            'font-family': "'JetBrains Mono', monospace",
            'font-size': '11'
        });
        label.textContent = `p=${p}`;
        svgEl.appendChild(label);
        lx += 70;
    }
}
