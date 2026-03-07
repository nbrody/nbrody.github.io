// ============================================================
//  renderer.js — Three.js scene for Riley Slice 3D
//  InstancedMesh point cloud with per-instance coloring
// ============================================================

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { colormapLookup, VIRIDIS, INFERNO } from './colormap.js';

// Disable color management so sRGB colormap values pass through unchanged
THREE.ColorManagement.enabled = false;

const BOUND = 2;
const AXIS_LEN = 2.3;

export class RileyRenderer {
    constructor(container) {
        this.container = container;
        this.instancedMesh = null;
        this.gridData = null;
        this._colormapTable = VIRIDIS;

        this._initScene();
        this._initAxes();
        this._initBoundingBox();
        this._initClipping();
    }

    // ── Scene setup ────────────────────────────────────────
    _initScene() {
        const w = this.container.clientWidth;
        const h = this.container.clientHeight;

        this.renderer = new THREE.WebGLRenderer({ antialias: true });
        this.renderer.setSize(w, h);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.setClearColor(0x0a0b14, 1);
        this.renderer.localClippingEnabled = true;
        this.container.appendChild(this.renderer.domElement);

        this.scene = new THREE.Scene();

        this.camera = new THREE.PerspectiveCamera(50, w / h, 0.1, 100);
        this.camera.position.set(5, 3.5, 4);
        this.camera.lookAt(0, 0, 0);

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.target.set(0, 0, 0);

        // Lighting
        this.scene.add(new THREE.AmbientLight(0xffffff, 0.6));
        const dir = new THREE.DirectionalLight(0xffffff, 0.8);
        dir.position.set(5, 8, 6);
        this.scene.add(dir);
        const back = new THREE.DirectionalLight(0x6666cc, 0.3);
        back.position.set(-3, -4, -2);
        this.scene.add(back);

        // Resize handling
        this._onResize = () => {
            const w = this.container.clientWidth;
            const h = this.container.clientHeight;
            this.camera.aspect = w / h;
            this.camera.updateProjectionMatrix();
            this.renderer.setSize(w, h);
        };
        window.addEventListener('resize', this._onResize);
    }

    // ── Axes ───────────────────────────────────────────────
    _initAxes() {
        const mat = new THREE.LineBasicMaterial({ color: 0x333355 });
        const axes = [
            { dir: [1, 0, 0], label: 'a' },
            { dir: [0, 1, 0], label: 'b' },
            { dir: [0, 0, 1], label: 'c' },
        ];
        for (const ax of axes) {
            const pts = [
                new THREE.Vector3(-AXIS_LEN * ax.dir[0], -AXIS_LEN * ax.dir[1], -AXIS_LEN * ax.dir[2]),
                new THREE.Vector3(AXIS_LEN * ax.dir[0], AXIS_LEN * ax.dir[1], AXIS_LEN * ax.dir[2]),
            ];
            const geom = new THREE.BufferGeometry().setFromPoints(pts);
            this.scene.add(new THREE.Line(geom, mat));

            // Label sprite
            this._addLabel(ax.label,
                new THREE.Vector3(
                    (AXIS_LEN + 0.2) * ax.dir[0],
                    (AXIS_LEN + 0.2) * ax.dir[1],
                    (AXIS_LEN + 0.2) * ax.dir[2]
                )
            );
        }
    }

