import {
    upsertPlacement,
    removePlacement,
    getAllPlacementsForWeek,
    pruneOldWeeks
} from '../tierlist-store.js';
import { bump } from '../achievements.js';
import { notifyUnlocks } from './achievements.js';

const TIERLIST_ROOM = 'tierlist-room';
const VALID_TIERS = ['S', 'A', 'B', 'C', 'D', 'F'];
const TIER_VALUES = { S: 6, A: 5, B: 4, C: 3, D: 2, F: 1 };
const VALUE_TO_TIER = { 6: 'S', 5: 'A', 4: 'B', 3: 'C', 2: 'D', 1: 'F' };
const MAX_ITEMS = 30;

// Module-level state
const tierlistState = {
    listeners: new Map(), // socketId -> playerName
    // Cache: weekKey -> Map<playerName, Map<itemIndex, tier>>
    weekCache: new Map(),
    hydrated: new Set() // set of weekKeys that have been hydrated from DB
};

// Per-week mutex serializing every state transition (hydrate / place / remove)
// for a given week. Mirrors `withStockTradeLock` (Fix #160): the cache is the
// single source of truth for reads/broadcasts, but a check-then-act without a
// lock lets `hydrateWeek`'s cache overwrite drop a concurrently-placed item
// (DB has it, cache doesn't, `hydrated` stays set → divergence until restart)
// and lets two concurrent writes broadcast a state that differs from what the
// cache ends up holding. Running each transition to completion under this lock
// keeps DB, cache, and broadcast in lockstep. Keyed on weekKey (not playerName)
// because the community aggregation spans all players of the week.
const weekLocks = new Map(); // weekKey -> Promise

async function withWeekLock(weekKey, fn) {
    while (weekLocks.has(weekKey)) {
        await weekLocks.get(weekKey);
    }

    let resolve;
    const lockPromise = new Promise(r => { resolve = r; });
    weekLocks.set(weekKey, lockPromise);

    try {
        return await fn();
    } finally {
        weekLocks.delete(weekKey);
        resolve();
    }
}

// ─── Week Key (must match client-side algorithm) ───

function getWeekKey() {
    var d = new Date();
    var day = d.getUTCDay();
    var diff = (day === 0 ? -6 : 1) - day;
    var monday = new Date(d);
    monday.setUTCDate(d.getUTCDate() + diff);
    monday.setUTCHours(0, 0, 0, 0);

    var year = monday.getUTCFullYear();
    var janFourth = new Date(Date.UTC(year, 0, 4));
    var daysSinceJan4 = Math.floor((monday - janFourth) / 86400000);
    var weekNum = Math.ceil((daysSinceJan4 + janFourth.getUTCDay()) / 7);
    if (weekNum < 1) {
        year--;
        weekNum = 52;
    }

    return year + '-W' + (weekNum < 10 ? '0' : '') + weekNum;
}

function getNextMondayUTC() {
    var d = new Date();
    var day = d.getUTCDay();
    var daysUntilMonday = (day === 0 ? 1 : 8 - day);
    var nextMonday = new Date(d);
    nextMonday.setUTCDate(d.getUTCDate() + daysUntilMonday);
    nextMonday.setUTCHours(0, 0, 0, 0);
    return nextMonday.getTime();
}

// ─── Community Aggregation ───

function computeCommunityAgg(weekKey) {
    const weekData = tierlistState.weekCache.get(weekKey);
    if (!weekData) return {};

    const agg = {};

    for (const [, placements] of weekData) {
        for (const [itemIndex, tier] of placements) {
            if (!agg[itemIndex]) {
                agg[itemIndex] = { S: 0, A: 0, B: 0, C: 0, D: 0, F: 0, total: 0 };
            }
            agg[itemIndex][tier]++;
            agg[itemIndex].total++;
        }
    }

    // Compute average tier
    for (const data of Object.values(agg)) {
        let sum = 0;
        for (const tier of VALID_TIERS) {
            sum += data[tier] * TIER_VALUES[tier];
        }
        const avg = sum / data.total;
        const rounded = Math.max(1, Math.min(6, Math.round(avg)));
        data.avgTier = VALUE_TO_TIER[rounded];
        data.avgScore = Math.round(avg * 100) / 100;
    }

    return agg;
}

