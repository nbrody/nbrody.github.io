/**
 * view.js — Hyperbolic-plane renderer with an upper-half-plane / Poincaré-disk toggle.
 *
 * Everything hyperbolic is described in UPPER-HALF-PLANE coordinates {x,y}, y>0, then
 * mapped to the screen either directly (UHP model) or through the Cayley transform
 * w = (z − i)/(z + i) (disk model). One code path serves both models.
 */

import { mobius } from './geom-hyp.js';

const PALETTE = ['#38bdf8', '#f472b6', '#a78bfa', '#22c55e', '#fbbf24', '#fb7185', '#2dd4bf', '#c084fc'];
const toRe = v => ({ re: v.x, im: v.y });
const cayleyUHP = (x, y) => {                 // UHP → disk, w=(z−i)/(z+i)
    const nr = x, ni = y - 1, dr = x, di = y + 1, dd = dr * dr + di * di || 1e-300;
    return { re: (nr * dr + ni * di) / dd, im: (ni * dr - nr * di) / dd };
};
const COL = {
    bg: '#080c18',
    boundary: 'rgba(255,255,255,0.28)',
    grid: 'rgba(255,255,255,0.05)',
    tick: '#64748b',
    basepoint: '#e2e8f0',
    witness: '#f87171',
    witnessGlow: 'rgba(248,113,113,0.25)',
    axis: 'rgba(148,163,184,0.5)',
};

export class HypView {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.model = 'uhp';
        this.scene = { generators: [], witness: null, domain: null };
        this.opts = { domain: true, isoCircles: false, axes: true, fixedPoints: true, basepoint: true, tessellation: false };

        // viewport state (separate per model)
        this.uhp = { centerX: 0, baseFrac: 0.84, scale: 140 };
        this.disk = { cx: 0, cy: 0, R: 0 };  // cx,cy,R set on resize

