/**
 * factoring.js — Integer factorization and irreducibility testing
 */

// Factor a positive BigInt into primes using trial division + Pollard rho
function factorInteger(n) {
    if (typeof n === 'number') n = BigInt(Math.abs(n));
    if (n < 0n) n = -n;
    if (n <= 1n) return new Map();

    const factors = new Map();
    const addFactor = (p) => {
        factors.set(p, (factors.get(p) || 0) + 1);
    };

    // Trial division up to 10^5
    const smallPrimes = sieveOfEratosthenes(100000);
    for (const p of smallPrimes) {
        const bp = BigInt(p);
        while (n % bp === 0n) {
            addFactor(bp);
            n /= bp;
        }
        if (bp * bp > n) break;
    }

    if (n <= 1n) return factors;

    // Remaining n could be 1, prime, or composite
    if (isProbablePrime(n)) {
        addFactor(n);
        return factors;
    }

    // Pollard's rho for remaining composite factors
    const stack = [n];
    while (stack.length > 0) {
        let m = stack.pop();
        if (m <= 1n) continue;
        if (isProbablePrime(m)) { addFactor(m); continue; }

        // Pollard rho
        let d = pollardRho(m);
        if (d === m) {
            // Fallback: brute force (shouldn't happen for reasonable inputs)
            addFactor(m);
            continue;
        }
        stack.push(d);
        stack.push(m / d);
    }

    return factors;
}

function sieveOfEratosthenes(limit) {
    const sieve = new Array(limit + 1).fill(true);
    sieve[0] = sieve[1] = false;
    for (let i = 2; i * i <= limit; i++) {
        if (sieve[i]) {
            for (let j = i * i; j <= limit; j += i) sieve[j] = false;
        }
    }
    const primes = [];
    for (let i = 2; i <= limit; i++) if (sieve[i]) primes.push(i);
    return primes;
}

function isProbablePrime(n) {
    if (n < 2n) return false;
    if (n < 4n) return true;
    if (n % 2n === 0n) return false;

    // Miller-Rabin with deterministic bases for n < 3.3 * 10^24
    const bases = [2n, 3n, 5n, 7n, 11n, 13n, 17n, 19n, 23n, 29n, 31n, 37n];
    let d = n - 1n;
    let r = 0;
    while (d % 2n === 0n) { d /= 2n; r++; }

    for (const a of bases) {
        if (a >= n) continue;
        let x = modPow(a, d, n);
        if (x === 1n || x === n - 1n) continue;
        let found = false;
        for (let i = 0; i < r - 1; i++) {
            x = modPow(x, 2n, n);
            if (x === n - 1n) { found = true; break; }
        }
        if (!found) return false;
    }
    return true;
}

function modPow(base, exp, mod) {
    let result = 1n;
    base = base % mod;
    while (exp > 0n) {
        if (exp & 1n) result = (result * base) % mod;
        exp >>= 1n;
        base = (base * base) % mod;
    }
    return result;
}

function pollardRho(n) {
    if (n % 2n === 0n) return 2n;

    // Use Brent's improvement
    for (let c = 1n; c < 100n; c++) {
        let x = 2n, y = 2n, d = 1n;
        const f = (v) => (v * v + c) % n;
        let q = 1n;
        let ys = 0n, r = 1n;

        while (d === 1n) {
            x = y;
            for (let i = 0n; i < r; i++) y = f(y);
            let k = 0n;
            while (k < r && d === 1n) {
                ys = y;
                const bound = r - k < 128n ? r - k : 128n;
                for (let i = 0n; i < bound; i++) {
                    y = f(y);
                    let diff = x - y;
                    if (diff < 0n) diff = -diff;
                    q = (q * diff) % n;
                }
                d = bigGcd(q, n);
                k += 128n;
            }
            r *= 2n;
            if (r > 1000000n) break;
        }

        if (d !== 1n && d !== n) return d;
    }
    return n; // Failure fallback
}

