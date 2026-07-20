import { getAlivePlayers, nextAlivePlayerIndex } from './game-logic.js';
import { addBalance } from './currency.js';
import { pushActivity } from './activity-feed.js';
import { emitToUser } from './socket-utils.js';
import { actionKey, withActionLock } from './lib/action-guard.js';

// ============== ROOM MANAGEMENT ==============

// Serialize room-state mutations that straddle a wallet await (issue #152):
// Mäxchen bet placement, game start, challenge/believe resolution and
// player removal all share this per-room lock, so no two of them can
// interleave around each other's awaits. Nothing running inside the lock
// may take it again (removePlayerFromRoom and the maexchen handlers never
// call each other), so there is no reentrant path.
export function roomActionLock(room, fn) {
    return withActionLock(actionKey('room', room.code), fn);
}

export const rooms = new Map();
export const socketToRoom = new Map(); // socketId -> roomCode (O(1) lookup)

// Track all online players globally
export const onlinePlayers = new Map(); // socketId -> { name, character, game }

// Broadcast online players to all clients.
//
// Each user can hold multiple sockets simultaneously (parent shell + iframe
// game), so we dedup by player name. When two sockets share a name, the one
// in an actual game (game !== 'lobby') wins so presence shows "Tom is in
// Casino" rather than "Tom is in Lobby" while he's playing.
export function broadcastOnlinePlayers(io) {
    const byName = new Map();
    for (const p of onlinePlayers.values()) {
        if (!p || !p.name) continue;
        const existing = byName.get(p.name);
        if (!existing) { byName.set(p.name, p); continue; }
        const existingIsLobby = existing.game === 'lobby' || !existing.game;
        const candidateIsLobby = p.game === 'lobby' || !p.game;
        if (existingIsLobby && !candidateIsLobby) byName.set(p.name, p);
    }
    io.emit('online-players', Array.from(byName.values()));
}

// Get open lobbies for a specific game
export function getOpenLobbies(gameType) {
    const lobbies = [];
    for (const [code, room] of rooms) {
        // Show rooms that match game type and are either not started or are watch parties (joinable anytime)
        const isJoinable = !room.game || room.gameType === 'watchparty';
        if (isJoinable && room.gameType === gameType) {
            lobbies.push({
                code: code,
                hostName: room.players.find(p => p.socketId === room.hostId)?.name || 'Unknown',
                playerCount: room.players.length,
                maxPlayers: 6,
                started: !!room.game,
                players: room.players.map(p => ({
                    name: p.name,
                    character: p.character
                }))
            });
        }
    }
    return lobbies;
}

// Broadcast lobbies to clients in a specific game
export function broadcastLobbies(io, gameType) {
    const lobbies = getOpenLobbies(gameType);
    io.emit('lobbies-update', { gameType, lobbies });
}

export function generateRoomCode() {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code;
    do {
        code = '';
        for (let i = 0; i < 4; i++) {
            code += chars[Math.floor(Math.random() * chars.length)];
        }
    } while (rooms.has(code));
    return code;
}

export function getRoom(socketId) {
    const code = socketToRoom.get(socketId);
    if (code) {
        const room = rooms.get(code);
        if (room) return room;
        // Stale entry — clean up
        socketToRoom.delete(socketId);
    }
    return null;
}

export function broadcastRoomState(io, room) {
    io.to(room.code).emit('room-update', {
        players: room.players.map(p => ({
            name: p.name,
            isHost: p.socketId === room.hostId,
            character: p.character
        })),
        hostId: room.hostId
    });
}

export function sendTurnStart(io, room) {
    const game = room.game;
    const currentPlayer = game.players[game.currentIndex];

    io.to(room.code).emit('turn-start', {
        currentPlayerIndex: game.currentIndex,
        currentPlayerName: currentPlayer.name,
        previousAnnouncement: game.previousAnnouncement,
        isFirstTurn: game.isFirstTurn,
        players: game.players.map(p => ({ name: p.name, lives: p.lives, character: p.character }))
    });

    // Reset turn state
    game.currentRoll = null;
    game.hasRolled = false;
}

// ============== POT PAYOUT HELPER ==============
// Shared logic to award pot to winner and emit game-over

