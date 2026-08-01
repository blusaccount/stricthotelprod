// ============== DISCORD ACTIVITY OAUTH ==============
//
// Server-side half of the Discord Embedded App SDK auth handshake
// (https://docs.discord.com/developers/activities/building-an-activity#setting-up-authentication):
// the client gets a one-time `code` via discordSdk.commands.authorize(), and
// this module exchanges it for an access token, then asks Discord who that
// token actually belongs to. Doing the /users/@me lookup here (rather than
// trusting whatever user object the client claims) means the identity is
// verified by Discord, not just asserted by the iframe.

const TOKEN_URL = 'https://discord.com/api/oauth2/token';
const USER_URL = 'https://discord.com/api/users/@me';

export function isDiscordConfigured() {
    return Boolean(process.env.DISCORD_CLIENT_ID && process.env.DISCORD_CLIENT_SECRET);
}

/**
 * Exchange an OAuth2 authorization code for an access token.
 * Throws on any non-2xx response from Discord.
 */
export async function exchangeCodeForToken(code) {
    const body = new URLSearchParams({
        client_id: process.env.DISCORD_CLIENT_ID,
        client_secret: process.env.DISCORD_CLIENT_SECRET,
        grant_type: 'authorization_code',
        code
    });
    const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Discord token exchange failed (${res.status}): ${text.slice(0, 200)}`);
    }
    return res.json(); // { access_token, token_type, expires_in, refresh_token, scope }
}

/**
 * Fetch the Discord user that an access token belongs to.
 */
export async function fetchDiscordUser(accessToken) {
    const res = await fetch(USER_URL, {
        headers: { Authorization: `Bearer ${accessToken}` }
    });
    if (!res.ok) {
        const text = await res.text().catch(() => '');
        throw new Error(`Discord user lookup failed (${res.status}): ${text.slice(0, 200)}`);
    }
    return res.json(); // { id, username, global_name, avatar, ... }
}
