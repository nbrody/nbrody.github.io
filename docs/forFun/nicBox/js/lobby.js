// ═══════════════════════════════════════════════════════════
// nicBox — Lobby & Screen Manager (TV Side)
// ═══════════════════════════════════════════════════════════

let currentRoom = null;
let currentGame = null;
let players = {};
let roomListeners = [];

// ─── Initialization ────────────────────────────────────────

async function initLobby() {
    try {
        console.log("Initializing lobby...");
        const roomCode = await createRoom();
        currentRoom = roomCode;
        console.log("Room created:", roomCode);

        // Display room code
        document.getElementById('room-code').textContent = roomCode;

        // Generate QR code
        const joinUrl = getJoinUrl(roomCode);
        console.log("Generating QR for:", joinUrl);

        const qrCanvas = document.getElementById('qr-canvas');
        if (qrCanvas && (window.QRCode || typeof QRCode !== 'undefined')) {
            const qrLibrary = window.QRCode || QRCode;
            await qrLibrary.toCanvas(qrCanvas, joinUrl, {
                width: 200,
                margin: 1,
                color: { dark: '#000000', light: '#ffffff' }
            });
            console.log("QR Code generated successfully.");
        } else {
            console.error("QR Library not found or canvas missing.");
            showToast("QR Code library failed to load.");
        }

        // Listen for player changes
        listenForPlayers(roomCode);

        // Listen for game state changes
        listenForGameState(roomCode);

    } catch (err) {
        console.error('Failed to initialize lobby:', err);
        showToast('Failed to start. Check browser console.');
    }
}

function getJoinUrl(roomCode) {
    // Build the URL relative to current location
    const base = window.location.href.replace(/index\.html$/, '').replace(/\/$/, '');
    return `${base}/join.html?room=${roomCode}`;
}

// ─── Player Listeners ──────────────────────────────────────

function listenForPlayers(roomCode) {
    const playersRef = getRoomRef(roomCode).child('players');

    playersRef.on('value', (snapshot) => {
        players = snapshot.val() || {};
        renderPlayerBubbles();
        updateStartButton();
    });

    roomListeners.push({ ref: playersRef, event: 'value' });
}

function renderPlayerBubbles() {
    const container = document.getElementById('lobby-players');
    container.innerHTML = '';

    const entries = Object.entries(players);

    entries.forEach(([id, player], index) => {
        const bubble = document.createElement('div');
        bubble.className = `player-bubble${player.isHost ? ' host' : ''}`;
        bubble.style.animationDelay = `${index * 0.1}s`;
        bubble.style.borderColor = player.color || 'transparent';

        bubble.innerHTML = `
            <span class="player-avatar">${player.avatar || '😀'}</span>
            <span class="player-name">${escapeHtml(player.name)}</span>
            ${player.isHost ? '<span class="player-host-badge">★ Host</span>' : ''}
            <span class="connection-dot ${player.connected ? 'online' : 'offline'}"></span>
        `;

        container.appendChild(bubble);
    });

    // Update waiting message
    const waitingEl = document.getElementById('lobby-waiting');
    if (entries.length === 0) {
        waitingEl.innerHTML = 'Waiting for players to join<span class="waiting-dots"></span>';
        waitingEl.style.display = 'block';
    } else {
        waitingEl.style.display = 'none';
    }
}

function updateStartButton() {
    const btn = document.getElementById('btn-start-game');
    const count = Object.keys(players).length;
    btn.style.display = count >= 1 ? 'inline-flex' : 'none';
    btn.textContent = `🎮 Pick a Game (${count} player${count !== 1 ? 's' : ''})`;
}

// ─── Game State Listener ───────────────────────────────────

function listenForGameState(roomCode) {
    const roomRef = getRoomRef(roomCode);

    roomRef.child('state').on('value', (snapshot) => {
        const state = snapshot.val();
        handleStateChange(state);
    });
}

function handleStateChange(state) {
    switch (state) {
        case 'lobby':
            showScreen('lobby-screen');
            break;
        case 'picking':
            showScreen('picker-screen');
            break;
        case 'playing':
            showScreen('game-screen');
            break;
        case 'results':
            showScreen('results-screen');
            break;
    }
}

// ─── Screen Management ─────────────────────────────────────

function showScreen(screenId) {
    document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
    const screen = document.getElementById(screenId);
    if (screen) screen.classList.remove('hidden');
}

function showGamePicker() {
    setRoomState(currentRoom, 'picking');
}

