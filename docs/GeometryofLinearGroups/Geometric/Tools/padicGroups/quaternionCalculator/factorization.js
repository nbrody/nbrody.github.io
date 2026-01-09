
import { QMath } from './generatorComputation.js';
import {
    findAllQuaternions,
    filterByQ8Orbit,
    removeConjugatePairs,
    matchQuaternionToP1,
    findXYSolution
} from './primeQuaternionFilters.js';

// --- Integer Factorization ---
export function getPrimeFactors(n) {
    const factors = {};
    let d = 2;
    let temp = n;
    while (d * d <= temp) {
        while (temp % d === 0) {
            factors[d] = (factors[d] || 0) + 1;
            temp /= d;
        }
        d++;
    }
    if (temp > 1) {
        factors[temp] = (factors[temp] || 0) + 1;
    }
    return factors;
}

// --- Quaternion Factorization ---
// Find all left factors of q with a specific norm
export async function findLeftFactorsOfNorm(q, targetNorm, p) {
    // Optimization: If targetNorm is prime p, we can generate all quats of norm p and check division
    // This is much faster than brute force

    // Check if q is divisible by any quaternion x of norm targetNorm
    // i.e., N(x) = targetNorm AND q * conjugate(x) is divisible by targetNorm (in all components)

    // We assume targetNorm = p (prime) for the basic step
    const candidates = await findAllQuaternions(p);

    const factors = [];
    for (const x of candidates) {
        // Check divisibility: q = x * y  => y = x^-1 * q = conjugate(x)/N(x) * q = (conjugate(x) * q) / N(x)
        // So we check if conjugate(x) * q has all components divisible by N(x)

        const xConj = QMath.conjugate(x);
        const prod = QMath.multiply(xConj, q);

        const isDivisible = prod.every(val => val % targetNorm === 0);

        if (isDivisible) {
            factors.push(x);
        }
    }

    return factors;
}

/**
 * Compute the factorization tree/lattice
 * 
 * Returns a graph structure:
 * {
 *   nodes: [{ id: '0,0', norm: 1, factors: [[1,0,0,0]] }, ...],
 *   links: [{ source: '0,0', target: '1,0', prime: 5, factor: [1,2,0,0] }, ...]
 * }
 */
