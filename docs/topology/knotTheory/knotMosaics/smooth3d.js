/**
 * smooth3d.js — Take the current disk mosaic, embed it in R³, and let it
 * relax into an energy-minimal position via gradient descent on a
 * selectable knot energy (Möbius/O'Hara, Coulomb, 1/r⁴, ropelength,
 * elastic bending). Renders a smooth tube around the polygonal knot in
 * a fullscreen overlay (mirrors the cube/torus 3D overlays).
 *
 * Uses the global THREE and THREE.OrbitControls already loaded by
 * index.html.
 */
(function () {
'use strict';

// ─── Mosaic → 3D polygon (Lomonaco–Kauffman tile walker) ──────────────
//
// Tile indices match tiles.js / app.js:
//   0 blank, 1 ─, 2 │, 3 ╮, 4 ╭, 5 ╯, 6 ╰,
//   7 ⊕ horiz-over-vert, 8 ⊖ vert-over-horiz,
//   9 ⟋ NE+SW arcs, 10 ⟍ NW+SE arcs, 11 ⊗ virtual crossing.

const Z_LIFT    = 0.35;
const SAMP_LINE = 4;
const SAMP_ARC  = 9;
const OPP       = { N:'S', S:'N', W:'E', E:'W' };
const NEIGHBOR  = { N:[0,-1], S:[0,1], W:[-1,0], E:[1,0] };

function sideMid(i, j, side) {
    const ux = { N:0.5, S:0.5, W:0,   E:1   }[side];
    const uy = { N:0,   S:1,   W:0.5, E:0.5 }[side];
    return new THREE.Vector3(i + ux, -(j + uy), 0);
}

function lineSamples(a, b, n, zMag) {
    const out = [];
    for (let k = 0; k < n; k++) {
        const t = k / (n - 1);
        out.push(new THREE.Vector3(
            a.x + t * (b.x - a.x),
            a.y + t * (b.y - a.y),
            zMag * Math.sin(Math.PI * t),
        ));
    }
    return out;
}

function arcSamples(cx, cy, theta1, theta2, n) {
    const out = [];
    for (let k = 0; k < n; k++) {
        const t = k / (n - 1);
        const th = theta1 + t * (theta2 - theta1);
        out.push(new THREE.Vector3(
            cx + 0.5 * Math.cos(th),
            cy + 0.5 * Math.sin(th),
            0,
        ));
    }
    return out;
}

function makePieces(t, i, j) {
    const N = sideMid(i, j, 'N'), S = sideMid(i, j, 'S'),
          W = sideMid(i, j, 'W'), E = sideMid(i, j, 'E');
    switch (t) {
        case 0: return [];
        case 1: return [{ sides:['W','E'], points: lineSamples(W, E, SAMP_LINE, 0) }];
        case 2: return [{ sides:['N','S'], points: lineSamples(N, S, SAMP_LINE, 0) }];
        case 3: return [{ sides:['N','E'], points: arcSamples(i+1, -j,         Math.PI,    1.5*Math.PI, SAMP_ARC) }];
        case 4: return [{ sides:['N','W'], points: arcSamples(i,   -j,         0,         -0.5*Math.PI, SAMP_ARC) }];
        case 5: return [{ sides:['S','E'], points: arcSamples(i+1, -(j+1),     Math.PI,    0.5*Math.PI, SAMP_ARC) }];
        case 6: return [{ sides:['S','W'], points: arcSamples(i,   -(j+1),     0,          0.5*Math.PI, SAMP_ARC) }];
        case 7: return [
            { sides:['W','E'], points: lineSamples(W, E, SAMP_LINE, +Z_LIFT) },
            { sides:['N','S'], points: lineSamples(N, S, SAMP_LINE, -Z_LIFT) },
        ];
        case 8: return [
            { sides:['N','S'], points: lineSamples(N, S, SAMP_LINE, +Z_LIFT) },
            { sides:['W','E'], points: lineSamples(W, E, SAMP_LINE, -Z_LIFT) },
        ];
        case 9: return [
            { sides:['N','E'], points: arcSamples(i+1, -j,         Math.PI,    1.5*Math.PI, SAMP_ARC) },
            { sides:['S','W'], points: arcSamples(i,   -(j+1),     0,          0.5*Math.PI, SAMP_ARC) },
        ];
        case 10: return [
            { sides:['N','W'], points: arcSamples(i,   -j,         0,         -0.5*Math.PI, SAMP_ARC) },
            { sides:['S','E'], points: arcSamples(i+1, -(j+1),     Math.PI,    0.5*Math.PI, SAMP_ARC) },
        ];
        case 11:
            // A virtual crossing carries no over/under information, so the
            // diagram determines a knot in a thickened surface — not in R³.
            throw new Error(
                'This mosaic contains a virtual crossing (⊗) at tile ' +
                `(${i},${j}). Virtual crossings carry no over/under ` +
                'information, so a virtual knot diagram has no canonical ' +
                'embedding in R³ — it represents a knot in a thickened ' +
                'higher-genus surface. Resolve the virtual crossings, or ' +
                'realize the diagram on the torus surface instead.');
    }
    return [];
}

// Walk the mosaic's strand pieces into closed loops. The `topology`
// argument decides what happens at grid boundaries:
//
//   'disk'  — strands must not exit the grid (throws otherwise)
//   'torus' — boundaries wrap around in both directions
//
// The optional `transform(point) → Vector3` is applied to every sampled
// point before it lands in the output, used by the torus path to map flat
// (i, j) coordinates onto the folded torus surface.
function mosaicToPolygons(grid, topology, transform) {
    topology = topology || 'disk';
    const H = grid.length;
    if (H === 0) throw new Error('Empty mosaic');
    const W = grid[0].length;
    const pieces = [];
    const lookup = new Map();
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        for (const piece of makePieces(grid[j][i], i, j)) {
            const idx = pieces.length;
            pieces.push({ ...piece, i, j });
            lookup.set(`${i}|${j}|${piece.sides[0]}`, { idx, end: 0 });
            lookup.set(`${i}|${j}|${piece.sides[1]}`, { idx, end: 1 });
        }
    }
    if (pieces.length === 0)
        throw new Error('Mosaic is empty — place some tiles first');

    const visited = new Array(pieces.length).fill(false);
    const loops = [];
    for (let s = 0; s < pieces.length; s++) {
        if (visited[s]) continue;
        const loop = [];
        let curIdx = s, entryEnd = 0;
        while (!visited[curIdx]) {
            visited[curIdx] = true;
            const p = pieces[curIdx];
            const exitEnd = 1 - entryEnd;
            const pts = (entryEnd === 0) ? p.points : [...p.points].reverse();
            const startK = loop.length === 0 ? 0 : 1;
            for (let k = startK; k < pts.length; k++) {
                loop.push(transform ? transform(pts[k]) : pts[k]);
            }
            const exitSide = p.sides[exitEnd];
            const [dx, dy] = NEIGHBOR[exitSide];
            let ni = p.i + dx, nj = p.j + dy;
            if (topology === 'torus') {
                ni = ((ni % W) + W) % W;
                nj = ((nj % H) + H) % H;
            } else if (ni < 0 || nj < 0 || ni >= W || nj >= H) {
                throw new Error(`Strand at tile (${p.i},${p.j}) exits the grid through side ${exitSide}.`);
            }
            const next = lookup.get(`${ni}|${nj}|${OPP[exitSide]}`);
            if (!next)
                throw new Error(`Connection mismatch at tile (${ni},${nj}) side ${OPP[exitSide]}.`);
            curIdx = next.idx;
            entryEnd = next.end;
        }
        if (loop.length > 1 && loop[0].distanceTo(loop[loop.length - 1]) < 1e-6) loop.pop();
        loops.push(loop);
    }
    return loops;
}

// ─── Energy minimiser ────────────────────────────────────────────────
//
// Polygonal closed loop p_0..p_{N-1}. All models share
//     β·Σ_edges (|e|−L)²   (edge spring, keeps discretization even)
//   + γ·tube barrier        (self-avoidance, preserves knot type)
// and add their own driving term:
//
//   'pair'       — discrete O'Hara energy
//                    Σ_{|i−j|>1} (1/|p_i−p_j|^α − 1/d_ij^α)·w_i·w_j·h^(α−2),
//                  d_ij the arc length between the vertices (the shorter
//                  way round), w_i = (|e_{i−1}| + |e_i|)/2, h the target
//                  edge (see pairForces). α=2 is the discrete Möbius
//                  energy, α=1 Coulomb, α=4 a steeper, more short-range
//                  repulsion.
//   'ropelength' — no long-range term; the spring rest length shrinks
//                  each step at fixed tube radius, so the knot tightens
//                  toward its ropelength minimum (SONO-style).
//   'elastic'    — discrete bending energy Σ κ² ds (biharmonic force);
//                  relaxes toward an elastic (Kirchhoff) knot shape.
//
// Forces are −∇E. 'ropelength' and 'elastic' descend via adaptive Euler
// with light Laplacian smoothing; the 'pair' models take preconditioned
// steps at fixed length (see pairMove).

// Tube-barrier strength (scaled by 1/h² for the 'pair' models).
const K_TUBE = 8.0;

const ENERGY_MODELS = {
    mobius: {
        label: 'Möbius (O’Hara)',
        kind: 'pair', alpha: 2, kRepel: 1.6,
        readout: 'E',
    },
    coulomb: {
        label: 'Coulomb 1/r',
        // The 1/r sum is long-range (it grows like N·log N), so it takes a
        // far smaller weight to sit alongside the springs and barriers.
        kind: 'pair', alpha: 1, kRepel: 0.1,
        readout: 'E',
    },
    quartic: {
        label: 'Steep 1/r⁴',
        kind: 'pair', alpha: 4, kRepel: 0.8,
        readout: 'E',
    },
    ropelength: {
        label: 'Ropelength',
        kind: 'ropelength',
        shrink: 0.0015,        // fractional rest-length shrink per step
        readout: 'L/D',
    },
    elastic: {
        label: 'Elastic bending',
        kind: 'elastic', kBend: 0.6,
        readout: 'E',
    },
};

class KnotChain {
    constructor(points, energyKey) {
        this.points = points.map(p => p.clone());
        this.N = points.length;
        this.targetEdge = this.averageEdgeLength();
        this.restEdge = this.targetEdge;
        // The barriers act at the drawn tube radius (setTubeRadius), but
        // never below this one, tied to the edge length so that two edges
        // crossing between their vertices still come within contact.
        this.minTubeR = 0.45 * this.targetEdge;
        this.params = {
            kRepel:   1.6,
            kSpring:  6.0,
            kTube:    K_TUBE,
            tubeR:    this.minTubeR,
            dtMax:    0.05,
            dtSafety: 0.18,
        };
        this.lastEnergy = 0;
        this.stepCount = 0;
        this.rampFactor = 1;
        this.setEnergyModel(energyKey || 'mobius');
        // Number of frames over which the repulsion ramps from
        // RAMP_FLOOR × kRepel up to full kRepel. Lets the smoothing (the
        // Laplacian, or the 'pair' preconditioner) damp out high-frequency
        // content from the initial polygon before the 1/r² gradient lights
        // up every short-wavelength mode.
        this.RAMP_FRAMES = 60;
        this.RAMP_FLOOR  = 0.05;
        // The Laplacian warm-up that rounds off the tile-piece kinks runs in
        // warmUpLink(), across all components, once the link is built.
    }
    setEnergyModel(key) {
        this.energyKey = ENERGY_MODELS[key] ? key : 'mobius';
        this.model = ENERGY_MODELS[this.energyKey];
        if (this.model.kind === 'pair') this.params.kRepel = this.model.kRepel;
        // Ropelength tightens by shrinking the spring rest length; restore
        // it when switching to any other energy.
        if (this.model.kind !== 'ropelength') this.targetEdge = this.restEdge;
        // The 'pair' energies are dimensionless (see pairForces), so their
        // barriers are too, or the barriers would weaken as h² against them.
        this.params.kTube = this.model.kind === 'pair'
            ? K_TUBE / (this.targetEdge * this.targetEdge) : K_TUBE;
        // The 'pair' models hold the length they start from (see pairMove).
        this.pinnedLength = undefined;
    }
    setTubeRadius(r) {
        this.params.tubeR = Math.max(r, this.minTubeR);
    }
    averageEdgeLength() {
        let s = 0;
        for (let i = 0; i < this.N; i++)
            s += this.points[i].distanceTo(this.points[(i + 1) % this.N]);
        return s / this.N;
    }
    totalLength() {
        let s = 0;
        for (let i = 0; i < this.N; i++)
            s += this.points[i].distanceTo(this.points[(i + 1) % this.N]);
        return s;
    }
    _scratch() {
        if (!this._F || this._F.length !== this.N)
            this._F = Array.from({ length: this.N }, () => new THREE.Vector3());
        else
            for (let i = 0; i < this.N; i++) this._F[i].set(0, 0, 0);
        return this._F;
    }
    computeForces() {
        if (this.model.kind === 'pair') return this.pairForces();
        const N = this.N, P = this.points, F = this._scratch();
        const { kSpring, kTube, tubeR } = this.params;
        const model = this.model;
        let energy = 0;

        // Edge springs.
        for (let i = 0; i < N; i++) {
            const j = (i + 1) % N, a = P[i], b = P[j];
            const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
            const len = Math.hypot(dx, dy, dz) + 1e-12;
            const stretch = len - this.targetEdge;
            const f = kSpring * stretch / len;
            F[i].x += f * dx; F[i].y += f * dy; F[i].z += f * dz;
            F[j].x -= f * dx; F[j].y -= f * dy; F[j].z -= f * dz;
            energy += 0.5 * kSpring * stretch * stretch;
        }

        // Bending term (elastic model): E = (kB/2)·Σ|p_{i−1}−2p_i+p_{i+1}|²
        // with kB normalized by h³ so it approximates ∫κ²ds independently
        // of the discretization density.
        if (model.kind === 'elastic') {
            const h = this.targetEdge;
            const kB = this.rampFactor * model.kBend / (h * h * h);
            for (let i = 0; i < N; i++) {
                const im = (i - 1 + N) % N, ip = (i + 1) % N;
                const a = P[im], c = P[i], b = P[ip];
                const lx = a.x - 2 * c.x + b.x;
                const ly = a.y - 2 * c.y + b.y;
                const lz = a.z - 2 * c.z + b.z;
                energy += 0.5 * kB * (lx * lx + ly * ly + lz * lz);
                F[im].x -= kB * lx; F[im].y -= kB * ly; F[im].z -= kB * lz;
                F[ip].x -= kB * lx; F[ip].y -= kB * ly; F[ip].z -= kB * lz;
                F[i].x += 2 * kB * lx; F[i].y += 2 * kB * ly; F[i].z += 2 * kB * lz;
            }
        }

        // No long-range repulsion — self-avoidance comes from the tube
        // barrier alone. Skip pairs that are close *along the curve*:
        // once the rope tightens, arc-length neighbours sit within the
        // tube diameter of each other and must not be treated as
        // contacts.
        const tube2 = (2 * tubeR) * (2 * tubeR);
        const skip = Math.max(2, Math.min(N >> 2,
            Math.ceil((2.2 * tubeR) / this.targetEdge) + 1));
        for (let i = 0; i < N; i++) {
            for (let j = i + skip; j < N; j++) {
                if (i + N - j < skip) continue;   // circular distance
                const a = P[i], b = P[j];
                const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
                const r2 = dx * dx + dy * dy + dz * dz + 1e-9;
                if (r2 >= tube2) continue;
                const r = Math.sqrt(r2);
                const overlap = (2 * tubeR) - r;
                const fb = kTube * overlap / r;
                F[i].x += fb * dx; F[i].y += fb * dy; F[i].z += fb * dz;
                F[j].x -= fb * dx; F[j].y -= fb * dy; F[j].z -= fb * dz;
                energy += 0.5 * kTube * overlap * overlap;
            }
        }

        // Ropelength's natural readout is length over diameter, not the
        // internal spring/barrier bookkeeping energy.
        this.lastEnergy = (model.kind === 'ropelength')
            ? this.totalLength() / (2 * tubeR)
            : energy;
        return F;
    }
    // Forces of the 'pair' models: the discrete O'Hara energy (see the top
    // of this section), springs on the relative stretch (|e|−h)/h, and the
    // vertex tube barrier. With the w_i·w_j·h^(α−2) weights every term is
    // dimensionless, so the knot's size drops out; for α=2 the energy is
    // scale-invariant outright (≈ 6 for a round circle). Subtracting
    // 1/d^α removes the near-diagonal part, which pushes every edge apart:
    // the bare Σ 1/r^α this replaced inflated knots against the springs to
    // 3–5× their length and crinkled the excess. As in the Knot Energy app;
    // pairMove pins the length besides.
    pairForces() {
        const N = this.N, P = this.points, F = this._scratch();
        const { kSpring, kTube, tubeR } = this.params;
        const h = this.targetEdge, alpha = this.model.alpha;
        const kM = 2 * this.rampFactor * this.params.kRepel;   // ordered pairs
        const hp = Math.pow(h, alpha - 2);
        if (!this._pb || this._pb.N !== N) {
            const f = () => new Float64Array(N);
            this._pb = { N, len: f(), tx: f(), ty: f(), tz: f(), w: f(), G: f(), Gw: f(),
                         S: new Float64Array(N + 1), D: new Float64Array(N + 1),
                         X: new Float64Array(3 * N), FX: new Float64Array(3 * N) };
        }
        // G[k] collects ∂E/∂|e_k|; Gw[v] = ∂E/∂w_v and D, the arc-length
        // terms as differences, are folded into it below, and it becomes
        // forces along the edges. X and FX are the points and the pair
        // forces, flat, for a tight pair loop.
        const { len, tx, ty, tz, w, G, Gw, S, D, X, FX } = this._pb;
        for (let k = 0; k < N; k++) {
            const p = P[k];
            X[3 * k] = p.x; X[3 * k + 1] = p.y; X[3 * k + 2] = p.z;
        }
        S[0] = 0;
        for (let k = 0; k < N; k++) {
            const a = 3 * k, b = 3 * ((k + 1) % N);
            const dx = X[b] - X[a], dy = X[b + 1] - X[a + 1], dz = X[b + 2] - X[a + 2];
            const l = Math.hypot(dx, dy, dz) + 1e-12;
            len[k] = l; tx[k] = dx / l; ty[k] = dy / l; tz[k] = dz / l;
            S[k + 1] = S[k] + l;
            D[k] = 0; Gw[k] = 0;
        }
        D[N] = 0;
        FX.fill(0);
        const L = S[N], halfL = 0.5 * L;
        for (let i = 0; i < N; i++) w[i] = 0.5 * (len[(i - 1 + N) % N] + len[i]);
        let energy = 0;

        const kS = kSpring / (h * h);
        for (let k = 0; k < N; k++) {
            const stretch = len[k] - h;
            G[k] = kS * stretch;
            energy += 0.5 * kS * stretch * stretch;
        }

        // The barrier skips pairs less than π·tubeR apart along the curve: a
        // tube bent no tighter than its radius keeps further pairs a
        // diameter apart, but nearer ones are not contacts.
        const tube = 2 * tubeR, tube2 = tube * tube, arcSkip = Math.PI * tubeR;
        for (let i = 0; i < N; i++) {
            const ax = X[3 * i], ay = X[3 * i + 1], az = X[3 * i + 2];
            const Wi = kM * w[i] * hp, Si = S[i];
            // vertex i's force, weight and arc terms, summed over the row
            let fix = 0, fiy = 0, fiz = 0, gi = 0, di = 0, d0 = 0;
            const jEnd = i === 0 ? N - 1 : N;         // p_{N−1} neighbours p_0
            for (let j = i + 2; j < jEnd; j++) {
                const wj = w[j], j3 = 3 * j;
                const dx = ax - X[j3], dy = ay - X[j3 + 1], dz = az - X[j3 + 2];
                const r2 = dx * dx + dy * dy + dz * dz + 1e-24;
                const A = S[j] - Si;                   // arc i → j (edges i..j−1)
                const d = A <= halfL ? A : L - A;
                // iRE = r^−α, iRF = r^−(α+2), iDE = d^−α, iDF = d^−(α+1)
                const ir2 = 1 / r2, id = 1 / d;
                let iRE, iRF, iDE;
                if (alpha === 1)      { iRE = Math.sqrt(ir2); iRF = iRE * ir2; iDE = id; }
                else if (alpha === 2) { iRE = ir2;       iRF = ir2 * ir2;  iDE = id * id; }
                else                  { iRE = ir2 * ir2; iRF = iRE * ir2;  iDE = id * id * id * id; }
                const kW = Wi * wj, u = iRE - iDE;      // kW = kM·W
                energy += kW * u;
                // −∂/∂p of W/r^α: repel along p_i − p_j (plus the barrier).
                let fMag = alpha * kW * iRF;
                if (r2 < tube2 && d >= arcSkip) {
                    const r = Math.sqrt(r2), overlap = tube - r;
                    fMag += kTube * overlap / r;
                    energy += 0.5 * kTube * overlap * overlap;
                }
                fix += fMag * dx; fiy += fMag * dy; fiz += fMag * dz;
                FX[j3] -= fMag * dx; FX[j3 + 1] -= fMag * dy; FX[j3 + 2] -= fMag * dz;
                // ∂/∂|e_k| of −W/d^α is α·W/d^(α+1) on every edge of the
                // shorter arc: the tension that balances the repulsion.
                const c = alpha * kW * iDE * id;
                if (A <= halfL) { di += c; D[j] -= c; }
                else            { D[j] += c; d0 += c; di -= c; }
                // ∂/∂w of the weights w_i·w_j.
                gi += u * wj;
                Gw[j] += u * Wi;
            }
            Gw[i] += gi * kM * hp;
            D[i] += di; D[0] += d0;
            FX[3 * i] += fix; FX[3 * i + 1] += fiy; FX[3 * i + 2] += fiz;
        }
        for (let k = 0; k < N; k++) {
            F[k].x += FX[3 * k]; F[k].y += FX[3 * k + 1]; F[k].z += FX[3 * k + 2];
        }

        // w_v = (|e_{v−1}| + |e_v|)/2, so ∂E/∂w_v adds half to each edge.
        let acc = 0;
        for (let k = 0; k < N; k++) {
            acc += D[k];
            const g = G[k] + acc + 0.5 * (Gw[k] + Gw[(k + 1) % N]), k1 = (k + 1) % N;
            F[k].x  += g * tx[k]; F[k].y  += g * ty[k]; F[k].z  += g * tz[k];
            F[k1].x -= g * tx[k]; F[k1].y -= g * ty[k]; F[k1].z -= g * tz[k];
        }
        this.lastEnergy = energy;
        return F;
    }
    // A descent step runs in four phases — beginStep(), computeForces(),
    // proposeMove(F), commitMove() — so stepLink() can add the
    // inter-component forces to every chain's F before any chain moves, and
    // cap the moves so no strand passes through another (safeMoveCaps).
    beginStep() {
        // Ramp the driving term (repulsion or bending) from RAMP_FLOOR up
        // to full strength over RAMP_FRAMES steps.
        this.rampFactor = 1;
        if (this.stepCount < this.RAMP_FRAMES) {
            const t = this.stepCount / this.RAMP_FRAMES;
            this.rampFactor = this.RAMP_FLOOR + (1 - this.RAMP_FLOOR) * t * t;
        }
        // Ropelength: tighten by shrinking the spring rest length at fixed
        // tube radius. Floor keeps edges long enough for a sane contact
        // discretization (measured against the minimum tube: the drawn one
        // is often several edges thick, and the knot must still tighten).
        if (this.model.kind === 'ropelength') {
            const minEdge = 0.5 * this.minTubeR;
            this.targetEdge = Math.max(minEdge,
                this.targetEdge * (1 - this.model.shrink));
        }
    }
    // Where this step would put the vertices, as a flat [x0, y0, z0, x1, …]
    // array: the force step, then light Laplacian smoothing. The 'pair'
    // models step by pairMove instead, with dt = tau·h² (see stepLink).
    proposeMove(F, tau) {
        if (this.model.kind === 'pair') return this.pairMove(F, tau);
        let maxF = 0;
        for (let i = 0; i < this.N; i++) {
            const m = F[i].lengthSq();
            if (m > maxF) maxF = m;
        }
        maxF = Math.sqrt(maxF) + 1e-12;
        const dt = Math.min(this.params.dtMax,
                            (this.params.dtSafety * this.targetEdge) / maxF);
        const Q = this.flatPoints();
        for (let i = 0; i < this.N; i++) {
            Q[3 * i] += dt * F[i].x; Q[3 * i + 1] += dt * F[i].y; Q[3 * i + 2] += dt * F[i].z;
        }
        // Slightly stronger Laplacian damping during the warm-up window,
        // then settle into the gentle steady-state value.
        const alpha = this.stepCount < this.RAMP_FRAMES ? 0.15 : 0.05;
        return laplacian(Q, alpha);
    }
    // A 'pair' step at fixed length. The O'Hara flow is stiff — vertex-scale
    // wiggles relax far faster than the knot's shape — so the force is first
    // smoothed along the curve (a Sobolev preconditioner S, as in the Knot
    // Energy app), letting dt grow to suit the shape. The step is
    // V = S(F − λ∇L) with λ = (∇L·SF)/(∇L·S∇L), which leaves the length L
    // unchanged to first order and is still downhill. dt = tau·h², where
    // stepLink adapts tau, but no vertex moves more than dtSafety·h. The
    // drift from the pinned length L₀ (second-order terms, capped moves) is
    // then undone by a Newton step γ·S∇L with γ = (L₀ − L)/(∇L·S∇L). Unlike
    // rescaling about the centroid, that moves a long component's far end
    // no more than its near end.
    pairMove(F, tau) {
        const N = this.N, P = this.points, h = this.targetEdge;
        if (this.pinnedLength === undefined) this.pinnedLength = this.totalLength();
        if (!this._mb || this._mb.N !== N) {
            const f = () => new Float64Array(N);
            this._mb = { N, gL: new Float64Array(3 * N), SF: new Float64Array(3 * N),
                         SG: new Float64Array(3 * N), f: f(), out: f(), y: f() };
        }
        const { gL, SF, SG, f, out, y } = this._mb;
        gL.fill(0);
        let L = 0;
        for (let i = 0; i < N; i++) {
            const j = (i + 1) % N, a = P[i], b = P[j];
            const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
            const l = Math.hypot(dx, dy, dz) + 1e-12;
            L += l;
            // ∂|p_j − p_i|/∂p_j = û = −∂|p_j − p_i|/∂p_i
            gL[3 * j] += dx / l; gL[3 * j + 1] += dy / l; gL[3 * j + 2] += dz / l;
            gL[3 * i] -= dx / l; gL[3 * i + 1] -= dy / l; gL[3 * i + 2] -= dz / l;
        }
        const a = Math.pow(PRECOND_SMOOTHING * N, 2);
        for (let c = 0; c < 3; c++) {
            const ax = c === 0 ? 'x' : c === 1 ? 'y' : 'z';
            for (let i = 0; i < N; i++) f[i] = F[i][ax];
            smoothCyclic(f, out, a, y);
            for (let i = 0; i < N; i++) SF[3 * i + c] = out[i];
            for (let i = 0; i < N; i++) f[i] = gL[3 * i + c];
            smoothCyclic(f, out, a, y);
            for (let i = 0; i < N; i++) SG[3 * i + c] = out[i];
        }
        let gsf = 0, gsg = 0;
        for (let k = 0; k < 3 * N; k++) { gsf += gL[k] * SF[k]; gsg += gL[k] * SG[k]; }
        const lambda = gsf / (gsg + 1e-30);
        let maxV = 0;
        for (let k = 0; k < 3 * N; k++) SF[k] -= lambda * SG[k];
        for (let i = 0; i < N; i++)
            maxV = Math.max(maxV, Math.hypot(SF[3 * i], SF[3 * i + 1], SF[3 * i + 2]));
        const limit = (this.params.dtSafety * h) / (maxV + 1e-12);
        this.tauLimited = tau * h * h < limit;
        const dt = Math.min(tau * h * h, limit);
        // The Newton step, and then the whole move, are held to dtSafety·h
        // per vertex: where the move caps keep trimming a component (a dense
        // weave), its length is restored over several steps rather than
        // with one long move the caps would only trim again.
        let gamma = (this.pinnedLength - L) / (gsg + 1e-30), maxG = 0, maxD = 0;
        for (let i = 0; i < N; i++)
            maxG = Math.max(maxG, Math.hypot(SG[3 * i], SG[3 * i + 1], SG[3 * i + 2]));
        gamma = Math.sign(gamma) * Math.min(Math.abs(gamma), (this.params.dtSafety * h) / (maxG + 1e-12));
        for (let k = 0; k < 3 * N; k++) SF[k] = dt * SF[k] + gamma * SG[k];
        for (let i = 0; i < N; i++)
            maxD = Math.max(maxD, Math.hypot(SF[3 * i], SF[3 * i + 1], SF[3 * i + 2]));
        const k0 = Math.min(1, (this.params.dtSafety * h) / (maxD + 1e-12));
        const Q = this.flatPoints();
        for (let k = 0; k < 3 * N; k++) Q[k] += k0 * SF[k];
        return Q;
    }
    // Move each vertex toward its target T by the fraction caps[i] (≤ 1).
    commitMove(T, caps, countStep = true) {
        for (let i = 0; i < this.N; i++) {
            const p = this.points[i], k = caps[i];
            p.x += k * (T[3 * i] - p.x); p.y += k * (T[3 * i + 1] - p.y); p.z += k * (T[3 * i + 2] - p.z);
        }
        if (countStep) this.stepCount++;
        return this.lastEnergy;
    }
    flatPoints() {
        const Q = new Float64Array(3 * this.N);
        this.points.forEach((p, i) => { Q[3 * i] = p.x; Q[3 * i + 1] = p.y; Q[3 * i + 2] = p.z; });
        return Q;
    }
}

// One pass of Laplacian smoothing of a closed polygon given as a flat array.
function laplacian(Q, alpha) {
    const N = Q.length / 3, R = new Float64Array(Q.length);
    for (let i = 0; i < N; i++) {
        const a = 3 * ((i - 1 + N) % N), b = 3 * ((i + 1) % N), c = 3 * i;
        for (let k = 0; k < 3; k++) R[c + k] = Q[c + k] + alpha * (0.5 * (Q[a + k] + Q[b + k]) - Q[c + k]);
    }
    return R;
}

// The preconditioner's smoothing length, as a fraction of the component.
const PRECOND_SMOOTHING = 0.1;

// Smooth f along a closed curve into out: solve
// (1 + 2a)·v_i − a·(v_{i−1} + v_{i+1}) = f_i. Long-wavelength forces pass
// almost unchanged, while wiggles at the vertex scale (which force tiny
// explicit steps) are damped. Uses the factorisation (a/ρ)(1 − ρS)(1 − ρS⁻¹)
// with two periodic first-order recursions; y is scratch of the same size.
function smoothCyclic(f, out, a, y) {
    const N = f.length;
    if (!(a > 0)) { out.set(f); return; }
    const rho = ((1 + 2 * a) - Math.sqrt(1 + 4 * a)) / (2 * a);
    const wrap = 1 / (1 - Math.pow(rho, N));
    let s = 0, pk = 1;
    for (let k = 0; k < N; k++) { s += pk * f[(N - 1 + k) % N]; pk *= rho; }
    y[N - 1] = s * wrap;
    for (let i = N - 2; i >= 0; i--) y[i] = f[i] + rho * y[i + 1];
    s = 0; pk = 1;
    for (let k = 0; k < N; k++) { s += pk * y[(N - k) % N]; pk *= rho; }
    out[0] = s * wrap;
    for (let i = 1; i < N; i++) out[i] = y[i] + rho * out[i - 1];
    const c = rho / a;
    for (let i = 0; i < N; i++) out[i] *= c;
}

// ─── Link (inter-component) forces ───────────────────────────────────
//
// The components of a link interact through the chains' own model at the
// same ramp: the 'pair' energies add k·W/d^α over every cross pair, with
// W = h_a·h_b·h̄^(α−2) from the two components' target edges (pairForces'
// weights w_i·w_j·h^(α−2) at even spacing; there is no arc length between
// components to subtract), and all models add the tube barrier at
// d < r_a + r_b. Cross pairs are edges, not vertices, and d is the closest
// approach of the two segments: edges are longer than the tube diameter
// (1.1× at even spacing, more where stretched), and two of them can pass
// through each other while every vertex pair stays apart.
// Each pair's force goes to its four endpoints by the closest points'
// barycentric weights.
//
// Cross pairs count against PAIR_BUDGET: while (Σ N)² fits, they are summed
// exactly. Past it (a big weave, whose density floors outrun the budget)
// the 1/d^α term is cut off at LINK_CUTOFF minimum-tube diameters (and no
// nearer than contact), force-shifted so it fades to zero there, and a
// uniform cell grid finds the pairs. The
// barrier and the near repulsion, which keep the link type, are unchanged.

const PAIR_BUDGET = 1200 * 1200;
const LINK_CUTOFF = 4;
// Forward half of a cell's 26 neighbours, so each cell pair is met once.
const HALF_SHELL = [
    [1, 0, 0], [-1, 1, 0], [0, 1, 0], [1, 1, 0],
    [-1, -1, 1], [0, -1, 1], [1, -1, 1], [-1, 0, 1], [0, 0, 1],
    [1, 0, 1], [-1, 1, 1], [0, 1, 1], [1, 1, 1],
];
let linkBuf = null;

const clamp01 = x => x < 0 ? 0 : (x > 1 ? 1 : x);

// Add the cross-component forces into each chain's force array (Fs[c] for
// chs[c]) and return the cross-pair energy.
function addLinkForces(chs, Fs) {
    let n = 0;
    for (const ch of chs) n += ch.N;
    // Flat arrays keep the pair loop tight. Edge i runs from vertex i to
    // vertex nxt[i]; M and H are its midpoint and half-length, R, T and C
    // its chain's tube radius, target edge and index; ids is 0..n−1. G
    // accumulates forces.
    if (!linkBuf || linkBuf.n !== n) {
        linkBuf = { n, X: new Float64Array(3 * n), G: new Float64Array(3 * n),
                    M: new Float64Array(3 * n), H: new Float64Array(n),
                    R: new Float64Array(n), T: new Float64Array(n), C: new Int32Array(n),
                    nxt: new Int32Array(n), ids: Int32Array.from({ length: n }, (_, i) => i) };
    }
    const { X, G, M, H, R, T, C, nxt, ids } = linkBuf;
    const end = new Int32Array(chs.length);    // one past each chain's last vertex
    let v = 0, rMax = 0, r0Max = 0;
    chs.forEach((ch, c) => {
        const v0 = v;
        for (const p of ch.points) {
            X[3 * v] = p.x; X[3 * v + 1] = p.y; X[3 * v + 2] = p.z;
            R[v] = ch.params.tubeR; T[v] = ch.targetEdge; C[v] = c; nxt[v] = v + 1; v++;
        }
        nxt[v - 1] = v0;
        end[c] = v;
        rMax = Math.max(rMax, ch.params.tubeR);
        r0Max = Math.max(r0Max, ch.minTubeR);
    });
    let hMax = 0;
    for (let i = 0; i < n; i++) {
        const a = 3 * i, b = 3 * nxt[i];
        M[a] = 0.5 * (X[a] + X[b]); M[a + 1] = 0.5 * (X[a + 1] + X[b + 1]);
        M[a + 2] = 0.5 * (X[a + 2] + X[b + 2]);
        H[i] = 0.5 * Math.hypot(X[b] - X[a], X[b + 1] - X[a + 1], X[b + 2] - X[a + 2]);
        if (H[i] > hMax) hMax = H[i];
    }
    G.fill(0);

    // The chains share one model and step in lockstep, so chain 0's
    // constants and ramp stand for all of them.
    const ch0 = chs[0], isPair = ch0.model.kind === 'pair', alpha = ch0.model.alpha;
    const kM = 2 * ch0.rampFactor * ch0.params.kRepel, kTube = ch0.params.kTube;
    // Barrier-only models need nothing past the contact distance. The
    // 'pair' cut-off is measured in the minimum tube, not the drawn one, so
    // thick tubes do not inflate the far field's cost.
    const rc = !isPair ? 2 * rMax
             : (n * n <= PAIR_BUDGET ? Infinity : Math.max(LINK_CUTOFF * 2 * r0Max, 2 * rMax));
    const rc2 = rc * rc;
    const shift = isPair && rc !== Infinity;
    const sE = shift ? kM / Math.pow(rc, alpha) : 0;
    const sF = shift ? alpha * kM / Math.pow(rc, alpha + 1) : 0;
    let energy = 0;
    const cull = rc !== Infinity;

    // Edge i against edges js[j0..j1) of other components. Edge i's terms
    // are hoisted and its own force is summed once per row.
    function row(i, js, j0, j1) {
        const a = 3 * i, b = 3 * nxt[i], ci = C[i], ri = R[i], hi = H[i], ti = T[i];
        const ax = X[a], ay = X[a + 1], az = X[a + 2];
        const ux = X[b] - ax, uy = X[b + 1] - ay, uz = X[b + 2] - az;
        const uu = ux * ux + uy * uy + uz * uz + 1e-12;
        let gax = 0, gay = 0, gaz = 0, gbx = 0, gby = 0, gbz = 0, e = 0;
        for (let k = j0; k < j1; k++) {
            const j = js[k];
            if (C[j] === ci) continue;
            const c = 3 * j, d = 3 * nxt[j];
            if (cull) {
                // Segments too far apart to come within rc.
                const mx = M[a] - M[c], my = M[a + 1] - M[c + 1], mz = M[a + 2] - M[c + 2];
                const reach = rc + hi + H[j];
                if (mx * mx + my * my + mz * mz >= reach * reach) continue;
            }
            // Closest points a + s(b − a) and c + t(d − c) of the two segments.
            const cx = X[c], cy = X[c + 1], cz = X[c + 2];
            const vx = X[d] - cx, vy = X[d + 1] - cy, vz = X[d + 2] - cz;
            const wx = ax - cx, wy = ay - cy, wz = az - cz;
            const vv = vx * vx + vy * vy + vz * vz + 1e-12, uv = ux * vx + uy * vy + uz * vz;
            const uw = ux * wx + uy * wy + uz * wz, vw = vx * wx + vy * wy + vz * wz;
            const den = uu * vv - uv * uv;
            let s = den > 1e-12 ? clamp01((uv * vw - uw * vv) / den) : 0;
            let t = (uv * s + vw) / vv;
            if (t < 0)      { t = 0; s = clamp01(-uw / uu); }
            else if (t > 1) { t = 1; s = clamp01((uv - uw) / uu); }
            const dx = wx + s * ux - t * vx, dy = wy + s * uy - t * vy, dz = wz + s * uz - t * vz;
            const r2 = dx * dx + dy * dy + dz * dz + 1e-9;
            if (r2 >= rc2) continue;
            let f = 0;
            if (isPair) {
                // Same 1/r^α kernel as KnotChain.pairForces, weight W.
                const tj = T[j], hm = 0.5 * (ti + tj);
                const W = alpha === 2 ? ti * tj : alpha === 1 ? ti * tj / hm : ti * tj * hm * hm;
                let rPowE, rPowF;
                if (alpha === 1)      { const r = Math.sqrt(r2); rPowE = r;       rPowF = r2 * r; }
                else if (alpha === 2) { rPowE = r2;      rPowF = r2 * r2; }
                else                  { rPowE = r2 * r2; rPowF = r2 * r2 * r2; }
                f = W * (alpha * kM) / rPowF;
                e += W * kM / rPowE;
                if (shift) {
                    // E − E(rc) − E′(rc)(r − rc): energy and force both vanish at rc.
                    const r = Math.sqrt(r2);
                    f -= W * sF / r;
                    e += W * (sF * (r - rc) - sE);
                }
            }
            const contact = ri + R[j];
            if (r2 < contact * contact) {
                const b = contactBarrier(kTube, contact, Math.sqrt(r2));
                f += b.f; e += b.e;
            }
            const fx = f * dx, fy = f * dy, fz = f * dz;
            gax += (1 - s) * fx; gay += (1 - s) * fy; gaz += (1 - s) * fz;
            gbx += s * fx;       gby += s * fy;       gbz += s * fz;
            G[c] -= (1 - t) * fx; G[c + 1] -= (1 - t) * fy; G[c + 2] -= (1 - t) * fz;
            G[d] -= t * fx;       G[d + 1] -= t * fy;       G[d + 2] -= t * fz;
        }
        G[a] += gax; G[a + 1] += gay; G[a + 2] += gaz;
        G[b] += gbx; G[b + 1] += gby; G[b + 2] += gbz;
        energy += e;
    }

    if (rc === Infinity) {
        for (let i = 0; i < n; i++) row(i, ids, end[C[i]], n);
    } else {
        // Edges binned by midpoint into cells of side h over the link's
        // bounding box. Two segments within rc have midpoints within h, so a
        // cell need only meet itself and its HALF_SHELL neighbours.
        const h = rc + 2 * hMax;
        let x0 = Infinity, y0 = Infinity, z0 = Infinity;
        let x1 = -Infinity, y1 = -Infinity, z1 = -Infinity;
        for (let i = 0; i < n; i++) {
            const x = M[3 * i], y = M[3 * i + 1], z = M[3 * i + 2];
            if (x < x0) x0 = x; if (x > x1) x1 = x;
            if (y < y0) y0 = y; if (y > y1) y1 = y;
            if (z < z0) z0 = z; if (z > z1) z1 = z;
        }
        const nx = Math.floor((x1 - x0) / h) + 1, ny = Math.floor((y1 - y0) / h) + 1;
        const nz = Math.floor((z1 - z0) / h) + 1;
        const cells = new Map();
        for (let i = 0; i < n; i++) {
            const key = Math.floor((M[3 * i] - x0) / h) + nx * (
                Math.floor((M[3 * i + 1] - y0) / h) + ny * Math.floor((M[3 * i + 2] - z0) / h));
            const list = cells.get(key);
            if (list) list.push(i); else cells.set(key, [i]);
        }
        for (const [key, list] of cells) {
            for (let a = 0; a < list.length; a++) row(list[a], list, a + 1, list.length);
            const ix = key % nx, iy = Math.floor(key / nx) % ny, iz = Math.floor(key / (nx * ny));
            for (const [ox, oy, oz] of HALF_SHELL) {
                const jx = ix + ox, jy = iy + oy, jz = iz + oz;
                if (jx < 0 || jy < 0 || jz < 0 || jx >= nx || jy >= ny || jz >= nz) continue;
                const other = cells.get(jx + nx * (jy + ny * jz));
                if (other) for (const a of list) row(a, other, 0, other.length);
            }
        }
    }

    v = 0;
    chs.forEach((ch, c) => {
        const F = Fs[c];
        for (let i = 0; i < ch.N; i++, v++) {
            F[i].x += G[3 * v]; F[i].y += G[3 * v + 1]; F[i].z += G[3 * v + 2];
        }
    });
    return energy;
}

// ─── Crossing protection ─────────────────────────────────────────────
//
// The energies' barriers are soft and act between vertices, so on their own
// they cannot stop a strand passing through another: long edges slip
// between vertices, and strong driving forces (Coulomb's far field, the
// ropelength squeeze) push through the penalty. So every move is capped.
//
// If two non-adjacent edges are a distance g apart and every point of both
// moves less than g/2, they cannot meet while the move runs (points move
// linearly, by convex combinations of their endpoints' moves). So vertex v
// may move at most SAFE_FRACTION·g_v, where g_v is the closest approach of
// either edge at v to any edge not adjacent to it, in any component. That
// holds for every edge pair, so no move can change the knot or link type.
// Only vertices near a contact are slowed; the rest move freely.

const SAFE_FRACTION = 0.45;
// Gaps are kept above GAP_FLOOR·(tube radius): an edge driven onto another
// would otherwise close the gap geometrically until rounding decides which
// strand is on top.
const GAP_FLOOR = 0.02;

// Barrier between two edges at closest approach r < contact (the sum of
// their tube radii): force k·(contact − r)·contact/r along the gap, which
// grows without bound as r → 0, so no driving force can flatten a contact.
// f is per unit displacement (multiply by the gap vector); e is the energy.
function contactBarrier(k, contact, r) {
    return { f: k * (contact - r) * contact / (r * r),
             e: k * contact * (contact * Math.log(contact / r) - (contact - r)) };
}

// Contact barrier between non-neighbouring edges of the same component,
// measured edge to edge. The chains' own barrier is between vertices, and
// once the repulsion has stretched the edges past the tube diameter another
// strand can come down between two vertices, onto the middle of an edge.
// Edges closer along the curve than the tube diameter are skipped, as in
// computeForces, so a tightened rope's neighbours are not contacts.
function addSelfContactForces(chs, Fs) {
    let energy = 0;
    chs.forEach((ch, c) => {
        const N = ch.N, P = ch.points, F = Fs[c];
        const contact = 2 * ch.params.tubeR, kTube = ch.params.kTube;
        const skip = Math.max(2, Math.min(N >> 2, Math.ceil(contact * 1.1 / ch.targetEdge) + 1));
        const X = ch.flatPoints();
        const M = new Float64Array(3 * N), H = new Float64Array(N);
        let hMax = 0;
        for (let i = 0; i < N; i++) {
            const a = 3 * i, b = 3 * ((i + 1) % N);
            for (let k = 0; k < 3; k++) M[a + k] = 0.5 * (X[a + k] + X[b + k]);
            H[i] = 0.5 * Math.hypot(X[b] - X[a], X[b + 1] - X[a + 1], X[b + 2] - X[a + 2]);
            if (H[i] > hMax) hMax = H[i];
        }
        const cs = { s: 0, t: 0 };
        const pair = (i, j) => {
            const d = Math.abs(i - j);
            if (Math.min(d, N - d) < skip) return;
            const reach = contact + H[i] + H[j];
            const mx = M[3 * i] - M[3 * j], my = M[3 * i + 1] - M[3 * j + 1], mz = M[3 * i + 2] - M[3 * j + 2];
            if (mx * mx + my * my + mz * mz >= reach * reach) return;
            const a = 3 * i, b = 3 * ((i + 1) % N), cc = 3 * j, dd = 3 * ((j + 1) % N);
            const r2 = segSegDist2(X, a, b, cc, dd, cs);
            if (r2 >= contact * contact) return;
            const r = Math.sqrt(r2) + 1e-12;
            const { f, e } = contactBarrier(kTube, contact, r);
            energy += e;
            const { s, t } = cs;
            // gap vector from the closest point on edge j to that on edge i
            const gx = (X[a] + s * (X[b] - X[a])) - (X[cc] + t * (X[dd] - X[cc]));
            const gy = (X[a + 1] + s * (X[b + 1] - X[a + 1])) - (X[cc + 1] + t * (X[dd + 1] - X[cc + 1]));
            const gz = (X[a + 2] + s * (X[b + 2] - X[a + 2])) - (X[cc + 2] + t * (X[dd + 2] - X[cc + 2]));
            const fx = f * gx, fy = f * gy, fz = f * gz;
            const vi = i, vb = (i + 1) % N, vj = j, vd = (j + 1) % N;
            F[vi].x += (1 - s) * fx; F[vi].y += (1 - s) * fy; F[vi].z += (1 - s) * fz;
            F[vb].x += s * fx;       F[vb].y += s * fy;       F[vb].z += s * fz;
            F[vj].x -= (1 - t) * fx; F[vj].y -= (1 - t) * fy; F[vj].z -= (1 - t) * fz;
            F[vd].x -= t * fx;       F[vd].y -= t * fy;       F[vd].z -= t * fz;
        };
        forEachNearPair(M, N, contact + 2 * hMax, pair);
    });
    return energy;
}

// Call fn(i, j) once for every pair of points (midpoints M, flat) whose
// cells, of side h, touch: every pair closer than h is among them.
function forEachNearPair(M, n, h, fn) {
    let x0 = Infinity, y0 = Infinity, z0 = Infinity;
    for (let i = 0; i < n; i++) {
        x0 = Math.min(x0, M[3 * i]); y0 = Math.min(y0, M[3 * i + 1]); z0 = Math.min(z0, M[3 * i + 2]);
    }
    const key = (x, y, z) => x + 4096 * (y + 4096 * z);
    const cellOf = i => [Math.floor((M[3 * i] - x0) / h), Math.floor((M[3 * i + 1] - y0) / h),
                         Math.floor((M[3 * i + 2] - z0) / h)];
    const cells = new Map();
    for (let i = 0; i < n; i++) {
        const k = key(...cellOf(i));
        const list = cells.get(k);
        if (list) list.push(i); else cells.set(k, [i]);
    }
    for (const list of cells.values()) {
        const [ix, iy, iz] = cellOf(list[0]);
        for (let a = 0; a < list.length; a++) for (let b = a + 1; b < list.length; b++) fn(list[a], list[b]);
        for (const [ox, oy, oz] of HALF_SHELL) {
            const other = cells.get(key(ix + ox, iy + oy, iz + oz));
            if (other) for (const a of list) for (const b of other) fn(a, b);
        }
    }
}

// caps[c][i] ∈ [0, 1]: the fraction of its proposed move (to targets[c])
// vertex i of chain c may make.
function safeMoveCaps(chs, targets) {
    let n = 0;
    for (const ch of chs) n += ch.N;
    const X = new Float64Array(3 * n), D = new Float64Array(n);
    const C = new Int32Array(n), I = new Int32Array(n), nxt = new Int32Array(n);
    let v = 0, dMax = 0;
    chs.forEach((ch, c) => {
        const v0 = v, T = targets[c];
        ch.points.forEach((p, i) => {
            X[3 * v] = p.x; X[3 * v + 1] = p.y; X[3 * v + 2] = p.z;
            D[v] = Math.hypot(T[3 * i] - p.x, T[3 * i + 1] - p.y, T[3 * i + 2] - p.z);
            if (D[v] > dMax) dMax = D[v];
            C[v] = c; I[v] = i; nxt[v] = v + 1; v++;
        });
        nxt[v - 1] = v0;
    });
    const caps = chs.map(ch => new Float64Array(ch.N).fill(1));
    if (dMax === 0) return caps;
    // Only gaps under dMax / SAFE_FRACTION (plus the floor) can limit a vertex.
    let floorMax = 0;
    for (const ch of chs) floorMax = Math.max(floorMax, GAP_FLOOR * ch.params.tubeR);
    const cut = dMax / SAFE_FRACTION + floorMax;
    const gap = new Float64Array(n).fill(Infinity);   // per edge i → nxt[i]
    const M = new Float64Array(3 * n), H = new Float64Array(n);
    let hMax = 0;
    for (let i = 0; i < n; i++) {
        const a = 3 * i, b = 3 * nxt[i];
        for (let k = 0; k < 3; k++) M[a + k] = 0.5 * (X[a + k] + X[b + k]);
        H[i] = 0.5 * Math.hypot(X[b] - X[a], X[b + 1] - X[a + 1], X[b + 2] - X[a + 2]);
        if (H[i] > hMax) hMax = H[i];
    }
    function test(i, j) {
        if (C[i] === C[j]) {
            const N = chs[C[i]].N, d = Math.abs(I[i] - I[j]);
            if (Math.min(d, N - d) <= 1) return;          // edges sharing a vertex
        }
        const reach = cut + H[i] + H[j];
        const mx = M[3 * i] - M[3 * j], my = M[3 * i + 1] - M[3 * j + 1], mz = M[3 * i + 2] - M[3 * j + 2];
        if (mx * mx + my * my + mz * mz >= reach * reach) return;
        const g = Math.sqrt(segSegDist2(X, 3 * i, 3 * nxt[i], 3 * j, 3 * nxt[j]));
        if (g < gap[i]) gap[i] = g;
        if (g < gap[j]) gap[j] = g;
    }
    // Edges binned by midpoint: two edges within cut have midpoints within
    // cut + 2·hMax.
    forEachNearPair(M, n, cut + 2 * hMax, test);
    // Vertex v ends edges v → nxt[v] and prev → v.
    const prev = new Int32Array(n);
    for (let i = 0; i < n; i++) prev[nxt[i]] = i;
    for (let i = 0; i < n; i++) {
        const floor = GAP_FLOOR * chs[C[i]].params.tubeR;
        const limit = SAFE_FRACTION * Math.max(0, Math.min(gap[i], gap[prev[i]]) - floor);
        if (D[i] > limit) caps[C[i]][I[i]] = limit / D[i];
    }
    return caps;
}

// Squared closest approach of segments X[a..]→X[b..] and X[c..]→X[d..];
// the closest points' parameters go to out.s, out.t when out is given.
function segSegDist2(X, a, b, c, d, out) {
    const ux = X[b] - X[a], uy = X[b + 1] - X[a + 1], uz = X[b + 2] - X[a + 2];
    const vx = X[d] - X[c], vy = X[d + 1] - X[c + 1], vz = X[d + 2] - X[c + 2];
    const wx = X[a] - X[c], wy = X[a + 1] - X[c + 1], wz = X[a + 2] - X[c + 2];
    const uu = ux * ux + uy * uy + uz * uz + 1e-12, vv = vx * vx + vy * vy + vz * vz + 1e-12;
    const uv = ux * vx + uy * vy + uz * vz, uw = ux * wx + uy * wy + uz * wz, vw = vx * wx + vy * wy + vz * wz;
    const den = uu * vv - uv * uv;
    let s = den > 1e-12 ? clamp01((uv * vw - uw * vv) / den) : 0;
    let t = (uv * s + vw) / vv;
    if (t < 0)      { t = 0; s = clamp01(-uw / uu); }
    else if (t > 1) { t = 1; s = clamp01((uv - uw) / uu); }
    if (out) { out.s = s; out.t = t; }
    const dx = wx + s * ux - t * vx, dy = wy + s * uy - t * vy, dz = wz + s * uz - t * vz;
    return dx * dx + dy * dy + dz * dz;
}

// One descent step for the whole link: every chain's own forces, plus the
// cross-component ones, are in place before any chain moves, and the moves
// are capped so no strand passes through another.
//
// The 'pair' models' step size dt = tau·h² (see pairMove) is adapted per
// link on its total energy, bold-driver style: tau grows by TAU_GROW after a
// downhill step it limited and halves after an uphill one. The ramp raises
// the energy by design, so its steps are not judged.
const TAU_START = 1, TAU_GROW = 1.2;
let linkEnergy = 0;
let pairStep = { chains: null, tau: TAU_START, prevE: null };
function stepLink(chs) {
    const Fs = chs.map(ch => { ch.beginStep(); return ch.computeForces(); });
    linkEnergy = (chs.length > 1 ? addLinkForces(chs, Fs) : 0) + addSelfContactForces(chs, Fs);
    if (pairStep.chains !== chs) pairStep = { chains: chs, tau: TAU_START, prevE: null };
    if (chs[0].model.kind === 'pair') {
        const E = chs.reduce((s, ch) => s + ch.lastEnergy, linkEnergy);
        if (chs[0].stepCount < chs[0].RAMP_FRAMES) pairStep.prevE = null;
        else {
            if (pairStep.prevE !== null) {
                if (E > pairStep.prevE + 1e-9 * Math.abs(pairStep.prevE)) pairStep.tau *= 0.5;
                else if (chs.some(ch => ch.tauLimited)) pairStep.tau *= TAU_GROW;
            }
            pairStep.prevE = E;
        }
    }
    const targets = chs.map((ch, c) => ch.proposeMove(Fs[c], pairStep.tau));
    const caps = safeMoveCaps(chs, targets);
    chs.forEach((ch, c) => ch.commitMove(targets[c], caps[c]));
}

// Warm-up: a handful of pure Laplacian smoothing passes to round off the
// kinks where mosaic-tile pieces meet, before any forces are computed. This
// is the single biggest reduction in the initial "ringing" effect. Capped
// like any step, so coarse samplings cannot smooth one strand through
// another. strength[c] ∈ (0, 1] scales component c's smoothing.
function warmUpLink(chs, strength) {
    for (let k = 0; k < 10; k++) {
        const targets = chs.map((ch, c) => laplacian(ch.flatPoints(), 0.5 * strength[c]));
        const caps = safeMoveCaps(chs, targets);
        chs.forEach((ch, c) => ch.commitMove(targets[c], caps[c], false));
    }
}

// Translate the link so the common centroid of all its vertices sits at the
// origin. Centring each component on its own centroid instead would stack
// the components of a link on top of each other.
function recenterLink(chs) {
    let cx = 0, cy = 0, cz = 0, n = 0;
    for (const ch of chs) for (const p of ch.points) { cx += p.x; cy += p.y; cz += p.z; n++; }
    if (n === 0) return;
    cx /= n; cy /= n; cz /= n;
    for (const ch of chs) for (const p of ch.points) { p.x -= cx; p.y -= cy; p.z -= cz; }
}

function resampleClosed(pts, M) {
    if (pts.length < 4) return pts.slice();
    // Centripetal Catmull-Rom over the loop control points gives a C¹
    // curve, so the resampled polygon has no sharp kinks at mosaic-tile
    // boundaries. That eliminates most of the high-frequency content
    // that the energy gradient would otherwise amplify on step 1.
    const curve = new THREE.CatmullRomCurve3(pts, /*closed*/ true,
        'centripetal', 0.5);
    const out = new Array(M);
    for (let k = 0; k < M; k++) {
        out[k] = curve.getPoint(k / M);
    }
    return out;
}

// ─── Three.js scene ──────────────────────────────────────────────────

let scene, camera, renderer, controls;
let tubeMesh, tubeMaterial;
let chains = [];                // multi-component support
let animId = null;
let running = false;
let stepsPerFrame = 4;
let energyKey = 'mobius';
let tubeRadius = 0.18;
const MOSAIC_SCALE = 4.0;       // world units per tile of a disk mosaic
let tileSize = MOSAIC_SCALE;    // world size of one tile (see openSmooth)
let frameCounter = 0;
let userTouchedCamera = false;

function initScene() {
    const c = document.getElementById('smooth-canvas');
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0e1a);

    camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.01, 5000);
    camera.position.set(0, 0, 14);

    renderer = new THREE.WebGLRenderer({ canvas: c, antialias: true });
    renderer.setSize(innerWidth, innerHeight);
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

    controls = new THREE.OrbitControls(camera, c);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.addEventListener('start', () => { userTouchedCamera = true; });

    scene.add(new THREE.HemisphereLight(0x8da5ff, 0x1a1f35, 0.55));
    const key = new THREE.DirectionalLight(0xffffff, 0.85);
    key.position.set(6, 8, 10);
    scene.add(key);
    const rim = new THREE.DirectionalLight(0xc084fc, 0.45);
    rim.position.set(-6, -4, -8);
    scene.add(rim);

    tubeMaterial = new THREE.MeshPhysicalMaterial({
        color: 0x6c8aff,
        metalness: 0.35,
        roughness: 0.28,
        clearcoat: 0.6,
        clearcoatRoughness: 0.2,
    });
}

