// ═══════════════════════════════════════════════════════════
// Card War — TV-side game logic
// ═══════════════════════════════════════════════════════════

class WarGame {
    constructor(roomCode, players, container) {
        this.roomCode = roomCode;
        this.players = players;
        this.container = container;
        this.playerIds = Object.keys(players);
        this.decks = {};
        this.currentCards = {};
        this.round = 0;
        this.maxRounds = 15;
        this.listeners = [];

        this.suits = ['♠', '♥', '♦', '♣'];
        this.ranks = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
        this.rankValues = {};
        this.ranks.forEach((r, i) => this.rankValues[r] = i + 2);

        this.init();
    }

    init() {
        this.dealCards();
        this.render();
        this.startRound();
        this.listenForPlays();
    }

    createDeck() {
        const deck = [];
        for (const suit of this.suits) {
            for (const rank of this.ranks) {
                deck.push({ rank, suit, value: this.rankValues[rank] });
            }
        }
        // Shuffle
        for (let i = deck.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [deck[i], deck[j]] = [deck[j], deck[i]];
        }
        return deck;
    }

    dealCards() {
        const deck = this.createDeck();
        const numPlayers = this.playerIds.length;
        const perPlayer = Math.floor(deck.length / numPlayers);

        this.playerIds.forEach((pid, idx) => {
            this.decks[pid] = deck.slice(idx * perPlayer, (idx + 1) * perPlayer);
        });
    }

    render() {
        const playerSlots = this.playerIds.map(pid => {
            const p = this.players[pid];
            return `
                <div class="flex-col" style="gap: 8px;">
                    <div class="playing-card face-down" id="war-card-${pid}">
                        <span style="font-size: 1.5rem; opacity: 0.3;">🂠</span>
                    </div>
                    <span style="font-size: 1.2rem;">${p.avatar}</span>
                    <span class="card-player-label" style="color: ${p.color}; font-weight: 700;">
                        ${p.name}
                    </span>
                    <span id="war-deck-${pid}" style="font-size: 0.7rem; color: var(--text-muted);">
                        ${this.decks[pid].length} cards
                    </span>
                </div>
            `;
        }).join('');

        this.container.innerHTML = `
            <div class="card-table">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 8px;">
                    <span style="font-size: 0.85rem; color: var(--text-muted);">
                        Round <strong id="war-round">1</strong> / ${this.maxRounds}
                    </span>
                </div>

                <div id="war-status" style="font-size: 1.1rem; color: var(--text-secondary); min-height: 32px; text-align: center;">
                    Waiting for players to play their cards...
                </div>

                <div class="card-pile" id="war-pile">
                    ${playerSlots}
                </div>

                <div id="war-result" style="font-size: 1.4rem; font-weight: 800; min-height: 48px; text-align: center; margin-top: 16px;">
                </div>
            </div>
        `;
    }

    startRound() {
        this.round++;
        if (this.round > this.maxRounds) {
            this.endWar();
            return;
        }

        this.currentCards = {};
        document.getElementById('war-round').textContent = this.round;
        document.getElementById('war-result').textContent = '';
        document.getElementById('war-status').textContent = 'Tap "Play Card" on your phone!';

        // Reset cards to face-down
        this.playerIds.forEach(pid => {
            const cardEl = document.getElementById(`war-card-${pid}`);
            if (cardEl) {
                cardEl.className = 'playing-card face-down';
                cardEl.innerHTML = '<span style="font-size: 1.5rem; opacity: 0.3;">🂠</span>';
            }
        });

        // Update game state
        updateGameState(this.roomCode, {
            phase: 'waiting',
            round: this.round,
            actions: null
        });
    }

    listenForPlays() {
        const actionsRef = getRoomRef(this.roomCode).child('gameState/actions');

        actionsRef.on('child_added', (snapshot) => {
            const data = snapshot.val();
            if (data.action?.type === 'war_play' && !this.currentCards[data.playerId]) {
                this.playerPlayed(data.playerId);

                // Check if all played
                if (Object.keys(this.currentCards).length >= this.playerIds.length) {
                    setTimeout(() => this.revealCards(), 500);
                }
            }
        });

        this.listeners.push({ ref: actionsRef, event: 'child_added' });
    }

