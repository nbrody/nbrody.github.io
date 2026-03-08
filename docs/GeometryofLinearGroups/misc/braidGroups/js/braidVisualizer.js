/**
 * Three.js Braid Group Visualizer for B_n
 *
 * Renders an n-strand braid in 3D.  Uses BraidAnimator for smooth
 * transitions when generators are added or braid relations applied.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { BraidAnimator } from './braidAnimations.js';
import { getStrandCount } from './burau.js';

// ============================================================
//  Constants
// ============================================================

/** Generate an extended color palette for up to 12 strands. */
const STRAND_PALETTE = [
    0x00e5ff,   // cyan
    0xb388ff,   // purple
    0x69f0ae,   // green
    0xffab40,   // orange
    0xff6b6b,   // red
    0xfeca57,   // yellow
    0x54a0ff,   // blue
    0xff9ff3,   // pink
    0x1dd1a1,   // teal
    0xf368e0,   // magenta
    0xee5a24,   // vermillion
    0x0abde3    // sky blue
];

/** Get a color for strand i (wraps if more strands than palette). */
export function getStrandColor(i) {
    return STRAND_PALETTE[i % STRAND_PALETTE.length];
}

const STRAND_RADIUS = 0.06;
const STRAND_SPACING = 0.5;
const BASE_TUBE_SEGMENTS = 96;
const MAX_TUBE_SEGMENTS = 768;
const RADIAL_SEGMENTS = 12;

// ============================================================
//  BraidVisualizer
// ============================================================

export class BraidVisualizer {
    constructor(container) {
        this.container = container;
        this.crossings = [];
        this.numStrands = getStrandCount();

        this._initScene();
        this._initStrandMeshes();
        this._initEndpoints();

        this.animator = new BraidAnimator(this);

        // Smooth-zoom target (lerped toward each frame)
        this._zoomTarget = 4;
        this._autoFrameTicks = 0;

        this._animate();
    }

    // ========== Scene Setup ==========

