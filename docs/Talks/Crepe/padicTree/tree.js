/**
 * DiskTreeViz — 3-adic tree in the Poincaré Disk
 * 
 * Generators act as genuine tree automorphisms:
 * each vertex slides linearly to where another vertex was.
 */

class DiskTreeViz {
    // Region colors: 0=a (teal), 1=b (rose), 2=a⁻¹ (amber), 3=b⁻¹ (violet)
    static REGION_COLORS = [
        { h: 170, s: 70, l: 55, css: 'hsl(170,70%,55%)', hex: '#2dd4a8' },  // a  — teal
        { h: 340, s: 80, l: 65, css: 'hsl(340,80%,65%)', hex: '#f472b6' },  // b  — rose
        { h: 38,  s: 92, l: 55, css: 'hsl(38,92%,55%)',  hex: '#f59e0b' },  // a⁻¹ — amber
        { h: 260, s: 70, l: 65, css: 'hsl(260,70%,65%)', hex: '#a78bfa' },  // b⁻¹ — violet
    ];

    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.p = 3;
        this.maxDepth = 5;
        this.stepDistance = 0.85;
        this.view = { x: 0, y: 0, scale: 0.9, rotation: 0 };
        this.mouseState = { isDragging: false, lastX: 0, lastY: 0 };
        this.animating = false;
        this.animProgress = 0;
        this.pulseTime = -10; // -10 = not pulsing

        this.nodeColor = 'hsl(220, 80%, 65%)';
        this.colorMode = 'uniform'; // 'uniform' | 'regions'
        this.decompState = { active: false, progress: 0, target: 0, phase: 0 };

