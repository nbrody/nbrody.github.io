// stage.js — one WebGL renderer, camera and orbit controls for the 3D views. The picture is
// centred in the area left of the panel (camera.setViewOffset).

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class Stage {
    constructor(canvas) {
        this.canvas = canvas;
        this.renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true, preserveDrawingBuffer: true });
        this.renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
        this.scene = new THREE.Scene();
        this.camera = new THREE.PerspectiveCamera(36, 1, 0.01, 100);
        this.camera.up.set(0, 0, 1);
        this.camera.position.set(0.35, -4.2, 0.9);
        this.controls = new OrbitControls(this.camera, canvas);
        this.controls.enableDamping = true;
        this.controls.dampingFactor = 0.08;
        this.controls.minDistance = 1.2;
        this.controls.maxDistance = 14;
        this.controls.autoRotateSpeed = 0.6;
        this.scene.add(new THREE.HemisphereLight(0xffffff, 0x334466, 1.6));
        const key = new THREE.DirectionalLight(0xffffff, 1.6);
        key.position.set(3, -2, 5);
        this.scene.add(key);
        const rim = new THREE.DirectionalLight(0x99bbff, 0.8);
        rim.position.set(-4, 3, -2);
        this.scene.add(rim);
        this.insetRight = 0;
        this.insetBottom = 0;
        this.resize();
        addEventListener('resize', () => this.resize());
    }

    /** Space taken by the panel on the right (px) and at the bottom (phones). */
    setInset(right, bottom = 0) { this.insetRight = right; this.insetBottom = bottom; this.resize(); }

    resize() {
        const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
        this.renderer.setSize(w, h, false);
        this.camera.aspect = w / h;
        // shift the image so the origin sits in the middle of the free area
        const fw = Math.max(200, w - this.insetRight), fh = Math.max(200, h - this.insetBottom);
        this.camera.setViewOffset(w, h, this.insetRight / 2, this.insetBottom / 2, w, h);
        this.camera.updateProjectionMatrix();
        this.freeW = fw; this.freeH = fh;
    }

    /** Screen position (CSS px) of a world point, and whether it is in front of the camera. */
    project(v) {
        const p = new THREE.Vector3(v[0], v[1], v[2]).project(this.camera);
        const w = this.canvas.clientWidth, h = this.canvas.clientHeight;
        return { x: (p.x + 1) / 2 * w, y: (1 - p.y) / 2 * h, front: p.z < 1 };
    }

    render() {
        this.controls.update();
        this.renderer.render(this.scene, this.camera);
    }

    /** Move the camera (along its current direction) so a ball of radius R fits the free area. */
    fit(R, margin = 0.86) {
        const t = Math.tan((this.camera.fov * Math.PI) / 360);
        const H = this.canvas.clientHeight || innerHeight;
        const frac = Math.min(this.freeW || H, this.freeH || H) / H;
        const d = R / (margin * t * frac);
        const dir = this.camera.position.clone().sub(this.controls.target).normalize();
        this.camera.position.copy(this.controls.target).addScaledVector(dir, d);
        this.controls.maxDistance = Math.max(14, 3 * d);
        this.controls.update();
    }

    reset(distance = 4.3) {
        const s = distance / Math.hypot(0.35, 4.2, 0.9);
        this.camera.position.set(0.35 * s, -4.2 * s, 0.9 * s);
        this.controls.target.set(0, 0, 0);
        this.controls.update();
    }
}
