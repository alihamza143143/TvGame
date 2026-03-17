const socket = io();

// DOM
const connectionStatus = document.getElementById('connectionStatus');
const setupScreen = document.getElementById('setupScreen');
const gameScreen = document.getElementById('gameScreen');
const playerInputs = document.getElementById('playerInputs');
const addPlayerBtn = document.getElementById('addPlayerBtn');
const removePlayerBtn = document.getElementById('removePlayerBtn');
const startGameBtn = document.getElementById('startGameBtn');
const currentPlayerName = document.getElementById('currentPlayerName');
const roundNum = document.getElementById('roundNum');
const playerDots = document.getElementById('playerDots');
const rollDiceBtn = document.getElementById('rollDiceBtn');
const drawCardBtn = document.getElementById('drawCardBtn');
const timerControls = document.getElementById('timerControls');
const startTimerBtn = document.getElementById('startTimerBtn');
const skipTimerBtn = document.getElementById('skipTimerBtn');
const nextPlayerBtn = document.getElementById('nextPlayerBtn');
const resetGameBtn = document.getElementById('resetGameBtn');
const phaseDisplay = document.getElementById('phaseDisplay');
const categoryDisplay = document.getElementById('categoryDisplay');
const cardDisplay = document.getElementById('cardDisplay');
const cardCountsEl = document.getElementById('cardCounts');
const errorMsgEl = document.getElementById('errorMsg');

let playerCount = 3;
let selectedTimer = 60;

// Connection
socket.on('connect', () => {
  connectionStatus.textContent = 'Connected';
  connectionStatus.className = 'connection-status connected';
});

socket.on('disconnect', () => {
  connectionStatus.textContent = 'Disconnected';
  connectionStatus.className = 'connection-status disconnected';
});

// Setup screen
function renderPlayerInputs() {
  playerInputs.innerHTML = '';
  for (let i = 0; i < playerCount; i++) {
    const row = document.createElement('div');
    row.className = 'player-input-row';
    row.innerHTML = `
      <div class="player-number">${i + 1}</div>
      <input type="text" class="player-name-input" placeholder="Player ${i + 1}" maxlength="20">
    `;
    playerInputs.appendChild(row);
  }
}

addPlayerBtn.addEventListener('click', () => {
  if (playerCount < 6) {
    playerCount++;
    renderPlayerInputs();
  }
});

removePlayerBtn.addEventListener('click', () => {
  if (playerCount > 2) {
    playerCount--;
    renderPlayerInputs();
  }
});

startGameBtn.addEventListener('click', () => {
  const inputs = document.querySelectorAll('.player-name-input');
  const names = [];
  inputs.forEach((input, i) => {
    const name = input.value.trim() || `Player ${i + 1}`;
    names.push(name);
  });
  socket.emit('start-game', names);
});

// Timer presets
document.querySelectorAll('.timer-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.timer-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    selectedTimer = parseInt(btn.dataset.time);
  });
});

startTimerBtn.addEventListener('click', () => {
  socket.emit('start-timer', { seconds: selectedTimer });
});

skipTimerBtn.addEventListener('click', () => {
  socket.emit('complete-turn');
});

// Game buttons
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
  if (confirm('End the game and return to setup?')) {
    socket.emit('reset-game');
  }
});

// Show correct screen
function showScreen(screen) {
  setupScreen.classList.remove('active');
  gameScreen.classList.remove('active');
  screen.classList.add('active');
}