        this.width = this.height = 0;
        this._setupInteraction();
        this._resize();
        this._loop();
    }

    setModel(m) { this.model = m; this._resize(); }
    setScene(s) {
        this.scene = s || { generators: [], witness: null };
        // recenter the disk on the domain's basepoint (so it isn't shoved off-center)
        const b = this.scene.domain && this.scene.domain.basepointUhp;
        this.diskCenter = b ? cayleyUHP(b.x, b.y) : { re: 0, im: 0 };
    }
    setOpt(k, v) { this.opts[k] = v; }
    resetView() {
        this.uhp = { centerX: 0, baseFrac: 0.84, scale: 140 };
        this.disk = { cx: this.width / 2, cy: this.height / 2, R: Math.min(this.width, this.height) * 0.44 };
    }

    _resize() {
        const dpr = window.devicePixelRatio || 1;
        const rect = this.canvas.getBoundingClientRect();
        this.width = rect.width; this.height = rect.height;
        this.canvas.width = this.width * dpr; this.canvas.height = this.height * dpr;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        if (this.disk.R === 0) { this.disk.cx = this.width / 2; this.disk.cy = this.height / 2; this.disk.R = Math.min(this.width, this.height) * 0.44; }
    }

    // ---- coordinate transform: UHP world {x,y} → screen [sx,sy] ----
    toScreen(x, y) {
        if (this.model === 'uhp') {
            const baseY = this.height * this.uhp.baseFrac;
            return [(x - this.uhp.centerX) * this.uhp.scale + this.width / 2, baseY - y * this.uhp.scale];
        }
        // disk: z = x + iy → w = (z−i)/(z+i), then recenter on the domain basepoint
        const nr = x, ni = y - 1, dr = x, di = y + 1;
        const den = dr * dr + di * di || 1e-300;
        let wr = (nr * dr + ni * di) / den, wi = (ni * dr - nr * di) / den;
        const c = this.diskCenter;
        if (c && (c.re || c.im)) {                         // w' = (w − c)/(1 − c̄ w)
            const numr = wr - c.re, numi = wi - c.im;
            const dr2 = 1 - (c.re * wr + c.im * wi), di2 = -(c.re * wi - c.im * wr);
            const dd = dr2 * dr2 + di2 * di2 || 1e-300;
            const nwr = (numr * dr2 + numi * di2) / dd, nwi = (numi * dr2 - numr * di2) / dd;
            wr = nwr; wi = nwi;
        }
        return [this.disk.cx + wr * this.disk.R, this.disk.cy - wi * this.disk.R];
    }

    // ---- sample a geodesic given two boundary points (∞ allowed) into UHP points ----
    _sampleGeodesic(x1, x2) {
        const pts = [];
        const yTop = this.model === 'uhp' ? (this.height / this.uhp.scale) * 1.5 + 5 : 60;
        if (!isFinite(x1) && !isFinite(x2)) return pts;
        if (!isFinite(x1) || !isFinite(x2)) {                  // vertical geodesic
            const x = isFinite(x1) ? x1 : x2;
            const N = 120;
            for (let i = 0; i <= N; i++) {
                const t = i / N;
                const y = Math.exp((t * 2 - 1) * 6) * 0.02;     // log-spaced 0⁺ … large
                if (y <= yTop * 4) pts.push({ x, y });
            }
            return pts;
        }
        const cx = (x1 + x2) / 2, r = Math.abs(x2 - x1) / 2;    // semicircle
        const N = 160;
        for (let i = 0; i <= N; i++) { const th = Math.PI * i / N; pts.push({ x: cx + r * Math.cos(th), y: r * Math.sin(th) }); }
        return pts;
    }

    _drawPolyline(pts, style, width = 1.5, dash = null) {
        if (pts.length < 2) return;
        const ctx = this.ctx;
        ctx.save();
        if (dash) ctx.setLineDash(dash);
        ctx.strokeStyle = style; ctx.lineWidth = width;
        ctx.beginPath();
        let started = false;
        for (const p of pts) {
            if (p.y < 1e-9) continue;
            const [sx, sy] = this.toScreen(p.x, p.y);
            if (!isFinite(sx) || !isFinite(sy)) { started = false; continue; }
            if (!started) { ctx.moveTo(sx, sy); started = true; } else ctx.lineTo(sx, sy);
        }
        ctx.stroke();
        ctx.restore();
    }

    drawGeodesic(x1, x2, style, width, dash) { this._drawPolyline(this._sampleGeodesic(x1, x2), style, width, dash); }

    // sample the geodesic SEGMENT between two interior/ideal UHP points P,Q
    _geodesicSegment(P, Q) {
        const pts = [];
        // a geodesic ending at the ∞ cusp is the vertical ray at the finite endpoint's x
        const pInf = Math.abs(P.x) > 1e6, qInf = Math.abs(Q.x) > 1e6;
        if (pInf || qInf) {
            const f = pInf ? Q : P, yTop = Math.max(f.y * 6 + 6, f.y + 40), N = 48;
            for (let i = 0; i <= N; i++) pts.push({ x: f.x, y: f.y + (yTop - f.y) * i / N });
            return pts;
        }
        if (Math.abs(P.x - Q.x) < 1e-9) {                        // vertical
            const N = 48; for (let i = 0; i <= N; i++) pts.push({ x: P.x, y: P.y + (Q.y - P.y) * i / N });
            return pts;
        }
        const c = ((P.x * P.x + P.y * P.y) - (Q.x * Q.x + Q.y * Q.y)) / (2 * (P.x - Q.x));
        const r = Math.hypot(P.x - c, P.y);
        let t1 = Math.atan2(P.y, P.x - c), t2 = Math.atan2(Q.y, Q.x - c);
        const N = 80;
        for (let i = 0; i <= N; i++) { const t = t1 + (t2 - t1) * i / N; pts.push({ x: c + r * Math.cos(t), y: r * Math.sin(t) }); }
        return pts;
    }

    _drawTiling(dom) {
        if (!dom.tileMats || !dom.sides) return;
        const V = dom.vertices;
        for (const g of dom.tileMats) {
            for (const s of dom.sides) {
                // image of each side under g; mobius maps the ∞ cusp (stored as x≈1e9)
                // to its finite image g(∞)=a/c, and _geodesicSegment handles any ∞ endpoint.
                const ga = mobius(g, V[s.vtxA].uhp), gb = mobius(g, V[s.vtxB].uhp);
                this._drawPolyline(this._geodesicSegment(ga, gb), 'rgba(129,140,248,0.16)', 0.7);
            }
        }
    }

    _drawDomain(dom) {
        if (!dom || !dom.vertices || !dom.sides || !dom.sides.length) return;
        const ctx = this.ctx, V = dom.vertices, idx = dom.boundaryIdx || V.map((_, i) => i);
        const kk = (a, b) => a < b ? `${a},${b}` : `${b},${a}`;
        const sideByPair = new Map(); dom.sides.forEach(s => sideByPair.set(kk(s.vtxA, s.vtxB), s));

        // fill the polygon: follow the face arc when consecutive corners share a side,
        // else (a genuine free-boundary gap between two ideal corners) go straight.
        const path = [];
        for (let i = 0; i < idx.length; i++) {
            const ia = idx[i], ib = idx[(i + 1) % idx.length];
            const a = V[ia].uhp, b = V[ib].uhp;
            if (sideByPair.has(kk(ia, ib))) path.push(...this._geodesicSegment(a, b));
            else if (a.ideal && b.ideal) path.push(a, b);
            else path.push(...this._geodesicSegment(a, b));
        }
        if (path.length > 2) {
            ctx.save(); ctx.beginPath(); let started = false;
            for (const p of path) { const [sx, sy] = this.toScreen(p.x, Math.max(p.y, 0)); if (!isFinite(sx) || !isFinite(sy)) { started = false; continue; } if (!started) { ctx.moveTo(sx, sy); started = true; } else ctx.lineTo(sx, sy); }
            ctx.closePath(); ctx.fillStyle = 'rgba(56,189,248,0.08)'; ctx.fill(); ctx.restore();
        }

        // paired sides, colored by pairing class
        dom.sides.forEach(s => this._drawPolyline(this._geodesicSegment(V[s.vtxA].uhp, V[s.vtxB].uhp), s.color || '#60a5fa', s.paired ? 2.6 : 1.4, s.paired ? null : [4, 4]));

        // cone-point / cusp markers from the certificate
        const cyc = dom.cert && dom.cert.cycles;
        if (cyc) for (const c of cyc) {
            if (c.kindLabel === 'cone' && c.verts.length) {
                const v = V[c.verts[0]]; if (!v.ideal) this.drawInteriorPoint(toRe(v.uhp), '#fbbf24', String(c.order), false);
            }
        }
        V.forEach(v => { if (!v.ideal) this.drawInteriorPoint(toRe(v.uhp), 'rgba(226,232,240,0.8)', null); });
    }

    drawBoundaryPoint(x, style, label) {
        // map a boundary point (y→0) to screen
        const p = isFinite(x) ? this.toScreen(x, 1e-7) : (this.model === 'disk' ? [this.disk.cx + this.disk.R, this.disk.cy] : null);
        if (!p) return;            // ∞ in UHP: off the top, skip the dot
        const ctx = this.ctx;
        ctx.fillStyle = style; ctx.beginPath(); ctx.arc(p[0], p[1], 3.2, 0, 7); ctx.fill();
        if (label) { ctx.fillStyle = style; ctx.font = '11px JetBrains Mono, monospace'; ctx.textAlign = 'center'; ctx.fillText(label, p[0], p[1] - 8); }
    }

    drawInteriorPoint(z, style, label, big) {
        if (!z || z.im <= 0) return;
        const [sx, sy] = this.toScreen(z.re, z.im);
        const ctx = this.ctx;
        if (big) { ctx.fillStyle = COL.witnessGlow; ctx.beginPath(); ctx.arc(sx, sy, 16, 0, 7); ctx.fill(); }
        ctx.fillStyle = style; ctx.beginPath(); ctx.arc(sx, sy, big ? 5.5 : 3.5, 0, 7); ctx.fill();
        ctx.strokeStyle = 'rgba(0,0,0,0.5)'; ctx.lineWidth = 1; ctx.stroke();
        if (label) { ctx.fillStyle = style; ctx.font = `bold ${big ? 13 : 11}px JetBrains Mono, monospace`; ctx.textAlign = 'left'; ctx.fillText(label, sx + 9, sy - 7); }
    }

    _drawBoundary() {
        const ctx = this.ctx;
        if (this.model === 'disk') {
            ctx.strokeStyle = COL.boundary; ctx.lineWidth = 1.5;
            ctx.beginPath(); ctx.arc(this.disk.cx, this.disk.cy, this.disk.R, 0, 7); ctx.stroke();
            return;
        }
        const baseY = this.height * this.uhp.baseFrac;
        ctx.strokeStyle = COL.boundary; ctx.lineWidth = 1.2;
        ctx.beginPath(); ctx.moveTo(0, baseY); ctx.lineTo(this.width, baseY); ctx.stroke();
        // ticks
        const left = (0 - this.width / 2) / this.uhp.scale + this.uhp.centerX;
        const right = (this.width - this.width / 2) / this.uhp.scale + this.uhp.centerX;
        let step = 1; const span = right - left;
        if (span > 20) step = 5; if (span > 60) step = 20; if (span < 4) step = 0.5; if (span < 1.5) step = 0.25;
        ctx.fillStyle = COL.tick; ctx.font = '10px Inter, sans-serif'; ctx.textAlign = 'center';
        for (let x = Math.ceil(left / step) * step; x <= right; x += step) {
            const [sx] = this.toScreen(x, 1e-7);
            ctx.strokeStyle = COL.tick; ctx.beginPath(); ctx.moveTo(sx, baseY - 3); ctx.lineTo(sx, baseY + 3); ctx.stroke();
            ctx.fillText(Math.abs(x) < 1e-9 ? '0' : (step < 1 ? x.toFixed(2) : String(Math.round(x))), sx, baseY + 14);
        }
    }

    _render() {
        const { ctx, width, height } = this;
        ctx.clearRect(0, 0, width, height);
        ctx.fillStyle = COL.bg; ctx.fillRect(0, 0, width, height);
        if (this.model === 'disk') {       // fill the disk faintly
            ctx.save(); ctx.fillStyle = 'rgba(56,189,248,0.025)';
            ctx.beginPath(); ctx.arc(this.disk.cx, this.disk.cy, this.disk.R, 0, 7); ctx.fill(); ctx.restore();
        }
        this._drawBoundary();

        if (this.opts.tessellation && this.scene.domain) this._drawTiling(this.scene.domain);
        if (this.opts.domain && this.scene.domain) this._drawDomain(this.scene.domain);

        const gens = this.scene.generators || [];
        gens.forEach((g, i) => {
            const color = g.color || PALETTE[i % PALETTE.length];
            const cls = g.cls || g.mat.classify();
            if (this.opts.isoCircles) {
                const ic = g.mat.isometricCircle();
                if (ic) this.drawGeodesic(ic.cx - ic.r, ic.cx + ic.r, color, 1.6);
            }
            if (this.opts.axes && (cls.kind === 'hyperbolic' || cls.kind === 'glide')) {
                const fp = g.mat.boundaryFixedPoints();
                if (fp.length === 2) this.drawGeodesic(fp[0], fp[1], COL.axis, 1.2, [5, 4]);
            }
            if (this.opts.fixedPoints) {
                if (cls.kind === 'elliptic') this.drawInteriorPoint(g.mat.ellipticFixedPoint(), color, g.label);
                else for (const x of g.mat.boundaryFixedPoints()) this.drawBoundaryPoint(x, color);
            }
        });

        if (this.opts.basepoint) {
            const bp = (this.scene.domain && this.scene.domain.basepointUhp) || { x: 0, y: 1 };
            this.drawInteriorPoint({ re: bp.x, im: bp.y }, COL.basepoint, 'o');
        }

        const w = this.scene.witness;
        if (w && w.mat) {
            const cls = w.cls || w.mat.classify();
            if (cls.kind === 'elliptic') {
                const z = w.mat.ellipticFixedPoint();
                this.drawInteriorPoint(z, COL.witness, w.wordStr || 'witness', true);
            } else {
                const ic = w.mat.isometricCircle();
                if (ic) this.drawGeodesic(ic.cx - ic.r, ic.cx + ic.r, COL.witness, 2.5);
                const fp = w.mat.boundaryFixedPoints();
                if (fp.length === 2) this.drawGeodesic(fp[0], fp[1], COL.witness, 2.5, [6, 4]);
            }
        }
    }

    // ---- interaction ----
    _setupInteraction() {
        let dragging = false, lastX = 0, lastY = 0;
        const onDown = (x, y) => { dragging = true; lastX = x; lastY = y; this.canvas.style.cursor = 'grabbing'; };
        const onMove = (x, y) => {
            if (!dragging) return;
            const dx = x - lastX, dy = y - lastY; lastX = x; lastY = y;
            if (this.model === 'uhp') { this.uhp.centerX -= dx / this.uhp.scale; this.uhp.baseFrac += dy / this.height; }
            else { this.disk.cx += dx; this.disk.cy += dy; }
        };
        const onUp = () => { dragging = false; this.canvas.style.cursor = 'grab'; };

        this.canvas.addEventListener('mousedown', e => onDown(e.clientX, e.clientY));
        window.addEventListener('mousemove', e => onMove(e.clientX, e.clientY));
        window.addEventListener('mouseup', onUp);
        this.canvas.addEventListener('wheel', e => {
            e.preventDefault();
            const f = e.deltaY > 0 ? 1 / 1.1 : 1.1;
            if (this.model === 'uhp') {
                const rect = this.canvas.getBoundingClientRect();
                const mx = e.clientX - rect.left;
                const wxBefore = (mx - this.width / 2) / this.uhp.scale + this.uhp.centerX;
                this.uhp.scale = Math.max(8, Math.min(this.uhp.scale * f, 60000));
                const wxAfter = (mx - this.width / 2) / this.uhp.scale + this.uhp.centerX;
                this.uhp.centerX += wxBefore - wxAfter;
            } else this.disk.R = Math.max(40, Math.min(this.disk.R * f, 20000));
        }, { passive: false });
        window.addEventListener('resize', () => this._resize());
    }

    _loop() {
        const rect = this.canvas.getBoundingClientRect();
        if (rect.width !== this.width || rect.height !== this.height) this._resize();
        this._render();
        requestAnimationFrame(() => this._loop());
    }
}
