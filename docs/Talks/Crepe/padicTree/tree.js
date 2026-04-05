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
        if (this.animating) return;

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

        // Disk boundary
        const bc = this.diskToScreen(0, 0);
        const br = this.radius * this.view.scale;
        ctx.beginPath();
        ctx.arc(bc.x, bc.y, br, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(124, 138, 255, 0.12)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        const dg = ctx.createRadialGradient(bc.x, bc.y, 0, bc.x, bc.y, br);
        dg.addColorStop(0, 'rgba(124, 138, 255, 0.03)');
        dg.addColorStop(1, 'rgba(124, 138, 255, 0.005)');
        ctx.fillStyle = dg;
        ctx.fill();

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
            // Group edges by level AND rootBranch for per-region coloring
            for (let l in levels) {
                const lv = parseInt(l);
                const pv = pulseFn(lv);
                const lw = Math.max(0.4, (2.5 - lv * 0.3) * this.view.scale) * (1 + pv * 0.6);
                if (lw < 0.2) continue;
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
        allParticles.forEach(node => {
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
            if (rc) {
                const lightness = Math.min(90, rc.l + pv * 25);
                nodeCSS = `hsl(${rc.h}, ${rc.s}%, ${lightness}%)`;
                nodeHSLA = `hsla(${rc.h}, ${rc.s}%, ${lightness}%, ${0.12 + pv * 0.2})`;
            } else {
                const lightness = Math.round(65 + pv * 20);
                nodeCSS = `hsl(210, 80%, ${lightness}%)`;
                nodeHSLA = `hsla(210, 80%, ${lightness}%, ${0.1 + pv * 0.2})`;
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
        });

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
