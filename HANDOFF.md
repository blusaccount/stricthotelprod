# Handoff Log

This file tracks recent changes, verification notes, and open risks. Each session should add new entries at the top.

---

# Handoff: Repo identity — stricthotelprod (2026-07-28)

## Why
This repo is a clone of `blusaccount/stricthotelweb`, taken as the starting
point for the production build. The clone carried a stale HEAD commit
(`467822e`, "Rename package to strictlyprivate") describing a rename plan that
was abandoned. Left in place it would keep pointing future readers — human and
agent — at a package name and a repo split that no longer exist.

## What Changed
- Reverted the effect of `467822e`. It touched only `package.json` (name +
  description); no code was affected by the revert. The commit itself is kept
  in history rather than dropped: it is already published on `origin/master`,
  so removing it would mean rewriting a shared branch. The resulting tree is
  the same either way.
- `package.json`: name is now `stricthotelprod`. Description restored to the
  pre-rename wording, which describes the stack accurately and makes no claim
  about which repo this is or what it excludes.
- `docs/review-2026-07/REVIEW_REPORT.md`: title `— stricthotelweb` →
  `— StrictHotel`. The July review was run against this exact tree, so the
  findings carry over unchanged; only the repo-specific label was wrong.
- Test-count baseline corrected in the three docs that agents check before
  committing (`README.md`, `LLM_AGENT_GUIDE.md`,
  `.github/copilot-instructions.md`): 359 tests / 22 files → 478 / 34. The old
  figure predates the reentrancy, tierlist, turkish-streak and crash-queue test
  files. Historical entries further down this log keep their original numbers —
  they were correct when written.

## How to Verify
- `npx vitest run` → **478 passed / 34 files**, matching the new baseline.
- `grep -n '"name"' package.json` → `stricthotelprod`; no `strictlyprivate`
  remains in the working tree.
- `grep -rn "strictlyprivate\|stricthotelweb" --include=*.md --include=*.json .`
  matches only this handoff entry, which documents the change deliberately.
  No occurrence remains in `package.json`, the README, the agent guides or the
  review docs.

## Open Risks / Notes
- **`.github/workflows/keep-alive.yml` needs a `RENDER_URL` repo secret.**
  Secrets do not follow a clone. Until it is set, the workflow runs every 12
  minutes and fails every time with `::error::RENDER_URL secret not set`.
  Either add the secret for this deployment or disable the workflow here.
- **The feature split is undecided.** The reverted commit asserted that a
  commercial build cannot carry LoL Betting, the Yahoo Finance scraper, the
  hidden YouTube ambience player and the AdSense tag. That claim is unverified
  and nothing acts on it — all four are still present and wired in
  (`socket-handlers.js:148`, `index.js` match checker, `public/ambience.js`,
  `games/shopping/index.html:14`). Decide deliberately before removing
  anything; none of it was touched here.
- Deployment hardening carried over from the July review and still open:
  `SITE_PASSWORD` falls back to `'ADMIN'` without a production fail-fast
  (`routes/auth.js:8`), `handlers/watchparty.js` never checks `room.hostId`,
  and `addBalance`/`buyDiamonds` skip `withBalanceLock` in the memory-only path
  (`currency.js:95,238`).

---

# Handoff: Crash — cancel a queued bet + next-round roster (2026-07-27)

## Why
Follow-up to the queued-bets entry below, closing the two gaps flagged there as
open risks: a queued stake could not be withdrawn (coins locked for a whole
flight after one misclick), and other players' queued bets were sent to the
client but never rendered.

## What Changed

### `server/handlers/crash.js` — new `crash-unqueue`
- Refunds a queued stake (`crash_bet_unqueue_refund`) and drops it from
  `pendingBets`. Only valid while the bet is still queued.
