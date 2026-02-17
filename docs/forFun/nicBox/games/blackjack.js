// ═══════════════════════════════════════════════════════════
// Blackjack — TV-side game logic
// All players play against the Dealer (house)
// ═══════════════════════════════════════════════════════════

class BlackjackGame {
    constructor(roomCode, players, container) {
        this.roomCode = roomCode;
        this.players = players;
        this.container = container;
        this.playerIds = Object.keys(players);
        this.listeners = [];

        this.suits = ['♠', '♥', '♦', '♣'];
        this.ranks = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];

        this.shoe = [];          // card shoe (multiple decks)
        this.dealerHand = [];
        this.playerHands = {};   // pid -> { cards:[], standing:bool, busted:bool }
        this.round = 0;
        this.maxRounds = 5;
        this.phase = 'betting';  // betting | playerTurn | dealerTurn | payout

        this.currentPlayerTurnIndex = 0;

        this.init();
    }

    // ── Setup ──────────────────────────────────────────────

    init() {
        this.buildShoe(4); // 4-deck shoe
        this.render();
        this.listenForActions();
        this.startRound();
    }

    buildShoe(numDecks) {
        this.shoe = [];
        for (let d = 0; d < numDecks; d++) {
            for (const suit of this.suits) {
                for (const rank of this.ranks) {
                    this.shoe.push({ rank, suit });
                }
            }
        }
        // Shuffle (Fisher-Yates)
        for (let i = this.shoe.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.shoe[i], this.shoe[j]] = [this.shoe[j], this.shoe[i]];
        }
    }

    drawCard() {
        if (this.shoe.length === 0) this.buildShoe(4);
        return this.shoe.pop();
    }

    cardValue(card) {
        if (['J', 'Q', 'K'].includes(card.rank)) return 10;
        if (card.rank === 'A') return 11; // soft ace handled in handValue
        return parseInt(card.rank);
    }

    handValue(cards) {
        let total = 0;
        let aces = 0;
        for (const c of cards) {
            total += this.cardValue(c);
            if (c.rank === 'A') aces++;
        }
        while (total > 21 && aces > 0) {
            total -= 10;
            aces--;
        }
        return total;
    }

    isRed(card) {
        return card.suit === '♥' || card.suit === '♦';
    }

    // ── Render ─────────────────────────────────────────────

    render() {
        this.container.innerHTML = `
            <div class="card-table" style="max-width: 900px; width: 100%;">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 4px;">
                    <span style="font-size: 0.85rem; color: var(--text-muted);">
                        Round <strong id="bj-round">1</strong> / ${this.maxRounds}
                    </span>
                </div>

                <!-- Dealer hand -->
                <div id="bj-dealer-area" class="bj-area">
                    <div class="bj-area-label">🎩 Dealer</div>
                    <div class="bj-hand" id="bj-dealer-hand"></div>
                    <div class="bj-total" id="bj-dealer-total"></div>
                </div>

                <div id="bj-status" class="bj-status-msg"></div>

                <!-- Player hands -->
                <div id="bj-players-area" class="bj-players-row"></div>
            </div>
        `;
    }

    renderHands(revealDealer = false) {
        // Dealer
        const dealerHandEl = document.getElementById('bj-dealer-hand');
        const dealerTotalEl = document.getElementById('bj-dealer-total');
        if (dealerHandEl) {
            dealerHandEl.innerHTML = this.dealerHand.map((card, i) => {
                if (i === 1 && !revealDealer) {
                    return this.renderCardHTML(null, true); // hole card
                }
                return this.renderCardHTML(card);
            }).join('');
        }
        if (dealerTotalEl) {
            if (revealDealer) {
                const val = this.handValue(this.dealerHand);
                dealerTotalEl.textContent = val;
                dealerTotalEl.className = `bj-total ${val > 21 ? 'bust' : val === 21 ? 'blackjack' : ''}`;
            } else {
                const firstCard = this.dealerHand[0];
                dealerTotalEl.textContent = firstCard ? this.cardValue(firstCard) + ' + ?' : '';
                dealerTotalEl.className = 'bj-total';
            }
        }

        // Players
        const playersArea = document.getElementById('bj-players-area');
        if (!playersArea) return;
        playersArea.innerHTML = '';

        this.playerIds.forEach((pid, idx) => {
            const p = this.players[pid];
            const hand = this.playerHands[pid];
            if (!hand) return;

            const val = this.handValue(hand.cards);
            const isActive = this.phase === 'playerTurn' && idx === this.currentPlayerTurnIndex;
            const statusText = hand.busted ? '💥 BUST' :
                hand.standing ? '✋ STAND' :
                    val === 21 ? '🎯 21!' : '';

            const div = document.createElement('div');
            div.className = `bj-player-slot ${isActive ? 'active' : ''} ${hand.busted ? 'busted' : ''}`;
            div.style.borderColor = isActive ? p.color : 'transparent';
            div.innerHTML = `
                <div class="bj-player-info">
                    <span>${p.avatar}</span>
                    <span style="color: ${p.color}; font-weight: 700; font-size: 0.85rem;">${p.name}</span>
                </div>
                <div class="bj-hand">
                    ${hand.cards.map(c => this.renderCardHTML(c, false, true)).join('')}
                </div>
                <div class="bj-total ${hand.busted ? 'bust' : val === 21 ? 'blackjack' : ''}">${val}</div>
                ${statusText ? `<div class="bj-hand-status">${statusText}</div>` : ''}
            `;
            playersArea.appendChild(div);
        });
    }

    renderCardHTML(card, faceDown = false, small = false) {
        const w = small ? 60 : 80;
        const h = small ? 85 : 115;
        const fs = small ? '1.4rem' : '2rem';
        const suitFs = small ? '0.8rem' : '1.1rem';

        if (faceDown) {
            return `<div class="bj-card face-down" style="width:${w}px;height:${h}px;">
                <span style="font-size:${fs};opacity:0.3;">🂠</span>
            </div>`;
        }

        const red = this.isRed(card);
        return `<div class="bj-card face-up ${red ? 'red' : ''}" style="width:${w}px;height:${h}px;">
            <span style="font-size:${fs};font-weight:800;">${card.rank}</span>
            <span style="font-size:${suitFs};">${card.suit}</span>
        </div>`;
    }

    setStatus(msg) {
        const el = document.getElementById('bj-status');
        if (el) el.innerHTML = msg;
    }

    // ── Game Flow ──────────────────────────────────────────

    startRound() {
        this.round++;
        if (this.round > this.maxRounds) {
            this.endBlackjack();
            return;
        }

        document.getElementById('bj-round').textContent = this.round;

        // Reset
        this.dealerHand = [];
        this.playerHands = {};
        this.currentPlayerTurnIndex = 0;

        this.playerIds.forEach(pid => {
            this.playerHands[pid] = { cards: [], standing: false, busted: false };
        });

        // Deal 2 cards to each player and dealer
        for (let i = 0; i < 2; i++) {
            this.playerIds.forEach(pid => {
                this.playerHands[pid].cards.push(this.drawCard());
            });
            this.dealerHand.push(this.drawCard());
        }

        this.phase = 'playerTurn';
        this.renderHands(false);
        this.promptCurrentPlayer();
    }

    promptCurrentPlayer() {
        // Skip players who are done
        while (this.currentPlayerTurnIndex < this.playerIds.length) {
            const pid = this.playerIds[this.currentPlayerTurnIndex];
            const hand = this.playerHands[pid];
            const val = this.handValue(hand.cards);

            if (val === 21) {
                hand.standing = true; // natural 21
                this.currentPlayerTurnIndex++;
                continue;
            }
            break;
        }

        if (this.currentPlayerTurnIndex >= this.playerIds.length) {
            // All players done -> dealer turn
            this.dealerTurn();
            return;
        }

        const pid = this.playerIds[this.currentPlayerTurnIndex];
        const p = this.players[pid];

        this.setStatus(`${p.avatar} <span style="color:${p.color};font-weight:700;">${p.name}</span> — Hit or Stand?`);

        // Notify phone
        updateGameState(this.roomCode, {
            phase: 'playerTurn',
            activePlayer: pid,
            actions: null
        });

        this.renderHands(false);
    }

    handleHit(playerId) {
        const pid = this.playerIds[this.currentPlayerTurnIndex];
        if (playerId !== pid) return;

        const hand = this.playerHands[pid];
        hand.cards.push(this.drawCard());
        const val = this.handValue(hand.cards);

        if (val > 21) {
            hand.busted = true;
            this.setStatus(`${this.players[pid].avatar} 💥 BUST! (${val})`);
            this.renderHands(false);

            setTimeout(() => {
                this.currentPlayerTurnIndex++;
                this.promptCurrentPlayer();
            }, 1500);
        } else if (val === 21) {
            hand.standing = true;
            this.setStatus(`${this.players[pid].avatar} 🎯 21!`);
            this.renderHands(false);

            setTimeout(() => {
                this.currentPlayerTurnIndex++;
                this.promptCurrentPlayer();
            }, 1000);
        } else {
            this.renderHands(false);
            // Notify phone again for another action
            updateGameState(this.roomCode, {
                phase: 'playerTurn',
                activePlayer: pid,
                actions: null
            });
        }
    }

    handleStand(playerId) {
        const pid = this.playerIds[this.currentPlayerTurnIndex];
        if (playerId !== pid) return;

        const hand = this.playerHands[pid];
        hand.standing = true;

        this.renderHands(false);

        this.currentPlayerTurnIndex++;
        this.promptCurrentPlayer();
    }

    async dealerTurn() {
        this.phase = 'dealerTurn';
        updateGameState(this.roomCode, { phase: 'dealerTurn', activePlayer: null });

        this.setStatus('🎩 Dealer reveals...');
        this.renderHands(true);

        // Dealer draws to 17
        const step = () => {
            return new Promise(resolve => {
                setTimeout(() => {
                    if (this.handValue(this.dealerHand) < 17) {
                        this.dealerHand.push(this.drawCard());
                        this.renderHands(true);
                        const val = this.handValue(this.dealerHand);
                        if (val > 21) {
                            this.setStatus('🎩 Dealer BUSTS! 💥');
                        } else {
                            this.setStatus(`🎩 Dealer draws... (${val})`);
                        }
                        resolve(this.handValue(this.dealerHand) < 17);
                    } else {
                        resolve(false);
                    }
                }, 1200);
            });
        };

        let keepDrawing = true;
        while (keepDrawing) {
            keepDrawing = await step();
        }

        setTimeout(() => this.payout(), 1500);
    }

    payout() {
        this.phase = 'payout';
        const dealerVal = this.handValue(this.dealerHand);
        const dealerBust = dealerVal > 21;
        const results = [];

        this.playerIds.forEach(pid => {
            const hand = this.playerHands[pid];
            const val = this.handValue(hand.cards);
            const p = this.players[pid];
            let result = '';
            let points = 0;

            if (hand.busted) {
                result = 'lose';
            } else if (dealerBust) {
                result = 'win';
                points = val === 21 && hand.cards.length === 2 ? 30 : 20; // blackjack bonus
            } else if (val > dealerVal) {
                result = 'win';
                points = val === 21 && hand.cards.length === 2 ? 30 : 20;
            } else if (val === dealerVal) {
                result = 'push';
                points = 5;
            } else {
                result = 'lose';
            }

            if (points > 0) {
                p.score = (p.score || 0) + points;
                updateScoreDisplay(pid, p.score);
            }

            results.push({ pid, name: p.name, avatar: p.avatar, color: p.color, result, val, points });
        });

        renderScoreboard();

        // Show results summary
        const summaryHTML = results.map(r => {
            const icon = r.result === 'win' ? '✅' : r.result === 'push' ? '➖' : '❌';
            const label = r.result === 'win' ? 'WIN' : r.result === 'push' ? 'PUSH' : 'LOSE';
            return `<span style="display:inline-flex;align-items:center;gap:4px;padding:4px 12px;
                    border-radius:999px;background:${r.color}22;border:1px solid ${r.color}44;
                    font-size:0.85rem;">${r.avatar} ${icon} ${label}${r.points ? ` +${r.points}` : ''}</span>`;
        }).join(' ');

        this.setStatus(summaryHTML);

        // Next round
        setTimeout(() => {
            this.startRound();
        }, 4000);
    }

    // ── Actions Listener ───────────────────────────────────

    listenForActions() {
        const actionsRef = getRoomRef(this.roomCode).child('gameState/actions');

        actionsRef.on('child_added', (snapshot) => {
            const data = snapshot.val();
            if (!data.action) return;

            if (data.action.type === 'blackjack_hit') {
                this.handleHit(data.playerId);
            } else if (data.action.type === 'blackjack_stand') {
                this.handleStand(data.playerId);
            }
        });

        this.listeners.push({ ref: actionsRef, event: 'child_added' });
    }

    // ── End ────────────────────────────────────────────────

    endBlackjack() {
        this.cleanup();
        endGame();
    }

    cleanup() {
        this.listeners.forEach(l => l.ref.off(l.event));
        this.listeners = [];
    }
}

