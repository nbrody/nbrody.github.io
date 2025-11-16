// Find generators for the unit group of (-1, -x; Z[x])

class AlgebraicNumber {
    constructor(a0, a1 = 0, a2 = 0) {
        this.coeffs = [a0, a1, a2];
        this.reduce();
    }
    reduce() {
        while (this.coeffs.length > 3) {
            const c = this.coeffs.pop();
            if (this.coeffs.length >= 3) {
                this.coeffs[0] += c; this.coeffs[1] += 2 * c; this.coeffs[2] -= c;
            }
        }
        while (this.coeffs.length < 3) this.coeffs.push(0);
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
        if (result[3]) { result[0] += result[3]; result[1] += 2 * result[3]; result[2] -= result[3]; }
        if (result[4]) { result[0] -= result[4]; result[1] -= result[4]; result[2] += 3 * result[4]; }
        if (result[5]) { result[0] += 3 * result[5]; result[1] += 5 * result[5]; result[2] -= 4 * result[5]; }
        return new AlgebraicNumber(result[0], result[1], result[2]);
    }
    negate() { return new AlgebraicNumber(-this.coeffs[0], -this.coeffs[1], -this.coeffs[2]); }
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
            if (terms[i].startsWith('-')) result += ' - ' + terms[i].substring(1);
            else result += ' + ' + terms[i];
        }
        return result;
    }
    toFloat() {
        const x_val = 2 * Math.cos(2 * Math.PI / 7);
        return this.coeffs[0] + this.coeffs[1] * x_val + this.coeffs[2] * x_val * x_val;
    }
}

class Quaternion {
    constructor(a, b, c, d) {
        this.a = a; this.b = b; this.c = c; this.d = d;
    }

    // Quaternion multiplication
    multiply(other) {
        // (a + bi + cj + dk)(a' + b'i + c'j + d'k)
        // Using i²=-1, j²=-x, k=ij, ij=-ji
        const x = new AlgebraicNumber(0, 1, 0);

        // Scalar part: aa' - bb' - xcc' - xdd'
        const scalar = this.a.multiply(other.a)
            .add(this.b.multiply(other.b).negate())
            .add(x.multiply(this.c.multiply(other.c)).negate())
            .add(x.multiply(this.d.multiply(other.d)).negate());

        // i part: ab' + ba' + xcd' - xdc'
        const i_part = this.a.multiply(other.b)
            .add(this.b.multiply(other.a))
            .add(x.multiply(this.c.multiply(other.d)))
            .add(x.multiply(this.d.multiply(other.c)).negate());

        // j part: ac' - bc'd + ca' + db'x
        const j_part = this.a.multiply(other.c)
            .add(this.b.multiply(other.d).negate())
            .add(this.c.multiply(other.a))
            .add(this.d.multiply(other.b));

        // k part: ad' + bc' - cb' + da'
        const k_part = this.a.multiply(other.d)
            .add(this.b.multiply(other.c))
            .add(this.c.multiply(other.b).negate())
            .add(this.d.multiply(other.a));

        return new Quaternion(scalar, i_part, j_part, k_part);
    }

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

    // Compute logarithmic height under the three embeddings
    logHeight() {
        const embeddings = [
            2 * Math.cos(2 * Math.PI / 7),
            2 * Math.cos(4 * Math.PI / 7),
            2 * Math.cos(6 * Math.PI / 7)
        ];

        const norms = embeddings.map(x_i => {
            const a_i = this.a.coeffs[0] + this.a.coeffs[1] * x_i + this.a.coeffs[2] * x_i * x_i;
            const b_i = this.b.coeffs[0] + this.b.coeffs[1] * x_i + this.b.coeffs[2] * x_i * x_i;
            const c_i = this.c.coeffs[0] + this.c.coeffs[1] * x_i + this.c.coeffs[2] * x_i * x_i;
            const d_i = this.d.coeffs[0] + this.d.coeffs[1] * x_i + this.d.coeffs[2] * x_i * x_i;
            return Math.sqrt(a_i * a_i + b_i * b_i + Math.abs(x_i) * (c_i * c_i + d_i * d_i));
        });

        return Math.log(Math.max(...norms));
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
            if (parts[i].startsWith('-')) result += ' - ' + parts[i].substring(1);
            else result += ' + ' + parts[i];
        }
        return result;
    }

    equals(other) {
        return this.a.equals(other.a) && this.b.equals(other.b) &&
               this.c.equals(other.c) && this.d.equals(other.d);
    }
}

console.log('╔══════════════════════════════════════════════════════════════════╗');
console.log('║          Finding Generators for Unit Group                      ║');
console.log('║              (-1, -x; Z[x])                                      ║');
console.log('╚══════════════════════════════════════════════════════════════════╝\n');

