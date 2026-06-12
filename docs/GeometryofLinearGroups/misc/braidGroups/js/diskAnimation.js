/**
 * Disk Animation Engine — Dynnikov coordinate edition
 *
 * The mapping class of the n-punctured disk is tracked COMBINATORIALLY:
 * the images of the n-1 standard loops (each encircling two adjacent
 * punctures) are stored as exact BigInt Dynnikov coordinates (dynnikov.js)
 * and updated per braid generator by Dynnikov's piecewise-linear rules.
 * After every move a canonical embedded drawing is reconstructed from the
 * coordinates — so the picture is always in "taut" normal form, with
 * parallel strands evenly spaced, and stays CORRECT for arbitrarily long
 * braid words (the old approach of deforming polylines through each
 * half-twist degraded after ~6 moves: strand separations shrink
 * exponentially, below any fixed sampling resolution).
 *
 * Transitions: the previous canonical drawing is warped through the
 * half-twist (pointwise, with adaptive refinement), then cross-faded into
 * the new canonical drawing.
 */

import { getStrandCount } from './burau.js';
import { LoopCoords, loopPrimitives, maxStrandCount } from './dynnikov.js';

// ============================================================
//  Constants
// ============================================================

export function getDiskRadius(n) {
    n = n || getStrandCount();
    const totalWidth = (n - 1) * PUNCTURE_SPACING;
    return Math.max(2.2, totalWidth / 2 + 0.7);
}

// Legacy alias for consumers that import a constant
export const DISK_RADIUS = 2.2; // Base value; use getDiskRadius() for dynamic

const PUNCTURE_SPACING = 1.0;

// Twist support radii
const TWIST_R_INNER = 0.5;   // full-twist region
export const TWIST_R_OUTER = 1.5;  // fade-out boundary

const ANIM_DURATION_TWIST = 600;  // ms per half-twist
const ANIM_DURATION_FADE = 380;   // ms for cross-fade

const MAX_SEG = 0.02;             // refinement scale inside a twist support
const MAX_TWIST_ANIM_POINTS = 40000;  // skip the warp phase above this
const MAX_DRAW_PRIMITIVES = 60000;    // beyond this, show a complexity notice

// ============================================================
//  Geometry helpers
// ============================================================

/**
 * Get puncture positions for n punctures, evenly spaced along y=0.
 * @param {number} [n] — defaults to getStrandCount()
 */
export function getPuncturePositions(n) {
    n = n || getStrandCount();
    return Array.from({ length: n }, (_, i) => ({
        x: (i - (n - 1) / 2) * PUNCTURE_SPACING,
        y: 0
    }));
}

function smoothstep(t) {
    t = Math.max(0, Math.min(1, t));
    return t * t * (3 - 2 * t);
}

/** Twist a single point about `center` by `angle`. */
function twistPoint(pt, center, angle) {
    const dx = pt.x - center.x;
    const dy = pt.y - center.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    if (dist >= TWIST_R_OUTER) return { x: pt.x, y: pt.y };

    const factor = dist <= TWIST_R_INNER
        ? 1
        : smoothstep((TWIST_R_OUTER - dist) / (TWIST_R_OUTER - TWIST_R_INNER));

    const theta = angle * factor;
    const c = Math.cos(theta), s = Math.sin(theta);
    return {
        x: center.x + dx * c - dy * s,
        y: center.y + dx * s + dy * c
    };
}

/** Apply a smooth half-twist to an array of puncture positions. */
export function twistPunctures(punctures, center, angle) {
    return punctures.map(pt => ({ ...twistPoint(pt, center, angle), label: pt.label }));
}

function segPointDist(a, b, c) {
    const ux = b.x - a.x, uy = b.y - a.y;
    const len2 = ux * ux + uy * uy;
    let t = len2 < 1e-18 ? 0 : ((c.x - a.x) * ux + (c.y - a.y) * uy) / len2;
    t = Math.max(0, Math.min(1, t));
    return Math.hypot(a.x + ux * t - c.x, a.y + uy * t - c.y);
}

/** Subdivide segments near the twist support (measured from the segment). */
export function refineForTwist(pts, center) {
    const out = [pts[0]];
    for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i];
        const dx = b.x - a.x, dy = b.y - a.y;
        const len = Math.hypot(dx, dy);
        if (len > MAX_SEG && segPointDist(a, b, center) < TWIST_R_OUTER + MAX_SEG) {
            const k = Math.ceil(len / MAX_SEG);
            for (let j = 1; j < k; j++) {
                out.push({ x: a.x + dx * j / k, y: a.y + dy * j / k });
            }
        }
        out.push(b);
    }
    return out;
}

/** Apply a pointwise twist to a list of tagged polylines. */
export function applyTwistAdaptive(prims, center, angle) {
    return prims.map(pl => pl.map(pt => twistPoint(pt, center, angle)));
}