function disposeTubeMeshes() {
    if (!tubeMesh) return;
    if (Array.isArray(tubeMesh)) {
        for (const m of tubeMesh) {
            scene.remove(m);
            m.geometry.dispose();
        }
    } else {
        scene.remove(tubeMesh);
        tubeMesh.geometry.dispose();
    }
    tubeMesh = null;
}

// Tube segments per component: 3 per vertex, thinned evenly when the total
// passes TUBE_SEG_BUDGET. The tubes are rebuilt every frame, and for a big
// many-component link that rebuild, not the physics, is what stalls.
const TUBE_SEG_BUDGET = 6000;
function tubeSegments(ch) {
    const total = chains.reduce((s, c) => s + c.points.length * 3, 0);
    const k = Math.min(1, TUBE_SEG_BUDGET / total);
    return Math.max(120, Math.round(ch.points.length * 3 * k));
}

// The tubes are drawn at the Radius slider's value times half a mosaic tile
// (0.18 → 0.09 tile, the old auto-scaled width on a small knot), so their
// width follows the strand spacing, one tile, not the knot's overall size.
// The barriers act at the same radius (KnotChain.setTubeRadius), so drawn
// tubes keep apart wherever the physics does.
function drawnTubeRadius() {
    return 0.5 * tubeRadius * tileSize;
}
function applyTubeRadius() {
    const r = drawnTubeRadius();
    for (const ch of chains) ch.setTubeRadius(r);
}

