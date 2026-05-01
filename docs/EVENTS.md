# Socket Event Catalog

This is a practical catalog of Socket.IO events. Source of truth is handler files in [server/handlers/](../server/handlers/).

## Conventions
- Direction: C->S means client to server, S->C means server to client
- Payload shapes and rate limits live in the server handler files
- If you add or change an event, update this file

## Core Lobby & Room Management
**Handler:** [server/handlers/lobby.js](../server/handlers/lobby.js)

C->S:
- `register-player` - Register username and character
- `get-lobbies` - Request list of active rooms
- `create-room` - Create new game room
- `join-room` - Join existing room
- `start-game` - Start game (host only)
- `leave-room` - Leave current room

S->C:
- `online-players` - Broadcast of all connected players
- `lobbies-update` - Active rooms list
- `room-created` - Confirmation of room creation
- `room-joined` - Player joined room
- `room-update` - Room state changed
- `player-left` - Player left room
- `game-started` - Game beginning

## Currency System
**Handler:** [server/handlers/currency.js](../server/handlers/currency.js)

C->S:
- `get-balance` - Fetch player's StrictCoin balance
- `get-player-character` - Fetch character data
- `get-player-diamonds` - Fetch another player's diamond count by name (contacts list); responds via `player-diamonds`
- `get-my-diamonds` - Fetch the current socket's own diamond count; responds via `diamonds-update`
- `buy-diamonds` - Purchase diamonds (premium)
- `lobby-make-it-rain` - Spend coins for lobby animation

S->C:
- `balance-update` - Balance changed
- `player-character` - Character data response
- `player-diamonds` - Diamond count for a looked-up player (response to `get-player-diamonds`)
- `diamonds-update` - Own diamond count (response to `get-my-diamonds` / `buy-diamonds`)

## Mäxchen (Dice Bluffing)
**Handler:** [server/handlers/maexchen.js](../server/handlers/maexchen.js)

C->S:
- `roll` - Roll dice
- `announce` - Announce dice value (truthful or bluff)
- `challenge` - Challenge previous player's announcement
- `believe-maexchen` - Accept Mäxchen claim
- `emote` - Send emote reaction
- `chat-message` - Send chat message
- `drawing-note` - Draw on shared canvas

S->C:
- `dice-rolled` - Dice roll animation trigger
- `roll-result` - Actual dice values (to current player only)
- `player-announced` - Announcement broadcast
- `player-challenged` - Challenge initiated
- `challenge-result` - Challenge outcome
- `player-disconnected` - Player left game
- `game-over` - Game ended
- `chat-broadcast` - Chat message broadcast
- `drawing-note` - Drawing broadcast
- `reaction` - Emote broadcast
- `turn-start` - Turn changed

## Watch Party
**Handler:** [server/handlers/watchparty.js](../server/handlers/watchparty.js)

C->S:
- `watchparty-load` - Load new video
- `watchparty-playpause` - Toggle play/pause
- `watchparty-seek` - Seek to timestamp
- `watchparty-request-sync` - Request sync with host
- `watchparty-heartbeat` - Keep-alive ping (prevents server spin-down)

S->C:
- `watchparty-load` - Video loaded broadcast
- `watchparty-playpause` - Play/pause broadcast
- `watchparty-seek` - Seek broadcast
- `watchparty-sync` - Sync state response
- `watchparty-heartbeat-ack` - Heartbeat acknowledgment

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
- `stock-leaderboard` - Leaderboard data
- `stock-error` - Error response
- `balance-update` - Balance changed after trade

## Strictly7s 2.0 (Slot Machine)
**Handler:** [server/handlers/strictly7s.js](../server/handlers/strictly7s.js)

5×3 grid, 10 paylines, win-both-ways, expanding wild on reels 2/3/4, scatter pays, free spins (10 spins, 2× multiplier, retrigger). 96% RTP.

C->S:
- `strictly7s-spin` - Spin slot machine `{ bet }` (bet ignored during free spins; uses locked bet from trigger spin)
- `strictly7s-state` - Request current free-spin state for the player

S->C:
- `strictly7s-spin-result` - Spin outcome `{ grid, expandedReels, wins, lineWinTotal, scatterCount, scatterPositions, scatterPay, bet, multiplier, payout, freeSpinsAwarded, freeSpinsRemaining, wasFreeSpin, balance }`
- `strictly7s-free-spins` - Current free-spin state `{ remaining, multiplier, bet }`
- `strictly7s-error` - Error message
- `balance-update` - Balance changed

## Loop Machine (Step Sequencer)
**Handler:** [server/handlers/loop-machine.js](../server/handlers/loop-machine.js)

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
- `loop-state` - Full sequencer state
- `loop-cell-toggled` - Cell state changed
- `loop-play-pause` - Playback state changed
- `loop-bpm-changed` - BPM changed
- `loop-bars-changed` - Bar count changed
- `loop-synth-changed` - Synth params changed
- `loop-bass-changed` - Bass params changed
- `loop-volume-changed` - Volume changed
- `loop-cleared` - Grid cleared

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
- `lol-username-validated` - Username validation result
- `lol-bet-placed` - Bet confirmed
- `lol-bets-update` - Active bets list
- `lol-history-update` - Bet history
- `lol-bet-status` - Bet status response
- `lol-bet-resolved` - Bet resolved notification
- `lol-error` - Error response

## Strict Brain (Brain Training)
**Handler:** [server/handlers/brain-versus.js](../server/handlers/brain-versus.js)

C->S:
- `brain-training-score` - Submit training mode score
- `brain-submit-score` - Submit challenge score
- `brain-get-leaderboard` - Fetch leaderboard
- `brain-versus-create` - Create versus room
- `brain-versus-join` - Join versus room
- `brain-versus-leave` - Leave versus room
- `brain-versus-start` - Start versus match
- `brain-versus-score-update` - Update score during match
- `brain-versus-finished` - Submit final score

S->C:
- `brain-leaderboard` - Leaderboard data
- `brain-versus-created` - Room created
- `brain-versus-joined` - Player joined
- `brain-versus-left` - Player left
- `brain-versus-started` - Match started
- `brain-versus-score` - Score updated
- `brain-versus-finished` - Match ended

## Strict Club (Music Room)
**Handler:** [server/handlers/strict-club.js](../server/handlers/strict-club.js)

C->S:
- `club-join` - Join music room
- `club-leave` - Leave music room
- `club-queue` - Add track to queue
- `club-skip` - Skip current track
- `club-pause` - Pause playback

S->C:
- `club-state` - Room state (current track, queue, listeners)
- `club-track-changed` - Track changed
- `club-error` - Error response

## Mäxchen Betting (Deprecated?)
**Handler:** [server/handlers/maexchen.js](../server/handlers/maexchen.js)

C->S:
- `place-bet` - Place bet on Mäxchen round outcome

## Notes
- Some events are reused across games; check payloads in handler files
- Client listeners live under [shared/js](../shared/js) and game-specific JS in [games](../games)
- Rate limits and validation rules are defined in individual handlers
- Most handlers require player registration via `register-player` first
