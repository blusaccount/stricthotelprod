// Daily-Streak module — escalating reward for consecutive daily logins.
//
// Day boundary is UTC. The "day index" is the integer day count since epoch
// (Math.floor(Date.now() / 86_400_000)). Claiming on day D when last claim
// was day D-1 → continues streak. Day D-2+ → resets to 1. Day D itself
// (already claimed today) → idempotent no-op (no second claim).

import { isDatabaseEnabled, query } from './db.js';
import { addBalance, addDiamonds } from './currency.js';

const STREAK_REWARDS = [
    20,    // day 1
    35,    // day 2
    55,    // day 3
    75,    // day 4
    95,    // day 5
    120,   // day 6
    150    // day 7 (and a diamond)
];
const DIAMOND_BONUS_DAYS = new Set([7]);

const MS_PER_DAY = 86_400_000;
function todayIndex() {
    return Math.floor(Date.now() / MS_PER_DAY);
}

function rewardForDay(day) {
    // Caps coin rewards at 150 (day 7). Subsequent cycles use the SAME table
    // — no escalating bonus — so the daily ceiling stays 150 SC + 1 💎 forever.
    if (day < 1) day = 1;
    const slot = ((day - 1) % 7) + 1;
    return {
        coins: STREAK_REWARDS[slot - 1],
        diamonds: (slot === 7) ? 1 : 0
    };
}

// In-memory fallback when DB unavailable.
const memoryStreaks = new Map(); // playerName -> { current, max, lastDay, totalClaims }

async function readStreakRow(playerName) {
    if (!isDatabaseEnabled()) {
        return memoryStreaks.get(playerName) || null;
    }
    const result = await query(
        `select ds.current_streak, ds.max_streak, ds.last_claimed_day, ds.total_claims
         from daily_streaks ds
         join players p on p.id = ds.player_id
         where p.name = $1`,
        [playerName]
    );
    if (!result.rows.length) return null;
    const row = result.rows[0];
    return {
        current: row.current_streak,
        max: row.max_streak,
        lastDay: row.last_claimed_day,
        totalClaims: row.total_claims
    };
}

async function writeStreakRow(playerName, streak) {
    if (!isDatabaseEnabled()) {
        memoryStreaks.set(playerName, { ...streak });
        return;
    }
    await query(
        `insert into daily_streaks (player_id, current_streak, max_streak, last_claimed_day, total_claims)
         select id, $2, $3, $4, $5 from players where name = $1
         on conflict (player_id) do update
         set current_streak = excluded.current_streak,
             max_streak = excluded.max_streak,
             last_claimed_day = excluded.last_claimed_day,
             total_claims = excluded.total_claims`,
        [playerName, streak.current, streak.max, streak.lastDay, streak.totalClaims]
    );
}

export async function getStreakStatus(playerName) {
    const row = await readStreakRow(playerName);
    const today = todayIndex();
    if (!row) {
        return {
            currentStreak: 0,
            maxStreak: 0,
            totalClaims: 0,
            canClaim: true,
            nextDayIndex: 1,
            nextReward: rewardForDay(1),
            secondsUntilReset: secondsUntilUtcMidnight()
        };
    }
    const { current, max, lastDay, totalClaims } = row;
    if (lastDay === today) {
        // already claimed today
        return {
            currentStreak: current,
            maxStreak: max,
            totalClaims,
            canClaim: false,
            nextDayIndex: current + 1,
            nextReward: rewardForDay(current + 1),
            secondsUntilReset: secondsUntilUtcMidnight()
        };
    }
    const willContinue = lastDay === today - 1;
    const nextDay = willContinue ? current + 1 : 1;
    return {
        currentStreak: willContinue ? current : 0,
        maxStreak: max,
        totalClaims,
        canClaim: true,
        nextDayIndex: nextDay,
        nextReward: rewardForDay(nextDay),
        secondsUntilReset: secondsUntilUtcMidnight()
    };
}

export async function claimStreak(playerName) {
    const row = await readStreakRow(playerName);
    const today = todayIndex();
    if (row && row.lastDay === today) {
        return { ok: false, reason: 'already_claimed' };
    }

    const willContinue = row && row.lastDay === today - 1;
    const newCurrent = willContinue ? (row.current + 1) : 1;
    const newMax = Math.max(row ? row.max : 0, newCurrent);
    const reward = rewardForDay(newCurrent);
    const totalClaims = (row ? row.totalClaims : 0) + 1;

    await writeStreakRow(playerName, {
        current: newCurrent,
        max: newMax,
        lastDay: today,
        totalClaims
    });

    let newBalance = null;
    if (reward.coins > 0) {
        newBalance = await addBalance(playerName, reward.coins, 'daily_streak', {
            day: newCurrent,
            totalClaims
        });
    }
    let newDiamonds = null;
    if (reward.diamonds > 0) {
        newDiamonds = await addDiamonds(playerName, reward.diamonds, 'daily_streak_diamond', {
            day: newCurrent
        });
    }

    return {
        ok: true,
        day: newCurrent,
        reward,
        currentStreak: newCurrent,
        maxStreak: newMax,
        totalClaims,
        newBalance,
        newDiamonds
    };
}

function secondsUntilUtcMidnight() {
    const now = Date.now();
    const todayMs = todayIndex() * MS_PER_DAY;
    return Math.max(0, Math.floor((todayMs + MS_PER_DAY - now) / 1000));
}

// Test exports
export { todayIndex, rewardForDay, STREAK_REWARDS };
