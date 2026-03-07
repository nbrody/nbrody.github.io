// Khet AI - Monte Carlo Tree Search with Neural Network guidance
import { KhetGame, COLS, ROWS, PLAYER, PIECE_TYPE, DIR } from './engine.js';

// Move encoding — must match Python's Move.to_index()
function moveToIndex(move) {
    const base = move.row * COLS + move.col;
    if (move.type === 'rotate') {
        if (move.toFacing !== undefined) {
            return base * 12 + 8 + move.toFacing;
        }
        return base * 12 + (move.dir === 1 ? 9 : 8);
    }
    const dc = move.toCol - move.col;
    const dr = move.toRow - move.row;
    const dirMap = {
        '-1,-1': 0, '0,-1': 1, '1,-1': 2,
        '-1,0': 3, '1,0': 4,
        '-1,1': 5, '0,1': 6, '1,1': 7,
    };
    return base * 12 + (dirMap[`${dc},${dr}`] || 0);
}

// C_PUCT exploration constant
const C_PUCT = 1.5;

export class KhetAI {
    constructor(difficulty = 'medium', nn) {
        this.difficulty = difficulty;
        this.mctsIterations = {
            easy: 200,
            medium: 800,
            hard: 2000,
            brutal: 5000
        }[difficulty] || 800;
        this.nn = nn;
    }

    // ========================
    // MCTS Implementation
    // ========================

    chooseMove(game) {
        if (!this.nn || !this.nn.loaded) {
            console.warn('Neural network not loaded — cannot choose move');
            return null;
        }

        const moves = game.getLegalMoves();
        if (moves.length === 0) return null;
        if (moves.length === 1) return moves[0];

        // Check for immediate wins
        for (const move of moves) {
            const g = game.clone();
            g.applyMove(move);
            g.resolveLaserHit?.();
            if (g.winner === game.currentPlayer) return move;
        }

        // Check if opponent can win next move — filter to defensive moves if so
        let defensiveMoves = null;
        const opponentCanWin = this._canPlayerWinInOneMove(game, 1 - game.currentPlayer);
        if (opponentCanWin) {
            defensiveMoves = [];
            for (const move of moves) {
                const g = game.clone();
                g.applyMove(move);
                g.resolveLaserHit?.();
                if (g.winner !== null) {
                    defensiveMoves.push(move);
                    continue;
                }
                if (!this._canPlayerWinInOneMove(g, 1 - game.currentPlayer)) {
                    defensiveMoves.push(move);
                }
            }
            if (defensiveMoves.length > 0) {
                console.log(`AI: ${defensiveMoves.length}/${moves.length} moves block opponent threat`);
            } else {
                defensiveMoves = null;
            }
        }

        const searchMoves = defensiveMoves || moves;
        const rootNode = new MCTSNode(null, null, game.currentPlayer);
        this._expandWithNN(rootNode, game, searchMoves);

        for (let i = 0; i < this.mctsIterations; i++) {
            const gameCopy = game.clone();
            this.mctsIteration(rootNode, gameCopy, searchMoves);
        }

        // Select best move by visit count
        let bestVisits = -1;
        let bestMove = null;
        for (const child of rootNode.children) {
            if (child.visits > bestVisits) {
                bestVisits = child.visits;
                bestMove = child.move;
            }
        }
        return bestMove;
    }

    /** Check if the given player can win in a single move from this position. */
    _canPlayerWinInOneMove(game, player) {
        if (game.currentPlayer !== player) return false;
        const moves = game.getLegalMoves();
        for (const move of moves) {
            const g = game.clone();
            g.applyMove(move);
            g.resolveLaserHit?.();
            if (g.winner === player) return true;
        }
        return false;
    }

    mctsIteration(rootNode, game, legalMoves) {
        let node = rootNode;
        let path = [node];

        // Selection: traverse using PUCT with NN priors
        while (node.isExpanded && node.children.length > 0) {
            node = this.selectChild(node);
            path.push(node);
            game.applyMove(node.move);
            game.resolveLaserHit?.();
            if (game.winner !== null) break;
        }

        // Expansion
        if (game.winner === null && !node.isExpanded) {
            const moves = (node === rootNode) ? legalMoves : game.getLegalMoves();
            this._expandWithNN(node, game, moves);
            if (node.children.length > 0) {
                node = node.children[Math.floor(Math.random() * node.children.length)];
                path.push(node);
                game.applyMove(node.move);
                game.resolveLaserHit?.();
            }
        }

        // Evaluation via NN value head
        let score;
        if (game.winner !== null) {
            score = game.winner === rootNode.player ? 1.0 : 0.0;
        } else {
            const boardTensor = this.nn.encodeBoard(game);
            const { value } = this.nn.forward(boardTensor);
            // value is from current player's perspective — convert to root's perspective
            if (game.currentPlayer === rootNode.player) {
                score = (value + 1) / 2; // Map [-1,1] to [0,1]
            } else {
                score = (-value + 1) / 2;
            }
        }

        // Backpropagation
        for (const n of path) {
            n.visits++;
            n.totalValue += score;
        }
    }

    _expandWithNN(node, game, moves) {
        node.isExpanded = true;
        if (moves.length === 0) return;

        // Get NN policy priors
        const boardTensor = this.nn.encodeBoard(game);
        const { policy } = this.nn.forward(boardTensor);

        // Extract priors for legal moves
        let priors = [];
        let totalPrior = 0;
        for (const move of moves) {
            const idx = moveToIndex(move);
            const p = policy[idx] || 0;
            priors.push(p);
            totalPrior += p;
        }

        // Normalize
        if (totalPrior > 0) {
            priors = priors.map(p => p / totalPrior);
        } else {
            priors = priors.map(() => 1.0 / moves.length);
        }

        // Create children with priors
        for (let i = 0; i < moves.length; i++) {
            const child = new MCTSNode(node, moves[i], 1 - node.player);
            child.prior = priors[i];
            node.children.push(child);
        }
    }

    selectChild(node) {
        let bestScore = -Infinity;
        let bestChild = null;
        const sqrtParent = Math.sqrt(node.visits + 1);

        for (const child of node.children) {
            let ucb;
            if (child.visits === 0) {
                // Unvisited nodes with high prior get priority
                ucb = C_PUCT * child.prior * sqrtParent + 1000;
            } else {
                // AlphaZero-style PUCT
                const exploitation = child.totalValue / child.visits;
                const exploration = C_PUCT * child.prior * sqrtParent / (1 + child.visits);
                ucb = exploitation + exploration;
            }
            if (ucb > bestScore) {
                bestScore = ucb;
                bestChild = child;
            }
        }
        return bestChild;
    }
}

// ========================
// MCTS Node
// ========================

class MCTSNode {
    constructor(parent, move, player) {
        this.parent = parent;
        this.move = move;
        this.player = player;
        this.children = [];
        this.visits = 0;
        this.totalValue = 0;
        this.prior = 0; // NN policy prior
        this.isExpanded = false;
    }

    get averageValue() {
        return this.visits > 0 ? this.totalValue / this.visits : 0;
    }
}
