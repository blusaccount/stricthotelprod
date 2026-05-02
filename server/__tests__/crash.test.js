import { describe, it, expect } from 'vitest';
import {
    HOUSE_EDGE,
    GROWTH_RATE,
    BETTING_MS,
    REVEAL_MS,
    TICK_MS,
    CRASH_BETS,
    sampleCrashMultiplier,
    multiplierAt,
    timeForMultiplier
} from '../handlers/crash.js';

describe('Crash config', () => {
    it('exposes 4 % house edge (96 % RTP)', () => {
        expect(HOUSE_EDGE).toBeCloseTo(0.04, 5);
    });

    it('has reasonable phase durations', () => {
        expect(BETTING_MS).toBeGreaterThanOrEqual(3_000);
        expect(BETTING_MS).toBeLessThanOrEqual(15_000);
        expect(REVEAL_MS).toBeGreaterThanOrEqual(1_500);
        expect(TICK_MS).toBeGreaterThan(0);
        expect(TICK_MS).toBeLessThanOrEqual(250);
    });

    it('exposes valid bet levels', () => {
        expect(CRASH_BETS).toContain(5);
        expect(CRASH_BETS).toContain(500);
    });

    it('GROWTH_RATE is positive', () => {
        expect(GROWTH_RATE).toBeGreaterThan(0);
    });
});

describe('multiplierAt', () => {
    it('returns 1.0 at t=0', () => {
        expect(multiplierAt(0)).toBeCloseTo(1.0, 6);
    });

    it('grows monotonically', () => {
        let prev = 0;
        for (let t = 0; t <= 60_000; t += 1000) {
            const m = multiplierAt(t);
            expect(m).toBeGreaterThan(prev);
            prev = m;
        }
    });

    it('matches the exponential formula', () => {
        for (const ts of [1000, 5000, 10_000, 30_000]) {
            const expected = Math.exp(GROWTH_RATE * (ts / 1000));
            expect(multiplierAt(ts)).toBeCloseTo(expected, 6);
        }
    });
});

describe('timeForMultiplier', () => {
    it('inverts multiplierAt', () => {
        for (const target of [1.5, 2.0, 5.0, 10.0, 100.0]) {
            const t = timeForMultiplier(target);
            const m = multiplierAt(t);
            expect(m).toBeCloseTo(target, 4);
        }
    });

    it('returns 0 for target ≤ 1', () => {
        expect(timeForMultiplier(1)).toBe(0);
        expect(timeForMultiplier(0.5)).toBe(0);
    });
});

describe('sampleCrashMultiplier', () => {
    it('always returns ≥ 1.0', () => {
        for (let i = 0; i < 1000; i++) {
            expect(sampleCrashMultiplier()).toBeGreaterThanOrEqual(1.0);
        }
    });

    it('caps at 100,000', () => {
        for (let i = 0; i < 1000; i++) {
            expect(sampleCrashMultiplier()).toBeLessThanOrEqual(100_000);
        }
    });

    it('approximately HOUSE_EDGE fraction crashes at 1.00 (instant rug)', () => {
        const n = 50_000;
        let instant = 0;
        for (let i = 0; i < n; i++) {
            if (sampleCrashMultiplier() === 1.00) instant++;
        }
        const frac = instant / n;
        expect(frac).toBeGreaterThanOrEqual(HOUSE_EDGE * 0.7);
        expect(frac).toBeLessThanOrEqual(HOUSE_EDGE * 1.3);
    });

    it('per-target RTP is approximately (1 − HOUSE_EDGE) regardless of cash-out target', { timeout: 30000 }, () => {
        const n = 200_000;
        const targets = [1.5, 2, 5, 10];
        const expectedRtp = (1 - HOUSE_EDGE) * 100;
        for (const t of targets) {
            let totalBet = 0;
            let totalPay = 0;
            for (let i = 0; i < n; i++) {
                totalBet += 1;
                const c = sampleCrashMultiplier();
                if (c >= t) totalPay += t;
            }
            const rtp = (totalPay / totalBet) * 100;
            // ±1.5 % tolerance to allow Monte Carlo noise.
            expect(rtp).toBeGreaterThan(expectedRtp - 1.5);
            expect(rtp).toBeLessThan(expectedRtp + 1.5);
        }
    });
});
