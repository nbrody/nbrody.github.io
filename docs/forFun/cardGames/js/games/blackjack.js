// ===== GAME ENGINE: BLACKJACK =====
import { createDeck, shuffle, blackjackTotal, renderCard } from '../deck.js';

export const GAME_ID = 'blackjack';
export const DISPLAY_NAME = 'Blackjack';
export const MIN_PLAYERS = 1;
export const MAX_PLAYERS = 6;
export const DESCRIPTION = 'Beat the dealer to 21 without going bust.';

/** Initialize a fresh Blackjack game state */
export function initState(playerIds) {
  const deck = shuffle(createDeck());
  const players = {};
  for (const id of playerIds) {
    players[id] = { hand: [], bet: 10, status: 'playing', chips: 100 };
  }
  // Deal 2 to each player and 2 to dealer
  const dealOrder = [...playerIds, 'dealer', ...playerIds, 'dealer'];
  const state = {
    game: GAME_ID,
    phase: 'betting', // betting → playing → dealer → done
    deck,
    dealer: { hand: [], status: 'playing' },
    players,
    currentPlayer: playerIds[0],
    playerOrder: playerIds,
    message: 'Place your bets!',
    round: 1
  };
  return state;
}

/** Start the round (deal initial cards) */
export function dealRound(state) {
  const s = deepCopy(state);
  s.phase = 'playing';
  const deck = [...s.deck];
  // Deal 2 cards to each player + dealer
  for (const pid of s.playerOrder) {
    s.players[pid].hand = [deck.pop(), deck.pop()];
    s.players[pid].status = 'playing';
  }
  s.dealer.hand = [deck.pop(), deck.pop()]; // second dealer card is hidden
  s.deck = deck;
  s.currentPlayer = s.playerOrder[0];
  s.message = `${s.currentPlayer} — Hit or Stand?`;
  return s;
}

/** Player action: hit, stand, double */
export function playerAction(state, playerId, action) {
  if (state.phase !== 'playing') return state;
  if (state.currentPlayer !== playerId) return state;
  const s = deepCopy(state);
  const deck = [...s.deck];
  const player = s.players[playerId];

  if (action === 'hit') {
    player.hand.push(deck.pop());
    s.deck = deck;
    const total = blackjackTotal(player.hand);
    if (total > 21) {
      player.status = 'bust';
      s.message = `${playerId} busted with ${total}!`;
      advanceTurn(s);
    } else if (total === 21) {
      player.status = 'stand';
      s.message = `${playerId} hits 21!`;
      advanceTurn(s);
    }
  } else if (action === 'stand') {
    player.status = 'stand';
    s.message = `${playerId} stands.`;
    advanceTurn(s);
  } else if (action === 'double') {
    player.chips -= player.bet;
    player.bet *= 2;
    player.hand.push(deck.pop());
    s.deck = deck;
    player.status = blackjackTotal(player.hand) > 21 ? 'bust' : 'stand';
    s.message = player.status === 'bust' ? `${playerId} doubled and busted!` : `${playerId} doubled down.`;
    advanceTurn(s);
  }
  return s;
}

function advanceTurn(s) {
  const idx = s.playerOrder.indexOf(s.currentPlayer);
  const next = s.playerOrder.slice(idx + 1).find(p => s.players[p].status === 'playing');
  if (next) {
    s.currentPlayer = next;
    s.message = `${next} — Hit or Stand?`;
  } else {
    // Dealer's turn
    s.phase = 'dealer';
    s.currentPlayer = 'dealer';
    playDealer(s);
  }
}

function playDealer(s) {
  const deck = [...s.deck];
  while (blackjackTotal(s.dealer.hand) < 17) {
    s.dealer.hand.push(deck.pop());
  }
  s.deck = deck;
  const dealerTotal = blackjackTotal(s.dealer.hand);
  s.dealer.status = dealerTotal > 21 ? 'bust' : 'stand';

  // Resolve bets
  const results = [];
  for (const [pid, player] of Object.entries(s.players)) {
    const playerTotal = blackjackTotal(player.hand);
    if (player.status === 'bust') {
      player.result = 'lose'; player.chips -= player.bet;
      results.push(`${pid} busted`);
    } else if (dealerTotal > 21 || playerTotal > dealerTotal) {
      player.result = 'win'; player.chips += player.bet;
      results.push(`${pid} wins`);
    } else if (playerTotal === dealerTotal) {
      player.result = 'push';
      results.push(`${pid} pushes`);
    } else {
      player.result = 'lose'; player.chips -= player.bet;
      results.push(`${pid} loses`);
    }
    player.bet = 10; // reset bet
  }
  s.phase = 'done';
  s.message = results.join(' · ') + ` | Dealer: ${dealerTotal > 21 ? 'Bust' : dealerTotal}`;
}

function deepCopy(o) { return JSON.parse(JSON.stringify(o)); }

