class TilingEngine {
    constructor() {
        this.z0 = { re: 0, im: 1 };
        this.baseVertices = [];
        this.domainGens = [];
        this.initGens();
    }

    getGeodesic(p1, p2) {
        const x1 = p1.re, y1 = p1.im;
        const x2 = p2.re, y2 = p2.im;
        if (Math.abs(x1 - x2) < 1e-8) {
            return { type: 'line', x: x1 };
        }
        const center = (x2 * x2 + y2 * y2 - x1 * x1 - y1 * y1) / (2 * (x2 - x1));
        const radius = Math.sqrt((x1 - center) ** 2 + y1 ** 2);
        return { type: 'circle', c: center, r: radius };
    }

    initGens() {
        const a = new BigMat("3", "0", "0", "1/3");
        const b = new BigMat("41/4", "1/4", "9/8", "1/8");
        const A = a.inv();
        const B = b.inv();

        this.domainGens = [
            a,                   // a
            A,                   // A
            a.mul(a).mul(B),     // aaB
            a.mul(B).mul(a),     // aBa
            A.mul(b).mul(A),     // AbA
            b.mul(A).mul(A)      // bAA
        ];
    }

    getBisector(p1, p2) {
        const x1 = p1.re, y1 = p1.im;
        const x2 = p2.re, y2 = p2.im;
        if (Math.abs(y1 - y2) < 1e-8) {
            return { type: 'line', x: (x1 + x2) / 2 };
        }
        const dy = y2 - y1;
        const b = -(y2 * x1 - y1 * x2) / dy;
        const c = (y2 * (x1 * x1 + y1 * y1) - y1 * (x2 * x2 + y2 * y2)) / dy;
        const centerX = -b;
        const r2 = b * b - c;
        if (r2 < 0) return { type: 'line', x: (x1 + x2) / 2 };
        return { type: 'circle', c: centerX, r: Math.sqrt(r2) };
    }

    intersect(b1, b2) {
        if (b1.type === 'circle' && b2.type === 'circle') {
            if (Math.abs(b1.c - b2.c) < 1e-8) return null;
            const x = (b1.r ** 2 - b2.r ** 2 + b2.c ** 2 - b1.c ** 2) / (2 * (b2.c - b1.c));
            const y2 = b1.r ** 2 - (x - b1.c) ** 2;
            if (y2 < 0) return null;
            return { re: x, im: Math.sqrt(y2) };
        } else if (b1.type === 'line' && b2.type === 'circle') {
            const x = b1.x;
            const y2 = b2.r ** 2 - (x - b2.c) ** 2;
            if (y2 < 0) return null;
            return { re: x, im: Math.sqrt(y2) };
        } else if (b1.type === 'circle' && b2.type === 'line') {
            return this.intersect(b2, b1);
        }
        return null;
    }

    hDist(z1, z2) {
        const dx = z1.re - z2.re;
        const dy = z1.im - z2.im;
        const d2 = dx * dx + dy * dy;
        return Math.acosh(1 + d2 / (2 * z1.im * z2.im));
    }

    isInside(p) {
        if (p.im <= 0) return false;
        const d0 = this.hDist(this.z0, p);
        for (let g of this.domainGens) {
            const gi = g.action(this.z0);
            const di = this.hDist(gi, p);
            if (di < d0 - 1e-5) return false;
        }
        return true;
    }

    computeFundamentalDomain() {
        const bisectors = this.domainGens.map(g => this.getBisector(this.z0, g.action(this.z0)));
        const intersections = [];
        for (let i = 0; i < bisectors.length; i++) {
            for (let j = i + 1; j < bisectors.length; j++) {
                const p = this.intersect(bisectors[i], bisectors[j]);
                if (p && this.isInside(p)) {
                    intersections.push(p);
                }
            }
        }

        const unique = [];
        intersections.forEach(p => {
            if (!unique.some(u => Math.abs(u.re - p.re) < 1e-4 && Math.abs(u.im - p.im) < 1e-4)) {
                unique.push(p);
            }
        });

        this.baseVertices = unique.sort((a, b) => {
            return Math.atan2(a.im - this.z0.im, a.re - this.z0.re) -
                Math.atan2(b.im - this.z0.im, b.re - this.z0.re);
        });

        return this.baseVertices;
    }

    getTilingOrbit(maxTiles = 500) {
        const orbit = [{ g: new BigMat(1, 0, 0, 1), depth: 0 }];
        const queue = [orbit[0]];
        const seen = new Set(["1:0:0:1"]);
        const gens = this.domainGens;

        while (queue.length > 0 && orbit.length < maxTiles) {
            const curr = queue.shift();
            if (curr.depth >= 4) continue;
            for (let g of gens) {
                const next = g.mul(curr.g);
                // Simple key for BFS. In PSL(2,Q), we should ideally normalize to det 1 
                // and choose a canonical sign, but for these generators it should be stable.
                const key = `${next.a.toString()}:${next.b.toString()}:${next.c.toString()}:${next.d.toString()}`;
                if (!seen.has(key)) {
                    seen.add(key);
                    const obj = { g: next, depth: curr.depth + 1 };
                    orbit.push(obj);
                    queue.push(obj);
                }
            }
        }
        // Sort by visual size (approximation: distance of g.z0 from z0)
        orbit.sort((a, b) => {
            const da = this.hDist(this.z0, a.g.action(this.z0));
            const db = this.hDist(this.z0, b.g.action(this.z0));
            return da - db;
        });

        return orbit;
    }
}
window.TilingEngine = TilingEngine;
