// Per-IP fixed-window rate limiter, mirroring the login limiter in
// routes/auth.js. Protects routes that fan out to a third-party API from a
// single logged-in user hammering that API from the server's shared egress IP
// (see issue #159).
//
// Every route family builds its own limiter, so their budgets stay separate.

const RATE_LIMIT_WINDOW_MS = 60 * 1000;

export function rateLimiter(maxPerWindow, { windowMs = RATE_LIMIT_WINDOW_MS } = {}) {
    const hits = new Map(); // ip -> { count, resetAt }
    return (req, res, next) => {
        const now = Date.now();
        const ip = req.ip || 'unknown';
        const entry = hits.get(ip);
        if (entry && now < entry.resetAt) {
            entry.count += 1;
            if (entry.count > maxPerWindow) {
                res.set('Retry-After', Math.ceil((entry.resetAt - now) / 1000));
                return res.status(429).json({ error: 'Too many requests. Try again soon.' });
            }
        } else {
            hits.set(ip, { count: 1, resetAt: now + windowMs });
        }
        next();
    };
}
