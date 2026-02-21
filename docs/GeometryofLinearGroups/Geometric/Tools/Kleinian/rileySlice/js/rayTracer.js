import { getRileyPolynomial, gcd, Polynomial, reduceFraction } from './polynomial.js';

export class RayTracer {
    constructor(overlayCanvas, renderer) {
        this.canvas = overlayCanvas;
        this.ctx = overlayCanvas.getContext('2d');
        this.renderer = renderer;
        
        this.roots = [];
        this.maxDepth = -1;
        
        window.addEventListener('resize', () => this.resize());
        this.resize();
    }
    
    resize() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        this.canvas.style.width = w + "px";
        this.canvas.style.height = h + "px";
        
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = w * dpr;
        this.canvas.height = h * dpr;
        
        this.ctx.resetTransform();
        this.ctx.scale(dpr, dpr);
        
        this.render(); // force redraw
    }

    computeRoots(depthSetting) {
        if (this.maxDepth === depthSetting) return; // already computed
        setTimeout(() => this._computeRootsAsync(depthSetting), 0);
    }
    
    _computeRootsAsync(depthSetting) {
        this.maxDepth = depthSetting;
        let maxDenom = Math.min(depthSetting * 3 + 2, 23);
        
        let fractions = [];
        for (let q = 1; q <= maxDenom; q++) {
            for (let p = 0; p <= q; p++) {
                if (gcd(p, q) === 1) fractions.push({ p, q });
            }
        }
        
        this.roots = [];
        const agolTargets = [
            1.0, 1.41421356, 1.61803399, 1.73205081, 1.80193774, 1.84775907
        ];
        
        for (const frac of fractions) {
            const Q = getRileyPolynomial(frac.p, frac.q);
            if (!Q) continue;
            
            // Boundary: Q(rho) = ±2
            const pPlus = Q.add(Polynomial.fromConstant(2));
            const pMinus = Q.subtract(Polynomial.fromConstant(2));
            
            for (const r of pPlus.findRoots()) if (isFinite(r.re)) this.roots.push({ re: r.re, im: r.im, type: 'boundary', slope: frac.p/frac.q });
            for (const r of pMinus.findRoots()) if (isFinite(r.re)) this.roots.push({ re: r.re, im: r.im, type: 'boundary', slope: frac.p/frac.q });
            
            // Agol Orbifold Points
            for (let tg of agolTargets) {
                const aPlus = Q.add(Polynomial.fromConstant(tg));
                const aMinus = Q.subtract(Polynomial.fromConstant(tg));
                for (const r of aPlus.findRoots()) if (isFinite(r.re)) this.roots.push({ re: r.re, im: r.im, type: 'agol', slope: frac.p/frac.q });
                for (const r of aMinus.findRoots()) if (isFinite(r.re)) this.roots.push({ re: r.re, im: r.im, type: 'agol', slope: frac.p/frac.q });
            }
        }
        console.log(`RayTracer: Computed ${this.roots.length} pure roots from JS polynomial solver.`);
        this.render();
    }
    
    complexToScreen(cx, cy) {
        const w = window.innerWidth;
        const h = window.innerHeight;
        const aspect = w / h;
        
        // cssToComplex uses:
        // nx = (clientX - left) / w - 0.5
        // ny = (bottom - clientY) / h - 0.5
        // cx = centerX + nx * aspect / zoom
        // cy = centerY + ny / zoom
        
        // Inverting:
        // nx * aspect / zoom = cx - centerX  => nx = (cx - centerX) * zoom / aspect
        // ny / zoom = cy - centerY => ny = (cy - centerY) * zoom
        // clientX = (nx + 0.5) * w
        // clientY = h - (ny + 0.5) * h
        
        const nx = (cx - this.renderer.centerX) * this.renderer.zoom / aspect;
        const ny = (cy - this.renderer.centerY) * this.renderer.zoom;
        
        return {
            x: (nx + 0.5) * w,
            y: h - (ny + 0.5) * h
        };
    }
    
    render() {
        const width = window.innerWidth;
        const height = window.innerHeight;
        this.ctx.clearRect(0, 0, width, height);
        
        if (!this.renderer.showRays && !this.renderer.showAgol) return;
        
        const sizeZ = 0.8;
        const sizeRho = 1.4;
        
        for (const root of this.roots) {
            if (root.type === 'boundary' && !this.renderer.showRays) continue;
            if (root.type === 'agol' && !this.renderer.showAgol) continue;
            
            this.ctx.fillStyle = root.type === 'agol' ? 'rgba(230, 80, 80, 0.85)' : `hsla(${root.slope * 360}, 75%, 75%, 0.95)`;
            const dotSize = root.type === 'agol' ? 1.5 : 1.0;
            
            if (this.renderer.currentParam === 1) { // z space
                const rmag = Math.sqrt(root.re * root.re + root.im * root.im);
                const mag = Math.sqrt(rmag);
                const ang = Math.atan2(root.im, root.re) / 2.0;
                
                const z1x = mag * Math.cos(ang);
                const z1y = mag * Math.sin(ang);
                const z2x = -z1x;
                const z2y = -z1y;
                
                const s1 = this.complexToScreen(z1x, z1y);
                this.ctx.beginPath();
                this.ctx.arc(s1.x, s1.y, sizeZ * dotSize * (root.type==='agol'?1.5:1), 0, Math.PI * 2);
                this.ctx.fill();
                
                const s2 = this.complexToScreen(z2x, z2y);
                this.ctx.beginPath();
                this.ctx.arc(s2.x, s2.y, sizeZ * dotSize * (root.type==='agol'?1.5:1), 0, Math.PI * 2);
                this.ctx.fill();
                
            } else { // rho space
                const s = this.complexToScreen(root.re, root.im);
                this.ctx.beginPath();
                this.ctx.arc(s.x, s.y, sizeRho * dotSize * (root.type==='agol'?1.5:1), 0, Math.PI * 2);
                this.ctx.fill();
            }
        }
    }
}
