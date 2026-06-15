const fs = require('fs');
const path = require('path');

const root = __dirname;
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
const lobbyJs = fs.readFileSync(path.join(root, 'js', 'lobby.js'), 'utf8');

function assert(condition, message) {
    if (!condition) {
        throw new Error(message);
    }
}

const pickerGames = Array.from(
    indexHtml.matchAll(/onclick="selectGame\('([^']+)'\)"/g),
    (match) => match[1]
);

assert(pickerGames.length > 0, 'No game picker entries found in index.html');

const selectGameMatch = lobbyJs.match(/async function selectGame\(gameName\) \{[\s\S]*?\n\}/);
assert(selectGameMatch, 'selectGame function not found in js/lobby.js');

const selectGameSource = selectGameMatch[0];
const handledGames = new Set(Array.from(
    selectGameSource.matchAll(/case\s+['"]([^'"]+)['"]\s*:/g),
    (match) => match[1]
));

const missing = pickerGames.filter((game) => !handledGames.has(game));
assert(
    missing.length === 0,
    `Picker games missing selectGame handlers: ${missing.join(', ')}`
);

console.log(`All ${pickerGames.length} picker games have selectGame handlers.`);
