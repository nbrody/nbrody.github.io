import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
    generatePaletteShaderCode,
    generateColorSchemeShaderCode,
    getPaletteOptions,
    getColorSchemeOptions,
    getPaletteIndexByKey,
    getColorSchemeIndexByKey
} from './colorPalettes.js';
import {
    groupFamilies,
    getGroupOptions,
    getGroupPreset,
    getGroupSpheres,
    getGroupSeedCenters,
    getGroupDefaults
} from './4DexampleLibrary.js';

const MAX_SPHERES = 20;
const MAX_SEEDS = 8;

const dom = {
    container: document.getElementById('container'),
    stats: document.getElementById('stats'),
    hud: document.getElementById('hud'),
    showHud: document.getElementById('showHud'),
    hideHud: document.getElementById('hideHud'),
    groupSelect: document.getElementById('groupSelect'),
    groupDescription: document.getElementById('groupDescription'),
    groupFamily: document.getElementById('groupFamily'),
    sphereCount: document.getElementById('sphereCount'),
    colorPalette: document.getElementById('colorPalette'),
    colorScheme: document.getElementById('colorScheme'),
    qualityPreset: document.getElementById('qualityPreset'),
    maxIterations: document.getElementById('maxIterations'),
    maxIterValue: document.getElementById('maxIterValue'),
    maxMarchSteps: document.getElementById('maxMarchSteps'),
    maxMarchValue: document.getElementById('maxMarchValue'),
    scalingFactor: document.getElementById('scalingFactor'),
    scalingValue: document.getElementById('scalingValue'),
    kleinSphereRadius: document.getElementById('kleinSphereRadius'),
    kleinRValue: document.getElementById('kleinRValue'),
    seedRadius: document.getElementById('seedRadius'),
    seedRadiusValue: document.getElementById('seedRadiusValue'),
    fov: document.getElementById('fov'),
    fovValue: document.getElementById('fovValue'),
    modulusControl: document.getElementById('modulusControl'),
    modulus: document.getElementById('modulus'),
    modulusValue: document.getElementById('modulusValue'),
    resetView: document.getElementById('resetView'),
    groupDefaults: document.getElementById('groupDefaults')
};

const paletteOptions = getPaletteOptions();
const colorSchemeOptions = getColorSchemeOptions();
const groupOptions = getGroupOptions();

const qualityPresets = {
    low: { iterations: 20, marchSteps: 240 },
    medium: { iterations: 30, marchSteps: 340 },
    high: { iterations: 40, marchSteps: 480 },
    ultra: { iterations: 56, marchSteps: 720 }
};

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(58, window.innerWidth / window.innerHeight, 0.1, 20);
camera.position.set(0, 0, 2.15);

const uniforms = {
    iResolution: { value: new THREE.Vector3(window.innerWidth, window.innerHeight, 1) },
    kleinSphereR: { value: 0.42 },
    seedRadius: { value: 0.17 },
    maxIterations: { value: 36 },
    maxMarchSteps: { value: 420 },
    scalingFactor: { value: 0.084 },
    eye: { value: new THREE.Vector3(0, 0, 2.15) },
    target: { value: new THREE.Vector3(0, 0, 0) },
    up: { value: new THREE.Vector3(0, 1, 0) },
    fovRadians: { value: THREE.MathUtils.degToRad(58) },
    colorPalette: { value: 0 },
    colorScheme: { value: 0 },
    modulus: { value: 6 },
    numSpheres: { value: 0 },
    spherePositions: { value: [] },
    sphereRadii: { value: [] },
    numSeedCenters: { value: 0 },
    seedCenters: { value: [] }
};

for (let index = 0; index < MAX_SPHERES; index++) {
    uniforms.spherePositions.value.push(new THREE.Vector3());
    uniforms.sphereRadii.value.push(1.0);
}

for (let index = 0; index < MAX_SEEDS; index++) {
    uniforms.seedCenters.value.push(new THREE.Vector3());
}

const vertexShader = `
    varying vec2 vUv;

    void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
    }
`;

let shaderMesh = null;
let renderer = null;
let controls = null;
let currentGroupKey = 'default';
let needsRender = true;
let isAnimating = false;
let isInteracting = false;
let interactionTimeout = null;
let baseRenderSettings = { iterations: 36, marchSteps: 420 };

let lastFpsUpdate = performance.now();
let framesSinceLastFps = 0;

function requestRender() {
    needsRender = true;
    if (!isAnimating) {
        isAnimating = true;
        requestAnimationFrame(animate);
    }
}

