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
  phase: 'setup',  // setup | player-turn | rolling | waiting-draw | card-reveal | timer-running | turn-end
  players: [],
  currentPlayerIndex: 0,
  lastCard: null,
  timerSeconds: 30,
  timerRunning: false,
  masterDeck: [],    // Single shuffled deck of ALL 72 cards
  cardsUsed: 0,      // How many cards have been drawn
  totalCards: 0,      // Total cards in deck
  round: 1
};

// Serve static files from public directory
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

// API to get card stats
app.get('/api/cards', (req, res) => {
  try {
    const data = loadCards();
    const summary = data.categories.map(cat => ({
      id: cat.id,
      name: cat.name,
      color: cat.color,
      icon: cat.icon,
      total: cat.cards.length
    }));
    res.json({
      categories: summary,
      totalCards: state.totalCards,
      cardsRemaining: state.masterDeck.length,
      cardsUsed: state.cardsUsed
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to read cards.json: ' + err.message });
  }
});

function loadCards() {
  return JSON.parse(fs.readFileSync(path.join(baseDir, 'cards.json'), 'utf8'));
}

// Serialize state for clients (never expose deck contents)
function getFullState() {
  return {
    phase: state.phase,
    players: state.players,
    currentPlayerIndex: state.currentPlayerIndex,
    lastCard: state.lastCard,
    timerSeconds: state.timerSeconds,
    timerRunning: state.timerRunning,
    cardsRemaining: state.masterDeck.length,
    totalCards: state.totalCards,
    cardsUsed: state.cardsUsed,
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

// Build ONE master deck from ALL categories — each card tagged with its category info
function buildMasterDeck() {
  const data = loadCards();
  const allCards = [];

  data.categories.forEach(cat => {
    cat.cards.forEach(card => {
      const isWild = card.text.startsWith('\ud83c\udccf WILD') || card.text.startsWith('WILD');
      const isILoveYou = card.text.startsWith('\u2764\ufe0f I LOVE YOU') || card.text.startsWith('I LOVE YOU');

      allCards.push({
        text: card.text,
        timer: card.timer || null,
        tone: card.tone || null,
        isWild: isWild,
        isILoveYou: isILoveYou,
        category: {
          id: cat.id,
          name: cat.name,
          color: cat.color,
          icon: cat.icon
        }
      });
    });
  });

  return shuffle(allCards);
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
      state.lastCard = null;
      state.phase = 'player-turn';
      state.round = 1;

      // Build ONE master shuffled deck of ALL cards
      try {
        state.masterDeck = buildMasterDeck();
        state.totalCards = state.masterDeck.length;
        state.cardsUsed = 0;
      } catch (e) {
        console.log('Error loading cards:', e.message);
      }

      io.emit('game-started', { state: getFullState() });
    } else {
      socket.emit('error-msg', { message: 'Need at least 2 players to start!' });
    }
  });

  // Roll dice — purely visual animation, does NOT determine anything
  socket.on('roll-dice', () => {
    if (state.phase !== 'player-turn') {
      socket.emit('error-msg', { message: 'Cannot roll now!' });
      return;
    }

    state.lastCard = null;
    state.phase = 'rolling';

    // Random number 1-6 just for dice animation visuals
    const visualRoll = Math.floor(Math.random() * 6) + 1;

    io.emit('dice-result', { roll: visualRoll, state: getFullState() });

    // After dice animation (~7s), move to waiting-draw (face-down card)
    setTimeout(() => {
      state.phase = 'waiting-draw';
      io.emit('dice-settled', { state: getFullState() });
    }, 7500);
  });

  // Draw/reveal card — pop from master deck, NOW reveal category + content
  socket.on('draw-card', () => {
    if (state.phase !== 'waiting-draw') {
      socket.emit('error-msg', { message: 'Wait for dice to settle first!' });
      return;
    }

    // If deck is empty, reshuffle
    if (state.masterDeck.length === 0) {
      try {
        state.masterDeck = buildMasterDeck();
        state.totalCards = state.masterDeck.length;
        state.cardsUsed = 0;
      } catch (e) {
        socket.emit('error-msg', { message: 'Failed to reload cards: ' + e.message });
        return;
      }
    }

    // Pop next card from the single shuffled deck
    const card = state.masterDeck.pop();
    state.cardsUsed++;

    state.lastCard = card;
    state.phase = 'card-reveal';

    // THIS is the only moment category + content are revealed
    io.emit('card-drawn', { card: card, state: getFullState() });
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
    state.lastCard = null;
    state.masterDeck = [];
    state.cardsUsed = 0;
    state.totalCards = 0;
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
