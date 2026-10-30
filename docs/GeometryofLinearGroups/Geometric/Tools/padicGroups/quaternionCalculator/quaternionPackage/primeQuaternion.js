// primeQuaternion.js - Generation and filtering of prime quaternions
import { ProjectiveQuaternion, QMath, findXYSolution, modInverse, formatQuaternion } from './projectiveQuaternion.js';

/**
 * Compute the 2×2 matrix representation of a quaternion modulo p
 * using the solution (x₀, y₀) to x² + y² ≡ -1 (mod p)
 */
function quaternionToMatrix(q, x0, y0, p) {
    const [a, b, c, d] = q;
    const m11 = ((a + b * x0 - c * y0) % p + p) % p;
    const m12 = ((b * y0 + c * x0 - d) % p + p) % p;
    const m21 = ((b * y0 + c * x0 + d) % p + p) % p;
    const m22 = ((a - b * x0 + c * y0) % p + p) % p;
    return [[m11, m12], [m21, m22]];
}

/**
 * Convert projective coordinates [x:y] to F_p P¹ label {0, 1, ..., p-1, ∞}
 */
function projectiveToP1Label(x, y, p) {
    if (y === 0) return '∞';
    const yInv = modInverse(y, p);
    if (yInv === null) return '∞';
    const label = (x * yInv) % p;
    return label.toString();
}

/**
 * Find the kernel of a rank-one 2×2 matrix over F_p: it kills (b, −a), or
 * (d, −c) when the first row vanishes.
 */
function matrixKernel(matrix, p) {
    const [[a, b], [c, d]] = matrix;
    const [x, y] = (a !== 0 || b !== 0) ? [b, (p - a) % p] : [d, (p - c) % p];
    return { x, y, p1Label: projectiveToP1Label(x, y, p) };
}

/**
 * Find all integer quaternions (a,b,c,d) where a²+b²+c²+d² = p
 */
