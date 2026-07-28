import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// The provider paces its outbound calls to stay inside CoinGecko's keyless
// rate limit. Real sleeps would make this suite take half a minute, so the
// spacing is switched off before the module reads it at import time.
process.env.COINGECKO_MIN_INTERVAL_MS = '0';

import {
    toCoinGeckoId,
    isCryptoSymbol,
    fetchQuotesViaCoinGecko,
    fetchSingleQuoteViaCoinGecko,
    fetchHistoryViaCoinGecko,
    COINGECKO_HISTORY_RANGES,
    COINGECKO_ATTRIBUTION,
} from '../stock-providers/coingecko.js';

function jsonResponse(body, status = 200) {
    return {
        ok: status >= 200 && status < 300,
        status,
        statusText: status === 200 ? 'OK' : 'Error',
        json: async () => body,
    };
}

describe('coingecko provider', () => {
    let fetchMock;

    beforeEach(() => {
        fetchMock = vi.fn();
        vi.stubGlobal('fetch', fetchMock);
    });

    afterEach(() => {
        vi.unstubAllGlobals();
        vi.restoreAllMocks();
    });

    describe('symbol mapping', () => {
        it('maps the ticker crypto symbols', () => {
            expect(toCoinGeckoId('BTC-USD')).toBe('bitcoin');
            expect(toCoinGeckoId('ETH-USD')).toBe('ethereum');
            expect(toCoinGeckoId('BNB-USD')).toBe('binancecoin');
            expect(toCoinGeckoId('XRP-USD')).toBe('ripple');
        });

        it('is case- and whitespace-insensitive', () => {
            expect(toCoinGeckoId('  btc-usd ')).toBe('bitcoin');
        });

        it('returns null for equities, indices and junk', () => {
            expect(toCoinGeckoId('AAPL')).toBeNull();
            expect(toCoinGeckoId('^GDAXI')).toBeNull();
            expect(toCoinGeckoId('GC=F')).toBeNull();
            expect(toCoinGeckoId('')).toBeNull();
            expect(toCoinGeckoId(null)).toBeNull();
            expect(toCoinGeckoId(42)).toBeNull();
        });

        it('isCryptoSymbol mirrors the mapping', () => {
            expect(isCryptoSymbol('DOGE-USD')).toBe(true);
            expect(isCryptoSymbol('TSLA')).toBe(false);
        });
    });

    describe('fetchQuotesViaCoinGecko', () => {
        it('returns quotes in the shared provider shape', async () => {
            fetchMock.mockResolvedValue(jsonResponse({
                bitcoin: { usd: 50000, usd_24h_change: 10 },
            }));

            const { quotes, errors } = await fetchQuotesViaCoinGecko(['BTC-USD']);

            expect(errors).toEqual([]);
            expect(quotes).toHaveLength(1);
            expect(quotes[0]).toMatchObject({
                symbol: 'BTC-USD',
                shortName: 'Bitcoin',
                price: 50000,
                pct: 10,
                currency: 'USD',
                marketState: 'REGULAR',
            });
        });

        it('derives the absolute change so it reconciles with the percentage', async () => {
            fetchMock.mockResolvedValue(jsonResponse({
                bitcoin: { usd: 110, usd_24h_change: 10 },
            }));

            const { quotes } = await fetchQuotesViaCoinGecko(['BTC-USD']);
            // 110 is +10% on 100, so the absolute move is 10, not 11.
            expect(quotes[0].change).toBeCloseTo(10, 6);
        });

        it('treats a missing 24h change as flat rather than NaN', async () => {
            fetchMock.mockResolvedValue(jsonResponse({ bitcoin: { usd: 100 } }));

            const { quotes } = await fetchQuotesViaCoinGecko(['BTC-USD']);
            expect(quotes[0].pct).toBe(0);
            expect(quotes[0].change).toBe(0);
        });

        it('does not divide by zero at -100%', async () => {
            fetchMock.mockResolvedValue(jsonResponse({
                bitcoin: { usd: 0.0001, usd_24h_change: -100 },
            }));

            const { quotes } = await fetchQuotesViaCoinGecko(['BTC-USD']);
            expect(Number.isFinite(quotes[0].change)).toBe(true);
            expect(quotes[0].change).toBe(0);
        });

        it('batches every mapped symbol into a single request', async () => {
            fetchMock.mockResolvedValue(jsonResponse({
                bitcoin: { usd: 1, usd_24h_change: 0 },
                ethereum: { usd: 2, usd_24h_change: 0 },
                solana: { usd: 3, usd_24h_change: 0 },
            }));

            const { quotes } = await fetchQuotesViaCoinGecko(['BTC-USD', 'ETH-USD', 'SOL-USD']);

            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(quotes).toHaveLength(3);
            const url = fetchMock.mock.calls[0][0];
            expect(url).toContain('bitcoin');
            expect(url).toContain('ethereum');
            expect(url).toContain('solana');
        });

        it('reports unmapped symbols as errors without failing the batch', async () => {
            fetchMock.mockResolvedValue(jsonResponse({
                bitcoin: { usd: 1, usd_24h_change: 0 },
            }));

            const { quotes, errors } = await fetchQuotesViaCoinGecko(['BTC-USD', 'AAPL']);

            expect(quotes).toHaveLength(1);
            expect(errors).toEqual([{ symbol: 'AAPL', message: 'no CoinGecko mapping' }]);
        });

        it('reports a symbol missing from the response body', async () => {
            fetchMock.mockResolvedValue(jsonResponse({
                bitcoin: { usd: 1, usd_24h_change: 0 },
            }));

            const { quotes, errors } = await fetchQuotesViaCoinGecko(['BTC-USD', 'ETH-USD']);

            expect(quotes).toHaveLength(1);
            expect(errors).toHaveLength(1);
            expect(errors[0].symbol).toBe('ETH-USD');
        });

        it('short-circuits when nothing maps, without calling the API', async () => {
            const { quotes, errors } = await fetchQuotesViaCoinGecko(['AAPL', 'MSFT']);

            expect(fetchMock).not.toHaveBeenCalled();
            expect(quotes).toEqual([]);
            expect(errors).toHaveLength(2);
        });

        it('handles an empty or non-array input', async () => {
            await expect(fetchQuotesViaCoinGecko([])).resolves.toEqual({ quotes: [], errors: [] });
            await expect(fetchQuotesViaCoinGecko(null)).resolves.toEqual({ quotes: [], errors: [] });
            expect(fetchMock).not.toHaveBeenCalled();
        });

        it('surfaces a non-retryable HTTP error per symbol', async () => {
            fetchMock.mockResolvedValue(jsonResponse({}, 404));

            const { quotes, errors } = await fetchQuotesViaCoinGecko(['BTC-USD']);

            expect(fetchMock).toHaveBeenCalledTimes(1);
            expect(quotes).toEqual([]);
            expect(errors[0].message).toContain('404');
        });

        it('retries a 429 and succeeds on the second attempt', async () => {
            fetchMock
                .mockResolvedValueOnce(jsonResponse({}, 429))
                .mockResolvedValueOnce(jsonResponse({ bitcoin: { usd: 7, usd_24h_change: 0 } }));

            const { quotes } = await fetchQuotesViaCoinGecko(['BTC-USD']);

            expect(fetchMock).toHaveBeenCalledTimes(2);
            expect(quotes[0].price).toBe(7);
        });

        it('turns a thrown fetch into per-symbol errors', async () => {
            fetchMock.mockRejectedValue(new Error('socket hang up'));

            const { quotes, errors } = await fetchQuotesViaCoinGecko(['BTC-USD']);

            expect(quotes).toEqual([]);
            expect(errors[0].message).toContain('socket hang up');
        });

        it('sends the demo API key header only when configured', async () => {
            fetchMock.mockResolvedValue(jsonResponse({ bitcoin: { usd: 1, usd_24h_change: 0 } }));

            await fetchQuotesViaCoinGecko(['BTC-USD']);
            expect(fetchMock.mock.calls[0][1].headers['x-cg-demo-api-key']).toBeUndefined();

            process.env.COINGECKO_API_KEY = 'test-key';
            try {
                await fetchQuotesViaCoinGecko(['BTC-USD']);
                expect(fetchMock.mock.calls[1][1].headers['x-cg-demo-api-key']).toBe('test-key');
            } finally {
                delete process.env.COINGECKO_API_KEY;
            }
        });
    });

    describe('fetchSingleQuoteViaCoinGecko', () => {
        it('returns the single quote', async () => {
            fetchMock.mockResolvedValue(jsonResponse({ ethereum: { usd: 3000, usd_24h_change: -5 } }));

            const q = await fetchSingleQuoteViaCoinGecko('ETH-USD');
            expect(q.symbol).toBe('ETH-USD');
            expect(q.price).toBe(3000);
        });

        it('throws with the provider message when there is no quote', async () => {
            fetchMock.mockResolvedValue(jsonResponse({}, 404));
            await expect(fetchSingleQuoteViaCoinGecko('ETH-USD')).rejects.toThrow(/404/);
        });

        it('throws for an unmapped symbol without calling the API', async () => {
            await expect(fetchSingleQuoteViaCoinGecko('AAPL')).rejects.toThrow(/no CoinGecko mapping/);
            expect(fetchMock).not.toHaveBeenCalled();
        });
    });

    describe('fetchHistoryViaCoinGecko', () => {
        // Two days of hourly points, so day-bucketing has something to collapse.
        const DAY = 24 * 60 * 60 * 1000;
        const hourly = (days) => {
            const start = Date.UTC(2026, 0, 1);
            const out = [];
            for (let i = 0; i < days * 24; i++) out.push([start + i * 3600_000, 100 + i]);
            return out;
        };

        it('rejects an unmapped symbol', async () => {
            await expect(fetchHistoryViaCoinGecko('AAPL', '1mo')).rejects.toThrow(/no CoinGecko mapping/);
        });

        it('rejects 5y because the free plan stops at 365 days', async () => {
            await expect(fetchHistoryViaCoinGecko('BTC-USD', '5y')).rejects.toThrow(/unsupported range/);
            expect(COINGECKO_HISTORY_RANGES).not.toContain('5y');
            expect(COINGECKO_HISTORY_RANGES).toEqual(['1d', '5d', '1mo', '3mo', '1y']);
        });

        it('keeps intraday points untouched for 1d', async () => {
            const prices = [[1000, 10], [2000, 11], [3000, 12]];
            fetchMock.mockResolvedValue(jsonResponse({ prices }));

            const h = await fetchHistoryViaCoinGecko('BTC-USD', '1d');
            expect(h.points).toHaveLength(3);
            expect(h.interval).toBe('5m');
            expect(h.currency).toBe('USD');
            expect(h.symbol).toBe('BTC-USD');
        });

        it('buckets hourly points down to daily closes for 1mo', async () => {
            fetchMock.mockResolvedValue(jsonResponse({ prices: hourly(3) }));

            const h = await fetchHistoryViaCoinGecko('BTC-USD', '1mo');

            expect(h.interval).toBe('1d');
            expect(h.points).toHaveLength(3);
            // Each retained point must be the last one inside its day.
            for (let i = 0; i < h.points.length - 1; i++) {
                expect(Math.floor(h.points[i].t / DAY)).not.toBe(Math.floor(h.points[i + 1].t / DAY));
            }
        });

        it('always ends on the most recent point', async () => {
            const prices = hourly(3);
            fetchMock.mockResolvedValue(jsonResponse({ prices }));

            const h = await fetchHistoryViaCoinGecko('BTC-USD', '1mo');
            expect(h.points[h.points.length - 1].t).toBe(prices[prices.length - 1][0]);
        });

        it('reports meta from the bucketed series', async () => {
            fetchMock.mockResolvedValue(jsonResponse({ prices: [[1000, 10], [2000, 30], [3000, 20]] }));

            const h = await fetchHistoryViaCoinGecko('BTC-USD', '1d');
            expect(h.meta.price).toBe(20);
            expect(h.meta.previousClose).toBe(30);
            expect(h.meta.shortName).toBe('Bitcoin');
            expect(h.meta.exchangeName).toBe('CoinGecko');
            // 52-week extremes are only meaningful on the 1y range.
            expect(h.meta.fiftyTwoWeekHigh).toBeNull();
        });

        it('fills 52-week extremes on the 1y range', async () => {
            fetchMock.mockResolvedValue(jsonResponse({ prices: hourly(20) }));

            const h = await fetchHistoryViaCoinGecko('BTC-USD', '1y');
            expect(h.interval).toBe('1wk');
            expect(h.meta.fiftyTwoWeekHigh).toBeGreaterThan(h.meta.fiftyTwoWeekLow);
        });

        it('skips malformed entries and throws when nothing usable remains', async () => {
            fetchMock.mockResolvedValue(jsonResponse({
                prices: [null, [1000], ['x', 'y'], [2000, Number.NaN]],
            }));

            await expect(fetchHistoryViaCoinGecko('BTC-USD', '1d')).rejects.toThrow(/no data points/);
        });

        it('throws on a non-retryable HTTP error', async () => {
            fetchMock.mockResolvedValue(jsonResponse({}, 404));
            await expect(fetchHistoryViaCoinGecko('BTC-USD', '1d')).rejects.toThrow(/404/);
        });
    });

    it('exports the attribution string the UI is required to show', () => {
        expect(COINGECKO_ATTRIBUTION).toBe('Powered by CoinGecko');
    });
});
