import { randomInt } from 'crypto';
import { addBalance, deductBalance } from '../currency.js';
import { bump } from '../achievements.js';
import { notifyUnlocks } from './achievements.js';

// ============================================================================
// Crash — single global round, exponential multiplier curve, server-authoritative.
//
// Crash distribution: P(C ≥ x) = (1 − HOUSE_EDGE) / x for x ≥ 1.
// Sampled by inverse CDF; on a per-player basis the expected return is exactly
// (1 − HOUSE_EDGE) regardless of cash-out target, so RTP is a constant 96 %.
//
// Multiplier curve: m(t) = exp(GROWTH_RATE · t), with t in seconds since round start.
// Round phases: BETTING (6 s) → RUNNING (until crash) → REVEAL (4 s) → loop.
// ============================================================================

const HOUSE_EDGE = 0.04;
const GROWTH_RATE = 0.08;          // per second
const BETTING_MS = 6_000;
const REVEAL_MS = 4_000;
const TICK_MS = 100;                // multiplier broadcast cadence
const MIN_BET = 2;
const MAX_BET = 50;
const CRASH_BETS = [5, 10, 25, 50, 100, 500];
const MAX_ROUND_MS = 120_000;       // safety cap (~134000× hard ceiling)
const MAX_AUTO_CASHOUT = 1_000_000; // sane cap for autoCashout input

// ---------- math helpers ---------- //

// Returns a uniform-random float in [0, 1) using crypto.randomInt.
function cryptoRandom() {
    // 53 bits of randomness, divided by 2^53.
    const high = randomInt(0, 0x200000);          // 21 bits
    const low  = randomInt(0, 0x100000000);       // 32 bits
    return (high * 0x100000000 + low) / 0x20000000000000;
}

function sampleCrashMultiplier() {
    const u = cryptoRandom();
    if (u < HOUSE_EDGE) return 1.00;
    const c = (1 - HOUSE_EDGE) / (1 - u);
    // Cap to a sane upper bound (one in a million).
    return Math.min(c, 100_000);
}

function multiplierAt(elapsedMs) {
    return Math.exp(GROWTH_RATE * (elapsedMs / 1000));
}

function timeForMultiplier(target) {
    return (Math.log(Math.max(1, target)) / GROWTH_RATE) * 1000;
}

// ---------- round state ---------- //

const round = {
    state: 'idle',           // 'idle' | 'betting' | 'running' | 'reveal'
    id: 0,
    bettingEndsAt: 0,        // Date.now()
    runningStartedAt: 0,
    crashMultiplier: 0,
    crashTime: 0,            // ms after running start
    revealEndsAt: 0,
    bets: new Map(),         // playerName -> { socketId, bet, autoCashout, cashedAt, payout }
    history: []              // recent crash multipliers (max 20)
};

let roundTimer = null;
let mainLoopIo = null;
let onlinePlayersRef = null;

// ---------- broadcast helpers ---------- //

function publicBets() {
    const out = [];
    for (const [name, b] of round.bets) {
        out.push({
            name,
            bet: b.bet,
            autoCashout: b.autoCashout || null,
            cashedAt: b.cashedAt || null,
            payout: b.payout || 0
        });
    }
    return out;
}

function broadcastState() {
    if (!mainLoopIo) return;
    const now = Date.now();
    const base = {
        state: round.state,
        roundId: round.id,
        bets: publicBets(),
        history: round.history.slice(0, 20)
    };
    if (round.state === 'betting') {
        base.timeRemaining = Math.max(0, round.bettingEndsAt - now);
    } else if (round.state === 'running') {
        const elapsed = now - round.runningStartedAt;
        base.elapsedMs = elapsed;
        base.multiplier = +multiplierAt(elapsed).toFixed(4);
    } else if (round.state === 'reveal') {
        base.crashMultiplier = +round.crashMultiplier.toFixed(2);
        base.timeRemaining = Math.max(0, round.revealEndsAt - now);
    }
    mainLoopIo.emit('crash-state', base);
}

function broadcastTick() {
    if (round.state !== 'running' || !mainLoopIo) return;
    const now = Date.now();
    const elapsed = now - round.runningStartedAt;
    mainLoopIo.emit('crash-tick', {
        roundId: round.id,
        elapsedMs: elapsed,
        multiplier: +multiplierAt(elapsed).toFixed(4)
    });
}

// ---------- lifecycle ---------- //

function startBettingPhase() {
    round.id += 1;
    round.state = 'betting';
    round.bettingEndsAt = Date.now() + BETTING_MS;
    round.bets = new Map();
    round.crashMultiplier = 0;
    round.crashTime = 0;
    broadcastState();
    if (mainLoopIo) mainLoopIo.emit('crash-round-betting', { roundId: round.id, durationMs: BETTING_MS });
    scheduleNext(BETTING_MS, startRunningPhase);
}

