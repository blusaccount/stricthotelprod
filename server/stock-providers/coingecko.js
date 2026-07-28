// CoinGecko price provider — the only source in this app that is both free
// and licensed for commercial use. CoinGecko's API Terms §4.1.6 state
// "You are entitled to charge for your services and products that incorporate
// or integrates our CoinGecko API", so crypto quotes do not depend on the
// unlicensed Yahoo endpoints the rest of the market grid still uses.
//
// Two obligations come with that licence and are not optional:
//   1. "Powered by CoinGecko" must be visible wherever the data is shown,
//      at font size 10 or larger (§4.4). See games/stocks/index.html.
//   2. Access to the API itself must not be resold or syndicated.
//
// A Demo API key (COINGECKO_API_KEY) raises the rate limit but is not
// required: the ticker batches all crypto symbols into one call every five
// minutes, which the keyless public limit absorbs comfortably.

const BASE_URL = 'https://api.coingecko.com/api/v3';
const DEFAULT_TIMEOUT_MS = 6000;

export const COINGECKO_ATTRIBUTION = 'Powered by CoinGecko';

// Yahoo-style symbol -> CoinGecko coin id. Deliberately a fixed map rather
// than a /coins/list lookup: the stock search endpoint only ever returns
// EQUITY and ETF, so the crypto universe is exactly what the ticker defines
// plus a few obvious neighbours a player might request by hand.
const COIN_IDS = {
    'BTC-USD': 'bitcoin',
    'ETH-USD': 'ethereum',
    'SOL-USD': 'solana',
    'BNB-USD': 'binancecoin',
    'XRP-USD': 'ripple',
    'ADA-USD': 'cardano',
    'DOGE-USD': 'dogecoin',
    'LTC-USD': 'litecoin',
    'DOT-USD': 'polkadot',
    'AVAX-USD': 'avalanche-2',
    'MATIC-USD': 'matic-network',
    'LINK-USD': 'chainlink',
    'TRX-USD': 'tron',
    'SHIB-USD': 'shiba-inu',
    'UNI-USD': 'uniswap',
    'ATOM-USD': 'cosmos',
    'XLM-USD': 'stellar',
    'BCH-USD': 'bitcoin-cash',
    'ETC-USD': 'ethereum-classic',
    'NEAR-USD': 'near',
};

// Display names, so a CoinGecko-sourced quote carries the same label the
// Yahoo path would have produced.
const COIN_NAMES = {
    bitcoin: 'Bitcoin',
    ethereum: 'Ethereum',
    solana: 'Solana',
    binancecoin: 'BNB',
    ripple: 'XRP',
    cardano: 'Cardano',
    dogecoin: 'Dogecoin',
    litecoin: 'Litecoin',
    polkadot: 'Polkadot',
    'avalanche-2': 'Avalanche',
    'matic-network': 'Polygon',
    chainlink: 'Chainlink',
    tron: 'TRON',
    'shiba-inu': 'Shiba Inu',
    uniswap: 'Uniswap',
    cosmos: 'Cosmos',
    stellar: 'Stellar',
    'bitcoin-cash': 'Bitcoin Cash',
    'ethereum-classic': 'Ethereum Classic',
    near: 'NEAR Protocol',
};

function withTimeout(ms) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), ms);
    return { signal: ac.signal, clear: () => clearTimeout(timer) };
}

function headers() {
    const h = { Accept: 'application/json' };
    const key = process.env.COINGECKO_API_KEY;
    if (key) h['x-cg-demo-api-key'] = key;
    return h;
}

// The keyless public endpoint budgets requests per minute and answers a burst
// with 429s (which the upstream edge sometimes rewrites to 503). Requests are
// therefore serialised through one chain with a minimum gap, so a user
// clicking through several charts queues instead of tripping the limit.
//
// Steady-state load is far below this: the ticker makes one batched call every
// five minutes, and single quotes and history are cached for two and ten
// minutes respectively. The spacing only matters for bursts.
// Tunable because the right spacing depends on the plan: the keyless public
// limit needs ~1.5s between calls, a Demo key tolerates far less. Read on each
// call rather than at import time so the value is not frozen before the
// process finishes wiring up its environment.
function minIntervalMs() {
    const raw = Number(process.env.COINGECKO_MIN_INTERVAL_MS);
    return Number.isFinite(raw) && raw >= 0 ? raw : 1500;
}
const RETRY_STATUSES = new Set([429, 502, 503, 504]);
// Growing backoff: the keyless budget refills per minute, so a single short
// retry is not enough when a user clicks through several chart ranges at once.
// Setting COINGECKO_API_KEY (free Demo key) raises the ceiling far enough that
// these retries stop being reached at all.
function retryDelaysMs() {
    return minIntervalMs() === 0 ? [0, 0] : [3000, 7000];
}

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

