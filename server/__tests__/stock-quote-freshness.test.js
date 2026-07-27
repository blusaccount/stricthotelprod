import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Freshness gating for the trade path (issue: trades must never fill at a
// price older than MAX_TRADE_PRICE_AGE_MS even when every provider is down).

let isQuoteFreshEnough;
let getQuoteForSymbol;
let MAX_TRADE_PRICE_AGE_MS;
let upsertQuotes;

beforeEach(async () => {
    vi.useFakeTimers();
    vi.resetModules();
    // All live providers unreachable — freshness decisions then depend on
    // the supplied ticker quotes and the persisted cache only.
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('providers down')));
    const handlers = await import('../handlers/stocks.js');
    isQuoteFreshEnough = handlers.isQuoteFreshEnough;
    getQuoteForSymbol = handlers.getQuoteForSymbol;
    MAX_TRADE_PRICE_AGE_MS = handlers.MAX_TRADE_PRICE_AGE_MS;
    ({ upsertQuotes } = await import('../stock-price-cache.js'));
});

afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
});

describe('isQuoteFreshEnough', () => {
    it('accepts anything when no age bound is requested', () => {
        expect(isQuoteFreshEnough({ price: 1 }, 0)).toBe(true);
        expect(isQuoteFreshEnough(null, 0)).toBe(true);
    });

    it('accepts a quote within the age bound', () => {
        const now = Date.now();
        expect(isQuoteFreshEnough({ asOf: now - 5000 }, 10_000, now)).toBe(true);
    });

    it('rejects a quote older than the age bound', () => {
        const now = Date.now();
        expect(isQuoteFreshEnough({ asOf: now - 11_000 }, 10_000, now)).toBe(false);
    });

    it('rejects quotes without an asOf stamp when a bound is requested', () => {
        expect(isQuoteFreshEnough({ price: 1 }, 10_000)).toBe(false);
        expect(isQuoteFreshEnough(null, 10_000)).toBe(false);
    });
});

describe('getQuoteForSymbol trade-path freshness', () => {
    it('uses a fresh ticker quote', async () => {
        const quotes = [{ symbol: 'AAPL', name: 'Apple', price: 150, asOf: Date.now() }];
        const q = await getQuoteForSymbol('AAPL', quotes, null, { maxAgeMs: MAX_TRADE_PRICE_AGE_MS });
        expect(q).not.toBeNull();
        expect(q.price).toBe(150);
    });

    it('rejects a stale carried-over ticker quote instead of trading on it', async () => {
        const stale = Date.now() - MAX_TRADE_PRICE_AGE_MS - 60_000;
        const quotes = [{ symbol: 'AAPL', name: 'Apple', price: 150, asOf: stale }];
        const q = await getQuoteForSymbol('AAPL', quotes, null, { maxAgeMs: MAX_TRADE_PRICE_AGE_MS });
        expect(q).toBeNull();
    });

    it('still serves the stale ticker quote to valuation callers (no age bound)', async () => {
        const stale = Date.now() - MAX_TRADE_PRICE_AGE_MS - 60_000;
        const quotes = [{ symbol: 'AAPL', name: 'Apple', price: 150, asOf: stale }];
        const q = await getQuoteForSymbol('AAPL', quotes, null);
        expect(q).not.toBeNull();
        expect(q.price).toBe(150);
    });

    it('serves a fresh persisted-cache price to trade callers', async () => {
        await upsertQuotes([{ symbol: 'MSFT', name: 'Microsoft', price: 400 }]);
        const q = await getQuoteForSymbol('MSFT', [], null, { maxAgeMs: MAX_TRADE_PRICE_AGE_MS });
        expect(q).not.toBeNull();
        expect(q.price).toBe(400);
    });

    it('refuses an over-age persisted-cache price for trades but not for valuation', async () => {
        await upsertQuotes([{ symbol: 'MSFT', name: 'Microsoft', price: 400 }]);
        vi.advanceTimersByTime(MAX_TRADE_PRICE_AGE_MS + 60_000);

        const tradeQuote = await getQuoteForSymbol('MSFT', [], null, { maxAgeMs: MAX_TRADE_PRICE_AGE_MS });
        expect(tradeQuote).toBeNull();

        const valuationQuote = await getQuoteForSymbol('MSFT', [], null);
        expect(valuationQuote).not.toBeNull();
        expect(valuationQuote.price).toBe(400);
    });

    it('does not let a valuation cache hit launder a stale price into the trade path', async () => {
        await upsertQuotes([{ symbol: 'TSLA', name: 'Tesla', price: 300 }]);
        vi.advanceTimersByTime(MAX_TRADE_PRICE_AGE_MS + 60_000);

        // Valuation caller warms the in-memory quote cache with the stale price
        const valuationQuote = await getQuoteForSymbol('TSLA', [], null);
        expect(valuationQuote).not.toBeNull();

        // Trade caller right afterwards must still be refused
        const tradeQuote = await getQuoteForSymbol('TSLA', [], null, { maxAgeMs: MAX_TRADE_PRICE_AGE_MS });
        expect(tradeQuote).toBeNull();
    });
});
