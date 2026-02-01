/**
 * Atlas - In-World Aerial View Navigation
 * Press M to enter aerial view of Santa Cruz with clickable location markers
 * North is up, markers show actual locations on the terrain
 */

import * as THREE from 'three';
import ThreeGlobe from 'three-globe';
import { gpsToLocal, getElevation } from './santaCruz/santaCruz.js';
import { SANTA_CRUZ_LOCATIONS } from './santaCruz/locations.js';
import { REGIONAL_LOCATIONS } from './regionalLocations.js';

export class Atlas {
    constructor(mathWorld) {
        this.mathWorld = mathWorld;
        this.isActive = false;
        // Atlas levels: 0 (Ground), 1 (City), 2 (Region), 3 (Continent), 4 (World)
        this.currentLevel = 0;
        this.levels = [
            { name: 'Ground', height: 0, label: 'Ground Level' },
            { name: 'City', height: 16000, label: 'Santa Cruz' },
            { name: 'Region', height: 600000, label: 'California' },
            { name: 'Continent', height: 4000000, label: 'North America' },
            { name: 'World', height: 15000000, label: 'Earth' }
        ];

        // Store camera state when entering atlas
        this.savedCameraPosition = null;
        this.savedCameraQuaternion = null;
        this.savedPlayerEnabled = false;

        // Location markers (3D objects in the scene)
        this.localMarkers = [];
        this.regionalMarkers = [];
        this.markerGroup = null;

        // World objects (Globe)
        this.globe = null;

        // Raycaster for clicking markers
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        // Initialize world scale
        this.radius = 6371000;

        // UI overlay
        this.overlay = document.getElementById('atlas-overlay');

        // Setup order: Globe FIRST (so we have this.radius), then markers
        this.setupGlobe();
        this.setupMarkers();
        this.setupEventListeners();
    }

    setupGlobe() {
        try {
            this.globe = new ThreeGlobe()
                .globeMaterial(new THREE.MeshPhongMaterial({
                    color: 0x0A244D,
                    emissive: 0x051021,
                    shininess: 0.8
                }))
                .showAtmosphere(true)
                .atmosphereColor('#3B82F6')
                .atmosphereAltitude(0.1);

            // === CRITICAL: Scale globe to planetary size ===
            // ThreeGlobe defaults to radius 100. We must scale to this.radius (6371km).
            const scale = this.radius / 100;
            this.globe.scale.setScalar(scale);

            // Fetch landmass data
            fetch('https://raw.githubusercontent.com/vasturiano/three-globe/master/example/country-polygons/ne_110m_admin_0_countries.geojson')
                .then(res => res.json())
                .then(countries => {
                    this.globe.polygonsData(countries.features)
                        .polygonCapColor(() => '#22C15E')
                        .polygonSideColor(() => 'rgba(20, 83, 45, 0.4)')
                        .polygonAltitude(0.002);
                });
        } catch (e) {
            console.error('ThreeGlobe initialization failed:', e);
            const fallbackGeo = new THREE.SphereGeometry(this.radius, 64, 64);
            const fallbackMat = new THREE.MeshLambertMaterial({
                color: 0x0A244D,
                emissive: 0x051021,
                transparent: true,
                opacity: 0
            });
            this.globe = new THREE.Mesh(fallbackGeo, fallbackMat);
        }

        //         // Position/rotate the globe - North at -Z, Santa Cruz at origin
        this.globe.position.set(0, -this.radius, 0);
        this.globe.visible = false;

        const scLat = 36.97;
        const scLon = -122.03;
        this.globe.rotation.y = (-scLon - 90) * (Math.PI / 180);
        this.globe.rotation.x = (scLat - 90) * (Math.PI / 180);

        this.mathWorld.scene.add(this.globe);
    }