function buildTubes() {
    disposeTubeMeshes();
    tubeMesh = chains.map(ch => {
        const curve = new THREE.CatmullRomCurve3(ch.points, true, 'centripetal', 0.5);
        const segs  = tubeSegments(ch);
        const geo   = new THREE.TubeGeometry(curve, segs, drawnTubeRadius(), 16, true);
        const mesh  = new THREE.Mesh(geo, tubeMaterial);
        scene.add(mesh);
        return mesh;
    });
}

function frameAll() {
    const box = new THREE.Box3();
    for (const ch of chains) for (const p of ch.points) box.expandByPoint(p);
    if (box.isEmpty()) return;
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    // Use whichever FOV (vertical or horizontal) is more constrained so
    // the knot fits even in narrow / portrait viewports.
    const vfov = camera.fov * Math.PI / 180;
    const hfov = 2 * Math.atan(Math.tan(vfov / 2) * camera.aspect);
    const limitFov = Math.min(vfov, hfov);
    // Generous padding (×2.0) since the chain typically expands a bit
    // from its mosaic-coordinate starting position once repulsion kicks in.
    const dist = Math.max(6, sphere.radius / Math.tan(limitFov / 2) * 2.0);
    camera.position.set(sphere.center.x, sphere.center.y, sphere.center.z + dist);
    controls.target.copy(sphere.center);
    controls.update();
}

