// main.js — Asteroids in T^3: entry point, game loop, camera, ghost rendering

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';

import { TorusSpace } from './space.js';
import { Ship } from './ship.js';
import { Asteroid } from './asteroid.js';
import { Bullet } from './bullet.js';
import { checkBulletAsteroidCollisions, checkShipAsteroidCollision } from './collision.js';
import { InputManager } from './input.js';
import { ParticleSystem } from './particles.js';
import { HUD } from './hud.js';
import { playFire, playExplosion, playThrust, playDeath, playLevelUp } from './audio.js';

// ── Constants ──────────────────────────────────────────────
const TORUS_SIZE = 50;
const INITIAL_ASTEROIDS = 4;
const FIRE_COOLDOWN = 0.18;
const CAMERA_DISTANCE = 10;
const CAMERA_HEIGHT = 4;
const CAMERA_LERP = 0.06;
const GHOST_RADIUS = 15;

// ── Scene Setup ────────────────────────────────────────────
const container = document.getElementById('game-container');

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x000000);
scene.fog = new THREE.Fog(0x000000, 35, 70);

const camera = new THREE.PerspectiveCamera(
    70, window.innerWidth / window.innerHeight, 0.1, 200
);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

// Bloom post-processing
const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(
    new THREE.Vector2(window.innerWidth, window.innerHeight),
    1.0, 0.5, 0.3
);
composer.addPass(bloom);

// Resize handler
window.addEventListener('resize', () => {
    const w = window.innerWidth, h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    composer.setSize(w, h);
});

// ── Game State ─────────────────────────────────────────────
const space = new TorusSpace(TORUS_SIZE);
const ship = new Ship(space);
const input = new InputManager();
const particles = new ParticleSystem(scene);
const hud = new HUD('hud-canvas');

let asteroids = [];
let bullets = [];
let score = 0;
let level = 1;
let gameOver = false;
let gameStarted = false;
let fireCooldown = 0;
const clock = new THREE.Clock(false);

// ── Domain outline ─────────────────────────────────────────
function createDomainOutline() {
    const L = TORUS_SIZE;
    const edges = new THREE.EdgesGeometry(new THREE.BoxGeometry(L, L, L));
    const line = new THREE.LineSegments(edges, new THREE.LineBasicMaterial({
        color: 0x222244, transparent: true, opacity: 0.25
    }));
    line.position.set(L / 2, L / 2, L / 2);
    scene.add(line);
}

// ── Starfield ──────────────────────────────────────────────
function createStars() {
    const count = 300;
    const positions = new Float32Array(count * 3);
    const L = TORUS_SIZE;
    for (let i = 0; i < count; i++) {
        positions[i * 3]     = Math.random() * L;
        positions[i * 3 + 1] = Math.random() * L;
        positions[i * 3 + 2] = Math.random() * L;
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
        color: 0x444466, size: 0.15, sizeAttenuation: true
    });
    scene.add(new THREE.Points(geometry, material));
}

// ── Ghost rendering ────────────────────────────────────────
const ghostPool = new Map();

function updateGhosts(obj, mainMesh) {
    if (!mainMesh) return;
    const offsets = space.getGhostOffsets(obj.position, GHOST_RADIUS);
    let ghosts = ghostPool.get(obj);
    if (!ghosts) {
        ghosts = [];
        ghostPool.set(obj, ghosts);
    }

    // Create more clones if needed
    while (ghosts.length < offsets.length) {
        const clone = mainMesh.clone();
        scene.add(clone);
        ghosts.push(clone);
    }
    // Position active ghosts, hide excess
    for (let i = 0; i < ghosts.length; i++) {
        if (i < offsets.length) {
            ghosts[i].visible = mainMesh.visible;
            ghosts[i].position.copy(obj.position).add(offsets[i]);
            ghosts[i].quaternion.copy(mainMesh.quaternion);
        } else {
            ghosts[i].visible = false;
        }
    }
}

function removeGhosts(obj) {
    const ghosts = ghostPool.get(obj);
    if (ghosts) {
        for (const g of ghosts) {
            scene.remove(g);
            // Dispose geometry/material of clones
            g.traverse(child => {
                if (child.geometry) child.geometry.dispose();
                if (child.material) {
                    if (Array.isArray(child.material)) {
                        child.material.forEach(m => m.dispose());
                    } else {
                        child.material.dispose();
                    }
                }
            });
        }
        ghostPool.delete(obj);
    }
}

