// What the page shows, from computeAll's result (plain data: strings, numbers, arrays), and the word
// problem on demand (a matrix of GL_2(O) → a word in the generators of PGL_2(O)).
import { RE, RI } from './ring.js';
import { evalWord, wordFor } from './brown.js';
import { freeReduce, invWord } from './engine.js';
import { latexToPlain } from './latexInput.js';
import { powerReduce } from '../../../../PresentationCalc/js/presentation.js';

const matTeX = (nf, g) => `\\begin{pmatrix} ${nf.tex(g[0][0])} & ${nf.tex(g[0][1])} \\\\ ${nf.tex(g[1][0])} & ${nf.tex(g[1][1])} \\end{pmatrix}`;
const vecTeX = (nf, v) => (v.length === 1 ? nf.tex(v[0]) : `\\begin{pmatrix} ${nf.tex(v[0])} \\\\ ${nf.tex(v[1])} \\end{pmatrix}`);

function elementOrder(space, g, projective, cap = 60) {
    const K = space.nf;
    const done = (p) => (projective ? K.isZero(p[0][1]) && K.isZero(p[1][0]) && K.eq(p[0][0], p[1][1]) : space.matKey(p) === space.matKey(space.identity()));
    let p = g;
    for (let k = 1; k <= cap; k++) { if (done(p)) return k; p = space.matMul(p, g); }
    return null;
}

export function summarize(R) {
    const { nf, space, cx, units } = R._internal;
    const groups = {};
    for (const [key, projective] of [['PGL2', true], ['PSL2', true], ['GL2', false], ['SL2', false]]) {
        const G = R[key];
        groups[key] = {
            gens: G.gens.map((g) => ({ tex: matTeX(nf, g), plain: g.map((row) => row.map((x) => plainElement(nf, x))), order: elementOrder(space, g, projective) })),
            relators: G.relators,
            abelianization: G.abelianization,
            verified: G.verified,
        };
    }
    const cells = cx.cells.map((c, i) => ({
        index: i,
        vectors: c.mv.vecs.length,
        rays: c.mv.qs.length,
        facets: c.facets.length,
        facetOrbits: c.facetReps.length,
        ridges: c.ridges.filter((r) => r.interior).length,
        stabOrder: c.stab.elems.length,
        pglStab: R.complex[i].pglStab,
        neighbors: c.facetReps.map((fi) => c.neighbor.get(fi).to),
        minVecs: c.mv.vecs.slice(0, 40).map((v) => vecTeX(nf, v)),
        minimumTeX: space.F.tex(c.m),
    }));
    return {
        field: { ...R.field, name: nf.name },
        space: { N: space.N, kind: nf.kind },
        groups,
        cells,
        brown: R.brown,
        units: { cells: units.cells },
        timing: R.timing,
    };
}

/** an element as plain text in the root a: (1 + 2*a)/3 */
export function plainElement(nf, x) {
    const v = nf.toA(x);
    let den = 1n;
    for (const t of v) den = den / gcd(den, t.d) * t.d;
    const parts = [];
    v.forEach((t, i) => {
        const c = t.n * (den / t.d);
        if (!c) return;
        const a = c < 0n ? -c : c, mono = i === 0 ? '' : i === 1 ? 'a' : `a^${i}`;
        parts.push({ neg: c < 0n, s: i === 0 ? `${a}` : a === 1n ? mono : `${a}*${mono}` });
    });
    if (!parts.length) return '0';
    const num = parts.map((t, k) => (k === 0 ? (t.neg ? '-' : '') + t.s : (t.neg ? ' - ' : ' + ') + t.s)).join('');
    return den === 1n ? num : `(${num})/${den}`;
}
const gcd = (a, b) => { a = a < 0n ? -a : a; b = b < 0n ? -b : b; while (b) [a, b] = [b, a % b]; return a; };

/** a random element of PGL_2(O): a short random word in the generators, as entries (TeX) */
export function randomEntries(R, rng = Math.random) {
    const { nf, space } = R._internal;
    const gens = R.PGL2.gens;
    let g = space.identity();
    const len = 3 + Math.floor(rng() * 4);
    for (let i = 0; i < len; i++) {
        const k = Math.floor(rng() * gens.length);
        g = space.matMul(g, rng() < 0.5 ? gens[k] : space.matInv(gens[k]));
    }
    return [g[0][0], g[0][1], g[1][0], g[1][1]].map((x) => nf.tex(x));
}

/** parse an element of O from MathQuill LaTeX */
export function parseElement(nf, latex) {
    const gens = [nf.name, 'a'];
    if (nf.name === 'i') gens.push('\\imath');
    const plain = latexToPlain(latex || '0', { gen: gens });
    if (!plain) return nf.zero();
    const ast = RE.parseExpr(plain);
    const K = nf.field.K;
    const aCoords = RI.evalAst(ast, RI.fieldDomain(K));
    const thetaCoords = RI.ratSolveRows(nf.subData.P, aCoords);
    const k = nf.fromPower(thetaCoords);
    if (k.d !== 1n) throw new Error(`${latex} is not an algebraic integer`);
    return k.v;
}

/** a word in the PGL_2 generators for the matrix with these entries (LaTeX) */
export function wordForEntries(R, entries) {
    const { nf, space, cx, P, GL, PGL } = R._internal;
    const g = [[parseElement(nf, entries[0]), parseElement(nf, entries[1])], [parseElement(nf, entries[2]), parseElement(nf, entries[3])]];
    const det = space.det(g);
    if (nf.isZero(det)) throw new Error('the matrix is singular');
    if (!nf.isUnit(det)) throw new Error(`the determinant ${nf.tex(det)} is not a unit, so the matrix is not in GL₂(O)`);
    const raw = wordFor(cx, P, g);
    const subst = (w, express) => freeReduce([].concat(...w.map((x) => (x > 0 ? express(x) : invWord(express(-x))))));
    const wGL = subst(raw, GL.express);
    // exponents modulo the orders of generators with a power relator
    const orders = new Map();
    for (const r of PGL.relators) if (r.length && r.every((x) => x === r[0])) orders.set(Math.abs(r[0]), r.length);
    const wPGL = powerReduce(subst(wGL, PGL.express), orders, false);
    // check: the PGL word evaluates to g up to a scalar
    const h = evalWord(space, PGL.gens, wPGL);
    const ok = nf.isZero(space.matMul(h, space.matInv(g))[0][1]) && nf.isZero(space.matMul(h, space.matInv(g))[1][0]);
    const hgi = space.matMul(h, space.matInv(g));
    if (!ok || !nf.eq(hgi[0][0], hgi[1][1])) throw new Error('internal: the word does not evaluate to the matrix');
    return { word: wPGL, matrixTeX: matTeX(nf, g), detTeX: nf.tex(det), cellsCrossed: raw.length, glWord: wGL };
}