function computeSingleItemAgg(weekKey, itemIndex) {
    const weekData = tierlistState.weekCache.get(weekKey);
    if (!weekData) return { S: 0, A: 0, B: 0, C: 0, D: 0, F: 0, total: 0, avgTier: 'C', avgScore: 3 };

    const data = { S: 0, A: 0, B: 0, C: 0, D: 0, F: 0, total: 0 };

    for (const [, placements] of weekData) {
        const tier = placements.get(itemIndex);
        if (tier) {
            data[tier]++;
            data.total++;
        }
    }

    if (data.total > 0) {
        let sum = 0;
        for (const tier of VALID_TIERS) {
            sum += data[tier] * TIER_VALUES[tier];
        }
        const avg = sum / data.total;
        const rounded = Math.max(1, Math.min(6, Math.round(avg)));
        data.avgTier = VALUE_TO_TIER[rounded];
        data.avgScore = Math.round(avg * 100) / 100;
    } else {
        data.avgTier = 'C';
        data.avgScore = 3;
    }

    return data;
}

// ─── Hydrate week from DB ───

async function hydrateWeek(weekKey) {
    if (tierlistState.hydrated.has(weekKey)) return;
    await withWeekLock(weekKey, async () => {
        // Re-check inside the lock: another join may have hydrated while we
        // were queued behind it.
        if (tierlistState.hydrated.has(weekKey)) return;

        const placements = await getAllPlacementsForWeek(weekKey);

        // Merge into the existing cache instead of overwriting it wholesale, so
        // any placement written before this hydration acquired the lock is
        // preserved rather than clobbered.
        const existing = tierlistState.weekCache.get(weekKey);
        if (!existing) {
            tierlistState.weekCache.set(weekKey, placements);
        } else {
            for (const [playerName, itemMap] of placements) {
                if (!existing.has(playerName)) existing.set(playerName, new Map());
                const target = existing.get(playerName);
                for (const [itemIndex, tier] of itemMap) {
                    target.set(itemIndex, tier);
                }
            }
        }

        tierlistState.hydrated.add(weekKey);
        pruneOldWeeks(weekKey);
    });
}

// Ensure week exists in cache
function ensureWeekCache(weekKey) {
    if (!tierlistState.weekCache.has(weekKey)) {
        tierlistState.weekCache.set(weekKey, new Map());
    }
}

// ─── Handler Registration ───

