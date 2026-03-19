const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

const isPkg = typeof process.pkg !== 'undefined';
const baseDir = isPkg ? path.dirname(process.execPath) : __dirname;

// Game state
const state = {
  phase: 'setup',  // setup | player-turn | rolling | waiting-draw | card-reveal | timer-running | turn-end
  players: [],
  currentPlayerIndex: 0,
  lastRoll: null,
  lastCategory: null,
  lastCard: null,
  timerSeconds: 30,
  timerRunning: false,
  cardDecks: {},       // { categoryId: [shuffled array of card indices] }
  categoryQueue: [],   // Shuffled queue of category IDs for even distribution
  round: 1
};

// Serve static files
const publicDir = path.join(__dirname, 'public');
app.use('/host', express.static(path.join(publicDir, 'host')));
app.use('/display', express.static(path.join(publicDir, 'display')));
app.use('/shared', express.static(path.join(publicDir, 'shared')));

// Routes
app.get('/', (req, res) => res.redirect('/display'));
app.get('/host', (req, res) => res.sendFile(path.join(publicDir, 'host', 'index.html')));
app.get('/host/', (req, res) => res.sendFile(path.join(publicDir, 'host', 'index.html')));
app.get('/display', (req, res) => res.sendFile(path.join(publicDir, 'display', 'index.html')));
app.get('/display/', (req, res) => res.sendFile(path.join(publicDir, 'display', 'index.html')));

