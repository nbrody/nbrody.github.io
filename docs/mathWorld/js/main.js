/**
 * Math World - Main Entry Point
 * Aerial view of Santa Cruz with zoom to McHenry Library
 */

import * as THREE from 'three';
import {
    SantaCruzTerrain,
    gpsToLocal as scGpsToLocal,
    getElevation as scGetElevation
} from './santaCruz/santaCruz.js';
import {
    BayAreaTerrain,
    gpsToLocal as baGpsToLocal,
    getElevation as baGetElevation
} from './bayArea/bayArea.js';
import {
    SantaBarbaraTerrain,
    UCSBCampus,
    DowntownSB,
    gpsToLocal as sbGpsToLocal,
    getElevation as sbGetElevation
} from './santaBarbara/index.js';
import {
    LABasinTerrain,
    TopangaCanyon,
    VeniceBeach,
    gpsToLocal as laGpsToLocal,
    getElevation as laGetElevation
} from './laBasin/index.js';
import { Player } from './player.js';
import { Atlas } from './atlas.js';
import { MobileControls } from './mobileControls.js';
import {
    SANTA_CRUZ_LOCATIONS,
    UCSCCampus,
    SteamerLane,
    BeachBoardwalk
} from './santaCruz/index.js';
import { UCBerkeleyCampus } from './berkeley/index.js';
import { REGIONAL_LOCATIONS } from './regionalLocations.js';

// Mapping: location → region. Each region has its own regional terrain,
// its own coordinate system (GPS ↔ local), and its own elevation function.
const LOCATION_REGIONS = {
    // Santa Cruz region (santaCruz regional terrain)
    santaCruz: 'santaCruz',
    ucsc: 'santaCruz',
    mchenryLibrary: 'santaCruz',
    steamerLane: 'santaCruz',
    boardwalk: 'santaCruz',
    naturalBridges: 'santaCruz',
    westCliff: 'santaCruz',
    downtownSC: 'santaCruz',

    // Bay Area region (bayArea regional terrain)
    bayArea: 'bayArea',
    berkeley: 'bayArea',
    sanFrancisco: 'bayArea',
    oakland: 'bayArea',
    paloAlto: 'bayArea',
    marin: 'bayArea',

    // Santa Barbara region (santaBarbara regional terrain)
    santaBarbara: 'santaBarbara',
    ucsb: 'santaBarbara',
    islaVista: 'santaBarbara',
    downtownSB: 'santaBarbara',

    // LA Basin region (laBasin regional terrain)
    la: 'laBasin',
    topanga: 'laBasin',
    venice: 'laBasin',
    ucla: 'laBasin',
    laguna: 'laBasin'
};

const REGION_COORDS = {
    santaCruz: { gpsToLocal: scGpsToLocal, getElevation: scGetElevation },
    bayArea: { gpsToLocal: baGpsToLocal, getElevation: baGetElevation },
    santaBarbara: { gpsToLocal: sbGpsToLocal, getElevation: sbGetElevation },
    laBasin: { gpsToLocal: laGpsToLocal, getElevation: laGetElevation }
};

function getRegionForLocation(locationId) {
    return LOCATION_REGIONS[locationId] || 'santaCruz';
}

class MathWorld {
    constructor() {
        this.scene = null;
        this.camera = null;
        this.renderer = null;

        this.terrain = null;
        this.currentRegion = null; // 'santaCruz' | 'bayArea'
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

        // HUD + pause menu
        this.hud = document.getElementById('hud');
        this.compassDial = document.getElementById('compass-dial');
        this.compassHeading = document.getElementById('compass-heading');
        this.altValue = document.getElementById('alt-value');
        this.speedIndicator = document.getElementById('speed-indicator');
        this.speedValue = document.getElementById('speed-value');
        this.speedBarFill = document.getElementById('speed-bar-fill');
        this.fpsCounter = document.getElementById('fps-counter');
        this.pauseMenu = document.getElementById('pause-menu');

        // FPS tracking
        this.fpsVisible = false;
        this.fpsFrameCount = 0;
        this.fpsElapsed = 0;
        this.fpsLastValue = 60;

        // Pause state
        this.isPaused = false;

        // Cached direction vector to avoid allocations in the hot path
        this._fwd = new THREE.Vector3();

        this.init();
    }

