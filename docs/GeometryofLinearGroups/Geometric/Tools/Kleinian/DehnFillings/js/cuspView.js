// cuspView.js — the view from a cusp: the vertex triangles of the tetrahedra at that cusp,
// developed in the plane, and their images under the holonomy of the cusp torus.
//
// Complete structure: the holonomy is a lattice of translations (the Euclidean cusp torus).
// Deformed: the meridian m and longitude l act by similarities z ↦ a z + b with a common fixed
// point c, where the core geodesic meets the sphere. In w = log(z − c) they are translations by
// H(m), H(l): the torus is C/Λ. The filling curve p·m + q·l translates w by p H(m) + q H(l) = iθ,
// θ the cone angle, so it is a vertical segment of length θ; w and w + 2πi are the same point, and
// at θ = 2π the filling curve closes up — it bounds a disk, which is Dehn filling.
//
//   'plane'  z, one sheet: copies whose centre lies in α − π ≤ arg(z − c) < α + π, so the angle
//            around c is covered once, with a seam along one ray that closes exactly when
//            2πi ∈ Λ (θ = 2π/n, 2π)
//   'log'    w, the lattice tiling, with the lines Im w ≡ α + π (mod 2π) dashed
//
// Drawn as SnapPy draws a cusp, the view from inside the manifold: the mirror image of the
// developed plane, so the meridian points right and the longitude up.

import { developCusp, applySim, composeSim, powSim } from './develop.js';
import { C, add, sub, mul, div, exp, abs, scale, conj, ONE } from './complex.js';
import { tex, hexRGB } from './ui.js';

const smooth = (x) => (x <= 0 ? 0 : x >= 1 ? 1 : x * x * (3 - 2 * x));

