const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// When running as pkg exe, __dirname is inside snapshot.
// cards.json should be next to the exe so user can edit it.
const isPkg = typeof process.pkg !== 'undefined';
const baseDir = isPkg ? path.dirname(process.execPath) : __dirname;

// Game state
const state = {
  phase: 'setup',  // setup | player-turn | rolling | category-reveal | waiting-draw | card-reveal | timer-running | turn-end
  players: [],
  currentPlayerIndex: 0,
  lastRoll: null,
  lastCategory: null,
  lastCard: null,
  timerSeconds: 30,
  timerRunning: false,
  cardDecks: {},       // { categoryId: [shuffled array of card indices] }
  categoryQueue: [],   // Shuffled queue of category IDs
  round: 1
};

// Pre-load all static files into memory at startup (works in both pkg and dev)
const staticFiles = {};
const mimeTypes = { '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript' };

// These path.join(__dirname, ...) calls let pkg detect and bundle the files
const fileMappings = [
  ['/host', path.join(__dirname, 'public', 'host', 'index.html')],
  ['/host/', path.join(__dirname, 'public', 'host', 'index.html')],
  ['/host/index.html', path.join(__dirname, 'public', 'host', 'index.html')],
  ['/host/host.css', path.join(__dirname, 'public', 'host', 'host.css')],
  ['/host/host.js', path.join(__dirname, 'public', 'host', 'host.js')],
  ['/display', path.join(__dirname, 'public', 'display', 'index.html')],
  ['/display/', path.join(__dirname, 'public', 'display', 'index.html')],
  ['/display/index.html', path.join(__dirname, 'public', 'display', 'index.html')],
  ['/display/display.css', path.join(__dirname, 'public', 'display', 'display.css')],
  ['/display/display.js', path.join(__dirname, 'public', 'display', 'display.js')]
];

// Load all files into memory
fileMappings.forEach(([route, filePath]) => {
  try {
    staticFiles[route] = {
      content: fs.readFileSync(filePath, 'utf8'),
      mime: mimeTypes[path.extname(filePath)] || 'text/plain'
    };
  } catch (e) {
    console.log('  Warning: Could not load', filePath);
  }
});

// Serve pre-loaded files
fileMappings.forEach(([route]) => {
  app.get(route, (req, res) => {
    const file = staticFiles[route];
    if (file) {
      res.type(file.mime).send(file.content);
    } else {
      res.status(404).send('File not found');
    }
  });
});

// Routes
app.get('/', (req, res) => res.redirect('/display'));

// API to get cards (with accurate remaining counts from shuffled decks)
app.get('/api/cards', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(baseDir, 'cards.json'), 'utf8'));
    const summary = data.categories.map(cat => {
      const deck = state.cardDecks[cat.id];
      const remaining = deck ? deck.length : cat.cards.length;
      return {
        id: cat.id,
        name: cat.name,
        color: cat.color,
        icon: cat.icon,
        total: cat.cards.length,
        remaining: remaining
      };
    });
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read cards.json: ' + err.message });
  }
});

function loadCards() {
  return JSON.parse(fs.readFileSync(path.join(baseDir, 'cards.json'), 'utf8'));
}

// Serialize state for clients (cardDecks only sends counts, not indices)
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

// Build shuffled card deck for a category (array of indices)
function buildCardDeck(categoryCards) {
  const indices = categoryCards.map((_, i) => i);
  return shuffle(indices);
}

// Build a shuffled category queue (ensures even distribution)
function buildCategoryQueue() {
  const ids = [1, 2, 3, 4, 5, 6];
  state.categoryQueue = shuffle(ids);
}