export async function awardPotAndEndGame(io, room, winnerName, alive) {
    // Exactly-once guard (issue #152): capture and clear room.game
    // synchronously BEFORE the payout await — the brain-versus forfeit
    // pattern. Three entry points funnel here (challenge, believe-maexchen,
    // disconnect via removePlayerFromRoom); whichever runs first wins this
    // check-and-clear atomically, every later caller sees null and bails
    // instead of paying the pot again.
    const game = room.game;
    if (!game) return;
    room.game = null;

    const pot = game.pot || 0;

    if (pot > 0 && alive[0]) {
        const newBalance = await addBalance(alive[0].name, pot, 'maexchen_pot_win', { roomCode: room.code });
        if (newBalance !== null) {
            emitToUser(io, alive[0].name, 'balance-update', { balance: newBalance });
        }
        // Activity feed: Mäxchen wins are inherently social — broadcast.
        pushActivity({
            type: 'maexchen_win', player: alive[0].name,
            text: `Won the Mäxchen pot for ${pot} SC`,
            icon: '🎲', color: 'gold',
            meta: { game: 'maexchen', amount: pot, room: room.code }
        });
    }

    // Achievement bumps for every player who participated.
    try {
        const { bump } = await import('./achievements.js');
        for (const p of game.players) {
            await bump(p.name, 'mae_rounds', 1).catch(() => {});
        }
        if (winnerName && winnerName !== 'Niemand') {
            await bump(winnerName, 'mae_wins', 1).catch(() => {});
        }
    } catch {}

    io.to(room.code).emit('game-over', {
        winnerName,
        players: game.players.map(p => ({ name: p.name, lives: p.lives })),
        pot
    });
}

// ============== REMOVE PLAYER FROM ROOM ==============
// Shared logic for leave-room and disconnect handlers

export async function removePlayerFromRoom(io, socketId, room) {
    // Serialized with the Mäxchen bet/start/resolve handlers via the same
    // per-room lock (issue #152): a removal can no longer interleave with a
    // bet adjustment's wallet await (which used to strand deducted coins in
    // an orphaned room.bets entry) or race a game-ending pot payout.
    return roomActionLock(room, async () => {
        const playerIndex = room.players.findIndex(p => p.socketId === socketId);
        if (playerIndex === -1) return;

        const playerName = room.players[playerIndex].name;
        const gameType = room.gameType;

        // Handle active game state
        if (room.game) {
            if (room.gameType === 'watchparty') {
                const gpIdx = room.game.players.findIndex(p => p.socketId === socketId);
                if (gpIdx !== -1) {
                    room.game.players.splice(gpIdx, 1);
                }
                // Remove from room.players first so both lists are consistent before broadcast
                room.players.splice(playerIndex, 1);
                socketToRoom.delete(socketId);

                io.to(room.code).emit('player-disconnected', {
                    playerName,
                    players: room.game.players.map(p => ({ name: p.name, lives: p.lives }))
                });
            } else {
                const gamePlayer = room.game.players.find(p => p.socketId === socketId);
                if (gamePlayer && gamePlayer.lives > 0) {
                    gamePlayer.lives = 0;

                    io.to(room.code).emit('player-disconnected', {
                        playerName,
                        players: room.game.players.map(p => ({ name: p.name, lives: p.lives }))
                    });

                    if (room.game.players[room.game.currentIndex].socketId === socketId) {
                        room.game.currentIndex = nextAlivePlayerIndex(room.game, room.game.currentIndex);
                        room.game.previousAnnouncement = null;
                        room.game.isFirstTurn = true;
                    }

                    const alive = getAlivePlayers(room.game);
                    if (alive.length <= 1) {
                        const winnerName = alive[0]?.name || 'Niemand';
                        await awardPotAndEndGame(io, room, winnerName, alive);
                    } else {
                        sendTurnStart(io, room);
                    }
                }
            }
        }

        // Remove from room players (skip if already removed in watchparty branch above)
        const alreadyRemoved = room.game && room.gameType === 'watchparty';
        if (!alreadyRemoved) {
            room.players.splice(playerIndex, 1);
            socketToRoom.delete(socketId);
        }

        // Clean up bet for leaving player and reset requiredBet if no bets remain
        if (room.bets) {
            const leavingBet = room.bets[socketId] || 0;
            delete room.bets[socketId];

            // Refund pre-deducted bet if game hasn't started. Awaited so the
            // subsequent broadcast reflects the final state — earlier this was
            // fire-and-forget which could leave the wallet/broadcast inconsistent
            // when the DB write failed.
            if (leavingBet > 0 && !room.game) {
                try {
                    await addBalance(playerName, leavingBet, 'maexchen_bet_refund', { roomCode: room.code });
                } catch (err) {
                    console.error('bet refund error:', err.message);
                }
            }

            const anyBets = room.players.some(p => (room.bets[p.socketId] || 0) > 0);
            if (!anyBets) {
                room.requiredBet = 0;
            }
            if (!room.game && room.players.length > 0) {
                const betsInfo = room.players.map(p => ({
                    name: p.name,
                    bet: room.bets[p.socketId] || 0
                }));
                io.to(room.code).emit('bets-update', { bets: betsInfo, requiredBet: room.requiredBet || 0 });
            }
        }

        // Delete empty room or reassign host
        if (room.players.length === 0) {
            rooms.delete(room.code);
            broadcastLobbies(io, gameType);
            console.log(`Room ${room.code} deleted`);
        } else {
            if (room.hostId === socketId) {
                room.hostId = room.players[0].socketId;
            }
            broadcastRoomState(io, room);
            broadcastLobbies(io, gameType);
            io.to(room.code).emit('player-left', { playerName });
        }

        console.log(`${playerName} left ${room.code}`);
        return playerName;
    });
}
