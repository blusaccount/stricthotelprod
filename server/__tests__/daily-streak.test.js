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

    it('cycles wrap with no bonus — day 8 = day 1, day 14 = day 7', () => {
        expect(rewardForDay(8).coins).toBe(rewardForDay(1).coins);
        expect(rewardForDay(14).coins).toBe(rewardForDay(7).coins);
        expect(rewardForDay(14).diamonds).toBe(1); // every 7th day
    });

    it('coin reward is capped at 150 (day 7)', () => {
        expect(rewardForDay(7).coins).toBe(150);
        for (let d = 1; d <= 30; d++) {
            expect(rewardForDay(d).coins).toBeLessThanOrEqual(150);
        }
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
