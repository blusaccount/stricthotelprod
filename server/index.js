import 'dotenv/config';
import './log-buffer.js'; // auto-installs console capture for /admin/logs
import crypto from 'node:crypto';
import express from 'express';
import session from 'express-session';
import http from 'http';
import { Server } from 'socket.io';
import path from 'path';
import { fileURLToPath } from 'url';

let yahooFinancePromise = null;
async function getYahooFinance() {
    if (!yahooFinancePromise) {
        yahooFinancePromise = import('yahoo-finance2').then(
            m => new m.default({ suppressNotices: ['yahooSurvey'] })
        );
    }
    return yahooFinancePromise;
}

import { rooms, onlinePlayers } from './room-manager.js';
import { registerSocketHandlers } from './socket-handlers.js';
import { initSchema } from './db.js';
import { loadCacheFromDb as loadStockPriceCache } from './stock-price-cache.js';
import { startMatchChecker, stopMatchChecker } from './lol-match-checker.js';

import { createAuthRouter, authMiddleware } from './routes/auth.js';
import { createDiscordRouter } from './routes/discord.js';
import turkishRouter from './routes/turkish.js';
import nostalgiaRouter from './routes/nostalgiabait.js';
import { createStocksRouter } from './routes/stocks.js';
import { getAllHeldSymbols } from './stock-game.js';
import { startPeriodicCleanup } from './cleanup.js';
import { startKeepAlive, stopKeepAlive } from './keep-alive.js';
import { getLogs, getStats } from './log-buffer.js';
import { releaseName } from './identity.js';
import { sanitizeName } from './socket-utils.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const rootDir = path.join(__dirname, '..');

const app = express();
const server = http.createServer(app);
const io = new Server(server);

const GAME_ENABLED = String(process.env.GAME_ENABLED ?? 'true').toLowerCase() !== 'false';

// Trust proxy (Render terminates SSL at the proxy layer)
app.set('trust proxy', 1);

// Session secret validation
if (!process.env.SESSION_SECRET && process.env.NODE_ENV === 'production') {
    console.error('ERROR: SESSION_SECRET environment variable is required in production');
    process.exit(1);
}
if (!process.env.SESSION_SECRET) {
    console.warn('⚠ SESSION_SECRET not set — using an insecure static dev fallback. Set SESSION_SECRET before deploying.');
}

// Session middleware
// Dev fallback is a stable string (not Math.random()) so sessions survive restarts in local dev.
// Production is guarded above; this fallback is never used when NODE_ENV=production.
app.use(session({
    secret: process.env.SESSION_SECRET || 'strict-hotel-dev-insecure-fallback',
    resave: false,
    saveUninitialized: false,
    cookie: {
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict'
    }
}));

// Body parser for login
app.use(express.json());

// Allow the app to be embedded as a Discord Activity iframe. Discord serves
// this page through a proxy at <client_id>.discordsays.com, so the framed
// origin never matches ours — frame-ancestors is the only thing that needs
// to allow it. No CSP existed before this, so nothing else is restricted.
app.use((req, res, next) => {
    res.setHeader(
        'Content-Security-Policy',
        "frame-ancestors 'self' https://discord.com https://*.discord.com https://*.discordsays.com"
    );
    next();
});

// Exposes the (public, non-secret) OAuth client ID to the browser so
// discord.html can construct `new DiscordSDK(clientId)` without hardcoding
// it into a static file.
app.get('/discord-config.js', (req, res) => {
    res.type('application/javascript');
    res.send(`window.DISCORD_CLIENT_ID = ${JSON.stringify(process.env.DISCORD_CLIENT_ID || '')};`);
});

// Auth routes (login must be before auth middleware)
app.use(createAuthRouter());
app.use(createDiscordRouter());
app.use(authMiddleware);

// Shell deep-link middleware. The lobby is now an SPA-style shell and any
// request that targets an app page (games, shop, contacts, etc.) without
// ?embed=1 should serve the shell HTML — the shell itself reads
// location.pathname and mounts the right iframe (loaded with ?embed=1, which
// bypasses this middleware and lets express.static serve the bare page).
const APP_ROUTES = [
    /^\/games\//,
    /^\/shop\.html$/,
    /^\/contacts\.html$/,
    /^\/achievements\.html$/,
    /^\/nostalgiabait/
];
app.use((req, res, next) => {
    if (req.method !== 'GET') return next();
    if (req.query.embed === '1') return next();
    if (!APP_ROUTES.some(re => re.test(req.path))) return next();
    // Only redirect HTML navigation — sub-resource fetches (CSS/JS/images)
    // come with text/css, image/*, etc. and should hit express.static.
    const accept = req.headers.accept || '';
    if (!accept.includes('text/html')) return next();
    // Iframe-context navigations (Sec-Fetch-Dest: iframe) should serve the
    // bare page directly. The iframe-helper inside the bare page handles
    // bubbling URL changes back to the parent shell via postMessage.
    if (req.headers['sec-fetch-dest'] === 'iframe') return next();
    res.sendFile(path.join(rootDir, 'public', 'index.html'));
});

