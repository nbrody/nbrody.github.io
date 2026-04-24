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
        case 'wingspan':
            setupWingspanController(body);
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

// ─── Wingspan Controller ───────────────────────────────────

const WS_C_FOOD_EMOJI = { invert: '🐛', seed: '🌾', fruit: '🍓', fish: '🐟', rodent: '🐭', any: '⭐' };
const WS_C_FOOD_NAME = { invert: 'Invertebrate', seed: 'Seed', fruit: 'Fruit', fish: 'Fish', rodent: 'Rodent' };
const WS_C_FOOD_TYPES = ['invert', 'seed', 'fruit', 'fish', 'rodent'];
const WS_C_HABITAT_EMOJI = { forest: '🌲', grassland: '🌾', wetland: '🌊' };
const WS_C_HABITAT_NAME = { forest: 'Forest', grassland: 'Grassland', wetland: 'Wetland' };

// Same bird pool as TV side. Keep in sync.
const WS_C_BIRDS = {
    mallard: { name: 'Mallard', emoji: '🦆', habitats: ['wetland'], cost: { invert: 1, seed: 1 }, points: 4, eggLimit: 3 },
    wood_duck: { name: 'Wood Duck', emoji: '🦆', habitats: ['wetland'], cost: { seed: 1, invert: 1 }, points: 3, eggLimit: 4 },
    trumpeter_swan: { name: 'Trumpeter Swan', emoji: '🦢', habitats: ['wetland'], cost: { fruit: 1, seed: 2 }, points: 7, eggLimit: 1 },
    great_blue_heron: { name: 'Great Blue Heron', emoji: '🪶', habitats: ['wetland'], cost: { fish: 2 }, points: 5, eggLimit: 2 },
    belted_kingfisher: { name: 'Belted Kingfisher', emoji: '🐦', habitats: ['wetland'], cost: { fish: 1, invert: 1 }, points: 4, eggLimit: 3 },
    osprey: { name: 'Osprey', emoji: '🦅', habitats: ['wetland'], cost: { fish: 2 }, points: 5, eggLimit: 1 },
    common_loon: { name: 'Common Loon', emoji: '🦆', habitats: ['wetland'], cost: { fish: 2 }, points: 5, eggLimit: 1 },
    canada_goose: { name: 'Canada Goose', emoji: '🦢', habitats: ['wetland', 'grassland'], cost: { seed: 2 }, points: 5, eggLimit: 2 },
    bald_eagle: { name: 'Bald Eagle', emoji: '🦅', habitats: ['forest', 'grassland'], cost: { fish: 1, rodent: 2 }, points: 9, eggLimit: 1 },
    red_tailed_hawk: { name: 'Red-tailed Hawk', emoji: '🦅', habitats: ['grassland'], cost: { rodent: 2 }, points: 5, eggLimit: 1 },
    peregrine_falcon: { name: 'Peregrine Falcon', emoji: '🦅', habitats: ['grassland'], cost: { rodent: 1, any: 1 }, points: 5, eggLimit: 2 },
    snowy_owl: { name: 'Snowy Owl', emoji: '🦉', habitats: ['grassland'], cost: { rodent: 2 }, points: 4, eggLimit: 2 },
    great_horned_owl: { name: 'Great Horned Owl', emoji: '🦉', habitats: ['forest'], cost: { rodent: 2 }, points: 6, eggLimit: 1 },
    barn_owl: { name: 'Barn Owl', emoji: '🦉', habitats: ['grassland'], cost: { rodent: 1 }, points: 3, eggLimit: 2 },
    american_crow: { name: 'American Crow', emoji: '🐦‍⬛', habitats: ['forest', 'grassland'], cost: { any: 1 }, points: 2, eggLimit: 3 },
    raven: { name: 'Common Raven', emoji: '🐦‍⬛', habitats: ['forest'], cost: { rodent: 1, any: 1 }, points: 4, eggLimit: 2 },
    blue_jay: { name: 'Blue Jay', emoji: '🐦', habitats: ['forest'], cost: { seed: 1, fruit: 1 }, points: 4, eggLimit: 3 },
    cardinal: { name: 'Northern Cardinal', emoji: '🐦', habitats: ['forest', 'grassland'], cost: { seed: 2 }, points: 4, eggLimit: 2 },
    robin: { name: 'American Robin', emoji: '🐦', habitats: ['forest', 'grassland'], cost: { invert: 1, fruit: 1 }, points: 3, eggLimit: 3 },
    bluebird: { name: 'Eastern Bluebird', emoji: '🐦', habitats: ['grassland'], cost: { invert: 1, fruit: 1 }, points: 3, eggLimit: 3 },
    mourning_dove: { name: 'Mourning Dove', emoji: '🕊️', habitats: ['forest', 'grassland', 'wetland'], cost: { seed: 1 }, points: 2, eggLimit: 4 },
    house_sparrow: { name: 'House Sparrow', emoji: '🐦', habitats: ['grassland'], cost: { seed: 1 }, points: 2, eggLimit: 4 },
    goldfinch: { name: 'American Goldfinch', emoji: '🐤', habitats: ['grassland'], cost: { seed: 1 }, points: 3, eggLimit: 4 },
    chickadee: { name: 'Black-capped Chickadee', emoji: '🐦', habitats: ['forest'], cost: { seed: 1, invert: 1 }, points: 2, eggLimit: 3 },
    downy_woodpecker: { name: 'Downy Woodpecker', emoji: '🐦', habitats: ['forest'], cost: { invert: 1, seed: 1 }, points: 3, eggLimit: 3 },
    pileated_woodpecker: { name: 'Pileated Woodpecker', emoji: '🐦', habitats: ['forest'], cost: { invert: 2 }, points: 5, eggLimit: 1 },
    hummingbird: { name: 'Ruby-throated Hummingbird', emoji: '🐦', habitats: ['forest', 'grassland'], cost: { fruit: 1 }, points: 2, eggLimit: 2 },
    ruffed_grouse: { name: 'Ruffed Grouse', emoji: '🐓', habitats: ['forest'], cost: { seed: 1, fruit: 1 }, points: 4, eggLimit: 3 },
    wild_turkey: { name: 'Wild Turkey', emoji: '🦃', habitats: ['forest'], cost: { seed: 2 }, points: 4, eggLimit: 3 },
    purple_martin: { name: 'Purple Martin', emoji: '🐦', habitats: ['grassland'], cost: { invert: 1 }, points: 3, eggLimit: 3 },
    barn_swallow: { name: 'Barn Swallow', emoji: '🐦', habitats: ['grassland'], cost: { invert: 1 }, points: 2, eggLimit: 3 },
    green_heron: { name: 'Green Heron', emoji: '🪶', habitats: ['wetland'], cost: { fish: 1, invert: 1 }, points: 4, eggLimit: 2 }
};

