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
//
//   world
//     northAmerica
//       western    → norcal → bayArea / santaCruz / yosemite
//                    socal  → santaBarbara / la
//       canada     → banff / montreal / britishColumbia
//       mexico     → cabo / mexicoCity
//       newYork    → nyc
//       illinois   → chicago
//       idaho      → boise
//       hawaii     → maui
//       texas, florida (placeholder states)
//     eurasia
//       europe  → paris / london
//       asia    → tokyo / mumbai / singapore
//     southAmerica
//       brazil  → rioDeJaneiro
//     africa, australia (placeholder continents)
const LOCATION_TREE = {
    world: {
        children: ['northAmerica', 'eurasia', 'southAmerica', 'africa', 'australia']
    },
    northAmerica: {
        children: ['western', 'canada', 'mexico', 'newYork', 'illinois',
                   'idaho', 'hawaii', 'texas', 'florida'],
        focusLat: 45, focusLon: -100, focusHeight: 4000000
    },
    eurasia:      { children: ['europe', 'asia'], focusLat: 50,  focusLon: 40,    focusHeight: 5000000 },
    southAmerica: { children: ['brazil'],         focusLat: -20, focusLon: -60,   focusHeight: 4000000 },
    africa:       { children: [], focusLat: 10,  focusLon: 20,    focusHeight: 4000000 },
    australia:    { children: [], focusLat: -25, focusLon: 135,   focusHeight: 3000000 },

    // Regional layer (under a continent)
    western: {
        children: ['norcal', 'socal'],
        focusLat: 37.0, focusLon: -120.0, focusHeight: 1800000
    },

    // Country-level folders under North America
    canada: {
        children: ['banff', 'montreal', 'britishColumbia'],
        focusLat: 56.13, focusLon: -106.35, focusHeight: 3500000
    },
    mexico: {
        children: ['cabo', 'mexicoCity'],
        focusLat: 23.63, focusLon: -102.55, focusHeight: 2500000
    },

    // Country folders inside Eurasia
    europe: {
        children: ['paris', 'london'],
        focusLat: 50.0, focusLon: 5.0, focusHeight: 2500000
    },
    asia: {
        children: ['tokyo', 'mumbai', 'singapore'],
        focusLat: 30.0, focusLon: 100.0, focusHeight: 4500000
    },

    // Country folder inside South America
    brazil: {
        children: ['rioDeJaneiro'],
        focusLat: -10.0, focusLon: -55.0, focusHeight: 2500000
    },

    // State-level folders / leaves
    newYork:         { children: ['nyc'],     focusLat: 40.71, focusLon: -74.01,  focusHeight: 600000 },
    illinois:        { children: ['chicago'], focusLat: 40.00, focusLon: -89.00,  focusHeight: 600000 },
    idaho:           { children: ['boise'],   focusLat: 44.07, focusLon: -114.74, focusHeight: 600000 },
    hawaii:          { children: ['maui'],    focusLat: 20.80, focusLon: -156.00, focusHeight: 600000 },
    texas:           { children: [],          focusLat: 31.97, focusLon: -99.90,  focusHeight: 600000 },
    britishColumbia: { children: [],          focusLat: 53.73, focusLon: -127.65, focusHeight: 600000 },
    florida:         { children: [],          focusLat: 27.66, focusLon: -81.52,  focusHeight: 600000 },

    // Sub-regions
    norcal: {
        children: ['bayArea', 'santaCruz', 'yosemite'],
        focusLat: 37.4, focusLon: -121.8, focusHeight: 400000
    },
    socal: {
        children: ['santaBarbara', 'la'],
        focusLat: 34.3, focusLon: -118.5, focusHeight: 400000
    },

    // City clusters
    bayArea: {
        children: ['berkeley', 'sanFrancisco', 'oakland', 'paloAlto', 'stanford'],
        focusLat: 37.75, focusLon: -122.40, focusHeight: 80000
    },
    santaCruz: {
        children: ['ucsc', 'boardwalk', 'steamerLane', 'naturalBridges', 'westCliff', 'downtownSC'],
        focusLat: 36.9741, focusLon: -122.0308, focusHeight: 16000
    },
    santaBarbara: {
        children: ['islaVista', 'ucsb', 'downtownSB'],
        focusLat: 34.42, focusLon: -119.70, focusHeight: 20000
    },
    la: {
        children: ['topanga', 'venice', 'ucla', 'laguna'],
        focusLat: 34.05, focusLon: -118.30, focusHeight: 50000
    },

    // Campus group (drills to specific buildings)
    ucsc: {
        children: ['mchenryLibrary'],
        focusLat: 36.9916, focusLon: -122.0583, focusHeight: 4000
    },

    // NorCal city + nature leaves
    berkeley:     { children: [], focusLat: 37.8719, focusLon: -122.2578, focusHeight: 6000 },
    sanFrancisco: { children: [], focusLat: 37.7749, focusLon: -122.4194, focusHeight: 10000 },
    oakland:      { children: [], focusLat: 37.8044, focusLon: -122.2712, focusHeight: 8000 },
    paloAlto:     { children: [], focusLat: 37.4419, focusLon: -122.1430, focusHeight: 8000 },
    stanford:     { children: [], focusLat: 37.4275, focusLon: -122.1697, focusHeight: 6000 },
    yosemite:     { children: [], focusLat: 37.8651, focusLon: -119.5383, focusHeight: 60000 },

    // Santa Barbara area leaves
    islaVista:  { children: [], focusLat: 34.4133, focusLon: -119.8610, focusHeight: 4000 },
    ucsb:       { children: [], focusLat: 34.4140, focusLon: -119.8489, focusHeight: 4000 },
    downtownSB: { children: [], focusLat: 34.4208, focusLon: -119.6982, focusHeight: 4000 },

    // LA area leaves
    topanga: { children: [], focusLat: 34.0934, focusLon: -118.6020, focusHeight: 4000 },
    venice:  { children: [], focusLat: 33.9850, focusLon: -118.4695, focusHeight: 5000 },
    ucla:    { children: [], focusLat: 34.0689, focusLon: -118.4452, focusHeight: 5000 },
    laguna:  { children: [], focusLat: 33.5427, focusLon: -117.7854, focusHeight: 5000 },

    // North America leaves (non-California)
    nyc:      { children: [], focusLat: 40.7128, focusLon: -74.0060,  focusHeight: 20000 },
    chicago:  { children: [], focusLat: 41.8781, focusLon: -87.6298,  focusHeight: 15000 },
    boise:    { children: [], focusLat: 43.6150, focusLon: -116.2023, focusHeight: 10000 },
    maui:     { children: [], focusLat: 20.7984, focusLon: -156.3319, focusHeight: 40000 },
    banff:    { children: [], focusLat: 51.1784, focusLon: -115.5708, focusHeight: 60000 },
    montreal: { children: [], focusLat: 45.5017, focusLon: -73.5673,  focusHeight: 12000 },
    cabo:     { children: [], focusLat: 22.8905, focusLon: -109.9167, focusHeight: 12000 },
    mexicoCity: { children: [], focusLat: 19.4326, focusLon: -99.1332, focusHeight: 20000 },

    // Europe leaves
    paris:  { children: [], focusLat: 48.8566, focusLon: 2.3522,  focusHeight: 15000 },
    london: { children: [], focusLat: 51.5074, focusLon: -0.1278, focusHeight: 15000 },

    // Asia leaves
    tokyo:     { children: [], focusLat: 35.6762, focusLon: 139.6503, focusHeight: 25000 },
    mumbai:    { children: [], focusLat: 19.0760, focusLon: 72.8777,  focusHeight: 18000 },
    singapore: { children: [], focusLat: 1.3521,  focusLon: 103.8198, focusHeight: 10000 },

    // South America leaves
    rioDeJaneiro: { children: [], focusLat: -22.9068, focusLon: -43.1729, focusHeight: 20000 }
};

