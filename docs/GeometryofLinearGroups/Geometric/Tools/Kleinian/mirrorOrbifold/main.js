/**
 * Mirror Orbifold - Main Application
 * 
 * Renders a right-angled hyperbolic dodecahedron with one-way mirror
 * pentagonal patches. The viewer can explore the recursive reflections
 * inside or see the structure from the outside.
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import poly from './polyhedra.js';
import { MirrorShader, createMirrorUniforms, updateGeometryUniforms } from './mirror.js';

class MirrorOrbifoldApp {
    constructor() {
        this.container = document.getElementById('canvas-container');
        this.loadingScreen = document.getElementById('loading-screen');
        this.statusDisplay = document.getElementById('status-display');

        this.params = {
            chamber: 'hyp-icosahedron-2pi3',
            scale: 1.0,
            maxBounces: 12,
            mirrorOpacity: 0.94,
            transparency: 0.80,
            edgeLightWidth: 0.015,
            blackBorderWidth: 0.025,
            lightIntensity: 2.0,
            colorSpeed: 0.017,
            palette: 0
        };

        this.init();
        this.setupControls();
        this.animate();
    }

    init() {
        this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.container.appendChild(this.renderer.domElement);

        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.001, 100);
        this.camera.position.set(0, 0, 0.3); // Start slightly inside

        this.controls = new OrbitControls(this.camera, this.renderer.domElement);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.minDistance = 0.0001;
        this.controls.maxDistance = 5.0;

        this.uniforms = createMirrorUniforms(THREE);
        this.updateGeometry();

        const shaderMaterial = new THREE.ShaderMaterial({
            uniforms: this.uniforms,
            vertexShader: MirrorShader.vertexShader,
            fragmentShader: MirrorShader.fragmentShader,
            depthTest: false,
            depthWrite: false
        });

        const quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), shaderMaterial);
        quad.frustumCulled = false;
        this.scene.add(quad);

        this.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);

        window.addEventListener('resize', () => this.onResize());

        setTimeout(() => {
            if (this.loadingScreen) {
                this.loadingScreen.style.opacity = '0';
                setTimeout(() => this.loadingScreen.style.display = 'none', 600);
            }
            this.updateStatus('ORBIFOLD ACTIVE // DODECA_H3');
        }, 1200);
    }

    updateGeometry() {
        let faces;
        const chamber = this.params.chamber;

        if (chamber.startsWith('euc-')) {
            // Euclidean polyhedra
            const shape = chamber.replace('euc-', '');
            let normals;
            switch (shape) {
                case 'tetrahedron': normals = poly.getTetrahedronNormals(); break;
                case 'cube': normals = poly.getCubeNormals(); break;
                case 'octahedron': normals = poly.getOctahedronNormals(); break;
                case 'dodecahedron': normals = poly.getDodecahedronNormals(); break;
                case 'icosahedron': normals = poly.getIcosahedronNormals(); break;
                case 'prism': normals = poly.getPrismNormals(6); break;
                default: normals = poly.getDodecahedronNormals();
            }
            faces = poly.generateEuclidean(normals, this.params.scale);
            this.updateStatus(`${shape.toUpperCase()} // EUCLIDEAN`);
        } else {
            // Hyperbolic polyhedra with fixed dihedral angles
            switch (chamber) {
                case 'hyp-cube-60':
                    faces = poly.getHyperbolicCube60();
                    this.updateStatus('CUBE // H³ π/3 ANGLES');
                    break;
                case 'hyp-octahedron-90':
                    faces = poly.getHyperbolicOctahedron90();
                    this.updateStatus('OCTAHEDRON // H³ RIGHT-ANGLED');
                    break;
                case 'hyp-dodecahedron-90':
                    faces = poly.getHyperbolicDodecahedron90();
                    this.updateStatus('DODECAHEDRON // H³ RIGHT-ANGLED');
                    break;
                case 'hyp-icosahedron-ideal':
                    faces = poly.getHyperbolicIcosahedronIdeal();
                    this.updateStatus('ICOSAHEDRON // H³ IDEAL');
                    break;
                case 'hyp-icosahedron-2pi3':
                    faces = poly.getHyperbolicIcosahedron2pi3();
                    this.updateStatus('ICOSAHEDRON // H³ 2π/3 ANGLES');
                    break;
                default:
                    faces = poly.getHyperbolicDodecahedron90();
                    this.updateStatus('DODECAHEDRON // H³ RIGHT-ANGLED');
            }
        }
        updateGeometryUniforms(this.uniforms, faces, THREE);
    }

    setupControls() {
        const bind = (id, param, uniform) => {
            const el = document.getElementById(id);
            const valEl = document.getElementById(id.replace('-slider', '-value'));
            if (!el) return;
            el.addEventListener('input', (e) => {
                const val = parseFloat(e.target.value);
                this.params[param] = val;
                if (uniform) this.uniforms[uniform].value = val;
                if (valEl) valEl.textContent = (el.step < 0.1) ? val.toFixed(3) : (val < 2 ? val.toFixed(2) : val.toFixed(0));
                if (param === 'scale') this.updateGeometry();
                if (id === 'opacity-slider' && valEl) valEl.textContent = (val * 100).toFixed(0) + '%';
            });
        };

        bind('bounce-slider', 'maxBounces', 'uMaxBounces');
        bind('opacity-slider', 'mirrorOpacity', 'uMirrorOpacity');
        bind('transparency-slider', 'transparency', 'uTransparency');
        bind('intensity-slider', 'lightIntensity', 'uLightIntensity');
        bind('scale-slider', 'scale', null);
        bind('edge-slider', 'edgeLightWidth', 'uEdgeLightWidth');
        bind('border-slider', 'blackBorderWidth', 'uBlackBorderWidth');
        bind('colorspeed-slider', 'colorSpeed', 'uColorSpeed');

        // Chamber selector
        const chamberSelect = document.getElementById('chamber-select');
        if (chamberSelect) {
            chamberSelect.addEventListener('change', (e) => {
                this.params.chamber = e.target.value;

                // Show/hide scale slider based on geometry type
                const scaleGroup = document.getElementById('scale-slider')?.closest('.control-group');
                if (scaleGroup) {
                    scaleGroup.style.display = this.params.chamber.startsWith('euc-') ? 'block' : 'none';
                }

                this.updateGeometry();
            });
        }

        // Palette selector
        const paletteSelect = document.getElementById('palette-select');
        if (paletteSelect) {
            paletteSelect.addEventListener('change', (e) => {
                this.params.palette = parseInt(e.target.value);
                this.uniforms.uPalette.value = this.params.palette;
            });
        }
    }

    onResize() {
        const w = window.innerWidth;
        const h = window.innerHeight;
        this.camera.aspect = w / h;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(w, h);
        this.uniforms.uResolution.value.set(w, h);
    }

    updateStatus(message) {
        if (this.statusDisplay) this.statusDisplay.textContent = `> ${message}`;
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        this.controls.update();

        this.uniforms.uTime.value = performance.now() * 0.001;
        this.uniforms.uCameraPos.value.copy(this.camera.position);
        this.uniforms.uInvProjection.value.copy(this.camera.projectionMatrixInverse);
        this.uniforms.uInvView.value.copy(this.camera.matrixWorld);

        this.renderer.render(this.scene, this.camera);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    const app = new MirrorOrbifoldApp();

    // Keyboard shortcuts
    window.addEventListener('keydown', (e) => {
        if (e.key === 'h' || e.key === 'H') {
            const toggleBtn = document.getElementById('panel-toggle');
            if (toggleBtn) toggleBtn.click();
        }
    });
});
