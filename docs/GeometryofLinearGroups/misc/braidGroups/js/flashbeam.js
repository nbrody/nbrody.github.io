/**
 * FlashBeam Search Engine — Client-Side
 * 
 * Runs a FlashBeam search entirely in the browser using Web Workers pattern
 * (setTimeout chunking to keep the UI responsive).
 * 
 * Searches for non-trivial words in the Burau representation that evaluate
 * to the identity matrix (modulo a chosen quotient ring).
 */

import {
    LaurentPoly,
    QuotientRing,
    matMul,
    matIdentity,
    matEquals,
    matL1Norm,
    matDistFromIdentity,
    matToString,
    matToLatex,
    makeBurauGenerators,
    getQuotientRings,
    getStrandCount
} from './burau.js';


// ============================================================
//  Node: wraps a matrix + word
// ============================================================

class BurauNode {
    constructor(matrix, word, score) {
        this.matrix = matrix;
        this.word = word;       // string like "s1 s2 S3"
        this.score = score;
        this._hash = null;
    }

    get hash() {
        if (!this._hash) {
            this._hash = matToString(this.matrix);
        }
        return this._hash;
    }

    get wordLength() {
        return this.word === '' ? 0 : this.word.split(' ').length;
    }

    get lastSymbol() {
        if (this.word === '') return null;
        const parts = this.word.split(' ');
        return parts[parts.length - 1];
    }
}


// ============================================================
//  FlashBeam Solver
// ============================================================

class FlashBeamSolver {
    /**
     * @param {Object} config
     * @param {number} config.beamWidth - W: beam size
     * @param {number} config.flashSize - F: flash pool size
     * @param {number} config.maxIterations - max search iterations
     * @param {string} config.ringValue - quotient ring identifier
     * @param {string[]} config.activeGenerators - which symbols to use
     * @param {Function} config.onIteration - callback(iterationData)
     * @param {Function} config.onSolution - callback(solutionNode)
     * @param {Function} config.onComplete - callback(stats)
     */
    constructor(config) {
        this.beamWidth = config.beamWidth || 500;
        this.flashSize = config.flashSize || 30;
        this.maxIterations = config.maxIterations || 100;
        this.ringValue = config.ringValue || 'none';
        this.activeGeneratorSymbols = config.activeGenerators || ['s1', 's2', 's3', 'S1', 'S2', 'S3'];

        this.onIteration = config.onIteration || (() => { });
        this.onSolution = config.onSolution || (() => { });
        this.onComplete = config.onComplete || (() => { });

        this.running = false;
        this.stopRequested = false;

        // Setup ring — accept direct QuotientRing or look up by value
        if (config.customRing) {
            this.ring = config.customRing;
        } else {
            const rings = getQuotientRings();
            const ringDef = rings.find(r => r.value === this.ringValue);
            this.ring = ringDef && ringDef.modPoly ? new QuotientRing(ringDef.modPoly, ringDef.name) : null;
        }

        // Setup generators — accept custom generator set or use Bₙ defaults
        if (config.customGenerators) {
            this.inverseMap = config.customGenerators.inverseMap;
            this.allGenerators = config.customGenerators.generators;
            this.generators = [...config.customGenerators.generators];
        } else {
            const { generators, inverseMap } = makeBurauGenerators();
            this.inverseMap = inverseMap;
            this.allGenerators = generators;
            // Filter to active generators
            this.generators = generators.filter(g => this.activeGeneratorSymbols.includes(g.symbol));
        }

        // Apply ring reduction to generators if applicable
        if (this.ring) {
            for (const g of this.generators) {
                g.matrix = this.ring.reduceMatrix(g.matrix);
            }
        }

        // Build generator nodes
        this.generatorNodes = this.generators.map(g => {
            const score = matDistFromIdentity(g.matrix);
            return new BurauNode(g.matrix, g.symbol, score);
        });

        // Stats
        this.stats = {
            iteration: 0,
            nodesExplored: 0,
            solutionsFound: 0,
            bestScore: Infinity,
            startTime: 0
        };
    }

    /** Combine two nodes by matrix multiplication */
    combine(a, b) {
        let mat = matMul(a.matrix, b.matrix, this.ring);
        const word = a.word === '' ? b.word : a.word + ' ' + b.word;
        const score = matDistFromIdentity(mat);
        return new BurauNode(mat, word, score);
    }

    /** Check if a node is the identity */
    isIdentity(node) {
        const dim = getStrandCount() - 1;
        return matEquals(node.matrix, matIdentity(dim));
    }

    /** 
     * Free-reduce a word: repeatedly cancel adjacent inverse pairs.
     * Returns the reduced word as a string (may be empty).
     * Uses a stack for O(n) single-pass reduction.
     */
    freeReduce(wordStr) {
        const parts = wordStr.split(' ');
        const stack = [];
        for (const sym of parts) {
            if (stack.length > 0 && this.inverseMap[stack[stack.length - 1]] === sym) {
                stack.pop(); // cancel adjacent inverse pair
            } else {
                stack.push(sym);
            }
        }
        return stack.join(' ');
    }

