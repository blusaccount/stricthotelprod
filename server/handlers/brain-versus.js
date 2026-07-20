import {
    updateBrainAgeLeaderboard,
    updateGameLeaderboard,
    getBrainLeaderboard,
    getGameLeaderboards,
    VALID_BRAIN_GAME_IDS
} from '../brain-leaderboards.js';
import { addBalance } from '../currency.js';
import { bump } from '../achievements.js';
import { pushActivity } from '../activity-feed.js';
import {
    generateRoomCode,
    rooms,
    broadcastLobbies,
    getRoom,
    removePlayerFromRoom,
    socketToRoom
} from '../room-manager.js';
import { emitBalanceUpdate, emitToUser, sanitizeName, validateRoomCode } from '../socket-utils.js';
import { isDatabaseEnabled, query } from '../db.js';

const brainDailyCooldown = new Map(); // name -> dayNumber
let brainLeaderboardBroadcastTimer = null;
let brainGameLeaderboardsTimer = null;
const BRAIN_LEADERBOARD_THROTTLE_MS = 1000;

// Per-player anti-spam for brain-training-score. Without these limits a
// scripted client could pump ~250 SC/sec via this single event handler.
const trainingCooldownByName = new Map();   // name -> ts of last submission
const trainingDailyByName = new Map();      // name -> { day, totalCoins }
const TRAINING_COOLDOWN_MS = 20_000;        // ≈ length of one training round
const TRAINING_DAILY_CAP_COINS = 200;

function getUtcDayString() {
    return new Date().toISOString().slice(0, 10);
}

let _io = null;

function calculateBrainCoins(brainAge) {
    if (brainAge <= 25) return 50;
    if (brainAge <= 35) return 30;
    if (brainAge <= 45) return 20;
    if (brainAge <= 55) return 10;
    return 5;
}

function calculateTrainingCoins(score) {
    // Training: half of daily test coins, minimum 2
    const brainAge = Math.round(80 - (score / 100) * 60);
    const clamped = Math.max(20, Math.min(80, brainAge));
    return Math.max(2, Math.floor(calculateBrainCoins(clamped) / 2));
}

function getUtcDayNumber(date = new Date()) {
    return Math.floor(date.getTime() / (1000 * 60 * 60 * 24));
}

// Forfeit payout: awards the opponent once. Both the explicit 'leave' path
// and the disconnect path funnel through here; each performs the
// room.game.status check-and-clear synchronously (no await in between)
// before calling this, so a simultaneous leave+disconnect can only win the
// status transition once — the loser of the race sees room.game === null.
async function payoutBrainVersusForfeit(io, socket, game, room) {
    const opponent = game.players.find(p => p.socketId !== socket.id);
    if (!opponent) return;
    const newBalance = await addBalance(opponent.name, 20, 'brain_versus_forfeit', { roomCode: room.code });
    emitToUser(io, opponent.name, 'balance-update', { balance: newBalance });
    io.to(opponent.socketId).emit('brain-versus-result', {
        winner: opponent.name,
        isDraw: false,
        players: game.players.map(p => ({ name: p.name, score: p.finalScore ?? p.score })),
        coins: 20,
        forfeit: true
    });
}

// ============== STRICT BRAIN VERSUS: SERVER-AUTHORITATIVE SCORING ==============
// The client never gets to declare a result. While a round is running it
// reports raw progress (one correct answer, one completed level, one
// reaction round) via brain-versus-score-update; the server only accepts
// plausible, rate-limited, monotonically increasing deltas per player and
// gameId. brain-versus-finished is purely a "my round is over" signal — the
// winner and payout are always derived from the score the server itself
// accumulated, never from that event's payload.
const VERSUS_MAX_SCORE_BY_GAME = { math: 80, stroop: 150, chimp: 9, reaction: 10000, scramble: 40 };
const VERSUS_SCORE_UPDATE_MIN_INTERVAL_MS = 150;
// Reaction reports the running sum of *valid* click times only; a player who
// never lands a valid click (all timeouts) never sends an update. The
// client's own scoring treats that as the worst possible outcome
// (maxRounds × 2000ms), so the server mirrors that fallback.
const VERSUS_REACTION_NO_CLICK_SCORE = 10000;

function isPlausibleVersusScoreUpdate(gameId, prevScore, newScore) {
    if (!Number.isFinite(newScore) || newScore < prevScore) return false;
    const max = VERSUS_MAX_SCORE_BY_GAME[gameId];
    if (max !== undefined && newScore > max) return false;
    if (gameId === 'chimp') {
        // First report is the starting level (3); afterwards one completed level at a time.
        if (prevScore === 0) return newScore <= 3;
        return newScore - prevScore <= 1;
    }
    if (gameId === 'reaction') return newScore - prevScore <= 2000; // one round's worth
    return newScore - prevScore <= 1; // math / stroop / scramble: one correct answer per report
}

