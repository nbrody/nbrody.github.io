// renderer3d.js — Three.js scene for polyhedra, tilings, symmetry axes, animated isometries
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const AXIS_COLORS = {
    2: 0x22c55e, // green
    3: 0xf59e0b, // amber
    4: 0x60a5fa, // blue
    5: 0xf472b6, // pink
    6: 0xa78bfa, // purple
};

const TILING_COLORS = [
    0x60a5fa, 0xf472b6, 0xf59e0b, 0x22d3ee, 0xa78bfa,
    0x34d399, 0x38bdf8, 0xfbbf24, 0xfb7185, 0x818cf8,
];

export class Renderer3D {
    constructor(canvas) {
        this.canvas = canvas;

        // Scene
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x080c18);
        this.scene.fog = new THREE.FogExp2(0x080c18, 0.12);

        // Camera
        this.camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
        this.camera.position.set(2.5, 2, 3);
        this.camera.lookAt(0, 0, 0);

        // Renderer
        this.webgl = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
        this.webgl.setPixelRatio(window.devicePixelRatio);
        this.webgl.toneMapping = THREE.ACESFilmicToneMapping;
        this.webgl.toneMappingExposure = 1.2;

        // Controls
        this.controls = new OrbitControls(this.camera, canvas);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.minDistance = 1.5;
        this.controls.maxDistance = 15;
        this.controls.autoRotate = true;
        this.controls.autoRotateSpeed = 0.8;

        // Lighting
        const amb = new THREE.AmbientLight(0xffffff, 0.5);
        this.scene.add(amb);

        const dir1 = new THREE.DirectionalLight(0xffffff, 1.0);
        dir1.position.set(3, 5, 4);
        this.scene.add(dir1);

        const dir2 = new THREE.DirectionalLight(0x6090ff, 0.4);
        dir2.position.set(-3, -2, -4);
        this.scene.add(dir2);

        const hemi = new THREE.HemisphereLight(0x4488ff, 0x002244, 0.3);
        this.scene.add(hemi);

        // Scene object groups
        this.polyGroup = new THREE.Group();
        this.axesGroup = new THREE.Group();
        this.tilingGroup = new THREE.Group();
        this.ghostGroup = new THREE.Group();    // ghost overlay for animation
        this.scene.add(this.tilingGroup);
        this.scene.add(this.polyGroup);
        this.scene.add(this.axesGroup);
        this.scene.add(this.ghostGroup);

        // State
        this.currentGroup = null;
        this.showAxes = true;
        this.showWireframe = true;
        this.showTiling = false;
        this.opacity = 0.7;
        this.mode = 'polyhedron';  // 'polyhedron' | 'tiling'

        // Animation
        this.animating = false;
        this.animAxis = null;
        this.animAngle = 0;
        this.animT = 0;
        this.animDuration = 1200;
        this.animCallback = null;

        // Raycasting for axis clicks
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();
        canvas.addEventListener('click', (e) => this._onClick(e));
        canvas.addEventListener('mousemove', (e) => this._onMouseMove(e));
        this._hoveredTip = null;