    /** 
     * Check if a word is non-trivial: it must have length > 0 AND 
     * must NOT freely reduce to the empty word (which would mean it's
     * trivially the identity in any group, not just via braid relations).
     */
    isNontrivial(node) {
        if (node.wordLength <= 1) return false;
        // Free-reduce: cancel all adjacent inverse pairs
        const reduced = this.freeReduce(node.word);
        if (reduced === '') return false;
        return true;
    }

    /** Check if appending this generator would immediately cancel */
    wouldCancel(beamNode, genNode) {
        const lastSym = beamNode.lastSymbol;
        if (!lastSym) return false;
        return this.inverseMap[lastSym] === genNode.word;
    }

    /** Run the search, yielding control every iteration */
    start() {
        if (this.running) return;
        this.running = true;
        this.stopRequested = false;
        this.stats.startTime = performance.now();
        this.stats.iteration = 0;
        this.stats.nodesExplored = 0;
        this.stats.solutionsFound = 0;
        this.stats.bestScore = Infinity;

        const dim = getStrandCount() - 1;
        const identity = matIdentity(dim);
        const root = new BurauNode(identity, '', 0);

        let currentBeam = [root, ...this.generatorNodes.map(n =>
            new BurauNode(n.matrix, n.word, n.score)
        )];
        let persistentFlash = this.generatorNodes.map(n =>
            new BurauNode(n.matrix, n.word, n.score)
        );

        const visited = new Set();
        visited.add(root.hash);
        for (const n of currentBeam) visited.add(n.hash);

        const solutions = [];
        const solutionWords = new Set(); // dedup solutions by word

        const iterate = () => {
            if (this.stopRequested || this.stats.iteration >= this.maxIterations) {
                this.running = false;
                this.onComplete({
                    ...this.stats,
                    elapsed: performance.now() - this.stats.startTime,
                    solutions
                });
                return;
            }

            this.stats.iteration++;
            const candidates = [];

            // Expansion pool = persistent flash ∪ generators
            const poolMap = new Map();
            for (const g of this.generatorNodes) poolMap.set(g.hash, g);
            for (const f of persistentFlash) poolMap.set(f.hash, f);
            const pool = [...poolMap.values()];

            // Expand: beam × pool
            for (const beamNode of currentBeam) {
                for (const poolNode of pool) {
                    // Pruning: don't immediately cancel
                    if (this.wouldCancel(beamNode, poolNode)) continue;

                    const child = this.combine(beamNode, poolNode);
                    this.stats.nodesExplored++;

                    // Check solution BEFORE dedup (identity is in visited from init)
                    if (this.isIdentity(child) && this.isNontrivial(child)) {
                        if (!solutionWords.has(child.word)) {
                            solutionWords.add(child.word);
                            this.stats.solutionsFound++;
                            solutions.push(child);
                            this.onSolution(child);
                        }
                        continue;
                    }

                    // Dedup (for non-solution nodes)
                    const h = child.hash;
                    if (visited.has(h)) continue;
                    visited.add(h);

                    candidates.push(child);
                }
            }

            // Also try pool × beam (right multiplication)
            for (const poolNode of pool) {
                for (const beamNode of currentBeam) {
                    if (beamNode.word === '') continue; // skip root
                    const child = this.combine(poolNode, beamNode);
                    this.stats.nodesExplored++;

                    // Check solution BEFORE dedup
                    if (this.isIdentity(child) && this.isNontrivial(child)) {
                        if (!solutionWords.has(child.word)) {
                            solutionWords.add(child.word);
                            this.stats.solutionsFound++;
                            solutions.push(child);
                            this.onSolution(child);
                        }
                        continue;
                    }

                    const h = child.hash;
                    if (visited.has(h)) continue;
                    visited.add(h);

                    candidates.push(child);
                }
            }

            // Sort candidates by score, take top W
            candidates.sort((a, b) => a.score - b.score);
            currentBeam = candidates.slice(0, this.beamWidth);

            // Update persistent flash: merge current flash + best from beam
            const flashCandidates = [...persistentFlash, ...currentBeam]
                .filter(n => n.score > 0 && n.wordLength > 0); // exclude trivial
            flashCandidates.sort((a, b) => a.score - b.score);

            // Deduplicate flash
            const flashMap = new Map();
            for (const fc of flashCandidates) {
                if (!flashMap.has(fc.hash)) flashMap.set(fc.hash, fc);
                if (flashMap.size >= this.flashSize) break;
            }
            persistentFlash = [...flashMap.values()];

            // Update stats
            this.stats.bestScore = currentBeam.length > 0 ? currentBeam[0].score : Infinity;

            // Callback
            this.onIteration({
                iteration: this.stats.iteration,
                bestScore: this.stats.bestScore,
                beamSize: currentBeam.length,
                flashSize: persistentFlash.length,
                nodesExplored: this.stats.nodesExplored,
                solutionsFound: this.stats.solutionsFound,
                topFlash: persistentFlash.slice(0, 5).map(n => ({
                    word: n.word,
                    score: n.score.toFixed(4)
                })),
                bestWord: currentBeam.length > 0 ? currentBeam[0].word : '—'
            });

            // Yield to event loop, then continue
            setTimeout(iterate, 0);
        };

        // Start
        setTimeout(iterate, 0);
    }

    stop() {
        this.stopRequested = true;
    }
}


export { FlashBeamSolver, BurauNode };
