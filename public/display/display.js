const socket = io();

// Categories data (matches cards.json)
const categories = [
  { id: 1, name: 'Trivia', color: '#E74C3C', icon: '🧠' },
  { id: 2, name: 'Dare', color: '#3498DB', icon: '🎯' },
  { id: 3, name: 'Social', color: '#2ECC71', icon: '🍻' },
  { id: 4, name: 'Wildcard', color: '#F39C12', icon: '🃏' },
  { id: 5, name: 'Versus', color: '#9B59B6', icon: '⚔️' },
  { id: 6, name: 'Hot Take', color: '#E67E22', icon: '🔥' }
];

// DOM elements
const playerName = document.getElementById('playerName');
const idleScreen = document.getElementById('idleScreen');
const diceScreen = document.getElementById('diceScreen');
const cardScreen = document.getElementById('cardScreen');
const playerScreen = document.getElementById('playerScreen');
const diceCube = document.getElementById('diceCube');
const rollLabel = document.getElementById('rollLabel');
const gameCard = document.getElementById('gameCard');
const cardHeader = document.getElementById('cardHeader');
const cardIcon = document.getElementById('cardIcon');
const cardCategory = document.getElementById('cardCategory');
const cardText = document.getElementById('cardText');
const playerChangeName = document.getElementById('playerChangeName');
const categoryLegend = document.getElementById('categoryLegend');

// Dice face rotation map
const faceRotations = {
  1: 'rotateX(0deg) rotateY(0deg)',
  2: 'rotateX(0deg) rotateY(-90deg)',
  3: 'rotateX(-90deg) rotateY(0deg)',
  4: 'rotateX(90deg) rotateY(0deg)',
  5: 'rotateX(0deg) rotateY(90deg)',
  6: 'rotateX(0deg) rotateY(180deg)'
};

let currentRotation = { x: 0, y: 0 };

// Build category legend
function buildLegend() {
  categoryLegend.innerHTML = '';
  categories.forEach(cat => {
    const item = document.createElement('div');
    item.className = 'legend-item';
    item.id = 'legend-' + cat.id;
    item.innerHTML = `
      <span class="legend-dot" style="background:${cat.color}"></span>
      <span class="legend-icon">${cat.icon}</span>
      <span>${cat.name}</span>
    `;
    categoryLegend.appendChild(item);
  });
}

// Build dice faces
function buildDiceFaces() {
  categories.forEach((cat, i) => {
    const face = document.querySelector('.face-' + (i + 1));
    if (face) {
      face.style.background = cat.color;
      face.innerHTML = `<div><div style="font-size:1.5em">${cat.icon}</div><div style="font-size:0.5em;margin-top:6px">${cat.name}</div></div>`;
    }
  });
}

// Show screen
function showScreen(screen) {
  [idleScreen, diceScreen, cardScreen, playerScreen].forEach(s => s.classList.remove('active'));
  screen.classList.add('active');
}

// Highlight legend category
function highlightLegend(categoryId) {
  document.querySelectorAll('.legend-item').forEach(item => item.classList.remove('active'));
  if (categoryId) {
    const el = document.getElementById('legend-' + categoryId);
    if (el) el.classList.add('active');
  }
}

// Dice roll animation
function animateDice(roll) {
  showScreen(diceScreen);
  rollLabel.classList.remove('visible');
  gameCard.classList.remove('revealed');

  const cat = categories.find(c => c.id === roll);

  // Calculate spin: add multiple full rotations for drama
  const spinsX = (Math.floor(Math.random() * 3) + 2) * 360;
  const spinsY = (Math.floor(Math.random() * 3) + 2) * 360;

  // Parse target rotation
  const targetMatch = faceRotations[roll];
  const xMatch = targetMatch.match(/rotateX\((-?\d+)deg\)/);
  const yMatch = targetMatch.match(/rotateY\((-?\d+)deg\)/);
  const targetX = xMatch ? parseInt(xMatch[1]) : 0;
  const targetY = yMatch ? parseInt(yMatch[1]) : 0;

  const finalX = spinsX + targetX;
  const finalY = spinsY + targetY;

  diceCube.style.transition = 'none';
  diceCube.style.transform = `rotateX(${currentRotation.x}deg) rotateY(${currentRotation.y}deg)`;

  // Force reflow
  diceCube.offsetHeight;

  diceCube.style.transition = 'transform 2s cubic-bezier(0.2, 0.8, 0.3, 1)';
  diceCube.style.transform = `rotateX(${finalX}deg) rotateY(${finalY}deg)`;

  currentRotation = { x: finalX, y: finalY };

  // Show label after animation
  setTimeout(() => {
    if (cat) {
      rollLabel.innerHTML = `<span style="color:${cat.color}">${cat.icon} ${cat.name}</span>`;
      rollLabel.classList.add('visible');
      highlightLegend(cat.id);
    }
  }, 2100);
}

// Card reveal animation
function revealCard(card) {
  showScreen(cardScreen);
  gameCard.classList.remove('revealed');

  const cat = card.category;
  if (cat) {
    cardHeader.style.background = cat.color;
    cardIcon.textContent = cat.icon;
    cardCategory.textContent = cat.name;
    highlightLegend(cat.id);
  }

  cardText.textContent = card.text;

  // Trigger animation after brief delay
  setTimeout(() => {
    gameCard.classList.add('revealed');
  }, 100);
}

// Player change animation
function showPlayerChange(name) {
  playerChangeName.textContent = name;
  showScreen(playerScreen);
  highlightLegend(null);

  // Return to idle after delay
  setTimeout(() => {
    showScreen(idleScreen);
    playerName.textContent = name;
  }, 2000);
}

// Socket events
socket.on('state-sync', (state) => {
  playerName.textContent = state.players[state.currentPlayerIndex] || 'Waiting...';

  if (state.phase === 'drawn' && state.lastCard) {
    revealCard(state.lastCard);
  } else if (state.phase === 'rolled' && state.lastCategory) {
    showScreen(diceScreen);
    const cat = state.lastCategory;
    rollLabel.innerHTML = `<span style="color:${cat.color}">${cat.icon} ${cat.name}</span>`;
    rollLabel.classList.add('visible');
    highlightLegend(cat.id);
  } else {
    showScreen(idleScreen);
  }
});

socket.on('dice-result', (data) => {
  animateDice(data.roll);
});

socket.on('card-drawn', (data) => {
  revealCard(data.card);
});

socket.on('player-changed', (data) => {
  showPlayerChange(data.player);
});

// Initialize
buildLegend();
buildDiceFaces();
