// node --test tests/utilsAndDb.test.mjs
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ONE, parseRationalMatrix, mul, inv, key, isScalar, evalWord } from '../js/mat2.js';
import { FIELDS, polyText } from '../js/fields.js';
import { makeShortener } from '../js/shortenWord.js';
import { innerTex, mathLine, mathLines } from '../js/texText.js';
import { asLatex, parsePastedMatrices } from '../js/input.js';
import { presentationGap, presentationSage, presentationMagma } from '../js/sarithView.js';
import { presentationOverQ } from '../js/sarithPresentation.js';
import { gaussReduce, canonicalGroup } from '../batch/reduce.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.join(here, '..');

test('mat2.js: exact projective BigInt arithmetic and word evaluation', () => {
    const T = parseRationalMatrix(['1', '1/2', '0', '1']);
    const S = parseRationalMatrix(['0', '-1', '1', '0']);
    assert.equal(key(T), '2,1,0,2');
    assert.ok(isScalar(mul(S, S)));
    // (S * [1,1;0,1])^3 = -I is scalar
    const T1 = parseRationalMatrix(['1', '1', '0', '1']);
    assert.ok(isScalar(evalWord([T1, S], [2, 1, 2, 1, 2, 1])));
    assert.ok(isScalar(mul(T, inv(T))));
});

test('fields.js: polyText formats minimal polynomials for ringEngine', () => {
    assert.equal(polyText(FIELDS.i.poly), 'w^2+1');
    assert.equal(polyText(FIELDS.r5.poly), 'w^2-w-1');
    assert.equal(polyText(FIELDS.c23.poly), 'w^3-w-1');
});

test('shortenWord.js: shortens redundant words while preserving exact projective matrix', () => {
    const gens = [parseRationalMatrix(['1', '1', '0', '1']), parseRationalMatrix(['0', '-1', '1', '0'])];
    const ops = { mul, inv, key, one: ONE };
    const sh = makeShortener(gens, ops, { maxElements: 2000, seconds: 1 });
    // In PSL₂(ℤ), S² = 1 and (S T)³ = 1, so T S T S T = S
    const longWord = [1, 2, 1, 2, 1, 2, 2, 1, -1];
    const shortWord = sh.shorten(longWord);
    assert.ok(shortWord.length < longWord.length);
    assert.equal(key(evalWord(gens, shortWord)), key(evalWord(gens, longWord)));
});

test('texText.js: converts Unicode math notation into KaTeX spans without corrupting prose', () => {
    assert.match(innerTex('g₁·g₂⁻¹'), /g_\{1\}g_\{2\}\^\{-1\}/);
    assert.match(innerTex('PGL₂(ℤ[½])'), /\\mathrm\{PGL\}_\{2\}/);
    const lines = mathLines('Γ is S-arithmetic. Index in PGL₂(ℤ) is 6.');
    assert.equal(lines.length, 2);
    assert.ok(lines[0].includes('$S$-arithmetic'), '$S$-arithmetic math-hyphenation formatted');
});

test('input.js: asLatex and parsePastedMatrices handle LaTeX, JSON/Sage, DB keys, and plain grids', () => {
    assert.equal(asLatex('w^12 - x^-2 + a_10'), 'w^{12} - x^{-2} + a_{10}');

    // 1. Database key format
    assert.deepEqual(
        parsePastedMatrices('2,1,0,1|1,0,5,3'),
        [['2', '1', '0', '1'], ['1', '0', '5', '3']],
    );

    // 2. LaTeX pmatrix format
    const latex = '\\begin{pmatrix} 1 & 1+w \\\\ 0 & 1 \\end{pmatrix}, \\begin{bmatrix} 0 & -1 \\\\ 1 & 0 \\end{bmatrix}';
    assert.deepEqual(
        parsePastedMatrices(latex),
        [['1', '1+w', '0', '1'], ['0', '-1', '1', '0']],
    );

    // 3. Python / Sage / JSON nested list format
    assert.deepEqual(
        parsePastedMatrices('[[[1, 2], [0, 1]], [[1, 0], [2, 1]]]'),
        [['1', '2', '0', '1'], ['1', '0', '2', '1']],
    );

    // 4. Semicolon-delimited matrices
    assert.deepEqual(
        parsePastedMatrices('[1 3; 0 1] [1 0; 1/3 1]'),
        [['1', '3', '0', '1'], ['1', '0', '1/3', '1']],
    );
});

