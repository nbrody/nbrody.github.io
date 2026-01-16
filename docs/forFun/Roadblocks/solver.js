
const fs = require('fs');

/**
 * Roadblocks Solver & Generator
 * 
 * Block Types:
 * 0: Empty, 1: Wall, 2: Start, 3: Target, 4: Triangle \, 5: Triangle /, 6: Ramp (Jump 2)
 */

function simulate(grid, sr, sc, dr, dc, goal) {
    let r = sr, c = sc, vDr = dr, vDc = dc;
    let visited = new Set();
    while (true) {
        let key = `${r},${c},${vDr},${vDc}`;
        if (visited.has(key)) return { r, c, status: 'loop' };
        visited.add(key);

        let nr = r + vDr, nc = c + vDc;

        // Bounds
        if (nr < 0 || nr >= grid.length || nc < 0 || nc >= grid[0].length) {
            return { r: nr, c: nc, status: 'lost' };
        }

        const cell = grid[nr][nc];

        // Wall
        if (cell === 1) return { r, c, status: 'stop' };

        // Triangle
        if (cell === 4 || cell === 5) {
            let ndr, ndc;
            if (cell === 4) { ndr = vDc; ndc = vDr; }
            else { ndr = -vDc; ndc = -vDr; }
            r = nr; c = nc; vDr = ndr; vDc = ndc;
            continue;
        }

        // Ramp
        if (cell === 6) {
            r = nr + vDr; c = nc + vDc;
            if (r === goal.r && c === goal.c) return { r, c, status: 'win' };
            if (r < 0 || r >= grid.length || c < 0 || c >= grid[0].length) return { r, c, status: 'lost' };
            continue;
        }

        // Wormhole
        if (cell === 7) {
            let tr = -1, tc = -1;
            for (let row = 0; row < grid.length; row++) {
                for (let col = 0; col < grid[0].length; col++) {
                    if (grid[row][col] === 7 && (row !== nr || col !== nc)) {
                        tr = row; tc = col; break;
                    }
                }
                if (tr !== -1) break;
            }
            if (tr !== -1) {
                r = tr; c = tc;
                continue;
            }
        }

        // Goal or Empty
        r = nr; c = nc;
        if (r === goal.r && c === goal.c) return { r, c, status: 'win' };
    }
}

function solve(grid) {
    let start, goal;
    for (let r = 0; r < grid.length; r++) {
        for (let c = 0; c < grid[0].length; c++) {
            if (grid[r][c] === 2) start = { r, c };
            if (grid[r][c] === 3) goal = { r, c };
        }
    }
    if (!start || !goal) return false;

    const queue = [{ r: start.r, c: start.c, path: [] }];
    const visited = new Set([`${start.r},${start.c}`]);

    while (queue.length > 0) {
        const { r, c, path } = queue.shift();
        for (let [dr, dc, name] of [[-1, 0, 'U'], [1, 0, 'D'], [0, -1, 'L'], [0, 1, 'R']]) {
            const res = simulate(grid, r, c, dr, dc, goal);
            if (res.status === 'win') return true;
            if (res.status === 'stop' || res.status === 'loop') {
                const key = `${res.r},${res.c}`;
                if (!visited.has(key)) {
                    visited.add(key);
                    queue.push({ r: res.r, c: res.c, path: [...path, name] });
                }
            }
        }
    }
    return false;
}

exports.solve = solve;
exports.simulate = simulate;
