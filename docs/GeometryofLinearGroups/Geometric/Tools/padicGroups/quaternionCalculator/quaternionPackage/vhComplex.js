// vhComplex.js - The one-vertex square complex X_{p,q} for distinct odd primes p, q.
//
// A_p = integer quaternions of norm p with a > 0 odd, normalised mod 2:
//   p ≡ 1 (mod 4): b, c, d even        (each ≡ 1 in L/2L)
//   p ≡ 3 (mod 4): b, c odd and d even (each ≡ 1+i+j in L/2L)
// One per left Q8-orbit, so |A_p| = p + 1, and A_p is closed under conjugation.
// Γ = ⟨A_p ∪ A_q⟩ ⊂ SO_3(Z[1/pq]) acts simply transitively on the vertices of
// T_{p+1} × T_{q+1}; the quotient has one vertex, (p+1)/2 horizontal loops,
// (q+1)/2 vertical loops and one square for each relation ab = ± b'a'
// (a, a' ∈ A_p, b, b' ∈ A_q). For each (a, b) there is exactly one (b', a'):
// ab is primitive of norm pq, so it factors uniquely up to a unit, and the
// mod-2 normalisation pins the unit down to ±1.

const qmul = (x, y) => [
    x[0] * y[0] - x[1] * y[1] - x[2] * y[2] - x[3] * y[3],
    x[0] * y[1] + x[1] * y[0] + x[2] * y[3] - x[3] * y[2],
    x[0] * y[2] - x[1] * y[3] + x[2] * y[0] + x[3] * y[1],
    x[0] * y[3] + x[1] * y[2] - x[2] * y[1] + x[3] * y[0]
];
const qconj = (x) => [x[0], -x[1], -x[2], -x[3]];
const qkey = (x) => x.join(',');
const isOdd = (n) => ((n % 2) + 2) % 2 === 1;

export function isOddPrime(n) {
    if (!Number.isInteger(n) || n < 3 || n % 2 === 0) return false;
    for (let d = 3; d * d <= n; d += 2) if (n % d === 0) return false;
    return true;
}

/** The p + 1 canonical quaternions of norm p (see header). */
export function canonicalPrimeQuaternions(p) {
    const L = Math.floor(Math.sqrt(p));
    const out = [];
    for (let a = 1; a <= L; a += 2) {
        for (let b = -L; b <= L; b++) {
            for (let c = -L; c <= L; c++) {
                const d2 = p - a * a - b * b - c * c;
                if (d2 < 0) continue;
                const d = Math.round(Math.sqrt(d2));
                if (d * d !== d2) continue;
                for (const dd of d ? [d, -d] : [0]) {
                    if (p % 4 === 3 && isOdd(dd)) continue;
                    out.push([a, b, c, dd]);
                }
            }
        }
    }
    if (out.length !== p + 1) throw new Error(`expected ${p + 1} canonical quaternions of norm ${p}, found ${out.length}`);
    return out;
}

/**
 * Split a conjugation-closed generating set into (positive, inverse) pairs.
 * The positive one has its first non-zero vector coordinate positive;
 * edges are sorted so that i-heavy generators come first.
 * Returns { gens: [{ q, edge, sign, inv }], edges: [{ q, pos, neg }] }.
 */
function pairUp(list) {
    const index = new Map(list.map((x, i) => [qkey(x), i]));
    const inv = list.map((x) => index.get(qkey(qconj(x))));
    const isPositive = (x) => (x[1] || x[2] || x[3]) > 0;
    const posIdx = list.map((_, i) => i).filter((i) => isPositive(list[i]));
    posIdx.sort((i, j) => {
        const x = list[i], y = list[j];
        for (let k = 1; k < 4; k++) if (x[k] !== y[k]) return y[k] - x[k];
        return y[0] - x[0];
    });
    const gens = list.map((q) => ({ q, edge: -1, sign: 0, inv: -1 }));
    const edges = posIdx.map((i, e) => {
        gens[i].edge = e; gens[i].sign = 1;
        gens[inv[i]].edge = e; gens[inv[i]].sign = -1;
        return { q: list[i], pos: i, neg: inv[i] };
    });
    gens.forEach((g, i) => { g.inv = inv[i]; });
    return { gens, edges };
}

/**
 * Hyperplanes of one family. Vertices are edges of the other direction,
 * one arc per square (bottom→top for vertical hyperplanes, left→right for
 * horizontal ones). Returns components with their size, rank of π₁, whether
 * the hyperplane is two-sided (balanced signed graph), and the number of
 * components of its double cover.
 */
