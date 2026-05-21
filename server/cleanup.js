import { rooms, onlinePlayers, socketToRoom, broadcastOnlinePlayers } from './room-manager.js';
import { cleanupRateLimiters } from './socket-handlers.js';
import { cleanupStaleBlackjackGames } from './handlers/blackjack.js';
import { cleanupStaleFreeSpins } from './handlers/strictly7s.js';

export function startPeriodicCleanup(io) {
    // Every 5 minutes: remove orphaned entries where socket is no longer connected
    setInterval(() => {
        const connectedIds = new Set();
        for (const [id] of io.sockets.sockets) {
            connectedIds.add(id);
        }

        // Cleanup onlinePlayers
        let removedPlayers = 0;
        for (const [socketId] of onlinePlayers) {
            if (!connectedIds.has(socketId)) {
                onlinePlayers.delete(socketId);
                removedPlayers++;
            }
        }

        // Cleanup socketToRoom lookup
        for (const [socketId] of socketToRoom) {
            if (!connectedIds.has(socketId)) socketToRoom.delete(socketId);
        }

        // Cleanup rooms with disconnected players
        let removedRooms = 0;
        for (const [code, room] of rooms) {
            room.players = room.players.filter(p => connectedIds.has(p.socketId));
            if (room.players.length === 0) {
                rooms.delete(code);
                removedRooms++;
            } else if (!connectedIds.has(room.hostId)) {
                room.hostId = room.players[0].socketId;
            }
        }

        // Cleanup rate limiters
        cleanupRateLimiters();

        // Evict abandoned per-player game state so the maps don't grow without bound.
        cleanupStaleBlackjackGames();
        cleanupStaleFreeSpins();

        if (removedPlayers > 0 || removedRooms > 0) {
            console.log(`[Cleanup] Removed ${removedPlayers} orphaned players, ${removedRooms} empty rooms`);
            if (removedPlayers > 0) broadcastOnlinePlayers(io);
        }
    }, 5 * 60 * 1000);
}
