// Achievement system — catalog of named badges plus a thin progress-counter
// store. Games call `bump(playerName, counter, delta)` on action; the system
// auto-checks any achievements whose threshold has been reached and records
// the unlock once.

import { isDatabaseEnabled, query } from './db.js';
import { addBalance, addDiamonds } from './currency.js';

// ============================================================================
// CATALOG
// ============================================================================
// Each achievement has:
//   id          unique key
//   title       short name shown to the player
//   description what the player did
//   icon        emoji
//   tier        bronze | silver | gold | platinum (visual only)
//   counter     name of the progress counter that drives this unlock
//   threshold   counter value at which the unlock fires
//   reward      { coins?, diamonds? } granted on unlock
// ============================================================================

export const ACHIEVEMENTS = [
    // ===== Strictly7s =====
    { id: 'slot_first_spin',  title: 'First Pull',         description: 'Spin Strictly7s once.',                icon: '🎰', tier: 'bronze',   counter: 'slot_spins',           threshold: 1,    reward: { coins: 50 } },
    { id: 'slot_100_spins',   title: 'Slot Junkie',        description: 'Spin the slot 100 times.',             icon: '🎰', tier: 'silver',   counter: 'slot_spins',           threshold: 100,  reward: { coins: 250 } },
    { id: 'slot_1000_spins',  title: 'Slot Marathon',      description: 'Spin the slot 1,000 times.',           icon: '🎰', tier: 'gold',     counter: 'slot_spins',           threshold: 1000, reward: { coins: 2000, diamonds: 1 } },
    { id: 'slot_jackpot',     title: 'JACKPOT!',           description: 'Hit a 5-of-a-kind SEVEN.',             icon: '7️⃣', tier: 'gold',    counter: 'slot_jackpots',        threshold: 1,    reward: { coins: 1000, diamonds: 1 } },
    { id: 'slot_freespins',   title: 'Free Falls',         description: 'Trigger free spins for the first time.', icon: '🌟', tier: 'silver', counter: 'slot_fs_triggers',     threshold: 1,    reward: { coins: 200 } },

    // ===== Plinko =====
    { id: 'plinko_first',     title: 'First Drop',         description: 'Drop a Plinko ball once.',             icon: '🌀', tier: 'bronze',   counter: 'plinko_drops',         threshold: 1,    reward: { coins: 50 } },
    { id: 'plinko_high_max',  title: 'Edge Lord',          description: 'Land in a 200× bucket on high risk.',  icon: '🎯', tier: 'gold',     counter: 'plinko_edge_hits',     threshold: 1,    reward: { coins: 500, diamonds: 1 } },
    { id: 'plinko_500',       title: 'Bucket List',        description: 'Drop 500 Plinko balls.',               icon: '🌀', tier: 'silver',   counter: 'plinko_drops',         threshold: 500,  reward: { coins: 750 } },

    // ===== Crash =====
    { id: 'crash_first',      title: 'Lift-off',           description: 'Place a Crash bet.',                   icon: '🚀', tier: 'bronze',   counter: 'crash_bets',           threshold: 1,    reward: { coins: 50 } },
    { id: 'crash_10x',        title: 'Diamond Hands',      description: 'Cash out at 10× or higher.',           icon: '💎', tier: 'silver',   counter: 'crash_cashout_10x',    threshold: 1,    reward: { coins: 300 } },
    { id: 'crash_50x',        title: 'Mooned',             description: 'Cash out at 50× or higher.',           icon: '🌙', tier: 'gold',     counter: 'crash_cashout_50x',    threshold: 1,    reward: { coins: 1000, diamonds: 1 } },
    { id: 'crash_100x',       title: 'To The Moon',        description: 'Cash out at 100× or higher.',          icon: '🪐', tier: 'platinum', counter: 'crash_cashout_100x',   threshold: 1,    reward: { coins: 2500, diamonds: 2 } },

    // ===== Mäxchen =====
    { id: 'mae_first_round',  title: 'Liar Liar',          description: 'Play one round of Mäxchen.',           icon: '🎲', tier: 'bronze',   counter: 'mae_rounds',           threshold: 1,    reward: { coins: 50 } },
    { id: 'mae_first_win',    title: 'Bluff Mastery',      description: 'Win a round of Mäxchen.',              icon: '🃏', tier: 'silver',   counter: 'mae_wins',             threshold: 1,    reward: { coins: 200 } },
    { id: 'mae_10_wins',      title: 'Bluff King',         description: 'Win 10 rounds of Mäxchen.',             icon: '👑', tier: 'gold',     counter: 'mae_wins',             threshold: 10,   reward: { coins: 1000, diamonds: 1 } },

    // ===== Stocks =====
    { id: 'stock_first_buy',  title: 'Wall Street',        description: 'Buy your first share.',                icon: '📈', tier: 'bronze',   counter: 'stock_buys',           threshold: 1,    reward: { coins: 50 } },
    { id: 'stock_50_trades',  title: 'Day Trader',         description: 'Make 50 trades.',                       icon: '📊', tier: 'silver',   counter: 'stock_trades',         threshold: 50,   reward: { coins: 500 } },
    { id: 'stock_5k_net',     title: 'Hedge Fund',         description: 'Reach a portfolio net worth of 5,000 SC.', icon: '💼', tier: 'gold', counter: 'stock_max_net_worth',  threshold: 5000, reward: { coins: 1000 } },

    // ===== Strict Brain =====
    { id: 'brain_first_test', title: 'Brain Boot',         description: 'Complete one Brain test.',              icon: '🧠', tier: 'bronze',   counter: 'brain_tests',          threshold: 1,    reward: { coins: 50 } },
    { id: 'brain_25_versus',  title: 'Mind Games',         description: 'Win 25 Brain Versus matches.',          icon: '⚡', tier: 'gold',     counter: 'brain_versus_wins',    threshold: 25,   reward: { coins: 750, diamonds: 1 } },

    // ===== Cross-game wealth =====
    { id: 'wealth_5k',        title: 'Five-Figure Club',   description: 'Reach a balance of 5,000 SC.',         icon: '💰', tier: 'silver',   counter: 'max_balance',          threshold: 5000,   reward: { coins: 250 } },
    { id: 'wealth_25k',       title: 'High Roller',        description: 'Reach a balance of 25,000 SC.',        icon: '🎩', tier: 'gold',     counter: 'max_balance',          threshold: 25000,  reward: { coins: 1000, diamonds: 1 } },
    { id: 'wealth_100k',      title: 'Whale',              description: 'Reach a balance of 100,000 SC.',       icon: '🐋', tier: 'platinum', counter: 'max_balance',          threshold: 100000, reward: { coins: 5000, diamonds: 5 } },

    // ===== Streak =====
    { id: 'streak_3',         title: 'Hooked',             description: 'Login 3 days in a row.',                icon: '🔥', tier: 'bronze',   counter: 'streak_max',           threshold: 3,    reward: { coins: 100 } },
    { id: 'streak_7',         title: 'Weekly',             description: 'Login 7 days in a row.',                icon: '🔥', tier: 'silver',   counter: 'streak_max',           threshold: 7,    reward: { coins: 500, diamonds: 1 } },
    { id: 'streak_30',        title: 'Devoted',            description: 'Login 30 days in a row.',               icon: '🔥', tier: 'platinum', counter: 'streak_max',           threshold: 30,   reward: { coins: 5000, diamonds: 3 } },
];

