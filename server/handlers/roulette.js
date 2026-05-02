import { randomInt } from 'crypto';
import { addBalance, deductBalance, getBalance } from '../currency.js';
import { bump } from '../achievements.js';
import { notifyUnlocks } from './achievements.js';
import { STANDARD_CASINO_BETS, validateCasinoBet } from '../socket-utils.js';

// ============================================================================
// Roulette — European wheel (single 0). 37 pockets: 0..36.
//
// House edge = 1/37 ≈ 2.70 % on every bet type ⇒ RTP ≈ 97.30 %.
//
// Bet types supported:
//   straight  — single number (0..36)         pays 35:1
//   red / black                                pays 1:1
//   even / odd                                 pays 1:1   (0 loses)
//   low (1-18) / high (19-36)                  pays 1:1   (0 loses)
//   dozen1 (1-12) / dozen2 (13-24) / dozen3    pays 2:1
//   col1 / col2 / col3                         pays 2:1
//
// Multiple bets per round are supported.
// ============================================================================

const ROULETTE_BETS = STANDARD_CASINO_BETS;
const MAX_BETS_PER_ROUND = 12;
const POCKET_COUNT = 37;

const RED_NUMBERS = new Set([1, 3, 5, 7, 9, 12, 14, 16, 18, 19, 21, 23, 25, 27, 30, 32, 34, 36]);
const BLACK_NUMBERS = new Set([2, 4, 6, 8, 10, 11, 13, 15, 17, 20, 22, 24, 26, 28, 29, 31, 33, 35]);

function isRed(n) { return RED_NUMBERS.has(n); }
function isBlack(n) { return BLACK_NUMBERS.has(n); }

function spinWheel() {
    return randomInt(0, POCKET_COUNT);
}

function evaluateBet(bet, pocket) {
    // Returns { won: boolean, payout: number including stake on win }.
    // pocket = 0 loses every outside bet by definition.
    const stake = bet.amount;
    switch (bet.type) {
        case 'straight':
            return bet.value === pocket
                ? { won: true,  payout: stake * 36 } // 35:1 + stake
                : { won: false, payout: 0 };
        case 'red':
            return (pocket !== 0 && isRed(pocket))
                ? { won: true, payout: stake * 2 }   // 1:1 + stake
                : { won: false, payout: 0 };
        case 'black':
            return (pocket !== 0 && isBlack(pocket))
                ? { won: true, payout: stake * 2 }
                : { won: false, payout: 0 };
        case 'even':
            return (pocket !== 0 && pocket % 2 === 0)
                ? { won: true, payout: stake * 2 }
                : { won: false, payout: 0 };
        case 'odd':
            return (pocket !== 0 && pocket % 2 === 1)
                ? { won: true, payout: stake * 2 }
                : { won: false, payout: 0 };
        case 'low':
            return (pocket >= 1 && pocket <= 18)
                ? { won: true, payout: stake * 2 }
                : { won: false, payout: 0 };
        case 'high':
            return (pocket >= 19 && pocket <= 36)
                ? { won: true, payout: stake * 2 }
                : { won: false, payout: 0 };
        case 'dozen1':
            return (pocket >= 1 && pocket <= 12)
                ? { won: true, payout: stake * 3 }   // 2:1 + stake
                : { won: false, payout: 0 };
        case 'dozen2':
            return (pocket >= 13 && pocket <= 24)
                ? { won: true, payout: stake * 3 }
                : { won: false, payout: 0 };
        case 'dozen3':
            return (pocket >= 25 && pocket <= 36)
                ? { won: true, payout: stake * 3 }
                : { won: false, payout: 0 };
        case 'col1':
            return (pocket !== 0 && pocket % 3 === 1)
                ? { won: true, payout: stake * 3 }
                : { won: false, payout: 0 };
        case 'col2':
            return (pocket !== 0 && pocket % 3 === 2)
                ? { won: true, payout: stake * 3 }
                : { won: false, payout: 0 };
        case 'col3':
            return (pocket !== 0 && pocket % 3 === 0)
                ? { won: true, payout: stake * 3 }
                : { won: false, payout: 0 };
        default:
            return { won: false, payout: 0 };
    }
}

function pocketColor(n) {
    if (n === 0) return 'green';
    if (isRed(n)) return 'red';
    return 'black';
}

