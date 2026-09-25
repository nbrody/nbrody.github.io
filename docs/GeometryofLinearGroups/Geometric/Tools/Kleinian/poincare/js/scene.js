/**
 * Three.js scaffolding: renderer, camera, controls, the raymarched domain
 * material, themes, and the ball / upper-half-space view models.
 */
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { ballToUHS } from './math.js';
import { vertexShader, fragmentShader, MAX_FACES } from './shaders.js';
import { getPaletteSettings } from './controlPanel.js';
import { mirrorDefaults } from './mirror.js';

export const container = document.getElementById('viz-container');
export const scene = new THREE.Scene();
export const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.01, 100);
camera.position.set(2.5, 1.5, 2.5);
camera.lookAt(0, 0, 0);

export const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setSize(container.clientWidth, container.clientHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

export const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.rotateSpeed = 0.8;
controls.zoomSpeed = 1.2;
controls.autoRotate = true;
controls.autoRotateSpeed = 1.0;

// ---------------- the domain raymarcher ----------------

const EMPTY = new THREE.Vector4(0, 0, 100, 99.995);
const palette = getPaletteSettings();

export const material = new THREE.ShaderMaterial({
    uniforms: {
        u_cameraPos: { value: new THREE.Vector3() },
        u_faces: { value: Array.from({ length: MAX_FACES }, () => EMPTY.clone()) },
        u_faceColor: { value: Array.from({ length: MAX_FACES }, () => new THREE.Vector3(0.6, 0.6, 0.7)) },
        u_faceCount: { value: 0 },
        u_time: { value: 0 },
        u_opacity: { value: 1.0 },
        u_colorMode: { value: palette.mode },
        u_colorOffset: { value: palette.offset.clone() },
        u_colorFreq: { value: palette.freq },
        u_uhs: { value: false },
        u_ceiling: { value: 0 },           // UHS cutaway height (0 = off)
        u_lightMode: { value: 0 },
        u_bgColor: { value: new THREE.Color(0x05070f) },
        u_maxBounces: { value: mirrorDefaults.maxBounces },
        u_edgeLightWidth: { value: mirrorDefaults.edgeLightWidth },
        u_lightIntensity: { value: mirrorDefaults.lightIntensity }
    },
    vertexShader,
    fragmentShader,
    transparent: true,
    depthWrite: true,
    depthTest: true,
    side: THREE.BackSide
});

export const ballBox = new THREE.BoxGeometry(2.5, 2.5, 2.5);
export const uhsBox = new THREE.BoxGeometry(14, 12, 14);
uhsBox.translate(0, 5, 0);                       // tall in y, covers y ∈ [-1, 11]

export const mesh = new THREE.Mesh(ballBox, material);
mesh.renderOrder = -1;
scene.add(mesh);

scene.add(new THREE.AmbientLight(0xffffff, 0.5));
// Sky/ground fill so lit layers (horoballs, tubes) read in the half-space view.
scene.add(new THREE.HemisphereLight(0xf1f5ff, 0x3a3550, 0.8));
const pointLight = new THREE.PointLight(0xffffff, 1);
pointLight.position.set(5, 5, 5);
scene.add(pointLight);

/** Load a domain's covectors and per-face colours into the raymarcher. */
export function loadDomainUniforms(domain, colors) {
    const faces = material.uniforms.u_faces.value;
    const cols = material.uniforms.u_faceColor.value;
    const walls = domain ? domain.walls : [];
    const n = Math.min(walls.length, MAX_FACES);
    for (let i = 0; i < MAX_FACES; i++) {
        if (i < n) faces[i].copy(walls[i].cov);
        else faces[i].copy(EMPTY);
        if (i < n && colors && colors[i]) cols[i].set(colors[i][0], colors[i][1], colors[i][2]);
    }
    material.uniforms.u_faceCount.value = n;
}

// ---------------- themes ----------------

export const THEMES = {
    dark: {
        bg: 0x05070f,
        dust: { color: 0xdce6ff, emissive: 0xb8c8ff, intensity: 0.6, opacity: 0.85 },
        cayleyVertex: { color: 0xffffff, emissive: 0xbcd4ff, intensity: 0.25 },
        generators: [0x38bdf8, 0xf472b6, 0xfbbf24, 0x22c55e,
            0xa78bfa, 0xfb7185, 0x34d399, 0xf97316],
        cone: 0xffffff,
        isoFlow: 0x22d3ee,
        orbit: 0xc084fc,
    },
    light: {
        bg: 0xeef1f8,
        dust: { color: 0x5a6488, emissive: 0x3d4668, intensity: 0.15, opacity: 0.7 },
        cayleyVertex: { color: 0x3b4463, emissive: 0x4b5578, intensity: 0.1 },
        generators: [0x0284c7, 0xdb2777, 0xb45309, 0x15803d,
            0x7c3aed, 0xe11d48, 0x0f766e, 0xc2410c],
        cone: 0x64748b,
        isoFlow: 0x0e7490,
        orbit: 0x7e22ce,
    },
};
export const view = { model: 'ball', theme: 'dark' };
export const theme = () => THEMES[view.theme];
// Read all over (Cayley edges, walls, tiling); a theme change rewrites the
// contents so every consumer keeps its reference.
export const generatorColors = THEMES.dark.generators.slice();

export function applyThemeUniforms() {
    const T = theme();
    material.uniforms.u_lightMode.value = view.theme === 'light' ? 1 : 0;
    // Raw components: the ShaderMaterial writes gl_FragColor without a
    // colour-space conversion, so the fog target must be the page's sRGB.
    const bg = material.uniforms.u_bgColor.value;
    bg.r = ((T.bg >> 16) & 255) / 255;
    bg.g = ((T.bg >> 8) & 255) / 255;
    bg.b = (T.bg & 255) / 255;
    T.generators.forEach((c, i) => { generatorColors[i] = c; });
    document.documentElement.classList.toggle('light', view.theme === 'light');
}

// ---------------- view models ----------------

/** Ball point → world position in the current model (UHS: height is world y). */
export function toWorld(p) {
    if (view.model === 'ball') return new THREE.Vector3(p.x, p.y, p.z);
    const u = ballToUHS(p);
    return new THREE.Vector3(u.x, u.t, u.y);
}

/** Map a ball-coordinate geometry into the current model, in place. */
export function geomToWorld(g) {
    if (view.model === 'ball') return g;
    const a = g.attributes.position.array;
    for (let i = 0; i < a.length; i += 3) {
        const u = ballToUHS({ x: a[i], y: a[i + 1], z: a[i + 2] });
        a[i] = u.x; a[i + 1] = u.t; a[i + 2] = u.y;
    }
    g.attributes.position.needsUpdate = true;
    g.computeVertexNormals();
    g.computeBoundingSphere();
    return g;
}

/** Marker scale for a ball point: constant hyperbolic size, floored. */
export function markerScale(p, floor = 0.1, k = 1.5) {
    if (view.model === 'uhs') {
        const w = toWorld(p);
        return (w.y > 18 || Math.abs(w.x) > 18 || Math.abs(w.z) > 18) ? 0 : Math.min(8, Math.max(0.06, w.y * 0.85));
    }
    return Math.max(floor, (1 - Math.sqrt(p.x * p.x + p.y * p.y + p.z * p.z)) * k);
}

export function setModelCamera() {
    if (view.model === 'uhs') {
        camera.position.set(0.9, 3.2, 2.6);
        controls.target.set(0, 0.35, 0);
        camera.far = 80;
    } else {
        camera.position.set(2.5, 1.5, 2.5);
        controls.target.set(0, 0, 0);
        camera.far = 100;
    }
    camera.updateProjectionMatrix();
    controls.update();
}

export function disposeGroup(group) {
    group.traverse(obj => {
        if (obj.isInstancedMesh) obj.dispose();
        if (obj.geometry) obj.geometry.dispose();
        if (obj.material) {
            const mats = Array.isArray(obj.material) ? obj.material : [obj.material];
            mats.forEach(m => m.dispose());
        }
    });
    group.clear();
}

/** A new group added to the scene. */
export function layer(visible = true) {
    const g = new THREE.Group();
    g.visible = visible;
    scene.add(g);
    return g;
}

// Keep the picture centred in the part of the window the panel leaves free.
export function applyViewOffset(panelWidth) {
    const w = container.clientWidth, h = container.clientHeight;
    camera.aspect = w / h;
    const room = panelWidth > 0 && w > 700 ? panelWidth : 0;
    if (room) camera.setViewOffset(w, h, room / 2, 0, w, h);
    else camera.clearViewOffset();
    camera.updateProjectionMatrix();
    // The bottom button row centres on the same free area (style.css).
    document.documentElement.style.setProperty('--panel-space', `${room}px`);
}

window.addEventListener('resize', () => {
    renderer.setSize(container.clientWidth, container.clientHeight);
    window.dispatchEvent(new CustomEvent('poincare:layout'));
});
