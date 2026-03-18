// ============================================================
// Dolphin Olympics - A tribute to the classic Flash game
// ============================================================

const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// ---- Constants ----
const WATER_LEVEL_RATIO = 0.45; // water starts at 45% of screen height
const GRAVITY = 0.35;
const WATER_DRAG = 0.985;
const AIR_DRAG = 0.998;
const SWIM_ACCEL = 0.45;
const BOOST_ACCEL = 0.12;
const MAX_SPEED = 22;
const TURN_SPEED = 0.055;
const AIR_TURN_SPEED = 0.12;
const FLIP_THRESHOLD = Math.PI * 2;
const GAME_DURATION = 120; // seconds
const RING_INTERVAL = 3500; // ms between ring spawns
const STAR_COUNT = 80;

// ---- State ----
let W, H, waterLevel;
let gameState = 'title'; // title, playing, gameover
let gameTime = GAME_DURATION;
let score = 0;
let bestTrickScore = 0;
let totalFlips = 0;
let maxHeight = 0;

// Camera
let cameraY = 0;
let targetCameraY = 0;

// Dolphin
let dolphin = {
    x: 0, y: 0,
    vx: 0, vy: 0,
    angle: 0,
    angularVel: 0,
    speed: 0,
    inWater: true,
    flipCount: 0,
    flipAngle: 0,
    trickScore: 0,
    trickNames: [],
    tailTrail: [],
    noseDiving: false,
};

// Input
const keys = {};

// Visual elements
let bubbles = [];
let splashes = [];
let rings = [];
let clouds = [];
let stars = [];
let waveOffset = 0;
let trickDisplayTimer = 0;
let comboDisplayTimer = 0;
let scorePopups = [];
let lastRingSpawn = 0;

// ---- Initialization ----
function resize() {
    W = canvas.width = window.innerWidth;
    H = canvas.height = window.innerHeight;
    waterLevel = H * WATER_LEVEL_RATIO;
}

function init() {
    resize();
    initStars();
    initClouds();
    resetDolphin();
    gameLoop();
}

function resetDolphin() {
    dolphin.x = W * 0.3;
    dolphin.y = waterLevel + 60;
    dolphin.vx = 2;
    dolphin.vy = 0;
    dolphin.angle = -0.3; // slightly upward
    dolphin.angularVel = 0;
    dolphin.speed = 2;
    dolphin.inWater = true;
    dolphin.flipCount = 0;
    dolphin.flipAngle = 0;
    dolphin.trickScore = 0;
    dolphin.trickNames = [];
    dolphin.tailTrail = [];
    dolphin.noseDiving = false;
    cameraY = 0;
    targetCameraY = 0;
}

function startGame() {
    gameState = 'playing';
    gameTime = GAME_DURATION;
    score = 0;
    bestTrickScore = 0;
    totalFlips = 0;
    maxHeight = 0;
    bubbles = [];
    splashes = [];
    rings = [];
    scorePopups = [];
    resetDolphin();
    document.getElementById('title-screen').classList.add('hidden');
    document.getElementById('game-over-screen').classList.add('hidden');
}

function endGame() {
    gameState = 'gameover';
    document.getElementById('final-score').textContent = score.toLocaleString();
    document.getElementById('final-best-trick').textContent = bestTrickScore.toLocaleString();
    document.getElementById('final-max-height').textContent = Math.round(maxHeight) + 'm';
    document.getElementById('final-flips').textContent = totalFlips;
    document.getElementById('game-over-screen').classList.remove('hidden');
}

// ---- Stars & Clouds ----
function initStars() {
    stars = [];
    for (let i = 0; i < STAR_COUNT; i++) {
        stars.push({
            x: Math.random() * 2000 - 500,
            y: Math.random() * 1500,
            size: Math.random() * 2 + 0.5,
            twinkle: Math.random() * Math.PI * 2,
        });
    }
}