export async function computeFactorizationLattice(q) {
    const norm = QMath.normSq(q);
    const primeFactors = getPrimeFactors(norm);
    const primes = Object.keys(primeFactors).map(Number).sort((a, b) => a - b);

    // Build the grid of target norms
    // Dimensions: primes.length
    // Size in dimension i: primeFactors[primes[i]] + 1

    // State: Map from "coordinate string" to List of Quaternions
    // Coordinate: "e1,e2,..." representing current norm p1^e1 * p2^e2...
    const lattice = new Map();

    // Initialize root
    const startCoord = primes.map(() => 0);
    lattice.set(startCoord.join(','), [[1, 0, 0, 0]]);

    const nodes = [];
    const links = [];

    // Queue for BFS
    const queue = [startCoord];
    const visited = new Set([startCoord.join(',')]);

    while (queue.length > 0) {
        const currentCoord = queue.shift();
        const currentKey = currentCoord.join(',');
        const currentQuats = lattice.get(currentKey);

        nodes.push({
            id: currentKey,
            coord: currentCoord,
            quaternions: currentQuats,
            level: currentCoord.reduce((a, b) => a + b, 0)
        });

        // Try to advance in each dimension
        for (let i = 0; i < primes.length; i++) {
            const p = primes[i];
            const maxPow = primeFactors[p];

            if (currentCoord[i] < maxPow) {
                // Next coordinate: increment i-th component
                const nextCoord = [...currentCoord];
                nextCoord[i]++;
                const nextKey = nextCoord.join(',');

                // If not visited, initialize list
                if (!lattice.has(nextKey)) {
                    lattice.set(nextKey, []);
                }

                // For each quaternion at current node, find extensions by p
                // We need x * pi = y, where y is a factor of q of norm (currentNorm * p)
                // BUT easier: x is a factor of q. We just need to find left factors of (x^-1 q) of norm p?
                // No, we are building from left. q = x * remainder.
                // We want to update x -> x * pi.
                // So pi must be a left factor of the remainder!

                // 1. For each x in currentQuats:
                //    Remainder r = x^-1 * q = (conj(x) * q) / N(x)
                //    Find left factors of r of norm p (let's call them pi)
                //    New factor y = x * pi
                //    Add y to lattice(nextKey) and link x -> y

                // We need to cache computation to avoid re-generating quats of norm p
                // But finding checking divisibility is fast

                // Get pre-calced quats of norm p (could cache this globally)
                // For now we call the function (it regenerates, optimizing later might be needed)

                for (const x of currentQuats) {
                    // Calculate remainder r
                    const xConj = QMath.conjugate(x);
                    const num = QMath.multiply(xConj, q);
                    const nX = QMath.normSq(x);
                    const r = num.map(v => v / nX); // Should be exact integers

                    // Find left factors of r of norm p
                    const piFactors = await findLeftFactorsOfNorm(r, p, p);

                    for (const pi of piFactors) {
                        const y = QMath.multiply(x, pi);

                        // Normalize y to group equivalent factorizations (remove unit ambiguity)
                        // Units in integer quaternions are +/-1, +/-i, +/-j, +/-k.
                        // We can also divide by common content if we only care about the projective lattice node.
                        // However, the "Factor Complex" usually tracks the actual factorization.
                        // But "vertex is the corresponding factor" implies uniqueness.
                        // Let's normalize by making the first non-zero component positive to handle +/-.
                        // And maybe sort out i,j,k ambiguity if we treat them as same node?
                        // Actually, just preventing exact duplicates (including sign) in the list is a good start.

                        // Better: Check if y is already in the list (exact match)
                        const existingExact = lattice.get(nextKey).find(eq => QMath.areEqual(eq, y));
                        if (!existingExact) {
                            lattice.get(nextKey).push(y);
                        }

                        // For the link, we use the specific y we found
                        // But the TARGET node in the graph needs a unique ID if we want to merge nodes.
                        // Currently nodes are identified by `nextKey` (the norm coordinate).
                        // This means ALL quaternions of the same norm are grouped into ONE visual node (the big circle with count).
                        // This is why the user says "vertices are all just labeled 8" (or whatever count).

                        // The user probably wants a GRAPH where each quaternion is a distinct node.
                        // Currently: `nodes` loop (line 225) generates one SVG group per `node` object.
                        // `nodes` comes from `queue` processing (line 92), which is one per COORDINATE (norm).
                        // So we are grouping by norm.

                        // FIX: We need to explode the lattice.
                        // The `lattice` map currently groups by norm. 
                        // Real structure: Node = (coordinate, quaternion).
                        // We should return a list of unique quaternion nodes.

                        links.push({
                            source: currentKey,
                            target: nextKey,
                            sourceQuat: x,
                            targetQuat: y,
                            factor: pi,
                            prime: p
                        });
                    }
                }

                if (!visited.has(nextKey)) {
                    visited.add(nextKey);
                    queue.push(nextCoord);
                }
            }
        }
    }

    // --- REFACTORED NODE GENERATION ---
    // User wants unique nodes for each quaternion, not grouped by norm.
    // We reconstruct 'nodes' and 'links' to be quaternion-specific.

    const uniqueNodes = [];
    const uniqueLinks = [];
    const getQId = (q) => q.join(',');

    // 1. Flatten nodes
    for (const [coordKey, quats] of lattice) {
        const coord = coordKey.split(',').map(Number);
        for (const q of quats) {
            uniqueNodes.push({
                id: getQId(q), // Unique ID is the quaternion itself
                coord: coord,
                quaternions: [q], // Keep array structure for frontend compatibility
                level: coord.reduce((a, b) => a + b, 0),
                q: q // Helper
            });
        }
    }

    // 2. Fix links (we need to match source/target quats to IDs)
    // The original 'links' array gathered during BFS has { sourceQuat, targetQuat, prime, factor }
    // We just need to remap source/target to the quaternion IDs.

    for (const link of links) {
        uniqueLinks.push({
            source: getQId(link.sourceQuat),
            target: getQId(link.targetQuat),
            prime: link.prime,
            factor: link.factor
        });
    }

    return { nodes: uniqueNodes, links: uniqueLinks, primes };
}

