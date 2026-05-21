// ============== FOOD GUESSR — Socket Handlers ==============
//
// Events:
//   food-rating-vote   { dishKey: string, rating: 1 | -1 }    → persist + broadcast new aggregate
//   food-rating-state                                           → reply with { aggregates, myVotes }
//
// Server emits:
//   food-rating-update    { dishKey, agg: { likes, dislikes, total } }    broadcast on every vote
//   food-rating-state     { aggregates: { [dishKey]: agg }, myVotes: { [dishKey]: 1 | -1 } }
//   food-rating-error     { message }

import { recordVote, getAggregates, getPlayerVotes } from '../food-ratings-store.js';

const MAX_DISH_KEY_LEN = 120;

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

export function registerFoodGuessrHandlers(socket, io, { checkRateLimit, onlinePlayers }) {

    // ─── Vote ───
    socket.on('food-rating-vote', async (data) => {
        try {
            if (!checkRateLimit(socket, 8)) return;
            const player = onlinePlayers.get(socket.id);
            const playerName = player && player.name ? String(player.name).trim() : '';
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

            // Send refreshed aggregate for this dish to every connected client
            const aggregates = await getAggregates();
            const agg = aggregates[dishKey] || { likes: 0, dislikes: 0, total: 0 };
            io.emit('food-rating-update', { dishKey, agg });

            // Acknowledge to the voter with their own updated record
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
            const player = onlinePlayers.get(socket.id);
            const playerName = player && player.name ? String(player.name).trim() : '';
            const aggregates = await getAggregates();
            const myVotes = playerName ? await getPlayerVotes(playerName) : {};
            socket.emit('food-rating-state', { aggregates, myVotes });
        } catch (err) {
            console.error('food-rating-state error:', err.message);
            try { socket.emit('food-rating-error', { message: 'Server error' }); } catch (_) {}
        }
    });
}
