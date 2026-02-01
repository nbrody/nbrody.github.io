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

        // Collision detection
        this.collisionRaycaster = new THREE.Raycaster();
        this.playerRadius = 0.4; // Player collision radius
        this.stepHeight = 0.5;   // Max step height player can walk up

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
        let wantsFly = this.keys.fly;
        let usingAnalog = false;

        // Mobile joystick (analog) takes priority
        if (this.mobileControls && this.mobileControls.enabled) {
            const mobileInput = this.mobileControls.getMovement();

            // Check if analog joystick is being used
            const analogScale = Math.max(Math.abs(mobileInput.x), Math.abs(mobileInput.z));
            if (analogScale > 0.1) {
                usingAnalog = true;
                // Joystick input: x = left/right, z = forward/back
                // Need to rotate by camera yaw to get world direction
                const angle = this.yaw;
                // Forward is -Z in camera space, so joystick.z > 0 means forward
                // Right is +X in camera space, so joystick.x > 0 means right
                const rotatedX = mobileInput.x * Math.cos(angle) - mobileInput.z * Math.sin(angle);
                const rotatedZ = mobileInput.x * Math.sin(angle) + mobileInput.z * Math.cos(angle);
                this.direction.set(rotatedX, 0, -rotatedZ);
                // Don't normalize - keep analog magnitude for variable speed
            }

            if (mobileInput.jump) wantsFly = true;
        }

        // Only use keyboard if not using analog joystick
        if (!usingAnalog) {
            if (this.keys.forward) this.direction.add(forward);
            if (this.keys.backward) this.direction.sub(forward);
            if (this.keys.left) this.direction.sub(right);
            if (this.keys.right) this.direction.add(right);
            this.direction.normalize();
        }

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

        // Calculate proposed new position
        const newX = this.localPosition.x + this.velocity.x * delta;
        const newZ = this.localPosition.z + this.velocity.z * delta;
        const newY = this.localPosition.y + this.velocity.y * delta;

        // Check horizontal collision with buildings/objects
        const horizontalCollision = this.checkObjectCollision(newX, newZ);
        if (horizontalCollision.blocked) {
            // Hit a wall - can't move horizontally in that direction
            // Try to slide along the wall
            if (!this.checkObjectCollision(newX, this.localPosition.z).blocked) {
                this.localPosition.x = newX;
                this.velocity.z = 0;
            } else if (!this.checkObjectCollision(this.localPosition.x, newZ).blocked) {
                this.localPosition.z = newZ;
                this.velocity.x = 0;
            }
            // Otherwise, completely blocked
        } else {
            this.localPosition.x = newX;
            this.localPosition.z = newZ;
        }

        // Update vertical position
        this.localPosition.y = newY;

        // Get effective ground height (terrain or building roof)
        const terrainY = this.getGroundHeight(this.localPosition.x, this.localPosition.z);
        const objectY = this.getObjectSurfaceHeight(this.localPosition.x, this.localPosition.y, this.localPosition.z);
        const groundY = Math.max(terrainY, objectY);

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

    // Check for horizontal collision with objects (walls, trees, buildings)
    checkObjectCollision(x, z) {
        if (!this.mathWorld || !this.locationGroup) {
            return { blocked: false };
        }

        const result = { blocked: false, hitObject: null };

        // Player position in local coordinates
        const feetY = this.localPosition.y - this.eyeHeight;
        const checkHeight = feetY + this.stepHeight + 0.1; // Check at step height

        // Get world position for raycasting
        const localPos = new THREE.Vector3(x, checkHeight, z);
        const worldPos = localPos.clone();
        this.locationGroup.localToWorld(worldPos);

        // Cast rays in multiple directions to detect walls
        const directions = [
            new THREE.Vector3(1, 0, 0),
            new THREE.Vector3(-1, 0, 0),
            new THREE.Vector3(0, 0, 1),
            new THREE.Vector3(0, 0, -1),
        ];

        // Check distance from current position to proposed position
        const currentWorldPos = this.localPosition.clone();
        currentWorldPos.y = checkHeight;
        this.locationGroup.localToWorld(currentWorldPos);

        const moveDir = new THREE.Vector3(x - this.localPosition.x, 0, z - this.localPosition.z);
        const moveDist = moveDir.length();

        if (moveDist < 0.001) return result;

        moveDir.normalize();

        // Transform direction to world space
        const worldMoveDir = moveDir.clone();
        // Apply only rotation (not translation) from locationGroup
        worldMoveDir.applyQuaternion(this.locationGroup.quaternion);

        this.collisionRaycaster.set(currentWorldPos, worldMoveDir);
        this.collisionRaycaster.far = moveDist + this.playerRadius;

        // Get all collidable objects from scene
        const collidables = this.getCollidables();
        const intersects = this.collisionRaycaster.intersectObjects(collidables, true);

        if (intersects.length > 0) {
            const hit = intersects[0];
            if (hit.distance < moveDist + this.playerRadius) {
                result.blocked = true;
                result.hitObject = hit.object;
            }
        }

        return result;
    }

    // Get height of any object surface at the given position (for standing on roofs)
    getObjectSurfaceHeight(x, y, z) {
        if (!this.mathWorld || !this.locationGroup) {
            return -Infinity;
        }

        // Ray from above the player, pointing down
        const maxCheckHeight = y + 5; // Check from slightly above player
        const localPos = new THREE.Vector3(x, maxCheckHeight, z);
        const worldPos = localPos.clone();
        this.locationGroup.localToWorld(worldPos);

        const downDir = new THREE.Vector3(0, -1, 0);
        this.collisionRaycaster.set(worldPos, downDir);
        this.collisionRaycaster.far = maxCheckHeight + 10; // Check below

        const collidables = this.getCollidables();
        const intersects = this.collisionRaycaster.intersectObjects(collidables, true);

        if (intersects.length > 0) {
            // Find the highest surface below the player's feet
            const feetY = y - this.eyeHeight;
            for (const hit of intersects) {
                // Convert hit point back to local coordinates
                const hitLocal = hit.point.clone();
                this.locationGroup.worldToLocal(hitLocal);

                // Check if this surface is below our current feet but reachable
                if (hitLocal.y <= feetY + this.stepHeight && hitLocal.y > feetY - 1) {
                    return hitLocal.y;
                }
            }
        }

        return -Infinity;
    }

    // Get all objects that can be collided with
    getCollidables() {
        if (!this.mathWorld) return [];

        const collidables = [];

        // Add all solid objects in the current location
        if (this.locationGroup) {
            this.locationGroup.traverse(obj => {
                // Only mesh objects can be collided with
                if (obj.isMesh) {
                    // Skip objects marked as non-collidable (like water, particles, etc.)
                    if (obj.userData && obj.userData.noCollision) return;
                    // Skip very small objects
                    if (obj.geometry && obj.geometry.boundingSphere) {
                        if (obj.geometry.boundingSphere.radius < 0.1) return;
                    }
                    collidables.push(obj);
                }
            });
        }

        return collidables;
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