export function registerTierlistHandlers(socket, io, { checkRateLimit, onlinePlayers }) {

    socket.on('tierlist-join', async () => { try {
        if (!checkRateLimit(socket, 5)) return;

        const player = onlinePlayers.get(socket.id);
        const playerName = player?.name || '';
        if (!playerName) return;

        const weekKey = getWeekKey();

        socket.join(TIERLIST_ROOM);
        tierlistState.listeners.set(socket.id, playerName);

        // Hydrate from DB if needed
        await hydrateWeek(weekKey);

        // Get this player's placements
        const myPlacements = {};
        const weekData = tierlistState.weekCache.get(weekKey);
        if (weekData && weekData.has(playerName)) {
            for (const [idx, tier] of weekData.get(playerName)) {
                myPlacements[idx] = tier;
            }
        }

        // Compute community aggregation
        const community = computeCommunityAgg(weekKey);
        const rankerCount = weekData ? weekData.size : 0;

        // Send sync to joining client
        socket.emit('tierlist-sync', {
            weekKey: weekKey,
            myPlacements: myPlacements,
            community: community,
            rankerCount: rankerCount,
            listeners: Array.from(tierlistState.listeners.values()),
            weekEndsAt: getNextMondayUTC()
        });

        // Broadcast updated listener list
        io.to(TIERLIST_ROOM).emit('tierlist-listeners', {
            listeners: Array.from(tierlistState.listeners.values()),
            count: tierlistState.listeners.size
        });

        console.log(`[Tierlist] ${playerName} joined (${tierlistState.listeners.size} listeners)`);
    } catch (err) { console.error('tierlist-join error:', err.message); } });

    socket.on('tierlist-leave', () => { try {
        if (!checkRateLimit(socket, 5)) return;

        const playerName = tierlistState.listeners.get(socket.id) || 'Guest';
        socket.leave(TIERLIST_ROOM);
        tierlistState.listeners.delete(socket.id);

        io.to(TIERLIST_ROOM).emit('tierlist-listeners', {
            listeners: Array.from(tierlistState.listeners.values()),
            count: tierlistState.listeners.size
        });

        console.log(`[Tierlist] ${playerName} left (${tierlistState.listeners.size} listeners)`);
    } catch (err) { console.error('tierlist-leave error:', err.message); } });

    socket.on('tierlist-place-item', async (data) => { try {
        if (!checkRateLimit(socket, 10)) return;

        const player = onlinePlayers.get(socket.id);
        const playerName = player?.name || '';
        if (!playerName) return;

        // Validate
        const itemIndex = Number(data?.itemIndex);
        const tier = String(data?.tier || '');
        if (!Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex >= MAX_ITEMS) return;
        if (!VALID_TIERS.includes(tier)) return;

        const weekKey = getWeekKey();

        // Persist + cache mutation + aggregation + broadcast run to completion
        // under the per-week lock so the emitted community aggregation always
        // matches what is persisted and cached (no interleaving with a
        // concurrent place/remove or an in-flight hydration).
        await withWeekLock(weekKey, async () => {
            ensureWeekCache(weekKey);

            // Persist
            await upsertPlacement(playerName, weekKey, itemIndex, tier);

            // Update in-memory cache
            const weekData = tierlistState.weekCache.get(weekKey);
            if (!weekData.has(playerName)) weekData.set(playerName, new Map());
            weekData.get(playerName).set(itemIndex, tier);

            // Compute updated aggregation for this item
            const itemAgg = computeSingleItemAgg(weekKey, itemIndex);
            const rankerCount = weekData.size;

            // Broadcast to all
            io.to(TIERLIST_ROOM).emit('tierlist-item-placed', {
                itemIndex: itemIndex,
                tier: tier,
                playerName: playerName,
                community: itemAgg,
                rankerCount: rankerCount
            });
        });

        // Achievement
        const unlocks = await bump(playerName, 'tierlist_placements', 1);
        notifyUnlocks(io, onlinePlayers, playerName, unlocks);

    } catch (err) { console.error('tierlist-place-item error:', err.message); } });

    socket.on('tierlist-remove-item', async (data) => { try {
        if (!checkRateLimit(socket, 10)) return;

        const player = onlinePlayers.get(socket.id);
        const playerName = player?.name || '';
        if (!playerName) return;

        const itemIndex = Number(data?.itemIndex);
        if (!Number.isInteger(itemIndex) || itemIndex < 0 || itemIndex >= MAX_ITEMS) return;

        const weekKey = getWeekKey();

        // Same per-week lock as place-item so removal, its cache mutation, and
        // the broadcast aggregation stay atomic w.r.t. concurrent transitions.
        await withWeekLock(weekKey, async () => {
            ensureWeekCache(weekKey);

            // Persist removal
            await removePlacement(playerName, weekKey, itemIndex);

            // Update in-memory cache
            const weekData = tierlistState.weekCache.get(weekKey);
            if (weekData && weekData.has(playerName)) {
                weekData.get(playerName).delete(itemIndex);
                if (weekData.get(playerName).size === 0) weekData.delete(playerName);
            }

            // Compute updated aggregation for this item
            const itemAgg = computeSingleItemAgg(weekKey, itemIndex);
            const rankerCount = weekData ? weekData.size : 0;

            // Broadcast
            io.to(TIERLIST_ROOM).emit('tierlist-item-removed', {
                itemIndex: itemIndex,
                playerName: playerName,
                community: itemAgg,
                rankerCount: rankerCount
            });
        });

    } catch (err) { console.error('tierlist-remove-item error:', err.message); } });
}

// ─── Test hooks ───
// Exposed for unit tests to inspect the authoritative cache and reset the
// module-level state between cases. Not used by production code.
export function __getTierlistState() {
    return tierlistState;
}

export function __resetTierlistState() {
    tierlistState.listeners.clear();
    tierlistState.weekCache.clear();
    tierlistState.hydrated.clear();
    weekLocks.clear();
}

export function cleanupTierlistOnDisconnect(socketId, io) {
    if (tierlistState.listeners.has(socketId)) {
        tierlistState.listeners.delete(socketId);
        io.to(TIERLIST_ROOM).emit('tierlist-listeners', {
            listeners: Array.from(tierlistState.listeners.values()),
            count: tierlistState.listeners.size
        });
    }
}
