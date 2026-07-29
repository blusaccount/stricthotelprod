import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../db.js', () => ({
    isDatabaseEnabled: vi.fn(() => false),
    query: vi.fn(),
}));

import { isDatabaseEnabled } from '../db.js';
import {
    claimName,
    claimNameForDiscord,
    nameForDiscordId,
    unbindDiscordId,
    isValidOwnerToken,
} from '../identity.js';
import { sessionDiscord, isDiscordConfigured, redirectUri } from '../routes/discord-auth.js';

// Memory mode: identity.js keeps its bindings in module-level Maps, so each
// test uses fresh names and Discord ids rather than trying to reset them.
let seq = 0;
const uniq = (prefix) => `${prefix}_${++seq}_${Math.floor(Math.random() * 1e6)}`;
const TOKEN_A = 'aaaaaaaaaaaaaaaa';
const TOKEN_B = 'bbbbbbbbbbbbbbbb';

describe('discord-bound identity', () => {
    beforeEach(() => {
        isDatabaseEnabled.mockReturnValue(false);
    });

    describe('claimNameForDiscord', () => {
        it('binds a free name to the account', async () => {
            const name = uniq('Fresh');
            const id = uniq('id');

            const res = await claimNameForDiscord(name, id, 'Someone', TOKEN_A);

            expect(res).toMatchObject({ ok: true, name, bound: true, adopted: false });
            await expect(nameForDiscordId(id)).resolves.toBe(name);
        });

        it('adopts a name the browser already owns as a guest', async () => {
            // This is the migration path: an existing player signs in for the
            // first time and keeps the balance and history they already had.
            const name = uniq('Guest');
            const id = uniq('id');
            await claimName(name, TOKEN_A);

            const res = await claimNameForDiscord(name, id, 'Someone', TOKEN_A);

            expect(res).toMatchObject({ ok: true, name, bound: true });
        });

        it('refuses a name owned by a different browser', async () => {
            const name = uniq('Taken');
            await claimName(name, TOKEN_A);

            const res = await claimNameForDiscord(name, uniq('id'), 'Intruder', TOKEN_B);

            expect(res).toEqual({ ok: false, reason: 'taken' });
        });

        it('returns the account\'s own name and ignores what the browser asked for', async () => {
            // Fresh device, cleared storage: the account decides, not the
            // browser — otherwise one person could start a second life under a
            // new name simply by clearing site data.
            const mine = uniq('Mine');
            const id = uniq('id');
            await claimNameForDiscord(mine, id, 'Someone', TOKEN_A);

            const res = await claimNameForDiscord(uniq('SomethingElse'), id, 'Someone', TOKEN_B);

            expect(res).toMatchObject({ ok: true, name: mine, adopted: true, bound: false });
        });

        it('reports adopted=false when the browser asked for the right name', async () => {
            const name = uniq('Same');
            const id = uniq('id');
            await claimNameForDiscord(name, id, 'Someone', TOKEN_A);

            const res = await claimNameForDiscord(name, id, 'Someone', TOKEN_A);

            expect(res).toMatchObject({ ok: true, name, adopted: false });
        });

        it('works without an owner token at all', async () => {
            // A signed-in player on a brand-new browser has no token yet.
            const name = uniq('NoToken');
            const res = await claimNameForDiscord(name, uniq('id'), 'Someone', undefined);
            expect(res).toMatchObject({ ok: true, name, bound: true });
        });

        it('rejects a missing discord id', async () => {
            await expect(claimNameForDiscord('Whoever', null, 'x', TOKEN_A))
                .resolves.toEqual({ ok: false, reason: 'invalid_name' });
        });

        it('rejects an empty name for an account that has none yet', async () => {
            await expect(claimNameForDiscord('', uniq('id'), 'x', TOKEN_A))
                .resolves.toEqual({ ok: false, reason: 'invalid_name' });
        });

        it('will not bind one name to two accounts', async () => {
            const name = uniq('Contested');
            await claimNameForDiscord(name, uniq('id'), 'First', TOKEN_A);

            const res = await claimNameForDiscord(name, uniq('id'), 'Second', TOKEN_A);

            expect(res).toEqual({ ok: false, reason: 'taken' });
        });
    });

    describe('unbindDiscordId', () => {
        it('drops the binding, leaving the player a guest', async () => {
            const name = uniq('Leaving');
            const id = uniq('id');
            await claimNameForDiscord(name, id, 'Someone', TOKEN_A);

            await expect(unbindDiscordId(id)).resolves.toBe(true);
            await expect(nameForDiscordId(id)).resolves.toBeNull();
        });

        it('is a no-op for an unknown account', async () => {
            await expect(unbindDiscordId(uniq('nobody'))).resolves.toBe(false);
            await expect(unbindDiscordId(null)).resolves.toBe(false);
        });
    });

    describe('guest path is untouched', () => {
        it('still claims names by owner token alone', async () => {
            const name = uniq('StillAGuest');
            await expect(claimName(name, TOKEN_A)).resolves.toEqual({ ok: true, firstClaim: true });
            await expect(claimName(name, TOKEN_A)).resolves.toEqual({ ok: true, firstClaim: false });
            await expect(claimName(name, TOKEN_B)).resolves.toEqual({ ok: false, reason: 'taken' });
        });

        it('still validates token shape', () => {
            expect(isValidOwnerToken(TOKEN_A)).toBe(true);
            expect(isValidOwnerToken('short')).toBe(false);
            expect(isValidOwnerToken('has spaces in it')).toBe(false);
            expect(isValidOwnerToken(null)).toBe(false);
        });
    });
});

