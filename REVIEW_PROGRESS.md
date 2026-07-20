# Review Progress

Checkliste aller Repository-Dateien (aus `git ls-files`), gruppiert nach Modulen. Ausgeschlossen: `node_modules`, `package-lock.json`, Bilder/Audio/Assets (`public/assets/**`, `shared/audio/**`, `games/strictbrain/assets/**`, `userinput/**`).

## 1. server/ Kernmodule

- [ ] server.js
- [x] server/achievements.js
- [x] server/activity-feed.js
- [x] server/brain-leaderboards.js
- [x] server/character-store.js
- [x] server/cleanup.js
- [x] server/currency.js
- [x] server/daily-streak.js
- [x] server/db.js
- [x] server/food-leaderboards-store.js
- [x] server/food-ratings-store.js
- [x] server/game-logic.js
- [x] server/identity.js
- [x] server/index.js
- [x] server/keep-alive.js
- [x] server/log-buffer.js
- [x] server/lol-betting.js
- [x] server/lol-match-checker.js
- [x] server/pictochat-store.js
- [x] server/portfolio-history.js
- [x] server/riot-api.js
- [x] server/room-manager.js
- [x] server/socket-handlers.js
- [x] server/socket-utils.js
- [x] server/stock-game.js
- [x] server/stock-price-cache.js
- [x] server/tierlist-store.js
- [x] server/turkish-lessons.js
- [x] server/turkish-streaks.js
- [ ] server/sql/persistence.sql
- [ ] server/stock-providers/stooq.js
- [ ] server/stock-providers/yahoo-chart.js
- [ ] server/__tests__/blackjack.test.js
- [ ] server/__tests__/character-store.test.js
- [ ] server/__tests__/crash.test.js
- [ ] server/__tests__/currency.test.js
- [ ] server/__tests__/daily-streak.test.js
- [ ] server/__tests__/game-logic.test.js
- [ ] server/__tests__/lobby-watchparty.test.js
- [ ] server/__tests__/lol-betting.test.js
- [ ] server/__tests__/lol-match-checker.test.js
- [ ] server/__tests__/loop-machine.test.js
- [ ] server/__tests__/pictochat-store.test.js
- [ ] server/__tests__/plinko.test.js
- [ ] server/__tests__/portfolio-history.test.js
- [ ] server/__tests__/riot-api.test.js
- [ ] server/__tests__/room-manager.test.js
- [ ] server/__tests__/roulette.test.js
- [ ] server/__tests__/socket-utils.test.js
- [ ] server/__tests__/stock-game.test.js
- [ ] server/__tests__/stocks-route.test.js
- [ ] server/__tests__/strictly7s.test.js
- [ ] server/__tests__/turkish-lessons.test.js
- [ ] server/__tests__/watchparty.test.js

## 2. server/handlers/

- [x] server/handlers/achievements.js
- [x] server/handlers/activity-feed.js
- [x] server/handlers/blackjack.js
- [x] server/handlers/brain-versus.js
- [x] server/handlers/crash.js
- [x] server/handlers/currency.js
- [x] server/handlers/daily-streak.js
- [x] server/handlers/food-guessr.js
- [x] server/handlers/lobby-watchparty.js
- [x] server/handlers/lobby.js
- [x] server/handlers/lol-betting.js
- [x] server/handlers/loop-machine.js
- [x] server/handlers/maexchen.js
- [x] server/handlers/pictochat.js
- [x] server/handlers/plinko.js
- [x] server/handlers/roulette.js
- [x] server/handlers/soundboard.js
- [x] server/handlers/stocks.js
- [x] server/handlers/strictly7s.js
- [x] server/handlers/tierlist.js
- [x] server/handlers/watchparty.js

## 3. server/routes/

- [x] server/routes/auth.js
- [x] server/routes/nostalgiabait.js
- [x] server/routes/stocks.js
- [x] server/routes/turkish.js

## 4. shared/

- [x] shared/css/arcade-override.css
- [x] shared/css/theme.css
- [x] shared/js/achievement-toast.js
- [x] shared/js/ambient.js
- [x] shared/js/avatars.js
- [x] shared/js/chat.js
- [x] shared/js/core.js
- [x] shared/js/creator.js
- [x] shared/js/emotes.js
- [x] shared/js/iframe-helper.js
- [x] shared/js/lobby.js
- [x] shared/js/reactions.js
- [x] shared/js/socket-init.js
- [x] shared/js/starfield-parallax.js
- [x] shared/js/stock-ticker.js
- [x] shared/js/tts.js