    playerPlayed(playerId) {
        // Draw top card
        const deck = this.decks[playerId];
        if (!deck || deck.length === 0) return;

        const card = deck.shift();
        this.currentCards[playerId] = card;

        // Show face-down with a "played" state
        const cardEl = document.getElementById(`war-card-${playerId}`);
        if (cardEl) {
            cardEl.style.transform = 'scale(1.05)';
            cardEl.style.boxShadow = `0 0 20px ${this.players[playerId].color}44`;
        }

        // Update deck count
        const deckCount = document.getElementById(`war-deck-${playerId}`);
        if (deckCount) deckCount.textContent = `${deck.length} cards`;

        document.getElementById('war-status').textContent =
            `${Object.keys(this.currentCards).length} / ${this.playerIds.length} played`;
    }

    revealCards() {
        updateGameState(this.roomCode, { phase: 'reveal' });
        document.getElementById('war-status').textContent = '';

        // Flip cards with animation
        let delay = 0;
        this.playerIds.forEach(pid => {
            setTimeout(() => {
                const card = this.currentCards[pid];
                if (!card) return;

                const cardEl = document.getElementById(`war-card-${pid}`);
                if (!cardEl) return;

                const isRed = card.suit === '♥' || card.suit === '♦';
                cardEl.className = `playing-card face-up${isRed ? ' red' : ''}`;
                cardEl.style.transform = '';
                cardEl.style.boxShadow = '';
                cardEl.innerHTML = `
                    <span style="font-size: 2.5rem; font-weight: 800;">${card.rank}</span>
                    <span class="card-suit" style="font-size: 1.5rem;">${card.suit}</span>
                `;

                // Flip animation
                cardEl.style.animation = 'none';
                cardEl.offsetHeight; // trigger reflow
                cardEl.style.animation = 'cardFlipIn 0.4s ease-out';
            }, delay);
            delay += 300;
        });

        // Determine winner after all reveals
        setTimeout(() => {
            this.determineRoundWinner();
        }, delay + 500);
    }

    determineRoundWinner() {
        let highestValue = -1;
        let winnerId = null;
        let isTie = false;

        this.playerIds.forEach(pid => {
            const card = this.currentCards[pid];
            if (!card) return;

            if (card.value > highestValue) {
                highestValue = card.value;
                winnerId = pid;
                isTie = false;
            } else if (card.value === highestValue) {
                isTie = true;
            }
        });

        const resultEl = document.getElementById('war-result');

        if (isTie) {
            resultEl.textContent = '⚔️ WAR! It\'s a tie!';
            resultEl.style.color = 'var(--neon-orange)';
        } else if (winnerId) {
            const winner = this.players[winnerId];
            resultEl.innerHTML = `${winner.avatar} <span style="color: ${winner.color}">${winner.name}</span> wins the round!`;

            // Award points
            const points = Object.keys(this.currentCards).length * 10;
            winner.score = (winner.score || 0) + points;
            updateScoreDisplay(winnerId, winner.score);
            renderScoreboard();

            // Winner card glow
            const cardEl = document.getElementById(`war-card-${winnerId}`);
            if (cardEl) {
                cardEl.style.boxShadow = `0 0 30px ${winner.color}66`;
                cardEl.style.transform = 'scale(1.1)';
            }
        }

        // Next round after delay
        setTimeout(() => {
            this.startRound();
        }, 3000);
    }

    endWar() {
        this.cleanup();
        endGame();
    }

    cleanup() {
        this.listeners.forEach(l => l.ref.off(l.event));
        this.listeners = [];
    }
}

// Add CSS animation
const warStyle = document.createElement('style');
warStyle.textContent = `
    @keyframes cardFlipIn {
        0% { transform: rotateY(90deg) scale(0.9); }
        100% { transform: rotateY(0) scale(1); }
    }
`;
document.head.appendChild(warStyle);
