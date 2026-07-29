(function () {
    'use strict';

    // ============== SOCKET & DOM ==============

    const lobby = window.StrictHotelLobby || {};
    const socket = lobby.socket || window.StrictHotelLobbySocket || null;
    if (!socket) return;

    const panel = document.getElementById('soundboard-panel');
    if (!panel) return;
    const grid = document.getElementById('soundboard-grid');
    const muteBtn = document.getElementById('soundboard-mute');
    const muteIcon = muteBtn.querySelector('.soundboard-mute-icon');
    const volumeSlider = document.getElementById('soundboard-volume');
    const toastArea = document.getElementById('soundboard-toasts');

    // ============== SOUND DEFINITIONS ==============

    // Empty on purpose. The nine clips that used to live here were meme audio
    // taken from the internet with no licence behind any of them, which is fine
    // among friends and not fine for a public, commercial site. They were
    // removed rather than left as a liability.
    //
    // To bring the soundboard back: drop licensed or self-recorded files into
    // shared/audio/soundboard/ and add one entry each below. Everything else —
    // the panel, the socket handler, the "Drop the Beat" achievement — is still
    // wired up and starts working again the moment this list is non-empty.
    const SOUNDS = [];

    const AUDIO_BASE = '/shared/audio/soundboard/';

    // ============== STATE ==============

    let isMuted = false;
    let volume = 0.7;
    const audioCache = {};

    const STORAGE_MUTE = 'soundboard-muted';
    const STORAGE_VOL = 'soundboard-volume';

    // ============== HELPERS ==============

    const escapeHtml = window.StrictHotelSocket.escapeHtml;

    const getName = () => {
        if (lobby.getName) return lobby.getName();
        return window.StrictHotelSocket.getPlayerName() || 'Anon';
    };

    // ============== AUDIO ==============

    const preloadSounds = () => {
        SOUNDS.forEach((s) => {
            const audio = new Audio(`${AUDIO_BASE}${s.file}`);
            audio.preload = 'auto';
            audioCache[s.id] = audio;
        });
    };

    const playSound = (soundId) => {
        if (isMuted) return;
        const src = audioCache[soundId];
        if (!src) return;
        const audio = new Audio(src.src);
        audio.volume = volume;
        audio.play().catch(() => { /* autoplay blocked */ });
    };

    // ============== SETTINGS ==============

    const restoreSettings = () => {
        const savedMute = localStorage.getItem(STORAGE_MUTE);
        if (savedMute === 'true') {
            isMuted = true;
            muteBtn.classList.add('muted');
            muteIcon.textContent = '\uD83D\uDD07';
        }
        const savedVol = localStorage.getItem(STORAGE_VOL);
        if (savedVol !== null) {
            volume = parseFloat(savedVol);
            if (isNaN(volume) || volume < 0 || volume > 1) volume = 0.7;
            volumeSlider.value = Math.round(volume * 100);
        }
    };

    const setupControls = () => {
        muteBtn.addEventListener('click', () => {
            isMuted = !isMuted;
            muteBtn.classList.toggle('muted', isMuted);
            muteIcon.textContent = isMuted ? '\uD83D\uDD07' : '\uD83D\uDD0A';
            localStorage.setItem(STORAGE_MUTE, isMuted);
        });

        volumeSlider.addEventListener('input', () => {
            volume = parseInt(volumeSlider.value, 10) / 100;
            localStorage.setItem(STORAGE_VOL, volume);
        });
    };

    // ============== GRID ==============

    const setupGrid = () => {
        SOUNDS.forEach((sound) => {
            const btn = document.createElement('button');
            btn.className = 'soundboard-btn';
            btn.type = 'button';
            btn.dataset.soundId = sound.id;
            btn.innerHTML =
                `<span class="soundboard-btn-icon">${sound.emoji}</span>` +
                `<span class="soundboard-btn-label">${sound.label}</span>`;
            btn.addEventListener('click', () => {
                socket.emit('soundboard-play', sound.id);
            });
            grid.appendChild(btn);
        });
    };

    // ============== VISUAL FEEDBACK ==============

    const highlightButton = (soundId) => {
        const btn = grid.querySelector(`[data-sound-id="${soundId}"]`);
        if (!btn) return;
        btn.classList.remove('playing');
        // Force reflow to restart animation
        void btn.offsetWidth;
        btn.classList.add('playing');
        setTimeout(() => { btn.classList.remove('playing'); }, 500);
    };

    const showToast = (playerName, sound) => {
        const toast = document.createElement('div');
        toast.className = 'soundboard-toast';
        toast.innerHTML =
            `<span class="soundboard-toast-name">${escapeHtml(playerName)}</span> ` +
            `${sound.emoji} ${escapeHtml(sound.label)}`;
        toastArea.appendChild(toast);

        // Max 3 visible toasts
        let toasts = toastArea.querySelectorAll('.soundboard-toast');
        while (toasts.length > 3) {
            toasts[0].remove();
            toasts = toastArea.querySelectorAll('.soundboard-toast');
        }

        // Auto-remove
        setTimeout(() => {
            toast.classList.add('fading');
            setTimeout(() => { toast.remove(); }, 300);
        }, 2200);
    };

    // ============== SOCKET ==============

    const bindSocket = () => {
        socket.on('soundboard-played', (data) => {
            if (!data || typeof data.soundId !== 'string') return;
            let sound = null;
            for (let i = 0; i < SOUNDS.length; i++) {
                if (SOUNDS[i].id === data.soundId) { sound = SOUNDS[i]; break; }
            }
            if (!sound) return;

            playSound(data.soundId);
            highlightButton(data.soundId);
            showToast(data.playerName || 'Anon', sound);
        });

        socket.on('connect', () => {
            socket.emit('soundboard-join');
        });
    };

    // ============== INIT ==============

    // Nothing to play — hide the panel rather than render an empty grid with
    // a volume slider that controls silence.
    if (SOUNDS.length === 0) {
        panel.hidden = true;
        panel.style.display = 'none';
        return;
    }

    restoreSettings();
    setupGrid();
    setupControls();
    preloadSounds();
    bindSocket();

    if (socket.connected) {
        socket.emit('soundboard-join');
    }
})();
