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
    const roomRef = db.ref(`rooms/${code}`);
    const snapshot = await roomRef.once('value');

    // Avoid collisions
    while (snapshot.exists()) {
        code = generateRoomCode();
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
    const snapshot = await roomRef.once('value');

    if (!snapshot.exists()) {
        throw new Error('Room not found');
    }

    const room = snapshot.val();
    const playerId = db.ref().child('players').push().key;
    const isHost = !room.players || Object.keys(room.players).length === 0;
    const playerColors = [
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4',
        '#FFEAA7', '#DDA0DD', '#98D8C8', '#F7DC6F'
    ];
    const playerCount = room.players ? Object.keys(room.players).length : 0;
    const color = playerColors[playerCount % playerColors.length];

    await roomRef.child(`players/${playerId}`).set({
        name: playerName,
        avatar: avatar || '😀',
        color: color,
        isHost: isHost,
        score: 0,
        connected: true,
        hand: {},
        joinedAt: firebase.database.ServerValue.TIMESTAMP
    });

    // If first player, set as host
    if (isHost) {
        await roomRef.child('host').set(playerId);
    }

    return { playerId, isHost, color };
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
