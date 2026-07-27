import { buyStock, sellStock, getPortfolioSnapshot, getAllPortfolioPlayerNames, getLeaderboardSnapshot, getTradePerformanceLeaderboard } from '../stock-game.js';
import { bump } from '../achievements.js';
import { notifyUnlocks } from './achievements.js';
import { recordSnapshot, getHistory } from '../portfolio-history.js';
import { emitStockError, emitBalanceUpdate, emitToUser } from '../socket-utils.js';
import { getBalance } from '../currency.js';
import { getCharactersByNames } from '../character-store.js';
import { pushActivity } from '../activity-feed.js';
import { upsertQuotes, getCachedQuote } from '../stock-price-cache.js';
import { fetchSingleQuoteViaChart } from '../stock-providers/yahoo-chart.js';
import { fetchSingleQuoteViaStooq } from '../stock-providers/stooq.js';

const STOCK_TRADE_FEED_THRESHOLD = 1000; // SC traded

// Trades must execute at a real, current market price. A quote older than
// this is rejected (PRICE_STALE) instead of silently filling at yesterday's
// price — otherwise a player could trade against a market move the cached
// price hasn't caught up with.
const MAX_TRADE_PRICE_AGE_MS = 10 * 60 * 1000;

const stockQuoteCache = new Map(); // symbol -> { quote, ts }
// 5 min: long enough that we don't hammer Yahoo on every snapshot, short
// enough that prices stay reasonably fresh while the market is open.
const STOCK_QUOTE_CACHE_MS = 5 * 60 * 1000;

let _stockGameEnabled = true;
let _fetchTickerQuotes = null;
let _getYahooFinance = null;

function parseTradeAmount(rawAmount) {
    const amount = Number(rawAmount);
    if (!Number.isFinite(amount) || !Number.isInteger(amount) || amount <= 0) {
        return null;
    }
    return amount;
}

// asOf == null means the quote predates freshness stamping (or came from a
// legacy cache row) — treat as stale whenever an age bound is requested.
function isQuoteFreshEnough(quote, maxAgeMs, now = Date.now()) {
    if (!maxAgeMs) return true;
    return quote != null && typeof quote.asOf === 'number' && now - quote.asOf <= maxAgeMs;
}

async function getQuoteForSymbol(symbol, quotes, _getYahooFinance, { maxAgeMs = 0 } = {}) {
    let quote = quotes.find(q => q.symbol === symbol);
    if (quote && isQuoteFreshEnough(quote, maxAgeMs)) return quote;

    const cached = stockQuoteCache.get(symbol);
    if (cached && Date.now() - cached.ts < STOCK_QUOTE_CACHE_MS
        && isQuoteFreshEnough(cached.quote, maxAgeMs)) {
        return cached.quote;
    }

    // Provider cascade. yf.quote() is fastest when its crumb cookie is
    // hot (sub-100ms) so we try it first; when crumb gets 429'd on a
    // refresh it fails fast and we fall through to the alternatives.
    const providers = [];
    if (_getYahooFinance) {
        providers.push(async () => {
            const yf = await _getYahooFinance();
            const q = await yf.quote(symbol);
            if (!q || q.regularMarketPrice == null) throw new Error('no price');
            return {
                symbol: (q.symbol || symbol).replace('^', ''),
                name: q.shortName || q.longName || symbol,
                price: parseFloat(q.regularMarketPrice.toFixed(2)),
                currency: q.currency || 'USD',
            };
        });
    }
    providers.push(
        async () => {
            const q = await fetchSingleQuoteViaChart(symbol);
            return {
                symbol: (q.symbol || symbol).replace('^', ''),
                name: q.shortName || symbol,
                price: parseFloat(q.price.toFixed(2)),
                currency: q.currency || 'USD',
            };
        },
        async () => {
            const q = await fetchSingleQuoteViaStooq(symbol);
            return {
                symbol: (q.symbol || symbol).replace('^', ''),
                name: q.shortName || symbol,
                price: parseFloat(q.price.toFixed(2)),
                currency: q.currency || 'USD',
            };
        }
    );
    const providerErrors = [];
    for (const fn of providers) {
        try {
            quote = await fn();
            quote.asOf = Date.now();
            stockQuoteCache.set(symbol, { quote, ts: Date.now() });
            upsertQuotes([quote]).catch(() => {});
            return quote;
        } catch (e) {
            providerErrors.push(e.message);
        }
    }
    if (providerErrors.length > 0) {
        console.error(`[getQuoteForSymbol] all providers failed for ${symbol}: ${providerErrors.join(' | ')}`);
    }

    // Every live source failed — fall back to the persisted cache, but only
    // within the caller's freshness budget. Valuation callers (no maxAgeMs)
    // still get the stale price; trade callers get null instead.
    const persisted = getCachedQuote(symbol);
    if (persisted) {
        const fallback = { symbol: persisted.symbol, name: persisted.name, price: persisted.price, asOf: persisted.updatedAt ?? 0 };
        if (!isQuoteFreshEnough(fallback, maxAgeMs)) return null;
        stockQuoteCache.set(symbol, { quote: fallback, ts: Date.now() });
        return fallback;
    }

    return null;
}