function loop() {
    if (running) {
        // Up to stepsPerFrame steps, stopping early once a frame has taken
        // 40 ms so a big link keeps the view responsive.
        const t0 = performance.now();
        for (let s = 0; s < stepsPerFrame; s++) {
            stepLink(chains);
            if (performance.now() - t0 > 40) break;
        }
        recenterLink(chains);
        const radius = drawnTubeRadius();
        chains.forEach((ch, idx) => {
            const curve = new THREE.CatmullRomCurve3(ch.points, true, 'centripetal', 0.5);
            const segs  = tubeSegments(ch);
            const newGeo = new THREE.TubeGeometry(curve, segs, radius, 16, true);
            tubeMesh[idx].geometry.dispose();
            tubeMesh[idx].geometry = newGeo;
        });
        // Ropelength reads out L/D per component; the cross barrier is
        // bookkeeping there, as the chain's own barrier is.
        const totalE = chains.reduce((s, ch) => s + ch.lastEnergy, 0) +
            (ENERGY_MODELS[energyKey].kind === 'ropelength' ? 0 : linkEnergy);
        const energyEl = document.getElementById('smooth-energy');
        if (energyEl) energyEl.textContent = totalE.toFixed(1);

        // Re-frame the camera every ~60 frames (≈1 s) until the user
        // interacts with the OrbitControls — keeps the knot in view as
        // it expands from its initial mosaic-tile-coordinate scale.
        frameCounter++;
        if (!userTouchedCamera && frameCounter % 60 === 0) frameAll();
    }
    controls.update();
    renderer.render(scene, camera);
    animId = requestAnimationFrame(loop);
}