// ── Level / Spawning ───────────────────────────────────────
function spawnAsteroids(count) {
    for (let i = 0; i < count; i++) {
        let pos;
        let tries = 0;
        do {
            pos = new THREE.Vector3(
                Math.random() * space.size,
                Math.random() * space.size,
                Math.random() * space.size
            );
            tries++;
        } while (space.distance(pos, ship.position) < 14 && tries < 50);

        const asteroid = new Asteroid(space, pos, 'large');
        asteroid.createMesh();
        scene.add(asteroid.mesh);
        asteroids.push(asteroid);
    }
}

function nextLevel() {
    level++;
    spawnAsteroids(INITIAL_ASTEROIDS + level - 1);
}

// ── Camera ─────────────────────────────────────────────────
const cameraTargetPos = new THREE.Vector3();
const cameraLookTarget = new THREE.Vector3();
const prevShipPos = new THREE.Vector3();
let cameraInitialized = false;

function updateCamera() {
    const forward = ship.getForward();
    const up = ship.getUp();

    cameraTargetPos.copy(ship.position)
        .addScaledVector(forward, -CAMERA_DISTANCE)
        .addScaledVector(up, CAMERA_HEIGHT);

    // Detect torus boundary crossing: if ship jumped > halfSize on any axis,
    // snap camera to avoid lerping across the domain
    if (cameraInitialized) {
        const dx = ship.position.x - prevShipPos.x;
        const dy = ship.position.y - prevShipPos.y;
        const dz = ship.position.z - prevShipPos.z;
        const h = space.halfSize;
        if (Math.abs(dx) > h || Math.abs(dy) > h || Math.abs(dz) > h) {
            // Ship wrapped — snap camera to new target
            camera.position.copy(cameraTargetPos);
        } else {
            camera.position.lerp(cameraTargetPos, CAMERA_LERP);
        }
    } else {
        camera.position.copy(cameraTargetPos);
        cameraInitialized = true;
    }

    prevShipPos.copy(ship.position);

    // Look slightly ahead of the ship
    cameraLookTarget.copy(ship.position)
        .addScaledVector(forward, 5);
    camera.lookAt(cameraLookTarget);
}

// ── Input processing ───────────────────────────────────────
function processInput(dt) {
    const rotSpeed = 2.5;

    // Mouse look
    if (input.pointerLocked) {
        const { dx, dy } = input.consumeMouseDelta();
        const sens = 0.003;
        ship.rotate(-dy * sens, -dx * sens, 0, 1);
    }

    // Keyboard rotation
    let pitch = 0, yaw = 0, roll = 0;
    if (input.isPressed('KeyW') || input.isPressed('ArrowUp'))    pitch = -rotSpeed;
    if (input.isPressed('KeyS') || input.isPressed('ArrowDown'))  pitch = rotSpeed;
    if (input.isPressed('KeyA') || input.isPressed('ArrowLeft'))  yaw = rotSpeed;
    if (input.isPressed('KeyD') || input.isPressed('ArrowRight')) yaw = -rotSpeed;
    if (input.isPressed('KeyQ')) roll = rotSpeed;
    if (input.isPressed('KeyE')) roll = -rotSpeed;
    if (pitch || yaw || roll) ship.rotate(pitch, yaw, roll, dt);

    // Thrust
    if (input.isPressed('Space') || input.isPressed('ShiftLeft')) {
        ship.thrust(dt);
        playThrust();
    }

    // Fire
    fireCooldown -= dt;
    if ((input.mouseDown || input.isPressed('KeyF')) && fireCooldown <= 0) {
        fireBullet();
        fireCooldown = FIRE_COOLDOWN;
    }
}

function fireBullet() {
    playFire();
    const forward = ship.getForward();
    const spawnPos = ship.position.clone().addScaledVector(forward, 2.5);
    space.wrap(spawnPos);
    const bullet = new Bullet(space, spawnPos, forward);
    bullet.createMesh();
    scene.add(bullet.mesh);
    bullets.push(bullet);
}

// ── Restart ────────────────────────────────────────────────
function restart() {
    // Clear all entities
    for (const a of asteroids) { scene.remove(a.mesh); removeGhosts(a); }
    for (const b of bullets) { scene.remove(b.mesh); removeGhosts(b); }
    asteroids = [];
    bullets = [];
    score = 0;
    level = 1;
    gameOver = false;
    ship.lives = 3;
    ship.respawn();
    spawnAsteroids(INITIAL_ASTEROIDS);
}

