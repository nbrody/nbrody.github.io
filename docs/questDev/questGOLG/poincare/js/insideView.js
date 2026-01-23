/**
 * Inside View Module: First-person camera navigation inside the Poincaré ball
 */

import * as THREE from 'https://cdn.skypack.dev/three@0.136.0';

// State
let insideViewActive = false;
let savedCameraPosition = null;
let savedCameraRotation = null;
let savedControlsState = null;

// First-person controls state
let moveForward = false;
let moveBackward = false;
let moveLeft = false;
let moveRight = false;
let moveUp = false;
let moveDown = false;
const moveSpeed = 0.003;
const mouseSensitivity = 0.001;
let yaw = 0;
let pitch = 0;

// Keyboard event handlers
function onKeyDown(event) {
    switch (event.code) {
        case 'KeyW':
        case 'ArrowUp':
            moveForward = true;
            break;
        case 'KeyS':
        case 'ArrowDown':
            moveBackward = true;
            break;
        case 'KeyA':
        case 'ArrowLeft':
            moveLeft = true;
            break;
        case 'KeyD':
        case 'ArrowRight':
            moveRight = true;
            break;
        case 'Space':
            moveUp = true;
            break;
        case 'ShiftLeft':
        case 'ShiftRight':
            moveDown = true;
            break;
    }
}

function onKeyUp(event) {
    switch (event.code) {
        case 'KeyW':
        case 'ArrowUp':
            moveForward = false;
            break;
        case 'KeyS':
        case 'ArrowDown':
            moveBackward = false;
            break;
        case 'KeyA':
        case 'ArrowLeft':
            moveLeft = false;
            break;
        case 'KeyD':
        case 'ArrowRight':
            moveRight = false;
            break;
        case 'Space':
            moveUp = false;
            break;
        case 'ShiftLeft':
        case 'ShiftRight':
            moveDown = false;
            break;
    }
}

// Mouse movement handler
let isPointerLocked = false;
function onMouseMove(event) {
    if (!isPointerLocked) return;

    const movementX = event.movementX || 0;
    const movementY = event.movementY || 0;

    yaw -= movementX * mouseSensitivity;
    pitch -= movementY * mouseSensitivity;

    // Clamp pitch to avoid flipping
    pitch = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch));
}

/**
 * Enable inside view mode
 * @param {THREE.Camera} camera - The scene camera
 * @param {OrbitControls} controls - The orbit controls
 * @param {HTMLElement} renderer - The WebGL renderer DOM element
 */
export function enableInsideView(camera, controls, renderer) {
    if (insideViewActive) return;

    console.log('Enabling inside view...');
    insideViewActive = true;

    // Save current camera state
    savedCameraPosition = camera.position.clone();
    savedCameraRotation = camera.rotation.clone();
    savedControlsState = {
        enabled: controls.enabled,
        autoRotate: controls.autoRotate,
        target: controls.target.clone()
    };

    // Disable orbit controls
    controls.enabled = false;
    controls.autoRotate = false;

    // Move camera inside the ball (offset from center to see polyhedron faces)
    camera.position.set(0, 0, 0.4);

    // Initialize first-person orientation
    yaw = 0;
    pitch = 0;
    camera.rotation.set(pitch, yaw, 0, 'YXZ');

    // Enable pointer lock for mouse look
    renderer.addEventListener('click', () => {
        if (!isPointerLocked) {
            renderer.requestPointerLock();
        }
    });

    // Pointer lock change events
    function onPointerLockChange() {
        isPointerLocked = document.pointerLockElement === renderer;
    }

    document.addEventListener('pointerlockchange', onPointerLockChange);
    document.addEventListener('pointerlockerror', () => {
        console.error('Pointer lock error');
    });

    // Add keyboard listeners
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    // Add mouse listener
    document.addEventListener('mousemove', onMouseMove);

    console.log('Inside view enabled. Use WASD/arrows to move, mouse to look, Space/Shift for up/down.');
}

/**
 * Disable inside view mode and restore normal view
 * @param {THREE.Camera} camera - The scene camera
 * @param {OrbitControls} controls - The orbit controls
 */
export function disableInsideView(camera, controls) {
    if (!insideViewActive) return;

    console.log('Disabling inside view...');
    insideViewActive = false;

    // Exit pointer lock
    if (document.pointerLockElement) {
        document.exitPointerLock();
    }

    // Remove event listeners
    document.removeEventListener('keydown', onKeyDown);
    document.removeEventListener('keyup', onKeyUp);
    document.removeEventListener('mousemove', onMouseMove);

    // Restore camera state
    if (savedCameraPosition) {
        camera.position.copy(savedCameraPosition);
    }
    if (savedCameraRotation) {
        camera.rotation.copy(savedCameraRotation);
    }

    // Restore controls
    if (savedControlsState) {
        controls.enabled = savedControlsState.enabled;
        controls.autoRotate = savedControlsState.autoRotate;
        controls.target.copy(savedControlsState.target);
    }

    // Reset movement state
    moveForward = moveBackward = moveLeft = moveRight = moveUp = moveDown = false;

    console.log('Inside view disabled.');
}

/**
 * Update camera position based on keyboard input
 * Call this in the animation loop when inside view is active
 * @param {THREE.Camera} camera - The scene camera
 */
export function updateInsideView(camera) {
    if (!insideViewActive) return;

    // Update camera rotation based on mouse
    camera.rotation.set(pitch, yaw, 0, 'YXZ');

    // Calculate movement direction
    const direction = new THREE.Vector3();
    const right = new THREE.Vector3();

    camera.getWorldDirection(direction);
    right.crossVectors(camera.up, direction).normalize();

    // Compute hyperbolic metric scaling factor
    // In Poincaré ball model, hyperbolic metric is ds² = 4/(1-r²)² * dx²
    // To maintain constant hyperbolic speed, scale Euclidean velocity by (1-r²)/2
    const distFromCenter = camera.position.length();
    const rSq = distFromCenter * distFromCenter;
    const metricScale = (1 - rSq) / 2;

    // Clamp metric scale to avoid extreme values near boundary
    const scaledSpeed = moveSpeed * Math.max(0.1, metricScale);

    // Apply movement with hyperbolic scaling
    if (moveForward) {
        camera.position.addScaledVector(direction, scaledSpeed);
    }
    if (moveBackward) {
        camera.position.addScaledVector(direction, -scaledSpeed);
    }
    if (moveLeft) {
        camera.position.addScaledVector(right, -scaledSpeed);
    }
    if (moveRight) {
        camera.position.addScaledVector(right, scaledSpeed);
    }
    if (moveUp) {
        camera.position.y += scaledSpeed;
    }
    if (moveDown) {
        camera.position.y -= scaledSpeed;
    }

    // Clamp camera position to stay inside the ball
    const maxRadius = 0.95; // Stay slightly inside the boundary
    const newDistFromCenter = camera.position.length();
    if (newDistFromCenter > maxRadius) {
        camera.position.normalize().multiplyScalar(maxRadius);
    }
}

/**
 * Check if inside view is currently active
 * @returns {boolean}
 */
export function isInsideViewActive() {
    return insideViewActive;
}
