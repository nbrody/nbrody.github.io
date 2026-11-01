// foldView.js — the knot folding into its two ideal polyhedra, and back (js/menasco.js).
//
// One parameter f ∈ [0, 6] runs through six stages:
//   0–1  relax    the 3D knot relaxes back into its planar diagram (snapshots of the Möbius-energy
//                 run that made it, played backwards: strands never pass through each other)
//   1–2  diagram  a crossing arc at each crossing; the regions in checkerboard
//   2–3  cut      cut along both checkerboard surfaces: the half above the plane (P⁺, with the
//                 overpasses) rises, the half below (P⁻, with the underpasses) sinks; every region
//                 is a face of both, colored by its face pair
//   3–4  shrink   overpasses (underpasses) shrink to points; each crossing arc splits into two
//                 edges that swing along the graph edges; two-sided regions collapse
//   4–5  inflate  each planar half (a Schlegel diagram) inflates into its hyperbolic shape: for the
//                 figure-eight an ideal tetrahedron; in general a union of ideal tetrahedra (the half
//                 coned from a vertex, js/menasco.js), its regions cut into triangles
//   5–6  glue     P⁻ docks onto P⁺ along one region: the fundamental polyhedron D = P⁺ ∪ P⁻
// The final frame is the diagram triangulation developed with its complete shapes (for the
// figure-eight, SnapPy's triangulation itself, colored as in the Polyhedron view), turned so that
// each half's vertices sit roughly above their crossings.

import * as THREE from 'three';
import { mapply } from './complex.js';
import { toSphere, centering, modelPoint, geodesicPoints } from './hyperbolic.js';
import { dictionary, developHalves } from './menasco.js';

const H = 1.0;               // the halves' height above and below the plane
const R_OUT = 1.16;          // the outer region is drawn out to this radius in the plane
const TET_SCALE = 0.86;      // a tetrahedron's ball before docking
const SUB = 8;               // face subdivision

const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const smooth = (x) => { x = clamp01(x); return x * x * (3 - 2 * x); };
const seg = (f, a, b) => smooth((f - a) / (b - a));
const lerp = (a, b, t) => a + (b - a) * t;
const lerp3 = (p, q, t) => [lerp(p[0], q[0], t), lerp(p[1], q[1], t), lerp(p[2], q[2], t)];
const add3 = (p, q) => [p[0] + q[0], p[1] + q[1], p[2] + q[2]];
const scale3 = (p, s) => [p[0] * s, p[1] * s, p[2] * s];

export const STAGES = [
    { at: 0, label: 'knot', caption: 'The knot $K$ in $S^3$.' },
    { at: 1, label: 'diagram', caption: 'Its diagram, with a crossing arc at each crossing and the regions in checkerboard.' },
    { at: 2, label: 'cut', caption: 'Cut along both checkerboard surfaces: $P^+$ above the plane keeps the overpasses, $P^-$ below the underpasses.' },
    { at: 3, label: 'shrink', caption: 'Shrink each overpass (underpass) to a point: the crossing arcs become the edges, the regions the faces.' },
    { at: 4, label: 'inflate', caption: 'Collapse the two-sided regions and straighten: $P^+$ and $P^-$ become ideal polyhedra.' },
    { at: 5, label: 'glue', caption: 'Glue each region of $P^+$ to the same region of $P^-$, turned one step: $S^3 \\setminus K$.' },
    { at: 6, label: 'D', caption: 'The fundamental polyhedron $D = P^+ \\cup P^-$ in $\\mathbb H^3$.' },
];
export const captionAt = (f) => STAGES[Math.min(STAGES.length - 1, Math.max(0, Math.floor(f + 1e-6)))].caption;

