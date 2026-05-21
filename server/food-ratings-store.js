// ============== FOOD GUESSR — RATINGS PERSISTENCE ==============
//
// Per-user smash/pass votes on dishes, identified by `dishKey` (the
// Wikipedia article slug). One vote per user per dish — re-voting
// updates the existing row.
//
// In-memory fallback so the rate / community-scrandle modes still work
// without a Postgres connection.

import { isDatabaseEnabled, query } from './db.js';

// In-memory fallback structures
// votes:        Map<dishKey, Map<playerName, rating>>
// playerVotes:  Map<playerName, Map<dishKey, rating>>
const memoryVotes = new Map();
const memoryPlayerVotes = new Map();

function getMemoryAgg(dishKey) {
    const m = memoryVotes.get(dishKey);
    if (!m) return { likes: 0, dislikes: 0, total: 0 };
    let likes = 0, dislikes = 0;
    for (const r of m.values()) {
        if (r === 1) likes++;
        else if (r === -1) dislikes++;
    }
    return { likes, dislikes, total: likes + dislikes };
}

function recordMemory(playerName, dishKey, rating) {
    if (!memoryVotes.has(dishKey)) memoryVotes.set(dishKey, new Map());
    memoryVotes.get(dishKey).set(playerName, rating);
    if (!memoryPlayerVotes.has(playerName)) memoryPlayerVotes.set(playerName, new Map());
    memoryPlayerVotes.get(playerName).set(dishKey, rating);
}

export async function recordVote(playerName, dishKey, rating) {
    if (rating !== 1 && rating !== -1) {
        throw new Error('Invalid rating: must be 1 (like) or -1 (dislike)');
    }
    if (!playerName || !dishKey) {
        throw new Error('playerName and dishKey are required');
    }

    if (isDatabaseEnabled()) {
        try {
            await query(
                `INSERT INTO food_ratings (player_name, dish_key, rating)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (player_name, dish_key)
                 DO UPDATE SET rating = $3, updated_at = now()`,
                [playerName, dishKey, rating]
            );
        } catch (err) {
            console.error('[FoodRatings] recordVote DB error:', err.message);
        }
    }
    recordMemory(playerName, dishKey, rating);
}

export async function getAggregates() {
    if (isDatabaseEnabled()) {
        try {
            const result = await query(
                `SELECT dish_key,
                        SUM(CASE WHEN rating = 1 THEN 1 ELSE 0 END)::int AS likes,
                        SUM(CASE WHEN rating = -1 THEN 1 ELSE 0 END)::int AS dislikes,
                        COUNT(*)::int AS total
                 FROM food_ratings
                 GROUP BY dish_key`
            );
            const map = {};
            for (const row of result.rows) {
                map[row.dish_key] = {
                    likes: Number(row.likes) || 0,
                    dislikes: Number(row.dislikes) || 0,
                    total: Number(row.total) || 0
                };
            }
            return map;
        } catch (err) {
            console.error('[FoodRatings] getAggregates DB error:', err.message);
        }
    }
    // Memory fallback
    const map = {};
    for (const dishKey of memoryVotes.keys()) {
        map[dishKey] = getMemoryAgg(dishKey);
    }
    return map;
}

export async function getPlayerVotes(playerName) {
    if (!playerName) return {};
    if (isDatabaseEnabled()) {
        try {
            const result = await query(
                'SELECT dish_key, rating FROM food_ratings WHERE player_name = $1',
                [playerName]
            );
            const map = {};
            for (const row of result.rows) {
                map[row.dish_key] = row.rating === 1 ? 1 : -1;
            }
            return map;
        } catch (err) {
            console.error('[FoodRatings] getPlayerVotes DB error:', err.message);
        }
    }
    const m = memoryPlayerVotes.get(playerName);
    if (!m) return {};
    const map = {};
    for (const [k, v] of m) map[k] = v;
    return map;
}
