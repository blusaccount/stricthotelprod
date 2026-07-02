import { validateYouTubeId } from '../socket-utils.js';
import { pushActivity } from '../activity-feed.js';

// ============================================================================
// Lobby Watch Party — single shared room that lives on the lobby homepage.
//
// Anyone can paste a YouTube URL (or video ID) and play/pause/seek for
// everyone. State is in-memory (lost on restart, that's fine for a lobby).
//
// Per-socket cooldown for video changes (3s) so people can't spam-change
// each other's video. Play/pause/seek are unrestricted.
//
// Queue: anyone can append videos (capped, deduped). When the current video
// ends, clients report `lobby-wp-ended` and the server auto-advances to the
// next queued entry — the videoId echo makes duplicate reports from multiple
// clients idempotent (only the first one for the current video wins).
// ============================================================================

const VIDEO_CHANGE_COOLDOWN_MS = 3000;
const SEEK_COOLDOWN_MS = 250;
const QUEUE_ADD_COOLDOWN_MS = 1000;
const QUEUE_MAX = 20;
const ROOM_NAME = 'lobby-watchparty';

const state = {
    videoId: null,
    videoState: 'paused',  // 'playing' | 'paused'
    time: 0,
    updatedAt: Date.now(),
    setBy: null,           // last player who changed the video
    queue: []              // [{ queueId, videoId, addedBy, addedAt }]
};

let nextQueueId = 1;

const videoChangeCooldown = new Map(); // socketId -> ts
const seekCooldown = new Map();        // socketId -> ts
const queueAddCooldown = new Map();    // socketId -> ts

function snapshot() {
    return {
        videoId: state.videoId,
        videoState: state.videoState,
        time: state.time,
        updatedAt: state.updatedAt,
        serverTime: Date.now(),
        setBy: state.setBy,
        queue: state.queue.slice()
    };
}

function playVideo(videoId, setBy, now) {
    state.videoId = videoId;
    state.videoState = 'playing';
    state.time = 0;
    state.updatedAt = now;
    state.setBy = setBy;
}

// True if the id is currently playing or already waiting in the queue.
function isKnownVideo(videoId) {
    if (state.videoId === videoId) return true;
    return state.queue.some(e => e.videoId === videoId);
}

function broadcast(io) {
    io.to(ROOM_NAME).emit('lobby-wp-state-result', snapshot());
}