function hyperplanes(numEdges, arcs) {
    const comp = new Array(numEdges).fill(-1);
    const eps = new Array(numEdges).fill(0);
    const adj = Array.from({ length: numEdges }, () => []);
    arcs.forEach((arc, s) => {
        adj[arc.from].push({ to: arc.to, sign: arc.sign, s });
        adj[arc.to].push({ to: arc.from, sign: arc.sign, s });
    });
    const comps = [];
    for (let start = 0; start < numEdges; start++) {
        if (comp[start] >= 0) continue;
        const c = { edges: [], squares: new Set(), twoSided: true };
        comp[start] = comps.length; eps[start] = 1;
        const stack = [start];
        while (stack.length) {
            const e = stack.pop();
            c.edges.push(e);
            for (const { to, sign, s } of adj[e]) {
                c.squares.add(s);
                if (comp[to] < 0) {
                    comp[to] = comps.length; eps[to] = eps[e] * sign;
                    stack.push(to);
                } else if (eps[to] !== eps[e] * sign) {
                    c.twoSided = false;
                }
            }
        }
        c.edges.sort((x, y) => x - y);
        c.squares = [...c.squares].sort((x, y) => x - y);
        c.rank = c.squares.length - c.edges.length + 1;
        comps.push(c);
    }
    // The double cover (boundary of the carrier, i.e. the ¼ and ¾ slices of the squares)
    // has two lifts (e, 0), (e, 1) of each vertex; an arc lifts to (from, k) — (to, k ⊕ [sign < 0]).
    const parent = [...Array(2 * numEdges).keys()];
    const find = (x) => (parent[x] === x ? x : (parent[x] = find(parent[x])));
    arcs.forEach((arc) => {
        for (const k of [0, 1]) parent[find(2 * arc.from + k)] = find(2 * arc.to + (arc.sign < 0 ? 1 - k : k));
    });
    for (const c of comps) c.coverComponents = new Set(c.edges.flatMap((e) => [find(2 * e), find(2 * e + 1)])).size;
    const ofArc = arcs.map((arc) => comp[arc.from]);
    return { components: comps, ofArc };
}

/**
 * Build X_{p,q}. Squares are stored as one of their four readings
 * (bottom a, right b, top a', left b' with ab = sign·b'a'), chosen to have as
 * many positively oriented sides as possible.
 */
export function buildVHComplex(p, q) {
    if (!isOddPrime(p) || !isOddPrime(q)) throw new Error('p and q must be odd primes');
    if (p === q) throw new Error('p and q must be distinct');

    const H = pairUp(canonicalPrimeQuaternions(p));
    const V = pairUp(canonicalPrimeQuaternions(q));
    const A = H.gens, B = V.gens;
    const Aidx = new Map(A.map((g, i) => [qkey(g.q), i]));

    // (a, b) ↦ [b', a', sign] with ab = sign·b'a'
    const rel = new Map();
    for (let i = 0; i < A.length; i++) {
        for (let j = 0; j < B.length; j++) {
            const x = qmul(A[i].q, B[j].q);
            let hit = null;
            for (let k = 0; k < B.length; k++) {
                const y = qmul(qconj(B[k].q), x);
                if (!y.every((v) => v % q === 0)) continue;
                const z = y.map((v) => v / q);
                let ap = Aidx.get(qkey(z)), sign = 1;
                if (ap === undefined) { ap = Aidx.get(qkey(z.map((v) => -v))); sign = -1; }
                if (ap === undefined || hit) throw new Error(`no unique factorisation of a·b for (${i}, ${j})`);
                hit = [k, ap, sign];
            }
            if (!hit) throw new Error(`a·b does not refactor for (${i}, ${j})`);
            rel.set(`${i},${j}`, hit);
        }
    }

    const used = new Set();
    const squares = [];
    for (let i = 0; i < A.length; i++) {
        for (let j = 0; j < B.length; j++) {
            if (used.has(`${i},${j}`)) continue;
            const [bp, ap] = rel.get(`${i},${j}`);
            // The four readings of one square: reflect left↔right and/or top↔bottom.
            const readings = [
                { bottom: i, right: j, top: ap, left: bp },
                { bottom: ap, right: B[j].inv, top: i, left: B[bp].inv },
                { bottom: A[i].inv, right: bp, top: A[ap].inv, left: j },
                { bottom: A[ap].inv, right: B[bp].inv, top: A[i].inv, left: B[j].inv }
            ];
            for (const r of readings) {
                const k = `${r.bottom},${r.right}`;
                if (used.has(k)) throw new Error('square readings overlap');
                used.add(k);
            }
            const positives = (r) => A[r.bottom].sign + A[r.top].sign + B[r.left].sign + B[r.right].sign;
            let best = readings[0];
            for (const r of readings) if (positives(r) > positives(best)) best = r;
            const lhs = qmul(A[best.bottom].q, B[best.right].q);
            const rhs = qmul(B[best.left].q, A[best.top].q);
            const sign = qkey(lhs) === qkey(rhs) ? 1 : -1;
            if (sign < 0 && qkey(lhs) !== qkey(rhs.map((v) => -v))) throw new Error('reading is not a relation');
            squares.push({ ...best, sign });
        }
    }
    if (squares.length * 4 !== A.length * B.length) throw new Error('square count mismatch');

    // Vertical hyperplanes cross the horizontal edges (bottom → top of each square);
    // horizontal hyperplanes cross the vertical edges (left → right).
    const vArcs = squares.map((s) => ({
        from: A[s.bottom].edge, to: A[s.top].edge, sign: A[s.bottom].sign * A[s.top].sign
    }));
    const hArcs = squares.map((s) => ({
        from: B[s.left].edge, to: B[s.right].edge, sign: B[s.left].sign * B[s.right].sign
    }));

    return {
        p, q,
        A, B,
        hEdges: H.edges,
        vEdges: V.edges,
        squares,
        relation: (a, b) => rel.get(`${a},${b}`),
        vHyperplanes: hyperplanes(H.edges.length, vArcs),
        hHyperplanes: hyperplanes(V.edges.length, hArcs),
        vArcs, hArcs,
        euler: 1 - H.edges.length - V.edges.length + squares.length
    };
}

/** Zarankiewicz's number Z(m, n) = ⌊m/2⌋⌊(m−1)/2⌋⌊n/2⌋⌊(n−1)/2⌋. */
export function zarankiewicz(m, n) {
    const f = (k) => Math.floor(k / 2) * Math.floor((k - 1) / 2);
    return f(m) * f(n);
}