function updateFps() {
    const now = performance.now();
    framesSinceLastFps += 1;

    if (now - lastFpsUpdate >= 1000) {
        const fps = Math.round((framesSinceLastFps * 1000) / (now - lastFpsUpdate));
        dom.stats.textContent = `FPS ${fps}`;
        framesSinceLastFps = 0;
        lastFpsUpdate = now;
    }
}

function formatFixed(value, digits) {
    return Number(value).toFixed(digits);
}

function getMatchingQualityPreset(iterations, marchSteps) {
    return Object.entries(qualityPresets).find(([, preset]) => {
        return preset.iterations === iterations && preset.marchSteps === marchSteps;
    })?.[0] || 'custom';
}

function applyLiveQuality(iterations, marchSteps) {
    uniforms.maxIterations.value = iterations;
    uniforms.maxMarchSteps.value = marchSteps;
}

function setBaseQuality(iterations, marchSteps, shouldRender = true) {
    baseRenderSettings = { iterations, marchSteps };

    dom.maxIterations.value = String(iterations);
    dom.maxMarchSteps.value = String(marchSteps);
    dom.maxIterValue.textContent = String(iterations);
    dom.maxMarchValue.textContent = String(marchSteps);
    dom.qualityPreset.value = getMatchingQualityPreset(iterations, marchSteps);

    if (!isInteracting) {
        applyLiveQuality(iterations, marchSteps);
    }

    if (shouldRender) {
        requestRender();
    }
}

function setScalingFactor(value, shouldRender = true) {
    uniforms.scalingFactor.value = value;
    dom.scalingFactor.value = String(value);
    dom.scalingValue.textContent = formatFixed(value, 3);
    if (shouldRender) {
        requestRender();
    }
}

function setKleinRadius(value, shouldRender = true) {
    uniforms.kleinSphereR.value = value;
    dom.kleinSphereRadius.value = String(value);
    dom.kleinRValue.textContent = formatFixed(value, 3);
    if (shouldRender) {
        requestRender();
    }
}

function setSeedRadius(value, shouldRender = true) {
    uniforms.seedRadius.value = value;
    dom.seedRadius.value = String(value);
    dom.seedRadiusValue.textContent = formatFixed(value, 3);
    if (shouldRender) {
        requestRender();
    }
}

function setFov(value, shouldRender = true) {
    uniforms.fovRadians.value = THREE.MathUtils.degToRad(value);
    dom.fov.value = String(value);
    dom.fovValue.textContent = `${Math.round(value)}°`;

    camera.fov = value;
    camera.updateProjectionMatrix();

    if (shouldRender) {
        requestRender();
    }
}

function setModulus(value, shouldRender = true) {
    uniforms.modulus.value = value;
    dom.modulus.value = String(value);
    dom.modulusValue.textContent = String(value);
    if (shouldRender) {
        requestRender();
    }
}

function setPaletteByKey(paletteKey, shouldRender = true) {
    const paletteIndex = getPaletteIndexByKey(paletteKey);
    uniforms.colorPalette.value = paletteIndex;
    dom.colorPalette.value = String(paletteIndex);
    if (shouldRender) {
        requestRender();
    }
}

function setColorSchemeByKey(colorSchemeKey, shouldRender = true) {
    const colorSchemeIndex = getColorSchemeIndexByKey(colorSchemeKey);
    uniforms.colorScheme.value = colorSchemeIndex;
    dom.colorScheme.value = String(colorSchemeIndex);
    updateModulusVisibility();
    if (shouldRender) {
        requestRender();
    }
}

function updateModulusVisibility() {
    const activeScheme = colorSchemeOptions.find((option) => option.value === Number(dom.colorScheme.value));
    dom.modulusControl.hidden = !activeScheme?.hasCustomControl;
}

function resetCamera(distance, fov = Number(dom.fov.value), shouldRender = true) {
    setFov(fov, false);
    camera.position.set(0, 0, distance);
    controls.target.set(0, 0, 0);
    controls.update();

    if (shouldRender) {
        requestRender();
    }
}

function updateGroupGeometry(groupKey, shouldRender = true) {
    const preset = getGroupPreset(groupKey);
    const spheres = getGroupSpheres(groupKey).slice(0, MAX_SPHERES);
    const seedCenters = getGroupSeedCenters(groupKey).slice(0, MAX_SEEDS);

    uniforms.numSpheres.value = spheres.length;
    uniforms.numSeedCenters.value = seedCenters.length;

    for (let index = 0; index < MAX_SPHERES; index++) {
        if (index < spheres.length) {
            uniforms.spherePositions.value[index].set(
                spheres[index].x,
                spheres[index].y,
                spheres[index].z
            );
            uniforms.sphereRadii.value[index] = spheres[index].r;
        } else {
            uniforms.spherePositions.value[index].set(0, 0, 0);
            uniforms.sphereRadii.value[index] = 1.0;
        }
    }

    for (let index = 0; index < MAX_SEEDS; index++) {
        if (index < seedCenters.length) {
            uniforms.seedCenters.value[index].set(
                seedCenters[index].x,
                seedCenters[index].y,
                seedCenters[index].z
            );
        } else {
            uniforms.seedCenters.value[index].set(0, 0, 0);
        }
    }

    dom.groupFamily.textContent = groupFamilies[preset.family] || preset.family;
    dom.sphereCount.textContent = `${spheres.length} inversion spheres`;
    dom.groupDescription.textContent = preset.description;

    if (shouldRender) {
        requestRender();
    }
}