// Get next category from shuffled queue (refill when empty)
function getNextCategory() {
  if (state.categoryQueue.length === 0) {
    buildCategoryQueue();
  }
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

  // Start game with players
  socket.on('start-game', (players) => {
    if (Array.isArray(players) && players.length >= 2) {
      state.players = players.map(p => String(p).trim()).filter(p => p.length > 0);
      state.currentPlayerIndex = 0;
      state.lastRoll = null;
      state.lastCategory = null;
      state.lastCard = null;
      state.phase = 'player-turn';
      state.round = 1;

      // Build pre-shuffled card decks for each category
      state.cardDecks = {};
      try {
        const data = loadCards();
        data.categories.forEach(cat => {
          state.cardDecks[cat.id] = buildCardDeck(cat.cards);
        });
      } catch (e) {
        console.log('Error loading cards:', e.message);
      }

      // Build initial shuffled category queue
      buildCategoryQueue();

      io.emit('game-started', { state: getFullState() });
    } else {
      socket.emit('error-msg', { message: 'Need at least 2 players to start!' });
    }
  });

  // Roll dice (uses shuffled queue for even distribution)
  socket.on('roll-dice', () => {
    if (state.phase !== 'player-turn') {
      socket.emit('error-msg', { message: 'Cannot roll now!' });
      return;
    }

    const categoryId = getNextCategory();
    try {
      const data = loadCards();
      const category = data.categories.find(c => c.id === categoryId);
      state.lastRoll = categoryId;
      state.lastCategory = category ? { id: category.id, name: category.name, color: category.color, icon: category.icon } : null;
      state.lastCard = null;
      state.phase = 'rolling';

      // Send the dice roll (categories shown on dice faces during animation)
      io.emit('dice-result', { roll: categoryId, category: state.lastCategory, state: getFullState() });

      // After dice animation completes (~7s), show category reveal then move to waiting-draw
      setTimeout(() => {
        state.phase = 'category-reveal';
        io.emit('category-reveal', { category: state.lastCategory, state: getFullState() });
      }, 7500);

      // After category reveal pause (~3s), move to waiting-draw
      setTimeout(() => {
        state.phase = 'waiting-draw';
        io.emit('dice-settled', { category: state.lastCategory, state: getFullState() });
      }, 10500);
    } catch (err) {
      socket.emit('error-msg', { message: 'Failed to read cards.json: ' + err.message });
    }
  });

  // Draw card (pop from pre-shuffled deck — guaranteed no repeats)
  socket.on('draw-card', () => {
    if (state.phase !== 'waiting-draw') {
      socket.emit('error-msg', { message: 'Wait for dice to settle first!' });
      return;
    }

    try {
      const data = loadCards();
      const category = data.categories.find(c => c.id === state.lastRoll);
      if (!category || category.cards.length === 0) {
        socket.emit('error-msg', { message: 'No cards in this category!' });
        return;
      }

      // Ensure deck exists
      if (!state.cardDecks[category.id] || state.cardDecks[category.id].length === 0) {
        // Deck exhausted — reshuffle
        state.cardDecks[category.id] = buildCardDeck(category.cards);
      }

      // Pop next card from shuffled deck
      const pickedIndex = state.cardDecks[category.id].pop();
      const picked = category.cards[pickedIndex];

      // Check if this is a Wild or I Love You card
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
      socket.emit('error-msg', { message: 'Failed to read cards.json: ' + err.message });
    }
  });

  // Start timer
  socket.on('start-timer', (data) => {
    const seconds = (data && data.seconds) || 30;
    startTimer(seconds);
  });

  // Stop timer
  socket.on('stop-timer', () => {
    stopTimer();
  });

  // Skip timer / complete turn
  socket.on('complete-turn', () => {
    clearInterval(timerInterval);
    state.timerRunning = false;
    state.phase = 'turn-end';
    io.emit('turn-completed', { state: getFullState() });
  });

  // Next player
  socket.on('next-player', () => {
    state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
    if (state.currentPlayerIndex === 0) {
      state.round++;
    }
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

  // Reset game
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

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

// If running as exe, copy cards.json next to exe if not present
if (isPkg) {
  const externalCards = path.join(baseDir, 'cards.json');
  if (!fs.existsSync(externalCards)) {
    const bundledCards = path.join(__dirname, 'cards.json');
    fs.copyFileSync(bundledCards, externalCards);
    console.log('Created cards.json next to exe — edit this file to add/change cards.');
  }
}

server.listen(PORT, () => {
  console.log(`\n  TV Party Game is running!\n`);
  console.log(`  Host dashboard:  http://localhost:${PORT}/host`);
  console.log(`  TV display:      http://localhost:${PORT}/display\n`);
});
