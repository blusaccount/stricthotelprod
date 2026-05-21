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

    // ===== Cross-game wealth (extended ladder up to 10 B SC) =====
    { id: 'wealth_5k',        title: 'Five-Figure Club',   description: 'Reach a balance of 5,000 SC.',         icon: '💰', tier: 'silver',   counter: 'max_balance',          threshold: 5_000,         reward: { coins: 250 } },
    { id: 'wealth_25k',       title: 'High Roller',        description: 'Reach a balance of 25,000 SC.',        icon: '🎩', tier: 'gold',     counter: 'max_balance',          threshold: 25_000,        reward: { coins: 1000, diamonds: 1 } },
    { id: 'wealth_100k',      title: 'Whale',              description: 'Reach a balance of 100,000 SC.',       icon: '🐋', tier: 'platinum', counter: 'max_balance',          threshold: 100_000,       reward: { coins: 5000, diamonds: 5 } },
    { id: 'wealth_250k',      title: 'Quarter Million',    description: 'Reach a balance of 250,000 SC.',       icon: '💸', tier: 'platinum', counter: 'max_balance',          threshold: 250_000,       reward: { coins: 10_000, diamonds: 5 } },
    { id: 'wealth_500k',      title: 'Half-Mill',          description: 'Reach a balance of 500,000 SC.',       icon: '🤑', tier: 'platinum', counter: 'max_balance',          threshold: 500_000,       reward: { coins: 25_000, diamonds: 10 } },
    { id: 'wealth_1m',        title: 'Millionaire',        description: 'Reach a balance of 1,000,000 SC.',     icon: '🏦', tier: 'platinum', counter: 'max_balance',          threshold: 1_000_000,     reward: { coins: 50_000, diamonds: 15 } },
    { id: 'wealth_5m',        title: 'Five-Milli',         description: 'Reach a balance of 5,000,000 SC.',     icon: '🪙', tier: 'platinum', counter: 'max_balance',          threshold: 5_000_000,     reward: { coins: 100_000, diamonds: 25 } },
    { id: 'wealth_10m',       title: 'Ten Mill Club',      description: 'Reach a balance of 10,000,000 SC.',    icon: '👑', tier: 'platinum', counter: 'max_balance',          threshold: 10_000_000,    reward: { coins: 250_000, diamonds: 35 } },
    { id: 'wealth_50m',       title: 'Fifty Mill',         description: 'Reach a balance of 50,000,000 SC.',    icon: '🏆', tier: 'platinum', counter: 'max_balance',          threshold: 50_000_000,    reward: { coins: 500_000, diamonds: 50 } },
    { id: 'wealth_100m',      title: 'Centurion',          description: 'Reach a balance of 100,000,000 SC.',   icon: '🦾', tier: 'platinum', counter: 'max_balance',          threshold: 100_000_000,   reward: { coins: 1_000_000, diamonds: 75 } },
    { id: 'wealth_500m',      title: 'Half-Billion',       description: 'Reach a balance of 500,000,000 SC.',   icon: '🛸', tier: 'platinum', counter: 'max_balance',          threshold: 500_000_000,   reward: { coins: 2_500_000, diamonds: 100 } },
    { id: 'wealth_1b',        title: 'Billionaire',        description: 'Reach a balance of 1,000,000,000 SC.', icon: '🪐', tier: 'platinum', counter: 'max_balance',          threshold: 1_000_000_000, reward: { coins: 10_000_000, diamonds: 200 } },
    { id: 'wealth_10b',       title: 'Diamond Tycoon',     description: 'Reach a balance of 10,000,000,000 SC.', icon: '💎', tier: 'platinum', counter: 'max_balance',          threshold: 10_000_000_000, reward: { coins: 50_000_000, diamonds: 500 } },

    // ===== Streak =====
    { id: 'streak_3',         title: 'Hooked',             description: 'Login 3 days in a row.',                icon: '🔥', tier: 'bronze',   counter: 'streak_max',           threshold: 3,    reward: { coins: 100 } },
    { id: 'streak_7',         title: 'Weekly',             description: 'Login 7 days in a row.',                icon: '🔥', tier: 'silver',   counter: 'streak_max',           threshold: 7,    reward: { coins: 500, diamonds: 1 } },
    { id: 'streak_30',        title: 'Devoted',            description: 'Login 30 days in a row.',               icon: '🔥', tier: 'platinum', counter: 'streak_max',           threshold: 30,   reward: { coins: 5000, diamonds: 3 } },

    // ===== Roulette =====
    { id: 'roulette_first',   title: 'No More Bets',       description: 'Spin the roulette wheel once.',         icon: '🎯', tier: 'bronze',   counter: 'roulette_spins',       threshold: 1,    reward: { coins: 50 } },
    { id: 'roulette_straight',title: 'Lucky Number',       description: 'Hit a straight-up bet (35:1).',         icon: '🎯', tier: 'gold',     counter: 'roulette_straight_hits', threshold: 1,  reward: { coins: 500, diamonds: 1 } },

    // ===== Blackjack =====
    { id: 'bj_first_deal',    title: 'Hit Me',             description: 'Play one Blackjack hand.',              icon: '🃏', tier: 'bronze',   counter: 'bj_hands',             threshold: 1,    reward: { coins: 50 } },
    { id: 'bj_natural',       title: 'Twenty-One',         description: 'Hit a natural Blackjack (3:2 pay).',    icon: '🃏', tier: 'silver',   counter: 'bj_naturals',          threshold: 1,    reward: { coins: 200 } },
    { id: 'bj_grinder',       title: 'Card Grinder',       description: 'Play 100 Blackjack hands.',             icon: '🃏', tier: 'gold',     counter: 'bj_hands',             threshold: 100,  reward: { coins: 1000, diamonds: 1 } },

    // ===== Pictochat =====
    { id: 'picto_first',      title: 'First Stroke',       description: 'Draw on the lobby canvas.',             icon: '✏️', tier: 'bronze',   counter: 'picto_strokes',        threshold: 1,    reward: { coins: 30 } },
    { id: 'picto_100',        title: 'Doodle Devotee',     description: 'Place 100 strokes.',                    icon: '🎨', tier: 'silver',   counter: 'picto_strokes',        threshold: 100,  reward: { coins: 200 } },

    // ===== Soundboard =====
    { id: 'sound_first',      title: 'Drop the Beat',      description: 'Play a soundboard clip.',               icon: '🔊', tier: 'bronze',   counter: 'sound_plays',          threshold: 1,    reward: { coins: 30 } },

    // ===== Loop Machine =====
    { id: 'loop_first',       title: 'Tap In',             description: 'Toggle a Loop Machine cell.',           icon: '🎹', tier: 'bronze',   counter: 'loop_cells',           threshold: 1,    reward: { coins: 30 } },

    // ===== Watch Party =====
    { id: 'wp_first',         title: 'Co-Viewer',          description: 'Watch a video together.',               icon: '📺', tier: 'bronze',   counter: 'watchparty_plays',     threshold: 1,    reward: { coins: 50 } },

    // ===== LoL Betting =====
    { id: 'lol_first',        title: 'Riot Roulette',      description: 'Place a LoL bet.',                      icon: '⚔️', tier: 'bronze',   counter: 'lol_bets',             threshold: 1,    reward: { coins: 50 } },
    { id: 'lol_5_wins',       title: 'Worlds Bound',       description: 'Win 5 LoL bets.',                       icon: '🏅', tier: 'silver',   counter: 'lol_wins',             threshold: 5,    reward: { coins: 500 } },

    // ===== Türkçe =====
    { id: 'turkish_first',    title: 'Merhaba',            description: 'Complete your first Turkish lesson.',   icon: '🇹🇷', tier: 'bronze',  counter: 'turkish_lessons',      threshold: 1,    reward: { coins: 50 } },

    // ===== Tierlist =====
    { id: 'tier_first',       title: 'Tier Maker',         description: 'Place an item on the weekly tierlist.', icon: '🏆', tier: 'bronze',   counter: 'tierlist_placements',  threshold: 1,    reward: { coins: 50 } },

    // ===== Make It Rain =====
    { id: 'rain_first',       title: 'Make It Rain',       description: 'Trigger the lobby rain.',               icon: '💸', tier: 'bronze',   counter: 'rain_triggers',        threshold: 1,    reward: { coins: 50 } },

    // ===== Shop =====
    { id: 'shop_first_dia',   title: 'Sparkle',            description: 'Buy your first diamond.',               icon: '💎', tier: 'bronze',   counter: 'diamond_purchases',    threshold: 1,    reward: { coins: 50 } },
    { id: 'shop_10_dia',      title: 'Bling Bling',        description: 'Own 10 diamonds.',                      icon: '💍', tier: 'silver',   counter: 'diamonds_owned',       threshold: 10,   reward: { coins: 250 } },

    // ===== Achievements meta =====
    { id: 'achievement_hunter', title: 'Achievement Hunter', description: 'Unlock 10 other achievements.',       icon: '🎖️', tier: 'gold',    counter: 'achievements_unlocked', threshold: 10,  reward: { coins: 500, diamonds: 1 } },

    // ===== 5 creative achievements =====
    { id: 'creative_sweet_spot',  title: 'Sweet Spot',          description: 'Land in the middle Plinko bucket on HIGH risk.', icon: '🎯', tier: 'silver',   counter: 'plinko_high_middle',   threshold: 1,    reward: { coins: 200 } },
    { id: 'creative_eight_ball',  title: 'Eight Ball',          description: 'Hit number 8 on roulette.',           icon: '🎱', tier: 'silver',   counter: 'roulette_eight_hits',  threshold: 1,    reward: { coins: 200 } },
    { id: 'creative_synesthetic', title: 'Synesthetic',         description: 'Have all 14 Loop Machine instruments active in one bar.', icon: '🌈', tier: 'gold', counter: 'loop_full_bar', threshold: 1, reward: { coins: 500, diamonds: 1 } },
    { id: 'creative_lucky_thirteen', title: 'Lucky Thirteen',   description: 'Hit number 13 on roulette.',          icon: '☘️', tier: 'silver',   counter: 'roulette_thirteen_hits', threshold: 1,  reward: { coins: 200 } },
    { id: 'creative_speedrunner', title: 'Speedrunner',         description: 'Win 50× bet on Crash by cashing out below 1.10×.', icon: '⚡', tier: 'gold',  counter: 'crash_speedrun',       threshold: 50,   reward: { coins: 500, diamonds: 1 } },
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

