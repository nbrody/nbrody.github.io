// generators.js — Prime quaternion generation, P1 labeling, and relation computation

import { ProjQ, QMath, findXYSolution, modInverse, formatQuaternion, getPrimeFactors, areEquivalent, canonicalize } from './quaternion.js';

// ============================================================
// Find all integer quaternions of norm p
// ============================================================
export function findAllQuaternions(p) {
    const quats = [];
    const limit = Math.ceil(Math.sqrt(p));
    for (let a = -limit; a <= limit; a++) {
        for (let b = -limit; b <= limit; b++) {
            for (let c = -limit; c <= limit; c++) {
                const d2 = p - (a * a + b * b + c * c);
                if (d2 >= 0) {
                    const d = Math.sqrt(d2);
                    if (Number.isInteger(d)) {
                        quats.push([a, b, c, d]);
                        if (d !== 0) quats.push([a, b, c, -d]);
                    }
                }
            }
        }
    }
    return quats;
}

// ============================================================
// Map quaternion to P^1(F_p) label
// ============================================================
function quaternionToMatrix(q, x0, y0, p) {
    const [a, b, c, d] = q;
    return [
        [((a + b * x0 - c * y0) % p + p) % p, ((b * y0 + c * x0 - d) % p + p) % p],
        [((b * y0 + c * x0 + d) % p + p) % p, ((a - b * x0 + c * y0) % p + p) % p]
    ];
}

function matrixKernel(matrix, p) {
    const [[a, b], [c, d]] = matrix;
    if (a === 0 && b === 0) return '∞';
    if (b !== 0) {
        const x = b, y = ((-a % p) + p) % p;
        const yInv = modInverse(y, p);
        return yInv === null ? '∞' : String((x * yInv) % p);
    }
    if (a !== 0) return '0';
    return '∞';
}

export function matchQuaternionToP1(q, x0, y0, p) {
    return matrixKernel(quaternionToMatrix(q, x0, y0, p), p);
}

// ============================================================
// Generate canonical generators for a prime p
// Returns array of { quaternion, p1Label, prime }
// ============================================================
export function generateCanonicalGenerators(p) {
    const xy = findXYSolution(p);
    if (!xy) throw new Error(`No x² + y² ≡ -1 (mod ${p}) solution found`);

    const allQuats = findAllQuaternions(p);
    const labeled = allQuats.map(q => ({
        quaternion: q,
        p1Label: matchQuaternionToP1(q, xy.x, xy.y, p),
        prime: p
    }));

    // Group by P1 label, pick canonical representative per label
    const groups = new Map();
    for (const g of labeled) {
        if (!groups.has(g.p1Label)) groups.set(g.p1Label, []);
        groups.get(g.p1Label).push(g);
    }

    const canonical = [];
    for (const [, gens] of groups) {
        let chosen = gens.find(g => {
            const [a, , , d] = g.quaternion;
            return a > 0 && (a & 1) === 1 && (d & 1) === 0;
        });
        if (!chosen) chosen = gens.find(g => g.quaternion[0] > 0);
        if (!chosen) chosen = gens[0];
        canonical.push(chosen);
    }

    return { xy, canonical };
}

// ============================================================
// Build generator objects for multiple primes
// ============================================================
export function buildGenerators(primes) {
    const generators = {};
    const xySolutions = {};
    let genIdx = 1;

    for (let pi = 0; pi < primes.length; pi++) {
        const p = primes[pi];
        const { xy, canonical } = generateCanonicalGenerators(p);
        xySolutions[p] = xy;

        const baseHue = (pi * 137.5) % 360;
        const seen = new Set();

        for (const genObj of canonical) {
            const q = genObj.quaternion;
            const qKey = q.join(',');
            const conj = QMath.conjugate(q);
            const conjKey = conj.join(',');

            if (seen.has(qKey)) continue;
            seen.add(qKey);

            const hue = (baseHue + (genIdx * 360 / Math.max(1, canonical.length))) % 360;
            const color = `hsl(${hue}, 70%, 55%)`;

            const key = `g${genIdx++}`;
            generators[key] = {
                q, pq: ProjQ.from(q), color,
                formatted: formatQuaternion(q),
                prime: p, p1Label: genObj.p1Label
            };

            if (qKey !== conjKey) {
                seen.add(conjKey);
                const conjLabel = canonical.find(
                    g => g.quaternion.join(',') === conjKey
                );
                const keyC = `g${genIdx++}`;
                generators[keyC] = {
                    q: conj, pq: ProjQ.from(conj), color,
                    formatted: formatQuaternion(conj),
                    prime: p,
                    p1Label: conjLabel ? conjLabel.p1Label : '?'
                };
            }
        }
    }

    return { generators, xySolutions };
}

