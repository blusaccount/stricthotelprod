# Socket Event Catalog

This is a practical catalog of Socket.IO events. Source of truth is handler files in [server/handlers/](../server/handlers/) — registration lives in [server/socket-handlers.js](../server/socket-handlers.js).

## Conventions
- Direction: C->S means client to server, S->C means server to client
- Payload shapes and rate limits live in the server handler files
- If you add or change an event, update this file

## Core Lobby & Room Management
**Handler:** [server/handlers/lobby.js](../server/handlers/lobby.js) (room lifecycle broadcasts live in [server/room-manager.js](../server/room-manager.js))

C->S:
- `get-lobbies` - Request list of active rooms
- `create-room` - Create new game room (player name comes from the registered socket, not the payload)
- `join-room` - Join existing room
- `leave-room` - Leave current room
- `chat-message` - Send chat message (in-room)
- `emote` - Send emote reaction (in-room)
- `drawing-note` - Draw on shared canvas (in-room)

S->C:
- `online-players` - Broadcast of all connected players
- `lobbies-update` - Active rooms list
- `room-created` - Confirmation of room creation
- `room-joined` - Player joined room
- `room-update` - Room state changed
- `player-left` - Player left room
- `player-disconnected` - Player dropped mid-game
- `game-started` - Game beginning
- `chat-broadcast` - Chat message broadcast
- `emote-broadcast` - Emote broadcast
- `drawing-note` - Drawing broadcast
- `error` - Generic error response

## Currency System & Registration
**Handler:** [server/handlers/currency.js](../server/handlers/currency.js)

C->S:
- `register-player` - Register username, character, and `ownerToken` (TOFU identity via [server/identity.js](../server/identity.js))
- `get-balance` - Fetch player's StrictCoin balance
- `get-player-character` - Fetch character data
- `get-player-diamonds` - Fetch another player's diamond count by name (contacts list); responds via `player-diamonds`
- `get-my-diamonds` - Fetch the current socket's own diamond count; responds via `diamonds-update`
- `buy-diamonds` - Purchase diamonds (premium)
- `lobby-make-it-rain` - Spend coins for lobby animation

S->C:
- `register-player-error` - Name claim rejected (missing/mismatched owner token)
- `balance-update` - Balance changed
- `player-character` - Character data response
- `player-diamonds` - Diamond count for a looked-up player (response to `get-player-diamonds`)
- `diamonds-update` - Own diamond count (response to `get-my-diamonds` / `buy-diamonds`)
- `lobby-rain-effect` - Make-it-rain triggered (broadcast)

## Mäxchen (Dice Bluffing)
**Handler:** [server/handlers/maexchen.js](../server/handlers/maexchen.js)

C->S:
- `start-game` - Start the game (host only)
- `roll` - Roll dice
- `announce` - Announce dice value (truthful or bluff)
- `challenge` - Challenge previous player's announcement
- `believe-maexchen` - Accept Mäxchen claim
- `place-bet` - Place bet on Mäxchen round outcome (wrapped in a wallet transaction)

S->C:
- `game-started` - Game beginning
- `dice-rolled` - Dice roll animation trigger
- `roll-result` - Actual dice values (to current player only)
- `player-announced` - Announcement broadcast
- `challenge-result` - Challenge outcome
- `maexchen-believed` - Mäxchen claim accepted broadcast
- `bets-update` - Round bets changed
- `turn-start` - Turn changed (from room-manager)
- `game-over` - Game ended, pot awarded (from room-manager)
- `player-disconnected` - Player left game (from room-manager)
- `error` - Error response

Chat, emotes, and drawing notes inside a Mäxchen room use the lobby-level events (`chat-message`/`chat-broadcast`, `emote`/`emote-broadcast`, `drawing-note`).

## Watch Party
**Handler:** [server/handlers/watchparty.js](../server/handlers/watchparty.js)

C->S:
- `watchparty-load` - Load new video
- `watchparty-playpause` - Toggle play/pause
- `watchparty-seek` - Seek to timestamp
- `watchparty-request-sync` - Request sync with host (carries `serverTime` for latency offset)
- `watchparty-heartbeat` - Keep-alive ping (prevents server spin-down)

S->C:
- `watchparty-video` - Video loaded broadcast / full state response to `watchparty-request-sync`
- `watchparty-sync` - Play/pause/seek state broadcast (with `serverTime` for latency offset)
- `watchparty-heartbeat-ack` - Heartbeat acknowledgment
- `watchparty-error` - Error response (e.g. invalid video ID)

## Lobby Watch Party (Right-Rail Mini-Player)
**Handler:** [server/handlers/lobby-watchparty.js](../server/handlers/lobby-watchparty.js)

Single shared lobby video that everyone in the lobby can watch from the right rail. Host of the load action controls playback. A shared queue (max 20 entries, deduped against the playing video) auto-advances when the current video ends.

