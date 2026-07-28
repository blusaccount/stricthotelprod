import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../db.js', () => ({
    isDatabaseEnabled: vi.fn(() => true),
    query: vi.fn(),
}));

import { isDatabaseEnabled, query } from '../db.js';
import {
    exportPlayerData,
    deletePlayerData,
    deletePlayersData,
    NAME_KEYED_TABLES,
    ANONYMISED_TABLES,
    AUTHORED_DELETE_TABLES,
    ANONYMOUS_AUTHOR,
} from '../account-data.js';

const sqlsFrom = (mock) => mock.mock.calls.map(c => c[0]);

describe('account data', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        isDatabaseEnabled.mockReturnValue(true);
    });

    describe('table map', () => {
        it('covers every table that does not cascade from players.id', () => {
            // If a new table keys by player_name or author_name and is not
            // listed here, deleting a player silently leaves their data behind
            // — which is exactly the bug this module was extracted to fix.
            expect(NAME_KEYED_TABLES).toEqual([
                'tierlist_placements',
                'food_ratings',
                'food_scrandle_streaks',
                'food_classic_scores',
            ]);
            expect(AUTHORED_DELETE_TABLES).toEqual([
                { table: 'picto_messages', column: 'author_name' },
            ]);
            expect(ANONYMISED_TABLES).toEqual([
                { table: 'picto_strokes', column: 'author_name' },
            ]);
        });

        it('uses a marker no player could ever register', () => {
            // sanitizeName strips angle brackets, so this cannot collide.
            expect(ANONYMOUS_AUTHOR).toBe('<deleted>');
            expect(ANONYMOUS_AUTHOR).toMatch(/[<>]/);
        });
    });

    describe('exportPlayerData', () => {
        it('returns null for an unknown player', async () => {
            query.mockResolvedValue({ rows: [] });
            await expect(exportPlayerData('Nobody')).resolves.toBeNull();
        });

        it('returns null without a database', async () => {
            isDatabaseEnabled.mockReturnValue(false);
            await expect(exportPlayerData('Someone')).resolves.toBeNull();
            expect(query).not.toHaveBeenCalled();
        });

        it('collects every category, keyed by id and by name', async () => {
            query.mockImplementation((sql) => {
                if (sql.startsWith('select id from players')) {
                    return Promise.resolve({ rows: [{ id: 7 }] });
                }
                if (sql.includes('from players where id')) {
                    return Promise.resolve({ rows: [{ name: 'Someone', balance: '10.00' }] });
                }
                return Promise.resolve({ rows: [{ dummy: true }] });
            });

            const data = await exportPlayerData('Someone');

            expect(data.player).toEqual({ name: 'Someone', balance: '10.00' });
            for (const key of ['stock_positions', 'wallet_ledger', 'achievements',
                               'tierlist_placements', 'picto_messages', 'picto_strokes']) {
                expect(Array.isArray(data[key])).toBe(true);
            }
            expect(data.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

            // Name-keyed lookups have to be passed the name, not the id.
            const nameCalls = query.mock.calls.filter(c => c[0].includes('player_name = $1'));
            expect(nameCalls.length).toBeGreaterThan(0);
            for (const call of nameCalls) expect(call[1]).toEqual(['Someone']);
        });
    });

    describe('deletePlayerData', () => {
        beforeEach(() => {
            query.mockResolvedValue({ rows: [], rowCount: 1 });
        });

        it('wraps everything in one transaction', async () => {
            const sqls = await deletePlayerData('Someone').then(() => sqlsFrom(query));
            expect(sqls[0]).toBe('begin');
            expect(sqls[sqls.length - 1]).toBe('commit');
        });

        it('deletes the player row last, after every dependent table', async () => {
            await deletePlayerData('Someone');
            const sqls = sqlsFrom(query);
            const playerIdx = sqls.findIndex(s => s.startsWith('delete from players'));

            for (const table of NAME_KEYED_TABLES) {
                const idx = sqls.findIndex(s => s.includes(`delete from ${table}`));
                expect(idx).toBeGreaterThan(-1);
                expect(idx).toBeLessThan(playerIdx);
            }
            for (const { table } of AUTHORED_DELETE_TABLES) {
                const idx = sqls.findIndex(s => s.includes(`delete from ${table}`));
                expect(idx).toBeGreaterThan(-1);
                expect(idx).toBeLessThan(playerIdx);
            }
        });

        it('anonymises shared strokes instead of deleting them', async () => {
            // A stroke is a mark somebody else's drawing may be built on. The
            // name is the personal datum; the pixels are not.
            await deletePlayerData('Someone');
            const call = query.mock.calls.find(c => c[0].includes('update picto_strokes'));
            expect(call).toBeDefined();
            expect(call[0]).toContain('set author_name = $2');
            expect(call[1]).toEqual(['Someone', ANONYMOUS_AUTHOR]);
            expect(sqlsFrom(query).some(s => s.includes('delete from picto_strokes'))).toBe(false);
        });

        it('deletes chat messages outright', async () => {
            // A message is the person speaking, not a shared artefact.
            await deletePlayerData('Someone');
            expect(sqlsFrom(query).some(s => s.includes('delete from picto_messages'))).toBe(true);
        });

        it('reports how many strokes were anonymised', async () => {
            query.mockImplementation((sql) => {
                if (sql.includes('update picto_strokes')) return Promise.resolve({ rowCount: 4 });
                return Promise.resolve({ rows: [], rowCount: 1 });
            });
            await expect(deletePlayerData('Someone'))
                .resolves.toEqual({ deleted: true, anonymisedStrokes: 4 });
        });

        it('reports deleted:false when the player did not exist', async () => {
            query.mockImplementation((sql) => {
                if (sql.startsWith('delete from players')) return Promise.resolve({ rowCount: 0 });
                return Promise.resolve({ rows: [], rowCount: 0 });
            });
            await expect(deletePlayerData('Ghost'))
                .resolves.toMatchObject({ deleted: false });
        });

        it('rolls back when any step fails', async () => {
            query.mockImplementation((sql) => {
                if (sql.includes('delete from food_ratings')) return Promise.reject(new Error('boom'));
                return Promise.resolve({ rows: [], rowCount: 1 });
            });
            await expect(deletePlayerData('Someone')).rejects.toThrow('boom');
            expect(sqlsFrom(query)).toContain('rollback');
        });

        it('is a no-op without a database', async () => {
            isDatabaseEnabled.mockReturnValue(false);
            await expect(deletePlayerData('Someone'))
                .resolves.toEqual({ deleted: false, anonymisedStrokes: 0 });
            expect(query).not.toHaveBeenCalled();
        });
    });

    describe('deletePlayersData', () => {
        it('does nothing for an empty list', async () => {
            await expect(deletePlayersData([])).resolves.toEqual({ deleted: 0, anonymisedStrokes: 0 });
            expect(query).not.toHaveBeenCalled();
        });

        it('handles the batch in one transaction, players last', async () => {
            query.mockResolvedValue({ rows: [], rowCount: 2 });
            await deletePlayersData(['A', 'B']);

            const sqls = sqlsFrom(query);
            expect(sqls[0]).toBe('begin');
            expect(sqls[sqls.length - 1]).toBe('commit');

            const playerIdx = sqls.findIndex(s => s.startsWith('delete from players'));
            expect(sqls.findIndex(s => s.includes('picto_messages'))).toBeLessThan(playerIdx);
            expect(sqls.findIndex(s => s.includes('update picto_strokes'))).toBeLessThan(playerIdx);

            for (const call of query.mock.calls) {
                if (Array.isArray(call[1]) && Array.isArray(call[1][0])) {
                    expect(call[1][0]).toEqual(['A', 'B']);
                }
            }
        });
    });
});
