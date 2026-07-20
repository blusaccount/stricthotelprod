import { describe, it, expect, beforeEach, vi } from 'vitest';

let recordDailyCompletion, getDailyRewardInfo;
let balances, addBalanceCalls;

beforeEach(async () => {
    vi.resetModules();

    // Force the in-memory path (no DATABASE_URL in CI). The DB path gets the
    // same idempotency from its conditional UPDATE; here we exercise the
    // per-player mutex that guards the memory fallback.
    vi.doMock('../db.js', () => ({
        isDatabaseEnabled: () => false,
        query: vi.fn(),
        withTransaction: vi.fn(),
    }));

    balances = new Map();
    addBalanceCalls = [];
    vi.doMock('../currency.js', () => ({
        addBalance: async (name, amount, reason, meta) => {
            addBalanceCalls.push({ name, amount, reason, meta });
            // Yield a microtask before committing the balance so any missing
            // serialization between concurrent completions would interleave
            // here and double-pay.
            await Promise.resolve();
            const current = balances.get(name) ?? 1000;
            const next = current + amount;
            balances.set(name, next);
            return next;
        },
    }));

    const mod = await import('../turkish-streaks.js');
    recordDailyCompletion = mod.recordDailyCompletion;
    getDailyRewardInfo = mod.getDailyRewardInfo;
});

describe('turkish-streaks reward math', () => {
    it('rewards 5 coins per streak day, capped at 50', () => {
        expect(getDailyRewardInfo(1).rewardCoins).toBe(5);
        expect(getDailyRewardInfo(5).rewardCoins).toBe(25);
        expect(getDailyRewardInfo(10).rewardCoins).toBe(50);
        expect(getDailyRewardInfo(20).rewardCoins).toBe(50);
    });
});

describe('turkish-streaks idempotent daily completion', () => {
    it('two parallel completion triggers pay the reward exactly once', async () => {
        const day = new Date('2026-07-20T10:00:00Z');

        const [a, b] = await Promise.all([
            recordDailyCompletion('alice', day),
            recordDailyCompletion('alice', day),
        ]);

        // Exactly one of the two triggers actually claims + pays.
        const paid = [a, b].filter(r => r.rewardCoins > 0);
        const skipped = [a, b].filter(r => r.alreadyCompleted);
        expect(paid).toHaveLength(1);
        expect(skipped).toHaveLength(1);

        // The one payout is the day-1 reward (5 coins), credited once only.
        expect(paid[0].rewardCoins).toBe(5);
        expect(paid[0].currentStreak).toBe(1);
        expect(addBalanceCalls).toHaveLength(1);
        expect(balances.get('alice')).toBe(1005);

        // The streak did not double-advance.
        expect(Math.max(a.currentStreak, b.currentStreak)).toBe(1);
    });

    it('a rapid second completion the same day is a no-op payout', async () => {
        const day = new Date('2026-07-20T10:00:00Z');

        const first = await recordDailyCompletion('bob', day);
        const second = await recordDailyCompletion('bob', day);

        expect(first.alreadyCompleted).toBe(false);
        expect(first.rewardCoins).toBe(5);
        expect(second.alreadyCompleted).toBe(true);
        expect(second.rewardCoins).toBe(0);

        expect(addBalanceCalls).toHaveLength(1);
        expect(balances.get('bob')).toBe(1005);
    });

    it('completing on a consecutive day advances the streak and pays again', async () => {
        const day1 = new Date('2026-07-20T10:00:00Z');
        const day2 = new Date('2026-07-21T10:00:00Z');

        const r1 = await recordDailyCompletion('carol', day1);
        const r2 = await recordDailyCompletion('carol', day2);

        expect(r1.currentStreak).toBe(1);
        expect(r1.rewardCoins).toBe(5);
        expect(r2.currentStreak).toBe(2);
        expect(r2.rewardCoins).toBe(10);

        expect(addBalanceCalls).toHaveLength(2);
        expect(balances.get('carol')).toBe(1015);
    });
});
