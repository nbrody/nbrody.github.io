export class Solver {
    constructor(board, options = {}) {
        this.startBoard = board;
        this.beamWidth = options.beamWidth || 5000;  // Keep top K candidates
        this.maxIterations = options.maxIterations || 500;
        this.randomness = options.randomness || 0.2; // How much randomness to add to scores
    }

    // Calculate Manhattan distance from gecko's closest end to its matching hole
    getGeckoDistance(board, gecko) {
        const matchingHole = board.holes.find(h => h.color === gecko.color);
        if (!matchingHole) return 50; // No matching hole means already completed or doesn't exist

        const headDist = Math.abs(gecko.head.r - matchingHole.r) + Math.abs(gecko.head.c - matchingHole.c);
        const tailDist = Math.abs(gecko.tail.r - matchingHole.r) + Math.abs(gecko.tail.c - matchingHole.c);
        return Math.min(headDist, tailDist);
    }

    // Recursively get all inner gecko colors and their distances
    getInnerGeckoDistances(board, gecko, depth = 0) {
        let totalDistance = 0;
        let current = gecko.innerGecko;
        let d = 1;
        while (current) {
            const matchingHole = board.holes.find(h => h.color === current.color);
            if (matchingHole) {
                // Inner geckos use the outer gecko's body position
                const headDist = Math.abs(gecko.head.r - matchingHole.r) + Math.abs(gecko.head.c - matchingHole.c);
                const tailDist = Math.abs(gecko.tail.r - matchingHole.r) + Math.abs(gecko.tail.c - matchingHole.c);
                // Weight inner geckos less since they can only be reached after outer is done
                totalDistance += Math.min(headDist, tailDist) * (0.5 / d);
            }
            current = current.innerGecko;
            d++;
        }
        return totalDistance;
    }

    // Heuristic: sum of all gecko distances to their matching holes (including inner geckos)
    // Lower is better
    evaluateBoard(board) {
        let totalDistance = 0;
        for (const gecko of board.geckos) {
            totalDistance += this.getGeckoDistance(board, gecko);
            // Also consider inner geckos for future planning
            totalDistance += this.getInnerGeckoDistances(board, gecko);
        }
        // Add bonus for fewer geckos (some have been completed)
        totalDistance += board.geckos.length * 15;
        return totalDistance;
    }

    // Async solve that yields to UI for live updates
    async solveAsync(onProgress = null) {
        // Beam search: keep top K candidates at each step
        let beam = [{ board: this.startBoard, moves: [], score: this.evaluateBoard(this.startBoard) }];
        const visited = new Set();
        visited.add(this.startBoard.serialize());

        let iterations = 0;
        let bestSolution = null;

        while (beam.length > 0 && iterations < this.maxIterations) {
            iterations++;

            // Yield to UI every 5 iterations
            if (iterations % 5 === 0) {
                await new Promise(resolve => setTimeout(resolve, 0));
            }

            // Progress callback every 5 iterations
            if (iterations % 5 === 0 || iterations === 1) {
                const bestCandidate = beam[0];
                const geckosRemaining = bestCandidate.board.geckos.length;

                // Call progress callback if provided - include the best board for rendering
                if (onProgress) {
                    onProgress({
                        iteration: iterations,
                        score: bestCandidate.score,
                        geckos: geckosRemaining,
                        visited: visited.size,
                        beamSize: beam.length,
                        bestBoard: bestCandidate.board,
                        bestMoves: bestCandidate.moves
                    });
                }
            }

            // Check for solutions in current beam
            for (const candidate of beam) {
                if (candidate.board.isSolved()) {
                    if (!bestSolution || candidate.moves.length < bestSolution.length) {
                        bestSolution = candidate.moves;
                        console.log(`🎯 Found solution with ${bestSolution.length} moves!`);
                    }
                }
            }

            // If we found a solution, continue searching briefly for a better one
            if (bestSolution && iterations > 100) {
                break;
            }

            // Generate all successors from current beam
            const successors = [];

            for (const { board, moves, score } of beam) {
                if (board.isSolved()) continue;

                for (const gecko of board.geckos) {
                    const ends = ['head', 'tail'];
                    for (const end of ends) {
                        const pos = end === 'head' ? gecko.head : gecko.tail;
                        const neighbors = [
                            { r: pos.r - 1, c: pos.c },
                            { r: pos.r + 1, c: pos.c },
                            { r: pos.r, c: pos.c - 1 },
                            { r: pos.r, c: pos.c + 1 }
                        ];

                        for (const nextPos of neighbors) {
                            if (board.isValidMove(gecko.id, nextPos, end)) {
                                const newBoard = board.clone();
                                newBoard.moveGecko(gecko.id, nextPos, end);
                                const state = newBoard.serialize();

                                if (!visited.has(state)) {
                                    visited.add(state);
                                    const baseScore = this.evaluateBoard(newBoard);
                                    // Add randomness to encourage exploration
                                    const randomFactor = 1 + (Math.random() - 0.5) * this.randomness * 2;
                                    const adjustedScore = baseScore * randomFactor;

                                    successors.push({
                                        board: newBoard,
                                        moves: [...moves, { geckoId: gecko.id, pos: nextPos, end }],
                                        score: adjustedScore
                                    });
                                }
                            }
                        }
                    }
                }
            }

            if (successors.length === 0) break;

            // Sort by score (lower is better) and keep only top beamWidth
            successors.sort((a, b) => a.score - b.score);
            beam = successors.slice(0, this.beamWidth);
        }

        console.log(`Solver finished after ${iterations} iterations, visited ${visited.size} states`);
        return bestSolution;
    }
}
