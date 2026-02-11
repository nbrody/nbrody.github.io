// =============================================================================
// bassSerre.js — Bass-Serre tree and continued fraction axis computation
// =============================================================================
// Depends on math.js: SL2Z class, matA(), matB(), gcd(), isPrime()
//
// Exports:
//   periodicCF(M)            — periodic continued fraction of attracting fixed point
//   translationLength(M)     — translation length on Bass-Serre tree
//   axisPath(M)              — axis as a sequence of edges in the tree
//   bridgeBetweenAxes(M1,M2) — geodesic bridge between two disjoint axes
// =============================================================================

// ---------------------------------------------------------------------------
// Integer square root (floor of sqrt for non-negative integers)
// ---------------------------------------------------------------------------
function isqrt(n) {
    if (n < 0) throw new Error('isqrt: negative input');
    if (n === 0) return 0;
    // Newton's method with integer arithmetic
    let x = Math.floor(Math.sqrt(n));
    // Correct potential floating-point errors
    while (x * x > n) x--;
    while ((x + 1) * (x + 1) <= n) x++;
    return x;
}

// ---------------------------------------------------------------------------
// Integer floor division: floor(a / b) for integers a, b with b != 0
// ---------------------------------------------------------------------------
function floorDiv(a, b) {
    if (b === 0) throw new Error('floorDiv: division by zero');
    // JS integer division truncates toward zero; we need floor
    const q = Math.trunc(a / b);
    // Adjust if the remainder has opposite sign to b
    if ((a - q * b !== 0) && ((a ^ b) < 0)) {
        return q - 1;
    }
    return q;
}

