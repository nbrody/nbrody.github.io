/* ═══════════════════════════════════════════════════
   Space Invaders – game.js
   Canvas-based multi-level Space Invaders
   ═══════════════════════════════════════════════════ */

(() => {
    "use strict";

    // ── DOM refs ──
    const canvas = document.getElementById("game-canvas");
    const ctx = canvas.getContext("2d");

    const menuOverlay = document.getElementById("menu-overlay");
    const levelOverlay = document.getElementById("level-overlay");
    const gameoverOverlay = document.getElementById("gameover-overlay");
    const countdownEl = document.getElementById("countdown");
    const countdownText = document.getElementById("countdown-text");
    const hudEl = document.getElementById("hud");
    const touchCtrl = document.getElementById("touch-controls");

    const scoreDisplay = document.getElementById("score-display");
    const levelDisplay = document.getElementById("level-display");
    const livesDisplay = document.getElementById("lives-display");
    const finalScoreText = document.getElementById("final-score-text");
    const finalLevelText = document.getElementById("final-level-text");
    const newHighText = document.getElementById("new-high-text");
    const levelText = document.getElementById("level-text");
    const levelScoreText = document.getElementById("level-score-text");
    const levelBonusText = document.getElementById("level-bonus-text");

    const startBtn = document.getElementById("start-btn");
    const retryBtn = document.getElementById("retry-btn");
    const menuBtn = document.getElementById("menu-btn");
    const nextLevelBtn = document.getElementById("next-level-btn");

    const touchLeft = document.getElementById("touch-left");
    const touchRight = document.getElementById("touch-right");
    const touchFire = document.getElementById("touch-fire");

    // ── Constants ──
    const GAME_W = 480;
    const GAME_H = 600;
    const PLAYER_W = 40;
    const PLAYER_H = 20;
    const PLAYER_SPEED = 280; // px/sec
    const BULLET_SPEED = 450;
    const BULLET_W = 3;
    const BULLET_H = 12;
    const ENEMY_BULLET_SPEED = 180;
    const INV_W = 28;
    const INV_H = 20;
    const INV_GAP_X = 12;
    const INV_GAP_Y = 14;
    const SHIELD_Y = GAME_H - 110;
    const UFO_W = 36;
    const UFO_H = 14;
    const UFO_SPEED = 100;

    // Invader types (rows from top)
    const INV_TYPES = [
        { type: 0, pts: 40, color: "#ff2daa" },  // top row – squid
        { type: 1, pts: 20, color: "#b44dff" },  // rows 2-3 – crab
        { type: 1, pts: 20, color: "#b44dff" },
        { type: 2, pts: 10, color: "#00f0ff" },  // rows 4-5 – octopus
        { type: 2, pts: 10, color: "#00f0ff" },
    ];

    // ── Pixel art templates (8×8 grids encoded as strings, 1=filled) ──
    const SPRITES = {
        // Squid (type 0) - two frames
        squid: [
            [
                "..0110..",
                ".011110.",
                "01111110",
                "11.11.11",
                "11111111",
                "..1..1..",
                ".1.11.1.",
                "1.1..1.1",
            ],
            [
                "..0110..",
                ".011110.",
                "01111110",
                "11.11.11",
                "11111111",
                ".1.11.1.",
                "1..00..1",
                ".1....1.",
            ],
        ],
        // Crab (type 1) - two frames
        crab: [
            [
                "..1..1..",
                "..1111..",
                ".111111.",
                "11.11.11",
                "11111111",
                ".1.11.1.",
                "1......1",
                ".1....1.",
            ],
            [
                "..1..1..",
                "..1111..",
                ".111111.",
                "11.11.11",
                "11111111",
                "..1..1..",
                ".1.11.1.",
                "1.1..1.1",
            ],
        ],
        // Octopus (type 2) - two frames
        octopus: [
            [
                ".011110.",
                "11111111",
                "11111111",
                "11.11.11",
                "11111111",
                "..1111..",
                ".11..11.",
                "11....11",
            ],
            [
                ".011110.",
                "11111111",
                "11111111",
                "11.11.11",
                "11111111",
                "..1111..",
                ".1.11.1.",
                ".1....1.",
            ],
        ],
        // UFO
        ufo: [
            [
                "...1111...",
                "..111111..",
                ".11111111.",
                "1.11.11.11",
                "1111111111",
                "..11..11..",
                "...1..1...",
            ],
        ],
        // Player ship
        player: [
            [
                "....11....",
                "...1111...",
                "...1111...",
                ".1111111..",          // note: slight asymmetry is fine
                "1111111111",
                "1111111111",
            ],
        ],
    };

    // ── State ──
    let scale = 1;
    let player, invaders, bullets, enemyBullets, shields, ufo, stars;
    let score, lives, level, highScore;
    let running, animFrame;
    let invMoveDir, invMoveTimer, invMoveInterval, invDropAmount;
    let invAnimFrame;
    let enemyShootTimer;
    let particles = [];
    let shakeTimer = 0, shakeMag = 0;
    let ufoTimer;
    let levelStartScore;

    // input
    const keys = {};
    let touchMoving = 0; // -1 left, 0 none, 1 right
    let touchFiring = false;

    // ── High score ──
    function loadHigh() {
        try { return parseInt(localStorage.getItem("spaceinvaders_high") || "0", 10); }
        catch { return 0; }
    }
    function saveHigh(v) {
        try { localStorage.setItem("spaceinvaders_high", v); } catch { }
    }

    // ── Sizing ──
    function resize() {
        const hudH = 52;
        const touchH = 90;
        const isTouchDevice = "ontouchstart" in window;
        const availW = window.innerWidth - 16;
        const availH = window.innerHeight - hudH - (isTouchDevice ? touchH : 20) - 16;
        scale = Math.min(availW / GAME_W, availH / GAME_H, 2);
        scale = Math.max(scale, 0.5);
        canvas.width = Math.floor(GAME_W * scale);
        canvas.height = Math.floor(GAME_H * scale);
        canvas.style.position = "absolute";
        canvas.style.left = ((window.innerWidth - canvas.width) / 2) + "px";
        canvas.style.top = ((window.innerHeight - canvas.height) / 2) + "px";
        canvas.style.transform = "none";
    }
    window.addEventListener("resize", resize);
    resize();

    // ── Star field ──
    function initStars() {
        stars = [];
        for (let i = 0; i < 60; i++) {
            stars.push({
                x: Math.random() * GAME_W,
                y: Math.random() * GAME_H,
                size: 0.5 + Math.random() * 1.5,
                speed: 5 + Math.random() * 15,
                brightness: 0.2 + Math.random() * 0.5,
            });
        }
    }

    function updateStars(dt) {
        for (const s of stars) {
            s.y += s.speed * dt;
            if (s.y > GAME_H) {
                s.y = 0;
                s.x = Math.random() * GAME_W;
            }
        }
    }

    function drawStars() {
        for (const s of stars) {
            ctx.globalAlpha = s.brightness;
            ctx.fillStyle = "#fff";
            ctx.fillRect(s.x * scale, s.y * scale, s.size * scale, s.size * scale);
        }
        ctx.globalAlpha = 1;
    }

    // ── Particles ──
    function emitParticles(x, y, color, count, spread) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const spd = spread * (0.3 + Math.random() * 0.7);
            particles.push({
                x, y,
                vx: Math.cos(angle) * spd,
                vy: Math.sin(angle) * spd,
                life: 0.3 + Math.random() * 0.5,
                maxLife: 0.3 + Math.random() * 0.5,
                color,
                size: 1.5 + Math.random() * 2.5,
            });
        }
    }

    function updateParticles(dt) {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx * dt * 60;
            p.y += p.vy * dt * 60;
            p.vx *= 0.97;
            p.vy *= 0.97;
            p.life -= dt;
            if (p.life <= 0) particles.splice(i, 1);
        }
    }

    function drawParticles() {
        for (const p of particles) {
            const alpha = Math.max(0, p.life / p.maxLife);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            ctx.fillRect(
                (p.x - p.size / 2) * scale,
                (p.y - p.size / 2) * scale,
                p.size * scale, p.size * scale
            );
        }
        ctx.globalAlpha = 1;
    }

    // ── Sprite drawing ──
    function drawSprite(template, x, y, w, h, color) {
        const rows = template.length;
        const cols = template[0].length;
        const pw = w / cols;
        const ph = h / rows;
        ctx.fillStyle = color;
        for (let r = 0; r < rows; r++) {
            for (let c = 0; c < cols; c++) {
                if (template[r][c] === "1") {
                    ctx.fillRect(
                        (x + c * pw) * scale,
                        (y + r * ph) * scale,
                        Math.ceil(pw * scale),
                        Math.ceil(ph * scale)
                    );
                }
            }
        }
    }

    // ── Shields ──
    function createShields() {
        shields = [];
        const shieldCount = 4;
        const sw = 44;
        const sh = 32;
        const totalW = shieldCount * sw;
        const spacing = (GAME_W - totalW) / (shieldCount + 1);
        for (let i = 0; i < shieldCount; i++) {
            const sx = spacing + i * (sw + spacing);
            // Create pixel grid for shield
            const grid = [];
            for (let r = 0; r < sh; r++) {
                const row = [];
                for (let c = 0; c < sw; c++) {
                    // Arch shape - filled except for the bottom-center arch
                    const inArch = r > sh * 0.55 && c > sw * 0.25 && c < sw * 0.75;
                    // Round top corners
                    const cornerR = 6;
                    const inTopLeft = c < cornerR && r < cornerR &&
                        ((c - cornerR) ** 2 + (r - cornerR) ** 2) > cornerR ** 2;
                    const inTopRight = c >= sw - cornerR && r < cornerR &&
                        ((c - (sw - cornerR - 1)) ** 2 + (r - cornerR) ** 2) > cornerR ** 2;
                    row.push(!inArch && !inTopLeft && !inTopRight ? 1 : 0);
                }
                grid.push(row);
            }
            shields.push({ x: sx, y: SHIELD_Y, w: sw, h: sh, grid });
        }
    }

    function drawShields() {
        for (const s of shields) {
            for (let r = 0; r < s.h; r++) {
                for (let c = 0; c < s.w; c++) {
                    if (s.grid[r][c]) {
                        ctx.fillStyle = "#39ff14";
                        ctx.fillRect(
                            (s.x + c) * scale,
                            (s.y + r) * scale,
                            Math.ceil(scale), Math.ceil(scale)
                        );
                    }
                }
            }
        }
    }

    function damageShield(shield, hitX, hitY, radius) {
        const lx = Math.floor(hitX - shield.x);
        const ly = Math.floor(hitY - shield.y);
        const r = Math.ceil(radius);
        for (let dy = -r; dy <= r; dy++) {
            for (let dx = -r; dx <= r; dx++) {
                if (dx * dx + dy * dy <= r * r) {
                    const gx = lx + dx;
                    const gy = ly + dy;
                    if (gx >= 0 && gx < shield.w && gy >= 0 && gy < shield.h) {
                        shield.grid[gy][gx] = 0;
                    }
                }
            }
        }
    }

    // ── Level configuration ──
    function getLevelConfig(lvl) {
        const baseRows = 5;
        const baseCols = 8;
        return {
            cols: Math.min(baseCols + Math.floor((lvl - 1) / 3), 11),
            rows: Math.min(baseRows + Math.floor((lvl - 1) / 4), 7),
            moveInterval: Math.max(200, 600 - (lvl - 1) * 40),   // ms per step
            dropAmount: 12 + Math.min(lvl * 2, 20),
            shootInterval: Math.max(400, 1500 - (lvl - 1) * 100), // ms between enemy shots
            bulletSpeed: ENEMY_BULLET_SPEED + Math.min(lvl * 12, 140),
            ufoFrequency: Math.max(8, 25 - lvl * 2), // seconds between UFO
        };
    }

    // ── Init level ──
    function initLevel() {
        const cfg = getLevelConfig(level);

        // Player
        player = {
            x: GAME_W / 2 - PLAYER_W / 2,
            y: GAME_H - 40,
            w: PLAYER_W, h: PLAYER_H,
            shootCooldown: 0,
            invincible: 0,
        };

        // Invaders
        invaders = [];
        const typeRows = INV_TYPES.slice(0, cfg.rows);
        // Pad if more rows than type definitions
        while (typeRows.length < cfg.rows) {
            typeRows.push(INV_TYPES[INV_TYPES.length - 1]);
        }

        const gridW = cfg.cols * (INV_W + INV_GAP_X) - INV_GAP_X;
        const startX = (GAME_W - gridW) / 2;
        const startY = 60;

        for (let r = 0; r < cfg.rows; r++) {
            for (let c = 0; c < cfg.cols; c++) {
                invaders.push({
                    x: startX + c * (INV_W + INV_GAP_X),
                    y: startY + r * (INV_H + INV_GAP_Y),
                    w: INV_W, h: INV_H,
                    type: typeRows[r].type,
                    pts: typeRows[r].pts,
                    color: typeRows[r].color,
                    alive: true,
                });
            }
        }

        invMoveDir = 1;
        invMoveTimer = 0;
        invMoveInterval = cfg.moveInterval;
        invDropAmount = cfg.dropAmount;
        invAnimFrame = 0;
        enemyShootTimer = cfg.shootInterval * 0.5; // first shot comes quicker

        bullets = [];
        enemyBullets = [];
        particles = [];
        ufo = null;
        ufoTimer = cfg.ufoFrequency;
        levelStartScore = score;

        createShields();
    }

    // ── HUD ──
    function updateHUD() {
        scoreDisplay.textContent = score;
        levelDisplay.textContent = level;
        livesDisplay.textContent = "♥".repeat(Math.max(0, lives));
    }

    // ── Tick ──
    function update(dt) {
        if (!running) return;
        const cfg = getLevelConfig(level);

        // ── Player movement ──
        let moveDir = 0;
        if (keys["ArrowLeft"] || keys["a"] || keys["A"] || touchMoving < 0) moveDir -= 1;
        if (keys["ArrowRight"] || keys["d"] || keys["D"] || touchMoving > 0) moveDir += 1;
        player.x += moveDir * PLAYER_SPEED * dt;
        player.x = Math.max(4, Math.min(GAME_W - player.w - 4, player.x));

        // shoot cooldown
        player.shootCooldown -= dt;
        player.invincible -= dt;

        if ((keys[" "] || keys["ArrowUp"] || touchFiring) && player.shootCooldown <= 0) {
            bullets.push({
                x: player.x + player.w / 2 - BULLET_W / 2,
                y: player.y - BULLET_H,
                w: BULLET_W, h: BULLET_H,
            });
            player.shootCooldown = 0.25;
        }

        // ── Player bullets ──
        for (let i = bullets.length - 1; i >= 0; i--) {
            const b = bullets[i];
            b.y -= BULLET_SPEED * dt;
            if (b.y + b.h < 0) { bullets.splice(i, 1); continue; }

            // hit invader?
            let hit = false;
            for (const inv of invaders) {
                if (!inv.alive) continue;
                if (aabb(b, inv)) {
                    inv.alive = false;
                    score += inv.pts;
                    emitParticles(inv.x + inv.w / 2, inv.y + inv.h / 2, inv.color, 14, 3);
                    hit = true;
                    break;
                }
            }

            // hit UFO?
            if (!hit && ufo && aabb(b, ufo)) {
                score += ufo.pts;
                emitParticles(ufo.x + ufo.w / 2, ufo.y + ufo.h / 2, "#ff6a00", 20, 4);
                ufo = null;
                hit = true;
            }

            // hit shield?
            if (!hit) {
                for (const s of shields) {
                    if (bulletHitsShield(b, s)) {
                        damageShield(s, b.x + b.w / 2 - s.x, b.y + b.h - s.y, 3);
                        hit = true;
                        break;
                    }
                }
            }

            if (hit) bullets.splice(i, 1);
        }

        // ── Invader movement ──
        invMoveTimer -= dt * 1000;
        const aliveCount = invaders.filter(v => v.alive).length;
        // Speed up as fewer remain
        const speedMult = Math.max(0.3, aliveCount / invaders.length);
        const effectiveInterval = invMoveInterval * speedMult;

        if (invMoveTimer <= 0) {
            invMoveTimer = effectiveInterval;
            invAnimFrame = 1 - invAnimFrame;

            // Check if any invader at edge
            let atEdge = false;
            for (const inv of invaders) {
                if (!inv.alive) continue;
                if ((invMoveDir > 0 && inv.x + inv.w >= GAME_W - 10) ||
                    (invMoveDir < 0 && inv.x <= 10)) {
                    atEdge = true;
                    break;
                }
            }

            if (atEdge) {
                // Drop and reverse
                invMoveDir *= -1;
                for (const inv of invaders) {
                    if (inv.alive) inv.y += invDropAmount;
                }
            } else {
                const step = 8 + Math.min(level * 2, 12);
                for (const inv of invaders) {
                    if (inv.alive) inv.x += step * invMoveDir;
                }
            }
        }

        // ── Enemy shooting ──
        enemyShootTimer -= dt * 1000;
        if (enemyShootTimer <= 0) {
            enemyShootTimer = cfg.shootInterval * (0.6 + Math.random() * 0.8);
            // Pick a random column's lowest invader
            const alive = invaders.filter(v => v.alive);
            if (alive.length > 0) {
                // Group by approximate column
                const cols = {};
                for (const inv of alive) {
                    const col = Math.round(inv.x / (INV_W + INV_GAP_X));
                    if (!cols[col] || inv.y > cols[col].y) {
                        cols[col] = inv;
                    }
                }
                const bottomRow = Object.values(cols);
                const shooter = bottomRow[Math.floor(Math.random() * bottomRow.length)];
                enemyBullets.push({
                    x: shooter.x + shooter.w / 2 - 1.5,
                    y: shooter.y + shooter.h,
                    w: 3, h: 10,
                    speed: cfg.bulletSpeed,
                });
            }
        }

        // ── Enemy bullets ──
        for (let i = enemyBullets.length - 1; i >= 0; i--) {
            const b = enemyBullets[i];
            b.y += b.speed * dt;
            if (b.y > GAME_H) { enemyBullets.splice(i, 1); continue; }

            // hit shield?
            let hit = false;
            for (const s of shields) {
                if (bulletHitsShield(b, s)) {
                    damageShield(s, b.x + b.w / 2 - s.x, b.y - s.y, 4);
                    hit = true;
                    break;
                }
            }

            // hit player?
            if (!hit && player.invincible <= 0 && aabb(b, player)) {
                playerHit();
                hit = true;
            }

            if (hit) enemyBullets.splice(i, 1);
        }

        // ── Invaders reaching bottom / player ──
        for (const inv of invaders) {
            if (!inv.alive) continue;
            if (inv.y + inv.h >= player.y) {
                return gameOver();
            }
        }

        // ── Invaders touching shields – destroy shield pixels ──
        for (const inv of invaders) {
            if (!inv.alive) continue;
            for (const s of shields) {
                if (inv.x + inv.w > s.x && inv.x < s.x + s.w &&
                    inv.y + inv.h > s.y && inv.y < s.y + s.h) {
                    // Destroy overlapping section
                    const x0 = Math.max(0, Math.floor(inv.x - s.x));
                    const x1 = Math.min(s.w - 1, Math.floor(inv.x + inv.w - s.x));
                    const y0 = Math.max(0, Math.floor(inv.y - s.y));
                    const y1 = Math.min(s.h - 1, Math.floor(inv.y + inv.h - s.y));
                    for (let yr = y0; yr <= y1; yr++) {
                        for (let xr = x0; xr <= x1; xr++) {
                            s.grid[yr][xr] = 0;
                        }
                    }
                }
            }
        }

        // ── UFO ──
        ufoTimer -= dt;
        if (!ufo && ufoTimer <= 0) {
            const fromLeft = Math.random() < 0.5;
            ufo = {
                x: fromLeft ? -UFO_W : GAME_W,
                y: 28,
                w: UFO_W, h: UFO_H,
                dir: fromLeft ? 1 : -1,
                pts: [50, 100, 150, 200, 300][Math.floor(Math.random() * 5)],
            };
            ufoTimer = cfg.ufoFrequency * (0.6 + Math.random() * 0.8);
        }
        if (ufo) {
            ufo.x += ufo.dir * UFO_SPEED * dt;
            if ((ufo.dir > 0 && ufo.x > GAME_W + 10) || (ufo.dir < 0 && ufo.x + ufo.w < -10)) {
                ufo = null;
            }
        }

        // ── Stars ──
        updateStars(dt);

        // ── Particles ──
        updateParticles(dt);

        // ── Shake ──
        shakeTimer = Math.max(0, shakeTimer - dt);

        // ── Win check ──
        if (invaders.every(v => !v.alive)) {
            levelComplete();
        }

        // ── Update high ──
        if (score > highScore) {
            highScore = score;
            saveHigh(highScore);
        }
        updateHUD();
    }

    function playerHit() {
        lives--;
        emitParticles(player.x + player.w / 2, player.y + player.h / 2, "#39ff14", 20, 4);
        shakeTimer = 0.3;
        shakeMag = 6;
        player.invincible = 1.5;
        if (lives <= 0) {
            gameOver();
        }
    }

    // ── Collision helpers ──
    function aabb(a, b) {
        return a.x < b.x + b.w && a.x + a.w > b.x &&
            a.y < b.y + b.h && a.y + a.h > b.y;
    }

    function bulletHitsShield(bullet, shield) {
        if (bullet.x + bullet.w < shield.x || bullet.x > shield.x + shield.w ||
            bullet.y + bullet.h < shield.y || bullet.y > shield.y + shield.h) {
            return false;
        }
        // Check if any pixel in the overlap is solid
        const x0 = Math.max(0, Math.floor(bullet.x - shield.x));
        const x1 = Math.min(shield.w - 1, Math.floor(bullet.x + bullet.w - shield.x));
        const y0 = Math.max(0, Math.floor(bullet.y - shield.y));
        const y1 = Math.min(shield.h - 1, Math.floor(bullet.y + bullet.h - shield.y));
        for (let yr = y0; yr <= y1; yr++) {
            for (let xr = x0; xr <= x1; xr++) {
                if (shield.grid[yr][xr]) return true;
            }
        }
        return false;
    }

    // ── Drawing ──
    function draw() {
        const w = canvas.width, h = canvas.height;

        // Shake offset
        let sx = 0, sy = 0;
        if (shakeTimer > 0) {
            sx = (Math.random() - 0.5) * shakeMag * scale;
            sy = (Math.random() - 0.5) * shakeMag * scale;
        }

        ctx.save();
        ctx.translate(sx, sy);

        // Clear
        ctx.fillStyle = "#060a14";
        ctx.fillRect(-sx, -sy, w + Math.abs(sx) * 2, h + Math.abs(sy) * 2);

        // Stars
        drawStars();

        // Shields
        drawShields();

        // Player
        if (player.invincible > 0 && Math.floor(player.invincible * 10) % 2 === 0) {
            // flicker
        } else {
            const pSprite = SPRITES.player[0];
            ctx.shadowColor = "#39ff14";
            ctx.shadowBlur = 8 * scale;
            drawSprite(pSprite, player.x, player.y, player.w, player.h, "#39ff14");
            ctx.shadowBlur = 0;
        }

        // Invaders
        const spriteKeys = ["squid", "crab", "octopus"];
        for (const inv of invaders) {
            if (!inv.alive) continue;
            const key = spriteKeys[inv.type];
            const frame = SPRITES[key][invAnimFrame] || SPRITES[key][0];
            ctx.shadowColor = inv.color;
            ctx.shadowBlur = 4 * scale;
            drawSprite(frame, inv.x, inv.y, inv.w, inv.h, inv.color);
            ctx.shadowBlur = 0;
        }

        // UFO
        if (ufo) {
            const uSprite = SPRITES.ufo[0];
            ctx.shadowColor = "#ff6a00";
            ctx.shadowBlur = 10 * scale;
            drawSprite(uSprite, ufo.x, ufo.y, ufo.w, ufo.h, "#ff6a00");
            ctx.shadowBlur = 0;
            // point label
            ctx.fillStyle = "#ffd700";
            ctx.font = `${Math.round(8 * scale)}px Orbitron`;
            ctx.textAlign = "center";
            ctx.fillText(ufo.pts, (ufo.x + ufo.w / 2) * scale, (ufo.y - 3) * scale);
        }

        // Player bullets
        ctx.shadowColor = "#00f0ff";
        ctx.shadowBlur = 6 * scale;
        ctx.fillStyle = "#00f0ff";
        for (const b of bullets) {
            ctx.fillRect(b.x * scale, b.y * scale, b.w * scale, b.h * scale);
        }
        ctx.shadowBlur = 0;

        // Enemy bullets
        ctx.shadowColor = "#ff2daa";
        ctx.shadowBlur = 6 * scale;
        ctx.fillStyle = "#ff2daa";
        for (const b of enemyBullets) {
            // Zigzag shape
            const bx = b.x * scale, by = b.y * scale;
            const bw = b.w * scale, bh = b.h * scale;
            ctx.fillRect(bx, by, bw, bh * 0.4);
            ctx.fillRect(bx + bw * 0.5, by + bh * 0.3, bw, bh * 0.4);
            ctx.fillRect(bx, by + bh * 0.6, bw, bh * 0.4);
        }
        ctx.shadowBlur = 0;

        // Ground line
        ctx.strokeStyle = "rgba(57,255,20,.15)";
        ctx.lineWidth = scale;
        ctx.beginPath();
        ctx.moveTo(0, (GAME_H - 12) * scale);
        ctx.lineTo(GAME_W * scale, (GAME_H - 12) * scale);
        ctx.stroke();

        // Particles
        drawParticles();

        ctx.restore();
    }

    // ── Game flow ──
    function startNewGame() {
        score = 0;
        lives = 3;
        level = 1;
        highScore = loadHigh();
        initStars();
        initLevel();
        menuOverlay.classList.add("hidden");
        gameoverOverlay.classList.add("hidden");
        showCountdown(() => {
            hudEl.classList.remove("hidden");
            if ("ontouchstart" in window) touchCtrl.classList.remove("hidden");
            beginLoop();
        });
    }

    function showCountdown(cb) {
        countdownEl.classList.remove("hidden");
        let n = 3;
        countdownText.textContent = n;
        const iv = setInterval(() => {
            n--;
            if (n === 0) {
                countdownText.textContent = "GO!";
            } else if (n < 0) {
                clearInterval(iv);
                countdownEl.classList.add("hidden");
                cb();
            } else {
                countdownText.textContent = n;
            }
            countdownText.style.animation = "none";
            void countdownText.offsetWidth;
            countdownText.style.animation = "";
        }, 550);
    }

    // ── Main loop ──
    let _prevTime = 0;
    function gameLoop(timestamp) {
        if (!running) return;
        animFrame = requestAnimationFrame(gameLoop);
        const dtMs = timestamp - _prevTime;
        _prevTime = timestamp;
        const dt = Math.min(dtMs / 1000, 0.05); // cap at 50ms

        update(dt);
        if (running) draw();
    }

    function beginLoop() {
        _prevTime = performance.now();
        running = true;
        requestAnimationFrame(gameLoop);
    }

    function levelComplete() {
        running = false;
        cancelAnimationFrame(animFrame);
        const bonus = lives * 100 + level * 50;
        score += bonus;
        if (score > highScore) {
            highScore = score;
            saveHigh(highScore);
        }
        levelText.textContent = `WAVE ${level} CLEARED!`;
        levelScoreText.textContent = `Score: ${score}`;
        levelBonusText.textContent = `Bonus: +${bonus} (lives × 100 + wave × 50)`;
        hudEl.classList.add("hidden");
        touchCtrl.classList.add("hidden");
        levelOverlay.classList.remove("hidden");
    }

    function gameOver() {
        running = false;
        cancelAnimationFrame(animFrame);
        const isNew = score >= highScore && score > 0;
        if (isNew) saveHigh(score);
        finalScoreText.textContent = `Final Score: ${score}`;
        finalLevelText.textContent = `Reached Wave: ${level}`;
        newHighText.classList.toggle("hidden", !isNew);
        hudEl.classList.add("hidden");
        touchCtrl.classList.add("hidden");
        gameoverOverlay.classList.remove("hidden");
    }

    function backToMenu() {
        running = false;
        cancelAnimationFrame(animFrame);
        hudEl.classList.add("hidden");
        touchCtrl.classList.add("hidden");
        levelOverlay.classList.add("hidden");
        gameoverOverlay.classList.add("hidden");
        menuOverlay.classList.remove("hidden");
    }

    // ── Input ──
    document.addEventListener("keydown", (e) => {
        keys[e.key] = true;
        if (["ArrowLeft", "ArrowRight", "ArrowUp", " "].includes(e.key)) {
            e.preventDefault();
        }
    });
    document.addEventListener("keyup", (e) => {
        keys[e.key] = false;
    });

    // Touch controls
    function addTouchHold(el, onDown, onUp) {
        el.addEventListener("touchstart", (e) => { e.preventDefault(); onDown(); }, { passive: false });
        el.addEventListener("touchend", (e) => { e.preventDefault(); onUp(); }, { passive: false });
        el.addEventListener("touchcancel", (e) => { e.preventDefault(); onUp(); }, { passive: false });
        el.addEventListener("mousedown", onDown);
        el.addEventListener("mouseup", onUp);
        el.addEventListener("mouseleave", onUp);
    }

    addTouchHold(touchLeft,
        () => { touchMoving = -1; },
        () => { if (touchMoving === -1) touchMoving = 0; }
    );
    addTouchHold(touchRight,
        () => { touchMoving = 1; },
        () => { if (touchMoving === 1) touchMoving = 0; }
    );
    addTouchHold(touchFire,
        () => { touchFiring = true; },
        () => { touchFiring = false; }
    );

    // ── Button events ──
    startBtn.addEventListener("click", startNewGame);

    retryBtn.addEventListener("click", () => {
        gameoverOverlay.classList.add("hidden");
        startNewGame();
    });

    nextLevelBtn.addEventListener("click", () => {
        levelOverlay.classList.add("hidden");
        level++;
        initLevel();
        showCountdown(() => {
            hudEl.classList.remove("hidden");
            if ("ontouchstart" in window) touchCtrl.classList.remove("hidden");
            beginLoop();
        });
    });

    menuBtn.addEventListener("click", backToMenu);

    // ── Initial state ──
    highScore = loadHigh();
    initStars();

})();
