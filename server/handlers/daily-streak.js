import { getStreakStatus, claimStreak } from '../daily-streak.js';
import { bump } from '../achievements.js';
import { notifyUnlocks } from './achievements.js';

const claimRateLimit = new Map(); // socketId -> timestamp of last claim

export function registerDailyStreakHandlers(socket, io, deps) {
    const { checkRateLimit, onlinePlayers } = deps;

    socket.on('streak-status', async () => { try {
        if (!checkRateLimit(socket, 5)) return;
        const player = onlinePlayers.get(socket.id);
        if (!player || !player.name) {
            socket.emit('streak-status-result', { error: 'Not logged in' });
            return;
        }
        const status = await getStreakStatus(player.name);
        socket.emit('streak-status-result', status);
    } catch (err) {
        console.error('streak-status error:', err.message);
        socket.emit('streak-status-result', { error: 'Failed to load streak status' });
    } });

    socket.on('streak-claim', async () => { try {
        if (!checkRateLimit(socket, 3)) return;
        const player = onlinePlayers.get(socket.id);
        if (!player || !player.name) {
            socket.emit('streak-claim-result', { ok: false, reason: 'not_logged_in' });
            return;
        }
        // Per-socket cooldown so clicking the button rapidly doesn't double-fire.
        const now = Date.now();
        const last = claimRateLimit.get(socket.id) || 0;
        if (now - last < 1500) {
            socket.emit('streak-claim-result', { ok: false, reason: 'cooldown' });
            return;
        }
        claimRateLimit.set(socket.id, now);

        const result = await claimStreak(player.name);
        socket.emit('streak-claim-result', result);
        if (result.ok && typeof result.newBalance === 'number') {
            socket.emit('balance-update', { balance: result.newBalance });
        }
        // Achievement bump for streak length.
        if (result.ok) {
            const unlocks = await bump(player.name, 'streak_max', result.maxStreak, 'max');
            const unlocks2 = typeof result.newBalance === 'number'
                ? await bump(player.name, 'max_balance', Math.floor(result.newBalance), 'max')
                : [];
            notifyUnlocks(io, onlinePlayers, player.name, [...unlocks, ...unlocks2]);
        }
        // Refresh status in the same event so the client always converges.
        const status = await getStreakStatus(player.name);
        socket.emit('streak-status-result', status);
    } catch (err) {
        console.error('streak-claim error:', err.message);
        socket.emit('streak-claim-result', { ok: false, reason: 'server_error' });
    } });
}

export function cleanupStreakRateLimitOnDisconnect(socketId) {
    claimRateLimit.delete(socketId);
}