    async init() {
        try {
            this.setupRenderer();
            this.setupScene();
            this.setupCamera();

            // Create Santa Cruz terrain (default starting region)
            this.terrain = new SantaCruzTerrain(this.scene);
            this.currentRegion = 'santaCruz';
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
            const status = this.loadingScreen?.querySelector('.welcome-status');
            if (status) {
                status.textContent = 'Load failed — open console for details';
            }
            const tagline = this.loadingScreen?.querySelector('.welcome-tagline');
            if (tagline) {
                tagline.textContent = 'Something went wrong';
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

    /**
     * Swap the regional terrain if the target region differs from the current.
     * Each region (Santa Cruz, Bay Area) owns its own terrain, sky, water,
     * lighting and GPS-to-local coordinate system.
     */
    async ensureRegion(targetRegion) {
        if (this.currentRegion === targetRegion && this.terrain) return;
        if (this.terrain && typeof this.terrain.dispose === 'function') {
            this.terrain.dispose();
        }
        if (targetRegion === 'bayArea') {
            this.terrain = new BayAreaTerrain(this.scene);
        } else if (targetRegion === 'santaBarbara') {
            this.terrain = new SantaBarbaraTerrain(this.scene);
        } else if (targetRegion === 'laBasin') {
            this.terrain = new LABasinTerrain(this.scene);
        } else {
            this.terrain = new SantaCruzTerrain(this.scene);
        }
        await this.terrain.generate();
        this.currentRegion = targetRegion;
        console.log(`Switched regional terrain → ${targetRegion}`);
    }

    async loadLocation(locationId) {
        const locData = SANTA_CRUZ_LOCATIONS[locationId] || REGIONAL_LOCATIONS[locationId];
        if (!locData) {
            console.error(`Location not found: ${locationId}`);
            return;
        }

        // Swap terrains if we're crossing regions
        const targetRegion = getRegionForLocation(locationId);
        await this.ensureRegion(targetRegion);

        // Remove old location group
        if (this.locationGroup) {
            this.scene.remove(this.locationGroup);
        }

        // Create new location group
        this.locationGroup = new THREE.Group();

        // Position at the location's coordinates using the active region's coord system
        const coords = REGION_COORDS[targetRegion];
        const local = coords.gpsToLocal(locData.lat, locData.lon);
        const elevation = coords.getElevation(locData.lat, locData.lon);
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
                this.locationContent = new UCBerkeleyCampus(this.locationGroup, localTerrainFn);
                break;
            case 'ucsb':
                this.locationContent = new UCSBCampus(this.locationGroup, localTerrainFn);
                break;
            case 'downtownSB':
                this.locationContent = new DowntownSB(this.locationGroup, localTerrainFn);
                break;
            case 'topanga':
                this.locationContent = new TopangaCanyon(this.locationGroup, localTerrainFn);
                break;
            case 'venice':
                this.locationContent = new VeniceBeach(this.locationGroup, localTerrainFn);
                break;
        }

        if (this.locationContent && this.locationContent.generate) {
            await this.locationContent.generate();
        }

        this.currentLocationId = locationId;
        this.currentLocation = locData;

        console.log(`Loaded location: ${locData.name}`);
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

        // Click on canvas to request pointer lock (for mouse look).
        // If paused, resume instead so a stray click doesn't bypass the menu.
        this.canvas.addEventListener('click', () => {
            if (this.isPaused) {
                this.resume();
            } else {
                this.requestPointerLock();
            }
        });

        // Pause menu buttons
        const resumeBtn = document.getElementById('pause-resume');
        const atlasBtn = document.getElementById('pause-atlas');
        const helpBtn = document.getElementById('pause-help');
        if (resumeBtn) resumeBtn.addEventListener('click', () => this.resume());
        if (atlasBtn) atlasBtn.addEventListener('click', () => {
            this.resume(false);
            this.atlas.open();
        });
        if (helpBtn) helpBtn.addEventListener('click', () => {
            this.controlsHint.classList.toggle('hidden');
        });
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

        // Get new ground position using the active region's coord system
        const locData = SANTA_CRUZ_LOCATIONS[locationId] || REGIONAL_LOCATIONS[locationId];
        const region = getRegionForLocation(locationId);
        const coords = REGION_COORDS[region];
        const local = coords.gpsToLocal(locData.lat, locData.lon);
        let elevation = 0;
        try {
            elevation = coords.getElevation(locData.lat, locData.lon);
        } catch (e) {
            elevation = 0;
        }

        // Position based on location type
        let spawnX = 0, spawnZ = -12;
        let faceTowardZ = -50;

        // Default yaw (set later via player) — null means use setPositionOnGround's default (π, facing +Z south)
        let initialYaw = null;

        if (locationId === 'steamerLane') {
            spawnX = 20; spawnZ = 5; faceTowardZ = 80;
        } else if (locationId === 'boardwalk') {
            spawnX = 0; spawnZ = -20; faceTowardZ = 50;
        } else if (locationId === 'berkeley') {
            // Spawn at the NW corner of Dwight Way & Telegraph Ave, facing
            // north up Telegraph toward Sproul Plaza and the Campanile —
            // the classic approach to UC Berkeley on foot.
            spawnX = -11; spawnZ = 318; faceTowardZ = 0;
            initialYaw = 0; // forward = -Z (north)
        } else if (locationId === 'ucsb') {
            // Spawn south of Storke Tower on the N-S spine, facing north toward the tower.
            spawnX = 0; spawnZ = 28; faceTowardZ = 0;
            initialYaw = 0; // forward = -Z (north)
        } else if (locationId === 'downtownSB') {
            // Spawn at State St & Anapamu, facing north up State Street
            // (toward the Arlington Theatre and the foothills beyond).
            spawnX = -4; spawnZ = 20; faceTowardZ = -100;
            initialYaw = 0; // forward = -Z (north)
        } else if (locationId === 'topanga') {
            // Spawn on the valley floor just south of the Country Store,
            // facing north up Topanga Canyon Blvd toward Theatricum Botanicum.
            spawnX = 0; spawnZ = 12; faceTowardZ = -80;
            initialYaw = 0; // forward = -Z (north, up-canyon)
        } else if (locationId === 'venice') {
            // Spawn on Ocean Front Walk, facing north toward Muscle Beach,
            // the skatepark, and the Santa Monica Pier at the far end.
            spawnX = 3; spawnZ = 8; faceTowardZ = -200;
            initialYaw = 0; // forward = -Z (north, up the boardwalk)
        }

        this.camera.position.set(local.x + spawnX, elevation + 1.7, local.z + spawnZ);

        this.player.setLocationGroup(this.locationGroup);
        this.player.setPositionOnGround(spawnX, 1.7, spawnZ);
        if (initialYaw !== null) {
            this.player.yaw = initialYaw;
            this.player.pitch = 0;
        }
        this.player.setTerrainFunction((x, z) => {
            // Prefer the location content's own terrain (needed when content
            // lives far from the Santa Cruz regional terrain bounds, e.g. Berkeley).
            if (this.locationContent && typeof this.locationContent.getTerrainHeight === 'function') {
                return this.locationContent.getTerrainHeight(x, z);
            }
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

        const regionLabel =
            region === 'bayArea' ? 'SF Bay Area' :
            region === 'santaBarbara' ? 'Santa Barbara' :
            region === 'laBasin' ? 'Greater LA' :
            'Santa Cruz';
        this.showLocation(`${locData.name} - ${regionLabel}`);
    }

    onPointerLockChange() {
        if (document.pointerLockElement === this.canvas) {
            console.log('Pointer locked - mouse look enabled');
            this.clickToLook.classList.add('hidden');

            // Make sure player is enabled when we have pointer lock
            if (this.introPhase === 'ready' && !this.isRunning) {
                this.isRunning = true;
                this.uiOverlay.classList.add('active');
                this.player.enable();
                this.startScreen.classList.add('hidden');
            }
        } else {
            console.log('Pointer unlocked - opening pause menu');
            // Show pause menu on desktop when play session is active
            if (this.introPhase === 'ready' && this.isRunning) {
                if ((!this.mobileControls || !this.mobileControls.isTouch()) && !this.atlas.isActive) {
                    this.pause();
                }
            }
        }
    }

    onKeyDown(e) {
        // Enter on the start screen acts like clicking "Enter the world"
        if (this.introPhase === 'aerial' && e.code === 'Enter') {
            e.preventDefault();
            this.beginZoom();
            return;
        }

        // Atlas handles its own keys (M, Escape) when atlas is relevant
        if (this.introPhase === 'ready' && !this.isPaused && this.atlas.handleKeyDown(e)) {
            return;
        }

        // F3 toggles FPS at any time after load
        if (e.code === 'F3') {
            e.preventDefault();
            this.toggleFps();
            return;
        }

        // Pause menu shortcuts
        if (this.isPaused) {
            if (e.code === 'Escape') {
                e.preventDefault();
                this.resume();
            } else if (e.code === 'KeyM') {
                e.preventDefault();
                this.resume(false);
                this.atlas.open();
            } else if (e.code === 'KeyH') {
                this.controlsHint.classList.toggle('hidden');
            }
            return;
        }

        if (!this.isRunning) return;

        if (e.code === 'KeyH') this.controlsHint.classList.toggle('hidden');

        // Escape forces browser to drop pointer lock; onPointerLockChange will then pause.
        // This explicit branch is only hit if pointer lock wasn't acquired.
        if (e.code === 'Escape' && !document.pointerLockElement) {
            e.preventDefault();
            this.pause();
            return;
        }

        // Teleport keys (quick access)
        if (e.code === 'Digit1') this.teleportTo('mchenryLibrary');
        if (e.code === 'Digit2') this.teleportTo('steamerLane');
        if (e.code === 'Digit3') this.teleportTo('boardwalk');
    }

    pause() {
        if (this.isPaused) return;
        this.isPaused = true;
        this.pauseMenu.classList.remove('hidden');
        this.clickToLook.classList.add('hidden');
        // Disable player (also clears held keys) so no input leaks through the menu.
        if (this.player) this.player.disable();
    }

    resume(relock = true) {
        if (!this.isPaused) return;
        this.isPaused = false;
        this.pauseMenu.classList.add('hidden');
        if (this.player) this.player.enable();
        if (relock && (!this.mobileControls || !this.mobileControls.isTouch())) {
            setTimeout(() => this.requestPointerLock(), 80);
        }
    }

    toggleFps() {
        this.fpsVisible = !this.fpsVisible;
        this.fpsCounter.classList.toggle('hidden', !this.fpsVisible);
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
            this.atlas.update(delta);
            // Compass/altitude aren't meaningful inside the Atlas.
            if (this.hud) this.hud.classList.add('hidden');
            if (this.speedIndicator) this.speedIndicator.classList.add('hidden');
        } else if (this.isPaused) {
            // Paused: hold still, HUD and world freeze.
        } else if (this.isRunning) {
            this.player.update(delta);
            this.updateHUD();
            // Per-frame animation hook for location-specific content
            // (butterflies at Steamer Lane, waves, etc.)
            if (this.locationContent && typeof this.locationContent.update === 'function') {
                this.locationContent.update(delta, this.clock.getElapsedTime());
            }
        } else if (this.introPhase === 'aerial') {
            // Gentle camera drift over the Monterey Bay
            const time = this.clock.getElapsedTime();
            this.camera.position.x = this.aerialPosition.x + Math.sin(time * 0.1) * 2000;
            this.camera.position.z = this.aerialPosition.z + Math.cos(time * 0.08) * 1500;
            this.camera.lookAt(new THREE.Vector3(this.mchenryLocalPos.x, 200, this.mchenryLocalPos.z));
        }

        this.updateFps(delta);
        this.renderer.render(this.scene, this.camera);
    }

    updateHUD() {
        if (!this.hud || !this.player) return;

        // Reveal HUD once gameplay begins
        if (this.hud.classList.contains('hidden')) {
            this.hud.classList.remove('hidden');
        }

        // --- Compass ---
        // Player yaw=0 means looking along world -Z (treated as north).
        // Positive yaw rotates CCW about +Y, so heading in degrees = (-yaw + 360) % 360.
        const yawDeg = this.player.yaw * 180 / Math.PI;
        const heading = ((-yawDeg) % 360 + 360) % 360;

        if (this.compassDial) {
            // Rotate dial so "N" on the dial points to world north relative to player facing.
            this.compassDial.style.transform = `rotate(${-heading}deg)`;
        }
        if (this.compassHeading) {
            const cardinal = this._headingCardinal(heading);
            this.compassHeading.textContent = `${heading.toFixed(0).padStart(3, '0')}° ${cardinal}`;
        }

        // --- Altitude (eye level above sea level) ---
        if (this.altValue) {
            let worldY = this.player.localPosition.y;
            if (this.locationGroup) worldY += this.locationGroup.position.y;
            const meters = Math.round(worldY);
            this.altValue.textContent = meters >= 1000
                ? `${(meters / 1000).toFixed(2)} km`
                : `${meters} m`;
        }

        // --- Speed boost indicator ---
        if (this.speedIndicator) {
            const boosting = this.player.keys.run && this.player.speedMultiplier > 1.01;
            this.speedIndicator.classList.toggle('hidden', !boosting);
            if (boosting) {
                const mult = this.player.speedMultiplier;
                if (this.speedValue) this.speedValue.textContent = `${mult.toFixed(1)}x`;
                if (this.speedBarFill) {
                    const max = this.player.maxSpeedMultiplier || 50;
                    // Log scale feels more natural for the 1-50 range.
                    const t = Math.min(1, Math.log(mult) / Math.log(max));
                    this.speedBarFill.style.width = `${(t * 100).toFixed(1)}%`;
                }
            }
        }
    }

    _headingCardinal(h) {
        const dirs = ['N', 'NE', 'E', 'SE', 'S', 'SW', 'W', 'NW'];
        return dirs[Math.round(h / 45) % 8];
    }

    updateFps(delta) {
        if (!this.fpsVisible || !this.fpsCounter) return;

        this.fpsFrameCount++;
        this.fpsElapsed += delta;
        if (this.fpsElapsed >= 0.5) {
            const fps = this.fpsFrameCount / this.fpsElapsed;
            this.fpsLastValue = fps;
            this.fpsFrameCount = 0;
            this.fpsElapsed = 0;
            this.fpsCounter.textContent = `${fps.toFixed(0)} FPS`;
            this.fpsCounter.classList.toggle('warn', fps < 45 && fps >= 25);
            this.fpsCounter.classList.toggle('bad', fps < 25);
        }
    }
}

document.addEventListener('DOMContentLoaded', () => {
    window.mathWorld = new MathWorld();
});
