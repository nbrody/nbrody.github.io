// ═══════════════════════════════════════════════════════════
// Wingspan — TV-side game logic
// Simplified Wingspan clone for phone-controlled multiplayer
// ═══════════════════════════════════════════════════════════

const WS_FOOD_EMOJI = {
    invert: '🐛',
    seed: '🌾',
    fruit: '🍓',
    fish: '🐟',
    rodent: '🐭',
    any: '⭐'
};
const WS_FOOD_NAME = {
    invert: 'Invertebrate',
    seed: 'Seed',
    fruit: 'Fruit',
    fish: 'Fish',
    rodent: 'Rodent'
};
const WS_FOOD_TYPES = ['invert', 'seed', 'fruit', 'fish', 'rodent'];
const WS_HABITAT = {
    forest: { name: 'Forest', emoji: '🌲', action: 'Gain food' },
    grassland: { name: 'Grassland', emoji: '🌾', action: 'Lay eggs' },
    wetland: { name: 'Wetland', emoji: '🌊', action: 'Draw cards' }
};

// Bird card pool. habitats: subset of ['forest','grassland','wetland'].
// cost keys are food types or 'any'. points, eggLimit required.
const WS_BIRDS = [
    { id: 'mallard', name: 'Mallard', emoji: '🦆', habitats: ['wetland'], cost: { invert: 1, seed: 1 }, points: 4, eggLimit: 3 },
    { id: 'wood_duck', name: 'Wood Duck', emoji: '🦆', habitats: ['wetland'], cost: { seed: 1, invert: 1 }, points: 3, eggLimit: 4 },
    { id: 'trumpeter_swan', name: 'Trumpeter Swan', emoji: '🦢', habitats: ['wetland'], cost: { fruit: 1, seed: 2 }, points: 7, eggLimit: 1 },
    { id: 'great_blue_heron', name: 'Great Blue Heron', emoji: '🪶', habitats: ['wetland'], cost: { fish: 2 }, points: 5, eggLimit: 2 },
    { id: 'belted_kingfisher', name: 'Belted Kingfisher', emoji: '🐦', habitats: ['wetland'], cost: { fish: 1, invert: 1 }, points: 4, eggLimit: 3 },
    { id: 'osprey', name: 'Osprey', emoji: '🦅', habitats: ['wetland'], cost: { fish: 2 }, points: 5, eggLimit: 1 },
    { id: 'common_loon', name: 'Common Loon', emoji: '🦆', habitats: ['wetland'], cost: { fish: 2 }, points: 5, eggLimit: 1 },
    { id: 'canada_goose', name: 'Canada Goose', emoji: '🦢', habitats: ['wetland', 'grassland'], cost: { seed: 2 }, points: 5, eggLimit: 2 },
    { id: 'bald_eagle', name: 'Bald Eagle', emoji: '🦅', habitats: ['forest', 'grassland'], cost: { fish: 1, rodent: 2 }, points: 9, eggLimit: 1 },
    { id: 'red_tailed_hawk', name: 'Red-tailed Hawk', emoji: '🦅', habitats: ['grassland'], cost: { rodent: 2 }, points: 5, eggLimit: 1 },
    { id: 'peregrine_falcon', name: 'Peregrine Falcon', emoji: '🦅', habitats: ['grassland'], cost: { rodent: 1, any: 1 }, points: 5, eggLimit: 2 },
    { id: 'snowy_owl', name: 'Snowy Owl', emoji: '🦉', habitats: ['grassland'], cost: { rodent: 2 }, points: 4, eggLimit: 2 },
    { id: 'great_horned_owl', name: 'Great Horned Owl', emoji: '🦉', habitats: ['forest'], cost: { rodent: 2 }, points: 6, eggLimit: 1 },
    { id: 'barn_owl', name: 'Barn Owl', emoji: '🦉', habitats: ['grassland'], cost: { rodent: 1 }, points: 3, eggLimit: 2 },
    { id: 'american_crow', name: 'American Crow', emoji: '🐦‍⬛', habitats: ['forest', 'grassland'], cost: { any: 1 }, points: 2, eggLimit: 3 },
    { id: 'raven', name: 'Common Raven', emoji: '🐦‍⬛', habitats: ['forest'], cost: { rodent: 1, any: 1 }, points: 4, eggLimit: 2 },
    { id: 'blue_jay', name: 'Blue Jay', emoji: '🐦', habitats: ['forest'], cost: { seed: 1, fruit: 1 }, points: 4, eggLimit: 3 },
    { id: 'cardinal', name: 'Northern Cardinal', emoji: '🐦', habitats: ['forest', 'grassland'], cost: { seed: 2 }, points: 4, eggLimit: 2 },
    { id: 'robin', name: 'American Robin', emoji: '🐦', habitats: ['forest', 'grassland'], cost: { invert: 1, fruit: 1 }, points: 3, eggLimit: 3 },
    { id: 'bluebird', name: 'Eastern Bluebird', emoji: '🐦', habitats: ['grassland'], cost: { invert: 1, fruit: 1 }, points: 3, eggLimit: 3 },
    { id: 'mourning_dove', name: 'Mourning Dove', emoji: '🕊️', habitats: ['forest', 'grassland', 'wetland'], cost: { seed: 1 }, points: 2, eggLimit: 4 },
    { id: 'house_sparrow', name: 'House Sparrow', emoji: '🐦', habitats: ['grassland'], cost: { seed: 1 }, points: 2, eggLimit: 4 },
    { id: 'goldfinch', name: 'American Goldfinch', emoji: '🐤', habitats: ['grassland'], cost: { seed: 1 }, points: 3, eggLimit: 4 },
    { id: 'chickadee', name: 'Black-capped Chickadee', emoji: '🐦', habitats: ['forest'], cost: { seed: 1, invert: 1 }, points: 2, eggLimit: 3 },
    { id: 'downy_woodpecker', name: 'Downy Woodpecker', emoji: '🐦', habitats: ['forest'], cost: { invert: 1, seed: 1 }, points: 3, eggLimit: 3 },
    { id: 'pileated_woodpecker', name: 'Pileated Woodpecker', emoji: '🐦', habitats: ['forest'], cost: { invert: 2 }, points: 5, eggLimit: 1 },
    { id: 'hummingbird', name: 'Ruby-throated Hummingbird', emoji: '🐦', habitats: ['forest', 'grassland'], cost: { fruit: 1 }, points: 2, eggLimit: 2 },
    { id: 'ruffed_grouse', name: 'Ruffed Grouse', emoji: '🐓', habitats: ['forest'], cost: { seed: 1, fruit: 1 }, points: 4, eggLimit: 3 },
    { id: 'wild_turkey', name: 'Wild Turkey', emoji: '🦃', habitats: ['forest'], cost: { seed: 2 }, points: 4, eggLimit: 3 },
    { id: 'purple_martin', name: 'Purple Martin', emoji: '🐦', habitats: ['grassland'], cost: { invert: 1 }, points: 3, eggLimit: 3 },
    { id: 'barn_swallow', name: 'Barn Swallow', emoji: '🐦', habitats: ['grassland'], cost: { invert: 1 }, points: 2, eggLimit: 3 },
    { id: 'green_heron', name: 'Green Heron', emoji: '🪶', habitats: ['wetland'], cost: { fish: 1, invert: 1 }, points: 4, eggLimit: 2 }
];

