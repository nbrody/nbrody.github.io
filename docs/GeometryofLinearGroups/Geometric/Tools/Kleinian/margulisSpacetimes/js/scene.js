/**
 * scene.js — Three.js rendering for Margulis spacetimes visualization
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
    computeCrookedPlanes, applyAffineToTriangles, interpolateAffine,
    getGenerators, matVec, vecAdd, lorentzDot, vecScale,
    matInverse, A1, A2
} from './math.js';

/* =========================================
   COLOR PALETTE
   ========================================= */
const COLORS = {
    cp1plus: new THREE.Color(0x38bdf8),   // sky blue
    cp1minus: new THREE.Color(0x818cf8),   // indigo
    cp2plus: new THREE.Color(0xf472b6),    // pink
    cp2minus: new THREE.Color(0xfbbf24),   // amber
    lightCone: new THREE.Color(0xffffff),
    hyperboloid: new THREE.Color(0x22d3ee),
    axis: new THREE.Color(0x475569),
    grid: new THREE.Color(0x1e293b),
    orbit: new THREE.Color(0x22c55e),
    background: new THREE.Color(0x020617)
};

const CP_COLORS = [COLORS.cp1plus, COLORS.cp1minus, COLORS.cp2plus, COLORS.cp2minus];

/* =========================================
   SCENE SETUP
   ========================================= */

export class MargulisScene {
    constructor(container) {
        this.container = container;
        this.animating = false;
        this.autoRotate = true;

        // Visibility state
        this.visible = {
            lightCone: true,
            hyperboloid: true,
            crookedPlanes: true,
            axes: true,
            fundamentalDomain: false,
            orbit: false
        };

        // Parameters
        this.params = {
            translationScale: 1.0,
            planeSize: 2.5,
            planeOpacity: 0.4,
            coneHeight: 4.0
        };

        // Active pair: 0 = pair 1 (γ₁), 1 = pair 2 (γ₂), -1 = both
        this.activePair = 0;

        this.crookedMeshes = [];      // flat: [cp0, cp1, cp2, cp3]
        this.crookedEdgeMeshes = [];   // flat: [cp0, cp1, cp2, cp3]
        this.pairGroups = [];          // [group0(pair1), group1(pair2)]
        this.animationGroup = null;

        this.init();
        this.buildScene();
        this.animate();
    }

    init() {
        // Renderer
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setClearColor(COLORS.background, 1);
        this.container.appendChild(this.renderer.domElement);

        // Scene
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(COLORS.background, 0.04);

        // Camera — z-up so x₃ (timelike) is vertical
        this.camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100);
        this.camera.up.set(0, 0, 1);
        this.camera.position.set(6, 5, 4);

        // Controls
        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.autoRotate = true;
        this.controls.autoRotateSpeed = 0.6;
        this.controls.minDistance = 2;
        this.controls.maxDistance = 30;

        // Lights
        const ambient = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(ambient);

        const dir1 = new THREE.DirectionalLight(0xffffff, 0.6);
        dir1.position.set(5, 8, 5);
        this.scene.add(dir1);

        const dir2 = new THREE.DirectionalLight(0x38bdf8, 0.3);
        dir2.position.set(-5, -3, -5);
        this.scene.add(dir2);

        // Groups
        this.lightConeGroup = new THREE.Group();
        this.hyperboloidGroup = new THREE.Group();
        this.crookedGroup = new THREE.Group();
        this.axisGroup = new THREE.Group();
        this.domainGroup = new THREE.Group();
        this.orbitGroup = new THREE.Group();
        this.animGroup = new THREE.Group();

        this.scene.add(this.lightConeGroup);
        this.scene.add(this.hyperboloidGroup);
        this.scene.add(this.crookedGroup);
        this.scene.add(this.axisGroup);
        this.scene.add(this.domainGroup);
        this.scene.add(this.orbitGroup);
        this.scene.add(this.animGroup);

        // Resize
        window.addEventListener('resize', () => this.onResize());
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    /* =========================================
       BUILD SCENE COMPONENTS
       ========================================= */

    buildScene() {
        this.buildLightCone();
        this.buildHyperboloid();
        this.buildCrookedPlanes();
        this.buildAxes();
    }

