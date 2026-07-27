import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Bets placed while a round is in flight (or during the crash reveal) are
// queued for the NEXT round instead of being rejected. The stake is deducted
// at queue time and the entry is promoted into round.bets when the next
// betting phase opens.

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
    pendingBets,
    startBettingPhase,
    stopCrashLoop,
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

const createMockIo = () => ({ to: () => ({ emit: () => {} }) });

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
const uniqueName = () => `crash-player-${Math.random()}`;

function startRunningRound(atMultiplier = 2.2, crashMultiplier = 10) {
    round.state = 'running';
    round.runningStartedAt = Date.now() - timeForMultiplier(atMultiplier);
    round.crashMultiplier = crashMultiplier;
    round.crashTime = timeForMultiplier(crashMultiplier);
}

const betDeducts = name =>
    mockDeductBalance.mock.calls.filter(c => c[0] === name && c[2] === 'crash_bet');
const refunds = name =>
    mockAddBalance.mock.calls.filter(c => c[0] === name && String(c[2]).includes('refund'));

beforeEach(() => {
    round.bets = new Map();
    round.id += 1;
    pendingBets.clear();
    mockAddBalance.mockClear();
    mockDeductBalance.mockClear();
    mockAddBalance.mockImplementation(async () => 1000);
    mockDeductBalance.mockImplementation(async () => 900);
});

afterEach(() => {
    // startBettingPhase() arms a real timer for the next phase.
    stopCrashLoop();
    pendingBets.clear();
});

describe('queueing a bet during a running round', () => {
    it('accepts the bet, deducts the stake, and holds it out of the live round', async () => {
        const name = uniqueName();
        const socket = setup(name);
        startRunningRound();

        await socket.trigger('crash-bet', { bet: 100 });

        expect(betDeducts(name).length).toBe(1);
        expect(pendingBets.get(name)?.bet).toBe(100);
        expect(round.bets.has(name)).toBe(false);

        const confirmed = socket.emits.find(e => e.event === 'crash-bet-confirmed');
        expect(confirmed).toBeDefined();
        expect(confirmed.data.queued).toBe(true);
        expect(confirmed.data.bet).toBe(100);
        expect(socket.emits.some(e => e.event === 'crash-error')).toBe(false);
    });

    it('is also accepted during the crash reveal', async () => {
        const name = uniqueName();
        const socket = setup(name);
        round.state = 'reveal';
        round.revealEndsAt = Date.now() + 4000;

        await socket.trigger('crash-bet', { bet: 25 });

        expect(pendingBets.get(name)?.bet).toBe(25);
        expect(socket.emits.find(e => e.event === 'crash-bet-confirmed').data.queued).toBe(true);
    });

    it('carries the auto-cashout target through to the next round', async () => {
        const name = uniqueName();
        const socket = setup(name);
        startRunningRound();

        await socket.trigger('crash-bet', { bet: 50, autoCashout: 2.5 });
        expect(pendingBets.get(name).autoCashout).toBe(2.5);

        startBettingPhase();
        expect(round.bets.get(name).autoCashout).toBe(2.5);
    });

    it('lets a player with a bet riding the current round queue one for the next', async () => {
        const name = uniqueName();
        const socket = setup(name);
        startRunningRound();
        // Already has money in the air on this round.
        round.bets.set(name, { socketId: socket.id, bet: 10, autoCashout: null, cashedAt: null, payout: 0 });

        await socket.trigger('crash-bet', { bet: 100 });

        expect(pendingBets.get(name)?.bet).toBe(100);
        expect(round.bets.get(name).bet).toBe(10);   // untouched
        expect(socket.emits.some(e => e.event === 'crash-error')).toBe(false);
    });

    it('rejects a second queued bet without deducting twice', async () => {
        const name = uniqueName();
        const socket = setup(name);
        startRunningRound();

        await socket.trigger('crash-bet', { bet: 100 });
        await socket.trigger('crash-bet', { bet: 500 });

        expect(betDeducts(name).length).toBe(1);
        expect(pendingBets.get(name).bet).toBe(100);
        expect(socket.emits.some(e =>
            e.event === 'crash-error' && e.data.message === 'Bet already queued for the next round'
        )).toBe(true);
    });

    it('books only one stake when a double-click races inside the deduct await', async () => {
        const name = uniqueName();
        const socket = setup(name);
        startRunningRound();

        const deducts = [];
        mockDeductBalance.mockImplementation(() => {
            const d = deferred();
            deducts.push(d);
            return d.promise;
        });

        const first = socket.trigger('crash-bet', { bet: 100 });
        const second = socket.trigger('crash-bet', { bet: 100 });
        await settle();

        expect(deducts.length).toBe(1);      // serialized by the per-player lock
        deducts[0].resolve(900);
        await Promise.all([first, second]);

        expect(betDeducts(name).length).toBe(1);
        expect(pendingBets.get(name).bet).toBe(100);
        expect(socket.emits.filter(e => e.event === 'crash-bet-confirmed').length).toBe(1);
    });

    it('does not queue anything when the player cannot afford the stake', async () => {
        const name = uniqueName();
        const socket = setup(name);
        startRunningRound();
        mockDeductBalance.mockImplementation(async () => null);

        await socket.trigger('crash-bet', { bet: 500 });

        expect(pendingBets.has(name)).toBe(false);
        expect(socket.emits.some(e =>
            e.event === 'crash-error' && e.data.message === 'Not enough coins'
        )).toBe(true);
    });
});

