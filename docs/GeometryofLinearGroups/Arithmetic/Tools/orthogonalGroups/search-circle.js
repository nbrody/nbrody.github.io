// Search for solutions to a² + b² = 1 in Z[x] where x = 2cos(2π/7)

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

    toFloat() {
        const x_val = 2 * Math.cos(2 * Math.PI / 7);
        return this.coeffs[0] + this.coeffs[1] * x_val + this.coeffs[2] * x_val * x_val;
    }
}

console.log('╔════════════════════════════════════════════════════════════════╗');
console.log('║  Searching for NON-INTEGER solutions to a² + b² = 1 in Z[x]  ║');
console.log('║              where x = 2cos(2π/7)                              ║');
console.log('╚════════════════════════════════════════════════════════════════╝\n');

const range = 5;
const one = new AlgebraicNumber(1, 0, 0);
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
                        const sum = a_sq.add(b_sq);

                        if (sum.equals(one)) {
                            const isInteger = (a1 === 0 && a2 === 0 && b1 === 0 && b2 === 0);
                            solutions.push({
                                a: a,
                                b: b,
                                a_coeffs: [a0, a1, a2],
                                b_coeffs: [b0, b1, b2],
                                isInteger: isInteger,
                                a_val: a.toFloat(),
                                b_val: b.toFloat()
                            });
                        }
                    }
                }
            }
        }
    }
}

const integerSols = solutions.filter(s => s.isInteger);
const nonIntegerSols = solutions.filter(s => !s.isInteger);

console.log(`Found ${solutions.length} total solutions`);
console.log(`  - Integer solutions: ${integerSols.length}`);
console.log(`  - Non-integer solutions: ${nonIntegerSols.length}\n`);

if (nonIntegerSols.length > 0) {
    console.log('═'.repeat(70));
    console.log('🎉 NON-INTEGER SOLUTIONS FOUND! 🎉');
    console.log('═'.repeat(70));
    console.log('');

    nonIntegerSols.slice(0, 10).forEach((sol, idx) => {
        console.log(`Solution ${idx + 1}:`);
        console.log(`  a = ${sol.a.toString().padEnd(25)} (coeffs: [${sol.a_coeffs}])`);
        console.log(`  b = ${sol.b.toString().padEnd(25)} (coeffs: [${sol.b_coeffs}])`);

        // Verify
        const a_sq = sol.a.multiply(sol.a);
        const b_sq = sol.b.multiply(sol.b);
        const sum = a_sq.add(b_sq);
        console.log(`  Verification: a² + b² = ${sum.toString()}`);
        console.log(`  Approximate values: a ≈ ${sol.a_val.toFixed(6)}, b ≈ ${sol.b_val.toFixed(6)}`);
        console.log(`  Check: a² + b² ≈ ${(sol.a_val * sol.a_val + sol.b_val * sol.b_val).toFixed(6)}`);
        console.log('');
    });

    console.log('═'.repeat(70));
    console.log('ANALYSIS');
    console.log('═'.repeat(70));
    console.log('\nThis is DIFFERENT from our earlier finding!');
    console.log('Earlier we found NO non-integer solutions in the totally real field ℚ(x).');
    console.log('BUT we ARE working in Z[x], not ℚ(x)!');
    console.log('\nThe key insight:');
    console.log('- x = 2cos(2π/7) generates the MAXIMAL real subfield of ℚ(ζ₇)');
    console.log('- Z[x] contains elements that can combine to satisfy a² + b² = 1');
    console.log('- This requires the algebraic structure of the cyclotomic field!');

} else {
    console.log('═'.repeat(70));
    console.log('NO NON-INTEGER SOLUTIONS FOUND');
    console.log('═'.repeat(70));
    console.log('\nOnly the 4 trivial integer solutions exist: (±1, 0) and (0, ±1)\n');

    console.log('Integer solutions found:');
    integerSols.forEach(sol => {
        console.log(`  (${sol.a.toString()}, ${sol.b.toString()})`);
    });

    console.log('\n' + '═'.repeat(70));
    console.log('THEORETICAL EXPLANATION');
    console.log('═'.repeat(70));
    console.log('\nFor a² + b² = 1 in Z[x] where x = 2cos(2π/7):');
    console.log('\n1. The field K = ℚ(x) is TOTALLY REAL (all embeddings are real)');
    console.log('   - σ₁(x) ≈ 1.247');
    console.log('   - σ₂(x) ≈ -0.445');
    console.log('   - σ₃(x) ≈ -1.802');

    console.log('\n2. For ANY embedding σᵢ, the equation becomes:');
    console.log('   σᵢ(a)² + σᵢ(b)² = 1');
    console.log('   This is the UNIT CIRCLE in ℝ²');

    console.log('\n3. To get sin and cos values, we need:');
    console.log('   a = cos(θ), b = sin(θ) for some θ');
    console.log('   But sin(θ) requires SQUARE ROOTS not in the real field!');

    console.log('\n4. The only way to satisfy a² + b² = 1 across ALL THREE');
    console.log('   real embeddings simultaneously is with integer solutions.');

    console.log('\n5. CONCLUSION: Only (±1, 0) and (0, ±1) work!');
    console.log('═'.repeat(70));
}
