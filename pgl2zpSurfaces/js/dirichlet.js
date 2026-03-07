/* ============================================================
   dirichlet.js – Dirichlet domain tiling on the upper half-plane
   
   Shows the action of the group Δ = ⟨A,B⟩ (and the subgroup H)
   on the hyperbolic upper half-plane ℍ.
   
   We draw the Dirichlet domain for the base group Δ centered at
   a chosen basepoint, then shade copies differently by H-coset.
   ============================================================ */

import { A, B, Ainv, Binv, mulMat, mobiusAction } from './math.js';

// ---------- Hyperbolic geometry helpers ----------

/** Hyperbolic distance in upper half-plane model */
function hypDist(z1, z2) {
    const dx = z1.x - z2.x;
    const dy = z1.y - z2.y;
    const num = dx * dx + dy * dy;
    const denom = 2 * z1.y * z2.y;
    if (denom <= 0) return Infinity;
    const ratio = num / denom;
    return Math.acosh(1 + ratio);
}

function complexDiv(a, b) {
    const denom = b.x * b.x + b.y * b.y;
    return {
        x: (a.x * b.x + a.y * b.y) / denom,
        y: (a.y * b.x - a.x * b.y) / denom
    };
}
function complexMul(a, b) {
    return {
        x: a.x * b.x - a.y * b.y,
        y: a.x * b.y + a.y * b.x
    };
}
function complexSub(a, b) { return { x: a.x - b.x, y: a.y - b.y }; }

// ---------- Dirichlet Domain via Klein Model ----------

/** 
 * Map UHP z to Poincare disk w, sending z0 to 0.
 * w = (z - z0) / (z - conj(z0))
 */
function uhpToPoincare(z, z0) {
    const num = complexSub(z, z0);
    const den = complexSub(z, { x: z0.x, y: -z0.y });
    return complexDiv(num, den);
}

/** 
 * Map Poincare w to UHP z, inverse of above.
 * z = (z0 - w * conj(z0)) / (1 - w)
 */
function poincareToUHP(w, z0) {
    const num = complexSub(z0, complexMul(w, { x: z0.x, y: -z0.y }));
    const den = { x: 1 - w.x, y: -w.y };
    return complexDiv(num, den);
}

/**
 * Convert Poincare w to Klein K
 * K = 2w / (1 + |w|^2)
 */
function poincareToKlein(w) {
    const r2 = w.x * w.x + w.y * w.y;
    return { x: 2 * w.x / (1 + r2), y: 2 * w.y / (1 + r2) };
}

/**
 * Convert Klein K to Poincare w
 * w = K * (1 - sqrt(1 - |K|^2)) / |K|^2
 */
function kleinToPoincare(k) {
    const r2 = k.x * k.x + k.y * k.y;
    if (r2 < 1e-12) return { x: 0, y: 0 };
    const factor = (1 - Math.sqrt(Math.max(0, 1 - r2))) / r2;
    return { x: k.x * factor, y: k.y * factor };
}

/**
 * Clip a Euclidean convex polygon against the half-plane Ax + By <= C
 */
function clipConvexPolygon(poly, A, B, C) {
    function side(pt) { return A * pt.x + B * pt.y - C; }
    const out = [];
    for (let i = 0; i < poly.length; i++) {
        const cur = poly[i], nxt = poly[(i + 1) % poly.length];
        const sc = side(cur), sn = side(nxt);

        if (sc <= 0) out.push(cur);

        if ((sc <= 0 && sn > 0) || (sc > 0 && sn <= 0)) {
            const t = sc / (sc - sn);
            out.push({
                x: cur.x + t * (nxt.x - cur.x),
                y: cur.y + t * (nxt.y - cur.y)
            });
        }
    }
    return out;
}

// ---------- Dirichlet domain computation ----------

