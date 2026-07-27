# Handoff Log

This file tracks recent changes, verification notes, and open risks. Each session should add new entries at the top.

---

# Handoff: Deflake the Plinko RTP Monte-Carlo test (2026-07-27)

## What Changed
The `every risk level achieves 93-98 % RTP over 200 K drops` test in `server/__tests__/plinko.test.js` ran an unseeded 200 K-drop simulation, so it could fail on an unlucky run (it did, once, during an unrelated stocks change, and passed on re-run). The high-risk paytable is the culprit: the 200x edge buckets have p = 1/4096 each, fat enough that 200 K drops occasionally push the measured RTP outside the band.

### `server/handlers/plinko.js`
- `dropBall()` now takes an optional `nextStep` argument (a function returning 0 or 1), defaulting to the existing `randomInt(0, 2)` CSPRNG. Production callers are unchanged — the socket handler still calls `dropBall()` with no arguments, so server-authoritative randomness is untouched.

### `server/__tests__/plinko.test.js`
- Added a local `mulberry32` PRNG and drove the RTP simulation with a fixed seed (`0xC0FFEE`), re-seeded per risk level so the same drop sequence is scored against all three paytables.
- The band assertion (93-98 %) and the statistical intent are unchanged: the test still measures each paytable's realized house edge, it just does so over a fixed sample.
- The `dropBall` structural test still calls `dropBall()` unseeded, so the crypto default path stays covered.

## How to Verify
- `npx vitest run server/__tests__/plinko.test.js` — 9 passed, reproducible across consecutive runs (verified 5x, identical results).
- Seeded RTPs: low 96.117 %, medium 95.141 %, high 96.461 %. These sit within 0.05 pp of the exact analytic values (96.138 / 95.112 / 96.494, computed from the binomial bucket probabilities), so the seed produces a representative sample rather than a lucky one — margins to the band edges are 1.5-3 pp.

## Open Risks / Notes
- The test no longer exercises `randomInt`'s distribution in the RTP path — that is the point (it was testing the paytable, not the CSPRNG), and the structural `dropBall` test still hits the default source.
- Unrelated, pre-existing in this container: all 30 tests in `server/__tests__/stocks-route.test.js` fail with `Cannot find package 'express'` — an incomplete `node_modules`, not a code defect. Fails identically without these changes. The remaining 32 files / 423 tests pass.

---

# Handoff: Tierlist UX — within-tier rearranging, drag edge auto-scroll (2026-07-20)

## What Changed
Client-only changes to Thing of the Week (`games/tierlist/`); no server or schema changes. (An unranked-pool sort control was built first, then removed on user request — the ask was ordering inside tier rows.)

### Within-tier rearranging (`index.html`, `js/game.js`)
- Items can now be dropped at a specific position inside a tier row (and re-dragged to rearrange); a gold insert marker shows the drop position while dragging (desktop + touch).
- Order is presentation-only: the server still stores just `itemIndex -> tier`, so per-tier order lives client-side in `localStorage` (`tierlist-order-<weekKey>`, pruned on week change) and is reconciled against server placements on every render (stale entries dropped, missing ones appended).
- Same-tier drops are pure rearranges and do NOT emit `tierlist-place-item`.

### Drag edge auto-scroll (`js/game.js`)
- While dragging (HTML5 drag or touch), holding the pointer within 140px of the viewport top/bottom scrolls the page (speed scales toward the edge). Fixes "can't scroll up while carrying an item to the tier rows" — the native browser zone was tiny/absent for touch.
- During touch auto-scroll the drop-zone highlight re-resolves each frame so it tracks zones scrolling past a stationary finger.

## How to Verify
- `npm test` (all pass; no server changes).
- Manual: open `/games/tierlist/`. Drag an item from the pool while holding the pointer near the top of the screen — page scrolls up. Drop items into a tier at a specific spot (gold marker), drag within the tier to rearrange, reload — order persists.
- Verified headless via Playwright: place → S tier, within-tier reorder via drop-at-left-edge, order persistence across reload, touch auto-scroll (scrollY decreased while finger held at top edge).

## Open Risks / Notes
- Within-tier order is per-browser (localStorage), not synced across devices — placements themselves still sync via the server.
- Pre-existing (not introduced here): on a cold server, `tierlist-join` can race `register-player` and get silently dropped (empty player name) until the next reload/reconnect.

---

# Handoff: Full repo review completed — file-for-file pass, tool sweep, spot-check verification (2026-07-20)

