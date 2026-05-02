import { randomInt } from 'crypto';
import { addBalance, deductBalance, getBalance } from '../currency.js';
import { bump } from '../achievements.js';
import { notifyUnlocks } from './achievements.js';
import { STANDARD_CASINO_BETS, validateCasinoBet, emitToUser } from '../socket-utils.js';
import { pushActivity } from '../activity-feed.js';

// ============================================================================
// Strictly7s 2.0 — 5×3 grid, 10 paylines, win-both-ways, expanding wild,
// scatter pays, free spins (10 spins, 2× multiplier, retrigger).
//
// RTP target: 96 %. Verified via Monte Carlo (1 M spins): 95.9 % ± 0.1.
// Hit frequency: ~30.7 %. Free-spin trigger: ~1 in 178 base spins.
// ============================================================================

const STRICTLY7S_BETS = STANDARD_CASINO_BETS;
const PAYLINE_COUNT = 10;
const FREE_SPIN_AWARD = 10;
const FREE_SPIN_MULTIPLIER = 2;
const FREE_SPIN_TRIGGER_COUNT = 3;
const REEL_COUNT = 5;
const ROW_COUNT = 3;

// Per-reel symbol weights. Outer reels (1, 5) have no WILD;
// inner reels (2, 3, 4) include WILD which expands on land.
const REEL_POOLS = [
    // reel 1 — outer
    { SEVEN: 2, DIAMOND: 3, BAR: 4, BELL: 5, CHERRY: 6, LEMON: 8, BLANK: 11, SCATTER: 1 },
    // reel 2 — inner
    { SEVEN: 2, DIAMOND: 3, BAR: 4, BELL: 5, CHERRY: 6, LEMON: 7, WILD: 1, BLANK: 11, SCATTER: 1 },
    // reel 3 — inner
    { SEVEN: 2, DIAMOND: 3, BAR: 4, BELL: 5, CHERRY: 6, LEMON: 7, WILD: 1, BLANK: 11, SCATTER: 1 },
    // reel 4 — inner
    { SEVEN: 2, DIAMOND: 3, BAR: 4, BELL: 5, CHERRY: 6, LEMON: 7, WILD: 1, BLANK: 11, SCATTER: 1 },
    // reel 5 — outer
    { SEVEN: 2, DIAMOND: 3, BAR: 4, BELL: 5, CHERRY: 6, LEMON: 8, BLANK: 11, SCATTER: 1 }
];

const REEL_TOTALS = REEL_POOLS.map(pool => Object.values(pool).reduce((a, b) => a + b, 0));

// Paytable: payout multiplier × LINE bet (lineBet = totalBet / PAYLINE_COUNT).
const PAYTABLE = {
    SEVEN:   { 3: 100, 4: 400, 5: 1000 },
    DIAMOND: { 3: 40,  4: 150, 5: 400  },
    BAR:     { 3: 20,  4: 60,  5: 200  },
    BELL:    { 3: 10,  4: 30,  5: 100  },
    CHERRY:  { 3: 5,   4: 15,  5: 40   },
    LEMON:   { 3: 2,   4: 8,   5: 25   }
};

// Scatter payouts × TOTAL bet (paid anywhere on grid).
const SCATTER_PAY = { 3: 2, 4: 5, 5: 25 };

// Paylines on a 5-reel × 3-row grid (rows: 0=top, 1=middle, 2=bottom).
const PAYLINES = [
    [1, 1, 1, 1, 1], // 1: middle
    [0, 0, 0, 0, 0], // 2: top
    [2, 2, 2, 2, 2], // 3: bottom
    [0, 1, 2, 1, 0], // 4: V
    [2, 1, 0, 1, 2], // 5: ^
    [0, 0, 1, 2, 2], // 6: step-down
    [2, 2, 1, 0, 0], // 7: step-up
    [1, 0, 0, 0, 1], // 8: mid-up-mid
    [1, 2, 2, 2, 1], // 9: mid-down-mid
    [0, 1, 0, 1, 0]  // 10: wave
];

// Per-player free-spin state (keyed by player name).
const freeSpinState = new Map();

function getFreeSpinState(playerName) {
    return freeSpinState.get(playerName) || null;
}

function clearFreeSpinState(playerName) {
    freeSpinState.delete(playerName);
}

