import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

vi.mock('../db.js', () => ({
    isDatabaseEnabled: vi.fn(() => true),
    query: vi.fn(),
}));

import { isDatabaseEnabled, query } from '../db.js';
import {
    DEFAULT_RETENTION_MONTHS,
    getRetentionMonths,
    findDormantPlayers,
    purgeDormantPlayers,
    startRetentionJob,
    stopRetentionJob,
} from '../retention.js';

describe('account retention', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        isDatabaseEnabled.mockReturnValue(true);
        delete process.env.ACCOUNT_RETENTION_MONTHS;
    });

    afterEach(() => {
        stopRetentionJob();
        delete process.env.ACCOUNT_RETENTION_MONTHS;
        vi.restoreAllMocks();
    });

    describe('getRetentionMonths', () => {
        it('defaults to the 24 months the privacy notice states', () => {
            expect(getRetentionMonths()).toBe(DEFAULT_RETENTION_MONTHS);
            expect(DEFAULT_RETENTION_MONTHS).toBe(24);
        });

        it('treats an empty value as unset', () => {
            process.env.ACCOUNT_RETENTION_MONTHS = '';
            expect(getRetentionMonths()).toBe(24);
        });

        it('honours an explicit override', () => {
            process.env.ACCOUNT_RETENTION_MONTHS = '36';
            expect(getRetentionMonths()).toBe(36);
        });

        it('floors fractional values', () => {
            process.env.ACCOUNT_RETENTION_MONTHS = '18.9';
            expect(getRetentionMonths()).toBe(18);
        });

        it('switches deletion off only on an explicit zero', () => {
            process.env.ACCOUNT_RETENTION_MONTHS = '0';
            expect(getRetentionMonths()).toBeNull();
        });

        it('falls back to the default rather than honouring a period under six months', () => {
            // Shorter than this would delete players who took a summer off.
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            process.env.ACCOUNT_RETENTION_MONTHS = '3';
            expect(getRetentionMonths()).toBe(24);
            expect(warn).toHaveBeenCalled();
        });

        it('falls back to the default on junk and negatives', () => {
            const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
            process.env.ACCOUNT_RETENTION_MONTHS = 'abc';
            expect(getRetentionMonths()).toBe(24);
            process.env.ACCOUNT_RETENTION_MONTHS = '-12';
            expect(getRetentionMonths()).toBe(24);
            expect(warn).toHaveBeenCalled();
        });
    });

    describe('findDormantPlayers', () => {
        it('falls back through last_seen_at, updated_at and created_at', async () => {
            query.mockResolvedValue({ rows: [] });
            await findDormantPlayers(24);
            const sql = query.mock.calls[0][0];
            expect(sql).toContain('coalesce(last_seen_at, updated_at, created_at)');
            expect(query.mock.calls[0][1]).toEqual(['24']);
        });

        it('returns nothing when the database is off', async () => {
            isDatabaseEnabled.mockReturnValue(false);
            await expect(findDormantPlayers(24)).resolves.toEqual([]);
            expect(query).not.toHaveBeenCalled();
        });
    });

    describe('purgeDormantPlayers', () => {
        it('does nothing, and opens no transaction, when nobody is dormant', async () => {
            query.mockResolvedValue({ rows: [] });
            await expect(purgeDormantPlayers(24)).resolves.toEqual({ deleted: 0, names: [] });
            expect(query.mock.calls.map(c => c[0])).not.toContain('begin');
        });

        it('deletes name-keyed rows before the player row, in one transaction', async () => {
            query.mockImplementation((sql) => {
                if (sql.includes('select name')) {
                    return Promise.resolve({ rows: [{ name: 'Ghost', last_active: new Date(0) }] });
                }
                return Promise.resolve({ rows: [], rowCount: 1 });
            });
            vi.spyOn(console, 'log').mockImplementation(() => {});

            const res = await purgeDormantPlayers(24);
            expect(res).toEqual({ deleted: 1, names: ['Ghost'] });

            const sqls = query.mock.calls.map(c => c[0]);
            expect(sqls[1]).toBe('begin');
            expect(sqls[sqls.length - 1]).toBe('commit');

            // Everything keyed by player_id cascades; these four do not and
            // would be orphaned if they were not deleted explicitly.
            for (const table of ['tierlist_placements', 'food_ratings',
                                 'food_scrandle_streaks', 'food_classic_scores']) {
                expect(sqls.some(s => s.includes(`delete from ${table}`))).toBe(true);
            }

            const playerDelete = sqls.findIndex(s => s.includes('delete from players'));
            const lastNameKeyed = sqls.reduce(
                (acc, s, i) => (s.includes('food_classic_scores') ? i : acc), -1);
            expect(playerDelete).toBeGreaterThan(lastNameKeyed);
        });

        it('rolls back when a delete fails', async () => {
            query.mockImplementation((sql) => {
                if (sql.includes('select name')) {
                    return Promise.resolve({ rows: [{ name: 'Ghost', last_active: new Date(0) }] });
                }
                if (sql.includes('delete from food_ratings')) {
                    return Promise.reject(new Error('boom'));
                }
                return Promise.resolve({ rows: [], rowCount: 1 });
            });

            await expect(purgeDormantPlayers(24)).rejects.toThrow('boom');
            expect(query.mock.calls.map(c => c[0])).toContain('rollback');
        });

        it('is a no-op without a database', async () => {
            isDatabaseEnabled.mockReturnValue(false);
            await expect(purgeDormantPlayers(24)).resolves.toEqual({ deleted: 0, names: [] });
        });
    });

    describe('startRetentionJob', () => {
        it('runs at the default period when unconfigured', () => {
            const log = vi.spyOn(console, 'log').mockImplementation(() => {});
            startRetentionJob();
            const said = log.mock.calls.flat().join(' ');
            expect(said).toContain('enabled');
            expect(said).toContain('24 months');
        });

        it('stays off on an explicit zero, and says why', () => {
            const log = vi.spyOn(console, 'log').mockImplementation(() => {});
            process.env.ACCOUNT_RETENTION_MONTHS = '0';
            startRetentionJob();
            expect(log.mock.calls.flat().join(' ')).toContain('ACCOUNT_RETENTION_MONTHS=0');
        });

        it('stays off without a database even when configured', () => {
            const log = vi.spyOn(console, 'log').mockImplementation(() => {});
            isDatabaseEnabled.mockReturnValue(false);
            process.env.ACCOUNT_RETENTION_MONTHS = '24';
            startRetentionJob();
            expect(log.mock.calls.flat().join(' ')).toContain('disabled');
        });

        it('does not purge on boot', () => {
            vi.spyOn(console, 'log').mockImplementation(() => {});
            process.env.ACCOUNT_RETENTION_MONTHS = '24';
            startRetentionJob();
            // A crash-restart loop would otherwise re-run the purge every few
            // seconds; the first pass is one interval in.
            expect(query).not.toHaveBeenCalled();
        });
    });
});
