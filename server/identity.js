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
            `insert into players (name, balance) values ($1, 1000)
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
        if (existing === ownerToken) return { ok: true, firstClaim: false };
        return { ok: false, reason: 'taken' };
    }
    const claimed = await setOwnerInDb(playerName, ownerToken);
    if (!claimed) {
        // Lost the race — re-read and check who actually got it
        const after = await getOwnerFromDb(playerName);
        if (after === ownerToken) return { ok: true, firstClaim: true };
        return { ok: false, reason: 'taken' };
    }
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
