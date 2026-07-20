import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

let createStocksRouter;

beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    // Force-disable the v8 chart endpoint so these tests exercise the
    // yf.quote fallback path the suite was originally written against.
    // Chart-endpoint behavior is covered by yahoo-chart.test.js.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('v8 chart disabled in this test')));
    const mod = await import('../routes/stocks.js');
    createStocksRouter = mod.createStocksRouter;
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

function makeRouter(mockQuote) {
    const mockYf = { quote: mockQuote };
    return createStocksRouter({
        getYahooFinance: async () => mockYf,
        isStockGameEnabled: true,
    });
}

function makeQuote(symbol, price, marketState) {
    return {
        symbol,
        regularMarketPrice: price,
        regularMarketChange: 0,
        regularMarketChangePercent: 0,
        currency: 'USD',
        shortName: symbol,
        ...(marketState !== undefined && { marketState }),
    };
}

describe('fetchTickerQuotes merge behavior', () => {
    it('returns fresh batch results', async () => {
        const mockQuote = vi.fn().mockResolvedValueOnce([
            makeQuote('AAPL', 150),
            makeQuote('MSFT', 400),
        ]);
        const router = makeRouter(mockQuote);

        const result = await router.fetchTickerQuotes();
        expect(result).toHaveLength(2);
        expect(result.find(r => r.symbol === 'AAPL').price).toBe(150);
        expect(result.find(r => r.symbol === 'MSFT').price).toBe(400);
    });

    it('preserves previously-cached symbols missing from a partial batch', async () => {
        const mockQuote = vi.fn()
            .mockResolvedValueOnce([makeQuote('AAPL', 150), makeQuote('MSFT', 400)])
            .mockResolvedValueOnce([makeQuote('AAPL', 155)]); // MSFT missing
        const router = makeRouter(mockQuote);

        const first = await router.fetchTickerQuotes();
        expect(first).toHaveLength(2);

        // Expire the 5-min cache
        vi.advanceTimersByTime(6 * 60 * 1000);

        const second = await router.fetchTickerQuotes();

        // AAPL updated, MSFT preserved from previous cache
        expect(second).toHaveLength(2);
        expect(second.find(r => r.symbol === 'AAPL').price).toBe(155);
        expect(second.find(r => r.symbol === 'MSFT').price).toBe(400);
    });

    it('updates symbols that appear in the new batch', async () => {
        const mockQuote = vi.fn()
            .mockResolvedValueOnce([makeQuote('AAPL', 150)])
            .mockResolvedValueOnce([makeQuote('AAPL', 160)]);
        const router = makeRouter(mockQuote);

        await router.fetchTickerQuotes();
        vi.advanceTimersByTime(6 * 60 * 1000);

        const result = await router.fetchTickerQuotes();
        expect(result).toHaveLength(1);
        expect(result[0].price).toBe(160);
    });

    it('returns stale cache on API error', async () => {
        const mockQuote = vi.fn()
            .mockResolvedValueOnce([makeQuote('AAPL', 150)])
            .mockRejectedValueOnce(new Error('API down'));
        const router = makeRouter(mockQuote);

        await router.fetchTickerQuotes();
        vi.advanceTimersByTime(6 * 60 * 1000);

        const result = await router.fetchTickerQuotes();
        expect(result).toHaveLength(1);
        expect(result[0].symbol).toBe('AAPL');
    });

    it('falls back to stale cache when Yahoo returns empty (no exception)', async () => {
        // Bug regression: previously a successful-but-empty Yahoo response
        // wiped the served cache to [], making every portfolio's G/L flatline.
        const mockQuote = vi.fn()
            .mockResolvedValueOnce([makeQuote('AAPL', 150)])
            .mockResolvedValueOnce([]); // Yahoo "succeeded" but returned nothing
        const router = makeRouter(mockQuote);

        await router.fetchTickerQuotes();
        vi.advanceTimersByTime(6 * 60 * 1000);

        const result = await router.fetchTickerQuotes();
        expect(result).toHaveLength(1);
        expect(result[0].symbol).toBe('AAPL');
        expect(result[0].price).toBe(150);
    });

    it('falls back to stale cache when every quote in the batch has null price', async () => {
        const mockQuote = vi.fn()
            .mockResolvedValueOnce([makeQuote('AAPL', 150)])
            .mockResolvedValueOnce([
                { symbol: 'AAPL', regularMarketPrice: null, shortName: 'Apple' },
                { symbol: 'MSFT', regularMarketPrice: null, shortName: 'Microsoft' },
            ]);
        const router = makeRouter(mockQuote);

        await router.fetchTickerQuotes();
        vi.advanceTimersByTime(6 * 60 * 1000);

        const result = await router.fetchTickerQuotes();
        expect(result).toHaveLength(1);
        expect(result[0].symbol).toBe('AAPL');
        expect(result[0].price).toBe(150);
    });

    it('skips symbols with null regularMarketPrice', async () => {
        const mockQuote = vi.fn().mockResolvedValueOnce([
            makeQuote('AAPL', 150),
            { symbol: 'MSFT', regularMarketPrice: null, shortName: 'Microsoft' },
        ]);
        const router = makeRouter(mockQuote);

        const result = await router.fetchTickerQuotes();
        expect(result).toHaveLength(1);
        expect(result[0].symbol).toBe('AAPL');
    });

    it('includes marketState from Yahoo Finance quotes', async () => {
        const mockQuote = vi.fn().mockResolvedValueOnce([
            makeQuote('AAPL', 150, 'CLOSED'),
            makeQuote('BTC-USD', 97000, 'REGULAR'),
        ]);
        const router = makeRouter(mockQuote);

        const result = await router.fetchTickerQuotes();
        expect(result.find(r => r.symbol === 'AAPL').marketState).toBe('CLOSED');
        expect(result.find(r => r.symbol === 'BTC-USD').marketState).toBe('REGULAR');
    });

    it('sets marketState to null when not provided by API', async () => {
        const mockQuote = vi.fn().mockResolvedValueOnce([
            makeQuote('AAPL', 150),
        ]);
        const router = makeRouter(mockQuote);

        const result = await router.fetchTickerQuotes();
        expect(result[0].marketState).toBeNull();
    });
});

