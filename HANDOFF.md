# Handoff Log

This file tracks recent changes, verification notes, and open risks. Each session should add new entries at the top.

---

# Handoff: Streak rebalance + max-bet bump + 27 new achievements (2026-05-02 evening)

## What Changed

### Daily Streak rebalanced
Coin rewards capped at 150 SC (day 7). New table: 20/35/55/75/95/120/150
across the 7-day cycle. The previous +50 % per-cycle bonus is removed —
the daily ceiling is now 150 SC + 1 💎 forever, no matter the streak length.

### Max bet 50 → 500 across all five casino games
New bet ladder for Strictly7s, Plinko, Crash, Blackjack, Roulette:
**5, 10, 25, 50, 100, 500**. All five server handlers + their HTML bet
buttons + matching tests are updated.

### Achievements: 26 → 53
Adds 27 new achievements:
- **Wealth ladder extended** to 13 tiers up to 10 000 000 000 SC
  (250k / 500k / 1M / 5M / 10M / 50M / 100M / 500M / 1B / 10B). Top tier
  gives 50M coins + 500 💎 on unlock.
- **At least one achievement per site activity** that didn't have one:
  Pictochat (first stroke + 100 strokes), Soundboard (first play),
  Loop Machine (first cell), Watch Party (first play), LoL Betting
  (first bet + 5 wins), Strict Club (first listen), Türkçe (first
  lesson), Tierlist (first placement), Make-It-Rain (first trigger),
  Shop (first diamond + 10 owned), Roulette (first spin + first
  straight-up hit), Blackjack (first hand + natural BJ + 100 hands).
- **Meta**: "Achievement Hunter" auto-unlocks at 10 unlocks via the
  recursive `bump(playerName, 'achievements_unlocked', …)` call.
- **5 creative achievements**:
  1. Sweet Spot — land in the middle Plinko bucket on HIGH risk.
  2. Eight Ball — hit number 8 on Roulette.
  3. Lucky Thirteen — hit number 13 on Roulette.
  4. Synesthetic — fill all 14 Loop Machine instruments in one bar.
  5. Speedrunner — accumulate 50 SC of Crash profit by cashing out
     below 1.10×.

### Hooks added
Pictochat, Soundboard, Loop Machine (cells + full-bar detector), Watch
Party (host plays), LoL Betting (place + win via match-checker),
Tierlist place, Türkçe complete, Strict Club join, Mäxchen rounds &
wins, Stocks buy/sell + max net worth, Strict Brain daily test +
versus wins, Shop diamond purchases, Make-It-Rain trigger, plus the
existing slot/plinko/crash hooks.

## How to Verify
- `npm test` → 325 passing tests across 21 files (Streak test now
  asserts 150-cap + cycle-no-bonus).
- Place any bet at 500 SC in any casino game → server accepts it.
- Trigger any new activity (e.g. play soundboard) → unlock toast
  appears. After the 10th unlock, "Achievement Hunter" auto-fires.

# Handoff: Casino expansion + engagement loop + persistence (2026-05-02)

## What Changed (chronological)

1. **Daily Streak** (`server/daily-streak.js`, `server/handlers/daily-streak.js`,
   lobby UI). Escalating coin reward for consecutive UTC-day logins (50 → 750 SC
   over 7 days, +50% bonus per cycle, every 7th day grants 1 💎). Magenta panel
   on the lobby with flame indicator, 7-day pill row, and CLAIM button.
2. **Achievement system** (`server/achievements.js`, `server/handlers/achievements.js`,
   `public/achievements.html`, `shared/js/achievement-toast.js`). 26 achievements
   across the casino games + cross-game wealth tiers + streak milestones. Hooks
   in Strictly7s, Plinko, Crash and the streak claim auto-bump counters and
   record unlocks; a slide-in toast appears on whichever page the player is on.
   New `addDiamonds` helper in `currency.js` grants diamonds without spending
   coins.
3. **Blackjack** (`server/handlers/blackjack.js`, full client at
   `games/blackjack/`). Single-player vs. dealer, 6-deck shoe, S17 dealer, BJ
   pays 3:2, double-down on first action. 22 tests covering soft/hard hand math
   and the full settle matrix.
4. **Roulette** (`server/handlers/roulette.js`, full client at `games/roulette/`).
   European single-zero wheel, 13 bet types (straight 35:1, dozens/cols 2:1,
   even-money outside bets), up to 12 bets per round. Wheel rendered to canvas
   and animated 5 turns + ease-out cubic to land on the server's pocket. 21
   tests including Monte-Carlo RTP verification.