function initClouds() {
    clouds = [];
    for (let i = 0; i < 8; i++) {
        clouds.push({
            x: Math.random() * W * 2 - W * 0.5,
            y: Math.random() * waterLevel * 0.6,
            w: Math.random() * 200 + 100,
            h: Math.random() * 40 + 20,
            speed: Math.random() * 0.3 + 0.1,
            opacity: Math.random() * 0.3 + 0.1,
        });
    }
}

// ---- Rings (bonus targets) ----
function spawnRing() {
    const side = Math.random() < 0.5 ? -1 : 1;
    const baseX = dolphin.x + side * (Math.random() * 300 + 200);
    const baseY = waterLevel - Math.random() * 400 - 100;
    rings.push({
        x: baseX,
        y: baseY,
        radius: 30,
        collected: false,
        alpha: 1,
        age: 0,
    });
}

// ---- Physics ----
function updateDolphin(dt) {
    const wasInWater = dolphin.inWater;
    dolphin.inWater = dolphin.y > waterLevel;

    // Entering water
    if (!wasInWater && dolphin.inWater) {
        landInWater();
    }
    // Leaving water
    if (wasInWater && !dolphin.inWater) {
        exitWater();
    }

    if (dolphin.inWater) {
        updateUnderwater(dt);
    } else {
        updateAirborne(dt);
    }

    // Update position
    dolphin.x += dolphin.vx;
    dolphin.y += dolphin.vy;

    // Wrap horizontally
    if (dolphin.x > W + 50) dolphin.x = -50;
    if (dolphin.x < -50) dolphin.x = W + 50;

    // Floor limit (ocean floor)
    const floorY = waterLevel + 250;
    if (dolphin.y > floorY) {
        dolphin.y = floorY;
        dolphin.vy *= -0.3;
    }

    // Speed calc
    dolphin.speed = Math.sqrt(dolphin.vx * dolphin.vx + dolphin.vy * dolphin.vy);

    // Trail
    dolphin.tailTrail.push({ x: dolphin.x, y: dolphin.y, age: 0 });
    if (dolphin.tailTrail.length > 20) dolphin.tailTrail.shift();
    dolphin.tailTrail.forEach(t => t.age++);

    // Height tracking
    if (!dolphin.inWater) {
        const heightMeters = (waterLevel - dolphin.y) / 15;
        if (heightMeters > maxHeight) maxHeight = heightMeters;
    }
}

function updateUnderwater(dt) {
    // Steering
    if (keys['ArrowLeft'] || keys['a']) {
        dolphin.angle -= TURN_SPEED;
    }
    if (keys['ArrowRight'] || keys['d']) {
        dolphin.angle += TURN_SPEED;
    }

    // Swimming forward
    if (keys['ArrowUp'] || keys['w']) {
        dolphin.vx += Math.cos(dolphin.angle) * SWIM_ACCEL;
        dolphin.vy += Math.sin(dolphin.angle) * SWIM_ACCEL;

        // Bubbles
        if (Math.random() < 0.4) {
            spawnBubble(dolphin.x - Math.cos(dolphin.angle) * 20,
                dolphin.y - Math.sin(dolphin.angle) * 20);
        }
    }

    // Buoyancy: gently push dolphin toward surface when deep, neutral near surface
    const depth = dolphin.y - waterLevel;
    if (depth > 20) {
        dolphin.vy -= 0.02; // buoyancy pushes up when deep
    }

    // Water drag
    dolphin.vx *= WATER_DRAG;
    dolphin.vy *= WATER_DRAG;

    // Speed limit
    const spd = Math.sqrt(dolphin.vx * dolphin.vx + dolphin.vy * dolphin.vy);
    if (spd > MAX_SPEED) {
        dolphin.vx = (dolphin.vx / spd) * MAX_SPEED;
        dolphin.vy = (dolphin.vy / spd) * MAX_SPEED;
    }

    // Align angle toward velocity
    if (spd > 0.5) {
        const targetAngle = Math.atan2(dolphin.vy, dolphin.vx);
        let diff = targetAngle - dolphin.angle;
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        dolphin.angle += diff * 0.15;
    }

    // Angular velocity dampening
    dolphin.angularVel *= 0.8;

    // Reset flip tracking when fully submerged
    if (dolphin.y > waterLevel + 40) {
        if (dolphin.trickScore > 0) {
            // Award trick score
            awardTrickScore();
        }
        dolphin.flipAngle = 0;
        dolphin.flipCount = 0;
        dolphin.trickScore = 0;
        dolphin.trickNames = [];
    }
}

