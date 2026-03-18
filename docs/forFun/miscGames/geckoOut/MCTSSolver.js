// Monte Carlo Tree Search Solver for Gecko Out
// Uses UCB1 for selection and DEPENDENCY-AWARE scoring

class MCTSNode {
    constructor(board, moves, parent = null) {
        this.board = board;
        this.moves = moves;
        this.parent = parent;
        this.children = [];
        this.visits = 0;
        this.score = 0;
        this.untriedMoves = null;
    }

    getPossibleMoves() {
        if (this.board.isSolved()) return [];

        const moves = [];
        for (const gecko of this.board.geckos) {
            for (const end of ['head', 'tail']) {
                const pos = end === 'head' ? gecko.head : gecko.tail;
                const neighbors = [
                    { r: pos.r - 1, c: pos.c },
                    { r: pos.r + 1, c: pos.c },
                    { r: pos.r, c: pos.c - 1 },
                    { r: pos.r, c: pos.c + 1 }
                ];
                for (const nextPos of neighbors) {
                    if (this.board.isValidMove(gecko.id, nextPos, end)) {
                        moves.push({ geckoId: gecko.id, pos: nextPos, end });
                    }
                }
            }
        }
        return moves;
    }

    ucb1(explorationConstant = 1.414) {
        if (this.visits === 0) return Infinity;
        const exploitation = this.score / this.visits;
        const exploration = explorationConstant * Math.sqrt(Math.log(this.parent.visits) / this.visits);
        return exploitation + exploration;
    }

    selectChild() {
        let best = null;
        let bestUcb = -Infinity;
        for (const child of this.children) {
            const ucb = child.ucb1();
            if (ucb > bestUcb) {
                bestUcb = ucb;
                best = child;
            }
        }
        return best;
    }

    expand() {
        if (this.untriedMoves === null) {
            this.untriedMoves = this.getPossibleMoves();
        }
        if (this.untriedMoves.length === 0) return null;

        const idx = Math.floor(Math.random() * this.untriedMoves.length);
        const move = this.untriedMoves.splice(idx, 1)[0];

        const newBoard = this.board.clone();
        newBoard.moveGecko(move.geckoId, move.pos, move.end);

        const child = new MCTSNode(newBoard, [...this.moves, move], this);
        this.children.push(child);
        return child;
    }

    isFullyExpanded() {
        if (this.untriedMoves === null) {
            this.untriedMoves = this.getPossibleMoves();
        }
        return this.untriedMoves.length === 0;
    }

    isTerminal() {
        return this.board.isSolved() || this.getPossibleMoves().length === 0;
    }
}

export class MCTSSolver {
    constructor(board, options = {}) {
        this.startBoard = board;
        this.maxIterations = options.maxIterations || 10000;
        this.maxRolloutDepth = options.maxRolloutDepth || 100;
        this.explorationConstant = options.explorationConstant || 1.414;

        // Analyze dependencies at start
        this.analyzeDependencies();
    }

    // Analyze which geckos can complete and which are blocked
    analyzeDependencies() {
        // Count how many geckos need each hole color
        this.holeUsage = {};
        this.countGeckosNeedingColor(this.startBoard, this.holeUsage);

        console.log('Hole usage analysis:', this.holeUsage);
    }

    // Recursively count geckos (including inner) that need each hole color
    countGeckosNeedingColor(board, usage) {
        for (const gecko of board.geckos) {
            this.countGeckoNeeds(gecko, usage);
        }
    }

    countGeckoNeeds(gecko, usage) {
        usage[gecko.color] = (usage[gecko.color] || 0) + 1;
        if (gecko.innerGecko) {
            this.countGeckoNeeds(gecko.innerGecko, usage);
        }
    }

    // Check if a gecko is "unblocked" (can enter holes)
    isUnblocked(gecko) {
        return !gecko.attachedHole;
    }

    // Calculate value of completing a gecko (considers what it unlocks)
    getCompletionValue(gecko, board) {
        let value = 100; // Base value

        // Extra value if this gecko has an inner gecko
        if (gecko.innerGecko) {
            value += 50;
            // Even more value if inner gecko's hole exists
            const innerHole = board.holes.find(h => h.color === gecko.innerGecko.color);
            if (innerHole) {
                value += 30;
                // Huge bonus if inner's hole is permanent (can be reused)
                if (innerHole.isPermanent) {
                    value += 100;
                }
            }
        }

        // Bonus if this gecko's hole is permanent (doesn't get used up)
        const myHole = board.holes.find(h => h.color === gecko.color);
        if (myHole && myHole.isPermanent) {
            value += 50;
        }

        // Penalty if gecko is blocked (has attached hole)
        if (gecko.attachedHole) {
            value -= 80; // Hard to complete, but moving it positions the attached hole
        }

        return value;
    }

