// Subgoal-Based Iterative Solver for Gecko Out
// Strategy: Focus on completing ONE gecko at a time using A* search
// This mimics how a human would solve - get one gecko in, then the next

export class SubgoalSolver {
    constructor(board, options = {}) {
        this.startBoard = board;
        // Increased limits for Level 1389's complexity
        this.maxStepsPerGoal = options.maxStepsPerGoal || 50000; // Much more search depth per gecko
        this.maxTotalMoves = options.maxTotalMoves || 50000;
    }

    // Find geckos that can potentially complete (unblocked, hole exists)
    getCompletableGeckos(board) {
        return board.geckos.filter(gecko => {
            // Must not have attached hole (rope)
            if (gecko.attachedHole) return false;
            // Must have a matching hole
            const hole = board.holes.find(h => h.color === gecko.color);
            return !!hole;
        });
    }

    // Manhattan distance from gecko's closest end to its hole
    getGeckoDistance(board, gecko) {
        const hole = board.holes.find(h => h.color === gecko.color);
        if (!hole) return Infinity;

        const headDist = Math.abs(gecko.head.r - hole.r) + Math.abs(gecko.head.c - hole.c);
        const tailDist = Math.abs(gecko.tail.r - hole.r) + Math.abs(gecko.tail.c - hole.c);
        return Math.min(headDist, tailDist);
    }

    // Score a target gecko (which one should we try to solve first?)
    // Based on Level 1389 strategy: beige can go in first!
    scoreTargetGecko(board, gecko) {
        let score = 0;

        // === LEVEL 1389 SPECIFIC PRIORITY ===
        // The user identified that beige should go in first:
        // 1. Purple (dark blue) moves out of the way
        // 2. Beige circles around the post
        // 3. Blue moves out of the way
        // 4. Beige goes in hole at (8,5)
        const priorityOrder = ['beige', 'magenta', 'darkblue', 'red', 'green', 'orange', 'lightpink', 'yellow', 'darkbeige'];
        const priorityIndex = priorityOrder.indexOf(gecko.color);
        if (priorityIndex !== -1) {
            score += (priorityOrder.length - priorityIndex) * 100; // Higher priority = higher score
        }

        // HUGE bonus for beige - it can complete first!
        if (gecko.color === 'beige') {
            score += 1000;
        }

        // Prefer geckos closer to their holes
        const dist = this.getGeckoDistance(board, gecko);
        score -= dist * 10;

        // Prefer geckos with inner geckos (unlocks more)
        if (gecko.innerGecko) score += 50;

        // Prefer geckos going to permanent holes
        const hole = board.holes.find(h => h.color === gecko.color);
        if (hole && hole.isPermanent) score += 30;

        return score;
    }

    // A* search to complete ONE specific gecko
    // Returns moves array or null if not found within limit
    async aStarForGecko(board, targetGeckoId, onProgress = null) {
        const targetGecko = board.geckos.find(g => g.id === targetGeckoId);
        if (!targetGecko) return null;

        const startState = board.serialize();
        const openSet = [{ board: board.clone(), moves: [], g: 0, f: 0 }];
        const visited = new Set([startState]);

        // Heuristic: distance of target gecko to its hole
        const heuristic = (b) => {
            const g = b.geckos.find(gecko => gecko.id === targetGeckoId);
            if (!g) return 0; // Target completed!
            return this.getGeckoDistance(b, g);
        };

        let iterations = 0;
        let bestCandidate = openSet[0];

        while (openSet.length > 0 && iterations < this.maxStepsPerGoal) {
            iterations++;

            // Yield to UI every 20 iterations
            if (iterations % 20 === 0 && onProgress) {
                await new Promise(resolve => setTimeout(resolve, 0));
                onProgress({
                    iteration: iterations,
                    score: 100 - heuristic(bestCandidate.board) * 5,
                    geckos: bestCandidate.board.geckos.length,
                    visited: visited.size,
                    beamSize: openSet.length,
                    bestBoard: bestCandidate.board,
                    bestMoves: bestCandidate.moves,
                    targetColor: targetGecko.color
                });
            }

            // Sort by f = g + h (A*)
            openSet.sort((a, b) => a.f - b.f);
            const current = openSet.shift();

            // Track best candidate for visualization
            if (current.f < bestCandidate.f || heuristic(current.board) < heuristic(bestCandidate.board)) {
                bestCandidate = current;
            }

            // Check if target gecko completed
            const currentTarget = current.board.geckos.find(g => g.id === targetGeckoId);
            if (!currentTarget) {
                console.log(`✅ Completed ${targetGecko.color} gecko in ${current.moves.length} moves!`);
                return current.moves;
            }

            // Generate all possible moves
            for (const gecko of current.board.geckos) {
                for (const end of ['head', 'tail']) {
                    const pos = end === 'head' ? gecko.head : gecko.tail;
                    const neighbors = [
                        { r: pos.r - 1, c: pos.c },
                        { r: pos.r + 1, c: pos.c },
                        { r: pos.r, c: pos.c - 1 },
                        { r: pos.r, c: pos.c + 1 }
                    ];

                    for (const nextPos of neighbors) {
                        if (current.board.isValidMove(gecko.id, nextPos, end)) {
                            const newBoard = current.board.clone();
                            newBoard.moveGecko(gecko.id, nextPos, end);
                            const state = newBoard.serialize();

                            if (!visited.has(state)) {
                                visited.add(state);
                                const g = current.g + 1;
                                const h = heuristic(newBoard);

                                // Bonus for moves that help the target
                                let movePriority = 0;
                                if (gecko.id === targetGeckoId) {
                                    const oldDist = this.getGeckoDistance(current.board, gecko);
                                    const newDist = this.getGeckoDistance(newBoard, newBoard.geckos.find(gg => gg.id === targetGeckoId) || gecko);
                                    if (newDist < oldDist) movePriority = -2; // Favor moves that help target
                                }

                                openSet.push({
                                    board: newBoard,
                                    moves: [...current.moves, { geckoId: gecko.id, pos: nextPos, end }],
                                    g: g,
                                    f: g + h + movePriority
                                });
                            }
                        }
                    }
                }
            }
        }

        console.log(`❌ Could not complete ${targetGecko.color} gecko after ${iterations} iterations`);
        return null;
    }