// Static files
app.use(express.static(path.join(rootDir, 'public')));
app.use('/shared', express.static(path.join(rootDir, 'shared')));
app.use('/games', express.static(path.join(rootDir, 'games')));
app.use('/userinput', express.static(path.join(rootDir, 'userinput')));

// ============== HEALTH CHECK ==============

app.get('/health', (req, res) => {
    res.json({
        status: 'ok',
        uptime: process.uptime(),
        players: onlinePlayers.size,
        rooms: rooms.size
    });
});

// ============== ADMIN LOGS ==============

function tokensEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);
    if (aBuf.length !== bBuf.length) return false;
    return crypto.timingSafeEqual(aBuf, bBuf);
}

app.get('/admin/logs', (req, res) => {
    const expected = process.env.LOGS_TOKEN;
    if (!expected) return res.status(503).json({ error: 'LOGS_TOKEN not configured' });
    const provided = req.query.token || req.headers['x-logs-token'] || '';
    if (!tokensEqual(String(provided), expected)) {
        return res.status(401).json({ error: 'unauthorized' });
    }
    const since = parseInt(req.query.since, 10) || 0;
    const limit = Math.min(parseInt(req.query.limit, 10) || 500, 500);
    const level = req.query.level;
    const grep = req.query.grep;
    res.json({
        stats: getStats(),
        logs: getLogs({ since, level, grep, limit })
    });
});

// Release the TOFU owner binding on a player name. Escape hatch for the
// "my own name says taken" case: the owner token lives in localStorage, so
// clearing site data or switching devices strands the name under a token
// nobody holds. Clearing the binding lets the next register-player claim it.
// Guarded by the same operator token as /admin/logs.
app.post('/admin/release-name', async (req, res) => {
    const expected = process.env.LOGS_TOKEN;
    if (!expected) return res.status(503).json({ error: 'LOGS_TOKEN not configured' });
    const provided = req.query.token || req.headers['x-logs-token'] || '';
    if (!tokensEqual(String(provided), expected)) {
        return res.status(401).json({ error: 'unauthorized' });
    }
    const name = sanitizeName(req.body?.name);
    if (!name) return res.status(400).json({ error: 'invalid name' });
    const result = await releaseName(name);
    if (!result.ok) {
        const status = result.reason === 'not_found' ? 404 : 500;
        return res.status(status).json({ error: result.reason });
    }
    console.log(`Admin released owner token for name: ${name}`);
    res.json({ ok: true, name });
});

// ============== ROUTE MODULES ==============

const stocksRouter = createStocksRouter({
    getYahooFinance,
    isStockGameEnabled: GAME_ENABLED,
    // Held symbols join the ticker batch so non-listed positions are
    // priced via the same single yf.quote() call (vs. a per-symbol
    // fallback that would trigger Yahoo's crumb 429 from Render's IP).
    getExtraSymbols: () => getAllHeldSymbols().catch(() => []),
});
app.use(stocksRouter);
app.use(turkishRouter);
app.use(nostalgiaRouter);

// ============== SOCKET HANDLERS ==============

registerSocketHandlers(io, {
    fetchTickerQuotes: stocksRouter.fetchTickerQuotes,
    getYahooFinance,
    isStockGameEnabled: GAME_ENABLED
});

// ============== PERIODIC CLEANUP ==============

startPeriodicCleanup(io);

// ============== START SERVER ==============

// Initialise database schema before accepting connections
try {
    await initSchema();
} catch (err) {
    console.error('Database schema init error:', err);
}

// Warm stock price cache from DB so cold starts don't lose all prices
// when Yahoo Finance is rate-limited on the first request.
try {
    await loadStockPriceCache();
} catch (err) {
    console.error('Stock price cache load error:', err.message);
}

const PORT = process.env.PORT || 3000;
server.listen(PORT, async () => {
    console.log(`✓ StrictHotel Server: http://localhost:${PORT}`);
    if (!GAME_ENABLED) {
        console.log('⚠ GAME_ENABLED=false: stock game APIs and socket trades are disabled');
    }

    // Start LoL match checker
    try {
        startMatchChecker(io);
    } catch (err) {
        console.error('LoL Match Checker error:', err.message);
    }

    // Background-refresh the ticker every 5 min so the cache stays warm
    // even when no user has the Stocks tab open.
    if (GAME_ENABLED && stocksRouter.fetchTickerQuotes) {
        setInterval(() => {
            stocksRouter.fetchTickerQuotes().catch((err) => {
                console.error('[ticker bg-refresh]', err.message);
            });
        }, 5 * 60 * 1000);
        // Kick off one immediate fetch so the cache is hot before the first user opens Stocks
        stocksRouter.fetchTickerQuotes().catch(() => {});
    }

    // Self-ping to keep Render free-tier instance awake during 10:00–02:00 Berlin
    startKeepAlive();
});

// Graceful shutdown
function gracefulShutdown(signal) {
    console.log(`${signal} received, shutting down gracefully...`);
    stopMatchChecker();
    stopKeepAlive();
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
