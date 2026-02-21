/**
 * Disk Animation Engine
 *
 * Pure math for the mapping class group of the n-punctured disk.
 * A braid generator σᵢ acts as a half-twist enclosing punctures i, i+1.
 * We track arcs between adjacent punctures as polylines and deform
 * them through each twist, building up the mapping class.
 */

import { getStrandCount } from './burau.js';

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
const POINTS_PER_ARC = 1600;

// Twist support radii
const TWIST_R_INNER = 0.5;   // full-twist region
export const TWIST_R_OUTER = 1.5;  // fade-out boundary

const ANIM_DURATION_TWIST = 600;  // ms per half-twist
const ANIM_DURATION_FADE = 350;   // ms for cross-fade

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

/** Straight-line arcs between adjacent punctures. */
export function initialArcs(punctures) {
    const arcs = [];
    for (let a = 0; a < punctures.length - 1; a++) {
        const p1 = punctures[a], p2 = punctures[a + 1];
        const arc = [];
        for (let i = 0; i < POINTS_PER_ARC; i++) {
            const t = i / (POINTS_PER_ARC - 1);
            arc.push({ x: p1.x + (p2.x - p1.x) * t, y: p1.y + (p2.y - p1.y) * t });
        }
        arcs.push(arc);
    }
    return arcs;
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

/** Apply a smooth half-twist to arc polylines. */
export function applyTwist(arcs, center, angle) {
    return arcs.map(arc => arc.map(pt => twistPoint(pt, center, angle)));
}

/** Apply a smooth half-twist to an array of puncture positions. */
export function twistPunctures(punctures, center, angle) {
    return punctures.map(pt => twistPoint(pt, center, angle));
}

/** Parse a generator symbol to twist parameters. */
function parseTwist(symbol, punctures) {
    const inv = symbol[0] === 'S';
    const idx = parseInt(symbol.replace(/[sS]/, '')) - 1;
    const p1 = punctures[idx], p2 = punctures[idx + 1];
    return {
        center: { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 },
        angle: inv ? -Math.PI : Math.PI
    };
}

function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function lerpArcs(a, b, t) {
    return a.map((arc, i) => arc.map((pt, j) => ({
        x: pt.x + (b[i][j].x - pt.x) * t,
        y: pt.y + (b[i][j].y - pt.y) * t
    })));
}

function lerpPunctures(a, b, t) {
    return a.map((pt, i) => ({
        x: pt.x + (b[i].x - pt.x) * t,
        y: pt.y + (b[i].y - pt.y) * t
    }));
}

// ============================================================
//  DiskAnimator
// ============================================================

export class DiskAnimator {
    constructor(visualizer) {
        this.viz = visualizer;
        this.initPunctures = getPuncturePositions();

        // Parallel stacks: arcStack[i] and punctureStack[i] after i generators
        this.arcStack = [initialArcs(this.initPunctures)];
        this.punctureStack = [this.initPunctures.map(p => ({ ...p }))];
        this.prevSymbols = [];

        // Animation
        this.animating = false;
        this.animStart = 0;
        this.animDuration = ANIM_DURATION_TWIST;
        this.animSourceArcs = null;
        this.animSourcePunctures = null;
        this.animTwistCenter = null;
        this.animTwistAngle = 0;
        this.animType = 'twist';
        this.animTargetArcs = null;
        this.animTargetPunctures = null;

        // Render initial state
        this.viz.setArcs(this.arcStack[0], this.punctureStack[0], null);
    }

    /** Rebuild state when puncture count changes. */
    setStrandCount(n) {
        this.initPunctures = getPuncturePositions(n);
        this.arcStack = [initialArcs(this.initPunctures)];
        this.punctureStack = [this.initPunctures.map(p => ({ ...p }))];
        this.prevSymbols = [];
        this.animating = false;
        this.viz.setArcs(this.arcStack[0], this.punctureStack[0], null);
    }

    transitionTo(symbols, type = 'add') {
        if (this.animating) this._snap();

        const prev = this.prevSymbols;
        const pLen = prev.length, nLen = symbols.length;
        const curPunctures = this.punctureStack[this.punctureStack.length - 1];

        // Case 1: appended one generator
        if (nLen === pLen + 1 && symbols.slice(0, pLen).join() === prev.join()) {
            const tw = parseTwist(symbols[nLen - 1], this.initPunctures);
            const srcArcs = this.arcStack[this.arcStack.length - 1];
            this.arcStack.push(applyTwist(srcArcs, tw.center, tw.angle));
            this.punctureStack.push(twistPunctures(curPunctures, tw.center, tw.angle));
            this._startTwist(srcArcs, curPunctures, tw.center, tw.angle);
            this.prevSymbols = [...symbols];
            return;
        }

        // Case 2: undo
        if (nLen === pLen - 1 && symbols.join() === prev.slice(0, nLen).join()) {
            const tw = parseTwist(prev[pLen - 1], this.initPunctures);
            const srcArcs = this.arcStack[this.arcStack.length - 1];
            this.arcStack.pop();
            this.punctureStack.pop();
            this._startTwist(srcArcs, curPunctures, tw.center, -tw.angle);
            this.prevSymbols = [...symbols];
            return;
        }

        // Case 3: relation / clear / bulk
        const oldArcs = this.arcStack[this.arcStack.length - 1];
        const oldPunctures = curPunctures;
        this._recomputeStack(symbols);
        const newArcs = this.arcStack[this.arcStack.length - 1];
        const newPunctures = this.punctureStack[this.punctureStack.length - 1];

        if (type === 'relation') {
            this._startFade(oldArcs, oldPunctures, newArcs, newPunctures);
        } else {
            this.viz.setArcs(newArcs, newPunctures, null);
        }
        this.prevSymbols = [...symbols];
    }

    update() {
        if (!this.animating) return;
        const elapsed = performance.now() - this.animStart;
        let t = Math.min(elapsed / this.animDuration, 1);
        t = easeInOutCubic(t);

        if (this.animType === 'twist') {
            const partial = this.animTwistAngle * t;
            const arcs = applyTwist(this.animSourceArcs, this.animTwistCenter, partial);
            const puncts = twistPunctures(this.animSourcePunctures, this.animTwistCenter, partial);
            const info = t < 1 ? { center: this.animTwistCenter, progress: t, angle: partial } : null;
            this.viz.setArcs(arcs, puncts, info);
        } else {
            const arcs = lerpArcs(this.animSourceArcs, this.animTargetArcs, t);
            const puncts = lerpPunctures(this.animSourcePunctures, this.animTargetPunctures, t);
            this.viz.setArcs(arcs, puncts, null);
        }

        if (t >= 1) this.animating = false;
    }

    reset() {
        this.initPunctures = getPuncturePositions();
        this.arcStack = [initialArcs(this.initPunctures)];
        this.punctureStack = [this.initPunctures.map(p => ({ ...p }))];
        this.prevSymbols = [];
        this.animating = false;
        this.viz.setArcs(this.arcStack[0], this.punctureStack[0], null);
    }

    // --- internals ---

    _recomputeStack(symbols) {
        this.arcStack = [initialArcs(this.initPunctures)];
        this.punctureStack = [this.initPunctures.map(p => ({ ...p }))];
        for (const sym of symbols) {
            const tw = parseTwist(sym, this.initPunctures);
            const cur = this.arcStack[this.arcStack.length - 1];
            const curP = this.punctureStack[this.punctureStack.length - 1];
            this.arcStack.push(applyTwist(cur, tw.center, tw.angle));
            this.punctureStack.push(twistPunctures(curP, tw.center, tw.angle));
        }
    }

    _startTwist(srcArcs, srcPunctures, center, angle) {
        this.animSourceArcs = srcArcs.map(a => a.map(p => ({ ...p })));
        this.animSourcePunctures = srcPunctures.map(p => ({ ...p }));
        this.animTwistCenter = center;
        this.animTwistAngle = angle;
        this.animType = 'twist';
        this.animDuration = ANIM_DURATION_TWIST;
        this.animating = true;
        this.animStart = performance.now();
    }

    _startFade(srcArcs, srcPunctures, tgtArcs, tgtPunctures) {
        this.animSourceArcs = srcArcs;
        this.animSourcePunctures = srcPunctures;
        this.animTargetArcs = tgtArcs;
        this.animTargetPunctures = tgtPunctures;
        this.animType = 'fade';
        this.animDuration = ANIM_DURATION_FADE;
        this.animating = true;
        this.animStart = performance.now();
    }

    _snap() {
        this.animating = false;
        const arcs = this.arcStack[this.arcStack.length - 1];
        const puncts = this.punctureStack[this.punctureStack.length - 1];
        this.viz.setArcs(arcs, puncts, null);
    }
}
