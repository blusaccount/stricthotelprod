import {
    rooms, onlinePlayers, socketToRoom,
    broadcastOnlinePlayers, broadcastLobbies,
    getRoom, removePlayerFromRoom
} from './room-manager.js';
import { getSocketIp } from './socket-utils.js';

import { registerCurrencyHandlers } from './handlers/currency.js';
import { registerLobbyHandlers } from './handlers/lobby.js';
import { registerMaexchenHandlers } from './handlers/maexchen.js';
import { registerBrainVersusHandlers, cleanupBrainVersusOnDisconnect } from './handlers/brain-versus.js';
import { registerStocksHandlers, cleanupStockQuoteCache } from './handlers/stocks.js';
import { registerPictochatHandlers, cleanupPictochatOnDisconnect } from './handlers/pictochat.js';
import { registerSoundboardHandlers } from './handlers/soundboard.js';
import { registerLoopMachineHandlers, cleanupLoopOnDisconnect } from './handlers/loop-machine.js';
import { registerStrictly7sHandlers } from './handlers/strictly7s.js';
import { registerPlinkoHandlers } from './handlers/plinko.js';
import { registerCrashHandlers, startCrashLoop } from './handlers/crash.js';
import { registerWatchpartyHandlers } from './handlers/watchparty.js';
import { registerLobbyWatchpartyHandlers, cleanupLobbyWatchpartyOnDisconnect } from './handlers/lobby-watchparty.js';
import { registerTierlistHandlers, cleanupTierlistOnDisconnect } from './handlers/tierlist.js';
import { registerDailyStreakHandlers, cleanupStreakRateLimitOnDisconnect } from './handlers/daily-streak.js';
import { registerAchievementHandlers } from './handlers/achievements.js';
import { registerActivityFeedHandlers } from './handlers/activity-feed.js';
import { attachActivityFeed } from './activity-feed.js';
import { registerBlackjackHandlers } from './handlers/blackjack.js';
import { registerRouletteHandlers, cleanupRouletteCooldown } from './handlers/roulette.js';
import { registerFoodGuessrHandlers } from './handlers/food-guessr.js';

// ============== RATE LIMITING ==============

const rateLimiters = new Map(); // socketId -> { count, resetTime }
const rateLimitersIp = new Map(); // ip -> { count, resetTime }
const stockTradeCooldown = new Map(); // playerName -> timestamp
const strictly7sSpinCooldown = new Map(); // socketId -> timestamp
const plinkoDropCooldown = new Map(); // socketId -> timestamp

function checkRateLimit(socketOrId, maxPerSecond = 10) {
    const now = Date.now();
    const socketId = typeof socketOrId === 'string' ? socketOrId : socketOrId?.id;
    if (!socketId) return false;

    let entry = rateLimiters.get(socketId);
    if (!entry || now > entry.resetTime) {
        entry = { count: 0, resetTime: now + 1000 };
        rateLimiters.set(socketId, entry);
    }
    entry.count++;
    if (entry.count > maxPerSecond) return false;

    if (typeof socketOrId !== 'string') {
        const ip = getSocketIp(socketOrId);
        let ipEntry = rateLimitersIp.get(ip);
        if (!ipEntry || now > ipEntry.resetTime) {
            ipEntry = { count: 0, resetTime: now + 1000 };
            rateLimitersIp.set(ip, ipEntry);
        }
        ipEntry.count++;
        if (ipEntry.count > maxPerSecond) return false;
    }

    return true;
}

// Keyed by player identity (player.name), not socket.id — a per-socket key
// lets a player dodge the cooldown by opening a second tab or reconnecting,
// since each new socket gets its own untouched cooldown entry.
export function checkStockTradeCooldown(playerName, minIntervalMs = 400) {
    const now = Date.now();
    const lastTradeAt = stockTradeCooldown.get(playerName) || 0;
    if (now - lastTradeAt < minIntervalMs) return false;
    stockTradeCooldown.set(playerName, now);
    return true;
}

// Keyed by player identity (player.name) since the issue-#152 handler
// hardening — a per-socket key let a player dodge the spin cooldown via a
// second tab or reconnect. The strictly7s handler calls this inside its
// per-player action lock, so a queued duplicate click is rejected here.
function checkStrictly7sCooldown(playerName, minIntervalMs = 1200) {
    const now = Date.now();
    const lastSpinAt = strictly7sSpinCooldown.get(playerName) || 0;
    if (now - lastSpinAt < minIntervalMs) return false;
    strictly7sSpinCooldown.set(playerName, now);
    return true;
}