    setupMarkers() {
        // Create a group to hold all markers
        this.markerGroup = new THREE.Group();
        this.markerGroup.visible = false;
        this.mathWorld.scene.add(this.markerGroup);

        // Local markers (Santa Cruz area)
        for (const [id, data] of Object.entries(SANTA_CRUZ_LOCATIONS)) {
            const marker = this.createMarker(id, data, 'local');
            this.localMarkers.push(marker);
            this.markerGroup.add(marker);
        }

        // Regional/Global markers (Hierarchical)
        for (const [id, data] of Object.entries(REGIONAL_LOCATIONS)) {
            const marker = this.createMarker(id, data, 'regional');
            this.regionalMarkers.push(marker);
            this.markerGroup.add(marker);
        }
    }

    createMarker(locationId, locData, category = 'local') {
        const marker = new THREE.Group();
        marker.userData = {
            locationId,
            category,
            ...locData
        };

        if (category === 'local') {
            let local = gpsToLocal(locData.lat, locData.lon);
            let elevation = getElevation(locData.lat, locData.lon);
            marker.position.set(local.x, elevation + 100, local.z);
        } else {
            // SPHERICAL PROJECTION for regional markers
            const phi = (90 - locData.lat) * (Math.PI / 180);
            const theta = (locData.lon) * (Math.PI / 180);
            const r = this.radius + 100000; // 100km altitude

            const p = new THREE.Vector3();
            p.setFromSphericalCoords(r, phi, theta + Math.PI / 2);

            // Correct orientation to match Santa Cruz at world (0,0,0) with North as -Z
            const scLat = 36.97, scLon = -122.03;
            const rotY = new THREE.Matrix4().makeRotationY((-scLon - 90) * (Math.PI / 180));
            const rotX = new THREE.Matrix4().makeRotationX((scLat - 90) * (Math.PI / 180));

            p.applyMatrix4(rotY);
            p.applyMatrix4(rotX);

            marker.position.set(p.x, p.y - this.radius, p.z);
        }

        // Marker pin - very tall and large so visible from space
        const markerHeight = 1500;
        const sphereSize = 600;

        // Pin base (cone pointing down)
        const pinGeo = new THREE.ConeGeometry(400, markerHeight, 8);
        const pinMat = new THREE.MeshStandardMaterial({
            color: locData.hasContent ? 0xFF9900 : 0x666666,
            emissive: locData.hasContent ? 0xFF6600 : 0x222222,
            emissiveIntensity: 0.5,
            transparent: true,
            opacity: 0.95
        });
        const pin = new THREE.Mesh(pinGeo, pinMat);
        pin.rotation.x = Math.PI; // Point down
        pin.position.y = markerHeight / 2;
        marker.add(pin);

        // Glowing sphere on top
        const sphereGeo = new THREE.SphereGeometry(sphereSize, 16, 16);
        const sphereMat = new THREE.MeshStandardMaterial({
            color: locData.hasContent ? 0xFFAA00 : 0x999999,
            emissive: locData.hasContent ? 0xFFAA00 : 0x333333,
            emissiveIntensity: 1.0,
            transparent: true,
            opacity: 1.0
        });
        const sphere = new THREE.Mesh(sphereGeo, sphereMat);
        sphere.position.y = markerHeight + sphereSize;
        marker.add(sphere);

        // Pulsing ring around sphere (horizontal, visible from above)
        const ringGeo = new THREE.RingGeometry(sphereSize * 1.5, sphereSize * 2.0, 32);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xFFFFFF,
            transparent: true,
            opacity: 0.8,
            side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2; // Horizontal
        ring.position.y = markerHeight + sphereSize;
        marker.add(ring);

        return marker;
    }

    setupEventListeners() {
        // Click to select marker
        this.mathWorld.canvas.addEventListener('click', (e) => this.onClick(e));

        // Mouse move for hover effects
        this.mathWorld.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    }

    toggle() {
        if (this.currentLevel > 0) {
            this.advanceLevel();
        } else {
            this.open();
        }
    }

