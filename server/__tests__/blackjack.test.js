import { describe, it, expect } from 'vitest';
import {
    handTotal,
    isBlackjack,
    isBust,
    dealerPlay,
    settle,
    cardValue,
    BLACKJACK_BETS
} from '../handlers/blackjack.js';

const C = (rank, suit = 0) => ({ rank, suit });

describe('cardValue', () => {
    it('returns 1 for Ace, 10 for face cards, face value otherwise', () => {
        expect(cardValue(C(1))).toBe(1);
        expect(cardValue(C(2))).toBe(2);
        expect(cardValue(C(10))).toBe(10);
        expect(cardValue(C(11))).toBe(10);
        expect(cardValue(C(12))).toBe(10);
        expect(cardValue(C(13))).toBe(10);
    });
});

describe('handTotal', () => {
    it('handles a hard hand with no ace', () => {
        expect(handTotal([C(5), C(7)])).toEqual({ total: 12, soft: false });
        expect(handTotal([C(10), C(11)])).toEqual({ total: 20, soft: false });
    });

    it('treats ace as 11 when it fits (soft)', () => {
        expect(handTotal([C(1), C(7)])).toEqual({ total: 18, soft: true });
        expect(handTotal([C(1), C(13)])).toEqual({ total: 21, soft: true });  // blackjack
    });

    it('falls back to ace as 1 when 11 would bust', () => {
        // A + 7 + 5 = soft 13 = 13 (since 11+7+5 = 23 busts).
        expect(handTotal([C(1), C(7), C(5)])).toEqual({ total: 13, soft: false });
    });

    it('handles multiple aces', () => {
        // A + A = 12 soft; 11+1.
        expect(handTotal([C(1), C(1)])).toEqual({ total: 12, soft: true });
        // A + A + 9 = 21 soft (11+1+9).
        expect(handTotal([C(1), C(1), C(9)])).toEqual({ total: 21, soft: true });
        // A + A + 10 = 12 hard (1+1+10).
        expect(handTotal([C(1), C(1), C(10)])).toEqual({ total: 12, soft: false });
    });
});

describe('isBlackjack', () => {
    it('detects natural blackjack (Ace + 10-value, exactly two cards)', () => {
        expect(isBlackjack([C(1), C(10)])).toBe(true);
        expect(isBlackjack([C(1), C(13)])).toBe(true);
        expect(isBlackjack([C(11), C(1)])).toBe(true);
    });

    it('does not count three-card 21 as blackjack', () => {
        expect(isBlackjack([C(7), C(7), C(7)])).toBe(false);
        expect(isBlackjack([C(1), C(5), C(5)])).toBe(false);
    });

    it('returns false for 20 or below', () => {
        expect(isBlackjack([C(10), C(10)])).toBe(false);
    });
});

describe('isBust', () => {
    it('detects bust hands', () => {
        expect(isBust([C(10), C(10), C(2)])).toBe(true);
        expect(isBust([C(10), C(10), C(1)])).toBe(false); // 21 with ace as 1
    });

    it('does not bust a soft 21', () => {
        expect(isBust([C(1), C(10)])).toBe(false);
    });
});

describe('dealerPlay', () => {
    it('stands on hard 17+', () => {
        const hand = [C(10), C(7)];
        const result = dealerPlay(hand);
        expect(handTotal(result).total).toBe(17);
    });

    it('stands on soft 17 (S17 rules)', () => {
        const hand = [C(1), C(6)]; // soft 17
        const result = dealerPlay(hand);
        expect(handTotal(result).total).toBe(17);
        expect(handTotal(result).soft).toBe(true);
    });

    it('hits on 16 and below', () => {
        const hand = [C(10), C(6)]; // 16
        const result = dealerPlay(hand);
        // After hitting at least once the hand should not still be at 16
        // (could bust or land at 17+).
        expect(result.length).toBeGreaterThan(2);
    });
});

describe('settle', () => {
    it('player blackjack pays 3:2', () => {
        const r = settle([C(1), C(10)], [C(10), C(7)], 10, false);
        expect(r.outcome).toBe('blackjack');
        expect(r.payout).toBe(25); // 10 * 2.5
    });

    it('dealer blackjack with player blackjack pushes', () => {
        const r = settle([C(1), C(10)], [C(1), C(13)], 10, false);
        expect(r.outcome).toBe('push');
        expect(r.payout).toBe(10);
    });

    it('player bust loses', () => {
        const r = settle([C(10), C(10), C(5)], [C(10), C(7)], 10, false);
        expect(r.outcome).toBe('lose');
        expect(r.payout).toBe(0);
    });

    it('dealer bust pays 1:1', () => {
        const r = settle([C(10), C(8)], [C(10), C(7), C(8)], 10, false);
        expect(r.outcome).toBe('win');
        expect(r.payout).toBe(20);
    });

    it('higher player total wins 1:1', () => {
        const r = settle([C(10), C(9)], [C(10), C(7)], 10, false);
        expect(r.outcome).toBe('win');
        expect(r.payout).toBe(20);
    });

    it('equal totals push', () => {
        const r = settle([C(10), C(8)], [C(10), C(8)], 10, false);
        expect(r.outcome).toBe('push');
        expect(r.payout).toBe(10);
    });

    it('lower player total loses', () => {
        const r = settle([C(10), C(7)], [C(10), C(9)], 10, false);
        expect(r.outcome).toBe('lose');
        expect(r.payout).toBe(0);
    });

    it('doubled-down 3-card 21 pays 1:1 (not blackjack)', () => {
        const r = settle([C(1), C(5), C(5)], [C(10), C(8)], 20, true);
        expect(r.outcome).toBe('win');
        expect(r.payout).toBe(40);
    });
});

describe('config', () => {
    it('exposes valid bet levels', () => {
        expect(BLACKJACK_BETS).toContain(2);
        expect(BLACKJACK_BETS).toContain(50);
    });
});
