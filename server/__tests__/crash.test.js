import { describe, it, expect } from 'vitest';
import {
    HOUSE_EDGE,
    GROWTH_RATE,
    LAUNCH_MS,
    MIN_AUTO_CASHOUT,
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

    it('has a launch phase long enough to be readable', () => {
        expect(LAUNCH_MS).toBeGreaterThanOrEqual(1_000);
        expect(LAUNCH_MS).toBeLessThanOrEqual(10_000);
    });

    it('auto-cashout targets must be profitable', () => {
        expect(MIN_AUTO_CASHOUT).toBeGreaterThan(1);
    });
});

describe('multiplierAt', () => {
    it('starts at 0 and reaches exactly 1.0 at the end of the launch phase', () => {
        expect(multiplierAt(0)).toBe(0);
        expect(multiplierAt(-50)).toBe(0);
        expect(multiplierAt(LAUNCH_MS)).toBeCloseTo(1.0, 6);
    });

    it('ramps linearly through the launch phase', () => {
        expect(multiplierAt(LAUNCH_MS * 0.25)).toBeCloseTo(0.25, 6);
        expect(multiplierAt(LAUNCH_MS * 0.5)).toBeCloseTo(0.5, 6);
        expect(multiplierAt(LAUNCH_MS * 0.9)).toBeCloseTo(0.9, 6);
    });

    it('grows monotonically across both phases', () => {
        let prev = -1;
        for (let t = 0; t <= 60_000; t += 250) {
            const m = multiplierAt(t);
            expect(m).toBeGreaterThan(prev);
            prev = m;
        }
    });

    it('matches the exponential formula after the launch phase', () => {
        for (const ts of [1000, 5000, 10_000, 30_000]) {
            const expected = Math.exp(GROWTH_RATE * (ts / 1000));
            expect(multiplierAt(LAUNCH_MS + ts)).toBeCloseTo(expected, 6);
        }
    });
});

describe('timeForMultiplier', () => {
    it('inverts multiplierAt above 1.0', () => {
        for (const target of [1.5, 2.0, 5.0, 10.0, 100.0]) {
            const t = timeForMultiplier(target);
            expect(multiplierAt(t)).toBeCloseTo(target, 4);
        }
    });

    it('inverts multiplierAt inside the launch phase', () => {
        for (const target of [0.1, 0.43, 0.75, 0.99]) {
            const t = timeForMultiplier(target);
            expect(multiplierAt(t)).toBeCloseTo(target, 6);
        }
    });

    it('reaches break-even exactly at LAUNCH_MS', () => {
        expect(timeForMultiplier(1)).toBe(LAUNCH_MS);
        expect(timeForMultiplier(0)).toBe(0);
    });
});

describe('sampleCrashMultiplier', () => {
    it('always returns ≥ 0', () => {
        for (let i = 0; i < 1000; i++) {
            expect(sampleCrashMultiplier()).toBeGreaterThanOrEqual(0);
        }
    });

    it('caps at 100,000', () => {
        for (let i = 0; i < 1000; i++) {
            expect(sampleCrashMultiplier()).toBeLessThanOrEqual(100_000);
        }
    });

    it('approximately HOUSE_EDGE fraction dies before break-even', () => {
        const n = 50_000;
        let doomed = 0;
        for (let i = 0; i < n; i++) {
            if (sampleCrashMultiplier() < 1.00) doomed++;
        }
        const frac = doomed / n;
        expect(frac).toBeGreaterThanOrEqual(HOUSE_EDGE * 0.7);
        expect(frac).toBeLessThanOrEqual(HOUSE_EDGE * 1.3);
    });

    it('spreads the doomed rounds uniformly over [0, 1)', () => {
        // The whole point of the launch phase: a doomed round must be visible,
        // not parked on 1.00. Each quarter of [0,1) should get ~a quarter of them.
        const n = 400_000;
        const quarters = [0, 0, 0, 0];
        let doomed = 0;
        for (let i = 0; i < n; i++) {
            const c = sampleCrashMultiplier();
            if (c < 1.00) {
                quarters[Math.min(3, Math.floor(c * 4))]++;
                doomed++;
            }
        }
        expect(doomed).toBeGreaterThan(1000);
        for (const q of quarters) {
            expect(q / doomed).toBeGreaterThan(0.20);
            expect(q / doomed).toBeLessThan(0.30);
        }
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

    it('bailing out below break-even is worse than holding — it is a panic option, not a strategy', { timeout: 30000 }, () => {
        // Documents the deliberate design: the rescue window exists for feel,
        // and every target inside it returns less than the flat 96 %.
        const n = 100_000;
        for (const t of [0.25, 0.5, 0.75]) {
            let pay = 0;
            for (let i = 0; i < n; i++) {
                if (sampleCrashMultiplier() >= t) pay += t;
            }
            const rtp = (pay / n) * 100;
            expect(rtp).toBeLessThan((1 - HOUSE_EDGE) * 100);
            // ...and it degrades the earlier you bail: EV ≈ t · (1 − edge · t).
            expect(rtp).toBeCloseTo(t * (1 - HOUSE_EDGE * t) * 100, 0);
        }
    });
});