describe('stock route rate limiting', () => {
    function makeReq(path, ip, query = {}) {
        return { method: 'GET', url: path, originalUrl: path, ip, headers: {}, query };
    }

    function makeRes(onDone) {
        const res = {
            statusCode: 200,
            headers: {},
            body: undefined,
            set(name, val) { this.headers[name] = val; return this; },
            status(code) { this.statusCode = code; return this; },
            json(payload) { this.body = payload; onDone(); return this; },
        };
        return res;
    }

    async function dispatch(router, path, ip, query) {
        return new Promise((resolve) => {
            const res = makeRes(() => resolve(res));
            router(makeReq(path, ip, query), res, () => resolve(res));
        });
    }

    function makeDiagRouter() {
        return createStocksRouter({
            getYahooFinance: async () => ({ quote: vi.fn().mockRejectedValue(new Error('down')) }),
            isStockGameEnabled: true,
        });
    }

    it('blocks a single IP with 429 after exceeding the per-route budget on /api/stock-search', async () => {
        const router = makeDiagRouter();
        let last;
        for (let i = 0; i < 31; i++) {
            last = await dispatch(router, '/api/stock-search', '1.2.3.4', { q: 'AAPL' });
        }
        expect(last.statusCode).toBe(429);
        expect(last.headers['Retry-After']).toBeGreaterThan(0);
    });

    it('does not rate-limit a different IP once one IP is exhausted', async () => {
        const router = makeDiagRouter();
        for (let i = 0; i < 31; i++) {
            await dispatch(router, '/api/stock-search', '1.2.3.4', { q: 'AAPL' });
        }
        const otherIp = await dispatch(router, '/api/stock-search', '9.9.9.9', { q: 'AAPL' });
        expect(otherIp.statusCode).not.toBe(429);
    });

    it('applies a tighter budget to /api/_stock-diag than to search/quote', async () => {
        const router = makeDiagRouter();
        let last;
        for (let i = 0; i < 6; i++) {
            last = await dispatch(router, '/api/_stock-diag', '5.5.5.5');
        }
        expect(last.statusCode).toBe(429);
    });
});
