import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    registerLobbyWatchpartyHandlers,
    cleanupLobbyWatchpartyOnDisconnect
} from '../handlers/lobby-watchparty.js';

function createMockSocket(id = 'sock-A') {
    const handlers = {};
    const toEmit = vi.fn();
    return {
        id,
        handlers,
        toEmit,
        on(event, fn) { handlers[event] = fn; },
        emit: vi.fn(),
        join: vi.fn(),
        to: vi.fn(() => ({ emit: toEmit })),
        trigger(event, data) { handlers[event]?.(data); }
    };
}

function createMockIo() {
    const roomEmit = vi.fn();
    return {
        roomEmit,
        to: vi.fn(() => ({ emit: roomEmit }))
    };
}

function setup(socketId = 'sock-A') {
    const socket = createMockSocket(socketId);
    const io = createMockIo();
    const onlinePlayers = new Map();
    onlinePlayers.set(socket.id, { name: 'Alice' });
    const checkRateLimit = vi.fn(() => true);
    registerLobbyWatchpartyHandlers(socket, io, { checkRateLimit, onlinePlayers });
    return { socket, io, onlinePlayers, checkRateLimit };
}

// Module state survives between tests, so we explicitly reset by clearing
// the loaded video at the start of each test that depends on a clean slate.
function clearVideo(env) {
    env.socket.trigger('lobby-wp-clear');
    env.io.roomEmit.mockClear();
    env.socket.toEmit.mockClear();
    env.socket.emit.mockClear();
}

