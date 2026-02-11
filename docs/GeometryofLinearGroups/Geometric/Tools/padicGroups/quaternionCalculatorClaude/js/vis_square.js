// vis_square.js — Presentation complex / Square complex visualization
// Draws the (p+1)(q+1) square complex with proper redundancy handling

const NS = 'http://www.w3.org/2000/svg';
function S(name, attrs = {}) {
    const el = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
}

/**
 * Draw the square complex on an SVG element.
 *
 * The presentation complex for two primes p and q has:
 *   - Vertex: the identity
 *   - Edges: (p+1) horizontal + (q+1) vertical generators
 *   - Squares: (p+1)(q+1) commutation relations a*b = b'*a'
 *     Some are "degenerate" (a=a', b=b' — the generators commute).
 *
 * We propagate outward from the origin using the relation data,
 * labeling each edge with its generator.
 */
export function drawSquareComplex(svgEl, generators, relations, depth, genXKey, genYKey) {
    // Clear
    while (svgEl.firstChild) svgEl.removeChild(svgEl.firstChild);
    svgEl.style.display = 'block';

    if (!genXKey || !genYKey || relations.length === 0) return;

    const W = svgEl.clientWidth || 800;
    const H = svgEl.clientHeight || 800;
    svgEl.setAttribute('viewBox', `0 0 ${W} ${H}`);

    const defs = S('defs');
    svgEl.appendChild(defs);

    // Group for zoomable content
    const g = S('g');
    svgEl.appendChild(g);

    const cellSize = Math.min(W, H) * 0.85 / (2 * depth + 1);
    const cx = W / 2, cy = H / 2;

    const toScreen = (i, j) => [cx + i * cellSize, cy - j * cellSize];

    // Edge maps: key "i,j" -> generator key
    const hEdges = new Map(); // horizontal edge from (i,j) to (i+1,j)
    const vEdges = new Map(); // vertical edge from (i,j) to (i,j+1)

    // Seed the axes
    for (let i = -depth; i < depth; i++) hEdges.set(`${i},0`, genXKey);
    for (let j = -depth; j < depth; j++) vEdges.set(`0,${j}`, genYKey);

    // Cross-prime filter: only use relations where a's prime matches genX's prime
    // and b's prime matches genY's prime
    const pX = generators[genXKey]?.prime;
    const pY = generators[genYKey]?.prime;

    // Include relations in both orientations (a*b = bp*ap)
    // where a matches X-axis prime and b matches Y-axis prime
    const crossRelations = relations.filter(r => {
        const aPrime = generators[r.a]?.prime;
        const bPrime = generators[r.b]?.prime;
        return (aPrime === pX && bPrime === pY);
    });

    // Also collect reverse-orientation relations if primes are swapped
    // and create synthetic flipped entries: if a_p * b_q = b'_q * a'_p,
    // then b_q * a_p = a'_p * b'_q (swap horizontal/vertical roles)
    if (pX !== pY) {
        const reverseRelations = relations.filter(r => {
            const aPrime = generators[r.a]?.prime;
            const bPrime = generators[r.b]?.prime;
            return (aPrime === pY && bPrime === pX);
        });
        // Flip: a->b role, b->a role => new relation with swapped primes
        for (const r of reverseRelations) {
            crossRelations.push({
                a: r.b, b: r.a, bp: r.ap, ap: r.bp,
                degenerate: r.degenerate
            });
        }
    }

    // Track relation stats
    let totalRelations = crossRelations.length;
    let degenerateCount = crossRelations.filter(r => r.degenerate).length;
    let squaresFilled = 0;

    // Propagation: fill squares iteratively
    const tryFillSquare = (i, j) => {
        const bKey = hEdges.get(`${i},${j}`);     // bottom
        const lKey = vEdges.get(`${i},${j}`);       // left
        const tKey = hEdges.get(`${i},${j + 1}`);    // top
        const rKey = vEdges.get(`${i + 1},${j}`);    // right

        const known = [bKey, lKey, tKey, rKey].filter(e => e != null).length;
        if (known >= 4 || known < 2) return false;

        let filled = false;

        // Given bottom (a) and left (bp), find top (ap) and right (b)
        if (bKey && lKey && !tKey) {
            const rel = crossRelations.find(r => r.a === bKey && r.bp === lKey);
            if (rel) {
                hEdges.set(`${i},${j + 1}`, rel.ap);
                if (!rKey) vEdges.set(`${i + 1},${j}`, rel.b);
                filled = true;
            }
        }

        // Given top (ap) and right (b), find bottom (a) and left (bp)
        if (tKey && rKey && !bKey) {
            const rel = crossRelations.find(r => r.ap === tKey && r.b === rKey);
            if (rel) {
                hEdges.set(`${i},${j}`, rel.a);
                if (!lKey) vEdges.set(`${i},${j}`, rel.bp);
                filled = true;
            }
        }

        // Given bottom (a) and right (b), find top (ap) and left (bp)
        if (bKey && rKey && !tKey) {
            const rel = crossRelations.find(r => r.a === bKey && r.b === rKey);
            if (rel) {
                hEdges.set(`${i},${j + 1}`, rel.ap);
                if (!lKey) vEdges.set(`${i},${j}`, rel.bp);
                filled = true;
            }
        }

        // Given top (ap) and left (bp), find bottom (a) and right (b)
        if (tKey && lKey && !bKey) {
            const rel = crossRelations.find(r => r.ap === tKey && r.bp === lKey);
            if (rel) {
                hEdges.set(`${i},${j}`, rel.a);
                if (!rKey) vEdges.set(`${i + 1},${j}`, rel.b);
                filled = true;
            }
        }

        if (filled) squaresFilled++;
        return filled;
    };

    // Iterate until stable
    let changed = true, maxIter = depth * 10;
    while (changed && maxIter-- > 0) {
        changed = false;
        for (let i = -depth; i < depth; i++) {
            for (let j = -depth; j < depth; j++) {
                if (tryFillSquare(i, j)) changed = true;
            }
        }
    }

    // --- Draw squares (filled cells) ---
    for (let i = -depth; i < depth; i++) {
        for (let j = -depth; j < depth; j++) {
            const b = hEdges.get(`${i},${j}`);
            const l = vEdges.get(`${i},${j}`);
            const t = hEdges.get(`${i},${j + 1}`);
            const r = vEdges.get(`${i + 1},${j}`);

            if (b && l && t && r) {
                const [x1, y1] = toScreen(i, j);
                const isDegenerate = (b === t && l === r);
                const fillColor = isDegenerate
                    ? 'rgba(245, 158, 11, 0.06)'
                    : 'rgba(96, 165, 250, 0.04)';

                g.appendChild(S('rect', {
                    x: x1, y: y1 - cellSize,
                    width: cellSize, height: cellSize,
                    fill: fillColor,
                    stroke: 'rgba(255,255,255,0.03)',
                    'stroke-width': '0.5'
                }));
            }
        }
    }

    // --- Draw edges ---
    const drawEdge = (x1, y1, x2, y2, genKey, isHoriz) => {
        if (!genKey || !generators[genKey]) return;
        const color = generators[genKey].color;
        const [sx1, sy1] = toScreen(x1, y1);
        const [sx2, sy2] = toScreen(x2, y2);

        // Arrow with midpoint marker
        const mx = (sx1 + sx2) / 2;
        const my = (sy1 + sy2) / 2;

        g.appendChild(S('line', {
            x1: sx1, y1: sy1, x2: sx2, y2: sy2,
            stroke: color, 'stroke-width': '2', 'stroke-opacity': '0.7',
            class: 'sq-edge'
        }));

        // Arrow head
        const dx = sx2 - sx1, dy = sy2 - sy1;
        const len = Math.sqrt(dx * dx + dy * dy);
        if (len < 1) return;
        const nx = dx / len, ny = dy / len;
        const arrowSize = Math.min(6, cellSize * 0.12);
        const px = -ny, py = nx;

        g.appendChild(S('polygon', {
            points: `${mx + nx * arrowSize},${my + ny * arrowSize} ${mx - nx * arrowSize / 2 + px * arrowSize / 2},${my - ny * arrowSize / 2 + py * arrowSize / 2} ${mx - nx * arrowSize / 2 - px * arrowSize / 2},${my - ny * arrowSize / 2 - py * arrowSize / 2}`,
            fill: color, opacity: '0.8'
        }));
    };

    // Horizontal edges
    for (let i = -depth; i < depth; i++) {
        for (let j = -depth; j <= depth; j++) {
            const key = hEdges.get(`${i},${j}`);
            if (key) drawEdge(i, j, i + 1, j, key, true);
        }
    }

    // Vertical edges
    for (let i = -depth; i <= depth; i++) {
        for (let j = -depth; j < depth; j++) {
            const key = vEdges.get(`${i},${j}`);
            if (key) drawEdge(i, j, i, j + 1, key, false);
        }
    }

    // --- Draw vertices ---
    for (let i = -depth; i <= depth; i++) {
        for (let j = -depth; j <= depth; j++) {
            // Only draw if at least one edge touches this vertex
            const hasEdge = hEdges.has(`${i},${j}`) || hEdges.has(`${i - 1},${j}`) ||
                vEdges.has(`${i},${j}`) || vEdges.has(`${i},${j - 1}`);
            if (!hasEdge) continue;

            const [sx, sy] = toScreen(i, j);
            const r = Math.max(2, Math.min(5, cellSize * 0.08));
            const isOrigin = (i === 0 && j === 0);

            g.appendChild(S('circle', {
                cx: sx, cy: sy, r: isOrigin ? r * 2 : r,
                fill: isOrigin ? '#ffd700' : 'rgba(255,255,255,0.5)',
                stroke: isOrigin ? '#b8860b' : 'rgba(255,255,255,0.15)',
                'stroke-width': isOrigin ? '2' : '1',
                class: isOrigin ? 'sq-vertex sq-origin' : 'sq-vertex'
            }));
        }
    }

    return { totalRelations, degenerateCount, squaresFilled };
}
