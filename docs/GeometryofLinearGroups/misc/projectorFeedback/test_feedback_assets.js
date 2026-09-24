#!/usr/bin/env node
/**
 * The GOLG misc Projector Feedback page is linked from site-nav and the
 * misc tool grid. Without a local feedback.js that matches the HTML
 * control IDs, the page is a dead shell (no renderer, no controls).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const assert = require('assert');

const dir = __dirname;
const htmlPath = path.join(dir, 'index.html');
const jsPath = path.join(dir, 'feedback.js');
const cssPath = path.join(dir, 'style.css');

assert.ok(fs.existsSync(htmlPath), 'index.html must exist');
assert.ok(fs.existsSync(jsPath), 'feedback.js must exist next to index.html');
assert.ok(fs.existsSync(cssPath), 'style.css must exist next to index.html');

const html = fs.readFileSync(htmlPath, 'utf8');
const js = fs.readFileSync(jsPath, 'utf8');

assert.ok(
    /src=["']feedback\.js["']/.test(html),
    'index.html must load local feedback.js'
);

const ids = new Set();
const idRe = /\bid=["']([^"']+)["']/g;
let m;
while ((m = idRe.exec(html))) ids.add(m[1]);

const lookups = new Set();
const lookupRe = /(?:getElementById\(|\$\()\s*['"]([^'"]+)['"]/g;
while ((m = lookupRe.exec(js))) lookups.add(m[1]);

const missing = [...lookups].filter((id) => !ids.has(id));
assert.deepStrictEqual(
    missing,
    [],
    `feedback.js looks up IDs missing from index.html: ${missing.join(', ')}`
);

for (const required of ['container', 'controls-panel', 'decay', 'pc', 'save-btn', 'preset-row']) {
    assert.ok(ids.has(required), `index.html must include #${required}`);
}

assert.ok(js.includes('import * as THREE'), 'feedback.js must be the Three.js simulation module');
assert.ok(html.includes('golg-nav-bootstrap'), 'GOLG nav bootstrap must be preserved');

console.log(`ok: feedback.js present; ${lookups.size} DOM lookups match HTML ids`);
