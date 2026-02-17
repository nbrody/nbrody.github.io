// ═══════════════════════════════════════════════════════════
// nicBox — Phone Controller
// ═══════════════════════════════════════════════════════════

let myRoom = null;
let myPlayerId = null;
let myPlayerData = null;
let myIsHost = false;
let currentControllerGame = null;

// ─── Initialization ────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
    // Check URL for room code
    const params = new URLSearchParams(window.location.search);
    const room = params.get('room');
    if (room) {
        document.getElementById('room-input').value = room.toUpperCase();
    }

    // Avatar picker
    document.querySelectorAll('.avatar-option').forEach(opt => {
        opt.addEventListener('click', () => {
            document.querySelectorAll('.avatar-option').forEach(o => o.classList.remove('selected'));
            opt.classList.add('selected');
        });
    });

    // Enter key handlers
    document.getElementById('room-input').addEventListener('keyup', (e) => {
        if (e.key === 'Enter') document.getElementById('name-input').focus();
    });
    document.getElementById('name-input').addEventListener('keyup', (e) => {
        if (e.key === 'Enter') handleJoin();
    });
});

// ─── Join Flow ─────────────────────────────────────────────

async function handleJoin() {
    const roomCode = document.getElementById('room-input').value.trim().toUpperCase();
    const playerName = document.getElementById('name-input').value.trim();
    const avatar = document.querySelector('.avatar-option.selected')?.dataset.avatar || '😀';

    // Validate
    if (!roomCode || roomCode.length !== 4) {
        showJoinError('Enter a 4-character room code');
        return;
    }
    if (!playerName) {
        showJoinError('Enter your name');
        return;
    }

    const btn = document.getElementById('btn-join');
    btn.disabled = true;
    btn.textContent = 'Joining...';

    try {
        const result = await joinRoom(roomCode, playerName, avatar);
        myRoom = roomCode;
        myPlayerId = result.playerId;
        myIsHost = result.isHost;
        myPlayerData = { name: playerName, avatar, color: result.color, isHost: myIsHost };

        // Set up presence
        setupPresence(roomCode, result.playerId);

        // Show waiting screen
        showWaitingScreen();

        // Listen for game state changes
        listenForGameChanges();

    } catch (err) {
        console.error('Join failed:', err);
        showJoinError(err.message || 'Failed to join room');
        btn.disabled = false;
        btn.textContent = 'Join Game';
    }
}

function showJoinError(msg) {
    const el = document.getElementById('join-error');
    el.textContent = msg;
    el.style.display = 'block';
    setTimeout(() => { el.style.display = 'none'; }, 4000);
}

function showWaitingScreen() {
    document.getElementById('join-screen').style.display = 'none';
    document.getElementById('waiting-screen').style.display = 'flex';

    document.getElementById('my-avatar').textContent = myPlayerData.avatar;
    document.getElementById('my-name').textContent = myPlayerData.name;
    document.getElementById('role-badge').textContent = myIsHost ? '★ Host' : 'Player';
    document.getElementById('role-badge').className = `status-badge ${myIsHost ? 'success' : 'waiting'}`;
}

// ─── Game State Listener ───────────────────────────────────

function listenForGameChanges() {
    const roomRef = getRoomRef(myRoom);

    // Listen for state changes
    roomRef.child('state').on('value', (snapshot) => {
        const state = snapshot.val();
        if (state === 'playing') {
            // Check which game
            roomRef.child('game').once('value', (gs) => {
                const game = gs.val();
                showControllerForGame(game);
            });
        } else if (state === 'lobby' || state === 'picking') {
            showWaitingScreen();
            document.getElementById('controller-screen').style.display = 'none';
        } else if (state === 'results') {
            showResultsOnPhone();
        }
    });

    // Listen for score changes
    roomRef.child(`players/${myPlayerId}/score`).on('value', (snapshot) => {
        const score = snapshot.val() || 0;
        const el = document.getElementById('ctrl-score');
        if (el) el.innerHTML = `Score: <strong>${score}</strong>`;
    });
}

// ─── Controller Screens ────────────────────────────────────

