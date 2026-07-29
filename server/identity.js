// ============== IDENTITY / TOFU NAME OWNERSHIP ==============
//
// Trust-on-first-use ownership for player names. The first browser to
// register a given name with its locally-generated owner token claims that
// name; later attempts with a different token are rejected.
//
// The token is opaque (UUID generated client-side, stored in localStorage).
// It is NOT a credential — anyone who knows the token can act as that name —
// but combined with the SITE_PASSWORD gate it's enough to stop friends from
// accidentally (or jokingly) claiming each other's names from a fresh browser.
//
// Persistence: stored as `players.owner_token`. Memory mode falls back to a
// process-local Map (lost on restart, fine for dev).

import { isDatabaseEnabled, query } from './db.js';

const memoryOwners = new Map(); // playerName -> ownerToken

const TOKEN_MIN = 8;
const TOKEN_MAX = 128;

export function isValidOwnerToken(token) {
    return typeof token === 'string'
        && token.length >= TOKEN_MIN
        && token.length <= TOKEN_MAX
        && /^[A-Za-z0-9_-]+$/.test(token);
}

async function getOwnerFromDb(playerName) {
    if (!isDatabaseEnabled()) return memoryOwners.get(playerName) || null;
    try {
        const r = await query('select owner_token from players where name = $1', [playerName]);
        return r.rows[0]?.owner_token || null;
    } catch (err) {
        console.error('getOwnerFromDb error:', err.message);
        return null;
    }
}

async function setOwnerInDb(playerName, ownerToken) {
    if (!isDatabaseEnabled()) {
        memoryOwners.set(playerName, ownerToken);
        return true;
    }
    try {
        // Ensure row exists, then claim only if still unowned. The conditional
        // update prevents a TOCTOU race where two registers see "null" at the
        // same time — only one update will actually set the token.
        await query(
            `insert into players (name, balance, last_seen_at) values ($1, 1000, now())
             on conflict (name) do nothing`,
            [playerName]
        );
        const r = await query(
            `update players set owner_token = $2
             where name = $1 and owner_token is null
             returning owner_token`,
            [playerName, ownerToken]
        );
        return r.rowCount > 0;
    } catch (err) {
        console.error('setOwnerInDb error:', err.message);
        return false;
    }
}

/**
 * Stamp the player's last visit. Called on every successful claim, not just
 * the first, so the retention job in server/retention.js sees returning
 * players as active even when they never touch their balance.
 */
async function touchLastSeen(playerName) {
    if (!isDatabaseEnabled()) return;
    try {
        await query('update players set last_seen_at = now() where name = $1', [playerName]);
    } catch (err) {
        // Never let a bookkeeping write block a login.
        console.error('touchLastSeen error:', err.message);
    }
}

/**
 * Attempt to claim a player name with the given owner token.
 *
 * Returns one of:
 *   { ok: true, firstClaim: true }   — name was unowned; now owned by token
 *   { ok: true, firstClaim: false }  — name was already owned by this token
 *   { ok: false, reason: 'taken' }   — name owned by a different token
 */
export async function claimName(playerName, ownerToken) {
    if (!playerName) return { ok: false, reason: 'invalid_name' };
    if (!isValidOwnerToken(ownerToken)) return { ok: false, reason: 'invalid_token' };

    const existing = await getOwnerFromDb(playerName);
    if (existing) {
        if (existing === ownerToken) {
            await touchLastSeen(playerName);
            return { ok: true, firstClaim: false };
        }
        return { ok: false, reason: 'taken' };
    }
    const claimed = await setOwnerInDb(playerName, ownerToken);
    if (!claimed) {
        // Lost the race — re-read and check who actually got it
        const after = await getOwnerFromDb(playerName);
        if (after === ownerToken) {
            await touchLastSeen(playerName);
            return { ok: true, firstClaim: true };
        }
        return { ok: false, reason: 'taken' };
    }
    await touchLastSeen(playerName);
    return { ok: true, firstClaim: true };
}

/**
 * Release the owner token bound to a name so the next register-player can
 * claim it fresh. Operator-only escape hatch for lost tokens: the token
 * lives in localStorage, so clearing site data (or renaming from a second
 * device) can strand a name under a token nobody holds anymore — the owner
 * then sees NAME_TAKEN on their own name forever. Player data (balance,
 * achievements, character) is untouched; only the ownership binding resets.
 *
 * Returns one of:
 *   { ok: true }                       — name is now unowned
 *   { ok: false, reason: 'not_found' } — no such player / no binding
 *   { ok: false, reason: 'db_error' }  — query failed
 */
export async function releaseName(playerName) {
    if (!playerName) return { ok: false, reason: 'not_found' };
    if (!isDatabaseEnabled()) {
        return memoryOwners.delete(playerName)
            ? { ok: true }
            : { ok: false, reason: 'not_found' };
    }
    try {
        const r = await query(
            'update players set owner_token = null where name = $1',
            [playerName]
        );
        if (r.rowCount === 0) return { ok: false, reason: 'not_found' };
        return { ok: true };
    } catch (err) {
        console.error('releaseName error:', err.message);
        return { ok: false, reason: 'db_error' };
    }
}

