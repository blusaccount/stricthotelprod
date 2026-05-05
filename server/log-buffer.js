// In-memory ring buffer that captures console output for /admin/logs.
// Auto-installs on import so logs from earliest module init are captured.

const MAX_LINES = 500;
const buffer = [];
let nextId = 1;

function safeStringify(v) {
    if (v === null || v === undefined) return String(v);
    if (typeof v === 'string') return v;
    if (v instanceof Error) return v.stack || `${v.name}: ${v.message}`;
    try {
        return JSON.stringify(v);
    } catch {
        return String(v);
    }
}

function push(level, args) {
    const line = {
        id: nextId++,
        ts: new Date().toISOString(),
        level,
        msg: args.map(safeStringify).join(' ')
    };
    buffer.push(line);
    if (buffer.length > MAX_LINES) buffer.shift();
}

let installed = false;
function install() {
    if (installed) return;
    installed = true;
    const origLog = console.log.bind(console);
    const origWarn = console.warn.bind(console);
    const origError = console.error.bind(console);
    console.log = (...args) => { push('log', args); origLog(...args); };
    console.warn = (...args) => { push('warn', args); origWarn(...args); };
    console.error = (...args) => { push('error', args); origError(...args); };
}

install();

export function getLogs({ since = 0, level, grep, limit = MAX_LINES } = {}) {
    let out = buffer;
    if (since) out = out.filter(l => l.id > since);
    if (level) out = out.filter(l => l.level === level);
    if (grep) {
        let re;
        try { re = new RegExp(grep, 'i'); } catch { return []; }
        out = out.filter(l => re.test(l.msg));
    }
    if (out.length > limit) out = out.slice(-limit);
    return out;
}

export function getStats() {
    return { total: nextId - 1, retained: buffer.length, max: MAX_LINES };
}
