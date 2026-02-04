/**
 * 4D Kleinian Group Visualizer - Main Application
 * Performance-optimized with adaptive quality control and render-on-demand
 */

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
    colorPalettes,
    colorSchemes,
    generatePaletteShaderCode,
    generateColorSchemeShaderCode,
    getPaletteOptions,
    getColorSchemeOptions
} from './colorPalettes.js';
import {
    spherePresets,
    getPresetOptions,
    getPresetSpheres,
    getPresetNames
} from './4DexampleLibrary.js';

// Scene setup
const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 2000);
camera.position.set(0, 0, 2);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(window.devicePixelRatio);
document.getElementById('container').appendChild(renderer.domElement);

// OrbitControls
const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.05;
controls.minDistance = 0.5;
controls.maxDistance = 10;

// Uniforms for the shader
const uniforms = {
    iResolution: { value: new THREE.Vector3(window.innerWidth, window.innerHeight, 1) },
    sphereRadius: { value: 1.0 },
    kleinSphereR: { value: 0.41667 },
    maxIterations: { value: 25 },
    maxMarchSteps: { value: 300 },
    scalingFactor: { value: 0.08 },
    eye: { value: new THREE.Vector3(0, 0, 2.3333) },
    target: { value: new THREE.Vector3(0, 0, 0) },
    up: { value: new THREE.Vector3(0, 1, 0) },
    fovRadians: { value: Math.PI / 3 },
    colorPalette: { value: 0 },
    colorScheme: { value: 0 },
    modulus: { value: 2 },
    numSpheres: { value: 8 },
    spherePositions: { value: [] },
    sphereRadii: { value: [] }
};

// Initialize sphere positions and radii arrays with 20 empty values
// currentSpheres is not yet defined here, so we'll initialize with defaults
// and then update it once currentSpheres is set.
for (let i = 0; i < 20; i++) {
    uniforms.spherePositions.value.push(new THREE.Vector3(0, 0, 0));
    uniforms.sphereRadii.value.push(1.0);
}

// Render-on-demand system (defined early for use throughout the code)
let needsRender = true;
let isAnimating = false;

function requestRender() {
    needsRender = true;
    if (!isAnimating) {
        isAnimating = true;
        requestAnimationFrame(animate);
    }
}

// Vertex shader (simple, keep inline)
const vertexShader = `
    varying vec2 vUv;
    void main() {
        vUv = uv;
        gl_Position = vec4(position, 1.0);
    }
`;

// Load fragment shader from file
async function loadShader(shaderFile = './kleinian.frag') {
    const response = await fetch(shaderFile);
    let fragmentShader = await response.text();

    // Generate and inject palette/color scheme code
    const paletteShaderCode = generatePaletteShaderCode();
    const colorSchemeCode = generateColorSchemeShaderCode();

    // Replace palette code (including stub between START and END markers)
    fragmentShader = fragmentShader.replace(
        /\/\/ PALETTE_SHADER_CODE_INJECTION_POINT_START[\s\S]*?\/\/ PALETTE_SHADER_CODE_INJECTION_POINT_END/,
        paletteShaderCode
    );

    // Replace color scheme code (including stub between START and END markers)
    fragmentShader = fragmentShader.replace(
        /\/\/ COLOR_SCHEME_CODE_INJECTION_POINT_START[\s\S]*?\/\/ COLOR_SCHEME_CODE_INJECTION_POINT_END/,
        colorSchemeCode
    );

    return fragmentShader;
}

// Track current mesh and performance mode
let currentMesh = null;
let currentPerformanceMode = 'fast';

// Initialize scene async - start in fast mode
loadShader('./kleinian-fast.frag').then(fragmentShader => {
    // Create fullscreen quad with shader material
    const material = new THREE.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: vertexShader,
        fragmentShader: fragmentShader
    });

    const geometry = new THREE.PlaneGeometry(2, 2);
    currentMesh = new THREE.Mesh(geometry, material);
    scene.add(currentMesh);

    // Disable sphere editing controls in fast mode
    const spherePresetSelect = document.getElementById('spherePreset');
    const addSphereBtn = document.getElementById('addSphere');
    if (spherePresetSelect) spherePresetSelect.disabled = true;
    if (addSphereBtn) addSphereBtn.disabled = true;

    // Start animation loop with initial render
    requestRender();
});

