import { describe, it, expect } from 'vitest';
import {
    ROULETTE_BETS,
    POCKET_COUNT,
    RED_NUMBERS,
    BLACK_NUMBERS,
    isRed,
    isBlack,
    pocketColor,
    spinWheel,
    evaluateBet,
    validateBets
} from '../handlers/roulette.js';

describe('Roulette config', () => {
    it('has 37 pockets (European 0..36)', () => {
        expect(POCKET_COUNT).toBe(37);
    });

    it('has 18 red and 18 black numbers, no overlap', () => {
        expect(RED_NUMBERS.size).toBe(18);
        expect(BLACK_NUMBERS.size).toBe(18);
        for (const n of RED_NUMBERS) expect(BLACK_NUMBERS.has(n)).toBe(false);
    });

    it('exposes valid bet levels', () => {
        expect(ROULETTE_BETS).toContain(5);
        expect(ROULETTE_BETS).toContain(500);
    });
});

describe('pocketColor', () => {
    it('classifies 0 as green', () => {
        expect(pocketColor(0)).toBe('green');
    });
    it('classifies 1, 5, 7 as red', () => {
        for (const n of [1, 5, 7, 12, 18, 25, 32, 36]) expect(pocketColor(n)).toBe('red');
    });
    it('classifies 2, 4 as black', () => {
        for (const n of [2, 4, 6, 13, 17, 26, 31, 35]) expect(pocketColor(n)).toBe('black');
    });
});

describe('spinWheel', () => {
    it('always returns 0..36', () => {
        for (let i = 0; i < 1000; i++) {
            const p = spinWheel();
            expect(p).toBeGreaterThanOrEqual(0);
            expect(p).toBeLessThanOrEqual(36);
        }
    });
});

describe('evaluateBet', () => {
    it('straight bet pays 35:1 on hit', () => {
        const r = evaluateBet({ type: 'straight', value: 17, amount: 10 }, 17);
        expect(r.won).toBe(true);
        expect(r.payout).toBe(360); // 35:1 + stake = 36×stake
    });
    it('straight bet loses on miss', () => {
        const r = evaluateBet({ type: 'straight', value: 17, amount: 10 }, 18);
        expect(r.won).toBe(false);
    });
    it('red wins on red, loses on 0', () => {
        expect(evaluateBet({ type: 'red', amount: 10 }, 1).won).toBe(true);
        expect(evaluateBet({ type: 'red', amount: 10 }, 2).won).toBe(false);
        expect(evaluateBet({ type: 'red', amount: 10 }, 0).won).toBe(false);
    });
    it('even loses on 0 even though 0 is technically even', () => {
        expect(evaluateBet({ type: 'even', amount: 10 }, 0).won).toBe(false);
        expect(evaluateBet({ type: 'even', amount: 10 }, 2).won).toBe(true);
        expect(evaluateBet({ type: 'odd',  amount: 10 }, 1).won).toBe(true);
    });
    it('low covers 1-18, high covers 19-36; both lose on 0', () => {
        expect(evaluateBet({ type: 'low',  amount: 10 }, 18).won).toBe(true);
        expect(evaluateBet({ type: 'low',  amount: 10 }, 19).won).toBe(false);
        expect(evaluateBet({ type: 'high', amount: 10 }, 19).won).toBe(true);
        expect(evaluateBet({ type: 'low',  amount: 10 }, 0).won).toBe(false);
        expect(evaluateBet({ type: 'high', amount: 10 }, 0).won).toBe(false);
    });
    it('dozens pay 2:1 (3× stake total)', () => {
        const r1 = evaluateBet({ type: 'dozen1', amount: 10 }, 5);
        expect(r1.won).toBe(true);
        expect(r1.payout).toBe(30);
        expect(evaluateBet({ type: 'dozen2', amount: 10 }, 13).won).toBe(true);
        expect(evaluateBet({ type: 'dozen3', amount: 10 }, 36).won).toBe(true);
        expect(evaluateBet({ type: 'dozen1', amount: 10 }, 0).won).toBe(false);
    });
    it('columns pay 2:1 (col1 = 1,4,7..., col2 = 2,5,8..., col3 = 3,6,9...)', () => {
        expect(evaluateBet({ type: 'col1', amount: 10 }, 1).won).toBe(true);
        expect(evaluateBet({ type: 'col1', amount: 10 }, 4).won).toBe(true);
        expect(evaluateBet({ type: 'col2', amount: 10 }, 5).won).toBe(true);
        expect(evaluateBet({ type: 'col3', amount: 10 }, 36).won).toBe(true);
        expect(evaluateBet({ type: 'col1', amount: 10 }, 0).won).toBe(false);
    });
});

describe('validateBets', () => {
    it('rejects non-array, empty array, or oversized array', () => {
        expect(validateBets(null)).toBeNull();
        expect(validateBets([])).toBeNull();
        const tooMany = Array(20).fill({ type: 'red', amount: 10 });
        expect(validateBets(tooMany)).toBeNull();
    });

    it('accepts valid bets', () => {
        const v = validateBets([{ type: 'red', amount: 10 }, { type: 'straight', value: 17, amount: 5 }]);
        expect(v).toHaveLength(2);
        expect(v[1].value).toBe(17);
    });

    it('rejects unknown bet types', () => {
        expect(validateBets([{ type: 'frenchsplit', amount: 10 }])).toBeNull();
    });

    it('rejects out-of-range straight numbers', () => {
        expect(validateBets([{ type: 'straight', value: 37, amount: 10 }])).toBeNull();
        expect(validateBets([{ type: 'straight', value: -1, amount: 10 }])).toBeNull();
    });

    it('rejects invalid bet amounts (must be in ROULETTE_BETS)', () => {
        expect(validateBets([{ type: 'red', amount: 7 }])).toBeNull();
        expect(validateBets([{ type: 'red', amount: 0 }])).toBeNull();
    });
});

describe('RTP simulation', () => {
    it('red bet RTP converges to 18/37 × 2 = 0.973 over 200K spins', { timeout: 30000 }, () => {
        const n = 200_000;
        let totalStake = 0, totalPayout = 0;
        for (let i = 0; i < n; i++) {
            totalStake += 10;
            const p = spinWheel();
            const r = evaluateBet({ type: 'red', amount: 10 }, p);
            totalPayout += r.payout;
        }
        const rtp = (totalPayout / totalStake) * 100;
        expect(rtp).toBeGreaterThan(96.0);
        expect(rtp).toBeLessThan(98.5);
    });

    it('straight-up RTP converges to 36/37 ≈ 0.973', { timeout: 30000 }, () => {
        const n = 200_000;
        let totalStake = 0, totalPayout = 0;
        for (let i = 0; i < n; i++) {
            totalStake += 10;
            const p = spinWheel();
            const r = evaluateBet({ type: 'straight', value: 17, amount: 10 }, p);
            totalPayout += r.payout;
        }
        const rtp = (totalPayout / totalStake) * 100;
        expect(rtp).toBeGreaterThan(94);
        expect(rtp).toBeLessThan(101);
    });
});
