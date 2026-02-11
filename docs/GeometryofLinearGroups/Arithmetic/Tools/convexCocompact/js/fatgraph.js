// =============================================================================
// fatgraph.js — Fatgraph (ribbon graph) construction and boundary tracing
// =============================================================================
// Depends on math.js: SL2Z class, matA(), matB()
// Depends on bassSerre.js: periodicCF(), translationLength(), axisPath(),
//                          bridgeBetweenAxes()
//
// Exports:
//   Fatgraph              — class representing a fatgraph (ribbon graph)
//   buildFatgraph(A, B)   — build quotient fatgraph for <A, B>
//   traceBoundaries(fg)   — trace boundary cycles of a fatgraph
//   computeBoundaryMatrix(A, B, boundaryWord) — compute SL2Z matrix for a word
// =============================================================================

// ---------------------------------------------------------------------------
// Fatgraph class — stores vertices, edges, and half-edges with cyclic orderings
// ---------------------------------------------------------------------------
//
// A fatgraph (ribbon graph) is a graph with a cyclic ordering of half-edges
// at each vertex. This extra structure determines a fattening (thickening)
// of the graph into a surface with boundary.
//
// Data:
//   vertices:  [{ id, halfEdges: [halfEdge ids in cyclic CCW order] }]
//   edges:     [{ id, label, halfEdges: [h_out_id, h_in_id] }]
//   halfEdges: [{ id, edgeId, vertexId, twin, next, label }]
//
// The "twin" of a half-edge h is the oppositely oriented half-edge of the
// same edge. The "next" field gives the next half-edge when tracing a
// boundary component (see traceBoundaries).
// ---------------------------------------------------------------------------
class Fatgraph {
    constructor() {
        this.vertices = [];
        this.edges = [];
        this.halfEdges = [];
    }

    addVertex(id) {
        const v = { id: id, halfEdgeIds: [] };
        this.vertices.push(v);
        return v;
    }

    addEdge(id, label, vertexFromId, vertexToId) {
        // Create two half-edges: outgoing (from -> to) and incoming (to -> from)
        const hOutId = id + '_out';
        const hInId = id + '_in';

        const hOut = {
            id: hOutId,
            edgeId: id,
            vertexId: vertexFromId,  // vertex this half-edge is incident to
            twin: hInId,
            next: null,              // set later by cyclic ordering
            label: label             // generator label: 'A', 'B', etc.
        };

        const hIn = {
            id: hInId,
            edgeId: id,
            vertexId: vertexToId,    // vertex this half-edge is incident to
            twin: hOutId,
            next: null,
            label: label + '^-1'     // inverse label
        };

        const edge = {
            id: id,
            label: label,
            halfEdges: [hOutId, hInId],
            vertexFrom: vertexFromId,
            vertexTo: vertexToId
        };

        this.edges.push(edge);
        this.halfEdges.push(hOut);
        this.halfEdges.push(hIn);

        return edge;
    }

    getHalfEdge(id) {
        return this.halfEdges.find(h => h.id === id);
    }

    getVertex(id) {
        return this.vertices.find(v => v.id === id);
    }

    getEdge(id) {
        return this.edges.find(e => e.id === id);
    }

    /**
     * Set the cyclic ordering at a vertex. The halfEdgeIds array lists the
     * half-edges in counterclockwise order as seen from the planar embedding.
     *
     * This sets the "next" pointers for boundary tracing:
     *   For each half-edge h arriving at this vertex (h is listed in the ordering),
     *   the boundary-next of twin(h) is the half-edge after h in the cyclic order.
     *
     * Actually, the convention is:
     *   The cyclic order lists the half-edges LEAVING the vertex (outgoing).
     *   When a boundary trace arrives at the vertex via some half-edge h,
     *   it exits via the half-edge that comes AFTER twin(h) in the cyclic order.
     *
     * Boundary tracing rule:
     *   boundary_next(h) = cyclicNext(twin(h))
     *   where cyclicNext is the next element in the cyclic ordering at
     *   the vertex where twin(h) is based.
     */
    setCyclicOrder(vertexId, halfEdgeIds) {
        const v = this.getVertex(vertexId);
        v.halfEdgeIds = halfEdgeIds;

        // Set the boundary-next pointers.
        // For each half-edge h in the cyclic order at this vertex,
        // we need: for any half-edge g such that twin(g) = h,
        // set boundary_next(g) = cyclicNext(h).
        //
        // In other words: for each h in the cyclic order,
        // boundary_next(twin(h)) = cyclicNext(h).
        const n = halfEdgeIds.length;
        for (let i = 0; i < n; i++) {
            const hId = halfEdgeIds[i];
            const nextHId = halfEdgeIds[(i + 1) % n];
            const h = this.getHalfEdge(hId);
            const twinH = this.getHalfEdge(h.twin);
            // When tracing a boundary and arriving via twinH,
            // the next half-edge to follow is nextH
            twinH.next = nextHId;
        }
    }

