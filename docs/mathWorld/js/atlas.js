/**
 * Atlas - In-World Aerial View Navigation
 * Press M to enter aerial view of Santa Cruz with clickable location markers
 * North is up, markers show actual locations on the terrain
 */

import * as THREE from 'three';
import { gpsToLocal, getElevation, SC_SIZE, SC_CENTER } from './santaCruz/santaCruz.js';
import { SANTA_CRUZ_LOCATIONS } from './santaCruz/locations.js';

export class Atlas {
    constructor(mathWorld) {
        this.mathWorld = mathWorld;
        this.isActive = false;

        // Store camera state when entering atlas
        this.savedCameraPosition = null;
        this.savedCameraQuaternion = null;
        this.savedPlayerEnabled = false;

        // Atlas camera position (aerial, north up)
        // Region is ~15.5km x 9.4km, with 60° FOV we need ~14km altitude
        this.atlasHeight = 14000;

        // Location markers (3D objects in the scene)
        this.markers = [];
        this.markerGroup = null;

        // Raycaster for clicking markers
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        // UI overlay
        this.overlay = document.getElementById('atlas-overlay');
        this.setupMarkers();
        this.setupEventListeners();
    }

    setupMarkers() {
        // Create a group to hold all markers
        this.markerGroup = new THREE.Group();
        this.markerGroup.visible = false;
        this.mathWorld.scene.add(this.markerGroup);

        // Create marker for each location
        for (const [locationId, locData] of Object.entries(SANTA_CRUZ_LOCATIONS)) {
            const marker = this.createMarker(locationId, locData);
            this.markers.push(marker);
            this.markerGroup.add(marker);
        }
    }

    createMarker(locationId, locData) {
        const marker = new THREE.Group();
        marker.userData = {
            locationId,
            ...locData
        };

        // Get position
        const local = gpsToLocal(locData.lat, locData.lon);
        const elevation = getElevation(locData.lat, locData.lon);

        // Marker pin - very tall and large so visible from 14km aerial view
        const markerHeight = 1500;
        const sphereSize = 600;

        // Pin base (cone pointing down)
        const pinGeo = new THREE.ConeGeometry(400, markerHeight, 8);
        const pinMat = new THREE.MeshBasicMaterial({
            color: locData.hasContent ? 0xFF6600 : 0x666666,
            transparent: true,
            opacity: 0.9
        });
        const pin = new THREE.Mesh(pinGeo, pinMat);
        pin.rotation.x = Math.PI; // Point down
        pin.position.y = markerHeight / 2;
        marker.add(pin);

        // Glowing sphere on top
        const sphereGeo = new THREE.SphereGeometry(sphereSize, 16, 16);
        const sphereMat = new THREE.MeshBasicMaterial({
            color: locData.hasContent ? 0xFFAA00 : 0x999999,
            transparent: true,
            opacity: 0.95
        });
        const sphere = new THREE.Mesh(sphereGeo, sphereMat);
        sphere.position.y = markerHeight + sphereSize;
        marker.add(sphere);

        // Pulsing ring around sphere (horizontal, visible from above)
        const ringGeo = new THREE.RingGeometry(sphereSize * 1.3, sphereSize * 1.6, 32);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xFFFFFF,
            transparent: true,
            opacity: 0.7,
            side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2; // Horizontal
        ring.position.y = markerHeight + sphereSize;
        marker.add(ring);

        // Position marker at location
        marker.position.set(local.x, elevation + 100, local.z);

        return marker;
    }

    setupEventListeners() {
        // Click to select marker
        this.mathWorld.canvas.addEventListener('click', (e) => this.onClick(e));

        // Mouse move for hover effects
        this.mathWorld.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    }

    toggle() {
        if (this.isActive) {
            this.close();
        } else {
            this.open();
        }
    }

    open() {
        if (this.isActive) return;
        if (this.mathWorld.introPhase !== 'ready') return;

        this.isActive = true;

        // Exit pointer lock
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }

        // Save current camera state
        this.savedCameraPosition = this.mathWorld.camera.position.clone();
        this.savedCameraQuaternion = this.mathWorld.camera.quaternion.clone();
        this.savedPlayerEnabled = this.mathWorld.player.enabled;

        // Disable player
        this.mathWorld.player.disable();
        this.mathWorld.isRunning = false;

        // Move camera to aerial view centered directly over Santa Cruz region
        // Camera at center (0,0) looking straight down to see full area
        const targetPos = new THREE.Vector3(0, this.atlasHeight, 0);
        this.animateCameraTo(targetPos, 1.0);

        // Show markers
        this.markerGroup.visible = true;

        // Show overlay with instructions
        this.showOverlay();

        // Hide click-to-look prompt
        this.mathWorld.clickToLook.classList.add('hidden');

