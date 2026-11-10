/**
 * Regression checks for nicBox joinRoom prefetch.
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

async function main() {
    await testJoinRoomPrefetchesBeforeTransaction();
    await testJoinRoomRejectsMissingWithoutTransaction();
    console.log('All nicBox critical fix tests passed.');
}

main().catch((err) => {
    console.error(err);
    process.exit(1);
});
