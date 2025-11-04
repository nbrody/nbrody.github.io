// Analytical determination of height-reducing intervals

// p-adic valuation: v_p(n) = highest power of p dividing n
function padicValuation(n, p) {
    if (n === 0) return Infinity;
    let v = 0;
    n = Math.abs(n);
    while (n % p === 0) {
        v++;
        n = n / p;
    }
    return v;
}

// Analyze where a matrix reduces height
function analyzeMatrixPrecise(matrix) {
    // Returns array of region descriptions where height is reduced
    // Each region can have both real and p-adic constraints
    //
    // ALGORITHM:
    // 1. Check for special matrix structures (triangular, diagonal, etc.)
    // 2. For each structure, apply known reduction rules
    // 3. Combine archimedean (real) and p-adic (divisibility) conditions

    const a = matrix.a;
    const b = matrix.b;
    const c = matrix.c;
    const d = matrix.d;

    // Convert fractions to their components
    const aNum = a.num, aDen = a.den;
    const bNum = b.num, bDen = b.den;
    const cNum = c.num, cDen = c.den;
    const dNum = d.num, dDen = d.den;

    const regions = [];

    // For debugging/information
    console.log(`Analyzing matrix [[${aNum}/${aDen}, ${bNum}/${bDen}], [${cNum}/${cDen}, ${dNum}/${dDen}]]`);

    // Matrix [[a,b],[c,d]] takes [p:q] → [ap+bq : cp+dq]
    // Old height: max(|p|, |q|) for gcd(p,q)=1
    // New height: max(|ap+bq|, |cp+dq|) after reducing to lowest terms

    // Special case 1: Upper triangular with c=0, d=1
    if (cNum === 0 && dNum === 1 && dDen === 1) {
        // [p:q] → [ap+bq : q]
        // Height reduces when max(|ap+bq|, |q|) < max(|p|, |q|)

        // If a = 1, b is an integer (denominator analysis)
        if (aNum === 1 && aDen === 1 && bDen === 1) {
            const k = bNum;
            // [p:q] → [p+kq : q]

            if (k > 0) {
                // For p/q < -k, we have p < -kq
                // Old height = max(|p|,|q|) = |p| = -p (since p < -kq < 0)
                // New: p+kq with p+kq < 0 when p < -kq, so |p+kq| = -(p+kq) = -p-kq
                // Need: max(-p-kq, q) < -p
                // -p-kq < -p always ✓
                // q < -p iff p < -q, true when k ≥ 1
                // So reduces when p/q < -k
                regions.push({
                    condition: `$\\frac{p}{q} < -${k}$`,
                    description: `$\\frac{p}{q} < -${k}$`
                });
            } else if (k < 0) {
                // k < 0, so b = -m where m > 0
                // [p:q] → [p-mq : q]
                const m = -k;

                // For p/q > m: p > mq > 0
                // Old height = p, New = max(|p-mq|, q)
                // p-mq can be positive or negative depending on if p > mq
                // When p > mq: |p-mq| = p-mq < p ✓
                // q < p ✓
                // So reduces when p/q > m
                regions.push({
                    condition: `$\\frac{p}{q} > ${m}$`,
                    description: `$\\frac{p}{q} > ${m}$`
                });

                // Also check if it reduces on 0 ≤ p/q < 1
                // Old height = q, New = max(|p-mq|, q)
                // |p-mq| = mq-p (since p < q < mq)
                // Need: max(mq-p, q) < q impossible since mq-p > (m-1)q ≥ q
                // So doesn't reduce here
            }
        }

        // More general: if a has denominator (like a = 1/2)
        if (aDen > 1 && bNum === 0 && bDen === 1) {
            // [p:q] → [p/aDen : q] after reduction
            // This divides p by aDen
            // For height to reduce, need p divisible by aDen and |p|/aDen small enough

            const divisor = aDen;
            const threshold = divisor; // |p/q| > divisor

            regions.push({
                condition: `p \\equiv 0 \\pmod{${divisor}} \\text{ and } |\\frac{p}{q}| > ${threshold}`,
                description: `$p \\equiv 0 \\pmod{${divisor}}$ and $|\\frac{p}{q}| > ${threshold}$`,
                requiresPadicCheck: true,
                prime: divisor,
                minRatio: threshold
            });
        }
    }

    // Special case 2: Lower triangular with a=1, b=0
    if (aNum === 1 && aDen === 1 && bNum === 0 && bDen === 1) {
        // [p:q] → [p : cp+dq]
        // Similar analysis...

        if (dNum === 1 && dDen === 1 && cDen === 1) {
            const k = cNum;

            if (k > 0) {
                // Height reduces when 0 < p/q < 1/k
                regions.push({
                    condition: `$0 < \\frac{p}{q} < \\frac{1}{${k}}$`,
                    description: `$0 < \\frac{p}{q} < \\frac{1}{${k}}$`
                });
            } else if (k < 0) {
                const m = -k;
                regions.push({
                    condition: `$-\\frac{1}{${m}} < \\frac{p}{q} < 0$`,
                    description: `$-\\frac{1}{${m}} < \\frac{p}{q} < 0$`
                });
            }
        }
    }

    // Special case 3: [[1,1],[-1,1]] and similar - uses 2-adic valuation
    if (aNum === 1 && aDen === 1 && bNum === 1 && bDen === 1 &&
        cNum === -1 && cDen === 1 && dNum === 1 && dDen === 1) {
        // [p:q] → [p+q : -p+q]
        // When both p,q are odd, gcd(p+q, -p+q) = 2
        // After reduction: height becomes max(|p+q|/2, |q-p|/2) < max(|p|,|q|)
        regions.push({
            condition: 'both $p$ and $q$ are odd (i.e., $v_2(p) = v_2(q) = 0$)',
            description: '$p \\equiv 1 \\pmod{2}$ and $q \\equiv 1 \\pmod{2}$',
            requiresPadicCheck: true,
            prime: 2
        });
    }

    // Special case 4: [[1,-1],[1,1]] - similar 2-adic condition
    if (aNum === 1 && aDen === 1 && bNum === -1 && bDen === 1 &&
        cNum === 1 && cDen === 1 && dNum === 1 && dDen === 1) {
        // [p:q] → [p-q : p+q]
        // When both p,q are odd, both numerator and denominator are even
        // After dividing by 2, height reduces
        regions.push({
            condition: 'both $p$ and $q$ are odd (i.e., $v_2(p) = v_2(q) = 0$)',
            description: '$p \\equiv 1 \\pmod{2}$ and $q \\equiv 1 \\pmod{2}$',
            requiresPadicCheck: true,
            prime: 2
        });
    }

    // General GCD detection for small primes
    // Check if matrix creates systematic GCDs for certain congruence classes
    const primesToCheck = [2, 3, 5];

    for (const prime of primesToCheck) {
        // Test if both ap+bq and cp+dq are divisible by prime
        // for certain congruence classes of p, q

        // Sample points from each congruence class mod prime
        const testResults = [];

        for (let pMod = 0; pMod < prime; pMod++) {
            for (let qMod = 0; qMod < prime; qMod++) {
                // Skip if both p ≡ q ≡ 0 (not coprime)
                if (pMod === 0 && qMod === 0) continue;

                // Test a few representatives
                let reduces = false;
                for (let k = 1; k <= 3; k++) {
                    const p = pMod + k * prime;
                    const q = qMod + k * prime;
                    if (q === 0) continue;

                    // Check if gcd(p,q) = 1
                    let g = gcd(Math.abs(p), Math.abs(q));
                    if (g !== 1) continue;

                    const pFrac = new Fraction(p, 1);
                    const qFrac = new Fraction(q, 1);
                    const oldH = height(pFrac, qFrac);

                    const [newP, newQ] = matrix.apply(pFrac, qFrac);
                    const newH = height(newP, newQ);

                    if (newH < oldH) {
                        reduces = true;
                        break;
                    }
                }

                if (reduces) {
                    testResults.push({pMod, qMod});
                }
            }
        }

        // Check if there's a pattern
        // Common pattern: all p,q ≡ 1 mod prime
        const allOnes = testResults.every(r => r.pMod === 1 && r.qMod === 1);
        if (allOnes && testResults.length > 0) {
            regions.push({
                condition: `$p \\equiv 1 \\pmod{${prime}}$ and $q \\equiv 1 \\pmod{${prime}}$`,
                description: `$p \\equiv 1 \\pmod{${prime}}$ and $q \\equiv 1 \\pmod{${prime}}$`,
                requiresPadicCheck: true,
                prime: prime
            });
        }
    }

    return regions;
}