export class CuspView {
    constructor(canvas, texLayer) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.texLayer = texLayer;
        this.cusp = 0;
        this.mode = 'plane';
        this.opts = { tiles: true, curves: true };
        this.user = { zoom: 1, dx: 0, dy: 0 };
        this.insetRight = 0;
        this.insetBottom = 0;
        this.labels = {};
        for (const k of ['m', 'l', 'g', 'c', 'p']) {
            const el = document.createElement('div');
            el.className = `lbl ${{ m: 'mer', l: 'lon', g: 'slope', c: 'core', p: 'dim' }[k]}`;
            el.style.display = 'none';
            texLayer.appendChild(el);
            this.labels[k] = el;
        }
        this._wire();
    }

    _wire() {
        const cv = this.canvas;
        cv.addEventListener('wheel', (e) => {
            e.preventDefault();
            const f = Math.exp(-e.deltaY * 0.0015);
            const r = cv.getBoundingClientRect();
            const [cx, cy] = this._centre();
            const mx = e.clientX - r.left - cx - this.user.dx, my = e.clientY - r.top - cy - this.user.dy;
            this.user.zoom *= f;
            this.user.dx -= mx * (f - 1);
            this.user.dy -= my * (f - 1);
            this.draw();
        }, { passive: false });
        let drag = null;
        cv.addEventListener('pointerdown', (e) => { drag = { x: e.clientX, y: e.clientY, dx: this.user.dx, dy: this.user.dy }; cv.setPointerCapture(e.pointerId); });
        cv.addEventListener('pointermove', (e) => {
            if (!drag) return;
            this.user.dx = drag.dx + e.clientX - drag.x;
            this.user.dy = drag.dy + e.clientY - drag.y;
            this.draw();
        });
        const end = () => { drag = null; };
        cv.addEventListener('pointerup', end);
        cv.addEventListener('pointercancel', end);
    }

    resetView() { this.user = { zoom: 1, dx: 0, dy: 0 }; this.draw(); }
    setInset(right, bottom = 0) { this.insetRight = right; this.insetBottom = bottom; }
    setVisible(v) {
        this.canvas.hidden = !v;
        this.visible = v;
        if (!v) Object.values(this.labels).forEach((el) => { el.style.display = 'none'; });
        else this.draw();
    }
    setColors(c) { this.colors = c; this.draw(); }
    setOptions(o) { Object.assign(this.opts, o); this.draw(); }
    setMode(m) { this.mode = m; this.user = { zoom: 1, dx: 0, dy: 0 }; this.draw(); }
    setManifold(tri) { this.tri = tri; this.cusp = 0; this.user = { zoom: 1, dx: 0, dy: 0 }; }
    setCusp(k) { this.cusp = k; this.user = { zoom: 1, dx: 0, dy: 0 }; }

    _centre() {
        const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
        return [(w - this.insetRight) / 2, (h - this.insetBottom) / 2];
    }

    /** New shapes: rebuild the developed picture. */
    update(frame) {
        this.frame = frame;
        if (!this.tri || !frame) return;
        const k = this.cusp;
        const cu = developCusp(this.tri, frame.z, k);
        this.cu = cu;
        const hol = frame.hol[k];
        this.H = { m: hol.m, l: hol.l };
        this.slope = frame.spec ? frame.spec[k] : null;
        const fdPts = cu.triangles.flatMap((T) => T.corners);
        const zref = scale(fdPts.reduce((s, z) => add(s, z), C(0, 0)), 1 / fdPts.length);
        const m = cu.meridian, l = cu.longitude;
        // the frame: the meridian moves zref by 1, to the right (after the mirror)
        const bm = sub(applySim(m, zref), zref);
        const dm = abs(sub(ONE, m[0])), dl = abs(sub(ONE, l[0]));
        const ref = dm >= dl ? m : l;
        this.fixed = Math.max(dm, dl) > 1e-9 ? div(ref[1], sub(ONE, ref[0])) : null;
        this.view = { zref, bm };
        const T0 = cu.triangles[0].corners;
        this.x0 = scale(add(add(T0[0], T0[1]), T0[2]), 1 / 3);
        if (this.fixed) {
            const c = this.fixed;
            this.alpha = Math.atan2(zref.im - c.im, zref.re - c.re);
            this.wc = this.wOf(zref);
            this.wfd = cu.triangles.map((T) => T.corners.map((z) => this.wOf(z)));
            this.wx0 = this.wOf(this.x0);
            this.k = div(sub(zref, c), bm);           // log coordinates scaled to agree with the plane near the domain
        }
        this.draw();
    }

    /** log(z − c), on the branch α − π ≤ arg < α + π. */
    wOf(z) {
        const d = sub(z, this.fixed);
        let a = Math.atan2(d.im, d.re);
        while (a < this.alpha - Math.PI) a += 2 * Math.PI;
        while (a >= this.alpha + Math.PI) a -= 2 * Math.PI;
        return C(Math.log(abs(d)), a);
    }

    get logMode() { return this.mode === 'log' && !!this.fixed; }

    /** The map from the working plane (z, or w in log mode) to the screen, and its inverse. */
    _frameMaps() {
        const W = this.canvas.clientWidth - this.insetRight, H = this.canvas.clientHeight - this.insetBottom;
        const [cx, cy] = this._centre();
        const { zref, bm } = this.view;
        let toD, fromD;
        if (this.logMode) {
            // x = log of the distance to the core, y = the angle around it (so the filling curve,
            // a translation by iθ, points straight up); scaled like the plane near the domain
            const sk = abs(this.k), wc = this.wc;
            toD = (w) => scale(sub(w, wc), sk);
            fromD = (d) => add(scale(d, 1 / sk), wc);
        } else {
            toD = (z) => conj(div(sub(z, zref), bm));
            fromD = (d) => add(mul(conj(d), bm), zref);
        }
        // auto frame: the fundamental domain; in the plane, drifting toward the fixed point when near
        const lD = toD(this.logMode ? add(this.wc, this.H.l) : applySim(this.cu.longitude, zref));
        const mD = toD(this.logMode ? add(this.wc, this.H.m) : applySim(this.cu.meridian, zref));
        let half = Math.max(2.2, 0.8 * Math.max(1, abs(lD), abs(mD)) + 1.1);
        let centre = C(0.5 * mD.re, 0.5 * lD.im);
        if (!this.logMode && this.fixed) {
            const cD = toD(this.fixed);
            const R = abs(cD), near = 3.2 * half;
            const w = R >= near ? 0 : R <= near / 2 ? 1 : 1 - smooth((R - near / 2) / (near / 2));
            centre = add(scale(centre, 1 - w), scale(cD, w));
            half = (1 - w) * half + w * Math.max(1.6, 1.15 * R + 0.9);
        }
        if (this.logMode) {
            // show one full turn around the core when it is within reach
            // frame the filling curve, a vertical segment of length θ from the base point
            const sk = abs(this.k);
            const theta = this.slope ? add(scale(this.H.m, this.slope.p), scale(this.H.l, this.slope.q)).im : 0;
            const len = Math.abs(theta) * sk;
            if (len < 6 * half) {
                const b = toD(this.wx0);
                centre = C(b.re, b.im + 0.5 * theta * sk);
                half = Math.max(half, 0.62 * len + 0.8);
            }
        }
        const px = (0.46 * Math.min(W, H) / half) * this.user.zoom;
        const ox = cx + this.user.dx, oy = cy + this.user.dy;
        const map = (p) => { const d = toD(p); return [ox + px * (d.re - centre.re), oy - px * (d.im - centre.im)]; };
        const unmap = (x, y) => fromD(C(centre.re + (x - ox) / px, centre.im - (y - oy) / px));
        return { map, unmap, px };
    }

    /** The copies of the fundamental domain that meet the screen. */
    _images(map, unmap, W, H) {
        const out = [];
        const LIMIT = this.opts.tiles ? 12000 : 1;
        const corners = [[0, 0], [W, 0], [0, H], [W, H]].map(([x, y]) => unmap(x, y));
        const fd = this.cu.triangles.map((T) => T.corners);
        if (!this.fixed) {                                  // complete: translates by the lattice
            const mu = this.cu.meridian[1], la = this.cu.longitude[1];
            const [i0, i1, j0, j1] = range(corners.map((z) => solve2(mu, la, sub(z, this.view.zref))), 2);
            for (let i = i0; i <= i1; i++) for (let j = j0; j <= j1; j++) {
                if (out.length >= LIMIT || (!this.opts.tiles && (i || j))) continue;
                const tr = add(scale(mu, i), scale(la, j));
                out.push({ i, j, pts: fd.map((P) => P.map((z) => map(add(z, tr)))) });
            }
            return out;
        }
        const Hm = this.H.m, Hl = this.H.l, wc = this.wc, wfd = this.wfd;
        const pad = Math.max(...wfd.flat().map((w) => abs(sub(w, wc)))) + 1e-9;
        let reMin, reMax, imMin, imMax;
        if (this.logMode) {
            reMin = Math.min(...corners.map((w) => w.re)); reMax = Math.max(...corners.map((w) => w.re));
            imMin = Math.min(...corners.map((w) => w.im)); imMax = Math.max(...corners.map((w) => w.im));
        } else {
            const c = this.fixed;
            const [cx, cy] = map(c);
            const ws = corners.map((z) => this.wOf(z));
            reMax = Math.max(...ws.map((w) => w.re));
            if (cx >= 0 && cx <= W && cy >= 0 && cy <= H) {
                imMin = this.alpha - Math.PI; imMax = this.alpha + Math.PI;
                const pxPerUnit = abs(sub(C(...map(add(c, C(1, 0)))), C(cx, cy)));
                reMin = Math.log(0.6 / (pxPerUnit * pad + 1e-300));
            } else {
                imMin = Math.min(...ws.map((w) => w.im)); imMax = Math.max(...ws.map((w) => w.im));
                const nx = Math.min(Math.max(cx, 0), W), ny = Math.min(Math.max(cy, 0), H);
                reMin = this.wOf(unmap(nx, ny)).re;
            }
        }
        const box = [C(reMin - pad, imMin - pad), C(reMax + pad, imMin - pad), C(reMin - pad, imMax + pad), C(reMax + pad, imMax + pad)];
        const [i0, i1, j0, j1] = range(box.map((w) => solve2(Hm, Hl, sub(w, wc))), 1);
        if ((i1 - i0 + 1) * (j1 - j0 + 1) > 600000) return [{ i: 0, j: 0, pts: (this.logMode ? wfd : fd).map((P) => P.map(map)) }];
        const lo = this.alpha - Math.PI, hi = this.alpha + Math.PI;
        for (let i = i0; i <= i1; i++) {
            for (let j = j0; j <= j1; j++) {
                if (out.length >= LIMIT || (!this.opts.tiles && (i || j))) continue;
                const tr = add(scale(Hm, i), scale(Hl, j));
                const cen = add(wc, tr);
                if (cen.re < reMin - pad || cen.re > reMax + pad || cen.im < imMin - pad || cen.im > imMax + pad) continue;
                if (this.logMode) { out.push({ i, j, pts: wfd.map((P) => P.map((w) => map(add(w, tr)))) }); continue; }
                if (cen.im < lo || cen.im >= hi) continue;
                out.push({ i, j, pts: wfd.map((P) => P.map((w) => map(add(this.fixed, exp(add(w, tr)))))) });
            }
        }
        if (!out.some((o) => o.i === 0 && o.j === 0)) out.push({ i: 0, j: 0, pts: (this.logMode ? wfd : fd).map((P) => P.map(map)) });
        return out;
    }

    /** A curve from the base point along the holonomy with log-derivative H and similarity h. */
    _curve(H, h) {
        const N = 160, pts = [];
        if (this.logMode) {
            for (let i = 0; i <= N; i++) pts.push(add(this.wx0, scale(H, i / N)));
            return pts;
        }
        const small = abs(H) < 1e-7 || !this.fixed;
        const end = applySim(h, this.x0);
        for (let i = 0; i <= N; i++) {
            const s = i / N;
            pts.push(small ? add(this.x0, scale(sub(end, this.x0), s)) : add(this.fixed, mul(sub(this.x0, this.fixed), exp(scale(H, s)))));
        }
        return pts;
    }

    draw() {
        if (!this.visible || !this.cu || !this.colors) return;
        const cv = this.canvas, ctx = this.ctx;
        const dpr = Math.min(devicePixelRatio, 2);
        const W = cv.clientWidth, H = cv.clientHeight;
        if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        ctx.clearRect(0, 0, W, H);
        const { map, unmap } = this._frameMaps();
        const images = this._images(map, unmap, W, H);
        const tris = this.cu.triangles;
        const pal = this.colors.tet;
        const light = this.colors.light;
        for (let pass = 0; pass < 2; pass++) {
            const byTet = new Map();
            for (const im of images) {
                const fd = im.i === 0 && im.j === 0;
                if ((pass === 1) !== fd) continue;
                tris.forEach((T, a) => {
                    if (!byTet.has(T.tet)) byTet.set(T.tet, []);
                    byTet.get(T.tet).push(im.pts[a]);
                });
            }
            for (const [t, list] of byTet) {
                ctx.beginPath();
                for (const P of list) { ctx.moveTo(P[0][0], P[0][1]); ctx.lineTo(P[1][0], P[1][1]); ctx.lineTo(P[2][0], P[2][1]); ctx.closePath(); }
                ctx.fillStyle = rgba(pal[t % pal.length], pass === 1 ? (light ? 0.55 : 0.62) : (light ? 0.22 : 0.26));
                ctx.fill();
            }
            ctx.beginPath();
            for (const im of images) {
                const fd = im.i === 0 && im.j === 0;
                if ((pass === 1) !== fd) continue;
                for (const P of im.pts) { ctx.moveTo(P[0][0], P[0][1]); ctx.lineTo(P[1][0], P[1][1]); ctx.lineTo(P[2][0], P[2][1]); ctx.closePath(); }
            }
            ctx.strokeStyle = rgba(this.colors.ink, pass === 1 ? 0.85 : 0.22);
            ctx.lineWidth = pass === 1 ? 1.2 : 0.8;
            ctx.lineJoin = 'round';
            ctx.stroke();
        }
        const L = this.labels;
        Object.values(L).forEach((el) => { el.style.display = 'none'; });
        // log mode: the lines Im w ≡ α + π (mod 2π) — w and w + 2πi are the same point
        if (this.logMode) {
            const base = this.alpha + Math.PI;
            const ws = [[0, 0], [W, 0], [0, H], [W, H]].map(([x, y]) => unmap(x, y));
            const reLo = Math.min(...ws.map((w) => w.re)) - 1, reHi = Math.max(...ws.map((w) => w.re)) + 1;
            const kLo = Math.floor((Math.min(...ws.map((w) => w.im)) - base) / (2 * Math.PI)) - 1;
            const kHi = Math.ceil((Math.max(...ws.map((w) => w.im)) - base) / (2 * Math.PI)) + 1;
            ctx.save();
            ctx.setLineDash([6, 6]);
            ctx.strokeStyle = rgba(this.colors.core, 0.75);
            ctx.lineWidth = 1.4;
            for (let k = Math.max(kLo, -40); k <= Math.min(kHi, 40); k++) {
                const im = base + 2 * Math.PI * k;
                const [x1, y1] = map(C(reLo, im)), [x2, y2] = map(C(reHi, im));
                ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x2, y2); ctx.stroke();
            }
            ctx.restore();
            const [lx, ly] = map(C(this.wx0.re, base));
            L.p.innerHTML = tex('w \\sim w + 2\\pi i');
            L.p.style.display = '';
            L.p.style.left = `${Math.min(W - this.insetRight - 120, Math.max(120, lx))}px`;
            L.p.style.top = `${ly - 14}px`;
        }
        if (this.opts.curves) {
            const drawCurve = (pts, color, width, label, el, at = 0.5) => {
                if (!pts) return;
                ctx.beginPath();
                pts.forEach((z, i) => { const [x, y] = map(z); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); });
                ctx.strokeStyle = color;
                ctx.lineWidth = width;
                ctx.lineCap = 'round';
                ctx.stroke();
                const [x1, y1] = map(pts[pts.length - 1]), [x2, y2] = map(pts[pts.length - 2]);
                arrowHead(ctx, x2, y2, x1, y1, color, 5 + width * 1.5);
                const [lx, ly] = map(pts[Math.round(at * (pts.length - 1))]);
                el.innerHTML = label;
                el.style.display = '';
                el.style.left = `${lx + 12}px`;
                el.style.top = `${ly - 12}px`;
            };
            drawCurve(this._curve(this.H.m, this.cu.meridian), this.colors.mer, 2, tex('m'), L.m, 0.5);
            drawCurve(this._curve(this.H.l, this.cu.longitude), this.colors.lon, 2, tex('l'), L.l, 0.55);
            if (this.slope) {
                const { p, q } = this.slope;
                const Hg = add(scale(this.H.m, p), scale(this.H.l, q));
                const g = composeSim(powSim(this.cu.meridian, p), powSim(this.cu.longitude, q));
                drawCurve(this._curve(Hg, g), this.colors.slope, 3, tex(`${p}\\,m ${q < 0 ? '-' : '+'} ${Math.abs(q)}\\,l`), L.g, 0.3);
            }
            const [bx, by] = map(this.logMode ? this.wx0 : this.x0);
            ctx.beginPath(); ctx.arc(bx, by, 3.5, 0, 2 * Math.PI); ctx.fillStyle = this.colors.ink; ctx.fill();
        }
        if (this.fixed && !this.logMode) {
            const [fx, fy] = map(this.fixed);
            if (fx > -50 && fx < W + 50 && fy > -50 && fy < H + 50) {
                ctx.beginPath(); ctx.arc(fx, fy, 6, 0, 2 * Math.PI);
                ctx.strokeStyle = this.colors.core; ctx.lineWidth = 2; ctx.stroke();
                ctx.beginPath(); ctx.arc(fx, fy, 2.2, 0, 2 * Math.PI); ctx.fillStyle = this.colors.core; ctx.fill();
                L.c.innerHTML = 'core';
                L.c.style.display = '';
                L.c.style.left = `${fx + 30}px`;
                L.c.style.top = `${fy + 14}px`;
            }
        }
        this.imageCount = images.length;
    }
}

/** Real (x, y) with x·a + y·b = v for complex a, b, v. */
function solve2(a, b, v) {
    const det = a.re * b.im - a.im * b.re;
    if (Math.abs(det) < 1e-300) return [0, 0];
    return [(v.re * b.im - v.im * b.re) / det, (a.re * v.im - a.im * v.re) / det];
}
function range(ij, margin) {
    const is = ij.map((x) => x[0]), js = ij.map((x) => x[1]);
    return [Math.floor(Math.min(...is)) - margin, Math.ceil(Math.max(...is)) + margin, Math.floor(Math.min(...js)) - margin, Math.ceil(Math.max(...js)) + margin];
}
function rgba(hex, a) {
    const [r, g, b] = hexRGB(hex);
    return `rgba(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)},${a})`;
}
function arrowHead(ctx, x0, y0, x1, y1, color, size) {
    const a = Math.atan2(y1 - y0, x1 - x0);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x1 - size * Math.cos(a - 0.45), y1 - size * Math.sin(a - 0.45));
    ctx.lineTo(x1 - size * Math.cos(a + 0.45), y1 - size * Math.sin(a + 0.45));
    ctx.closePath();
    ctx.fillStyle = color;
    ctx.fill();
}
