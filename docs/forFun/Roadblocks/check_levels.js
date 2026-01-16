
const fs = require('fs');

function simulate(grid, sr, sc, dr, dc, goal) {
    let r = sr, c = sc, vDr = dr, vDc = dc;
    let visited = new Set();
    while (true) {
        let key = `${r},${c},${vDr},${vDc}`;
        if (visited.has(key)) return { r, c, status: 'loop' };
        visited.add(key);
        let nr = r + vDr, nc = c + vDc;
        if (nr < 0 || nr >= grid.length || nc < 0 || nc >= grid[0].length) return { r: nr, c: nc, status: 'lost' };
        const cell = grid[nr][nc];
        if (cell === 1) return { r, c, status: 'stop' };
        if (cell === 4 || cell === 5) { // Triangles
            let ndr, ndc;
            if (cell === 4) { ndr = vDc; ndc = vDr; }
            else { ndr = -vDc; ndc = -vDr; }
            r = nr; c = nc; vDr = ndr; vDc = ndc; continue;
        }
        if (cell === 6) { // Ramp
            r = nr + vDr; c = nc + vDc;
            if (r === goal.r && c === goal.c) return { r, c, status: 'win' };
            if (r < 0 || r >= grid.length || c < 0 || c >= grid[0].length) return { r, c, status: 'lost' };
            // Ramps jump OVER blocks, they don't stop. They land on (r,c)
            // If they land on a wall, they stop? Or is it a crash?
            // Existing logic in roadblocks.js: 
            // jr = nr + dr; jc = nc + dc; r = jr; c = jc; continue;
            // It just continues sliding from the landing spot.
            continue;
        }
        r = nr; c = nc;
        if (r === goal.r && c === goal.c) return { r, c, status: 'win' };
    }
}

function solveLevel(grid) {
    let start, goal;
    for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[0].length; c++) {
            if (grid[r][c] === 2) start = { r, c };
            if (grid[r][c] === 3) goal = { r, c };
        }
    }
    if (!start || !goal) return false;
    const queue = [start];
    const visited = new Set([`${start.r},${start.c}`]);

    while (queue.length > 0) {
        const { r, c } = queue.shift();
        for (let [dr, dc] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
            const res = simulate(grid, r, c, dr, dc, goal);
            if (res.status === 'win') return true;
            if (res.status === 'stop') {
                const key = `${res.r},${res.c}`;
                if (!visited.has(key)) {
                    visited.add(key);
                    queue.push({ r: res.r, c: res.c });
                }
            }
        }
    }
    return false;
}

// Read current levels from game.js
const gameJs = fs.readFileSync('/Users/nicbrody/Dropbox/Code/nbrody.github.io/docs/forFun/Roadblocks/game.js', 'utf8');
const levelMatch = gameJs.match(/const levels = (\[[\s\S]*?\]);/);
if (levelMatch) {
    try {
        const levels = JSON.parse(levelMatch[1].replace(/\/\/.*$/gm, ''));
        console.log(`Verifying ${levels.length} levels...`);
        levels.forEach((l, i) => {
            if (!solveLevel(l)) {
                console.log(`Level ${i + 1}: IMPOSSIBLE`);
            } else {
                console.log(`Level ${i + 1}: Solvable`);
            }
        });
    } catch (e) {
        console.log("Error parsing levels from game.js. It might have complex comments or non-JSON structure.");
        // Fallback or manual fix:
    }
} else {
    console.log("Could not find 'const levels' in game.js");
}