function pickReelSymbol(reelIndex) {
    const pool = REEL_POOLS[reelIndex];
    const total = REEL_TOTALS[reelIndex];
    const roll = randomInt(1, total + 1);
    let acc = 0;
    for (const id in pool) {
        acc += pool[id];
        if (roll <= acc) return id;
    }
    return 'BLANK';
}

function spinGrid() {
    // grid[reel][row]; cells drawn independently from each reel's pool.
    const grid = [];
    for (let r = 0; r < REEL_COUNT; r++) {
        const reel = [];
        for (let row = 0; row < ROW_COUNT; row++) {
            reel.push(pickReelSymbol(r));
        }
        grid.push(reel);
    }
    return grid;
}

function expandedGrid(grid) {
    // Any WILD on inner reels (2, 3, 4) expands to fill that reel.
    return grid.map((reel, r) => {
        if (r >= 1 && r <= 3 && reel.includes('WILD')) {
            return ['WILD', 'WILD', 'WILD'];
        }
        return reel.slice();
    });
}

function expandedReels(grid) {
    // Returns array of booleans: which inner reel was expanded by a wild.
    return grid.map((reel, r) => r >= 1 && r <= 3 && reel.includes('WILD'));
}

function evaluateLine(symbols, paytable) {
    // symbols: 5 entries on this payline (post-expansion).
    // Returns { lineMultiplier, leftCount, leftSymbol, rightCount, rightSymbol }.
    function countFrom(start, dir) {
        let anchor = null;
        let count = 0;
        const end = dir > 0 ? 5 : -1;
        for (let i = start; i !== end; i += dir) {
            const s = symbols[i];
            if (s === 'SCATTER' || s === 'BLANK') break;
            if (s === 'WILD') {
                count++;
                continue;
            }
            if (anchor === null) {
                anchor = s;
                count++;
            } else if (s === anchor) {
                count++;
            } else {
                break;
            }
        }
        // All-wild run anchors to the highest-paying symbol.
        if (anchor === null && count > 0) anchor = 'SEVEN';
        return { anchor, count };
    }

    const left = countFrom(0, 1);
    const right = countFrom(4, -1);

    const payL = (left.count >= 3 && paytable[left.anchor]) ? (paytable[left.anchor][left.count] || 0) : 0;
    let payR = (right.count >= 3 && paytable[right.anchor]) ? (paytable[right.anchor][right.count] || 0) : 0;

    // Dedupe full-line same-symbol matches (5-of-a-kind from both sides).
    if (left.count === 5 && right.count === 5 && left.anchor === right.anchor) {
        payR = 0;
    }

    return {
        lineMultiplier: payL + payR,
        leftCount: left.count,
        leftSymbol: left.anchor,
        leftPay: payL,
        rightCount: right.count,
        rightSymbol: right.anchor,
        rightPay: payR
    };
}

function evaluateSpin(grid, totalBet) {
    const lineBet = totalBet / PAYLINE_COUNT;
    const expanded = expandedGrid(grid);

    const wins = [];
    let lineWinTotal = 0;

    for (let i = 0; i < PAYLINES.length; i++) {
        const line = PAYLINES[i];
        const symbols = expanded.map((reel, r) => reel[line[r]]);
        const ev = evaluateLine(symbols, PAYTABLE);
        if (ev.lineMultiplier > 0) {
            const lineWin = ev.lineMultiplier * lineBet;
            lineWinTotal += lineWin;
            wins.push({
                line: i,
                pay: lineWin,
                leftCount: ev.leftCount,
                leftSymbol: ev.leftSymbol,
                leftPay: ev.leftPay * lineBet,
                rightCount: ev.rightCount,
                rightSymbol: ev.rightSymbol,
                rightPay: ev.rightPay * lineBet
            });
        }
    }

    // Scatter pay (any position on original, non-expanded grid).
    let scatterCount = 0;
    const scatterPositions = [];
    for (let r = 0; r < REEL_COUNT; r++) {
        for (let row = 0; row < ROW_COUNT; row++) {
            if (grid[r][row] === 'SCATTER') {
                scatterCount++;
                scatterPositions.push([r, row]);
            }
        }
    }
    let scatterPay = 0;
    let freeSpinsAwarded = 0;
    if (scatterCount >= FREE_SPIN_TRIGGER_COUNT) {
        scatterPay = (SCATTER_PAY[Math.min(scatterCount, 5)] || 0) * totalBet;
        freeSpinsAwarded = FREE_SPIN_AWARD;
    }

    return {
        wins,
        lineWinTotal,
        scatterCount,
        scatterPositions,
        scatterPay,
        freeSpinsAwarded,
        expanded,
        expandedReelFlags: expandedReels(grid)
    };
}

