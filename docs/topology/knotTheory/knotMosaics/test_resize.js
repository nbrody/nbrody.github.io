/**
 * Resize keeps glued strands closed.
 *
 * An odd shrink on the Möbius band or RP² shifts the reversed-edge pairing
 * by one. A closed curve that never touches the cropped strip used to open.
 * Run: node docs/topology/knotTheory/knotMosaics/test_resize.js
 */
const fs = require('fs');
const vm = require('vm');
const path = require('path');

const dir = __dirname;
const context = { console, Math, Array, Object, Map, Set };
vm.createContext(context);
vm.runInContext(
    fs.readFileSync(path.join(dir, 'tiles.js'), 'utf8') +
    '\nthis.TILE_TYPES=TILE_TYPES; this.connectionsMatch=connectionsMatch;',
    context);

const app = fs.readFileSync(path.join(dir, 'app.js'), 'utf8');
function grab(name, kind) {
    const start = app.indexOf(kind + ' ' + name);
    if (start < 0) throw new Error('missing ' + name);
    if (kind === 'const') {
        const end = app.indexOf(';', start);
        return app.slice(start, end + 1);
    }
    const brace = app.indexOf('{', start);
    let depth = 0;
    for (let i = brace; i < app.length; i++) {
        if (app[i] === '{') depth++;
        else if (app[i] === '}') {
            depth--;
            if (depth === 0) return app.slice(start, i + 1);
        }
    }
    throw new Error('unclosed ' + name);
}
const src = [
    'const emptyGrid = (m) => Array.from({ length: m }, () => new Array(m).fill(0));',
    grab('tileForPairs', 'function'),
    grab('resizeFlatGrid', 'function'),
    grab('countMismatches', 'function'),
    grab('jogOddShrink', 'function'),
    grab('keepIfFewerMismatches', 'function'),
    grab('cellPairs', 'function'),
    grab('pairClash', 'function'),
    grab('pairsToTile', 'function'),
    grab('jogStraightExits', 'function'),
    grab('sidePairKey', 'function'),
    grab('PAIR_TILE', 'const'),
    grab('TILE_PAIRS', 'const'),
    'this.resizeFlatGrid=resizeFlatGrid; this.countMismatches=countMismatches;',
].join('\n');
vm.runInContext(src, context);

const { resizeFlatGrid, countMismatches, TILE_TYPES } = context;
const EDGES = {
    disk: { periodicLR: false, periodicTB: false, reversedLR: false, reversedTB: false },
    cylinder: { periodicLR: true, periodicTB: false, reversedLR: false, reversedTB: false },
    torus: { periodicLR: true, periodicTB: true, reversedLR: false, reversedTB: false },
    mobius: { periodicLR: false, periodicTB: false, reversedLR: true, reversedTB: false },
    projective: { periodicLR: false, periodicTB: false, reversedLR: true, reversedTB: true },
};

function blank(n) {
    return Array.from({ length: n }, () => Array.from({ length: n }, () => 0));
}
function eq(a, b) {
    if (a.length !== b.length) return false;
    for (let r = 0; r < a.length; r++) {
        for (let c = 0; c < a.length; c++) if (a[r][c] !== b[r][c]) return false;
    }
    return true;
}

// Closed curves through the connection flags, including reversed gluings.
function components(grid, edge) {
    const H = grid.length, W = grid[0].length;
    const OPP = { N: 'S', S: 'N', E: 'W', W: 'E' };
    const NEI = { N: [0, -1], S: [0, 1], W: [-1, 0], E: [1, 0] };
    function conns(t) {
        if (t === 7 || t === 8 || t === 11) return [['W', 'E'], ['N', 'S']];
        if (t === 9) return [['N', 'E'], ['S', 'W']];
        if (t === 10) return [['N', 'W'], ['S', 'E']];
        const c = TILE_TYPES[t] && TILE_TYPES[t].connections;
        if (!c) return [];
        const sides = ['N', 'E', 'S', 'W'].filter(s => c[s]);
        return sides.length === 2 ? [sides] : [];
    }
    const pieces = [];
    const lookup = new Map();
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
        for (const sides of conns(grid[j][i])) {
            const idx = pieces.length;
            pieces.push({ i, j, sides });
            lookup.set(`${i}|${j}|${sides[0]}`, idx);
            lookup.set(`${i}|${j}|${sides[1]}`, idx);
        }
    }
    const visited = new Array(pieces.length).fill(false);
    let loops = 0, open = 0;
    for (let s = 0; s < pieces.length; s++) {
        if (visited[s]) continue;
        let cur = s, entry = 0, guard = 0;
        while (cur >= 0 && !visited[cur] && guard++ < pieces.length + 2) {
            visited[cur] = true;
            const p = pieces[cur];
            const exitSide = p.sides[1 - entry];
            const [dx, dy] = NEI[exitSide];
            let ni = p.i + dx, nj = p.j + dy, enter = OPP[exitSide];
            if (ni < 0 || nj < 0 || ni >= W || nj >= H) {
                if (edge.reversedLR && (exitSide === 'E' || exitSide === 'W')) {
                    ni = exitSide === 'E' ? 0 : W - 1;
                    nj = H - 1 - p.j;
                } else if (edge.reversedTB && (exitSide === 'N' || exitSide === 'S')) {
                    nj = exitSide === 'S' ? 0 : H - 1;
                    ni = W - 1 - p.i;
                } else if (edge.periodicLR && (exitSide === 'E' || exitSide === 'W')) {
                    ni = (ni + W) % W;
                } else if (edge.periodicTB && (exitSide === 'N' || exitSide === 'S')) {
                    nj = (nj + H) % H;
                } else {
                    open++;
                    cur = -1;
                    break;
                }
            }
            const next = lookup.get(`${ni}|${nj}|${enter}`);
            if (next === undefined) { open++; cur = -1; break; }
            const np = pieces[next];
            entry = np.sides[0] === enter ? 0 : 1;
            cur = next;
        }
        if (cur >= 0) loops++;
    }
    return { loops, open };
}

