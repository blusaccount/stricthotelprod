import { randomInt } from 'crypto';
import { addBalance, deductBalance, getBalance } from '../currency.js';

// ============================================================================
// Blackjack — single player vs. dealer, 6-deck shoe.
//
// Rules:
//  - 6 decks, reshuffle when fewer than 80 cards remain.
//  - Dealer hits on 16 and below, stands on 17+ (S17). Soft 17 also stands.
//  - Player actions: hit, stand, double-down (only on 2-card hand).
//  - Blackjack (21 with first two cards) pays 3:2.
//  - Standard win 1:1, push returns bet, bust loses.
//  - No split, no insurance (MVP).
// ============================================================================

const BLACKJACK_BETS = [2, 5, 10, 15, 20, 50];
const NUM_DECKS = 6;
const RESHUFFLE_AT = 80;

// Per-player active game state, keyed by player name.
const games = new Map();

// Shared shoe (one shoe for the server). Could be per-table for fairness in
// multi-table setups, but for a single-player blackjack hub one shoe is fine.
let shoe = [];
function newShoe() {
    const arr = [];
    for (let d = 0; d < NUM_DECKS; d++) {
        for (let suit = 0; suit < 4; suit++) {
            for (let rank = 1; rank <= 13; rank++) {
                arr.push({ suit, rank });
            }
        }
    }
    // Fisher–Yates with crypto.randomInt
    for (let i = arr.length - 1; i > 0; i--) {
        const j = randomInt(0, i + 1);
        [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
}
function ensureShoe() {
    if (shoe.length < RESHUFFLE_AT) shoe = newShoe();
}
function deal() {
    ensureShoe();
    return shoe.pop();
}

function cardValue(card) {
    // Ace returns 1 here; the soft/hard logic is in handTotal.
    if (card.rank === 1) return 1;
    if (card.rank >= 10) return 10;
    return card.rank;
}

function handTotal(hand) {
    // Returns { total, soft } where soft means an Ace counts as 11.
    let total = 0;
    let aces = 0;
    for (const c of hand) {
        if (c.rank === 1) {
            aces++;
            total += 1;
        } else {
            total += cardValue(c);
        }
    }
    let soft = false;
    if (aces > 0 && total + 10 <= 21) {
        total += 10;
        soft = true;
    }
    return { total, soft };
}

function isBlackjack(hand) {
    if (hand.length !== 2) return false;
    const t = handTotal(hand);
    return t.total === 21;
}

function isBust(hand) {
    return handTotal(hand).total > 21;
}

function dealerPlay(dealerHand) {
    while (true) {
        const t = handTotal(dealerHand);
        // S17: stand on hard 17+ AND soft 17.
        if (t.total >= 17) break;
        dealerHand.push(deal());
    }
    return dealerHand;
}

function settle(playerHand, dealerHand, bet, doubled) {
    // Returns { outcome: 'blackjack'|'win'|'push'|'lose', payout, multiplier }
    const playerBJ = isBlackjack(playerHand) && !doubled;
    const dealerBJ = isBlackjack(dealerHand);

    if (playerBJ && dealerBJ) return { outcome: 'push', payout: bet, multiplier: 1 };
    if (playerBJ) return { outcome: 'blackjack', payout: Math.floor(bet * 2.5), multiplier: 2.5 };
    if (dealerBJ) return { outcome: 'lose', payout: 0, multiplier: 0 };

    if (isBust(playerHand)) return { outcome: 'lose', payout: 0, multiplier: 0 };
    if (isBust(dealerHand)) return { outcome: 'win', payout: bet * 2, multiplier: 2 };

    const p = handTotal(playerHand).total;
    const d = handTotal(dealerHand).total;
    if (p > d) return { outcome: 'win', payout: bet * 2, multiplier: 2 };
    if (p < d) return { outcome: 'lose', payout: 0, multiplier: 0 };
    return { outcome: 'push', payout: bet, multiplier: 1 };
}

function publicState(g, includeHole = false) {
    return {
        playerHand: g.playerHand,
        playerTotal: handTotal(g.playerHand),
        dealerHand: includeHole ? g.dealerHand : [g.dealerHand[0], { hidden: true }],
        dealerTotal: includeHole ? handTotal(g.dealerHand) : { total: cardValue(g.dealerHand[0]), soft: g.dealerHand[0].rank === 1 },
        bet: g.bet,
        doubled: g.doubled,
        canDouble: g.playerHand.length === 2 && !g.finished,
        canHit: !g.finished,
        canStand: !g.finished,
        finished: g.finished,
        outcome: g.outcome || null,
        payout: g.payout || 0,
        multiplier: g.multiplier || 0
    };
}

export function registerBlackjackHandlers(socket, io, deps) {
    const { checkRateLimit, onlinePlayers } = deps;

    socket.on('bj-state', () => { try {
        if (!checkRateLimit(socket, 5)) return;
        const player = onlinePlayers.get(socket.id);
        if (!player || !player.name) return;
        const g = games.get(player.name);
        socket.emit('bj-state-result', g ? publicState(g, g.finished) : { idle: true });
    } catch (err) { console.error('bj-state error:', err.message); } });

    socket.on('bj-deal', async (data) => { try {
        if (!checkRateLimit(socket, 5)) return;
        const player = onlinePlayers.get(socket.id);
        if (!player || !player.name) {
            socket.emit('bj-error', { message: 'Not logged in' });
            return;
        }
        const existing = games.get(player.name);
        if (existing && !existing.finished) {
            socket.emit('bj-error', { message: 'Finish your current hand first' });
            return;
        }
        const bet = Number(data?.bet);
        if (!Number.isInteger(bet) || !BLACKJACK_BETS.includes(bet)) {
            socket.emit('bj-error', { message: 'Invalid bet amount' });
            return;
        }
        const balance = await deductBalance(player.name, bet, 'blackjack_bet', { bet });
        if (balance === null) {
            socket.emit('bj-error', { message: 'Not enough coins' });
            return;
        }

        const g = {
            playerHand: [deal(), deal()],
            dealerHand: [deal(), deal()],
            bet,
            doubled: false,
            finished: false
        };
        games.set(player.name, g);

        // Auto-settle on natural blackjack.
        if (isBlackjack(g.playerHand) || isBlackjack(g.dealerHand)) {
            await finishGame(player.name, socket, balance);
            return;
        }
        socket.emit('balance-update', { balance });
        socket.emit('bj-state-result', publicState(g, false));
    } catch (err) {
        console.error('bj-deal error:', err.message);
        socket.emit('bj-error', { message: 'Deal failed.' });
    } });

    socket.on('bj-hit', async () => { try {
        if (!checkRateLimit(socket, 10)) return;
        const player = onlinePlayers.get(socket.id);
        if (!player || !player.name) return;
        const g = games.get(player.name);
        if (!g || g.finished) {
            socket.emit('bj-error', { message: 'No active hand' });
            return;
        }
        g.playerHand.push(deal());
        if (isBust(g.playerHand) || handTotal(g.playerHand).total === 21) {
            await finishGame(player.name, socket);
            return;
        }
        socket.emit('bj-state-result', publicState(g, false));
    } catch (err) {
        console.error('bj-hit error:', err.message);
        socket.emit('bj-error', { message: 'Hit failed.' });
    } });

    socket.on('bj-stand', async () => { try {
        if (!checkRateLimit(socket, 10)) return;
        const player = onlinePlayers.get(socket.id);
        if (!player || !player.name) return;
        const g = games.get(player.name);
        if (!g || g.finished) {
            socket.emit('bj-error', { message: 'No active hand' });
            return;
        }
        await finishGame(player.name, socket);
    } catch (err) {
        console.error('bj-stand error:', err.message);
        socket.emit('bj-error', { message: 'Stand failed.' });
    } });

    socket.on('bj-double', async () => { try {
        if (!checkRateLimit(socket, 5)) return;
        const player = onlinePlayers.get(socket.id);
        if (!player || !player.name) return;
        const g = games.get(player.name);
        if (!g || g.finished) {
            socket.emit('bj-error', { message: 'No active hand' });
            return;
        }
        if (g.playerHand.length !== 2) {
            socket.emit('bj-error', { message: 'Can only double on first action' });
            return;
        }
        const balanceAfterDouble = await deductBalance(player.name, g.bet, 'blackjack_double', { bet: g.bet });
        if (balanceAfterDouble === null) {
            socket.emit('bj-error', { message: 'Not enough coins to double' });
            return;
        }
        g.doubled = true;
        g.bet = g.bet * 2;
        g.playerHand.push(deal());
        socket.emit('balance-update', { balance: balanceAfterDouble });
        await finishGame(player.name, socket);
    } catch (err) {
        console.error('bj-double error:', err.message);
        socket.emit('bj-error', { message: 'Double failed.' });
    } });
}

async function finishGame(playerName, socket, knownBalance = null) {
    const g = games.get(playerName);
    if (!g) return;

    // Dealer plays only if player isn't busted (otherwise dealer wins automatically).
    if (!isBust(g.playerHand)) {
        dealerPlay(g.dealerHand);
    }

    const result = settle(g.playerHand, g.dealerHand, g.bet, g.doubled);
    g.finished = true;
    g.outcome = result.outcome;
    g.payout = result.payout;
    g.multiplier = result.multiplier;

    let finalBalance = knownBalance;
    if (result.payout > 0) {
        const updated = await addBalance(playerName, result.payout, 'blackjack_payout', {
            bet: g.bet, payout: result.payout, outcome: result.outcome
        });
        if (updated !== null) finalBalance = updated;
    }
    if (finalBalance === null) finalBalance = await getBalance(playerName);

    socket.emit('balance-update', { balance: finalBalance });
    socket.emit('bj-state-result', publicState(g, true));
}

// Test exports
export {
    handTotal,
    isBlackjack,
    isBust,
    dealerPlay,
    settle,
    cardValue,
    BLACKJACK_BETS
};
