import { describe, it, expect } from 'vitest';
import { rewardForDay, todayIndex, STREAK_REWARDS } from '../daily-streak.js';

describe('daily-streak math', () => {
    it('STREAK_REWARDS is 7 entries with monotonically increasing values', () => {
        expect(STREAK_REWARDS).toHaveLength(7);
        for (let i = 1; i < 7; i++) {
            expect(STREAK_REWARDS[i]).toBeGreaterThan(STREAK_REWARDS[i - 1]);
        }
    });

    it('rewardForDay matches the table for days 1-7', () => {
        for (let d = 1; d <= 7; d++) {
            expect(rewardForDay(d).coins).toBe(STREAK_REWARDS[d - 1]);
        }
    });

    it('day 7 grants 1 diamond, days 1-6 do not', () => {
        for (let d = 1; d <= 6; d++) expect(rewardForDay(d).diamonds).toBe(0);
        expect(rewardForDay(7).diamonds).toBe(1);
    });

    it('cycles wrap around at day 8 with a +50% bonus', () => {
        const day1 = rewardForDay(1).coins;
        const day8 = rewardForDay(8).coins;
        expect(day8).toBe(Math.floor(day1 * 1.5));
        const day7 = rewardForDay(7).coins;
        const day14 = rewardForDay(14).coins;
        expect(day14).toBe(Math.floor(day7 * 1.5));
        // Day 14 should still grant a diamond (slot 7 of the second cycle).
        expect(rewardForDay(14).diamonds).toBe(1);
    });

    it('day 21 (third cycle, slot 7) grants 2x bonus and a diamond', () => {
        const day7 = rewardForDay(7).coins;
        const day21 = rewardForDay(21).coins;
        expect(day21).toBe(Math.floor(day7 * 2.0));
        expect(rewardForDay(21).diamonds).toBe(1);
    });
});

describe('todayIndex', () => {
    it('returns a positive integer that increments roughly daily', () => {
        const idx = todayIndex();
        expect(Number.isInteger(idx)).toBe(true);
        expect(idx).toBeGreaterThan(20000);
        // Should match Math.floor(Date.now() / 86_400_000) ± 1
        const expected = Math.floor(Date.now() / 86_400_000);
        expect(Math.abs(idx - expected)).toBeLessThanOrEqual(1);
    });
});
