/**
 * Atlas - Hierarchical Globe Navigation
 * Press M to open atlas. Drill down: World → Continent → State → City → Ground
 * Each level shows only its direct children as markers.
 * Custom cartoon globe with procedural land/ocean coloring.
 */

import * as THREE from 'three';
import { gpsToLocal, getElevation } from './santaCruz/santaCruz.js';
import { SANTA_CRUZ_LOCATIONS } from './santaCruz/locations.js';
import { REGIONAL_LOCATIONS } from './regionalLocations.js';

// Hierarchical location tree
// Each node has: children (location IDs at the next level down)
const LOCATION_TREE = {
    world: {
        children: ['northAmerica', 'eurasia', 'southAmerica', 'africa', 'australia']
    },
    northAmerica: {
        children: ['california', 'newYork', 'texas', 'britishColumbia', 'florida'],
        focusLat: 45, focusLon: -100, focusHeight: 4000000
    },
    eurasia: {
        children: [],
        focusLat: 50, focusLon: 40, focusHeight: 5000000
    },
    southAmerica: {
        children: [],
        focusLat: -20, focusLon: -60, focusHeight: 4000000
    },
    africa: {
        children: [],
        focusLat: 10, focusLon: 20, focusHeight: 4000000
    },
    australia: {
        children: [],
        focusLat: -25, focusLon: 135, focusHeight: 3000000
    },
    california: {
        children: ['santaCruz', 'berkeley', 'sanFrancisco', 'losAngeles', 'lakeTahoe', 'sanDiego'],
        focusLat: 36.7783, focusLon: -119.4179, focusHeight: 600000
    },
    newYork: { children: [], focusLat: 40.71, focusLon: -74.01, focusHeight: 600000 },
    texas: { children: [], focusLat: 31.97, focusLon: -99.90, focusHeight: 600000 },
    britishColumbia: { children: [], focusLat: 53.73, focusLon: -127.65, focusHeight: 600000 },
    florida: { children: [], focusLat: 27.66, focusLon: -81.52, focusHeight: 600000 },
    santaCruz: {
        children: ['mchenryLibrary', 'steamerLane', 'boardwalk', 'naturalBridges', 'westCliff', 'downtownSC'],
        focusLat: 36.9741, focusLon: -122.0308, focusHeight: 16000
    },
    berkeley: { children: [], focusLat: 37.8715, focusLon: -122.2730, focusHeight: 16000 },
    sanFrancisco: { children: [], focusLat: 37.7749, focusLon: -122.4194, focusHeight: 16000 },
    losAngeles: { children: [], focusLat: 34.0522, focusLon: -118.2437, focusHeight: 16000 },
    lakeTahoe: { children: [], focusLat: 39.0968, focusLon: -120.0324, focusHeight: 16000 },
    sanDiego: { children: [], focusLat: 32.7157, focusLon: -117.1611, focusHeight: 16000 },
};

export class Atlas {
    constructor(mathWorld) {
        this.mathWorld = mathWorld;
        this.isActive = false;

        // Navigation state
        this.currentNode = 'world';  // Current drill-down node
        this.navStack = [];          // Stack of parent nodes for back-navigation

        // Store camera state when entering atlas
        this.savedCameraPosition = null;
        this.savedCameraQuaternion = null;
        this.savedPlayerEnabled = false;

        // Location markers (3D objects in the scene)
        this.markers = {};          // locationId -> THREE.Group
        this.markerGroup = null;

        // Globe
        this.globe = null;
        this.radius = 6371000;

        // Raycaster for clicking markers
        this.raycaster = new THREE.Raycaster();
        this.mouse = new THREE.Vector2();

        // UI overlay
        this.overlay = document.getElementById('atlas-overlay');

        this.setupGlobe();
        this.setupMarkers();
        this.setupEventListeners();
    }

    // ==================== GLOBE ====================

    setupGlobe() {
        this.globe = this.createCartoonGlobe();
        this.globe.position.set(0, -this.radius, 0);
        this.globe.visible = false;

        // Rotate globe so Santa Cruz is at world origin (0, radius, 0) on the sphere surface
        const scLat = 36.97;
        const scLon = -122.03;
        this.globe.rotation.y = (-scLon - 90) * (Math.PI / 180);
        this.globe.rotation.x = (scLat - 90) * (Math.PI / 180);

        this.mathWorld.scene.add(this.globe);

        // Load high-resolution coastline data and render to texture
        this.loadCoastlines();
    }

