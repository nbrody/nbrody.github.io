// Discrete knot energy + gradient descent.
//
// We model the knot as a closed polygon p_0,...,p_{N-1} (with p_N = p_0).
// The total energy is:
//
//   E = α * Möbius repulsion + β * edge-spring + γ * tube-collision penalty
//
// Möbius repulsion (discrete O'Hara-style) between non-adjacent vertex pairs:
//     E_möb = Σ_{|i-j|>1, mod N}  1 / |p_i - p_j|^2
// gives a force that diverges as strands approach each other → preserves
// knot type. Edge spring keeps edges roughly equal-length, and the tube
// term adds a stiff barrier when non-adjacent edges come within 2*tube.

class KnotChain {
    constructor(points) {
        this.points = points.map(p => p.clone());
        this.N = points.length;
        this.targetEdge = this.averageEdgeLength();
        this.params = {
            kRepel:   1.6,    // Möbius repulsion strength
            kSpring:  6.0,    // edge-length spring
            kTube:    8.0,    // hard tube collision
            tubeR:    0.18,   // tube radius (in world units, recomputed)
            damping:  0.92,
            dtMax:    0.05,
            dtSafety: 0.18,   // clamp max step to this fraction of edge length
        };
        this.recomputeTubeRadius();
        this.energyHistory = [];
    }

    averageEdgeLength() {
        let s = 0;
        for (let i = 0; i < this.N; i++) {
            s += this.points[i].distanceTo(this.points[(i + 1) % this.N]);
        }
        return s / this.N;
    }

    totalLength() {
        let s = 0;
        for (let i = 0; i < this.N; i++) {
            s += this.points[i].distanceTo(this.points[(i + 1) % this.N]);
        }
        return s;
    }

    recomputeTubeRadius() {
        // Tube radius scales with average edge length so the rendered tube
        // looks proportional. Keep small enough to never block legal motion.
        this.params.tubeR = 0.45 * this.targetEdge;
    }

    // Gradient of -log of energy isn't what we want; we descend on E directly.
    // Compute force = -∇E for each vertex and store in `forces`.
    computeForces() {
        const N = this.N, P = this.points, F = this._scratch(N);
        const { kRepel, kSpring, kTube, tubeR } = this.params;
        let energy = 0;

        // Edge spring: each edge pulls/pushes endpoints toward target length.
        for (let i = 0; i < N; i++) {
            const j = (i + 1) % N;
            const a = P[i], b = P[j];
            const dx = b.x - a.x, dy = b.y - a.y, dz = b.z - a.z;
            const len = Math.hypot(dx, dy, dz) + 1e-12;
            const stretch = len - this.targetEdge;
            const f = kSpring * stretch / len;
            F[i].x += f * dx; F[i].y += f * dy; F[i].z += f * dz;
            F[j].x -= f * dx; F[j].y -= f * dy; F[j].z -= f * dz;
            energy += 0.5 * kSpring * stretch * stretch;
        }

        // Pairwise vertex repulsion (Möbius-style 1/r²) for non-neighbors.
        const tube2 = (2 * tubeR) * (2 * tubeR);
        for (let i = 0; i < N; i++) {
            for (let j = i + 2; j < N; j++) {
                if (i === 0 && j === N - 1) continue;     // wraparound neighbor
                const a = P[i], b = P[j];
                const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
                const r2 = dx * dx + dy * dy + dz * dz + 1e-9;
                // Möbius: energy = 1/r² → force ∝ 2/r⁴ along (a-b)/r
                const fMag = (2 * kRepel) / (r2 * r2);
                F[i].x += fMag * dx; F[i].y += fMag * dy; F[i].z += fMag * dz;
                F[j].x -= fMag * dx; F[j].y -= fMag * dy; F[j].z -= fMag * dz;
                energy += kRepel / r2;

                // Hard tube barrier: if two non-adjacent vertices come closer
                // than the tube diameter, add an extra strong soft-collision.
                if (r2 < tube2) {
                    const r = Math.sqrt(r2);
                    const overlap = (2 * tubeR) - r;
                    const fb = kTube * overlap / r;
                    F[i].x += fb * dx; F[i].y += fb * dy; F[i].z += fb * dz;
                    F[j].x -= fb * dx; F[j].y -= fb * dy; F[j].z -= fb * dz;
                    energy += 0.5 * kTube * overlap * overlap;
                }
            }
        }

        this.lastEnergy = energy;
        return F;
    }

