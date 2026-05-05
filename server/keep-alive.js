// Keep-alive pinger for Render free-tier hosting.
// Runs only when KEEP_ALIVE_URL (or RENDER_EXTERNAL_URL) is set, and only
// inside the active window 10:00–02:00 Europe/Berlin (handles DST automatically).

const INTERVAL_MS = 10 * 60 * 1000;
const TIMEZONE = 'Europe/Berlin';

function getBerlinHour() {
    const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: TIMEZONE,
        hour: '2-digit',
        hour12: false
    }).formatToParts(new Date());
    const hh = parts.find(p => p.type === 'hour')?.value ?? '0';
    return parseInt(hh, 10);
}

export function isInActiveWindow(hour) {
    // Active 10:00 (inclusive) through 01:59 (inclusive) Berlin time.
    return hour >= 10 || hour < 2;
}

let timerId = null;

export function startKeepAlive() {
    const url = process.env.KEEP_ALIVE_URL || process.env.RENDER_EXTERNAL_URL;
    if (!url) {
        console.log('Keep-alive disabled (no KEEP_ALIVE_URL / RENDER_EXTERNAL_URL set)');
        return;
    }
    const target = url.replace(/\/$/, '') + '/health';
    console.log(`✓ Keep-alive enabled: ${target} (Berlin 10:00–02:00, every ${INTERVAL_MS / 60000} min)`);

    const tick = async () => {
        const hour = getBerlinHour();
        if (!isInActiveWindow(hour)) return;
        try {
            const res = await fetch(target, { method: 'GET' });
            if (!res.ok) console.warn(`Keep-alive ping returned ${res.status}`);
        } catch (err) {
            console.warn('Keep-alive ping failed:', err.message);
        }
    };

    tick();
    timerId = setInterval(tick, INTERVAL_MS);
}

export function stopKeepAlive() {
    if (timerId) {
        clearInterval(timerId);
        timerId = null;
    }
}
