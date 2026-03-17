const socket = io();

// 6 categories (matches cards.json)
let categories = [
  { id: 1, name: 'Personal Call', color: '#E74C3C', icon: '\ud83d\udcf1' },
  { id: 2, name: 'Business Call', color: '#3498DB', icon: '\ud83d\udcde' },
  { id: 3, name: 'Text', color: '#2ECC71', icon: '\ud83d\udcac' },
  { id: 4, name: 'Post', color: '#F39C12', icon: '\ud83d\udcf2' },
  { id: 5, name: 'Confess It', color: '#9B59B6', icon: '\ud83d\ude48' },
  { id: 6, name: 'Escalation', color: '#E67E22', icon: '\u26a1' }
];
let currentPlayer = '';
let totalTimerSeconds = 60;

// DOM
const screens = {
  setup: document.getElementById('setupScreen'),
  playerTurn: document.getElementById('playerTurnScreen'),
  dice: document.getElementById('diceScreen'),
  category: document.getElementById('categoryScreen'),
  card: document.getElementById('cardScreen'),
  timer: document.getElementById('timerScreen'),
  turnEnd: document.getElementById('turnEndScreen')
};

const turnPlayerName = document.getElementById('turnPlayerName');
const roundInfo = document.getElementById('roundInfo');
const dicePlayerName = document.getElementById('dicePlayerName');
const spinnerWheel = document.getElementById('spinnerWheel');
const categoryPlayer = document.getElementById('categoryPlayer');
const categoryIcon = document.getElementById('categoryIcon');
const categoryName = document.getElementById('categoryName');
const cardFullscreen = document.getElementById('cardFullscreen');
const cardTopBar = document.getElementById('cardTopBar');
const cardCatIcon = document.getElementById('cardCatIcon');
const cardCatName = document.getElementById('cardCatName');
const cardMainText = document.getElementById('cardMainText');
const cardPlayerTag = document.getElementById('cardPlayerTag');
const cardTone = document.getElementById('cardTone');
const timerCardText = document.getElementById('timerCardText');
const timerNumber = document.getElementById('timerNumber');
const timerProgress = document.getElementById('timerProgress');
const timerPlayer = document.getElementById('timerPlayer');
const turnEndPlayer = document.getElementById('turnEndPlayer');

// Build spinner wheel segments
function buildSpinner() {
  if (!spinnerWheel || categories.length === 0) return;
  spinnerWheel.innerHTML = '';

  const count = categories.length;
  const segmentAngle = 360 / count;

  categories.forEach((cat, i) => {
    const segment = document.createElement('div');
    segment.className = 'spinner-segment';
    segment.style.transform = `rotate(${i * segmentAngle}deg)`;
    segment.style.background = cat.color;
    segment.innerHTML = `<span class="segment-label">${cat.icon}</span>`;

    // Clip to segment size
    const skew = 90 - segmentAngle;
    segment.style.clipPath = `polygon(0 0, 100% 0, 100% 100%, 0 0)`;
    segment.style.transformOrigin = '0% 100%';
    segment.style.width = '50%';
    segment.style.height = '50%';
    segment.style.position = 'absolute';
    segment.style.left = '50%';
    segment.style.top = '0';
    segment.style.transformOrigin = '0% 100%';

    spinnerWheel.appendChild(segment);
  });
}

// Show screen
function showScreen(name) {
  Object.values(screens).forEach(s => s.classList.remove('active'));
  if (screens[name]) screens[name].classList.add('active');
}

// Spinner animation
let spinAngle = 0;
function animateSpinner(targetCategory) {
  showScreen('dice');
  dicePlayerName.textContent = currentPlayer;

  const count = categories.length;
  const segmentAngle = 360 / count;
  const catIndex = categories.findIndex(c => c.id === targetCategory.id);

  // Calculate target angle - spin multiple times then land on category
  const extraSpins = (Math.floor(Math.random() * 3) + 4) * 360;
  const targetAngle = extraSpins + (catIndex * segmentAngle) + (segmentAngle / 2);

  spinnerWheel.style.transition = 'none';
  spinnerWheel.style.transform = `rotate(${spinAngle}deg)`;
  spinnerWheel.offsetHeight;

  spinnerWheel.style.transition = 'transform 3s cubic-bezier(0.17, 0.67, 0.12, 0.99)';
  spinnerWheel.style.transform = `rotate(${targetAngle}deg)`;
  spinAngle = targetAngle;
}

