// The daily Strict Brain challenge.
//
// What used to be called the "Daily Test" picked three of five games at random
// on every attempt, with nothing stopping a player from replaying until the
// numbers looked good. It was a three-game run wearing a daily label: nobody's
// score meant anything next to anyone else's, and there was nothing to compare
// or to share.
//
// A daily needs three properties, and this module provides all three:
//   1. Everyone gets the *same* challenge on a given day.
//   2. One attempt, and the result stands.
//   3. The result is comparable, so a leaderboard and a shareable summary mean
//      something.
//
// The selection is decided **here**, not in the browser, and handed to the
// client — otherwise a client could reroll until it liked the games.

import { isDatabaseEnabled, query } from './db.js';

export const BRAIN_GAMES = ['math', 'stroop', 'chimp', 'reaction', 'scramble'];
export const GAMES_PER_DAY = 3;

/** Today in UTC as `YYYY-MM-DD`. The day boundary is UTC everywhere. */
export function utcDay(now = new Date()) {
    return now.toISOString().slice(0, 10);
}

// Deterministic hash of the day string. Same shape as the tierlist's weekly
// selection, so the two behave alike.
function hashString(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) {
        h ^= str.charCodeAt(i);
        h = Math.imul(h, 16777619);
    }
    return h >>> 0;
}

function mulberry32(seed) {
    let a = seed >>> 0;
    return function () {
        a = (a + 0x6D2B79F5) >>> 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}

/**
 * The three games for a given day, in the order they are played.
 * Pure function of the date: same input, same output, on every machine and on
 * every call.
 */
export function gamesForDay(day) {
    const rand = mulberry32(hashString('strictbrain:' + day));
    const pool = BRAIN_GAMES.slice();
    // Fisher-Yates with the seeded generator, then take the first three.
    for (let i = pool.length - 1; i > 0; i--) {
        const j = Math.floor(rand() * (i + 1));
        const tmp = pool[i]; pool[i] = pool[j]; pool[j] = tmp;
    }
    return pool.slice(0, GAMES_PER_DAY);
}

// ---------------------------------------------------------------- storage ---

const memoryResults = new Map(); // `${name}|${day}` -> result

/** The player's result for a day, or null if they have not played it. */
export async function getDailyResult(playerName, day) {
    if (!playerName) return null;
    if (!isDatabaseEnabled()) {
        return memoryResults.get(`${playerName}|${day}`) || null;
    }
    try {
        const r = await query(
            `select r.brain_age, r.games, r.created_at
               from brain_daily_results r
               join players p on p.id = r.player_id
              where p.name = $1 and r.day = $2`,
            [playerName, day]
        );
        if (r.rowCount === 0) return null;
        const row = r.rows[0];
        return { day, brainAge: row.brain_age, games: row.games, createdAt: row.created_at };
    } catch (err) {
        console.error('getDailyResult error:', err.message);
        return null;
    }
}

/**
 * Record a result. First one wins: a second attempt on the same day is
 * rejected rather than overwriting, which is what makes the score mean
 * something.
 *
 * @returns {Promise<{stored: boolean, existing: object|null}>}
 */
export async function saveDailyResult(playerName, day, brainAge, games) {
    if (!playerName) return { stored: false, existing: null };

    if (!isDatabaseEnabled()) {
        const key = `${playerName}|${day}`;
        const existing = memoryResults.get(key);
        if (existing) return { stored: false, existing };
        const result = { day, brainAge, games, createdAt: new Date().toISOString() };
        memoryResults.set(key, result);
        return { stored: true, existing: null };
    }

    try {
        const r = await query(
            `insert into brain_daily_results (player_id, day, brain_age, games)
             select p.id, $2, $3, $4::jsonb from players p where p.name = $1
             on conflict (player_id, day) do nothing
             returning brain_age`,
            [playerName, day, brainAge, JSON.stringify(games)]
        );
        if (r.rowCount > 0) return { stored: true, existing: null };
        return { stored: false, existing: await getDailyResult(playerName, day) };
    } catch (err) {
        console.error('saveDailyResult error:', err.message);
        return { stored: false, existing: null };
    }
}

/** Today's ranking, lowest brain age first. */
export async function getDailyLeaderboard(day, limit = 20) {
    if (!isDatabaseEnabled()) {
        return [...memoryResults.entries()]
            .filter(([key]) => key.endsWith('|' + day))
            .map(([key, r]) => ({ name: key.slice(0, key.lastIndexOf('|')), brainAge: r.brainAge, createdAt: r.createdAt }))
            .sort((a, b) => a.brainAge - b.brainAge || String(a.createdAt).localeCompare(String(b.createdAt)))
            .slice(0, limit);
    }
    try {
        const r = await query(
            `select p.name, r.brain_age, r.created_at
               from brain_daily_results r
               join players p on p.id = r.player_id
              where r.day = $1
              order by r.brain_age asc, r.created_at asc
              limit $2`,
            [day, limit]
        );
        return r.rows.map(row => ({
            name: row.name,
            brainAge: row.brain_age,
            createdAt: row.created_at,
        }));
    } catch (err) {
        console.error('getDailyLeaderboard error:', err.message);
        return [];
    }
}

// ------------------------------------------------------------------ share ---

// Performance bands per game, as the share grid renders them. The thresholds
// are the same ones the brain-age calculation already treats as good/ok/poor,
// so a green square and a low brain age never contradict each other.
export const SHARE_SQUARES = { great: '🟩', ok: '🟨', poor: '🟥' };

/**
 * Band one game's score. `reaction` is milliseconds (lower is better);
 * everything else is a 0-100 score (higher is better).
 */
export function bandForScore(gameId, score) {
    const n = Number(score);
    if (!Number.isFinite(n)) return 'poor';
    if (gameId === 'reaction') {
        if (n <= 300) return 'great';
        if (n <= 450) return 'ok';
        return 'poor';
    }
    if (n >= 80) return 'great';
    if (n >= 50) return 'ok';
    return 'poor';
}

/**
 * The public URL to put under a shared result. Empty until the site actually
 * has an address — a share line pointing at localhost helps nobody, so the
 * URL is simply left off rather than guessed.
 */
export function shareUrl() {
    const raw = process.env.PUBLIC_URL || process.env.RENDER_EXTERNAL_URL || '';
    return raw.trim().replace(/\/+$/, '');
}

/**
 * The text a player copies to their clipboard. Deliberately small: a title
 * line, the number, three squares, and the URL. Anything longer stops being
 * pasteable into a chat.
 */
export function buildShareText(day, brainAge, games, siteUrl) {
    const squares = (games || [])
        .map(g => SHARE_SQUARES[bandForScore(g.gameId, g.score)] || SHARE_SQUARES.poor)
        .join('');
    const lines = [
        `StrictHotel Daily ${day}`,
        `🧠 Gehirnalter ${brainAge}`,
        squares,
    ];
    if (siteUrl) lines.push(siteUrl);
    return lines.join('\n');
}