C->S:
- `lobby-wp-state` - Request current state
- `lobby-wp-load` - Load a YouTube video immediately (rate-limited)
- `lobby-wp-control` - Play/pause/seek control
- `lobby-wp-queue-add` - Append a video to the queue; starts playback directly if nothing is playing (1s per-socket cooldown)
- `lobby-wp-queue-remove` - Remove one of your own queue entries (`{ queueId }`)
- `lobby-wp-next` - Skip to the next queued video (3s video-change cooldown)
- `lobby-wp-ended` - Report the current video finished (`{ videoId, time }`); server advances the queue or pins paused-at-duration. Idempotent across clients via the videoId echo.
- `lobby-wp-clear` - Clear the current video and the queue

S->C:
- `lobby-wp-state-result` - Full state snapshot (includes `queue`)
- `lobby-wp-error` - Error response

## Pictochat (Lobby Drawing)
**Handler:** [server/handlers/pictochat.js](../server/handlers/pictochat.js)

C->S:
- `picto-join` - Join drawing session
- `picto-cursor` - Update cursor position
- `picto-cursor-hide` - Hide cursor
- `picto-stroke-segment` - Draw stroke segment
- `picto-stroke-end` - Complete stroke
- `picto-shape` - Draw shape (line, rectangle, circle)
- `picto-undo` - Undo last action
- `picto-redo` - Redo last undone action
- `picto-clear` - Clear entire canvas
- `picto-message` - Send pictochat message

S->C:
- `picto-state` - Full canvas state
- `picto-cursor` - Cursor position broadcast
- `picto-cursor-hide` - Cursor hidden broadcast
- `picto-stroke-segment` - Stroke segment broadcast
- `picto-stroke-commit` - Stroke completed
- `picto-shape` - Shape broadcast
- `picto-undo` - Undo broadcast
- `picto-redo` - Redo broadcast
- `picto-clear` - Clear broadcast
- `picto-message` - Message broadcast

## Soundboard (Lobby Audio)
**Handler:** [server/handlers/soundboard.js](../server/handlers/soundboard.js)

C->S:
- `soundboard-join` - Join soundboard session
- `soundboard-play` - Play sound effect

S->C:
- `soundboard-played` - Sound effect triggered

## Stock Market
**Handler:** [server/handlers/stocks.js](../server/handlers/stocks.js)

C->S:
- `stock-buy` - Buy stock shares
- `stock-sell` - Sell stock shares
- `stock-get-portfolio` - Fetch portfolio
- `stock-get-leaderboard` - Fetch net worth leaderboard
- `stock-get-portfolio-history` - Fetch historical portfolio values

S->C:
- `stock-portfolio` - Portfolio data
- `stock-portfolio-history` - Historical portfolio values
- `stock-leaderboard` - Net worth leaderboard data
- `stock-performance-leaderboard` - Performance leaderboard data
- `stock-error` - Error response (with `code`, e.g. `GAME_DISABLED`, `TRADE_COOLDOWN`)
- `balance-update` - Balance changed after trade

## Strictly7s 2.0 (Slot Machine)
**Handler:** [server/handlers/strictly7s.js](../server/handlers/strictly7s.js)

5×3 grid, 10 paylines, win-both-ways, expanding wild on reels 2/3/4, scatter pays, free spins (10 spins, 2× multiplier, retrigger). ~96% RTP.

C->S:
- `strictly7s-spin` - Spin slot machine `{ bet }` (bet ignored during free spins; uses locked bet from trigger spin)
- `strictly7s-state` - Request current free-spin state for the player

S->C:
- `strictly7s-spin-result` - Spin outcome `{ grid, expandedReels, wins, lineWinTotal, scatterCount, scatterPositions, scatterPay, bet, multiplier, payout, freeSpinsAwarded, freeSpinsRemaining, wasFreeSpin, balance }`
- `strictly7s-free-spins` - Current free-spin state `{ remaining, multiplier, bet }`
- `strictly7s-error` - Error message
- `balance-update` - Balance changed

## Plinko
**Handler:** [server/handlers/plinko.js](../server/handlers/plinko.js)

Server-authoritative ball drop, three risk profiles (low/medium/high). Drop cooldown enforced server-side.

C->S:
- `plinko-drop` - Drop a ball `{ bet, risk }`

S->C:
- `plinko-result` - Drop outcome `{ path, bucket, multiplier, payout, balance, ... }`
- `plinko-error` - Error response
- `balance-update` - Balance changed

## Crash
**Handler:** [server/handlers/crash.js](../server/handlers/crash.js)

Multiplayer multiplier game with shared rounds (betting phase → running phase → crash). One round at a time, all players bet into the same round. Optional auto-cashout.

