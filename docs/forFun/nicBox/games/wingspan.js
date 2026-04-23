// ═══════════════════════════════════════════════════════════
// Wingspan — TV-side game logic
// Engine-builder bird game (simplified clone)
// ═══════════════════════════════════════════════════════════

const WINGSPAN_BIRDS = [
    // Forest birds
    { id: 'b01', name: 'Barred Owl',      emoji: '🦉', habitat: 'forest', points: 5, power: null },
    { id: 'b02', name: 'Pileated Woodpecker', emoji: '🪵', habitat: 'forest', points: 4, power: 'draw:1' },
    { id: 'b03', name: 'Red Robin',       emoji: '🐦', habitat: 'forest', points: 2, power: 'egg:1' },
    { id: 'b04', name: 'Blue Jay',        emoji: '🪶', habitat: 'forest', points: 3, power: 'food:1' },
    { id: 'b05', name: 'Cardinal',        emoji: '🐥', habitat: 'forest', points: 3, power: 'egg:1' },
    { id: 'b06', name: 'Peregrine Falcon', emoji: '🪽', habitat: 'forest', points: 6, power: null },
    { id: 'b07', name: 'Chickadee',       emoji: '🐤', habitat: 'forest', points: 1, power: 'draw:1' },
    { id: 'b08', name: 'Sparrow Hawk',    emoji: '🦅', habitat: 'forest', points: 4, power: 'food:1' },

    // Grassland birds
    { id: 'b09', name: 'Meadowlark',      emoji: '🐦', habitat: 'grassland', points: 3, power: 'egg:2' },
    { id: 'b10', name: 'Bobolink',        emoji: '🐤', habitat: 'grassland', points: 2, power: 'egg:1' },
    { id: 'b11', name: 'Hen Harrier',     emoji: '🦅', habitat: 'grassland', points: 5, power: null },
    { id: 'b12', name: 'Barn Owl',        emoji: '🦉', habitat: 'grassland', points: 4, power: 'food:1' },
    { id: 'b13', name: 'Prairie Chicken', emoji: '🐔', habitat: 'grassland', points: 3, power: 'egg:2' },
    { id: 'b14', name: 'Ring Pheasant',   emoji: '🐓', habitat: 'grassland', points: 4, power: 'draw:1' },
    { id: 'b15', name: 'Vesper Sparrow',  emoji: '🐦', habitat: 'grassland', points: 2, power: 'egg:1' },
    { id: 'b16', name: 'Kestrel',         emoji: '🪶', habitat: 'grassland', points: 3, power: null },

    // Wetland birds
    { id: 'b17', name: 'Mallard',         emoji: '🦆', habitat: 'wetland', points: 3, power: 'draw:1' },
    { id: 'b18', name: 'Great Egret',     emoji: '🕊️', habitat: 'wetland', points: 5, power: null },
    { id: 'b19', name: 'Wood Duck',       emoji: '🦆', habitat: 'wetland', points: 4, power: 'draw:1' },
    { id: 'b20', name: 'Blue Heron',      emoji: '🪿', habitat: 'wetland', points: 6, power: null },
    { id: 'b21', name: 'Belted Kingfisher', emoji: '🐦', habitat: 'wetland', points: 3, power: 'food:1' },
    { id: 'b22', name: 'Canada Goose',    emoji: '🪿', habitat: 'wetland', points: 3, power: 'egg:1' },
    { id: 'b23', name: 'Snowy Egret',     emoji: '🕊️', habitat: 'wetland', points: 4, power: 'draw:1' },
    { id: 'b24', name: 'Sandpiper',       emoji: '🐤', habitat: 'wetland', points: 2, power: 'egg:1' },
];

const WINGSPAN_BIRDS_BY_ID = WINGSPAN_BIRDS.reduce((acc, b) => { acc[b.id] = b; return acc; }, {});

const WINGSPAN_ROUND_ACTIONS = [5, 4, 3];
const WINGSPAN_STARTING_FOOD = 3;
const WINGSPAN_STARTING_CARDS = 5;

class WingspanGame {
    constructor(roomCode, players, container) {
        this.roomCode = roomCode;
        this.players = players;
        this.container = container;
        this.playerIds = Object.keys(players).slice(0, 5);
        this.listeners = [];

        this.round = 0;
        this.turnIndex = 0;
        this.actionsRemaining = {};
        this.deck = [];
        this.hands = {};        // playerId -> Set of cardIds
        this.tableau = {};      // playerId -> { forest: [ids], grassland: [ids], wetland: [ids] }
        this.food = {};         // playerId -> number
        this.eggs = {};         // playerId -> number (eggs held across birds)
        this.finished = false;

        this.init();
    }