/** Render table view (what the iPad shows) */
export function renderTableView(state, container, playerNames) {
  container.innerHTML = '';

  // Dealer area
  const dealerArea = document.createElement('div');
  dealerArea.id = 'dealer-area';
  dealerArea.style.cssText = 'text-align:center; margin-bottom:20px;';
  const dealerLabel = document.createElement('div');
  dealerLabel.style.cssText = 'color:rgba(201,168,76,0.7); font-size:12px; letter-spacing:2px; margin-bottom:8px; font-family:var(--font-display)';
  dealerLabel.textContent = 'DEALER';
  const dealerCards = document.createElement('div');
  dealerCards.style.cssText = 'display:flex; justify-content:center; gap:8px; flex-wrap:wrap;';

  if (state.dealer.hand.length > 0) {
    state.dealer.hand.forEach((card, i) => {
      const faceDown = (state.phase === 'playing' && i === 1);
      dealerCards.appendChild(renderCard(faceDown ? null : card, { faceDown, delay: i * 80 }));
    });
    if (state.phase !== 'playing') {
      const total = blackjackTotal(state.dealer.hand);
      dealerLabel.textContent = `DEALER — ${total > 21 ? '💀 BUST' : total}`;
    }
  } else {
    dealerCards.innerHTML = '<div class="card-slot">🂠</div><div class="card-slot">🂠</div>';
  }
  dealerArea.appendChild(dealerLabel);
  dealerArea.appendChild(dealerCards);
  container.appendChild(dealerArea);

  // Players area
  const playersArea = document.createElement('div');
  playersArea.style.cssText = 'display:flex; gap:16px; justify-content:center; flex-wrap:wrap; margin-top:8px;';

  for (const [pid, player] of Object.entries(state.players)) {
    const pArea = document.createElement('div');
    pArea.style.cssText = 'text-align:center; min-width:80px;';
    const name = playerNames?.[pid] || pid;
    const total = blackjackTotal(player.hand || []);
    const isCurrent = state.currentPlayer === pid && state.phase === 'playing';

    let statusColor = '#888';
    if (player.status === 'bust') statusColor = '#e74c3c';
    else if (player.result === 'win') statusColor = '#2ecc71';
    else if (player.result === 'push') statusColor = '#f39c12';
    else if (isCurrent) statusColor = '#c9a84c';

    pArea.innerHTML = `<div style="font-size:11px; letter-spacing:1px; color:${statusColor}; margin-bottom:6px; font-family:var(--font-display)">${name}${isCurrent ? ' ●' : ''}</div>`;

    const cards = document.createElement('div');
    cards.style.cssText = 'display:flex; gap:4px; justify-content:center;';
    (player.hand || []).forEach((card, i) => {
      const cardEl = renderCard(card, { delay: i * 80 });
      cards.appendChild(cardEl);
    });
    if (!player.hand?.length) cards.innerHTML = '<div class="card-slot">?</div><div class="card-slot">?</div>';
    pArea.appendChild(cards);

    const info = document.createElement('div');
    info.style.cssText = `font-size:11px; margin-top:6px; color:${statusColor}`;
    if (player.hand?.length) {
      let resultText = player.result ? player.result.toUpperCase() : (player.status === 'bust' ? 'BUST' : String(total));
      info.textContent = resultText;
    }
    pArea.appendChild(info);
    playersArea.appendChild(pArea);
  }
  container.appendChild(playersArea);
}

/** What the phone sees for their hand */
export function renderHandView(state, playerId, container) {
  container.innerHTML = '';
  const player = state.players?.[playerId];
  if (!player) { container.innerHTML = '<p style="color:#888">Waiting for game to start…</p>'; return; }

  const total = blackjackTotal(player.hand || []);
  const isCurrent = state.currentPlayer === playerId && state.phase === 'playing';

  // Hand total
  const totalEl = document.createElement('div');
  totalEl.style.cssText = 'font-size:20px; font-family:var(--font-display); color:var(--gold); text-align:center; margin-bottom:16px; letter-spacing:2px;';
  totalEl.textContent = player.hand?.length ? `Total: ${total}${total > 21 ? ' 💀' : ''}` : 'Waiting for deal…';
  container.appendChild(totalEl);

  // Cards
  const cardRow = document.createElement('div');
  cardRow.style.cssText = 'display:flex; gap:12px; justify-content:center; flex-wrap:wrap; margin-bottom:20px;';
  (player.hand || []).forEach((card, i) => {
    const { renderCardLarge } = window._deck;
    cardRow.appendChild(renderCardLarge(card, { delay: i * 100 }));
  });
  container.appendChild(cardRow);

  // Result display
  if (player.result) {
    const resultEl = document.createElement('div');
    const resultColors = { win:'#2ecc71', lose:'#e74c3c', push:'#f39c12', bust:'#e74c3c' };
    const resultEmoji = { win:'🎉', lose:'😔', push:'🤝', bust:'💀' };
    const r = player.result;
    resultEl.style.cssText = `font-size:28px; text-align:center; color:${resultColors[r] || '#888'}; font-family:var(--font-display); letter-spacing:3px; margin-bottom:12px;`;
    resultEl.textContent = (resultEmoji[r] || '') + ' ' + r.toUpperCase();
    container.appendChild(resultEl);
    const chipsEl = document.createElement('div');
    chipsEl.style.cssText = 'text-align:center; font-size:14px; color:rgba(201,168,76,0.7)';
    chipsEl.textContent = `💰 ${player.chips} chips`;
    container.appendChild(chipsEl);
  }

  return { isCurrent, player, total };
}

/** Get available actions for a player */
export function getActions(state, playerId) {
  if (state.phase !== 'playing') return [];
  if (state.currentPlayer !== playerId) return [];
  const player = state.players[playerId];
  if (!player || player.status !== 'playing') return [];
  const actions = ['hit', 'stand'];
  if (player.hand?.length === 2 && player.chips >= player.bet) actions.push('double');
  return actions;
}