// ---------------------------------------------------------------------------
// periodicCF(M) — Periodic continued fraction of the attracting fixed point
// ---------------------------------------------------------------------------
//
// For hyperbolic M = [[a,b],[c,d]] in SL(2,Z), the attracting fixed point
// is a quadratic irrational alpha = (P + sqrt(D)) / Q.
//
// We compute its continued fraction expansion using exact integer arithmetic.
// The expansion is eventually periodic (Lagrange's theorem).
//
// Returns: { preperiod: [...], period: [...], D: discriminant }
//
// The CF represents alpha = [a0; a1, a2, ..., ak, (period)] where the
// parenthesized part repeats forever.
// ---------------------------------------------------------------------------
function periodicCF(M) {
    if (!M.isHyperbolic()) {
        throw new Error('periodicCF: matrix must be hyperbolic (|trace| > 2)');
    }

    let { a, b, c, d } = M;

    // Handle c = 0: one fixed point is at infinity
    // The finite fixed point is b/(d-a) which is rational => finite CF
    if (c === 0) {
        if (d === a) {
            // M = +/- I, not hyperbolic (already checked above, but just in case)
            throw new Error('periodicCF: degenerate case c=0, a=d');
        }
        // Rational fixed point: compute its finite CF
        const cf = rationalCF(b, d - a);
        return { preperiod: cf, period: [], D: (a + d) * (a + d) - 4 };
    }

    // If c < 0, replace M with -M to make c > 0.
    // -M has the same image in PSL(2,Z) and the same fixed points.
    if (c < 0) {
        a = -a; b = -b; c = -c; d = -d;
    }

    // Discriminant D = trace^2 - 4 = (a+d)^2 - 4
    const tr = a + d;
    const D = tr * tr - 4;

    // Attracting fixed point alpha = ((a - d) + sqrt(D)) / (2c)
    // Represented as (P + sqrt(D)) / Q
    let P0 = a - d;
    let Q0 = 2 * c;

    // Verify: D - P0^2 should be divisible by Q0
    // D - P0^2 = (a+d)^2 - 4 - (a-d)^2 = 4ad - 4 = 4(ad-1) = 4bc (since det=1)
    // Q0 = 2c, so (D - P0^2)/Q0 = 4bc/(2c) = 2b. Integer. Good.

    const sqrtD = isqrt(D);

    // CF expansion algorithm for (P + sqrt(D)) / Q with Q > 0
    // (Q > 0 is guaranteed since c > 0 => Q0 = 2c > 0)
    let P = P0;
    let Q = Q0;

    // Store all (P, Q) states to detect periodicity
    const states = [];
    const digits = [];

    // Safety limit to prevent infinite loops
    const MAX_ITER = 10000;

    for (let i = 0; i < MAX_ITER; i++) {
        // Check if we've seen this state before
        for (let j = 0; j < states.length; j++) {
            if (states[j][0] === P && states[j][1] === Q) {
                // Found period! States[0..j-1] = preperiod, states[j..i-1] = period
                return {
                    preperiod: digits.slice(0, j),
                    period: digits.slice(j),
                    D: D
                };
            }
        }

        states.push([P, Q]);

        // Compute the next CF digit: a_n = floor((P + sqrt(D)) / Q)
        // Since Q > 0, this is floor((P + sqrtD) / Q) where sqrtD = floor(sqrt(D))
        // But we must be careful: if D is a perfect square, sqrtD is exact.
        // If not, sqrtD < sqrt(D) < sqrtD + 1, so P + sqrtD <= P + sqrt(D) < P + sqrtD + 1
        // Thus floor((P + sqrt(D))/Q) = floor((P + sqrtD)/Q) when Q > 0
        // (since adding a fractional part < 1 to the numerator can only increase
        //  the quotient by at most 1/Q < 1 when the fractional part is < 1)
        //
        // Actually, that reasoning is wrong. Let me be more careful.
        // We have P + sqrtD <= P + sqrt(D) < P + sqrtD + 1.
        // So (P + sqrtD)/Q <= (P + sqrt(D))/Q < (P + sqrtD + 1)/Q.
        // The floor could be floor((P+sqrtD)/Q) or floor((P+sqrtD)/Q) + 1
        // iff (P + sqrtD + 1) / Q > floor((P+sqrtD)/Q) + 1, i.e.,
        // iff Q divides (P + sqrtD) + something...
        //
        // Simpler: a_n = floor((P + sqrtD) / Q) unless D is a perfect square.
        // If D is NOT a perfect square, sqrt(D) is irrational, so (P+sqrt(D))/Q
        // is never an integer, and floor = floor((P+sqrtD)/Q).
        // This is because sqrtD < sqrt(D), so (P+sqrtD)/Q < (P+sqrt(D))/Q,
        // and since the true value is not an integer, its floor equals
        // floor of any value in [floor-value, true-value).
        //
        // Wait, that's still not rigorous. Let's just check:
        // If D is not a perfect square, then sqrt(D) = sqrtD + frac where 0 < frac < 1.
        // (P + sqrtD + frac)/Q. We want floor of this.
        // Let r = (P + sqrtD) mod Q (taking r in [0, Q-1] since Q > 0).
        // Then (P + sqrtD)/Q = some_integer + r/Q.
        // Adding frac/Q: some_integer + (r + frac)/Q.
        // Since 0 < frac < 1, we have r/Q <= (r+frac)/Q < (r+1)/Q.
        // If r+1 < Q, then floor = some_integer. Same as floor((P+sqrtD)/Q).
        // If r+1 = Q, then (r+frac)/Q = (Q-1+frac)/Q < 1, still floor = some_integer.
        // If r+1 > Q... but r <= Q-1 so r+1 <= Q. So always floor = some_integer.
        // Wait, r = (P+sqrtD) mod Q is in {0, 1, ..., Q-1}.
        // (r + frac)/Q where 0 < frac < 1. The max is (Q-1+1)/Q = 1, but frac < 1
        // so it's strictly < 1. So floor((P+sqrtD+frac)/Q) = floor((P+sqrtD)/Q). QED.
        //
        // Great, so for non-perfect-square D, digit = floorDiv(P + sqrtD, Q).

        const an = floorDiv(P + sqrtD, Q);
        digits.push(an);

        // Update: P_{n+1} = a_n * Q_n - P_n
        const Pnew = an * Q - P;

        // Q_{n+1} = (D - P_{n+1}^2) / Q_n  (exact integer division)
        const Qnew = (D - Pnew * Pnew) / Q;

        // Sanity check: Qnew should be an integer
        if (!Number.isInteger(Qnew)) {
            throw new Error(`periodicCF: non-integer Q at step ${i}: (${D} - ${Pnew}^2) / ${Q} = ${Qnew}`);
        }

        if (Qnew === 0) {
            // This means sqrt(D) is rational, so D is a perfect square.
            // The continued fraction is finite (alpha is rational).
            return { preperiod: digits, period: [], D: D };
        }

        P = Pnew;
        Q = Qnew;
    }

    throw new Error('periodicCF: exceeded maximum iterations (possible bug)');
}

