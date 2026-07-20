import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Mock the persistence layer with a controllable fake DB ───
//
// The fake DB models Postgres semantics closely enough to reproduce the
// hydrateWeek Cache/DB divergence (issue #161):
//   - writes (upsert/remove) land immediately, like a committed statement;
//   - getAllPlacementsForWeek captures its result set at call time (like a
//     SELECT's read snapshot) but its resolution can be gated on a deferred,
//     opening the exact window in which a concurrent place-item used to be
//     clobbered by the full cache overwrite.

let dbStore; // Map<weekKey, Map<playerName, Map<itemIndex, tier>>>
let hydrateGate; // { promise, resolve } | null — gates getAllPlacementsForWeek resolution

function dbWeek(weekKey) {
    if (!dbStore.has(weekKey)) dbStore.set(weekKey, new Map());
    return dbStore.get(weekKey);
}

vi.mock('../tierlist-store.js', () => ({
    upsertPlacement: vi.fn(async (playerName, weekKey, itemIndex, tier) => {
        const week = dbWeek(weekKey);
        if (!week.has(playerName)) week.set(playerName, new Map());
        week.get(playerName).set(itemIndex, tier);
    }),
    removePlacement: vi.fn(async (playerName, weekKey, itemIndex) => {
        const week = dbStore.get(weekKey);
        if (week && week.has(playerName)) {
            week.get(playerName).delete(itemIndex);
            if (week.get(playerName).size === 0) week.delete(playerName);
        }
    }),
    getAllPlacementsForWeek: vi.fn(async (weekKey) => {
        // Snapshot at call time (before any gated interleaving).
        const snapshot = new Map();
        const week = dbStore.get(weekKey);
        if (week) {
            for (const [name, items] of week) snapshot.set(name, new Map(items));
        }
        if (hydrateGate) await hydrateGate.promise;
        return snapshot;
    }),
    pruneOldWeeks: vi.fn()
}));

vi.mock('../achievements.js', () => ({ bump: vi.fn(async () => []) }));
vi.mock('../handlers/achievements.js', () => ({ notifyUnlocks: vi.fn() }));

const {
    registerTierlistHandlers,
    __getTierlistState,
    __resetTierlistState
} = await import('../handlers/tierlist.js');

// ─── Minimal socket.io test doubles ───

function makeDeferred() {
    let resolve;
    const promise = new Promise(r => { resolve = r; });
    return { promise, resolve };
}

// Captures broadcasts emitted via io.to(room).emit(...)
function makeIo(broadcasts) {
    return {
        to: () => ({
            emit: (event, payload) => { broadcasts.push({ event, payload }); }
        })
    };
}

// A fake socket that records its handlers so the test can invoke them, and
// registers the player in a shared onlinePlayers map.
function makeSocket(socketId, playerName, onlinePlayers) {
    onlinePlayers.set(socketId, { name: playerName });
    const handlers = {};
    const socket = {
        id: socketId,
        handlers,
        on: (event, fn) => { handlers[event] = fn; },
        join: () => {},
        leave: () => {},
        emit: () => {}
    };
    return socket;
}

const checkRateLimit = () => true;

// Recompute the community aggregation for one item straight from the
// authoritative cache — independent of the handler's own computation — so the
// assertion genuinely cross-checks "cache == what was broadcast".
function aggFromCache(weekKey, itemIndex) {
    const TIER_VALUES = { S: 6, A: 5, B: 4, C: 3, D: 2, F: 1 };
    const VALUE_TO_TIER = { 6: 'S', 5: 'A', 4: 'B', 3: 'C', 2: 'D', 1: 'F' };
    const weekData = __getTierlistState().weekCache.get(weekKey);
    const data = { S: 0, A: 0, B: 0, C: 0, D: 0, F: 0, total: 0 };
    if (weekData) {
        for (const [, placements] of weekData) {
            const tier = placements.get(itemIndex);
            if (tier) { data[tier]++; data.total++; }
        }
    }
    if (data.total > 0) {
        let sum = 0;
        for (const t of ['S', 'A', 'B', 'C', 'D', 'F']) sum += data[t] * TIER_VALUES[t];
        const avg = sum / data.total;
        data.avgTier = VALUE_TO_TIER[Math.max(1, Math.min(6, Math.round(avg)))];
        data.avgScore = Math.round(avg * 100) / 100;
    } else {
        data.avgTier = 'C';
        data.avgScore = 3;
    }
    return data;
}

function dbAggPlayers(weekKey, itemIndex) {
    const week = dbStore.get(weekKey);
    const players = [];
    if (week) {
        for (const [name, items] of week) {
            if (items.has(itemIndex)) players.push([name, items.get(itemIndex)]);
        }
    }
    return players.sort();
}

// Let queued microtasks drain so gated/locked continuations reach their await.
async function drainMicrotasks() {
    for (let i = 0; i < 10; i++) await Promise.resolve();
}