// Fallback: use empirical testing when precise analysis is not available
function analyzeMatrix(matrix) {
    // Try precise analysis first
    const preciseRegions = analyzeMatrixPrecise(matrix);

    if (preciseRegions && preciseRegions.length > 0) {
        // Convert to interval format
        return preciseRegions.map(r => ({
            description: r.description,
            requiresPadicCheck: r.requiresPadicCheck,
            prime: r.prime,
            minRatio: r.minRatio
        }));
    }

    // Fallback: empirical testing on standard regions
    const intervals = [];

    const regions = [
        {
            name: 'ltminus1',
            testPoints: [[-3,1], [-5,2], [-7,3], [-9,4], [-11,5], [-13,6], [-15,7]],
            description: '$\\frac{p}{q} < -1$'
        },
        {
            name: 'minus1to0',
            testPoints: [[-1,2], [-1,3], [-1,4], [-2,5], [-1,5], [-2,7], [-3,7]],
            description: '$-1 < \\frac{p}{q} < 0$'
        },
        {
            name: '0to1',
            testPoints: [[0,1], [1,2], [1,3], [1,4], [2,5], [1,5], [2,7], [3,7]],
            description: '$0 \\leq \\frac{p}{q} < 1$'
        },
        {
            name: 'gt1',
            testPoints: [[2,1], [3,1], [5,2], [7,3], [9,4], [11,5], [13,6], [15,7]],
            description: '$\\frac{p}{q} \\geq 1$'
        },
        {
            name: 'infinity',
            testPoints: [[1,0]],
            description: '$\\infty$'
        }
    ];

    for (const region of regions) {
        let reducesCount = 0;

        for (const [pNum, qNum] of region.testPoints) {
            const p = new Fraction(pNum, 1);
            const q = new Fraction(qNum, 1);
            const oldHeight = height(p, q);

            const [newP, newQ] = matrix.apply(p, q);
            const newHeight = height(newP, newQ);

            if (newHeight < oldHeight) {
                reducesCount++;
            }
        }

        if (reducesCount === region.testPoints.length) {
            intervals.push({ description: region.description });
        }
    }

    return intervals;
}