export async function findAllQuaternions(p, progressCallback = null) {
    const quats = [];
    const limit = Math.ceil(Math.sqrt(p));
    const total = 2 * limit + 1;
    let progress = 0;

    for (let a = -limit; a <= limit; a++) {
        if (progressCallback) {
            progress++;
            progressCallback(progress / total);
        }
        if (a % 10 === 0) await new Promise(resolve => setTimeout(resolve, 0));

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

/**
 * Conjugate a quaternion
 */
export function conjugate(q) {
    return [q[0], -q[1], -q[2], -q[3]];
}

/**
 * Match a quaternion to its P¹ coordinate
 */
export function matchQuaternionToP1(q, x0, y0, p) {
    const matrix = quaternionToMatrix(q, x0, y0, p);
    const kernel = matrixKernel(matrix, p);
    return kernel.p1Label;
}

/**
 * Generate canonical generators for a prime p
 */
export async function generateCanonicalGenerators(p, progressCallback = null) {
    const xy = findXYSolution(p);
    if (!xy) throw new Error(`No x2+y2=-1 solution for p=${p}`);

    const allQuats = await findAllQuaternions(p, progressCallback);

    const labeled = allQuats.map(q => ({
        quaternion: q,
        p1Label: matchQuaternionToP1(q, xy.x, xy.y, p),
        prime: p
    }));

    const labelGroups = new Map();
    labeled.forEach(gen => {
        if (!labelGroups.has(gen.p1Label)) labelGroups.set(gen.p1Label, []);
        labelGroups.get(gen.p1Label).push(gen);
    });

    const canonical = [];
    labelGroups.forEach((gens, label) => {
        let chosen = gens.find(g => {
            const [a, b, c, d] = g.quaternion;
            return a > 0 && (a & 1) === 1 && (d & 1) === 0;
        });
        if (!chosen) chosen = gens.find(g => g.quaternion[0] > 0);
        if (!chosen) chosen = gens[0];
        canonical.push(chosen);
    });

    return canonical;
}

/**
 * Create generator object from canonical groups
 */
export function createGeneratorObject(canonicalGroups, colors = null) {
    const generators = {};
    let genCount = 1;

    canonicalGroups.forEach((group, primeIdx) => {
        const prime = group.prime;
        const gens = group.generators;
        const seen = new Set();

        const baseHue = (primeIdx * 137.5) % 360;
        const primeColors = gens.map((_, i) => `hsl(${(baseHue + (i * 360 / (gens.length / 2))) % 360}, 70%, 50%)`);

        let colorIdx = 0;
        gens.forEach((genObj, i) => {
            const q = genObj.quaternion;
            const qKey = q.join(',');
            const conj = conjugate(q);
            const conjKey = conj.join(',');

            if (seen.has(qKey)) return;

            const color = colors ? colors[genCount % colors.length] : primeColors[colorIdx % primeColors.length];
            colorIdx++;

            // A generator and its conjugate (= inverse) label the same edge, in
            // opposite directions; the conjugate is flagged `inverse`.
            const key = `g${genCount++}`;
            const keyConj = qKey !== conjKey ? `g${genCount++}` : key;
            generators[key] = {
                q: q,
                pq: ProjectiveQuaternion.fromArray(q),
                color: color,
                formatted: formatQuaternion(q),
                prime: prime,
                p1Label: genObj.p1Label,
                inverse: false,
                inverseKey: keyConj
            };
            seen.add(qKey);

            if (qKey !== conjKey) {
                const conjMatch = gens.find(g => g.quaternion.join(',') === conjKey);
                generators[keyConj] = {
                    q: conj,
                    pq: ProjectiveQuaternion.fromArray(conj),
                    color: color,
                    formatted: formatQuaternion(conj),
                    prime: prime,
                    p1Label: conjMatch ? conjMatch.p1Label : '?',
                    inverse: true,
                    inverseKey: key
                };
                seen.add(conjKey);
            }
        });
    });

    return generators;
}

/**
 * Square relations a·b = b'·a' (projectively, i.e. up to sign) with a, a' of one
 * prime p and b, b' of another prime q. a·b is primitive of norm pq, so it has a
 * unique left factor of norm q among the generators of q, which is b'; then
 * a' = b'⁻¹·a·b = conj(b')·a·b / q. Returns one relation for each such (a, b).
 */
export function computeProjectiveRelations(generators) {
    const relations = [];
    const genKeys = Object.keys(generators);
    const byPrime = new Map();
    const lookup = new Map(); // ±q → key
    for (const key of genKeys) {
        const { prime, q } = generators[key];
        if (!byPrime.has(prime)) byPrime.set(prime, []);
        byPrime.get(prime).push(key);
        lookup.set(q.join(','), key);
        lookup.set(q.map((x) => -x).join(','), key);
    }

    for (const aKey of genKeys) {
        const a = generators[aKey];
        for (const bKey of genKeys) {
            const b = generators[bKey];
            if (a.prime === b.prime) continue;
            const ab = QMath.multiply(a.q, b.q);
            const found = [];
            for (const bpKey of byPrime.get(b.prime)) {
                const y = QMath.multiply(QMath.conjugate(generators[bpKey].q), ab);
                if (!y.every((v) => v % b.prime === 0)) continue;
                const apKey = lookup.get(y.map((v) => v / b.prime).join(','));
                if (apKey !== undefined && generators[apKey].prime === a.prime) found.push({ bpKey, apKey });
            }
            if (found.length !== 1) {
                console.warn(`${aKey}·${bKey}: expected one refactorisation, found ${found.length}`);
                if (found.length === 0) continue;
            }
            relations.push({ a: aKey, b: bKey, bp: found[0].bpKey, ap: found[0].apKey });
        }
    }

    return relations;
}

/**
 * Generate all generators for multiple primes
 */
export async function generateGeneratorsForPrimes(primes, progressCallback = null) {
    const allCanonical = [];
    for (let i = 0; i < primes.length; i++) {
        const p = primes[i];
        const canonical = await generateCanonicalGenerators(p, (progress) => {
            if (progressCallback) {
                const overallProgress = (i + progress) / primes.length;
                progressCallback(overallProgress, `Prime ${p}`);
            }
        });
        allCanonical.push({ prime: p, generators: canonical });
    }
    return allCanonical;
}