- **Claims the entry synchronously before the refund await.** This is the whole
  correctness argument: `startBettingPhase()` promotes bets synchronously, so
  deleting from `pendingBets` before any `await` closes the window in which a
  round could start mid-refund and hand the player a live bet they had already
  been refunded for. Same shape as the `claimOnce` guard in `resolveCashout`.
- Distinguishes the two failure modes: `Bet already went live for this round`
  (promoted while you were reading) vs `No queued bet to cancel`.
- Bets that already went live stay final — unchanged from betting-phase
  semantics.

### `games/crash/js/game.js`, `index.html`, `crash.css`
- `CANCEL QUEUED BET` aux button, shown only while `queuedBet` is set.
- New `QUEUED FOR NEXT ROUND` roster (`renderPendingPlayers()`), fed by the
  `pending` payload that was already on the wire, hidden when empty. Magenta
  throughout to match the queued bet-info, so it never reads as money in the
  current round.

## How to Verify
- `npx vitest run` — **478 passed / 34 files** (was 472/34). Six new tests in
  `crash-queued-bets.test.js`: refund + dequeue, re-queue after cancel,
  double-clicked cancel refunding once, cancel rejected once live, cancel with
  nothing queued, and a promotion racing the refund (asserts the bet is in
  neither map afterwards).
- Extended the end-to-end run against the real round loop — 21 checks, all pass:
  queue → duplicate rejected → cancel → refund verified against real balances →
  second cancel rejected → re-queue → promoted into the next round → cancel
  correctly refused once live.

## Open Risks / Notes
- **Cancel/re-queue is unlimited and free.** No cooldown beyond the shared
  `checkRateLimit(socket, 5)`, and each cycle writes two currency rows
  (`crash_bet` + `crash_bet_unqueue_refund`). It mints nothing and cannot go
  negative, so it is a ledger-noise concern, not an exploit. If the transaction
  log gets spammy, a per-round cancel cap is the lever.
- `crash_bets` is bumped on every queue, so cancel/re-queue cycles inflate that
  counter and can farm the one-time 'Lift-off' achievement's 50 SC... **no** —
  verified: `bump` only pays a reward the first time a threshold is crossed, so
  the 50 SC lands once. The counter is still inflated, which affects nothing
  today (threshold 1) but would matter if a "place N Crash bets" achievement is
  ever added — bump on promotion instead of on queue if so.
- Still not verified in a browser (`SITE_PASSWORD` gate) — carried forward. The
  new roster block and cancel button are unrendered-unverified in particular.

---

# Handoff: Crash — bet mid-round to join the next one (2026-07-27)

## Why
Requested by the maintainer: while a round is in flight you had to sit out the
whole flight *and* the 4 s reveal before you could bet again. `crash-bet` now
accepts in every phase — during betting it joins the round about to start,
during running/reveal it is queued for the next round.

## What Changed

### `server/handlers/crash.js`
- New module-level `pendingBets` Map (`playerName -> same shape as round.bets`).
  Deliberately **outside** `round`, which is replaced wholesale each round.
- `crash-bet` accepts during `running` / `reveal` and queues. **The stake is
  deducted at queue time** — the player has committed, and it avoids a bet that
  silently evaporates at promotion because the balance moved.
- The duplicate check is now **phase-specific**, which is the subtle part: a
  player with a bet riding the current round must still be able to queue one for
  the next, so queueing checks `pendingBets`, not `round.bets`.
- `startBettingPhase()` promotes every pending bet into `round.bets` (a pure
  move — no second deduction) and emits their `crash-bet-public` then.
- Post-await phase re-resolution. Immediate bets keep the old semantics: if the
  round closed under the `deductBalance` await, refund (unchanged). A *queued*
  bet whose next round opened during the await is placed live in that round
  instead of being held back another full round.
- `crash-state` snapshot gained `pending: [{ name, bet, autoCashout }]`, so a
  queued bet survives a page reload.
- `crash-bet-confirmed` gained `queued: true|false`.