let failed = 0;
function check(name, cond) {
    if (!cond) { failed++; console.error('FAIL', name); }
    else console.log('ok', name);
}

// Möbius: one horizontal strand on the self-paired middle row. It does not
// use the last row or need the cropped cells to stay a single closed curve.
{
    const n = 5;
    const g = blank(n);
    for (let c = 0; c < n; c++) g[2][c] = 1;
    const edge = EDGES.mobius;
    check('mobius middle starts closed', countMismatches(g, edge) === 0 && components(g, edge).loops === 1);
    const shrunk = resizeFlatGrid(g, n, 4, edge);
    const comp = components(shrunk, edge);
    check('mobius middle stays closed after odd shrink',
        countMismatches(shrunk, edge) === 0 && comp.loops === 1 && comp.open === 0);
    // The interior of the strand is still there; only the boundary exit jogs.
    check('mobius middle keeps its row', shrunk[2][0] === 1 && shrunk[2][1] === 1 && shrunk[2][2] === 1);
}

// The same curve, grown by one and shrunk back, is the original tile for tile.
{
    const n = 5;
    const g = blank(n);
    for (let c = 0; c < n; c++) g[2][c] = 1;
    const edge = EDGES.mobius;
    const grown = resizeFlatGrid(g, n, n + 1, edge);
    check('mobius grow stays closed', countMismatches(grown, edge) === 0);
    const back = resizeFlatGrid(grown, n + 1, n, edge);
    check('mobius grow then shrink is exact', eq(back, g));
}

// RP²: a vertical strand on the self-paired middle column.
{
    const n = 5;
    const g = blank(n);
    for (let r = 0; r < n; r++) g[r][2] = 2;
    const edge = EDGES.projective;
    check('rp2 middle starts closed', countMismatches(g, edge) === 0 && components(g, edge).loops === 1);
    const shrunk = resizeFlatGrid(g, n, 4, edge);
    const comp = components(shrunk, edge);
    check('rp2 middle stays closed after odd shrink',
        countMismatches(shrunk, edge) === 0 && comp.loops === 1 && comp.open === 0);
}

// RP²: two partner columns (1 ↔ n-2). Both sit inside an odd crop.
{
    const n = 6;
    const g = blank(n);
    for (let r = 0; r < n; r++) { g[r][1] = 2; g[r][4] = 2; }
    const edge = EDGES.projective;
    check('rp2 partners start closed', countMismatches(g, edge) === 0 && components(g, edge).open === 0);
    const shrunk = resizeFlatGrid(g, n, 5, edge);
    const comp = components(shrunk, edge);
    check('rp2 partners stay closed after odd shrink',
        countMismatches(shrunk, edge) === 0 && comp.open === 0 && comp.loops === 1);
}

// Disk and torus are not reversed: an odd shrink only crops, and a torus
// longitude that still spans the kept window stays closed.
{
    const n = 5;
    const g = blank(n);
    for (let c = 0; c < n; c++) g[2][c] = 1;
    const disk = resizeFlatGrid(g, n, 4, EDGES.disk);
    check('disk odd shrink does not invent a jog', disk[2][3] === 1 && disk.every((row, r) => row.every((t, c) => t === (r === 2 ? 1 : 0))));
    const torus = resizeFlatGrid(g, n, 4, EDGES.torus);
    check('torus longitude stays closed', countMismatches(torus, EDGES.torus) === 0 && components(torus, EDGES.torus).loops === 1);
}

// Grow-then-shrink stays exact on every surface, including ones whose odd
// crop would otherwise jog.
{
    const surfaces = ['disk', 'cylinder', 'torus', 'mobius', 'projective'];
    let bad = 0;
    for (const surf of surfaces) {
        for (const n of [3, 4, 5, 8]) {
            for (const make of [
                () => {
                    const g = blank(n);
                    for (let c = 0; c < n; c++) g[Math.min(1, n - 1)][c] = 1;
                    return g;
                },
                () => {
                    const g = blank(n);
                    for (let r = 0; r < n; r++) g[r][Math.min(1, n - 1)] = 2;
                    return g;
                },
                () => {
                    const g = blank(n);
                    for (let i = 0; i < n; i++) g[i][i] = 7;
                    return g;
                },
            ]) {
                const g = make();
                for (const m of [n + 1, n + 2, n + 3]) {
                    const grown = resizeFlatGrid(g, n, m, EDGES[surf]);
                    const back = resizeFlatGrid(grown, m, n, EDGES[surf]);
                    if (!eq(back, g)) bad++;
                }
            }
        }
    }
    check('grow then shrink roundtrip', bad === 0);
}

if (failed) {
    console.error(failed + ' failed');
    process.exit(1);
}
console.log('all passed');