    init() {
        this.setupDeckAndDeal();
        this.render();
        this.startRound(1);
        this.listenForMoves();
    }

    setupDeckAndDeal() {
        // Shuffle full deck
        const ids = WINGSPAN_BIRDS.map(b => b.id);
        for (let i = ids.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [ids[i], ids[j]] = [ids[j], ids[i]];
        }
        this.deck = ids;

        // Deal to each player
        this.playerIds.forEach(pid => {
            this.hands[pid] = {};
            this.tableau[pid] = { forest: [], grassland: [], wetland: [] };
            this.food[pid] = WINGSPAN_STARTING_FOOD;
            this.eggs[pid] = 0;
            for (let i = 0; i < WINGSPAN_STARTING_CARDS; i++) {
                const cardId = this.deck.pop();
                if (cardId) this.hands[pid][cardId] = true;
            }
        });
    }

    render() {
        const playerTableaus = this.playerIds.map(pid => {
            const p = this.players[pid];
            return `
                <div class="wingspan-player" id="ws-player-${pid}"
                     style="border-color: ${p.color || 'transparent'};">
                    <div class="wingspan-player-header">
                        <span style="font-size: 1.3rem;">${p.avatar}</span>
                        <span style="font-weight: 700;">${escapeHtml(p.name)}</span>
                        <div class="wingspan-res">
                            <span title="Cards">🂠 <span id="ws-cards-${pid}">-</span></span>
                            <span title="Food">🍇 <span id="ws-food-${pid}">-</span></span>
                            <span title="Eggs">🥚 <span id="ws-eggs-${pid}">-</span></span>
                        </div>
                    </div>
                    <div class="wingspan-rows">
                        <div class="wingspan-row" data-habitat="forest">
                            <span class="wingspan-row-label">🌳</span>
                            <div class="wingspan-birds" id="ws-row-${pid}-forest"></div>
                        </div>
                        <div class="wingspan-row" data-habitat="grassland">
                            <span class="wingspan-row-label">🌾</span>
                            <div class="wingspan-birds" id="ws-row-${pid}-grassland"></div>
                        </div>
                        <div class="wingspan-row" data-habitat="wetland">
                            <span class="wingspan-row-label">🌊</span>
                            <div class="wingspan-birds" id="ws-row-${pid}-wetland"></div>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        this.container.innerHTML = `
            <div class="wingspan-game">
                <div class="wingspan-top">
                    <div id="wingspan-round-info" class="wingspan-round-info">Round 1</div>
                    <div id="wingspan-turn-info" class="wingspan-turn-info"></div>
                    <div id="wingspan-message" class="wingspan-message"></div>
                </div>
                <div class="wingspan-tableaus">
                    ${playerTableaus}
                </div>
            </div>
        `;

        this.renderAllTableaus();
    }

    renderAllTableaus() {
        this.playerIds.forEach(pid => this.renderTableau(pid));
    }

    renderTableau(pid) {
        ['forest', 'grassland', 'wetland'].forEach(habitat => {
            const rowEl = document.getElementById(`ws-row-${pid}-${habitat}`);
            if (!rowEl) return;
            rowEl.innerHTML = '';
            const birds = this.tableau[pid][habitat] || [];
            birds.forEach(cardId => {
                const bird = WINGSPAN_BIRDS_BY_ID[cardId];
                if (!bird) return;
                const card = document.createElement('div');
                card.className = 'wingspan-bird-mini';
                card.title = `${bird.name} — ${bird.points}pt`;
                card.innerHTML = `
                    <span class="wingspan-bird-emoji">${bird.emoji}</span>
                    <span class="wingspan-bird-pts">${bird.points}</span>
                `;
                rowEl.appendChild(card);
            });
        });

        // Update resource counters
        const cardsEl = document.getElementById(`ws-cards-${pid}`);
        const foodEl = document.getElementById(`ws-food-${pid}`);
        const eggsEl = document.getElementById(`ws-eggs-${pid}`);
        if (cardsEl) cardsEl.textContent = Object.keys(this.hands[pid] || {}).length;
        if (foodEl) foodEl.textContent = this.food[pid] || 0;
        if (eggsEl) eggsEl.textContent = this.eggs[pid] || 0;
    }

    startRound(roundNum) {
        this.round = roundNum;
        const actions = WINGSPAN_ROUND_ACTIONS[roundNum - 1];
        this.actionsRemaining = {};
        this.playerIds.forEach(pid => { this.actionsRemaining[pid] = actions; });
        this.turnIndex = 0;

        const roundInfo = document.getElementById('wingspan-round-info');
        if (roundInfo) roundInfo.textContent = `Round ${roundNum} of 3 — ${actions} actions each`;

        this.syncState();
        this.announceTurn();
    }

    announceTurn() {
        const pid = this.playerIds[this.turnIndex];
        if (!pid) return;
        const p = this.players[pid];
        const turnInfo = document.getElementById('wingspan-turn-info');
        if (turnInfo) {
            turnInfo.innerHTML = `${p.avatar} <span style="color:${p.color};font-weight:700;">
                ${escapeHtml(p.name)}</span>'s turn — ${this.actionsRemaining[pid]} action${this.actionsRemaining[pid] !== 1 ? 's' : ''} left`;
        }

        // Highlight active player's panel
        this.playerIds.forEach(id => {
            const el = document.getElementById(`ws-player-${id}`);
            if (!el) return;
            if (id === pid) {
                el.classList.add('active');
            } else {
                el.classList.remove('active');
            }
        });

        this.syncState();
    }

    syncState() {
        const pid = this.playerIds[this.turnIndex];
        const activeHand = {};
        Object.keys(this.hands[pid] || {}).forEach(cardId => {
            const bird = WINGSPAN_BIRDS_BY_ID[cardId];
            activeHand[cardId] = {
                name: bird.name,
                emoji: bird.emoji,
                habitat: bird.habitat,
                points: bird.points,
                power: bird.power || ''
            };
        });

        updateGameState(this.roomCode, {
            phase: 'turn',
            round: this.round,
            currentTurn: pid,
            actionsRemaining: this.actionsRemaining[pid] || 0,
            activeHand: Object.keys(activeHand).length ? activeHand : null,
            food: this.food[pid] || 0,
            eggs: this.eggs[pid] || 0,
            forestCount: (this.tableau[pid]?.forest || []).length,
            grasslandCount: (this.tableau[pid]?.grassland || []).length,
            wetlandCount: (this.tableau[pid]?.wetland || []).length,
            actions: null
        });
    }

    listenForMoves() {
        const actionsRef = getRoomRef(this.roomCode).child('gameState/actions');
        actionsRef.on('child_added', (snapshot) => {
            const data = snapshot.val();
            if (!data || !data.action) return;
            const type = data.action.type;
            if (!type || !type.startsWith('wingspan_')) return;

            const pid = data.playerId;
            const turnPid = this.playerIds[this.turnIndex];
            if (pid !== turnPid) return;       // Only active player's actions count
            if (this.finished) return;

            this.handleAction(type, data.action, pid);
        });
        this.listeners.push({ ref: actionsRef, event: 'child_added' });
    }

    handleAction(type, action, pid) {
        if ((this.actionsRemaining[pid] || 0) <= 0) return;

        switch (type) {
            case 'wingspan_play_bird':
                this.doPlayBird(pid, action.cardId);
                break;
            case 'wingspan_gather_food':
                this.doGatherFood(pid);
                break;
            case 'wingspan_lay_eggs':
                this.doLayEggs(pid);
                break;
            case 'wingspan_draw_cards':
                this.doDrawCards(pid);
                break;
        }
    }

    doPlayBird(pid, cardId) {
        if (!this.hands[pid] || !this.hands[pid][cardId]) return;
        if ((this.food[pid] || 0) < 1) {
            this.flashMessage('Not enough food!', 'warn');
            return;
        }
        const bird = WINGSPAN_BIRDS_BY_ID[cardId];
        if (!bird) return;

        // Pay cost
        this.food[pid]--;
        delete this.hands[pid][cardId];
        this.tableau[pid][bird.habitat].push(cardId);

        // Resolve "when played" power
        let bonusMsg = '';
        if (bird.power) {
            const [kind, amt] = bird.power.split(':');
            const n = parseInt(amt, 10) || 0;
            if (kind === 'egg')  { this.eggs[pid] += n; bonusMsg = `+${n} egg`; }
            if (kind === 'food') { this.food[pid] += n; bonusMsg = `+${n} food`; }
            if (kind === 'draw') {
                for (let i = 0; i < n; i++) {
                    const cid = this.deck.pop();
                    if (cid) this.hands[pid][cid] = true;
                }
                bonusMsg = `+${n} card`;
            }
        }

        const p = this.players[pid];
        this.flashMessage(
            `${p.avatar} played <b>${escapeHtml(bird.name)}</b> (${bird.points}pt) to ${bird.habitat}` +
            (bonusMsg ? ` — ${bonusMsg}` : ''),
            'play'
        );

        this.renderTableau(pid);
        this.consumeAction(pid);
    }

    doGatherFood(pid) {
        const forest = (this.tableau[pid]?.forest || []).length;
        const gain = 1 + forest;
        this.food[pid] = (this.food[pid] || 0) + gain;

        const p = this.players[pid];
        this.flashMessage(`${p.avatar} gathered <b>${gain}</b> food 🍇 (+${forest} from forest)`, 'food');

        this.renderTableau(pid);
        this.consumeAction(pid);
    }

    doLayEggs(pid) {
        const grass = (this.tableau[pid]?.grassland || []).length;
        const gain = 1 + grass;
        this.eggs[pid] = (this.eggs[pid] || 0) + gain;

        const p = this.players[pid];
        this.flashMessage(`${p.avatar} laid <b>${gain}</b> egg${gain !== 1 ? 's' : ''} 🥚 (+${grass} from grassland)`, 'egg');

        this.renderTableau(pid);
        this.consumeAction(pid);
    }

    doDrawCards(pid) {
        const wet = (this.tableau[pid]?.wetland || []).length;
        const gain = 1 + wet;
        let drawn = 0;
        for (let i = 0; i < gain; i++) {
            const cid = this.deck.pop();
            if (cid) { this.hands[pid][cid] = true; drawn++; }
        }

        const p = this.players[pid];
        this.flashMessage(`${p.avatar} drew <b>${drawn}</b> card${drawn !== 1 ? 's' : ''} 🂠 (+${wet} from wetland)`, 'draw');

        this.renderTableau(pid);
        this.consumeAction(pid);
    }

    consumeAction(pid) {
        this.actionsRemaining[pid]--;
        this.advanceTurn();
    }

    advanceTurn() {
        // Find next player with actions remaining
        let attempts = 0;
        do {
            this.turnIndex = (this.turnIndex + 1) % this.playerIds.length;
            attempts++;
            if (attempts > this.playerIds.length) {
                // No player has actions left — end of round
                return this.endRound();
            }
        } while ((this.actionsRemaining[this.playerIds[this.turnIndex]] || 0) <= 0);

        setTimeout(() => this.announceTurn(), 600);
    }

    endRound() {
        if (this.round >= WINGSPAN_ROUND_ACTIONS.length) {
            return this.endGame();
        }
        this.flashMessage(`Round ${this.round} complete!`, 'round');
        setTimeout(() => this.startRound(this.round + 1), 1500);
    }

    endGame() {
        this.finished = true;
        // Compute final scores for each player
        this.playerIds.forEach(pid => {
            const p = this.players[pid];
            let pts = 0;
            ['forest', 'grassland', 'wetland'].forEach(h => {
                (this.tableau[pid][h] || []).forEach(cid => {
                    pts += WINGSPAN_BIRDS_BY_ID[cid]?.points || 0;
                });
            });
            pts += (this.eggs[pid] || 0);              // 1 pt per egg
            pts += Math.floor((this.food[pid] || 0) / 3); // 1 pt per 3 leftover food
            p.score = (p.score || 0) + pts;
            updateScoreDisplay(pid, p.score);
        });
        renderScoreboard();

        this.flashMessage('🏆 Final scores tallied — check the podium!', 'round');
        setTimeout(() => {
            this.cleanup();
            endGame();
        }, 2500);
    }

    flashMessage(html, kind) {
        const el = document.getElementById('wingspan-message');
        if (!el) return;
        el.className = `wingspan-message kind-${kind || 'info'}`;
        el.innerHTML = html;
    }

    cleanup() {
        this.listeners.forEach(l => l.ref.off(l.event));
        this.listeners = [];
    }
}