// counter id → list of { achievement, threshold } sorted by threshold asc
const counterMap = (() => {
    const m = new Map();
    for (const a of ACHIEVEMENTS) {
        if (!m.has(a.counter)) m.set(a.counter, []);
        m.get(a.counter).push(a);
    }
    for (const list of m.values()) list.sort((x, y) => x.threshold - y.threshold);
    return m;
})();

const achievementById = new Map(ACHIEVEMENTS.map(a => [a.id, a]));

// In-memory fallback.
const memoryProgress = new Map(); // playerName -> Map<counter, value>
const memoryUnlocks = new Map();  // playerName -> Set<achievementId>

// ============================================================================
// READS
// ============================================================================

export async function getProgress(playerName, counter) {
    if (!isDatabaseEnabled()) {
        return memoryProgress.get(playerName)?.get(counter) || 0;
    }
    const result = await query(
        `select ap.value
         from achievement_progress ap
         join players p on p.id = ap.player_id
         where p.name = $1 and ap.counter_id = $2`,
        [playerName, counter]
    );
    return Number(result.rows[0]?.value || 0);
}

export async function listProgress(playerName) {
    if (!isDatabaseEnabled()) {
        const m = memoryProgress.get(playerName) || new Map();
        return Object.fromEntries(m);
    }
    const result = await query(
        `select ap.counter_id, ap.value
         from achievement_progress ap
         join players p on p.id = ap.player_id
         where p.name = $1`,
        [playerName]
    );
    const out = {};
    for (const row of result.rows) out[row.counter_id] = Number(row.value);
    return out;
}

