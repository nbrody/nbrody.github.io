// vis_tree.js - Tree Visualization (SVG)

/**
 * Creates an SVG element with attributes
 */
function S(name, attrs = {}) {
    const el = document.createElementNS('http://www.w3.org/2000/svg', name);
    for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
    return el;
}

export function drawTree(container, p, path) {
    container.innerHTML = '';
    const width = container.clientWidth || 300;
    const height = container.clientHeight || 270;
    const cx = width / 2;
    const cy = height / 2;

    const svg = S('svg', { width, height, viewBox: `0 0 ${width} ${height}` });
    container.appendChild(svg);

    // Depth 4 is usually enough for background
    const maxDepth = 4;

    const drawNode = (x, y, level, angle) => {
        if (level > maxDepth) return;

        svg.appendChild(S('circle', { cx: x, cy: y, r: 4, fill: '#ccc' }));

        const numChildren = (level === 0) ? p + 1 : p;
        const length = 100 * Math.pow(0.5, level);

        let startAngle = 0;
        let angleStep = 0;

        if (level === 0) {
            angleStep = (2 * Math.PI) / numChildren;
            startAngle = 0;
        } else {
            const range = Math.PI * 0.8;
            angleStep = range / (numChildren);
            startAngle = angle - range / 2 + angleStep / 2;
        }

        for (let i = 0; i < numChildren; i++) {
            const childAngle = startAngle + i * angleStep;
            const nx = x + length * Math.cos(childAngle);
            const ny = y + length * Math.sin(childAngle);
            svg.appendChild(S('line', { x1: x, y1: y, x2: nx, y2: ny, stroke: '#eee', 'stroke-width': 1 }));
            drawNode(nx, ny, level + 1, childAngle);
        }
    };

    drawNode(cx, cy, 0, 0);

    // Draw active path
    if (path && path.length > 0) {
        let curX = cx, curY = cy, curAngle = 0;
        const pts = [{ x: cx, y: cy }];

        for (let i = 0; i < path.length; i++) {
            const step = path[i]; // index in {0..p}
            const level = i;
            const numChildren = (level === 0) ? p + 1 : p;
            const length = 100 * Math.pow(0.5, level);

            let startAngle = 0, angleStep = 0;
            if (level === 0) {
                angleStep = (2 * Math.PI) / numChildren;
                startAngle = 0;
            } else {
                const range = Math.PI * 0.8;
                angleStep = range / numChildren;
                startAngle = curAngle - range / 2 + angleStep / 2;
            }

            const childAngle = startAngle + step * angleStep;
            const nx = curX + length * Math.cos(childAngle);
            const ny = curY + length * Math.sin(childAngle);

            svg.appendChild(S('line', { x1: curX, y1: curY, x2: nx, y2: ny, stroke: '#27ae60', 'stroke-width': 3 }));
            curX = nx; curY = ny; curAngle = childAngle;
            pts.push({ x: nx, y: ny });
        }

        // Nodes in path
        pts.forEach((pt, i) => {
            svg.appendChild(S('circle', { cx: pt.x, cy: pt.y, r: 5, fill: i === pts.length - 1 ? '#e67e22' : '#27ae60' }));
        });
    }
}