    /**
     * Return a summary for debugging/display.
     */
    summary() {
        return {
            numVertices: this.vertices.length,
            numEdges: this.edges.length,
            numHalfEdges: this.halfEdges.length,
            eulerChar: this.vertices.length - this.edges.length,
            bettiNumber: this.edges.length - this.vertices.length + 1,
            vertices: this.vertices.map(v => ({
                id: v.id,
                cyclicOrder: v.halfEdgeIds
            })),
            edges: this.edges.map(e => ({
                id: e.id,
                label: e.label,
                from: e.vertexFrom,
                to: e.vertexTo
            }))
        };
    }
}


// ---------------------------------------------------------------------------
// classifyFixedPointArrangement(A, B) — Determine how the axes are arranged
// ---------------------------------------------------------------------------
//
// For two hyperbolic elements A, B in SL(2,Z), compute their fixed points
// and determine whether they are:
//   - 'nested':      B- < A- < A+ < B+  (or A- < B- < B+ < A+)
//   - 'interleaved': A- < B- < A+ < B+  (or B- < A- < B+ < A+)
//   - 'disjoint':    A- < A+ < B- < B+  (completely separated on the line)
//
// Returns { arrangement, fixedA, fixedB, order } where order gives the
// sorted sequence of fixed points with labels.
// ---------------------------------------------------------------------------
function classifyFixedPointArrangement(A, B) {
    const fpA = A.fixedPoints(); // [A-, A+]
    const fpB = B.fixedPoints(); // [B-, B+]

    const aMinus = fpA[0], aPlus = fpA[1];
    const bMinus = fpB[0], bPlus = fpB[1];

    // Sort all four fixed points on the real line
    const points = [
        { value: aMinus, label: 'A-' },
        { value: aPlus,  label: 'A+' },
        { value: bMinus, label: 'B-' },
        { value: bPlus,  label: 'B+' }
    ].sort((a, b) => a.value - b.value);

    const order = points.map(p => p.label);

    // Determine the arrangement type
    let arrangement;

    // Check for nesting: one pair of fixed points contains the other
    // A inside B: B- < A- < A+ < B+
    // B inside A: A- < B- < B+ < A+
    if ((bMinus < aMinus && aPlus < bPlus) ||
        (aMinus < bMinus && bPlus < aPlus)) {
        arrangement = 'nested';
    }
    // Check for interleaving: fixed points alternate
    // A- < B- < A+ < B+ or B- < A- < B+ < A+
    else if ((aMinus < bMinus && bMinus < aPlus && aPlus < bPlus) ||
             (bMinus < aMinus && aMinus < bPlus && bPlus < aPlus)) {
        arrangement = 'interleaved';
    }
    // Otherwise: disjoint (one interval completely before the other)
    else {
        arrangement = 'disjoint';
    }

    return {
        arrangement: arrangement,
        fixedA: { minus: aMinus, plus: aPlus },
        fixedB: { minus: bMinus, plus: bPlus },
        order: order
    };
}