    createCartoonGlobe() {
        const segments = 96;
        const geometry = new THREE.SphereGeometry(this.radius, segments, segments);

        // Start with a basic ocean-colored material; coastline texture applied later
        const material = new THREE.MeshStandardMaterial({
            color: 0x1a5276,
            roughness: 0.7,
            metalness: 0.05,
            transparent: true,
            opacity: 0.95
        });

        const mesh = new THREE.Mesh(geometry, material);

        // Atmosphere glow
        const atmosGeo = new THREE.SphereGeometry(this.radius * 1.025, 48, 48);
        const atmosMat = new THREE.MeshBasicMaterial({
            color: 0x88CCFF,
            transparent: true,
            opacity: 0.12,
            side: THREE.BackSide
        });
        mesh.add(new THREE.Mesh(atmosGeo, atmosMat));

        return mesh;
    }

    /**
     * Load Natural Earth GeoJSON and render land polygons onto a canvas texture.
     * This gives us proper coastline detail — California, Italy, Japan, all distinguishable.
     */
    loadCoastlines() {
        const texSize = 4096;
        const canvas = document.createElement('canvas');
        canvas.width = texSize;
        canvas.height = texSize / 2;
        const ctx = canvas.getContext('2d');

        // Ocean base
        ctx.fillStyle = '#1a5276';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Load land polygons
        fetch('https://raw.githubusercontent.com/nvkelso/natural-earth-vector/master/geojson/ne_50m_land.geojson')
            .then(res => res.json())
            .then(geojson => {
                // Draw land fill
                ctx.fillStyle = '#3a7d44';
                for (const feature of geojson.features) {
                    this.drawGeoJSONFeature(ctx, feature, canvas.width, canvas.height);
                }

                // Apply latitude-based coloring overlay
                this.applyLatitudeColoring(ctx, canvas.width, canvas.height);

                // Draw coastline outlines for definition
                ctx.strokeStyle = 'rgba(20, 60, 30, 0.6)';
                ctx.lineWidth = 1.5;
                for (const feature of geojson.features) {
                    this.strokeGeoJSONFeature(ctx, feature, canvas.width, canvas.height);
                }

                // Create texture from canvas
                const texture = new THREE.CanvasTexture(canvas);
                texture.wrapS = THREE.RepeatWrapping;
                this.globe.material.map = texture;
                this.globe.material.color.set(0xFFFFFF);
                this.globe.material.needsUpdate = true;
            })
            .catch(() => {
                // Fallback: just use the blue sphere
                console.warn('Could not load coastline data, using plain globe');
            });
    }

