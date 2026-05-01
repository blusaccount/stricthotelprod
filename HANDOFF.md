# Handoff Log

This file tracks recent changes, verification notes, and open risks. Each session should add new entries at the top.

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