test('sarithView.js: GAP, SageMath, and Magma exports are syntactically well-formed', () => {
    const P = presentationOverQ([['1', '1', '0', '1'], ['0', '-1', '1', '0']], []);
    const gap = presentationGap(P);
    const sage = presentationSage(P);
    const magma = presentationMagma(P);
    assert.match(gap, /FreeGroup\("g1", "g2"\)/);
    assert.match(sage, /F\.<g1, g2> = FreeGroup\(\)/);
    assert.match(sage, /G = F \/ \[/);
    assert.match(magma, /Group< g1, g2 \|/);
});

test('batch/reduce.mjs: canonicalGroup is invariant under PGL₂(ℤ) conjugation and elementary Nielsen moves', () => {
    const pair = [[2, 1, 1, 1], [1, 3, 0, 1]];
    const base = canonicalGroup(pair);
    // Conjugate by T² S ∈ PGL₂(ℤ): h = [2, -1; 1, 0], adj(h) = [0, 1; -1, 2]
    const h = [2, -1, 1, 0], hi = [0, 1, -1, 2];
    const mul = (A, B) => [A[0] * B[0] + A[1] * B[2], A[0] * B[1] + A[1] * B[3], A[2] * B[0] + A[3] * B[2], A[2] * B[1] + A[3] * B[3]];
    const conjPair = pair.map((m) => mul(mul(h, m), hi));
    assert.equal(gaussReduce(conjPair).key, gaussReduce(pair).key);
    assert.equal(canonicalGroup(conjPair).key, base.key);
    // Elementary Nielsen move (a, b) -> (a*b, b)
    const nielsenPair = [mul(pair[0], pair[1]), pair[1]];
    assert.equal(canonicalGroup(nielsenPair).key, base.key);
});

test('database/web export invariants: manifest, exBound = 4, random draws = 700, and group verdict consistency', () => {
    const manifestPath = path.join(rootDir, 'database', 'web', 'manifest.json');
    assert.ok(fs.existsSync(manifestPath), 'database/web/manifest.json should exist');
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert.equal(manifest.exBound, 4, 'exhaustive σ₁ bound over ℚ must be 4 (not polluted by sample tuning rows)');
    assert.equal(manifest.counts.random, 700, 'results-random.json must export all 700 draws');
    assert.ok(manifest.nfFields.length >= 9);
    for (const f of manifest.nfFields) {
        const shard = path.join(rootDir, 'database', 'web', `results-nf-${f}.json`);
        assert.ok(fs.existsSync(shard), `missing shard results-nf-${f}.json`);
    }

    // Verify no canonical group class in groups.json has conflicting decided verdicts (e.g. sarith vs thin)
    const groupsPath = path.join(rootDir, 'database', 'groups.json');
    const resultsPath = path.join(rootDir, 'database', 'web', 'results.json');
    if (fs.existsSync(groupsPath) && fs.existsSync(resultsPath)) {
        const G = JSON.parse(fs.readFileSync(groupsPath, 'utf8')).groups || {};
        const recs = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
        const byKey = new Map(recs.map((r) => [r.key, r]));
        const DECIDED = new Set(['notdense', 'discrete', 'sarith', 'thin']);
        for (const [gk, info] of Object.entries(G)) {
            const verdicts = new Set();
            for (const m of info.members || []) {
                const r = byKey.get(m);
                if (r && DECIDED.has(r.verdict)) verdicts.add(r.verdict);
            }
            assert.ok(verdicts.size <= 1, `conflicting decided verdicts in equivalence class ${gk}: ${[...verdicts].join(', ')}`);
        }
    }
});
