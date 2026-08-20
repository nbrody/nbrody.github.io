'use strict';

const assert = require('assert');
const { cellBelongsToGrid } = require('./cellGrid.js');

function diskGrid(n) {
    return Array.from({ length: n }, () => Array(n).fill(0));
}

function sphereGrid(faceSize) {
    const grid = {};
    for (const f of ['top', 'front', 'right', 'back', 'left', 'bottom']) {
        grid[f] = Array.from({ length: faceSize }, () => Array(faceSize).fill(0));
    }
    return grid;
}

/** Production setTileAt, minus undo/DOM. Throws on the old unguarded path. */
function setTileAt(grid, surface, cell, tileIndex, { guard }) {
    if (guard && !cellBelongsToGrid(grid, surface, cell)) return;
    if (surface === 'sphere') {
        grid[cell.face][cell.row][cell.col] = tileIndex;
    } else {
        grid[cell.row][cell.col] = tileIndex;
    }
}

function throws(fn) {
    try { fn(); } catch (e) { return true; }
    return false;
}

// --- membership ---
assert.strictEqual(cellBelongsToGrid(diskGrid(5), 'disk', { row: 2, col: 3 }), true);
assert.strictEqual(cellBelongsToGrid(diskGrid(5), 'disk', { row: 0, col: 0 }), true);
assert.strictEqual(cellBelongsToGrid(diskGrid(5), 'disk', { row: 5, col: 0 }), false);
assert.strictEqual(cellBelongsToGrid(diskGrid(5), 'disk', { row: 2, col: 5 }), false);
assert.strictEqual(cellBelongsToGrid(diskGrid(5), 'torus', { row: 4, col: 4 }), true);

const sph = sphereGrid(3);
assert.strictEqual(cellBelongsToGrid(sph, 'sphere', { face: 'front', row: 1, col: 2 }), true);
assert.strictEqual(cellBelongsToGrid(sph, 'sphere', { face: 'front', row: 3, col: 0 }), false);
assert.strictEqual(cellBelongsToGrid(sph, 'sphere', { face: 'nope', row: 0, col: 0 }), false);

// Disk selection leftover after switching to sphere (Delete / paint).
const diskCell = { row: 1, col: 1 };
assert.strictEqual(cellBelongsToGrid(sph, 'sphere', diskCell), false);
assert.ok(throws(() => setTileAt(sph, 'sphere', diskCell, 0, { guard: false })),
    'unguarded disk→sphere Delete must TypeError');
assert.doesNotThrow(() => setTileAt(sph, 'sphere', diskCell, 0, { guard: true }));
assert.strictEqual(sph.front[1][1], 0, 'sphere grid must be unchanged');

// Sphere selection leftover after switching to disk: silent overwrite without a guard.
const disk = diskGrid(5);
disk[2][3] = 7;
const sphereCell = { face: 'front', row: 2, col: 3 };
assert.strictEqual(cellBelongsToGrid(disk, 'disk', sphereCell), false);
setTileAt(disk, 'disk', sphereCell, 0, { guard: false });
assert.strictEqual(disk[2][3], 0, 'unguarded sphere→disk write hits the flat grid');
disk[2][3] = 7;
setTileAt(disk, 'disk', sphereCell, 0, { guard: true });
assert.strictEqual(disk[2][3], 7, 'guarded sphere→disk write must be a no-op');

// Shrink below a selected coordinate.
const small = diskGrid(4);
assert.strictEqual(cellBelongsToGrid(small, 'disk', { row: 10, col: 10 }), false);
assert.ok(throws(() => setTileAt(small, 'disk', { row: 10, col: 10 }, 0, { guard: false })),
    'unguarded shrink Delete must TypeError');
assert.doesNotThrow(() => setTileAt(small, 'disk', { row: 10, col: 10 }, 0, { guard: true }));

console.log('ok — knot mosaic selection guards');