// Switch between fast and flexible shaders
async function switchPerformanceMode(mode) {
    if (mode === currentPerformanceMode || !currentMesh) return;

    currentPerformanceMode = mode;

    // Load appropriate shader
    const shaderFile = mode === 'fast' ? './kleinian-fast.frag' : './kleinian.frag';
    const fragmentShader = await loadShader(shaderFile);

    // Create new material
    const newMaterial = new THREE.ShaderMaterial({
        uniforms: uniforms,
        vertexShader: vertexShader,
        fragmentShader: fragmentShader
    });

    // Replace material
    currentMesh.material.dispose();
    currentMesh.material = newMaterial;

    // Update sphere editing controls based on mode
    const spherePresetSelect = document.getElementById('spherePreset');
    const addSphereBtn = document.getElementById('addSphere');
    const sphereInputs = document.querySelectorAll('#sphereList input, #sphereList button');

    if (mode === 'fast') {
        // Disable sphere editing controls in fast mode
        if (spherePresetSelect) spherePresetSelect.disabled = true;
        if (addSphereBtn) addSphereBtn.disabled = true;
        sphereInputs.forEach(el => el.disabled = true);
    } else {
        // Enable sphere editing controls in flexible mode
        if (spherePresetSelect) spherePresetSelect.disabled = false;
        if (addSphereBtn) addSphereBtn.disabled = false;
        sphereInputs.forEach(el => el.disabled = false);
    }

    requestRender();
}

// Populate color palette dropdown
const paletteSelect = document.getElementById('colorPalette');
getPaletteOptions().forEach(option => {
    const optionEl = document.createElement('option');
    optionEl.value = option.value;
    optionEl.textContent = option.name;
    optionEl.title = option.description;
    paletteSelect.appendChild(optionEl);
});

// Populate color scheme dropdown
const schemeSelect = document.getElementById('colorScheme');
getColorSchemeOptions().forEach(option => {
    const optionEl = document.createElement('option');
    optionEl.value = option.value;
    optionEl.textContent = option.name;
    optionEl.title = option.description;
    schemeSelect.appendChild(optionEl);
});

// Populate sphere preset dropdown
const presetSelect = document.getElementById('spherePreset');
presetSelect.innerHTML = ''; // Clear existing options
getPresetOptions().forEach(option => {
    const optionEl = document.createElement('option');
    optionEl.value = option.value;
    optionEl.textContent = option.name;
    optionEl.title = option.description;
    presetSelect.appendChild(optionEl);
});

// Current sphere state
let currentSpheres = getPresetSpheres('default');
let currentPreset = 'default';

// Update spheres in uniforms
function updateSphereUniforms() {
    uniforms.numSpheres.value = currentSpheres.length;
    for (let i = 0; i < 20; i++) {
        if (i < currentSpheres.length) {
            uniforms.spherePositions.value[i].set(
                currentSpheres[i].x,
                currentSpheres[i].y,
                currentSpheres[i].z
            );
            uniforms.sphereRadii.value[i] = currentSpheres[i].r || 1.0;
        } else {
            uniforms.spherePositions.value[i].set(0, 0, 0);
            uniforms.sphereRadii.value[i] = 1.0;
        }
    }
    document.getElementById('sphereCount').textContent = currentSpheres.length;
    requestRender();
}