describe('discord auth helpers', () => {
    const saved = { ...process.env };

    afterEach(() => {
        process.env.DISCORD_CLIENT_ID = saved.DISCORD_CLIENT_ID;
        process.env.DISCORD_CLIENT_SECRET = saved.DISCORD_CLIENT_SECRET;
        process.env.DISCORD_REDIRECT_URI = saved.DISCORD_REDIRECT_URI;
        delete process.env.DISCORD_CLIENT_ID;
        delete process.env.DISCORD_CLIENT_SECRET;
        delete process.env.DISCORD_REDIRECT_URI;
    });

    describe('isDiscordConfigured', () => {
        it('needs both halves of the credential', () => {
            delete process.env.DISCORD_CLIENT_ID;
            delete process.env.DISCORD_CLIENT_SECRET;
            expect(isDiscordConfigured()).toBe(false);

            process.env.DISCORD_CLIENT_ID = 'id';
            expect(isDiscordConfigured()).toBe(false);

            process.env.DISCORD_CLIENT_SECRET = 'secret';
            expect(isDiscordConfigured()).toBe(true);
        });
    });

    describe('sessionDiscord', () => {
        it('reads a signed-in account off the session', () => {
            expect(sessionDiscord({ discord: { id: '42', username: 'x', avatar: 'a' } }))
                .toEqual({ id: '42', username: 'x', avatar: 'a' });
        });

        it('returns null for anything that is not a real binding', () => {
            expect(sessionDiscord(undefined)).toBeNull();
            expect(sessionDiscord({})).toBeNull();
            expect(sessionDiscord({ discord: {} })).toBeNull();
            expect(sessionDiscord({ discord: { id: '' } })).toBeNull();
            expect(sessionDiscord({ discord: { id: 42 } })).toBeNull();
        });

        it('normalises missing optional fields to null', () => {
            expect(sessionDiscord({ discord: { id: '42' } }))
                .toEqual({ id: '42', username: null, avatar: null });
        });
    });

    describe('redirectUri', () => {
        const req = (proto, host) => ({ protocol: proto, get: () => host });

        it('derives the callback from the request', () => {
            delete process.env.DISCORD_REDIRECT_URI;
            expect(redirectUri(req('https', 'stricthotel.example')))
                .toBe('https://stricthotel.example/auth/discord/callback');
        });

        it('prefers an explicit override, because Discord matches it exactly', () => {
            process.env.DISCORD_REDIRECT_URI = 'https://fixed.example/auth/discord/callback';
            expect(redirectUri(req('http', 'localhost:3000')))
                .toBe('https://fixed.example/auth/discord/callback');
        });
    });
});