        this.resize();
        this._loop();
    }

    resize() {
        const w = this.canvas.clientWidth;
        const h = this.canvas.clientHeight;
        if (w === 0 || h === 0) return;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.webgl.setSize(w, h);
    }

    resetView() {
        this.camera.position.set(2.5, 2, 3);
        this.camera.lookAt(0, 0, 0);
        this.controls.reset();
    }

    setGroup(group) {
        this.currentGroup = group;
        this._buildScene();
    }

    setMode(mode) {
        this.mode = mode;
        this._buildScene();
    }

    // ---- Animate a rotation about an axis ----
    animateRotation(axis, angle, callback) {
        if (this.animating) return;
        this.animAxis = new THREE.Vector3(axis[0], axis[1], axis[2]).normalize();
        this.animAngle = angle;
        this.animT = 0;
        this.animating = true;
        this.animStartTime = performance.now();
        this.animCallback = callback || null;

        // Create ghost copy of the polyhedron group
        this._createGhost();
    }

    // ---- Build full 3D scene ----
    _buildScene() {
        this.polyGroup.clear();
        this.axesGroup.clear();
        this.tilingGroup.clear();
        this.ghostGroup.clear();

        if (this.mode === 'tiling') {
            this._buildTiling();
            return;
        }

        if (!this.currentGroup || !this.currentGroup.polyhedron) {
            this._addCoordinateAxes();
            return;
        }

        const poly = this.currentGroup.polyhedron;

        // Build primary polyhedron
        this._addPolyhedron(poly, this.polyGroup);

        // Build dual if present
        if (poly.dual) {
            this._addPolyhedron(poly.dual, this.polyGroup);
        }

        // Build symmetry axes
        if (this.currentGroup.axes) {
            this._addSymmetryAxes(this.currentGroup.axes);
        }

        this._addCoordinateAxes();
    }

    // ============================================================
    //  POLYHEDRON RENDERING
    // ============================================================

    _addPolyhedron(data, parent, scale = 1, offset = null) {
        const color = new THREE.Color(data.color || '#60a5fa');
        const verts = data.vertices;

        // Faces
        const geom = new THREE.BufferGeometry();
        const positions = [];
        const normals = [];

        for (const face of data.faces) {
            for (let i = 1; i < face.length - 1; i++) {
                const a = verts[face[0]], b = verts[face[i]], c = verts[face[i + 1]];
                positions.push(
                    a[0] * scale, a[1] * scale, a[2] * scale,
                    b[0] * scale, b[1] * scale, b[2] * scale,
                    c[0] * scale, c[1] * scale, c[2] * scale
                );

                const ab = [b[0] - a[0], b[1] - a[1], b[2] - a[2]];
                const ac = [c[0] - a[0], c[1] - a[1], c[2] - a[2]];
                const n = [
                    ab[1] * ac[2] - ab[2] * ac[1],
                    ab[2] * ac[0] - ab[0] * ac[2],
                    ab[0] * ac[1] - ab[1] * ac[0]
                ];
                const len = Math.sqrt(n[0] ** 2 + n[1] ** 2 + n[2] ** 2) || 1;
                n[0] /= len; n[1] /= len; n[2] /= len;
                normals.push(...n, ...n, ...n);
            }
        }

        geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geom.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));

        const mat = new THREE.MeshPhysicalMaterial({
            color,
            transparent: true,
            opacity: data.opacity != null ? data.opacity : this.opacity,
            roughness: 0.3,
            metalness: 0.1,
            side: THREE.DoubleSide,
            depthWrite: false,
        });

        const mesh = new THREE.Mesh(geom, mat);
        if (offset) mesh.position.set(offset[0], offset[1], offset[2]);
        parent.add(mesh);

        // Edges
        if (data.edges) {
            const edgePositions = [];
            for (const [i, j] of data.edges) {
                edgePositions.push(
                    verts[i][0] * scale, verts[i][1] * scale, verts[i][2] * scale,
                    verts[j][0] * scale, verts[j][1] * scale, verts[j][2] * scale
                );
            }
            const edgeGeom = new THREE.BufferGeometry();
            edgeGeom.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
            const edgeMat = new THREE.LineBasicMaterial({
                color: color.clone().multiplyScalar(1.4),
                transparent: true,
                opacity: 0.85,
            });
            const edges = new THREE.LineSegments(edgeGeom, edgeMat);
            if (offset) edges.position.set(offset[0], offset[1], offset[2]);
            parent.add(edges);
        }

        // Vertices
        const sphereGeom = new THREE.SphereGeometry(0.025 * scale, 8, 8);
        const sphereMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
        for (const v of verts) {
            const sphere = new THREE.Mesh(sphereGeom, sphereMat);
            sphere.position.set(
                v[0] * scale + (offset?.[0] || 0),
                v[1] * scale + (offset?.[1] || 0),
                v[2] * scale + (offset?.[2] || 0)
            );
            parent.add(sphere);
        }

        return mesh;
    }

    // ============================================================
    //  SYMMETRY AXES
    // ============================================================

    _addSymmetryAxes(axes) {
        for (const axis of axes) {
            const color = AXIS_COLORS[axis.order] || 0xffffff;
            const dir = new THREE.Vector3(axis.dir[0], axis.dir[1], axis.dir[2]);

            const points = [
                dir.clone().multiplyScalar(-1.6),
                dir.clone().multiplyScalar(1.6)
            ];
            const geom = new THREE.BufferGeometry().setFromPoints(points);
            const mat = new THREE.LineBasicMaterial({
                color,
                transparent: true,
                opacity: 0.3,
            });
            const line = new THREE.Line(geom, mat);
            this.axesGroup.add(line);

            // Clickable tip sphere
            const tipGeom = new THREE.SphereGeometry(0.06, 10, 10);
            const tipMat = new THREE.MeshBasicMaterial({
                color,
                transparent: true,
                opacity: 0.6,
            });
            const tip = new THREE.Mesh(tipGeom, tipMat);
            tip.position.copy(dir.clone().multiplyScalar(1.6));
            tip.userData = { axis, isAxisTip: true };
            this.axesGroup.add(tip);

            // Label via sprite
            const labelCanvas = document.createElement('canvas');
            labelCanvas.width = 64;
            labelCanvas.height = 32;
            const lctx = labelCanvas.getContext('2d');
            lctx.fillStyle = '#' + new THREE.Color(color).getHexString();
            lctx.font = 'bold 18px sans-serif';
            lctx.textAlign = 'center';
            lctx.textBaseline = 'middle';
            lctx.fillText(axis.label, 32, 16);
            const tex = new THREE.CanvasTexture(labelCanvas);
            const spriteMat = new THREE.SpriteMaterial({ map: tex, transparent: true, opacity: 0.8 });
            const sprite = new THREE.Sprite(spriteMat);
            sprite.position.copy(dir.clone().multiplyScalar(1.85));
            sprite.scale.set(0.3, 0.15, 1);
            this.axesGroup.add(sprite);
        }
    }

    _addCoordinateAxes() {
        const len = 2.0;
        const colors = [0x553333, 0x335533, 0x333355];
        const dirs = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];

        for (let i = 0; i < 3; i++) {
            const pts = [
                new THREE.Vector3(0, 0, 0),
                new THREE.Vector3(dirs[i][0] * len, dirs[i][1] * len, dirs[i][2] * len)
            ];
            const geom = new THREE.BufferGeometry().setFromPoints(pts);
            const mat = new THREE.LineBasicMaterial({
                color: colors[i], transparent: true, opacity: 0.12
            });
            this.scene.add(new THREE.Line(geom, mat));
        }
    }

    // ============================================================
    //  3D TILINGS
    // ============================================================

    _buildTiling() {
        const groupId = this.currentGroup?.id;

        switch (groupId) {
            case 'O':
                this._buildCubicTiling();
                break;
            case 'T':
                this._buildTetraOctaTiling();
                break;
            case 'I':
                this._buildCubicTiling(); // icosahedral doesn't tile; show cubes
                break;
            default:
                this._buildCubicTiling();
        }

        this._addCoordinateAxes();
    }

    _buildCubicTiling() {
        const size = 1.0;
        const range = 2; // -2 to 2

        const cubeGeom = new THREE.BoxGeometry(size * 0.96, size * 0.96, size * 0.96);

        let colorIdx = 0;
        for (let x = -range; x <= range; x++) {
            for (let y = -range; y <= range; y++) {
                for (let z = -range; z <= range; z++) {
                    const dist = Math.abs(x) + Math.abs(y) + Math.abs(z);
                    const color = new THREE.Color(TILING_COLORS[colorIdx % TILING_COLORS.length]);

                    const alpha = Math.max(0.15, 0.6 - dist * 0.08);

                    const mat = new THREE.MeshPhysicalMaterial({
                        color,
                        transparent: true,
                        opacity: alpha,
                        roughness: 0.4,
                        metalness: 0.05,
                        side: THREE.DoubleSide,
                        depthWrite: false,
                    });

                    const mesh = new THREE.Mesh(cubeGeom, mat);
                    mesh.position.set(x * size, y * size, z * size);
                    this.tilingGroup.add(mesh);

                    // Wireframe
                    const edgesGeom = new THREE.EdgesGeometry(cubeGeom);
                    const edgeMat = new THREE.LineBasicMaterial({
                        color: color.clone().multiplyScalar(1.3),
                        transparent: true,
                        opacity: alpha * 0.8,
                    });
                    const wireframe = new THREE.LineSegments(edgesGeom, edgeMat);
                    wireframe.position.copy(mesh.position);
                    this.tilingGroup.add(wireframe);

                    colorIdx++;
                }
            }
        }
    }

    _buildTetraOctaTiling() {
        // Tetrahedral-octahedral honeycomb (octet truss)
        // Place regular tetrahedra and octahedra alternating
        const s = 0.7;
        const range = 2;

        // This creates a simplified version — alternating cubes colored
        // differently to suggest the T+O decomposition
        const tetraColor = new THREE.Color('#f59e0b');
        const octaColor = new THREE.Color('#f472b6');

        for (let x = -range; x <= range; x++) {
            for (let y = -range; y <= range; y++) {
                for (let z = -range; z <= range; z++) {
                    const isEven = (x + y + z) % 2 === 0;
                    const color = isEven ? tetraColor : octaColor;
                    const dist = Math.abs(x) + Math.abs(y) + Math.abs(z);
                    const alpha = Math.max(0.1, 0.5 - dist * 0.07);

                    if (isEven) {
                        // Tetrahedron
                        const geom = new THREE.TetrahedronGeometry(s * 0.55);
                        const mat = new THREE.MeshPhysicalMaterial({
                            color, transparent: true, opacity: alpha,
                            roughness: 0.3, side: THREE.DoubleSide, depthWrite: false,
                        });
                        const mesh = new THREE.Mesh(geom, mat);
                        mesh.position.set(x * s, y * s, z * s);
                        this.tilingGroup.add(mesh);

                        const edges = new THREE.LineSegments(
                            new THREE.EdgesGeometry(geom),
                            new THREE.LineBasicMaterial({ color: color.clone().multiplyScalar(1.4), transparent: true, opacity: alpha })
                        );
                        edges.position.copy(mesh.position);
                        this.tilingGroup.add(edges);
                    } else {
                        // Octahedron
                        const geom = new THREE.OctahedronGeometry(s * 0.45);
                        const mat = new THREE.MeshPhysicalMaterial({
                            color, transparent: true, opacity: alpha,
                            roughness: 0.3, side: THREE.DoubleSide, depthWrite: false,
                        });
                        const mesh = new THREE.Mesh(geom, mat);
                        mesh.position.set(x * s, y * s, z * s);
                        this.tilingGroup.add(mesh);

                        const edges = new THREE.LineSegments(
                            new THREE.EdgesGeometry(geom),
                            new THREE.LineBasicMaterial({ color: color.clone().multiplyScalar(1.4), transparent: true, opacity: alpha })
                        );
                        edges.position.copy(mesh.position);
                        this.tilingGroup.add(edges);
                    }
                }
            }
        }
    }

    // ============================================================
    //  GHOST OVERLAY (animation)
    // ============================================================

    _createGhost() {
        this.ghostGroup.clear();

        if (!this.currentGroup || !this.currentGroup.polyhedron) return;

        // Clone the polyhedron as a ghost
        const poly = this.currentGroup.polyhedron;
        const ghostColor = '#ffffff';

        const geom = new THREE.BufferGeometry();
        const positions = [];
        const verts = poly.vertices;

        for (const face of poly.faces) {
            for (let i = 1; i < face.length - 1; i++) {
                const a = verts[face[0]], b = verts[face[i]], c = verts[face[i + 1]];
                positions.push(...a, ...b, ...c);
            }
        }
        geom.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
        geom.computeVertexNormals();

        this.ghostMat = new THREE.MeshBasicMaterial({
            color: new THREE.Color(this.currentGroup.polyhedron.color || '#60a5fa'),
            transparent: true,
            opacity: 0.25,
            side: THREE.DoubleSide,
            depthWrite: false,
            wireframe: true,
        });

        const ghost = new THREE.Mesh(geom, this.ghostMat);
        this.ghostGroup.add(ghost);

        // Ghost edges
        if (poly.edges) {
            const edgePositions = [];
            for (const [i, j] of poly.edges) {
                edgePositions.push(...verts[i], ...verts[j]);
            }
            const edgeGeom = new THREE.BufferGeometry();
            edgeGeom.setAttribute('position', new THREE.Float32BufferAttribute(edgePositions, 3));
            this.ghostEdgeMat = new THREE.LineBasicMaterial({
                color: new THREE.Color(poly.color || '#60a5fa').multiplyScalar(0.8),
                transparent: true,
                opacity: 0.5,
            });
            this.ghostGroup.add(new THREE.LineSegments(edgeGeom, this.ghostEdgeMat));
        }
    }

    // ============================================================
    //  CLICK & HOVER INTERACTION
    // ============================================================

    _onClick(event) {
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.axesGroup.children, false);

        for (const hit of intersects) {
            if (hit.object.userData?.isAxisTip) {
                const axis = hit.object.userData.axis;
                const angle = (2 * Math.PI) / axis.order;
                this.animateRotation(axis.dir, angle);

                // Visual feedback
                if (this.onAxisClicked) {
                    this.onAxisClicked(axis);
                }
                break;
            }
        }
    }

    _onMouseMove(event) {
        const rect = this.canvas.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.camera);
        const intersects = this.raycaster.intersectObjects(this.axesGroup.children, false);

        // Reset previous
        if (this._hoveredTip && this._hoveredTip.material) {
            this._hoveredTip.material.opacity = 0.6;
            this._hoveredTip.scale.set(1, 1, 1);
        }
        this._hoveredTip = null;
        this.canvas.style.cursor = '';

        for (const hit of intersects) {
            if (hit.object.userData?.isAxisTip) {
                this._hoveredTip = hit.object;
                hit.object.material.opacity = 1;
                hit.object.scale.set(1.4, 1.4, 1.4);
                this.canvas.style.cursor = 'pointer';
                break;
            }
        }
    }

    // ============================================================
    //  ANIMATION LOOP
    // ============================================================

    _easeInOut(t) {
        return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t;
    }

    _loop() {
        requestAnimationFrame(() => this._loop());

        this.controls.update();

        // Handle rotation animation
        if (this.animating && this.animAxis) {
            const elapsed = performance.now() - this.animStartTime;
            const dur = this.animDuration;
            this.animT = Math.min(elapsed / dur, 1);
            const t = this._easeInOut(this.animT);

            // Rotate the ghost group
            const quat = new THREE.Quaternion().setFromAxisAngle(this.animAxis, this.animAngle * t);
            this.ghostGroup.quaternion.copy(quat);

            // Fade ghost: bright in middle, dim at start/end
            const fade = Math.sin(t * Math.PI);
            if (this.ghostMat) this.ghostMat.opacity = 0.15 + fade * 0.35;
            if (this.ghostEdgeMat) this.ghostEdgeMat.opacity = 0.3 + fade * 0.5;

            if (this.animT >= 1) {
                this.ghostGroup.quaternion.identity();
                this.ghostGroup.clear();
                this.animating = false;
                this.animAxis = null;
                if (this.animCallback) {
                    this.animCallback();
                    this.animCallback = null;
                }
            }
        }

        // Toggle visibility
        this.axesGroup.visible = this.showAxes;

        this.webgl.render(this.scene, this.camera);
    }

    // ============================================================
    //  PUBLIC CONTROLS
    // ============================================================

    setOpacity(val) {
        this.opacity = val;
        this.polyGroup.traverse(child => {
            if (child.isMesh && child.material?.transparent) {
                child.material.opacity = val;
            }
        });
    }

    setShowTiling(show) {
        this.showTiling = show;
        if (show) {
            this.mode = 'tiling';
        } else {
            this.mode = 'polyhedron';
        }
        this._buildScene();
    }
}