function computeVersusFinalScore(gameId, player) {
    if (gameId === 'reaction' && !player.scoreReported) return VERSUS_REACTION_NO_CLICK_SCORE;
    return player.score;
}

async function hasBrainDailyReward(name) {
    const day = getUtcDayNumber();
    if (!isDatabaseEnabled()) {
        return { alreadyCompleted: brainDailyCooldown.get(name) === day, day };
    }

    const result = await query(
        `select 1
         from wallet_ledger wl
         join players p on p.id = wl.player_id
         where p.name = $1
           and wl.reason = 'brain_daily'
           and (wl.created_at at time zone 'utc')::date = (now() at time zone 'utc')::date
         limit 1`,
        [name]
    );
    return { alreadyCompleted: result.rowCount > 0, day };
}

function markBrainDailyReward(name, day) {
    brainDailyCooldown.set(name, day);
}

function scheduleBrainLeaderboardBroadcast() {
    if (brainLeaderboardBroadcastTimer) return;
    brainLeaderboardBroadcastTimer = setTimeout(() => {
        brainLeaderboardBroadcastTimer = null;
        getBrainLeaderboard().then((board) => {
            _io?.emit('brain-leaderboard', board);
        }).catch(err => console.error('brain-leaderboard error:', err.message));
    }, BRAIN_LEADERBOARD_THROTTLE_MS);
}

function scheduleBrainGameLeaderboardsBroadcast() {
    if (brainGameLeaderboardsTimer) return;
    brainGameLeaderboardsTimer = setTimeout(() => {
        brainGameLeaderboardsTimer = null;
        getGameLeaderboards().then((boards) => {
            _io?.emit('brain-game-leaderboards', boards);
        }).catch(err => console.error('brain-game-leaderboards error:', err.message));
    }, BRAIN_LEADERBOARD_THROTTLE_MS);
}

