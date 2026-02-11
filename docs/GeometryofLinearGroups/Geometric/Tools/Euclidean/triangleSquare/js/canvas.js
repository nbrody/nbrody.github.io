// canvas.js — 2D pan/zoom renderer for triangle-square tilings

export class TilingRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.width = 0;
        this.height = 0;
        this.panX = 0;
        this.panY = 0;
        this.scale = 80; // pixels per unit in display space

        // Display settings
        this.showEdges = true;
        this.showPeriods = true;
        this.fillOpacity = 0.7;

        // Tiling data
        this.tiles = [];
        this.periods = null;       // [[s1,t1],[s2,t2]] in (s,t)-space
        this.displayMatrix = null;  // 2x2 matrix (s,t) -> display coords

        // Tile colors
        this.colors = {
            red:    { r: 239, g: 68,  b: 68  },
            blue:   { r: 59,  g: 130, b: 246 },
            yellow: { r: 250, g: 204, b: 21  }
        };

        this._setupInteraction();
        this.resize();
        this._raf = null;
        this._loop();
    }

    // ── Public API ──

    setTiling(tiles, periods, displayMatrix) {
        this.tiles = tiles;
        this.periods = periods;
        this.displayMatrix = displayMatrix;
    }

    resetView() {
        this.panX = 0;
        this.panY = 0;
        this.scale = 80;
    }

    destroy() {
        if (this._raf) cancelAnimationFrame(this._raf);
    }

    // ── Coordinate Transforms ──
    // Display space -> screen space (pan/zoom + center)
    _toScreen(dx, dy) {
        return [
            this.width / 2 + this.panX + dx * this.scale,
            this.height / 2 + this.panY - dy * this.scale
        ];
    }

    _toWorld(sx, sy) {
        return [
            (sx - this.width / 2 - this.panX) / this.scale,
            -(sy - this.height / 2 - this.panY) / this.scale
        ];
    }

    // (s,t) parameter space -> display space via display matrix D
    _paramToDisplay(s, t) {
        if (!this.displayMatrix) return [s, t];
        const D = this.displayMatrix;
        return [
            D[0][0] * s + D[0][1] * t,
            D[1][0] * s + D[1][1] * t
        ];
    }

    // ── Resize ──

    resize() {
        const dpr = window.devicePixelRatio || 1;
        this.width = this.canvas.clientWidth;
        this.height = this.canvas.clientHeight;
        this.canvas.width = this.width * dpr;
        this.canvas.height = this.height * dpr;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // ── Render Loop ──

    _loop() {
        this._raf = requestAnimationFrame(() => this._loop());
        this._render();
    }

    _render() {
        const { ctx } = this;

        // Clear
        ctx.fillStyle = '#050712';
        ctx.fillRect(0, 0, this.width, this.height);

        if (this.tiles.length === 0) {
            this._drawPlaceholder();
            return;
        }

        // Draw grid
        this._drawGrid();

        // Draw tiles (with periodic extension)
        if (this.periods && this.periods.length === 2) {
            this._drawPeriodic();
        } else {
            this._drawTiles(this.tiles, 0, 0);
        }

        // Draw period vectors
        if (this.showPeriods && this.periods) {
            this._drawPeriodVectors();
        }
    }

    _drawPlaceholder() {
        const { ctx } = this;
        ctx.fillStyle = 'rgba(153, 167, 215, 0.3)';
        ctx.font = '16px Inter, sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText('Enter a matrix and click Compute', this.width / 2, this.height / 2);
    }

    // ── Tile Drawing ──

    _drawTiles(tiles, offS, offT) {
        const { ctx } = this;
        const opacity = this.fillOpacity;

        for (const tile of tiles) {
            const c = this.colors[tile.type];
            const fillAlpha = tile.type === 'yellow' ? opacity * 0.75 : opacity;

            ctx.beginPath();
            for (let i = 0; i < tile.vertices.length; i++) {
                const [s, t] = tile.vertices[i];
                const [dx, dy] = this._paramToDisplay(s + offS, t + offT);
                const [sx, sy] = this._toScreen(dx, dy);
                if (i === 0) ctx.moveTo(sx, sy);
                else ctx.lineTo(sx, sy);
            }
            ctx.closePath();

            ctx.fillStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${fillAlpha})`;
            ctx.fill();

            if (this.showEdges) {
                ctx.strokeStyle = `rgba(${c.r}, ${c.g}, ${c.b}, ${Math.min(fillAlpha + 0.25, 1)})`;
                ctx.lineWidth = 1;
                ctx.stroke();
            }
        }
    }

    _drawPeriodic() {
        const p1 = this.periods[0];
        const p2 = this.periods[1];

        // Convert period vectors to display space
        const dp1 = this._paramToDisplay(p1[0], p1[1]);
        const dp2 = this._paramToDisplay(p2[0], p2[1]);

        // Determine how many copies needed to fill the visible region
        // Visible region in display coords:
        const [dxMin, dyMax] = this._toWorld(0, 0);
        const [dxMax, dyMin] = this._toWorld(this.width, this.height);

        // Solve for m, n range: m*dp1 + n*dp2 covers [dxMin, dxMax] x [dyMin, dyMax]
        // Invert the 2x2 matrix [dp1 | dp2]
        const det = dp1[0] * dp2[1] - dp1[1] * dp2[0];
        if (Math.abs(det) < 1e-10) {
            // Degenerate periods, just draw what we have
            this._drawTiles(this.tiles, 0, 0);
            return;
        }

        // Map the 4 corners of the view to (m,n) coords
        const corners = [
            [dxMin, dyMin], [dxMax, dyMin],
            [dxMax, dyMax], [dxMin, dyMax]
        ];

        let mMin = Infinity, mMax = -Infinity;
        let nMin = Infinity, nMax = -Infinity;

        for (const [dx, dy] of corners) {
            const m = (dx * dp2[1] - dy * dp2[0]) / det;
            const n = (-dx * dp1[1] + dy * dp1[0]) / det;
            if (m < mMin) mMin = m;
            if (m > mMax) mMax = m;
            if (n < nMin) nMin = n;
            if (n > nMax) nMax = n;
        }

        mMin = Math.floor(mMin) - 1;
        mMax = Math.ceil(mMax) + 1;
        nMin = Math.floor(nMin) - 1;
        nMax = Math.ceil(nMax) + 1;

        // Safety cap to prevent too many copies
        const maxCopies = 200;
        const totalCopies = (mMax - mMin + 1) * (nMax - nMin + 1);
        if (totalCopies > maxCopies) {
            // Reduce range proportionally
            const factor = Math.sqrt(maxCopies / totalCopies);
            const mMid = (mMin + mMax) / 2, nMid = (nMin + nMax) / 2;
            const mHalf = Math.ceil((mMax - mMin) * factor / 2);
            const nHalf = Math.ceil((nMax - nMin) * factor / 2);
            mMin = Math.floor(mMid) - mHalf;
            mMax = Math.ceil(mMid) + mHalf;
            nMin = Math.floor(nMid) - nHalf;
            nMax = Math.ceil(nMid) + nHalf;
        }

        for (let m = mMin; m <= mMax; m++) {
            for (let n = nMin; n <= nMax; n++) {
                const offS = m * p1[0] + n * p2[0];
                const offT = m * p1[1] + n * p2[1];
                this._drawTiles(this.tiles, offS, offT);
            }
        }
    }

    // ── Period Vector Arrows ──

    _drawPeriodVectors() {
        if (!this.periods) return;
        const { ctx } = this;

        const arrowColors = ['rgba(100, 255, 170, 0.8)', 'rgba(255, 180, 100, 0.8)'];

        for (let i = 0; i < 2; i++) {
            const p = this.periods[i];
            const [dx, dy] = this._paramToDisplay(p[0], p[1]);
            const [sx0, sy0] = this._toScreen(0, 0);
            const [sx1, sy1] = this._toScreen(dx, dy);

            ctx.beginPath();
            ctx.moveTo(sx0, sy0);
            ctx.lineTo(sx1, sy1);
            ctx.strokeStyle = arrowColors[i];
            ctx.lineWidth = 2;
            ctx.stroke();

            // Arrowhead
            const angle = Math.atan2(sy1 - sy0, sx1 - sx0);
            const headLen = 10;
            ctx.beginPath();
            ctx.moveTo(sx1, sy1);
            ctx.lineTo(sx1 - headLen * Math.cos(angle - 0.4), sy1 - headLen * Math.sin(angle - 0.4));
            ctx.moveTo(sx1, sy1);
            ctx.lineTo(sx1 - headLen * Math.cos(angle + 0.4), sy1 - headLen * Math.sin(angle + 0.4));
            ctx.stroke();
        }
    }

    // ── Grid ──

    _drawGrid() {
        const { ctx } = this;
        const [x0, y0] = this._toWorld(0, this.height);
        const [x1, y1] = this._toWorld(this.width, 0);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.04)';
        ctx.lineWidth = 1;

        // Adaptive grid spacing
        let spacing = 1;
        const pixPerUnit = this.scale;
        if (pixPerUnit < 20) spacing = 5;
        else if (pixPerUnit < 50) spacing = 2;
        else if (pixPerUnit > 200) spacing = 0.5;

        // Vertical lines
        const xStart = Math.floor(x0 / spacing) * spacing;
        for (let x = xStart; x <= x1; x += spacing) {
            const [sx] = this._toScreen(x, 0);
            ctx.beginPath();
            ctx.moveTo(sx, 0);
            ctx.lineTo(sx, this.height);
            ctx.stroke();
        }

        // Horizontal lines
        const yStart = Math.floor(y0 / spacing) * spacing;
        for (let y = yStart; y <= y1; y += spacing) {
            const [, sy] = this._toScreen(0, y);
            ctx.beginPath();
            ctx.moveTo(0, sy);
            ctx.lineTo(this.width, sy);
            ctx.stroke();
        }

        // Axes
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
        const [axX] = this._toScreen(0, 0);
        const [, axY] = this._toScreen(0, 0);
        ctx.beginPath();
        ctx.moveTo(axX, 0);
        ctx.lineTo(axX, this.height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, axY);
        ctx.lineTo(this.width, axY);
        ctx.stroke();
    }

    // ── Interaction ──

    _setupInteraction() {
        let dragging = false;
        let lastX = 0, lastY = 0;

        this.canvas.addEventListener('mousedown', e => {
            dragging = true;
            lastX = e.clientX;
            lastY = e.clientY;
        });

        window.addEventListener('mousemove', e => {
            if (!dragging) return;
            this.panX += e.clientX - lastX;
            this.panY += e.clientY - lastY;
            lastX = e.clientX;
            lastY = e.clientY;
        });

        window.addEventListener('mouseup', () => { dragging = false; });

        this.canvas.addEventListener('wheel', e => {
            e.preventDefault();
            const rect = this.canvas.getBoundingClientRect();
            const mx = e.clientX - rect.left;
            const my = e.clientY - rect.top;

            const oldScale = this.scale;
            const factor = e.deltaY < 0 ? 1.1 : 1 / 1.1;
            this.scale = Math.max(5, Math.min(800, this.scale * factor));

            // Zoom toward cursor
            const ratio = this.scale / oldScale;
            this.panX = mx - ratio * (mx - this.panX);
            this.panY = my - ratio * (my - this.panY);
        }, { passive: false });

        // Touch support
        let touches = [];
        let pinchDist = 0;

        this.canvas.addEventListener('touchstart', e => {
            e.preventDefault();
            touches = Array.from(e.touches);
            if (touches.length === 2) {
                const dx = touches[1].clientX - touches[0].clientX;
                const dy = touches[1].clientY - touches[0].clientY;
                pinchDist = Math.sqrt(dx * dx + dy * dy);
            }
        }, { passive: false });

        this.canvas.addEventListener('touchmove', e => {
            e.preventDefault();
            const newTouches = Array.from(e.touches);

            if (newTouches.length === 1 && touches.length === 1) {
                // Pan
                this.panX += newTouches[0].clientX - touches[0].clientX;
                this.panY += newTouches[0].clientY - touches[0].clientY;
            } else if (newTouches.length === 2) {
                // Pinch zoom
                const dx = newTouches[1].clientX - newTouches[0].clientX;
                const dy = newTouches[1].clientY - newTouches[0].clientY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                if (pinchDist > 0) {
                    const factor = dist / pinchDist;
                    const cx = (newTouches[0].clientX + newTouches[1].clientX) / 2;
                    const cy = (newTouches[0].clientY + newTouches[1].clientY) / 2;
                    const rect = this.canvas.getBoundingClientRect();
                    const mx = cx - rect.left;
                    const my = cy - rect.top;

                    const oldScale = this.scale;
                    this.scale = Math.max(5, Math.min(800, this.scale * factor));
                    const ratio = this.scale / oldScale;
                    this.panX = mx - ratio * (mx - this.panX);
                    this.panY = my - ratio * (my - this.panY);
                }
                pinchDist = dist;
            }

            touches = newTouches;
        }, { passive: false });

        this.canvas.addEventListener('touchend', e => {
            touches = Array.from(e.touches);
            pinchDist = 0;
        });

        // Resize observer
        const ro = new ResizeObserver(() => this.resize());
        ro.observe(this.canvas.parentElement);
    }
}
