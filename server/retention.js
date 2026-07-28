// Deletion of dormant player accounts.
//
// GDPR Art. 5(1)(e) says personal data may only be kept as long as it is needed
// for the purpose it was collected for. A player who has not come back in years
// no longer has a game to keep a score in, so their row has to go.
//
// **Off by default.** Deleting player data is irreversible and the right period
// is a decision for the operator, not a default someone inherits by accident.
// Set ACCOUNT_RETENTION_MONTHS to switch it on, and put the same number in the
// privacy notice — the two must agree.
//
// Activity is `last_seen_at` (stamped on every register-player), falling back
// to `updated_at` and `created_at` for rows that predate that column.

import { isDatabaseEnabled, query } from './db.js';

const RUN_INTERVAL_MS = 24 * 60 * 60 * 1000;

// Tables keyed by player_name rather than by player_id. Everything keyed by
// player_id disappears through `on delete cascade`; these do not, and would
// otherwise be left behind pointing at a player that no longer exists.
const NAME_KEYED_TABLES = [
    'tierlist_placements',
    'food_ratings',
    'food_scrandle_streaks',
    'food_classic_scores',
];

let timerId = null;

export function getRetentionMonths() {
    const raw = Number(process.env.ACCOUNT_RETENTION_MONTHS);
    if (!Number.isFinite(raw) || raw <= 0) return null;
    // A period under six months would delete players who simply took a summer
    // off; treat anything shorter as a configuration mistake.
    if (raw < 6) {
        console.warn(`[retention] ACCOUNT_RETENTION_MONTHS=${raw} is below the 6-month floor — ignoring`);
        return null;
    }
    return Math.floor(raw);
}

/**
 * List the players who would be deleted right now, without deleting anything.
 * Used by the dry run and worth calling before changing the period.
 */
export async function findDormantPlayers(months) {
    if (!isDatabaseEnabled()) return [];
    const res = await query(
        `select name, coalesce(last_seen_at, updated_at, created_at) as last_active
           from players
          where coalesce(last_seen_at, updated_at, created_at) < now() - ($1 || ' months')::interval
          order by last_active asc`,
        [String(months)]
    );
    return res.rows;
}

/**
 * Delete dormant accounts and everything hanging off them.
 * @returns {Promise<{deleted: number, names: string[]}>}
 */
export async function purgeDormantPlayers(months) {
    if (!isDatabaseEnabled()) return { deleted: 0, names: [] };

    const dormant = await findDormantPlayers(months);
    if (dormant.length === 0) return { deleted: 0, names: [] };

    const names = dormant.map(r => r.name);

    // One transaction: a half-purged player is worse than an un-purged one,
    // because the name-keyed rows would then be orphaned.
    await query('begin');
    try {
        for (const table of NAME_KEYED_TABLES) {
            await query(`delete from ${table} where player_name = any($1::text[])`, [names]);
        }
        await query('delete from players where name = any($1::text[])', [names]);
        await query('commit');
    } catch (err) {
        await query('rollback').catch(() => {});
        throw err;
    }

    console.log(`[retention] deleted ${names.length} dormant player(s) after ${months} months`);
    return { deleted: names.length, names };
}

export function startRetentionJob() {
    const months = getRetentionMonths();
    if (months === null) {
        // getRetentionMonths already warns when a value was present but
        // rejected, so distinguish the two cases rather than claiming
        // "not set" for a value the operator did set.
        const reason = process.env.ACCOUNT_RETENTION_MONTHS
            ? 'ACCOUNT_RETENTION_MONTHS rejected — see the warning above'
            : 'ACCOUNT_RETENTION_MONTHS not set';
        console.log(`[retention] disabled (${reason})`);
        return;
    }
    if (!isDatabaseEnabled()) {
        console.log('[retention] disabled (no database)');
        return;
    }

    console.log(`[retention] enabled — deleting accounts dormant for ${months} months, checked daily`);

    const run = () => {
        purgeDormantPlayers(months).catch((err) => {
            console.error('[retention] purge failed:', err.message);
        });
    };

    // Not on boot: a restart loop would otherwise re-run this every few
    // seconds. First pass one interval in.
    timerId = setInterval(run, RUN_INTERVAL_MS);
    if (typeof timerId.unref === 'function') timerId.unref();
}

export function stopRetentionJob() {
    if (timerId) {
        clearInterval(timerId);
        timerId = null;
    }
}
