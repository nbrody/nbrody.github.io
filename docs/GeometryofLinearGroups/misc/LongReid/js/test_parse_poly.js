#!/usr/bin/env node
/**
 * Regression: parsePoly must preserve coefficients above MAX_SAFE_INTEGER.
 * Extracts parsePoly from app.js without a browser DOM.
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const start = src.indexOf('/* parse ');
const end = src.indexOf('/* ================================================================', start + 1);
if (start < 0 || end < 0) {
  console.error('Could not locate parsePoly in app.js');
  process.exit(1);
}

const sandbox = { console, BigInt };
vm.createContext(sandbox);
vm.runInContext(src.slice(start, end), sandbox);

const { parsePoly } = sandbox;
let failed = 0;

function assert(cond, msg) {
  if (!cond) {
    console.error('FAIL:', msg);
    failed++;
  } else {
    console.log('ok:', msg);
  }
}

const big = 9007199254740993n; // Number.MAX_SAFE_INTEGER + 2
const comma = parsePoly(`${big},0,1`);
assert(Array.isArray(comma), 'comma form returns array');
assert(comma[0] === big, `comma coeff preserved (${comma && comma[0]} === ${big})`);
assert(comma[2] === 1n, 'comma leading 1n');

const poly = parsePoly(`t^2+${big}`);
assert(Array.isArray(poly), 'poly form returns array');
assert(poly[0] === big, `poly constant preserved (${poly && poly[0]} === ${big})`);
assert(poly[2] === 1n, 'poly monic');

const classic = parsePoly('t^2-t-1');
assert(classic && classic[0] === -1n && classic[1] === -1n && classic[2] === 1n,
  'classic golden poly still parses');

const unsafeNumber = Number(big);
assert(unsafeNumber !== Number(big.toString()) || !Number.isSafeInteger(unsafeNumber),
  'sanity: Number would lose this coefficient');
assert(comma[0] !== BigInt(unsafeNumber) || comma[0] === big,
  'BigInt path does not match truncated Number');

if (failed) {
  console.error(`\n${failed} failure(s)`);
  process.exit(1);
}
console.log('\nAll parsePoly tests passed.');
