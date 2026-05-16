const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const lobbyPath = path.resolve(__dirname, '../js/lobby.js');
const source = fs.readFileSync(lobbyPath, 'utf8');

const elements = new Map();
function getElement(id) {
    if (!elements.has(id)) {
        elements.set(id, {
            id,
            innerHTML: '',
            textContent: '',
            style: {},
            classList: { add() {}, remove() {} }
        });
    }
    return elements.get(id);
}

const calls = [];
const constructedGames = [];
function gameClass(name) {
    return class {
        constructor(roomCode, players, container) {
            constructedGames.push({ name, roomCode, players, containerId: container.id });
        }
        cleanup() {}
    };
}

const sandbox = {
    console,
    document: {
        getElementById: getElement,
        querySelectorAll: () => []
    },
    resetGameState: async (roomCode) => calls.push(['resetGameState', roomCode]),
    setRoomGame: async (roomCode, gameName) => calls.push(['setRoomGame', roomCode, gameName]),
    setRoomState: async (roomCode, state) => calls.push(['setRoomState', roomCode, state]),
    renderScoreboard: () => calls.push(['renderScoreboard']),
    showToast: () => {},
    TriviaGame: gameClass('trivia'),
    WarGame: gameClass('war'),
    BlackjackGame: gameClass('blackjack'),
    CheckersGame: gameClass('checkers'),
    DrawGuessGame: gameClass('drawguess'),
    WingspanGame: gameClass('wingspan')
};

vm.createContext(sandbox);
vm.runInContext(source, sandbox, { filename: lobbyPath });

(async () => {
    await sandbox.selectGame('wingspan');

    assert.equal(constructedGames.length, 1);
    assert.equal(constructedGames[0].name, 'wingspan');
    assert.equal(constructedGames[0].containerId, 'game-area');
    assert.match(getElement('game-name').textContent, /Wingspan/);
    assert.equal(getElement('game-area').innerHTML, '');
    assert.deepEqual(calls.slice(0, 3), [
        ['resetGameState', null],
        ['setRoomGame', null, 'wingspan'],
        ['setRoomState', null, 'playing']
    ]);
})().catch((err) => {
    console.error(err);
    process.exitCode = 1;
});