    _scratch(N) {
        if (!this._F || this._F.length !== N) {
            this._F = Array.from({ length: N }, () => new THREE.Vector3());
        } else {
            for (let i = 0; i < N; i++) this._F[i].set(0, 0, 0);
        }
        return this._F;
    }

    // One adaptive Euler step. Returns the energy after the step.
    step() {
        const F = this.computeForces();

        // Adaptive dt: keep max vertex move below dtSafety * targetEdge.
        let maxF = 0;
        for (let i = 0; i < this.N; i++) {
            const m = F[i].lengthSq();
            if (m > maxF) maxF = m;
        }
        maxF = Math.sqrt(maxF) + 1e-12;
        const safe = (this.params.dtSafety * this.targetEdge) / maxF;
        const dt = Math.min(this.params.dtMax, safe);

        for (let i = 0; i < this.N; i++) {
            this.points[i].x += dt * F[i].x;
            this.points[i].y += dt * F[i].y;
            this.points[i].z += dt * F[i].z;
        }

        // Recenter so the knot doesn't drift away.
        this.recenter();

        // Optional: light arc-length redistribution to keep edges balanced.
        // Done every step but with a small blend factor.
        this.smoothArcLength(0.05);

        this.energyHistory.push(this.lastEnergy);
        if (this.energyHistory.length > 600) this.energyHistory.shift();
        return this.lastEnergy;
    }

    recenter() {
        let cx = 0, cy = 0, cz = 0;
        for (const p of this.points) { cx += p.x; cy += p.y; cz += p.z; }
        cx /= this.N; cy /= this.N; cz /= this.N;
        for (const p of this.points) { p.x -= cx; p.y -= cy; p.z -= cz; }
    }

    // Move each vertex slightly toward the midpoint of its neighbors. This
    // is a Laplacian smoothing weighted by `alpha`; with alpha << 1 it just
    // helps keep edges from clumping but doesn't change the curve shape.
    smoothArcLength(alpha) {
        const N = this.N, P = this.points;
        const next = new Array(N);
        for (let i = 0; i < N; i++) {
            const a = P[(i - 1 + N) % N], b = P[(i + 1) % N], c = P[i];
            next[i] = new THREE.Vector3(
                c.x + alpha * (0.5 * (a.x + b.x) - c.x),
                c.y + alpha * (0.5 * (a.y + b.y) - c.y),
                c.z + alpha * (0.5 * (a.z + b.z) - c.z),
            );
        }
        for (let i = 0; i < N; i++) P[i].copy(next[i]);
    }

    // Resample the polygon to `M` evenly-spaced (in arc length) points.
    // Useful when reloading a new knot or changing resolution.
    resample(M) {
        const lengths = [0];
        for (let i = 0; i < this.N; i++) {
            const j = (i + 1) % this.N;
            lengths.push(lengths[i] + this.points[i].distanceTo(this.points[j]));
        }
        const total = lengths[this.N];
        const step = total / M;
        const out = [];
        let seg = 0;
        for (let k = 0; k < M; k++) {
            const target = k * step;
            while (seg < this.N && lengths[seg + 1] < target) seg++;
            const t = (target - lengths[seg]) / (lengths[seg + 1] - lengths[seg] + 1e-12);
            const a = this.points[seg];
            const b = this.points[(seg + 1) % this.N];
            out.push(new THREE.Vector3(
                a.x + t * (b.x - a.x),
                a.y + t * (b.y - a.y),
                a.z + t * (b.z - a.z),
            ));
        }
        this.points = out;
        this.N = M;
        this.targetEdge = this.averageEdgeLength();
        this.recomputeTubeRadius();
        this.energyHistory.length = 0;
    }
}

window.KnotPhysics = { KnotChain };