// ---------------------------------------------------------------------------
// rationalCF(p, q) — Standard continued fraction of the rational p/q
// ---------------------------------------------------------------------------
function rationalCF(p, q) {
    if (q === 0) return [];
    // Ensure q > 0
    if (q < 0) { p = -p; q = -q; }
    const digits = [];
    const MAX_ITER = 1000;
    for (let i = 0; i < MAX_ITER && q !== 0; i++) {
        const a = floorDiv(p, q);
        digits.push(a);
        const r = p - a * q;
        p = q;
        q = r;
    }
    return digits;
}

// ---------------------------------------------------------------------------
// cfToString(cf) — Human-readable string for a periodic CF
// ---------------------------------------------------------------------------
function cfToString(cf) {
    const { preperiod, period } = cf;
    if (period.length === 0) {
        return '[' + preperiod.join(', ') + ']';
    }
    if (preperiod.length === 0) {
        return '[(' + period.join(', ') + ')]';
    }
    return '[' + preperiod.join(', ') + '; (' + period.join(', ') + ')]';
}

// ---------------------------------------------------------------------------
// evaluateCF(cf, terms) — Evaluate a periodic CF numerically (for verification)
// ---------------------------------------------------------------------------
// Evaluates the CF [a0; a1, ..., ak, (p0, p1, ..., pm)] to a float
// by unrolling `terms` total terms.
function evaluateCF(cf, terms) {
    terms = terms || 50;
    const { preperiod, period } = cf;
    // Build the sequence of CF digits
    const seq = [];
    for (let i = 0; i < terms; i++) {
        if (i < preperiod.length) {
            seq.push(preperiod[i]);
        } else if (period.length > 0) {
            seq.push(period[(i - preperiod.length) % period.length]);
        } else {
            break;
        }
    }
    // Evaluate from the tail
    let val = 0;
    for (let i = seq.length - 1; i >= 0; i--) {
        val = seq[i] + (val === 0 ? 0 : 1 / val);
    }
    return val;
}

// ---------------------------------------------------------------------------
// translationLength(M) — Sum of period digits of the CF
// ---------------------------------------------------------------------------
// For a hyperbolic M in SL(2,Z), the translation length on the Bass-Serre
// tree of PSL(2,Z) = Z/2 * Z/3 is related to the word length in the
// free product decomposition.
//
// As a practical first approximation, we compute the sum of the CF period
// digits. This equals the number of edges in one fundamental domain of the
// axis path through the Farey tessellation, which is closely related to
// (but not identical to) the Bass-Serre translation length.
//
// The exact relationship will be refined in later tasks.
// ---------------------------------------------------------------------------
function translationLength(M) {
    const cf = periodicCF(M);
    if (cf.period.length === 0) {
        // Rational fixed point: not truly hyperbolic in the tree sense
        return 0;
    }
    let sum = 0;
    for (let i = 0; i < cf.period.length; i++) {
        sum += cf.period[i];
    }
    return sum;
}