// ============================================================
// Compute projective relations: a * b = b' * a'
// Returns array of { a, b, bp, ap } (generator keys)
//
// For two primes p, q: there should be exactly (p+1)(q+1)
// relations (including degenerate ones where a=a' and b=b').
// ============================================================
export function computeRelations(generators) {
    const relations = [];
    const keys = Object.keys(generators);
    const seen = new Set();

    for (const aKey of keys) {
        for (const bKey of keys) {
            // Only consider cross-prime relations
            if (generators[aKey].prime === generators[bKey].prime) continue;

            const ab = generators[aKey].pq.multiply(generators[bKey].pq);

            let found = false;
            for (const bpKey of keys) {
                if (found) break;
                if (generators[bpKey].prime !== generators[bKey].prime) continue;

                for (const apKey of keys) {
                    if (generators[apKey].prime !== generators[aKey].prime) continue;

                    const bpap = generators[bpKey].pq.multiply(generators[apKey].pq);
                    if (ab.equals(bpap)) {
                        const relKey = `${aKey},${bKey},${bpKey},${apKey}`;
                        if (!seen.has(relKey)) {
                            seen.add(relKey);
                            const degenerate = (aKey === apKey && bKey === bpKey);
                            relations.push({ a: aKey, b: bKey, bp: bpKey, ap: apKey, degenerate });
                        }
                        found = true;
                        break;
                    }
                }
            }
        }
    }

    return relations;
}

// ============================================================
// SO3(Z) generation (24 elements via BFS)
// ============================================================
const SO3Z_GENERATORS = [
    [0, 1, 0, 0], // i
    [0, 0, 1, 0], // j
    [1, 1, 0, 0], // 1+i
    [1, 0, 1, 0]  // 1+j
];

export function generateSO3Z() {
    const group = [];
    const seen = new Set();
    const id = ProjQ.from([1, 0, 0, 0]);
    group.push({ pq: id, q: [1, 0, 0, 0], norm: 1 });
    seen.add(id.hash());

    let idx = 0;
    while (idx < group.length) {
        const current = group[idx++];
        for (const genArr of SO3Z_GENERATORS) {
            const genPQ = ProjQ.from(genArr);
            const next = current.pq.multiply(genPQ);
            if (!seen.has(next.hash())) {
                seen.add(next.hash());
                const arr = next.toArray();
                group.push({ pq: next, q: arr, norm: QMath.normSq(arr) });
            }
        }
    }

    group.sort((a, b) => {
        if (a.norm !== b.norm) return a.norm - b.norm;
        for (let i = 0; i < 4; i++) {
            if (Math.abs(a.q[i] - b.q[i]) > 0.1) return b.q[i] - a.q[i];
        }
        return 0;
    });

    return group;
}

// ============================================================
// Factorization
// ============================================================
export async function findLeftFactorsOfNorm(q, p) {
    const candidates = findAllQuaternions(p);
    const factors = [];
    for (const x of candidates) {
        const xConj = QMath.conjugate(x);
        const prod = QMath.multiply(xConj, q);
        if (!prod.every(val => val % p === 0)) continue;

        const [aw, ax, ay, az] = x.map(v => Math.abs(v % 2));
        let ok = false;
        if (p % 4 === 1) ok = (aw === 1 && ax === 0 && ay === 0 && az === 0);
        else if (p % 4 === 3) ok = (aw === 1 && ax === 1 && ay === 1 && az === 0);
        else ok = true;

        if (ok && x.find(v => v !== 0) > 0) {
            factors.push(x);
        }
    }
    return factors;
}

