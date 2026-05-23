/**
 * smooth3d.js — Take the current disk mosaic, embed it in R³, and let it
 * relax into an energy-minimal position via discrete Möbius energy +
 * gradient descent. Renders a smooth tube around the polygonal knot in
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
//   9 ⟋ NE+SW arcs, 10 ⟍ NW+SE arcs.

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
// Polygonal closed loop p_0..p_{N-1} with energy
//   E = α·Σ_{|i−j|>1} 1/|p_i−p_j|² (Möbius repulsion)
//     + β·Σ_edges (|e|−L)²        (edge spring)
//     + γ·tube barrier             (preserves knot type)
//
// Forces are −∇E; we descend via adaptive Euler with light Laplacian
// smoothing.

class KnotChain {
    constructor(points) {
        this.points = points.map(p => p.clone());
        this.N = points.length;
        this.targetEdge = this.averageEdgeLength();
        this.params = {
            kRepel:   1.6,
            kSpring:  6.0,
            kTube:    8.0,
            tubeR:    0.45 * this.targetEdge,
            dtMax:    0.05,
            dtSafety: 0.18,
        };
        this.lastEnergy = 0;
        this.stepCount = 0;
        // Number of frames over which the repulsion ramps from
        // RAMP_FLOOR × kRepel up to full kRepel. Lets the Laplacian damp
        // out high-frequency content from the initial polygon before the
        // 1/r² gradient lights up every short-wavelength mode.
        this.RAMP_FRAMES = 60;
        this.RAMP_FLOOR  = 0.05;

        // Warm-up: a handful of pure Laplacian smoothing passes to round
        // off the kinks where mosaic-tile pieces meet, before any forces
        // are computed. This is the single biggest reduction in the
        // initial "ringing" effect.
        for (let k = 0; k < 10; k++) this.smoothLaplacian(0.5);
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
        const N = this.N, P = this.points, F = this._scratch();
        const { kRepel, kSpring, kTube, tubeR } = this.params;
        let energy = 0;
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
        const tube2 = (2 * tubeR) * (2 * tubeR);
        for (let i = 0; i < N; i++) {
            for (let j = i + 2; j < N; j++) {
                if (i === 0 && j === N - 1) continue;
                const a = P[i], b = P[j];
                const dx = a.x - b.x, dy = a.y - b.y, dz = a.z - b.z;
                const r2 = dx * dx + dy * dy + dz * dz + 1e-9;
                const fMag = (2 * kRepel) / (r2 * r2);
                F[i].x += fMag * dx; F[i].y += fMag * dy; F[i].z += fMag * dz;
                F[j].x -= fMag * dx; F[j].y -= fMag * dy; F[j].z -= fMag * dz;
                energy += kRepel / r2;
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
    step() {
        // Ramp kRepel from RAMP_FLOOR × target up to full strength over
        // RAMP_FRAMES steps. Restore at the end so the slider value the
        // user sees stays authoritative.
        const userKRepel = this.params.kRepel;
        if (this.stepCount < this.RAMP_FRAMES) {
            const t = this.stepCount / this.RAMP_FRAMES;
            const factor = this.RAMP_FLOOR + (1 - this.RAMP_FLOOR) * t * t;
            this.params.kRepel = userKRepel * factor;
        }
        const F = this.computeForces();
        this.params.kRepel = userKRepel;

        let maxF = 0;
        for (let i = 0; i < this.N; i++) {
            const m = F[i].lengthSq();
            if (m > maxF) maxF = m;
        }
        maxF = Math.sqrt(maxF) + 1e-12;
        const dt = Math.min(this.params.dtMax,
                            (this.params.dtSafety * this.targetEdge) / maxF);
        for (let i = 0; i < this.N; i++) {
            this.points[i].x += dt * F[i].x;
            this.points[i].y += dt * F[i].y;
            this.points[i].z += dt * F[i].z;
        }
        this.recenter();
        // Slightly stronger Laplacian damping during the warm-up window,
        // then settle into the gentle steady-state value.
        const alpha = this.stepCount < this.RAMP_FRAMES ? 0.15 : 0.05;
        this.smoothLaplacian(alpha);
        this.stepCount++;
        return this.lastEnergy;
    }
    recenter() {
        let cx = 0, cy = 0, cz = 0;
        for (const p of this.points) { cx += p.x; cy += p.y; cz += p.z; }
        cx /= this.N; cy /= this.N; cz /= this.N;
        for (const p of this.points) { p.x -= cx; p.y -= cy; p.z -= cz; }
    }
    smoothLaplacian(alpha) {
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
let tubeRadius = 0.18;
let frameCounter = 0;
let userTouchedCamera = false;
let resetBuilder = null;

function getAppState() {
    return (typeof window.getAppState === 'function') ? window.getAppState() : null;
}

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

function buildTubes() {
    disposeTubeMeshes();
    tubeMesh = chains.map(ch => {
        const curve = new THREE.CatmullRomCurve3(ch.points, true, 'centripetal', 0.5);
        const segs  = Math.max(120, ch.points.length * 3);
        const geo   = new THREE.TubeGeometry(curve, segs, tubeRadius, 16, true);
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
        for (const ch of chains) {
            for (let s = 0; s < stepsPerFrame; s++) ch.step();
        }
        // Tube radius is auto-scaled to a small fraction of the knot's
        // bounding sphere so it always reads as a tube, never a hairline,
        // regardless of how much the chain expands. The user slider is
        // applied as a multiplier on top.
        const box = new THREE.Box3();
        for (const ch of chains) for (const p of ch.points) box.expandByPoint(p);
        const sph = new THREE.Sphere();
        box.getBoundingSphere(sph);
        const effectiveRadius = sph.radius * tubeRadius * 0.18;

        chains.forEach((ch, idx) => {
            const curve = new THREE.CatmullRomCurve3(ch.points, true, 'centripetal', 0.5);
            const segs  = Math.max(120, ch.points.length * 3);
            const newGeo = new THREE.TubeGeometry(curve, segs, effectiveRadius, 16, true);
            tubeMesh[idx].geometry.dispose();
            tubeMesh[idx].geometry = newGeo;
        });
        const totalE = chains.reduce((s, ch) => s + ch.lastEnergy, 0);
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

function buildChainsFromGrid(grid) {
    let polygons;
    try {
        polygons = mosaicToPolygons(grid);
    } catch (e) {
        return { error: e.message };
    }
    // Scale up from mosaic tile-coordinates so the knot has reasonable
    // proportions versus our tube radius (mosaic units are 1 tile each).
    const SCALE = 4.0;
    polygons = polygons.map(loop =>
        loop.map(p => new THREE.Vector3(p.x * SCALE, p.y * SCALE, p.z * SCALE)));
    return buildChainsFromPolylines(polygons);
}

function buildChainsFromPolylines(polygons) {
    if (!polygons || polygons.length === 0) {
        return { error: 'No closed loops found' };
    }
    const newChains = polygons.map(loop => {
        const target = Math.max(160, loop.length * 4);
        return new KnotChain(resampleClosed(loop, target));
    });
    return { chains: newChains, count: polygons.length };
}

// ─── Public API ──────────────────────────────────────────────────────

function setRunning(on) {
    running = on;
    const btn = document.getElementById('smooth-play-btn');
    if (btn) {
        btn.textContent = on ? 'Pause' : 'Run';
        btn.classList.toggle('btn-primary',   on);
        btn.classList.toggle('btn-secondary', !on);
    }
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

window.openSmooth = function (opts) {
    opts = opts || {};
    let built;
    if (opts.polylines) {
        resetBuilder = () => buildChainsFromPolylines(opts.polylines);
        built = resetBuilder();
    } else {
        const st = getAppState();
        if (!st) {
            alert('Cannot smooth this mosaic: app state is unavailable.');
            return;
        }
        if (st.surface !== 'disk') {
            alert('To smooth a sphere or torus mosaic, click Fold first, then Smooth.');
            return;
        }
        resetBuilder = () => {
            const latest = getAppState();
            return latest ? buildChainsFromGrid(latest.grid)
                          : { error: 'App state is unavailable' };
        };
        built = resetBuilder();
    }
    if (built.error) {
        alert('Cannot smooth this mosaic:\n\n' + built.error);
        return;
    }
    chains = built.chains;
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
    setRunning(true);
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
    if (!resetBuilder) return;
    const built = resetBuilder();
    if (built.error) { alert(built.error); return; }
    chains = built.chains;
    buildTubes();
    frameAll();
    setRunning(true);
});
document.getElementById('smooth-radius-slider').addEventListener('input', e => {
    tubeRadius = parseFloat(e.target.value);
    document.getElementById('smooth-radius-val').textContent = tubeRadius.toFixed(2);
});
document.getElementById('smooth-speed-slider').addEventListener('input', e => {
    stepsPerFrame = parseInt(e.target.value, 10);
    document.getElementById('smooth-speed-val').textContent = stepsPerFrame;
});

window.addEventListener('resize', onResize);
})();