    advanceLevel() {
        if (this.currentLevel === 0) {
            this.open();
            return;
        }

        this.currentLevel++;
        if (this.currentLevel >= this.levels.length) {
            this.close();
            return;
        }

        const level = this.levels[this.currentLevel];
        const targetPos = new THREE.Vector3(0, level.height, 0);
        this.animateCameraTo(targetPos, 0.8);
        this.updateOverlay();

        console.log(`Atlas zoom: ${level.name} level`);
    }

    open() {
        if (this.isActive) return;
        if (this.mathWorld.introPhase !== 'ready') return;

        this.isActive = true;
        this.currentLevel = 1;

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

        // Disable mobile controls while in Atlas
        if (this.mathWorld.mobileControls) {
            this.mathWorld.mobileControls.disable();
        }

        // Move camera to level 1 (City)
        const level = this.levels[this.currentLevel];
        const targetPos = new THREE.Vector3(0, level.height, 0);
        this.animateCameraTo(targetPos, 1.0);

        // Show markers
        this.markerGroup.visible = true;
        this.globe.visible = true;
        const mat = this.globe.globeMaterial ? this.globe.globeMaterial() : this.globe.material;
        if (mat) {
            mat.opacity = 1.0;
            mat.transparent = true;
        }


        // Show overlay with instructions
        this.showOverlay();

        // Push fog way back for high-altitude view
        this.mathWorld.scene.fog.far = 100000000;
        this.mathWorld.scene.fog.near = 50000000;

        // Hide click-to-look prompt
        this.mathWorld.clickToLook.classList.add('hidden');

        console.log('Atlas opened - City level');
    }

    close() {
        if (!this.isActive) return;

        this.isActive = false;
        this.currentLevel = 0;

        // Hide markers and globe
        this.markerGroup.visible = false;
        this.globe.visible = false;
        if (this.globe?.globeMaterial) {
            this.globe.globeMaterial().opacity = 0;
        } else if (this.globe?.material) {
            this.globe.material.opacity = 0;
        }


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

        // Re-enable mobile controls if on touch device
        if (this.mathWorld.mobileControls && this.mathWorld.mobileControls.isTouch()) {
            this.mathWorld.mobileControls.enable();
        } else {
            // Request pointer lock (desktop only)
            setTimeout(() => this.mathWorld.requestPointerLock(), 100);
        }

        // Restore fog and sky
        this.mathWorld.scene.fog.near = 5000;
        this.mathWorld.scene.fog.far = 20000;
        this.mathWorld.scene.background.set(0xAAD4E6);

        console.log('Atlas closed');
    }

    animateCameraTo(targetPos, duration) {
        const camera = this.mathWorld.camera;
        const startPos = camera.position.clone();
        const startQuat = camera.quaternion.clone();
        const startTime = performance.now();

        // Target quaternion: looking straight down (-Y), with North (-Z) at the top of the screen
        const targetQuat = new THREE.Quaternion();
        const m = new THREE.Matrix4();
        // Look from targetPos down to (0,0,0), with "up" as (0,0,-1) which is North
        m.lookAt(targetPos, new THREE.Vector3(0, 0, 0), new THREE.Vector3(0, 0, -1));
        targetQuat.setFromRotationMatrix(m);

        // Increase click tolerance for markers as we zoom out
        if (this.currentLevel > 2) {
            this.raycaster.params.Points.threshold = 10000;
            this.raycaster.params.Mesh.threshold = 10000;
        } else {
            this.raycaster.params.Points.threshold = 1;
            this.raycaster.params.Mesh.threshold = 1;
        }

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
        this.overlay.classList.remove('hidden');
        this.updateOverlay();
    }

