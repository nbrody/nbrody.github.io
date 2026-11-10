// Alexander / Jones / Yamada against known values and a brute-force skein expansion.
import { Poly, findCrossings, alexander, jones, yamada, yamadaNormalize, nameKnot } from '../js/polynomials.js';
import { linkingNumber } from '../js/invariants.js';

let bad = 0;
const check = (label, ok, extra = '') => { if (!ok) bad++; console.log(`${ok ? 'ok ' : 'BAD'} ${label}${extra ? '  ' + extra : ''}`); };
const show = (p, v = 't', den = 1) => (p ? Poly.tex(p, v, den) : 'null');

const DIR = (() => { const v = [0.2113, 0.3271, 0.9211]; const l = Math.hypot(...v); return v.map(c => c / l); })();
const U = (() => { const v = [DIR[1], -DIR[0], 0]; const l = Math.hypot(...v); return v.map(c => c / l); })();
const W = [DIR[1] * U[2] - DIR[2] * U[1], DIR[2] * U[0] - DIR[0] * U[2], DIR[0] * U[1] - DIR[1] * U[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const proj = p => [dot(p, U), dot(p, W), -dot(p, DIR)];
const path = (pts3, closed = true) => ({ pts: pts3.map(proj), closed });

const curve = (f, n = 400, s0 = 0, s1 = 2 * Math.PI) => Array.from({ length: n }, (_, i) => f(s0 + ((s1 - s0) * i) / n));
const torus = (p, q, phase = 0) => s => { const th = q * s + phase, ph = p * s; return [(2 + Math.cos(th)) * Math.cos(ph), (2 + Math.cos(th)) * Math.sin(ph), Math.sin(th)]; };
const S = (lo, c) => Poly.from(lo, c);       // polynomial in s = t^{1/2}

// ---- Hopf link fixes the conventions: positive Hopf V = −t^{1/2} − t^{5/2}
const hopf = [curve(torus(1, 1, 0), 300), curve(torus(1, 1, Math.PI), 300)];
const lk = linkingNumber(hopf[0], hopf[1]);
const Vh = jones(hopf.map(c => path(c)));
const posHopf = S(1, [-1, 0, 0, 0, -1]);
check(`Hopf link lk = ${lk}`, Math.abs(lk) === 1);
check('Hopf Jones = −t^{1/2} − t^{5/2} for lk = +1 (mirror for −1)', Poly.eq(Vh, lk > 0 ? posHopf : Poly.subst(posHopf, -1)), show(Vh, 't', 2));

// ---- torus knots: V = t^{(p−1)(q−1)/2} (1 − t^{p+1} − t^{q+1} + t^{p+q}) / (1 − t²), same handedness as the Hopf link above
function torusJones(p, q) {
    const num = Poly.add(Poly.add(Poly.mono(0), Poly.mono(p + 1, -1)), Poly.add(Poly.mono(q + 1, -1), Poly.mono(p + q)));
    const V = Poly.shift(Poly.div(num, Poly.from(0, [1, 0, -1])), (p - 1) * (q - 1) / 2);
    return Poly.subst(V, 2);   // in s
}
function torusAlex(p, q) {
    // (t^{pq} − 1)(t − 1) / ((t^p − 1)(t^q − 1)), symmetrised
    const tm = k => Poly.add(Poly.mono(k), Poly.mono(0, -1));
    const D = Poly.div(Poly.mul(tm(p * q), tm(1)), Poly.mul(tm(p), tm(q)));
    return Poly.shift(D, -Poly.hi(D) / 2);
}
for (const [p, q, name] of [[2, 3, '3_1'], [2, 5, '5_1'], [3, 4, '8_19'], [2, 7, '7_1'], [3, 5, '10_124']]) {
    const K = path(curve(torus(p, q), 900));
    const X = findCrossings([K]);
    const V = jones([K], X), A = alexander(K, X);
    const Vexp = lk > 0 ? torusJones(p, q) : Poly.subst(torusJones(p, q), -1);
    check(`T(${p},${q}) Jones (${X.length} crossings)`, Poly.eq(V, Vexp), show(V, 't', 2));
    check(`T(${p},${q}) Alexander`, Poly.eq(A, torusAlex(p, q)), show(A));
    const nm = nameKnot(A, V);
    if (name.length === 3) check(`T(${p},${q}) named ${name}`, nm.name === name && nm.chiral === true, JSON.stringify(nm));
}

// ---- figure eight: amphichiral
const fig8 = path(curve(s => [(2 + Math.cos(2 * s)) * Math.cos(3 * s), (2 + Math.cos(2 * s)) * Math.sin(3 * s), Math.sin(4 * s)], 800));
const V8 = jones([fig8]), A8 = alexander(fig8);
check('4_1 Jones = t² − t + 1 − t⁻¹ + t⁻²', Poly.eq(V8, S(-4, [1, 0, -1, 0, 1, 0, -1, 0, 1])), show(V8, 't', 2));
check('4_1 Alexander = −t + 3 − t⁻¹', Poly.eq(A8, Poly.from(-1, [-1, 3, -1])), show(A8));
check('4_1 named, not chiral', (n => n.name === '4_1' && n.chiral === false)(nameKnot(A8, V8)));

// ---- unknot and unlink
const circ = path(curve(s => [Math.cos(s), Math.sin(s), 0.3 * Math.sin(3 * s)], 200));
check('unknot Jones = 1', Poly.eq(jones([circ]), Poly.mono(0)));
const far = path(curve(s => [5 + Math.cos(s), Math.sin(s), 0], 100));
check('2-unlink Jones = −t^{1/2} − t^{-1/2}', Poly.eq(jones([circ, far]), S(-1, [-1, 0, -1])));

// ---- granny and square knots: two trefoils spliced at their outermost points
for (const [label, mirror, chiral] of [['granny', 1, true], ['square', -1, false]]) {
    const n = 500, base = curve(torus(2, 3), n);
    const ia = base.reduce((k, p, i) => (p[0] > base[k][0] ? i : k), 0);
    const rot = arr => Array.from({ length: n - 6 }, (_, k) => arr[(ia + 3 + k) % n]);
    const a = rot(base).map(p => [p[0] - 3.2, p[1], p[2]]);
    // second copy turned 180° about z (same handedness), or also reflected in z (mirror)
    const b = rot(base).map(p => [-p[0] + 3.2, -p[1], mirror * p[2]]);
    const K = path([...a, ...b]);
    const A = alexander(K), V = jones([K]);
    const nm = nameKnot(A, V);
    check(`${label} knot named 3_1#3_1, chiral ${chiral}`, nm.name === '3_1#3_1' && nm.chiral === chiral, `${show(A)}  ${show(V, 't', 2)}`);
}

// ---------------------------------------------------------------- Yamada

/** Yamada by the skein R = x R(D₀) + x⁻¹ R(D∞) + R(D×) and R(planar) = Σ_T (−1)^k σ^β. */
function yamadaBrute(diagram) {
    const { edges } = diagram;
    const paths = edges.map(e => ({ pts: e.pts, closed: !!e.circle }));
    const X = findCrossings(paths);
    const nV = diagram.verts.length;
    // segments: per edge, pieces between passages; ends are 'v:<i>' or 'c:<ci>:<side>:<in|out>'
    const segs = [];
    edges.forEach((e, ei) => {
        const ps = [];
        X.forEach((c, ci) => { for (const s of [0, 1]) if (c.p[s] === ei) ps.push({ ci, s, pos: c.pos[s] }); });
        ps.sort((a, b) => a.pos - b.pos);
        const endA = e.circle ? null : `v:${e.a}`, endB = e.circle ? null : `v:${e.b}`;
        if (e.circle && !ps.length) { segs.push([`o:${ei}`, `o:${ei}`]); return; }
        const pts = ps.map(q => [`c:${q.ci}:${q.s}:in`, `c:${q.ci}:${q.s}:out`]);
        if (e.circle) for (let j = 0; j < pts.length; j++) segs.push([pts[j][1], pts[(j + 1) % pts.length][0]]);
        else {
            let prev = endA;
            for (const q of pts) { segs.push([prev, q[0]]); prev = q[1]; }
            segs.push([prev, endB]);
        }
    });
    const sigma = Poly.from(-1, [-1, -2, -1]);
    const sigPow = [Poly.mono(0)];
    for (let i = 1; i < 40; i++) sigPow.push(Poly.mul(sigPow[i - 1], sigma));
    let total = Poly.zero();
    const n = X.length;
    for (let st = 0; st < 3 ** n; st++) {
        // node ids: map each end to a node
        const node = new Map();
        let nn = 0;
        for (let v = 0; v < nV; v++) node.set(`v:${v}`, nn++);
        edges.forEach((e, ei) => { if (e.circle && segs.some(([a]) => a === `o:${ei}`)) node.set(`o:${ei}`, nn++); });
        let w = 0, code = st;
        X.forEach((c, ci) => {
            const ch = code % 3; code = Math.floor(code / 3);
            const o = c.over, u = 1 - o;
            const ccw = c.tan[o][0] * c.tan[u][1] - c.tan[o][1] * c.tan[u][0] > 0;
            const r = [`c:${ci}:${o}:out`, `c:${ci}:${u}:${ccw ? 'out' : 'in'}`, `c:${ci}:${o}:in`, `c:${ci}:${u}:${ccw ? 'in' : 'out'}`];
            if (ch === 2) { const k = nn++; for (const e of r) node.set(e, k); }
            else {
                const pairs = ch === 0 ? [[1, 2], [3, 0]] : [[0, 1], [2, 3]];
                w += ch === 0 ? 1 : -1;
                for (const [a, b] of pairs) { const k = nn++; node.set(r[a], k); node.set(r[b], k); }
            }
        });
        const E = segs.map(([a, b]) => [node.get(a), node.get(b)]);
        let R = Poly.zero();
        for (let T = 0; T < 1 << E.length; T++) {
            const par = Array.from({ length: nn }, (_, i) => i);
            const f = x => { while (par[x] !== x) x = par[x] = par[par[x]]; return x; };
            let k = nn, sz = 0;
            for (let i = 0; i < E.length; i++) if (T >> i & 1) { sz++; const a = f(E[i][0]), b = f(E[i][1]); if (a !== b) { par[a] = b; k--; } }
            const beta = sz - nn + k;
            R = Poly.add(R, Poly.scale(sigPow[beta], k % 2 ? -1 : 1));
        }
        total = Poly.add(total, Poly.shift(R, w));
    }
    return yamadaNormalize(total);
}

// planar θ and the unknot
const thetaPlanar = {
    verts: [[-1, 0], [1, 0]],
    edges: [-0.8, 0, 0.8].map(h => ({ a: 0, b: 1, pts: curve(s => [-Math.cos(s), h * Math.sin(s), 0], 40, 0, Math.PI).concat([[1, 0, 0]]) })),
};
const Ytheta = yamada(thetaPlanar);
check('planar θ: R = −x² − x − 2 − x⁻¹ − x⁻²', Ytheta && Poly.eq(Ytheta.R, Poly.from(-2, [-1, -1, -2, -1, -1])), Ytheta && show(Ytheta.R, 'x'));
const Yo = yamada({ verts: [], edges: [{ circle: true, pts: circ.pts }] });
check('unknot: R = x + 1 + x⁻¹', Poly.eq(Yo.R, Poly.from(-1, [1, 1, 1])), show(Yo.R, 'x'));

// θ-curves made from a knot plus a chord, and a few more, against the brute force
function thetaFrom(K3, i, j, lift = 1.6) {
    const n = K3.length;
    const chord = curve(s => {
        const a = K3[i], b = K3[j], t = s / Math.PI;
        return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1]), a[2] + t * (b[2] - a[2]) + lift * Math.sin(s)];
    }, 60, 0, Math.PI).concat([K3[j]]);
    return {
        verts: [proj(K3[i]).slice(0, 2), proj(K3[j]).slice(0, 2)],
        edges: [
            { a: 0, b: 1, pts: K3.slice(i, j + 1).map(proj) },
            { a: 1, b: 0, pts: [...K3.slice(j), ...K3.slice(0, i + 1)].map(proj) },
            { a: 0, b: 1, pts: chord.map(proj) },
        ],
    };
}
const tre = curve(torus(2, 3), 300);
const cases = [
    ['θ from trefoil, chord 0–150', thetaFrom(tre, 0, 150)],
    ['θ from trefoil, chord 20–90', thetaFrom(tre, 20, 90, -1.2)],
    ['θ from figure eight', thetaFrom(curve(s => [(2 + Math.cos(2 * s)) * Math.cos(3 * s), (2 + Math.cos(2 * s)) * Math.sin(3 * s), Math.sin(4 * s)], 300), 10, 160, 0.9)],
    ['trefoil as a graph circle', { verts: [], edges: [{ circle: true, pts: tre.map(proj) }] }],
    ['Hopf link as graph', { verts: [], edges: hopf.map(c => ({ circle: true, pts: c.map(proj) })) }],
];
// handcuff: two linked loops joined by an edge (has a bridge → R = 0)
{
    const A0 = curve(torus(1, 1, 0), 120), B0 = curve(torus(1, 1, Math.PI), 120);
    cases.push(['linked handcuff', {
        verts: [proj(A0[0]).slice(0, 2), proj(B0[0]).slice(0, 2)],
        edges: [
            { a: 0, b: 0, pts: [...A0, A0[0]].map(proj) },
            { a: 1, b: 1, pts: [...B0, B0[0]].map(proj) },
            { a: 0, b: 1, pts: curve(s => { const t = s / Math.PI; return [A0[0][0] + t * (B0[0][0] - A0[0][0]), A0[0][1] + t * (B0[0][1] - A0[0][1]), A0[0][2] + t * (B0[0][2] - A0[0][2]) + 2.5 * Math.sin(s)]; }, 30, 0, Math.PI).concat([B0[0]]).map(proj) },
        ],
    }]);
}
for (const [label, D] of cases) {
    const X = findCrossings(D.edges.map(e => ({ pts: e.pts, closed: !!e.circle })));
    if (X.length > 6) { console.log(`skip ${label}: ${X.length} crossings`); continue; }
    const t0 = performance.now();
    const fast = yamada(D);
    const t1 = performance.now();
    const slow = yamadaBrute(D);
    check(`Yamada ${label} (${X.length} crossings, ${(t1 - t0).toFixed(1)} ms)`, fast && Poly.eq(fast.R, slow), `${fast && show(fast.R, 'x')}  vs brute ${show(slow, 'x')}`);
}

process.exit(bad ? 1 : 0);