C->S:
- `crash-state` - Request current round state
- `crash-bet` - Place bet for current round `{ bet, autoCashout? }` (only during betting phase)
- `crash-cashout` - Cash out at current multiplier (only during running phase)

S->C:
- `crash-state` - Current round snapshot
- `crash-round-betting` - Betting phase started `{ roundId, durationMs }`
- `crash-round-running` - Round started running `{ roundId, startedAt }`
- `crash-tick` - Multiplier tick (~60fps cadence on server)
- `crash-round-crashed` - Round ended `{ crashPoint, ... }`
- `crash-bet-confirmed` - Bet accepted (to the bettor)
- `crash-bet-public` - Bet broadcast for the live bet feed
- `crash-cashout` - Cashout broadcast for the live feed
- `crash-cashout-confirmed` - Cashout confirmed (to the bettor)
- `crash-error` - Error response
- `balance-update` - Balance changed

## Blackjack
**Handler:** [server/handlers/blackjack.js](../server/handlers/blackjack.js)

Single-player vs. dealer, 6-deck shoe, S17 dealer rule, blackjack pays 3:2, double-down on first action only.

C->S:
- `bj-state` - Request current hand state
- `bj-deal` - Deal a new hand `{ bet }`
- `bj-hit` - Take another card
- `bj-stand` - Stand and let dealer play
- `bj-double` - Double down (first action only)

S->C:
- `bj-state-result` - Hand state (`{ idle: true }` if no active hand)
- `bj-error` - Error response
- `balance-update` - Balance changed

## Roulette
**Handler:** [server/handlers/roulette.js](../server/handlers/roulette.js)

European single-zero wheel, 13 bet types (straight 35:1, splits, dozens/cols 2:1, even-money outside bets). Up to 12 bets per spin. Spin cooldown enforced server-side.

C->S:
- `roulette-spin` - Spin the wheel with a list of bets `{ bets: [...] }`

S->C:
- `roulette-result` - Spin outcome `{ pocket, totalPayout, winningBets, balance, ... }`
- `roulette-error` - Error response
- `balance-update` - Balance changed

## Loop Machine (Step Sequencer)
**Handler:** [server/handlers/loop-machine.js](../server/handlers/loop-machine.js)

Persistent shared room: state restored from `loop_machine_state` jsonb singleton on boot, debounced 1s autosave on every mutation.

C->S:
- `loop-join` - Join loop machine session
- `loop-leave` - Leave session
- `loop-toggle-cell` - Toggle sequencer cell
- `loop-play-pause` - Toggle playback
- `loop-set-bpm` - Set tempo
- `loop-set-bars` - Set bar count (1, 2, or 4)
- `loop-set-synth` - Update synth parameters
- `loop-set-bass` - Update bass parameters
- `loop-set-master-volume` - Update master volume
- `loop-clear` - Clear all cells

S->C:
- `loop-sync` - Full sequencer state (on join, bar-count change, and clear)
- `loop-listeners` - Listener count update
- `loop-cell-updated` - Cell state changed
- `loop-state-updated` - Playback state changed (play/pause)
- `loop-bpm-updated` - BPM changed
- `loop-synth-updated` - Synth params changed
- `loop-bass-updated` - Bass params changed
- `loop-master-volume-updated` - Master volume changed

## LoL Betting
**Handler:** [server/handlers/lol-betting.js](../server/handlers/lol-betting.js)

C->S:
- `lol-validate-username` - Check if LoL username exists
- `lol-place-bet` - Place bet on player outcome
- `lol-get-bets` - Fetch active bets
- `lol-get-history` - Fetch bet history
- `lol-check-bet-status` - Check bet resolution status
- `lol-admin-resolve-bet` - Admin manual resolution (requires ADMIN_PASSWORD)

S->C:
- `lol-username-result` - Username validation result
- `lol-bet-placed` - Bet confirmed (PUUID is resolved server-side via the Riot API)
- `lol-bets-update` - Active bets list
- `lol-history-update` - Bet history
- `lol-bet-check-result` - Bet status response
- `lol-bet-resolved` - Bet resolved notification (also from the background match checker)
- `lol-bet-resolved-confirm` - Admin resolution confirmed
- `lol-bet-refunded` - Bet refunded (auto-timeout, default 50 min via `LOL_BET_TIMEOUT_MS`)
- `lol-bet-warning` - Non-fatal warning
- `lol-bet-error` - Error response

## Strict Brain (Brain Training)
**Handler:** [server/handlers/brain-versus.js](../server/handlers/brain-versus.js)

Player names for scores and versus rooms are derived from the registered socket (anti-spoofing). `brain-training-score` has a ~20s per-name cooldown and a 200 SC/day payout cap.

