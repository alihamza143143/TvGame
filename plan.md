# TV Party Game — Project Plan

## Overview
A live hosted party game displayed on a TV screen in bars and restaurants. The host controls the game from a laptop, and the audience sees the results on the TV.

## Core Architecture
- **Host Controller** (laptop browser) — buttons for Roll Dice, Draw Card, Next Player, Timer
- **Display Screen** (TV browser) — renders dice animation, category reveal, card content
- **Real-time sync** — WebSocket (Socket.io) so host actions instantly update the TV
- **Packaged as .exe** — client double-clicks StartGame.bat, no installs needed

## Game Flow (per turn)
1. TV shows whose turn it is (player name)
2. Host presses "Roll Dice" → 3D dice animation on TV
3. TV reveals the category (suspense moment)
4. Host presses "Reveal Card" → card flips full-screen on TV
   - Standard card: shows category + card content
   - Wild card: shows "WILD" only, no category
   - I Love You card: shows "I LOVE YOU" only
5. Timer starts if applicable (call cards = 60s)
6. Host presses "Next Player" → moves to next player

## Card System
- 6 categories: Personal Call, Business Call, Text, Post, Confess It, Escalation
- 12 cards per category (10 standard + 1 Wild + 1 I Love You)
- 72 total cards
- Pre-shuffled deck system — no repeats until deck exhausted
- Shuffled category queue for even distribution
- Cards stored in editable cards.json file

## Tech Stack
- Node.js + Express (server)
- Socket.io (real-time sync)
- Vanilla HTML/CSS/JS (no frameworks)
- pkg (exe packaging)

## Phases

### Phase 1 — Prototype (Current)
- [x] Host dashboard with player setup
- [x] 3D dice roll animation
- [x] 6 categories, 72 cards (client content)
- [x] Category reveal screen (suspense)
- [x] Full-screen card display
- [x] Wild / I Love You special card handling
- [x] Pre-shuffled deck (no card repeats)
- [x] Shuffled category queue (even distribution)
- [x] Timer (60s for call cards)
- [x] Turn + round tracking
- [x] Exe packaging with bat launcher
- [x] Editable cards.json

### Phase 2 — Polish (Planned)
- [ ] Sound effects (dice roll, timer beep, card flip)
- [ ] "OR DRINK" / "OR DOUBLE SHOT" visual highlight
- [ ] Card flip animation improvements
- [ ] Branding / logo / custom colors
- [ ] Mobile-friendly host dashboard (tablet)

### Phase 3 — Online (Planned)
- [ ] Cloud hosting (no exe needed)
- [ ] QR code for TV display connection
- [ ] Multiple game rooms
- [ ] Card management UI (add/edit/delete cards in browser)
