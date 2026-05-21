// Alternative Yahoo price fetcher that bypasses the v6/v7 quote endpoints
// (which require a crumb cookie and get 429'd from cloud-host IPs like
// Render). The v8 chart endpoint does NOT require crumb and works fine
// from data-center IPs — so we use it for our actual price lookups.
//
// Tradeoffs vs. yahoo-finance2's quote():
//   + works on Render where v6/v7 is blocked
//   - one HTTP request per symbol (no batch endpoint)
//   - no marketState; we derive change/pct from chartPreviousClose

const CHART_URL = (symbol) => `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=1d&range=1d`;

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

const DEFAULT_TIMEOUT_MS = 8000;
const DEFAULT_CONCURRENCY = 6;

function withTimeout(ms) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), ms);
    return { signal: ac.signal, clear: () => clearTimeout(timer) };
}

async function fetchOne(symbol, timeoutMs = DEFAULT_TIMEOUT_MS) {
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
        if (!result || !result.meta) {
            throw new Error(errMsg || 'no chart result');
        }
        const m = result.meta;
        if (m.regularMarketPrice == null) {
            throw new Error('regularMarketPrice missing');
        }
        const price = Number(m.regularMarketPrice);
        const prev = Number(m.chartPreviousClose ?? m.previousClose ?? price);
        const change = price - prev;
        const pct = prev !== 0 ? (change / prev) * 100 : 0;
        return {
            symbol: m.symbol || symbol,
            shortName: m.shortName || m.longName || (m.symbol || symbol),
            price,
            change,
            pct,
            currency: m.currency || 'USD',
            marketState: null,
        };
    } finally {
        t.clear();
    }
}

/**
 * Fetch a batch of symbols with bounded concurrency.
 * @returns {Promise<{ quotes: Array, errors: Array<{symbol,message}> }>}
 */
export async function fetchQuotesViaChart(symbols, { concurrency = DEFAULT_CONCURRENCY, timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    const quotes = [];
    const errors = [];
    let i = 0;
    const worker = async () => {
        while (i < symbols.length) {
            const s = symbols[i++];
            try {
                const q = await fetchOne(s, timeoutMs);
                quotes.push(q);
            } catch (e) {
                errors.push({ symbol: s, message: e && e.message ? e.message : String(e) });
            }
        }
    };
    const pool = Math.max(1, Math.min(concurrency, symbols.length));
    await Promise.all(Array.from({ length: pool }, worker));
    return { quotes, errors };
}

export async function fetchSingleQuoteViaChart(symbol, opts) {
    return fetchOne(symbol, opts?.timeoutMs);
}
