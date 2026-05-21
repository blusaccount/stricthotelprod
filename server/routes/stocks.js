import { Router } from 'express';
import { upsertQuotes, getAllCached } from '../stock-price-cache.js';
import { fetchQuotesViaChart, fetchSingleQuoteViaChart } from '../stock-providers/yahoo-chart.js';

const TICKER_SYMBOLS = [
    // ETFs / Indices
    { symbol: 'URTH', name: 'MSCI World' },
    { symbol: 'QQQ', name: 'Nasdaq 100' },
    { symbol: '^GDAXI', name: 'DAX' },
    { symbol: 'DIA', name: 'DOW Jones' },
    { symbol: 'SPY', name: 'S&P 500' },
    { symbol: 'VGK', name: 'FTSE Europe' },
    { symbol: 'EEM', name: 'Emerging Mkts' },
    { symbol: 'IWM', name: 'Russell 2000' },
    { symbol: 'VTI', name: 'Total US Market' },
    { symbol: 'ARKK', name: 'ARK Innovation' },
    { symbol: 'XLF', name: 'Financials ETF' },
    { symbol: 'XLE', name: 'Energy ETF' },
    { symbol: 'GLD', name: 'Gold ETF' },
    { symbol: 'TLT', name: 'US Treasury 20+' },
    // Individual stocks
    { symbol: 'AAPL', name: 'Apple' },
    { symbol: 'MSFT', name: 'Microsoft' },
    { symbol: 'NVDA', name: 'NVIDIA' },
    { symbol: 'TSLA', name: 'Tesla' },
    { symbol: 'AMZN', name: 'Amazon' },
    { symbol: 'META', name: 'Meta' },
    { symbol: 'GOOGL', name: 'Alphabet' },
    { symbol: 'NFLX', name: 'Netflix' },
    { symbol: 'AMD', name: 'AMD' },
    { symbol: 'CRM', name: 'Salesforce' },
    { symbol: 'AVGO', name: 'Broadcom' },
    { symbol: 'ORCL', name: 'Oracle' },
    { symbol: 'ADBE', name: 'Adobe' },
    { symbol: 'DIS', name: 'Disney' },
    { symbol: 'PYPL', name: 'PayPal' },
    { symbol: 'INTC', name: 'Intel' },
    { symbol: 'BA', name: 'Boeing' },
    { symbol: 'V', name: 'Visa' },
    { symbol: 'JPM', name: 'JPMorgan Chase' },
    { symbol: 'WMT', name: 'Walmart' },
    { symbol: 'KO', name: 'Coca-Cola' },
    { symbol: 'PEP', name: 'PepsiCo' },
    { symbol: 'JNJ', name: 'Johnson & Johnson' },
    { symbol: 'PG', name: 'Procter & Gamble' },
    { symbol: 'BRK-B', name: 'Berkshire Hathaway' },
    { symbol: 'XOM', name: 'ExxonMobil' },
    { symbol: 'UNH', name: 'UnitedHealth' },
    // Metals & Resources
    { symbol: 'GC=F', name: 'Gold' },
    { symbol: 'SI=F', name: 'Silver' },
    { symbol: 'PL=F', name: 'Platinum' },
    { symbol: 'HG=F', name: 'Copper' },
    { symbol: 'CL=F', name: 'Crude Oil WTI' },
    { symbol: 'BZ=F', name: 'Brent Crude Oil' },
    { symbol: 'NG=F', name: 'Natural Gas' },
    // Crypto
    { symbol: 'BTC-USD', name: 'Bitcoin' },
    { symbol: 'ETH-USD', name: 'Ethereum' },
    { symbol: 'SOL-USD', name: 'Solana' },
    { symbol: 'BNB-USD', name: 'BNB' },
    { symbol: 'XRP-USD', name: 'XRP' },
    { symbol: 'ADA-USD', name: 'Cardano' },
    { symbol: 'DOGE-USD', name: 'Dogecoin' },
];

let tickerCache = { data: null, ts: 0 };
let tickerFetchPromise = null;
const TICKER_CACHE_MS = 5 * 60 * 1000; // 5 minutes

