const socket = io();

// DOM elements
const connectionStatus = document.getElementById('connectionStatus');
const playerList = document.getElementById('playerList');
const addPlayerBtn = document.getElementById('addPlayerBtn');
const currentPlayerName = document.getElementById('currentPlayerName');
const rollDiceBtn = document.getElementById('rollDiceBtn');
const drawCardBtn = document.getElementById('drawCardBtn');
const nextPlayerBtn = document.getElementById('nextPlayerBtn');
const resetGameBtn = document.getElementById('resetGameBtn');
const lastRollEl = document.getElementById('lastRoll');
const lastCategoryEl = document.getElementById('lastCategory');
const lastCardEl = document.getElementById('lastCard');
const cardCountsEl = document.getElementById('cardCounts');
const errorMsgEl = document.getElementById('errorMsg');

let localPlayers = ['Team 1', 'Team 2'];

// Connection status
socket.on('connect', () => {
  connectionStatus.textContent = 'Connected';
  connectionStatus.className = 'connection-status connected';
});

socket.on('disconnect', () => {
  connectionStatus.textContent = 'Disconnected';
  connectionStatus.className = 'connection-status disconnected';
});

// Render player list
function renderPlayers() {
  playerList.innerHTML = '';
  localPlayers.forEach((name, i) => {
    const row = document.createElement('div');
    row.className = 'player-row';

    const input = document.createElement('input');
    input.type = 'text';
    input.value = name;
    input.placeholder = 'Player name';
    input.addEventListener('change', () => {
      localPlayers[i] = input.value;
      socket.emit('update-players', localPlayers);
    });

    const removeBtn = document.createElement('button');
    removeBtn.className = 'remove-btn';
    removeBtn.textContent = '×';
    removeBtn.addEventListener('click', () => {
      if (localPlayers.length > 1) {
        localPlayers.splice(i, 1);
        socket.emit('update-players', localPlayers);
        renderPlayers();
      }
    });

    row.appendChild(input);
    row.appendChild(removeBtn);
    playerList.appendChild(row);
  });
}

addPlayerBtn.addEventListener('click', () => {
  localPlayers.push('Player ' + (localPlayers.length + 1));
  socket.emit('update-players', localPlayers);
  renderPlayers();
});

// Update UI from state
function updateUI(state) {
  if (state.players) {
    localPlayers = [...state.players];
    renderPlayers();
  }

  currentPlayerName.textContent = state.players[state.currentPlayerIndex] || '—';

  // Button states
  rollDiceBtn.disabled = (state.phase === 'rolled');
  drawCardBtn.disabled = (state.phase !== 'rolled');

  // Status
  if (state.lastRoll) {
    lastRollEl.textContent = state.lastRoll;
  } else {
    lastRollEl.textContent = '—';
  }

  if (state.lastCategory) {
    lastCategoryEl.textContent = state.lastCategory.icon + ' ' + state.lastCategory.name;
    lastCategoryEl.style.color = state.lastCategory.color;
  } else {
    lastCategoryEl.textContent = '—';
    lastCategoryEl.style.color = '';
  }

  if (state.lastCard) {
    lastCardEl.textContent = state.lastCard.text;
  } else {
    lastCardEl.textContent = '—';
  }

  // Fetch card counts
  fetchCardCounts();
}

async function fetchCardCounts() {
  try {
    const res = await fetch('/api/cards');
    const data = await res.json();
    cardCountsEl.innerHTML = '';
    data.forEach(cat => {
      const item = document.createElement('div');
      item.className = 'card-count-item';
      item.innerHTML = `<span class="cat-name">${cat.name}</span><span>${cat.remaining}/${cat.total}</span>`;
      cardCountsEl.appendChild(item);
    });
  } catch (err) {
    // Silently fail on card count fetch
  }
}

// Button handlers
rollDiceBtn.addEventListener('click', () => {
  socket.emit('roll-dice');
});

drawCardBtn.addEventListener('click', () => {
  socket.emit('draw-card');
});

nextPlayerBtn.addEventListener('click', () => {
  socket.emit('next-player');
});

resetGameBtn.addEventListener('click', () => {
  if (confirm('Reset the game? This will clear all progress.')) {
    socket.emit('reset-game');
  }
});

// Socket events
socket.on('state-sync', (state) => {
  updateUI(state);
});

socket.on('dice-result', (data) => {
  updateUI(data.state);
});

socket.on('card-drawn', (data) => {
  updateUI(data.state);
});

socket.on('player-changed', (data) => {
  updateUI(data.state);
});

socket.on('error-msg', (data) => {
  errorMsgEl.textContent = data.message;
  errorMsgEl.style.display = 'block';
  setTimeout(() => {
    errorMsgEl.style.display = 'none';
  }, 4000);
});

// Initial render
renderPlayers();