export class FoldView {
    constructor(stage) {
        this.stage = stage;
        this.group = new THREE.Group();
        stage.scene.add(this.group);
        this.f = 6;
        this.model = 'poincare';
        this.pool = { tube: [], face: [], dot: [] };
        this.used = { tube: 0, face: 0, dot: 0 };
        const cone = new THREE.ConeGeometry(0.02, 0.055, 10);
        cone.translate(0, 0.0275, 0);
        this.arrowMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        this.arrows = new THREE.InstancedMesh(cone, this.arrowMat, 256);
        this.arrows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
        this.group.add(this.arrows);
        // the spheres at infinity of the two tetrahedra (one once they dock)
        this.spheres = [0, 1].map(() => {
            const mat = new THREE.ShaderMaterial({
                transparent: true, depthWrite: false,
                uniforms: { color: { value: new THREE.Color(0x8fa3ff) }, strength: { value: 0.5 } },
                vertexShader: `varying vec3 vN; varying vec3 vV;
                    void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix*normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix*mv; }`,
                fragmentShader: `uniform vec3 color; uniform float strength; varying vec3 vN; varying vec3 vV;
                    void main(){ float f = pow(1.0 - abs(dot(vN, vV)), 3.0); gl_FragColor = vec4(color, (f + 0.04) * strength); }`,
            });
            const m = new THREE.Mesh(new THREE.SphereGeometry(1, 64, 48), mat);
            m.renderOrder = -1;
            this.group.add(m);
            return m;
        });
        this.group.visible = false;
    }

    setVisible(v) { this.group.visible = v; }
    setModel(m) { this.model = m; }
    setColors(c) {
        this.colors = c;
        this.arrowMat.color.set(c.ink);
        for (const m of this.spheres) m.material.uniforms.color.value.set(c.sphere || '#8fa3ff');
    }

