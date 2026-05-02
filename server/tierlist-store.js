// ============== TIERLIST PERSISTENCE ==============

import { isDatabaseEnabled, query } from './db.js';

// In-memory fallback: weekKey -> Map<playerName, Map<itemIndex, tier>>
const memoryPlacements = new Map();


export async function upsertPlacement(playerName, weekKey, itemIndex, tier) {
    if (isDatabaseEnabled()) {
        try {
            await query(
                `INSERT INTO tierlist_placements (player_name, week_key, item_index, tier)
                 VALUES ($1, $2, $3, $4)
                 ON CONFLICT (player_name, week_key, item_index)
                 DO UPDATE SET tier = $4, placed_at = now()`,
                [playerName, weekKey, itemIndex, tier]
            );
        } catch (err) {
            console.error('[TierlistStore] upsertPlacement DB error:', err.message);
        }
    }
    // Always update in-memory (serves as cache and fallback)
    if (!memoryPlacements.has(weekKey)) memoryPlacements.set(weekKey, new Map());
    const weekData = memoryPlacements.get(weekKey);
    if (!weekData.has(playerName)) weekData.set(playerName, new Map());
    weekData.get(playerName).set(itemIndex, tier);
}

export async function removePlacement(playerName, weekKey, itemIndex) {
    if (isDatabaseEnabled()) {
        try {
            await query(
                'DELETE FROM tierlist_placements WHERE player_name = $1 AND week_key = $2 AND item_index = $3',
                [playerName, weekKey, itemIndex]
            );
        } catch (err) {
            console.error('[TierlistStore] removePlacement DB error:', err.message);
        }
    }
    const weekData = memoryPlacements.get(weekKey);
    if (weekData) {
        const playerData = weekData.get(playerName);
        if (playerData) {
            playerData.delete(itemIndex);
            if (playerData.size === 0) weekData.delete(playerName);
        }
    }
}

export async function getAllPlacementsForWeek(weekKey) {
    if (isDatabaseEnabled()) {
        try {
            const result = await query(
                'SELECT player_name, item_index, tier FROM tierlist_placements WHERE week_key = $1',
                [weekKey]
            );
            const placements = new Map();
            for (const row of result.rows) {
                if (!placements.has(row.player_name)) placements.set(row.player_name, new Map());
                placements.get(row.player_name).set(row.item_index, row.tier);
            }
            // Merge into memory cache
            memoryPlacements.set(weekKey, placements);
            return placements;
        } catch (err) {
            console.error('[TierlistStore] getAllPlacementsForWeek DB error:', err.message);
        }
    }
    return memoryPlacements.get(weekKey) || new Map();
}

// Clean old weeks from memory (keep last 4 weeks)
export function pruneOldWeeks(currentWeekKey) {
    if (memoryPlacements.size <= 4) return;
    const keys = Array.from(memoryPlacements.keys()).sort();
    while (keys.length > 4) {
        const old = keys.shift();
        if (old !== currentWeekKey) {
            memoryPlacements.delete(old);
        }
    }
}
