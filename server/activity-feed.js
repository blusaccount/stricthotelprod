// In-memory activity feed — newest-first ring buffer of recent
// "noteworthy" lobby events. Snapshot is sent to fresh sockets on join;
// new events are broadcast to everyone.

const FEED_LIMIT = 30;
const feed = [];           // newest first
let nextEventId = 1;

let mainIo = null;
export function attachActivityFeed(io) {
    mainIo = io;
}

/**
 * Push an event onto the feed and broadcast it. Drops to a no-op if the
 * io reference hasn't been attached yet (during boot or in tests).
 *
 * @param {Object}  event
 * @param {string}  event.type     — 'big_win' | 'achievement' | 'rain' | 'maexchen_win' | 'streak_milestone'
 * @param {string}  event.player   — player display name
 * @param {string}  event.text     — pre-rendered phrase (server-side trusted)
 * @param {string} [event.icon]    — emoji
 * @param {string} [event.color]   — 'gold' | 'magenta' | 'cyan' | 'win' | 'loss'
 * @param {Object} [event.meta]    — optional { game, amount, multiplier, … }
 */
export function pushActivity(event) {
    if (!event || !event.type || !event.player || !event.text) return;
    const e = {
        id: nextEventId++,
        type: String(event.type).slice(0, 32),
        player: String(event.player).slice(0, 24),
        text: String(event.text).slice(0, 160),
        icon: event.icon ? String(event.icon).slice(0, 4) : '✨',
        color: event.color ? String(event.color).slice(0, 12) : 'gold',
        at: Date.now(),
        meta: event.meta || null
    };
    feed.unshift(e);
    if (feed.length > FEED_LIMIT) feed.length = FEED_LIMIT;
    if (mainIo) mainIo.emit('activity-feed-event', e);
}

export function getActivityFeed() {
    return feed.slice();
}
