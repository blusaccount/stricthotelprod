import { isDatabaseEnabled, query, withTransaction } from './db.js';
import { addBalance } from './currency.js';

const streaksMemory = new Map(); // name -> { currentStreak, maxStreak, lastDay }

// In-memory per-player lock preventing multi-tab / rapid double-completions
// when the DB is disabled. Mirrors `withClaimLock` in daily-streak.js and
// `withStockTradeLock` in stock-game.js: the whole read-decide-write-payout
// runs serialized per player, so two concurrent completions can't both pass
// the "already completed today?" check and pay the reward twice. The DB path
// gets the same guarantee from a conditional UPDATE (see below).
const completionLocks = new Map(); // playerName -> Promise
async function withCompletionLock(playerName, fn) {
    while (completionLocks.has(playerName)) {
        await completionLocks.get(playerName);
    }
    let resolve;
    const p = new Promise(r => { resolve = r; });
    completionLocks.set(playerName, p);
    try { return await fn(); }
    finally { completionLocks.delete(playerName); resolve(); }
}

const REWARD_PER_DAY = 5;
const REWARD_MAX = 50;

function getUtcDayNumber(date = new Date()) {
    return Math.floor(date.getTime() / (1000 * 60 * 60 * 24));
}

function dayNumberToDateString(dayNumber) {
    return new Date(dayNumber * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function getOrCreatePlayerId(playerName, client) {
    const runner = client || { query };
    await runner.query(
        `insert into players (name, balance)
         values ($1, $2)
         on conflict (name) do nothing`,
        [playerName, 1000]
    );

    const result = await runner.query(
        'select id from players where name = $1',
        [playerName]
    );

    return result.rows[0]?.id || null;
}

function computeReward(streak) {
    return Math.min(REWARD_MAX, streak * REWARD_PER_DAY);
}

function computeNextStreak({ lastDay, currentStreak }, todayDay) {
    if (lastDay === todayDay) {
        return { currentStreak, alreadyCompleted: true };
    }
    if (lastDay === todayDay - 1) {
        return { currentStreak: currentStreak + 1, alreadyCompleted: false };
    }
    return { currentStreak: 1, alreadyCompleted: false };
}

export async function recordDailyCompletion(playerName, date = new Date()) {
    const todayDay = getUtcDayNumber(date);
    const todayDate = dayNumberToDateString(todayDay);

    if (!isDatabaseEnabled()) {
        // Serialize the whole read-decide-write-payout per player so two
        // concurrent completions can't both see "not completed today" and
        // pay the reward twice.
        return withCompletionLock(playerName, async () => {
            const entry = await readStreakEntry(playerName);
            const { currentStreak, alreadyCompleted } = computeNextStreak(entry, todayDay);
            const maxStreak = Math.max(entry.maxStreak || 0, currentStreak);

            streaksMemory.set(playerName, {
                currentStreak,
                maxStreak,
                lastDay: todayDay
            });

            const rewardCoins = alreadyCompleted ? 0 : computeReward(currentStreak);
            if (rewardCoins > 0) {
                await addBalance(playerName, rewardCoins, 'turkish_daily', { day: todayDate, streak: currentStreak });
            }

            return {
                ok: true,
                alreadyCompleted,
                rewardCoins,
                currentStreak,
                maxStreak,
                day: todayDate
            };
        });
    }

    return withTransaction(async (client) => {
        const playerId = await getOrCreatePlayerId(playerName, client);
        if (!playerId) {
            return { ok: false, error: 'Player not found' };
        }

        // Ensure the streak row exists so the conditional UPDATE below has a
        // row to act on (fresh rows start with last_completed_day = null).
        await client.query(
            `insert into turkish_streaks (player_id, current_streak, max_streak, last_completed_day)
             values ($1, 0, 0, null)
             on conflict (player_id) do nothing`,
            [playerId]
        );

        // Atomic claim: this single UPDATE both decides the new streak and
        // guards against a double payout. The WHERE only matches when today
        // has NOT already been recorded, so of two concurrent transactions
        // the second blocks on the row lock, then re-evaluates against the
        // committed row (last_completed_day = todayDay) and affects 0 rows.
        // 1:1 the daily-streak.js conditional-UPDATE + `returning` pattern.
        const upd = await client.query(
            `update turkish_streaks
                set current_streak = case when last_completed_day = $2 - 1 then current_streak + 1 else 1 end,
                    max_streak     = greatest(max_streak,
                                              case when last_completed_day = $2 - 1 then current_streak + 1 else 1 end),
                    last_completed_day = $2
              where player_id = $1
                and (last_completed_day is null or last_completed_day < $2)
              returning current_streak, max_streak`,
            [playerId, todayDay]
        );

        if (!upd.rows.length) {
            // Already completed today — no state change, no reward.
            const existing = await client.query(
                `select current_streak, max_streak from turkish_streaks where player_id = $1`,
                [playerId]
            );
            const row = existing.rows[0];
            return {
                ok: true,
                alreadyCompleted: true,
                rewardCoins: 0,
                currentStreak: row ? Number(row.current_streak) : 0,
                maxStreak: row ? Number(row.max_streak) : 0,
                day: todayDate
            };
        }

        const currentStreak = Number(upd.rows[0].current_streak);
        const maxStreak = Number(upd.rows[0].max_streak);
        const rewardCoins = computeReward(currentStreak);
        if (rewardCoins > 0) {
            await addBalance(playerName, rewardCoins, 'turkish_daily', { day: todayDate, streak: currentStreak }, client);
        }

        return {
            ok: true,
            alreadyCompleted: false,
            rewardCoins,
            currentStreak,
            maxStreak,
            day: todayDate
        };
    });
}

// Reads the current in-memory streak entry for a player. Async so the memory
// completion path has an explicit yield point between read and write, exactly
// like the DB read it stands in for — which is why `withCompletionLock` above
// is load-bearing rather than cosmetic.
async function readStreakEntry(playerName) {
    return streaksMemory.get(playerName) || { currentStreak: 0, maxStreak: 0, lastDay: null };
}

export async function getTurkishLeaderboard(limit = 10) {
    if (!isDatabaseEnabled()) {
        const entries = [];
        for (const [name, streak] of streaksMemory.entries()) {
            entries.push({
                name,
                currentStreak: streak.currentStreak || 0,
                maxStreak: streak.maxStreak || 0
            });
        }
        entries.sort((a, b) => {
            if (b.currentStreak !== a.currentStreak) return b.currentStreak - a.currentStreak;
            if (b.maxStreak !== a.maxStreak) return b.maxStreak - a.maxStreak;
            return a.name.localeCompare(b.name);
        });
        return entries.slice(0, limit);
    }

    const result = await query(
        `select p.name, ts.current_streak, ts.max_streak
         from turkish_streaks ts
         join players p on p.id = ts.player_id
         order by ts.current_streak desc, ts.max_streak desc, p.name asc
         limit $1`,
        [limit]
    );

    return result.rows.map(r => ({
        name: r.name,
        currentStreak: Number(r.current_streak),
        maxStreak: Number(r.max_streak)
    }));
}

export function getDailyRewardInfo(streak) {
    return {
        rewardCoins: computeReward(streak),
        rewardMax: REWARD_MAX,
        rewardPerDay: REWARD_PER_DAY
    };
}
