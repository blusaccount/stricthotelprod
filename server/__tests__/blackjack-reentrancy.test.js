import { describe, it, expect, vi } from 'vitest';

// Reentrancy regression tests for issue #152: the bj-deal and bj-double
// prechecks used to run before the deductBalance await, so two fast events
// from the same player both passed them and double-deducted.

const { mockAddBalance, mockDeductBalance, mockGetBalance, mockWithWallet } = vi.hoisted(() => ({
    mockAddBalance: vi.fn(async () => 1000),
    mockDeductBalance: vi.fn(async () => 900),
    mockGetBalance: vi.fn(async () => 900),
    mockWithWallet: vi.fn(async (fn) => fn(null))
}));

vi.mock('../currency.js', () => ({
    addBalance: mockAddBalance,
    deductBalance: mockDeductBalance,
    getBalance: mockGetBalance,
    withWallet: mockWithWallet
}));
vi.mock('../achievements.js', () => ({ bump: vi.fn(async () => []) }));
vi.mock('../handlers/achievements.js', () => ({ notifyUnlocks: vi.fn() }));
vi.mock('../activity-feed.js', () => ({ pushActivity: vi.fn() }));

import { registerBlackjackHandlers, _setTestShoe } from '../handlers/blackjack.js';

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

// A shoe of nothing but fives: no naturals, no busts on the first draw, so
// hand flow is fully deterministic. ensureShoe() keeps it (>= 80 cards).
function stackShoeWithFives() {
    _setTestShoe(Array.from({ length: 100 }, () => ({ suit: 0, rank: 5 })));
}

function setup(name) {
    const socket = createMockSocket(`sock-${name}`);
    const io = createMockIo();
    registerBlackjackHandlers(socket, io, {
        checkRateLimit: () => true,
        onlinePlayers: new Map([[socket.id, { name }]])
    });
    return socket;
}

const settle = () => new Promise(r => setTimeout(r, 0));

describe('bj-deal reentrancy (issue #152)', () => {
    it('a duplicate deal arriving during the deduct await books only one bet', async () => {
        const name = `bj-player-${Math.random()}`;
        const socket = setup(name);
        stackShoeWithFives();

        // Make the first deduct hang so the second bj-deal arrives mid-await
        // — exactly the double-click / retry window from the issue.
        const deducts = [];
        mockDeductBalance.mockImplementation(() => {
            const d = deferred();
            deducts.push(d);
            return d.promise;
        });

        const first = socket.trigger('bj-deal', { bet: 100 });
        const second = socket.trigger('bj-deal', { bet: 100 });
        await settle();

        // Only the first deal may have reached the wallet; the duplicate is
        // queued behind the lock, not double-deducting.
        expect(deducts.length).toBe(1);

        deducts[0].resolve(900);
        await Promise.all([first, second]);

        const dealDeducts = mockDeductBalance.mock.calls.filter(c => c[0] === name && c[2] === 'blackjack_bet');
        expect(dealDeducts.length).toBe(1);
        // The duplicate was rejected against the now-existing hand.
        expect(socket.emits.some(e =>
            e.event === 'bj-error' && e.data.message === 'Finish your current hand first'
        )).toBe(true);
        // Exactly one live hand was created.
        expect(socket.emits.filter(e => e.event === 'bj-state-result').length).toBe(1);

        mockDeductBalance.mockImplementation(async () => 900);
    });
});

describe('bj-double reentrancy (issue #152)', () => {
    it('a duplicate double-down arriving during the deduct await books the stake only once', async () => {
        const name = `bj-player-${Math.random()}`;
        const socket = setup(name);
        stackShoeWithFives();

        // Deal a hand normally first (5,5 vs 5,5 — playable, 2 cards).
        mockDeductBalance.mockImplementation(async () => 900);
        await socket.trigger('bj-deal', { bet: 100 });
        socket.emits.length = 0;

        const deducts = [];
        mockDeductBalance.mockImplementation(() => {
            const d = deferred();
            deducts.push(d);
            return d.promise;
        });

        const first = socket.trigger('bj-double');
        const second = socket.trigger('bj-double');
        await settle();

        expect(deducts.length).toBe(1);
        deducts[0].resolve(800);
        await Promise.all([first, second]);

        const doubleDeducts = mockDeductBalance.mock.calls.filter(c => c[0] === name && c[2] === 'blackjack_double');
        expect(doubleDeducts.length).toBe(1);
        // The first double finished the hand; the duplicate found no active hand.
        expect(socket.emits.some(e =>
            e.event === 'bj-error' && e.data.message === 'No active hand'
        )).toBe(true);
        const finished = socket.emits.filter(e => e.event === 'bj-state-result' && e.data.finished);
        expect(finished.length).toBe(1);
        expect(finished[0].data.doubled).toBe(true);

        mockDeductBalance.mockImplementation(async () => 900);
    });

    it('hit and double arriving together resolve to exactly one action', async () => {
        const name = `bj-player-${Math.random()}`;
        const socket = setup(name);
        stackShoeWithFives();

        mockDeductBalance.mockImplementation(async () => 900);
        await socket.trigger('bj-deal', { bet: 100 });
        socket.emits.length = 0;

        // Hit lands first (5,5 -> 5,5,5 = 15, hand continues), the queued
        // double then fails its 2-card re-check instead of deducting.
        await Promise.all([socket.trigger('bj-hit'), socket.trigger('bj-double')]);

        const doubleDeducts = mockDeductBalance.mock.calls.filter(c => c[0] === name && c[2] === 'blackjack_double');
        expect(doubleDeducts.length).toBe(0);
        expect(socket.emits.some(e =>
            e.event === 'bj-error' && e.data.message === 'Can only double on first action'
        )).toBe(true);
    });
});
