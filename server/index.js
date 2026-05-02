import 'dotenv/config';
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
import { startMatchChecker, stopMatchChecker } from './lol-match-checker.js';

import { createAuthRouter, authMiddleware } from './routes/auth.js';
import turkishRouter from './routes/turkish.js';
import nostalgiaRouter from './routes/nostalgiabait.js';
import { createStocksRouter } from './routes/stocks.js';
import { startPeriodicCleanup } from './cleanup.js';

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

// Auth routes (login must be before auth middleware)
app.use(createAuthRouter());
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
    /^\/strict-club\//,
    /^\/nostalgiabait/,
    /^\/creator-test\.html$/
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

// ============== ROUTE MODULES ==============

const stocksRouter = createStocksRouter({ getYahooFinance, isStockGameEnabled: GAME_ENABLED });
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
});

// Graceful shutdown
function gracefulShutdown(signal) {
    console.log(`${signal} received, shutting down gracefully...`);
    stopMatchChecker();
    server.close(() => {
        console.log('Server closed');
        process.exit(0);
    });
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
