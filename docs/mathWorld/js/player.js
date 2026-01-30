/**
 * Math World - First-Person Player Controller
 * Works in local coordinates within Santa Cruz terrain
 * Features flight mode and accelerating speed boost
 */

import * as THREE from 'three';

export class Player {
    constructor(camera, canvas, mathWorld, locationGroup) {
        this.camera = camera;
        this.canvas = canvas;
        this.mathWorld = mathWorld;
        this.locationGroup = locationGroup;

        // Position within current location (relative to location group)
        this.localPosition = new THREE.Vector3(0, 1.7, 10);
        this.velocity = new THREE.Vector3();
        this.direction = new THREE.Vector3();

        // Player state
        this.enabled = false;

        // Movement settings
        this.walkSpeed = 5;
        this.runSpeed = 10;
        this.flySpeed = 8;          // Base vertical flight speed
        this.gravity = 20;
        this.eyeHeight = 1.7;

        // Speed boost (increases while Shift is held)
        this.speedMultiplier = 1;
        this.baseSpeedMultiplier = 2;    // Initial boost when holding shift
        this.maxSpeedMultiplier = 50;    // Maximum speed multiplier
        this.speedBoostInterval = 2;      // Seconds between speed increases
        this.speedBoostGrowth = 1.5;      // Multiplier growth per interval
        this.shiftHeldTime = 0;           // Time shift has been held
        this.lastSpeedBoostTime = 0;      // Last time speed was boosted

        // Mouse look
        this.yaw = 0;
        this.pitch = 0;
        this.mouseSensitivity = 0.002;
        this.minPitch = -Math.PI / 2 + 0.1;
        this.maxPitch = Math.PI / 2 - 0.1;

        // Terrain function (set by main.js)
        this.getTerrainHeight = null;

        // Input state
        this.keys = {
            forward: false,
            backward: false,
            left: false,
            right: false,
            run: false,
            fly: false    // Space now used for flying up
        };

        // Flight state
        this.isGrounded = true;
        this.isFlying = false;

        // Interaction
        this.interactionRange = 3;
        this.raycaster = new THREE.Raycaster();
        this.interactionPrompt = document.getElementById('interaction-prompt');
        this.currentInteractable = null;

        // Mobile controls reference
        this.mobileControls = null;

        this.setupEventListeners();
    }

    setupEventListeners() {
        document.addEventListener('mousemove', (e) => this.onMouseMove(e));
        document.addEventListener('keydown', (e) => this.onKeyDown(e));
        document.addEventListener('keyup', (e) => this.onKeyUp(e));
    }

