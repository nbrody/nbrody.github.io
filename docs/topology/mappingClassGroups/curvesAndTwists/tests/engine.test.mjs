// node tests/engine.test.mjs — the surface, the geodesic solver and Dehn twists.
import { Surface } from '../js/surface.js';
import { Curve } from '../js/curve.js';
import * as TW from '../js/twist.js';
import * as M from '../js/mcg.js';
import { mmul, mdist, I3, fromDisk, mapply, normPoint, minv } from '../js/hyp.js';

let fails = 0, checks = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log('FAIL:', msg); } else console.log('ok  ', msg); };
const tl = (S, w) => { const A = S.wordMatrix(w); return Math.acosh((A[0] + A[4] + A[8] - 1) / 2); };
let seed = 12345;
const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
function randomWord(g, len) {
    const w = [];
    while (w.length < len) {
        const L = (1 + Math.floor(rnd() * 2 * g)) * (rnd() < 0.5 ? 1 : -1);
        if (w.length && w[w.length - 1] === -L) continue;
        w.push(L);
    }
    while (w.length > 1 && w[0] === -w[w.length - 1]) w.pop();
    return w;
}
const hom = (g, w) => { const v = new Array(2 * g).fill(0); for (const L of w) v[Math.abs(L) - 1] += Math.sign(L); return v; };

// ---------------------------------------------------------------- the surface
for (let g = 2; g <= 5; g++) {
    const S = new Surface(g);
    let e = 0;
    for (let i = 0; i < S.n; i++) e = Math.max(e, mdist(mmul(S.sideMat[i], S.sideMat[S.partner[i]]), I3()));
    ok(e < 1e-9, `g=${g}: paired side maps are inverse (${e.toExponential(1)})`);
    // the relator is 1: its first half equals the inverse of its second half (relative error)
    const h = S.relator.length / 2;
    const A = S.wordMatrix(S.relator.slice(0, h)), B = minv(S.wordMatrix(S.relator.slice(h)));
    const rel = mdist(A, B) / Math.max(...A.map(Math.abs));
    ok(S.relator.length === 4 * g && rel < 1e-9, `g=${g}: a loop around a vertex reads a relator of length ${S.relator.length} equal to 1 (${rel.toExponential(1)})`);
}

// ---------------------------------------------------------------- geodesic lengths
for (const g of [2, 3]) {
    const S = new Surface(g);
    let worst = 0, n = 0;
    for (const len of [1, 2, 3, 5, 8, 13, 30]) {
        for (let r = 0; r < 3; r++) {
            const w = randomWord(g, len);
            const c = Curve.fromWord(S, w);
            c.relax({ maxSteps: 3000 });
            const ex = tl(S, w);
            if (!Number.isFinite(ex) || ex < 1e-6) continue;
            worst = Math.max(worst, Math.abs(c.length() - ex) / ex);
            n++;
        }
    }
    ok(worst < 1e-7, `g=${g}: ${n} random geodesics have length arccosh((tr−1)/2) to ${worst.toExponential(1)}`);
}

// ---------------------------------------------------------------- drawing across a side
{
    const S = new Surface(2);
    // from near the center out through side 0, ending near the center of the next tile
    const pts = [], words = [];
    let frame = [];
    for (let i = 0; i <= 40; i++) {
        const t = i / 40, h = fromDisk(0.05 + 0.86 * t, 0.12 * Math.sin(Math.PI * t));
        const Mf = S.wordMatrix(frame);
        const { p, word } = S.reduce(Mf ? normPoint(mapply(minv(Mf), h)) : h);
        if (i) words.push(word);
        pts.push(p);
        frame = frame.concat(word);
    }
    let best = null, bd = Infinity;
    for (const t of S.tiles(2)) {
        const q = normPoint(mapply(t.M, pts[0]));
        const d = Math.acosh(Math.max(1, -(pts[pts.length - 1][0] * q[0] + pts[pts.length - 1][1] * q[1] - pts[pts.length - 1][2] * q[2])));
        if (d < bd) { bd = d; best = t.word; }
    }
    const c = new Curve(S, pts, words.concat([best]));
    c.relax({ maxSteps: 3000 });
    ok(c.word().join() === '1' && Math.abs(c.length() - tl(S, [1])) < 1e-8, `a stroke out through side 0 closes up to the curve a_1 (word ${c.word().join(' ')})`);
}