// ── Game loop ──────────────────────────────────────────────
function gameLoop() {
    requestAnimationFrame(gameLoop);

    if (!gameStarted) {
        composer.render();
        hud.draw({ score: 0, lives: 3, level: 1, gameOver: false,
                   speed: 0, pointerLocked: false });
        return;
    }

    const dt = Math.min(clock.getDelta(), 0.05);

    if (gameOver) {
        // Still render, but no updates
        if (input.isPressed('KeyR')) restart();
        particles.update(dt);
        composer.render();
        hud.draw({ score, lives: 0, level, gameOver: true,
                   speed: 0, pointerLocked: input.pointerLocked });
        return;
    }

    // Input
    processInput(dt);

    // Update entities
    ship.update(dt);
    for (const a of asteroids) a.update(dt);
    for (const b of bullets) b.update(dt);
    particles.update(dt);

    // Remove expired bullets
    for (let i = bullets.length - 1; i >= 0; i--) {
        if (bullets[i].isExpired()) {
            scene.remove(bullets[i].mesh);
            removeGhosts(bullets[i]);
            bullets.splice(i, 1);
        }
    }

    // Bullet-asteroid collisions
    const hits = checkBulletAsteroidCollisions(space, bullets, asteroids);
    const hitBullets = new Set(hits.map(h => h.bulletIndex));
    const hitAsteroids = new Set(hits.map(h => h.asteroidIndex));

    // Process hit asteroids (reverse order for safe splice)
    const sortedAsteroids = [...hitAsteroids].sort((a, b) => b - a);
    for (const idx of sortedAsteroids) {
        const asteroid = asteroids[idx];
        score += asteroid.score;

        // Explosion
        playExplosion(asteroid.size);
        particles.explodeLines(asteroid.position,
            asteroid.size === 'large' ? 16 : asteroid.size === 'medium' ? 12 : 8,
            0xffaa00, asteroid.size === 'large' ? 14 : 10);

        // Split into children
        const children = asteroid.split();
        for (const child of children) {
            child.createMesh();
            scene.add(child.mesh);
            asteroids.push(child);
        }

        scene.remove(asteroid.mesh);
        removeGhosts(asteroid);
        asteroids.splice(idx, 1);
    }

    // Remove hit bullets
    const sortedBullets = [...hitBullets].sort((a, b) => b - a);
    for (const idx of sortedBullets) {
        scene.remove(bullets[idx].mesh);
        removeGhosts(bullets[idx]);
        bullets.splice(idx, 1);
    }

    // Ship-asteroid collision
    const shipHit = checkShipAsteroidCollision(space, ship, asteroids);
    if (shipHit >= 0) {
        playDeath();
        particles.explodeLines(ship.position, 24, 0xff4444, 15);
        particles.explode(ship.position, 30, 0xff8800, 8);
        ship.lives--;
        if (ship.lives <= 0) {
            gameOver = true;
            if (ship.mesh) ship.mesh.visible = false;
        } else {
            ship.respawn();
        }
    }

    // Level complete
    if (asteroids.length === 0) {
        playLevelUp();
        nextLevel();
    }

    // Ghost copies for torus wrapping
    updateGhosts(ship, ship.mesh);
    for (const a of asteroids) updateGhosts(a, a.mesh);
    // Skip ghost rendering for bullets (they're small and fast)

    // Camera
    updateCamera();

    // Render
    composer.render();
    hud.draw({
        score,
        lives: ship.lives,
        level,
        gameOver: false,
        speed: ship.velocity.length(),
        pointerLocked: input.pointerLocked
    });
}

// ── Start game on first click ──────────────────────────────
function startGame() {
    if (gameStarted) return;
    gameStarted = true;
    document.getElementById('title-screen').style.display = 'none';
    clock.start();
    renderer.domElement.requestPointerLock();
}

document.getElementById('title-screen').addEventListener('click', startGame);
document.addEventListener('keydown', (e) => {
    if (!gameStarted) {
        startGame();
        return;
    }
});

// ── Init ───────────────────────────────────────────────────
function init() {
    ship.createMesh();
    ship.createThrustMesh();
    scene.add(ship.mesh);

    spawnAsteroids(INITIAL_ASTEROIDS);
    createDomainOutline();
    createStars();

    input.requestPointerLock(renderer.domElement);

    // Initial camera position
    camera.position.copy(ship.position).add(new THREE.Vector3(0, CAMERA_HEIGHT, CAMERA_DISTANCE));
    camera.lookAt(ship.position);

    gameLoop();
}

init();
