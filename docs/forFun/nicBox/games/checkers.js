// ═══════════════════════════════════════════════════════════
// Checkers — TV-side game logic
// ═══════════════════════════════════════════════════════════

class CheckersGame {
    constructor(roomCode, players, container) {
        this.roomCode = roomCode;
        this.players = players;
        this.container = container;
        this.playerIds = Object.keys(players).slice(0, 2); // Max 2 players
        this.board = [];
        this.selectedPiece = null;
        this.currentTurnIndex = 0;
        this.listeners = [];

        // Player color assignments
        this.colorMap = {};
        this.colorMap[this.playerIds[0]] = 'red';
        if (this.playerIds[1]) {
            this.colorMap[this.playerIds[1]] = 'black';
        }

        this.init();
    }

    init() {
        this.setupBoard();
        this.render();
        this.renderBoard();
        this.setTurn(0);
        this.listenForMoves();
    }

    setupBoard() {
        // 8x8 board, 0 = empty, 1 = red, 2 = black, 3 = red king, 4 = black king
        this.board = Array(8).fill(null).map(() => Array(8).fill(0));

        // Place red pieces (rows 0-2)
        for (let r = 0; r < 3; r++) {
            for (let c = 0; c < 8; c++) {
                if ((r + c) % 2 === 1) {
                    this.board[r][c] = 2; // black at top
                }
            }
        }
        // Place black pieces (rows 5-7)
        for (let r = 5; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                if ((r + c) % 2 === 1) {
                    this.board[r][c] = 1; // red at bottom
                }
            }
        }
    }

    render() {
        const playerInfo = this.playerIds.map((pid, i) => {
            const p = this.players[pid];
            const color = i === 0 ? 'Red' : 'Black';
            return `
                <div id="checkers-player-${pid}" style="display: flex; align-items: center; gap: 8px;
                     padding: 8px 16px; border-radius: 999px; background: var(--bg-glass);
                     border: 2px solid transparent; transition: all 300ms ease;">
                    <span>${p.avatar}</span>
                    <span style="font-weight: 700; color: ${p.color};">${p.name}</span>
                    <span style="font-size: 0.75rem; color: var(--text-muted);">(${color})</span>
                </div>
            `;
        }).join('<span style="color: var(--text-muted);">vs</span>');

        this.container.innerHTML = `
            <div class="flex-col" style="gap: 16px; width: 100%;">
                <div style="display: flex; align-items: center; gap: 16px; justify-content: center;">
                    ${playerInfo}
                </div>

                <div id="turn-indicator" style="text-align: center; font-size: 0.9rem; color: var(--text-secondary); min-height: 24px;">
                </div>

                <div class="checkers-board" id="checkers-board"></div>

                <div id="checkers-message" style="text-align: center; font-size: 1.1rem; font-weight: 600; min-height: 32px;">
                </div>
            </div>
        `;
    }

    renderBoard() {
        const boardEl = document.getElementById('checkers-board');
        if (!boardEl) return;
        boardEl.innerHTML = '';

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const cell = document.createElement('div');
                const isDark = (r + c) % 2 === 1;
                cell.className = `board-cell ${isDark ? 'dark' : 'light'}`;
                cell.dataset.row = r;
                cell.dataset.col = c;

                const piece = this.board[r][c];
                if (piece > 0) {
                    const pieceEl = document.createElement('div');
                    const isRed = piece === 1 || piece === 3;
                    const isKing = piece === 3 || piece === 4;
                    pieceEl.className = `checker-piece ${isRed ? 'red' : 'black'}${isKing ? ' king' : ''}`;
                    pieceEl.dataset.row = r;
                    pieceEl.dataset.col = c;

                    if (this.selectedPiece &&
                        this.selectedPiece.row === r &&
                        this.selectedPiece.col === c) {
                        pieceEl.classList.add('selected');
                    }

                    cell.appendChild(pieceEl);
                }

                boardEl.appendChild(cell);
            }
        }
    }

    setTurn(turnIndex) {
        this.currentTurnIndex = turnIndex;
        const pid = this.playerIds[turnIndex];
        const player = this.players[pid];

        document.getElementById('turn-indicator').innerHTML =
            `${player.avatar} <span style="color: ${player.color}; font-weight: 700;">${player.name}</span>'s turn`;

        // Highlight active player
        this.playerIds.forEach((id, i) => {
            const el = document.getElementById(`checkers-player-${id}`);
            if (el) {
                el.style.borderColor = i === turnIndex ? player.color : 'transparent';
                el.style.boxShadow = i === turnIndex ? `0 0 15px ${player.color}44` : 'none';
            }
        });

        // Calculate available moves and send to Firebase
        const moves = this.getAvailableMoves(turnIndex === 0 ? 1 : 2);
        const movesList = {};
        moves.forEach((m, i) => {
            movesList[i] = {
                from: `${String.fromCharCode(65 + m.fromCol)}${8 - m.fromRow}`,
                to: `${String.fromCharCode(65 + m.toCol)}${8 - m.toRow}`,
                capture: m.capture || false
            };
        });

        this.availableMoves = moves;

        updateGameState(this.roomCode, {
            currentTurn: pid,
            availableMoves: movesList,
            actions: null
        });
    }

    getAvailableMoves(pieceType) {
        const moves = [];
        const isRed = pieceType === 1 || pieceType === 3;
        const directions = [];

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const piece = this.board[r][c];
                if (piece === 0) continue;

                const pIsRed = piece === 1 || piece === 3;
                if (pIsRed !== isRed) continue;

                const isKing = piece === 3 || piece === 4;

                // Movement directions
                const dirs = [];
                if (isRed || isKing) dirs.push([-1, -1], [-1, 1]); // Red moves up
                if (!isRed || isKing) dirs.push([1, -1], [1, 1]); // Black moves down

                for (const [dr, dc] of dirs) {
                    const nr = r + dr;
                    const nc = c + dc;

                    if (nr < 0 || nr >= 8 || nc < 0 || nc >= 8) continue;

                    if (this.board[nr][nc] === 0) {
                        // Simple move
                        moves.push({ fromRow: r, fromCol: c, toRow: nr, toCol: nc, capture: false });
                    } else {
                        // Check jump
                        const jumpR = nr + dr;
                        const jumpC = nc + dc;
                        if (jumpR < 0 || jumpR >= 8 || jumpC < 0 || jumpC >= 8) continue;

                        const targetPiece = this.board[nr][nc];
                        const targetIsRed = targetPiece === 1 || targetPiece === 3;

                        if (targetPiece > 0 && targetIsRed !== isRed && this.board[jumpR][jumpC] === 0) {
                            moves.push({
                                fromRow: r, fromCol: c,
                                toRow: jumpR, toCol: jumpC,
                                captureRow: nr, captureCol: nc,
                                capture: true
                            });
                        }
                    }
                }
            }
        }

        // If captures exist, must capture (forced capture rule)
        const captures = moves.filter(m => m.capture);
        return captures.length > 0 ? captures : moves;
    }

    listenForMoves() {
        const actionsRef = getRoomRef(this.roomCode).child('gameState/actions');

        actionsRef.on('child_added', (snapshot) => {
            const data = snapshot.val();
            if (data.action?.type === 'checkers_move') {
                const pid = data.playerId;
                const turnPid = this.playerIds[this.currentTurnIndex];

                if (pid !== turnPid) return; // Not their turn

                const moveIndex = data.action.moveIndex;
                if (moveIndex >= 0 && moveIndex < this.availableMoves.length) {
                    this.executeMove(this.availableMoves[moveIndex]);
                }
            }
        });

        this.listeners.push({ ref: actionsRef, event: 'child_added' });
    }

    executeMove(move) {
        const piece = this.board[move.fromRow][move.fromCol];
        this.board[move.fromRow][move.fromCol] = 0;
        this.board[move.toRow][move.toCol] = piece;

        // Capture
        if (move.capture) {
            this.board[move.captureRow][move.captureCol] = 0;

            const currentPid = this.playerIds[this.currentTurnIndex];
            const p = this.players[currentPid];
            p.score = (p.score || 0) + 10;
            updateScoreDisplay(currentPid, p.score);
            renderScoreboard();

            document.getElementById('checkers-message').innerHTML =
                `<span style="color: var(--neon-pink);">Capture!</span>`;
        } else {
            document.getElementById('checkers-message').textContent = '';
        }

        // King promotion
        const isRed = piece === 1;
        const isBlack = piece === 2;
        if (isRed && move.toRow === 0) {
            this.board[move.toRow][move.toCol] = 3; // Red king
            document.getElementById('checkers-message').innerHTML =
                `<span style="color: var(--neon-yellow);">👑 Kinged!</span>`;
        }
        if (isBlack && move.toRow === 7) {
            this.board[move.toRow][move.toCol] = 4; // Black king
            document.getElementById('checkers-message').innerHTML =
                `<span style="color: var(--neon-yellow);">👑 Kinged!</span>`;
        }

        this.renderBoard();

        // Check win condition
        if (this.checkWin()) return;

        // Switch turn
        const nextTurn = (this.currentTurnIndex + 1) % this.playerIds.length;
        setTimeout(() => this.setTurn(nextTurn), 500);
    }

    checkWin() {
        let redCount = 0;
        let blackCount = 0;

        for (let r = 0; r < 8; r++) {
            for (let c = 0; c < 8; c++) {
                const p = this.board[r][c];
                if (p === 1 || p === 3) redCount++;
                if (p === 2 || p === 4) blackCount++;
            }
        }

        if (redCount === 0) {
            this.declareWinner(1);
            return true;
        }
        if (blackCount === 0) {
            this.declareWinner(0);
            return true;
        }

        return false;
    }

    declareWinner(playerIndex) {
        const winnerId = this.playerIds[playerIndex];
        const winner = this.players[winnerId];

        // Bonus points for winning
        winner.score = (winner.score || 0) + 50;
        updateScoreDisplay(winnerId, winner.score);

        document.getElementById('turn-indicator').innerHTML =
            `🎉 ${winner.avatar} <span style="color: ${winner.color}; font-weight: 700;">${winner.name}</span> wins!`;
        document.getElementById('checkers-message').innerHTML =
            `<span style="color: var(--neon-green); font-size: 1.5rem;">🏆 Victory!</span>`;

        setTimeout(() => {
            this.cleanup();
            endGame();
        }, 3000);
    }

    cleanup() {
        this.listeners.forEach(l => l.ref.off(l.event));
        this.listeners = [];
    }
}