function backToLobby() {
    if (currentGame && currentGame.cleanup) {
        currentGame.cleanup();
    }
    currentGame = null;
    setRoomState(currentRoom, 'lobby');
    setRoomGame(currentRoom, null);
}

// ─── Game Selection ────────────────────────────────────────

async function selectGame(gameName) {
    await setRoomGame(currentRoom, gameName);
    await setRoomState(currentRoom, 'playing');

    // Update header
    const nameMap = {
        trivia: '🧠 Trivia Showdown',
        war: '⚔️ Card War',
        blackjack: '🃏 Blackjack',
        checkers: '🏁 Checkers',
        drawguess: '🎨 Draw & Guess'
    };
    document.getElementById('game-name').textContent = nameMap[gameName] || gameName;

    // Render scoreboard
    renderScoreboard();

    // Start game
    const gameArea = document.getElementById('game-area');
    gameArea.innerHTML = '';

    switch (gameName) {
        case 'trivia':
            currentGame = new TriviaGame(currentRoom, players, gameArea);
            break;
        case 'war':
            currentGame = new WarGame(currentRoom, players, gameArea);
            break;
        case 'blackjack':
            currentGame = new BlackjackGame(currentRoom, players, gameArea);
            break;
        case 'checkers':
            currentGame = new CheckersGame(currentRoom, players, gameArea);
            break;
        case 'drawguess':
            currentGame = new DrawGuessGame(currentRoom, players, gameArea);
            break;
        default:
            gameArea.innerHTML = `
                <div class="flex-col" style="gap: 16px;">
                    <span style="font-size: 4rem;">🚧</span>
                    <h3>Coming Soon!</h3>
                    <p style="color: var(--text-secondary);">This game is still being built.</p>
                </div>
            `;
    }
}

function renderScoreboard() {
    const sb = document.getElementById('scoreboard');
    sb.innerHTML = '';

    Object.entries(players).forEach(([id, player]) => {
        const item = document.createElement('div');
        item.className = 'score-item';
        item.id = `score-${id}`;
        item.innerHTML = `
            <span class="score-color" style="background: ${player.color}"></span>
            <span>${escapeHtml(player.name)}</span>
            <strong>${player.score || 0}</strong>
        `;
        sb.appendChild(item);
    });
}

function updateScoreDisplay(playerId, score) {
    const el = document.getElementById(`score-${playerId}`);
    if (el) {
        const strong = el.querySelector('strong');
        if (strong) strong.textContent = score;
    }

    // Also update in Firebase
    getRoomRef(currentRoom).child(`players/${playerId}/score`).set(score);
}

// ─── End Game / Results ────────────────────────────────────

function endGame() {
    if (currentGame && currentGame.cleanup) {
        currentGame.cleanup();
    }

    showResults();
}

function showResults() {
    setRoomState(currentRoom, 'results');

    const sorted = Object.entries(players)
        .map(([id, p]) => ({ id, ...p }))
        .sort((a, b) => (b.score || 0) - (a.score || 0));

    // Build podium
    const podium = document.getElementById('results-podium');
    podium.innerHTML = '';

    const places = ['second', 'first', 'third'];
    const medals = ['🥈', '🥇', '🥉'];
    const order = [1, 0, 2]; // Show 2nd, 1st, 3rd

    order.forEach((placeIndex) => {
        const player = sorted[placeIndex];
        if (!player) return;

        const place = document.createElement('div');
        place.className = 'podium-place';
        place.innerHTML = `
            <span style="font-size: 2rem;">${player.avatar || '😀'}</span>
            <span style="font-weight: 700;">${escapeHtml(player.name)}</span>
            <div class="podium-bar ${places[placeIndex]}">
                <span class="podium-rank">${medals[placeIndex]}</span>
                <span style="font-weight: 800; font-size: 1.2rem;">${player.score || 0}</span>
            </div>
        `;
        podium.appendChild(place);
    });

    // Full list
    const list = document.getElementById('results-list');
    list.innerHTML = sorted.map((p, i) => `
        <div style="display: flex; align-items: center; gap: 12px; padding: 8px 16px;
                    background: var(--bg-glass); border-radius: 8px; margin-bottom: 8px;">
            <span style="font-weight: 800; color: var(--text-muted); width: 24px;">${i + 1}</span>
            <span>${p.avatar}</span>
            <span style="flex: 1; font-weight: 600;">${escapeHtml(p.name)}</span>
            <span style="font-weight: 800; color: var(--neon-green);">${p.score || 0}</span>
        </div>
    `).join('');
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
    div.textContent = str;
    return div.innerHTML;
}

// ─── Start ─────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', initLobby);