// Render sphere list UI
function renderSphereList() {
    const sphereList = document.getElementById('sphereList');
    sphereList.innerHTML = '';

    currentSpheres.forEach((sphere, index) => {
        const item = document.createElement('div');
        item.className = 'sphere-item control-group';
        item.innerHTML = `
            <div class="sphere-item-header">
                <span>Sphere ${index + 1}</span>
                <button class="remove-sphere-btn" data-index="${index}">Remove</button>
            </div>
            <div class="sphere-coords">
                <div class="coord-input-wrapper">
                    <span class="coord-label">X</span>
                    <input class="coord-input" data-index="${index}" data-coord="x"
                           value="${sphere.x.toFixed(2)}" step="0.1">
                </div>
                <div class="coord-input-wrapper">
                    <span class="coord-label">Y</span>
                    <input class="coord-input" data-index="${index}" data-coord="y"
                           value="${sphere.y.toFixed(2)}" step="0.1">
                </div>
                <div class="coord-input-wrapper">
                    <span class="coord-label">Z</span>
                    <input class="coord-input" data-index="${index}" data-coord="z"
                           value="${sphere.z.toFixed(2)}" step="0.1">
                </div>
                <div class="coord-input-wrapper">
                    <span class="coord-label">R</span>
                    <input class="coord-input" data-index="${index}" data-coord="r"
                           value="${(sphere.r || 1.0).toFixed(2)}" step="0.1">
                </div>
            </div>
        `;
        sphereList.appendChild(item);
    });

    // Attach event listeners to coordinate inputs
    document.querySelectorAll('.coord-input').forEach(input => {
        input.addEventListener('input', (e) => {
            const index = parseInt(e.target.dataset.index);
            const coord = e.target.dataset.coord;
            const value = parseFloat(e.target.value) || 0;
            currentSpheres[index][coord] = value;
            updateSphereUniforms();
            currentPreset = 'custom';
            document.getElementById('spherePreset').value = 'custom';
        });
    });

    // Attach event listeners to remove buttons
    document.querySelectorAll('.remove-sphere-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            const index = parseInt(e.target.dataset.index);
            currentSpheres.splice(index, 1);
            renderSphereList();
            updateSphereUniforms();
            currentPreset = 'custom';
            document.getElementById('spherePreset').value = 'custom';
        });
    });
}

// Load preset
function loadPreset(presetName) {
    if (presetName === 'custom') {
        // Keep current spheres
        return;
    }
    currentSpheres = getPresetSpheres(presetName);
    currentPreset = presetName;
    renderSphereList();
    updateSphereUniforms();
}

// Add sphere button
document.getElementById('addSphere').addEventListener('click', () => {
    if (currentSpheres.length >= 20) {
        alert('Maximum 20 spheres allowed');
        return;
    }
    currentSpheres.push({ x: 0, y: 0, z: 0, r: 1.0 });
    renderSphereList();
    updateSphereUniforms();
    currentPreset = 'custom';
    document.getElementById('spherePreset').value = 'custom';
});

// Preset selector
document.getElementById('spherePreset').addEventListener('change', (e) => {
    loadPreset(e.target.value);
});

// Performance mode selector
document.getElementById('performanceMode').addEventListener('change', (e) => {
    switchPerformanceMode(e.target.value);
});

// Collapse button
const collapseBtn = document.getElementById('collapse-btn');
const controlPanel = document.getElementById('controlPanel');

if (collapseBtn && controlPanel) {
    collapseBtn.addEventListener('click', () => {
        controlPanel.classList.toggle('collapsed');
    });
}

// Refresh button (reset camera)
const refreshBtn = document.getElementById('refresh-btn');
if (refreshBtn) {
    refreshBtn.addEventListener('click', () => {
        camera.position.set(0, 0, 2);
        controls.target.set(0, 0, 0);
        controls.update();
        requestRender();
    });
}

// Handle window resize
function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    uniforms.iResolution.value.set(window.innerWidth, window.innerHeight, 1);
    requestRender();
}
window.addEventListener('resize', onWindowResize);

// Panel drag functionality
let isDraggingPanel = false;
let dragStartX = 0;
let dragStartY = 0;
let panelStartX = 0;
let panelStartY = 0;

controlPanel.addEventListener('pointerdown', (e) => {
    // Don't drag if clicking on interactive elements or scrollbar
    if (e.target.matches('input, select, button, label')) {
        return;
    }

    // Check if clicking on scrollbar area
    const rect = controlPanel.getBoundingClientRect();
    const scrollbarWidth = controlPanel.offsetWidth - controlPanel.clientWidth;
    if (e.clientX > rect.right - scrollbarWidth) {
        return;
    }

    // Start dragging
    e.preventDefault();
    e.stopPropagation();
    isDraggingPanel = true;
    dragStartX = e.clientX;
    dragStartY = e.clientY;

    const panelRect = controlPanel.getBoundingClientRect();
    panelStartX = panelRect.left;
    panelStartY = panelRect.top;

    controlPanel.classList.add('dragging');
    document.addEventListener('pointermove', onPanelMove);
    document.addEventListener('pointerup', onPanelUp, { once: true });
});

