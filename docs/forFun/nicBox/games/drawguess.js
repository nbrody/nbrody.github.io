// ═══════════════════════════════════════════════════════════
// Draw & Guess — TV-side game logic
// One player draws on their phone, everyone else guesses
// ═══════════════════════════════════════════════════════════

class DrawGuessGame {
    constructor(roomCode, players, container) {
        this.roomCode = roomCode;
        this.players = players;
        this.container = container;
        this.playerIds = Object.keys(players);
        this.listeners = [];

        this.currentDrawerIndex = 0;
        this.currentWord = '';
        this.round = 0;
        this.totalRounds = this.playerIds.length * 2; // each player draws twice
        this.timer = null;
        this.timeLeft = 60;
        this.guessedPlayers = {};
        this.strokes = [];      // full drawing data from drawer

        this.wordBank = [
            // Easy
            'cat', 'dog', 'sun', 'house', 'tree', 'car', 'fish', 'star', 'moon', 'hat',
            'ball', 'book', 'cake', 'shoe', 'bird', 'flower', 'cloud', 'heart', 'apple', 'pizza',
            // Medium
            'airplane', 'guitar', 'elephant', 'dinosaur', 'rainbow', 'snowman', 'rocket',
            'bicycle', 'butterfly', 'waterfall', 'volcano', 'lighthouse', 'umbrella',
            'penguin', 'cactus', 'octopus', 'campfire', 'tornado', 'mermaid', 'pirate',
            // Hard
            'photosynthesis', 'democracy', 'nostalgia', 'electricity', 'spaghetti',
            'trampoline', 'skyscraper', 'chameleon', 'constellation', 'avalanche',
            'hibernation', 'windmill', 'fireworks', 'quicksand', 'homework'
        ];

        // Shuffle the word bank
        this.wordBank = this.wordBank.sort(() => Math.random() - 0.5);
        this.wordIndex = 0;

        this.init();
    }

    init() {
        this.render();
        this.listenForDrawing();
        this.listenForGuesses();
        this.startRound();
    }

    nextWord() {
        const word = this.wordBank[this.wordIndex % this.wordBank.length];
        this.wordIndex++;
        return word;
    }

    // ── Render ─────────────────────────────────────────────