    updateOverlay() {
        const level = this.levels[this.currentLevel];
        const nextLevel = this.levels[(this.currentLevel + 1) % this.levels.length];
        const nextPrompt = nextLevel.name === 'Ground' ? 'Close Map' : `Zoom out to ${nextLevel.name}`;

        this.overlay.innerHTML = `
            <div class="atlas-hud">
                <div class="atlas-title">🗺️ Atlas Explorer</div>
                <div class="atlas-level-indicator">
                    <span class="level-label">${level.name}</span>
                    <span class="level-location">${level.label}</span>
                </div>
                <div class="atlas-instructions">
                    Click a marker to teleport<br>
                    Press <strong>M</strong> to ${nextPrompt}<br>
                    Press <strong>Escape</strong> to close
                </div>
            </div>
            <div class="atlas-location-hint" id="atlas-hover-hint"></div>
        `;
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
        this.localMarkers.forEach(m => {
            m.children.forEach(child => child.scale.setScalar(1));
        });
        this.regionalMarkers.forEach(m => {
            m.children.forEach(child => child.scale.setScalar(1));
        });

        if (intersects.length > 0) {
            let obj = intersects[0].object;
            while (obj.parent && !obj.userData.locationId) {
                obj = obj.parent;
            }

            if (obj.userData.locationId) {
                // Highlight marker
                obj.children.forEach(child => child.scale.setScalar(1.3));

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
        // Handle regional marker mapping
        let targetId = locationId;
        if (locationId === 'santaCruz') targetId = 'boardwalk';

        const locData = SANTA_CRUZ_LOCATIONS[targetId] || REGIONAL_LOCATIONS[targetId];
        if (!locData) return;

        if (!locData.hasContent) {
            this.showLockedLocation(locData.name);
            return;
        }

        console.log(`Teleporting to ${locData.name}`);

        // Close atlas
        this.close();

        // Teleport to location
        await this.mathWorld.teleportTo(targetId);
    }

    showLockedLocation(name) {
        if (this.hoverHint) {
            this.hoverHint.innerHTML = `<div class="locked-alert">🔒 <strong>${name}</strong> is currently locked.</div>`;
            this.hoverHint.style.color = '#FF5555';
            setTimeout(() => {
                if (this.hoverHint) {
                    this.hoverHint.style.color = '';
                }
            }, 1000);
        }
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

    // Update markers and world (call in animation loop)
    update(delta) {
        if (!this.isActive) return;

        const cameraHeight = this.mathWorld.camera.position.y;

        // Handle Globe visibility and fade based on altitude
        if (this.globe) {
            // Fade in globe as we get higher
            const startFadeHeight = 5000;
            const fullFadeHeight = 150000;
            const opacity = THREE.MathUtils.clamp(
                (cameraHeight - startFadeHeight) / (fullFadeHeight - startFadeHeight),
                0.35,
                0.95
            );

            // Toggle visibility for sub-segments based on altitude
            const shouldBeVisible = cameraHeight >= startFadeHeight;
            if (this.globe.visible !== shouldBeVisible) {
                this.globe.visible = shouldBeVisible;
            }

            // Only update materials if visible and opacity is changing meaningfully
            if (this.globe.visible) {
                const mat = this.globe.globeMaterial ? this.globe.globeMaterial() : this.globe.material;
                if (mat) {
                    mat.opacity = opacity;
                }

                // Rotation for cinematic effect (slow down for precision)
                this.globe.rotation.y += delta * 0.01;
            }

            // Boost AmbientLight as we go into space to see the dark side
            if (this.mathWorld.scene.children) {
                const ambient = this.mathWorld.scene.children.find(c => c.isAmbientLight);
                if (ambient) {
                    ambient.intensity = 0.5 + spaceFactor * 1.5;
                }
            }

            // Fade sky to black
            const spaceFactor = THREE.MathUtils.clamp((cameraHeight - 200000) / 800000, 0, 1);
            const skyColor = new THREE.Color(0xAAD4E6).lerp(new THREE.Color(0x020305), spaceFactor);
            this.mathWorld.scene.background.copy(skyColor);
            if (this.mathWorld.scene.fog) this.mathWorld.scene.fog.color.copy(skyColor);
        }

        // Scale markers up as we get higher so they remain clickable/visible
        const altitudeScale = 1.0 + THREE.MathUtils.clamp(cameraHeight / 20000, 0, 4000);
        const time = performance.now() * 0.001;

        // Visibility Thresholds (Altitudes in meters)
        const cityThreshold = 30000;      // Beyond this, local landmarks fade out
        const stateThreshold = 800000;    // Beyond this, cities fade out
        const continentThreshold = 6000000; // Beyond this, states fade out

        // 1. Local Markers (Visibility: Ground to City)
        const localOpacity = 1.0 - THREE.MathUtils.clamp((cameraHeight - cityThreshold * 0.5) / (cityThreshold * 1.5), 0, 1);

        // 2. City Markers (Visibility: City to Region)
        const cityOpacity = THREE.MathUtils.clamp((cameraHeight - cityThreshold * 0.5) / cityThreshold, 0, 1) *
            (1.0 - THREE.MathUtils.clamp((cameraHeight - stateThreshold * 0.5) / (stateThreshold * 1.5), 0, 1));

        // 3. State Markers (Visibility: Region to Continent)
        const stateOpacity = THREE.MathUtils.clamp((cameraHeight - stateThreshold * 0.5) / stateThreshold, 0, 1) *
            (1.0 - THREE.MathUtils.clamp((cameraHeight - continentThreshold * 0.5) / (continentThreshold * 1.5), 0, 1));

        // 4. Continent Markers (Visibility: Continent to World)
        const continentOpacity = THREE.MathUtils.clamp((cameraHeight - continentThreshold * 0.5) / continentThreshold, 0, 1);

        // Update local markers
        this.localMarkers.forEach((marker, i) => {
            marker.visible = localOpacity > 0.01;
            marker.scale.setScalar(altitudeScale);
            this.updateMarkerVisuals(marker, localOpacity, time, i);
        });

        // Update regional markers by scale level
        this.regionalMarkers.forEach((marker, i) => {
            const scaleLevel = marker.userData.scaleLevel;
            let targetOpacity = 0;

            if (scaleLevel === 'city') targetOpacity = cityOpacity;
            else if (scaleLevel === 'state') targetOpacity = stateOpacity;
            else if (scaleLevel === 'continent') targetOpacity = continentOpacity;

            marker.visible = targetOpacity > 0.01;

            // Markers at higher parent levels get a boost in base scale
            // Continents are clearly visible but not obscuring
            const levelBoost = scaleLevel === 'continent' ? 2.5 : (scaleLevel === 'state' ? 1.8 : 1.2);
            marker.scale.setScalar(altitudeScale * levelBoost);

            this.updateMarkerVisuals(marker, targetOpacity, time, i);
        });
    }

    updateMarkerVisuals(marker, opacityFactor, time, i) {
        const pin = marker.children[0];
        const sphere = marker.children[1];
        const ring = marker.children[2];

        if (pin) {
            pin.material.opacity = opacityFactor * 0.95;
            pin.material.emissiveIntensity = (0.5 + Math.sin(time * 2 + i) * 0.2) * opacityFactor;
        }
        if (sphere) {
            sphere.material.opacity = opacityFactor;
            sphere.material.emissiveIntensity = (0.8 + Math.cos(time * 2.5 + i) * 0.2) * opacityFactor;
        }

        if (ring) {
            ring.scale.setScalar(1.5 + Math.sin(time * 2 + i) * 0.3); // Larger, more visible pulsing ring
            ring.material.opacity = (0.7 + Math.sin(time * 3 + i) * 0.3) * opacityFactor;
        }

        // Update atmosphere glow shader uniform
        if (this.atmosphereGlow) {
            this.atmosphereGlow.material.uniforms.viewVector.value.copy(
                this.mathWorld.camera.position
            ).normalize();
        }
    }
}
