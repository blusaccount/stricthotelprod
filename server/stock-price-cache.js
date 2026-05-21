// Persistent price cache. Survives server restarts and Yahoo Finance
// outages so that portfolio G/L doesn't fall back to "cost basis" (which
// would make every position show 0.00 gain/loss).

import { isDatabaseEnabled, query } from './db.js';

// In-memory mirror of the persisted cache so reads don't hit the DB on
// every snapshot. Repopulated from DB at startup and updated on every
// successful Yahoo fetch.
const memoryCache = new Map(); // symbol -> { symbol, name, price, currency, updatedAt }

let loaded = false;

export async function loadCacheFromDb() {
    if (!isDatabaseEnabled()) {
        loaded = true;
        return;
    }
    try {
        const r = await query('select symbol, name, price, currency, updated_at from stock_price_cache');
        memoryCache.clear();
        for (const row of r.rows) {
            memoryCache.set(row.symbol, {
                symbol: row.symbol,
                name: row.name || row.symbol,
                price: Number(row.price),
                currency: row.currency || 'USD',
                updatedAt: row.updated_at instanceof Date ? row.updated_at.getTime() : Date.parse(row.updated_at),
            });
        }
        console.log(`✓ stock_price_cache loaded (${memoryCache.size} symbols)`);
    } catch (err) {
        console.error('[stock-price-cache] load failed:', err.message);
    } finally {
        loaded = true;
    }
}

export function getCachedQuote(symbol) {
    return memoryCache.get(symbol) || null;
}

export function getAllCached() {
    return Array.from(memoryCache.values());
}

export function isLoaded() {
    return loaded;
}

/**
 * Upsert a batch of quotes into both the memory cache and the DB.
 * Quotes shape: { symbol, name?, price, currency? }
 */
export async function upsertQuotes(quotes) {
    if (!Array.isArray(quotes) || quotes.length === 0) return;

    const now = Date.now();
    for (const q of quotes) {
        if (!q || !q.symbol || typeof q.price !== 'number' || !Number.isFinite(q.price) || q.price <= 0) continue;
        memoryCache.set(q.symbol, {
            symbol: q.symbol,
            name: q.name || q.symbol,
            price: q.price,
            currency: q.currency || 'USD',
            updatedAt: now,
        });
    }

    if (!isDatabaseEnabled()) return;

    // Bulk upsert using unnest. Skip rows the in-memory filter rejected.
    const rows = quotes.filter(q => q && q.symbol && typeof q.price === 'number' && Number.isFinite(q.price) && q.price > 0);
    if (rows.length === 0) return;

    try {
        const symbols = rows.map(q => q.symbol);
        const names = rows.map(q => q.name || q.symbol);
        const prices = rows.map(q => q.price);
        const currencies = rows.map(q => q.currency || 'USD');

        await query(
            `insert into stock_price_cache (symbol, name, price, currency, updated_at)
             select t.symbol, t.name, t.price, t.currency, now()
             from unnest($1::text[], $2::text[], $3::numeric[], $4::text[]) as t(symbol, name, price, currency)
             on conflict (symbol) do update
               set name = excluded.name,
                   price = excluded.price,
                   currency = excluded.currency,
                   updated_at = excluded.updated_at`,
            [symbols, names, prices, currencies]
        );
    } catch (err) {
        console.error('[stock-price-cache] upsert failed:', err.message);
    }
}