export async function computeFactorizationLattice(q) {
    const norm = QMath.normSq(q);
    const primeFactors = getPrimeFactors(norm);
    const primes = Object.keys(primeFactors).map(Number).sort((a, b) => a - b);

    const lattice = new Map();
    const startCoord = primes.map(() => 0);
    lattice.set(startCoord.join(','), [[1, 0, 0, 0]]);

    const nodes = [], links = [];
    const queue = [startCoord];
    const visited = new Set([startCoord.join(',')]);

    while (queue.length > 0) {
        const currentCoord = queue.shift();
        const currentKey = currentCoord.join(',');
        const currentQuats = lattice.get(currentKey);

        for (let i = 0; i < primes.length; i++) {
            const p = primes[i];
            if (currentCoord[i] >= primeFactors[p]) continue;

            const nextCoord = [...currentCoord];
            nextCoord[i]++;
            const nextKey = nextCoord.join(',');
            if (!lattice.has(nextKey)) lattice.set(nextKey, []);

            for (const x of currentQuats) {
                const xConj = QMath.conjugate(x);
                const num = QMath.multiply(xConj, q);
                const nX = QMath.normSq(x);
                const r = num.map(v => v / nX);

                const piFactors = await findLeftFactorsOfNorm(r, p);
                for (const pi of piFactors) {
                    const y = QMath.multiply(x, pi);
                    if (!lattice.get(nextKey).some(eq => areEquivalent(eq, y))) {
                        lattice.get(nextKey).push(y);
                    }
                    links.push({
                        source: currentKey, target: nextKey,
                        sourceQuat: x, targetQuat: y, factor: pi, prime: p
                    });
                }
            }

            if (!visited.has(nextKey)) {
                visited.add(nextKey);
                queue.push(nextCoord);
            }
        }
    }

    // Flatten to unique-quaternion nodes
    const getQNodeId = (quat, coordKey) => {
        const can = canonicalize(quat);
        return coordKey + '_' + can.join(',');
    };

    const uniqueNodes = [], uniqueLinks = [];
    for (const [coordKey, quats] of lattice) {
        const coord = coordKey.split(',').map(Number);
        for (const quat of quats) {
            uniqueNodes.push({
                id: getQNodeId(quat, coordKey),
                coord, q: quat,
                level: coord.reduce((a, b) => a + b, 0)
            });
        }
    }
    for (const link of links) {
        uniqueLinks.push({
            source: getQNodeId(link.sourceQuat, link.source),
            target: getQNodeId(link.targetQuat, link.target),
            prime: link.prime, factor: link.factor
        });
    }

    return { nodes: uniqueNodes, links: uniqueLinks, primes };
}


// ============================================================
// Tree path computation
// ============================================================
export async function calculateTreePath(q, p) {
    const norm = QMath.normSq(q);
    const factors = getPrimeFactors(norm);
    const depth = factors[p] || 0;

    let remainder = [...q];
    const path = [];
    const xy = findXYSolution(p);

    for (let i = 0; i < depth; i++) {
        // Remove scalar factors of p
        while (remainder.every(c => c % p === 0)) {
            remainder = remainder.map(c => c / p);
        }

        const validFactors = await findLeftFactorsOfNorm(remainder, p);
        if (validFactors.length === 0) break;

        const chosenPi = validFactors[0];
        const label = matchQuaternionToP1(chosenPi, xy.x, xy.y, p);
        path.push({ label, quaternion: chosenPi, depth: i + 1 });

        const conj = QMath.conjugate(chosenPi);
        const num = QMath.multiply(conj, remainder);
        remainder = num.map(v => v / p);
    }

    // Convert labels to indices for tree drawing
    const pathIndices = path.map(step => {
        if (step.label === '∞') return p; // last index
        return parseInt(step.label);
    });

    return { path, pathIndices, p1Label: path.length > 0 ? path[0].label : '—' };
}