function applyCurrentGroupDefaults(resetView = true, shouldRender = true) {
    const defaults = getGroupDefaults(currentGroupKey);

    setBaseQuality(defaults.maxIterations, defaults.maxMarchSteps, false);
    setScalingFactor(defaults.scalingFactor, false);
    setKleinRadius(defaults.kleinSphereR, false);
    setSeedRadius(defaults.seedRadius, false);
    setModulus(defaults.modulus, false);
    setPaletteByKey(defaults.paletteKey, false);
    setColorSchemeByKey(defaults.schemeKey, false);
    setFov(defaults.fov, false);

    if (resetView) {
        resetCamera(defaults.cameraDistance, defaults.fov, false);
    }

    if (shouldRender) {
        requestRender();
    }
}

function applyGroup(groupKey) {
    currentGroupKey = groupKey;
    dom.groupSelect.value = groupKey;
    updateGroupGeometry(groupKey, false);
    applyCurrentGroupDefaults(true, false);
    requestRender();
}

function setHudHidden(hidden) {
    document.body.classList.toggle('hud-hidden', hidden);
    dom.showHud.hidden = !hidden;
}

function reduceQualityDuringInteraction() {
    clearTimeout(interactionTimeout);

    if (!isInteracting) {
        isInteracting = true;
        applyLiveQuality(
            Math.max(16, Math.floor(baseRenderSettings.iterations * 0.75)),
            Math.max(180, Math.floor(baseRenderSettings.marchSteps * 0.72))
        );
    }

    interactionTimeout = window.setTimeout(() => {
        isInteracting = false;
        applyLiveQuality(baseRenderSettings.iterations, baseRenderSettings.marchSteps);
        requestRender();
    }, 140);
}

function animate() {
    const controlsChanged = controls.update();

    if (needsRender || controlsChanged) {
        uniforms.eye.value.copy(camera.position);
        uniforms.target.value.copy(controls.target);
        uniforms.up.value.copy(camera.up);

        renderer.render(scene, camera);
        updateFps();
        needsRender = false;

        if (controlsChanged) {
            requestAnimationFrame(animate);
        } else {
            isAnimating = false;
        }
    } else {
        isAnimating = false;
    }
}

async function loadShader() {
    const response = await fetch('./kleinian.frag');
    let fragmentShader = await response.text();

    fragmentShader = fragmentShader.replace(
        /\/\/ PALETTE_SHADER_CODE_INJECTION_POINT_START[\s\S]*?\/\/ PALETTE_SHADER_CODE_INJECTION_POINT_END/,
        generatePaletteShaderCode()
    );

    fragmentShader = fragmentShader.replace(
        /\/\/ COLOR_SCHEME_CODE_INJECTION_POINT_START[\s\S]*?\/\/ COLOR_SCHEME_CODE_INJECTION_POINT_END/,
        generateColorSchemeShaderCode()
    );

    return fragmentShader;
}

function populatePaletteSelect() {
    paletteOptions.forEach((option) => {
        const optionElement = document.createElement('option');
        optionElement.value = String(option.value);
        optionElement.textContent = option.name;
        optionElement.title = option.description;
        dom.colorPalette.appendChild(optionElement);
    });
}

function populateColorSchemeSelect() {
    colorSchemeOptions.forEach((option) => {
        const optionElement = document.createElement('option');
        optionElement.value = String(option.value);
        optionElement.textContent = option.name;
        optionElement.title = option.description;
        dom.colorScheme.appendChild(optionElement);
    });
}

function populateGroupSelect() {
    const grouped = new Map();
    groupOptions.forEach((option) => {
        if (!grouped.has(option.family)) {
            grouped.set(option.family, []);
        }
        grouped.get(option.family).push(option);
    });

    Object.entries(groupFamilies).forEach(([familyKey, familyLabel]) => {
        const options = grouped.get(familyKey);
        if (!options || options.length === 0) {
            return;
        }

        const optgroup = document.createElement('optgroup');
        optgroup.label = familyLabel;

        options.forEach((option) => {
            const optionElement = document.createElement('option');
            optionElement.value = option.value;
            optionElement.textContent = option.name;
            optionElement.title = option.description;
            optgroup.appendChild(optionElement);
        });

        dom.groupSelect.appendChild(optgroup);
    });
}