C->S:
- `brain-training-score` - Submit training mode score
- `brain-submit-score` - Submit daily test score
- `brain-get-leaderboard` - Fetch leaderboards
- `brain-versus-create` - Create versus room
- `brain-versus-join` - Join versus room
- `brain-versus-leave` - Leave versus room
- `brain-versus-start` - Start versus match
- `brain-versus-score-update` - Update score during match
- `brain-versus-finished` - Submit final score

S->C:
- `brain-leaderboard` - Overall leaderboard data
- `brain-game-leaderboards` - Per-game leaderboards data
- `brain-daily-cooldown` - Daily test reward already claimed today
- `brain-versus-created` - Room created
- `brain-versus-lobby` - Versus lobby state (players joined/left)
- `brain-versus-game-start` - Match started
- `brain-versus-scores` - Live score update
- `brain-versus-result` - Match ended with results
- `brain-versus-player-left` - Player left mid-match
- `error` - Error response
- `balance-update` - Balance changed (score rewards)

## Tierlist (Shared Lobby Tierlist)
**Handler:** [server/handlers/tierlist.js](../server/handlers/tierlist.js)

Single shared tierlist room (`tierlist-room`) with persistent state.

C->S:
- `tierlist-join` - Join the tierlist room
- `tierlist-leave` - Leave the tierlist room
- `tierlist-place-item` - Place an item on a tier
- `tierlist-remove-item` - Remove an item from the board

S->C:
- `tierlist-sync` - Full tierlist state snapshot (to joiner)
- `tierlist-listeners` - Listener count update (broadcast to room)
- `tierlist-item-placed` - Item placed broadcast
- `tierlist-item-removed` - Item removed broadcast

## Daily Streak
**Handler:** [server/handlers/daily-streak.js](../server/handlers/daily-streak.js)

UTC-day-based daily login reward. Capped at 150 SC + 1 💎 on day 7 of the 7-day cycle.

C->S:
- `streak-status` - Fetch current streak status
- `streak-claim` - Claim today's reward (idempotent within a UTC day)

S->C:
- `streak-status-result` - Status payload (or `{ error }`)
- `streak-claim-result` - Claim result `{ ok, reason?, reward?, ... }`
- `balance-update` - Balance changed (on successful claim)
- `diamonds-update` - Diamond count updated (on day-7 claim)

## Achievements
**Handler:** [server/handlers/achievements.js](../server/handlers/achievements.js)

59 achievements with progress counters, recursive `bump()` for meta-achievements (e.g. "Achievement Hunter" at 10 unlocks), gold/magenta toast on unlock. Counter updates use a single CTE UPSERT so concurrent bumps don't collapse.

C->S:
- `achievements-catalog` - Fetch the full achievement catalog
- `achievements-status` - Fetch this player's unlock + progress state

S->C:
- `achievements-catalog-result` - Catalog payload `{ catalog: [...] }`
- `achievements-status-result` - Status `{ unlocked, progress, ... }` (or `{ error }`)
- `achievement-unlocked` - Push when one or more achievements unlock `{ unlocks: [...] }`

## Activity Feed
**Handler:** [server/handlers/activity-feed.js](../server/handlers/activity-feed.js)
**Producer:** [server/activity-feed.js](../server/activity-feed.js)

In-memory ring buffer of recent lobby/site activity (logins, big wins, achievements, make-it-rain, stock trades, etc.). Broadcast to everyone via `activity-feed-event`.

C->S:
- `activity-feed-snapshot` - Fetch the current ring buffer

S->C:
- `activity-feed-snapshot-result` - Snapshot `{ events: [...] }`
- `activity-feed-event` - Push for every new activity event (global broadcast)

## Food Guessr
**Handler:** [server/handlers/food-guessr.js](../server/handlers/food-guessr.js)

Guess-the-country-from-a-dish-photo game with Classic, Rate, Scrandle Wiki, and Scrandle Community modes. Persistent ratings + leaderboards.

C->S:
- `food-rating-vote` - Vote on a dish in Rate mode `{ dishKey, rating }`
- `food-rating-state` - Fetch aggregate ratings + own votes
- `food-classic-finish` - Submit a Classic round result (for leaderboards)
- `food-scrandle-finish` - Submit a Scrandle (Wiki/Community) round result
- `food-leaderboards` - Fetch leaderboards payload

S->C:
- `food-rating-update` - Aggregate changed `{ dishKey, agg }` (global broadcast)
- `food-rating-vote-ack` - Own vote acknowledged
- `food-rating-state` - Aggregates + own votes response
- `food-leaderboards-data` - Leaderboards payload
- `food-rating-error` - Error response

## Notes
- Some events are reused across games; check payloads in handler files
- Client listeners live under [shared/js](../shared/js) and game-specific JS in [games](../games)
- Rate limits and validation rules are defined in individual handlers
- Most handlers require player registration via `register-player` first
