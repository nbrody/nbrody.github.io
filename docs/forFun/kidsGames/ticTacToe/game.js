/* Tic-Tac-Toe — 2-player or vs robot (silly / okay / smart minimax) */
(() => {
    'use strict';

    const $ = id => document.getElementById(id);
    const board = $('board'), boardArea = $('board-area'), boardWrap = $('board-wrap');
    const winLine = $('win-line');
    const menuOverlay = $('menu-overlay'), resultOverlay = $('result-overlay');
    const resultTitle = $('result-title'), resultStats = $('result-stats');
    const turnBanner = $('turn-banner');
    const p1Chip = $('p1-chip'), p2Chip = $('p2-chip');
    const p1Glyph = $('p1-glyph'), p2Glyph = $('p2-glyph');
    const p1Name = $('p1-name'), p2Name = $('p2-name');
    const confettiCanvas = $('confetti-canvas'), cctx = confettiCanvas.getContext('2d');

    const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];

    let pieces = ['❌', '⭕'], mode = '2p';
    let cells = [], grid = [], cur = 0, over = true, robotBusy = false;
    let humanFirst = true;            // alternates each round
    let tally = [0, 0, 0];            // P1 wins, ties, P2 wins

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
    const sPlace = () => tone(420 + Math.random() * 160, .14, 'triangle', .2);
    const sTie = () => { tone(392, .2, 'sine', .18); tone(330, .25, 'sine', .18, .15); };
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
        if (!confettiRunning) { confettiRunning = true; let last = performance.now(); requestAnimationFrame(function step(now) {
            const dt = Math.min(.05, (now - last) / 1000); last = now;
            cctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height);
            confetti.forEach(p => {
                p.vy += 900 * dt; p.x += p.vx * dt; p.y += p.vy * dt; p.a += p.va * dt;
            });
            confetti = confetti.filter(p => p.y < innerHeight + 30);
            confetti.forEach(p => {
                cctx.save(); cctx.translate(p.x, p.y); cctx.rotate(p.a);
                cctx.fillStyle = p.c; cctx.fillRect(-p.r, -p.r * .6, p.r * 2, p.r * 1.2); cctx.restore();
            });
            if (confetti.length) requestAnimationFrame(step);
            else { confettiRunning = false; cctx.clearRect(0, 0, confettiCanvas.width, confettiCanvas.height); }
        }); }
    }

    /* ── pickers ── */
    function wirePicker(id, attr, set) {
        const el = $(id);
        el.addEventListener('click', e => {
            const btn = e.target.closest('.pick-btn');
            if (!btn) return;
            el.querySelectorAll('.pick-btn').forEach(b => b.classList.remove('selected'));
            btn.classList.add('selected');
            set(btn.dataset[attr]);
            sPlace();
        });
        el.querySelector('.pick-btn').classList.add('selected');
    }
    wirePicker('piece-picker', 'pieces', v => pieces = v.split(','));
    wirePicker('mode-picker', 'mode', v => mode = v);

    /* ── layout ── */
    function layout() {
        const s = Math.min(boardArea.clientWidth - 16, boardArea.clientHeight - 16, 460);
        boardWrap.style.setProperty('--board-s', Math.max(200, Math.floor(s)) + 'px');
    }
    addEventListener('resize', layout);

    /* ── game logic ── */
    const isRobot = () => mode !== '2p';
    const robotIdx = () => humanFirst ? 1 : 0;   // which side (0 or 1) the robot plays

    function winnerOf(g) {
        for (const L of LINES) {
            if (g[L[0]] !== null && g[L[0]] === g[L[1]] && g[L[1]] === g[L[2]]) return { p: g[L[0]], line: L };
        }
        return null;
    }
    const openCells = g => g.map((v, i) => v === null ? i : -1).filter(i => i >= 0);

    function startRound() {
        grid = Array(9).fill(null);
        over = false; robotBusy = false;
        cur = 0;
        board.innerHTML = '';
        cells = [];
        for (let i = 0; i < 9; i++) {
            const c = document.createElement('button');
            c.className = 'cell';
            c.setAttribute('aria-label', 'cell ' + (i + 1));
            c.addEventListener('click', () => onTap(i));
            board.appendChild(c);
            cells.push(c);
        }
        winLine.hidden = true;
        p1Glyph.textContent = pieces[0];
        p2Glyph.textContent = pieces[1];
        if (isRobot()) {
            p1Name.textContent = humanFirst ? 'You' : 'Robot';
            p2Name.textContent = humanFirst ? 'Robot' : 'You';
        } else {
            p1Name.textContent = 'P1'; p2Name.textContent = 'P2';
        }
        layout();
        updateTurnUI();
        menuOverlay.classList.remove('show');
        resultOverlay.classList.remove('show');
        if (isRobot() && cur === robotIdx()) scheduleRobot();
    }

    function updateTurnUI() {
        const names = [p1Name.textContent, p2Name.textContent];
        turnBanner.textContent = isRobot()
            ? (cur === robotIdx() ? 'Robot is thinking… 🤔' : 'Your turn! 👆')
            : names[cur] + "'s turn!";
        turnBanner.className = 'turn-p' + (cur + 1);
        p1Chip.classList.toggle('active', cur === 0);
        p2Chip.classList.toggle('active', cur === 1);
    }

    function onTap(i) {
        if (over || robotBusy || grid[i] !== null) return;
        if (isRobot() && cur === robotIdx()) return;
        place(i);
    }

    function place(i) {
        grid[i] = cur;
        cells[i].classList.add('filled');
        cells[i].innerHTML = '<span>' + pieces[cur] + '</span>';
        sPlace();
        const w = winnerOf(grid);
        if (w) return endRound(w);
        if (openCells(grid).length === 0) return endRound(null);
        cur = 1 - cur;
        updateTurnUI();
        if (isRobot() && cur === robotIdx()) scheduleRobot();
    }

    function scheduleRobot() {
        robotBusy = true;
        setTimeout(() => {
            if (over) { robotBusy = false; return; }
            const i = robotMove();
            robotBusy = false;
            place(i);
        }, 650);
    }

    function robotMove() {
        const me = robotIdx(), open = openCells(grid);
        const rand = () => open[Math.floor(Math.random() * open.length)];
        const lineMove = p => {
            for (const i of open) { grid[i] = p; const w = winnerOf(grid); grid[i] = null; if (w) return i; }
            return -1;
        };
        if (mode === 'silly') {
            // mostly random, sometimes takes a win
            const w = lineMove(me);
            return (w >= 0 && Math.random() < .3) ? w : rand();
        }
        if (mode === 'okay') {
            const w = lineMove(me); if (w >= 0) return w;
            const b = lineMove(1 - me); if (b >= 0) return b;
            if (grid[4] === null) return 4;
            return rand();
        }
        // smart: minimax
        let best = -Infinity, choice = open[0];
        for (const i of open) {
            grid[i] = me;
            const s = minimax(1 - me, me, 0);
            grid[i] = null;
            if (s > best) { best = s; choice = i; }
        }
        return choice;
    }

    function minimax(turn, me, depth) {
        const w = winnerOf(grid);
        if (w) return w.p === me ? 10 - depth : depth - 10;
        const open = openCells(grid);
        if (!open.length) return 0;
        let best = turn === me ? -Infinity : Infinity;
        for (const i of open) {
            grid[i] = turn;
            const s = minimax(1 - turn, me, depth + 1);
            grid[i] = null;
            best = turn === me ? Math.max(best, s) : Math.min(best, s);
        }
        return best;
    }

    function drawWinLine(L) {
        const wr = boardWrap.getBoundingClientRect();
        const c = i => {
            const r = cells[i].getBoundingClientRect();
            return { x: r.left - wr.left + r.width / 2, y: r.top - wr.top + r.height / 2 };
        };
        const a = c(L[0]), b = c(L[2]);
        const dx = b.x - a.x, dy = b.y - a.y;
        const len = Math.hypot(dx, dy) + wr.width * .12;
        const ang = Math.atan2(dy, dx);
        const ox = (wr.width * .06) * Math.cos(ang), oy = (wr.width * .06) * Math.sin(ang);
        winLine.style.left = (a.x - ox) + 'px';
        winLine.style.top = (a.y - oy - 7) + 'px';
        winLine.style.width = len + 'px';
        winLine.style.setProperty('--ang', ang + 'rad');
        winLine.style.animation = 'none';
        void winLine.offsetWidth;          // restart the grow animation each round
        winLine.style.animation = '';
        winLine.hidden = false;
    }

    function endRound(w) {
        over = true;
        if (w) {
            w.line.forEach(i => cells[i].classList.add('win-cell'));
            drawWinLine(w.line);
            tally[w.p === 0 ? 0 : 2]++;
            const robotWon = isRobot() && w.p === robotIdx();
            if (!robotWon) { sWin(); burstConfetti(120); }
            else sTie();
            setTimeout(() => showResult(w.p, robotWon), 1100);
        } else {
            tally[1]++;
            sTie();
            setTimeout(() => showResult(null, false), 700);
        }
    }

    function showResult(winner, robotWon) {
        if (winner === null) resultTitle.textContent = '🤝 It\'s a tie!';
        else if (isRobot()) resultTitle.textContent = robotWon ? '🤖 Robot wins this one!' : '🎉 You win!';
        else resultTitle.textContent = '🎉 ' + pieces[winner] + ' wins!';
        const n1 = isRobot() ? (humanFirst ? 'You' : 'Robot') : 'P1';
        const n2 = isRobot() ? (humanFirst ? 'Robot' : 'You') : 'P2';
        resultStats.innerHTML =
            pieces[0] + ' ' + n1 + ': <b>' + tally[0] + '</b> &nbsp;·&nbsp; 🤝 Ties: <b>' + tally[1] +
            '</b> &nbsp;·&nbsp; ' + pieces[1] + ' ' + n2 + ': <b>' + tally[2] + '</b>';
        resultOverlay.classList.add('show');
    }

    $('play-btn').addEventListener('click', () => {
        tally = [0, 0, 0];
        humanFirst = true;
        startRound();
    });
    $('again-btn').addEventListener('click', () => {
        humanFirst = !humanFirst;   // first mover alternates each round
        startRound();
    });
    $('menu-btn').addEventListener('click', () => {
        resultOverlay.classList.remove('show');
        menuOverlay.classList.add('show');
    });
})();