5. **Watch Party drift fix** (`server/handlers/watchparty.js` + client).
   Sync events now carry a `serverTime` so receivers can apply the in-flight
   latency offset before deciding to seek. Threshold tightens 2s → 1.5s.
6. **Loop Machine persistence** (`server/handlers/loop-machine.js`, schema).
   New `loop_machine_state` jsonb singleton row; the shared grid/BPM/bars/
   master volume/synth/bass patches are saved with a 1s debounce after every
   mutation and restored on boot. Server restart no longer wipes the room.

## Casino Hub Status
All five tiles now LIVE: Mäxchen, Strictly7s 2.0, Blackjack, Roulette, Plinko,
Crash. Casino Hub `/games/casino/` is the single landing page for all gambling
games.

## Schema additions
- `daily_streaks (player_id pk, current_streak, max_streak, last_claimed_day, total_claims)`
- `achievements (player_id, achievement_id pk, unlocked_at, metadata)`
- `achievement_progress (player_id, counter_id pk, value)`
- `loop_machine_state (id=1 pk, state jsonb, updated_at)`
All idempotent via `create table if not exists`.

## Notes that didn't need new code
- **Stocks crypto:** already supported. `routes/stocks.js` ticker list contains
  BTC/ETH/SOL/BNB/XRP/ADA/DOGE; the buy/sell handler accepts the `-USD` suffix
  via its symbol regex; the frontend has a CRYPTO category tab and renders
  these tickers natively. No code change needed.
- **LoL auto-timeout:** already implemented in `lol-match-checker.js`. Each
  pending bet gets a `scheduleBetTimeout()` `setTimeout` (default 50 min,
  `LOL_BET_TIMEOUT_MS` env override) that calls `resolveBetByTimeout` to
  refund. The audit was incorrect.

## How to Verify
1. `npm test` → 325 passing tests across 21 files.
2. Lobby page shows the streak panel; clicking CLAIM grants the day's coin
   reward and progresses the streak.
3. `/achievements.html` renders all 26 achievements with progress bars; an
   in-game unlock fires the gold/magenta toast in the corner.
4. Casino hub at `/games/casino/` shows all 5 game tiles as LIVE; each leads
   to a working playable page.
5. Restart the server while a Loop Machine pattern is active → the grid
   should reload identically.
6. Two browser tabs in a Watch Party room with the host playing a video
   should now stay in sync to within ~1.5 s instead of drifting linearly
   with network latency.

## Open Risks
- **Mäxchen rooms** are still in-memory only — restarting during an active
  game still drops the round. Persistence would require serialising hands +
  betting state; not done.
- **Strict Club** queue is also in-memory; same caveat as Mäxchen.
- **Weekly leaderboards** were on the wishlist but skipped this session.

---

# Handoff: Strictly7s 2.0 — Slot Rework (2026-05-01)

## What Changed

### Math / Server (`server/handlers/strictly7s.js`)
Full rewrite of the slot game logic.
- **Grid:** 5 reels × 3 rows (was 3×1)
- **Paylines:** 10 fixed lines, **win-both-ways** (was 1 center line)
- **Symbols:** SEVEN, DIAMOND, BAR, BELL, CHERRY, LEMON, WILD, BLANK (filler), SCATTER (was 6 symbols, no wild/scatter/blank)
- **WILD** lands only on reels 2/3/4. When any wild lands on an inner reel, the entire reel is treated as WILD (expanding wild) for win evaluation.
- **SCATTER** pays anywhere (2×/5×/25× total bet for 3/4/5). 3+ scatters trigger 10 free spins at 2× multiplier with retrigger.
- **Free-spin state** is per player name in an in-memory `Map` (lost on server restart).
- **RTP:** verified ~95.9 % via 1 M-spin Monte Carlo simulation (target was 96 %).
- **Hit frequency:** ~30.7 %.
- **Free-spin trigger frequency:** ~1 in 178 base spins.
- **Max single-spin payout:** ~600× bet.
- **Server-authoritative**: `crypto.randomInt` per cell, weighted draw.

### Tests (`server/__tests__/strictly7s.test.js`)
Full rewrite. 31 tests covering config sanity, reel pools, grid generation, expanding wild, line evaluation (incl. win-both-ways, dedupe, BLANK/SCATTER breaking runs), scatter triggers, free-spin parameters, and a 200 K-spin Monte Carlo RTP test (asserts 94–98 %).

