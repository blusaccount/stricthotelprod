import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockAddBalance, mockBump } = vi.hoisted(() => ({
    mockAddBalance: vi.fn(),
    mockBump: vi.fn(() => Promise.resolve())
}));

vi.mock('../currency.js', () => ({
    addBalance: mockAddBalance
}));

vi.mock('../achievements.js', () => ({
    bump: mockBump
}));

import {
    registerBrainVersusHandlers,
    cleanupBrainVersusOnDisconnect
} from '../handlers/brain-versus.js';
import { rooms, socketToRoom } from '../room-manager.js';

function createMockSocket(id) {
    const handlers = {};
    return {
        id,
        emit: vi.fn(),
        join: vi.fn(),
        leave: vi.fn(),
        on(event, fn) { handlers[event] = fn; },
        trigger(event, data) { return handlers[event]?.(data); }
    };
}

function createMockIo() {
    const emits = []; // { room, event, data }
    return {
        emits,
        to: vi.fn((room) => ({
            emit: (event, data) => emits.push({ room, event, data })
        }))
    };
}

// Score-updates from the same player are rate-limited to one per 150ms.
const tick = () => new Promise((r) => setTimeout(r, 160));

function setupMatch(gameId = 'math') {
    const io = createMockIo();
    const alice = createMockSocket('sock-A');
    const bob = createMockSocket('sock-B');
    const onlinePlayers = new Map([
        ['sock-A', { name: 'Alice' }],
        ['sock-B', { name: 'Bob' }]
    ]);
    const checkRateLimit = vi.fn(() => true);
    const deps = { checkRateLimit, onlinePlayers };

    registerBrainVersusHandlers(alice, io, deps);
    registerBrainVersusHandlers(bob, io, deps);

    alice.trigger('brain-versus-create', { playerName: 'Alice' });
    const code = alice.emit.mock.calls.find((c) => c[0] === 'brain-versus-created')[1].code;
    bob.trigger('brain-versus-join', { code, playerName: 'Bob' });
    alice.trigger('brain-versus-start', { gameId });

    return { io, alice, bob, code };
}

