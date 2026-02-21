(function () {
    'use strict';

    // ============================================================
    // Configuration
    // ============================================================
    const NODE_RADIUS = 20;
    const HIT_RADIUS = 28;
    const EDGE_HIT_DIST = 10;
    const NODE_COLORS = [
        '#00e5ff', '#b388ff', '#69f0ae', '#ffab40',
        '#ff80ab', '#ffd740', '#40c4ff', '#ea80fc',
        '#84ffff', '#ccff90', '#ff9e80', '#a7ffeb'
    ];

    // ============================================================
    // Graph State
    // ============================================================
    let nodes = [];
    let edges = [];
    let nextNodeId = 1;
    let mode = 'add-node';
    let edgeStartNode = null;
    let dragNode = null;
    let dragOffset = { x: 0, y: 0 };
    let hoveredNode = null;
    let hoveredEdge = null;
    let pointerPos = { x: 0, y: 0 };
    let canvas, ctx, dpr;

    // ============================================================
    // Graph Management
    // ============================================================
    function addNode(x, y) {
        const id = nextNodeId++;
        nodes.push({ id, x, y, label: `s${id}` });
        onGraphChanged();
        return id;
    }

    function removeNode(id) {
        nodes = nodes.filter(n => n.id !== id);
        edges = edges.filter(e => e.from !== id && e.to !== id);
        onGraphChanged();
    }

    function addEdge(from, to, weight = 3) {
        if (from === to) return;
        if (edges.find(e => (e.from === from && e.to === to) || (e.from === to && e.to === from))) return;
        edges.push({ from, to, weight });
        onGraphChanged();
    }

    function removeEdge(from, to) {
        edges = edges.filter(e => !((e.from === from && e.to === to) || (e.from === to && e.to === from)));
        onGraphChanged();
    }

    function getEdge(from, to) {
        return edges.find(e => (e.from === from && e.to === to) || (e.from === to && e.to === from));
    }

    function clearGraph() {
        nodes = [];
        edges = [];
        nextNodeId = 1;
        edgeStartNode = null;
        onGraphChanged();
    }

    function getNodeById(id) {
        return nodes.find(n => n.id === id);
    }

    // ============================================================
    // Canvas Setup & Rendering
    // ============================================================
    function setupCanvas() {
        canvas = document.getElementById('graph-canvas');
        ctx = canvas.getContext('2d');
        dpr = window.devicePixelRatio || 1;
        resizeCanvas();
        window.addEventListener('resize', resizeCanvas);
    }

    function resizeCanvas() {
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.style.width = rect.width + 'px';
        canvas.width = rect.width * dpr;
        canvas.height = canvas.clientHeight * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        render();
    }

    function render() {
        const w = canvas.width / dpr;
        const h = canvas.height / dpr;
        ctx.clearRect(0, 0, w, h);
        drawGrid(w, h);

        // Empty state hint
        if (nodes.length === 0) {
            ctx.save();
            ctx.fillStyle = 'rgba(255,255,255,0.12)';
            ctx.font = '500 15px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Click to add nodes', w / 2, h / 2 - 10);
            ctx.font = '400 12px Inter, sans-serif';
            ctx.fillStyle = 'rgba(255,255,255,0.06)';
            ctx.fillText('or choose a preset below', w / 2, h / 2 + 14);
            ctx.restore();
        }

        // Draw edges
        for (const edge of edges) {
            drawEdge(edge, edge === hoveredEdge);
        }

        // Edge preview
        if (mode === 'add-edge' && edgeStartNode !== null) {
            const sn = getNodeById(edgeStartNode);
            if (sn) {
                ctx.save();
                ctx.strokeStyle = 'rgba(0,229,255,0.3)';
                ctx.lineWidth = 2;
                ctx.setLineDash([6, 4]);
                ctx.beginPath();
                ctx.moveTo(sn.x, sn.y);
                ctx.lineTo(pointerPos.x, pointerPos.y);
                ctx.stroke();
                ctx.setLineDash([]);
                ctx.restore();
            }
        }

        // Draw nodes
        for (let i = 0; i < nodes.length; i++) {
            drawNode(nodes[i], i, nodes[i] === hoveredNode || (edgeStartNode === nodes[i].id));
        }
    }

    function drawGrid(w, h) {
        ctx.save();
        ctx.fillStyle = 'rgba(255,255,255,0.015)';
        const sp = 30;
        for (let x = sp; x < w; x += sp) {
            for (let y = sp; y < h; y += sp) {
                ctx.beginPath();
                ctx.arc(x, y, 1, 0, Math.PI * 2);
                ctx.fill();
            }
        }
        ctx.restore();
    }

    function drawEdge(edge, hovered) {
        const a = getNodeById(edge.from);
        const b = getNodeById(edge.to);
        if (!a || !b) return;

        ctx.save();
        const isInf = edge.weight === Infinity;
        const baseAlpha = hovered ? 0.8 : 0.4;

        // Edge line
        if (isInf) {
            ctx.setLineDash([8, 5]);
            ctx.strokeStyle = hovered ? '#ffab40' : 'rgba(255,171,64,0.5)';
            ctx.lineWidth = hovered ? 3 : 2;
        } else if (edge.weight > 3) {
            ctx.strokeStyle = hovered ? '#b388ff' : `rgba(179,136,255,${baseAlpha})`;
            ctx.lineWidth = hovered ? 3 : 2;
        } else {
            ctx.strokeStyle = `rgba(255,255,255,${baseAlpha})`;
            ctx.lineWidth = hovered ? 2.5 : 1.5;
        }

        ctx.beginPath();
        ctx.moveTo(a.x, a.y);
        ctx.lineTo(b.x, b.y);
        ctx.stroke();
        ctx.setLineDash([]);

        // Weight label (only if > 3 or ∞)
        if (edge.weight !== 3) {
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            const label = isInf ? '∞' : String(edge.weight);

            // Background pill
            ctx.font = '600 13px JetBrains Mono, monospace';
            const tw = ctx.measureText(label).width;
            const px = 5, py = 3;
            ctx.fillStyle = 'rgba(10,11,20,0.85)';
            const rx = mx - tw / 2 - px;
            const ry = my - 8 - py;
            const rw = tw + px * 2;
            const rh = 16 + py * 2;
            ctx.beginPath();
            ctx.roundRect(rx, ry, rw, rh, 4);
            ctx.fill();

            ctx.fillStyle = isInf ? '#ffab40' : '#b388ff';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(label, mx, my);
        }
        ctx.restore();
    }

    function drawNode(node, index, highlighted) {
        ctx.save();
        const color = NODE_COLORS[index % NODE_COLORS.length];

        // Glow
        if (highlighted) {
            ctx.shadowColor = color;
            ctx.shadowBlur = 18;
        }

        // Fill
        ctx.beginPath();
        ctx.arc(node.x, node.y, NODE_RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = highlighted ? 'rgba(255,255,255,0.12)' : 'rgba(255,255,255,0.06)';
        ctx.fill();
        ctx.strokeStyle = color;
        ctx.lineWidth = highlighted ? 2.5 : 1.5;
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Label
        ctx.fillStyle = color;
        ctx.font = '600 12px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const sub = toSubscript(node.id);
        ctx.fillText('s' + sub, node.x, node.y);
        ctx.restore();
    }

    // ============================================================
    // Hit Testing
    // ============================================================
    function hitTestNode(x, y) {
        for (let i = nodes.length - 1; i >= 0; i--) {
            const dx = nodes[i].x - x, dy = nodes[i].y - y;
            if (dx * dx + dy * dy < HIT_RADIUS * HIT_RADIUS) return nodes[i];
        }
        return null;
    }

    function hitTestEdge(x, y) {
        for (const edge of edges) {
            const a = getNodeById(edge.from), b = getNodeById(edge.to);
            if (!a || !b) continue;
            const dist = pointToSegmentDist(x, y, a.x, a.y, b.x, b.y);
            if (dist < EDGE_HIT_DIST) return edge;
        }
        return null;
    }

    function pointToSegmentDist(px, py, ax, ay, bx, by) {
        const dx = bx - ax, dy = by - ay;
        const len2 = dx * dx + dy * dy;
        if (len2 === 0) return Math.hypot(px - ax, py - ay);
        let t = ((px - ax) * dx + (py - ay) * dy) / len2;
        t = Math.max(0, Math.min(1, t));
        return Math.hypot(px - (ax + t * dx), py - (ay + t * dy));
    }

    // ============================================================
    // Interaction
    // ============================================================
    function getCanvasPos(e) {
        const rect = canvas.getBoundingClientRect();
        const clientX = e.touches ? e.touches[0].clientX : e.clientX;
        const clientY = e.touches ? e.touches[0].clientY : e.clientY;
        return { x: clientX - rect.left, y: clientY - rect.top };
    }

    function setupInteraction() {
        canvas.addEventListener('pointerdown', onPointerDown);
        canvas.addEventListener('pointermove', onPointerMove);
        canvas.addEventListener('pointerup', onPointerUp);
        canvas.addEventListener('pointerleave', () => {
            hoveredNode = null;
            hoveredEdge = null;
            render();
        });
        // Prevent context menu
        canvas.addEventListener('contextmenu', e => e.preventDefault());
    }

    function onPointerDown(e) {
        const pos = getCanvasPos(e);
        const node = hitTestNode(pos.x, pos.y);
        const edge = hitTestEdge(pos.x, pos.y);

        if (mode === 'add-node') {
            if (!node) {
                addNode(pos.x, pos.y);
            } else {
                // Start dragging
                dragNode = node;
                dragOffset = { x: node.x - pos.x, y: node.y - pos.y };
                canvas.classList.add('dragging');
            }
        } else if (mode === 'move') {
            if (node) {
                dragNode = node;
                dragOffset = { x: node.x - pos.x, y: node.y - pos.y };
                canvas.classList.add('dragging');
            }
        } else if (mode === 'add-edge') {
            if (node) {
                if (edgeStartNode === null) {
                    edgeStartNode = node.id;
                    render();
                } else if (edgeStartNode !== node.id) {
                    const existing = getEdge(edgeStartNode, node.id);
                    if (existing) {
                        showEdgeModal(existing, true);
                    } else {
                        showEdgeModal({ from: edgeStartNode, to: node.id, weight: 3 }, false);
                    }
                    edgeStartNode = null;
                } else {
                    edgeStartNode = null;
                    render();
                }
            }
        } else if (mode === 'delete') {
            if (node) {
                removeNode(node.id);
            } else if (edge) {
                removeEdge(edge.from, edge.to);
            }
        }
    }

    function onPointerMove(e) {
        const pos = getCanvasPos(e);
        pointerPos = pos;

        if (dragNode) {
            dragNode.x = pos.x + dragOffset.x;
            dragNode.y = pos.y + dragOffset.y;
            render();
            return;
        }

        const prevHN = hoveredNode, prevHE = hoveredEdge;
        hoveredNode = hitTestNode(pos.x, pos.y);
        hoveredEdge = hoveredNode ? null : hitTestEdge(pos.x, pos.y);
        if (hoveredNode !== prevHN || hoveredEdge !== prevHE) render();

        // Update cursor
        if (mode === 'add-node') {
            canvas.style.cursor = hoveredNode ? 'grab' : 'crosshair';
        } else if (mode === 'move') {
            canvas.style.cursor = hoveredNode ? 'grab' : 'default';
        } else if (mode === 'add-edge') {
            canvas.style.cursor = hoveredNode ? 'pointer' : 'crosshair';
        } else if (mode === 'delete') {
            canvas.style.cursor = (hoveredNode || hoveredEdge) ? 'pointer' : 'default';
        }

        if (mode === 'add-edge' && edgeStartNode !== null) render();
    }

    function onPointerUp() {
        if (dragNode) {
            dragNode = null;
            canvas.classList.remove('dragging');
            onGraphChanged();
        }
    }

    // ============================================================
    // Edge Weight Modal
    // ============================================================
    let pendingEdge = null;
    let editingExisting = false;

    function showEdgeModal(edge, existing) {
        pendingEdge = { ...edge };
        editingExisting = existing;
        const overlay = document.getElementById('edge-modal');
        const titleEl = document.getElementById('modal-title');
        const sel = document.getElementById('weight-select');
        const delBtn = document.getElementById('modal-delete');

        const sFrom = getNodeById(edge.from), sTo = getNodeById(edge.to);
        titleEl.textContent = `Edge ${sFrom ? sFrom.label : '?'} — ${sTo ? sTo.label : '?'}`;
        sel.value = edge.weight === Infinity ? 'Infinity' : String(edge.weight);
        delBtn.style.display = existing ? '' : 'none';
        overlay.classList.add('visible');
        sel.focus();
    }

    function hideEdgeModal() {
        document.getElementById('edge-modal').classList.remove('visible');
        pendingEdge = null;
    }

    function confirmEdgeModal() {
        if (!pendingEdge) return;
        const sel = document.getElementById('weight-select');
        const val = sel.value;
        const weight = val === 'Infinity' ? Infinity : parseInt(val, 10);

        if (editingExisting) {
            const existing = getEdge(pendingEdge.from, pendingEdge.to);
            if (existing) existing.weight = weight;
            onGraphChanged();
        } else {
            addEdge(pendingEdge.from, pendingEdge.to, weight);
        }
        hideEdgeModal();
    }

    function deleteFromModal() {
        if (!pendingEdge) return;
        removeEdge(pendingEdge.from, pendingEdge.to);
        hideEdgeModal();
    }

    // ============================================================
    // Classification Engine
    // ============================================================
    function getConnectedComponents() {
        const visited = new Set();
        const components = [];
        for (const node of nodes) {
            if (visited.has(node.id)) continue;
            const comp = { nodeIds: [], edges: [] };
            const queue = [node.id];
            visited.add(node.id);
            while (queue.length > 0) {
                const cur = queue.shift();
                comp.nodeIds.push(cur);
                for (const edge of edges) {
                    let nbr = null;
                    if (edge.from === cur) nbr = edge.to;
                    else if (edge.to === cur) nbr = edge.from;
                    if (nbr !== null && !visited.has(nbr)) {
                        visited.add(nbr);
                        queue.push(nbr);
                    }
                }
            }
            comp.edges = edges.filter(e => comp.nodeIds.includes(e.from) && comp.nodeIds.includes(e.to));
            components.push(comp);
        }
        return components;
    }

    function buildAdj(nodeIds, edgeList) {
        const adj = {};
        for (const id of nodeIds) adj[id] = [];
        for (const e of edgeList) {
            adj[e.from].push({ to: e.to, w: e.weight });
            adj[e.to].push({ to: e.from, w: e.weight });
        }
        return adj;
    }

    function classifyComponent(comp) {
        const { nodeIds, edges: compEdges } = comp;
        const n = nodeIds.length;
        if (n === 0) return null;
        if (n === 1) return { type: 'A', sub: '1', finite: true, rank: 1 };

        const adj = buildAdj(nodeIds, compEdges);

        if (n === 2) {
            const w = compEdges[0].weight;
            if (w === Infinity) return { type: 'Ã', sub: '1', finite: false, affine: true, rank: 2 };
            if (w === 3) return { type: 'A', sub: '2', finite: true, rank: 2 };
            if (w === 4) return { type: 'B', sub: '2', finite: true, rank: 2 };
            if (w === 5) return { type: 'H', sub: '2', finite: true, rank: 2 };
            if (w === 6) return { type: 'G', sub: '2', finite: true, rank: 2 };
            return { type: 'I', sub: `₂(${w})`, finite: true, rank: 2, m: w };
        }

        // Check if tree
        const isTree = compEdges.length === n - 1;
        if (!isTree) {
            // Check Ã_n (cycle, all weight 3)
            if (compEdges.length === n) {
                const all3 = compEdges.every(e => e.weight === 3);
                const allDeg2 = nodeIds.every(id => adj[id].length === 2);
                if (all3 && allDeg2) return { type: 'Ã', sub: String(n - 1), finite: false, affine: true, rank: n };
            }
            return { type: '?', sub: '', finite: false, indefinite: true, rank: n };
        }

        const degrees = {};
        for (const id of nodeIds) degrees[id] = adj[id].length;
        const branchPts = nodeIds.filter(id => degrees[id] >= 3);

        if (branchPts.length > 1) return { type: '?', sub: '', finite: false, indefinite: true, rank: n };

        if (branchPts.length === 0) {
            // Linear path
            return classifyPath(nodeIds, compEdges, adj, n);
        }

        // One branch point
        const bp = branchPts[0];
        if (degrees[bp] > 3) return { type: '?', sub: '', finite: false, indefinite: true, rank: n };
        if (!compEdges.every(e => e.weight === 3)) return { type: '?', sub: '', finite: false, indefinite: true, rank: n };

        // Measure arm lengths
        const arms = adj[bp].map(nbr => {
            let len = 0, cur = nbr.to, prev = bp;
            while (true) {
                len++;
                const nxt = adj[cur].filter(x => x.to !== prev);
                if (nxt.length === 0) break;
                prev = cur;
                cur = nxt[0].to;
            }
            return len;
        }).sort((a, b) => a - b);

        const [p, q, r] = arms;
        if (p === 1 && q === 1) return { type: 'D', sub: String(n), finite: true, rank: n };
        if (p === 1 && q === 2 && r === 2) return { type: 'E', sub: '6', finite: true, rank: 6 };
        if (p === 1 && q === 2 && r === 3) return { type: 'E', sub: '7', finite: true, rank: 7 };
        if (p === 1 && q === 2 && r === 4) return { type: 'E', sub: '8', finite: true, rank: 8 };
        return { type: '?', sub: '', finite: false, indefinite: true, rank: n };
    }

    function classifyPath(nodeIds, compEdges, adj, n) {
        // Order along path
        const leaves = nodeIds.filter(id => adj[id].length === 1);
        if (leaves.length !== 2) return { type: '?', sub: '', finite: false, indefinite: true, rank: n };
        const ordered = [];
        let cur = leaves[0], prev = null;
        while (cur != null) {
            ordered.push(cur);
            const nxt = adj[cur].filter(x => x.to !== prev);
            prev = cur;
            cur = nxt.length > 0 ? nxt[0].to : null;
        }

        const weights = [];
        for (let i = 0; i < ordered.length - 1; i++) {
            const e = compEdges.find(e =>
                (e.from === ordered[i] && e.to === ordered[i + 1]) ||
                (e.from === ordered[i + 1] && e.to === ordered[i])
            );
            weights.push(e.weight);
        }

        if (weights.every(w => w === 3)) return { type: 'A', sub: String(n), finite: true, rank: n };

        const non3 = weights.map((w, i) => ({ w, i })).filter(x => x.w !== 3);
        if (non3.length === 1) {
            const { w, i: idx } = non3[0];
            const atEnd = idx === 0 || idx === weights.length - 1;
            if (w === 4 && atEnd) return { type: 'B', sub: String(n), finite: true, rank: n };
            if (w === 4 && n === 4) return { type: 'F', sub: '4', finite: true, rank: 4 };
            if (w === 5 && atEnd && n <= 4) return { type: 'H', sub: String(n), finite: true, rank: n };
            if (w === 6 && n === 2) return { type: 'G', sub: '2', finite: true, rank: 2 };
        }

        // Check if any weight is ∞
        if (weights.some(w => w === Infinity)) {
            return { type: '?', sub: '', finite: false, indefinite: true, rank: n };
        }
        return { type: '?', sub: '', finite: false, indefinite: true, rank: n };
    }

    function classifyGraph() {
        if (nodes.length === 0) return { components: [], overall: null };
        const comps = getConnectedComponents();
        const classified = comps.map(c => classifyComponent(c)).filter(Boolean);
        return { components: classified, overall: classified };
    }

    // ============================================================
    // Group Properties
    // ============================================================
    const GROUP_DATA = {
        A: n => ({ order: factorial(n + 1), coxeter: n + 1, exponents: range(1, n + 1) }),
        B: n => ({ order: Math.pow(2, n) * factorial(n), coxeter: 2 * n, exponents: range(1, 2 * n, 2) }),
        D: n => ({ order: Math.pow(2, n - 1) * factorial(n), coxeter: 2 * (n - 1), exponents: [...range(1, 2 * n - 2, 2), n - 1].sort((a, b) => a - b) }),
        E6: () => ({ order: 51840, coxeter: 12, exponents: [1, 4, 5, 7, 8, 11] }),
        E7: () => ({ order: 2903040, coxeter: 18, exponents: [1, 5, 7, 9, 11, 13, 17] }),
        E8: () => ({ order: 696729600, coxeter: 30, exponents: [1, 7, 11, 13, 17, 19, 23, 29] }),
        F4: () => ({ order: 1152, coxeter: 12, exponents: [1, 5, 7, 11] }),
        H3: () => ({ order: 120, coxeter: 10, exponents: [1, 5, 9] }),
        H4: () => ({ order: 14400, coxeter: 30, exponents: [1, 11, 19, 29] }),
        G2: () => ({ order: 12, coxeter: 6, exponents: [1, 5] }),
        I2: m => ({ order: 2 * m, coxeter: m, exponents: [1, m - 1] }),
    };

    function getProperties(info) {
        if (!info || !info.finite) return null;
        const t = info.type, n = parseInt(info.sub) || 0;
        if (t === 'A') return GROUP_DATA.A(n);
        if (t === 'B') return GROUP_DATA.B(n);
        if (t === 'D') return GROUP_DATA.D(n);
        if (t === 'E' && info.sub === '6') return GROUP_DATA.E6();
        if (t === 'E' && info.sub === '7') return GROUP_DATA.E7();
        if (t === 'E' && info.sub === '8') return GROUP_DATA.E8();
        if (t === 'F') return GROUP_DATA.F4();
        if (t === 'H' && info.sub === '3') return GROUP_DATA.H3();
        if (t === 'H' && info.sub === '4') return GROUP_DATA.H4();
        if (t === 'G') return GROUP_DATA.G2();
        if (t === 'I') return GROUP_DATA.I2(info.m || 5);
        return null;
    }

    function factorial(n) { let r = 1; for (let i = 2; i <= n; i++) r *= i; return r; }
    function range(start, end, step = 1) { const a = []; for (let i = start; i <= end; i += step) a.push(i); return a; }

    // ============================================================
    // Presentation Generation
    // ============================================================
    function getCoxeterMatrix() {
        const n = nodes.length;
        const M = Array.from({ length: n }, () => Array(n).fill(2));
        for (let i = 0; i < n; i++) M[i][i] = 1;
        for (const e of edges) {
            const i = nodes.findIndex(nd => nd.id === e.from);
            const j = nodes.findIndex(nd => nd.id === e.to);
            if (i >= 0 && j >= 0) { M[i][j] = e.weight; M[j][i] = e.weight; }
        }
        return M;
    }

    function generateCoxeterLatex() {
        if (nodes.length === 0) return '\\text{(empty graph)}';
        const gens = nodes.map((_, i) => `s_{${i + 1}}`).join(', \\, ');
        const rels = [];
        rels.push(nodes.map((_, i) => `s_{${i + 1}}^2`).join(' = ') + ' = 1');
        const M = getCoxeterMatrix();
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const m = M[i][j];
                if (m === 2) {
                    rels.push(`s_{${i + 1}} s_{${j + 1}} = s_{${j + 1}} s_{${i + 1}}`);
                } else if (m !== Infinity) {
                    rels.push(`(s_{${i + 1}} s_{${j + 1}})^{${m}} = 1`);
                }
            }
        }
        return `\\left\\langle \\, ${gens} \\;\\middle|\\; ${rels.join(',\\; ')} \\, \\right\\rangle`;
    }

    function generateArtinLatex() {
        if (nodes.length === 0) return '\\text{(empty graph)}';
        const gens = nodes.map((_, i) => `\\sigma_{${i + 1}}`).join(', \\, ');
        const rels = [];
        const M = getCoxeterMatrix();
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const m = M[i][j];
                if (m === 2) {
                    rels.push(`\\sigma_{${i + 1}} \\sigma_{${j + 1}} = \\sigma_{${j + 1}} \\sigma_{${i + 1}}`);
                } else if (m !== Infinity && m >= 3) {
                    const lhs = [], rhs = [];
                    for (let k = 0; k < m; k++) {
                        lhs.push(k % 2 === 0 ? `\\sigma_{${i + 1}}` : `\\sigma_{${j + 1}}`);
                        rhs.push(k % 2 === 0 ? `\\sigma_{${j + 1}}` : `\\sigma_{${i + 1}}`);
                    }
                    rels.push(`${lhs.join(' ')} = ${rhs.join(' ')}`);
                }
            }
        }
        if (rels.length === 0) return `\\left\\langle \\, ${gens} \\, \\right\\rangle \\quad \\text{(free group)}`;
        return `\\left\\langle \\, ${gens} \\;\\middle|\\; ${rels.join(',\\; ')} \\, \\right\\rangle`;
    }

    function generateMatrixHTML() {
        if (nodes.length === 0) return '<p style="color:var(--text-muted)">No nodes yet</p>';
        const M = getCoxeterMatrix();
        const n = nodes.length;
        let html = '<table class="matrix-table"><tr><th></th>';
        for (let j = 0; j < n; j++) html += `<th>s${toSubscript(j + 1)}</th>`;
        html += '</tr>';
        for (let i = 0; i < n; i++) {
            html += `<tr><th>s${toSubscript(i + 1)}</th>`;
            for (let j = 0; j < n; j++) {
                const v = M[i][j];
                const cls = i === j ? 'diag' : v === Infinity ? 'infinity' : v > 2 ? 'highlight' : '';
                const txt = v === Infinity ? '∞' : String(v);
                html += `<td class="${cls}">${txt}</td>`;
            }
            html += '</tr>';
        }
        html += '</table>';
        return html;
    }

    // ============================================================
    // Presets
    // ============================================================
    const PRESETS = {};

    function defPreset(name, nodeCount, edgeDefs, layoutFn) {
        PRESETS[name] = { nodeCount, edgeDefs, layoutFn };
    }

    function linearLayout(n, cx, cy, sp) {
        return Array.from({ length: n }, (_, i) => ({ x: cx - (n - 1) * sp / 2 + i * sp, y: cy }));
    }

    // A_n
    for (let n = 1; n <= 6; n++) {
        const edg = [];
        for (let i = 0; i < n - 1; i++) edg.push([i, i + 1, 3]);
        defPreset(`A${toSubscript(n)}`, n, edg, (cx, cy) => linearLayout(n, cx, cy, 60));
    }

    // B_n
    for (let n = 2; n <= 5; n++) {
        const edg = [];
        for (let i = 0; i < n - 1; i++) edg.push([i, i + 1, i === n - 2 ? 4 : 3]);
        defPreset(`B${toSubscript(n)}`, n, edg, (cx, cy) => linearLayout(n, cx, cy, 60));
    }

    // D_n
    for (let n = 4; n <= 6; n++) {
        const edg = [];
        for (let i = 0; i < n - 2; i++) edg.push([i, i + 1, 3]);
        edg.push([n - 3, n - 1, 3]); // Branch
        defPreset(`D${toSubscript(n)}`, n, edg, (cx, cy) => {
            const pts = linearLayout(n - 1, cx, cy, 60);
            const last = pts[pts.length - 1];
            pts.push({ x: last.x, y: last.y - 50 });
            pts[pts.length - 2].y += 25;
            pts[pts.length - 1].y = pts[pts.length - 2].y - 50;
            return pts;
        });
    }

    // E_6, E_7, E_8
    for (const en of [6, 7, 8]) {
        const edg = [];
        for (let i = 0; i < en - 2; i++) edg.push([i, i + 1, 3]);
        edg.push([2, en - 1, 3]); // Branch at node 2 (index 2)
        defPreset(`E${toSubscript(en)}`, en, edg, (cx, cy) => {
            const main = linearLayout(en - 1, cx, cy, 55);
            main.push({ x: main[2].x, y: main[2].y + 55 });
            return main;
        });
    }

    // F_4
    defPreset('F₄', 4, [[0, 1, 3], [1, 2, 4], [2, 3, 3]], (cx, cy) => linearLayout(4, cx, cy, 60));

    // H_3, H_4
    defPreset('H₃', 3, [[0, 1, 5], [1, 2, 3]], (cx, cy) => linearLayout(3, cx, cy, 60));
    defPreset('H₄', 4, [[0, 1, 5], [1, 2, 3], [2, 3, 3]], (cx, cy) => linearLayout(4, cx, cy, 60));

    // I_2(m)
    defPreset('I₂(5)', 2, [[0, 1, 5]], (cx, cy) => linearLayout(2, cx, cy, 80));
    defPreset('I₂(7)', 2, [[0, 1, 7]], (cx, cy) => linearLayout(2, cx, cy, 80));
    defPreset('I₂(∞)', 2, [[0, 1, Infinity]], (cx, cy) => linearLayout(2, cx, cy, 80));

    // Affine Ã
    defPreset('Ã₂', 3, [[0, 1, 3], [1, 2, 3], [2, 0, 3]], (cx, cy) => {
        const r = 45;
        return [0, 1, 2].map(i => ({ x: cx + r * Math.cos(i * 2 * Math.PI / 3 - Math.PI / 2), y: cy + r * Math.sin(i * 2 * Math.PI / 3 - Math.PI / 2) }));
    });

    function loadPreset(name) {
        const p = PRESETS[name];
        if (!p) return;
        clearGraph();
        const w = canvas.width / dpr, h = canvas.height / dpr;
        const positions = p.layoutFn(w / 2, h / 2);
        const ids = [];
        for (let i = 0; i < p.nodeCount; i++) {
            const pos = positions[i] || { x: w / 2, y: h / 2 };
            ids.push(addNode(pos.x, pos.y));
        }
        for (const [a, b, wt] of p.edgeDefs) {
            addEdge(ids[a], ids[b], wt);
        }
    }

    // ============================================================
    // UI Updates
    // ============================================================
    function onGraphChanged() {
        render();
        updateAnalysis();
    }

    function updateAnalysis() {
        const result = classifyGraph();
        updateClassificationPanel(result);
        updateActiveTab();
    }

    function updateClassificationPanel(result) {
        const container = document.getElementById('classification-content');
        if (!container) return;

        if (nodes.length === 0) {
            container.innerHTML = '<p style="color:var(--text-muted);text-align:center;padding:1rem 0">Add nodes to begin</p>';
            return;
        }

        const comps = result.components;
        const allFinite = comps.every(c => c.finite);
        const anyAffine = comps.some(c => c.affine);

        // Type name
        const typeName = comps.map(c => {
            if (c.type === '?') return `Unknown(${c.rank})`;
            return c.type + c.sub;
        }).join(' × ');

        const finiteClass = allFinite ? 'finite' : (anyAffine ? 'infinite' : 'infinite');
        const finiteLabel = allFinite ? '✦ Finite' : (anyAffine ? '∞ Affine' : '∞ Indefinite');

        let html = `<div style="display:flex;align-items:center;gap:0.8rem;flex-wrap:wrap;margin-bottom:0.8rem">
            <span class="classification-badge ${finiteClass}" style="font-size:1.3rem">${typeName}</span>
            <span class="classification-badge ${finiteClass}" style="font-size:0.8rem">${finiteLabel}</span>
        </div>`;

        // Properties grid
        html += '<div class="props-grid">';
        html += `<div class="prop-card"><div class="prop-label">Rank</div><div class="prop-value">${nodes.length}</div></div>`;
        html += `<div class="prop-card"><div class="prop-label">Components</div><div class="prop-value purple">${comps.length}</div></div>`;

        if (allFinite) {
            let totalOrder = 1;
            let coxNums = [];
            let allExps = [];
            for (const c of comps) {
                const props = getProperties(c);
                if (props) {
                    totalOrder *= props.order;
                    coxNums.push(props.coxeter);
                    allExps.push(...props.exponents);
                }
            }
            html += `<div class="prop-card"><div class="prop-label">Order |W|</div><div class="prop-value gold">${formatNumber(totalOrder)}</div></div>`;
            if (coxNums.length === 1) {
                html += `<div class="prop-card"><div class="prop-label">Coxeter №</div><div class="prop-value green">${coxNums[0]}</div></div>`;
            }
            const numRefs = allExps.reduce((s, x) => s + x, 0);
            html += `<div class="prop-card"><div class="prop-label">Reflections</div><div class="prop-value orange">${numRefs}</div></div>`;
            if (allExps.length > 0 && allExps.length <= 10) {
                html += `<div class="prop-card" style="grid-column:1/-1"><div class="prop-label">Exponents</div><div class="prop-value" style="font-size:0.9rem">${allExps.sort((a, b) => a - b).join(', ')}</div></div>`;
            }
        }
        html += '</div>';

        // Component tags
        if (comps.length > 1) {
            html += '<div style="margin-top:0.6rem"><span style="font-size:0.7rem;color:var(--text-muted);text-transform:uppercase;letter-spacing:0.08em;font-weight:600">Irreducible Factors</span><div class="component-list">';
            for (const c of comps) {
                const cls = c.finite ? 'finite' : (c.affine ? 'affine' : 'indefinite');
                const label = c.type === '?' ? `Unknown(${c.rank})` : c.type + c.sub;
                html += `<span class="component-tag ${cls}">${label}</span>`;
            }
            html += '</div></div>';
        }

        container.innerHTML = html;
    }

    function updateActiveTab() {
        const activeTab = document.querySelector('.tab-btn.active');
        if (!activeTab) return;
        const tabId = activeTab.dataset.tab;
        const content = document.getElementById(`tab-${tabId}`);
        if (!content) return;

        if (tabId === 'coxeter') {
            content.innerHTML = `<div class="presentation-block" id="coxeter-tex">$$${generateCoxeterLatex()}$$</div>`;
        } else if (tabId === 'artin') {
            content.innerHTML = `<div class="presentation-block" id="artin-tex">$$${generateArtinLatex()}$$</div>`;
        } else if (tabId === 'matrix') {
            content.innerHTML = `<div class="matrix-container">${generateMatrixHTML()}</div>`;
        }

        // Typeset MathJax
        if ((tabId === 'coxeter' || tabId === 'artin') && window.MathJax) {
            MathJax.typesetPromise([content]).catch(() => { });
        }
    }

    // ============================================================
    // Helpers
    // ============================================================
    function toSubscript(n) {
        const sub = '₀₁₂₃₄₅₆₇₈₉';
        return String(n).split('').map(d => sub[parseInt(d)]).join('');
    }

    function formatNumber(n) {
        if (n > 999999) return n.toExponential(2);
        return n.toLocaleString();
    }

    // ============================================================
    // UI Setup
    // ============================================================
    function setupUI() {
        // Mode buttons
        document.querySelectorAll('.tool-btn[data-mode]').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tool-btn[data-mode]').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                mode = btn.dataset.mode;
                edgeStartNode = null;
                render();
            });
        });

        // Clear all
        document.getElementById('btn-clear-all').addEventListener('click', clearGraph);

        // Tab buttons
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
                document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
                btn.classList.add('active');
                document.getElementById(`tab-${btn.dataset.tab}`).classList.add('active');
                updateActiveTab();
            });
        });

        // Preset gallery
        const gallery = document.getElementById('preset-gallery');
        for (const name of Object.keys(PRESETS)) {
            const chip = document.createElement('button');
            chip.className = 'preset-chip';
            chip.textContent = name;
            chip.addEventListener('click', () => loadPreset(name));
            gallery.appendChild(chip);
        }

        // Modal
        document.getElementById('modal-confirm').addEventListener('click', confirmEdgeModal);
        document.getElementById('modal-cancel').addEventListener('click', hideEdgeModal);
        document.getElementById('modal-delete').addEventListener('click', deleteFromModal);
        document.getElementById('edge-modal').addEventListener('click', e => {
            if (e.target === e.currentTarget) hideEdgeModal();
        });
        document.addEventListener('keydown', e => {
            if (document.getElementById('edge-modal').classList.contains('visible')) {
                if (e.key === 'Enter') confirmEdgeModal();
                if (e.key === 'Escape') hideEdgeModal();
            }
        });

        // Click edge to edit
        canvas.addEventListener('dblclick', e => {
            const pos = getCanvasPos(e);
            const edge = hitTestEdge(pos.x, pos.y);
            if (edge) showEdgeModal(edge, true);
        });
    }

    // ============================================================
    // Init
    // ============================================================
    function init() {
        setupCanvas();
        setupInteraction();
        setupUI();
        // Start with A₃ preset
        loadPreset('A₃');
    }

    document.addEventListener('DOMContentLoaded', init);
})();
