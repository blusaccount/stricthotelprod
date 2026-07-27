import { randomInt } from 'crypto';
import { addBalance, deductBalance, withWallet } from '../currency.js';
import { bump } from '../achievements.js';
import { notifyUnlocks } from './achievements.js';
import { STANDARD_CASINO_BETS, validateCasinoBet, emitToUser } from '../socket-utils.js';
import { pushActivity } from '../activity-feed.js';

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

const PLINKO_BETS = STANDARD_CASINO_BETS;
const ROWS = 12;
const BUCKETS = ROWS + 1;
const RISK_LEVELS = ['low', 'medium', 'high'];

// Multipliers for each bucket index (0..12). Symmetric around the middle.
const PAYTABLE = {
    low:    [9,    3,   1.4, 1.2, 1.1, 1,   0.5, 1,   1.1, 1.2, 1.4, 3,   9   ],
    medium: [27,   8,   2.5, 1.5, 1.1, 0.7, 0.5, 0.7, 1.1, 1.5, 2.5, 8,   27  ],
    high:   [200,  25,  7,   2,   0.4, 0.3, 0.3, 0.3, 0.4, 2,   7,   25,  200 ]
};

// Default step source: server-authoritative CSPRNG. Tests inject a seeded
// generator so Monte-Carlo assertions are reproducible; production never does.
const cryptoStep = () => randomInt(0, 2);

function dropBall(nextStep = cryptoStep) {
    // Returns the path as an array of 0/1 (length ROWS) and the resulting bucket.
    // nextStep must return 0 (left) or 1 (right).
    const path = [];
    let bucket = 0;
    for (let i = 0; i < ROWS; i++) {
        const step = nextStep();
        path.push(step);
        bucket += step;
    }
    return { path, bucket };
}

function evaluate(bucket, risk, bet) {
    // Floor (not round) so the house never gives away fractional SC.
    const multiplier = PAYTABLE[risk][bucket];
    return Math.floor(bet * multiplier);
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

        const bet = validateCasinoBet(data?.bet);
        if (bet === null) {
            socket.emit('plinko-error', { message: 'Invalid bet amount' });
            return;
        }

        const risk = typeof data?.risk === 'string' && RISK_LEVELS.includes(data.risk)
            ? data.risk : 'medium';

        // Deduct + ball drop + payout in one tx — see strictly7s for rationale.
        const dropResult = await withWallet(async (client) => {
            const balanceAfterBet = await deductBalance(player.name, bet, 'plinko_bet', { bet, risk }, client);
            if (balanceAfterBet === null) return { ok: false };

            const { path, bucket } = dropBall();
            const payout = evaluate(bucket, risk, bet);
            const multiplier = PAYTABLE[risk][bucket];

            let finalBalance = balanceAfterBet;
            if (payout > 0) {
                const updated = await addBalance(player.name, payout, 'plinko_payout', {
                    bet, risk, bucket, multiplier, payout
                }, client);
                if (updated !== null) finalBalance = updated;
            }
            return { ok: true, path, bucket, payout, multiplier, finalBalance };
        });

        if (!dropResult || !dropResult.ok) {
            socket.emit('plinko-error', { message: 'Not enough coins' });
            return;
        }

        const { path, bucket, payout, multiplier, finalBalance } = dropResult;

        // Achievement bumps
        const unlocks = [];
        unlocks.push(...await bump(player.name, 'plinko_drops', 1));
        // Edge buckets are 0 and 12 (highest multiplier on high risk).
        if (risk === 'high' && (bucket === 0 || bucket === 12)) {
            unlocks.push(...await bump(player.name, 'plinko_edge_hits', 1));
        }
        // Creative: middle bucket (6) on HIGH risk — the 0.3× rug.
        if (risk === 'high' && bucket === 6) {
            unlocks.push(...await bump(player.name, 'plinko_high_middle', 1));
        }
        if (typeof finalBalance === 'number') {
            unlocks.push(...await bump(player.name, 'max_balance', Math.floor(finalBalance), 'max'));
        }
        notifyUnlocks(io, onlinePlayers, player.name, unlocks);

        // Activity feed: 10× and bigger wins.
        if (multiplier >= 10 && payout >= bet * 10) {
            pushActivity({
                type: 'big_win', player: player.name,
                text: `Landed ${multiplier}× on Plinko (${risk}) for ${payout} SC`,
                icon: '🌀', color: multiplier >= 100 ? 'magenta' : 'gold',
                meta: { game: 'plinko', amount: payout, multiplier, risk, bucket }
            });
        }

        emitToUser(io, player.name, 'balance-update', { balance: finalBalance });
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