// ---------------------------------------------------------------------------
// buildFatgraph(A, B) — Build the quotient fatgraph for <A, B>
// ---------------------------------------------------------------------------
//
// For <A, B> a free group of rank 2 (Schottky group), the quotient of the
// minimal invariant subtree by the group action is a graph with Betti
// number 2. The simplest model is a rose with 2 petals: one vertex v,
// two loop edges e_A and e_B.
//
// The fatgraph structure (cyclic ordering of half-edges at v) determines
// the topology of the thickened surface:
//   - Nested fixed points (B- < A- < A+ < B+):
//       Cyclic order [eA_out, eB_in, eA_in, eB_out]
//       => Once-punctured torus (genus 1, 1 boundary)
//       Boundary word: [A,B] = ABA^{-1}B^{-1}
//   - Interleaved fixed points (A- < B- < A+ < B+):
//       Cyclic order [eA_out, eA_in, eB_out, eB_in]
//       => Pair of pants (genus 0, 3 boundaries)
//
// The key mathematical fact: for the generators
//   A(p) = [[1+2p, 2], [p, 1]]
//   B(p) = [[1+2p, 2p], [1, 1]]
// the fixed points are ALWAYS nested (B- < A- < A+ < B+) for p >= 2,
// giving a once-punctured torus whose single boundary is the commutator [A,B].
// ---------------------------------------------------------------------------
function buildFatgraph(A, B) {
    if (!A.isHyperbolic() || !B.isHyperbolic()) {
        throw new Error('buildFatgraph: both generators must be hyperbolic');
    }

    const fp = classifyFixedPointArrangement(A, B);
    const fg = new Fatgraph();

    // Single vertex (rose with 2 petals)
    fg.addVertex('v');

    // Two loop edges
    fg.addEdge('eA', 'A', 'v', 'v');
    fg.addEdge('eB', 'B', 'v', 'v');

    // Set the cyclic ordering at v based on the fixed point arrangement.
    //
    // The four half-edges at v are:
    //   eA_out: outgoing along A (toward A+), label A
    //   eA_in:  returning from A (toward A-), label A^{-1}
    //   eB_out: outgoing along B (toward B+), label B
    //   eB_in:  returning from B (toward B-), label B^{-1}
    //
    // The cyclic ordering determines the boundary word(s).
    // setCyclicOrder([h0, h1, h2, h3]) sets: twin(h_i).next = h_{i+1 mod 4}
    // Boundary tracing follows the .next pointers.
    //
    // NESTED case (A inside B: B- < A- < A+ < B+):
    //   Cyclic order [eA_out, eB_in, eA_in, eB_out] produces:
    //     eA_out.next = eB_out, eB_out.next = eA_in,
    //     eA_in.next = eB_in, eB_in.next = eA_out
    //   => ONE boundary cycle: A B A^{-1} B^{-1} = [A,B]
    //   => Once-punctured torus (genus 1, 1 boundary)
    //
    // INTERLEAVED case (A- < B- < A+ < B+):
    //   Cyclic order [eA_out, eA_in, eB_out, eB_in] produces:
    //   => THREE boundary cycles => Pair of pants (genus 0, 3 boundaries)

    let cyclicOrder;

    if (fp.arrangement === 'nested') {
        // Nested: one pair of fixed points contains the other
        // Gives once-punctured torus (genus 1, 1 boundary)
        // Boundary word: [A,B] = ABA^{-1}B^{-1}
        //
        // Whether A is inside B or B is inside A, the cyclic order that
        // alternates between A and B half-edges gives exactly 1 boundary.
        cyclicOrder = ['eA_out', 'eB_in', 'eA_in', 'eB_out'];
    } else if (fp.arrangement === 'interleaved') {
        // Interleaved: fixed points alternate
        // Gives pair of pants (genus 0, 3 boundaries)
        //
        // The cyclic order that groups each edge's half-edges together
        // gives 3 boundaries:
        //   [eA_out, eA_in, eB_out, eB_in] produces:
        //     boundary 1: {eA_in} word A^{-1}
        //     boundary 2: {eB_in} word B^{-1}
        //     boundary 3: {eA_out, eB_out} word AB
        cyclicOrder = ['eA_out', 'eA_in', 'eB_out', 'eB_in'];
    } else {
        // Disjoint: one interval completely before the other
        // Treat same as interleaved (3 boundaries)
        cyclicOrder = ['eA_out', 'eA_in', 'eB_out', 'eB_in'];
    }

    fg.setCyclicOrder('v', cyclicOrder);

    // Store metadata
    fg.fixedPointData = fp;
    fg.generatorA = A;
    fg.generatorB = B;

    return fg;
}