function showControllerForGame(gameName) {
    document.getElementById('waiting-screen').style.display = 'none';
    document.getElementById('controller-screen').style.display = 'flex';

    document.getElementById('ctrl-avatar').textContent = myPlayerData.avatar;
    document.getElementById('ctrl-name').textContent = myPlayerData.name;

    const body = document.getElementById('controller-body');
    body.innerHTML = '';

    switch (gameName) {
        case 'trivia':
            setupTriviaController(body);
            break;
        case 'war':
            setupWarController(body);
            break;
        case 'blackjack':
            setupBlackjackController(body);
            break;
        case 'checkers':
            setupCheckersController(body);
            break;
        case 'drawguess':
            setupDrawGuessController(body);
            break;
        default:
            body.innerHTML = `
                <span style="font-size: 3rem;">🎮</span>
                <p style="color: var(--text-secondary);">Watch the TV screen!</p>
            `;
    }
}

// ─── Trivia Controller ─────────────────────────────────────

function setupTriviaController(container) {
    container.innerHTML = `
        <p style="color: var(--text-secondary); font-size: 0.9rem; text-align: center;">
            Look at the TV for the question!
        </p>
        <div class="phone-trivia-grid" id="phone-answers">
            <button class="phone-trivia-btn a" onclick="submitTriviaAnswer(0)">A</button>
            <button class="phone-trivia-btn b" onclick="submitTriviaAnswer(1)">B</button>
            <button class="phone-trivia-btn c" onclick="submitTriviaAnswer(2)">C</button>
            <button class="phone-trivia-btn d" onclick="submitTriviaAnswer(3)">D</button>
        </div>
        <p id="answer-status" class="status-badge waiting" style="display: none;"></p>
    `;

    // Listen for new questions to reset buttons
    getRoomRef(myRoom).child('gameState/currentQuestion').on('value', (snapshot) => {
        if (snapshot.val() !== null) {
            resetTriviaButtons();
        }
    });

    // Listen for answer reveals
    getRoomRef(myRoom).child('gameState/revealAnswer').on('value', (snapshot) => {
        const correctIndex = snapshot.val();
        if (correctIndex !== null) {
            revealCorrectOnPhone(correctIndex);
        }
    });
}

function submitTriviaAnswer(answerIndex) {
    const buttons = document.querySelectorAll('.phone-trivia-btn');
    buttons.forEach(b => b.classList.add('answered'));
    buttons[answerIndex].classList.add('selected-answer');

    // Send answer to Firebase
    playerAction(myRoom, myPlayerId, {
        type: 'trivia_answer',
        answer: answerIndex,
        timestamp: Date.now()
    });

    const status = document.getElementById('answer-status');
    status.textContent = 'Answer locked in!';
    status.className = 'status-badge success';
    status.style.display = 'block';

    // Haptic feedback
    if (navigator.vibrate) navigator.vibrate(50);
}

function resetTriviaButtons() {
    const buttons = document.querySelectorAll('.phone-trivia-btn');
    buttons.forEach(b => {
        b.classList.remove('answered', 'selected-answer');
        b.style.opacity = '1';
    });
    const status = document.getElementById('answer-status');
    if (status) {
        status.style.display = 'none';
    }
}

function revealCorrectOnPhone(correctIndex) {
    const buttons = document.querySelectorAll('.phone-trivia-btn');
    buttons.forEach((b, i) => {
        if (i === correctIndex) {
            b.style.background = 'var(--neon-green)';
            b.style.color = '#0a0a1a';
        }
    });
}

// ─── War Controller ────────────────────────────────────────

function setupWarController(container) {
    container.innerHTML = `
        <div class="phone-card-display" id="war-card-display">
            <p style="color: var(--text-secondary);">Your cards are face-down.</p>
            <div class="playing-card face-down" style="width: 140px; height: 200px;"></div>
        </div>
        <button class="btn btn-primary btn-lg w-full" id="war-play-btn" onclick="playWarCard()" style="max-width: 300px;">
            🃏 Play Card
        </button>
    `;

    // Listen for turn state
    getRoomRef(myRoom).child('gameState/phase').on('value', (snapshot) => {
        const phase = snapshot.val();
        const playBtn = document.getElementById('war-play-btn');
        if (playBtn) {
            if (phase === 'waiting') {
                playBtn.disabled = false;
                playBtn.textContent = '🃏 Play Card';
            } else if (phase === 'reveal') {
                playBtn.disabled = true;
                playBtn.textContent = 'Watch the TV!';
            }
        }
    });
}

