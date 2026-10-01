/**
 * Regression: advertised S-ring / Zariski presets of degree ≥ 3 used to throw
 * TypeError in NFElement.mul (reduction wrote past a length-n buffer), and the
 * two-generator preset ℤ[√2,√3] hit a dead `_substituteLinear` call.
 *
 * Run: node docs/GeometryofLinearGroups/Algebraic/Tools/sRingClosure/test_presets.js
 */
import fs from 'fs';
import vm from 'vm';
import path from 'path';
import { fileURLToPath } from 'url';
import assert from 'assert/strict';

const here = path.dirname(fileURLToPath(import.meta.url));

function loadTool(jsDir) {
    const files = [
        'rational.js', 'polynomial.js', 'factoring.js', 'numberField.js',
        'integralBasis.js', 'sRingClosure.js', 'localData.js', 'grobner.js', 'parser.js',
    ].map(f => path.join(jsDir, f));
    const extras = [];
    const alg = path.join(jsDir, 'algebraicGroup.js');
    if (fs.existsSync(alg)) {
        extras.push(
            path.join(jsDir, 'matrixArith.js'),
            alg,
            path.join(jsDir, 'resScalars.js'),
            path.join(jsDir, 'zariskiEngine.js'),
        );
    }
    const code = [...files, ...extras].map(f => fs.readFileSync(f, 'utf8')).join('\n;\n')
        + `
this.QPolynomial = QPolynomial;
this.NumberField = NumberField;
this.BigRational = BigRational;
this.computeSRingClosure = computeSRingClosure;
this.latexToPolynomial = latexToPolynomial;
this.extractVariables = extractVariables;
this.LocalFieldData = LocalFieldData;
this.QMvPoly = QMvPoly;
`;
    const ctx = {
        console, BigInt, Map, Set, Array, Object, Math, JSON,
        Error, TypeError, RangeError, ReferenceError,
        Infinity, NaN, parseInt, parseFloat, isNaN, isFinite,
        String, Number, Boolean,
    };
    ctx.window = ctx;
    vm.createContext(ctx);
    vm.runInContext(code, ctx, { filename: files[0] });
    return ctx;
}

function runPreset(ctx, polys) {
    const polyData = polys.map(p => ({ latex: p, readable: ctx.latexToPolynomial(p) }));
    const vars = [...new Set(polyData.flatMap(p => ctx.extractVariables(p.readable)))];
    const sResult = ctx.computeSRingClosure(polyData, vars);
    const local = new ctx.LocalFieldData(sResult.field, sResult.integralBasis, sResult.invertedPrimes);
    local.compute();
    return sResult;
}

function coeffs(elem) {
    return elem.coeffs.map(c => c.toString());
}

for (const label of ['sRingClosure', 'zariskiClosure']) {
    const ctx = loadTool(path.join(here, label === 'sRingClosure' ? 'js' : '../zariskiClosure/js'));

    // Quadratic still works (first advertised preset).
    {
        const r = runPreset(ctx, ['x_1^2-2']);
        assert.equal(r.field.n, 2, `${label} Z[sqrt2] degree`);
    }

    // Cubic: α²·α² used to TypeError; α³ = 2.
    {
        const f = ctx.QPolynomial.fromIntCoeffs([-2, 0, 0, 1]);
        const K = new ctx.NumberField(f, 'a');
        const a = K.generator();
        const a2 = a.mul(a);
        const a4 = a2.mul(a2); // the crash: x^4 term
        const a3 = a2.mul(a);
        assert.deepEqual(coeffs(a3), ['2', '0', '0'], `${label} a^3 === 2`);
        assert.deepEqual(coeffs(a4), ['0', '2', '0'], `${label} a^4 === 2a`);
        const r = runPreset(ctx, ['x_1^3-2']);
        assert.equal(r.field.n, 3, `${label} Z[cbrt2] Compute`);
        assert.ok(r.integralBasis, `${label} Z[cbrt2] integral basis`);
    }

    // Cyclotomic ℤ[ζ₅] (degree 4 advertised preset).
    {
        const r = runPreset(ctx, ['x_1^4+x_1^3+x_1^2+x_1+1']);
        assert.equal(r.field.n, 4, `${label} Z[zeta5] degree`);
    }

    // Two-generator ℤ[√2,√3] used to ReferenceError _substituteLinear.
    {
        const r = runPreset(ctx, ['x_1^2-2', 'x_2^2-3']);
        assert.equal(r.field.n, 4, `${label} Z[sqrt2,sqrt3] primitive-element degree`);
        assert.equal(r.generators.length, 2, `${label} Z[sqrt2,sqrt3] two generators`);
    }

    console.log(`ok ${label} advertised presets`);
}