export function registerStocksHandlers(socket, io, deps) {
    const { checkRateLimit, checkStockTradeCooldown, onlinePlayers, isStockGameEnabled, fetchTickerQuotes, getYahooFinance } = deps;
    _stockGameEnabled = isStockGameEnabled;
    _fetchTickerQuotes = fetchTickerQuotes;
    _getYahooFinance = getYahooFinance;

    const fetchMissingPrice = (sym) => getQuoteForSymbol(sym, [], _getYahooFinance);
    
    socket.on('stock-buy', async (data) => { try {
        if (!checkRateLimit(socket)) return;
        if (!_stockGameEnabled) {
            emitStockError(socket, 'GAME_DISABLED', 'Stock game is disabled by server config');
            return;
        }
        const player = onlinePlayers.get(socket.id);
        if (!player) return;
        if (!data || typeof data !== 'object') return;

        const symbol = typeof data.symbol === 'string'
            ? data.symbol.replace(/[^A-Z0-9.\-=]/g, '').slice(0, 12) : '';
        if (!symbol) {
            emitStockError(socket, 'INVALID_SYMBOL', 'Invalid symbol');
            return;
        }
        const amount = parseTradeAmount(data.amount);
        if (amount === null) {
            emitStockError(socket, 'INVALID_AMOUNT', 'Amount must be a positive integer');
            return;
        }
        if (!checkStockTradeCooldown(player.name)) {
            emitStockError(socket, 'TRADE_COOLDOWN', 'Trade requests are too fast');
            return;
        }

        // Get current price from ticker cache or live lookup. Trades demand
        // a quote no older than MAX_TRADE_PRICE_AGE_MS — no fill at a price
        // the real market has long left behind.
        const quotes = _fetchTickerQuotes ? await _fetchTickerQuotes() : [];
        const quote = await getQuoteForSymbol(symbol, quotes, _getYahooFinance, { maxAgeMs: MAX_TRADE_PRICE_AGE_MS });
        if (!quote) {
            emitStockError(socket, 'PRICE_UNAVAILABLE', 'No live price available right now. Try again in a moment.');
            return;
        }

        const result = await buyStock(player.name, quote.symbol, quote.price, amount);
        if (!result.ok) {
            emitStockError(socket, result.code || 'BUY_FAILED', result.error || 'Buy failed');
            return;
        }

        emitToUser(io, player.name, 'balance-update', { balance: result.newBalance });
        const snapshot = await getPortfolioSnapshot(player.name, quotes, fetchMissingPrice);
        socket.emit('stock-portfolio', snapshot);
        recordSnapshot(player.name, snapshot.totalValue, result.newBalance);
        socket.emit('stock-portfolio-history', getHistory(player.name));

        // Achievement bumps
        const unlocks = [];
        unlocks.push(...await bump(player.name, 'stock_buys', 1));
        unlocks.push(...await bump(player.name, 'stock_trades', 1));
        const netWorth = (snapshot.totalValue || 0) + (result.newBalance || 0);
        unlocks.push(...await bump(player.name, 'stock_max_net_worth', Math.floor(netWorth), 'max'));
        unlocks.push(...await bump(player.name, 'max_balance', Math.floor(result.newBalance), 'max'));
        notifyUnlocks(io, onlinePlayers, player.name, unlocks);

        // Activity feed: big buys (≥1000 SC) so the wider lobby sees plays.
        if (amount >= STOCK_TRADE_FEED_THRESHOLD) {
            pushActivity({
                type: 'stock_trade', player: player.name,
                text: `Bought ${amount} SC of ${quote.symbol}`,
                icon: '📈', color: amount >= 10000 ? 'magenta' : 'gold',
                meta: { game: 'stocks', side: 'buy', symbol: quote.symbol, amount, price: quote.price }
            });
        }
    } catch (err) { console.error('stock-buy error:', err.message); } });

    // --- Stock Game: Sell ---
    socket.on('stock-sell', async (data) => { try {
        if (!checkRateLimit(socket)) return;
        if (!_stockGameEnabled) {
            emitStockError(socket, 'GAME_DISABLED', 'Stock game is disabled by server config');
            return;
        }
        const player = onlinePlayers.get(socket.id);
        if (!player) return;
        if (!data || typeof data !== 'object') return;

        const symbol = typeof data.symbol === 'string'
            ? data.symbol.replace(/[^A-Z0-9.\-=]/g, '').slice(0, 12) : '';
        if (!symbol) {
            emitStockError(socket, 'INVALID_SYMBOL', 'Invalid symbol');
            return;
        }
        const amount = parseTradeAmount(data.amount);
        if (amount === null) {
            emitStockError(socket, 'INVALID_AMOUNT', 'Amount must be a positive integer');
            return;
        }
        if (!checkStockTradeCooldown(player.name)) {
            emitStockError(socket, 'TRADE_COOLDOWN', 'Trade requests are too fast');
            return;
        }

        const quotes = _fetchTickerQuotes ? await _fetchTickerQuotes() : [];
        const quote = await getQuoteForSymbol(symbol, quotes, _getYahooFinance, { maxAgeMs: MAX_TRADE_PRICE_AGE_MS });
        if (!quote) {
            emitStockError(socket, 'PRICE_UNAVAILABLE', 'No live price available right now. Try again in a moment.');
            return;
        }

        const result = await sellStock(player.name, quote.symbol, quote.price, amount);
        if (!result.ok) {
            emitStockError(socket, result.code || 'SELL_FAILED', result.error || 'Sell failed');
            return;
        }

        emitToUser(io, player.name, 'balance-update', { balance: result.newBalance });
        const snapshot = await getPortfolioSnapshot(player.name, quotes, fetchMissingPrice);
        socket.emit('stock-portfolio', snapshot);
        recordSnapshot(player.name, snapshot.totalValue, result.newBalance);
        socket.emit('stock-portfolio-history', getHistory(player.name));

        // Achievement bumps (sells count toward stock_trades and max_balance)
        const unlocks = [];
        unlocks.push(...await bump(player.name, 'stock_trades', 1));
        const netWorth = (snapshot.totalValue || 0) + (result.newBalance || 0);
        unlocks.push(...await bump(player.name, 'stock_max_net_worth', Math.floor(netWorth), 'max'));
        unlocks.push(...await bump(player.name, 'max_balance', Math.floor(result.newBalance), 'max'));
        notifyUnlocks(io, onlinePlayers, player.name, unlocks);

        // Activity feed: big sells (≥1000 SC) — symmetric with buys.
        if (amount >= STOCK_TRADE_FEED_THRESHOLD) {
            pushActivity({
                type: 'stock_trade', player: player.name,
                text: `Sold ${amount} SC of ${quote.symbol}`,
                icon: '📉', color: amount >= 10000 ? 'magenta' : 'gold',
                meta: { game: 'stocks', side: 'sell', symbol: quote.symbol, amount, price: quote.price }
            });
        }
    } catch (err) { console.error('stock-sell error:', err.message); } });

    // --- Stock Game: Get Portfolio ---
    socket.on('stock-get-portfolio', async () => { try {
        if (!checkRateLimit(socket)) return;
        if (!_stockGameEnabled) {
            emitStockError(socket, 'GAME_DISABLED', 'Stock game is disabled by server config');
            return;
        }
        const player = onlinePlayers.get(socket.id);
        if (!player) return;

        const quotes = _fetchTickerQuotes ? await _fetchTickerQuotes() : [];
        const snapshot = await getPortfolioSnapshot(player.name, quotes, fetchMissingPrice);
        socket.emit('stock-portfolio', snapshot);
        const cash = await getBalance(player.name);
        recordSnapshot(player.name, snapshot.totalValue, cash);
        socket.emit('stock-portfolio-history', getHistory(player.name));
    } catch (err) { console.error('stock-get-portfolio error:', err.message); } });

    // --- Stock Game: Get Portfolio History ---
    socket.on('stock-get-portfolio-history', async () => { try {
        if (!checkRateLimit(socket)) return;
        if (!_stockGameEnabled) return;
        const player = onlinePlayers.get(socket.id);
        if (!player) return;
        socket.emit('stock-portfolio-history', getHistory(player.name));
    } catch (err) { console.error('stock-get-portfolio-history error:', err.message); } });

    // --- Stock Game: Get All Players' Portfolios (Leaderboard) ---
    socket.on('stock-get-leaderboard', async () => { try {
        if (!checkRateLimit(socket)) return;
        if (!_stockGameEnabled) {
            emitStockError(socket, 'GAME_DISABLED', 'Stock game is disabled by server config');
            return;
        }
        const player = onlinePlayers.get(socket.id);
        if (!player) return;

        const quotes = _fetchTickerQuotes ? await _fetchTickerQuotes() : [];

        // Build name -> character lookup from online players
        const charByName = new Map();
        for (const p of onlinePlayers.values()) {
            if (p.name && p.character) charByName.set(p.name, p.character);
        }

        const leaderboard = await getLeaderboardSnapshot(quotes, fetchMissingPrice);

        // Collect names missing a character from online players
        const missingNames = leaderboard
            .filter(e => !charByName.has(e.name))
            .map(e => e.name);
        if (missingNames.length > 0) {
            const dbChars = await getCharactersByNames(missingNames);
            for (const [name, ch] of dbChars) charByName.set(name, ch);
        }

        for (const entry of leaderboard) {
            const ch = charByName.get(entry.name);
            if (ch) entry.character = ch;
        }
        socket.emit('stock-leaderboard', leaderboard);

        const performanceLeaderboard = await getTradePerformanceLeaderboard(quotes, fetchMissingPrice, leaderboard);
        for (const entry of performanceLeaderboard) {
            const ch = charByName.get(entry.name);
            if (ch) entry.character = ch;
        }
        socket.emit('stock-performance-leaderboard', performanceLeaderboard);
    } catch (err) { console.error('stock-get-leaderboard error:', err.message); } });
}

export function cleanupStockQuoteCache() {
    const now = Date.now();
    for (const [symbol, entry] of stockQuoteCache) {
        if (now - entry.ts > STOCK_QUOTE_CACHE_MS) stockQuoteCache.delete(symbol);
    }
}

// Test-only exports — freshness gating is unit-tested directly because the
// full socket round-trip needs live providers.
export {
    MAX_TRADE_PRICE_AGE_MS,
    isQuoteFreshEnough,
    getQuoteForSymbol,
};