/**
 * Atomically apply a delta to a counter and return both the previous and
 * resulting value in a single round-trip. Replaces the read/modify/write in
 * `bump()` which lost concurrent increments (two parallel `+1`s could land
 * as a single `+1` because both reads saw the same baseline).
 */
async function bumpProgress(playerName, counter, delta, mode) {
    if (!isDatabaseEnabled()) {
        if (!memoryProgress.has(playerName)) memoryProgress.set(playerName, new Map());
        const m = memoryProgress.get(playerName);
        const current = m.get(counter) || 0;
        let next;
        if (mode === 'max') next = Math.max(current, delta);
        else if (mode === 'set') next = delta;
        else next = current + delta;
        m.set(counter, next);
        return { previous: current, current: next };
    }
    const sql = `
        with player as (select id from players where name = $1),
             prev as (
                 select value from achievement_progress
                 where player_id = (select id from player) and counter_id = $2
             )
        insert into achievement_progress (player_id, counter_id, value)
        select id, $2, $3 from player
        on conflict (player_id, counter_id) do update
            set value = case $4::text
                when 'max' then greatest(achievement_progress.value, excluded.value)
                when 'set' then excluded.value
                else achievement_progress.value + excluded.value
            end
        returning value as current, coalesce((select value from prev), 0) as previous
    `;
    const result = await query(sql, [playerName, counter, delta, mode || 'add']);
    if (!result.rows[0]) return { previous: 0, current: 0 };
    return {
        previous: Number(result.rows[0].previous),
        current: Number(result.rows[0].current)
    };
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

    // Atomic increment — returns BOTH the old and new value in one round-trip
    // so concurrent bumps don't silently overwrite each other's increments.
    const { previous, current: next } = await bumpProgress(playerName, counter, delta, mode);

    if (next === previous) return [];

    if (!list || !list.length) return [];

    const newlyUnlocked = [];
    for (const a of list) {
        if (a.threshold <= previous) continue;      // already passed prior threshold
        if (next < a.threshold) break;              // not yet reached this one (list is sorted)
        if (await isAlreadyUnlocked(playerName, a.id)) continue;
        const inserted = await recordUnlock(playerName, a.id, { counter, value: next });
        if (inserted) {
            const rewards = await grantReward(playerName, a);
            newlyUnlocked.push({ ...a, rewards });
        }
    }
    // Recursively bump the meta "achievements_unlocked" counter so the
    // achievement_hunter unlock fires automatically. Skip when bumping itself
    // to avoid infinite recursion.
    if (newlyUnlocked.length > 0 && counter !== 'achievements_unlocked') {
        const meta = await bump(playerName, 'achievements_unlocked', newlyUnlocked.length);
        newlyUnlocked.push(...meta);
    }
    return newlyUnlocked;
}

export function getCatalog() {
    return ACHIEVEMENTS.map(a => ({ ...a }));
}

export function getById(id) {
    return achievementById.get(id) || null;
}
