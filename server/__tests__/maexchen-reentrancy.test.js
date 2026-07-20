import { describe, it, expect, vi, beforeEach } from 'vitest';

// Reentrancy regression tests for issue #152 in the Mäxchen room flow:
// - doubled place-bet read the same oldBet before the wallet await and
//   double-deducted;
// - place-bet vs. start-game could commit a deduct whose bet never reached
//   the pot;
// - challenge/believe-maexchen both awaited awardPotAndEndGame, which only
//   cleared room.game AFTER the payout await — a doubled event paid the
//   pot twice.

const { mockAddBalance, mockDeductBalance, mockGetBalance } = vi.hoisted(() => ({
    mockAddBalance: vi.fn(async () => 1000),
    mockDeductBalance: vi.fn(async () => 900),
    mockGetBalance: vi.fn(async () => 900)
}));

vi.mock('../currency.js', () => ({
    addBalance: mockAddBalance,
    deductBalance: mockDeductBalance,
    getBalance: mockGetBalance,
    withWallet: vi.fn(async (fn) => fn(null))
}));
vi.mock('../achievements.js', () => ({ bump: vi.fn(async () => []) }));
vi.mock('../activity-feed.js', () => ({ pushActivity: vi.fn() }));

import { registerMaexchenHandlers } from '../handlers/maexchen.js';
import { rooms, socketToRoom, awardPotAndEndGame } from '../room-manager.js';

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
    return { to: () => ({ emit: () => {} }), emit: () => {} };
}

function deferred() {
    let resolve;
    const promise = new Promise(r => { resolve = r; });
    return { promise, resolve };
}

const settle = () => new Promise(r => setTimeout(r, 0));

let roomSeq = 0;

function setupRoom() {
    const code = `RM${roomSeq++}`;
    const alice = createMockSocket(`sock-a-${code}`);
    const bob = createMockSocket(`sock-b-${code}`);
    const room = {
        code,
        hostId: alice.id,
        gameType: 'maexchen',
        players: [
            { socketId: alice.id, name: `alice-${code}`, character: null },
            { socketId: bob.id, name: `bob-${code}`, character: null }
        ],
        game: null
    };
    rooms.set(code, room);
    socketToRoom.set(alice.id, code);
    socketToRoom.set(bob.id, code);
    const io = createMockIo();
    const deps = { checkRateLimit: () => true, broadcastLobbies: vi.fn() };
    registerMaexchenHandlers(alice, io, deps);
    registerMaexchenHandlers(bob, io, deps);
    return { room, alice, bob, io };
}

beforeEach(() => {
    mockAddBalance.mockImplementation(async () => 1000);
    mockDeductBalance.mockImplementation(async () => 900);
});

describe('place-bet reentrancy (issue #152)', () => {
    it('a duplicate place-bet arriving during the wallet await deducts only once', async () => {
        const { room, alice } = setupRoom();

        const deducts = [];
        mockDeductBalance.mockImplementation(() => {
            const d = deferred();
            deducts.push(d);
            return d.promise;
        });

        const first = alice.trigger('place-bet', { amount: 100 });
        const second = alice.trigger('place-bet', { amount: 100 });
        await settle();

        // Only the first bet reached the wallet; the duplicate is queued.
        expect(deducts.length).toBe(1);
        deducts[0].resolve(900);
        await Promise.all([first, second]);

        const betDeducts = mockDeductBalance.mock.calls.filter(c => c[2] === 'maexchen_bet' && c[3].roomCode === room.code);
        expect(betDeducts.length).toBe(1);
        expect(room.bets[alice.id]).toBe(100);
    });

    it('a bet still mid-wallet-await when start-game arrives lands in the pot', async () => {
        const { room, alice, bob } = setupRoom();

        const deducts = [];
        mockDeductBalance.mockImplementation(() => {
            const d = deferred();
            deducts.push(d);
            return d.promise;
        });

        // Bob's bet is committed already; Alice's deduct is still in flight
        // when the host clicks start.
        mockDeductBalance.mockImplementationOnce(async () => 900);
        await bob.trigger('place-bet', { amount: 100 });

        const bet = alice.trigger('place-bet', { amount: 100 });
        const start = alice.trigger('start-game');
        await settle();

        deducts[0]?.resolve(900);
        await Promise.all([bet, start]);

        // start-game waited for the bet to commit: nothing was deducted
        // without reaching the pot.
        expect(room.game).not.toBe(null);
        expect(room.game.pot).toBe(200);
        expect(room.bets[alice.id]).toBe(100);
    });
});

describe('pot payout exactly-once (issue #152)', () => {
    function startedGame(room, alice, bob, pot = 200) {
        room.game = {
            players: [
                { socketId: alice.id, name: room.players[0].name, lives: 3, character: null },
                { socketId: bob.id, name: room.players[1].name, lives: 1, character: null }
            ],
            currentIndex: 0,
            // Bob announced 31 as 66 — a lie; Alice (current) may challenge.
            previousAnnouncement: {
                playerIndex: 1,
                playerName: room.players[1].name,
                value: 66,
                valueName: 'Pasch 6',
                actualRoll: { d1: 3, d2: 1, value: 31 }
            },
            isFirstTurn: false,
            currentRoll: null,
            hasRolled: false,
            pot
        };
    }

    it('a doubled challenge that ends the game pays the pot exactly once', async () => {
        const { room, alice, bob } = setupRoom();
        startedGame(room, alice, bob);
        const winnerName = room.players[0].name;

        const payout = deferred();
        mockAddBalance.mockImplementation(() => payout.promise);

        // Bob was lying and has one life: the challenge ends the game and
        // awards the pot. The duplicate lands while the payout is awaited.
        const first = alice.trigger('challenge');
        const second = alice.trigger('challenge');
        payout.resolve(1200);
        await Promise.all([first, second]);

        const potPayouts = mockAddBalance.mock.calls.filter(c => c[0] === winnerName && c[2] === 'maexchen_pot_win');
        expect(potPayouts.length).toBe(1);
        expect(room.game).toBe(null);
    });

    it('awardPotAndEndGame itself is idempotent across unlocked entry points', async () => {
        const { room, alice, bob } = setupRoom();
        startedGame(room, alice, bob);
        const winnerName = room.players[0].name;
        const alive = [room.game.players[0]];

        const payout = deferred();
        mockAddBalance.mockImplementation(() => payout.promise);

        // Simulates e.g. a disconnect path racing a challenge: both call the
        // payout helper directly; the capture-and-clear of room.game before
        // the await lets only one through.
        const io = createMockIo();
        const first = awardPotAndEndGame(io, room, winnerName, alive);
        const second = awardPotAndEndGame(io, room, winnerName, alive);
        payout.resolve(1200);
        await Promise.all([first, second]);

        const potPayouts = mockAddBalance.mock.calls.filter(c => c[0] === winnerName && c[2] === 'maexchen_pot_win');
        expect(potPayouts.length).toBe(1);
        expect(room.game).toBe(null);
    });
});