function updateAirborne(dt) {
    // Gravity
    dolphin.vy += GRAVITY;

    // Air drag (minimal)
    dolphin.vx *= AIR_DRAG;
    dolphin.vy *= AIR_DRAG;

    // Rotation control
    if (keys['ArrowLeft'] || keys['a']) {
        dolphin.angularVel -= AIR_TURN_SPEED;
    }
    if (keys['ArrowRight'] || keys['d']) {
        dolphin.angularVel += AIR_TURN_SPEED;
    }
    if (keys['ArrowDown'] || keys['s']) {
        // Nose dive for speed boost on re-entry
        dolphin.angularVel += AIR_TURN_SPEED * 0.3;
        dolphin.noseDiving = true;
    }

    dolphin.angularVel *= 0.975;
    dolphin.angle += dolphin.angularVel;

    // Track flips
    dolphin.flipAngle += dolphin.angularVel;
    const newFlips = Math.floor(Math.abs(dolphin.flipAngle) / FLIP_THRESHOLD);
    if (newFlips > dolphin.flipCount) {
        const gained = newFlips - dolphin.flipCount;
        dolphin.flipCount = newFlips;
        totalFlips += gained;

        // Score for flips
        const flipBonus = dolphin.flipCount * 100 * (dolphin.flipCount); // exponential
        dolphin.trickScore += flipBonus;

        const direction = dolphin.flipAngle > 0 ? 'Forward' : 'Backflip';
        if (dolphin.flipCount >= 4) {
            dolphin.trickNames.push(`QUAD ${direction.toUpperCase()}!`);
        } else if (dolphin.flipCount >= 3) {
            dolphin.trickNames.push(`TRIPLE ${direction.toUpperCase()}!`);
        } else if (dolphin.flipCount >= 2) {
            dolphin.trickNames.push(`DOUBLE ${direction.toUpperCase()}!`);
        } else {
            dolphin.trickNames.push(direction + ' Flip!');
        }

        showTrick(dolphin.trickNames[dolphin.trickNames.length - 1]);
    }

    // Height bonus
    const height = waterLevel - dolphin.y;
    if (height > 100) {
        dolphin.trickScore += height * 0.01;
    }
}

function exitWater() {
    // Splash effect
    createSplash(dolphin.x, waterLevel, dolphin.speed);

    // Speed bonus on exit
    const exitSpeed = dolphin.speed;
    if (exitSpeed > 8) {
        dolphin.trickScore += Math.floor(exitSpeed * 10);
    }

    dolphin.flipAngle = 0;
    dolphin.flipCount = 0;
    dolphin.noseDiving = false;
}

function landInWater() {
    // Splash on re-entry
    createSplash(dolphin.x, waterLevel, dolphin.speed);

    // Award accumulated trick score
    if (dolphin.trickScore > 0) {
        awardTrickScore();
    }

    // Speed boost for clean entry (dolphin pointing downward)
    const entryAngle = Math.atan2(dolphin.vy, dolphin.vx);
    const angleDiff = Math.abs(dolphin.angle - entryAngle);
    const cleanEntry = angleDiff < 0.4;

    if (cleanEntry && dolphin.speed > 5) {
        // Boost! Clean entry preserves more speed
        const boost = dolphin.speed * 0.15;
        dolphin.vx += Math.cos(dolphin.angle) * boost;
        dolphin.vy += Math.sin(dolphin.angle) * boost;
        showCombo('CLEAN ENTRY! +Speed');
    }

    dolphin.flipAngle = 0;
    dolphin.flipCount = 0;
    dolphin.trickNames = [];
    dolphin.noseDiving = false;
}