// Diagnostic state — exposed via /api/_stock-diag so we can see why Yahoo
// fails on production without needing log access.
const diag = {
    lastAttemptAt: 0,
    lastSuccessAt: 0,
    lastError: null,
    lastErrorAt: 0,
    lastResultCount: null,
    successCount: 0,
    errorCount: 0,
    emptyCount: 0,
};

const searchCache = new Map();
const SEARCH_CACHE_MS = 10 * 60 * 1000; // 10 minutes

const singleQuoteCache = new Map();
const SINGLE_QUOTE_CACHE_MS = 2 * 60 * 1000; // 2 minutes

export function createStocksRouter({ getYahooFinance, isStockGameEnabled }) {
    const router = Router();

    // Seed in-memory ticker cache from the persisted DB cache so the very
    // first request (or a cold start where Yahoo is rate-limited) still
    // has prices to serve. Only ticker-board symbols are seeded — custom
    // user positions are served from the persistent cache via
    // getQuoteForSymbol instead. ts=0 forces the next call to refresh.
    function seedFromDbCache() {
        if (tickerCache.data) return;
        const tickerWanted = new Set(TICKER_SYMBOLS.map(s => s.symbol.replace('^', '')));
        const nameMap = new Map(TICKER_SYMBOLS.map(s => [s.symbol.replace('^', ''), s.name]));
        const seeded = [];
        for (const p of getAllCached()) {
            if (!tickerWanted.has(p.symbol)) continue;
            seeded.push({
                symbol: p.symbol,
                name: nameMap.get(p.symbol) || p.name || p.symbol,
                price: p.price,
                change: 0,
                pct: 0,
                currency: p.currency || 'USD',
                marketState: null,
            });
        }
        if (seeded.length === 0) return;
        tickerCache = { data: seeded, ts: 0 };
    }

    async function fetchTickerQuotes() {
        seedFromDbCache();

        const now = Date.now();
        if (tickerCache.data && now - tickerCache.ts < TICKER_CACHE_MS) {
            return tickerCache.data;
        }

        // Prevent concurrent fetches — reuse in-flight request
        if (tickerFetchPromise) return tickerFetchPromise;

        tickerFetchPromise = (async () => {
            try {
                diag.lastAttemptAt = Date.now();

                const symbols = TICKER_SYMBOLS.map(s => s.symbol);
                const nameMap = new Map(TICKER_SYMBOLS.map(s => [s.symbol, s.name]));

                const commit = (results) => {
                    if (tickerCache.data) {
                        const freshSymbols = new Set(results.map(r => r.symbol));
                        for (const prev of tickerCache.data) {
                            if (!freshSymbols.has(prev.symbol)) {
                                results.push(prev);
                            }
                        }
                    }
                    tickerCache = { data: results, ts: Date.now() };
                    diag.lastSuccessAt = Date.now();
                    diag.successCount++;
                    upsertQuotes(results).catch(() => {});
                    return results;
                };

                // Primary: v8 chart endpoint (no crumb → works on Render).
                try {
                    const { quotes, errors } = await fetchQuotesViaChart(symbols, { concurrency: 6 });
                    diag.lastResultCount = quotes.length;
                    if (errors.length > 0) {
                        diag.lastError = `chart endpoint: ${errors.length} of ${symbols.length} symbols failed (${errors[0].symbol}: ${errors[0].message})`;
                        diag.lastErrorAt = Date.now();
                    }
                    if (quotes.length > 0) {
                        return commit(quotes.map((q) => {
                            const rawSymbol = q.symbol || '';
                            return {
                                symbol: rawSymbol.replace('^', ''),
                                name: nameMap.get(rawSymbol) || q.shortName || rawSymbol.replace('^', ''),
                                price: parseFloat(q.price.toFixed(2)),
                                change: parseFloat(q.change.toFixed(2)),
                                pct: parseFloat(q.pct.toFixed(2)),
                                currency: q.currency,
                                marketState: q.marketState,
                            };
                        }));
                    }
                } catch (err) {
                    diag.lastError = `chart endpoint threw: ${err.message}`;
                    diag.lastErrorAt = Date.now();
                }

                // Fallback: yf.quote (typically crumb-429'd on cloud IPs).
                try {
                    const yf = await getYahooFinance();
                    const yfQuotes = await yf.quote(symbols);
                    const list = Array.isArray(yfQuotes) ? yfQuotes : [yfQuotes];
                    const fallback = [];
                    for (const q of list) {
                        if (!q || q.regularMarketPrice == null) continue;
                        const rawSymbol = q.symbol || '';
                        fallback.push({
                            symbol: rawSymbol.replace('^', ''),
                            name: nameMap.get(rawSymbol) || q.shortName || rawSymbol.replace('^', ''),
                            price: parseFloat(q.regularMarketPrice.toFixed(2)),
                            change: parseFloat((q.regularMarketChange ?? 0).toFixed(2)),
                            pct: parseFloat((q.regularMarketChangePercent ?? 0).toFixed(2)),
                            currency: q.currency || 'USD',
                            marketState: q.marketState || null,
                        });
                    }
                    if (fallback.length > 0) {
                        return commit(fallback);
                    }
                } catch (yfErr) {
                    diag.errorCount++;
                    diag.lastError = `chart and yf.quote both failed; yf: ${yfErr.message}`;
                    diag.lastErrorAt = Date.now();
                    console.error('[fetchTickerQuotes]', diag.lastError);
                }

                diag.emptyCount++;
                console.warn('[fetchTickerQuotes] both chart and yf.quote returned nothing; serving previous cache');
                return tickerCache.data || [];
            } finally {
                tickerFetchPromise = null;
            }
        })();

        return tickerFetchPromise;
    }

    router.get('/api/ticker', async (req, res) => {
        if (!isStockGameEnabled) {
            return res.status(503).json({ code: 'GAME_DISABLED', error: 'Stock game is disabled by server config' });
        }
        try {
            const data = await fetchTickerQuotes();
            res.json(data);
        } catch (err) {
            console.error('[Ticker] Failed to fetch quotes:', err.message);
            // Return cached data if available, even if stale
            if (tickerCache.data) {
                return res.json(tickerCache.data);
            }
            res.status(502).json({ error: 'Failed to fetch quotes' });
        }
    });

    router.get('/api/stock-search', async (req, res) => {
        if (!isStockGameEnabled) {
            return res.status(503).json({ code: 'GAME_DISABLED', error: 'Stock game is disabled by server config' });
        }
        try {
            const query = (req.query.q || '').trim();
            if (!query || query.length < 1 || query.length > 30) {
                return res.json([]);
            }
            // Sanitise: only allow alphanumeric, spaces, dots, dashes
            const sanitised = query.replace(/[^a-zA-Z0-9 .\-]/g, '');
            if (!sanitised) return res.json([]);

            const cacheKey = sanitised.toUpperCase();
            const cached = searchCache.get(cacheKey);
            if (cached && Date.now() - cached.ts < SEARCH_CACHE_MS) {
                return res.json(cached.data);
            }

            const yf = await getYahooFinance();
            const results = await yf.search(sanitised, { quotesCount: 8, newsCount: 0 });
            const quotes = (results.quotes || [])
                .filter(q => q.symbol && (q.quoteType === 'EQUITY' || q.quoteType === 'ETF'))
                .slice(0, 8)
                .map(q => ({
                    symbol: q.symbol.replace('^', ''),
                    name: q.shortname || q.longname || q.symbol,
                    type: q.quoteType,
                    exchange: q.exchDisp || q.exchange || '',
                }));

            searchCache.set(cacheKey, { data: quotes, ts: Date.now() });
            // Limit cache size
            if (searchCache.size > 200) {
                const oldest = searchCache.keys().next().value;
                searchCache.delete(oldest);
            }

            res.json(quotes);
        } catch (err) {
            console.error('[StockSearch] Error:', err.message);
            res.json([]);
        }
    });

    router.get('/api/stock-quote', async (req, res) => {
        if (!isStockGameEnabled) {
            return res.status(503).json({ code: 'GAME_DISABLED', error: 'Stock game is disabled by server config' });
        }
        try {
            const symbol = (req.query.symbol || '').trim().toUpperCase().replace(/[^A-Z0-9.\-^]/g, '');
            if (!symbol || symbol.length > 12) {
                return res.status(400).json({ error: 'Invalid symbol' });
            }

            const cached = singleQuoteCache.get(symbol);
            if (cached && Date.now() - cached.ts < SINGLE_QUOTE_CACHE_MS) {
                return res.json(cached.data);
            }

            // Primary: v8 chart endpoint (no crumb needed).
            let data = null;
            try {
                const q = await fetchSingleQuoteViaChart(symbol);
                data = {
                    symbol: (q.symbol || symbol).replace('^', ''),
                    name: q.shortName || symbol,
                    price: parseFloat(q.price.toFixed(2)),
                    change: parseFloat(q.change.toFixed(2)),
                    pct: parseFloat(q.pct.toFixed(2)),
                    currency: q.currency || 'USD',
                };
            } catch (chartErr) {
                // Fallback to yf.quote (often crumb-blocked but worth a try)
                try {
                    const yf = await getYahooFinance();
                    const q = await yf.quote(symbol);
                    if (!q || q.regularMarketPrice == null) {
                        return res.status(404).json({ error: 'Symbol not found' });
                    }
                    data = {
                        symbol: (q.symbol || symbol).replace('^', ''),
                        name: q.shortName || q.longName || symbol,
                        price: parseFloat(q.regularMarketPrice.toFixed(2)),
                        change: parseFloat((q.regularMarketChange ?? 0).toFixed(2)),
                        pct: parseFloat((q.regularMarketChangePercent ?? 0).toFixed(2)),
                        currency: q.currency || 'USD',
                    };
                } catch {
                    return res.status(502).json({ error: 'Failed to fetch quote: ' + chartErr.message });
                }
            }

            singleQuoteCache.set(symbol, { data, ts: Date.now() });
            if (singleQuoteCache.size > 500) {
                const oldest = singleQuoteCache.keys().next().value;
                singleQuoteCache.delete(oldest);
            }

            upsertQuotes([{ symbol: data.symbol, name: data.name, price: data.price, currency: data.currency }]).catch(() => {});

            res.json(data);
        } catch (err) {
            console.error('[StockQuote] Error:', err.message);
            res.status(502).json({ error: 'Failed to fetch quote' });
        }
    });

    // Diagnostic endpoint — no auth (state is non-sensitive: counts, error
    // messages, cache size). Lets us see from the browser exactly why the
    // ticker is empty on production.
    router.get('/api/_stock-diag', async (req, res) => {
        const ageMs = (ts) => (ts ? Date.now() - ts : null);
        const out = {
            now: new Date().toISOString(),
            tickerCache: {
                size: tickerCache.data ? tickerCache.data.length : 0,
                ageMs: ageMs(tickerCache.ts),
                sample: (tickerCache.data || []).slice(0, 3),
            },
            dbCache: {
                size: getAllCached().length,
                sample: getAllCached().slice(0, 3),
            },
            yahoo: {
                lastAttemptAgoMs: ageMs(diag.lastAttemptAt),
                lastSuccessAgoMs: ageMs(diag.lastSuccessAt),
                lastErrorAgoMs: ageMs(diag.lastErrorAt),
                lastError: diag.lastError,
                lastResultCount: diag.lastResultCount,
                successCount: diag.successCount,
                errorCount: diag.errorCount,
                emptyCount: diag.emptyCount,
            },
        };

        // If ?probe=1, fire a fresh Yahoo request right now and capture what comes back.
        if (req.query.probe === '1') {
            try {
                const yf = await getYahooFinance();
                const t0 = Date.now();
                const q = await yf.quote('AAPL');
                out.probe = {
                    ok: true,
                    elapsedMs: Date.now() - t0,
                    symbol: q?.symbol,
                    price: q?.regularMarketPrice,
                    currency: q?.currency,
                    marketState: q?.marketState,
                };
            } catch (e) {
                out.probe = {
                    ok: false,
                    name: e && e.name,
                    message: e && e.message,
                    stack: (e && e.stack || '').split('\n').slice(0, 4).join('\n'),
                };
            }
        }

        res.json(out);
    });

    // Expose fetchTickerQuotes for socket handlers
    router.fetchTickerQuotes = fetchTickerQuotes;

    return router;
}
