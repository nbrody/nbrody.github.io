/**
 * Monte Carlo Tree Search implementation for finding PGL(2,A) elements
 */

import { Rational } from './rational.js';
import { multiplyMatrices, invertMatrix, matrixToString, matrixAvoidsPrimes, isUnitInA, getMatrixDistance } from './matrixUtils.js';
import { PGLElement } from './pgl.js';

/**
 * Check if a matrix is in PGL(2,A) where A is the localization avoiding certain primes
 * A matrix is in PGL(2,A) if:
 * 1. All entries are in A (avoids the forbidden primes in denominators)
 * 2. Determinant is a unit in A (both numerator and denominator only use inverted primes)
 */
export function isInPGL2A(matrix, primesToAvoid = new Set()) {
    // Check if matrix entries avoid forbidden primes
    if (!matrixAvoidsPrimes(matrix, primesToAvoid)) {
        return false;
    }

    // Check determinant is a unit in A
    const det = matrix[0][0].mul(matrix[1][1]).sub(matrix[0][1].mul(matrix[1][0]));

    // Determinant must be nonzero and a unit in A
    if (det.numerator === 0) {
        return false;
    }

    return isUnitInA(det, primesToAvoid);
}

/**
 * Score a matrix based on distance improvement over expected
 * For 2-generator case: g_1 has expected distance increase of 2, g_2 has expected increase of 6
 * Score = expected_distance - actual_distance (higher is better)
 */
export function scoreByDistance(matrix, word) {
    const actualDistance = getMatrixDistance(matrix);

    // Count uses of each generator in the word
    // Word format: g_{1}, g_{2}, g_{1}^{-1}, g_{2}^{-1}
    const g1Pattern = /g_\{1\}(\^\{-1\})?/g;
    const g2Pattern = /g_\{2\}(\^\{-1\})?/g;

    const count1 = (word.match(g1Pattern) || []).length;
    const count2 = (word.match(g2Pattern) || []).length;

    // Expected distance based on generator usage
    const expectedDistance = 2 * count1 + 6 * count2;

    // Score is how much better we did than expected
    // Positive scores mean we found a "shortcut"
    return expectedDistance - actualDistance;
}

/**
 * MCTS Node
 */
class MCTSNode {
    constructor(matrix, word, lastGen, primesToAvoid = new Set(), parent = null) {
        this.matrix = matrix;
        this.word = word;
        this.lastGen = lastGen;
        this.parent = parent;
        this.children = [];
        this.visits = 0;
        this.value = 0;
        this.primesToAvoid = primesToAvoid;
    }

    isFullyExpanded(numGenerators) {
        return this.children.length >= numGenerators;
    }

    ucb1(explorationConstant = Math.sqrt(2)) {
        if (this.visits === 0) return Infinity;
        if (this.parent === null) return this.value / this.visits;

        const exploitation = this.value / this.visits;
        const exploration = explorationConstant * Math.sqrt(Math.log(this.parent.visits) / this.visits);
        return exploitation + exploration;
    }

    bestChild() {
        return this.children.reduce((best, child) =>
            child.ucb1() > best.ucb1() ? child : best
        );
    }
}

/**
 * Run MCTS to find PGL(2,A) elements in the selected localization
 */
export function runMCTS(matrices, iterations, maxDepth, primesToAvoid = new Set()) {
    const n = matrices.length;

    // Create generators
    const generators = [];
    for (let i = 0; i < n; i++) {
        generators.push({
            matrix: matrices[i],
            name: `g_{${i + 1}}`,
            inverse: false,
            index: i
        });
        generators.push({
            matrix: invertMatrix(matrices[i]),
            name: `g_{${i + 1}}^{-1}`,
            inverse: true,
            index: i
        });
    }

    // Root node (identity)
    const identity = [
        [new Rational(1), new Rational(0)],
        [new Rational(0), new Rational(1)]
    ];
    const root = new MCTSNode(identity, 'e', null, primesToAvoid);

    const foundElements = new Map(); // Track unique PGL(2,A) elements found

    // Always include the identity (it's always in PGL(2,A) for any A)
    const identityPGL = new PGLElement(identity);
    foundElements.set(identityPGL.toString(), {
        word: 'e',
        matrix: identity,
        pglElement: identityPGL
    });

    for (let iter = 0; iter < iterations; iter++) {
        // Selection
        let node = root;
        let depth = 0;

        while (node.children.length > 0 && depth < maxDepth) {
            node = node.bestChild();
            depth++;
        }

        // Expansion
        if (depth < maxDepth && !node.isFullyExpanded(generators.length)) {
            // Try to add a child for each valid generator
            for (let i = 0; i < generators.length; i++) {
                // Skip if already have this child
                if (node.children.some(c => c.lastGen === i)) continue;

                const gen = generators[i];

                // Skip if this would create a non-reduced word
                if (node.lastGen !== null) {
                    const lastGen = generators[node.lastGen];
                    if (gen.index === lastGen.index && gen.inverse !== lastGen.inverse) {
                        continue;
                    }
                }

                const newMatrix = multiplyMatrices(node.matrix, gen.matrix);
                const newWord = node.word === 'e' ? gen.name : node.word + gen.name;
                const child = new MCTSNode(newMatrix, newWord, i, primesToAvoid, node);
                node.children.push(child);

                // If this element is in PGL(2,A), record it
                if (isInPGL2A(child.matrix, primesToAvoid)) {
                    const pglElem = new PGLElement(child.matrix);
                    const key = pglElem.toString();
                    if (!foundElements.has(key)) {
                        foundElements.set(key, {
                            word: child.word,
                            matrix: child.matrix,
                            pglElement: pglElem
                        });
                    }
                }
            }

            // Move to first new child if any
            if (node.children.length > 0) {
                node = node.children[node.children.length - 1];
                depth++;
            }
        }

        // Simulation (rollout)
        let simNode = node;
        let simDepth = depth;
        let simMatrix = node.matrix;
        let simWord = node.word;
        let lastGenIdx = node.lastGen;

        while (simDepth < maxDepth) {
            // Pick a random valid generator
            const validGens = [];
            for (let i = 0; i < generators.length; i++) {
                const gen = generators[i];
                if (lastGenIdx !== null) {
                    const lastGen = generators[lastGenIdx];
                    if (gen.index === lastGen.index && gen.inverse !== lastGen.inverse) {
                        continue;
                    }
                }
                validGens.push(i);
            }

            if (validGens.length === 0) break;

            const randomIdx = validGens[Math.floor(Math.random() * validGens.length)];
            const gen = generators[randomIdx];
            simMatrix = multiplyMatrices(simMatrix, gen.matrix);
            simWord = simWord === 'e' ? gen.name : simWord + gen.name;
            lastGenIdx = randomIdx;
            simDepth++;

            // If we found a PGL(2,A) element during simulation, record it
            if (isInPGL2A(simMatrix, primesToAvoid)) {
                const pglElem = new PGLElement(simMatrix);
                const key = pglElem.toString();
                if (!foundElements.has(key)) {
                    foundElements.set(key, {
                        word: simWord,
                        matrix: simMatrix,
                        pglElement: pglElem
                    });
                }
            }
        }

        // Backpropagation
        const reward = scoreByDistance(simMatrix, simWord);
        let backNode = node;
        while (backNode !== null) {
            backNode.visits++;
            backNode.value += reward;
            backNode = backNode.parent;
        }
    }

    return Array.from(foundElements.values());
}
