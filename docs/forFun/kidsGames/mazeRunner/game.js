/* Maze Explorer — cute procedural mazes with stars and a flag */
(() => {
    'use strict';

    const $ = id => document.getElementById(id);
    const canvas = $('maze-canvas'), ctx = canvas.getContext('2d');
    const boardArea = $('board-area');
    const menuOverlay = $('menu-overlay'), winOverlay = $('win-overlay');
    const levelNumEl = $('level-num'), starCountEl = $('star-count');
    const confettiCanvas = $('confetti-canvas'), cctx = confettiCanvas.getContext('2d');

    const LS = 'kidsGames.mazeRunner.';
    let level = +(localStorage.getItem(LS + 'level') || 1);
    let totalStars = +(localStorage.getItem(LS + 'stars') || 0);
    let charEmoji = localStorage.getItem(LS + 'char') || '🐰';

    /* ── audio ── */
    let actx = null, master = null;
    let muted = localStorage.getItem('kidsGames.muted') === '1';
    const soundBtn = $('sound-btn');
    const updateSoundBtn = () => { soundBtn.textContent = muted ? '🔇' : '🔊'; if (master) master.gain.value = muted ? 0 : 1; };
    updateSoundBtn();
    soundBtn.addEventListener('click', () => {
        muted = !muted;
        localStorage.setItem('kidsGames.muted', muted ? '1' : '0');
        updateSoundBtn();
    });
    function ensureAudio() {
        if (!actx) {
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            actx = new AC();
            master = actx.createGain();
            master.gain.value = muted ? 0 : 1;
            master.connect(actx.destination);
        }
        if (actx.state === 'suspended') actx.resume();
    }
    document.addEventListener('pointerdown', ensureAudio, { capture: true });
    function tone(freq, dur, type, vol, when) {
        if (!actx) return;
        const t = actx.currentTime + (when || 0);
        const o = actx.createOscillator(), g = actx.createGain();
        o.type = type || 'sine';
        o.frequency.value = freq;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(vol || .25, t + .015);
        g.gain.exponentialRampToValueAtTime(.001, t + dur);
        o.connect(g).connect(master);
        o.start(t);
        o.stop(t + dur + .05);
    }
    const sHop = () => tone(340 + Math.random() * 60, .07, 'triangle', .08);
    const sBoing = () => { tone(160, .16, 'sine', .18); tone(120, .2, 'sine', .12, .05); };
    const sStar = () => { tone(880, .15, 'sine', .22); tone(1320, .2, 'sine', .18, .08); };
    const sWin = () => [523, 659, 784, 1047].forEach((f, i) => tone(f, .3, 'triangle', .25, i * .12));

    /* ── confetti ── */
    let confetti = [], confettiRunning = false;
    const CCOLORS = ['#ff6b6b', '#4ecdc4', '#ffe66d', '#a29bfe', '#55efc4'];
    function burstConfetti(n) {
        confettiCanvas.width = innerWidth;
        confettiCanvas.height = innerHeight;
        for (let i = 0; i < n; i++) {
            confetti.push({
                x: innerWidth / 2 + (Math.random() - .5) * 200,
                y: innerHeight * .35,
                vx: (Math.random() - .5) * 600,
                vy: -Math.random() * 500 - 100,
                r: 4 + Math.random() * 6,
                c: CCOLORS[i % CCOLORS.length],
                a: Math.random() * Math.PI,
                va: (Math.random() - .5) * 10
            });
        }
        if (!confettiRunning) { confettiRunning = true; let last = performance.now(); requestAnimationFrame(function cstep(now) {
            const dt = Math.min(.05, (now - last) / 1000); last = now;
            cctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
            confetti.forEach(p => { p.vy += 900 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.a += p.va * dt; });
            confetti = confetti.filter(p => p.y < innerHeight + 30);
            confetti.forEach(p => {
                cctx.save(); cctx.translate(p.x, p.y); cctx.rotate(p.a);
                cctx.fillStyle = p.c; cctx.fillRect(-p.r, -p.r * .6, p.r * 2, p.r * 1.2); cctx.restore();
            });
            if (confetti.length) requestAnimationFrame(cstep);
            else { confettiRunning = false; cctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height); }
        }); }
    }

    /* ── maze ── */
    // walls per cell: bit 0=N, 1=E, 2=S, 3=W
    const DIRS = { up: [0, -1, 1, 4], right: [1, 0, 2, 8], down: [0, 1, 4, 1], left: [-1, 0, 8, 2] };
    let size = 5, walls = [], player = { x: 0, y: 0 }, goal = { x: 0, y: 0 };
    let stars = [], gotStars = 0, trail = [], sparkles = [], queue = [];
    let tween = null, playing = false;

    const idx = (x, y) => y * size + x;
    const inB = (x, y) => x >= 0 && y >= 0 && x < size && y < size;

    function genMaze() {
        walls = new Array(size * size).fill(15);
        const seen = new Array(size * size).fill(false);
        const stack = [[0, 0]];
        seen[0] = true;
        while (stack.length) {
            const [x, y] = stack[stack.length - 1];
            const opts = Object.values(DIRS).filter(([dx, dy]) => inB(x + dx, y + dy) && !seen[idx(x + dx, y + dy)]);
            if (!opts.length) { stack.pop(); continue; }
            const [dx, dy, w, ow] = opts[Math.floor(Math.random() * opts.length)];
            walls[idx(x, y)] &= ~w;
            walls[idx(x + dx, y + dy)] &= ~ow;
            seen[idx(x + dx, y + dy)] = true;
            stack.push([x + dx, y + dy]);
        }
    }

    function bfs(sx, sy) {
        const dist = new Array(size * size).fill(-1);
        const prev = new Array(size * size).fill(-1);
        dist[idx(sx, sy)] = 0;
        const q = [[sx, sy]];
        for (let h = 0; h < q.length; h++) {
            const [x, y] = q[h];
            for (const [dx, dy, w] of Object.values(DIRS)) {
                if (walls[idx(x, y)] & w) continue;
                const ni = idx(x + dx, y + dy);
                if (dist[ni] !== -1) continue;
                dist[ni] = dist[idx(x, y)] + 1;
                prev[ni] = idx(x, y);
                q.push([x + dx, y + dy]);
            }
        }
        return { dist, prev };
    }

    function startLevel() {
        size = Math.min(13, 5 + Math.floor((level - 1) / 2) * 2);
        genMaze();
        player = { x: 0, y: 0 };
        const { dist } = bfs(0, 0);
        // goal = farthest cell
        let gi = 0;
        dist.forEach((d, i) => { if (d > dist[gi]) gi = i; });
        goal = { x: gi % size, y: Math.floor(gi / size) };
        // stars on farthest dead-ends (3 open sides removed = degree 1)
        const deg = w => 4 - [1, 2, 4, 8].filter(b => w & b).length;
        const ends = [];
        for (let i = 0; i < size * size; i++) {
            if (i === 0 || i === gi) continue;
            if (deg(walls[i]) === 1) ends.push(i);
        }
        ends.sort((a, b) => dist[b] - dist[a]);
        stars = ends.slice(0, 3).map(i => ({ x: i % size, y: Math.floor(i / size), got: false }));
        gotStars = 0;
        trail = []; sparkles = []; queue = []; tween = null;
        levelNumEl.textContent = level;
        starCountEl.textContent = '0';
        playing = true;
        layout();
    }

    /* ── movement ── */
    function tryStep(dir) {
        const d = DIRS[dir];
        if (!d) return;
        if (walls[idx(player.x, player.y)] & d[2]) { sBoing(); queue = []; return; }
        beginTween(player.x + d[0], player.y + d[1]);
    }

    function beginTween(nx, ny) {
        trail.push({ x: player.x, y: player.y, life: 1 });
        tween = { fx: player.x, fy: player.y, tx: nx, ty: ny, t: 0 };
        sHop();
    }

    function arrive() {
        player.x = tween.tx; player.y = tween.ty;
        tween = null;
        for (const s of stars) {
            if (!s.got && s.x === player.x && s.y === player.y) {
                s.got = true; gotStars++;
                starCountEl.textContent = gotStars;
                sStar();
                for (let i = 0; i < 14; i++) {
                    const a = Math.random() * Math.PI * 2;
                    sparkles.push({ x: s.x, y: s.y, vx: Math.cos(a) * 1.6, vy: Math.sin(a) * 1.6, life: .8 });
                }
            }
        }
        if (player.x === goal.x && player.y === goal.y) { finishLevel(); return; }
        if (queue.length) tryStep(queue.shift());
    }

    function walkTo(cx, cy) {
        if (!inB(cx, cy)) return;
        const { prev } = bfs(player.x, player.y);
        let i = idx(cx, cy);
        if (prev[i] === -1 && i !== idx(player.x, player.y)) return;
        const cells = [];
        while (i !== idx(player.x, player.y)) { cells.unshift(i); i = prev[i]; }
        queue = [];
        let px = player.x, py = player.y;
        for (const c of cells) {
            const nx = c % size, ny = Math.floor(c / size);
            for (const [name, [dx, dy]] of Object.entries(DIRS)) {
                if (px + dx === nx && py + dy === ny) { queue.push(name); break; }
            }
            px = nx; py = ny;
        }
        if (!tween && queue.length) tryStep(queue.shift());
    }

    function finishLevel() {
        playing = false;
        sWin();
        burstConfetti(120);
        totalStars += gotStars;
        level++;
        localStorage.setItem(LS + 'stars', totalStars);
        localStorage.setItem(LS + 'level', Math.max(level, +(localStorage.getItem(LS + 'level') || 1)));
        $('win-stars').textContent = gotStars ? '⭐'.repeat(gotStars) : '🏁';
        setTimeout(() => winOverlay.classList.add('show'), 500);
    }

    /* ── input ── */
    const KEYS = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' };
    addEventListener('keydown', e => {
        const dir = KEYS[e.key];
        if (!dir || !playing || menuOverlay.classList.contains('show')) return;
        e.preventDefault();
        queue = [];
        if (!tween) tryStep(dir);
    });
    $('dpad').addEventListener('pointerdown', e => {
        const btn = e.target.closest('.dpad-btn');
        if (!btn || !playing) return;
        queue = [];
        if (!tween) tryStep(btn.dataset.dir);
    });
    let pdown = null;
    canvas.addEventListener('pointerdown', e => { pdown = { x: e.clientX, y: e.clientY }; });
    canvas.addEventListener('pointerup', e => {
        if (!pdown || !playing) return;
        const dx = e.clientX - pdown.x, dy = e.clientY - pdown.y;
        pdown = null;
        if (Math.hypot(dx, dy) > 24) {
            const dir = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up');
            queue = [];
            if (!tween) tryStep(dir);
        } else {
            const rect = canvas.getBoundingClientRect();
            const cx = Math.floor((e.clientX - rect.left - pad) / cell);
            const cy = Math.floor((e.clientY - rect.top - pad) / cell);
            walkTo(cx, cy);
        }
    });

    /* ── layout & drawing ── */
    let cell = 40, pad = 14;
    function layout() {
        const availW = boardArea.clientWidth - 8, availH = boardArea.clientHeight - 8;
        cell = Math.floor(Math.min(availW, availH) / (size + .8));
        pad = Math.round(cell * .4);
        const px = size * cell + pad * 2;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        canvas.style.width = px + 'px';
        canvas.style.height = px + 'px';
        canvas.width = px * dpr;
        canvas.height = px * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }
    addEventListener('resize', layout);

    const cx = x => pad + (x + .5) * cell, cy = y => pad + (y + .5) * cell;

    function draw(now) {
        const px = size * cell + pad * 2;
        ctx.clearRect(0, 0, px, px);
        // floor
        ctx.fillStyle = '#fffdf5';
        ctx.strokeStyle = '#ffe0ef';
        roundRect(pad - cell * .35, pad - cell * .35, size * cell + cell * .7, size * cell + cell * .7, cell * .5);
        ctx.fill();
        // trail
        for (const t of trail) {
            ctx.globalAlpha = t.life * .35;
            ctx.fillStyle = '#a29bfe';
            ctx.beginPath();
            ctx.arc(cx(t.x), cy(t.y), cell * .13, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        // walls
        ctx.strokeStyle = '#f8a5c2';
        ctx.lineWidth = Math.max(5, cell * .18);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let y = 0; y < size; y++) for (let x = 0; x < size; x++) {
            const w = walls[idx(x, y)], L = pad + x * cell, T = pad + y * cell;
            if (w & 1) { ctx.moveTo(L, T); ctx.lineTo(L + cell, T); }
            if (w & 8) { ctx.moveTo(L, T); ctx.lineTo(L, T + cell); }
            if (y === size - 1 && (w & 4)) { ctx.moveTo(L, T + cell); ctx.lineTo(L + cell, T + cell); }
            if (x === size - 1 && (w & 2)) { ctx.moveTo(L + cell, T); ctx.lineTo(L + cell, T + cell); }
        }
        ctx.stroke();
        // goal & stars
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.font = Math.round(cell * .62) + 'px sans-serif';
        ctx.fillText('🏁', cx(goal.x), cy(goal.y));
        for (const s of stars) {
            if (s.got) continue;
            const bob = Math.sin(now / 400 + s.x + s.y) * cell * .05;
            ctx.fillText('⭐', cx(s.x), cy(s.y) + bob);
        }
        // sparkles
        for (const sp of sparkles) {
            ctx.globalAlpha = sp.life;
            ctx.fillStyle = '#f5b70a';
            ctx.beginPath();
            ctx.arc(cx(sp.x), cy(sp.y), cell * .06, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.globalAlpha = 1;
        // player
        let plx = player.x, ply = player.y, hop = 0;
        if (tween) {
            const t = tween.t, e = t * t * (3 - 2 * t);
            plx = tween.fx + (tween.tx - tween.fx) * e;
            ply = tween.fy + (tween.ty - tween.fy) * e;
            hop = Math.sin(t * Math.PI) * cell * .22;
        }
        ctx.font = Math.round(cell * .7) + 'px sans-serif';
        ctx.fillText(charEmoji, cx(plx), cy(ply) - hop);
    }

    function roundRect(x, y, w, h, r) {
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.arcTo(x + w, y, x + w, y + h, r);
        ctx.arcTo(x + w, y + h, x, y + h, r);
        ctx.arcTo(x, y + h, x, y, r);
        ctx.arcTo(x, y, x + w, y, r);
        ctx.closePath();
    }

    let last = performance.now();
    function step(now) {
        const dt = Math.min(.05, (now - last) / 1000);
        last = now;
        if (tween) {
            tween.t += dt / .16;
            if (tween.t >= 1) arrive();
        }
        for (const t of trail) t.life -= dt * .8;
        trail = trail.filter(t => t.life > 0);
        for (const sp of sparkles) { sp.x += sp.vx * dt; sp.y += sp.vy * dt; sp.life -= dt * 1.5; }
        sparkles = sparkles.filter(sp => sp.life > 0);
        draw(now);
        requestAnimationFrame(step);
    }

    /* ── menu ── */
    const charPicker = $('char-picker');
    charPicker.addEventListener('click', e => {
        const btn = e.target.closest('.pick-btn');
        if (!btn) return;
        charPicker.querySelectorAll('.pick-btn').forEach(b => b.classList.remove('selected'));
        btn.classList.add('selected');
        charEmoji = btn.dataset.char;
        localStorage.setItem(LS + 'char', charEmoji);
        sHop();
    });
    (charPicker.querySelector(`[data-char="${charEmoji}"]`) || charPicker.querySelector('.pick-btn')).classList.add('selected');

    function refreshMenu() {
        const bestLevel = +(localStorage.getItem(LS + 'level') || 1);
        $('progress-line').textContent = `⭐ ${totalStars} stars · best level ${bestLevel}`;
        $('continue-btn').textContent = bestLevel > 1 ? `▶ Continue (level ${bestLevel})` : '▶ Play!';
        $('restart-btn').hidden = bestLevel <= 1;
    }
    $('continue-btn').addEventListener('click', () => {
        level = +(localStorage.getItem(LS + 'level') || 1);
        menuOverlay.classList.remove('show');
        startLevel();
    });
    $('restart-btn').addEventListener('click', () => {
        level = 1; totalStars = 0;
        localStorage.setItem(LS + 'level', 1);
        localStorage.setItem(LS + 'stars', 0);
        menuOverlay.classList.remove('show');
        startLevel();
    });
    $('next-btn').addEventListener('click', () => {
        winOverlay.classList.remove('show');
        startLevel();
    });
    $('menu-btn').addEventListener('click', () => {
        winOverlay.classList.remove('show');
        refreshMenu();
        menuOverlay.classList.add('show');
    });

    /* ── init ── */
    if (window.matchMedia('(pointer: coarse)').matches) document.body.classList.add('touch');
    refreshMenu();
    startLevel();
    playing = false;
    requestAnimationFrame(step);
})();
