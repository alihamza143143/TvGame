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
  phase: 'setup',  // setup | player-turn | rolling | waiting-draw | card-reveal | timer-running | turn-end | game-over
  players: [],
  currentPlayerIndex: 0,
  lastCard: null,         // Only populated AFTER reveal
  timerSeconds: 30,
  timerRunning: false,
  masterDeck: [],         // Single shuffled deck of ALL 72 cards
  categoryCounts: {},     // { categoryId: { total: 12, remaining: 12 } }
  totalRemaining: 0,
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
    const summary = [];
    for (const [catId, counts] of Object.entries(state.categoryCounts)) {
      summary.push({ id: parseInt(catId), ...counts });
    }
    res.json({ categories: summary, totalRemaining: state.totalRemaining });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

function loadCards() {
  return JSON.parse(fs.readFileSync(path.join(baseDir, 'cards.json'), 'utf8'));
}

// State sent to clients — NEVER includes card info before reveal
function getFullState() {
  return {
    phase: state.phase,
    players: state.players,
    currentPlayerIndex: state.currentPlayerIndex,
    // Only send card info if phase is card-reveal or later
    lastCard: (state.phase === 'card-reveal' || state.phase === 'timer-running' || state.phase === 'turn-end') ? state.lastCard : null,
    timerSeconds: state.timerSeconds,
    timerRunning: state.timerRunning,
    categoryCounts: state.categoryCounts,
    totalRemaining: state.totalRemaining,
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

// Build ONE master deck of all 72 cards, shuffled once
function buildMasterDeck() {
  const data = loadCards();
  const allCards = [];

  state.categoryCounts = {};

  data.categories.forEach(cat => {
    state.categoryCounts[cat.id] = {
      name: cat.name, color: cat.color, icon: cat.icon,
      total: cat.cards.length, remaining: cat.cards.length
    };

    cat.cards.forEach((card, idx) => {
      const isWild = card.text.startsWith('\ud83c\udccf WILD') || card.text.startsWith('WILD');
      const isILoveYou = card.text.startsWith('\u2764\ufe0f I LOVE YOU') || card.text.startsWith('I LOVE YOU');

      allCards.push({
        categoryId: cat.id,
        categoryName: cat.name,
        categoryColor: cat.color,
        categoryIcon: cat.icon,
        cardIndex: idx,
        text: card.text,
        timer: card.timer || null,
        tone: card.tone || null,
        isWild: isWild,
        isILoveYou: isILoveYou
      });
    });
  });

  state.masterDeck = shuffle(allCards);
  state.totalRemaining = state.masterDeck.length;
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
      state.lastCard = null;
      state.phase = 'player-turn';
      state.round = 1;

      try {
        buildMasterDeck();
      } catch (e) {
        console.log('Error loading cards:', e.message);
      }

      io.emit('game-started', { state: getFullState() });
    } else {
      socket.emit('error-msg', { message: 'Need at least 2 players to start!' });
    }
  });

  // Roll dice — purely visual animation. Does NOT determine anything.
  socket.on('roll-dice', () => {
    if (state.phase !== 'player-turn') return;

    // Check if deck is empty
    if (state.masterDeck.length === 0) {
      state.phase = 'game-over';
      io.emit('game-over', { state: getFullState() });
      return;
    }

    state.lastCard = null;
    state.phase = 'rolling';

    // Send dice roll event (purely visual)
    io.emit('dice-result', { state: getFullState() });

    // After dice animation (5.5s), transition to waiting-draw (face-down card)
    setTimeout(() => {
      state.phase = 'waiting-draw';
      io.emit('dice-settled', { state: getFullState() });
    }, 5500);
  });

  // Reveal card — pop next card from the single shuffled master deck
  // THIS is the ONLY moment ANY card info is revealed
  socket.on('draw-card', () => {
    if (state.phase !== 'waiting-draw') return;

    // Check if deck is empty
    if (state.masterDeck.length === 0) {
      state.phase = 'game-over';
      io.emit('game-over', { state: getFullState() });
      return;
    }

    // Pop next card from shuffled deck
    const card = state.masterDeck.pop();

    // Update per-category count
    if (state.categoryCounts[card.categoryId]) {
      state.categoryCounts[card.categoryId].remaining--;
    }
    state.totalRemaining = state.masterDeck.length;

    state.lastCard = {
      text: card.text,
      category: {
        id: card.categoryId,
        name: card.categoryName,
        color: card.categoryColor,
        icon: card.categoryIcon
      },
      timer: card.timer,
      tone: card.tone,
      isWild: card.isWild,
      isILoveYou: card.isILoveYou
    };
    state.phase = 'card-reveal';

    // NOW send card info (only now is it visible)
    io.emit('card-drawn', { card: state.lastCard, state: getFullState() });
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
    // Check if deck is empty before moving to next player
    if (state.masterDeck.length === 0) {
      state.phase = 'game-over';
      io.emit('game-over', { state: getFullState() });
      return;
    }

    state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
    if (state.currentPlayerIndex === 0) state.round++;
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
    state.lastCard = null;
    state.masterDeck = [];
    state.categoryCounts = {};
    state.totalRemaining = 0;
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
