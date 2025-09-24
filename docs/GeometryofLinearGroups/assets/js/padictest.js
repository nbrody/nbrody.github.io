// padic.test.js
import assert from "node:assert/strict";
import { matrixToVertex } from "./docs/GeometryofLinearGroups/assets/js/padic.js";

// Handy extractors
const v = x => x.valuation;
const isZero = x => v(x) === Infinity;
const isOne = x => v(x) === 0 && x.digits[0] === 1;

// Check x ≡ y (mod p^n), i.e., v(x − y) ≥ n
function congruentModPn(x, y, n, p, precision, padicSub) {
    const diff = padicSub(x, y, precision);
    return v(diff) >= n;
}

// We need padic helpers from the module under test.
// Since they’re not exported, we’ll re-import the file as a module object
// and grab them via the default namespace trick.
import * as padicMod from "./docs/GeometryofLinearGroups/assets/js/padic.js";
const { padicFromNumber, padicInv, padicMul, padicSub, padicOne, ensurePadic } = padicMod;

// Small helper to wrap a plain 2x2 array with prime and precision.
// (matrixToVertex will call inferPrime and inferPrecision—providing p avoids guessing)
function wrap(matrix, p, precision) {
    return { matrix, p, precision };
}

const p = 3;
const precision = 8;

(function run() {
    // 1) Identity → n = 0, b = 0, c = 0, d = 1
    {
        const g = wrap([[1, 0], [0, 1]], p, precision);
        const M = matrixToVertex(g);
        const [[a, b_,], [c, d]] = M.matrix;

        assert.equal(a.valuation, 0, "Id: a should be p^0");
        assert.ok(isZero(b_), "Id: b should be 0");
        assert.ok(isZero(c), "Id: c should be 0");
        assert.ok(isOne(d), "Id: d should be 1");
    }

    // 2) Diagonal p^2 on top-left → n = 2, b = 0
    {
        const g = wrap([[p ** 2, 0], [0, 1]], p, precision);
        const M = matrixToVertex(g);
        const [[a, b_,], [c, d]] = M.matrix;

        assert.equal(a.valuation, 2, "diag: a should be p^2");
        assert.ok(isZero(b_), "diag: b should be 0");
        assert.ok(isZero(c), "diag: c should be 0");
        assert.ok(isOne(d), "diag: d should be 1");
    }

    // 3) Upper-triangular with nonzero b; check truncation mod p^n
    //    g = [[p^2, 5], [0, 1]]  ⇒ n = 2; resulting b ≡ 5 (mod p^2)
    {
        const g = wrap([[p ** 2, 5], [0, 1]], p, precision);
        const M = matrixToVertex(g);
        const [[a, bOut], [c, d]] = M.matrix;

        assert.equal(a.valuation, 2, "upper: a should be p^2");
        assert.ok(isZero(c), "upper: c should be 0");
        assert.ok(isOne(d), "upper: d should be 1");

        // bOut should agree with (original b / original d) modulo p^n, i.e. 5 mod 3^2
        const bOverD = ensurePadic(5, p, precision); // d=1 here
        assert.ok(
            congruentModPn(bOut, bOverD, a.valuation, p, precision, padicSub),
            "upper: b should be congruent to 5 mod p^2"
        );
    }

    // 4) Trigger the swap branch (val(c) < val(d)).
    //    Take c a unit (val=0) and d divisible by p (val>=1), e.g. [[1,1],[1,3]]
    //    det = 1*3 - 1*1 = 2 (a unit in Z_3), so invertible.
    {
        const g = wrap([[1, 1], [1, p]], p, precision);
        const M = matrixToVertex(g);
        const [[a, bOut], [c, d]] = M.matrix;

        assert.ok(isZero(c), "swap: c should be 0 after elimination");
        assert.ok(isOne(d), "swap: d should be 1");
        assert.ok(a.valuation >= 0, "swap: a must be some p^n with n >= 0");

        // bOut ≡ (b/d) mod p^n (here d=1 initially), so bOut ≡ 1 (mod p^n)
        const one = padicOne(p, precision);
        assert.ok(
            congruentModPn(bOut, one, a.valuation, p, precision, padicSub),
            "swap: b should be ≡ 1 mod p^n"
        );
    }

    // 5) Error: zero bottom row
    {
        const g = wrap([[1, 2], [0, 0]], p, precision);
        let threw = false;
        try { matrixToVertex(g); } catch { threw = true; }
        assert.ok(threw, "error: zero bottom row should throw");
    }

    console.log("✅ All padic matrixToVertex tests passed!");
})();