function playWarCard() {
    playerAction(myRoom, myPlayerId, {
        type: 'war_play',
        timestamp: Date.now()
    });

    const btn = document.getElementById('war-play-btn');
    btn.disabled = true;
    btn.textContent = 'Card played! ✓';

    if (navigator.vibrate) navigator.vibrate(50);
}

// ─── Checkers Controller ───────────────────────────────────

function setupCheckersController(container) {
    container.innerHTML = `
        <p id="checkers-turn-msg" style="color: var(--text-secondary); text-align: center;">
            Watch the TV screen for the board
        </p>
        <div id="checkers-moves" class="phone-moves-list"></div>
    `;

    // Listen for available moves and turn
    getRoomRef(myRoom).child('gameState').on('value', (snapshot) => {
        const state = snapshot.val();
        if (!state) return;

        const turnMsg = document.getElementById('checkers-turn-msg');
        const movesContainer = document.getElementById('checkers-moves');

        if (state.currentTurn === myPlayerId) {
            turnMsg.innerHTML = '<span class="your-turn-indicator">YOUR TURN!</span>';

            // Show available moves
            if (state.availableMoves) {
                const moves = Object.values(state.availableMoves);
                movesContainer.innerHTML = moves.map((move, i) => `
                    <button class="phone-move-btn" onclick="playCheckersMove(${i})">
                        ${move.from} → ${move.to} ${move.capture ? '(capture!)' : ''}
                    </button>
                `).join('');
            }
        } else {
            turnMsg.textContent = "Opponent's turn...";
            movesContainer.innerHTML = '';
        }
    });
}

function playCheckersMove(moveIndex) {
    playerAction(myRoom, myPlayerId, {
        type: 'checkers_move',
        moveIndex: moveIndex,
        timestamp: Date.now()
    });

    if (navigator.vibrate) navigator.vibrate(50);
}

// ─── Blackjack Controller ──────────────────────────────────

function setupBlackjackController(container) {
    container.innerHTML = `
        <div id="bj-phone-status" style="text-align: center; color: var(--text-secondary); font-size: 0.95rem;">
            Waiting for the deal...
        </div>
        <div id="bj-phone-cards" style="display: flex; gap: 6px; justify-content: center; flex-wrap: wrap; min-height: 100px;">
        </div>
        <div id="bj-phone-total" style="font-family: 'Press Start 2P', monospace; font-size: 1.2rem; text-align: center;">
        </div>
        <div id="bj-phone-actions" style="display: flex; gap: 12px; width: 100%; max-width: 320px;">
            <button class="btn btn-secondary" id="bj-hit-btn" onclick="bjHit()" style="flex:1;" disabled>
                👆 Hit
            </button>
            <button class="btn btn-primary" id="bj-stand-btn" onclick="bjStand()" style="flex:1;" disabled>
                ✋ Stand
            </button>
        </div>
    `;

    // Listen for phase & active player
    getRoomRef(myRoom).child('gameState').on('value', (snapshot) => {
        const state = snapshot.val();
        if (!state) return;

        const statusEl = document.getElementById('bj-phone-status');
        const hitBtn = document.getElementById('bj-hit-btn');
        const standBtn = document.getElementById('bj-stand-btn');

        if (!statusEl || !hitBtn || !standBtn) return;

        if (state.phase === 'playerTurn' && state.activePlayer === myPlayerId) {
            statusEl.innerHTML = '<span class="your-turn-indicator">YOUR TURN!</span>';
            hitBtn.disabled = false;
            standBtn.disabled = false;
        } else if (state.phase === 'playerTurn') {
            statusEl.textContent = 'Another player\'s turn...';
            hitBtn.disabled = true;
            standBtn.disabled = true;
        } else if (state.phase === 'dealerTurn') {
            statusEl.textContent = '🎩 Dealer is playing...';
            hitBtn.disabled = true;
            standBtn.disabled = true;
        } else if (state.phase === 'payout') {
            statusEl.textContent = 'Round over — check the TV!';
            hitBtn.disabled = true;
            standBtn.disabled = true;
        } else {
            statusEl.textContent = 'Waiting for the deal...';
            hitBtn.disabled = true;
            standBtn.disabled = true;
        }
    });
}

