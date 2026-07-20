import { describe, it, expect, beforeEach, vi } from 'vitest';

let buyStock, sellStock, getPortfolioSnapshot, getLeaderboardSnapshot, getTradePerformanceLeaderboard;

beforeEach(async () => {
    vi.resetModules();
    // Mock db.js to disable database mode
    vi.doMock('../db.js', () => ({
        isDatabaseEnabled: () => false,
        query: vi.fn(),
        withTransaction: vi.fn(),
    }));
    // Mock currency.js for in-memory balances
    vi.doMock('../currency.js', () => {
        const balances = new Map();
        return {
            getBalance: async (name) => balances.get(name) ?? 1000,
            addBalance: async (name, amount) => {
                const current = balances.get(name) ?? 1000;
                const newBal = current + amount;
                balances.set(name, newBal);
                return newBal;
            },
            deductBalance: async (name, amount) => {
                const current = balances.get(name) ?? 1000;
                if (amount > current) return null;
                const newBal = current - amount;
                balances.set(name, newBal);
                return newBal;
            },
            getAllPlayerNamesMemory: () => Array.from(balances.keys()),
        };
    });

    const mod = await import('../stock-game.js');
    buyStock = mod.buyStock;
    sellStock = mod.sellStock;
    getPortfolioSnapshot = mod.getPortfolioSnapshot;
    getLeaderboardSnapshot = mod.getLeaderboardSnapshot;
    getTradePerformanceLeaderboard = mod.getTradePerformanceLeaderboard;
});

describe('stock-game portfolio snapshot', () => {
    it('uses ticker price when available', async () => {
        await buyStock('alice', 'AAPL', 150, 100);
        const quotes = [{ symbol: 'AAPL', name: 'Apple', price: 160 }];
        const snap = await getPortfolioSnapshot('alice', quotes);

        expect(snap.holdings).toHaveLength(1);
        expect(snap.holdings[0].currentPrice).toBe(160);
        expect(snap.holdings[0].marketValue).toBeGreaterThan(100);
    });

    it('falls back to avgCost when no price and no fetcher', async () => {
        await buyStock('alice', 'SHOP', 120, 100);
        // No SHOP in ticker quotes, no fetcher
        const quotes = [{ symbol: 'AAPL', name: 'Apple', price: 160 }];
        const snap = await getPortfolioSnapshot('alice', quotes);

        expect(snap.holdings).toHaveLength(1);
        expect(snap.holdings[0].currentPrice).toBe(120);
        expect(snap.holdings[0].marketValue).toBe(100);
        // Flag the fallback so the UI can render "—" instead of a misleading +0.00 G/L
        expect(snap.holdings[0].priceStale).toBe(true);
    });

    it('does not flag priceStale when a live quote is available', async () => {
        await buyStock('alice', 'AAPL', 150, 100);
        const quotes = [{ symbol: 'AAPL', name: 'Apple', price: 160 }];
        const snap = await getPortfolioSnapshot('alice', quotes);

        expect(snap.holdings[0].priceStale).toBe(false);
    });

    it('uses fetchMissingPrice callback for non-ticker stocks', async () => {
        await buyStock('alice', 'SHOP', 120, 100);
        const quotes = [{ symbol: 'AAPL', name: 'Apple', price: 160 }];
        const fetchMissingPrice = vi.fn().mockResolvedValue({
            symbol: 'SHOP', name: 'Shopify', price: 140,
        });

        const snap = await getPortfolioSnapshot('alice', quotes, fetchMissingPrice);

        expect(fetchMissingPrice).toHaveBeenCalledWith('SHOP');
        expect(snap.holdings[0].currentPrice).toBe(140);
        expect(snap.holdings[0].name).toBe('Shopify');
        // ~0.8333 shares at 120, now worth 140 each
        expect(snap.holdings[0].marketValue).toBeGreaterThan(100);
    });

    it('does not call fetchMissingPrice for ticker stocks', async () => {
        await buyStock('alice', 'AAPL', 150, 100);
        const quotes = [{ symbol: 'AAPL', name: 'Apple', price: 160 }];
        const fetchMissingPrice = vi.fn();

        await getPortfolioSnapshot('alice', quotes, fetchMissingPrice);

        expect(fetchMissingPrice).not.toHaveBeenCalled();
    });

    it('caches fetched price in priceMap for duplicate symbols', async () => {
        // Two players hold the same non-ticker stock
        await buyStock('alice', 'SHOP', 120, 100);
        await buyStock('bob', 'SHOP', 125, 50);

        const quotes = [];
        const fetchMissingPrice = vi.fn().mockResolvedValue({
            symbol: 'SHOP', name: 'Shopify', price: 140,
        });

        const leaderboard = await getLeaderboardSnapshot(quotes, fetchMissingPrice);

        // fetchMissingPrice should only be called once since the price is cached in priceMap
        expect(fetchMissingPrice).toHaveBeenCalledTimes(1);
        expect(leaderboard.length).toBeGreaterThanOrEqual(2);
    });
});

