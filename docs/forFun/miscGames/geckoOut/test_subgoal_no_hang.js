/**
 * Regression: SubgoalSolver must not infinite-loop when A* fails for every
 * completable gecko (board unchanged, allMoves never grows).
 */
import assert from 'node:assert/strict';
import { SubgoalSolver } from './SubgoalSolver.js';

class FakeBoard {
  constructor(geckos) {
    this.geckos = geckos;
    this.holes = geckos.map(g => ({ color: g.color, r: 0, c: 0, isPermanent: true }));
  }
  clone() {
    return new FakeBoard(this.geckos.map(g => ({ ...g, head: { ...g.head }, tail: { ...g.tail } })));
  }
  isSolved() {
    return this.geckos.length === 0;
  }
  moveGecko() {
    throw new Error('should not move when A* fails');
  }
  serialize() {
    return JSON.stringify(this.geckos);
  }
}

async function testAbortsWhenAStarFails() {
  const board = new FakeBoard([
    { id: 1, color: 'beige', head: { r: 1, c: 1 }, tail: { r: 1, c: 2 }, attachedHole: null },
    { id: 2, color: 'magenta', head: { r: 2, c: 1 }, tail: { r: 2, c: 2 }, attachedHole: null },
  ]);

  const solver = new SubgoalSolver(board, { maxStepsPerGoal: 10, maxTotalMoves: 5000 });
  let aStarCalls = 0;
  solver.aStarForGecko = async () => {
    aStarCalls += 1;
    return null;
  };
  // Avoid random-move unstick path changing the board: force completable path only.
  solver.getRandomMoves = () => [];

  const started = Date.now();
  const result = await Promise.race([
    solver.solveAsync(),
    new Promise((_, reject) => setTimeout(() => reject(new Error('hung')), 2000)),
  ]);
  const elapsed = Date.now() - started;

  assert.equal(result, null, 'should return null when stuck');
  assert.ok(aStarCalls >= 1 && aStarCalls <= 4, `expected a few A* attempts, got ${aStarCalls}`);
  assert.ok(elapsed < 1500, `should abort quickly, took ${elapsed}ms`);
  console.log(`ok - subgoal aborts on A* failure (${elapsed}ms, ${aStarCalls} A* calls)`);
}

await testAbortsWhenAStarFails();
console.log('All SubgoalSolver hang guards passed.');
