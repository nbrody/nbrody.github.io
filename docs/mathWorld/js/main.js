/**
 * Math World - Main Entry Point
 * Aerial view of Santa Cruz with zoom to McHenry Library
 */

import * as THREE from 'three';
import { SantaCruzTerrain, gpsToLocal, getElevation, SC_SIZE, SC_CENTER } from './santaCruz/santaCruz.js';
import { Player } from './player.js';
import { Atlas } from './atlas.js';
import { MobileControls } from './mobileControls.js';
import {
    SANTA_CRUZ_LOCATIONS,
    UCSCCampus,
    SteamerLane,
    BeachBoardwalk
} from './santaCruz/index.js';
import { REGIONAL_LOCATIONS } from './regionalLocations.js';

class MathWorld {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;

        this.terrain = null;
        this.player = null;
        this.atlas = null;
        this.mobileControls = null;

        // Location management
        this.currentLocationId = null;
        this.currentLocation = null;
        this.locationGroup = null;
        this.locationContent = null;

        this.isRunning = false;
        this.isAnimating = false;
        this.clock = new THREE.Clock();

        // Intro state
        this.introPhase = 'aerial'; // 'aerial' | 'zooming' | 'ready'
        this.zoomProgress = 0;
        this.zoomDuration = 4.0;

        // Camera positions
        this.aerialPosition = null;
        this.groundPosition = null;
        this.mchenryLocalPos = null;

        // DOM Elements
        this.canvas = document.getElementById('game-canvas');
        this.loadingScreen = document.getElementById('loading-screen');
        this.startScreen = document.getElementById('start-screen');
        this.startButton = document.getElementById('start-button');
        this.uiOverlay = document.getElementById('ui-overlay');
        this.controlsHint = document.getElementById('controls-hint');
        this.locationIndicator = document.getElementById('location-indicator');
        this.clickToLook = document.getElementById('click-to-look');