let wsSelectedCardId = null;
let wsCurrentState = null;

function setupWingspanController(container) {
    wsSelectedCardId = null;
    wsCurrentState = null;

    container.innerHTML = `
        <div id="ws-ctrl-status" class="status-badge waiting" style="align-self:center;">Waiting for your turn…</div>

        <div id="ws-ctrl-actions" style="display:none; width:100%; max-width:360px;
             grid-template-columns: 1fr 1fr; gap: 10px; margin-top: 8px;">
            <button class="btn btn-secondary ws-action-btn" data-action="food"   onclick="wsPickAction('food')">🌲<br>Gain Food</button>
            <button class="btn btn-secondary ws-action-btn" data-action="eggs"   onclick="wsPickAction('eggs')">🌾<br>Lay Eggs</button>
            <button class="btn btn-secondary ws-action-btn" data-action="cards"  onclick="wsPickAction('cards')">🌊<br>Draw Cards</button>
            <button class="btn btn-primary   ws-action-btn" data-action="play"   onclick="wsPickAction('play')">🐦<br>Play Bird</button>
        </div>

        <div id="ws-ctrl-supply" style="width:100%; max-width:360px; display:flex; gap:6px;
             flex-wrap:wrap; justify-content:center; padding:6px 0;"></div>

        <div id="ws-ctrl-hand" style="width:100%; max-width:360px; display:none;
             flex-direction:column; gap:8px;"></div>

        <div id="ws-ctrl-habitat-picker" style="width:100%; max-width:360px; display:none;
             flex-direction:column; gap:10px; padding:12px; border-radius:12px;
             background:var(--bg-glass); border:1px solid var(--glass-border);"></div>

        <div id="ws-ctrl-summary" style="width:100%; max-width:360px; display:none;
             padding:10px 12px; border-radius:12px; background:var(--bg-glass);
             border:1px solid var(--glass-border); font-size:0.85rem; color:var(--text-secondary);"></div>
    `;

    // Inject styles once
    if (!document.getElementById('ws-ctrl-styles')) {
        const s = document.createElement('style');
        s.id = 'ws-ctrl-styles';
        s.textContent = `
            .ws-action-btn {
                padding: 14px 6px !important;
                font-size: 0.85rem !important;
                line-height: 1.2 !important;
                min-height: 70px;
            }
            .ws-action-btn:disabled {
                opacity: 0.4; filter: grayscale(0.6);
            }
            .ws-food-pill {
                display:inline-flex; align-items:center; gap:4px;
                padding: 4px 10px; border-radius: 999px;
                background: var(--bg-glass); border: 1px solid var(--glass-border);
                font-size: 0.82rem;
            }
            .ws-hand-card {
                display:flex; align-items:center; gap:10px;
                padding: 10px 12px; border-radius: 12px;
                background: var(--bg-glass); border: 2px solid var(--glass-border);
                cursor: pointer; text-align: left;
                -webkit-tap-highlight-color: transparent;
                transition: transform 120ms ease, border-color 120ms ease;
            }
            .ws-hand-card:active { transform: scale(0.97); }
            .ws-hand-card.affordable { border-color: rgba(0,255,136,0.5); }
            .ws-hand-card.unaffordable { opacity: 0.55; cursor: not-allowed; }
            .ws-hand-card .emoji { font-size: 1.8rem; }
            .ws-hand-card .meta { flex:1; display:flex; flex-direction:column; gap:2px; }
            .ws-hand-card .name { font-weight: 700; font-size: 0.95rem; }
            .ws-hand-card .sub { font-size: 0.75rem; color: var(--text-muted); }
            .ws-hand-card .pts {
                font-family: 'Press Start 2P', monospace; font-size: 0.75rem;
                background: var(--grad-secondary); color: #0a0a1a;
                padding: 4px 8px; border-radius: 999px;
            }
            .ws-hab-btn {
                padding: 12px; border-radius: 10px;
                background: var(--bg-glass); border: 2px solid var(--glass-border);
                color: var(--text-primary); font-size: 0.95rem;
                cursor: pointer; -webkit-tap-highlight-color: transparent;
            }
            .ws-hab-btn:active { transform: scale(0.97); }
            .ws-hab-btn.forest    { border-color: rgba(120,200,130,0.4); }
            .ws-hab-btn.grassland { border-color: rgba(220,200,80,0.4); }
            .ws-hab-btn.wetland   { border-color: rgba(80,150,220,0.4); }
        `;
        document.head.appendChild(s);
    }

    // Single gameState listener
    getRoomRef(myRoom).child('gameState').on('value', (snap) => {
        wsCurrentState = snap.val() || {};
        wsRenderController();
    });
}