    render() {
        this.container.innerHTML = `
            <div class="dg-container">
                <div class="dg-header">
                    <span id="dg-round" style="font-size: 0.8rem; color: var(--text-muted);">
                        Round 1 / ${this.totalRounds}
                    </span>
                    <div class="dg-timer" id="dg-timer">60</div>
                </div>

                <div id="dg-word-display" class="dg-word-display"></div>

                <div id="dg-drawer-label" class="dg-drawer-label"></div>

                <div class="dg-canvas-wrapper">
                    <canvas id="dg-canvas" width="700" height="500"></canvas>
                </div>

                <div id="dg-guesses" class="dg-guesses-feed"></div>
            </div>
        `;

        this.canvas = document.getElementById('dg-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.ctx.lineCap = 'round';
        this.ctx.lineJoin = 'round';
        this.clearCanvas();
    }

    clearCanvas() {
        this.ctx.fillStyle = '#ffffff';
        this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
        this.strokes = [];
    }

    // ── Round Flow ─────────────────────────────────────────

    startRound() {
        this.round++;
        if (this.round > this.totalRounds) {
            this.endDrawGuess();
            return;
        }

        this.currentDrawerIndex = (this.round - 1) % this.playerIds.length;
        const drawerId = this.playerIds[this.currentDrawerIndex];
        const drawer = this.players[drawerId];

        this.currentWord = this.nextWord();
        this.guessedPlayers = {};
        this.clearCanvas();
        this.timeLeft = 60;

        document.getElementById('dg-round').textContent = `Round ${this.round} / ${this.totalRounds}`;
        document.getElementById('dg-guesses').innerHTML = '';

        // Show word hint (blanks) to guessers
        const blanks = this.currentWord.split('').map(c => c === ' ' ? '  ' : '_').join(' ');
        document.getElementById('dg-word-display').innerHTML = `
            <span class="dg-blanks">${blanks}</span>
            <span class="dg-word-length">(${this.currentWord.length} letters)</span>
        `;

        document.getElementById('dg-drawer-label').innerHTML = `
            ${drawer.avatar} <span style="color:${drawer.color};font-weight:700;">${drawer.name}</span> is drawing!
        `;

        // Push state to Firebase
        updateGameState(this.roomCode, {
            phase: 'drawing',
            drawerId: drawerId,
            word: this.currentWord,  // only the drawer's phone reads this
            wordLength: this.currentWord.length,
            drawing: null,
            guesses: null,
            actions: null,
            timeLeft: this.timeLeft
        });

        this.startTimer();
    }

    startTimer() {
        if (this.timer) clearInterval(this.timer);

        this.updateTimerDisplay();

        this.timer = setInterval(() => {
            this.timeLeft--;
            this.updateTimerDisplay();

            if (this.timeLeft <= 0) {
                clearInterval(this.timer);
                this.revealWord();
            }
        }, 1000);
    }

    updateTimerDisplay() {
        const el = document.getElementById('dg-timer');
        if (!el) return;
        el.textContent = this.timeLeft;
        el.className = 'dg-timer';
        if (this.timeLeft <= 10) el.classList.add('danger');
        else if (this.timeLeft <= 20) el.classList.add('warning');
    }

    // ── Drawing Listener ───────────────────────────────────

    listenForDrawing() {
        const drawingRef = getRoomRef(this.roomCode).child('gameState/drawing');

        // Listen for incremental strokes
        drawingRef.on('value', (snapshot) => {
            const data = snapshot.val();
            if (!data) return;

            // Full redraw from stroke data
            this.ctx.fillStyle = '#ffffff';
            this.ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

            if (data.strokes) {
                const strokes = Object.values(data.strokes);
                for (const stroke of strokes) {
                    if (!stroke.points || stroke.points.length < 2) continue;
                    this.ctx.beginPath();
                    this.ctx.strokeStyle = stroke.color || '#000000';
                    this.ctx.lineWidth = stroke.width || 4;
                    const pts = Object.values(stroke.points);
                    this.ctx.moveTo(pts[0].x * this.canvas.width, pts[0].y * this.canvas.height);
                    for (let i = 1; i < pts.length; i++) {
                        this.ctx.lineTo(pts[i].x * this.canvas.width, pts[i].y * this.canvas.height);
                    }
                    this.ctx.stroke();
                }
            }

            // Handle clear command
            if (data.clear) {
                this.clearCanvas();
            }
        });

        this.listeners.push({ ref: drawingRef, event: 'value' });
    }

    // ── Guesses Listener ───────────────────────────────────

    listenForGuesses() {
        const actionsRef = getRoomRef(this.roomCode).child('gameState/actions');

        actionsRef.on('child_added', (snapshot) => {
            const data = snapshot.val();
            if (!data.action) return;

            if (data.action.type === 'draw_guess') {
                this.handleGuess(data.playerId, data.action.guess);
            }
        });

        this.listeners.push({ ref: actionsRef, event: 'child_added' });
    }

    handleGuess(playerId, guess) {
        const drawerId = this.playerIds[this.currentDrawerIndex];
        if (playerId === drawerId) return; // drawer can't guess
        if (this.guessedPlayers[playerId]) return; // already guessed correctly

        const player = this.players[playerId];
        const guessClean = guess.trim().toLowerCase();
        const correct = guessClean === this.currentWord.toLowerCase();

        // Show guess in feed
        const feedEl = document.getElementById('dg-guesses');
        const guessEl = document.createElement('div');
        guessEl.className = `dg-guess-item ${correct ? 'correct' : ''}`;
        guessEl.innerHTML = `
            <span style="color:${player.color};font-weight:600;">${player.name}:</span>
            ${correct ? '✅ Got it!' : escapeHtml(guess)}
        `;
        feedEl.appendChild(guessEl);
        feedEl.scrollTop = feedEl.scrollHeight;

        if (correct) {
            this.guessedPlayers[playerId] = true;

            // Score: more time left = more points
            const points = Math.max(10, Math.floor(this.timeLeft * 2));
            player.score = (player.score || 0) + points;
            updateScoreDisplay(playerId, player.score);

            // Drawer also gets points
            const drawer = this.players[drawerId];
            drawer.score = (drawer.score || 0) + 5;
            updateScoreDisplay(drawerId, drawer.score);

            renderScoreboard();

            // Check if everyone guessed
            const nonDrawerIds = this.playerIds.filter(id => id !== drawerId);
            const allGuessed = nonDrawerIds.every(id => this.guessedPlayers[id]);
            if (allGuessed) {
                clearInterval(this.timer);
                this.revealWord();
            }
        }
    }

    revealWord() {
        document.getElementById('dg-word-display').innerHTML = `
            <span class="dg-revealed-word">The word was: <strong>${this.currentWord}</strong></span>
        `;

        updateGameState(this.roomCode, {
            phase: 'reveal',
            revealedWord: this.currentWord
        });

        // Next round after delay
        setTimeout(() => {
            getRoomRef(this.roomCode).child('gameState/actions').remove();
            this.startRound();
        }, 4000);
    }

    // ── End ────────────────────────────────────────────────

    endDrawGuess() {
        this.cleanup();
        endGame();
    }

    cleanup() {
        if (this.timer) clearInterval(this.timer);
        this.listeners.forEach(l => l.ref.off(l.event));
        this.listeners = [];
    }
}

// ── Inject Draw & Guess styles ─────────────────────────────

const dgStyle = document.createElement('style');
dgStyle.textContent = `
    .dg-container {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 12px;
        width: 100%;
        max-width: 800px;
    }
    .dg-header {
        display: flex;
        align-items: center;
        justify-content: space-between;
        width: 100%;
    }
    .dg-timer {
        width: 56px;
        height: 56px;
        border-radius: 50%;
        display: flex;
        align-items: center;
        justify-content: center;
        font-family: 'Press Start 2P', monospace;
        font-size: 1.1rem;
        border: 3px solid var(--neon-green);
        box-shadow: var(--glow-green);
        transition: all 150ms ease;
    }
    .dg-timer.warning {
        border-color: var(--neon-orange);
        box-shadow: 0 0 20px rgba(255, 107, 53, 0.4);
        color: var(--neon-orange);
    }
    .dg-timer.danger {
        border-color: var(--neon-pink);
        box-shadow: var(--glow-pink);
        color: var(--neon-pink);
        animation: timerPulse 0.5s ease-in-out infinite;
    }
    .dg-word-display {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 4px;
    }
    .dg-blanks {
        font-family: 'Press Start 2P', monospace;
        font-size: clamp(1rem, 3vw, 1.6rem);
        letter-spacing: 4px;
        color: var(--text-primary);
    }
    .dg-word-length {
        font-size: 0.75rem;
        color: var(--text-muted);
    }
    .dg-revealed-word {
        font-size: 1.3rem;
        color: var(--neon-green);
        animation: playerJoin 0.4s ease forwards;
    }
    .dg-drawer-label {
        font-size: 0.95rem;
        color: var(--text-secondary);
    }
    .dg-canvas-wrapper {
        border-radius: 16px;
        overflow: hidden;
        border: 2px solid var(--glass-border);
        box-shadow: 0 10px 40px rgba(0,0,0,0.3);
        width: 100%;
        max-width: 700px;
    }
    .dg-canvas-wrapper canvas {
        display: block;
        width: 100%;
        height: auto;
    }
    .dg-guesses-feed {
        width: 100%;
        max-height: 120px;
        overflow-y: auto;
        display: flex;
        flex-direction: column;
        gap: 4px;
        padding: 0 4px;
    }
    .dg-guess-item {
        padding: 6px 12px;
        border-radius: 8px;
        background: var(--bg-glass);
        font-size: 0.85rem;
        animation: playerJoin 0.25s ease forwards;
        opacity: 0;
    }
    .dg-guess-item.correct {
        background: rgba(0, 255, 136, 0.12);
        border: 1px solid rgba(0, 255, 136, 0.25);
        font-weight: 700;
    }
`;
document.head.appendChild(dgStyle);
