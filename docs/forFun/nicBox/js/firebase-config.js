// Firebase configuration for nicBox
// Using Firebase v9 compat for simpler CDN usage

const firebaseConfig = {
    apiKey: "AIzaSyDgMPT7eLhd0ENaEOwZ87IV9fkm2UNYyDA",
    authDomain: "nicbox-7321a.firebaseapp.com",
    databaseURL: "https://nicbox-7321a-default-rtdb.firebaseio.com",
    projectId: "nicbox-7321a",
    storageBucket: "nicbox-7321a.firebasestorage.app",
    messagingSenderId: "681526218135",
    appId: "1:681526218135:web:0ef9fa6d96e83c0f7a88d2"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const db = firebase.database();

// ─── Room Management ───────────────────────────────────────────

function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

async function createRoom() {
    let code = generateRoomCode();
    let roomRef = db.ref(`rooms/${code}`);
    let snapshot = await roomRef.once('value');

    // Avoid collisions
    while (snapshot.exists()) {
        code = generateRoomCode();
        roomRef = db.ref(`rooms/${code}`);
        snapshot = await roomRef.once('value');
    }

    await roomRef.set({
        code: code,
        state: 'lobby', // lobby | picking | playing | results
        host: null,
        players: {},
        game: null,
        gameState: {},
        createdAt: firebase.database.ServerValue.TIMESTAMP
    });

    return code;
}

async function joinRoom(roomCode, playerName, avatar) {
    const roomRef = db.ref(`rooms/${roomCode}`);
    const playerId = db.ref().child('players').push().key;
    const playerColors = [
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
        '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'
    ];

    // Atomic: commit host assignment + new player in one transaction, so two
    // simultaneous joiners can't both claim host.
    let abortReason = null;
    const result = await roomRef.transaction((room) => {
        if (room === null) { abortReason = 'notfound'; return; }
        if (room.closedAt) { abortReason = 'closed'; return; }
        if (!room.players) room.players = {};

        const existingCount = Object.keys(room.players).length;
        const isHost = existingCount === 0;
        const color = playerColors[existingCount % playerColors.length];

        room.players[playerId] = {
            name: playerName,
            avatar: avatar || '😀',
            color: color,
            isHost: isHost,
            score: 0,
            connected: true,
            hand: {},
            joinedAt: firebase.database.ServerValue.TIMESTAMP
        };
        if (isHost && !room.host) room.host = playerId;
        return room;
    });

    if (!result.committed || !result.snapshot.exists()) {
        if (abortReason === 'closed') throw new Error('Room is closed');
        throw new Error('Room not found');
    }

    const player = result.snapshot.val().players[playerId];
    return { playerId, isHost: player.isHost, color: player.color };
}

function getRoomRef(roomCode) {
    return db.ref(`rooms/${roomCode}`);
}

// ─── Presence / Disconnect ─────────────────────────────────────

function setupPresence(roomCode, playerId) {
    const connRef = db.ref(`rooms/${roomCode}/players/${playerId}/connected`);
    const connectedRef = db.ref('.info/connected');

    connectedRef.on('value', (snap) => {
        if (snap.val() === true) {
            connRef.onDisconnect().set(false);
            connRef.set(true);
        }
    });
}

// ─── Game State Helpers ────────────────────────────────────────

function updateGameState(roomCode, updates) {
    return db.ref(`rooms/${roomCode}/gameState`).update(updates);
}

function setRoomState(roomCode, state) {
    return db.ref(`rooms/${roomCode}/state`).set(state);
}

function setRoomGame(roomCode, gameName) {
    return db.ref(`rooms/${roomCode}/game`).set(gameName);
}

function playerAction(roomCode, playerId, action) {
    return db.ref(`rooms/${roomCode}/gameState/actions`).push({
        playerId: playerId,
        action: action,
        timestamp: firebase.database.ServerValue.TIMESTAMP
    });
}

// Wipe gameState between games so stale actions don't re-fire child_added
// listeners when the next game attaches its handlers.
function resetGameState(roomCode) {
    return db.ref(`rooms/${roomCode}/gameState`).set({});
}

// If the current host disconnects, promote another connected player.
function setupHostTransfer(roomCode) {
    const roomRef = db.ref(`rooms/${roomCode}`);
    const hostRef = roomRef.child('host');
    const playersRef = roomRef.child('players');

    return playersRef.on('value', (snap) => {
        const players = snap.val() || {};
        hostRef.once('value', (hs) => {
            const currentHost = hs.val();
            const hostPlayer = currentHost ? players[currentHost] : null;
            const hostAlive = hostPlayer && hostPlayer.connected;
            if (hostAlive) return;

            // Promote the earliest-joined still-connected player
            const candidates = Object.entries(players)
                .filter(([, p]) => p.connected)
                .sort((a, b) => (a[1].joinedAt || 0) - (b[1].joinedAt || 0));
            if (candidates.length === 0) return;

            const [newHostId] = candidates[0];
            hostRef.set(newHostId);
            // Update the isHost flag on player records so UIs stay consistent
            const updates = {};
            for (const pid of Object.keys(players)) {
                updates[`${pid}/isHost`] = pid === newHostId;
            }
            playersRef.update(updates);
        });
    });
}

// TV abandonment: when the display closes, mark the room closed so stale rooms
// can be garbage-collected (and new joiners get a clear error instead of
// joining a dead room). We keep the record for a short grace period in case
// the TV reconnects.
function setupRoomOwnership(roomCode) {
    const roomRef = db.ref(`rooms/${roomCode}`);
    const aliveRef = roomRef.child('tvConnected');
    const connectedRef = db.ref('.info/connected');

    connectedRef.on('value', (snap) => {
        if (snap.val() !== true) return;
        aliveRef.onDisconnect().set(false);
        roomRef.child('closedAt').onDisconnect().set(firebase.database.ServerValue.TIMESTAMP);
        aliveRef.set(true);
        roomRef.child('closedAt').set(null);
    });
}
