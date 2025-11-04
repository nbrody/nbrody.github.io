// Canvas visualization code

class RileyVisualization {
    constructor(canvasId) {
        this.canvas = document.getElementById(canvasId);
        this.ctx = this.canvas.getContext('2d');
        this.currentPolynomial = null;
    }

    plotRealLocus(p, q) {
        const xMin = -3;
        const xMax = 3;
        const yMin = -3;
        const yMax = 3;

        if (isNaN(p) || isNaN(q) || q <= 0 || p < 0) {
            alert('Please calculate a valid polynomial first!');
            return;
        }

        const reduced = reduceFraction(p, q);
        this.currentPolynomial = getRileyPolynomial(reduced.p, reduced.q);

        if (!this.currentPolynomial) {
            alert('Could not compute polynomial for this fraction.');
            return;
        }

        // Clear canvas and fill with dark background
        this.ctx.fillStyle = '#1f2937'; // gray-800
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        // Draw axes
        this.drawAxes(xMin, xMax, yMin, yMax);

        // Plot the real locus (where Im(Q(z)) = 0)
        this.plotImplicitCurve(this.currentPolynomial, xMin, xMax, yMin, yMax);

        // Find and plot roots of Q + 2
        const polyPlus2 = this.currentPolynomial.add(Polynomial.fromConstant(2));
        const roots = polyPlus2.findRoots();

        // Verify roots are correct
        console.log(`Visualization: Found ${roots.length} roots for ${p}/${q}`);
        for (let i = 0; i < Math.min(3, roots.length); i++) {
            const evalResult = polyPlus2.evaluateComplex(roots[i].re, roots[i].im);
            const qEvalResult = this.currentPolynomial.evaluateComplex(roots[i].re, roots[i].im);
            console.log(`Root ${i}: z = ${roots[i].re.toFixed(4)} + ${roots[i].im.toFixed(4)}i`);
            console.log(`  P(z) = ${evalResult.re.toFixed(6)} + ${evalResult.im.toFixed(6)}i`);
            console.log(`  Q(z) = ${qEvalResult.re.toFixed(6)} + ${qEvalResult.im.toFixed(6)}i`);
        }

        this.plotRoots(roots, xMin, xMax, yMin, yMax);
    }

    drawAxes(xMin, xMax, yMin, yMax) {
        // Draw main axes in blue since they're part of the real locus
        // (Q(z) is real when z is real or purely imaginary)
        this.ctx.strokeStyle = '#007bff'; // Blue to match the real locus curves
        this.ctx.lineWidth = 2.5;

        // X-axis (real axis)
        const yZero = this.mapY(0, yMin, yMax);
        this.ctx.beginPath();
        this.ctx.moveTo(0, yZero);
        this.ctx.lineTo(this.canvas.width, yZero);
        this.ctx.stroke();

        // Y-axis (imaginary axis)
        const xZero = this.mapX(0, xMin, xMax);
        this.ctx.beginPath();
        this.ctx.moveTo(xZero, 0);
        this.ctx.lineTo(xZero, this.canvas.height);
        this.ctx.stroke();

        // Add labels
        this.ctx.fillStyle = '#9ca3af'; // gray-400
        this.ctx.font = '12px Arial';
        this.ctx.fillText('Re(z)', this.canvas.width - 40, yZero - 5);
        this.ctx.fillText('Im(z)', xZero + 5, 15);

        // Draw tick marks
        this.ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
        this.ctx.lineWidth = 0.5;
        for (let x = Math.ceil(xMin); x <= Math.floor(xMax); x++) {
            if (x === 0) continue;
            const px = this.mapX(x, xMin, xMax);
            this.ctx.beginPath();
            this.ctx.moveTo(px, 0);
            this.ctx.lineTo(px, this.canvas.height);
            this.ctx.stroke();
            this.ctx.fillStyle = '#6b7280'; // gray-500
            this.ctx.fillText(x.toString(), px - 5, yZero + 15);
        }
        for (let y = Math.ceil(yMin); y <= Math.floor(yMax); y++) {
            if (y === 0) continue;
            const py = this.mapY(y, yMin, yMax);
            this.ctx.beginPath();
            this.ctx.moveTo(0, py);
            this.ctx.lineTo(this.canvas.width, py);
            this.ctx.stroke();
            this.ctx.fillStyle = '#6b7280'; // gray-500
            this.ctx.fillText(y.toString(), xZero + 5, py + 5);
        }
    }

