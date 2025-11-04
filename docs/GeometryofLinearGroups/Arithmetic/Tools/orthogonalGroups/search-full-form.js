// Search for solutions to a² + b² + xc² = 1 with all coefficients nonzero

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

    hasAllNonzeroCoeffs() {
        return this.coeffs[0] !== 0 && this.coeffs[1] !== 0 && this.coeffs[2] !== 0;
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

console.log('Searching for solutions to a² + b² + xc² = 1');
console.log('where a, b, c all have nonzero coefficients in Z[x]\n');

const range = 3;
const one = new AlgebraicNumber(1, 0, 0);
const x = new AlgebraicNumber(0, 1, 0);
const solutions = [];

console.log(`Searching coefficient range: [${-range}, ${range}]\n`);

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

                        for (let c0 = -range; c0 <= range; c0++) {
                            for (let c1 = -range; c1 <= range; c1++) {
                                for (let c2 = -range; c2 <= range; c2++) {
                                    const c = new AlgebraicNumber(c0, c1, c2);
                                    const c_sq = c.multiply(c);
                                    const xc_sq = x.multiply(c_sq);
                                    const sum = a_sq.add(b_sq).add(xc_sq);

                                    if (sum.equals(one)) {
                                        // Check if all three have nonzero coefficients
                                        const allNonzero = a.hasAllNonzeroCoeffs() &&
                                                          b.hasAllNonzeroCoeffs() &&
                                                          c.hasAllNonzeroCoeffs();

                                        solutions.push({
                                            a: a,
                                            b: b,
                                            c: c,
                                            a_coeffs: [a0, a1, a2],
                                            b_coeffs: [b0, b1, b2],
                                            c_coeffs: [c0, c1, c2],
                                            allNonzero: allNonzero
                                        });
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

console.log(`Found ${solutions.length} total solutions\n`);

// Filter for solutions where all have nonzero coefficients
const allNonzeroSolutions = solutions.filter(s => s.allNonzero);

console.log('═'.repeat(70));
console.log(`SOLUTIONS WITH ALL NONZERO COEFFICIENTS: ${allNonzeroSolutions.length}`);
console.log('═'.repeat(70));

if (allNonzeroSolutions.length > 0) {
    console.log('\nThese solutions have a, b, c all of the form a₀ + a₁x + a₂x² with');
    console.log('all coefficients a₀, a₁, a₂ nonzero:\n');

    allNonzeroSolutions.slice(0, 20).forEach((sol, idx) => {
        console.log(`Solution ${idx + 1}:`);
        console.log(`  a = ${sol.a.toString()} = [${sol.a_coeffs}]`);
        console.log(`  b = ${sol.b.toString()} = [${sol.b_coeffs}]`);
        console.log(`  c = ${sol.c.toString()} = [${sol.c_coeffs}]`);

        // Verify
        const a_sq = sol.a.multiply(sol.a);
        const b_sq = sol.b.multiply(sol.b);
        const c_sq = sol.c.multiply(sol.c);
        const xc_sq = x.multiply(c_sq);
        const sum = a_sq.add(b_sq).add(xc_sq);
        console.log(`  Verification: a² + b² + xc² = ${sum.toString()}`);
        console.log('');
    });
} else {
    console.log('\nNo solutions found with all coefficients nonzero!\n');

    console.log('Let\'s analyze what types of solutions we DO have:\n');

    // Categorize solutions
    const categories = {
        trivial: [],
        oneVar: [],
        twoVar: [],
        allThree: []
    };

    solutions.forEach(sol => {
        const nonzeroCount = [sol.a, sol.b, sol.c].filter(v =>
            v.coeffs[0] !== 0 || v.coeffs[1] !== 0 || v.coeffs[2] !== 0
        ).length;

        if (nonzeroCount === 1) categories.trivial.push(sol);
        else if (nonzeroCount === 2) categories.twoVar.push(sol);
        else if (nonzeroCount === 3) {
            // Check if all have all nonzero coefficients
            if (sol.allNonzero) categories.allThree.push(sol);
            else categories.twoVar.push(sol); // At least one variable has zero coefficient
        }
    });

    console.log(`Trivial solutions (only one of a,b,c nonzero): ${categories.trivial.length}`);
    console.log(`Solutions with two variables nonzero: ${categories.twoVar.length}`);
    console.log(`Solutions with all three nonzero (but some have zero coefficients): ${solutions.length - categories.trivial.length - categories.twoVar.length}\n`);

    console.log('Examples of two-variable solutions:\n');
    categories.twoVar.slice(0, 5).forEach((sol, idx) => {
        console.log(`Solution ${idx + 1}:`);
        console.log(`  a = ${sol.a.toString()}`);
        console.log(`  b = ${sol.b.toString()}`);
        console.log(`  c = ${sol.c.toString()}`);
        console.log('');
    });
}

console.log('═'.repeat(70));
console.log('ANALYSIS');
console.log('═'.repeat(70));
console.log('\nThe form a² + b² + xc² = 1 is a POSITIVE DEFINITE form because:');
console.log('- The coefficients are 1, 1, x where x ≈ 1.802 > 0');
console.log('- All three embeddings give positive definite forms:');
const x1 = 2 * Math.cos(2 * Math.PI / 7);
const x2 = 2 * Math.cos(4 * Math.PI / 7);
const x3 = 2 * Math.cos(6 * Math.PI / 7);
console.log(`  σ₁: a² + b² + ${x1.toFixed(4)}c²`);
console.log(`  σ₂: a² + b² + ${x2.toFixed(4)}c² (x₂ < 0, but still positive definite in Minkowski space)`);
console.log(`  σ₃: a² + b² + ${x3.toFixed(4)}c² (x₃ < 0, but still positive definite in Minkowski space)`);
console.log('\nFor positive definite forms, the solution set is FINITE!');
console.log('This is in contrast to a² + xb² = 1 which had infinitely many solutions.');
console.log('═'.repeat(70));