console.log('Strategy: Find smallest units and check if they generate others\n');

// Find all units in range ±2
const range = 2;
const one = new AlgebraicNumber(1, 0, 0);
const zero = new AlgebraicNumber(0, 0, 0);
const units = [];

console.log('Searching for units...');

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

console.log(`Found ${units.length} units\n`);

// Compute logarithmic heights and sort
const unitsWithHeights = units.map(u => ({ unit: u, height: u.logHeight() }));
unitsWithHeights.sort((a, b) => a.height - b.height);

// Filter out trivial torsion (±1, ±i)
const nonTrivial = unitsWithHeights.filter(u => u.height > 0.01);

console.log('═'.repeat(70));
console.log('CANDIDATE FUNDAMENTAL UNITS (smallest by logarithmic height)');
console.log('═'.repeat(70));
console.log('');

for (let i = 0; i < Math.min(15, nonTrivial.length); i++) {
    const u = nonTrivial[i];
    console.log(`${i + 1}. ${u.unit.toString()}`);
    console.log(`   Log height: ${u.height.toFixed(6)}`);
    console.log(`   Norm: ${u.unit.norm().toString()}`);
    console.log('');
}

console.log('═'.repeat(70));
console.log('ANALYSIS OF SMALLEST UNITS');
console.log('═'.repeat(70));

if (nonTrivial.length >= 3) {
    const u1 = nonTrivial[0].unit;
    const u2 = nonTrivial[1].unit;
    const u3 = nonTrivial[2].unit;

    console.log('\nThree smallest non-trivial units:');
    console.log(`u₁ = ${u1.toString()}`);
    console.log(`u₂ = ${u2.toString()}`);
    console.log(`u₃ = ${u3.toString()}`);

    // Check if they're related
    console.log('\nTesting if u₂ = u₁²:');
    const u1_squared = u1.multiply(u1);
    console.log(`u₁² = ${u1_squared.toString()}`);
    console.log(`Equal to u₂? ${u1_squared.equals(u2)}`);

    // Check ratios of log heights
    console.log('\nLog height ratios:');
    console.log(`h(u₂)/h(u₁) = ${(nonTrivial[1].height / nonTrivial[0].height).toFixed(3)}`);
    console.log(`h(u₃)/h(u₁) = ${(nonTrivial[2].height / nonTrivial[0].height).toFixed(3)}`);
}

console.log('\n' + '═'.repeat(70));
console.log('TORSION ELEMENTS');
console.log('═'.repeat(70));

const torsion = unitsWithHeights.filter(u => u.height < 0.01);
console.log(`\nFound ${torsion.length} torsion elements:`);
torsion.forEach(t => console.log(`  ${t.unit.toString()}`));

console.log('\n' + '═'.repeat(70));
console.log('GROUP STRUCTURE HYPOTHESIS');
console.log('═'.repeat(70));

console.log('\nBased on the totally real cubic field ℚ(x):');
console.log('- 3 real embeddings → embeddings into PSL(2,ℝ)³');
console.log('- Signature analysis for the norm form a² + b² + xc² + xd²');
console.log('\nThe three embeddings of x:');
const x1 = 2 * Math.cos(2 * Math.PI / 7);
const x2 = 2 * Math.cos(4 * Math.PI / 7);
const x3 = 2 * Math.cos(6 * Math.PI / 7);
console.log(`  σ₁(x) = ${x1.toFixed(6)} > 0`);
console.log(`  σ₂(x) = ${x2.toFixed(6)} < 0`);
console.log(`  σ₃(x) = ${x3.toFixed(6)} < 0`);

console.log('\nFor the norm form a² + b² + xc² + xd²:');
console.log(`  Under σ₁: Signature (2,2) - indefinite`);
console.log(`  Under σ₂: Signature (4,0) or (2,2) depending on xc²+xd² sign`);
console.log(`  Under σ₃: Signature (4,0) or (2,2) depending on xc²+xd² sign`);

console.log('\nExpected rank: Likely 2 or 3 based on signature analysis');
console.log('Unit group structure: (torsion) × ℤʳ where r is the rank');

console.log('\n═'.repeat(70));
console.log('PROPOSED GENERATORS');
console.log('═'.repeat(70));

if (nonTrivial.length >= 3) {
    console.log('\nBased on log heights, candidate generators:');
    console.log(`g₁ = ${nonTrivial[0].unit.toString()}`);
    console.log(`g₂ = ${nonTrivial[1].unit.toString()}`);
    console.log(`g₃ = ${nonTrivial[2].unit.toString()}`);
    console.log('\nTorsion: {±1, ±i}');
    console.log('\nThese generators would give a presentation:');
    console.log('Unit group ≅ (ℤ/4ℤ) × ℤ^r  where r ≈ 2 or 3');
}

console.log('═'.repeat(70));