/**
 * Verify that the supplied token owns the given name. Used by HTTP routes
 * that take a player name from the request body (e.g. /api/turkish/complete).
 *
 * Permissive: if the name has never been claimed yet (memory mode after
 * restart, or first-ever interaction with the DB), the call succeeds and
 * the token is bound. This keeps the no-DB dev flow ergonomic.
 */
export async function verifyOwner(playerName, ownerToken) {
    const res = await claimName(playerName, ownerToken);
    return res.ok;
}

// ============== DISCORD-BOUND IDENTITY ==============
//
// A signed-in Discord account is a stronger claim to a name than the owner
// token, because the token lives in localStorage and dies with a cleared
// cache. Once a name is bound to a Discord ID, that binding wins.
//
// The binding is deliberately one name per account: this is a game with one
// balance and one portfolio per player, not a multi-character system.

const memoryDiscord = new Map(); // discordId -> playerName

/** The player name bound to a Discord account, or null. */
export async function nameForDiscordId(discordId) {
    if (!discordId) return null;
    if (!isDatabaseEnabled()) return memoryDiscord.get(discordId) || null;
    try {
        const r = await query('select name from players where discord_id = $1', [discordId]);
        return r.rows[0]?.name || null;
    } catch (err) {
        console.error('nameForDiscordId error:', err.message);
        return null;
    }
}

/**
 * Claim a name on behalf of a signed-in Discord account.
 *
 * The three cases that matter:
 *   1. The account already owns a name -> that name wins, whatever the browser
 *      asked for. Otherwise clearing localStorage on one device would let the
 *      same person start a second life under a different name.
 *   2. The name is free, or this browser already owns it through the owner
 *      token -> bind it to the account. This is how an existing guest keeps
 *      their balance, portfolio and achievements when they first sign in.
 *   3. Somebody else owns it -> refused, same as the guest path.
 *
 * @returns {Promise<{ok: true, name: string, bound: boolean, adopted: boolean}
 *                  | {ok: false, reason: 'taken'|'invalid_name'}>}
 *   bound   — the account was just tied to this name
 *   adopted — the name came from the account, not from what the browser asked
 */
export async function claimNameForDiscord(requestedName, discordId, discordUsername, ownerToken) {
    if (!discordId) return { ok: false, reason: 'invalid_name' };

    const existing = await nameForDiscordId(discordId);
    if (existing) {
        // Case 1. Refresh the display name in passing — people rename on
        // Discord and the contacts list should not show a stale handle.
        await setDiscordUsername(existing, discordUsername);
        // Without this, a signed-in player's last_seen_at is stamped once at
        // account creation and never again — and the 24-month retention job
        // would eventually delete an account that was in daily use.
        await touchLastSeen(existing);
        return { ok: true, name: existing, bound: false, adopted: existing !== requestedName };
    }

    if (!requestedName) return { ok: false, reason: 'invalid_name' };

    // Case 2 or 3: does this browser already hold the name?
    const owner = await getOwnerFromDb(requestedName);
    if (owner && !(isValidOwnerToken(ownerToken) && owner === ownerToken)) {
        return { ok: false, reason: 'taken' };
    }

    const bound = await bindDiscordId(requestedName, discordId, discordUsername);
    if (!bound) return { ok: false, reason: 'taken' };

    // Keep the owner token bound too, so the same browser still works if the
    // player later signs out and continues as a guest.
    if (isValidOwnerToken(ownerToken)) await setOwnerInDb(requestedName, ownerToken);
    await touchLastSeen(requestedName);

    return { ok: true, name: requestedName, bound: true, adopted: false };
}

async function bindDiscordId(playerName, discordId, discordUsername) {
    if (!isDatabaseEnabled()) {
        for (const [id, name] of memoryDiscord) {
            if (name === playerName && id !== discordId) return false;
        }
        memoryDiscord.set(discordId, playerName);
        return true;
    }
    try {
        await query(
            `insert into players (name, balance, last_seen_at) values ($1, 1000, now())
             on conflict (name) do nothing`,
            [playerName]
        );
        // Conditional on the row still being unbound, so two sockets racing
        // the same name cannot both think they won.
        const r = await query(
            `update players set discord_id = $2, discord_username = $3
             where name = $1 and discord_id is null
             returning discord_id`,
            [playerName, discordId, discordUsername || null]
        );
        return r.rowCount > 0;
    } catch (err) {
        // Unique violation: this Discord account is already bound elsewhere.
        console.error('bindDiscordId error:', err.message);
        return false;
    }
}

async function setDiscordUsername(playerName, discordUsername) {
    if (!discordUsername || !isDatabaseEnabled()) return;
    try {
        await query(
            'update players set discord_username = $2 where name = $1 and discord_username is distinct from $2',
            [playerName, discordUsername]
        );
    } catch (err) {
        console.error('setDiscordUsername error:', err.message);
    }
}

/** Drop the Discord binding from a name, leaving the player as a guest. */
export async function unbindDiscordId(discordId) {
    if (!discordId) return false;
    if (!isDatabaseEnabled()) return memoryDiscord.delete(discordId);
    try {
        const r = await query(
            'update players set discord_id = null, discord_username = null where discord_id = $1',
            [discordId]
        );
        return r.rowCount > 0;
    } catch (err) {
        console.error('unbindDiscordId error:', err.message);
        return false;
    }
}