export async function listUnlocked(playerName) {
    if (!isDatabaseEnabled()) {
        const set = memoryUnlocks.get(playerName) || new Set();
        return Array.from(set).map(id => ({ id, unlocked_at: null }));
    }
    const result = await query(
        `select a.achievement_id, a.unlocked_at
         from achievements a
         join players p on p.id = a.player_id
         where p.name = $1
         order by a.unlocked_at desc`,
        [playerName]
    );
    return result.rows.map(r => ({ id: r.achievement_id, unlocked_at: r.unlocked_at }));
}

// ============================================================================
// WRITES
// ============================================================================

async function setProgress(playerName, counter, value) {
    if (!isDatabaseEnabled()) {
        if (!memoryProgress.has(playerName)) memoryProgress.set(playerName, new Map());
        memoryProgress.get(playerName).set(counter, value);
        return value;
    }
    await query(
        `insert into achievement_progress (player_id, counter_id, value)
         select id, $2, $3 from players where name = $1
         on conflict (player_id, counter_id) do update set value = excluded.value`,
        [playerName, counter, value]
    );
    return value;
}

async function isAlreadyUnlocked(playerName, achievementId) {
    if (!isDatabaseEnabled()) {
        return memoryUnlocks.get(playerName)?.has(achievementId) || false;
    }
    const result = await query(
        `select 1
         from achievements a
         join players p on p.id = a.player_id
         where p.name = $1 and a.achievement_id = $2 limit 1`,
        [playerName, achievementId]
    );
    return result.rows.length > 0;
}

async function recordUnlock(playerName, achievementId, metadata = null) {
    if (!isDatabaseEnabled()) {
        if (!memoryUnlocks.has(playerName)) memoryUnlocks.set(playerName, new Set());
        memoryUnlocks.get(playerName).add(achievementId);
        return true;
    }
    const result = await query(
        `insert into achievements (player_id, achievement_id, metadata)
         select id, $2, $3 from players where name = $1
         on conflict (player_id, achievement_id) do nothing
         returning achievement_id`,
        [playerName, achievementId, metadata ? JSON.stringify(metadata) : null]
    );
    return result.rows.length > 0;
}

async function grantReward(playerName, achievement) {
    const reward = achievement.reward || {};
    const out = {};
    if (reward.coins > 0) {
        out.balance = await addBalance(playerName, reward.coins, 'achievement', { id: achievement.id });
    }
    if (reward.diamonds > 0) {
        out.diamonds = await addDiamonds(playerName, reward.diamonds, 'achievement', { id: achievement.id });
    }
    return out;
}

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Increment a counter and check whether any achievements unlock as a result.
 * `mode` controls how the value is updated:
 *   - 'add' (default): value += delta
 *   - 'max': value = max(value, delta)
 *   - 'set': value = delta
 *
 * Returns an array of newly-unlocked achievement objects (with reward info).
 */
export async function bump(playerName, counter, delta = 1, mode = 'add') {
    if (!playerName || !counter) return [];
    const list = counterMap.get(counter);

    const current = await getProgress(playerName, counter);
    let next;
    if (mode === 'max') next = Math.max(current, delta);
    else if (mode === 'set') next = delta;
    else next = current + delta;

    if (next === current) return [];
    await setProgress(playerName, counter, next);

    if (!list || !list.length) return [];

    const newlyUnlocked = [];
    for (const a of list) {
        if (a.threshold <= current) continue;       // already passed prior threshold
        if (next < a.threshold) break;              // not yet reached this one (list is sorted)
        if (await isAlreadyUnlocked(playerName, a.id)) continue;
        const inserted = await recordUnlock(playerName, a.id, { counter, value: next });
        if (inserted) {
            const rewards = await grantReward(playerName, a);
            newlyUnlocked.push({ ...a, rewards });
        }
    }
    return newlyUnlocked;
}

export function getCatalog() {
    return ACHIEVEMENTS.map(a => ({ ...a }));
}

export function getById(id) {
    return achievementById.get(id) || null;
}