function bjHit() {
    playerAction(myRoom, myPlayerId, {
        type: 'blackjack_hit',
        timestamp: Date.now()
    });

    const hitBtn = document.getElementById('bj-hit-btn');
    const standBtn = document.getElementById('bj-stand-btn');
    if (hitBtn) hitBtn.disabled = true;
    if (standBtn) standBtn.disabled = true;

    if (navigator.vibrate) navigator.vibrate(50);
}

function bjStand() {
    playerAction(myRoom, myPlayerId, {
        type: 'blackjack_stand',
        timestamp: Date.now()
    });

    const hitBtn = document.getElementById('bj-hit-btn');
    const standBtn = document.getElementById('bj-stand-btn');
    if (hitBtn) hitBtn.disabled = true;
    if (standBtn) standBtn.disabled = true;

    document.getElementById('bj-phone-status').textContent = '✋ Standing — watch the TV!';

    if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
}

// ─── Draw & Guess Controller ───────────────────────────────

let dgCanvasSetup = false;
let dgIsDrawing = false;
let dgCurrentStroke = null;
let dgStrokeIndex = 0;
let dgCurrentColor = '#000000';
let dgCurrentWidth = 4;

function setupDrawGuessController(container) {
    dgCanvasSetup = false;
    dgStrokeIndex = 0;
    dgCurrentColor = '#000000';
    dgCurrentWidth = 4;

    container.innerHTML = `
        <div id="dg-phone-role" style="text-align: center; color: var(--text-secondary);">
            Loading...
        </div>

        <!-- DRAWER view -->
        <div id="dg-drawer-ui" style="display: none; width: 100%; flex-direction: column; align-items: center; gap: 12px;">
            <div id="dg-word-reveal" style="font-family: 'Press Start 2P', monospace; font-size: 1rem;
                 color: var(--neon-green); text-align: center; padding: 12px; border-radius: 12px;
                 background: rgba(0,255,136,0.08); border: 1px solid rgba(0,255,136,0.2); width: 100%;">
            </div>
            <div style="border-radius: 12px; overflow: hidden; border: 2px solid var(--glass-border);
                        width: 100%; touch-action: none;">
                <canvas id="dg-phone-canvas" width="700" height="500"
                    style="width: 100%; height: auto; display: block; background: white;"></canvas>
            </div>
            <div style="display: flex; gap: 8px; flex-wrap: wrap; justify-content: center;">
                <button class="dg-color-btn" style="background:#000" onclick="dgSetColor('#000000', this)" data-active="true"></button>
                <button class="dg-color-btn" style="background:#d32f2f" onclick="dgSetColor('#d32f2f', this)"></button>
                <button class="dg-color-btn" style="background:#1565c0" onclick="dgSetColor('#1565c0', this)"></button>
                <button class="dg-color-btn" style="background:#2e7d32" onclick="dgSetColor('#2e7d32', this)"></button>
                <button class="dg-color-btn" style="background:#f9a825" onclick="dgSetColor('#f9a825', this)"></button>
                <button class="dg-color-btn" style="background:#6a1b9a" onclick="dgSetColor('#6a1b9a', this)"></button>
                <button class="dg-color-btn" style="background:#ff6f00" onclick="dgSetColor('#ff6f00', this)"></button>
                <button class="dg-color-btn" style="background:#fff;border:2px solid #ccc" onclick="dgSetColor('#ffffff', this)"></button>
            </div>
            <div style="display: flex; gap: 8px; align-items: center;">
                <span style="font-size: 0.75rem; color: var(--text-muted);">Thin</span>
                <input type="range" id="dg-brush-size" min="2" max="20" value="4" style="flex:1;"
                    oninput="dgCurrentWidth = parseInt(this.value)">
                <span style="font-size: 0.75rem; color: var(--text-muted);">Thick</span>
            </div>
            <button class="btn btn-ghost btn-sm" onclick="dgClearCanvas()">🗑 Clear</button>
        </div>

        <!-- GUESSER view -->
        <div id="dg-guesser-ui" style="display: none; width: 100%; flex-direction: column; align-items: center; gap: 16px;">
            <p style="color: var(--text-secondary); text-align: center;">Watch the TV and guess what's being drawn!</p>
            <div style="display: flex; gap: 8px; width: 100%; max-width: 320px;">
                <input type="text" id="dg-guess-input" class="input-field" placeholder="Type your guess..."
                       style="flex: 1; text-align: left; font-size: 1rem;" autocomplete="off">
                <button class="btn btn-primary" onclick="dgSubmitGuess()">Send</button>
            </div>
            <div id="dg-phone-feed" style="width: 100%; max-height: 200px; overflow-y: auto;
                 display: flex; flex-direction: column; gap: 4px;"></div>
        </div>
    `;

    // Add color-btn styles
    if (!document.getElementById('dg-phone-styles')) {
        const s = document.createElement('style');
        s.id = 'dg-phone-styles';
        s.textContent = `
            .dg-color-btn {
                width: 36px; height: 36px; border-radius: 50%; border: 3px solid transparent;
                cursor: pointer; transition: transform 150ms ease;
                -webkit-tap-highlight-color: transparent;
            }
            .dg-color-btn:active { transform: scale(0.9); }
            .dg-color-btn[data-active="true"] { border-color: var(--neon-blue); transform: scale(1.15); }
        `;
        document.head.appendChild(s);
    }

    // Enter key for guesses
    setTimeout(() => {
        const guessInput = document.getElementById('dg-guess-input');
        if (guessInput) {
            guessInput.addEventListener('keyup', (e) => {
                if (e.key === 'Enter') dgSubmitGuess();
            });
        }
    }, 100);

    // Listen for game state to know if we're the drawer
    getRoomRef(myRoom).child('gameState').on('value', (snapshot) => {
        const state = snapshot.val();
        if (!state) return;

        const roleEl = document.getElementById('dg-phone-role');
        const drawerUI = document.getElementById('dg-drawer-ui');
        const guesserUI = document.getElementById('dg-guesser-ui');
        if (!roleEl || !drawerUI || !guesserUI) return;

        const isDrawer = state.drawerId === myPlayerId;

        if (state.phase === 'drawing') {
            if (isDrawer) {
                roleEl.innerHTML = '🎨 <strong>You are drawing!</strong>';
                drawerUI.style.display = 'flex';
                guesserUI.style.display = 'none';
                document.getElementById('dg-word-reveal').textContent = `Draw: ${state.word}`;

                if (!dgCanvasSetup) {
                    dgCanvasSetup = true;
                    dgStrokeIndex = 0;
                    initDrawCanvas();
                }
            } else {
                roleEl.innerHTML = '🤔 <strong>Guess what\'s being drawn!</strong>';
                drawerUI.style.display = 'none';
                guesserUI.style.display = 'flex';
                dgCanvasSetup = false;
            }
        } else if (state.phase === 'reveal') {
            roleEl.innerHTML = `The word was: <strong style="color:var(--neon-green);">${state.revealedWord || ''}</strong>`;
            drawerUI.style.display = 'none';
            guesserUI.style.display = 'none';
            dgCanvasSetup = false;
        }
    });
}