export class Atlas {
    constructor(mathWorld) {
        this.mathWorld = mathWorld;
        this.isActive = false;

        // Navigation state
        this.currentNode = 'world';  // Current drill-down node
        this.navStack = [];          // Stack of parent nodes for back-navigation
        this.selectedIndex = 0;      // Keyboard/mouse-highlighted child in current folder

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
        if (!this.isActive) return false;

        if (e.code === 'Escape') {
            this.goBack();
            return true;
        }

        const children = this.getCurrentChildrenIds();

        if (e.code === 'ArrowDown' || e.code === 'KeyJ') {
            if (children.length === 0) return true;
            this.selectedIndex = (this.selectedIndex + 1) % children.length;
            this.refreshListSelection(true);
            return true;
        }
        if (e.code === 'ArrowUp' || e.code === 'KeyK') {
            if (children.length === 0) return true;
            this.selectedIndex = (this.selectedIndex - 1 + children.length) % children.length;
            this.refreshListSelection(true);
            return true;
        }
        if (e.code === 'Enter' || e.code === 'NumpadEnter') {
            if (children.length === 0) return true;
            const id = children[this.selectedIndex];
            if (id) this.activateChild(id);
            return true;
        }
        // Swallow other movement/action keys so they don't leak to the page
        // (player is disabled, but keeping focus semantics tidy).
        if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
            return true;
        }
        return false;
    }

    // ---------- Children / selection helpers ----------

    getCurrentChildrenIds() {
        const tree = LOCATION_TREE[this.currentNode];
        return tree ? tree.children : [];
    }

    getLocationMeta(id) {
        return REGIONAL_LOCATIONS[id] || SANTA_CRUZ_LOCATIONS[id] || null;
    }

    /**
     * folder — has children, user can drill down
     * leaf   — no children but hasContent, user can visit
     * locked — neither (greyed out)
     */
    childStatus(id) {
        const tree = LOCATION_TREE[id];
        const meta = this.getLocationMeta(id);
        const hasChildren = !!(tree && tree.children.length > 0);
        const hasContent = !!(meta && meta.hasContent);
        if (hasChildren) return 'folder';
        if (hasContent) return 'leaf';
        return 'locked';
    }

    activateChild(id) {
        const status = this.childStatus(id);
        if (status === 'folder') {
            this.drillDown(id);
        } else if (status === 'leaf') {
            this.selectLocation(id);
        } else {
            this.flashLocked(id);
        }
    }

    clampSelectedIndex() {
        const children = this.getCurrentChildrenIds();
        if (children.length === 0) {
            this.selectedIndex = 0;
        } else {
            this.selectedIndex = Math.max(0, Math.min(this.selectedIndex, children.length - 1));
        }
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

        // Start at the city-cluster level matching the player's current region.
        // Both santaCruz and bayArea sit at the same depth in the tree so the
        // nav stack is the same up to that level.
        const currentRegion = this.mathWorld.currentRegion;
        const startNode = (currentRegion === 'bayArea') ? 'bayArea' : 'santaCruz';
        this.currentNode = startNode;
        this.navStack = ['world', 'northAmerica', 'western', 'norcal'];
        this.selectedIndex = 0;

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

        // Animate to the starting cluster view.
        const startTree = LOCATION_TREE[startNode];
        let targetPos;
        if (startNode === 'santaCruz') {
            // SC scene uses local coords; put camera directly above SC origin.
            const local = gpsToLocal(startTree.focusLat, startTree.focusLon);
            targetPos = new THREE.Vector3(local.x, startTree.focusHeight, local.z);
        } else {
            // Bay Area (and anything else) uses spherical globe coords.
            targetPos = this.gpsToGlobePosition(
                startTree.focusLat, startTree.focusLon, startTree.focusHeight
            );
        }
        this.animateCameraTo(targetPos, 1.0);

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
        this.selectedIndex = 0;
        this.showCurrentLevel();

        // Animate camera to focus on this node
        const focusHeight = tree.focusHeight || 15000000;
        let targetPos;

        targetPos = this.resolveCameraTarget(nodeId, tree, focusHeight);

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
        this.selectedIndex = 0;
        this.showCurrentLevel();

        const tree = LOCATION_TREE[this.currentNode];
        let targetPos;
        if (this.currentNode === 'world') {
            targetPos = new THREE.Vector3(0, 15000000, 0);
        } else if (tree) {
            const focusHeight = tree.focusHeight || 4000000;
            targetPos = this.resolveCameraTarget(this.currentNode, tree, focusHeight);
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
     * Compute the target camera position for a node.
     *
     * For Santa Cruz and its children we position the camera in SC local
     * coordinates — but ONLY when the currently loaded scene is actually the
     * Santa Cruz region. Otherwise we fall back to the globe projection so the
     * camera lands on the matching point of the virtual globe instead of flying
     * into empty space.
     */
    resolveCameraTarget(nodeId, tree, focusHeight) {
        const isSCNode = nodeId === 'santaCruz' || this.isSantaCruzChild(nodeId);
        const sceneIsSC = this.mathWorld.currentRegion === 'santaCruz';

        if (isSCNode && sceneIsSC) {
            const locData = REGIONAL_LOCATIONS[nodeId] || SANTA_CRUZ_LOCATIONS[nodeId];
            if (locData) {
                const local = gpsToLocal(locData.lat, locData.lon);
                return new THREE.Vector3(local.x, focusHeight, local.z);
            }
            return new THREE.Vector3(0, focusHeight, 0);
        }

        const focusLat = (tree && tree.focusLat) || 0;
        const focusLon = (tree && tree.focusLon) || 0;
        return this.gpsToGlobePosition(focusLat, focusLon, focusHeight);
    }

    /**
     * Show only the markers for the current node's children
     */
    showCurrentLevel() {
        const tree = LOCATION_TREE[this.currentNode];
        const childIds = tree ? tree.children : [];

        // Hide all markers first and clear any stale highlight.
        Object.values(this.markers).forEach(m => {
            m.visible = false;
            m.userData.__highlight = 1.0;
        });

        // Show only children of current node
        for (const childId of childIds) {
            if (this.markers[childId]) {
                this.markers[childId].visible = true;
            }
        }

        this.updateSelectedMarkerHighlight();
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

        const locId = this.pickMarker(event);
        if (!locId) return;

        // Sync list selection to the clicked marker, then activate it.
        const children = this.getCurrentChildrenIds();
        const idx = children.indexOf(locId);
        if (idx >= 0) this.selectedIndex = idx;
        this.activateChild(locId);
        this.refreshListSelection(false);
    }

    onMouseMove(event) {
        if (!this.isActive) return;

        const locId = this.pickMarker(event);

        // Reset marker hover scale for all markers first.
        Object.values(this.markers).forEach(m => {
            m.children.forEach(child => child.scale.setScalar(1));
        });

        if (locId) {
            const marker = this.markers[locId];
            if (marker) marker.children.forEach(child => child.scale.setScalar(1.3));

            const meta = this.getLocationMeta(locId);
            const status = this.childStatus(locId);
            if (this.hoverHint && meta) {
                const statusText = status === 'folder'
                    ? 'Click or press Enter to explore'
                    : status === 'leaf'
                    ? '✓ Click or press Enter to visit'
                    : '🔒 Coming soon';
                this.hoverHint.innerHTML =
                    `<strong>${meta.name}</strong><br>${meta.description || ''}<br><em>${statusText}</em>`;
            }
            this.mathWorld.canvas.style.cursor = status === 'locked' ? 'not-allowed' : 'pointer';

            // Sync keyboard selection with the hovered marker, if it's a child of the current folder.
            const children = this.getCurrentChildrenIds();
            const idx = children.indexOf(locId);
            if (idx >= 0 && idx !== this.selectedIndex) {
                this.selectedIndex = idx;
                this.refreshListSelection(false);
            }
        } else {
            if (this.hoverHint) this.hoverHint.innerHTML = '';
            this.mathWorld.canvas.style.cursor = 'default';
        }
    }

    /**
     * Raycast into marker group and return the hit location id, or null.
     */
    pickMarker(event) {
        const rect = this.mathWorld.canvas.getBoundingClientRect();
        this.mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
        this.mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

        this.raycaster.setFromCamera(this.mouse, this.mathWorld.camera);
        const intersects = this.raycaster.intersectObjects(this.markerGroup.children, true);
        if (intersects.length === 0) return null;

        let obj = intersects[0].object;
        while (obj.parent && !obj.userData.locationId) obj = obj.parent;
        return obj.userData.locationId || null;
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
        const nameFor = (nodeId) => {
            const loc = this.getLocationMeta(nodeId);
            return loc ? loc.name : (nodeId === 'world' ? 'Earth' : nodeId);
        };

        const currentName = nameFor(this.currentNode);
        const breadcrumbs = this.navStack.map(nameFor).join(' › ');

        const childIds = this.getCurrentChildrenIds();
        this.clampSelectedIndex();
        const canGoBack = this.navStack.length > 0;

        const STATUS_ICON = { folder: '▸', leaf: '✦', locked: '✕' };
        const STATUS_LABEL = { folder: 'Explore', leaf: 'Visit', locked: 'Locked' };

        const listHTML = childIds.length === 0
            ? '<li class="atlas-list-empty">Nothing to explore here.</li>'
            : childIds.map((id, i) => {
                const meta = this.getLocationMeta(id);
                const status = this.childStatus(id);
                const sel = i === this.selectedIndex ? ' selected' : '';
                const label = (meta && meta.name) || id;
                return (
                    `<li class="atlas-list-item ${status}${sel}" data-loc-id="${id}" data-index="${i}">` +
                        `<span class="atlas-list-icon ${status}">${STATUS_ICON[status]}</span>` +
                        `<span class="atlas-list-name">${label}</span>` +
                        `<span class="atlas-list-badge ${status}">${STATUS_LABEL[status]}</span>` +
                    `</li>`
                );
            }).join('');

        const upLabel = canGoBack ? 'Up' : 'Close';

        this.overlay.innerHTML = `
            <div class="atlas-panel-rt">
                ${breadcrumbs ? `<div class="atlas-breadcrumbs">${breadcrumbs}</div>` : ''}
                <div class="atlas-current">${currentName}</div>
                <ul class="atlas-list">${listHTML}</ul>
                <div class="atlas-legend">
                    <span><kbd>↑</kbd><kbd>↓</kbd> Select</span>
                    <span><kbd>↵</kbd> Go</span>
                    <span><kbd>M</kbd>/<kbd>Esc</kbd> ${upLabel}</span>
                </div>
            </div>
            <div class="atlas-location-hint" id="atlas-hover-hint"></div>
        `;
        this.hoverHint = document.getElementById('atlas-hover-hint');

        // Wire up list row interactions.
        this.overlay.querySelectorAll('.atlas-list-item').forEach(li => {
            const index = parseInt(li.dataset.index, 10);
            const id = li.dataset.locId;
            li.addEventListener('click', (ev) => {
                ev.stopPropagation();
                this.selectedIndex = index;
                this.activateChild(id);
                this.refreshListSelection(false);
            });
            li.addEventListener('mouseenter', () => {
                if (this.selectedIndex !== index) {
                    this.selectedIndex = index;
                    this.refreshListSelection(false);
                }
            });
        });
    }

    /**
     * Update selected-class without rebuilding the whole list.
     * Optionally scrolls the selected row into view (for keyboard nav).
     */
    refreshListSelection(scrollIntoView = false) {
        if (!this.overlay) return;
        const items = this.overlay.querySelectorAll('.atlas-list-item');
        items.forEach((li, i) => {
            li.classList.toggle('selected', i === this.selectedIndex);
        });
        if (scrollIntoView) {
            const el = items[this.selectedIndex];
            if (el && typeof el.scrollIntoView === 'function') {
                el.scrollIntoView({ block: 'nearest' });
            }
        }
        this.updateSelectedMarkerHighlight();
    }

    /**
     * Visually emphasize the 3D marker that matches the keyboard-selected child.
     */
    updateSelectedMarkerHighlight() {
        const children = this.getCurrentChildrenIds();
        const selectedId = children[this.selectedIndex];
        children.forEach(id => {
            const marker = this.markers[id];
            if (!marker) return;
            const emphasis = id === selectedId ? 1.35 : 1.0;
            marker.userData.__highlight = emphasis;
        });
    }

    flashLocked(id) {
        if (!this.overlay) return;
        const item = this.overlay.querySelector(`.atlas-list-item[data-loc-id="${id}"]`);
        if (item) {
            item.classList.remove('flash-locked');
            void item.offsetWidth;      // restart the animation
            item.classList.add('flash-locked');
        }
        if (this.hoverHint) {
            const meta = this.getLocationMeta(id);
            const name = meta ? meta.name : id;
            this.hoverHint.innerHTML = `<div class="locked-alert">🔒 <strong>${name}</strong> isn't available yet.</div>`;
            clearTimeout(this._lockedClearTimer);
            this._lockedClearTimer = setTimeout(() => {
                if (this.hoverHint) this.hoverHint.innerHTML = '';
            }, 1500);
        }
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

            const highlight = marker.userData.__highlight || 1.0;
            marker.scale.setScalar(altitudeScale * highlight);

            // Animate marker visuals
            const pin = marker.children[0];
            const sphere = marker.children[1];
            const ring = marker.children[2];

            const selectedBoost = highlight > 1.01 ? 0.35 : 0;

            if (pin) {
                pin.material.emissiveIntensity = 0.5 + Math.sin(time * 2 + i) * 0.15 + selectedBoost;
            }
            if (sphere) {
                sphere.material.emissiveIntensity = 0.8 + Math.cos(time * 2.5 + i) * 0.15 + selectedBoost;
            }
            if (ring) {
                const basePulse = 1.3 + Math.sin(time * 2 + i) * 0.2;
                ring.scale.setScalar(highlight > 1.01 ? basePulse * 1.2 : basePulse);
                ring.material.opacity = 0.5 + Math.sin(time * 3 + i) * 0.2 + selectedBoost;
            }
        });
    }
}