    /** fold: foldData entry; model: menasco.foldModel; tri: Triangulation; z: complete shapes. */
    setManifold(fold, model, tri, z) {
        this.fold = fold; this.mm = model; this.tri = tri;
        if (!fold || !model?.supported) { this.ready = false; return; }
        this.ready = true;
        const D = model.D;
        // the fold frame: the diagram in the unit disk of the xy-plane, z up
        const pts2 = [...fold.crossings, ...fold.edges.flatMap((e) => e.poly)];
        const R = Math.max(...pts2.map(([x, y]) => Math.hypot(x, y)));
        this.s = 1 / R;
        const P = (q) => [q[0] * this.s, q[1] * this.s];
        this.cross = fold.crossings.map(P);
        this.lift = fold.lift * this.s;
        this.snaps = fold.knot.snapshots.map((sn) => sn.pts.map((p) => scale3(p, this.s)));
        this.edgeOf = fold.knot.edgeOf;
        // region boundaries: per dart, the edge polyline (subdivided), tagged with its edge
        this.regions = D.faces.map((F) => {
            const pts = [];
            F.darts.forEach((d) => {
                const k = d >> 1;
                const poly = fold.edges[k].poly.map(P);
                const pl = (d & 1) ? poly.slice().reverse() : poly;
                for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) pts.push({ p: lerp3([...pl[i], 0], [...pl[i + 1], 0], j / 3), edge: k });
                pts.push({ p: [...pl[3], 0], edge: k });
            });
            const c = fold.faces[F.index].centre;
            return { F, pts, centre: c ? [c[0] * this.s, c[1] * this.s, 0] : null };
        });
        // knot pieces: the overpass through each crossing (P⁺) and the underpass (P⁻), as runs of samples
        const N = this.edgeOf.length;
        const piece = (edges) => {
            const set = new Set(edges);
            const idx = [];
            // start where the run begins (a sample whose predecessor is outside the set)
            let s0 = 0;
            for (let i = 0; i < N; i++) if (set.has(this.edgeOf[i]) && !set.has(this.edgeOf[(i - 1 + N) % N])) { s0 = i; break; }
            for (let i = 0; i < N; i++) { const j = (s0 + i) % N; if (set.has(this.edgeOf[j])) idx.push(j); else if (idx.length) break; }
            idx.push((idx[idx.length - 1] + 1) % N);      // close the run at the next crossing
            return idx;
        };
        this.over = Array.from({ length: D.n }, (_, c) => piece(D.overEdges[c]));
        this.under = Array.from({ length: D.n }, (_, c) => piece(D.underEdges[c]));
        // the final picture: the diagram triangulation developed with its shapes, turned to sit over the diagram
        const MT = model.MT;
        this.dict = dictionary(model, tri, model.isos[0] || null);
        const dev = developHalves(MT, fold.shapes);
        const all = [...dev.pos[0].values(), ...dev.pos[1].values()];
        const G = centering(all);
        const sph = (side, x) => toSphere(mapply(G, dev.pos[side].get(x)));
        const src = [], dst = [];
        for (const side of [0, 1]) for (let x = 0; x < D.n; x++) {
            src.push(sph(side, x));
            const [cx, cy] = this.cross[x];
            const t = [cx, cy, side ? -0.9 : 0.9];
            const l = Math.hypot(...t);
            dst.push(t.map((u) => u / l));
        }
        this.rot = bestRotation(src, dst).rot;
        this.final = [0, 1].map((side) => Array.from({ length: D.n }, (_, x) => applyRot(this.rot, sph(side, x))));
        // each region's triangles on each side, and the region P⁻ docks along
        this.regionTris = [0, 1].map((side) => new Map(MT.halves.faces.map((F, i) => [F.index, MT.boundary[side][i].map((b) => b.labels)])));
        this.dockRegion = MT.halves.faces[dev.dock.region].index;
        // the polyhedron edges of each half (graph edges merged across two-sided regions), and the diagonals
        this.polyEdges = [0, 1].map((side) => {
            const seen = new Map();
            for (const f of MT.halves.sides[side]) f.edges.forEach((e, j) => { if (!seen.has(e)) seen.set(e, [f.cyc[j], f.cyc[(j + 1) % f.cyc.length]]); });
            return [...seen].map(([k, [a, b]]) => ({ k, a, b }));
        });
        this.diagonals = [0, 1].map((side) => {
            const out = new Map();
            MT.halves.sides[side].forEach((f, i) => {
                const k = f.cyc.length;
                const adjacent = (x, y) => { const a = f.cyc.indexOf(x), b = f.cyc.indexOf(y); return (b - a + k) % k === 1 || (a - b + k) % k === 1; };
                for (const tri3 of MT.boundary[side][i].map((b) => b.labels)) {
                    for (const [x, y] of [[tri3[0], tri3[1]], [tri3[1], tri3[2]], [tri3[0], tri3[2]]]) {
                        if (!adjacent(x, y)) out.set(x < y ? `${x},${y}` : `${y},${x}`, [x, y]);
                    }
                }
            });
            return [...out.values()];
        });
    }

    setF(f) { this.f = f; }

    /** The color of a region: its census face pair's (as in the Polyhedron view), or its own slot. */
    _regionColor(regionIndex) {
        const slot = this.dict.regionPair.get(regionIndex);
        if (this.dict.pairColor) return this._pairColor(slot);
        const P = this.colors.pair;
        return P[slot % P.length];
    }

    _pairColor(pairIndex) {
        const fp = this.tri.facePairs[pairIndex];
        const P = this.colors.pair;
        if (fp.gen > 0) return P[(fp.gen - 1) % P.length];
        const treeIdx = this.tri.facePairs.filter((x) => x.gen === 0).indexOf(fp);
        const slot = this.tri.nOrig + treeIdx;
        return slot < P.length ? P[slot] : this.colors.edge;
    }

    // ---------------- pooled meshes ----------------

    _mesh(kind) {
        const list = this.pool[kind];
        let m = list[this.used[kind]];
        if (!m) {
            const mat = kind === 'face'
                ? new THREE.MeshStandardMaterial({ transparent: true, side: THREE.DoubleSide, depthWrite: false, roughness: 0.6, metalness: 0.05 })
                : new THREE.MeshStandardMaterial({ roughness: 0.4, metalness: 0.15, transparent: true });
            m = new THREE.Mesh(new THREE.BufferGeometry(), mat);
            list.push(m);
            this.group.add(m);
        }
        this.used[kind]++;
        m.visible = true;
        return m;
    }
    _tube(points, radius, color, opacity = 1, closed = false) {
        if (points.length < 2) return;
        const m = this._mesh('tube');
        m.geometry.dispose();
        const curve = points.length === 2
            ? new THREE.LineCurve3(new THREE.Vector3(...points[0]), new THREE.Vector3(...points[1]))
            : new THREE.CatmullRomCurve3(points.map((p) => new THREE.Vector3(...p)), closed, 'centripetal');
        m.geometry = new THREE.TubeGeometry(curve, Math.max(2, Math.min(400, points.length * 2)), radius, 8, closed);
        m.material.color.set(color);
        m.material.opacity = opacity;
        m.material.emissive?.set(0x000000);
        m.renderOrder = 4;
    }
    _face(positions, index, color, opacity, emissive = 0.25) {
        const m = this._mesh('face');
        m.geometry.dispose();
        const g = new THREE.BufferGeometry();
        g.setAttribute('position', new THREE.BufferAttribute(new Float32Array(positions), 3));
        g.setIndex(index);
        g.computeVertexNormals();
        m.geometry = g;
        m.material.color.set(color);
        m.material.emissive.set(color);
        m.material.emissiveIntensity = this.colors.light ? emissive * 0.3 : emissive;
        m.material.opacity = opacity;
        m.renderOrder = 2;
    }
    _dot(p, color, r = 0.02) {
        const m = this._mesh('dot');
        if (!m.geometry.parameters || m.geometry.parameters.radius !== r) { m.geometry.dispose(); m.geometry = new THREE.SphereGeometry(r, 12, 8); }
        m.position.set(...p);
        m.material.color.set(color);
        m.material.opacity = 1;
    }

    // ---------------- the picture ----------------

    update() {
        if (!this.ready || !this.colors) return;
        for (const k of Object.keys(this.used)) this.used[k] = 0;
        this.arrowCount = 0;
        const f = this.f;
        const C = this.colors;
        const D = this.mm.D;
        const knotColor = C.knot;
        // stage weights
        const arcsIn = seg(f, 1.0, 1.4), regionsIn = seg(f, 1.3, 1.8);
        const sep = seg(f, 2.0, 2.9), recolor = seg(f, 2.05, 2.6);
        const col = seg(f, 3.0, 3.9), bigonOut = seg(f, 3.5, 4.2);
        const inf = seg(f, 4.0, 4.9), dock = seg(f, 5.0, 5.9);
        const lift = this.lift;
        this.spheres.forEach((m) => { m.visible = false; });

        if (f < 2) {
            // the whole knot: relaxed (f = 0) → planar diagram (f = 1)
            const K = this.snaps.length;
            const u = clamp01(1 - f) * (K - 1);
            const i = Math.min(K - 2, Math.floor(u)), t = u - i;
            const A = this.snaps[i], B = this.snaps[i + 1];
            const pts = A.map((p, j) => lerp3(p, B[j], t));
            this._tube(pts, 0.022, knotColor, 1, true);
            if (arcsIn > 0) {
                for (let c = 0; c < D.n; c++) {
                    const [x, y] = this.cross[c];
                    const h = lift * arcsIn;
                    this._arcWithArrows([x, y, -h], [x, y, h], this.dict.arc[c], C.ink, arcsIn);
                }
            }
            if (regionsIn > 0) this._regions(0, 0, 0, 0, regionsIn);
        } else if (f < 4.0001) {
            // two copies: P⁺ (side 0) rising, P⁻ (side 1) sinking
            for (const side of [0, 1]) {
                const dz = (side ? -H : H) * sep;
                if (side === 1 && sep < 0.015) continue;        // still one picture
                // knot pieces shrink to their crossing
                const pieces = side ? this.under : this.over;
                const snap = this.snaps[0];
                for (let c = 0; c < D.n; c++) {
                    const [cx, cy] = this.cross[c];
                    const pts = pieces[c].map((j) => {
                        const p = snap[j];
                        const q = [lerp(p[0], cx, col), lerp(p[1], cy, col), p[2] * (1 - col)];
                        return [q[0], q[1], q[2] + dz];
                    });
                    if (col < 0.995) this._tube(pts, 0.022 * (1 - 0.6 * col), knotColor, 1);
                }
                // crossing arcs → edges along the graph edges
                for (let c = 0; c < D.n; c++) {
                    const [ux, uy] = this.cross[c];
                    const edges = side ? D.overEdges[c] : D.underEdges[c];
                    for (const k of edges) {
                        const target = side ? D.underEnd(k) : D.overEnd(k);
                        const [tx, ty] = this.cross[target];
                        // P⁺: the over end stays at c, the under end slides to `target`; P⁻ the reverse
                        const fixedEnd = [ux, uy, (side ? -lift : lift) * (1 - col) + dz];
                        const moving = lerp3([ux, uy, (side ? lift : -lift)], [tx, ty, 0], col);
                        moving[2] += dz;
                        const [under, over] = side ? [fixedEnd, moving] : [moving, fixedEnd];
                        const info = this.dict.classAlong(side, k);
                        this._arcWithArrows(under, over, info, C.ink, 1);
                    }
                }
                this._regions(side, dz, recolor, col, 1, bigonOut);
                if (col > 0.5) for (let c = 0; c < D.n; c++) this._dot([...this.cross[c], dz], C.ink, 0.018 * smooth((col - 0.5) * 2));
            }
        } else {
            // the two tetrahedra: inflate (planar Schlegel diagram → ideal tetrahedron), then dock
            for (const side of [0, 1]) {
                const dz = (side ? -H : H) * (1 - dock);
                const sc = TET_SCALE + (1 - TET_SCALE) * dock;
                const sph = this.spheres[side];
                sph.visible = !(side === 1 && dock > 0.999);
                sph.position.set(0, 0, dz);
                sph.scale.setScalar(sc);
                sph.material.uniforms.strength.value = (C.light ? 0.32 : 0.5) * smooth(inf / 0.6) * (side === 1 ? 1 - 0.5 * dock : 1);
                const world = (k) => add3(scale3(modelPoint(k, this.model), sc), [0, 0, dz]);
                const planar = (x) => [...this.cross[x], side ? -H : H];
                const vtx = (x) => lerp3(planar(x), world(this.final[side][x]), inf);
                // faces: each region as the triangles it is cut into on this side
                for (const R of this.regions) {
                    const F = R.F;
                    if (F.bigon) continue;
                    let op = C.light ? 0.5 : 0.6;
                    if (F.outer) op *= smooth((inf - 0.15) / 0.5);
                    if (F.index === this.dockRegion) op = lerp(op, 0.06, smooth((dock - 0.8) / 0.2));
                    for (const tri3 of this.regionTris[side].get(F.index)) {
                        const { positions, index } = gridFace(tri3.map(planar), tri3.map((x) => this.final[side][x]), inf, world);
                        this._face(positions, index, this._regionColor(F.index), op);
                    }
                }
                // the outer region's ring fades as its face appears at the back
                if (inf < 0.4) this._outerRing(side, side ? -H : H, 1, 1, 1 - inf / 0.4);
                const edgeAt = (a, b, n) => {
                    const flat = [planar(a), planar(b)];
                    const curved = this.model === 'klein' ? [world(this.final[side][a]), world(this.final[side][b])]
                        : geodesicPoints(this.final[side][a], this.final[side][b], 'klein', n).map(world);
                    return curved.map((q, i) => lerp3(lerp3(flat[0], flat[1], i / (curved.length - 1)), q, inf));
                };
                // the polyhedron's edges carry the crossing arcs (with their arrows) …
                for (const { k, a, b } of this.polyEdges[side]) {
                    const pts = edgeAt(D.overEnd(k), D.underEnd(k), 20);
                    this._polyWithArrows(pts, this.dict.classAlong(side, k), C.ink);
                    void a; void b;
                }
                // … and the diagonals cutting its faces into triangles are drawn faintly
                for (const [a, b] of this.diagonals[side]) this._tube(edgeAt(a, b, 16), 0.0035, C.ink, 0.4);
                for (let x = 0; x < D.n; x++) this._dot(vtx(x), C.ink, 0.018);
            }
        }
        // hide what was not used
        for (const k of Object.keys(this.pool)) this.pool[k].forEach((m, i) => { m.visible = i < this.used[k]; });
        this.arrows.count = this.arrowCount;
        this.arrows.instanceMatrix.needsUpdate = true;
    }

    /** The regions of one copy: planar polygons (fan from the Tutte center), shrinking toward the polyhedron's vertices. */
    _regions(side, dz, recolor, col, alpha, bigonOut = 0) {
        const C = this.colors;
        const D = this.mm.D;
        for (const R of this.regions) {
            const F = R.F;
            if (F.outer) { this._outerRing(side, dz, recolor, col, alpha); continue; }
            const target = (k) => this.cross[side ? D.underEnd(k) : D.overEnd(k)];
            const bpts = R.pts.map(({ p, edge }) => {
                const [tx, ty] = target(edge);
                return [lerp(p[0], tx, col), lerp(p[1], ty, col), dz];
            });
            const corners = (side ? F.minus : F.plus).map((x) => this.cross[x]);
            const cc = corners.reduce((s, q) => [s[0] + q[0] / corners.length, s[1] + q[1] / corners.length], [0, 0]);
            const centre = [lerp(R.centre[0], cc[0], col), lerp(R.centre[1], cc[1], col), dz];
            const positions = [...centre];
            const index = [];
            bpts.forEach((p, i) => { positions.push(...p); index.push(0, 1 + i, 1 + ((i + 1) % bpts.length)); });
            const checker = F.shaded ? C.shaded : C.white;
            const final = F.bigon ? C.white : this._regionColor(F.index);
            const color = mixHex(checker, final, recolor);
            let op = lerp(F.shaded ? 0.5 : 0.16, F.bigon ? 0.12 : (C.light ? 0.45 : 0.55), recolor) * alpha;
            if (F.bigon) op *= 1 - bigonOut;
            if (op > 0.004) this._face(positions, index, color, op, F.shaded || recolor > 0 ? 0.25 : 0.05);
        }
    }

    /** The outer region in the plane: a ring from its boundary out to radius R_OUT. */
    _outerRing(side, dz, recolor, col, alpha) {
        const C = this.colors;
        const D = this.mm.D;
        const R = this.regions.find((r) => r.F.outer);
        if (!R) return;
        const F = R.F;
        const target = (k) => this.cross[side ? D.underEnd(k) : D.overEnd(k)];
        const inner = R.pts.map(({ p, edge }) => { const [tx, ty] = target(edge); return [lerp(p[0], tx, col), lerp(p[1], ty, col), dz]; });
        const outer = R.pts.map(({ p }) => { const l = Math.hypot(p[0], p[1]) || 1; return [p[0] * R_OUT / l, p[1] * R_OUT / l, dz]; });
        const positions = [], index = [];
        const n = inner.length;
        for (let i = 0; i < n; i++) positions.push(...inner[i], ...outer[i]);
        for (let i = 0; i < n; i++) {
            const a = 2 * i, b = 2 * ((i + 1) % n);
            index.push(a, a + 1, b, b, a + 1, b + 1);
        }
        const checker = F.shaded ? C.shaded : C.white;
        const color = mixHex(checker, this._regionColor(F.index), recolor);
        const op = lerp(F.shaded ? 0.3 : 0.1, C.light ? 0.2 : 0.24, recolor) * alpha;
        if (op > 0.004) this._face(positions, index, color, op, 0.2);
    }

    /** A straight crossing arc or edge from `under` to `over`, with the edge class's arrows. */
    _arcWithArrows(under, over, info, color, alpha) {
        this._polyWithArrows([under, over], info, color, alpha, true);
    }

    /** A polyline edge oriented from its first point (the under end / over-end vertex) with class arrows. */
    _polyWithArrows(pts, info, color, alpha = 1) {
        this._tube(pts, 0.006, color, alpha);
        const P = info.sign > 0 ? pts : pts.slice().reverse();
        const cnt = Math.min(info.cls + 1, 4);
        const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
        const len = polyLength(P);
        if (len < 0.05) return;
        for (let c = 0; c < cnt; c++) {
            const s = 0.5 + (c - (cnt - 1) / 2) * Math.min(0.12, 0.05 / len * 1.4);
            const [p, dir] = along(P, s);
            q.setFromUnitVectors(up, new THREE.Vector3(...dir).normalize());
            const k = Math.min(1, len / 0.2) * alpha;
            m4.compose(new THREE.Vector3(...p), q, new THREE.Vector3(k, k, k));
            if (this.arrowCount < 256) this.arrows.setMatrixAt(this.arrowCount++, m4);
        }
    }
}