const WS_BIRD_BY_ID = WS_BIRDS.reduce((m, b) => { m[b.id] = b; return m; }, {});

// ───────────────────────────────────────────────────────────
class WingspanGame {
    constructor(roomCode, players, container) {
        this.roomCode = roomCode;
        this.players = players;
        this.container = container;
        this.playerIds = Object.keys(players);
        this.listeners = [];

        this.maxRounds = 4;
        this.actionsPerRound = [8, 7, 6, 5];
        this.round = 0;
        this.actionsLeft = {};
        this.turnOrder = this.shuffle([...this.playerIds]);
        this.turnIndex = 0;
        this.activePlayerId = null;
        this.phase = 'idle'; // idle | awaiting_action | round_end | game_end
        this.boards = {};    // pid -> { forest:[], grassland:[], wetland:[], food:{}, hand:[] }
        this.birdDeck = [];

        this.init();
    }

    // ── Setup ─────────────────────────────────────────────
    init() {
        this.buildDeck();
        this.setupPlayers();
        this.render();
        this.listenForActions();
        this.startRound();
    }

    shuffle(arr) {
        const a = [...arr];
        for (let i = a.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    }

    buildDeck() {
        // 3 copies of each bird, shuffled
        this.birdDeck = [];
        for (let i = 0; i < 3; i++) {
            for (const b of WS_BIRDS) this.birdDeck.push(b.id);
        }
        this.birdDeck = this.shuffle(this.birdDeck);
    }

    drawBird() {
        if (this.birdDeck.length === 0) this.buildDeck();
        return this.birdDeck.pop();
    }

    randomFood() {
        return WS_FOOD_TYPES[Math.floor(Math.random() * WS_FOOD_TYPES.length)];
    }

    setupPlayers() {
        for (const pid of this.playerIds) {
            this.boards[pid] = {
                forest: [],
                grassland: [],
                wetland: [],
                food: { invert: 1, seed: 1, fruit: 1, fish: 1, rodent: 1 },
                hand: [this.drawBird(), this.drawBird(), this.drawBird()]
            };
        }
    }

    // ── Rendering ─────────────────────────────────────────
    render() {
        this.container.innerHTML = `
            <div class="ws-root">
                <div class="ws-topbar">
                    <span class="ws-round-label">Round <strong id="ws-round">1</strong> / ${this.maxRounds}</span>
                    <span class="ws-status" id="ws-status">Starting…</span>
                    <span class="ws-deck-count">Deck: <strong id="ws-deck-count">${this.birdDeck.length}</strong></span>
                </div>
                <div id="ws-players" class="ws-players"></div>
            </div>
        `;
        this.renderAll();
    }

    renderAll() {
        const deckEl = document.getElementById('ws-deck-count');
        if (deckEl) deckEl.textContent = this.birdDeck.length;
        const roundEl = document.getElementById('ws-round');
        if (roundEl) roundEl.textContent = this.round;

        const wrap = document.getElementById('ws-players');
        if (!wrap) return;
        wrap.innerHTML = '';

        for (const pid of this.turnOrder) {
            const p = this.players[pid];
            const b = this.boards[pid];
            const isActive = pid === this.activePlayerId;
            const actionsLeft = this.actionsLeft[pid] || 0;
            const birdCount = b.forest.length + b.grassland.length + b.wetland.length;
            const eggCount = this.totalEggs(pid);
            const liveScore = this.playerScore(pid);

            const slot = document.createElement('div');
            slot.className = `ws-player-mat ${isActive ? 'active' : ''}`;
            slot.style.borderColor = isActive ? (p.color || '#00ff88') : 'transparent';
            slot.innerHTML = `
                <div class="ws-mat-header">
                    <span class="ws-avatar" style="background:${p.color}22;border-color:${p.color}66;">${p.avatar}</span>
                    <span class="ws-name" style="color:${p.color};">${this.esc(p.name)}</span>
                    ${isActive ? `<span class="ws-turn-chip">YOUR TURN · ${actionsLeft} left</span>` : ''}
                    <span class="ws-mat-stats">
                        🐦 ${birdCount} · 🥚 ${eggCount} · ⭐ ${liveScore}
                    </span>
                </div>
                <div class="ws-habitats">
                    ${this.renderRow(pid, 'forest', b.forest)}
                    ${this.renderRow(pid, 'grassland', b.grassland)}
                    ${this.renderRow(pid, 'wetland', b.wetland)}
                </div>
                <div class="ws-supply">
                    <span class="ws-supply-label">Food</span>
                    ${WS_FOOD_TYPES.map(t => `
                        <span class="ws-food-chip" title="${WS_FOOD_NAME[t]}">
                            ${WS_FOOD_EMOJI[t]} ×${b.food[t] || 0}
                        </span>
                    `).join('')}
                    <span class="ws-supply-sep">·</span>
                    <span class="ws-supply-label">Hand</span>
                    <span class="ws-hand-chip">🂠 ×${b.hand.length}</span>
                </div>
            `;
            wrap.appendChild(slot);
        }
    }

    renderRow(pid, habitatKey, birds) {
        const h = WS_HABITAT[habitatKey];
        const slotsHtml = [];
        for (let i = 0; i < 5; i++) {
            const placed = birds[i];
            if (placed) {
                const bird = WS_BIRD_BY_ID[placed.cardId];
                const eggDots = '🥚'.repeat(Math.min(placed.eggs, bird.eggLimit));
                slotsHtml.push(`
                    <div class="ws-bird-card">
                        <div class="ws-bird-points">${bird.points}</div>
                        <span class="ws-bird-emoji">${bird.emoji}</span>
                        <span class="ws-bird-name">${this.esc(bird.name)}</span>
                        <div class="ws-bird-eggs">${eggDots}<span class="ws-egg-limit">/${bird.eggLimit}</span></div>
                    </div>
                `);
            } else {
                slotsHtml.push(`<div class="ws-bird-slot empty"></div>`);
            }
        }
        const bonus = birds.length; // +N reward for action based on birds in row
        return `
            <div class="ws-habitat-row" data-habitat="${habitatKey}">
                <div class="ws-habitat-label">
                    <span class="ws-habitat-emoji">${h.emoji}</span>
                    <span class="ws-habitat-name">${h.name}</span>
                    <span class="ws-habitat-action">${h.action}: 1+${bonus}</span>
                </div>
                <div class="ws-slots">${slotsHtml.join('')}</div>
            </div>
        `;
    }

    setStatus(msg) {
        const el = document.getElementById('ws-status');
        if (el) el.innerHTML = msg;
    }

    // ── Scoring ───────────────────────────────────────────
    totalEggs(pid) {
        const b = this.boards[pid];
        let n = 0;
        for (const key of ['forest', 'grassland', 'wetland']) {
            for (const p of b[key]) n += p.eggs;
        }
        return n;
    }

    playerScore(pid) {
        const b = this.boards[pid];
        let s = 0;
        for (const key of ['forest', 'grassland', 'wetland']) {
            for (const p of b[key]) {
                s += WS_BIRD_BY_ID[p.cardId].points;
                s += p.eggs;
            }
        }
        return s;
    }

    // ── Round / Turn Flow ─────────────────────────────────
    startRound() {
        this.round++;
        if (this.round > this.maxRounds) {
            this.endWingspan();
            return;
        }
        const actions = this.actionsPerRound[this.round - 1];
        this.actionsLeft = {};
        for (const pid of this.playerIds) this.actionsLeft[pid] = actions;
        this.turnIndex = 0;
        this.phase = 'awaiting_action';
        this.setStatus(`🎬 Round ${this.round} — ${actions} actions each`);
        this.renderAll();
        setTimeout(() => this.promptCurrentPlayer(), 1200);
    }

    promptCurrentPlayer() {
        // Find next player with actions
        let tried = 0;
        while (tried < this.turnOrder.length) {
            const pid = this.turnOrder[this.turnIndex];
            if ((this.actionsLeft[pid] || 0) > 0) {
                this.activePlayerId = pid;
                this.phase = 'awaiting_action';
                const p = this.players[pid];
                this.setStatus(`<span style="color:${p.color};font-weight:700;">${this.esc(p.name)}</span> — choose an action (${this.actionsLeft[pid]} left)`);
                updateGameState(this.roomCode, {
                    phase: 'awaiting_action',
                    activePlayer: pid,
                    round: this.round,
                    actionsLeft: this.actionsLeft[pid],
                    hand: this.boards[pid].hand,
                    food: this.boards[pid].food,
                    actions: null
                });
                this.renderAll();
                return;
            }
            this.turnIndex = (this.turnIndex + 1) % this.turnOrder.length;
            tried++;
        }
        // Nobody has actions left — end round
        this.endRound();
    }

    advanceTurn() {
        const pid = this.activePlayerId;
        this.actionsLeft[pid]--;
        // Next player (rotate seat)
        this.turnIndex = (this.turnIndex + 1) % this.turnOrder.length;
        setTimeout(() => this.promptCurrentPlayer(), 900);
    }

    endRound() {
        this.phase = 'round_end';
        this.activePlayerId = null;
        // Small end-of-round scoring bump: player with most eggs this round gets +3
        const eggCounts = this.playerIds.map(pid => ({ pid, eggs: this.totalEggs(pid) }));
        eggCounts.sort((a, b) => b.eggs - a.eggs);
        const topEggs = eggCounts[0]?.eggs || 0;
        const bonusWinners = eggCounts.filter(e => e.eggs === topEggs && topEggs > 0);
        for (const w of bonusWinners) {
            const p = this.players[w.pid];
            p.score = (p.score || 0) + 3;
            updateScoreDisplay(w.pid, p.score);
        }
        renderScoreboard();
        if (bonusWinners.length > 0) {
            this.setStatus(`🥚 Most eggs end-of-round bonus (+3): ${bonusWinners.map(w => this.esc(this.players[w.pid].name)).join(', ')}`);
        } else {
            this.setStatus(`📜 End of round ${this.round}`);
        }
        this.renderAll();
        setTimeout(() => this.startRound(), 3500);
    }

    endWingspan() {
        this.phase = 'game_end';
        this.activePlayerId = null;
        // Commit end scores: each player's final = scoreboard already includes egg-round bonuses.
        // Add bird-board scores.
        for (const pid of this.playerIds) {
            const p = this.players[pid];
            const boardScore = this.playerScore(pid);
            p.score = (p.score || 0) + boardScore;
            updateScoreDisplay(pid, p.score);
        }
        renderScoreboard();
        this.setStatus('🏆 Game over!');
        this.renderAll();
        setTimeout(() => { this.cleanup(); endGame(); }, 2500);
    }

    // ── Action Handlers ───────────────────────────────────
    handleAction(pid, action) {
        if (pid !== this.activePlayerId || this.phase !== 'awaiting_action') return;

        const b = this.boards[pid];
        switch (action.type) {
            case 'ws_play_bird':
                return this.actionPlayBird(pid, action.cardId, action.habitat);
            case 'ws_gain_food':
                return this.actionGainFood(pid);
            case 'ws_lay_eggs':
                return this.actionLayEggs(pid);
            case 'ws_draw_cards':
                return this.actionDrawCards(pid);
        }
    }

    canAfford(food, cost) {
        // Does player have enough food tokens to pay cost?
        // Specific-type costs first, then 'any' can be paid from any remaining type.
        const simulated = { ...food };
        for (const [k, need] of Object.entries(cost)) {
            if (k === 'any') continue;
            if ((simulated[k] || 0) < need) return false;
            simulated[k] -= need;
        }
        const anyNeed = cost.any || 0;
        const remaining = WS_FOOD_TYPES.reduce((s, t) => s + (simulated[t] || 0), 0);
        return remaining >= anyNeed;
    }

    payCost(food, cost) {
        for (const [k, need] of Object.entries(cost)) {
            if (k === 'any') continue;
            food[k] -= need;
        }
        let anyNeed = cost.any || 0;
        // Pay 'any' from most-abundant remaining type
        while (anyNeed > 0) {
            let bestType = null, bestAmt = 0;
            for (const t of WS_FOOD_TYPES) {
                if ((food[t] || 0) > bestAmt) { bestAmt = food[t]; bestType = t; }
            }
            if (!bestType) break;
            food[bestType]--;
            anyNeed--;
        }
    }

    actionPlayBird(pid, cardId, habitat) {
        const b = this.boards[pid];
        const idx = b.hand.indexOf(cardId);
        if (idx < 0) { this.toast('Card not in hand'); return; }
        const bird = WS_BIRD_BY_ID[cardId];
        if (!bird) return;
        if (!bird.habitats.includes(habitat)) { this.toast(`${bird.name} can't go in ${habitat}`); return; }
        if (b[habitat].length >= 5) { this.toast('Habitat full'); return; }
        if (!this.canAfford(b.food, bird.cost)) { this.toast('Not enough food'); return; }

        this.payCost(b.food, bird.cost);
        b.hand.splice(idx, 1);
        b[habitat].push({ cardId, eggs: 0 });

        const p = this.players[pid];
        this.setStatus(`${p.avatar} played <strong>${this.esc(bird.name)}</strong> ${bird.emoji} to ${WS_HABITAT[habitat].emoji} ${WS_HABITAT[habitat].name}`);
        this.renderAll();
        this.advanceTurn();
    }

    actionGainFood(pid) {
        const b = this.boards[pid];
        const gain = 1 + b.forest.length;
        const gotTypes = [];
        for (let i = 0; i < gain; i++) {
            const t = this.randomFood();
            b.food[t] = (b.food[t] || 0) + 1;
            gotTypes.push(t);
        }
        const p = this.players[pid];
        this.setStatus(`${p.avatar} 🌲 gained food: ${gotTypes.map(t => WS_FOOD_EMOJI[t]).join(' ')}`);
        this.renderAll();
        this.advanceTurn();
    }

    actionLayEggs(pid) {
        const b = this.boards[pid];
        const gain = 1 + b.grassland.length;
        // Distribute greedily across all birds (any habitat), respecting egg limit
        let remaining = gain;
        for (const key of ['grassland', 'wetland', 'forest']) {
            for (const slot of b[key]) {
                const bird = WS_BIRD_BY_ID[slot.cardId];
                while (remaining > 0 && slot.eggs < bird.eggLimit) {
                    slot.eggs++;
                    remaining--;
                }
                if (remaining === 0) break;
            }
            if (remaining === 0) break;
        }
        const laid = gain - remaining;
        const p = this.players[pid];
        if (laid === 0) {
            this.setStatus(`${p.avatar} 🌾 tried to lay eggs but has no room`);
        } else {
            this.setStatus(`${p.avatar} 🌾 laid ${laid} egg${laid !== 1 ? 's' : ''} ${'🥚'.repeat(Math.min(laid, 8))}`);
        }
        this.renderAll();
        this.advanceTurn();
    }

    actionDrawCards(pid) {
        const b = this.boards[pid];
        const gain = 1 + b.wetland.length;
        const drawn = [];
        for (let i = 0; i < gain; i++) {
            const c = this.drawBird();
            b.hand.push(c);
            drawn.push(c);
        }
        const p = this.players[pid];
        this.setStatus(`${p.avatar} 🌊 drew ${gain} card${gain !== 1 ? 's' : ''}`);
        this.renderAll();
        this.advanceTurn();
    }

    // ── Firebase wiring ───────────────────────────────────
    listenForActions() {
        const actionsRef = getRoomRef(this.roomCode).child('gameState/actions');
        actionsRef.on('child_added', (snapshot) => {
            const data = snapshot.val();
            if (!data || !data.action) return;
            if (typeof data.action.type === 'string' && data.action.type.startsWith('ws_')) {
                this.handleAction(data.playerId, data.action);
            }
        });
        this.listeners.push({ ref: actionsRef, event: 'child_added' });
    }

    toast(msg) {
        if (typeof showToast === 'function') showToast(msg, 2200);
    }

    esc(str) {
        const div = document.createElement('div');
        div.textContent = str == null ? '' : String(str);
        return div.innerHTML;
    }

    cleanup() {
        this.listeners.forEach(l => l.ref.off(l.event));
        this.listeners = [];
    }
}

// ── Wingspan styles ─────────────────────────────────────────
const wsStyle = document.createElement('style');
wsStyle.textContent = `
    .ws-root {
        width: 100%;
        max-width: 1400px;
        display: flex;
        flex-direction: column;
        gap: 10px;
    }
    .ws-topbar {
        display: flex;
        align-items: center;
        gap: 18px;
        padding: 10px 16px;
        background: var(--bg-glass);
        border: 1px solid var(--glass-border);
        border-radius: 14px;
        flex-wrap: wrap;
    }
    .ws-round-label, .ws-deck-count {
        font-family: 'Press Start 2P', monospace;
        font-size: 0.7rem;
        color: var(--text-secondary);
    }
    .ws-status {
        flex: 1;
        min-width: 220px;
        text-align: center;
        font-size: 0.95rem;
        color: var(--text-primary);
    }
    .ws-players {
        display: flex;
        flex-direction: column;
        gap: 10px;
    }
    .ws-player-mat {
        padding: 10px 14px;
        border-radius: 16px;
        background: linear-gradient(135deg, rgba(30,60,35,0.35), rgba(20,35,60,0.35));
        border: 2px solid transparent;
        transition: border-color 220ms ease, box-shadow 220ms ease;
    }
    .ws-player-mat.active {
        box-shadow: 0 0 28px rgba(0,255,136,0.22);
    }
    .ws-mat-header {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
        margin-bottom: 6px;
    }
    .ws-avatar {
        width: 32px; height: 32px;
        display: inline-flex; align-items: center; justify-content: center;
        border-radius: 50%; border: 2px solid transparent;
        font-size: 1.2rem;
    }
    .ws-name {
        font-weight: 800;
        font-size: 1.05rem;
    }
    .ws-turn-chip {
        padding: 4px 10px;
        border-radius: 999px;
        background: rgba(0,255,136,0.15);
        border: 1px solid rgba(0,255,136,0.35);
        color: var(--neon-green);
        font-family: 'Press Start 2P', monospace;
        font-size: 0.55rem;
        letter-spacing: 1px;
    }
    .ws-mat-stats {
        margin-left: auto;
        font-size: 0.8rem;
        color: var(--text-secondary);
        font-weight: 600;
    }
    .ws-habitats {
        display: flex;
        flex-direction: column;
        gap: 6px;
    }
    .ws-habitat-row {
        display: grid;
        grid-template-columns: 140px 1fr;
        gap: 8px;
        align-items: center;
        padding: 6px 8px;
        border-radius: 10px;
        background: rgba(0,0,0,0.18);
    }
    .ws-habitat-row[data-habitat="forest"]    { background: linear-gradient(90deg, rgba(30,100,50,0.35), rgba(20,50,30,0.18)); }
    .ws-habitat-row[data-habitat="grassland"] { background: linear-gradient(90deg, rgba(120,100,30,0.30), rgba(60,50,15,0.18)); }
    .ws-habitat-row[data-habitat="wetland"]   { background: linear-gradient(90deg, rgba(30,80,140,0.35), rgba(15,40,70,0.18)); }
    .ws-habitat-label {
        display: flex;
        flex-direction: column;
        gap: 2px;
        padding-right: 6px;
        border-right: 1px dashed rgba(255,255,255,0.15);
        font-size: 0.7rem;
        color: var(--text-secondary);
    }
    .ws-habitat-emoji { font-size: 1.1rem; }
    .ws-habitat-name { font-weight: 700; color: var(--text-primary); font-size: 0.75rem; }
    .ws-habitat-action { font-size: 0.65rem; color: var(--text-muted); }
    .ws-slots {
        display: grid;
        grid-template-columns: repeat(5, minmax(64px, 1fr));
        gap: 6px;
    }
    .ws-bird-slot.empty {
        min-height: 76px;
        border-radius: 8px;
        border: 1px dashed rgba(255,255,255,0.08);
    }
    .ws-bird-card {
        position: relative;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: space-between;
        padding: 6px 4px;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.10);
        border-radius: 8px;
        min-height: 76px;
        text-align: center;
        animation: wsPlay 0.35s ease-out;
    }
    @keyframes wsPlay {
        0% { transform: scale(0.6) rotate(-8deg); opacity: 0; }
        100% { transform: scale(1) rotate(0); opacity: 1; }
    }
    .ws-bird-emoji { font-size: 1.35rem; line-height: 1; }
    .ws-bird-name {
        font-size: 0.6rem;
        font-weight: 700;
        color: var(--text-primary);
        line-height: 1.05;
        max-width: 70px;
        overflow: hidden;
        text-overflow: ellipsis;
        white-space: nowrap;
    }
    .ws-bird-points {
        position: absolute;
        top: -6px; right: -6px;
        min-width: 22px; height: 22px;
        padding: 0 4px;
        border-radius: 999px;
        background: var(--grad-secondary);
        color: #0a0a1a;
        font-family: 'Press Start 2P', monospace;
        font-size: 0.6rem;
        display: flex; align-items: center; justify-content: center;
    }
    .ws-bird-eggs {
        font-size: 0.7rem;
        color: var(--text-secondary);
    }
    .ws-egg-limit { color: var(--text-muted); font-size: 0.55rem; margin-left: 2px; }
    .ws-supply {
        display: flex; gap: 8px; flex-wrap: wrap; align-items: center;
        padding: 6px 4px; margin-top: 6px;
        font-size: 0.8rem;
    }
    .ws-supply-label {
        font-family: 'Press Start 2P', monospace;
        font-size: 0.55rem;
        color: var(--text-muted);
        letter-spacing: 1px;
    }
    .ws-supply-sep { color: rgba(255,255,255,0.15); }
    .ws-food-chip, .ws-hand-chip {
        padding: 3px 8px;
        border-radius: 999px;
        background: rgba(255,255,255,0.06);
        border: 1px solid rgba(255,255,255,0.08);
        font-size: 0.8rem;
    }
    @media (max-width: 900px) {
        .ws-habitat-row { grid-template-columns: 92px 1fr; }
        .ws-slots { grid-template-columns: repeat(5, minmax(48px, 1fr)); }
        .ws-bird-name { font-size: 0.5rem; }
    }
`;
document.head.appendChild(wsStyle);
