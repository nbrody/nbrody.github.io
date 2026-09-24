/**
 * Regression: Pyramid CCW rotation + Sphinx inward facings.
 * Run: node docs/forFun/miscGames/khet/js/test_facing_and_sphinx.js
 */
import assert from 'node:assert/strict';
import {
    KhetGame, PLAYER, PIECE_TYPE, DIR, DX, DY, COLS, ROWS, pyramidFacingIndex
} from './engine.js';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// --- Pyramid facing: CCW from N interpolates through negative angles ---
{
    const startFacing = 0;
    const endFacing = 3; // (0 + (-1) + 4) % 4
    let diff = endFacing - startFacing;
    if (diff > 2) diff -= 4;
    if (diff < -2) diff += 4;
    assert.equal(diff, -1);

    for (const progress of [0, 0.25, 0.5, 0.75, 1]) {
        const facing = startFacing + diff * progress;
        const angle = facing * Math.PI / 2;
        const legacy = Math.round(angle / (Math.PI / 2)) % 4;
        const fixed = pyramidFacingIndex(angle);
        assert.ok(fixed >= 0 && fixed <= 3, `facing index out of range at p=${progress}`);
        if (progress >= 0.75) {
            assert.equal(legacy, -1, 'precondition: legacy JS % yields -1');
            assert.equal(fixed, 3);
        }
    }
}

// --- Swap animation payloads must carry facing (source guard) ---
{
    const src = readFileSync(join(__dirname, 'renderer.js'), 'utf8');
    assert.match(src, /startFacing:\s*piece2\.facing/);
    assert.match(src, /endFacing:\s*piece2\.facing/);
    assert.match(src, /pyramidFacingIndex/);
}

// --- Sphinx legal rotations fire into the board ---
function laserStaysOnBoard(col, row, facing) {
    let c = col + DX[facing];
    let r = row + DY[facing];
    // Sphinx fires from its square in facing dir; first step must be on-board.
    return c >= 0 && c < COLS && r >= 0 && r < ROWS;
}

{
    const game = new KhetGame();
    // Silver sphinx at classic (9,0) facing N
    const silver = game.getAt(9, 0);
    assert.equal(silver.type, PIECE_TYPE.SPHINX);
    assert.equal(silver.player, PLAYER.SILVER);
    assert.equal(silver.facing, DIR.N);
    assert.ok(laserStaysOnBoard(9, 0, DIR.N));

    game.currentPlayer = PLAYER.SILVER;
    const sMoves = game.getLegalMoves().filter(m =>
        m.type === 'rotate' && m.col === 9 && m.row === 0);
    assert.deepEqual(sMoves.map(m => m.toFacing).sort(), [DIR.W]);
    assert.ok(laserStaysOnBoard(9, 0, DIR.W));
    assert.equal(laserStaysOnBoard(9, 0, DIR.E), false, 'E from col 9 leaves board');

    // Red sphinx at (0,7) facing S
    const red = game.getAt(0, 7);
    assert.equal(red.type, PIECE_TYPE.SPHINX);
    assert.equal(red.player, PLAYER.RED);
    assert.equal(red.facing, DIR.S);
    assert.ok(laserStaysOnBoard(0, 7, DIR.S));

    game.currentPlayer = PLAYER.RED;
    const rMoves = game.getLegalMoves().filter(m =>
        m.type === 'rotate' && m.col === 0 && m.row === 7);
    assert.deepEqual(rMoves.map(m => m.toFacing).sort(), [DIR.E]);
    assert.ok(laserStaysOnBoard(0, 7, DIR.E));
    assert.equal(laserStaysOnBoard(0, 7, DIR.W), false, 'W from col 0 leaves board');
}

console.log('ok - khet facing / sphinx guards');