function onResize() {
    if (!renderer) return;
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
}

// ─── Build chains from the current mosaic ────────────────────────────

// ─── Folded-surface extractors ───────────────────────────────────────
//
// Both surfaces use the same Lomonaco–Kauffman tile pieces, but with a
// different topology (and a per-piece transform that maps flat tile
// coordinates onto the folded surface in world space).

// Map a point in the unfolded torus net (x, y, z) ∈ [-0.5,0.5]² × [tiny] to
// its folded torus position. Mirrors `applyFold(1.0)` from torus3d.js.
function flatToTorus(p) {
    const Rm = 1.0 / (2.0 * Math.PI);
    const RM = 2.0 * Rm;
    // Phase 1: cylinder around X.
    const a1 = p.x * 2.0 * Math.PI;
    const r1 = Rm + p.z;
    const x1 = r1 * Math.sin(a1);
    const y1 = p.y;
    const z1 = r1 * Math.cos(a1) - Rm;
    // Phase 2: torus around Y.
    const a2 = y1 * 2.0 * Math.PI;
    const tubeZ = z1 + Rm;
    const Rc = RM + tubeZ;
    return new THREE.Vector3(x1, Rc * Math.sin(a2), Rc * Math.cos(a2) - RM - Rm);
}

function extractTorusPolylines(grid) {
    const gs = grid.length;
    const cs = 1.0 / gs;
    // Walker emits points where (x, y) are in raw tile coords:
    //   x ∈ [0, gs] (left → right), y ∈ [-gs, 0] (top → bottom, y-flipped).
    // Map onto the unfolded torus net (x, y) ∈ [-0.5, 0.5]² and then onto
    // the folded torus surface.
    return mosaicToPolygons(grid, 'torus', flat => {
        const fx = flat.x * cs - 0.5;
        const fy = flat.y * cs + 0.5;
        const fz = flat.z * cs * 0.7;
        return flatToTorus(new THREE.Vector3(fx, fy, fz));
    });
}

