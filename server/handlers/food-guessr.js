// ============== FOOD GUESSR — Socket Handlers ==============
//
// Events:
//   food-rating-vote        { dishKey, rating: 1|-1 }       → persist + broadcast new aggregate
//   food-rating-state                                          → reply with { aggregates, myVotes }
//   food-classic-finish     { score, perfect: bool }        → persist + reply leaderboard
//   food-scrandle-finish    { variant: 'wiki'|'community', streak } → persist + reply leaderboard
//   food-leaderboards                                          → reply with all three boards + myStats
//
// Server emits:
//   food-rating-update      { dishKey, agg }                broadcast on every vote
//   food-rating-state       { aggregates, myVotes }
//   food-rating-vote-ack    { dishKey, rating }
//   food-rating-error       { message }
//   food-leaderboards-data  { classic, scrandleWiki, scrandleCommunity, myStats }

import { recordVote, getAggregates, getPlayerVotes } from '../food-ratings-store.js';
import {
    recordScrandleStreak,
    recordClassicScore,
    getScrandleLeaderboard,
    getClassicLeaderboard,
    getScrandlePlayerStats,
    getClassicPlayerStats
} from '../food-leaderboards-store.js';

const MAX_DISH_KEY_LEN = 120;
const MAX_CLASSIC_SCORE = 3000;     // 3 rounds × 1000 ceiling
const MAX_SCRANDLE_STREAK = 10000;  // sanity cap

function validateDishKey(key) {
    if (typeof key !== 'string') return null;
    const trimmed = key.trim();
    if (!trimmed || trimmed.length > MAX_DISH_KEY_LEN) return null;
    // Reject control characters and angle brackets / quotes (basic XSS hygiene
    // even though this value never reaches innerHTML). Wikipedia titles can
    // include Unicode (Bún_chả) and parentheses (Dosa_(food)), so we use a
    // deny-list instead of an allow-list.
    if (/[\x00-\x1f<>"`]/.test(trimmed)) return null;
    return trimmed;
}

async function buildLeaderboardPayload(playerName) {
    const [classic, scrandleWiki, scrandleCommunity, myClassic, myScrandle] = await Promise.all([
        getClassicLeaderboard(10),
        getScrandleLeaderboard('wiki', 10),
        getScrandleLeaderboard('community', 10),
        playerName ? getClassicPlayerStats(playerName) : null,
        playerName ? getScrandlePlayerStats(playerName) : {}
    ]);
    return {
        classic, scrandleWiki, scrandleCommunity,
        myStats: { classic: myClassic, scrandle: myScrandle }
    };
}

export function registerFoodGuessrHandlers(socket, io, { checkRateLimit, onlinePlayers }) {

    function getPlayerName() {
        const p = onlinePlayers.get(socket.id);
        return p && p.name ? String(p.name).trim() : '';
    }

    // ─── Vote ───
    socket.on('food-rating-vote', async (data) => {
        try {
            if (!checkRateLimit(socket, 8)) return;
            const playerName = getPlayerName();
            if (!playerName) {
                socket.emit('food-rating-error', { message: 'Not registered' });
                return;
            }
            if (!data || typeof data !== 'object') return;
            const dishKey = validateDishKey(data.dishKey);
            if (!dishKey) {
                socket.emit('food-rating-error', { message: 'Invalid dish key' });
                return;
            }
            const rating = data.rating === 1 ? 1 : data.rating === -1 ? -1 : null;
            if (rating === null) {
                socket.emit('food-rating-error', { message: 'Invalid rating' });
                return;
            }

            await recordVote(playerName, dishKey, rating);

            const aggregates = await getAggregates();
            const agg = aggregates[dishKey] || { likes: 0, dislikes: 0, total: 0 };
            io.emit('food-rating-update', { dishKey, agg });
            socket.emit('food-rating-vote-ack', { dishKey, rating });
        } catch (err) {
            console.error('food-rating-vote error:', err.message);
            try { socket.emit('food-rating-error', { message: 'Server error' }); } catch (_) {}
        }
    });

    // ─── Initial state fetch ───
    socket.on('food-rating-state', async () => {
        try {
            if (!checkRateLimit(socket, 4)) return;
            const playerName = getPlayerName();
            const aggregates = await getAggregates();
            const myVotes = playerName ? await getPlayerVotes(playerName) : {};
            socket.emit('food-rating-state', { aggregates, myVotes });
        } catch (err) {
            console.error('food-rating-state error:', err.message);
            try { socket.emit('food-rating-error', { message: 'Server error' }); } catch (_) {}
        }
    });

    // ─── Classic finish → record + return leaderboards ───
    socket.on('food-classic-finish', async (data) => {
        try {
            if (!checkRateLimit(socket, 2)) return;
            const playerName = getPlayerName();
            if (!playerName) {
                socket.emit('food-rating-error', { message: 'Not registered' });
                return;
            }
            if (!data || typeof data !== 'object') return;
            const score = Math.max(0, Math.min(MAX_CLASSIC_SCORE, Math.floor(Number(data.score) || 0)));
            const perfect = Boolean(data.perfect) && score >= MAX_CLASSIC_SCORE;

            await recordClassicScore(playerName, score, perfect);
            const payload = await buildLeaderboardPayload(playerName);
            socket.emit('food-leaderboards-data', payload);
        } catch (err) {
            console.error('food-classic-finish error:', err.message);
        }
    });

    // ─── Scrandle finish → record + return leaderboards ───
    socket.on('food-scrandle-finish', async (data) => {
        try {
            if (!checkRateLimit(socket, 2)) return;
            const playerName = getPlayerName();
            if (!playerName) {
                socket.emit('food-rating-error', { message: 'Not registered' });
                return;
            }
            if (!data || typeof data !== 'object') return;
            const variant = data.variant === 'community' ? 'community' :
                            data.variant === 'wiki' ? 'wiki' : null;
            if (!variant) return;
            const streak = Math.max(0, Math.min(MAX_SCRANDLE_STREAK, Math.floor(Number(data.streak) || 0)));

            await recordScrandleStreak(playerName, variant, streak);
            const payload = await buildLeaderboardPayload(playerName);
            socket.emit('food-leaderboards-data', payload);
        } catch (err) {
            console.error('food-scrandle-finish error:', err.message);
        }
    });

    // ─── On-demand leaderboard fetch (e.g. menu / final screen entry) ───
    socket.on('food-leaderboards', async () => {
        try {
            if (!checkRateLimit(socket, 4)) return;
            const playerName = getPlayerName();
            const payload = await buildLeaderboardPayload(playerName);
            socket.emit('food-leaderboards-data', payload);
        } catch (err) {
            console.error('food-leaderboards error:', err.message);
        }
    });
}
