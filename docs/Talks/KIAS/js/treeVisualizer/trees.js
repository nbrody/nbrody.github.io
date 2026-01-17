class PAdicTreeViz {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.p = 2;
        this.nodes = [];
        this.particles = [];
        this.view = { x: 0, y: 0, scale: 0.6 };
        this.mouseState = { isDragging: false, lastX: 0, lastY: 0 };
        this.tooltip = document.getElementById('tooltip');

        this.resize();
        window.addEventListener('resize', () => this.resize());
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
        for (let p of this.particles) {
            const sx = centerX + (p.pos.x + this.view.x) * this.view.scale;
            const sy = centerY + (p.pos.y + this.view.y) * this.view.scale;
            if (Math.sqrt((mx - sx) ** 2 + (my - sy) ** 2) < 20 * this.view.scale) { found = p; break; }
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

    getVertexPos(q, n) {
        const ySpacing = 180;
        const ratio = 1.0 / (this.p + 0.3);
        const baseW = 1000;
        const startK = -8; // Fixed reference level for the coordinate system

        let x = n * 50; // Invariant slant

        for (let k = startK; k < n; k++) {
            const digitVal = q.div(this.safePow(this.p, k)).modPn(this.p, 1);
            const u = Number(digitVal.n);

            // Width policy: keep it wide at the top, decay as we go deeper
            const wk = baseW * Math.pow(ratio, Math.max(0, k + 3));

            x += (u - (this.p - 1) / 2.0) * wk;
        }

        return { x, y: n * ySpacing };
    }

    reset() {
        this.p = parseInt(document.getElementById('prime-p').value) || 2;
        const maxDepth = parseInt(document.getElementById('max-depth').value) || 5;
        const trunkHeight = parseInt(document.getElementById('trunk-height').value) || 3;

        this.nodes = [];
        this.particles = [];
        this.view = { x: 0, y: 0, scale: 0.4 };

        const p = this.p;
        const build = (n, q, parentIdx) => {
            const idx = this.nodes.length;
            const { x, y } = this.getVertexPos(q, n);
            const mat = new BigMat(this.safePow(p, n), q, 0, 1);
            this.nodes.push({ n, q, x, y, parentIdx, mat });

            if (n >= maxDepth) return;

            for (let u = 0; u < p; u++) {
                const qNext = q.add(new BigFrac(BigInt(u)).mul(this.safePow(p, n)));
                build(n + 1, qNext, idx);
            }
        };

        // Initialize from n = -trunkHeight to show the stem
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
            // Every vertex [q]_n has a unique position
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

        this.particles.forEach(p => {
            p.pos.x += (p.targetPos.x - p.pos.x) * 0.1;
            p.pos.y += (p.targetPos.y - p.pos.y) * 0.1;
        });

        // Edges
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 2 / this.view.scale;

        // Stem to infinity for the root
        const rootIdx = this.nodes.findIndex(n => n.parentIdx === -1);
        if (rootIdx !== -1) {
            const pRoot = this.particles[rootIdx];
            ctx.beginPath();
            ctx.moveTo(pRoot.pos.x, pRoot.pos.y);
            ctx.lineTo(pRoot.pos.x, pRoot.pos.y - 250);
            ctx.stroke();
        }
        for (let i = 0; i < this.particles.length; i++) {
            const p = this.particles[i];
            const n = this.nodes[i];
            if (n && n.parentIdx !== -1) {
                const parent = this.particles[n.parentIdx];
                if (parent) {
                    ctx.beginPath();
                    ctx.moveTo(parent.pos.x, parent.pos.y);
                    ctx.lineTo(p.pos.x, p.pos.y);
                    ctx.stroke();
                }
            }
        }

        this.particles.forEach(p => {
            const iwa = p.getIwa();
            const size = Math.max(2, 25 * Math.pow(0.8, iwa.n + 2)) / this.view.scale;
            ctx.beginPath();
            ctx.arc(p.pos.x, p.pos.y, size, 0, Math.PI * 2);
            ctx.fillStyle = p.color;
            ctx.shadowBlur = size * this.view.scale * 1.5;
            ctx.shadowColor = p.color;
            ctx.fill();
        });

        ctx.restore();
        requestAnimationFrame(() => this.animate());
    }
}
