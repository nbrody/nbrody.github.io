import test from 'node:test';
import assert from 'node:assert/strict';
import { buildBallTree, getBallFrame, ballEngine, ballDirection } from '../js/ballTree.js';
import { adj } from '../../../GeometryofLinearGroups/Algebraic/Tools/2dimFields/js/laurent.js';
import { FIELDS, cusps } from '../../../GeometryofLinearGroups/Algebraic/Tools/2dimFields/js/fieldK.js';

const settings = field => ({ field, N: 2, depth: 3, lam: .65, edges: 'q', h: -.75 });
const close = (a,b) => assert.ok(Math.abs(a-b) < 1e-9, `${a} != ${b}`);
const dot = (a,b) => a.reduce((v,x,i)=>v+x*b[i],0);
const dist = (a,b) => Math.hypot(...a.map((x,i)=>x-b[i]));
for (const field of ['i','omega']) {
    test(`${field}: each finite frame agrees with its path and attaches to its parent`, () => {
        const s = settings(field), { recs, truncated } = buildBallTree(s, 160, .025);
        assert.ok(recs.length > 2 && recs.length <= 160);
        assert.equal(typeof truncated, 'boolean');
        const E = ballEngine(field);
        for (let i=0; i<recs.length; i++) {
            const rec = recs[i], F = rec.F;
            assert.equal(rec.labels.length, rec.depth);
            for (const vec of [F.c,F.u,F.e1,F.e2]) assert.ok(vec.every(Number.isFinite));
            close(dot(F.u,F.u),1); close(dot(F.e1,F.e1),1); close(dot(F.e2,F.e2),1);
            close(dot(F.u,F.e1),0); close(dot(F.u,F.e2),0); close(dot(F.e1,F.e2),0);
            const path = getBallFrame(rec.labels,s).F;
            close(dist(F.c,path.c),0); close(F.R,path.R);
            if (i) {
                assert.ok(rec.parent >= 0 && rec.parent < i);
                const parent = recs[rec.parent].F;
                close(dist(F.c,parent.c),parent.R+rec.gap+F.R);
                assert.equal(rec.labels.length,recs[rec.parent].labels.length+1);
                const local = E.cuspOfLabel(rec.labels.at(-1));
                const n = ballDirection(parent,local.dir);
                close(dot(n,F.u),-1);
                // Infinity points to the parent and is excluded beyond the root.
                if (rec.depth > 1) assert.ok(!E.tree.isInf(rec.labels.at(-1)));
            }
        }
    });
    test(`${field}: exact matrix actions return after the inverse`, () => {
        const E = ballEngine(field), matrix = E.matrixOf(['1','t','0','1'].map(E.parse));
        const records = buildBallTree(settings(field), 30, .025).recs;
        for (const {labels} of records) {
            const image = E.tree.localMap(matrix,labels).labels;
            const back = E.tree.localMap(adj(matrix),image).labels;
            assert.equal(E.tree.keyOf(back), E.tree.keyOf(labels));
        }
    });
    test(`${field}: cap and size threshold bound the finite patch`, () => {
        const s = settings(field);
        const small = buildBallTree(s, 10, .025);
        assert.equal(small.recs.length,10); assert.equal(small.truncated,true);
        const rootOnly = buildBallTree(s, 160, 2);
        assert.equal(rootOnly.recs.length,1); assert.equal(rootOnly.truncated,false);
        const candidates = cusps(FIELDS[field], s.N, true);
        assert.ok(candidates.some(c => c.q[0]===0 && c.q[1]===0));
    });
}
test('rejects unsupported ball fields', () => assert.throws(() => ballEngine('Q')));