        this.init();
    }

    async init() {
        try {
            this.setupRenderer();
            this.setupScene();
            this.setupCamera();

            // Create Santa Cruz terrain
            this.terrain = new SantaCruzTerrain(this.scene);
            await this.terrain.generate();

            // Get McHenry Library position
            this.mchenryLocalPos = this.terrain.getLocalPosition('mchenryLibrary');

            // Calculate camera positions
            this.calculateCameraPositions();

            // Position camera for aerial view
            this.camera.position.copy(this.aerialPosition);
            this.camera.lookAt(new THREE.Vector3(0, 0, 0));

            // Create player (initially disabled)
            this.player = new Player(this.camera, this.canvas, this, null);

            // Create Atlas
            try {
                this.atlas = new Atlas(this);
            } catch (e) {
                console.error('Failed to initialize Atlas:', e);
                // Create a dummy atlas if it fails to prevent complete crash
                this.atlas = {
                    isActive: false,
                    update: () => { },
                    handleKeyDown: () => false,
                    open: () => { },
                    close: () => { }
                };
            }

            // Create Mobile Controls
            this.mobileControls = new MobileControls(this.player, this);
            this.player.setMobileControls(this.mobileControls);

            this.setupEventListeners();
            this.loadingScreen.classList.add('hidden');
            this.animate();
        } catch (e) {
            console.error('MathWorld initialization failed:', e);
            const subtitle = this.loadingScreen?.querySelector('.loader-subtitle');
            if (subtitle) {
                subtitle.textContent = 'Load failed. Open console for details.';
            }
        }
    }

    calculateCameraPositions() {
        // Aerial view - higher altitude and further south to see the bay and mountains
        this.aerialPosition = new THREE.Vector3(
            -5000,        // Off-center X for more dynamic angle
            6000,         // 6km altitude (was 3km)
            8000          // Positioned slightly south over the water, looking north toward campus
        );

        // Ground position at McHenry Library
        this.groundPosition = new THREE.Vector3(
            this.mchenryLocalPos.x,
            this.mchenryLocalPos.y + 1.7, // Eye height
            this.mchenryLocalPos.z + 12   // Slightly in front of library
        );
    }

    async loadLocation(locationId) {
        const locData = SANTA_CRUZ_LOCATIONS[locationId] || REGIONAL_LOCATIONS[locationId];
        if (!locData) {
            console.error(`Location not found: ${locationId}`);
            return;
        }

        // Remove old location group
        if (this.locationGroup) {
            this.scene.remove(this.locationGroup);
        }

        // Create new location group
        this.locationGroup = new THREE.Group();

        // Position at the location's coordinates
        const local = gpsToLocal(locData.lat, locData.lon);
        const elevation = getElevation(locData.lat, locData.lon);
        this.locationGroup.position.set(local.x, elevation, local.z);

        this.scene.add(this.locationGroup);

        // Create terrain height function for local content
        // Converts local (relative to locationGroup) coords to world elevation
        const localTerrainFn = (x, z) => {
            const worldX = this.locationGroup.position.x + x;
            const worldZ = this.locationGroup.position.z + z;
            const worldElevation = this.terrain.getElevationAtLocal(worldX, worldZ);
            // Return relative to locationGroup origin
            return worldElevation - this.locationGroup.position.y;
        };

        // Create location-specific content
        switch (locationId) {
            case 'mchenryLibrary':
                this.locationContent = new UCSCCampus(this.locationGroup, localTerrainFn);
                break;
            case 'steamerLane':
                this.locationContent = new SteamerLane(this.locationGroup, localTerrainFn);
                break;
            case 'boardwalk':
                this.locationContent = new BeachBoardwalk(this.locationGroup, localTerrainFn);
                break;
            case 'berkeley':
                this.locationContent = this.createBerkeleyPlaceholder(this.locationGroup);
                break;
        }

        if (this.locationContent && this.locationContent.generate) {
            await this.locationContent.generate();
        }

        this.currentLocationId = locationId;
        this.currentLocation = locData;

        console.log(`Loaded location: ${locData.name}`);
    }

    createBerkeleyPlaceholder(group) {
        // Simple geometric placeholder for Berkeley
        const ground = new THREE.Mesh(
            new THREE.CylinderGeometry(50, 50, 1, 32),
            new THREE.MeshStandardMaterial({ color: 0x3A6B35 })
        );
        group.add(ground);

        // A stylized Campanile tower
        const tower = new THREE.Group();
        const base = new THREE.Mesh(new THREE.BoxGeometry(4, 30, 4), new THREE.MeshStandardMaterial({ color: 0xDDDDDD }));
        base.position.y = 15;
        tower.add(base);
        const top = new THREE.Mesh(new THREE.ConeGeometry(3, 8, 4), new THREE.MeshStandardMaterial({ color: 0x555555 }));
        top.position.y = 34;
        top.rotation.y = Math.PI / 4;
        tower.add(top);
        tower.position.set(0, 0, -20);
        group.add(tower);

        // Berkeley Sign
        const sign = new THREE.Mesh(new THREE.BoxGeometry(6, 2, 0.5), new THREE.MeshStandardMaterial({ color: 0x003262 }));
        sign.position.set(0, 5, -10);
        group.add(sign);

        return { generate: async () => { }, getInteractables: () => [] };
    }

    setupRenderer() {
        this.renderer = new THREE.WebGLRenderer({
            canvas: this.canvas,
            antialias: true,
            alpha: false,
            logarithmicDepthBuffer: true
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        this.renderer.shadowMap.enabled = true;
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.0;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    }

    setupScene() {
        this.scene = new THREE.Scene();
        this.scene.background = new THREE.Color(0xAAD4E6);
        // Pushed fog back significantly to allow seeing the new 100km terrain range
        this.scene.fog = new THREE.Fog(0xAAD4E6, 20000, 150000);
    }

    setupCamera() {
        this.camera = new THREE.PerspectiveCamera(
            60,
            window.innerWidth / window.innerHeight,
            0.1,  // Near clipping
            100000000 // Increased far clipping for high-altitude Atlas views
        );
    }

    setupEventListeners() {
        this.startButton.addEventListener('click', () => this.beginZoom());
        window.addEventListener('resize', () => this.onResize());
        document.addEventListener('pointerlockchange', () => this.onPointerLockChange());
        document.addEventListener('keydown', (e) => this.onKeyDown(e));

        // Click on canvas to request pointer lock (for mouse look)
        this.canvas.addEventListener('click', () => this.requestPointerLock());
    }

    requestPointerLock() {
        if (this.introPhase === 'ready' && !document.pointerLockElement && !this.atlas.isActive) {
            this.canvas.requestPointerLock().catch(err => {
                console.log('Pointer lock request failed:', err);
            });
        }
    }

    async beginZoom() {
        if (this.introPhase !== 'aerial') return;

        // Load McHenry Library content
        await this.loadLocation('mchenryLibrary');

        this.introPhase = 'zooming';
        this.isAnimating = true;
        this.zoomProgress = 0;
        this.startScreen.classList.add('hidden');

        setTimeout(() => {
            this.showLocation('McHenry Library - UC Santa Cruz');
        }, this.zoomDuration * 1000 - 500);
    }

    showLocation(name) {
        const locationName = document.getElementById('location-name');
        if (locationName) locationName.textContent = name;
        this.locationIndicator.classList.add('visible');
        setTimeout(() => this.locationIndicator.classList.remove('visible'), 4000);
    }

    updateZoom(delta) {
        this.zoomProgress += delta / this.zoomDuration;

        const t = Math.min(this.zoomProgress, 1);

        // Smooth easing
        const ease = t < 0.5
            ? 4 * t * t * t
            : 1 - Math.pow(-2 * t + 2, 3) / 2;

        // Interpolate position
        const currentPos = new THREE.Vector3().lerpVectors(
            this.aerialPosition,
            this.groundPosition,
            ease
        );

        this.camera.position.copy(currentPos);

        // Look at McHenry area during early zoom, then look forward at end
        const lookTarget = new THREE.Vector3(
            this.mchenryLocalPos.x,
            this.mchenryLocalPos.y + 5 * (1 - ease), // Start looking at building, end looking ahead
            this.mchenryLocalPos.z - 50 * ease        // Look further ahead as we land
        );
        this.camera.lookAt(lookTarget);

        if (this.zoomProgress >= 1) {
            this.completeZoom();
        }
    }

    completeZoom() {
        this.introPhase = 'ready';
        this.isAnimating = false;

        // Final camera position
        this.camera.position.copy(this.groundPosition);

        // Enable player controls
        this.isRunning = true;
        this.uiOverlay.classList.add('active');
        this.player.setLocationGroup(this.locationGroup);

        // Sync player orientation from where the camera ended up during zoom
        // This prevents the jarring camera flip
        this.player.syncOrientationFromCamera();
        this.player.setPositionOnGround(0, 1.7, 12, true);  // preserveOrientation = true
        this.player.setTerrainFunction((x, z) => {
            // Get terrain height at world position
            const worldX = this.locationGroup.position.x + x;
            const worldZ = this.locationGroup.position.z + z;
            const worldElevation = this.terrain.getElevationAtLocal(worldX, worldZ);
            // Return height relative to locationGroup origin (which is at the center elevation)
            return worldElevation - this.locationGroup.position.y;
        });
        this.player.enable();

        // Enable mobile controls if on touch device
        if (this.mobileControls && this.mobileControls.isTouch()) {
            this.mobileControls.enable();
        }

        console.log('Player controls enabled at McHenry Library!');

        // Request pointer lock for mouse look (desktop only)
        if (!this.mobileControls || !this.mobileControls.isTouch()) {
            this.requestPointerLock();
        }
    }

    getInteractables() {
        if (this.locationContent && this.locationContent.getInteractables) {
            return this.locationContent.getInteractables();
        }
        return [];
    }

    async teleportTo(locationId) {
        if (locationId === this.currentLocationId) return;

        this.player.disable();
        this.isRunning = false;

        await this.loadLocation(locationId);

        // Get new ground position
        const locData = SANTA_CRUZ_LOCATIONS[locationId] || REGIONAL_LOCATIONS[locationId];
        const local = gpsToLocal(locData.lat, locData.lon);
        // Fallback for elevation if outside terrain bounds
        let elevation = 0;
        try {
            elevation = getElevation(locData.lat, locData.lon);
        } catch (e) {
            elevation = 0;
        }

        // Position based on location type
        let spawnX = 0, spawnZ = -12;
        let faceTowardZ = -50;

        if (locationId === 'steamerLane') {
            spawnX = 20; spawnZ = 5; faceTowardZ = 80;
        } else if (locationId === 'boardwalk') {
            spawnX = 0; spawnZ = -20; faceTowardZ = 50;
        } else if (locationId === 'berkeley') {
            spawnX = 0; spawnZ = 15; faceTowardZ = -20;
        }

        this.camera.position.set(local.x + spawnX, elevation + 1.7, local.z + spawnZ);

        this.player.setLocationGroup(this.locationGroup);
        this.player.setPositionOnGround(spawnX, 1.7, spawnZ);
        this.player.setTerrainFunction((x, z) => {
            const worldX = this.locationGroup.position.x + x;
            const worldZ = this.locationGroup.position.z + z;
            const worldElevation = this.terrain.getElevationAtLocal(worldX, worldZ);
            return worldElevation - this.locationGroup.position.y;
        });

        // Set initial camera orientation based on location
        if (locationId === 'steamerLane') {
            // Face south (toward ocean)
            this.camera.lookAt(new THREE.Vector3(local.x + spawnX, elevation + 1.7, local.z + faceTowardZ));
        }

        this.isRunning = true;
        this.player.enable();

        // Keep mobile controls enabled if on touch device
        if (this.mobileControls && this.mobileControls.isTouch()) {
            this.mobileControls.enable();
        }

        this.showLocation(`${locData.name} - Santa Cruz`);
    }

    onPointerLockChange() {
        if (document.pointerLockElement === this.canvas) {
            console.log('Pointer locked - mouse look enabled');
            // Hide the click-to-look prompt
            this.clickToLook.classList.add('hidden');

            // Make sure player is enabled when we have pointer lock
            if (this.introPhase === 'ready' && !this.isRunning) {
                this.isRunning = true;
                this.uiOverlay.classList.add('active');
                this.player.enable();
                this.startScreen.classList.add('hidden');
            }
        } else {
            console.log('Pointer unlocked - click to resume mouse look');
            // Show the click-to-look prompt if game is running (desktop only)
            if (this.introPhase === 'ready' && this.isRunning) {
                // Don't show on mobile or when Atlas is open
                if ((!this.mobileControls || !this.mobileControls.isTouch()) && !this.atlas.isActive) {
                    this.clickToLook.classList.remove('hidden');
                }
            }
        }
    }

    onKeyDown(e) {
        // Atlas handles its own keys (M, Escape)
        if (this.introPhase === 'ready' && this.atlas.handleKeyDown(e)) {
            return;
        }

        if (!this.isRunning) return;

        if (e.code === 'KeyH') this.controlsHint.classList.toggle('hidden');

        // Teleport keys (quick access)
        if (e.code === 'Digit1') this.teleportTo('mchenryLibrary');
        if (e.code === 'Digit2') this.teleportTo('steamerLane');
        if (e.code === 'Digit3') this.teleportTo('boardwalk');
    }

    onResize() {
        this.camera.aspect = window.innerWidth / window.innerHeight;
        this.camera.updateProjectionMatrix();
        this.renderer.setSize(window.innerWidth, window.innerHeight);
    }

    animate() {
        requestAnimationFrame(() => this.animate());
        const delta = this.clock.getDelta();

        if (this.introPhase === 'zooming') {
            this.updateZoom(delta);
        } else if (this.atlas.isActive) {
            // Atlas mode - update marker animations
            this.atlas.update(delta);
        } else if (this.isRunning) {
            this.player.update(delta);
        } else if (this.introPhase === 'aerial') {
            // Gentle camera drift over the Monterey Bay
            const time = this.clock.getElapsedTime();
            this.camera.position.x = this.aerialPosition.x + Math.sin(time * 0.1) * 2000;
            this.camera.position.z = this.aerialPosition.z + Math.cos(time * 0.08) * 1500;
            // Look toward the UCSC campus area
            this.camera.lookAt(new THREE.Vector3(this.mchenryLocalPos.x, 200, this.mchenryLocalPos.z));
        }

        this.renderer.render(this.scene, this.camera);
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.mathWorld = new MathWorld();
});