function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ============================================================
//  DiskAnimator
// ============================================================

export class DiskAnimator {
    constructor(visualizer) {
        this.viz = visualizer;
        this.n = getStrandCount();
        this._resetState();
        this._pushScene();
    }

    _resetState() {
        const n = this.n;
        this.initPunctures = getPuncturePositions(n).map((p, i) => ({ ...p, label: i }));
        // stack of steps: { loops: LoopCoords[], perm: number[] }
        this.stack = [{
            loops: Array.from({ length: n - 1 }, (_, g) => LoopCoords.pairLoop(n, g)),
            perm: Array.from({ length: n }, (_, i) => i),
        }];
        this.prevSymbols = [];
        this.drawing = this._buildDrawing(this.stack[0].loops);
        this.animating = false;
        this.animPhase = null;     // 'twist' | 'fade'
    }

    /** Rebuild state when puncture count changes. */
    setStrandCount(n) {
        this.n = n;
        this._resetState();
        this._pushScene();
    }

    reset() {
        this.n = getStrandCount();
        this._resetState();
        this._pushScene();
    }

    // --- canonical drawing from coordinates ---

    _buildDrawing(loops) {
        // estimate the drawing size from intersection numbers BEFORE
        // constructing any geometry — complexity grows exponentially for
        // pseudo-Anosov words, and we must bail out cheaply
        let maxCount, est = 0;
        try {
            maxCount = maxStrandCount(loops);
            for (const L of loops) {
                const c = L.complexity();          // BigInt total intersections
                if (c > 10000000n) { est = Infinity; break; }
                est += Number(c) * 14;             // ~points per strand drawn
            }
        } catch (e) {
            return { loops: [], pgap: 0.1, notice: 'coordinates exceed drawable size' };
        }
        const pgap = Math.min(0.16, 0.42 / (maxCount + 0.5));
        if (est > MAX_DRAW_PRIMITIVES * 5) {
            return {
                loops: [], pgap,
                notice: 'diagram too complex to draw — coordinates stay exact'
            };
        }
        const nLoops = loops.length;
        const prims = [];
        let total = 0;
        try {
            for (let l = 0; l < nLoops; l++) {
                const offset = ((l + 1) / (nLoops + 1) - 0.5) * 0.8;
                const P = loopPrimitives(loops[l], this.initPunctures, pgap, offset);
                total += P.reduce((s, pl) => s + pl.length, 0);
                prims.push(P);
            }
        } catch (e) {
            return { loops: [], pgap, notice: 'coordinates exceed drawable size' };
        }
        return { loops: prims, pgap, total };
    }

    // --- transitions ---

    /** Map an app symbol ('s3' / 'S3') to a Dynnikov update.
     *  The app's σ_i twists counterclockwise (+π), which corresponds to
     *  the INVERSE generator in the braidlab/Dynnikov convention
     *  (calibrated by intersection counts). */
    _applySymbol(loops, symbol) {
        const inv = symbol[0] !== 'S';
        const i = parseInt(symbol.replace(/[sS]/, ''));
        for (const L of loops) L.applySigma(i, inv);
    }

    _twistParams(symbol) {
        const inv = symbol[0] === 'S';
        const idx = parseInt(symbol.replace(/[sS]/, '')) - 1;
        const p1 = this.initPunctures[idx], p2 = this.initPunctures[idx + 1];
        return {
            center: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
            angle: inv ? -Math.PI : Math.PI,
            idx
        };
    }

    _stepFrom(step, symbol) {
        const loops = step.loops.map(L => L.clone());
        this._applySymbol(loops, symbol);
        const { idx } = this._twistParams(symbol);
        const perm = step.perm.slice();
        [perm[idx], perm[idx + 1]] = [perm[idx + 1], perm[idx]];
        return { loops, perm };
    }

    transitionTo(symbols, type = 'add') {
        if (this.animating) this._finishAnimation();

        const prev = this.prevSymbols;
        const pLen = prev.length, nLen = symbols.length;

        // Case 1: appended one generator — twist then fade
        if (nLen === pLen + 1 && symbols.slice(0, pLen).join() === prev.join()) {
            const sym = symbols[nLen - 1];
            const sourcePerm = this.stack[this.stack.length - 1].perm;
            this.stack.push(this._stepFrom(this.stack[this.stack.length - 1], sym));
            this._animateMove(sym, +1, sourcePerm);
            this.prevSymbols = [...symbols];
            return;
        }

        // Case 2: undo — inverse twist then fade
        if (nLen === pLen - 1 && symbols.join() === prev.slice(0, nLen).join()) {
            const sym = prev[pLen - 1];
            const sourcePerm = this.stack[this.stack.length - 1].perm;
            this.stack.pop();
            this._animateMove(sym, -1, sourcePerm);
            this.prevSymbols = [...symbols];
            return;
        }

        // Case 3: relation / clear / bulk — recompute exactly, cross-fade
        const n = this.n;
        let step = {
            loops: Array.from({ length: n - 1 }, (_, g) => LoopCoords.pairLoop(n, g)),
            perm: Array.from({ length: n }, (_, i) => i),
        };
        for (const sym of symbols) step = this._stepFrom(step, sym);
        this.stack = [step];
        const oldDrawing = this.drawing;
        this.drawing = this._buildDrawing(step.loops);
        this.prevSymbols = [...symbols];
        if (type === 'relation' && !oldDrawing.notice && !this.drawing.notice) {
            this._startFade(oldDrawing.loops, this.drawing.loops, this.drawing.pgap);
        } else {
            this._pushScene();
        }
    }