function bindEvents() {
    dom.groupSelect.addEventListener('change', (event) => {
        applyGroup(event.target.value);
    });

    dom.colorPalette.addEventListener('change', (event) => {
        uniforms.colorPalette.value = Number(event.target.value);
        requestRender();
    });

    dom.colorScheme.addEventListener('change', (event) => {
        uniforms.colorScheme.value = Number(event.target.value);
        updateModulusVisibility();
        requestRender();
    });

    dom.qualityPreset.addEventListener('change', (event) => {
        const presetKey = event.target.value;
        const preset = qualityPresets[presetKey];
        if (!preset) {
            return;
        }

        setBaseQuality(preset.iterations, preset.marchSteps);
    });

    dom.maxIterations.addEventListener('input', (event) => {
        setBaseQuality(Number(event.target.value), baseRenderSettings.marchSteps);
        dom.qualityPreset.value = 'custom';
    });

    dom.maxMarchSteps.addEventListener('input', (event) => {
        setBaseQuality(baseRenderSettings.iterations, Number(event.target.value));
        dom.qualityPreset.value = 'custom';
    });

    dom.scalingFactor.addEventListener('input', (event) => {
        setScalingFactor(Number(event.target.value));
    });

    dom.kleinSphereRadius.addEventListener('input', (event) => {
        setKleinRadius(Number(event.target.value));
    });

    dom.seedRadius.addEventListener('input', (event) => {
        setSeedRadius(Number(event.target.value));
    });

    dom.fov.addEventListener('input', (event) => {
        setFov(Number(event.target.value));
    });

    dom.modulus.addEventListener('input', (event) => {
        setModulus(Number(event.target.value));
    });

    dom.resetView.addEventListener('click', () => {
        const defaults = getGroupDefaults(currentGroupKey);
        resetCamera(defaults.cameraDistance, Number(dom.fov.value));
    });

    dom.groupDefaults.addEventListener('click', () => {
        applyCurrentGroupDefaults(true);
    });

    dom.hideHud.addEventListener('click', () => {
        setHudHidden(true);
    });

    dom.showHud.addEventListener('click', () => {
        setHudHidden(false);
    });

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
        uniforms.iResolution.value.set(window.innerWidth, window.innerHeight, 1);
        requestRender();
    });

    window.addEventListener('keydown', (event) => {
        const target = event.target;
        if (
            event.metaKey ||
            event.ctrlKey ||
            event.altKey ||
            (target instanceof HTMLElement && target.matches('input, select, textarea'))
        ) {
            return;
        }

        if (event.code === 'KeyH') {
            event.preventDefault();
            setHudHidden(!document.body.classList.contains('hud-hidden'));
        } else if (event.code === 'Escape' && !document.body.classList.contains('hud-hidden')) {
            setHudHidden(true);
        }
    });

    controls.addEventListener('change', requestRender);
    controls.addEventListener('start', reduceQualityDuringInteraction);
    controls.addEventListener('change', reduceQualityDuringInteraction);
}

async function init() {
    populatePaletteSelect();
    populateColorSchemeSelect();
    populateGroupSelect();

    try {
        renderer = new THREE.WebGLRenderer({
            antialias: true,
            powerPreference: 'high-performance'
        });
    } catch (error) {
        dom.stats.textContent = 'WebGL unavailable';
        dom.groupDescription.textContent = 'WebGL could not be initialized in this browser. The preset browser loaded, but the shader renderer is unavailable.';
        dom.groupFamily.textContent = 'WebGL unavailable';
        dom.sphereCount.textContent = 'shader inactive';
        console.error(error);
        return;
    }

    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    dom.container.appendChild(renderer.domElement);

    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enablePan = true;
    controls.minDistance = 0.85;
    controls.maxDistance = 6.5;
    controls.zoomSpeed = 0.86;

    renderer.domElement.addEventListener('contextmenu', (event) => event.preventDefault());

    bindEvents();

    const fragmentShader = await loadShader();
    const material = new THREE.ShaderMaterial({
        uniforms,
        vertexShader,
        fragmentShader
    });

    shaderMesh = new THREE.Mesh(new THREE.PlaneGeometry(2, 2), material);
    scene.add(shaderMesh);

    applyGroup(currentGroupKey);
}

init().catch((error) => {
    console.error(error);
    dom.groupDescription.textContent = 'The shader failed to load. Check the console for details.';
});
