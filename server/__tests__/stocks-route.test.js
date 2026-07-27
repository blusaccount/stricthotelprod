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

    it('stamps fresh quotes with asOf = fetch time', async () => {
        const mockQuote = vi.fn().mockResolvedValueOnce([makeQuote('AAPL', 150)]);
        const router = makeRouter(mockQuote);

        const before = Date.now();
        const result = await router.fetchTickerQuotes();
        expect(result[0].asOf).toBe(before); // fake timers: no time passes
    });

    it('keeps the old asOf on carried-over quotes so staleness stays visible', async () => {
        const mockQuote = vi.fn()
            .mockResolvedValueOnce([makeQuote('AAPL', 150), makeQuote('MSFT', 400)])
            .mockResolvedValueOnce([makeQuote('AAPL', 155)]); // MSFT missing
        const router = makeRouter(mockQuote);

        const t0 = Date.now();
        await router.fetchTickerQuotes();
        vi.advanceTimersByTime(6 * 60 * 1000);

        const second = await router.fetchTickerQuotes();
        expect(second.find(r => r.symbol === 'AAPL').asOf).toBe(t0 + 6 * 60 * 1000);
        expect(second.find(r => r.symbol === 'MSFT').asOf).toBe(t0);
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

    it('rate-limits /api/stock-history after exceeding the per-route budget', async () => {
        const router = makeDiagRouter();
        let last;
        for (let i = 0; i < 31; i++) {
            last = await dispatch(router, '/api/stock-history', '2.2.2.2', { symbol: 'AAPL' });
        }
        expect(last.statusCode).toBe(429);
    });
});

describe('/api/stock-history validation', () => {
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

    function makeHistoryRouter({ enabled = true } = {}) {
        return createStocksRouter({
            getYahooFinance: async () => ({ quote: vi.fn().mockRejectedValue(new Error('down')) }),
            isStockGameEnabled: enabled,
        });
    }

    it('rejects an empty or invalid symbol with 400', async () => {
        const router = makeHistoryRouter();
        const res = await dispatch(router, '/api/stock-history', '3.3.3.3', { symbol: '!!!' });
        expect(res.statusCode).toBe(400);
    });

    it('rejects overlong symbols with 400', async () => {
        const router = makeHistoryRouter();
        const res = await dispatch(router, '/api/stock-history', '3.3.3.4', { symbol: 'A'.repeat(13) });
        expect(res.statusCode).toBe(400);
    });

    it('returns 502 when the provider is unreachable', async () => {
        const router = makeHistoryRouter();
        const res = await dispatch(router, '/api/stock-history', '3.3.3.5', { symbol: 'AAPL', range: '1mo' });
        expect(res.statusCode).toBe(502);
    });

    it('returns 503 when the stock game is disabled', async () => {
        const router = makeHistoryRouter({ enabled: false });
        const res = await dispatch(router, '/api/stock-history', '3.3.3.6', { symbol: 'AAPL' });
        expect(res.statusCode).toBe(503);
        expect(res.body.code).toBe('GAME_DISABLED');
    });

    it('profile: rejects an invalid symbol with 400', async () => {
        const router = makeHistoryRouter();
        const res = await dispatch(router, '/api/stock-profile', '4.4.4.1', { symbol: '!!!' });
        expect(res.statusCode).toBe(400);
    });

    it('profile: returns summary null when the provider has no assetProfile', async () => {
        const router = makeHistoryRouter(); // mock yf has no quoteSummary -> throws
        const res = await dispatch(router, '/api/stock-profile', '4.4.4.2', { symbol: 'GC=F' });
        expect(res.statusCode).toBe(200);
        expect(res.body.summary).toBeNull();
    });

    it('profile: truncates the business summary to two sentences and caches it', async () => {
        const longSummary = 'Acme builds rockets. It also sells anvils worldwide. '
            + 'Founded in 1949, the company employs 12,000 people. More filler text here.';
        const quoteSummary = vi.fn().mockResolvedValue({
            assetProfile: { longBusinessSummary: longSummary, sector: 'Industrials', industry: 'Aerospace' },
        });
        const router = createStocksRouter({
            getYahooFinance: async () => ({ quote: vi.fn(), quoteSummary }),
            isStockGameEnabled: true,
        });

        const res = await dispatch(router, '/api/stock-profile', '4.4.4.3', { symbol: 'ACME' });
        expect(res.statusCode).toBe(200);
        expect(res.body.summary).toBe('Acme builds rockets. It also sells anvils worldwide.');
        expect(res.body.sector).toBe('Industrials');

        const second = await dispatch(router, '/api/stock-profile', '4.4.4.4', { symbol: 'ACME' });
        expect(second.body.summary).toBe('Acme builds rockets. It also sells anvils worldwide.');
        expect(quoteSummary).toHaveBeenCalledTimes(1);
    });

    it('serves cached history without a provider call', async () => {
        const router = makeHistoryRouter();
        const payload = {
            chart: {
                result: [{
                    meta: { symbol: 'AAPL', currency: 'USD', regularMarketPrice: 150, chartPreviousClose: 148 },
                    timestamp: [1700000000, 1700086400],
                    indicators: { quote: [{ close: [149.5, 150.25] }] },
                }],
            },
        };
        global.fetch.mockResolvedValue({ ok: true, json: async () => payload });

        const first = await dispatch(router, '/api/stock-history', '3.3.3.7', { symbol: 'AAPL', range: '1mo' });
        expect(first.statusCode).toBe(200);
        expect(first.body.points).toHaveLength(2);
        expect(first.body.points[1].c).toBe(150.25);

        const callsAfterFirst = global.fetch.mock.calls.length;
        const second = await dispatch(router, '/api/stock-history', '3.3.3.8', { symbol: 'AAPL', range: '1mo' });
        expect(second.statusCode).toBe(200);
        expect(global.fetch.mock.calls.length).toBe(callsAfterFirst);
    });
});