### `games/crash/js/game.js`
- `bettingOpen()` replaces the scattered `roundState !== 'betting' || myBet`
  guards; new `queuedBet` state rebuilt from `crash-state.pending`.
- Place-bet button relabels to `BET NEXT ROUND` (magenta `.queueing`) outside the
  betting phase; `bet-info` appends `N SC queued for next round`.
- **Fixed a latent bug this would otherwise have exposed**: `applyState` reset
  `curvePoints` on *every* `crash-state` while running. That was harmless when
  state was only broadcast on phase transitions, but the server now broadcasts
  mid-flight when someone queues — which would have wiped every player's drawn
  curve. The reset is now guarded to the `prev !== 'running'` transition.

### `games/crash/crash.css`, `games/crash/index.html`, `docs/EVENTS.md`
- `.bet-info.queued` + `.primary-btn.bet.queueing` in magenta. `.queued` is
  declared **before** `.active`/`.cashed`/`.lost` on purpose so a live stake's
  colour wins when a player has both.
- Status/footer copy updated; Crash section of EVENTS.md rewritten.

## How to Verify
- `npx vitest run` — **472 passed / 34 files** (was 459/33). New file
  `server/__tests__/crash-queued-bets.test.js`, 13 tests: queueing during
  running and during reveal, auto-cashout carried through, queueing while a bet
  is already riding, duplicate rejection, double-click race inside the deduct
  await, insufficient funds, promotion without re-deduction, no re-promotion on
  the following round, both phase-flip-during-await directions, and the
  `crash-state` split between `bets` and `pending`.
- **Driven end-to-end against the real round loop** (real timers, real in-memory
  currency, no mocks): queued mid-flight → landed in `pendingBets`, stayed out of
  the live round, survived a duplicate attempt, then promoted into round 2 with
  its auto-cashout intact and no second deduction. All 13 checks passed.

## Open Risks / Notes
- **No cancel.** A queued bet cannot be withdrawn, matching existing bet
  semantics (a bet placed during the betting phase is already final). But a bet
  queued 2 s into a 60 s round locks those coins for the whole flight. If that
  annoys players, a `crash-unqueue` refunding from `pendingBets` is the fix —
  deliberately not built, since it was not asked for.
- Other players' queued bets are in the `pending` payload but **not rendered** —
  "PLAYERS THIS ROUND" still lists only the live round. Data is there if a
  "next round" section is wanted later.
- `stopCrashLoop()` drops `pendingBets` without refunding, exactly as it already
  drops `round.bets`. On a real restart those stakes are lost. Pre-existing
  pattern, not made worse, but now there is a second map with the same exposure.
- The `crash_first` "Lift-off" achievement (+50 SC) fires on a queued bet too —
  correct, but it means a first-bet balance delta is −50, not −100. Cost an
  assertion in verification; noted so the next reader does not re-derive it.
- Still not verified in a browser (`SITE_PASSWORD` gate) — carried forward.

---

# Handoff: Crash — curve rendered as a vertical line after ~6.4s (2026-07-27)

## Why
Reported by the maintainer: the Crash graph "starts going vertical". Client-only
rendering defect in `games/crash/js/game.js`; no server, math, or RTP change.

## Root Cause
`timeToX(elapsedMs)` derived its own view window from **the point's own timestamp**:

    const totalShown = Math.max(8000, elapsedMs * 1.25);
    return 30 + (elapsedMs / totalShown) * (W - 60);

For any `t >= 6400ms` that ratio is `t / (1.25 * t)` = exactly `0.8`, so every
sample past 6.4s mapped to the identical x pixel. The curve bent upward from 6.4s
and was fully vertical by ~20s, once the 800-point ring buffer had dropped every
sample older than 6.4s. The comment above it already described the correct intent
("pin current time to 80% of width") — only the implementation was self-referential.