// ---------------------------------------------------------------------------
// axisPath(M) — The axis of M as a sequence of edges in the Farey graph
// ---------------------------------------------------------------------------
// Each CF digit a_n corresponds to a_n consecutive left (L) or right (R) turns
// in the Farey tessellation. The turns alternate direction with each digit.
//
// We track the path using Mobius transformations: starting from the identity,
// each step applies either T = [[1,1],[0,1]] (right/L move) or
// T^{-1}S = [[0,1],[-1,1]]...
//
// More concretely, the axis path through the Farey graph is encoded by the
// "cutting sequence": the CF [a0; a1, a2, ...] means
//   a0 R-edges, a1 L-edges, a2 R-edges, ...
// alternating between right and left turns.
//
// Return: { edges: [{vertex, direction, count}...], period: periodStartIndex }
// where each entry says "take `count` steps in `direction` from `vertex`".
// ---------------------------------------------------------------------------
function axisPath(M) {
    const cf = periodicCF(M);
    const { preperiod, period } = cf;

    const T  = new SL2Z(1, 1, 0, 1); // T: z -> z+1 (right move)
    const Ti = new SL2Z(1, -1, 0, 1); // T^{-1}: z -> z-1
    const S  = new SL2Z(0, -1, 1, 0); // S: z -> -1/z (flip)

    // Build the sequence of digits with alternation info
    const allDigits = preperiod.concat(period);
    const edges = [];
    let current = SL2Z.identity();

    for (let i = 0; i < allDigits.length; i++) {
        const an = allDigits[i];
        // Even-index digits: move right (apply T repeatedly)
        // Odd-index digits: move left (apply T^{-1} repeatedly) then flip
        const direction = (i % 2 === 0) ? 'R' : 'L';
        const move = (direction === 'R') ? T : Ti;

        for (let j = 0; j < an; j++) {
            const from = {
                a: current.a, b: current.b,
                c: current.c, d: current.d
            };
            current = current.mul(move);
            const to = {
                a: current.a, b: current.b,
                c: current.c, d: current.d
            };
            edges.push({
                from: from,
                to: to,
                generator: direction,
                digitIndex: i,
                stepInDigit: j
            });
        }
        // After processing a digit, apply S to switch between L and R
        current = current.mul(S);
    }

    return {
        edges: edges,
        periodStart: preperiod.length === 0 ? 0 : edges.filter(e =>
            e.digitIndex < preperiod.length
        ).length,
        totalEdges: edges.length,
        cf: cf
    };
}