// API
app.get('/api/cards', (req, res) => {
  try {
    const data = loadCards();
    const summary = data.categories.map(cat => {
      const deck = state.cardDecks[cat.id];
      const remaining = deck ? deck.length : cat.cards.length;
      return {
        id: cat.id, name: cat.name, color: cat.color, icon: cat.icon,
        total: cat.cards.length, remaining: remaining
      };
    });
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function loadCards() {
  return JSON.parse(fs.readFileSync(path.join(baseDir, 'cards.json'), 'utf8'));
}

function getFullState() {
  const cardCounts = {};
  for (const [catId, deck] of Object.entries(state.cardDecks)) {
    cardCounts[catId] = deck.length;
  }
  return {
    phase: state.phase,
    players: state.players,
    currentPlayerIndex: state.currentPlayerIndex,
    lastRoll: state.lastRoll,
    lastCategory: state.lastCategory,
    lastCard: state.lastCard,
    timerSeconds: state.timerSeconds,
    timerRunning: state.timerRunning,
    cardCounts: cardCounts,
    round: state.round
  };
}

// Fisher-Yates shuffle
function shuffle(array) {
  const arr = [...array];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function buildCardDeck(categoryCards) {
  return shuffle(categoryCards.map((_, i) => i));
}

function buildCategoryQueue() {
  state.categoryQueue = shuffle([1, 2, 3, 4, 5, 6]);
}

function getNextCategory() {
  if (state.categoryQueue.length === 0) buildCategoryQueue();
  return state.categoryQueue.pop();
}

let timerInterval = null;

function startTimer(seconds) {
  clearInterval(timerInterval);
  state.timerSeconds = seconds;
  state.timerRunning = true;
  state.phase = 'timer-running';
  io.emit('timer-start', { seconds });
  timerInterval = setInterval(() => {
    state.timerSeconds--;
    io.emit('timer-tick', { seconds: state.timerSeconds });
    if (state.timerSeconds <= 0) {
      clearInterval(timerInterval);
      state.timerRunning = false;
      state.phase = 'turn-end';
      io.emit('timer-end', { state: getFullState() });
    }
  }, 1000);
}

function stopTimer() {
  clearInterval(timerInterval);
  state.timerRunning = false;
  state.phase = 'turn-end';
  io.emit('timer-stop', { state: getFullState() });
}

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);
  socket.emit('state-sync', getFullState());

  // Start game
  socket.on('start-game', (players) => {
    if (Array.isArray(players) && players.length >= 2) {
      state.players = players.map(p => String(p).trim()).filter(p => p.length > 0);
      state.currentPlayerIndex = 0;
      state.lastRoll = null;
      state.lastCategory = null;
      state.lastCard = null;
      state.phase = 'player-turn';
      state.round = 1;

      // Build shuffled card decks per category
      state.cardDecks = {};
      try {
        const data = loadCards();
        data.categories.forEach(cat => {
          state.cardDecks[cat.id] = buildCardDeck(cat.cards);
        });
      } catch (e) {
        console.log('Error loading cards:', e.message);
      }
      buildCategoryQueue();
      io.emit('game-started', { state: getFullState() });
    } else {
      socket.emit('error-msg', { message: 'Need at least 2 players to start!' });
    }
  });

  // Roll dice — picks a CATEGORY (shown after dice lands)
  // Card TYPE (Wild/ILY/standard) remains hidden until reveal
  socket.on('roll-dice', () => {
    if (state.phase !== 'player-turn') return;

    const categoryId = getNextCategory();
    try {
      const data = loadCards();
      const category = data.categories.find(c => c.id === categoryId);
      state.lastRoll = categoryId;
      state.lastCategory = category ? { id: category.id, name: category.name, color: category.color, icon: category.icon } : null;
      state.lastCard = null;
      state.phase = 'rolling';

      // Send dice roll — category will be shown on dice face
      io.emit('dice-result', { roll: categoryId, category: state.lastCategory, state: getFullState() });

      // After dice animation, transition to waiting-draw (face-down card + category shown)
      setTimeout(() => {
        state.phase = 'waiting-draw';
        io.emit('dice-settled', { category: state.lastCategory, state: getFullState() });
      }, 7500);
    } catch (err) {
      socket.emit('error-msg', { message: err.message });
    }
  });

  // Reveal card — pop from category deck
  // THIS is the only moment the card TYPE is revealed
  socket.on('draw-card', () => {
    if (state.phase !== 'waiting-draw') return;

    try {
      const data = loadCards();
      const category = data.categories.find(c => c.id === state.lastRoll);
      if (!category) return;

      // Reshuffle if deck exhausted
      if (!state.cardDecks[category.id] || state.cardDecks[category.id].length === 0) {
        state.cardDecks[category.id] = buildCardDeck(category.cards);
      }

      const pickedIndex = state.cardDecks[category.id].pop();
      const picked = category.cards[pickedIndex];

      const isWild = picked.text.startsWith('\ud83c\udccf WILD') || picked.text.startsWith('WILD');
      const isILoveYou = picked.text.startsWith('\u2764\ufe0f I LOVE YOU') || picked.text.startsWith('I LOVE YOU');

      state.lastCard = {
        text: picked.text,
        category: state.lastCategory,
        timer: picked.timer || null,
        tone: picked.tone || null,
        isWild: isWild,
        isILoveYou: isILoveYou
      };
      state.phase = 'card-reveal';
      io.emit('card-drawn', { card: state.lastCard, state: getFullState() });
    } catch (err) {
      socket.emit('error-msg', { message: err.message });
    }
  });

  socket.on('start-timer', (data) => startTimer((data && data.seconds) || 30));
  socket.on('stop-timer', () => stopTimer());
  socket.on('complete-turn', () => {
    clearInterval(timerInterval);
    state.timerRunning = false;
    state.phase = 'turn-end';
    io.emit('turn-completed', { state: getFullState() });
  });

  socket.on('next-player', () => {
    state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
    if (state.currentPlayerIndex === 0) state.round++;
    state.lastRoll = null;
    state.lastCategory = null;
    state.lastCard = null;
    state.phase = 'player-turn';
    clearInterval(timerInterval);
    state.timerRunning = false;
    io.emit('player-changed', {
      player: state.players[state.currentPlayerIndex],
      index: state.currentPlayerIndex,
      round: state.round,
      state: getFullState()
    });
  });

  socket.on('reset-game', () => {
    state.phase = 'setup';
    state.players = [];
    state.currentPlayerIndex = 0;
    state.lastRoll = null;
    state.lastCategory = null;
    state.lastCard = null;
    state.cardDecks = {};
    state.categoryQueue = [];
    state.round = 1;
    clearInterval(timerInterval);
    state.timerRunning = false;
    io.emit('state-sync', getFullState());
  });

  socket.on('disconnect', () => console.log('Client disconnected:', socket.id));
});

if (isPkg) {
  const externalCards = path.join(baseDir, 'cards.json');
  if (!fs.existsSync(externalCards)) {
    fs.copyFileSync(path.join(__dirname, 'cards.json'), externalCards);
  }
}

server.listen(PORT, () => {
  console.log(`\n  TV Party Game is running!\n`);
  console.log(`  Host dashboard:  http://localhost:${PORT}/host`);
  console.log(`  TV display:      http://localhost:${PORT}/display\n`);
});
