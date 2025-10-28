// Riley Slice Visualization
// Computes and displays roots of P(p/q) = Q(p/q) + 2 for multiple fractions

class RileySlice {
    constructor(canvasId, maxDenom = 15) {
        this.canvas = document.getElementById(canvasId);
        if (!this.canvas) {
            console.error('Riley Slice: Canvas not found with id:', canvasId);
            return;
        }
        this.ctx = this.canvas.getContext('2d');
        this.maxDenom = maxDenom;
        this.polynomials = {};
        this.allRoots = [];
        console.log('Riley Slice: Canvas found, size:', this.canvas.width, 'x', this.canvas.height);
    }

    // Generate all reduced fractions with denominator up to maxDenom
    generateFractions() {
        const fractions = [];
        for (let q = 1; q <= this.maxDenom; q++) {
            for (let p = 0; p <= q; p++) {
                if (gcd(p, q) === 1) {
                    fractions.push({p, q});
                }
            }
        }
        fractions.sort((f1, f2) => f1.p * f2.q - f2.p * f1.q);
        return fractions;
    }

    // Compute all Riley polynomials using the recursive formula
    computePolynomials() {
        // Check dependencies
        if (typeof gcd === 'undefined' || typeof areFareyNeighbors === 'undefined' || typeof Polynomial === 'undefined') {
            console.error('Riley Slice: Required functions not available. Make sure polynomial.js and rileyPolynomials.js are loaded first.');
            return;
        }

        this.polynomials = {};

        // Initial conditions
        this.polynomials['0/1'] = new Polynomial([2, 0, -1]); // 2 - z^2
        this.polynomials['1/1'] = new Polynomial([2, 0, 1]); // 2 + z^2
        this.polynomials['1/2'] = new Polynomial([2, 0, 0, 0, 1]); // 2 + z^4

        const fractions = this.generateFractions();

        // Keep applying the recursive rule until no new polynomials can be computed
        let changed = true;
        let iterations = 0;
        const maxIterations = 100;

        while (changed && iterations < maxIterations) {
            changed = false;
            iterations++;

            // Try to compute each unknown fraction using all possible Farey neighbor pairs
            for (const target of fractions) {
                const targetKey = `${target.p}/${target.q}`;

                if (this.polynomials[targetKey]) continue; // Already computed

                // Find all ways to express target as mediant of Farey neighbors
                for (let i = 0; i < fractions.length; i++) {
                    for (let j = i + 1; j < fractions.length; j++) {
                        const f1 = fractions[i];
                        const f2 = fractions[j];

                        // Check if f1 and f2 are Farey neighbors
                        if (!areFareyNeighbors(f1.p, f1.q, f2.p, f2.q)) continue;

                        // Check if target is the mediant of f1 and f2
                        const mediant = {
                            p: f1.p + f2.p,
                            q: f1.q + f2.q
                        };
                        const g = gcd(mediant.p, mediant.q);
                        mediant.p /= g;
                        mediant.q /= g;

                        if (mediant.p !== target.p || mediant.q !== target.q) continue;

                        // We found that target = (f1 + f2) in lowest terms
                        const leftKey = `${f1.p}/${f1.q}`;
                        const rightKey = `${f2.p}/${f2.q}`;

                        // Compute the difference fraction (b-a)/(d-c)
                        const diff = {
                            p: Math.abs(f2.p - f1.p),
                            q: Math.abs(f2.q - f1.q)
                        };
                        if (diff.q === 0) continue; // Skip if denominator is 0

                        const gDiff = gcd(diff.p, diff.q);
                        diff.p /= gDiff;
                        diff.q /= gDiff;
                        const diffKey = `${diff.p}/${diff.q}`;

                        // Check if we have all required polynomials
                        if (this.polynomials[leftKey] && this.polynomials[rightKey] && this.polynomials[diffKey]) {
                            // Q((a+b)/(c+d)) = 8 - (Q(a/c)Q(b/d) + Q((b-a)/(d-c)))
                            const product = this.polynomials[leftKey].multiply(this.polynomials[rightKey]);
                            const sum = product.add(this.polynomials[diffKey]);
                            this.polynomials[targetKey] = Polynomial.fromConstant(8).subtract(sum);
                            changed = true;
                            break; // Found a way to compute this polynomial
                        }
                    }
                    if (this.polynomials[targetKey]) break; // Already computed
                }
            }
        }
    }

    // Compute roots of P(p/q) = Q(p/q) + 2 for all computed polynomials
    computeAllRoots() {
        this.allRoots = [];

        for (const key in this.polynomials) {
            const P = this.polynomials[key].add(Polynomial.fromConstant(2));
            const roots = P.findRoots();

            for (const root of roots) {
                this.allRoots.push({
                    re: root.re,
                    im: root.im,
                    polynomial: key
                });
            }
        }
    }

