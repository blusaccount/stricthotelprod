import { sanitizeName, validateCharacter, validateGameType, emitBalanceUpdate, emitToUser, userRoom } from '../socket-utils.js';
import { getBalance, addBalance, deductBalance, getDiamonds, buyDiamonds, isNewPlayer } from '../currency.js';
import { broadcastOnlinePlayers } from '../room-manager.js';
import { saveCharacter, getCharacter } from '../character-store.js';
import { bump } from '../achievements.js';
import { notifyUnlocks } from './achievements.js';
import { pushActivity } from '../activity-feed.js';

export function registerCurrencyHandlers(socket, io, { checkRateLimit, onlinePlayers }) {
    socket.on('register-player', async (data) => { try {
        if (!checkRateLimit(socket)) return;
        if (!data || typeof data !== 'object') return;

        const name = sanitizeName(data.name);
        if (!name) return;
        const character = validateCharacter(data.character);
        const game = validateGameType(data.game);

        // Leave any prior user-room (in case the socket re-registers under a
        // new name) so balance updates don't leak between players.
        const prev = onlinePlayers.get(socket.id);
        if (prev && prev.name && prev.name !== name) socket.leave(userRoom(prev.name));

        // Detect first-ever registration BEFORE we ensure the player row exists
        // (getBalance below auto-creates it).
        const firstTime = await isNewPlayer(name);

        onlinePlayers.set(socket.id, { name, character, game });
        socket.join(userRoom(name));
        broadcastOnlinePlayers(io);

        // Persist character portrait to database
        if (character) await saveCharacter(name, character);

        // Send currency balance to the player (fans out to all sockets of
        // this user, so the shell + the iframe stay in sync).
        emitToUser(io, name, 'balance-update', { balance: await getBalance(name) });

        if (firstTime) {
            pushActivity({
                type: 'first_login', player: name,
                text: 'Just checked into the hotel for the first time',
                icon: '👋', color: 'cyan',
                meta: { game: 'lobby' }
            });
        }

        console.log(`Registered: ${name} for ${game}${firstTime ? ' (first time)' : ''}`);
    } catch (err) { console.error('register-player error:', err.message); } });

    // --- Get Player Diamonds (for contacts list, by name) ---
    // Emits `player-diamonds` with the resolved { name, diamonds }. Used by contacts.js
    // to populate diamond counts for every online player.
    socket.on('get-player-diamonds', async (data) => { try {
        if (!checkRateLimit(socket)) return;
        if (!data || typeof data !== 'object') return;
        const name = sanitizeName(data.name);
        if (!name) return;

        const diamonds = await getDiamonds(name);
        socket.emit('player-diamonds', { name, diamonds });
    } catch (err) { console.error('get-player-diamonds error:', err.message); } });

    // --- Get Player Character (for contacts app) ---
    socket.on('get-player-character', async (data) => { try {
        if (!checkRateLimit(socket)) return;
        if (!data || typeof data !== 'object') return;
        const name = sanitizeName(data.name);
        if (!name) return;

        // Find the player by name in onlinePlayers
        let found = null;
        for (const [, p] of onlinePlayers) {
            if (p.name === name) {
                found = p;
                break;
            }
        }

        const character = found?.character || await getCharacter(name);
        const game = found?.game || null;
        const diamondCount = await getDiamonds(name);
        socket.emit('player-character', {
            name,
            character,
            game,
            diamonds: diamondCount
        });
    } catch (err) { console.error('get-player-character error:', err.message); } });

    // --- Get Currency Balance ---
    socket.on('get-balance', async () => { try {
        if (!checkRateLimit(socket)) return;
        const player = onlinePlayers.get(socket.id);
        if (!player) return;
        emitToUser(io, player.name, 'balance-update', { balance: await getBalance(player.name) });
    } catch (err) { console.error('get-balance error:', err.message); } });

    // --- Get My Diamonds (for the logged-in socket's own balance) ---
    // Emits `diamonds-update` with just { diamonds }. Used by shop.js.
    socket.on('get-my-diamonds', async () => { try {
        if (!checkRateLimit(socket)) return;
        const player = onlinePlayers.get(socket.id);
        if (!player || !player.name) return;
        const diamonds = await getDiamonds(player.name);
        socket.emit('diamonds-update', { diamonds });
    } catch (err) { console.error('get-my-diamonds error:', err.message); } });

    // --- Buy Diamonds ---
    socket.on('buy-diamonds', async (data) => { try {
        if (!checkRateLimit(socket)) return;
        const player = onlinePlayers.get(socket.id);
        if (!player || !player.name) return;
        
        const count = Number(data?.count) || 1;
        if (!Number.isInteger(count) || count <= 0 || count > 100) {
            socket.emit('error', { message: 'Ungültige Anzahl' });
            return;
        }
        
        const result = await buyDiamonds(player.name, count);
        if (result === null) {
            socket.emit('error', { message: 'Nicht genug Coins!' });
            return;
        }
        
        emitToUser(io, player.name, 'balance-update', { balance: result.balance });
        emitToUser(io, player.name, 'diamonds-update', { diamonds: result.diamonds });

        // Achievement bumps
        const unlocks = [];
        unlocks.push(...await bump(player.name, 'diamond_purchases', count));
        unlocks.push(...await bump(player.name, 'diamonds_owned', result.diamonds, 'max'));
        notifyUnlocks(io, onlinePlayers, player.name, unlocks);

        // Activity feed: only push for purchases of 5+ diamonds (≥1000 SC) to
        // keep the feed signal-to-noise high.
        if (count >= 5) {
            pushActivity({
                type: 'shop_purchase', player: player.name,
                text: count >= 25
                    ? `Bought a glittering ${count} diamonds`
                    : `Bought ${count} diamonds in the shop`,
                icon: '💎', color: count >= 25 ? 'magenta' : 'cyan',
                meta: { game: 'shop', diamonds: count, totalDiamonds: result.diamonds }
            });
        }
    } catch (err) { console.error('buy-diamonds error:', err.message); } });

    // --- Make It Rain Effect ---
    socket.on('lobby-make-it-rain', async () => { try {
        if (!checkRateLimit(socket)) return;
        const player = onlinePlayers.get(socket.id);
        if (!player || !player.name) return;
        
        const cost = 20;
        const newBalance = await deductBalance(player.name, cost, 'lobby_effect_rain');
        if (newBalance === null) {
            socket.emit('error', { message: 'Nicht genug Coins!' });
            return;
        }
        
        emitToUser(io, player.name, 'balance-update', { balance: newBalance });

        // Achievement
        const unlocks = await bump(player.name, 'rain_triggers', 1);
        notifyUnlocks(io, onlinePlayers, player.name, unlocks);

        // Activity feed
        pushActivity({
            type: 'rain', player: player.name,
            text: 'Made it rain in the lobby',
            icon: '💸', color: 'gold',
            meta: { cost }
        });

        // Broadcast to all connected users (celebration effect visible to everyone)
        // Note: No lobby room exists; this is intentional so all users see the effect
        io.emit('lobby-rain-effect', { playerName: player.name });
    } catch (err) { console.error('lobby-make-it-rain error:', err.message); } });
}