function awardTrickScore() {
    const pts = Math.floor(dolphin.trickScore);
    if (pts > 0) {
        score += pts;
        if (pts > bestTrickScore) bestTrickScore = pts;
        spawnScorePopup(dolphin.x, dolphin.y, '+' + pts.toLocaleString());
    }
}

// ---- Effects ----
function spawnBubble(x, y) {
    bubbles.push({
        x: x + (Math.random() - 0.5) * 10,
        y: y + (Math.random() - 0.5) * 10,
        radius: Math.random() * 4 + 1,
        vy: -(Math.random() * 1.5 + 0.5),
        vx: (Math.random() - 0.5) * 0.5,
        alpha: 0.7,
        age: 0,
    });
}

function createSplash(x, y, intensity) {
    const count = Math.min(Math.floor(intensity * 3), 30);
    for (let i = 0; i < count; i++) {
        splashes.push({
            x: x + (Math.random() - 0.5) * 30,
            y: y,
            vx: (Math.random() - 0.5) * intensity * 0.8,
            vy: -(Math.random() * intensity * 0.6 + 2),
            radius: Math.random() * 3 + 1,
            alpha: 1,
            age: 0,
        });
    }
}

function spawnScorePopup(x, y, text) {
    scorePopups.push({ x, y, text, age: 0, alpha: 1 });
}

function showTrick(name) {
    document.getElementById('trick-display').textContent = name;
    document.getElementById('trick-display').classList.add('visible');
    trickDisplayTimer = 90;
}

function showCombo(text) {
    document.getElementById('combo-display').textContent = text;
    document.getElementById('combo-display').classList.add('visible');
    comboDisplayTimer = 60;
}

// ---- Ring collision ----
function checkRings() {
    rings.forEach(ring => {
        if (ring.collected) return;
        const dx = dolphin.x - ring.x;
        const dy = dolphin.y - ring.y;
        const dist = Math.sqrt(dx * dx + dy * dy);
        if (dist < ring.radius + 15) {
            ring.collected = true;
            score += 500;
            dolphin.trickScore += 500;
            spawnScorePopup(ring.x, ring.y, '+500 RING!');
            showTrick('RING BONUS!');
        }
    });
}

// ---- Update ----
function update(dt) {
    // Always animate background elements
    waveOffset += 0.015;
    clouds.forEach(c => {
        c.x += c.speed;
        if (c.x > W + 300) c.x = -c.w - 100;
    });

    if (gameState !== 'playing') return;

    // Timer
    gameTime -= dt / 1000;
    if (gameTime <= 0) {
        gameTime = 0;
        endGame();
        return;
    }

    updateDolphin(dt);
    checkRings();

    // Camera follows dolphin both above and below water
    if (!dolphin.inWater) {
        // In air: keep dolphin at ~40% from top of screen
        targetCameraY = -(dolphin.y - H * 0.4);
    } else {
        // Underwater: keep dolphin at ~55% from top of screen
        const dolphinScreenY = dolphin.y + cameraY;
        if (dolphinScreenY > H * 0.7 || dolphinScreenY < H * 0.3) {
            targetCameraY = -(dolphin.y - H * 0.55);
        }
        // Near surface, ease toward showing both sky and water
        if (dolphin.y < waterLevel + 80 && dolphin.y > waterLevel - 10) {
            targetCameraY = 0;
        }
    }
    cameraY += (targetCameraY - cameraY) * 0.08;

    // Spawn rings periodically
    const now = performance.now();
    if (now - lastRingSpawn > RING_INTERVAL) {
        spawnRing();
        lastRingSpawn = now;
    }

    // Update bubbles
    bubbles.forEach(b => {
        b.x += b.vx;
        b.y += b.vy;
        b.alpha -= 0.008;
        b.age++;
    });
    bubbles = bubbles.filter(b => b.alpha > 0 && b.y > waterLevel - 10);

    // Update splashes
    splashes.forEach(s => {
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.15;
        s.alpha -= 0.018;
        s.age++;
    });
    splashes = splashes.filter(s => s.alpha > 0);

    // Update rings
    rings.forEach(r => {
        r.age++;
        if (r.collected) r.alpha -= 0.05;
    });
    rings = rings.filter(r => r.alpha > 0 && r.age < 600);

    // Update score popups
    scorePopups.forEach(p => {
        p.y -= 1.5;
        p.age++;
        p.alpha = Math.max(0, 1 - p.age / 60);
    });
    scorePopups = scorePopups.filter(p => p.alpha > 0);

    // Trick display timers
    if (trickDisplayTimer > 0) {
        trickDisplayTimer--;
        if (trickDisplayTimer === 0) {
            document.getElementById('trick-display').classList.remove('visible');
        }
    }
    if (comboDisplayTimer > 0) {
        comboDisplayTimer--;
        if (comboDisplayTimer === 0) {
            document.getElementById('combo-display').classList.remove('visible');
        }
    }



    // HUD
    document.getElementById('score-value').textContent = score.toLocaleString();
    const mins = Math.floor(gameTime / 60);
    const secs = Math.floor(gameTime % 60);
    document.getElementById('time-value').textContent = `${mins}:${secs.toString().padStart(2, '0')}`;
    document.getElementById('speed-value').textContent = Math.round(dolphin.speed * 10);
    document.getElementById('best-value').textContent = bestTrickScore.toLocaleString();

    // Height display
    if (!dolphin.inWater) {
        const heightM = Math.round((waterLevel - dolphin.y) / 15);
        document.getElementById('height-display').textContent = heightM + 'm';
        document.getElementById('height-display').classList.add('visible');
    } else {
        document.getElementById('height-display').classList.remove('visible');
    }
}

