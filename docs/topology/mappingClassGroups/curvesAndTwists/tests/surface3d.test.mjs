// node tests/surface3d.test.mjs [genera] — the pretzel, the map onto it, the twist map and the turns.
import { Surface } from '../js/surface.js';
import * as TW from '../js/twist.js';
import * as M from '../js/mcg.js';
import { makePretzel } from '../js/pretzel.js';
import { buildAtlas, samplePoints, curveFromPoints } from '../js/atlas.js';
import { TwistMap, dragSamples, dragCurve } from '../js/homeo.js';
import { lerpGeo, normPoint, mapply } from '../js/hyp.js';

let fails = 0, checks = 0;
const ok = (c, msg) => { checks++; if (!c) { fails++; console.log('FAIL:', msg); } else console.log('ok  ', msg); };
const genera = (process.argv[2] || '2,3').split(',').map(Number);

for (const g of genera) {
    const pz = makePretzel(g);
    // ---------------------------------------------------------------- the mesh
    {
        const nT = pz.tri.length / 3, E = new Map();
        for (let t = 0; t < nT; t++) for (let c = 0; c < 3; c++) {
            const k = pz.tri[3 * t + c] + ',' + pz.tri[3 * t + (c + 1) % 3];
            E.set(k, (E.get(k) || 0) + 1);
        }
        let bad = 0;
        for (const [k, n] of E) { const [a, b] = k.split(','); if (n !== 1 || E.get(b + ',' + a) !== 1) bad++; }
        const chi = pz.nV - E.size / 2 + nT;
        ok(!bad && chi === 2 - 2 * g, `g=${g}: the pretzel is a closed oriented surface of genus ${g} (χ = ${chi}, ${nT} triangles)`);
        let inPlane = true;
        for (let i = 1; i <= 2 * g + 1; i++)
            for (const v of pz.chain[i]) if (Math.abs(pz.pos[3 * v + (i % 2 ? 1 : 2)]) > 1e-9) inPlane = false;
        ok(inPlane && ['x', 'y', 'z'].every(a => pz.sym[a].every(v => v >= 0)), `g=${g}: its chain lies in the planes y = 0 and z = 0, and the three turns by π permute the vertices`);
    }
    // ---------------------------------------------------------------- the map
    const S = new Surface(g), refs = {};
    for (const [k, w] of Object.entries(M.chainWords(g))) refs[k] = M.curveFromWord(S, w);
    const t0 = Date.now();
    const atlas = buildAtlas(S, refs, pz);
    let folds = 0;
    for (const a of atlas.area) if (!(a > 0)) folds++;
    ok(!folds, `g=${g}: the two pieces lay out with no folded triangle (${atlas.info.faces.join(' + ')} sides, ${Date.now() - t0} ms)`);
    {
        let worst = 0;
        for (let i = 1; i <= 2 * g + 1; i++) {
            const path = pz.chain[i];
            for (const p of samplePoints(refs['c' + i], 0.1)) {
                const X = atlas.at(p).pos;
                let best = Infinity;
                for (let k = 0; k < path.length; k++) {
                    const a = path[k], b = path[(k + 1) % path.length];
                    const A = [0, 1, 2].map(j => pz.pos[3 * a + j]), B = [0, 1, 2].map(j => pz.pos[3 * b + j]);
                    const ab = B.map((x, j) => x - A[j]), ax = X.map((x, j) => x - A[j]);
                    const s = Math.max(0, Math.min(1, (ab[0] * ax[0] + ab[1] * ax[1] + ab[2] * ax[2]) / (ab[0] ** 2 + ab[1] ** 2 + ab[2] ** 2)));
                    best = Math.min(best, Math.hypot(...ax.map((x, j) => x - s * ab[j])));
                }
                worst = Math.max(worst, best);
            }
        }
        ok(worst < 2e-3, `g=${g}: each chain geodesic c_i lands on the pretzel's c_i (within ${worst.toExponential(1)})`);
    }
    {
        // glued sides: p on side i and its partner point give the same point of the pretzel
        let worst = 0;
        for (let i = 0; i < S.n; i++)
            for (let k = 1; k < 10; k++) {
                const p = lerpGeo(S.vertices[(i + S.n - 1) % S.n], S.vertices[i], k / 10);
                const q = normPoint(mapply(S.sideMatInv[i], p));
                const a = atlas.at(p).pos, b = atlas.at(q).pos;
                worst = Math.max(worst, Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]));
            }
        ok(worst < 1e-6, `g=${g}: the map agrees on glued sides of the polygon (${worst.toExponential(1)})`);
    }
    // ---------------------------------------------------------------- the twist map
    {
        const C = refs;
        const x = M.applyTwists(M.parseTwists('3 -1 4'), C.c2, C);
        let good = 0, total = 0;
        for (const [cn, gs] of [['c1', 'c2'], ['c3', 'c2'], ['c4', 'c3'], ['c2', null], ['c4', null]])
            for (const e of [1, -1]) {
                const c = C[cn], gamma = gs ? C[gs] : x;
                const tw = new TwistMap(c, e);
                const smp = dragSamples(gamma, tw);
                const y = dragCurve(smp, tw);
                y.relax({ maxSteps: 4000 });
                total++;
                if (TW.sameCurve(y, TW.twist(gamma, c, e)) === 1) good++;
                else console.log(`   T_${cn}^${e} of ${gs || 'x'}: the map gives a different curve`);
            }
        ok(good === total, `g=${g}: sliding the collar of c a full turn gives T_c^{±1} (${good}/${total})`);
    }
    // ---------------------------------------------------------------- the turns by π
    {
        const turn = (axis, c) => {
            const y = curveFromPoints(S, samplePoints(c, 0.03).map(p => atlas.symmetry(axis, p)));
            y.relax({ maxSteps: 4000 });
            return y;
        };
        let rev = true, flip = true;
        for (let i = 1; i <= 2 * g + 1; i++) {
            if (TW.sameCurve(turn('x', refs['c' + i]), refs['c' + i]) !== -1) rev = false;
            if (TW.sameCurve(turn('z', refs['c' + i]), refs['c' + (2 * g + 2 - i)]) === 0) flip = false;
        }
        ok(rev, `g=${g}: the turn about the x-axis reverses every chain curve (it is the hyperelliptic involution)`);
        ok(flip, `g=${g}: the turn about the vertical axis takes c_i to c_${2 * g + 2}−i`);
        const up = Array.from({ length: 2 * g + 1 }, (_, i) => i + 1);
        const iota = M.parseTwists(up.concat(up.slice().reverse()).join(' '));
        const x = M.applyTwists(M.parseTwists('3 -1 4 2'), refs.c2, refs);
        ok(TW.sameCurve(turn('x', x), M.applyTwists(iota, x, refs)) === 1, `g=${g}: on another curve the turn agrees with T_1⋯T_${2 * g + 1}T_${2 * g + 1}⋯T_1`);
    }
}

console.log(`${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