const VALID_BET_TYPES = new Set([
    'straight', 'red', 'black', 'even', 'odd', 'low', 'high',
    'dozen1', 'dozen2', 'dozen3', 'col1', 'col2', 'col3'
]);

function validateBets(rawBets) {
    if (!Array.isArray(rawBets)) return null;
    if (rawBets.length === 0 || rawBets.length > MAX_BETS_PER_ROUND) return null;
    const out = [];
    for (const r of rawBets) {
        if (!r || typeof r !== 'object') return null;
        if (!VALID_BET_TYPES.has(r.type)) return null;
        const amount = validateCasinoBet(r.amount);
        if (amount === null) return null;
        if (r.type === 'straight') {
            const value = Number(r.value);
            if (!Number.isInteger(value) || value < 0 || value > 36) return null;
            out.push({ type: 'straight', value, amount });
        } else {
            out.push({ type: r.type, amount });
        }
    }
    return out;
}

const spinCooldown = new Map(); // socketId -> timestamp

export function registerRouletteHandlers(socket, io, deps) {
    const { checkRateLimit, onlinePlayers } = deps;

    socket.on('roulette-spin', async (data) => { try {
        if (!checkRateLimit(socket, 5)) return;
        const now = Date.now();
        const last = spinCooldown.get(socket.id) || 0;
        if (now - last < 1500) {
            socket.emit('roulette-error', { message: 'Spin cooldown active.' });
            return;
        }
        spinCooldown.set(socket.id, now);

        const player = onlinePlayers.get(socket.id);
        if (!player || !player.name) {
            socket.emit('roulette-error', { message: 'Not logged in' });
            return;
        }

        const bets = validateBets(data?.bets);
        if (!bets) {
            socket.emit('roulette-error', { message: 'Invalid bets' });
            return;
        }
        const totalStake = bets.reduce((sum, b) => sum + b.amount, 0);

        const balanceAfter = await deductBalance(player.name, totalStake, 'roulette_bet', { totalStake, bets });
        if (balanceAfter === null) {
            socket.emit('roulette-error', { message: 'Not enough coins' });
            return;
        }

        const pocket = spinWheel();
        const results = bets.map(b => {
            const { won, payout } = evaluateBet(b, pocket);
            return { bet: b, won, payout };
        });
        const totalPayout = results.reduce((sum, r) => sum + r.payout, 0);

        let finalBalance = balanceAfter;
        if (totalPayout > 0) {
            const updated = await addBalance(player.name, totalPayout, 'roulette_payout', {
                pocket, totalPayout, results
            });
            if (updated !== null) finalBalance = updated;
        }
        if (finalBalance === null) finalBalance = await getBalance(player.name);

        // Achievement bumps
        const unlocks = [];
        unlocks.push(...await bump(player.name, 'roulette_spins', 1));
        unlocks.push(...await bump(player.name, 'max_balance', Math.floor(finalBalance), 'max'));
        // Did any straight bet hit?
        for (const r of results) {
            if (r.won && r.bet.type === 'straight') {
                unlocks.push(...await bump(player.name, 'roulette_straight_hits', 1));
                break;
            }
        }
        if (pocket === 8)  unlocks.push(...await bump(player.name, 'roulette_eight_hits', 1));
        if (pocket === 13) unlocks.push(...await bump(player.name, 'roulette_thirteen_hits', 1));
        notifyUnlocks(io, onlinePlayers, player.name, unlocks);

        socket.emit('balance-update', { balance: finalBalance });
        socket.emit('roulette-result', {
            pocket,
            color: pocketColor(pocket),
            totalStake,
            totalPayout,
            net: totalPayout - totalStake,
            results,
            balance: finalBalance
        });
    } catch (err) {
        console.error('roulette-spin error:', err.message);
        socket.emit('roulette-error', { message: 'Spin failed.' });
    } });
}

export function cleanupRouletteCooldown(socketId) {
    spinCooldown.delete(socketId);
}

// Test exports
export {
    ROULETTE_BETS,
    MAX_BETS_PER_ROUND,
    POCKET_COUNT,
    RED_NUMBERS,
    BLACK_NUMBERS,
    isRed,
    isBlack,
    pocketColor,
    spinWheel,
    evaluateBet,
    validateBets
};
