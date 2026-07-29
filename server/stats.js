// Aggregate usage figures for the operator.
//
// The rule this module is built to, and must keep to: **a counter, computed
// here, from data the privacy notice already declares, that never leaves this
// origin and is never keyed to a person.** No third-party analytics, no
// pageview beacons, no per-player rows in the output, and — the part that is
// easy to lose sight of — **no new writes**. Every figure below is derived from
// tables the site already keeps for gameplay: adding a tracking table would
// mean collecting data for a purpose the notice does not name.
//
// That constraint decides what is knowable. There is no history of who was
// online when, because nothing records it, so "active players" is derived from
// `players.last_seen_at` (a single latest timestamp) and the per-day series
// comes from `wallet_ledger`, which is written as a side-effect of playing.
// A player who browses without earning or spending a coin does not appear —
// that is a real limitation of the numbers, not a rounding error, and it is
// the honest price of not tracking people.

import { isDatabaseEnabled, query } from './db.js';

/** How far back the per-day series may reach. */
const MAX_DAYS = 365;
const DEFAULT_DAYS = 30;

export function clampDays(value) {
    const n = parseInt(value, 10);
    if (!Number.isFinite(n) || n < 1) return DEFAULT_DAYS;
    return Math.min(n, MAX_DAYS);
}

const num = (v) => Number(v) || 0;

/**
 * Site usage, aggregated. Never returns a player name or any per-person row.
 *
 * @param {{days?: number|string, onlineNow?: number}} options
 */
export async function getSiteStats({ days = DEFAULT_DAYS, onlineNow = null } = {}) {
    const window = clampDays(days);
    const base = {
        generatedAt: new Date().toISOString(),
        windowDays: window,
        onlineNow,
        note: 'Aggregierte Zahlen. Keine personenbezogenen Daten, keine Drittanbieter, nichts verlaesst diesen Server.',
    };

    if (!isDatabaseEnabled()) {
        return { ...base, database: false };
    }

    const [accounts, active, ledgerByDay, byReason, dailyByDay, dailyDepth] = await Promise.all([
        query(`select count(*)::int as total,
                      count(discord_id)::int as with_discord
                 from players`),
        // last_seen_at is the only activity timestamp on the player row, so
        // this is "seen within", not a per-day history.
        query(`select
                 count(*) filter (where last_seen_at > now() - interval '1 day')::int  as day1,
                 count(*) filter (where last_seen_at > now() - interval '7 days')::int as day7,
                 count(*) filter (where last_seen_at > now() - interval '30 days')::int as day30
               from players`),
        // Distinct players per day, from wallet movement. Written by playing,
        // so it is a usage signal that costs no extra storage.
        query(`select (created_at at time zone 'utc')::date::text as day,
                      count(distinct player_id)::int as players,
                      count(*)::int as events
                 from wallet_ledger
                where created_at >= (now() at time zone 'utc')::date - ($1::int - 1)
                group by 1 order by 1`, [window]),
        // Which games people actually use. `reason` is a fixed vocabulary set
        // by the server, not user input.
        query(`select reason,
                      count(*)::int as events,
                      count(distinct player_id)::int as players
                 from wallet_ledger
                where created_at >= (now() at time zone 'utc')::date - ($1::int - 1)
                group by reason order by events desc`, [window]),
        query(`select day::text as day, count(*)::int as players
                 from brain_daily_results
                where day >= (now() at time zone 'utc')::date - ($1::int - 1)
                group by day order by day`, [window]),
        // How many days each player took the daily, bucketed — the shape of
        // repeat play without naming anybody. `1`, `2-6`, `7+`.
        query(`select bucket, count(*)::int as players from (
                   select case when c = 1 then '1' when c < 7 then '2-6' else '7+' end as bucket
                     from (select player_id, count(*)::int as c
                             from brain_daily_results group by player_id) t
               ) b group by bucket order by bucket`),
    ]);

    return {
        ...base,
        database: true,
        accounts: {
            total: num(accounts.rows[0]?.total),
            withDiscord: num(accounts.rows[0]?.with_discord),
        },
        activePlayers: {
            last24h: num(active.rows[0]?.day1),
            last7d: num(active.rows[0]?.day7),
            last30d: num(active.rows[0]?.day30),
        },
        perDay: ledgerByDay.rows.map(r => ({
            day: r.day, players: num(r.players), events: num(r.events),
        })),
        byReason: byReason.rows.map(r => ({
            reason: r.reason, events: num(r.events), players: num(r.players),
        })),
        dailyChallenge: {
            perDay: dailyByDay.rows.map(r => ({ day: r.day, players: num(r.players) })),
            playersByDaysPlayed: Object.fromEntries(
                dailyDepth.rows.map(r => [r.bucket, num(r.players)])
            ),
        },
    };
}