## 5. games/

- [ ] games/blackjack/blackjack.css
- [ ] games/blackjack/index.html
- [ ] games/blackjack/js/game.js
- [ ] games/casino/casino.css
- [ ] games/casino/index.html
- [ ] games/casino/js/casino.js
- [ ] games/crash/crash.css
- [ ] games/crash/index.html
- [ ] games/crash/js/game.js
- [ ] games/food-guessr/index.html
- [ ] games/food-guessr/js/countries.js
- [ ] games/food-guessr/js/dishes.js
- [ ] games/food-guessr/js/game.js
- [ ] games/lol-betting/index.html
- [ ] games/lol-betting/js/game.js
- [ ] games/lol-betting/lol-betting.css
- [ ] games/loop-machine/index.html
- [ ] games/loop-machine/js/game.js
- [ ] games/maexchen/index.html
- [ ] games/maexchen/js/dice.js
- [ ] games/maexchen/js/game.js
- [ ] games/plinko/index.html
- [ ] games/plinko/js/game.js
- [ ] games/plinko/plinko.css
- [ ] games/roulette/index.html
- [ ] games/roulette/js/game.js
- [ ] games/roulette/roulette.css
- [ ] games/shopping/index.html
- [ ] games/shopping/shopping.css
- [ ] games/stocks/index.html
- [ ] games/stocks/js/game.js
- [ ] games/stocks/stocks.css
- [ ] games/strictbrain/brain.css
- [ ] games/strictbrain/index.html
- [ ] games/strictbrain/js/game.js
- [ ] games/strictly7s/index.html
- [ ] games/strictly7s/js/game.js
- [ ] games/strictly7s/strictly7s.css
- [ ] games/tierlist/index.html
- [ ] games/tierlist/js/game.js
- [ ] games/tierlist/js/items.js
- [ ] games/turkish/index.html
- [ ] games/turkish/js/game.js
- [ ] games/watchparty/index.html
- [ ] games/watchparty/js/watchparty.js

## 6. public/

- [ ] public/achievements.html
- [ ] public/ambience.js
- [ ] public/contacts.html
- [ ] public/contacts.js
- [ ] public/index.html
- [ ] public/lobby-watchparty.js
- [ ] public/lobby.css
- [ ] public/lobby.js
- [ ] public/login.html
- [ ] public/nostalgiabait/gamecube/gamecube.css
- [ ] public/nostalgiabait/gamecube/gamecube.html
- [ ] public/nostalgiabait/gamecube/gamecube.js
- [ ] public/nostalgiabait/gamecube/index.html
- [ ] public/nostalgiabait/index.html
- [ ] public/nostalgiabait/ps1/index.html
- [ ] public/nostalgiabait/ps2/index.html
- [ ] public/nostalgiabait/ps2/ps2.css
- [ ] public/nostalgiabait/ps2/ps2.html
- [ ] public/nostalgiabait/ps2/ps2.js
- [ ] public/nostalgiabait/shared/player.css
- [ ] public/nostalgiabait/shared/player.js
- [ ] public/nostalgiabait/wiissbb/index.html
- [ ] public/pictochat.js
- [ ] public/shell.css
- [ ] public/shell.js
- [ ] public/shop.html
- [ ] public/shop.js
- [ ] public/soundboard.js

## 7. scripts/, Dockerfile, docker-compose.yml, Configs

- [ ] Dockerfile
- [ ] docker-compose.yml
- [ ] .dockerignore
- [ ] .env.example
- [ ] .gitignore
- [ ] package.json
- [ ] scripts/import-tierlist-items.mjs
- [ ] scripts/tierlist-titles.txt
- [ ] .github/copilot-instructions.md
- [ ] .github/workflows/keep-alive.yml
- [ ] .vscode/settings.json
- [ ] AGENTS.md
- [ ] HANDOFF.md
- [ ] LLM_AGENT_GUIDE.md
- [ ] PLANS.md
- [ ] README.md
- [ ] docs/EVENTS.md
