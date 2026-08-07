/**
 * Regression tests for Knot Mosaics R³ size guards and virtual-crossing tubes.
 * Run: node docs/topology/knotTheory/knotMosaics/test_r3_guards.js
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const dir = __dirname;
const read = (name) => fs.readFileSync(path.join(dir, name), 'utf8');

function r3TextureCellSize(dim) {
    const d = Math.max(1, dim | 0);
    return Math.max(8, Math.min(96, Math.floor(2048 / d)));
}

const R3_MAX_SPHERE_FACE = 16;
const R3_MAX_TORUS_GRID = 25;

function r3SizeGuardMessage(surface, size) {
    if (surface === 'sphere' && size > R3_MAX_SPHERE_FACE) {
        return `Sphere face size ${size} is too large for the R³ fold view ` +
            `(max ${R3_MAX_SPHERE_FACE}). Larger sizes are fine for 2D editing — ` +
            `reduce the grid size before viewing in R³.`;
    }
    if (surface === 'torus' && size > R3_MAX_TORUS_GRID) {
        return `Torus grid size ${size} is too large for the R³ fold view ` +
            `(max ${R3_MAX_TORUS_GRID}). Larger sizes are fine for 2D editing — ` +
            `reduce the grid size before viewing in R³.`;
    }
    return null;
}

function canvasBytes(dim) {
    const cs = r3TextureCellSize(dim);
    const edge = dim * cs;
    return edge * edge * 4;
}

// --- texture sizing ---
assert.strictEqual(r3TextureCellSize(5), 96);
assert.strictEqual(r3TextureCellSize(16), 96);
assert.strictEqual(r3TextureCellSize(60), 34);
assert.ok(60 * r3TextureCellSize(60) <= 2048);

// Six sphere faces at fs=60 must stay far below the old ~800 MiB fixed-96 path.
const sphere60MiB = (canvasBytes(60) * 6) / (1024 * 1024);
assert.ok(sphere60MiB < 120, `expected <120 MiB, got ${sphere60MiB}`);
const oldSphere60MiB = (60 * 96 * 60 * 96 * 4 * 6) / (1024 * 1024);
assert.ok(oldSphere60MiB > 700, 'sanity: old path was huge');

// --- R³ size guards ---
assert.strictEqual(r3SizeGuardMessage('sphere', 16), null);
assert.ok(r3SizeGuardMessage('sphere', 60));
assert.strictEqual(r3SizeGuardMessage('torus', 25), null);
assert.ok(r3SizeGuardMessage('torus', 60));
assert.strictEqual(r3SizeGuardMessage('disk', 60), null);

// --- source wiring / no-drift checks ---
const appSrc = read('app.js');
assert.ok(appSrc.includes('window.r3TextureCellSize = function'));
assert.ok(appSrc.includes('window.r3SizeGuardMessage = function'));
assert.ok(appSrc.includes('Math.floor(2048 / d)'));
assert.ok(appSrc.includes('const R3_MAX_SPHERE_FACE = 16'));
assert.ok(appSrc.includes('const R3_MAX_TORUS_GRID = 25'));
assert.match(appSrc, /r3SizeGuardMessage\('sphere',\s*state\.faceSize\)/);
assert.match(appSrc, /r3SizeGuardMessage\('torus',\s*state\.gridSize\)/);
assert.ok(appSrc.includes('window.r3TextureCellSize(fs)'));
assert.ok(appSrc.includes('window.r3TextureCellSize(gs)'));
assert.ok(!appSrc.includes('const cs = 96'), 'fixed 96px texture cell size must be gone');

const cubeSrc = read('cube3d.js');
const torusSrc = read('torus3d.js');
assert.ok(cubeSrc.includes("case 'cross_virtual'"), 'cube tubes render virtual crossings');
assert.ok(torusSrc.includes("case 'cross_virtual'"), 'torus tubes render virtual crossings');
assert.ok(cubeSrc.includes('disposeObject3D'), 'cube disposes GPU resources on rebuild');
assert.ok(torusSrc.includes('disposeObject3D'), 'torus disposes GPU resources on rebuild');
assert.ok(cubeSrc.includes('r3SizeGuardMessage'), 'cube fold re-checks size');
assert.ok(torusSrc.includes('r3SizeGuardMessage'), 'torus fold re-checks size');
assert.ok(torusSrc.includes('Math.min(gs * 8, 160)'), 'torus plane segments are capped');

const smoothSrc = read('smooth3d.js');
assert.match(smoothSrc, /Math\.min\(\s*720\s*,/);

// Execute the live helper body from app.js to catch formula drift.
const cellMatch = appSrc.match(
    /window\.r3TextureCellSize\s*=\s*function\s*\(dim\)\s*\{([\s\S]*?)\n\};/
);
assert.ok(cellMatch, 'extract r3TextureCellSize');
const liveCell = new Function('dim', cellMatch[1]);
assert.strictEqual(liveCell(60), r3TextureCellSize(60));
assert.strictEqual(liveCell(16), r3TextureCellSize(16));
assert.strictEqual(liveCell(1), r3TextureCellSize(1));

console.log('test_r3_guards.js: all assertions passed');