## What Changed (`games/crash/js/game.js`, client only)
- Split into `timeSpanForView(tipMs)` + `timeToX(elapsedMs, totalShown)`. `drawCurve()`
  computes `totalShown` **once per frame from the tip** and passes it to all 7 call sites.
- **Second defect, found while verifying the first and previously masked by it**: the
  800-point buffer `shift()`ed off the head, so past ~13.3s the curve no longer reached
  back to `t = 0` while the fill path still started at the origin — drawing a false chord
  from bottom-left across the plot (measured: 523px of missing head at 60s). Hit any round
  past m≈2.2, i.e. ~44% of rounds (`P(crash > 2.2x) = 0.96/2.2`).
  Replaced `shift()` with `resampleCurve()`: on overflow (`MAX_CURVE_POINTS = 800`) the
  buffer is resampled to `CURVE_POINTS_TARGET = 400` points uniform in time over `[0, tip]`.
  Uniform matters — simple halving degrades the *oldest* samples geometrically (gaps of
  4267ms at t=0) and chords the whole 0->1.00x launch ramp into one straight line.

## How to Verify
- `npx vitest run` — 459 passed / 33 files. (No test covers this file; it is client canvas
  code. The `stocks-route.test.js` express failures noted in the previous entry are gone.)
- Geometry simulated numerically against the real functions over a 90s round, 900x420 canvas:

  | | before | after |
  |---|---|---|
  | curve x-span @20s | **0 px** (vertical) | 672 px |
  | curve x-span @60s | 0 px | 672 px |
  | missing head @60s | 523 px | 0 px |
  | worst segment | 274 px | 13.9 px |
  | oldest retained `t` | 6667ms+ | 0 |

- Both curve branches are linear in screen space under this Y mapping (launch: `y` linear
  in `m` linear in `t`; flight: `y ∝ log(m)` and `log(m)` linear in `t`), so chords *within*
  a branch are exact. Only the 1.00x knee can be chorded — straddle is 0ms up to 60s and
  ≤400ms (~3px) on 75s+ rounds (m>300, ~0.3% of rounds).

## Open Risks / Notes
- **Still not verified in a browser** — same reason as the previous entry (SITE_PASSWORD
  gate). The math and pixel geometry are covered above, but the actual canvas render of the
  launch band, break-even line and rescue button remains visually unchecked. Carried forward.
- `resampleCurve()` picks nearest-earlier existing samples rather than interpolating. With
  400 points over a piecewise-linear curve this is visually exact; if the curve ever gains
  real curvature in screen space, switch to interpolation.
- The tip is always the true live sample (appended every frame, and `resampleCurve()`
  explicitly preserves it), so the rocket marker never lags.
- Untouched: `LAUNCH_MS` / `GROWTH_RATE` client-server duplication, and the deliberate
  below-break-even rescue trap. Do not restyle the rescue path green.

---

# Handoff: Crash — 0.00x launch phase with a below-break-even rescue window (2026-07-27)

## Why
The round used to open at 1.00x, so the lowest-risk play (`MIN_CASHOUT = 1.01`, reachable in 0.12 s) won 95 % of rounds. Worse, `Math.floor(bet * 1.01)` paid **+0 SC** on every bet level up to 50 — the player "won" almost every round and received nothing, at a real 95.05 % RTP. The 4 % of doomed rounds were an invisible 100 ms blink at exactly 1.00.

## What Changed

