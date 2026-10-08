// node tests/fieldK.test.mjs — cusps of ℙ¹(ℚ(i)) and ℙ¹(ℚ(ω)), Ford spheres, and the circles.
import { FIELDS, gcd, cusps, circles, unimodular, cuspName } from '../js/fieldK.js';

let fails = 0, checks = 0;
const ok = (cond, msg) => { checks++; if (!cond) { fails++; console.log('FAIL', msg); } };

for (const K of Object.values(FIELDS)) {
    // the units form a group of the right size, all of norm 1
    for (const u of K.units) for (const v of K.units) ok(K.units.some(([a, b]) => { const w = K.mul(u, v); return w[0] === a && w[1] === b; }), `${K.name}: units closed`);
    ok(K.units.every((u) => K.norm(u) === 1), `${K.name}: units have norm 1`);
    // the norm is multiplicative and the gcd divides both
    for (let t = 0; t < 200; t++) {
        const x = [Math.floor(Math.random() * 21) - 10, Math.floor(Math.random() * 21) - 10];
        const y = [Math.floor(Math.random() * 21) - 10, Math.floor(Math.random() * 21) - 10];
        ok(K.norm(K.mul(x, y)) === K.norm(x) * K.norm(y), `${K.name}: norm multiplicative`);
        if (!y[0] && !y[1]) continue;
        const g = gcd(K, x, y);
        ok((K.norm(x) === 0 || K.norm(x) % K.norm(g) === 0) && K.norm(y) % K.norm(g) === 0, `${K.name}: gcd norm divides`);
    }
    const cs = cusps(K, 6, true);
    // distinct up to units, sorted by height, ∞ present once
    ok(new Set(cs.map((c) => c.key)).size === cs.length, `${K.name}: cusps distinct`);
    ok(cs.filter((c) => !c.q[0] && !c.q[1]).length === 1, `${K.name}: ∞ once`);
    ok(cs.every((c, i) => !i || cs[i - 1].n2 <= c.n2), `${K.name}: sorted by height`);
    ok(cs.every((c) => Math.abs(Math.hypot(...c.dir) - 1) < 1e-12), `${K.name}: on the unit sphere`);
    // Ford spheres (inside the ball): neighbours touch, others are disjoint
    const ball = (c) => ({ x: c.dir.map((v) => v * (1 - c.D / 2)), r: c.D / 2 });
    let touching = 0;
    for (let i = 0; i < 160; i++) {
        for (let j = i + 1; j < 160; j++) {
            const A = ball(cs[i]), B = ball(cs[j]), d = Math.hypot(A.x[0] - B.x[0], A.x[1] - B.x[1], A.x[2] - B.x[2]);
            if (unimodular(K, cs[i], cs[j])) { touching++; ok(Math.abs(d - A.r - B.r) < 1e-9, `${K.name}: neighbours ${cuspName(K, cs[i])}, ${cuspName(K, cs[j])} tangent`); }
            else ok(d > A.r + B.r - 1e-9, `${K.name}: ${cuspName(K, cs[i])}, ${cuspName(K, cs[j])} disjoint`);
        }
    }
    ok(touching > 50, `${K.name}: plenty of neighbours (${touching})`);
    // every circle lies on the sphere, and the cusps on it are where the plane meets it
    const cir = circles(K, 4);
    ok(cir.length > 20, `${K.name}: ${cir.length} circles`);
    const onIt = (c, p) => Math.abs(c.n[0] * p[0] + c.n[1] * p[1] + c.n[2] * p[2] - c.d) < 1e-9;
    ok(cir.some((c) => onIt(c, [0, 0, 1]) && onIt(c, [0, 0, -1]) && onIt(c, [1, 0, 0])), `${K.name}: the real circle is there`);
    // the arrangement is symmetric under the units (z ↦ εz turns the sphere about its axis)
    for (const c of cir.slice(0, 30)) {
        const ang = 2 * Math.PI / K.units.length;
        const rot = [c.n[0] * Math.cos(ang) - c.n[1] * Math.sin(ang), c.n[0] * Math.sin(ang) + c.n[1] * Math.cos(ang), c.n[2]];
        const same = (e, s) => Math.abs(e.d - s * c.d) < 1e-6 && Math.hypot(e.n[0] - s * rot[0], e.n[1] - s * rot[1], e.n[2] - s * rot[2]) < 1e-6;
        ok(cir.some((e) => same(e, 1) || same(e, -1)), `${K.name}: unit symmetry`);   // a plane's normal is up to sign
    }
    console.log(K.name, 'cusps of height ≤ 6:', cs.length, ' circles ≤ 4:', cir.length, ' e.g.', cs.slice(0, 9).map((c) => cuspName(K, c)).join(', '));
}
console.log(`${checks - fails}/${checks} checks passed`);
process.exit(fails ? 1 : 0);
