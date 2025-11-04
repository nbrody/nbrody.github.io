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
        this.hoveredPolynomial = null;
        this.clickedRoot = null; // Store the specific clicked root
        this.bounds = { minX: 0, maxX: 1, minY: 0, maxY: 1 };
        console.log('Riley Slice: Canvas found, size:', this.canvas.width, 'x', this.canvas.height);

        // Add mouse event listeners
        this.canvas.addEventListener('mousemove', (e) => this.handleMouseMove(e));
        this.canvas.addEventListener('mouseleave', () => this.handleMouseLeave());
        this.canvas.addEventListener('click', (e) => this.handleClick(e));
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
            const Q = this.polynomials[key];
            const P = Q.add(Polynomial.fromConstant(2));

            // Debug for 0/1
            if (key === '0/1') {
                console.log('Debug 0/1:');
                console.log('  Q(0/1) coeffs:', Q.coeffs);
                console.log('  Q(0/1) LaTeX:', Q.toLatex());
                console.log('  P(0/1) coeffs:', P.coeffs);
                console.log('  P(0/1) LaTeX:', P.toLatex());
            }

            const roots = P.findRoots();

            if (key === '0/1') {
                console.log('  Raw roots found:', roots);
            }

            for (const root of roots) {
                // Filter out invalid roots (NaN or undefined)
                if (isFinite(root.re) && isFinite(root.im)) {
                    // Verify root is actually valid
                    const val = P.evaluateComplex(root.re, root.im);
                    const magnitude = Math.sqrt(val.re * val.re + val.im * val.im);

                    if (key === '0/1') {
                        console.log(`  Root ${root.re.toFixed(4)} + ${root.im.toFixed(4)}i: P(z) magnitude = ${magnitude.toFixed(6)}`);
                    }

                    this.allRoots.push({
                        re: root.re,
                        im: root.im,
                        polynomial: key
                    });
                }
            }
        }
    }

    // Draw the Riley slice visualization
    draw() {
        if (!this.canvas || !this.ctx) {
            console.error('Riley Slice: Cannot draw, canvas or context not available');
            return;
        }

        // Clear canvas and fill with dark background
        this.ctx.fillStyle = '#1f2937'; // gray-800
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        if (this.allRoots.length === 0) {
            console.warn('Riley Slice: No roots to draw');
            return;
        }

        // Find bounds
        let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;

        console.log('Riley Slice: First 3 roots:', this.allRoots.slice(0, 3));

        for (let i = 0; i < this.allRoots.length; i++) {
            const root = this.allRoots[i];

            if (i === 0) {
                console.log('Riley Slice: Processing first root:', root);
                console.log('Riley Slice: root.re type:', typeof root.re, 'value:', root.re);
                console.log('Riley Slice: root.im type:', typeof root.im, 'value:', root.im);
            }

            minX = Math.min(minX, root.re);
            maxX = Math.max(maxX, root.re);
            minY = Math.min(minY, root.im);
            maxY = Math.max(maxY, root.im);

            if (i === 0) {
                console.log('Riley Slice: After first root - minX:', minX, 'maxX:', maxX, 'minY:', minY, 'maxY:', maxY);
            }
        }

        console.log('Riley Slice: Bounds before padding:', minX, maxX, minY, maxY);

        // Add padding (ensure minimum range)
        let rangeX = maxX - minX;
        let rangeY = maxY - minY;

        // If range is too small, expand it
        if (rangeX < 0.1) rangeX = 2;
        if (rangeY < 0.1) rangeY = 2;

        const padX = rangeX * 0.1;
        const padY = rangeY * 0.1;

        minX -= padX;
        maxX += padX;
        minY -= padY;
        maxY += padY;

        // Ensure 1:1 aspect ratio by making ranges equal
        rangeX = maxX - minX;
        rangeY = maxY - minY;
        const maxRange = Math.max(rangeX, rangeY);

        if (rangeX < maxRange) {
            const diff = (maxRange - rangeX) / 2;
            minX -= diff;
            maxX += diff;
        }
        if (rangeY < maxRange) {
            const diff = (maxRange - rangeY) / 2;
            minY -= diff;
            maxY += diff;
        }

        console.log('Riley Slice: Bounds after padding (1:1 aspect):', minX, maxX, minY, maxY);

        // Store bounds for mouse interaction
        this.bounds = { minX, maxX, minY, maxY };

        // Draw axes
        this.drawAxes(minX, maxX, minY, maxY);

        // Draw roots in two passes: normal roots first, then highlighted roots on top
        const activePolynomial = this.clickedRoot ? this.clickedRoot.polynomial : this.hoveredPolynomial;

        let drawnCount = 0;
        let highlightedCount = 0;

        // First pass: draw normal roots
        for (let i = 0; i < this.allRoots.length; i++) {
            const root = this.allRoots[i];

            // Skip if this is a highlighted root (will draw in second pass)
            if (activePolynomial && root.polynomial === activePolynomial) continue;

            const x = this.mapX(root.re, minX, maxX);
            const y = this.mapY(root.im, minY, maxY);

            if (i < 3 && !this.hoveredPolynomial && !this.clickedRoot) {
                console.log(`Riley Slice: Root ${i}: re=${root.re}, im=${root.im} -> canvas (${x}, ${y})`);
            }

            // Normal roots in purple
            this.ctx.beginPath();
            this.ctx.arc(x, y, 3, 0, 2 * Math.PI);
            this.ctx.fillStyle = '#667eea';
            this.ctx.strokeStyle = '#4c51bf';
            this.ctx.lineWidth = 1;
            this.ctx.fill();
            this.ctx.stroke();
            drawnCount++;
        }

        // Second pass: draw highlighted roots on top
        if (activePolynomial) {
            for (const root of this.allRoots) {
                if (root.polynomial !== activePolynomial) continue;

                const x = this.mapX(root.re, minX, maxX);
                const y = this.mapY(root.im, minY, maxY);

                // Check if this is the clicked root
                const isClicked = this.clickedRoot &&
                    Math.abs(root.re - this.clickedRoot.re) < 1e-6 &&
                    Math.abs(root.im - this.clickedRoot.im) < 1e-6 &&
                    root.polynomial === this.clickedRoot.polynomial;

                this.ctx.beginPath();
                this.ctx.arc(x, y, 5, 0, 2 * Math.PI);

                if (isClicked) {
                    // Clicked root in green
                    this.ctx.fillStyle = '#28a745';
                    this.ctx.strokeStyle = '#155724';
                    this.ctx.lineWidth = 2;
                } else {
                    // Other conjugates in red
                    this.ctx.fillStyle = '#ff4444';
                    this.ctx.strokeStyle = '#cc0000';
                    this.ctx.lineWidth = 2;
                    highlightedCount++;
                }

                this.ctx.fill();
                this.ctx.stroke();
                drawnCount++;
            }
        }

        if (!this.hoveredPolynomial && !this.clickedRoot) {
            console.log('Riley Slice: Drew', drawnCount, 'roots');
        } else if (this.clickedRoot) {
            console.log(`Riley Slice: Clicked root at ${this.clickedRoot.re.toFixed(4)} + ${this.clickedRoot.im.toFixed(4)}i`);
        } else {
            console.log(`Riley Slice: Highlighting ${highlightedCount} roots for ${this.hoveredPolynomial}`);
        }
    }

    drawAxes(minX, maxX, minY, maxY) {
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.3)';
        this.ctx.lineWidth = 1.5;

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
        this.ctx.fillStyle = '#9ca3af'; // gray-400
        this.ctx.font = '12px Arial';
        this.ctx.fillText('Re(z)', this.canvas.width - 40, y0 - 5);
        this.ctx.fillText('Im(z)', x0 + 5, 15);

        // Draw tick marks
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        this.ctx.lineWidth = 0.5;
        for (let x = Math.ceil(minX); x <= Math.floor(maxX); x++) {
            if (x === 0) continue;
            const px = this.mapX(x, minX, maxX);
            this.ctx.beginPath();
            this.ctx.moveTo(px, 0);
            this.ctx.lineTo(px, this.canvas.height);
            this.ctx.stroke();
            this.ctx.fillStyle = '#6b7280'; // gray-500
            this.ctx.fillText(x.toString(), px - 5, y0 + 15);
        }
        for (let y = Math.ceil(minY); y <= Math.floor(maxY); y++) {
            if (y === 0) continue;
            const py = this.mapY(y, minY, maxY);
            this.ctx.beginPath();
            this.ctx.moveTo(0, py);
            this.ctx.lineTo(this.canvas.width, py);
            this.ctx.stroke();
            this.ctx.fillStyle = '#6b7280'; // gray-500
            this.ctx.fillText(y.toString(), x0 + 5, py + 5);
        }
    }

    mapX(x, minX, maxX) {
        const range = maxX - minX;
        if (range === 0) return this.canvas.width / 2;
        return ((x - minX) / range) * this.canvas.width;
    }

    mapY(y, minY, maxY) {
        const range = maxY - minY;
        if (range === 0) return this.canvas.height / 2;
        return this.canvas.height - ((y - minY) / range) * this.canvas.height;
    }

    // Mouse event handlers
    handleMouseMove(e) {
        // If a root is clicked, don't change anything on hover
        if (this.clickedRoot) return;

        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Find closest root
        let closestRoot = null;
        let minDist = 15; // pixels

        const { minX, maxX, minY, maxY } = this.bounds;

        for (const root of this.allRoots) {
            const x = this.mapX(root.re, minX, maxX);
            const y = this.mapY(root.im, minY, maxY);
            const dist = Math.sqrt(Math.pow(x - mouseX, 2) + Math.pow(y - mouseY, 2));

            if (dist < minDist) {
                minDist = dist;
                closestRoot = root;
            }
        }

        if (closestRoot && closestRoot.polynomial !== this.hoveredPolynomial) {
            this.hoveredPolynomial = closestRoot.polynomial;
            this.draw();
            this.updateInfo(closestRoot, false);
        } else if (!closestRoot && this.hoveredPolynomial) {
            this.hoveredPolynomial = null;
            this.draw();
            this.clearInfo();
        }
    }

    handleMouseLeave() {
        if (this.hoveredPolynomial && !this.clickedRoot) {
            this.hoveredPolynomial = null;
            this.draw();
            this.clearInfo();
        } else if (this.hoveredPolynomial) {
            this.hoveredPolynomial = null;
            this.draw();
        }
    }

    handleClick(e) {
        const rect = this.canvas.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;

        // Find closest root
        let closestRoot = null;
        let minDist = 15; // pixels

        const { minX, maxX, minY, maxY } = this.bounds;

        for (const root of this.allRoots) {
            const x = this.mapX(root.re, minX, maxX);
            const y = this.mapY(root.im, minY, maxY);
            const dist = Math.sqrt(Math.pow(x - mouseX, 2) + Math.pow(y - mouseY, 2));

            if (dist < minDist) {
                minDist = dist;
                closestRoot = root;
            }
        }

        if (closestRoot) {
            // Click on a root - pin it
            this.clickedRoot = closestRoot;
            this.hoveredPolynomial = null;
            this.draw();
            this.updateInfo(closestRoot, true); // true = clicked

            // Synchronize with the polynomial calculator
            this.syncWithCalculator(closestRoot.polynomial);
        } else {
            // Click on empty space - unpin
            this.clickedRoot = null;
            this.hoveredPolynomial = null;
            this.draw();
            this.clearInfo();
        }
    }

    updateInfo(root, isClicked = false) {
        // Find info display element (we'll create it if needed)
        let infoDiv = document.getElementById('rileySliceInfo');
        if (!infoDiv) {
            // Create info display below the canvas
            infoDiv = document.createElement('div');
            infoDiv.id = 'rileySliceInfo';
            infoDiv.style.cssText = 'min-height: 80px; padding: 15px; background: rgba(17, 24, 39, 0.8); border: 1px solid rgba(255, 255, 255, 0.15); border-radius: 8px; margin-top: 15px; text-align: center; font-size: 14px; color: #d1d5db; overflow-x: auto; overflow-y: hidden;';
            this.canvas.parentElement.appendChild(infoDiv);
        }

        // Get all roots for this polynomial (Galois conjugates)
        const conjugates = this.allRoots.filter(r => r.polynomial === root.polynomial);
        const poly = this.polynomials[root.polynomial];
        const P = poly.add(Polynomial.fromConstant(2));

        let html = `<div style="margin-bottom: 10px; color: #f3f4f6;">\\(P\\left(\\frac{${root.polynomial.replace('/', '}{')}}\\right) = ${P.toLatex()}\\)</div>`;
        html += `<div style="font-family: monospace; color: #d1d5db;"><strong>Roots</strong> (${conjugates.length} Galois conjugate${conjugates.length !== 1 ? 's' : ''}):<br>`;
        conjugates.forEach((r, i) => {
            const re = r.re.toFixed(4);
            const im = Math.abs(r.im).toFixed(4);
            const sign = r.im >= 0 ? '+' : '-';
            const rootStr = Math.abs(r.im) < 1e-6
                ? `${re}`
                : `${re} ${sign} ${im}i`;

            // Check if this is the clicked/selected root
            const isThisRoot = isClicked &&
                Math.abs(r.re - root.re) < 1e-6 &&
                Math.abs(r.im - root.im) < 1e-6;

            const color = isThisRoot ? '#4ade80' : '#d1d5db'; // green-400 for selected, gray-300 for others
            const fontWeight = isThisRoot ? 'bold' : 'normal';
            html += `<span style="margin: 0 10px; color: ${color}; font-weight: ${fontWeight};">${rootStr}</span>`;
        });
        html += '</div>';

        infoDiv.innerHTML = html;

        // Typeset MathJax if available
        if (window.MathJax) {
            MathJax.typesetPromise([infoDiv]).catch((err) => console.log('MathJax typeset error:', err));
        }
    }

    clearInfo() {
        const infoDiv = document.getElementById('rileySliceInfo');
        if (infoDiv) {
            infoDiv.innerHTML = '<span style="color: #9ca3af;">Hover over a root to see its polynomial and Galois conjugates. Click to pin the selection.</span>';
        }
    }

    syncWithCalculator(polynomialKey) {
        // Parse the polynomial key "p/q"
        const parts = polynomialKey.split('/');
        if (parts.length !== 2) return;

        const p = parseInt(parts[0]);
        const q = parseInt(parts[1]);

        // Use the global updateFraction function, indicating it's from Riley Slice
        if (typeof updateFraction === 'function') {
            updateFraction(p, q, true); // true = fromRileySlice
        }
    }

    // Highlight a specific polynomial (called from calculator)
    highlightPolynomial(p, q) {
        const key = `${p}/${q}`;

        // Recompute roots accurately for this specific polynomial
        const Q = this.polynomials[key];
        if (Q) {
            console.log(`Recomputing roots accurately for ${key}...`);
            const P = Q.add(Polynomial.fromConstant(2));
            const degree = P.coeffs.length - 1;

            // Use accurate root finding
            const accurateRoots = P.findRoots(true); // Pass true for accurate mode

            console.log(`Found ${accurateRoots.length} roots (expected ${degree}) for ${key}`);

            // Remove old roots for this polynomial and add new accurate ones
            this.allRoots = this.allRoots.filter(r => r.polynomial !== key);

            for (const root of accurateRoots) {
                if (isFinite(root.re) && isFinite(root.im)) {
                    const val = P.evaluateComplex(root.re, root.im);
                    const magnitude = Math.sqrt(val.re * val.re + val.im * val.im);
                    console.log(`  Root ${root.re.toFixed(6)} + ${root.im.toFixed(6)}i: |P(z)| = ${magnitude.toExponential(3)}`);

                    this.allRoots.push({
                        re: root.re,
                        im: root.im,
                        polynomial: key
                    });
                }
            }
        }

        // Find a root for this polynomial
        const root = this.allRoots.find(r => r.polynomial === key);

        if (root) {
            this.clickedRoot = root;
            this.hoveredPolynomial = null;
            this.draw();
            this.updateInfo(root, true);
        } else {
            // Polynomial not in visualization (denominator too large)
            this.clickedRoot = null;
            this.hoveredPolynomial = null;
            this.draw();
            this.clearInfo();
        }
    }

    // Initialize and draw
    initialize() {
        this.computePolynomials();
        this.computeAllRoots();
        this.draw();
        this.clearInfo();
    }
}

// Global reference to Riley Slice instance
let rileySliceInstance = null;

// Initialize Riley Slice on page load
window.addEventListener('DOMContentLoaded', () => {
    console.log('Riley Slice: Initializing...');
    rileySliceInstance = new RileySlice('rileySliceCanvas', 30);
    console.log('Riley Slice: Computing polynomials...');
    rileySliceInstance.computePolynomials();
    console.log('Riley Slice: Polynomials computed:', Object.keys(rileySliceInstance.polynomials).length);
    console.log('Riley Slice: Computing roots...');
    rileySliceInstance.computeAllRoots();
    console.log('Riley Slice: Roots found:', rileySliceInstance.allRoots.length);
    console.log('Riley Slice: Drawing...');
    rileySliceInstance.draw();
    console.log('Riley Slice: Complete!');
});
