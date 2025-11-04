// Quick test to search for solutions to a² + xb² = 1
// Run with: node test-search.js

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

console.log('Searching for solutions to a² + xb² = 1 in Z[x]...\n');

const range = 4;
const one = new AlgebraicNumber(1, 0, 0);
const x = new AlgebraicNumber(0, 1, 0);
const solutions = [];

for (let a0 = -range; a0 <= range; a0++) {
    for (let a1 = -range; a1 <= range; a1++) {
        for (let a2 = -range; a2 <= range; a2++) {
            const a = new AlgebraicNumber(a0, a1, a2);
            const a_sq = a.multiply(a);

            for (let b0 = -range; b0 <= range; b0++) {
                for (let b1 = -range; b1 <= range; b1++) {
                    for (let b2 = -range; b2 <= range; b2++) {
                        const b = new AlgebraicNumber(b0, b1, b2);
                        const b_sq = b.multiply(b);
                        const xb_sq = x.multiply(b_sq);
                        const sum = a_sq.add(xb_sq);

                        if (sum.equals(one)) {
                            const isNonTrivial = !(b0 === 0 && b1 === 0 && b2 === 0);
                            const isNonInteger = !(a1 === 0 && a2 === 0 && b1 === 0 && b2 === 0);

                            if (isNonTrivial && isNonInteger) {
                                solutions.push({ a, b, a_coeffs: [a0, a1, a2], b_coeffs: [b0, b1, b2] });
                            }
                        }
                    }
                }
            }
        }
    }
}

console.log(`Found ${solutions.length} non-trivial, non-integer solutions:\n`);

solutions.slice(0, 10).forEach((sol, idx) => {
    console.log(`Solution ${idx + 1}:`);
    console.log(`  a = ${sol.a.toString()}`);
    console.log(`  b = ${sol.b.toString()}`);
    console.log(`  Coefficients: a = [${sol.a_coeffs}], b = [${sol.b_coeffs}]`);

    // Verify
    const a_sq = sol.a.multiply(sol.a);
    const b_sq = sol.b.multiply(sol.b);
    const xb_sq = x.multiply(b_sq);
    const sum = a_sq.add(xb_sq);
    console.log(`  Verification: a² + xb² = ${sum.toString()}`);
    console.log('');
});

if (solutions.length === 0) {
    console.log('No non-integer solutions found in range ±' + range);
    console.log('Try increasing the range or checking the theory!');
}