### `server/handlers/crash.js`
- **Curve is now two-phase.** `multiplierAt()`: linear `t / LAUNCH_MS` for the 0.00x -> 1.00x launch (`LAUNCH_MS = 3000`), then the existing `exp(GROWTH_RATE * (t - LAUNCH_MS))`. `timeForMultiplier()` inverts both branches. Continuous at 1.00x.
- **Doomed rounds are now visible.** `sampleCrashMultiplier()` returns `u / HOUSE_EDGE` instead of `1.00` for `u < HOUSE_EDGE` — the same 4 % probability mass, but spread uniformly over `[0, 1)` so the rocket dies at e.g. 0.43x instead of blinking out.
- **RTP above 1.00x is untouched**: `P(C >= x) = 0.96 / x` for `x >= 1` still holds exactly, so every cash-out target keeps its 96 % expected return.
- `MIN_CASHOUT` 1.01 -> 0.01 (manual bail-out allowed inside the launch phase, at a partial loss). New `MIN_AUTO_CASHOUT = 1.01` — auto targets stay profit targets, you cannot schedule a loss.
- **Fixed a latent bypass**: the auto-cashout sweep never checked any minimum, so an auto target below the floor would have skipped it entirely. It now enforces `MIN_AUTO_CASHOUT`.
- `Math.floor(b.bet * m)` -> `Math.round(...)`. Flooring was costing small bets their whole margin.

### `games/crash/js/game.js`
- Mirrors `LAUNCH_MS` / `GROWTH_RATE` and the piecewise `multiplierAt()` (kept in sync deliberately — see verification).
- Y axis is piecewise: bottom 28 % of the plot is the 0 -> 1.00x launch band, above that the existing log scale. Dashed `1.00x BREAK EVEN` line plus a red danger tint below it.
- Curve is amber below 1.00x, green above, red on crash. Removed the old `Math.max(1, m)` clamps that would have flattened the launch phase onto the baseline.
- Cash-out button is a live P/L readout: `RETTEN -60 SC` (red) below 1.00x, `CASH OUT +N SC` above. New `signed()` helper — every delta in the UI (bet info, player list, status line) now carries an explicit sign instead of hardcoded `+`.
- Recent-crash pills got a `dead` tier (struck through) for rounds that never reached 1.00x.

### `games/crash/crash.css`, `games/crash/index.html`
- `.primary-btn.cashout.rescue`, `.recent-pill.dead`, `.multiplier-display.below-even`. Footer now states the launch phase and that bailing below 1.00x returns less than the stake.

## How to Verify
- `npx vitest run` — 459 passed / 33 files. Six tests in `crash.test.js` encoded the old curve and were rewritten; new coverage: launch-phase linearity, inversion inside the launch phase, uniformity of the doomed rounds across `[0, 1)`, and an explicit test that bailing below break-even is EV-worse than holding (`EV ~ t * (1 - edge * t)`).
- **Client/server curve parity checked numerically**: max `|client - server|` over 0-60 s is exactly `0`.
- **Real round loop driven for 90 s against a fake `io`** (5 complete rounds): ticks start at 0.036, stay monotone and finite, and one round crashed at 0.05x — the launch-phase death working end to end.

## Open Risks / Notes
- **The rescue window is a deliberate trap.** Bailing below 1.00x is always EV-worse than holding, because the remaining risk of dying before break-even is at most 4 %. This was flagged to the maintainer and chosen anyway; the UI is therefore required to label it as a loss, never as a win. Do not "helpfully" restyle it green.
- **Mechanically nothing changed for the house.** Still 4 % doomed rounds, still 96 % RTP. The launch phase buys drama, not margin. If the goal is for the house to win more *rounds*, that is the `MIN_CASHOUT` lever (1.30 -> 26 % house-won rounds, 1.50 -> 36 %), deliberately not applied here.
- The lowest slice of doomed rounds is still near-instant: a 0.05x crash dies 150 ms in. Inherent to the uniform spread; raising `LAUNCH_MS` stretches it but lengthens every round.
- `LAUNCH_MS` / `GROWTH_RATE` are duplicated in the client. The parity script in the verification above is the guard; if you change one, change both.
- Rounds are ~3 s longer. Time to 2.00x went from 8.7 s to 11.7 s.
- **Not verified in a browser.** The site sits behind the `SITE_PASSWORD` login gate and the preview pane was not compositing frames this session, so the canvas rendering (launch band, break-even line, rescue button) is unverified visually — logic and math are covered by the checks above. Worth one manual look.

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
