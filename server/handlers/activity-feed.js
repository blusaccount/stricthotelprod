import { getActivityFeed } from '../activity-feed.js';

export function registerActivityFeedHandlers(socket, io, deps) {
    const { checkRateLimit } = deps;

    socket.on('activity-feed-snapshot', () => { try {
        if (!checkRateLimit(socket, 5)) return;
        socket.emit('activity-feed-snapshot-result', { events: getActivityFeed() });
    } catch (err) {
        console.error('activity-feed-snapshot error:', err.message);
    } });
}
