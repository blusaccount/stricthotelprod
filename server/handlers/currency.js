import { sanitizeName, validateCharacter, validateGameType, emitBalanceUpdate, emitToUser, userRoom } from '../socket-utils.js';
import { getBalance, addBalance, deductBalance, getDiamonds, buyDiamonds, isNewPlayer } from '../currency.js';
import { broadcastOnlinePlayers } from '../room-manager.js';
import { saveCharacter, getCharacter } from '../character-store.js';
import { bump } from '../achievements.js';
import { notifyUnlocks } from './achievements.js';
import { pushActivity } from '../activity-feed.js';
import { claimName, claimNameForDiscord, isValidOwnerToken } from '../identity.js';
import { sessionDiscord } from '../routes/discord-auth.js';

export function registerCurrencyHandlers(socket, io, { checkRateLimit, onlinePlayers }) {
    socket.on('register-player', async (data) => { try {
        if (!checkRateLimit(socket)) return;
        if (!data || typeof data !== 'object') return;

        const requested = sanitizeName(data.name);
        const character = validateCharacter(data.character);
        const game = validateGameType(data.game);

        // A signed-in Discord account outranks the browser's owner token: the
        // token lives in localStorage and dies with a cleared cache, the
        // account does not.
        const discord = sessionDiscord(socket.request.session);

        // Guests still need a well-formed owner token. Signed-in players do
        // not — their identity comes from the session — but the token is
        // still honoured when present, so signing out drops them back to the
        // same guest identity they had before.
        if (!discord && !isValidOwnerToken(data.ownerToken)) {
            socket.emit('register-player-error', {
                code: 'INVALID_TOKEN',
                message: 'Owner token missing or malformed — clear your site data and reload.'
            });
            return;
        }
        if (!discord && !requested) return;

        // Detect first-ever registration BEFORE the claim creates the row.
        const firstTime = requested ? await isNewPlayer(requested) : false;

        const claim = discord
            ? await claimNameForDiscord(requested, discord.id, discord.username, data.ownerToken)
            : await claimName(requested, data.ownerToken);

        if (!claim.ok) {
            socket.emit('register-player-error', {
                code: claim.reason === 'taken' ? 'NAME_TAKEN' : 'CLAIM_FAILED',
                message: claim.reason === 'taken'
                    ? `Der Name "${requested}" gehört bereits jemandem. Wähle einen anderen.`
                    : 'Name konnte nicht beansprucht werden.'
            });
            return;
        }

        // For a signed-in player the account decides the name, which may differ
        // from what this browser asked for (fresh device, cleared storage).
        const name = claim.name || requested;
        if (!name) return;

        // Tell the client which name it actually got, so localStorage and the
        // name field stop disagreeing with the server.
        if (discord) {
            socket.emit('account-identity', {
                name,
                discordUsername: discord.username,
                adopted: Boolean(claim.adopted),
                bound: Boolean(claim.bound),
            });
        }

        // Leave any prior user-room (in case the socket re-registers under a
        // new name) so balance updates don't leak between players.
        const prev = onlinePlayers.get(socket.id);
        if (prev && prev.name && prev.name !== name) socket.leave(userRoom(prev.name));

        onlinePlayers.set(socket.id, { name, character, game, ownerToken: data.ownerToken });
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

        // Activity feed: every diamond purchase shows up — the shop currently
        // only sells single diamonds and a purchase is already a deliberate
        // 25 SC sink, so it's worth surfacing.
        pushActivity({
            type: 'shop_purchase', player: player.name,
            text: count >= 25
                ? `Bought a glittering ${count} diamonds`
                : count >= 5
                    ? `Bought ${count} diamonds in the shop`
                    : count === 1
                        ? 'Bought a diamond in the shop'
                        : `Bought ${count} diamonds in the shop`,
            icon: '💎', color: count >= 25 ? 'magenta' : count >= 5 ? 'gold' : 'cyan',
            meta: { game: 'shop', diamonds: count, totalDiamonds: result.diamonds }
        });
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
