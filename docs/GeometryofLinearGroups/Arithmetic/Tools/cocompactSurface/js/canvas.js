// canvas.js — Upper half plane renderer for cocompact surface group construction
import { mobius, geodesicArc } from './hyperbolic.js';

const COLORS = {
    bg: '#080c18',
    farey: 'rgba(255, 255, 255, 0.06)',
    realLine: 'rgba(255, 255, 255, 0.25)',
    tick: '#64748b',
    domainFill: 'rgba(96, 165, 250, 0.06)',
    domainStroke: 'rgba(96, 165, 250, 0.3)',
    fundDomainStroke: 'rgba(96, 165, 250, 0.7)',
    highlightFill: 'rgba(96, 165, 250, 0.15)',
    highlightStroke: '#60a5fa',
    cusp: '#fbbf24',
    curveAlpha: '#f472b6',
    curveBeta: '#34d399',
    conjugate: '#a78bfa',
    gen0: '#38bdf8',
    gen1: '#f472b6',
    gen2: '#a78bfa',
    gen3: '#22c55e',
};

export class HypCanvas {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.width = 0;
        this.height = 0;

        // Viewport
        this.centerX = 0.25;
        this.scale = 300;

        // Display flags
        this.showFarey = true;
        this.showDomain = true;
        this.showCusps = false;
        this.showCurves = false;
        this.showCosetTranslates = false;
        this.highlightIdentityDomain = false;
        this.mode = 'intro';

        // Group data
        this.groupData = null;

        // Animation state
        this.animating = false;
        this.animMatrix = null;
        this.animT = 0;
        this.animStartTime = 0;
        this.animDuration = 1500;
        this.animColorIdx = 0;