function startRunningPhase() {
    round.state = 'running';
    round.runningStartedAt = Date.now();
    round.crashMultiplier = sampleCrashMultiplier();
    round.crashTime = Math.min(timeForMultiplier(round.crashMultiplier), MAX_ROUND_MS);
    broadcastState();
    if (mainLoopIo) mainLoopIo.emit('crash-round-running', { roundId: round.id, startedAt: round.runningStartedAt });
    runRunningLoop();
}

function runRunningLoop() {
    if (round.state !== 'running') return;
    const tick = () => {
        if (round.state !== 'running') return;
        const elapsed = Date.now() - round.runningStartedAt;

        // Resolve auto-cashouts that have crossed their target.
        const currentMult = multiplierAt(elapsed);
        for (const [name, b] of round.bets) {
            if (!b.cashedAt && b.autoCashout && currentMult >= b.autoCashout && b.autoCashout <= round.crashMultiplier) {
                resolveCashout(name, b.autoCashout, true).catch(err =>
                    console.error('auto-cashout failed:', err.message));
            }
        }

        if (elapsed >= round.crashTime) {
            crashNow();
            return;
        }
        broadcastTick();
        roundTimer = setTimeout(tick, TICK_MS);
    };
    roundTimer = setTimeout(tick, TICK_MS);
}

function crashNow() {
    round.state = 'reveal';
    round.revealEndsAt = Date.now() + REVEAL_MS;
    round.history.unshift(+round.crashMultiplier.toFixed(2));
    if (round.history.length > 50) round.history.length = 50;
    if (mainLoopIo) mainLoopIo.emit('crash-round-crashed', {
        roundId: round.id,
        crashMultiplier: +round.crashMultiplier.toFixed(2),
        bets: publicBets()
    });
    broadcastState();
    scheduleNext(REVEAL_MS, startBettingPhase);
}

function scheduleNext(delayMs, fn) {
    clearTimeout(roundTimer);
    roundTimer = setTimeout(fn, delayMs);
}

export function startCrashLoop(io) {
    mainLoopIo = io;
    if (round.state === 'idle') startBettingPhase();
}

export function stopCrashLoop() {
    clearTimeout(roundTimer);
    roundTimer = null;
    round.state = 'idle';
}

// ---------- per-socket handlers ---------- //

async function resolveCashout(playerName, atMultiplier, isAuto = false) {
    const b = round.bets.get(playerName);
    if (!b || b.cashedAt) return null;
    const m = +atMultiplier.toFixed(4);
    // Floor (not round) so the house never gives away fractional SC.
    const payout = Math.floor(b.bet * m);
    b.cashedAt = m;
    b.payout = payout;
    b.isAuto = isAuto;
    const updated = await addBalance(playerName, payout, 'crash_payout', {
        bet: b.bet, multiplier: m, payout, auto: isAuto
    });
    if (mainLoopIo) {
        mainLoopIo.emit('crash-cashout', {
            roundId: round.id,
            name: playerName,
            multiplier: m,
            payout,
            balance: updated,
            auto: isAuto
        });
    }
    // Achievement bumps for big cash-outs.
    if (mainLoopIo && onlinePlayersRef) {
        const unlocks = [];
        if (m >= 10)  unlocks.push(...await bump(playerName, 'crash_cashout_10x', 1));
        if (m >= 50)  unlocks.push(...await bump(playerName, 'crash_cashout_50x', 1));
        if (m >= 100) unlocks.push(...await bump(playerName, 'crash_cashout_100x', 1));
        // Creative speedrun: cash out very early (≤1.10×) and ≥50 SC profit.
        if (m <= 1.10 && (payout - b.bet) >= 50) {
            unlocks.push(...await bump(playerName, 'crash_speedrun', payout - b.bet));
        }
        if (typeof updated === 'number') {
            unlocks.push(...await bump(playerName, 'max_balance', Math.floor(updated), 'max'));
        }
        notifyUnlocks(mainLoopIo, onlinePlayersRef, playerName, unlocks);
    }
    return { multiplier: m, payout, balance: updated };
}