function onPanelMove(e) {
    if (!isDraggingPanel) return;
    e.preventDefault();
    e.stopPropagation();

    const dx = e.clientX - dragStartX;
    const dy = e.clientY - dragStartY;

    const newX = panelStartX + dx;
    const newY = panelStartY + dy;

    // Keep panel within viewport bounds
    const maxX = window.innerWidth - controlPanel.offsetWidth;
    const maxY = window.innerHeight - controlPanel.offsetHeight;

    controlPanel.style.left = Math.max(0, Math.min(newX, maxX)) + 'px';
    controlPanel.style.top = Math.max(0, Math.min(newY, maxY)) + 'px';
    controlPanel.style.right = 'auto';
}

function onPanelUp() {
    isDraggingPanel = false;
    controlPanel.classList.remove('dragging');
    document.removeEventListener('pointermove', onPanelMove);
}

// Ensure panel stays within bounds on window resize
window.addEventListener('resize', () => {
    const rect = controlPanel.getBoundingClientRect();
    const maxX = window.innerWidth - controlPanel.offsetWidth;
    const maxY = window.innerHeight - controlPanel.offsetHeight;

    if (rect.left > maxX || rect.top > maxY) {
        controlPanel.style.left = Math.max(0, Math.min(rect.left, maxX)) + 'px';
        controlPanel.style.top = Math.max(0, Math.min(rect.top, maxY)) + 'px';
    }
});

// Parameter controls
const controls_ui = {
    maxIterations: document.getElementById('maxIterations'),
    maxMarchSteps: document.getElementById('maxMarchSteps'),
    sphereRadius: document.getElementById('sphereRadius'),
    kleinSphereRadius: document.getElementById('kleinSphereRadius'),
    scalingFactor: document.getElementById('scalingFactor'),
    fov: document.getElementById('fov')
};

// Update value displays
controls_ui.sphereRadius.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    uniforms.sphereRadius.value = val;
    document.getElementById('sphereRValue').textContent = val.toFixed(1);
    requestRender();
});

controls_ui.kleinSphereRadius.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    uniforms.kleinSphereR.value = val;
    document.getElementById('kleinRValue').textContent = val.toFixed(1);
    requestRender();
});

controls_ui.scalingFactor.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    uniforms.scalingFactor.value = val;
    document.getElementById('scalingValue').textContent = val.toFixed(2);
    requestRender();
});

controls_ui.fov.addEventListener('input', (e) => {
    const val = parseFloat(e.target.value);
    uniforms.fovRadians.value = val * Math.PI / 180;
    document.getElementById('fovValue').textContent = val + '°';
    requestRender();
});

// Color controls
document.getElementById('colorPalette').addEventListener('change', (e) => {
    uniforms.colorPalette.value = parseInt(e.target.value);
    requestRender();
});

document.getElementById('colorScheme').addEventListener('change', (e) => {
    const scheme = parseInt(e.target.value);
    uniforms.colorScheme.value = scheme;

    // Show/hide modulus control based on scheme (1 = Iteration Modulus)
    const modulusControl = document.getElementById('modulusControl');
    if (scheme === 1) {
        modulusControl.style.display = 'block';
    } else {
        modulusControl.style.display = 'none';
    }
    requestRender();
});

document.getElementById('modulus').addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    uniforms.modulus.value = val;
    document.getElementById('modulusValue').textContent = val;
    requestRender();
});

// Reset camera
document.getElementById('resetCamera').addEventListener('click', () => {
    camera.position.set(0, 0, 2);
    controls.target.set(0, 0, 0);
    controls.update();
    requestRender();
});