    /** Rebuild crooked planes with current parameters */
    rebuild() {
        this.clearGroup(this.crookedGroup);
        this.crookedMeshes = [];
        this.crookedEdgeMeshes = [];
        this.pairGroups = [];
        this.buildCrookedPlanes();
        this.clearGroup(this.orbitGroup);
        this.resetCayleyTransform();
        if (this.visible.orbit) this.buildCayleyGraph();
    }

    clearGroup(group) {
        while (group.children.length > 0) {
            const child = group.children[0];
            group.remove(child);
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                if (Array.isArray(child.material)) child.material.forEach(m => m.dispose());
                else child.material.dispose();
            }
        }
    }

    /* ---- Light Cone ---- */
    buildLightCone() {
        const h = this.params.coneHeight;
        const segs = 64;

        // Use a custom geometry for the full light cone (both nappes)
        const geom = new THREE.BufferGeometry();
        const positions = [];
        const indices = [];

        // Upper nappe
        for (let i = 0; i <= segs; i++) {
            const theta = (i / segs) * Math.PI * 2;
            const c = Math.cos(theta), s = Math.sin(theta);
            // At apex (t=0): (0,0,0), at t=h: (h*cos, h*sin, h)
            positions.push(0, 0, 0); // vertex index i*2
            positions.push(h * c, h * s, h); // vertex index i*2+1
        }

        // Lower nappe
        const offset = (segs + 1) * 2;
        for (let i = 0; i <= segs; i++) {
            const theta = (i / segs) * Math.PI * 2;
            const c = Math.cos(theta), s = Math.sin(theta);
            positions.push(0, 0, 0);
            positions.push(h * c, h * s, -h);
        }

        for (let i = 0; i < segs; i++) {
            // Upper
            indices.push(i * 2, i * 2 + 1, (i + 1) * 2 + 1);
            // Lower
            indices.push(offset + i * 2, offset + i * 2 + 1, offset + (i + 1) * 2 + 1);
        }

        geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geom.setIndex(indices);
        geom.computeVertexNormals();

        const mat = new THREE.MeshPhysicalMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.06,
            side: THREE.DoubleSide,
            roughness: 0.5,
            metalness: 0.1,
            depthWrite: false
        });

        const cone = new THREE.Mesh(geom, mat);
        this.lightConeGroup.add(cone);

        // Wireframe lines on the cone
        const lineMat = new THREE.LineBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.12,
            depthWrite: false
        });

        for (let i = 0; i < 12; i++) {
            const theta = (i / 12) * Math.PI * 2;
            const c = Math.cos(theta), s = Math.sin(theta);
            const lineGeom = new THREE.BufferGeometry().setFromPoints([
                new THREE.Vector3(h * c, h * s, -h),
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(h * c, h * s, h)
            ]);
            this.lightConeGroup.add(new THREE.Line(lineGeom, lineMat));
        }
    }

    /* ---- One-sheeted Hyperboloid ---- */
    buildHyperboloid() {
        // x² + y² - z² = 1 (one-sheeted hyperboloid)
        const segs = 48;
        const rings = 32;
        const maxZ = this.params.coneHeight * 0.8;
        const positions = [];
        const indices = [];

        for (let j = 0; j <= rings; j++) {
            const z = -maxZ + (2 * maxZ * j) / rings;
            const r = Math.sqrt(1 + z * z);
            for (let i = 0; i <= segs; i++) {
                const theta = (i / segs) * Math.PI * 2;
                positions.push(r * Math.cos(theta), r * Math.sin(theta), z);
            }
        }

        for (let j = 0; j < rings; j++) {
            for (let i = 0; i < segs; i++) {
                const a = j * (segs + 1) + i;
                const b = a + 1;
                const c = a + segs + 1;
                const d = c + 1;
                indices.push(a, b, c);
                indices.push(b, d, c);
            }
        }

        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geom.setIndex(indices);
        geom.computeVertexNormals();

        const mat = new THREE.MeshPhysicalMaterial({
            color: COLORS.hyperboloid,
            transparent: true,
            opacity: 0.08,
            side: THREE.DoubleSide,
            roughness: 0.4,
            metalness: 0.2,
            depthWrite: false,
            wireframe: true
        });

        this.hyperboloidGroup.add(new THREE.Mesh(geom, mat));
    }

    /* ---- Crooked Planes ---- */
    buildCrookedPlanes() {
        const result = computeCrookedPlanes(this.params.translationScale, this.params.planeSize);
        this.crookedData = result;

        // Create sub-groups for each pair
        this.pairGroups = [new THREE.Group(), new THREE.Group()];
        this.crookedGroup.add(this.pairGroups[0]);
        this.crookedGroup.add(this.pairGroups[1]);

        result.planes.forEach((cp, idx) => {
            const pairIdx = idx < 2 ? 0 : 1; // 0,1 → pair 0; 2,3 → pair 1
            const { mesh, edgeMesh } = this.createCrookedPlaneMesh(cp.triangles, CP_COLORS[idx], this.params.planeOpacity);
            this.pairGroups[pairIdx].add(mesh);
            this.pairGroups[pairIdx].add(edgeMesh);
            this.crookedMeshes.push(mesh);
            this.crookedEdgeMeshes.push(edgeMesh);

            // Vertex marker
            const sphereGeom = new THREE.SphereGeometry(0.06, 16, 16);
            const sphereMat = new THREE.MeshStandardMaterial({
                color: CP_COLORS[idx],
                emissive: CP_COLORS[idx],
                emissiveIntensity: 0.6
            });
            const sphere = new THREE.Mesh(sphereGeom, sphereMat);
            sphere.position.set(cp.vertex[0], cp.vertex[1], cp.vertex[2]);
            this.pairGroups[pairIdx].add(sphere);
        });

        // Apply active pair visibility
        this.applyActivePair();

        return result;
    }

    /** Show/hide pairs based on activePair setting */
    setActivePair(pairIdx) {
        this.activePair = pairIdx; // 0, 1, or -1 (both)
        this.applyActivePair();
    }

    applyActivePair() {
        if (!this.pairGroups.length) return;
        if (this.activePair === -1) {
            this.pairGroups[0].visible = true;
            this.pairGroups[1].visible = true;
        } else {
            this.pairGroups[0].visible = (this.activePair === 0);
            this.pairGroups[1].visible = (this.activePair === 1);
        }
    }

    createCrookedPlaneMesh(triangles, color, opacity) {
        const positions = [];
        const edgePositions = [];

        for (const tri of triangles) {
            for (const v of tri) {
                positions.push(v[0], v[1], v[2]);
            }
            // Edge wireframe
            for (let i = 0; i < 3; i++) {
                const a = tri[i], b = tri[(i + 1) % 3];
                edgePositions.push(a[0], a[1], a[2], b[0], b[1], b[2]);
            }
        }

        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geom.computeVertexNormals();

        const mat = new THREE.MeshPhysicalMaterial({
            color: color,
            transparent: true,
            opacity: opacity,
            side: THREE.DoubleSide,
            roughness: 0.6,
            metalness: 0.1,
            depthWrite: false
        });

        const mesh = new THREE.Mesh(geom, mat);

        // Edge lines
        const edgeGeom = new THREE.BufferGeometry();
        edgeGeom.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
        const edgeMat = new THREE.LineBasicMaterial({
            color: color,
            transparent: true,
            opacity: opacity * 0.5,
            depthWrite: false
        });
        const edgeMesh = new THREE.LineSegments(edgeGeom, edgeMat);

        return { mesh, edgeMesh };
    }

    /* ---- Coordinate Axes ---- */
    buildAxes() {
        const axisLen = 6;
        const colors = [0xff4444, 0x44ff44, 0x4488ff]; // x=red, y=green, z=blue
        const labels = ['x₁', 'x₂', 'x₃'];
        const dirs = [
            new THREE.Vector3(1, 0, 0),
            new THREE.Vector3(0, 1, 0),
            new THREE.Vector3(0, 0, 1)
        ];

        for (let i = 0; i < 3; i++) {
            const mat = new THREE.LineBasicMaterial({
                color: colors[i],
                transparent: true,
                opacity: 0.4
            });
            const pts = [
                dirs[i].clone().multiplyScalar(-axisLen),
                dirs[i].clone().multiplyScalar(axisLen)
            ];
            const geom = new THREE.BufferGeometry().setFromPoints(pts);
            this.axisGroup.add(new THREE.Line(geom, mat));
        }

        // Grid on the x1-x2 plane (x₃=0, spacelike plane)
        // GridHelper defaults to xz-plane, so rotate to xy-plane
        const gridHelper = new THREE.GridHelper(12, 24, COLORS.grid, COLORS.grid);
        gridHelper.rotation.x = Math.PI / 2;
        gridHelper.material.transparent = true;
        gridHelper.material.opacity = 0.15;
        this.axisGroup.add(gridHelper);
    }

    /* ---- Cayley Graph ---- */
    buildCayleyGraph() {
        this.clearGroup(this.orbitGroup);
        const gens = getGenerators(this.params.translationScale);
        const maxDepth = 5;

        // Edge colors match crooked plane colors:
        // gen 0 = γ₁ (sky blue), gen 1 = γ₁⁻¹ (indigo), gen 2 = γ₂ (pink), gen 3 = γ₂⁻¹ (amber)
        const edgeColors = [0x38bdf8, 0x818cf8, 0xf472b6, 0xfbbf24];
        // Inverse map: gen 0 ↔ 1, gen 2 ↔ 3
        const inverseOf = [1, 0, 3, 2];

        const origin = [0, 0, 0];
        // BFS with backtrack avoidance (don't apply g⁻¹ right after g)
        const nodes = [{ point: origin, lastGen: -1 }];
        let frontier = [{ point: origin, lastGen: -1 }];

        const findNode = (pt) => nodes.findIndex(n =>
            Math.abs(n.point[0] - pt[0]) < 0.01 &&
            Math.abs(n.point[1] - pt[1]) < 0.01 &&
            Math.abs(n.point[2] - pt[2]) < 0.01
        );

        // Collect edges as {from: [x,y,z], to: [x,y,z], genIdx: number}
        const edges = [];

        for (let depth = 0; depth < maxDepth; depth++) {
            const next = [];
            for (const { point, lastGen } of frontier) {
                for (let gi = 0; gi < gens.generators.length; gi++) {
                    // Skip applying the inverse of the last generator (free reduction)
                    if (lastGen >= 0 && gi === inverseOf[lastGen]) continue;

                    const gen = gens.generators[gi];
                    const newPt = vecAdd(matVec(gen.matrix, point), gen.translation);

                    const existingIdx = findNode(newPt);
                    if (existingIdx < 0) {
                        nodes.push({ point: newPt, lastGen: gi });
                        next.push({ point: newPt, lastGen: gi });
                    }
                    // Always add edge (both directions will be handled, deduplicate below)
                    edges.push({ from: point, to: newPt, genIdx: gi });
                }
            }
            frontier = next;
        }

        // Render vertices
        const sphereGeom = new THREE.SphereGeometry(0.05, 12, 12);
        const sphereMat = new THREE.MeshStandardMaterial({
            color: 0xffffff,
            emissive: 0xffffff,
            emissiveIntensity: 0.3,
            transparent: true,
            opacity: 0.8
        });

        for (const node of nodes) {
            const s = new THREE.Mesh(sphereGeom, sphereMat);
            s.position.set(node.point[0], node.point[1], node.point[2]);
            this.orbitGroup.add(s);
        }

        // Render edges by generator color
        for (let gi = 0; gi < 4; gi++) {
            const genEdges = edges.filter(e => e.genIdx === gi);
            if (genEdges.length === 0) continue;

            const positions = [];
            for (const e of genEdges) {
                positions.push(e.from[0], e.from[1], e.from[2]);
                positions.push(e.to[0], e.to[1], e.to[2]);
            }

            const geom = new THREE.BufferGeometry();
            geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
            const mat = new THREE.LineBasicMaterial({
                color: edgeColors[gi],
                transparent: true,
                opacity: 0.5,
                depthWrite: false
            });
            this.orbitGroup.add(new THREE.LineSegments(geom, mat));
        }
    }

    /* =========================================
       ANIMATION — Isometry application
       ========================================= */

    /**
     * Animate an isometry: show one crooked plane morphing into its image.
     * genIndex: 0=γ₁, 1=γ₁⁻¹, 2=γ₂, 3=γ₂⁻¹
     */
    /** Set affine transform on Cayley graph group via Matrix4 */
    setCayleyTransform(At, bt) {
        if (!this.orbitGroup.children.length) return;
        this.orbitGroup.matrixAutoUpdate = false;
        const m4 = new THREE.Matrix4();
        m4.set(
            At[0][0], At[0][1], At[0][2], bt[0],
            At[1][0], At[1][1], At[1][2], bt[1],
            At[2][0], At[2][1], At[2][2], bt[2],
            0, 0, 0, 1
        );
        this.orbitGroup.matrix.copy(m4);
    }

    /** Reset Cayley graph group transform to identity */
    resetCayleyTransform() {
        this.orbitGroup.matrixAutoUpdate = false;
        this.orbitGroup.matrix.identity();
    }

    animateIsometry(genIndex, onComplete) {
        if (this.animating) return;
        this.animating = true;

        const gens = getGenerators(this.params.translationScale);
        const gen = gens.generators[genIndex];
        const { matrix: A, translation: b } = gen;

        // Only animate the visible pair's planes
        const sourcePlanes = this.crookedData.planes;
        const visibleIndices = [];
        if (this.activePair === -1) {
            visibleIndices.push(0, 1, 2, 3);
        } else if (this.activePair === 0) {
            visibleIndices.push(0, 1);
        } else {
            visibleIndices.push(2, 3);
        }

        const originalTriangles = sourcePlanes.map(p => p.triangles.map(t => t.map(v => [...v])));

        this.clearGroup(this.animGroup);

        const animMeshes = [];
        visibleIndices.forEach(idx => {
            const { mesh, edgeMesh } = this.createCrookedPlaneMesh(
                sourcePlanes[idx].triangles, CP_COLORS[idx], this.params.planeOpacity * 0.8
            );
            this.animGroup.add(mesh);
            this.animGroup.add(edgeMesh);
            animMeshes.push({ mesh, edgeMesh, originalTris: originalTriangles[idx] });
        });

        // Fade out originals
        this.crookedMeshes.forEach(m => { m.material.opacity = this.params.planeOpacity * 0.3; });
        this.crookedEdgeMeshes.forEach(m => { m.material.opacity = this.params.planeOpacity * 0.15; });

        const duration = 2000;
        const startTime = performance.now();

        const animFrame = (now) => {
            const elapsed = now - startTime;
            const t = Math.min(elapsed / duration, 1);
            const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

            const { matrix: At, translation: bt } = interpolateAffine(A, b, ease);

            // Animate crooked planes
            animMeshes.forEach(({ mesh, edgeMesh, originalTris }) => {
                const newTris = applyAffineToTriangles(originalTris, At, bt);
                const positions = [];
                const edgePositions = [];
                for (const tri of newTris) {
                    for (const v of tri) positions.push(v[0], v[1], v[2]);
                    for (let i = 0; i < 3; i++) {
                        const a = tri[i], b2 = tri[(i + 1) % 3];
                        edgePositions.push(a[0], a[1], a[2], b2[0], b2[1], b2[2]);
                    }
                }
                mesh.geometry.setAttribute('position',
                    new THREE.Float32BufferAttribute(positions, 3));
                mesh.geometry.attributes.position.needsUpdate = true;
                mesh.geometry.computeVertexNormals();
                edgeMesh.geometry.setAttribute('position',
                    new THREE.Float32BufferAttribute(edgePositions, 3));
                edgeMesh.geometry.attributes.position.needsUpdate = true;
            });

            // Animate Cayley graph
            this.setCayleyTransform(At, bt);

            if (t < 1) {
                requestAnimationFrame(animFrame);
            } else {
                setTimeout(() => {
                    this.clearGroup(this.animGroup);
                    this.resetCayleyTransform();
                    this.crookedMeshes.forEach(m => { m.material.opacity = this.params.planeOpacity; });
                    this.crookedEdgeMeshes.forEach(m => { m.material.opacity = this.params.planeOpacity * 0.5; });
                    this.animating = false;
                    if (onComplete) onComplete();
                }, 500);
            }
        };

        requestAnimationFrame(animFrame);
    }

    /**
     * Animate the pairing: show C_i^- mapping to C_i^+ for both generators simultaneously.
     */
    animatePairing(onComplete) {
        if (this.animating) return;
        this.animating = true;

        const result = this.crookedData;
        // Only animate the active pair's pairing (or both if -1)
        const pairingIndices = this.activePair === -1 ? [0, 1] :
            this.activePair === 0 ? [0] : [1];
        const pairings = pairingIndices.map(i => result.pairings[i]);

        this.clearGroup(this.animGroup);

        // Show both pairs during pairing animation
        if (this.activePair !== -1) {
            this.pairGroups.forEach(g => { g.visible = true; });
        }

        const animData = pairings.map(p => {
            const sourceIdx = p.from;
            const sourceTris = result.planes[sourceIdx].triangles.map(t => t.map(v => [...v]));
            const color = CP_COLORS[sourceIdx].clone().lerp(CP_COLORS[p.to], 0.5);
            const { mesh, edgeMesh } = this.createCrookedPlaneMesh(
                sourceTris, color, this.params.planeOpacity * 0.9
            );
            this.animGroup.add(mesh);
            this.animGroup.add(edgeMesh);
            return { mesh, edgeMesh, sourceTris, matrix: p.matrix, translation: p.translation };
        });

        // Dim originals
        this.crookedMeshes.forEach(m => { m.material.opacity = this.params.planeOpacity * 0.25; });
        this.crookedEdgeMeshes.forEach(m => { m.material.opacity = this.params.planeOpacity * 0.12; });

        const duration = 3000;
        const startTime = performance.now();

        const animFrame = (now) => {
            const elapsed = now - startTime;
            const t = Math.min(elapsed / duration, 1);
            const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

            animData.forEach(({ mesh, edgeMesh, sourceTris, matrix: A, translation: b }) => {
                const { matrix: At, translation: bt } = interpolateAffine(A, b, ease);
                const newTris = applyAffineToTriangles(sourceTris, At, bt);

                const positions = [];
                const edgePositions = [];
                for (const tri of newTris) {
                    for (const v of tri) positions.push(v[0], v[1], v[2]);
                    for (let i = 0; i < 3; i++) {
                        const a = tri[i], b2 = tri[(i + 1) % 3];
                        edgePositions.push(a[0], a[1], a[2], b2[0], b2[1], b2[2]);
                    }
                }
                mesh.geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
                mesh.geometry.attributes.position.needsUpdate = true;
                mesh.geometry.computeVertexNormals();
                edgeMesh.geometry.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
                edgeMesh.geometry.attributes.position.needsUpdate = true;
            });

            if (t < 1) {
                requestAnimationFrame(animFrame);
            } else {
                setTimeout(() => {
                    this.clearGroup(this.animGroup);
                    this.crookedMeshes.forEach(m => { m.material.opacity = this.params.planeOpacity; });
                    this.crookedEdgeMeshes.forEach(m => { m.material.opacity = this.params.planeOpacity * 0.5; });
                    this.applyActivePair();
                    this.animating = false;
                    if (onComplete) onComplete();
                }, 800);
            }
        };

        requestAnimationFrame(animFrame);
    }

    /* =========================================
       VISIBILITY TOGGLES
       ========================================= */

    toggleVisibility(key) {
        this.visible[key] = !this.visible[key];
        const groupMap = {
            lightCone: this.lightConeGroup,
            hyperboloid: this.hyperboloidGroup,
            crookedPlanes: this.crookedGroup,
            axes: this.axisGroup,
            fundamentalDomain: this.domainGroup,
            orbit: this.orbitGroup
        };
        const group = groupMap[key];
        if (group) group.visible = this.visible[key];

        if (key === 'orbit' && this.visible.orbit && this.orbitGroup.children.length === 0) {
            this.buildCayleyGraph();
        }

        return this.visible[key];
    }

    setAutoRotate(enabled) {
        this.autoRotate = enabled;
        this.controls.autoRotate = enabled;
    }

    resetCamera() {
        this.camera.position.set(6, 5, 4);
        this.controls.target.set(0, 0, 0);
        this.controls.update();
    }

    /* =========================================
       UPDATE PARAMETERS
       ========================================= */

    updateParam(key, value) {
        this.params[key] = value;
        if (key === 'translationScale' || key === 'planeSize') {
            this.rebuild();
        } else if (key === 'planeOpacity') {
            this.crookedMeshes.forEach(m => { m.material.opacity = value; });
            this.crookedEdgeMeshes.forEach(m => { m.material.opacity = value * 0.5; });
        } else if (key === 'coneHeight') {
            this.clearGroup(this.lightConeGroup);
            this.clearGroup(this.hyperboloidGroup);
            this.buildLightCone();
            this.buildHyperboloid();
        }
    }

    /* =========================================
       RENDER LOOP
       ========================================= */

    animate() {
        requestAnimationFrame(() => this.animate());
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    /** Get computed data for display */
    getComputedData() {
        return this.crookedData;
    }
}