        this._setupInteraction();
        this._resize();
        this._loop();
    }

    _resize() {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        this.width = rect.width;
        this.height = rect.height;
        this.canvas.width = this.width * dpr;
        this.canvas.height = this.height * dpr;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    setGroupData(data) {
        this.groupData = data;
    }

    resetView() {
        this.centerX = 0.25;
        this.scale = 300;
    }

    // ---- Coordinate transforms ----

    worldToScreen(x, y) {
        const sx = (x - this.centerX) * this.scale + this.width / 2;
        const sy = this.height - y * this.scale;
        return [sx, sy];
    }

    screenToWorld(sx, sy) {
        const x = (sx - this.width / 2) / this.scale + this.centerX;
        const y = (this.height - sy) / this.scale;
        return [x, y];
    }

    // ---- Fit viewport to Gamma_0(2p) domain ----

    fitToGamma0(data) {
        if (!data) return;
        const cuspValues = data.cusps.filter(c => isFinite(c.value)).map(c => c.value);
        if (cuspValues.length === 0) { this.centerX = 0; this.scale = 300; return; }
        const minX = Math.min(...cuspValues) - 0.1;
        const maxX = Math.max(...cuspValues) + 0.1;
        this.centerX = (minX + maxX) / 2;
        this.scale = Math.min(this.width * 0.7 / (maxX - minX), 800);
        this.scale = Math.max(this.scale, 50);
    }

    // ---- Drawing: geodesics ----

    drawGeodesic(x1, x2, color, lineWidth) {
        const ctx = this.ctx;
        if (!isFinite(x1) && !isFinite(x2)) return;

        ctx.strokeStyle = color || 'rgba(255,255,255,0.1)';
        ctx.lineWidth = lineWidth || 0.5;

        if (!isFinite(x1) || !isFinite(x2)) {
            const finX = isFinite(x1) ? x1 : x2;
            const [sx, sy] = this.worldToScreen(finX, 0);
            if (sx < -10 || sx > this.width + 10) return;
            ctx.beginPath();
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx, 0);
            ctx.stroke();
            return;
        }

        const cx = (x1 + x2) / 2;
        const r = Math.abs(x2 - x1) / 2;
        if (r < 1e-12) return;

        const [slx] = this.worldToScreen(cx - r, 0);
        const [srx] = this.worldToScreen(cx + r, 0);
        const [, sty] = this.worldToScreen(cx, r);

        if (srx < -5 || slx > this.width + 5) return;
        if (sty > this.height + 5) return;

        const [scx, scy] = this.worldToScreen(cx, 0);
        const sr = r * this.scale;
        if (sr < 0.5) return;

        ctx.beginPath();
        ctx.arc(scx, scy, sr, Math.PI, 0, false);
        ctx.stroke();
    }

    // Draw a filled geodesic arc (for highlighting)
    drawFilledGeodesic(x1, x2, color, alpha) {
        const ctx = this.ctx;
        if (!isFinite(x1) || !isFinite(x2)) return;

        const cx = (x1 + x2) / 2;
        const r = Math.abs(x2 - x1) / 2;
        if (r < 1e-12) return;

        const [scx, scy] = this.worldToScreen(cx, 0);
        const sr = r * this.scale;
        if (sr < 0.5) return;

        ctx.save();
        ctx.globalAlpha = alpha || 0.1;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(scx, scy, sr, Math.PI, 0, false);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    // ---- Drawing: Farey tessellation ----

    drawFareyTessellation() {
        const self = this;
        const color = COLORS.farey;
        const lw = 0.5;
        const minPx = 2;

        function fareyStern(a, b, c, d) {
            const mn = a + c, md = b + d;
            const left = b === 0 ? Infinity : a / b;
            const right = d === 0 ? Infinity : c / d;

            if (isFinite(left) && isFinite(right)) {
                if (Math.abs(right - left) * self.scale < minPx) return;
            }

            self.drawGeodesic(left, right, color, lw);

            const medVal = mn / md;
            const leftPx = isFinite(left) ? Math.abs(medVal - left) * self.scale : minPx + 1;
            const rightPx = isFinite(right) ? Math.abs(right - medVal) * self.scale : minPx + 1;

            if (leftPx >= minPx) fareyStern(a, b, mn, md);
            if (rightPx >= minPx) fareyStern(mn, md, c, d);
        }

        // Seed: positive and negative reals
        fareyStern(0, 1, 1, 0);
        fareyStern(-1, 0, 0, 1);

        // Extra integer geodesics for visible range
        const [viewLeft] = this.screenToWorld(0, 0);
        const [viewRight] = this.screenToWorld(this.width, 0);
        const iMin = Math.floor(viewLeft) - 1;
        const iMax = Math.ceil(viewRight) + 1;

        for (let i = iMin; i <= iMax; i++) {
            if (i < -1 || i > 0) this.drawGeodesic(i, i + 1, color, lw);
            this.drawGeodesic(i, Infinity, color, lw);
        }
    }

    // ---- Drawing: real line ----

    drawRealLine() {
        const ctx = this.ctx;
        const [, baseY] = this.worldToScreen(0, 0);
        if (baseY < 0 || baseY > this.height) return;

        ctx.strokeStyle = COLORS.realLine;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, baseY);
        ctx.lineTo(this.width, baseY);
        ctx.stroke();

        // Tick marks
        const [viewLeft] = this.screenToWorld(0, 0);
        const [viewRight] = this.screenToWorld(this.width, 0);

        let tickSpacing = 1;
        if (this.scale < 30) tickSpacing = 5;
        if (this.scale < 10) tickSpacing = 10;
        if (this.scale > 400) tickSpacing = 0.5;
        if (this.scale > 1000) tickSpacing = 0.25;

        const iMin = Math.floor(viewLeft / tickSpacing) * tickSpacing;
        const iMax = Math.ceil(viewRight / tickSpacing) * tickSpacing;

        ctx.fillStyle = COLORS.tick;
        ctx.font = '10px Inter, sans-serif';
        ctx.textAlign = 'center';

        for (let x = iMin; x <= iMax; x += tickSpacing) {
            const [sx] = this.worldToScreen(x, 0);
            ctx.beginPath();
            ctx.moveTo(sx, baseY - 3);
            ctx.lineTo(sx, baseY + 3);
            ctx.stroke();

            const label = Math.abs(x) < 1e-10 ? '0' : (tickSpacing < 1 ? x.toFixed(2) : String(Math.round(x * 100) / 100));
            ctx.fillText(label, sx, baseY + 14);
        }
    }

    // ---- Drawing: PSL_2(Z) fundamental domain under a Mobius transform ----

    drawPSL2ZDomain(M, fillColor, strokeColor, lineWidth) {
        const ctx = this.ctx;
        const steps = 40;
        const s3h = Math.sqrt(3) / 2;
        const yMax = 6;

        // Sample boundary points of the standard PSL_2(Z) fundamental domain
        // then transform them by M
        const points = [];

        // Bottom arc: |z| = 1, from angle 2pi/3 (rhobar) to pi/3 (rho)
        for (let i = 0; i <= steps; i++) {
            const angle = (2 * Math.PI / 3) - (i / steps) * (Math.PI / 3);
            const z = { re: Math.cos(angle), im: Math.sin(angle) };
            const w = mobius(M, z);
            if (isFinite(w.re) && isFinite(w.im) && w.im > 1e-6) {
                points.push(w);
            }
        }

        // Right edge: Re(z) = 1/2, from rho upward to yMax
        for (let i = 1; i <= steps; i++) {
            const y = s3h + (i / steps) * (yMax - s3h);
            const w = mobius(M, { re: 0.5, im: y });
            if (isFinite(w.re) && isFinite(w.im) && w.im > 1e-6) {
                points.push(w);
            }
        }

        // Left edge: Re(z) = -1/2, from yMax down to rhobar
        for (let i = 0; i <= steps; i++) {
            const y = yMax - (i / steps) * (yMax - s3h);
            const w = mobius(M, { re: -0.5, im: y });
            if (isFinite(w.re) && isFinite(w.im) && w.im > 1e-6) {
                points.push(w);
            }
        }

        if (points.length < 3) return;

        // Check if any point is in the visible viewport
        const [vl] = this.screenToWorld(0, 0);
        const [vr] = this.screenToWorld(this.width, 0);
        const anyVisible = points.some(p =>
            p.re > vl - 1 && p.re < vr + 1 && p.im < (this.height / this.scale) + 1
        );
        if (!anyVisible) return;

        // Draw filled polygon
        ctx.fillStyle = fillColor;
        ctx.beginPath();
        const [sx0, sy0] = this.worldToScreen(points[0].re, points[0].im);
        ctx.moveTo(sx0, sy0);
        for (let i = 1; i < points.length; i++) {
            const [sx, sy] = this.worldToScreen(points[i].re, points[i].im);
            ctx.lineTo(sx, sy);
        }
        ctx.closePath();
        ctx.fill();

        // Draw outline
        ctx.strokeStyle = strokeColor;
        ctx.lineWidth = lineWidth || 0.5;
        ctx.stroke();
    }

    // ---- Drawing: cusp markers ----

    drawCuspMarker(x, label, color) {
        if (!isFinite(x)) return;
        const [sx, sy] = this.worldToScreen(x, 0);
        if (sx < -30 || sx > this.width + 30) return;

        const ctx = this.ctx;

        // Dot
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(sx, sy, 5, 0, Math.PI * 2);
        ctx.fill();

        // Border
        ctx.strokeStyle = 'rgba(0,0,0,0.5)';
        ctx.lineWidth = 1;
        ctx.stroke();

        // Label
        ctx.fillStyle = color;
        ctx.font = 'bold 13px JetBrains Mono, monospace';
        ctx.textAlign = 'center';
        ctx.fillText(label, sx, sy + 20);
    }

    // ---- Drawing: pairing curves ----

    drawPairingCurve(x1, x2, color, lineWidth, dashed) {
        const ctx = this.ctx;
        ctx.save();
        if (dashed) ctx.setLineDash([8, 4]);
        this.drawGeodesic(x1, x2, color, lineWidth || 3);
        ctx.setLineDash([]);
        ctx.restore();
    }

    // ---- Animation ----

    animateTransformation(M, colorIdx) {
        if (this.animating) return;
        this.animMatrix = M;
        this.animT = 0;
        this.animating = true;
        this.animStartTime = performance.now();
        this.animColorIdx = colorIdx || 0;
    }

    _drawAnimOverlay() {
        const elapsed = performance.now() - this.animStartTime;
        this.animT = Math.min(elapsed / this.animDuration, 1);
        const t = this._easeInOut(this.animT);

        const M = this.animMatrix;
        const ctx = this.ctx;
        const steps = 40;
        const s3h = Math.sqrt(3) / 2;
        const yMax = 6;

        // Interpolate: for t in [0,1], compute a transformation that goes from
        // identity to M. We sample boundary points and interpolate their positions.
        const srcPoints = [];
        const dstPoints = [];

        // Bottom arc
        for (let i = 0; i <= steps; i++) {
            const angle = (2 * Math.PI / 3) - (i / steps) * (Math.PI / 3);
            const z = { re: Math.cos(angle), im: Math.sin(angle) };
            srcPoints.push(z);
            dstPoints.push(mobius(M, z));
        }
        // Right edge
        for (let i = 1; i <= steps; i++) {
            const y = s3h + (i / steps) * (yMax - s3h);
            const z = { re: 0.5, im: y };
            srcPoints.push(z);
            dstPoints.push(mobius(M, z));
        }
        // Left edge
        for (let i = 0; i <= steps; i++) {
            const y = yMax - (i / steps) * (yMax - s3h);
            const z = { re: -0.5, im: y };
            srcPoints.push(z);
            dstPoints.push(mobius(M, z));
        }

        // Interpolated points
        const interpPoints = [];
        for (let i = 0; i < srcPoints.length; i++) {
            const s = srcPoints[i], d = dstPoints[i];
            if (!isFinite(d.re) || !isFinite(d.im) || d.im < 1e-6) continue;
            interpPoints.push({
                re: s.re + t * (d.re - s.re),
                im: s.im + t * (d.im - s.im)
            });
        }

        if (interpPoints.length < 3) { this.animating = false; return; }

        const colors = [COLORS.gen0, COLORS.gen1, COLORS.gen2, COLORS.gen3];
        const color = colors[this.animColorIdx % colors.length];

        // Draw ghost of source domain
        ctx.save();
        ctx.globalAlpha = 0.2;
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        let [gx0, gy0] = this.worldToScreen(srcPoints[0].re, srcPoints[0].im);
        ctx.moveTo(gx0, gy0);
        for (let i = 1; i < srcPoints.length; i++) {
            const [gx, gy] = this.worldToScreen(srcPoints[i].re, srcPoints[i].im);
            ctx.lineTo(gx, gy);
        }
        ctx.closePath();
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // Draw ghost of target domain
        ctx.save();
        ctx.globalAlpha = 0.2;
        ctx.setLineDash([5, 5]);
        ctx.strokeStyle = color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        let validDst = dstPoints.filter(d => isFinite(d.re) && isFinite(d.im) && d.im > 1e-6);
        if (validDst.length > 2) {
            let [dx0, dy0] = this.worldToScreen(validDst[0].re, validDst[0].im);
            ctx.moveTo(dx0, dy0);
            for (let i = 1; i < validDst.length; i++) {
                const [dx, dy] = this.worldToScreen(validDst[i].re, validDst[i].im);
                ctx.lineTo(dx, dy);
            }
            ctx.closePath();
            ctx.stroke();
        }
        ctx.setLineDash([]);
        ctx.restore();

        // Draw animated domain
        ctx.save();
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = color;
        ctx.beginPath();
        const [ix0, iy0] = this.worldToScreen(interpPoints[0].re, interpPoints[0].im);
        ctx.moveTo(ix0, iy0);
        for (let i = 1; i < interpPoints.length; i++) {
            const [ix, iy] = this.worldToScreen(interpPoints[i].re, interpPoints[i].im);
            ctx.lineTo(ix, iy);
        }
        ctx.closePath();
        ctx.fill();
        ctx.globalAlpha = 0.9;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        ctx.stroke();
        ctx.restore();

        if (this.animT >= 1) {
            this.animating = false;
            this.animMatrix = null;
        }
    }

    _easeInOut(t) {
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    }

    // ---- Main render pipeline ----

    _render() {
        const { ctx, width, height } = this;
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = COLORS.bg;
        ctx.fillRect(0, 0, width, height);

        // Layer 1: Farey tessellation
        if (this.showFarey) this.drawFareyTessellation();

        // Layer 2: Real line
        this.drawRealLine();

        // Layer 3: Coset translates (fundamental domains)
        if (this.groupData && this.showCosetTranslates) {
            const reps = this.groupData.cosetReps;
            for (let i = 0; i < reps.length; i++) {
                const hue = (i * 37) % 360;
                const fill = `hsla(${hue}, 45%, 50%, 0.07)`;
                const stroke = `hsla(${hue}, 45%, 60%, 0.25)`;
                this.drawPSL2ZDomain(reps[i], fill, stroke, 0.5);
            }
        }

        // Layer 3b: Highlight identity domain
        if (this.showDomain && !this.showCosetTranslates) {
            this.drawPSL2ZDomain(
                [1, 0, 0, 1],
                COLORS.highlightFill,
                COLORS.highlightStroke,
                2
            );
        }

        // Layer 3c: Highlight the Gamma_0(2p) fundamental domain outline
        if (this.groupData && this.showCosetTranslates) {
            // Draw a stronger outline on the identity domain
            this.drawPSL2ZDomain(
                [1, 0, 0, 1],
                'rgba(96, 165, 250, 0.12)',
                COLORS.fundDomainStroke,
                1.5
            );
        }

        // Layer 4: Pairing curves
        if (this.groupData && this.showCurves) {
            const curves = this.groupData.pairingCurves;
            this.drawPairingCurve(curves.alpha.x1, curves.alpha.x2, COLORS.curveAlpha, 3, false);
            this.drawPairingCurve(curves.beta.x1, curves.beta.x2, COLORS.curveBeta, 3, false);
        }

        // Layer 5: Cusps
        if (this.groupData && this.showCusps) {
            for (const cusp of this.groupData.cusps) {
                if (isFinite(cusp.value)) {
                    this.drawCuspMarker(cusp.value, cusp.label, COLORS.cusp);
                } else {
                    // Draw infinity marker at top of canvas
                    const [sx] = this.worldToScreen(0, 0);
                    const ctx = this.ctx;
                    ctx.fillStyle = COLORS.cusp;
                    ctx.font = 'bold 14px JetBrains Mono, monospace';
                    ctx.textAlign = 'left';
                    ctx.fillText('∞', 10, 25);
                }
            }
        }

        // Layer 6: Animation overlay
        if (this.animating && this.animMatrix) {
            this._drawAnimOverlay();
        }
    }

    // ---- Interaction (pan/zoom) ----

    _setupInteraction() {
        let dragging = false, lastX = 0, lastY = 0;

        this.canvas.addEventListener('mousedown', e => {
            dragging = true;
            lastX = e.clientX;
            lastY = e.clientY;
            this.canvas.style.cursor = 'grabbing';
        });

        window.addEventListener('mouseup', () => {
            dragging = false;
            this.canvas.style.cursor = 'grab';
        });

        window.addEventListener('mousemove', e => {
            if (!dragging) return;
            this.centerX -= (e.clientX - lastX) / this.scale;
            lastX = e.clientX;
            lastY = e.clientY;
        });

        this.canvas.addEventListener('wheel', e => {
            e.preventDefault();
            const [wxBefore] = this.screenToWorld(e.offsetX, e.offsetY);
            const factor = e.deltaY > 0 ? 1 / 1.1 : 1.1;
            this.scale = Math.max(20, Math.min(this.scale * factor, 5000));
            const [wxAfter] = this.screenToWorld(e.offsetX, e.offsetY);
            this.centerX += wxBefore - wxAfter;
        }, { passive: false });

        // Touch support
        let touchDist = 0;
        this.canvas.addEventListener('touchstart', e => {
            if (e.touches.length === 1) {
                dragging = true;
                lastX = e.touches[0].clientX;
            } else if (e.touches.length === 2) {
                dragging = false;
                const dx = e.touches[1].clientX - e.touches[0].clientX;
                const dy = e.touches[1].clientY - e.touches[0].clientY;
                touchDist = Math.sqrt(dx * dx + dy * dy);
            }
        }, { passive: true });

        this.canvas.addEventListener('touchmove', e => {
            e.preventDefault();
            if (e.touches.length === 1 && dragging) {
                this.centerX -= (e.touches[0].clientX - lastX) / this.scale;
                lastX = e.touches[0].clientX;
            } else if (e.touches.length === 2) {
                const dx = e.touches[1].clientX - e.touches[0].clientX;
                const dy = e.touches[1].clientY - e.touches[0].clientY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const factor = dist / touchDist;
                touchDist = dist;
                this.scale = Math.max(20, Math.min(this.scale * factor, 5000));
            }
        }, { passive: false });

        this.canvas.addEventListener('touchend', () => { dragging = false; }, { passive: true });

        window.addEventListener('resize', () => this._resize());
    }

    _loop() {
        // Only resize if dimensions changed
        const rect = this.canvas.getBoundingClientRect();
        if (rect.width !== this.width || rect.height !== this.height) {
            this._resize();
        }
        this._render();
        requestAnimationFrame(() => this._loop());
    }
}
