import { describe, it, expect, vi, beforeEach } from 'vitest';

// Reentrancy regression tests for issue #152:
// - crash-bet checked round.bets.has() before the deduct await and wrote
//   the bet entry after it — a double-click double-deducted and one stake
//   vanished (only one map entry survived).
// - Auto-cashout (tick loop) and manual crash-cashout can fire in the same
//   tick; the synchronous cashedAt claim in resolveCashout must collapse
//   them into exactly one payout.

const { mockAddBalance, mockDeductBalance } = vi.hoisted(() => ({
    mockAddBalance: vi.fn(async () => 1000),
    mockDeductBalance: vi.fn(async () => 900)
}));

vi.mock('../currency.js', () => ({
    addBalance: mockAddBalance,
    deductBalance: mockDeductBalance
}));
vi.mock('../achievements.js', () => ({ bump: vi.fn(async () => []) }));
vi.mock('../handlers/achievements.js', () => ({ notifyUnlocks: vi.fn() }));
vi.mock('../activity-feed.js', () => ({ pushActivity: vi.fn() }));

import {
    registerCrashHandlers,
    round,
    resolveCashout,
    timeForMultiplier
} from '../handlers/crash.js';

function createMockSocket(id) {
    const handlers = {};
    const emits = [];
    return {
        id,
        emits,
        emit(event, data) { emits.push({ event, data }); },
        on(event, fn) { handlers[event] = fn; },
        trigger(event, data) { return handlers[event]?.(data); }
    };
}

function createMockIo() {
    return { to: () => ({ emit: () => {} }) };
}

function deferred() {
    let resolve;
    const promise = new Promise(r => { resolve = r; });
    return { promise, resolve };
}

function setup(name) {
    const socket = createMockSocket(`sock-${name}`);
    registerCrashHandlers(socket, createMockIo(), {
        checkRateLimit: () => true,
        onlinePlayers: new Map([[socket.id, { name }]])
    });
    return socket;
}

const settle = () => new Promise(r => setTimeout(r, 0));

beforeEach(() => {
    round.bets = new Map();
    round.id += 1;
    mockAddBalance.mockImplementation(async () => 1000);
    mockDeductBalance.mockImplementation(async () => 900);
});

function startRunningRound(atMultiplier = 2.2, crashMultiplier = 10) {
    round.state = 'running';
    round.runningStartedAt = Date.now() - timeForMultiplier(atMultiplier);
    round.crashMultiplier = crashMultiplier;
    round.crashTime = timeForMultiplier(crashMultiplier);
}

describe('crash-bet reentrancy (issue #152)', () => {
    it('a duplicate bet arriving during the deduct await books only one stake', async () => {
        const name = `crash-player-${Math.random()}`;
        const socket = setup(name);
        round.state = 'betting';
        round.bettingEndsAt = Date.now() + 6000;

        const deducts = [];
        mockDeductBalance.mockImplementation(() => {
            const d = deferred();
            deducts.push(d);
            return d.promise;
        });

        const first = socket.trigger('crash-bet', { bet: 100 });
        const second = socket.trigger('crash-bet', { bet: 100 });
        await settle();

        // The duplicate is queued behind the lock, not double-deducting.
        expect(deducts.length).toBe(1);
        deducts[0].resolve(900);
        await Promise.all([first, second]);

        const betDeducts = mockDeductBalance.mock.calls.filter(c => c[0] === name && c[2] === 'crash_bet');
        expect(betDeducts.length).toBe(1);
        expect(round.bets.get(name)?.bet).toBe(100);
        expect(socket.emits.filter(e => e.event === 'crash-bet-confirmed').length).toBe(1);
        expect(socket.emits.some(e =>
            e.event === 'crash-error' && e.data.message === 'Bet already placed for this round'
        )).toBe(true);
    });
});

describe('crash cash-out exactly-once (issue #152)', () => {
    it('auto-cashout and manual cashout in the same tick pay out exactly once (auto first)', async () => {
        const name = `crash-player-${Math.random()}`;
        const socket = setup(name);
        startRunningRound(2.2);
        round.bets.set(name, { socketId: socket.id, bet: 100, autoCashout: 2.0, cashedAt: null, payout: 0 });

        const payout = deferred();
        mockAddBalance.mockImplementation(() => payout.promise);

        // Tick loop resolves the auto-cashout; the player's manual cashout
        // lands while the auto payout is still awaiting addBalance.
        const auto = resolveCashout(name, 2.0, true);
        const manual = socket.trigger('crash-cashout');

        payout.resolve(1100);
        const [autoResult] = await Promise.all([auto, manual]);

        const payouts = mockAddBalance.mock.calls.filter(c => c[0] === name && c[2] === 'crash_payout');
        expect(payouts.length).toBe(1);
        expect(autoResult).toEqual({ multiplier: 2.0, payout: 200, balance: 1100 });
        const b = round.bets.get(name);
        expect(b.cashedAt).toBe(2.0);
        expect(b.payout).toBe(200);
        expect(b.isAuto).toBe(true);
        // The manual path was told the bet is already cashed out.
        expect(socket.emits.some(e =>
            e.event === 'crash-error' && e.data.message === 'Already cashed out'
        )).toBe(true);
        expect(socket.emits.some(e => e.event === 'crash-cashout-confirmed')).toBe(false);
    });

    it('manual cashout first: the auto sweep then skips the claimed bet', async () => {
        const name = `crash-player-${Math.random()}`;
        const socket = setup(name);
        startRunningRound(2.2);
        round.bets.set(name, { socketId: socket.id, bet: 100, autoCashout: 2.0, cashedAt: null, payout: 0 });

        const payout = deferred();
        mockAddBalance.mockImplementation(() => payout.promise);

        const manual = socket.trigger('crash-cashout');
        await settle(); // manual handler claims the bet, then awaits addBalance

        // The tick loop's guard (!b.cashedAt) and the claim both reject now.
        const b = round.bets.get(name);
        expect(b.cashedAt).toBeGreaterThan(1);
        const auto = await resolveCashout(name, 2.0, true);
        expect(auto).toBe(null);

        payout.resolve(1100);
        await manual;

        const payouts = mockAddBalance.mock.calls.filter(c => c[0] === name && c[2] === 'crash_payout');
        expect(payouts.length).toBe(1);
        expect(b.isAuto).toBe(false);
        expect(socket.emits.some(e => e.event === 'crash-cashout-confirmed')).toBe(true);
    });

    it('a doubled manual cashout pays out exactly once', async () => {
        const name = `crash-player-${Math.random()}`;
        const socket = setup(name);
        startRunningRound(2.2);
        round.bets.set(name, { socketId: socket.id, bet: 100, autoCashout: null, cashedAt: null, payout: 0 });

        const payout = deferred();
        mockAddBalance.mockImplementation(() => payout.promise);

        const first = socket.trigger('crash-cashout');
        const second = socket.trigger('crash-cashout');
        payout.resolve(1100);
        await Promise.all([first, second]);

        const payouts = mockAddBalance.mock.calls.filter(c => c[0] === name && c[2] === 'crash_payout');
        expect(payouts.length).toBe(1);
        expect(socket.emits.filter(e => e.event === 'crash-cashout-confirmed').length).toBe(1);
        expect(socket.emits.some(e =>
            e.event === 'crash-error' && e.data.message === 'Already cashed out'
        )).toBe(true);
    });
});
