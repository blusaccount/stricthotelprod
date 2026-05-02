import {
    getCatalog,
    listUnlocked,
    listProgress,
    bump
} from '../achievements.js';

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

// Helper used by other handlers: emit unlock toasts to a player's socket(s).
export function notifyUnlocks(io, onlinePlayers, playerName, unlocks) {
    if (!unlocks || !unlocks.length) return;
    for (const [socketId, p] of onlinePlayers) {
        if (p.name === playerName) {
            const sock = io.sockets.sockets.get(socketId);
            if (sock) sock.emit('achievement-unlocked', { unlocks });
        }
    }
}

// Factory: build the per-request achievement helper exposed via deps. Saves
// every casino handler from importing both `bump` and `notifyUnlocks` and
// from re-implementing the floor() rule for max_balance bumps.
export function makeAchievementsHelper(io, onlinePlayers) {
    return {
        /** Bump a counter and broadcast any unlocks. Returns the unlocks array. */
        async bumpAndNotify(playerName, counter, delta = 1, mode = 'add') {
            if (!playerName) return [];
            const unlocks = await bump(playerName, counter, delta, mode);
            notifyUnlocks(io, onlinePlayers, playerName, unlocks);
            return unlocks;
        },
        /** Convenience: max-balance bump with the canonical floor() rule. */
        async bumpMaxBalance(playerName, balance) {
            if (!playerName || typeof balance !== 'number' || !Number.isFinite(balance)) return [];
            return this.bumpAndNotify(playerName, 'max_balance', Math.floor(balance), 'max');
        },
        /** Bump multiple counters and broadcast all unlocks together. */
        async bumpManyAndNotify(playerName, bumps) {
            if (!playerName) return [];
            const all = [];
            for (const [counter, delta = 1, mode = 'add'] of bumps) {
                if (counter == null) continue;
                all.push(...await bump(playerName, counter, delta, mode));
            }
            notifyUnlocks(io, onlinePlayers, playerName, all);
            return all;
        }
    };
}
