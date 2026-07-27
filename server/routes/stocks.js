import { Router } from 'express';
import { upsertQuotes, getAllCached } from '../stock-price-cache.js';
import { fetchQuotesViaChart, fetchSingleQuoteViaChart, fetchHistoryViaChart, HISTORY_RANGE_KEYS } from '../stock-providers/yahoo-chart.js';
import { fetchQuotesViaStooq, fetchSingleQuoteViaStooq } from '../stock-providers/stooq.js';

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

const historyCache = new Map(); // `${symbol}|${range}` -> { data, ts }
const HISTORY_CACHE_MS = 10 * 60 * 1000; // 10 minutes

const profileCache = new Map(); // symbol -> { data, ts }
const PROFILE_CACHE_MS = 24 * 60 * 60 * 1000; // company profiles barely change

// Per-IP sliding window rate limiter, mirroring the login limiter in
// routes/auth.js. Protects the provider-backed routes from a single logged-in
// user hammering Yahoo/Stooq from the server's IP (see issue #159).
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

function rateLimiter(maxPerWindow) {
    const hits = new Map(); // ip -> { count, resetAt }
    return (req, res, next) => {
        const now = Date.now();
        const ip = req.ip || 'unknown';
        const entry = hits.get(ip);
        if (entry && now < entry.resetAt) {
            entry.count += 1;
            if (entry.count > maxPerWindow) {
                res.set('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
                return res.status(429).json({ error: 'Too many requests. Try again soon.' });
            }
        } else {
            hits.set(ip, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
        }
        next();
    };
}

const stockSearchRateLimiter = rateLimiter(30);
const stockQuoteRateLimiter = rateLimiter(30);
const stockHistoryRateLimiter = rateLimiter(30);
const stockProfileRateLimiter = rateLimiter(30);

// A short paragraph of the business summary — enough for "what does this
// company do" without dumping Yahoo's multi-paragraph profile on the UI.
function truncateSummary(text, maxSentences = 4, maxChars = 600) {
    if (typeof text !== 'string' || !text.trim()) return null;
    const sentences = text.trim().match(/[^.!?]+[.!?]+(?:\s|$)/g);
    let out = sentences ? sentences.slice(0, maxSentences).join('').trim() : text.trim();
    if (out.length > maxChars) out = out.slice(0, maxChars - 1).trimEnd() + '…';
    return out;
}
// _stock-diag?probe=1 fires up to 4 real provider requests per call, so it
// gets a much tighter budget than plain search/quote lookups.
const stockDiagRateLimiter = rateLimiter(5);

export function createStocksRouter({ getYahooFinance, isStockGameEnabled, getExtraSymbols }) {
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
                asOf: p.updatedAt || 0,
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

                const tickerSyms = TICKER_SYMBOLS.map(s => s.symbol);
                const tickerSymsSet = new Set(tickerSyms.map(s => s.replace('^', '')));
                const nameMap = new Map(TICKER_SYMBOLS.map(s => [s.symbol, s.name]));

                // Expand the fetch list with every symbol currently held by
                // any player. This way one batch yf.quote() call covers both
                // the market grid AND every portfolio's live prices — vs.
                // making a separate single-symbol fetch (which would force a
                // crumb refresh and 429 on cloud IPs).
                let extras = [];
                if (typeof getExtraSymbols === 'function') {
                    try {
                        const raw = await getExtraSymbols();
                        if (Array.isArray(raw)) {
                            for (const s of raw) {
                                if (typeof s === 'string' && s && !tickerSymsSet.has(s.replace('^', ''))) {
                                    extras.push(s);
                                }
                            }
                        }
                    } catch (e) {
                        console.warn('[fetchTickerQuotes] getExtraSymbols threw:', e.message);
                    }
                }
                const symbols = tickerSyms.concat(extras);

                const commit = (results) => {
                    // Per-quote freshness stamp: fresh rows get "now", rows
                    // carried over from the previous cache keep their old
                    // asOf so the trade path can tell real live prices from
                    // symbols that keep failing to refresh.
                    const now = Date.now();
                    for (const r of results) r.asOf = now;
                    if (tickerCache.data) {
                        const freshSymbols = new Set(results.map(r => r.symbol));
                        for (const prev of tickerCache.data) {
                            if (!freshSymbols.has(prev.symbol)) {
                                results.push(prev);
                            }
                        }
                    }
                    tickerCache = { data: results, ts: now };
                    diag.lastSuccessAt = now;
                    diag.successCount++;
                    upsertQuotes(results).catch(() => {});
                    return results;
                };

                const mapToTickerRow = (q) => {
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
                };

                // Primary: yahoo-finance2 quote() — fastest when crumb is
                // cached (single batch HTTP call vs N per-symbol fetches
                // for stooq/spark). Fails fast (~100ms) when crumb is 429'd
                // so the cascade can fall through quickly.
                try {
                    const yf = await getYahooFinance();
                    const yfQuotes = await yf.quote(symbols);
                    const list = Array.isArray(yfQuotes) ? yfQuotes : [yfQuotes];
                    const yfResults = [];
                    for (const q of list) {
                        if (!q || q.regularMarketPrice == null) continue;
                        const rawSymbol = q.symbol || '';
                        yfResults.push({
                            symbol: rawSymbol.replace('^', ''),
                            name: nameMap.get(rawSymbol) || q.shortName || rawSymbol.replace('^', ''),
                            price: parseFloat(q.regularMarketPrice.toFixed(2)),
                            change: parseFloat((q.regularMarketChange ?? 0).toFixed(2)),
                            pct: parseFloat((q.regularMarketChangePercent ?? 0).toFixed(2)),
                            currency: q.currency || 'USD',
                            marketState: q.marketState || null,
                        });
                    }
                    if (yfResults.length > 0) {
                        diag.lastResultCount = yfResults.length;
                        return commit(yfResults);
                    }
                } catch (yfErr) {
                    diag.lastError = `yf.quote: ${yfErr.message}`;
                    diag.lastErrorAt = Date.now();
                }

                // Fallback 1: Yahoo v7 spark batch (no crumb).
                try {
                    const { quotes, errors } = await fetchQuotesViaChart(symbols);
                    if (quotes.length > 0) {
                        diag.lastResultCount = quotes.length;
                        return commit(quotes.map(mapToTickerRow));
                    }
                    if (errors.length > 0) {
                        diag.lastError = `yahoo spark: ${errors.length} of ${symbols.length} failed (${errors[0].symbol}: ${errors[0].message})`;
                        diag.lastErrorAt = Date.now();
                    }
                } catch (err) {
                    diag.lastError = `yahoo spark threw: ${err.message}`;
                    diag.lastErrorAt = Date.now();
                }

                // Fallback 2: Stooq (often unreachable from cloud egress IPs,
                // 3s timeout per chunk keeps the slow case bounded).
                try {
                    const { quotes, errors } = await fetchQuotesViaStooq(symbols);
                    if (quotes.length > 0) {
                        diag.lastResultCount = quotes.length;
                        return commit(quotes.map(mapToTickerRow));
                    }
                    if (errors.length > 0) {
                        diag.lastError = `stooq: ${errors.length} of ${symbols.length} symbols failed (${errors[0].symbol}: ${errors[0].message})`;
                        diag.lastErrorAt = Date.now();
                    }
                } catch (err) {
                    diag.lastError = `stooq threw: ${err.message}`;
                    diag.lastErrorAt = Date.now();
                }

                diag.emptyCount++;
                console.warn('[fetchTickerQuotes] all providers (yf.quote, spark, stooq) returned nothing; serving previous cache');
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
            // The internal cache may also contain user-held symbols (so
            // snapshots don't need a separate call); only ticker-board
            // symbols are exposed on the public market grid.
            const tickerOnly = new Set(TICKER_SYMBOLS.map(s => s.symbol.replace('^', '')));
            res.json(data.filter(q => tickerOnly.has(q.symbol)));
        } catch (err) {
            console.error('[Ticker] Failed to fetch quotes:', err.message);
            // Return cached data if available, even if stale
            if (tickerCache.data) {
                return res.json(tickerCache.data);
            }
            res.status(502).json({ error: 'Failed to fetch quotes' });
        }
    });

    router.get('/api/stock-search', stockSearchRateLimiter, async (req, res) => {
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

    router.get('/api/stock-quote', stockQuoteRateLimiter, async (req, res) => {
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

            let data = null;
            const tryProviders = [
                async () => {
                    const q = await fetchSingleQuoteViaStooq(symbol);
                    return {
                        symbol: (q.symbol || symbol).replace('^', ''),
                        name: q.shortName || symbol,
                        price: parseFloat(q.price.toFixed(2)),
                        change: parseFloat(q.change.toFixed(2)),
                        pct: parseFloat(q.pct.toFixed(2)),
                        currency: q.currency || 'USD',
                    };
                },
                async () => {
                    const q = await fetchSingleQuoteViaChart(symbol);
                    return {
                        symbol: (q.symbol || symbol).replace('^', ''),
                        name: q.shortName || symbol,
                        price: parseFloat(q.price.toFixed(2)),
                        change: parseFloat(q.change.toFixed(2)),
                        pct: parseFloat(q.pct.toFixed(2)),
                        currency: q.currency || 'USD',
                    };
                },
                async () => {
                    const yf = await getYahooFinance();
                    const q = await yf.quote(symbol);
                    if (!q || q.regularMarketPrice == null) throw new Error('no price');
                    return {
                        symbol: (q.symbol || symbol).replace('^', ''),
                        name: q.shortName || q.longName || symbol,
                        price: parseFloat(q.regularMarketPrice.toFixed(2)),
                        change: parseFloat((q.regularMarketChange ?? 0).toFixed(2)),
                        pct: parseFloat((q.regularMarketChangePercent ?? 0).toFixed(2)),
                        currency: q.currency || 'USD',
                    };
                },
            ];
            const errors = [];
            for (const fn of tryProviders) {
                try { data = await fn(); break; }
                catch (e) { errors.push(e.message); }
            }
            if (!data) {
                return res.status(502).json({ error: 'all providers failed: ' + errors.join(' | ') });
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

    // History via yahoo-finance2's chart() — its crumb-cookie machinery
    // succeeds in environments where the raw no-crumb v8 endpoint gets
    // per-IP 429'd (mirror image of the ticker cascade, where the raw
    // endpoints are the ones that survive Render's egress IP).
    const YF_RANGE_DAYS = { '1d': 2, '5d': 7, '1mo': 31, '3mo': 93, '1y': 366, '5y': 1830 };
    const YF_RANGE_INTERVALS = { '1d': '5m', '5d': '30m', '1mo': '1d', '3mo': '1d', '1y': '1wk', '5y': '1mo' };

    async function fetchHistoryViaYf(symbol, range) {
        const yf = await getYahooFinance();
        const days = YF_RANGE_DAYS[range] || 31;
        const interval = YF_RANGE_INTERVALS[range] || '1d';
        const period1 = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const result = await yf.chart(symbol, { period1, interval });
        const meta = result?.meta || {};
        const points = [];
        for (const q of result?.quotes || []) {
            if (q?.close == null || !Number.isFinite(q.close)) continue;
            const t = q.date instanceof Date ? q.date.getTime() : Date.parse(q.date);
            if (!Number.isFinite(t)) continue;
            points.push({ t, c: Math.round(q.close * 100) / 100 });
        }
        if (points.length === 0) throw new Error('yf.chart: no data points');
        return {
            symbol: (meta.symbol || symbol).replace('^', ''),
            currency: meta.currency || 'USD',
            range,
            interval,
            points,
            meta: {
                price: meta.regularMarketPrice ?? null,
                previousClose: meta.chartPreviousClose ?? meta.previousClose ?? null,
                fiftyTwoWeekHigh: meta.fiftyTwoWeekHigh ?? null,
                fiftyTwoWeekLow: meta.fiftyTwoWeekLow ?? null,
                shortName: meta.shortName || meta.longName || null,
                exchangeName: meta.fullExchangeName || meta.exchangeName || null,
            },
        };
    }

    async function fetchHistoryAnyProvider(symbol, range) {
        try {
            return await fetchHistoryViaChart(symbol, range);
        } catch (rawErr) {
            try {
                return await fetchHistoryViaYf(symbol, range);
            } catch (yfErr) {
                throw new Error(`chart: ${rawErr.message} | yf: ${yfErr.message}`);
            }
        }
    }

    router.get('/api/stock-history', stockHistoryRateLimiter, async (req, res) => {
        if (!isStockGameEnabled) {
            return res.status(503).json({ code: 'GAME_DISABLED', error: 'Stock game is disabled by server config' });
        }
        try {
            const symbol = (req.query.symbol || '').trim().toUpperCase().replace(/[^A-Z0-9.\-^=]/g, '');
            if (!symbol || symbol.length > 12) {
                return res.status(400).json({ error: 'Invalid symbol' });
            }
            const range = HISTORY_RANGE_KEYS.includes(req.query.range) ? req.query.range : '1mo';

            const key = `${symbol}|${range}`;
            const cached = historyCache.get(key);
            if (cached && Date.now() - cached.ts < HISTORY_CACHE_MS) {
                return res.json(cached.data);
            }

            let data;
            try {
                data = await fetchHistoryAnyProvider(symbol, range);
            } catch (err) {
                // Client-side symbols are stored without the '^' index prefix
                // (GDAXI, not ^GDAXI) but Yahoo only knows the prefixed form.
                const prefixed = '^' + symbol;
                const isKnownIndex = TICKER_SYMBOLS.some(s => s.symbol === prefixed);
                if (!isKnownIndex) throw err;
                data = await fetchHistoryAnyProvider(prefixed, range);
            }

            historyCache.set(key, { data, ts: Date.now() });
            if (historyCache.size > 300) {
                const oldest = historyCache.keys().next().value;
                historyCache.delete(oldest);
            }

            res.json(data);
        } catch (err) {
            console.error('[StockHistory] Error:', err.message);
            res.status(502).json({ error: 'Failed to fetch history' });
        }
    });

    // Company profile for the detail subpage. Board symbols use curated
    // client-side blurbs; this only serves searched symbols. Failure is a
    // 200 with summary:null — the client falls back to a generic type label.
    router.get('/api/stock-profile', stockProfileRateLimiter, async (req, res) => {
        if (!isStockGameEnabled) {
            return res.status(503).json({ code: 'GAME_DISABLED', error: 'Stock game is disabled by server config' });
        }
        const symbol = (req.query.symbol || '').trim().toUpperCase().replace(/[^A-Z0-9.\-^=]/g, '');
        if (!symbol || symbol.length > 12) {
            return res.status(400).json({ error: 'Invalid symbol' });
        }

        const cached = profileCache.get(symbol);
        if (cached && Date.now() - cached.ts < PROFILE_CACHE_MS) {
            return res.json(cached.data);
        }

        let data = { symbol, summary: null, sector: null, industry: null };
        try {
            const yf = await getYahooFinance();
            const result = await yf.quoteSummary(symbol, { modules: ['assetProfile'] });
            const profile = result?.assetProfile;
            if (profile) {
                data = {
                    symbol,
                    summary: truncateSummary(profile.longBusinessSummary),
                    sector: profile.sector || null,
                    industry: profile.industry || null,
                };
            }
        } catch (err) {
            // Non-equities (futures, crypto) and provider hiccups land here —
            // cache the empty result too so we don't re-ask Yahoo per click.
        }

        profileCache.set(symbol, { data, ts: Date.now() });
        if (profileCache.size > 500) {
            const oldest = profileCache.keys().next().value;
            profileCache.delete(oldest);
        }
        res.json(data);
    });

    // Diagnostic endpoint — no auth (state is non-sensitive: counts, error
    // messages, cache size). Lets us see from the browser exactly why the
    // ticker is empty on production.
    router.get('/api/_stock-diag', stockDiagRateLimiter, async (req, res) => {
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

        // If ?probe=1, fire a fresh request right now via every provider so
        // we can see which one Render can actually reach.
        if (req.query.probe === '1') {
            out.probe = {};
            const testSyms = ['AAPL', 'BTC-USD', 'ENR.DE'];

            // 0) Stooq batch (primary on cloud IPs)
            try {
                const t0 = Date.now();
                const { quotes, errors } = await fetchQuotesViaStooq(testSyms);
                out.probe.stooq = {
                    ok: quotes.length > 0,
                    elapsedMs: Date.now() - t0,
                    quotes: quotes.map(q => ({ symbol: q.symbol, price: q.price, currency: q.currency })),
                    errors,
                };
            } catch (e) {
                out.probe.stooq = { ok: false, error: e.message };
            }

            // 1) v7 spark batch
            try {
                const t0 = Date.now();
                const { quotes, errors } = await fetchQuotesViaChart(testSyms);
                out.probe.spark = {
                    ok: quotes.length > 0,
                    elapsedMs: Date.now() - t0,
                    quotes: quotes.map(q => ({ symbol: q.symbol, price: q.price, currency: q.currency })),
                    errors,
                };
            } catch (e) {
                out.probe.spark = { ok: false, error: e.message };
            }

            // 2) v8 chart single
            try {
                const t0 = Date.now();
                const q = await fetchSingleQuoteViaChart('AAPL');
                out.probe.chart = {
                    ok: true,
                    elapsedMs: Date.now() - t0,
                    symbol: q.symbol,
                    price: q.price,
                    currency: q.currency,
                };
            } catch (e) {
                out.probe.chart = { ok: false, error: e.message };
            }

            // 3) yf.quote (crumb-protected, expected to fail on cloud IPs)
            try {
                const yf = await getYahooFinance();
                const t0 = Date.now();
                const q = await yf.quote('AAPL');
                out.probe.yfQuote = {
                    ok: true,
                    elapsedMs: Date.now() - t0,
                    symbol: q?.symbol,
                    price: q?.regularMarketPrice,
                };
            } catch (e) {
                out.probe.yfQuote = { ok: false, error: e.message };
            }
        }

        res.json(out);
    });

    // Expose fetchTickerQuotes for socket handlers
    router.fetchTickerQuotes = fetchTickerQuotes;

    return router;
}
