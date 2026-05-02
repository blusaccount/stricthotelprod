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
// ============================================================================

const VIDEO_CHANGE_COOLDOWN_MS = 3000;
const SEEK_COOLDOWN_MS = 250;
const ROOM_NAME = 'lobby-watchparty';

const state = {
    videoId: null,
    videoState: 'paused',  // 'playing' | 'paused'
    time: 0,
    updatedAt: Date.now(),
    setBy: null            // last player who changed the video
};

const videoChangeCooldown = new Map(); // socketId -> ts
const seekCooldown = new Map();        // socketId -> ts

function snapshot() {
    return {
        videoId: state.videoId,
        videoState: state.videoState,
        time: state.time,
        updatedAt: state.updatedAt,
        serverTime: Date.now(),
        setBy: state.setBy
    };
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

        state.videoId = id;
        state.videoState = 'playing';
        state.time = 0;
        state.updatedAt = now;
        state.setBy = player.name;

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
        io.to(ROOM_NAME).emit('lobby-wp-state-result', snapshot());
        console.log(`[LobbyWP] ${player.name} cleared the video`);
    } catch (err) { console.error('lobby-wp-clear error:', err.message); } });
}

export function cleanupLobbyWatchpartyOnDisconnect(socketId) {
    videoChangeCooldown.delete(socketId);
    seekCooldown.delete(socketId);
}