/** A face as a barycentric grid, from the planar triangle ps to the ideal triangle ks (Klein points mapped by world). */
function gridFace(ps, ks, t, world) {
    const pos = [], index = [];
    const id = (i, j) => (i * (i + 1)) / 2 + j;
    for (let i = 0; i <= SUB; i++) for (let j = 0; j <= i; j++) {
        const a = 1 - i / SUB, b = (i - j) / SUB, c = j / SUB;
        const flat = [0, 1, 2].map((d) => a * ps[0][d] + b * ps[1][d] + c * ps[2][d]);
        const k = [0, 1, 2].map((d) => a * ks[0][d] + b * ks[1][d] + c * ks[2][d]);
        pos.push(...lerp3(flat, world(k), t));
    }
    for (let i = 0; i < SUB; i++) for (let j = 0; j <= i; j++) {
        index.push(id(i, j), id(i + 1, j), id(i + 1, j + 1));
        if (j < i) index.push(id(i, j), id(i + 1, j + 1), id(i, j + 1));
    }
    return { positions: pos, index };
}

function polyLength(P) { let s = 0; for (let i = 1; i < P.length; i++) s += Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1], P[i][2] - P[i - 1][2]); return s; }
function along(P, s) {
    const L = [0];
    for (let i = 1; i < P.length; i++) L.push(L[i - 1] + Math.hypot(P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1], P[i][2] - P[i - 1][2]));
    const target = s * L[L.length - 1];
    let i = 1;
    while (i < P.length - 1 && L[i] < target) i++;
    const t = (target - L[i - 1]) / ((L[i] - L[i - 1]) || 1);
    return [lerp3(P[i - 1], P[i], t), [P[i][0] - P[i - 1][0], P[i][1] - P[i - 1][1], P[i][2] - P[i - 1][2]]];
}

