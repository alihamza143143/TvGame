const socket = io();

// 6 categories (matches cards.json)
const categories = [
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
  waitDraw: document.getElementById('waitDrawScreen'),
  card: document.getElementById('cardScreen'),
  timer: document.getElementById('timerScreen'),
  turnEnd: document.getElementById('turnEndScreen')
};

const diceCube = document.getElementById('diceCube');
const turnPlayerName = document.getElementById('turnPlayerName');
const roundInfo = document.getElementById('roundInfo');
const dicePlayerName = document.getElementById('dicePlayerName');
const waitDrawPlayer = document.getElementById('waitDrawPlayer');
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

// Dice face target rotations
const faceRotations = {
  1: { x: 0, y: 0 },
  2: { x: 0, y: -90 },
  3: { x: -90, y: 0 },
  4: { x: 90, y: 0 },
  5: { x: 0, y: 90 },
  6: { x: 0, y: 180 }
};

let currentDiceRotation = { x: -20, y: 20 };

// Build dice faces with category icons and colors
function buildDiceFaces() {
  categories.forEach((cat, i) => {
    const face = document.querySelector('.face-' + (i + 1));
    if (face) {
      face.style.background = `linear-gradient(135deg, ${cat.color}, ${cat.color}CC)`;
      face.innerHTML = `<span class="face-icon">${cat.icon}</span><span class="face-name">${cat.name}</span>`;
    }
  });
}

// Show screen
function showScreen(name) {
  Object.values(screens).forEach(s => { if (s) s.classList.remove('active'); });
  if (screens[name]) screens[name].classList.add('active');
}

// 3D dice roll animation - 3 phases for maximum suspense
// Category is NOT revealed after dice — no text label shown
function animateDice(roll) {
  showScreen('dice');
  dicePlayerName.textContent = currentPlayer;

  const scene = document.querySelector('.dice-scene');
  scene.classList.add('rolling-glow');
  scene.classList.remove('bounce');

  const target = faceRotations[roll];

  // Phase 1: Wild fast chaotic tumble
  const dir1 = Math.random() > 0.5 ? 1 : -1;
  const dir2 = Math.random() > 0.5 ? 1 : -1;
  const tumbleX = dir1 * (Math.floor(Math.random() * 3) + 3) * 360;
  const tumbleY = dir2 * (Math.floor(Math.random() * 3) + 3) * 360;
  const tumbleZ = (Math.random() > 0.5 ? 1 : -1) * (Math.floor(Math.random() * 2) + 2) * 360;

  // Phase 2: Medium speed random direction
  const midX = (Math.random() > 0.5 ? 1 : -1) * (Math.floor(Math.random() * 2) + 2) * 360;
  const midY = (Math.random() > 0.5 ? 1 : -1) * (Math.floor(Math.random() * 2) + 2) * 360;
  const midZ = (Math.random() > 0.5 ? 1 : -1) * 360;

  // Phase 3: Settle onto target face
  const settleSpinsX = (Math.floor(Math.random() * 2) + 2) * 360;
  const settleSpinsY = (Math.floor(Math.random() * 2) + 2) * 360;
  const finalX = settleSpinsX + target.x;
  const finalY = settleSpinsY + target.y;

  // Running totals for smooth transitions
  let runX = currentDiceRotation.x;
  let runY = currentDiceRotation.y;

  // Start: snap to current position
  diceCube.style.transition = 'none';
  diceCube.style.transform = `rotateX(${runX}deg) rotateY(${runY}deg) rotateZ(0deg)`;
  diceCube.offsetHeight;

  // Phase 1: Fast chaotic tumble (0 - 2s)
  diceCube.style.transition = 'transform 2s cubic-bezier(0.4, 0, 0.8, 0.4)';
  runX += tumbleX;
  runY += tumbleY;
  diceCube.style.transform = `rotateX(${runX}deg) rotateY(${runY}deg) rotateZ(${tumbleZ}deg)`;

  // Phase 2: Medium tumble, changing direction (2s - 4s)
  setTimeout(() => {
    diceCube.style.transition = 'transform 2s cubic-bezier(0.3, 0, 0.6, 0.5)';
    runX += midX;
    runY += midY;
    diceCube.style.transform = `rotateX(${runX}deg) rotateY(${runY}deg) rotateZ(${tumbleZ + midZ}deg)`;
  }, 1800);

  // Phase 3: Slow settle onto final face (4s - 7s)
  setTimeout(() => {
    diceCube.style.transition = 'transform 3s cubic-bezier(0.05, 0.7, 0.1, 1)';
    diceCube.style.transform = `rotateX(${finalX}deg) rotateY(${finalY}deg) rotateZ(0deg)`;
    currentDiceRotation = { x: finalX, y: finalY };
  }, 3600);

  // Bounce effect when landing (at ~6.5s)
  setTimeout(() => {
    scene.classList.remove('rolling-glow');
    scene.classList.add('bounce');
  }, 6200);

  // No category label shown — dice just settles, suspense builds
}

// Waiting for host to press "Reveal Card"
function showWaitDraw() {
  showScreen('waitDraw');
  waitDrawPlayer.textContent = currentPlayer;
}

// Card reveal (full screen) — category shown here for the first time
// Wild cards show "WILD" instead of category
function showCard(card) {
  showScreen('card');

  const cat = card.category;
  const isWild = card.isWild;
  const isILoveYou = card.isILoveYou;

  if (isWild) {
    // Wild card — no category, just "WILD" styling
    cardFullscreen.style.background = 'radial-gradient(circle at center, #FFD70030 0%, #0a0a1a 60%)';
    cardTopBar.style.color = '#FFD700';
    cardCatIcon.textContent = '\ud83c\udccf';
    cardCatName.textContent = 'WILD';
  } else if (isILoveYou) {
    // I Love You card
    cardFullscreen.style.background = 'radial-gradient(circle at center, #FF69B430 0%, #0a0a1a 60%)';
    cardTopBar.style.color = '#FF69B4';
    cardCatIcon.textContent = '\u2764\ufe0f';
    cardCatName.textContent = 'I LOVE YOU';
  } else {
    // Normal card — show category
    cardFullscreen.style.background = `radial-gradient(circle at center, ${cat.color}20 0%, #0a0a1a 60%)`;
    cardTopBar.style.color = cat.color;
    cardCatIcon.textContent = cat.icon;
    cardCatName.textContent = cat.name;
  }

  cardPlayerTag.textContent = currentPlayer;

  // Format card text - preserve line breaks
  // For wild/ILY cards, strip the prefix since we show it in the top bar
  let displayText = card.text;
  if (isWild) {
    displayText = displayText.replace(/^\ud83c\udccf\s*WILD\s*\n*/, '');
  } else if (isILoveYou) {
    displayText = displayText.replace(/^\u2764\ufe0f\s*I LOVE YOU\s*\n*/, '');
  }
  cardMainText.innerHTML = displayText.replace(/\n/g, '<br>');

  // Show tone if present
  if (card.tone) {
    cardTone.textContent = 'TONE: ' + card.tone.toUpperCase();
    cardTone.style.display = 'block';
    cardTone.style.color = isWild ? '#FFD700' : isILoveYou ? '#FF69B4' : cat.color;
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
  } else if (state.phase === 'waiting-draw') {
    showWaitDraw();
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
  if (data.roll) {
    animateDice(data.roll);
  }
});

// Dice has settled — show waiting screen
socket.on('dice-settled', () => {
  showWaitDraw();
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
buildDiceFaces();