function computeDirichletDomain(basepoint, maxDepth, p) {
    const bp = basepoint;
    const depth = maxDepth || 6;

    // We do clipping in the Klein model where bisectors are strictly Euclidean straight lines
    let kleinPoly = [
        { x: -0.999, y: 0.999 },
        { x: -0.999, y: -0.999 },
        { x: 0.999, y: -0.999 },
        { x: 0.999, y: 0.999 }
    ];

    const tau = [[p, 0], [0, 1]];
    const tauInv = [[1 / p, 0], [0, 1]];
    const gens = [A, B, Ainv, Binv, tau, tauInv];

    function matKey(M) {
        return `${M[0][0].toFixed(4)},${M[0][1].toFixed(4)},${M[1][0].toFixed(4)},${M[1][1].toFixed(4)}`;
    }

    const seen = new Set();
    const id = [[1, 0], [0, 1]];
    seen.add(matKey(id));
    let frontier = [id];

    for (let d = 0; d < depth; d++) {
        const nextFrontier = [];
        for (const g of frontier) {
            for (const gen of gens) {
                const ng = mulMat(gen, g);
                const key = matKey(ng);
                if (seen.has(key)) continue;
                seen.add(key);

                const img = mobiusAction(ng, bp);
                if (img.y <= 0 || !isFinite(img.x) || !isFinite(img.y)) continue;

                // Map to Poincare disk
                const w = uhpToPoincare(img, bp);

                // The bisector of 0 and w in Poincare disk maps to a straight line in Klein:
                // a X + b Y <= a^2 + b^2, where w = a + ib
                const A_k = w.x;
                const B_k = w.y;
                const C_k = w.x * w.x + w.y * w.y;

                if (C_k > 0) {
                    kleinPoly = clipConvexPolygon(kleinPoly, A_k, B_k, C_k);
                }

                if (kleinPoly.length < 3) break;
                nextFrontier.push(ng);
            }
        }
        frontier = nextFrontier;
        if (kleinPoly.length < 3) break;
    }

    // Map exact vertices back to UHP
    const domainUHP = kleinPoly.map(k => {
        const w = kleinToPoincare(k);
        return poincareToUHP(w, bp);
    });

    return domainUHP;
}

// ---------- Tiling ----------

/**
 * Generate tiled copies of the fundamental domain.
 * Each tile gets a coset index for coloring.
 */
function generateTiles(domain, basepoint, cosetPerms, maxTiles, p, numCosets) {
    const tau = [[p, 0], [0, 1]];
    const tauInv = [[1 / p, 0], [0, 1]];
    const gens = [A, B, Ainv, Binv, tau, tauInv];
    const genCosetIdx = cosetPerms
        ? [cosetPerms.a, cosetPerms.b, cosetPerms.A, cosetPerms.B, null, null]
        : null;

    const limit = maxTiles || 200;

    function matKey(M) {
        return `${M[0][0].toFixed(3)},${M[0][1].toFixed(3)},${M[1][0].toFixed(3)},${M[1][1].toFixed(3)}`;
    }

    const id = [[1, 0], [0, 1]];
    const tiles = [];
    const seen = new Set();
    seen.add(matKey(id));

    // BFS
    let queue = [{ mat: id, coset: 0 }];
    tiles.push({
        poly: domain.map(p => ({ ...p })),
        coset: 0,
        mat: id
    });

    while (queue.length && tiles.length < limit) {
        const nextQueue = [];
        for (const { mat, coset } of queue) {
            for (let gi = 0; gi < gens.length; gi++) {
                const ng = mulMat(gens[gi], mat);
                const key = matKey(ng);
                if (seen.has(key)) continue;
                seen.add(key);

                // Map basepoint to check if tile is in view
                const img = mobiusAction(ng, basepoint);
                if (img.y <= 0 || !isFinite(img.x) || !isFinite(img.y)) continue;
                if (Math.abs(img.x) > 40 || img.y > 80 || img.y < 0.0002) continue;

                // Map the domain polygon
                const poly = domain.map(p => mobiusAction(ng, p));

                // Check polygon is valid
                const valid = poly.every(pt => isFinite(pt.x) && isFinite(pt.y) && pt.y > -0.5);
                if (!valid) continue;

                // Compute coset
                let newCoset = 0;
                if (genCosetIdx) {
                    if (genCosetIdx[gi]) {
                        newCoset = genCosetIdx[gi][coset];
                    } else {
                        // Offset color for tau gluing since it leaves H domain
                        newCoset = (coset + numCosets) % COSET_COLORS.length;
                    }
                }

                tiles.push({ poly, coset: newCoset, mat: ng });
                nextQueue.push({ mat: ng, coset: newCoset });

                if (tiles.length >= limit) break;
            }
            if (tiles.length >= limit) break;
        }
        queue = nextQueue;
    }

    return tiles;
}