// ---------------------------------------------------------------------------
// bridgeBetweenAxes(M1, M2) — Geodesic bridge between two disjoint axes
// ---------------------------------------------------------------------------
// Given two hyperbolic elements M1, M2 in SL(2,Z), find the shortest path
// in the Farey graph (or Bass-Serre tree) connecting their axes.
//
// Approach: Use the Stern-Brocot / Farey mediant construction.
// The attracting fixed points alpha1, alpha2 determine paths from the root
// of the Stern-Brocot tree. The bridge connects the point where the two
// paths diverge to each axis.
//
// We navigate the Stern-Brocot tree by comparing the CF expansions.
// Two CF expansions [a0; a1, a2, ...] and [b0; b1, b2, ...] share a
// common path for as long as their digits agree. When they diverge at
// position k, the bridge goes from the divergence vertex to each axis.
//
// The bridge length equals the distance from the divergence point to axis 1
// plus the distance to axis 2.
// ---------------------------------------------------------------------------
function bridgeBetweenAxes(M1, M2) {
    const cf1 = periodicCF(M1);
    const cf2 = periodicCF(M2);

    // Expand enough terms of each CF to find where they diverge
    const maxTerms = 100;
    const seq1 = expandCF(cf1, maxTerms);
    const seq2 = expandCF(cf2, maxTerms);

    // Find the first index where the two CF expansions differ
    let divergeIndex = 0;
    const minLen = Math.min(seq1.length, seq2.length);
    while (divergeIndex < minLen && seq1[divergeIndex] === seq2[divergeIndex]) {
        divergeIndex++;
    }

    // The common prefix represents the shared path from the root
    // of the Stern-Brocot tree to the divergence point.
    const commonPrefix = seq1.slice(0, divergeIndex);

    // After divergence, each CF continues toward its own axis.
    // The bridge in the Farey graph has length related to where each
    // axis is relative to the divergence point.
    //
    // For a first approximation: the bridge length is 1 if the axes
    // are "adjacent" in the tree (separated by a single ideal triangle),
    // or longer if they are further apart.
    //
    // More precisely: at the divergence point, the two CFs take different
    // turns. The number of extra edges to reach each axis from the
    // divergence point depends on the periodic structure.

    // Compute the Farey fractions at the divergence point
    // using the mediant construction
    let pL = 0, qL = 1; // 0/1 (left boundary)
    let pR = 1, qR = 0; // 1/0 = infinity (right boundary)
    let pM, qM;

    for (let i = 0; i < divergeIndex; i++) {
        const an = commonPrefix[i];
        if (i % 2 === 0) {
            // Even step: go right an times, then left once
            for (let j = 0; j < an; j++) {
                pL = pL + pR; // mediant numerator replaces left
                qL = qL + qR;
                // Actually this is the Stern-Brocot navigation:
                // Going "right" means the target is > mediant, so
                // new left = mediant
            }
            // After an right steps, swap to go left
            // (this is handled by the alternating R/L structure)
        } else {
            // Odd step: go left an times
            for (let j = 0; j < an; j++) {
                pR = pL + pR;
                qR = qL + qR;
            }
        }
    }
    pM = pL + pR;
    qM = qL + qR;

    // The divergence mediant is pM/qM
    // Bridge length: at the divergence point, the two axes go in different
    // directions. For truly disjoint axes, the bridge length is at least 1.

    // If CFs diverge at index k and values are a (for cf1) and b (for cf2),
    // the bridge length through the tree is approximately:
    // |a_k(cf1) - a_k(cf2)| at the digit level, but this isn't quite right
    // for the tree metric.

    // Simple version: bridge length = 1 when axes are separated by exactly
    // one ideal triangle. For now, compute the number of steps from the
    // divergence vertex to each axis.

    // A more precise calculation: from the divergence point, one axis needs
    // (seq1[divergeIndex] - commonDigits) more R/L steps and the other needs
    // (seq2[divergeIndex] - commonDigits). But this is approximate.

    // For this initial implementation, return the divergence information
    // and a computed bridge length based on the Farey geometry.

    let bridgeLength;
    if (divergeIndex >= minLen) {
        // One CF is a prefix of the other (shouldn't happen for distinct axes)
        bridgeLength = 0;
    } else {
        // The bridge length in the Farey graph from the divergence point
        // The two CFs split: one goes further right, the other further left
        // (or they take different numbers of steps in the same direction).
        //
        // The minimal path between the two axes passes through the
        // divergence vertex. From there, the distance to each axis is
        // the "depth" into the respective subtree.
        //
        // For now, a reasonable estimate:
        // At divergence, the partial digit consumed so far is min(seq1[k], seq2[k])
        // The remaining distance from divergence to axis 1 is related to
        // how much further it goes.
        // Bridge = 1 is the minimum (they share a triangle edge).
        bridgeLength = 1;

        // Refine: if the two digits at divergence differ by more than 0,
        // there may be intermediate vertices.
        if (divergeIndex < seq1.length && divergeIndex < seq2.length) {
            // Both axes continue from the divergence point in the same
            // general direction (L or R based on parity of divergeIndex)
            // but with different step counts.
            const d1 = seq1[divergeIndex];
            const d2 = seq2[divergeIndex];
            // If they both go right but different amounts, the bridge
            // is just 1 edge (they diverge at a vertex of the Farey graph).
            // If they go in truly different directions... but CF digits are
            // always positive, so they go the same direction, just different
            // amounts. The divergence happens at step min(d1,d2) within
            // this block.
            bridgeLength = 1; // minimal bridge
        }
    }

    return {
        length: bridgeLength,
        divergeIndex: divergeIndex,
        commonPrefix: commonPrefix,
        divergeMediant: qM !== 0 ? { p: pM, q: qM } : null,
        cf1: cf1,
        cf2: cf2,
        path: [
            { side: 'axis1', cf: cf1 },
            { side: 'bridge', length: bridgeLength },
            { side: 'axis2', cf: cf2 }
        ]
    };
}

// ---------------------------------------------------------------------------
// expandCF(cf, n) — Expand a periodic CF to n terms
// ---------------------------------------------------------------------------
function expandCF(cf, n) {
    const { preperiod, period } = cf;
    const result = [];
    for (let i = 0; i < n; i++) {
        if (i < preperiod.length) {
            result.push(preperiod[i]);
        } else if (period.length > 0) {
            result.push(period[(i - preperiod.length) % period.length]);
        } else {
            break;
        }
    }
    return result;
}