## What Changed
Closes out the multi-session repo review that ran across several prior handoff entries (code-review completion, audit pass, findings verification, spot-check, Nachtrag verification). No code touched — this entry documents scope and moves the review artifacts into `docs/review-2026-07/`.

## Scope of the Review
- **Full file-for-file review**: every server handler, route, and client game module read and assessed individually.
- **Tool-assisted audit pass**: `npm test`, lint, targeted `grep` sweeps for known risk patterns (client-authoritative state, missing locks, `Math.random()` in gambling code), `npm audit`.
- **Spot-check verification**: 10 randomly sampled files independently re-reviewed to sanity-check the file-for-file pass, plus a consolidated verification of all critical/high findings against the actual code (file:line anchors added, one weak rejection flagged).
- **3 Nachträge (follow-up addenda)**: three additional findings verified and folded into the report after the initial pass closed — brain-versus rate-limit gap, roulette disconnect handling, and roulette dead code — including a displacement check against the existing Top-10 fix list (no displacement; folded into the MEDIUM group).

## Artifacts
Moved from repo root to `docs/review-2026-07/`:
- `docs/review-2026-07/REVIEW_PROGRESS.md`
- `docs/review-2026-07/REVIEW_FINDINGS.md`
- `docs/review-2026-07/REVIEW_REPORT.md` — consolidated, verified report; start here. Top finding is a systemic TOCTOU/reentrancy pattern across casino socket handlers (no lock between the synchronous pre-check and the `await` balance mutation).

## Tracking
Findings from the review are tracked as GitHub issues **#152–#161**.

## How to Verify
- `ls docs/review-2026-07/` shows the three review files.
- Read `docs/review-2026-07/REVIEW_REPORT.md` for the prioritized Top-10 fix list and full findings by severity.
- Cross-check open issues #152–#161 against the report's Top-10 + HIGH/MEDIUM sections.

---

# Handoff: Admin escape hatch for stranded name ownership (2026-07-19)

## Problem
TOFU identity strands names: the owner token lives in localStorage, so clearing
site data or renaming from a second device leaves a name bound to a token
nobody holds anymore. The real owner then gets `NAME_TAKEN` on their own name
forever (reported for "Lukas": renamed to "Lukass" on a laptop, can't rename
back).

## What Changed
- [server/identity.js](server/identity.js): new `releaseName(playerName)` —
  nulls `players.owner_token` (memory-mode: deletes the map entry). Player data
  (balance, achievements, character) untouched; only the ownership binding
  resets, so the next `register-player` re-claims the name with that browser's
  current token.
- [server/index.js](server/index.js): new `POST /admin/release-name`
  (body `{ "name": "..." }`), guarded by the same `LOGS_TOKEN` timing-safe
  check as `/admin/logs`. 503 without config, 401 bad token, 400 bad name,
  404 unknown player.
- [server/routes/auth.js](server/routes/auth.js): path exempted from the
  session-auth middleware (it carries its own operator token).
- New [server/__tests__/identity.test.js](server/__tests__/identity.test.js):
  9 tests — token validation, claim/re-claim/taken, release-then-reclaim
  (the stranded-name scenario), verifyOwner binding.

## How to Verify
- `npm test` → 368 tests across 23 files, all green.
- Live fix for the reported case:
  `curl -X POST "https://<host>/admin/release-name?token=$LOGS_TOKEN" -H 'Content-Type: application/json' -d '{"name":"Lukas"}'`
  → then log in / rename to "Lukas" from the affected browser; the claim binds
  to that browser's token.

## Open Risks
- Release is operator-only by design: SITE_PASSWORD is shared among all
  players, so any self-service release UI would let anyone steal any name.
- Multi-device use of one name remains first-browser-wins; a second device
  needs the same localStorage token (or an operator release) — token
  export/import would be the proper follow-up feature.

---

# Handoff: Docs sweep — sync all docs with post-hardening codebase (2026-07-17)

## What Changed
Docs-only sweep, no code touched. Captures the drift from the identity/wallet hardening commit (64042ca) and general staleness in README + copilot instructions.

### README.md
- Rewrote Highlights + Games & Features around the actual shell nav: casino suite (6 games), Food Guessr, Thing of the Week (tierlist), achievements/daily streak/activity feed. Removed "Strict Club" (deleted long ago) and the "13 games / 9 frontends" counts.
- Fixed the broken `EVENTS.md` link (file lives at `docs/EVENTS.md`).
- Fixed module name `currency-store.js` → `currency.js`; added identity.js.
- Env section: noted code default SITE_PASSWORD=ADMIN vs `.env.example` STRICT, added `LOL_BET_TIMEOUT_MS`, `LOGS_TOKEN`, `KEEP_ALIVE_URL`/`RENDER_EXTERNAL_URL`.

