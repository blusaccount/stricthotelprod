import { describe, it, expect, vi, beforeEach } from 'vitest';

// Reentrancy regression tests for issue #152: strictly7s-spin read
// fs.remaining before the withWallet await and decremented it after the
// commit, so two concurrent spins during free spins both counted as free —
// a double-click printed gratis spins.

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

import { registerStrictly7sHandlers, freeSpinState } from '../handlers/strictly7s.js';

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

const settle = () => new Promise(r => setTimeout(r, 0));

function setup(name, { cooldown = () => true } = {}) {
    const socket = createMockSocket(`sock-${name}`);
    registerStrictly7sHandlers(socket, createMockIo(), {
        checkRateLimit: () => true,
        checkStrictly7sCooldown: cooldown,
        onlinePlayers: new Map([[socket.id, { name }]])
    });
    return socket;
}

beforeEach(() => {
    mockAddBalance.mockImplementation(async () => 1000);
    mockDeductBalance.mockImplementation(async () => 900);
    mockWithWallet.mockImplementation(async (fn) => fn(null));
});

describe('strictly7s-spin reentrancy (issue #152)', () => {
    it('the last free spin cannot be consumed twice — the duplicate becomes a paid spin', async () => {
        const name = `s7-player-${Math.random()}`;
        const socket = setup(name);
        freeSpinState.set(name, { remaining: 1, multiplier: 2, bet: 100, lastActiveAt: Date.now() });

        // Hold the wallet transaction open so the duplicate spin arrives
        // while the first free spin is still uncommitted.
        const txs = [];
        mockWithWallet.mockImplementation((fn) => {
            const d = deferred();
            txs.push(d);
            return d.promise.then(() => fn(null));
        });

        const first = socket.trigger('strictly7s-spin', { bet: 100 });
        const second = socket.trigger('strictly7s-spin', { bet: 100 });
        await settle();

        // Only one spin is inside the wallet; the duplicate is queued.
        expect(txs.length).toBe(1);
        txs[0].resolve();
        // The queued duplicate reaches the wallet only after the first spin
        // fully committed; release it as soon as it gets there.
        for (let i = 0; i < 20 && txs.length < 2; i++) await settle();
        expect(txs.length).toBe(2);
        txs[1].resolve();
        await Promise.all([first, second]);

        // The single free spin was consumed exactly once; the duplicate
        // re-read the (now empty) free-spin state and paid for its spin.
        const paidSpins = mockDeductBalance.mock.calls.filter(c => c[0] === name && c[2] === 'strictly7s_bet');
        expect(paidSpins.length).toBe(1);
        const results = socket.emits.filter(e => e.event === 'strictly7s-spin-result');
        expect(results.length).toBe(2);
        expect(results.filter(r => r.data.wasFreeSpin).length).toBe(1);
        freeSpinState.delete(name); // in case the paid spin randomly re-triggered
    });

    it('a double-click burst is collapsed to one spin by the in-lock cooldown', async () => {
        const name = `s7-player-${Math.random()}`;
        // Real cooldown semantics: first call passes, calls within the
        // window are rejected — now evaluated inside the lock, so the
        // queued duplicate is rejected instead of spinning again.
        let lastSpinAt = 0;
        const cooldown = () => {
            const now = Date.now();
            if (now - lastSpinAt < 1200) return false;
            lastSpinAt = now;
            return true;
        };
        const socket = setup(name, { cooldown });

        await Promise.all([
            socket.trigger('strictly7s-spin', { bet: 100 }),
            socket.trigger('strictly7s-spin', { bet: 100 })
        ]);

        const paidSpins = mockDeductBalance.mock.calls.filter(c => c[0] === name && c[2] === 'strictly7s_bet');
        expect(paidSpins.length).toBe(1);
        expect(socket.emits.filter(e => e.event === 'strictly7s-spin-result').length).toBe(1);
        expect(socket.emits.some(e =>
            e.event === 'strictly7s-error' && e.data.message === 'Spin cooldown active. Try again.'
        )).toBe(true);
    });
});