describe('promotion into the next round', () => {
    it('moves queued bets into round.bets without deducting again', async () => {
        const a = uniqueName();
        const b = uniqueName();
        const sa = setup(a);
        const sb = setup(b);
        startRunningRound();

        await sa.trigger('crash-bet', { bet: 100 });
        await sb.trigger('crash-bet', { bet: 25 });
        expect(pendingBets.size).toBe(2);

        const deductsBefore = mockDeductBalance.mock.calls.length;
        startBettingPhase();

        expect(round.state).toBe('betting');
        expect(round.bets.get(a).bet).toBe(100);
        expect(round.bets.get(b).bet).toBe(25);
        expect(pendingBets.size).toBe(0);
        expect(mockDeductBalance.mock.calls.length).toBe(deductsBefore);
    });

    it('leaves the promoted bet cashable — it is a normal bet once live', async () => {
        const name = uniqueName();
        const socket = setup(name);
        startRunningRound();
        await socket.trigger('crash-bet', { bet: 100 });

        startBettingPhase();
        const promoted = round.bets.get(name);
        expect(promoted.cashedAt).toBe(null);
        expect(promoted.payout).toBe(0);
        expect(promoted.socketId).toBe(socket.id);
    });

    it('does not re-promote the same bet into the round after that', async () => {
        const name = uniqueName();
        const socket = setup(name);
        startRunningRound();
        await socket.trigger('crash-bet', { bet: 100 });

        startBettingPhase();
        expect(round.bets.has(name)).toBe(true);
        startBettingPhase();                  // next round
        expect(round.bets.has(name)).toBe(false);
    });
});

describe('phase transitions during the deduct await', () => {
    it('refunds an immediate bet if betting closed while it was being deducted', async () => {
        const name = uniqueName();
        const socket = setup(name);
        round.state = 'betting';
        round.bettingEndsAt = Date.now() + 6000;

        const d = deferred();
        mockDeductBalance.mockImplementation(() => d.promise);

        const bet = socket.trigger('crash-bet', { bet: 100 });
        await settle();
        startRunningRound();                  // round closed under the await
        d.resolve(900);
        await bet;

        expect(round.bets.has(name)).toBe(false);
        expect(pendingBets.has(name)).toBe(false);
        expect(refunds(name).length).toBe(1);
        expect(socket.emits.some(e =>
            e.event === 'crash-error' && e.data.message === 'Betting closed before bet was confirmed'
        )).toBe(true);
    });

    it('places a queued bet straight into the live round if betting opened meanwhile', async () => {
        const name = uniqueName();
        const socket = setup(name);
        startRunningRound();

        const d = deferred();
        mockDeductBalance.mockImplementation(() => d.promise);

        const bet = socket.trigger('crash-bet', { bet: 100 });
        await settle();
        // The round this bet was meant for has just opened.
        round.state = 'betting';
        round.bettingEndsAt = Date.now() + 6000;
        d.resolve(900);
        await bet;

        expect(round.bets.get(name)?.bet).toBe(100);
        expect(pendingBets.has(name)).toBe(false);
        expect(refunds(name).length).toBe(0);
        const confirmed = socket.emits.find(e => e.event === 'crash-bet-confirmed');
        expect(confirmed.data.queued).toBe(false);
    });
});

describe('crash-state snapshot', () => {
    it('reports queued bets separately from live ones', async () => {
        const live = uniqueName();
        const queued = uniqueName();
        const sLive = setup(live);
        const sQueued = setup(queued);

        startRunningRound();
        round.bets.set(live, { socketId: sLive.id, bet: 10, autoCashout: null, cashedAt: null, payout: 0 });
        await sQueued.trigger('crash-bet', { bet: 100, autoCashout: 3 });

        sLive.trigger('crash-state');
        const snap = sLive.emits.find(e => e.event === 'crash-state').data;

        expect(snap.bets.map(b => b.name)).toEqual([live]);
        expect(snap.pending).toEqual([{ name: queued, bet: 100, autoCashout: 3 }]);
    });
});