    /** Twist animation of the current drawing, then fade to the new one. */
    _animateMove(symbol, direction, sourcePerm) {
        const { center, angle } = this._twistParams(symbol);
        const newStep = this.stack[this.stack.length - 1];
        const oldDrawing = this.drawing;
        this.drawing = this._buildDrawing(newStep.loops);

        if (oldDrawing.notice || this.drawing.notice) {
            this._pushScene();
            return;
        }
        if ((oldDrawing.total || 0) > 15000) {
            // refining a dense diagram for the warp is too costly — fade only
            this._startFade(oldDrawing.loops, this.drawing.loops, this.drawing.pgap);
            return;
        }

        // refine the old drawing for a faithful warp
        let total = 0;
        const refined = oldDrawing.loops.map(loop =>
            loop.map(pl => {
                const r = refineForTwist(pl, center);
                total += r.length;
                return r;
            }));
        if (total > MAX_TWIST_ANIM_POINTS) {
            // too heavy to warp smoothly — just fade
            this._startFade(oldDrawing.loops, this.drawing.loops, this.drawing.pgap);
            return;
        }

        this.animating = true;
        this.animPhase = 'twist';
        this.animStart = performance.now();
        this.animSource = refined;
        this.animSourcePunctures = this.initPunctures.map((p, i) =>
            ({ ...p, label: sourcePerm[i] }));
        this.animCenter = center;
        this.animAngle = angle * direction;
        this.animPgap = oldDrawing.pgap;
    }

    _startFade(oldLoops, newLoops, pgap) {
        this.animating = true;
        this.animPhase = 'fade';
        this.animStart = performance.now();
        this.fadeOld = oldLoops;
        this.fadeNew = newLoops;
        this.animPgap = pgap;
    }

    _finishAnimation() {
        this.animating = false;
        this.animPhase = null;
        this._pushScene();
    }

    // --- per-frame update ---

    update() {
        if (!this.animating) return;
        const elapsed = performance.now() - this.animStart;

        if (this.animPhase === 'twist') {
            let t = Math.min(elapsed / ANIM_DURATION_TWIST, 1);
            t = easeInOutCubic(t);
            const partial = this.animAngle * t;
            const warped = this.animSource.map(loop =>
                applyTwistAdaptive(loop, this.animCenter, partial));
            const puncts = twistPunctures(this.animSourcePunctures, this.animCenter, partial);
            const info = t < 1
                ? { center: this.animCenter, progress: t, angle: partial } : null;
            this.viz.setScene({
                sets: [{ loops: warped, alpha: 1 }],
                punctures: puncts,
                twistInfo: info,
                pgap: this.animPgap,
            });
            if (elapsed >= ANIM_DURATION_TWIST) {
                // hand over to the cross-fade into the canonical drawing
                this._startFade(warped, this.drawing.loops, this.drawing.pgap);
            }
            return;
        }

        // fade phase
        let t = Math.min(elapsed / ANIM_DURATION_FADE, 1);
        t = easeInOutCubic(t);
        this.viz.setScene({
            sets: [
                { loops: this.fadeOld, alpha: 1 - t },
                { loops: this.fadeNew, alpha: t },
            ],
            punctures: this._currentPunctures(),
            twistInfo: null,
            pgap: this.animPgap,
        });
        if (t >= 1) {
            this.animating = false;
            this.animPhase = null;
            this._pushScene();
        }
    }

    _currentPunctures() {
        const perm = this.stack[this.stack.length - 1].perm;
        return this.initPunctures.map((p, i) => ({ ...p, label: perm[i] }));
    }

    _pushScene() {
        this.viz.setScene({
            sets: this.drawing.notice ? [] : [{ loops: this.drawing.loops, alpha: 1 }],
            punctures: this._currentPunctures(),
            twistInfo: null,
            pgap: this.drawing.pgap,
            notice: this.drawing.notice || null,
        });
    }
}
