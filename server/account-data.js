// Everything one player's data touches, in one place.
//
// This module exists because the answer to "what belongs to this player" was
// previously scattered across seventeen tables and three different foreign
// keys, and the retention job got it wrong: it deleted the player row and left
// their Pictochat strokes and messages behind, still carrying their name.
//
// Both GDPR duties are served from the same map, so a table added to one is
// automatically covered by the other:
//   Art. 15 — export everything held about a person
//   Art. 17 — delete it
//
// Three kinds of table:
//   CASCADING     keyed by players.id, removed by `on delete cascade`
//   NAME_KEYED    keyed by player_name, deleted explicitly
//   AUTHORED      shared content keyed by author_name (see below)

import { isDatabaseEnabled, query } from './db.js';

// Deleted alongside the player.
export const NAME_KEYED_TABLES = [
    'tierlist_placements',
    'food_ratings',
    'food_scrandle_streaks',
    'food_classic_scores',
];

// Content on a shared surface. A stroke on the collaborative canvas is a mark
// somebody else's drawing may be built on, so the name is stripped rather than
// the artwork torn up — the name is the personal datum, the pixels are not.
// Chat messages are different: the message *is* the person speaking, so those
// go entirely.
export const ANONYMISED_TABLES = [
    { table: 'picto_strokes', column: 'author_name' },
];
export const AUTHORED_DELETE_TABLES = [
    { table: 'picto_messages', column: 'author_name' },
];

// Marker left behind on anonymised rows. Not a name anyone can register:
// sanitizeName strips angle brackets, so this can never collide with a player.
export const ANONYMOUS_AUTHOR = '<deleted>';

// Read for export. Keyed by players.id unless noted.
const EXPORT_QUERIES = [
    ['player', 'select name, balance, diamonds, created_at, updated_at, last_seen_at, discord_username from players where id = $1'],
    ['stock_positions', 'select symbol, shares, avg_cost from stock_positions where player_id = $1'],
    ['wallet_ledger', 'select delta, reason, metadata, created_at from wallet_ledger where player_id = $1 order by created_at'],
    ['turkish_streaks', 'select * from turkish_streaks where player_id = $1'],
    ['brain_leaderboards', 'select best_brain_age, updated_at from brain_leaderboards where player_id = $1'],
    ['brain_game_leaderboards', 'select game_id, best_score, updated_at from brain_game_leaderboards where player_id = $1'],
    ['daily_streaks', 'select * from daily_streaks where player_id = $1'],
    ['achievements', 'select achievement_id, unlocked_at from achievements where player_id = $1 order by unlocked_at'],
    ['achievement_progress', 'select counter_id, value from achievement_progress where player_id = $1'],
];

const EXPORT_QUERIES_BY_NAME = [
    ['tierlist_placements', 'select week_key, item_index, tier from tierlist_placements where player_name = $1'],
    ['food_ratings', 'select dish_key, rating from food_ratings where player_name = $1'],
    ['food_scrandle_streaks', 'select variant, best_streak, total_runs from food_scrandle_streaks where player_name = $1'],
    ['food_classic_scores', 'select * from food_classic_scores where player_name = $1'],
    ['picto_messages', 'select message, created_at from picto_messages where author_name = $1 order by created_at'],
    ['picto_strokes', 'select stroke_id, tool, color, size, created_at from picto_strokes where author_name = $1 order by created_at'],
];

async function playerId(name) {
    const r = await query('select id from players where name = $1', [name]);
    return r.rows[0]?.id ?? null;
}

/**
 * Everything held about one player, for an Art. 15 request.
 * @returns {Promise<object|null>} null when the player does not exist.
 */
export async function exportPlayerData(name) {
    if (!isDatabaseEnabled()) return null;
    const id = await playerId(name);
    if (id === null) return null;

    const out = {
        exportedAt: new Date().toISOString(),
        note: 'Alle zu diesem Spielernamen gespeicherten Daten. Die Spielwaehrung hat keinen Geldwert.',
    };

    for (const [key, sql] of EXPORT_QUERIES) {
        const r = await query(sql, [id]);
        out[key] = key === 'player' ? (r.rows[0] || null) : r.rows;
    }
    for (const [key, sql] of EXPORT_QUERIES_BY_NAME) {
        const r = await query(sql, [name]);
        out[key] = r.rows;
    }
    return out;
}

/**
 * Delete a player and everything attached, for an Art. 17 request or the
 * dormant-account job.
 *
 * One transaction: a half-deleted player is worse than an un-deleted one,
 * because the rows that do not cascade would be left pointing at nothing.
 *
 * @returns {Promise<{deleted: boolean, anonymisedStrokes: number}>}
 */
export async function deletePlayerData(name) {
    if (!isDatabaseEnabled()) return { deleted: false, anonymisedStrokes: 0 };

    await query('begin');
    try {
        for (const table of NAME_KEYED_TABLES) {
            await query(`delete from ${table} where player_name = $1`, [name]);
        }
        for (const { table, column } of AUTHORED_DELETE_TABLES) {
            await query(`delete from ${table} where ${column} = $1`, [name]);
        }
        let anonymisedStrokes = 0;
        for (const { table, column } of ANONYMISED_TABLES) {
            const r = await query(
                `update ${table} set ${column} = $2 where ${column} = $1`,
                [name, ANONYMOUS_AUTHOR]
            );
            anonymisedStrokes += r.rowCount || 0;
        }
        // Last, so the cascade fires with everything else already handled.
        const r = await query('delete from players where name = $1', [name]);
        await query('commit');
        return { deleted: (r.rowCount || 0) > 0, anonymisedStrokes };
    } catch (err) {
        await query('rollback').catch(() => {});
        throw err;
    }
}

/** Same as deletePlayerData but for a batch, used by the retention job. */
export async function deletePlayersData(names) {
    if (!isDatabaseEnabled() || names.length === 0) {
        return { deleted: 0, anonymisedStrokes: 0 };
    }

    await query('begin');
    try {
        for (const table of NAME_KEYED_TABLES) {
            await query(`delete from ${table} where player_name = any($1::text[])`, [names]);
        }
        for (const { table, column } of AUTHORED_DELETE_TABLES) {
            await query(`delete from ${table} where ${column} = any($1::text[])`, [names]);
        }
        let anonymisedStrokes = 0;
        for (const { table, column } of ANONYMISED_TABLES) {
            const r = await query(
                `update ${table} set ${column} = $2 where ${column} = any($1::text[])`,
                [names, ANONYMOUS_AUTHOR]
            );
            anonymisedStrokes += r.rowCount || 0;
        }
        await query('delete from players where name = any($1::text[])', [names]);
        await query('commit');
        return { deleted: names.length, anonymisedStrokes };
    } catch (err) {
        await query('rollback').catch(() => {});
        throw err;
    }
}
