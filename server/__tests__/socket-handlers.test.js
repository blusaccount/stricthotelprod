import { describe, it, expect } from 'vitest';
import { checkStockTradeCooldown } from '../socket-handlers.js';

describe('checkStockTradeCooldown (issue #160: keyed by player identity, not socket.id)', () => {
    it('blocks a second trade from the same player within the cooldown window', () => {
        const name = `player-${Math.random()}`;
        expect(checkStockTradeCooldown(name, 400)).toBe(true);
        expect(checkStockTradeCooldown(name, 400)).toBe(false);
    });

    it('still applies the cooldown when the second trade arrives from a different socket.id for the same player — reconnect/second-tab cannot bypass it', () => {
        const name = `player-${Math.random()}`;
        // First trade "from" socket A.
        expect(checkStockTradeCooldown(name, 400)).toBe(true);
        // A reconnect (new socket.id) or a second browser tab still resolves
        // to the same player identity, so the cooldown must still apply —
        // the call site now passes player.name, never socket.id.
        expect(checkStockTradeCooldown(name, 400)).toBe(false);
    });

    it('does not block a different player, only the same identity', () => {
        const alice = `alice-${Math.random()}`;
        const bob = `bob-${Math.random()}`;
        expect(checkStockTradeCooldown(alice, 400)).toBe(true);
        expect(checkStockTradeCooldown(bob, 400)).toBe(true);
    });

    it('allows another trade once the cooldown window has elapsed', async () => {
        const name = `player-${Math.random()}`;
        expect(checkStockTradeCooldown(name, 20)).toBe(true);
        expect(checkStockTradeCooldown(name, 20)).toBe(false);
        await new Promise(r => setTimeout(r, 30));
        expect(checkStockTradeCooldown(name, 20)).toBe(true);
    });
});