// Update buttons based on phase
function updateButtons(phase) {
  rollDiceBtn.style.display = 'none';
  drawCardBtn.style.display = 'none';
  timerControls.style.display = 'none';
  nextPlayerBtn.style.display = 'none';

  switch (phase) {
    case 'player-turn':
      rollDiceBtn.style.display = 'block';
      rollDiceBtn.disabled = false;
      break;
    case 'rolling':
      rollDiceBtn.style.display = 'block';
      rollDiceBtn.disabled = true;
      break;
    case 'category-reveal':
      drawCardBtn.style.display = 'block';
      drawCardBtn.disabled = false;
      break;
    case 'card-reveal':
      if (lastCardHasTimer) {
        timerControls.style.display = 'flex';
      } else {
        nextPlayerBtn.style.display = 'block';
      }
      break;
    case 'timer-running':
      timerControls.style.display = 'flex';
      startTimerBtn.disabled = true;
      startTimerBtn.textContent = 'Timer Running...';
      break;
    case 'turn-end':
      nextPlayerBtn.style.display = 'block';
      break;
  }

  // Reset timer button
  if (phase !== 'timer-running') {
    startTimerBtn.disabled = false;
    startTimerBtn.textContent = 'Start Timer';
  }
}

// Render player dots
function renderDots(players, currentIndex) {
  playerDots.innerHTML = '';
  players.forEach((_, i) => {
    const dot = document.createElement('div');
    dot.className = 'player-dot' + (i === currentIndex ? ' active' : '');
    playerDots.appendChild(dot);
  });
}

// Phase labels
const phaseLabels = {
  'setup': 'Setup',
  'player-turn': 'Waiting to roll',
  'rolling': 'Rolling dice...',
  'category-reveal': 'Category revealed!',
  'card-reveal': 'Card shown',
  'timer-running': 'Timer running',
  'turn-end': 'Turn complete'
};

// Update full UI
function updateUI(gameState) {
  if (gameState.phase === 'setup') {
    showScreen(setupScreen);
    return;
  }

  showScreen(gameScreen);
  currentPlayerName.textContent = gameState.players[gameState.currentPlayerIndex] || '-';
  roundNum.textContent = gameState.round || 1;
  renderDots(gameState.players, gameState.currentPlayerIndex);
  updateButtons(gameState.phase);

  phaseDisplay.textContent = phaseLabels[gameState.phase] || gameState.phase;

  if (gameState.lastCategory) {
    categoryDisplay.textContent = gameState.lastCategory.icon + ' ' + gameState.lastCategory.name;
    categoryDisplay.style.color = gameState.lastCategory.color;
  } else {
    categoryDisplay.textContent = '-';
    categoryDisplay.style.color = '';
  }

  if (gameState.lastCard) {
    cardDisplay.textContent = gameState.lastCard.text.substring(0, 50) + (gameState.lastCard.text.length > 50 ? '...' : '');
  } else {
    cardDisplay.textContent = '-';
  }

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
      item.innerHTML = `<span class="cat-name">${cat.name}</span><span class="cat-count">${cat.remaining}/${cat.total}</span>`;
      cardCountsEl.appendChild(item);
    });
  } catch (err) { /* silent */ }
}

// Socket events
socket.on('state-sync', (s) => updateUI(s));
socket.on('game-started', (data) => updateUI(data.state));
socket.on('dice-result', (data) => updateUI(data.state));
socket.on('category-revealed', (data) => updateUI(data.state));
let lastCardHasTimer = false;
socket.on('card-drawn', (data) => {
  lastCardHasTimer = !!(data.card && data.card.timer);
  updateUI(data.state);
});
socket.on('timer-start', () => {
  startTimerBtn.disabled = true;
  startTimerBtn.textContent = 'Timer Running...';
});
socket.on('timer-tick', (data) => {
  startTimerBtn.textContent = `Timer: ${data.seconds}s`;
});
socket.on('timer-end', (data) => updateUI(data.state));
socket.on('timer-stop', (data) => updateUI(data.state));
socket.on('turn-completed', (data) => updateUI(data.state));
socket.on('player-changed', (data) => updateUI(data.state));

socket.on('error-msg', (data) => {
  errorMsgEl.textContent = data.message;
  errorMsgEl.style.display = 'block';
  setTimeout(() => { errorMsgEl.style.display = 'none'; }, 3000);
});

// Init
renderPlayerInputs();
