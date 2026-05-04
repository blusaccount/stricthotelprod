// ============================================================================
// LOBBY WATCH PARTY — public shared YouTube player on the homepage.
//
// State authority: server. Anyone can paste a URL or hit play/pause; the
// server snapshots the state and broadcasts to all lobby clients. Drift
// correction uses the server's `serverTime` field on each state result.
// ============================================================================

(function () {
    'use strict';

    if (!window.StrictHotelLobby || !window.StrictHotelLobby.socket) return;
    const socket = window.StrictHotelLobby.socket;

    const SYNC_DRIFT_THRESHOLD_S = 1.5;     // seek if local drifts more than this
    const HEARTBEAT_MS = 3 * 60 * 1000;     // keep server warm while video runs

    let player = null;            // YT.Player instance
    let ytReady = false;
    let suppressEvents = false;   // ignore YT state events while applying remote state
    let currentVideoId = null;
    let lastServerState = null;
    let heartbeatTimer = null;

    const $ = (id) => document.getElementById(id);
    const containerEl = $('lobby-wp-section');
    if (!containerEl) return;
    const playerWrap = $('lobby-wp-player-wrap');
    const placeholder = $('lobby-wp-placeholder');
    const urlInput = $('lobby-wp-url');
    const loadBtn = $('lobby-wp-load');
    const clearBtn = $('lobby-wp-clear');
    const statusEl = $('lobby-wp-status');
    const nowPlaying = $('lobby-wp-now');

    // --- Mini player (rail) — portal pattern ---
    // The playerWrap lives permanently at body level with position:fixed.
    // We never re-parent it (which avoids the Chromium iframe-reload-on-move
    // quirk that would kill the YT.Player instance and audio playback).
    // Instead we just toggle which slot it visually overlays by reading the
    // slot's getBoundingClientRect and applying it to the wrap's CSS.
    const homeSlot = $('lobby-wp-home-slot');
    const miniBox = $('lobby-wp-mini');
    const miniSlot = $('lobby-wp-mini-slot');
    const miniBackBtn = $('lobby-wp-mini-back');
    let inMiniMode = false;
    let activeSlot = homeSlot;
    let portalRafId = null;

    function repositionPortal() {
        portalRafId = null;
        if (!playerWrap) return;
        if (!currentVideoId || !activeSlot) {
            playerWrap.style.display = 'none';
            return;
        }
        const rect = activeSlot.getBoundingClientRect();
        if (rect.width <= 0 || rect.height <= 0) {
            // Slot is hidden / collapsed — keep wrap hidden so it doesn't
            // briefly flash at (0,0).
            playerWrap.style.display = 'none';
            return;
        }
        playerWrap.style.display = 'block';
        playerWrap.style.top = rect.top + 'px';
        playerWrap.style.left = rect.left + 'px';
        playerWrap.style.width = rect.width + 'px';
        playerWrap.style.height = rect.height + 'px';
    }

    function schedulePortalReposition() {
        if (portalRafId != null) return;
        portalRafId = requestAnimationFrame(repositionPortal);
    }

    function enterMiniMode() {
        if (!playerWrap || !miniBox || !miniSlot) return;
        if (!currentVideoId) return;
        miniBox.hidden = false;
        activeSlot = miniSlot;
        inMiniMode = true;
        repositionPortal();
    }

    function exitMiniMode() {
        if (!playerWrap || !miniBox) return;
        miniBox.hidden = true;
        activeSlot = homeSlot;
        inMiniMode = false;
        repositionPortal();
    }

    if (miniBackBtn) {
        miniBackBtn.addEventListener('click', () => {
            if (window.StrictHotelShell && typeof window.StrictHotelShell.navigate === 'function') {
                window.StrictHotelShell.navigate('/');
            }
        });
    }

    // Keep the portal aligned with the active slot whenever layout changes.
    window.addEventListener('resize', schedulePortalReposition);
    window.addEventListener('scroll', schedulePortalReposition, true);
    if (window.ResizeObserver) {
        const ro = new ResizeObserver(schedulePortalReposition);
        if (homeSlot) ro.observe(homeSlot);
        if (miniSlot) ro.observe(miniSlot);
    }

    function escapeHtml(str) {
        return String(str == null ? '' : str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function setStatus(text, kind) {
        if (!statusEl) return;
        statusEl.textContent = text || '';
        statusEl.dataset.kind = kind || '';
    }

    // --- Extract video ID from a URL or raw ID ---
    function extractVideoId(input) {
        if (!input || typeof input !== 'string') return '';
        input = input.trim();
        if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;
        try {
            const url = new URL(input);
            if (url.searchParams.has('v')) {
                const v = url.searchParams.get('v');
                if (/^[a-zA-Z0-9_-]{11}$/.test(v)) return v;
            }
            if (url.hostname === 'youtu.be') {
                const id = url.pathname.replace(/^\//, '').split('/')[0];
                if (/^[a-zA-Z0-9_-]{11}$/.test(id)) return id;
            }
            const embed = url.pathname.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
            if (embed) return embed[1];
            const shorts = url.pathname.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
            if (shorts) return shorts[1];
        } catch (_) {}
        return '';
    }

    // --- Load YouTube IFrame API once ---
    function loadYouTubeAPI() {
        if (window.YT && window.YT.Player) return Promise.resolve();
        return new Promise((resolve) => {
            // If a previous loader is in-flight, chain onto it.
            const existing = document.querySelector('script[src*="youtube.com/iframe_api"]');
            if (existing) {
                const prev = window.onYouTubeIframeAPIReady;
                window.onYouTubeIframeAPIReady = function () {
                    if (typeof prev === 'function') prev();
                    resolve();
                };
                return;
            }
            const tag = document.createElement('script');
            tag.src = 'https://www.youtube.com/iframe_api';
            document.head.appendChild(tag);
            const prev = window.onYouTubeIframeAPIReady;
            window.onYouTubeIframeAPIReady = function () {
                if (typeof prev === 'function') prev();
                resolve();
            };
        });
    }

    function ensurePlayer(videoId, callback) {
        currentVideoId = videoId;
        if (placeholder) placeholder.style.display = 'none';
        if (!playerWrap) return;
        // Always tear down and rebuild on video change.
        playerWrap.innerHTML = '<div id="lobby-wp-player"></div>';
        loadYouTubeAPI().then(() => {
            // eslint-disable-next-line no-undef
            player = new YT.Player('lobby-wp-player', {
                videoId,
                width: '100%',
                height: '100%',
                playerVars: {
                    autoplay: 0,
                    controls: 1,
                    modestbranding: 1,
                    rel: 0,
                    fs: 1,
                    enablejsapi: 1,
                    origin: window.location.origin
                },
                events: {
                    onReady: () => {
                        ytReady = true;
                        // Mute the lobby ambience as soon as a video is loaded.
                        autoMuteAmbience();
                        // Now that we have a video, the portal can become
                        // visible and snap to the active slot.
                        repositionPortal();
                        if (typeof callback === 'function') callback();
                    },
                    onStateChange: onPlayerStateChange
                }
            });
        });
    }

    // Debounce play/pause emissions. YT often fires a transient PAUSED
    // between BUFFERING and PLAYING during network hiccups, with a stale
    // currentTime. If we emit that, every other client seeks backwards.
    // By delaying the emit ~400ms and replacing pending state on rapid
    // transitions, the BUFFERING→PAUSED→PLAYING cascade collapses to a
    // single PLAYING with the settled (correct) currentTime.
    const STATE_DEBOUNCE_MS = 400;
    let pendingStateAction = null;
    let pendingStateTimer = null;

    function flushPendingState() {
        pendingStateTimer = null;
        const action = pendingStateAction;
        pendingStateAction = null;
        if (!action || !player) return;
        if (suppressEvents) return;
        try {
            const time = player.getCurrentTime ? player.getCurrentTime() : 0;
            socket.emit('lobby-wp-control', { action, time });
            if (action === 'play') startHeartbeat();
        } catch (_) {}
    }

    function onPlayerStateChange(event) {
        if (suppressEvents || !player) return;
        const YTState = window.YT && window.YT.PlayerState;
        if (!YTState) return;
        // ENDED → don't emit (YT auto-resets currentTime to 0 around this,
        // which would corrupt server state.time). UNSTARTED / CUED →
        // pre-playback transitions, irrelevant. BUFFERING → wait it out.
        if (event.data !== YTState.PLAYING && event.data !== YTState.PAUSED) {
            return;
        }
        pendingStateAction = event.data === YTState.PLAYING ? 'play' : 'pause';
        if (pendingStateTimer) clearTimeout(pendingStateTimer);
        pendingStateTimer = setTimeout(flushPendingState, STATE_DEBOUNCE_MS);
    }

    function expectedTime(serverState) {
        if (!serverState || serverState.time == null) return 0;
        if (serverState.videoState !== 'playing') return serverState.time;
        // Use ONLY server-side timestamps (serverTime - updatedAt) to avoid
        // any client/server wall-clock skew. Both fields are set on the
        // server so this delta is purely how long the video had been
        // playing on the server when the snapshot was created. Network
        // latency adds <500ms, which is below the sync drift threshold and
        // not worth correcting (mixing in client Date.now() reintroduces
        // skew bugs that produced random ~10s backward seeks for users
        // whose clocks are a few seconds behind the server).
        const serverTime = serverState.serverTime || serverState.updatedAt || 0;
        const updatedAt = serverState.updatedAt || serverTime;
        const elapsed = Math.max(0, (serverTime - updatedAt) / 1000);
        return serverState.time + elapsed;
    }

    function applyServerState(s) {
        lastServerState = s;
        // No video → tear down.
        if (!s || !s.videoId) {
            if (placeholder) placeholder.style.display = '';
            if (playerWrap) playerWrap.innerHTML = '';
            player = null;
            currentVideoId = null;
            ytReady = false;
            stopHeartbeat();
            if (nowPlaying) nowPlaying.textContent = '';
            setStatus('No video loaded — paste a YouTube link to start.', 'idle');
            // Hide mini box and the portal wrap.
            exitMiniMode();
            repositionPortal();
            return;
        }

        // Video changed: rebuild player, then continue applying state.
        if (s.videoId !== currentVideoId) {
            ensurePlayer(s.videoId, () => {
                applyPlaybackState(s);
                // If the user is not on the home route, immediately move
                // the freshly-built player into the rail mini slot.
                if (window.StrictHotelShell &&
                    window.StrictHotelShell.getCurrentPath() !== '/') {
                    enterMiniMode();
                }
            });
            if (nowPlaying && s.setBy) {
                nowPlaying.innerHTML = `Now playing — set by <strong>${escapeHtml(s.setBy)}</strong>`;
            }
            setStatus('Loading video…', 'loading');
            return;
        }

        applyPlaybackState(s);
    }

    function applyPlaybackState(s) {
        if (!player || !ytReady) return;
        const target = expectedTime(s);
        try {
            const localTime = player.getCurrentTime ? player.getCurrentTime() : 0;
            const drift = Math.abs(localTime - target);
            suppressEvents = true;
            if (drift > SYNC_DRIFT_THRESHOLD_S) {
                player.seekTo(target, true);
            }
            const YTState = window.YT && window.YT.PlayerState;
            if (s.videoState === 'playing') {
                if (YTState && player.getPlayerState && player.getPlayerState() !== YTState.PLAYING) {
                    player.playVideo();
                }
                startHeartbeat();
                setStatus(`▶ Playing · synced ±${drift.toFixed(1)}s`, 'playing');
            } else {
                if (YTState && player.getPlayerState && player.getPlayerState() !== YTState.PAUSED) {
                    player.pauseVideo();
                }
                setStatus(`⏸ Paused at ${formatTime(s.time)}`, 'paused');
            }
        } finally {
            // Release after enough time for YT to actually settle into the
            // requested state. seekTo+playVideo are async and can take
            // 1-2s on slow connections; releasing too early lets our own
            // programmatic state changes echo back to the server with
            // stale times, which other clients then seek to (visible as
            // a brief backward jump).
            setTimeout(() => { suppressEvents = false; }, 1500);
        }
    }

    function formatTime(s) {
        if (!Number.isFinite(s) || s < 0) return '0:00';
        const m = Math.floor(s / 60);
        const sec = Math.floor(s % 60);
        return `${m}:${sec.toString().padStart(2, '0')}`;
    }

    function startHeartbeat() {
        if (heartbeatTimer) return;
        heartbeatTimer = setInterval(() => {
            if (currentVideoId) socket.emit('lobby-wp-state');
        }, HEARTBEAT_MS);
    }
    function stopHeartbeat() {
        if (heartbeatTimer) { clearInterval(heartbeatTimer); heartbeatTimer = null; }
    }

    // --- Auto-mute the lobby ambience when video plays ---
    function autoMuteAmbience() {
        try {
            // Ambience exposes localStorage key 'ambience-muted' + a button #ambience-mute.
            // Click the mute button only if it's not already muted, so the visual UI stays in sync.
            if (localStorage.getItem('ambience-muted') === 'true') return;
            const btn = document.getElementById('ambience-mute');
            if (btn) btn.click();
        } catch (_) {}
    }

    // --- UI wiring ---
    if (loadBtn && urlInput) {
        const submit = () => {
            const id = extractVideoId(urlInput.value);
            if (!id) {
                setStatus('Could not parse a YouTube ID from that link.', 'error');
                return;
            }
            socket.emit('lobby-wp-load', { videoId: id });
            urlInput.value = '';
            setStatus('Loading video…', 'loading');
        };
        loadBtn.addEventListener('click', submit);
        urlInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); submit(); }
        });
    }
    if (clearBtn) {
        clearBtn.addEventListener('click', () => {
            socket.emit('lobby-wp-clear');
        });
    }

    // --- Server events ---
    socket.on('lobby-wp-state-result', (s) => {
        if (!s) return;
        applyServerState(s);
    });
    socket.on('lobby-wp-error', (data) => {
        if (data && data.message) setStatus(data.message, 'error');
    });

    // Request state on connect so a fresh tab catches up.
    function requestState() { socket.emit('lobby-wp-state'); }
    socket.on('connect', () => { setTimeout(requestState, 600); });
    setTimeout(requestState, 700);

    // Public API for the shell router so it can move the player into the
    // rail when the user navigates away from home.
    window.StrictHotelLobbyWP = {
        enterMiniMode,
        exitMiniMode,
        hasVideo: () => !!currentVideoId
    };
})();