export function registerBrainVersusHandlers(socket, io, deps) {
    _io = io;
    const { checkRateLimit, onlinePlayers } = deps;

    // Resolve the socket's registered name. Returns null and signals the
    // client when the socket hasn't gone through register-player yet.
    function resolveSelfName(errorEvent) {
        const player = onlinePlayers && onlinePlayers.get(socket.id);
        if (!player || !player.name) {
            if (errorEvent) socket.emit(errorEvent, { message: 'Not logged in' });
            return null;
        }
        return player.name;
    }

    socket.on('brain-get-leaderboard', async () => { try {
        if (!checkRateLimit(socket)) return;
        const leaderboard = await getBrainLeaderboard();
        const gameBoards = await getGameLeaderboards();
        socket.emit('brain-leaderboard', leaderboard);
        socket.emit('brain-game-leaderboards', gameBoards);
    } catch (err) { console.error('brain-get-leaderboard error:', err.message); } });

    socket.on('brain-submit-score', async (data) => { try {
        if (!checkRateLimit(socket)) return;
        if (!data || typeof data !== 'object') return;
        // Identity comes from the registered socket — clients can't submit
        // scores on behalf of another name.
        const name = resolveSelfName();
        if (!name) return;

        const brainAge = Number(data.brainAge);
        if (!Number.isFinite(brainAge) || brainAge < 20 || brainAge > 80) return;

        // Server calculates coins (don't trust client)
        const coins = calculateBrainCoins(brainAge);

        // Update leaderboard (keep best score = lowest brain age)
        await updateBrainAgeLeaderboard(name, brainAge);

        // Award coins (once per UTC day)
        const dailyStatus = await hasBrainDailyReward(name);
        if (!dailyStatus.alreadyCompleted) {
                const newBalance = await addBalance(name, coins, 'brain_daily', { day: dailyStatus.day });
                if (newBalance !== null) {
                    emitToUser(io, name, 'balance-update', { balance: newBalance });
                }
            markBrainDailyReward(name, dailyStatus.day);
            // Achievement: count one completed brain test.
            bump(name, 'brain_tests', 1).catch(() => {});
        } else {
            socket.emit('brain-daily-cooldown', { day: dailyStatus.day });
        }

        // Broadcast updated leaderboard (throttled)
        scheduleBrainLeaderboardBroadcast();

        // Update per-game leaderboards from daily test games
        if (Array.isArray(data.games)) {
            for (const g of data.games) {
                if (g && VALID_BRAIN_GAME_IDS.includes(g.gameId)) {
                    const s = Number(g.score);
                    const maxScore = g.gameId === 'reaction' ? 10000 : 100;
                    if (Number.isFinite(s) && s >= 0 && s <= maxScore) {
                        const res = await updateGameLeaderboard(g.gameId, name, s);
                        // Only celebrate when there's a previous score to beat — first
                        // submissions aren't a "personal best" worth feed real estate.
                        if (res?.isPersonalBest && res.previousBest !== null) {
                            const isReactionMs = g.gameId === 'reaction';
                            const formatted = isReactionMs ? `${Math.round(s)}ms` : `${Math.round(s)}`;
                            pushActivity({
                                type: 'brain_personal_best', player: name,
                                text: `New personal best on Strict Brain (${g.gameId}): ${formatted}`,
                                icon: '🧠', color: 'cyan',
                                meta: { game: 'strictbrain', gameId: g.gameId, score: s, previousBest: res.previousBest }
                            });
                        }
                    }
                }
            }
            scheduleBrainGameLeaderboardsBroadcast();
        }
    } catch (err) { console.error('brain-submit-score error:', err.message); } });

    socket.on('brain-training-score', async (data) => { try {
        if (!checkRateLimit(socket)) return;
        if (!data || typeof data !== 'object') return;
        // Identity from the socket — body-supplied playerName is ignored so
        // a scripted client can't pump coins onto someone else's wallet.
        const name = resolveSelfName();
        if (!name) return;

        // Per-name cooldown: a real training round takes ~20-30s. This caps
        // the printer at one payout per cooldown window.
        const nowTs = Date.now();
        const lastTs = trainingCooldownByName.get(name) || 0;
        if (nowTs - lastTs < TRAINING_COOLDOWN_MS) return;

        // Daily cap: even legit usage tops out at TRAINING_DAILY_CAP_COINS
        // SC/day across all training submissions.
        const today = getUtcDayString();
        let dailyState = trainingDailyByName.get(name);
        if (!dailyState || dailyState.day !== today) {
            dailyState = { day: today, totalCoins: 0 };
            trainingDailyByName.set(name, dailyState);
        }
        if (dailyState.totalCoins >= TRAINING_DAILY_CAP_COINS) return;

        // Update per-game leaderboard
        if (data.gameId && VALID_BRAIN_GAME_IDS.includes(data.gameId)) {
            const s = Number(data.score);
            const maxScore = data.gameId === 'reaction' ? 10000 : 100;
            if (Number.isFinite(s) && s >= 0 && s <= maxScore) {
                await updateGameLeaderboard(data.gameId, name, s);
                scheduleBrainGameLeaderboardsBroadcast();

                // Server calculates coins (don't trust client)
                // For reaction, convert sum of ms to normalized 0-100 score for coin calc
                // 5 rounds: 750ms sum (150ms avg) = 100, 2500ms sum (500ms avg) = 0
                const coinScore = data.gameId === 'reaction'
                    ? Math.round(Math.max(0, Math.min(100, ((2500 - s) / 1750) * 100)))
                    : s;
                let coins = calculateTrainingCoins(coinScore);
                // Clip to the remaining daily allowance so the cap is exact.
                const remaining = Math.max(0, TRAINING_DAILY_CAP_COINS - dailyState.totalCoins);
                coins = Math.min(coins, remaining);
                if (coins <= 0) return;

                trainingCooldownByName.set(name, nowTs);
                dailyState.totalCoins += coins;

                const newBalance = await addBalance(name, coins, 'brain_training');
                if (newBalance !== null) {
                    emitToUser(io, name, 'balance-update', { balance: newBalance });
                }
            }
        }
    } catch (err) { console.error('brain-training-score error:', err.message); } });

    // ============== STRICT BRAIN VERSUS MODE ==============

    socket.on('brain-versus-create', (data) => { try {
        if (!checkRateLimit(socket)) return;
        // Pull the player name from the registered socket; only fall back to
        // body input when the socket hasn't registered yet (legacy clients).
        let playerName = (onlinePlayers && onlinePlayers.get(socket.id)?.name) || null;
        if (!playerName) {
            playerName = sanitizeName(typeof data === 'object' ? data.playerName : data);
        }
        if (!playerName) { socket.emit('error', { message: 'Name ungültig!' }); return; }
        const existingRoom = getRoom(socket.id);
        if (existingRoom) { socket.emit('error', { message: 'Du bist bereits in einem Raum!' }); return; }

        const code = generateRoomCode();
        const room = {
            code,
            hostId: socket.id,
            gameType: 'strictbrain',
            players: [{ socketId: socket.id, name: playerName, character: null }],
            game: null
        };
        rooms.set(code, room);
        socketToRoom.set(socket.id, code);
        socket.join(code);

        socket.emit('brain-versus-created', { code });
        broadcastLobbies(io, 'strictbrain');
        console.log(`Brain versus room ${code} created by ${playerName}`);
    } catch (err) { console.error('brain-versus-create error:', err.message); } });

    socket.on('brain-versus-join', (data) => { try {
        if (!checkRateLimit(socket)) return;
        if (!data || typeof data !== 'object') return;
        const code = validateRoomCode((data.code || '').toUpperCase());
        // Identity from the registered socket — see brain-versus-create above.
        let playerName = (onlinePlayers && onlinePlayers.get(socket.id)?.name) || null;
        if (!playerName) {
            playerName = sanitizeName(data.playerName);
        }
        if (!playerName) { socket.emit('error', { message: 'Name ungültig!' }); return; }
        if (code.length !== 4) { socket.emit('error', { message: 'Ungültiger Raum-Code!' }); return; }

        const room = rooms.get(code);
        if (!room) { socket.emit('error', { message: 'Raum nicht gefunden!' }); return; }
        if (room.gameType !== 'strictbrain') { socket.emit('error', { message: 'Kein Brain-Versus Raum!' }); return; }
        if (room.game) { socket.emit('error', { message: 'Spiel läuft bereits!' }); return; }
        if (room.players.length >= 2) { socket.emit('error', { message: 'Raum ist voll (max. 2 Spieler)!' }); return; }
        if (room.players.some(p => p.socketId === socket.id)) { socket.emit('error', { message: 'Du bist bereits in diesem Raum!' }); return; }

        room.players.push({ socketId: socket.id, name: playerName, character: null });
        socketToRoom.set(socket.id, code);
        socket.join(code);

        const playerNames = room.players.map(p => p.name);
        io.to(room.code).emit('brain-versus-lobby', { code, players: playerNames, hostId: room.hostId });
        broadcastLobbies(io, 'strictbrain');
        console.log(`${playerName} joined brain versus room ${code}`);
    } catch (err) { console.error('brain-versus-join error:', err.message); } });

    socket.on('brain-versus-start', (data) => { try {
        if (!checkRateLimit(socket)) return;
        const room = getRoom(socket.id);
        if (!room || room.gameType !== 'strictbrain') return;
        if (room.hostId !== socket.id) { socket.emit('error', { message: 'Nur der Host kann starten!' }); return; }
        if (room.players.length < 2) { socket.emit('error', { message: 'Warte auf einen Gegner!' }); return; }

        const gameId = (data && VALID_BRAIN_GAME_IDS.includes(data.gameId)) ? data.gameId : VALID_BRAIN_GAME_IDS[Math.floor(Math.random() * VALID_BRAIN_GAME_IDS.length)];

        room.game = {
            gameId: gameId,
            status: 'running',
            players: room.players.map(p => ({
                socketId: p.socketId, name: p.name, score: 0, finished: false, finalScore: null,
                scoreReported: false, lastScoreUpdateAt: 0
            })),
            startedAt: Date.now()
        };

        io.to(room.code).emit('brain-versus-game-start', { gameId, players: room.game.players.map(p => ({ name: p.name })) });
        broadcastLobbies(io, 'strictbrain');
        console.log(`Brain versus started in ${room.code}: ${gameId}`);
    } catch (err) { console.error('brain-versus-start error:', err.message); } });

    socket.on('brain-versus-score-update', (data) => { try {
        if (!checkRateLimit(socket)) return;
        const room = getRoom(socket.id);
        if (!room || !room.game || room.game.status !== 'running' || room.gameType !== 'strictbrain') return;
        const player = room.game.players.find(p => p.socketId === socket.id);
        if (!player || player.finished) return;

        const now = Date.now();
        if (now - player.lastScoreUpdateAt < VERSUS_SCORE_UPDATE_MIN_INTERVAL_MS) return;

        const reported = Number(data && data.score);
        if (!Number.isFinite(reported) || reported < 0) return;
        const rounded = Math.round(reported);
        if (!isPlausibleVersusScoreUpdate(room.game.gameId, player.score, rounded)) return;

        player.lastScoreUpdateAt = now;
        player.score = rounded;
        player.scoreReported = true;

        io.to(room.code).emit('brain-versus-scores', {
            players: room.game.players.map(p => ({ name: p.name, score: p.score, finished: p.finished }))
        });
    } catch (err) { console.error('brain-versus-score-update error:', err.message); } });

    // The client sends no payload here — it only signals "my round is over".
    // The result is computed entirely from server-tracked, validated scores.
    socket.on('brain-versus-finished', async () => { try {
        if (!checkRateLimit(socket)) return;
        const room = getRoom(socket.id);
        if (!room || !room.game || room.game.status !== 'running' || room.gameType !== 'strictbrain') return;
        const player = room.game.players.find(p => p.socketId === socket.id);
        if (!player || player.finished) return;

        player.finished = true;
        player.finalScore = computeVersusFinalScore(room.game.gameId, player);
        player.score = player.finalScore;

        const allFinished = room.game.players.every(p => p.finished);
        if (!allFinished) {
            io.to(room.code).emit('brain-versus-scores', {
                players: room.game.players.map(p => ({ name: p.name, score: p.score, finished: p.finished }))
            });
            return;
        }

        // Both players are done. Transition out of 'running' synchronously
        // (nothing above this line awaits) so this payout can only ever run once.
        room.game.status = 'finished';
        const game = room.game;
        room.game = null;

        // Reaction: lower ms = better; others: higher = better
        const isReaction = game.gameId === 'reaction';
        let sorted, winner, isDraw;
        if (isReaction) {
            sorted = [...game.players].sort((a, b) => a.finalScore - b.finalScore);
            winner = sorted[0].finalScore < sorted[1].finalScore ? sorted[0].name : null;
            isDraw = sorted[0].finalScore === sorted[1].finalScore;
        } else {
            sorted = [...game.players].sort((a, b) => b.finalScore - a.finalScore);
            winner = sorted[0].finalScore > sorted[1].finalScore ? sorted[0].name : null;
            isDraw = sorted[0].finalScore === sorted[1].finalScore;
        }

        // Award coins
        const winnerCoins = 20;
        const loserCoins = 5;
        const drawCoins = 10;

        for (const p of game.players) {
            let coins;
            if (isDraw) { coins = drawCoins; }
            else if (p.name === winner) { coins = winnerCoins; }
            else { coins = loserCoins; }

            const newBalance = await addBalance(p.name, coins, 'brain_versus_reward', { roomCode: room.code });
            emitToUser(io, p.name, 'balance-update', { balance: newBalance });
        }

        // Achievement: brain_versus_wins for the winner.
        if (!isDraw && winner) {
            bump(winner, 'brain_versus_wins', 1).catch(() => {});
        }

        io.to(room.code).emit('brain-versus-result', {
            winner: winner,
            isDraw: isDraw,
            players: game.players.map(p => ({ name: p.name, score: p.finalScore })),
            coins: isDraw ? drawCoins : winnerCoins
        });

        console.log(`Brain versus ended in ${room.code}: ${isDraw ? 'draw' : winner + ' wins'}`);
    } catch (err) { console.error('brain-versus-finished error:', err.message); } });

    socket.on('brain-versus-leave', async () => { try {
        if (!checkRateLimit(socket)) return;
        const room = getRoom(socket.id);
        if (!room || room.gameType !== 'strictbrain') return;

        socket.leave(room.code);

        // If a game was running, it's forfeited and the opponent wins by
        // default. The status check-and-clear happens synchronously (no
        // await above it) so a concurrent disconnect can't also pay this out.
        if (room.game && room.game.status === 'running') {
            const game = room.game;
            game.status = 'forfeited';
            room.game = null;
            await payoutBrainVersusForfeit(io, socket, game, room);
        }

        // Remove player from room
        const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
        if (playerIndex !== -1) {
            const playerName = room.players[playerIndex].name;
            room.players.splice(playerIndex, 1);
            socketToRoom.delete(socket.id);
            io.to(room.code).emit('brain-versus-player-left', { playerName });
        }

        if (room.players.length === 0) {
            rooms.delete(room.code);
        } else if (room.hostId === socket.id) {
            room.hostId = room.players[0].socketId;
        }

        broadcastLobbies(io, 'strictbrain');
    } catch (err) { console.error('brain-versus-leave error:', err.message); } });
}

export async function cleanupBrainVersusOnDisconnect(socket, room, io) {
    // Brain Versus: handle forfeit before generic cleanup. Same
    // status-check-and-clear-before-await pattern as brain-versus-leave, so
    // whichever of leave/disconnect runs first is the only one that pays out.
    if (room.gameType === 'strictbrain' && room.game && room.game.status === 'running') {
        const game = room.game;
        game.status = 'forfeited';
        room.game = null;
        await payoutBrainVersusForfeit(io, socket, game, room);
    }
}