describe('lobby-watchparty handler', () => {
    let env;
    beforeEach(() => {
        env = setup();
        // Cleanup cooldowns so per-socket cooldown tests aren't carrying
        // state across tests.
        cleanupLobbyWatchpartyOnDisconnect(env.socket.id);
    });

    describe('snapshot / lobby-wp-state', () => {
        it('replies with serverTime and updatedAt fields', () => {
            env.socket.trigger('lobby-wp-state');
            const call = env.socket.emit.mock.calls.find(c => c[0] === 'lobby-wp-state-result');
            expect(call).toBeTruthy();
            const snap = call[1];
            expect(snap).toHaveProperty('serverTime');
            expect(snap).toHaveProperty('updatedAt');
            expect(typeof snap.serverTime).toBe('number');
            expect(typeof snap.updatedAt).toBe('number');
        });

        it('serverTime advances even when state has not changed', async () => {
            env.socket.trigger('lobby-wp-state');
            const first = env.socket.emit.mock.calls.find(c => c[0] === 'lobby-wp-state-result')[1];
            await new Promise(r => setTimeout(r, 5));
            env.socket.emit.mockClear();
            env.socket.trigger('lobby-wp-state');
            const second = env.socket.emit.mock.calls.find(c => c[0] === 'lobby-wp-state-result')[1];
            expect(second.serverTime).toBeGreaterThanOrEqual(first.serverTime);
            expect(second.updatedAt).toBe(first.updatedAt);
        });

        it('honors rate limit', () => {
            env.checkRateLimit.mockReturnValueOnce(false);
            env.socket.trigger('lobby-wp-state');
            expect(env.socket.emit).not.toHaveBeenCalled();
        });
    });

    describe('lobby-wp-load', () => {
        it('sets state and broadcasts to the room on a valid id', () => {
            env.socket.trigger('lobby-wp-load', { videoId: 'dQw4w9WgXcQ' });
            const call = env.io.roomEmit.mock.calls.find(c => c[0] === 'lobby-wp-state-result');
            expect(call).toBeTruthy();
            expect(call[1].videoId).toBe('dQw4w9WgXcQ');
            expect(call[1].videoState).toBe('playing');
            expect(call[1].time).toBe(0);
            expect(call[1].setBy).toBe('Alice');
        });

        it('rejects ids that strip to fewer than 11 chars', () => {
            env.socket.trigger('lobby-wp-load', { videoId: '@@@bad@@@' });
            const errCall = env.socket.emit.mock.calls.find(c => c[0] === 'lobby-wp-error');
            expect(errCall).toBeTruthy();
        });

        it('enforces video-change cooldown for the same socket', () => {
            env.socket.trigger('lobby-wp-load', { videoId: 'dQw4w9WgXcQ' });
            env.socket.emit.mockClear();
            env.socket.trigger('lobby-wp-load', { videoId: 'oHg5SJYRHA0' });
            const errCall = env.socket.emit.mock.calls.find(c => c[0] === 'lobby-wp-error');
            expect(errCall).toBeTruthy();
            expect(errCall[1].message).toMatch(/slow down/i);
        });
    });

    describe('lobby-wp-control', () => {
        beforeEach(() => {
            env.socket.trigger('lobby-wp-load', { videoId: 'dQw4w9WgXcQ' });
            env.io.roomEmit.mockClear();
            env.socket.toEmit.mockClear();
            // Move the load cooldown out of the way for clear-on-cleanup later.
            cleanupLobbyWatchpartyOnDisconnect(env.socket.id);
        });

        it('play updates videoState and updatedAt', async () => {
            // Force at least 1ms gap so updatedAt strictly advances.
            await new Promise(r => setTimeout(r, 2));
            env.socket.trigger('lobby-wp-control', { action: 'play', time: 12.5 });
            // Sender does NOT receive its own broadcast — verified via .to().
            expect(env.socket.to).toHaveBeenCalled();
            const broadcastCall = env.socket.toEmit.mock.calls.find(c => c[0] === 'lobby-wp-state-result');
            expect(broadcastCall).toBeTruthy();
            expect(broadcastCall[1].videoState).toBe('playing');
            expect(broadcastCall[1].time).toBe(12.5);
        });

        it('pause updates videoState', () => {
            env.socket.trigger('lobby-wp-control', { action: 'pause', time: 30 });
            const broadcastCall = env.socket.toEmit.mock.calls.find(c => c[0] === 'lobby-wp-state-result');
            expect(broadcastCall[1].videoState).toBe('paused');
            expect(broadcastCall[1].time).toBe(30);
        });

        it('seek honors 250ms cooldown', async () => {
            env.socket.trigger('lobby-wp-control', { action: 'seek', time: 10 });
            env.socket.toEmit.mockClear();
            env.socket.trigger('lobby-wp-control', { action: 'seek', time: 20 });
            // Second seek within 250ms is silently dropped.
            expect(env.socket.toEmit).not.toHaveBeenCalled();
            // After the cooldown, a seek goes through again.
            await new Promise(r => setTimeout(r, 260));
            env.socket.trigger('lobby-wp-control', { action: 'seek', time: 30 });
            expect(env.socket.toEmit).toHaveBeenCalled();
        });

        it('ignores unknown actions', () => {
            env.socket.trigger('lobby-wp-control', { action: 'rewind', time: 5 });
            expect(env.socket.toEmit).not.toHaveBeenCalled();
        });

        it('no-ops when no video is loaded', () => {
            clearVideo(env);
            env.socket.trigger('lobby-wp-control', { action: 'play', time: 10 });
            expect(env.socket.toEmit).not.toHaveBeenCalled();
        });
    });

    describe('queue', () => {
        // 11-char ids from the YouTube alphabet, distinct per index.
        const vid = (i) => `${String(i).padStart(2, '0')}aaaaaaaaa`;

        // Bypass the per-socket queue-add cooldown between adds.
        function queueAdd(id) {
            cleanupLobbyWatchpartyOnDisconnect(env.socket.id);
            env.socket.trigger('lobby-wp-queue-add', { videoId: id });
        }

        function lastSnapshot() {
            const calls = env.io.roomEmit.mock.calls.filter(c => c[0] === 'lobby-wp-state-result');
            return calls.length ? calls[calls.length - 1][1] : null;
        }

        beforeEach(() => {
            clearVideo(env);
            cleanupLobbyWatchpartyOnDisconnect(env.socket.id);
        });

        it('snapshot includes an empty queue by default', () => {
            env.socket.trigger('lobby-wp-state');
            const snap = env.socket.emit.mock.calls.find(c => c[0] === 'lobby-wp-state-result')[1];
            expect(snap.queue).toEqual([]);
        });

        it('queue-add with no video playing starts playback immediately', () => {
            env.socket.trigger('lobby-wp-queue-add', { videoId: 'dQw4w9WgXcQ' });
            const snap = lastSnapshot();
            expect(snap.videoId).toBe('dQw4w9WgXcQ');
            expect(snap.videoState).toBe('playing');
            expect(snap.setBy).toBe('Alice');
            expect(snap.queue).toEqual([]);
        });

        it('queue-add while a video plays appends to the queue', () => {
            queueAdd('dQw4w9WgXcQ');            // starts playing
            queueAdd(vid(1));                   // queued
            const snap = lastSnapshot();
            expect(snap.videoId).toBe('dQw4w9WgXcQ');
            expect(snap.queue).toHaveLength(1);
            expect(snap.queue[0].videoId).toBe(vid(1));
            expect(snap.queue[0].addedBy).toBe('Alice');
            expect(snap.queue[0].queueId).toEqual(expect.any(Number));
        });

        it('rejects duplicates of the playing video and queued entries', () => {
            queueAdd('dQw4w9WgXcQ');
            queueAdd(vid(1));
            env.socket.emit.mockClear();
            queueAdd('dQw4w9WgXcQ');            // currently playing
            queueAdd(vid(1));                   // already queued
            const errs = env.socket.emit.mock.calls.filter(c => c[0] === 'lobby-wp-error');
            expect(errs).toHaveLength(2);
            expect(errs[0][1].message).toMatch(/already/i);
        });

        it('enforces the per-socket add cooldown', () => {
            queueAdd('dQw4w9WgXcQ');
            // No cooldown cleanup here — second add within 1s must fail.
            env.socket.emit.mockClear();
            env.socket.trigger('lobby-wp-queue-add', { videoId: vid(1) });
            const err = env.socket.emit.mock.calls.find(c => c[0] === 'lobby-wp-error');
            expect(err).toBeTruthy();
            expect(err[1].message).toMatch(/slow down/i);
        });

        it('caps the queue at 20 entries', () => {
            queueAdd('dQw4w9WgXcQ');
            for (let i = 1; i <= 20; i++) queueAdd(vid(i));
            expect(lastSnapshot().queue).toHaveLength(20);
            env.socket.emit.mockClear();
            queueAdd(vid(21));
            const err = env.socket.emit.mock.calls.find(c => c[0] === 'lobby-wp-error');
            expect(err[1].message).toMatch(/full/i);
            expect(lastSnapshot().queue).toHaveLength(20);
        });

        it('queue-remove lets the owner remove their entry', () => {
            queueAdd('dQw4w9WgXcQ');
            queueAdd(vid(1));
            const entry = lastSnapshot().queue[0];
            env.socket.trigger('lobby-wp-queue-remove', { queueId: entry.queueId });
            expect(lastSnapshot().queue).toEqual([]);
        });

        it('queue-remove rejects non-owners', () => {
            queueAdd('dQw4w9WgXcQ');
            queueAdd(vid(1));
            const entry = lastSnapshot().queue[0];

            const bob = createMockSocket('sock-B');
            const bobPlayers = new Map([['sock-B', { name: 'Bob' }]]);
            registerLobbyWatchpartyHandlers(bob, env.io, {
                checkRateLimit: vi.fn(() => true), onlinePlayers: bobPlayers
            });
            bob.trigger('lobby-wp-queue-remove', { queueId: entry.queueId });

            const err = bob.emit.mock.calls.find(c => c[0] === 'lobby-wp-error');
            expect(err[1].message).toMatch(/own/i);
            expect(lastSnapshot().queue).toHaveLength(1);
        });

        it('ended advances to the next queued video', () => {
            queueAdd('dQw4w9WgXcQ');
            queueAdd(vid(1));
            env.socket.trigger('lobby-wp-ended', { videoId: 'dQw4w9WgXcQ', time: 213 });
            const snap = lastSnapshot();
            expect(snap.videoId).toBe(vid(1));
            expect(snap.videoState).toBe('playing');
            expect(snap.time).toBe(0);
            expect(snap.setBy).toBe('Alice');
            expect(snap.queue).toEqual([]);
        });

        it('ended with empty queue pins paused-at-duration', () => {
            queueAdd('dQw4w9WgXcQ');
            env.socket.trigger('lobby-wp-ended', { videoId: 'dQw4w9WgXcQ', time: 213 });
            const snap = lastSnapshot();
            expect(snap.videoId).toBe('dQw4w9WgXcQ');
            expect(snap.videoState).toBe('paused');
            expect(snap.time).toBe(213);
        });

        it('ended for a stale videoId is ignored (multi-client dedupe)', () => {
            queueAdd('dQw4w9WgXcQ');
            queueAdd(vid(1));
            env.socket.trigger('lobby-wp-ended', { videoId: 'dQw4w9WgXcQ', time: 213 });
            env.io.roomEmit.mockClear();
            // Second client reports the same ended video after the advance.
            env.socket.trigger('lobby-wp-ended', { videoId: 'dQw4w9WgXcQ', time: 213 });
            expect(env.io.roomEmit).not.toHaveBeenCalled();
        });

        it('duplicate ended reports while paused are ignored', () => {
            queueAdd('dQw4w9WgXcQ');
            env.socket.trigger('lobby-wp-ended', { videoId: 'dQw4w9WgXcQ', time: 213 });
            env.io.roomEmit.mockClear();
            env.socket.trigger('lobby-wp-ended', { videoId: 'dQw4w9WgXcQ', time: 213 });
            expect(env.io.roomEmit).not.toHaveBeenCalled();
        });

        it('next skips to the queued video', () => {
            queueAdd('dQw4w9WgXcQ');
            queueAdd(vid(1));
            cleanupLobbyWatchpartyOnDisconnect(env.socket.id); // bypass change cooldown
            env.socket.trigger('lobby-wp-next');
            const snap = lastSnapshot();
            expect(snap.videoId).toBe(vid(1));
            expect(snap.videoState).toBe('playing');
            expect(snap.queue).toEqual([]);
        });

        it('next errors when the queue is empty', () => {
            queueAdd('dQw4w9WgXcQ');
            cleanupLobbyWatchpartyOnDisconnect(env.socket.id);
            env.socket.emit.mockClear();
            env.socket.trigger('lobby-wp-next');
            const err = env.socket.emit.mock.calls.find(c => c[0] === 'lobby-wp-error');
            expect(err[1].message).toMatch(/empty/i);
        });

        it('next honors the video-change cooldown', () => {
            queueAdd('dQw4w9WgXcQ');
            queueAdd(vid(1));
            queueAdd(vid(2));
            cleanupLobbyWatchpartyOnDisconnect(env.socket.id);
            env.socket.trigger('lobby-wp-next');
            env.socket.emit.mockClear();
            env.socket.trigger('lobby-wp-next'); // within 3s → blocked
            const err = env.socket.emit.mock.calls.find(c => c[0] === 'lobby-wp-error');
            expect(err[1].message).toMatch(/slow down/i);
            expect(lastSnapshot().queue).toHaveLength(1);
        });

        it('clear wipes the queue too', () => {
            queueAdd('dQw4w9WgXcQ');
            queueAdd(vid(1));
            cleanupLobbyWatchpartyOnDisconnect(env.socket.id);
            env.socket.trigger('lobby-wp-clear');
            const snap = lastSnapshot();
            expect(snap.videoId).toBeNull();
            expect(snap.queue).toEqual([]);
        });
    });

    describe('expectedTime contract', () => {
        // Mirror of the formula in public/lobby-watchparty.js:expectedTime.
        // Kept here so the contract is testable; if the client formula
        // changes, this test must change with it.
        function expectedTime(state) {
            if (!state || state.time == null) return 0;
            if (state.videoState !== 'playing') return state.time;
            const serverTime = state.serverTime || state.updatedAt || 0;
            const updatedAt = state.updatedAt || serverTime;
            const elapsed = Math.max(0, (serverTime - updatedAt) / 1000);
            return state.time + elapsed;
        }

        it('returns state.time exactly when paused (no extrapolation)', () => {
            const t = expectedTime({
                videoState: 'paused', time: 42,
                updatedAt: 1000, serverTime: 999999
            });
            expect(t).toBe(42);
        });

        it('extrapolates from serverTime - updatedAt when playing', () => {
            const t = expectedTime({
                videoState: 'playing', time: 10,
                updatedAt: 1000, serverTime: 6000  // 5s elapsed on server
            });
            expect(t).toBe(15);
        });

        it('clamps negative server-clock anomalies to 0 elapsed', () => {
            const t = expectedTime({
                videoState: 'playing', time: 10,
                updatedAt: 6000, serverTime: 1000  // clock went backward
            });
            expect(t).toBe(10);
        });

        it('returns 0 when state is missing', () => {
            expect(expectedTime(null)).toBe(0);
            expect(expectedTime({})).toBe(0);
        });
    });
});
