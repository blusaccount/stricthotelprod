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
    // Monotonic deadline (ms since epoch). YT state events firing before this
    // are ignored — they're echoes of our own programmatic seekTo/playVideo.
    // Using a deadline (vs. a bool with setTimeout) means back-to-back syncs
    // never release early and leak the second call's settling events back.
    let suppressUntil = 0;
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
    const queueBtn = $('lobby-wp-queue-btn');
    const nextBtn = $('lobby-wp-next');
    const clearBtn = $('lobby-wp-clear');
    const statusEl = $('lobby-wp-status');
    const nowPlaying = $('lobby-wp-now');
    const queueBox = $('lobby-wp-queue');
    const queueTitle = $('lobby-wp-queue-title');
    const queueList = $('lobby-wp-queue-list');

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
        // Drop any pending state from the previous player — flushing it on
        // the rebuilt player would emit getCurrentTime() of the new video.
        cancelPendingState();
        suppressUntil = 0;
        player = null;
        ytReady = false;
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
    const SUPPRESS_MS = 300;
    let pendingStateAction = null;
    let pendingStateTimer = null;

    function cancelPendingState() {
        if (pendingStateTimer) { clearTimeout(pendingStateTimer); pendingStateTimer = null; }
        pendingStateAction = null;
    }

    function flushPendingState() {
        pendingStateTimer = null;
        const action = pendingStateAction;
        pendingStateAction = null;
        if (!action || !player) return;
        if (Date.now() < suppressUntil) return;
        try {
            const time = player.getCurrentTime ? player.getCurrentTime() : 0;
            socket.emit('lobby-wp-control', { action, time });
            if (action === 'play') startHeartbeat();
        } catch (_) {}
    }

    function onPlayerStateChange(event) {
        if (!player) return;
        if (Date.now() < suppressUntil) return;
        const YTState = window.YT && window.YT.PlayerState;
        if (!YTState) return;
        // ENDED is a deterministic terminal state. Report it so the server
        // can auto-advance to the next queued video, or — if the queue is
        // empty — pin "paused at duration" so heartbeats don't keep advancing
        // expectedTime past the end of the video. Bypass the debounce —
        // there's no buffering bounce to absorb here. The server dedupes
        // concurrent reports from multiple clients via the videoId echo.
        if (event.data === YTState.ENDED) {
            cancelPendingState();
            try {
                const dur = player.getDuration ? player.getDuration() : 0;
                socket.emit('lobby-wp-ended', { videoId: currentVideoId, time: dur });
            } catch (_) {}
            return;
        }
        // UNSTARTED / CUED → pre-playback transitions, irrelevant.
        // BUFFERING → wait it out (debounce will collapse the cascade).
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

    // --- Queue rendering ---
    function myName() {
        try {
            if (window.StrictHotelLobby && typeof window.StrictHotelLobby.getName === 'function') {
                return window.StrictHotelLobby.getName() || '';
            }
        } catch (_) {}
        return '';
    }

    function renderQueue(queue) {
        if (!queueBox || !queueList) return;
        const items = Array.isArray(queue) ? queue : [];
        if (nextBtn) nextBtn.hidden = items.length === 0;
        if (items.length === 0) {
            queueBox.hidden = true;
            queueList.innerHTML = '';
            return;
        }
        queueBox.hidden = false;
        if (queueTitle) queueTitle.textContent = `UP NEXT (${items.length})`;
        const me = myName();
        queueList.innerHTML = items.map((e) => {
            const vid = escapeHtml(e.videoId);
            const removable = me && e.addedBy === me;
            return `<li class="lobby-wp-queue-item">
                <img class="lobby-wp-queue-thumb" src="https://i.ytimg.com/vi/${vid}/default.jpg" alt="" loading="lazy">
                <span class="lobby-wp-queue-meta">added by <strong>${escapeHtml(e.addedBy)}</strong></span>
                ${removable ? `<button type="button" class="lobby-wp-queue-remove" data-queue-id="${Number(e.queueId)}" title="Remove from queue">✕</button>` : ''}
            </li>`;
        }).join('');
    }

    function applyServerState(s) {
        lastServerState = s;
        renderQueue(s && s.queue);
        // No video → tear down.
        if (!s || !s.videoId) {
            if (placeholder) placeholder.style.display = '';
            if (playerWrap) playerWrap.innerHTML = '';
            player = null;
            currentVideoId = null;
            ytReady = false;
            cancelPendingState();
            suppressUntil = 0;
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
        const localTime = player.getCurrentTime ? player.getCurrentTime() : 0;
        const drift = Math.abs(localTime - target);
        // Push the suppression deadline forward so the seekTo / playVideo /
        // pauseVideo we issue below don't echo back to the server. Math.max
        // keeps it monotonic across rapid back-to-back syncs.
        suppressUntil = Math.max(suppressUntil, Date.now() + SUPPRESS_MS);
        try {
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
        } catch (_) {
            // YT API can throw mid-rebuild — safe to swallow.
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
    // Grab the pasted URL as a video ID, or show an error and return ''.
    function consumeInput() {
        const id = extractVideoId(urlInput ? urlInput.value : '');
        if (!id) {
            setStatus('Could not parse a YouTube ID from that link.', 'error');
            return '';
        }
        urlInput.value = '';
        return id;
    }

    if (loadBtn && urlInput) {
        const submit = () => {
            const id = consumeInput();
            if (!id) return;
            socket.emit('lobby-wp-load', { videoId: id });
            setStatus('Loading video…', 'loading');
        };
        loadBtn.addEventListener('click', submit);
        urlInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') { e.preventDefault(); submit(); }
        });
    }
    if (queueBtn && urlInput) {
        queueBtn.addEventListener('click', () => {
            const id = consumeInput();
            if (!id) return;
            socket.emit('lobby-wp-queue-add', { videoId: id });
            setStatus('Added to queue.', 'idle');
        });
    }
    if (nextBtn) {
        nextBtn.addEventListener('click', () => {
            socket.emit('lobby-wp-next');
        });
    }
    if (queueList) {
        queueList.addEventListener('click', (e) => {
            const btn = e.target.closest('.lobby-wp-queue-remove');
            if (!btn) return;
            const queueId = Number(btn.dataset.queueId);
            if (Number.isFinite(queueId)) {
                socket.emit('lobby-wp-queue-remove', { queueId });
            }
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
