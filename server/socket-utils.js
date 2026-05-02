export function sanitizeName(name) {
    if (typeof name !== 'string') return '';
    const clean = name.replace(/[<>&"'/]/g, '').trim().slice(0, 20);
    if (clean.length < 2) return '';
    return clean;
}

export function validateCharacter(character) {
    if (!character || typeof character !== 'object') return null;
    // Limit character data size (~10KB JSON max, supports full 16x16 pixel grid + 64px dataURL)
    const json = JSON.stringify(character);
    if (json.length > 10240) return null;
    // Only allow expected keys
    const allowed = { pixels: true, dataURL: true };
    const clean = {};
    for (const key of Object.keys(character)) {
        if (allowed[key]) clean[key] = character[key];
    }
    // Validate dataURL if present
    if (clean.dataURL && (typeof clean.dataURL !== 'string' || !clean.dataURL.startsWith('data:image/'))) {
        delete clean.dataURL;
    }
    // Reject empty character objects (no pixels or dataURL)
    if (!clean.pixels && !clean.dataURL) return null;
    return clean;
}

export function validateRoomCode(code) {
    if (typeof code !== 'string') return '';
    return code.replace(/[^A-Z0-9]/g, '').slice(0, 4);
}

export function validateGameType(gameType) {
    if (typeof gameType !== 'string') return 'maexchen';
    const allowed = ['maexchen', 'lobby', 'watchparty', 'stocks', 'strictbrain', 'lol-betting', 'loop-machine', 'shop', 'strictly7s', 'tierlist', 'casino', 'plinko', 'crash', 'achievements', 'blackjack', 'roulette'];
    const clean = gameType.replace(/[^a-z-]/g, '').slice(0, 20);
    return allowed.includes(clean) ? clean : 'maexchen';
}

export function validateYouTubeId(videoId) {
    if (typeof videoId !== 'string') return '';
    return videoId.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 11);
}

// Canonical bet ladder used by every casino game (Strictly7s, Plinko, Crash,
// Blackjack, Roulette). Centralised so a balance change only happens here.
export const STANDARD_CASINO_BETS = [5, 10, 25, 50, 100, 500];

// Returns the validated integer bet, or null if the input is not in the
// allowed set. Pass a custom array as the second arg for non-standard ladders.
export function validateCasinoBet(raw, allowed = STANDARD_CASINO_BETS) {
    const n = Number(raw);
    if (!Number.isInteger(n) || !allowed.includes(n)) return null;
    return n;
}

export function normalizePoint(point) {
    if (!point || typeof point !== 'object') return null;
    const x = Number(point.x);
    const y = Number(point.y);
    if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
    if (x < 0 || x > 1 || y < 0 || y > 1) return null;
    return { x, y };
}

export function sanitizeColor(color) {
    if (typeof color !== 'string') return '#000000';
    return /^#[0-9a-fA-F]{6}$/.test(color) ? color : '#000000';
}

export function sanitizeSize(size) {
    const n = Number(size);
    if (!Number.isFinite(n)) return 4;
    return Math.max(1, Math.min(18, Math.round(n)));
}

export function emitStockError(socket, code, message) {
    socket.emit('stock-error', {
        code,
        message,
        // Backward compatibility for clients reading `error`
        error: message
    });
}

// Per-user Socket.IO room name. Each socket joins this on register-player
// (see handlers/currency.js). Lets us fan out events to every socket of the
// same player — important since the shell + an iframe game share one user
// but different sockets.
export function userRoom(name) {
    return name ? `user:${name}` : null;
}

// Emit an event to every socket of a given player (shell + iframe).
export function emitToUser(io, playerName, event, data) {
    const room = userRoom(playerName);
    if (!room || !io) return;
    io.to(room).emit(event, data);
}

// Legacy signature — still used by maexchen/lol-betting/brain-versus where
// the caller has only the socketId. Now also fans out to the user room when
// possible: pass an optional `playerName` (preferred) or fall back to the
// raw socketId.
export function emitBalanceUpdate(io, socketIdOrName, balance, opts) {
    if (balance === null || balance === undefined) return;
    const name = (opts && opts.playerName) || null;
    if (name) {
        io.to(userRoom(name)).emit('balance-update', { balance });
    } else {
        io.to(socketIdOrName).emit('balance-update', { balance });
    }
}

export function getSocketIp(socket) {
    const forwarded = socket?.handshake?.headers?.['x-forwarded-for'];
    if (typeof forwarded === 'string' && forwarded.trim()) {
        return forwarded.split(',')[0].trim();
    }
    return socket?.handshake?.address || socket?.request?.socket?.remoteAddress || socket?.conn?.remoteAddress || 'unknown';
}