    drawGeoJSONFeature(ctx, feature, w, h) {
        const geom = feature.geometry;
        if (!geom) return;

        const traceRing = (coords) => {
            for (let i = 0; i < coords.length; i++) {
                const [lon, lat] = coords[i];
                const x = ((lon + 180) / 360) * w;
                const y = ((90 - lat) / 180) * h;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
        };

        const drawPolygon = (rings) => {
            // All rings in one path: outer boundary + holes handled by evenodd
            ctx.beginPath();
            for (const ring of rings) traceRing(ring);
            ctx.fill('evenodd');
        };

        if (geom.type === 'Polygon') {
            drawPolygon(geom.coordinates);
        } else if (geom.type === 'MultiPolygon') {
            for (const polygon of geom.coordinates) {
                drawPolygon(polygon);
            }
        }
    }

    strokeGeoJSONFeature(ctx, feature, w, h) {
        const geom = feature.geometry;
        if (!geom) return;

        const strokeRing = (coords) => {
            ctx.beginPath();
            for (let i = 0; i < coords.length; i++) {
                const [lon, lat] = coords[i];
                const x = ((lon + 180) / 360) * w;
                const y = ((90 - lat) / 180) * h;
                if (i === 0) ctx.moveTo(x, y);
                else ctx.lineTo(x, y);
            }
            ctx.closePath();
            ctx.stroke();
        };

        if (geom.type === 'Polygon') {
            for (const ring of geom.coordinates) strokeRing(ring);
        } else if (geom.type === 'MultiPolygon') {
            for (const polygon of geom.coordinates) {
                for (const ring of polygon) strokeRing(ring);
            }
        }
    }

    applyLatitudeColoring(ctx, w, h) {
        // Add subtle latitude-based tints (deserts, snow, tropics)
        const imageData = ctx.getImageData(0, 0, w, h);
        const d = imageData.data;

        for (let y = 0; y < h; y++) {
            const lat = 90 - (y / h) * 180;
            const absLat = Math.abs(lat);

            for (let x = 0; x < w; x++) {
                const idx = (y * w + x) * 4;
                const r = d[idx], g = d[idx + 1], b = d[idx + 2];

                // Only tint land pixels (green-ish)
                if (g > r && g > b) {
                    let nr = r, ng = g, nb = b;

                    // Tropical: brighter green near equator
                    if (absLat < 20) {
                        const t = 1 - absLat / 20;
                        ng = Math.min(255, g + t * 25);
                    }
                    // Desert bands (20-35 degrees)
                    if (absLat > 20 && absLat < 35) {
                        const lon = (x / w) * 360 - 180;
                        // Deserts mainly in specific longitude bands
                        const desertLon = (lon > -20 && lon < 60) || (lon > 70 && lon < 120) || (lon > -120 && lon < -100);
                        if (desertLon) {
                            const t = 1 - Math.abs(absLat - 27.5) / 7.5;
                            nr = Math.min(255, r + t * 60);
                            ng = Math.min(255, g + t * 30);
                            nb = Math.min(255, b + t * 10);
                        }
                    }
                    // Snow/tundra at high latitudes
                    if (absLat > 60) {
                        const t = Math.min(1, (absLat - 60) / 25);
                        nr = r + (240 - r) * t;
                        ng = g + (240 - g) * t;
                        nb = b + (245 - b) * t;
                    }

                    d[idx] = Math.min(255, nr);
                    d[idx + 1] = Math.min(255, ng);
                    d[idx + 2] = Math.min(255, nb);
                }
            }
        }
        ctx.putImageData(imageData, 0, 0);
    }

    // ==================== MARKERS ====================

    setupMarkers() {
        this.markerGroup = new THREE.Group();
        this.markerGroup.visible = false;
        this.mathWorld.scene.add(this.markerGroup);

        // Create markers for ALL locations (local + regional)
        for (const [id, data] of Object.entries(SANTA_CRUZ_LOCATIONS)) {
            const marker = this.createMarker(id, data, 'local');
            this.markers[id] = marker;
            this.markerGroup.add(marker);
        }

        for (const [id, data] of Object.entries(REGIONAL_LOCATIONS)) {
            const marker = this.createMarker(id, data, 'regional');
            this.markers[id] = marker;
            this.markerGroup.add(marker);
        }

        // Start with all hidden - showCurrentLevel() will reveal the right ones
        Object.values(this.markers).forEach(m => m.visible = false);
    }

    createMarker(locationId, locData, category = 'local') {
        const marker = new THREE.Group();
        marker.userData = {
            locationId,
            category,
            ...locData
        };

        if (category === 'local') {
            const local = gpsToLocal(locData.lat, locData.lon);
            const elevation = getElevation(locData.lat, locData.lon);
            marker.position.set(local.x, elevation + 40, local.z);
        } else {
            // Spherical projection for regional markers
            const phi = (90 - locData.lat) * (Math.PI / 180);
            const theta = (locData.lon) * (Math.PI / 180);
            const r = this.radius + 50000;

            const p = new THREE.Vector3();
            p.setFromSphericalCoords(r, phi, theta + Math.PI / 2);

            const scLat = 36.97, scLon = -122.03;
            const rotY = new THREE.Matrix4().makeRotationY((-scLon - 90) * (Math.PI / 180));
            const rotX = new THREE.Matrix4().makeRotationX((scLat - 90) * (Math.PI / 180));

            p.applyMatrix4(rotY);
            p.applyMatrix4(rotX);

            marker.position.set(p.x, p.y - this.radius, p.z);
        }

        // Smaller marker: pin + sphere + ring
        const markerHeight = 400;
        const sphereSize = 180;

        const hasContent = locData.hasContent;
        const hasChildren = LOCATION_TREE[locationId] && LOCATION_TREE[locationId].children.length > 0;

        // Pin
        const pinGeo = new THREE.ConeGeometry(120, markerHeight, 8);
        const pinColor = hasContent ? 0xFF9900 : (hasChildren ? 0x4488CC : 0x666666);
        const pinEmissive = hasContent ? 0xFF6600 : (hasChildren ? 0x224466 : 0x222222);
        const pinMat = new THREE.MeshStandardMaterial({
            color: pinColor,
            emissive: pinEmissive,
            emissiveIntensity: 0.5,
            transparent: true,
            opacity: 0.95
        });
        const pin = new THREE.Mesh(pinGeo, pinMat);
        pin.rotation.x = Math.PI;
        pin.position.y = markerHeight / 2;
        marker.add(pin);

        // Sphere
        const sphereGeo = new THREE.SphereGeometry(sphereSize, 12, 12);
        const sphereMat = new THREE.MeshStandardMaterial({
            color: hasContent ? 0xFFAA00 : (hasChildren ? 0x55AADD : 0x999999),
            emissive: hasContent ? 0xFFAA00 : (hasChildren ? 0x3388BB : 0x333333),
            emissiveIntensity: 0.8,
            transparent: true,
            opacity: 1.0
        });
        const sphere = new THREE.Mesh(sphereGeo, sphereMat);
        sphere.position.y = markerHeight + sphereSize;
        marker.add(sphere);

        // Pulsing ring
        const ringGeo = new THREE.RingGeometry(sphereSize * 1.3, sphereSize * 1.7, 24);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xFFFFFF,
            transparent: true,
            opacity: 0.6,
            side: THREE.DoubleSide
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = -Math.PI / 2;
        ring.position.y = markerHeight + sphereSize;
        marker.add(ring);

        return marker;
    }

    // ==================== NAVIGATION ====================

    setupEventListeners() {
        this.mathWorld.canvas.addEventListener('click', (e) => this.onClick(e));
        this.mathWorld.canvas.addEventListener('mousemove', (e) => this.onMouseMove(e));
    }

    handleKeyDown(e) {
        if (e.code === 'KeyM') {
            this.toggle();
            return true;
        }
        if (e.code === 'Escape' && this.isActive) {
            this.goBack();
            return true;
        }
        return false;
    }

    toggle() {
        if (this.isActive) {
            // M zooms OUT one level each press
            this.zoomOut();
        } else {
            this.open();
        }
    }

    /**
     * M key zooms out: santaCruz → california → northAmerica → world → close
     */
    zoomOut() {
        if (this.currentNode === 'world' && this.navStack.length === 0) {
            this.close();
            return;
        }
        // Go up one level
        this.goBack();
    }

    open() {
        if (this.isActive) return;
        if (this.mathWorld.introPhase !== 'ready') return;

        this.isActive = true;

        // Start at Santa Cruz level (showing SC's children: boardwalk, mchenry, etc.)
        this.currentNode = 'santaCruz';
        this.navStack = ['world', 'northAmerica', 'california'];

        // Exit pointer lock
        if (document.pointerLockElement) {
            document.exitPointerLock();
        }

        // Save camera state
        this.savedCameraPosition = this.mathWorld.camera.position.clone();
        this.savedCameraQuaternion = this.mathWorld.camera.quaternion.clone();
        this.savedPlayerEnabled = this.mathWorld.player.enabled;

        // Disable player
        this.mathWorld.player.disable();
        this.mathWorld.isRunning = false;

        if (this.mathWorld.mobileControls) {
            this.mathWorld.mobileControls.disable();
        }

        // Show markers and globe
        this.markerGroup.visible = true;
        this.globe.visible = true;

        // Show overlay
        this.showOverlay();

        // Push fog back
        this.mathWorld.scene.fog.far = 100000000;
        this.mathWorld.scene.fog.near = 50000000;

        this.mathWorld.clickToLook.classList.add('hidden');

        // Ensure cursor is visible for Atlas interaction
        this.mathWorld.canvas.style.cursor = 'default';

        // Animate to Santa Cruz city view (16km altitude)
        const scTree = LOCATION_TREE['santaCruz'];
        const local = gpsToLocal(scTree.focusLat, scTree.focusLon);
        const targetPos = new THREE.Vector3(local.x, scTree.focusHeight, local.z);
        this.animateCameraTo(targetPos, 1.0);

        // Show Santa Cruz location markers
        this.showCurrentLevel();
    }

    close() {
        if (!this.isActive) return;

        this.isActive = false;
        this.currentNode = 'world';
        this.navStack = [];

        // Hide everything
        this.markerGroup.visible = false;
        this.globe.visible = false;

        this.hideOverlay();

        // Restore camera
        if (this.savedCameraPosition) {
            this.mathWorld.camera.position.copy(this.savedCameraPosition);
            this.mathWorld.camera.quaternion.copy(this.savedCameraQuaternion);
        }

        // Re-enable player
        this.mathWorld.player.enable();
        this.mathWorld.isRunning = true;

        if (this.mathWorld.mobileControls && this.mathWorld.mobileControls.isTouch()) {
            this.mathWorld.mobileControls.enable();
        } else {
            setTimeout(() => this.mathWorld.requestPointerLock(), 100);
        }

        // Restore terrain/ocean/sky to full visibility
        const terrain = this.mathWorld.terrain;
        if (terrain) {
            if (terrain.terrainMesh) {
                terrain.terrainMesh.visible = true;
                terrain.terrainMesh.material.opacity = 1;
            }
            if (terrain.shorelineMesh) {
                terrain.shorelineMesh.visible = true;
                terrain.shorelineMesh.material.opacity = 1;
            }
            if (terrain.oceanMesh) {
                terrain.oceanMesh.visible = true;
                terrain.oceanMesh.material.opacity = 0.8;
            }
            if (terrain.coastlineFoam) {
                terrain.coastlineFoam.visible = true;
                terrain.coastlineFoam.material.opacity = 0.4;
            }
            if (terrain.skyMesh) {
                terrain.skyMesh.visible = true;
            }
        }

        // Restore location group visibility
        if (this.mathWorld.locationGroup) {
            this.mathWorld.locationGroup.visible = true;
        }

        // Restore fog, sky, and lighting
        this.mathWorld.scene.fog.near = 5000;
        this.mathWorld.scene.fog.far = 20000;
        this.mathWorld.scene.background.set(0xAAD4E6);
        if (this.mathWorld.scene.fog) {
            this.mathWorld.scene.fog.color.set(0xAAD4E6);
        }

        // Restore ambient light
        const ambient = this.mathWorld.scene.children.find(c => c.isAmbientLight);
        if (ambient) {
            ambient.intensity = 0.5;
        }
    }

    /**
     * Drill down into a location node: push current onto stack, show its children
     */
    drillDown(nodeId) {
        const tree = LOCATION_TREE[nodeId];
        if (!tree || tree.children.length === 0) return false;

        this.navStack.push(this.currentNode);
        this.currentNode = nodeId;
        this.showCurrentLevel();

        // Animate camera to focus on this node
        const focusHeight = tree.focusHeight || 15000000;
        let targetPos;

        if (nodeId === 'santaCruz' || this.isSantaCruzChild(nodeId)) {
            // For Santa Cruz level and below, position camera directly above in local coords
            const locData = REGIONAL_LOCATIONS[nodeId] || SANTA_CRUZ_LOCATIONS[nodeId];
            if (locData) {
                const local = gpsToLocal(locData.lat, locData.lon);
                targetPos = new THREE.Vector3(local.x, focusHeight, local.z);
            } else {
                targetPos = new THREE.Vector3(0, focusHeight, 0);
            }
        } else {
            // For globe-level, use spherical positioning
            const focusLat = tree.focusLat || 0;
            const focusLon = tree.focusLon || 0;
            targetPos = this.gpsToGlobePosition(focusLat, focusLon, focusHeight);
        }

        this.animateCameraTo(targetPos, 0.8);
        this.updateOverlay();
        return true;
    }

    /**
     * Go back up one level
     */
    goBack() {
        if (this.navStack.length === 0) {
            this.close();
            return;
        }

        this.currentNode = this.navStack.pop();
        this.showCurrentLevel();

        // Animate camera
        const tree = LOCATION_TREE[this.currentNode];
        let targetPos;
        if (this.currentNode === 'world') {
            targetPos = new THREE.Vector3(0, 15000000, 0);
        } else if (this.currentNode === 'santaCruz' || this.isSantaCruzChild(this.currentNode)) {
            // Local coords for Santa Cruz and below
            const focusHeight = tree ? tree.focusHeight : 16000;
            const locData = REGIONAL_LOCATIONS[this.currentNode] || SANTA_CRUZ_LOCATIONS[this.currentNode];
            if (locData) {
                const local = gpsToLocal(locData.lat, locData.lon);
                targetPos = new THREE.Vector3(local.x, focusHeight, local.z);
            } else {
                targetPos = new THREE.Vector3(0, focusHeight, 0);
            }
        } else if (tree) {
            const focusHeight = tree.focusHeight || 4000000;
            const focusLat = tree.focusLat || 0;
            const focusLon = tree.focusLon || 0;
            targetPos = this.gpsToGlobePosition(focusLat, focusLon, focusHeight);
        } else {
            targetPos = new THREE.Vector3(0, 15000000, 0);
        }

        this.animateCameraTo(targetPos, 0.8);
        this.updateOverlay();
    }

    isSantaCruzChild(nodeId) {
        return SANTA_CRUZ_LOCATIONS[nodeId] !== undefined;
    }

    /**
     * Show only the markers for the current node's children
     */
    showCurrentLevel() {
        const tree = LOCATION_TREE[this.currentNode];
        const childIds = tree ? tree.children : [];

        // Hide all markers first
        Object.values(this.markers).forEach(m => m.visible = false);

        // Show only children of current node
        for (const childId of childIds) {
            if (this.markers[childId]) {
                this.markers[childId].visible = true;
            }
        }
    }

    // ==================== CAMERA ====================

    gpsToGlobePosition(lat, lon, altitude) {
        const phi = (90 - lat) * (Math.PI / 180);
        const theta = lon * (Math.PI / 180);
        const r = this.radius + altitude;

        const p = new THREE.Vector3();
        p.setFromSphericalCoords(r, phi, theta + Math.PI / 2);

        const scLat = 36.97, scLon = -122.03;
        const rotY = new THREE.Matrix4().makeRotationY((-scLon - 90) * (Math.PI / 180));
        const rotX = new THREE.Matrix4().makeRotationX((scLat - 90) * (Math.PI / 180));

        p.applyMatrix4(rotY);
        p.applyMatrix4(rotX);

        return new THREE.Vector3(p.x, p.y - this.radius, p.z);
    }

    animateCameraTo(targetPos, duration) {
        const camera = this.mathWorld.camera;
        const startPos = camera.position.clone();
        const startQuat = camera.quaternion.clone();
        const startTime = performance.now();

        // Target quaternion: looking toward globe center from targetPos
        const targetQuat = new THREE.Quaternion();
        const m = new THREE.Matrix4();
        // Look from targetPos toward (0, -this.radius, 0) which is globe center
        // Use North (-Z) as up for consistency
        const lookTarget = new THREE.Vector3(0, Math.min(0, targetPos.y * 0.3), 0);
        m.lookAt(targetPos, lookTarget, new THREE.Vector3(0, 0, -1));
        targetQuat.setFromRotationMatrix(m);

        const animate = () => {
            if (!this.isActive) return;

            const elapsed = (performance.now() - startTime) / 1000;
            const t = Math.min(elapsed / duration, 1);
            const eased = 1 - Math.pow(1 - t, 3);

            camera.position.lerpVectors(startPos, targetPos, eased);
            camera.quaternion.slerpQuaternions(startQuat, targetQuat, eased);

            if (t < 1) {
                requestAnimationFrame(animate);
            }
        };

        animate();
    }

    // ==================== INTERACTION ====================

    onClick(event) {
        if (!this.isActive) return;

        const rect = this.mathWorld.canvas.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.mathWorld.camera);
        const intersects = this.raycaster.intersectObjects(this.markerGroup.children, true);

        if (intersects.length > 0) {
            let obj = intersects[0].object;
            while (obj.parent && !obj.userData.locationId) {
                obj = obj.parent;
            }

            if (obj.userData.locationId) {
                const locId = obj.userData.locationId;
                const tree = LOCATION_TREE[locId];

                // If this node has children, drill down into it
                if (tree && tree.children.length > 0) {
                    this.drillDown(locId);
                    return;
                }

                // If it's a leaf with content, teleport there
                if (obj.userData.hasContent) {
                    this.selectLocation(locId);
                    return;
                }

                // Locked/no content
                this.showLockedLocation(obj.userData.name);
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

        // Reset marker hover scale
        Object.values(this.markers).forEach(m => {
            m.children.forEach(child => child.scale.setScalar(1));
        });

        if (intersects.length > 0) {
            let obj = intersects[0].object;
            while (obj.parent && !obj.userData.locationId) {
                obj = obj.parent;
            }

            if (obj.userData.locationId) {
                obj.children.forEach(child => child.scale.setScalar(1.3));

                if (this.hoverHint) {
                    const data = obj.userData;
                    const tree = LOCATION_TREE[obj.userData.locationId];
                    const hasChildren = tree && tree.children.length > 0;

                    let status;
                    if (hasChildren) {
                        status = 'Click to explore';
                    } else if (data.hasContent) {
                        status = '✓ Click to visit';
                    } else {
                        status = '🔒 Coming soon';
                    }
                    this.hoverHint.innerHTML = `<strong>${data.name}</strong><br>${data.description || ''}<br><em>${status}</em>`;
                }
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
        let targetId = locationId;
        if (locationId === 'santaCruz') targetId = 'boardwalk';

        const locData = SANTA_CRUZ_LOCATIONS[targetId] || REGIONAL_LOCATIONS[targetId];
        if (!locData || !locData.hasContent) {
            this.showLockedLocation(locData?.name || locationId);
            return;
        }

        this.close();
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

    // ==================== UI ====================

    showOverlay() {
        this.overlay.classList.remove('hidden');
        this.updateOverlay();
    }

    updateOverlay() {
        // Build breadcrumb trail
        const trail = [...this.navStack, this.currentNode];
        const breadcrumbs = trail.map(nodeId => {
            const loc = REGIONAL_LOCATIONS[nodeId] || SANTA_CRUZ_LOCATIONS[nodeId];
            return loc ? loc.name : (nodeId === 'world' ? 'Earth' : nodeId);
        }).join(' > ');

        const canGoBack = this.navStack.length > 0;
        const backText = canGoBack ? 'Press <strong>Escape</strong> to go back' : 'Press <strong>Escape</strong> to close';
        const zoomText = canGoBack ? 'Press <strong>M</strong> to go back' : 'Press <strong>M</strong> to close';

        this.overlay.innerHTML = `
            <div class="atlas-hud">
                <div class="atlas-title">Atlas</div>
                <div class="atlas-level-indicator">
                    <span class="level-location">${breadcrumbs}</span>
                </div>
                <div class="atlas-instructions">
                    Click a marker to explore<br>
                    ${backText}<br>
                    ${zoomText}
                </div>
            </div>
            <div class="atlas-location-hint" id="atlas-hover-hint"></div>
        `;
        this.hoverHint = document.getElementById('atlas-hover-hint');
    }

    hideOverlay() {
        this.overlay.classList.add('hidden');
    }

    // ==================== ANIMATION LOOP ====================

    update(delta) {
        if (!this.isActive) return;

        const cameraHeight = this.mathWorld.camera.position.y;
        const time = performance.now() * 0.001;
        const terrain = this.mathWorld.terrain;

        // ===== SMOOTH MULTI-SCALE CROSSFADE =====
        // The key insight: overlap the fade-out of terrain with the fade-in of the globe
        // so there is always something visible at every altitude.
        //
        // Altitude stages (heights in meters):
        //   0 - 5,000:        Terrain fully visible, globe hidden
        //   5,000 - 20,000:   Terrain starts fading out, globe starts fading in (overlap zone)
        //   20,000 - 100,000: Terrain mostly gone, globe mostly visible
        //   100,000+:         Only globe, transition to space

        // --- Globe fade-in ---
        if (this.globe) {
            const globeStartHeight = 5000;     // Globe begins appearing
            const globeFullHeight = 80000;     // Globe fully opaque

            const shouldBeVisible = cameraHeight >= globeStartHeight * 0.8;
            if (this.globe.visible !== shouldBeVisible) {
                this.globe.visible = shouldBeVisible;
            }

            if (this.globe.visible) {
                // Smooth ease-in for globe opacity
                const t = THREE.MathUtils.clamp(
                    (cameraHeight - globeStartHeight) / (globeFullHeight - globeStartHeight),
                    0.0, 1.0
                );
                // Smooth cubic ease-in
                const eased = t * t * (3 - 2 * t);
                this.globe.material.opacity = eased * 0.95;
            }
        }

        // --- Terrain fade-out ---
        // Terrain fades out as globe fades in, starting a bit later so there's overlap
        if (terrain) {
            const terrainFadeStart = 8000;      // Begin fading terrain
            const terrainFadeEnd = 120000;      // Terrain fully invisible
            const terrainT = THREE.MathUtils.clamp(
                (cameraHeight - terrainFadeStart) / (terrainFadeEnd - terrainFadeStart),
                0.0, 1.0
            );
            // Smooth ease-out
            const terrainFade = 1 - terrainT * terrainT * (3 - 2 * terrainT);

            if (terrain.terrainMesh) {
                terrain.terrainMesh.material.opacity = terrainFade;
                terrain.terrainMesh.visible = terrainFade > 0.01;
            }
            if (terrain.shorelineMesh) {
                terrain.shorelineMesh.material.opacity = terrainFade;
                terrain.shorelineMesh.visible = terrainFade > 0.01;
            }
            if (terrain.oceanMesh) {
                terrain.oceanMesh.material.opacity = terrainFade * 0.8; // base ocean opacity was 0.8
                terrain.oceanMesh.visible = terrainFade > 0.01;
            }
            if (terrain.coastlineFoam) {
                terrain.coastlineFoam.material.opacity = terrainFade * 0.4;
                terrain.coastlineFoam.visible = terrainFade > 0.01;
            }

            // Fade out sky dome so it doesn't interfere with space
            if (terrain.skyMesh) {
                const skyFadeStart = 20000;
                const skyFadeEnd = 150000;
                const skyT = THREE.MathUtils.clamp(
                    (cameraHeight - skyFadeStart) / (skyFadeEnd - skyFadeStart),
                    0.0, 1.0
                );
                terrain.skyMesh.visible = skyT < 0.99;
                if (terrain.skyMesh.material.uniforms) {
                    // Can't directly set opacity on ShaderMaterial, so just hide it
                }
            }

            // Also fade location-specific content (buildings, etc.)
            if (this.mathWorld.locationGroup) {
                const locFadeStart = 3000;
                const locFadeEnd = 20000;
                const locT = THREE.MathUtils.clamp(
                    (cameraHeight - locFadeStart) / (locFadeEnd - locFadeStart),
                    0.0, 1.0
                );
                this.mathWorld.locationGroup.visible = locT < 0.99;
            }
        }

        // --- Sky / space transition ---
        // Start transitioning at 50km, fully space at 1000km
        const spaceFactor = THREE.MathUtils.clamp((cameraHeight - 50000) / 950000, 0, 1);
        const spaceEased = spaceFactor * spaceFactor * (3 - 2 * spaceFactor);
        const skyColor = new THREE.Color(0xAAD4E6).lerp(new THREE.Color(0x010208), spaceEased);
        this.mathWorld.scene.background.copy(skyColor);
        if (this.mathWorld.scene.fog) this.mathWorld.scene.fog.color.copy(skyColor);

        // Boost ambient light in space so globe is visible
        const ambient = this.mathWorld.scene.children.find(c => c.isAmbientLight);
        if (ambient) {
            ambient.intensity = 0.5 + spaceEased * 2.0;
        }

        // Scale fog with altitude so we don't get gray wash at intermediate heights
        if (this.mathWorld.scene.fog) {
            this.mathWorld.scene.fog.near = cameraHeight * 2;
            this.mathWorld.scene.fog.far = cameraHeight * 10;
        }

        // Scale and animate visible markers
        const altitudeScale = 1.0 + THREE.MathUtils.clamp(cameraHeight / 20000, 0, 2000);

        Object.values(this.markers).forEach((marker, i) => {
            if (!marker.visible) return;

            marker.scale.setScalar(altitudeScale);

            // Animate marker visuals
            const pin = marker.children[0];
            const sphere = marker.children[1];
            const ring = marker.children[2];

            if (pin) {
                pin.material.emissiveIntensity = 0.5 + Math.sin(time * 2 + i) * 0.15;
            }
            if (sphere) {
                sphere.material.emissiveIntensity = 0.8 + Math.cos(time * 2.5 + i) * 0.15;
            }
            if (ring) {
                ring.scale.setScalar(1.3 + Math.sin(time * 2 + i) * 0.2);
                ring.material.opacity = 0.5 + Math.sin(time * 3 + i) * 0.2;
            }
        });
    }
}
