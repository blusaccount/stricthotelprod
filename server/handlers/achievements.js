import { getCatalog, listUnlocked, listProgress } from '../achievements.js';
import { pushActivity } from '../activity-feed.js';

export function registerAchievementHandlers(socket, io, deps) {
    const { checkRateLimit, onlinePlayers } = deps;

    socket.on('achievements-catalog', () => { try {
        if (!checkRateLimit(socket, 5)) return;
        socket.emit('achievements-catalog-result', { catalog: getCatalog() });
    } catch (err) {
        console.error('achievements-catalog error:', err.message);
    } });

    socket.on('achievements-status', async () => { try {
        if (!checkRateLimit(socket, 5)) return;
        const player = onlinePlayers.get(socket.id);
        if (!player || !player.name) {
            socket.emit('achievements-status-result', { error: 'Not logged in' });
            return;
        }
        const [unlocked, progress] = await Promise.all([
            listUnlocked(player.name),
            listProgress(player.name)
        ]);
        socket.emit('achievements-status-result', {
            unlocked: unlocked.map(u => u.id),
            unlockedAt: Object.fromEntries(unlocked.map(u => [u.id, u.unlocked_at])),
            progress
        });
    } catch (err) {
        console.error('achievements-status error:', err.message);
        socket.emit('achievements-status-result', { error: 'Failed to load achievements' });
    } });
}

/**
 * Broadcast unlock toasts to every connected socket of a given player, and
 * push each unlock onto the lobby-wide activity feed. Imported by individual
 * game handlers after they `bump()` a counter.
 */
export function notifyUnlocks(io, onlinePlayers, playerName, unlocks) {
    if (!unlocks || !unlocks.length) return;
    for (const [socketId, p] of onlinePlayers) {
        if (p.name === playerName) {
            const sock = io.sockets.sockets.get(socketId);
            if (sock) sock.emit('achievement-unlocked', { unlocks });
        }
    }
    for (const a of unlocks) {
        pushActivity({
            type: 'achievement', player: playerName,
            text: `Unlocked "${a.title}"`,
            icon: a.icon || '🏅',
            color: a.tier === 'platinum' ? 'magenta' : a.tier === 'gold' ? 'gold' : 'cyan',
            meta: { id: a.id, tier: a.tier }
        });
    }
}
