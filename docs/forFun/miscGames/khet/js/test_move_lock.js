/**
 * Regression tests for the Khet animation / turn race.
 *
 * Concrete failure mode before the fix:
 *   applyMove() flips currentPlayer and sets pendingHit, then animateLaser
 *   runs ~800ms. During that window isHumanTurn() was true for the opponent
 *   in 2-player mode, so they could move the pending-hit square; resolveLaserHit
 *   then cleared the wrong cell and/or declared a win from the stale piece ref.
 *
 * Run: node docs/forFun/miscGames/khet/js/test_move_lock.js
 */
import assert from 'assert';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { KhetGame, PLAYER, PIECE_TYPE } from './engine.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const mainSrc = readFileSync(join(__dirname, 'main.js'), 'utf8');

let failed = 0;
function check(name, fn) {
    try {
        fn();
        console.log(`PASS  ${name}`);
    } catch (e) {
        failed++;
        console.error(`FAIL  ${name}: ${e.message}`);
    }
}

check('main.js gates human input on moveInProgress', () => {
    assert.match(mainSrc, /let moveInProgress = false/);
    assert.match(mainSrc, /aiThinking \|\| moveInProgress/);
    assert.match(mainSrc, /if \(moveInProgress \|\| game\.winner !== null\) return;/);
});

check('main.js invalidates in-flight moves on newGame', () => {
    assert.match(mainSrc, /let playGeneration = 0/);
    assert.match(mainSrc, /playGeneration\+\+/);
    assert.match(mainSrc, /if \(gen !== playGeneration\) return/);
});

check('stale pendingHit + board mutation yields phantom Pharaoh win', () => {
    // Documents the engine-level hazard the UI lock must prevent:
    // resolveLaserHit uses the stored piece object, not the live cell.
    const g = new KhetGame();
    // Find Silver's Pharaoh
    let pCol = -1, pRow = -1, pharaoh = null;
    for (let r = 0; r < 8; r++) {
        for (let c = 0; c < 10; c++) {
            const p = g.getAt(c, r);
            if (p && p.player === PLAYER.SILVER && p.type === PIECE_TYPE.PHARAOH) {
                pCol = c; pRow = r; pharaoh = p;
            }
        }
    }
    assert.ok(pharaoh, 'expected a Silver Pharaoh on the classic setup');

    // Simulate applyMove's laser bookkeeping without switching turns carefully:
    g.pendingHit = { piece: pharaoh, col: pCol, row: pRow };
    // Opponent "moves" the Pharaoh away during the laser animation:
    g.setAt(pCol, pRow, null);
    const emptyCol = (pCol + 1) % 10;
    g.setAt(emptyCol, pRow, pharaoh);

    g.resolveLaserHit();
    // Stale piece ref still counts as a Pharaoh kill → Red wins, even though
    // the Pharaoh survived on another square.
    assert.strictEqual(g.winner, PLAYER.RED);
    assert.strictEqual(g.getAt(emptyCol, pRow)?.type, PIECE_TYPE.PHARAOH);
});

if (failed) {
    console.error(`\n${failed} test(s) failed`);
    process.exit(1);
}
console.log('\nAll Khet move-lock checks OK');