// ---------- Canvas renderer ----------

const COSET_COLORS = [
    'hsla(215, 70%, 55%, 0.45)',
    'hsla(340, 65%, 55%, 0.40)',
    'hsla(160, 60%, 45%, 0.40)',
    'hsla(45,  70%, 55%, 0.40)',
    'hsla(270, 55%, 55%, 0.40)',
    'hsla(30,  65%, 50%, 0.40)',
    'hsla(190, 60%, 50%, 0.40)',
    'hsla(120, 50%, 45%, 0.40)',
    'hsla(0,   55%, 50%, 0.40)',
    'hsla(90,  55%, 45%, 0.40)',
    'hsla(240, 50%, 55%, 0.40)',
    'hsla(60,  60%, 50%, 0.40)',
];

const COSET_STROKES = [
    'hsla(215, 80%, 70%, 0.65)',
    'hsla(340, 75%, 70%, 0.55)',
    'hsla(160, 70%, 60%, 0.55)',
    'hsla(45,  80%, 70%, 0.55)',
    'hsla(270, 65%, 70%, 0.55)',
    'hsla(30,  75%, 65%, 0.55)',
    'hsla(190, 70%, 65%, 0.55)',
    'hsla(120, 60%, 60%, 0.55)',
    'hsla(0,   65%, 65%, 0.55)',
    'hsla(90,  65%, 60%, 0.55)',
    'hsla(240, 60%, 70%, 0.55)',
    'hsla(60,  70%, 65%, 0.55)',
];

