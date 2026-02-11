// arithmetic.js — Gamma_0(N) computations: coset reps, cusps, pairing curves
import { matMul, matInv, mobiusReal, S, T, Tinv } from './hyperbolic.js';

// ---- Basic number theory ----

export function gcd(a, b) {
    a = Math.abs(a); b = Math.abs(b);
    while (b) { [a, b] = [b, a % b]; }
    return a;
}

export function extgcd(a, b) {
    if (b === 0) return [a, 1, 0];
    const [g, x1, y1] = extgcd(b, a % b);
    return [g, y1, x1 - Math.floor(a / b) * y1];
}

// ---- Gamma_0(N) index ----

// Factorize n into prime factors
function primeFactors(n) {
    const factors = new Set();
    for (let p = 2; p * p <= n; p++) {
        while (n % p === 0) { factors.add(p); n /= p; }
    }
    if (n > 1) factors.add(n);
    return [...factors];
}

// [PSL_2(Z) : Gamma_0(N)] = N * prod_{p | N} (1 + 1/p)
export function gamma0Index(N) {
    let result = N;
    for (const p of primeFactors(N)) {
        result *= (1 + 1 / p);
    }
    return Math.round(result);
}

// ---- Coset representatives via BFS ----

// Canonical key for P^1(Z/NZ): the pair (c mod N, d mod N) up to scalar multiples
function canonicalP1(c, d, N) {
    c = ((c % N) + N) % N;
    d = ((d % N) + N) % N;
    let bestC = c, bestD = d;
    for (let u = 2; u < N; u++) {
        if (gcd(u, N) !== 1) continue;
        const cu = (c * u) % N;
        const du = (d * u) % N;
        if (cu < bestC || (cu === bestC && du < bestD)) {
            bestC = cu;
            bestD = du;
        }
    }
    return `${bestC},${bestD}`;
}

// BFS enumeration of right coset representatives for Gamma_0(N) \ PSL_2(Z)
export function cosetRepsGamma0(N) {
    const expectedIndex = gamma0Index(N);
    const reps = [[1, 0, 0, 1]]; // identity
    const seen = new Set();
    seen.add(canonicalP1(0, 1, N)); // identity has bottom row (0, 1)

    let frontier = [[1, 0, 0, 1]];
    const gens = [S, T, Tinv];

    while (reps.length < expectedIndex && frontier.length > 0) {
        const nextFrontier = [];
        for (const g of frontier) {
            for (const gen of gens) {
                const prod = matMul(g, gen); // right-multiply
                const c = ((Math.round(prod[2]) % N) + N) % N;
                const d = ((Math.round(prod[3]) % N) + N) % N;
                const key = canonicalP1(c, d, N);
                if (!seen.has(key)) {
                    seen.add(key);
                    reps.push(prod.map(Math.round));
                    nextFrontier.push(prod.map(Math.round));
                }
            }
        }
        frontier = nextFrontier;
    }
    return reps;
}

// ---- Cusp enumeration ----

// For squarefree N, cusps of Gamma_0(N) correspond to divisors of N
export function enumerateCusps(N) {
    const divisors = [];
    for (let d = 1; d <= N; d++) {
        if (N % d === 0) divisors.push(d);
    }
    return divisors.map(d => {
        if (d === N) return { a: 0, c: 1, label: '0', value: 0, divisor: d };
        if (d === 1) return { a: 1, c: 0, label: '\\infty', value: Infinity, divisor: d };
        return { a: 1, c: d, label: `1/${d}`, value: 1 / d, divisor: d };
    });
}

// Cusp width: N / gcd(c^2, N) where a/c is the cusp representative
export function cuspWidth(c, N) {
    if (c === 0) return 1;
    return N / gcd(c * c, N);
}

// ---- Pairing curves ----

// The two geodesics that pair the four cusps of Gamma_0(2p)
export function pairingCurves(p) {
    // Alpha: geodesic from 0 to infinity (the imaginary axis)
    // Pairs cusps 0 and infinity
    const alpha = { x1: 0, x2: Infinity, label: '\\alpha' };

    // Beta: geodesic from 1/p to 1/2
    // Pairs cusps 1/p and 1/2
    const beta = { x1: 1 / p, x2: 1 / 2, label: '\\beta' };

    return { alpha, beta };
}

// ---- Conjugating element ----

// The element g = ((0, -1), (2p, -2(p+2))) that maps alpha to beta
export function conjugatingElement(p) {
    return [0, -1, 2 * p, -2 * (p + 2)];
}

// Verify where g sends the endpoints of alpha
export function verifyConjugation(p) {
    const g = conjugatingElement(p);
    const gInf = mobiusReal(g, Infinity);  // a/c = 0/(2p) = 0
    const g0 = mobiusReal(g, 0);           // b/d = -1/(-2(p+2)) = 1/(2(p+2))
    return { gInfinity: gInf, g0: g0 };
}

// ---- Master computation ----

export function computeGamma0Data(p) {
    const N = 2 * p;
    const cosetReps = cosetRepsGamma0(N);
    const cusps = enumerateCusps(N);
    const curves = pairingCurves(p);
    const g = conjugatingElement(p);

    // Compute cusp widths
    cusps.forEach(cusp => {
        cusp.width = cuspWidth(cusp.c, N);
    });

    return {
        N,
        p,
        index: gamma0Index(N),
        cosetReps,
        cusps,
        pairingCurves: curves,
        conjugatingElement: g,
    };
}
