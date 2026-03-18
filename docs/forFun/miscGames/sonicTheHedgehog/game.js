// ============================================================
//  game.js  –  Main game loop, input, camera, state management
// ============================================================
(() => {
    'use strict';

    // ─── Canvas setup ───
    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');

    function resize() {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
    }
    window.addEventListener('resize', resize);
    resize();

    // ─── DOM refs ───
    const titleScreen = document.getElementById('title-screen');
    const gameoverScreen = document.getElementById('gameover-screen');
    const victoryScreen = document.getElementById('victory-screen');
    const scoreEl = document.getElementById('score-value');
    const timeEl = document.getElementById('time-value');
    const ringsEl = document.getElementById('rings-value');
    const livesEl = document.getElementById('lives-value');
    const finalScoreEl = document.getElementById('final-score');
    const victoryStatsEl = document.getElementById('victory-stats');
    const hud = document.getElementById('hud');

    // ─── Game state ───
    let gameState = 'title'; // title, playing, gameover, victory
    let sonic, segments, platforms, rings, enemies, springs, checkpoints, decorations;
    let scatteredRings = [];
    let explosions = [];
    let score = 0, ringCount = 0, lives = 3;
    let gameTime = 0; // in frames (60fps)
    let globalTime = 0;
    let lastCheckpoint = null;

    // ─── Camera ───
    let camX = 0, camY = 0;
    const CAM_LEAD = 0.08;

    // ─── Input ───
    const keys = {};
    const input = {
        left: false, right: false, up: false, down: false,
        jump: false, jumpPressed: false
    };
    let jumpWasDown = false;

    window.addEventListener('keydown', e => {
        keys[e.code] = true;
        if (e.code === 'Space' || e.code === 'ArrowUp' || e.code === 'ArrowDown') e.preventDefault();
    });
    window.addEventListener('keyup', e => {
        keys[e.code] = false;
    });

    // Mobile controls
    function setupMobileBtn(id, key) {
        const btn = document.getElementById(id);
        if (!btn) return;
        const press = e => { e.preventDefault(); keys[key] = true; };
        const release = e => { e.preventDefault(); keys[key] = false; };
        btn.addEventListener('touchstart', press, { passive: false });
        btn.addEventListener('touchend', release, { passive: false });
        btn.addEventListener('touchcancel', release, { passive: false });
        btn.addEventListener('mousedown', press);
        btn.addEventListener('mouseup', release);
        btn.addEventListener('mouseleave', release);
    }
    setupMobileBtn('btn-left', 'ArrowLeft');
    setupMobileBtn('btn-right', 'ArrowRight');
    setupMobileBtn('btn-down', 'ArrowDown');
    setupMobileBtn('btn-jump', 'Space');

    function updateInput() {
        input.left = keys['ArrowLeft'] || keys['KeyA'] || false;
        input.right = keys['ArrowRight'] || keys['KeyD'] || false;
        input.up = keys['ArrowUp'] || keys['KeyW'] || false;
        input.down = keys['ArrowDown'] || keys['KeyS'] || false;
        input.jump = keys['Space'] || keys['ArrowUp'] || false;
        input.jumpPressed = input.jump && !jumpWasDown;
        jumpWasDown = input.jump;
    }

    // ─── Init level ───
    function initLevel() {
        const terrain = Level.generateTerrain();
        segments = terrain.segments;
        platforms = terrain.platforms;
        rings = Level.generateRings(terrain);
        enemies = Level.generateEnemies();
        springs = Level.generateSprings();
        checkpoints = Level.generateCheckpoints();
        decorations = Level.generateDecorations();
        scatteredRings = [];
        explosions = [];
        score = 0;
        ringCount = 0;
        gameTime = 0;
        lastCheckpoint = null;

        const startX = 100;
        const startY = Level.GROUND_Y - Sonic.HEIGHT - 10;
        sonic = Sonic.createSonic(startX, startY);
    }

    function respawn() {
        scatteredRings = [];
        explosions = [];
        if (lastCheckpoint) {
            sonic = Sonic.createSonic(lastCheckpoint.x, lastCheckpoint.y - Sonic.HEIGHT - 10);
        } else {
            sonic = Sonic.createSonic(100, Level.GROUND_Y - Sonic.HEIGHT - 10);
        }
    }

    // ─── Start game ───
    function startGame() {
        gameState = 'playing';
        titleScreen.style.display = 'none';
        gameoverScreen.classList.add('hidden');
        victoryScreen.classList.add('hidden');
        hud.style.display = 'flex';
        lives = 3;
        initLevel();
        AudioManager.resumeCtx();
    }

    // ─── Title / restart handling ───
    function handleMenuInput() {
        if (keys['Enter'] || keys['Space']) {
            keys['Enter'] = false;
            keys['Space'] = false;
            if (gameState === 'title') {
                startGame();
            } else if (gameState === 'gameover' || gameState === 'victory') {
                startGame();
            }
        }
    }

    // Click/tap to start
    document.addEventListener('click', () => {
        if (gameState === 'title') startGame();
        else if (gameState === 'gameover' || gameState === 'victory') startGame();
    });
    document.addEventListener('touchstart', () => {
        if (gameState === 'title') startGame();
        else if (gameState === 'gameover' || gameState === 'victory') startGame();
    }, { passive: true });

    // ─── Update ───
    function update() {
        globalTime++;
        updateInput();

        if (gameState !== 'playing') {
            handleMenuInput();
            return;
        }

        gameTime++;

        // Update Sonic
        Sonic.update(sonic, input, segments, platforms, 1);

        // ─── Ring collection ───
        rings.forEach(r => {
            if (r.collected) return;
            const dx = (sonic.x + sonic.width / 2) - r.x;
            const dy = (sonic.y + sonic.height / 2) - r.y;
            if (dx * dx + dy * dy < 500) {
                r.collected = true;
                r.collectTime = 0;
                ringCount++;
                score += 10;
                AudioManager.ring();
            }
        });

        // ─── Enemy interactions ───
        enemies.forEach(e => {
            if (!e.alive) return;

            // Patrol movement
            e.x += e.vx * e.dir;
            if (e.x < e.patrolL) { e.dir = 1; }
            if (e.x > e.patrolR) { e.dir = -1; }

            // Collision with Sonic
            const dx = (sonic.x + sonic.width / 2) - e.x;
            const dy = (sonic.y + sonic.height / 2) - (e.y - e.h / 2);
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < 28) {
                // Check if Sonic is above (jumping/rolling on top)
                const sonicBot = sonic.y + sonic.height;
                const isAbove = sonicBot < e.y - 2 && sonic.vy > 0;
                const isRolling = sonic.state === 'jumping' || sonic.state === 'rolling';

                if (isAbove || isRolling) {
                    // Destroy enemy
                    e.alive = false;
                    sonic.vy = -8; // bounce
                    score += 100;
                    explosions.push({ x: e.x, y: e.y - e.h / 2, t: 0 });
                    AudioManager.destroy();
                } else if (sonic.invincibleTimer <= 0 && sonic.state !== 'hurt') {
                    hurtSonic();
                }
            }
        });

        // ─── Spring interactions ───
        springs.forEach(sp => {
            if (sp.compressed > 0) sp.compressed--;
            const dx = (sonic.x + sonic.width / 2) - sp.x;
            const dy = (sonic.y + sonic.height) - sp.y;
            if (Math.abs(dx) < 16 && dy >= -5 && dy <= 10 && sonic.vy >= 0) {
                sonic.vy = sp.power;
                sonic.grounded = false;
                sonic.state = 'jumping';
                sp.compressed = 12;
                AudioManager.spring();
            }
        });

        // ─── Checkpoint interactions ───
        checkpoints.forEach(cp => {
            if (cp.activated) return;
            const dx = (sonic.x + sonic.width / 2) - cp.x;
            const dy = (sonic.y + sonic.height / 2) - cp.y;
            if (Math.abs(dx) < 24 && Math.abs(dy) < 40) {
                cp.activated = true;
                lastCheckpoint = cp;
                AudioManager.checkpoint();
            }
        });

        // ─── Scattered rings update ───
        Entities.updateScatteredRings(scatteredRings, 1);

        // ─── Explosions update ───
        for (let i = explosions.length - 1; i >= 0; i--) {
            explosions[i].t++;
            if (explosions[i].t > 25) explosions.splice(i, 1);
        }

        // ─── Ring collection animation timer ───
        rings.forEach(r => { if (r.collected) r.collectTime++; });

        // ─── Check death pit ───
        if (sonic.y > Level.LEVEL_BOTTOM) {
            if (sonic.state !== 'dead') {
                killSonic();
            }
        }

        // ─── Check goal ───
        if (sonic.x > Level.GOAL_X && gameState === 'playing') {
            gameState = 'victory';
            AudioManager.clear();
            const timeStr = formatTime(gameTime);
            const timeBonus = Math.max(0, 600 - Math.floor(gameTime / 60)) * 10;
            const ringBonus = ringCount * 100;
            victoryStatsEl.innerHTML =
                `SCORE: ${score}<br>` +
                `TIME: ${timeStr}<br>` +
                `RINGS: ${ringCount}<br>` +
                `<br>TIME BONUS: ${timeBonus}<br>` +
                `RING BONUS: ${ringBonus}<br>` +
                `<br>TOTAL: ${score + timeBonus + ringBonus}`;
            victoryScreen.classList.remove('hidden');
        }

        // ─── Camera ───
        updateCamera();

        // ─── HUD ───
        scoreEl.textContent = score;
        timeEl.textContent = formatTime(gameTime);
        ringsEl.textContent = ringCount;
        livesEl.textContent = lives;

        // Flash rings when 0
        if (ringCount === 0) {
            ringsEl.style.color = Math.floor(globalTime / 15) % 2 === 0 ? '#FF1744' : '#FFD700';
        } else {
            ringsEl.style.color = '#FFD700';
        }
    }

    function hurtSonic() {
        if (ringCount > 0) {
            // Scatter rings
            const scatter = Math.min(ringCount, 20);
            scatteredRings = scatteredRings.concat(
                Entities.createScatteredRings(sonic.x + sonic.width / 2, sonic.y + sonic.height / 2, scatter)
            );
            ringCount = 0;
            AudioManager.hurt();
        } else {
            killSonic();
            return;
        }
        sonic.state = 'hurt';
        sonic.vx = -sonic.facing * 4;
        sonic.vy = -6;
        sonic.grounded = false;
        sonic.hurtTimer = 40;
        sonic.invincibleTimer = 120;
    }

    function killSonic() {
        sonic.state = 'dead';
        sonic.vy = -10;
        sonic.vx = 0;
        AudioManager.die();
        lives--;

        setTimeout(() => {
            if (lives > 0) {
                respawn();
                gameState = 'playing';
            } else {
                gameState = 'gameover';
                finalScoreEl.innerHTML = `SCORE: ${score}<br>RINGS: ${ringCount}`;
                gameoverScreen.classList.remove('hidden');
            }
        }, 2000);
    }

    function updateCamera() {
        const targetX = sonic.x - canvas.width * 0.35 + sonic.facing * 60;
        const targetY = sonic.y - canvas.height * 0.55;
        camX += (targetX - camX) * CAM_LEAD;
        camY += (targetY - camY) * CAM_LEAD;
        camX = Math.max(0, camX);
        camY = Math.min(camY, Level.GROUND_Y - canvas.height * 0.3);
    }

    function formatTime(frames) {
        const secs = Math.floor(frames / 60);
        const mins = Math.floor(secs / 60);
        const s = secs % 60;
        return `${mins}:${String(s).padStart(2, '0')}`;
    }

    // ─── Render ───
    function render() {
        const W = canvas.width;
        const H = canvas.height;

        ctx.clearRect(0, 0, W, H);

        if (gameState === 'title') {
            // Animated title background
            Renderer.drawBackground(ctx, W, H, globalTime * 0.5, 0);
            Renderer.drawWater(ctx, W, H, globalTime * 0.5, globalTime);
            return;
        }

        // ─── Background ───
        Renderer.drawBackground(ctx, W, H, camX, camY);

        // ─── Decorations (behind terrain) ───
        Renderer.drawDecorations(ctx, W, H, camX, camY,
            decorations.filter(d => d.type === 'palm'));

        // ─── Terrain ───
        Renderer.drawTerrain(ctx, W, H, camX, camY, segments);
        Renderer.drawTerrain(ctx, W, H, camX, camY, platforms);

        // ─── Decorations (in front) ───
        Renderer.drawDecorations(ctx, W, H, camX, camY,
            decorations.filter(d => d.type !== 'palm'));

        // ─── Springs ───
        springs.forEach(sp => {
            const sx = sp.x - camX;
            const sy = sp.y - camY;
            if (sx > -50 && sx < W + 50) {
                Entities.drawSpring(ctx, sx, sy, sp.compressed);
            }
        });

        // ─── Checkpoints ───
        checkpoints.forEach(cp => {
            const sx = cp.x - camX;
            const sy = cp.y - camY;
            if (sx > -50 && sx < W + 50) {
                Entities.drawCheckpoint(ctx, sx, sy, cp.activated, globalTime);
            }
        });

        // ─── Rings ───
        rings.forEach(r => {
            if (r.collected) {
                if (r.collectTime < 30) {
                    Entities.drawCollectedRing(ctx, r.x - camX, r.y - camY, r.collectTime);
                }
                return;
            }
            const sx = r.x - camX;
            if (sx > -20 && sx < W + 20) {
                Entities.drawRing(ctx, sx, r.y - camY, globalTime);
            }
        });

        // ─── Scattered rings ───
        Entities.drawScatteredRings(ctx, scatteredRings, camX, camY, globalTime);

        // ─── Enemies ───
        enemies.forEach(e => {
            if (!e.alive) return;
            const sx = e.x - camX;
            const sy = e.y - camY;
            if (sx < -50 || sx > W + 50) return;

            if (e.type === 'motobug') {
                Entities.drawMotobug(ctx, sx, sy, e.dir, globalTime);
            } else if (e.type === 'buzzbomber') {
                Entities.drawBuzzBomber(ctx, sx, sy, e.dir, globalTime);
            }
        });

        // ─── Explosions ───
        explosions.forEach(ex => {
            Entities.drawExplosion(ctx, ex.x - camX, ex.y - camY, ex.t);
        });

        // ─── Sonic ───
        if (sonic) {
            Sonic.draw(ctx, sonic, camX, camY, globalTime);
        }

        // ─── Water (foreground) ───
        Renderer.drawWater(ctx, W, H, camX, globalTime);

        // ─── Speed lines effect when going fast ───
        if (sonic && Math.abs(sonic.vx) > 6) {
            const alpha = (Math.abs(sonic.vx) - 6) / 8;
            ctx.strokeStyle = `rgba(255,255,255,${alpha * 0.3})`;
            ctx.lineWidth = 1;
            for (let i = 0; i < 8; i++) {
                const lx = Math.random() * W;
                const ly = Math.random() * H;
                ctx.beginPath();
                ctx.moveTo(lx, ly);
                ctx.lineTo(lx - sonic.vx * 4, ly);
                ctx.stroke();
            }
        }
    }

    // ─── Main loop ───
    function loop() {
        update();
        render();
        requestAnimationFrame(loop);
    }

    loop();
})();
