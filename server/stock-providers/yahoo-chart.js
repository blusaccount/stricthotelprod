// Alternative Yahoo price fetcher that bypasses the v6/v7 quote endpoints
// (which require a crumb cookie and get 429'd from cloud-host IPs like
// Render). Two no-crumb endpoints are used:
//
//   v7 spark      — batch: many symbols in one request → preferred for ticker
//   v8 chart      — single-symbol fallback
//
// Both return a `meta` block with regularMarketPrice and chartPreviousClose
// from which we derive change and pct.

const SPARK_URL = (symbols) =>
    `https://query1.finance.yahoo.com/v7/finance/spark?symbols=${symbols.map(encodeURIComponent).join(',')}&range=1d&interval=1d`;

const CHART_URL = (symbol) =>
    `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

const DEFAULT_TIMEOUT_MS = 4000;
const SPARK_BATCH_SIZE = 25; // keep URL length reasonable

function withTimeout(ms) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), ms);
    return { signal: ac.signal, clear: () => clearTimeout(timer) };
}

function metaToQuote(m, fallbackSymbol) {
    if (!m || m.regularMarketPrice == null) return null;
    const price = Number(m.regularMarketPrice);
    const prev = Number(m.chartPreviousClose ?? m.previousClose ?? price);
    const change = price - prev;
    const pct = prev !== 0 ? (change / prev) * 100 : 0;
    return {
        symbol: m.symbol || fallbackSymbol,
        shortName: m.shortName || m.longName || (m.symbol || fallbackSymbol),
        price,
        change,
        pct,
        currency: m.currency || 'USD',
        marketState: null,
    };
}

async function fetchSparkBatch(symbols, timeoutMs) {
    if (symbols.length === 0) return { quotes: [], errors: [] };
    const t = withTimeout(timeoutMs);
    try {
        const res = await fetch(SPARK_URL(symbols), {
            headers: { 'User-Agent': UA, 'Accept': 'application/json' },
            signal: t.signal,
        });
        if (!res.ok) {
            // Whole batch failed; surface as one error per symbol so callers
            // can decide whether to retry individuals via the chart endpoint.
            return {
                quotes: [],
                errors: symbols.map(s => ({ symbol: s, message: `spark HTTP ${res.status} ${res.statusText}` })),
            };
        }
        const data = await res.json();
        const results = data?.spark?.result || [];
        const byRequested = new Map(); // requested-symbol -> response
        for (const r of results) {
            byRequested.set(r.symbol, r);
        }
        const quotes = [];
        const errors = [];
        for (const s of symbols) {
            const r = byRequested.get(s);
            const meta = r?.response?.[0]?.meta;
            const q = metaToQuote(meta, s);
            if (q) quotes.push(q);
            else errors.push({ symbol: s, message: 'spark: no meta/price' });
        }
        return { quotes, errors };
    } catch (err) {
        return {
            quotes: [],
            errors: symbols.map(s => ({ symbol: s, message: `spark threw: ${err.message}` })),
        };
    } finally {
        t.clear();
    }
}

async function fetchChartOne(symbol, timeoutMs = DEFAULT_TIMEOUT_MS) {
    const t = withTimeout(timeoutMs);
    try {
        const res = await fetch(CHART_URL(symbol), {
            headers: { 'User-Agent': UA, 'Accept': 'application/json' },
            signal: t.signal,
        });
        if (!res.ok) {
            throw new Error(`HTTP ${res.status} ${res.statusText}`);
        }
        const data = await res.json();
        const result = data?.chart?.result?.[0];
        const errMsg = data?.chart?.error?.description;
        if (!result || !result.meta) throw new Error(errMsg || 'no chart result');
        const q = metaToQuote(result.meta, symbol);
        if (!q) throw new Error('regularMarketPrice missing');
        return q;
    } finally {
        t.clear();
    }
}

/**
 * Fetch a batch of symbols. Tries v7 spark in chunks (one HTTP request per
 * chunk, much friendlier to Yahoo's per-IP rate limits than N parallel
 * single-symbol requests). For symbols spark couldn't resolve, optionally
 * retries individually against the v8 chart endpoint.
 * @returns {Promise<{ quotes: Array, errors: Array<{symbol,message}> }>}
 */
export async function fetchQuotesViaChart(symbols, { timeoutMs = DEFAULT_TIMEOUT_MS, retryFailedViaChart = false } = {}) {
    if (!symbols || symbols.length === 0) return { quotes: [], errors: [] };

    const allQuotes = [];
    const allErrors = [];

    for (let i = 0; i < symbols.length; i += SPARK_BATCH_SIZE) {
        const chunk = symbols.slice(i, i + SPARK_BATCH_SIZE);
        const { quotes, errors } = await fetchSparkBatch(chunk, timeoutMs);
        allQuotes.push(...quotes);
        allErrors.push(...errors);
    }

    if (retryFailedViaChart && allErrors.length > 0) {
        const failedSymbols = allErrors.map(e => e.symbol);
        allErrors.length = 0;
        for (const s of failedSymbols) {
            try {
                const q = await fetchChartOne(s, timeoutMs);
                allQuotes.push(q);
            } catch (e) {
                allErrors.push({ symbol: s, message: `chart retry: ${e.message}` });
            }
        }
    }

    return { quotes: allQuotes, errors: allErrors };
}

export async function fetchSingleQuoteViaChart(symbol, opts) {
    return fetchChartOne(symbol, opts?.timeoutMs);
}

