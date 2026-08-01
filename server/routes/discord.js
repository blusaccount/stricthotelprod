import { Router } from 'express';
import { isDiscordConfigured, exchangeCodeForToken, fetchDiscordUser } from '../discord-auth.js';

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 20;
const rateLimiter = new Map(); // ip -> { count, resetAt }

function sanitizeDiscordDisplayName(user) {
    const raw = user.global_name || user.username || '';
    // Same charset restriction the manual name-claim flow uses
    // (server/routes/auth.js sanitizePlayerName), so a Discord-derived
    // suggestion never fails validation once it reaches register-player.
    const clean = raw.replace(/[<>&"'/]/g, '').trim().slice(0, 20);
    return clean.length >= 2 ? clean : '';
}

export function createDiscordRouter() {
    const router = Router();

    // Establishes a normal site session (same req.session.authenticated flag
    // the password login sets) from a verified Discord identity, so Discord
    // Activity users skip the SITE_PASSWORD gate entirely. Called by
    // public/discord.html before the rest of the app loads.
    router.post('/api/discord/session', async (req, res) => {
        if (!isDiscordConfigured()) {
            return res.status(503).json({ error: 'Discord activity is not configured on this server' });
        }

        const now = Date.now();
        const ip = req.ip || 'unknown';
        const entry = rateLimiter.get(ip);
        if (entry && now < entry.resetAt) {
            entry.count += 1;
            if (entry.count > RATE_LIMIT_MAX) {
                res.set('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
                return res.status(429).json({ error: 'Too many attempts. Try again soon.' });
            }
        } else {
            rateLimiter.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        }

        const { code } = req.body || {};
        if (typeof code !== 'string' || !code) {
            return res.status(400).json({ error: 'Missing code' });
        }

        try {
            const token = await exchangeCodeForToken(code);
            const user = await fetchDiscordUser(token.access_token);

            req.session.authenticated = true;
            req.session.discordUserId = user.id;

            res.json({
                access_token: token.access_token,
                suggestedName: sanitizeDiscordDisplayName(user)
            });
        } catch (err) {
            console.error('Discord activity auth error:', err.message);
            res.status(502).json({ error: 'Discord authentication failed' });
        }
    });

    return router;
}