// ---- Rendering ----
function draw() {
    ctx.clearRect(0, 0, W, H);

    const camY = cameraY;

    drawSky(camY);
    drawStars(camY);
    drawClouds(camY);
    drawWater(camY);
    drawSeaFloor(camY);
    drawRings(camY);
    drawBubbles(camY);
    drawDolphin(camY);
    drawSplashes(camY);
    drawScorePopups(camY);

    // Airborne trick score preview
    if (!dolphin.inWater && dolphin.trickScore > 0 && gameState === 'playing') {
        ctx.save();
        ctx.font = '12px "Press Start 2P"';
        ctx.fillStyle = 'rgba(255, 215, 0, 0.8)';
        ctx.textAlign = 'center';
        ctx.fillText(Math.floor(dolphin.trickScore).toLocaleString() + ' pts',
            dolphin.x, dolphin.y + camY - 40);
        ctx.restore();
    }
}

function drawSky(camY) {
    // Gradient sky
    const skyBottom = waterLevel + camY;
    const grd = ctx.createLinearGradient(0, Math.min(0, camY * 0.3), 0, skyBottom);
    grd.addColorStop(0, '#0a0a2e');
    grd.addColorStop(0.3, '#1a1a4e');
    grd.addColorStop(0.6, '#2d4a7a');
    grd.addColorStop(0.85, '#4a90b8');
    grd.addColorStop(1, '#7ec8e3');
    ctx.fillStyle = grd;
    ctx.fillRect(0, 0, W, Math.max(skyBottom, H));
}