let queueTail = Promise.resolve();
let lastRequestAt = 0;

// Chain onto the previous request so at most one CoinGecko call is in flight
// and consecutive calls are at least MIN_INTERVAL_MS apart.
function enqueue(task) {
    const run = queueTail.then(async () => {
        const wait = minIntervalMs() - (Date.now() - lastRequestAt);
        if (wait > 0) await sleep(wait);
        try {
            return await task();
        } finally {
            lastRequestAt = Date.now();
        }
    });
    // Keep the chain alive even when a task rejects.
    queueTail = run.then(() => {}, () => {});
    return run;
}

async function fetchOnce(url, timeoutMs) {
    const t = withTimeout(timeoutMs);
    try {
        return await fetch(url, { headers: headers(), signal: t.signal });
    } finally {
        t.clear();
    }
}

async function fetchWithRetry(url, timeoutMs) {
    let res = await enqueue(() => fetchOnce(url, timeoutMs));
    for (const delay of retryDelaysMs()) {
        if (!res || res.ok || !RETRY_STATUSES.has(res.status)) break;
        await sleep(delay);
        res = await enqueue(() => fetchOnce(url, timeoutMs));
    }
    return res;
}

/**
 * Map a Yahoo-style symbol to a CoinGecko coin id, or null when the symbol
 * is not a crypto pair we cover.
 */
export function toCoinGeckoId(yahooSymbol) {
    if (typeof yahooSymbol !== 'string') return null;
    const s = yahooSymbol.trim().toUpperCase();
    return COIN_IDS[s] || null;
}

/** True when this symbol should be served by CoinGecko instead of Yahoo. */
export function isCryptoSymbol(yahooSymbol) {
    return toCoinGeckoId(yahooSymbol) !== null;
}

/**
 * Batch quotes for crypto symbols.
 * @returns {Promise<{quotes: Array, errors: Array<{symbol, message}>}>}
 *   Quote shape matches the Stooq/Yahoo providers so callers can treat them
 *   interchangeably: { symbol, shortName, price, change, pct, currency,
 *   marketState }.
 */
export async function fetchQuotesViaCoinGecko(yahooSymbols, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    const list = Array.isArray(yahooSymbols) ? yahooSymbols : [];
    if (list.length === 0) return { quotes: [], errors: [] };

    const errors = [];
    const idToSymbol = new Map();
    for (const sym of list) {
        const id = toCoinGeckoId(sym);
        if (!id) {
            errors.push({ symbol: sym, message: 'no CoinGecko mapping' });
            continue;
        }
        idToSymbol.set(id, sym);
    }
    if (idToSymbol.size === 0) return { quotes: [], errors };

    const ids = Array.from(idToSymbol.keys()).join(',');
    const url = `${BASE_URL}/simple/price?ids=${encodeURIComponent(ids)}` +
        '&vs_currencies=usd&include_24hr_change=true';

    try {
        const res = await fetchWithRetry(url, timeoutMs);
        if (!res || !res.ok) {
            const detail = res ? `HTTP ${res.status} ${res.statusText}` : 'no response';
            for (const sym of idToSymbol.values()) {
                errors.push({ symbol: sym, message: `coingecko ${detail}` });
            }
            return { quotes: [], errors };
        }
        const data = await res.json();
        const quotes = [];
        for (const [id, sym] of idToSymbol) {
            const row = data?.[id];
            const price = row?.usd;
            if (price == null || !Number.isFinite(price)) {
                errors.push({ symbol: sym, message: 'coingecko: no price in response' });
                continue;
            }
            // CoinGecko reports the 24h move as a percentage; the absolute
            // change has to be derived from it. Guard the -100% edge so a
            // dead coin cannot divide by zero.
            const pct = Number.isFinite(row.usd_24h_change) ? row.usd_24h_change : 0;
            const prev = pct <= -100 ? null : price / (1 + pct / 100);
            const change = prev == null ? 0 : price - prev;

            quotes.push({
                symbol: sym,
                shortName: COIN_NAMES[id] || sym,
                price,
                change,
                pct,
                currency: 'USD',
                // Crypto trades around the clock; there is no session state.
                marketState: 'REGULAR',
            });
        }
        return { quotes, errors };
    } catch (err) {
        for (const sym of idToSymbol.values()) {
            errors.push({ symbol: sym, message: `coingecko threw: ${err.message}` });
        }
        return { quotes: [], errors };
    }
}