export function registerLobbyWatchpartyHandlers(socket, io, deps) {
    const { checkRateLimit, onlinePlayers } = deps;

    // Everyone in the lobby joins the lobby-watchparty room implicitly so we
    // can target broadcasts cheaply.
    socket.join(ROOM_NAME);

    socket.on('lobby-wp-state', () => { try {
        if (!checkRateLimit(socket, 5)) return;
        socket.emit('lobby-wp-state-result', snapshot());
    } catch (err) { console.error('lobby-wp-state error:', err.message); } });

    socket.on('lobby-wp-load', (data) => { try {
        if (!checkRateLimit(socket, 5)) return;
        const player = onlinePlayers.get(socket.id);
        if (!player || !player.name) return;

        const now = Date.now();
        const last = videoChangeCooldown.get(socket.id) || 0;
        if (now - last < VIDEO_CHANGE_COOLDOWN_MS) {
            socket.emit('lobby-wp-error', { message: 'Slow down — try again in a moment.' });
            return;
        }
        videoChangeCooldown.set(socket.id, now);

        const id = validateYouTubeId(data && data.videoId);
        if (!id || id.length !== 11) {
            socket.emit('lobby-wp-error', { message: 'Invalid YouTube video ID.' });
            return;
        }

        playVideo(id, player.name, now);

        io.to(ROOM_NAME).emit('lobby-wp-state-result', snapshot());

        pushActivity({
            type: 'lobby_watchparty', player: player.name,
            text: `Started a Watch Party video`,
            icon: '📺', color: 'cyan',
            meta: { videoId: id }
        });
        console.log(`[LobbyWP] ${player.name} loaded ${id}`);
    } catch (err) { console.error('lobby-wp-load error:', err.message); } });

    socket.on('lobby-wp-control', (data) => { try {
        if (!checkRateLimit(socket, 10)) return;
        const player = onlinePlayers.get(socket.id);
        if (!player || !player.name) return;
        if (!state.videoId) return;
        if (!data || typeof data !== 'object') return;

        const action = data.action;
        const t = Number(data.time);
        const time = Number.isFinite(t) && t >= 0 ? t : 0;
        const now = Date.now();

        if (action === 'play') {
            state.videoState = 'playing';
            state.time = time;
            state.updatedAt = now;
        } else if (action === 'pause') {
            state.videoState = 'paused';
            state.time = time;
            state.updatedAt = now;
        } else if (action === 'seek') {
            const last = seekCooldown.get(socket.id) || 0;
            if (now - last < SEEK_COOLDOWN_MS) return;
            seekCooldown.set(socket.id, now);
            state.time = time;
            state.updatedAt = now;
        } else {
            return;
        }

        // Broadcast to others; sender already mutated locally.
        socket.to(ROOM_NAME).emit('lobby-wp-state-result', snapshot());
    } catch (err) { console.error('lobby-wp-control error:', err.message); } });

    socket.on('lobby-wp-queue-add', (data) => { try {
        if (!checkRateLimit(socket, 5)) return;
        const player = onlinePlayers.get(socket.id);
        if (!player || !player.name) return;

        const now = Date.now();
        const last = queueAddCooldown.get(socket.id) || 0;
        if (now - last < QUEUE_ADD_COOLDOWN_MS) {
            socket.emit('lobby-wp-error', { message: 'Slow down — try again in a moment.' });
            return;
        }
        queueAddCooldown.set(socket.id, now);

        const id = validateYouTubeId(data && data.videoId);
        if (!id || id.length !== 11) {
            socket.emit('lobby-wp-error', { message: 'Invalid YouTube video ID.' });
            return;
        }
        if (isKnownVideo(id)) {
            socket.emit('lobby-wp-error', { message: 'Already playing or in the queue.' });
            return;
        }

        // Nothing playing → start right away instead of queueing into a void.
        if (!state.videoId) {
            videoChangeCooldown.set(socket.id, now);
            playVideo(id, player.name, now);
            io.to(ROOM_NAME).emit('lobby-wp-state-result', snapshot());
            pushActivity({
                type: 'lobby_watchparty', player: player.name,
                text: `Started a Watch Party video`,
                icon: '📺', color: 'cyan',
                meta: { videoId: id }
            });
            console.log(`[LobbyWP] ${player.name} queue-started ${id}`);
            return;
        }

        if (state.queue.length >= QUEUE_MAX) {
            socket.emit('lobby-wp-error', { message: 'Queue is full.' });
            return;
        }

        state.queue.push({ queueId: nextQueueId++, videoId: id, addedBy: player.name, addedAt: now });
        broadcast(io);
        console.log(`[LobbyWP] ${player.name} queued ${id} (${state.queue.length} in queue)`);
    } catch (err) { console.error('lobby-wp-queue-add error:', err.message); } });

    socket.on('lobby-wp-queue-remove', (data) => { try {
        if (!checkRateLimit(socket, 5)) return;
        const player = onlinePlayers.get(socket.id);
        if (!player || !player.name) return;
        if (!data || typeof data !== 'object') return;

        const queueId = Number(data.queueId);
        const idx = state.queue.findIndex(e => e.queueId === queueId);
        if (idx === -1) return;
        if (state.queue[idx].addedBy !== player.name) {
            socket.emit('lobby-wp-error', { message: 'You can only remove your own queue entries.' });
            return;
        }

        state.queue.splice(idx, 1);
        broadcast(io);
    } catch (err) { console.error('lobby-wp-queue-remove error:', err.message); } });

    socket.on('lobby-wp-next', () => { try {
        if (!checkRateLimit(socket, 5)) return;
        const player = onlinePlayers.get(socket.id);
        if (!player || !player.name) return;
        if (state.queue.length === 0) {
            socket.emit('lobby-wp-error', { message: 'Queue is empty.' });
            return;
        }

        const now = Date.now();
        const last = videoChangeCooldown.get(socket.id) || 0;
        if (now - last < VIDEO_CHANGE_COOLDOWN_MS) {
            socket.emit('lobby-wp-error', { message: 'Slow down — try again in a moment.' });
            return;
        }
        videoChangeCooldown.set(socket.id, now);

        const entry = state.queue.shift();
        playVideo(entry.videoId, entry.addedBy, now);
        io.to(ROOM_NAME).emit('lobby-wp-state-result', snapshot());
        console.log(`[LobbyWP] ${player.name} skipped to ${entry.videoId}`);
    } catch (err) { console.error('lobby-wp-next error:', err.message); } });

    // Clients report that the current video finished. The videoId echo makes
    // this idempotent across N watching clients: the first report advances the
    // queue (or pins the pause), every later one no longer matches state.
    socket.on('lobby-wp-ended', (data) => { try {
        if (!checkRateLimit(socket, 10)) return;
        const player = onlinePlayers.get(socket.id);
        if (!player || !player.name) return;

        const id = validateYouTubeId(data && data.videoId);
        if (!id || id !== state.videoId) return;
        if (state.videoState !== 'playing') return;

        const now = Date.now();
        if (state.queue.length > 0) {
            const entry = state.queue.shift();
            playVideo(entry.videoId, entry.addedBy, now);
            console.log(`[LobbyWP] auto-advance to ${entry.videoId} (queued by ${entry.addedBy})`);
        } else {
            // Pin "paused at duration" so heartbeats stop advancing
            // expectedTime past the end of the video.
            const t = Number(data && data.time);
            state.videoState = 'paused';
            state.time = Number.isFinite(t) && t >= 0 ? t : state.time;
            state.updatedAt = now;
        }
        io.to(ROOM_NAME).emit('lobby-wp-state-result', snapshot());
    } catch (err) { console.error('lobby-wp-ended error:', err.message); } });

    socket.on('lobby-wp-clear', () => { try {
        if (!checkRateLimit(socket, 3)) return;
        const player = onlinePlayers.get(socket.id);
        if (!player || !player.name) return;
        const now = Date.now();
        const last = videoChangeCooldown.get(socket.id) || 0;
        if (now - last < VIDEO_CHANGE_COOLDOWN_MS) return;
        videoChangeCooldown.set(socket.id, now);

        state.videoId = null;
        state.videoState = 'paused';
        state.time = 0;
        state.updatedAt = now;
        state.setBy = null;
        state.queue = [];
        io.to(ROOM_NAME).emit('lobby-wp-state-result', snapshot());
        console.log(`[LobbyWP] ${player.name} cleared the video and queue`);
    } catch (err) { console.error('lobby-wp-clear error:', err.message); } });
}

export function cleanupLobbyWatchpartyOnDisconnect(socketId) {
    videoChangeCooldown.delete(socketId);
    seekCooldown.delete(socketId);
    queueAddCooldown.delete(socketId);
}