        console.log('Atlas opened - aerial view');
    }

    close() {
        if (!this.isActive) return;

        this.isActive = false;

        // Hide markers
        this.markerGroup.visible = false;

        // Hide overlay
        this.hideOverlay();

        // Restore camera
        if (this.savedCameraPosition) {
            this.mathWorld.camera.position.copy(this.savedCameraPosition);
            this.mathWorld.camera.quaternion.copy(this.savedCameraQuaternion);
        }

        // Re-enable player
        this.mathWorld.player.enable();
        this.mathWorld.isRunning = true;

        // Request pointer lock
        setTimeout(() => this.mathWorld.requestPointerLock(), 100);

        console.log('Atlas closed');
    }

    animateCameraTo(targetPos, duration) {
        const camera = this.mathWorld.camera;
        const startPos = camera.position.clone();
        const startQuat = camera.quaternion.clone();
        const startTime = performance.now();

        // Target quaternion: looking straight down, with north (negative Z) at top of screen
        // Camera looks down -Y axis, with -Z world direction appearing at top of screen
        const targetQuat = new THREE.Quaternion();
        targetQuat.setFromEuler(new THREE.Euler(-Math.PI / 2, 0, 0)); // Look straight down

        const animate = () => {
            if (!this.isActive) return;

            const elapsed = (performance.now() - startTime) / 1000;
            const t = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - t, 3); // Ease out cubic

            // Interpolate position
            camera.position.lerpVectors(startPos, targetPos, eased);

            // Interpolate rotation
            camera.quaternion.slerpQuaternions(startQuat, targetQuat, eased);

            if (t < 1) {
                requestAnimationFrame(animate);
            }
        };

        animate();
    }

    showOverlay() {
        // Create simple HUD for atlas mode - title at top, hint at bottom
        this.overlay.innerHTML = `
            <div class="atlas-hud">
                <div class="atlas-title">🗺️ Santa Cruz Atlas</div>
                <div class="atlas-instructions">Click a marker to teleport • Press M or Escape to close</div>
            </div>
            <div class="atlas-location-hint" id="atlas-hover-hint"></div>
        `;
        this.overlay.classList.remove('hidden');
        this.hoverHint = document.getElementById('atlas-hover-hint');
    }

    hideOverlay() {
        this.overlay.classList.add('hidden');
    }

    onClick(event) {
        if (!this.isActive) return;

        // Get mouse position in normalized device coordinates
        const rect = this.mathWorld.canvas.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        // Raycast to markers
        this.raycaster.setFromCamera(this.mouse, this.mathWorld.camera);
        const intersects = this.raycaster.intersectObjects(this.markerGroup.children, true);

        if (intersects.length > 0) {
            // Find the parent marker group
            let obj = intersects[0].object;
            while (obj.parent && !obj.userData.locationId) {
                obj = obj.parent;
            }

            if (obj.userData.locationId) {
                this.selectLocation(obj.userData.locationId);
            }
        }
    }

    onMouseMove(event) {
        if (!this.isActive) return;

        const rect = this.mathWorld.canvas.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.mathWorld.camera);
        const intersects = this.raycaster.intersectObjects(this.markerGroup.children, true);

        // Reset all markers
        this.markers.forEach(m => {
            m.scale.setScalar(1);
        });

        if (intersects.length > 0) {
            let obj = intersects[0].object;
            while (obj.parent && !obj.userData.locationId) {
                obj = obj.parent;
            }

            if (obj.userData.locationId) {
                // Highlight marker
                obj.scale.setScalar(1.3);

                // Show hint
                if (this.hoverHint) {
                    const data = obj.userData;
                    const status = data.hasContent ? '✓ Click to visit' : '🔒 Coming soon';
                    this.hoverHint.innerHTML = `<strong>${data.name}</strong><br>${data.description}<br><em>${status}</em>`;
                }

                // Change cursor
                this.mathWorld.canvas.style.cursor = 'pointer';
            }
        } else {
            if (this.hoverHint) {
                this.hoverHint.innerHTML = '';
            }
            this.mathWorld.canvas.style.cursor = 'default';
        }
    }

    async selectLocation(locationId) {
        const locData = SANTA_CRUZ_LOCATIONS[locationId];
        if (!locData) return;

        if (!locData.hasContent) {
            console.log(`${locData.name} - Coming soon!`);
            return;
        }

        console.log(`Teleporting to ${locData.name}`);

        // Close atlas
        this.close();

        // Teleport to location
        await this.mathWorld.teleportTo(locationId);
    }

    handleKeyDown(e) {
        if (e.code === 'KeyM') {
            this.toggle();
            return true;
        }
        if (e.code === 'Escape' && this.isActive) {
            this.close();
            return true;
        }
        return false;
    }

    // Update markers (call in animation loop if needed)
    update(delta) {
        if (!this.isActive) return;

        // Animate marker rings
        const time = performance.now() * 0.001;
        this.markers.forEach((marker, i) => {
            const ring = marker.children[2]; // Ring is third child
            if (ring) {
                ring.scale.setScalar(1 + Math.sin(time * 2 + i) * 0.1);
                ring.material.opacity = 0.4 + Math.sin(time * 3 + i) * 0.2;
            }
        });
    }
}