function drawStars(camY) {
    const t = performance.now() * 0.001;
    ctx.save();
    stars.forEach(s => {
        const sy = s.y + camY * 0.1;
        if (sy > waterLevel + camY) return;
        const twinkle = 0.4 + 0.6 * Math.sin(t * 1.5 + s.twinkle);
        ctx.globalAlpha = twinkle * 0.8;
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(s.x % W, sy, s.size, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.restore();
}

function drawClouds(camY) {
    ctx.save();
    clouds.forEach(c => {
        const cy = c.y + camY * 0.2;
        ctx.globalAlpha = c.opacity;
        ctx.fillStyle = '#fff';
        // Simple cloud shape
        ctx.beginPath();
        ctx.ellipse(c.x, cy, c.w * 0.5, c.h * 0.5, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(c.x - c.w * 0.25, cy + 5, c.w * 0.35, c.h * 0.4, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.beginPath();
        ctx.ellipse(c.x + c.w * 0.25, cy + 3, c.w * 0.3, c.h * 0.35, 0, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.restore();
}

function drawWater(camY) {
    const wy = waterLevel + camY;

    // Water surface wave
    ctx.save();
    ctx.beginPath();
    ctx.moveTo(0, wy);
    for (let x = 0; x <= W; x += 4) {
        const wave = Math.sin(x * 0.015 + waveOffset) * 4
            + Math.sin(x * 0.03 + waveOffset * 1.5) * 2
            + Math.sin(x * 0.008 + waveOffset * 0.7) * 6;
        ctx.lineTo(x, wy + wave);
    }
    ctx.lineTo(W, H);
    ctx.lineTo(0, H);
    ctx.closePath();

    // Water gradient
    const waterGrd = ctx.createLinearGradient(0, wy, 0, H);
    waterGrd.addColorStop(0, 'rgba(30, 120, 180, 0.85)');
    waterGrd.addColorStop(0.3, 'rgba(20, 80, 140, 0.9)');
    waterGrd.addColorStop(0.7, 'rgba(10, 40, 80, 0.95)');
    waterGrd.addColorStop(1, 'rgba(5, 15, 40, 1)');
    ctx.fillStyle = waterGrd;
    ctx.fill();

    // Surface shimmer
    ctx.strokeStyle = 'rgba(150, 220, 255, 0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let x = 0; x <= W; x += 4) {
        const wave = Math.sin(x * 0.015 + waveOffset) * 4
            + Math.sin(x * 0.03 + waveOffset * 1.5) * 2
            + Math.sin(x * 0.008 + waveOffset * 0.7) * 6;
        if (x === 0) ctx.moveTo(x, wy + wave);
        else ctx.lineTo(x, wy + wave);
    }
    ctx.stroke();

    // Light rays underwater
    ctx.globalAlpha = 0.06;
    for (let i = 0; i < 6; i++) {
        const rx = (i * W / 5 + waveOffset * 30) % (W + 200) - 100;
        const rayW = 60 + Math.sin(waveOffset + i) * 20;
        ctx.beginPath();
        ctx.moveTo(rx, wy);
        ctx.lineTo(rx - rayW, H);
        ctx.lineTo(rx + rayW, H);
        ctx.closePath();
        ctx.fillStyle = '#8fd4ff';
        ctx.fill();
    }
    ctx.restore();
}

function drawSeaFloor(camY) {
    const floorY = waterLevel + 350 + camY;
    if (floorY > H) return;

    ctx.save();
    ctx.fillStyle = '#1a3a2a';
    ctx.fillRect(0, floorY, W, H - floorY + 10);

    // Sandy texture
    ctx.fillStyle = '#2a5a3a';
    for (let x = 0; x < W; x += 40) {
        const h = Math.abs(5 + Math.sin(x * 0.05) * 8);
        if (h > 0.1) {
            ctx.beginPath();
            ctx.ellipse(x, floorY, 25, h, 0, Math.PI, 0);
            ctx.fill();
        }
    }

    // Seaweed
    const t = performance.now() * 0.002;
    ctx.strokeStyle = '#2a8040';
    ctx.lineWidth = 3;
    for (let x = 30; x < W; x += 80) {
        const seaweedH = 30 + Math.sin(x) * 20;
        ctx.beginPath();
        ctx.moveTo(x, floorY);
        for (let sy = 0; sy < seaweedH; sy += 5) {
            const sway = Math.sin(t + x * 0.1 + sy * 0.1) * 8;
            ctx.lineTo(x + sway, floorY - sy);
        }
        ctx.stroke();
    }
    ctx.restore();
}

function drawRings(camY) {
    ctx.save();
    rings.forEach(ring => {
        const ry = ring.y + camY;
        ctx.globalAlpha = ring.alpha;

        // Gold ring
        ctx.strokeStyle = ring.collected ? '#fff' : '#ffd700';
        ctx.lineWidth = ring.collected ? 2 : 4;
        ctx.beginPath();
        ctx.arc(ring.x, ry, ring.radius, 0, Math.PI * 2);
        ctx.stroke();

        // Inner glow
        if (!ring.collected) {
            ctx.strokeStyle = 'rgba(255, 215, 0, 0.3)';
            ctx.lineWidth = 8;
            ctx.beginPath();
            ctx.arc(ring.x, ry, ring.radius, 0, Math.PI * 2);
            ctx.stroke();
        }
    });
    ctx.restore();
}

function drawBubbles(camY) {
    ctx.save();
    bubbles.forEach(b => {
        const by = b.y + camY;
        ctx.globalAlpha = b.alpha;
        ctx.strokeStyle = 'rgba(180, 220, 255, 0.7)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(b.x, by, b.radius, 0, Math.PI * 2);
        ctx.stroke();

        // Highlight
        ctx.fillStyle = 'rgba(220, 240, 255, 0.3)';
        ctx.beginPath();
        ctx.arc(b.x - b.radius * 0.3, by - b.radius * 0.3, b.radius * 0.3, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.restore();
}

function drawSplashes(camY) {
    ctx.save();
    splashes.forEach(s => {
        const sy = s.y + camY;
        ctx.globalAlpha = s.alpha;
        ctx.fillStyle = 'rgba(180, 220, 255, 0.9)';
        ctx.beginPath();
        ctx.arc(s.x, sy, s.radius, 0, Math.PI * 2);
        ctx.fill();
    });
    ctx.restore();
}

function dolphinBodyPath() {
    ctx.beginPath();
    ctx.moveTo(28, 0);     // Nose
    ctx.quadraticCurveTo(24, -6, 15, -9);
    ctx.quadraticCurveTo(5, -13, -8, -12);
    ctx.quadraticCurveTo(-18, -10, -24, -5);
    // Tail
    ctx.lineTo(-30, -3);
    ctx.lineTo(-38, -12);  // Top tail fluke
    ctx.lineTo(-34, -2);
    ctx.lineTo(-34, 2);
    ctx.lineTo(-38, 12);   // Bottom tail fluke
    ctx.lineTo(-30, 3);
    ctx.lineTo(-24, 5);
    ctx.quadraticCurveTo(-18, 10, -8, 12);
    ctx.quadraticCurveTo(5, 13, 15, 9);
    ctx.quadraticCurveTo(24, 6, 28, 0);
    ctx.closePath();
}

function drawDolphin(camY) {
    const dx = dolphin.x;
    const dy = dolphin.y + camY;
    const scale = 1.4;

    ctx.save();
    ctx.translate(dx, dy);
    ctx.rotate(dolphin.angle);
    ctx.scale(scale, scale);

    // Trail effect when fast
    if (dolphin.speed > 6) {
        ctx.save();
        const trailAlpha = Math.min((dolphin.speed - 6) / 10, 0.5);
        ctx.globalAlpha = trailAlpha;
        ctx.strokeStyle = dolphin.inWater ? 'rgba(100, 200, 255, 0.5)' : 'rgba(255, 255, 255, 0.3)';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(-30, 0);
        ctx.lineTo(-30 - dolphin.speed * 3, 0);
        ctx.stroke();
        ctx.restore();
    }

    // Body gradient: dark grey-blue top, white belly (like a real dolphin)
    const bodyGrd = ctx.createLinearGradient(0, -14, 0, 14);
    bodyGrd.addColorStop(0, '#2c4a5e');
    bodyGrd.addColorStop(0.35, '#3d6b82');
    bodyGrd.addColorStop(0.55, '#8cc0d8');
    bodyGrd.addColorStop(0.75, '#d4ecf5');
    bodyGrd.addColorStop(1, '#eef7fb');

    // Outline for visibility
    ctx.strokeStyle = 'rgba(10, 30, 50, 0.6)';
    ctx.lineWidth = 1.5;
    dolphinBodyPath();
    ctx.stroke();

    // Fill body
    ctx.fillStyle = bodyGrd;
    dolphinBodyPath();
    ctx.fill();

    // Belly highlight (bright white underside)
    ctx.fillStyle = 'rgba(230, 245, 255, 0.7)';
    ctx.beginPath();
    ctx.moveTo(26, 2);
    ctx.quadraticCurveTo(15, 10, 0, 11);
    ctx.quadraticCurveTo(-15, 10, -22, 5);
    ctx.quadraticCurveTo(-15, 6, 0, 5);
    ctx.quadraticCurveTo(15, 4, 26, 2);
    ctx.closePath();
    ctx.fill();

    // Dorsal fin
    ctx.fillStyle = '#2c4a5e';
    ctx.strokeStyle = 'rgba(10, 30, 50, 0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, -12);
    ctx.quadraticCurveTo(-2, -24, -12, -22);
    ctx.quadraticCurveTo(-6, -14, -5, -11);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Pectoral fin
    ctx.fillStyle = '#3d6b82';
    ctx.beginPath();
    ctx.moveTo(5, 8);
    ctx.quadraticCurveTo(2, 18, -6, 20);
    ctx.quadraticCurveTo(-2, 14, 0, 8);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Eye
    ctx.fillStyle = '#0a1520';
    ctx.beginPath();
    ctx.arc(18, -3, 3, 0, Math.PI * 2);
    ctx.fill();

    // Eye highlight
    ctx.fillStyle = '#fff';
    ctx.beginPath();
    ctx.arc(19, -4, 1.2, 0, Math.PI * 2);
    ctx.fill();

    // Mouth line
    ctx.strokeStyle = '#1a3a4a';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(28, 0);
    ctx.quadraticCurveTo(24, 2.5, 19, 2);
    ctx.stroke();

    // Speed lines when going fast in air
    if (dolphin.speed > 12 && !dolphin.inWater) {
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.5)';
        ctx.lineWidth = 1.5;
        for (let i = 0; i < 3; i++) {
            const ly = -8 + i * 8;
            ctx.beginPath();
            ctx.moveTo(-35 - i * 5, ly);
            ctx.lineTo(-50 - dolphin.speed * 2, ly);
            ctx.stroke();
        }
    }

    ctx.restore();

    // Glow effect when doing tricks
    if (!dolphin.inWater && Math.abs(dolphin.angularVel) > 0.04) {
        ctx.save();
        ctx.globalAlpha = Math.min(Math.abs(dolphin.angularVel) * 3, 0.4);
        const glowGrd = ctx.createRadialGradient(dx, dy, 5, dx, dy, 60);
        glowGrd.addColorStop(0, 'rgba(255, 215, 0, 0.5)');
        glowGrd.addColorStop(1, 'rgba(255, 215, 0, 0)');
        ctx.fillStyle = glowGrd;
        ctx.beginPath();
        ctx.arc(dx, dy, 60, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

function drawScorePopups(camY) {
    ctx.save();
    ctx.font = '14px "Press Start 2P"';
    ctx.textAlign = 'center';
    scorePopups.forEach(p => {
        ctx.globalAlpha = p.alpha;
        ctx.fillStyle = '#ffd700';
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.lineWidth = 3;
        ctx.strokeText(p.text, p.x, p.y + camY);
        ctx.fillText(p.text, p.x, p.y + camY);
    });
    ctx.restore();
}

// ---- Game Loop ----
let lastTime = performance.now();

function gameLoop() {
    const now = performance.now();
    const dt = Math.min(now - lastTime, 50); // cap delta
    lastTime = now;

    update(dt);
    draw();

    requestAnimationFrame(gameLoop);
}

// ---- Input ----
window.addEventListener('keydown', e => {
    keys[e.key] = true;

    // Prevent scrolling
    if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', ' '].includes(e.key)) {
        e.preventDefault();
    }

    // Quick start
    if (gameState === 'title' && (e.key === 'Enter' || e.key === ' ')) {
        startGame();
    }
    if (gameState === 'gameover' && (e.key === 'Enter' || e.key === ' ')) {
        startGame();
    }
});

window.addEventListener('keyup', e => {
    keys[e.key] = false;
});

window.addEventListener('resize', resize);

// ---- Button handlers ----
document.getElementById('start-btn').addEventListener('click', startGame);
document.getElementById('restart-btn').addEventListener('click', startGame);

// Start
init();