    // Draw the Riley slice visualization
    draw() {
        if (!this.canvas || !this.ctx) {
            console.error('Riley Slice: Cannot draw, canvas or context not available');
            return;
        }

        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.allRoots.length === 0) {
            console.warn('Riley Slice: No roots to draw');
            return;
        }

        // Find bounds
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
        for (const root of this.allRoots) {
            minX = Math.min(minX, root.re);
            maxX = Math.max(maxX, root.re);
            minY = Math.min(minY, root.im);
            maxY = Math.max(maxY, root.im);
        }

        console.log('Riley Slice: Bounds before padding:', { minX, maxX, minY, maxY });

        // Add padding
        const padX = (maxX - minX) * 0.1 || 1;
        const padY = (maxY - minY) * 0.1 || 1;
        minX -= padX;
        maxX += padX;
        minY -= padY;
        maxY += padY;

        console.log('Riley Slice: Bounds after padding:', { minX, maxX, minY, maxY });

        // Draw axes
        this.drawAxes(minX, maxX, minY, maxY);

        // Draw roots
        let drawnCount = 0;
        for (let i = 0; i < this.allRoots.length; i++) {
            const root = this.allRoots[i];
            const x = this.mapX(root.re, minX, maxX);
            const y = this.mapY(root.im, minY, maxY);

            if (i < 3) {
                console.log(`Riley Slice: Root ${i}: re=${root.re}, im=${root.im} -> canvas (${x}, ${y})`);
            }

            this.ctx.beginPath();
            this.ctx.arc(x, y, 3, 0, 2 * Math.PI);
            this.ctx.fillStyle = '#667eea';
            this.ctx.strokeStyle = '#4c51bf';
            this.ctx.lineWidth = 1;
            this.ctx.fill();
            this.ctx.stroke();
            drawnCount++;
        }
        console.log('Riley Slice: Drew', drawnCount, 'roots');
    }

    drawAxes(minX, maxX, minY, maxY) {
        this.ctx.strokeStyle = '#ddd';
        this.ctx.lineWidth = 1;

        // X-axis
        const y0 = this.mapY(0, minY, maxY);
        this.ctx.beginPath();
        this.ctx.moveTo(0, y0);
        this.ctx.lineTo(this.canvas.width, y0);
        this.ctx.stroke();

        // Y-axis
        const x0 = this.mapX(0, minX, maxX);
        this.ctx.beginPath();
        this.ctx.moveTo(x0, 0);
        this.ctx.lineTo(x0, this.canvas.height);
        this.ctx.stroke();

        // Add labels
        this.ctx.fillStyle = '#666';
        this.ctx.font = '12px Arial';
        this.ctx.fillText('Re(z)', this.canvas.width - 40, y0 - 5);
        this.ctx.fillText('Im(z)', x0 + 5, 15);

        // Draw tick marks
        this.ctx.strokeStyle = '#eee';
        this.ctx.lineWidth = 0.5;
        for (let x = Math.ceil(minX); x <= Math.floor(maxX); x++) {
            if (x === 0) continue;
            const px = this.mapX(x, minX, maxX);
            this.ctx.beginPath();
            this.ctx.moveTo(px, 0);
            this.ctx.lineTo(px, this.canvas.height);
            this.ctx.stroke();
            this.ctx.fillStyle = '#666';
            this.ctx.fillText(x.toString(), px - 5, y0 + 15);
        }
        for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) {
            if (y === 0) continue;
            const py = this.mapY(y, minY, maxY);
            this.ctx.beginPath();
            this.ctx.moveTo(0, py);
            this.ctx.lineTo(this.canvas.width, py);
            this.ctx.stroke();
            this.ctx.fillStyle = '#666';
            this.ctx.fillText(y.toString(), x0 + 5, py + 5);
        }
    }

    mapX(x, minX, maxX) {
        return ((x - minX) / (maxX - minX)) * this.canvas.width;
    }

    mapY(y, minY, maxY) {
        return this.canvas.height - ((y - minY) / (maxY - minY)) * this.canvas.height;
    }

    // Initialize and draw
    initialize() {
        this.computePolynomials();
        this.computeAllRoots();
        this.draw();
    }
}

// Initialize Riley Slice on page load
window.addEventListener('DOMContentLoaded', () => {
    console.log('Riley Slice: Initializing...');
    const rileySlice = new RileySlice('rileySliceCanvas', 30);
    console.log('Riley Slice: Computing polynomials...');
    rileySlice.computePolynomials();
    console.log('Riley Slice: Polynomials computed:', Object.keys(rileySlice.polynomials).length);
    console.log('Riley Slice: Computing roots...');
    rileySlice.computeAllRoots();
    console.log('Riley Slice: Roots found:', rileySlice.allRoots.length);
    console.log('Riley Slice: Drawing...');
    rileySlice.draw();
    console.log('Riley Slice: Complete!');
});
