import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db.js', () => ({
    isDatabaseEnabled: vi.fn(() => true),
    query: vi.fn(),
}));

import { isDatabaseEnabled, query } from '../db.js';
import { getSiteStats, clampDays } from '../stats.js';

// Answers shaped by which table the query names, so the order of the
// Promise.all does not have to be duplicated here.
function mockRows() {
    query.mockImplementation((sql) => {
        if (sql.includes('count(discord_id)')) {
            return Promise.resolve({ rows: [{ total: 12, with_discord: 4 }] });
        }
        if (sql.includes('last_seen_at')) {
            return Promise.resolve({ rows: [{ day1: 3, day7: 8, day30: 11 }] });
        }
        if (sql.includes('group by reason')) {
            return Promise.resolve({ rows: [{ reason: 'brain_daily', events: 20, players: 5 }] });
        }
        if (sql.includes('from wallet_ledger')) {
            return Promise.resolve({ rows: [{ day: '2026-07-28', players: 5, events: 20 }] });
        }
        if (sql.includes('group by player_id')) {
            return Promise.resolve({ rows: [{ bucket: '7+', players: 2 }] });
        }
        if (sql.includes('brain_daily_results')) {
            return Promise.resolve({ rows: [{ day: '2026-07-28', players: 5 }] });
        }
        return Promise.resolve({ rows: [] });
    });
}

describe('site stats', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        isDatabaseEnabled.mockReturnValue(true);
    });

    describe('clampDays', () => {
        it('defaults to 30 for anything unusable', () => {
            for (const v of [undefined, null, '', 'abc', 0, -5]) expect(clampDays(v)).toBe(30);
        });

        it('caps the window so the endpoint cannot be turned into a table scan', () => {
            expect(clampDays('99999')).toBe(365);
            expect(clampDays('7')).toBe(7);
        });
    });

    it('writes nothing — it is a read-only view of gameplay tables', async () => {
        mockRows();
        await getSiteStats({});
        for (const [sql] of query.mock.calls) {
            expect(sql).toMatch(/^\s*select/i);
            expect(sql).not.toMatch(/\b(insert|update|delete|create|drop|alter)\b/i);
        }
    });

    it('returns no player names and no per-person rows', async () => {
        mockRows();
        const stats = await getSiteStats({});
        const json = JSON.stringify(stats);
        // The one identifier-shaped field a careless query could leak.
        expect(json).not.toMatch(/"name"/);
        expect(json).not.toMatch(/player_id/);
        for (const [sql] of query.mock.calls) {
            expect(sql).not.toMatch(/\bp\.name\b|select name\b/);
        }
    });

    it('collects accounts, activity and the daily challenge', async () => {
        mockRows();
        const stats = await getSiteStats({ days: 7, onlineNow: 2 });

        expect(stats.windowDays).toBe(7);
        expect(stats.onlineNow).toBe(2);
        expect(stats.accounts).toEqual({ total: 12, withDiscord: 4 });
        expect(stats.activePlayers).toEqual({ last24h: 3, last7d: 8, last30d: 11 });
        expect(stats.perDay).toEqual([{ day: '2026-07-28', players: 5, events: 20 }]);
        expect(stats.byReason).toEqual([{ reason: 'brain_daily', events: 20, players: 5 }]);
        expect(stats.dailyChallenge.perDay).toEqual([{ day: '2026-07-28', players: 5 }]);
        expect(stats.dailyChallenge.playersByDaysPlayed).toEqual({ '7+': 2 });
        expect(stats.generatedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
    });

    it('passes the clamped window to the queries rather than interpolating it', async () => {
        mockRows();
        await getSiteStats({ days: '99999' });
        const windowed = query.mock.calls.filter(c => Array.isArray(c[1]) && c[1].length);
        expect(windowed.length).toBeGreaterThan(0);
        for (const [, params] of windowed) expect(params).toEqual([365]);
    });

    it('reads days as text, since pg parses a date at local midnight', async () => {
        mockRows();
        await getSiteStats({});
        const dailySql = query.mock.calls.map(c => c[0])
            .find(s => s.includes('from brain_daily_results') && s.includes('group by day'));
        expect(dailySql).toContain('day::text');
    });

    it('says so plainly when there is no database, instead of reporting zeroes', async () => {
        isDatabaseEnabled.mockReturnValue(false);
        const stats = await getSiteStats({});
        expect(stats.database).toBe(false);
        expect(stats.accounts).toBeUndefined();
        expect(query).not.toHaveBeenCalled();
    });
});
