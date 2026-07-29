import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../db.js', () => ({
    isDatabaseEnabled: vi.fn(() => false),
    query: vi.fn(),
}));

import { isDatabaseEnabled, query } from '../db.js';
import {
    BRAIN_GAMES,
    GAMES_PER_DAY,
    utcDay,
    gamesForDay,
    getDailyResult,
    saveDailyResult,
    getDailyLeaderboard,
    getChallengeStreak,
    streakFromDays,
    bandForScore,
    buildShareText,
    shareUrl,
    SHARE_SQUARES,
} from '../brain-daily.js';

let seq = 0;
const uniq = (p) => `${p}_${++seq}_${Math.floor(Math.random() * 1e6)}`;

describe('daily brain challenge', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        isDatabaseEnabled.mockReturnValue(false);
    });

    describe('utcDay', () => {
        it('formats as YYYY-MM-DD in UTC', () => {
            expect(utcDay(new Date(Date.UTC(2026, 6, 28, 12)))).toBe('2026-07-28');
        });

        it('uses the UTC boundary, not the local one', () => {
            // 23:30 UTC is still the 28th no matter where the server stands.
            expect(utcDay(new Date(Date.UTC(2026, 6, 28, 23, 30)))).toBe('2026-07-28');
            expect(utcDay(new Date(Date.UTC(2026, 6, 29, 0, 1)))).toBe('2026-07-29');
        });
    });

    describe('gamesForDay', () => {
        it('is deterministic — the whole point of a daily', () => {
            expect(gamesForDay('2026-07-28')).toEqual(gamesForDay('2026-07-28'));
        });

        it('picks three distinct games from the pool', () => {
            for (const day of ['2026-01-01', '2026-07-28', '2027-12-31']) {
                const picked = gamesForDay(day);
                expect(picked).toHaveLength(GAMES_PER_DAY);
                expect(new Set(picked).size).toBe(GAMES_PER_DAY);
                for (const g of picked) expect(BRAIN_GAMES).toContain(g);
            }
        });

        it('varies from day to day', () => {
            const days = [];
            for (let i = 0; i < 30; i++) {
                days.push(gamesForDay(new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10)).join(','));
            }
            expect(new Set(days).size).toBeGreaterThan(5);
        });

        it('uses every game roughly evenly over a year', () => {
            const counts = Object.fromEntries(BRAIN_GAMES.map(g => [g, 0]));
            for (let i = 0; i < 365; i++) {
                const day = new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10);
                for (const g of gamesForDay(day)) counts[g]++;
            }
            const total = Object.values(counts).reduce((a, b) => a + b, 0);
            expect(total).toBe(365 * GAMES_PER_DAY);
            // Perfectly even would be 219 each; allow generous drift but catch
            // a game that is effectively never or always chosen.
            for (const g of BRAIN_GAMES) {
                expect(counts[g]).toBeGreaterThan(120);
                expect(counts[g]).toBeLessThan(320);
            }
        });
    });

    describe('one attempt per day', () => {
        it('stores the first result', async () => {
            const name = uniq('P');
            await expect(saveDailyResult(name, '2026-07-28', 30, [{ gameId: 'math', score: 50 }]))
                .resolves.toMatchObject({ stored: true });
        });

        it('refuses the second and keeps the first, even when it is better', async () => {
            const name = uniq('P');
            await saveDailyResult(name, '2026-07-28', 40, [{ gameId: 'math', score: 10 }]);

            const second = await saveDailyResult(name, '2026-07-28', 20, [{ gameId: 'math', score: 99 }]);

            expect(second.stored).toBe(false);
            expect(second.existing.brainAge).toBe(40);
            const stored = await getDailyResult(name, '2026-07-28');
            expect(stored.brainAge).toBe(40);
        });

        it('treats each day separately', async () => {
            const name = uniq('P');
            await saveDailyResult(name, '2026-07-28', 40, []);
            await expect(saveDailyResult(name, '2026-07-29', 35, []))
                .resolves.toMatchObject({ stored: true });
        });

        it('returns null for a day not played', async () => {
            await expect(getDailyResult(uniq('P'), '2026-07-28')).resolves.toBeNull();
        });

        it('ignores a missing player name', async () => {
            await expect(saveDailyResult('', '2026-07-28', 30, [])).resolves.toMatchObject({ stored: false });
            await expect(getDailyResult('', '2026-07-28')).resolves.toBeNull();
        });
    });

    describe('daily leaderboard', () => {
        it('ranks lowest brain age first and scopes to the day', async () => {
            const day = '2030-01-01';
            const a = uniq('A'); const b = uniq('B'); const c = uniq('C');
            await saveDailyResult(a, day, 40, []);
            await saveDailyResult(b, day, 25, []);
            await saveDailyResult(c, '2030-01-02', 10, []);

            const board = await getDailyLeaderboard(day);
            const names = board.map(r => r.name);

            expect(names.indexOf(b)).toBeLessThan(names.indexOf(a));
            expect(names).not.toContain(c);
        });

        it('honours the limit', async () => {
            const day = '2030-02-01';
            for (let i = 0; i < 5; i++) await saveDailyResult(uniq('L'), day, 30 + i, []);
            await expect(getDailyLeaderboard(day, 2)).resolves.toHaveLength(2);
        });
    });

    describe('challenge streak', () => {
        it('counts consecutive days up to today', () => {
            expect(streakFromDays(['2026-07-26', '2026-07-27', '2026-07-28'], '2026-07-28'))
                .toMatchObject({ current: 3, playedToday: true });
        });

        it('keeps the run alive on a day not yet played', () => {
            // Otherwise a streak reads 0 all morning and looks broken to
            // somebody who is not late at all.
            expect(streakFromDays(['2026-07-26', '2026-07-27'], '2026-07-28'))
                .toMatchObject({ current: 2, playedToday: false });
        });

        it('ends the run after a full day missed', () => {
            // Played up to the 26th, nothing on the 27th, today is the 28th.
            expect(streakFromDays(['2026-07-25', '2026-07-26'], '2026-07-28'))
                .toMatchObject({ current: 0, playedToday: false });
        });

        it('starts the run over after a gap', () => {
            const s = streakFromDays(
                ['2026-07-01', '2026-07-02', '2026-07-03', '2026-07-27', '2026-07-28'],
                '2026-07-28'
            );
            expect(s.current).toBe(2);
            expect(s.best).toBe(3);
        });

        it('remembers a best run that is already over', () => {
            const s = streakFromDays(['2026-06-01', '2026-06-02', '2026-06-03', '2026-07-28'], '2026-07-28');
            expect(s).toMatchObject({ current: 1, best: 3 });
        });

        it('crosses month and year boundaries', () => {
            expect(streakFromDays(['2025-12-30', '2025-12-31', '2026-01-01'], '2026-01-01').current).toBe(3);
        });

        it('is empty for a player who has never played', () => {
            expect(streakFromDays([], '2026-07-28')).toEqual({ current: 0, best: 0, playedToday: false });
        });

        it('ignores duplicate days', () => {
            expect(streakFromDays(['2026-07-28', '2026-07-28'], '2026-07-28').current).toBe(1);
        });

        it('is derived from stored results, so playing extends it', async () => {
            const name = uniq('S');
            await saveDailyResult(name, '2026-07-27', 30, []);
            await expect(getChallengeStreak(name, '2026-07-28'))
                .resolves.toMatchObject({ current: 1, playedToday: false });

            await saveDailyResult(name, '2026-07-28', 30, []);
            await expect(getChallengeStreak(name, '2026-07-28'))
                .resolves.toMatchObject({ current: 2, playedToday: true });
        });

        it('does not count another player\'s days', async () => {
            const mine = uniq('S'); const theirs = uniq('S');
            await saveDailyResult(theirs, '2026-07-27', 30, []);
            await saveDailyResult(theirs, '2026-07-28', 30, []);
            await saveDailyResult(mine, '2026-07-28', 30, []);
            await expect(getChallengeStreak(mine, '2026-07-28')).resolves.toMatchObject({ current: 1 });
        });

        it('splits memory keys at the last separator, since a name may contain one', async () => {
            const name = `Pipe|Player_${++seq}`;
            await saveDailyResult(name, '2026-07-28', 30, []);
            await expect(getChallengeStreak(name, '2026-07-28'))
                .resolves.toMatchObject({ current: 1, playedToday: true });
        });

        it('is empty without a player name', async () => {
            await expect(getChallengeStreak('', '2026-07-28'))
                .resolves.toEqual({ current: 0, best: 0, playedToday: false });
        });

        it('reads the day as text and bounds the history', async () => {
            // A `date` comes back from pg as a JS Date at *local* midnight,
            // which shifts the day backwards on any positive UTC offset.
            isDatabaseEnabled.mockReturnValue(true);
            query.mockResolvedValue({ rowCount: 1, rows: [{ day: '2026-07-28' }] });

            await expect(getChallengeStreak('Someone', '2026-07-28'))
                .resolves.toMatchObject({ current: 1, playedToday: true });

            const [sql, params] = query.mock.calls[0];
            expect(sql).toContain('day::text');
            expect(sql).toContain('r.day > $2::date - $3::int');
            expect(params[2]).toBeGreaterThan(0);
        });

        it('returns an empty streak rather than throwing when the query fails', async () => {
            isDatabaseEnabled.mockReturnValue(true);
            query.mockRejectedValue(new Error('boom'));
            await expect(getChallengeStreak('Someone', '2026-07-28'))
                .resolves.toEqual({ current: 0, best: 0, playedToday: false });
        });
    });

    describe('share grid', () => {
        it('bands reaction by milliseconds, lower being better', () => {
            expect(bandForScore('reaction', 250)).toBe('great');
            expect(bandForScore('reaction', 400)).toBe('ok');
            expect(bandForScore('reaction', 900)).toBe('poor');
        });

        it('bands the other games by score, higher being better', () => {
            expect(bandForScore('math', 95)).toBe('great');
            expect(bandForScore('math', 60)).toBe('ok');
            expect(bandForScore('math', 10)).toBe('poor');
        });

        it('treats a missing score as poor rather than throwing', () => {
            expect(bandForScore('math', undefined)).toBe('poor');
            expect(bandForScore('math', 'abc')).toBe('poor');
        });

        it('renders one square per game, in order', () => {
            const text = buildShareText('2026-07-28', 27, [
                { gameId: 'math', score: 90 },
                { gameId: 'stroop', score: 60 },
                { gameId: 'reaction', score: 900 },
            ], 'https://example.test');

            const lines = text.split('\n');
            expect(lines[0]).toBe('StrictHotel Daily 2026-07-28');
            expect(lines[1]).toContain('27');
            expect(lines[2]).toBe(SHARE_SQUARES.great + SHARE_SQUARES.ok + SHARE_SQUARES.poor);
            expect(lines[3]).toBe('https://example.test');
        });

        it('omits the URL line when the site has no address yet', () => {
            const text = buildShareText('2026-07-28', 27, [{ gameId: 'math', score: 90 }], '');
            expect(text.split('\n')).toHaveLength(3);
        });

        it('survives an empty game list', () => {
            expect(() => buildShareText('2026-07-28', 30, [], '')).not.toThrow();
            expect(() => buildShareText('2026-07-28', 30, null, '')).not.toThrow();
        });

        it('stays short enough to paste into a chat', () => {
            const text = buildShareText('2026-07-28', 27, [
                { gameId: 'math', score: 90 },
                { gameId: 'stroop', score: 60 },
                { gameId: 'reaction', score: 280 },
            ], 'https://stricthotel.example');
            expect(text.length).toBeLessThan(120);
        });
    });

    describe('shareUrl', () => {
        const saved = process.env.PUBLIC_URL;
        afterEach(() => {
            if (saved === undefined) delete process.env.PUBLIC_URL;
            else process.env.PUBLIC_URL = saved;
            delete process.env.RENDER_EXTERNAL_URL;
        });

        it('is empty until the site has an address', () => {
            delete process.env.PUBLIC_URL;
            delete process.env.RENDER_EXTERNAL_URL;
            expect(shareUrl()).toBe('');
        });

        it('strips trailing slashes', () => {
            process.env.PUBLIC_URL = 'https://example.test///';
            expect(shareUrl()).toBe('https://example.test');
        });

        it('falls back to the hosting platform variable', () => {
            delete process.env.PUBLIC_URL;
            process.env.RENDER_EXTERNAL_URL = 'https://render.test';
            expect(shareUrl()).toBe('https://render.test');
        });
    });

    describe('database mode', () => {
        it('refuses a duplicate through the primary key, not a read-then-write', async () => {
            isDatabaseEnabled.mockReturnValue(true);
            // rowCount 0 means the `on conflict do nothing` fired.
            query.mockResolvedValue({ rowCount: 0, rows: [] });

            const res = await saveDailyResult('Someone', '2026-07-28', 30, []);

            expect(res.stored).toBe(false);
            const sqls = query.mock.calls.map(c => c[0]);
            const insert = sqls.find(q => q.includes('insert into brain_daily_results'));
            expect(insert).toBeDefined();
            expect(insert).toContain('on conflict (player_id, day) do nothing');
        });

        it('ensures the player row exists before inserting the result', async () => {
            // A submit racing register-player would otherwise select no id,
            // insert nothing, and report "already played today" for a result
            // that was in fact dropped.
            isDatabaseEnabled.mockReturnValue(true);
            query.mockResolvedValue({ rowCount: 1, rows: [{ brain_age: 30 }] });

            await saveDailyResult('Someone', '2026-07-28', 30, []);

            const sqls = query.mock.calls.map(c => c[0]);
            const playerInsert = sqls.findIndex(q => q.includes('insert into players'));
            const resultInsert = sqls.findIndex(q => q.includes('insert into brain_daily_results'));
            expect(playerInsert).toBeGreaterThan(-1);
            expect(playerInsert).toBeLessThan(resultInsert);
        });
    });
});