### Client (`games/strictly7s/{index.html, strictly7s.css, js/game.js}`)
Full rewrite.
- 5×3 reel grid with SVG payline overlay.
- Reel-spin animation: scrolling strip with per-reel speed stagger, snap-to-final using `cubic-bezier` ease-out.
- **Anticipation** state (animated magenta glow + low-frequency hum) on later reels when 2 scatters are already visible.
- **Expanding-wild** visual: reel turns cyan with shimmer.
- **Big-Win counter banner** with logarithmic count-up (Big ≥10×, Mega ≥25×, Epic ≥50×, Ultra ≥100× of bet) plus coin-rain particles.
- **Free-Spin intro** modal + persistent badge during FS sessions; auto-spin queue inside FS.
- **Web Audio API synth chiptune music**: layered bass + lead + hi-hat patterns. Two modes — `base` (96 BPM) and `fs` (132 BPM, brighter pattern). Crossfade-style swap on entering/exiting free spins.
- Reel-stop sound has rising pitch per reel index.
- Turbo mode toggle (faster spin + skip anticipation).
- No MP3 assets used; all audio is generated via oscillators and noise buffers.

### Docs
- `docs/EVENTS.md` — Strictly7s section updated to reflect new event payloads (`strictly7s-spin-result`, `strictly7s-free-spins`, `strictly7s-state`).

## How to Verify

1. `npm test -- server/__tests__/strictly7s.test.js` → 31 tests pass.
2. Start server (`npm run dev`), navigate to `/games/strictly7s/`.
3. Spin at any bet. Verify reel animation + outcome.
4. Trigger free spins by hitting 3+ scatters (or reduce SCATTER weight in `REEL_POOLS` for faster testing).

## Open Risks / Notes
- Free-spin state is **in-memory only**. A server restart while a player has free spins remaining will erase them. If this matters, persist to DB.
- Old MP3 audio files in `games/strictly7s/audio/` are no longer referenced; they can be deleted in a follow-up commit.
- Mobile layout has been stress-tested in viewports down to 360 px. The 5-column reel grid stays readable but symbols shrink (`clamp(28px, 6vw, 52px)`).
- 7 unrelated test failures exist in `server/__tests__/stocks-route.test.js` because `node_modules` is empty in the dev environment (express not installed). Unrelated to slot work.

---

# Handoff: Documentation Cleanup and Updates (2026-02-15)

## What Changed

### Documentation Updates

**README.md:**
- Updated highlights section with comprehensive feature list (13 games/experiences)
- Expanded repo structure with detailed handler/route breakdown
- Added complete games & features section with descriptions
- Enhanced configuration section with all env vars and their purposes
- Reorganized content for better clarity

**docs/EVENTS.md:**
- Complete rewrite with all 70+ socket events cataloged
- Organized by handler file with clear C->S and S->C sections
- Added handler file references for each section
- Documented all games: Lobby, Currency, Mäxchen, Watch Party, Pictochat, Soundboard, Stock Market, Strictly7s, Loop Machine, LoL Betting, Strict Brain, Strict Club
- Added notes about rate limits, validation, and prerequisites

**LLM_AGENT_GUIDE.md:**
- Updated repo map with current handler structure
- Added detailed core flows section covering auth, player registration, lobby flow, multiplayer rooms, currency system, stock market
- Expanded "Do this every task" with test running and EVENTS.md reference
- Enhanced safety section with database transactions, error handling, logging, resource cleanup
- Added local conventions (ES6, naming, socket events, database, tests, CSS)
- Added common pitfalls section with 8 important gotchas

**Cleanup:**
- Removed outdated `docs/mvp-umsetzungs-checkliste.md` (German MVP checklist, no longer relevant)
- Removed outdated `docs/persistence-plan.md` (persistence already implemented)

## What Didn't Change
- No code changes
- No configuration changes
- No dependencies changed
- All tests remain at 207+ passing
- No functional behavior altered

## How to Verify
1. Read README.md - verify it accurately describes current state
2. Read docs/EVENTS.md - verify all socket events are documented
3. Read LLM_AGENT_GUIDE.md - verify it matches current architecture
4. Verify outdated docs are gone: `ls docs/` should only show `EVENTS.md`

## Notes for Next Session
- Documentation is now current as of 2026-02-15
- All 13 games/features are documented
- Socket event catalog is comprehensive
- LLM agents should follow updated guide for consistency

---

*Previous handoffs below this line represent historical changes. Read them to understand recent evolution of the codebase.*

---