function wsRenderController() {
    const state = wsCurrentState || {};
    const statusEl = document.getElementById('ws-ctrl-status');
    const actionsEl = document.getElementById('ws-ctrl-actions');
    const supplyEl = document.getElementById('ws-ctrl-supply');
    const handEl = document.getElementById('ws-ctrl-hand');
    const pickerEl = document.getElementById('ws-ctrl-habitat-picker');
    const summaryEl = document.getElementById('ws-ctrl-summary');
    if (!statusEl) return;

    const isMyTurn = state.activePlayer === myPlayerId;
    const hand = state.hand || [];
    const food = state.food || {};

    // Supply display (always visible when we have data)
    if (state.food) {
        supplyEl.innerHTML = WS_C_FOOD_TYPES.map(t => `
            <span class="ws-food-pill" title="${WS_C_FOOD_NAME[t]}">
                ${WS_C_FOOD_EMOJI[t]} ×${food[t] || 0}
            </span>
        `).join('');
    }

    // Status line
    if (isMyTurn) {
        statusEl.className = 'status-badge';
        statusEl.innerHTML = `<span class="your-turn-indicator">YOUR TURN · ${state.actionsLeft || 0} LEFT</span>`;
    } else if (state.activePlayer) {
        statusEl.className = 'status-badge waiting';
        statusEl.textContent = `Round ${state.round || 1} — someone else is acting…`;
        // Hide pickers
        if (handEl) { handEl.style.display = 'none'; handEl.innerHTML = ''; }
        if (pickerEl) { pickerEl.style.display = 'none'; pickerEl.innerHTML = ''; }
        if (actionsEl) actionsEl.style.display = 'none';
        return;
    } else {
        statusEl.className = 'status-badge waiting';
        statusEl.textContent = 'Waiting for the game to start…';
        if (actionsEl) actionsEl.style.display = 'none';
        return;
    }

    // Show action grid for my turn
    if (actionsEl) actionsEl.style.display = 'grid';

    // Live-update summary (what each action would yield)
    const boardCounts = state.boardCounts || null; // optional; TV could push
    summaryEl.style.display = 'none'; // keep simple; remove if not used

    // If we already selected "play" show the hand. Otherwise hide.
    if (wsSelectedCardId === null && handEl && handEl.dataset.mode !== 'hand') {
        handEl.style.display = 'none';
    }
}

