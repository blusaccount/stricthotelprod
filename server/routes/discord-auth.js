// Discord sign-in.
//
// Why Discord and not e-mail: the site is already used from inside a Discord
// call, so the account the players actually have is the one they are logged
// into anyway. It also means no password handling here at all.
//
// **Signing in is optional.** Guests keep the trust-on-first-use owner token
// they always had, and every game works without an account. What an account
// adds is an identity that survives clearing site data and moving to another
// device — which is the prerequisite for ever selling anything.
//
// Inert until DISCORD_CLIENT_ID and DISCORD_CLIENT_SECRET are set. Without
// them the routes still exist but report that sign-in is unavailable, so
// nothing breaks on an unconfigured deployment.

import { Router } from 'express';
import crypto from 'node:crypto';
import { rateLimiter } from '../rate-limit.js';

// Overridable so the flow can be exercised against a stand-in server in
// tests. Never point this anywhere but discord.com in production.
const API_BASE = process.env.DISCORD_API_BASE || 'https://discord.com/api';
const DISCORD_AUTHORIZE = `${API_BASE}/oauth2/authorize`;
const DISCORD_TOKEN = `${API_BASE}/oauth2/token`;
const DISCORD_ME = `${API_BASE}/users/@me`;

// `identify` only: the username and avatar. Not `email`, because nothing here
// sends mail and asking for data we have no use for is exactly what the
// privacy notice promises not to do.
const SCOPE = 'identify';

const FETCH_TIMEOUT_MS = 8000;
const STATE_TTL_MS = 10 * 60 * 1000;

export function isDiscordConfigured() {
    return Boolean(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET);
}

/**
 * Where Discord should send the browser back to. Derived from the request so
 * the same build works on localhost and in production, but overridable with
 * DISCORD_REDIRECT_URI because the value has to match what is registered in
 * the Discord developer portal byte for byte.
 */
export function redirectUri(req) {
    if (process.env.DISCORD_REDIRECT_URI) return process.env.DISCORD_REDIRECT_URI;
    const proto = req.protocol;
    const host = req.get('host');
    return `${proto}://${host}/auth/discord/callback`;
}

async function postForm(url, params) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams(params),
            signal: ac.signal,
        });
        const body = await res.json().catch(() => ({}));
        if (!res.ok) {
            throw new Error(body.error_description || body.error || `HTTP ${res.status}`);
        }
        return body;
    } finally {
        clearTimeout(timer);
    }
}

async function getJson(url, accessToken) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), FETCH_TIMEOUT_MS);
    try {
        const res = await fetch(url, {
            headers: { Authorization: `Bearer ${accessToken}` },
            signal: ac.signal,
        });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return await res.json();
    } finally {
        clearTimeout(timer);
    }
}

/** The signed-in Discord account on a session, or null. */
export function sessionDiscord(session) {
    const d = session?.discord;
    if (!d || typeof d.id !== 'string' || !d.id) return null;
    return { id: d.id, username: d.username || null, avatar: d.avatar || null };
}

export function createDiscordAuthRouter() {
    const router = Router();
    const limit = rateLimiter(20);

    // --- Who am I -----------------------------------------------------------
    router.get('/api/account', (req, res) => {
        res.json({
            configured: isDiscordConfigured(),
            discord: sessionDiscord(req.session),
        });
    });

    // --- Start the flow -----------------------------------------------------
    router.get('/auth/discord', limit, (req, res) => {
        if (!isDiscordConfigured()) {
            return res.status(503).send('Discord sign-in is not configured on this server.');
        }

        // CSRF: a random state kept in the session and checked on the way back,
        // so a callback the user never started cannot sign them in.
        const state = crypto.randomBytes(16).toString('hex');
        req.session.discordState = { value: state, createdAt: Date.now() };

        const params = new URLSearchParams({
            client_id: process.env.DISCORD_CLIENT_ID,
            redirect_uri: redirectUri(req),
            response_type: 'code',
            scope: SCOPE,
            state,
            prompt: 'none',
        });
        // The session has to be written before the browser leaves, or the
        // state is gone by the time Discord sends it back.
        req.session.save(() => res.redirect(`${DISCORD_AUTHORIZE}?${params}`));
    });

    // --- Come back from Discord --------------------------------------------
    router.get('/auth/discord/callback', limit, async (req, res) => {
        if (!isDiscordConfigured()) {
            return res.status(503).send('Discord sign-in is not configured on this server.');
        }

        const fail = (reason) => res.redirect('/?login=failed&reason=' + encodeURIComponent(reason));

        const expected = req.session.discordState;
        delete req.session.discordState;

        if (req.query.error) return fail(String(req.query.error).slice(0, 40));
        if (!expected || typeof req.query.state !== 'string') return fail('no_state');
        if (Date.now() - expected.createdAt > STATE_TTL_MS) return fail('state_expired');

        // Constant-time compare so a mismatched state cannot be probed by timing.
        const a = Buffer.from(expected.value);
        const b = Buffer.from(req.query.state);
        if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return fail('bad_state');

        const code = req.query.code;
        if (typeof code !== 'string' || !code) return fail('no_code');

        try {
            const token = await postForm(DISCORD_TOKEN, {
                client_id: process.env.DISCORD_CLIENT_ID,
                client_secret: process.env.DISCORD_CLIENT_SECRET,
                grant_type: 'authorization_code',
                code,
                redirect_uri: redirectUri(req),
            });
            const me = await getJson(DISCORD_ME, token.access_token);
            if (!me?.id) return fail('no_user');

            // Only what is displayed. The access token is deliberately not
            // kept: it is needed once, here, and storing it would mean holding
            // a credential for an account we have no further business with.
            req.session.discord = {
                id: String(me.id),
                username: me.global_name || me.username || null,
                avatar: me.avatar || null,
            };
            // Signing in with Discord also satisfies the site gate — proving
            // who you are is a stronger claim than knowing a shared password.
            req.session.authenticated = true;

            req.session.save(() => res.redirect('/?login=ok'));
        } catch (err) {
            console.error('[discord-auth] callback failed:', err.message);
            fail('exchange_failed');
        }
    });

    // --- Sign out -----------------------------------------------------------
    // Only the Discord binding is dropped; the site session survives, so
    // signing out drops you back to being a guest rather than to the login
    // page.
    router.post('/auth/discord/logout', (req, res) => {
        delete req.session.discord;
        req.session.save(() => res.json({ ok: true }));
    });

    return router;
}