// --- Tree Visualization Logic ---
// Calculate the path on the p-adic tree
export async function calculateTreePath(q, p) {
    const norm = QMath.normSq(q);

    // Check if norm is power of p (times unit?)
    // Actually q acts on the tree regardless of norm, but if N(q) isn't p^k, 
    // it acts as a "rotation" + scaling.
    // The prompt says "computes the action of q on the trees".
    // Usually we care about the axis of translation or the node it maps to.

    // If q is integer quaternion, it maps the standard lattice L0 to q*L0.
    // The distance is related to the valuation of the determinant.

    // Let's effectively "factor" q into a sequence of steps of norm p.
    // q = u * pi_1 * pi_2 ... * pi_k
    // each pi_i corresponds to a move in the tree.

    // If q has other prime factors, they act as units in Q_p (rotations fixing v0).
    // So we only care about the p-part of the norm.

    let tempQ = [...q];
    let path = [{ label: '1', quaternion: [1, 0, 0, 0], p1Label: null }];

    // Determine the "depth" in p (how many factors of p)
    const normFactors = getPrimeFactors(norm);
    const depth = normFactors[p] || 0;

    // Current accumulated position (quaternion x such that we are at x * L0)
    let currentPos = [1, 0, 0, 0];

    // We iteratively peel off left factors of norm p
    let remainder = [...q];

    for (let i = 0; i < depth; i++) {
        // Find left factor of 'remainder' of norm p
        const factors = await findLeftFactorsOfNorm(remainder, p, p);

        if (factors.length === 0) {
            console.error("Could not factor p-part!", remainder, p);
            break;
        }

        // There should be exactly one left factor of norm p 'in the correct direction' 
        // if we consider the action on the tree (non-backtracking)?
        // Actually, quaternion factorization isn't unique. 
        // But the action on the tree (cosets) IS unique.
        // q L_0 is a specific lattice.
        // We want the path v0 -> v1 -> ... -> vk = q v0
        // v1 is the unique neighbor on the geodesic to vk.

        // Heuristic: The correct factor pi must maximize the "progress"
        // actually, ANY left factor pi of n(pi)=p corresponds to a neighbor.
        // Is the neighbor unique?
        // Since we are dealing with integer quaternions, 
        // The lattice q L0 is a sublattice of index p^k. 
        // There is a unique path in the tree.
        // This corresponds to a specific factorization q = pi_1 ... pi_k * u
        // where u is a unit in Z_p (norm coprime to p).

        // Whatever factor we pick, it must be "valid".
        // Let's just pick the first one found?
        // Wait, if we pick the wrong one, we might go "off" the geodesic?
        // Actually, if N(q) = p^k * m, and we find pi s.t. q = pi * q', then N(q') = p^{k-1} * m.
        // This reduces the p-valuation. So we are always moving "down" the tree (away from root).
        // Since the tree is a tree, any step "down" is valid. 
        // Wait, multiple pi's might divide q.
        // This corresponds to q being in the intersection of multiple sublattices?
        // No, if q is scalar, e.g. q=p. Then p divides q. But any pi of norm p also divides q (since p = pi * conj(pi)).
        // q=p corresponds to moving "back" or "double step"?
        // p acts as identity on PGL tree?
        // Action on PGL tree uses PGL. scalars are trivial.
        // So q=p is distance 0.
        // If user inputs q=p, depth is 0. 

        // Issue: Input q might have factor p (scalar).
        // We should divide out scalar p's first if we want PGL action.
        // Or handle them? 
        // If q is divisible by p (as vector), then q/p is integer.
        // We should simplify q by dividing by gcd(q) first?
        // The Prompt says "enter a quaternion q... action on trees".

        // Let's remove scalar factors of p first.
        let factorP = true;
        while (factorP) {
            if (remainder.every(c => c % p === 0)) {
                remainder = remainder.map(c => c / p);
            } else {
                factorP = false;
            }
        }

        // Now find factors
        const validFactors = await findLeftFactorsOfNorm(remainder, p, p);

        if (validFactors.length > 0) {
            // Pick the first one. 
            // In theory they should all be "equivalent" modulo units?
            // Or they define different directions?
            // If q is not scalar, there should be a unique "outgoing" edge direction in the Bruhat Tits tree.
            // Which means all valid pi's should correspond to the SAME P1 label.

            // Let's verify this hypothesis. 
            // Calculate P1 label for all factors.
            const uniqueP1s = new Set();
            let chosenPi = validFactors[0];

            // Helper to get xy sol
            const xy = findXYSolution(p); // efficient call

            for (const vf of validFactors) {
                const label = matchQuaternionToP1(vf, xy.x, xy.y, p);
                uniqueP1s.add(label);
            }

            if (uniqueP1s.size > 1) {
                console.warn("Ambiguous path direction!", uniqueP1s);
            }

            // Use the P1 label to identify the node
            const label = matchQuaternionToP1(chosenPi, xy.x, xy.y, p);

            currentPos = QMath.multiply(currentPos, chosenPi);
            path.push({
                label: label,
                quaternion: chosenPi,
                accumulated: currentPos,
                depth: i + 1
            });

            // Update remainder
            // remainder = chosenPi^-1 * remainder
            const conj = QMath.conjugate(chosenPi);
            const num = QMath.multiply(conj, remainder);
            remainder = num.map(v => v / p);
        } else {
            console.log("No factor found, stopping path");
            break;
        }
    }

    return path;
}
