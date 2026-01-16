class BigFrac {
    constructor(n, d = 1n) {
        if (typeof n === 'number') n = BigInt(n);
        if (typeof d === 'number') d = BigInt(d);
        if (d === 0n) d = 1n;
        const common = this.gcd(n < 0n ? -n : n, d < 0n ? -d : d);
        this.n = n / common;
        this.d = d / common;
        if (this.d < 0n) { this.n = -this.n; this.d = -this.d; }
    }
    gcd(a, b) { return b === 0n ? a : this.gcd(b, a % b); }
    static from(val) { return val instanceof BigFrac ? val : new BigFrac(val); }
    add(b) { b = BigFrac.from(b); return new BigFrac(this.n * b.d + b.n * this.d, this.d * b.d); }
    sub(b) { b = BigFrac.from(b); return new BigFrac(this.n * b.d - b.n * this.d, this.d * b.d); }
    mul(b) { b = BigFrac.from(b); return new BigFrac(this.n * b.n, this.d * b.d); }
    div(b) { b = BigFrac.from(b); return (b.n === 0n) ? new BigFrac(0n) : new BigFrac(this.n * b.d, this.d * b.n); }

    val(p) {
        if (this.n === 0n) return 1000;
        let v = 0;
        let n = this.n < 0n ? -this.n : this.n;
        let d = this.d;
        while (n > 0n && n % BigInt(p) === 0n) { n /= BigInt(p); v++; }
        while (d > 0n && d % BigInt(p) === 0n) { d /= BigInt(p); v--; }
        return v;
    }

    // Correct residue mod p^n for the oriented tree
    // b mod p^n = p^n * ((b / p^n) mod 1)
    modPn(p, n) {
        const pBig = BigInt(p);
        const pn = (n >= 0) ? new BigFrac(pBig ** BigInt(n)) : new BigFrac(1n, pBig ** BigInt(-n));

        // val = this / pn
        const val = this.div(pn);
        // fractional part of val
        let rem = val.n % val.d;
        if (rem < 0n) rem += val.d;
        const frac = new BigFrac(rem, val.d);

        return pn.mul(frac);
    }

    toLatex() {
        if (this.n === 0n) return "0";
        if (this.d === 1n) return this.n.toString();
        // Use frac instead of raw to keep it clean
        return `${this.n}/${this.d}`;
    }
}

class BigMat {
    constructor(a, b, c, d) {
        this.a = BigFrac.from(a); this.b = BigFrac.from(b);
        this.c = BigFrac.from(c); this.d = BigFrac.from(d);
    }
    mul(other) {
        return new BigMat(
            this.a.mul(other.a).add(this.b.mul(other.c)),
            this.a.mul(other.b).add(this.b.mul(other.d)),
            this.c.mul(other.a).add(this.d.mul(other.c)),
            this.c.mul(other.b).add(this.d.mul(other.d))
        );
    }

    getOrientedIwasawa(p) {
        let a = this.a, b = this.b, c = this.c, d = this.d;

        // (1) Ensure v(c) >= v(d)
        if (c.val(p) < d.val(p)) {
            let tA = a, tC = c;
            a = b; c = d;
            b = tA; d = tC;
        }

        // (2) Elimination: C1 = C1 - (c/d)C2
        const k = c.div(d);
        a = a.sub(k.mul(b));
        // c = 0

        // (3) Scale so d = 1
        a = a.div(d);
        b = b.div(d);

        // (4) n = v(a)
        const n = a.val(p);

        // (5) Labeled representative [q]_n
        // q = b mod p^n
        const q = b.modPn(p, n);

        return { n, q };
    }
}

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
        this.canvas.addEventListener('mousedown', e => {
            this.mouseState.isDragging = true;
            this.mouseState.lastX = e.clientX;
            this.mouseState.lastY = e.clientY;
        });
        window.addEventListener('mouseup', () => this.mouseState.isDragging = false);
        window.addEventListener('mousemove', e => {
            if (this.mouseState.isDragging) {
                this.view.x += (e.clientX - this.mouseState.lastX) / this.view.scale;
                this.view.y += (e.clientY - this.mouseState.lastY) / this.view.scale;
                this.mouseState.lastX = e.clientX;
                this.mouseState.lastY = e.clientY;
            }
            this.updateTooltip(e);
        });
        this.canvas.addEventListener('wheel', e => {
            e.preventDefault();
            this.view.scale *= (e.deltaY < 0 ? 1.1 : 0.9);
            this.view.scale = Math.min(Math.max(this.view.scale, 0.001), 1000);
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

    reset() {
        this.p = parseInt(document.getElementById('prime-p').value) || 2;
        const maxDepth = parseInt(document.getElementById('max-depth').value) || 5;
        const trunkHeight = parseInt(document.getElementById('trunk-height').value) || 3;

        this.nodes = [];
        this.particles = [];
        this.view = { x: 0, y: 0, scale: 0.4 };

        const p = this.p;
        const build = (n, q, x, y, parentIdx, width) => {
            const idx = this.nodes.length;
            const mat = new BigMat(this.safePow(p, n), q, 0, 1);
            this.nodes.push({ n, q, x, y, parentIdx, mat });

            if (n >= maxDepth) return;

            const nextWidth = width / p;
            for (let u = 0; u < p; u++) {
                const qNext = q.add(new BigFrac(BigInt(u)).mul(this.safePow(p, n)));
                build(n + 1, qNext, x + (u - (p - 1) / 2) * width, y + 150, idx, nextWidth);
            }
        };

        // Initialize from n = -trunkHeight to show the stem
        build(-trunkHeight, new BigFrac(0), 0, -trunkHeight * 100, -1, 400 + trunkHeight * 50);

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
            const target = this.nodes.find(n => n.n === iwa.n && n.q.n === iwa.q.n && n.q.d === iwa.q.d);
            if (target) pObj.targetPos = { x: target.x, y: target.y };
            else pObj.targetPos = { x: (Math.random() - 0.5) * 2000, y: iwa.n * 150 - 150 };
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
        ctx.strokeStyle = 'rgba(99, 102, 241, 0.25)';
        ctx.lineWidth = 4 / this.view.scale;
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
