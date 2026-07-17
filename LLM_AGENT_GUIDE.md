# LLM Agent Guide (StrictHotel)

This guide helps LLM agents work effectively in this repo. Keep it short, stay in scope, and follow local patterns.

## Quick repo map

**Server:**
- Entry: [server.js](server.js) → [server/index.js](server/index.js)
- Socket wiring: [server/socket-handlers.js](server/socket-handlers.js) imports and registers every handler
- Socket handlers: [server/handlers/](server/handlers/) (one file per game/feature)
  - Core: `lobby.js`, `currency.js`, `pictochat.js`, `soundboard.js`, `lobby-watchparty.js`, `activity-feed.js`, `daily-streak.js`, `achievements.js`
  - Games: `maexchen.js`, `watchparty.js`, `stocks.js`, `loop-machine.js`, `lol-betting.js`, `brain-versus.js`, `tierlist.js`, `food-guessr.js`
  - Casino: `strictly7s.js`, `plinko.js`, `crash.js`, `blackjack.js`, `roulette.js`
- Express routes: [server/routes/](server/routes/) (`auth.js`, `stocks.js`, `turkish.js`, `nostalgiabait.js`)
- Server modules (top level): `db.js`, `currency.js`, `identity.js`, `stock-game.js`, `stock-price-cache.js`, `stock-providers/`, `character-store.js`, `lol-betting.js`, `lol-match-checker.js`, `riot-api.js`, `room-manager.js`, `game-logic.js`, `socket-utils.js`, `portfolio-history.js`, `pictochat-store.js`, `tierlist-store.js`, `food-leaderboards-store.js`, `food-ratings-store.js`, `turkish-lessons.js`, `turkish-streaks.js`, `brain-leaderboards.js`, `achievements.js`, `activity-feed.js`, `daily-streak.js`, `keep-alive.js`, `log-buffer.js`, `cleanup.js`, `sql/`
- Admin/observability: `/admin/logs` endpoint backed by in-memory ring buffer (`log-buffer.js`), `LOGS_TOKEN`-gated; keep-alive cron in `keep-alive.js` to keep Render free tier awake

**Client:**
- Public pages: [public/](public/) (`index.html`, `login.html`, `contacts.html`, `shop.html`, `achievements.html`, `nostalgiabait/`)
- Public modules: `shell.js`, `lobby.js`, `lobby-watchparty.js`, `contacts.js`, `ambience.js`, `pictochat.js`, `soundboard.js`, `shop.js` + `shell.css`, `lobby.css`
- Game frontends: [games/](games/) (16 directories: `maexchen`, `watchparty`, `stocks`, `strictly7s`, `loop-machine`, `lol-betting`, `strictbrain`, `turkish`, `shopping`, `casino` (hub), `blackjack`, `plinko`, `crash`, `roulette`, `tierlist`, `food-guessr`)
- Shared modules: [shared/js/](shared/js/) — `core.js`, `lobby.js`, `socket-init.js`, `chat.js`, `creator.js`, `avatars.js`, `emotes.js`, `reactions.js`, `iframe-helper.js`, `ambient.js`, `achievement-toast.js`, `starfield-parallax.js`, `stock-ticker.js`, `tts.js`
- Shared styles: [shared/css/theme.css](shared/css/theme.css)

**Tests:**
- [server/__tests__/](server/__tests__/) - Vitest tests for all server modules (22 test files)

## Core flows (mental model)

**Authentication:**
- Login gate: [server/routes/auth.js](server/routes/auth.js) protects all routes except `/login`
- Session-based auth with `SITE_PASSWORD` env var (default: ADMIN)
- `/admin/logs` is exempt from session auth — it uses `LOGS_TOKEN` instead

**Player Registration & Identity (Trust-On-First-Use):**
- Players register via `register-player` socket event ([server/handlers/currency.js](server/handlers/currency.js))
- Registration creates/loads: username, character, StrictCoin balance, diamond count
- Character data persisted to PostgreSQL `players.character_data` column
- [server/identity.js](server/identity.js) claims each name against a long-lived owner token (client localStorage, persisted as `players.owner_token`); a name claimed from one browser can't be hijacked from another. Mismatches get `register-player-error`.
- Sensitive handlers (lobby create/join, brain versus/scores, `/api/turkish/complete`) derive the player name from the registered socket or verify the owner token instead of trusting body input

**Lobby Flow:**
- Client: [shared/js/lobby.js](shared/js/lobby.js)
- Server: [server/handlers/lobby.js](server/handlers/lobby.js)
- Flow: `create-room` → `join-room` → `start-game` → game-specific handlers take over

**Multiplayer Rooms:**
- Room state managed by [server/room-manager.js](server/room-manager.js) (in-memory)
- Each game has its own handler in [server/handlers/](server/handlers/)
- Socket events are the source of truth for real-time behavior

**Currency System:**
- StrictCoins: Virtual currency for games (stored in PostgreSQL `players.balance`)
- Diamonds: Premium currency (stored in `players.diamonds`)
- Handlers: [server/handlers/currency.js](server/handlers/currency.js)
- Server-side store: [server/currency.js](server/currency.js)
- `addDiamonds` helper grants diamonds without spending coins (used by achievements + daily streak)
- `currency.withWallet()` wraps deduct + game RNG + payout in a single Postgres transaction (memory mode passes through); used by Strictly7s, Plinko, Roulette, and Mäxchen place-bet so a crash mid-round rolls back the bet