    onMouseMove(event) {
        if (!this.enabled) return;

        // Only process mouse movement when pointer is locked
        if (document.pointerLockElement !== this.canvas) return;

        const movementX = event.movementX || 0;
        const movementY = event.movementY || 0;

        this.yaw -= movementX * this.mouseSensitivity;
        this.pitch -= movementY * this.mouseSensitivity;
        this.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.pitch));
    }

    onKeyDown(event) {
        if (!this.enabled) return;

        switch (event.code) {
            case 'KeyW':
            case 'ArrowUp':
                this.keys.forward = true;
                break;
            case 'KeyS':
            case 'ArrowDown':
                this.keys.backward = true;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                this.keys.left = true;
                break;
            case 'KeyD':
            case 'ArrowRight':
                this.keys.right = true;
                break;
            case 'ShiftLeft':
            case 'ShiftRight':
                if (!this.keys.run) {
                    // Start tracking shift hold time
                    this.shiftHeldTime = 0;
                    this.lastSpeedBoostTime = 0;
                    this.speedMultiplier = this.baseSpeedMultiplier;
                }
                this.keys.run = true;
                break;
            case 'Space':
                this.keys.fly = true;
                this.isFlying = true;
                break;
            case 'KeyE':
                this.interact();
                break;
        }
    }

    onKeyUp(event) {
        switch (event.code) {
            case 'KeyW':
            case 'ArrowUp':
                this.keys.forward = false;
                break;
            case 'KeyS':
            case 'ArrowDown':
                this.keys.backward = false;
                break;
            case 'KeyA':
            case 'ArrowLeft':
                this.keys.left = false;
                break;
            case 'KeyD':
            case 'ArrowRight':
                this.keys.right = false;
                break;
            case 'ShiftLeft':
            case 'ShiftRight':
                this.keys.run = false;
                this.speedMultiplier = 1;
                this.shiftHeldTime = 0;
                break;
            case 'Space':
                this.keys.fly = false;
                break;
        }
    }

    // Mobile controls support
    setMobileControls(controls) {
        this.mobileControls = controls;
    }

    handleMobileLook(dx, dy) {
        if (!this.enabled) return;
        this.yaw -= dx;
        this.pitch -= dy;
        this.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.pitch));
    }

    tryInteract() {
        this.interact();
    }

    update(delta) {
        if (!this.enabled) return;

        // Update shift hold time and speed multiplier
        if (this.keys.run) {
            this.shiftHeldTime += delta;

            // Increase speed every speedBoostInterval seconds
            const boostIntervalsPassed = Math.floor(this.shiftHeldTime / this.speedBoostInterval);
            if (boostIntervalsPassed > this.lastSpeedBoostTime) {
                this.lastSpeedBoostTime = boostIntervalsPassed;
                this.speedMultiplier = Math.min(
                    this.maxSpeedMultiplier,
                    this.speedMultiplier * this.speedBoostGrowth
                );
                console.log(`Speed boost! Multiplier: ${this.speedMultiplier.toFixed(1)}x`);
            }
        }

        // Calculate movement direction based on yaw
        const forward = new THREE.Vector3(0, 0, -1);
        const right = new THREE.Vector3(1, 0, 0);

        forward.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);
        right.applyAxisAngle(new THREE.Vector3(0, 1, 0), this.yaw);

        this.direction.set(0, 0, 0);

        // Get input from keyboard or mobile controls
        let moveForward = this.keys.forward;
        let moveBackward = this.keys.backward;
        let moveLeft = this.keys.left;
        let moveRight = this.keys.right;
        let wantsFly = this.keys.fly;

        // Mobile joystick overrides
        if (this.mobileControls && this.mobileControls.enabled) {
            const mobileInput = this.mobileControls.getMovement();
            if (Math.abs(mobileInput.z) > 0.1) {
                if (mobileInput.z > 0) moveForward = true;
                else moveBackward = true;
            }
            if (Math.abs(mobileInput.x) > 0.1) {
                if (mobileInput.x > 0) moveRight = true;
                else moveLeft = true;
            }
            if (mobileInput.jump) wantsFly = true;

            // Apply analog sensitivity
            const analogScale = Math.max(Math.abs(mobileInput.x), Math.abs(mobileInput.z));
            if (analogScale > 0.1) {
                this.direction.x = mobileInput.x;
                this.direction.z = mobileInput.z;
                // Rotate to camera direction
                const angle = this.yaw;
                const rotatedX = this.direction.x * Math.cos(angle) + this.direction.z * Math.sin(angle);
                const rotatedZ = -this.direction.x * Math.sin(angle) + this.direction.z * Math.cos(angle);
                this.direction.set(rotatedX, 0, rotatedZ);
            }
        }

        if (moveForward) this.direction.add(forward);
        if (moveBackward) this.direction.sub(forward);
        if (moveLeft) this.direction.sub(right);
        if (moveRight) this.direction.add(right);
        this.direction.normalize();

        // Apply movement speed with multiplier
        const baseSpeed = this.keys.run ? this.runSpeed : this.walkSpeed;
        const speed = baseSpeed * this.speedMultiplier;
        const targetVelocityX = this.direction.x * speed;
        const targetVelocityZ = this.direction.z * speed;

        this.velocity.x = THREE.MathUtils.lerp(this.velocity.x, targetVelocityX, 10 * delta);
        this.velocity.z = THREE.MathUtils.lerp(this.velocity.z, targetVelocityZ, 10 * delta);

        // Flight: holding Space (or mobile jump) floats up
        if (wantsFly) {
            const flyVelocity = this.flySpeed * this.speedMultiplier;
            this.velocity.y = flyVelocity;
            this.isGrounded = false;
        } else if (!this.isGrounded) {
            // Gravity only when not flying and not grounded
            this.velocity.y -= this.gravity * delta;
        }

        // Update local position
        this.localPosition.x += this.velocity.x * delta;
        this.localPosition.z += this.velocity.z * delta;
        this.localPosition.y += this.velocity.y * delta;

        // Get ground height and apply collision
        const groundY = this.getGroundHeight(this.localPosition.x, this.localPosition.z);
        if (this.localPosition.y <= groundY + this.eyeHeight) {
            this.localPosition.y = groundY + this.eyeHeight;
            this.velocity.y = 0;
            this.isGrounded = true;
            this.isFlying = false;
        }

        // Update camera
        this.updateCamera();

        // Check for interactables
        this.checkInteraction();
    }

    updateCamera() {
        if (!this.locationGroup) {
            // No location group - use local position directly
            this.camera.position.copy(this.localPosition);
        } else {
            // Transform local position through location group
            const worldPos = this.localPosition.clone();
            this.locationGroup.localToWorld(worldPos);
            this.camera.position.copy(worldPos);
        }

        // Apply camera rotation (yaw and pitch)
        const quaternion = new THREE.Quaternion();
        const yawQuat = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(0, 1, 0), this.yaw
        );
        const pitchQuat = new THREE.Quaternion().setFromAxisAngle(
            new THREE.Vector3(1, 0, 0), this.pitch
        );
        quaternion.multiplyQuaternions(yawQuat, pitchQuat);
        this.camera.quaternion.copy(quaternion);
    }

    getGroundHeight(x, z) {
        // Use external terrain function if provided
        if (this.getTerrainHeight) {
            return this.getTerrainHeight(x, z);
        }

        // Fallback: simple procedural terrain for local area
        let h = Math.sin(x * 0.03) * Math.cos(z * 0.025) * 3;
        h += Math.sin(x * 0.01 + z * 0.015) * 5;
        h += Math.sin(x * 0.05) * Math.sin(z * 0.04) * 1.5;
        const dist = Math.sqrt(x * x + z * z);
        if (dist < 25) h *= 0.3;
        return h;
    }

    checkInteraction() {
        if (!this.mathWorld) return;

        this.raycaster.setFromCamera(new THREE.Vector2(0, 0), this.camera);
        this.raycaster.far = this.interactionRange;

        const interactables = this.mathWorld.getInteractables();
        const intersects = this.raycaster.intersectObjects(interactables, true);

        if (intersects.length > 0) {
            const hit = intersects[0];
            const interactable = this.findInteractableParent(hit.object);

            if (interactable && interactable !== this.currentInteractable) {
                this.currentInteractable = interactable;
                this.showInteractionPrompt(interactable.userData.interactionType || 'Interact');
            }
        } else {
            if (this.currentInteractable) {
                this.currentInteractable = null;
                this.hideInteractionPrompt();
            }
        }
    }

    findInteractableParent(object) {
        let current = object;
        while (current) {
            if (current.userData && current.userData.isInteractable) {
                return current;
            }
            current = current.parent;
        }
        return null;
    }

    showInteractionPrompt(text) {
        const promptText = this.interactionPrompt.querySelector('.prompt-text');
        if (promptText) promptText.textContent = text;
        this.interactionPrompt.classList.remove('hidden');
    }

    hideInteractionPrompt() {
        this.interactionPrompt.classList.add('hidden');
    }

    interact() {
        if (this.currentInteractable) {
            const userData = this.currentInteractable.userData;
            console.log(`Interacting with: ${userData.name || 'Unknown'}`);
            if (userData.onInteract) {
                userData.onInteract();
            }
        }
    }

    setPositionOnGround(x, y, z, preserveOrientation = false) {
        this.localPosition.set(x, y, z);
        if (!preserveOrientation) {
            this.yaw = Math.PI; // Face forward (negative Z)
            this.pitch = 0;
        }
        this.updateCamera();
    }

    // Set yaw/pitch to match current camera orientation
    syncOrientationFromCamera() {
        // Extract yaw from camera's forward direction
        const forward = new THREE.Vector3(0, 0, -1);
        forward.applyQuaternion(this.camera.quaternion);
        this.yaw = Math.atan2(-forward.x, -forward.z);

        // Extract pitch
        this.pitch = Math.asin(-forward.y);
        this.pitch = Math.max(this.minPitch, Math.min(this.maxPitch, this.pitch));
    }

    setLocationGroup(group) {
        this.locationGroup = group;
    }

    setTerrainFunction(fn) {
        this.getTerrainHeight = fn;
    }

    enable() {
        this.enabled = true;
        this.velocity.set(0, 0, 0);
        this.isGrounded = true;
        console.log('Player enabled at:', this.localPosition);
    }

    disable() {
        this.enabled = false;
        Object.keys(this.keys).forEach(key => this.keys[key] = false);
    }
}
