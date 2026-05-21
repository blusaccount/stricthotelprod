// Stooq.com price provider — completely free, no API key, accepts
// comma-separated symbols and returns CSV. Used as a fallback for Yahoo
// when Yahoo's per-IP rate-limit kicks in (e.g. on Render's shared egress).
//
// Symbol mapping is best-effort: we translate the Yahoo-style symbols
// used elsewhere in the app to Stooq's format. Anything we can't map is
// surfaced as a per-symbol error so the caller can try another provider.

const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';
const DEFAULT_TIMEOUT_MS = 10000;
const STOOQ_BATCH_SIZE = 25;

function withTimeout(ms) {
    const ac = new AbortController();
    const timer = setTimeout(() => ac.abort(), ms);
    return { signal: ac.signal, clear: () => clearTimeout(timer) };
}

// Map Yahoo symbol → Stooq symbol. Returns null if no mapping known.
export function toStooqSymbol(yahooSymbol) {
    if (!yahooSymbol) return null;
    const s = String(yahooSymbol).trim().toUpperCase();
    if (!s) return null;

    // Crypto: BTC-USD, ETH-USD, … → btcusd, ethusd
    // (Stooq uses a concatenated form for major crypto pairs.)
    const cryptoMatch = s.match(/^([A-Z]{2,6})-USD$/);
    if (cryptoMatch) return cryptoMatch[1].toLowerCase() + 'usd';

    // German stocks (Xetra): RHM.DE → rhm.de
    if (s.endsWith('.DE')) return s.toLowerCase();

    // Hamburg exchange: QP70.HM — stooq may not have these; try .de fallback
    if (s.endsWith('.HM')) return s.toLowerCase();

    // Generic *.XX exchange suffixes (e.g. .PA Paris, .L London, .MI Milan)
    if (/\.[A-Z]{1,3}$/.test(s)) return s.toLowerCase();

    // Futures: GC=F → gc.f, SI=F → si.f
    if (s.endsWith('=F')) return s.slice(0, -2).toLowerCase() + '.f';

    // Indices — special cases
    if (s === '^GDAXI') return '^dax';
    if (s === 'GDAXI') return '^dax'; // already-stripped form
    if (s === '^DJI') return '^dji';
    if (s === '^GSPC') return '^spx';
    if (s === '^IXIC') return '^ndx';
    if (s.startsWith('^')) return s.toLowerCase();

    // Default: US stock / ETF — append .us
    return s.toLowerCase() + '.us';
}

// Reverse mapping for the response: Stooq returns its symbol; we want
// the original Yahoo-style symbol we asked for.
function buildReverseMap(yahooSymbols) {
    const map = new Map();
    for (const y of yahooSymbols) {
        const stooq = toStooqSymbol(y);
        if (stooq) map.set(stooq.toUpperCase(), y);
    }
    return map;
}

function parseCsv(text) {
    // Stooq CSV: Symbol,Date,Time,Open,High,Low,Close,Volume
    const lines = text.trim().split(/\r?\n/);
    if (lines.length < 2) return [];
    const header = lines[0].split(',').map(s => s.toLowerCase());
    const idx = (key) => header.indexOf(key);
    const iSym = idx('symbol');
    const iClose = idx('close');
    const iOpen = idx('open');
    const iDate = idx('date');
    const out = [];
    for (let li = 1; li < lines.length; li++) {
        const cols = lines[li].split(',');
        if (cols.length < header.length) continue;
        const sym = cols[iSym];
        const close = parseFloat(cols[iClose]);
        const open = parseFloat(cols[iOpen]);
        const date = cols[iDate];
        // Stooq returns 'N/D' for unknown symbols → close becomes NaN.
        if (!sym || !Number.isFinite(close) || close <= 0) {
            out.push({ symbol: sym, error: 'no price (N/D or unknown symbol)' });
            continue;
        }
        const prev = Number.isFinite(open) && open > 0 ? open : close;
        out.push({
            symbol: sym,
            date,
            price: close,
            change: close - prev,
            pct: prev !== 0 ? ((close - prev) / prev) * 100 : 0,
        });
    }
    return out;
}

async function fetchStooqBatch(yahooSymbols, timeoutMs) {
    const reverse = buildReverseMap(yahooSymbols);
    const stooqSyms = Array.from(reverse.keys()).map(s => s.toLowerCase());
    if (stooqSyms.length === 0) {
        return { quotes: [], errors: yahooSymbols.map(s => ({ symbol: s, message: 'no Stooq mapping' })) };
    }

    const url = `https://stooq.com/q/l/?s=${stooqSyms.join(',')}&f=sd2t2ohlcv&h&e=csv`;
    const t = withTimeout(timeoutMs);
    try {
        const res = await fetch(url, {
            headers: { 'User-Agent': UA, 'Accept': 'text/csv,*/*' },
            signal: t.signal,
        });
        if (!res.ok) {
            return {
                quotes: [],
                errors: yahooSymbols.map(s => ({ symbol: s, message: `stooq HTTP ${res.status} ${res.statusText}` })),
            };
        }
        const text = await res.text();
        const rows = parseCsv(text);
        const quotes = [];
        const errors = [];
        const seenStooq = new Set();
        for (const row of rows) {
            const yahoo = reverse.get(String(row.symbol || '').toUpperCase());
            seenStooq.add(String(row.symbol || '').toUpperCase());
            if (!yahoo) continue;
            if (row.error) {
                errors.push({ symbol: yahoo, message: 'stooq: ' + row.error });
                continue;
            }
            quotes.push({
                symbol: yahoo,
                shortName: yahoo,
                price: row.price,
                change: row.change,
                pct: row.pct,
                currency: 'USD', // Stooq doesn't return currency; caller may already know
                marketState: null,
            });
        }
        // Any requested symbol we didn't see at all
        for (const y of yahooSymbols) {
            const stooq = toStooqSymbol(y);
            if (stooq && !seenStooq.has(stooq.toUpperCase()) && !quotes.find(q => q.symbol === y)) {
                if (!errors.find(e => e.symbol === y)) {
                    errors.push({ symbol: y, message: 'stooq: symbol missing from response' });
                }
            }
        }
        return { quotes, errors };
    } catch (err) {
        return {
            quotes: [],
            errors: yahooSymbols.map(s => ({ symbol: s, message: `stooq threw: ${err.message}` })),
        };
    } finally {
        t.clear();
    }
}

/**
 * Fetch a batch of Yahoo-style symbols from Stooq, chunked to keep URLs short.
 */
export async function fetchQuotesViaStooq(yahooSymbols, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
    if (!yahooSymbols || yahooSymbols.length === 0) return { quotes: [], errors: [] };
    const allQuotes = [];
    const allErrors = [];
    for (let i = 0; i < yahooSymbols.length; i += STOOQ_BATCH_SIZE) {
        const chunk = yahooSymbols.slice(i, i + STOOQ_BATCH_SIZE);
        const { quotes, errors } = await fetchStooqBatch(chunk, timeoutMs);
        allQuotes.push(...quotes);
        allErrors.push(...errors);
    }
    return { quotes: allQuotes, errors: allErrors };
}

export async function fetchSingleQuoteViaStooq(yahooSymbol, opts) {
    const r = await fetchStooqBatch([yahooSymbol], opts?.timeoutMs ?? DEFAULT_TIMEOUT_MS);
    if (r.quotes.length > 0) return r.quotes[0];
    throw new Error(r.errors[0]?.message || 'stooq: no result');
}