        // Nodes: each has a fixed reference position and a current display position
        this.nodes = [];
        this.addrMap = new Map(); // addr string → node index
        // Ephemeral particles for incoming/outgoing during animation
        this.ephemeral = [];

        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.setupControls();
        this.buildTree();
        this.animate();
    }

    resize() {
        this.canvas.width = this.canvas.clientWidth * window.devicePixelRatio;
        this.canvas.height = this.canvas.clientHeight * window.devicePixelRatio;
        this.centerX = this.canvas.width / 2;
        this.centerY = this.canvas.height / 2;
        this.radius = Math.min(this.canvas.width, this.canvas.height) * 0.45;
    }

    // ════════════════════════════════════════
    // TREE LAYOUT
    // ════════════════════════════════════════

    /** Compute disk position for any address (even beyond maxDepth) */
    getAddrPos(addr) {
        if (addr.length === 0) return { x: 0, y: 0 };
        const p = this.p;
        const rootDelta = 2 * Math.PI / (p + 1);
        let angle = addr[0] * rootDelta;
        let budget = rootDelta;
        for (let k = 1; k < addr.length; k++) {
            const delta = budget / p;
            angle = angle - budget / 2 + delta / 2 + addr[k] * delta;
            budget = delta;
        }
        const r = Math.tanh(addr.length * this.stepDistance / 2);
        return { x: r * Math.cos(angle), y: -r * Math.sin(angle) };
    }

    buildTree() {
        this.nodes = [];
        this.addrMap = new Map();
        const I3 = [[1,0,0],[0,1,0],[0,0,1]];
        const build = (level, addr, parentIdx, mat, lastGen, rootBranch) => {
            const idx = this.nodes.length;
            const pos = this.getAddrPos(addr);
            // Sphere: mat * [0,0,1] = third column; view from +z (top-down)
            const sx = mat[0][2], sy = -mat[1][2], sz = mat[2][2];
            this.nodes.push({
                level, addr: addr.slice(),
                refX: pos.x, refY: pos.y,
                x: pos.x, y: pos.y,
                startX: pos.x, startY: pos.y,
                targetX: pos.x, targetY: pos.y,
                parentIdx,
                color: this.nodeColor,
                lastGen,
                rootBranch,  // which root child (0-3) this subtree descends from, or -1 for root
                sphereX: sx, sphereY: sy, sphereZ: sz
            });
            this.addrMap.set(addr.toString(), idx);
            if (level >= this.maxDepth) return;
            const gens = level === 0 ? DiskTreeViz.ROOT_GENS : DiskTreeViz.CHILD_GENS[lastGen];
            for (let i = 0; i < gens.length; i++) {
                const g = gens[i];
                const cm = DiskTreeViz.mat3mul(mat, DiskTreeViz.genMat(g));
                const branch = level === 0 ? i : rootBranch;
                build(level + 1, [...addr, i], idx, cm, g, branch);
            }
        };
        build(0, [], -1, I3, null, -1);
    }

    // ════════════════════════════════════════
    // TREE AUTOMORPHISMS
    // ════════════════════════════════════════
    // 
    // Root children: 0=right, 1=up, 2=left, 3=down
    // Horizontal axis: ...←[2,1,1]←[2,1]←[2]←[]→[0]→[0,1]→[0,1,1]→...
    // Vertical axis:   ...←[3,1,1]←[3,1]←[3]←[]→[1]→[1,1]→[1,1,1]→...
    //
    // Translation inserts/removes a "1" along the axis
    // and relabels off-axis subtrees to the next axis vertex.

    static _translate(addr, fwd, back, above, below) {
        if (addr.length === 0) return [fwd];
        if (addr[0] === fwd) return [fwd, 1, ...addr.slice(1)];
        if (addr[0] === above) return [fwd, 2, ...addr.slice(1)];
        if (addr[0] === below) return [fwd, 0, ...addr.slice(1)];
        if (addr[0] === back) {
            if (addr.length === 1) return [];
            if (addr[1] === 1) return [back, ...addr.slice(2)];
            if (addr[1] === 0) return [above, ...addr.slice(2)];
            if (addr[1] === 2) return [below, ...addr.slice(2)];
        }
        return addr; // shouldn't happen
    }

    static translateRightAddr(a) { return DiskTreeViz._translate(a, 0, 2, 1, 3); }
    static translateLeftAddr(a)  { return DiskTreeViz._translate(a, 2, 0, 3, 1); }
    static translateUpAddr(a)    { return DiskTreeViz._translate(a, 1, 3, 2, 0); }
    static translateDownAddr(a)  { return DiskTreeViz._translate(a, 3, 1, 0, 2); }

    // ════════════════════════════════════════
    // APPLY TRANSLATION
    // ════════════════════════════════════════

    /** Compute arc params for a vertex moving along a hypercycle.
     *  Finds the unique circle with center on the translation axis
     *  that passes through both start and target positions. */
    _computeArc(sx, sy, tx, ty, axisType) {
        const eps = 1e-8;
        const dx = tx - sx, dy = ty - sy;
        if (dx * dx + dy * dy < eps * eps) return null; // no movement

        if (axisType === 'h') {
            // Horizontal axis: center at (cx, 0)
            if (Math.abs(sy) < eps && Math.abs(ty) < eps) return null; // both on axis
            if (Math.abs(sx - tx) < eps) return null; // vertically aligned, use linear
            const cx = (sx * sx + sy * sy - tx * tx - ty * ty) / (2 * (sx - tx));
            const r = Math.sqrt((sx - cx) * (sx - cx) + sy * sy);
            const theta0 = Math.atan2(sy, sx - cx);
            let theta1 = Math.atan2(ty, tx - cx);
            let dTheta = theta1 - theta0;
            if (dTheta > Math.PI) dTheta -= 2 * Math.PI;
            if (dTheta < -Math.PI) dTheta += 2 * Math.PI;
            return { cx, cy: 0, r, theta0, dTheta };
        } else {
            // Vertical axis: center at (0, cy)
            if (Math.abs(sx) < eps && Math.abs(tx) < eps) return null; // both on axis
            if (Math.abs(sy - ty) < eps) return null; // horizontally aligned, use linear
            const cy = (sx * sx + sy * sy - tx * tx - ty * ty) / (2 * (sy - ty));
            const r = Math.sqrt(sx * sx + (sy - cy) * (sy - cy));
            const theta0 = Math.atan2(sy - cy, sx);
            let theta1 = Math.atan2(ty - cy, tx);
            let dTheta = theta1 - theta0;
            if (dTheta > Math.PI) dTheta -= 2 * Math.PI;
            if (dTheta < -Math.PI) dTheta += 2 * Math.PI;
            return { cx: 0, cy, r, theta0, dTheta };
        }
    }

    /** Interpolate position along arc or linearly */
    _interpolate(n, t) {
        if (n.arc) {
            const theta = n.arc.theta0 + n.arc.dTheta * t;
            n.x = n.arc.cx + n.arc.r * Math.cos(theta);
            n.y = n.arc.cy + n.arc.r * Math.sin(theta);
        } else {
            n.x = n.startX + (n.targetX - n.startX) * t;
            n.y = n.startY + (n.targetY - n.startY) * t;
        }
    }

    applyTranslation(transFn, axisType) {
        if (this.animating || this.decompState.active) return;

        this.ephemeral = [];
        const usedTargets = new Set();

        // For each existing node, compute where it maps
        for (let i = 0; i < this.nodes.length; i++) {
            const node = this.nodes[i];
            const targetAddr = transFn(node.addr);
            const targetPos = this.getAddrPos(targetAddr);
            node.startX = node.refX;
            node.startY = node.refY;
            node.targetX = targetPos.x;
            node.targetY = targetPos.y;
            node.arc = this._computeArc(node.startX, node.startY, node.targetX, node.targetY, axisType);

            const key = targetAddr.toString();
            if (this.addrMap.has(key)) usedTargets.add(key);
        }

        // Find positions that need incoming nodes
        for (const [key, idx] of this.addrMap) {
            if (!usedTargets.has(key)) {
                const node = this.nodes[idx];
                const inverseAddr = this._getInverseSource(transFn, node.addr);
                const startPos = this.getAddrPos(inverseAddr);
                const arc = this._computeArc(startPos.x, startPos.y, node.refX, node.refY, axisType);
                this.ephemeral.push({
                    startX: startPos.x, startY: startPos.y,
                    targetX: node.refX, targetY: node.refY,
                    x: startPos.x, y: startPos.y,
                    arc,
                    color: this.nodeColor,
                    level: inverseAddr.length
                });
            }
        }

        this.animating = true;
        this.animProgress = 0;
    }

    _getInverseSource(transFn, targetAddr) {
        // Find addr such that transFn(addr) = targetAddr
        // Use the inverse translation
        if (transFn === DiskTreeViz.translateRightAddr) return DiskTreeViz.translateLeftAddr(targetAddr);
        if (transFn === DiskTreeViz.translateLeftAddr) return DiskTreeViz.translateRightAddr(targetAddr);
        if (transFn === DiskTreeViz.translateUpAddr) return DiskTreeViz.translateDownAddr(targetAddr);
        if (transFn === DiskTreeViz.translateDownAddr) return DiskTreeViz.translateUpAddr(targetAddr);
        return targetAddr;
    }

    _finishAnimation() {
        // Rebuild tree from scratch — the automorphism is complete,
        // tree looks the same (since it's a symmetry). Clean slate for next action.
        this.buildTree();
        this.ephemeral = [];
        this.animating = false;
    }

    translateRight() { this.applyTranslation(DiskTreeViz.translateRightAddr, 'h'); }
    translateLeft()  { this.applyTranslation(DiskTreeViz.translateLeftAddr,  'h'); }
    translateUp()    { this.applyTranslation(DiskTreeViz.translateUpAddr,    'v'); }
    translateDown()  { this.applyTranslation(DiskTreeViz.translateDownAddr,  'v'); }

    resetTree() {
        this.buildTree();
        this.ephemeral = [];
        this.animating = false;
        this.view = { x: 0, y: 0, scale: 0.9, rotation: 0 };
        this.decompState = { active: false, progress: 0, target: 0, phase: 0 };
    }

    setDepth(d) {
        this.maxDepth = Math.max(1, Math.min(9, d));
        this.buildTree();
        this.ephemeral = [];
        this.animating = false;
    }

    triggerPulse() {
        this.pulseTime = -1.5;
    }

    toggleDecompose() {
        if (this.animating) return;

        // Phase transitions: 0 → 1 → 2 → 0
        if (!this.decompState.active) {
            // ──── Enter Phase 1: Cut & Separate (no resize) ────
            // Offset large enough that reassembled trees are disjoint
            // Each tree has disk radius ≈ tanh(depth * step/2) ≈ 0.97
            // Centers at ±1.05 → separation 2.1 > 2×0.97
            const leftOff = -1.05;
            const rightOff = 1.05;

            for (const node of this.nodes) {
                const rb = node.rootBranch;
                if (rb === -1) {
                    // Root node: stays centered, will fade out
                    node.decomp1X = node.refX;
                    node.decomp1Y = node.refY;
                } else if (rb === 0 || rb === 2) {
                    // S(a) and S(a⁻¹): slide left, keep original tree positions
                    node.decomp1X = node.refX + leftOff;
                    node.decomp1Y = node.refY;
                } else if (rb === 1 || rb === 3) {
                    // S(b) and S(b⁻¹): slide right, keep original tree positions
                    node.decomp1X = node.refX + rightOff;
                    node.decomp1Y = node.refY;
                }
            }
            // Save original view scale for later restoration
            this.decompState.origScale = this.view.scale;
            // Target scale: fit both trees (range ≈ ±2.0 in disk coords)
            this.decompState.targetScale = this.view.scale * 0.44;
            this.decompState.active = true;
            this.decompState.phase = 1;
            this.decompState.target = 1;
            this.decompState.progress = 0;

        } else if (this.decompState.phase === 1 && this.decompState.progress >= 0.99) {
            // ──── Enter Phase 2: Apply isometries ────
            // Left tree:  S(a) stays, translateRight on S(a⁻¹) → fills other branches
            // Right tree: S(b) stays, translateUp on S(b⁻¹) → fills other branches
            const leftOff = -1.05;
            const rightOff = 1.05;

            for (const node of this.nodes) {
                const rb = node.rootBranch;
                if (rb === -1) {
                    // Root: duplicate — one for each tree
                    // We'll handle root specially in rendering
                    node.decomp2X_left = this.getAddrPos([]).x + leftOff;
                    node.decomp2Y_left = this.getAddrPos([]).y;
                    node.decomp2X_right = this.getAddrPos([]).x + rightOff;
                    node.decomp2Y_right = this.getAddrPos([]).y;
                    // For interpolation, move root to left tree center
                    node.decomp2X = node.decomp2X_left;
                    node.decomp2Y = node.decomp2Y_left;
                } else if (rb === 0) {
                    // S(a): stays on left, keep position
                    node.decomp2X = node.decomp1X;
                    node.decomp2Y = node.decomp1Y;
                } else if (rb === 2) {
                    // S(a⁻¹): apply translateRight → maps into the "missing" branches on left
                    const newAddr = DiskTreeViz.translateRightAddr(node.addr);
                    const newPos = this.getAddrPos(newAddr);
                    node.decomp2X = newPos.x + leftOff;
                    node.decomp2Y = newPos.y;
                } else if (rb === 1) {
                    // S(b): stays on right, keep position
                    node.decomp2X = node.decomp1X;
                    node.decomp2Y = node.decomp1Y;
                } else if (rb === 3) {
                    // S(b⁻¹): apply translateUp → maps into the "missing" branches on right
                    const newAddr = DiskTreeViz.translateUpAddr(node.addr);
                    const newPos = this.getAddrPos(newAddr);
                    node.decomp2X = newPos.x + rightOff;
                    node.decomp2Y = newPos.y;
                }
            }
            this.decompState.phase = 2;
            this.decompState.target = 1;
            this.decompState.progress = 0;

        } else if (this.decompState.phase === 2 && this.decompState.progress >= 0.99) {
            // ──── Return to original ────
            this.decompState.phase = 0;
            this.decompState.target = 0;
            this.decompState.progress = 1;
        }
    }

    // ════════════════════════════════════════
    // CONTROLS
    // ════════════════════════════════════════

    setupControls() {
        this.canvas.addEventListener('mousedown', e => {
            this.mouseState.isDragging = true;
            this.mouseState.lastX = e.clientX;
            this.mouseState.lastY = e.clientY;
        });
        window.addEventListener('mouseup', () => this.mouseState.isDragging = false);
        window.addEventListener('mousemove', e => {
            if (this.mouseState.isDragging) {
                this.view.x += e.clientX - this.mouseState.lastX;
                this.view.y += e.clientY - this.mouseState.lastY;
                this.mouseState.lastX = e.clientX;
                this.mouseState.lastY = e.clientY;
            }
        });
        this.canvas.addEventListener('wheel', e => {
            e.preventDefault();
            const dpr = window.devicePixelRatio;
            const rect = this.canvas.getBoundingClientRect();
            const mx = (e.clientX - rect.left) * dpr - this.centerX;
            const my = (e.clientY - rect.top) * dpr - this.centerY;
            const mxb = mx - this.view.x * dpr;
            const myb = my - this.view.y * dpr;
            const oldS = this.view.scale;
            this.view.scale = Math.max(0.1, Math.min(50, oldS * (e.deltaY < 0 ? 1.05 : 0.95)));
            const sf = this.view.scale / oldS;
            this.view.x = (mx - mxb * sf) / dpr;
            this.view.y = (my - myb * sf) / dpr;
        }, { passive: false });
        // Touch
        let lastDist = 0;
        this.canvas.addEventListener('touchstart', e => {
            if (e.touches.length === 1) {
                this.mouseState.isDragging = true;
                this.mouseState.lastX = e.touches[0].clientX;
                this.mouseState.lastY = e.touches[0].clientY;
            } else if (e.touches.length === 2) {
                lastDist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                                     e.touches[0].clientY - e.touches[1].clientY);
            }
            e.preventDefault();
        }, { passive: false });
        this.canvas.addEventListener('touchmove', e => {
            if (e.touches.length === 1 && this.mouseState.isDragging) {
                this.view.x += e.touches[0].clientX - this.mouseState.lastX;
                this.view.y += e.touches[0].clientY - this.mouseState.lastY;
                this.mouseState.lastX = e.touches[0].clientX;
                this.mouseState.lastY = e.touches[0].clientY;
            } else if (e.touches.length === 2) {
                const d = Math.hypot(e.touches[0].clientX - e.touches[1].clientX,
                                     e.touches[0].clientY - e.touches[1].clientY);
                this.view.scale = Math.max(0.1, Math.min(50, this.view.scale * d / lastDist));
                lastDist = d;
            }
            e.preventDefault();
        }, { passive: false });
        this.canvas.addEventListener('touchend', () => this.mouseState.isDragging = false);
    }

    // ════════════════════════════════════════
    // RENDERING
    // ════════════════════════════════════════

    diskToScreen(x, y) {
        const r = this.radius * this.view.scale;
        return {
            x: this.centerX + this.view.x * window.devicePixelRatio + x * r,
            y: this.centerY + this.view.y * window.devicePixelRatio + y * r
        };
    }

    drawEdge(ctx, ax, ay, bx, by) {
        const sa = this.diskToScreen(ax, ay);
        const sb = this.diskToScreen(bx, by);
        ctx.moveTo(sa.x, sa.y);
        ctx.lineTo(sb.x, sb.y);
    }

    animate() {
        const { ctx, canvas } = this;

        // Background
        const grad = ctx.createRadialGradient(
            this.centerX, this.centerY, 0,
            this.centerX, this.centerY, this.radius * this.view.scale * 1.3);
        grad.addColorStop(0, '#0d1321');
        grad.addColorStop(0.7, '#080e1a');
        grad.addColorStop(1, '#060a14');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Decompose progress (multi-phase)
        let dp = 0;
        const dPhase = this.decompState.phase || 0;
        if (this.decompState.active) {
            const diff = this.decompState.target - this.decompState.progress;
            if (Math.abs(diff) > 0.001) {
                this.decompState.progress += Math.sign(diff) * 0.015;
                this.decompState.progress = Math.max(0, Math.min(1, this.decompState.progress));
            } else {
                this.decompState.progress = this.decompState.target;
                if (dPhase === 0 && this.decompState.target === 0 && this.decompState.progress <= 0.001) {
                    this.decompState.active = false;
                    this.decompState.phase = 0;
                    this.view.scale = this.decompState.origScale || 0.9;
                    this.nodes.forEach(n => { n.x = n.refX; n.y = n.refY; });
                }
            }
            dp = this.easeInOut(this.decompState.progress);

            // Smoothly zoom view to fit decomposed trees
            const origScale = this.decompState.origScale || 0.9;
            const targetScale = this.decompState.targetScale || origScale;
            let desiredScale;
            if (dPhase === 1) {
                desiredScale = origScale + (targetScale - origScale) * dp;
            } else if (dPhase === 2) {
                desiredScale = targetScale;
            } else if (dPhase === 0) {
                desiredScale = targetScale + (origScale - targetScale) * (1 - dp);
            } else {
                desiredScale = origScale;
            }
            this.view.scale = desiredScale;
        }

        // Disk boundary
        const bc = this.diskToScreen(0, 0);
        const br = this.radius * this.view.scale;
        ctx.beginPath();
        ctx.arc(bc.x, bc.y, br, 0, Math.PI * 2);
        let diskFade;
        if (dPhase === 1) diskFade = dp;        // fading out
        else if (dPhase === 2) diskFade = 1;     // fully hidden
        else if (dPhase === 0 && this.decompState.active) diskFade = dp;  // fading back in (dp goes 1→0)
        else diskFade = 0;                       // fully visible
        ctx.strokeStyle = `rgba(124, 138, 255, ${0.12 * (1 - diskFade)})`;
        ctx.lineWidth = 1.5;
        ctx.stroke();
        const dg = ctx.createRadialGradient(bc.x, bc.y, 0, bc.x, bc.y, br);
        dg.addColorStop(0, `rgba(124, 138, 255, ${0.03 * (1 - diskFade)})`);
        dg.addColorStop(1, `rgba(124, 138, 255, ${0.005 * (1 - diskFade)})`);
        ctx.fillStyle = dg;
        ctx.fill();

        // Reference box: shows the original camera frame during zoom-out
        if (this.decompState.active && (dPhase === 1 || dPhase === 2 || dPhase === 0)) {
            const origScale = this.decompState.origScale || 0.9;
            // The original disk boundary radius in screen pixels at original zoom
            const origR = this.radius * origScale;
            // Screen center (same as disk center, accounting for pan)
            const rcx = this.centerX + this.view.x * window.devicePixelRatio;
            const rcy = this.centerY + this.view.y * window.devicePixelRatio;
            // Box sized to enclose the original disk view (square around radius)
            // Made larger as requested
            const boxHalf = origR * 1.25; 
            // Fixed size on screen so we see the contents shrink inside it
            const bx0 = rcx - boxHalf;
            const by0 = rcy - boxHalf;
            const bw = boxHalf * 2;
            const bh = boxHalf * 2;
            const cornerR = 16;

            // Fade in during phase 1, stay during phase 2, fade out during return
            let boxAlpha;
            if (dPhase === 1) boxAlpha = dp * 0.35;
            else if (dPhase === 2) boxAlpha = 0.35;
            else if (dPhase === 0) boxAlpha = dp * 0.35; // dp goes 1→0
            else boxAlpha = 0;

            if (boxAlpha > 0.005) {
                ctx.beginPath();
                ctx.roundRect(bx0, by0, bw, bh, cornerR);
                ctx.strokeStyle = `rgba(124, 138, 255, ${boxAlpha})`;
                ctx.lineWidth = 1.5;
                ctx.setLineDash([8, 6]);
                ctx.stroke();
                ctx.setLineDash([]);
            }
        }

        // Animation progress
        if (this.animating) {
            this.animProgress += 0.025;
            if (this.animProgress >= 1) {
                this.animProgress = 1;
                // Will finish after this frame
            }
        }

        const t = this.animating ? this.easeInOut(this.animProgress) : 0;

        // Update positions (arc interpolation along hypercycles)
        if (this.animating) {
            this.nodes.forEach(n => this._interpolate(n, t));
            this.ephemeral.forEach(e => this._interpolate(e, t));
        } else if (dp > 0 && this.decompState.active) {
            if (dPhase === 1) {
                // Phase 1: interpolate from ref → decomp1 (separate)
                this.nodes.forEach(n => {
                    n.x = n.refX + ((n.decomp1X || n.refX) - n.refX) * dp;
                    n.y = n.refY + ((n.decomp1Y || n.refY) - n.refY) * dp;
                });
            } else if (dPhase === 2) {
                // Phase 2: interpolate from decomp1 → decomp2 (apply isometries)
                this.nodes.forEach(n => {
                    const s1x = n.decomp1X != null ? n.decomp1X : n.refX;
                    const s1y = n.decomp1Y != null ? n.decomp1Y : n.refY;
                    const s2x = n.decomp2X != null ? n.decomp2X : s1x;
                    const s2y = n.decomp2Y != null ? n.decomp2Y : s1y;
                    n.x = s1x + (s2x - s1x) * dp;
                    n.y = s1y + (s2y - s1y) * dp;
                });
            } else if (dPhase === 0) {
                // Phase 0 (return): interpolate from decomp2 → ref
                this.nodes.forEach(n => {
                    const fromX = n.decomp2X != null ? n.decomp2X : n.refX;
                    const fromY = n.decomp2Y != null ? n.decomp2Y : n.refY;
                    // dp goes from 1→0 as progress goes from 1→0
                    n.x = n.refX + (fromX - n.refX) * dp;
                    n.y = n.refY + (fromY - n.refY) * dp;
                });
            }
        }

        // Pulse: advance wavefront
        const pulseActive = this.pulseTime > -5;
        if (this.pulseTime >= -1.5 && this.pulseTime <= this.maxDepth + 3) {
            this.pulseTime += 0.06;
            if (this.pulseTime > this.maxDepth + 3) this.pulseTime = -10;
        }
        const pulseFn = (level) => {
            if (!pulseActive) return 0;
            const dist = Math.abs(level - this.pulseTime);
            return Math.max(0, 1 - dist / 1.5);
        };

        // Collect all visible particles (nodes + ephemeral)
        const allParticles = [...this.nodes, ...this.ephemeral];

        // Draw edges (between nodes with parent relationships)
        const isRegions = this.colorMode === 'regions';
        const levels = {};
        this.nodes.forEach(node => {
            if (node.parentIdx === -1) return;
            const parent = this.nodes[node.parentIdx];
            if (!levels[node.level]) levels[node.level] = [];
            levels[node.level].push({ parent, node });
        });

        if (isRegions) {
            for (let l in levels) {
                const lv = parseInt(l);
                const pv = pulseFn(lv);
                const lw = Math.max(0.4, (2.5 - lv * 0.3) * this.view.scale) * (1 + pv * 0.6);
                if (lw < 0.2) continue;

                // Level 1 edges: fade out in phase 1, stay hidden in phase 2, fade back in phase 0 (return)
                if (lv === 1) {
                    let decompFade;
                    if (dPhase === 1) decompFade = 1 - dp;
                    else if (dPhase === 2) decompFade = 0;
                    else if (dPhase === 0 && this.decompState.active) decompFade = 1 - dp;
                    else decompFade = 1;
                    if (decompFade < 0.01) continue;
                    levels[l].forEach(({ parent, node }) => {
                        const sa = this.diskToScreen(parent.x, parent.y);
                        const sb = this.diskToScreen(node.x, node.y);
                        const rc = DiskTreeViz.REGION_COLORS[node.rootBranch];
                        if (!rc) return;
                        const opacity = Math.min(1, Math.max(0.15, 0.6) + pv * 0.5) * decompFade;
                        const grad = ctx.createLinearGradient(sa.x, sa.y, sb.x, sb.y);
                        grad.addColorStop(0, `rgba(255, 255, 255, ${opacity})`);
                        grad.addColorStop(1, `hsla(${rc.h}, ${rc.s}%, ${Math.min(90, rc.l + pv * 25)}%, ${opacity})`);
                        ctx.beginPath();
                        ctx.strokeStyle = grad;
                        ctx.lineWidth = lw;
                        this.drawEdge(ctx, parent.x, parent.y, node.x, node.y);
                        ctx.stroke();
                    });
                    continue;
                }

                // Other levels: normal branch-colored edges
                ctx.lineWidth = lw;
                const byBranch = {};
                levels[l].forEach(e => {
                    const b = e.node.rootBranch;
                    if (!byBranch[b]) byBranch[b] = [];
                    byBranch[b].push(e);
                });
                for (const b in byBranch) {
                    const rc = DiskTreeViz.REGION_COLORS[b] || { h: 220, s: 80, l: 65 };
                    const opacity = Math.min(1, Math.max(0.15, 0.7 - lv * 0.1) + pv * 0.5);
                    const lightness = Math.min(90, rc.l + pv * 25);
                    ctx.strokeStyle = `hsla(${rc.h}, ${rc.s}%, ${lightness}%, ${opacity})`;
                    ctx.beginPath();
                    byBranch[b].forEach(({ parent, node }) => {
                        this.drawEdge(ctx, parent.x, parent.y, node.x, node.y);
                    });
                    ctx.stroke();
                }
            }

            // Synthetic edges for decompose phase 2
            // In phase 2, draw edges connecting the reassembled branches to their new root
            if (dPhase === 2 && dp > 0.01) {
                const synthOpacity = dp * 0.6;
                const synthLw = Math.max(0.4, 2.2 * this.view.scale);
                const leftOff = -1.05;
                const rightOff = 1.05;
                const rootNode = this.nodes[this.addrMap.get('')];

                if (rootNode) {
                    // ── Left tree root connections ──
                    // Left root → S(a) root
                    const aRootIdx = this.addrMap.get('0');
                    if (aRootIdx != null) {
                        const aRoot = this.nodes[aRootIdx];
                        const sa = this.diskToScreen(rootNode.x, rootNode.y);
                        const sb = this.diskToScreen(aRoot.x, aRoot.y);
                        const color = DiskTreeViz.REGION_COLORS[0];
                        const grad = ctx.createLinearGradient(sa.x, sa.y, sb.x, sb.y);
                        grad.addColorStop(0, `rgba(255, 255, 255, ${synthOpacity})`);
                        grad.addColorStop(1, `hsla(${color.h}, ${color.s}%, ${color.l}%, ${synthOpacity})`);
                        ctx.beginPath();
                        ctx.strokeStyle = grad;
                        ctx.lineWidth = synthLw;
                        this.drawEdge(ctx, rootNode.x, rootNode.y, aRoot.x, aRoot.y);
                        ctx.stroke();
                    }

                    // Left root → S(a⁻¹) root (which moved via translateRight)
                    const aiRootIdx = this.addrMap.get('2');
                    if (aiRootIdx != null) {
                        const aiRoot = this.nodes[aiRootIdx];
                        const sa = this.diskToScreen(rootNode.x, rootNode.y);
                        const sb = this.diskToScreen(aiRoot.x, aiRoot.y);
                        const color = DiskTreeViz.REGION_COLORS[2];
                        const grad = ctx.createLinearGradient(sa.x, sa.y, sb.x, sb.y);
                        grad.addColorStop(0, `rgba(255, 255, 255, ${synthOpacity})`);
                        grad.addColorStop(1, `hsla(${color.h}, ${color.s}%, ${color.l}%, ${synthOpacity})`);
                        ctx.beginPath();
                        ctx.strokeStyle = grad;
                        ctx.lineWidth = synthLw;
                        this.drawEdge(ctx, rootNode.x, rootNode.y, aiRoot.x, aiRoot.y);
                        ctx.stroke();
                    }

                    // ── Right tree ghost root connections ──
                    const ghostRootX = rootNode.decomp2X_right != null ? 
                        (rootNode.decomp1X || rootNode.refX) + (rootNode.decomp2X_right - (rootNode.decomp1X || rootNode.refX)) * dp :
                        rootNode.x + rightOff - leftOff;
                    const ghostRootY = rootNode.decomp2Y_right != null ?
                        (rootNode.decomp1Y || rootNode.refY) + (rootNode.decomp2Y_right - (rootNode.decomp1Y || rootNode.refY)) * dp :
                        rootNode.y;

                    // Right ghost root → S(b) root
                    const bRootIdx = this.addrMap.get('1');
                    if (bRootIdx != null) {
                        const bRoot = this.nodes[bRootIdx];
                        const sa = this.diskToScreen(ghostRootX, ghostRootY);
                        const sb = this.diskToScreen(bRoot.x, bRoot.y);
                        const color = DiskTreeViz.REGION_COLORS[1];
                        const grad = ctx.createLinearGradient(sa.x, sa.y, sb.x, sb.y);
                        grad.addColorStop(0, `rgba(255, 255, 255, ${synthOpacity})`);
                        grad.addColorStop(1, `hsla(${color.h}, ${color.s}%, ${color.l}%, ${synthOpacity})`);
                        ctx.beginPath();
                        ctx.strokeStyle = grad;
                        ctx.lineWidth = synthLw;
                        this.drawEdge(ctx, ghostRootX, ghostRootY, bRoot.x, bRoot.y);
                        ctx.stroke();
                    }

                    // Right ghost root → S(b⁻¹) root (which moved via translateUp)
                    const biRootIdx = this.addrMap.get('3');
                    if (biRootIdx != null) {
                        const biRoot = this.nodes[biRootIdx];
                        const sa = this.diskToScreen(ghostRootX, ghostRootY);
                        const sb = this.diskToScreen(biRoot.x, biRoot.y);
                        const color = DiskTreeViz.REGION_COLORS[3];
                        const grad = ctx.createLinearGradient(sa.x, sa.y, sb.x, sb.y);
                        grad.addColorStop(0, `rgba(255, 255, 255, ${synthOpacity})`);
                        grad.addColorStop(1, `hsla(${color.h}, ${color.s}%, ${color.l}%, ${synthOpacity})`);
                        ctx.beginPath();
                        ctx.strokeStyle = grad;
                        ctx.lineWidth = synthLw;
                        this.drawEdge(ctx, ghostRootX, ghostRootY, biRoot.x, biRoot.y);
                        ctx.stroke();
                    }
                }
            }
        } else {
            for (let l in levels) {
                const lv = parseInt(l);
                const pv = pulseFn(lv);
                const opacity = Math.min(1, Math.max(0.1, 0.65 - lv * 0.1) + pv * 0.5);
                const lw = Math.max(0.4, (2.5 - lv * 0.3) * this.view.scale) * (1 + pv * 0.6);
                if (lw < 0.2) continue;
                ctx.lineWidth = lw;
                if (pv > 0.01) {
                    const blend = Math.round(124 + (136 - 124) * pv);
                    const blendG = Math.round(138 + (204 - 138) * pv);
                    const blendB = Math.round(255);
                    ctx.strokeStyle = `rgba(${blend}, ${blendG}, ${blendB}, ${opacity})`;
                } else {
                    ctx.strokeStyle = `rgba(124, 138, 255, ${opacity})`;
                }
                ctx.beginPath();
                levels[l].forEach(({ parent, node }) => {
                    this.drawEdge(ctx, parent.x, parent.y, node.x, node.y);
                });
                ctx.stroke();
            }
        }

        // Draw nodes
        const ds = this.view.scale;
        const drawNode = (node, opacityMult = 1) => {
            const lv = node.level || 0;
            const pv = pulseFn(lv);
            const baseSize = Math.max(1.5, (7 - lv * 0.9) * ds);
            const size = baseSize * (1 + pv * 0.8);
            if (size < 0.5) return;
            const s = this.diskToScreen(node.x, node.y);
            if (s.x < -100 || s.x > canvas.width + 100 || s.y < -100 || s.y > canvas.height + 100) return;

            const rb = node.rootBranch;
            const rc = (isRegions && rb >= 0) ? DiskTreeViz.REGION_COLORS[rb] : null;
            let nodeCSS, nodeHSLA;
            if (isRegions && rb === -1) {
                let rootFade;
                if (dPhase === 1) rootFade = 1 - dp;           // fading out during separation
                else if (dPhase === 2) rootFade = dp;           // fading back in as left tree root
                else if (dPhase === 0 && this.decompState.active) rootFade = 1; // visible during return
                else rootFade = 1;                              // fully visible
                if (rootFade < 0.01 && opacityMult >= 1) return;
                const lightness = Math.round(90 + pv * 10);
                const alpha = rootFade * opacityMult;
                nodeCSS = `hsla(0, 0%, ${lightness}%, ${alpha})`;
                nodeHSLA = `hsla(0, 0%, ${lightness}%, ${(0.15 + pv * 0.2) * alpha})`;
            } else if (rc) {
                const lightness = Math.min(90, rc.l + pv * 25);
                nodeCSS = `hsla(${rc.h}, ${rc.s}%, ${lightness}%, ${opacityMult})`;
                nodeHSLA = `hsla(${rc.h}, ${rc.s}%, ${lightness}%, ${(0.12 + pv * 0.2) * opacityMult})`;
            } else {
                const lightness = Math.round(65 + pv * 20);
                nodeCSS = `hsla(210, 80%, ${lightness}%, ${opacityMult})`;
                nodeHSLA = `hsla(210, 80%, ${lightness}%, ${(0.1 + pv * 0.2) * opacityMult})`;
            }

            if (size > 2) {
                ctx.beginPath();
                ctx.arc(s.x, s.y, size * 2.5, 0, Math.PI * 2);
                ctx.fillStyle = nodeHSLA;
                ctx.fill();
            }

            ctx.beginPath();
            ctx.arc(s.x, s.y, size, 0, Math.PI * 2);
            ctx.fillStyle = nodeCSS;
            if (size > 2) { ctx.shadowBlur = size * (2.5 + pv * 4); ctx.shadowColor = nodeCSS; }
            ctx.fill();
            ctx.shadowBlur = 0;
        };

        allParticles.forEach(node => drawNode(node));

        // Ghost root for the right tree (phase 2)
        if (dPhase === 2 && dp > 0.01) {
            const rootNode = this.nodes[this.addrMap.get('')];
            if (rootNode && rootNode.decomp2X_right != null) {
                const ghostX = (rootNode.decomp1X || rootNode.refX) + 
                    (rootNode.decomp2X_right - (rootNode.decomp1X || rootNode.refX)) * dp;
                const ghostY = (rootNode.decomp1Y || rootNode.refY) + 
                    (rootNode.decomp2Y_right - (rootNode.decomp1Y || rootNode.refY)) * dp;
                const ghostRoot = { ...rootNode, x: ghostX, y: ghostY, rootBranch: -1 };
                // Override: draw as white node fading in
                const s = this.diskToScreen(ghostX, ghostY);
                const size = Math.max(1.5, 7 * ds);
                const lightness = 90;
                ctx.beginPath();
                ctx.arc(s.x, s.y, size * 2.5, 0, Math.PI * 2);
                ctx.fillStyle = `hsla(0, 0%, ${lightness}%, ${0.15 * dp})`;
                ctx.fill();
                ctx.beginPath();
                ctx.arc(s.x, s.y, size, 0, Math.PI * 2);
                ctx.fillStyle = `hsla(0, 0%, ${lightness}%, ${dp})`;
                ctx.shadowBlur = size * 2.5; ctx.shadowColor = `hsl(0, 0%, ${lightness}%)`;
                ctx.fill();
                ctx.shadowBlur = 0;
            }
        }

        // Finish animation
        if (this.animating && this.animProgress >= 1) {
            this._finishAnimation();
        }

        requestAnimationFrame(() => this.animate());
    }

    easeInOut(t) {
        return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
    }

    // ════════════════════════════════════════
    // SO(3) MATRIX MATH & GENERATORS
    // ════════════════════════════════════════

    static MAT_A = [[1/3,2/3,2/3],[2/3,1/3,-2/3],[-2/3,2/3,-1/3]];
    static MAT_B = [[1/3,-2/3,-2/3],[-2/3,1/3,-2/3],[2/3,2/3,-1/3]];

    static mat3mul(a, b) {
        return a.map((row) =>
            [0,1,2].map(j => row[0]*b[0][j] + row[1]*b[1][j] + row[2]*b[2][j])
        );
    }

    static mat3t(m) {
        return [[m[0][0],m[1][0],m[2][0]],[m[0][1],m[1][1],m[2][1]],[m[0][2],m[1][2],m[2][2]]];
    }

    static genMat(g) {
        switch(g) {
            case 'a':  return DiskTreeViz.MAT_A;
            case 'ai': return DiskTreeViz.mat3t(DiskTreeViz.MAT_A);
            case 'b':  return DiskTreeViz.MAT_B;
            case 'bi': return DiskTreeViz.mat3t(DiskTreeViz.MAT_B);
        }
    }

    // Root children: 0=right→a, 1=up→b, 2=left→a⁻¹, 3=down→b⁻¹
    static ROOT_GENS = ['a', 'b', 'ai', 'bi'];

    // Non-root children: [CW off-axis, axis continuation, CCW off-axis]
    static CHILD_GENS = {
        a:  ['bi', 'a',  'b'],
        ai: ['b',  'ai', 'bi'],
        b:  ['a',  'b',  'ai'],
        bi: ['ai', 'bi', 'a']
    };
}
