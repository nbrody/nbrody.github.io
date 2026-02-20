/**
 * Braid Animation Engine
 * 
 * Provides smooth transitions for the n-strand braid visualizer.
 * Handles path computation, resampling, and lerp-based animation
 * for adding generators, applying relations, and clearing.
 */

import * as THREE from 'three';
import { getStrandCount } from './burau.js';

// ============================================================
//  Constants
// ============================================================

const STRAND_SPACING = 0.5;
const CROSSING_LENGTH = 0.8;
const STRAIGHT_LENGTH = 0.15;
const ARC_HEIGHT = 0.22;

const SAMPLES_PER_STRAND = 80;

const DURATION_ADD = 320;       // ms — adding/removing a generator
const DURATION_RELATION = 500;  // ms — applying a braid relation

// ============================================================
//  Pure Path Computation
// ============================================================

/** Total braid height from the number of crossings */
export function computeBraidLength(numCrossings) {
    if (numCrossings === 0) return 1.0;
    return STRAIGHT_LENGTH + numCrossings * (CROSSING_LENGTH + STRAIGHT_LENGTH);
}

/**
 * Compute raw strand waypoint paths.  Builds bottom → top.
 * @param {Array<{gen:number, inverse:boolean}>} crossings
 * @param {number} [numStrands] — defaults to getStrandCount()
 * @returns {{paths: Array<Array<{x,y,z}>>, perm: number[]}}
 */
export function computeStrandPaths(crossings, numStrands) {
    numStrands = numStrands || getStrandCount();
    const totalWidth = (numStrands - 1) * STRAND_SPACING;
    const startX = -totalWidth / 2;
    const totalLen = computeBraidLength(crossings.length);
    const botY = -totalLen / 2;

    const perm = Array.from({ length: numStrands }, (_, i) => i);
    const paths = Array.from({ length: numStrands }, () => []);
    const xPos = Array.from({ length: numStrands }, (_, i) => startX + i * STRAND_SPACING);

    let y = botY;

    // Bottom anchors
    for (let p = 0; p < numStrands; p++) paths[perm[p]].push({ x: xPos[p], y, z: 0 });

    if (crossings.length === 0) {
        // Straight strands
        for (let p = 0; p < numStrands; p++) paths[perm[p]].push({ x: xPos[p], y: -botY, z: 0 });
        return { paths, perm: [...perm] };
    }

    for (const { gen, inverse } of crossings) {
        const p1 = gen - 1, p2 = gen;

        y += STRAIGHT_LENGTH;
        for (let p = 0; p < numStrands; p++) paths[perm[p]].push({ x: xPos[p], y, z: 0 });

        const s1 = perm[p1], s2 = perm[p2];
        const x1 = xPos[p1], x2 = xPos[p2];
        const over = inverse ? s2 : s1;
        const under = inverse ? s1 : s2;
        const midY = y + CROSSING_LENGTH / 2;
        const topY = y + CROSSING_LENGTH;

        // Uninvolved strands
        for (let p = 0; p < numStrands; p++) {
            if (p === p1 || p === p2) continue;
            paths[perm[p]].push({ x: xPos[p], y: midY, z: 0 });
            paths[perm[p]].push({ x: xPos[p], y: topY, z: 0 });
        }

        // Over (arcs +z)
        paths[over].push({ x: (x1 + x2) / 2, y: midY, z: ARC_HEIGHT });
        paths[over].push({ x: over === s1 ? x2 : x1, y: topY, z: 0 });

        // Under (arcs -z)
        paths[under].push({ x: (x1 + x2) / 2, y: midY, z: -ARC_HEIGHT });
        paths[under].push({ x: under === s1 ? x2 : x1, y: topY, z: 0 });

        y = topY;
        perm[p1] = s2;
        perm[p2] = s1;
    }

    y += STRAIGHT_LENGTH;
    for (let p = 0; p < numStrands; p++) paths[perm[p]].push({ x: xPos[p], y, z: 0 });

    return { paths, perm: [...perm] };
}

/**
 * Resample raw waypoint paths to fixed-size Vector3 arrays.
 * This normalises point count so we can lerp between any two states.
 */
