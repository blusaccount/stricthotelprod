// ============== FOOD GUESSR — LEADERBOARDS PERSISTENCE ==============
//
// Two tables:
//   food_scrandle_streaks  — best streak per (player, variant) for the
//                            higher/lower modes
//   food_classic_scores    — best score per player for the 3-round
//                            country-guess mode
//
// Both fall back to in-memory Maps when DATABASE_URL is not configured.

import { isDatabaseEnabled, query } from './db.js';

const VALID_VARIANTS = new Set(['wiki', 'community']);

// In-memory fallback
// scrandle: Map<variant, Map<playerName, { best, runs, updatedAt }>>
// classic:  Map<playerName, { best, total, perfect, updatedAt }>
const memScrandle = new Map([['wiki', new Map()], ['community', new Map()]]);
const memClassic = new Map();

// ─── SCRANDLE ───

export async function recordScrandleStreak(playerName, variant, streak) {
    if (!playerName || !VALID_VARIANTS.has(variant)) return;
    const value = Math.max(0, Math.floor(Number(streak) || 0));

    if (isDatabaseEnabled()) {
        try {
            await query(
                `INSERT INTO food_scrandle_streaks (player_name, variant, best_streak, total_runs)
                 VALUES ($1, $2, $3, 1)
                 ON CONFLICT (player_name, variant) DO UPDATE
                 SET best_streak = GREATEST(food_scrandle_streaks.best_streak, EXCLUDED.best_streak),
                     total_runs = food_scrandle_streaks.total_runs + 1,
                     updated_at = now()`,
                [playerName, variant, value]
            );
        } catch (err) {
            console.error('[FoodLeaderboards] recordScrandleStreak DB error:', err.message);
        }
    }
    // In-memory mirror
    const bucket = memScrandle.get(variant);
    const prev = bucket.get(playerName) || { best: 0, runs: 0, updatedAt: 0 };
    bucket.set(playerName, {
        best: Math.max(prev.best, value),
        runs: prev.runs + 1,
        updatedAt: Date.now()
    });
}

export async function getScrandleLeaderboard(variant, limit = 10) {
    if (!VALID_VARIANTS.has(variant)) return [];
    const lim = Math.max(1, Math.min(50, Math.floor(Number(limit) || 10)));

    if (isDatabaseEnabled()) {
        try {
            const result = await query(
                `SELECT player_name, best_streak, total_runs, updated_at
                 FROM food_scrandle_streaks
                 WHERE variant = $1
                 ORDER BY best_streak DESC, updated_at DESC
                 LIMIT $2`,
                [variant, lim]
            );
            return result.rows.map(r => ({
                name: r.player_name,
                best: Number(r.best_streak) || 0,
                runs: Number(r.total_runs) || 0
            }));
        } catch (err) {
            console.error('[FoodLeaderboards] getScrandleLeaderboard DB error:', err.message);
        }
    }
    // Memory fallback
    const bucket = memScrandle.get(variant);
    const rows = [];
    for (const [name, data] of bucket) {
        rows.push({ name, best: data.best, runs: data.runs, updatedAt: data.updatedAt });
    }
    rows.sort((a, b) => b.best - a.best || b.updatedAt - a.updatedAt);
    return rows.slice(0, lim).map(r => ({ name: r.name, best: r.best, runs: r.runs }));
}

export async function getScrandlePlayerStats(playerName) {
    if (!playerName) return {};
    if (isDatabaseEnabled()) {
        try {
            const result = await query(
                `SELECT variant, best_streak, total_runs
                 FROM food_scrandle_streaks WHERE player_name = $1`,
                [playerName]
            );
            const out = {};
            for (const r of result.rows) {
                out[r.variant] = { best: Number(r.best_streak) || 0, runs: Number(r.total_runs) || 0 };
            }
            return out;
        } catch (err) {
            console.error('[FoodLeaderboards] getScrandlePlayerStats DB error:', err.message);
        }
    }
    const out = {};
    for (const [variant, bucket] of memScrandle) {
        const d = bucket.get(playerName);
        if (d) out[variant] = { best: d.best, runs: d.runs };
    }
    return out;
}

// ─── CLASSIC ───

export async function recordClassicScore(playerName, score, isPerfect) {
    if (!playerName) return;
    const value = Math.max(0, Math.floor(Number(score) || 0));
    const perfectInc = isPerfect ? 1 : 0;

    if (isDatabaseEnabled()) {
        try {
            await query(
                `INSERT INTO food_classic_scores (player_name, best_score, total_games, perfect_games)
                 VALUES ($1, $2, 1, $3)
                 ON CONFLICT (player_name) DO UPDATE
                 SET best_score = GREATEST(food_classic_scores.best_score, EXCLUDED.best_score),
                     total_games = food_classic_scores.total_games + 1,
                     perfect_games = food_classic_scores.perfect_games + EXCLUDED.perfect_games,
                     updated_at = now()`,
                [playerName, value, perfectInc]
            );
        } catch (err) {
            console.error('[FoodLeaderboards] recordClassicScore DB error:', err.message);
        }
    }
    const prev = memClassic.get(playerName) || { best: 0, total: 0, perfect: 0, updatedAt: 0 };
    memClassic.set(playerName, {
        best: Math.max(prev.best, value),
        total: prev.total + 1,
        perfect: prev.perfect + perfectInc,
        updatedAt: Date.now()
    });
}

export async function getClassicLeaderboard(limit = 10) {
    const lim = Math.max(1, Math.min(50, Math.floor(Number(limit) || 10)));
    if (isDatabaseEnabled()) {
        try {
            const result = await query(
                `SELECT player_name, best_score, total_games, perfect_games, updated_at
                 FROM food_classic_scores
                 ORDER BY best_score DESC, updated_at DESC
                 LIMIT $1`,
                [lim]
            );
            return result.rows.map(r => ({
                name: r.player_name,
                best: Number(r.best_score) || 0,
                total: Number(r.total_games) || 0,
                perfect: Number(r.perfect_games) || 0
            }));
        } catch (err) {
            console.error('[FoodLeaderboards] getClassicLeaderboard DB error:', err.message);
        }
    }
    const rows = [];
    for (const [name, d] of memClassic) {
        rows.push({ name, best: d.best, total: d.total, perfect: d.perfect, updatedAt: d.updatedAt });
    }
    rows.sort((a, b) => b.best - a.best || b.updatedAt - a.updatedAt);
    return rows.slice(0, lim).map(r => ({ name: r.name, best: r.best, total: r.total, perfect: r.perfect }));
}

export async function getClassicPlayerStats(playerName) {
    if (!playerName) return null;
    if (isDatabaseEnabled()) {
        try {
            const result = await query(
                'SELECT best_score, total_games, perfect_games FROM food_classic_scores WHERE player_name = $1',
                [playerName]
            );
            if (!result.rows.length) return null;
            const r = result.rows[0];
            return {
                best: Number(r.best_score) || 0,
                total: Number(r.total_games) || 0,
                perfect: Number(r.perfect_games) || 0
            };
        } catch (err) {
            console.error('[FoodLeaderboards] getClassicPlayerStats DB error:', err.message);
        }
    }
    const d = memClassic.get(playerName);
    return d ? { best: d.best, total: d.total, perfect: d.perfect } : null;
}