function initDrawCanvas() {
    const canvas = document.getElementById('dg-phone-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Clear previous drawing data in Firebase
    getRoomRef(myRoom).child('gameState/drawing').set({ strokes: {} });

    const getPos = (e) => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = canvas.width / rect.width;
        const scaleY = canvas.height / rect.height;
        const touch = e.touches ? e.touches[0] : e;
        return {
            x: (touch.clientX - rect.left) * scaleX / canvas.width,
            y: (touch.clientY - rect.top) * scaleY / canvas.height
        };
    };

    const startDraw = (e) => {
        e.preventDefault();
        dgIsDrawing = true;
        const pos = getPos(e);
        dgCurrentStroke = {
            color: dgCurrentColor,
            width: dgCurrentWidth,
            points: [pos]
        };
    };

    const moveDraw = (e) => {
        if (!dgIsDrawing || !dgCurrentStroke) return;
        e.preventDefault();
        const pos = getPos(e);
        dgCurrentStroke.points.push(pos);

        // Draw locally for preview
        const pts = dgCurrentStroke.points;
        ctx.beginPath();
        ctx.strokeStyle = dgCurrentStroke.color;
        ctx.lineWidth = dgCurrentStroke.width;
        if (pts.length >= 2) {
            const p1 = pts[pts.length - 2];
            const p2 = pts[pts.length - 1];
            ctx.moveTo(p1.x * canvas.width, p1.y * canvas.height);
            ctx.lineTo(p2.x * canvas.width, p2.y * canvas.height);
        }
        ctx.stroke();
    };

    const endDraw = (e) => {
        if (!dgIsDrawing || !dgCurrentStroke) return;
        e.preventDefault();
        dgIsDrawing = false;

        // Push stroke to Firebase
        const strokeKey = `s${dgStrokeIndex++}`;
        const strokeData = {
            color: dgCurrentStroke.color,
            width: dgCurrentStroke.width,
            points: {}
        };
        dgCurrentStroke.points.forEach((p, i) => {
            strokeData.points[`p${i}`] = p;
        });
        getRoomRef(myRoom).child(`gameState/drawing/strokes/${strokeKey}`).set(strokeData);
        dgCurrentStroke = null;
    };

    // Touch events
    canvas.addEventListener('touchstart', startDraw, { passive: false });
    canvas.addEventListener('touchmove', moveDraw, { passive: false });
    canvas.addEventListener('touchend', endDraw, { passive: false });

    // Mouse events (for testing on desktop)
    canvas.addEventListener('mousedown', startDraw);
    canvas.addEventListener('mousemove', moveDraw);
    canvas.addEventListener('mouseup', endDraw);
    canvas.addEventListener('mouseleave', endDraw);
}

