#!/usr/bin/env node
/**
 * The Martelli interactive paper bootstraps from a single module script.
 * A 404 on any local import aborts the whole graph: roots plot, Coxeter
 * diagrams, 3D viewers, and the Anosov play button never initialize.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const dir = __dirname;
const html = fs.readFileSync(path.join(dir, 'index.html'), 'utf8');

const importRe = /(?:from|import)\s+['"](\.[^'"]+)['"]/g;
const specs = [];
let m;
while ((m = importRe.exec(html))) specs.push(m[1]);

assert.ok(specs.length > 0, 'expected local module imports in index.html');

const missing = [];
for (const spec of specs) {
    const target = path.resolve(dir, spec);
    if (!fs.existsSync(target)) missing.push(spec);
}
assert.deepStrictEqual(missing, [], `local imports must exist: ${missing.join(', ')}`);

assert.ok(
    specs.includes('./anosov.js'),
    'Anosov animation must be imported from ./anosov.js (not ./js/anosov.js)'
);
assert.ok(
    !specs.includes('./js/anosov.js'),
    './js/anosov.js does not exist and would 404 the whole module graph'
);

const anosov = fs.readFileSync(path.join(dir, 'anosov.js'), 'utf8');
assert.ok(
    /export function toggleAnimation/.test(anosov),
    'anosov.js must export toggleAnimation for the Play button'
);
assert.ok(
    /window\.toggleAnimation\s*=/.test(anosov),
    'anosov.js must attach toggleAnimation on window for onclick='
);

const requiredIds = ['playBtn', 'anosovCanvas', 'rootsCanvas', 'hwContainer', 'figureEightContainer'];
for (const id of requiredIds) {
    assert.ok(
        html.includes(`id="${id}"`) || html.includes(`id='${id}'`),
        `index.html must include #${id}`
    );
}

console.log(`ok: ${specs.length} local imports resolve; Anosov path is ./anosov.js`);