    _addLabel(text, position) {
        const canvas = document.createElement('canvas');
        canvas.width = 64;
        canvas.height = 64;
        const ctx = canvas.getContext('2d');
        ctx.font = 'italic 44px Inter, serif';
        ctx.fillStyle = '#7777aa';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(text, 32, 32);

        const tex = new THREE.CanvasTexture(canvas);
        const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true });
        const sprite = new THREE.Sprite(spriteMat);
        sprite.position.copy(position);
        sprite.scale.set(0.35, 0.35, 1);
        this.scene.add(sprite);
    }

    // ── Bounding box wireframe ─────────────────────────────
    _initBoundingBox() {
        const geom = new THREE.BoxGeometry(4, 4, 4);
        const edges = new THREE.EdgesGeometry(geom);
        const mat = new THREE.LineBasicMaterial({ color: 0x222244, transparent: true, opacity: 0.4 });
        this.scene.add(new THREE.LineSegments(edges, mat));
    }

    // ── Clipping plane ─────────────────────────────────────
    _initClipping() {
        this.clippingPlane = new THREE.Plane(new THREE.Vector3(1, 0, 0), 0);
        this.clippingEnabled = false;
    }

    setClipping(axis, position, enabled) {
        const normal = axis === 'a' ? new THREE.Vector3(1, 0, 0)
            : axis === 'b' ? new THREE.Vector3(0, 1, 0)
                : new THREE.Vector3(0, 0, 1);
        this.clippingPlane.set(normal, -position);
        this.clippingEnabled = enabled;

        if (this.instancedMesh) {
            this.instancedMesh.material.clippingPlanes = enabled ? [this.clippingPlane] : [];
            this.instancedMesh.material.needsUpdate = true;
        }
    }

    // ── Colormap ───────────────────────────────────────────
    setColormap(name) {
        this._colormapTable = name === 'inferno' ? INFERNO : VIRIDIS;
    }

    // ── Point cloud ────────────────────────────────────────
    updatePointCloud(gridData, resolution, threshLow, threshHigh, pointSize, opacity) {
        // Dispose old mesh
        if (this.instancedMesh) {
            this.scene.remove(this.instancedMesh);
            this.instancedMesh.geometry.dispose();
            this.instancedMesh.material.dispose();
            this.instancedMesh = null;
        }

        if (!gridData) return;

        const lo = -BOUND, hi = BOUND;
        const step = (hi - lo) / (resolution - 1);

        // Count visible points
        let count = 0;
        for (let i = 0; i < gridData.length; i++) {
            const v = gridData[i];
            if (!isNaN(v) && v >= threshLow && v <= threshHigh) count++;
        }
        if (count === 0) return;

        // Cap instances for performance
        const maxInstances = 300000;
        const skip = count > maxInstances ? Math.ceil(count / maxInstances) : 1;

        const halfStep = step * 0.42 * pointSize;
        const geom = new THREE.BoxGeometry(halfStep * 2, halfStep * 2, halfStep * 2);
        const mat = new THREE.MeshStandardMaterial({
            roughness: 0.55,
            metalness: 0.05,
            transparent: opacity < 1,
            opacity: opacity,
            depthWrite: opacity >= 0.95,
        });
        if (this.clippingEnabled) {
            mat.clippingPlanes = [this.clippingPlane];
        }

        const actualCount = Math.min(count, maxInstances);
        const mesh = new THREE.InstancedMesh(geom, mat, actualCount);

        const m4 = new THREE.Matrix4();
        const color = new THREE.Color();
        const table = this._colormapTable;

        let idx = 0;
        let skipCounter = 0;
        for (let ix = 0; ix < resolution && idx < actualCount; ix++) {
            for (let iy = 0; iy < resolution && idx < actualCount; iy++) {
                for (let iz = 0; iz < resolution && idx < actualCount; iz++) {
                    const v = gridData[ix * resolution * resolution + iy * resolution + iz];
                    if (isNaN(v) || v < threshLow || v > threshHigh) continue;

                    if (skip > 1) {
                        skipCounter++;
                        if (skipCounter % skip !== 0) continue;
                    }

                    const x = lo + ix * step; // a
                    const y = lo + iy * step; // b
                    const z = lo + iz * step; // c

                    m4.makeTranslation(x, y, z);
                    mesh.setMatrixAt(idx, m4);

                    // Normalize v to [0,1] for colormap
                    const t = Math.max(0, Math.min(1, (v - threshLow) / (threshHigh - threshLow)));
                    colormapLookup(t, color, table);
                    mesh.setColorAt(idx, color);

                    idx++;
                }
            }
        }

        mesh.instanceMatrix.needsUpdate = true;
        if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
        mesh.count = idx;

        this.instancedMesh = mesh;
        this.scene.add(mesh);
    }

    // ── Render loop tick ───────────────────────────────────
    render() {
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    dispose() {
        window.removeEventListener('resize', this._onResize);
        if (this.instancedMesh) {
            this.instancedMesh.geometry.dispose();
            this.instancedMesh.material.dispose();
        }
        this.renderer.dispose();
    }
}
