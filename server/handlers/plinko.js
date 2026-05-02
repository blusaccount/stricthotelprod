import { randomInt } from 'crypto';
import { addBalance, deductBalance } from '../currency.js';

// ============================================================================
// Plinko — 12-row peg field, 13 buckets, three risk levels.
// Each row independently sends the ball left (0) or right (1). Final bucket
// equals the count of right-moves, distributed Binomial(12, 0.5).
//
// RTP target: 96 % per risk level. Verified via Monte Carlo (500 K spins):
//   low    96.1 %   max win  9× bet
//   medium 95.1 %   max win 27× bet
//   high   96.5 %   max win 200× bet
// ============================================================================

const PLINKO_BETS = [2, 5, 10, 15, 20, 50];
const ROWS = 12;
const BUCKETS = ROWS + 1;
const RISK_LEVELS = ['low', 'medium', 'high'];

// Multipliers for each bucket index (0..12). Symmetric around the middle.
const PAYTABLE = {
    low:    [9,    3,   1.4, 1.2, 1.1, 1,   0.5, 1,   1.1, 1.2, 1.4, 3,   9   ],
    medium: [27,   8,   2.5, 1.5, 1.1, 0.7, 0.5, 0.7, 1.1, 1.5, 2.5, 8,   27  ],
    high:   [200,  25,  7,   2,   0.4, 0.3, 0.3, 0.3, 0.4, 2,   7,   25,  200 ]
};

function dropBall() {
    // Returns the path as an array of 0/1 (length ROWS) and the resulting bucket.
    const path = [];
    let bucket = 0;
    for (let i = 0; i < ROWS; i++) {
        const step = randomInt(0, 2);
        path.push(step);
        bucket += step;
    }
    return { path, bucket };
}

function evaluate(bucket, risk, bet) {
    const multiplier = PAYTABLE[risk][bucket];
    return Math.round(bet * multiplier);
}

export function registerPlinkoHandlers(socket, io, deps) {
    const { checkRateLimit, checkPlinkoCooldown, onlinePlayers } = deps;

    socket.on('plinko-drop', async (data) => { try {
        if (!checkRateLimit(socket, 5)) return;
        if (!checkPlinkoCooldown(socket.id)) {
            socket.emit('plinko-error', { message: 'Drop cooldown active. Try again.' });
            return;
        }

        const player = onlinePlayers.get(socket.id);
        if (!player || !player.name) {
            socket.emit('plinko-error', { message: 'Not logged in' });
            return;
        }

        const bet = Number(data?.bet);
        if (!Number.isInteger(bet) || !PLINKO_BETS.includes(bet)) {
            socket.emit('plinko-error', { message: 'Invalid bet amount' });
            return;
        }

        const risk = typeof data?.risk === 'string' && RISK_LEVELS.includes(data.risk)
            ? data.risk : 'medium';

        const balanceAfterBet = await deductBalance(player.name, bet, 'plinko_bet', { bet, risk });
        if (balanceAfterBet === null) {
            socket.emit('plinko-error', { message: 'Not enough coins' });
            return;
        }

        const { path, bucket } = dropBall();
        const payout = evaluate(bucket, risk, bet);
        const multiplier = PAYTABLE[risk][bucket];

        let finalBalance = balanceAfterBet;
        if (payout > 0) {
            const updated = await addBalance(player.name, payout, 'plinko_payout', {
                bet, risk, bucket, multiplier, payout
            });
            if (updated !== null) finalBalance = updated;
        }

        socket.emit('balance-update', { balance: finalBalance });
        socket.emit('plinko-result', {
            bet,
            risk,
            path,
            bucket,
            multiplier,
            payout,
            balance: finalBalance
        });
    } catch (err) {
        console.error('plinko-drop error:', err.message);
        socket.emit('plinko-error', { message: 'Drop failed. Try again.' });
    } });
}

export {
    PLINKO_BETS,
    PAYTABLE,
    ROWS,
    BUCKETS,
    RISK_LEVELS,
    dropBall,
    evaluate
};
