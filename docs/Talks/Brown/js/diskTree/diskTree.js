/**
 * DiskTreeViz: Visualization of the p-adic tree (Bruhat-Tits tree)
 * isometrically embedded in the Poincaré Disk with a central vertex.
 */

class DiskTreeViz {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.p = 2;
        this.nodes = [];
        this.maxDepth = 5;
        this.stepDistance = 1.0; // Hyperbolic step distance
        this.view = { x: 0, y: 0, scale: 0.9, rotation: 0 };
        this.mouseState = { isDragging: false, lastX: 0, lastY: 0 };
        this.baseMat = new BigMat(1, 0, 0, 1);

        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.setupControls();
        this.reset();
        this.animate();
    }

    resize() {
        this.canvas.width = this.canvas.clientWidth * window.devicePixelRatio;
        this.canvas.height = this.canvas.clientHeight * window.devicePixelRatio;
        this.centerX = this.canvas.width / 2;
        this.centerY = this.canvas.height / 2;
        this.radius = Math.min(this.canvas.width, this.canvas.height) * 0.45;
    }

    setupControls() {
        this.canvas.addEventListener('mousedown', e => {
            this.mouseState.isDragging = true;
            this.mouseState.lastX = e.clientX;
            this.mouseState.lastY = e.clientY;
        });

        window.addEventListener('mouseup', () => this.mouseState.isDragging = false);

        window.addEventListener('mousemove', e => {
            if (this.mouseState.isDragging) {
                const dx = e.clientX - this.mouseState.lastX;
                const dy = e.clientY - this.mouseState.lastY;
                this.view.x += dx;
                this.view.y += dy;
                this.mouseState.lastX = e.clientX;
                this.mouseState.lastY = e.clientY;
            }
            this.updateTooltip(e);
        });

        this.canvas.addEventListener('wheel', e => {
            e.preventDefault();
            const rect = this.canvas.getBoundingClientRect();
            const dpr = window.devicePixelRatio;

            // Cursor position in pixels relative to center
            const mx = (e.clientX - rect.left) * dpr - this.centerX;
            const my = (e.clientY - rect.top) * dpr - this.centerY;

            // Mouse position relative to the view offset
            const mouseXBefore = mx - this.view.x * dpr;
            const mouseYBefore = my - this.view.y * dpr;

            const zoom = e.deltaY < 0 ? 1.05 : 0.95;
            const oldScale = this.view.scale;
            this.view.scale = Math.max(0.01, Math.min(100.0, this.view.scale * zoom));

            const scaleFactor = this.view.scale / oldScale;

            // Update view offsets to keep the cursor centered
            this.view.x = (mx - mouseXBefore * scaleFactor) / dpr;
            this.view.y = (my - mouseYBefore * scaleFactor) / dpr;
        }, { passive: false });
    }

    reset() {
        this.p = parseInt(document.getElementById('prime-p')?.value) || 2;
        this.maxDepth = parseInt(document.getElementById('max-depth')?.value) || 5;
        this.stepDistance = parseFloat(document.getElementById('step-dist')?.value) || 1.0;
        this.tooltip = document.getElementById('tooltip');

        this.nodes = [];
        this.baseMat = new BigMat(1, 0, 0, 1);
        this.buildTree();
    }

    // Helper for vertex labeling
    safePow(p, n) {
        if (typeof BigFrac === 'undefined') return Math.pow(p, n);
        const pBig = BigInt(p);
        if (n >= 0) return new BigFrac(pBig ** BigInt(n));
        return new BigFrac(1n, pBig ** BigInt(-n));
    }

    buildTree() {
        const p = this.p;
        const maxDepth = this.maxDepth;
        const dist = this.stepDistance;
        const getR = (n) => Math.tanh(n * dist / 2);

        const colors = [
            'hsl(220, 80%, 60%)', // Level 0
            'hsl(190, 80%, 60%)', // Level 1
            'hsl(160, 80%, 60%)', // Level 2
            'hsl(130, 80%, 60%)', // Level 3
            'hsl(100, 80%, 60%)', // Level 4
            'hsl(70, 80%, 60%)',  // Level 5
            'hsl(40, 80%, 60%)',  // Level 6
            'hsl(10, 80%, 60%)'   // Level 7
        ];

        // Recursive build function
        // n: level, mat: current matrix, angle: center angle, budget: angular width, parentIdx: index of parent node, prevMat: to avoid backtrack
        const build = (n, mat, angle, budget, parentIdx, prevMat = null) => {
            const r = getR(n);
            const nodeIdx = this.nodes.length;
            const pos = (n === 0) ? { x: 0, y: 0, angle: 0 } : this.getCanonicalPos(mat);

            this.nodes.push({
                level: n,
                refMat: mat, // Store the reference matrix for the fixed layout
                mat: mat,    // Label matrix (starts as refMat)
                parentIdx: parentIdx,
                x: pos.x,
                y: pos.y,
                targetX: pos.x,
                targetY: pos.y,
                origX: pos.x,
                origY: pos.y,
                color: colors[n % colors.length]
            });

            if (n >= maxDepth) return;

            // Neighbors of I are [p, u, 0, 1] for u=0..p-1 and [1, 0, 0, p]
            const generators = [];
            for (let u = 0; u < p; u++) generators.push(new BigMat(this.safePow(p, 1), u, 0, 1));
            generators.push(new BigMat(1, 0, 0, this.safePow(p, 1)));

            if (n === 0) {
                const delta = (2 * Math.PI) / (p + 1);
                for (let i = 0; i < generators.length; i++) {
                    build(n + 1, generators[i], i * delta, delta, nodeIdx, mat);
                }
            } else {
                const delta = budget / p;
                const startAngle = angle - budget / 2 + delta / 2;
                let childCount = 0;

                // For each neighbor, check if it's the parent
                for (let G of generators) {
                    const next = mat.mul(G);

                    // Check equivalence: next and prevMat represent same vertex if next * prevMat^-1 is in PGL2(Zp)
                    // Simplified: just check entries. We know the tree structure is locally correct if we don't go back.
                    // The "back" generator is the one such that mat = parent * G_parent, so G = G_parent^-1
                    // Since we don't store G_parent easily, we do a matrix comparison.
                    if (prevMat) {
                        const test = next.mul(new BigMat(prevMat.d, prevMat.b.neg(), prevMat.c.neg(), prevMat.a));
                        const iwa = test.getOrientedIwasawa(p);
                        if (iwa.n === 0 && iwa.q.n === 0n) continue; // It's equivalent to prevMat
                    }

                    if (childCount < p) {
                        build(n + 1, next, startAngle + childCount * delta, delta, nodeIdx, mat);
                        childCount++;
                    }
                }
            }
        };

        build(0, new BigMat(1, 0, 0, 1), 0, 2 * Math.PI, -1);
    }

    // Calculate canonical position for any matrix M
    getCanonicalPos(M) {
        const p = this.p;
        const dist = this.stepDistance;
        const getR = (n) => Math.tanh(n * dist / 2);

        // 1. Normalize M
        let a = M.a, b = M.b, c = M.c, d = M.d;
        let v = Math.min(a.val(p), b.val(p), c.val(p), d.val(p));
        // Power of p is a BigFrac
        const scale = this.safePow(p, v);
        let M_prim = new BigMat(a.div(scale), b.div(scale), c.div(scale), d.div(scale));

        // 2. Distance from origin
        let det = M_prim.a.mul(M_prim.d).sub(M_prim.b.mul(M_prim.c));
        let D = det.val(p);
        const r = getR(D);

        if (D === 0) return { x: 0, y: 0, angle: 0 };

        // 3. Find the path I -> ... -> M
        // The standard neighbors of Identity
        const neighbors_of_I = [];
        for (let u = 0; u < p; u++) neighbors_of_I.push(new BigMat(this.safePow(p, 1), u, 0, 1));
        neighbors_of_I.push(new BigMat(1, 0, 0, this.safePow(p, 1)));

        // Find which neighbor of I is on the path to M
        let firstNeighborIdx = -1;
        for (let i = 0; i < neighbors_of_I.length; i++) {
            const G = neighbors_of_I[i];
            // Test distance: d(G, M) = d(I, G^-1 * M)
            // G^-1 = [[1, -u], [0, p]] / p  or  [[p, 0], [0, 1]] / p
            let G_inv;
            if (i < p) {
                G_inv = new BigMat(1, -i, 0, p); // Scalar p doesn't matter for d
            } else {
                G_inv = new BigMat(p, 0, 0, 1);
            }
            const test = G_inv.mul(M_prim);
            const test_v = Math.min(test.a.val(p), test.b.val(p), test.c.val(p), test.d.val(p));
            const test_det = test.a.mul(test.d).sub(test.b.mul(test.c));
            const test_D = test_det.val(p) - 2 * test_v;

            if (test_D === D - 1) {
                firstNeighborIdx = i;
                break;
            }
        }

        const delta_root = (2 * Math.PI) / (p + 1);
        let currentAngle = firstNeighborIdx * delta_root;
        let currentBudget = delta_root;
        let currentMat = neighbors_of_I[firstNeighborIdx];

        // Continue the path for d = 2 to D
        for (let level = 2; level <= D; level++) {
            // Find neighbors of currentMat that aren't the parent
            // A neighbor of currentMat is currentMat * G
            const delta = currentBudget / p;
            const startAngle = currentAngle - currentBudget / 2 + delta / 2;

            let found = false;
            let childIdx = 0;
            for (let i = 0; i < neighbors_of_I.length; i++) {
                const G = neighbors_of_I[i];
                const next = currentMat.mul(G);

                // Backtrack check: is next equivalent to parent of currentMat?
                // For simplicity, we just check which G takes us closer to M
                let G_inv = (i < p) ? new BigMat(1, -i, 0, p) : new BigMat(p, 0, 0, 1);
                // Inverse of M is tricky, but we just need d(next, M)
                // Correct way: we want G such that d(currentMat * G, M) < d(currentMat, M)
                // But currentMat * G is a neighbor. Exactly one neighbor is closer.
                const test = next.mul(new BigMat(1, 0, 0, 1)); // We need next^-1 * M
                // Actually, d(next, M) = d(I, next^-1 * M)
                // next^-1 = G^-1 * currentMat^-1
                // We don't have currentMat^-1. Let's compute it.
                const next_det_val = next.a.mul(next.d).sub(next.b.mul(next.c)).val(p);
                const next_inv = new BigMat(next.d, next.b.neg(), next.c.neg(), next.a);
                const test_final = next_inv.mul(M_prim);
                const test_v = Math.min(test_final.a.val(p), test_final.b.val(p), test_final.c.val(p), test_final.d.val(p));
                const test_det = test_final.a.mul(test_final.d).sub(test_final.b.mul(test_final.c));
                const test_D = test_det.val(p) - 2 * test_v;

                if (test_D === D - level) {
                    // This G is the one! 
                    // But which child index is it? 
                    // In our fixed layout, we skip the backtrack generator.
                    // We need a way to consistently map the p remaining generators to indices 0..p-1.
                    // For now, let's just find which index it would be in the children list.

                    // Actually, we can just find which G brought us here from parent, and skip its inverse.
                    // But a simpler way: just iterate all and count valid ones.
                    let validIdx = 0;
                    for (let j = 0; j < neighbors_of_I.length; j++) {
                        const Gj = neighbors_of_I[j];
                        const cj = currentMat.mul(Gj);
                        // Is cj a child? (i.e. not the parent)
                        const cj_det_val = cj.a.mul(cj.d).sub(cj.b.mul(cj.c)).val(p);
                        const cj_v = Math.min(cj.a.val(p), cj.b.val(p), cj.c.val(p), cj.d.val(p));
                        const cj_D = cj_det_val - 2 * cj_v;

                        if (cj_D > level - 1) {
                            if (j === i) {
                                currentAngle = startAngle + validIdx * delta;
                                currentBudget = delta;
                                currentMat = next;
                                found = true;
                                break;
                            }
                            validIdx++;
                        }
                    }
                }
                if (found) break;
            }
        }

        return { x: r * Math.cos(currentAngle), y: r * Math.sin(currentAngle), angle: currentAngle };
    }

    // Helper: compute the tree-distance of a matrix from the root vertex
    _treeDistFromRoot(M) {
        const p = this.p;
        let a = M.a, b = M.b, c = M.c, d = M.d;
        let v = Math.min(a.val(p), b.val(p), c.val(p), d.val(p));
        const sc = this.safePow(p, v);
        const Mn = new BigMat(a.div(sc), b.div(sc), c.div(sc), d.div(sc));
        return Mn.a.mul(Mn.d).sub(Mn.b.mul(Mn.c)).val(p);
    }

    animateAction(gArr, p) {
        this.p = p;
        const g = new BigMat(gArr[0], gArr[1], gArr[2], gArr[3]);

        // Calculate the relative action h_inv = baseMat^-1 * g^-1 * baseMat
        // This maps the new labels back to their positions in the previous coordinate frame
        const invBase = new BigMat(this.baseMat.d, this.baseMat.b.neg(), this.baseMat.c.neg(), this.baseMat.a);
        const invG = new BigMat(g.d, g.b.neg(), g.c.neg(), g.a);
        const h_inv = invBase.mul(invG).mul(this.baseMat);

        // h = g in the reference frame (maps old center to new center)
        const h = invBase.mul(g).mul(this.baseMat);

        // Update the global base matrix for the new frame
        this.baseMat = g.mul(this.baseMat);

        // Standard animation: teleport existing nodes to pre-image, lerp to target
        this.nodes.forEach(node => {
            const startMat = h_inv.mul(node.refMat);
            const startPos = this.getCanonicalPos(startMat);
            node.x = startPos.x;
            node.y = startPos.y;
            node.targetX = node.origX;
            node.targetY = node.origY;
            node.mat = this.baseMat.mul(node.refMat);
        });

        // Build extra nodes: neighborhood of the OLD center (h in ref frame).
        // These have refMat = h*R for shallow source nodes R.
        // They START at center (position of R) and slide OUTWARD to their canonical pos.
        const extraDepth = Math.min(4, this.maxDepth);
        const extras = [];
        const srcToExtraIdx = new Map();

        for (let i = 0; i < this.nodes.length; i++) {
            const src = this.nodes[i];
            if (src.level > extraDepth) continue;

            const extraRef = h.mul(src.refMat);
            const dist = this._treeDistFromRoot(extraRef);
            if (dist <= this.maxDepth) continue; // already in existing tree

            const canonPos = this.getCanonicalPos(extraRef);
            srcToExtraIdx.set(i, extras.length);
            extras.push({
                level: src.level,
                x: src.origX,           // start at center (old position of src)
                y: src.origY,
                targetX: canonPos.x,    // slide outward
                targetY: canonPos.y,
                color: src.color,
                parentExtraIdx: -1,
                srcParentIdx: src.parentIdx
            });
        }

        // Wire up parent edges among extras
        for (const en of extras) {
            if (en.srcParentIdx !== -1 && srcToExtraIdx.has(en.srcParentIdx)) {
                en.parentExtraIdx = srcToExtraIdx.get(en.srcParentIdx);
            }
        }

        this._extraNodes = extras.length > 0 ? extras : null;
    }

    updateTooltip(e) {
        if (!this.tooltip) return;
        const rect = this.canvas.getBoundingClientRect();
        const mx = (e.clientX - rect.left) * window.devicePixelRatio;
        const my = (e.clientY - rect.top) * window.devicePixelRatio;

        let found = null;
        const threshold = 15;

        for (let node of this.nodes) {
            const s = this.diskToScreen(node.x, node.y);
            const d = Math.sqrt((mx - s.x) ** 2 + (my - s.y) ** 2);
            if (d < threshold) { found = node; break; }
        }

        if (found) {
            this.tooltip.style.display = 'block';
            this.tooltip.style.left = (e.clientX + 15) + 'px';
            this.tooltip.style.top = (e.clientY - 15) + 'px';

            const iwa = found.mat.getOrientedIwasawa(this.p);
            this.tooltip.innerHTML = `\\(\\lfloor ${iwa.q.toLatex()} \\rfloor_{${iwa.n}}\\)`;
            if (window.MathJax) MathJax.typesetPromise([this.tooltip]);
        } else {
            this.tooltip.style.display = 'none';
        }
    }

    diskToScreen(x, y) {
        // Apply rotation and scale
        const cos = Math.cos(this.view.rotation);
        const sin = Math.sin(this.view.rotation);
        const rx = (x * cos - y * sin) * this.view.scale * this.radius;
        const ry = (x * sin + y * cos) * this.view.scale * this.radius;

        return {
            x: this.centerX + this.view.x * window.devicePixelRatio + rx,
            y: this.centerY + this.view.y * window.devicePixelRatio + ry
        };
    }

    drawGeodesic(p1, p2, s1, s2, color, lineWidth) {
        const ctx = this.ctx;

        // Pixel distance check
        const dx = s1.x - s2.x;
        const dy = s1.y - s2.y;
        const pixelDistSq = dx * dx + dy * dy;

        // If very short on screen, use a single line
        if (pixelDistSq < 100) {
            ctx.moveTo(s1.x, s1.y);
            ctx.lineTo(s2.x, s2.y);
            return;
        }

        // Adaptive steps: more segments for longer edges
        const steps = Math.min(8, Math.max(2, Math.floor(Math.sqrt(pixelDistSq) / 20)));

        const x1 = p1.x, y1 = p1.y;
        const x2 = p2.x, y2 = p2.y;

        // Map p2 to p2_transformed via isometry that takes p1 to origin
        const numRe = x2 - x1, numIm = y2 - y1;
        const denRe = 1 - (x1 * x2 + y1 * y2);
        const denIm = -(x1 * y2 - y1 * x2);
        const denMagSq = denRe * denRe + denIm * denIm;

        if (denMagSq < 1e-12) {
            ctx.moveTo(s1.x, s1.y);
            ctx.lineTo(s2.x, s2.y);
            return;
        }

        const p2tRe = (numRe * denRe + numIm * denIm) / denMagSq;
        const p2tIm = (numIm * denRe - numRe * denIm) / denMagSq;

        ctx.moveTo(s1.x, s1.y);
        for (let i = 1; i <= steps; i++) {
            const t = i / steps;
            const pixt = t * p2tRe;
            const piyt = t * p2tIm;

            const numIRe = pixt + x1, numIIm = piyt + y1;
            const denIRe = 1 + (x1 * pixt + y1 * piyt);
            const denIIm = (x1 * piyt - y1 * pixt);
            const denIMagSq = denIRe * denIRe + denIIm * denIIm;

            const px = (numIRe * denIRe + numIIm * denIIm) / denIMagSq;
            const py = (numIIm * denIRe - numIRe * denIIm) / denIMagSq;

            const s = this.diskToScreen(px, py);
            ctx.lineTo(s.x, s.y);
        }
    }

    animate() {
        const { ctx, canvas } = this;
        ctx.fillStyle = '#0f172a';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Precompute positions and culling status
        const padding = 100;
        this.nodes.forEach(n => {
            const distSq = (n.targetX - n.x) ** 2 + (n.targetY - n.y) ** 2;
            if (distSq > 1e-7) {
                n.x += (n.targetX - n.x) * 0.1;
                n.y += (n.targetY - n.y) * 0.1;
            } else {
                n.x = n.targetX;
                n.y = n.targetY;
            }
            n.screen = this.diskToScreen(n.x, n.y);
            n.isVisible = n.screen.x > -padding && n.screen.x < canvas.width + padding &&
                n.screen.y > -padding && n.screen.y < canvas.height + padding;
        });

        // Update and draw extra nodes (old-center neighborhood sliding outward)
        if (this._extraNodes) {
            let allDone = true;
            this._extraNodes.forEach(en => {
                const distSq = (en.targetX - en.x) ** 2 + (en.targetY - en.y) ** 2;
                if (distSq > 1e-7) {
                    en.x += (en.targetX - en.x) * 0.1;
                    en.y += (en.targetY - en.y) * 0.1;
                    allDone = false;
                } else {
                    en.x = en.targetX;
                    en.y = en.targetY;
                }
                en.screen = this.diskToScreen(en.x, en.y);
            });

            // Draw extra edges
            ctx.strokeStyle = 'rgba(99, 102, 241, 0.5)';
            ctx.lineWidth = 1.5 * this.view.scale;
            if (ctx.lineWidth >= 0.2) {
                ctx.beginPath();
                this._extraNodes.forEach(en => {
                    if (en.parentExtraIdx !== -1) {
                        const parent = this._extraNodes[en.parentExtraIdx];
                        this.drawGeodesic(parent, en, parent.screen, en.screen);
                    }
                });
                ctx.stroke();
            }

            // Draw extra dots
            const eDotScale = this.view.scale;
            this._extraNodes.forEach(en => {
                const size = Math.max(1, (5 - en.level * 0.8) * eDotScale);
                if (size < 0.5) return;
                ctx.beginPath();
                ctx.arc(en.screen.x, en.screen.y, size, 0, Math.PI * 2);
                ctx.fillStyle = en.color;
                ctx.fill();
            });

            if (allDone) this._extraNodes = null;
        }

        // Group edges by level for batching
        const levels = {};
        this.nodes.forEach(node => {
            if (node.parentIdx !== -1) {
                const parent = this.nodes[node.parentIdx];
                if (node.isVisible || parent.isVisible) {
                    if (!levels[node.level]) levels[node.level] = [];
                    levels[node.level].push({ parent, node });
                }
            }
        });

        // Batch draw edges level by level
        for (let l in levels) {
            const levelNum = parseInt(l);
            const opacity = Math.max(0.1, 1 - levelNum / (this.maxDepth + 1));
            ctx.strokeStyle = `rgba(99, 102, 241, ${opacity})`;
            ctx.lineWidth = (2 - levelNum * 0.2) * this.view.scale;
            // No thin edges
            if (ctx.lineWidth < 0.2) continue;

            ctx.beginPath();
            levels[l].forEach(pair => {
                this.drawGeodesic(pair.parent, pair.node, pair.parent.screen, pair.node.screen);
            });
            ctx.stroke();
        }

        // Batch draw nodes (skip the ones with extremely low scale)
        const dotScale = this.view.scale;
        this.nodes.forEach(node => {
            if (!node.isVisible) return;
            const size = Math.max(1, (6 - node.level * 0.8) * dotScale);
            if (size < 0.5) return;

            ctx.beginPath();
            ctx.arc(node.screen.x, node.screen.y, size, 0, Math.PI * 2);
            ctx.fillStyle = node.color;
            if (size > 2) {
                ctx.shadowBlur = size * 2;
                ctx.shadowColor = node.color;
            }
            ctx.fill();
            ctx.shadowBlur = 0;
        });

        requestAnimationFrame(() => this.animate());
    }
}