// ── Inject Blackjack-specific styles ───────────────────────

const bjStyle = document.createElement('style');
bjStyle.textContent = `
    .bj-area {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
        padding: 16px;
        border-radius: 16px;
        background: rgba(0, 80, 0, 0.25);
        border: 1px solid rgba(0, 180, 0, 0.15);
        width: 100%;
    }
    .bj-area-label {
        font-size: 0.85rem;
        color: var(--text-secondary);
        font-weight: 600;
        letter-spacing: 1px;
        text-transform: uppercase;
    }
    .bj-hand {
        display: flex;
        gap: 6px;
        flex-wrap: wrap;
        justify-content: center;
    }
    .bj-card {
        border-radius: 10px;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        box-shadow: 0 4px 15px rgba(0,0,0,0.35);
        transition: transform 300ms var(--ease-out);
        animation: bjCardDeal 0.35s ease-out;
    }
    .bj-card.face-up {
        background: white;
        color: #1a1a2e;
        border: 2px solid rgba(0,0,0,0.08);
    }
    .bj-card.face-up.red { color: #d32f2f; }
    .bj-card.face-down {
        background: linear-gradient(135deg, #1a6b1a, #0d4d0d);
        border: 2px solid rgba(255,255,255,0.08);
    }
    @keyframes bjCardDeal {
        0% { transform: translateY(-30px) scale(0.8) rotateY(60deg); opacity: 0; }
        100% { transform: translateY(0) scale(1) rotateY(0); opacity: 1; }
    }
    .bj-total {
        font-family: 'Press Start 2P', monospace;
        font-size: 0.9rem;
        color: var(--text-primary);
        min-width: 40px;
        text-align: center;
    }
    .bj-total.bust { color: var(--neon-pink); }
    .bj-total.blackjack { color: var(--neon-green); }
    .bj-status-msg {
        text-align: center;
        font-size: 1rem;
        color: var(--text-secondary);
        padding: 12px 0;
        min-height: 40px;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 8px;
        flex-wrap: wrap;
    }
    .bj-players-row {
        display: flex;
        gap: 16px;
        flex-wrap: wrap;
        justify-content: center;
        width: 100%;
    }
    .bj-player-slot {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 6px;
        padding: 12px;
        border-radius: 14px;
        background: var(--bg-glass);
        border: 2px solid transparent;
        min-width: 130px;
        transition: all 300ms ease;
    }
    .bj-player-slot.active {
        box-shadow: 0 0 20px rgba(0, 212, 255, 0.2);
    }
    .bj-player-slot.busted {
        opacity: 0.5;
    }
    .bj-player-info {
        display: flex;
        align-items: center;
        gap: 6px;
    }
    .bj-hand-status {
        font-size: 0.75rem;
        font-weight: 700;
    }
`;
document.head.appendChild(bjStyle);
