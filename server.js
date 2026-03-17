const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const PORT = 3000;

// Game state
const state = {
  players: ['Team 1', 'Team 2'],
  currentPlayerIndex: 0,
  lastRoll: null,
  lastCategory: null,
  lastCard: null,
  phase: 'idle', // idle | rolled | drawn
  usedCards: {}  // { categoryId: [cardIndex, ...] }
};

// Serve static files
app.use('/host', express.static(path.join(__dirname, 'public', 'host')));
app.use('/display', express.static(path.join(__dirname, 'public', 'display')));
app.use('/shared', express.static(path.join(__dirname, 'public', 'shared')));

// Routes
app.get('/', (req, res) => res.redirect('/display'));

// API to get cards (for host card counts)
app.get('/api/cards', (req, res) => {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(__dirname, 'cards.json'), 'utf8'));
    const summary = data.categories.map(cat => ({
      id: cat.id,
      name: cat.name,
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

io.on('connection', (socket) => {
  console.log('Client connected:', socket.id);

  // Send current state on connect
  socket.emit('state-sync', getFullState());

  // Roll dice
  socket.on('roll-dice', () => {
    const roll = Math.floor(Math.random() * 6) + 1;
    try {
      const data = loadCards();
      const category = data.categories.find(c => c.id === roll);
      state.lastRoll = roll;
      state.lastCategory = category ? { id: category.id, name: category.name, color: category.color, icon: category.icon } : null;
      state.lastCard = null;
      state.phase = 'rolled';
      io.emit('dice-result', { roll, category: state.lastCategory, state: getFullState() });
    } catch (err) {
      socket.emit('error-msg', { message: 'Failed to read cards.json: ' + err.message });
    }
  });

  // Draw card
  socket.on('draw-card', () => {
    if (!state.lastRoll || state.phase !== 'rolled') {
      socket.emit('error-msg', { message: 'Roll the dice first!' });
      return;
    }

    try {
      const data = loadCards();
      const category = data.categories.find(c => c.id === state.lastRoll);
      if (!category || category.cards.length === 0) {
        socket.emit('error-msg', { message: 'No cards in this category!' });
        return;
      }

      // Track used cards
      if (!state.usedCards[category.id]) {
        state.usedCards[category.id] = [];
      }

      // Get available cards
      let available = category.cards
        .map((card, index) => ({ ...card, index }))
        .filter(card => !state.usedCards[category.id].includes(card.index));

      // If all used, reshuffle
      if (available.length === 0) {
        state.usedCards[category.id] = [];
        available = category.cards.map((card, index) => ({ ...card, index }));
      }

      // Pick random card
      const picked = available[Math.floor(Math.random() * available.length)];
      state.usedCards[category.id].push(picked.index);

      state.lastCard = { text: picked.text, category: state.lastCategory };
      state.phase = 'drawn';

      io.emit('card-drawn', { card: state.lastCard, state: getFullState() });
    } catch (err) {
      socket.emit('error-msg', { message: 'Failed to read cards.json: ' + err.message });
    }
  });

  // Next player
  socket.on('next-player', () => {
    state.currentPlayerIndex = (state.currentPlayerIndex + 1) % state.players.length;
    state.lastRoll = null;
    state.lastCategory = null;
    state.lastCard = null;
    state.phase = 'idle';
    io.emit('player-changed', { player: state.players[state.currentPlayerIndex], index: state.currentPlayerIndex, state: getFullState() });
  });

  // Update players
  socket.on('update-players', (players) => {
    if (Array.isArray(players) && players.length > 0) {
      state.players = players.map(p => String(p).trim()).filter(p => p.length > 0);
      if (state.currentPlayerIndex >= state.players.length) {
        state.currentPlayerIndex = 0;
      }
      io.emit('state-sync', getFullState());
    }
  });

  // Reset game
  socket.on('reset-game', () => {
    state.currentPlayerIndex = 0;
    state.lastRoll = null;
    state.lastCategory = null;
    state.lastCard = null;
    state.phase = 'idle';
    state.usedCards = {};
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
