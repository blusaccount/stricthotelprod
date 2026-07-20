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
