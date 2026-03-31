(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════
    // COLORS & CONFIG
    // ═══════════════════════════════════════════════════════════
    const C = {
        bg: '#060a14', text: '#f1f5f9', muted: '#94a3b8', dim: '#475569',
        accent: '#7c8aff', teal: '#2dd4bf', warm: '#f59e0b', rose: '#f472b6',
        node: '#151d2e', nodeBorder: 'rgba(124,138,255,0.3)',
        edge: 'rgba(148,163,184,0.25)', edgeHi: 'rgba(148,163,184,0.5)',
    };
    const ANIM_MS = 650;
    const R = 21; // node radius
    const SP = 58; // number spacing
    const N = 12; // how many numbers to show

    // ═══════════════════════════════════════════════════════════
    // STEPS
    // ═══════════════════════════════════════════════════════════
    const STEPS = [
        // Scene 0: Naturals
        { scene: 0, title: 'The Natural Numbers',
          desc: 'The natural numbers ℕ = {1, 2, 3, 4, 5, …} form an infinite sequence.' },
        { scene: 0, title: 'Odds and Evens',
          desc: 'Color the odd numbers and even numbers differently.' },
        { scene: 0, title: 'Separate',
          desc: 'Pull them apart into two rows.' },
        { scene: 0, title: 'Two Copies of ℕ',
          desc: 'Relabel each row 1, 2, 3, … — each is a complete copy of ℕ. One infinity = two infinities!' },
        // Scene 1: Tree
        { scene: 1, title: 'An Infinite Binary Tree',
          desc: 'A binary tree T: each node has exactly two children, branching forever.' },
        { scene: 1, title: 'Left and Right Subtrees',
          desc: 'The root connects a left subtree (teal) and a right subtree (pink).' },
        { scene: 1, title: 'Remove the Root',
          desc: 'Take away the root. The tree splits into two separate pieces.' },
        { scene: 1, title: 'Each Subtree ≅ T',
          desc: 'Each piece is itself a complete binary tree! One tree → two trees (minus one point).' },
        // Scene 2: Sphere
        { scene: 2, title: 'The Sphere',
          desc: 'A sphere S², acted on by rotations. Two rotations a, b generate a free group.' },
        { scene: 2, title: 'Four Pieces',
          desc: 'Partition the sphere into four pieces by which generator "reaches" each point first.' },
        { scene: 2, title: 'Rearrange',
          desc: 'Pair them up: {Wₐ, Wₐ⁻¹} and {W_b, W_b⁻¹}. Rotate one piece in each pair.' },
        { scene: 2, title: 'Two Spheres!',
          desc: 'Each pair reassembles into a complete sphere. One sphere → two spheres!' },
    ];
    const TOTAL = STEPS.length;

    // ═══════════════════════════════════════════════════════════
    // STATE
    // ═══════════════════════════════════════════════════════════
    let step = 0, t = 1, animStart = 0;
    const canvas = document.getElementById('canvas');
    const ctx = canvas.getContext('2d');
    let W = 800, H = 500;

    // ═══════════════════════════════════════════════════════════
    // CANVAS SETUP
    // ═══════════════════════════════════════════════════════════
    function resize() {
        const dpr = window.devicePixelRatio || 1;
        const rect = canvas.parentElement.getBoundingClientRect();
        canvas.width = rect.width * dpr;
        canvas.height = rect.height * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        W = rect.width; H = rect.height;
    }
    window.addEventListener('resize', resize);

    // ═══════════════════════════════════════════════════════════
    // EASING & LERP
    // ═══════════════════════════════════════════════════════════
    function ease(x) { return x < 0.5 ? 4*x*x*x : 1 - Math.pow(-2*x+2,3)/2; }
    function lerp(a, b, t) { return a + (b - a) * t; }
    function lerpColor(c1, c2, t) {
        // Simple hex lerp
        const p = (s, i) => parseInt(s.slice(1+i*2, 3+i*2), 16);
        const r = Math.round(lerp(p(c1,0), p(c2,0), t));
        const g = Math.round(lerp(p(c1,1), p(c2,1), t));
        const b = Math.round(lerp(p(c1,2), p(c2,2), t));
        return `rgb(${r},${g},${b})`;
    }

    // ═══════════════════════════════════════════════════════════
    // DRAWING HELPERS
    // ═══════════════════════════════════════════════════════════
    function drawCircle(x, y, r, fill, stroke, alpha = 1) {
        ctx.globalAlpha = alpha;
        ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
        ctx.fillStyle = fill; ctx.fill();
        ctx.strokeStyle = stroke; ctx.lineWidth = 1.5; ctx.stroke();
        ctx.globalAlpha = 1;
    }
    function drawText(txt, x, y, size, color, alpha = 1, align = 'center') {
        ctx.globalAlpha = alpha;
        ctx.font = `600 ${size}px Inter, sans-serif`;
        ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = 'middle';
        ctx.fillText(txt, x, y);
        ctx.globalAlpha = 1;
    }
    function drawLine(x1, y1, x2, y2, color, width = 1.5, alpha = 1) {
        ctx.globalAlpha = alpha;
        ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2);
        ctx.strokeStyle = color; ctx.lineWidth = width; ctx.stroke();
        ctx.globalAlpha = 1;
    }
    function drawEllipsis(x, y, color, alpha = 1) {
        for (let i = 0; i < 3; i++) {
            ctx.globalAlpha = alpha * (1 - i * 0.15);
            ctx.beginPath(); ctx.arc(x + i * 10, y, 3, 0, Math.PI * 2);
            ctx.fillStyle = color; ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    // ═══════════════════════════════════════════════════════════
    // SCENE 0: NATURAL NUMBERS
    // ═══════════════════════════════════════════════════════════
    function centeredX(i, count) { return W / 2 + (i - (count - 1) / 2) * SP; }

    function renderNaturals(localStep, t) {
        const e = ease(t);
        const cy = H / 2;
        const rowGap = Math.min(70, H * 0.12);

        // Build per-number state
        for (let i = 0; i < N; i++) {
            const val = i + 1;
            const isOdd = val % 2 !== 0;
            const halfIdx = isOdd ? Math.floor(i / 2) : Math.floor(i / 2);

            // Position
            let x = centeredX(i, N);
            let y = cy;
            let col = C.accent;
            let label = '' + val;
            let alpha = 1;

            if (localStep >= 1) {
                col = isOdd ? C.teal : C.warm;
            }
            if (localStep >= 2) {
                const targetX = centeredX(halfIdx, N / 2);
                const targetY = isOdd ? cy - rowGap : cy + rowGap;
                if (localStep === 2) {
                    x = lerp(centeredX(i, N), targetX, e);
                    y = lerp(cy, targetY, e);
                } else {
                    x = targetX; y = targetY;
                }
            }
            if (localStep === 1 && t < 1) {
                col = lerpColor(C.accent, isOdd ? C.teal : C.warm, e);
            }
            if (localStep >= 3) {
                label = '' + (halfIdx + 1);
            }

            // Draw
            drawCircle(x, y, R, C.node, localStep >= 1 ? col : C.nodeBorder, alpha);
            const labelAlpha = (localStep === 3 && t < 1) ? e : 1;
            // During relabel, fade old out and new in
            if (localStep === 3 && t < 1) {
                drawText('' + val, x, y, 13, C.text, 1 - e);
                drawText('' + (halfIdx + 1), x, y, 13, C.text, e);
            } else {
                drawText(label, x, y, 13, C.text);
            }
        }

        // Ellipsis
        if (localStep < 2) {
            const ex = centeredX(N, N) + 8;
            drawEllipsis(ex, cy, C.muted);
        } else {
            const ex = centeredX(N / 2, N / 2) + 8;
            const topY = cy - rowGap, botY = cy + rowGap;
            const elAlpha = localStep === 2 ? e : 1;
            drawEllipsis(ex, topY, C.teal, elAlpha);
            drawEllipsis(ex, botY, C.warm, elAlpha);
        }

        // Row labels for step 3
        if (localStep >= 3) {
            const lx = centeredX(0, N / 2) - 45;
            const a = localStep === 3 ? e : 1;
            drawText('ℕ =', lx, cy - rowGap, 16, C.teal, a, 'right');
            drawText('ℕ =', lx, cy + rowGap, 16, C.warm, a, 'right');
        }

        // Big label
        if (localStep === 0) {
            drawText('ℕ = { 1, 2, 3, 4, … }', W / 2, cy - rowGap - 50, 20, C.muted, localStep === 0 ? (t < 1 ? e : 1) : 1);
        }
        if (localStep === 3 && t >= 0.5) {
            const fa = ease((t - 0.5) * 2);
            drawText('ℕ  ↔  ℕ ⊔ ℕ', W / 2, cy + rowGap + 55, 18, C.accent, fa);
        }
    }

    // ═══════════════════════════════════════════════════════════
    // SCENE 1: BINARY TREE
    // ═══════════════════════════════════════════════════════════
    let treeNodes = [], treeEdges = [];

    function buildTree() {
        treeNodes = []; treeEdges = [];
        const baseSpread = Math.min(140, W * 0.15);
        const dy = Math.min(65, H * 0.12);
        function add(pid, x, y, sp, d, sub) {
            const idx = treeNodes.length;
            treeNodes.push({ x, y, d, sub });
            if (pid >= 0) treeEdges.push([pid, idx]);
            if (d < 3) {
                add(idx, x - sp, y + dy, sp * 0.5, d + 1, sub || 'L');
                add(idx, x + sp, y + dy, sp * 0.5, d + 1, sub || 'R');
            }
        }
        const treeTop = H * 0.18;
        add(-1, W / 2, treeTop, baseSpread, 0, 'root');
    }

    function renderTree(localStep, t) {
        const e = ease(t);
        const slideX = Math.min(120, W * 0.12);

        // Compute node positions & appearance
        for (let ei = 0; ei < treeEdges.length; ei++) {
            const [pi, ci] = treeEdges[ei];
            const pn = treeNodes[pi], cn = treeNodes[ci];
            let px = pn.x, py = pn.y, cx = cn.x, cy = cn.y;
            let alpha = 1;
            let col = C.edge;

            if (localStep >= 2) {
                if (pn.sub === 'root') { alpha = 1 - (localStep === 2 ? e : 1); }
                const offL = localStep === 2 ? -slideX * e : -slideX;
                const offR = localStep === 2 ? slideX * e : slideX;
                if (pn.sub === 'L' || (pn.sub === 'root' && cn.sub === 'L')) px += (pn.sub === 'root' ? 0 : offL);
                if (pn.sub === 'R' || (pn.sub === 'root' && cn.sub === 'R')) px += (pn.sub === 'root' ? 0 : offR);
                if (cn.sub === 'L') cx += offL;
                if (cn.sub === 'R') cx += offR;
            }
            if (localStep >= 1) {
                if (cn.sub === 'L') col = C.teal;
                else if (cn.sub === 'R') col = C.rose;
            }
            if (localStep === 1 && t < 1) col = C.edge;

            const lineAlpha = localStep === 1 ? lerp(0.25, 0.5, e) : (alpha > 0.01 ? 0.5 : 0);
            drawLine(px, py, cx, cy, localStep >= 1 ? (cn.sub === 'L' ? C.teal : cn.sub === 'R' ? C.rose : C.edge) : C.edge,
                1.5, lineAlpha * alpha);
        }

        for (let ni = 0; ni < treeNodes.length; ni++) {
            const nd = treeNodes[ni];
            let x = nd.x, y = nd.y;
            let col = C.nodeBorder;
            let alpha = 1;

            if (localStep >= 1) {
                if (nd.sub === 'root') col = C.warm;
                else if (nd.sub === 'L') col = C.teal;
                else col = C.rose;
            }
            if (localStep === 1 && t < 1) col = lerpColor('#7c8aff', nd.sub === 'root' ? C.warm : nd.sub === 'L' ? C.teal : C.rose, e);

            if (localStep >= 2) {
                if (nd.sub === 'root') {
                    alpha = 1 - (localStep === 2 ? e : 1);
                    const s = 1 - (localStep === 2 ? e * 0.5 : 0.5);
                }
                const off = localStep === 2 ? slideX * e : slideX;
                if (nd.sub === 'L') x -= off;
                if (nd.sub === 'R') x += off;
            }

            if (alpha > 0.01) {
                drawCircle(x, y, R * 0.6, C.node, col, alpha);
            }
        }

        // Step 3: labels
        if (localStep >= 3) {
            const a = localStep === 3 ? e : 1;
            const leftCx = W / 2 - slideX;
            const rightCx = W / 2 + slideX;
            const labelY = treeNodes[0].y - 30;
            drawText('≅ T', leftCx, labelY, 20, C.teal, a);
            drawText('≅ T', rightCx, labelY, 20, C.rose, a);
            if (t >= 0.4) {
                const fa = ease((t - 0.4) / 0.6);
                const botY = treeNodes[treeNodes.length - 1].y + 50;
                drawText('T  =  T  ⊔  T  ⊔ {pt}', W / 2, botY, 18, C.accent, fa * a);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // SCENE 2: SPHERE
    // ═══════════════════════════════════════════════════════════
    function drawSphere(cx, cy, r, colors, alpha) {
        // colors: array of {start, end, color} arcs, or null for solid
        ctx.globalAlpha = alpha;
        if (!colors) {
            const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.1, cx, cy, r);
            grad.addColorStop(0, '#3b4a7a');
            grad.addColorStop(0.7, '#1a2444');
            grad.addColorStop(1, '#0d1321');
            ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fillStyle = grad; ctx.fill();
            ctx.strokeStyle = C.accent; ctx.lineWidth = 2; ctx.stroke();
        } else {
            for (const seg of colors) {
                ctx.beginPath();
                ctx.moveTo(cx, cy);
                ctx.arc(cx, cy, r, seg.start, seg.end);
                ctx.closePath();
                ctx.fillStyle = seg.color; ctx.fill();
            }
            ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(241,245,249,0.2)'; ctx.lineWidth = 2; ctx.stroke();
            // highlight ring
            const grad = ctx.createRadialGradient(cx - r * 0.3, cy - r * 0.3, r * 0.05, cx, cy, r);
            grad.addColorStop(0, 'rgba(255,255,255,0.12)');
            grad.addColorStop(0.5, 'rgba(255,255,255,0.03)');
            grad.addColorStop(1, 'rgba(0,0,0,0.15)');
            ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fillStyle = grad; ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    const PIECE_COLORS = [
        { label: 'Wₐ', color: 'rgba(124,138,255,0.55)' },    // accent
        { label: 'Wₐ⁻¹', color: 'rgba(45,212,191,0.55)' },   // teal
        { label: 'W_b', color: 'rgba(245,158,11,0.55)' },     // warm
        { label: 'W_b⁻¹', color: 'rgba(244,114,182,0.55)' },  // rose
    ];

    function renderSphere(localStep, t) {
        const e = ease(t);
        const cx = W / 2, cy = H / 2;
        const r = Math.min(120, W * 0.12, H * 0.2);

        if (localStep === 0) {
            drawSphere(cx, cy, r, null, 1);
            const a = t < 1 ? e : 1;
            drawText('S²', cx, cy, 28, 'rgba(241,245,249,0.6)', a);
        }

        if (localStep === 1) {
            const segs = PIECE_COLORS.map((p, i) => ({
                start: (i * Math.PI / 2) - Math.PI / 2,
                end: ((i + 1) * Math.PI / 2) - Math.PI / 2,
                color: p.color,
            }));
            drawSphere(cx, cy, r, segs, 1);
            // Labels
            const labelR = r * 0.6;
            const angles = [-Math.PI / 4, Math.PI / 4, 3 * Math.PI / 4, -3 * Math.PI / 4];
            PIECE_COLORS.forEach((p, i) => {
                const a = angles[i];
                const lx = cx + Math.cos(a) * labelR;
                const ly = cy + Math.sin(a) * labelR;
                drawText(p.label, lx, ly, 13, C.text, e);
            });
        }

        if (localStep === 2) {
            const gap = lerp(0, Math.min(80, W * 0.08), e);
            // Left pair: Wₐ + Wₐ⁻¹
            const lx = cx - gap, rx = cx + gap;
            const segsL = [
                { start: -Math.PI / 2, end: 0, color: PIECE_COLORS[0].color },
                { start: 0, end: Math.PI / 2, color: PIECE_COLORS[1].color },
            ];
            const segsR = [
                { start: Math.PI / 2, end: Math.PI, color: PIECE_COLORS[2].color },
                { start: -Math.PI, end: -Math.PI / 2, color: PIECE_COLORS[3].color },
            ];
            drawSphere(lx, cy, r, segsL, 1);
            drawSphere(rx, cy, r, segsR, 1);
            drawText('{Wₐ, Wₐ⁻¹}', lx, cy + r + 25, 13, C.accent, e);
            drawText('{W_b, W_b⁻¹}', rx, cy + r + 25, 13, C.warm, e);
            // Arrow labels
            if (e > 0.5) {
                const fa = ease((e - 0.5) * 2);
                drawText('rotate by a⁻¹', lx, cy - r - 18, 11, C.teal, fa);
                drawText('rotate by b⁻¹', rx, cy - r - 18, 11, C.rose, fa);
            }
        }

        if (localStep === 3) {
            const gap = Math.min(130, W * 0.14);
            const lx = cx - gap, rx = cx + gap;
            const sr = r * (localStep === 3 && t < 1 ? lerp(0.7, 1, e) : 1);
            drawSphere(lx, cy, sr, null, 1);
            drawSphere(rx, cy, sr, null, 1);
            drawText('S²', lx, cy, 24, 'rgba(241,245,249,0.6)', e);
            drawText('S²', rx, cy, 24, 'rgba(241,245,249,0.6)', e);
            // Equality
            if (e > 0.3) {
                const fa = ease((e - 0.3) / 0.7);
                drawText('S²  ↔  S²  ⊔  S²', cx, cy + sr + 50, 20, C.accent, fa);
            }
        }
    }

    // ═══════════════════════════════════════════════════════════
    // MAIN RENDER
    // ═══════════════════════════════════════════════════════════
    function render(now) {
        // Update animation
        if (t < 1) t = Math.min(1, (now - animStart) / ANIM_MS);

        ctx.clearRect(0, 0, W, H);

        const s = STEPS[step];
        const sceneStart = STEPS.findIndex(st => st.scene === s.scene);
        const localStep = step - sceneStart;

        if (s.scene === 0) renderNaturals(localStep, t);
        else if (s.scene === 1) renderTree(localStep, t);
        else renderSphere(localStep, t);

        requestAnimationFrame(render);
    }

    // ═══════════════════════════════════════════════════════════
    // NAVIGATION
    // ═══════════════════════════════════════════════════════════
    function goTo(n) {
        if (n < 0 || n >= TOTAL) return;
        step = n; t = 0; animStart = performance.now();
        updateUI();
    }
    window.next = () => goTo(step + 1);
    window.prev = () => goTo(step - 1);

    function updateUI() {
        const s = STEPS[step];
        document.getElementById('description').textContent = s.desc;
        document.getElementById('prev-btn').disabled = step === 0;
        document.getElementById('next-btn').disabled = step === TOTAL - 1;
        // Scene tabs
        document.querySelectorAll('.scene-tab').forEach(btn => {
            btn.classList.toggle('active', parseInt(btn.dataset.scene) === s.scene);
        });
        // Dots
        const dotsEl = document.getElementById('dots');
        dotsEl.innerHTML = '';
        for (let i = 0; i < TOTAL; i++) {
            const d = document.createElement('div');
            d.className = 'dot' + (i === step ? ' active' : '');
            d.onclick = () => goTo(i);
            d.style.cursor = 'pointer';
            dotsEl.appendChild(d);
        }
    }

    // Scene tab clicks
    document.querySelectorAll('.scene-tab').forEach(btn => {
        btn.addEventListener('click', () => {
            const scene = parseInt(btn.dataset.scene);
            const idx = STEPS.findIndex(s => s.scene === scene);
            if (idx >= 0) goTo(idx);
        });
    });

    // Keyboard nav
    document.addEventListener('keydown', e => {
        if (e.key === 'ArrowRight' || e.key === ' ') { e.preventDefault(); window.next(); }
        if (e.key === 'ArrowLeft') { e.preventDefault(); window.prev(); }
    });

    // postMessage nav (for iframe embedding)
    window.addEventListener('message', e => {
        if (e.data === 'next' || e.data === 'right') window.next();
        if (e.data === 'prev' || e.data === 'left') window.prev();
    });

    // ═══════════════════════════════════════════════════════════
    // INIT
    // ═══════════════════════════════════════════════════════════
    resize();
    buildTree();
    updateUI();
    requestAnimationFrame(render);

    // Rebuild tree on resize (positions depend on canvas size)
    window.addEventListener('resize', () => { buildTree(); });
})();