// Presets
document.getElementById('preset1').addEventListener('click', () => {
    controls_ui.sphereRadius.value = 1.0;
    controls_ui.kleinSphereRadius.value = 0.41667;
    controls_ui.scalingFactor.value = 0.08;
    controls_ui.maxIterations.value = 25;
    controls_ui.maxMarchSteps.value = 300;

    uniforms.sphereRadius.value = 1.0;
    uniforms.kleinSphereR.value = 0.41667;
    uniforms.scalingFactor.value = 0.08;
    uniforms.maxIterations.value = 25;
    uniforms.maxMarchSteps.value = 300;

    // Default Cyan/Purple with Iteration Count
    document.getElementById('colorPalette').value = '0';
    document.getElementById('colorScheme').value = '0';
    uniforms.colorPalette.value = 0;
    uniforms.colorScheme.value = 0;
    document.getElementById('modulusControl').style.display = 'none';

    updateDisplays();
});

document.getElementById('preset2').addEventListener('click', () => {
    controls_ui.sphereRadius.value = 0.66667;
    controls_ui.kleinSphereRadius.value = 0.33333;
    controls_ui.scalingFactor.value = 0.1;
    controls_ui.maxIterations.value = 30;
    controls_ui.maxMarchSteps.value = 350;

    uniforms.sphereRadius.value = 0.66667;
    uniforms.kleinSphereR.value = 0.33333;
    uniforms.scalingFactor.value = 0.1;
    uniforms.maxIterations.value = 30;
    uniforms.maxMarchSteps.value = 350;

    // Fire palette with Modulus coloring
    document.getElementById('colorPalette').value = '1';
    document.getElementById('colorScheme').value = '1';
    document.getElementById('modulus').value = '5';
    uniforms.colorPalette.value = 1;
    uniforms.colorScheme.value = 1;
    uniforms.modulus.value = 5;
    document.getElementById('modulusValue').textContent = '5';
    document.getElementById('modulusControl').style.display = 'block';

    updateDisplays();
});

document.getElementById('preset3').addEventListener('click', () => {
    controls_ui.sphereRadius.value = 1.33333;
    controls_ui.kleinSphereRadius.value = 0.5;
    controls_ui.scalingFactor.value = 0.06;
    controls_ui.maxIterations.value = 20;
    controls_ui.maxMarchSteps.value = 250;

    uniforms.sphereRadius.value = 1.33333;
    uniforms.kleinSphereR.value = 0.5;
    uniforms.scalingFactor.value = 0.06;
    uniforms.maxIterations.value = 20;
    uniforms.maxMarchSteps.value = 250;

    // Ocean palette with Position-Based coloring
    document.getElementById('colorPalette').value = '2';
    document.getElementById('colorScheme').value = '3';
    uniforms.colorPalette.value = 2;
    uniforms.colorScheme.value = 3;
    document.getElementById('modulusControl').style.display = 'none';

    updateDisplays();
});

function updateDisplays() {
    document.getElementById('maxIterValue').textContent = uniforms.maxIterations.value;
    document.getElementById('maxMarchValue').textContent = uniforms.maxMarchSteps.value;
    document.getElementById('sphereRValue').textContent = uniforms.sphereRadius.value.toFixed(1);
    document.getElementById('kleinRValue').textContent = uniforms.kleinSphereR.value.toFixed(1);
    document.getElementById('scalingValue').textContent = uniforms.scalingFactor.value.toFixed(2);
    requestRender();
}

// FPS counter
let lastTime = performance.now();
let frames = 0;
let fps = 0;

function updateFPS() {
    const currentTime = performance.now();
    frames++;
    if (currentTime >= lastTime + 1000) {
        fps = Math.round((frames * 1000) / (currentTime - lastTime));
        document.getElementById('stats').textContent = `FPS: ${fps}`;
        frames = 0;
        lastTime = currentTime;
    }
}

// Adaptive quality control
let isInteracting = false;
let interactionTimeout = null;
let baseMaxIterations = uniforms.maxIterations.value;
let baseMaxMarchSteps = uniforms.maxMarchSteps.value;
const QUALITY_REDUCTION_FACTOR = 0.8; // Reduce to 80% during interaction (less aggressive)
const INTERACTION_DELAY = 150; // ms to wait after interaction stops

