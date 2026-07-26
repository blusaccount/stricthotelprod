# CLAUDE.md

Full agent instructions: [LLM_AGENT_GUIDE.md](LLM_AGENT_GUIDE.md) — read it before working.

## Maintainer preferences (always apply)

- **No guessing / no assuming.** Never state that a feature exists, is missing, or behaves a certain way without having read the relevant code in this session. The README/docs undersell what exists — verify in `public/`, `shared/js/`, `server/handlers/` before claiming anything. If not yet verified, say so explicitly instead of extrapolating.
- Shared StrictCoins wallet across all games (stocks cash = casino cash = `players.balance`) is a **core concept** — do not propose separating it.
