// Find units in the quaternion algebra (-1, -x; Z[x]) where x = 2cos(2π/7)
// The algebra has basis {1, i, j, k} with i² = -1, j² = -x, ij = k = -ji

class AlgebraicNumber {
    constructor(a0, a1 = 0, a2 = 0) {
        this.coeffs = [a0, a1, a2];
        this.reduce();
    }

    reduce() {
        while (this.coeffs.length > 3) {
            const c = this.coeffs.pop();
            if (this.coeffs.length >= 3) {
                this.coeffs[0] += c;
                this.coeffs[1] += 2 * c;
                this.coeffs[2] -= c;
            }
        }
        while (this.coeffs.length < 3) {
            this.coeffs.push(0);
        }
    }

    add(other) {
        return new AlgebraicNumber(
            this.coeffs[0] + other.coeffs[0],
            this.coeffs[1] + other.coeffs[1],
            this.coeffs[2] + other.coeffs[2]
        );
    }

    multiply(other) {
        const result = [0, 0, 0, 0, 0, 0];
        for (let i = 0; i < 3; i++) {
            for (let j = 0; j < 3; j++) {
                result[i + j] += this.coeffs[i] * other.coeffs[j];
            }
        }

        if (result[3]) {
            result[0] += result[3];
            result[1] += 2 * result[3];
            result[2] -= result[3];
        }
        if (result[4]) {
            result[0] -= result[4];
            result[1] -= result[4];
            result[2] += 3 * result[4];
        }
        if (result[5]) {
            result[0] += 3 * result[5];
            result[1] += 5 * result[5];
            result[2] -= 4 * result[5];
        }

        return new AlgebraicNumber(result[0], result[1], result[2]);
    }

    negate() {
        return new AlgebraicNumber(-this.coeffs[0], -this.coeffs[1], -this.coeffs[2]);
    }

    equals(other) {
        return this.coeffs[0] === other.coeffs[0] &&
               this.coeffs[1] === other.coeffs[1] &&
               this.coeffs[2] === other.coeffs[2];
    }

    toString() {
        const terms = [];
        if (this.coeffs[0] !== 0) terms.push(this.coeffs[0].toString());
        if (this.coeffs[1] !== 0) {
            if (this.coeffs[1] === 1) terms.push('x');
            else if (this.coeffs[1] === -1) terms.push('-x');
            else terms.push(this.coeffs[1] + 'x');
        }
        if (this.coeffs[2] !== 0) {
            if (this.coeffs[2] === 1) terms.push('x²');
            else if (this.coeffs[2] === -1) terms.push('-x²');
            else terms.push(this.coeffs[2] + 'x²');
        }
        if (terms.length === 0) return '0';

        let result = terms[0];
        for (let i = 1; i < terms.length; i++) {
            if (terms[i].startsWith('-')) {
                result += ' - ' + terms[i].substring(1);
            } else {
                result += ' + ' + terms[i];
            }
        }
        return result;
    }
}

// Quaternion class: q = a + bi + cj + dk where i²=-1, j²=-x, k=ij
class Quaternion {
    constructor(a, b, c, d) {
        this.a = a; // scalar part
        this.b = b; // i coefficient
        this.c = c; // j coefficient
        this.d = d; // k = ij coefficient
    }

    // Reduced norm: N(a + bi + cj + dk) = a² + b² + xc² + xd²
    norm() {
        const x = new AlgebraicNumber(0, 1, 0);
        const a_sq = this.a.multiply(this.a);
        const b_sq = this.b.multiply(this.b);
        const c_sq = this.c.multiply(this.c);
        const d_sq = this.d.multiply(this.d);
        const xc_sq = x.multiply(c_sq);
        const xd_sq = x.multiply(d_sq);
        return a_sq.add(b_sq).add(xc_sq).add(xd_sq);
    }

    toString() {
        const parts = [];
        if (this.a.coeffs[0] !== 0 || this.a.coeffs[1] !== 0 || this.a.coeffs[2] !== 0) {
            parts.push(this.a.toString());
        }
        if (this.b.coeffs[0] !== 0 || this.b.coeffs[1] !== 0 || this.b.coeffs[2] !== 0) {
            const b_str = this.b.toString();
            if (b_str === '1') parts.push('i');
            else if (b_str === '-1') parts.push('-i');
            else parts.push('(' + b_str + ')i');
        }
        if (this.c.coeffs[0] !== 0 || this.c.coeffs[1] !== 0 || this.c.coeffs[2] !== 0) {
            const c_str = this.c.toString();
            if (c_str === '1') parts.push('j');
            else if (c_str === '-1') parts.push('-j');
            else parts.push('(' + c_str + ')j');
        }
        if (this.d.coeffs[0] !== 0 || this.d.coeffs[1] !== 0 || this.d.coeffs[2] !== 0) {
            const d_str = this.d.toString();
            if (d_str === '1') parts.push('k');
            else if (d_str === '-1') parts.push('-k');
            else parts.push('(' + d_str + ')k');
        }
        if (parts.length === 0) return '0';

        let result = parts[0];
        for (let i = 1; i < parts.length; i++) {
            if (parts[i].startsWith('-')) {
                result += ' - ' + parts[i].substring(1);
            } else {
                result += ' + ' + parts[i];
            }
        }
        return result;
    }
}