function checkPlinkoCooldown(socketId, minIntervalMs = 600) {
    const now = Date.now();
    const lastDropAt = plinkoDropCooldown.get(socketId) || 0;
    if (now - lastDropAt < minIntervalMs) return false;
    plinkoDropCooldown.set(socketId, now);
    return true;
}

export function cleanupRateLimiters() {
    const now = Date.now();
    for (const [id, entry] of rateLimiters) {
        if (now > entry.resetTime) rateLimiters.delete(id);
    }
    for (const [ip, entry] of rateLimitersIp) {
        if (now > entry.resetTime) rateLimitersIp.delete(ip);
    }
    // Clean up stale cooldown entries (older than 1 minute)
    const cooldownStaleThreshold = now - 60000;
    for (const [id, timestamp] of stockTradeCooldown) {
        if (timestamp < cooldownStaleThreshold) stockTradeCooldown.delete(id);
    }
    for (const [id, timestamp] of strictly7sSpinCooldown) {
        if (timestamp < cooldownStaleThreshold) strictly7sSpinCooldown.delete(id);
    }
    for (const [id, timestamp] of plinkoDropCooldown) {
        if (timestamp < cooldownStaleThreshold) plinkoDropCooldown.delete(id);
    }
    cleanupStockQuoteCache();
}

export function registerSocketHandlers(io, { fetchTickerQuotes, getYahooFinance, isStockGameEnabled = true } = {}) {
    // Start the global Crash round loop once for the entire server.
    startCrashLoop(io);
    // Wire the activity feed broadcaster to this io instance.
    attachActivityFeed(io);

    const deps = {
        checkRateLimit,
        checkStockTradeCooldown,
        checkStrictly7sCooldown,
        checkPlinkoCooldown,
        rooms,
        onlinePlayers,
        socketToRoom,
        broadcastOnlinePlayers,
        broadcastLobbies,
        getRoom,
        removePlayerFromRoom,
        fetchTickerQuotes,
        getYahooFinance,
        isStockGameEnabled
    };

    io.on('connection', (socket) => {
        registerCurrencyHandlers(socket, io, deps);
        registerLobbyHandlers(socket, io, deps);
        registerMaexchenHandlers(socket, io, deps);
        registerBrainVersusHandlers(socket, io, deps);
        registerStocksHandlers(socket, io, deps);
        registerPictochatHandlers(socket, io, deps);
        registerSoundboardHandlers(socket, io, deps);
        registerLoopMachineHandlers(socket, io, deps);
        registerStrictly7sHandlers(socket, io, deps);
        registerPlinkoHandlers(socket, io, deps);
        registerCrashHandlers(socket, io, deps);
        registerWatchpartyHandlers(socket, io, deps);
        registerLobbyWatchpartyHandlers(socket, io, deps);
        registerTierlistHandlers(socket, io, deps);
        registerDailyStreakHandlers(socket, io, deps);
        registerAchievementHandlers(socket, io, deps);
        registerActivityFeedHandlers(socket, io, deps);
        registerBlackjackHandlers(socket, io, deps);
        registerRouletteHandlers(socket, io, deps);
        registerFoodGuessrHandlers(socket, io, deps);

        socket.on('disconnect', async () => { try {
            rateLimiters.delete(socket.id);
            stockTradeCooldown.delete(socket.id);
            strictly7sSpinCooldown.delete(socket.id);
            plinkoDropCooldown.delete(socket.id);
            cleanupStreakRateLimitOnDisconnect(socket.id);
            cleanupRouletteCooldown(socket.id);
            cleanupLobbyWatchpartyOnDisconnect(socket.id);

            cleanupPictochatOnDisconnect(socket.id, io);
            cleanupLoopOnDisconnect(socket.id, io);
            cleanupTierlistOnDisconnect(socket.id, io);

            onlinePlayers.delete(socket.id);
            broadcastOnlinePlayers(io);

            const room = getRoom(socket.id);
            if (room) {
                await cleanupBrainVersusOnDisconnect(socket, room, io);
                await removePlayerFromRoom(io, socket.id, room);
                if (room.gameType === 'strictbrain') {
                    broadcastLobbies(io, 'strictbrain');
                }
            }
        } catch (err) { console.error('disconnect error:', err.message); } });
    });
}