    mapX(x, xMin, xMax) {
        return ((x - xMin) / (xMax - xMin)) * this.canvas.width;
    }

    mapY(y, yMin, yMax) {
        return this.canvas.height - ((y - yMin) / (yMax - yMin)) * this.canvas.height;
    }

    plotImplicitCurve(poly, xMin, xMax, yMin, yMax) {
        // Use marching squares algorithm to find contours
        const resolution = 200;
        const dx = (xMax - xMin) / resolution;
        const dy = (yMax - yMin) / resolution;

        // Create grid of values (imaginary part of Q(z))
        const grid = [];
        for (let i = 0; i <= resolution; i++) {
            grid[i] = [];
            for (let j = 0; j <= resolution; j++) {
                const x = xMin + i * dx;
                const y = yMin + j * dy;
                const result = poly.evaluateComplex(x, y);
                grid[i][j] = result.im; // Store imaginary part
            }
        }

        // Draw contour where Im(Q(z)) = 0
        this.ctx.strokeStyle = '#007bff';
        this.ctx.lineWidth = 2;

        for (let i = 0; i < resolution; i++) {
            for (let j = 0; j < resolution; j++) {
                const x0 = xMin + i * dx;
                const y0 = yMin + j * dy;
                const x1 = x0 + dx;
                const y1 = y0 + dy;

                const v00 = grid[i][j];
                const v10 = grid[i + 1][j];
                const v01 = grid[i][j + 1];
                const v11 = grid[i + 1][j + 1];

                // Check if zero crossing occurs
                this.drawContourSegment(x0, y0, x1, y1, v00, v10, v01, v11, xMin, xMax, yMin, yMax);
            }
        }
    }

    plotRoots(roots, xMin, xMax, yMin, yMax) {
        this.ctx.fillStyle = '#dc3545';
        this.ctx.strokeStyle = '#721c24';
        this.ctx.lineWidth = 2;

        for (const root of roots) {
            const x = this.mapX(root.re, xMin, xMax);
            const y = this.mapY(root.im, yMin, yMax);

            // Draw a circle for each root
            this.ctx.beginPath();
            this.ctx.arc(x, y, 5, 0, 2 * Math.PI);
            this.ctx.fill();
            this.ctx.stroke();

            // Add label showing the root value
            this.ctx.fillStyle = '#333';
            this.ctx.font = '10px Arial';
            const label = `${root.re.toFixed(2)}${root.im >= 0 ? '+' : ''}${root.im.toFixed(2)}i`;
            this.ctx.fillText(label, x + 8, y - 8);
            this.ctx.fillStyle = '#dc3545';
        }
    }

    drawContourSegment(x0, y0, x1, y1, v00, v10, v01, v11, xMin, xMax, yMin, yMax) {
        const threshold = 0;
        const points = [];

        // Check each edge for zero crossing
        // Bottom edge
        if ((v00 < threshold && v10 > threshold) || (v00 > threshold && v10 < threshold)) {
            const t = (threshold - v00) / (v10 - v00);
            points.push({ x: x0 + t * (x1 - x0), y: y0 });
        }
        // Right edge
        if ((v10 < threshold && v11 > threshold) || (v10 > threshold && v11 < threshold)) {
            const t = (threshold - v10) / (v11 - v10);
            points.push({ x: x1, y: y0 + t * (y1 - y0) });
        }
        // Top edge
        if ((v01 < threshold && v11 > threshold) || (v01 > threshold && v11 < threshold)) {
            const t = (threshold - v01) / (v11 - v01);
            points.push({ x: x0 + t * (x1 - x0), y: y1 });
        }
        // Left edge
        if ((v00 < threshold && v01 > threshold) || (v00 > threshold && v01 < threshold)) {
            const t = (threshold - v00) / (v01 - v00);
            points.push({ x: x0, y: y0 + t * (y1 - y0) });
        }

        // Draw line segment between points
        if (points.length >= 2) {
            this.ctx.beginPath();
            this.ctx.moveTo(this.mapX(points[0].x, xMin, xMax), this.mapY(points[0].y, yMin, yMax));
            this.ctx.lineTo(this.mapX(points[1].x, xMin, xMax), this.mapY(points[1].y, yMin, yMax));
            this.ctx.stroke();
        }
    }
}