/** Single-symbol convenience wrapper. Throws when the symbol has no quote. */
export async function fetchSingleQuoteViaCoinGecko(yahooSymbol, opts) {
    const { quotes, errors } = await fetchQuotesViaCoinGecko([yahooSymbol], opts);
    if (quotes.length > 0) return quotes[0];
    throw new Error(errors[0]?.message || 'coingecko: no quote');
}

// Range -> days for /coins/{id}/market_chart. The free Demo plan only serves
// the last 365 days, so '5y' is deliberately absent: the caller falls through
// to the next provider for that range rather than being handed a silently
// shortened series.
const HISTORY_DAYS = {
    '1d': 1,
    '5d': 5,
    '1mo': 30,
    '3mo': 90,
    '1y': 365,
};

// CoinGecko picks its own granularity from the day span (5-minutely up to one
// day, hourly up to 90, daily beyond) and has no interval parameter. Left raw,
// a 3-month chart arrives as ~2,200 hourly points where the Yahoo path returns
// ~65 daily ones — same picture, thirty times the payload. Bucket the series
// down to the interval the chart already expects for each range.
const HISTORY_BUCKETS = {
    '1d': { ms: 0, label: '5m' },
    '5d': { ms: 0, label: '1h' },
    '1mo': { ms: 24 * 60 * 60 * 1000, label: '1d' },
    '3mo': { ms: 24 * 60 * 60 * 1000, label: '1d' },
    '1y': { ms: 7 * 24 * 60 * 60 * 1000, label: '1wk' },
};

// Keep the last point of every bucket, plus the very last point overall so the
// series always ends on the most recent price rather than a stale bucket close.
function bucketPoints(points, bucketMs) {
    if (!bucketMs || points.length === 0) return points;
    const out = [];
    for (let i = 0; i < points.length; i++) {
        const isLast = i === points.length - 1;
        const endsBucket = isLast ||
            Math.floor(points[i + 1].t / bucketMs) !== Math.floor(points[i].t / bucketMs);
        if (endsBucket) out.push(points[i]);
    }
    return out;
}

export const COINGECKO_HISTORY_RANGES = Object.keys(HISTORY_DAYS);

/**
 * Close-price series for one crypto symbol.
 * @returns {Promise<{symbol, currency, range, interval, points, meta}>}
 */
export async function fetchHistoryViaCoinGecko(yahooSymbol, range, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    const id = toCoinGeckoId(yahooSymbol);
    if (!id) throw new Error(`no CoinGecko mapping for ${yahooSymbol}`);
    const days = HISTORY_DAYS[range];
    if (!days) throw new Error(`coingecko: unsupported range ${range}`);

    const url = `${BASE_URL}/coins/${encodeURIComponent(id)}/market_chart` +
        `?vs_currency=usd&days=${days}`;

    {
        const res = await fetchWithRetry(url, timeoutMs);
        if (!res || !res.ok) {
            throw new Error(`coingecko ${res ? `HTTP ${res.status} ${res.statusText}` : 'no response'}`);
        }
        const data = await res.json();
        const raw = Array.isArray(data?.prices) ? data.prices : [];
        const points = [];
        for (const entry of raw) {
            if (!Array.isArray(entry) || entry.length < 2) continue;
            const [ts, price] = entry;
            if (!Number.isFinite(ts) || !Number.isFinite(price)) continue;
            points.push({ t: ts, c: Math.round(price * 100) / 100 });
        }
        if (points.length === 0) throw new Error('coingecko: no data points');

        const bucket = HISTORY_BUCKETS[range] || { ms: 0, label: '1d' };
        const series = bucketPoints(points, bucket.ms);

        const last = series[series.length - 1];
        const first = series[0];
        let high = first.c;
        let low = first.c;
        for (const p of series) {
            if (p.c > high) high = p.c;
            if (p.c < low) low = p.c;
        }

        return {
            symbol: yahooSymbol.toUpperCase(),
            currency: 'USD',
            range,
            interval: bucket.label,
            points: series,
            meta: {
                price: last.c,
                previousClose: series.length > 1 ? series[series.length - 2].c : null,
                // Only a window over `range`, not a true 52-week extreme.
                fiftyTwoWeekHigh: range === '1y' ? high : null,
                fiftyTwoWeekLow: range === '1y' ? low : null,
                shortName: COIN_NAMES[id] || yahooSymbol.toUpperCase(),
                exchangeName: 'CoinGecko',
            },
        };
    }
}