function dgSetColor(color, btn) {
    dgCurrentColor = color;
    document.querySelectorAll('.dg-color-btn').forEach(b => b.removeAttribute('data-active'));
    if (btn) btn.setAttribute('data-active', 'true');
}

function dgClearCanvas() {
    const canvas = document.getElementById('dg-phone-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    dgStrokeIndex = 0;

    // Clear in Firebase
    getRoomRef(myRoom).child('gameState/drawing').set({ strokes: {}, clear: true });
    setTimeout(() => {
        getRoomRef(myRoom).child('gameState/drawing/clear').remove();
    }, 500);
}

function dgSubmitGuess() {
    const input = document.getElementById('dg-guess-input');
    if (!input) return;
    const guess = input.value.trim();
    if (!guess) return;

    playerAction(myRoom, myPlayerId, {
        type: 'draw_guess',
        guess: guess,
        timestamp: Date.now()
    });

    // Show in local feed
    const feed = document.getElementById('dg-phone-feed');
    if (feed) {
        const item = document.createElement('div');
        item.style.cssText = 'padding:6px 12px;border-radius:8px;background:var(--bg-glass);font-size:0.85rem;';
        item.textContent = `You: ${guess}`;
        feed.appendChild(item);
        feed.scrollTop = feed.scrollHeight;
    }

    input.value = '';
    input.focus();

    if (navigator.vibrate) navigator.vibrate(30);
}

// ─── Results on Phone ──────────────────────────────────────

function showResultsOnPhone() {
    document.getElementById('waiting-screen').style.display = 'none';
    document.getElementById('controller-screen').style.display = 'flex';

    const body = document.getElementById('controller-body');
    body.innerHTML = `
        <span style="font-size: 4rem;">🏆</span>
        <h2 style="font-family: 'Press Start 2P', monospace; font-size: 1rem;">Game Over!</h2>
        <p style="color: var(--text-secondary);">Check the TV for results!</p>
    `;
}

// ─── Utilities ─────────────────────────────────────────────

function showToast(message, duration = 3000) {
    const toast = document.getElementById('toast');
    toast.textContent = message;
    toast.classList.add('show');
    setTimeout(() => toast.classList.remove('show'), duration);
}