export function registerCrashHandlers(socket, io, deps) {
    const { checkRateLimit, onlinePlayers } = deps;
    onlinePlayersRef = onlinePlayers;

    socket.on('crash-state', () => { try {
        // Send current state to a single subscriber on demand.
        const now = Date.now();
        const base = {
            state: round.state,
            roundId: round.id,
            bets: publicBets(),
            history: round.history.slice(0, 20)
        };
        if (round.state === 'betting') base.timeRemaining = Math.max(0, round.bettingEndsAt - now);
        else if (round.state === 'running') {
            base.elapsedMs = now - round.runningStartedAt;
            base.multiplier = +multiplierAt(base.elapsedMs).toFixed(4);
        } else if (round.state === 'reveal') {
            base.crashMultiplier = +round.crashMultiplier.toFixed(2);
            base.timeRemaining = Math.max(0, round.revealEndsAt - now);
        }
        socket.emit('crash-state', base);
    } catch (err) { console.error('crash-state error:', err.message); } });

    socket.on('crash-bet', async (data) => { try {
        if (!checkRateLimit(socket, 5)) return;
        const player = onlinePlayers.get(socket.id);
        if (!player || !player.name) {
            socket.emit('crash-error', { message: 'Not logged in' });
            return;
        }
        if (round.state !== 'betting') {
            socket.emit('crash-error', { message: 'Betting is closed for this round' });
            return;
        }
        if (round.bets.has(player.name)) {
            socket.emit('crash-error', { message: 'Bet already placed for this round' });
            return;
        }
        const bet = Number(data?.bet);
        if (!Number.isInteger(bet) || !CRASH_BETS.includes(bet)) {
            socket.emit('crash-error', { message: 'Invalid bet amount' });
            return;
        }
        let autoCashout = null;
        if (data?.autoCashout != null) {
            const a = Number(data.autoCashout);
            if (!Number.isFinite(a) || a < 1.01 || a > MAX_AUTO_CASHOUT) {
                socket.emit('crash-error', { message: 'Auto-cashout must be 1.01 – 1,000,000' });
                return;
            }
            autoCashout = +a.toFixed(2);
        }
        // Capture the round id so we can detect a state transition that
        // happened during the deductBalance await (betting → running). Without
        // this check the bet would land in an already-running round.
        const placedInRoundId = round.id;

        const balanceAfterBet = await deductBalance(player.name, bet, 'crash_bet', { bet, autoCashout });
        if (balanceAfterBet === null) {
            socket.emit('crash-error', { message: 'Not enough coins' });
            return;
        }
        // Refund + bail if the round flipped while we were deducting.
        if (round.state !== 'betting' || round.id !== placedInRoundId) {
            await addBalance(player.name, bet, 'crash_bet_refund_state_race', { bet, originalRound: placedInRoundId });
            socket.emit('crash-error', { message: 'Betting closed before bet was confirmed' });
            socket.emit('balance-update', { balance: balanceAfterBet + bet });
            return;
        }
        round.bets.set(player.name, {
            socketId: socket.id,
            bet,
            autoCashout,
            cashedAt: null,
            payout: 0
        });
        // Achievement: first bet
        const unlocks = await bump(player.name, 'crash_bets', 1);
        notifyUnlocks(io, onlinePlayers, player.name, unlocks);

        socket.emit('balance-update', { balance: balanceAfterBet });
        socket.emit('crash-bet-confirmed', {
            roundId: round.id,
            bet,
            autoCashout,
            balance: balanceAfterBet
        });
        if (mainLoopIo) mainLoopIo.emit('crash-bet-public', {
            roundId: round.id,
            name: player.name,
            bet,
            autoCashout
        });
    } catch (err) {
        console.error('crash-bet error:', err.message);
        socket.emit('crash-error', { message: 'Bet failed. Try again.' });
    } });

    socket.on('crash-cashout', async () => { try {
        if (!checkRateLimit(socket, 10)) return;
        const player = onlinePlayers.get(socket.id);
        if (!player || !player.name) {
            socket.emit('crash-error', { message: 'Not logged in' });
            return;
        }
        if (round.state !== 'running') {
            socket.emit('crash-error', { message: 'Round is not running' });
            return;
        }
        const b = round.bets.get(player.name);
        if (!b) {
            socket.emit('crash-error', { message: 'No active bet' });
            return;
        }
        if (b.cashedAt) {
            socket.emit('crash-error', { message: 'Already cashed out' });
            return;
        }
        const elapsed = Date.now() - round.runningStartedAt;
        const m = multiplierAt(elapsed);
        if (m > round.crashMultiplier) {
            socket.emit('crash-error', { message: 'Too late — already crashed' });
            return;
        }
        const result = await resolveCashout(player.name, m, false);
        if (result) socket.emit('crash-cashout-confirmed', result);
    } catch (err) {
        console.error('crash-cashout error:', err.message);
        socket.emit('crash-error', { message: 'Cash-out failed.' });
    } });
}

// Test-only exports
export {
    HOUSE_EDGE,
    GROWTH_RATE,
    BETTING_MS,
    REVEAL_MS,
    TICK_MS,
    CRASH_BETS,
    MIN_BET,
    MAX_BET,
    sampleCrashMultiplier,
    multiplierAt,
    timeForMultiplier
};
