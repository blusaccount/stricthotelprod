import { describe, it, expect } from 'vitest';
import {
    PLINKO_BETS,
    PAYTABLE,
    ROWS,
    BUCKETS,
    RISK_LEVELS,
    dropBall,
    evaluate
} from '../handlers/plinko.js';

describe('Plinko config', () => {
    it('has 12 rows / 13 buckets', () => {
        expect(ROWS).toBe(12);
        expect(BUCKETS).toBe(13);
    });

    it('exposes three risk levels', () => {
        expect(RISK_LEVELS).toEqual(['low', 'medium', 'high']);
    });

    it('paytable is symmetric and length matches buckets', () => {
        for (const level of RISK_LEVELS) {
            const m = PAYTABLE[level];
            expect(m).toHaveLength(BUCKETS);
            for (let i = 0; i < BUCKETS; i++) {
                expect(m[i]).toBe(m[BUCKETS - 1 - i]);
            }
        }
    });

    it('edge buckets pay more than the middle bucket', () => {
        for (const level of RISK_LEVELS) {
            const m = PAYTABLE[level];
            const mid = Math.floor(BUCKETS / 2);
            expect(m[0]).toBeGreaterThan(m[mid]);
            expect(m[BUCKETS - 1]).toBeGreaterThan(m[mid]);
        }
    });

    it('high-risk maximum is significantly higher than low-risk maximum', () => {
        expect(PAYTABLE.high[0]).toBeGreaterThan(PAYTABLE.low[0] * 10);
    });

    it('exposes valid bet levels', () => {
        expect(PLINKO_BETS).toContain(5);
        expect(PLINKO_BETS).toContain(500);
    });
});

describe('dropBall', () => {
    it('returns a path of ROWS binary steps and a bucket index in 0..12', () => {
        for (let i = 0; i < 100; i++) {
            const { path, bucket } = dropBall();
            expect(path).toHaveLength(ROWS);
            for (const step of path) expect([0, 1]).toContain(step);
            expect(bucket).toBeGreaterThanOrEqual(0);
            expect(bucket).toBeLessThanOrEqual(BUCKETS - 1);
            expect(bucket).toBe(path.reduce((a, b) => a + b, 0));
        }
    });
});

describe('evaluate', () => {
    it('multiplies bet by paytable[risk][bucket] (rounded)', () => {
        for (const level of RISK_LEVELS) {
            for (let b = 0; b < BUCKETS; b++) {
                const expected = Math.round(10 * PAYTABLE[level][b]);
                expect(evaluate(b, level, 10)).toBe(expected);
            }
        }
    });
});

describe('Plinko RTP simulation', () => {
    it('every risk level achieves 93–98 % RTP over 200 K drops', { timeout: 30000 }, () => {
        const n = 200_000;
        const bet = 10;
        for (const level of RISK_LEVELS) {
            let totalBet = 0, totalPay = 0;
            for (let i = 0; i < n; i++) {
                totalBet += bet;
                const { bucket } = dropBall();
                totalPay += evaluate(bucket, level, bet);
            }
            const rtp = (totalPay / totalBet) * 100;
            console.log(`Plinko ${level} RTP over ${n.toLocaleString()} drops: ${rtp.toFixed(3)} %`);
            expect(rtp).toBeGreaterThanOrEqual(93);
            expect(rtp).toBeLessThanOrEqual(98);
        }
    });
});
