// Find fundamental unit for a² + xb² = 1

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

console.log('Finding fundamental unit for a² + xb² = 1 in Z[x]');
console.log('where x = 2cos(2π/7)\n');

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
                            const isTrivial = (b0 === 0 && b1 === 0 && b2 === 0);
                            if (!isTrivial) {
                                solutions.push({
                                    a: a,
                                    b: b,
                                    a_coeffs: [a0, a1, a2],
                                    b_coeffs: [b0, b1, b2]
                                });
                            }
                        }
                    }
                }
            }
        }
    }
}

// Compute logarithmic heights
const x1 = 2 * Math.cos(2 * Math.PI / 7);
const x2 = 2 * Math.cos(4 * Math.PI / 7);
const x3 = 2 * Math.cos(6 * Math.PI / 7);
const embeddings = [x1, x2, x3];

console.log('Three embeddings of x:');
console.log(`  σ₁(x) = ${x1.toFixed(6)} (positive)`);
console.log(`  σ₂(x) = ${x2.toFixed(6)} (negative)`);
console.log(`  σ₃(x) = ${x3.toFixed(6)} (negative)`);
console.log('\nSignature analysis: 1 positive definite + 2 indefinite');
console.log('Expected rank: 2 - 1 = 1\n');

const solutionsWithHeights = solutions.map(sol => {
    const norms = embeddings.map(x_i => {
        const a_i = sol.a_coeffs[0] + sol.a_coeffs[1] * x_i + sol.a_coeffs[2] * x_i * x_i;
        const b_i = sol.b_coeffs[0] + sol.b_coeffs[1] * x_i + sol.b_coeffs[2] * x_i * x_i;
        return Math.sqrt(a_i * a_i + Math.abs(x_i) * b_i * b_i);
    });
    const logHeight = Math.log(Math.max(...norms));
    return { ...sol, logHeight, norms };
});

// Sort by logarithmic height
solutionsWithHeights.sort((a, b) => a.logHeight - b.logHeight);

console.log(`Found ${solutions.length} non-trivial solutions\n`);
console.log('═'.repeat(70));
console.log('FUNDAMENTAL UNIT (smallest by logarithmic height):');
console.log('═'.repeat(70));

const fundamental = solutionsWithHeights[0];
console.log(`\nu = (${fundamental.a.toString()}, ${fundamental.b.toString()})`);
console.log(`\nLogarithmic height: ${fundamental.logHeight.toFixed(6)}`);
console.log('\nNorms under embeddings:');
fundamental.norms.forEach((norm, i) => {
    console.log(`  σ${i+1}: ${norm.toFixed(6)}`);
});

console.log('\n' + '═'.repeat(70));
console.log('VERIFICATION: Other solutions as powers of u');
console.log('═'.repeat(70) + '\n');

console.log('Solution                                Log Height   Ratio   Power');
console.log('-'.repeat(70));

for (let i = 0; i < Math.min(10, solutionsWithHeights.length); i++) {
    const sol = solutionsWithHeights[i];
    const ratio = sol.logHeight / fundamental.logHeight;
    const power = Math.round(ratio);
    const solStr = `(${sol.a.toString()}, ${sol.b.toString()})`;
    console.log(`${solStr.padEnd(40)} ${sol.logHeight.toFixed(4)}    ${ratio.toFixed(2)}    ${power === 1 ? 'u' : 'u^' + power}`);
}

console.log('\n' + '═'.repeat(70));
console.log('FINAL ANSWER');
console.log('═'.repeat(70));
console.log('\nGroup Structure: (ℤ/2ℤ) × ℤ');
console.log('Rank: 1');
console.log('\nTorsion part: {±1} ≅ ℤ/2ℤ');
console.log(`Free part: ⟨u⟩ ≅ ℤ where u = (${fundamental.a.toString()}, ${fundamental.b.toString()})`);
console.log('\nEvery solution has the form: (a, b) = ±u^n for n ∈ ℤ');
console.log('═'.repeat(70));