describe('stock-game leaderboard', () => {
    it('uses fetchMissingPrice for non-ticker holdings', async () => {
        await buyStock('alice', 'SHOP', 120, 100);
        const quotes = [];
        const fetchMissingPrice = vi.fn().mockResolvedValue({
            symbol: 'SHOP', name: 'Shopify', price: 140,
        });

        const leaderboard = await getLeaderboardSnapshot(quotes, fetchMissingPrice);
        const alice = leaderboard.find(p => p.name === 'alice');

        expect(alice).toBeDefined();
        expect(alice.holdings[0].currentPrice).toBe(140);
        expect(fetchMissingPrice).toHaveBeenCalledWith('SHOP');
    });

    it('passes fetchMissingPrice through to performance leaderboard', async () => {
        await buyStock('alice', 'SHOP', 120, 100);
        const quotes = [];
        const fetchMissingPrice = vi.fn().mockResolvedValue({
            symbol: 'SHOP', name: 'Shopify', price: 140,
        });

        const performance = await getTradePerformanceLeaderboard(quotes, fetchMissingPrice);

        expect(fetchMissingPrice).toHaveBeenCalledWith('SHOP');
        const alice = performance.find(p => p.name === 'alice');
        expect(alice).toBeDefined();
        expect(alice.performancePct).toBeGreaterThan(0);
    });
});

describe('stock-game in-memory trade serialization (lost-update regression, issue #160)', () => {
    it('serializes two concurrent buys of the same player/symbol — no lost share/avgCost update', async () => {
        // Two "tabs" both buying 100 SC of AAPL at 150 at (roughly) the same
        // time. Without per-player serialization, both reads of the
        // existing position would see "no position yet" and the second
        // write would clobber the first's shares instead of adding to them.
        const [r1, r2] = await Promise.all([
            buyStock('alice2', 'AAPL', 150, 100),
            buyStock('alice2', 'AAPL', 150, 100),
        ]);

        expect(r1.ok).toBe(true);
        expect(r2.ok).toBe(true);

        const quotes = [{ symbol: 'AAPL', name: 'Apple', price: 150 }];
        const snap = await getPortfolioSnapshot('alice2', quotes);

        expect(snap.holdings).toHaveLength(1);
        // 200 SC spent at 150/share = 200/150 shares total, not 100/150.
        expect(snap.holdings[0].shares).toBeCloseTo(200 / 150, 6);
        expect(snap.holdings[0].marketValue).toBeCloseTo(200, 2);
    });

    it('serializes two concurrent sells of the same player/symbol — final balance and shares are correct', async () => {
        await buyStock('bob', 'AAPL', 100, 200); // 2 shares @ 100

        const [r1, r2] = await Promise.all([
            sellStock('bob', 'AAPL', 100, 100), // sell 1 share
            sellStock('bob', 'AAPL', 100, 100), // sell 1 share
        ]);

        expect(r1.ok).toBe(true);
        expect(r2.ok).toBe(true);

        const quotes = [{ symbol: 'AAPL', name: 'Apple', price: 100 }];
        const snap = await getPortfolioSnapshot('bob', quotes);

        // Both 1-share sells should have gone through and fully liquidated
        // the 2-share position — a lost update would leave a stray holding.
        expect(snap.holdings).toHaveLength(0);
        expect(snap.totalValue).toBe(0);

        // Selling more than what remains (with the position already gone)
        // must fail cleanly rather than going negative.
        const overSell = await sellStock('bob', 'AAPL', 100, 100);
        expect(overSell.ok).toBe(false);
        expect(overSell.code).toBe('NO_SHARES');
    });

    it('a burst of concurrent buys for the same player accumulates shares without loss', async () => {
        const results = await Promise.all(
            Array.from({ length: 10 }, () => buyStock('carol', 'AAPL', 100, 100))
        );
        expect(results.every(r => r.ok)).toBe(true);

        const quotes = [{ symbol: 'AAPL', name: 'Apple', price: 100 }];
        const snap = await getPortfolioSnapshot('carol', quotes);

        expect(snap.holdings).toHaveLength(1);
        // 10 * 100 SC at price 100 = 10 shares total.
        expect(snap.holdings[0].shares).toBeCloseTo(10, 6);
    });
});
