// triangulation.js — the combinatorics of an ideal triangulation (SnapPea conventions).
//
// Tetrahedron t has vertices 0–3; face f is the face opposite vertex f. Face f
// of t is glued to face glu[t][f][f] of tetrahedron nbr[t][f], vertex i going to
// vertex glu[t][f][i]. The shape z of a tetrahedron sits on edges 01 and 23,
// z′ = 1/(1 − z) on 02 and 13, and z″ = 1 − 1/z on 03 and 12.

/** Shape type (0: z, 1: z′, 2: z″) of the edge {a, b}. */
export const EDGE_TYPE = [
    [-1, 0, 1, 2],
    [0, -1, 2, 1],
    [1, 2, -1, 0],
    [2, 1, 0, -1],
];
/** The six edges of a tetrahedron, as vertex pairs. */
export const EDGES = [[0, 1], [0, 2], [0, 3], [1, 2], [1, 3], [2, 3]];
const edgeIndex = (a, b) => EDGES.findIndex(([x, y]) => (x === a && y === b) || (x === b && y === a));

export class Triangulation {
    /** @param entry a census record (see tools/make_census.py) */
    constructor(entry) {
        this.entry = entry;
        this.n = entry.nTet;
        this.nCusp = entry.nCusp;
        this.tets = entry.tets.map((T) => ({ nbr: T.nbr, glu: T.glu, cusp: T.cusp, gen: T.gen, m: T.m, l: T.l }));
        this.root = entry.root;
        this.nOrig = entry.pres.nOrig;
        this.cuspRows = entry.cuspRows;            // [meridian, longitude] rows for each cusp (SnapPy)
        this._edges();
        this._faces();
    }

    /** Edge classes: the cycles of (tetrahedron, edge) around each edge of the triangulation. */
    _edges() {
        const n = this.n;
        const seen = Array.from({ length: n }, () => new Array(6).fill(-1));
        this.edgeClasses = [];
        for (let t0 = 0; t0 < n; t0++) {
            for (let e0 = 0; e0 < 6; e0++) {
                if (seen[t0][e0] >= 0) continue;
                const cls = this.edgeClasses.length;
                const [a0, b0] = EDGES[e0];
                const [c0, d0] = [0, 1, 2, 3].filter((v) => v !== a0 && v !== b0);
                const cycle = [];
                let t = t0, a = a0, b = b0, c = c0, d = d0;
                for (let guard = 0; guard < 6 * n + 2; guard++) {
                    const e = edgeIndex(a, b);
                    if (seen[t][e] >= 0) break;
                    seen[t][e] = cls;
                    cycle.push({ tet: t, a, b, edge: e, type: EDGE_TYPE[a][b] });
                    const s = this.tets[t].glu[d];
                    const u = this.tets[t].nbr[d];
                    [t, a, b, c, d] = [u, s[a], s[b], s[d], s[c]];
                }
                this.edgeClasses.push(cycle);
            }
        }
        this.edgeOf = seen;          // edgeOf[t][e] = edge class
        // gluing equation rows: counts of z, z′, z″ of each tetrahedron around each edge
        this.edgeRows = this.edgeClasses.map((cycle) => {
            const row = new Array(3 * this.n).fill(0);
            for (const o of cycle) row[3 * o.tet + o.type]++;
            return row;
        });
    }

    /** Face pairs: each glued pair of faces once, with SnapPy's generator label (0 inside the tree). */
    _faces() {
        this.facePairs = [];
        const done = Array.from({ length: this.n }, () => [false, false, false, false]);
        for (let t = 0; t < this.n; t++) {
            for (let f = 0; f < 4; f++) {
                if (done[t][f]) continue;
                const T = this.tets[t];
                const u = T.nbr[f], g = T.glu[f][f];
                done[t][f] = done[u][g] = true;
                // gen: SnapPy's face-pairing generator (0 inside the maximal tree); the side with
                // the positive label is the face where D meets g·D
                this.facePairs.push({ tet: t, face: f, tet2: u, face2: g, gen: Math.abs(T.gen[f]), index: this.facePairs.length });
            }
        }
        this.pairOf = Array.from({ length: this.n }, () => [0, 0, 0, 0]);
        for (const fp of this.facePairs) { this.pairOf[fp.tet][fp.face] = fp.index; this.pairOf[fp.tet2][fp.face2] = fp.index; }
    }

    /** The vertex triangles (t, v) at cusp k. */
    cuspTriangles(k) {
        const out = [];
        for (let t = 0; t < this.n; t++) for (let v = 0; v < 4; v++) if (this.tets[t].cusp[v] === k) out.push([t, v]);
        return out;
    }
}

/** Integer rank of a list of integer rows (fraction-free elimination). */
export function intRank(rows) {
    const A = rows.map((r) => r.slice());
    let rank = 0;
    const m = A.length, n = m ? A[0].length : 0;
    for (let col = 0; col < n && rank < m; col++) {
        let piv = -1;
        for (let r = rank; r < m; r++) if (A[r][col] !== 0) { piv = r; break; }
        if (piv < 0) continue;
        [A[rank], A[piv]] = [A[piv], A[rank]];
        for (let r = rank + 1; r < m; r++) {
            if (A[r][col] === 0) continue;
            const f = A[r][col], g = A[rank][col];
            for (let c = col; c < n; c++) A[r][c] = A[r][c] * g - A[rank][c] * f;
            const gg = A[r].reduce((s, x) => gcdInt(s, x), 0) || 1;
            for (let c = col; c < n; c++) A[r][c] /= gg;
        }
        rank++;
    }
    return rank;
}
export function gcdInt(a, b) {
    a = Math.abs(a); b = Math.abs(b);
    while (b) [a, b] = [b, a % b];
    return a;
}