function wsPickAction(action) {
    if (!wsCurrentState || wsCurrentState.activePlayer !== myPlayerId) return;
    const handEl = document.getElementById('ws-ctrl-hand');
    const pickerEl = document.getElementById('ws-ctrl-habitat-picker');
    if (handEl) { handEl.style.display = 'none'; handEl.innerHTML = ''; handEl.dataset.mode = ''; }
    if (pickerEl) { pickerEl.style.display = 'none'; pickerEl.innerHTML = ''; }

    if (action === 'food') {
        wsSendAction({ type: 'ws_gain_food', timestamp: Date.now() });
        if (navigator.vibrate) navigator.vibrate(40);
    } else if (action === 'eggs') {
        wsSendAction({ type: 'ws_lay_eggs', timestamp: Date.now() });
        if (navigator.vibrate) navigator.vibrate(40);
    } else if (action === 'cards') {
        wsSendAction({ type: 'ws_draw_cards', timestamp: Date.now() });
        if (navigator.vibrate) navigator.vibrate(40);
    } else if (action === 'play') {
        wsShowHand();
    }
}

function wsShowHand() {
    const hand = (wsCurrentState && wsCurrentState.hand) || [];
    const food = (wsCurrentState && wsCurrentState.food) || {};
    const handEl = document.getElementById('ws-ctrl-hand');
    if (!handEl) return;

    if (hand.length === 0) {
        handEl.style.display = 'flex';
        handEl.dataset.mode = 'hand';
        handEl.innerHTML = `
            <div style="text-align:center; padding:16px; color:var(--text-secondary);">
                Your hand is empty — try <strong>Draw Cards</strong> 🌊
            </div>
            <button class="btn btn-ghost" onclick="wsCancelPlay()">Cancel</button>
        `;
        return;
    }

    handEl.style.display = 'flex';
    handEl.dataset.mode = 'hand';
    handEl.innerHTML = hand.map(cardId => {
        const bird = WS_C_BIRDS[cardId];
        if (!bird) return '';
        const affordable = wsCanAfford(food, bird.cost);
        const costStr = wsFormatCost(bird.cost);
        const habStr = bird.habitats.map(h => WS_C_HABITAT_EMOJI[h]).join(' ');
        return `
            <div class="ws-hand-card ${affordable ? 'affordable' : 'unaffordable'}"
                 onclick="${affordable ? `wsPickBird('${cardId}')` : ''}">
                <span class="emoji">${bird.emoji}</span>
                <div class="meta">
                    <span class="name">${escapeHtml(bird.name)}</span>
                    <span class="sub">${habStr} · cost ${costStr}</span>
                </div>
                <span class="pts">${bird.points}</span>
            </div>
        `;
    }).join('') + `<button class="btn btn-ghost" onclick="wsCancelPlay()">Cancel</button>`;
}