// Cube/sphere face adjacency. When a strand exits face F via side S, this
// tells us which (face, side) it enters next, plus how to remap the
// coordinate along that edge. Coordinate convention: each face has its
// grid (row, col) where row 0 is N, row gs-1 is S, col 0 is W, col gs-1 is E.
// `flip` reverses the index along the shared edge — needed when the two
// face orientations don't agree on direction.
//
// We deduce these by following each cube edge from front-face outward.
const CUBE_ADJ = {
    // Front face: net-adjacent on all 4 sides.
    front: { N: { face: 'top',    side: 'S', flip: false },
             S: { face: 'bottom', side: 'N', flip: false },
             W: { face: 'left',   side: 'E', flip: false },
             E: { face: 'right',  side: 'W', flip: false } },

    // Top face: meets front on its S; meets back on its N (back appears
    // upside-down on top, so flip); meets left.N on top.W; meets right.N on top.E.
    top: {    N: { face: 'back',  side: 'N', flip: true  },
              S: { face: 'front', side: 'N', flip: false },
              W: { face: 'left',  side: 'N', flip: true  },
              E: { face: 'right', side: 'N', flip: false } },

    // Bottom face: mirror of top across the cube.
    bottom: { N: { face: 'front', side: 'S', flip: false },
              S: { face: 'back',  side: 'S', flip: true  },
              W: { face: 'left',  side: 'S', flip: false },
              E: { face: 'right', side: 'S', flip: true  } },

    // Left face: net-adjacent to front on its E; meets back on its W.
    left: {   N: { face: 'top',    side: 'W', flip: true  },
              S: { face: 'bottom', side: 'W', flip: false },
              W: { face: 'back',   side: 'E', flip: false },
              E: { face: 'front',  side: 'W', flip: false } },

    // Right face: net-adjacent to front (W) and back (E).
    right: {  N: { face: 'top',    side: 'E', flip: false },
              S: { face: 'bottom', side: 'E', flip: true  },
              W: { face: 'front',  side: 'E', flip: false },
              E: { face: 'back',   side: 'W', flip: false } },

    // Back face: net-adjacent to right (W); top/bottom flipped; left at far W.
    back: {   N: { face: 'top',    side: 'N', flip: true  },
              S: { face: 'bottom', side: 'S', flip: true  },
              W: { face: 'right',  side: 'E', flip: false },
              E: { face: 'left',   side: 'W', flip: false } },
};