export function resamplePaths(rawPaths, n = SAMPLES_PER_STRAND) {
    return rawPaths.map(path => {
        const pts = path.map(p => new THREE.Vector3(p.x, p.y, p.z));
        if (pts.length < 2) {
            const v = pts.length ? pts[0].clone() : new THREE.Vector3();
            return Array.from({ length: n }, () => v.clone());
        }
        const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.3);
        return Array.from({ length: n }, (_, i) => curve.getPoint(i / (n - 1)));
    });
}

// ============================================================
//  Easing
// ============================================================

function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// ============================================================
//  BraidAnimator
// ============================================================

export class BraidAnimator {
    constructor(visualizer) {
        this.viz = visualizer;
        this.numStrands = getStrandCount();

        this.currentSamples = null;   // [numStrands][SAMPLES] of Vector3
        this.sourceSamples = null;
        this.targetSamples = null;

        this.currentLength = 1.0;
        this.sourceLength = 1.0;
        this.targetLength = 1.0;

        this.animating = false;
        this.animStart = 0;
        this.animDuration = DURATION_ADD;

        // Draw straight lines for the empty (identity) braid on init
        this._renderIdentity();
    }

    /** Compute and display straight lines (identity braid). */
    _renderIdentity() {
        const len = computeBraidLength(0);
        const { paths: raw, perm } = computeStrandPaths([], this.numStrands);
        const samples = resamplePaths(raw);
        this.currentSamples = samples;
        this.currentLength = len;
        this.viz.updateStrands(samples);
        this.viz.updateEndpoints(len, perm);
        this.viz.smoothZoom(len);
    }

    /** Update the strand count (called when n changes). */
    setStrandCount(n) {
        this.numStrands = n;
        this.animating = false;
        this._renderIdentity();
    }

    /**
     * Begin a smooth transition to the given crossings.
     * @param {Array} crossings  — parsed crossing objects
     * @param {'add'|'relation'|'snap'} type
     */
    transitionTo(crossings, type = 'add') {
        const len = computeBraidLength(crossings.length);
        const { paths: raw, perm } = computeStrandPaths(crossings, this.numStrands);
        const samples = resamplePaths(raw);

        // If animating, snap current state to wherever we are now
        if (this.animating) {
            this.currentSamples = this._interpolatedSamples(this._progress());
            this.currentLength = this._interpolatedLength(this._progress());
            this.animating = false;
        }

        if (!this.currentSamples || type === 'snap') {
            // First render or explicit snap — no animation
            this.currentSamples = samples;
            this.currentLength = len;
            this.viz.updateStrands(samples);
            this.viz.updateEndpoints(len, perm);
            this.viz.smoothZoom(len);
            return;
        }

        // Start animated transition
        this.sourceSamples = this.currentSamples.map(a => a.map(v => v.clone()));
        this.targetSamples = samples;
        this.sourceLength = this.currentLength;
        this.targetLength = len;
        this.targetPerm = perm;
        this.animDuration = type === 'relation' ? DURATION_RELATION : DURATION_ADD;
        this.animating = true;
        this.animStart = performance.now();

        // Pre-zoom camera to fit the target size
        this.viz.smoothZoom(len);
    }

    /** Called every frame from the render loop. */
    update() {
        if (!this.animating) return;

        const t = this._progress();
        const eased = easeInOutCubic(t);

        const interp = this._interpolatedSamples(eased);
        const len = this._interpolatedLength(eased);

        this.viz.updateStrands(interp);
        this.viz.updateEndpoints(len, this.targetPerm);

        if (t >= 1) {
            this.animating = false;
            this.currentSamples = this.targetSamples;
            this.currentLength = this.targetLength;
        }
    }

    /** Reset all animation state (used on dispose). */
    reset() {
        this.currentSamples = null;
        this.animating = false;
    }

    // --- internal helpers ---

    _progress() {
        return Math.min((performance.now() - this.animStart) / this.animDuration, 1);
    }

    _interpolatedLength(t) {
        return this.sourceLength + (this.targetLength - this.sourceLength) * t;
    }

    _interpolatedSamples(t) {
        const out = [];
        for (let s = 0; s < this.numStrands; s++) {
            const arr = [];
            for (let i = 0; i < SAMPLES_PER_STRAND; i++) {
                arr.push(new THREE.Vector3().lerpVectors(
                    this.sourceSamples[s][i],
                    this.targetSamples[s][i],
                    t
                ));
            }
            out.push(arr);
        }
        return out;
    }
}