// ---------------------------------------------------------------------------
// traceBoundaries(fatgraph) — Trace all boundary cycles of the fatgraph
// ---------------------------------------------------------------------------
//
// Boundary tracing convention:
//
// setCyclicOrder(v, [h0, h1, h2, ...]) sets: twin(h_i).next = h_{i+1 mod n}
//
// A boundary cycle follows the .next pointers: start at any half-edge g,
// then g -> g.next -> g.next.next -> ... until returning to g.
//
// Each half-edge in the cycle represents traversing the corresponding edge.
// If the half-edge is the "out" half, we read the generator forward;
// if it's the "in" half, we read it as the inverse.
//
// For the nested case with cyclic order [eA_out, eB_in, eA_in, eB_out]:
//   next pointers: eA_out.next = eB_out, eB_out.next = eA_in,
//                  eA_in.next = eB_in,   eB_in.next = eA_out
//   Single boundary: eA_out -> eB_out -> eA_in -> eB_in -> eA_out
//   Word: A B A^{-1} B^{-1} = [A,B]
// ---------------------------------------------------------------------------
function traceBoundaries(fatgraph) {
    const visited = new Set();
    const boundaries = [];

    for (let i = 0; i < fatgraph.halfEdges.length; i++) {
        const startH = fatgraph.halfEdges[i];

        if (visited.has(startH.id)) continue;

        // Trace boundary cycle starting from this half-edge
        const cycle = [];
        let currentId = startH.id;

        while (!visited.has(currentId)) {
            visited.add(currentId);
            const h = fatgraph.getHalfEdge(currentId);
            cycle.push(h);
            currentId = h.next;
        }

        // Only record if we completed a cycle back to the start
        if (currentId === startH.id) {
            // Build the boundary word from the cycle
            const wordParts = [];
            const matrices = [];

            for (let j = 0; j < cycle.length; j++) {
                const h = cycle[j];
                const edge = fatgraph.getEdge(h.edgeId);
                const isForward = (h.id === edge.halfEdges[0]);

                if (isForward) {
                    wordParts.push(edge.label);
                } else {
                    wordParts.push(edge.label + '^-1');
                }
            }

            const word = wordParts.join(' ');

            // Check if this is a commutator [A,B] or [A,B]^{-1}
            const isCommutator =
                (word === 'A B A^-1 B^-1') ||
                (word === 'B A B^-1 A^-1') ||
                // Cyclic rotations
                (word === 'B A^-1 B^-1 A') ||
                (word === 'A^-1 B^-1 A B') ||
                (word === 'B^-1 A B A^-1') ||
                (word === 'B^-1 A^-1 B A') ||
                (word === 'A^-1 B A B^-1') ||
                (word === 'A B^-1 A^-1 B');

            boundaries.push({
                halfEdges: cycle.map(h => h.id),
                word: word,
                wordParts: wordParts,
                length: cycle.length,
                isCommutator: isCommutator
            });
        }
    }

    return boundaries;
}


// ---------------------------------------------------------------------------
// computeBoundaryMatrix(A, B, wordParts) — Multiply out a boundary word
// ---------------------------------------------------------------------------
//
// Given generators A, B (SL2Z matrices) and a word as an array of strings
// like ['A', 'B', 'A^-1', 'B^-1'], compute the product matrix.
// ---------------------------------------------------------------------------
function computeBoundaryMatrix(A, B, wordParts) {
    let result = SL2Z.identity();

    for (let i = 0; i < wordParts.length; i++) {
        const part = wordParts[i];
        let mat;
        switch (part) {
            case 'A':    mat = A; break;
            case 'A^-1': mat = A.inv(); break;
            case 'B':    mat = B; break;
            case 'B^-1': mat = B.inv(); break;
            default:
                throw new Error('computeBoundaryMatrix: unknown generator ' + part);
        }
        result = result.mul(mat);
    }

    return result;
}


// ---------------------------------------------------------------------------
// topologyFromBoundaries(fatgraph, boundaries) — Compute surface topology
// ---------------------------------------------------------------------------
//
// For a fatgraph with V vertices, E edges, and b boundary components,
// the Euler characteristic of the thickened surface is:
//   chi = 2 - 2g - b = V - E
// since the surface deformation-retracts onto the graph.
//
// Therefore: 2g + b = 2 - V + E
//
// For our 2-petal rose (V=1, E=2): 2g + b = 3
//   b=1 => g=1 (once-punctured torus)
//   b=3 => g=0 (pair of pants / 3-holed sphere)
// ---------------------------------------------------------------------------
function topologyFromBoundaries(fatgraph, boundaries) {
    const V = fatgraph.vertices.length;
    const E = fatgraph.edges.length;
    const b = boundaries.length;
    const genus = (2 - V + E - b) / 2;

    return {
        vertices: V,
        edges: E,
        boundaries: b,
        genus: genus,
        eulerCharacteristic: 2 - 2 * genus - b,
        description: genus === 1 && b === 1
            ? 'Once-punctured torus (genus 1, 1 boundary)'
            : genus === 0 && b === 3
                ? 'Pair of pants (genus 0, 3 boundaries)'
                : 'Surface of genus ' + genus + ' with ' + b + ' boundary components'
    };
}
