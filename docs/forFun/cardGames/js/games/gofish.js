// ===== GAME ENGINE: GO FISH =====
import { createDeck, shuffle, renderCard } from '../deck.js';

export const GAME_ID = 'gofish';
export const DISPLAY_NAME = 'Go Fish';
export const MIN_PLAYERS = 2;
export const MAX_PLAYERS = 5;
export const DESCRIPTION = 'Collect sets of 4. Ask players for cards or Go Fish!';

const HAND_SIZE = { 2: 7, 3: 6, 4: 6, 5: 5 };

export function initState(playerIds) {
  const deck = shuffle(createDeck());
  const handSize = HAND_SIZE[playerIds.length] || 5;
  const players = {};
  for (const pid of playerIds) {
    players[pid] = {
      hand: deck.splice(0, handSize),
      books: [], // completed sets of 4
    };
  }
  return {
    game: GAME_ID,
    phase: 'playing',
    deck,
    players,
    playerOrder: playerIds,
    currentPlayer: playerIds[0],
    message: `${playerIds[0]}'s turn — ask for a rank!`,
    lastAction: null,
    round: 0
  };
}

/** Ask another player for a rank. Returns new state. */
export function askForRank(state, askingPid, targetPid, rank) {
  if (state.currentPlayer !== askingPid) return state;
  const s = deepCopy(state);
  const asker = s.players[askingPid];
  const target = s.players[targetPid];

  const matching = target.hand.filter(c => c.rank === rank);
  if (matching.length > 0) {
    // Target gives all matching cards
    target.hand = target.hand.filter(c => c.rank !== rank);
    asker.hand.push(...matching);
    s.message = `${targetPid} had ${matching.length} ${rank}(s)! ${askingPid} gets them.`;
    s.lastAction = { type: 'got', from: targetPid, rank, count: matching.length };
    // Check for books
    checkBooks(s, askingPid);
    // Check if game over
    if (checkGameOver(s)) return s;
    // Same player goes again
  } else {
    // Go Fish!
    const drawn = s.deck.pop();
    s.lastAction = { type: 'gofish', rank };
    if (drawn) {
      asker.hand.push(drawn);
      if (drawn.rank === rank) {
        s.message = `Go Fish! ${askingPid} drew a ${rank}! Go again.`;
        checkBooks(s, askingPid);
      } else {
        s.message = `Go Fish! ${askingPid} drew ${drawn.rank}${drawn.suit}.`;
        // Next player's turn
        advanceTurn(s);
      }
    } else {
      s.message = `Go Fish! No cards left in the pond.`;
      advanceTurn(s);
    }
    if (checkGameOver(s)) return s;
  }
  return s;
}

function checkBooks(s, pid) {
  const player = s.players[pid];
  const counts = {};
  for (const c of player.hand) counts[c.rank] = (counts[c.rank] || 0) + 1;
  for (const [rank, count] of Object.entries(counts)) {
    if (count >= 4) {
      player.books.push(rank);
      player.hand = player.hand.filter(c => c.rank !== rank);
      if (!s.message.includes('Book!')) s.message += ` 📚 Book of ${rank}s!`;
    }
  }
}

function advanceTurn(s) {
  const idx = s.playerOrder.indexOf(s.currentPlayer);
  s.currentPlayer = s.playerOrder[(idx + 1) % s.playerOrder.length];
  s.round++;
  if (!s.message.includes('Go Fish') && !s.message.includes('Book')) {
    s.message = `${s.currentPlayer}'s turn.`;
  }
}

function checkGameOver(s) {
  if (s.deck.length === 0 && s.playerOrder.every(pid => s.players[pid].hand.length === 0)) {
    let maxBooks = 0;
    let winner = null;
    for (const [pid, player] of Object.entries(s.players)) {
      if (player.books.length > maxBooks) { maxBooks = player.books.length; winner = pid; }
    }
    s.phase = 'done';
    const scores = s.playerOrder.map(pid => `${pid}: ${s.players[pid].books.length}`).join(' · ');
    s.message = `🏆 ${winner} wins with ${maxBooks} books! | ${scores}`;
    return true;
  }
  return false;
}

