// Test script to run solver on Level 1389
import { getLevel1389 } from './level1389.js';
import { Solver } from './solver.js';

console.log('Loading Level 1389...');
const board = getLevel1389();

console.log(`Board: ${board.rows}x${board.cols}`);
console.log(`Geckos: ${board.geckos.length}`);
console.log(`Holes: ${board.holes.length}`);

console.log('\nGecko details:');
for (const gecko of board.geckos) {
    const matchingHole = board.holes.find(h => h.color === gecko.color);
    const holeInfo = matchingHole ? `at (${matchingHole.r},${matchingHole.c})` : 'NO MATCHING HOLE!';
    console.log(`  ${gecko.id}. ${gecko.color}: head(${gecko.head.r},${gecko.head.c}) -> tail(${gecko.tail.r},${gecko.tail.c}), hole ${holeInfo}`);
}

console.log('\nHole details:');
for (const hole of board.holes) {
    const matchingGecko = board.geckos.find(g => g.color === hole.color);
    const geckoInfo = matchingGecko ? `gecko ${matchingGecko.id}` : 'NO MATCHING GECKO';
    console.log(`  (${hole.r},${hole.c}) ${hole.color} - ${hole.isPermanent ? 'PERMANENT' : 'temp'} - ${geckoInfo}`);
}

console.log('\n--- Running Beam Search Solver ---');
console.log('Beam width: 1000, Max iterations: 2000');

const startTime = Date.now();
const solver = new Solver(board, { beamWidth: 1000, maxIterations: 2000, randomness: 0.4 });
const solution = solver.solve();
const endTime = Date.now();

if (solution) {
    console.log(`\n✅ SOLUTION FOUND in ${endTime - startTime}ms!`);
    console.log(`Total moves: ${solution.length}`);
    console.log('\nFirst 20 moves:');
    solution.slice(0, 20).forEach((move, i) => {
        console.log(`  ${i + 1}. Gecko ${move.geckoId} ${move.end} -> (${move.pos.r},${move.pos.c})`);
    });
    if (solution.length > 20) {
        console.log(`  ... and ${solution.length - 20} more moves`);
    }
} else {
    console.log(`\n❌ No solution found after ${endTime - startTime}ms`);
}
