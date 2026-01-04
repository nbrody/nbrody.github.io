/* Rational Arithmetic with BigInt */
const abs = x => x < 0n ? -x : x;
const gcd = (a, b) => { a = abs(a); b = abs(b); while (b) { const t = a % b; a = b; b = t; } return a; };

class Rational {
    constructor(p, q) {
        if (q < 0n) { p = -p; q = -q; }
        const g = gcd(p, q);
        this.p = p / g;
        this.q = q / g;
    }

    toString() {
        if (this.q === 0n) return this.p < 0n ? "-∞" : "∞";
        if (this.q === 1n) return this.p.toString();
        return `${this.p}/${this.q}`;
    }

    isZero() { return this.p === 0n && this.q !== 0n; }
    isInf() { return this.q === 0n; }
    isNegative() { return !this.isInf() && !this.isZero() && (this.p * this.q < 0n); }

    lt(n, m) {
        if (this.isInf()) return this.p < 0n;
        return this.p * m < n * this.q;
    }
    gt(n, m) {
        if (this.isInf()) return this.p > 0n;
        return this.p * m > n * this.q;
    }
    le(n, m) { return !this.gt(n, m); }
    ge(n, m) { return !this.lt(n, m); }

    getHeight() {
        return abs(this.p) > abs(this.q) ? abs(this.p) : abs(this.q);
    }

    getV2(n) {
        if (n === 0n) return 0;
        let count = 0;
        let val = n < 0n ? -n : n;
        while (val > 0n && val % 2n === 0n) {
            val /= 2n;
            count++;
        }
        return count;
    }

    get2AdicHeight() {
        return this.getV2(this.q);
    }
}

const applyS = (r) => new Rational(-r.q, r.p);
const applyA = (r) => new Rational(2n * r.p, r.q);
const applyAi = (r) => new Rational(r.p, 2n * r.q);
const applyX = (r) => new Rational(5n * r.p - 4n * r.q, -r.p + r.q);

function runAlgorithm(p, q, maxSteps) {
    let z = new Rational(p, q);
    const path = [{ p: z.p, q: z.q }];
    let xCount = 0;
    const seen = new Set();

    while (xCount < maxSteps) {
        // 1. Check for termination at the start
        if (z.isInf()) return { status: 'Terminated', xCount, path };

        // 2. Normalize: S and Scaling
        if (z.isNegative() || z.isZero()) {
            z = applyS(z);
            path.push({ p: z.p, q: z.q });
            // If S maps to infinity, we terminate immediately
            if (z.isInf()) return { status: 'Terminated', xCount, path };
        }

        // Scale into (2/3, 4/3)
        let stepsA = 0;
        while (z.le(2n, 3n) && stepsA < 100) {
            z = applyA(z);
            stepsA++;
        }
        while (z.gt(4n, 3n) && stepsA < 100) {
            z = applyAi(z);
            stepsA++;
        }
        if (stepsA >= 100) return { status: 'A-Loop', xCount, path };

        // Update path with normalized value if it changed
        const stateStr = z.toString();
        if (path[path.length - 1].p !== z.p || path[path.length - 1].q !== z.q) {
            path.push({ p: z.p, q: z.q });
        }

        // 3. Cycle Detection (Check before applying X)
        if (seen.has(stateStr)) return { status: 'Cycling', xCount, path };
        seen.add(stateStr);

        // 4. Transform: X
        z = applyX(z);
        xCount++;
        path.push({ p: z.p, q: z.q });

        // Termination check after X (case z=1)
        if (z.isInf()) return { status: 'Terminated', xCount, path };
    }
    return { status: 'Max Reach', xCount, path };
}

function enumRationals(N) {
    const out = [];
    const seen = new Set();
    out.push({ p: 0n, q: 1n }); seen.add("0/1");
    out.push({ p: 1n, q: 0n }); seen.add("1/0");
    for (let height = 1n; height <= BigInt(N); height++) {
        for (let i = -height; i <= height; i++) {
            if (gcd(i, height) === 1n) {
                let k = `${i}/${height}`;
                if (!seen.has(k)) { out.push({ p: i, q: height }); seen.add(k); }
            }
            if (gcd(height, i) === 1n) {
                let k = `${height}/${i}`;
                if (!seen.has(k)) { out.push({ p: height, q: i }); seen.add(k); }
            }
        }
    }
    return out;
}