export function getActions(state, playerId) {
  if (state.phase !== 'playing') return [];
  if (state.currentPlayer !== playerId) return [];
  return ['ask'];
}

export function renderTableView(state, container, playerNames) {
  container.innerHTML = '';

  for (const [pid, player] of Object.entries(state.players)) {
    const name = playerNames?.[pid] || pid;
    const isCurrent = state.currentPlayer === pid;
    const pRow = document.createElement('div');
    pRow.style.cssText = 'display:flex; align-items:center; gap:12px; margin-bottom:16px;';

    const nameEl = document.createElement('div');
    nameEl.style.cssText = `min-width:70px; font-size:12px; font-family:var(--font-display); letter-spacing:1px; color:${isCurrent ? 'var(--gold)' : '#888'}`;
    nameEl.textContent = name + (isCurrent ? ' ●' : '');
    pRow.appendChild(nameEl);

    const cardStack = document.createElement('div');
    cardStack.style.cssText = 'display:flex; flex: 1; gap:-20px; position:relative; height:50px;';

    // Show back-of-cards stack (private)
    for (let i = 0; i < Math.min(player.hand.length, 8); i++) {
      const mini = document.createElement('div');
      mini.style.cssText = `position:absolute; left:${i * 12}px; width:35px; height:50px; border-radius:4px; background:linear-gradient(135deg,#1a237e,#283593); border:1px solid rgba(255,255,255,0.15); box-shadow:0 2px 6px rgba(0,0,0,0.4);`;
      cardStack.appendChild(mini);
    }
    pRow.appendChild(cardStack);

    const stats = document.createElement('div');
    stats.style.cssText = 'text-align:right; min-width:80px; font-size:11px; color:#888;';
    stats.innerHTML = `<div>${player.hand.length} cards</div><div style="color:var(--gold)">📚 ${player.books.length} books</div>`;
    pRow.appendChild(stats);
    container.appendChild(pRow);
  }

  // Pond
  const pond = document.createElement('div');
  pond.style.cssText = 'text-align:center; margin-top:8px; font-size:12px; color:rgba(201,168,76,0.6)';
  pond.textContent = `🐟 Pond: ${state.deck.length} cards`;
  container.appendChild(pond);
}

export function renderHandView(state, playerId, container) {
  container.innerHTML = '';
  const player = state.players?.[playerId];
  if (!player) return;

  const booksEl = document.createElement('div');
  booksEl.style.cssText = 'text-align:center; margin-bottom:12px;';
  booksEl.innerHTML = player.books.length
    ? `<div style="font-size:13px; color:var(--gold)">📚 Books: ${player.books.map(r => `<strong>${r}s</strong>`).join(', ')}</div>`
    : `<div style="font-size:11px; color:#666; letter-spacing:1px">NO BOOKS YET</div>`;
  container.appendChild(booksEl);

  // Group hand by rank for display
  const grouped = {};
  for (const c of player.hand) grouped[c.rank] = (grouped[c.rank] || []).concat(c);

  const handArea = document.createElement('div');
  handArea.style.cssText = 'display:flex; flex-wrap:wrap; gap:8px; justify-content:center;';
  for (const [rank, cards] of Object.entries(grouped)) {
    const rankGroup = document.createElement('div');
    rankGroup.style.cssText = 'display:flex; gap:-8px; position:relative;';
    cards.forEach((card, i) => {
      const { renderCardLarge } = window._deck;
      const el = renderCardLarge(card);
      el.style.position = i > 0 ? 'absolute' : 'relative';
      el.style.left = (i * 16) + 'px';
      el.style.zIndex = i;
      rankGroup.appendChild(el);
    });
    rankGroup.style.width = (90 + (cards.length - 1) * 16) + 'px';
    handArea.appendChild(rankGroup);
  }
  container.appendChild(handArea);
  return { player };
}

function deepCopy(o) { return JSON.parse(JSON.stringify(o)); }
