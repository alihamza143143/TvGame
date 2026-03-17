const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = process.env.PORT || 3000;

// Game state
const state = {
  phase: 'setup',  // setup | player-turn | rolling | category-reveal | card-reveal | timer-running | turn-end
  players: [],
  currentPlayerIndex: 0,
  lastRoll: null,
  lastCategory: null,
  lastCard: null,
  timerSeconds: 30,
  timerRunning: false,
  usedCards: {},
  round: 1
};

// Serve static files
app.use('/host', express.static(path.join(__dirname, 'public', 'host')));
app.use('/display', express.static(path.join(__dirname, 'public', 'display')));

// Routes
app.get('/', (req, res) => res.redirect('/display'));

// API to get cards
app.get('/api/cards', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'cards.json'), 'utf8'));
    const summary = data.categories.map(cat => ({
      id: cat.id,
      name: cat.name,
      color: cat.color,
      icon: cat.icon,
      total: cat.cards.length,
      used: (state.usedCards[cat.id] || []).length,
      remaining: cat.cards.length - (state.usedCards[cat.id] || []).length
    }));
    res.json(summary);
  } catch (err) {
    res.status(500).json({ error: 'Failed to read cards.json: ' + err.message });
  }
});

function loadCards() {
  return JSON.parse(fs.readFileSync(path.join(__dirname, 'cards.json'), 'utf8'));
}

function getFullState() {
  return { ...state };
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
      state.usedCards = {};
      state.round = 1;
      io.emit('game-started', { state: getFullState() });
    } else {
      socket.emit('error-msg', { message: 'Need at least 2 players to start!' });
    }
  });

  // Roll dice
  socket.on('roll-dice', () => {
    if (state.phase !== 'player-turn') {
      socket.emit('error-msg', { message: 'Cannot roll now!' });
      return;
    }

    const roll = Math.floor(Math.random() * 6) + 1;
    try {
      const data = loadCards();
      const category = data.categories.find(c => c.id === roll);
      state.lastRoll = roll;
      state.lastCategory = category ? { id: category.id, name: category.name, color: category.color, icon: category.icon } : null;
      state.lastCard = null;
      state.phase = 'rolling';

      io.emit('dice-result', { roll, category: state.lastCategory, state: getFullState() });

      // After dice animation, move to category reveal
      setTimeout(() => {
        state.phase = 'category-reveal';
        io.emit('category-revealed', { category: state.lastCategory, state: getFullState() });
      }, 2500);
    } catch (err) {
      socket.emit('error-msg', { message: 'Failed to read cards.json: ' + err.message });
    }
  });

  // Draw card
  socket.on('draw-card', () => {
    if (state.phase !== 'category-reveal') {
      socket.emit('error-msg', { message: 'Wait for category reveal first!' });
      return;
    }

    try {
      const data = loadCards();
      const category = data.categories.find(c => c.id === state.lastRoll);
      if (!category || category.cards.length === 0) {
        socket.emit('error-msg', { message: 'No cards in this category!' });
        return;
      }

      if (!state.usedCards[category.id]) {
        state.usedCards[category.id] = [];
      }

      let available = category.cards
        .map((card, index) => ({ ...card, index }))
        .filter(card => !state.usedCards[category.id].includes(card.index));

      if (available.length === 0) {
        state.usedCards[category.id] = [];
        available = category.cards.map((card, index) => ({ ...card, index }));
      }

      const picked = available[Math.floor(Math.random() * available.length)];
      state.usedCards[category.id].push(picked.index);

      state.lastCard = {
        text: picked.text,
        category: state.lastCategory,
        timer: picked.timer || null,
        tone: picked.tone || null
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
    state.usedCards = {};
    state.round = 1;
    clearInterval(timerInterval);
    state.timerRunning = false;
    io.emit('state-sync', getFullState());
  });

  socket.on('disconnect', () => {
    console.log('Client disconnected:', socket.id);
  });
});

server.listen(PORT, () => {
  console.log(`\n  TV Party Game is running!\n`);
  console.log(`  Host dashboard:  http://localhost:${PORT}/host`);
  console.log(`  TV display:      http://localhost:${PORT}/display\n`);
});
