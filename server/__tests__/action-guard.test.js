import { describe, it, expect } from 'vitest';
import { actionKey, withActionLock, isActionLocked, claimOnce, releaseClaim } from '../lib/action-guard.js';

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

describe('actionKey', () => {
    it('joins game id and scope parts with colons', () => {
        expect(actionKey('blackjack', 'Anna')).toBe('blackjack:Anna');
        expect(actionKey('maexchen', 'ABCD')).toBe('maexchen:ABCD');
        expect(actionKey('crash', 'round', 7, 'Anna')).toBe('crash:round:7:Anna');
    });
});

describe('withActionLock', () => {
    it('runs callbacks for the same key strictly one after another', async () => {
        const key = `t-serial-${Math.random()}`;
        const events = [];
        const first = withActionLock(key, async () => {
            events.push('first-start');
            await sleep(30);
            events.push('first-end');
        });
        const second = withActionLock(key, async () => {
            events.push('second-start');
        });
        await Promise.all([first, second]);
        expect(events).toEqual(['first-start', 'first-end', 'second-start']);
    });

    it('lets the second caller observe state the first one committed after an await', async () => {
        // This is the exact TOCTOU shape from issue #152: check before an
        // await, write after it. Under the lock the duplicate re-checks
        // only after the original has fully committed.
        const key = `t-toctou-${Math.random()}`;
        const state = new Map();
        let deductions = 0;
        const placeBet = () => withActionLock(key, async () => {
            if (state.has('bet')) return 'duplicate';
            await sleep(10); // the balance await
            deductions++;
            state.set('bet', true);
            return 'placed';
        });
        const results = await Promise.all([placeBet(), placeBet()]);
        expect(results.sort()).toEqual(['duplicate', 'placed']);
        expect(deductions).toBe(1);
    });

    it('is FIFO across more than two waiters', async () => {
        const key = `t-fifo-${Math.random()}`;
        const order = [];
        await Promise.all([1, 2, 3, 4].map(n =>
            withActionLock(key, async () => {
                order.push(n);
                await sleep(5);
            })
        ));
        expect(order).toEqual([1, 2, 3, 4]);
    });

    it('does not serialize different keys against each other', async () => {
        const a = `t-a-${Math.random()}`;
        const b = `t-b-${Math.random()}`;
        const events = [];
        await Promise.all([
            withActionLock(a, async () => { events.push('a-start'); await sleep(30); events.push('a-end'); }),
            withActionLock(b, async () => { events.push('b-start'); })
        ]);
        // b ran while a was still inside its await.
        expect(events).toEqual(['a-start', 'b-start', 'a-end']);
    });

    it('returns the callback result and rethrows its errors', async () => {
        const key = `t-err-${Math.random()}`;
        await expect(withActionLock(key, async () => 42)).resolves.toBe(42);
        await expect(withActionLock(key, async () => { throw new Error('boom'); }))
            .rejects.toThrow('boom');
    });

    it('releases the lock after an error so the next caller still runs', async () => {
        const key = `t-err-release-${Math.random()}`;
        const failing = withActionLock(key, async () => { throw new Error('boom'); });
        const after = withActionLock(key, async () => 'ran');
        await expect(failing).rejects.toThrow('boom');
        await expect(after).resolves.toBe('ran');
        expect(isActionLocked(key)).toBe(false);
    });

    it('drops the map entry once the last waiter finishes (no leak)', async () => {
        const key = `t-cleanup-${Math.random()}`;
        expect(isActionLocked(key)).toBe(false);
        const p = withActionLock(key, async () => { await sleep(10); });
        expect(isActionLocked(key)).toBe(true);
        await p;
        expect(isActionLocked(key)).toBe(false);
    });
});

describe('claimOnce / releaseClaim', () => {
    it('grants the claim to exactly one of two synchronous callers', () => {
        const bet = { cashedAt: null };
        expect(claimOnce(bet, 'cashedAt', 2.5)).toBe(true);
        expect(claimOnce(bet, 'cashedAt', 2.5)).toBe(false);
        expect(bet.cashedAt).toBe(2.5);
    });

    it('defaults the claim value to true', () => {
        const round = {};
        expect(claimOnce(round, 'ended')).toBe(true);
        expect(round.ended).toBe(true);
    });

    it('rejects a claim on an already-truthy flag and on missing objects', () => {
        expect(claimOnce({ done: true }, 'done')).toBe(false);
        expect(claimOnce(null, 'done')).toBe(false);
        expect(claimOnce(undefined, 'done')).toBe(false);
    });

    it('releaseClaim reopens the flag for a later claim (failed-deduct rollback)', () => {
        const bet = {};
        expect(claimOnce(bet, 'pending')).toBe(true);
        releaseClaim(bet, 'pending');
        expect(bet.pending).toBe(null);
        expect(claimOnce(bet, 'pending')).toBe(true);
    });
});
