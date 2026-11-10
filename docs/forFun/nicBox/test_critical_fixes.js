/**
 * Regression checks for nicBox joinRoom prefetch and War round capping.
 * Run: node docs/forFun/nicBox/test_critical_fixes.js
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');
const vm = require('vm');

function loadScript(relPath, sandbox, exportNames = []) {
    const full = path.join(__dirname, relPath);
    const code = fs.readFileSync(full, 'utf8');
    const exportSuffix = exportNames
        .map((name) => `this.${name} = ${name};`)
        .join('\n');
    vm.runInContext(`${code}\n${exportSuffix}`, sandbox, { filename: full });
}

function makeFirebaseContext(roomRef) {
    const ctx = {
        console,
        firebase: {
            initializeApp() {},
            database: Object.assign(
                function database() {
                    return {
                        ref(p) {
                            if (typeof p === 'string' && p.startsWith('rooms/')) return roomRef;
                            return {
                                child() {
                                    return {
                                        push() {
                                            return { key: 'player_1' };
                                        },
                                    };
                                },
                            };
                        },
                    };
                },
                { ServerValue: { TIMESTAMP: { '.sv': 'timestamp' } } }
            ),
        },
    };
    vm.createContext(ctx);
    loadScript('js/firebase-config.js', ctx, ['joinRoom']);
    return ctx;
}

function testJoinRoomPrefetchesBeforeTransaction() {
    const calls = [];
    const roomData = {
        code: 'ABCD',
        state: 'lobby',
        host: null,
        players: {},
        closedAt: null,
    };

    const roomRef = {
        async once(event) {
            calls.push(['once', event]);
            assert.strictEqual(event, 'value');
            return {
                exists: () => true,
                val: () => ({ ...roomData, players: { ...roomData.players } }),
            };
        },
        async transaction(updateFn) {
            calls.push(['transaction']);
            // Prefetch populated the cache: first value is the real room, not null.
            const next = updateFn({ ...roomData, players: { ...roomData.players } });
            assert.ok(next && next.players);
            const playerIds = Object.keys(next.players);
            assert.strictEqual(playerIds.length, 1);
            return {
                committed: true,
                snapshot: {
                    exists: () => true,
                    val: () => next,
                },
            };
        },
    };

    const ctx = makeFirebaseContext(roomRef);

    return ctx.joinRoom('ABCD', 'Ada', '😀').then((result) => {
        assert.deepStrictEqual(
            calls.map((c) => c[0]),
            ['once', 'transaction'],
            'joinRoom must prefetch with once() before transaction()'
        );
        assert.strictEqual(result.playerId, 'player_1');
        assert.strictEqual(result.isHost, true);
        console.log('ok joinRoom prefetches before transaction');
    });
}

function testJoinRoomRejectsMissingWithoutTransaction() {
    const calls = [];
    const roomRef = {
        async once() {
            calls.push('once');
            return { exists: () => false, val: () => null };
        },
        async transaction() {
            calls.push('transaction');
            throw new Error('transaction should not run for missing rooms');
        },
    };

    const ctx = makeFirebaseContext(roomRef);

    return ctx.joinRoom('ZZZZ', 'Bob', '😎').then(
        () => {
            throw new Error('expected joinRoom to reject missing rooms');
        },
        (err) => {
            assert.match(String(err.message || err), /Room not found/);
            assert.deepStrictEqual(calls, ['once']);
            console.log('ok joinRoom rejects missing room before transaction');
        }
    );
}

function testWarCapsRoundsToDealtCards() {
    const document = {
        head: { appendChild() {} },
        createElement() {
            return { textContent: '' };
        },
        getElementById() {
            return {
                textContent: '',
                innerHTML: '',
                style: {},
                className: '',
                offsetHeight: 0,
            };
        },
    };

    const ctx = {
        console,
        document,
        updateGameState() {},
        getRoomRef() {
            return {
                child() {
                    return { on() {}, off() {} };
                },
            };
        },
        updateScoreDisplay() {},
        renderScoreboard() {},
        endGame() {},
    };
    vm.createContext(ctx);
    loadScript('games/war.js', ctx, ['WarGame']);

    const players = {
        p1: { name: 'A', avatar: '1', color: '#f00', score: 0 },
        p2: { name: 'B', avatar: '2', color: '#0f0', score: 0 },
        p3: { name: 'C', avatar: '3', color: '#00f', score: 0 },
        p4: { name: 'D', avatar: '4', color: '#ff0', score: 0 },
    };
    const game = new ctx.WarGame('ROOM', players, { innerHTML: '' });
    assert.strictEqual(game.playerIds.length, 4);
    assert.strictEqual(Object.values(game.decks)[0].length, 13);
    assert.strictEqual(game.maxRounds, 13, '4-player War must not exceed 13 dealt cards');
    console.log('ok War caps rounds to dealt hand size');
}

async function main() {
    testWarCapsRoundsToDealtCards();
    await testJoinRoomPrefetchesBeforeTransaction();
    await testJoinRoomRejectsMissingWithoutTransaction();
    console.log('All nicBox critical fix tests passed.');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