function wsPickBird(cardId) {
    const bird = WS_C_BIRDS[cardId];
    if (!bird) return;
    const handEl = document.getElementById('ws-ctrl-hand');
    const pickerEl = document.getElementById('ws-ctrl-habitat-picker');
    if (!pickerEl) return;
    wsSelectedCardId = cardId;

    if (bird.habitats.length === 1) {
        wsConfirmPlay(cardId, bird.habitats[0]);
        return;
    }

    if (handEl) { handEl.style.display = 'none'; handEl.innerHTML = ''; }
    pickerEl.style.display = 'flex';
    pickerEl.innerHTML = `
        <div style="text-align:center; font-weight:700;">
            ${bird.emoji} ${escapeHtml(bird.name)} — pick a habitat
        </div>
        ${bird.habitats.map(h => `
            <button class="ws-hab-btn ${h}" onclick="wsConfirmPlay('${cardId}','${h}')">
                ${WS_C_HABITAT_EMOJI[h]} ${WS_C_HABITAT_NAME[h]}
            </button>
        `).join('')}
        <button class="btn btn-ghost" onclick="wsCancelPlay()">Cancel</button>
    `;
}

function wsConfirmPlay(cardId, habitat) {
    wsSendAction({ type: 'ws_play_bird', cardId, habitat, timestamp: Date.now() });
    wsCancelPlay();
    if (navigator.vibrate) navigator.vibrate([30, 50, 30]);
}

function wsCancelPlay() {
    wsSelectedCardId = null;
    const handEl = document.getElementById('ws-ctrl-hand');
    const pickerEl = document.getElementById('ws-ctrl-habitat-picker');
    if (handEl) { handEl.style.display = 'none'; handEl.innerHTML = ''; }
    if (pickerEl) { pickerEl.style.display = 'none'; pickerEl.innerHTML = ''; }
}

function wsCanAfford(food, cost) {
    const sim = { ...food };
    for (const [k, need] of Object.entries(cost)) {
        if (k === 'any') continue;
        if ((sim[k] || 0) < need) return false;
        sim[k] -= need;
    }
    const anyNeed = cost.any || 0;
    const remaining = WS_C_FOOD_TYPES.reduce((s, t) => s + (sim[t] || 0), 0);
    return remaining >= anyNeed;
}

function wsFormatCost(cost) {
    const parts = [];
    for (const [k, n] of Object.entries(cost)) {
        parts.push(`${n}${WS_C_FOOD_EMOJI[k] || '?'}`);
    }
    return parts.join(' ') || 'free';
}

function wsSendAction(action) {
    playerAction(myRoom, myPlayerId, action);
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

function escapeHtml(str) {
    const div = document.createElement('div');
    div.textContent = str == null ? '' : String(str);
    return div.innerHTML;
}