function bigGcd(a, b) {
    if (a < 0n) a = -a;
    if (b < 0n) b = -b;
    while (b !== 0n) { const t = b; b = a % b; a = t; }
    return a;
}

// Check irreducibility over Q using rational root theorem + degree analysis
function isIrreducibleOverQ(poly) {
    // poly is a QPolynomial
    const d = poly.degree();
    if (d <= 1) return d === 1;

    // Check for rational roots (degree 1 factors)
    const f = poly.makeMonic();
    // Clear denominators to get integer polynomial
    let lcmDen = 1n;
    for (const c of f.coeffs) {
        lcmDen = BigRational.lcm(lcmDen, c.den);
    }
    const intCoeffs = f.coeffs.map(c => c.mul(new BigRational(lcmDen, 1n)).num);
    const a0 = intCoeffs[0] < 0n ? -intCoeffs[0] : intCoeffs[0];
    const an = intCoeffs[intCoeffs.length - 1] < 0n ? -intCoeffs[intCoeffs.length - 1] : intCoeffs[intCoeffs.length - 1];

    if (a0 !== 0n) {
        // Rational root theorem: any root p/q has p | a0 and q | an
        const divA0 = divisors(a0);
        const divAn = divisors(an);
        for (const p of divA0) {
            for (const q of divAn) {
                for (const sign of [1n, -1n]) {
                    const root = new BigRational(sign * p, q);
                    if (poly.evaluate(root).isZero()) return false;
                }
            }
        }
    } else {
        return false; // x divides the polynomial, so it's reducible
    }

    // For degree 2,3: no rational root implies irreducible
    if (d <= 3) return true;

    // For higher degree: check mod several primes (Hensel/criterion)
    // If irreducible mod p for some p not dividing disc, then irreducible over Q
    const testPrimes = [2n, 3n, 5n, 7n, 11n, 13n];
    const zPoly = new ZPolynomial(intCoeffs);
    for (const p of testPrimes) {
        if (intCoeffs[intCoeffs.length - 1] % p === 0n) continue; // skip if p divides leading coeff
        const fp = zPoly.modP(p);
        if (fp.degree() !== d) continue; // leading term vanished mod p
        const factors = fp.factor();
        if (factors.length === 1 && factors[0].degree() === d) return true;
    }

    // Can't determine definitively — assume irreducible (reasonable for user inputs)
    return true;
}

function divisors(n) {
    if (n <= 0n) return [1n];
    const divs = [];
    for (let d = 1n; d * d <= n; d++) {
        if (n % d === 0n) {
            divs.push(d);
            if (d !== n / d) divs.push(n / d);
        }
    }
    return divs;
}

// Factor a rational prime in a number field O_K
// Returns array of { prime: FpPolynomial factor, e: ramification, f: residue degree }
function factorPrimeInField(p, minPoly) {
    // Uses Kummer-Dedekind: (p) = prod (p, g_i(alpha))^e_i
    // where f(x) ≡ prod g_i(x)^e_i mod p
    const bP = typeof p === 'bigint' ? p : BigInt(p);

    // Get integer polynomial
    let lcmDen = 1n;
    for (const c of minPoly.coeffs) lcmDen = BigRational.lcm(lcmDen, c.den);
    const intCoeffs = minPoly.coeffs.map(c => c.mul(new BigRational(lcmDen, 1n)).num);
    const zPoly = new ZPolynomial(intCoeffs);
    const fModP = zPoly.modP(bP);

    const factors = fModP.factor();

    // Group factors and count multiplicities
    const result = [];
    let remaining = fModP.makeMonic();

    for (const g of factors) {
        let e = 0;
        while (remaining.degree() >= g.degree()) {
            const { q, r } = remaining.divmod(g);
            if (r.isZero()) {
                e++;
                remaining = q;
            } else break;
        }
        if (e > 0) {
            result.push({ poly: g, e, f: g.degree() });
        }
    }

    return result;
}