// ---------------------------------------------------------------- the Humphries chain
for (let g = 2; g <= 4; g++) {
    const S = new Surface(g);
    const curves = {};
    for (const [k, w] of Object.entries(M.chainWords(g))) curves[k] = M.curveFromWord(S, w);
    const names = Object.keys(curves);
    let bad = 0;
    for (const a of names) for (const b of names) {
        if (a >= b) continue;
        const i = +a.slice(1), j = +b.slice(1);
        const want = (i > 0 && j > 0 && Math.abs(i - j) === 1) || (i === 0 && j === 4) || (j === 0 && i === 4) ? 1 : 0;
        if (TW.intersectionNumber(curves[a], curves[b]) !== want) bad++;
    }
    const simple = names.every(k => TW.selfCrossings(curves[k]) === 0);
    ok(!bad && simple, `g=${g}: c_0, …, c_${2 * g + 1} are simple and meet in the Humphries pattern`);
}

// ---------------------------------------------------------------- twists
{
    const g = 2, S = new Surface(g);
    const C = {};
    for (const [k, w] of Object.entries(M.chainWords(g))) C[k] = M.curveFromWord(S, w);
    const ap = (s, x) => M.applyTwists(M.parseTwists(s), x, C);
    ok(TW.sameCurve(ap('1 2', C.c1), C.c2) === 1, 'T_1 T_2 (c_1) = c_2 with its orientation');
    const x = ap('3 -1 4', C.c2);
    ok(TW.sameCurve(ap('2 -2', x), x) === 1, 'T_2 T_2⁻¹ fixes a curve');
    ok(TW.sameCurve(ap('2', C.c1), C.c1) === 0, 'T_2 moves c_1');
    let braid = true;
    for (const t of [C.c1, C.c3, C.c4, x]) if (TW.sameCurve(ap('1 2 1', t), ap('2 1 2', t)) !== 1) braid = false;
    ok(braid, 'T_1T_2T_1 = T_2T_1T_2 on test curves');
    const iota = '1 2 3 4 5 5 4 3 2 1';
    ok(['c1', 'c2', 'c3', 'c4', 'c5'].every(k => TW.sameCurve(ap(iota, C[k]), C[k]) === -1), 'the hyperelliptic involution reverses each chain curve');
    // homology: [T_c γ] − [γ] is a multiple of [c], the multiple being ± the algebraic intersection
    let homOk = true, signs = new Set();
    for (const [cn, gs] of [['c1', 'c2'], ['c2', 'c3'], ['c3', 'c4'], ['c4', 'c5'], ['c1', null]]) {
        const c = C[cn], gamma = gs ? C[gs] : x;
        const y = TW.twist(gamma, c, 1);
        const d = hom(g, y.word()).map((v, i) => v - hom(g, gamma.word())[i]);
        const hc = hom(g, c.word());
        const k = TW.algebraicIntersection(c, gamma);
        const i0 = hc.findIndex(v => v !== 0);
        const m = d[i0] / hc[i0];
        if (!d.every((v, i) => v === m * hc[i]) || Math.abs(m) !== Math.abs(k) || !k) homOk = false;
        signs.add(Math.sign(m * k));
    }
    ok(homOk && signs.size === 1 && signs.has(-1), 'in homology, T_c(γ) = γ − (c·γ) c');
    const long = ap('1 3 5 -2 -4 1 3 5 -2 -4', C.c3);
    ok(TW.selfCrossings(long) === 0 && long.length() > 40, `twists keep curves simple (a Penner image of length ${long.length().toFixed(1)})`);
}

console.log(`${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
