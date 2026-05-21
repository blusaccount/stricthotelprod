import { Router } from 'express';
import crypto from 'node:crypto';

const LOGIN_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const LOGIN_RATE_LIMIT_MAX = 10;
const loginRateLimiter = new Map(); // ip -> { count, resetAt }

const PASSWORD = (process.env.SITE_PASSWORD || 'ADMIN').toLowerCase();

// Constant-time string compare so the login endpoint doesn't leak the
// secret one byte at a time via response timing.
function safeStringEqual(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const aBuf = Buffer.from(a);
    const bBuf = Buffer.from(b);
    if (aBuf.length !== bBuf.length) return false;
    return crypto.timingSafeEqual(aBuf, bBuf);
}

export function sanitizePlayerName(name) {
    if (typeof name !== 'string') return '';
    const clean = name.replace(/[<>&"'/]/g, '').trim().slice(0, 20);
    if (clean.length < 2) return '';
    return clean;
}

export function createAuthRouter() {
    const router = Router();

    // Login route (must be before auth middleware)
    router.post('/login', (req, res) => {
        const now = Date.now();
        const ip = req.ip || 'unknown';
        const entry = loginRateLimiter.get(ip);
        if (entry && now < entry.resetAt) {
            entry.count += 1;
            if (entry.count > LOGIN_RATE_LIMIT_MAX) {
                res.set('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
                return res.status(429).json({ success: false, message: 'Too many attempts. Try again soon.' });
            }
        } else {
            loginRateLimiter.set(ip, { count: 1, resetAt: now + LOGIN_RATE_LIMIT_WINDOW_MS });
        }

        // Reject non-string bodies before calling .toLowerCase() — otherwise
        // a bare `{}` or `42` makes the handler throw a 500 with a stack
        // trace in the response.
        const { password } = req.body || {};
        if (typeof password !== 'string') {
            return res.status(401).json({ success: false, message: 'Incorrect password' });
        }
        if (safeStringEqual(password.toLowerCase(), PASSWORD)) {
            req.session.authenticated = true;
            loginRateLimiter.delete(ip);
            res.json({ success: true });
        } else {
            res.status(401).json({ success: false, message: 'Incorrect password' });
        }
    });

    return router;
}

// Auth middleware - protect all routes except login
export function authMiddleware(req, res, next) {
    // Allow access to login page, health check, and static assets needed for login
    if (req.path === '/login.html' ||
        req.path === '/health' ||
        req.path === '/admin/logs' ||
        req.path.startsWith('/shared/css/') ||
        req.path.startsWith('/shared/fonts/')) {
        return next();
    }

    // Check if user is authenticated
    if (req.session.authenticated) {
        return next();
    }

    // Redirect to login page
    res.redirect('/login.html');
}