    _initScene() {
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;

        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
        this.renderer.setSize(w, h);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setClearColor(0x000000, 0);
        this.container.appendChild(this.renderer.domElement);

        this.scene = new THREE.Scene();

        this.camera = new THREE.PerspectiveCamera(45, w / h, 0.1, 600);
        this.camera.position.set(0, 0.2, 4);
        this.camera.lookAt(0, 0, 0);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.enablePan = true;
        this.controls.screenSpacePanning = true;
        this.controls.zoomSpeed = 1.1;
        this.controls.panSpeed = 1.15;
        this.controls.minDistance = 1.5;
        this.controls.maxDistance = 80;
        this.controls.mouseButtons.LEFT = THREE.MOUSE.ROTATE;
        this.controls.mouseButtons.MIDDLE = THREE.MOUSE.DOLLY;
        this.controls.mouseButtons.RIGHT = THREE.MOUSE.PAN;
        this.controls.addEventListener('start', () => {
            this._autoFrameTicks = 0;
        });

        // Lighting
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.5));
        const dir = new THREE.DirectionalLight(0xffffff, 0.8);
        dir.position.set(3, 5, 4);
        this.scene.add(dir);
        const back = new THREE.DirectionalLight(0x8888ff, 0.3);
        back.position.set(-2, -3, -2);
        this.scene.add(back);

        this._resizeObserver = new ResizeObserver(() => this._onResize());
        this._resizeObserver.observe(this.container);
    }

    _onResize() {
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;
        if (w === 0 || h === 0) return;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
    }

    _computeFitDistance(totalLength) {
        const totalWidth = (this.numStrands - 1) * STRAND_SPACING + 1.0;
        const verticalFov = THREE.MathUtils.degToRad(this.camera.fov);
        const horizontalFov = 2 * Math.atan(Math.tan(verticalFov / 2) * this.camera.aspect);

        const heightDistance = ((totalLength / 2) * 1.12) / Math.tan(verticalFov / 2);
        const widthDistance = ((totalWidth / 2) * 1.25) / Math.tan(horizontalFov / 2);

        return Math.max(3.2, heightDistance, widthDistance);
    }

    _getTubeSegments(pointCount) {
        return Math.min(
            MAX_TUBE_SEGMENTS,
            Math.max(BASE_TUBE_SEGMENTS, Math.floor(pointCount * 0.7))
        );
    }

    /** Create persistent strand meshes (geometry swapped each frame). */
    _initStrandMeshes() {
        this.strandMeshes = [];
        for (let i = 0; i < this.numStrands; i++) {
            const color = getStrandColor(i);
            const mat = new THREE.MeshStandardMaterial({
                color,
                emissive: color,
                emissiveIntensity: 0.15,
                metalness: 0.5,
                roughness: 0.3,
                side: THREE.DoubleSide
            });
            const mesh = new THREE.Mesh(new THREE.BufferGeometry(), mat);
            mesh.visible = false;
            this.scene.add(mesh);
            this.strandMeshes.push(mesh);
        }
    }

    /** Create persistent endpoint spheres (top + bottom for each strand). */
    _initEndpoints() {
        this.endpointData = [];
        this.endpointGroup = new THREE.Group();
        const totalWidth = (this.numStrands - 1) * STRAND_SPACING;
        const startX = -totalWidth / 2;

        for (let i = 0; i < this.numStrands; i++) {
            const color = getStrandColor(i);
            const geo = new THREE.SphereGeometry(STRAND_RADIUS * 1.8, 16, 16);
            const mat = new THREE.MeshStandardMaterial({
                color, emissive: color, emissiveIntensity: 0.4,
                metalness: 0.3, roughness: 0.4
            });

            const top = new THREE.Mesh(geo, mat);
            top.position.set(startX + i * STRAND_SPACING, 0.5, 0);
            this.endpointGroup.add(top);

            const bot = new THREE.Mesh(geo.clone(), mat.clone());
            bot.position.set(startX + i * STRAND_SPACING, -0.5, 0);
            this.endpointGroup.add(bot);

            this.endpointData.push({ top, bot, x: startX + i * STRAND_SPACING });
        }
        this.scene.add(this.endpointGroup);
    }

    /** Rebuild strand/endpoint objects when strand count changes. */
    setStrandCount(n) {
        this.numStrands = n;

        // Remove old strand meshes
        for (const m of this.strandMeshes) {
            this.scene.remove(m);
            if (m.geometry) m.geometry.dispose();
            if (m.material) m.material.dispose();
        }
        this.strandMeshes = [];

        // Remove old endpoints
        if (this.endpointGroup) this.scene.remove(this.endpointGroup);
        this.endpointData = [];

        this._initStrandMeshes();
        this._initEndpoints();
        this.animator.setStrandCount(n);
    }

    // ========== Public API ==========

    /**
     * Set the braid from a list of generator symbols.
     * @param {string[]} symbols  – e.g. ['s1','S2','s3']
     * @param {'add'|'relation'|'snap'} transitionType
     */
    setCrossings(symbols, transitionType = 'add') {
        this.crossings = symbols.map(sym => {
            const isInverse = sym === sym.toUpperCase();
            const idx = parseInt(sym.replace(/[sS]/, ''));
            return { gen: idx, inverse: isInverse };
        }).filter(c => !isNaN(c.gen));

        this.animator.transitionTo(this.crossings, transitionType);
    }

    clear() {
        this.crossings = [];
        this.animator.transitionTo([], 'add');
    }

    dispose() {
        if (this._animId) cancelAnimationFrame(this._animId);
        if (this._resizeObserver) this._resizeObserver.disconnect();
        for (const m of this.strandMeshes) {
            this.scene.remove(m);
            if (m.geometry) m.geometry.dispose();
            if (m.material) m.material.dispose();
        }
        if (this.endpointGroup) this.scene.remove(this.endpointGroup);
        this.renderer.dispose();
        if (this.renderer.domElement.parentNode) {
            this.renderer.domElement.parentNode.removeChild(this.renderer.domElement);
        }
    }

    // ========== Called by BraidAnimator ==========

    /** Rebuild tube geometry from interpolated sample arrays. */
    updateStrands(samples) {
        for (let i = 0; i < this.numStrands; i++) {
            const pts = samples[i];
            if (!pts || pts.length < 2) {
                this.strandMeshes[i].visible = false;
                continue;
            }
            const curve = new THREE.CatmullRomCurve3(pts, false, 'catmullrom', 0.5);
            const tubeSegments = this._getTubeSegments(pts.length);
            const newGeo = new THREE.TubeGeometry(
                curve, tubeSegments, STRAND_RADIUS, RADIAL_SEGMENTS, false
            );
            const oldGeo = this.strandMeshes[i].geometry;
            this.strandMeshes[i].geometry = newGeo;
            this.strandMeshes[i].visible = true;
            if (oldGeo && oldGeo.getAttribute('position')) oldGeo.dispose();
        }
    }

    /** Move endpoint dots and update top-dot colors for the given permutation. */
    updateEndpoints(totalLength, perm) {
        const topY = totalLength / 2;
        const botY = -totalLength / 2;
        for (let i = 0; i < this.endpointData.length; i++) {
            const ep = this.endpointData[i];
            ep.top.position.y = topY;
            ep.bot.position.y = botY;

            // Top dot color = strand currently at this position
            if (perm) {
                const strandColor = getStrandColor(perm[i]);
                ep.top.material.color.setHex(strandColor);
                ep.top.material.emissive.setHex(strandColor);
            }
        }
    }

    /** Set a zoom target that the camera smoothly approaches. */
    smoothZoom(totalLength) {
        const fitDistance = this._computeFitDistance(totalLength);
        this._zoomTarget = fitDistance;
        this.controls.target.set(0, 0, 0);
        this.controls.minDistance = Math.max(1.5, fitDistance * 0.08);
        this.controls.maxDistance = Math.max(80, fitDistance * 6);
        this.camera.far = Math.max(600, fitDistance * 10, totalLength * 5);
        this.camera.updateProjectionMatrix();
        this._autoFrameTicks = 90;
    }

    // ========== Animation Loop ==========

    _animate() {
        this._animId = requestAnimationFrame(() => this._animate());

        // Drive the transition animator
        this.animator.update();

        // Smooth camera zoom
        if (this._autoFrameTicks > 0) {
            const dz = this._zoomTarget - this.camera.position.z;
            if (Math.abs(dz) > 0.005) {
                this.camera.position.z += dz * 0.09;
            }
            this._autoFrameTicks -= 1;
        }

        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
}