describe('brain-versus handlers', () => {
    beforeEach(() => {
        rooms.clear();
        socketToRoom.clear();
        mockAddBalance.mockReset();
        mockAddBalance.mockResolvedValue(100);
        mockBump.mockClear();
    });

    it('starts a match in the running state', () => {
        const { code } = setupMatch();
        const room = rooms.get(code);
        expect(room.game.status).toBe('running');
        expect(room.game.players.every((p) => p.score === 0 && !p.finished)).toBe(true);
    });

    describe('regular completion', () => {
        it('determines the winner from server-tracked scores and pays each player exactly once', async () => {
            const { io, alice, bob } = setupMatch('math');

            alice.trigger('brain-versus-score-update', { score: 1 });
            await tick();
            alice.trigger('brain-versus-score-update', { score: 2 });
            await tick();
            alice.trigger('brain-versus-score-update', { score: 3 });
            bob.trigger('brain-versus-score-update', { score: 1 });

            await alice.trigger('brain-versus-finished');
            await bob.trigger('brain-versus-finished');

            const aliceCalls = mockAddBalance.mock.calls.filter((c) => c[0] === 'Alice');
            const bobCalls = mockAddBalance.mock.calls.filter((c) => c[0] === 'Bob');
            expect(aliceCalls).toHaveLength(1);
            expect(aliceCalls[0][1]).toBe(20);
            expect(aliceCalls[0][2]).toBe('brain_versus_reward');
            expect(bobCalls).toHaveLength(1);
            expect(bobCalls[0][1]).toBe(5);

            const result = io.emits.find((e) => e.event === 'brain-versus-result');
            expect(result.data.winner).toBe('Alice');
            expect(result.data.isDraw).toBe(false);
            expect(mockBump).toHaveBeenCalledWith('Alice', 'brain_versus_wins', 1);
        });

        it('a draw pays both players the draw amount once', async () => {
            const { io, alice, bob } = setupMatch('math');

            alice.trigger('brain-versus-score-update', { score: 1 });
            bob.trigger('brain-versus-score-update', { score: 1 });

            await alice.trigger('brain-versus-finished');
            await bob.trigger('brain-versus-finished');

            expect(mockAddBalance.mock.calls.filter((c) => c[0] === 'Alice')).toHaveLength(1);
            expect(mockAddBalance.mock.calls.filter((c) => c[0] === 'Bob')).toHaveLength(1);
            for (const call of mockAddBalance.mock.calls) expect(call[1]).toBe(10);

            const result = io.emits.find((e) => e.event === 'brain-versus-result');
            expect(result.data.isDraw).toBe(true);
        });
    });

    describe('client-authoritative score exploit (#157)', () => {
        it('rejects an implausible score-update jump and ignores a forged finished payload', async () => {
            const { io, alice, bob } = setupMatch('math');

            // Alice never actually answers anything, but tries to fake a
            // huge score directly through the live-update channel.
            alice.trigger('brain-versus-score-update', { score: 99999 });
            bob.trigger('brain-versus-score-update', { score: 1 });

            // And again through the finished event — the handler doesn't
            // even read this payload anymore.
            await alice.trigger('brain-versus-finished', { score: 99999 });
            await bob.trigger('brain-versus-finished', { score: 0 });

            const result = io.emits.find((e) => e.event === 'brain-versus-result');
            expect(result.data.winner).toBe('Bob');
            expect(result.data.players.find((p) => p.name === 'Alice').score).toBe(0);
            expect(result.data.players.find((p) => p.name === 'Bob').score).toBe(1);

            const aliceCalls = mockAddBalance.mock.calls.filter((c) => c[0] === 'Alice');
            expect(aliceCalls[0][1]).toBe(5); // Alice loses, gets the loser payout only
        });

        it('a huge one-shot score-update is dropped, not clamped-and-accepted', () => {
            const { code, alice } = setupMatch('math');
            alice.trigger('brain-versus-score-update', { score: 9999 });
            const room = rooms.get(code);
            const player = room.game.players.find((p) => p.name === 'Alice');
            expect(player.score).toBe(0);
        });

        it('reaction: a player who never lands a valid click gets the worst-case score, not 0', async () => {
            const { io, alice, bob } = setupMatch('reaction');
            // Alice sends nothing (all timeouts in real play). Bob genuinely
            // lands one fast click.
            bob.trigger('brain-versus-score-update', { score: 300 });

            await alice.trigger('brain-versus-finished');
            await bob.trigger('brain-versus-finished');

            const result = io.emits.find((e) => e.event === 'brain-versus-result');
            expect(result.data.winner).toBe('Bob'); // lower ms wins in reaction
            expect(result.data.players.find((p) => p.name === 'Alice').score).toBe(10000);
        });
    });

    describe('duplicate forfeit payout (#156)', () => {
        it('pays the forfeit exactly once when leave and disconnect race on the same tab close', async () => {
            const { alice, bob, code, io } = setupMatch('math');
            const room = rooms.get(code);

            // Simulates a closed tab firing both 'brain-versus-leave' and the
            // socket 'disconnect' cleanup for the same in-progress match.
            const leaveDone = alice.trigger('brain-versus-leave');
            const disconnectDone = cleanupBrainVersusOnDisconnect(alice, room, io);
            await Promise.all([leaveDone, disconnectDone]);

            const forfeitPayouts = mockAddBalance.mock.calls.filter((c) => c[2] === 'brain_versus_forfeit');
            expect(forfeitPayouts).toHaveLength(1);
            expect(forfeitPayouts[0][0]).toBe('Bob');
            expect(forfeitPayouts[0][1]).toBe(20);

            const resultEmits = io.emits.filter((e) => e.event === 'brain-versus-result' && e.data.forfeit);
            expect(resultEmits).toHaveLength(1);

            expect(room.game).toBeNull();
        });

        it('disconnect cleanup alone still pays out a forfeit', async () => {
            const { alice, code, io } = setupMatch('math');
            const room = rooms.get(code);

            await cleanupBrainVersusOnDisconnect(alice, room, io);

            const forfeitPayouts = mockAddBalance.mock.calls.filter((c) => c[2] === 'brain_versus_forfeit');
            expect(forfeitPayouts).toHaveLength(1);
            expect(forfeitPayouts[0][0]).toBe('Bob');
        });

        it('leave alone still pays out a forfeit', async () => {
            const { alice, code, io } = setupMatch('math');
            const room = rooms.get(code);

            await alice.trigger('brain-versus-leave');

            const forfeitPayouts = mockAddBalance.mock.calls.filter((c) => c[2] === 'brain_versus_forfeit');
            expect(forfeitPayouts).toHaveLength(1);
            expect(forfeitPayouts[0][0]).toBe('Bob');
            expect(room.game).toBeNull();
        });

        it('does not pay a forfeit for a room with no active game', async () => {
            const { alice, code, io } = setupMatch('math');
            const room = rooms.get(code);
            room.game = null; // e.g. match already finished normally

            await cleanupBrainVersusOnDisconnect(alice, room, io);
            await alice.trigger('brain-versus-leave');

            const forfeitPayouts = mockAddBalance.mock.calls.filter((c) => c[2] === 'brain_versus_forfeit');
            expect(forfeitPayouts).toHaveLength(0);
        });
    });
});