### docs/EVENTS.md — event names now verified against code
A scripted diff of `socket.on(...)`/`emit(...)` names vs the catalog found ~17 documented events that don't exist and ~30 real events that were missing. All fixed; the diff is now empty both ways. Highlights:
- Loop Machine S->C: `loop-state`/`loop-*-changed` → `loop-sync`, `loop-*-updated`, `loop-listeners`.
- Strict Brain S->C: `brain-versus-joined/left/started/score` → `brain-versus-lobby/game-start/scores/result/player-left`, plus `brain-daily-cooldown`, `brain-game-leaderboards`.
- LoL S->C: `lol-username-validated`/`lol-error`/`lol-bet-status` → `lol-username-result`, `lol-bet-error`, `lol-bet-check-result`, plus `lol-bet-refunded`, `lol-bet-warning`, `lol-bet-resolved-confirm`.
- Watch Party S->C: load/playpause/seek broadcasts → `watchparty-video` + `watchparty-sync` (+`watchparty-error`).
- Mäxchen: moved chat/emote/drawing to the lobby section (they're lobby.js events), added `start-game` (it lives in maexchen.js, not lobby.js), `maexchen-believed`, `bets-update`; removed nonexistent `player-challenged`/`reaction`.
- Registration moved to the Currency section with `ownerToken` + `register-player-error` (TOFU identity).
- Stocks: added `stock-portfolio-history`, `stock-performance-leaderboard`.

### LLM_AGENT_GUIDE.md
- Added `identity.js` + TOFU identity flow, `currency.withWallet()` transactional wallet note.
- Achievements 53 → 59 (hardening commit added tiers), tests "~325+" → 359, casino "five tiles" → six.
- New pitfalls: never trust names from payloads (resolve from registered socket), brain-training anti-grind (~20s cooldown, 200 SC/day cap), 24h eviction of stale Blackjack/free-spin state.

### .github/copilot-instructions.md
- Overview rewritten (no Strict Club, casino suite listed), `currency-store.js` → `currency.js`, 9 → 16 game frontends, 207+ → 359 tests.

### .env.example
- Added `LOL_BET_TIMEOUT_MS`, `LOGS_TOKEN`, `KEEP_ALIVE_URL` (all verified against code).

## Notes
- `games/shopping/` (Strict Shopping Channel) exists but is not linked from the shell nav — left in the frontend list; consider linking or removing it.
- GitHub repo description ("This repository bundles a playable website...") matches the README's "In Short" line; still accurate.

## How to Verify
- `npm test` → 359 tests across 22 files, all green (run on this branch).
- Event-name diff: extract `socket.on('...')` and `emit('...')` names from `server/` and compare against the backticked event list in docs/EVENTS.md — both directions come back empty.

---

# Handoff: Watch Party queue + auto-advance (2026-07-02)

## What Changed

### Server ([server/handlers/lobby-watchparty.js](server/handlers/lobby-watchparty.js))
- New `state.queue` (`[{ queueId, videoId, addedBy, addedAt }]`, cap 20) included in every snapshot.
- New events:
  - `lobby-wp-queue-add` — validates the ID, dedupes against the playing video + queue, 1s per-socket cooldown. If nothing is playing it starts playback directly (same activity-feed push as a load).
  - `lobby-wp-queue-remove` — only the player who added an entry may remove it.
  - `lobby-wp-next` — manual skip to the next queued video; reuses the 3s video-change cooldown.
  - `lobby-wp-ended` — replaces the old client-side "pause at duration" emit. If the queue has entries the server auto-advances (new video plays from 0, `setBy` = whoever queued it); otherwise it pins paused-at-duration as before. Idempotent across N clients because the report must echo the *current* `state.videoId` while it's still `playing` — the first report wins, later ones no-op.
- `lobby-wp-clear` now also wipes the queue.

### Client ([public/lobby-watchparty.js](public/lobby-watchparty.js))
- YT `ENDED` now emits `lobby-wp-ended { videoId, time }` instead of a pause control.
- Queue UI: QUEUE button next to LOAD, NEXT button (hidden while the queue is empty), "UP NEXT (n)" list under the status line with `i.ytimg.com` thumbnails, adder name, and a remove ✕ on your own entries (ownership is enforced server-side; the client just hides the button for others).

### HTML/CSS
- [public/index.html](public/index.html): QUEUE/NEXT buttons + queue list markup.
- [public/lobby.css](public/lobby.css): `.lobby-wp-btn-cyan` + `.lobby-wp-queue-*` styles matching the arcade theme.

### Tests
- 16 new cases in [server/__tests__/lobby-watchparty.test.js](server/__tests__/lobby-watchparty.test.js): immediate-start on empty state, append, dedupe, add-cooldown, 20-cap, owner-only removal, ended auto-advance / pause-pin / stale-report dedupe, next + cooldown + empty-queue error, clear-wipes-queue. Suite: 359 tests across 22 files, all green.

## Known Limits / Open Ideas
- Queue entries show thumbnails but no titles (needs oEmbed lookup — separate feature).
- If someone pauses manually in the same instant a video ends, the ended report is dropped and the queue doesn't auto-advance; the NEXT button covers that edge.
- No viewer presence / vote-skip yet — queue-remove is owner-only, NEXT is open to everyone (cooldown-limited).

## How to Verify
- `npx vitest run server/__tests__/lobby-watchparty.test.js` (31 tests).
- Manual: two browsers on `/`, queue two videos, let the first end → both clients switch together; NEXT skips; CLEAR empties player + queue.

---

# Handoff: Docs refresh — sync guide/events with current handler set (2026-05-21)

## What Changed
Docs-only sweep, no code touched. The previous LLM_AGENT_GUIDE.md, docs/EVENTS.md and HANDOFF.md still described a 12-handler / 9-game shape with a "Strict Club" room that no longer exists. Updated to match what's actually wired in [server/socket-handlers.js](server/socket-handlers.js).

### docs/EVENTS.md
- Removed the dead "Strict Club" section (no `server/handlers/strict-club.js`, no `club-*` events in code).
- Added sections for every handler that was missing: Lobby Watch Party, Plinko, Crash, Blackjack, Roulette, Tierlist, Daily Streak, Achievements, Activity Feed, Food Guessr.
- Merged the standalone "Mäxchen Betting (Deprecated?)" stub into the main Mäxchen section.
- Added the `lobby-rain-effect` broadcast and the `register-player` reminder to currency/lobby sections.

### LLM_AGENT_GUIDE.md
- Quick repo map now lists all 21 socket handlers grouped by Core / Games / Casino.
- Games directory lists 16 entries (added blackjack, casino, crash, food-guessr, plinko, roulette, tierlist).
- Public + shared/js module lists refreshed (achievements.html, nostalgiabait/, shell.js, lobby-watchparty.js, ambient.js, achievement-toast.js, starfield-parallax.js, stock-ticker.js, tts.js etc.).
- Server top-level module list expanded (db, sql/, stock-providers/, stock-price-cache, food-/brain-/tierlist-/pictochat- stores, keep-alive, log-buffer, cleanup, activity-feed, achievements, daily-streak).
- "Database modules" fixed — the file is `server/currency.js`, not `currency-store.js`.
- Test count bumped from "207+" to "~325+ across 22 files".
- New "Casino Hub" + "Engagement Loop" core-flow sections; pitfalls extended with crash phases, free-spin volatility, achievement bump recursion.

### docs/ cleanup
- Deleted `docs/mvp-umsetzungs-checkliste.md` — superseded German MVP checklist that the 2026-02-15 entry claimed was already removed.
- Deleted `docs/persistence-plan.md` — persistence is implemented.

## Status Corrections to Prior Handoffs
- **Strict Club is not in the codebase.** Earlier handoffs (2026-05-02) listed an "in-memory Strict Club queue" as an open risk. The handler, client, and routes are gone; that risk no longer applies.
- The "207+ tests" baseline in the previous guide was stale — current suite is ~325 tests across 22 files.

## Drift Captured but Not Documented Here
The May commit run (Food Guessr Add → Rate → Wiki → Community modes + persistent scores, Stocks provider cascade overhaul with Stooq primary + v8 chart + v7 spark + persistent cache + `/api/_stock-diag`, Watch Party portal pattern + sync fixes + mini-player, Activity feed coverage expansion, Render keep-alive cron + 12-min ping + earlier start, `/admin/logs` ring-buffer endpoint with `LOGS_TOKEN` auth, Aero-Glass shell redesign + revert) is in `git log` but never got its own handoff entry. Surface what you need on a per-feature basis from the commit history; this docs-refresh is not a substitute for a real handoff on those features.

## How to Verify
- `grep -r "strict-club\|club-join" server/ public/ shared/ games/` returns nothing.
- `ls docs/` shows only `EVENTS.md`.
- `ls server/handlers/` matches the handler list in the guide (21 files).
- `git diff HEAD~1 -- LLM_AGENT_GUIDE.md docs/EVENTS.md HANDOFF.md` for review.

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
