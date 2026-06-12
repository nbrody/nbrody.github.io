/**
 * scene.js — Three.js rendering for Margulis spacetimes visualization
 *
 * Modern rendering: ACES tone mapping, PBR environment lighting,
 * fresnel shader surfaces for the light cone / hyperboloid, crisp
 * structural edges (Line2 fat lines) on crooked planes, shader grid.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { LineSegments2 } from 'three/addons/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/addons/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/addons/lines/LineMaterial.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import {
    computeCrookedPlanes, applyAffineToTriangles, interpolateAffine,
    getGenerators, matVec, vecAdd
} from './math.js';

/* =========================================
   COLOR PALETTE
   ========================================= */
const COLORS = {
    cp1plus: new THREE.Color(0x38bdf8),   // sky blue
    cp1minus: new THREE.Color(0x818cf8),  // indigo
    cp2plus: new THREE.Color(0xf472b6),   // pink
    cp2minus: new THREE.Color(0xfbbf24),  // amber
    lightCone: new THREE.Color(0x9fd8ff),
    hyperboloid: new THREE.Color(0x22d3ee),
    grid: new THREE.Color(0x4d628f),
    fog: new THREE.Color(0x050a18)
};

const CP_COLORS = [COLORS.cp1plus, COLORS.cp1minus, COLORS.cp2plus, COLORS.cp2minus];
const EDGE_OPACITY = 1.6;   // edge lines slightly brighter than fill
const WHITE = new THREE.Color(0xffffff);

/* =========================================
   GEOMETRY HELPERS — structural edge extraction
   ========================================= */

/**
 * Find the boundary/hinge edges of a triangle soup: edges that belong to
 * exactly one triangle. For a crooked plane this yields the null-line
 * hinges, the stem rim, and the wing perimeters — and discards all
 * interior triangulation edges.
 * Returns [triIdx, cornerA, cornerB] references so positions can be
 * re-read after an affine transform (topology is preserved).
 */
function extractBoundaryEdges(triangles) {
    const counts = new Map();
    const vkey = v => `${Math.round(v[0] * 4096)},${Math.round(v[1] * 4096)},${Math.round(v[2] * 4096)}`;
    triangles.forEach((tri, t) => {
        for (let i = 0; i < 3; i++) {
            const j = (i + 1) % 3;
            const a = vkey(tri[i]), b = vkey(tri[j]);
            const k = a < b ? a + '|' + b : b + '|' + a;
            const e = counts.get(k);
            if (e) e.count++;
            else counts.set(k, { count: 1, ref: [t, i, j] });
        }
    });
    const edges = [];
    for (const { count, ref } of counts.values()) {
        if (count === 1) edges.push(ref);
    }
    return edges;
}

/** Flat [x1,y1,z1,x2,y2,z2,...] positions for a set of edge references */
function edgePositionArray(triangles, edges) {
    const arr = new Float32Array(edges.length * 6);
    edges.forEach(([t, i, j], n) => {
        const a = triangles[t][i], b = triangles[t][j];
        arr[n * 6] = a[0]; arr[n * 6 + 1] = a[1]; arr[n * 6 + 2] = a[2];
        arr[n * 6 + 3] = b[0]; arr[n * 6 + 4] = b[1]; arr[n * 6 + 5] = b[2];
    });
    return arr;
}

/* =========================================
   SHADERS
   ========================================= */

const FRESNEL_VERT = /* glsl */`
    varying vec3 vWorldPos;
    varying vec3 vNormal;
    void main() {
        vec4 wp = modelMatrix * vec4(position, 1.0);
        vWorldPos = wp.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * wp;
    }
`;