// Walk a sphere mosaic across all 6 faces, tracking strand pieces. Each
// face's piece coordinates get transformed into world coords by applying
// the face's current matrixWorld from cube3d.js (which encodes the fold).
function extractSpherePolylines(faces) {
    const FACES = ['front', 'top', 'bottom', 'left', 'right', 'back'];
    const fs = faces.front.length;          // grid is fs × fs

    // Build all pieces, keyed by (face|i|j|side) → piece+end.
    const pieces = [];
    const lookup = new Map();
    for (const face of FACES) {
        for (let j = 0; j < fs; j++) for (let i = 0; i < fs; i++) {
            const ti = faces[face][j][i];
            for (const piece of makePieces(ti, i, j)) {
                const idx = pieces.length;
                pieces.push({ ...piece, face, i, j });
                lookup.set(`${face}|${i}|${j}|${piece.sides[0]}`, { idx, end: 0 });
                lookup.set(`${face}|${i}|${j}|${piece.sides[1]}`, { idx, end: 1 });
            }
        }
    }
    if (pieces.length === 0) throw new Error('No tiles placed');

    // Per-face → world transform. Each face has a flat-coord position
    // (x ∈ [-0.5, 0.5], y ∈ [-0.5, 0.5], z = 0) within face-local space,
    // which we then apply the face's matrixWorld to.
    const cubeRoot = window.__cubeRoot && window.__cubeRoot();
    if (!cubeRoot) throw new Error('Cube fold scene not available — fold first.');

    function tilePointToWorld(face, i, j, p) {
        // p is in walker coords: x ∈ [0, fs], y ∈ [-fs, 0] (y-flipped).
        // Convert to face-local (x, y ∈ [-0.5, 0.5]) with tiny z lift.
        const cs = 1.0 / fs;
        const fx = p.x * cs - 0.5;
        const fy = p.y * cs + 0.5;
        const fz = p.z * cs * 0.7;
        const v = new THREE.Vector3(fx, fy, fz);
        return cubeRoot.faceToWorld(face, v);
    }

    function neighbor(face, i, j, side) {
        const inside = ((side === 'N' && j > 0) || (side === 'S' && j < fs - 1) ||
                        (side === 'W' && i > 0) || (side === 'E' && i < fs - 1));
        if (inside) {
            const [dx, dy] = NEIGHBOR[side];
            return { face, i: i + dx, j: j + dy, side: OPP[side] };
        }
        // Cross a cube edge.
        const adj = CUBE_ADJ[face][side];
        const param = (side === 'N' || side === 'S') ? i : j;   // index along edge
        let p = adj.flip ? (fs - 1 - param) : param;
        let ni, nj;
        switch (adj.side) {
            case 'N': ni = p;       nj = 0;        break;
            case 'S': ni = p;       nj = fs - 1;   break;
            case 'W': ni = 0;       nj = p;        break;
            case 'E': ni = fs - 1;  nj = p;        break;
        }
        return { face: adj.face, i: ni, j: nj, side: adj.side };
    }

    const visited = new Array(pieces.length).fill(false);
    const loops = [];
    for (let s = 0; s < pieces.length; s++) {
        if (visited[s]) continue;
        const loop = [];
        let curIdx = s, entryEnd = 0;
        while (!visited[curIdx]) {
            visited[curIdx] = true;
            const p = pieces[curIdx];
            const exitEnd = 1 - entryEnd;
            const localPts = (entryEnd === 0) ? p.points : [...p.points].reverse();
            const startK = loop.length === 0 ? 0 : 1;
            for (let k = startK; k < localPts.length; k++) {
                loop.push(tilePointToWorld(p.face, p.i, p.j, localPts[k]));
            }
            const exitSide = p.sides[exitEnd];
            const nb = neighbor(p.face, p.i, p.j, exitSide);
            const nextRec = lookup.get(`${nb.face}|${nb.i}|${nb.j}|${nb.side}`);
            if (!nextRec) {
                throw new Error(
                    `Connection mismatch from ${p.face} (${p.i},${p.j}) side ${exitSide} → ` +
                    `${nb.face} (${nb.i},${nb.j}) side ${nb.side}`);
            }
            curIdx = nextRec.idx;
            entryEnd = nextRec.end;
        }
        if (loop.length > 1 && loop[0].distanceTo(loop[loop.length - 1]) < 1e-6) loop.pop();
        loops.push(loop);
    }
    return loops;
}