// Category reveal
function showCategory(category) {
  showScreen('category');
  categoryPlayer.textContent = currentPlayer + "'s category";
  categoryIcon.textContent = category.icon;
  categoryName.textContent = category.name;
  categoryName.style.color = category.color;
  categoryIcon.style.textShadow = `0 0 60px ${category.color}`;
  screens.category.style.background = `radial-gradient(circle at center, ${category.color}15 0%, #0a0a1a 70%)`;
}

// Card reveal (full screen)
function showCard(card) {
  showScreen('card');

  const cat = card.category;
  cardFullscreen.style.background = `radial-gradient(circle at center, ${cat.color}20 0%, #0a0a1a 60%)`;
  cardTopBar.style.color = cat.color;
  cardCatIcon.textContent = cat.icon;
  cardCatName.textContent = cat.name;
  cardPlayerTag.textContent = currentPlayer;

  // Format card text - preserve line breaks
  cardMainText.innerHTML = card.text.replace(/\n/g, '<br>');

  // Show tone if present
  if (card.tone) {
    cardTone.textContent = 'TONE: ' + card.tone.toUpperCase();
    cardTone.style.display = 'block';
    cardTone.style.color = cat.color;
  } else {
    cardTone.style.display = 'none';
  }

  // Re-trigger animation
  cardFullscreen.style.animation = 'none';
  cardFullscreen.offsetHeight;
  cardFullscreen.style.animation = 'cardFlipIn 0.8s cubic-bezier(0.34, 1.56, 0.64, 1)';
}

// Timer
function startTimerDisplay(seconds) {
  showScreen('timer');
  totalTimerSeconds = seconds;
  timerNumber.textContent = seconds;
  timerPlayer.textContent = currentPlayer;
  timerCardText.textContent = '';
  timerNumber.style.color = '#fff';

  const circumference = 2 * Math.PI * 90;
  timerProgress.style.strokeDasharray = circumference;
  timerProgress.style.strokeDashoffset = '0';
  timerProgress.classList.remove('warning', 'danger');
}

function updateTimer(seconds) {
  timerNumber.textContent = seconds;

  const circumference = 2 * Math.PI * 90;
  const progress = 1 - (seconds / totalTimerSeconds);
  timerProgress.style.strokeDashoffset = circumference * progress;

  timerProgress.classList.remove('warning', 'danger');
  if (seconds <= 5) {
    timerProgress.classList.add('danger');
    timerNumber.style.color = '#E74C3C';
  } else if (seconds <= 10) {
    timerProgress.classList.add('warning');
    timerNumber.style.color = '#F39C12';
  } else {
    timerNumber.style.color = '#fff';
  }
}

function showTurnEnd(playerName) {
  showScreen('turnEnd');
  turnEndPlayer.textContent = playerName || currentPlayer;
}

// Socket events
socket.on('state-sync', (state) => {
  if (state.phase === 'setup') {
    showScreen('setup');
    return;
  }

  currentPlayer = state.players[state.currentPlayerIndex] || '';

  if (state.phase === 'player-turn') {
    turnPlayerName.textContent = currentPlayer;
    roundInfo.textContent = 'Round ' + (state.round || 1);
    showScreen('playerTurn');
  } else if (state.phase === 'category-reveal' && state.lastCategory) {
    showCategory(state.lastCategory);
  } else if (state.phase === 'card-reveal' && state.lastCard) {
    showCard(state.lastCard);
  } else if (state.phase === 'turn-end') {
    showTurnEnd(currentPlayer);
  }
});

socket.on('game-started', (data) => {
  const s = data.state;
  currentPlayer = s.players[s.currentPlayerIndex];
  turnPlayerName.textContent = currentPlayer;
  roundInfo.textContent = 'Round 1';
  showScreen('playerTurn');
});

socket.on('dice-result', (data) => {
  // Store category for spinner
  if (data.category) {
    animateSpinner(data.category);
  }
});

socket.on('category-revealed', (data) => {
  showCategory(data.category);
});

socket.on('card-drawn', (data) => {
  showCard(data.card);
});

socket.on('timer-start', (data) => {
  startTimerDisplay(data.seconds);
});

socket.on('timer-tick', (data) => {
  updateTimer(data.seconds);
});

socket.on('timer-end', () => {
  timerNumber.textContent = '0';
  timerNumber.style.color = '#E74C3C';
  setTimeout(() => showTurnEnd(currentPlayer), 1500);
});

socket.on('timer-stop', () => showTurnEnd(currentPlayer));
socket.on('turn-completed', () => showTurnEnd(currentPlayer));

socket.on('player-changed', (data) => {
  currentPlayer = data.player;
  turnPlayerName.textContent = data.player;
  roundInfo.textContent = 'Round ' + (data.round || 1);
  showScreen('playerTurn');
});

// Init
buildSpinner();
