# TV Party Game — Progress Tracker

## Current Phase: Phase 1 — Prototype

## Latest Update: 2026-03-18

### Completed
- [x] Server with WebSocket real-time sync (Express + Socket.io)
- [x] Host dashboard — player name entry, game controls
- [x] TV display — all game screens (setup, turn, dice, category, card, timer)
- [x] 3D dice roll animation (3-phase: chaotic tumble → slow settle → bounce)
- [x] 6 categories with 72 cards (client-provided content)
- [x] Pre-shuffled card decks — no repeats until deck exhausted
- [x] Shuffled category queue — even distribution across categories
- [x] Category reveal screen with suspense pause
- [x] Full-screen card display (large readable text for TV)
- [x] Wild card special display (no category label, "WILD" styling)
- [x] I Love You card special display (no category label, heart styling)
- [x] Tone indicators on call cards (WHISPER, LOUD, CRYING, etc.)
- [x] 60-second countdown timer for call cards
- [x] Turn tracking + round counter
- [x] Accurate "Cards Remaining" count on host dashboard
- [x] Exe packaging with StartGame.bat launcher
- [x] Editable cards.json (user can add/change cards in Notepad)
- [x] Church card correctly categorized under Personal Call

### Client Feedback Addressed (2026-03-18)
- [x] Fixed card repetition — cards no longer repeat before deck is exhausted
- [x] Fixed cards remaining count — decreases consistently, no up/down jumps
- [x] Switched from random to shuffled category system for even distribution
- [x] Fixed category labeling (church card moved to correct category)
- [x] Category now shown after dice, hidden until card flip for Wild/ILY
- [x] Wild cards show "WILD" only with no category label
- [x] I Love You cards show heart styling with no category label

### Known Issues
- None currently — all client feedback items resolved

### Not Yet Started (Phase 2)
- [ ] Sound effects
- [ ] "OR DRINK" visual highlight
- [ ] Branding / logo
- [ ] Mobile-friendly host