    // DEPENDENCY-AWARE evaluation
    evaluate(board) {
        if (board.isSolved()) return 10000;

        const startGeckos = this.startBoard.geckos.length;
        const currentGeckos = board.geckos.length;
        const completedGeckos = startGeckos - currentGeckos;

        // Base score for completed geckos
        let score = completedGeckos * 200;

        // Evaluate each remaining gecko
        for (const gecko of board.geckos) {
            const hole = board.holes.find(h => h.color === gecko.color);
            if (!hole) continue; // No matching hole

            // Distance to hole (lower is better)
            const headDist = Math.abs(gecko.head.r - hole.r) + Math.abs(gecko.head.c - hole.c);
            const tailDist = Math.abs(gecko.tail.r - hole.r) + Math.abs(gecko.tail.c - hole.c);
            const dist = Math.min(headDist, tailDist);

            // Completion value affects how much we weight distance
            const completionValue = this.getCompletionValue(gecko, board);

            // Higher completion value = more reward for being close
            if (this.isUnblocked(gecko)) {
                // Unblocked geckos: reward proximity to their hole
                score += Math.max(0, (50 - dist * 2)) * (completionValue / 100);

                // BIG bonus if gecko is ON its matching hole (about to complete!)
                if (dist === 0) {
                    score += completionValue;
                }
            } else {
                // Blocked geckos: small reward for moving (positions attached hole)
                score += 5; // Just for existing, might be useful
            }
        }

        // Bonus for geckos that CAN complete (unblocked + hole exists)
        let readyToComplete = 0;
        for (const gecko of board.geckos) {
            if (this.isUnblocked(gecko)) {
                const hole = board.holes.find(h => h.color === gecko.color);
                if (hole) readyToComplete++;
            }
        }
        score += readyToComplete * 10;

        return score;
    }

    // Smarter rollout - prefers unblocked geckos moving toward holes
    rollout(node) {
        let board = node.board.clone();
        let depth = 0;

        while (!board.isSolved() && depth < this.maxRolloutDepth) {
            const allMoves = [];
            const goodMoves = []; // Moves that decrease distance for unblocked geckos

            for (const gecko of board.geckos) {
                const isUnblocked = !gecko.attachedHole;
                const hole = board.holes.find(h => h.color === gecko.color);

                for (const end of ['head', 'tail']) {
                    const pos = end === 'head' ? gecko.head : gecko.tail;
                    const neighbors = [
                        { r: pos.r - 1, c: pos.c },
                        { r: pos.r + 1, c: pos.c },
                        { r: pos.r, c: pos.c - 1 },
                        { r: pos.r, c: pos.c + 1 }
                    ];
                    for (const nextPos of neighbors) {
                        if (board.isValidMove(gecko.id, nextPos, end)) {
                            const move = { geckoId: gecko.id, pos: nextPos, end };
                            allMoves.push(move);

                            // Is this a "good" move?
                            if (isUnblocked && hole) {
                                const currentDist = Math.abs(pos.r - hole.r) + Math.abs(pos.c - hole.c);
                                const newDist = Math.abs(nextPos.r - hole.r) + Math.abs(nextPos.c - hole.c);
                                if (newDist < currentDist) {
                                    goodMoves.push(move);
                                }
                            }
                        }
                    }
                }
            }

            if (allMoves.length === 0) break;

            // 60% chance to pick a "good" move, 40% random
            let move;
            if (goodMoves.length > 0 && Math.random() < 0.6) {
                move = goodMoves[Math.floor(Math.random() * goodMoves.length)];
            } else {
                move = allMoves[Math.floor(Math.random() * allMoves.length)];
            }

            board.moveGecko(move.geckoId, move.pos, move.end);
            depth++;
        }

        return this.evaluate(board);
    }

    backpropagate(node, score) {
        while (node !== null) {
            node.visits++;
            node.score += score;
            node = node.parent;
        }
    }

    async solveAsync(onProgress = null) {
        const root = new MCTSNode(this.startBoard.clone(), []);
        let bestNode = root;
        let bestScore = -Infinity;

        for (let i = 0; i < this.maxIterations; i++) {
            if (i % 50 === 0) {
                await new Promise(resolve => setTimeout(resolve, 0));

                if (onProgress) {
                    let current = root;
                    while (current.children.length > 0) {
                        current = current.children.reduce((a, b) => a.visits > b.visits ? a : b);
                    }

                    onProgress({
                        iteration: i,
                        score: current.score / Math.max(1, current.visits),
                        geckos: current.board.geckos.length,
                        visited: root.visits,
                        beamSize: root.children.length,
                        bestBoard: current.board,
                        bestMoves: current.moves
                    });
                }
            }

            let node = root;
            while (node.isFullyExpanded() && node.children.length > 0) {
                node = node.selectChild();
            }

            if (!node.isTerminal() && !node.isFullyExpanded()) {
                node = node.expand();
                if (!node) continue;
            }

            const score = this.rollout(node);
            this.backpropagate(node, score);

            if (node.board.isSolved() && node.moves.length > 0) {
                if (bestNode === root || node.moves.length < bestNode.moves.length) {
                    bestNode = node;
                    bestScore = score;
                    console.log(`🎯 MCTS found solution with ${node.moves.length} moves at iteration ${i}!`);
                }
            }
        }

        console.log(`MCTS finished after ${this.maxIterations} iterations, root visits: ${root.visits}`);

        if (bestNode !== root && bestNode.board.isSolved()) {
            return bestNode.moves;
        }

        let current = root;
        while (current.children.length > 0) {
            current = current.children.reduce((a, b) => a.visits > b.visits ? a : b);
        }

        console.log(`Best path found: ${current.moves.length} moves, ${current.board.geckos.length} geckos remaining`);
        return null;
    }
}
