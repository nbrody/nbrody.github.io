class PAdicTreeViz {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.p = 2;
        this.nodes = [];
        this.particles = [];
        // Center view more appropriately for global coordinates
        this.view = { x: 0, y: 0, scale: 0.3 };
        this.mouseState = { isDragging: false, lastX: 0, lastY: 0 };
        this.tooltip = document.getElementById('tooltip');
        this.layoutMethod = 'slanted';

        this.resize();
        window.addEventListener('resize', () => this.resize());
        document.getElementById('x-spread')?.addEventListener('input', () => this.reset());
        this.setupControls();
        this.reset();
        this.animate();
    }

    resize() {
        this.canvas.width = this.canvas.clientWidth * window.devicePixelRatio;
        this.canvas.height = this.canvas.clientHeight * window.devicePixelRatio;
    }

    safePow(p, n) {
        const pBig = BigInt(p);
        if (n >= 0) return new BigFrac(pBig ** BigInt(n));
        return new BigFrac(1n, pBig ** BigInt(-n));
    }

    setupControls() {
        const getMouseInternal = (e) => {
            const rect = this.canvas.getBoundingClientRect();
            const sx = (e.clientX - rect.left) * window.devicePixelRatio - this.canvas.width / 2;
            const sy = (e.clientY - rect.top) * window.devicePixelRatio - this.canvas.height / 2;
            return {
                x: sx / this.view.scale - this.view.x,
                y: sy / this.view.scale - this.view.y,
                sx, sy
            };
        };

        this.canvas.addEventListener('mousedown', e => {
            this.mouseState.isDragging = true;
            this.mouseState.lastX = e.clientX;
            this.mouseState.lastY = e.clientY;
        });
        window.addEventListener('mouseup', () => this.mouseState.isDragging = false);
        window.addEventListener('mousemove', e => {
            if (this.mouseState.isDragging) {
                const dx = (e.clientX - this.mouseState.lastX) * window.devicePixelRatio;
                const dy = (e.clientY - this.mouseState.lastY) * window.devicePixelRatio;
                this.view.x += dx / this.view.scale;
                this.view.y += dy / this.view.scale;
                this.mouseState.lastX = e.clientX;
                this.mouseState.lastY = e.clientY;
            }
            this.updateTooltip(e);
        });
        this.canvas.addEventListener('wheel', e => {
            e.preventDefault();
            const mouseBefore = getMouseInternal(e);
            const zoomFactor = (e.deltaY < 0 ? 1.1 : 0.9);
            const newScale = Math.min(Math.max(this.view.scale * zoomFactor, 0.001), 1000);
            this.view.x = mouseBefore.sx / newScale - mouseBefore.x;
            this.view.y = mouseBefore.sy / newScale - mouseBefore.y;
            this.view.scale = newScale;
        }, { passive: false });
    }

    updateTooltip(e) {
        const rect = this.canvas.getBoundingClientRect();
        const mx = (e.clientX - rect.left) * window.devicePixelRatio;
        const my = (e.clientY - rect.top) * window.devicePixelRatio;
        const centerX = this.canvas.width / 2;
        const centerY = this.canvas.height / 2;

        let found = null;
        for (let pObj of this.particles) {
            const sx = centerX + (pObj.pos.x + this.view.x) * this.view.scale;
            const sy = centerY + (pObj.pos.y + this.view.y) * this.view.scale;
            if (Math.sqrt((mx - sx) ** 2 + (my - sy) ** 2) < 20 * this.view.scale) { found = pObj; break; }
        }

        if (found) {
            const sx = centerX + (found.pos.x + this.view.x) * this.view.scale;
            const sy = centerY + (found.pos.y + this.view.y) * this.view.scale;
            this.tooltip.style.display = 'block';
            this.tooltip.style.left = (rect.left + sx / window.devicePixelRatio + 15) + 'px';
            this.tooltip.style.top = (rect.top + sy / window.devicePixelRatio - 15) + 'px';
            const iwa = found.getIwa();
            this.tooltip.innerHTML = `\\(\\lfloor ${iwa.q.toLatex()} \\rfloor_{${iwa.n}}\\)`;
            MathJax.typesetPromise([this.tooltip]);
        } else {
            this.tooltip.style.display = 'none';
        }
    }

    getDigit(q, p, k) {
        if (q.n === 0n) return 0;
        const v1 = q.modPn(p, k + 1);
        const v2 = q.modPn(p, k);
        const diff = v1.sub(v2);
        const pK = this.safePow(p, k);
        const digitFrac = diff.div(pK);
        return Number(digitFrac.n);
    }

    // Global Y coordinate anchored to rootN=0
    getY(n) {
        const initialSpacing = 600;
        const decay = 0.7;

        // Exponential shrinkage towards leaves (n > 0)
        // Linear growth towards infinity (n < 0) for action stability
        if (n <= 0) return n * initialSpacing;
        return initialSpacing * (1 - Math.pow(decay, n)) / (1 - decay);
    }

    // Global width calculation for level k (anchored to k=0)
    getWk(k, baseW, ratio) {
        return baseW * Math.pow(ratio, k);
    }

    // Truly global X coordinate: sum from valuation up to level n
    getGlobalX(q, p, n, baseW, ratio) {
        if (q.n === 0n) return 0;
        const val = q.val(p);
        let x = 0;
        for (let k = val; k < n; k++) {
            const u = this.getDigit(q, p, k);
            x += (u - (p - 1) / 2.0) * this.getWk(k, baseW, ratio);
        }
        return x;
    }

    getVertexPosEven(q, n) {
        const p = this.p;
        const baseW = (parseInt(document.getElementById('x-spread')?.value) || 2200);
        const ratio = 1.0 / (p + 1.15);
        const x = this.getGlobalX(q, p, n, baseW, ratio);
        return { x, y: this.getY(n) };
    }

    getVertexPosSlanted(q, p, n) {
        const baseW = (parseInt(document.getElementById('x-spread')?.value) || 2200);
        const ratio = 1.0 / (p + 1.15);

        // Spine is strictly x = y * slope. 
        // Note: slope must be calculated based on level 0 geometry for consistency
        const slope = (-(p - 1) / 2.0 * baseW * 0.15) / 600.0;
        const getSpineX = (k) => this.getY(k) * slope;

        if (q.n === 0n || q.val(p) >= n) {
            return { x: getSpineX(n), y: this.getY(n) };
        }

        const v = q.val(p);
        const exitDigit = this.getDigit(q, p, v);

        let x = getSpineX(v);
        // First branch digit offset relative to u=0 spinal trunk
        x += (exitDigit - 0) * this.getWk(v, baseW, ratio);

        // Subsequent internal branching behavior
        for (let k = v + 1; k < n; k++) {
            const u = this.getDigit(q, p, k);
            x += (u - (p - 1) / 2.0) * this.getWk(k, baseW, ratio);
        }
        return { x, y: this.getY(n) };
    }

    getVertexPos(q, n) {
        if (this.layoutMethod === 'slanted') {
            return this.getVertexPosSlanted(q, this.p, n);
        } else {
            return this.getVertexPosEven(q, n);
        }
    }

    reset() {
        this.p = parseInt(document.getElementById('prime-p').value) || 2;
        const p = this.p;
        const trunkHeight = parseInt(document.getElementById('trunk-height').value) || 3;

        const maxNodes = 25000;
        const totalLevelsLimit = Math.floor(Math.log(maxNodes) / Math.log(p));
        const maxAvailableDepth = Math.max(0, totalLevelsLimit - trunkHeight - 1);

        let userMaxDepth = parseInt(document.getElementById('max-depth').value) || 5;
        if (userMaxDepth > maxAvailableDepth) userMaxDepth = maxAvailableDepth;

        const layoutSelect = document.getElementById('layout-method');
        this.layoutMethod = layoutSelect ? layoutSelect.value : 'slanted';

        this.nodes = [];
        this.particles = [];
        const build = (n, q, parentIdx) => {
            const idx = this.nodes.length;
            const { x, y } = this.getVertexPos(q, n);
            const mat = new BigMat(this.safePow(p, n), q, 0, 1);
            this.nodes.push({ n, q, x, y, parentIdx, mat });
            if (n >= userMaxDepth) return;
            for (let u = 0; u < p; u++) {
                const qNext = q.add(new BigFrac(BigInt(u)).mul(this.safePow(p, n)));
                build(n + 1, qNext, idx);
            }
        };

        build(-trunkHeight, new BigFrac(0), -1);
        this.particles = this.nodes.map(n => ({
            mat: n.mat,
            pos: { x: n.x, y: n.y },
            targetPos: { x: n.x, y: n.y },
            color: `hsl(${220 - n.n * 30}, 80%, 60%)`,
            getIwa: function () { return this.mat.getOrientedIwasawa(p); }
        }));
    }

    animateAction(gArr, p) {
        this.p = p;
        const g = new BigMat(gArr[0], gArr[1], gArr[2], gArr[3]);
        this.particles.forEach(pObj => {
            pObj.mat = g.mul(pObj.mat);
            const iwa = pObj.mat.getOrientedIwasawa(p);
            const pos = this.getVertexPos(iwa.q, iwa.n);
            pObj.targetPos = { x: pos.x, y: pos.y };
        });
    }

    animate() {
        const { ctx, canvas } = this;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.save();
        ctx.translate(canvas.width / 2, canvas.height / 2);
        ctx.scale(this.view.scale, this.view.scale);
        ctx.translate(this.view.x, this.view.y);

        this.particles.forEach(pObj => {
            pObj.pos.x += (pObj.targetPos.x - pObj.pos.x) * 0.1;
            pObj.pos.y += (pObj.targetPos.y - pObj.pos.y) * 0.1;
        });

        // Infinite Stem Drawing
        const trunkHeight = parseInt(document.getElementById('trunk-height').value) || 3;
        const rootIdx = this.nodes.findIndex(node => node.parentIdx === -1);
        if (rootIdx !== -1) {
            const pRoot = this.particles[rootIdx];
            // Find a point much further up the trunk for a global orientation
            const p0 = this.getVertexPosSlanted(new BigFrac(0), this.p, -100);
            ctx.beginPath();
            ctx.strokeStyle = 'rgba(255, 255, 255, 0.4)';
            ctx.lineWidth = 4 / this.view.scale;
            ctx.moveTo(pRoot.pos.x, pRoot.pos.y);
            ctx.lineTo(p0.x, p0.y);
            ctx.stroke();
        }

        for (let i = 0; i < this.particles.length; i++) {
            const pObj = this.particles[i];
            const n = this.nodes[i];
            if (n && n.parentIdx !== -1) {
                const parent = this.particles[n.parentIdx];
                if (parent) {
                    const isTrunk = (n.q.n === 0n && this.nodes[n.parentIdx].q.n === 0n);
                    ctx.beginPath();
                    ctx.strokeStyle = isTrunk ? 'rgba(255, 255, 255, 0.4)' : 'rgba(255, 255, 255, 0.15)';
                    ctx.lineWidth = (isTrunk ? 4 : 2) / this.view.scale;
                    ctx.moveTo(parent.pos.x, parent.pos.y);
                    ctx.lineTo(pObj.pos.x, pObj.pos.y);
                    ctx.stroke();
                }
            }
        }

        this.particles.forEach(pObj => {
            const iwa = pObj.getIwa();
            const size = Math.max(2, 25 * Math.pow(0.8, iwa.n + 2)) / this.view.scale;
            ctx.beginPath();
            ctx.arc(pObj.pos.x, pObj.pos.y, size, 0, Math.PI * 2);
            ctx.fillStyle = pObj.color;
            ctx.shadowBlur = size * this.view.scale * 1.5;
            ctx.shadowColor = pObj.color;
            ctx.fill();
        });

        ctx.restore();
        requestAnimationFrame(() => this.animate());
    }
}
