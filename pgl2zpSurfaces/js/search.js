/* ============================================================
   search.js – Random search for transitive permutation models
   ============================================================ */

import {
    RNG, randomPerm, orbitTransitive, commutatorPerm,
    cycleDecomposition, inversePerm, reduceWord, invertWord
} from './math.js';

function desiredCycleType(cycles, p) {
    const lens = cycles.map(c => c.length).sort((x, y) => x - y);
    return lens.length === 2 && lens[0] === 2 && lens[1] === 2 * p;
}

/**
 * Search for a transitive permutation pair (a,b) on {0,...,2p+1}
 * whose commutator has cycle type (2)(2p).
 */
export function findRepresentation(p, attempts, seed, progressCb) {
    const n = 2 * p + 2;
    const preferredSeeds = [seed, 1, 2, 3, 5, 7, 11, 13, 17, 19]
        .filter((x, i, arr) => arr.indexOf(x) === i);
    let checked = 0;

    for (const s of preferredSeeds) {
        const rng = new RNG(s);
        for (let t = 1; t <= Math.min(attempts, 1200); t++) {
            checked++;
            const a = randomPerm(n, rng);
            const b = randomPerm(n, rng);
            if (!orbitTransitive([a, b])) continue;
            const u = commutatorPerm(a, b);
            const cycles = cycleDecomposition(u);
            if (desiredCycleType(cycles, p))
                return { a, b, u, cycles, attempts: checked, seedUsed: s };
            if (progressCb && checked % 250 === 0) progressCb(checked, s);
        }
    }

    const rng = new RNG(seed || 1);
    for (let t = checked + 1; t <= attempts; t++) {
        const a = randomPerm(n, rng);
        const b = randomPerm(n, rng);
        if (!orbitTransitive([a, b])) continue;
        const u = commutatorPerm(a, b);
        const cycles = cycleDecomposition(u);
        if (desiredCycleType(cycles, p))
            return { a, b, u, cycles, attempts: t, seedUsed: seed || 1 };
        if (progressCb && t % 250 === 0) progressCb(t, seed || 1);
    }
    return null;
}

/**
 * BFS tree on the coset graph. Returns coset representative words.
 */
export function bfsTree(a, b) {
    const n = a.length;
    const gens = { a, b, A: inversePerm(a), B: inversePerm(b) };
    const parent = Array(n).fill(-1);
    const parentGen = Array(n).fill(null);
    const word = Array(n).fill('');
    const seen = Array(n).fill(false);
    const q = [0];
    seen[0] = true;
    while (q.length) {
        const v = q.shift();
        for (const gName of ['a', 'b', 'A', 'B']) {
            const w = gens[gName][v];
            if (!seen[w]) {
                seen[w] = true;
                parent[w] = v;
                parentGen[w] = gName;
                word[w] = reduceWord(word[v] + gName);
                q.push(w);
            }
        }
    }
    return { parent, parentGen, word };
}

/**
 * Compute Schreier generators for the finite-index subgroup H.
 */
export function schreierGenerators(a, b) {
    const ainv = inversePerm(a), binv = inversePerm(b);
    const perms = { a, b, A: ainv, B: binv };
    const { word } = bfsTree(a, b);
    const gens = [];
    const seenWords = new Set();
    for (let v = 0; v < a.length; v++) {
        for (const gName of ['a', 'b']) {
            const w = perms[gName][v];
            const s = reduceWord(word[v] + gName + invertWord(word[w]));
            if (s && !seenWords.has(s)) {
                seenWords.add(s);
                gens.push(s);
            }
        }
    }
    return gens;
}