function startInteraction() {
    if (!isInteracting) {
        isInteracting = true;
        baseMaxIterations = uniforms.maxIterations.value;
        baseMaxMarchSteps = uniforms.maxMarchSteps.value;
        uniforms.maxIterations.value = Math.max(15, Math.floor(baseMaxIterations * QUALITY_REDUCTION_FACTOR));
        uniforms.maxMarchSteps.value = Math.max(150, Math.floor(baseMaxMarchSteps * QUALITY_REDUCTION_FACTOR));
    }

    clearTimeout(interactionTimeout);
    interactionTimeout = setTimeout(() => {
        isInteracting = false;
        uniforms.maxIterations.value = baseMaxIterations;
        uniforms.maxMarchSteps.value = baseMaxMarchSteps;
    }, INTERACTION_DELAY);
}

// Listen for camera interactions
controls.addEventListener('start', startInteraction);
controls.addEventListener('change', startInteraction);

// Quality presets
const qualityPresets = {
    low: { iterations: 15, marchSteps: 200 },
    medium: { iterations: 25, marchSteps: 300 },
    high: { iterations: 40, marchSteps: 500 },
    ultra: { iterations: 60, marchSteps: 800 }
};

document.getElementById('qualityPreset').addEventListener('change', (e) => {
    const preset = e.target.value;
    if (preset !== 'custom' && qualityPresets[preset]) {
        const { iterations, marchSteps } = qualityPresets[preset];

        controls_ui.maxIterations.value = iterations;
        controls_ui.maxMarchSteps.value = marchSteps;

        baseMaxIterations = iterations;
        baseMaxMarchSteps = marchSteps;

        if (!isInteracting) {
            uniforms.maxIterations.value = iterations;
            uniforms.maxMarchSteps.value = marchSteps;
        }

        document.getElementById('maxIterValue').textContent = iterations;
        document.getElementById('maxMarchValue').textContent = marchSteps;

        requestRender();
    }
});

// Update base values when controls change
controls_ui.maxIterations.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    baseMaxIterations = val;
    if (!isInteracting) {
        uniforms.maxIterations.value = val;
    }
    document.getElementById('maxIterValue').textContent = val;
    document.getElementById('qualityPreset').value = 'custom';
    requestRender();
});

controls_ui.maxMarchSteps.addEventListener('input', (e) => {
    const val = parseInt(e.target.value);
    baseMaxMarchSteps = val;
    if (!isInteracting) {
        uniforms.maxMarchSteps.value = val;
    }
    document.getElementById('maxMarchValue').textContent = val;
    document.getElementById('qualityPreset').value = 'custom';
    requestRender();
});

// Animation loop - only renders when needed
function animate() {
    const controlsChanged = controls.update();

    if (needsRender || controlsChanged) {
        // Update shader camera uniforms from OrbitControls camera
        // Scale to match shader coordinate system (shader uses ~700 units)
        const scale = 1.166667; // Scale factor to match shader's coordinate system (350/300)
        uniforms.eye.value.copy(camera.position).multiplyScalar(scale);
        uniforms.target.value.copy(controls.target).multiplyScalar(scale);
        uniforms.up.value.copy(camera.up);

        renderer.render(scene, camera);
        updateFPS();
        needsRender = false;

        // Continue animation if controls are still changing
        if (controlsChanged) {
            requestAnimationFrame(animate);
        } else {
            isAnimating = false;
        }
    } else {
        isAnimating = false;
    }
}

// Trigger render on control changes
controls.addEventListener('change', requestRender);

// ---- Tabbed pages logic ----
const pages = {
    render: document.getElementById('page-render'),
    spheres: document.getElementById('page-spheres'),
    camera: document.getElementById('page-camera')
};

function showPage(name) {
    Object.values(pages).forEach(p => p.classList.remove('active'));
    pages[name].classList.add('active');

    document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
    const btn = document.querySelector(`.tab-btn[data-page="${name}"]`);
    if (btn) btn.classList.add('active');
}

document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', () => showPage(btn.dataset.page));
});

// Initialize with defaults
showPage('spheres');
loadPreset('default');