console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log('║      Units of Quaternion Algebra (-1, -x; Z[x])                ║');
console.log('║      where x = 2cos(2π/7)                                        ║');
console.log('╚══════════════════════════════════════════════════════════════════╝\n');

console.log('Quaternion algebra structure:');
console.log('  Basis: {1, i, j, k} where k = ij');
console.log('  Relations: i² = -1, j² = -x, ij = k = -ji\n');

console.log('Reduced norm: N(a + bi + cj + dk) = a² + b² + xc² + xd²\n');
console.log('A quaternion is a UNIT if N(q) = 1\n');

console.log('This is equivalent to finding solutions to:');
console.log('  a² + b² + xc² + xd² = 1  where a,b,c,d ∈ Z[x]\n');

const range = 2;
const one = new AlgebraicNumber(1, 0, 0);
const units = [];

console.log(`Searching coefficient range: [${-range}, ${range}]`);
console.log('(This is computationally intensive...)\n');

let count = 0;
const total = Math.pow(2*range + 1, 12); // 4 quaternion components × 3 coefficients each

for (let a0 = -range; a0 <= range; a0++) {
    for (let a1 = -range; a1 <= range; a1++) {
        for (let a2 = -range; a2 <= range; a2++) {
            const a = new AlgebraicNumber(a0, a1, a2);

            for (let b0 = -range; b0 <= range; b0++) {
                for (let b1 = -range; b1 <= range; b1++) {
                    for (let b2 = -range; b2 <= range; b2++) {
                        const b = new AlgebraicNumber(b0, b1, b2);

                        for (let c0 = -range; c0 <= range; c0++) {
                            for (let c1 = -range; c1 <= range; c1++) {
                                for (let c2 = -range; c2 <= range; c2++) {
                                    const c = new AlgebraicNumber(c0, c1, c2);

                                    for (let d0 = -range; d0 <= range; d0++) {
                                        for (let d1 = -range; d1 <= range; d1++) {
                                            for (let d2 = -range; d2 <= range; d2++) {
                                                const d = new AlgebraicNumber(d0, d1, d2);
                                                const q = new Quaternion(a, b, c, d);
                                                const norm = q.norm();

                                                if (norm.equals(one)) {
                                                    units.push(q);
                                                    count++;
                                                }
                                            }
                                        }
                                    }
                                }
                            }
                        }
                    }
                }
            }
        }
    }
}

console.log(`Found ${units.length} units!\n`);

console.log('═'.repeat(70));
console.log('UNITS FOUND');
console.log('═'.repeat(70));

if (units.length > 0) {
    // Categorize by type
    const trivial = units.filter(q =>
        (q.a.equals(one) || q.a.equals(one.negate())) &&
        q.b.equals(new AlgebraicNumber(0)) &&
        q.c.equals(new AlgebraicNumber(0)) &&
        q.d.equals(new AlgebraicNumber(0))
    );

    const imaginary = units.filter(q =>
        q.a.equals(new AlgebraicNumber(0)) &&
        (q.b.equals(one) || q.b.equals(one.negate()) ||
         q.c.equals(one) || q.c.equals(one.negate()) ||
         q.d.equals(one) || q.d.equals(one.negate()))
    );

    const nontrivial = units.filter(q => !trivial.includes(q) && !imaginary.includes(q));

    console.log(`\nTrivial units (±1): ${trivial.length}`);
    trivial.forEach(q => console.log(`  ${q.toString()}`));

    console.log(`\nPure imaginary units (±i, ±j, ±k): ${imaginary.length}`);
    imaginary.forEach(q => console.log(`  ${q.toString()}`));

    console.log(`\nNon-trivial units: ${nontrivial.length}`);
    nontrivial.slice(0, 20).forEach((q, i) => {
        console.log(`  ${i+1}. ${q.toString()}`);
        const norm = q.norm();
        console.log(`     Norm: ${norm.toString()}`);
    });

    if (nontrivial.length > 20) {
        console.log(`  ... and ${nontrivial.length - 20} more`);
    }
}

console.log('\n' + '═'.repeat(70));
console.log('ANALYSIS');
console.log('═'.repeat(70));
console.log('\nThe quaternion algebra (-1, -x; Z[x]) is related to:');
console.log('- The hyperbolic space H³');
console.log('- Kleinian groups and 3-manifolds');
console.log('- The units form a discrete subgroup of SL(2,ℂ)');
console.log('\nThe norm form a² + b² + xc² + xd² = 1 determines the unit group.');
console.log('This is similar to a² + xb² = 1, which had infinitely many solutions!');
console.log('\nExpected: The unit group should be infinite with interesting structure.');
console.log('═'.repeat(70));