function mixHex(a, b, t) {
    const h = (x) => { const s = String(x).replace('#', ''); return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)); };
    const pa = h(a), pb = h(b);
    return '#' + pa.map((x, i) => Math.round(x + (pb[i] - x) * t).toString(16).padStart(2, '0')).join('');
}

/**
 * The rotation taking the unit vectors src as close as possible to dst (Horn's quaternion
 * method), and the mean squared error.
 */
export function bestRotation(src, dst) {
    const S = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
    src.forEach((a, n) => { for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) S[i][j] += a[i] * dst[n][j]; });
    const [[Sxx, Sxy, Sxz], [Syx, Syy, Syz], [Szx, Szy, Szz]] = S;
    const N = [
        [Sxx + Syy + Szz, Syz - Szy, Szx - Sxz, Sxy - Syx],
        [Syz - Szy, Sxx - Syy - Szz, Sxy + Syx, Szx + Sxz],
        [Szx - Sxz, Sxy + Syx, -Sxx + Syy - Szz, Syz + Szy],
        [Sxy - Syx, Szx + Sxz, Syz + Szy, -Sxx - Syy + Szz],
    ];
    const { values, vectors } = jacobiEigen(N);
    const k = values.indexOf(Math.max(...values));
    const [w, x, y, z] = vectors.map((row) => row[k]);
    const rot = [
        [1 - 2 * (y * y + z * z), 2 * (x * y - w * z), 2 * (x * z + w * y)],
        [2 * (x * y + w * z), 1 - 2 * (x * x + z * z), 2 * (y * z - w * x)],
        [2 * (x * z - w * y), 2 * (y * z + w * x), 1 - 2 * (x * x + y * y)],
    ];
    let err = 0;
    src.forEach((a, n) => { const b = applyRot(rot, a); err += (b[0] - dst[n][0]) ** 2 + (b[1] - dst[n][1]) ** 2 + (b[2] - dst[n][2]) ** 2; });
    return { rot, err: err / src.length };
}
export const applyRot = (R, p) => [R[0][0] * p[0] + R[0][1] * p[1] + R[0][2] * p[2], R[1][0] * p[0] + R[1][1] * p[1] + R[1][2] * p[2], R[2][0] * p[0] + R[2][1] * p[1] + R[2][2] * p[2]];

/** Eigen-decomposition of a small symmetric matrix by Jacobi rotations (vectors in columns). */
function jacobiEigen(A) {
    const n = A.length;
    const a = A.map((r) => r.slice());
    const v = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => (i === j ? 1 : 0)));
    for (let sweep = 0; sweep < 60; sweep++) {
        let off = 0;
        for (let i = 0; i < n; i++) for (let j = i + 1; j < n; j++) off += a[i][j] * a[i][j];
        if (off < 1e-22) break;
        for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
            if (Math.abs(a[p][q]) < 1e-300) continue;
            const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
            const t = Math.sign(theta || 1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
            const c = 1 / Math.sqrt(t * t + 1), s = t * c;
            for (let k = 0; k < n; k++) {
                const akp = a[k][p], akq = a[k][q];
                a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq;
            }
            for (let k = 0; k < n; k++) {
                const apk = a[p][k], aqk = a[q][k];
                a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk;
            }
            for (let k = 0; k < n; k++) {
                const vkp = v[k][p], vkq = v[k][q];
                v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq;
            }
        }
    }
    return { values: a.map((r, i) => r[i]), vectors: v };
}
