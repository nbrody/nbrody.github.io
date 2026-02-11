// canvas.js — 2D Canvas rendering for Isom(R^2) visualization
import { apply, applyPt, compose, inverse, identity, lerp, generateTiling } from './math.js';

const GEN_COLORS = ['#38bdf8', '#f472b6', '#fbbf24', '#22c55e'];

// Canonical motif bounding box (computed from _defaultMotif body points)
const MOTIF_CX = 0.18;
const MOTIF_CY = 0.22;
const MOTIF_HALF = 0.21; // half-diagonal of motif bounding box

function matKey(iso) {
    const { A, b } = iso;
    const r = v => Math.round(v * 1000);
    return `${r(A[0][0])},${r(A[0][1])},${r(A[1][0])},${r(A[1][1])},${r(b[0])},${r(b[1])}`;
}

export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.width = 0;
        this.height = 0;
        this.panX = 0;
        this.panY = 0;
        this.scale = 120; // pixels per unit

        // Display settings
        this.showLattice = true;
        this.showDomain = true;
        this.showAxes = true;
        this.showMotif = true;
        this.copies = 4;
        this.animSpeed = 1;

        // Current group state
        this.group = null;
        this.tiles = [];
        this.motif = this._defaultMotif();
        this.motifFit = { cx: 0.18, cy: 0.22, scale: 1 }; // default

        // Animation state
        this.animating = false;
        this.animGenerator = null;
        this.animT = 0;
        this.animDuration = 900; // ms

        // Pan/zoom interaction
        this._setupInteraction();
        this.resize();
        this._raf = null;
        this._loop();
    }

    resize() {
        const dpr = window.devicePixelRatio || 1;
        this.width = this.canvas.clientWidth;
        this.height = this.canvas.clientHeight;
        this.canvas.width = this.width * dpr;
        this.canvas.height = this.height * dpr;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    setGroup(group) {
        this.group = group;
        this._computeMotifFit();
        this._rebuildTiles();
    }

    setCopies(n) {
        this.copies = n;
        this._rebuildTiles();
    }

    // ---- Compute motif placement to fit inside fundamental domain ----
    _computeMotifFit() {
        if (!this.group) return;
        const domain = this.group.fundDomain;

        // Centroid
        let cx = 0, cy = 0;
        for (const [x, y] of domain) { cx += x; cy += y; }
        cx /= domain.length;
        cy /= domain.length;

        // Inscribed radius: min distance from centroid to any edge
        let minEdgeDist = Infinity;
        const n = domain.length;
        for (let i = 0; i < n; i++) {
            const [x1, y1] = domain[i];
            const [x2, y2] = domain[(i + 1) % n];
            const dx = x2 - x1, dy = y2 - y1;
            const len = Math.sqrt(dx * dx + dy * dy);
            if (len < 1e-9) continue;
            const dist = Math.abs(dx * (cy - y1) - dy * (cx - x1)) / len;
            if (dist < minEdgeDist) minEdgeDist = dist;
        }

        // Scale so motif fits within ~80% of inscribed circle
        const scale = Math.min((minEdgeDist * 0.78) / MOTIF_HALF, 1.5);
        this.motifFit = { cx, cy, scale };
    }

    _rebuildTiles() {
        if (!this.group) { this.tiles = []; return; }
        const gens = this.group.generators;
        const domain = this.group.fundDomain;

        if (gens.length === 0) {
            // Trivial group — just the identity tile
            this.tiles = [{ iso: identity(), poly: domain }];
        } else if (this.group.rank === 0) {
            // Point groups: enumerate group elements directly via BFS
            this.tiles = this._enumeratePointGroup(gens, domain);
        } else {
            this.tiles = generateTiling(gens, this.copies, domain);
        }
    }

    // For point groups, all elements fix the origin so generateTiling won't work.
    _enumeratePointGroup(gens, domain) {
        const allGens = [];
        gens.forEach(g => { allGens.push(g); allGens.push(inverse(g)); });

        const tiles = [{ iso: identity(), poly: domain }];
        const seen = new Set();
        seen.add(matKey(identity()));

        let frontier = [identity()];
        const maxElements = 200;

        for (let depth = 0; depth < 20 && tiles.length < maxElements; depth++) {
            const next = [];
            for (const iso of frontier) {
                for (const g of allGens) {
                    const composed = compose(g, iso);
                    const k = matKey(composed);
                    if (!seen.has(k)) {
                        seen.add(k);
                        const poly = domain.map(p => applyPt(composed, p));
                        tiles.push({ iso: composed, poly });
                        next.push(composed);
                    }
                }
            }
            frontier = next;
            if (frontier.length === 0) break;
        }
        return tiles;
    }

    animateGenerator(genIndex) {
        if (this.animating) return;
        if (!this.group || genIndex >= this.group.generators.length) return;
        this.animGenerator = this.group.generators[genIndex];
        this.animGenIndex = genIndex;
        this.animT = 0;
        this.animating = true;
        this.animStartTime = performance.now();
    }

    resetView() {
        this.panX = 0;
        this.panY = 0;
        this.scale = 120;
    }

    // ---- Luna motif: simplified sitting cat silhouette ----
    _defaultMotif() {
        const s = 0.45;
        const ox = 0.04, oy = 0.03;
        const sc = (x, y) => [x * s + ox, y * s + oy];

        return {
            body: [
                sc(0.35, 0.00), sc(0.50, 0.00), sc(0.50, 0.25),
                sc(0.55, 0.45), sc(0.58, 0.65), sc(0.62, 0.85),
                sc(0.55, 0.75), sc(0.50, 0.80), sc(0.45, 0.75),
                sc(0.38, 0.85), sc(0.42, 0.65), sc(0.40, 0.45),
                sc(0.35, 0.30), sc(0.20, 0.25), sc(0.08, 0.30),
                sc(0.03, 0.20), sc(0.00, 0.35), sc(0.02, 0.50),
                sc(0.08, 0.55), sc(0.10, 0.48), sc(0.06, 0.35),
                sc(0.08, 0.22), sc(0.12, 0.10), sc(0.15, 0.00),
            ],
            mask: [
                sc(0.55, 0.45), sc(0.58, 0.60), sc(0.55, 0.72),
                sc(0.50, 0.75), sc(0.45, 0.72), sc(0.42, 0.60),
                sc(0.45, 0.45), sc(0.50, 0.42),
            ],
            earRight: [sc(0.55, 0.75), sc(0.62, 0.85), sc(0.58, 0.73)],
            earLeft: [sc(0.45, 0.75), sc(0.38, 0.85), sc(0.42, 0.73)],
            bib: [
                sc(0.47, 0.42), sc(0.53, 0.42), sc(0.54, 0.35),
                sc(0.52, 0.28), sc(0.48, 0.28), sc(0.46, 0.35),
            ],
            eyeLeft: sc(0.47, 0.62),
            eyeRight: sc(0.53, 0.62),
        };
    }

    // ---- Fit a motif point into the fundamental domain ----
    _fitMotifPoint(p) {
        const { cx, cy, scale } = this.motifFit;
        return [
            (p[0] - MOTIF_CX) * scale + cx,
            (p[1] - MOTIF_CY) * scale + cy
        ];
    }

    // ---- Coordinate transforms ----
    _toScreen(x, y) {
        return [
            this.width / 2 + this.panX + x * this.scale,
            this.height / 2 + this.panY - y * this.scale
        ];
    }

    _toWorld(sx, sy) {
        return [
            (sx - this.width / 2 - this.panX) / this.scale,
            -(sy - this.height / 2 - this.panY) / this.scale
        ];
    }

    // ---- Main render ----
    _render() {
        const { ctx, width, height } = this;
        ctx.clearRect(0, 0, width, height);

        // Background
        ctx.fillStyle = '#080c18';
        ctx.fillRect(0, 0, width, height);

        // Grid/axes
        if (this.showAxes) this._drawAxes();

        if (!this.group) return;

        // Draw tiles — always static, no animation transform
        this._drawTiles();

        // Draw lattice points
        if (this.showLattice && this.group.rank > 0) {
            this._drawLatticePoints();
        }

        // Animation overlay: animate the fundamental domain being mapped
        if (this.animating && this.animGenerator) {
            const elapsed = performance.now() - this.animStartTime;
            const dur = this.animDuration / this.animSpeed;
            this.animT = Math.min(elapsed / dur, 1);
            const t = this._easeInOut(this.animT);
            this._drawAnimOverlay(t);
            if (this.animT >= 1) {
                this.animating = false;
                this.animGenerator = null;
            }
        }
    }

    _easeInOut(t) {
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    }

    _drawAxes() {
        const { ctx, width, height } = this;
        ctx.save();
        ctx.strokeStyle = 'rgba(255,255,255,0.07)';
        ctx.lineWidth = 1;

        const [x0, y0] = this._toWorld(0, height);
        const [x1, y1] = this._toWorld(width, 0);
        const step = this._gridStep();

        const startX = Math.floor(x0 / step) * step;
        const startY = Math.floor(y0 / step) * step;

        for (let x = startX; x <= x1; x += step) {
            const [sx] = this._toScreen(x, 0);
            ctx.beginPath();
            ctx.moveTo(sx, 0);
            ctx.lineTo(sx, height);
            ctx.stroke();
        }
        for (let y = startY; y <= y1; y += step) {
            const [, sy] = this._toScreen(0, y);
            ctx.beginPath();
            ctx.moveTo(0, sy);
            ctx.lineTo(width, sy);
            ctx.stroke();
        }

        // Axes
        ctx.strokeStyle = 'rgba(255,255,255,0.2)';
        ctx.lineWidth = 1.5;
        const [ox, oy] = this._toScreen(0, 0);
        ctx.beginPath();
        ctx.moveTo(0, oy); ctx.lineTo(width, oy);
        ctx.moveTo(ox, 0); ctx.lineTo(ox, height);
        ctx.stroke();

        // Origin dot
        ctx.fillStyle = 'rgba(255,255,255,0.4)';
        ctx.beginPath();
        ctx.arc(ox, oy, 3, 0, Math.PI * 2);
        ctx.fill();

        ctx.restore();
    }

    _gridStep() {
        const target = 60;
        const raw = target / this.scale;
        const mag = Math.pow(10, Math.floor(Math.log10(raw)));
        const choices = [mag, 2 * mag, 5 * mag, 10 * mag];
        for (const c of choices) {
            if (c * this.scale >= target * 0.7) return c;
        }
        return 10 * mag;
    }

    // ---- Draw all tiles statically (no animation) ----
    _drawTiles() {
        const { ctx } = this;

        for (let i = 0; i < this.tiles.length; i++) {
            const tile = this.tiles[i];
            const poly = tile.poly;

            // Domain fill
            if (this.showDomain) {
                const hue = (i * 37) % 360;
                ctx.fillStyle = `hsla(${hue}, 50%, 40%, 0.15)`;
                this._drawPoly(poly);
                ctx.fill();
            }

            // Domain outline
            ctx.strokeStyle = 'rgba(255,255,255,0.25)';
            ctx.lineWidth = 1;
            this._drawPoly(poly);
            ctx.stroke();

            // Motif
            if (this.showMotif) {
                this._drawMotifInTile(tile, 1);
            }
        }

        // Highlight fundamental domain
        if (this.showDomain && this.tiles.length > 0) {
            const fd = this.tiles[0].poly;
            ctx.strokeStyle = 'rgba(56, 189, 248, 0.6)';
            ctx.lineWidth = 2;
            this._drawPoly(fd);
            ctx.stroke();
        }
    }

    // ---- Animation overlay: shows the fund domain being mapped ----
    _drawAnimOverlay(t) {
        const { ctx } = this;
        const gen = this.animGenerator;
        const genIdx = this.animGenIndex || 0;
        const domain = this.group.fundDomain;
        const color = GEN_COLORS[genIdx % GEN_COLORS.length];

        // Compute interpolated isometry at parameter t
        const interp = lerp(gen, t);

        let poly, opacity, isoForMotif;

        // All isometry types now smoothly interpolate via lerp
        poly = domain.map(p => applyPt(interp.iso, p));
        opacity = interp.opacity;
        isoForMotif = interp.iso;

        // --- Draw ghost outlines for source and target ---
        ctx.save();
        ctx.strokeStyle = color;
        ctx.globalAlpha = 0.25;
        ctx.lineWidth = 1.5;
        ctx.setLineDash([5, 5]);
        // Source (original fundamental domain)
        this._drawPoly(domain);
        ctx.stroke();
        // Target (image under generator)
        const targetPoly = domain.map(p => applyPt(gen, p));
        this._drawPoly(targetPoly);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.restore();

        // --- Draw highlighted animated domain ---
        ctx.save();
        // Fill
        ctx.globalAlpha = opacity * 0.3;
        ctx.fillStyle = color;
        this._drawPoly(poly);
        ctx.fill();
        // Stroke
        ctx.globalAlpha = opacity * 0.9;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2.5;
        this._drawPoly(poly);
        ctx.stroke();
        ctx.restore();

        // --- Draw motif inside the animated domain ---
        if (this.showMotif) {
            const animTile = { iso: isoForMotif };
            this._drawMotifInTile(animTile, opacity);
        }
    }

    // ---- Draw motif inside a tile ----
    _drawMotifInTile(tile, opacity) {
        const { ctx } = this;
        const motif = this.motif;

        // Transform: fit motif into domain, then apply tile isometry
        const xform = (p) => {
            const fitted = this._fitMotifPoint(p);
            return applyPt(tile.iso, fitted);
        };

        // Detect orientation-reversing
        const det = tile.iso.A[0][0] * tile.iso.A[1][1] - tile.iso.A[0][1] * tile.iso.A[1][0];
        const reversed = det < 0;

        // Body fill
        const bodyPts = motif.body.map(xform);
        ctx.fillStyle = reversed
            ? `rgba(210, 180, 160, ${0.55 * opacity})`
            : `rgba(230, 210, 190, ${0.6 * opacity})`;
        this._drawPoly(bodyPts);
        ctx.fill();

        // Body outline
        ctx.strokeStyle = `rgba(80, 50, 30, ${0.4 * opacity})`;
        ctx.lineWidth = 0.8;
        this._drawPoly(bodyPts);
        ctx.stroke();

        // Dark face mask
        const maskPts = motif.mask.map(xform);
        ctx.fillStyle = `rgba(60, 40, 30, ${0.6 * opacity})`;
        this._drawPoly(maskPts);
        ctx.fill();

        // Dark ears
        ctx.fillStyle = `rgba(50, 30, 20, ${0.65 * opacity})`;
        this._drawPoly(motif.earRight.map(xform));
        ctx.fill();
        this._drawPoly(motif.earLeft.map(xform));
        ctx.fill();

        // White bib
        const bibPts = motif.bib.map(xform);
        ctx.fillStyle = `rgba(250, 248, 245, ${0.6 * opacity})`;
        this._drawPoly(bibPts);
        ctx.fill();

        // Blue eyes
        const eyeR = 0.012 * this.scale * this.motifFit.scale;
        const [elx, ely] = this._toScreen(...xform(motif.eyeLeft));
        const [erx, ery] = this._toScreen(...xform(motif.eyeRight));
        ctx.fillStyle = `rgba(120, 170, 220, ${0.8 * opacity})`;
        ctx.beginPath();
        ctx.arc(elx, ely, Math.max(eyeR, 1), 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.arc(erx, ery, Math.max(eyeR, 1), 0, Math.PI * 2);
        ctx.fill();
    }

    _drawLatticePoints() {
        const { ctx, width, height } = this;
        if (!this.group || this.group.generators.length === 0) return;

        const transGens = this.group.generators.filter(g =>
            Math.abs(g.A[0][0] - 1) < 1e-9 && Math.abs(g.A[1][1] - 1) < 1e-9 &&
            Math.abs(g.A[0][1]) < 1e-9 && Math.abs(g.A[1][0]) < 1e-9
        );
        if (transGens.length === 0) return;

        const [x0, y0] = this._toWorld(0, height);
        const [x1, y1] = this._toWorld(width, 0);
        const range = this.copies + 2;

        ctx.fillStyle = 'rgba(251, 191, 36, 0.5)';

        if (transGens.length === 1) {
            const t = transGens[0];
            for (let n = -range * 3; n <= range * 3; n++) {
                const px = n * t.b[0];
                const py = n * t.b[1];
                if (px < x0 - 1 || px > x1 + 1 || py < y0 - 1 || py > y1 + 1) continue;
                const [sx, sy] = this._toScreen(px, py);
                ctx.beginPath();
                ctx.arc(sx, sy, 3, 0, Math.PI * 2);
                ctx.fill();
            }
        } else if (transGens.length >= 2) {
            const t1 = transGens[0], t2 = transGens[1];
            for (let i = -range * 2; i <= range * 2; i++) {
                for (let j = -range * 2; j <= range * 2; j++) {
                    const px = i * t1.b[0] + j * t2.b[0];
                    const py = i * t1.b[1] + j * t2.b[1];
                    if (px < x0 - 1 || px > x1 + 1 || py < y0 - 1 || py > y1 + 1) continue;
                    const [sx, sy] = this._toScreen(px, py);
                    ctx.beginPath();
                    ctx.arc(sx, sy, 3, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }
    }

    _drawPoly(pts) {
        const { ctx } = this;
        ctx.beginPath();
        for (let i = 0; i < pts.length; i++) {
            const [sx, sy] = this._toScreen(pts[i][0], pts[i][1]);
            if (i === 0) ctx.moveTo(sx, sy);
            else ctx.lineTo(sx, sy);
        }
        ctx.closePath();
    }

    // ---- Interaction ----
    _setupInteraction() {
        let isPanning = false, lastX = 0, lastY = 0;

        this.canvas.addEventListener('mousedown', e => {
            isPanning = true;
            lastX = e.clientX;
            lastY = e.clientY;
        });
        window.addEventListener('mouseup', () => { isPanning = false; });
        window.addEventListener('mousemove', e => {
            if (!isPanning) return;
            this.panX += e.clientX - lastX;
            this.panY += e.clientY - lastY;
            lastX = e.clientX;
            lastY = e.clientY;
        });

        this.canvas.addEventListener('wheel', e => {
            e.preventDefault();
            const mx = e.clientX - this.width / 2 - this.panX;
            const my = e.clientY - this.height / 2 - this.panY;
            const old = this.scale;
            const factor = e.deltaY > 0 ? 0.92 : 1.08;
            this.scale = Math.max(20, Math.min(this.scale * factor, 600));
            this.panX -= mx * (this.scale / old - 1);
            this.panY -= my * (this.scale / old - 1);
        }, { passive: false });

        // Touch support
        let touchDist = 0, touchMid = null;
        this.canvas.addEventListener('touchstart', e => {
            if (e.touches.length === 1) {
                isPanning = true;
                lastX = e.touches[0].clientX;
                lastY = e.touches[0].clientY;
            } else if (e.touches.length === 2) {
                isPanning = false;
                const dx = e.touches[1].clientX - e.touches[0].clientX;
                const dy = e.touches[1].clientY - e.touches[0].clientY;
                touchDist = Math.sqrt(dx * dx + dy * dy);
                touchMid = [(e.touches[0].clientX + e.touches[1].clientX) / 2,
                (e.touches[0].clientY + e.touches[1].clientY) / 2];
            }
        }, { passive: true });
        this.canvas.addEventListener('touchmove', e => {
            e.preventDefault();
            if (e.touches.length === 1 && isPanning) {
                this.panX += e.touches[0].clientX - lastX;
                this.panY += e.touches[0].clientY - lastY;
                lastX = e.touches[0].clientX;
                lastY = e.touches[0].clientY;
            } else if (e.touches.length === 2) {
                const dx = e.touches[1].clientX - e.touches[0].clientX;
                const dy = e.touches[1].clientY - e.touches[0].clientY;
                const dist = Math.sqrt(dx * dx + dy * dy);
                const factor = dist / touchDist;
                touchDist = dist;
                const mx = touchMid[0] - this.width / 2 - this.panX;
                const my = touchMid[1] - this.height / 2 - this.panY;
                const old = this.scale;
                this.scale = Math.max(20, Math.min(this.scale * factor, 600));
                this.panX -= mx * (this.scale / old - 1);
                this.panY -= my * (this.scale / old - 1);
            }
        }, { passive: false });
        this.canvas.addEventListener('touchend', () => { isPanning = false; }, { passive: true });

        window.addEventListener('resize', () => this.resize());
    }

    _loop() {
        this._render();
        this._raf = requestAnimationFrame(() => this._loop());
    }
}