    // Main solve: iteratively complete geckos one by one
    async solveAsync(onProgress = null) {
        let board = this.startBoard.clone();
        let allMoves = [];
        let iteration = 0;

        console.log('=== SUBGOAL SOLVER ===');
        console.log(`Starting with ${board.geckos.length} geckos`);

        while (!board.isSolved() && allMoves.length < this.maxTotalMoves) {
            iteration++;

            // Find completable geckos and pick the best one
            const completable = this.getCompletableGeckos(board);

            if (completable.length === 0) {
                console.log('No completable geckos! Need to move blocked geckos...');
                // Try moving any gecko randomly to unblock
                const anyMoves = this.getRandomMoves(board, 20);
                if (anyMoves.length === 0) {
                    console.log('No moves possible - stuck!');
                    break;
                }
                allMoves.push(...anyMoves);
                for (const move of anyMoves) {
                    board.moveGecko(move.geckoId, move.pos, move.end);
                }
                continue;
            }

            // Score and sort completable geckos
            completable.sort((a, b) => this.scoreTargetGecko(board, b) - this.scoreTargetGecko(board, a));
            const target = completable[0];

            console.log(`\n--- Iteration ${iteration}: Targeting ${target.color} gecko (dist=${this.getGeckoDistance(board, target)}) ---`);

            // Use A* to find moves to complete this gecko (passing progress callback for live updates)
            const moves = await this.aStarForGecko(board, target.id, onProgress);

            if (moves && moves.length > 0) {
                // Apply moves to board one at a time with animation
                for (const move of moves) {
                    allMoves.push(move);
                    board.moveGecko(move.geckoId, move.pos, move.end);

                    // Animate each move
                    if (onProgress) {
                        await new Promise(resolve => setTimeout(resolve, 50));
                        onProgress({
                            iteration: iteration,
                            score: 100 - board.geckos.length * 10,
                            geckos: board.geckos.length,
                            visited: allMoves.length,
                            beamSize: completable.length,
                            bestBoard: board,
                            bestMoves: allMoves,
                            targetColor: target.color
                        });
                    }
                }
                console.log(`Applied ${moves.length} moves. Total: ${allMoves.length}. Geckos remaining: ${board.geckos.length}`);
            } else {
                console.log(`Failed to complete ${target.color}, trying next best...`);
                // Try the next completable gecko
                if (completable.length > 1) {
                    const nextTarget = completable[1];
                    const nextMoves = await this.aStarForGecko(board, nextTarget.id, onProgress);
                    if (nextMoves && nextMoves.length > 0) {
                        for (const move of nextMoves) {
                            allMoves.push(move);
                            board.moveGecko(move.geckoId, move.pos, move.end);

                            if (onProgress) {
                                await new Promise(resolve => setTimeout(resolve, 50));
                                onProgress({
                                    iteration: iteration,
                                    score: 100 - board.geckos.length * 10,
                                    geckos: board.geckos.length,
                                    visited: allMoves.length,
                                    beamSize: completable.length,
                                    bestBoard: board,
                                    bestMoves: allMoves,
                                    targetColor: nextTarget.color
                                });
                            }
                        }
                    }
                }
            }

            // Progress callback
            if (onProgress) {
                await new Promise(resolve => setTimeout(resolve, 0));
                onProgress({
                    iteration: iteration,
                    score: 100 - board.geckos.length * 10,
                    geckos: board.geckos.length,
                    visited: allMoves.length,
                    beamSize: completable.length,
                    bestBoard: board,
                    bestMoves: allMoves
                });
            }
        }

        if (board.isSolved()) {
            console.log(`🎯 SOLVED in ${allMoves.length} moves!`);
            return allMoves;
        }

        console.log(`Finished with ${board.geckos.length} geckos remaining`);
        return null;
    }

    // Get some random valid moves (for when stuck)
    getRandomMoves(board, count) {
        const moves = [];
        let tempBoard = board.clone();

        for (let i = 0; i < count; i++) {
            const allMoves = [];
            for (const gecko of tempBoard.geckos) {
                for (const end of ['head', 'tail']) {
                    const pos = end === 'head' ? gecko.head : gecko.tail;
                    const neighbors = [
                        { r: pos.r - 1, c: pos.c },
                        { r: pos.r + 1, c: pos.c },
                        { r: pos.r, c: pos.c - 1 },
                        { r: pos.r, c: pos.c + 1 }
                    ];
                    for (const nextPos of neighbors) {
                        if (tempBoard.isValidMove(gecko.id, nextPos, end)) {
                            allMoves.push({ geckoId: gecko.id, pos: nextPos, end });
                        }
                    }
                }
            }

            if (allMoves.length === 0) break;

            const move = allMoves[Math.floor(Math.random() * allMoves.length)];
            moves.push(move);
            tempBoard.moveGecko(move.geckoId, move.pos, move.end);
        }

        return moves;
    }
}
