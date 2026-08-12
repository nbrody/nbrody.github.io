/* Memory Match — card flip game with plushie photos + emoji themes */
(() => {
    'use strict';

    const $ = id => document.getElementById(id);
    const board = $('board'), boardArea = $('board-area');
    const menuOverlay = $('menu-overlay'), winOverlay = $('win-overlay');
    const movesEl = $('moves'), pairsEl = $('pairs');
    const hudSolo = $('hud-solo'), hudDuel = $('hud-duel');
    const p1Chip = $('p1-chip'), p2Chip = $('p2-chip');
    const p1ScoreEl = $('p1-score'), p2ScoreEl = $('p2-score');
    const turnBanner = $('turn-banner');
    const winTitle = $('win-title'), winStats = $('win-stats');
    const confettiCanvas = $('confetti-canvas'), cctx = confettiCanvas.getContext('2d');

    const THEMES = {
        plush: ['bear', 'bunny', 'cat', 'drums', 'elephant', 'guitar', 'penguin', 'piano', 'puppy', 'trumpet']
            .map(n => ({ type: 'img', v: 'images/' + n + '.png' })),
        animals: ['🐶', '🐱', '🦊', '🐼', '🦁', '🐸', '🐵', '🦄', '🐷', '🐧'].map(v => ({ type: 'emoji', v })),
        treats: ['🍩', '🍭', '🍦', '🧁', '🍉', '🍪', '🍓', '🍌', '🥨', '🍫'].map(v => ({ type: 'emoji', v })),
        space: ['🚀', '🛸', '🌟', '🪐', '🌙', '👽', '☄️', '🌈', '🔭', '🛰️'].map(v => ({ type: 'emoji', v }))
    };

    let theme = 'plush', nPairs = 6, mode = 'solo';
    let flipped = [], matchedCount = 0, moves = 0, lockUntil = 0;
    let curPlayer = 1, scores = [0, 0];
    let cols = 4, rows = 3;

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
    const sFlip = () => tone(500 + Math.random() * 120, .12, 'triangle', .15);
    const sMatch = () => { tone(660, .18, 'sine', .25); tone(880, .22, 'sine', .25, .09); };
    const sMiss = () => tone(220, .2, 'sine', .12);
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
            sFlip();
        });
        el.querySelector('.pick-btn').classList.add('selected');
    }
    wirePicker('theme-picker', 'theme', v => theme = v);
    wirePicker('size-picker', 'pairs', v => nPairs = +v);
    wirePicker('mode-picker', 'mode', v => mode = v);

    /* ── layout ── */
    function layout() {
        const total = nPairs * 2;
        // pick cols to roughly match the viewport aspect
        const landscape = boardArea.clientWidth > boardArea.clientHeight;
        cols = { 6: landscape ? 4 : 3, 8: 4, 10: 5 }[nPairs];
        if (!landscape && nPairs === 10) cols = 4;
        rows = Math.ceil(total / cols);
        const gap = 12;
        const availW = boardArea.clientWidth - 24, availH = boardArea.clientHeight - 12;
        const w = Math.min(
            (availW - gap * (cols - 1)) / cols,
            ((availH - gap * (rows - 1)) / rows) / 1.2,
            150
        );
        board.style.setProperty('--card-w', Math.max(48, Math.floor(w)) + 'px');
        board.style.gridTemplateColumns = `repeat(${cols}, var(--card-w))`;
    }
    addEventListener('resize', layout);

    /* ── game ── */
    function startGame() {
        const faces = THEMES[theme].slice();
        for (let i = faces.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[faces[i], faces[j]] = [faces[j], faces[i]]; }
        const deck = faces.slice(0, nPairs).flatMap((f, i) => [{ ...f, pair: i }, { ...f, pair: i }]);
        for (let i = deck.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1));[deck[i], deck[j]] = [deck[j], deck[i]]; }

        board.innerHTML = '';
        deck.forEach(item => {
            const card = document.createElement('button');
            card.className = 'card';
            card.dataset.pair = item.pair;
            const face = item.type === 'img' ? `<img src="${item.v}" alt="" draggable="false">` : item.v;
            card.innerHTML = `<div class="card-inner">
                <div class="card-face card-back">✨</div>
                <div class="card-face card-front">${face}</div>
            </div>`;
            card.addEventListener('click', () => onFlip(card));
            board.appendChild(card);
        });

        flipped = []; matchedCount = 0; moves = 0; lockUntil = 0;
        curPlayer = 1; scores = [0, 0];
        movesEl.textContent = '0';
        pairsEl.textContent = '0/' + nPairs;
        p1ScoreEl.textContent = '0'; p2ScoreEl.textContent = '0';
        hudSolo.hidden = mode !== 'solo';
        hudDuel.hidden = mode !== 'duel';
        updateTurnUI();
        layout();
        menuOverlay.classList.remove('show');
        winOverlay.classList.remove('show');
    }

    function updateTurnUI() {
        if (mode !== 'duel') return;
        turnBanner.textContent = `Player ${curPlayer}'s turn!`;
        turnBanner.className = 'turn-p' + curPlayer;
        p1Chip.classList.toggle('active', curPlayer === 1);
        p2Chip.classList.toggle('active', curPlayer === 2);
    }

    function onFlip(card) {
        const now = performance.now();
        if (now < lockUntil) return;
        if (card.classList.contains('flipped') || card.classList.contains('matched')) return;
        if (flipped.length === 2) return;

        card.classList.add('flipped');
        sFlip();
        flipped.push(card);
        if (flipped.length < 2) return;

        moves++;
        movesEl.textContent = moves;
        const [a, b] = flipped;
        if (a.dataset.pair === b.dataset.pair) {
            matchedCount++;
            pairsEl.textContent = matchedCount + '/' + nPairs;
            setTimeout(() => {
                a.classList.add('matched'); b.classList.add('matched');
                a.classList.remove('flipped'); b.classList.remove('flipped');
                sMatch();
            }, 250);
            if (mode === 'duel') {
                scores[curPlayer - 1]++;
                (curPlayer === 1 ? p1ScoreEl : p2ScoreEl).textContent = scores[curPlayer - 1];
            }
            flipped = [];
            if (matchedCount === nPairs) setTimeout(win, 800);
        } else {
            lockUntil = now + 900;
            setTimeout(() => {
                a.classList.remove('flipped'); b.classList.remove('flipped');
                sMiss();
                flipped = [];
                if (mode === 'duel') { curPlayer = curPlayer === 1 ? 2 : 1; updateTurnUI(); }
            }, 850);
        }
    }

    function win() {
        sWin();
        burstConfetti(120);
        if (mode === 'solo') {
            const key = `kidsGames.matching.best.${theme}.${nPairs}`;
            const best = +(localStorage.getItem(key) || Infinity);
            const isBest = moves < best;
            if (isBest) localStorage.setItem(key, moves);
            winTitle.textContent = '🎉 You found them all!';
            winStats.innerHTML = `Moves: <b>${moves}</b><br>` +
                (isBest ? `<span class="best">🏆 New best!</span>` : `Best: <b>${Math.min(best, moves)}</b>`);
        } else {
            const [s1, s2] = scores;
            winTitle.textContent = s1 === s2 ? '🤝 It\'s a tie!' : `🎉 Player ${s1 > s2 ? 1 : 2} wins!`;
            winStats.innerHTML = `🍓 Player 1: <b>${s1}</b> &nbsp;·&nbsp; 🐳 Player 2: <b>${s2}</b>`;
        }
        winOverlay.classList.add('show');
    }

    $('play-btn').addEventListener('click', startGame);
    $('again-btn').addEventListener('click', startGame);
    $('menu-btn').addEventListener('click', () => {
        winOverlay.classList.remove('show');
        menuOverlay.classList.add('show');
    });
})();
