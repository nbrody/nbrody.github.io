// Three.js scene: dark background, soft lighting, OrbitControls, and a
// tube mesh rebuilt each frame from the live polygon.

class KnotScene {
    constructor(canvas) {
        this.canvas = canvas;
        this.renderer = new THREE.WebGLRenderer({
            canvas, antialias: true, alpha: true,
        });
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0x0a0e1a);
        // No fog — at extreme zoom-out it would erase the knot.

        this.camera = new THREE.PerspectiveCamera(45, 1, 0.01, 5000);
        this.camera.position.set(0, 0, 14);

        this.controls = new THREE.OrbitControls(this.camera, canvas);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;

        // Lights: hemisphere fill + a key directional + a rim from behind.
        this.scene.add(new THREE.HemisphereLight(0x8da5ff, 0x1a1f35, 0.55));
        const key = new THREE.DirectionalLight(0xffffff, 0.85);
        key.position.set(6, 8, 10);
        this.scene.add(key);
        const rim = new THREE.DirectionalLight(0xc084fc, 0.45);
        rim.position.set(-6, -4, -8);
        this.scene.add(rim);

        // Subtle reference grid in the floor plane.
        const grid = new THREE.GridHelper(30, 30, 0x1a2240, 0x12162a);
        grid.position.y = -6;
        grid.material.transparent = true;
        grid.material.opacity = 0.5;
        this.scene.add(grid);

        // Knot tube + (optional) vertex marker spheres.
        this.tubeMaterial = new THREE.MeshPhysicalMaterial({
            color: 0x6c8aff,
            metalness: 0.35,
            roughness: 0.28,
            clearcoat: 0.6,
            clearcoatRoughness: 0.2,
            sheen: 0.4,
            sheenColor: 0xc084fc,
        });
        this.tubeMesh = null;
        this.tubeRadius = 0.18;
        this.tubularSegments = 600;
        this.radialSegments = 16;

        this.onResize();
        window.addEventListener('resize', () => this.onResize());
    }

    onResize() {
        const w = this.canvas.clientWidth;
        const h = this.canvas.clientHeight;
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
    }

    setColor(hex) {
        this.tubeMaterial.color.set(hex);
    }

    setTubeRadius(r) {
        this.tubeRadius = r;
    }

    // Rebuild the tube geometry from a Polygon (array of Vector3).
    updateTube(points) {
        // Use a closed Catmull-Rom curve for a smooth tube around the polygon.
        const curve = new THREE.CatmullRomCurve3(points, /*closed*/ true,
            'centripetal', 0.5);
        const segs = Math.max(120, points.length * 3);
        const geo = new THREE.TubeGeometry(curve, segs, this.tubeRadius,
            this.radialSegments, /*closed*/ true);
        if (this.tubeMesh) {
            this.tubeMesh.geometry.dispose();
            this.tubeMesh.geometry = geo;
        } else {
            this.tubeMesh = new THREE.Mesh(geo, this.tubeMaterial);
            this.scene.add(this.tubeMesh);
        }
    }

    frame(points) {
        // Auto-fit camera distance to the knot's bounding sphere on first
        // frame after a (re)load.
        if (!points.length) return;
        const box = new THREE.Box3();
        for (const p of points) box.expandByPoint(p);
        const sphere = new THREE.Sphere();
        box.getBoundingSphere(sphere);
        const dist = sphere.radius / Math.tan((this.camera.fov / 2) * Math.PI / 180) * 1.6;
        this.camera.position.setLength(Math.max(dist, 6));
        this.controls.target.copy(sphere.center);
        this.controls.update();
    }

    render() {
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }
}

window.KnotScene = KnotScene;
