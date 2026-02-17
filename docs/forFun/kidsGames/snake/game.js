/* ═══════════════════════════════════════════════════
   Snake – game.js
   Canvas-based Snake game with neon aesthetics
   ═══════════════════════════════════════════════════ */

(() => {
    "use strict";

    // ── DOM refs ──
    const canvas = document.getElementById("game-canvas");
    const ctx = canvas.getContext("2d");

    const menuOverlay = document.getElementById("menu-overlay");
    const pauseOverlay = document.getElementById("pause-overlay");
    const gameoverOverlay = document.getElementById("gameover-overlay");
    const countdownEl = document.getElementById("countdown");
    const countdownText = document.getElementById("countdown-text");
    const hudEl = document.getElementById("hud");
    const dpadEl = document.getElementById("dpad");

    const scoreDisplay = document.getElementById("score-display");
    const highDisplay = document.getElementById("high-display");
    const lengthDisplay = document.getElementById("length-display");
    const finalScoreText = document.getElementById("final-score-text");
    const newHighText = document.getElementById("new-high-text");

    const startBtn = document.getElementById("start-btn");
    const retryBtn = document.getElementById("retry-btn");
    const menuBtn = document.getElementById("menu-btn");
    const resumeBtn = document.getElementById("resume-btn");
    const pauseMenuBtn = document.getElementById("pause-menu-btn");
    const dpadPause = document.getElementById("dpad-pause");

    // ── Constants ──
    const COLS = 20;
    const ROWS = 20;
    const INITIAL_LENGTH = 3;

    // colors
    const C = {
        grid1: "#0d1117",
        grid2: "#10151f",
        snakeHead: "#39ff14",
        snakeBody: "#00f0ff",
        snakeTail: "#0090aa",
        food: "#ff2daa",
        foodGlow: "rgba(255,45,170,.35)",
        bonus: "#ffd700",
        bonusGlow: "rgba(255,215,0,.35)",
        wall: "rgba(255,255,255,.06)",
        eyes: "#0a0e1a",
    };

    // ── State ──
    let cellSize, offsetX, offsetY;
    let snake, dir, nextDir, food, bonusFood;
    let score, highScore, running, paused, speed;
    let lastTick, tickAccum, animFrame;
    let particles = [];
    let bonusTimer = 0;
    let eatCombo = 0;

    // chosen speed (interval ms)
    let chosenSpeed = 120;

    // ── High score persistence ──
    function loadHigh() {
        try { return parseInt(localStorage.getItem("snake_high") || "0", 10); }
        catch { return 0; }
    }
    function saveHigh(v) {
        try { localStorage.setItem("snake_high", v); } catch { }
    }

    // ── Sizing ──
    function resize() {
        const hudH = 52;
        const dpadH = 180;
        const isTouchDevice = "ontouchstart" in window;
        const availW = window.innerWidth;
        const availH = window.innerHeight - hudH - (isTouchDevice ? dpadH : 20);
        const maxCell = Math.floor(Math.min(availW / COLS, availH / ROWS));
        cellSize = Math.max(12, Math.min(maxCell, 32));
        canvas.width = COLS * cellSize;
        canvas.height = ROWS * cellSize;
        offsetX = (window.innerWidth - canvas.width) / 2;
        offsetY = (window.innerHeight - canvas.height) / 2;
        canvas.style.left = offsetX + "px";
        canvas.style.top = offsetY + "px";
        canvas.style.transform = "none";
        canvas.style.position = "absolute";
    }
    window.addEventListener("resize", resize);
    resize();

    // ── Helpers ──
    function randInt(n) { return Math.floor(Math.random() * n); }

    function cellFree(x, y) {
        for (const seg of snake) {
            if (seg.x === x && seg.y === y) return false;
        }
        if (food && food.x === x && food.y === y) return false;
        if (bonusFood && bonusFood.x === x && bonusFood.y === y) return false;
        return true;
    }

    function spawnFood() {
        let x, y, tries = 0;
        do { x = randInt(COLS); y = randInt(ROWS); tries++; }
        while (!cellFree(x, y) && tries < 400);
        food = { x, y, pulse: 0 };
    }

    function spawnBonus() {
        let x, y, tries = 0;
        do { x = randInt(COLS); y = randInt(ROWS); tries++; }
        while (!cellFree(x, y) && tries < 400);
        bonusFood = { x, y, pulse: 0, life: 8000 }; // disappears after 8s
        bonusTimer = 8000;
    }

    // ── Particles ──
    function emitParticles(cx, cy, color, count) {
        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1 + Math.random() * 3;
            particles.push({
                x: cx, y: cy,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                life: 0.6 + Math.random() * 0.4,
                maxLife: 0.6 + Math.random() * 0.4,
                color,
                size: 2 + Math.random() * 3,
            });
        }
    }

    function updateParticles(dt) {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vx *= 0.96;
            p.vy *= 0.96;
            p.life -= dt;
            if (p.life <= 0) particles.splice(i, 1);
        }
    }

    function drawParticles() {
        for (const p of particles) {
            const alpha = Math.max(0, p.life / p.maxLife);
            ctx.globalAlpha = alpha;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * alpha, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    // ── Init game state ──
    function initGame() {
        const midX = Math.floor(COLS / 2);
        const midY = Math.floor(ROWS / 2);
        snake = [];
        for (let i = 0; i < INITIAL_LENGTH; i++) {
            snake.push({ x: midX - i, y: midY });
        }
        dir = { x: 1, y: 0 };
        nextDir = { x: 1, y: 0 };
        score = 0;
        eatCombo = 0;
        highScore = loadHigh();
        speed = chosenSpeed;
        particles = [];
        bonusFood = null;
        bonusTimer = 0;
        spawnFood();
        updateHUD();
    }

    function updateHUD() {
        scoreDisplay.textContent = score;
        highDisplay.textContent = highScore;
        lengthDisplay.textContent = snake.length;
    }

    // ── Game loop ──
    function tick() {
        // apply queued direction
        dir = { ...nextDir };

        // compute new head
        const head = snake[0];
        const nx = head.x + dir.x;
        const ny = head.y + dir.y;

        // wall collision
        if (nx < 0 || nx >= COLS || ny < 0 || ny >= ROWS) {
            return gameOver();
        }

        // self collision
        for (let i = 0; i < snake.length; i++) {
            if (snake[i].x === nx && snake[i].y === ny) {
                return gameOver();
            }
        }

        // move
        snake.unshift({ x: nx, y: ny });

        // food collision
        let ate = false;
        if (food && nx === food.x && ny === food.y) {
            eatCombo++;
            const comboBonus = Math.min(eatCombo, 5);
            score += 10 * comboBonus;
            const cx = food.x * cellSize + cellSize / 2;
            const cy = food.y * cellSize + cellSize / 2;
            emitParticles(cx, cy, C.food, 12);
            spawnFood();
            ate = true;

            // maybe spawn a bonus
            if (!bonusFood && snake.length > 6 && Math.random() < 0.25) {
                spawnBonus();
            }

            // slight speed increase
            speed = Math.max(40, speed - 0.5);
        }

        // bonus food collision
        if (bonusFood && nx === bonusFood.x && ny === bonusFood.y) {
            score += 50;
            const cx = bonusFood.x * cellSize + cellSize / 2;
            const cy = bonusFood.y * cellSize + cellSize / 2;
            emitParticles(cx, cy, C.bonus, 20);
            bonusFood = null;
            bonusTimer = 0;
            ate = true;
        }

        if (!ate) {
            snake.pop();
        }

        // bonus timeout
        if (bonusFood) {
            bonusTimer -= speed;
            if (bonusTimer <= 0) {
                bonusFood = null;
            }
        }

        // update high
        if (score > highScore) {
            highScore = score;
            saveHigh(highScore);
        }
        updateHUD();
    }

    // ── Drawing ──
    function draw(dt) {
        const w = canvas.width, h = canvas.height;
        // clear
        ctx.fillStyle = C.grid1;
        ctx.fillRect(0, 0, w, h);

        // checkerboard grid
        for (let r = 0; r < ROWS; r++) {
            for (let c = 0; c < COLS; c++) {
                if ((r + c) % 2 === 1) {
                    ctx.fillStyle = C.grid2;
                    ctx.fillRect(c * cellSize, r * cellSize, cellSize, cellSize);
                }
            }
        }

        // subtle border lines
        ctx.strokeStyle = "rgba(255,255,255,.03)";
        ctx.lineWidth = 0.5;
        for (let r = 0; r <= ROWS; r++) {
            ctx.beginPath();
            ctx.moveTo(0, r * cellSize);
            ctx.lineTo(w, r * cellSize);
            ctx.stroke();
        }
        for (let c = 0; c <= COLS; c++) {
            ctx.beginPath();
            ctx.moveTo(c * cellSize, 0);
            ctx.lineTo(c * cellSize, h);
            ctx.stroke();
        }

        // ── Draw food ──
        if (food) {
            food.pulse = (food.pulse || 0) + dt * 4;
            const cx = food.x * cellSize + cellSize / 2;
            const cy = food.y * cellSize + cellSize / 2;
            const r = cellSize * 0.35 + Math.sin(food.pulse) * cellSize * 0.05;
            // glow
            const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, cellSize * 0.9);
            glow.addColorStop(0, C.foodGlow);
            glow.addColorStop(1, "transparent");
            ctx.fillStyle = glow;
            ctx.fillRect(food.x * cellSize, food.y * cellSize, cellSize, cellSize);
            // dot
            ctx.fillStyle = C.food;
            ctx.shadowColor = C.food;
            ctx.shadowBlur = 12;
            ctx.beginPath();
            ctx.arc(cx, cy, r, 0, Math.PI * 2);
            ctx.fill();
            ctx.shadowBlur = 0;
        }

        // ── Draw bonus food ──
        if (bonusFood) {
            bonusFood.pulse = (bonusFood.pulse || 0) + dt * 5;
            const cx = bonusFood.x * cellSize + cellSize / 2;
            const cy = bonusFood.y * cellSize + cellSize / 2;
            const r = cellSize * 0.38 + Math.sin(bonusFood.pulse) * cellSize * 0.06;
            // glow
            const glow = ctx.createRadialGradient(cx, cy, 0, cx, cy, cellSize);
            glow.addColorStop(0, C.bonusGlow);
            glow.addColorStop(1, "transparent");
            ctx.fillStyle = glow;
            ctx.fillRect(bonusFood.x * cellSize - cellSize * 0.5, bonusFood.y * cellSize - cellSize * 0.5, cellSize * 2, cellSize * 2);
            // star shape
            ctx.fillStyle = C.bonus;
            ctx.shadowColor = C.bonus;
            ctx.shadowBlur = 14;
            drawStar(cx, cy, 5, r, r * 0.5);
            ctx.shadowBlur = 0;
        }

        // ── Draw snake ──
        for (let i = snake.length - 1; i >= 0; i--) {
            const seg = snake[i];
            const px = seg.x * cellSize;
            const py = seg.y * cellSize;
            const pad = 1;

            if (i === 0) {
                // HEAD
                ctx.fillStyle = C.snakeHead;
                ctx.shadowColor = C.snakeHead;
                ctx.shadowBlur = 10;
                roundRect(px + pad, py + pad, cellSize - pad * 2, cellSize - pad * 2, 5);
                ctx.fill();
                ctx.shadowBlur = 0;

                // eyes
                const eyeR = cellSize * 0.1;
                const perpX = -dir.y;
                const perpY = dir.x;
                const fwdOff = cellSize * 0.22;
                const sideOff = cellSize * 0.2;
                const cx = px + cellSize / 2 + dir.x * fwdOff;
                const cy = py + cellSize / 2 + dir.y * fwdOff;
                ctx.fillStyle = C.eyes;
                ctx.beginPath();
                ctx.arc(cx + perpX * sideOff, cy + perpY * sideOff, eyeR, 0, Math.PI * 2);
                ctx.fill();
                ctx.beginPath();
                ctx.arc(cx - perpX * sideOff, cy - perpY * sideOff, eyeR, 0, Math.PI * 2);
                ctx.fill();
            } else {
                // BODY
                const t = i / snake.length;
                const r = lerp(hexR(C.snakeBody), hexR(C.snakeTail), t);
                const g = lerp(hexG(C.snakeBody), hexG(C.snakeTail), t);
                const b = lerp(hexB(C.snakeBody), hexB(C.snakeTail), t);
                ctx.fillStyle = `rgb(${r},${g},${b})`;
                ctx.shadowColor = ctx.fillStyle;
                ctx.shadowBlur = 4;
                roundRect(px + pad, py + pad, cellSize - pad * 2, cellSize - pad * 2, 4);
                ctx.fill();
                ctx.shadowBlur = 0;
            }
        }

        // ── Particles ──
        updateParticles(dt);
        drawParticles();
    }

    // helpers
    function roundRect(x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.quadraticCurveTo(x + w, y, x + w, y + r);
        ctx.lineTo(x + w, y + h - r);
        ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
        ctx.lineTo(x + r, y + h);
        ctx.quadraticCurveTo(x, y + h, x, y + h - r);
        ctx.lineTo(x, y + r);
        ctx.quadraticCurveTo(x, y, x + r, y);
        ctx.closePath();
    }

    function drawStar(cx, cy, n, R, r) {
        ctx.beginPath();
        for (let i = 0; i < n * 2; i++) {
            const rad = (i % 2 === 0) ? R : r;
            const angle = (Math.PI / n) * i - Math.PI / 2;
            const x = cx + Math.cos(angle) * rad;
            const y = cy + Math.sin(angle) * rad;
            if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
        }
        ctx.closePath();
        ctx.fill();
    }

    function hexR(c) { return parseInt(c.slice(1, 3), 16); }
    function hexG(c) { return parseInt(c.slice(3, 5), 16); }
    function hexB(c) { return parseInt(c.slice(5, 7), 16); }
    function lerp(a, b, t) { return Math.round(a + (b - a) * t); }

    // ── Game flow ──
    function countdown(cb) {
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
            // re-trigger animation
            countdownText.style.animation = "none";
            void countdownText.offsetWidth;
            countdownText.style.animation = "";
        }, 600);
    }

    // Simplest correct game loop
    let _prevTime = 0;
    let _accumulator = 0;

    function gameLoop(timestamp) {
        if (!running) return;
        animFrame = requestAnimationFrame(gameLoop);

        const dtMs = timestamp - _prevTime;
        _prevTime = timestamp;

        if (paused) {
            draw(dtMs / 1000);
            return;
        }

        _accumulator += dtMs;
        while (_accumulator >= speed) {
            _accumulator -= speed;
            tick();
            if (!running) return; // game over inside tick
        }
        draw(dtMs / 1000);
    }

    function beginLoop() {
        _prevTime = performance.now();
        _accumulator = 0;
        running = true;
        paused = false;
        requestAnimationFrame(gameLoop);
    }

    function pause() {
        if (!running || paused) return;
        paused = true;
        pauseOverlay.classList.remove("hidden");
    }

    function resumeGame() {
        if (!paused) return;
        paused = false;
        _prevTime = performance.now();
        _accumulator = 0;
        pauseOverlay.classList.add("hidden");
    }

    function gameOver() {
        running = false;
        cancelAnimationFrame(animFrame);
        const isNew = score >= highScore && score > 0;
        finalScoreText.textContent = `Score: ${score}`;
        newHighText.classList.toggle("hidden", !isNew);
        hudEl.classList.add("hidden");
        dpadEl.classList.add("hidden");
        gameoverOverlay.classList.remove("hidden");
    }

    function backToMenu() {
        running = false;
        paused = false;
        cancelAnimationFrame(animFrame);
        hudEl.classList.add("hidden");
        dpadEl.classList.add("hidden");
        pauseOverlay.classList.add("hidden");
        gameoverOverlay.classList.add("hidden");
        menuOverlay.classList.remove("hidden");
    }

    // ── Input ──

    // Keyboard
    document.addEventListener("keydown", (e) => {
        if (!running) return;
        switch (e.key) {
            case "ArrowUp": case "w": case "W": setDir(0, -1); e.preventDefault(); break;
            case "ArrowDown": case "s": case "S": setDir(0, 1); e.preventDefault(); break;
            case "ArrowLeft": case "a": case "A": setDir(-1, 0); e.preventDefault(); break;
            case "ArrowRight": case "d": case "D": setDir(1, 0); e.preventDefault(); break;
            case "Escape": case "p": case "P":
                paused ? resumeGame() : pause();
                e.preventDefault();
                break;
        }
    });

    function setDir(dx, dy) {
        // prevent 180° reversal
        if (dir.x === -dx && dir.y === -dy) return;
        // prevent no change
        if (dir.x === dx && dir.y === dy) return;
        nextDir = { x: dx, y: dy };
    }

    // Touch swipe
    let touchStartX = 0, touchStartY = 0;
    canvas.addEventListener("touchstart", (e) => {
        const t = e.touches[0];
        touchStartX = t.clientX;
        touchStartY = t.clientY;
    }, { passive: true });

    canvas.addEventListener("touchend", (e) => {
        if (!running || paused) return;
        const t = e.changedTouches[0];
        const dx = t.clientX - touchStartX;
        const dy = t.clientY - touchStartY;
        const absDx = Math.abs(dx);
        const absDy = Math.abs(dy);
        if (Math.max(absDx, absDy) < 20) return; // too small
        if (absDx > absDy) {
            setDir(dx > 0 ? 1 : -1, 0);
        } else {
            setDir(0, dy > 0 ? 1 : -1);
        }
    }, { passive: true });

    // D-pad buttons
    document.querySelectorAll(".dpad-btn[data-dir]").forEach(btn => {
        btn.addEventListener("touchstart", (e) => {
            e.preventDefault();
            if (!running || paused) return;
            const d = btn.dataset.dir;
            switch (d) {
                case "up": setDir(0, -1); break;
                case "down": setDir(0, 1); break;
                case "left": setDir(-1, 0); break;
                case "right": setDir(1, 0); break;
            }
        }, { passive: false });

        btn.addEventListener("click", () => {
            if (!running || paused) return;
            const d = btn.dataset.dir;
            switch (d) {
                case "up": setDir(0, -1); break;
                case "down": setDir(0, 1); break;
                case "left": setDir(-1, 0); break;
                case "right": setDir(1, 0); break;
            }
        });
    });

    dpadPause.addEventListener("click", () => {
        if (!running) return;
        paused ? resumeGame() : pause();
    });

    // ── Difficulty picker ──
    document.querySelectorAll(".diff-btn").forEach(btn => {
        btn.addEventListener("click", () => {
            document.querySelectorAll(".diff-btn").forEach(b => b.classList.remove("active"));
            btn.classList.add("active");
            chosenSpeed = parseInt(btn.dataset.speed, 10);
        });
    });

    // ── Button events ──
    startBtn.addEventListener("click", () => {
        initGame();
        menuOverlay.classList.add("hidden");
        countdown(() => {
            hudEl.classList.remove("hidden");
            if ("ontouchstart" in window) dpadEl.classList.remove("hidden");
            beginLoop();
        });
    });

    retryBtn.addEventListener("click", () => {
        gameoverOverlay.classList.add("hidden");
        initGame();
        countdown(() => {
            hudEl.classList.remove("hidden");
            if ("ontouchstart" in window) dpadEl.classList.remove("hidden");
            beginLoop();
        });
    });

    menuBtn.addEventListener("click", backToMenu);
    pauseMenuBtn.addEventListener("click", backToMenu);
    resumeBtn.addEventListener("click", resumeGame);

    // ── Initial draw ──
    highScore = loadHigh();
    highDisplay.textContent = highScore;
    initGame();
    draw(0);
})();