// Holographic fresnel shell with vertical fade-out toward |z| = uHeight
const FRESNEL_FRAG = /* glsl */`
    uniform vec3 uColor;
    uniform float uHeight;
    uniform float uBase;
    uniform float uStrength;
    varying vec3 vWorldPos;
    varying vec3 vNormal;
    void main() {
        vec3 V = normalize(cameraPosition - vWorldPos);
        float fres = pow(1.0 - abs(dot(V, normalize(vNormal))), 2.2);
        float hf = clamp(abs(vWorldPos.z) / uHeight, 0.0, 1.0);
        float fade = 1.0 - smoothstep(0.72, 1.0, hf);
        float alpha = (uBase + uStrength * fres) * fade;
        gl_FragColor = vec4(uColor, alpha);
    }
`;

const GRID_VERT = /* glsl */`
    varying vec2 vXY;
    void main() {
        vXY = position.xy;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
`;

const GRID_FRAG = /* glsl */`
    uniform vec3 uColor;
    uniform float uRadius;
    varying vec2 vXY;
    float gridFactor(vec2 p, float spacing) {
        vec2 q = p / spacing;
        vec2 g = abs(fract(q - 0.5) - 0.5) / fwidth(q);
        return 1.0 - min(min(g.x, g.y), 1.0);
    }
    void main() {
        float r = length(vXY);
        float fade = 1.0 - smoothstep(uRadius * 0.25, uRadius, r);
        float minor = gridFactor(vXY, 0.5) * 0.30;
        float major = gridFactor(vXY, 2.0) * 0.62;
        float a = max(minor, major) * fade;
        if (a < 0.004) discard;
        gl_FragColor = vec4(uColor, a);
    }
`;

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

        // Generator preset: 'adjoint' (hyperbolic, crooked planes) or
        // 'unipotent' (affine pair acting on the plane x₃ = 1)
        this.preset = 'adjoint';

        this.crookedMeshes = [];       // flat: [cp0, cp1, cp2, cp3]
        this.crookedEdgeMeshes = [];   // flat: [cp0, cp1, cp2, cp3]
        this.planeEntries = [];        // {mesh, edgeMesh, boundary} per plane
        this.pairGroups = [];          // [group0(pair1), group1(pair2)]

        this.glowTexture = this.makeGlowTexture();

        this.init();
        this.buildScene();
        this.animate();
    }

    init() {
        // Renderer — transparent clear so the CSS gradient backdrop shows
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setClearColor(0x000000, 0);
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.15;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
        this.container.appendChild(this.renderer.domElement);

        // Scene
        this.scene = new THREE.Scene();
        this.scene.fog = new THREE.FogExp2(COLORS.fog, 0.022);

        // Image-based lighting for the physical materials
        const pmrem = new THREE.PMREMGenerator(this.renderer);
        this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
        pmrem.dispose();

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

        // Lights — soft three-point setup on top of the environment map
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.25));

        const hemi = new THREE.HemisphereLight(0x3a5a8c, 0x0b1020, 0.45);
        this.scene.add(hemi);

        const key = new THREE.DirectionalLight(0xffffff, 0.7);
        key.position.set(5, 8, 6);
        this.scene.add(key);

        const rim = new THREE.DirectionalLight(0x38bdf8, 0.35);
        rim.position.set(-6, -4, -5);
        this.scene.add(rim);

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
        // Fat-line materials need the viewport resolution
        this.scene.traverse(o => {
            if (o.isLineSegments2) o.material.resolution.set(window.innerWidth, window.innerHeight);
        });
    }

    /* =========================================
       TEXTURE / SPRITE HELPERS
       ========================================= */

    makeGlowTexture() {
        const c = document.createElement('canvas');
        c.width = c.height = 128;
        const ctx = c.getContext('2d');
        const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
        g.addColorStop(0, 'rgba(255,255,255,1)');
        g.addColorStop(0.3, 'rgba(255,255,255,0.45)');
        g.addColorStop(0.7, 'rgba(255,255,255,0.08)');
        g.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, 128, 128);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        return tex;
    }

    makeGlowSprite(color, scale = 0.4, opacity = 0.75) {
        const mat = new THREE.SpriteMaterial({
            map: this.glowTexture,
            color: color,
            transparent: true,
            opacity: opacity,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const s = new THREE.Sprite(mat);
        s.scale.set(scale, scale, 1);
        return s;
    }

    makeTextSprite(text, cssColor) {
        const c = document.createElement('canvas');
        c.width = 128; c.height = 64;
        const ctx = c.getContext('2d');
        ctx.font = '600 40px Inter, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.shadowColor = 'rgba(0,0,0,0.8)';
        ctx.shadowBlur = 8;
        ctx.fillStyle = cssColor;
        ctx.fillText(text, 64, 34);
        const tex = new THREE.CanvasTexture(c);
        tex.colorSpace = THREE.SRGBColorSpace;
        const mat = new THREE.SpriteMaterial({
            map: tex, transparent: true, opacity: 0.85, depthWrite: false
        });
        const s = new THREE.Sprite(mat);
        s.scale.set(0.64, 0.32, 1);
        return s;
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
        this.planeEntries = [];
        this.pairGroups = [];
        this.crookedData = null;
        if (this.preset === 'adjoint') this.buildCrookedPlanes();
        this.clearGroup(this.orbitGroup);
        this.resetCayleyTransform();
        if (this.visible.orbit) this.buildCayleyGraph();
    }

    /** Switch generator preset ('adjoint' | 'unipotent') and rebuild. */
    setPreset(preset) {
        if (this.preset === preset) return;
        this.preset = preset;
        // The unipotent pair has no crooked planes — the Cayley orbit
        // is the main thing to look at, so switch it on.
        if (preset === 'unipotent' && !this.visible.orbit) {
            this.visible.orbit = true;
            this.orbitGroup.visible = true;
        }
        this.rebuild();
    }

    clearGroup(group) {
        // Recursive: groups may contain sub-groups (e.g. pairGroups)
        group.traverse(child => {
            if (child.geometry) child.geometry.dispose();
            if (child.material) {
                const mats = Array.isArray(child.material) ? child.material : [child.material];
                mats.forEach(m => {
                    // Shared glow texture must survive; text sprites own theirs
                    if (m.map && m.map !== this.glowTexture) m.map.dispose();
                    m.dispose();
                });
            }
        });
        while (group.children.length > 0) group.remove(group.children[0]);
    }

    /* ---- Light Cone ---- */
    buildLightCone() {
        const h = this.params.coneHeight;
        const segs = 96;

        // Both nappes as a smooth fresnel shell
        const positions = [];
        const indices = [];

        for (const sign of [1, -1]) {
            const base = positions.length / 3;
            const rings = 24;
            for (let j = 0; j <= rings; j++) {
                const t = (j / rings) * h;
                for (let i = 0; i <= segs; i++) {
                    const theta = (i / segs) * Math.PI * 2;
                    positions.push(t * Math.cos(theta), t * Math.sin(theta), sign * t);
                }
            }
            for (let j = 0; j < rings; j++) {
                for (let i = 0; i < segs; i++) {
                    const a = base + j * (segs + 1) + i;
                    const b = a + 1;
                    const c = a + segs + 1;
                    const d = c + 1;
                    indices.push(a, b, c, b, d, c);
                }
            }
        }

        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geom.setIndex(indices);
        geom.computeVertexNormals();

        const mat = new THREE.ShaderMaterial({
            uniforms: {
                uColor: { value: COLORS.lightCone },
                uHeight: { value: h },
                uBase: { value: 0.025 },
                uStrength: { value: 0.4 }
            },
            vertexShader: FRESNEL_VERT,
            fragmentShader: FRESNEL_FRAG,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending
        });

        this.lightConeGroup.add(new THREE.Mesh(geom, mat));

        // Faint null-ray rulings through the apex
        const rayMat = new THREE.LineBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.07,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const rayPositions = [];
        for (let i = 0; i < 16; i++) {
            const theta = (i / 16) * Math.PI * 2;
            const c = Math.cos(theta), s = Math.sin(theta);
            rayPositions.push(h * c, h * s, -h, h * c, h * s, h);
        }
        const rayGeom = new THREE.BufferGeometry();
        rayGeom.setAttribute('position', new THREE.Float32BufferAttribute(rayPositions, 3));
        this.lightConeGroup.add(new THREE.LineSegments(rayGeom, rayMat));

        // Rim circles at z = ±h for definition
        const rimMat = new THREE.LineBasicMaterial({
            color: COLORS.lightCone,
            transparent: true,
            opacity: 0.16,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        for (const sign of [1, -1]) {
            const pts = [];
            for (let i = 0; i <= segs; i++) {
                const theta = (i / segs) * Math.PI * 2;
                pts.push(new THREE.Vector3(h * Math.cos(theta), h * Math.sin(theta), sign * h));
            }
            const rimGeom = new THREE.BufferGeometry().setFromPoints(pts);
            this.lightConeGroup.add(new THREE.Line(rimGeom, rimMat));
        }

        // Soft glow at the apex (origin)
        this.lightConeGroup.add(this.makeGlowSprite(COLORS.lightCone, 0.5, 0.45));
    }

    /* ---- One-sheeted Hyperboloid ---- */
    buildHyperboloid() {
        // x² + y² - z² = 1 (one-sheeted hyperboloid of unit spacelike vectors)
        const segs = 96;
        const rings = 48;
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
                indices.push(a, b, c, b, d, c);
            }
        }

        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geom.setIndex(indices);
        geom.computeVertexNormals();

        const mat = new THREE.ShaderMaterial({
            uniforms: {
                uColor: { value: COLORS.hyperboloid },
                uHeight: { value: maxZ },
                uBase: { value: 0.012 },
                uStrength: { value: 0.28 }
            },
            vertexShader: FRESNEL_VERT,
            fragmentShader: FRESNEL_FRAG,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide,
            blending: THREE.AdditiveBlending
        });
        this.hyperboloidGroup.add(new THREE.Mesh(geom, mat));

        // The two ruling families: lines through (cosθ, sinθ, 0)
        // with direction (−sinθ, cosθ, ±1) — doubly ruled surface.
        const ruleMat = new THREE.LineBasicMaterial({
            color: COLORS.hyperboloid,
            transparent: true,
            opacity: 0.09,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const nRules = 18;
        const rulePositions = [];
        for (const sgn of [1, -1]) {
            for (let i = 0; i < nRules; i++) {
                const theta = (i / nRules) * Math.PI * 2;
                const c = Math.cos(theta), s = Math.sin(theta);
                rulePositions.push(
                    c + maxZ * s, s - maxZ * c, -sgn * maxZ,
                    c - maxZ * s, s + maxZ * c, sgn * maxZ
                );
            }
        }
        const ruleGeom = new THREE.BufferGeometry();
        ruleGeom.setAttribute('position', new THREE.Float32BufferAttribute(rulePositions, 3));
        this.hyperboloidGroup.add(new THREE.LineSegments(ruleGeom, ruleMat));

        // Waist circle (z = 0, r = 1)
        const waistPts = [];
        for (let i = 0; i <= 96; i++) {
            const theta = (i / 96) * Math.PI * 2;
            waistPts.push(new THREE.Vector3(Math.cos(theta), Math.sin(theta), 0));
        }
        const waistMat = new THREE.LineBasicMaterial({
            color: COLORS.hyperboloid,
            transparent: true,
            opacity: 0.28,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        this.hyperboloidGroup.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(waistPts), waistMat));
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
            const entry = this.createCrookedPlaneMesh(cp.triangles, CP_COLORS[idx], this.params.planeOpacity);
            this.pairGroups[pairIdx].add(entry.mesh);
            this.pairGroups[pairIdx].add(entry.edgeMesh);
            this.crookedMeshes.push(entry.mesh);
            this.crookedEdgeMeshes.push(entry.edgeMesh);
            this.planeEntries.push(entry);

            // Vertex marker: bright core + additive glow halo
            const sphereGeom = new THREE.SphereGeometry(0.05, 24, 24);
            const sphereMat = new THREE.MeshStandardMaterial({
                color: CP_COLORS[idx],
                emissive: CP_COLORS[idx],
                emissiveIntensity: 1.4,
                roughness: 0.3
            });
            const sphere = new THREE.Mesh(sphereGeom, sphereMat);
            sphere.position.set(cp.vertex[0], cp.vertex[1], cp.vertex[2]);
            this.pairGroups[pairIdx].add(sphere);

            const glow = this.makeGlowSprite(CP_COLORS[idx], 0.45, 0.7);
            glow.position.copy(sphere.position);
            this.pairGroups[pairIdx].add(glow);
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

    /**
     * Build a crooked plane: glassy double-sided surface + crisp fat-line
     * structural edges (hinges, stem rim, wing perimeters only).
     * Returns {mesh, edgeMesh, boundary}.
     */
    createCrookedPlaneMesh(triangles, color, opacity) {
        const positions = new Float32Array(triangles.length * 9);
        let p = 0;
        for (const tri of triangles) {
            for (const v of tri) {
                positions[p++] = v[0]; positions[p++] = v[1]; positions[p++] = v[2];
            }
        }

        const geom = new THREE.BufferGeometry();
        geom.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geom.computeVertexNormals();

        const mat = new THREE.MeshPhysicalMaterial({
            color: color,
            emissive: color,
            emissiveIntensity: 0.32,
            transparent: true,
            opacity: opacity,
            side: THREE.DoubleSide,
            roughness: 0.38,
            metalness: 0.0,
            clearcoat: 0.5,
            clearcoatRoughness: 0.35,
            envMapIntensity: 0.5,
            depthWrite: false
        });

        const mesh = new THREE.Mesh(geom, mat);
        mesh.frustumCulled = false; // geometry is rewritten during animations

        // Structural edges as screen-space fat lines
        const boundary = extractBoundaryEdges(triangles);
        const edgeGeom = new LineSegmentsGeometry();
        edgeGeom.setPositions(Array.from(edgePositionArray(triangles, boundary)));
        const edgeMat = new LineMaterial({
            color: color.clone().lerp(WHITE, 0.22).getHex(),
            linewidth: 1.6, // px
            transparent: true,
            opacity: Math.min(1, opacity * EDGE_OPACITY),
            depthWrite: false
        });
        edgeMat.resolution.set(window.innerWidth, window.innerHeight);
        const edgeMesh = new LineSegments2(edgeGeom, edgeMat);
        edgeMesh.frustumCulled = false;

        return { mesh, edgeMesh, boundary };
    }

    /** Rewrite an entry's surface + edge geometry in place (same topology). */
    updatePlaneGeometry(entry, triangles) {
        const { mesh, edgeMesh, boundary } = entry;

        const pos = mesh.geometry.attributes.position;
        let p = 0;
        for (const tri of triangles) {
            for (const v of tri) {
                pos.array[p++] = v[0]; pos.array[p++] = v[1]; pos.array[p++] = v[2];
            }
        }
        pos.needsUpdate = true;
        mesh.geometry.computeVertexNormals();

        const earr = edgePositionArray(triangles, boundary);
        const ibuf = edgeMesh.geometry.attributes.instanceStart.data;
        ibuf.array.set(earr);
        ibuf.needsUpdate = true;
    }

    /* ---- Coordinate Axes & Grid ---- */
    buildAxes() {
        const axisLen = 6;
        const axisColors = [0xf87171, 0x4ade80, 0x60a5fa]; // x=red, y=green, z=blue
        const labels = ['x₁', 'x₂', 'x₃'];
        const cssColors = ['#f87171', '#4ade80', '#60a5fa'];
        const dirs = [
            new THREE.Vector3(1, 0, 0),
            new THREE.Vector3(0, 1, 0),
            new THREE.Vector3(0, 0, 1)
        ];

        for (let i = 0; i < 3; i++) {
            const mat = new THREE.LineBasicMaterial({
                color: axisColors[i],
                transparent: true,
                opacity: 0.35,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });
            const pts = [
                dirs[i].clone().multiplyScalar(-axisLen),
                dirs[i].clone().multiplyScalar(axisLen)
            ];
            const geom = new THREE.BufferGeometry().setFromPoints(pts);
            this.axisGroup.add(new THREE.Line(geom, mat));

            const label = this.makeTextSprite(labels[i], cssColors[i]);
            label.position.copy(dirs[i]).multiplyScalar(axisLen + 0.35);
            this.axisGroup.add(label);
        }

        // Fading shader grid on the spacelike plane x₃ = 0
        this.axisGroup.add(this.makeGridMesh(12, COLORS.grid));
    }

    /** Fading anti-aliased grid plane (XY orientation, radius-limited) */
    makeGridMesh(radius, color) {
        const gridMat = new THREE.ShaderMaterial({
            uniforms: {
                uColor: { value: color },
                uRadius: { value: radius }
            },
            vertexShader: GRID_VERT,
            fragmentShader: GRID_FRAG,
            transparent: true,
            depthWrite: false,
            side: THREE.DoubleSide
        });
        return new THREE.Mesh(new THREE.PlaneGeometry(radius * 2, radius * 2), gridMat);
    }

    /* ---- Cayley Graph ---- */
    buildCayleyGraph() {
        this.clearGroup(this.orbitGroup);
        const gens = getGenerators(this.params.translationScale, this.preset);
        const maxDepth = 5;

        // Edge colors match crooked plane colors:
        // gen 0 = γ₁ (sky blue), gen 1 = γ₁⁻¹ (indigo), gen 2 = γ₂ (pink), gen 3 = γ₂⁻¹ (amber)
        const edgeColors = [0x38bdf8, 0x818cf8, 0xf472b6, 0xfbbf24];
        // Inverse map: gen 0 ↔ 1, gen 2 ↔ 3
        const inverseOf = [1, 0, 3, 2];

        const origin = gens.basePoint || [0, 0, 0];
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
                    edges.push({ from: point, to: newPt, genIdx: gi });
                }
            }
            frontier = next;
        }

        // Vertices: instanced glowing dots
        const nodeGeom = new THREE.SphereGeometry(0.04, 12, 12);
        const nodeMat = new THREE.MeshBasicMaterial({
            color: 0xffffff,
            transparent: true,
            opacity: 0.8,
            blending: THREE.AdditiveBlending,
            depthWrite: false
        });
        const inst = new THREE.InstancedMesh(nodeGeom, nodeMat, nodes.length);
        const m4 = new THREE.Matrix4();
        nodes.forEach((node, i) => {
            m4.makeTranslation(node.point[0], node.point[1], node.point[2]);
            inst.setMatrixAt(i, m4);
        });
        this.orbitGroup.add(inst);

        // Identity vertex gets a halo
        const halo = this.makeGlowSprite(new THREE.Color(0xffffff), 0.35, 0.6);
        halo.position.set(origin[0], origin[1], origin[2]);
        this.orbitGroup.add(halo);

        // Unipotent preset: mark the invariant plane x₃ = 1 the orbit lives in.
        // It sits in orbitGroup so it shears along with the animated action.
        if (this.preset === 'unipotent') {
            const plane = this.makeGridMesh(8, new THREE.Color(0x3fae8f));
            plane.position.z = 1;
            this.orbitGroup.add(plane);
        }

        // Edges by generator color, additive glow
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
                opacity: 0.45,
                blending: THREE.AdditiveBlending,
                depthWrite: false
            });
            this.orbitGroup.add(new THREE.LineSegments(geom, mat));
        }
    }

    /* =========================================
       ANIMATION — Isometry application
       ========================================= */

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

    /**
     * Animate an isometry: show one crooked plane morphing into its image.
     * genIndex: 0=γ₁, 1=γ₁⁻¹, 2=γ₂, 3=γ₂⁻¹
     */
    animateIsometry(genIndex, onComplete) {
        if (this.animating) return;
        this.animating = true;

        const gens = getGenerators(this.params.translationScale, this.preset);
        const gen = gens.generators[genIndex];
        const { matrix: A, translation: b } = gen;

        // Only animate the visible pair's planes (none in unipotent mode —
        // the Cayley graph still animates below)
        const sourcePlanes = this.crookedData ? this.crookedData.planes : [];
        const visibleIndices = [];
        if (sourcePlanes.length) {
            if (this.activePair === -1) {
                visibleIndices.push(0, 1, 2, 3);
            } else if (this.activePair === 0) {
                visibleIndices.push(0, 1);
            } else {
                visibleIndices.push(2, 3);
            }
        }

        const originalTriangles = sourcePlanes.map(p => p.triangles.map(t => t.map(v => [...v])));

        this.clearGroup(this.animGroup);

        const animEntries = [];
        visibleIndices.forEach(idx => {
            const entry = this.createCrookedPlaneMesh(
                sourcePlanes[idx].triangles, CP_COLORS[idx], this.params.planeOpacity * 0.8
            );
            this.animGroup.add(entry.mesh);
            this.animGroup.add(entry.edgeMesh);
            animEntries.push({ entry, originalTris: originalTriangles[idx] });
        });

        // Fade out originals
        this.crookedMeshes.forEach(m => { m.material.opacity = this.params.planeOpacity * 0.3; });
        this.crookedEdgeMeshes.forEach(m => { m.material.opacity = this.params.planeOpacity * 0.3; });

        const duration = 2000;
        const startTime = performance.now();

        const animFrame = (now) => {
            const elapsed = now - startTime;
            const t = Math.min(elapsed / duration, 1);
            const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

            const { matrix: At, translation: bt } = interpolateAffine(A, b, ease);

            // Animate crooked planes
            animEntries.forEach(({ entry, originalTris }) => {
                const newTris = applyAffineToTriangles(originalTris, At, bt);
                this.updatePlaneGeometry(entry, newTris);
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
                    this.crookedEdgeMeshes.forEach(m => {
                        m.material.opacity = Math.min(1, this.params.planeOpacity * EDGE_OPACITY);
                    });
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
        if (this.animating || !this.crookedData) return;
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
            const entry = this.createCrookedPlaneMesh(
                sourceTris, color, this.params.planeOpacity * 0.9
            );
            this.animGroup.add(entry.mesh);
            this.animGroup.add(entry.edgeMesh);
            return { entry, sourceTris, matrix: p.matrix, translation: p.translation };
        });

        // Dim originals
        this.crookedMeshes.forEach(m => { m.material.opacity = this.params.planeOpacity * 0.25; });
        this.crookedEdgeMeshes.forEach(m => { m.material.opacity = this.params.planeOpacity * 0.25; });

        const duration = 3000;
        const startTime = performance.now();

        const animFrame = (now) => {
            const elapsed = now - startTime;
            const t = Math.min(elapsed / duration, 1);
            const ease = t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;

            animData.forEach(({ entry, sourceTris, matrix: A, translation: b }) => {
                const { matrix: At, translation: bt } = interpolateAffine(A, b, ease);
                const newTris = applyAffineToTriangles(sourceTris, At, bt);
                this.updatePlaneGeometry(entry, newTris);
            });

            if (t < 1) {
                requestAnimationFrame(animFrame);
            } else {
                setTimeout(() => {
                    this.clearGroup(this.animGroup);
                    this.crookedMeshes.forEach(m => { m.material.opacity = this.params.planeOpacity; });
                    this.crookedEdgeMeshes.forEach(m => {
                        m.material.opacity = Math.min(1, this.params.planeOpacity * EDGE_OPACITY);
                    });
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
            this.crookedEdgeMeshes.forEach(m => {
                m.material.opacity = Math.min(1, value * EDGE_OPACITY);
            });
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