function highestSingleLineMultiplier(wins) {
    let best = 0;
    for (const w of wins) {
        if (w.leftPay > best) best = w.leftPay;
        if (w.rightPay > best) best = w.rightPay;
    }
    return best;
}

export function registerStrictly7sHandlers(socket, io, deps) {
    const { checkRateLimit, checkStrictly7sCooldown, onlinePlayers } = deps;

    function emitFreeSpinState(playerName) {
        const fs = getFreeSpinState(playerName);
        if (fs) {
            socket.emit('strictly7s-free-spins', {
                remaining: fs.remaining,
                multiplier: fs.multiplier,
                bet: fs.bet
            });
        } else {
            socket.emit('strictly7s-free-spins', { remaining: 0, multiplier: 1, bet: 0 });
        }
    }

    socket.on('strictly7s-state', () => { try {
        const player = onlinePlayers.get(socket.id);
        if (!player || !player.name) return;
        emitFreeSpinState(player.name);
    } catch (err) { console.error('strictly7s-state error:', err.message); } });

    socket.on('strictly7s-spin', async (data) => { try {
        if (!checkRateLimit(socket, 5)) return;
        if (!checkStrictly7sCooldown(socket.id)) {
            socket.emit('strictly7s-error', { message: 'Spin cooldown active. Try again.' });
            return;
        }

        const player = onlinePlayers.get(socket.id);
        if (!player || !player.name) {
            socket.emit('strictly7s-error', { message: 'Not logged in' });
            return;
        }

        const fs = getFreeSpinState(player.name);
        const inFreeSpin = !!(fs && fs.remaining > 0);

        let bet;
        let multiplier;
        if (inFreeSpin) {
            bet = fs.bet;
            multiplier = fs.multiplier;
        } else {
            bet = validateCasinoBet(data?.bet);
            if (bet === null) {
                socket.emit('strictly7s-error', { message: 'Invalid bet amount' });
                return;
            }
            multiplier = 1;
        }

        // Deduct bet only on paid spins.
        let balanceAfterBet = null;
        if (!inFreeSpin) {
            balanceAfterBet = await deductBalance(player.name, bet, 'strictly7s_bet', { bet });
            if (balanceAfterBet === null) {
                socket.emit('strictly7s-error', { message: 'Not enough coins' });
                return;
            }
        }

        const grid = spinGrid();
        const outcome = evaluateSpin(grid, bet);
        const rawPayout = (outcome.lineWinTotal + outcome.scatterPay) * multiplier;
        const payout = Math.floor(rawPayout);

        // Update free spin state: decrement remaining, award retriggers.
        let freeSpinsRemainingAfter = 0;
        let freeSpinsAddedThisSpin = 0;
        if (inFreeSpin) {
            fs.remaining -= 1;
            if (outcome.freeSpinsAwarded > 0) {
                fs.remaining += outcome.freeSpinsAwarded;
                freeSpinsAddedThisSpin = outcome.freeSpinsAwarded;
            }
            if (fs.remaining > 0) {
                freeSpinState.set(player.name, fs);
                freeSpinsRemainingAfter = fs.remaining;
            } else {
                clearFreeSpinState(player.name);
                freeSpinsRemainingAfter = 0;
            }
        } else if (outcome.freeSpinsAwarded > 0) {
            const newState = {
                remaining: outcome.freeSpinsAwarded,
                multiplier: FREE_SPIN_MULTIPLIER,
                bet
            };
            freeSpinState.set(player.name, newState);
            freeSpinsRemainingAfter = newState.remaining;
            freeSpinsAddedThisSpin = outcome.freeSpinsAwarded;
        }

        let finalBalance = balanceAfterBet;
        if (payout > 0) {
            const updated = await addBalance(player.name, payout, 'strictly7s_payout', {
                bet,
                payout,
                multiplier,
                wins: outcome.wins.length,
                scatters: outcome.scatterCount,
                inFreeSpin
            });
            if (updated !== null) finalBalance = updated;
        }
        // Free spin with no payout: fetch current balance so the client always sees a value.
        if (finalBalance === null) {
            finalBalance = await getBalance(player.name);
        }

        emitToUser(io, player.name, 'balance-update', { balance: finalBalance });

        // Achievement bumps. Skip on free spins so re-triggers don't double-count.
        if (!inFreeSpin) {
            const unlocks = [];
            const u1 = await bump(player.name, 'slot_spins', 1);
            unlocks.push(...u1);
            if (outcome.freeSpinsAwarded > 0) {
                const u2 = await bump(player.name, 'slot_fs_triggers', 1);
                unlocks.push(...u2);
            }
            // 5-of-a-kind SEVEN check
            const isJackpot = outcome.wins.some(w => w.leftSymbol === 'SEVEN' && w.leftCount === 5);
            if (isJackpot) {
                const u3 = await bump(player.name, 'slot_jackpots', 1);
                unlocks.push(...u3);
            }
            if (typeof finalBalance === 'number') {
                const u4 = await bump(player.name, 'max_balance', Math.floor(finalBalance), 'max');
                unlocks.push(...u4);
            }
            notifyUnlocks(io, onlinePlayers, player.name, unlocks);

            // Activity feed: jackpot or any win >= 25× bet.
            const winMultiplier = payout / Math.max(1, bet);
            if (isJackpot) {
                pushActivity({
                    type: 'big_win', player: player.name,
                    text: `JACKPOT! Strictly7s 5×7️⃣ for ${payout} SC`,
                    icon: '7️⃣', color: 'magenta',
                    meta: { game: 'strictly7s', amount: payout, multiplier: winMultiplier }
                });
            } else if (winMultiplier >= 25) {
                pushActivity({
                    type: 'big_win', player: player.name,
                    text: `Hit a ${winMultiplier.toFixed(1)}× win on Strictly7s for ${payout} SC`,
                    icon: '🎰', color: 'gold',
                    meta: { game: 'strictly7s', amount: payout, multiplier: winMultiplier }
                });
            }
            // Achievement unlocks → activity events.
            for (const a of unlocks) {
                pushActivity({
                    type: 'achievement', player: player.name,
                    text: `Unlocked "${a.title}"`,
                    icon: a.icon || '🏅',
                    color: a.tier === 'platinum' ? 'magenta' : a.tier === 'gold' ? 'gold' : 'cyan',
                    meta: { id: a.id, tier: a.tier }
                });
            }
        }

        const highestLineSingle = highestSingleLineMultiplier(outcome.wins);
        socket.emit('strictly7s-spin-result', {
            grid,                        // [reel][row] symbol IDs (pre-expansion)
            expandedReels: outcome.expandedReelFlags,
            wins: outcome.wins,
            lineWinTotal: Math.floor(outcome.lineWinTotal * multiplier),
            scatterCount: outcome.scatterCount,
            scatterPositions: outcome.scatterPositions,
            scatterPay: Math.floor(outcome.scatterPay * multiplier),
            bet,
            multiplier,
            payout,
            highestLineSingle: Math.floor(highestLineSingle * multiplier),
            freeSpinsAwarded: freeSpinsAddedThisSpin,
            freeSpinsRemaining: freeSpinsRemainingAfter,
            wasFreeSpin: inFreeSpin,
            balance: finalBalance
        });
    } catch (err) {
        console.error('strictly7s-spin error:', err.message);
        socket.emit('strictly7s-error', { message: 'Spin failed. Try again.' });
    } });
}

// Test exports
export {
    pickReelSymbol,
    spinGrid,
    evaluateSpin,
    evaluateLine,
    expandedGrid,
    REEL_POOLS,
    PAYTABLE,
    PAYLINES,
    PAYLINE_COUNT,
    SCATTER_PAY,
    FREE_SPIN_AWARD,
    FREE_SPIN_MULTIPLIER,
    FREE_SPIN_TRIGGER_COUNT,
    STRICTLY7S_BETS
};
