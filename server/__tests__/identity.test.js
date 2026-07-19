import { describe, it, expect, vi } from 'vitest';

// Mock the db module so identity.js runs in memory mode
vi.mock('../db.js', () => ({
    isDatabaseEnabled: () => false,
    query: vi.fn()
}));

const {
    claimName,
    releaseName,
    verifyOwner,
    isValidOwnerToken
} = await import('../identity.js');

const TOKEN_A = 'a'.repeat(32);
const TOKEN_B = 'b'.repeat(32);

describe('identity (in-memory mode)', () => {
    describe('isValidOwnerToken', () => {
        it('accepts url-safe tokens of 8-128 chars', () => {
            expect(isValidOwnerToken('abcd1234')).toBe(true);
            expect(isValidOwnerToken('A-Z_09'.repeat(4))).toBe(true);
        });

        it('rejects short, long, and malformed tokens', () => {
            expect(isValidOwnerToken('short')).toBe(false);
            expect(isValidOwnerToken('x'.repeat(129))).toBe(false);
            expect(isValidOwnerToken('has spaces!')).toBe(false);
            expect(isValidOwnerToken(null)).toBe(false);
            expect(isValidOwnerToken(12345678)).toBe(false);
        });
    });

    describe('claimName', () => {
        it('first claim binds the token', async () => {
            const res = await claimName('id_alice', TOKEN_A);
            expect(res).toEqual({ ok: true, firstClaim: true });
        });

        it('re-claim with the same token succeeds', async () => {
            await claimName('id_bob', TOKEN_A);
            const res = await claimName('id_bob', TOKEN_A);
            expect(res).toEqual({ ok: true, firstClaim: false });
        });

        it('claim with a different token is rejected as taken', async () => {
            await claimName('id_carol', TOKEN_A);
            const res = await claimName('id_carol', TOKEN_B);
            expect(res).toEqual({ ok: false, reason: 'taken' });
        });

        it('rejects missing name and malformed token', async () => {
            expect(await claimName('', TOKEN_A)).toEqual({ ok: false, reason: 'invalid_name' });
            expect(await claimName('id_dave', 'nope')).toEqual({ ok: false, reason: 'invalid_token' });
        });
    });

    describe('releaseName', () => {
        it('releases a bound name so another token can claim it', async () => {
            // The "rename blocked" scenario: name owned by a token the
            // browser no longer holds (cleared localStorage / other device).
            await claimName('id_lukas', TOKEN_A);
            expect(await claimName('id_lukas', TOKEN_B)).toEqual({ ok: false, reason: 'taken' });

            const rel = await releaseName('id_lukas');
            expect(rel).toEqual({ ok: true });

            const reclaim = await claimName('id_lukas', TOKEN_B);
            expect(reclaim).toEqual({ ok: true, firstClaim: true });
        });

        it('returns not_found for unknown or empty names', async () => {
            expect(await releaseName('id_ghost')).toEqual({ ok: false, reason: 'not_found' });
            expect(await releaseName('')).toEqual({ ok: false, reason: 'not_found' });
        });
    });

    describe('verifyOwner', () => {
        it('binds on first use and verifies on later calls', async () => {
            expect(await verifyOwner('id_erin', TOKEN_A)).toBe(true);
            expect(await verifyOwner('id_erin', TOKEN_A)).toBe(true);
            expect(await verifyOwner('id_erin', TOKEN_B)).toBe(false);
        });
    });
});