**Stock Market:**
- Real-time prices: cascading provider chain `yf.quote → v8 chart → v7 spark → Stooq` ([server/stock-providers/](server/stock-providers/))
- Persistent price cache: [server/stock-price-cache.js](server/stock-price-cache.js) (survives empty-Yahoo-response wipeouts)
- Portfolio/trades: PostgreSQL via [server/stock-game.js](server/stock-game.js)
- Socket events: [server/handlers/stocks.js](server/handlers/stocks.js)
- Diagnostic endpoint: `GET /api/_stock-diag` for client-side debugging

**Casino Hub:**
- Single landing page at `/games/casino/` with six LIVE tiles: Mäxchen, Strictly7s 2.0, Blackjack, Roulette, Plinko, Crash
- All casino games share the same bet ladder: `5, 10, 25, 50, 100, 500`

**Engagement Loop:**
- Daily Streak ([server/daily-streak.js](server/daily-streak.js)) — escalating reward, capped at 150 SC + 1 💎 on day 7
- Achievements ([server/achievements.js](server/achievements.js)) — 59 achievements, gold/magenta toast on unlock, recursive bump for meta-achievements
- Activity Feed ([server/activity-feed.js](server/activity-feed.js)) — global ring buffer of lobby events, pushed to all clients

## Do this every task
- Read [HANDOFF.md](HANDOFF.md) first to capture recent changes and open risks
- Check [docs/EVENTS.md](docs/EVENTS.md) for socket event contracts
- Prefer existing helpers and patterns before adding new ones
- Keep changes minimal, additive, and reversible
- Run `npm test` before committing changes (359 tests across 22 files should pass)
- Validate behavior manually if you touch sockets, auth, or game logic
- Update HANDOFF.md with your changes and verification notes

## ExecPlans
When a task is large, risky, or spans multiple files, create an ExecPlan using [PLANS.md](PLANS.md). Keep it short and update it as you work.

## Scope discipline
- Implement exactly what the user asks.
- Avoid adding adjacent features without confirmation.
- Prefer existing patterns and helpers.

## Handoff
Record changes and verification notes in [HANDOFF.md](HANDOFF.md).

## Safety and reliability
- **Validate all inputs**: Server-side validation for all socket events and API endpoints
- **Database transactions**: Use transactions for multi-step operations (e.g., stock buy/sell updates both balance and positions)
- **Error handling**: Emit specific error events (e.g., `stock-error`, `lol-bet-error`, `bj-error`, `crash-error`, `plinko-error`, `roulette-error`, `register-player-error`) with error codes and messages
- **Rate limiting**: Some handlers have cooldowns (Strictly7s spin, Plinko drop, Roulette spin, Lobby-WP load)
- **Server-authoritative randomness**: All casino games use `crypto.randomInt` for outcome generation
- **Logging**: Use `console.error` for failures, `console.log` for important state changes; logs are mirrored to the `/admin/logs` ring buffer
- **Resource cleanup**: Close database connections, clear intervals/timeouts, remove event listeners on disconnect — handlers expose `cleanup*OnDisconnect` helpers wired from `socket-handlers.js`
- **Fallbacks**: In-memory fallback when `DATABASE_URL` is not set (for local dev)

## Local conventions
- **ES6 modules**: All code uses `import/export` (not `require`)
- **Modern JS**: Use `const/let`, arrow functions, template literals
- **Naming**: camelCase for variables/functions, kebab-case for file names, UPPER_CASE for constants
- **Socket events**: Use kebab-case (e.g., `stock-buy`, `loop-toggle-cell`, `bj-deal`)
- **Database**: PostgreSQL with `pg` library; idempotent schema in [server/sql/](server/sql/) and via `create table if not exists` in module init
- **Tests**: Vitest, test files in `server/__tests__/`, follow existing patterns
- **CSS**: Inline styles extracted to separate CSS files
- **Comments**: Only add comments where logic isn't self-evident
- **Keep content ASCII** unless the file already uses Unicode
- **Prefer the smallest viable change**

## Common pitfalls
- **Don't forget to register new socket events** in the handler file AND import + call its `register*Handlers` in [server/socket-handlers.js](server/socket-handlers.js)
- **Database queries**: Always handle the case where DB is not available (in-memory fallback)
- **Character data**: Must have both `pixels` and `dataURL` to be valid
- **Stock prices**: Provider cascade is fail-open — every step has its own timeout; persistent cache covers empty responses to prevent UI wipeout
- **Pictochat security**: Validate all drawing commands to prevent XSS/injection
- **LoL betting**: Always pick the oldest match after bet placement (player's "next game"); auto-timeout via `setTimeout` (default 50 min, `LOL_BET_TIMEOUT_MS` env override)
- **WatchParty**: Sync events carry `serverTime` so receivers can apply in-flight latency offset before deciding to seek; heartbeats prevent server spin-down
- **Crash**: One shared round at a time — `crash-bet` is only valid in betting phase, `crash-cashout` only in running phase
- **Strictly7s free spins**: Per-player in-memory `Map` — lost on server restart (intentional tradeoff); stale Blackjack hands and free-spin state are evicted after 24h by the periodic cleanup loop
- **Achievements**: Hook bumps recursively call `bump(playerName, counterId, …)` — wiring a new bump near an existing counter is enough, "Achievement Hunter" auto-fires at 10 unlocks
- **Identity**: Player names are bound to owner tokens (TOFU). Never trust a player name from event payloads — resolve it from the registered socket (`onlinePlayers`) or verify the owner token
- **Strict Brain anti-grind**: `brain-training-score` has a ~20s per-name cooldown and a 200 SC/day cap — don't add new coin-minting paths without similar guards
