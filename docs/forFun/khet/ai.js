// Khet AI - Monte Carlo Tree Search with Neural Network guidance
import { KhetGame, COLS, ROWS, PLAYER, PIECE_TYPE, DIR } from './engine.js';

// =========================================
// Evaluation weights (heuristic fallback)
// =========================================
const DEFAULT_WEIGHTS = {
    pyramidValue: 12,
    scarabValue: 25,
    anubisValue: 18,
    pharaohDefenders: 8,
    pharaohExposure: -15,
    pharaohEdgePenalty: -5,
    laserThreatPharaoh: -200,
    laserThreatPiece: -8,
    laserAttackPharaoh: 200,
    laserAttackPiece: 8,
    centerControl: 2,
    pyramidOrientation: 3,
    mirrorChain: 5,
    materialAdvantage: 15,
};

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
    constructor(difficulty = 'medium', nn = null) {
        this.weights = { ...DEFAULT_WEIGHTS };
        this.difficulty = difficulty;
        this.mctsIterations = {
            easy: 200,
            medium: 800,
            hard: 2000,
            brutal: 5000
        }[difficulty] || 800;

        this.nn = nn; // KhetNN instance (or null for heuristic-only mode)
        this.transpositionTable = new Map();
        this.maxTableSize = 50000;
        this.loadWeights();
    }

    get useNN() {
        return this.nn && this.nn.loaded;
    }

    // ========================
    // MCTS Implementation
    // ========================

    chooseMove(game) {
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
            // Find moves that prevent opponent from winning
            defensiveMoves = [];
            for (const move of moves) {
                const g = game.clone();
                g.applyMove(move);
                g.resolveLaserHit?.();
                if (g.winner !== null) {
                    defensiveMoves.push(move); // We win — best defense!
                    continue;
                }
                // After our move, can opponent still win in one?
                if (!this._canPlayerWinInOneMove(g, 1 - game.currentPlayer)) {
                    defensiveMoves.push(move);
                }
            }
            // If we found blocking moves, restrict search to those
            if (defensiveMoves.length > 0) {
                console.log(`AI: ${defensiveMoves.length}/${moves.length} moves block opponent threat`);
            } else {
                defensiveMoves = null; // No good defense, search all moves
            }
        }

        const searchMoves = defensiveMoves || moves;

        const rootNode = new MCTSNode(null, null, game.currentPlayer);

        // Expand root with NN priors if available
        if (this.useNN) {
            this._expandWithNN(rootNode, game, searchMoves);
        }

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
        // Only works when it's that player's turn
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

        // Selection: traverse using UCB with NN priors
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
            if (this.useNN) {
                this._expandWithNN(node, game, moves);
            } else {
                node.expand(moves);
            }
            if (node.children.length > 0) {
                node = node.children[Math.floor(Math.random() * node.children.length)];
                path.push(node);
                game.applyMove(node.move);
                game.resolveLaserHit?.();
            }
        }

        // Simulation / Evaluation
        let score;
        if (game.winner !== null) {
            score = game.winner === rootNode.player ? 1.0 : 0.0;
        } else if (this.useNN) {
            // Use NN value head instead of rollout
            const boardTensor = this.nn.encodeBoard(game);
            const { value } = this.nn.forward(boardTensor);
            // value is from current player's perspective
            // We need it from root player's perspective
            if (game.currentPlayer === rootNode.player) {
                score = (value + 1) / 2; // Map [-1,1] to [0,1]
            } else {
                score = (-value + 1) / 2;
            }
        } else {
            score = this.rollout(game, rootNode.player);
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
        const logParentVisits = Math.log(node.visits + 1);
        const sqrtParent = Math.sqrt(node.visits + 1);

        for (const child of node.children) {
            let ucb;
            if (child.visits === 0) {
                // With NN priors, unvisited nodes with high prior get priority
                ucb = child.prior > 0 ?
                    C_PUCT * child.prior * sqrtParent + 1000 :
                    Infinity;
            } else {
                const exploitation = child.totalValue / child.visits;
                if (child.prior > 0) {
                    // AlphaZero-style PUCT
                    const exploration = C_PUCT * child.prior * sqrtParent / (1 + child.visits);
                    ucb = exploitation + exploration;
                } else {
                    // Fallback UCB1
                    const exploration = 1.41 * Math.sqrt(logParentVisits / child.visits);
                    ucb = exploitation + exploration;
                }
            }
            if (ucb > bestScore) {
                bestScore = ucb;
                bestChild = child;
            }
        }
        return bestChild;
    }

    // ========================
    // Heuristic Rollout (fallback when no NN)
    // ========================

    rollout(game, player, maxDepth = 25) {
        const g = game.clone();
        for (let depth = 0; depth < maxDepth; depth++) {
            if (g.winner !== null) {
                return g.winner === player ? 1.0 : 0.0;
            }
            const moves = g.getLegalMoves();
            if (moves.length === 0) return 0.5;
            const move = this.selectRolloutMove(g, moves);
            g.applyMove(move);
            g.resolveLaserHit?.();
        }
        const evalScore = this.evaluate(g, player);
        return 1.0 / (1.0 + Math.exp(-evalScore / 50));
    }

    selectRolloutMove(game, moves) {
        // 30% of the time: semi-smart move selection
        if (Math.random() < 0.3 && moves.length > 3) {
            const sampleSize = Math.min(8, moves.length);
            let bestMove = null, bestScore = -Infinity;
            for (let i = 0; i < sampleSize; i++) {
                const move = moves[Math.floor(Math.random() * moves.length)];
                const g = game.clone();
                g.applyMove(move);
                g.resolveLaserHit?.();
                let score = Math.random() * 2;
                // Big bonus for capturing
                if (g.winner === game.currentPlayer) score += 10000;
                else if (g.lastHitPiece) {
                    score += g.lastHitPiece.type === PIECE_TYPE.PHARAOH ? 10000 : 80;
                }
                // Penalty if our pharaoh gets threatened next move
                // (quick check: trace opponent laser after our move)
                if (g.winner === null) {
                    const hitInfo = this._traceLaserForPlayer(g, 1 - game.currentPlayer);
                    if (hitInfo && hitInfo.piece.type === PIECE_TYPE.PHARAOH &&
                        hitInfo.piece.player === game.currentPlayer) {
                        score -= 5000;
                    }
                }
                if (score > bestScore) { bestScore = score; bestMove = move; }
            }
            return bestMove;
        }
        return moves[Math.floor(Math.random() * moves.length)];
    }

    // ========================
    // Laser Tracing Utility
    // ========================

    /** Trace a player's laser path WITHOUT modifying the board. Returns hit info or null. */
    _traceLaserForPlayer(game, player) {
        // Find sphinx
        let sphinx = null, sc, sr;
        for (let r = 0; r < ROWS && !sphinx; r++) {
            for (let c = 0; c < COLS && !sphinx; c++) {
                const p = game.getAt(c, r);
                if (p && p.type === PIECE_TYPE.SPHINX && p.player === player) {
                    sphinx = p; sc = c; sr = r;
                }
            }
        }
        if (!sphinx) return null;

        let lc = sc, lr = sr, dir = sphinx.facing;
        for (let step = 0; step < 200; step++) {
            lc += [0, 1, 0, -1][dir];
            lr += [1, 0, -1, 0][dir];
            if (lc < 0 || lc >= COLS || lr < 0 || lr >= ROWS) break;

            const piece = game.getAt(lc, lr);
            if (!piece) continue;

            const result = game.laserHit(piece, dir);
            if (result.action === 'reflect') {
                dir = result.newDir;
            } else if (result.action === 'destroy') {
                return { piece, col: lc, row: lr };
            } else { // block
                break;
            }
        }
        return null;
    }

    /** Get all pieces that the laser would hit if they were in the path. */
    _getLaserThreats(game, player) {
        const threats = [];
        let sphinx = null, sc, sr;
        for (let r = 0; r < ROWS && !sphinx; r++) {
            for (let c = 0; c < COLS && !sphinx; c++) {
                const p = game.getAt(c, r);
                if (p && p.type === PIECE_TYPE.SPHINX && p.player === player) {
                    sphinx = p; sc = c; sr = r;
                }
            }
        }
        if (!sphinx) return threats;

        let lc = sc, lr = sr, dir = sphinx.facing;
        for (let step = 0; step < 200; step++) {
            lc += [0, 1, 0, -1][dir];
            lr += [1, 0, -1, 0][dir];
            if (lc < 0 || lc >= COLS || lr < 0 || lr >= ROWS) break;

            const piece = game.getAt(lc, lr);
            if (!piece) {
                // Empty cell — laser passes. But enemies near this path are "near-threatened"
                threats.push({ col: lc, row: lr, dir, empty: true });
                continue;
            }

            const result = game.laserHit(piece, dir);
            if (result.action === 'reflect') {
                threats.push({ col: lc, row: lr, dir, piece, reflected: true });
                dir = result.newDir;
            } else if (result.action === 'destroy') {
                threats.push({ col: lc, row: lr, dir, piece, destroyed: true });
                break;
            } else { // block
                threats.push({ col: lc, row: lr, dir, piece, blocked: true });
                break;
            }
        }
        return threats;
    }

    // ========================
    // Evaluation Function
    // ========================

    evaluate(game, player) {
        if (game.winner === player) return 10000;
        if (game.winner === (1 - player)) return -10000;

        const w = this.weights;
        let score = 0;
        let myPieces = { pyramid: 0, scarab: 0, anubis: 0 };
        let oppPieces = { pyramid: 0, scarab: 0, anubis: 0 };
        let myPharaohPos = null, oppPharaohPos = null;

        for (let row = 0; row < ROWS; row++) {
            for (let col = 0; col < COLS; col++) {
                const piece = game.getAt(col, row);
                if (!piece) continue;
                const isMine = piece.player === player;
                const pieces = isMine ? myPieces : oppPieces;
                switch (piece.type) {
                    case PIECE_TYPE.PHARAOH:
                        if (isMine) myPharaohPos = { col, row };
                        else oppPharaohPos = { col, row };
                        break;
                    case PIECE_TYPE.PYRAMID:
                        pieces.pyramid++;
                        const distFromCenter = Math.abs(col - 4.5) + Math.abs(row - 3.5);
                        score += (isMine ? 1 : -1) * w.centerControl * (7 - distFromCenter);
                        break;
                    case PIECE_TYPE.SCARAB: pieces.scarab++; break;
                    case PIECE_TYPE.ANUBIS: pieces.anubis++; break;
                }
            }
        }

        // Material
        score += (myPieces.pyramid - oppPieces.pyramid) * w.pyramidValue;
        score += (myPieces.scarab - oppPieces.scarab) * w.scarabValue;
        score += (myPieces.anubis - oppPieces.anubis) * w.anubisValue;
        const totalMaterial = (myPieces.pyramid + myPieces.scarab + myPieces.anubis) -
            (oppPieces.pyramid + oppPieces.scarab + oppPieces.anubis);
        score += totalMaterial * w.materialAdvantage;

        // Pharaoh safety
        if (myPharaohPos) score += this.evaluatePharaohSafety(game, myPharaohPos, player, w);
        if (oppPharaohPos) score -= this.evaluatePharaohSafety(game, oppPharaohPos, 1 - player, w);

        // ---- Laser threat analysis ----
        // Our laser: what does it hit?
        const ourHit = this._traceLaserForPlayer(game, player);
        if (ourHit) {
            if (ourHit.piece.player !== player) {
                // We can destroy an enemy piece!
                if (ourHit.piece.type === PIECE_TYPE.PHARAOH) {
                    score += 5000; // Almost winning
                } else {
                    score += w.laserAttackPiece * 3;
                }
            } else {
                // Our own laser hits our own piece (bad!)
                if (ourHit.piece.type === PIECE_TYPE.PHARAOH) {
                    score -= 3000;
                } else {
                    score -= 20;
                }
            }
        }

        // Opponent's laser: what does it hit?
        const oppHit = this._traceLaserForPlayer(game, 1 - player);
        if (oppHit) {
            if (oppHit.piece.player === player) {
                // Opponent threatens our piece
                if (oppHit.piece.type === PIECE_TYPE.PHARAOH) {
                    score -= 5000; // We're about to lose!
                } else {
                    score -= w.laserThreatPiece * 3;
                }
            } else {
                // Opponent's laser hits their own piece (good for us)
                if (oppHit.piece.type === PIECE_TYPE.PHARAOH) {
                    score += 3000;
                } else {
                    score += 15;
                }
            }
        }

        // ---- 1-ply threat detection ----
        // Check if opponent can kill our pharaoh in one move (CRITICAL)
        if (myPharaohPos) {
            score += this._evaluateOneMoveThreats(game, player);
        }

        return score;
    }

    /** Check 1-move-ahead threats: can opponent destroy our pharaoh next? */
    _evaluateOneMoveThreats(game, player) {
        const opponent = 1 - player;
        // Check if it's opponent's turn and they can win
        if (game.currentPlayer === opponent) {
            const moves = game.getLegalMoves();
            const sampleSize = Math.min(moves.length, 30); // Sample for speed
            for (let i = 0; i < sampleSize; i++) {
                const move = i < sampleSize ? moves[i] : moves[Math.floor(Math.random() * moves.length)];
                const g = game.clone();
                g.applyMove(move);
                g.resolveLaserHit?.();
                if (g.winner === opponent) return -3000;
            }
        }
        return 0;
    }

    evaluatePharaohSafety(game, pharaohPos, player, w) {
        let safety = 0;
        const { col, row } = pharaohPos;
        let defenders = 0;
        let exposed = 0;
        let hasAnubisShield = false;

        for (let dr = -1; dr <= 1; dr++) {
            for (let dc = -1; dc <= 1; dc++) {
                if (dr === 0 && dc === 0) continue;
                const nc = col + dc, nr = row + dr;
                if (nc < 0 || nc >= COLS || nr < 0 || nr >= ROWS) continue;
                const piece = game.getAt(nc, nr);
                if (piece && piece.player === player) {
                    defenders++;
                    safety += w.pharaohDefenders;
                    // Anubis directly adjacent is very strong (blocks laser)
                    if (piece.type === PIECE_TYPE.ANUBIS) {
                        hasAnubisShield = true;
                        // Check if anubis is facing the right way to block
                        // Ideal: anubis faces AWAY from pharaoh (facing outward)
                        const idealFacing = this._directionFromTo(col, row, nc, nr);
                        if (piece.facing === idealFacing) {
                            safety += 15; // Well-positioned shield
                        } else {
                            safety += 5;
                        }
                    }
                    // Pyramid adjacent can redirect laser away
                    if (piece.type === PIECE_TYPE.PYRAMID) {
                        safety += 3;
                    }
                } else if (!piece) {
                    exposed++;
                    safety += w.pharaohExposure;
                }
            }
        }

        // Corner pharaoh (fewer exposed sides)
        const isCorner = (col === 0 || col === COLS - 1) && (row === 0 || row === ROWS - 1);
        if (isCorner) {
            safety += 10; // Fewer angles of attack
        } else if (col === 0 || col === COLS - 1 || row === 0 || row === ROWS - 1) {
            safety += w.pharaohEdgePenalty;
        }

        // Very exposed pharaoh is terrible
        if (defenders === 0) safety -= 30;
        if (exposed >= 5) safety -= 20;

        return safety;
    }

    /** Get cardinal direction from (c1,r1) toward (c2,r2). */
    _directionFromTo(c1, r1, c2, r2) {
        const dc = c2 - c1, dr = r2 - r1;
        if (dr > 0) return DIR.N;     // N increases row
        if (dr < 0) return DIR.S;
        if (dc > 0) return DIR.E;
        return DIR.W;
    }

    // ========================
    // Self-Play Training (in-browser, heuristic-based)
    // ========================

    async trainSelfPlay(numGames = 100, onProgress = null) {
        const results = { silver_wins: 0, red_wins: 0, total_moves: 0, training_data: [] };

        for (let gameNum = 0; gameNum < numGames; gameNum++) {
            const game = new KhetGame();
            const positions = [];
            let moveCount = 0;

            while (game.winner === null && moveCount < 300) {
                const boardState = this.extractFeatures(game);
                const move = this.chooseMoveWithExploration(game, 0.3);
                if (!move) break;
                positions.push({ features: boardState, player: game.currentPlayer, move });
                game.applyMove(move);
                game.resolveLaserHit?.();
                moveCount++;
            }

            const outcome = game.winner;
            for (const pos of positions) {
                let value;
                if (outcome === null) value = 0;
                else if (outcome === pos.player) value = 1;
                else value = -1;
                results.training_data.push({ features: pos.features, value });
            }

            if (outcome === PLAYER.SILVER) results.silver_wins++;
            else if (outcome === PLAYER.RED) results.red_wins++;
            results.total_moves += moveCount;

            if (onProgress) {
                onProgress({
                    game: gameNum + 1, total: numGames,
                    silver_wins: results.silver_wins, red_wins: results.red_wins,
                    avg_moves: results.total_moves / (gameNum + 1)
                });
            }

            if ((gameNum + 1) % 10 === 0 && results.training_data.length > 0) {
                this.updateWeights(results.training_data);
                results.training_data = [];
            }
            await new Promise(r => setTimeout(r, 0));
        }

        if (results.training_data.length > 0) this.updateWeights(results.training_data);
        this.saveWeights();
        return results;
    }

    chooseMoveWithExploration(game, explorationRate) {
        const moves = game.getLegalMoves();
        if (moves.length === 0) return null;
        if (Math.random() < explorationRate) {
            return moves[Math.floor(Math.random() * moves.length)];
        }
        const saved = this.mctsIterations;
        this.mctsIterations = 100;
        const move = this.chooseMove(game);
        this.mctsIterations = saved;
        return move;
    }

    extractFeatures(game) {
        const features = new Float32Array(80);
        let idx = 0;
        let counts = [0, 0, 0, 0, 0, 0, 0, 0];
        for (let row = 0; row < ROWS; row++) {
            for (let col = 0; col < COLS; col++) {
                const piece = game.getAt(col, row);
                if (!piece) continue;
                const offset = piece.player * 4;
                switch (piece.type) {
                    case PIECE_TYPE.PYRAMID: counts[offset]++; break;
                    case PIECE_TYPE.SCARAB: counts[offset + 1]++; break;
                    case PIECE_TYPE.ANUBIS: counts[offset + 2]++; break;
                    case PIECE_TYPE.PHARAOH: counts[offset + 3]++; break;
                }
            }
        }
        for (let i = 0; i < 8; i++) features[idx++] = counts[i];
        for (let row = 0; row < ROWS; row++) {
            for (let col = 0; col < COLS; col++) {
                const piece = game.getAt(col, row);
                if (piece && piece.type === PIECE_TYPE.PHARAOH) {
                    features[idx++] = col / COLS;
                    features[idx++] = row / ROWS;
                }
            }
        }
        features[idx++] = game.currentPlayer;
        for (let player = 0; player < 2; player++) {
            for (let qr = 0; qr < 2; qr++) {
                for (let qc = 0; qc < 2; qc++) {
                    let count = 0;
                    for (let r = qr * 4; r < (qr + 1) * 4; r++) {
                        for (let c = qc * 5; c < (qc + 1) * 5; c++) {
                            const p = game.getAt(c, r);
                            if (p && p.player === player) count++;
                        }
                    }
                    features[idx++] = count / 20;
                }
            }
        }
        return features;
    }

    updateWeights(trainingData) {
        const lr = 0.01;
        const keys = Object.keys(this.weights);
        for (const key of keys) {
            let gradient = 0;
            const delta = 0.5;
            for (const sample of trainingData) {
                const current = this.evaluateFromFeatures(sample.features, this.weights);
                const currentPred = 1.0 / (1.0 + Math.exp(-current / 100));
                const target = (sample.value + 1) / 2;
                this.weights[key] += delta;
                const perturbed = this.evaluateFromFeatures(sample.features, this.weights);
                const perturbedPred = 1.0 / (1.0 + Math.exp(-perturbed / 100));
                this.weights[key] -= delta;
                const loss = (currentPred - target) ** 2;
                const perturbedLoss = (perturbedPred - target) ** 2;
                gradient += (perturbedLoss - loss) / delta;
            }
            gradient /= trainingData.length;
            this.weights[key] -= lr * gradient;
        }
    }

    evaluateFromFeatures(features, weights) {
        let score = 0;
        score += (features[0] - features[4]) * weights.pyramidValue;
        score += (features[1] - features[5]) * weights.scarabValue;
        score += (features[2] - features[6]) * weights.anubisValue;
        const myMaterial = features[0] + features[1] + features[2];
        const oppMaterial = features[4] + features[5] + features[6];
        score += (myMaterial - oppMaterial) * weights.materialAdvantage;
        return score;
    }

    // ========================
    // Persistence
    // ========================

    saveWeights() {
        try { localStorage.setItem('khet_ai_weights', JSON.stringify(this.weights)); }
        catch (e) { console.log('Could not save weights:', e); }
    }

    loadWeights() {
        try {
            const saved = localStorage.getItem('khet_ai_weights');
            if (saved) this.weights = { ...DEFAULT_WEIGHTS, ...JSON.parse(saved) };
        } catch (e) { console.log('Could not load weights:', e); }
    }

    resetWeights() {
        this.weights = { ...DEFAULT_WEIGHTS };
        this.saveWeights();
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

    expand(moves) {
        this.isExpanded = true;
        const uniformPrior = 1.0 / moves.length;
        for (const move of moves) {
            const child = new MCTSNode(this, move, 1 - this.player);
            child.prior = uniformPrior;
            this.children.push(child);
        }
    }

    get averageValue() {
        return this.visits > 0 ? this.totalValue / this.visits : 0;
    }
}
