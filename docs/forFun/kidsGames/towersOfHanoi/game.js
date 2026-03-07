/* ═══════════════════════════════════════════════════════════
   Towers of Hanoi — Canvas Game
   Click/tap a peg to pick up its top disk, then click/tap
   another peg to drop it. Drag also supported.
   ═══════════════════════════════════════════════════════════ */

(() => {
    'use strict';

    // ── DOM refs ────────────────────────────────────
    const canvas = document.getElementById('game-canvas');
    const ctx = canvas.getContext('2d');
    const menuOverlay = document.getElementById('menu-overlay');
    const winOverlay = document.getElementById('win-overlay');
    const startBtn = document.getElementById('start-btn');
    const playAgainBtn = document.getElementById('play-again-btn');
    const menuBtn = document.getElementById('menu-btn');
    const backBtn = document.getElementById('back-btn');
    const diskCountEl = document.getElementById('disk-count');
    const diskMinusBtn = document.getElementById('disk-minus');
    const diskPlusBtn = document.getElementById('disk-plus');
    const minMovesEl = document.getElementById('min-moves');
    const moveCountEl = document.getElementById('move-count');
    const bestPossibleEl = document.getElementById('best-possible');
    const timerEl = document.getElementById('timer');
    const winText = document.getElementById('win-text');
    const winStats = document.getElementById('win-stats');
    const winStars = document.getElementById('win-stars');

    // ── Config ──────────────────────────────────────
    const MIN_DISKS = 3;
    const MAX_DISKS = 8;

    // ── Disk color palette (HSL based, vibrant neon) ─
    const DISK_COLORS = [
        { h: 0, s: 100, l: 65 },   // red
        { h: 30, s: 100, l: 60 },   // orange
        { h: 50, s: 100, l: 55 },   // gold
        { h: 130, s: 80, l: 50 },   // green
        { h: 185, s: 100, l: 50 },   // cyan
        { h: 220, s: 100, l: 65 },   // blue
        { h: 270, s: 90, l: 65 },   // purple
        { h: 320, s: 100, l: 60 },   // pink
    ];

    // ── Game state ──────────────────────────────────
    let numDisks = 4;
    let pegs = [[], [], []];  // each peg is an array of disk sizes (bottom→top)
    let moves = 0;
    let timerStart = 0;
    let timerInterval = null;
    let playing = false;

    // ── Interaction state ───────────────────────────
    let selectedPeg = -1;       // peg index with lifted disk (-1 = none)
    let liftedDisk = -1;        // disk size currently lifted
    let liftAnim = 0;           // 0→1 animation for lift
    let dropAnim = { active: false, from: -1, to: -1, disk: -1, t: 0 };
    let hoverPeg = -1;          // which peg the pointer is nearest
    let invalidShake = { peg: -1, t: 0 }; // shake feedback

    // Drag state
    let dragging = false;
    let dragX = 0, dragY = 0;
    let dragFromPeg = -1;
    let dragDisk = -1;

    // ── Layout (computed on resize) ─────────────────
    let W, H, dpr;
    let pegPositions = [];      // [{x, baseY}]
    let pegWidth, pegHeight, baseWidth, baseHeight;
    let diskHeight, diskMaxWidth, diskMinWidth;
    let liftY;                  // Y when a disk is lifted

    // ── Particle effects ────────────────────────────
    let particles = [];

    // ═══════════════════════════════════════════════════
    //  LAYOUT
    // ═══════════════════════════════════════════════════
    function resize() {
        dpr = window.devicePixelRatio || 1;
        W = window.innerWidth;
        H = window.innerHeight;
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        canvas.style.width = W + 'px';
        canvas.style.height = H + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        computeLayout();
    }

    function computeLayout() {
        const margin = W * 0.08;
        const playArea = W - margin * 2;
        const spacing = playArea / 3;

        pegWidth = Math.max(6, W * 0.008);
        const maxPegH = H * 0.42;
        pegHeight = Math.min(maxPegH, 40 + numDisks * 32);
        baseWidth = Math.min(spacing * 0.85, 260);
        baseHeight = Math.max(10, H * 0.018);

        diskMaxWidth = baseWidth * 0.9;
        diskMinWidth = pegWidth * 4;
        diskHeight = Math.min(32, (pegHeight - 10) / numDisks);
        diskHeight = Math.max(18, diskHeight);

        const baseY = H * 0.72;
        liftY = baseY - pegHeight - diskHeight * 1.8;

        pegPositions = [0, 1, 2].map(i => ({
            x: margin + spacing * 0.5 + spacing * i,
            baseY
        }));
    }

    // ═══════════════════════════════════════════════════
    //  GAME LOGIC
    // ═══════════════════════════════════════════════════
    function initGame() {
        pegs = [[], [], []];
        for (let i = numDisks; i >= 1; i--) pegs[0].push(i);
        moves = 0;
        moveCountEl.textContent = '0';
        bestPossibleEl.textContent = (Math.pow(2, numDisks) - 1).toString();
        selectedPeg = -1;
        liftedDisk = -1;
        liftAnim = 0;
        dragging = false;
        dropAnim.active = false;
        invalidShake = { peg: -1, t: 0 };
        particles = [];
        playing = true;

        // timer
        clearInterval(timerInterval);
        timerStart = performance.now();
        timerEl.textContent = '0:00';
        timerInterval = setInterval(updateTimer, 200);
    }

    function updateTimer() {
        if (!playing) return;
        const elapsed = Math.floor((performance.now() - timerStart) / 1000);
        const m = Math.floor(elapsed / 60);
        const s = elapsed % 60;
        timerEl.textContent = m + ':' + (s < 10 ? '0' : '') + s;
    }

    function getMinMoves() {
        return Math.pow(2, numDisks) - 1;
    }

    function canPlace(disk, pegIdx) {
        const peg = pegs[pegIdx];
        return peg.length === 0 || peg[peg.length - 1] > disk;
    }

    function tryMove(fromPeg, toPeg) {
        if (fromPeg === toPeg) {
            // put it back
            selectedPeg = -1;
            liftedDisk = -1;
            liftAnim = 0;
            return;
        }
        const disk = liftedDisk;
        if (!canPlace(disk, toPeg)) {
            // invalid — shake
            invalidShake = { peg: toPeg, t: 1 };
            // put disk back
            pegs[fromPeg].push(disk);
            selectedPeg = -1;
            liftedDisk = -1;
            liftAnim = 0;
            return;
        }
        // animate drop
        dropAnim = { active: true, from: fromPeg, to: toPeg, disk, t: 0 };
        selectedPeg = -1;
        liftedDisk = -1;
        liftAnim = 0;
    }

    function completeMove(toPeg, disk) {
        pegs[toPeg].push(disk);
        moves++;
        moveCountEl.textContent = moves.toString();

        // flash move count
        moveCountEl.classList.add('flash');
        setTimeout(() => moveCountEl.classList.remove('flash'), 200);

        // check win
        if (pegs[2].length === numDisks) {
            win();
        }
    }

    function win() {
        playing = false;
        clearInterval(timerInterval);
        const elapsed = Math.floor((performance.now() - timerStart) / 1000);
        const m = Math.floor(elapsed / 60);
        const s = elapsed % 60;
        const timeStr = m + ':' + (s < 10 ? '0' : '') + s;
        const minMoves = getMinMoves();

        // stars
        let stars = 1;
        if (moves <= minMoves) stars = 3;
        else if (moves <= minMoves * 1.5) stars = 2;
        winStars.textContent = '★'.repeat(stars) + '☆'.repeat(3 - stars);

        if (moves <= minMoves) {
            winText.textContent = 'PERFECT!';
        } else {
            winText.textContent = 'PUZZLE SOLVED!';
        }
        winStats.innerHTML =
            `Moves: <strong>${moves}</strong> / ${minMoves} optimal<br>` +
            `Time: <strong>${timeStr}</strong>`;

        // victory particles
        spawnVictoryParticles();

        setTimeout(() => {
            winOverlay.classList.remove('hidden');
        }, 600);
    }

    // ═══════════════════════════════════════════════════
    //  INPUT
    // ═══════════════════════════════════════════════════
    function getPegAt(x, y) {
        let closest = -1;
        let minDist = Infinity;
        for (let i = 0; i < 3; i++) {
            const p = pegPositions[i];
            const dx = x - p.x;
            const dy = y - (p.baseY - pegHeight * 0.5);
            const halfW = baseWidth * 0.5 + 20;
            if (Math.abs(dx) < halfW && dy < pegHeight && dy > -(pegHeight + diskHeight * 4)) {
                const dist = Math.abs(dx);
                if (dist < minDist) {
                    minDist = dist;
                    closest = i;
                }
            }
        }
        return closest;
    }

    function getClosestPeg(x) {
        let closest = 0;
        let minDist = Infinity;
        for (let i = 0; i < 3; i++) {
            const dist = Math.abs(x - pegPositions[i].x);
            if (dist < minDist) {
                minDist = dist;
                closest = i;
            }
        }
        return closest;
    }

    function handlePointerDown(x, y) {
        if (!playing || dropAnim.active) return;

        const peg = getPegAt(x, y);
        if (peg === -1) return;

        if (selectedPeg >= 0) {
            // already have a disk lifted — try to place it
            tryMove(selectedPeg, peg);
        } else if (pegs[peg].length > 0) {
            // pick up
            const disk = pegs[peg].pop();
            selectedPeg = peg;
            liftedDisk = disk;
            liftAnim = 0;
            dragging = true;
            dragFromPeg = peg;
            dragDisk = disk;
            dragX = pegPositions[peg].x;
            dragY = liftY;
        }
    }

    function handlePointerMove(x, y) {
        hoverPeg = getClosestPeg(x);

        if (dragging && liftedDisk >= 0) {
            dragX = x;
            dragY = y;
        }
    }

    function handlePointerUp(x, y) {
        if (dragging && liftedDisk >= 0) {
            const toPeg = getClosestPeg(x);
            dragging = false;
            tryMove(dragFromPeg, toPeg);
        }
    }

    // Mouse
    canvas.addEventListener('mousedown', e => {
        handlePointerDown(e.clientX, e.clientY);
    });
    canvas.addEventListener('mousemove', e => {
        handlePointerMove(e.clientX, e.clientY);
    });
    canvas.addEventListener('mouseup', e => {
        handlePointerUp(e.clientX, e.clientY);
    });

    // Touch
    canvas.addEventListener('touchstart', e => {
        e.preventDefault();
        const t = e.touches[0];
        handlePointerDown(t.clientX, t.clientY);
    }, { passive: false });
    canvas.addEventListener('touchmove', e => {
        e.preventDefault();
        const t = e.touches[0];
        handlePointerMove(t.clientX, t.clientY);
    }, { passive: false });
    canvas.addEventListener('touchend', e => {
        e.preventDefault();
        const t = e.changedTouches[0];
        handlePointerUp(t.clientX, t.clientY);
    }, { passive: false });

    // ═══════════════════════════════════════════════════
    //  PARTICLES
    // ═══════════════════════════════════════════════════
    function spawnVictoryParticles() {
        for (let i = 0; i < 80; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 2 + Math.random() * 5;
            const color = DISK_COLORS[Math.floor(Math.random() * DISK_COLORS.length)];
            particles.push({
                x: pegPositions[2].x,
                y: pegPositions[2].baseY - pegHeight * 0.5,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed - 3,
                life: 1,
                decay: 0.008 + Math.random() * 0.012,
                size: 3 + Math.random() * 5,
                color: `hsl(${color.h}, ${color.s}%, ${color.l}%)`
            });
        }
    }

    function updateParticles() {
        for (let i = particles.length - 1; i >= 0; i--) {
            const p = particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.vy += 0.08;
            p.life -= p.decay;
            if (p.life <= 0) particles.splice(i, 1);
        }
    }

    function drawParticles() {
        for (const p of particles) {
            ctx.globalAlpha = p.life;
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size * p.life, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
    }

    // ═══════════════════════════════════════════════════
    //  RENDERING
    // ═══════════════════════════════════════════════════
    function getDiskColor(diskSize) {
        const idx = (diskSize - 1) % DISK_COLORS.length;
        const c = DISK_COLORS[idx];
        return c;
    }

    function getDiskWidth(diskSize) {
        const t = (diskSize - 1) / (numDisks - 1 || 1);
        return diskMinWidth + t * (diskMaxWidth - diskMinWidth);
    }

    function drawBackground() {
        // subtle radial gradient
        const grad = ctx.createRadialGradient(W / 2, H * 0.6, 0, W / 2, H * 0.6, Math.max(W, H));
        grad.addColorStop(0, '#111128');
        grad.addColorStop(1, '#0a0a1a');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, W, H);

        // subtle grid
        ctx.strokeStyle = 'rgba(255,255,255,0.02)';
        ctx.lineWidth = 1;
        const gridSize = 60;
        for (let x = 0; x < W; x += gridSize) {
            ctx.beginPath();
            ctx.moveTo(x, 0);
            ctx.lineTo(x, H);
            ctx.stroke();
        }
        for (let y = 0; y < H; y += gridSize) {
            ctx.beginPath();
            ctx.moveTo(0, y);
            ctx.lineTo(W, y);
            ctx.stroke();
        }
    }

    function drawPeg(idx) {
        const { x, baseY } = pegPositions[idx];

        // Shake offset
        let shakeX = 0;
        if (invalidShake.peg === idx && invalidShake.t > 0) {
            shakeX = Math.sin(invalidShake.t * 30) * 6 * invalidShake.t;
        }

        const cx = x + shakeX;

        // Base platform
        const gradient = ctx.createLinearGradient(cx - baseWidth / 2, baseY, cx + baseWidth / 2, baseY);
        gradient.addColorStop(0, 'rgba(255,255,255,0.03)');
        gradient.addColorStop(0.5, 'rgba(255,255,255,0.08)');
        gradient.addColorStop(1, 'rgba(255,255,255,0.03)');

        ctx.fillStyle = gradient;
        roundRect(cx - baseWidth / 2, baseY - baseHeight / 2, baseWidth, baseHeight, 6);
        ctx.fill();

        // Peg rod
        const rodGrad = ctx.createLinearGradient(cx - pegWidth, baseY - pegHeight, cx + pegWidth, baseY);
        rodGrad.addColorStop(0, 'rgba(255,255,255,0.12)');
        rodGrad.addColorStop(1, 'rgba(255,255,255,0.04)');
        ctx.fillStyle = rodGrad;
        roundRect(cx - pegWidth / 2, baseY - pegHeight, pegWidth, pegHeight, pegWidth / 2);
        ctx.fill();

        // Peg label
        ctx.fillStyle = 'rgba(255,255,255,0.15)';
        ctx.font = `600 12px 'Inter', sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        const labels = ['A', 'B', 'C'];
        ctx.fillText(labels[idx], cx, baseY + baseHeight / 2 + 8);

        // Highlight if it's a valid target
        if (playing && liftedDisk >= 0 && !dragging && hoverPeg === idx && idx !== selectedPeg) {
            const canDrop = canPlace(liftedDisk, idx);
            ctx.strokeStyle = canDrop
                ? 'rgba(0, 240, 255, 0.3)'
                : 'rgba(255, 60, 80, 0.3)';
            ctx.lineWidth = 2;
            roundRect(cx - baseWidth / 2 - 4, baseY - pegHeight - 8, baseWidth + 8, pegHeight + baseHeight + 12, 10);
            ctx.stroke();
        }

        // Draw disks on this peg
        const disks = pegs[idx];
        for (let i = 0; i < disks.length; i++) {
            const disk = disks[i];
            const dw = getDiskWidth(disk);
            const dy = baseY - (i + 1) * diskHeight;
            drawDisk(cx, dy, dw, diskHeight, disk);
        }
    }

    function drawDisk(x, y, width, height, diskSize, alpha = 1) {
        const c = getDiskColor(diskSize);
        const h = c.h, s = c.s, l = c.l;

        ctx.globalAlpha = alpha;

        // Main body gradient
        const grad = ctx.createLinearGradient(x, y, x, y + height);
        grad.addColorStop(0, `hsl(${h}, ${s}%, ${l + 12}%)`);
        grad.addColorStop(0.5, `hsl(${h}, ${s}%, ${l}%)`);
        grad.addColorStop(1, `hsl(${h}, ${s}%, ${l - 10}%)`);

        ctx.fillStyle = grad;
        const r = Math.min(height / 2, 10);
        roundRect(x - width / 2, y, width, height - 2, r);
        ctx.fill();

        // Top shine
        ctx.fillStyle = `hsla(${h}, ${s}%, ${l + 30}%, 0.3)`;
        roundRect(x - width / 2 + 4, y + 2, width - 8, height * 0.35, r);
        ctx.fill();

        // Glow
        ctx.shadowColor = `hsl(${h}, ${s}%, ${l}%)`;
        ctx.shadowBlur = 16;
        ctx.fillStyle = 'transparent';
        roundRect(x - width / 2, y, width, height - 2, r);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Border
        ctx.strokeStyle = `hsla(${h}, ${s}%, ${l + 20}%, 0.4)`;
        ctx.lineWidth = 1;
        roundRect(x - width / 2, y, width, height - 2, r);
        ctx.stroke();

        ctx.globalAlpha = 1;
    }

    function drawLiftedDisk() {
        if (liftedDisk < 0) return;

        const dw = getDiskWidth(liftedDisk);

        if (dragging) {
            // Draw at drag position
            drawDisk(dragX, dragY - diskHeight / 2, dw, diskHeight, liftedDisk, 0.85);

            // Draw drop target indicator
            const targetPeg = getClosestPeg(dragX);
            const { x: tx, baseY: tby } = pegPositions[targetPeg];
            const targetY = tby - (pegs[targetPeg].length + 1) * diskHeight;
            const valid = canPlace(liftedDisk, targetPeg);

            ctx.globalAlpha = 0.25;
            ctx.setLineDash([6, 4]);
            ctx.strokeStyle = valid ? 'rgba(0, 240, 255, 0.6)' : 'rgba(255, 60, 80, 0.6)';
            ctx.lineWidth = 2;
            const r = Math.min(diskHeight / 2, 10);
            roundRect(tx - dw / 2, targetY, dw, diskHeight - 2, r);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
        } else {
            // Hovering above selected peg
            const ease = easeOutBack(Math.min(1, liftAnim));
            const { x: px, baseY } = pegPositions[selectedPeg];
            const startY = baseY - (pegs[selectedPeg].length + 1) * diskHeight;
            const curY = startY + (liftY - startY) * ease;

            drawDisk(px, curY, dw, diskHeight, liftedDisk);

            // pulse glow
            const pulse = 0.3 + Math.sin(performance.now() * 0.004) * 0.15;
            ctx.globalAlpha = pulse;
            ctx.fillStyle = 'rgba(0, 240, 255, 0.15)';
            roundRect(px - dw / 2 - 4, curY - 4, dw + 8, diskHeight + 6, 12);
            ctx.fill();
            ctx.globalAlpha = 1;
        }
    }

    function drawDropAnimation() {
        if (!dropAnim.active) return;

        const { from, to, disk, t } = dropAnim;
        const dw = getDiskWidth(disk);
        const fromPeg = pegPositions[from];
        const toPeg = pegPositions[to];

        // Animate: lift → slide → drop
        const phase1 = 0.25; // lift
        const phase2 = 0.6;  // slide
        // phase3 = rest: drop

        let x, y;
        const fromStackY = fromPeg.baseY - (pegs[from].length + 1) * diskHeight;
        const toStackY = toPeg.baseY - (pegs[to].length + 1) * diskHeight;

        if (t < phase1) {
            // lifting up
            const p = t / phase1;
            x = fromPeg.x;
            y = fromStackY + (liftY - fromStackY) * easeOutCubic(p);
        } else if (t < phase2) {
            // sliding horizontally
            const p = (t - phase1) / (phase2 - phase1);
            x = fromPeg.x + (toPeg.x - fromPeg.x) * easeInOutCubic(p);
            y = liftY;
        } else {
            // dropping down
            const p = (t - phase2) / (1 - phase2);
            x = toPeg.x;
            y = liftY + (toStackY - liftY) * easeOutBounce(p);
        }

        drawDisk(x, y, dw, diskHeight, disk);
    }

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

    // ── Easing ──────────────────────────────────────
    function easeOutCubic(t) { return 1 - Math.pow(1 - t, 3); }
    function easeInOutCubic(t) { return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2; }
    function easeOutBack(t) {
        const c1 = 1.70158;
        const c3 = c1 + 1;
        return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
    }
    function easeOutBounce(t) {
        const n1 = 7.5625, d1 = 2.75;
        if (t < 1 / d1) return n1 * t * t;
        else if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
        else if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
        else return n1 * (t -= 2.625 / d1) * t + 0.984375;
    }

    // ═══════════════════════════════════════════════════
    //  MAIN LOOP
    // ═══════════════════════════════════════════════════
    let lastTime = 0;

    function frame(now) {
        const dt = Math.min(0.05, (now - lastTime) / 1000);
        lastTime = now;

        // Update lift animation
        if (liftedDisk >= 0 && !dragging && liftAnim < 1) {
            liftAnim = Math.min(1, liftAnim + dt * 5);
        }

        // Update drop animation
        if (dropAnim.active) {
            dropAnim.t += dt * 1.8;
            if (dropAnim.t >= 1) {
                dropAnim.active = false;
                completeMove(dropAnim.to, dropAnim.disk);
            }
        }

        // Update shake
        if (invalidShake.t > 0) {
            invalidShake.t -= dt * 3;
            if (invalidShake.t <= 0) {
                invalidShake.t = 0;
                invalidShake.peg = -1;
            }
        }

        // Update particles
        updateParticles();

        // ── Draw ────────────────────────────────────
        drawBackground();

        // Draw pegs
        for (let i = 0; i < 3; i++) drawPeg(i);

        // Draw lifted/dragging disk
        drawLiftedDisk();

        // Draw drop animation
        drawDropAnimation();

        // Draw particles
        drawParticles();

        // Draw instruction text if no disk lifted and playing
        if (playing && liftedDisk < 0 && !dropAnim.active && moves === 0) {
            ctx.fillStyle = 'rgba(255,255,255,0.2)';
            ctx.font = `400 14px 'Inter', sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Click or drag a disk to move it', W / 2, H * 0.88);
        }

        // Goal indicator on peg C
        if (playing && pegs[2].length < numDisks) {
            const p = pegPositions[2];
            ctx.fillStyle = 'rgba(255, 215, 0, 0.12)';
            ctx.font = `400 11px 'Inter', sans-serif`;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'bottom';
            ctx.fillText('GOAL', p.x, p.baseY - pegHeight - 10);
        }

        requestAnimationFrame(frame);
    }

    // ═══════════════════════════════════════════════════
    //  UI EVENTS
    // ═══════════════════════════════════════════════════
    function updateDiskCount(delta) {
        numDisks = Math.max(MIN_DISKS, Math.min(MAX_DISKS, numDisks + delta));
        diskCountEl.textContent = numDisks;
        minMovesEl.textContent = getMinMoves();
    }

    diskMinusBtn.addEventListener('click', () => updateDiskCount(-1));
    diskPlusBtn.addEventListener('click', () => updateDiskCount(1));

    startBtn.addEventListener('click', () => {
        menuOverlay.classList.add('hidden');
        computeLayout();
        initGame();
    });

    playAgainBtn.addEventListener('click', () => {
        winOverlay.classList.add('hidden');
        computeLayout();
        initGame();
    });

    menuBtn.addEventListener('click', () => {
        winOverlay.classList.add('hidden');
        playing = false;
        clearInterval(timerInterval);
        menuOverlay.classList.remove('hidden');
    });

    backBtn.addEventListener('click', () => {
        playing = false;
        clearInterval(timerInterval);
        menuOverlay.classList.remove('hidden');
    });

    // ═══════════════════════════════════════════════════
    //  INIT
    // ═══════════════════════════════════════════════════
    window.addEventListener('resize', resize);
    resize();
    diskCountEl.textContent = numDisks;
    minMovesEl.textContent = getMinMoves();
    bestPossibleEl.textContent = getMinMoves().toString();

    requestAnimationFrame(frame);
})();