export class DirichletRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');
        this.basepoint = { x: 0, y: 2.5 };

        // View transform (UHP coords -> screen)
        this.viewCenterX = 0;
        this.viewCenterY = 2;
        this.viewScale = 60;  // pixels per UHP unit

        // Interaction state
        this._dragging = false;
        this._lastMouse = null;

        this.domain = null;
        this.tiles = [];
        this.cosetPerms = null;
        this.numCosets = 1;

        this.showTiling = true;
        this.showOrbit = false;

        this._initInteraction();
        this._resize();

        window.addEventListener('resize', () => this._resize());
    }

    _resize() {
        const rect = this.canvas.getBoundingClientRect();
        const dpr = window.devicePixelRatio || 1;
        this.canvas.width = rect.width * dpr;
        this.canvas.height = rect.height * dpr;
        this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.W = rect.width;
        this.H = rect.height;
        this.draw();
    }

    _initInteraction() {
        const c = this.canvas;

        c.addEventListener('mousedown', (e) => {
            this._dragging = true;
            this._lastMouse = { x: e.clientX, y: e.clientY };
            c.style.cursor = 'grabbing';
        });

        window.addEventListener('mousemove', (e) => {
            if (!this._dragging) return;
            const dx = e.clientX - this._lastMouse.x;
            const dy = e.clientY - this._lastMouse.y;
            this.viewCenterX -= dx / this.viewScale;
            this.viewCenterY += dy / this.viewScale;
            this._lastMouse = { x: e.clientX, y: e.clientY };
            this.draw();
        });

        window.addEventListener('mouseup', () => {
            this._dragging = false;
            c.style.cursor = 'grab';
        });

        c.addEventListener('wheel', (e) => {
            e.preventDefault();
            const factor = e.deltaY > 0 ? 0.9 : 1.1;
            this.viewScale *= factor;
            this.viewScale = Math.max(10, Math.min(400, this.viewScale));
            this.draw();
        }, { passive: false });

        // Touch support
        let lastTouchDist = null;
        c.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                this._dragging = true;
                this._lastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
            } else if (e.touches.length === 2) {
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                lastTouchDist = Math.hypot(dx, dy);
            }
            e.preventDefault();
        }, { passive: false });

        c.addEventListener('touchmove', (e) => {
            if (e.touches.length === 1 && this._dragging) {
                const dx = e.touches[0].clientX - this._lastMouse.x;
                const dy = e.touches[0].clientY - this._lastMouse.y;
                this.viewCenterX -= dx / this.viewScale;
                this.viewCenterY += dy / this.viewScale;
                this._lastMouse = { x: e.touches[0].clientX, y: e.touches[0].clientY };
                this.draw();
            } else if (e.touches.length === 2 && lastTouchDist !== null) {
                const dx = e.touches[0].clientX - e.touches[1].clientX;
                const dy = e.touches[0].clientY - e.touches[1].clientY;
                const dist = Math.hypot(dx, dy);
                const factor = dist / lastTouchDist;
                this.viewScale *= factor;
                this.viewScale = Math.max(10, Math.min(400, this.viewScale));
                lastTouchDist = dist;
                this.draw();
            }
            e.preventDefault();
        }, { passive: false });

        c.addEventListener('touchend', () => {
            this._dragging = false;
            lastTouchDist = null;
        });
    }

    /** Convert UHP coordinate to screen pixel.
     *  viewCenter maps to screen center; y axis is flipped. */
    _toScreen(x, y) {
        const sx = this.W / 2 + (x - this.viewCenterX) * this.viewScale;
        const sy = this.H / 2 - (y - this.viewCenterY) * this.viewScale;
        return [sx, sy];
    }

    /**
     * Build the Dirichlet domain and tiling.
     * @param {Object|null} cosetPerms  – permutation data for colouring by H-coset
     * @param {number} numCosets – number of cosets (= 2p+2)
     */
    build(cosetPerms, numCosets, p) {
        this.cosetPerms = cosetPerms;
        this.numCosets = numCosets || 1;

        // Compute fundamental domain using full group generators
        this.domain = computeDirichletDomain(this.basepoint, 7, p);

        // Generate tiles
        const maxTiles = Math.min(1200, 80 * this.numCosets);
        this.tiles = generateTiles(this.domain, this.basepoint, cosetPerms, maxTiles, p, this.numCosets);

        this.draw();
    }

    resetView() {
        this.viewCenterX = 0;
        this.viewCenterY = 2;
        this.viewScale = 60;
        this.draw();
    }

    draw() {
        const ctx = this.ctx;
        const W = this.W, H = this.H;
        if (!W || !H) return;

        // Background
        const bgGrad = ctx.createLinearGradient(0, 0, 0, H);
        bgGrad.addColorStop(0, '#0a0f1e');
        bgGrad.addColorStop(1, '#050810');
        ctx.fillStyle = bgGrad;
        ctx.fillRect(0, 0, W, H);

        // Draw x-axis (boundary of UHP)
        const [axL, axY] = this._toScreen(-50, 0);
        const [axR] = this._toScreen(50, 0);
        ctx.strokeStyle = 'rgba(96,165,250,0.15)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(axL, axY);
        ctx.lineTo(axR, axY);
        ctx.stroke();

        // Label
        ctx.fillStyle = 'rgba(96,165,250,0.3)';
        ctx.font = '11px Inter, sans-serif';
        ctx.fillText('ℝ', 10, axY - 6);

        // Grid lines
        ctx.strokeStyle = 'rgba(255,255,255,0.03)';
        ctx.lineWidth = 0.5;
        for (let gx = -20; gx <= 20; gx++) {
            const [sx] = this._toScreen(gx, 0);
            ctx.beginPath();
            ctx.moveTo(sx, 0);
            ctx.lineTo(sx, H);
            ctx.stroke();
        }
        for (let gy = 1; gy <= 30; gy++) {
            const [, sy] = this._toScreen(0, gy);
            ctx.beginPath();
            ctx.moveTo(0, sy);
            ctx.lineTo(W, sy);
            ctx.stroke();
        }

        if (!this.domain || this.tiles.length === 0) {
            // Placeholder text
            ctx.fillStyle = 'rgba(255,255,255,0.2)';
            ctx.font = '14px Inter, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Run a construction to see the Dirichlet domain tiling', W / 2, H / 2);
            ctx.textAlign = 'start';
            return;
        }

        // Draw tiles
        for (const tile of this.tiles) {
            if (this.showTiling) {
                this._drawPoly(tile.poly, tile.coset);
            }
            if (this.showOrbit) {
                this._drawOrbitPoint(tile.mat, tile.coset);
            }
        }

        // Draw basepoint
        const [bpx, bpy] = this._toScreen(this.basepoint.x, this.basepoint.y);
        ctx.beginPath();
        ctx.arc(bpx, bpy, 4, 0, Math.PI * 2);
        ctx.fillStyle = '#fff';
        ctx.fill();
        ctx.strokeStyle = 'rgba(96,165,250,0.8)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
    }

    _drawPoly(poly, cosetIdx) {
        const ctx = this.ctx;
        if (poly.length < 3) return;

        ctx.beginPath();
        for (let i = 0; i < poly.length; i++) {
            const p1 = poly[i];
            const p2 = poly[(i + 1) % poly.length];

            const [sx1, sy1] = this._toScreen(p1.x, p1.y);

            if (i === 0) ctx.moveTo(sx1, sy1);

            // Compute Euclidean center for the hyperbolic geodesic (circle orthogonal to x-axis)
            if (Math.abs(p1.x - p2.x) < 1e-4) {
                // Vertical straight line
                const [sx2, sy2] = this._toScreen(p2.x, p2.y);
                ctx.lineTo(sx2, sy2);
            } else {
                const cx = (p1.x * p1.x + p1.y * p1.y - (p2.x * p2.x + p2.y * p2.y)) / (2 * (p1.x - p2.x));
                const r = Math.sqrt((p1.x - cx) * (p1.x - cx) + p1.y * p1.y);

                const [scx, scy] = this._toScreen(cx, 0);
                const sr = r * this.viewScale;

                // Canvas y-axis is inverted
                const ang1 = Math.atan2(-(p1.y), p1.x - cx);
                const ang2 = Math.atan2(-(p2.y), p2.x - cx);

                // Determine shortest path around the circle
                let diff = ang2 - ang1;
                while (diff > Math.PI) diff -= 2 * Math.PI;
                while (diff < -Math.PI) diff += 2 * Math.PI;
                const ccw = diff < 0; // True if counterclockwise on canvas

                if (Math.abs(sx1 - scx) < 20000 && sr < 20000) {
                    ctx.arc(scx, scy, sr, ang1, ang2, ccw);
                } else {
                    const [sx2, sy2] = this._toScreen(p2.x, p2.y);
                    ctx.lineTo(sx2, sy2);
                }
            }
        }
        ctx.closePath();

        const colorIdx = cosetIdx % COSET_COLORS.length;
        ctx.fillStyle = COSET_COLORS[colorIdx];
        ctx.fill();

        ctx.strokeStyle = COSET_STROKES[colorIdx];
        ctx.lineWidth = 1.0;
        ctx.stroke();
    }

    _drawOrbitPoint(mat, cosetIdx) {
        const ctx = this.ctx;
        const pt = mobiusAction(mat, this.basepoint);
        const [sx, sy] = this._toScreen(pt.x, pt.y);

        const colorIdx = cosetIdx % COSET_COLORS.length;
        ctx.beginPath();
        ctx.arc(sx, sy, 3, 0, Math.PI * 2);
        ctx.fillStyle = COSET_STROKES[colorIdx];
        ctx.fill();
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 0.5;
        ctx.stroke();
    }
}