// World size of a tile in the folded polylines: the cube's faces and the
// torus net are unit squares (the net's long way round the torus is
// stretched, up to 3×, so this is the tight direction).
function foldTileSize() {
    if (state.surface === 'sphere') return 1 / state.faceSize;
    if (state.surface === 'torus')  return 1 / state.gridSize;
    return MOSAIC_SCALE;
}

function buildChainsFromGrid(grid) {
    let polygons;
    try {
        polygons = mosaicToPolygons(grid);
    } catch (e) {
        return { error: e.message };
    }
    // Scale up from mosaic tile-coordinates so the knot has reasonable
    // proportions versus our tube radius (mosaic units are 1 tile each).
    polygons = polygons.map(loop =>
        loop.map(p => new THREE.Vector3(p.x * MOSAIC_SCALE, p.y * MOSAIC_SCALE, p.z * MOSAIC_SCALE)));
    return buildChainsFromPolylines(polygons);
}

function buildChainsFromPolylines(polygons) {
    if (!polygons || polygons.length === 0) {
        return { error: 'No closed loops found' };
    }
    // A step costs (Σ N)² — each component's own pairs plus the cross pairs
    // between components — so big mosaics are resampled less densely: 4× the
    // tile-walker points while (Σ N)² stays within the budget, else thinned
    // evenly, but never below ~3 points per tile piece.
    let targets = polygons.map(loop => Math.max(160, loop.length * 4));
    const sumN = targets.reduce((s, t) => s + t, 0);
    const cost = sumN * sumN;
    if (cost > PAIR_BUDGET) {
        const k = Math.sqrt(PAIR_BUDGET / cost);
        targets = targets.map((t, i) =>
            Math.max(160, Math.ceil(polygons[i].length * 0.6), Math.round(t * k)));
    }
    const newChains = polygons.map((loop, i) =>
        new KnotChain(resampleClosed(loop, targets[i]), energyKey));
    // The warm-up smooths over a fixed number of vertices, so it is scaled
    // with the sampling density (squared: smoothing spreads diffusively).
    // At full density, 4× the tile-walker points, it only rounds the kinks
    // between tile pieces; at a big mosaic's ~2 vertices per tile it would
    // flatten the crossings' over/under bumps, leaving every crossing
    // squeezed against the move caps.
    warmUpLink(newChains, targets.map((t, i) =>
        Math.min(1, (t / (4 * polygons[i].length)) ** 2)));
    return { chains: newChains, count: polygons.length };
}

// ─── Public API ──────────────────────────────────────────────────────

function setRunning(on) {
    running = on;
    const btn = document.getElementById('smooth-play-btn');
    if (btn) {
        btn.textContent = on ? 'Pause' : 'Smooth';
        btn.classList.toggle('btn-primary',   on);
        btn.classList.toggle('btn-secondary', !on);
    }
}

function updateEnergyLabel() {
    const el = document.getElementById('smooth-energy-label');
    if (el) el.textContent = ENERGY_MODELS[energyKey].readout;
}

// openSmooth(opts)
//   opts.polylines: optional array of THREE.Vector3 closed polylines (already
//     in 3D world coords). When provided, we skip the disk-grid walker and
//     use these directly — used by the "Smooth after fold" path.
//   opts.label:     human-readable label shown in the toolbar.
// Polyline extractors used by app.js's cube-smooth-btn click handler.
window.__smoothExtract = {
    torus: extractTorusPolylines,
    sphere: extractSpherePolylines,
};

// Debug handles (headless verification): current chains' point arrays, and
// one descent step of the whole link.
window.__smoothChains = () => chains;
window.__smoothStep = () => stepLink(chains);

window.openSmooth = function (opts) {
    opts = opts || {};
    let built;
    if (opts.polylines) {
        built = buildChainsFromPolylines(opts.polylines);
    } else {
        if (state.surface !== 'disk') {
            alert('To smooth a sphere or torus mosaic, click Fold first, then Smooth.');
            return;
        }
        built = buildChainsFromGrid(state.grid);
    }
    if (built.error) {
        alert('Cannot smooth this mosaic:\n\n' + built.error);
        return;
    }
    chains = built.chains;
    tileSize = opts.polylines ? foldTileSize() : MOSAIC_SCALE;
    applyTubeRadius();
    recenterLink(chains);
    if (!renderer) initScene();
    onResize();
    buildTubes();
    userTouchedCamera = false;
    frameCounter = 0;
    frameAll();
    document.getElementById('smooth-overlay').style.display = 'block';
    const componentLabel = chains.length === 1
        ? `1 component · ${chains[0].N} vertices`
        : `${chains.length} components`;
    document.getElementById('smooth-info').textContent =
        opts.label ? `${opts.label} · ${componentLabel}` : componentLabel;
    updateEnergyLabel();
    // Open paused: show the raw 3D embedding first; the "Smooth" button
    // starts the energy-minimisation flow.
    setRunning(false);
    if (animId === null) loop();
};

window.closeSmooth = function () {
    document.getElementById('smooth-overlay').style.display = 'none';
    if (animId !== null) { cancelAnimationFrame(animId); animId = null; }
    running = false;
};

// ─── Toolbar wiring ──────────────────────────────────────────────────

document.getElementById('smooth-close-btn').addEventListener('click', window.closeSmooth);
document.getElementById('smooth-play-btn').addEventListener('click', () => setRunning(!running));
document.getElementById('smooth-reset-btn').addEventListener('click', () => {
    const built = buildChainsFromGrid(state.grid);
    if (built.error) { alert(built.error); return; }
    chains = built.chains;
    tileSize = MOSAIC_SCALE;
    applyTubeRadius();
    recenterLink(chains);
    buildTubes();
    frameAll();
    setRunning(false);
});
document.getElementById('smooth-energy-select').addEventListener('change', e => {
    energyKey = e.target.value;
    for (const ch of chains) ch.setEnergyModel(energyKey);
    pairStep.chains = null;    // a new energy: restart the step-size search
    updateEnergyLabel();
});
document.getElementById('smooth-radius-slider').addEventListener('input', e => {
    tubeRadius = parseFloat(e.target.value);
    document.getElementById('smooth-radius-val').textContent = tubeRadius.toFixed(2);
    applyTubeRadius();
    if (!running && chains.length) buildTubes();   // the loop redraws only while running
});
document.getElementById('smooth-speed-slider').addEventListener('input', e => {
    stepsPerFrame = parseInt(e.target.value, 10);
    document.getElementById('smooth-speed-val').textContent = stepsPerFrame;
});

window.addEventListener('resize', onResize);
})();
