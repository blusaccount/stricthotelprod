# StrictHotel

StrictHotel is an experimental minigame collection: fast, visual web experiences with multiplayer chaos and nostalgic flair.

## Highlights
- **15+ Games & Experiences**: A full casino suite (Mäxchen, Strictly7s 2.0, Blackjack, Roulette, Plinko, Crash), Stock Market, Watch Party, Strict Brain, Food Guessr, Thing of the Week (tierlist), Loop Machine, Türkçe, Nostalgiabait, and more
- **Multiplayer Rooms**: Lobby system with Socket.IO for real-time gameplay
- **Virtual Economy**: StrictCoins + Diamonds with server-authoritative, transactional wallets
- **Engagement Loop**: 59 achievements with unlock toasts, daily login streak, global activity feed
- **Social Features**: Collaborative pixel doodle board, lobby watch-party mini-player with shared queue, contacts app, character creator, dormant soundboard (see `shared/audio/soundboard/README.md`)
- **Persistent Data**: PostgreSQL database for player profiles, portfolios, and game history (in-memory fallback for local dev)
- **Login Protection**: Session-based password gate plus trust-on-first-use name ownership (owner tokens)

## Repo Structure
- **Server**: `server.js` starts [server/index.js](server/index.js) (Express + Socket.IO)
  - [server/handlers](server/handlers) - 20 socket handlers, one per game/feature
  - [server/routes](server/routes) - Express routes (auth, stocks, turkish, nostalgiabait)
  - Server modules: `currency.js`, `stock-game.js`, `character-store.js`, `identity.js`, `achievements.js`, `daily-streak.js`, etc.
- **Public UI**: [public](public) - Landing page/lobby, login, contacts, shop, achievements, nostalgiabait
- **Games**: [games](games) - 15 game frontends (casino hub + blackjack, crash, food-guessr, loop-machine, maexchen, plinko, roulette, stocks, strictbrain, strictly7s, tierlist, turkish, watchparty, shopping)
- **Shared**: [shared](shared) - Reusable client modules (chat, lobby, avatars, creator, CSS, audio)
- **Tests**: [server/__tests__](server/__tests__) - Vitest tests across 31 files

## LLM Agent Notes
When LLM agents work in this repo, use these files:
- [AGENTS.md](AGENTS.md): entry point and rules
- [LLM_AGENT_GUIDE.md](LLM_AGENT_GUIDE.md): repo mental model, do/don'ts
- [docs/EVENTS.md](docs/EVENTS.md): socket event catalog
- [PLANS.md](PLANS.md): ExecPlan template for larger tasks
- [HANDOFF.md](HANDOFF.md): short log of changes and risks

## Run Locally
```
npm install
npm run dev
```
Server runs at `http://localhost:3000`.

## Self-Hosted Quickstart (Docker)
1. Copy env template and fill required values:
   ```bash
   cp .env.example .env
   ```
2. Build and start:
   ```bash
   docker compose up -d --build
   ```
3. Open `http://localhost:3000`.
4. Health check:
   ```bash
   docker compose ps
   curl http://localhost:3000/health
   ```

### Troubleshooting
- **Database errors**: verify `DATABASE_URL` format and DB network access.
- **Port already in use**: change host mapping in `docker-compose.yml` (left side of `3000:3000`).

## Configuration (Env)
See `.env.example` for all available options. Key variables:

**Core:**
- `SESSION_SECRET` - Session encryption key (required in production)
- `SITE_PASSWORD` - Login password (code default: ADMIN; `.env.example` ships STRICT)
- `DATABASE_URL` - PostgreSQL connection string (optional, uses in-memory fallback if not set)
- `PORT` - HTTP port (default: 3000)

**Features:**
- `GAME_ENABLED` (default: `true`) - Toggles stock market APIs and socket events
  - `true`: Stock APIs and socket events are active
  - `false`: Stock APIs return `503` with `{ code: "GAME_DISABLED" }`
- `ADMIN_PASSWORD` - Required for privileged socket actions

**Ops:**
- `LOGS_TOKEN` - Grants access to the `/admin/logs` ring-buffer endpoint (session-auth exempt)
- `KEEP_ALIVE_URL` / `RENDER_EXTERNAL_URL` - Self-ping target to keep free-tier hosting awake

## Games & Features

**Strict Casino** (hub at `/games/casino/`, shared bet ladder 5-500 SC, server-authoritative RNG):
- 🎲 **Mäxchen** - Multiplayer dice bluffing game (Liar's Dice variant) with round betting
- 🎰 **Strictly7s 2.0** - 5×3 slot machine, 10 paylines, expanding wilds, free spins (~96% RTP)
- 🃏 **Blackjack** - 6-deck shoe, S17 dealer, 3:2 blackjack, double-down
- 🎡 **Roulette** - European single-zero wheel, 13 bet types
- 📍 **Plinko** - Three risk profiles, server-simulated ball drop
- 🚀 **Crash** - Shared multiplayer rounds with live bet feed and auto-cashout

**Multiplayer & Social Games:**
- 📺 **Watch Party** - Synchronized YouTube viewing in rooms, plus a lobby mini-player with a shared auto-advancing queue
- 🧠 **Strict Brain** - Memory, math, and reaction challenges with daily test, leaderboards, and versus mode
- 🏆 **Thing of the Week** - Shared persistent community tierlist
- 🎹 **Loop Machine** - Collaborative 16-step sequencer with 14 instruments, persisted across restarts

**Single-Player Games:**
- 📈 **Stock Market** - Trading with real market prices (incl. crypto), portfolios, and leaderboards
- 🍜 **Food Guessr** - Guess the country from a dish photo; Classic, Rate, and Scrandle modes
- 🇹🇷 **Türkçe** - Turkish language learning game with streaks

**Pages & Extras:**
- 📇 **Contacts** - View online players and their characters
- 💎 **Shop** - Spend StrictCoins on diamonds and premium items
- 🏅 **Achievements** - 59 achievements with progress tracking and unlock toasts
- 📼 **Nostalgiabait** - Retro console boot experiences

**Lobby Features:**
- Character creator with pixel art editor
- Collaborative pixel drawing board
- Daily login streak with escalating rewards (up to 150 SC + 1 💎)
- Global activity feed (logins, big wins, achievement unlocks, trades)
- StrictCoins currency system with "Make It Rain" animations

## In Short
This repository bundles a playable website and multiplayer features with a focus on creative minigames, social interaction, and a stylized retro atmosphere.