describe('Tierlist concurrency — cache/DB/broadcast consistency (#161)', () => {
    beforeEach(() => {
        dbStore = new Map();
        hydrateGate = null;
        __resetTierlistState();
        vi.clearAllMocks();
    });

    it('two parallel place-item ops on the same target converge to a state matching the broadcast', async () => {
        const onlinePlayers = new Map();
        const broadcasts = [];
        const io = makeIo(broadcasts);

        const socketA = makeSocket('sA', 'Alice', onlinePlayers);
        const socketB = makeSocket('sB', 'Bob', onlinePlayers);
        const socketC = makeSocket('sC', 'Carol', onlinePlayers);
        for (const s of [socketA, socketB, socketC]) {
            registerTierlistHandlers(s, io, { checkRateLimit, onlinePlayers });
        }

        // Gate the hydration DB read so it holds the per-week lock while two
        // place-item operations for the SAME item arrive concurrently. This is
        // precisely the window where the old full-overwrite dropped a
        // concurrently-placed item.
        hydrateGate = makeDeferred();

        const joinP = socketA.handlers['tierlist-join']();
        // Ensure the join has acquired the week lock (its hydrate read is now
        // parked on the gate) before the concurrent writes arrive.
        await drainMicrotasks();

        const placeBob = socketB.handlers['tierlist-place-item']({ itemIndex: 5, tier: 'S' });
        const placeCarol = socketC.handlers['tierlist-place-item']({ itemIndex: 5, tier: 'A' });
        await drainMicrotasks();

        // Release the hydration read; queued writes now run serialized.
        hydrateGate.resolve();
        await Promise.all([joinP, placeBob, placeCarol]);

        const weekKey = __getTierlistState().hydrated.values().next().value;

        // 1) Both placements survived in the authoritative cache and the DB.
        expect(dbAggPlayers(weekKey, 5)).toEqual([['Bob', 'S'], ['Carol', 'A']]);
        const cacheAgg = aggFromCache(weekKey, 5);
        expect(cacheAgg.total).toBe(2);
        expect(cacheAgg.S).toBe(1);
        expect(cacheAgg.A).toBe(1);

        // 2) The LAST community broadcast for item 5 matches the final cache
        //    state exactly — clients never saw something other than what is
        //    persisted and cached.
        const placedBroadcasts = broadcasts.filter(
            b => b.event === 'tierlist-item-placed' && b.payload.itemIndex === 5
        );
        expect(placedBroadcasts.length).toBe(2);
        const lastCommunity = placedBroadcasts[placedBroadcasts.length - 1].payload.community;
        expect(lastCommunity).toEqual(cacheAgg);
        expect(lastCommunity.rankerCount).toBeUndefined(); // sanity: community is the agg object

        // 3) Cache equals DB (single source of truth held): same players/tiers.
        const cachePlayers = [];
        for (const [name, items] of __getTierlistState().weekCache.get(weekKey)) {
            if (items.has(5)) cachePlayers.push([name, items.get(5)]);
        }
        expect(cachePlayers.sort()).toEqual(dbAggPlayers(weekKey, 5));
    });

    it('a place-item concurrent with an in-flight hydration is not lost to the cache overwrite', async () => {
        const onlinePlayers = new Map();
        const broadcasts = [];
        const io = makeIo(broadcasts);

        // Pre-seed the DB with an existing placement so hydration has real data
        // to load, then a fresh placement races the hydration.
        const socketA = makeSocket('sA', 'Alice', onlinePlayers);
        const socketB = makeSocket('sB', 'Bob', onlinePlayers);
        registerTierlistHandlers(socketA, io, { checkRateLimit, onlinePlayers });
        registerTierlistHandlers(socketB, io, { checkRateLimit, onlinePlayers });

        // Seed DB for the current week via a first place (no gate yet).
        await socketA.handlers['tierlist-place-item']({ itemIndex: 3, tier: 'B' });
        const weekKey = __getTierlistState().hydrated.values().next().value
            || dbStore.keys().next().value;

        // Force a re-hydration window: clear the hydrated flag and cache so the
        // next join reloads from DB, and gate that read.
        __resetTierlistState();
        onlinePlayers.set('sA', { name: 'Alice' });
        onlinePlayers.set('sB', { name: 'Bob' });
        hydrateGate = makeDeferred();

        const joinP = socketA.handlers['tierlist-join']();
        await drainMicrotasks();

        // Bob places a NEW item while hydration is parked on the gate.
        const placeBob = socketB.handlers['tierlist-place-item']({ itemIndex: 7, tier: 'S' });
        await drainMicrotasks();

        hydrateGate.resolve();
        await Promise.all([joinP, placeBob]);

        // Bob's placement must be present in the cache (not clobbered by the
        // hydration overwrite) and consistent with the DB.
        const cache = __getTierlistState().weekCache.get(weekKey);
        expect(cache.has('Bob')).toBe(true);
        expect(cache.get('Bob').get(7)).toBe('S');
        // The pre-existing seeded placement is still there too.
        expect(cache.get('Alice').get(3)).toBe('B');

        // Cache agg for item 7 matches the broadcast Bob's place emitted.
        const bobBroadcast = broadcasts.find(
            b => b.event === 'tierlist-item-placed' && b.payload.itemIndex === 7
        );
        expect(bobBroadcast).toBeDefined();
        expect(bobBroadcast.payload.community).toEqual(aggFromCache(weekKey, 7));
    });
});
